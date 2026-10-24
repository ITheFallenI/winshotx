//! Que los atajos funcionen tambien con una ventana de administrador delante.
//!
//! **El problema.** Con el Administrador de tareas (o cualquier ventana elevada) en primer
//! plano, Windows no le entrega las teclas a los atajos que ha registrado un proceso
//! normal: es el aislamiento entre niveles de integridad (UIPI). F2 o Impr Pant no hacian
//! nada, sin error y sin aviso. La Herramienta de Recortes no lo sufre porque es del
//! sistema.
//!
//! **La salida.** Un ayudante diminuto que corre elevado y solo hace una cosa: registrar
//! los atajos y, cuando salta uno, avisar a winshotx. Es este mismo ejecutable arrancado
//! con `--atajos-admin`, sin Tauri y sin WebView2. Se arranca con una tarea programada con
//! privilegios altos, que se crea una vez (con su aviso de UAC) y despues se lanza sin
//! preguntar.
//!
//! **Por que se copia a Program Files.** winshotx se instala en AppData, donde cualquier
//! programa del usuario puede escribir. Una tarea que ejecutara con privilegios ese
//! archivo le regalaria el administrador, sin aviso, a quien lo sustituyera. La copia vive
//! donde solo escribe un administrador.
//!
//! **Como hablan.** Del ayudante a winshotx (de mas a menos privilegio) Windows deja pasar
//! mensajes sin mas. Al reves solo pasa lo que el ayudante permite expresamente: un
//! `WM_COPYDATA` con la lista de atajos, que contesta con cuales ha conseguido.

use tauri::{AppHandle, Manager};

use crate::error::{AppError, Result};
use crate::hotkeys::ShortcutStatus;
use crate::settings::Settings;

/// Lo que se le pasa al ejecutable para que haga de ayudante.
pub const ARG_AYUDANTE: &str = "--atajos-admin";
/// Ya elevado: copiar el ayudante a Program Files y crear la tarea.
pub const ARG_INSTALAR: &str = "--instalar-atajos-admin";
/// Ya elevado: borrar la tarea y la copia.
pub const ARG_QUITAR: &str = "--quitar-atajos-admin";

const TAREA: &str = "winshotx-atajos-admin";
const CARPETA: &str = "winshotx";
const COPIA: &str = "winshotx-atajos-admin.exe";

/// Los atajos que puede llevar el ayudante. El numero es el id de `RegisterHotKey` y el
/// bit de la respuesta.
pub mod accion {
    pub const CAPTURA: u32 = 1;
    pub const EDITOR: u32 = 2;
    pub const IMPR_PANT: u32 = 3;
    pub const GRABAR: u32 = 4;
    pub const REPETIR: u32 = 5;
    pub const WIN_SHIFT_S: u32 = 6;
}

/// Si el ayudante tiene sentido aqui. Dentro de la Store la carpeta de la app es de solo
/// lectura y no se puede lanzar el ejecutable por fuera del paquete.
pub fn disponible() -> bool {
    cfg!(windows) && !crate::platform::empaquetado::es_msix()
}

/// La tecla de un atajo traducida a lo que entiende `RegisterHotKey`: modificadores y
/// codigo virtual. `None` si la tecla no tiene equivalente.
pub fn a_tecla_virtual(texto: &str) -> Option<(u32, u32)> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

    let atajo: Shortcut = texto.trim().parse().ok()?;
    let mut mods = 0x4000; // MOD_NOREPEAT: dejar la tecla pulsada no dispara veinte capturas
    if atajo.mods.contains(Modifiers::ALT) {
        mods |= 0x1;
    }
    if atajo.mods.contains(Modifiers::CONTROL) {
        mods |= 0x2;
    }
    if atajo.mods.contains(Modifiers::SHIFT) {
        mods |= 0x4;
    }
    if atajo.mods.intersects(Modifiers::SUPER | Modifiers::META) {
        mods |= 0x8;
    }

    let nombre = atajo.key.to_string();
    let vk = if let Some(letra) = nombre.strip_prefix("Key") {
        letra.bytes().next().filter(|_| letra.len() == 1).map(u32::from)?
    } else if let Some(cifra) = nombre.strip_prefix("Digit") {
        cifra.bytes().next().filter(|_| cifra.len() == 1).map(u32::from)?
    } else if let Some(n) = nombre.strip_prefix("Numpad").and_then(|n| n.parse::<u32>().ok()) {
        0x60 + n
    } else if let Some(n) = nombre.strip_prefix('F').and_then(|n| n.parse::<u32>().ok()) {
        if !(1..=24).contains(&n) {
            return None;
        }
        0x70 + n - 1
    } else {
        match atajo.key {
            Code::PrintScreen => 0x2C,
            Code::Space => 0x20,
            Code::Enter => 0x0D,
            Code::Tab => 0x09,
            Code::Escape => 0x1B,
            Code::Backspace => 0x08,
            Code::Delete => 0x2E,
            Code::Insert => 0x2D,
            Code::Home => 0x24,
            Code::End => 0x23,
            Code::PageUp => 0x21,
            Code::PageDown => 0x22,
            Code::ArrowLeft => 0x25,
            Code::ArrowUp => 0x26,
            Code::ArrowRight => 0x27,
            Code::ArrowDown => 0x28,
            Code::Pause => 0x13,
            Code::ScrollLock => 0x91,
            Code::Minus => 0xBD,
            Code::Equal => 0xBB,
            Code::BracketLeft => 0xDB,
            Code::BracketRight => 0xDD,
            Code::Backslash => 0xDC,
            Code::Semicolon => 0xBA,
            Code::Quote => 0xDE,
            Code::Comma => 0xBC,
            Code::Period => 0xBE,
            Code::Slash => 0xBF,
            Code::Backquote => 0xC0,
            Code::NumpadAdd => 0x6B,
            Code::NumpadSubtract => 0x6D,
            Code::NumpadMultiply => 0x6A,
            Code::NumpadDivide => 0x6F,
            Code::NumpadDecimal => 0x6E,
            _ => return None,
        }
    };
    Some((mods, vk))
}

/// Los atajos que tocan con estos ajustes, con su accion. Repite las reglas de
/// `hotkeys::register`: el del editor no va si es la misma tecla que la captura, la de
/// los ultimos segundos solo con el anillo encendido, y las teclas de Windows solo si se
/// pidieron.
pub fn lista(settings: &Settings) -> Vec<(u32, String)> {
    let mut lista: Vec<(u32, String)> = Vec::new();
    let mut poner = |id: u32, texto: &str| {
        let texto = texto.trim();
        if texto.is_empty() {
            return;
        }
        let tecla = a_tecla_virtual(texto);
        if tecla.is_some() && lista.iter().any(|(_, otro)| a_tecla_virtual(otro) == tecla) {
            return;
        }
        lista.push((id, texto.to_string()));
    };
    poner(accion::CAPTURA, &settings.capture_shortcut);
    poner(accion::EDITOR, &settings.edit_shortcut);
    if settings.print_screen_capture {
        poner(accion::IMPR_PANT, crate::hotkeys::PRINT_SCREEN);
    }
    poner(accion::GRABAR, &settings.record_shortcut);
    if settings.replay_enabled {
        poner(accion::REPETIR, &settings.replay_shortcut);
    }
    if settings.take_win_shift_s {
        poner(accion::WIN_SHIFT_S, crate::hotkeys::WIN_SHIFT_S);
    }
    lista
}

/// Lo que dijo el ayudante, traducido al estado que ensennan los ajustes.
fn estado_de(mascara: u32, settings: &Settings) -> ShortcutStatus {
    let bit = |id: u32| mascara & (1 << id) != 0;
    let win_shift_s_propia = a_tecla_virtual(crate::hotkeys::WIN_SHIFT_S)
        .is_some_and(|w| a_tecla_virtual(&settings.capture_shortcut) == Some(w));
    ShortcutStatus {
        capture: bit(accion::CAPTURA),
        edit: bit(accion::EDITOR),
        record: bit(accion::GRABAR),
        replay: bit(accion::REPETIR),
        print_screen: bit(accion::IMPR_PANT),
        win_shift_s: bit(accion::WIN_SHIFT_S) || (settings.take_win_shift_s && win_shift_s_propia),
    }
}

/// Le pasa los atajos al ayudante. `None` si no esta corriendo: entonces los registra
/// winshotx como siempre, y mientras tanto se lanza el ayudante para que los coja en
/// cuanto este (`hotkeys::register` se vuelve a llamar cuando aparece).
#[cfg(windows)]
pub fn registrar(app: &AppHandle, settings: &Settings) -> Option<ShortcutStatus> {
    use std::sync::atomic::{AtomicBool, Ordering};
    static LANZANDO: AtomicBool = AtomicBool::new(false);

    let Some(ventana) = win::ayudante() else {
        if !LANZANDO.swap(true, Ordering::SeqCst) {
            let app = app.clone();
            std::thread::spawn(move || {
                let aparecio = win::lanzar_tarea() && esperar_ayudante();
                LANZANDO.store(false, Ordering::SeqCst);
                if aparecio {
                    let settings = app.state::<crate::state::AppState>().settings.read().clone();
                    crate::hotkeys::register(&app, &settings);
                } else {
                    eprintln!("[atajo] el ayudante de administrador no ha arrancado");
                }
            });
        }
        return None;
    };

    let teclas: Vec<(u32, u32, u32)> = lista(settings)
        .iter()
        .filter_map(|(id, texto)| a_tecla_virtual(texto).map(|(m, vk)| (*id, m, vk)))
        .collect();
    let mascara = win::mandar_atajos(ventana, &teclas)?;
    let estado = estado_de(mascara, settings);
    eprintln!("[atajo] en manos del ayudante de administrador: {estado:?}");
    Some(estado)
}

#[cfg(not(windows))]
pub fn registrar(_app: &AppHandle, _settings: &Settings) -> Option<ShortcutStatus> {
    None
}

#[cfg(windows)]
fn esperar_ayudante() -> bool {
    for _ in 0..40 {
        if win::ayudante().is_some() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
    false
}

/// Que el ayudante suelte los atajos y se vaya, si esta. No falla si no esta.
pub fn despedir() {
    #[cfg(windows)]
    win::despedir();
}

/// El buzon donde el ayudante deja los atajos que saltan. Se abre al arrancar, este o no
/// encendida la opcion: cuesta una ventana invisible y un hilo dormido.
pub fn arrancar_buzon(app: &AppHandle) {
    #[cfg(windows)]
    win::arrancar_buzon(app.clone());
    #[cfg(not(windows))]
    let _ = app;
}

/// Crea la tarea y copia el ayudante. Pide UAC una vez.
pub fn instalar() -> Result<()> {
    #[cfg(windows)]
    {
        let usuario = format!(
            "{}\\{}",
            std::env::var("USERDOMAIN").unwrap_or_default(),
            std::env::var("USERNAME").unwrap_or_default()
        );
        win::elevado(&[ARG_INSTALAR, &usuario])
    }
    #[cfg(not(windows))]
    Err(AppError::Unsupported)
}

/// Borra la tarea y la copia. Pide UAC una vez.
pub fn desinstalar() -> Result<()> {
    #[cfg(windows)]
    {
        win::despedir();
        if !win::tarea_existe() {
            return Ok(());
        }
        // Que el ayudante suelte su ejecutable antes de borrarlo.
        std::thread::sleep(std::time::Duration::from_millis(400));
        win::elevado(&[ARG_QUITAR])
    }
    #[cfg(not(windows))]
    Err(AppError::Unsupported)
}

/// Si el proceso se arranco para alguno de los papeles de este modulo, lo hace y devuelve
/// `true`: entonces no hay que levantar la aplicacion.
pub fn atender_argumentos() -> bool {
    let args: Vec<String> = std::env::args().collect();
    let Some(papel) = args.get(1) else { return false };
    #[cfg(windows)]
    match papel.as_str() {
        ARG_AYUDANTE => {
            win::ayudante_main();
            return true;
        }
        ARG_INSTALAR => {
            let usuario = args.get(2).cloned().unwrap_or_default();
            let codigo = match win::instalar_elevado(&usuario) {
                Ok(()) => 0,
                Err(error) => {
                    eprintln!("no se ha podido instalar el ayudante: {error}");
                    1
                }
            };
            std::process::exit(codigo);
        }
        ARG_QUITAR => {
            let codigo = match win::quitar_elevado() {
                Ok(()) => 0,
                Err(error) => {
                    eprintln!("no se ha podido quitar el ayudante: {error}");
                    1
                }
            };
            std::process::exit(codigo);
        }
        _ => {}
    }
    let _ = papel;
    false
}

#[cfg(windows)]
mod win {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::OnceLock;

    use tauri::AppHandle;
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::DataExchange::COPYDATASTRUCT;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS,
    };
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, ChangeWindowMessageFilterEx, CreateWindowExW, DefWindowProcW,
        DispatchMessageW, FindWindowExW, GetMessageW, PostMessageW, PostQuitMessage,
        RegisterClassW, SendMessageTimeoutW, SetTimer, TranslateMessage, ASFW_ANY,
        HWND_MESSAGE, MSG, MSGFLT_ALLOW, SMTO_ABORTIFHUNG, SW_HIDE, WINDOW_EX_STYLE,
        WINDOW_STYLE, WM_APP, WM_COPYDATA, WM_HOTKEY, WM_TIMER, WNDCLASSW,
    };

    use super::{AppError, Result, CARPETA, COPIA, TAREA};

    const CLASE_AYUDANTE: PCWSTR = w!("winshotx-atajos-admin");
    const CLASE_BUZON: PCWSTR = w!("winshotx-atajos-buzon");
    /// Ayudante a buzon: salto el atajo `wparam`.
    const WM_ATAJO: u32 = WM_APP + 41;
    /// Buzon a ayudante, por `WM_COPYDATA`: esta es la lista de atajos.
    const DATOS_ATAJOS: usize = 0x5753_0001;
    /// Buzon a ayudante: suelta todo y vete.
    const DATOS_SALIR: usize = 0x5753_0002;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    // ---------------------------------------------------------------- lado de winshotx

    static APP: OnceLock<AppHandle> = OnceLock::new();

    fn buscar(clase: PCWSTR) -> Option<HWND> {
        unsafe { FindWindowExW(Some(HWND_MESSAGE), None, clase, PCWSTR::null()) }.ok()
    }

    pub fn ayudante() -> Option<HWND> {
        buscar(CLASE_AYUDANTE)
    }

    pub fn arrancar_buzon(app: AppHandle) {
        if APP.set(app).is_err() {
            return;
        }
        std::thread::spawn(|| unsafe {
            let Ok(modulo) = GetModuleHandleW(None) else { return };
            let clase = WNDCLASSW {
                lpfnWndProc: Some(proc_buzon),
                hInstance: modulo.into(),
                lpszClassName: CLASE_BUZON,
                ..Default::default()
            };
            RegisterClassW(&clase);
            let Ok(_ventana) = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                CLASE_BUZON,
                PCWSTR::null(),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(modulo.into()),
                None,
            ) else {
                eprintln!("[atajo] no se ha podido abrir el buzon del ayudante");
                return;
            };
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }

    unsafe extern "system" fn proc_buzon(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if msg == WM_ATAJO {
            if let Some(app) = APP.get() {
                let id = wparam.0 as u32;
                let dentro = app.clone();
                let _ = app.run_on_main_thread(move || crate::hotkeys::disparar(&dentro, id));
            }
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    /// Manda la lista y devuelve la mascara de los que el ayudante ha conseguido.
    pub fn mandar_atajos(ventana: HWND, teclas: &[(u32, u32, u32)]) -> Option<u32> {
        let texto: String = teclas
            .iter()
            .map(|(id, mods, vk)| format!("{id},{mods},{vk}\n"))
            .collect();
        let respuesta = mandar(ventana, DATOS_ATAJOS, texto.as_bytes())?;
        // El bit 0 dice "te he oido": sin el, la llamada no llego.
        (respuesta & 1 != 0).then_some(respuesta as u32 & !1)
    }

    pub fn despedir() {
        if let Some(ventana) = ayudante() {
            let _ = mandar(ventana, DATOS_SALIR, &[]);
        }
    }

    fn mandar(ventana: HWND, tipo: usize, datos: &[u8]) -> Option<usize> {
        let paquete = COPYDATASTRUCT {
            dwData: tipo,
            cbData: datos.len() as u32,
            lpData: datos.as_ptr() as *mut _,
        };
        let mut respuesta = 0usize;
        let ok = unsafe {
            SendMessageTimeoutW(
                ventana,
                WM_COPYDATA,
                WPARAM(0),
                LPARAM(&paquete as *const _ as isize),
                SMTO_ABORTIFHUNG,
                2000,
                Some(&mut respuesta),
            )
        };
        (ok.0 != 0).then_some(respuesta)
    }

    /// Arranca el ayudante por la tarea. Lanzar una tarea que ya existe no pide UAC.
    pub fn lanzar_tarea() -> bool {
        Command::new("schtasks")
            .args(["/run", "/tn", TAREA])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .is_ok_and(|salida| salida.status.success())
    }

    pub fn tarea_existe() -> bool {
        Command::new("schtasks")
            .args(["/query", "/tn", TAREA])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .is_ok_and(|salida| salida.status.success())
    }

    /// Este mismo ejecutable con privilegios, con su aviso de UAC, y espera a que acabe.
    pub fn elevado(args: &[&str]) -> Result<()> {
        let exe = std::env::current_exe()?;
        let exe: Vec<u16> = exe.as_os_str().encode_wide_nul();
        let parametros: String = args
            .iter()
            .map(|a| format!("\"{}\"", a.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" ");
        let parametros: Vec<u16> = parametros.encode_utf16().chain(Some(0)).collect();
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            lpVerb: w!("runas"),
            lpFile: PCWSTR(exe.as_ptr()),
            lpParameters: PCWSTR(parametros.as_ptr()),
            nShow: SW_HIDE.0,
            ..Default::default()
        };
        unsafe { ShellExecuteExW(&mut info) }.map_err(|e| {
            // 0x800704C7: el usuario ha dicho que no en el aviso de UAC.
            if e.code().0 as u32 == 0x8007_04C7 {
                AppError::Msg("se ha cancelado el permiso de administrador".into())
            } else {
                AppError::Windows(e)
            }
        })?;
        let mut codigo = 1u32;
        unsafe {
            WaitForSingleObject(info.hProcess, 60_000);
            let _ = GetExitCodeProcess(info.hProcess, &mut codigo);
            let _ = CloseHandle(info.hProcess);
        }
        if codigo == 0 {
            Ok(())
        } else {
            Err(AppError::Msg(
                "no se ha podido preparar el ayudante de administrador".into(),
            ))
        }
    }

    trait AnchoNul {
        fn encode_wide_nul(&self) -> Vec<u16>;
    }
    impl AnchoNul for std::ffi::OsStr {
        fn encode_wide_nul(&self) -> Vec<u16> {
            use std::os::windows::ffi::OsStrExt;
            self.encode_wide().chain(Some(0)).collect()
        }
    }

    // ---------------------------------------------------- el instalador, ya elevado

    fn carpeta_protegida() -> std::path::PathBuf {
        let base = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
        std::path::Path::new(&base).join(CARPETA)
    }

    fn xml_escapar(texto: &str) -> String {
        texto
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    }

    pub fn instalar_elevado(usuario: &str) -> Result<()> {
        // Si habia un ayudante viejo corriendo, tiene su ejecutable abierto.
        despedir();
        std::thread::sleep(std::time::Duration::from_millis(300));

        let carpeta = carpeta_protegida();
        std::fs::create_dir_all(&carpeta)?;
        let destino = carpeta.join(COPIA);
        std::fs::copy(std::env::current_exe()?, &destino)?;

        let principal = if usuario.trim_matches('\\').is_empty() {
            String::new()
        } else {
            format!("<UserId>{}</UserId>", xml_escapar(usuario))
        };
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>winshotx: atajos de captura tambien con una ventana de administrador delante.</Description>
  </RegistrationInfo>
  <Principals>
    <Principal id="Author">
      {principal}
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"{exe}"</Command>
      <Arguments>{arg}</Arguments>
    </Exec>
  </Actions>
</Task>
"#,
            exe = xml_escapar(&destino.to_string_lossy()),
            arg = super::ARG_AYUDANTE,
        );
        // schtasks lee el XML en UTF-16 con su marca de orden sin quejarse de nada.
        let mut bytes = vec![0xFF, 0xFE];
        for unidad in xml.encode_utf16() {
            bytes.extend_from_slice(&unidad.to_le_bytes());
        }
        let archivo = std::env::temp_dir().join("winshotx-atajos-admin.xml");
        std::fs::write(&archivo, bytes)?;
        let salida = Command::new("schtasks")
            .args(["/create", "/tn", TAREA, "/f", "/xml"])
            .arg(&archivo)
            .creation_flags(CREATE_NO_WINDOW)
            .output()?;
        let _ = std::fs::remove_file(&archivo);
        if !salida.status.success() {
            return Err(AppError::Msg(format!(
                "schtasks: {}",
                String::from_utf8_lossy(&salida.stderr).trim()
            )));
        }
        Ok(())
    }

    pub fn quitar_elevado() -> Result<()> {
        despedir();
        let _ = Command::new("schtasks")
            .args(["/delete", "/tn", TAREA, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let carpeta = carpeta_protegida();
        for _ in 0..10 {
            match std::fs::remove_file(carpeta.join(COPIA)) {
                Ok(()) => break,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => break,
                Err(_) => std::thread::sleep(std::time::Duration::from_millis(300)),
            }
        }
        let _ = std::fs::remove_dir(&carpeta);
        Ok(())
    }

    // ------------------------------------------------------------- el ayudante elevado

    /// Ids que tiene registrados el ayudante, para soltarlos al recibir otra lista.
    static REGISTRADOS: parking_lot::Mutex<Vec<i32>> = parking_lot::Mutex::new(Vec::new());
    /// Revisiones seguidas sin encontrar el buzon de winshotx.
    static SIN_BUZON: AtomicU32 = AtomicU32::new(0);

    pub fn ayudante_main() {
        // Uno basta: un segundo no conseguiria ni un atajo.
        if ayudante().is_some() {
            return;
        }
        unsafe {
            let Ok(modulo) = GetModuleHandleW(None) else { return };
            let clase = WNDCLASSW {
                lpfnWndProc: Some(proc_ayudante),
                hInstance: modulo.into(),
                lpszClassName: CLASE_AYUDANTE,
                ..Default::default()
            };
            RegisterClassW(&clase);
            let Ok(ventana) = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                CLASE_AYUDANTE,
                PCWSTR::null(),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(modulo.into()),
                None,
            ) else {
                return;
            };
            // Lo unico que se deja entrar desde winshotx, que tiene menos privilegio.
            let _ = ChangeWindowMessageFilterEx(ventana, WM_COPYDATA, MSGFLT_ALLOW, None);
            // Cada dos segundos se mira si winshotx sigue ahi; si se ha ido, uno se va
            // tambien y suelta las teclas.
            SetTimer(Some(ventana), 1, 2000, None);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            soltar_todo(ventana);
        }
    }

    unsafe fn soltar_todo(ventana: HWND) {
        for id in std::mem::take(&mut *REGISTRADOS.lock()) {
            let _ = UnregisterHotKey(Some(ventana), id);
        }
    }

    unsafe extern "system" fn proc_ayudante(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_COPYDATA => {
                let paquete = &*(lparam.0 as *const COPYDATASTRUCT);
                if paquete.dwData == DATOS_SALIR {
                    soltar_todo(hwnd);
                    PostQuitMessage(0);
                    return LRESULT(1);
                }
                if paquete.dwData != DATOS_ATAJOS {
                    return LRESULT(0);
                }
                let datos = if paquete.cbData == 0 || paquete.lpData.is_null() {
                    &[][..]
                } else {
                    std::slice::from_raw_parts(paquete.lpData as *const u8, paquete.cbData as usize)
                };
                soltar_todo(hwnd);
                let mut mascara: usize = 1;
                let mut puestos = Vec::new();
                for linea in String::from_utf8_lossy(datos).lines() {
                    let partes: Vec<u32> =
                        linea.split(',').filter_map(|p| p.trim().parse().ok()).collect();
                    let [id, mods, vk] = partes[..] else { continue };
                    if !(1..31).contains(&id) {
                        continue;
                    }
                    if RegisterHotKey(Some(hwnd), id as i32, HOT_KEY_MODIFIERS(mods), vk).is_ok() {
                        mascara |= 1 << id;
                        puestos.push(id as i32);
                    }
                }
                *REGISTRADOS.lock() = puestos;
                SIN_BUZON.store(0, Ordering::SeqCst);
                LRESULT(mascara as isize)
            }
            WM_HOTKEY => {
                // Quien recibe el atajo puede pasar el primer plano; se lo pasa a winshotx
                // para que el overlay pueda ponerse delante y coger el teclado.
                let _ = AllowSetForegroundWindow(ASFW_ANY);
                if let Some(buzon) = buscar(CLASE_BUZON) {
                    let _ = PostMessageW(Some(buzon), WM_ATAJO, wparam, LPARAM(0));
                }
                LRESULT(0)
            }
            WM_TIMER => {
                if buscar(CLASE_BUZON).is_some() {
                    SIN_BUZON.store(0, Ordering::SeqCst);
                } else if SIN_BUZON.fetch_add(1, Ordering::SeqCst) >= 2 {
                    soltar_todo(hwnd);
                    PostQuitMessage(0);
                }
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn las_teclas_de_siempre_se_traducen() {
        assert_eq!(a_tecla_virtual("F2"), Some((0x4000, 0x71)));
        assert_eq!(a_tecla_virtual("PrintScreen"), Some((0x4000, 0x2C)));
        assert_eq!(a_tecla_virtual("CmdOrCtrl+Shift+Digit2"), Some((0x4000 | 0x2 | 0x4, b'2' as u32)));
        assert_eq!(a_tecla_virtual("Super+Shift+KeyL"), Some((0x4000 | 0x8 | 0x4, b'L' as u32)));
        assert_eq!(a_tecla_virtual("Alt+KeyX"), Some((0x4000 | 0x1, b'X' as u32)));
        assert_eq!(a_tecla_virtual("F12"), Some((0x4000, 0x7B)));
        assert_eq!(a_tecla_virtual(""), None);
    }

    #[test]
    fn la_lista_no_repite_teclas_y_respeta_los_interruptores() {
        let mut ajustes = Settings::default();
        ajustes.capture_shortcut = "F2".into();
        ajustes.edit_shortcut = "f2".into();
        ajustes.print_screen_capture = true;
        ajustes.replay_enabled = false;
        let ids: Vec<u32> = lista(&ajustes).iter().map(|(id, _)| *id).collect();
        assert!(ids.contains(&accion::CAPTURA));
        assert!(!ids.contains(&accion::EDITOR), "la misma tecla dos veces no");
        assert!(ids.contains(&accion::IMPR_PANT));
        assert!(!ids.contains(&accion::REPETIR), "sin anillo no hay tecla de repetir");
    }
}

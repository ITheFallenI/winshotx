//! Dónde cae cada archivo que se lleva el usuario, y cómo se llama.
//!
//! **Un solo sitio.** Hasta ahora lo decidían tres por su cuenta: guardar una captura desde
//! la barra, exportar desde el editor y guardar una captura anclada. Tres sitios que hacen
//! lo mismo son tres sitios que se separan, y ya empezaban a hacerlo.
//!
//! Y los tres tenían el mismo fallo: el nombre lleva la hora **al segundo**, y escribir un
//! PNG sobre uno que ya existe no falla ni avisa. **Dos capturas guardadas dentro del mismo
//! segundo dejaban una sola**, y la que se perdía era la primera. Con el atajo de teclado
//! eso no es un caso raro: es lo que pasa al capturar dos veces seguidas.

use std::path::{Path, PathBuf};

/// La hora, al segundo, como se escribe en el nombre de un archivo.
pub fn marca_de_tiempo() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

/// Un nombre que **no existe todavía** en esa carpeta.
///
/// Si `winshotx-20260827-154810.png` está ocupado prueba con `-2`, luego `-3`, y así. El
/// sufijo va antes de la extensión, no detrás, para que el archivo siga abriéndose con el
/// programa que le toca.
///
/// El tope de mil intentos no es por miedo a un bucle infinito: es para que, si algo va muy
/// mal (una carpeta que dice que todo existe, un disco que no responde), esto devuelva algo
/// en vez de quedarse dando vueltas mientras el usuario mira una captura que no se guarda.
pub fn nombre_libre(dir: &Path, base: &str, extension: &str) -> PathBuf {
    let candidato = dir.join(format!("{base}.{extension}"));
    if !candidato.exists() {
        return candidato;
    }
    for n in 2..1000 {
        let otro = dir.join(format!("{base}-{n}.{extension}"));
        if !otro.exists() {
            return otro;
        }
    }
    // Mil ya ocupados en el mismo segundo no puede pasar de verdad, pero devolver el
    // primero seria pisar un archivo, que es justo lo que este modulo existe para evitar.
    dir.join(format!(
        "{base}-{}.{extension}",
        chrono::Local::now().format("%S%3f")
    ))
}

pub const MEDIA_FOLDERS: [&str; 3] = ["Images", "Videos", "GIFs"];

pub fn dated_folder(name: &str) -> bool {
    name.len() == 10 && chrono::NaiveDate::parse_from_str(name, "%Y-%m-%d").is_ok()
}

pub fn media_folder(name: &str) -> bool {
    MEDIA_FOLDERS.iter().any(|folder| folder.eq_ignore_ascii_case(name))
}

/// Enumerate only our root, dated folders, and their media folders; never arbitrary trees.
/// The inherited day is kept even when a capture is renamed or its mtime changes.
pub fn capture_folders(root: &Path) -> std::io::Result<Vec<(PathBuf, Option<String>)>> {
    let mut folders = vec![(root.to_path_buf(), None)];
    for entry in std::fs::read_dir(root)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !entry.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink()) || !dated_folder(&name) { continue; }
        folders.push((entry.path(), Some(name.clone())));
        let Ok(children) = std::fs::read_dir(entry.path()) else { continue; };
        for child in children.flatten() {
            if child.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink()) &&
                child.file_name().to_str().is_some_and(media_folder) {
                folders.push((child.path(), Some(name.clone())));
            }
        }
    }
    Ok(folders)
}

/// La ruta donde escribir lo siguiente, dentro del dia local y el tipo de archivo.
pub fn destino(dir: &Path, extension: &str) -> std::io::Result<PathBuf> {
    destino_en(dir, extension, chrono::Local::now().naive_local())
}

fn destino_en(dir: &Path, extension: &str, ahora: chrono::NaiveDateTime) -> std::io::Result<PathBuf> {
    // Una sola lectura del reloj: al cruzar medianoche, carpeta y nombre siguen de acuerdo.
    let kind = match extension.to_ascii_lowercase().as_str() {
        "gif" => "GIFs", "mp4" => "Videos", _ => "Images",
    };
    let diaria = dir.join(ahora.format("%Y-%m-%d").to_string());
    std::fs::create_dir_all(diaria.join(kind))?;
    Ok(nombre_libre(
        &diaria.join(kind),
        &format!("winshotx-{}", ahora.format("%Y%m%d-%H%M%S")),
        extension,
    ))
}

/// Capturas de la raiz antigua y de las carpetas diarias, por fecha de modificacion.
/// No recorre otras carpetas ni sigue enlaces: el historial solo mira donde guardamos.
pub fn capturas_recientes(dir: &Path, cuantas: usize) -> Vec<(std::time::SystemTime, PathBuf)> {
    fn recoger(dir: &Path, fotos: &mut Vec<(std::time::SystemTime, PathBuf)>) {
        let Ok(entradas) = std::fs::read_dir(dir) else {
            return;
        };
        for entrada in entradas.flatten() {
            let Ok(tipo) = entrada.file_type() else {
                continue;
            };
            let ruta = entrada.path();
            if tipo.is_file() {
                let extension = ruta.extension().unwrap_or_default()
                    .to_string_lossy().to_lowercase();
                if matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp") {
                    if let Ok(cuando) = entrada.metadata().and_then(|m| m.modified()) {
                        fotos.push((cuando, ruta));
                    }
                }
            }
        }
    }
    let mut fotos = Vec::new();
    for (folder, _) in capture_folders(dir).unwrap_or_default() { recoger(&folder, &mut fotos); }
    fotos.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    fotos.truncate(cuantas.clamp(1, 20));
    fotos
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Una carpeta vacia y suya, para que dos pruebas a la vez no se estorben.
    fn carpeta(nombre: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("winshotx-test-archivos-{nombre}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn tocar(ruta: &Path) {
        std::fs::write(ruta, b"x").unwrap();
    }

    fn fecha(texto: &str) -> chrono::NaiveDateTime {
        chrono::NaiveDateTime::parse_from_str(texto, "%Y-%m-%d %H:%M:%S").unwrap()
    }

    #[test]
    fn al_cruzar_medianoche_cambia_la_carpeta_y_el_nombre() {
        let dir = carpeta("medianoche");
        let antes = destino_en(&dir, "png", fecha("2026-10-22 23:59:59")).unwrap();
        let despues = destino_en(&dir, "png", fecha("2026-10-23 00:00:00")).unwrap();
        assert_eq!(antes, dir.join("2026-10-22/Images/winshotx-20261022-235959.png"));
        assert_eq!(despues, dir.join("2026-10-23/Images/winshotx-20261023-000000.png"));
        assert!(antes.parent().unwrap().is_dir());
        assert!(despues.parent().unwrap().is_dir());
    }

    #[test]
    fn las_capturas_del_mismo_segundo_se_conservan_en_el_dia() {
        let dir = carpeta("diaria-colisiones");
        let ahora = fecha("2026-10-22 14:00:00");
        let una = destino_en(&dir, "png", ahora).unwrap();
        tocar(&una);
        let otra = destino_en(&dir, "png", ahora).unwrap();
        assert_eq!(otra, dir.join("2026-10-22/Images/winshotx-20261022-140000-2.png"));
        assert_eq!(std::fs::read(&una).unwrap(), b"x");
    }

    #[test]
    fn each_days_media_uses_its_own_folder_and_keeps_colliding_captures() {
        let dir = carpeta("media-folders");
        let now = fecha("2026-10-22 14:00:00");
        for (ext, folder) in [("png", "Images"), ("JPG", "Images"), ("jpeg", "Images"), ("bmp", "Images"), ("gif", "GIFs"), ("MP4", "Videos")] {
            let first = destino_en(&dir, ext, now).unwrap();
            assert_eq!(first.parent().unwrap(), dir.join("2026-10-22").join(folder));
            tocar(&first);
            let second = destino_en(&dir, ext, now).unwrap();
            assert_ne!(first, second);
            assert_eq!(second.parent(), first.parent());
            assert_eq!(std::fs::read(first).unwrap(), b"x");
        }
    }

    #[test]
    fn a_blocked_media_folder_is_reported_without_falling_back_to_the_date_or_root() {
        let dir = carpeta("media-blocked");
        std::fs::create_dir_all(dir.join("2026-10-22")).unwrap();
        tocar(&dir.join("2026-10-22/Images"));
        assert!(destino_en(&dir, "png", fecha("2026-10-22 14:00:00")).is_err());
        assert_eq!(std::fs::read(dir.join("2026-10-22/Images")).unwrap(), b"x");
        assert_eq!(std::fs::read_dir(dir.join("2026-10-22")).unwrap().count(), 1);
    }

    #[test]
    fn si_no_se_puede_crear_el_dia_no_guarda_en_otro_sitio() {
        let dir = carpeta("dia-bloqueado");
        tocar(&dir.join("2026-10-22"));
        assert!(destino_en(&dir, "png", fecha("2026-10-22 14:00:00")).is_err());
        assert_eq!(std::fs::read_dir(dir).unwrap().count(), 1);
    }

    #[test]
    fn el_historial_combina_los_dias_y_la_raiz_antigua_por_fecha_real() {
        let dir = carpeta("historial-diario");
        let vieja = destino_en(&dir, "png", fecha("2026-10-21 14:00:00")).unwrap();
        let nueva = destino_en(&dir, "PNG", fecha("2026-10-22 14:00:00")).unwrap();
        let raiz = dir.join("antigua.png");
        let legacy_day = dir.join("2026-10-22/legacy.png");
        for (ruta, segundos) in [(&vieja, 100), (&legacy_day, 150), (&nueva, 200), (&raiz, 300)] {
            tocar(ruta);
            let hora = std::time::UNIX_EPOCH + std::time::Duration::from_secs(segundos);
            std::fs::OpenOptions::new().write(true).open(ruta).unwrap()
                .set_times(std::fs::FileTimes::new().set_modified(hora)).unwrap();
        }
        for carpeta in ["otro-proyecto", "2026-02-30", "carpeta.png", "2026-10-22/mas"] {
            let fuera = dir.join(carpeta);
            std::fs::create_dir_all(&fuera).unwrap();
            tocar(&fuera.join("no-debe-salir.png"));
        }
        tocar(&dir.join("2026-10-22/notas.txt"));
        let rutas = |limite| capturas_recientes(&dir, limite).into_iter()
            .map(|(_, ruta)| ruta).collect::<Vec<_>>();
        assert_eq!(rutas(20), vec![raiz.clone(), nueva.clone(), legacy_day, vieja]);
        assert_eq!(rutas(2), vec![raiz.clone(), nueva]);
        assert_eq!(rutas(0), vec![raiz]);
        assert!(capturas_recientes(&dir.join("no-existe"), 4).is_empty());
    }

    #[test]
    fn en_una_carpeta_vacia_sale_el_nombre_pelado() {
        let dir = carpeta("vacia");
        let ruta = nombre_libre(&dir, "winshotx-20260827-154810", "png");
        assert_eq!(ruta.file_name().unwrap(), "winshotx-20260827-154810.png");
    }

    #[test]
    fn si_ese_ya_existe_no_lo_pisa() {
        // El fallo que este modulo viene a arreglar: dos capturas en el mismo segundo
        // dejaban una sola, y la que se perdia era la primera.
        let dir = carpeta("ocupada");
        let primera = dir.join("winshotx-20260827-154810.png");
        tocar(&primera);
        let segunda = nombre_libre(&dir, "winshotx-20260827-154810", "png");
        assert_ne!(segunda, primera);
        assert_eq!(segunda.file_name().unwrap(), "winshotx-20260827-154810-2.png");
        assert!(primera.exists(), "la primera captura ha desaparecido");
    }

    #[test]
    fn y_va_subiendo_mientras_haga_falta() {
        let dir = carpeta("varias");
        tocar(&dir.join("winshotx-20260827-154810.png"));
        tocar(&dir.join("winshotx-20260827-154810-2.png"));
        tocar(&dir.join("winshotx-20260827-154810-3.png"));
        let ruta = nombre_libre(&dir, "winshotx-20260827-154810", "png");
        assert_eq!(ruta.file_name().unwrap(), "winshotx-20260827-154810-4.png");
    }

    #[test]
    fn el_numero_va_antes_de_la_extension() {
        // Detras de la extension, Windows dejaria de saber con que abrirlo.
        let dir = carpeta("extension");
        tocar(&dir.join("winshotx-x.mp4"));
        let ruta = nombre_libre(&dir, "winshotx-x", "mp4");
        assert_eq!(ruta.extension().unwrap(), "mp4");
    }

    #[test]
    fn cada_formato_lleva_su_cuenta() {
        // Un PNG ocupado no obliga a que el MP4 salga con un -2 detras.
        let dir = carpeta("formatos");
        tocar(&dir.join("winshotx-x.png"));
        let ruta = nombre_libre(&dir, "winshotx-x", "mp4");
        assert_eq!(ruta.file_name().unwrap(), "winshotx-x.mp4");
    }

    #[test]
    fn destino_crea_la_carpeta_si_no_esta() {
        // Quien elige una carpeta en los ajustes puede borrarla despues, y guardar tiene
        // que seguir funcionando en vez de fallar con un error del sistema.
        let dir = carpeta("crear").join("dentro").join("mas");
        assert!(!dir.exists());
        let ruta = destino(&dir, "png").unwrap();
        assert!(dir.exists());
        assert_eq!(ruta.extension().unwrap(), "png");
        assert!(ruta.file_name().unwrap().to_string_lossy().starts_with("winshotx-"));
    }

    #[test]
    fn dos_destinos_seguidos_no_son_el_mismo_archivo() {
        // Sin escribir nada en medio esto SI puede repetirse, porque el nombre solo mira
        // si el archivo existe. Se comprueba el caso de verdad: guardar y volver a pedir.
        let dir = carpeta("seguidos");
        let uno = destino(&dir, "png").unwrap();
        tocar(&uno);
        let dos = destino(&dir, "png").unwrap();
        assert_ne!(uno, dos);
    }

    #[test]
    fn la_marca_de_tiempo_tiene_la_forma_que_espera_el_nombre() {
        let marca = marca_de_tiempo();
        assert_eq!(marca.len(), 15, "{marca}");
        assert_eq!(marca.as_bytes()[8], b'-');
        assert!(marca.bytes().filter(|b| b.is_ascii_digit()).count() == 14);
    }
}

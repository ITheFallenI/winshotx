//! Medida de congelar las pantallas de verdad y de recortar de lo congelado.
//! `cargo test --release --lib medir_freeze -- --ignored --nocapture`
#[cfg(test)]
mod tests {
    use std::time::Instant;
    use image::{ExtendedColorType, ImageEncoder};

    fn ms(t: Instant) -> f64 {
        t.elapsed().as_secs_f64() * 1000.0
    }

    #[test]
    #[ignore]
    fn medir_freeze() {
        let dir = std::env::temp_dir().join("winshotx-bench-freeze");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let _ = crate::capture::freeze_all().unwrap();
        for vuelta in 0..4 {
            let t = Instant::now();
            let freezes = crate::capture::freeze_all().unwrap();
            let ms_freeze = ms(t);
            let t = Instant::now();
            let region = crate::capture::Rect { x: 100, y: 100, width: 800, height: 600 };
            let _img = crate::capture::crop_from_freeze(&freezes, region).unwrap();
            let ms_crop = ms(t);
            let t = Instant::now();
            let _ = crate::capture::stitch_all(&freezes).unwrap();
            let ms_stitch = ms(t);
            println!(
                "[freeze] vuelta {vuelta}: freeze_all {} pantallas {ms_freeze:.0} ms ({} KB de PNG); recorte {ms_crop:.0} ms; juntar {ms_stitch:.0} ms",
                freezes.len(),
                freezes.iter().map(|f| f.png.len()).sum::<usize>() / 1024
            );
        }
        // Las partes por separado.
        for vuelta in 0..3 {
            let monitors = xcap::Monitor::all().unwrap();
            let t = Instant::now();
            let imgs: Vec<_> = monitors.iter().map(|m| m.capture_image().unwrap()).collect();
            let ms_cap_fila = ms(t);

            let cuantos = monitors.len();
            let t = Instant::now();
            let _paralelo: Vec<image::RgbaImage> = std::thread::scope(|s| {
                let hs: Vec<_> = (0..cuantos)
                    .map(|i| s.spawn(move || xcap::Monitor::all().unwrap()[i].capture_image().unwrap()))
                    .collect();
                hs.into_iter().map(|h| h.join().unwrap()).collect()
            });
            let ms_cap_par = ms(t);

            let t = Instant::now();
            let mut bmps = Vec::new();
            for img in &imgs {
                let mut v = Vec::with_capacity(img.as_raw().len() + 64);
                image::codecs::bmp::BmpEncoder::new(&mut v)
                    .write_image(img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgba8)
                    .unwrap();
                bmps.push(v);
            }
            let ms_bmp = ms(t);

            let t = Instant::now();
            let a_mano: Vec<Vec<u8>> = imgs.iter().map(crate::capture::bmp_bytes).collect();
            let ms_mano = ms(t);
            println!("[freeze]   BMP a mano, {} pantallas: {ms_mano:.0} ms", a_mano.len());

            let t = Instant::now();
            for (i, b) in bmps.iter().enumerate() {
                std::fs::write(dir.join(format!("x-{i}.bmp")), b).unwrap();
            }
            let ms_write = ms(t);

            let t = Instant::now();
            let _ = image::open(dir.join("x-0.bmp")).unwrap().to_rgba8();
            let ms_decode = ms(t);

            println!(
                "[freeze] vuelta {vuelta}: capturar en fila {ms_cap_fila:.0} ms, en paralelo {ms_cap_par:.0} ms; codificar {} BMP {ms_bmp:.0} ms; escribir {ms_write:.0} ms; decodificar uno {ms_decode:.0} ms",
                bmps.len()
            );
        }
        // Son fotos de la pantalla de quien lo corre: no se quedan en el disco.
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn mediana(mut v: Vec<f64>) -> f64 {
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        v[v.len() / 2]
    }

    /// Las pantallas como las ve el atajo: la principal primero (la del raton, en la app)
    /// y las demas detras.
    fn pantallas() -> (Vec<crate::capture::MonitorInfo>, usize, Vec<usize>) {
        let todas: Vec<_> = xcap::Monitor::all()
            .unwrap()
            .iter()
            .enumerate()
            .map(|(i, m)| crate::capture::describir(i, m).unwrap())
            .collect();
        let primera = todas.iter().position(|m| m.is_primary).unwrap_or(0);
        let resto = (0..todas.len()).filter(|&i| i != primera).collect();
        (todas, primera, resto)
    }

    fn por_gdi(indice: usize) -> image::RgbaImage {
        xcap::Monitor::all().unwrap()[indice].capture_image().unwrap()
    }

    /// Fotografia esas pantallas a la vez, una por hilo, como `freeze_monitors`.
    fn tanda(indices: &[usize], todas: &[crate::capture::MonitorInfo], moderna: bool) -> f64 {
        let t = Instant::now();
        std::thread::scope(|s| {
            let hilos: Vec<_> = indices
                .iter()
                .map(|&i| {
                    let info = todas[i].clone();
                    s.spawn(move || {
                        if moderna {
                            crate::capture::wgc::fotografiar(&info).unwrap()
                        } else {
                            por_gdi(i)
                        }
                    })
                })
                .collect();
            for h in hilos {
                let _ = h.join().unwrap();
            }
        });
        ms(t)
    }

    /// **GDI contra la captura moderna, lo que cuesta.** Las dos vias se turnan vuelta a
    /// vuelta, asi que miden con la misma pantalla y la misma carga. Todo en memoria: son
    /// fotos de la pantalla de quien lo corre, y aqui solo cuentan los milisegundos.
    ///
    ///     cargo test --release --lib comparar_gdi_y_moderna -- --ignored --nocapture
    #[test]
    #[ignore = "fotografia las pantallas de verdad: se corre a mano"]
    fn comparar_gdi_y_moderna() {
        crate::capture::wgc::como_la_app();
        let (todas, primera, resto) = pantallas();
        for m in &todas {
            println!(
                "[gdi/moderna] pantalla {}: {}x{} en {},{} al {:.0}%",
                m.id, m.width, m.height, m.x, m.y, m.scale * 100.0
            );
        }
        // Una vuelta de calentamiento de cada una, que la primera carga bibliotecas.
        tanda(&[primera], &todas, false);
        tanda(&[primera], &todas, true);

        let (mut gdi_1, mut gdi_r, mut mod_1, mut mod_r) = (vec![], vec![], vec![], vec![]);
        for _ in 0..15 {
            gdi_1.push(tanda(&[primera], &todas, false));
            mod_1.push(tanda(&[primera], &todas, true));
            if !resto.is_empty() {
                gdi_r.push(tanda(&resto, &todas, false));
                mod_r.push(tanda(&resto, &todas, true));
            }
        }
        let fila = |nombre: &str, v: &Vec<f64>| {
            if !v.is_empty() {
                let peor = v.iter().cloned().fold(0.0, f64::max);
                println!(
                    "[gdi/moderna] {nombre}: mediana {:.1} ms, peor {peor:.1} ms",
                    mediana(v.clone())
                );
            }
        };
        fila("GDI, la primera sola", &gdi_1);
        fila("moderna, la primera sola", &mod_1);
        fila(&format!("GDI, las otras {} a la vez", resto.len()), &gdi_r);
        fila(&format!("moderna, las otras {} a la vez", resto.len()), &mod_r);

        // Y el camino entero de la app, ya con la moderna dentro y el PNG incluido.
        let (mut entero_1, mut entero_r) = (vec![], vec![]);
        for _ in 0..10 {
            let t = Instant::now();
            let _ = crate::capture::freeze_monitors(&[primera]).unwrap();
            entero_1.push(ms(t));
            if !resto.is_empty() {
                let t = Instant::now();
                let _ = crate::capture::freeze_monitors(&resto).unwrap();
                entero_r.push(ms(t));
            }
        }
        fila("freeze_monitors de la primera, con su PNG", &entero_1);
        fila("freeze_monitors de las otras, con sus PNG", &entero_r);
    }

    /// **El fallo de las fotos de Adeorq, en cifras.** Busca su ventana y la fotografia con
    /// las dos vias, turnandose, y cuenta en cada foto que parte de la ventana sale en negro
    /// puro. No se guarda ni una imagen: la pantalla de quien lo corre tiene sus cosas.
    ///
    /// Otra ventana con WebView2: `WINSHOTX_VENTANA=<parte del nombre de su programa>`.
    ///
    ///     cargo test --release --lib medir_el_negro -- --ignored --nocapture
    #[test]
    #[ignore = "fotografia la pantalla de verdad: se corre a mano"]
    fn medir_el_negro_sobre_una_ventana_con_webview2() {
        crate::capture::wgc::como_la_app();
        let buscada = std::env::var("WINSHOTX_VENTANA").unwrap_or_else(|_| "adeorq".into());
        let ventanas = xcap::Window::all().unwrap();
        // Vienen de arriba abajo, como las apila Windows: las de antes la pueden tapar.
        let posicion = ventanas
            .iter()
            .enumerate()
            .filter(|(_, w)| !w.is_minimized().unwrap_or(true))
            .filter(|(_, w)| w.app_name().unwrap_or_default().to_lowercase().contains(&buscada))
            .max_by_key(|(_, w)| w.width().unwrap_or(0) * w.height().unwrap_or(0))
            .map(|(i, _)| i)
            .unwrap_or_else(|| panic!("no hay ninguna ventana de {buscada} a la vista"));
        let ventana = &ventanas[posicion];
        let (vx, vy) = (ventana.x().unwrap(), ventana.y().unwrap());
        let (vw, vh) = (ventana.width().unwrap() as i32, ventana.height().unwrap() as i32);
        let encima = ventanas[..posicion]
            .iter()
            .filter(|w| !w.is_minimized().unwrap_or(true))
            .filter(|w| {
                let (x, y) = (w.x().unwrap_or(0), w.y().unwrap_or(0));
                let (ancho, alto) = (w.width().unwrap_or(0) as i32, w.height().unwrap_or(0) as i32);
                x < vx + vw && vx < x + ancho && y < vy + vh && vy < y + alto
            })
            .count();
        println!(
            "[negro] ventana de {buscada}: {vw}x{vh} en {vx},{vy}; con el foco: {}; ventanas encima que la pisan: {encima}",
            ventana.is_focused().unwrap_or(false)
        );

        let (todas, _, _) = pantallas();
        let (cx, cy) = (vx + vw / 2, vy + vh / 2);
        let indice = todas
            .iter()
            .position(|m| m.contains(cx, cy))
            .expect("la ventana no cae en ninguna pantalla");
        let pantalla = todas[indice].clone();
        // El trozo de la ventana que cae dentro de su pantalla, en coordenadas de la foto.
        let x0 = (vx - pantalla.x).max(0) as u32;
        let y0 = (vy - pantalla.y).max(0) as u32;
        let x1 = ((vx + vw - pantalla.x).max(0) as u32).min(pantalla.width);
        let y1 = ((vy + vh - pantalla.y).max(0) as u32).min(pantalla.height);
        let area = ((x1 - x0) as u64 * (y1 - y0) as u64) as f64 / 100.0;
        // DOS FALLOS DISTINTOS, QUE ANTES SE CONTABAN COMO UNO.
        //
        // Las dos vias fotografian lo mismo con milisegundos de diferencia, asi que un
        // pixel negro en una y con contenido en la otra puede ser una de dos cosas, y no
        // se arreglan igual:
        //
        // - **Un agujero**: esta via VEIA ese trozo en su foto anterior y ahora lo ve
        //   negro. Ha perdido contenido que tenia. Es el fallo de GDI con lo que compone
        //   la tarjeta grafica.
        // - **Un desfase**: ese trozo tambien estaba negro en su foto anterior, y la otra
        //   via ya ve algo. No ha perdido nada: es contenido NUEVO que esta via todavia no
        //   tiene, porque le dieron el fotograma de justo antes.
        //
        // Mezclados no se puede arreglar ninguno: el agujero se arregla cambiando de via, y
        // el desfase esperando al compositor. Medido el 21 de octubre de 2026, lo que
        // quedaba de la captura moderna era desfase, no agujeros.
        let casi_negro = |p: [u8; 4]| p[0] <= 16 && p[1] <= 16 && p[2] <= 16;
        let con_algo = |p: [u8; 4]| p[0] >= 48 || p[1] >= 48 || p[2] >= 48;
        let fallos = |esta: &image::RgbaImage,
                      otra: &image::RgbaImage,
                      antes: Option<&image::RgbaImage>|
         -> (f64, f64) {
            let (mut agujero, mut desfase) = (0u64, 0u64);
            for y in y0..y1 {
                for x in x0..x1 {
                    if !(casi_negro(esta.get_pixel(x, y).0) && con_algo(otra.get_pixel(x, y).0)) {
                        continue;
                    }
                    match antes {
                        // Lo tenia y lo ha perdido.
                        Some(a) if con_algo(a.get_pixel(x, y).0) => agujero += 1,
                        // Ahi no habia nada: es contenido nuevo que aun no le ha llegado.
                        Some(_) => desfase += 1,
                        // En la primera vuelta no hay con que comparar: cuenta como agujero,
                        // que es lo prudente.
                        None => agujero += 1,
                    }
                }
            }
            (agujero as f64 / area, desfase as f64 / area)
        };

        let vueltas = 80;
        // Una foto con fallo: mas del 1 % de la ventana.
        let pasa = |v: &[f64]| v.iter().filter(|h| **h > 1.0).count();
        let resumen = |nombre: &str, agujeros: &[f64], desfases: &[f64]| {
            let peor = |v: &[f64]| v.iter().cloned().fold(0.0, f64::max);
            println!(
                "[negro] {nombre}: agujeros {} de {vueltas} (peor {:.1} %), desfases {} de {vueltas} (peor {:.1} %)",
                pasa(agujeros),
                peor(agujeros),
                pasa(desfases),
                peor(desfases)
            );
        };

        // Cada momento se mide contra GDI en su propia tanda, no los tres a la vez: dos
        // fotos seguidas se parecen mas que la primera y la cuarta, y comparar tandas de
        // tamannos distintos inventaria diferencias que no son de la via.
        let momentos = [
            ("el primero", crate::capture::wgc::Momento::ElPrimero),
            ("tras el compositor", crate::capture::wgc::Momento::TrasElCompositor),
            ("el mas fresco", crate::capture::wgc::Momento::ElMasFresco),
        ];
        let mut veredicto = Vec::new();
        for (nombre, momento) in momentos {
            let (mut ag_gdi, mut de_gdi) = (Vec::new(), Vec::new());
            let (mut ag_mod, mut de_mod) = (Vec::new(), Vec::new());
            let mut tiempos = Vec::new();
            let mut anteriores: Option<(image::RgbaImage, image::RgbaImage)> = None;
            for _ in 0..vueltas {
                let g = por_gdi(indice);
                let t0 = Instant::now();
                let m = crate::capture::wgc::fotografiar_en(&pantalla, momento).unwrap();
                tiempos.push(ms(t0));
                let (ga, ma) = match &anteriores {
                    Some((ga, ma)) => (Some(ga), Some(ma)),
                    None => (None, None),
                };
                let (a, d) = fallos(&g, &m, ga);
                ag_gdi.push(a);
                de_gdi.push(d);
                let (a, d) = fallos(&m, &g, ma);
                ag_mod.push(a);
                de_mod.push(d);
                anteriores = Some((g, m));
                std::thread::sleep(std::time::Duration::from_millis(40));
            }
            println!("[negro] --- la moderna pidiendo «{nombre}»");
            resumen("GDI", &ag_gdi, &de_gdi);
            resumen("moderna", &ag_mod, &de_mod);
            println!("[negro] moderna, lo que tarda la foto: mediana {:.0} ms", mediana(tiempos));
            veredicto.push((nombre, pasa(&ag_mod), pasa(&de_mod)));
        }

        for (nombre, agujeros, desfases) in &veredicto {
            println!("[negro] «{nombre}»: {agujeros} agujeros y {desfases} desfases de {vueltas}");
        }
        // El que usa la app (`fotografiar`) es «el primero»: ese es el que tiene que salir
        // sin agujeros, y es lo que esta prueba defiende.
        //
        // Los DESFASES no se miran aqui a proposito: este banco no sabe medirlos, porque
        // compara dos fotos hechas en instantes distintos y le apunta a la mas lenta el
        // hueco entre las dos. Quien los mide es `medir_el_retraso_de_la_foto`, que pinta
        // un color conocido y no compara con nadie. Se siguen contando e imprimiendo
        // porque un numero que sube de golpe sigue siendo una pista.
        let (_, agujeros, _) = veredicto[0];
        assert_eq!(agujeros, 0, "la captura moderna ha dejado agujeros negros");
    }

    /// Una ventana de un color, en la esquina de la pantalla principal, para medir si una
    /// foto trae lo ULTIMO que se pinto.
    ///
    /// El otro banco compara las dos vias entre si, y para el retraso eso no vale: las dos
    /// fotos se hacen en instantes distintos, asi que a la que mas tarda se le apunta un
    /// desfase que es el hueco entre ambas y no un defecto suyo. Medido el 21 de octubre de
    /// 2026: «el mas fresco», que es justo el que mas espera por traer lo mas nuevo, salia
    /// el peor de los tres. Aqui no se compara con nada: se pinta un color, se fotografia, y
    /// se mira si la foto trae el color nuevo o el de antes.
    #[cfg(windows)]
    mod retraso {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, WPARAM};
        use windows::Win32::Graphics::Gdi::{CreateSolidBrush, InvalidateRect, UpdateWindow};
        use windows::Win32::System::LibraryLoader::GetModuleHandleW;
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, SetClassLongPtrW,
            ShowWindow, GCLP_HBRBACKGROUND, SW_SHOWNOACTIVATE, WNDCLASSW, WS_EX_NOACTIVATE,
            WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
        };

        const CLASE: &[u16] = &[
            119, 115, 120, 45, 99, 111, 108, 111, 114, 0, // "wsx-color"
        ];

        unsafe extern "system" fn procedimiento(
            hwnd: HWND,
            msg: u32,
            w: WPARAM,
            l: LPARAM,
        ) -> LRESULT {
            unsafe { DefWindowProcW(hwnd, msg, w, l) }
        }

        /// Abre la ventana, ya pintada del primer color.
        pub fn abrir(x: i32, y: i32, lado: i32, color: u32) -> HWND {
            let instancia = unsafe { GetModuleHandleW(None) }.expect("sin instancia");
            let clase = WNDCLASSW {
                hInstance: instancia.into(),
                lpszClassName: PCWSTR(CLASE.as_ptr()),
                lpfnWndProc: Some(procedimiento),
                hbrBackground: unsafe { CreateSolidBrush(COLORREF(color)) },
                ..Default::default()
            };
            let _ = unsafe { RegisterClassW(&clase) };
            let hwnd = unsafe {
                CreateWindowExW(
                    WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT,
                    PCWSTR(CLASE.as_ptr()),
                    PCWSTR::null(),
                    WS_POPUP,
                    x,
                    y,
                    lado,
                    lado,
                    None,
                    None,
                    Some(instancia.into()),
                    None,
                )
            }
            .expect("no se ha podido abrir la ventana de color");
            let _ = unsafe { ShowWindow(hwnd, SW_SHOWNOACTIVATE) };
            hwnd
        }

        /// La pinta de otro color y NO vuelve hasta que la ventana se ha repintado:
        /// `UpdateWindow` manda el `WM_PAINT` y espera a que se atienda. Lo que queda
        /// despues de esto es solo el compositor, que es justo lo que se esta midiendo.
        pub fn pintar(hwnd: HWND, color: u32) {
            let pincel = unsafe { CreateSolidBrush(COLORREF(color)) };
            unsafe {
                SetClassLongPtrW(hwnd, GCLP_HBRBACKGROUND, pincel.0 as isize);
                let _ = InvalidateRect(Some(hwnd), None, true);
                let _ = UpdateWindow(hwnd);
            }
        }

        pub fn cerrar(hwnd: HWND) {
            unsafe {
                let _ = DestroyWindow(hwnd);
            }
        }
    }

    /// Si la foto trae lo ULTIMO que se pinto, por cada forma de pedirla.
    ///
    ///     cargo test --release --lib medir_el_retraso -- --ignored --nocapture
    #[test]
    #[ignore = "abre una ventana de color en la pantalla: se corre a mano"]
    #[cfg(windows)]
    fn medir_el_retraso_de_la_foto() {
        use crate::capture::wgc::Momento;

        // COLORREF va en BGR, al reves que el pixel de la foto.
        const MAGENTA: u32 = 0x00FF_00FF;
        const CIAN: u32 = 0x00FF_FF00;
        let rgb_de = |color: u32| {
            if color == CIAN {
                (0u8, 255u8, 255u8)
            } else {
                (255u8, 0u8, 255u8)
            }
        };
        let es = |p: [u8; 4], c: (u8, u8, u8)| {
            p[0].abs_diff(c.0) < 40 && p[1].abs_diff(c.1) < 40 && p[2].abs_diff(c.2) < 40
        };

        let (todas, primera, _) = pantallas();
        let pantalla = todas[primera].clone();
        let lado = 200;
        let (x, y) = (pantalla.x + 40, pantalla.y + 40);
        let hwnd = retraso::abrir(x, y, lado, MAGENTA);
        std::thread::sleep(std::time::Duration::from_millis(400));

        // El centro de la ventana, en coordenadas de la foto de esa pantalla.
        let cx = (x - pantalla.x + lado / 2) as u32;
        let cy = (y - pantalla.y + lado / 2) as u32;

        let vueltas = 20;
        let mut tabla = Vec::new();
        for (nombre, momento) in [
            ("el primero", Momento::ElPrimero),
            ("tras el compositor", Momento::TrasElCompositor),
            ("el mas fresco", Momento::ElMasFresco),
        ] {
            let mut tarde = 0;
            let mut ninguno = 0;
            let mut tiempos = Vec::new();
            for vuelta in 0..vueltas {
                // Se alterna el color en cada vuelta para que siempre haya un cambio de
                // verdad: pintar dos veces del mismo color no cambia nada, y la foto
                // acertaria sin merito.
                let (viejo, nuevo) = if vuelta % 2 == 0 {
                    (MAGENTA, CIAN)
                } else {
                    (CIAN, MAGENTA)
                };
                retraso::pintar(hwnd, viejo);
                std::thread::sleep(std::time::Duration::from_millis(120));
                retraso::pintar(hwnd, nuevo);
                let t0 = Instant::now();
                let foto = crate::capture::wgc::fotografiar_en(&pantalla, momento).unwrap();
                tiempos.push(ms(t0));
                let p = foto.get_pixel(cx, cy).0;
                if es(p, rgb_de(nuevo)) {
                    // La foto trae lo ultimo que se pinto: bien.
                } else if es(p, rgb_de(viejo)) {
                    tarde += 1;
                } else {
                    // Ni uno ni otro: algo tapa la ventana, y entonces no se mide nada.
                    ninguno += 1;
                }
            }
            println!(
                "[retraso] «{nombre}»: trae el color de antes {tarde} de {vueltas}, sin color conocido {ninguno}, mediana {:.0} ms",
                mediana(tiempos)
            );
            tabla.push((nombre, tarde, ninguno));
        }

        retraso::cerrar(hwnd);

        for (nombre, _, ninguno) in &tabla {
            assert_eq!(
                *ninguno, 0,
                "«{nombre}»: la ventana de color no sale en la foto, algo la tapa y no se mide nada"
            );
        }
        // El que usa la app (`fotografiar`) es «tras el compositor»: ese es el que no puede
        // traer el color de antes.
        assert_eq!(
            tabla[1].1, 0,
            "la foto de la app trae el color de antes: llega tarde"
        );
    }
}

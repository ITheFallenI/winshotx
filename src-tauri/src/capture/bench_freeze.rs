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
        // Un hueco es un pixel casi negro en una foto donde la otra, hecha justo al lado, ve
        // contenido. El negro de GDI no es negro exacto (sale un fondo muy oscuro), asi que
        // contar solo el 0,0,0 no lo ve: medido, las dos vias daban el mismo 0,22 %.
        let casi_negro = |p: [u8; 4]| p[0] <= 16 && p[1] <= 16 && p[2] <= 16;
        let con_algo = |p: [u8; 4]| p[0] >= 48 || p[1] >= 48 || p[2] >= 48;
        let huecos = |esta: &image::RgbaImage, otra: &image::RgbaImage| -> f64 {
            let mut cuantos = 0u64;
            for y in y0..y1 {
                for x in x0..x1 {
                    if casi_negro(esta.get_pixel(x, y).0) && con_algo(otra.get_pixel(x, y).0) {
                        cuantos += 1;
                    }
                }
            }
            cuantos as f64 / area
        };
        let iguales = |a: &image::RgbaImage, b: &image::RgbaImage| -> f64 {
            let mut cuantos = 0u64;
            for y in y0..y1 {
                for x in x0..x1 {
                    let (p, q) = (a.get_pixel(x, y).0, b.get_pixel(x, y).0);
                    if (0..3).all(|c| p[c].abs_diff(q[c]) <= 2) {
                        cuantos += 1;
                    }
                }
            }
            cuantos as f64 / area
        };

        let vueltas = 80;
        let (mut gdi, mut moderna) = (Vec::new(), Vec::new());
        let (mut gdi_consigo, mut moderna_consigo) = (Vec::new(), Vec::new());
        let mut anteriores: Option<(image::RgbaImage, image::RgbaImage)> = None;
        for vuelta in 0..vueltas {
            let g = por_gdi(indice);
            let m = crate::capture::wgc::fotografiar(&pantalla).unwrap();
            let (hg, hm) = (huecos(&g, &m), huecos(&m, &g));
            gdi.push(hg);
            moderna.push(hm);
            if let Some((ga, ma)) = &anteriores {
                let (cg, cm) = (iguales(ga, &g), iguales(ma, &m));
                gdi_consigo.push(cg);
                moderna_consigo.push(cm);
                if hg > 1.0 || hm > 1.0 {
                    println!(
                        "[negro]   vuelta {vuelta}: huecos GDI {hg:.1}%, moderna {hm:.1}%; igual que su anterior: GDI {cg:.1}%, moderna {cm:.1}%"
                    );
                }
            }
            anteriores = Some((g, m));
            std::thread::sleep(std::time::Duration::from_millis(40));
        }
        let resumen = |nombre: &str, que: &str, v: &Vec<f64>| {
            let peor = v.iter().cloned().fold(0.0, f64::max);
            let menos = v.iter().cloned().fold(100.0, f64::min);
            println!(
                "[negro] {nombre}, {que}: minimo {menos:.1}%, mediana {:.1}%, maximo {peor:.1}%",
                mediana(v.clone())
            );
        };
        resumen("GDI", "huecos en la ventana", &gdi);
        resumen("moderna", "huecos en la ventana", &moderna);
        resumen("GDI", "igual que su foto anterior", &gdi_consigo);
        resumen("moderna", "igual que su foto anterior", &moderna_consigo);
        // Una foto con hueco: mas del 1 % de la ventana negra donde la otra via ve algo.
        let huecos_gdi = gdi.iter().filter(|h| **h > 1.0).count();
        let huecos_moderna = moderna.iter().filter(|h| **h > 1.0).count();
        println!(
            "[negro] fotos con huecos (mas del 1 % de la ventana): GDI {huecos_gdi} de {vueltas}, moderna {huecos_moderna} de {vueltas}"
        );
        assert_eq!(huecos_moderna, 0, "la captura moderna tambien ha dejado huecos negros");
    }
}

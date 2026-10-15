//! Las cinco cosas que se pueden dibujar encima de una captura antes de exportarla.
//!
//! Flecha, rectángulo, texto, resaltado y difuminado. **Cinco y ni una más**: el editor de
//! imagen no es el producto, y cada herramienta que se añade es una fila más en una barra
//! que hoy se lee de un vistazo. Lo que hace falta para señalar algo o para tapar un dato
//! está aquí; lo demás es otro programa.
//!
//! **Las coordenadas van de 0 a 1, no en píxeles.** Quien dibuja lo hace sobre una vista
//! previa que casi nunca mide lo que va a medir el archivo, y el mismo dibujo tiene que
//! valer si después se exporta al 50 % o con el doble de ancho. Guardarlas en píxeles
//! obligaría a recalcularlas cada vez que alguien toca «Dimensiones», y bastaría con
//! olvidarse una para que una flecha señalara al sitio equivocado.

use image::{Rgba, RgbaImage};
use serde::{Deserialize, Serialize};

/// Una marca sobre la captura, con sus dos esquinas en tanto por uno.
///
/// Tambien se serializa, porque tapar datos personales las devuelve hechas: el editor las
/// recibe y las annade a las que ya hubiera, como si las hubiera dibujado alguien.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Anotacion {
    /// `arrow`, `box`, `text`, `highlight`, `blur` o `step`.
    pub kind: String,
    /// Desde dónde y hasta dónde, de 0 a 1 sobre el ancho y el alto de la imagen.
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    /// El color, en `#rrggbb`. El difuminado y el resaltado lo ignoran.
    #[serde(default)]
    pub color: String,
    /// Lo que dice, si es un texto.
    #[serde(default)]
    pub text: String,
}

impl Anotacion {
    /// Las dos esquinas en píxeles de esta imagen, ordenadas.
    ///
    /// **Pueden caer fuera del lienzo, y así tiene que ser**: quien pinta recorta. Antes se
    /// metían dentro con un `clamp` por coordenada, y eso no recorta, MUEVE: una marca que
    /// el recorte se había llevado reaparecía aplastada contra el borde, y una flecha que
    /// apuntaba fuera cambiaba de ángulo porque sus dos extremos acababan en la misma
    /// esquina. Es el fallo que pedía arreglar la issue #1.
    fn caja(&self, ancho: u32, alto: u32) -> (i32, i32, i32, i32) {
        let (x1, y1, x2, y2) = self.caja_sin_ordenar(ancho, alto);
        (x1.min(x2), y1.min(y2), x1.max(x2), y1.max(y2))
    }

    fn rgb(&self) -> [u8; 3] {
        color_de(&self.color)
    }
}

/// Lee un `#rrggbb`. Lo que no se entienda sale rojo, que es el color de señalar algo.
fn color_de(texto: &str) -> [u8; 3] {
    let limpio = texto.trim_start_matches('#');
    if limpio.len() != 6 {
        return [239, 68, 68];
    }
    let leer = |i: usize| u8::from_str_radix(&limpio[i..i + 2], 16).ok();
    match (leer(0), leer(2), leer(4)) {
        (Some(r), Some(g), Some(b)) => [r, g, b],
        _ => [239, 68, 68],
    }
}

/// Grosor del trazo, en píxeles, sobre una imagen de este ancho.
///
/// Crece con la imagen: un trazo de 3 px sobre una captura de 3.000 de ancho no se ve, y
/// uno de 12 sobre una de 200 la tapa entera.
///
/// El suelo son tres píxeles y no dos porque con dos **no se ve**. Se probó primero con
/// `ancho / 320` y un mínimo de dos, y sobre una captura de 720 el rectángulo de señalar
/// salía tan fino que había que buscarlo. Una marca que hay que buscar no marca nada.
fn grosor(ancho: u32) -> i32 {
    ((ancho as f32 / 400.0).round() as i32).clamp(3, 9)
}

/// Pinta todas las anotaciones sobre la imagen, en el orden en que se hicieron.
pub fn pintar(imagen: &mut RgbaImage, anotaciones: &[Anotacion]) {
    for anotacion in anotaciones {
        let (ancho, alto) = imagen.dimensions();
        let (x1, y1, x2, y2) = anotacion.caja(ancho, alto);
        match anotacion.kind.as_str() {
            "box" => marco(imagen, x1, y1, x2, y2, anotacion.rgb()),
            "arrow" => flecha(imagen, &anotacion.caja_sin_ordenar(ancho, alto), anotacion.rgb()),
            "highlight" => resaltar(imagen, x1, y1, x2, y2, anotacion.rgb()),
            "blur" => difuminar(imagen, x1, y1, x2, y2),
            // El texto y el paso se ponen con un clic, asi que su segunda esquina no
            // significa nada. Van con las coordenadas SIN ordenar: `caja` se queda con la
            // menor de las dos, y eso los mandaba a todos al borde de la imagen.
            "text" => {
                let (x, y, _, _) = anotacion.caja_sin_ordenar(ancho, alto);
                texto(imagen, x, y, &anotacion.text, anotacion.rgb());
            }
            "step" => {
                let (x, y, _, _) = anotacion.caja_sin_ordenar(ancho, alto);
                paso(imagen, x, y, &anotacion.text, anotacion.rgb());
            }
            _ => {}
        }
    }
}

impl Anotacion {
    /// Igual que `caja`, pero sin ordenar: la flecha necesita saber de dónde sale y adónde
    /// va, y ordenar las esquinas le daría siempre la vuelta.
    ///
    /// Las coordenadas se limitan a ocho veces la imagen, que es mucho más de lo que puede
    /// dar un reencuadre y a la vez impide que un número absurdo (o un `NaN`, que sale
    /// cero) pida recorrer millones de píxeles invisibles.
    fn caja_sin_ordenar(&self, ancho: u32, alto: u32) -> (i32, i32, i32, i32) {
        let px = |v: f32, tope: u32| (v.clamp(-8.0, 8.0) * tope as f32).round() as i32;
        (
            px(self.x1, ancho),
            px(self.y1, alto),
            px(self.x2, ancho),
            px(self.y2, alto),
        )
    }
}

/// El trozo de una caja que de verdad cae dentro de la imagen, o nada si no cae ninguno.
fn dentro(imagen: &RgbaImage, x1: i32, y1: i32, x2: i32, y2: i32) -> Option<(i32, i32, i32, i32)> {
    let (ancho, alto) = imagen.dimensions();
    let (izq, arr) = (x1.max(0), y1.max(0));
    let (der, aba) = (x2.min(ancho as i32 - 1), y2.min(alto as i32 - 1));
    (izq <= der && arr <= aba).then_some((izq, arr, der, aba))
}

/// El trozo de un segmento que entra en la imagen, con un margen por fuera para el grosor.
///
/// Recorta el RECORRIDO sin tocar la dirección, que es justo la diferencia entre recortar
/// y mover: el segmento se mira como un parámetro que va de 0 a 1, y cada borde del lienzo
/// adelanta el principio o acorta el final (Liang y Barsky). Así una flecha que apunta
/// fuera sigue saliendo con su ángulo, solo que se ve el trozo que cabe.
///
/// El margen son los píxeles que el trazo pinta a cada lado de su línea. Sin él, un trazo
/// que pasa justo por el borde perdería la mitad que sí se ve.
fn recortar_segmento(
    imagen: &RgbaImage,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    margen: f32,
) -> Option<(f32, f32, f32, f32)> {
    let (ancho, alto) = imagen.dimensions();
    let (hasta_x, hasta_y) = (ancho as f32 - 1.0 + margen, alto as f32 - 1.0 + margen);
    let (dx, dy) = (x2 - x1, y2 - y1);
    let (mut desde, mut hasta) = (0.0f32, 1.0f32);
    for (avance, hueco) in [
        (-dx, x1 + margen),
        (dx, hasta_x - x1),
        (-dy, y1 + margen),
        (dy, hasta_y - y1),
    ] {
        if avance == 0.0 {
            // Paralelo a ese borde: o cabe siempre, o no cabe nunca.
            if hueco < 0.0 {
                return None;
            }
            continue;
        }
        let t = hueco / avance;
        if avance < 0.0 {
            desde = desde.max(t);
        } else {
            hasta = hasta.min(t);
        }
        if desde > hasta {
            return None;
        }
    }
    Some((x1 + dx * desde, y1 + dy * desde, x1 + dx * hasta, y1 + dy * hasta))
}

/// Si ese punto está sobre la imagen, contando los bordes.
///
/// El borde cuenta: el 1 de «de 0 a 1» ES el borde derecho, y la capa de dibujar manda
/// justo ese número cuando alguien pone una marca pegada al filo. Dejarlo fuera haría
/// desaparecer la marca en el último píxel. Lo que viene de un recorte cae mucho más
/// lejos, así que se sigue descartando.
fn pisa_la_imagen(imagen: &RgbaImage, x: i32, y: i32) -> bool {
    let (ancho, alto) = imagen.dimensions();
    x >= 0 && y >= 0 && x <= ancho as i32 && y <= alto as i32
}

/// Dónde cae el centro de una marca de un clic para que quepa entera, o nada si el clic
/// está fuera de la imagen.
///
/// Las dos cosas importan. Que no vuelva lo que el recorte se llevó, y que lo que sí está
/// dentro quepa: un disco partido por la mitad no se lee, porque el número se va fuera y
/// lo que queda es una mancha. Si la marca es más grande que la imagen, se centra y ya.
fn centro_metido(
    imagen: &RgbaImage,
    x: i32,
    y: i32,
    media_ancho: i32,
    media_alto: i32,
) -> Option<(i32, i32)> {
    let (ancho, alto) = imagen.dimensions();
    if !pisa_la_imagen(imagen, x, y) {
        return None;
    }
    let mete = |v: i32, media: i32, tope: i32| {
        if media * 2 >= tope {
            tope / 2
        } else {
            v.clamp(media, tope - 1 - media)
        }
    };
    Some((
        mete(x, media_ancho, ancho as i32),
        mete(y, media_alto, alto as i32),
    ))
}

/// Lo mismo, para un dibujo que se ancla por su esquina de arriba a la izquierda.
fn esquina_metida(
    imagen: &RgbaImage,
    x: i32,
    y: i32,
    ancho_dibujo: i32,
    alto_dibujo: i32,
) -> Option<(i32, i32)> {
    let (ancho, alto) = imagen.dimensions();
    if !pisa_la_imagen(imagen, x, y) {
        return None;
    }
    let mete = |v: i32, dibujo: i32, tope: i32| v.min((tope - dibujo).max(0));
    Some((
        mete(x, ancho_dibujo, ancho as i32),
        mete(y, alto_dibujo, alto as i32),
    ))
}

/// Un punto de color, mezclado con lo que hubiera.
fn punto(imagen: &mut RgbaImage, x: i32, y: i32, color: [u8; 3], alfa: f32) {
    let (ancho, alto) = imagen.dimensions();
    if x < 0 || y < 0 || x >= ancho as i32 || y >= alto as i32 || alfa <= 0.0 {
        return;
    }
    let pixel = imagen.get_pixel_mut(x as u32, y as u32);
    for (canal, nuevo) in pixel.0.iter_mut().zip(color).take(3) {
        *canal = (*canal as f32 * (1.0 - alfa) + nuevo as f32 * alfa).round() as u8;
    }
    pixel.0[3] = 255;
}

/// Un disco relleno, que es como se engorda un trazo sin que se vean los escalones.
///
/// El radio va en coma flotante porque los trazos finos son medios píxeles: un trazo de 3
/// tiene radio 1,5. Y el alfa se mide **hasta medio píxel por fuera** del radio, no hasta
/// el radio justo. Con la versión anterior, un disco de radio 1 pintaba UN píxel: a
/// distancia 1 el borde valía exactamente cero y no se dibujaba nada. El rectángulo de
/// señalar salía tan fino que había que buscarlo, y las pruebas seguían verdes porque solo
/// contaban píxeles tocados, no lo gordos que eran.
fn disco(imagen: &mut RgbaImage, cx: i32, cy: i32, radio: f32, color: [u8; 3]) {
    let alcance = radio.ceil() as i32 + 1;
    for dy in -alcance..=alcance {
        for dx in -alcance..=alcance {
            let distancia = ((dx * dx + dy * dy) as f32).sqrt();
            let borde = (radio + 0.5 - distancia).clamp(0.0, 1.0);
            if borde > 0.0 {
                punto(imagen, cx + dx, cy + dy, color, borde);
            }
        }
    }
}

/// Una línea gorda, dibujada como una fila de discos.
///
/// Se recorta al lienzo ANTES de recorrerla, con el radio de margen para no perder la
/// mitad que se ve de un trazo que pasa por el borde. Recortar aquí es lo que hace que un
/// rectángulo del que solo entra un lado pinte ese lado y no los otros, y que una marca
/// que el recorte dejó fuera no pinte nada en lugar de una raya contra el borde.
fn linea(imagen: &mut RgbaImage, x1: i32, y1: i32, x2: i32, y2: i32, radio: f32, color: [u8; 3]) {
    let Some((x1, y1, x2, y2)) =
        recortar_segmento(imagen, x1 as f32, y1 as f32, x2 as f32, y2 as f32, radio)
    else {
        return;
    };
    let pasos = ((x2 - x1).abs().max((y2 - y1).abs()).round() as i32).max(1);
    for i in 0..=pasos {
        let t = i as f32 / pasos as f32;
        let x = x1 + (x2 - x1) * t;
        let y = y1 + (y2 - y1) * t;
        disco(imagen, x.round() as i32, y.round() as i32, radio, color);
    }
}

/// Un rectángulo hueco: se señala lo de dentro sin taparlo.
fn marco(imagen: &mut RgbaImage, x1: i32, y1: i32, x2: i32, y2: i32, color: [u8; 3]) {
    let radio = grosor(imagen.width()) as f32 / 2.0;
    linea(imagen, x1, y1, x2, y1, radio, color);
    linea(imagen, x2, y1, x2, y2, radio, color);
    linea(imagen, x2, y2, x1, y2, radio, color);
    linea(imagen, x1, y2, x1, y1, radio, color);
}

/// Una flecha del primer punto al segundo, con la punta en el segundo.
fn flecha(imagen: &mut RgbaImage, caja: &(i32, i32, i32, i32), color: [u8; 3]) {
    let (x1, y1, x2, y2) = *caja;
    let radio = grosor(imagen.width()) as f32 / 2.0;
    linea(imagen, x1, y1, x2, y2, radio, color);

    // La punta: dos rayas hacia atrás, abiertas treinta grados a cada lado.
    let angulo = ((y2 - y1) as f32).atan2((x2 - x1) as f32);
    let largo = (grosor(imagen.width()) * 4).max(12) as f32;
    for lado in [-0.52f32, 0.52] {
        let a = angulo + std::f32::consts::PI + lado;
        let x = x2 as f32 + a.cos() * largo;
        let y = y2 as f32 + a.sin() * largo;
        linea(imagen, x2, y2, x.round() as i32, y.round() as i32, radio, color);
    }
}

/// Marcador translúcido: se ve lo de debajo, teñido.
fn resaltar(imagen: &mut RgbaImage, x1: i32, y1: i32, x2: i32, y2: i32, color: [u8; 3]) {
    let Some((x1, y1, x2, y2)) = dentro(imagen, x1, y1, x2, y2) else {
        return;
    };
    for y in y1..=y2 {
        for x in x1..=x2 {
            punto(imagen, x, y, color, 0.32);
        }
    }
}

/// Cuánto lado tiene cada cuadrado del difuminado, según lo grande que sea la zona.
fn lado_del_mosaico(ancho: i32, alto: i32) -> i32 {
    (ancho.min(alto) / 8).clamp(6, 40)
}

/// Tapa una zona con cuadrados gordos del color medio de lo que había.
///
/// Es un mosaico y no un desenfoque a propósito: un desenfoque suave se puede deshacer con
/// suficiente paciencia y algo de software, y aquí se está tapando un correo, un DNI o una
/// clave. Un mosaico tira la información de verdad: lo que había dentro del cuadrado ya no
/// está en el archivo.
fn difuminar(imagen: &mut RgbaImage, x1: i32, y1: i32, x2: i32, y2: i32) {
    // El trozo que entra, y nada si no entra ninguno. Además es lo que mantiene a
    // `get_pixel` dentro del vector, que aquí se lee directo sin comprobar nada.
    let Some((x1, y1, x2, y2)) = dentro(imagen, x1, y1, x2, y2) else {
        return;
    };
    let lado = lado_del_mosaico(x2 - x1 + 1, y2 - y1 + 1);
    let mut y = y1;
    while y <= y2 {
        let mut x = x1;
        while x <= x2 {
            let hasta_x = (x + lado - 1).min(x2);
            let hasta_y = (y + lado - 1).min(y2);
            let (mut r, mut g, mut b, mut cuantos) = (0u32, 0u32, 0u32, 0u32);
            for yy in y..=hasta_y {
                for xx in x..=hasta_x {
                    let p = imagen.get_pixel(xx as u32, yy as u32);
                    r += p.0[0] as u32;
                    g += p.0[1] as u32;
                    b += p.0[2] as u32;
                    cuantos += 1;
                }
            }
            // Clippy pide `checked_div`, pero este `if` protege las TRES divisiones a la
            // vez y ademas envuelve el bucle que las usa. Con `checked_div` serian tres
            // comprobaciones para decir lo mismo.
            #[allow(clippy::manual_checked_ops)]
            if cuantos > 0 {
                let medio = Rgba([
                    (r / cuantos) as u8,
                    (g / cuantos) as u8,
                    (b / cuantos) as u8,
                    255,
                ]);
                for yy in y..=hasta_y {
                    for xx in x..=hasta_x {
                        imagen.put_pixel(xx as u32, yy as u32, medio);
                    }
                }
            }
            x += lado;
        }
        y += lado;
    }
}

/// Texto sobre la captura, dibujado con la fuente del sistema.
fn texto(imagen: &mut RgbaImage, x: i32, y: i32, texto: &str, color: [u8; 3]) {
    if texto.is_empty() {
        return;
    }
    // El tamaño de la letra sale del ancho de la imagen, igual que el grosor del trazo: un
    // texto de 22 px sobre una captura de 3.000 no se lee.
    let alto_letra = ((imagen.width() as f32 / 42.0).round() as i32).clamp(14, 72);
    // El clic manda, pero el texto tiene que caber: puesto contra el borde derecho se iba
    // fuera y se perdía casi entero. Y si el clic cayó fuera de la imagen, que es lo normal
    // cuando el recorte se llevó esa zona, no se escribe nada.
    let (ancho_texto, alto_texto) = medida_del_texto(texto, alto_letra);
    let Some((x, y)) = esquina_metida(imagen, x, y, ancho_texto, alto_texto) else {
        return;
    };
    escribir_en(imagen, x, y, texto, alto_letra, color);
}

/// Escribe con la fuente del sistema, con la esquina de arriba a la izquierda en (x, y).
#[cfg(windows)]
fn escribir_en(imagen: &mut RgbaImage, x: i32, y: i32, que: &str, alto_letra: i32, color: [u8; 3]) {
    let Some(dibujo) = crate::record::pastilla::escribir(que, alto_letra, color) else {
        return;
    };
    let (ancho, alto) = imagen.dimensions();
    for (dx, dy, pixel) in dibujo.enumerate_pixels() {
        let alfa = pixel.0[3] as f32 / 255.0;
        if alfa <= 0.0 {
            continue;
        }
        let (px, py) = (x + dx as i32, y + dy as i32);
        if px < 0 || py < 0 || px >= ancho as i32 || py >= alto as i32 {
            continue;
        }
        punto(imagen, px, py, [pixel.0[0], pixel.0[1], pixel.0[2]], alfa);
    }
}

/// El tamaño que ocuparía ese texto, para poder centrarlo antes de escribirlo.
#[cfg(windows)]
fn medida_del_texto(que: &str, alto_letra: i32) -> (i32, i32) {
    crate::record::pastilla::escribir(que, alto_letra, [255, 255, 255])
        .map(|d| (d.width() as i32, d.height() as i32))
        .unwrap_or((0, 0))
}

/// Lo que mide el disco de un paso sobre una imagen de este ancho.
fn radio_del_paso(ancho: u32) -> f32 {
    (ancho as f32 / 26.0).clamp(15.0, 60.0)
}

/// Un paso numerado: un disco del color elegido con su número dentro, en blanco.
///
/// Es la marca de las instrucciones: «primero esto, luego esto otro». Se pone con un clic y
/// el número lo lleva la cuenta el editor, porque numerar a mano es justo lo que se olvida
/// cuando alguien añade un paso en medio.
///
/// El disco se mide contra el ancho de la imagen, como el grosor del trazo: uno de 40 px
/// sobre una captura de 3.000 sería un lunar.
fn paso(imagen: &mut RgbaImage, cx: i32, cy: i32, numero: &str, color: [u8; 3]) {
    let radio = radio_del_paso(imagen.width());
    let aro = radio + grosor(imagen.width()) as f32 * 0.6;
    // Entero o nada: un cuarto de disco con el número fuera no es un paso, es una mancha.
    let Some((cx, cy)) = centro_metido(imagen, cx, cy, aro.ceil() as i32, aro.ceil() as i32)
    else {
        return;
    };
    // Un aro blanco por debajo, un poco más grande: sobre una captura oscura un disco rojo
    // sin borde se pierde, y sobre una clara se pierde el número.
    disco(imagen, cx, cy, aro, [255, 255, 255]);
    disco(imagen, cx, cy, radio, color);
    if numero.is_empty() {
        return;
    }
    let alto_letra = (radio * 1.15).round() as i32;
    let (ancho_texto, alto_texto) = medida_del_texto(numero, alto_letra);
    escribir_en(
        imagen,
        cx - ancho_texto / 2,
        cy - alto_texto / 2,
        numero,
        alto_letra,
        [255, 255, 255],
    );
}

#[cfg(not(windows))]
fn escribir_en(
    _imagen: &mut RgbaImage,
    _x: i32,
    _y: i32,
    _que: &str,
    _alto_letra: i32,
    _color: [u8; 3],
) {
}

#[cfg(not(windows))]
fn medida_del_texto(_que: &str, _alto_letra: i32) -> (i32, i32) {
    (0, 0)
}

#[cfg(not(windows))]
fn paso(imagen: &mut RgbaImage, cx: i32, cy: i32, _numero: &str, color: [u8; 3]) {
    let radio = radio_del_paso(imagen.width());
    let Some((cx, cy)) = centro_metido(imagen, cx, cy, radio.ceil() as i32, radio.ceil() as i32)
    else {
        return;
    };
    disco(imagen, cx, cy, radio, color);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lienzo(ancho: u32, alto: u32) -> RgbaImage {
        RgbaImage::from_pixel(ancho, alto, Rgba([255, 255, 255, 255]))
    }

    fn marca(kind: &str, x1: f32, y1: f32, x2: f32, y2: f32) -> Anotacion {
        Anotacion {
            kind: kind.into(),
            x1,
            y1,
            x2,
            y2,
            color: "#ef4444".into(),
            text: String::new(),
        }
    }

    fn tocados(imagen: &RgbaImage) -> usize {
        imagen
            .pixels()
            .filter(|p| p.0 != [255, 255, 255, 255])
            .count()
    }

    #[test]
    fn el_color_se_lee_del_texto_y_lo_raro_sale_rojo() {
        assert_eq!(color_de("#0a9bff"), [10, 155, 255]);
        assert_eq!(color_de("0a9bff"), [10, 155, 255]);
        assert_eq!(color_de("azul"), [239, 68, 68]);
        assert_eq!(color_de(""), [239, 68, 68]);
    }

    /// Lo importante de las coordenadas en tanto por uno: el mismo dibujo vale a
    /// cualquier tamaño. Un rectángulo en el centro sigue en el centro al exportar al
    /// doble o a la mitad.
    #[test]
    fn la_misma_marca_cae_en_el_mismo_sitio_a_cualquier_tamanno() {
        let mitad = marca("box", 0.25, 0.25, 0.75, 0.75);
        for (ancho, alto) in [(100u32, 100u32), (400, 400), (1000, 1000)] {
            let (x1, y1, x2, y2) = mitad.caja(ancho, alto);
            assert_eq!(x1, (ancho as f32 * 0.25) as i32);
            assert_eq!(y2, (alto as f32 * 0.75) as i32);
            assert!(x2 > x1 && y2 > y1);
        }
    }

    #[test]
    fn las_esquinas_se_ordenan_solas_si_se_arrastro_hacia_atras() {
        // Dibujado de abajo a la derecha hacia arriba a la izquierda.
        let alreves = marca("box", 0.8, 0.9, 0.2, 0.1);
        let (x1, y1, x2, y2) = alreves.caja(100, 100);
        assert!(x1 < x2 && y1 < y2, "la caja tenía que salir ordenada");
    }

    #[test]
    fn un_rectangulo_pinta_el_borde_y_deja_el_centro_limpio() {
        let mut imagen = lienzo(200, 200);
        pintar(&mut imagen, &[marca("box", 0.2, 0.2, 0.8, 0.8)]);
        assert!(tocados(&imagen) > 0, "no ha pintado el borde");
        assert_eq!(
            *imagen.get_pixel(100, 100),
            Rgba([255, 255, 255, 255]),
            "el centro tiene que quedarse limpio: es un marco, no un relleno"
        );
    }

    /// El paso numerado: disco del color, aro blanco alrededor y el número dentro.
    ///
    /// No se cuentan píxeles tocados, que es lo que dejó pasar el fallo del trazo de un
    /// píxel: se mira el color del CENTRO (tiene que ser el disco), el de un punto del
    /// borde (tiene que ser el aro blanco) y el de fuera (tiene que seguir limpio).
    #[test]
    fn un_paso_es_un_disco_con_su_numero_dentro() {
        // Sobre un fondo oscuro, porque parte de lo que hay que ver es blanca: el aro que
        // lo separa del fondo y la cifra. Sobre lienzo blanco no se distinguirían.
        let mut imagen = RgbaImage::from_pixel(400, 400, Rgba([20, 20, 20, 255]));
        let mut uno = marca("step", 0.5, 0.5, 0.5, 0.5);
        uno.text = "1".into();
        pintar(&mut imagen, &[uno]);

        // 400 de ancho entre 26 son unos 15 px de radio, y el aro va justo por fuera.
        assert_eq!(
            imagen.get_pixel(210, 200).0,
            [239, 68, 68, 255],
            "a diez píxeles del centro tenía que estar el disco del color pedido"
        );
        assert_eq!(
            imagen.get_pixel(200, 184).0,
            [255, 255, 255, 255],
            "por fuera del disco va el aro blanco, que es lo que lo separa del fondo"
        );
        assert_eq!(
            imagen.get_pixel(20, 20).0,
            [20, 20, 20, 255],
            "fuera del paso no se pinta nada"
        );

        // Y el número está dentro: en esa banda no llega el aro, así que un píxel blanco
        // ahí solo puede venir de la cifra.
        let letra = (190..210)
            .flat_map(|y| (190..210).map(move |x| (x, y)))
            .filter(|(x, y)| imagen.get_pixel(*x, *y).0 == [255, 255, 255, 255])
            .count();
        assert!(letra > 8, "el número no se ve dentro del disco: {letra} píxeles blancos");
    }

    /// Y uno que no comprueba nada, para mirarlo con los ojos:
    /// `cargo test --lib ver_los_pasos -- --ignored --nocapture`
    #[test]
    #[ignore = "deja un PNG para mirar, no comprueba nada"]
    fn ver_los_pasos() {
        let mut imagen = lienzo(900, 260);
        let marcas: Vec<Anotacion> = (1..=5)
            .map(|n| {
                let x = 0.1 + (n as f32 - 1.0) * 0.2;
                let mut m = marca("step", x, 0.5, x, 0.5);
                m.text = n.to_string();
                m.color = COLORES_DE_PRUEBA[(n as usize - 1) % COLORES_DE_PRUEBA.len()].into();
                m
            })
            .collect();
        pintar(&mut imagen, &marcas);
        let ruta = std::env::temp_dir().join("winshotx-pasos.png");
        imagen.save(&ruta).unwrap();
        println!("míralo en {}", ruta.display());
    }

    const COLORES_DE_PRUEBA: [&str; 5] =
        ["#ef4444", "#0a9bff", "#22c55e", "#fbbf24", "#111827"];

    #[test]
    fn el_resaltado_tinne_lo_de_dentro_sin_taparlo() {
        let mut imagen = lienzo(100, 100);
        pintar(&mut imagen, &[marca("highlight", 0.2, 0.2, 0.8, 0.8)]);
        let dentro = *imagen.get_pixel(50, 50);
        assert_ne!(dentro, Rgba([255, 255, 255, 255]), "tenía que teñirse");
        assert!(dentro.0[0] > 200, "pero se sigue viendo lo de debajo");
    }

    /// El difuminado es lo único de aquí que tapa datos de verdad, así que su prueba mira
    /// que la información se pierda: dos zonas distintas dentro del mismo cuadrado tienen
    /// que acabar del mismo color.
    #[test]
    fn el_difuminado_borra_de_verdad_lo_que_habia() {
        let mut imagen = lienzo(100, 100);
        // Un texto de mentira: rayas negras finas sobre blanco.
        for y in 40..60 {
            for x in 20..80 {
                if x % 4 < 2 {
                    imagen.put_pixel(x, y, Rgba([0, 0, 0, 255]));
                }
            }
        }
        pintar(&mut imagen, &[marca("blur", 0.2, 0.4, 0.8, 0.6)]);
        let a = *imagen.get_pixel(21, 45);
        let b = *imagen.get_pixel(23, 45);
        assert_eq!(a, b, "dentro del mosaico ya no se distingue una raya de un hueco");
        assert_ne!(a, Rgba([0, 0, 0, 255]), "y no es negro puro: es la media");
    }

    #[test]
    fn el_mosaico_se_adapta_al_tamanno_de_la_zona() {
        // Una zona pequeña necesita cuadrados pequeños o se convierte en un solo bloque.
        assert!(lado_del_mosaico(40, 20) < lado_del_mosaico(800, 400));
        assert!(lado_del_mosaico(8, 8) >= 6, "nunca por debajo de seis");
        assert!(lado_del_mosaico(5000, 5000) <= 40, "ni por encima de cuarenta");
    }

    #[test]
    fn la_flecha_apunta_a_donde_se_solto_el_raton() {
        let mut imagen = lienzo(200, 200);
        // De arriba a la izquierda hasta abajo a la derecha.
        pintar(&mut imagen, &[marca("arrow", 0.1, 0.1, 0.9, 0.9)]);
        // La punta pinta mucho más que la cola: alrededor del destino hay más color.
        let cerca_del_destino = (160..=195)
            .flat_map(|y| (160..=195).map(move |x| (x, y)))
            .filter(|(x, y)| *imagen.get_pixel(*x, *y) != Rgba([255, 255, 255, 255]))
            .count();
        let cerca_del_origen = (5..=40)
            .flat_map(|y| (5..=40).map(move |x| (x, y)))
            .filter(|(x, y)| *imagen.get_pixel(*x, *y) != Rgba([255, 255, 255, 255]))
            .count();
        assert!(
            cerca_del_destino > cerca_del_origen,
            "la punta va en el destino: {cerca_del_destino} contra {cerca_del_origen}"
        );
    }

    #[test]
    fn una_marca_que_se_sale_del_lienzo_no_revienta() {
        let mut imagen = lienzo(50, 50);
        pintar(
            &mut imagen,
            &[
                marca("box", -0.5, -0.5, 1.5, 1.5),
                marca("arrow", 2.0, 2.0, -2.0, -2.0),
                marca("blur", 0.9, 0.9, 1.4, 1.4),
            ],
        );
        // Que llegue hasta aquí ya es la prueba: ninguna se ha salido del vector.
        assert!(tocados(&imagen) > 0);
    }

    #[test]
    fn una_clase_desconocida_se_ignora_en_vez_de_reventar() {
        let mut imagen = lienzo(50, 50);
        pintar(&mut imagen, &[marca("espiral", 0.1, 0.1, 0.9, 0.9)]);
        assert_eq!(tocados(&imagen), 0);
    }

    /// El trazo tiene que MEDIR lo que dice medir.
    ///
    /// Esta prueba existe porque las otras no vieron el fallo: contaban píxeles tocados y
    /// el rectángulo tocaba muchos, solo que de uno en uno. El disco de radio 1 pintaba un
    /// único píxel, porque el alfa se apagaba justo en el radio en vez de medio píxel más
    /// allá. En la imagen se veía a la primera; en los números, no.
    #[test]
    fn el_trazo_mide_de_verdad_lo_que_dice_el_grosor() {
        let mut imagen = lienzo(720, 420);
        pintar(&mut imagen, &[marca("box", 0.2, 0.2, 0.8, 0.8)]);
        // Se cuenta cuántas filas seguidas están pintadas en el borde de arriba.
        let x = 360;
        let y0 = (420.0 * 0.2) as u32;
        let gordo = (y0.saturating_sub(4)..y0 + 5)
            .filter(|y| *imagen.get_pixel(x, *y) != Rgba([255, 255, 255, 255]))
            .count();
        assert!(
            gordo >= grosor(720) as usize,
            "el trazo dice medir {} y mide {gordo}",
            grosor(720)
        );
    }

    #[test]
    fn el_trazo_engorda_con_la_imagen() {
        assert!(grosor(300) < grosor(1920));
        assert!(grosor(60) >= 3, "nunca más fino de tres píxeles: con dos no se ve");
        assert!(grosor(8000) <= 9, "ni más gordo de nueve");
    }

    /// Deja las cinco herramientas sobre una captura de mentira, para mirarlas.
    /// `cargo test --lib ver_las_anotaciones -- --ignored --nocapture`
    #[test]
    #[ignore = "no comprueba nada: deja un PNG para mirar"]
    fn ver_las_anotaciones() {
        let mut imagen = RgbaImage::new(720, 420);
        // Un escritorio de mentira: barra arriba, panel a la izquierda y texto simulado.
        for (x, y, p) in imagen.enumerate_pixels_mut() {
            *p = if y < 40 {
                Rgba([38, 40, 48, 255])
            } else if x < 180 {
                Rgba([30, 32, 38, 255])
            } else {
                Rgba([246, 246, 248, 255])
            };
        }
        for fila in 0..7 {
            let y0 = 90 + fila * 34;
            for y in y0..y0 + 12 {
                for x in 220..(240 + (fila * 61) % 380) {
                    imagen.put_pixel(x, y, Rgba([60, 64, 72, 255]));
                }
            }
        }
        pintar(
            &mut imagen,
            &[
                Anotacion {
                    kind: "highlight".into(),
                    x1: 0.29,
                    y1: 0.2,
                    x2: 0.62,
                    y2: 0.26,
                    color: "#fbbf24".into(),
                    text: String::new(),
                },
                Anotacion {
                    kind: "box".into(),
                    x1: 0.29,
                    y1: 0.36,
                    x2: 0.72,
                    y2: 0.46,
                    color: "#ef4444".into(),
                    text: String::new(),
                },
                Anotacion {
                    kind: "arrow".into(),
                    x1: 0.9,
                    y1: 0.78,
                    x2: 0.74,
                    y2: 0.45,
                    color: "#0a9bff".into(),
                    text: String::new(),
                },
                Anotacion {
                    kind: "blur".into(),
                    x1: 0.29,
                    y1: 0.62,
                    x2: 0.66,
                    y2: 0.7,
                    color: String::new(),
                    text: String::new(),
                },
                Anotacion {
                    kind: "text".into(),
                    x1: 0.3,
                    y1: 0.85,
                    x2: 0.3,
                    y2: 0.85,
                    color: "#ef4444".into(),
                    text: "esto es lo que falla".into(),
                },
            ],
        );
        let ruta = std::env::temp_dir().join("winshotx-anotaciones.png");
        let (a, b) = imagen.dimensions();
        crate::encode::png::save(&imagen, &ruta, a, b).expect("guardar");
        println!("{}", ruta.display());
    }

    /// Lo que cae ENTERO fuera de la imagen no se pinta, ni pegado al borde.
    ///
    /// Es el fallo de la issue #1. Al recortar la captura, `Recorte::reencuadrar` vuelve a
    /// medir las marcas sobre el trozo, y las de la zona cortada salen con coordenadas por
    /// encima de 1 o por debajo de 0. Quien pintaba las metía dentro a la fuerza con un
    /// `clamp` por coordenada, así que una flecha o un resaltado que ya no estaban en la
    /// imagen reaparecían aplastados contra el borde.
    #[test]
    fn lo_que_cae_entero_fuera_no_se_pinta() {
        for kind in ["box", "arrow", "highlight", "blur", "step", "text"] {
            for (x1, y1, x2, y2) in [(1.2, 1.2, 1.8, 1.8), (-0.8, -0.8, -0.2, -0.2)] {
                let mut imagen = lienzo(200, 200);
                let mut fuera = marca(kind, x1, y1, x2, y2);
                fuera.text = "1".into();
                pintar(&mut imagen, &[fuera]);
                assert_eq!(
                    tocados(&imagen),
                    0,
                    "«{kind}» en ({x1}, {y1})-({x2}, {y2}) ha pintado dentro de la imagen"
                );
            }
        }
    }

    /// Una marca a medias se RECORTA: se ve el trozo que cae dentro, en su sitio.
    ///
    /// Con el `clamp` por coordenada se encogía: el resaltado del 60 % al 140 % se
    /// convertía en uno del 60 % al 100 %, que es otro tamaño, y el rectángulo perdía su
    /// lado de fuera pintándolo encima del borde.
    #[test]
    fn una_marca_a_medias_se_recorta_en_su_sitio() {
        let mut imagen = lienzo(200, 100);
        pintar(&mut imagen, &[marca("highlight", 0.6, 0.2, 1.4, 0.8)]);
        assert_ne!(
            *imagen.get_pixel(199, 50),
            Rgba([255, 255, 255, 255]),
            "el resaltado llega hasta el borde de la imagen"
        );
        assert_ne!(*imagen.get_pixel(130, 50), Rgba([255, 255, 255, 255]));
        assert_eq!(
            *imagen.get_pixel(100, 50),
            Rgba([255, 255, 255, 255]),
            "y lo de antes del 60 % se queda limpio"
        );
    }

    /// La flecha que apunta fuera mantiene su dirección.
    ///
    /// Con el `clamp` los dos extremos acababan en la esquina y la flecha salía a
    /// cuarenta y cinco grados, apuntando a otro sitio.
    #[test]
    fn la_flecha_que_apunta_fuera_no_cambia_de_angulo() {
        let mut imagen = lienzo(200, 200);
        // Del centro hacia fuera por la derecha: 400 px de avance por 100 de bajada.
        pintar(&mut imagen, &[marca("arrow", 0.5, 0.5, 2.5, 1.0)]);
        let fila_media = |x: u32| {
            let filas: Vec<i32> = (0..200u32)
                .filter(|y| *imagen.get_pixel(x, *y) != Rgba([255, 255, 255, 255]))
                .map(|y| y as i32)
                .collect();
            assert!(!filas.is_empty(), "la columna {x} tenía que llevar trazo");
            filas.iter().sum::<i32>() / filas.len() as i32
        };
        // En x = 190 la línea va por y = 100 + 90 / 4 = 122, no por 190.
        let y = fila_media(190);
        assert!(
            (y - 122).abs() <= 4,
            "la flecha tenía que pasar por y = 122 en x = 190, y ha salido en {y}"
        );
    }

    /// Un paso puesto contra el borde cabe entero en vez de salir partido.
    ///
    /// Un disco cortado por la mitad no se lee: el número se va fuera y lo que queda es
    /// una mancha. Se empuja hacia dentro lo justo para que entre.
    #[test]
    fn un_paso_contra_el_borde_cabe_entero() {
        let mut imagen = RgbaImage::from_pixel(400, 400, Rgba([20, 20, 20, 255]));
        let mut uno = marca("step", 0.0, 0.5, 0.0, 0.5);
        uno.text = "1".into();
        pintar(&mut imagen, &[uno]);
        // El radio son 400 / 26, unos 15 px: un disco entero pasa de 500 píxeles del
        // color, y partido por la mitad no llega.
        let del_color = imagen
            .pixels()
            .filter(|p| p.0 == [239, 68, 68, 255])
            .count();
        assert!(
            del_color > 500,
            "el disco del paso ha salido partido: {del_color} píxeles de color"
        );
    }

    /// Un paso en el filo exacto (el 1 de «de 0 a 1») se pinta, no desaparece.
    ///
    /// La capa de dibujar recorta el ratón a 1, así que un clic en la última columna de
    /// la captura manda exactamente eso. Si el filo contara como fuera, la marca se
    /// perdería justo donde el usuario la puso.
    #[test]
    fn un_paso_en_el_filo_exacto_se_pinta() {
        for (x, y) in [(1.0, 0.5), (0.5, 1.0), (1.0, 1.0), (0.0, 0.0)] {
            let mut imagen = lienzo(400, 400);
            let mut uno = marca("step", x, y, x, y);
            uno.text = "2".into();
            pintar(&mut imagen, &[uno]);
            assert!(
                tocados(&imagen) > 500,
                "el paso puesto en ({x}, {y}) no se ha pintado entero"
            );
        }
    }

    /// Y un texto contra el borde derecho se mete para que se pueda leer.
    #[cfg(windows)]
    #[test]
    fn un_texto_contra_el_borde_se_mete_para_que_se_lea() {
        let mut imagen = lienzo(600, 200);
        let mut letras = marca("text", 0.99, 0.5, 0.99, 0.5);
        letras.text = "cuidado".into();
        pintar(&mut imagen, &[letras]);
        let (ancho_texto, _) = medida_del_texto("cuidado", (600.0f32 / 42.0).round() as i32);
        assert!(ancho_texto > 0, "sin fuente no hay nada que comprobar");
        let tocados_ahora = tocados(&imagen);
        assert!(
            tocados_ahora > ancho_texto as usize,
            "el texto se ha quedado fuera de la imagen: solo {tocados_ahora} píxeles"
        );
    }

    /// Las marcas contra los bordes y las que un recorte dejó fuera, para mirarlas.
    /// `cargo test --lib ver_los_bordes -- --ignored --nocapture`
    #[test]
    #[ignore = "no comprueba nada: deja dos PNG para mirar"]
    fn ver_los_bordes() {
        use crate::encode::recorte::Recorte;

        let fondo = |imagen: &mut RgbaImage| {
            for (x, y, p) in imagen.enumerate_pixels_mut() {
                *p = if (x / 40 + y / 40) % 2 == 0 {
                    Rgba([238, 240, 244, 255])
                } else {
                    Rgba([250, 250, 252, 255])
                };
            }
        };

        let mut marcas = vec![
            // Contra las cuatro esquinas y los cuatro bordes.
            Anotacion {
                kind: "step".into(),
                x1: 0.0,
                y1: 0.0,
                x2: 0.0,
                y2: 0.0,
                color: "#ef4444".into(),
                text: "1".into(),
            },
            Anotacion {
                kind: "step".into(),
                x1: 1.0,
                y1: 1.0,
                x2: 1.0,
                y2: 1.0,
                color: "#0a9bff".into(),
                text: "2".into(),
            },
            Anotacion {
                kind: "text".into(),
                x1: 0.99,
                y1: 0.06,
                x2: 0.99,
                y2: 0.06,
                color: "#111827".into(),
                text: "pegado al borde".into(),
            },
            // Un rectángulo del que solo entra un trozo.
            Anotacion {
                kind: "box".into(),
                x1: 0.6,
                y1: 0.3,
                x2: 1.4,
                y2: 0.55,
                color: "#22c55e".into(),
                text: String::new(),
            },
            // Una flecha que apunta fuera: tiene que salir con su ángulo.
            Anotacion {
                kind: "arrow".into(),
                x1: 0.25,
                y1: 0.45,
                x2: 1.8,
                y2: 0.85,
                color: "#ef4444".into(),
                text: String::new(),
            },
            // Un resaltado que se sale por abajo.
            Anotacion {
                kind: "highlight".into(),
                x1: 0.08,
                y1: 0.82,
                x2: 0.45,
                y2: 1.3,
                color: "#fbbf24".into(),
                text: String::new(),
            },
        ];

        let mut imagen = RgbaImage::new(720, 420);
        fondo(&mut imagen);
        pintar(&mut imagen, &marcas);
        let a = std::env::temp_dir().join("winshotx-bordes.png");
        imagen.save(&a).unwrap();

        // Y lo mismo despues de quedarse con el cuarto de arriba a la izquierda: todo lo
        // que cae fuera del trozo tiene que DESAPARECER, no aplastarse contra el borde.
        let trozo = Recorte {
            x1: 0.0,
            y1: 0.0,
            x2: 0.5,
            y2: 0.5,
        };
        let mut recortada = RgbaImage::new(360, 210);
        fondo(&mut recortada);
        marcas = marcas.iter().map(|m| trozo.reencuadrar(m)).collect();
        pintar(&mut recortada, &marcas);
        let b = std::env::temp_dir().join("winshotx-bordes-recortada.png");
        recortada.save(&b).unwrap();

        println!("{}", a.display());
        println!("{}", b.display());
    }

    #[test]
    fn sin_anotaciones_la_imagen_se_queda_como_estaba() {
        let mut imagen = lienzo(80, 80);
        pintar(&mut imagen, &[]);
        assert_eq!(tocados(&imagen), 0);
    }
}

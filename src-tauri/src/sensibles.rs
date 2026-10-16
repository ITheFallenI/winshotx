//! Encontrar datos personales dentro de lo que dice una captura, para poder taparlos.
//!
//! Es lo único que la Herramienta de Recortes hace y winshotx no: ella detecta correos y
//! teléfonos sola y los tapa de un clic. Aquí el lector de texto de Windows ya estaba
//! puesto (la tecla `T` copia lo que pone en la captura), así que lo que faltaba no era el
//! motor, era decidir qué de lo leído es un dato que no debería salir en una captura.
//!
//! **Todo lo de aquí se valida, no se reconoce por la forma.** Un número de dieciséis
//! cifras no es una tarjeta: lo es si pasa el dígito de control de Luhn. Veintidós
//! caracteres que empiezan por ES no son un IBAN: lo son si cuadra su resto entre noventa y
//! siete. Ocho cifras y una letra no son un DNI: lo son si la letra es la que le toca a ese
//! número. Sin eso, taparía la mitad de los números de cualquier factura, y una herramienta
//! que tapa de más se apaga el primer día.
//!
//! No lleva expresiones regulares a propósito: el instalador entero pesa 2,58 MB y el
//! paquete de expresiones regulares de Rust ocupa casi la mitad de eso. Lo que hay aquí son
//! funciones que se leen en voz alta.

/// Una palabra leída de la imagen, con el rectángulo donde estaba, en píxeles.
#[derive(Debug, Clone, PartialEq)]
pub struct Palabra {
    pub texto: String,
    pub x: f32,
    pub y: f32,
    pub ancho: f32,
    pub alto: f32,
}

/// Qué clase de dato se ha encontrado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Clase {
    Correo,
    Tarjeta,
    Iban,
    Documento,
    Telefono,
}

impl Clase {
    /// Cómo se llama en español, para poder decir qué se ha tapado.
    pub fn nombre(self) -> &'static str {
        match self {
            Clase::Correo => "correo",
            Clase::Tarjeta => "tarjeta",
            Clase::Iban => "cuenta bancaria",
            Clase::Documento => "documento de identidad",
            Clase::Telefono => "teléfono",
        }
    }
}

/// Un dato encontrado: qué es y qué palabras de la línea lo forman.
#[derive(Debug, Clone, PartialEq)]
pub struct Hallazgo {
    pub clase: Clase,
    /// Los índices dentro de la línea, en orden y seguidos.
    pub palabras: Vec<usize>,
}

/// Cuántas palabras seguidas se miran como un solo dato.
///
/// Cinco porque un IBAN español dictado en grupos de cuatro ocupa seis trozos, y seis
/// porque una tarjeta son cuatro y un teléfono con prefijo son tres o cuatro. Más allá de
/// ahí solo se juntan cosas que no tienen nada que ver.
const JUNTAR_HASTA: usize = 6;

/// Busca datos personales en una línea ya leída, con sus palabras en orden.
///
/// Se prueba primero la tirada más larga de palabras seguidas, porque un dato partido en
/// trozos (una tarjeta en grupos de cuatro) solo se reconoce entero: mirando trozo a trozo,
/// «4539» no es nada. Lo que se da por bueno se marca y no se vuelve a mirar.
pub fn buscar_en_linea(linea: &[Palabra]) -> Vec<Hallazgo> {
    let mut hallazgos = Vec::new();
    let mut i = 0;
    while i < linea.len() {
        let mut encontrado = None;
        for largo in (1..=JUNTAR_HASTA.min(linea.len() - i)).rev() {
            let trozos: Vec<&str> = linea[i..i + largo].iter().map(|p| p.texto.as_str()).collect();
            if let Some(clase) = clasificar(&trozos) {
                encontrado = Some((clase, largo));
                break;
            }
        }
        match encontrado {
            Some((clase, largo)) => {
                hallazgos.push(Hallazgo {
                    clase,
                    palabras: (i..i + largo).collect(),
                });
                i += largo;
            }
            None => i += 1,
        }
    }
    hallazgos
}

/// Qué es este grupo de palabras seguidas, si es algo.
///
/// Un grupo de varias palabras solo puede ser un dato que se escribe con espacios dentro
/// (una tarjeta, un IBAN, un teléfono). Un correo con espacios en medio no es un correo, y
/// darlo por bueno taparía media frase cada vez que el lector parte una palabra.
fn clasificar(trozos: &[&str]) -> Option<Clase> {
    let limpios: Vec<&str> = trozos.iter().map(|t| sin_bordes(t)).collect();
    if limpios.iter().any(|t| t.is_empty()) {
        return None;
    }
    if limpios.len() == 1 {
        let solo = limpios[0];
        if es_correo(solo) {
            return Some(Clase::Correo);
        }
        if es_documento(solo) {
            return Some(Clase::Documento);
        }
    }
    let pegado: String = limpios.concat();
    if es_iban(&pegado) {
        return Some(Clase::Iban);
    }
    let digitos: String = pegado.chars().filter(|c| c.is_ascii_digit()).collect();
    // Solo cuenta si lo que había eran dígitos y separadores: si entre medias hay letras,
    // esto es una frase con números dentro, no un número escrito a trozos.
    let solo_numero = pegado
        .chars()
        .all(|c| c.is_ascii_digit() || c == '-' || c == '.' || c == '+' || c == '/');
    if solo_numero {
        if es_tarjeta(&digitos) {
            return Some(Clase::Tarjeta);
        }
        if es_telefono(&pegado, &digitos) {
            return Some(Clase::Telefono);
        }
    }
    None
}

/// Quita la puntuación de los bordes, que el lector se trae pegada a la palabra.
fn sin_bordes(texto: &str) -> &str {
    texto.trim_matches(|c: char| {
        matches!(c, ',' | ';' | ':' | '(' | ')' | '[' | ']' | '«' | '»' | '"' | '\'' | '¿' | '?' | '¡' | '!')
            || (c == '.' && false)
    })
    .trim_end_matches('.')
    .trim_start_matches('.')
}

/// Un correo de verdad: algo, una arroba, algo con un punto y un final de al menos dos letras.
fn es_correo(texto: &str) -> bool {
    let Some((antes, despues)) = texto.split_once('@') else {
        return false;
    };
    if antes.is_empty() || despues.is_empty() || despues.contains('@') {
        return false;
    }
    if antes.chars().any(|c| c.is_whitespace()) || despues.chars().any(|c| c.is_whitespace()) {
        return false;
    }
    let Some((dominio, final_)) = despues.rsplit_once('.') else {
        return false;
    };
    !dominio.is_empty() && final_.len() >= 2 && final_.chars().all(|c| c.is_ascii_alphabetic())
}

/// La letra que le toca a un DNI. El orden de la cadena ES la tabla oficial.
const LETRAS_DNI: &[u8; 23] = b"TRWAGMYFPDXBNJZSQVHLCKE";

/// DNI o NIE, con su letra comprobada.
///
/// La letra no es decorativa: es el resto de dividir el número entre veintitrés. Por eso
/// «12345678A» no es un DNI y «12345678Z» sí, y por eso esto no tapa cualquier número de
/// ocho cifras que aparezca en una factura.
fn es_documento(texto: &str) -> bool {
    let limpio: String = texto
        .chars()
        .filter(|c| !matches!(c, '-' | ' ' | '.'))
        .collect::<String>()
        .to_ascii_uppercase();
    let bytes = limpio.as_bytes();
    if bytes.len() != 9 {
        return false;
    }
    let (numero, letra) = bytes.split_at(8);
    let letra = letra[0];
    if !letra.is_ascii_alphabetic() {
        return false;
    }
    // El NIE cambia su primera letra por un dígito: X vale 0, Y vale 1 y Z vale 2.
    let mut cifras = String::with_capacity(8);
    for (i, b) in numero.iter().enumerate() {
        match (i, b) {
            (0, b'X') => cifras.push('0'),
            (0, b'Y') => cifras.push('1'),
            (0, b'Z') => cifras.push('2'),
            (_, c) if c.is_ascii_digit() => cifras.push(*c as char),
            _ => return false,
        }
    }
    let Ok(valor) = cifras.parse::<u32>() else {
        return false;
    };
    LETRAS_DNI[(valor % 23) as usize] == letra
}

/// Una tarjeta: entre trece y diecinueve cifras que pasan el dígito de control de Luhn.
///
/// Luhn es la suma que llevan dentro todas las tarjetas: se dobla una cifra sí y otra no
/// desde el final, y el total tiene que ser múltiplo de diez. Un número inventado la pasa
/// una vez de cada diez, así que esto no es una garantía, pero quita el 90 % de los
/// números largos que no son tarjetas.
fn es_tarjeta(digitos: &str) -> bool {
    if !(13..=19).contains(&digitos.len()) {
        return false;
    }
    let mut suma = 0u32;
    for (i, c) in digitos.chars().rev().enumerate() {
        let mut d = c.to_digit(10).unwrap_or(0);
        if i % 2 == 1 {
            d *= 2;
            if d > 9 {
                d -= 9;
            }
        }
        suma += d;
    }
    suma % 10 == 0
}

/// Un IBAN: dos letras de país, dos de control, y el resto cuadrando en el módulo 97.
///
/// La cuenta oficial: se llevan los cuatro primeros caracteres al final, cada letra se
/// cambia por su número (A es 10, B es 11... Z es 35) y el número gigante que sale tiene
/// que dar resto uno al dividirlo entre noventa y siete. Se va dividiendo por trozos
/// porque el número no cabe en ningún entero.
fn es_iban(texto: &str) -> bool {
    let limpio: String = texto
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_uppercase();
    if !(15..=34).contains(&limpio.len()) {
        return false;
    }
    let bytes = limpio.as_bytes();
    if !bytes[0].is_ascii_alphabetic()
        || !bytes[1].is_ascii_alphabetic()
        || !bytes[2].is_ascii_digit()
        || !bytes[3].is_ascii_digit()
    {
        return false;
    }
    let movido = format!("{}{}", &limpio[4..], &limpio[..4]);
    let mut resto = 0u32;
    for c in movido.chars() {
        let valor = if c.is_ascii_digit() {
            c.to_digit(10).unwrap()
        } else if c.is_ascii_alphabetic() {
            c as u32 - 'A' as u32 + 10
        } else {
            return false;
        };
        // Dos pasos porque una letra añade dos cifras de golpe.
        resto = if valor > 9 {
            (resto * 100 + valor) % 97
        } else {
            (resto * 10 + valor) % 97
        };
    }
    resto == 1
}

/// Un teléfono español: nueve cifras que empiezan por 6, 7, 8 o 9, con o sin el +34.
///
/// Se queda en el formato de aquí a propósito. Un «nueve cifras cualquiera» taparía
/// números de factura, códigos de pedido y fechas pegadas, y lo que se gana tapando el
/// teléfono de un país que no es el tuyo no compensa tapar media pantalla.
fn es_telefono(pegado: &str, digitos: &str) -> bool {
    let nacional = if let Some(resto) = digitos.strip_prefix("34") {
        // El 34 solo cuenta como prefijo si venía escrito como prefijo.
        if pegado.starts_with('+') || pegado.starts_with("0034") || digitos.len() == 11 {
            resto
        } else {
            digitos
        }
    } else {
        digitos
    };
    let nacional = nacional.strip_prefix("00").unwrap_or(nacional);
    nacional.len() == 9 && matches!(nacional.as_bytes()[0], b'6' | b'7' | b'8' | b'9')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn palabras(frase: &str) -> Vec<Palabra> {
        // Cajas de mentira en fila, que es lo que importa para agrupar: lo que se prueba
        // aquí es QUÉ se detecta, no dónde estaba en la pantalla.
        frase
            .split_whitespace()
            .enumerate()
            .map(|(i, t)| Palabra {
                texto: t.to_string(),
                x: i as f32 * 50.0,
                y: 0.0,
                ancho: 40.0,
                alto: 12.0,
            })
            .collect()
    }

    fn clases(frase: &str) -> Vec<Clase> {
        buscar_en_linea(&palabras(frase))
            .into_iter()
            .map(|h| h.clase)
            .collect()
    }

    #[test]
    fn un_correo_se_ve_y_la_frase_de_al_lado_no() {
        let linea = palabras("escribe a munir.torres@example.com antes del jueves");
        let hallados = buscar_en_linea(&linea);
        assert_eq!(hallados.len(), 1, "solo hay un dato en esa línea");
        assert_eq!(hallados[0].clase, Clase::Correo);
        assert_eq!(hallados[0].palabras, vec![2], "solo la palabra del correo");
    }

    #[test]
    fn lo_que_lleva_arroba_pero_no_es_un_correo_se_queda() {
        for falso in ["@munito", "hola@", "a@b", "correo @ example.com", "@"] {
            assert!(
                clases(falso).is_empty(),
                "«{falso}» no es un correo y se ha tapado"
            );
        }
    }

    /// El dígito de control es lo que separa una tarjeta de dieciséis cifras cualesquiera.
    #[test]
    fn una_tarjeta_de_verdad_si_y_una_inventada_no() {
        // Número de pruebas de Visa, de los que publica la propia pasarela de pago.
        assert_eq!(clases("4539578763621486"), vec![Clase::Tarjeta]);
        assert!(
            clases("4539578763621487").is_empty(),
            "ese número no pasa Luhn y no debería taparse"
        );
    }

    #[test]
    fn una_tarjeta_escrita_en_grupos_de_cuatro_se_junta() {
        let linea = palabras("pago con 4539 5787 6362 1486 gracias");
        let hallados = buscar_en_linea(&linea);
        assert_eq!(hallados.len(), 1);
        assert_eq!(hallados[0].clase, Clase::Tarjeta);
        assert_eq!(
            hallados[0].palabras,
            vec![2, 3, 4, 5],
            "los cuatro grupos son UN dato, no cuatro"
        );
    }

    #[test]
    fn un_iban_cuadra_o_no_se_tapa() {
        assert_eq!(clases("ES9121000418450200051332"), vec![Clase::Iban]);
        assert_eq!(
            clases("ES91 2100 0418 4502 0005 1332"),
            vec![Clase::Iban],
            "dictado en grupos es el mismo IBAN"
        );
        assert!(
            clases("ES9121000418450200051333").is_empty(),
            "ese resto no da uno: no es un IBAN"
        );
    }

    #[test]
    fn el_dni_se_comprueba_por_su_letra() {
        assert_eq!(clases("12345678Z"), vec![Clase::Documento]);
        assert_eq!(clases("12345678-Z"), vec![Clase::Documento]);
        assert!(
            clases("12345678A").is_empty(),
            "la letra que no toca no es un DNI"
        );
        assert_eq!(clases("X1234567L"), vec![Clase::Documento], "y el NIE también");
    }

    #[test]
    fn un_telefono_de_aqui_si_y_un_numero_de_factura_no() {
        assert_eq!(clases("600123456"), vec![Clase::Telefono]);
        assert_eq!(clases("600 12 34 56"), vec![Clase::Telefono]);
        assert_eq!(clases("+34 600123456"), vec![Clase::Telefono]);
        assert!(
            clases("123456789").is_empty(),
            "nueve cifras que no empiezan por 6, 7, 8 o 9 son otra cosa"
        );
        assert!(
            clases("20260215").is_empty(),
            "una fecha pegada no es un teléfono"
        );
    }

    /// Lo que más importa de todo: que una pantalla normal no se llene de cuadrados.
    #[test]
    fn una_captura_corriente_no_tiene_nada_que_tapar() {
        let normales = [
            "Archivo Editar Ver Ayuda",
            "Total 1.234,56 euros IVA incluido",
            "Pedido 2026 10 16 entregado",
            "winshotx 0.2.28 ocupa 2,58 MB",
            "Lunes 16 de octubre de 2026",
            "127.0.0.1:5173",
        ];
        for frase in normales {
            assert!(
                clases(frase).is_empty(),
                "«{frase}» no lleva datos personales y se ha tapado algo"
            );
        }
    }

    #[test]
    fn dos_datos_en_la_misma_linea_salen_los_dos() {
        let hallados = buscar_en_linea(&palabras("hola@example.com y 600123456"));
        assert_eq!(hallados.len(), 2);
        assert_eq!(hallados[0].clase, Clase::Correo);
        assert_eq!(hallados[1].clase, Clase::Telefono);
    }

    #[test]
    fn la_puntuacion_pegada_no_estropea_el_dato() {
        assert_eq!(clases("(hola@example.com),"), vec![Clase::Correo]);
        assert_eq!(clases("«12345678Z»"), vec![Clase::Documento]);
    }

    #[test]
    fn una_linea_vacia_no_revienta() {
        assert!(buscar_en_linea(&[]).is_empty());
    }
}

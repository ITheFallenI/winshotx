/**
 * Quedarse con un trozo de la captura antes de exportarla.
 *
 * El editor ya recortaba el TIEMPO con los marcadores A y B; esto es la otra mitad. En una
 * foto siempre se puede volver a capturar, pero una grabación de tres minutos con el
 * encuadre torcido no se repite: o se recorta, o se tira.
 *
 * **Las coordenadas van de 0 a 1**, como las de las anotaciones y por lo mismo: quien
 * arrastra el marco lo hace sobre una vista previa que casi nunca mide lo que va a medir
 * el archivo.
 */
export interface Recorte {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Las dos esquinas ordenadas y metidas dentro de [0, 1]. */
export function ordenar(r: Recorte): Recorte {
  const dentro = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x1: dentro(Math.min(r.x1, r.x2)),
    y1: dentro(Math.min(r.y1, r.y2)),
    x2: dentro(Math.max(r.x1, r.x2)),
    y2: dentro(Math.max(r.y1, r.y2)),
  };
}

/**
 * Cuánto mide el trozo en píxeles de una captura de ese tamaño.
 *
 * Nunca menos de dos píxeles por lado: H.264 no acepta un lado impar y tampoco tiene
 * sentido exportar un vídeo de un píxel de ancho.
 */
export function medida(r: Recorte, ancho: number, alto: number): { width: number; height: number } {
  const o = ordenar(r);
  return {
    width: Math.max(2, Math.round((o.x2 - o.x1) * ancho)),
    height: Math.max(2, Math.round((o.y2 - o.y1) * alto)),
  };
}

/**
 * Si el marco de verdad recorta algo.
 *
 * Un arrastre de dos píxeles sin querer, o uno que abarca la captura entera, no es un
 * recorte: es trabajo para no cambiar nada, y además dejaría el editor diciendo que hay un
 * recorte puesto cuando no lo hay.
 */
export function recortaAlgo(r: Recorte): boolean {
  const o = ordenar(r);
  return o.x2 - o.x1 > 0.01 && o.y2 - o.y1 > 0.01 && (o.x2 - o.x1 < 0.995 || o.y2 - o.y1 < 0.995);
}

/**
 * Las proporciones que se piden de verdad, y en el orden en que se piden.
 *
 * Vertical primero porque es lo que se graba para el movil (Reels, Shorts, TikTok) y es
 * justo lo que una captura de pantalla NUNCA es: todo lo que se graba de un monitor sale
 * apaisado, asi que llegar a 9:16 siempre pasa por recortar.
 */
export const PROPORCIONES: { id: string; valor: number }[] = [
  { id: "9:16", valor: 9 / 16 },
  { id: "4:5", valor: 4 / 5 },
  { id: "1:1", valor: 1 },
  { id: "16:9", valor: 16 / 9 },
];

/**
 * El trozo mas grande con esa proporcion que cabe en la captura, centrado.
 *
 * Centrado y no en una esquina porque lo que importa casi siempre esta en medio, y porque
 * desde el centro se arrastra a cualquier lado con el mismo gesto. Las coordenadas salen
 * de 0 a 1, como todo lo que viaja de aqui a Rust.
 */
export function conProporcion(proporcion: number, ancho: number, alto: number): Recorte {
  const deLaCaptura = ancho / alto;
  // Mas ancha que la captura: manda el ancho y sobra alto. Mas estrecha: al reves.
  const fw = proporcion >= deLaCaptura ? 1 : proporcion / deLaCaptura;
  const fh = proporcion >= deLaCaptura ? deLaCaptura / proporcion : 1;
  return {
    x1: (1 - fw) / 2,
    y1: (1 - fh) / 2,
    x2: (1 + fw) / 2,
    y2: (1 + fh) / 2,
  };
}

/**
 * Que proporcion tiene ahora mismo el recorte, para poder marcar el boton que la puso.
 *
 * Se mide en pixeles de la captura y no en el 0 a 1: en una pantalla de 1920x1080, un
 * marco que ocupa la mitad de ancho y la mitad de alto es 16:9, no 1:1.
 */
export function proporcionDe(r: Recorte, ancho: number, alto: number): number {
  const { width, height } = medida(r, ancho, alto);
  return width / height;
}

/** Si esa proporcion es, a ojo de cualquiera, la que tiene el recorte puesto. */
export function esLaProporcion(valor: number, r: Recorte, ancho: number, alto: number): boolean {
  const ahora = proporcionDe(r, ancho, alto);
  // Un uno por ciento: el recorte se guarda en tanto por uno y al llevarlo a pixeles
  // redondea, asi que una comparacion exacta no se cumpliria nunca.
  return Math.abs(ahora - valor) / valor < 0.01;
}

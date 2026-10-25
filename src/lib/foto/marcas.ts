/**
 * Las marcas del editor de imágenes (PNG y JPG) y la geometría para tocarlas.
 *
 * **Aquí todo va en píxeles de la captura**, no de 0 a 1 como en el editor de vídeo. Con
 * zoom, desplazamiento, recorte escrito a mano y «mover un píxel con las flechas», el 0 a 1
 * obligaba a convertir en cada sitio; en píxeles cada número dice lo que parece.
 */

export type HerramientaFoto =
  | "select"
  | "crop"
  | "hand"
  | "arrow"
  | "shape"
  | "text"
  | "step"
  | "highlight"
  | "pen"
  | "pixelate";

export type TipoMarca = "arrow" | "shape" | "text" | "step" | "highlight" | "pen" | "pixelate";
export type Puntas = "end" | "both" | "none";
export type Forma = "rect" | "round" | "ellipse";
export type Punto = [number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Marca {
  id: number;
  kind: TipoMarca;
  /** Primer punto: donde empieza el arrastre, la esquina de arriba del texto o el centro del paso. */
  x1: number;
  y1: number;
  /** Segundo punto: donde se soltó. En el texto y el paso coincide con el primero. */
  x2: number;
  y2: number;
  color: string;
  /** Grosor del trazo, en píxeles de la captura. */
  grosor: number;
  puntas?: Puntas;
  /** Borde blanco alrededor, para que se lea sobre cualquier fondo. */
  contorno?: boolean;
  forma?: Forma;
  relleno?: boolean;
  texto?: string;
  /** Alto de la letra en el texto, o radio del disco en el paso. */
  tamano?: number;
  /** Texto sobre una pastilla de su color en vez de letras sueltas. */
  fondo?: boolean;
  numero?: number;
  puntos?: Punto[];
  oculta?: boolean;
  /** Tipo de letra del texto, de `FUENTES`. */
  fuente?: string;
  negrita?: boolean;
  cursiva?: boolean;
  /** La carpeta de capas en la que está, si está en una. */
  grupo?: number;
  /** Bloqueada: se ve y se guarda, pero en la imagen no se puede elegir, mover ni borrar. */
  bloqueada?: boolean;
}

/** Una carpeta de capas: junta marcas para esconderlas, moverlas o borrarlas a la vez. */
export interface Grupo {
  id: number;
  nombre: string;
  oculto?: boolean;
  /** Plegada en el panel de capas. */
  plegado?: boolean;
  /** Bloquea todo lo que tiene dentro. */
  bloqueado?: boolean;
}

export interface DocFoto {
  marcas: Marca[];
  grupos: Grupo[];
  /** El trozo que se queda, en píxeles. null = la captura entera. */
  recorte: Rect | null;
}

/** Lo que recuerda cada herramienta de una vez para otra. */
export interface Estilo {
  color: string;
  grosor: number;
  puntas: Puntas;
  contorno: boolean;
  forma: Forma;
  relleno: boolean;
  tamano: number;
  fondo: boolean;
  fuente: string;
  negrita: boolean;
  cursiva: boolean;
}

export const PALETA = ["#000000", "#ffffff", "#ef4444", "#f97316", "#fbbf24", "#22c55e", "#0a9bff", "#8b5cf6"];

/**
 * Los tipos de letra que se ofrecen. Pocos y que vengan con Windows: una lista con los
 * doscientos instalados es imposible de recorrer, y una fuente que no está en el equipo de
 * quien abre el archivo no importa, porque el texto se guarda ya convertido en píxeles.
 */
export const FUENTES = [
  "Segoe UI",
  "Arial",
  "Verdana",
  "Georgia",
  "Times New Roman",
  "Consolas",
  "Comic Sans MS",
  "Impact",
  "Segoe Print",
];

/**
 * Cuánto se agranda todo según el tamaño de la captura.
 *
 * Una flecha de 6 píxeles se ve bien en una ventana de 800 de ancho y es un pelo en una
 * pantalla 4K entera, que el editor enseña reducida a un tercio.
 */
export function escalaBase(ancho: number, alto: number): number {
  return Math.min(4, Math.max(0.75, Math.min(ancho, alto) / 700));
}

export function estiloInicial(tipo: TipoMarca, escala: number): Estilo {
  return {
    // El texto sale negro: es lo que se espera de un texto. Lo demás sale rojo, que es lo
    // que se ve sobre cualquier captura.
    color: tipo === "highlight" ? "#fbbf24" : tipo === "step" ? "#0a9bff" : tipo === "text" ? "#000000" : "#ef4444",
    grosor: Math.round((tipo === "pen" ? 4 : tipo === "shape" ? 4 : 6) * escala),
    puntas: "end",
    contorno: true,
    forma: "rect",
    relleno: false,
    tamano: Math.round((tipo === "step" ? 16 : 28) * escala),
    fondo: false,
    fuente: FUENTES[0],
    negrita: true,
    cursiva: false,
  };
}

export const esDeCaja = (m: Marca) => m.kind === "shape" || m.kind === "highlight" || m.kind === "pixelate";

/** Las dos esquinas de una marca de caja, ordenadas. */
export function rectDe(m: Marca): Rect {
  return {
    x: Math.min(m.x1, m.x2),
    y: Math.min(m.y1, m.y2),
    w: Math.abs(m.x2 - m.x1),
    h: Math.abs(m.y2 - m.y1),
  };
}

let medidor: CanvasRenderingContext2D | null | undefined;

/** Cómo se escribe el texto de una marca: lo que hay que darle a `ctx.font`. */
export type Letra = Pick<Marca, "fuente" | "negrita" | "cursiva">;

export const fuenteDeTexto = (tamano: number, letra: Letra = {}) =>
  `${letra.cursiva ? "italic " : ""}${letra.negrita === false ? 400 : 700} ${tamano}px "${letra.fuente ?? FUENTES[0]}", system-ui, sans-serif`;

/** Lo que mide un texto, con el mismo tipo de letra con el que se pinta. */
export function medirTexto(texto: string, tamano: number, letra: Letra = {}): { w: number; h: number } {
  const lineas = texto.split("\n");
  if (medidor === undefined) medidor = document.createElement("canvas").getContext("2d");
  let ancho: number;
  if (medidor) {
    medidor.font = fuenteDeTexto(tamano, letra);
    ancho = Math.max(...lineas.map((l) => medidor!.measureText(l).width));
  } else {
    // Sin lienzo (las pruebas): una media razonable del ancho de una letra.
    ancho = Math.max(...lineas.map((l) => l.length)) * tamano * 0.58;
  }
  return { w: Math.max(tamano * 0.6, ancho), h: lineas.length * tamano * 1.2 };
}

/** Lo que se aparta la pastilla del texto por cada lado. */
export const aireDeFondo = (tamano: number) => Math.round(tamano * 0.3);

/** La caja que ocupa una marca, para seleccionarla y para la lista de capas. */
export function cajaDe(m: Marca): Rect {
  switch (m.kind) {
    case "step": {
      const r = m.tamano ?? 16;
      return { x: m.x1 - r, y: m.y1 - r, w: r * 2, h: r * 2 };
    }
    case "text": {
      const t = m.tamano ?? 28;
      const { w, h } = medirTexto(m.texto ?? "", t, m);
      const aire = m.fondo ? aireDeFondo(t) : 0;
      return { x: m.x1 - aire, y: m.y1 - aire, w: w + aire * 2, h: h + aire * 2 };
    }
    case "pen": {
      const ps = m.puntos?.length ? m.puntos : [[m.x1, m.y1] as Punto];
      const xs = ps.map((p) => p[0]);
      const ys = ps.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case "arrow":
      return rectDe(m);
    default:
      return rectDe(m);
  }
}

export function distanciaAlSegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Si el punto toca la marca. `tolerancia` va en píxeles de la captura: quien llama la
 * divide por el zoom, para que sean siempre los mismos píxeles de pantalla.
 */
export function toca(m: Marca, p: Punto, tolerancia: number): boolean {
  if (m.oculta) return false;
  if (m.kind === "arrow") return distanciaAlSegmento(p, [m.x1, m.y1], [m.x2, m.y2]) <= tolerancia + m.grosor / 2;
  if (m.kind === "pen") {
    const ps = m.puntos ?? [];
    return ps.some((q, i) => distanciaAlSegmento(p, ps[Math.max(0, i - 1)], q) <= tolerancia + m.grosor / 2);
  }
  if (m.kind === "shape" && !m.relleno) {
    // Un rectángulo hueco se coge por el borde: así se puede pinchar lo que hay dentro.
    const r = rectDe(m);
    const dentroGrande = p[0] >= r.x - tolerancia && p[0] <= r.x + r.w + tolerancia &&
      p[1] >= r.y - tolerancia && p[1] <= r.y + r.h + tolerancia;
    const margen = tolerancia + m.grosor;
    const dentroChico = p[0] > r.x + margen && p[0] < r.x + r.w - margen &&
      p[1] > r.y + margen && p[1] < r.y + r.h - margen;
    return dentroGrande && !dentroChico;
  }
  const c = cajaDe(m);
  return p[0] >= c.x - tolerancia && p[0] <= c.x + c.w + tolerancia &&
    p[1] >= c.y - tolerancia && p[1] <= c.y + c.h + tolerancia;
}

/** La de más arriba que toca el punto, que es la que se ve. */
export function marcaEn(marcas: Marca[], p: Punto, tolerancia: number): Marca | null {
  for (let i = marcas.length - 1; i >= 0; i--) if (toca(marcas[i], p, tolerancia)) return marcas[i];
  return null;
}

export type Asa = "p1" | "p2" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Los tiradores de una marca: los dos extremos en la flecha, las esquinas en lo demás. */
export function asasDe(m: Marca): [Asa, number, number][] {
  if (m.kind === "arrow") return [["p1", m.x1, m.y1], ["p2", m.x2, m.y2]];
  if (m.kind === "step") return [];
  const c = cajaDe(m);
  const esquinas: [Asa, number, number][] = [
    ["nw", c.x, c.y], ["ne", c.x + c.w, c.y], ["se", c.x + c.w, c.y + c.h], ["sw", c.x, c.y + c.h],
  ];
  if (!esDeCaja(m)) return esquinas;
  return [
    ...esquinas,
    ["n", c.x + c.w / 2, c.y], ["e", c.x + c.w, c.y + c.h / 2], ["s", c.x + c.w / 2, c.y + c.h], ["w", c.x, c.y + c.h / 2],
  ];
}

export function moverMarca(m: Marca, dx: number, dy: number): Marca {
  return {
    ...m,
    x1: m.x1 + dx,
    y1: m.y1 + dy,
    x2: m.x2 + dx,
    y2: m.y2 + dy,
    ...(m.puntos ? { puntos: m.puntos.map(([x, y]) => [x + dx, y + dy] as Punto) } : {}),
  };
}

/** Lleva un lado de una caja hasta el punto, sin darle la vuelta. */
export function estirarRect(c: Rect, asa: Asa, p: Punto, minimo = 4): Rect {
  let [l, t, r, b] = [c.x, c.y, c.x + c.w, c.y + c.h];
  if (asa.includes("w")) l = Math.min(p[0], r - minimo);
  if (asa.includes("e")) r = Math.max(p[0], l + minimo);
  if (asa.includes("n")) t = Math.min(p[1], b - minimo);
  if (asa.includes("s")) b = Math.max(p[1], t + minimo);
  return { x: l, y: t, w: r - l, h: b - t };
}

/** Cambiar una marca tirando de uno de sus tiradores, desde como estaba al empezar. */
export function estirarMarca(original: Marca, asa: Asa, p: Punto): Marca {
  if (asa === "p1") return { ...original, x1: p[0], y1: p[1] };
  if (asa === "p2") return { ...original, x2: p[0], y2: p[1] };
  const antes = cajaDe(original);
  const despues = estirarRect(antes, asa, p);
  if (original.kind === "text") {
    // El texto no se deforma: crece o encoge entero, según lo que se estire en alto.
    const factor = despues.h / Math.max(1, antes.h);
    const tamano = Math.max(6, Math.min(600, Math.round((original.tamano ?? 28) * factor)));
    const nueva = { ...original, tamano };
    const caja = cajaDe(nueva);
    // Se queda quieta la esquina contraria a la que se arrastra.
    const x = asa.includes("w") ? antes.x + antes.w - caja.w : antes.x;
    const y = asa.includes("n") ? antes.y + antes.h - caja.h : antes.y;
    return moverMarca(nueva, x - caja.x, y - caja.y);
  }
  if (esDeCaja(original)) return { ...original, x1: despues.x, y1: despues.y, x2: despues.x + despues.w, y2: despues.y + despues.h };
  // El pincel se escala entero.
  const sx = despues.w / Math.max(1, antes.w);
  const sy = despues.h / Math.max(1, antes.h);
  const f = ([x, y]: Punto): Punto => [despues.x + (x - antes.x) * sx, despues.y + (y - antes.y) * sy];
  const [a, b] = [f([original.x1, original.y1]), f([original.x2, original.y2])];
  return { ...original, x1: a[0], y1: a[1], x2: b[0], y2: b[1], puntos: original.puntos?.map(f) };
}

/** Los pasos se numeran solos, en el orden en que están, para que nunca haya dos treses. */
export function renumerar(marcas: Marca[]): Marca[] {
  let n = 0;
  return marcas.map((m) => (m.kind === "step" ? (m.numero === ++n ? m : { ...m, numero: n }) : m));
}

/** Que la flecha caiga en ángulos de 15 grados, con Mayús. */
export function anguloRedondo(origen: Punto, p: Punto): Punto {
  const paso = Math.PI / 12;
  const a = Math.round(Math.atan2(p[1] - origen[1], p[0] - origen[0]) / paso) * paso;
  const largo = Math.hypot(p[0] - origen[0], p[1] - origen[1]);
  return [origen[0] + Math.cos(a) * largo, origen[1] + Math.sin(a) * largo];
}

/** Un cuadrado o un círculo perfecto, con Mayús. */
export function ladoIgual(origen: Punto, p: Punto): Punto {
  const lado = Math.max(Math.abs(p[0] - origen[0]), Math.abs(p[1] - origen[1]));
  return [origen[0] + Math.sign(p[0] - origen[0] || 1) * lado, origen[1] + Math.sign(p[1] - origen[1] || 1) * lado];
}

/** Mete un recorte dentro de la captura y con un mínimo de lado. */
export function meterRect(r: Rect, ancho: number, alto: number): Rect {
  const w = Math.max(8, Math.min(ancho, Math.round(r.w)));
  const h = Math.max(8, Math.min(alto, Math.round(r.h)));
  return {
    x: Math.round(Math.min(ancho - w, Math.max(0, r.x))),
    y: Math.round(Math.min(alto - h, Math.max(0, r.y))),
    w,
    h,
  };
}

/** El trozo más grande con esa proporción que cabe, centrado. */
export function rectConProporcion(proporcion: number, ancho: number, alto: number): Rect {
  let w = ancho;
  let h = w / proporcion;
  if (h > alto) {
    h = alto;
    w = h * proporcion;
  }
  return { x: Math.round((ancho - w) / 2), y: Math.round((alto - h) / 2), w: Math.round(w), h: Math.round(h) };
}

/** Si el recorte deja fuera algo, o es la captura entera con otro nombre. */
export const recortaAlgo = (r: Rect | null, ancho: number, alto: number) =>
  !!r && (r.x > 0 || r.y > 0 || r.w < ancho || r.h < alto);

/**
 * Las marcas tal y como se ven: las de una carpeta escondida cuentan como escondidas. Es lo
 * que se pinta, lo que se puede pinchar y lo que se guarda.
 */
export function marcasVisibles(doc: DocFoto): Marca[] {
  const ocultos = new Set(doc.grupos.filter((g) => g.oculto).map((g) => g.id));
  if (!ocultos.size) return doc.marcas;
  return doc.marcas.map((m) => (m.grupo !== undefined && ocultos.has(m.grupo) && !m.oculta ? { ...m, oculta: true } : m));
}

/** Si está bloqueada, por ella misma o por su carpeta. */
export function estaBloqueada(m: Marca, grupos: Grupo[]): boolean {
  return !!m.bloqueada || (m.grupo !== undefined && !!grupos.find((g) => g.id === m.grupo)?.bloqueado);
}

/**
 * Lo que pasa a una marca que sale de su carpeta: si estaba bloqueada por ella, se lleva el
 * candado puesto. Sacar algo de una carpeta bloqueada no puede ser la forma de desbloquearlo
 * sin querer.
 */
export function conSuCandado(m: Marca, grupos: Grupo[]): Marca {
  return !m.bloqueada && estaBloqueada(m, grupos) ? { ...m, bloqueada: true } : m;
}

/**
 * Bloquea o desbloquea esas marcas, y es lo que hacen Ctrl+L, el candado del panel y el
 * clic derecho.
 *
 * - Si alguna de ellas se puede tocar, se bloquean todas. Las carpetas elegidas ENTERAS se
 *   bloquean como carpeta, que es lo que se ve en el panel; las demás, una a una.
 * - Si ya estaban todas bloqueadas, se desbloquean. Si alguna lo estaba por su carpeta, la
 *   carpeta se abre, pero sus otras marcas se quedan con su propio candado: desbloquear una
 *   no puede soltar a sus hermanas.
 */
export function alternarBloqueo(doc: DocFoto, ids: number[]): DocFoto {
  const elegidas = doc.marcas.filter((m) => ids.includes(m.id));
  if (!elegidas.length) return doc;
  if (!elegidas.every((m) => estaBloqueada(m, doc.grupos))) {
    const enteras = new Set(
      doc.grupos
        .filter((g) => {
          const suyas = doc.marcas.filter((m) => m.grupo === g.id);
          return suyas.length > 0 && suyas.every((m) => ids.includes(m.id));
        })
        .map((g) => g.id),
    );
    return {
      ...doc,
      grupos: doc.grupos.map((g) => (enteras.has(g.id) ? { ...g, bloqueado: true } : g)),
      marcas: doc.marcas.map((m) =>
        ids.includes(m.id) && !(m.grupo !== undefined && enteras.has(m.grupo)) ? { ...m, bloqueada: true } : m,
      ),
    };
  }
  const abiertas = new Set(
    elegidas.filter((m) => m.grupo !== undefined && doc.grupos.find((g) => g.id === m.grupo)?.bloqueado).map((m) => m.grupo),
  );
  return {
    ...doc,
    grupos: doc.grupos.map((g) => (abiertas.has(g.id) ? { ...g, bloqueado: false } : g)),
    marcas: doc.marcas.map((m) =>
      ids.includes(m.id) ? { ...m, bloqueada: false } : m.grupo !== undefined && abiertas.has(m.grupo) ? { ...m, bloqueada: true } : m,
    ),
  };
}

/** Las que se pueden tocar en la imagen: las que se ven y no están bloqueadas. */
export function marcasTocables(doc: DocFoto): Marca[] {
  return marcasVisibles(doc).filter((m) => !m.oculta && !estaBloqueada(m, doc.grupos));
}

/** Las de la misma carpeta que esas, para elegirlas juntas. */
export function conSuGrupo(marcas: Marca[], ids: number[]): number[] {
  const grupos = new Set(marcas.filter((m) => ids.includes(m.id) && m.grupo !== undefined).map((m) => m.grupo));
  if (!grupos.size) return ids;
  return [...new Set([...ids, ...marcas.filter((m) => m.grupo !== undefined && grupos.has(m.grupo)).map((m) => m.id)])];
}

/**
 * Mete esas marcas en una carpeta. Se colocan encima de lo que ya tenía la carpeta, para
 * que lo de dentro quede junto; en una carpeta vacía van arriba del todo, que es donde el
 * panel la enseña.
 */
export function meterEnGrupo(doc: DocFoto, ids: number[], grupo: number): DocFoto {
  const moviendo = doc.marcas.filter((m) => ids.includes(m.id)).map((m) => ({ ...conSuCandado(m, doc.grupos), grupo }));
  if (!moviendo.length) return doc;
  const resto = doc.marcas.filter((m) => !ids.includes(m.id));
  let ultima = -1;
  resto.forEach((m, i) => m.grupo === grupo && (ultima = i));
  const donde = ultima >= 0 ? ultima + 1 : resto.length;
  return { ...doc, marcas: renumerar([...resto.slice(0, donde), ...moviendo, ...resto.slice(donde)]) };
}

/**
 * Pone esas marcas justo encima (o debajo) de otra, y en su misma carpeta: es soltarlas
 * sobre ella en el panel de capas.
 */
export function ponerJunto(doc: DocFoto, ids: number[], objetivo: number, encima = true): DocFoto {
  const destino = doc.marcas.find((m) => m.id === objetivo);
  if (!destino || ids.includes(objetivo)) return doc;
  const moviendo = doc.marcas.filter((m) => ids.includes(m.id)).map((m) => ({ ...conSuCandado(m, doc.grupos), grupo: destino.grupo }));
  const resto = doc.marcas.filter((m) => !ids.includes(m.id));
  const donde = resto.findIndex((m) => m.id === objetivo) + (encima ? 1 : 0);
  return { ...doc, marcas: renumerar([...resto.slice(0, donde), ...moviendo, ...resto.slice(donde)]) };
}

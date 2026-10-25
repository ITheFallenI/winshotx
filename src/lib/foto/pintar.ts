/**
 * Quien dibuja las marcas sobre los píxeles. **Es el mismo para la vista y para guardar.**
 *
 * El editor de vídeo pinta la vista previa con SVG y el archivo con Rust, y los dos nunca
 * acabaron de coincidir: la punta de la flecha medía distinto y el paso salía ovalado en
 * pantalla. Aquí la imagen que se guarda sale de esta misma función, pintada a tamaño
 * completo, así que lo que se ve es exactamente lo que sale.
 */
import { aireDeFondo, fuenteDeTexto, medirTexto, rectDe, type Marca, type Rect } from "./marcas";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Las piezas de una flecha: el palo, recortado donde empiezan las puntas, y las puntas. */
export function piezasDeFlecha(m: Marca) {
  const dx = m.x2 - m.x1;
  const dy = m.y2 - m.y1;
  const largo = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / largo, dy / largo];
  const puntas = m.puntas ?? "end";
  // La punta crece con el grosor: una flecha gorda con una punta de alfiler no apunta.
  const hl = Math.min(largo * (puntas === "both" ? 0.4 : 0.6), Math.max(12, m.grosor * 3.6));
  const hw = Math.max(10, m.grosor * 3);
  const punta = (x: number, y: number, sx: number, sy: number): [number, number][] => {
    const [bx, by] = [x - sx * hl, y - sy * hl];
    return [[x, y], [bx - (sy * hw) / 2, by + (sx * hw) / 2], [bx + (sy * hw) / 2, by - (sx * hw) / 2]];
  };
  const desde: [number, number] = puntas === "both" ? [m.x1 + ux * hl * 0.8, m.y1 + uy * hl * 0.8] : [m.x1, m.y1];
  const hasta: [number, number] = puntas === "none" ? [m.x2, m.y2] : [m.x2 - ux * hl * 0.8, m.y2 - uy * hl * 0.8];
  const cabezas: [number, number][][] = [];
  if (puntas !== "none") cabezas.push(punta(m.x2, m.y2, ux, uy));
  if (puntas === "both") cabezas.push(punta(m.x1, m.y1, -ux, -uy));
  return { desde, hasta, cabezas };
}

function poligono(ctx: Ctx, puntos: [number, number][]) {
  ctx.beginPath();
  puntos.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function flecha(ctx: Ctx, m: Marca) {
  const { desde, hasta, cabezas } = piezasDeFlecha(m);
  /** `ensanche` engorda el palo y la punta por igual: es lo que hace el borde blanco. */
  const trazo = (color: string, ensanche: number) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = m.grosor + ensanche * 2;
    ctx.beginPath();
    ctx.moveTo(...desde);
    ctx.lineTo(...hasta);
    ctx.stroke();
    // La punta lleva un trazo fino de su color para redondear las esquinas, que una punta
    // de cuchilla se ve como un fallo de dibujo.
    ctx.lineWidth = Math.max(1, m.grosor * 0.3) + ensanche * 2;
    for (const c of cabezas) {
      poligono(ctx, c);
      ctx.fill();
      ctx.stroke();
    }
  };
  if (m.contorno) trazo("#ffffff", Math.max(2, m.grosor * 0.5));
  trazo(m.color, 0);
}

function cajaRedonda(ctx: Ctx, r: Rect, radio: number) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radio);
}

function forma(ctx: Ctx, m: Marca) {
  const r = rectDe(m);
  const camino = () => {
    if (m.forma === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    } else cajaRedonda(ctx, r, m.forma === "round" ? Math.min(r.w, r.h, m.grosor * 6) / 3 : 0);
  };
  if (m.relleno) {
    camino();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = m.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineJoin = "round";
  if (m.contorno) {
    camino();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = m.grosor + Math.max(2, m.grosor * 0.6) * 2;
    ctx.stroke();
  }
  camino();
  ctx.strokeStyle = m.color;
  ctx.lineWidth = m.grosor;
  ctx.stroke();
}

/** Si un color es claro, para escribir encima en negro y no en blanco. */
export function esClaro(color: string): boolean {
  const n = parseInt(color.slice(1), 16);
  if (!Number.isFinite(n)) return false;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return r * 0.299 + g * 0.587 + b * 0.114 > 170;
}

function texto(ctx: Ctx, m: Marca) {
  const t = m.tamano ?? 28;
  const lineas = (m.texto ?? "").split("\n");
  ctx.font = fuenteDeTexto(t, m);
  ctx.textBaseline = "top";
  if (m.fondo) {
    const { w, h } = medirTexto(m.texto ?? "", t, m);
    const aire = aireDeFondo(t);
    cajaRedonda(ctx, { x: m.x1 - aire, y: m.y1 - aire, w: w + aire * 2, h: h + aire * 2 }, aire * 1.2);
    ctx.fillStyle = m.color;
    ctx.fill();
  }
  lineas.forEach((linea, i) => {
    const y = m.y1 + i * t * 1.2 + t * 0.08;
    if (!m.fondo && m.contorno) {
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, t * 0.16);
      ctx.strokeStyle = esClaro(m.color) ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.95)";
      ctx.strokeText(linea, m.x1, y);
    }
    ctx.fillStyle = m.fondo ? (esClaro(m.color) ? "#111827" : "#ffffff") : m.color;
    ctx.fillText(linea, m.x1, y);
  });
}

function paso(ctx: Ctx, m: Marca) {
  const r = m.tamano ?? 16;
  ctx.beginPath();
  ctx.arc(m.x1, m.y1, r + Math.max(2, r * 0.18), 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(m.x1, m.y1, r, 0, Math.PI * 2);
  ctx.fillStyle = m.color;
  ctx.fill();
  ctx.font = fuenteDeTexto(Math.round(r * 1.15));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = esClaro(m.color) ? "#111827" : "#ffffff";
  ctx.fillText(String(m.numero ?? 1), m.x1, m.y1 + r * 0.06);
  ctx.textAlign = "start";
}

function pincel(ctx: Ctx, m: Marca) {
  const ps = m.puntos ?? [];
  if (!ps.length) return;
  ctx.beginPath();
  ctx.moveTo(ps[0][0], ps[0][1]);
  // Por los puntos medios: suaviza el temblor del ratón sin separarse de donde se pasó.
  for (let i = 1; i < ps.length - 1; i++) {
    const [mx, my] = [(ps[i][0] + ps[i + 1][0]) / 2, (ps[i][1] + ps[i + 1][1]) / 2];
    ctx.quadraticCurveTo(ps[i][0], ps[i][1], mx, my);
  }
  const ultimo = ps[ps.length - 1];
  ctx.lineTo(ultimo[0] + (ps.length === 1 ? 0.01 : 0), ultimo[1]);
  ctx.strokeStyle = m.color;
  ctx.lineWidth = m.grosor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** Lo que mide cada cuadro del mosaico. Igual que `lado_del_mosaico` en Rust. */
export const ladoDelMosaico = (w: number, h: number) => Math.min(40, Math.max(6, Math.floor(Math.min(w, h) / 8)));

/**
 * Los mosaicos ya hechos, por zona: rehacerlos en cada movimiento del ratón cuesta, y
 * la zona no cambia mientras se dibuja otra cosa.
 */
const mosaicos = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

function lienzo(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Un mosaico de verdad, hecho con los píxeles de debajo. No es un desenfoque: lo que había
 * dentro de cada cuadro ya no está en el archivo, y eso es lo que hace falta para tapar un
 * correo o una clave.
 */
function mosaico(ctx: Ctx, m: Marca, fuente: CanvasImageSource) {
  const r = rectDe(m);
  const [x, y, w, h] = [Math.floor(r.x), Math.floor(r.y), Math.ceil(r.w), Math.ceil(r.h)];
  if (w < 2 || h < 2) return;
  const clave = `${x},${y},${w},${h}`;
  let hecho = mosaicos.get(clave);
  if (!hecho) {
    const lado = ladoDelMosaico(w, h);
    const [cw, ch] = [Math.max(1, Math.ceil(w / lado)), Math.max(1, Math.ceil(h / lado))];
    const chico = lienzo(cw, ch);
    const c = chico.getContext("2d") as Ctx | null;
    if (!c) return;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(fuente, x, y, cw * lado, ch * lado, 0, 0, cw, ch);
    hecho = chico;
    if (mosaicos.size > 64) mosaicos.clear();
    mosaicos.set(clave, hecho);
  }
  const lado = ladoDelMosaico(w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(hecho, x, y, Math.ceil(w / lado) * lado, Math.ceil(h / lado) * lado);
  ctx.restore();
}

export function pintarMarca(ctx: Ctx, m: Marca, fuente: CanvasImageSource) {
  if (m.oculta) return;
  ctx.save();
  switch (m.kind) {
    case "arrow":
      flecha(ctx, m);
      break;
    case "shape":
      forma(ctx, m);
      break;
    case "highlight": {
      const r = rectDe(m);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = m.color;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      break;
    }
    case "pixelate":
      mosaico(ctx, m, fuente);
      break;
    case "text":
      texto(ctx, m);
      break;
    case "step":
      paso(ctx, m);
      break;
    case "pen":
      pincel(ctx, m);
      break;
  }
  ctx.restore();
}

/** La captura con todas sus marcas, en el sistema de coordenadas que ya tenga `ctx`. */
export function pintarFoto(ctx: Ctx, imagen: CanvasImageSource, marcas: Marca[]) {
  ctx.drawImage(imagen, 0, 0);
  // Los mosaicos primero: tapan lo de la captura, y una flecha encima tiene que verse.
  for (const m of marcas) if (m.kind === "pixelate") pintarMarca(ctx, m, imagen);
  for (const m of marcas) if (m.kind !== "pixelate") pintarMarca(ctx, m, imagen);
}

/**
 * La foto terminada, como PNG: recortada y con las marcas, al tamaño de la captura. Es lo
 * que va a Rust para guardar y lo que va al portapapeles.
 */
export async function aplanar(imagen: CanvasImageSource & { width: number; height: number }, marcas: Marca[], recorte: Rect | null): Promise<Blob> {
  const r = recorte ?? { x: 0, y: 0, w: imagen.width, h: imagen.height };
  const destino = document.createElement("canvas");
  destino.width = Math.max(1, Math.round(r.w));
  destino.height = Math.max(1, Math.round(r.h));
  const ctx = destino.getContext("2d");
  if (!ctx) throw new Error("no se ha podido preparar la imagen");
  ctx.translate(-Math.round(r.x), -Math.round(r.y));
  pintarFoto(ctx, imagen, marcas);
  return new Promise((ok, mal) =>
    destino.toBlob((b) => (b ? ok(b) : mal(new Error("no se ha podido preparar la imagen"))), "image/png"),
  );
}

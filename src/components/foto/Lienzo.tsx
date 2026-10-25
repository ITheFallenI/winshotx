import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  anguloRedondo,
  asasDe,
  cajaDe,
  conSuGrupo,
  estaBloqueada,
  estirarMarca,
  estirarRect,
  fuenteDeTexto,
  ladoIgual,
  marcaEn,
  marcasTocables,
  marcasVisibles,
  medirTexto,
  meterRect,
  moverMarca,
  renumerar,
  type Asa,
  type DocFoto,
  type Estilo,
  type HerramientaFoto,
  type Marca,
  type Punto,
  type Rect,
  type TipoMarca,
} from "../../lib/foto/marcas";
import { pintarFoto } from "../../lib/foto/pintar";
import { aImagen, aPantalla, zoomHacia, type Vista } from "../../lib/foto/vista";
import { useT } from "../../lib/i18n";

/**
 * El lienzo del editor de imágenes: la captura con sus marcas, el zoom y lo que se toca.
 *
 * Es un `<canvas>` y no SVG porque lo que se ve tiene que ser lo que se guarda, y lo que se
 * guarda sale de `pintarFoto` sobre un lienzo. Se repinta entero en cada cambio: una
 * captura cabe en la tarjeta gráfica y repintarla es más barato que llevar la cuenta de
 * qué cambió.
 */
interface Props {
  imagen: HTMLImageElement | null;
  ancho: number;
  alto: number;
  doc: DocFoto;
  editar: (cambio: (d: DocFoto) => DocFoto) => void;
  empezar: () => void;
  terminar: () => void;
  herramienta: HerramientaFoto;
  estiloDe: (tipo: TipoMarca) => Estilo;
  seleccion: number[];
  onSeleccion: (ids: number[]) => void;
  vista: Vista;
  /** `manual` es que la persona movió o acercó: desde entonces no se reajusta sola. */
  onVista: (vista: Vista, manual: boolean) => void;
  /** El marco de recorte mientras se coloca. */
  pendiente: Rect | null;
  onPendiente: (r: Rect) => void;
  /** Ancho entre alto que tiene que guardar el marco, o null si va libre. */
  proporcion: number | null;
  /** Espacio pulsado: arrastrar mueve la vista con cualquier herramienta. */
  espacio: boolean;
  nuevoId: () => number;
  onCursor: (p: Punto | null) => void;
  onHueco: (ancho: number, alto: number) => void;
  /**
   * El tamaño al que se va a guardar, si no es el de la captura: se enseña la imagen
   * pasada por ese tamaño, para ver en el momento cuánto se pierde al reducirla.
   */
  salida: { w: number; h: number } | null;
}

type Gesto =
  | { tipo: "pan"; sx: number; sy: number; vista: Vista }
  | { tipo: "dibujar"; origen: Punto }
  | { tipo: "mover"; origen: Punto; originales: Marca[] }
  | { tipo: "asa"; asa: Asa; original: Marca }
  | { tipo: "marco"; origen: Punto; actual: Punto; base: number[] }
  | { tipo: "recorte"; modo: "nuevo" | "mover" | Asa; origen: Punto; original: Rect };

interface TextoAbierto {
  /** La marca que se está cambiando, o null si es un texto nuevo. */
  id: number | null;
  x: number;
  y: number;
  valor: string;
  estilo: Pick<Marca, "color" | "tamano" | "fondo" | "contorno" | "fuente" | "negrita" | "cursiva">;
}

const ACENTO = "#0a9bff";
/** Lo que se puede fallar al pinchar, en píxeles de pantalla. */
const TOLERANCIA = 7;

const CURSOR_DE_ASA: Record<string, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", p1: "crosshair", p2: "crosshair",
};

const TIPO_DE: Partial<Record<HerramientaFoto, TipoMarca>> = {
  arrow: "arrow", shape: "shape", text: "text", step: "step", highlight: "highlight", pen: "pen", pixelate: "pixelate",
};

export function asasDelRecorte(r: Rect): [Asa, number, number][] {
  const { x, y, w, h } = r;
  return [
    ["nw", x, y], ["n", x + w / 2, y], ["ne", x + w, y], ["e", x + w, y + h / 2],
    ["se", x + w, y + h], ["s", x + w / 2, y + h], ["sw", x, y + h], ["w", x, y + h / 2],
  ];
}

export function Lienzo(props: Props) {
  const {
    imagen, ancho, alto, doc, editar, empezar, terminar, herramienta, estiloDe, seleccion, onSeleccion,
    vista, onVista, pendiente, onPendiente, proporcion, espacio, nuevoId, onCursor, onHueco, salida,
  } = props;
  const t = useT();
  const hueco = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [medida, setMedida] = useState({ w: 0, h: 0 });
  const [borrador, setBorrador] = useState<Marca | null>(null);
  const [marco, setMarco] = useState<[Punto, Punto] | null>(null);
  const [texto, setTexto] = useState<TextoAbierto | null>(null);
  const [cursor, setCursor] = useState("default");
  const gesto = useRef<Gesto | null>(null);
  const reducida = useRef<HTMLCanvasElement | null>(null);
  const visibles = marcasVisibles(doc);
  // Lo bloqueado se pinta, pero no se puede pinchar, ni coger con un marco, ni estirar.
  const tocables = marcasTocables(doc);
  const tocableIds = new Set(tocables.map((m) => m.id));
  const [arrastrando, setArrastrando] = useState(false);

  const full: Rect = { x: 0, y: 0, w: ancho, h: alto };
  const recortando = herramienta === "crop" && !!pendiente;
  const elegidas = doc.marcas.filter((m) => seleccion.includes(m.id));
  // Los tiradores solo salen si se puede estirar: una marca bloqueada se elige desde el
  // panel para desbloquearla, pero no se cambia.
  const unica = elegidas.length === 1 && !estaBloqueada(elegidas[0], doc.grupos) ? elegidas[0] : null;

  useLayoutEffect(() => {
    const el = hueco.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setMedida({ w: r.width, h: r.height });
      onHueco(r.width, r.height);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [onHueco]);

  // --- pintar ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = lienzo.current;
    if (!canvas || !medida.w) return;
    const id = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const [cw, ch] = [Math.round(medida.w * dpr), Math.round(medida.h * dpr)];
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const caja = herramienta === "crop" ? full : doc.recorte ?? full;
      ctx.setTransform(dpr * vista.zoom, 0, 0, dpr * vista.zoom, dpr * vista.panX, dpr * vista.panY);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 20 * dpr;
      ctx.shadowOffsetY = 4 * dpr;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(caja.x, caja.y, caja.w, caja.h);
      ctx.restore();
      if (imagen) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(caja.x, caja.y, caja.w, caja.h);
        ctx.clip();
        // De cerca, píxeles como cuadrados nítidos; de lejos, la reducción suave.
        ctx.imageSmoothingEnabled = vista.zoom < 2;
        ctx.imageSmoothingQuality = "high";
        const pintadas = visibles.map((m) => (texto?.id === m.id ? { ...m, oculta: true } : m));
        if (borrador) pintadas.push(borrador);
        const conSalida = salida && herramienta !== "crop" && (salida.w !== caja.w || salida.h !== caja.h);
        if (conSalida) {
          // Se pinta a la medida de guardar y se estira a la de la captura: lo que se ve
          // es exactamente lo que va a quedar en el archivo, con su pérdida de detalle.
          const r = (reducida.current ??= document.createElement("canvas"));
          if (r.width !== salida.w || r.height !== salida.h) {
            r.width = Math.max(1, salida.w);
            r.height = Math.max(1, salida.h);
          }
          const rc = r.getContext("2d");
          if (rc) {
            rc.setTransform(r.width / caja.w, 0, 0, r.height / caja.h, (-caja.x * r.width) / caja.w, (-caja.y * r.height) / caja.h);
            rc.imageSmoothingEnabled = true;
            rc.imageSmoothingQuality = "high";
            pintarFoto(rc, imagen, pintadas);
            ctx.drawImage(r, caja.x, caja.y, caja.w, caja.h);
          }
        } else {
          pintarFoto(ctx, imagen, pintadas);
        }
        ctx.restore();
      }

      // Lo de encima va en píxeles de pantalla: los tiradores miden lo mismo a cualquier zoom.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const P = (x: number, y: number) => aPantalla(vista, x, y);
      const tirador = (x: number, y: number, redondo = false) => {
        const [sx, sy] = P(x, y);
        ctx.beginPath();
        if (redondo) ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        else ctx.rect(sx - 4.5, sy - 4.5, 9, 9);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = ACENTO;
        ctx.stroke();
      };
      if (!recortando) {
        for (const m of elegidas) {
          if (texto?.id === m.id) continue;
          if (m.kind === "arrow") {
            const [a, b] = [P(m.x1, m.y1), P(m.x2, m.y2)];
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = ACENTO;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(...a);
            ctx.lineTo(...b);
            ctx.stroke();
            ctx.setLineDash([]);
            continue;
          }
          const c = cajaDe(m);
          const [x, y] = P(c.x, c.y);
          ctx.setLineDash([5, 3]);
          ctx.strokeStyle = ACENTO;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x - 3, y - 3, c.w * vista.zoom + 6, c.h * vista.zoom + 6);
          ctx.setLineDash([]);
        }
        if (unica && texto?.id !== unica.id) for (const [asa, x, y] of asasDe(unica)) tirador(x, y, asa === "p1" || asa === "p2");
      }
      if (marco) {
        const [[ax, ay], [bx, by]] = marco;
        ctx.fillStyle = "rgba(10,155,255,0.12)";
        ctx.strokeStyle = ACENTO;
        ctx.lineWidth = 1;
        ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
        ctx.strokeRect(Math.min(ax, bx) + 0.5, Math.min(ay, by) + 0.5, Math.abs(bx - ax), Math.abs(by - ay));
      }
      if (recortando && pendiente) {
        const [x, y] = P(pendiente.x, pendiente.y);
        const [w, h] = [pendiente.w * vista.zoom, pendiente.h * vista.zoom];
        ctx.beginPath();
        ctx.rect(0, 0, medida.w, medida.h);
        ctx.rect(x, y, w, h);
        ctx.fillStyle = "rgba(12,12,14,0.62)";
        ctx.fill("evenodd");
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x + (w * i) / 3, y);
          ctx.lineTo(x + (w * i) / 3, y + h);
          ctx.moveTo(x, y + (h * i) / 3);
          ctx.lineTo(x + w, y + (h * i) / 3);
          ctx.stroke();
        }
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        for (const [, ax, ay] of asasDelRecorte(pendiente)) tirador(ax, ay);
        const etiqueta = `${Math.round(pendiente.w)} × ${Math.round(pendiente.h)} px`;
        ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
        const tw = ctx.measureText(etiqueta).width + 16;
        const ly = y > 30 ? y - 26 : y + 8;
        ctx.fillStyle = ACENTO;
        ctx.beginPath();
        ctx.roundRect(x + w / 2 - tw / 2, ly, tw, 19, 9.5);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(etiqueta, x + w / 2, ly + 10);
        ctx.textAlign = "start";
      }
    });
    return () => cancelAnimationFrame(id);
  });

  // --- coordenadas y búsquedas ---------------------------------------------------------
  const enPantalla = (e: { clientX: number; clientY: number }): Punto => {
    const r = hueco.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const asaBajo = (s: Punto, asas: [Asa, number, number][]) =>
    asas.find(([, x, y]) => {
      const [px, py] = aPantalla(vista, x, y);
      return Math.hypot(px - s[0], py - s[1]) <= TOLERANCIA + 2;
    })?.[0];
  const dentro = (r: Rect, p: Punto) => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
  const tolerancia = TOLERANCIA / vista.zoom;

  // --- texto ----------------------------------------------------------------------------
  const abrirTexto = (m: Marca | null, p?: Punto) => {
    if (m) {
      setTexto({
        id: m.id, x: m.x1, y: m.y1, valor: m.texto ?? "",
        estilo: { color: m.color, tamano: m.tamano, fondo: m.fondo, contorno: m.contorno, fuente: m.fuente, negrita: m.negrita, cursiva: m.cursiva },
      });
      onSeleccion([m.id]);
      return;
    }
    const e = estiloDe("text");
    // El clic cae a media altura de la primera línea, que es donde se apunta con el ratón.
    setTexto({
      id: null, x: p![0], y: p![1] - e.tamano * 0.6, valor: "",
      estilo: { color: e.color, tamano: e.tamano, fondo: e.fondo, contorno: e.contorno, fuente: e.fuente, negrita: e.negrita, cursiva: e.cursiva },
    });
    onSeleccion([]);
  };
  const cerrarTexto = (guardar: boolean) => {
    const abierto = texto;
    if (!abierto) return;
    setTexto(null);
    if (!guardar) return;
    const valor = abierto.valor.replace(/\s+$/, "");
    if (abierto.id === null) {
      if (!valor) return;
      const id = nuevoId();
      editar((d) => ({
        ...d,
        marcas: [...d.marcas, { id, kind: "text", x1: abierto.x, y1: abierto.y, x2: abierto.x, y2: abierto.y, grosor: 0, texto: valor, ...abierto.estilo }],
      }));
      onSeleccion([id]);
    } else if (!valor) {
      editar((d) => ({ ...d, marcas: d.marcas.filter((m) => m.id !== abierto.id) }));
      onSeleccion([]);
    } else {
      editar((d) => ({ ...d, marcas: d.marcas.map((m) => (m.id === abierto.id ? { ...m, texto: valor } : m)) }));
    }
  };
  // Cambiar de herramienta con un texto abierto lo guarda, igual que hacer clic fuera.
  const cerrarRef = useRef(cerrarTexto);
  cerrarRef.current = cerrarTexto;
  useEffect(() => {
    if (herramienta !== "text" && herramienta !== "select") cerrarRef.current(true);
  }, [herramienta]);

  // --- ratón ----------------------------------------------------------------------------
  const empezarGesto = (g: Gesto, e: React.PointerEvent) => {
    gesto.current = g;
    setArrastrando(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const alPulsar = (e: React.PointerEvent<HTMLDivElement>) => {
    // Pinchar en la imagen le quita el foco a lo que lo tuviera (el grosor, la letra...).
    // El `preventDefault` de abajo impide que el navegador lo haga solo, y con el foco en
    // un campo, los atajos del editor no llegaban.
    const activo = document.activeElement as HTMLElement | null;
    if (activo && activo !== document.body && activo.tagName !== "TEXTAREA") activo.blur();
    if (texto) {
      cerrarTexto(true);
      if (herramienta === "text") return;
    }
    const s = enPantalla(e);
    const p = aImagen(vista, s[0], s[1]);
    if (e.button === 1 || espacio || herramienta === "hand") {
      e.preventDefault();
      empezarGesto({ tipo: "pan", sx: s[0], sy: s[1], vista }, e);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();

    if (herramienta === "crop" && pendiente) {
      const asa = asaBajo(s, asasDelRecorte(pendiente));
      const modo = asa ?? (dentro(pendiente, p) ? "mover" : "nuevo");
      empezarGesto({ tipo: "recorte", modo, origen: p, original: pendiente }, e);
      return;
    }
    if (herramienta === "crop") return;

    // Los tiradores de lo elegido mandan con cualquier herramienta: recién dibujada una
    // flecha, se puede alargar sin cambiar a «Seleccionar».
    if (unica) {
      const asa = asaBajo(s, asasDe(unica));
      if (asa) {
        empezar();
        empezarGesto({ tipo: "asa", asa, original: unica }, e);
        return;
      }
    }

    if (herramienta === "select") {
      const tocada = marcaEn(tocables, p, tolerancia);
      const sumar = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!tocada) {
        empezarGesto({ tipo: "marco", origen: s, actual: s, base: sumar ? seleccion : [] }, e);
        if (!sumar) onSeleccion([]);
        return;
      }
      // Una marca de una carpeta se elige con toda su carpeta, como en cualquier editor.
      const suyas = conSuGrupo(doc.marcas, [tocada.id]);
      let ids = seleccion;
      if (sumar) {
        ids = seleccion.includes(tocada.id) ? seleccion.filter((i) => !suyas.includes(i)) : [...new Set([...seleccion, ...suyas])];
        onSeleccion(ids);
        if (!ids.includes(tocada.id)) return;
      } else if (!seleccion.includes(tocada.id)) {
        ids = suyas;
        onSeleccion(ids);
      }
      empezar();
      empezarGesto({ tipo: "mover", origen: p, originales: doc.marcas.filter((m) => ids.includes(m.id) && tocableIds.has(m.id)) }, e);
      return;
    }

    if (herramienta === "text") {
      const tocada = marcaEn(tocables, p, tolerancia);
      if (tocada?.kind === "text") abrirTexto(tocada);
      else abrirTexto(null, p);
      return;
    }

    const tipo = TIPO_DE[herramienta];
    if (!tipo) return;
    const estilo = estiloDe(tipo);
    const base: Marca = {
      id: nuevoId(), kind: tipo, x1: p[0], y1: p[1], x2: p[0], y2: p[1], color: estilo.color, grosor: estilo.grosor,
    };
    if (tipo === "step") {
      editar((d) => ({ ...d, marcas: renumerar([...d.marcas, { ...base, tamano: estilo.tamano }]) }));
      onSeleccion([base.id]);
      return;
    }
    if (tipo === "arrow") Object.assign(base, { puntas: estilo.puntas, contorno: estilo.contorno });
    if (tipo === "shape") Object.assign(base, { forma: estilo.forma, relleno: estilo.relleno, contorno: estilo.contorno });
    if (tipo === "pen") base.puntos = [p];
    setBorrador(base);
    empezarGesto({ tipo: "dibujar", origen: p }, e);
  };

  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = enPantalla(e);
    const p = aImagen(vista, s[0], s[1]);
    onCursor(p[0] >= 0 && p[1] >= 0 && p[0] <= ancho && p[1] <= alto ? p : null);
    const g = gesto.current;
    if (!g) {
      setCursor(cursorEn(s, p));
      return;
    }
    switch (g.tipo) {
      case "pan":
        onVista({ ...g.vista, panX: g.vista.panX + s[0] - g.sx, panY: g.vista.panY + s[1] - g.sy }, true);
        break;
      case "dibujar":
        setBorrador((b) => {
          if (!b) return b;
          if (b.kind === "pen") return { ...b, x2: p[0], y2: p[1], puntos: [...(b.puntos ?? []), p] };
          const q = e.shiftKey ? (b.kind === "arrow" ? anguloRedondo(g.origen, p) : ladoIgual(g.origen, p)) : p;
          return { ...b, x2: q[0], y2: q[1] };
        });
        break;
      case "mover": {
        let [dx, dy] = [p[0] - g.origen[0], p[1] - g.origen[1]];
        // Con Mayús, solo en horizontal o en vertical.
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
        const movidas = new Map(g.originales.map((m) => [m.id, moverMarca(m, dx, dy)]));
        editar((d) => ({ ...d, marcas: d.marcas.map((m) => movidas.get(m.id) ?? m) }));
        break;
      }
      case "asa": {
        let q = p;
        if (e.shiftKey && g.original.kind === "arrow") {
          const fijo: Punto = g.asa === "p1" ? [g.original.x2, g.original.y2] : [g.original.x1, g.original.y1];
          q = anguloRedondo(fijo, p);
        }
        const nueva = estirarMarca(g.original, g.asa, q);
        editar((d) => ({ ...d, marcas: d.marcas.map((m) => (m.id === nueva.id ? nueva : m)) }));
        break;
      }
      case "marco": {
        g.actual = s;
        setMarco([g.origen, s]);
        const [a, b] = [aImagen(vista, ...g.origen), p];
        const r: Rect = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
        const dentroDelMarco = tocables.filter((m) => {
          if (m.oculta) return false;
          const c = cajaDe(m);
          return c.x < r.x + r.w && c.x + c.w > r.x && c.y < r.y + r.h && c.y + c.h > r.y;
        }).map((m) => m.id);
        onSeleccion(conSuGrupo(doc.marcas, [...new Set([...g.base, ...dentroDelMarco])]));
        break;
      }
      case "recorte": {
        const o = g.original;
        let r: Rect;
        if (g.modo === "mover") r = { ...o, x: o.x + p[0] - g.origen[0], y: o.y + p[1] - g.origen[1] };
        else if (g.modo === "nuevo") {
          let q = p;
          if (proporcion) {
            const w = Math.abs(p[0] - g.origen[0]);
            q = [p[0], g.origen[1] + Math.sign(p[1] - g.origen[1] || 1) * (w / proporcion)];
          }
          const x = Math.max(0, Math.min(g.origen[0], q[0]));
          const y = Math.max(0, Math.min(g.origen[1], q[1]));
          r = { x, y, w: Math.min(ancho, Math.max(g.origen[0], q[0])) - x, h: Math.min(alto, Math.max(g.origen[1], q[1])) - y };
        } else {
          r = estirarRect(o, g.modo, [Math.max(0, Math.min(ancho, p[0])), Math.max(0, Math.min(alto, p[1]))], 8);
          const fija = proporcion ?? (e.shiftKey ? o.w / o.h : null);
          if (fija && g.modo.length === 2) {
            const h = r.w / fija;
            r = { ...r, y: g.modo.includes("n") ? r.y + r.h - h : r.y, h };
          } else if (fija && (g.modo === "n" || g.modo === "s")) {
            const w = r.h * fija;
            r = { ...r, x: r.x + (r.w - w) / 2, w };
          } else if (fija) {
            const h = r.w / fija;
            r = { ...r, y: r.y + (r.h - h) / 2, h };
          }
        }
        onPendiente(meterRect(r, ancho, alto));
        break;
      }
    }
  };

  const alSoltar = () => {
    const g = gesto.current;
    gesto.current = null;
    setArrastrando(false);
    if (!g) return;
    if (g.tipo === "mover" || g.tipo === "asa") terminar();
    if (g.tipo === "marco") setMarco(null);
    if (g.tipo === "dibujar" && borrador) {
      const b = borrador;
      setBorrador(null);
      // Un clic sin arrastrar no es una marca: sería un punto invisible imposible de borrar.
      const vale = b.kind === "pen" ? (b.puntos?.length ?? 0) > 1 : Math.hypot(b.x2 - b.x1, b.y2 - b.y1) * vista.zoom > 6;
      if (vale) {
        editar((d) => ({ ...d, marcas: [...d.marcas, b] }));
        onSeleccion([b.id]);
      }
    }
  };

  const alDobleClic = (e: React.MouseEvent<HTMLDivElement>) => {
    if (herramienta !== "select") return;
    const s = enPantalla(e);
    const tocada = marcaEn(tocables, aImagen(vista, s[0], s[1]), tolerancia);
    if (tocada?.kind === "text") abrirTexto(tocada);
  };

  function cursorEn(s: Punto, p: Punto): string {
    if (espacio || herramienta === "hand") return arrastrando ? "grabbing" : "grab";
    if (herramienta === "crop" && pendiente) {
      const asa = asaBajo(s, asasDelRecorte(pendiente));
      if (asa) return CURSOR_DE_ASA[asa];
      return dentro(pendiente, p) ? "move" : "crosshair";
    }
    if (unica) {
      const asa = asaBajo(s, asasDe(unica));
      if (asa) return CURSOR_DE_ASA[asa];
    }
    if (herramienta === "select") return marcaEn(tocables, p, tolerancia) ? "move" : "default";
    if (herramienta === "text") return marcaEn(tocables, p, tolerancia)?.kind === "text" ? "text" : "crosshair";
    return "crosshair";
  }

  // La rueda acerca y aleja hacia donde está el ratón, que es lo que se espera en un
  // editor de fotos. Con Mayús se desplaza de lado; el desplazamiento de lado de un panel
  // táctil también mueve, para no acercar sin querer al deslizar dos dedos. Va con un oyente
  // a mano porque React registra la rueda como pasiva, y entonces no se puede frenar el
  // zoom de la página entera que el navegador haría con Ctrl.
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  useEffect(() => {
    const el = hueco.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      // Rueda con el botón de en medio pulsado: manda la rueda. El arrastre se suelta,
      // porque seguía calculando desde la vista de antes del zoom y la imagen saltaba.
      if (gesto.current?.tipo === "pan") {
        gesto.current = null;
        setArrastrando(false);
      }
      const v = vistaRef.current;
      const r = el.getBoundingClientRect();
      if (e.shiftKey && !e.ctrlKey) {
        onVista({ ...v, panX: v.panX - (e.deltaY || e.deltaX) }, true);
      } else if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        onVista({ ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY }, true);
      } else {
        // Una muesca de rueda (100) es un paso de un 25 %; el pellizco del panel va fino.
        const paso = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        onVista(zoomHacia(v, v.zoom * Math.exp(-paso * 0.0022), e.clientX - r.left, e.clientY - r.top), true);
      }
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [onVista]);

  const cursorFinal = espacio || herramienta === "hand" ? (arrastrando ? "grabbing" : "grab") : cursor;
  const textoEnPantalla = texto ? aPantalla(vista, texto.x, texto.y) : null;
  const tamanoTexto = (texto?.estilo.tamano ?? 28) * vista.zoom;
  const medidaTexto = texto ? medirTexto(texto.valor || " ", texto.estilo.tamano ?? 28, texto.estilo) : null;

  return (
    <div
      ref={hueco}
      data-lienzo
      className="relative min-w-0 flex-1 touch-none overflow-hidden bg-hueco"
      style={{ cursor: cursorFinal }}
      onPointerDown={alPulsar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onPointerLeave={() => onCursor(null)}
      onDoubleClick={alDobleClic}
      // El botón de en medio en Windows enciende el desplazamiento automático del
      // navegador, que se pelea con mover la vista.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onAuxClick={(e) => e.preventDefault()}
    >
      <canvas ref={lienzo} className="absolute inset-0 size-full" aria-label={t("Imagen que se está editando")} />
      {!imagen && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-tenue">{t("Cargando la imagen…")}</div>
      )}
      {texto && textoEnPantalla && medidaTexto && (
        <textarea
          autoFocus
          value={texto.valor}
          placeholder={t("Escribe aquí")}
          spellCheck={false}
          onChange={(e) => setTexto({ ...texto, valor: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={() => cerrarTexto(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              cerrarTexto(false);
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              cerrarTexto(true);
            }
          }}
          className="absolute resize-none overflow-hidden rounded-sm border border-dashed border-[#0a9bff] bg-black/10 p-0 outline-none placeholder:text-current placeholder:opacity-50"
          style={{
            left: textoEnPantalla[0] - 2,
            top: textoEnPantalla[1] - 2,
            width: medidaTexto.w * vista.zoom + tamanoTexto * 1.5,
            height: medidaTexto.h * vista.zoom + 6,
            font: fuenteDeTexto(tamanoTexto, texto.estilo),
            lineHeight: 1.2,
            color: texto.estilo.color,
            whiteSpace: "pre",
            cursor: "text",
          }}
        />
      )}
    </div>
  );
}

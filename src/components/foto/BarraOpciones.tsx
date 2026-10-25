import {
  ArrowDown,
  ArrowUp,
  Check,
  CopyPlus,
  FolderMinus,
  FolderPlus,
  Lightbulb,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { FUENTES, PALETA, type Estilo, type HerramientaFoto, type Rect, type TipoMarca } from "../../lib/foto/marcas";
import { useT } from "../../lib/i18n";
import { HERRAMIENTAS } from "./BarraHerramientas";

/**
 * Lo que se puede cambiar de la herramienta puesta, o de lo que hay elegido.
 *
 * Una sola fila que cambia con la herramienta, como en cualquier editor de fotos, pero con
 * palabras y no con siglas. Debajo va una línea que dice qué hacer con el ratón, porque
 * quien empieza no sabe que una flecha se dibuja ARRASTRANDO.
 */

export const PISTAS: Record<HerramientaFoto, string> = {
  select: "Haz clic en una marca para elegirla. Arrástrala para moverla y tira de los cuadraditos para cambiarla. Doble clic en un texto para cambiarlo.",
  crop: "Arrastra los bordes o las esquinas para elegir lo que se queda, y arrastra dentro para mover el marco. Intro aplica, Esc cancela.",
  hand: "Arrastra para moverte por la imagen. Con cualquier herramienta, mantén pulsado Espacio o el botón de la rueda para hacer lo mismo.",
  arrow: "Arrastra desde donde empieza la flecha hasta lo que señala. Con Mayús, el ángulo va de 15 en 15 grados.",
  shape: "Arrastra para dibujar la forma. Con Mayús sale un cuadrado o un círculo perfecto.",
  text: "Haz clic donde va el texto y escribe. Intro termina y Mayús+Intro pasa de línea. Haz clic en un texto para cambiarlo.",
  step: "Haz clic para poner pasos numerados: 1, 2, 3… Se numeran solos.",
  highlight: "Arrastra por encima de algo para marcarlo como con un rotulador.",
  pen: "Arrastra para dibujar a mano alzada.",
  pixelate: "Arrastra por encima de datos privados (correos, nombres, claves) para taparlos de verdad.",
};

export const PROPORCIONES_FOTO: { id: string; valor: number | "original" | null }[] = [
  { id: "Libre", valor: null },
  { id: "Original", valor: "original" },
  { id: "1:1", valor: 1 },
  { id: "4:3", valor: 4 / 3 },
  { id: "16:9", valor: 16 / 9 },
  { id: "9:16", valor: 9 / 16 },
];

interface Props {
  herramienta: HerramientaFoto;
  /** De qué tipo son las opciones que se enseñan: lo elegido, o la herramienta puesta. */
  tipo: TipoMarca | null;
  estilo: Estilo | null;
  onEstilo: (cambio: Partial<Estilo>) => void;
  onReiniciar: () => void;
  /** El grosor más grande que tiene sentido para esta captura. */
  grosorMaximo: number;
  elegidas: number;
  onDuplicar: () => void;
  onAgrupar: () => void;
  /** Solo si algo de lo elegido está en una carpeta. */
  onDesagrupar?: () => void;
  onBorrar: () => void;
  onSubir: () => void;
  onBajar: () => void;
  // El recorte
  pendiente: Rect | null;
  onPendiente: (r: Rect) => void;
  proporcion: string;
  onProporcion: (id: string) => void;
  hayRecorte: boolean;
  onAplicarRecorte: () => void;
  onCancelarRecorte: () => void;
  onQuitarRecorte: () => void;
}

const CHIP = "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors";
const chip = (puesto: boolean) =>
  `${CHIP} ${puesto ? "border-marca bg-marca text-white" : "border-linea text-texto hover:bg-realce"}`;

export function BarraOpciones(p: Props) {
  const t = useT();
  const h = HERRAMIENTAS.find((x) => x?.id === p.herramienta);
  const I = h?.icono;
  const e = p.estilo;
  const tipo = p.tipo;

  const campo = (etiqueta: string, hijo: React.ReactNode) => (
    <label className="flex items-center gap-1.5 text-[12px] text-apagado">
      {t(etiqueta)}
      {hijo}
    </label>
  );
  const numero = (valor: number, min: number, max: number, onCambio: (v: number) => void, etiqueta: string) => (
    <input
      type="number"
      aria-label={t(etiqueta)}
      value={Math.round(valor)}
      min={min}
      max={max}
      onChange={(ev) => {
        const v = Number(ev.target.value);
        if (Number.isFinite(v) && v > 0) onCambio(Math.min(max, Math.max(min, v)));
      }}
      className="h-7 w-16 rounded-md border border-linea bg-hueco px-1.5 text-[12px] text-titulo tabular-nums outline-none focus:border-marca"
    />
  );
  const segmento = <V extends string>(etiqueta: string, opciones: [V, string, string][], actual: V, onCambio: (v: V) => void) => (
    <div role="group" aria-label={t(etiqueta)} className="flex overflow-hidden rounded-md border border-linea">
      {opciones.map(([v, simbolo, nombre]) => (
        <button
          key={v}
          type="button"
          title={t(nombre)}
          aria-label={t(nombre)}
          aria-pressed={actual === v}
          onClick={() => onCambio(v)}
          className={`h-7 min-w-8 px-2 text-[13px] ${actual === v ? "bg-marca text-white" : "text-texto hover:bg-realce"}`}
        >
          {simbolo}
        </button>
      ))}
    </div>
  );
  const interruptor = (etiqueta: string, puesto: boolean, onCambio: (v: boolean) => void) => (
    <button type="button" aria-pressed={puesto} onClick={() => onCambio(!puesto)} className={chip(puesto)}>
      {puesto && <Check className="size-3.5" />}
      {t(etiqueta)}
    </button>
  );
  const accion = (icono: React.ComponentType<{ className?: string }>, etiqueta: string, onClick: () => void, desactivada = false, peligro = false) => {
    const A = icono;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={desactivada}
        title={t(etiqueta)}
        aria-label={t(etiqueta)}
        className={`flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-35 ${
          peligro ? "text-red-500 hover:bg-red-500/10" : "text-suave hover:bg-realce hover:text-titulo"
        }`}
      >
        <A className="size-4" />
      </button>
    );
  };

  const colores = e && tipo !== "pixelate" && (
    <div className="flex items-center gap-1" role="group" aria-label={t("Color")}>
      <span className="mr-0.5 text-[12px] text-apagado">{t("Color")}</span>
      {PALETA.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={e.color === c}
          onClick={() => p.onEstilo({ color: c })}
          className={`size-[18px] rounded-[5px] border ${e.color === c ? "ring-2 ring-marca ring-offset-1 ring-offset-lienzo" : ""} border-linea-fuerte`}
          style={{ background: c }}
        />
      ))}
      <label title={t("Otro color")} className="relative size-[18px] cursor-pointer overflow-hidden rounded-[5px] border border-linea-fuerte"
        style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}>
        <input type="color" aria-label={t("Otro color")} value={e.color} onChange={(ev) => p.onEstilo({ color: ev.target.value })}
          className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );

  const grosor = e && (tipo === "arrow" || tipo === "shape" || tipo === "pen") &&
    campo("Grosor", (
      <>
        <input type="range" min={1} max={p.grosorMaximo} value={e.grosor} aria-label={t("Grosor")}
          onChange={(ev) => p.onEstilo({ grosor: Number(ev.target.value) })} className="w-24 accent-[var(--color-marca)]" />
        <span className="w-10 text-titulo tabular-nums">{e.grosor} px</span>
      </>
    ));

  let opciones: React.ReactNode = null;
  if (p.herramienta === "crop") {
    const r = p.pendiente;
    opciones = (
      <>
        <div className="flex overflow-hidden rounded-md border border-linea" role="group" aria-label={t("Proporción")}>
          {PROPORCIONES_FOTO.map((x) => (
            <button key={x.id} type="button" aria-pressed={p.proporcion === x.id} onClick={() => p.onProporcion(x.id)}
              className={`h-7 px-2 text-[12px] ${p.proporcion === x.id ? "bg-marca text-white" : "text-texto hover:bg-realce"}`}>
              {t(x.id)}
            </button>
          ))}
        </div>
        {r && (
          <>
            {campo("Ancho", numero(r.w, 8, 100000, (w) => p.onPendiente({ ...r, w }), "Ancho"))}
            {campo("Alto", numero(r.h, 8, 100000, (hh) => p.onPendiente({ ...r, h: hh }), "Alto"))}
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {p.hayRecorte && (
            <button type="button" onClick={p.onQuitarRecorte} className={chip(false)}>{t("Quitar recorte")}</button>
          )}
          <button type="button" onClick={p.onCancelarRecorte} className={chip(false)}>
            <X className="size-3.5" />{t("Cancelar")}
          </button>
          <button type="button" onClick={p.onAplicarRecorte} className={`${CHIP} border-marca bg-marca font-medium text-white hover:brightness-110`}>
            <Check className="size-3.5" />{t("Aplicar recorte")}
          </button>
        </div>
      </>
    );
  } else if (p.herramienta === "hand" && !p.elegidas) {
    opciones = <span className="text-[12px] text-apagado">{t("La rueda acerca y aleja hacia el ratón. Ctrl+0 ajusta la imagen a la ventana.")}</span>;
  } else if (p.herramienta === "select" && !p.elegidas) {
    opciones = <span className="text-[12px] text-apagado">{t("Nada elegido. Ctrl+A elige todas las marcas.")}</span>;
  } else if (e && tipo) {
    opciones = (
      <>
        {colores}
        {grosor}
        {tipo === "arrow" && campo("Puntas", segmento("Puntas", [["end", "→", "Una punta"], ["both", "↔", "Dos puntas"], ["none", "—", "Sin punta"]], e.puntas, (v) => p.onEstilo({ puntas: v })))}
        {tipo === "shape" && segmento("Forma", [["rect", "▭", "Rectángulo"], ["round", "▢", "Esquinas redondas"], ["ellipse", "◯", "Elipse"]], e.forma, (v) => p.onEstilo({ forma: v }))}
        {tipo === "shape" && interruptor("Relleno", e.relleno, (v) => p.onEstilo({ relleno: v }))}
        {tipo === "text" && (
          <select
            aria-label={t("Tipo de letra")}
            title={t("Tipo de letra")}
            value={e.fuente}
            onChange={(ev) => p.onEstilo({ fuente: ev.target.value })}
            className="h-7 rounded-md border border-linea bg-hueco px-1.5 text-[12px] text-titulo outline-none focus:border-marca"
            style={{ fontFamily: `"${e.fuente}"` }}
          >
            {FUENTES.map((f) => (
              <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>{f}</option>
            ))}
          </select>
        )}
        {(tipo === "text" || tipo === "step") && campo("Tamaño", numero(e.tamano, 6, 600, (v) => p.onEstilo({ tamano: v }), "Tamaño"))}
        {tipo === "text" && (
          <div role="group" aria-label={t("Estilo de letra")} className="flex overflow-hidden rounded-md border border-linea">
            <button type="button" aria-pressed={e.negrita} title={t("Negrita")} aria-label={t("Negrita")}
              onClick={() => p.onEstilo({ negrita: !e.negrita })}
              className={`h-7 w-8 text-[13px] font-bold ${e.negrita ? "bg-marca text-white" : "text-texto hover:bg-realce"}`}>B</button>
            <button type="button" aria-pressed={e.cursiva} title={t("Cursiva")} aria-label={t("Cursiva")}
              onClick={() => p.onEstilo({ cursiva: !e.cursiva })}
              className={`h-7 w-8 font-serif text-[13px] italic ${e.cursiva ? "bg-marca text-white" : "text-texto hover:bg-realce"}`}>I</button>
          </div>
        )}
        {tipo === "text" && interruptor("Fondo", e.fondo, (v) => p.onEstilo({ fondo: v }))}
        {(tipo === "arrow" || tipo === "shape" || tipo === "text") && interruptor("Borde blanco", e.contorno, (v) => p.onEstilo({ contorno: v }))}
        {tipo === "pixelate" && <span className="text-[12px] text-apagado">{t("Lo pixelado se borra de verdad del archivo: no se puede deshacer después de guardar.")}</span>}
        {!p.elegidas && accion(RotateCcw, "Volver a lo de fábrica", p.onReiniciar)}
      </>
    );
  }

  return (
    <div className="shrink-0 border-b border-linea bg-tarjeta">
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        {I && h && (
          <span className="flex items-center gap-1.5 border-r border-linea pr-3 text-[12px] font-semibold text-titulo">
            <I className="size-4" />
            {t(h.etiqueta)}
          </span>
        )}
        {p.elegidas > 0 && p.herramienta !== "crop" && (
          <div className="flex items-center gap-0.5 border-r border-linea pr-2">
            <span className="mr-1 text-[12px] text-apagado">
              {p.elegidas === 1 ? t("1 marca elegida") : t("{n} marcas elegidas", { n: p.elegidas })}
            </span>
            {accion(CopyPlus, "Duplicar (Ctrl+D)", p.onDuplicar)}
            {accion(FolderPlus, "Meter en una carpeta (Ctrl+G)", p.onAgrupar)}
            {p.onDesagrupar && accion(FolderMinus, "Sacar de la carpeta (Ctrl+Mayús+G)", p.onDesagrupar)}
            {accion(ArrowUp, "Subir una capa", p.onSubir)}
            {accion(ArrowDown, "Bajar una capa", p.onBajar)}
            {accion(Trash2, "Borrar (Supr)", p.onBorrar, false, true)}
          </div>
        )}
        {opciones}
      </div>
      <p className="flex items-center gap-1.5 border-t border-linea-tenue bg-marca/8 px-3 py-1 text-[11.5px] text-suave">
        <Lightbulb className="size-3.5 shrink-0 text-marca" />
        {t(PISTAS[p.herramienta])}
      </p>
    </div>
  );
}

import {
  ArrowUpRight,
  Circle,
  Crop,
  Grid3x3,
  Hand,
  Highlighter,
  MousePointer2,
  Pencil,
  ShieldCheck,
  Square,
  TextSelect,
  Type,
} from "lucide-react";
import type { HerramientaFoto } from "../../lib/foto/marcas";
import { useT } from "../../lib/i18n";

type Icono = React.ComponentType<{ className?: string }>;

/**
 * Las herramientas, **con su nombre al lado** y no solo el icono: quien no ha usado nunca
 * un editor de fotos no sabe qué es un cuadrado con una esquina, y leerlo es más rápido
 * que pasar el ratón por encima de cada uno.
 */
export const HERRAMIENTAS: ({ id: HerramientaFoto; icono: Icono; etiqueta: string; tecla: string } | null)[] = [
  { id: "select", icono: MousePointer2, etiqueta: "Seleccionar", tecla: "V" },
  { id: "crop", icono: Crop, etiqueta: "Recortar", tecla: "C" },
  { id: "hand", icono: Hand, etiqueta: "Mover vista", tecla: "H" },
  null,
  { id: "arrow", icono: ArrowUpRight, etiqueta: "Flecha", tecla: "A" },
  { id: "shape", icono: Square, etiqueta: "Forma", tecla: "U" },
  { id: "text", icono: Type, etiqueta: "Texto", tecla: "T" },
  { id: "step", icono: Circle, etiqueta: "Paso", tecla: "N" },
  { id: "highlight", icono: Highlighter, etiqueta: "Resaltar", tecla: "M" },
  { id: "pen", icono: Pencil, etiqueta: "Lápiz", tecla: "B" },
  null,
  { id: "pixelate", icono: Grid3x3, etiqueta: "Pixelar", tecla: "P" },
];

/**
 * Las teclas de cada herramienta: las letras de siempre en los editores de fotos, y los
 * números del editor de antes, para quien ya se los sabía.
 */
export const TECLAS: Record<string, HerramientaFoto> = {
  v: "select", c: "crop", h: "hand", a: "arrow", u: "shape", t: "text", n: "step", m: "highlight", b: "pen", p: "pixelate",
  "0": "select", "1": "arrow", "2": "shape", "3": "text", "4": "highlight", "5": "step", "6": "pixelate", "7": "pen",
};

interface Props {
  activa: HerramientaFoto;
  onElegir: (h: HerramientaFoto) => void;
  onTaparDatos: () => void;
  onCopiarTexto: () => void;
  ocupado: boolean;
  /** Lo ancha que la dejó la persona. Estrecha, solo con los iconos. */
  ancho?: number;
}

export function BarraHerramientas({ activa, onElegir, onTaparDatos, onCopiarTexto, ocupado, ancho = 132 }: Props) {
  const t = useT();
  const soloIconos = ancho < 96;
  const fila = (icono: Icono, etiqueta: string, puesta: boolean, onClick: () => void, tecla?: string, titulo?: string) => {
    const I = icono;
    return (
      <button
        key={etiqueta}
        type="button"
        onClick={onClick}
        disabled={ocupado && !tecla}
        aria-pressed={tecla ? puesta : undefined}
        title={titulo ?? (tecla ? `${t(etiqueta)} (${tecla})` : t(etiqueta))}
        aria-label={tecla ? `${t(etiqueta)} (${tecla})` : t(etiqueta)}
        className={`flex w-full items-center gap-2 rounded-md py-[5px] text-left text-[12px] transition-colors disabled:opacity-40 ${
          soloIconos ? "justify-center px-0" : "px-2"
        } ${puesta ? "bg-marca text-white" : "text-texto hover:bg-realce"}`}
      >
        <I className="size-4 shrink-0" />
        {!soloIconos && <span className="min-w-0 flex-1 truncate">{t(etiqueta)}</span>}
        {tecla && !soloIconos && <span className={`text-[10px] ${puesta ? "text-white/70" : "text-fantasma"}`}>{tecla}</span>}
      </button>
    );
  };
  return (
    <nav aria-label={t("Herramientas")} className="flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-linea bg-tarjeta p-1.5" style={{ width: ancho }}>
      {HERRAMIENTAS.map((h, i) =>
        h ? fila(h.icono, h.etiqueta, activa === h.id, () => onElegir(h.id), h.tecla) : <hr key={i} className="mx-1 my-1 border-linea" />,
      )}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-linea pt-1.5">
        {fila(ShieldCheck, "Tapar datos", false, onTaparDatos, undefined, t("Busca correos, teléfonos y claves en la imagen y los pixela"))}
        {fila(TextSelect, "Copiar texto", false, onCopiarTexto, undefined, t("Copia el texto que hay escrito en la imagen"))}
      </div>
    </nav>
  );
}

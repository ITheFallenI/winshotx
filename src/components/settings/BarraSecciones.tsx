import { Camera, Images, Keyboard, LogOut, Settings, Video } from "lucide-react";
import type { ComponentType } from "react";
import { useT } from "../../lib/i18n";
import { partesDeAtajo } from "../../lib/teclas";
import { Marca } from "../ui/Marca";

/** Las secciones de la ventana principal, en el orden en que se usan. */
export const SECCIONES = [
  { value: "capturar", label: "Capturar", icono: Camera },
  { value: "grabar", label: "Grabar", icono: Video },
  { value: "galeria", label: "Galería", icono: Images },
  { value: "teclas", label: "Teclas", icono: Keyboard },
  { value: "app", label: "Ajustes", icono: Settings },
] as const satisfies readonly { value: string; label: string; icono: ComponentType<{ className?: string }> }[];

export type SeccionId = (typeof SECCIONES)[number]["value"];

interface Props {
  activa: SeccionId;
  onCambiar: (id: SeccionId) => void;
  version: string;
  onSalir: () => void;
  onCapturar: () => void;
  onGrabar: () => void;
  /** Los atajos tal y como se guardan, para enseñarlos al lado de cada botón. */
  atajoCaptura: string;
  atajoGrabar: string;
}

/**
 * La columna de la izquierda de la ventana principal, hecha igual que la de herramientas
 * del editor de imágenes: icono y nombre en cada fila, la elegida en azul, y lo que no es
 * navegación abajo del todo.
 *
 * Fue una cabecera arriba mientras la ventana medía 840 px: una columna se llevaba el ancho
 * que hacía falta para poner los ajustes en dos columnas. Con la ventana más grande de
 * fábrica cabe de sobra, y así la aplicación entera se lee como el editor, que es la parte
 * que mejor se usa.
 *
 * Arriba van los dos botones que más se buscan al abrir la ventana: hacer una captura o
 * una grabación sin tener que acordarse del atajo, que va escrito al lado para aprenderlo.
 */
export function BarraSecciones({ activa, onCambiar, version, onSalir, onCapturar, onGrabar, atajoCaptura, atajoGrabar }: Props) {
  const t = useT();
  const accion = (I: ComponentType<{ className?: string }>, texto: string, atajo: string, onClick: () => void, principal: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors ${
        principal ? "bg-marca text-white hover:brightness-110" : "bg-realce text-titulo hover:bg-activo"
      }`}
    >
      <I className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{texto}</span>
        {atajo && (
          <span className={`block truncate text-[10.5px] ${principal ? "text-white/75" : "text-tenue"}`}>
            {partesDeAtajo(atajo).join(" + ")}
          </span>
        )}
      </span>
    </button>
  );
  return (
    <aside className="flex w-[208px] shrink-0 flex-col border-r border-linea bg-tarjeta">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-linea px-3 text-titulo">
        <Marca className="size-5" />
        <span className="text-[13px] font-semibold">winshotx</span>
      </div>
      <div className="flex flex-col gap-1 border-b border-linea p-1.5">
        {accion(Camera, t("Nueva captura"), atajoCaptura, onCapturar, true)}
        {accion(Video, t("Nueva grabación"), atajoGrabar, onGrabar, false)}
      </div>
      <nav aria-label={t("Secciones de ajustes")} data-tour="secciones" className="flex flex-col gap-0.5 p-1.5">
        {SECCIONES.map(({ value, label, icono: I }) => {
          const puesta = value === activa;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onCambiar(value)}
              aria-pressed={puesta}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors ${
                puesta ? "bg-marca text-white" : "text-texto hover:bg-realce"
              }`}
            >
              <I className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(label)}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex h-9 shrink-0 items-center gap-1 border-t border-linea px-1.5 ps-3">
        <span className="min-w-0 flex-1 truncate text-[11px] text-tenue">
          {t("Versión")} {version}
        </span>
        <button
          type="button"
          onClick={onSalir}
          title={t("Cierra winshotx del todo, también de la bandeja")}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] text-apagado transition-colors hover:bg-red-500/15 hover:text-red-300"
        >
          <LogOut className="size-3.5" />
          {t("Salir")}
        </button>
      </div>
    </aside>
  );
}

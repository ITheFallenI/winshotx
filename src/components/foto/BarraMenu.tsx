import { useEffect, useRef, useState } from "react";
import { Copy, Keyboard, Redo2, Save, Undo2 } from "lucide-react";
import { useT } from "../../lib/i18n";

/**
 * La barra de arriba que no cambia nunca: los menús de siempre y, a la derecha, lo que se
 * hace todo el rato (deshacer, copiar, guardar).
 *
 * La de opciones cambia con cada herramienta, y eso está bien para el color o el grosor,
 * pero «guardar» no puede moverse de sitio según lo que se tenga puesto. Los menús además
 * enseñan los atajos al lado de cada cosa, que es como se aprenden sin leer nada aparte.
 */

export interface Opcion {
  etiqueta: string;
  atajo?: string;
  accion: () => void;
  desactivada?: boolean;
}

/** `null` es una raya entre grupos de opciones. */
export type Menu = { nombre: string; opciones: (Opcion | null)[] };

interface Props {
  menus: Menu[];
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  onDeshacer: () => void;
  onRehacer: () => void;
  onCopiar: () => void;
  onGuardar: () => void;
  onAtajos: () => void;
}

export function BarraMenu(p: Props) {
  const t = useT();
  const [abierto, setAbierto] = useState<string | null>(null);
  const barra = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!barra.current?.contains(e.target as Node)) setAbierto(null);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Que el Escape cierre el menú y no llegue al editor, que lo usaría para cerrar.
        e.stopImmediatePropagation();
        setAbierto(null);
      }
    };
    window.addEventListener("pointerdown", fuera);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("pointerdown", fuera);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [abierto]);

  const boton = (icono: React.ComponentType<{ className?: string }>, etiqueta: string, onClick: () => void, desactivado = false) => {
    const I = icono;
    return (
      <button type="button" onClick={onClick} disabled={desactivado} title={t(etiqueta)} aria-label={t(etiqueta)}
        className="flex size-7 items-center justify-center rounded-md text-suave transition-colors hover:bg-realce hover:text-titulo disabled:opacity-35">
        <I className="size-4" />
      </button>
    );
  };

  return (
    <div ref={barra} role="menubar" aria-label={t("Menú")} className="flex h-9 shrink-0 items-center gap-0.5 border-b border-linea bg-flotante px-1.5">
      {p.menus.map((m) => (
        <div key={m.nombre} className="relative">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={abierto === m.nombre}
            onClick={() => setAbierto(abierto === m.nombre ? null : m.nombre)}
            // Con un menú abierto, pasar por encima de otro lo abre, como en Windows.
            onPointerEnter={() => abierto && abierto !== m.nombre && setAbierto(m.nombre)}
            className={`h-7 rounded-md px-2.5 text-[12.5px] ${abierto === m.nombre ? "bg-activo text-titulo" : "text-texto hover:bg-realce"}`}
          >
            {t(m.nombre)}
          </button>
          {abierto === m.nombre && (
            <div role="menu" aria-label={t(m.nombre)}
              className="absolute top-full left-0 z-40 mt-1 min-w-60 rounded-lg border border-linea-fuerte bg-flotante p-1 shadow-[var(--shadow-float)]">
              {m.opciones.map((o, i) =>
                o ? (
                  <button
                    key={o.etiqueta}
                    type="button"
                    role="menuitem"
                    disabled={o.desactivada}
                    onClick={() => {
                      setAbierto(null);
                      o.accion();
                    }}
                    className="flex w-full items-center gap-6 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-texto hover:bg-marca hover:text-white disabled:pointer-events-none disabled:opacity-40"
                  >
                    <span className="flex-1">{t(o.etiqueta)}</span>
                    {o.atajo && <span className="text-[11px] opacity-60">{t(o.atajo)}</span>}
                  </button>
                ) : (
                  <hr key={`r${i}`} className="mx-1 my-1 border-linea" />
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <div className="ml-auto flex items-center gap-0.5">
        {boton(Undo2, "Deshacer (Ctrl+Z)", p.onDeshacer, !p.puedeDeshacer)}
        {boton(Redo2, "Rehacer (Ctrl+Y)", p.onRehacer, !p.puedeRehacer)}
        <span className="mx-1 h-5 w-px bg-linea" />
        {boton(Keyboard, "Atajos de teclado (F1)", p.onAtajos)}
        {boton(Copy, "Copiar imagen (Ctrl+C)", p.onCopiar)}
        <button type="button" onClick={p.onGuardar} title={t("Guardar (Ctrl+S)")}
          className="ml-1 flex h-7 items-center gap-1.5 rounded-md bg-marca px-3 text-[12.5px] font-medium text-white hover:brightness-110">
          <Save className="size-3.5" />
          {t("Guardar")}
        </button>
      </div>
    </div>
  );
}

/** Lo que se cuenta en «Atajos de teclado»: lo mismo que hay en los menús, todo junto. */
export const ATAJOS: [string, string][] = [
  ["Rueda del ratón", "Acercar y alejar hacia el ratón"],
  ["Espacio + arrastrar", "Mover la vista"],
  ["Ctrl+0 / Ctrl+1", "Ajustar a la ventana / tamaño real"],
  ["V C H", "Seleccionar, recortar, mover vista"],
  ["A U T N M B P", "Flecha, forma, texto, paso, resaltar, lápiz, pixelar"],
  ["Mayús al dibujar", "Ángulos rectos, cuadrados y círculos"],
  ["Ctrl+A", "Elegir todas las marcas"],
  ["Ctrl+D", "Duplicar lo elegido"],
  ["Ctrl+G / Ctrl+Mayús+G", "Meter en una carpeta / sacar de ella"],
  ["Ctrl+L", "Bloquear o desbloquear lo elegido"],
  ["Flechas (Mayús)", "Mover lo elegido 1 píxel (10)"],
  ["Supr", "Borrar lo elegido"],
  ["Ctrl+Z / Ctrl+Y", "Deshacer / rehacer"],
  ["Ctrl+C", "Copiar la imagen terminada"],
  ["Ctrl+S / Ctrl+Mayús+S", "Guardar / guardar en…"],
  ["Ctrl+O / Ctrl+V", "Abrir / pegar una imagen"],
];

export function DialogoAtajos({ onCerrar }: { onCerrar: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onPointerDown={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="atajos-titulo" onPointerDown={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[92%] rounded-xl border border-linea-fuerte bg-flotante p-5 text-titulo shadow-xl">
        <h2 id="atajos-titulo" className="mb-3 font-semibold">{t("Atajos de teclado")}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[12.5px]">
          {ATAJOS.map(([tecla, que]) => (
            <div key={tecla} className="contents">
              <dt className="font-mono text-[11.5px] text-marca">{t(tecla)}</dt>
              <dd className="text-texto">{t(que)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex justify-end">
          <button autoFocus onClick={onCerrar} className="rounded-md bg-realce px-3 py-1.5 text-sm">{t("Cerrar")}</button>
        </div>
      </div>
    </div>
  );
}

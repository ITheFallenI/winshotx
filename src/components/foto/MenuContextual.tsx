import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import type { Opcion } from "./BarraMenu";

/**
 * El menú del clic derecho: el de Windows de siempre, en el sitio del ratón. Se cierra al
 * pinchar fuera, con Escape o al elegir algo, y nunca se sale de la ventana.
 */
export function MenuContextual({ x, y, opciones, onCerrar }: {
  x: number;
  y: number;
  /** `null` es una raya entre grupos de opciones. */
  opciones: (Opcion | null)[];
  onCerrar: () => void;
}) {
  const t = useT();
  const caja = useRef<HTMLDivElement>(null);
  const [sitio, setSitio] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    setSitio({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) onCerrar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onCerrar();
    };
    window.addEventListener("pointerdown", fuera, true);
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("blur", onCerrar);
    return () => {
      window.removeEventListener("pointerdown", fuera, true);
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("blur", onCerrar);
    };
  }, [onCerrar]);

  return (
    <div
      ref={caja}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      // `w-max`: sin él, abierto pegado al borde derecho se medía ya estrujado, las
      // opciones partían en dos líneas y el menú se quedaba asomando por fuera.
      className="fixed z-50 w-max min-w-52 rounded-lg border border-linea-fuerte bg-flotante p-1 shadow-[var(--shadow-float)]"
      style={sitio}
    >
      {opciones.map((o, i) =>
        o ? (
          <button
            key={`${o.etiqueta}${i}`}
            type="button"
            role="menuitem"
            disabled={o.desactivada}
            onClick={() => {
              onCerrar();
              o.accion();
            }}
            className="flex w-full items-center gap-6 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-texto hover:bg-marca hover:text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <span className="flex-1">{o.etiqueta}</span>
            {o.atajo && <span className="text-[11px] opacity-60">{t(o.atajo)}</span>}
          </button>
        ) : (
          <hr key={`r${i}`} className="mx-1 my-1 border-linea" />
        ),
      )}
    </div>
  );
}

import { useRef } from "react";
import { useT } from "../../lib/i18n";

/**
 * Un borde que se arrastra para hacer más ancho o más alto un panel. Doble clic lo deja
 * como venía de fábrica.
 *
 * Avisa de cuánto se ha movido el ratón desde que se pulsó, no de dónde está: así quien lo
 * usa decide hacia qué lado crece su panel.
 */
export function Divisor({ sentido, onEmpezar, onArrastrar, onReiniciar }: {
  /** `columna` separa dos columnas (se arrastra de lado); `fila`, dos filas. */
  sentido: "columna" | "fila";
  onEmpezar: () => void;
  onArrastrar: (desplazamiento: number) => void;
  onReiniciar: () => void;
}) {
  const t = useT();
  const inicio = useRef<number | null>(null);
  const columna = sentido === "columna";
  return (
    <div
      role="separator"
      aria-orientation={columna ? "vertical" : "horizontal"}
      title={t("Arrastra para cambiar el tamaño. Doble clic lo devuelve a como estaba.")}
      onPointerDown={(e) => {
        e.preventDefault();
        inicio.current = columna ? e.clientX : e.clientY;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onEmpezar();
      }}
      onPointerMove={(e) => {
        if (inicio.current === null) return;
        onArrastrar((columna ? e.clientX : e.clientY) - inicio.current);
      }}
      onPointerUp={() => (inicio.current = null)}
      onPointerCancel={() => (inicio.current = null)}
      onDoubleClick={onReiniciar}
      className={`group relative z-10 shrink-0 ${columna ? "-mx-[3px] w-[6px] cursor-col-resize" : "-my-[3px] h-[6px] cursor-row-resize"}`}
    >
      <span
        className={`absolute bg-transparent transition-colors group-hover:bg-marca/60 ${
          columna ? "inset-y-0 left-[2px] w-[2px]" : "inset-x-0 top-[2px] h-[2px]"
        }`}
      />
    </div>
  );
}

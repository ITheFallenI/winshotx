import type { ReactNode } from "react";

import { Ayuda } from "./Ayuda";

interface SectionProps {
  title?: string;
  children: ReactNode;
  /** Enganche para que el tour guiado pueda iluminar este bloque. */
  tour?: string;
  /**
   * Para colocar el bloque en la rejilla cuando el orden natural no cuadra.
   *
   * La rejilla reparte los bloques uno a cada lado por turnos, y con tres eso deja dos
   * a la izquierda y uno a la derecha. Un `col-start-2` manda el tercero abajo del
   * segundo, que es donde hay sitio.
   */
  className?: string;
}

/**
 * Un bloque de ajustes: una tarjeta con su nombre arriba y una linea fina separando cada
 * fila de la siguiente.
 *
 * El rotulo va DENTRO de la tarjeta y en el estilo de los del panel del editor de imagenes
 * (pequenno, en mayusculas y gris, como «Capas» o «Formato»): la aplicacion entera se lee
 * igual que el editor, que es la parte que mejor se usa.
 */
export function Section({ title, children, tour, className = "" }: SectionProps) {
  return (
    <section
      data-tour={tour}
      className={`mb-3 w-full overflow-hidden rounded-lg border border-linea bg-tarjeta ${className}`}
    >
      {title && (
        <h2 className="border-b border-linea-tenue px-3.5 pt-2.5 pb-2 text-[10.5px] font-semibold tracking-wider text-tenue uppercase">
          {title}
        </h2>
      )}
      {/* La linea va entre filas y nunca encima de la primera. Se pone sobre los hijos
          directos y no sobre `.fila + .fila`: alguna fila llega envuelta en su propio
          contenedor, y una regla de hermanos adyacentes se saltaba justo esas. */}
      <div className="[&>*+*]:border-t [&>*+*]:border-linea">{children}</div>
    </section>
  );
}

/** Qué dice la línea de debajo: un dato, un aviso que hay que leer, o algo ya resuelto. */
export type RowTone = "normal" | "warn" | "ok" | "error";

const TONO: Record<RowTone, string> = {
  normal: "text-apagado",
  warn: "text-amber-400/90",
  ok: "text-emerald-400/90",
  error: "text-red-400/90",
};

interface RowProps {
  label: string;
  hint?: ReactNode;
  icon?: ReactNode;
  /**
   * La explicación larga del ajuste, la que sale al dejar el ratón sobre el icono.
   *
   * En la fila caben un nombre y una línea; el porqué no cabe, y es justo lo que hace
   * falta para decidir. Va colgada del icono porque es el único sitio de la fila que no
   * hace nada: el nombre no se pulsa y el control sí.
   */
  explicacion?: string;
  control: ReactNode;
  /** Pone el control debajo, a lo ancho, para sliders o selectores. */
  stacked?: boolean;
  tone?: RowTone;
}

export function Row({
  label,
  hint,
  icon,
  explicacion,
  control,
  stacked = false,
  tone = "normal",
}: RowProps) {
  // El hueco del icono se reserva siempre, tenga icono o no: sin eso, una fila sin
  // icono dejaba su texto cuatro pixeles a la izquierda y la columna salía torcida.
  const texto = (
    <span className="flex min-w-0 items-center gap-3">
      {explicacion ? (
        <Ayuda texto={explicacion}>{icon}</Ayuda>
      ) : (
        <span className="flex w-4 shrink-0 justify-center text-tenue">{icon}</span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-titulo">{label}</span>
        {/* Dos lineas, no una: en una columna de 390 px la explicacion se cortaba a la
            mitad, y son frases que hay que leer enteras para decidir ("quitarla es lo
            unico que la calla del todo"). El nombre de arriba si se corta, porque es
            corto y el hueco es suyo. */}
        {hint && <span className={`line-clamp-2 text-[12px] ${TONO[tone]}`}>{hint}</span>}
      </span>
    </span>
  );

  if (stacked) {
    return (
      <div className="px-3.5 py-2.5">
        <div className="mb-2.5">{texto}</div>
        {control}
      </div>
    );
  }

  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-3.5 py-2">
      {texto}
      <span className="shrink-0">{control}</span>
    </div>
  );
}

interface RowButtonProps {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  /** Lo que sale al dejar el ratón encima, cuando el botón solo no se explica. */
  title?: string;
  /** Para el que hace algo que no se deshace solo. */
  danger?: boolean;
}

/** El botón secundario de una fila. Estaba copiado siete veces con las mismas clases. */
export function RowButton({
  onClick,
  children,
  disabled = false,
  danger = false,
  title,
}: RowButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-7 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors disabled:opacity-40 ${
        danger
          ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
          : "bg-realce text-texto hover:bg-activo hover:text-titulo"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * El logo de winshotx, enorme y casi invisible, al fondo de la ventana.
 *
 * Es decoracion y nada mas: no se pulsa, no dice nada que no diga ya la barra de titulo, y
 * por eso va con `aria-hidden` y sin texto. La opacidad es la justa para que se note que
 * la ventana es de algo y no se note mientras se leen los ajustes; en claro hace falta un
 * pelin mas que en oscuro, porque el gris claro tapa menos.
 */
export function MarcaDeAgua() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="pointer-events-none absolute right-7 bottom-16 size-[230px] text-titulo opacity-[0.03] dark:opacity-[0.04]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="6"
    >
      {/* Las cuatro esquinas del recorte y la equis de dentro, como el icono. */}
      <path d="M8 22v-8a6 6 0 0 1 6-6h8" />
      <path d="M42 8h8a6 6 0 0 1 6 6v8" />
      <path d="M56 42v8a6 6 0 0 1-6 6h-8" />
      <path d="M22 56h-8a6 6 0 0 1-6-6v-8" />
      <path d="M24 24 40 40" />
      <path d="M40 24 24 40" />
    </svg>
  );
}

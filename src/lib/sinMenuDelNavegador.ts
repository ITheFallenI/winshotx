/**
 * Quita el menu del clic derecho que trae WebView2 («Compartir», «Imprimir», «Guardar
 * como», «Inspeccionar»…). Es el de un navegador, no el de winshotx: en una ventana de
 * ajustes o en el editor no pinta nada, y «Compartir» mandaba la pagina interna de la app.
 *
 * Se queda solo en los campos de texto, donde cortar, copiar y pegar si sirven.
 *
 * Se registra al importarlo, una vez por ventana: cada ventana tiene su propia entrada
 * (`main.tsx`, `editor.tsx`, `overlay.tsx`…) y todas importan este archivo.
 */
export function esEditable(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false;
  if (objetivo.isContentEditable) return true;
  if (objetivo instanceof HTMLTextAreaElement) return !objetivo.readOnly;
  if (objetivo instanceof HTMLInputElement) {
    const conTexto = ["text", "search", "url", "email", "password", "number", "tel", ""];
    return conTexto.includes(objetivo.type) && !objetivo.readOnly;
  }
  return false;
}

export function quitarMenuDelNavegador(doc: Document = document): () => void {
  const alAbrir = (e: MouseEvent) => {
    if (!esEditable(e.target)) e.preventDefault();
  };
  doc.addEventListener("contextmenu", alAbrir);
  return () => doc.removeEventListener("contextmenu", alAbrir);
}

quitarMenuDelNavegador();

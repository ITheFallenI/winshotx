import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ExternalLink, Maximize, Minus, Plus, X } from "lucide-react";
import type { GalleryItem } from "../../lib/gallery";
import { useT } from "../../lib/i18n";

type Size = { width: number; height: number };
export type ImageView = { scale: number; x: number; y: number; fitted: boolean };
export function fitScale(image: Size, viewport: Size) {
  return Math.min(1, viewport.width / image.width, viewport.height / image.height);
}
export function clampView(view: ImageView, image: Size, viewport: Size): ImageView {
  const x = Math.max(0, (image.width * view.scale - viewport.width) / 2);
  const y = Math.max(0, (image.height * view.scale - viewport.height) / 2);
  return { ...view, x: Math.max(-x, Math.min(x, view.x)), y: Math.max(-y, Math.min(y, view.y)) };
}
export function zoomView(view: ImageView, scale: number, anchor: { x: number; y: number }, image: Size, viewport: Size) {
  scale = Math.max(Math.min(0.05, fitScale(image, viewport)), Math.min(8, scale));
  const ratio = scale / view.scale;
  return clampView({ scale, x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio, fitted: false }, image, viewport);
}

/** Only the explicitly selected original is loaded. Removing a video releases its decoder. */
export function MediaPreview({ item, onClose, onOpen }: { item: GalleryItem; onClose: () => void; onOpen: () => void }) {
  const t = useT();
  const holder = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; view: ImageView } | null>(null);
  const [image, setImage] = useState<Size | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: 1, height: 1 });
  const [view, setView] = useState<ImageView>({ scale: 1, x: 0, y: 0, fitted: true });
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const node = video.current;
    return () => { if (node) { node.pause(); node.removeAttribute("src"); node.load(); } previous?.focus(); };
  }, []);
  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!image) return;
    setView(v => v.fitted ? { scale: fitScale(image, viewport), x: 0, y: 0, fitted: true } : clampView(v, image, viewport));
  }, [image, viewport]);
  useEffect(() => {
    const node = holder.current;
    if (!node || !image) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
      if (event.ctrlKey) {
        const rect = node.getBoundingClientRect();
        const anchor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
        setView(v => zoomView(v, v.scale * Math.exp(-event.deltaY * unit * 0.002), anchor, image, viewport));
      } else {
        setView(v => clampView({ ...v, x: v.x - event.deltaX * unit, y: v.y - event.deltaY * unit }, image, viewport));
      }
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [image, viewport]);
  const zoom = (factor: number) => { if (image) setView(v => zoomView(v, v.scale * factor, { x: 0, y: 0 }, image, viewport)); };
  const fit = () => { if (image) setView({ scale: fitScale(image, viewport), x: 0, y: 0, fitted: true }); };
  // Hecha como el editor: barra arriba con el nombre y lo que se hace con él, la imagen en
  // medio sobre el fondo oscuro, y el zoom abajo, en la barra de estado.
  return <div className="fixed inset-0 z-30 flex flex-col bg-lienzo text-texto" role="dialog" aria-label={t("Vista previa de {nombre}", { nombre: item.name })} aria-modal="true">
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-linea bg-tarjeta px-3">
      <strong className="min-w-0 flex-1 truncate text-[13px] font-semibold text-titulo">{item.name}</strong>
      <button onClick={onOpen} className="flex h-7 items-center gap-1.5 rounded-md bg-realce px-2.5 text-[12px] font-medium hover:bg-activo hover:text-titulo">
        <ExternalLink className="size-3.5" />{t("Abrir con la aplicación de Windows")}
      </button>
      <button ref={close} onClick={onClose} aria-label={t("Cerrar la vista previa")} title={t("Cerrar (Esc)")}
        className="flex size-7 items-center justify-center rounded-md text-apagado hover:bg-realce hover:text-titulo"><X className="size-4" /></button>
    </header>
    {item.kind === "video" ? <video ref={video} src={convertFileSrc(item.path)} preload="none" controls className="min-h-0 flex-1 bg-black object-contain"
      onError={() => setError(t("Este vídeo no se puede reproducir aquí. Ábrelo con la aplicación de Windows."))} /> :
      <div ref={holder} aria-label={t("Zona de la imagen")} className="relative min-h-0 flex-1 touch-none overflow-hidden" style={{ cursor: image ? "grab" : "default" }}
        onPointerDown={e => {
          if (!image || e.button !== 0) return;
          e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, view };
          e.currentTarget.style.cursor = "grabbing";
        }}
        onPointerMove={e => { const d = drag.current; if (!d || d.id !== e.pointerId || !image) return;
          setView(clampView({ ...d.view, x: d.view.x + e.clientX - d.x, y: d.view.y + e.clientY - d.y }, image, viewport)); }}
        onLostPointerCapture={() => { drag.current = null; if (holder.current) holder.current.style.cursor = "grab"; }}
        onPointerUp={e => { if (drag.current?.id === e.pointerId) { drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); e.currentTarget.style.cursor = "grab"; } }}
        onPointerCancel={() => { drag.current = null; }} onDoubleClick={fit}>
        <img src={convertFileSrc(item.path)} alt={item.name} draggable={false} decoding="async" onLoad={e => {
          setImage({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
        }} onError={() => setError(t("No se ha podido cargar la imagen."))}
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
          style={{ width: image?.width, height: image?.height, visibility: image ? "visible" : "hidden",
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />
      </div>}
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-linea bg-tarjeta px-2 text-[11.5px] text-apagado">
      {item.kind !== "video" && <>
        <div className="flex items-center gap-0.5">
          <button aria-label={t("Alejar")} disabled={!image} onClick={() => zoom(1 / 1.25)}
            className="flex size-6 items-center justify-center rounded hover:bg-realce hover:text-titulo"><Minus className="size-3.5" /></button>
          <output aria-label={t("Nivel de zoom")} className="w-12 text-center text-titulo tabular-nums">{Math.round(view.scale * 100)}%</output>
          <button aria-label={t("Acercar")} disabled={!image} onClick={() => zoom(1.25)}
            className="flex size-6 items-center justify-center rounded hover:bg-realce hover:text-titulo"><Plus className="size-3.5" /></button>
        </div>
        <button disabled={!image} onClick={fit} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-realce hover:text-titulo"><Maximize className="size-3.5" />{t("Ajustar")}</button>
        <button disabled={!image} onClick={() => { if (image) setView(clampView({ scale: 1, x: 0, y: 0, fitted: false }, image, viewport)); }}
          className="rounded px-1.5 py-0.5 hover:bg-realce hover:text-titulo">100%</button>
        {image && <><span className="h-4 w-px bg-linea" /><span className="tabular-nums">{image.width} × {image.height} px</span></>}
        <span className="h-4 w-px bg-linea" />
        <span className="truncate">{t("Ctrl + rueda para acercar · arrastra para moverte")}</span>
      </>}
      {error && <span role="alert" className="ms-auto truncate text-amber-400">{error}</span>}
    </footer>
  </div>;
}

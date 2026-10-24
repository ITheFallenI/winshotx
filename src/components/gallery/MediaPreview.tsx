import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Maximize, X, ZoomIn, ZoomOut } from "lucide-react";
import type { GalleryItem } from "../../lib/gallery";

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
  return <div className="fixed inset-0 z-30 flex flex-col bg-black/95 p-4 text-white" role="dialog" aria-label={`Preview ${item.name}`} aria-modal="true">
    <header className="flex shrink-0 items-center gap-3 pb-3"><strong className="min-w-0 flex-1 truncate">{item.name}</strong>
      <button onClick={onOpen} className="rounded bg-white/10 px-3 py-1.5 text-sm">Open in default app</button>
      <button ref={close} onClick={onClose} aria-label="Close preview" className="p-2"><X /></button></header>
    {item.kind !== "video" && <div className="flex shrink-0 items-center justify-center gap-3 pb-3 text-sm">
      <button aria-label="Zoom out" disabled={!image} onClick={() => zoom(1 / 1.25)} className="rounded p-2 hover:bg-white/10"><ZoomOut className="size-4" /></button>
      <output aria-label="Zoom level" className="w-14 text-center">{Math.round(view.scale * 100)}%</output>
      <button aria-label="Zoom in" disabled={!image} onClick={() => zoom(1.25)} className="rounded p-2 hover:bg-white/10"><ZoomIn className="size-4" /></button>
      <button disabled={!image} onClick={fit} className="flex items-center gap-1 rounded bg-white/10 px-3 py-1.5"><Maximize className="size-4" />Fit</button>
      <button disabled={!image} onClick={() => { if (image) setView(clampView({ scale: 1, x: 0, y: 0, fitted: false }, image, viewport)); }} className="rounded bg-white/10 px-3 py-1.5">100%</button>
      <span className="text-xs text-white/60">Ctrl + mouse wheel to zoom · Drag to pan</span>
    </div>}
    {item.kind === "video" ? <video ref={video} src={convertFileSrc(item.path)} preload="none" controls className="min-h-0 flex-1 object-contain"
      onError={() => setError("Playback unavailable here. Use Open in default app for this video.")} /> :
      <div ref={holder} aria-label="Image viewport" className="relative min-h-0 flex-1 touch-none overflow-hidden" style={{ cursor: image ? "grab" : "default" }}
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
        }} onError={() => setError("Could not load this image.")}
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
          style={{ width: image?.width, height: image?.height, visibility: image ? "visible" : "hidden",
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />
      </div>}
    {error && <p role="alert" className="pt-2 text-sm text-amber-300">{error}</p>}
  </div>;
}

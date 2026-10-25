import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveComparison } from "../../lib/gallery";
import type { PixelImage } from "../../lib/imageDifference";
import { ArrowLeft, ArrowLeftRight, Save } from "lucide-react";
import { t, useT } from "../../lib/i18n";
import { Segmented } from "../ui/Segmented";

function load(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => resolve(image); image.onerror = () => reject(new Error(t("No se ha podido abrir esta imagen.")));
    image.src = convertFileSrc(path);
  });
}
function pixels(image: HTMLImageElement): PixelImage {
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  if (canvas.width * canvas.height > 40_000_000) throw new Error(t("Solo se comparan imágenes de hasta 40 millones de píxeles."));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
export function ImageComparison({ paths, onClose }: { paths: [string, string]; onClose: () => void }) {
  const tr = useT();
  const [images, setImages] = useState<[HTMLImageElement, HTMLImageElement] | null>(null);
  const [swap, setSwap] = useState(false), [divider, setDivider] = useState(50), [mode, setMode] = useState("slider");
  const [tolerance, setTolerance] = useState(0), [zoom, setZoom] = useState(.5);
  const [status, setStatus] = useState(t("Cargando las imágenes…")), [error, setError] = useState("");
  const [saving, setSaving] = useState(false), [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    Promise.all(paths.map(load)).then(result => { if (active) setImages(result as [HTMLImageElement, HTMLImageElement]); })
      .catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [paths]);
  const before = images?.[swap ? 1 : 0], after = images?.[swap ? 0 : 1];
  const width = before && after ? Math.max(before.naturalWidth, after.naturalWidth) : 1;
  const height = before && after ? Math.max(before.naturalHeight, after.naturalHeight) : 1;
  useEffect(() => {
    if (!before || !after) return;
    setReady(false); setStatus(t("Comparando…"));
    const worker = new Worker(new URL("../../lib/imageDifference.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => {
      if (event.data.error) { setError(event.data.error); return; }
      const result = event.data.result;
      const c = canvas.current;
      if (c) { c.width = result.width; c.height = result.height;
        c.getContext("2d")!.putImageData(new ImageData(result.data, result.width, result.height), 0, 0); }
      setReady(true); setStatus(t("{n} píxeles distintos · {p} % iguales", { n: result.changed.toLocaleString(), p: (100 * (1 - result.changed / (result.width * result.height))).toFixed(2) }));
    };
    worker.onerror = () => setError(t("No se han podido comparar las imágenes."));
    const timer = setTimeout(() => {
      try { const a = pixels(before), b = pixels(after); worker.postMessage({ a, b, tolerance }, [a.data.buffer, b.data.buffer]); }
      catch (e) { setError(String(e)); }
    }, 180);
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [before, after, tolerance]);
  const save = async () => {
    if (!before || !after || !canvas.current) return;
    setSaving(true); setError("");
    try {
      let output = canvas.current;
      if (mode === "slider") {
        output = document.createElement("canvas"); output.width = before.naturalWidth + after.naturalWidth;
        output.height = height;
        if (output.width * height > 40_000_000) throw new Error(t("Solo se guardan imágenes de hasta 40 millones de píxeles."));
        const ctx = output.getContext("2d")!; ctx.drawImage(before, 0, 0); ctx.drawImage(after, before.naturalWidth, 0);
      }
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(b => b ? resolve(b) : reject(new Error(t("No se ha podido crear el PNG."))), "image/png"));
      const path = await saveComparison(Array.from(new Uint8Array(await blob.arrayBuffer())));
      setStatus(t("Guardada en {ruta}", { ruta: path }));
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  };
  const nombre = (i: 0 | 1) => paths[i].split(/[\\/]/).pop();
  const distintas = before && after && (before.naturalWidth !== after.naturalWidth || before.naturalHeight !== after.naturalHeight);
  // Como el editor: la barra de arriba con lo que se elige, la imagen en medio y el estado
  // abajo, en la barra de estado.
  return <section className="fixed inset-0 z-40 flex flex-col bg-lienzo text-texto">
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-linea bg-tarjeta px-3">
      <button onClick={onClose} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-apagado hover:bg-realce hover:text-titulo">
        <ArrowLeft className="size-3.5" />{tr("Galería")}
      </button>
      <span className="h-5 w-px bg-linea" />
      <strong className="me-1 text-[13px] font-semibold text-titulo">{tr("Antes y después")}</strong>
      <Segmented compacto ajustado etiqueta={tr("Modo de comparación")} value={mode}
        options={[{ value: "slider", label: tr("Cortina") }, { value: "diff", label: tr("Diferencias") }]} onChange={setMode} />
      <button onClick={() => setSwap(v => !v)} className="flex h-7 items-center gap-1.5 rounded-md bg-realce px-2.5 text-[12px] font-medium hover:bg-activo hover:text-titulo">
        <ArrowLeftRight className="size-3.5" />{tr("Intercambiar")}
      </button>
      <Segmented compacto ajustado etiqueta={tr("Zoom de la comparación")} value={zoom}
        options={[.25, .5, 1, 2].map(z => ({ value: z, label: `${z * 100}%` }))} onChange={setZoom} />
      <span className="mx-1 flex min-w-0 items-center gap-2 text-[11.5px] text-apagado">
        {mode === "slider"
          ? <>{tr("Cortina")}<input aria-label={tr("Posición de la cortina")} className="w-28 accent-[var(--color-marca)]" type="range" min={0} max={100} value={divider} onChange={e => setDivider(Number(e.target.value))} /></>
          : <>{tr("Tolerancia: {n}", { n: tolerance })}<input aria-label={tr("Tolerancia al ruido")} className="w-28 accent-[var(--color-marca)]" type="range" min={0} max={64} value={tolerance} onChange={e => setTolerance(Number(e.target.value))} /></>}
      </span>
      <button disabled={!ready || saving} onClick={() => void save()}
        className="ms-auto flex h-7 items-center gap-1.5 rounded-md bg-marca px-3 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40">
        <Save className="size-3.5" />{saving ? tr("Guardando…") : mode === "diff" ? tr("Guardar las diferencias") : tr("Guardar una al lado de otra")}
      </button>
    </header>
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="relative bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:16px_16px]" style={{ width: width * zoom, height: height * zoom }}
        onPointerDown={e => { if (mode !== "slider" || e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect(); setDivider(Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))); }}
        onPointerMove={e => { if (mode !== "slider" || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const rect = e.currentTarget.getBoundingClientRect(); setDivider(Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))); }}
        onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>
        {before && mode === "slider" && <img alt={tr("Antes")} src={before.src} draggable={false} style={{ width: before.naturalWidth * zoom, height: before.naturalHeight * zoom, maxWidth: "none" }} />}
        {after && mode === "slider" && <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${divider}%)` }}>
          <img alt={tr("Después")} src={after.src} draggable={false} style={{ width: after.naturalWidth * zoom, height: after.naturalHeight * zoom, maxWidth: "none" }} />
        </div>}
        <canvas ref={canvas} className={mode === "diff" ? "block" : "hidden"} style={{ width: width * zoom, height: height * zoom }} />
        {mode === "slider" && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-marca" style={{ left: `${divider}%` }} />}
      </div>
    </div>
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-linea bg-tarjeta px-3 text-[11.5px] text-apagado">
      {before && after && <>
        <span className="truncate">{tr("Antes")}: {nombre(swap ? 1 : 0)} · <span className="tabular-nums">{before.naturalWidth} × {before.naturalHeight}</span></span>
        <span className="h-4 w-px bg-linea" />
        <span className="truncate">{tr("Después")}: {nombre(swap ? 0 : 1)} · <span className="tabular-nums">{after.naturalWidth} × {after.naturalHeight}</span></span>
        {distintas && <span className="truncate text-amber-400">{tr("Miden distinto: se alinean a su tamaño real")}</span>}
      </>}
      <span role="status" className={`ms-auto truncate ${error ? "text-red-400" : "text-marca"}`}>{error || status}</span>
    </footer>
  </section>;
}

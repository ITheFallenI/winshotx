import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveComparison } from "../../lib/gallery";
import type { PixelImage } from "../../lib/imageDifference";

function load(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => resolve(image); image.onerror = () => reject(new Error("This image could not be opened."));
    image.src = convertFileSrc(path);
  });
}
function pixels(image: HTMLImageElement): PixelImage {
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  if (canvas.width * canvas.height > 40_000_000) throw new Error("Comparison is limited to 40 million pixels.");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
export function ImageComparison({ paths, onClose }: { paths: [string, string]; onClose: () => void }) {
  const [images, setImages] = useState<[HTMLImageElement, HTMLImageElement] | null>(null);
  const [swap, setSwap] = useState(false), [divider, setDivider] = useState(50), [mode, setMode] = useState("slider");
  const [tolerance, setTolerance] = useState(0), [zoom, setZoom] = useState(.5);
  const [status, setStatus] = useState("Loading images…"), [error, setError] = useState("");
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
    setReady(false); setStatus("Comparing…");
    const worker = new Worker(new URL("../../lib/imageDifference.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => {
      if (event.data.error) { setError(event.data.error); return; }
      const result = event.data.result;
      const c = canvas.current;
      if (c) { c.width = result.width; c.height = result.height;
        c.getContext("2d")!.putImageData(new ImageData(result.data, result.width, result.height), 0, 0); }
      setReady(true); setStatus(`${result.changed.toLocaleString()} changed pixels · ${(100 * (1 - result.changed / (result.width * result.height))).toFixed(2)}% matching`);
    };
    worker.onerror = () => setError("Image comparison failed.");
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
        if (output.width * height > 40_000_000) throw new Error("Export is limited to 40 million pixels.");
        const ctx = output.getContext("2d")!; ctx.drawImage(before, 0, 0); ctx.drawImage(after, before.naturalWidth, 0);
      }
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(b => b ? resolve(b) : reject(new Error("Could not create PNG.")), "image/png"));
      const path = await saveComparison(Array.from(new Uint8Array(await blob.arrayBuffer())));
      setStatus(`Saved: ${path}`);
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  };
  return <section className="fixed inset-0 z-40 flex flex-col bg-lienzo text-texto">
    <header className="flex flex-wrap items-center gap-3 border-b border-linea p-3">
      <button onClick={onClose} className="rounded bg-realce px-3 py-1.5">Back to gallery</button>
      <strong>Before / after</strong>
      <button onClick={() => setSwap(v => !v)} className="rounded bg-realce px-3 py-1.5">Swap</button>
      <select aria-label="Comparison mode" value={mode} onChange={e => setMode(e.target.value)} className="rounded bg-hueco p-1.5">
        <option value="slider">Reveal slider</option><option value="diff">Differences</option>
      </select>
      <label className="text-sm">Zoom <select aria-label="Comparison zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="bg-hueco p-1">
        {[.25,.5,1,2].map(z => <option key={z} value={z}>{z * 100}%</option>)}</select></label>
      <button disabled={!ready || saving} onClick={() => void save()} className="ms-auto rounded bg-blue-500 px-3 py-1.5 text-white disabled:opacity-40">{saving ? "Saving…" : mode === "diff" ? "Save difference PNG" : "Save side-by-side PNG"}</button>
    </header>
    {before && after && <div className="flex flex-wrap gap-5 border-b border-linea px-4 py-2 text-xs">
      <span>Before: {paths[swap ? 1 : 0].split(/[\\/]/).pop()} · {before.naturalWidth} × {before.naturalHeight}</span>
      <span>After: {paths[swap ? 0 : 1].split(/[\\/]/).pop()} · {after.naturalWidth} × {after.naturalHeight}</span>
      {(before.naturalWidth !== after.naturalWidth || before.naturalHeight !== after.naturalHeight) && <span className="text-amber-400">Different dimensions · aligned at original pixel scale</span>}
    </div>}
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="relative bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:16px_16px]" style={{ width: width * zoom, height: height * zoom }}
        onPointerDown={e => { if (mode !== "slider" || e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect(); setDivider(Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))); }}
        onPointerMove={e => { if (mode !== "slider" || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const rect = e.currentTarget.getBoundingClientRect(); setDivider(Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))); }}
        onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>
        {before && mode === "slider" && <img alt="Before" src={before.src} draggable={false} style={{ width: before.naturalWidth * zoom, height: before.naturalHeight * zoom, maxWidth: "none" }} />}
        {after && mode === "slider" && <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${divider}%)` }}>
          <img alt="After" src={after.src} draggable={false} style={{ width: after.naturalWidth * zoom, height: after.naturalHeight * zoom, maxWidth: "none" }} />
        </div>}
        <canvas ref={canvas} className={mode === "diff" ? "block" : "hidden"} style={{ width: width * zoom, height: height * zoom }} />
        {mode === "slider" && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-blue-400" style={{ left: `${divider}%` }} />}
      </div>
    </div>
    <footer className="space-y-2 border-t border-linea p-3 text-sm">
      {mode === "slider" ? <label className="flex gap-3">Before / after<input aria-label="Reveal divider" className="flex-1" type="range" min={0} max={100} value={divider} onChange={e => setDivider(Number(e.target.value))} /></label>
        : <label className="flex items-center gap-3">Noise tolerance: {tolerance}<input aria-label="Noise tolerance" type="range" min={0} max={64} value={tolerance} onChange={e => setTolerance(Number(e.target.value))} /></label>}
      <p role="status" className={error ? "text-red-400" : "text-apagado"}>{error || status}</p>
    </footer>
  </section>;
}

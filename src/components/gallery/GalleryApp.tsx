import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Image as ImageIcon, Video, FolderOpen, RefreshCw, Images } from "lucide-react";
import { chooseComparison, galleryAction, galleryThumbnail, listGallery, manageGallery, type GalleryItem, type GalleryPage } from "../../lib/gallery";
import { getSettings, openImage, openFolder } from "../../lib/ipc";
import { aplicarTema } from "../../lib/tema";
import { aplicarIdioma } from "../../lib/i18n";
import { formatBytes } from "../../lib/format";
import { ImageComparison } from "./ImageComparison";
import { MediaPreview } from "./MediaPreview";

function Thumbnail({ item }: { item: GalleryItem }) {
  const [src, setSrc] = useState("");
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSrc("");
    if (item.kind !== "image") return;
    let controller: AbortController | null = null;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        if (controller) return;
        const request = controller = new AbortController();
        void galleryThumbnail(item.path, request.signal).then(path => {
          if (!request.signal.aborted) setSrc(convertFileSrc(path));
        }).catch(() => {});
      } else { controller?.abort(); controller = null; setSrc(""); }
    }, { rootMargin: "180px" });
    if (holder.current) observer.observe(holder.current);
    return () => { controller?.abort(); observer.disconnect(); };
  }, [item.path, item.modified, item.kind]);
  return <div ref={holder} className="flex h-32 items-center justify-center overflow-hidden rounded-t-lg bg-black/20">
    {src ? <img src={src} alt="" className="size-full object-contain" /> : item.kind === "image" ? <ImageIcon className="size-9 text-apagado" /> : <Video className="size-9 text-apagado" />}
    {item.kind === "gif" && <span className="ms-2 text-xs text-apagado">GIF</span>}
  </div>;
}
export function GalleryApp({ embedded = false }: { embedded?: boolean }) {
  const [page, setPage] = useState<GalleryPage | null>(null);
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all"), [day, setDay] = useState("");
  const [offset, setOffset] = useState(0), [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [compare, setCompare] = useState<[string, string] | null>(null);
  const [preview, setPreview] = useState<GalleryItem | null>(null);
  const [mutation, setMutation] = useState<{ item: GalleryItem; operation: "rename" | "recycle" } | null>(null);
  const [newName, setNewName] = useState(""), [mutationError, setMutationError] = useState(""), [mutating, setMutating] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current; setLoading(true);
    try {
      const result = await listGallery(query, kind, day, offset);
      if (version === generation.current) {
        if (!result.items.length && offset > 0 && result.total <= offset) { setOffset(Math.max(0, Math.floor((result.total - 1) / 60) * 60)); return; }
        setPage(result);
      }
    } catch (e) { if (version === generation.current) setMessage(String(e)); }
    finally { if (version === generation.current) setLoading(false); }
  }, [query, kind, day, offset]);
  useEffect(() => {
    if (!embedded) void getSettings().then(settings => { aplicarTema(settings.theme); aplicarIdioma(settings.language); }).catch(e => setMessage(String(e)));
  }, [embedded]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 180);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener("focus", focus); generation.current++; };
  }, [refresh]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,select,textarea")) return;
      if (e.key === "Escape") { if (compare) setCompare(null); else setPreview(null); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); void openImage(null, true).catch(error => setMessage(String(error))); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [compare]);
  const action = async (item: GalleryItem, operation: "open" | "copy" | "reveal") => {
    try { await galleryAction(item.path, operation); if (operation === "copy") setMessage(`Copied ${item.name}`); }
    catch (e) { setMessage(String(e)); }
  };
  const edit = (item?: GalleryItem) => { void openImage(item?.path ?? null).catch(e => setMessage(String(e))); };
  const manage = async () => {
    if (!mutation || mutating) return;
    setMutating(true); setMutationError("");
    try {
      await manageGallery(mutation.item.path, mutation.operation, mutation.operation === "rename" ? newName : null);
      setSelected(v => v.filter(path => path !== mutation.item.path)); setPreview(null);
      setMessage(mutation.operation === "rename" ? "Capture renamed." : "Capture moved to the Recycle Bin.");
      setMutation(null); await refresh();
    } catch (e) { setMutationError(String(e)); } finally { setMutating(false); }
  };
  return <div className={`flex ${embedded ? "h-full min-h-0" : "h-screen"} flex-col bg-lienzo text-texto`}>
    <header className="flex flex-wrap items-center gap-3 border-b border-linea px-4 py-3">
      <Images className="size-5 text-marca" /><h1 className={embedded ? "sr-only" : "font-semibold"}>Capture gallery</h1>
      <button onClick={() => edit()} className="rounded bg-realce px-3 py-1.5 text-sm">Open image…</button>
      <button onClick={() => { void chooseComparison().then(paths => { if (paths.length === 2) setCompare(paths as [string,string]); }).catch(e => setMessage(String(e))); }} className="rounded bg-realce px-3 py-1.5 text-sm">Compare files…</button>
      <button disabled={selected.length !== 2} onClick={() => setCompare(selected as [string,string])} className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white disabled:opacity-40">Compare selected ({selected.length}/2)</button>
      <button title="Refresh gallery" aria-label="Refresh gallery" onClick={() => void refresh()} className="ms-auto rounded p-2 hover:bg-realce"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button>
      <button title="Open capture folder" aria-label="Open capture folder" disabled={!page?.directory} onClick={() => { if (page) void openFolder(page.directory).catch(e => setMessage(String(e))); }} className="rounded p-2 hover:bg-realce"><FolderOpen className="size-4" /></button>
    </header>
    <div className="flex flex-wrap items-center gap-3 border-b border-linea px-4 py-2">
      <input aria-label="Search captures" placeholder="Search filenames…" value={query} onChange={e => { setQuery(e.target.value); setOffset(0); setSelected([]); }} className="min-w-40 flex-1 rounded border border-linea bg-hueco px-3 py-2 text-sm" />
      <select aria-label="Media type" value={kind} onChange={e => { setKind(e.target.value); setOffset(0); setSelected([]); }} className="rounded bg-hueco p-2 text-sm"><option value="all">Images & videos</option><option value="images">Images</option><option value="videos">Videos & GIFs</option></select>
      <input type="date" aria-label="Capture date" value={day} onChange={e => { setDay(e.target.value); setOffset(0); setSelected([]); }} className="rounded bg-hueco p-2 text-sm" />
      {(day || query) && <button onClick={() => { setDay(""); setQuery(""); setOffset(0); }} className="text-sm text-marca">Clear filters</button>}
    </div>
    <main className="min-h-0 flex-1 overflow-auto p-4" aria-label="Saved captures">
      {!page && <p className="text-apagado">Loading captures…</p>}
      {page?.items.length === 0 && <p className="py-12 text-center text-apagado">No captures found. Saved screenshots and recordings appear here.</p>}
      {page && Array.from(new Set(page.items.map(item => item.day))).map(date => <section key={date} className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-apagado">{date}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {page.items.filter(item => item.day === date).map(item => <article key={item.path} className={`overflow-hidden rounded-lg border bg-tarjeta ${selected.includes(item.path) ? "border-marca" : "border-linea"}`}>
            <button onClick={() => setPreview(item)} className="block w-full" aria-label={`Preview ${item.name}`}><Thumbnail item={item} /></button>
            <div className="space-y-2 p-2.5">
              <div className="flex items-center gap-2">
                {item.kind === "image" && <input type="checkbox" aria-label={`Compare ${item.name}`} checked={selected.includes(item.path)}
                  disabled={selected.length === 2 && !selected.includes(item.path)} onChange={e => setSelected(v => e.target.checked ? [...v,item.path] : v.filter(path => path !== item.path))} />}
                <p title={item.name} className="truncate text-xs font-medium">{item.name}</p>
              </div>
              <p className="text-[11px] text-apagado">{item.kind.toUpperCase()} · {formatBytes(item.bytes)}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {item.kind === "image" && <button onClick={() => edit(item)} className="text-marca">Edit</button>}
                <button onClick={() => void action(item,"copy")} className="text-marca">Copy</button>
                <button onClick={() => void action(item,"open")} className="text-marca">Open</button>
                <button onClick={() => void action(item,"reveal")} className="text-apagado">Show in folder</button>
                <button onClick={() => { setMutation({ item, operation: "rename" }); setNewName(item.name); setMutationError(""); }} className="text-apagado">Rename</button>
                <button onClick={() => { setMutation({ item, operation: "recycle" }); setMutationError(""); }} className="text-red-500">Delete</button>
              </div>
            </div>
          </article>)}
        </div>
      </section>)}
    </main>
    <footer className="flex items-center gap-3 border-t border-linea px-4 py-2 text-xs text-apagado">
      <span>{page ? `${page.total} captures · ${page.total ? offset + 1 : 0}–${Math.min(offset + 60, page.total)}` : ""}</span>
      <span role="status" className="min-w-0 flex-1 truncate" title={message}>{message || page?.directory}</span>
      <button disabled={offset === 0 || loading} onClick={() => setOffset(v => Math.max(0, v - 60))} className="rounded bg-realce px-3 py-1.5 disabled:opacity-30">Previous</button>
      <button disabled={!page || offset + 60 >= page.total || loading} onClick={() => setOffset(v => v + 60)} className="rounded bg-realce px-3 py-1.5 disabled:opacity-30">Next</button>
    </footer>
    {preview && <MediaPreview key={preview.path} item={preview} onClose={() => setPreview(null)} onOpen={() => void action(preview, "open")} />}
    {mutation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form role="dialog" aria-modal="true" aria-labelledby="manage-capture-title" onSubmit={e => { e.preventDefault(); void manage(); }} className="w-full max-w-md rounded-xl border border-linea bg-flotante p-5 shadow-xl">
        <h2 id="manage-capture-title" className="font-semibold">{mutation.operation === "rename" ? "Rename capture" : "Move capture to the Recycle Bin?"}</h2>
        <p className="mt-2 break-all text-sm text-apagado">{mutation.item.name}</p>
        {mutation.operation === "rename" && <input autoFocus aria-label="New filename" value={newName} onChange={e => setNewName(e.target.value)} className="mt-4 w-full rounded border border-linea bg-hueco px-3 py-2 text-sm" />}
        {mutation.operation === "recycle" && <p className="mt-3 text-sm">You can restore this file from the Windows Recycle Bin.</p>}
        {mutationError && <p role="alert" className="mt-3 text-sm text-red-500">{mutationError}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={mutating} onClick={() => setMutation(null)} className="rounded bg-realce px-3 py-2 text-sm">Cancel</button>
          <button disabled={mutating} type="submit" className={`rounded px-3 py-2 text-sm text-white disabled:opacity-40 ${mutation.operation === "rename" ? "bg-blue-500" : "bg-red-600"}`}>{mutating ? "Working…" : mutation.operation === "rename" ? "Rename" : "Move to Recycle Bin"}</button></div>
      </form>
    </div>}
    {compare && <ImageComparison paths={compare} onClose={() => { setCompare(null); void refresh(); }} />}
  </div>;
}

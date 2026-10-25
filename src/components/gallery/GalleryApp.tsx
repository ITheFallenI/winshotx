import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Check,
  Clipboard,
  Columns2,
  FileImage,
  FolderOpen,
  ImagePlus,
  Images,
  PenLine,
  Play,
  RefreshCw,
  Search,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { chooseComparison, galleryAction, galleryThumbnail, listGallery, manageGallery, type GalleryItem, type GalleryPage } from "../../lib/gallery";
import { getSettings, openImage, openFolder } from "../../lib/ipc";
import { aplicarTema } from "../../lib/tema";
import { aplicarIdioma, idiomaActivo, useT } from "../../lib/i18n";
import { formatBytes } from "../../lib/format";
import { MenuContextual } from "../foto/MenuContextual";
import type { Opcion } from "../foto/BarraMenu";
import { Segmented } from "../ui/Segmented";
import { ImageComparison } from "./ImageComparison";
import { MediaPreview } from "./MediaPreview";

const POR_PAGINA = 60;

/** La extensión en mayúsculas, que es lo que se reconoce de un vistazo: PNG, MP4, GIF. */
const extension = (item: GalleryItem) => item.name.split(".").pop()?.toUpperCase() ?? item.kind.toUpperCase();

/**
 * El día como se diría en voz alta: «Hoy», «Ayer», o el día de la semana con la fecha.
 * Una fecha ISO suelta («2026-10-25») obligaba a echar la cuenta para saber si era de hoy.
 */
function nombreDelDia(dia: string, t: ReturnType<typeof useT>): string {
  const [a, m, d] = dia.split("-").map(Number);
  if (!a || !m || !d) return dia;
  const fecha = new Date(a, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy.getTime() - fecha.getTime()) / 86_400_000);
  if (dias === 0) return t("Hoy");
  if (dias === 1) return t("Ayer");
  const idioma = { es: "es-ES", en: "en-GB", zh: "zh-CN" }[idiomaActivo()];
  return new Intl.DateTimeFormat(idioma, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(fecha.getFullYear() === hoy.getFullYear() ? {} : { year: "numeric" }),
  }).format(fecha);
}

const hora = (ms: number) =>
  ms > 0 ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms)) : "";

function Miniatura({ item }: { item: GalleryItem }) {
  const [src, setSrc] = useState("");
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSrc("");
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
  }, [item.path, item.modified]);
  const video = item.kind !== "image";
  return (
    <div ref={holder} className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-hueco">
      {src ? (
        // Los vídeos y GIF traen un fotograma de dentro, el mismo que el Explorador.
        <img src={src} alt="" draggable={false} className={`size-full ${video ? "object-cover" : "object-contain p-1.5"}`} />
      ) : !video && <FileImage className="size-8 text-fantasma" />}
      {video && (
        <span className="absolute flex size-11 items-center justify-center rounded-full bg-black/55 text-white/95 ring-1 ring-white/15 backdrop-blur-sm">
          <Play className="ms-0.5 size-5" fill="currentColor" />
        </span>
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-white/90">
        {extension(item)}
      </span>
    </div>
  );
}

/**
 * La galería de capturas: lo guardado, por días, con las acciones a mano.
 *
 * Hecha como el editor de imágenes, que es la parte de la aplicación que mejor se usa: una
 * barra arriba con lo que se puede hacer, la rejilla en medio y una barra de estado abajo.
 * Las acciones de cada captura salen al pasar por encima, como iconos, y todas están
 * también en el clic derecho; un doble clic abre la imagen en el editor.
 */
export function GalleryApp({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const [page, setPage] = useState<GalleryPage | null>(null);
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all"), [day, setDay] = useState("");
  const [offset, setOffset] = useState(0), [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [compare, setCompare] = useState<[string, string] | null>(null);
  const [preview, setPreview] = useState<GalleryItem | null>(null);
  const [mutation, setMutation] = useState<{ item: GalleryItem; operation: "rename" | "recycle" } | null>(null);
  const [newName, setNewName] = useState(""), [mutationError, setMutationError] = useState(""), [mutating, setMutating] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; opciones: (Opcion | null)[] } | null>(null);
  const cerrarMenu = useCallback(() => setMenu(null), []);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current; setLoading(true);
    try {
      const result = await listGallery(query, kind, day, offset);
      if (version === generation.current) {
        if (!result.items.length && offset > 0 && result.total <= offset) { setOffset(Math.max(0, Math.floor((result.total - 1) / POR_PAGINA) * POR_PAGINA)); return; }
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
      if (e.key === "Escape") { if (compare) setCompare(null); else if (preview) setPreview(null); else setSelected([]); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); void openImage(null, true).catch(error => setMessage(String(error))); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [compare, preview]);

  const action = async (item: GalleryItem, operation: "open" | "copy" | "reveal") => {
    try { await galleryAction(item.path, operation); if (operation === "copy") setMessage(t("Copiada: {nombre}", { nombre: item.name })); }
    catch (e) { setMessage(String(e)); }
  };
  const edit = (item?: GalleryItem) => { void openImage(item?.path ?? null).catch(e => setMessage(String(e))); };
  const renombrar = (item: GalleryItem) => { setMutation({ item, operation: "rename" }); setNewName(item.name); setMutationError(""); };
  const borrar = (item: GalleryItem) => { setMutation({ item, operation: "recycle" }); setMutationError(""); };
  const elegir = (item: GalleryItem) =>
    setSelected(v => v.includes(item.path) ? v.filter(p => p !== item.path) : v.length >= 2 ? [v[1], item.path] : [...v, item.path]);
  const manage = async () => {
    if (!mutation || mutating) return;
    setMutating(true); setMutationError("");
    try {
      await manageGallery(mutation.item.path, mutation.operation, mutation.operation === "rename" ? newName : null);
      setSelected(v => v.filter(path => path !== mutation.item.path)); setPreview(null);
      setMessage(mutation.operation === "rename" ? t("Captura renombrada.") : t("Captura movida a la papelera."));
      setMutation(null); await refresh();
    } catch (e) { setMutationError(String(e)); } finally { setMutating(false); }
  };
  const filtrar = (cambio: () => void) => { cambio(); setOffset(0); setSelected([]); };

  const menuDe = (e: React.MouseEvent, item: GalleryItem) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      opciones: [
        ...(item.kind === "image" ? [{ etiqueta: t("Editar"), accion: () => edit(item) }] : []),
        { etiqueta: t("Vista previa"), accion: () => setPreview(item) },
        { etiqueta: t("Abrir con la aplicación de Windows"), accion: () => void action(item, "open") },
        null,
        { etiqueta: t("Copiar"), accion: () => void action(item, "copy") },
        { etiqueta: t("Mostrar en la carpeta"), accion: () => void action(item, "reveal") },
        ...(item.kind === "image"
          ? [{ etiqueta: selected.includes(item.path) ? t("Quitar de la comparación") : t("Elegir para comparar"), accion: () => elegir(item) }]
          : []),
        null,
        { etiqueta: t("Cambiar el nombre"), accion: () => renombrar(item) },
        { etiqueta: t("Mover a la papelera"), accion: () => borrar(item) },
      ],
    });
  };

  const icono = (I: React.ComponentType<{ className?: string }>, etiqueta: string, onClick: () => void, peligro = false) => (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex size-7 items-center justify-center rounded-md text-white/85 transition-colors ${peligro ? "hover:bg-red-500/80" : "hover:bg-white/20"} hover:text-white`}
    >
      <I className="size-3.5" />
    </button>
  );

  const tarjeta = (item: GalleryItem) => {
    const elegida = selected.includes(item.path);
    return (
      <article
        key={item.path}
        onContextMenu={(e) => menuDe(e, item)}
        className={`group relative overflow-hidden rounded-lg border bg-tarjeta transition-colors ${
          elegida ? "border-marca ring-1 ring-marca" : "border-linea hover:border-linea-viva"
        }`}
      >
        <button
          type="button"
          onClick={() => setPreview(item)}
          onDoubleClick={() => (item.kind === "image" ? edit(item) : void action(item, "open"))}
          className="block w-full"
          aria-label={t("Vista previa de {nombre}", { nombre: item.name })}
        >
          <Miniatura item={item} />
        </button>
        {item.kind === "image" && (
          <button
            type="button"
            role="checkbox"
            aria-checked={elegida}
            aria-label={t("Comparar {nombre}", { nombre: item.name })}
            title={t("Elegir para comparar")}
            onClick={() => elegir(item)}
            className={`absolute top-2 left-2 flex size-5 items-center justify-center rounded-full border transition-opacity ${
              elegida
                ? "border-marca bg-marca text-white opacity-100"
                : "border-white/70 bg-black/40 text-transparent opacity-0 group-hover:opacity-100 hover:text-white/80"
            }`}
          >
            <Check className="size-3" strokeWidth={3} />
          </button>
        )}
        <div className="absolute top-1.5 right-1.5 flex gap-0.5 rounded-lg bg-black/65 p-0.5 opacity-0 backdrop-blur-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {item.kind === "image" && icono(SquarePen, t("Editar"), () => edit(item))}
          {icono(Clipboard, t("Copiar"), () => void action(item, "copy"))}
          {icono(FolderOpen, t("Mostrar en la carpeta"), () => void action(item, "reveal"))}
          {icono(PenLine, t("Cambiar el nombre"), () => renombrar(item))}
          {icono(Trash2, t("Borrar"), () => borrar(item), true)}
        </div>
        <div className="px-2.5 py-2">
          <p title={item.name} className="truncate text-[12px] font-medium text-titulo">{item.name}</p>
          <p className="mt-0.5 text-[11px] text-tenue tabular-nums">
            {[hora(item.modified), formatBytes(item.bytes)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </article>
    );
  };

  const dias = page ? Array.from(new Set(page.items.map(item => item.day))) : [];
  const hayFiltro = !!(day || query || kind !== "all");
  const boton = "flex h-7 items-center gap-1.5 rounded-md bg-realce px-2.5 text-[12px] font-medium text-texto transition-colors hover:bg-activo hover:text-titulo disabled:opacity-40";

  return <div className={`flex ${embedded ? "h-full min-h-0" : "h-screen"} flex-col bg-lienzo text-texto`}>
    {/* Arriba, como la barra de opciones del editor: qué es, y lo que se puede hacer. */}
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-linea bg-tarjeta px-3">
      <Images className="size-4 text-marca" />
      <h1 className="me-2 text-[13px] font-semibold text-titulo">{t("Galería")}</h1>
      <label className="relative flex min-w-36 max-w-72 flex-1 items-center">
        <Search className="pointer-events-none absolute left-2 size-3.5 text-tenue" />
        <input
          aria-label={t("Buscar capturas")}
          placeholder={t("Buscar por nombre…")}
          value={query}
          onChange={e => filtrar(() => setQuery(e.target.value))}
          className="h-7 w-full rounded-md border border-linea bg-hueco ps-7 pe-2 text-[12px] text-titulo outline-none placeholder:text-fantasma focus:border-marca"
        />
      </label>
      <Segmented
        compacto
        ajustado
        etiqueta={t("Tipo de archivo")}
        value={kind}
        options={[
          { value: "all", label: t("Todo") },
          { value: "images", label: t("Imágenes") },
          { value: "videos", label: t("Vídeos y GIF") },
        ]}
        onChange={v => filtrar(() => setKind(v))}
      />
      <input
        type="date"
        aria-label={t("Fecha de la captura")}
        value={day}
        onChange={e => filtrar(() => setDay(e.target.value))}
        className="h-7 rounded-md border border-linea bg-hueco px-2 text-[12px] text-texto outline-none focus:border-marca"
      />
      {hayFiltro && (
        <button type="button" onClick={() => { setDay(""); setQuery(""); setKind("all"); setOffset(0); }}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-marca hover:bg-realce">
          <X className="size-3.5" />{t("Quitar filtros")}
        </button>
      )}
      <span className="ms-auto" />
      <button type="button" onClick={() => edit()} className={boton}><ImagePlus className="size-3.5" />{t("Abrir imagen…")}</button>
      <button type="button" onClick={() => { void chooseComparison().then(paths => { if (paths.length === 2) setCompare(paths as [string, string]); }).catch(e => setMessage(String(e))); }}
        className={boton}><Columns2 className="size-3.5" />{t("Comparar archivos…")}</button>
      <span className="mx-0.5 h-5 w-px bg-linea" />
      <button type="button" title={t("Actualizar")} aria-label={t("Actualizar")} onClick={() => void refresh()}
        className="flex size-7 items-center justify-center rounded-md text-apagado hover:bg-realce hover:text-titulo">
        <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
      </button>
      <button type="button" title={t("Abrir la carpeta de capturas")} aria-label={t("Abrir la carpeta de capturas")} disabled={!page?.directory}
        onClick={() => { if (page) void openFolder(page.directory).catch(e => setMessage(String(e))); }}
        className="flex size-7 items-center justify-center rounded-md text-apagado hover:bg-realce hover:text-titulo disabled:opacity-40">
        <FolderOpen className="size-4" />
      </button>
    </header>

    {/* Al elegir capturas para comparar sale esta franja, como la pista del editor. */}
    {selected.length > 0 && (
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-linea bg-marca/10 px-3 text-[12px]">
        <span className="text-titulo">
          {selected.length === 1 ? t("1 imagen elegida: elige otra para compararlas") : t("2 imágenes elegidas")}
        </span>
        <button type="button" disabled={selected.length !== 2} onClick={() => setCompare(selected as [string, string])}
          className="flex h-6 items-center gap-1.5 rounded-md bg-marca px-2.5 font-medium text-white disabled:opacity-40">
          <Columns2 className="size-3.5" />{t("Comparar")}
        </button>
        <button type="button" onClick={() => setSelected([])} className="text-apagado hover:text-titulo">{t("Quitar la selección")}</button>
      </div>
    )}

    <main className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-4" aria-label={t("Capturas guardadas")}>
      {!page && <p className="py-12 text-center text-[12.5px] text-tenue">{t("Cargando capturas…")}</p>}
      {page?.items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-tarjeta ring-1 ring-linea">
            <Images className="size-7 text-marca" />
          </span>
          <p className="text-[14px] font-semibold text-titulo">{hayFiltro ? t("Nada coincide con la búsqueda") : t("Todavía no hay capturas")}</p>
          <p className="mt-1 max-w-sm text-[12.5px] text-apagado">
            {hayFiltro ? t("Prueba con otro nombre u otra fecha.") : t("Las capturas y grabaciones que guardes aparecen aquí, ordenadas por día.")}
          </p>
        </div>
      )}
      {page && dias.map(date => {
        const deEseDia = page.items.filter(item => item.day === date);
        return (
          <section key={date} className="mb-5">
            <h2 className="sticky top-0 z-10 -mx-4 mb-2 flex items-baseline gap-2 bg-lienzo/95 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-[12.5px] font-semibold text-titulo first-letter:uppercase">{nombreDelDia(date, t)}</span>
              <span className="text-[11px] text-tenue">{deEseDia.length}</span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {deEseDia.map(tarjeta)}
            </div>
          </section>
        );
      })}
    </main>

    <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-linea bg-tarjeta px-3 text-[11.5px] text-apagado">
      <span className="tabular-nums">
        {page ? (page.total > POR_PAGINA
          ? t("{desde}–{hasta} de {total} capturas", { desde: page.total ? offset + 1 : 0, hasta: Math.min(offset + POR_PAGINA, page.total), total: page.total })
          : page.total === 1 ? t("1 captura") : t("{n} capturas", { n: page.total })) : ""}
      </span>
      <span className="h-4 w-px bg-linea" />
      <span role="status" className={`min-w-0 flex-1 truncate ${message ? "text-marca" : ""}`} title={message || page?.directory}>{message || page?.directory}</span>
      {page && page.total > POR_PAGINA && <>
        <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(v => Math.max(0, v - POR_PAGINA))}
          className="rounded px-2 py-0.5 hover:bg-realce hover:text-titulo disabled:opacity-30">{t("Anterior")}</button>
        <button type="button" disabled={offset + POR_PAGINA >= page.total || loading} onClick={() => setOffset(v => v + POR_PAGINA)}
          className="rounded px-2 py-0.5 hover:bg-realce hover:text-titulo disabled:opacity-30">{t("Siguiente")}</button>
      </>}
    </footer>

    {menu && <MenuContextual x={menu.x} y={menu.y} opciones={menu.opciones} onCerrar={cerrarMenu} />}
    {preview && <MediaPreview key={preview.path} item={preview} onClose={() => setPreview(null)} onOpen={() => void action(preview, "open")} />}
    {mutation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form role="dialog" aria-modal="true" aria-labelledby="manage-capture-title" onSubmit={e => { e.preventDefault(); void manage(); }}
        className="w-full max-w-md rounded-xl border border-linea-fuerte bg-flotante p-5 text-titulo shadow-xl">
        <h2 id="manage-capture-title" className="text-[14px] font-semibold">
          {mutation.operation === "rename" ? t("Cambiar el nombre de la captura") : t("¿Mover la captura a la papelera?")}
        </h2>
        <p className="mt-1.5 text-[12.5px] break-all text-apagado">{mutation.item.name}</p>
        {mutation.operation === "rename" && <input autoFocus aria-label={t("Nombre nuevo")} value={newName} onChange={e => setNewName(e.target.value)}
          className="mt-4 h-8 w-full rounded-md border border-linea bg-hueco px-2.5 text-[13px] outline-none focus:border-marca" />}
        {mutation.operation === "recycle" && <p className="mt-3 text-[12.5px] text-suave">{t("Se puede recuperar desde la papelera de reciclaje de Windows.")}</p>}
        {mutationError && <p role="alert" className="mt-3 text-[12.5px] text-red-400">{mutationError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={mutating} onClick={() => setMutation(null)} className="h-8 rounded-md bg-realce px-3 text-[12.5px] hover:bg-activo">{t("Cancelar")}</button>
          <button disabled={mutating} type="submit"
            className={`h-8 rounded-md px-3 text-[12.5px] font-medium text-white disabled:opacity-40 ${mutation.operation === "rename" ? "bg-marca" : "bg-red-600 hover:bg-red-500"}`}>
            {mutating ? t("Un momento…") : mutation.operation === "rename" ? t("Cambiar el nombre") : t("Mover a la papelera")}
          </button>
        </div>
      </form>
    </div>}
    {compare && <ImageComparison paths={compare} onClose={() => { setCompare(null); void refresh(); }} />}
  </div>;
}

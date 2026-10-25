import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize, Minus, Plus } from "lucide-react";
import { copiarImagen, copiaTexto, discardSession, frameImage, openImage, tapaDatos } from "../../lib/ipc";
import type { SessionInfo, Settings } from "../../lib/types";
import {
  escalaBase,
  estiloInicial,
  FUENTES,
  alternarBloqueo,
  conSuCandado,
  estaBloqueada,
  marcasTocables,
  marcasVisibles,
  meterRect,
  moverMarca,
  recortaAlgo,
  rectConProporcion,
  renumerar,
  meterEnGrupo,
  ponerJunto,
  type Estilo,
  type HerramientaFoto,
  type Marca,
  type Punto,
  type Rect,
  type TipoMarca,
} from "../../lib/foto/marcas";
import { aplanar } from "../../lib/foto/pintar";
import { DOC_VACIO, useHistoria } from "../../lib/foto/historia";
import { aPantalla, ajustar, pasoDeZoom, zoomHacia, type Vista } from "../../lib/foto/vista";
import { useT } from "../../lib/i18n";
import { ExportPanel } from "../editor/ExportPanel";
import { BarraHerramientas, TECLAS } from "./BarraHerramientas";
import { BarraMenu, DialogoAtajos, type Menu } from "./BarraMenu";
import { BarraOpciones, PROPORCIONES_FOTO } from "./BarraOpciones";
import { Lienzo } from "./Lienzo";
import { PanelCapas, type AccionesCapas } from "./PanelCapas";
import { Divisor } from "./Divisor";

/**
 * El editor de capturas (PNG y JPG): herramientas a la izquierda, opciones arriba, capas y
 * guardar a la derecha, y el zoom abajo, como en cualquier editor de fotos. Las grabaciones
 * siguen en `EditorApp`, que tiene línea de tiempo y no necesita nada de esto.
 */

const TIPOS: TipoMarca[] = ["arrow", "shape", "text", "step", "highlight", "pen", "pixelate"];
// La v2 es la del texto negro por defecto: con la clave de antes, quien ya hubiera tocado
// algo seguiría sacando el texto rojo que se guardó entonces.
const CLAVE_ESTILOS = "winshotx.foto.estilos.v2";

/**
 * Lo que cada herramienta recuerda de la última vez, guardado **sin la escala de la
 * captura**: el grosor que se eligió en una captura de 800 de ancho se traduce a una de 4K.
 */
function useEstilos(escala: number) {
  const [estilos, setEstilos] = useState<Record<TipoMarca, Estilo>>(() => cargarEstilos(escala));
  useEffect(() => setEstilos(cargarEstilos(escala)), [escala]);
  const cambiar = useCallback(
    (tipo: TipoMarca, cambio: Partial<Estilo> | null) => {
      setEstilos((previos) => {
        const siguientes = { ...previos, [tipo]: cambio ? { ...previos[tipo], ...cambio } : estiloInicial(tipo, escala) };
        try {
          const sinEscala = Object.fromEntries(
            TIPOS.map((k) => [k, { ...siguientes[k], grosor: siguientes[k].grosor / escala, tamano: siguientes[k].tamano / escala }]),
          );
          localStorage.setItem(CLAVE_ESTILOS, JSON.stringify(sinEscala));
        } catch {
          // Sin almacenamiento se pierde solo el recuerdo para la próxima vez.
        }
        return siguientes;
      });
    },
    [escala],
  );
  return [estilos, cambiar] as const;
}

function cargarEstilos(escala: number): Record<TipoMarca, Estilo> {
  let guardados: Partial<Record<TipoMarca, Partial<Estilo>>> = {};
  try {
    guardados = JSON.parse(localStorage.getItem(CLAVE_ESTILOS) ?? "{}") ?? {};
  } catch {
    guardados = {};
  }
  return Object.fromEntries(
    TIPOS.map((tipo) => {
      const base = estiloInicial(tipo, escala);
      const g = guardados[tipo] ?? {};
      const numero = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.max(1, Math.round(v * escala)) : def);
      return [tipo, {
        ...base,
        ...(typeof g.color === "string" && /^#[0-9a-f]{6}$/i.test(g.color) ? { color: g.color } : {}),
        ...(g.puntas === "end" || g.puntas === "both" || g.puntas === "none" ? { puntas: g.puntas } : {}),
        ...(g.forma === "rect" || g.forma === "round" || g.forma === "ellipse" ? { forma: g.forma } : {}),
        ...(typeof g.contorno === "boolean" ? { contorno: g.contorno } : {}),
        ...(typeof g.relleno === "boolean" ? { relleno: g.relleno } : {}),
        ...(typeof g.fondo === "boolean" ? { fondo: g.fondo } : {}),
        ...(typeof g.fuente === "string" && FUENTES.includes(g.fuente) ? { fuente: g.fuente } : {}),
        ...(typeof g.negrita === "boolean" ? { negrita: g.negrita } : {}),
        ...(typeof g.cursiva === "boolean" ? { cursiva: g.cursiva } : {}),
        grosor: numero(g.grosor, base.grosor),
        tamano: numero(g.tamano, base.tamano),
      }];
    }),
  ) as Record<TipoMarca, Estilo>;
}

const ESTILO_DE_MARCA = (m: Marca, base: Estilo): Estilo => ({
  ...base,
  color: m.color,
  grosor: m.grosor || base.grosor,
  puntas: m.puntas ?? base.puntas,
  contorno: m.contorno ?? base.contorno,
  forma: m.forma ?? base.forma,
  relleno: m.relleno ?? base.relleno,
  tamano: m.tamano ?? base.tamano,
  fondo: m.fondo ?? base.fondo,
  fuente: m.fuente ?? base.fuente,
  negrita: m.negrita ?? base.negrita,
  cursiva: m.cursiva ?? base.cursiva,
});

/** El tamaño de los paneles, que la persona cambia arrastrando sus bordes. */
interface MedidasUI {
  herramientas: number;
  panel: number;
  /** null = el alto de fábrica, que se adapta a la ventana. */
  capas: number | null;
}
const CLAVE_UI = "winshotx.foto.paneles";
const UI_DE_FABRICA: MedidasUI = { herramientas: 132, panel: 292, capas: null };

function cargarUI(): MedidasUI {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_UI) ?? "{}") as Partial<MedidasUI>;
    const n = (v: unknown, min: number, max: number, def: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
    return {
      herramientas: n(g.herramientas, 44, 220, UI_DE_FABRICA.herramientas),
      panel: n(g.panel, 240, 560, UI_DE_FABRICA.panel),
      capas: g.capas === null || g.capas === undefined ? null : n(g.capas, 110, 2000, 220),
    };
  } catch {
    return UI_DE_FABRICA;
  }
}

interface Props {
  session: SessionInfo;
  settings: Settings;
  hasFfmpeg: boolean;
}

export function EditorFoto({ session, settings, hasFfmpeg }: Props) {
  const t = useT();
  const [imagen, setImagen] = useState<HTMLImageElement | null>(null);
  const ancho = imagen?.naturalWidth || session.region.width;
  const alto = imagen?.naturalHeight || session.region.height;
  const full = useMemo<Rect>(() => ({ x: 0, y: 0, w: ancho, h: alto }), [ancho, alto]);
  const escala = escalaBase(ancho, alto);
  const [estilos, cambiarEstilo] = useEstilos(escala);
  const { doc, editar, deshacer, rehacer, empezar, terminar, puedeDeshacer, puedeRehacer } = useHistoria();
  /** El tamaño al que se va a guardar, tal y como está en el panel de guardar. */
  const [salida, setSalida] = useState<{ w: number; h: number } | null>(null);
  const [herramienta, setHerramienta] = useState<HerramientaFoto>("hand");
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [vista, setVista] = useState<Vista>({ zoom: 1, panX: 0, panY: 0 });
  const ajustada = useRef(true);
  const [hueco, setHueco] = useState({ w: 0, h: 0 });
  const [pendiente, setPendiente] = useState<Rect | null>(null);
  const [proporcion, setProporcion] = useState("Libre");
  const [espacio, setEspacio] = useState(false);
  const [puntero, setPuntero] = useState<Punto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [verAtajos, setVerAtajos] = useState(false);
  const [ui, setUI] = useState<MedidasUI>(cargarUI);
  const uiAlEmpezar = useRef(ui);
  const cambiarUI = (cambio: Partial<MedidasUI>) =>
    setUI((u) => {
      const nueva = { ...u, ...cambio };
      try {
        localStorage.setItem(CLAVE_UI, JSON.stringify(nueva));
      } catch {
        // Sin almacenamiento, los paneles vuelven a su tamaño en la próxima ventana.
      }
      return nueva;
    });
  const columnaDerecha = useRef<HTMLElement>(null);
  const firma = JSON.stringify(doc);
  const [firmaGuardada, setFirmaGuardada] = useState(() => JSON.stringify(DOC_VACIO));
  const sucio = firma !== firmaGuardada;
  const siguienteId = useRef(1);
  const nuevoId = useCallback(() => siguienteId.current++, []);

  // El tema de los ajustes. Se carga aquí y no en `editor.tsx` porque el editor de vídeo
  // sigue siendo oscuro siempre, y el tema se pinta en el <html> de la ventana entera.
  useEffect(() => {
    void import("../../lib/tema").then((m) => m.aplicarTema(settings.theme));
  }, [settings.theme]);

  useEffect(() => {
    let vigente = true;
    void frameImage(session.id, 0)
      .then((ruta) => {
        const img = new Image();
        // Sin esto el lienzo queda «manchado» y no deja sacar la foto terminada.
        img.crossOrigin = "anonymous";
        img.onload = () => vigente && setImagen(img);
        img.onerror = () => vigente && setAviso(t("No se ha podido abrir la imagen"));
        img.src = convertFileSrc(ruta);
      })
      .catch((e) => setAviso(String(e)));
    return () => {
      vigente = false;
    };
  }, [session.id, t]);

  useEffect(() => {
    if (!aviso) return;
    const reloj = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(reloj);
  }, [aviso]);

  // --- la vista -------------------------------------------------------------------------
  const cajaVisible = herramienta === "crop" ? full : doc.recorte ?? full;
  const ajustarVista = useCallback(
    (caja: Rect = cajaVisible) => {
      if (!hueco.w) return;
      ajustada.current = true;
      setVista(ajustar(caja, hueco.w, hueco.h));
    },
    [cajaVisible, hueco],
  );
  // Mientras nadie haya tocado el zoom, la imagen se reajusta sola al cambiar la ventana.
  useEffect(() => {
    if (ajustada.current) ajustarVista();
  }, [ajustarVista, imagen]);
  const cambiarVista = useCallback((v: Vista, manual: boolean) => {
    if (manual) ajustada.current = false;
    // Se puede mover la imagen más allá de sus bordes, hasta la zona gris de alrededor,
    // pero siempre queda un trozo a la vista: un lienzo vacío no dice dónde se ha ido.
    if (!hueco.w) return setVista(v);
    const c = cajaVisible;
    const ASOMA = 64;
    const [izq, der] = [v.panX + c.x * v.zoom, v.panX + (c.x + c.w) * v.zoom];
    const [arr, aba] = [v.panY + c.y * v.zoom, v.panY + (c.y + c.h) * v.zoom];
    let { panX, panY } = v;
    if (der < ASOMA) panX += ASOMA - der;
    if (izq > hueco.w - ASOMA) panX -= izq - (hueco.w - ASOMA);
    if (aba < ASOMA) panY += ASOMA - aba;
    if (arr > hueco.h - ASOMA) panY -= arr - (hueco.h - ASOMA);
    setVista({ ...v, panX, panY });
  }, [cajaVisible, hueco]);
  const onHueco = useCallback((w: number, h: number) => setHueco({ w, h }), []);
  const onMedidaSalida = useCallback((w: number, h: number) => setSalida({ w, h }), []);
  /** Acercar con el teclado o los botones: hacia el ratón si está encima de la imagen. */
  const zoomA = (zoom: number) => {
    ajustada.current = false;
    setVista((v) => {
      const [sx, sy] = puntero ? aPantalla(v, puntero[0], puntero[1]) : [hueco.w / 2, hueco.h / 2];
      return zoomHacia(v, zoom, sx, sy);
    });
  };

  // --- herramientas y estilos -----------------------------------------------------------
  const elegidas = doc.marcas.filter((m) => seleccion.includes(m.id));
  const tipoElegidas = elegidas.length && elegidas.every((m) => m.kind === elegidas[0].kind) ? elegidas[0].kind : null;
  const tipoHerramienta = (TIPOS as string[]).includes(herramienta) ? (herramienta as TipoMarca) : null;
  const tipoOpciones = elegidas.length ? tipoElegidas : tipoHerramienta;
  const estiloVisible = tipoOpciones
    ? elegidas.length === 1
      ? ESTILO_DE_MARCA(elegidas[0], estilos[tipoOpciones])
      : estilos[tipoOpciones]
    : null;

  /** Cambiar el estilo cambia lo elegido Y lo que saldrá la próxima vez con esa herramienta. */
  const onEstilo = (cambio: Partial<Estilo>) => {
    if (!tipoOpciones) return;
    cambiarEstilo(tipoOpciones, cambio);
    if (!elegidas.length) return;
    editar((d) => ({
      ...d,
      marcas: d.marcas.map((m) => {
        if (!seleccion.includes(m.id) || estaBloqueada(m, d.grupos)) return m;
        const n = { ...m };
        if (cambio.color !== undefined) n.color = cambio.color;
        if (cambio.grosor !== undefined) n.grosor = cambio.grosor;
        if (cambio.puntas !== undefined) n.puntas = cambio.puntas;
        if (cambio.contorno !== undefined) n.contorno = cambio.contorno;
        if (cambio.forma !== undefined) n.forma = cambio.forma;
        if (cambio.relleno !== undefined) n.relleno = cambio.relleno;
        if (cambio.tamano !== undefined) n.tamano = cambio.tamano;
        if (cambio.fondo !== undefined) n.fondo = cambio.fondo;
        if (cambio.fuente !== undefined) n.fuente = cambio.fuente;
        if (cambio.negrita !== undefined) n.negrita = cambio.negrita;
        if (cambio.cursiva !== undefined) n.cursiva = cambio.cursiva;
        return n;
      }),
    }));
  };

  const elegirHerramienta = useCallback(
    (h: HerramientaFoto) => {
      if (h === "crop") {
        setPendiente(doc.recorte ?? full);
        setProporcion("Libre");
        setSeleccion([]);
        if (hueco.w) {
          ajustada.current = true;
          setVista(ajustar(full, hueco.w, hueco.h));
        }
      } else if (herramienta === "crop") {
        setPendiente(null);
        if (hueco.w) setVista(ajustar(doc.recorte ?? full, hueco.w, hueco.h));
      }
      // Con otra herramienta de dibujar, lo elegido se suelta: si no, cambiar el color
      // para la marca siguiente cambiaría también la que estaba elegida.
      if (h !== "select" && h !== "hand") setSeleccion([]);
      setHerramienta(h);
    },
    [doc.recorte, full, herramienta, hueco],
  );

  // --- recorte --------------------------------------------------------------------------
  const valorProporcion = (id: string) => {
    const p = PROPORCIONES_FOTO.find((x) => x.id === id)?.valor ?? null;
    return p === "original" ? ancho / alto : p;
  };
  const onProporcion = (id: string) => {
    setProporcion(id);
    const v = valorProporcion(id);
    if (v) setPendiente(rectConProporcion(v, ancho, alto));
  };
  const aplicarRecorte = () => {
    if (!pendiente) return;
    const r = meterRect(pendiente, ancho, alto);
    const nuevo = recortaAlgo(r, ancho, alto) ? r : null;
    editar((d) => ({ ...d, recorte: nuevo }));
    setPendiente(null);
    setHerramienta("select");
    if (hueco.w) {
      ajustada.current = true;
      setVista(ajustar(nuevo ?? full, hueco.w, hueco.h));
    }
    setAviso(nuevo ? t("Recortada a {medida}", { medida: `${r.w} × ${r.h} px` }) : t("Sin recorte"));
  };
  const cancelarRecorte = () => elegirHerramienta("select");
  const quitarRecorte = () => setPendiente(full);

  // --- acciones sobre lo elegido --------------------------------------------------------
  /** Supr borra lo elegido menos lo bloqueado, que para eso está bloqueado. */
  const borrarElegidas = useCallback(() => {
    if (!seleccion.length) return;
    editar((d) => ({ ...d, marcas: renumerar(d.marcas.filter((m) => !seleccion.includes(m.id) || estaBloqueada(m, d.grupos))) }));
    setSeleccion([]);
  }, [seleccion, editar]);
  const duplicar = useCallback(() => {
    if (!seleccion.length) return;
    const desplazamiento = Math.round(16 * escala);
    const copias = doc.marcas.filter((m) => seleccion.includes(m.id)).map((m) => ({ ...moverMarca(m, desplazamiento, desplazamiento), id: nuevoId(), grupo: undefined }));
    editar((d) => ({ ...d, marcas: renumerar([...d.marcas, ...copias]) }));
    setSeleccion(copias.map((c) => c.id));
  }, [seleccion, doc.marcas, escala, editar, nuevoId]);
  const moverCapa = (sentido: 1 | -1) => {
    editar((d) => {
      const marcas = [...d.marcas];
      const indices = marcas.map((m, i) => (seleccion.includes(m.id) ? i : -1)).filter((i) => i >= 0);
      const orden = sentido > 0 ? [...indices].reverse() : indices;
      for (const i of orden) {
        const j = i + sentido;
        if (j < 0 || j >= marcas.length || seleccion.includes(marcas[j].id)) continue;
        [marcas[i], marcas[j]] = [marcas[j], marcas[i]];
      }
      return { ...d, marcas: renumerar(marcas) };
    });
  };
  const empujar = useCallback(
    (dx: number, dy: number) => {
      editar((d) => ({
        ...d,
        marcas: d.marcas.map((m) => (seleccion.includes(m.id) && !estaBloqueada(m, d.grupos) ? moverMarca(m, dx, dy) : m)),
      }));
    },
    [seleccion, editar],
  );

  // --- carpetas de capas -----------------------------------------------------------------
  /**
   * Junta lo elegido en una carpeta nueva. Las marcas se quedan juntas en el orden de las
   * capas, en el sitio de la de más arriba, para que la carpeta tape y quede tapada entera.
   */
  /**
   * Una carpeta nueva con lo elegido dentro, o vacía si no hay nada elegido. Las marcas se
   * quedan juntas en el sitio de la de más arriba, para que la carpeta tape y quede tapada
   * entera.
   */
  const nuevaCarpeta = useCallback((ids: number[] = seleccion) => {
    const id = nuevoId();
    editar((d) => {
      const nombre = t("Carpeta {n}", { n: d.grupos.length + 1 });
      if (!ids.length) return { ...d, grupos: [...d.grupos, { id, nombre }] };
      const dentro = d.marcas.filter((m) => ids.includes(m.id)).map((m) => ({ ...m, grupo: id }));
      const ultima = Math.max(...d.marcas.map((m, i) => (ids.includes(m.id) ? i : -1)));
      const debajo = d.marcas.filter((m, i) => !ids.includes(m.id) && i <= ultima);
      const encima = d.marcas.filter((m, i) => !ids.includes(m.id) && i > ultima);
      return { ...d, marcas: renumerar([...debajo, ...dentro, ...encima]), grupos: [...d.grupos, { id, nombre }] };
    });
    return id;
  }, [seleccion, editar, nuevoId, t]);
  const agrupar = useCallback(() => {
    if (seleccion.length) nuevaCarpeta();
  }, [seleccion, nuevaCarpeta]);
  /** Saca esas marcas de su carpeta. La carpeta que se queda vacía por esto, se va. */
  const sacarDeCarpeta = useCallback((ids: number[]) => {
    editar((d) => {
      const tocadas = new Set(d.marcas.filter((m) => ids.includes(m.id)).map((m) => m.grupo));
      const marcas = d.marcas.map((m) => (ids.includes(m.id) ? { ...conSuCandado(m, d.grupos), grupo: undefined } : m));
      const usadas = new Set(marcas.map((m) => m.grupo));
      return { ...d, marcas, grupos: d.grupos.filter((g) => !tocadas.has(g.id) || usadas.has(g.id)) };
    });
  }, [editar]);
  const desagrupar = useCallback(() => sacarDeCarpeta(seleccion), [seleccion, sacarDeCarpeta]);
  /** Deshace la carpeta y deja lo de dentro suelto, en su sitio. */
  const deshacerCarpeta = (id: number) =>
    editar((d) => ({
      ...d,
      marcas: d.marcas.map((m) => (m.grupo === id ? { ...conSuCandado(m, d.grupos), grupo: undefined } : m)),
      grupos: d.grupos.filter((g) => g.id !== id),
    }));
  const meterEn = (ids: number[], grupo: number) => editar((d) => meterEnGrupo(d, ids, grupo));
  const soltarJunto = (ids: number[], objetivo: number, encima: boolean) => editar((d) => ponerJunto(d, ids, objetivo, encima));
  /** Bloquear o desbloquear, con sus carpetas: ver `alternarBloqueo`. */
  const bloquear = (ids: number[]) => editar((d) => alternarBloqueo(d, ids));
  const cambiarGrupo = (id: number, cambio: Partial<{ nombre: string; oculto: boolean; plegado: boolean; bloqueado: boolean }>) =>
    editar((d) => ({ ...d, grupos: d.grupos.map((g) => (g.id === id ? { ...g, ...cambio } : g)) }));
  const borrarGrupo = (id: number) => {
    if (doc.grupos.find((g) => g.id === id)?.bloqueado) return;
    const suyas = doc.marcas.filter((m) => m.grupo === id).map((m) => m.id);
    editar((d) => ({ ...d, marcas: renumerar(d.marcas.filter((m) => m.grupo !== id)), grupos: d.grupos.filter((g) => g.id !== id) }));
    setSeleccion((s) => s.filter((x) => !suyas.includes(x)));
  };
  const enGrupo = elegidas.some((m) => m.grupo !== undefined);

  // --- copiar, abrir, OCR ---------------------------------------------------------------
  const fotoTerminada = useCallback(async () => {
    if (!imagen) throw new Error(t("La imagen todavía se está cargando"));
    return aplanar(imagen, marcasVisibles(doc), doc.recorte);
  }, [imagen, doc, t]);
  const copiar = useCallback(async () => {
    try {
      await copiarImagen(await fotoTerminada());
      setAviso(t("Imagen copiada: ya se puede pegar"));
    } catch (e) {
      setAviso(`${t("No se ha podido copiar")}: ${String(e)}`);
    }
  }, [fotoTerminada, t]);
  const importando = useRef(false);
  const importar = useCallback(async (ruta: string | null = null, portapapeles = false) => {
    if (importando.current) return;
    importando.current = true;
    try {
      await openImage(ruta, portapapeles);
    } catch (e) {
      setAviso(String(e));
    } finally {
      importando.current = false;
    }
  }, []);
  useEffect(() => {
    const quitar = listen<{ paths: string[] }>("tauri://drag-drop", (e) => {
      if (e.payload.paths?.[0]) void importar(e.payload.paths[0]);
    }, { target: getCurrentWindow().label });
    return () => void quitar.then((fn) => fn());
  }, [importar]);

  const taparDatos = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const { marcas, resumen } = await tapaDatos(session.id, 0);
      if (!marcas.length) {
        setAviso(t("No he encontrado datos personales en esta imagen"));
        return;
      }
      const nuevas: Marca[] = marcas.map((a) => ({
        id: nuevoId(), kind: "pixelate", color: "#888888", grosor: 0,
        x1: a.x1 * ancho, y1: a.y1 * alto, x2: a.x2 * ancho, y2: a.y2 * alto,
      }));
      editar((d) => ({ ...d, marcas: [...d.marcas, ...nuevas] }));
      setAviso(t("Tapado: {detalle}", { detalle: resumen.map(([c, n]) => `${n} ${c}`).join(", ") }));
    } catch (e) {
      setAviso(String(e));
    } finally {
      setOcupado(false);
    }
  };
  const copiarTexto = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const texto = await copiaTexto(session.id, 0);
      setAviso(t("Texto copiado: {palabras} palabras", { palabras: texto.trim().split(/\s+/).length }));
    } catch (e) {
      setAviso(String(e));
    } finally {
      setOcupado(false);
    }
  };

  // --- cerrar ---------------------------------------------------------------------------
  const cerrar = useCallback(async (descartar = false) => {
    if (sucio && !descartar) {
      setConfirmarCierre(true);
      return;
    }
    await discardSession(session.id);
    await getCurrentWindow().destroy();
  }, [sucio, session.id]);
  useEffect(() => {
    const quitar = getCurrentWindow().onCloseRequested(async (e) => {
      e.preventDefault();
      await cerrar();
    });
    return () => void quitar.then((fn) => fn());
  }, [cerrar]);

  useEffect(() => {
    const medida = doc.recorte ? `${doc.recorte.w} × ${doc.recorte.h}` : `${ancho} × ${alto}`;
    void getCurrentWindow().setTitle(`${sucio ? "* " : ""}winshotx · ${t("Editor")} · ${medida}`);
  }, [sucio, doc.recorte, ancho, alto, t]);

  // --- teclado --------------------------------------------------------------------------
  const teclas = useRef<(e: KeyboardEvent) => void>(() => {});
  teclas.current = (e: KeyboardEvent) => {
    // Solo se quedan las teclas los sitios donde se ESCRIBE. Un deslizador, una casilla o
    // la lista de letras se quedan con el foco después de tocarlos, y si contaran, Ctrl+Z
    // dejaba de deshacer en cuanto alguien cambiaba el grosor.
    const donde = e.target as HTMLElement;
    const escribe = donde?.closest?.("textarea,[contenteditable=true]") ||
      (donde instanceof HTMLInputElement && ["text", "number", "search", ""].includes(donde.type));
    if (escribe) return;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (confirmarCierre) {
      if (e.key === "Escape") setConfirmarCierre(false);
      return;
    }
    if (verAtajos) {
      if (e.key === "Escape" || e.key === "F1") setVerAtajos(false);
      return;
    }
    if (e.key === "F1") {
      e.preventDefault();
      setVerAtajos(true);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      setEspacio(true);
      return;
    }
    if (ctrl) {
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) rehacer();
        else deshacer();
        setSeleccion([]);
      } else if (k === "y") {
        e.preventDefault();
        rehacer();
        setSeleccion([]);
      } else if (k === "a") {
        e.preventDefault();
        if (herramienta === "crop") return;
        setHerramienta("select");
        setSeleccion(marcasTocables(doc).map((m) => m.id));
      } else if (k === "c" && !e.shiftKey) {
        e.preventDefault();
        void copiar();
      } else if (k === "d") {
        e.preventDefault();
        duplicar();
      } else if (k === "l") {
        e.preventDefault();
        if (seleccion.length) bloquear(seleccion);
      } else if (k === "g") {
        e.preventDefault();
        if (e.shiftKey) desagrupar();
        else agrupar();
      } else if (k === "o" || k === "v") {
        e.preventDefault();
        void importar(null, k === "v");
      } else if (k === "0") {
        e.preventDefault();
        ajustarVista();
      } else if (k === "1") {
        e.preventDefault();
        zoomA(1);
      } else if (k === "=" || k === "+") {
        e.preventDefault();
        zoomA(pasoDeZoom(vista.zoom, 1));
      } else if (k === "-") {
        e.preventDefault();
        zoomA(pasoDeZoom(vista.zoom, -1));
      }
      return;
    }
    if (e.altKey) return;
    if (k === "enter" && herramienta === "crop") {
      e.preventDefault();
      aplicarRecorte();
    } else if (e.key === "Escape") {
      if (herramienta === "crop") cancelarRecorte();
      else if (seleccion.length) setSeleccion([]);
      else if (herramienta !== "select") setHerramienta("select");
      else void cerrar();
    } else if ((k === "delete" || k === "backspace") && seleccion.length) {
      e.preventDefault();
      borrarElegidas();
    } else if (k.startsWith("arrow")) {
      const paso = e.shiftKey ? 10 : 1;
      const [dx, dy] = k === "arrowleft" ? [-paso, 0] : k === "arrowright" ? [paso, 0] : k === "arrowup" ? [0, -paso] : [0, paso];
      if (herramienta === "crop" && pendiente) {
        e.preventDefault();
        setPendiente(meterRect({ ...pendiente, x: pendiente.x + dx, y: pendiente.y + dy }, ancho, alto));
      } else if (seleccion.length) {
        e.preventDefault();
        empujar(dx, dy);
      }
    } else if (TECLAS[k] && !e.repeat) {
      elegirHerramienta(TECLAS[k]);
    }
  };
  useEffect(() => {
    const abajo = (e: KeyboardEvent) => teclas.current(e);
    const arriba = (e: KeyboardEvent) => e.key === " " && setEspacio(false);
    const fuera = () => setEspacio(false);
    window.addEventListener("keydown", abajo);
    window.addEventListener("keyup", arriba);
    window.addEventListener("blur", fuera);
    return () => {
      window.removeEventListener("keydown", abajo);
      window.removeEventListener("keyup", arriba);
      window.removeEventListener("blur", fuera);
    };
  }, []);

  const estiloDe = useCallback((tipo: TipoMarca) => estilos[tipo], [estilos]);

  const acciones: AccionesCapas = {
    elegir: (id, sumar) => {
      if (herramienta === "crop") cancelarRecorte();
      setSeleccion((s) => (sumar ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
    },
    elegirGrupo: (id, sumar) => {
      if (herramienta === "crop") cancelarRecorte();
      const suyas = doc.marcas.filter((m) => m.grupo === id).map((m) => m.id);
      setSeleccion((s) => (sumar ? [...new Set([...s, ...suyas])] : suyas));
    },
    visible: (id) => editar((d) => ({ ...d, marcas: d.marcas.map((m) => (m.id === id ? { ...m, oculta: !m.oculta } : m)) })),
    borrar: (ids) => {
      editar((d) => ({ ...d, marcas: renumerar(d.marcas.filter((m) => !ids.includes(m.id) || estaBloqueada(m, d.grupos))) }));
      setSeleccion((s) => s.filter((x) => !ids.includes(x)));
    },
    grupo: cambiarGrupo,
    borrarGrupo,
    deshacerGrupo: deshacerCarpeta,
    nuevaCarpeta: (ids) => void nuevaCarpeta(ids),
    meterEn,
    sacar: sacarDeCarpeta,
    ponerJunto: soltarJunto,
    bloquear,
    duplicar,
    subir: () => moverCapa(1),
    bajar: () => moverCapa(-1),
  };

  /**
   * Guardar lo hace el panel de guardar, que es quien sabe el formato, el tamaño y la
   * carpeta. Se le pide con su propio atajo, que ya escucha, en vez de duplicar aquí todo
   * lo que hace.
   */
  const guardar = (preguntar: boolean) =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, shiftKey: preguntar }));

  const menus: Menu[] = [
    {
      nombre: "Archivo",
      opciones: [
        { etiqueta: "Abrir imagen…", atajo: "Ctrl+O", accion: () => void importar() },
        { etiqueta: "Pegar imagen", atajo: "Ctrl+V", accion: () => void importar(null, true) },
        null,
        { etiqueta: "Guardar", atajo: "Ctrl+S", accion: () => guardar(false) },
        { etiqueta: "Guardar en…", atajo: "Ctrl+Mayús+S", accion: () => guardar(true) },
        { etiqueta: "Copiar imagen", atajo: "Ctrl+C", accion: () => void copiar() },
        null,
        { etiqueta: "Cerrar", accion: () => void cerrar() },
      ],
    },
    {
      nombre: "Editar",
      opciones: [
        { etiqueta: "Deshacer", atajo: "Ctrl+Z", accion: deshacer, desactivada: !puedeDeshacer },
        { etiqueta: "Rehacer", atajo: "Ctrl+Y", accion: rehacer, desactivada: !puedeRehacer },
        null,
        {
          etiqueta: "Elegir todo",
          atajo: "Ctrl+A",
          accion: () => {
            setHerramienta("select");
            setSeleccion(marcasTocables(doc).map((m) => m.id));
          },
          desactivada: !doc.marcas.length,
        },
        { etiqueta: "Duplicar", atajo: "Ctrl+D", accion: duplicar, desactivada: !seleccion.length },
        { etiqueta: "Borrar", atajo: "Supr", accion: borrarElegidas, desactivada: !seleccion.length },
        null,
        { etiqueta: "Meter en una carpeta", atajo: "Ctrl+G", accion: agrupar, desactivada: !seleccion.length },
        { etiqueta: "Sacar de la carpeta", atajo: "Ctrl+Mayús+G", accion: desagrupar, desactivada: !enGrupo },
        { etiqueta: "Bloquear o desbloquear", atajo: "Ctrl+L", accion: () => bloquear(seleccion), desactivada: !seleccion.length },
      ],
    },
    {
      nombre: "Imagen",
      opciones: [
        { etiqueta: "Recortar", atajo: "C", accion: () => elegirHerramienta("crop") },
        { etiqueta: "Quitar recorte", accion: () => editar((d) => ({ ...d, recorte: null })), desactivada: !doc.recorte },
        null,
        { etiqueta: "Tapar datos personales", accion: () => void taparDatos(), desactivada: ocupado },
        { etiqueta: "Copiar el texto de la imagen", accion: () => void copiarTexto(), desactivada: ocupado },
      ],
    },
    {
      nombre: "Ver",
      opciones: [
        { etiqueta: "Acercar", atajo: "Ctrl +", accion: () => zoomA(pasoDeZoom(vista.zoom, 1)) },
        { etiqueta: "Alejar", atajo: "Ctrl −", accion: () => zoomA(pasoDeZoom(vista.zoom, -1)) },
        null,
        { etiqueta: "Ajustar a la ventana", atajo: "Ctrl+0", accion: () => ajustarVista() },
        { etiqueta: "Tamaño real", atajo: "Ctrl+1", accion: () => zoomA(1) },
      ],
    },
    {
      nombre: "Ayuda",
      opciones: [{ etiqueta: "Atajos de teclado", atajo: "F1", accion: () => setVerAtajos(true) }],
    },
  ];
  const medidaFinal = doc.recorte ?? full;
  const recorteNormalizado = doc.recorte
    ? { x1: doc.recorte.x / ancho, y1: doc.recorte.y / alto, x2: (doc.recorte.x + doc.recorte.w) / ancho, y2: (doc.recorte.y + doc.recorte.h) / alto }
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-lienzo text-texto">
      <BarraMenu
        menus={menus}
        puedeDeshacer={puedeDeshacer}
        puedeRehacer={puedeRehacer}
        onDeshacer={deshacer}
        onRehacer={rehacer}
        onCopiar={() => void copiar()}
        onGuardar={() => guardar(false)}
        onAtajos={() => setVerAtajos(true)}
      />
      <BarraOpciones
        herramienta={herramienta}
        tipo={tipoOpciones}
        estilo={estiloVisible}
        onEstilo={onEstilo}
        onReiniciar={() => tipoOpciones && cambiarEstilo(tipoOpciones, null)}
        grosorMaximo={Math.max(24, Math.round(40 * escala))}
        elegidas={elegidas.length}
        onDuplicar={duplicar}
        onAgrupar={agrupar}
        onDesagrupar={enGrupo ? desagrupar : undefined}
        onBorrar={borrarElegidas}
        onSubir={() => moverCapa(1)}
        onBajar={() => moverCapa(-1)}
        pendiente={pendiente}
        onPendiente={(r) => setPendiente(meterRect(r, ancho, alto))}
        proporcion={proporcion}
        onProporcion={onProporcion}
        hayRecorte={!!doc.recorte}
        onAplicarRecorte={aplicarRecorte}
        onCancelarRecorte={cancelarRecorte}
        onQuitarRecorte={quitarRecorte}
      />
      <div className="flex min-h-0 flex-1">
        <BarraHerramientas activa={herramienta} onElegir={elegirHerramienta} onTaparDatos={() => void taparDatos()}
          onCopiarTexto={() => void copiarTexto()} ocupado={ocupado} ancho={ui.herramientas} />
        <Divisor
          sentido="columna"
          onEmpezar={() => (uiAlEmpezar.current = ui)}
          // Por debajo de 96 se queda en solo iconos: a medias, los nombres salen cortados.
          onArrastrar={(d) => {
            const w = uiAlEmpezar.current.herramientas + d;
            cambiarUI({ herramientas: w < 96 ? 44 : Math.min(220, w) });
          }}
          onReiniciar={() => cambiarUI({ herramientas: UI_DE_FABRICA.herramientas })}
        />
        <Lienzo
          imagen={imagen}
          ancho={ancho}
          alto={alto}
          doc={doc}
          editar={editar}
          empezar={empezar}
          terminar={terminar}
          herramienta={herramienta}
          estiloDe={estiloDe}
          seleccion={seleccion}
          onSeleccion={setSeleccion}
          vista={vista}
          onVista={cambiarVista}
          pendiente={pendiente}
          onPendiente={setPendiente}
          proporcion={valorProporcion(proporcion)}
          espacio={espacio}
          nuevoId={nuevoId}
          onCursor={setPuntero}
          onHueco={onHueco}
          salida={salida}
        />
        <Divisor
          sentido="columna"
          onEmpezar={() => (uiAlEmpezar.current = ui)}
          // El panel está a la derecha: arrastrar hacia la izquierda lo ensancha.
          onArrastrar={(d) => cambiarUI({ panel: Math.min(560, Math.max(240, uiAlEmpezar.current.panel - d)) })}
          onReiniciar={() => cambiarUI({ panel: UI_DE_FABRICA.panel })}
        />
        <aside ref={columnaDerecha} className="flex shrink-0 flex-col border-l border-linea bg-tarjeta" style={{ width: ui.panel }}>
          <PanelCapas marcas={doc.marcas} grupos={doc.grupos} seleccion={seleccion} acciones={acciones} alto={ui.capas} />
          <Divisor
            sentido="fila"
            onEmpezar={() => {
              const capas = columnaDerecha.current?.querySelector("section")?.getBoundingClientRect().height ?? 220;
              uiAlEmpezar.current = { ...ui, capas };
            }}
            onArrastrar={(d) => {
              const total = columnaDerecha.current?.getBoundingClientRect().height ?? 800;
              cambiarUI({ capas: Math.min(total - 180, Math.max(110, (uiAlEmpezar.current.capas ?? 220) + d)) });
            }}
            onReiniciar={() => cambiarUI({ capas: null })}
          />
          <div className="border-t border-linea" />
          <ExportPanel
            incrustado
            session={session}
            anotaciones={[]}
            recorte={recorteNormalizado}
            inIndex={0}
            outIndex={0}
            currentIndex={0}
            fpsMax={Math.max(15, session.fps)}
            hasFfmpeg={hasFfmpeg}
            saveDirectory={settings.saveDirectory}
            aplanar={fotoTerminada}
            firma={firma}
            onSaved={setFirmaGuardada}
            onMedidaSalida={onMedidaSalida}
          />
        </aside>
      </div>
      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-linea bg-tarjeta px-2 text-[11.5px] text-apagado">
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label={t("Alejar (Ctrl −)")} title={t("Alejar (Ctrl −)")} onClick={() => zoomA(pasoDeZoom(vista.zoom, -1))}
            className="flex size-6 items-center justify-center rounded hover:bg-realce hover:text-titulo"><Minus className="size-3.5" /></button>
          <span className="w-12 text-center text-titulo tabular-nums">{Math.round(vista.zoom * 100)}%</span>
          <button type="button" aria-label={t("Acercar (Ctrl +)")} title={t("Acercar (Ctrl +)")} onClick={() => zoomA(pasoDeZoom(vista.zoom, 1))}
            className="flex size-6 items-center justify-center rounded hover:bg-realce hover:text-titulo"><Plus className="size-3.5" /></button>
        </div>
        <button type="button" onClick={() => ajustarVista()} title={t("Ajustar a la ventana (Ctrl+0)")}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-realce hover:text-titulo"><Maximize className="size-3.5" />{t("Ajustar")}</button>
        <button type="button" onClick={() => zoomA(1)} title={t("Tamaño real (Ctrl+1)")}
          className="rounded px-1.5 py-0.5 hover:bg-realce hover:text-titulo">100%</button>
        <span className="h-4 w-px bg-linea" />
        <span className="tabular-nums">{medidaFinal.w} × {medidaFinal.h} px</span>
        {salida && (salida.w !== medidaFinal.w || salida.h !== medidaFinal.h) && (
          <span className="rounded bg-marca/12 px-1.5 py-0.5 text-marca tabular-nums" title={t("La imagen se ve como va a quedar a ese tamaño")}>
            {t("Se guarda a {medida}", { medida: `${salida.w} × ${salida.h} px` })}
          </span>
        )}
        <span className="h-4 w-px bg-linea" />
        <span className="w-28 tabular-nums">{puntero ? `x ${Math.round(puntero[0])}, y ${Math.round(puntero[1])}` : ""}</span>
        <span role="status" className="ml-auto truncate text-marca">{aviso}</span>
      </footer>

      {verAtajos && <DialogoAtajos onCerrar={() => setVerAtajos(false)} />}
      {confirmarCierre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div role="alertdialog" aria-modal="true" aria-labelledby="descartar-titulo" className="max-w-sm rounded-xl border border-linea-fuerte bg-flotante p-6 text-titulo shadow-xl">
            <h2 id="descartar-titulo" className="font-semibold">{t("¿Descartar los cambios sin guardar?")}</h2>
            <p className="mt-2 text-sm text-suave">{t("Guarda la imagen o el vídeo para conservar tus cambios.")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button autoFocus onClick={() => setConfirmarCierre(false)} className="rounded-md bg-realce px-3 py-2 text-sm">{t("Seguir editando")}</button>
              <button onClick={() => void cerrar(true)} className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">{t("Descartar cambios")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CopyPlus,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  GripVertical,
  Lock,
  LockOpen,
  Trash2,
} from "lucide-react";
import { estaBloqueada, type Grupo, type Marca, type TipoMarca } from "../../lib/foto/marcas";
import { useT } from "../../lib/i18n";
import type { Opcion } from "./BarraMenu";
import { MenuContextual } from "./MenuContextual";

export const NOMBRE_DE: Record<TipoMarca, string> = {
  arrow: "Flecha",
  shape: "Forma",
  text: "Texto",
  step: "Paso",
  highlight: "Resaltado",
  pen: "Dibujo",
  pixelate: "Pixelado",
};

/** Lo que se puede hacer desde el panel. Lo hace el editor, que es quien tiene el documento. */
export interface AccionesCapas {
  /** `sumar` es con Ctrl o Mayús: añade o quita sin soltar lo demás. */
  elegir: (id: number, sumar: boolean) => void;
  elegirGrupo: (id: number, sumar: boolean) => void;
  visible: (id: number) => void;
  /** Bloquea esas marcas, o las desbloquea si ya lo estaban todas. */
  bloquear: (ids: number[]) => void;
  borrar: (ids: number[]) => void;
  grupo: (id: number, cambio: Partial<Pick<Grupo, "nombre" | "oculto" | "plegado" | "bloqueado">>) => void;
  borrarGrupo: (id: number) => void;
  deshacerGrupo: (id: number) => void;
  /** Con esas marcas dentro, o vacía. */
  nuevaCarpeta: (ids: number[]) => void;
  meterEn: (ids: number[], grupo: number) => void;
  sacar: (ids: number[]) => void;
  /** Encima o debajo de otra capa, en su misma carpeta. */
  ponerJunto: (ids: number[], objetivo: number, encima: boolean) => void;
  duplicar: () => void;
  subir: () => void;
  bajar: () => void;
}

interface Props {
  marcas: Marca[];
  grupos: Grupo[];
  seleccion: number[];
  acciones: AccionesCapas;
  /** Alto que eligió la persona arrastrando el borde de abajo, o null para el de fábrica. */
  alto: number | null;
}

type Destino =
  | { tipo: "carpeta"; id: number }
  | { tipo: "marca"; id: number; encima: boolean }
  /** El hueco de la lista que no es ninguna capa: sacar de la carpeta. */
  | { tipo: "suelto" };
type Arrastre = { x: number; y: number; ids: number[]; nombre: string; destino: Destino | null };
type Menu = { x: number; y: number; opciones: (Opcion | null)[] } | null;

/**
 * Las marcas en orden, la de más arriba primero, como capas, y dentro de sus carpetas.
 *
 * Sirve para lo que el lienzo no deja: elegir una marca tapada por otra, esconder una para
 * ver lo de debajo, bloquear lo que no se quiere mover sin querer, o encontrar un texto que
 * se quedó fuera del recorte. Una carpeta sale donde está la más alta de sus marcas, con
 * todas las suyas dentro; una vacía, arriba del todo.
 *
 * **Las capas se arrastran con el ratón a mano, no con el arrastrar y soltar del
 * navegador.** Tauri se queda ese para recibir archivos soltados encima de la ventana, y
 * con él puesto el del navegador no llega nunca: en las pruebas funcionaba y en la
 * aplicación no se podía mover nada.
 */
export function PanelCapas({ marcas, grupos, seleccion, acciones: a, alto }: Props) {
  const t = useT();
  const [renombrando, setRenombrando] = useState<number | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  /** Si el último gesto fue un arrastre, para que el clic de después no elija nada. */
  const huboArrastre = useRef(false);
  const quitarOyentes = useRef<() => void>(() => {});
  const cerrarMenu = useCallback(() => setMenu(null), []);
  const porId = new Map(grupos.map((g) => [g.id, g]));
  useEffect(() => () => quitarOyentes.current(), []);

  /** Lo que mueve o toca una fila: lo elegido si ella está elegida, si no, ella sola. */
  const objetivo = (id: number) => (seleccion.includes(id) ? seleccion : [id]);

  // --- arrastrar ------------------------------------------------------------------------
  const destinoEn = (x: number, y: number, ids: number[]): Destino | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const fila = el?.closest<HTMLElement>("[data-destino]");
    if (fila) {
      const clave = fila.dataset.destino!;
      const id = Number(clave.slice(1));
      if (clave[0] === "g") {
        // Soltar una carpeta dentro de sí misma no tiene sentido.
        return ids.every((i) => marcas.find((m) => m.id === i)?.grupo === id) ? null : { tipo: "carpeta", id };
      }
      if (ids.includes(id)) return null;
      const r = fila.getBoundingClientRect();
      return { tipo: "marca", id, encima: y < r.top + r.height / 2 };
    }
    return el?.closest("[data-lista-capas]") ? { tipo: "suelto" } : null;
  };

  const empezarArrastre = (e: React.PointerEvent, ids: number[], nombre: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button,input") || !ids.length) return;
    huboArrastre.current = false;
    const desde = { x: e.clientX, y: e.clientY };
    const mover = (ev: PointerEvent) => {
      // Unos píxeles de margen: un clic con el pulso tembloroso no es un arrastre.
      if (!huboArrastre.current && Math.hypot(ev.clientX - desde.x, ev.clientY - desde.y) < 5) return;
      huboArrastre.current = true;
      setArrastre({ x: ev.clientX, y: ev.clientY, ids, nombre, destino: destinoEn(ev.clientX, ev.clientY, ids) });
    };
    const soltar = (ev: PointerEvent) => {
      quitarOyentes.current();
      setArrastre(null);
      if (!huboArrastre.current || ev.type === "pointercancel") return;
      const d = destinoEn(ev.clientX, ev.clientY, ids);
      if (d?.tipo === "carpeta") a.meterEn(ids, d.id);
      else if (d?.tipo === "marca") a.ponerJunto(ids, d.id, d.encima);
      else if (d?.tipo === "suelto") a.sacar(ids);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    quitarOyentes.current = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  };
  const sinClicTrasArrastre = (hacer: () => void) => () => {
    if (huboArrastre.current) {
      huboArrastre.current = false;
      return;
    }
    hacer();
  };

  // --- menús del clic derecho -----------------------------------------------------------
  const menuDeMarca = (e: React.MouseEvent, m: Marca) => {
    e.preventDefault();
    e.stopPropagation();
    const ids = objetivo(m.id);
    if (!seleccion.includes(m.id)) a.elegir(m.id, false);
    const enAlguna = marcas.some((x) => ids.includes(x.id) && x.grupo !== undefined);
    // Por sí mismas o por su carpeta: en una carpeta bloqueada, «Bloquear» y un «Borrar»
    // que luego no borraba nada eran mentira.
    const todasBloqueadas = marcas.filter((x) => ids.includes(x.id)).every((x) => estaBloqueada(x, grupos));
    setMenu({
      x: e.clientX,
      y: e.clientY,
      opciones: [
        { etiqueta: t("Meter en una carpeta nueva"), atajo: "Ctrl+G", accion: () => a.nuevaCarpeta(ids) },
        ...grupos
          .filter((g) => !ids.every((id) => marcas.find((x) => x.id === id)?.grupo === g.id))
          .map((g) => ({ etiqueta: t("Meter en «{nombre}»", { nombre: g.nombre }), accion: () => a.meterEn(ids, g.id) })),
        ...(enAlguna ? [{ etiqueta: t("Sacar de la carpeta"), atajo: "Ctrl+Mayús+G", accion: () => a.sacar(ids) }] : []),
        null,
        { etiqueta: todasBloqueadas ? t("Desbloquear") : t("Bloquear"), atajo: "Ctrl+L", accion: () => a.bloquear(ids) },
        { etiqueta: m.oculta ? t("Enseñar") : t("Esconder"), accion: () => a.visible(m.id) },
        null,
        { etiqueta: t("Duplicar"), atajo: "Ctrl+D", accion: a.duplicar },
        { etiqueta: t("Subir una capa"), accion: a.subir },
        { etiqueta: t("Bajar una capa"), accion: a.bajar },
        null,
        { etiqueta: t("Borrar"), atajo: "Supr", accion: () => a.borrar(ids), desactivada: todasBloqueadas },
      ],
    });
  };

  const menuDeCarpeta = (e: React.MouseEvent, g: Grupo) => {
    e.preventDefault();
    e.stopPropagation();
    a.elegirGrupo(g.id, false);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      opciones: [
        { etiqueta: t("Cambiar el nombre"), accion: () => setRenombrando(g.id) },
        { etiqueta: g.bloqueado ? t("Desbloquear") : t("Bloquear"), accion: () => a.grupo(g.id, { bloqueado: !g.bloqueado }) },
        { etiqueta: g.oculto ? t("Enseñar") : t("Esconder"), accion: () => a.grupo(g.id, { oculto: !g.oculto }) },
        { etiqueta: g.plegado ? t("Desplegar") : t("Plegar"), accion: () => a.grupo(g.id, { plegado: !g.plegado }) },
        null,
        { etiqueta: t("Deshacer la carpeta"), accion: () => a.deshacerGrupo(g.id) },
        { etiqueta: t("Borrar la carpeta y lo que tiene"), accion: () => a.borrarGrupo(g.id), desactivada: !!g.bloqueado },
      ],
    });
  };

  const menuDelHueco = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      opciones: [
        { etiqueta: seleccion.length ? t("Meter lo elegido en una carpeta nueva") : t("Carpeta nueva"), accion: () => a.nuevaCarpeta(seleccion) },
      ],
    });
  };

  // --- filas ----------------------------------------------------------------------------
  const marcaDeDestino = (clave: string) => {
    const d = arrastre?.destino;
    if (!d) return "";
    if (d.tipo === "carpeta" && clave === `g${d.id}`) return "bg-marca/30 ring-1 ring-marca";
    if (d.tipo === "marca" && clave === `m${d.id}`) {
      return d.encima ? "shadow-[inset_0_2px_0_var(--color-marca)]" : "shadow-[inset_0_-2px_0_var(--color-marca)]";
    }
    return "";
  };

  const fila = (m: Marca, dentro: boolean) => {
    const elegida = seleccion.includes(m.id);
    const bloqueadaPorCarpeta = m.grupo !== undefined && !!porId.get(m.grupo)?.bloqueado;
    const nombre = m.kind === "text"
      ? `${t("Texto")} «${(m.texto ?? "").split("\n")[0].slice(0, 18)}»`
      : m.kind === "step" ? `${t("Paso")} ${m.numero ?? ""}` : t(NOMBRE_DE[m.kind]);
    const clave = `m${m.id}`;
    const moviendose = !!arrastre && arrastre.ids.includes(m.id);
    return (
      <li key={m.id}>
        <div
          role="button"
          tabIndex={0}
          aria-pressed={elegida}
          data-destino={clave}
          onPointerDown={(e) => empezarArrastre(e, objetivo(m.id), nombre)}
          onClick={(e) => sinClicTrasArrastre(() => a.elegir(m.id, e.ctrlKey || e.metaKey || e.shiftKey))()}
          onKeyDown={(e) => e.key === "Enter" && a.elegir(m.id, false)}
          onContextMenu={(e) => menuDeMarca(e, m)}
          className={`group flex items-center gap-1.5 rounded-md py-1 pr-1.5 text-[12px] select-none ${dentro ? "pl-5" : "pl-1"} ${
            elegida ? "bg-marca/20 text-titulo" : "text-texto hover:bg-realce"
          } ${m.oculta || moviendose ? "opacity-50" : ""} ${marcaDeDestino(clave)}`}
        >
          <GripVertical className="size-3 shrink-0 cursor-grab text-fantasma opacity-0 group-hover:opacity-100" />
          <Ojo oculto={!!m.oculta} onClick={() => a.visible(m.id)} />
          <span className="size-2.5 shrink-0 rounded-[3px] border border-linea-fuerte" style={{ background: m.kind === "pixelate" ? "#8a8f99" : m.color }} />
          <span className="min-w-0 flex-1 truncate">{nombre}</span>
          {/* En una carpeta bloqueada el candado se sigue viendo, más apagado: sin él no
              había forma de saber que la capa estaba bloqueada ni de soltar solo esa. */}
          <Candado bloqueado={!!m.bloqueada || bloqueadaPorCarpeta} heredado={bloqueadaPorCarpeta && !m.bloqueada} onClick={() => a.bloquear([m.id])} />
          {!m.bloqueada && !bloqueadaPorCarpeta && <Papelera onClick={() => a.borrar([m.id])} />}
        </div>
      </li>
    );
  };

  const carpeta = (g: Grupo, suyas: Marca[]) => {
    const elegida = suyas.length > 0 && suyas.every((m) => seleccion.includes(m.id));
    const Flecha = g.plegado ? ChevronRight : ChevronDown;
    const clave = `g${g.id}`;
    return (
      <li key={clave}>
        <div
          role="button"
          tabIndex={0}
          aria-pressed={elegida}
          aria-label={g.nombre}
          data-destino={clave}
          onPointerDown={(e) => empezarArrastre(e, suyas.map((m) => m.id), g.nombre)}
          onClick={(e) => sinClicTrasArrastre(() => a.elegirGrupo(g.id, e.ctrlKey || e.metaKey || e.shiftKey))()}
          onDoubleClick={() => setRenombrando(g.id)}
          onContextMenu={(e) => menuDeCarpeta(e, g)}
          className={`group flex items-center gap-1.5 rounded-md py-1 pr-1.5 pl-1 text-[12px] font-medium select-none ${
            elegida ? "bg-marca/20 text-titulo" : "text-texto hover:bg-realce"
          } ${g.oculto ? "opacity-50" : ""} ${marcaDeDestino(clave)}`}
        >
          <GripVertical className="size-3 shrink-0 cursor-grab text-fantasma opacity-0 group-hover:opacity-100" />
          <Ojo oculto={!!g.oculto} onClick={() => a.grupo(g.id, { oculto: !g.oculto })} />
          <button
            type="button"
            aria-label={g.plegado ? t("Desplegar") : t("Plegar")}
            onClick={(e) => {
              e.stopPropagation();
              a.grupo(g.id, { plegado: !g.plegado });
            }}
            className="text-apagado hover:text-titulo"
          >
            <Flecha className="size-3.5" />
          </button>
          <Folder className="size-3.5 shrink-0 text-marca" />
          {renombrando === g.id ? (
            <input
              autoFocus
              defaultValue={g.nombre}
              aria-label={t("Nombre de la carpeta")}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                const campo = e.target as HTMLInputElement;
                if (e.key === "Enter") campo.blur();
                if (e.key === "Escape") {
                  campo.value = g.nombre;
                  campo.blur();
                }
              }}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value.trim() !== g.nombre) a.grupo(g.id, { nombre: e.target.value.trim() });
                setRenombrando(null);
              }}
              className="min-w-0 flex-1 rounded border border-marca bg-hueco px-1 text-[12px] text-titulo outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate" title={t("Doble clic para cambiar el nombre")}>
              {g.nombre}
              {!suyas.length && <span className="ml-1.5 font-normal text-fantasma">{t("(vacía: arrastra capas aquí)")}</span>}
            </span>
          )}
          <span className="text-[10px] text-fantasma">{suyas.length}</span>
          <Candado bloqueado={!!g.bloqueado} onClick={() => a.grupo(g.id, { bloqueado: !g.bloqueado })} />
          {!g.bloqueado && <Papelera onClick={() => a.borrarGrupo(g.id)} etiqueta="Borrar la carpeta y lo que tiene" />}
        </div>
      </li>
    );
  };

  // De arriba abajo: cada carpeta sale una vez, donde está la más alta de las suyas, y las
  // vacías arriba del todo, que es donde caerá lo primero que se meta en ellas.
  const filas: React.ReactNode[] = [];
  const conMarcas = new Set(marcas.map((m) => m.grupo));
  for (const g of grupos) if (!conMarcas.has(g.id)) filas.push(carpeta(g, []));
  const puestas = new Set<number>();
  for (const m of [...marcas].reverse()) {
    const g = m.grupo !== undefined ? porId.get(m.grupo) : undefined;
    if (!g) {
      filas.push(fila(m, false));
      continue;
    }
    if (puestas.has(g.id)) continue;
    puestas.add(g.id);
    const suyas = marcas.filter((x) => x.grupo === g.id).reverse();
    filas.push(carpeta(g, suyas));
    if (!g.plegado) for (const x of suyas) filas.push(fila(x, true));
  }

  const boton = (icono: React.ComponentType<{ className?: string }>, etiqueta: string, onClick: () => void, desactivado = false) => {
    const I = icono;
    return (
      <button type="button" onClick={onClick} disabled={desactivado} title={t(etiqueta)} aria-label={t(etiqueta)}
        className="flex size-7 items-center justify-center rounded-md text-suave hover:bg-realce hover:text-titulo disabled:opacity-35">
        <I className="size-4" />
      </button>
    );
  };

  const cuantas = arrastre?.ids.length ?? 0;
  return (
    <section
      aria-label={t("Capas")}
      className={`flex shrink-0 flex-col ${alto === null ? "max-h-[45%] min-h-[150px]" : ""}`}
      style={alto === null ? undefined : { height: alto }}
    >
      <h2 className="flex items-center justify-between px-3 pt-2.5 pb-1.5 text-[10px] font-semibold tracking-wider text-tenue uppercase">
        {t("Capas")}
        <span className="font-normal tracking-normal normal-case text-fantasma">{marcas.length}</span>
      </h2>
      <ul
        data-lista-capas
        className={`min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5 ${arrastre?.destino?.tipo === "suelto" ? "bg-marca/5" : ""}`}
        onContextMenu={menuDelHueco}
      >
        {filas}
        <li className="flex items-center gap-2 px-1.5 py-1 text-[12px] text-tenue">
          <Lock className="size-3.5" />
          {t("Captura")}
        </li>
      </ul>
      <div className="flex items-center gap-0.5 border-t border-linea-tenue px-1.5 py-1">
        <button
          type="button"
          onClick={() => a.nuevaCarpeta(seleccion)}
          title={seleccion.length ? t("Meter lo elegido en una carpeta nueva (Ctrl+G)") : t("Carpeta nueva")}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-texto hover:bg-realce hover:text-titulo"
        >
          <FolderPlus className="size-4 text-marca" />
          {t("Carpeta nueva")}
        </button>
        <span className="ml-auto" />
        {boton(Lock, "Bloquear o desbloquear (Ctrl+L)", () => a.bloquear(seleccion), !seleccion.length)}
        {boton(CopyPlus, "Duplicar (Ctrl+D)", a.duplicar, !seleccion.length)}
        {boton(ArrowUp, "Subir una capa", a.subir, !seleccion.length)}
        {boton(ArrowDown, "Bajar una capa", a.bajar, !seleccion.length)}
        {boton(Trash2, "Borrar (Supr)", () => a.borrar(seleccion), !seleccion.length)}
      </div>
      {arrastre && (
        <div
          className="pointer-events-none fixed z-50 rounded-md bg-marca px-2 py-1 text-[11.5px] font-medium text-white shadow-lg"
          style={{ left: arrastre.x + 12, top: arrastre.y + 10 }}
        >
          {cuantas > 1 ? t("{n} capas", { n: cuantas }) : arrastre.nombre}
          {arrastre.destino?.tipo === "carpeta" && ` → ${porId.get(arrastre.destino.id)?.nombre ?? ""}`}
          {arrastre.destino?.tipo === "suelto" && ` → ${t("fuera de la carpeta")}`}
        </div>
      )}
      {menu && <MenuContextual x={menu.x} y={menu.y} opciones={menu.opciones} onCerrar={cerrarMenu} />}
    </section>
  );
}

function Ojo({ oculto, onClick }: { oculto: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={oculto ? t("Enseñar") : t("Esconder")}
      title={oculto ? t("Enseñar") : t("Esconder")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="text-apagado hover:text-titulo"
    >
      {oculto ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
    </button>
  );
}

/** Puesto, se ve siempre; quitado, solo al pasar por encima, para no llenar la lista de candados. */
function Candado({ bloqueado, heredado = false, onClick }: { bloqueado: boolean; heredado?: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={bloqueado ? t("Desbloquear") : t("Bloquear")}
      aria-pressed={bloqueado}
      title={
        heredado
          ? t("Bloqueada por su carpeta. Clic para desbloquear solo esta.")
          : bloqueado ? t("Bloqueada: en la imagen no se puede elegir ni mover. Clic para desbloquear.") : t("Bloquear")
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={heredado ? "text-marca/45 hover:text-marca" : bloqueado ? "text-marca" : "text-apagado opacity-0 group-hover:opacity-100 hover:text-titulo"}
    >
      {bloqueado ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
    </button>
  );
}

function Papelera({ onClick, etiqueta = "Borrar" }: { onClick: () => void; etiqueta?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t(etiqueta)}
      title={t(etiqueta)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="text-red-500 opacity-0 group-hover:opacity-80 hover:opacity-100"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

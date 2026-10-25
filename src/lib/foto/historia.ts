/**
 * Deshacer y rehacer del editor de imágenes: las marcas Y el recorte, juntos.
 *
 * Es el mismo reductor que `annotationHistory` (con su «empezar» y «terminar» para que un
 * arrastre entero sea un solo paso), pero sobre el documento completo: en el editor de
 * imágenes recortar también se deshace con Ctrl+Z.
 */
import { useCallback, useReducer } from "react";
import type { DocFoto } from "./marcas";

export interface Historia {
  pasado: DocFoto[];
  presente: DocFoto;
  futuro: DocFoto[];
  grupo?: DocFoto;
}

type Cambio = DocFoto | ((previo: DocFoto) => DocFoto);
type Accion = { type: "editar"; cambio: Cambio } | { type: "deshacer" | "rehacer" | "empezar" | "terminar" };

const LIMITE = 100;
const igual = (a: DocFoto, b: DocFoto) => a === b || JSON.stringify(a) === JSON.stringify(b);

export const DOC_VACIO: DocFoto = { marcas: [], grupos: [], recorte: null };

export function historia(estado: Historia, accion: Accion): Historia {
  // Un arrastre que no llegó a soltarse (el ratón se fue de la ventana, un clic que se
  // perdió) dejaba el grupo abierto, y con él abierto Ctrl+Z no hacía nada. Deshacer o
  // rehacer lo cierran primero.
  if ((accion.type === "deshacer" || accion.type === "rehacer") && estado.grupo) {
    estado = historia(estado, { type: "terminar" });
  }
  switch (accion.type) {
    case "empezar":
      return estado.grupo ? estado : { ...estado, grupo: estado.presente };
    case "terminar": {
      if (!estado.grupo) return estado;
      const { grupo, ...resto } = estado;
      return igual(grupo, estado.presente) ? resto : { ...resto, pasado: [...estado.pasado.slice(-LIMITE + 1), grupo] };
    }
    case "deshacer":
      if (!estado.pasado.length) return estado;
      return { pasado: estado.pasado.slice(0, -1), presente: estado.pasado.at(-1)!, futuro: [estado.presente, ...estado.futuro] };
    case "rehacer":
      if (!estado.futuro.length) return estado;
      return { pasado: [...estado.pasado, estado.presente], presente: estado.futuro[0], futuro: estado.futuro.slice(1) };
    case "editar": {
      const siguiente = typeof accion.cambio === "function" ? accion.cambio(estado.presente) : accion.cambio;
      if (igual(siguiente, estado.presente)) return estado;
      if (estado.grupo) return { ...estado, presente: siguiente, futuro: [] };
      return { pasado: [...estado.pasado.slice(-LIMITE + 1), estado.presente], presente: siguiente, futuro: [] };
    }
  }
}

export function useHistoria() {
  const [estado, despachar] = useReducer(historia, { pasado: [], presente: DOC_VACIO, futuro: [] });
  return {
    doc: estado.presente,
    editar: useCallback((cambio: Cambio) => despachar({ type: "editar", cambio }), []),
    deshacer: useCallback(() => despachar({ type: "deshacer" }), []),
    rehacer: useCallback(() => despachar({ type: "rehacer" }), []),
    empezar: useCallback(() => despachar({ type: "empezar" }), []),
    terminar: useCallback(() => despachar({ type: "terminar" }), []),
    puedeDeshacer: estado.pasado.length > 0,
    puedeRehacer: estado.futuro.length > 0,
  };
}

import { useCallback, useReducer } from "react";
import type { Anotacion } from "./anotaciones";

export interface AnnotationHistory {
  past: Anotacion[][];
  present: Anotacion[];
  future: Anotacion[][];
  group?: Anotacion[];
}
type Change = Anotacion[] | ((previous: Anotacion[]) => Anotacion[]);
type Action = { type: "edit"; change: Change } | { type: "undo" | "redo" | "begin" | "end" };
export const EMPTY_HISTORY: AnnotationHistory = { past: [], present: [], future: [] };

export function annotationHistory(state: AnnotationHistory, action: Action): AnnotationHistory {
  if (action.type === "begin") return state.group ? state : { ...state, group: state.present };
  if (action.type === "end") {
    if (!state.group) return state;
    const { group, ...rest } = state;
    return JSON.stringify(group) === JSON.stringify(state.present) ? rest
      : { ...rest, past: [...state.past.slice(-99), group] };
  }
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  if (action.type !== "edit") return state;
  const next = typeof action.change === "function" ? action.change(state.present) : action.change;
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
  if (state.group) return { ...state, present: next, future: [] };
  return { past: [...state.past.slice(-99), state.present], present: next, future: [] };
}

export function useAnnotationHistory() {
  const [history, dispatch] = useReducer(annotationHistory, EMPTY_HISTORY);
  return {
    annotations: history.present,
    setAnnotations: useCallback((change: Change) => dispatch({ type: "edit", change }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
    beginEdit: useCallback(() => dispatch({ type: "begin" }), []),
    endEdit: useCallback(() => dispatch({ type: "end" }), []),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

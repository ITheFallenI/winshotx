/**
 * Dónde se ve la captura dentro del hueco del editor: cuánto se acerca y cuánto se mueve.
 *
 * Un punto de la captura `(x, y)` cae en la pantalla en `(panX + x * zoom, panY + y * zoom)`.
 * Todo lo demás (acercar hacia el ratón, ajustar, el 100 %) sale de esa cuenta.
 */
import type { Punto, Rect } from "./marcas";

export interface Vista {
  zoom: number;
  panX: number;
  panY: number;
}

export const ZOOM_MINIMO = 0.05;
export const ZOOM_MAXIMO = 16;
/** Los pasos de Ctrl + y Ctrl −: los mismos que en cualquier editor de fotos. */
export const PASOS_DE_ZOOM = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

/** El aire que se deja alrededor de la imagen al ajustarla, en píxeles de pantalla. */
const AIRE = 28;

/** La captura (o el trozo `caja` de ella) entera y centrada en un hueco de `ancho x alto`. */
export function ajustar(caja: Rect, ancho: number, alto: number): Vista {
  const zoom = Math.max(
    ZOOM_MINIMO,
    Math.min(1, (ancho - AIRE * 2) / Math.max(1, caja.w), (alto - AIRE * 2) / Math.max(1, caja.h)),
  );
  return {
    zoom,
    panX: (ancho - caja.w * zoom) / 2 - caja.x * zoom,
    panY: (alto - caja.h * zoom) / 2 - caja.y * zoom,
  };
}

/** Acercar o alejar sin que se mueva lo que hay debajo del punto de pantalla `(sx, sy)`. */
export function zoomHacia(v: Vista, zoom: number, sx: number, sy: number): Vista {
  const z = Math.max(ZOOM_MINIMO, Math.min(ZOOM_MAXIMO, zoom));
  const [ix, iy] = aImagen(v, sx, sy);
  return { zoom: z, panX: sx - ix * z, panY: sy - iy * z };
}

/** El paso de zoom siguiente (`1`) o anterior (`-1`) al actual. */
export function pasoDeZoom(actual: number, sentido: 1 | -1): number {
  if (sentido > 0) return PASOS_DE_ZOOM.find((p) => p > actual * 1.001) ?? ZOOM_MAXIMO;
  return [...PASOS_DE_ZOOM].reverse().find((p) => p < actual / 1.001) ?? ZOOM_MINIMO;
}

export function aImagen(v: Vista, sx: number, sy: number): Punto {
  return [(sx - v.panX) / v.zoom, (sy - v.panY) / v.zoom];
}

export function aPantalla(v: Vista, x: number, y: number): Punto {
  return [v.panX + x * v.zoom, v.panY + y * v.zoom];
}

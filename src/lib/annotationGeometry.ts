import type { Anotacion } from "./anotaciones";
export type Point = [number, number];
export interface Bounds { x: number; y: number; width: number; height: number }

export function annotationBounds(a: Anotacion, aspect = 1): Bounds {
  if (a.kind === "text") return { x: a.x1, y: a.y1,
    width: Math.max(0.02, a.text.length * (a.fontSize ?? 1 / 42) * 0.62),
    height: (a.fontSize ?? 1 / 42) * aspect * 1.25 };
  if (a.kind === "step") return { x: a.x1 - 0.038, y: a.y1 - 0.038, width: 0.076, height: 0.076 };
  const points = a.kind === "brush" && a.points?.length ? a.points : [[a.x1, a.y1], [a.x2, a.y2]];
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(0.002, Math.max(...xs) - x), height: Math.max(0.002, Math.max(...ys) - y) };
}

export function moveAnnotation(a: Anotacion, dx: number, dy: number, aspect = 1): Anotacion {
  const b = annotationBounds(a, aspect);
  dx = Math.max(-b.x, Math.min(1 - b.x - b.width, dx));
  dy = Math.max(-b.y, Math.min(1 - b.y - b.height, dy));
  return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy,
    ...(a.points ? { points: a.points.map(([x, y]) => [x + dx, y + dy] as Point) } : {}) };
}

export function resizeAnnotation(a: Anotacion, next: Bounds, aspect = 1): Anotacion {
  const b = annotationBounds(a, aspect);
  const x = (v: number) => next.x + (v - b.x) * next.width / b.width;
  const y = (v: number) => next.y + (v - b.y) * next.height / b.height;
  return { ...a, x1: x(a.x1), y1: y(a.y1), x2: x(a.x2), y2: y(a.y2),
    ...(a.kind === "text" ? { fontSize: Math.max(0.006, Math.min(0.25, (a.fontSize ?? 1 / 42) * next.height / b.height)) } : {}),
    ...(a.points ? { points: a.points.map(([px, py]) => [x(px), y(py)] as Point) } : {}) };
}

export function hitAnnotation(a: Anotacion, p: Point, width: number, height: number): boolean {
  const tolerance = 8;
  if (a.kind === "arrow" || a.kind === "brush") {
    const points: Point[] = a.kind === "brush" && a.points?.length ? a.points : [[a.x1, a.y1], [a.x2, a.y2]];
    return points.some((end, i) => {
      const start = points[Math.max(0, i - 1)];
      const dx = (end[0] - start[0]) * width, dy = (end[1] - start[1]) * height;
      const px = (p[0] - start[0]) * width, py = (p[1] - start[1]) * height;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - t * dx, py - t * dy) <= tolerance + (a.strokeWidth ?? 0) * width / 2;
    });
  }
  const b = annotationBounds(a, width / height);
  return p[0] >= b.x - tolerance / width && p[0] <= b.x + b.width + tolerance / width &&
    p[1] >= b.y - tolerance / height && p[1] <= b.y + b.height + tolerance / height;
}

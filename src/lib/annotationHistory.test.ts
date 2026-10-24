import { describe, expect, it } from "vitest";
import { annotationHistory, EMPTY_HISTORY } from "./annotationHistory";
import { annotationBounds, hitAnnotation, moveAnnotation, resizeAnnotation } from "./annotationGeometry";
import type { Anotacion } from "./anotaciones";
const brush: Anotacion = { kind: "brush", x1: .1, y1: .2, x2: .9, y2: .2, color: "#ef4444", text: "",
  points: [[.1,.2],[.5,.8],[.9,.2]], strokeWidth: .006 };

describe("annotation edits", () => {
  it("undoes an entire move and restores it with redo, without mutating the original path", () => {
    let h = annotationHistory(EMPTY_HISTORY, { type: "edit", change: [brush] });
    h = annotationHistory(h, { type: "edit", change: [moveAnnotation(brush, -.05, .1)] });
    expect(h.present[0].points?.[1]).toEqual([.45,.9]);
    h = annotationHistory(h, { type: "undo" });
    expect(h.present).toEqual([brush]);
    h = annotationHistory(h, { type: "redo" });
    expect(h.present[0].points?.[1]).toEqual([.45,.9]);
    h = annotationHistory(h, { type: "undo" });
    h = annotationHistory(h, { type: "edit", change: [] });
    expect(annotationHistory(h, { type: "redo" }).present).toEqual([]);
    expect(brush.points?.[1]).toEqual([.5,.8]);
  });
  it("groups text typing into one undo entry and ignores unchanged selections", () => {
    let h = annotationHistory(EMPTY_HISTORY, { type: "edit", change: [brush] });
    h = annotationHistory(h, { type: "begin" });
    for (const text of ["a", "ab", "abc"]) h = annotationHistory(h, { type: "edit", change: [{ ...brush, text }] });
    h = annotationHistory(h, { type: "end" });
    expect(annotationHistory(h, { type: "undo" }).present).toEqual([brush]);
    expect(annotationHistory(h, { type: "edit", change: h.present })).toBe(h);
  });
  it("resizes every point and hit-tests the actual curve, not its empty bounding box", () => {
    const resized = resizeAnnotation(brush, { x: .2, y: .1, width: .4, height: .3 });
    expect(resized.points?.[1][0]).toBeCloseTo(.4);
    expect(resized.points?.[1][1]).toBeCloseTo(.4);
    expect(hitAnnotation(brush, [.5,.8], 800, 400)).toBe(true);
    expect(hitAnnotation(brush, [.5,.3], 800, 400)).toBe(false);
    expect(annotationBounds(moveAnnotation(brush, 3, 3)).x).toBeCloseTo(.2);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clampView, fitScale, MediaPreview, zoomView } from "./MediaPreview";

const item = { path: "C:/shots/large.png", name: "large.png", kind: "image" as const, bytes: 100, modified: 1, day: "2026-10-22" };
describe("image inspection", () => {
  it("keeps the pixel under the cursor when zooming, then clamps panning to image edges", () => {
    const image = { width: 2000, height: 1000 }, viewport = { width: 500, height: 400 };
    const initial = { scale: 1, x: 20, y: -10, fitted: false }, anchor = { x: 70, y: 40 };
    const zoomed = zoomView(initial, 2, anchor, image, viewport);
    expect((anchor.x - zoomed.x) / zoomed.scale).toBe((anchor.x - initial.x) / initial.scale);
    expect((anchor.y - zoomed.y) / zoomed.scale).toBe((anchor.y - initial.y) / initial.scale);
    expect(clampView({ ...initial, x: 9999, y: -9999 }, image, viewport)).toMatchObject({ x: 750, y: -300 });
    expect(clampView({ ...initial, scale: 0.1 }, image, viewport)).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(0) });
    expect(fitScale(image, viewport)).toBe(0.25);
  });

  it("fits large images, zooms only with Ctrl+wheel, and supports 100% and Fit", async () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 800, height: 500, left: 0, top: 0 } as DOMRect);
    try {
      render(<MediaPreview item={item} onClose={() => {}} onOpen={() => {}} />);
      const image = screen.getByAltText("large.png");
      Object.defineProperty(image, "naturalWidth", { value: 1600 });
      Object.defineProperty(image, "naturalHeight", { value: 1000 });
      fireEvent.load(image);
      await waitFor(() => expect(screen.getByLabelText("Zoom level")).toHaveTextContent("50%"));
      const viewport = screen.getByLabelText("Image viewport");
      const wheel = (ctrlKey: boolean) => {
        // Happy DOM's WheelEvent currently omits the inherited MouseEvent properties.
        const event = new WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true });
        Object.defineProperties(event, { ctrlKey: { value: ctrlKey }, clientX: { value: 400 }, clientY: { value: 250 } });
        fireEvent(viewport, event);
      };
      wheel(false);
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("50%");
      wheel(true);
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("75%");
      fireEvent.click(screen.getByRole("button", { name: "100%" }));
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("100%");
      fireEvent.click(screen.getByRole("button", { name: "Fit" }));
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("50%");
    } finally { bounds.mockRestore(); }
  });
});

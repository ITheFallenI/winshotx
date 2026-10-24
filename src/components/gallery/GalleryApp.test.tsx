import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GalleryApp } from "./GalleryApp";
import { llamadas, responde } from "../../test/preparar";
import type { GalleryPage } from "../../lib/gallery";
const page = (name: string): GalleryPage => ({ directory: "C:/captures", total: 1,
  items: [{ path: `C:/captures/${name}`, name, kind: "video", day: "2026-10-22", bytes: 4000, modified: 1 }] });
function prepare() { responde("get_settings", { theme: "oscuro", language: "en" }); }

describe("gallery", () => {
  it("loads no video in the grid, opens one on demand without preloading, and releases it on close", async () => {
    prepare(); responde("gallery_list", page("clip.mp4"));
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    try {
      render(<GalleryApp />);
      await screen.findByText("clip.mp4");
      expect(document.querySelectorAll("video")).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Preview clip.mp4" }));
      const video = document.querySelector("video")!;
      expect(document.querySelectorAll("video")).toHaveLength(1);
      expect(video).toHaveAttribute("preload", "none");
      fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
      expect(document.querySelectorAll("video")).toHaveLength(0);
      expect(video).not.toHaveAttribute("src");
      expect(pause).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledOnce();
    } finally { pause.mockRestore(); load.mockRestore(); }
  });
  it("ignores an old search response arriving after the new search", async () => {
    prepare();
    let finish!: (p: GalleryPage) => void;
    responde("gallery_list", new Promise<GalleryPage>(resolve => { finish = resolve; }));
    render(<GalleryApp />);
    await waitFor(() => expect(llamadas.some(c => c.comando === "gallery_list")).toBe(true));
    responde("gallery_list", page("new.mp4"));
    fireEvent.change(screen.getByLabelText("Search captures"), { target: { value: "new" } });
    await screen.findByText("new.mp4");
    finish(page("old.mp4"));
    await waitFor(() => expect(screen.queryByText("old.mp4")).toBeNull());
    expect(screen.getByText("new.mp4")).toBeInTheDocument();
  });
  it("only recycles the chosen file after confirmation", async () => {
    prepare(); responde("gallery_list", page("clip.mp4"));
    render(<GalleryApp />);
    await screen.findByText("clip.mp4");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(llamadas.filter(c => c.comando === "gallery_manage")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(llamadas.filter(c => c.comando === "gallery_manage")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to Recycle Bin" }));
    await waitFor(() => expect(llamadas).toContainEqual({ comando: "gallery_manage",
      args: { path: "C:/captures/clip.mp4", operation: "recycle", name: null } }));
  });
});

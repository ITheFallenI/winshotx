import { invoke } from "@tauri-apps/api/core";
export interface GalleryItem { path: string; name: string; day: string; bytes: number; modified: number; kind: "image" | "gif" | "video" }
export interface GalleryPage { items: GalleryItem[]; total: number; directory: string }
export const openGallery = () => invoke<void>("open_gallery");
export const takeGalleryRequest = () => invoke<boolean>("take_gallery_request");
export const listGallery = (query: string, kind: string, day: string, offset: number) =>
  invoke<GalleryPage>("gallery_list", { query, kind, day, offset, limit: 60 });
export const galleryAction = (path: string, action: "open" | "copy" | "reveal") => invoke<void>("gallery_action", { path, action });
export const manageGallery = (path: string, operation: "rename" | "recycle", name: string | null = null) =>
  invoke<string | null>("gallery_manage", { path, operation, name });
export const chooseComparison = () => invoke<string[]>("gallery_choose_images");
export const saveComparison = (bytes: number[]) => invoke<string>("save_comparison", { bytes });

// Solo dos imagenes grandes se decodifican a la vez, aunque aparezcan 60 tarjetas.
let active = 0;
const queue: (() => void)[] = [];
export function galleryThumbnail(path: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      const index = queue.indexOf(start);
      if (index !== -1) queue.splice(index, 1);
      reject(new DOMException("Thumbnail no longer visible", "AbortError"));
    };
    const start = () => {
      active++;
      // Running native decodes finish before freeing a slot, even if no longer wanted.
      invoke<string>("gallery_thumbnail", { path }).then(resolve, reject).finally(() => {
        signal?.removeEventListener("abort", abort); active--; pump();
      });
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    queue.push(start);
    pump();
  });
}
function pump() { while (active < 2 && queue.length) queue.shift()!(); }

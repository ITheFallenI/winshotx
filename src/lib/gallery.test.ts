import { expect, it } from "vitest";
import { galleryThumbnail } from "./gallery";
import { llamadas, responde } from "../test/preparar";

it("limits native decoding to two jobs, discards queued work and holds a running slot until completion", async () => {
  let finish!: (path: string) => void;
  responde("gallery_thumbnail", new Promise<string>(resolve => { finish = resolve; }));
  const first = new AbortController(), third = new AbortController();
  const a = galleryThumbnail("first.png", first.signal).catch(e => e.name);
  const b = galleryThumbnail("second.png");
  const c = galleryThumbnail("offscreen.png", third.signal).catch(e => e.name);
  const d = galleryThumbnail("visible.png");
  const calls = () => llamadas.filter(c => c.comando === "gallery_thumbnail");
  expect(calls()).toHaveLength(2);
  first.abort(); third.abort();
  expect(await a).toBe("AbortError");
  expect(await c).toBe("AbortError");
  expect(calls()).toHaveLength(2);
  finish("thumbnail.png");
  expect(await b).toBe("thumbnail.png");
  expect(await d).toBe("thumbnail.png");
  expect(calls().map(c => c.args)).toEqual([{ path: "first.png" }, { path: "second.png" }, { path: "visible.png" }]);
});

import { imageDifference, type PixelImage } from "./imageDifference";
self.onmessage = (event: MessageEvent<{ a: PixelImage; b: PixelImage; tolerance: number }>) => {
  try {
    const result = imageDifference(event.data.a, event.data.b, event.data.tolerance);
    self.postMessage({ result }, { transfer: [result.data.buffer] });
  } catch (error) { self.postMessage({ error: String(error) }); }
};

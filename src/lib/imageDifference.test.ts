import { describe, expect, it } from "vitest";
import { imageDifference, type PixelImage } from "./imageDifference";
const image = (width: number, height: number, values: number[]): PixelImage => ({ width, height, data: new Uint8ClampedArray(values) });
describe("image comparison", () => {
  it("finds one changed pixel, handles alpha, and applies noise tolerance", () => {
    const a = image(2,1,[10,20,30,255,255,0,0,0]);
    const b = image(2,1,[11,20,30,255,0,255,0,0]);
    expect(imageDifference(a,a,0).changed).toBe(0);
    expect(imageDifference(a,b,0).changed).toBe(1);
    expect(imageDifference(a,b,1).changed).toBe(0);
    const c = image(2,1,[10,20,30,255,0,0,0,255]);
    expect(imageDifference(a,c,0).changed).toBe(1);
  });
  it("compares original pixels without silently scaling images of different sizes", () => {
    const a = image(1,1,[1,2,3,255]), b = image(2,1,[1,2,3,255,1,2,3,255]);
    const result = imageDifference(a,b,0);
    expect(result.width).toBe(2); expect(result.height).toBe(1); expect(result.changed).toBe(1);
    expect([...result.data.slice(4)]).toEqual([255,65,85,255]);
  });
});

export interface PixelImage { width: number; height: number; data: Uint8ClampedArray }
export function imageDifference(a: PixelImage, b: PixelImage, tolerance: number) {
  const width = Math.max(a.width, b.width), height = Math.max(a.height, b.height);
  if (width * height > 40_000_000) throw new Error("Comparison is limited to 40 million pixels.");
  const data = new Uint8ClampedArray(width * height * 4);
  let changed = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const hasA = x < a.width && y < a.height, hasB = x < b.width && y < b.height;
    const ia = (y * a.width + x) * 4, ib = (y * b.width + x) * 4;
    const aa = hasA ? a.data[ia + 3] : 0, ab = hasB ? b.data[ib + 3] : 0;
    let different = hasA !== hasB || Math.abs(aa - ab) > tolerance;
    for (let c = 0; c < 3; c++) {
      const va = hasA ? a.data[ia + c] * aa / 255 : 0, vb = hasB ? b.data[ib + c] * ab / 255 : 0;
      if (Math.abs(va - vb) > tolerance) different = true;
    }
    const i = (y * width + x) * 4;
    if (different) { data[i] = 255; data[i + 1] = 65; data[i + 2] = 85; changed++; }
    else { data[i] = data[i + 1] = data[i + 2] = hasA ? Math.round(a.data[ia] * .12 + a.data[ia + 1] * .24 + a.data[ia + 2] * .04) : 0; }
    data[i + 3] = 255;
  }
  return { width, height, data, changed };
}

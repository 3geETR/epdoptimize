// Experimental RGB-only error diffusion kernel.
// This mirrors the JavaScript RGB palette matching path byte-for-byte.

function clampByte(value: f64): u8 {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return <u8>Math.round(value);
}

export function ditherRgbErrorDiffusion(
  dataPtr: i32,
  palettePtr: i32,
  paletteLength: i32,
  width: i32,
  height: i32,
  matrixPtr: i32,
  matrixLength: i32,
  serpentine: i32
): void {
  if (paletteLength <= 0) return;

  for (let y: i32 = 0; y < height; y += 1) {
    const reverse = serpentine != 0 && (y & 1) == 1;
    const xStart: i32 = reverse ? width - 1 : 0;
    const xEnd: i32 = reverse ? -1 : width;
    const xStep: i32 = reverse ? -1 : 1;

    for (let x: i32 = xStart; x != xEnd; x += xStep) {
      const currentPixel = (y * width + x) << 2;
      const currentPtr = dataPtr + currentPixel;
      const oldR = load<u8>(currentPtr);
      const oldG = load<u8>(currentPtr + 1);
      const oldB = load<u8>(currentPtr + 2);

      let closestIndex: i32 = 0;
      let closestDistance = f64.MAX_VALUE;

      for (let paletteIndex: i32 = 0; paletteIndex < paletteLength; paletteIndex += 1) {
        const colorPtr = palettePtr + paletteIndex * 3;
        const dr = <f64>load<u8>(colorPtr) - <f64>oldR;
        const dg = <f64>load<u8>(colorPtr + 1) - <f64>oldG;
        const db = <f64>load<u8>(colorPtr + 2) - <f64>oldB;
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = paletteIndex;
        }
      }

      const closestPtr = palettePtr + closestIndex * 3;
      const newR = load<u8>(closestPtr);
      const newG = load<u8>(closestPtr + 1);
      const newB = load<u8>(closestPtr + 2);

      store<u8>(currentPtr, newR);
      store<u8>(currentPtr + 1, newG);
      store<u8>(currentPtr + 2, newB);
      store<u8>(currentPtr + 3, 255);

      const errorR = <f64>oldR - <f64>newR;
      const errorG = <f64>oldG - <f64>newG;
      const errorB = <f64>oldB - <f64>newB;

      for (let index: i32 = 0; index < matrixLength; index += 1) {
        const diffusionPtr = matrixPtr + index * 24;
        const offsetX = <i32>load<f64>(diffusionPtr);
        const offsetY = <i32>load<f64>(diffusionPtr + 8);
        const factor = load<f64>(diffusionPtr + 16);
        const dx = reverse ? -offsetX : offsetX;
        const nx = x + dx;
        const ny = y + offsetY;

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const pixelPtr = dataPtr + ((ny * width + nx) << 2);
        store<u8>(
          pixelPtr,
          clampByte(<f64>load<u8>(pixelPtr) + errorR * factor)
        );
        store<u8>(
          pixelPtr + 1,
          clampByte(<f64>load<u8>(pixelPtr + 1) + errorG * factor)
        );
        store<u8>(
          pixelPtr + 2,
          clampByte(<f64>load<u8>(pixelPtr + 2) + errorB * factor)
        );
      }
    }
  }
}

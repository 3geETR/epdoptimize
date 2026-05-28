import type { ImageDataLike, RGB } from "./processing";

interface DiffusionEntry {
  offset: number[];
  factor: number;
}

interface WasmExports {
  memory: WebAssembly.Memory;
  ditherRgbErrorDiffusion: (
    dataPtr: number,
    palettePtr: number,
    paletteLength: number,
    width: number,
    height: number,
    matrixPtr: number,
    matrixLength: number,
    serpentine: number
  ) => void;
}

const WASM_BASE64 =
  "AGFzbQEAAAABDAFgCH9/f39/f39/AAMCAQAFAwEAAAckAhdkaXRoZXJSZ2JFcnJvckRpZmZ1c2lvbgAABm1lbW9yeQIACtAFAc0FAgx/BnwgAkEATARADwsDQCAEIA1KBEAgB0EARyIJBEAgDUEBcSEJC0F/IAMgCRshEkF/QQEgCRshEyADQQFrQQAgCRshDgNAIA4gEkcEQCADIA1sIA5qQQJ0IABqIgwtAAAhDyAMLQABIRAgDC0AAiERQQAhCET////////vfyEVQQAhCwNAIAIgC0oEQCABIAtBA2xqIgotAAC4IA+4oSIUIBSiIAotAAG4IBC4oSIUIBSioCAKLQACuCARuKEiFCAUoqCfIhQgFWMEQCAUIRUgCyEICyALQQFqIQsMAQsLIAEgCEEDbGoiCC0AACELIAgtAAEhCiAILQACIQggDCALOgAAIAwgCjoAASAMIAg6AAIgDEH/AToAAyAPuCALuKEhGCAQuCAKuKEhFiARuCAIuKEhF0EAIQgDQCAGIAhKBEAgBSAIQRhsaiIMKwMA/AIhCiAMKwMQIRlBACAKayAKIAkbIA5qIgtBAEggAyALTHIgDCsDCPwCIA1qIgpBAEhyIAQgCkxyRQRAIAAgAyAKbCALakECdGoiCi0AALggGCAZoqAhFSAKAn9BACAVRAAAAAAAAAAAYw0AGkH/ASAVRAAAAAAA4G9AZA0AGiAVmyIUIBREAAAAAAAA8L+gIBREAAAAAAAA4L+gIBVlG/wDCzoAACAKAn9BACAKLQABuCAWIBmioCIVRAAAAAAAAAAAYw0AGkH/ASAVRAAAAAAA4G9AZA0AGiAVmyIUIBREAAAAAAAA8L+gIBREAAAAAAAA4L+gIBVlG/wDCzoAASAKAn9BACAKLQACuCAXIBmioCIVRAAAAAAAAAAAYw0AGkH/ASAVRAAAAAAA4G9AZA0AGiAVmyIUIBREAAAAAAAA8L+gIBREAAAAAAAA4L+gIBVlG/wDCzoAAgsgCEEBaiEIDAELCyAOIBNqIQ4MAQsLIA1BAWohDQwBCwsL";

let exportsPromise: Promise<WasmExports | null> | null = null;

const align = (value: number, boundary: number) =>
  Math.ceil(value / boundary) * boundary;

const decodeBase64 = (base64: string) => {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const bufferCtor = (
    globalThis as unknown as {
      Buffer?: { from(value: string, encoding: string): Uint8Array };
    }
  ).Buffer;
  if (bufferCtor) return new Uint8Array(bufferCtor.from(base64, "base64"));

  throw new Error("No base64 decoder is available for the WASM module.");
};

const getWasmExports = async (): Promise<WasmExports | null> => {
  if (typeof WebAssembly === "undefined") return null;
  if (!exportsPromise) {
    exportsPromise = WebAssembly.instantiate(decodeBase64(WASM_BASE64), {})
      .then((result) => result.instance.exports as unknown as WasmExports)
      .catch(() => null);
  }
  return exportsPromise;
};

const ensureMemory = (memory: WebAssembly.Memory, byteLength: number) => {
  const requiredPages = Math.ceil(byteLength / 65536);
  const currentPages = memory.buffer.byteLength / 65536;
  if (requiredPages > currentPages) memory.grow(requiredPages - currentPages);
};

export const applyWasmRgbErrorDiffusion = async (
  image: ImageDataLike,
  colorPalette: RGB[],
  diffusionMap: DiffusionEntry[],
  serpentine: boolean
) => {
  if (!colorPalette.length) return false;

  const wasmExports = await getWasmExports();
  if (!wasmExports) return false;

  const { memory, ditherRgbErrorDiffusion } = wasmExports;
  const dataByteLength = image.data.byteLength;
  const paletteByteLength = colorPalette.length * 3;
  const matrixByteLength = diffusionMap.length * 24;
  const dataPtr = 0;
  const palettePtr = align(dataPtr + dataByteLength, 8);
  const matrixPtr = align(palettePtr + paletteByteLength, 8);
  const totalBytes = matrixPtr + matrixByteLength;

  ensureMemory(memory, totalBytes);

  const bytes = new Uint8Array(memory.buffer);
  bytes.set(image.data, dataPtr);

  let paletteIndex = palettePtr;
  for (const color of colorPalette) {
    bytes[paletteIndex] = color[0];
    bytes[paletteIndex + 1] = color[1];
    bytes[paletteIndex + 2] = color[2];
    paletteIndex += 3;
  }

  const floats = new Float64Array(memory.buffer);
  let matrixIndex = matrixPtr / 8;
  for (const diffusion of diffusionMap) {
    floats[matrixIndex] = diffusion.offset[0];
    floats[matrixIndex + 1] = diffusion.offset[1];
    floats[matrixIndex + 2] = diffusion.factor;
    matrixIndex += 3;
  }

  ditherRgbErrorDiffusion(
    dataPtr,
    palettePtr,
    colorPalette.length,
    image.width,
    image.height,
    matrixPtr,
    diffusionMap.length,
    serpentine ? 1 : 0
  );

  image.data.set(bytes.subarray(dataPtr, dataPtr + dataByteLength));
  return true;
};

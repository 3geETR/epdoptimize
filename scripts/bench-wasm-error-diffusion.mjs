import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const epdoptimize = await import(pathToFileURL(`${process.cwd()}/dist/index.mjs`));

const paletteHex = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
];

const makeCanvas = (width, height, data) => {
  let imageData = { width, height, data: new Uint8ClampedArray(data) };
  const canvas = {
    width,
    height,
    getContext() {
      return {
        getImageData() {
          return {
            width: imageData.width,
            height: imageData.height,
            data: new Uint8ClampedArray(imageData.data),
          };
        },
        putImageData(next) {
          imageData = {
            width: next.width,
            height: next.height,
            data: new Uint8ClampedArray(next.data),
          };
          canvas.width = next.width;
          canvas.height = next.height;
        },
      };
    },
    get data() {
      return imageData.data;
    },
  };
  return canvas;
};

const makeData = (width, height) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = (x * 17 + y * 31 + 13) % 256;
      data[i + 1] = (x * x * 7 + y * 19) % 256;
      data[i + 2] = (x * 5 + y * y * 3 + 91) % 256;
      data[i + 3] = 255;
    }
  }
  return data;
};

const runDither = async (
  sourceData,
  width,
  height,
  matrixName,
  serpentine,
  processingEngine
) => {
  const output = makeCanvas(
    width,
    height,
    new Uint8ClampedArray(sourceData.length)
  );
  await epdoptimize.ditherImage(makeCanvas(width, height, sourceData), output, {
    ditheringType: "errorDiffusion",
    processingEngine,
    colorMatching: "rgb",
    errorDiffusionMatrix: matrixName,
    serpentine,
    palette: paletteHex,
  });
  return output.data;
};

const compare = (left, right) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return -1;
};

const time = async (callback, iterations) => {
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await callback();
  }
  return performance.now() - start;
};

const rows = [];
for (const [width, height, iterations] of [
  [192, 128, 20],
  [360, 240, 10],
  [800, 480, 4],
]) {
  const data = makeData(width, height);
  for (const matrixName of ["floydSteinberg", "stucki"]) {
    for (const serpentine of [false, true]) {
      const jsData = await runDither(
        data,
        width,
        height,
        matrixName,
        serpentine,
        "js"
      );
      const wasmData = await runDither(
        data,
        width,
        height,
        matrixName,
        serpentine,
        "wasm"
      );
      const mismatch = compare(jsData, wasmData);

      await runDither(data, width, height, matrixName, serpentine, "js");
      await runDither(data, width, height, matrixName, serpentine, "wasm");

      const jsMs = await time(
        () => runDither(data, width, height, matrixName, serpentine, "js"),
        iterations
      );
      const wasmMs = await time(
        () => runDither(data, width, height, matrixName, serpentine, "wasm"),
        iterations
      );

      rows.push({
        size: `${width}x${height}`,
        matrix: matrixName,
        serpentine,
        iterations,
        mismatch,
        jsPerRun: +(jsMs / iterations).toFixed(2),
        wasmPerRun: +(wasmMs / iterations).toFixed(2),
        speedup: +(jsMs / wasmMs).toFixed(2),
      });
    }
  }
}

console.table(rows);
const mismatches = rows.filter((row) => row.mismatch !== -1);
if (mismatches.length) {
  console.error("WASM output differed from JS output.");
  process.exitCode = 1;
}

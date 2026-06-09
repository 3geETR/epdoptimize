import type {
  AdjustmentPreviewOptions,
  DitherImageOptions,
  ImageDataLike,
} from "./dither";

const DEFAULT_FAST_PREVIEW_MAX_PIXELS = 786_432;
const DEFAULT_FAST_PREVIEW_MAX_LONG_EDGE = 1280;
const AUTO_WORKER_MIN_PIXELS = 350_000;

const normalizePreviewOptions = (
  preview: AdjustmentPreviewOptions | undefined,
  defaultMode: "fast" | "final"
): Required<AdjustmentPreviewOptions> => {
  const mode = preview?.mode ?? defaultMode;
  return {
    mode,
    maxPixels:
      preview?.maxPixels ??
      (mode === "final" ? Infinity : DEFAULT_FAST_PREVIEW_MAX_PIXELS),
    maxLongEdge:
      preview?.maxLongEdge ??
      (mode === "final" ? Infinity : DEFAULT_FAST_PREVIEW_MAX_LONG_EDGE),
  };
};

const getPreviewDimensions = (
  width: number,
  height: number,
  preview: Required<AdjustmentPreviewOptions>
) => {
  if (preview.mode === "final") return { width, height };

  let scale = 1;
  const longEdge = Math.max(width, height);
  if (Number.isFinite(preview.maxLongEdge) && longEdge > preview.maxLongEdge) {
    scale = Math.min(scale, preview.maxLongEdge / longEdge);
  }

  const pixels = width * height;
  if (Number.isFinite(preview.maxPixels) && pixels > preview.maxPixels) {
    scale = Math.min(scale, Math.sqrt(preview.maxPixels / pixels));
  }

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const createImageDataLike = (
  data: Uint8ClampedArray,
  width: number,
  height: number
): ImageDataLike => {
  const ImageDataCtor = globalThis.ImageData;
  return typeof ImageDataCtor === "function"
    ? new ImageDataCtor(data, width, height)
    : { data, width, height };
};

const resizeImageDataNearest = (
  image: ImageDataLike,
  width: number,
  height: number
) => {
  if (width === image.width && height === image.height) return image;

  const source = image.data;
  const output = new Uint8ClampedArray(width * height * 4);
  const xRatio = image.width / width;
  const yRatio = image.height / height;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor(y * yRatio));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor(x * xRatio));
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      const outputIndex = (y * width + x) * 4;
      output[outputIndex] = source[sourceIndex];
      output[outputIndex + 1] = source[sourceIndex + 1];
      output[outputIndex + 2] = source[sourceIndex + 2];
      output[outputIndex + 3] = source[sourceIndex + 3];
    }
  }

  return createImageDataLike(output, width, height);
};

export const getPreviewImageData = (
  image: ImageDataLike,
  previewOptions: AdjustmentPreviewOptions | undefined,
  defaultMode: "fast" | "final"
) => {
  const preview = normalizePreviewOptions(previewOptions, defaultMode);
  const dimensions = getPreviewDimensions(image.width, image.height, preview);
  return resizeImageDataNearest(image, dimensions.width, dimensions.height);
};

interface AdjustmentWorkerRequest {
  id: number;
  imageData: ImageDataLike;
  options: DitherImageOptions;
}

interface AdjustmentWorkerResponse {
  id: number;
  imageData?: ImageDataLike;
  error?: string;
}

let adjustmentWorker: Worker | null | undefined;
let adjustmentWorkerNextId = 1;
const adjustmentWorkerCallbacks = new Map<
  number,
  {
    resolve(imageData: ImageDataLike): void;
    reject(error: Error): void;
  }
>();

const getAdjustmentWorker = () => {
  if (typeof Worker === "undefined") return null;
  if (adjustmentWorker !== undefined) return adjustmentWorker;

  try {
    adjustmentWorker = new Worker(
      new URL("./adjustment-worker.ts", import.meta.url),
      { type: "module" }
    );
    adjustmentWorker.addEventListener(
      "message",
      (event: MessageEvent<AdjustmentWorkerResponse>) => {
        const callback = adjustmentWorkerCallbacks.get(event.data.id);
        if (!callback) return;

        adjustmentWorkerCallbacks.delete(event.data.id);
        if (event.data.error) {
          callback.reject(new Error(event.data.error));
          return;
        }
        if (!event.data.imageData) {
          callback.reject(new Error("Adjustment worker returned no image data."));
          return;
        }

        callback.resolve(event.data.imageData);
      }
    );
    adjustmentWorker.addEventListener("error", () => {
      for (const callback of adjustmentWorkerCallbacks.values()) {
        callback.reject(new Error("Adjustment worker failed."));
      }
      adjustmentWorkerCallbacks.clear();
      adjustmentWorker?.terminate();
      adjustmentWorker = null;
    });
  } catch {
    adjustmentWorker = null;
  }

  return adjustmentWorker;
};

export const shouldUseAdjustmentWorker = (
  options: Pick<DitherImageOptions, "adjustmentEngine">,
  image: ImageDataLike
) => {
  const engine = options.adjustmentEngine;
  if (engine === "js" || engine === "wasm") return false;
  if (engine === "worker") return getAdjustmentWorker() !== null;
  return (
    image.width * image.height >= AUTO_WORKER_MIN_PIXELS &&
    getAdjustmentWorker() !== null
  );
};

export const applyImageDataAdjustmentsInWorker = (
  image: ImageDataLike,
  opts: DitherImageOptions
) =>
  new Promise<ImageDataLike>((resolve, reject) => {
    const worker = getAdjustmentWorker();
    if (!worker) {
      reject(new Error("Adjustment worker is not available."));
      return;
    }

    const id = adjustmentWorkerNextId++;
    adjustmentWorkerCallbacks.set(id, { resolve, reject });
    const request: AdjustmentWorkerRequest = {
      id,
      imageData: image,
      options: {
        ...opts,
        adjustmentEngine: "js",
      },
    };

    try {
      worker.postMessage(request, [image.data.buffer as ArrayBuffer]);
    } catch (error) {
      adjustmentWorkerCallbacks.delete(id);
      reject(error instanceof Error ? error : new Error("Worker transfer failed."));
    }
  });

export const waitForAdjustmentTurn = () =>
  new Promise<void>((resolve) => {
    if (typeof setTimeout === "function") {
      setTimeout(resolve, 0);
    } else {
      resolve();
    }
  });

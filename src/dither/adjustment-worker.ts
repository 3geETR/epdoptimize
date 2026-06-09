import { applyImageDataAdjustments, type DitherImageOptions, type ImageDataLike } from "./dither";

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

const postWorkerMessage = (
  response: AdjustmentWorkerResponse,
  transfer?: Transferable[]
) => {
  (self as unknown as {
    postMessage(message: AdjustmentWorkerResponse, transfer?: Transferable[]): void;
  }).postMessage(response, transfer);
};

self.addEventListener(
  "message",
  (event: MessageEvent<AdjustmentWorkerRequest>) => {
    const { id, imageData, options } = event.data;

    try {
      const adjustedImageData = applyImageDataAdjustments(imageData, {
        ...options,
        adjustmentEngine: "js",
      });

      if (!adjustedImageData) {
        postWorkerMessage({ id, error: "Worker adjustment produced no image data." });
        return;
      }

      postWorkerMessage(
        { id, imageData: adjustedImageData },
        [adjustedImageData.data.buffer as ArrayBuffer]
      );
    } catch (error) {
      postWorkerMessage({
        id,
        error:
          error instanceof Error
            ? error.message
            : "Worker adjustment failed.",
      });
    }
  }
);

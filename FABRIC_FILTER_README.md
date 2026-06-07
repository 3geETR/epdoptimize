# EPD Optimize Fabric.js Filter

This guide shows how an image editor built with Fabric.js can use
`epdoptimize` as a custom image filter with editable controls for exposure,
contrast, saturation, clarity, dynamic range compression, and level compression.

The recommended split is:

- Fabric.js owns editing, object transforms, selection, and live canvas rendering.
- The custom Fabric filter owns per-image EPD-style adjustments.
- `ditherImage`, `ditherCanvas`, and `replaceColors` own final EPD preview/export.

Full dithering is usually better as a whole-canvas export step, not as a live
Fabric filter.

## Recommended Filter Split

For a production editor, prefer several Fabric filters instead of one large
filter:

```txt
EpdToneFilter
- exposure
- contrast
- saturation
- simplified highlights/shadows controls

EpdClarityFilter
- clarity amount
- radius
- midtone

EpdDynamicRangeFilter
- mode
- strength
- low/high percentiles
- preserve white

EpdLevelCompressionFilter
- mode
- auto
- auto threshold
- percentile clip
```

Split by processing stage, not by every individual slider. Exposure, contrast,
saturation, highlights, and shadows belong together because they all map to the
same `toneMapping` stage.

This split gives the editor a cleaner UI:

- Each panel can be toggled independently.
- Simple tone sliders can update without forcing expensive range/level work.
- Fabric's filter stack remains easier to serialize and inspect.
- The final EPD export can still use one composed `epdoptimize` pipeline.

One large filter is fine for prototypes, but multiple stage filters are usually
better for a real image editor.

The `Basic Filter` example below keeps everything in one filter to show the
whole option shape in one place. In production, move each option block into the
matching stage filter and keep the order as tone, clarity, dynamic range, then
level compression.

## Required API

The filter uses the synchronous ImageData helper:

```ts
import { applyImageDataAdjustments } from "epdoptimize";
```

This function mutates the supplied `ImageData` and returns it. That shape fits
Fabric's CPU filter pipeline because Fabric filters receive `options.imageData`
inside `applyTo2d`.

Because these filters call a CPU/ImageData API, force Fabric to use its Canvas2D
filter backend before registering or applying the filters:

```ts
fabric.enableGLFiltering = false;
fabric.filterBackend = new fabric.Canvas2dFilterBackend();
```

If Fabric keeps its default WebGL backend, it calls `applyToWebGL` instead of
`applyTo2d`, so an ImageData-only custom filter will appear to do nothing.

The test playground includes an optional `Fast WebGL preview` toggle. The
shader path handles exposure, contrast, saturation, simplified
shadows/highlights, clarity, display-range dynamic range compression, and level
compression.

The WebGL tone shader follows the same operation order as the CPU tone stage
and uses the same HSL-style saturation model. It is very close, but not
guaranteed byte-identical because the shader uses floating-point math while the
CPU implementation rounds/clamps through `Uint8ClampedArray` operations.

In `Fast WebGL preview` mode, tone, Clarity, Dynamic Range, and Levels controls
are live in the editor. The WebGL Dynamic Range shader implements the
display-range remap using the selected palette's black/white LAB lightness
range. The Clarity shader uses a sampled blur/unsharp-mask approximation, and
the Levels shader remaps luma or channels into the selected low/high range.

CPU preview/export remains the exact path for automatic analysis, Dynamic Range
`auto`/percentile behavior, and final EPD output. The WebGL path is intended for
interactive feedback while dragging controls.

The practical split is:

- Use WebGL shaders for live controls such as exposure, contrast, saturation,
  simplified shadows/highlights, clarity, display-range dynamic range
  compression, and manual level preview.
- Keep exact `epdoptimize` ImageData processing for automatic analysis, dynamic
  range `auto`/percentile behavior, final preview, and export.
- Apply exact CPU filters on slider release or explicit preview refresh.

That hybrid approach gives immediate UI feedback without requiring every
`epdoptimize` stage to be rewritten as a Fabric WebGL shader. The WebGL tone
shader is a preview approximation; exact CPU processing is restored for the EPD
preview/export pass.

## Test Playground

A small clickable Fabric.js test app is available at
[examples/fabric-filter.html](examples/fabric-filter.html).

Run it with the examples dev server:

```bash
npm run examples:dev
```

Then open:

```txt
http://localhost:5173/epdoptimize/fabric-filter.html
```

If port `5173` is already in use, Vite will print the next available URL, for
example `http://localhost:5174/epdoptimize/fabric-filter.html`.

The playground lets you select an image, move tone sliders, toggle fast WebGL
tone preview, toggle clarity, dynamic range, and level compression, apply
automatic settings, add extra objects, and render a dithered/device-color EPD
preview.

## Basic Filter

```ts
import { fabric } from "fabric";
import {
  applyImageDataAdjustments,
  aitjcizeSpectra6Palette,
} from "epdoptimize";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const SHADOW_CONTROL_SCALE = 1;
const HIGHLIGHT_CONTROL_SCALE = 1;

const toEpdToneMapping = (filter) => {
  const shadows = clamp(filter.shadows ?? 0, -1, 1);
  const highlights = clamp(filter.highlights ?? 0, -1, 1);
  const usesCurve = shadows !== 0 || highlights !== 0;

  return {
    exposure: filter.exposure,
    contrast: filter.contrast,
    saturation: filter.saturation,
    strength: usesCurve ? filter.toneStrength : 0,
    shadowBoost: shadows * SHADOW_CONTROL_SCALE,
    highlightCompress: highlights * HIGHLIGHT_CONTROL_SCALE,
    midpoint: filter.toneMidpoint,
  };
};

fabric.Image.filters.EpdAdjustments = fabric.util.createClass(
  fabric.Image.filters.BaseFilter,
  {
    type: "EpdAdjustments",

    exposure: 0,
    contrast: 0,
    saturation: 0,
    shadows: 0,
    highlights: 0,
    toneStrength: 0.8,
    toneMidpoint: 0.5,

    clarityAmount: 0,
    clarityRadius: 1.5,
    clarityMidtone: 0.5,

    dynamicRangeEnabled: false,
    dynamicRangeMode: "display",
    dynamicRangeStrength: 1,
    dynamicRangeLowPercentile: 0.02,
    dynamicRangeHighPercentile: 0.98,
    preserveWhite: true,

    levelCompressionEnabled: false,
    levelCompressionMode: "luma",
    levelCompressionAuto: true,
    levelCompressionAutoThreshold: 0.02,
    levelCompressionLowPercentile: 0.02,
    levelCompressionHighPercentile: 0.98,

    applyTo2d(options) {
      applyImageDataAdjustments(options.imageData, {
        palette: aitjcizeSpectra6Palette,

        toneMapping: toEpdToneMapping(this),

        clarity:
          this.clarityAmount === 0
            ? undefined
            : {
                amount: this.clarityAmount,
                radius: this.clarityRadius,
                midtone: this.clarityMidtone,
              },

        dynamicRangeCompression: this.dynamicRangeEnabled
          ? {
              mode: this.dynamicRangeMode,
              strength: this.dynamicRangeStrength,
              lowPercentile: this.dynamicRangeLowPercentile,
              highPercentile: this.dynamicRangeHighPercentile,
              preserveWhite: this.preserveWhite,
            }
          : undefined,

        levelCompression: this.levelCompressionEnabled
          ? {
              mode: this.levelCompressionMode,
              auto: this.levelCompressionAuto,
              autoThreshold: this.levelCompressionAutoThreshold,
              percentileClip: {
                low: this.levelCompressionLowPercentile,
                high: this.levelCompressionHighPercentile,
              },
            }
          : undefined,
      });
    },

    toObject() {
      return fabric.util.object.extend(this.callSuper("toObject"), {
        exposure: this.exposure,
        contrast: this.contrast,
        saturation: this.saturation,
        shadows: this.shadows,
        highlights: this.highlights,
        toneStrength: this.toneStrength,
        toneMidpoint: this.toneMidpoint,

        clarityAmount: this.clarityAmount,
        clarityRadius: this.clarityRadius,
        clarityMidtone: this.clarityMidtone,

        dynamicRangeEnabled: this.dynamicRangeEnabled,
        dynamicRangeMode: this.dynamicRangeMode,
        dynamicRangeStrength: this.dynamicRangeStrength,
        dynamicRangeLowPercentile: this.dynamicRangeLowPercentile,
        dynamicRangeHighPercentile: this.dynamicRangeHighPercentile,
        preserveWhite: this.preserveWhite,

        levelCompressionEnabled: this.levelCompressionEnabled,
        levelCompressionMode: this.levelCompressionMode,
        levelCompressionAuto: this.levelCompressionAuto,
        levelCompressionAutoThreshold: this.levelCompressionAutoThreshold,
        levelCompressionLowPercentile: this.levelCompressionLowPercentile,
        levelCompressionHighPercentile: this.levelCompressionHighPercentile,
      });
    },
  }
);

fabric.Image.filters.EpdAdjustments.fromObject =
  fabric.Image.filters.BaseFilter.fromObject;
```

## Attaching The Filter

```ts
function getEpdFilter(image) {
  let filter = image.filters.find((item) => item.type === "EpdAdjustments");

  if (!filter) {
    filter = new fabric.Image.filters.EpdAdjustments();
    image.filters.push(filter);
  }

  return filter;
}

function updateEpdFilter(canvas, image, values) {
  const filter = getEpdFilter(image);
  Object.assign(filter, values);

  image.applyFilters();
  canvas.requestRenderAll();
}
```

## Control Mapping

Suggested UI ranges:

| Control | Filter property | Suggested range | Neutral |
| --- | --- | --- | --- |
| Exposure | `exposure` | `-1` to `1` | `0` |
| Contrast | `contrast` | `-1` to `1` | `0` |
| Saturation | `saturation` | `-1` to `1` | `0` |
| Shadows | `shadows` | `-1` to `1` | `0` |
| Highlights | `highlights` | `-1` to `1` | `0` |
| Clarity | `clarityAmount` | `0` to `1` | `0` |
| Clarity radius | `clarityRadius` | `0.5` to `4` | `1.5` |
| Dynamic range strength | `dynamicRangeStrength` | `0` to `1` | `1` |
| Dynamic range low percentile | `dynamicRangeLowPercentile` | `0` to `0.1` | `0.02` |
| Dynamic range high percentile | `dynamicRangeHighPercentile` | `0.9` to `1` | `0.98` |
| Level auto threshold | `levelCompressionAutoThreshold` | `0` to `0.1` | `0.02` |
| Level low percentile | `levelCompressionLowPercentile` | `0` to `0.1` | `0.02` |
| Level high percentile | `levelCompressionHighPercentile` | `0.9` to `1` | `0.98` |

`epdoptimize` maps negative contrast more gently than positive contrast:
`contrast: -1` uses a `0.5x` contrast multiplier, while `contrast: 1` uses
`2x`. This keeps the low end useful instead of turning the image flat gray.

Example slider handler:

```ts
exposureInput.addEventListener("input", () => {
  updateEpdFilter(canvas, selectedImage, {
    exposure: Number(exposureInput.value),
  });
});

clarityInput.addEventListener("input", () => {
  updateEpdFilter(canvas, selectedImage, {
    clarityAmount: Number(clarityInput.value),
  });
});

shadowsInput.addEventListener("input", () => {
  updateEpdFilter(canvas, selectedImage, {
    shadows: Number(shadowsInput.value),
  });
});

highlightsInput.addEventListener("input", () => {
  updateEpdFilter(canvas, selectedImage, {
    highlights: Number(highlightsInput.value),
  });
});

dynamicRangeToggle.addEventListener("change", () => {
  updateEpdFilter(canvas, selectedImage, {
    dynamicRangeEnabled: dynamicRangeToggle.checked,
  });
});

levelCompressionToggle.addEventListener("change", () => {
  updateEpdFilter(canvas, selectedImage, {
    levelCompressionEnabled: levelCompressionToggle.checked,
  });
});
```

## Simplified Highlights And Shadows

Yes, the editor UI can show `Highlights` and `Shadows` instead of exposing
`toneMapping`, `scurve`, `shadowBoost`, and `highlightCompress`.

Use friendly controls like this:

```txt
Tone
- Exposure
- Contrast
- Saturation
- Shadows
- Highlights
```

Then map those values to `epdoptimize` internally:

```ts
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const SHADOW_CONTROL_SCALE = 1;
const HIGHLIGHT_CONTROL_SCALE = 1;

function toEpdToneMapping(values) {
  const shadows = clamp(values.shadows ?? 0, -1, 1);
  const highlights = clamp(values.highlights ?? 0, -1, 1);
  const usesCurve = shadows !== 0 || highlights !== 0;

  return {
    exposure: values.exposure ?? 0,
    contrast: values.contrast ?? 0,
    saturation: values.saturation ?? 0,

    strength: usesCurve ? values.toneStrength ?? 0.8 : 0,
    shadowBoost: shadows * SHADOW_CONTROL_SCALE,
    highlightCompress: highlights * HIGHLIGHT_CONTROL_SCALE,
    midpoint: values.toneMidpoint ?? 0.5,
  };
}
```

Suggested behavior:

- Positive `Shadows` lifts dark tones.
- Negative `Shadows` deepens dark tones.
- Positive `Highlights` brightens upper tones.
- Negative `Highlights` compresses or recovers upper tones.

The package applies a stronger internal response to `shadowBoost`, so a simple
`-1` to `1` editor slider can stay intuitive while still producing a visible
shadow lift.

For e-paper output, negative `Highlights` can be useful because it keeps bright
areas from flattening into paper white too early.

## Using Automatic Values

You can ask `epdoptimize` for image-specific adjustment values and copy them
onto the Fabric filter.

```ts
import {
  suggestCanvasImageAdjustmentOptions,
  aitjcizeSpectra6Palette,
} from "epdoptimize";

function autoAdjustImage(canvas, image) {
  const sourceCanvas = image.toCanvasElement();
  const suggestion = suggestCanvasImageAdjustmentOptions(
    sourceCanvas,
    aitjcizeSpectra6Palette,
    { intent: "natural" }
  );

  const filter = getEpdFilter(image);
  const adjustment = suggestion.adjustmentOptions;

  if (adjustment.toneMapping) {
    filter.exposure = adjustment.toneMapping.exposure ?? 0;
    filter.contrast = adjustment.toneMapping.contrast ?? 0;
    filter.saturation = adjustment.toneMapping.saturation ?? 0;
    filter.toneStrength = adjustment.toneMapping.strength ?? 0.8;
    filter.toneMidpoint = adjustment.toneMapping.midpoint ?? 0.5;
    filter.shadows = clamp(
      (adjustment.toneMapping.shadowBoost ?? 0) / SHADOW_CONTROL_SCALE,
      -1,
      1
    );
    filter.highlights = clamp(
      (adjustment.toneMapping.highlightCompress ?? 0) / HIGHLIGHT_CONTROL_SCALE,
      -1,
      1
    );
  }

  if (adjustment.clarity) {
    filter.clarityAmount = adjustment.clarity.amount ?? 0;
    filter.clarityRadius = adjustment.clarity.radius ?? 1.5;
    filter.clarityMidtone = adjustment.clarity.midtone ?? 0.5;
  }

  if (adjustment.dynamicRangeCompression) {
    const dynamicRange =
      adjustment.dynamicRangeCompression === true
        ? { mode: "display", strength: 1 }
        : adjustment.dynamicRangeCompression;

    filter.dynamicRangeEnabled = true;
    filter.dynamicRangeMode = dynamicRange.mode ?? "display";
    filter.dynamicRangeStrength = dynamicRange.strength ?? 1;
    filter.dynamicRangeLowPercentile = dynamicRange.lowPercentile ?? 0.02;
    filter.dynamicRangeHighPercentile = dynamicRange.highPercentile ?? 0.98;
    filter.preserveWhite = dynamicRange.preserveWhite ?? true;
  }

  if (adjustment.levelCompression) {
    filter.levelCompressionEnabled =
      adjustment.levelCompression.mode !== "off";
    filter.levelCompressionMode = adjustment.levelCompression.mode ?? "luma";
    filter.levelCompressionAuto = adjustment.levelCompression.auto ?? true;
    filter.levelCompressionAutoThreshold =
      adjustment.levelCompression.autoThreshold ?? 0.02;
    filter.levelCompressionLowPercentile =
      adjustment.levelCompression.percentileClip?.low ?? 0.02;
    filter.levelCompressionHighPercentile =
      adjustment.levelCompression.percentileClip?.high ?? 0.98;
  }

  image.applyFilters();
  canvas.requestRenderAll();

  return suggestion;
}
```

## Final EPD Preview And Export

The Fabric filter adjusts individual images. For final EPD output, render the
whole Fabric scene and then dither the composed canvas.

```ts
import {
  ditherImage,
  replaceColors,
  suggestCanvasDitherOptions,
  aitjcizeSpectra6Palette,
} from "epdoptimize";

async function renderEpdOutput(fabricCanvas) {
  const composedCanvas = fabricCanvas.toCanvasElement();
  const ditheredCanvas = document.createElement("canvas");
  const deviceCanvas = document.createElement("canvas");

  const suggestion = suggestCanvasDitherOptions(
    composedCanvas,
    aitjcizeSpectra6Palette
  );

  await ditherImage(composedCanvas, ditheredCanvas, {
    ...suggestion.ditherOptions,
    palette: aitjcizeSpectra6Palette,
  });

  replaceColors(ditheredCanvas, deviceCanvas, aitjcizeSpectra6Palette);

  return {
    previewCanvas: ditheredCanvas,
    deviceCanvas,
    suggestion,
  };
}
```

## Performance Notes

Fabric filters run over every pixel in the filtered image. The cost is roughly:

```txt
image width * image height * enabled processing steps
```

Fabric applies filters to the source bitmap, not just the displayed size. A
large photo scaled down on the canvas can still be expensive if the original
image is several thousand pixels wide. For editor previews, downscale imported
images to a working size such as `900` to `1400` pixels on the long edge, then
use the original file only for final high-resolution export if needed.

Tone mapping with exposure, contrast, and saturation is relatively cheap.
Clarity, dynamic range compression, and level compression with auto percentiles
are more expensive.

Recommended editor behavior:

- Debounce slider updates by about `50` to `100` ms.
- Add a `Disable debounce` developer/testing checkbox when you want to feel
  raw filter cost directly.
- For WebGL preview, update on the next animation frame instead of using the CPU
  debounce.
- Apply full-quality filtering on slider release.
- Disable expensive controls while dragging large images, or use a smaller
  preview image while dragging.
- Keep dithering as an explicit preview/export action.

In the test playground with a `643 x 900` working image, measured visible edit
latency was roughly:

| Mode | Average visible latency |
| --- | ---: |
| WebGL tone preview | `15 ms` |
| WebGL dynamic range preview | `13 ms` |
| CPU exact tone only | `98 ms` |
| CPU exact tone + dynamic range | `260 ms` |

Raw `applyFilters()` timing showed the same shape: CPU tone was about `29 ms`,
CPU tone plus dynamic range about `170 ms`, while WebGL tone returned in under
`1 ms` on the main thread. GPU work can still complete asynchronously, so
visible latency is the more useful editor metric.

Simple debounce:

```ts
function debounce(fn, delay) {
  let timeout;

  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

const updateEpdFilterDebounced = debounce(updateEpdFilter, 80);
```

## Practical Defaults

For a good initial editor preset:

```ts
const defaultEpdFilterValues = {
  exposure: 0,
  contrast: 0.15,
  saturation: 0.2,
  shadows: 0,
  highlights: -0.15,
  toneStrength: 0.8,
  toneMidpoint: 0.5,

  clarityAmount: 0,
  clarityRadius: 1.5,
  clarityMidtone: 0.5,

  dynamicRangeEnabled: true,
  dynamicRangeMode: "display",
  dynamicRangeStrength: 1,
  dynamicRangeLowPercentile: 0.02,
  dynamicRangeHighPercentile: 0.98,
  preserveWhite: true,

  levelCompressionEnabled: false,
  levelCompressionMode: "luma",
  levelCompressionAuto: true,
  levelCompressionAutoThreshold: 0.02,
  levelCompressionLowPercentile: 0.02,
  levelCompressionHighPercentile: 0.98,
};
```

Use automatic suggestions when possible, then let the user fine-tune from there.

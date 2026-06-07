import {
  aitjcizeSpectra6Palette,
  applyImageDataAdjustments,
  ditherImage,
  replaceColors,
  suggestCanvasDitherOptions,
  suggestCanvasImageAdjustmentOptions,
} from "../src";

declare const fabric: any;

declare global {
  interface Window {
    fabric?: any;
  }
}

type SliderBinding = {
  input: HTMLInputElement;
  value: HTMLElement;
  digits?: number;
};

type EpdToneValues = {
  exposure: number;
  contrast: number;
  saturation: number;
  shadows: number;
  highlights: number;
  toneStrength: number;
  toneMidpoint: number;
};

const sampleImages = [
  new URL("./sampleImages/affiche-plm-geneve.jpg", import.meta.url).href,
  new URL("./sampleImages/balcony.jpeg", import.meta.url).href,
  new URL("./sampleImages/color_screenshot.png", import.meta.url).href,
  new URL("./sampleImages/be-kind-to-books-club-lccn2011645392.jpg", import.meta.url).href,
];

const MAX_FILTER_IMAGE_EDGE = 900;
const SHADOW_CONTROL_SCALE = 1;
const HIGHLIGHT_CONTROL_SCALE = 1;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const fabricCanvasElement = $("fabricCanvas") as HTMLCanvasElement;
const ditheredCanvas = $("ditheredCanvas") as HTMLCanvasElement;
const deviceCanvas = $("deviceCanvas") as HTMLCanvasElement;

const fileInput = $("fileInput") as HTMLInputElement;
const addImageButton = $("addImageButton") as HTMLButtonElement;
const addTextButton = $("addTextButton") as HTMLButtonElement;
const addBlockButton = $("addBlockButton") as HTMLButtonElement;
const deleteButton = $("deleteButton") as HTMLButtonElement;
const autoButton = $("autoButton") as HTMLButtonElement;
const resetButton = $("resetButton") as HTMLButtonElement;
const renderButton = $("renderButton") as HTMLButtonElement;
const bringForwardButton = $("bringForwardButton") as HTMLButtonElement;
const sendBackButton = $("sendBackButton") as HTMLButtonElement;
const centerButton = $("centerButton") as HTMLButtonElement;

const selectionStatus = $("selectionStatus");
const appStatus = $("appStatus");
const previewStatus = $("previewStatus");
const reasonsList = $("reasonsList");

const exposureInput = $("exposureInput") as HTMLInputElement;
const contrastInput = $("contrastInput") as HTMLInputElement;
const saturationInput = $("saturationInput") as HTMLInputElement;
const shadowsInput = $("shadowsInput") as HTMLInputElement;
const highlightsInput = $("highlightsInput") as HTMLInputElement;
const webglTonePreviewInput = $("webglTonePreviewInput") as HTMLInputElement;
const disableDebounceInput = $("disableDebounceInput") as HTMLInputElement;
const clarityEnabledInput = $("clarityEnabledInput") as HTMLInputElement;
const clarityAmountInput = $("clarityAmountInput") as HTMLInputElement;
const clarityRadiusInput = $("clarityRadiusInput") as HTMLInputElement;
const dynamicRangeEnabledInput = $("dynamicRangeEnabledInput") as HTMLInputElement;
const dynamicRangeStrengthInput = $("dynamicRangeStrengthInput") as HTMLInputElement;
const dynamicRangeLowInput = $("dynamicRangeLowInput") as HTMLInputElement;
const dynamicRangeHighInput = $("dynamicRangeHighInput") as HTMLInputElement;
const levelEnabledInput = $("levelEnabledInput") as HTMLInputElement;
const levelAutoInput = $("levelAutoInput") as HTMLInputElement;
const levelThresholdInput = $("levelThresholdInput") as HTMLInputElement;
const levelLowInput = $("levelLowInput") as HTMLInputElement;
const levelHighInput = $("levelHighInput") as HTMLInputElement;

const sliderBindings: SliderBinding[] = [
  { input: exposureInput, value: $("exposureValue"), digits: 2 },
  { input: contrastInput, value: $("contrastValue"), digits: 2 },
  { input: saturationInput, value: $("saturationValue"), digits: 2 },
  { input: shadowsInput, value: $("shadowsValue"), digits: 2 },
  { input: highlightsInput, value: $("highlightsValue"), digits: 2 },
  { input: clarityAmountInput, value: $("clarityAmountValue"), digits: 2 },
  { input: clarityRadiusInput, value: $("clarityRadiusValue"), digits: 2 },
  { input: dynamicRangeStrengthInput, value: $("dynamicRangeStrengthValue"), digits: 2 },
  { input: dynamicRangeLowInput, value: $("dynamicRangeLowValue"), digits: 3 },
  { input: dynamicRangeHighInput, value: $("dynamicRangeHighValue"), digits: 3 },
  { input: levelThresholdInput, value: $("levelThresholdValue"), digits: 3 },
  { input: levelLowInput, value: $("levelLowValue"), digits: 3 },
  { input: levelHighInput, value: $("levelHighValue"), digits: 3 },
];

const filterControlElements = [
  exposureInput,
  contrastInput,
  saturationInput,
  shadowsInput,
  highlightsInput,
  webglTonePreviewInput,
  disableDebounceInput,
  clarityEnabledInput,
  clarityAmountInput,
  clarityRadiusInput,
  dynamicRangeEnabledInput,
  dynamicRangeStrengthInput,
  dynamicRangeLowInput,
  dynamicRangeHighInput,
  levelEnabledInput,
  levelAutoInput,
  levelThresholdInput,
  levelLowInput,
  levelHighInput,
  autoButton,
  resetButton,
];

const exactOnlyControlElements: HTMLInputElement[] = [];

let canvas: any;
let sampleIndex = 0;
let renderRequestId = 0;
let filterApplyTimer = 0;
let filterApplyFrame = 0;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const srgbToLinear = (value: number) => {
  const normalized = value / 255;
  return normalized > 0.04045
    ? Math.pow((normalized + 0.055) / 1.055, 2.4)
    : normalized / 12.92;
};

const labForwardPivot = (value: number) =>
  value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;

const rgbToLabLightness = ([red, green, blue]: [number, number, number]) => {
  const y =
    srgbToLinear(red) * 0.2126729 +
    srgbToLinear(green) * 0.7151522 +
    srgbToLinear(blue) * 0.072175;
  return 116 * labForwardPivot(y) - 16;
};

const luma = ([red, green, blue]: [number, number, number]) =>
  0.2126 * red + 0.7152 * green + 0.0722 * blue;

const getDisplayRangeUniforms = () => {
  const colors = aitjcizeSpectra6Palette.map((entry) => hexToRgb(entry.color));
  let darkest = colors[0];
  let lightest = colors[0];

  for (const color of colors) {
    if (luma(color) < luma(darkest)) darkest = color;
    if (luma(color) > luma(lightest)) lightest = color;
  }

  const blackL = rgbToLabLightness(darkest);
  const whiteL = rgbToLabLightness(lightest);

  return {
    blackL,
    whiteL,
    targetRange: Math.max(0.0001, whiteL - blackL),
  };
};

const displayRangeUniforms = getDisplayRangeUniforms();

const numberValue = (input: HTMLInputElement) => Number(input.value);

const contrastAdjustmentToMultiplier = (adjustment: number) =>
  adjustment < 0 ? Math.max(0.5, 1 + adjustment * 0.5) : adjustment + 1;

const setSliderValue = (input: HTMLInputElement, value: number) => {
  input.value = String(value);
  syncSliderValue(input);
};

const syncSliderValue = (input: HTMLInputElement) => {
  const binding = sliderBindings.find((item) => item.input === input);
  if (!binding) return;
  binding.value.textContent = numberValue(input).toFixed(binding.digits ?? 2);
};

const syncAllSliderValues = () => {
  sliderBindings.forEach(({ input }) => syncSliderValue(input));
};

const getSelectedObject = () => canvas?.getActiveObject() ?? null;

const isFabricImage = (object: any) => object?.type === "image";

const getSelectedImage = () => {
  const object = getSelectedObject();
  return isFabricImage(object) ? object : null;
};

const setStatus = (message: string, warn = false) => {
  appStatus.textContent = message;
  appStatus.classList.toggle("warn", warn);
};

const setPreviewStatus = (message: string, warn = false) => {
  previewStatus.textContent = message;
  previewStatus.classList.toggle("warn", warn);
};

const toEpdToneMapping = (values: EpdToneValues) => {
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
};

const epdToneFragmentSource = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uExposureMultiplier;
  uniform float uSaturationMultiplier;
  uniform float uContrastMultiplier;
  uniform float uUseCurve;
  uniform float uStrength;
  uniform float uShadowBoost;
  uniform float uHighlightCompress;
  uniform float uMidpoint;
  varying vec2 vTexCoord;
  const float SHADOW_TONE_RESPONSE = 1.5;

  vec3 applyHslSaturation(vec3 rgb, float saturationMultiplier) {
    float maxChannel = max(max(rgb.r, rgb.g), rgb.b);
    float minChannel = min(min(rgb.r, rgb.g), rgb.b);
    float lightness = (maxChannel + minChannel) * 0.5;

    if (maxChannel == minChannel) {
      return rgb;
    }

    float delta = maxChannel - minChannel;
    float saturation = lightness > 0.5
      ? delta / (2.0 - maxChannel - minChannel)
      : delta / max(maxChannel + minChannel, 0.000001);
    float hue;

    if (maxChannel == rgb.r) {
      hue = ((rgb.g - rgb.b) / delta + (rgb.g < rgb.b ? 6.0 : 0.0)) / 6.0;
    }
    else if (maxChannel == rgb.g) {
      hue = ((rgb.b - rgb.r) / delta + 2.0) / 6.0;
    }
    else {
      hue = ((rgb.r - rgb.g) / delta + 4.0) / 6.0;
    }

    float newSaturation = clamp(saturation * saturationMultiplier, 0.0, 1.0);
    float chroma = (1.0 - abs(2.0 * lightness - 1.0)) * newSaturation;
    float x = chroma * (1.0 - abs(mod(hue * 6.0, 2.0) - 1.0));
    float m = lightness - chroma * 0.5;
    float sector = floor(hue * 6.0);
    vec3 prime;

    if (sector < 1.0) {
      prime = vec3(chroma, x, 0.0);
    }
    else if (sector < 2.0) {
      prime = vec3(x, chroma, 0.0);
    }
    else if (sector < 3.0) {
      prime = vec3(0.0, chroma, x);
    }
    else if (sector < 4.0) {
      prime = vec3(0.0, x, chroma);
    }
    else if (sector < 5.0) {
      prime = vec3(x, 0.0, chroma);
    }
    else {
      prime = vec3(chroma, 0.0, x);
    }

    return clamp(prime + vec3(m), 0.0, 1.0);
  }

  float curveChannel(float value) {
    float mid = clamp(uMidpoint, 0.01, 0.99);
    float shadowExponent = clamp(
      1.0 - uStrength * uShadowBoost * SHADOW_TONE_RESPONSE,
      0.15,
      3.0
    );
    float highlightExponent = clamp(1.0 - uStrength * uHighlightCompress, 0.15, 3.0);

    if (value <= mid) {
      float shadowValue = clamp(value / mid, 0.0, 1.0);
      return pow(shadowValue, shadowExponent) * mid;
    }

    float highlightValue = clamp((value - mid) / (1.0 - mid), 0.0, 1.0);
    return mid + pow(highlightValue, highlightExponent) * (1.0 - mid);
  }

  void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    vec3 rgb = clamp(color.rgb * uExposureMultiplier, 0.0, 1.0);
    rgb = applyHslSaturation(rgb, uSaturationMultiplier);
    rgb = clamp((rgb - 0.5) * uContrastMultiplier + 0.5, 0.0, 1.0);

    if (uUseCurve > 0.5) {
      rgb = vec3(
        curveChannel(rgb.r),
        curveChannel(rgb.g),
        curveChannel(rgb.b)
      );
    }

    gl_FragColor = vec4(rgb, color.a);
  }
`;

const getToneShaderUniforms = (filter: EpdToneValues) => {
  const shadows = clamp(filter.shadows ?? 0, -1, 1);
  const highlights = clamp(filter.highlights ?? 0, -1, 1);
  const usesCurve = shadows !== 0 || highlights !== 0;

  return {
    exposureMultiplier: Math.pow(2, filter.exposure ?? 0),
    saturationMultiplier: Math.max(0, (filter.saturation ?? 0) + 1),
    contrastMultiplier: contrastAdjustmentToMultiplier(filter.contrast ?? 0),
    useCurve: usesCurve ? 1 : 0,
    strength: usesCurve ? filter.toneStrength ?? 0.8 : 0,
    shadowBoost: shadows * SHADOW_CONTROL_SCALE,
    highlightCompress: highlights * HIGHLIGHT_CONTROL_SCALE,
    midpoint: filter.toneMidpoint ?? 0.5,
  };
};

const epdClarityFragmentSource = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uEnabled;
  uniform float uAmount;
  uniform float uRadius;
  uniform float uMidtone;
  uniform float uTexelX;
  uniform float uTexelY;
  varying vec2 vTexCoord;

  void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    if (uEnabled < 0.5 || abs(uAmount) <= 0.0001) {
      gl_FragColor = color;
      return;
    }

    float radius = clamp(floor(uRadius + 0.5), 1.0, 4.0);
    vec3 sum = vec3(0.0);
    float count = 0.0;

    for (int y = -4; y <= 4; y++) {
      for (int x = -4; x <= 4; x++) {
        vec2 offset = vec2(float(x), float(y));
        if (abs(offset.x) <= radius && abs(offset.y) <= radius) {
          vec2 sampleCoord = clamp(
            vTexCoord + vec2(offset.x * uTexelX, offset.y * uTexelY),
            vec2(0.0),
            vec2(1.0)
          );
          sum += texture2D(uTexture, sampleCoord).rgb;
          count += 1.0;
        }
      }
    }

    vec3 blurred = sum / max(count, 1.0);
    float lightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float midtoneWeight = pow(
      clamp(1.0 - abs(2.0 * lightness - 1.0), 0.0, 1.0),
      max(uMidtone, 0.1)
    );
    vec3 rgb = clamp(
      color.rgb + (uAmount * 2.0) * (color.rgb - blurred) * midtoneWeight,
      0.0,
      1.0
    );

    gl_FragColor = vec4(rgb, color.a);
  }
`;

const epdDynamicRangeFragmentSource = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uEnabled;
  uniform float uStrength;
  uniform float uBlackL;
  uniform float uTargetRange;
  varying vec2 vTexCoord;

  float srgbToLinear(float value) {
    return value > 0.04045
      ? pow((value + 0.055) / 1.055, 2.4)
      : value / 12.92;
  }

  float linearToSrgb(float value) {
    return value > 0.0031308
      ? 1.055 * pow(max(value, 0.0), 1.0 / 2.4) - 0.055
      : 12.92 * value;
  }

  float labForwardPivot(float value) {
    return value > 0.008856 ? pow(value, 1.0 / 3.0) : 7.787 * value + 16.0 / 116.0;
  }

  vec3 rgbToLab(vec3 rgb) {
    vec3 linearRgb = vec3(
      srgbToLinear(rgb.r),
      srgbToLinear(rgb.g),
      srgbToLinear(rgb.b)
    );
    float x = (linearRgb.r * 0.4124564 + linearRgb.g * 0.3575761 + linearRgb.b * 0.1804375) * 100.0;
    float y = (linearRgb.r * 0.2126729 + linearRgb.g * 0.7151522 + linearRgb.b * 0.0721750) * 100.0;
    float z = (linearRgb.r * 0.0193339 + linearRgb.g * 0.1191920 + linearRgb.b * 0.9503041) * 100.0;
    float xn = labForwardPivot(x / 95.047);
    float yn = labForwardPivot(y / 100.0);
    float zn = labForwardPivot(z / 108.883);
    return vec3(116.0 * yn - 16.0, 500.0 * (xn - yn), 200.0 * (yn - zn));
  }

  vec3 labToXyz(vec3 lab) {
    float y = (lab.x + 16.0) / 116.0;
    float x = lab.y / 500.0 + y;
    float z = y - lab.z / 200.0;

    x = x > 0.206897 ? pow(x, 3.0) : (x - 16.0 / 116.0) / 7.787;
    y = y > 0.206897 ? pow(y, 3.0) : (y - 16.0 / 116.0) / 7.787;
    z = z > 0.206897 ? pow(z, 3.0) : (z - 16.0 / 116.0) / 7.787;

    return vec3(x * 95.047, y * 100.0, z * 108.883);
  }

  vec3 labToRgb(vec3 lab) {
    vec3 xyz = labToXyz(lab) / 100.0;
    vec3 linearRgb = vec3(
      xyz.x * 3.2404542 + xyz.y * -1.5371385 + xyz.z * -0.4985314,
      xyz.x * -0.9692660 + xyz.y * 1.8760108 + xyz.z * 0.0415560,
      xyz.x * 0.0556434 + xyz.y * -0.2040259 + xyz.z * 1.0572252
    );
    return clamp(vec3(
      linearToSrgb(linearRgb.r),
      linearToSrgb(linearRgb.g),
      linearToSrgb(linearRgb.b)
    ), 0.0, 1.0);
  }

  float getSaturation(vec3 rgb) {
    float maxChannel = max(max(rgb.r, rgb.g), rgb.b);
    float minChannel = min(min(rgb.r, rgb.g), rgb.b);
    if (maxChannel <= 0.0) {
      return 0.0;
    }

    return (maxChannel - minChannel) / maxChannel;
  }

  float luma709(vec3 rgb) {
    return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  }

  bool isProtectedChromaFit(float sourceLuma, vec3 resultRgb, float sourceSaturation) {
    if (sourceSaturation < 0.16) {
      return true;
    }
    float resultSaturation = getSaturation(resultRgb);
    float minimumSaturation = max(0.12, sourceSaturation * 0.72);
    if (resultSaturation >= minimumSaturation) {
      return true;
    }
    return luma709(resultRgb) <= sourceLuma + 4.0 / 255.0;
  }

  vec3 guardedLabLightnessFit(vec3 sourceRgb, vec3 sourceLab, float targetL, float amount) {
    float sourceSaturation = getSaturation(sourceRgb);
    float sourceLuma = luma709(sourceRgb);
    vec3 result = labToRgb(vec3(mix(sourceLab.x, targetL, amount), sourceLab.y, sourceLab.z));

    if (targetL <= sourceLab.x || isProtectedChromaFit(sourceLuma, result, sourceSaturation)) {
      return result;
    }

    float low = 0.0;
    float high = amount;
    vec3 protectedResult = sourceRgb;

    for (int step = 0; step < 5; step++) {
      float mid = (low + high) * 0.5;
      vec3 candidate = labToRgb(vec3(mix(sourceLab.x, targetL, mid), sourceLab.y, sourceLab.z));
      if (isProtectedChromaFit(sourceLuma, candidate, sourceSaturation)) {
        low = mid;
        protectedResult = candidate;
      }
      else {
        high = mid;
      }
    }

    return protectedResult;
  }

  void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    if (uEnabled < 0.5 || uStrength <= 0.0) {
      gl_FragColor = color;
      return;
    }

    vec3 lab = rgbToLab(color.rgb);
    float normalizedL = clamp(lab.x / 100.0, 0.0, 1.0);
    float targetL = uBlackL + normalizedL * uTargetRange;
    float chromaProtection = smoothstep(0.18, 0.68, getSaturation(color.rgb)) * 0.85;
    float amount = clamp(uStrength * (1.0 - chromaProtection), 0.0, 1.0);
    vec3 rgb = guardedLabLightnessFit(color.rgb, lab, targetL, amount);
    gl_FragColor = vec4(rgb, color.a);
  }
`;

const epdLevelCompressionFragmentSource = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uEnabled;
  uniform float uModeLuma;
  uniform float uBlack;
  uniform float uWhite;
  varying vec2 vTexCoord;

  float luma709(vec3 rgb) {
    return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    if (uEnabled < 0.5) {
      gl_FragColor = color;
      return;
    }

    float black = clamp(uBlack, 0.0, 1.0);
    float white = clamp(uWhite, 0.0, 1.0);
    float range = white - black;
    if (range <= 0.0001) {
      gl_FragColor = color;
      return;
    }

    vec3 rgb;
    if (uModeLuma > 0.5) {
      float y = luma709(color.rgb);
      float yNew = black + y * range;
      float ratio = y > 0.0 ? yNew / y : 0.0;
      float maxChannel = max(max(color.r, color.g), color.b);
      if (maxChannel > 0.0) {
        ratio = min(ratio, 1.0 / maxChannel);
      }
      rgb = clamp(color.rgb * ratio, 0.0, 1.0);
    }
    else {
      rgb = clamp(black + color.rgb * range, 0.0, 1.0);
    }

    gl_FragColor = vec4(rgb, color.a);
  }
`;

const getImageFilterDimensions = (image: any) => {
  const element = image.getElement?.() ?? image._filteredEl ?? image._element;
  return {
    width: Math.max(1, element?.naturalWidth ?? element?.width ?? image.width ?? 1),
    height: Math.max(1, element?.naturalHeight ?? element?.height ?? image.height ?? 1),
  };
};

const syncShaderMetrics = (image: any, clarity: any) => {
  const { width, height } = getImageFilterDimensions(image);
  clarity.texelX = 1 / width;
  clarity.texelY = 1 / height;
};

const createEpdFilter = (
  type: string,
  defaults: Record<string, unknown>,
  applyOptions: (filter: any) => Record<string, unknown>,
  webglOptions: Record<string, unknown> = {},
) => {
  const FilterClass = fabric.util.createClass(fabric.Image.filters.BaseFilter, {
    type,
    ...webglOptions,

    initialize(options = {}) {
      this.callSuper("initialize", options);
      Object.assign(this, defaults, options);
    },

    applyTo2d(options: { imageData: ImageData }) {
      applyImageDataAdjustments(options.imageData, {
        palette: aitjcizeSpectra6Palette,
        ...applyOptions(this),
      });
    },

    isNeutralState() {
      return false;
    },

    toObject() {
      return fabric.util.object.extend(
        this.callSuper("toObject"),
        Object.fromEntries(
          Object.keys(defaults).map((key) => [key, this[key]]),
        ),
      );
    },
  });

  FilterClass.fromObject = fabric.Image.filters.BaseFilter.fromObject;
  fabric.Image.filters[type] = FilterClass;
};

const registerFilters = () => {
  createEpdFilter(
    "EpdToneFilter",
    {
      exposure: 0,
      contrast: 0,
      saturation: 0,
      shadows: 0,
      highlights: 0,
      toneStrength: 0.8,
      toneMidpoint: 0.5,
    },
    (filter) => ({
      toneMapping: toEpdToneMapping(filter),
    }),
    {
      fragmentSource: epdToneFragmentSource,
      getUniformLocations(gl: WebGLRenderingContext, program: WebGLProgram) {
        return {
          uExposureMultiplier: gl.getUniformLocation(program, "uExposureMultiplier"),
          uSaturationMultiplier: gl.getUniformLocation(program, "uSaturationMultiplier"),
          uContrastMultiplier: gl.getUniformLocation(program, "uContrastMultiplier"),
          uUseCurve: gl.getUniformLocation(program, "uUseCurve"),
          uStrength: gl.getUniformLocation(program, "uStrength"),
          uShadowBoost: gl.getUniformLocation(program, "uShadowBoost"),
          uHighlightCompress: gl.getUniformLocation(program, "uHighlightCompress"),
          uMidpoint: gl.getUniformLocation(program, "uMidpoint"),
        };
      },
      sendUniformData(
        gl: WebGLRenderingContext,
        uniformLocations: Record<string, WebGLUniformLocation>,
      ) {
        const uniforms = getToneShaderUniforms(this);
        gl.uniform1f(uniformLocations.uExposureMultiplier, uniforms.exposureMultiplier);
        gl.uniform1f(uniformLocations.uSaturationMultiplier, uniforms.saturationMultiplier);
        gl.uniform1f(uniformLocations.uContrastMultiplier, uniforms.contrastMultiplier);
        gl.uniform1f(uniformLocations.uUseCurve, uniforms.useCurve);
        gl.uniform1f(uniformLocations.uStrength, uniforms.strength);
        gl.uniform1f(uniformLocations.uShadowBoost, uniforms.shadowBoost);
        gl.uniform1f(uniformLocations.uHighlightCompress, uniforms.highlightCompress);
        gl.uniform1f(uniformLocations.uMidpoint, uniforms.midpoint);
      },
    },
  );

  createEpdFilter(
    "EpdClarityFilter",
    {
      enabled: false,
      amount: 0,
      radius: 1.5,
      midtone: 0.5,
      texelX: 1,
      texelY: 1,
    },
    (filter) => ({
      clarity: filter.enabled
        ? {
            amount: filter.amount,
            radius: filter.radius,
            midtone: filter.midtone,
          }
        : undefined,
    }),
    {
      fragmentSource: epdClarityFragmentSource,
      getUniformLocations(gl: WebGLRenderingContext, program: WebGLProgram) {
        return {
          uEnabled: gl.getUniformLocation(program, "uEnabled"),
          uAmount: gl.getUniformLocation(program, "uAmount"),
          uRadius: gl.getUniformLocation(program, "uRadius"),
          uMidtone: gl.getUniformLocation(program, "uMidtone"),
          uTexelX: gl.getUniformLocation(program, "uTexelX"),
          uTexelY: gl.getUniformLocation(program, "uTexelY"),
        };
      },
      sendUniformData(
        gl: WebGLRenderingContext,
        uniformLocations: Record<string, WebGLUniformLocation>,
      ) {
        gl.uniform1f(uniformLocations.uEnabled, this.enabled ? 1 : 0);
        gl.uniform1f(uniformLocations.uAmount, clamp(this.amount ?? 0, -1, 1));
        gl.uniform1f(uniformLocations.uRadius, clamp(this.radius ?? 1.5, 1, 4));
        gl.uniform1f(uniformLocations.uMidtone, Math.max(0.1, this.midtone ?? 0.5));
        gl.uniform1f(uniformLocations.uTexelX, this.texelX ?? 1);
        gl.uniform1f(uniformLocations.uTexelY, this.texelY ?? 1);
      },
    },
  );

  createEpdFilter(
    "EpdDynamicRangeFilter",
    {
      enabled: true,
      mode: "display",
      strength: 1,
      lowPercentile: 0.02,
      highPercentile: 0.98,
      preserveWhite: true,
    },
    (filter) => ({
      dynamicRangeCompression: filter.enabled
        ? {
            mode: filter.mode,
            strength: filter.strength,
            lowPercentile: filter.lowPercentile,
            highPercentile: filter.highPercentile,
            preserveWhite: filter.preserveWhite,
          }
        : undefined,
    }),
    {
      fragmentSource: epdDynamicRangeFragmentSource,
      getUniformLocations(gl: WebGLRenderingContext, program: WebGLProgram) {
        return {
          uEnabled: gl.getUniformLocation(program, "uEnabled"),
          uStrength: gl.getUniformLocation(program, "uStrength"),
          uBlackL: gl.getUniformLocation(program, "uBlackL"),
          uTargetRange: gl.getUniformLocation(program, "uTargetRange"),
        };
      },
      sendUniformData(
        gl: WebGLRenderingContext,
        uniformLocations: Record<string, WebGLUniformLocation>,
      ) {
        gl.uniform1f(uniformLocations.uEnabled, this.enabled ? 1 : 0);
        gl.uniform1f(uniformLocations.uStrength, clamp(this.strength ?? 1, 0, 1));
        gl.uniform1f(uniformLocations.uBlackL, displayRangeUniforms.blackL);
        gl.uniform1f(uniformLocations.uTargetRange, displayRangeUniforms.targetRange);
      },
    },
  );

  createEpdFilter(
    "EpdLevelCompressionFilter",
    {
      enabled: false,
      mode: "luma",
      auto: true,
      autoThreshold: 0.02,
      lowPercentile: 0.02,
      highPercentile: 0.98,
    },
    (filter) => ({
      levelCompression: filter.enabled
        ? {
            mode: filter.mode,
            auto: filter.auto,
            autoThreshold: filter.autoThreshold,
            black: Math.round(clamp(filter.lowPercentile ?? 0, 0, 1) * 255),
            white: Math.round(clamp(filter.highPercentile ?? 1, 0, 1) * 255),
          }
        : undefined,
    }),
    {
      fragmentSource: epdLevelCompressionFragmentSource,
      getUniformLocations(gl: WebGLRenderingContext, program: WebGLProgram) {
        return {
          uEnabled: gl.getUniformLocation(program, "uEnabled"),
          uModeLuma: gl.getUniformLocation(program, "uModeLuma"),
          uBlack: gl.getUniformLocation(program, "uBlack"),
          uWhite: gl.getUniformLocation(program, "uWhite"),
        };
      },
      sendUniformData(
        gl: WebGLRenderingContext,
        uniformLocations: Record<string, WebGLUniformLocation>,
      ) {
        gl.uniform1f(uniformLocations.uEnabled, this.enabled ? 1 : 0);
        gl.uniform1f(uniformLocations.uModeLuma, this.mode === "luma" ? 1 : 0);
        gl.uniform1f(uniformLocations.uBlack, clamp(this.lowPercentile ?? 0, 0, 1));
        gl.uniform1f(uniformLocations.uWhite, clamp(this.highPercentile ?? 1, 0, 1));
      },
    },
  );
};

const ensureFilter = (image: any, type: string) => {
  let filter = image.filters.find((item: any) => item.type === type);
  if (!filter) {
    filter = new fabric.Image.filters[type]();
    image.filters.push(filter);
  }
  return filter;
};

const ensureFilterStack = (image: any) => {
  image.epdFilterStack ??= {};
  image.epdFilterStack.tone ??=
    image.filters.find((item: any) => item.type === "EpdToneFilter") ??
    new fabric.Image.filters.EpdToneFilter();
  image.epdFilterStack.clarity ??=
    image.filters.find((item: any) => item.type === "EpdClarityFilter") ??
    new fabric.Image.filters.EpdClarityFilter();
  image.epdFilterStack.dynamicRange ??=
    image.filters.find((item: any) => item.type === "EpdDynamicRangeFilter") ??
    new fabric.Image.filters.EpdDynamicRangeFilter();
  image.epdFilterStack.level ??=
    image.filters.find((item: any) => item.type === "EpdLevelCompressionFilter") ??
    new fabric.Image.filters.EpdLevelCompressionFilter();

  const {
    tone,
    clarity,
    dynamicRange,
    level,
  } = image.epdFilterStack;

  syncShaderMetrics(image, clarity);
  image.filters = [tone, clarity, dynamicRange, level];

  return { tone, clarity, dynamicRange, level };
};

const configureFilterBackend = () => {
  if (webglTonePreviewInput.checked) {
    fabric.enableGLFiltering = true;
    fabric.filterBackend = fabric.initFilterBackend();
  } else {
    fabric.enableGLFiltering = false;
    fabric.filterBackend = new fabric.Canvas2dFilterBackend();
  }
};

const refreshImageFilterBackends = () => {
  configureFilterBackend();
  canvas
    ?.getObjects()
    .filter(isFabricImage)
    .forEach((image: any) => {
      ensureFilterStack(image);
      image.applyFilters();
    });
  canvas?.requestRenderAll();
};

const applySelectedImageFilters = (immediate = false) => {
  const image = getSelectedImage();
  if (!image) {
    setStatus("Select an image to use EPD filters.", true);
    return;
  }

  const apply = () => {
    image.applyFilters();
    canvas.requestRenderAll();
  };

  window.clearTimeout(filterApplyTimer);
  window.cancelAnimationFrame(filterApplyFrame);
  if (immediate || disableDebounceInput.checked) {
    apply();
    return;
  }

  if (webglTonePreviewInput.checked) {
    filterApplyFrame = window.requestAnimationFrame(apply);
    return;
  }

  filterApplyTimer = window.setTimeout(apply, 80);
};

const updateControlsAvailability = () => {
  const image = getSelectedImage();
  filterControlElements.forEach((element) => {
    element.disabled = !image;
  });
  exactOnlyControlElements.forEach((element) => {
    element.disabled = !image || webglTonePreviewInput.checked;
  });

  const object = getSelectedObject();
  deleteButton.disabled = !object;
  bringForwardButton.disabled = !object;
  sendBackButton.disabled = !object;
  centerButton.disabled = !object;

  if (image) {
    selectionStatus.textContent = "Image selected";
    setStatus(
      webglTonePreviewInput.checked
        ? "Fast WebGL preview is on. Tone, clarity, dynamic range, and levels are live approximations."
        : "Move sliders to update the selected image.",
    );
  } else if (object) {
    selectionStatus.textContent = `${object.type} selected`;
    setStatus("EPD filters apply to image objects only.", true);
  } else {
    selectionStatus.textContent = "Nothing selected";
    setStatus("Select an image to use EPD filters.");
  }
};

const syncControlsFromImage = () => {
  const image = getSelectedImage();
  updateControlsAvailability();
  if (!image) return;

  const { tone, clarity, dynamicRange, level } = ensureFilterStack(image);

  setSliderValue(exposureInput, tone.exposure);
  setSliderValue(contrastInput, tone.contrast);
  setSliderValue(saturationInput, tone.saturation);
  setSliderValue(shadowsInput, tone.shadows);
  setSliderValue(highlightsInput, tone.highlights);

  clarityEnabledInput.checked = clarity.enabled;
  setSliderValue(clarityAmountInput, clarity.amount);
  setSliderValue(clarityRadiusInput, clarity.radius);

  dynamicRangeEnabledInput.checked = dynamicRange.enabled;
  setSliderValue(dynamicRangeStrengthInput, dynamicRange.strength);
  setSliderValue(dynamicRangeLowInput, dynamicRange.lowPercentile);
  setSliderValue(dynamicRangeHighInput, dynamicRange.highPercentile);

  levelEnabledInput.checked = level.enabled;
  levelAutoInput.checked = level.auto;
  setSliderValue(levelThresholdInput, level.autoThreshold);
  setSliderValue(levelLowInput, level.lowPercentile);
  setSliderValue(levelHighInput, level.highPercentile);
};

const updateSelectedImageFilterValues = () => {
  const image = getSelectedImage();
  if (!image) return;

  const { tone, clarity, dynamicRange, level } = ensureFilterStack(image);

  Object.assign(tone, {
    exposure: numberValue(exposureInput),
    contrast: numberValue(contrastInput),
    saturation: numberValue(saturationInput),
    shadows: numberValue(shadowsInput),
    highlights: numberValue(highlightsInput),
  });

  Object.assign(clarity, {
    enabled: clarityEnabledInput.checked,
    amount: numberValue(clarityAmountInput),
    radius: numberValue(clarityRadiusInput),
    midtone: 0.5,
  });

  Object.assign(dynamicRange, {
    enabled: dynamicRangeEnabledInput.checked,
    strength: numberValue(dynamicRangeStrengthInput),
    lowPercentile: numberValue(dynamicRangeLowInput),
    highPercentile: numberValue(dynamicRangeHighInput),
  });

  Object.assign(level, {
    enabled: levelEnabledInput.checked,
    auto: levelAutoInput.checked,
    autoThreshold: numberValue(levelThresholdInput),
    lowPercentile: numberValue(levelLowInput),
    highPercentile: numberValue(levelHighInput),
  });

  applySelectedImageFilters();
};

const addImageFromUrl = (url: string) => {
  const offset = sampleIndex;
  setStatus("Loading sample image...");

  createWorkingCanvasFromUrl(url)
    .then((workingCanvas) => {
      addFabricImage(workingCanvas, {
        left: 120 + offset * 14,
        top: 82 + offset * 10,
        width: 390,
      });
      sampleIndex = (sampleIndex + 1) % sampleImages.length;
    })
    .catch((error) => {
      setStatus(
        error instanceof Error ? error.message : "Could not load sample image.",
        true,
      );
    });
};

const addImageFromFile = (file: File) => {
  const url = URL.createObjectURL(file);
  setStatus("Loading image...");

  createWorkingCanvasFromUrl(url)
    .then((workingCanvas) => {
      URL.revokeObjectURL(url);
      addFabricImage(workingCanvas, {
        left: 135,
        top: 95,
        width: Math.min(420, fabricCanvasElement.width - 120),
      });
    })
    .catch((error) => {
      URL.revokeObjectURL(url);
      setStatus(
        error instanceof Error ? error.message : "Could not load image.",
        true,
      );
    });
};

const createWorkingCanvasFromUrl = (url: string) =>
  new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const scale = Math.min(
        1,
        MAX_FILTER_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const workingCanvas = document.createElement("canvas");
      workingCanvas.width = width;
      workingCanvas.height = height;
      const context = workingCanvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not create image canvas."));
        return;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);
      resolve(workingCanvas);
    };
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = url;
  });

const addFabricImage = (
  element: HTMLCanvasElement,
  placement: { left: number; top: number; width: number },
) => {
  const image = new fabric.Image(element, {
    left: placement.left,
    top: placement.top,
    cornerStyle: "circle",
    borderColor: "#18705f",
    cornerColor: "#18705f",
  });
  image.scaleToWidth(placement.width);
  ensureFilterStack(image);
  image.applyFilters();
  canvas.add(image);
  canvas.setActiveObject(image);
  canvas.requestRenderAll();
  syncControlsFromImage();
};

const addTextObject = () => {
  const text = new fabric.IText("EPD preview", {
    left: 90,
    top: 48,
    fill: "#202124",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 34,
    fontWeight: 760,
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.requestRenderAll();
  syncControlsFromImage();
};

const addBlockObject = () => {
  const block = new fabric.Rect({
    left: 470,
    top: 310,
    width: 130,
    height: 90,
    fill: "#e8c642",
    stroke: "#202124",
    strokeWidth: 3,
    rx: 2,
    ry: 2,
  });
  canvas.add(block);
  canvas.setActiveObject(block);
  canvas.requestRenderAll();
  syncControlsFromImage();
};

const resetSelectedImage = () => {
  const image = getSelectedImage();
  if (!image) return;

  image.filters = [];
  ensureFilterStack(image);
  syncControlsFromImage();
  applySelectedImageFilters(true);
};

const setReasons = (reasons: string[]) => {
  reasonsList.innerHTML = "";
  if (reasons.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No reasons returned.";
    reasonsList.append(item);
    return;
  }

  reasons.slice(0, 6).forEach((reason) => {
    const item = document.createElement("li");
    item.textContent = reason;
    reasonsList.append(item);
  });
};

const autoAdjustSelectedImage = () => {
  const image = getSelectedImage();
  if (!image) return;

  const sourceCanvas = image.toCanvasElement();
  const suggestion = suggestCanvasImageAdjustmentOptions(
    sourceCanvas,
    aitjcizeSpectra6Palette,
    { intent: "natural" },
  );
  const { tone, clarity, dynamicRange, level } = ensureFilterStack(image);
  const adjustments = suggestion.adjustmentOptions;

  if (adjustments.toneMapping) {
    Object.assign(tone, {
      exposure: adjustments.toneMapping.exposure ?? 0,
      contrast: adjustments.toneMapping.contrast ?? 0,
      saturation: adjustments.toneMapping.saturation ?? 0,
      toneStrength: adjustments.toneMapping.strength ?? 0.8,
      toneMidpoint: adjustments.toneMapping.midpoint ?? 0.5,
      shadows: clamp(
        (adjustments.toneMapping.shadowBoost ?? 0) / SHADOW_CONTROL_SCALE,
        -1,
        1,
      ),
      highlights: clamp(
        (adjustments.toneMapping.highlightCompress ?? 0) / HIGHLIGHT_CONTROL_SCALE,
        -1,
        1,
      ),
    });
  }

  if (adjustments.clarity) {
    Object.assign(clarity, {
      enabled: true,
      amount: adjustments.clarity.amount ?? 0,
      radius: adjustments.clarity.radius ?? 1.5,
      midtone: adjustments.clarity.midtone ?? 0.5,
    });
  } else {
    clarity.enabled = false;
  }

  if (adjustments.dynamicRangeCompression) {
    const range: any =
      adjustments.dynamicRangeCompression === true
        ? { mode: "display", strength: 1 }
        : adjustments.dynamicRangeCompression;
    Object.assign(dynamicRange, {
      enabled: true,
      mode: range.mode ?? "display",
      strength: range.strength ?? 1,
      lowPercentile: range.lowPercentile ?? 0.02,
      highPercentile: range.highPercentile ?? 0.98,
      preserveWhite: range.preserveWhite ?? true,
    });
  } else {
    dynamicRange.enabled = false;
  }

  if (adjustments.levelCompression) {
    Object.assign(level, {
      enabled: adjustments.levelCompression.mode !== "off",
      mode: adjustments.levelCompression.mode ?? "luma",
      auto: adjustments.levelCompression.auto ?? true,
      autoThreshold: adjustments.levelCompression.autoThreshold ?? 0.02,
      lowPercentile: adjustments.levelCompression.percentileClip?.low ?? 0.02,
      highPercentile: adjustments.levelCompression.percentileClip?.high ?? 0.98,
    });
  } else {
    level.enabled = false;
  }

  syncControlsFromImage();
  applySelectedImageFilters(true);
  setReasons(suggestion.reasons);
  setStatus(`Auto applied: ${suggestion.imageKind}.`);
};

const clearCanvas = (target: HTMLCanvasElement) => {
  const context = target.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, target.width, target.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, target.width, target.height);
};

const copyCanvas = (source: HTMLCanvasElement, target: HTMLCanvasElement) => {
  target.width = source.width;
  target.height = source.height;
  const context = target.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0);
};

const renderEpdPreview = async () => {
  const requestId = ++renderRequestId;
  setPreviewStatus("Rendering...");
  renderButton.disabled = true;
  const restoreWebglPreview = webglTonePreviewInput.checked;

  try {
    if (restoreWebglPreview) {
      webglTonePreviewInput.checked = false;
      refreshImageFilterBackends();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const composedCanvas = canvas.toCanvasElement(1);
    const suggestion = suggestCanvasDitherOptions(
      composedCanvas,
      aitjcizeSpectra6Palette,
      { intent: "natural" },
    );

    await ditherImage(composedCanvas, ditheredCanvas, {
      ...suggestion.ditherOptions,
      palette: aitjcizeSpectra6Palette,
    });

    if (requestId !== renderRequestId) return;

    replaceColors(ditheredCanvas, deviceCanvas, aitjcizeSpectra6Palette);
    setReasons(suggestion.reasons);
    setPreviewStatus(`Rendered as ${suggestion.imageKind}.`);
  } catch (error) {
    setPreviewStatus(
      error instanceof Error ? error.message : "Could not render preview.",
      true,
    );
  } finally {
    if (restoreWebglPreview) {
      webglTonePreviewInput.checked = true;
      refreshImageFilterBackends();
    }
    renderButton.disabled = false;
  }
};

const wireEvents = () => {
  sliderBindings.forEach(({ input }) => {
    input.addEventListener("input", () => {
      syncSliderValue(input);
      updateSelectedImageFilterValues();
    });
  });

  [
    webglTonePreviewInput,
    disableDebounceInput,
    clarityEnabledInput,
    dynamicRangeEnabledInput,
    levelEnabledInput,
    levelAutoInput,
  ].forEach((input) => {
    input.addEventListener("change", () => {
      if (input === webglTonePreviewInput) {
        refreshImageFilterBackends();
        updateControlsAvailability();
        setStatus(
          webglTonePreviewInput.checked
            ? "Fast WebGL preview is on. Tone, clarity, dynamic range, and levels are live approximations."
            : "Exact CPU filters are active in the editor.",
        );
        return;
      }

      if (input === disableDebounceInput) {
        setStatus(
          disableDebounceInput.checked
            ? "Debounce disabled. Slider edits apply immediately."
            : "Debounce enabled. CPU slider edits wait 80 ms before applying.",
        );
        return;
      }

      updateSelectedImageFilterValues();
    });
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    addImageFromFile(file);
    fileInput.value = "";
  });

  addImageButton.addEventListener("click", () => {
    addImageFromUrl(sampleImages[sampleIndex]);
  });

  addTextButton.addEventListener("click", addTextObject);
  addBlockButton.addEventListener("click", addBlockObject);

  deleteButton.addEventListener("click", () => {
    const object = getSelectedObject();
    if (!object) return;
    canvas.remove(object);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    syncControlsFromImage();
  });

  bringForwardButton.addEventListener("click", () => {
    const object = getSelectedObject();
    if (!object) return;
    object.bringForward();
    canvas.requestRenderAll();
  });

  sendBackButton.addEventListener("click", () => {
    const object = getSelectedObject();
    if (!object) return;
    object.sendBackwards();
    canvas.requestRenderAll();
  });

  centerButton.addEventListener("click", () => {
    const object = getSelectedObject();
    if (!object) return;
    object.center();
    object.setCoords();
    canvas.requestRenderAll();
  });

  resetButton.addEventListener("click", resetSelectedImage);
  autoButton.addEventListener("click", autoAdjustSelectedImage);
  renderButton.addEventListener("click", renderEpdPreview);

  canvas.on("selection:created", syncControlsFromImage);
  canvas.on("selection:updated", syncControlsFromImage);
  canvas.on("selection:cleared", syncControlsFromImage);
};

const initializeCanvas = () => {
  canvas = new fabric.Canvas(fabricCanvasElement, {
    backgroundColor: "#ffffff",
    preserveObjectStacking: true,
    selectionColor: "rgba(24, 112, 95, 0.16)",
    selectionBorderColor: "#18705f",
    selectionLineWidth: 1,
  });

  canvas.setDimensions({
    width: fabricCanvasElement.width,
    height: fabricCanvasElement.height,
  });

  const headline = new fabric.Text("Click objects, tune image filters", {
    left: 38,
    top: 28,
    fontSize: 22,
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 700,
    fill: "#2f3437",
    selectable: false,
    evented: false,
  });
  canvas.add(headline);

  addBlockObject();
  addTextObject();
  addImageFromUrl(sampleImages[0]);
};

const initialize = () => {
  if (!window.fabric) {
    setStatus("Fabric.js did not load. Check the CDN script.", true);
    selectionStatus.textContent = "Fabric unavailable";
    return;
  }

  configureFilterBackend();
  registerFilters();
  clearCanvas(ditheredCanvas);
  clearCanvas(deviceCanvas);
  syncAllSliderValues();
  initializeCanvas();
  wireEvents();
  copyCanvas(fabricCanvasElement, ditheredCanvas);
  copyCanvas(fabricCanvasElement, deviceCanvas);
};

initialize();

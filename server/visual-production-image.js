/**
 * OpenAI Images API provider for Visual Production previews.
 * Server-side only — never expose OPENAI_API_KEY to the browser.
 */
"use strict";

const BRAND_URL = "littlelearnershubbyleah.com";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const REALISTIC_STYLES = new Set(["REALISTIC_PHOTO", "REALISTIC_CLASSROOM"]);
const FLAT_PRINTABLE_STYLES = new Set([
  "FLAT_2D_ILLUSTRATION",
  "CLEAN_PRINTABLE",
  "SIMPLE_CHILDCARE_GRAPHIC",
]);

let sharpLib = null;
try {
  sharpLib = require("sharp");
} catch {
  sharpLib = null;
}

/**
 * @param {string} visualStyle
 * @returns {string}
 */
function imageSizeForBrief(visualStyle) {
  if (REALISTIC_STYLES.has(String(visualStyle || ""))) return "1536x1024";
  if (FLAT_PRINTABLE_STYLES.has(String(visualStyle || ""))) return "1024x1536";
  return "1024x1024";
}

/**
 * Build the single SVG footer overlay. Exactly one text node with BRAND_URL.
 * @param {number} width
 * @param {number} height
 * @returns {{ svg: Buffer, brandUrl: string, layerCount: number }}
 */
function buildBrandWatermarkSvg(width, height) {
  const w = Number(width || 1024);
  const h = Number(height || 1024);
  const fontSize = Math.max(14, Math.round(w * 0.022));
  const padding = Math.max(8, Math.round(h * 0.012));
  const svg = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <text x="${padding}" y="${h - padding}"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${fontSize}"
      font-weight="600"
      fill="rgba(255,255,255,0.95)"
      stroke="rgba(0,0,0,0.72)"
      stroke-width="2"
      paint-order="stroke"
    >${BRAND_URL}</text>
  </svg>`);
  return { svg, brandUrl: BRAND_URL, layerCount: 1 };
}

/**
 * @param {Buffer} pngBuffer
 * @returns {Promise<Buffer>}
 */
async function applyBrandWatermark(pngBuffer) {
  if (!sharpLib) throw new Error("sharp is required to apply the website watermark.");
  const image = sharpLib(pngBuffer);
  const meta = await image.metadata();
  const width = Number(meta.width || 1024);
  const height = Number(meta.height || 1024);
  const { svg } = buildBrandWatermarkSvg(width, height);
  // Exactly one footer composite layer — never add a second brand overlay.
  return image.composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

/**
 * @param {{ width?: number, height?: number }} [options]
 * @returns {Promise<{ buffer: Buffer, mimeType: string, model: string, size: string }>}
 */
async function createMockGeneratedImage(options = {}) {
  if (!sharpLib) throw new Error("sharp is required for visual production previews.");
  const width = Number(options.width || 64);
  const height = Number(options.height || 64);
  const raw = await sharpLib({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 214, g: 226, b: 238 },
    },
  }).png().toBuffer();
  const buffer = await applyBrandWatermark(raw);
  return {
    buffer,
    mimeType: "image/png",
    model: "mock-visual-production",
    size: `${width}x${height}`,
  };
}

/**
 * @param {object} input
 * @param {string} input.apiKey
 * @param {string} input.model
 * @param {object} input.brief
 * @returns {Promise<{ buffer: Buffer, mimeType: string, model: string, size: string }>}
 */
async function generateVisualProductionImage(input) {
  const source = input && typeof input === "object" ? input : {};
  const brief = source.brief && typeof source.brief === "object" ? source.brief : {};
  const size = imageSizeForBrief(brief.visualStyle);
  const prompt = String(brief.generationPrompt || "").trim();
  if (!prompt) {
    throw new Error("Visual brief is missing a generation prompt.");
  }

  if (process.env.VISUAL_PRODUCTION_MOCK_GENERATE === "1") {
    const [w, h] = size.split("x").map((value) => Number(value || 0));
    return createMockGeneratedImage({ width: w || 64, height: h || 64 });
  }

  const apiKey = String(source.apiKey || "").trim();
  const model = String(source.model || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2").trim();
  if (!apiKey) {
    const error = new Error("OpenAI image provider is not configured.");
    error.code = "provider_not_configured";
    throw error;
  }

  const response = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      output_format: "png",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error?.message || payload?.error || "OpenAI image generation failed.");
    const error = new Error(message);
    error.code = "provider_error";
    error.status = response.status;
    throw error;
  }

  const b64 = String(payload?.data?.[0]?.b64_json || "").trim();
  if (!b64) {
    const error = new Error("OpenAI image generation returned no image data.");
    error.code = "provider_error";
    throw error;
  }

  const rawBuffer = Buffer.from(b64, "base64");
  const buffer = await applyBrandWatermark(rawBuffer);
  return {
    buffer,
    mimeType: "image/png",
    model,
    size,
  };
}

module.exports = {
  BRAND_URL,
  OPENAI_IMAGES_URL,
  imageSizeForBrief,
  buildBrandWatermarkSvg,
  applyBrandWatermark,
  generateVisualProductionImage,
  createMockGeneratedImage,
};

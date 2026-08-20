/**
 * Deterministic sharp/SVG text overlays for Visual Production printable pages.
 * Isolated from branding: never draws littlelearnershubbyleah.com.
 */
"use strict";

let sharpLib = null;
try {
  sharpLib = require("sharp");
} catch {
  sharpLib = null;
}

const communityHelpersOverlay = require("./visual-production-community-helpers-overlay.js");

const COVER_TITLE = "Colors All Around Us";
const COVER_SUBTITLE = "Infant Visual & Keepsake Pack";
const TUMMY_TIME_LABELS = Object.freeze(["RED", "YELLOW", "BLUE", "GREEN"]);
const FOOTPRINT_TITLE = "My Color Footprint";
const FOOTPRINT_NAME = "Name: __________";
const FOOTPRINT_DATE = "Date: __________";
const SONG_TITLE = "Rainbow Scarf Song";
const SONG_LYRICS = Object.freeze([
  "Red, red, red so bright",
  "Wave it slowly left and right",
  "Up it goes and down again",
  "Watch it dance and watch it bend",
]);
const TEACHER_PROMPTS_HEADING = "Teacher prompts:";
const TEACHER_PROMPTS = Object.freeze([
  "Do you see the scarf?",
  "Where did it go?",
  "You found it again.",
  "Are your eyes following it?",
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeXml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * @param {object} brief
 * @returns {string}
 */
function overlayKindForBrief(brief) {
  const source = brief && typeof brief === "object" ? brief : {};
  const title = String(source.pageTitle || "").trim();
  if (title === "Cover") return "cover";
  if (title === "Color Tummy-Time Cards") return "tummyTimeLabels";
  if (title === "Rainbow Scarf Song + Teacher Prompt Card") return "rainbowScarfSong";
  if (title === "My Color Footprint Keepsake") return "footprint";
  if (communityHelpersOverlay.hasCommunityHelpersOverlay(source)) return "communityHelpers";
  return "none";
}

/**
 * @param {string} text
 * @param {{ x: number, y: number, size: number, anchor?: string, weight?: string, fill?: string }} opts
 * @returns {string}
 */
function textNode(text, opts) {
  const anchor = opts.anchor || "middle";
  const weight = opts.weight || "700";
  const fill = opts.fill || "#1f2937";
  return `<text x="${opts.x}" y="${opts.y}" text-anchor="${anchor}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${opts.size}"
    font-weight="${weight}"
    fill="${fill}">${escapeXml(text)}</text>`;
}

/**
 * Build one overlay SVG. Never includes the website footer.
 * @param {number} width
 * @param {number} height
 * @param {object} brief
 * @returns {{ svg: Buffer, kind: string, layerCount: number, exactLines: string[] }}
 */
function buildPrintableOverlaySvg(width, height, brief) {
  const w = Number(width || 1024);
  const h = Number(height || 1536);
  const kind = overlayKindForBrief(brief);
  if (kind === "communityHelpers") {
    return communityHelpersOverlay.buildCommunityHelpersOverlaySvg(w, h, brief);
  }
  /** @type {string[]} */
  const nodes = [];
  /** @type {string[]} */
  const exactLines = [];

  if (kind === "cover") {
    exactLines.push(COVER_TITLE, COVER_SUBTITLE);
    nodes.push(textNode(COVER_TITLE, { x: w / 2, y: Math.round(h * 0.12), size: Math.round(w * 0.052) }));
    nodes.push(textNode(COVER_SUBTITLE, {
      x: w / 2,
      y: Math.round(h * 0.175),
      size: Math.round(w * 0.028),
      weight: "600",
    }));
  } else if (kind === "tummyTimeLabels") {
    const positions = [
      { x: w * 0.25, y: h * 0.46 },
      { x: w * 0.75, y: h * 0.46 },
      { x: w * 0.25, y: h * 0.88 },
      { x: w * 0.75, y: h * 0.88 },
    ];
    TUMMY_TIME_LABELS.forEach((label, index) => {
      exactLines.push(label);
      const pos = positions[index];
      const pillW = Math.round(w * 0.22);
      const pillH = Math.round(h * 0.045);
      nodes.push(`<rect x="${Math.round(pos.x - pillW / 2)}" y="${Math.round(pos.y - pillH * 0.72)}"
        width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="rgba(255,255,255,0.88)"/>`);
      nodes.push(textNode(label, { x: Math.round(pos.x), y: Math.round(pos.y), size: Math.round(w * 0.038) }));
    });
  } else if (kind === "rainbowScarfSong") {
    const panelX = Math.round(w * 0.08);
    const panelY = Math.round(h * 0.07);
    const panelW = Math.round(w * 0.84);
    const panelH = Math.round(h * 0.82);
    nodes.push(`<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="22" fill="rgba(255,255,255,0.94)"/>`);
    let y = Math.round(h * 0.14);
    const left = Math.round(w * 0.14);
    exactLines.push(SONG_TITLE);
    nodes.push(textNode(SONG_TITLE, {
      x: w / 2,
      y,
      size: Math.round(w * 0.042),
    }));
    y += Math.round(h * 0.07);
    SONG_LYRICS.forEach((line) => {
      exactLines.push(line);
      nodes.push(textNode(line, {
        x: left,
        y,
        size: Math.round(w * 0.028),
        anchor: "start",
        weight: "600",
      }));
      y += Math.round(h * 0.055);
    });
    y += Math.round(h * 0.04);
    exactLines.push(TEACHER_PROMPTS_HEADING);
    nodes.push(textNode(TEACHER_PROMPTS_HEADING, {
      x: left,
      y,
      size: Math.round(w * 0.03),
      anchor: "start",
    }));
    y += Math.round(h * 0.055);
    TEACHER_PROMPTS.forEach((line) => {
      exactLines.push(line);
      nodes.push(textNode(line, {
        x: left,
        y,
        size: Math.round(w * 0.028),
        anchor: "start",
        weight: "600",
      }));
      y += Math.round(h * 0.05);
    });
  } else if (kind === "footprint") {
    exactLines.push(FOOTPRINT_TITLE, FOOTPRINT_NAME, FOOTPRINT_DATE);
    nodes.push(textNode(FOOTPRINT_TITLE, { x: w / 2, y: Math.round(h * 0.1), size: Math.round(w * 0.045) }));
    nodes.push(textNode(FOOTPRINT_NAME, {
      x: w / 2,
      y: Math.round(h * 0.16),
      size: Math.round(w * 0.03),
      weight: "600",
    }));
    nodes.push(textNode(FOOTPRINT_DATE, {
      x: w / 2,
      y: Math.round(h * 0.205),
      size: Math.round(w * 0.03),
      weight: "600",
    }));
  }

  const svg = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${nodes.join("")}</svg>`);
  return { svg, kind, layerCount: kind === "none" ? 0 : 1, exactLines };
}

/**
 * @param {Buffer} pngBuffer
 * @param {object} [brief]
 * @returns {Promise<Buffer>}
 */
async function applyPrintableTextOverlay(pngBuffer, brief) {
  const kind = overlayKindForBrief(brief);
  if (kind === "none") return pngBuffer;
  if (!sharpLib) throw new Error("sharp is required to apply printable text overlays.");
  const image = sharpLib(pngBuffer);
  const meta = await image.metadata();
  const width = Number(meta.width || 1024);
  const height = Number(meta.height || 1536);
  const { svg } = buildPrintableOverlaySvg(width, height, brief);
  return image.composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

/**
 * Assemble US Letter portrait PDF pages from PNG buffers, exact order given.
 * @param {Buffer[]} pngBuffers
 * @returns {Promise<Buffer>}
 */
async function assembleUsLetterPortraitPdf(pngBuffers) {
  const { PDFDocument } = require("pdf-lib");
  const pages = Array.isArray(pngBuffers) ? pngBuffers : [];
  const doc = await PDFDocument.create();
  const letterW = 612;
  const letterH = 792;
  for (const png of pages) {
    if (!png || !png.length) throw new Error("Printable pack PDF is missing a page image.");
    const page = doc.addPage([letterW, letterH]);
    const image = await doc.embedPng(png);
    const scale = Math.min(letterW / image.width, letterH / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    page.drawImage(image, {
      x: (letterW - drawW) / 2,
      y: (letterH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

module.exports = {
  COVER_TITLE,
  COVER_SUBTITLE,
  TUMMY_TIME_LABELS,
  FOOTPRINT_TITLE,
  FOOTPRINT_NAME,
  FOOTPRINT_DATE,
  SONG_TITLE,
  SONG_LYRICS,
  TEACHER_PROMPTS_HEADING,
  TEACHER_PROMPTS,
  overlayKindForBrief,
  buildPrintableOverlaySvg,
  applyPrintableTextOverlay,
  assembleUsLetterPortraitPdf,
};

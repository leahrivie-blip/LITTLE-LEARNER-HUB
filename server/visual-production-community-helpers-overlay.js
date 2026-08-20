/**
 * Deterministic sharp/SVG text overlays for Community Helpers printable pages.
 * Isolated from Colors overlays and from branding.
 * Never draws littlelearnershubbyleah.com.
 */
"use strict";

const MURAL_ACTIVITY_NAME = "When I Grow Up Collaborative Mural";
const MURAL_HEADING = "When I Grow Up";
const PACK_TITLE = "Community Helpers: Our Busy Little Town Printable Pack";

const SITUATION_LABELS = Object.freeze([
  "Someone feels sick",
  "A pet needs a checkup",
  "We see smoke",
  "We want to send a letter",
  "A pipe is leaking",
  "A car needs fixing",
  "Someone is cooking",
  "Recycling needs collecting",
]);

const HELPER_NAMES = Object.freeze([
  "Firefighter",
  "Doctor",
  "Veterinarian",
  "Mail Carrier",
  "Construction Worker",
  "Cook / Chef",
  "Recycling Worker",
  "Mechanic",
  "Plumber",
]);

const TOOL_NAMES = Object.freeze([
  "hose",
  "stethoscope",
  "pet carrier",
  "mailbag",
  "hard hat",
  "spatula",
  "recycling bin",
  "wrench",
  "pipe wrench",
]);

const BADGE_NAMES = Object.freeze([
  "Firefighter",
  "Doctor",
  "Veterinarian",
  "Mail Carrier",
  "Builder",
  "Cook / Chef",
  "Recycling Helper",
  "Mechanic",
  "Plumber",
]);

const MAP_BUILDING_NAMES = Object.freeze([
  "Fire Station",
  "Doctor / Clinic",
  "Post Office",
  "Restaurant / Café",
  "Veterinarian",
  "Construction Site",
  "Recycling Center",
  "School",
  "Mechanic / Garage",
]);

const BLOCK_BUILDING_NAMES = Object.freeze([
  "Fire Station",
  "Post Office",
  "Vet Clinic",
  "Doctor / Clinic",
  "Restaurant / Café",
  "Construction Company",
  "Recycling Center",
  "Mechanic Garage",
  "School",
]);

const CAFE_FOODS = Object.freeze([
  "sandwich",
  "apple",
  "banana",
  "pizza slice",
  "milk",
  "water",
]);

const RECYCLING_CATEGORIES = Object.freeze(["Paper", "Plastic", "Metal", "Cardboard"]);
const RECYCLING_ITEMS = Object.freeze([
  "newspaper",
  "paper sheet",
  "water bottle",
  "plastic container",
  "clean can",
  "small box",
  "cereal box",
]);

const CONVERSATION_PROMPTS = Object.freeze([
  "Who could help?",
  "What tool might they use?",
  "Where do they work?",
  "How do they help our community?",
  "Who works together?",
]);

const PORTRAIT_TITLE = "When I Grow Up...";
const PORTRAIT_WANT = "I want to be a __________.";
const PORTRAIT_BECAUSE = "Because __________.";
const ORDER_TITLE = "My Order";
const NAME_LINE = "Name: __________";
const TO_LINE = "To: __________";

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
 * @param {number} count
 * @returns {{ cols: number, rows: number, rowCounts: number[] }}
 */
function gridForCount(count) {
  if (count <= 1) return { cols: 1, rows: 1, rowCounts: [1] };
  if (count === 2) return { cols: 1, rows: 2, rowCounts: [1, 1] };
  if (count === 3) return { cols: 1, rows: 3, rowCounts: [1, 1, 1] };
  if (count === 4) return { cols: 2, rows: 2, rowCounts: [2, 2] };
  if (count === 5) return { cols: 3, rows: 2, rowCounts: [3, 2] };
  if (count === 6) return { cols: 3, rows: 2, rowCounts: [3, 3] };
  if (count === 7) return { cols: 4, rows: 2, rowCounts: [4, 3] };
  return { cols: 4, rows: 2, rowCounts: [4, 4] };
}

/**
 * @param {number} w
 * @param {number} h
 * @param {number} count
 * @param {number[]} [rowCountsOverride]
 * @returns {{ x: number, y: number, width: number, height: number }[]}
 */
function cardRects(w, h, count, rowCountsOverride) {
  const top = Math.round(h * 0.09);
  const bottom = Math.round(h * 0.935);
  const left = Math.round(w * 0.04);
  const right = Math.round(w * 0.96);
  const gapX = Math.round(w * 0.018);
  const gapY = Math.round(h * 0.016);
  const areaW = right - left;
  const areaH = bottom - top;
  const layout = Array.isArray(rowCountsOverride) && rowCountsOverride.length
    ? { rows: rowCountsOverride.length, rowCounts: rowCountsOverride }
    : gridForCount(count);
  const { rows, rowCounts } = layout;
  const rowH = Math.floor((areaH - gapY * (rows - 1)) / rows);
  /** @type {{ x: number, y: number, width: number, height: number }[]} */
  const rects = [];
  for (let row = 0; row < rows; row += 1) {
    const n = rowCounts[row];
    const cellW = Math.floor((areaW - gapX * (n - 1)) / n);
    const rowWidth = n * cellW + (n - 1) * gapX;
    const rowLeft = left + Math.round((areaW - rowWidth) / 2);
    const y = top + row * (rowH + gapY);
    for (let col = 0; col < n; col += 1) {
      rects.push({
        x: rowLeft + col * (cellW + gapX),
        y,
        width: cellW,
        height: rowH,
      });
    }
  }
  return rects;
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @returns {string}
 */
function cutRect(rect) {
  return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"
    fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="10 7" rx="10"/>`;
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {string} label
 * @param {number} fontSize
 * @returns {{ nodes: string[], exactLines: string[] }}
 */
function labelOnCard(rect, label, fontSize) {
  const pillH = Math.round(Math.max(28, fontSize * 1.7));
  const pillW = Math.min(rect.width - 16, Math.max(120, Math.round(label.length * fontSize * 0.62 + 28)));
  const cx = rect.x + Math.round(rect.width / 2);
  const py = rect.y + rect.height - pillH - 10;
  const ty = py + Math.round(pillH * 0.7);
  return {
    nodes: [
      `<rect x="${cx - Math.round(pillW / 2)}" y="${py}" width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="rgba(255,255,255,0.92)"/>`,
      textNode(label, { x: cx, y: ty, size: fontSize }),
    ],
    exactLines: [label],
  };
}

/**
 * @param {number} w
 * @param {number} h
 * @param {string} title
 * @param {string[]} labels
 * @param {{ cut?: boolean, fontScale?: number }} [options]
 * @returns {{ nodes: string[], exactLines: string[] }}
 */
function titledCardPage(w, h, title, labels, options = {}) {
  const cut = options.cut !== false;
  const fontScale = options.fontScale || 1;
  const nodes = [
    textNode(title, { x: Math.round(w / 2), y: Math.round(h * 0.055), size: Math.round(w * 0.036 * fontScale) }),
  ];
  const exactLines = [title];
  const rects = cardRects(w, h, labels.length, options.rowCounts);
  const fontSize = Math.round(w * (labels.length >= 5 ? 0.024 : labels.length >= 4 ? 0.028 : 0.032) * fontScale);
  labels.forEach((label, index) => {
    const rect = rects[index];
    if (!rect) return;
    if (cut) nodes.push(cutRect(rect));
    const labeled = labelOnCard(rect, label, fontSize);
    nodes.push(...labeled.nodes);
    exactLines.push(...labeled.exactLines);
  });
  return { nodes, exactLines };
}

/**
 * @param {number} w
 * @param {number} h
 * @returns {{ nodes: string[], exactLines: string[] }}
 */
function portraitPage(w, h) {
  const nodes = [
    textNode(PORTRAIT_TITLE, {
      x: Math.round(w / 2),
      y: Math.round(h * 0.08),
      size: Math.round(w * 0.048),
    }),
    `<rect x="${Math.round(w * 0.08)}" y="${Math.round(h * 0.78)}" width="${Math.round(w * 0.84)}" height="${Math.round(h * 0.14)}" rx="16" fill="rgba(255,255,255,0.94)"/>`,
    textNode(PORTRAIT_WANT, {
      x: Math.round(w / 2),
      y: Math.round(h * 0.845),
      size: Math.round(w * 0.032),
      weight: "600",
    }),
    textNode(PORTRAIT_BECAUSE, {
      x: Math.round(w / 2),
      y: Math.round(h * 0.895),
      size: Math.round(w * 0.032),
      weight: "600",
    }),
  ];
  return { nodes, exactLines: [PORTRAIT_TITLE, PORTRAIT_WANT, PORTRAIT_BECAUSE] };
}

/**
 * @param {number} w
 * @param {number} h
 * @returns {{ nodes: string[], exactLines: string[] }}
 */
function cafeMenuPage(w, h) {
  const title = "Little Community Café";
  const built = titledCardPage(w, h, title, CAFE_FOODS.slice(), { cut: false });
  built.nodes.splice(1, 0, textNode("Picture Menu", {
    x: Math.round(w / 2),
    y: Math.round(h * 0.078),
    size: Math.round(w * 0.026),
    weight: "600",
  }));
  built.exactLines.splice(1, 0, "Picture Menu");
  return built;
}

/**
 * @param {number} w
 * @param {number} h
 * @returns {{ nodes: string[], exactLines: string[] }}
 */
function cafeOrderPage(w, h) {
  const title = "Café Order Cards";
  const nodes = [
    textNode(title, { x: Math.round(w / 2), y: Math.round(h * 0.05), size: Math.round(w * 0.034) }),
  ];
  const exactLines = [title];
  const cards = cardRects(w, h, 2);
  cards.forEach((card) => {
    nodes.push(cutRect(card));
    nodes.push(textNode(ORDER_TITLE, {
      x: card.x + Math.round(card.width / 2),
      y: card.y + Math.round(card.height * 0.1),
      size: Math.round(w * 0.038),
    }));
    exactLines.push(ORDER_TITLE);
    const innerTop = card.y + Math.round(card.height * 0.16);
    const innerH = card.height - Math.round(card.height * 0.22);
    const cellW = Math.floor((card.width - 24) / 3);
    const cellH = Math.floor(innerH / 2);
    CAFE_FOODS.forEach((food, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const cx = card.x + 12 + col * cellW + Math.round(cellW / 2);
      const cy = innerTop + row * cellH + cellH - 18;
      nodes.push(textNode(food, {
        x: cx,
        y: cy,
        size: Math.round(w * 0.022),
        weight: "600",
      }));
      exactLines.push(food);
    });
  });
  return { nodes, exactLines };
}

/**
 * @param {number} w
 * @param {number} h
 * @param {string} title
 * @param {string[]} labels
 * @returns {{ nodes: string[], exactLines: string[] }}
 */
function mailMixPage(w, h, title, labels) {
  return titledCardPage(w, h, title, labels, { cut: true, rowCounts: [2, 2, 2] });
}

/**
 * @param {number} w
 * @param {number} h
 * @returns {{ nodes: string[], exactLines: string[] }}
 */
function muralPhotoOverlay(w, h) {
  const nodes = [
    `<rect x="${Math.round(w * 0.18)}" y="${Math.round(h * 0.045)}" width="${Math.round(w * 0.64)}" height="${Math.round(h * 0.09)}" rx="8" fill="rgba(255,255,255,0.88)"/>`,
    textNode(MURAL_HEADING, {
      x: Math.round(w / 2),
      y: Math.round(h * 0.11),
      size: Math.round(w * 0.038),
    }),
  ];
  return { nodes, exactLines: [MURAL_HEADING] };
}

/** @type {Record<string, function(number, number): { nodes: string[], exactLines: string[] }>} */
const PAGE_BUILDERS = {
  "Who Should We Call? Situation Cards (1 of 4)": (w, h) => titledCardPage(w, h, "Who Should We Call?", SITUATION_LABELS.slice(0, 2)),
  "Who Should We Call? Situation Cards (2 of 4)": (w, h) => titledCardPage(w, h, "Who Should We Call?", SITUATION_LABELS.slice(2, 4)),
  "Who Should We Call? Situation Cards (3 of 4)": (w, h) => titledCardPage(w, h, "Who Should We Call?", SITUATION_LABELS.slice(4, 6)),
  "Who Should We Call? Situation Cards (4 of 4)": (w, h) => titledCardPage(w, h, "Who Should We Call?", SITUATION_LABELS.slice(6, 8)),
  "Community Helper Matching Cards (1 of 2)": (w, h) => titledCardPage(w, h, "Community Helper Cards", HELPER_NAMES.slice(0, 4)),
  "Community Helper Matching Cards (2 of 2)": (w, h) => titledCardPage(w, h, "Community Helper Cards", HELPER_NAMES.slice(4)),
  "Helper Tool Matching Cards (1 of 2)": (w, h) => titledCardPage(w, h, "Helper Tool Cards", TOOL_NAMES.slice(0, 4)),
  "Helper Tool Matching Cards (2 of 2)": (w, h) => titledCardPage(w, h, "Helper Tool Cards", TOOL_NAMES.slice(4)),
  "Little Town Community Play Map": (w, h) => ({
    nodes: [textNode("Little Town", { x: Math.round(w / 2), y: Math.round(h * 0.055), size: Math.round(w * 0.04) })],
    exactLines: ["Little Town"],
  }),
  "Little Town Building Pieces (1 of 2)": (w, h) => titledCardPage(w, h, "Building Pieces", MAP_BUILDING_NAMES.slice(0, 5)),
  "Little Town Building Pieces (2 of 2)": (w, h) => titledCardPage(w, h, "Building Pieces", MAP_BUILDING_NAMES.slice(5)),
  "Community Helper Pretend-Play Badges (1 of 2)": (w, h) => titledCardPage(w, h, "Pretend-Play Badges", BADGE_NAMES.slice(0, 5)),
  "Community Helper Pretend-Play Badges (2 of 2)": (w, h) => titledCardPage(w, h, "Pretend-Play Badges", BADGE_NAMES.slice(5)),
  "Mail Name Cards and Mailbox Signs": (w, h) => mailMixPage(w, h, "Mail Name Cards", [
    NAME_LINE, NAME_LINE, NAME_LINE, NAME_LINE, "Mailbox", "Classroom Mail",
  ]),
  "Envelope Fronts and Sorting Cards": (w, h) => mailMixPage(w, h, "Envelopes and Sorting", [
    TO_LINE, TO_LINE, TO_LINE, TO_LINE, "Cubbies", "Mailbag",
  ]),
  "Little Community Café Picture Menu": cafeMenuPage,
  "Café Order Cards": cafeOrderPage,
  "Recycling Sorting Mats": (w, h) => titledCardPage(w, h, "Recycling Sorting Mats", RECYCLING_CATEGORIES.slice()),
  "Recycling Picture Cards": (w, h) => titledCardPage(w, h, "Recycling Picture Cards", RECYCLING_ITEMS.slice()),
  "When I Grow Up Portrait": portraitPage,
  "Build Our Town Building Cards (1 of 2)": (w, h) => titledCardPage(w, h, "Build Our Town", BLOCK_BUILDING_NAMES.slice(0, 5)),
  "Build Our Town Building Cards (2 of 2)": (w, h) => titledCardPage(w, h, "Build Our Town", BLOCK_BUILDING_NAMES.slice(5)),
  "Community Helper Conversation Cards (1 of 2)": (w, h) => titledCardPage(w, h, "Conversation Cards", CONVERSATION_PROMPTS.slice(0, 3)),
  "Community Helper Conversation Cards (2 of 2)": (w, h) => titledCardPage(w, h, "Conversation Cards", CONVERSATION_PROMPTS.slice(3)),
};

const PAGE_TITLES = Object.freeze(Object.keys(PAGE_BUILDERS));

/**
 * @param {object} brief
 * @returns {boolean}
 */
function hasCommunityHelpersOverlay(brief) {
  const source = brief && typeof brief === "object" ? brief : {};
  const title = String(source.pageTitle || "").trim();
  if (PAGE_BUILDERS[title]) return true;
  return String(source.activityName || "").trim() === MURAL_ACTIVITY_NAME
    && String(source.assetType || "") === "ACTIVITY_IMAGE";
}

/**
 * Exact overlay copy for a brief, used by the plan as textOverlayRequirements.
 * @param {string} pageTitle
 * @returns {string[]}
 */
function exactLinesForPageTitle(pageTitle) {
  const builder = PAGE_BUILDERS[String(pageTitle || "").trim()];
  if (!builder) return [];
  return builder(1024, 1536).exactLines.slice();
}

/**
 * @param {number} width
 * @param {number} height
 * @param {object} brief
 * @returns {{ svg: Buffer, kind: string, layerCount: number, exactLines: string[] }}
 */
function buildCommunityHelpersOverlaySvg(width, height, brief) {
  const w = Number(width || 1024);
  const h = Number(height || 1536);
  const source = brief && typeof brief === "object" ? brief : {};
  const title = String(source.pageTitle || "").trim();
  let built;
  if (PAGE_BUILDERS[title]) {
    built = PAGE_BUILDERS[title](w, h);
  } else if (
    String(source.activityName || "").trim() === MURAL_ACTIVITY_NAME
    && String(source.assetType || "") === "ACTIVITY_IMAGE"
  ) {
    built = muralPhotoOverlay(w, h);
  } else {
    built = { nodes: [], exactLines: [] };
  }
  const svg = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${built.nodes.join("")}</svg>`);
  return {
    svg,
    kind: "communityHelpers",
    layerCount: built.nodes.length ? 1 : 0,
    exactLines: built.exactLines,
  };
}

module.exports = {
  PACK_TITLE,
  MURAL_ACTIVITY_NAME,
  MURAL_HEADING,
  PAGE_TITLES,
  SITUATION_LABELS,
  HELPER_NAMES,
  TOOL_NAMES,
  BADGE_NAMES,
  MAP_BUILDING_NAMES,
  BLOCK_BUILDING_NAMES,
  CAFE_FOODS,
  RECYCLING_CATEGORIES,
  RECYCLING_ITEMS,
  CONVERSATION_PROMPTS,
  PORTRAIT_TITLE,
  PORTRAIT_WANT,
  PORTRAIT_BECAUSE,
  ORDER_TITLE,
  NAME_LINE,
  TO_LINE,
  hasCommunityHelpersOverlay,
  exactLinesForPageTitle,
  buildCommunityHelpersOverlaySvg,
};

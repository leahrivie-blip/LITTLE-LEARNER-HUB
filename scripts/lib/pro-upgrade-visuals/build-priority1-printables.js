/**
 * Priority 1 Pro upgrade draft printables (pdf-lib + sharp).
 * status: draft only when uploaded. Includes littlelearnershubbyleah.com branding.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "../../..");
const OUT_DIR = path.join(ROOT, "curriculum-drafts/pro-upgrade/printables");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function svgToPng(svg, width, height) {
  return sharp(Buffer.from(svg)).resize(width, height, { fit: "fill" }).png().toBuffer();
}

function cardSvg({ bg, accent, title, subtitle, iconPaths = "" }) {
  const t = String(title || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const s = String(subtitle || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1280" viewBox="0 0 1024 1280">
  <rect width="100%" height="100%" fill="${bg}"/>
  <rect x="48" y="48" width="928" height="1184" rx="36" fill="#fffef9" stroke="${accent}" stroke-width="10"/>
  <rect x="48" y="48" width="928" height="160" rx="36" fill="${accent}"/>
  <rect x="48" y="140" width="928" height="68" fill="${accent}"/>
  <text x="512" y="145" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" fill="#fffef9">${t}</text>
  <g transform="translate(0,40)">${iconPaths}</g>
  <text x="512" y="1080" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="#334155">${s}</text>
  <text x="512" y="1160" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#64748b">littlelearnershubbyleah.com</text>
</svg>`;
}

function signSvg({ bg, accent, label }) {
  const t = String(label || "").replace(/&/g, "&amp;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
  <rect width="100%" height="100%" fill="${bg}"/>
  <rect x="40" y="40" width="1320" height="820" rx="28" fill="#fffef9" stroke="${accent}" stroke-width="14"/>
  <text x="700" y="480" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="120" font-weight="700" fill="${accent}">${t}</text>
  <text x="700" y="780" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#64748b">littlelearnershubbyleah.com</text>
</svg>`;
}

async function addPortraitCardPage(pdf, pngBuffer, header, tip) {
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(pngBuffer);
  const maxW = 500;
  const maxH = 620;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawText("Little Learner Hub — DRAFT Printable (Not Published)", {
    x: 40, y: 760, size: 11, font: fontReg, color: rgb(0.4, 0.35, 0.45),
  });
  page.drawText(header, { x: 40, y: 736, size: 14, font, color: rgb(0.15, 0.15, 0.2) });
  page.drawImage(image, { x: (612 - w) / 2, y: 90, width: w, height: h });
  if (tip) {
    page.drawText(tip, { x: 40, y: 58, size: 10, font: fontReg, color: rgb(0.35, 0.35, 0.4) });
  }
  page.drawText("littlelearnershubbyleah.com · Cut apart · Laminate if desired · Owner review draft", {
    x: 40, y: 36, size: 9, font: fontReg, color: rgb(0.45, 0.45, 0.5),
  });
}

async function addLandscapeSignPage(pdf, pngBuffer, header) {
  const page = pdf.addPage([792, 612]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(pngBuffer);
  const maxW = 700;
  const maxH = 460;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawText("Little Learner Hub — DRAFT Zone Sign (Not Published)", {
    x: 36, y: 572, size: 12, font: fontReg, color: rgb(0.4, 0.35, 0.45),
  });
  page.drawText(header, { x: 36, y: 548, size: 16, font, color: rgb(0.15, 0.15, 0.2) });
  page.drawImage(image, { x: (792 - w) / 2, y: 70, width: w, height: h });
  page.drawText("littlelearnershubbyleah.com · Post at toddler eye level · Draft for owner review", {
    x: 36, y: 36, size: 10, font: fontReg, color: rgb(0.45, 0.45, 0.5),
  });
}

async function buildCardsPdf(outPath, cards, header, tip) {
  const pdf = await PDFDocument.create();
  for (const card of cards) {
    const png = await svgToPng(cardSvg(card), 1024, 1280);
    await addPortraitCardPage(pdf, png, header, tip);
  }
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, await pdf.save());
  return outPath;
}

async function buildSignsPdf(outPath, signs, header) {
  const pdf = await PDFDocument.create();
  for (const sign of signs) {
    const png = await svgToPng(signSvg(sign), 1400, 900);
    await addLandscapeSignPage(pdf, png, header);
  }
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, await pdf.save());
  return outPath;
}

const paw = `<circle cx="512" cy="520" r="70" fill="#f59e0b"/><circle cx="420" cy="430" r="34" fill="#f59e0b"/><circle cx="500" cy="400" r="34" fill="#f59e0b"/><circle cx="580" cy="430" r="34" fill="#f59e0b"/><circle cx="620" cy="510" r="30" fill="#f59e0b"/>`;
const leaf = `<ellipse cx="512" cy="520" rx="90" ry="140" fill="#22c55e"/><rect x="500" y="640" width="24" height="80" fill="#15803d"/>`;
const star = `<polygon points="512,380 560,500 690,500 585,575 625,700 512,620 399,700 439,575 334,500 464,500" fill="#fbbf24"/>`;
const apple = `<circle cx="512" cy="540" r="120" fill="#ef4444"/><ellipse cx="512" cy="430" rx="18" ry="40" fill="#15803d"/><path d="M512 450 Q560 420 580 460" fill="none" stroke="#15803d" stroke-width="16"/>`;

const MANIFEST = {
  "cur-lp-toddler-pet-vet-clinic": [
    {
      key: "clinic-zone-signs",
      title: "Clinic Zone Signs (Draft)",
      build: async (dir) => buildSignsPdf(
        path.join(dir, "clinic-zone-signs.pdf"),
        [
          { bg: "#fff7ed", accent: "#ea580c", label: "WAITING" },
          { bg: "#ecfeff", accent: "#0891b2", label: "CHECK-IN" },
          { bg: "#f0fdf4", accent: "#16a34a", label: "EXAM" },
          { bg: "#fdf4ff", accent: "#a855f7", label: "GROOMING" },
        ],
        "Pet Vet Clinic — Zone Signs",
      ),
    },
    {
      key: "pet-care-choice-cards",
      title: "Pet Care Choice Cards (Draft)",
      build: async (dir) => buildCardsPdf(
        path.join(dir, "pet-care-choice-cards.pdf"),
        [
          { bg: "#fff7ed", accent: "#ea580c", title: "WASH", subtitle: "Gently wash the pet", iconPaths: paw },
          { bg: "#eff6ff", accent: "#2563eb", title: "BRUSH", subtitle: "Brush soft fur", iconPaths: paw },
          { bg: "#f0fdf4", accent: "#16a34a", title: "FEED", subtitle: "Offer pretend food", iconPaths: paw },
          { bg: "#fdf2f8", accent: "#db2777", title: "CUDDLE", subtitle: "Soft hugs and rest", iconPaths: paw },
          { bg: "#f8fafc", accent: "#475569", title: "REST", subtitle: "Quiet nap time", iconPaths: paw },
        ],
        "Pet Vet Clinic — Care Choice Cards",
        "Toddler points to a card · no writing · laminate optional",
      ),
    },
  ],
  "cur-lp-toddler-zoo-adventures": [
    {
      key: "habitat-zone-signs",
      title: "Habitat Zone Signs (Draft)",
      build: async (dir) => buildSignsPdf(
        path.join(dir, "habitat-zone-signs.pdf"),
        [
          { bg: "#ecfdf5", accent: "#059669", label: "JUNGLE" },
          { bg: "#fffbeb", accent: "#d97706", label: "SAVANNA" },
          { bg: "#eff6ff", accent: "#2563eb", label: "WATER" },
          { bg: "#f5f3ff", accent: "#7c3aed", label: "ZOO GATE" },
        ],
        "Zoo Adventures — Habitat Zone Signs",
      ),
    },
    {
      key: "animal-choice-cards",
      title: "Animal Choice Cards (Draft)",
      build: async (dir) => buildCardsPdf(
        path.join(dir, "animal-choice-cards.pdf"),
        [
          { bg: "#fff7ed", accent: "#ea580c", title: "LION", subtitle: "Roar and stretch", iconPaths: star },
          { bg: "#ecfeff", accent: "#0891b2", title: "FISH", subtitle: "Swim and splash", iconPaths: star },
          { bg: "#f0fdf4", accent: "#16a34a", title: "MONKEY", subtitle: "Climb and swing", iconPaths: star },
          { bg: "#fefce8", accent: "#ca8a04", title: "GIRAFFE", subtitle: "Reach up high", iconPaths: star },
          { bg: "#f8fafc", accent: "#475569", title: "ELEPHANT", subtitle: "Stomp and trumpet", iconPaths: star },
        ],
        "Zoo Adventures — Animal Choice Cards",
        "Point / choose / move · not a naming quiz",
      ),
    },
  ],
  "cur-lp-toddler-camping-under-the-stars": [
    {
      key: "trail-signs",
      title: "Trail Signs (Draft)",
      build: async (dir) => buildSignsPdf(
        path.join(dir, "trail-signs.pdf"),
        [
          { bg: "#ecfdf5", accent: "#047857", label: "TRAIL START" },
          { bg: "#fff7ed", accent: "#c2410c", label: "CAMP SITE" },
          { bg: "#eff6ff", accent: "#1d4ed8", label: "LOOKOUT" },
          { bg: "#0f172a", accent: "#fbbf24", label: "STARS" },
        ],
        "Camping Under the Stars — Trail Signs",
      ),
    },
    {
      key: "day-night-cards",
      title: "Day and Night Cards (Draft)",
      build: async (dir) => buildCardsPdf(
        path.join(dir, "day-night-cards.pdf"),
        [
          { bg: "#fffbeb", accent: "#f59e0b", title: "DAY", subtitle: "Sun is shining", iconPaths: star },
          { bg: "#0f172a", accent: "#93c5fd", title: "NIGHT", subtitle: "Stars are out", iconPaths: star },
          { bg: "#ecfeff", accent: "#0284c7", title: "FLASHLIGHT", subtitle: "Battery light only", iconPaths: star },
          { bg: "#f0fdf4", accent: "#15803d", title: "TENT", subtitle: "Quiet inside", iconPaths: leaf },
        ],
        "Camping — Day / Night Cards",
        "Use for circle talk · battery lights only",
      ),
    },
  ],
  "cur-lp-toddler-pirate-adventure": [
    {
      key: "ship-island-signs",
      title: "Ship / Island Zone Signs (Draft)",
      build: async (dir) => buildSignsPdf(
        path.join(dir, "ship-island-signs.pdf"),
        [
          { bg: "#ecfeff", accent: "#0369a1", label: "SHIP" },
          { bg: "#fff7ed", accent: "#c2410c", label: "ISLAND" },
          { bg: "#fefce8", accent: "#a16207", label: "TREASURE" },
          { bg: "#f0fdf4", accent: "#15803d", label: "MAP TABLE" },
        ],
        "Pirate Adventure — Zone Signs",
      ),
    },
    {
      key: "treasure-map-template",
      title: "Photo Treasure Map Template (Draft)",
      build: async (dir) => {
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([612, 792]);
        const font = await pdf.embedFont(StandardFonts.HelveticaBold);
        const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
        page.drawText("Treasure Map Template — DRAFT", { x: 40, y: 740, size: 18, font, color: rgb(0.2, 0.15, 0.1) });
        page.drawText("Teacher photo tip: snap a room corner, print, and draw an X with a crayon.", {
          x: 40, y: 712, size: 11, font: fontReg, color: rgb(0.35, 0.3, 0.25),
        });
        page.drawRectangle({ x: 48, y: 160, width: 516, height: 520, borderColor: rgb(0.72, 0.55, 0.3), borderWidth: 3 });
        page.drawText("Paste or print room photo here", { x: 170, y: 420, size: 14, font: fontReg, color: rgb(0.55, 0.45, 0.35) });
        page.drawText("X marks a soft toy treasure (no digging outdoors required)", {
          x: 48, y: 120, size: 11, font: fontReg, color: rgb(0.35, 0.3, 0.25),
        });
        page.drawText("littlelearnershubbyleah.com · Draft · Not published", {
          x: 48, y: 48, size: 11, font: fontReg, color: rgb(0.45, 0.4, 0.4),
        });
        const out = path.join(dir, "treasure-map-template.pdf");
        ensureDir(dir);
        fs.writeFileSync(out, await pdf.save());
        return out;
      },
    },
  ],
  "cur-lp-toddler-superhero-training-camp": [
    {
      key: "helper-zone-signs",
      title: "Helper Zone Signs (Draft)",
      build: async (dir) => buildSignsPdf(
        path.join(dir, "helper-zone-signs.pdf"),
        [
          { bg: "#eff6ff", accent: "#2563eb", label: "TRAINING" },
          { bg: "#f0fdf4", accent: "#16a34a", label: "HELPING" },
          { bg: "#fdf2f8", accent: "#db2777", label: "KINDNESS" },
          { bg: "#fff7ed", accent: "#ea580c", label: "REST" },
        ],
        "Superhero Training Camp — Helper Zones",
      ),
    },
    {
      key: "kindness-mission-cards",
      title: "Kindness Mission Picture Cards (Draft)",
      build: async (dir) => buildCardsPdf(
        path.join(dir, "kindness-mission-cards.pdf"),
        [
          { bg: "#fef2f2", accent: "#dc2626", title: "HELP", subtitle: "Carry a toy for a friend", iconPaths: star },
          { bg: "#eff6ff", accent: "#2563eb", title: "SHARE", subtitle: "Offer a turn", iconPaths: star },
          { bg: "#f0fdf4", accent: "#16a34a", title: "CLEAN", subtitle: "Put one toy away", iconPaths: star },
          { bg: "#fdf4ff", accent: "#a855f7", title: "CHEER", subtitle: "Clap for a friend", iconPaths: star },
          { bg: "#fffbeb", accent: "#d97706", title: "GENTLE", subtitle: "Soft hands", iconPaths: star },
        ],
        "Superhero — Kindness Mission Cards",
        "Picture missions only · no worksheets · kindness powers",
      ),
    },
  ],
  "cur-lp-toddler-apples-in-the-kitchen": [
    {
      key: "kitchen-zone-signs",
      title: "Kitchen Zone Signs (Draft)",
      build: async (dir) => buildSignsPdf(
        path.join(dir, "kitchen-zone-signs.pdf"),
        [
          { bg: "#ecfeff", accent: "#0284c7", label: "WASH" },
          { bg: "#fff7ed", accent: "#ea580c", label: "MIX" },
          { bg: "#f0fdf4", accent: "#16a34a", label: "SERVE" },
        ],
        "Apples in the Kitchen — Zone Signs",
      ),
    },
    {
      key: "picture-recipe-cards",
      title: "Picture Recipe Cards (Draft)",
      build: async (dir) => buildCardsPdf(
        path.join(dir, "picture-recipe-cards.pdf"),
        [
          { bg: "#fff7ed", accent: "#ea580c", title: "1 · WASH", subtitle: "Wash hands together", iconPaths: apple },
          { bg: "#fef3c7", accent: "#d97706", title: "2 · MASH", subtitle: "Mash soft apple", iconPaths: apple },
          { bg: "#f0fdf4", accent: "#16a34a", title: "3 · STIR", subtitle: "Stir round and round", iconPaths: apple },
          { bg: "#eff6ff", accent: "#2563eb", title: "4 · TASTE?", subtitle: "Optional tiny taste", iconPaths: apple },
        ],
        "Apples in the Kitchen — Picture Recipe",
        "2–4 picture steps · no knives · tasting optional",
      ),
    },
    {
      key: "cafe-menu-cards",
      title: "Café Menu Picture Cards (Draft)",
      build: async (dir) => buildCardsPdf(
        path.join(dir, "cafe-menu-cards.pdf"),
        [
          { bg: "#fff7ed", accent: "#ea580c", title: "APPLESAUCE", subtitle: "Point to choose", iconPaths: apple },
          { bg: "#fefce8", accent: "#ca8a04", title: "JUICE", subtitle: "Pretend pour", iconPaths: apple },
          { bg: "#fdf2f8", accent: "#db2777", title: "PIE", subtitle: "Pretend bake", iconPaths: apple },
        ],
        "Apples in the Kitchen — Café Menu",
        "Dramatic play pointing cards",
      ),
    },
  ],
  "cur-lp-toddler-johnny-appleseed-apple-fun": [
    {
      key: "orchard-zone-signs",
      title: "Orchard Zone Signs (Draft)",
      build: async (dir) => buildSignsPdf(
        path.join(dir, "orchard-zone-signs.pdf"),
        [
          { bg: "#f0fdf4", accent: "#15803d", label: "PLANT" },
          { bg: "#ecfeff", accent: "#0284c7", label: "WATER" },
          { bg: "#fff7ed", accent: "#c2410c", label: "HARVEST" },
        ],
        "Johnny Appleseed — Orchard Zone Signs",
      ),
    },
    {
      key: "life-cycle-cards",
      title: "Oversized Apple Life-Cycle Cards (Draft)",
      build: async (dir) => buildCardsPdf(
        path.join(dir, "life-cycle-cards.pdf"),
        [
          { bg: "#fffbeb", accent: "#a16207", title: "SEED", subtitle: "Tiny beginning", iconPaths: apple },
          { bg: "#ecfdf5", accent: "#059669", title: "SPROUT", subtitle: "Peeking up", iconPaths: leaf },
          { bg: "#f0fdf4", accent: "#166534", title: "TREE", subtitle: "Growing tall", iconPaths: leaf },
          { bg: "#fef2f2", accent: "#dc2626", title: "APPLE", subtitle: "Ready to pick", iconPaths: apple },
        ],
        "Johnny Appleseed — Life-Cycle Cards",
        "Oversized look-and-talk · not a worksheet quiz",
      ),
    },
    {
      key: "seed-plant-water-cards",
      title: "Seed–Plant–Water Choice Cards (Draft)",
      build: async (dir) => buildCardsPdf(
        path.join(dir, "seed-plant-water-cards.pdf"),
        [
          { bg: "#fffbeb", accent: "#a16207", title: "SEED", subtitle: "Place the seed", iconPaths: apple },
          { bg: "#f0fdf4", accent: "#15803d", title: "PLANT", subtitle: "Cover with soil", iconPaths: leaf },
          { bg: "#ecfeff", accent: "#0284c7", title: "WATER", subtitle: "Tiny drip drip", iconPaths: leaf },
        ],
        "Johnny Appleseed — Planting Sequence Cards",
        "Visual supports for planting table",
      ),
    },
  ],
};

async function buildAll(lessonIds) {
  const ids = lessonIds && lessonIds.length ? lessonIds : Object.keys(MANIFEST);
  const results = [];
  for (const lessonId of ids) {
    const items = MANIFEST[lessonId] || [];
    const dir = path.join(OUT_DIR, lessonId.replace(/^cur-lp-/, ""));
    ensureDir(dir);
    for (const item of items) {
      const filePath = await item.build(dir);
      results.push({ lessonId, key: item.key, title: item.title, filePath });
      console.log("built", lessonId, item.key, filePath);
    }
  }
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ builtAt: new Date().toISOString(), results }, null, 2));
  return results;
}

module.exports = { buildAll, MANIFEST, OUT_DIR };

if (require.main === module) {
  buildAll(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

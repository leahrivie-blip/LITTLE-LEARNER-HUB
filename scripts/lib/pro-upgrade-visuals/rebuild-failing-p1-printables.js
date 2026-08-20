/**
 * Rebuild the 4 Priority 1 printables that failed the quality audit.
 * Uses Visual Production teaching-card / educational-illustration prompts + OpenAI images.
 * Writes local PDFs only — upload is a separate gated script.
 *
 * Env: OPENAI_API_KEY (required), OPENAI_IMAGE_MODEL (optional)
 * Does not publish, delete, or rewrite lesson content.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");
const teachingCard = require("../visual-production-teaching-card-prompt.js");
const humanAction = require("./human-action-card-visuals.js");
const { generateVisualProductionImage } = require("../../../server/visual-production-image.js");

const ROOT = path.join(__dirname, "../../..");
const OUT = path.join(ROOT, "curriculum-drafts/pro-upgrade/printables-quality-v3");

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function genImage(brief, apiKey, model) {
  const result = await generateVisualProductionImage({ apiKey, model, brief });
  return result.buffer;
}

async function withRetry(fn, label, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      console.log(JSON.stringify({ retry: label, i: i + 1, err: String(err.message || err).slice(0, 200) }));
      await sleep(2500 * (i + 1));
    }
  }
  throw last;
}

async function addPortraitPage(pdf, png, title, howToUse) {
  const page = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const img = await pdf.embedPng(png);
  page.drawText(title, { x: 36, y: 752, size: 14, font: bold, color: rgb(0.15, 0.15, 0.2) });
  if (howToUse) {
    const tip = howToUse.length > 95 ? `${howToUse.slice(0, 92)}…` : howToUse;
    page.drawText(tip, { x: 36, y: 734, size: 9, font: reg, color: rgb(0.35, 0.35, 0.4) });
  }
  const maxW = 540;
  const maxH = 680;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: (612 - w) / 2, y: 40, width: w, height: h });
  page.drawText("littlelearnershubbyleah.com", {
    x: 40,
    y: 22,
    size: 9,
    font: reg,
    color: rgb(0.45, 0.45, 0.5),
  });
}

async function savePdf(pages, outPath) {
  const pdf = await PDFDocument.create();
  for (const draw of pages) await draw(pdf);
  const bytes = await pdf.save();
  fs.writeFileSync(outPath, bytes);
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** Build a 2×N cut sheet from card image buffers (no bubble SVG people). */
async function cutSheetFromImages(cards, opts = {}) {
  const { sheetTitle = "Cut apart on dashed lines", cols = 2, cellW = 520, cellH = 640, gapX = 40, gapY = 40, top = 100 } = opts;
  const rows = Math.ceil(cards.length / cols);
  const width = gapX + cols * (cellW + gapX);
  const height = top + rows * (cellH + gapY) + 60;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect width="100%" height="100%" fill="#f1f5f9"/>`);
  parts.push(`<text x="${width / 2}" y="55" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#1e293b">${esc(sheetTitle)}</text>`);

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gapX + col * (cellW + gapX);
    const y = top + row * (cellH + gapY);
    const accent = c.accent || "#334155";
    const imgPath = c.imagePath;
    const png = await sharp(imgPath)
      .resize(Math.round(cellW - 80), Math.round(cellH - 220), { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    const b64 = png.toString("base64");
    parts.push(`
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="20" fill="#fffef8" stroke="${accent}" stroke-width="6" stroke-dasharray="14 10"/>
      <rect x="${x}" y="${y}" width="${cellW}" height="72" fill="${accent}"/>
      <text x="${x + cellW / 2}" y="${y + 48}" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#fff">${esc(c.title)}</text>
      <image href="data:image/png;base64,${b64}" x="${x + 40}" y="${y + 90}" width="${cellW - 80}" height="${cellH - 220}" preserveAspectRatio="xMidYMid slice"/>
      <text x="${x + cellW / 2}" y="${y + cellH - 70}" text-anchor="middle" font-family="Arial" font-size="26" fill="#334155">${esc(c.subtitle || "")}</text>
      <text x="${x + cellW / 2}" y="${y + cellH - 30}" text-anchor="middle" font-family="Arial" font-size="20" fill="#64748b">${esc(c.tip || "Talk · point · play")}</text>
    `);
  }
  parts.push(`<text x="${width / 2}" y="${height - 25}" text-anchor="middle" font-family="Arial" font-size="20" fill="#64748b">littlelearnershubbyleah.com</text>`);
  parts.push(`</svg>`);
  return sharp(Buffer.from(parts.join(""))).png().toBuffer();
}

async function generateTeachingCardPng(title, apiKey, model, packStyle) {
  const visual = humanAction.selectTeachingCardVisual({
    title,
    ageBand: "toddler_12_24",
    activityCategory: "Social-Emotional",
    setSize: 5,
    packStyle,
  });
  const brief = {
    visualStyle: visual.apiVisualStyle,
    generationPrompt: visual.generationPrompt,
    title,
    // Disable text overlay inside image — titles live on the cut-sheet chrome.
    printableTextOverlay: false,
    overlayText: "",
  };
  // Prefer dedicated teaching-card realistic builder when family is realistic
  if (visual.family === "TEACHING_CARD_REALISTIC") {
    const built = teachingCard.buildTeachingCardImagePrompt({
      title,
      ageBand: "toddler_12_24",
      setting: "daycare",
      visualStyle: "TEACHING_CARD_REALISTIC",
    });
    brief.visualStyle = "TEACHING_CARD_REALISTIC";
    brief.generationPrompt = built.generationPrompt;
  }
  return withRetry(() => genImage(brief, apiKey, model), title);
}

async function generateObjectCardPng(prompt, apiKey, model, style = "SOFT_EDUCATIONAL_ILLUSTRATION") {
  const brief = {
    visualStyle: style,
    generationPrompt: prompt,
    printableTextOverlay: false,
    overlayText: "",
  };
  return withRetry(() => genImage(brief, apiKey, model), prompt.slice(0, 40));
}

async function buildKindness(dir, apiKey, model) {
  ensureDir(dir);
  const packStyle = "TEACHING_CARD_REALISTIC";
  const specs = [
    { title: "Help Carry", subtitle: "Carry a toy for a friend", accent: "#dc2626" },
    { title: "Share a Turn", subtitle: "Offer a turn with a toy", accent: "#2563eb" },
    { title: "Clean Up", subtitle: "Put one toy away", accent: "#16a34a" },
    { title: "Cheer a Friend", subtitle: "Clap for a friend", accent: "#a855f7" },
    { title: "Gentle Hands", subtitle: "Soft hands with friends", accent: "#ea580c" },
  ];
  const cards = [];
  for (const s of specs) {
    const buf = await generateTeachingCardPng(s.title, apiKey, model, packStyle);
    const imagePath = path.join(dir, `kindness-${s.title.toLowerCase().replace(/\s+/g, "-")}.png`);
    fs.writeFileSync(imagePath, buf);
    cards.push({ ...s, imagePath, tip: "Point · act with props" });
    console.log(JSON.stringify({ built: "kindness", title: s.title }));
  }
  const sheet = await cutSheetFromImages(cards, {
    sheetTitle: "Kindness Mission Cards — cut apart (helping, not fighting)",
    cols: 2,
  });
  // 5 cards: add blank? leave 5 on sheet (3+2)
  const out = path.join(dir, "kindness-mission-cards.pdf");
  await savePdf(
    [async (pdf) => addPortraitPage(pdf, sheet, "Kindness Mission Cards", "Circle time + helping missions · child points then acts with props")],
    out,
  );
  return { file: "kindness-mission-cards.pdf", title: "Kindness Mission Cards", pages: 1, filePath: out };
}

async function buildHeroMovement(dir, apiKey, model) {
  ensureDir(dir);
  const packStyle = "TEACHING_CARD_REALISTIC";
  const specs = [
    { title: "Stretch Tall", subtitle: "Reach like a hero", accent: "#2563eb" },
    { title: "Jump Soft", subtitle: "Quiet jump", accent: "#16a34a" },
    { title: "Tiptoe", subtitle: "Quiet feet", accent: "#db2777" },
    { title: "Freeze", subtitle: "Statue still", accent: "#ca8a04" },
    { title: "Fly Arms", subtitle: "Arms out wide", accent: "#7c3aed" },
  ];
  const cards = [];
  for (const s of specs) {
    const buf = await generateTeachingCardPng(s.title, apiKey, model, packStyle);
    const imagePath = path.join(dir, `move-${s.title.toLowerCase().replace(/\s+/g, "-")}.png`);
    fs.writeFileSync(imagePath, buf);
    cards.push({ ...s, imagePath, tip: "Copy the move" });
    console.log(JSON.stringify({ built: "movement", title: s.title }));
  }
  const sheet = await cutSheetFromImages(cards, {
    sheetTitle: "Hero Movement Action Cards — cut apart",
    cols: 2,
  });
  const out = path.join(dir, "hero-movement-action-cards.pdf");
  await savePdf(
    [async (pdf) => addPortraitPage(pdf, sheet, "Hero Movement Action Cards", "Obstacle course / hero dance — teacher shows card, child copies")],
    out,
  );
  return { file: "hero-movement-action-cards.pdf", title: "Hero Movement Action Cards", pages: 1, filePath: out };
}

async function buildZooAnimals(dir, apiKey, model) {
  ensureDir(dir);
  const specs = [
    { title: "Lion", subtitle: "Roar and stretch", accent: "#ea580c", prompt: "Warm children's educational illustration of a friendly lion with a clear mane, natural animal proportions, simple daycare backdrop, readable at small card size. No text, no logos, no bubble people, no geometric stick animals, no sun-as-lion." },
    { title: "Monkey", subtitle: "Climb and swing", accent: "#92400e", prompt: "Warm children's educational illustration of a friendly monkey with arms ready to climb, natural animal proportions, simple classroom/jungle-corner backdrop, readable at small card size. No text, no logos, no bubble people." },
    { title: "Giraffe", subtitle: "Reach up high", accent: "#ca8a04", prompt: "Warm children's educational illustration of a friendly giraffe with a long neck and spots, natural animal proportions, simple backdrop, readable at small card size. Must clearly look like a giraffe. No text, no logos, no yellow rectangles." },
    { title: "Zebra", subtitle: "Gallop in place", accent: "#1e293b", prompt: "Warm children's educational illustration of a friendly zebra with clear black-and-white stripes, natural animal proportions, readable at small card size. No text, no logos." },
    { title: "Elephant", subtitle: "Stomp and swing", accent: "#475569", prompt: "Warm children's educational illustration of a friendly elephant with trunk and big ears, natural animal proportions, readable at small card size. No text, no logos." },
    { title: "Fish", subtitle: "Swim arms", accent: "#0284c7", prompt: "Warm children's educational illustration of a friendly fish swimming, clear fins and tail, readable at small card size. No text, no logos." },
  ];
  const cards = [];
  for (const s of specs) {
    const buf = await generateObjectCardPng(s.prompt, apiKey, model);
    const imagePath = path.join(dir, `zoo-${s.title.toLowerCase()}.png`);
    fs.writeFileSync(imagePath, buf);
    cards.push({ title: s.title, subtitle: s.subtitle, accent: s.accent, imagePath, tip: "Move like this animal" });
    console.log(JSON.stringify({ built: "zoo-animal", title: s.title }));
  }
  const sheet = await cutSheetFromImages(cards, {
    sheetTitle: "Zoo Animal Picture Cards — cut apart for movement & matching",
    cols: 2,
  });
  const out = path.join(dir, "zoo-animal-picture-cards.pdf");
  await savePdf(
    [async (pdf) => addPortraitPage(pdf, sheet, "Zoo Animal Picture Cards", "Discovery · Move Like An Animal · parade")],
    out,
  );
  return { file: "zoo-animal-picture-cards.pdf", title: "Zoo Animal Picture Cards", pages: 1, filePath: out };
}

async function buildHabitatMatch(dir, apiKey, model) {
  ensureDir(dir);
  const specs = [
    { title: "Lion", subtitle: "Animal", accent: "#ea580c", tip: "Match to home", prompt: "Soft educational children's book illustration of a friendly cartoon lion with a fluffy mane, sitting calmly. Bright simple colors. No text, no logos, no photo realism required." },
    { title: "Savanna", subtitle: "Home", accent: "#ea580c", tip: "Match to animal", prompt: "Soft educational children's book illustration of a grassy plain habitat with tall yellow-green grass, one simple tree, sunny blue sky. Empty landscape only — no animals, no people, no text." },
    { title: "Monkey", subtitle: "Animal", accent: "#16a34a", tip: "Match to home", prompt: "Soft educational children's book illustration of a friendly cartoon monkey hanging from a branch. Bright simple colors. No text, no logos." },
    { title: "Jungle", subtitle: "Home", accent: "#16a34a", tip: "Match to animal", prompt: "Soft educational children's book illustration of a leafy green forest habitat with tall trees and vines. Empty landscape only — no animals, no people, no text." },
    { title: "Fish", subtitle: "Animal", accent: "#0284c7", tip: "Match to home", prompt: "Soft educational children's book illustration of a friendly cartoon fish with fins and a tail. Bright blue tones. No text, no logos." },
    { title: "Water", subtitle: "Home", accent: "#0284c7", tip: "Match to animal", prompt: "Soft educational children's book illustration of a calm blue pond habitat with gentle waves and a few bubbles. Empty water scene only — no animals, no people, no text." },
  ];
  const cards = [];
  for (const s of specs) {
    const buf = await generateObjectCardPng(s.prompt, apiKey, model);
    const imagePath = path.join(dir, `habitat-${s.title.toLowerCase()}.png`);
    fs.writeFileSync(imagePath, buf);
    cards.push({ title: s.title, subtitle: s.subtitle, accent: s.accent, imagePath, tip: s.tip });
    console.log(JSON.stringify({ built: "habitat", title: s.title }));
  }
  const sheet = await cutSheetFromImages(cards, {
    sheetTitle: "Animal–Habitat Match — cut apart, then match",
    cols: 2,
  });
  const out = path.join(dir, "animal-habitat-match-cards.pdf");
  await savePdf(
    [async (pdf) => addPortraitPage(pdf, sheet, "Animal–Habitat Match Cards", "Habitat Matching Game — cut animals and homes, then match")],
    out,
  );
  return { file: "animal-habitat-match-cards.pdf", title: "Animal–Habitat Match Cards", pages: 1, filePath: out };
}

async function main() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const model = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-2").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY required");

  ensureDir(OUT);
  const only = new Set(process.argv.slice(2).filter(Boolean));
  const results = [];

  if (!only.size || only.has("kindness")) {
    results.push({
      lessonId: "cur-lp-toddler-superhero-training-camp",
      replaces: "cur-res-d0766e0900173303",
      ...(await buildKindness(path.join(OUT, "toddler-superhero-training-camp"), apiKey, model)),
    });
  }
  if (!only.size || only.has("movement")) {
    results.push({
      lessonId: "cur-lp-toddler-superhero-training-camp",
      replaces: "cur-res-f72e48f308860194",
      ...(await buildHeroMovement(path.join(OUT, "toddler-superhero-training-camp"), apiKey, model)),
    });
  }
  if (!only.size || only.has("zoo")) {
    results.push({
      lessonId: "cur-lp-toddler-zoo-adventures",
      replaces: "cur-res-47289150a016e6a4",
      ...(await buildZooAnimals(path.join(OUT, "toddler-zoo-adventures"), apiKey, model)),
    });
  }
  if (!only.size || only.has("habitat")) {
    results.push({
      lessonId: "cur-lp-toddler-zoo-adventures",
      replaces: "cur-res-ed3dd8cd112b51ba",
      ...(await buildHabitatMatch(path.join(OUT, "toddler-zoo-adventures"), apiKey, model)),
    });
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ phase: "done", count: results.length, out: OUT }, null, 2));
}

module.exports = { OUT, main };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

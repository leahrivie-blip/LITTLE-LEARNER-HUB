/**
 * Improve the 5 Priority 1 printables classified IMPROVE in the quality audit.
 * Preserves titles/purpose; upgrades artwork via Visual Production; drops filler Extra cards.
 * Local PDFs only — upload via apply script.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");
const { generateVisualProductionImage } = require("../../../server/visual-production-image.js");

const ROOT = path.join(__dirname, "../../..");
const OUT = path.join(ROOT, "curriculum-drafts/pro-upgrade/printables-quality-v3");

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
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

async function genImage(prompt, apiKey, model, visualStyle) {
  return withRetry(
    () =>
      generateVisualProductionImage({
        apiKey,
        model,
        brief: {
          visualStyle,
          generationPrompt: prompt,
          printableTextOverlay: false,
          overlayText: "",
        },
      }).then((r) => r.buffer),
    prompt.slice(0, 48),
  );
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
  fs.writeFileSync(outPath, await pdf.save());
}

async function cutSheetFromImages(cards, opts = {}) {
  const { sheetTitle = "Cut apart", cols = 2, cellW = 520, cellH = 640, gapX = 40, gapY = 40, top = 100 } = opts;
  const rows = Math.ceil(cards.length / cols);
  const width = gapX + cols * (cellW + gapX);
  const height = top + rows * (cellH + gapY) + 60;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#f1f5f9"/>`,
    `<text x="${width / 2}" y="55" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700" fill="#1e293b">${esc(sheetTitle)}</text>`,
  ];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gapX + col * (cellW + gapX);
    const y = top + row * (cellH + gapY);
    const accent = c.accent || "#334155";
    const png = await sharp(c.imagePath)
      .resize(Math.round(cellW - 80), Math.round(cellH - 220), { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    parts.push(`
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="20" fill="#fffef8" stroke="${accent}" stroke-width="6" stroke-dasharray="14 10"/>
      <rect x="${x}" y="${y}" width="${cellW}" height="72" fill="${accent}"/>
      <text x="${x + cellW / 2}" y="${y + 48}" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#fff">${esc(c.title)}</text>
      <image href="data:image/png;base64,${png.toString("base64")}" x="${x + 40}" y="${y + 90}" width="${cellW - 80}" height="${cellH - 220}" preserveAspectRatio="xMidYMid slice"/>
      <text x="${x + cellW / 2}" y="${y + cellH - 70}" text-anchor="middle" font-family="Arial" font-size="26" fill="#334155">${esc(c.subtitle || "")}</text>
      <text x="${x + cellW / 2}" y="${y + cellH - 30}" text-anchor="middle" font-family="Arial" font-size="20" fill="#64748b">${esc(c.tip || "Talk · point · play")}</text>
    `);
  }
  parts.push(`<text x="${width / 2}" y="${height - 25}" text-anchor="middle" font-family="Arial" font-size="20" fill="#64748b">littlelearnershubbyleah.com</text></svg>`);
  return sharp(Buffer.from(parts.join(""))).png().toBuffer();
}

async function writeCardImage(dir, name, buf) {
  const imagePath = path.join(dir, `${name}.png`);
  fs.writeFileSync(imagePath, buf);
  return imagePath;
}

async function buildPetCare(dir, apiKey, model) {
  ensureDir(dir);
  const style = "TEACHING_CARD_REALISTIC";
  const specs = [
    {
      title: "Wash",
      subtitle: "Gently wash the pet",
      accent: "#0284c7",
      tip: "Point to choose",
      prompt:
        "Realistic candid daycare photo: toddler hands gently washing a washable plastic toy dog in a shallow soapy water tub with a washcloth. Soft classroom lighting. Clear caregiving action. No text, no logos, no bubble people, no stick figures.",
    },
    {
      title: "Brush",
      subtitle: "Brush soft fur",
      accent: "#a16207",
      tip: "Point to choose",
      prompt:
        "Realistic candid daycare photo: toddler hand brushing a soft stuffed cat with a soft brush. Towel on table. Clear grooming action. No text, no logos, no bubble people.",
    },
    {
      title: "Feed",
      subtitle: "Offer pretend food",
      accent: "#ea580c",
      tip: "Point to choose",
      prompt:
        "Realistic candid daycare photo: toddler offering a small bowl of pretend kibble to a stuffed dog on a placemat. Clear feeding action. No text, no logos, no bubble people.",
    },
    {
      title: "Listen",
      subtitle: "Listen to the heart",
      accent: "#64748b",
      tip: "Point to choose",
      prompt:
        "Realistic candid daycare photo: toddler using a toy stethoscope on a stuffed pet's chest at a pretend vet exam table. Clear listening action. No text, no logos, no bubble people.",
    },
    {
      title: "Rest",
      subtitle: "Quiet cuddle time",
      accent: "#db2777",
      tip: "Point to choose",
      prompt:
        "Realistic candid daycare photo: toddler gently cuddling a stuffed bunny on a soft towel bed. Calm rest/comfort moment. No text, no logos, no bubble people.",
    },
  ];
  const cards = [];
  for (const s of specs) {
    const buf = await genImage(s.prompt, apiKey, model, style);
    const imagePath = await writeCardImage(dir, `care-${s.title.toLowerCase()}`, buf);
    cards.push({ ...s, imagePath });
    console.log(JSON.stringify({ built: "pet-care", title: s.title }));
  }
  // Page 1: Wash Brush Feed Listen | Page 2: Rest (full useful card set without Extra filler duplicates)
  const sheet1 = await cutSheetFromImages(cards.slice(0, 4), { sheetTitle: "Pet Care Action Cards (sheet 1) — cut apart" });
  const sheet2 = await cutSheetFromImages([cards[4]], { sheetTitle: "Pet Care Action Cards (sheet 2) — Rest", cols: 1, cellW: 900, cellH: 1100 });
  const out = path.join(dir, "pet-care-action-cards.pdf");
  await savePdf(
    [
      async (pdf) => addPortraitPage(pdf, sheet1, "Pet Care Action Cards", "Bath · groom · feed · exam — child points to choose the next care action"),
      async (pdf) => addPortraitPage(pdf, sheet2, "Pet Care Action Cards", "Rest / comfort after care — point to choose"),
    ],
    out,
  );
  return { file: "pet-care-action-cards.pdf", title: "Pet Care Action Cards", pages: 2, filePath: out };
}

async function buildPetFriends(dir, apiKey, model) {
  ensureDir(dir);
  const style = "SOFT_EDUCATIONAL_ILLUSTRATION";
  const specs = [
    { title: "Dog", subtitle: "Woof · soft friend", accent: "#78716c", tip: "Name · match · adopt", prompt: "Soft educational children's book illustration of a friendly soft stuffed dog toy, clear dog face and ears, simple daycare table background. Must look like a dog. No text, no logos, no geometric stick animals." },
    { title: "Cat", subtitle: "Meow · soft friend", accent: "#d97706", tip: "Name · match · adopt", prompt: "Soft educational children's book illustration of a friendly soft stuffed cat toy with ears and whiskers. Must look like a cat. No text, no logos." },
    { title: "Bird", subtitle: "Chirp · soft friend", accent: "#0284c7", tip: "Name · match · adopt", prompt: "Soft educational children's book illustration of a friendly soft toy bird with beak and wings. Must look like a bird. No text, no logos." },
    { title: "Fish", subtitle: "Swim · friend", accent: "#0891b2", tip: "Name · match · adopt", prompt: "Soft educational children's book illustration of a friendly toy fish with fins and tail. Clear fish shape. No text, no logos. Do not label as soft friend animal if fish — just a clear fish toy." },
    { title: "Rabbit", subtitle: "Hop · soft friend", accent: "#a8a29e", tip: "Name · match · adopt", prompt: "Soft educational children's book illustration of a friendly soft stuffed rabbit/bunny with long ears. Must look like a rabbit. No text, no logos." },
  ];
  const cards = [];
  for (const s of specs) {
    const buf = await genImage(s.prompt, apiKey, model, style);
    const imagePath = await writeCardImage(dir, `pet-${s.title.toLowerCase()}`, buf);
    cards.push({ ...s, imagePath });
    console.log(JSON.stringify({ built: "pet-friend", title: s.title }));
  }
  const sheet1 = await cutSheetFromImages(cards.slice(0, 4), { sheetTitle: "Pet Friend Picture Cards (sheet 1)" });
  const sheet2 = await cutSheetFromImages([cards[4]], { sheetTitle: "Pet Friend Picture Cards (sheet 2) — Rabbit", cols: 1, cellW: 900, cellH: 1100 });
  const out = path.join(dir, "pet-friend-picture-cards.pdf");
  await savePdf(
    [
      async (pdf) => addPortraitPage(pdf, sheet1, "Pet Friend Picture Cards", "Meet the Pets · Animal Investigation · Adoption Center"),
      async (pdf) => addPortraitPage(pdf, sheet2, "Pet Friend Picture Cards", "Rabbit card for naming · matching · adoption"),
    ],
    out,
  );
  return { file: "pet-friend-picture-cards.pdf", title: "Pet Friend Picture Cards", pages: 2, filePath: out };
}

async function buildVetChart(dir, apiKey, model) {
  ensureDir(dir);
  const style = "TEACHING_CARD_REALISTIC";
  const heroPrompt =
    "Realistic candid daycare photo of a soft stuffed dog on a small exam table with a toy stethoscope nearby. Warm classroom light. Clear stuffed pet for pretend vet check. No text, no logos, no bubble people.";
  const steps = [
    { title: "Check the Eyes", detail: "Look gently at the eyes", prompt: "Realistic daycare close-up: toddler finger gently pointing near a stuffed pet's eyes without poking. Soft exam table. Clear eyes-check action. No text, no logos." },
    { title: "Check the Ears", detail: "Soft touch near ears", prompt: "Realistic daycare close-up: toddler hand gently touching near a stuffed pet's ear. Soft exam care. No text, no logos." },
    { title: "Check the Paws", detail: "Count the paws", prompt: "Realistic daycare close-up: toddler hand holding a stuffed pet paw, counting paws. Clear paw focus. No text, no logos." },
    { title: "Check the Tummy", detail: "Gentle tummy check", prompt: "Realistic daycare close-up: toddler hand gently resting on a stuffed pet's tummy. Soft comfort check. No text, no logos." },
  ];
  const heroBuf = await genImage(heroPrompt, apiKey, model, style);
  const heroPath = await writeCardImage(dir, "vet-hero", heroBuf);
  console.log(JSON.stringify({ built: "vet-chart", title: "hero" }));
  const stepPaths = [];
  for (let i = 0; i < steps.length; i++) {
    const buf = await genImage(steps[i].prompt, apiKey, model, style);
    const p = await writeCardImage(dir, `vet-step-${i + 1}`, buf);
    stepPaths.push(p);
    console.log(JSON.stringify({ built: "vet-chart", title: steps[i].title }));
  }

  const heroImg = await sharp(heroPath).resize(900, 420, { fit: "cover" }).png().toBuffer();
  const stepImgs = [];
  for (const p of stepPaths) {
    stepImgs.push(await sharp(p).resize(200, 140, { fit: "cover" }).png().toBuffer());
  }

  let y = 520;
  const stepBlocks = steps
    .map((s, i) => {
      const block = `
      <rect x="80" y="${y}" width="1040" height="200" rx="16" fill="#ffedd5" stroke="#ea580c" stroke-width="4"/>
      <circle cx="160" cy="${y + 100}" r="44" fill="#fff" stroke="#ea580c" stroke-width="5"/>
      <text x="160" y="${y + 112}" text-anchor="middle" font-family="Arial" font-size="32" fill="#c2410c">${i + 1}</text>
      <image href="data:image/png;base64,${stepImgs[i].toString("base64")}" x="230" y="${y + 30}" width="200" height="140"/>
      <text x="460" y="${y + 85}" font-family="Arial" font-size="36" font-weight="700" fill="#7c2d12">${esc(s.title)}</text>
      <text x="460" y="${y + 135}" font-family="Arial" font-size="26" fill="#9a3412">${esc(s.detail)}</text>
    `;
      y += 220;
      return block;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <rect width="100%" height="100%" fill="#fff7ed"/>
  <rect x="50" y="40" width="1100" height="1520" rx="20" fill="#fffef8" stroke="#ea580c" stroke-width="8"/>
  <text x="600" y="100" text-anchor="middle" font-family="Arial" font-size="42" font-weight="700" fill="#c2410c">Vet Check Picture Chart</text>
  <text x="600" y="145" text-anchor="middle" font-family="Arial" font-size="24" fill="#9a3412">Use with a stuffed pet at the exam station</text>
  <image href="data:image/png;base64,${heroImg.toString("base64")}" x="150" y="170" width="900" height="320"/>
  ${stepBlocks}
  <text x="600" y="1520" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">littlelearnershubbyleah.com</text>
</svg>`;
  const chartPng = await sharp(Buffer.from(svg)).png().toBuffer();
  const out = path.join(dir, "vet-check-picture-chart.pdf");
  await savePdf([async (pdf) => addPortraitPage(pdf, chartPng, "Vet Check Picture Chart", "Vet Examination Station — check eyes, ears, paws, tummy")], out);
  return { file: "vet-check-picture-chart.pdf", title: "Vet Check Picture Chart", pages: 1, filePath: out };
}

async function buildDayNight(dir, apiKey, model) {
  ensureDir(dir);
  const style = "SOFT_EDUCATIONAL_ILLUSTRATION";
  const specs = [
    { title: "Sunny Day", subtitle: "Outside play time", accent: "#f59e0b", tip: "Talk · point · play", prompt: "Warm children's educational illustration of a bright sunny daycare outdoor play time: blue sky, yellow sun, green grass, simple playground. Cheerful and clear. No text, no logos, no stick figures." },
    { title: "Camp Evening", subtitle: "Quiet campfire circle", accent: "#ea580c", tip: "Talk · point · play", prompt: "Warm children's educational illustration of a cozy pretend campfire circle at evening: soft orange fire glow, logs, cushions around. Calm camping mood. No text, no logos, no people required." },
    { title: "Starry Night", subtitle: "Look for stars", accent: "#1e3a8a", tip: "Talk · point · play", prompt: "Warm children's educational illustration of a starry night camping sky: dark blue sky, moon, many stars, quiet outdoor feel. Clear and readable at card size. No text, no logos." },
    { title: "Flashlight Look", subtitle: "Battery light only", accent: "#64748b", tip: "Talk · point · play", prompt: "Warm children's educational illustration of a toddler-safe battery flashlight shining a soft beam onto a wall with paper stars. Dim room, safe light play. No text, no logos, no shining into eyes." },
  ];
  const cards = [];
  for (const s of specs) {
    const buf = await genImage(s.prompt, apiKey, model, style);
    const imagePath = await writeCardImage(dir, `daynight-${s.title.toLowerCase().replace(/\s+/g, "-")}`, buf);
    cards.push({ ...s, imagePath });
    console.log(JSON.stringify({ built: "day-night", title: s.title }));
  }
  const sheet = await cutSheetFromImages(cards, { sheetTitle: "Day & Night Scene Cards — cut apart" });
  const out = path.join(dir, "day-night-scene-cards.pdf");
  await savePdf([async (pdf) => addPortraitPage(pdf, sheet, "Day & Night Scene Cards", "Flashlight Exploration · Campfire Story Time")], out);
  return { file: "day-night-scene-cards.pdf", title: "Day & Night Scene Cards", pages: 1, filePath: out };
}

async function buildNatureHunt(dir, apiKey, model) {
  ensureDir(dir);
  const style = "SIMPLE_OBJECT_ILLUSTRATION";
  // 5 unique finds only — no Extra Leaf filler
  const specs = [
    { title: "Leaf", subtitle: "Can you find one?", accent: "#16a34a", tip: "Hunt · match · collect", prompt: "Clear educational illustration of one large green leaf with visible veins, simple cream background. Object fills the frame. No text, no logos, no thin stick-line icons." },
    { title: "Pinecone", subtitle: "Can you find one?", accent: "#92400e", tip: "Hunt · match · collect", prompt: "Clear educational illustration of one large brown pinecone with textured scales, simple cream background. Object fills the frame. No text, no logos." },
    { title: "Stick", subtitle: "Can you find one?", accent: "#a16207", tip: "Hunt · match · collect", prompt: "Clear educational illustration of one chunky brown nature stick/twig, simple cream background. Large and recognizable. No text, no logos." },
    { title: "Rock", subtitle: "Can you find one?", accent: "#64748b", tip: "Hunt · match · collect", prompt: "Clear educational illustration of one smooth gray nature stone/rock, simple cream background. Large and recognizable. No text, no logos." },
    { title: "Feather", subtitle: "Can you find one?", accent: "#7c3aed", tip: "Hunt · match · collect", prompt: "Clear educational illustration of one soft nature feather, purple-gray tones, simple cream background. Large and recognizable. No text, no logos." },
  ];
  const cards = [];
  for (const s of specs) {
    const buf = await genImage(s.prompt, apiKey, model, style);
    const imagePath = await writeCardImage(dir, `hunt-${s.title.toLowerCase()}`, buf);
    cards.push({ ...s, imagePath });
    console.log(JSON.stringify({ built: "nature-hunt", title: s.title }));
  }
  const sheet = await cutSheetFromImages(cards, { sheetTitle: "Nature Treasure Hunt Cards — cut apart" });
  const out = path.join(dir, "nature-treasure-hunt-cards.pdf");
  await savePdf([async (pdf) => addPortraitPage(pdf, sheet, "Nature Treasure Hunt Cards", "Match tray items or outdoor finds")], out);
  return { file: "nature-treasure-hunt-cards.pdf", title: "Nature Treasure Hunt Cards", pages: 1, filePath: out };
}

async function main() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const model = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-2").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY required");
  ensureDir(OUT);
  const only = new Set(process.argv.slice(2).filter(Boolean));
  const results = [];
  const petDir = path.join(OUT, "toddler-pet-vet-clinic");
  const campDir = path.join(OUT, "toddler-camping-under-the-stars");

  if (!only.size || only.has("pet-care")) {
    results.push({
      lessonId: "cur-lp-toddler-pet-vet-clinic",
      improves: "cur-res-b722ba10ee070a6b",
      ...(await buildPetCare(petDir, apiKey, model)),
    });
  }
  if (!only.size || only.has("pet-friends")) {
    results.push({
      lessonId: "cur-lp-toddler-pet-vet-clinic",
      improves: "cur-res-f69bee309aa41f32",
      ...(await buildPetFriends(petDir, apiKey, model)),
    });
  }
  if (!only.size || only.has("vet-chart")) {
    results.push({
      lessonId: "cur-lp-toddler-pet-vet-clinic",
      improves: "cur-res-ab46a19506a160f1",
      ...(await buildVetChart(petDir, apiKey, model)),
    });
  }
  if (!only.size || only.has("day-night")) {
    results.push({
      lessonId: "cur-lp-toddler-camping-under-the-stars",
      improves: "cur-res-739b44750866b0e1",
      ...(await buildDayNight(campDir, apiKey, model)),
    });
  }
  if (!only.size || only.has("nature-hunt")) {
    results.push({
      lessonId: "cur-lp-toddler-camping-under-the-stars",
      improves: "cur-res-72b3d0b06da14a7f",
      ...(await buildNatureHunt(campDir, apiKey, model)),
    });
  }

  fs.writeFileSync(path.join(OUT, "improve-manifest.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ phase: "done", count: results.length }, null, 2));
}

module.exports = { OUT, main };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

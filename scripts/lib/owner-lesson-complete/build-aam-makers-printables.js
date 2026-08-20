"use strict";

/**
 * Build draft printables for Toddler All About Me + Little Makers Workshop.
 * Object/action cards only — no bubble-person figures.
 */
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "../../..");
const OUT = path.join(ROOT, "curriculum-drafts/owner-lesson-complete/printables");

async function svgToPng(svg, w, h) {
  return sharp(Buffer.from(svg)).resize(w, h, { fit: "fill" }).png().toBuffer();
}

async function addImagePage(pdf, png, title, subtitle) {
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(png);
  page.drawText("Little Learner Hub — DRAFT Printable", {
    x: 36, y: 752, size: 10, font: fontReg, color: rgb(0.45, 0.45, 0.5),
  });
  page.drawText(title, { x: 36, y: 720, size: 22, font, color: rgb(0.12, 0.16, 0.28) });
  page.drawText(subtitle, { x: 36, y: 698, size: 11, font: fontReg, color: rgb(0.35, 0.38, 0.45) });
  page.drawImage(image, { x: 86, y: 180, width: 440, height: 440 });
  page.drawText("Cut on edges as needed · Draft for owner review · Not published", {
    x: 36, y: 48, size: 10, font: fontReg, color: rgb(0.45, 0.45, 0.5),
  });
}

async function writePdf(pages, outPath) {
  const pdf = await PDFDocument.create();
  for (const build of pages) await build(pdf);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, await pdf.save());
  return outPath;
}

async function buildAllAboutMePrintables() {
  const dir = path.join(OUT, "toddler-all-about-me");
  // Body part OBJECT cards — no human figures
  const bodyParts = [
    ["Eyes", "#e0f2fe", `<ellipse cx="170" cy="240" rx="70" ry="45" fill="#fff" stroke="#0f172a" stroke-width="8"/><circle cx="170" cy="240" r="22" fill="#0f172a"/><ellipse cx="342" cy="240" rx="70" ry="45" fill="#fff" stroke="#0f172a" stroke-width="8"/><circle cx="342" cy="240" r="22" fill="#0f172a"/>`],
    ["Nose", "#fef3c7", `<ellipse cx="256" cy="250" rx="48" ry="70" fill="#fbbf24" stroke="#0f172a" stroke-width="8"/><ellipse cx="236" cy="280" rx="10" ry="14" fill="#0f172a"/><ellipse cx="276" cy="280" rx="10" ry="14" fill="#0f172a"/>`],
    ["Mouth", "#ffe4e6", `<path d="M150 240 Q256 340 362 240" fill="none" stroke="#be123c" stroke-width="22" stroke-linecap="round"/><path d="M180 250 Q256 310 332 250" fill="#fda4af"/>`],
    ["Hands", "#ecfccb", `<ellipse cx="180" cy="250" rx="70" ry="90" fill="#bef264" stroke="#0f172a" stroke-width="8"/><ellipse cx="332" cy="250" rx="70" ry="90" fill="#bef264" stroke="#0f172a" stroke-width="8"/><circle cx="180" cy="150" r="28" fill="#a3e635"/><circle cx="332" cy="150" r="28" fill="#a3e635"/>`],
    ["Feet", "#ede9fe", `<ellipse cx="180" cy="280" rx="80" ry="50" fill="#c4b5fd" stroke="#0f172a" stroke-width="8"/><ellipse cx="332" cy="280" rx="80" ry="50" fill="#c4b5fd" stroke="#0f172a" stroke-width="8"/><ellipse cx="150" cy="250" rx="22" ry="30" fill="#a78bfa"/><ellipse cx="302" cy="250" rx="22" ry="30" fill="#a78bfa"/>`],
    ["Ears", "#fce7f3", `<ellipse cx="150" cy="250" rx="55" ry="80" fill="#f9a8d4" stroke="#0f172a" stroke-width="8"/><ellipse cx="362" cy="250" rx="55" ry="80" fill="#f9a8d4" stroke="#0f172a" stroke-width="8"/><ellipse cx="150" cy="250" rx="22" ry="40" fill="#fbcfe8"/><ellipse cx="362" cy="250" rx="22" ry="40" fill="#fbcfe8"/>`],
  ];
  const bodyPdf = path.join(dir, "body-parts-picture-cards.pdf");
  await writePdf(
    bodyParts.map(([label, bg, art]) => async (pdf) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="${bg}"/><rect x="24" y="24" width="464" height="464" rx="28" fill="none" stroke="#334155" stroke-width="6"/>${art}<text x="50%" y="90%" text-anchor="middle" font-family="Arial" font-size="40" fill="#0f172a">${label}</text></svg>`;
      await addImagePage(pdf, await svgToPng(svg, 512, 512), `Body Part — ${label}`, "Point · name · move · toddler self-awareness");
    }),
    bodyPdf,
  );

  // Favorites object cards
  const favorites = [
    ["Ball", "#dbeafe", `<circle cx="256" cy="230" r="110" fill="#3b82f6" stroke="#0f172a" stroke-width="8"/><path d="M160 230 Q256 170 352 230" fill="none" stroke="#93c5fd" stroke-width="10"/><path d="M160 230 Q256 290 352 230" fill="none" stroke="#93c5fd" stroke-width="10"/>`],
    ["Book", "#ffedd5", `<rect x="150" y="140" width="212" height="240" rx="12" fill="#f97316" stroke="#0f172a" stroke-width="8"/><rect x="170" y="160" width="172" height="200" fill="#fff7ed"/><line x1="256" y1="160" x2="256" y2="360" stroke="#fdba74" stroke-width="6"/>`],
    ["Music", "#dcfce7", `<circle cx="200" cy="300" r="55" fill="#16a34a" stroke="#0f172a" stroke-width="8"/><circle cx="340" cy="260" r="40" fill="#22c55e" stroke="#0f172a" stroke-width="8"/><rect x="245" y="140" width="18" height="160" fill="#0f172a"/><rect x="370" y="120" width="14" height="140" fill="#0f172a"/>`],
    ["Snack", "#fef9c3", `<ellipse cx="256" cy="250" rx="120" ry="70" fill="#eab308" stroke="#0f172a" stroke-width="8"/><ellipse cx="256" cy="230" rx="90" ry="40" fill="#fde047"/>`],
  ];
  const favPdf = path.join(dir, "favorites-choice-cards.pdf");
  await writePdf(
    favorites.map(([label, bg, art]) => async (pdf) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="${bg}"/><rect x="24" y="24" width="464" height="464" rx="28" fill="none" stroke="#334155" stroke-width="6"/>${art}<text x="50%" y="90%" text-anchor="middle" font-family="Arial" font-size="40" fill="#0f172a">${label}</text></svg>`;
      await addImagePage(pdf, await svgToPng(svg, 512, 512), `Favorite Choice — ${label}`, "Choose · show · talk · Favorites Discovery Baskets");
    }),
    favPdf,
  );

  return [
    { title: "Body Parts Picture Cards (draft)", filePath: bodyPdf, pageCount: bodyParts.length },
    { title: "Favorites Choice Cards (draft)", filePath: favPdf, pageCount: favorites.length },
  ];
}

async function buildLittleMakersPrintables() {
  const dir = path.join(OUT, "little-makers-workshop");
  const stations = [
    ["Draw", "#fff7ed", `<rect x="140" y="160" width="40" height="200" rx="10" fill="#f97316"/><polygon points="140,160 180,160 160,120" fill="#fb923c"/><path d="M200 340 Q280 280 360 360" fill="none" stroke="#0f172a" stroke-width="10" stroke-linecap="round"/>`],
    ["Paint", "#e0f2fe", `<rect x="180" y="140" width="36" height="200" rx="8" fill="#0ea5e9"/><rect x="160" y="120" width="76" height="36" rx="8" fill="#38bdf8"/><circle cx="300" cy="300" r="70" fill="#7dd3fc" opacity="0.9"/><circle cx="340" cy="260" r="40" fill="#38bdf8"/>`],
    ["Stick", "#fce7f3", `<rect x="150" y="180" width="212" height="160" rx="16" fill="#f9a8d4" stroke="#0f172a" stroke-width="6"/><rect x="180" y="210" width="70" height="50" rx="8" fill="#fbi"/><rect x="270" y="240" width="60" height="60" rx="8" fill="#f472b6"/><rect x="200" y="280" width="90" height="40" rx="8" fill="#db2777"/>`.replace("#fbi", "#fbcfe8")],
    ["Build", "#ecfccb", `<rect x="160" y="280" width="90" height="70" fill="#65a30d" stroke="#0f172a" stroke-width="6"/><rect x="260" y="240" width="90" height="110" fill="#84cc16" stroke="#0f172a" stroke-width="6"/><rect x="200" y="180" width="90" height="60" fill="#a3e635" stroke="#0f172a" stroke-width="6"/>`],
    ["Dough", "#fef3c7", `<ellipse cx="256" cy="260" rx="130" ry="90" fill="#fbbf24" stroke="#0f172a" stroke-width="8"/><circle cx="210" cy="240" r="18" fill="#f59e0b"/><circle cx="300" cy="250" r="14" fill="#f59e0b"/>`],
  ];
  const stationPdf = path.join(dir, "maker-station-signs.pdf");
  await writePdf(
    stations.map(([label, bg, art]) => async (pdf) => {
      const page = pdf.addPage([792, 612]);
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
      const png = await svgToPng(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="400"><rect width="100%" height="100%" fill="${bg}"/>${art}</svg>`,
        512,
        400,
      );
      const image = await pdf.embedPng(png);
      page.drawText("DRAFT Station Sign · Little Makers Workshop", {
        x: 40, y: 560, size: 12, font: fontReg, color: rgb(0.4, 0.4, 0.45),
      });
      page.drawRectangle({
        x: 60, y: 100, width: 672, height: 420,
        borderColor: rgb(0.2, 0.2, 0.25), borderWidth: 6, color: rgb(0.99, 0.98, 0.96),
      });
      page.drawImage(image, { x: 90, y: 180, width: 280, height: 220 });
      page.drawText(label.toUpperCase(), { x: 400, y: 300, size: 48, font, color: rgb(0.12, 0.14, 0.2) });
      page.drawText("Hang at child height near the invitation", {
        x: 400, y: 250, size: 14, font: fontReg, color: rgb(0.35, 0.35, 0.4),
      });
      page.drawText("Process art / building · Little Learner Hub draft · Not published", {
        x: 40, y: 40, size: 11, font: fontReg, color: rgb(0.4, 0.4, 0.45),
      });
    }),
    stationPdf,
  );

  const prompts = [
    ["Press", "Press hands, sponges, or stamps into paint or dough."],
    ["Tear", "Tear paper slowly — listen to the sound."],
    ["Stick", "Stick one piece, then another. Overlap is okay."],
    ["Roll", "Roll dough or cars — notice what marks appear."],
    ["Stack", "Stack boxes or blocks — rebuild when they fall."],
  ];
  const promptPdf = path.join(dir, "process-maker-prompt-cards.pdf");
  await writePdf(
    prompts.map(([label, hint]) => async (pdf) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="#f8fafc"/><rect x="24" y="24" width="464" height="464" rx="28" fill="#fff" stroke="#334155" stroke-width="6"/><text x="50%" y="45%" text-anchor="middle" font-family="Arial" font-size="64" fill="#0f172a">${label}</text><text x="50%" y="62%" text-anchor="middle" font-family="Arial" font-size="22" fill="#475569">${hint.slice(0, 42)}</text></svg>`;
      await addImagePage(pdf, await svgToPng(svg, 512, 512), `Maker Prompt — ${label}`, hint);
    }),
    promptPdf,
  );

  return [
    { title: "Maker Station Signs (draft)", filePath: stationPdf, pageCount: stations.length },
    { title: "Process Maker Prompt Cards (draft)", filePath: promptPdf, pageCount: prompts.length },
  ];
}

async function main() {
  const aam = await buildAllAboutMePrintables();
  const makers = await buildLittleMakersPrintables();
  console.log(JSON.stringify({ aam, makers }, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { buildAllAboutMePrintables, buildLittleMakersPrintables };

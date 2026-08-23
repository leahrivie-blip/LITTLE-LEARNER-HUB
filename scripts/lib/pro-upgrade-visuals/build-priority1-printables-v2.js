/**
 * Activity-driven Priority 1 printable rebuild (pdf-lib + sharp).
 * Dense cut-sheets + purpose-specific layouts (not blank one-word signs).
 * Branding footer: littlelearnershubbyleah.com
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "../../..");
const OUT = path.join(ROOT, "curriculum-drafts/pro-upgrade/printables-v2");

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

async function svgPng(svg, w, h) {
  return sharp(Buffer.from(svg)).resize(w, h, { fit: "fill" }).png().toBuffer();
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

async function pageFooter(page, font, y = 28) {
  page.drawText("littlelearnershubbyleah.com", {
    x: 40,
    y,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.5),
  });
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
  const maxH = 660;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: (612 - w) / 2, y: 50, width: w, height: h });
  await pageFooter(page, reg, 32);
}

async function addLandscapePage(pdf, png, title, howToUse) {
  const page = pdf.addPage([792, 612]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const img = await pdf.embedPng(png);
  page.drawText(title, { x: 36, y: 572, size: 14, font: bold });
  if (howToUse) {
    const tip = howToUse.length > 110 ? `${howToUse.slice(0, 107)}…` : howToUse;
    page.drawText(tip, { x: 36, y: 552, size: 9, font: reg, color: rgb(0.35, 0.35, 0.4) });
  }
  const maxW = 720;
  const maxH = 480;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  page.drawImage(img, { x: 36, y: 50, width: img.width * scale, height: img.height * scale });
  await pageFooter(page, reg, 28);
}

async function savePdf(builders, outPath) {
  const pdf = await PDFDocument.create();
  for (const b of builders) await b(pdf);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, await pdf.save());
  return outPath;
}

/* ---------------- Icon library (recognizable toddler pictures) ---------------- */

const I = {
  dog: `
    <ellipse cx="0" cy="40" rx="90" ry="55" fill="#c4b5a5"/>
    <circle cx="0" cy="-35" r="55" fill="#c4b5a5"/>
    <ellipse cx="-48" cy="-55" rx="22" ry="38" fill="#8b7355"/>
    <ellipse cx="48" cy="-55" rx="22" ry="38" fill="#8b7355"/>
    <circle cx="-18" cy="-40" r="7" fill="#1f2937"/>
    <circle cx="18" cy="-40" r="7" fill="#1f2937"/>
    <ellipse cx="0" cy="-18" rx="16" ry="10" fill="#7c5c3e"/>
    <ellipse cx="-55" cy="70" rx="18" ry="12" fill="#8b7355"/>
    <ellipse cx="55" cy="70" rx="18" ry="12" fill="#8b7355"/>`,
  cat: `
    <ellipse cx="0" cy="45" rx="75" ry="50" fill="#fbbf24"/>
    <circle cx="0" cy="-30" r="50" fill="#fbbf24"/>
    <polygon points="-42,-55 -55,-110 -15,-55" fill="#f59e0b"/>
    <polygon points="15,-55 55,-110 42,-55" fill="#f59e0b"/>
    <circle cx="-16" cy="-35" r="6" fill="#1f2937"/>
    <circle cx="16" cy="-35" r="6" fill="#1f2937"/>
    <polygon points="-8,-12 0,-2 8,-12" fill="#ea580c"/>
    <line x1="-55" y1="-5" x2="-25" y2="-12" stroke="#92400e" stroke-width="3"/>
    <line x1="55" y1="-5" x2="25" y2="-12" stroke="#92400e" stroke-width="3"/>`,
  bird: `
    <ellipse cx="0" cy="10" rx="55" ry="70" fill="#38bdf8"/>
    <circle cx="10" cy="-40" r="32" fill="#7dd3fc"/>
    <polygon points="55,0 110,-15 55,25" fill="#f59e0b"/>
    <circle cx="18" cy="-45" r="5" fill="#1f2937"/>
    <ellipse cx="-20" cy="20" rx="35" ry="18" fill="#0ea5e9" transform="rotate(-25 -20 20)"/>
    <line x1="-10" y1="70" x2="-10" y2="100" stroke="#f59e0b" stroke-width="6"/>
    <line x1="10" y1="70" x2="10" y2="100" stroke="#f59e0b" stroke-width="6"/>`,
  fish: `
    <ellipse cx="10" cy="0" rx="90" ry="45" fill="#22d3ee"/>
    <polygon points="-80,0 -130,-40 -130,40" fill="#0891b2"/>
    <circle cx="45" cy="-10" r="8" fill="#1f2937"/>
    <path d="M30 20 Q50 35 70 20" fill="none" stroke="#0e7490" stroke-width="4"/>
    <ellipse cx="0" cy="-35" rx="18" ry="12" fill="#67e8f9"/>`,
  rabbit: `
    <ellipse cx="0" cy="50" rx="70" ry="55" fill="#e7e5e4"/>
    <circle cx="0" cy="-10" r="48" fill="#e7e5e4"/>
    <ellipse cx="-28" cy="-80" rx="16" ry="55" fill="#d6d3d1"/>
    <ellipse cx="28" cy="-80" rx="16" ry="55" fill="#d6d3d1"/>
    <ellipse cx="-28" cy="-80" rx="8" ry="40" fill="#fda4af"/>
    <ellipse cx="28" cy="-80" rx="8" ry="40" fill="#fda4af"/>
    <circle cx="-14" cy="-15" r="5" fill="#1f2937"/>
    <circle cx="14" cy="-15" r="5" fill="#1f2937"/>
    <ellipse cx="0" cy="5" rx="10" ry="7" fill="#fda4af"/>`,
  wash: `
    <rect x="-90" y="-20" width="180" height="110" rx="20" fill="#7dd3fc"/>
    <ellipse cx="0" cy="-20" rx="90" ry="28" fill="#38bdf8"/>
    <ellipse cx="0" cy="40" rx="55" ry="35" fill="#c4b5a5"/>
    <circle cx="0" cy="-5" r="28" fill="#c4b5a5"/>
    <circle cx="-40" cy="-50" r="10" fill="#bae6fd" opacity="0.9"/>
    <circle cx="35" cy="-65" r="8" fill="#bae6fd" opacity="0.9"/>
    <circle cx="10" cy="-40" r="6" fill="#bae6fd"/>`,
  brush: `
    <rect x="-12" y="-90" width="24" height="120" rx="8" fill="#a16207"/>
    <rect x="-55" y="30" width="110" height="55" rx="10" fill="#fef3c7" stroke="#a16207" stroke-width="5"/>
    ${Array.from({ length: 7 }, (_, i) => `<line x1="${-40 + i * 13}" y1="40" x2="${-40 + i * 13}" y2="75" stroke="#92400e" stroke-width="4"/>`).join("")}
    <ellipse cx="40" cy="-40" rx="40" ry="28" fill="#c4b5a5"/>`,
  feed: `
    <ellipse cx="0" cy="50" rx="95" ry="30" fill="#a8a29e"/>
    <ellipse cx="0" cy="35" rx="80" ry="22" fill="#d6d3d1"/>
    <circle cx="-35" cy="20" r="22" fill="#f97316"/>
    <circle cx="5" cy="5" r="20" fill="#ef4444"/>
    <circle cx="40" cy="25" r="18" fill="#eab308"/>
    <ellipse cx="-50" cy="-40" rx="35" ry="25" fill="#c4b5a5"/>`,
  listen: `
    <circle cx="0" cy="0" r="70" fill="#e2e8f0" stroke="#64748b" stroke-width="10"/>
    <circle cx="0" cy="0" r="35" fill="#fff" stroke="#94a3b8" stroke-width="6"/>
    <path d="M-45 10 Q0 55 45 10" fill="none" stroke="#ef4444" stroke-width="10" stroke-linecap="round"/>
    <ellipse cx="70" cy="-20" rx="40" ry="28" fill="#c4b5a5"/>`,
  rest: `
    <rect x="-100" y="20" width="200" height="70" rx="18" fill="#fdba74"/>
    <ellipse cx="0" cy="20" rx="85" ry="30" fill="#fed7aa"/>
    <ellipse cx="-20" cy="-25" rx="45" ry="35" fill="#c4b5a5"/>
    <circle cx="-20" cy="-55" r="28" fill="#c4b5a5"/>
    <path d="M40 -70 Q70 -90 90 -60" fill="none" stroke="#94a3b8" stroke-width="6"/>
    <path d="M55 -55 Q80 -70 95 -45" fill="none" stroke="#94a3b8" stroke-width="5"/>`,
  lion: `
    <circle cx="0" cy="10" r="70" fill="#f59e0b"/>
    <circle cx="0" cy="10" r="48" fill="#fbbf24"/>
    <circle cx="-18" cy="0" r="7" fill="#1f2937"/>
    <circle cx="18" cy="0" r="7" fill="#1f2937"/>
    <ellipse cx="0" cy="22" rx="14" ry="10" fill="#d97706"/>
    <path d="M-20 40 Q0 55 20 40" fill="none" stroke="#92400e" stroke-width="5"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x1 = Math.cos(a) * 70;
      const y1 = Math.sin(a) * 70 + 10;
      const x2 = Math.cos(a) * 95;
      const y2 = Math.sin(a) * 95 + 10;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d97706" stroke-width="10" stroke-linecap="round"/>`;
    }).join("")}`,
  monkey: `
    <ellipse cx="0" cy="40" rx="55" ry="60" fill="#a16207"/>
    <circle cx="0" cy="-30" r="45" fill="#a16207"/>
    <ellipse cx="0" cy="-15" rx="28" ry="22" fill="#fde68a"/>
    <circle cx="-16" cy="-40" r="6" fill="#1f2937"/>
    <circle cx="16" cy="-40" r="6" fill="#1f2937"/>
    <ellipse cx="-55" cy="-50" rx="18" ry="25" fill="#92400e"/>
    <ellipse cx="55" cy="-50" rx="18" ry="25" fill="#92400e"/>
    <path d="M-40 60 Q-80 90 -50 110" fill="none" stroke="#92400e" stroke-width="14" stroke-linecap="round"/>
    <path d="M40 60 Q80 90 50 110" fill="none" stroke="#92400e" stroke-width="14" stroke-linecap="round"/>`,
  giraffe: `
    <rect x="-18" y="-80" width="36" height="140" rx="12" fill="#eab308"/>
    <ellipse cx="0" cy="80" rx="55" ry="40" fill="#eab308"/>
    <ellipse cx="0" cy="-100" rx="32" ry="28" fill="#fbbf24"/>
    <rect x="-8" y="-130" width="8" height="25" fill="#ca8a04"/>
    <rect x="4" y="-130" width="8" height="25" fill="#ca8a04"/>
    <circle cx="-10" cy="-105" r="4" fill="#1f2937"/>
    <circle cx="-35" cy="50" r="12" fill="#ca8a04"/>
    <circle cx="25" cy="70" r="10" fill="#ca8a04"/>
    <circle cx="10" cy="-40" r="9" fill="#ca8a04"/>`,
  zebra: `
    <ellipse cx="0" cy="30" rx="80" ry="45" fill="#f8fafc" stroke="#1f2937" stroke-width="4"/>
    <ellipse cx="55" cy="-20" rx="35" ry="28" fill="#f8fafc" stroke="#1f2937" stroke-width="4"/>
    ${[[-40, 10], [-10, 25], [20, 5], [45, 30]].map(([x, y]) => `<rect x="${x}" y="${y}" width="14" height="50" fill="#1f2937" transform="rotate(-15 ${x} ${y})"/>`).join("")}
    <circle cx="70" cy="-25" r="5" fill="#1f2937"/>
    <rect x="-70" y="55" width="12" height="45" fill="#1f2937"/>
    <rect x="-40" y="55" width="12" height="45" fill="#1f2937"/>
    <rect x="25" y="55" width="12" height="45" fill="#1f2937"/>
    <rect x="55" y="55" width="12" height="45" fill="#1f2937"/>`,
  elephant: `
    <ellipse cx="0" cy="20" rx="85" ry="60" fill="#94a3b8"/>
    <circle cx="-40" cy="-40" r="48" fill="#94a3b8"/>
    <path d="M-55 -20 Q-90 60 -40 100" fill="none" stroke="#64748b" stroke-width="22" stroke-linecap="round"/>
    <circle cx="-55" cy="-50" r="6" fill="#1f2937"/>
    <ellipse cx="-75" cy="-55" rx="14" ry="22" fill="#64748b"/>
    <ellipse cx="-20" cy="-70" rx="14" ry="22" fill="#64748b"/>
    <rect x="-50" y="70" width="18" height="40" fill="#64748b"/>
    <rect x="20" y="70" width="18" height="40" fill="#64748b"/>`,
  savanna: `
    <rect x="-160" y="-40" width="320" height="160" fill="#fde68a"/>
    <circle cx="90" cy="-70" r="40" fill="#fbbf24"/>
    <rect x="-20" y="20" width="18" height="70" fill="#92400e"/>
    <ellipse cx="-11" cy="10" rx="45" ry="25" fill="#65a30d"/>
    <path d="M-160 80 Q-80 40 0 85 T160 70" fill="none" stroke="#ca8a04" stroke-width="8"/>`,
  jungle: `
    <rect x="-160" y="-40" width="320" height="160" fill="#bbf7d0"/>
    <rect x="-80" y="-20" width="20" height="120" fill="#166534"/>
    <ellipse cx="-70" cy="-30" rx="50" ry="35" fill="#16a34a"/>
    <rect x="40" y="0" width="18" height="100" fill="#166534"/>
    <ellipse cx="49" cy="-10" rx="55" ry="40" fill="#22c55e"/>
    <ellipse cx="100" cy="40" rx="40" ry="25" fill="#15803d"/>
    <circle cx="-120" cy="60" r="18" fill="#ef4444"/>`,
  water: `
    <rect x="-160" y="-40" width="320" height="160" fill="#bae6fd"/>
    <path d="M-140 20 Q-100 0 -60 25 T20 20 T100 30 T160 15" fill="none" stroke="#0284c7" stroke-width="10"/>
    <path d="M-140 60 Q-80 40 -20 65 T100 55 T160 70" fill="none" stroke="#38bdf8" stroke-width="8"/>
    <ellipse cx="40" cy="-10" rx="50" ry="25" fill="#22d3ee" opacity="0.7"/>
    <circle cx="-80" cy="-20" r="12" fill="#fff" opacity="0.8"/>`,
  sun: `
    <circle cx="0" cy="0" r="55" fill="#fbbf24"/>
    ${Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return `<line x1="${Math.cos(a) * 70}" y1="${Math.sin(a) * 70}" x2="${Math.cos(a) * 100}" y2="${Math.sin(a) * 100}" stroke="#f59e0b" stroke-width="10" stroke-linecap="round"/>`;
    }).join("")}
    <ellipse cx="0" cy="90" rx="120" ry="30" fill="#86efac"/>`,
  campfire: `
    <rect x="-140" y="40" width="280" height="60" fill="#1e3a8a"/>
    ${[[-40, 20], [-10, 35], [30, 15]].map(([x, y]) => `<circle cx="${x}" cy="${y - 80}" r="4" fill="#fff"/>`).join("")}
    <rect x="-50" y="50" width="20" height="50" fill="#78350f" transform="rotate(-25 -40 75)"/>
    <rect x="20" y="50" width="20" height="50" fill="#78350f" transform="rotate(25 30 75)"/>
    <polygon points="0,-40 -35,50 35,50" fill="#fb923c"/>
    <polygon points="0,-10 -18,45 18,45" fill="#fde047"/>`,
  stars: `
    <rect x="-160" y="-100" width="320" height="220" fill="#1e3a8a"/>
    ${[[-90, -50], [-30, -70], [40, -40], [90, -60], [-60, 10], [20, 0], [70, 20], [-100, 40]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${3 + (i % 3)}" fill="#fff"/>`).join("")}
    <circle cx="60" cy="-20" r="35" fill="#fde68a" opacity="0.95"/>
    <ellipse cx="0" cy="90" rx="140" ry="25" fill="#334155"/>`,
  flashlight: `
    <rect x="-160" y="-100" width="320" height="220" fill="#0f172a"/>
    <rect x="-25" y="-20" width="50" height="120" rx="12" fill="#94a3b8"/>
    <circle cx="0" cy="-35" r="35" fill="#fde047"/>
    <path d="M-40 -40 L-120 -90 L-100 -40 Z" fill="#fef08a" opacity="0.5"/>
    <path d="M40 -40 L120 -90 L100 -40 Z" fill="#fef08a" opacity="0.5"/>
    ${[[-70, -60], [50, -70], [80, -40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#fff"/>`).join("")}`,
  leaf: `
    <path d="M0 -90 Q70 -20 0 90 Q-70 -20 0 -90" fill="#22c55e" stroke="#166534" stroke-width="4"/>
    <path d="M0 -70 L0 70" fill="none" stroke="#166534" stroke-width="5"/>
    <path d="M0 -20 Q35 -5 45 20" fill="none" stroke="#166534" stroke-width="3"/>
    <path d="M0 20 Q-35 30 -40 55" fill="none" stroke="#166534" stroke-width="3"/>`,
  pinecone: `
    <ellipse cx="0" cy="10" rx="45" ry="70" fill="#92400e"/>
    ${[[-20, -30], [15, -40], [-25, 0], [20, -5], [-15, 30], [18, 35], [0, -55]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="14" ry="10" fill="#a16207" stroke="#78350f" stroke-width="2"/>`).join("")}`,
  stick: `
    <path d="M-90 40 Q-20 -40 40 -10 Q80 10 100 -30" fill="none" stroke="#a16207" stroke-width="18" stroke-linecap="round"/>
    <path d="M-40 0 Q0 -50 30 -20" fill="none" stroke="#854d0e" stroke-width="10" stroke-linecap="round"/>`,
  rock: `
    <ellipse cx="0" cy="20" rx="75" ry="50" fill="#94a3b8"/>
    <ellipse cx="-15" cy="5" rx="40" ry="28" fill="#cbd5e1"/>
    <path d="M-40 10 L-10 -15 L30 5" fill="none" stroke="#64748b" stroke-width="4"/>`,
  feather: `
    <path d="M0 90 Q-5 -40 30 -90" fill="none" stroke="#7c3aed" stroke-width="8" stroke-linecap="round"/>
    ${[[-25, -40], [20, -55], [-30, 0], [25, -10], [-28, 40], [22, 30]].map(([x, y], i) => `<line x1="0" y1="${y + 20}" x2="${x}" y2="${y}" stroke="${i % 2 ? "#a78bfa" : "#c4b5fd"}" stroke-width="6"/>`).join("")}`,
  bottle: `
    <rect x="-30" y="-40" width="60" height="120" rx="12" fill="#38bdf8"/>
    <rect x="-18" y="-70" width="36" height="35" rx="6" fill="#0284c7"/>
    <rect x="-22" y="-80" width="44" height="14" rx="4" fill="#64748b"/>
    <ellipse cx="0" cy="20" rx="22" ry="35" fill="#7dd3fc" opacity="0.7"/>`,
  snack: `
    <rect x="-55" y="-30" width="110" height="80" rx="12" fill="#fdba74" stroke="#ea580c" stroke-width="5"/>
    <circle cx="-20" cy="5" r="14" fill="#ef4444"/>
    <circle cx="15" cy="-5" r="12" fill="#22c55e"/>
    <circle cx="25" cy="25" r="10" fill="#eab308"/>
    <rect x="-40" y="-55" width="80" height="20" rx="6" fill="#fb923c"/>`,
  mapIcon: `
    <rect x="-70" y="-55" width="140" height="110" rx="8" fill="#fef3c7" stroke="#b45309" stroke-width="5"/>
    <path d="M-40 30 C-10 -20 20 40 50 -10" fill="none" stroke="#92400e" stroke-width="5" stroke-dasharray="8 6"/>
    <text x="45" y="-20" font-family="Arial" font-size="28" fill="#b91c1c" font-weight="700">X</text>`,
  flashIcon: `
    <rect x="-22" y="-20" width="44" height="100" rx="10" fill="#64748b"/>
    <circle cx="0" cy="-35" r="28" fill="#fde047"/>
    <rect x="-28" y="50" width="56" height="18" rx="4" fill="#334155"/>`,
  carry: `
    <circle cx="-50" cy="-20" r="28" fill="#fda4af"/>
    <rect x="-65" y="10" width="30" height="55" rx="8" fill="#60a5fa"/>
    <circle cx="40" cy="-15" r="28" fill="#fcd34d"/>
    <rect x="25" y="15" width="30" height="55" rx="8" fill="#34d399"/>
    <rect x="-20" y="0" width="50" height="35" rx="8" fill="#f97316"/>
    <path d="M-35 25 L15 25" stroke="#1f2937" stroke-width="6" stroke-linecap="round"/>`,
  share: `
    <rect x="-70" y="-20" width="60" height="60" rx="10" fill="#60a5fa"/>
    <rect x="10" y="-20" width="60" height="60" rx="10" fill="#f472b6"/>
    <path d="M-10 10 L10 10" stroke="#16a34a" stroke-width="8" stroke-linecap="round"/>
    <polygon points="5,0 25,10 5,20" fill="#16a34a"/>
    <circle cx="-40" cy="-50" r="22" fill="#fda4af"/>
    <circle cx="40" cy="-50" r="22" fill="#fcd34d"/>`,
  cleanup: `
    <rect x="-80" y="20" width="100" height="60" rx="10" fill="#a16207"/>
    <circle cx="-50" cy="-10" r="25" fill="#ef4444"/>
    <rect x="20" y="-40" width="40" height="50" rx="6" fill="#3b82f6"/>
    <path d="M40 -40 L55 -70 L70 -40" fill="#22c55e"/>
    <circle cx="50" cy="40" r="8" fill="#fbbf24"/>
    <path d="M-90 50 Q-20 -30 50 40" fill="none" stroke="#16a34a" stroke-width="6" stroke-dasharray="8 6"/>`,
  cheer: `
    <circle cx="0" cy="-30" r="35" fill="#fcd34d"/>
    <path d="M-15 -25 Q0 -5 15 -25" fill="none" stroke="#1f2937" stroke-width="4"/>
    <circle cx="-12" cy="-40" r="4" fill="#1f2937"/>
    <circle cx="12" cy="-40" r="4" fill="#1f2937"/>
    <path d="M-40 20 L-55 -40" stroke="#f97316" stroke-width="10" stroke-linecap="round"/>
    <path d="M40 20 L55 -40" stroke="#f97316" stroke-width="10" stroke-linecap="round"/>
    <rect x="-30" y="20" width="60" height="70" rx="12" fill="#a855f7"/>`,
  gentle: `
    <circle cx="-40" cy="0" r="40" fill="#fda4af"/>
    <circle cx="40" cy="0" r="40" fill="#fcd34d"/>
    <path d="M-15 10 Q0 -15 15 10" fill="none" stroke="#16a34a" stroke-width="8" stroke-linecap="round"/>
    <path d="M-70 -40 Q-40 -70 -10 -40" fill="none" stroke="#94a3b8" stroke-width="5"/>
    <text x="0" y="70" text-anchor="middle" font-family="Arial" font-size="28" fill="#64748b">soft</text>`,
  stretch: `
    <circle cx="0" cy="-50" r="28" fill="#fda4af"/>
    <rect x="-18" y="-20" width="36" height="70" rx="10" fill="#60a5fa"/>
    <path d="M-18 0 L-70 -60" stroke="#60a5fa" stroke-width="14" stroke-linecap="round"/>
    <path d="M18 0 L70 -60" stroke="#60a5fa" stroke-width="14" stroke-linecap="round"/>
    <path d="M-10 50 L-25 110" stroke="#1e40af" stroke-width="14" stroke-linecap="round"/>
    <path d="M10 50 L25 110" stroke="#1e40af" stroke-width="14" stroke-linecap="round"/>`,
  jump: `
    <circle cx="0" cy="-30" r="26" fill="#fda4af"/>
    <rect x="-16" y="-5" width="32" height="50" rx="8" fill="#34d399"/>
    <path d="M-16 20 L-50 10" stroke="#34d399" stroke-width="12" stroke-linecap="round"/>
    <path d="M16 20 L50 10" stroke="#34d399" stroke-width="12" stroke-linecap="round"/>
    <path d="M-8 45 L-20 85" stroke="#065f46" stroke-width="12" stroke-linecap="round"/>
    <path d="M8 45 L20 85" stroke="#065f46" stroke-width="12" stroke-linecap="round"/>
    <ellipse cx="0" cy="110" rx="50" ry="10" fill="#94a3b8" opacity="0.5"/>`,
  tiptoe: `
    <circle cx="0" cy="-40" r="24" fill="#fda4af"/>
    <rect x="-14" y="-15" width="28" height="55" rx="8" fill="#f472b6"/>
    <path d="M-8 40 L-12 100" stroke="#9d174d" stroke-width="10" stroke-linecap="round"/>
    <path d="M8 40 L12 100" stroke="#9d174d" stroke-width="10" stroke-linecap="round"/>
    <ellipse cx="-12" cy="108" rx="14" ry="6" fill="#9d174d"/>
    <ellipse cx="12" cy="108" rx="14" ry="6" fill="#9d174d"/>
    <path d="M-40 80 Q0 60 40 80" fill="none" stroke="#94a3b8" stroke-width="3" stroke-dasharray="6 4"/>`,
  freeze: `
    <circle cx="0" cy="-45" r="26" fill="#fda4af"/>
    <rect x="-18" y="-18" width="36" height="65" rx="8" fill="#fbbf24"/>
    <path d="M-18 10 L-55 40" stroke="#fbbf24" stroke-width="12" stroke-linecap="round"/>
    <path d="M18 10 L55 40" stroke="#fbbf24" stroke-width="12" stroke-linecap="round"/>
    <path d="M-10 45 L-15 110" stroke="#b45309" stroke-width="12" stroke-linecap="round"/>
    <path d="M10 45 L15 110" stroke="#b45309" stroke-width="12" stroke-linecap="round"/>
    <text x="0" y="-80" text-anchor="middle" font-family="Arial" font-size="32" fill="#ca8a04">!</text>`,
  fly: `
    <circle cx="0" cy="-20" r="26" fill="#fda4af"/>
    <rect x="-16" y="5" width="32" height="55" rx="8" fill="#a78bfa"/>
    <path d="M-16 25 L-90 0" stroke="#7c3aed" stroke-width="16" stroke-linecap="round"/>
    <path d="M16 25 L90 0" stroke="#7c3aed" stroke-width="16" stroke-linecap="round"/>
    <path d="M-8 55 L-15 100" stroke="#5b21b6" stroke-width="12" stroke-linecap="round"/>
    <path d="M8 55 L15 100" stroke="#5b21b6" stroke-width="12" stroke-linecap="round"/>
    <path d="M-70 -40 Q-40 -70 -10 -40" fill="none" stroke="#c4b5fd" stroke-width="4"/>`,
  seed: `<ellipse cx="0" cy="0" rx="35" ry="55" fill="#92400e"/><ellipse cx="-8" cy="-10" rx="12" ry="20" fill="#a16207"/>`,
  sprout: `
    <rect x="-8" y="20" width="16" height="70" fill="#15803d"/>
    <ellipse cx="-35" cy="15" rx="40" ry="22" fill="#22c55e"/>
    <ellipse cx="35" cy="15" rx="40" ry="22" fill="#22c55e"/>
    <ellipse cx="0" cy="90" rx="55" ry="18" fill="#a16207"/>`,
  tree: `
    <rect x="-18" y="20" width="36" height="90" fill="#92400e"/>
    <ellipse cx="0" cy="-20" rx="90" ry="70" fill="#16a34a"/>
    <ellipse cx="-50" cy="10" rx="45" ry="35" fill="#22c55e"/>
    <ellipse cx="50" cy="10" rx="45" ry="35" fill="#22c55e"/>`,
  apple: `
    <circle cx="0" cy="10" r="55" fill="#ef4444"/>
    <ellipse cx="0" cy="-50" rx="10" ry="22" fill="#15803d"/>
    <path d="M0 -35 Q35 -60 50 -30" fill="none" stroke="#15803d" stroke-width="8"/>
    <ellipse cx="-15" cy="-5" rx="12" ry="18" fill="#fca5a5" opacity="0.5"/>`,
  soil: `
    <rect x="-80" y="20" width="160" height="70" rx="12" fill="#92400e"/>
    <ellipse cx="0" cy="20" rx="80" ry="25" fill="#a16207"/>
    <ellipse cx="0" cy="0" rx="28" ry="40" fill="#78350f"/>`,
  waterDrop: `
    <path d="M0 -70 C50 0 50 60 0 90 C-50 60 -50 0 0 -70" fill="#38bdf8"/>
    <ellipse cx="-12" cy="10" rx="12" ry="20" fill="#7dd3fc" opacity="0.7"/>`,
  handsWash: `
    <ellipse cx="-30" cy="10" rx="40" ry="50" fill="#fda4af"/>
    <ellipse cx="30" cy="10" rx="40" ry="50" fill="#fda4af"/>
    <circle cx="0" cy="-40" r="25" fill="#7dd3fc" opacity="0.8"/>
    <circle cx="-40" cy="-50" r="12" fill="#bae6fd"/>
    <circle cx="45" cy="-45" r="10" fill="#bae6fd"/>`,
  mash: `
    <ellipse cx="0" cy="50" rx="80" ry="25" fill="#a8a29e"/>
    <ellipse cx="0" cy="30" rx="65" ry="35" fill="#fdba74"/>
    <rect x="-12" y="-70" width="24" height="90" rx="8" fill="#78716c"/>
    <rect x="-40" y="-85" width="80" height="25" rx="8" fill="#57534e"/>`,
  stir: `
    <ellipse cx="0" cy="40" rx="70" ry="45" fill="#fb923c"/>
    <ellipse cx="0" cy="25" rx="55" ry="30" fill="#fdba74"/>
    <rect x="20" y="-70" width="16" height="100" rx="6" fill="#a16207" transform="rotate(25 28 -20)"/>
    <path d="M-30 10 Q0 -10 30 15" fill="none" stroke="#ea580c" stroke-width="6"/>`,
  taste: `
    <ellipse cx="0" cy="20" rx="55" ry="40" fill="#fdba74"/>
    <path d="M-30 -10 Q0 -40 30 -10" fill="none" stroke="#c2410c" stroke-width="8"/>
    <circle cx="-40" cy="-50" r="8" fill="#94a3b8"/>
    <path d="M-40 -50 Q0 -90 40 -40" fill="none" stroke="#94a3b8" stroke-width="4"/>`,
  sauceBowl: `
    <ellipse cx="0" cy="30" rx="70" ry="35" fill="#a8a29e"/>
    <ellipse cx="0" cy="10" rx="60" ry="30" fill="#fdba74"/>
    <circle cx="-15" cy="5" r="10" fill="#fb923c"/>`,
  juiceCup: `
    <path d="M-35 -40 L-25 60 L25 60 L35 -40 Z" fill="#fde047" stroke="#ca8a04" stroke-width="4"/>
    <ellipse cx="0" cy="-40" rx="35" ry="12" fill="#fef08a" stroke="#ca8a04" stroke-width="4"/>
    <rect x="30" y="-20" width="12" height="50" rx="4" fill="#ca8a04"/>`,
  pie: `
    <path d="M-70 20 L0 -50 L70 20 Z" fill="#fdba74" stroke="#c2410c" stroke-width="5"/>
    <path d="M-50 10 L0 -30 L50 10" fill="none" stroke="#ea580c" stroke-width="4"/>
    <ellipse cx="0" cy="25" rx="75" ry="18" fill="#f97316"/>`,
  waterSip: `
    <path d="M-30 -35 L-22 55 L22 55 L30 -35 Z" fill="#7dd3fc" stroke="#0284c7" stroke-width="4"/>
    <ellipse cx="0" cy="-35" rx="30" ry="10" fill="#bae6fd" stroke="#0284c7" stroke-width="4"/>`,
};

function iconAt(name, x, y, scale = 1) {
  const body = I[name] || "";
  return `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`;
}

/** 2×2 cut sheet — dense toddler picture cards */
function cutSheet2x2(cards, opts = {}) {
  const { sheetTitle = "Cut apart on dashed lines", accent = "#334155" } = opts;
  const cells = cards.slice(0, 4).map((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 40 + col * 560;
    const y = 100 + row * 680;
    return `
      <rect x="${x}" y="${y}" width="520" height="640" rx="20" fill="#fffef8" stroke="${c.accent || accent}" stroke-width="6" stroke-dasharray="14 10"/>
      <rect x="${x}" y="${y}" width="520" height="72" fill="${c.accent || accent}"/>
      <text x="${x + 260}" y="${y + 50}" text-anchor="middle" font-family="Arial" font-size="36" font-weight="700" fill="#fff">${esc(c.title)}</text>
      <rect x="${x + 40}" y="${y + 100}" width="440" height="380" rx="16" fill="${c.panel || "#f8fafc"}"/>
      ${iconAt(c.icon, x + 260, y + 300, c.scale || 1.35)}
      <text x="${x + 260}" y="${y + 540}" text-anchor="middle" font-family="Arial" font-size="28" fill="#334155">${esc(c.subtitle || "")}</text>
      <text x="${x + 260}" y="${y + 590}" text-anchor="middle" font-family="Arial" font-size="22" fill="#64748b">${esc(c.tip || "Talk · point · play")}</text>
    `;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <rect width="100%" height="100%" fill="#f1f5f9"/>
  <text x="600" y="55" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#1e293b">${esc(sheetTitle)}</text>
  ${cells.join("")}
  <text x="600" y="1565" text-anchor="middle" font-family="Arial" font-size="22" fill="#64748b">littlelearnershubbyleah.com</text>
</svg>`;
}

function cutSheet2x3(cards, opts = {}) {
  const { sheetTitle = "Cut apart on dashed lines", accent = "#334155" } = opts;
  const cells = cards.slice(0, 6).map((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 40 + col * 560;
    const y = 90 + row * 480;
    return `
      <rect x="${x}" y="${y}" width="520" height="450" rx="18" fill="#fffef8" stroke="${c.accent || accent}" stroke-width="5" stroke-dasharray="12 8"/>
      <rect x="${x}" y="${y}" width="520" height="58" fill="${c.accent || accent}"/>
      <text x="${x + 260}" y="${y + 40}" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#fff">${esc(c.title)}</text>
      <rect x="${x + 30}" y="${y + 75}" width="460" height="280" rx="14" fill="${c.panel || "#f8fafc"}"/>
      ${iconAt(c.icon, x + 260, y + 220, c.scale || 1.1)}
      <text x="${x + 260}" y="${y + 400}" text-anchor="middle" font-family="Arial" font-size="24" fill="#334155">${esc(c.subtitle || "")}</text>
    `;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <rect width="100%" height="100%" fill="#f1f5f9"/>
  <text x="600" y="55" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#1e293b">${esc(sheetTitle)}</text>
  ${cells.join("")}
  <text x="600" y="1565" text-anchor="middle" font-family="Arial" font-size="22" fill="#64748b">littlelearnershubbyleah.com</text>
</svg>`;
}

function recipeSvg() {
  const steps = [
    ["1", "WASH", "Wash hands together", "handsWash", "#0284c7"],
    ["2", "MASH", "Mash soft cooled apple", "mash", "#ea580c"],
    ["3", "STIR", "Stir round and round", "stir", "#16a34a"],
    ["4", "TASTE?", "Optional taste — or smell", "taste", "#db2777"],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <rect width="100%" height="100%" fill="#fff7ed"/>
  <rect x="40" y="40" width="1120" height="1520" rx="24" fill="#fffef8" stroke="#c2410c" stroke-width="8"/>
  <text x="600" y="120" text-anchor="middle" font-family="Arial" font-size="48" font-weight="700" fill="#9a3412">Applesauce Picture Recipe</text>
  <text x="600" y="170" text-anchor="middle" font-family="Arial" font-size="24" fill="#7c2d12">Teacher cooks/cools apples first · no child knives · tasting optional</text>
  ${steps
    .map(([n, t, d, icon, c], i) => {
      const y = 210 + i * 300;
      return `
    <rect x="90" y="${y}" width="1020" height="270" rx="20" fill="#fff" stroke="${c}" stroke-width="6"/>
    <circle cx="200" cy="${y + 135}" r="55" fill="${c}"/>
    <text x="200" y="${y + 152}" text-anchor="middle" font-family="Arial" font-size="44" font-weight="700" fill="#fff">${n}</text>
    <text x="300" y="${y + 90}" font-family="Arial" font-size="44" font-weight="700" fill="#1f2937">${t}</text>
    <text x="300" y="${y + 145}" font-family="Arial" font-size="28" fill="#475569">${d}</text>
    ${iconAt(icon, 980, y + 140, 0.95)}
  `;
    })
    .join("")}
  <text x="600" y="1500" text-anchor="middle" font-family="Arial" font-size="22" fill="#64748b">littlelearnershubbyleah.com</text>
</svg>`;
}

function cafeMenuSvg() {
  const items = [
    ["Applesauce Bowl", "sauceBowl", "#ea580c"],
    ["Apple Juice Cup", "juiceCup", "#ca8a04"],
    ["Pretend Apple Pie", "pie", "#db2777"],
    ["Water Sip", "waterSip", "#0284c7"],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <rect width="100%" height="100%" fill="#fffbeb"/>
  <rect x="50" y="50" width="1100" height="1500" rx="18" fill="#fffef5" stroke="#92400e" stroke-width="10"/>
  <text x="600" y="140" text-anchor="middle" font-family="Arial" font-size="52" font-weight="700" fill="#78350f">Apple Juice Café</text>
  <text x="600" y="190" text-anchor="middle" font-family="Arial" font-size="26" fill="#92400e">Point to order · pretend pour · tasting optional</text>
  <line x1="140" y1="230" x2="1060" y2="230" stroke="#d6d3d1" stroke-width="4"/>
  ${items
    .map(([name, icon, c], i) => {
      const y = 300 + i * 220;
      return `
    <rect x="120" y="${y}" width="960" height="180" rx="16" fill="#fff" stroke="${c}" stroke-width="4"/>
    ${iconAt(icon, 220, y + 95, 0.85)}
    <text x="340" y="${y + 105}" font-family="Arial" font-size="40" fill="#1c1917">${name}</text>
    <text x="980" y="${y + 105}" text-anchor="end" font-family="Arial" font-size="32" fill="#a8a29e">• • •</text>
  `;
    })
    .join("")}
  <rect x="140" y="1220" width="920" height="180" rx="16" fill="#ffedd5" stroke="#c2410c" stroke-width="4"/>
  <text x="600" y="1295" text-anchor="middle" font-family="Arial" font-size="30" fill="#9a3412">Teacher tip: offer picture choice only.</text>
  <text x="600" y="1345" text-anchor="middle" font-family="Arial" font-size="26" fill="#9a3412">Children hand an order ticket to the café helper.</text>
  <text x="600" y="1480" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">littlelearnershubbyleah.com</text>
</svg>`;
}

function orderTicketsSvg() {
  const labels = ["Applesauce", "Juice", "Pie", "Water", "Applesauce", "Juice", "Pie", "Water"];
  const icons = ["sauceBowl", "juiceCup", "pie", "waterSip", "sauceBowl", "juiceCup", "pie", "waterSip"];
  const tickets = labels
    .map((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 80 + col * 540;
      const y = 120 + row * 320;
      return `
    <rect x="${x}" y="${y}" width="500" height="280" rx="14" fill="#fff" stroke="#78716c" stroke-width="4" stroke-dasharray="10 7"/>
    <text x="${x + 250}" y="${y + 45}" text-anchor="middle" font-family="Arial" font-size="22" fill="#57534e">ORDER TICKET</text>
    ${iconAt(icons[i], x + 250, y + 130, 0.7)}
    <text x="${x + 250}" y="${y + 230}" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#1c1917">${label}</text>
    <text x="${x + 250}" y="${y + 260}" text-anchor="middle" font-family="Arial" font-size="18" fill="#a8a29e">Hand to café helper</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <rect width="100%" height="100%" fill="#fafaf9"/>
  <text x="600" y="70" text-anchor="middle" font-family="Arial" font-size="36" font-weight="700" fill="#44403c">Café Order Tickets — cut apart</text>
  ${tickets}
  <text x="600" y="1520" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">littlelearnershubbyleah.com</text>
</svg>`;
}

function sortMatSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
  <rect width="100%" height="100%" fill="#fff7ed"/>
  <text x="800" y="70" text-anchor="middle" font-family="Arial" font-size="44" font-weight="700" fill="#9a3412">Apple Color Sort Mat</text>
  ${[
    [80, "#ef4444", "RED", "apple"],
    [560, "#22c55e", "GREEN", "apple"],
    [1040, "#eab308", "YELLOW", "apple"],
  ]
    .map(
      ([x, c, t]) => `
    <rect x="${x}" y="110" width="440" height="880" rx="24" fill="#fff" stroke="${c}" stroke-width="10"/>
    <circle cx="${x + 220}" cy="280" r="90" fill="${c}"/>
    <ellipse cx="${x + 220}" cy="190" rx="12" ry="28" fill="#15803d"/>
    <text x="${x + 220}" y="460" text-anchor="middle" font-family="Arial" font-size="48" font-weight="700" fill="${c}">${t}</text>
    <text x="${x + 220}" y="530" text-anchor="middle" font-family="Arial" font-size="26" fill="#78716c">Put matching apples here</text>
    <rect x="${x + 60}" y="580" width="320" height="340" rx="16" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-width="3" stroke-dasharray="10 8"/>
  `,
    )
    .join("")}
  <text x="800" y="1050" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">littlelearnershubbyleah.com</text>
</svg>`;
}

function appleCutoutsSvg() {
  const colors = ["#ef4444", "#ef4444", "#22c55e", "#22c55e", "#eab308", "#eab308", "#ef4444", "#22c55e"];
  const apples = colors
    .map((c, i) => {
      const x = 140 + (i % 4) * 360;
      const y = 220 + Math.floor(i / 4) * 420;
      return `
      <circle cx="${x}" cy="${y}" r="110" fill="${c}" stroke="#7f1d1d" stroke-width="4"/>
      <ellipse cx="${x}" cy="${y - 110}" rx="14" ry="28" fill="#15803d"/>
      <path d="M${x} ${y - 90} Q${x + 40} ${y - 130} ${x + 55} ${y - 95}" fill="none" stroke="#15803d" stroke-width="10"/>
      <circle cx="${x}" cy="${y}" r="118" fill="none" stroke="#d6d3d1" stroke-width="2" stroke-dasharray="6 8"/>
    `;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
  <rect width="100%" height="100%" fill="#fffef8"/>
  <text x="800" y="70" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="#44403c">Apple Cutouts — cut on dashed edges</text>
  ${apples}
  <text x="800" y="1040" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">littlelearnershubbyleah.com · large toddler pieces</text>
</svg>`;
}

function treasureMapSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1100" viewBox="0 0 1400 1100">
  <rect width="100%" height="100%" fill="#fef3c7"/>
  <rect x="40" y="40" width="1320" height="1020" rx="16" fill="#fffbeb" stroke="#b45309" stroke-width="8"/>
  <text x="700" y="105" text-anchor="middle" font-family="Arial" font-size="44" font-weight="700" fill="#92400e">Toddler Treasure Map</text>
  <path d="M180 850 C320 700, 420 780, 520 620 S780 420, 980 380 S1180 300, 1180 220" fill="none" stroke="#92400e" stroke-width="10" stroke-dasharray="16 14"/>
  <rect x="100" y="760" width="180" height="120" rx="16" fill="#0369a1"/>
  <polygon points="120,760 190,700 260,760" fill="#0ea5e9"/>
  <text x="190" y="840" text-anchor="middle" font-family="Arial" font-size="26" fill="#fff">SHIP</text>
  <ellipse cx="700" cy="520" rx="130" ry="80" fill="#4ade80" stroke="#166534" stroke-width="6"/>
  <rect x="685" y="470" width="30" height="60" fill="#92400e"/>
  <ellipse cx="700" cy="460" rx="50" ry="30" fill="#16a34a"/>
  <text x="700" y="560" text-anchor="middle" font-family="Arial" font-size="26" fill="#14532d">ISLAND</text>
  <text x="1180" y="195" text-anchor="middle" font-family="Arial" font-size="72" font-weight="700" fill="#b91c1c">X</text>
  <rect x="1100" y="220" width="160" height="90" rx="12" fill="#fbbf24" stroke="#b45309" stroke-width="4"/>
  <text x="1180" y="275" text-anchor="middle" font-family="Arial" font-size="22" fill="#92400e">treasure</text>
  <rect x="140" y="140" width="300" height="170" rx="12" fill="#ffedd5" stroke="#c2410c" stroke-width="3"/>
  <text x="290" y="210" text-anchor="middle" font-family="Arial" font-size="24" fill="#9a3412">Stamp or sticker</text>
  <text x="290" y="250" text-anchor="middle" font-family="Arial" font-size="24" fill="#9a3412">treasures here</text>
  <circle cx="400" cy="750" r="18" fill="#38bdf8"/>
  <circle cx="900" cy="500" r="14" fill="#a855f7"/>
  <text x="700" y="1000" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">Follow the dashed path · soft toy treasure only · littlelearnershubbyleah.com</text>
</svg>`;
}

function coinSortSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
  <rect width="100%" height="100%" fill="#fffbeb"/>
  <text x="800" y="70" text-anchor="middle" font-family="Arial" font-size="42" font-weight="700" fill="#92400e">Gold Coin Sort Mat</text>
  <rect x="80" y="120" width="680" height="880" rx="24" fill="#fef9c3" stroke="#ca8a04" stroke-width="8"/>
  <circle cx="420" cy="280" r="90" fill="#fbbf24" stroke="#b45309" stroke-width="6"/>
  <text x="420" y="295" text-anchor="middle" font-family="Arial" font-size="42" fill="#92400e">$</text>
  <text x="420" y="420" text-anchor="middle" font-family="Arial" font-size="40" fill="#a16207">BIG coins</text>
  <rect x="160" y="480" width="520" height="440" rx="16" fill="#fff" stroke="#ca8a04" stroke-width="3" stroke-dasharray="10 8"/>
  <rect x="840" y="120" width="680" height="880" rx="24" fill="#ffedd5" stroke="#ea580c" stroke-width="8"/>
  <circle cx="1180" cy="280" r="55" fill="#fbbf24" stroke="#b45309" stroke-width="5"/>
  <text x="1180" y="292" text-anchor="middle" font-family="Arial" font-size="28" fill="#92400e">$</text>
  <text x="1180" y="400" text-anchor="middle" font-family="Arial" font-size="40" fill="#c2410c">LITTLE coins</text>
  <rect x="920" y="480" width="520" height="440" rx="16" fill="#fff" stroke="#ea580c" stroke-width="3" stroke-dasharray="10 8"/>
  <text x="800" y="1050" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">littlelearnershubbyleah.com</text>
</svg>`;
}

function coinCutoutsSvg() {
  let coins = "";
  for (let i = 0; i < 8; i++) {
    const big = i < 4;
    const r = big ? 95 : 60;
    const x = 180 + (i % 4) * 360;
    const y = big ? 280 : 720;
    coins += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbbf24" stroke="#b45309" stroke-width="6"/>
      <circle cx="${x}" cy="${y}" r="${r - 18}" fill="none" stroke="#f59e0b" stroke-width="4"/>
      <text x="${x}" y="${y + 14}" text-anchor="middle" font-family="Arial" font-size="${big ? 36 : 26}" fill="#92400e">$</text>
      <circle cx="${x}" cy="${y}" r="${r + 10}" fill="none" stroke="#d6d3d1" stroke-width="2" stroke-dasharray="6 8"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
  <rect width="100%" height="100%" fill="#fffef8"/>
  <text x="800" y="70" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="#44403c">Gold Coin Cutouts</text>
  ${coins}
  <text x="800" y="1040" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">Cut on dashed circles · large toddler pieces · littlelearnershubbyleah.com</text>
</svg>`;
}

function countingTreeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1100" viewBox="0 0 1400 1100">
  <rect width="100%" height="100%" fill="#f0fdf4"/>
  <text x="700" y="70" text-anchor="middle" font-family="Arial" font-size="42" font-weight="700" fill="#166534">Apple Tree Counting Mat</text>
  <rect x="560" y="520" width="80" height="320" fill="#92400e"/>
  <ellipse cx="600" cy="420" rx="280" ry="220" fill="#22c55e"/>
  <ellipse cx="480" cy="380" rx="140" ry="120" fill="#16a34a"/>
  <ellipse cx="740" cy="380" rx="140" ry="120" fill="#16a34a"/>
  ${[[480, 360], [600, 320], [720, 360], [540, 440], [660, 440], [600, 400], [520, 300], [680, 300]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="28" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="6 6"/><text x="${x}" y="${y + 8}" text-anchor="middle" font-family="Arial" font-size="20" fill="#fff">${i + 1}</text>`)
    .join("")}
  <text x="700" y="920" text-anchor="middle" font-family="Arial" font-size="28" fill="#166534">Place apple cutouts on the dashed circles. Count together.</text>
  <text x="700" y="1040" text-anchor="middle" font-family="Arial" font-size="22" fill="#64748b">littlelearnershubbyleah.com</text>
</svg>`;
}

function badgeTemplateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="100%" height="100%" fill="#eff6ff"/>
  <text x="600" y="80" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="#1e3a8a">Super Badge Emblem Template</text>
  <circle cx="600" cy="620" r="380" fill="#fff" stroke="#2563eb" stroke-width="14"/>
  <circle cx="600" cy="620" r="300" fill="none" stroke="#93c5fd" stroke-width="8" stroke-dasharray="12 10"/>
  <polygon points="600,380 640,500 770,500 670,580 700,710 600,640 500,710 530,580 430,500 560,500" fill="none" stroke="#93c5fd" stroke-width="6"/>
  <text x="600" y="610" text-anchor="middle" font-family="Arial" font-size="36" fill="#64748b">Decorate here</text>
  <text x="600" y="660" text-anchor="middle" font-family="Arial" font-size="28" fill="#94a3b8">stickers · markers · collage</text>
  <text x="600" y="1120" text-anchor="middle" font-family="Arial" font-size="22" fill="#64748b">Cut out · tape on cape/shirt · littlelearnershubbyleah.com</text>
</svg>`;
}

function vetChartSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <rect width="100%" height="100%" fill="#fff7ed"/>
  <rect x="50" y="50" width="1100" height="1500" rx="20" fill="#fffef8" stroke="#ea580c" stroke-width="8"/>
  <text x="600" y="120" text-anchor="middle" font-family="Arial" font-size="46" font-weight="700" fill="#c2410c">Vet Check Picture Chart</text>
  <text x="600" y="170" text-anchor="middle" font-family="Arial" font-size="24" fill="#9a3412">Use with a stuffed pet at the exam station</text>
  ${iconAt("dog", 600, 360, 1.6)}
  ${[
    ["Eyes", "Look gently at the eyes", 680],
    ["Ears", "Soft touch near ears", 880],
    ["Paws", "Count the paws", 1080],
    ["Tummy", "Gentle tummy check", 1280],
  ]
    .map(
      ([t, d, y], i) => `
    <rect x="120" y="${y}" width="960" height="160" rx="16" fill="#ffedd5" stroke="#ea580c" stroke-width="4"/>
    <circle cx="220" cy="${y + 80}" r="42" fill="#fff" stroke="#ea580c" stroke-width="5"/>
    <text x="220" y="${y + 92}" text-anchor="middle" font-family="Arial" font-size="28" fill="#c2410c">${i + 1}</text>
    <text x="300" y="${y + 70}" font-family="Arial" font-size="36" fill="#7c2d12">Check the ${t}</text>
    <text x="300" y="${y + 115}" font-family="Arial" font-size="24" fill="#9a3412">${d}</text>
  `,
    )
    .join("")}
  <text x="600" y="1500" text-anchor="middle" font-family="Arial" font-size="22" fill="#78716c">littlelearnershubbyleah.com</text>
</svg>`;
}

function matchBoardSvg(pairs) {
  // pairs: [{animal, habitat, animalIcon, habitatIcon, color}]
  const animalCards = pairs
    .map((p, i) => {
      const y = 140 + i * 280;
      return `
      <rect x="60" y="${y}" width="480" height="250" rx="18" fill="#fff" stroke="${p.color}" stroke-width="6" stroke-dasharray="12 8"/>
      <rect x="60" y="${y}" width="480" height="50" fill="${p.color}"/>
      <text x="300" y="${y + 36}" text-anchor="middle" font-family="Arial" font-size="26" fill="#fff">${esc(p.animal)}</text>
      ${iconAt(p.animalIcon, 300, y + 145, 1.0)}
    `;
    })
    .join("");
  const habitatCards = pairs
    .map((p, i) => {
      const y = 140 + i * 280;
      return `
      <rect x="660" y="${y}" width="480" height="250" rx="18" fill="#fff" stroke="${p.color}" stroke-width="6" stroke-dasharray="12 8"/>
      <rect x="660" y="${y}" width="480" height="50" fill="${p.color}"/>
      <text x="900" y="${y + 36}" text-anchor="middle" font-family="Arial" font-size="26" fill="#fff">${esc(p.habitat)}</text>
      ${iconAt(p.habitatIcon, 900, y + 145, 0.95)}
    `;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1100" viewBox="0 0 1200 1100">
  <rect width="100%" height="100%" fill="#ecfdf5"/>
  <text x="600" y="55" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#166534">Animal–Habitat Match — cut apart, then match</text>
  <text x="300" y="105" text-anchor="middle" font-family="Arial" font-size="24" fill="#334155">Animals</text>
  <text x="900" y="105" text-anchor="middle" font-family="Arial" font-size="24" fill="#334155">Homes</text>
  ${animalCards}${habitatCards}
  <text x="600" y="1060" text-anchor="middle" font-family="Arial" font-size="20" fill="#64748b">littlelearnershubbyleah.com</text>
</svg>`;
}

function sequenceStripSvg(steps, title) {
  // 4 large cards in a row on landscape for sequencing
  const cards = steps
    .map((s, i) => {
      const x = 40 + i * 380;
      const iconY = 460;
      return `
      <rect x="${x}" y="120" width="350" height="780" rx="20" fill="#fffef8" stroke="${s.accent}" stroke-width="6" stroke-dasharray="12 8"/>
      <circle cx="${x + 175}" cy="200" r="45" fill="${s.accent}"/>
      <text x="${x + 175}" y="218" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="#fff">${i + 1}</text>
      <rect x="${x + 30}" y="270" width="290" height="360" rx="14" fill="${s.panel || "#f0fdf4"}"/>
      ${iconAt(s.icon, x + 175, iconY, s.scale || 1.2)}
      <text x="${x + 175}" y="720" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#1f2937">${esc(s.title)}</text>
      <text x="${x + 175}" y="770" text-anchor="middle" font-family="Arial" font-size="22" fill="#64748b">${esc(s.subtitle || "")}</text>
    `;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="800" y="70" text-anchor="middle" font-family="Arial" font-size="36" font-weight="700" fill="#1e293b">${esc(title)}</text>
  ${cards}
  <text x="800" y="960" text-anchor="middle" font-family="Arial" font-size="22" fill="#64748b">Cut apart · mix · put in order while you talk · littlelearnershubbyleah.com</text>
</svg>`;
}

/* ---------------- Lesson builders ---------------- */

async function buildPetVet(dir) {
  ensureDir(dir);
  const careSheet = await svgPng(
    cutSheet2x2(
      [
        { title: "Wash", subtitle: "Gently wash the pet", icon: "wash", accent: "#0284c7", tip: "Point to choose", panel: "#e0f2fe" },
        { title: "Brush", subtitle: "Brush soft fur", icon: "brush", accent: "#a16207", tip: "Point to choose", panel: "#fef3c7" },
        { title: "Feed", subtitle: "Offer pretend food", icon: "feed", accent: "#ea580c", tip: "Point to choose", panel: "#ffedd5" },
        { title: "Listen", subtitle: "Listen to the heart", icon: "listen", accent: "#64748b", tip: "Point to choose", panel: "#f1f5f9" },
      ],
      { sheetTitle: "Pet Care Action Cards (sheet 1) — cut apart" },
    ),
    1200,
    1600,
  );
  const careSheet2 = await svgPng(
    cutSheet2x2(
      [
        { title: "Rest", subtitle: "Quiet cuddle time", icon: "rest", accent: "#db2777", tip: "Point to choose", panel: "#fce7f3" },
        { title: "Wash", subtitle: "Gently wash the pet", icon: "wash", accent: "#0284c7", tip: "Extra set", panel: "#e0f2fe" },
        { title: "Feed", subtitle: "Offer pretend food", icon: "feed", accent: "#ea580c", tip: "Extra set", panel: "#ffedd5" },
        { title: "Brush", subtitle: "Brush soft fur", icon: "brush", accent: "#a16207", tip: "Extra set", panel: "#fef3c7" },
      ],
      { sheetTitle: "Pet Care Action Cards (sheet 2) — cut apart" },
    ),
    1200,
    1600,
  );
  await savePdf(
    [
      async (pdf) => addPortraitPage(pdf, careSheet, "Pet Care Action Cards", "Bath · groom · feed · exam — child points to choose the next care action"),
      async (pdf) => addPortraitPage(pdf, careSheet2, "Pet Care Action Cards", "Extra care cards for multiple centers"),
    ],
    path.join(dir, "pet-care-action-cards.pdf"),
  );

  const pets = await svgPng(
    cutSheet2x2(
      [
        { title: "Dog", subtitle: "Woof · soft friend", icon: "dog", accent: "#78716c", tip: "Name · match · adopt", panel: "#f5f5f4" },
        { title: "Cat", subtitle: "Meow · soft friend", icon: "cat", accent: "#d97706", tip: "Name · match · adopt", panel: "#fffbeb" },
        { title: "Bird", subtitle: "Chirp · soft friend", icon: "bird", accent: "#0284c7", tip: "Name · match · adopt", panel: "#e0f2fe" },
        { title: "Fish", subtitle: "Swim · soft friend", icon: "fish", accent: "#0891b2", tip: "Name · match · adopt", panel: "#cffafe" },
      ],
      { sheetTitle: "Pet Friend Picture Cards (sheet 1)" },
    ),
    1200,
    1600,
  );
  const pets2 = await svgPng(
    cutSheet2x2(
      [
        { title: "Rabbit", subtitle: "Hop · soft friend", icon: "rabbit", accent: "#a8a29e", tip: "Name · match · adopt", panel: "#f5f5f4" },
        { title: "Dog", subtitle: "Extra dog card", icon: "dog", accent: "#78716c", tip: "Extra set", panel: "#f5f5f4" },
        { title: "Cat", subtitle: "Extra cat card", icon: "cat", accent: "#d97706", tip: "Extra set", panel: "#fffbeb" },
        { title: "Bird", subtitle: "Extra bird card", icon: "bird", accent: "#0284c7", tip: "Extra set", panel: "#e0f2fe" },
      ],
      { sheetTitle: "Pet Friend Picture Cards (sheet 2)" },
    ),
    1200,
    1600,
  );
  await savePdf(
    [
      async (pdf) => addPortraitPage(pdf, pets, "Pet Friend Picture Cards", "Meet the Pets · Animal Investigation · Adoption Center"),
      async (pdf) => addPortraitPage(pdf, pets2, "Pet Friend Picture Cards", "Extra pet cards for matching/adoption"),
    ],
    path.join(dir, "pet-friend-picture-cards.pdf"),
  );

  const chart = await svgPng(vetChartSvg(), 1200, 1600);
  await savePdf([async (pdf) => addPortraitPage(pdf, chart, "Vet Check Picture Chart", "Vet Examination Station — check eyes, ears, paws, tummy")], path.join(dir, "vet-check-picture-chart.pdf"));

  return [
    { file: "pet-care-action-cards.pdf", title: "Pet Care Action Cards", pages: 2 },
    { file: "pet-friend-picture-cards.pdf", title: "Pet Friend Picture Cards", pages: 2 },
    { file: "vet-check-picture-chart.pdf", title: "Vet Check Picture Chart", pages: 1 },
  ];
}

async function buildZoo(dir) {
  ensureDir(dir);
  const animals = await svgPng(
    cutSheet2x3(
      [
        { title: "Lion", subtitle: "Roar and stretch", icon: "lion", accent: "#f59e0b", panel: "#fffbeb" },
        { title: "Monkey", subtitle: "Climb and swing", icon: "monkey", accent: "#a16207", panel: "#fef3c7" },
        { title: "Giraffe", subtitle: "Reach up high", icon: "giraffe", accent: "#eab308", panel: "#fefce8" },
        { title: "Zebra", subtitle: "Gallop in place", icon: "zebra", accent: "#1f2937", panel: "#f8fafc" },
        { title: "Elephant", subtitle: "Stomp and swing", icon: "elephant", accent: "#64748b", panel: "#f1f5f9" },
        { title: "Fish", subtitle: "Swim arms", icon: "fish", accent: "#06b6d4", panel: "#ecfeff" },
      ],
      { sheetTitle: "Zoo Animal Picture Cards — cut apart for movement & matching" },
    ),
    1200,
    1600,
  );
  await savePdf([async (pdf) => addPortraitPage(pdf, animals, "Zoo Animal Picture Cards", "Discovery · Move Like An Animal · parade")], path.join(dir, "zoo-animal-picture-cards.pdf"));

  const match = await svgPng(
    matchBoardSvg([
      { animal: "Lion", habitat: "Savanna", animalIcon: "lion", habitatIcon: "savanna", color: "#f59e0b" },
      { animal: "Monkey", habitat: "Jungle", animalIcon: "monkey", habitatIcon: "jungle", color: "#16a34a" },
      { animal: "Fish", habitat: "Water", animalIcon: "fish", habitatIcon: "water", color: "#0284c7" },
    ]),
    1200,
    1100,
  );
  await savePdf([async (pdf) => addLandscapePage(pdf, match, "Animal–Habitat Match Cards", "Habitat Matching Game — cut animals and homes, then match")], path.join(dir, "animal-habitat-match-cards.pdf"));

  return [
    { file: "zoo-animal-picture-cards.pdf", title: "Zoo Animal Picture Cards", pages: 1 },
    { file: "animal-habitat-match-cards.pdf", title: "Animal–Habitat Match Cards", pages: 1 },
  ];
}

async function buildCamping(dir) {
  ensureDir(dir);
  const dayNight = await svgPng(
    cutSheet2x2(
      [
        { title: "Sunny Day", subtitle: "Outside play time", icon: "sun", accent: "#f59e0b", panel: "#fffbeb", scale: 1.2 },
        { title: "Camp Evening", subtitle: "Quiet campfire circle", icon: "campfire", accent: "#ea580c", panel: "#1e3a8a", scale: 1.15 },
        { title: "Starry Night", subtitle: "Look for stars", icon: "stars", accent: "#1e3a8a", panel: "#0f172a", scale: 1.1 },
        { title: "Flashlight Look", subtitle: "Battery light only", icon: "flashlight", accent: "#64748b", panel: "#0f172a", scale: 1.1 },
      ],
      { sheetTitle: "Day & Night Scene Cards — cut apart" },
    ),
    1200,
    1600,
  );
  await savePdf([async (pdf) => addPortraitPage(pdf, dayNight, "Day & Night Scene Cards", "Flashlight Exploration · Campfire Story Time")], path.join(dir, "day-night-scene-cards.pdf"));

  const hunt = await svgPng(
    cutSheet2x3(
      [
        { title: "Leaf", subtitle: "Can you find one?", icon: "leaf", accent: "#16a34a", panel: "#f0fdf4" },
        { title: "Pinecone", subtitle: "Can you find one?", icon: "pinecone", accent: "#92400e", panel: "#fff7ed" },
        { title: "Stick", subtitle: "Can you find one?", icon: "stick", accent: "#a16207", panel: "#fef3c7" },
        { title: "Rock", subtitle: "Can you find one?", icon: "rock", accent: "#64748b", panel: "#f1f5f9" },
        { title: "Feather", subtitle: "Can you find one?", icon: "feather", accent: "#7c3aed", panel: "#f5f3ff" },
        { title: "Leaf", subtitle: "Extra leaf card", icon: "leaf", accent: "#16a34a", panel: "#f0fdf4" },
      ],
      { sheetTitle: "Nature Treasure Hunt Cards — cut apart" },
    ),
    1200,
    1600,
  );
  await savePdf([async (pdf) => addPortraitPage(pdf, hunt, "Nature Treasure Hunt Cards", "Match tray items or outdoor finds")], path.join(dir, "nature-treasure-hunt-cards.pdf"));

  const pack = await svgPng(
    cutSheet2x2(
      [
        { title: "Water Bottle", subtitle: "Pack it in the backpack", icon: "bottle", accent: "#0284c7", panel: "#e0f2fe" },
        { title: "Snack", subtitle: "Pack it in the backpack", icon: "snack", accent: "#ea580c", panel: "#ffedd5" },
        { title: "Map", subtitle: "Pack it in the backpack", icon: "mapIcon", accent: "#16a34a", panel: "#f0fdf4" },
        { title: "Flashlight", subtitle: "Pack it in the backpack", icon: "flashIcon", accent: "#ca8a04", panel: "#fefce8" },
      ],
      { sheetTitle: "Pack the Backpack Cards — cut apart" },
    ),
    1200,
    1600,
  );
  await savePdf([async (pdf) => addPortraitPage(pdf, pack, "Pack the Backpack Cards", "Fine-motor packing game")], path.join(dir, "pack-the-backpack-cards.pdf"));

  return [
    { file: "day-night-scene-cards.pdf", title: "Day & Night Scene Cards", pages: 1 },
    { file: "nature-treasure-hunt-cards.pdf", title: "Nature Treasure Hunt Cards", pages: 1 },
    { file: "pack-the-backpack-cards.pdf", title: "Pack the Backpack Cards", pages: 1 },
  ];
}

async function buildPirate(dir) {
  ensureDir(dir);
  const map = await svgPng(treasureMapSvg(), 1400, 1100);
  await savePdf([async (pdf) => addLandscapePage(pdf, map, "Toddler Treasure Map", "Create a Treasure Map · Follow the Treasure Map — stamp/stick treasures, follow dashed path")], path.join(dir, "toddler-treasure-map.pdf"));
  const mat = await svgPng(coinSortSvg(), 1600, 1100);
  const cut = await svgPng(coinCutoutsSvg(), 1600, 1100);
  await savePdf(
    [
      async (pdf) => addLandscapePage(pdf, mat, "Gold Coin Sort Mat", "Gold Coin Sorting — sort big vs little coins"),
      async (pdf) => addLandscapePage(pdf, cut, "Gold Coin Cutouts", "Cut on dashed circles — large toddler pieces only"),
    ],
    path.join(dir, "gold-coin-sort-and-cutouts.pdf"),
  );
  return [
    { file: "toddler-treasure-map.pdf", title: "Toddler Treasure Map", pages: 1 },
    { file: "gold-coin-sort-and-cutouts.pdf", title: "Gold Coin Sort Mat & Cutouts", pages: 2 },
  ];
}

async function buildSuperhero(dir) {
  ensureDir(dir);
  const missions = await svgPng(
    cutSheet2x3(
      [
        { title: "Help Carry", subtitle: "Carry a toy for a friend", icon: "carry", accent: "#dc2626", panel: "#fef2f2" },
        { title: "Share a Turn", subtitle: "Offer a turn with a toy", icon: "share", accent: "#2563eb", panel: "#eff6ff" },
        { title: "Clean Up", subtitle: "Put one toy away", icon: "cleanup", accent: "#16a34a", panel: "#f0fdf4" },
        { title: "Cheer a Friend", subtitle: "Clap for a friend", icon: "cheer", accent: "#a855f7", panel: "#faf5ff" },
        { title: "Gentle Hands", subtitle: "Soft hands with friends", icon: "gentle", accent: "#ea580c", panel: "#fff7ed" },
        { title: "Help Carry", subtitle: "Extra mission card", icon: "carry", accent: "#dc2626", panel: "#fef2f2" },
      ],
      { sheetTitle: "Kindness Mission Cards — cut apart (helping, not fighting)" },
    ),
    1200,
    1600,
  );
  await savePdf([async (pdf) => addPortraitPage(pdf, missions, "Kindness Mission Cards", "Circle time + helping missions · rescue play")], path.join(dir, "kindness-mission-cards.pdf"));

  const moves = await svgPng(
    cutSheet2x3(
      [
        { title: "Stretch Tall", subtitle: "Reach like a hero", icon: "stretch", accent: "#2563eb", panel: "#eff6ff" },
        { title: "Jump Soft", subtitle: "Quiet jump", icon: "jump", accent: "#16a34a", panel: "#f0fdf4" },
        { title: "Tiptoe", subtitle: "Quiet feet", icon: "tiptoe", accent: "#db2777", panel: "#fdf2f8" },
        { title: "Freeze", subtitle: "Statue still", icon: "freeze", accent: "#ca8a04", panel: "#fefce8" },
        { title: "Fly Arms", subtitle: "Arms out wide", icon: "fly", accent: "#7c3aed", panel: "#f5f3ff" },
        { title: "Stretch Tall", subtitle: "Extra move card", icon: "stretch", accent: "#2563eb", panel: "#eff6ff" },
      ],
      { sheetTitle: "Hero Movement Action Cards — cut apart" },
    ),
    1200,
    1600,
  );
  await savePdf([async (pdf) => addPortraitPage(pdf, moves, "Hero Movement Action Cards", "Obstacle course and hero movement dance")], path.join(dir, "hero-movement-action-cards.pdf"));

  const badge = await svgPng(badgeTemplateSvg(), 1200, 1200);
  await savePdf([async (pdf) => addPortraitPage(pdf, badge, "Super Badge Emblem Template", "Super Badge Creation · Hero Medal — decorate then cut")], path.join(dir, "super-badge-emblem-template.pdf"));

  return [
    { file: "kindness-mission-cards.pdf", title: "Kindness Mission Cards", pages: 1 },
    { file: "hero-movement-action-cards.pdf", title: "Hero Movement Action Cards", pages: 1 },
    { file: "super-badge-emblem-template.pdf", title: "Super Badge Emblem Template", pages: 1 },
  ];
}

async function buildApplesKitchen(dir) {
  ensureDir(dir);
  const recipe = await svgPng(recipeSvg(), 1200, 1600);
  await savePdf([async (pdf) => addPortraitPage(pdf, recipe, "Applesauce Picture Recipe", "Make Homemade Applesauce · Mash the Apples")], path.join(dir, "applesauce-picture-recipe.pdf"));
  const menu = await svgPng(cafeMenuSvg(), 1200, 1600);
  const tickets = await svgPng(orderTicketsSvg(), 1200, 1600);
  await savePdf(
    [
      async (pdf) => addPortraitPage(pdf, menu, "Apple Juice Café Menu", "Apple Juice Café dramatic play"),
      async (pdf) => addPortraitPage(pdf, tickets, "Café Order Tickets", "Cut apart — children hand tickets to café helper"),
    ],
    path.join(dir, "apple-juice-cafe-menu-and-tickets.pdf"),
  );
  const mat = await svgPng(sortMatSvg(), 1600, 1100);
  const cut = await svgPng(appleCutoutsSvg(), 1600, 1100);
  await savePdf(
    [
      async (pdf) => addLandscapePage(pdf, mat, "Apple Color Sort Mat", "Dramatic play / measuring center — sort red, green, yellow apples"),
      async (pdf) => addLandscapePage(pdf, cut, "Apple Cutouts", "Cut on dashed edges — large toddler pieces for sorting"),
    ],
    path.join(dir, "apple-color-sort-mat-and-cutouts.pdf"),
  );
  return [
    { file: "applesauce-picture-recipe.pdf", title: "Applesauce Picture Recipe", pages: 1 },
    { file: "apple-juice-cafe-menu-and-tickets.pdf", title: "Apple Juice Café Menu & Order Tickets", pages: 2 },
    { file: "apple-color-sort-mat-and-cutouts.pdf", title: "Apple Color Sort Mat & Cutouts", pages: 2 },
  ];
}

async function buildJohnny(dir) {
  ensureDir(dir);
  const cycle = await svgPng(
    sequenceStripSvg(
      [
        { title: "Seed", subtitle: "Tiny beginning", icon: "seed", accent: "#92400e", panel: "#fff7ed" },
        { title: "Sprout", subtitle: "Peeking up", icon: "sprout", accent: "#15803d", panel: "#f0fdf4" },
        { title: "Tree", subtitle: "Growing tall", icon: "tree", accent: "#166534", panel: "#dcfce7" },
        { title: "Apple", subtitle: "Ready to pick", icon: "apple", accent: "#dc2626", panel: "#fef2f2" },
      ],
      "Apple Tree Life Cycle — cut apart, then put in order",
    ),
    1600,
    1000,
  );
  await savePdf([async (pdf) => addLandscapePage(pdf, cycle, "Apple Tree Life Cycle Sequence Cards", "Life Cycle Sequencing · Friday review")], path.join(dir, "apple-tree-life-cycle-sequence-cards.pdf"));

  const plant = await svgPng(
    sequenceStripSvg(
      [
        { title: "Seed", subtitle: "Place the seed", icon: "seed", accent: "#a16207", panel: "#fff7ed" },
        { title: "Cover", subtitle: "Cover with soil", icon: "soil", accent: "#92400e", panel: "#fef3c7" },
        { title: "Water", subtitle: "Tiny drip drip", icon: "waterDrop", accent: "#0284c7", panel: "#e0f2fe" },
        { title: "Grow", subtitle: "Watch and wait", icon: "sprout", accent: "#16a34a", panel: "#f0fdf4" },
      ],
      "Planting Steps — cut apart for the planting table",
    ),
    1600,
    1000,
  );
  await savePdf([async (pdf) => addLandscapePage(pdf, plant, "Planting Steps Cards", "Plant Your Own Apple Seed")], path.join(dir, "planting-steps-cards.pdf"));

  const tree = await svgPng(countingTreeSvg(), 1400, 1100);
  const apples = await svgPng(appleCutoutsSvg(), 1600, 1100);
  await savePdf(
    [
      async (pdf) => addLandscapePage(pdf, tree, "Apple Tree Counting Mat", "Count the Apples on the Tree · Orchard Counting Challenge"),
      async (pdf) => addLandscapePage(pdf, apples, "Apple Cutouts for Counting", "Cut large apples — place on tree mat and count together"),
    ],
    path.join(dir, "apple-tree-counting-mat-and-cutouts.pdf"),
  );
  return [
    { file: "apple-tree-life-cycle-sequence-cards.pdf", title: "Apple Tree Life Cycle Sequence Cards", pages: 1 },
    { file: "planting-steps-cards.pdf", title: "Planting Steps Cards", pages: 1 },
    { file: "apple-tree-counting-mat-and-cutouts.pdf", title: "Apple Tree Counting Mat & Cutouts", pages: 2 },
  ];
}

const LESSONS = {
  "cur-lp-toddler-pet-vet-clinic": { key: "pet-vet", build: buildPetVet, folder: "toddler-pet-vet-clinic" },
  "cur-lp-toddler-zoo-adventures": { key: "zoo", build: buildZoo, folder: "toddler-zoo-adventures" },
  "cur-lp-toddler-camping-under-the-stars": { key: "camping", build: buildCamping, folder: "toddler-camping-under-the-stars" },
  "cur-lp-toddler-pirate-adventure": { key: "pirate", build: buildPirate, folder: "toddler-pirate-adventure" },
  "cur-lp-toddler-superhero-training-camp": { key: "superhero", build: buildSuperhero, folder: "toddler-superhero-training-camp" },
  "cur-lp-toddler-apples-in-the-kitchen": { key: "apples", build: buildApplesKitchen, folder: "toddler-apples-in-the-kitchen" },
  "cur-lp-toddler-johnny-appleseed-apple-fun": { key: "johnny", build: buildJohnny, folder: "toddler-johnny-appleseed-apple-fun" },
};

async function buildAll() {
  const results = [];
  for (const [lessonId, meta] of Object.entries(LESSONS)) {
    const dir = path.join(OUT, meta.folder);
    const files = await meta.build(dir);
    files.forEach((f) => results.push({ lessonId, ...f, filePath: path.join(dir, f.file) }));
    console.log("built", lessonId, files.map((f) => f.title).join(" | "));
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  return results;
}

module.exports = { buildAll, LESSONS, OUT };

if (require.main === module) {
  buildAll().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * Build draft printable PDFs (cartoon-simple, classroom-friendly) with pdf-lib + sharp.
 * Resources are created as status: draft only.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "../../..");
const OUT_DIR = path.join(ROOT, "curriculum-drafts/teaching-kits-premium/printables");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function svgToPng(svg, width, height) {
  return sharp(Buffer.from(svg))
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

function bwPatternSvg(kind, size = 512) {
  if (kind === "stripes") {
    const bars = Array.from({ length: 8 }, (_, i) => {
      const y = i * (size / 8);
      return `<rect x="0" y="${y}" width="${size}" height="${size / 16}" fill="#111"/>`;
    }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/>${bars}</svg>`;
  }
  if (kind === "dots") {
    const dots = [];
    for (let y = 40; y < size; y += 80) {
      for (let x = 40; x < size; x += 80) {
        dots.push(`<circle cx="${x}" cy="${y}" r="22" fill="#111"/>`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/>${dots.join("")}</svg>`;
  }
  if (kind === "bullseye") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/><circle cx="256" cy="256" r="200" fill="none" stroke="#111" stroke-width="28"/><circle cx="256" cy="256" r="130" fill="none" stroke="#111" stroke-width="28"/><circle cx="256" cy="256" r="60" fill="#111"/></svg>`;
  }
  if (kind === "checker") {
    const cells = [];
    const n = 6;
    const cell = size / n;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if ((r + c) % 2 === 0) {
          cells.push(`<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#111"/>`);
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/>${cells.join("")}</svg>`;
  }
  // face
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/><circle cx="256" cy="256" r="200" fill="none" stroke="#111" stroke-width="16"/><circle cx="190" cy="220" r="22" fill="#111"/><circle cx="322" cy="220" r="22" fill="#111"/><path d="M180 320 Q256 380 332 320" fill="none" stroke="#111" stroke-width="16" stroke-linecap="round"/></svg>`;
}

function colorCardSvg(color, label, size = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="${color}"/>
  <rect x="24" y="24" width="${size - 48}" height="${size - 48}" fill="none" stroke="#fff" stroke-width="10" opacity="0.7"/>
  <text x="50%" y="92%" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="#111" stroke="#fff" stroke-width="4" paint-order="stroke">${label}</text>
</svg>`;
}

function weatherIconSvg(kind) {
  if (kind === "sunny") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="#fff8e7"/><circle cx="128" cy="128" r="48" fill="#f5b700"/><g stroke="#f5b700" stroke-width="10" stroke-linecap="round"><line x1="128" y1="20" x2="128" y2="50"/><line x1="128" y1="206" x2="128" y2="236"/><line x1="20" y1="128" x2="50" y2="128"/><line x1="206" y1="128" x2="236" y2="128"/><line x1="48" y1="48" x2="70" y2="70"/><line x1="186" y1="186" x2="208" y2="208"/><line x1="208" y1="48" x2="186" y2="70"/><line x1="70" y1="186" x2="48" y2="208"/></g></svg>`;
  }
  if (kind === "rainy") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="#eef6ff"/><ellipse cx="128" cy="110" rx="70" ry="40" fill="#8aa4c2"/><ellipse cx="90" cy="120" rx="40" ry="28" fill="#8aa4c2"/><ellipse cx="170" cy="120" rx="40" ry="28" fill="#8aa4c2"/><g stroke="#3b82c4" stroke-width="8" stroke-linecap="round"><line x1="90" y1="170" x2="80" y2="210"/><line x1="128" y1="170" x2="118" y2="210"/><line x1="166" y1="170" x2="156" y2="210"/></g></svg>`;
  }
  if (kind === "cloudy") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="#f3f4f6"/><ellipse cx="130" cy="140" rx="80" ry="45" fill="#9ca3af"/><ellipse cx="95" cy="130" rx="45" ry="35" fill="#9ca3af"/><ellipse cx="170" cy="130" rx="50" ry="35" fill="#9ca3af"/></svg>`;
  }
  if (kind === "windy") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="#ecfeff"/><path d="M40 90 Q120 40 220 90" fill="none" stroke="#0891b2" stroke-width="12" stroke-linecap="round"/><path d="M30 140 Q130 100 230 150" fill="none" stroke="#06b6d4" stroke-width="12" stroke-linecap="round"/><path d="M50 190 Q140 150 210 195" fill="none" stroke="#0891b2" stroke-width="12" stroke-linecap="round"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="#f5f3ff"/><path d="M60 170 L120 60 L180 170 Z" fill="#6366f1"/><line x1="150" y1="80" x2="200" y2="40" stroke="#f59e0b" stroke-width="10" stroke-linecap="round"/></svg>`;
}

function helperIconSvg(label) {
  const colors = {
    Firefighter: "#ef4444",
    Nurse: "#22c55e",
    "Mail Carrier": "#3b82f6",
    Librarian: "#a855f7",
    Builder: "#f59e0b",
    "Grocery Helper": "#14b8a6",
    "Sanitation Worker": "#64748b",
    Teacher: "#e11d48",
  };
  const fill = colors[label] || "#0ea5e9";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640">
  <rect width="100%" height="100%" fill="#fffaf5"/>
  <rect x="36" y="36" width="440" height="568" rx="28" fill="${fill}" opacity="0.15" stroke="${fill}" stroke-width="8"/>
  <circle cx="256" cy="220" r="90" fill="${fill}"/>
  <rect x="150" y="320" width="212" height="180" rx="40" fill="${fill}"/>
  <text x="256" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="#1f2937">${label}</text>
</svg>`;
}

async function addImagePage(pdf, pngBuffer, title, subtitle) {
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(pngBuffer);
  const maxW = 480;
  const maxH = 520;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawText("Little Learner Hub — DRAFT Printable", {
    x: 48, y: 752, size: 12, font: fontReg, color: rgb(0.35, 0.3, 0.45),
  });
  page.drawText(title, { x: 48, y: 720, size: 18, font, color: rgb(0.15, 0.12, 0.25) });
  if (subtitle) {
    page.drawText(subtitle, { x: 48, y: 698, size: 11, font: fontReg, color: rgb(0.3, 0.3, 0.35) });
  }
  page.drawRectangle({
    x: (612 - w) / 2 - 8,
    y: 120 - 8,
    width: w + 16,
    height: h + 16,
    borderColor: rgb(0.85, 0.82, 0.9),
    borderWidth: 1,
  });
  page.drawImage(image, { x: (612 - w) / 2, y: 120, width: w, height: h });
  page.drawText("Cut on edges as needed · Draft for owner review · Not published", {
    x: 48, y: 64, size: 10, font: fontReg, color: rgb(0.4, 0.4, 0.45),
  });
}

async function buildPdfFromPages(pageBuilders, outPath) {
  const pdf = await PDFDocument.create();
  for (const builder of pageBuilders) {
    await builder(pdf);
  }
  const bytes = await pdf.save();
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, bytes);
  return outPath;
}

async function buildBlackWhitePrintables() {
  const dir = path.join(OUT_DIR, "black-white-discovery");
  ensureDir(dir);
  const patterns = ["stripes", "dots", "bullseye", "checker", "face"];
  const cardsPath = path.join(dir, "high-contrast-pattern-and-face-cards.pdf");
  await buildPdfFromPages(
    patterns.map((kind) => async (pdf) => {
      const png = await svgToPng(bwPatternSvg(kind), 1024, 1024);
      await addImagePage(pdf, png, `High-Contrast Card — ${kind}`, "Hold 8–12 inches from infant · one card at a time");
    }),
    cardsPath,
  );

  // Tummy strip as wide page of patterns
  const stripSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400">
    <rect width="100%" height="100%" fill="#fff"/>
    <rect x="40" y="40" width="280" height="320" fill="#111"/>
    <g fill="#fff">${Array.from({ length: 8 }, (_, i) => `<rect x="60" y="${60 + i * 36}" width="240" height="16"/>`).join("")}</g>
    <circle cx="560" cy="200" r="120" fill="none" stroke="#111" stroke-width="24"/>
    <circle cx="560" cy="200" r="60" fill="#111"/>
    <g>${Array.from({ length: 16 }, (_, i) => {
    const x = 760 + (i % 4) * 70;
    const y = 80 + Math.floor(i / 4) * 70;
    return `<circle cx="${x}" cy="${y}" r="22" fill="#111"/>`;
  }).join("")}</g>
    <g>${Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => ((r + c) % 2 === 0 ? `<rect x="${1200 + c * 70}" y="${80 + r * 70}" width="70" height="70" fill="#111"/>` : "")).join("")).join("")}</g>
  </svg>`;
  const stripPng = await svgToPng(stripSvg, 1600, 400);
  const stripPath = path.join(dir, "tummy-time-visual-strip.pdf");
  await buildPdfFromPages([
    async (pdf) => {
      const page = pdf.addPage([792, 612]);
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
      const image = await pdf.embedPng(stripPng);
      page.drawText("Tummy-Time Visual Strip — DRAFT", { x: 36, y: 560, size: 18, font, color: rgb(0.1, 0.1, 0.15) });
      page.drawText("Place at eye level during supervised tummy time. Your face belongs beside it.", {
        x: 36, y: 536, size: 11, font: fontReg, color: rgb(0.3, 0.3, 0.35),
      });
      page.drawImage(image, { x: 36, y: 160, width: 720, height: 180 });
      page.drawText("Little Learner Hub · Draft printable · Not published", {
        x: 36, y: 48, size: 10, font: fontReg, color: rgb(0.4, 0.4, 0.45),
      });
    },
  ], stripPath);

  return [
    { id: "cur-res-draft-bw-contrast-cards", title: "High-Contrast Pattern & Face Cards", filePath: cardsPath, pageCount: patterns.length },
    { id: "cur-res-draft-bw-tummy-strip", title: "Tummy-Time Visual Strip", filePath: stripPath, pageCount: 1 },
  ];
}

async function buildColorsPrintables() {
  const dir = path.join(OUT_DIR, "colors-all-around-us");
  ensureDir(dir);
  const colors = [
    ["#e11d48", "RED"],
    ["#2563eb", "BLUE"],
    ["#eab308", "YELLOW"],
    ["#16a34a", "GREEN"],
  ];
  const out = path.join(dir, "bright-color-gaze-cards.pdf");
  await buildPdfFromPages(
    colors.map(([hex, label]) => async (pdf) => {
      const png = await svgToPng(colorCardSvg(hex, label), 1024, 1024);
      await addImagePage(pdf, png, `Bright Color Gaze Card — ${label}`, "One color at a time · narrate · not a naming quiz");
    }),
    out,
  );
  const guide = path.join(dir, "caregiver-color-talk-mini-guide.pdf");
  await buildPdfFromPages([
    async (pdf) => {
      const page = pdf.addPage([612, 792]);
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText("Caregiver Color Talk — Mini Guide (DRAFT)", {
        x: 48, y: 720, size: 18, font, color: rgb(0.15, 0.12, 0.2),
      });
      const tips = [
        "1. Face first — your face is the best early visual.",
        "2. Hold bright cloths 8–12 inches away.",
        "3. Move slower than you think; pause when baby locks on.",
        "4. Name colors playfully — do not expect baby to name them.",
        "5. Stop when baby looks away (that is communication).",
        "6. Younger infants: looking/listening. Older: may reach.",
        "7. No infant crafts this week — experience over product.",
      ];
      tips.forEach((line, i) => {
        page.drawText(line, { x: 48, y: 660 - i * 36, size: 13, font: fontReg, color: rgb(0.2, 0.2, 0.25) });
      });
      page.drawText("Little Learner Hub · Draft · Not published", {
        x: 48, y: 64, size: 10, font: fontReg, color: rgb(0.4, 0.4, 0.45),
      });
    },
  ], guide);
  return [
    { id: "cur-res-draft-color-gaze-cards", title: "Bright Color Gaze Cards", filePath: out, pageCount: colors.length },
    { id: "cur-res-draft-color-talk-guide", title: "Caregiver Color Talk Mini Guide", filePath: guide, pageCount: 1 },
  ];
}

async function buildCommunityPrintables() {
  const dir = path.join(OUT_DIR, "community-helpers");
  ensureDir(dir);
  const helpers = ["Firefighter", "Nurse", "Mail Carrier", "Librarian", "Builder", "Grocery Helper", "Sanitation Worker", "Teacher"];
  const cards = path.join(dir, "community-helper-picture-cards.pdf");
  await buildPdfFromPages(
    helpers.map((label) => async (pdf) => {
      const png = await svgToPng(helperIconSvg(label), 512, 640);
      await addImagePage(pdf, png, `Helper Card — ${label}`, "Anyone can do this job · use for talk & dramatic play");
    }),
    cards,
  );
  const signs = path.join(dir, "helper-place-signs.pdf");
  const places = [
    ["Clinic", "#22c55e", `<circle cx="256" cy="200" r="70" fill="#22c55e"/><rect x="236" y="140" width="40" height="120" fill="#fff"/><rect x="196" y="180" width="120" height="40" fill="#fff"/>`],
    ["Post Office", "#3b82f6", `<rect x="150" y="160" width="212" height="140" rx="16" fill="#3b82f6"/><polygon points="150,160 256,90 362,160" fill="#60a5fa"/><rect x="230" y="220" width="52" height="80" fill="#dbeafe"/>`],
    ["Library", "#a855f7", `<rect x="140" y="140" width="50" height="180" fill="#7c3aed"/><rect x="210" y="140" width="50" height="180" fill="#a855f7"/><rect x="280" y="140" width="50" height="180" fill="#c084fc"/><rect x="130" y="320" width="220" height="24" fill="#581c87"/>`],
    ["Market", "#14b8a6", `<rect x="150" y="180" width="212" height="150" rx="12" fill="#14b8a6"/><circle cx="200" cy="160" r="28" fill="#f97316"/><circle cx="256" cy="150" r="32" fill="#ef4444"/><circle cx="312" cy="162" r="26" fill="#eab308"/>`],
    ["Build Zone", "#f59e0b", `<rect x="170" y="220" width="170" height="110" fill="#f59e0b"/><polygon points="160,220 256,120 352,220" fill="#fbbf24"/><rect x="230" y="260" width="50" height="70" fill="#fff7ed"/>`],
    ["Recycling", "#64748b", `<circle cx="256" cy="220" r="90" fill="none" stroke="#16a34a" stroke-width="22"/><path d="M256 140 L280 190 L232 190 Z" fill="#16a34a"/><path d="M320 250 L270 270 L290 220 Z" fill="#15803d"/><path d="M200 270 L220 220 L250 270 Z" fill="#166534"/>`],
  ];
  await buildPdfFromPages(
    places.map(([place, _accent, art]) => async (pdf) => {
      const page = pdf.addPage([792, 612]);
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
      const icon = await svgToPng(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="400"><rect width="100%" height="100%" fill="#fffaf5"/>${art}</svg>`,
        512,
        400,
      );
      const image = await pdf.embedPng(icon);
      page.drawText("DRAFT Place Sign · Community Helpers", { x: 48, y: 560, size: 12, font: fontReg, color: rgb(0.4, 0.35, 0.45) });
      page.drawRectangle({ x: 80, y: 120, width: 632, height: 400, borderColor: rgb(0.2, 0.2, 0.25), borderWidth: 6, color: rgb(0.98, 0.96, 0.93) });
      page.drawImage(image, { x: 120, y: 220, width: 220, height: 170 });
      page.drawText(place.toUpperCase(), { x: 360, y: 290, size: 40, font, color: rgb(0.15, 0.15, 0.2) });
      page.drawText("Hang at child height in dramatic play", {
        x: 360, y: 250, size: 12, font: fontReg, color: rgb(0.35, 0.35, 0.4),
      });
      page.drawText("Community Helpers dramatic play · Little Learner Hub draft · Not published", {
        x: 48, y: 48, size: 11, font: fontReg, color: rgb(0.4, 0.4, 0.45),
      });
    }),
    signs,
  );
  return [
    { id: "cur-res-draft-helper-cards", title: "Community Helper Picture Cards", filePath: cards, pageCount: helpers.length },
    { id: "cur-res-draft-helper-signs", title: "Helper Place Signs", filePath: signs, pageCount: places.length },
  ];
}

async function buildWeatherPrintables() {
  const dir = path.join(OUT_DIR, "weather-watchers");
  ensureDir(dir);
  const kinds = ["sunny", "rainy", "cloudy", "windy", "stormy"];
  const symbols = path.join(dir, "weather-symbol-cards.pdf");
  await buildPdfFromPages(
    kinds.map((kind) => async (pdf) => {
      const png = await svgToPng(weatherIconSvg(kind), 512, 512);
      await addImagePage(pdf, png, `Weather Symbol — ${kind}`, "Use with class weather chart · preschool observation");
    }),
    symbols,
  );
  const chart = path.join(dir, "weekly-weather-observation-chart.pdf");
  const legendKinds = ["sunny", "cloudy", "rainy", "windy", "stormy"];
  const legendPngs = {};
  for (const kind of legendKinds) {
    legendPngs[kind] = await svgToPng(weatherIconSvg(kind), 128, 128);
  }
  await buildPdfFromPages([
    async (pdf) => {
      const page = pdf.addPage([792, 612]);
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawRectangle({
        x: 0, y: 0, width: 792, height: 612,
        color: rgb(0.93, 0.96, 1),
      });
      page.drawText("Class Weather Chart — Weekly Observation (DRAFT)", {
        x: 36, y: 568, size: 18, font, color: rgb(0.1, 0.18, 0.32),
      });
      page.drawText("Look outside (or through the window). Place today’s Weather Symbol Card in the day box.", {
        x: 36, y: 546, size: 11, font: fontReg, color: rgb(0.25, 0.3, 0.38),
      });
      // Legend strip of cartoon symbols
      let lx = 36;
      for (const kind of legendKinds) {
        const img = await pdf.embedPng(legendPngs[kind]);
        page.drawImage(img, { x: lx, y: 488, width: 40, height: 40 });
        page.drawText(kind, { x: lx + 44, y: 500, size: 10, font: fontReg, color: rgb(0.2, 0.25, 0.35) });
        lx += 148;
      }
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      days.forEach((day, i) => {
        const x = 36 + i * 148;
        page.drawRectangle({
          x, y: 120, width: 140, height: 350,
          borderColor: rgb(0.25, 0.4, 0.55), borderWidth: 2.5,
          color: rgb(1, 1, 1),
        });
        page.drawRectangle({
          x, y: 430, width: 140, height: 40,
          color: rgb(0.78, 0.88, 0.98),
        });
        page.drawText(day, { x: x + 28, y: 444, size: 13, font, color: rgb(0.12, 0.2, 0.32) });
        page.drawText("Today’s weather", { x: x + 16, y: 400, size: 10, font: fontReg, color: rgb(0.3, 0.35, 0.4) });
        page.drawRectangle({
          x: x + 18, y: 250, width: 104, height: 130,
          borderColor: rgb(0.7, 0.78, 0.88), borderWidth: 1.5,
          color: rgb(0.98, 0.99, 1),
        });
        page.drawText("card here", {
          x: x + 40, y: 305, size: 10, font: fontReg, color: rgb(0.55, 0.6, 0.68),
        });
        page.drawText("How does the air feel?", {
          x: x + 12, y: 220, size: 9, font: fontReg, color: rgb(0.3, 0.35, 0.4),
        });
        page.drawText("warm   cool   cold", {
          x: x + 16, y: 190, size: 10, font: fontReg, color: rgb(0.2, 0.25, 0.35),
        });
        page.drawText("What do you notice?", {
          x: x + 12, y: 155, size: 9, font: fontReg, color: rgb(0.3, 0.35, 0.4),
        });
        page.drawLine({
          start: { x: x + 12, y: 140 }, end: { x: x + 128, y: 140 },
          thickness: 1, color: rgb(0.75, 0.8, 0.88),
        });
      });
      page.drawText("Reuse with Weather Symbol Cards · Little Learner Hub draft — not published.", {
        x: 36, y: 48, size: 11, font: fontReg, color: rgb(0.35, 0.4, 0.48),
      });
    },
  ], chart);
  const clothing = path.join(dir, "clothing-for-weather-cards.pdf");
  // Object-only flat-lay clothing (no human/bubble figures — teaching-card rule).
  const clothes = [
    [
      "Sunny",
      "#fff7d6",
      "sun-hat + short sleeves",
      [
        `<ellipse cx="256" cy="150" rx="92" ry="22" fill="#f5b700"/>`,
        `<ellipse cx="256" cy="138" rx="48" ry="16" fill="#fbbf24"/>`,
        `<path d="M190 210 L190 360 Q256 390 322 360 L322 210 Q256 240 190 210 Z" fill="#60a5fa"/>`,
        `<rect x="210" y="250" width="28" height="70" rx="8" fill="#dbeafe"/>`,
        `<rect x="274" y="250" width="28" height="70" rx="8" fill="#dbeafe"/>`,
      ].join(""),
    ],
    [
      "Rainy",
      "#e0f2fe",
      "raincoat + boots",
      [
        `<path d="M168 200 Q256 110 344 200 L344 330 Q256 370 168 330 Z" fill="#38bdf8"/>`,
        `<rect x="236" y="200" width="40" height="130" fill="#7dd3fc"/>`,
        `<rect x="198" y="340" width="44" height="58" rx="10" fill="#1d4ed8"/>`,
        `<rect x="270" y="340" width="44" height="58" rx="10" fill="#1d4ed8"/>`,
        `<ellipse cx="220" cy="398" rx="24" ry="10" fill="#172554"/>`,
        `<ellipse cx="292" cy="398" rx="24" ry="10" fill="#172554"/>`,
      ].join(""),
    ],
    [
      "Cold",
      "#ede9fe",
      "coat + mittens",
      [
        `<path d="M176 170 Q256 130 336 170 L352 360 Q256 400 160 360 Z" fill="#7c3aed"/>`,
        `<rect x="236" y="190" width="40" height="150" fill="#a78bfa"/>`,
        `<rect x="140" y="250" width="48" height="56" rx="16" fill="#c4b5fd"/>`,
        `<rect x="324" y="250" width="48" height="56" rx="16" fill="#c4b5fd"/>`,
        `<circle cx="164" cy="278" r="8" fill="#ede9fe"/>`,
        `<circle cx="348" cy="278" r="8" fill="#ede9fe"/>`,
      ].join(""),
    ],
    [
      "Windy",
      "#cffafe",
      "light jacket + scarf",
      [
        `<path d="M48 130 Q170 80 320 140" fill="none" stroke="#0891b2" stroke-width="10" stroke-linecap="round"/>`,
        `<path d="M80 170 Q210 120 360 175" fill="none" stroke="#22d3ee" stroke-width="7" stroke-linecap="round"/>`,
        `<path d="M188 190 Q256 160 324 190 L340 350 Q256 385 172 350 Z" fill="#06b6d4"/>`,
        `<path d="M210 210 Q256 250 302 210" fill="none" stroke="#a5f3fc" stroke-width="18" stroke-linecap="round"/>`,
        `<path d="M302 214 Q360 240 380 300" fill="none" stroke="#67e8f9" stroke-width="14" stroke-linecap="round"/>`,
      ].join(""),
    ],
  ];
  await buildPdfFromPages(
    clothes.map(([label, fill, hint, art]) => async (pdf) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="${fill}"/><rect x="24" y="24" width="464" height="464" rx="28" fill="none" stroke="#334155" stroke-width="6"/>${art}<text x="50%" y="88%" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="#0f172a">${label}</text><text x="50%" y="95%" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#334155">${hint}</text></svg>`;
      const png = await svgToPng(svg, 512, 512);
      await addImagePage(pdf, png, `Clothing for Weather — ${label}`, "Match dress-up gear to the weather card");
    }),
    clothing,
  );
  return [
    { id: "cur-res-draft-weather-symbols", title: "Weather Symbol Cards", filePath: symbols, pageCount: kinds.length },
    { id: "cur-res-draft-weather-chart", title: "Weekly Weather Observation Chart", filePath: chart, pageCount: 1 },
    { id: "cur-res-draft-weather-clothing", title: "Clothing for Weather Cards", filePath: clothing, pageCount: clothes.length },
  ];
}

async function buildAllPrintables() {
  ensureDir(OUT_DIR);
  const byKit = {
    "cur-lp-infant-black-white-discovery": await buildBlackWhitePrintables(),
    "cur-lp-infant-colors-all-around-us": await buildColorsPrintables(),
    "cur-lp-preschool-community-helpers": await buildCommunityPrintables(),
    "cur-lp-preschool-weather-watchers": await buildWeatherPrintables(),
  };
  return byKit;
}

module.exports = {
  OUT_DIR,
  buildAllPrintables,
  buildBlackWhitePrintables,
  buildColorsPrintables,
  buildCommunityPrintables,
  buildWeatherPrintables,
};

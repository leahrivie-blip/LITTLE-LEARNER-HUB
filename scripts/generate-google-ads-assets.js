#!/usr/bin/env node
"use strict";

// Generates standalone, upload-ready Google Ads creatives from privacy-safe
// Little Learner Hub demo material. It does not touch curriculum or site UI.
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "images", "google-ads");
const source = (file) => path.join(root, file);
const brand = {
  navy: "#17335f",
  purple: "#6846c7",
  lavender: "#f1edff",
  blue: "#5b9bd5",
  ink: "#1e2f4d",
  muted: "#64748b",
  cream: "#fffdf8",
  line: "#ded9ee"
};

const variants = [
  { name: "landscape", width: 1200, height: 628 },
  { name: "square", width: 1200, height: 1200 }
];

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
}[char]));

function svg(width, height, body) {
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${brand.cream}"/>
    ${body}
  </svg>`);
}

function text(x, y, value, size, weight = 500, color = brand.ink, anchor = "start") {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(value)}</text>`;
}

function label(x, y, value) {
  return `${text(x, y, value.toUpperCase(), 17, 700, brand.purple)}<rect x="${x}" y="${y + 12}" width="58" height="4" rx="2" fill="#f7bb44"/>`;
}

function footer(width, height) {
  return `${text(52, height - 34, "Little Learner Hub", 20, 700, brand.navy)}
    ${text(width - 52, height - 34, "littlelearnershubbyleah.com", 17, 600, brand.muted, "end")}`;
}

function roundedImage(file, left, top, width, height, radius = 22) {
  return sharp(source(file))
    .resize(width, height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer()
    .then((input) => ({
      input,
      top,
      left,
      blend: "over"
    }));
}

function card(x, y, width, height) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22" fill="#fff" stroke="${brand.line}" stroke-width="2"/>`;
}

function line(x, y, width, color = brand.line) {
  return `<rect x="${x}" y="${y}" width="${width}" height="8" rx="4" fill="${color}"/>`;
}

async function makeHero(width, height) {
  const square = height > 800;
  const screenshot = square
    ? { x: 78, y: 570, w: 1044, h: 500 }
    : { x: 610, y: 72, w: 540, h: 424 };
  const headingX = square ? 76 : 74;
  const headingY = square ? 170 : 158;
  const body = `${label(headingX, headingY - 68, "Weekly lesson planning")}
    ${text(headingX, headingY, "Your whole week", square ? 64 : 48, 800)}
    ${text(headingX, headingY + 70, "planned before Monday.", square ? 64 : 40, 800)}
    ${text(headingX, headingY + 124, "Ready-to-use lessons, activities, and printables", 23, 500, brand.muted)}
    <rect x="${headingX}" y="${headingY + 158}" width="238" height="52" rx="26" fill="${brand.purple}"/>
    ${text(headingX + 119, headingY + 192, "Explore the library", 18, 700, "#fff", "middle")}
    ${card(screenshot.x - 12, screenshot.y - 12, screenshot.w + 24, screenshot.h + 24)}
    ${footer(width, height)}`;
  const image = await roundedImage("mockups/lesson-cover-redesign/screenshots/final-library-desktop.png", screenshot.x, screenshot.y, screenshot.w, screenshot.h);
  await sharp(svg(width, height, body)).composite([image]).png().toFile(path.join(output, `01-hero-product-${width}x${height}.png`));
}

async function makeLessonPlan(width, height) {
  const square = height > 800;
  const x = square ? 68 : 60;
  const y = square ? 390 : 160;
  const planWidth = square ? 1064 : 660;
  const dayWidth = Math.floor((planWidth - 84) / 5);
  const days = ["MON", "TUE", "WED", "THU", "FRI"];
  let planner = `${card(x, y, planWidth, square ? 598 : 340)}
    ${text(x + 34, y + 54, "Community Helpers • Preschool", 25, 800)}
    ${text(x + 34, y + 88, "A complete, classroom-ready week", 18, 500, brand.muted)}`;
  days.forEach((day, index) => {
    const dx = x + 34 + index * (dayWidth + 4);
    planner += `<rect x="${dx}" y="${y + 122}" width="${dayWidth}" height="${square ? 388 : 172}" rx="13" fill="${index === 0 ? brand.lavender : "#f9fafc"}" stroke="${brand.line}"/>
      ${text(dx + 16, y + 152, day, 16, 800, brand.purple)}
      ${text(dx + 16, y + 188, ["Read", "Create", "Explore", "Move", "Reflect"][index], 18, 700)}
      ${line(dx + 16, y + 210, dayWidth - 32)}
      ${line(dx + 16, y + 234, dayWidth - 54, "#ece8f8")}
      ${line(dx + 16, y + 258, dayWidth - 43, "#ece8f8")}
      ${square ? `${line(dx + 16, y + 302, dayWidth - 32)}${line(dx + 16, y + 326, dayWidth - 54, "#ece8f8")}` : ""}`;
  });
  const body = `${label(x, square ? 94 : 76, "Actual weekly planning")}
    ${text(x, square ? 166 : 142, "Five days of meaningful learning.", square ? 54 : 45, 800)}
    ${text(x, square ? 215 : 184, "Plans that make your classroom week feel doable.", 22, 500, brand.muted)}
    ${planner}${footer(width, height)}`;
  await sharp(svg(width, height, body)).png().toFile(path.join(output, `02-lesson-plan-week-${width}x${height}.png`));
}

async function makePrintables(width, height) {
  const square = height > 800;
  const preview = square
    ? { x: 190, y: 474, w: 820, h: 633 }
    : { x: 624, y: 56, w: 510, h: 460 };
  const body = `${label(square ? 76 : 72, square ? 98 : 100, "Print-ready classroom tools")}
    ${text(square ? 76 : 72, square ? 170 : 166, "Printables made for", square ? 60 : 51, 800)}
    ${text(square ? 76 : 72, square ? 238 : 222, "your real week.", square ? 60 : 51, 800)}
    ${text(square ? 76 : 72, square ? 292 : 270, "Weekly planners and classroom-ready resources", 22, 500, brand.muted)}
    <rect x="${preview.x - 12}" y="${preview.y - 12}" width="${preview.w + 24}" height="${preview.h + 24}" rx="22" fill="#fff" stroke="${brand.line}" stroke-width="2"/>
    ${footer(width, height)}`;
  const image = await roundedImage("mockups/teacher-weekly-planner/page-1.png", preview.x, preview.y, preview.w, preview.h);
  await sharp(svg(width, height, body)).composite([image]).png().toFile(path.join(output, `03-printables-${width}x${height}.png`));
}

async function makeActivity(width, height) {
  const square = height > 800;
  const image = square
    ? { x: 72, y: 398, w: 1056, h: 528 }
    : { x: 580, y: 58, w: 570, h: 456 };
  const body = `${label(square ? 74 : 72, square ? 96 : 92, "Classroom activity ideas")}
    ${text(square ? 74 : 72, square ? 166 : 152, "Real themes. Ready to teach.", square ? 51 : 42, 800)}
    ${text(square ? 74 : 72, square ? 218 : 198, "From dramatic play to hands-on discovery.", 22, 500, brand.muted)}
    ${card(image.x - 12, image.y - 12, image.w + 24, image.h + 24)}
    <rect x="${image.x + 22}" y="${image.y + image.h - 80}" width="248" height="54" rx="27" fill="#fff"/>
    ${text(image.x + 146, image.y + image.h - 46, "Community Helpers", 18, 800, brand.navy, "middle")}
    ${footer(width, height)}`;
  const photo = await roundedImage("images/lesson-covers/community-helpers.jpg", image.x, image.y, image.w, image.h);
  await sharp(svg(width, height, body)).composite([photo]).png().toFile(path.join(output, `04-classroom-activity-${width}x${height}.png`));
}

async function makeFeatures(width, height) {
  const square = height > 800;
  const x = 70;
  const y = square ? 298 : 188;
  const cardW = square ? 1060 : 338;
  const cardH = square ? 190 : 274;
  const spacing = square ? 18 : 24;
  const labels = [
    ["LESSON PLANS", "Plan a full week"],
    ["PRINTABLES", "Print what you need"],
    ["CLASSROOM TOOLS", "Keep your day moving"]
  ];
  let panels = "";
  labels.forEach((item, index) => {
    const px = square ? x : x + index * (cardW + spacing);
    const py = square ? y + index * (cardH + spacing) : y;
    panels += `${card(px, py, cardW, cardH)}
      <rect x="${px + 24}" y="${py + 26}" width="${square ? 142 : 70}" height="${square ? 138 : 90}" rx="14" fill="${index === 0 ? "#e4f0fc" : index === 1 ? "#f1edff" : "#eef8f2"}"/>
      ${text(px + (square ? 194 : 112), py + 72, item[0], 15, 800, brand.purple)}
      ${text(px + (square ? 194 : 112), py + 112, item[1], square ? 30 : 22, 800)}
      ${square ? text(px + 194, py + 148, ["Lessons for infant, toddler, and preschool.", "Weekly planners built for classroom routines.", "Tools to support your daily documentation."][index], 17, 500, brand.muted) : ""}`;
  });
  const body = `${label(70, square ? 94 : 72, "Everything in one place")}
    ${text(70, square ? 166 : 138, "A calmer way to run your classroom.", square ? 52 : 41, 800)}
    ${text(70, square ? 214 : 178, "Plan, print, and teach with Little Learner Hub.", 22, 500, brand.muted)}
    ${panels}${footer(width, height)}`;
  await sharp(svg(width, height, body)).png().toFile(path.join(output, `05-product-features-${width}x${height}.png`));
}

async function makeStartFree(width, height) {
  const square = height > 800;
  const cover = square
    ? { x: 166, y: 502, w: 868, h: 434 }
    : { x: 660, y: 70, w: 482, h: 386 };
  const x = square ? 76 : 74;
  const body = `${label(x, square ? 98 : 100, "Little Learner Hub")}
    ${text(x, square ? 176 : 168, "Start free.", square ? 66 : 58, 800)}
    ${text(x, square ? 248 : 236, "Start prepared.", square ? 66 : 58, 800)}
    ${text(x, square ? 306 : 286, "10 complete starter plans", 23, 800, brand.purple)}
    ${text(x, square ? 342 : 322, "No credit card required", 21, 500, brand.muted)}
    <rect x="${x}" y="${square ? 378 : 360}" width="190" height="52" rx="26" fill="${brand.purple}"/>
    ${text(x + 95, square ? 412 : 394, "Start free", 18, 800, "#fff", "middle")}
    ${card(cover.x - 12, cover.y - 12, cover.w + 24, cover.h + 24)}
    ${footer(width, height)}`;
  const image = await roundedImage("images/lesson-covers/all-about-me.jpg", cover.x, cover.y, cover.w, cover.h);
  await sharp(svg(width, height, body)).composite([image]).png().toFile(path.join(output, `06-start-free-${width}x${height}.png`));
}

async function main() {
  await Promise.all(variants.flatMap(({ width, height }) => [
    makeHero(width, height),
    makeLessonPlan(width, height),
    makePrintables(width, height),
    makeActivity(width, height),
    makeFeatures(width, height),
    makeStartFree(width, height)
  ]));
  console.log(`Generated 12 Google Ads assets in ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

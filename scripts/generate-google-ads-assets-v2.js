#!/usr/bin/env node
"use strict";

// Rebuilds the Google Ads exports with current product captures, real printable
// exports, and dedicated photo-real classroom setup imagery. It is intentionally
// isolated from the website and curriculum code.
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "images", "google-ads");
const file = (...parts) => path.join(root, ...parts);
const colors = { navy: "#17335f", purple: "#6846c7", cream: "#fbfaf7", line: "#ddd7ed", muted: "#61718b" };
const variants = [{ width: 1200, height: 1200 }, { width: 1200, height: 628 }];
const sources = {
  library: file("mockups", "lesson-cover-redesign", "screenshots", "final-library-desktop.png"),
  planner: file("mockups", "teacher-weekly-planner", "page-2.png"),
  printable: file("mockups", "teacher-weekly-planner", "page-1.png"),
  printableAppleRedGreen: file("images", "google-ads", "source", "printable-pages", "amazing-apples-2.png"),
  printableAppleYellowWhole: file("images", "google-ads", "source", "printable-pages", "amazing-apples-3.png"),
  printableAppleParts: file("images", "google-ads", "source", "printable-pages", "amazing-apples-4.png"),
  weeklyTools: file("docs", "scheduling-polish-audit", "03-desktop-weekly-planner.png"),
  sensory: file("images", "google-ads", "source", "llh-realistic-sensory-invitation.png"),
  dramatic: file("images", "google-ads", "source", "llh-realistic-dramatic-play.png"),
  art: file("images", "google-ads", "source", "llh-realistic-art-invitation.png")
};

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
}[character]));
const text = (x, y, value, size, weight = 500, color = colors.navy, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(value)}</text>`;
const svg = (width, height, body) => Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${colors.cream}"/>${body}</svg>`);
const footer = (width, height) => `${text(44, height - 28, "Little Learner Hub", 18, 700)}${text(width - 44, height - 28, "littlelearnershubbyleah.com", 16, 600, colors.muted, "end")}`;
const card = (x, y, width, height, radius = 20) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#fff" stroke="${colors.line}" stroke-width="2"/>`;

async function render(filePath, width, height, position = "centre") {
  return sharp(filePath).resize(width, height, { fit: "cover", position }).png().toBuffer();
}

async function libraryCrop(width, height) {
  // Removes the changing "lesson plans available" status region at the top.
  return sharp(sources.library).extract({ left: 210, top: 280, width: 1210, height: 560 })
    .resize(width, height, { fit: "cover", position: "centre" }).png().toBuffer();
}

async function compose(filename, width, height, body, layers) {
  await sharp(svg(width, height, body)).composite(layers).png().toFile(path.join(output, filename));
}

function thumbLabel(x, y, label) {
  return `<rect x="${x + 14}" y="${y + 14}" width="${label.length * 9 + 30}" height="32" rx="16" fill="#fff"/>${text(x + 29, y + 37, label, 14, 800, colors.navy)}`;
}

function badge(width, label) {
  return Buffer.from(`<svg width="${width}" height="36" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="36" rx="18" fill="#fff"/><text x="16" y="24" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="800" fill="${colors.navy}">${esc(label)}</text></svg>`);
}

async function hero(width, height) {
  const square = height > 800;
  const library = square ? { x: 52, y: 370, w: 760, h: 560 } : { x: 486, y: 66, w: 520, h: 448 };
  const photos = square
    ? [{ x: 842, y: 370, w: 306, h: 170, source: sources.sensory, label: "Sensory invitation" }, { x: 842, y: 560, w: 306, h: 170, source: sources.dramatic, label: "Dramatic play" }, { x: 842, y: 750, w: 306, h: 170, source: sources.art, label: "Art invitation" }]
    : [{ x: 1030, y: 66, w: 130, h: 136, source: sources.sensory, label: "" }, { x: 1030, y: 222, w: 130, h: 136, source: sources.dramatic, label: "" }, { x: 1030, y: 378, w: 130, h: 136, source: sources.art, label: "" }];
  const body = `${text(52, square ? 102 : 92, "WEEKLY CLASSROOM PLANNING", 18, 800, colors.purple)}
    ${text(52, square ? 168 : 150, "Your whole week", square ? 58 : 43, 800)}
    ${text(52, square ? 232 : 198, "planned before Monday.", square ? 58 : 43, 800)}
    ${text(52, square ? 281 : 242, "Ready-to-use lesson plans, activities, and teacher tools.", 22, 500, colors.muted)}
    ${card(library.x - 8, library.y - 8, library.w + 16, library.h + 16)}
    ${photos.map((photo) => `${card(photo.x - 4, photo.y - 4, photo.w + 8, photo.h + 8, 14)}${thumbLabel(photo.x, photo.y, photo.label)}`).join("")}
    ${footer(width, height)}`;
  const layers = [{ input: await libraryCrop(library.w, library.h), left: library.x, top: library.y }];
  for (const photo of photos) layers.push({ input: await render(photo.source, photo.w, photo.h), left: photo.x, top: photo.y });
  for (const photo of photos.filter((photo) => photo.label)) layers.push({ input: badge(photo.label.length * 9 + 30, photo.label), left: photo.x + 14, top: photo.y + 14 });
  await compose(`01-hero-product-${width}x${height}.png`, width, height, body, layers);
}

async function lessonWeek(width, height) {
  const square = height > 800;
  const plan = square ? { x: 44, y: 380, w: 1112, h: 363 } : { x: 50, y: 238, w: 1100, h: 360 };
  const body = `${text(square ? 52 : 56, square ? 102 : 102, "WEEKLY CLASSROOM PLANNING", 18, 800, colors.purple)}
    ${text(square ? 52 : 56, square ? 166 : 160, "Open it. Teach the week.", square ? 56 : 42, 800)}
    ${text(square ? 52 : 56, square ? 216 : 204, "Monday–Friday structure with activities, materials, and books.", 22, 500, colors.muted)}
    ${card(plan.x - 8, plan.y - 8, plan.w + 16, plan.h + 16)}
    ${footer(width, height)}`;
  const plannerCrop = await sharp(sources.planner).extract({ left: 24, top: 184, width: 1714, height: 584 })
    .resize(plan.w, plan.h, { fit: "cover" }).png().toBuffer();
  await compose(`02-lesson-plan-week-${width}x${height}.png`, width, height, body, [{ input: plannerCrop, left: plan.x, top: plan.y }]);
}

async function printables(width, height) {
  const square = height > 800;
  const pages = square
    ? [{ x: 96, y: 430, w: 330, h: 428, source: sources.printableAppleYellowWhole, label: "Picture cards" }, { x: 426, y: 340, w: 410, h: 532, source: sources.printableAppleRedGreen, label: "Color cards" }, { x: 814, y: 456, w: 292, h: 378, source: sources.printableAppleParts, label: "Sorting & sequencing" }]
    : [{ x: 570, y: 160, w: 180, h: 233, source: sources.printableAppleYellowWhole, label: "Picture cards" }, { x: 745, y: 92, w: 260, h: 336, source: sources.printableAppleRedGreen, label: "Color cards" }, { x: 990, y: 180, w: 160, h: 207, source: sources.printableAppleParts, label: "" }];
  const body = `${text(52, square ? 102 : 104, "PRINTABLES & TEACHER TOOLS", 18, 800, colors.purple)}
    ${text(52, square ? 166 : 160, "Print what your week needs.", square ? 54 : 42, 800)}
    ${text(52, square ? 216 : 204, "Real classroom-ready resources for your week.", 22, 500, colors.muted)}
    ${pages.map((page) => `${card(page.x - 5, page.y - 5, page.w + 10, page.h + 10, 14)}${page.label ? thumbLabel(page.x, page.y, page.label) : ""}`).join("")}
    ${footer(width, height)}`;
  const layers = await Promise.all(pages.map(async (page) => ({
    input: await render(page.source, page.w, page.h, "north"),
    left: page.x, top: page.y
  })));
  for (const page of pages.filter((page) => page.label)) layers.push({ input: badge(Math.min(page.w - 28, page.label.length * 9 + 34), page.label), left: page.x + 14, top: page.y + 14 });
  await compose(`03-printables-${width}x${height}.png`, width, height, body, layers);
}

async function classroomActivity(width, height) {
  const square = height > 800;
  const photo = square ? { x: 48, y: 330, w: 1104, h: 616 } : { x: 564, y: 48, w: 588, h: 492 };
  const body = `${text(square ? 52 : 54, square ? 106 : 100, "CLASSROOM ACTIVITY IDEAS", 18, 800, colors.purple)}
    ${text(square ? 52 : 54, square ? 170 : 158, "Real activities. Ready to teach.", square ? 55 : 41, 800)}
    ${text(square ? 52 : 54, square ? 220 : 202, "Thoughtful setups for hands-on learning.", 22, 500, colors.muted)}
    ${card(photo.x - 8, photo.y - 8, photo.w + 16, photo.h + 16)}
    <rect x="${photo.x + 22}" y="${photo.y + photo.h - 68}" width="250" height="44" rx="22" fill="#fff"/>${text(photo.x + 147, photo.y + photo.h - 39, "Sensory color invitation", 16, 800, colors.navy, "middle")}
    ${footer(width, height)}`;
  await compose(`04-classroom-activity-${width}x${height}.png`, width, height, body, [{ input: await render(sources.sensory, photo.w, photo.h), left: photo.x, top: photo.y }]);
}

async function features(width, height) {
  const square = height > 800;
  const main = square ? { x: 52, y: 315, w: 1096, h: 380 } : { x: 52, y: 258, w: 660, h: 292 };
  const support = square
    ? [{ x: 52, y: 760, w: 520, h: 270, source: sources.printableAppleRedGreen, title: "Printables", type: "printable" }, { x: 628, y: 760, w: 520, h: 270, source: sources.weeklyTools, title: "Classroom tools", type: "tools" }]
    : [{ x: 752, y: 258, w: 190, h: 292, source: sources.printableAppleRedGreen, title: "Printables", type: "printable" }, { x: 970, y: 258, w: 180, h: 292, source: sources.weeklyTools, title: "Classroom tools", type: "tools" }];
  const body = `${text(52, square ? 102 : 102, "ONE PLACE TO PLAN, PRINT & TEACH", 18, 800, colors.purple)}
    ${text(52, square ? 166 : 160, "Plan. Print. Teach.", square ? 55 : 41, 800)}
    ${text(52, square ? 216 : 204, "Everything your classroom day needs in one place.", 22, 500, colors.muted)}
    ${card(main.x - 7, main.y - 7, main.w + 14, main.h + 14)}
    ${support.map((item) => `${card(item.x - 5, item.y - 5, item.w + 10, item.h + 10, 14)}`).join("")}
    ${footer(width, height)}`;
  const layers = [{ input: await libraryCrop(main.w, main.h), left: main.x, top: main.y }];
  for (const item of support) {
    const image = item.type === "tools"
      ? await sharp(item.source).extract({ left: 20, top: 118, width: 936, height: 580 }).resize(item.w, item.h, { fit: "cover", position: "north" }).png().toBuffer()
      : await render(item.source, item.w, item.h, "north");
    layers.push({ input: image, left: item.x, top: item.y });
    layers.push({ input: badge(Math.min(item.w - 28, item.title.length * 9 + 34), item.title), left: item.x + 14, top: item.y + 14 });
  }
  await compose(`05-product-features-${width}x${height}.png`, width, height, body, layers);
}

async function startFree(width, height) {
  const square = height > 800;
  const photo = square ? { x: 52, y: 480, w: 1096, h: 466 } : { x: 678, y: 48, w: 474, h: 492 };
  const ui = square ? { x: 756, y: 342, w: 344, h: 196 } : { x: 912, y: 308, w: 220, h: 170 };
  const body = `${text(52, square ? 102 : 104, "LITTLE LEARNER HUB", 18, 800, colors.purple)}
    ${text(52, square ? 166 : 160, "Start free.", square ? 61 : 48, 800)}
    ${text(52, square ? 235 : 214, "Start prepared.", square ? 61 : 48, 800)}
    ${text(52, square ? 290 : 260, "10 complete starter plans", 23, 800, colors.purple)}
    ${text(52, square ? 326 : 296, "No credit card required", 21, 500, colors.muted)}
    <rect x="52" y="${square ? 352 : 324}" width="170" height="48" rx="24" fill="${colors.purple}"/>${text(137, square ? 383 : 355, "Start free", 17, 800, "#fff", "middle")}
    ${card(photo.x - 8, photo.y - 8, photo.w + 16, photo.h + 16)}${card(ui.x - 5, ui.y - 5, ui.w + 10, ui.h + 10, 12)}
    ${footer(width, height)}`;
  await compose(`06-start-free-${width}x${height}.png`, width, height, body, [
    { input: await render(sources.art, photo.w, photo.h), left: photo.x, top: photo.y },
    { input: await libraryCrop(ui.w, ui.h), left: ui.x, top: ui.y }
  ]);
}

async function main() {
  for (const variant of variants) {
    await Promise.all([lessonWeek(variant.width, variant.height), printables(variant.width, variant.height), features(variant.width, variant.height)]);
  }
  console.log("Rebuilt Google Ads concepts 02, 03, and 05 only.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
"use strict";

// Rebuilds review-only artifacts from the six finalized 1200×1200 creatives.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "images", "google-ads");
const creatives = [
  ["Hero Product", "01-hero-product.png"],
  ["Lesson Plan Week", "02-lesson-plan-week.png"],
  ["Print, Prep & Go", "03-print-prep-go.png"],
  ["Meaningful Play", "04-meaningful-play.png"],
  ["Product Features", "05-product-features.png"],
  ["Start Free Today", "06-start-free-today.png"]
];

async function createContactSheet() {
  const width = 1920;
  const height = 3142;
  const padding = 50;
  const gap = 40;
  const headerHeight = 130;
  const labelHeight = 54;
  const tile = 890;
  const header = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8f7fb"/>
    <rect width="100%" height="${headerHeight}" fill="#17335f"/>
    <text x="${padding}" y="78" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#fff">Little Learner Hub • Owner-approved Google Ads creative preview</text>
    <text x="${width - padding}" y="78" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="600" fill="#dbeaf7">Final six creatives</text>
  </svg>`);
  const layers = [{ input: header, top: 0, left: 0 }];

  for (let index = 0; index < creatives.length; index += 1) {
    const [label, filename] = creatives[index];
    const left = padding + (index % 2) * (tile + gap);
    const top = headerHeight + padding + Math.floor(index / 2) * (labelHeight + tile + gap);
    layers.push({
      input: Buffer.from(`<svg width="${tile}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="12" fill="#6846c7"/>
        <text x="24" y="35" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#fff">${index + 1}. ${label.replace("&", "&amp;")}</text>
      </svg>`),
      left,
      top
    });
    layers.push({
      input: await sharp(path.join(directory, filename)).resize(tile, tile).png().toBuffer(),
      left,
      top: top + labelHeight
    });
  }

  const output = path.join(directory, "little-learner-hub-google-ads-final-contact-sheet.png");
  await sharp({ create: { width, height, channels: 4, background: "#f8f7fb" } }).composite(layers).png().toFile(output);
  return output;
}

async function createReviewPdf(contactSheet) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Little Learner Hub — Owner-approved Google Ads Creative Review");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const navy = rgb(0.09, 0.2, 0.37);
  const purple = rgb(0.41, 0.275, 0.78);
  const muted = rgb(0.38, 0.44, 0.55);
  const cover = pdf.addPage([864, 960]);

  cover.drawRectangle({ x: 0, y: 0, width: 864, height: 960, color: rgb(1, 1, 1) });
  cover.drawRectangle({ x: 0, y: 770, width: 864, height: 190, color: navy });
  cover.drawText("Little Learner Hub", { x: 92, y: 865, size: 25, font: bold, color: rgb(1, 1, 1) });
  cover.drawText("Google Ads Creative Review", { x: 92, y: 810, size: 42, font: bold, color: rgb(1, 1, 1) });
  cover.drawText("Owner-approved final six creatives", { x: 92, y: 690, size: 24, font: bold, color: purple });
  cover.drawText("No trial messaging", { x: 92, y: 650, size: 19, font: regular, color: muted });

  for (let index = 0; index < creatives.length; index += 1) {
    const [label, filename] = creatives[index];
    const image = await pdf.embedPng(fs.readFileSync(path.join(directory, filename)));
    const page = pdf.addPage([864, 960]);
    page.drawRectangle({ x: 0, y: 0, width: 864, height: 960, color: rgb(1, 1, 1) });
    page.drawText(`${index + 1}. ${label}`, { x: 52, y: 908, size: 29, font: bold, color: navy });
    page.drawImage(image, { x: 52, y: 72, width: 760, height: 760 });
  }

  const contact = await pdf.embedPng(fs.readFileSync(contactSheet));
  const page = pdf.addPage([864, 1440]);
  page.drawRectangle({ x: 0, y: 0, width: 864, height: 1440, color: rgb(1, 1, 1) });
  page.drawText("Full owner-approved creative contact sheet", { x: 42, y: 1388, size: 29, font: bold, color: navy });
  page.drawImage(contact, { x: 42, y: 44, width: 780, height: 1276 });

  const output = path.join(directory, "little-learner-hub-google-ads-final-review.pdf");
  fs.writeFileSync(output, await pdf.save());
}

async function main() {
  const contactSheet = await createContactSheet();
  await createReviewPdf(contactSheet);
  console.log("Rebuilt final Google Ads contact sheet and review PDF.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

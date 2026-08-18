#!/usr/bin/env node
/**
 * Display-only: empty lesson age must never render as Preschool.
 * Run: npm run test:lesson-age-display-fallbacks
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const safe = require("./curriculum-safe-values.js");
const weeklyExport = require("./lesson-plan-weekly-export.js");
const present = require("./teaching-kit-present.js");
const docx = require("./llh-lesson-docx.js");
const planner = require("./llh-teacher-weekly-planner.js");
const printableModel = require("./teaching-kit-printable-model.js");
const print = require("./teaching-kit-print.js");

globalThis.LlhLessonWeeklyExport = weeklyExport;
globalThis.LLHTeachingKitPrintableModel = printableModel;

const ROOT = path.join(__dirname, "..");
const APP_JS = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const VIEWER_JS = fs.readFileSync(path.join(ROOT, "scripts/curriculum-lesson-viewer-render.js"), "utf8");
const PRINT_JS = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-print.js"), "utf8");

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

function readZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buffer.slice(dataStart, dataStart + compSize);
    let content = data;
    if (method === 8) content = zlib.inflateRawSync(data);
    else if (method !== 0) throw new Error(`Unsupported zip method ${method} for ${name}`);
    entries.push({ name, content: Buffer.from(content) });
    offset = dataStart + compSize;
  }
  return entries;
}

async function blobToBuffer(blob) {
  if (Buffer.isBuffer(blob)) return blob;
  if (blob instanceof Uint8Array) return Buffer.from(blob);
  if (typeof blob?.arrayBuffer === "function") {
    return Buffer.from(await blob.arrayBuffer());
  }
  throw new Error("Unsupported blob type");
}

function emptyAgePlan(age) {
  return {
    title: "Age Display Fixture",
    age,
    theme: "Wheels",
    weeklyOverview: "Children explore motion.",
    dailyPlans: {
      monday: { items: [{ title: "Paint Tracks", activityCategory: "Art" }] },
    },
  };
}

function emptyAgeKit(age) {
  return {
    ok: true,
    title: "Age Display Fixture",
    age,
    theme: "Wheels",
    companion: {
      activities: [{
        id: "a1",
        title: "Paint Tracks",
        dayOfWeek: "monday",
        activityCategory: "Art",
        description: "Paint with wheels.",
      }],
      songs: [],
      books: [],
      printables: [],
    },
  };
}

async function main() {
  console.log("1) Shared render normalizer keeps empty age empty");
  const emptyNorm = safe.normalizeCurriculumLessonPlanForRender(emptyAgePlan(""));
  assert.equal(emptyNorm.age, "");
  assert.equal(safe.curriculumLessonAgeText(""), "");
  assert.equal(safe.curriculumLessonAgeText(null), "");
  const preschoolNorm = safe.normalizeCurriculumLessonPlanForRender(emptyAgePlan("Preschool"));
  assert.equal(preschoolNorm.age, "Preschool");
  const toddlerNorm = safe.normalizeCurriculumLessonPlanForRender(emptyAgePlan("Toddler"));
  assert.equal(toddlerNorm.age, "Toddler");
  const infantNorm = safe.normalizeCurriculumLessonPlanForRender(emptyAgePlan("Infant"));
  assert.equal(infantNorm.age, "Infant");
  console.log("  PASS empty/ Preschool / Toddler / Infant");

  console.log("2) Planner + PDF summary helpers do not fabricate Preschool");
  const emptySummary = weeklyExport.buildWeeklySummary(emptyAgePlan(""));
  assert.equal(emptySummary.age, "");
  assert.doesNotMatch(String(emptySummary.age), /Preschool/);
  const preschoolSummary = weeklyExport.buildWeeklySummary(emptyAgePlan("Preschool"));
  assert.equal(preschoolSummary.age, "Preschool");
  assert.equal(weeklyExport.buildWeeklySummary(emptyAgePlan("Toddler")).age, "Toddler");
  assert.equal(weeklyExport.buildWeeklySummary(emptyAgePlan("Infant")).age, "Infant");
  const plannerDays = planner.buildTeacherPlannerDays(emptyAgePlan(""), { validate: false });
  const plannerAge = plannerDays?.summary?.age ?? plannerDays?.age ?? "";
  assert.doesNotMatch(String(plannerAge), /Preschool/);
  console.log("  PASS planner/PDF summary");

  console.log("3) Full-lesson download text omits Age group when missing");
  const emptyText = present.formatFullLessonPlanForDownload(emptyAgePlan(""), { title: "Age Display Fixture" });
  assert.doesNotMatch(emptyText, /Preschool/);
  assert.doesNotMatch(emptyText, /Age group:/i);
  const preschoolText = present.formatFullLessonPlanForDownload(emptyAgePlan("Preschool"), { title: "Age Display Fixture" });
  assert.match(preschoolText, /Age group:\s*Preschool/);
  assert.match(present.formatFullLessonPlanForDownload(emptyAgePlan("Toddler")), /Age group:\s*Toddler/);
  assert.match(present.formatFullLessonPlanForDownload(emptyAgePlan("Infant")), /Age group:\s*Infant/);
  console.log("  PASS download text / PDF presentation");

  console.log("4) DOCX builders omit fabricated Preschool");
  const weeklyEmpty = await blobToBuffer(docx.buildWeeklyCalendarDocxBlob({
    title: "Age Display Fixture",
    theme: "Wheels",
    age: "",
    weekOfLabel: "Aug 17, 2026",
    plan: emptyAgePlan(""),
  }));
  const weeklyXml = readZipEntries(weeklyEmpty).find((entry) => entry.name === "word/document.xml").content.toString("utf8");
  assert.doesNotMatch(weeklyXml, /Preschool/);
  assert.doesNotMatch(weeklyXml, /Age:/);
  const weeklyPreschool = await blobToBuffer(docx.buildWeeklyCalendarDocxBlob({
    title: "Age Display Fixture",
    age: "Preschool",
    plan: emptyAgePlan("Preschool"),
  }));
  const weeklyPreschoolXml = readZipEntries(weeklyPreschool).find((entry) => entry.name === "word/document.xml").content.toString("utf8");
  assert.match(weeklyPreschoolXml, /Preschool/);
  const fullEmpty = await blobToBuffer(docx.buildFullLessonPlanDocxBlob({
    title: "Age Display Fixture",
    age: "",
    plan: emptyAgePlan(""),
  }));
  const fullXml = readZipEntries(fullEmpty).find((entry) => entry.name === "word/document.xml").content.toString("utf8");
  assert.doesNotMatch(fullXml, /Preschool/);
  assert.doesNotMatch(fullXml, /Age group:/i);
  const fullToddler = await blobToBuffer(docx.buildFullLessonPlanDocxBlob({
    title: "Age Display Fixture",
    age: "Toddler",
    plan: emptyAgePlan("Toddler"),
  }));
  assert.match(readZipEntries(fullToddler).find((entry) => entry.name === "word/document.xml").content.toString("utf8"), /Toddler/);
  const fullInfant = await blobToBuffer(docx.buildFullLessonPlanDocxBlob({
    title: "Age Display Fixture",
    age: "Infant",
    plan: emptyAgePlan("Infant"),
  }));
  assert.match(readZipEntries(fullInfant).find((entry) => entry.name === "word/document.xml").content.toString("utf8"), /Infant/);
  console.log("  PASS DOCX / printable lesson headers");

  console.log("5) Print Center model + text omit missing age");
  const emptyModel = printableModel.buildPrintableTeachingKitModel(emptyAgeKit(""), emptyAgePlan(""));
  assert.equal(emptyModel.ok, true, emptyModel.reason || "model");
  assert.equal(emptyModel.age, "");
  const printText = print.buildFullWeeklyLessonPlanText(emptyAgeKit(""), { plan: emptyAgePlan("") });
  assert.doesNotMatch(printText, /Preschool/);
  assert.doesNotMatch(printText, /Age group:/i);
  const preschoolPrint = print.buildFullWeeklyLessonPlanText(emptyAgeKit("Preschool"), { plan: emptyAgePlan("Preschool") });
  assert.match(preschoolPrint, /Age group:\s*Preschool/);
  const toddlerPrint = print.buildFullWeeklyLessonPlanText(emptyAgeKit("Toddler"), { plan: emptyAgePlan("Toddler") });
  assert.match(toddlerPrint, /Age group:\s*Toddler/);
  const infantPrint = print.buildFullWeeklyLessonPlanText(emptyAgeKit("Infant"), { plan: emptyAgePlan("Infant") });
  assert.match(infantPrint, /Age group:\s*Infant/);
  const preview = print.buildPrintPreviewHtml(emptyAgeKit(""), { plan: emptyAgePlan(""), preset: "full_weekly_plan" });
  const previewHtml = typeof preview === "string" ? preview : String(preview?.html || preview?.documentHtml || "");
  if (previewHtml) {
    assert.doesNotMatch(previewHtml, /Preschool/);
    assert.doesNotMatch(previewHtml, />Age</);
  }
  assert.match(PRINT_JS, /model\.age \? `Age group: \$\{model\.age\}` : ""/);
  assert.doesNotMatch(extractFn(PRINT_JS, "metaCardHtml"), /\|\|\s*["']Preschool["']/);
  console.log("  PASS Print Center");

  console.log("6) app.js PDF / print / planner display functions no longer fallback to Preschool");
  const displayFns = [
    "lessonPlanDisplayAge",
    "lessonWorkspaceDefaultAgeGroup",
    "lessonPlanPrintHeaderHtml",
    "lessonPlanWeeklyScheduleHtml",
    "lessonPlanVariantText",
    "buildLessonPlanWeeklySchedulePdfBlob",
    "buildTeacherWeeklyPlannerPdfBlob",
    "buildLessonPlanPlanningSheetPdfBlob",
    "buildLessonPlanWeeklyCalendarDocxBlob",
    "buildLessonPlanFullDocxBlob",
    "lessonWorkspaceChromeHtml",
    "lessonWorkspaceTeachingKitChrome",
    "calendarWeekPrintResource",
  ];
  displayFns.forEach((name) => {
    const body = extractFn(APP_JS, name);
    assert.doesNotMatch(body, /\|\|\s*["']Preschool["']/, `${name} still fabricates Preschool`);
  });
  const plannerForm = extractFn(APP_JS, "renderCurriculumPlanner");
  assert.doesNotMatch(plannerForm, /\|\|\s*["']Preschool["']/, "planner form still fabricates Preschool");
  assert.match(extractFn(APP_JS, "lessonPlanDisplayAge"), /trim\(\)/);
  assert.match(VIEWER_JS, /function publicLessonAgeText/);
  assert.match(VIEWER_JS, /Age not set/);
  console.log("  PASS source audit");

  console.log("\nAll lesson age display fallback checks passed.");
}

main().catch((error) => {
  console.error("\nFAIL:", error.stack || error.message);
  process.exitCode = 1;
});

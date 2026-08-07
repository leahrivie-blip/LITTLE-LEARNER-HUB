#!/usr/bin/env node
/**
 * System-wide Teaching Kit print/download architecture coverage.
 * Run: npm run test:teaching-kit-print-system
 *
 * Asserts shared printable model + document modes across representative fixtures.
 * Does not mutate curriculum or invent missing content.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = path.join(ROOT, "artifacts", "tk-print-system");

require("./teaching-kit-present.js");
const Present = require("./teaching-kit-present.js");
const Model = require("./teaching-kit-printable-model.js");
const Print = require("./teaching-kit-print.js");
const Mapper = require("./teaching-kit-mapper.js");

const FORBIDDEN = [
  /ACTIVITY_NAME\s*:/i,
  /AGE_GROUP\s*:/i,
  /STATUS\s*:/i,
  /LEARNING_DOMAINS\s*:/i,
  /DAILY_THEME\s*:/i,
  /TEACHER_ROLE\s*:/i,
  /OBSERVATION_OPPORTUNITIES\s*:/i,
  /\bnull\b/,
  /\bundefined\b/,
  /close-button/,
  /data-close-modal/,
  /aria-label="Close"/i,
];

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log("  ✓", msg);
}

function mapFixture(fixture) {
  return Mapper.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities || [],
    fixture.resources || [],
    { day: "monday" },
  );
}

function assertNoForbidden(html, label) {
  FORBIDDEN.forEach((pattern) => {
    assert.doesNotMatch(String(html || ""), pattern, `${label} matched ${pattern}`);
  });
}

function loadFixture(name) {
  return require(path.join(__dirname, "fixtures", "teaching-kit", name));
}

function testFarmAnimalsCompleteBinder() {
  console.log("\nFarm Animals — Entire Binder Kit");
  const fixture = loadFixture("farm-animals-enrichment-slice2.json");
  const kit = mapFixture(fixture);
  ok(kit.ok === true, "maps");
  const model = Model.buildPrintableTeachingKitModel(kit, fixture.lessonPlan);
  ok(model.ok === true, "printable model ok");
  ok(model.days.length === 5, "five weekdays in model");
  ok(model.activities.length === 15, "all linked activities in model");
  ok(model.books.length >= 1, "books present when stored");
  ok(model.songs.length >= 1, "songs present when stored");
  ok(model.capabilities.toolkit === true, "toolkit capability from stored setup");

  const binder = Print.buildEntireBinderKitHtml(kit, { plan: fixture.lessonPlan, paperSize: "letter" });
  ok(binder.ok === true, "binder builds");
  ok(binder.documentMode === "entire_binder", "document mode entire_binder");
  ok(binder.pageCount >= 10, `binder has substantial pages (${binder.pageCount})`);
  ok(binder.pageCount <= 40, `binder not bloated by empty bands (${binder.pageCount})`);
  ok(/Week at a Glance/i.test(binder.html), "week at a glance");
  ok(/tk-print-wag-table/i.test(binder.html), "week at a glance uses grid table");
  ok(/tk-print-activity-card/i.test(binder.html), "designed activity cards present");
  ok(/tk-print-check/i.test(binder.html), "materials checklists present");
  ok(/Monday/.test(binder.html) && /Friday/.test(binder.html), "weekdays included");
  ok(/Farm Animal Discovery Basket/i.test(binder.html), "activity included");
  ok(/Teacher Toolkit/i.test(binder.html), "toolkit included");
  ok(/Monday Morning Setup/i.test(binder.html), "setup is toolkit subsection");
  ok(/Teacher Notes|Planning/i.test(binder.html), "teacher notes worksheet");
  assertNoForbidden(binder.html, "farm binder");

  const weekly = Print.buildFullWeeklyLessonPlanHtml(kit, { plan: fixture.lessonPlan });
  ok(weekly.ok === true, "full weekly builds");
  ok(weekly.documentMode === "full_weekly", "full weekly mode");
  ok(weekly.pageCount >= 6 && weekly.pageCount <= 14, `full weekly practical length (${weekly.pageCount})`);
  ok(!/Tab 5 — Printables/i.test(weekly.html) || !(model.printables || []).length, "full weekly omits empty printables tab chrome");
  ok(weekly.pageCount < binder.pageCount, "full weekly shorter than entire binder");
  assertNoForbidden(weekly.html, "farm full weekly");

  const text = Print.buildFullWeeklyLessonPlanText(kit, { plan: fixture.lessonPlan });
  ok(/Full Weekly Lesson Plan/i.test(text), "download text header");
  ok(/Farm Animals/i.test(text), "title in download text");
  assertNoForbidden(text, "farm download text");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT, "farm-binder.html"), binder.html);
  fs.writeFileSync(path.join(ARTIFACT, "farm-full-weekly.html"), weekly.html);
  fs.writeFileSync(path.join(ARTIFACT, "farm-full-weekly.txt"), text);
}

function testLegacyAndPartial() {
  console.log("\nLegacy / partial fixtures");
  const empty = loadFixture("empty-plan.json");
  const emptyKit = mapFixture(empty);
  const emptyBinder = Print.buildBinderPrintHtml(emptyKit, { preset: "week_binder", plan: empty.lessonPlan });
  ok(emptyBinder.ok === true, "legacy/empty kit still prints");
  ok(!/Coming Soon/i.test(emptyBinder.html), "no coming-soon filler");
  ok(!/No printables available/i.test(emptyBinder.html), "no empty printable placeholder");
  assertNoForbidden(emptyBinder.html, "empty binder");

  const mini = loadFixture("enriched-mini.json");
  const miniKit = mapFixture(mini);
  const miniModel = Model.buildPrintableTeachingKitModel(miniKit, mini.lessonPlan);
  const miniBinder = Print.buildEntireBinderKitHtml(miniKit, { plan: mini.lessonPlan });
  ok(miniBinder.ok === true, "enriched mini binder");
  if (miniModel.capabilities.printables) {
    ok(/Printable resources|Printables/i.test(miniBinder.html), "printables referenced when present");
    ok(/not embedded|File pages not embedded/i.test(miniBinder.html), "does not silently claim embedded pages");
  }
  assertNoForbidden(miniBinder.html, "mini binder");

  const bugs = loadFixture("bugs-and-butterflies.json");
  const bugsKit = mapFixture(bugs);
  const bugsWeekly = Print.buildFullWeeklyLessonPlanHtml(bugsKit, { plan: bugs.lessonPlan });
  ok(bugsWeekly.ok === true, "bugs weekly builds");
  assertNoForbidden(bugsWeekly.html, "bugs weekly");
}

function testPrintModesLimitSections() {
  console.log("\nPrint modes limit correctly");
  const fixture = loadFixture("farm-animals-enrichment-slice2.json");
  const kit = mapFixture(fixture);

  const oneDay = Print.buildBinderPrintHtml(kit, {
    preset: "today_pack",
    day: "monday",
    plan: fixture.lessonPlan,
  });
  ok(oneDay.documentMode === "one_day", "one day mode");
  ok(/Monday/i.test(oneDay.html), "monday present");
  ok(!/Tuesday · Daily Plan|Tuesday Classroom/i.test(oneDay.html), "tuesday daily plan omitted");

  const activities = Print.buildBinderPrintHtml(kit, {
    preset: "activities_only",
    plan: fixture.lessonPlan,
  });
  ok(activities.documentMode === "activities", "activities mode");
  ok(/Farm Animal Discovery Basket/i.test(activities.html), "activity present");
  ok(!/<table class="tk-print-wag-table"/i.test(activities.html), "week grid omitted in activities-only");

  const materials = Print.buildBinderPrintHtml(kit, {
    preset: "materials_list",
    plan: fixture.lessonPlan,
  });
  ok(/Materials/i.test(materials.html), "materials mode has materials");
  ok(!/Activity Cards/i.test(materials.html) || materials.pageCount <= 3, "materials mode stays focused");

  const songs = Print.buildBinderPrintHtml(kit, {
    preset: "songs_pack",
    plan: fixture.lessonPlan,
  });
  ok(/Songs/i.test(songs.html), "songs mode");
  ok(!/tk-print-notes-grid|tk-print-write-line/i.test(songs.html), "songs mode omits teacher notes worksheet");
}

function testPresentLabels() {
  console.log("\nLabels");
  ok(Present.presentLabel("week_binder") === "Entire Binder Kit", "week_binder label");
  ok(Present.presentLabel("full_weekly_plan") === "Full Weekly Lesson Plan", "full weekly label");
  ok(Present.presentLabel("LEARNING_DOMAINS") === "Learning domains", "domains label");
}

async function maybeRenderPdfScreenshots() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (_err) {
    console.log("\n(playwright not available — skipping PDF/visual render step)");
    return;
  }
  console.log("\nRender HTML → PDF for visual QA");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (const name of ["farm-binder", "farm-full-weekly"]) {
      const htmlPath = path.join(ARTIFACT, `${name}.html`);
      if (!fs.existsSync(htmlPath)) continue;
      const page = await browser.newPage();
      const wrapped = `<!doctype html><html><head><meta charset="utf-8" />
        <link rel="stylesheet" href="file://${path.join(ROOT, "styles.css")}" />
        <style>body{margin:0;background:#fff}</style></head>
        <body class="printing-resource printing-teaching-kit">${fs.readFileSync(htmlPath, "utf8")}</body></html>`;
      const tmp = path.join(ARTIFACT, `${name}-wrapped.html`);
      fs.writeFileSync(tmp, wrapped);
      await page.goto(`file://${tmp}`, { waitUntil: "load" });
      const pdfPath = path.join(ARTIFACT, `${name}.pdf`);
      await page.pdf({
        path: pdfPath,
        format: "Letter",
        printBackground: true,
        margin: { top: "0.55in", bottom: "0.55in", left: "0.55in", right: "0.55in" },
      });
      ok(fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 1000, `${name}.pdf generated`);
      await page.screenshot({ path: path.join(ARTIFACT, `${name}-page1.png`), fullPage: false });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  testPresentLabels();
  testFarmAnimalsCompleteBinder();
  testLegacyAndPartial();
  testPrintModesLimitSections();
  await maybeRenderPdfScreenshots();
  console.log("\nAll teaching-kit print system checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

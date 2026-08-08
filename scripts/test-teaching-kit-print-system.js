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
  ok(binder.pageCount <= 55, `binder not bloated by empty bands (${binder.pageCount})`);
  ok(/Weekly Plan|Week at a Glance/i.test(binder.html), "weekly plan section");
  ok(/tk-print-wag-table/i.test(binder.html), "week at a glance uses grid table");
  ok(/Table of Contents/i.test(binder.html), "table of contents");
  ok(/tk-print-activity-card/i.test(binder.html), "designed activity cards present");
  ok(/tk-print-check/i.test(binder.html), "materials checklists present");
  ok(/Monday/.test(binder.html) && /Friday/.test(binder.html), "weekdays included");
  ok(/Farm Animal Discovery Basket/i.test(binder.html), "activity included");
  ok(/Teacher Toolkit/i.test(binder.html), "toolkit included");
  ok(/Monday Morning Setup/i.test(binder.html), "setup is toolkit subsection");
  ok(/Complete Teaching Kit|Teacher Binder/i.test(binder.html), "complete teaching kit cover branding");
  ok(/Overview/i.test(binder.html), "overview section");
  ok(/complete weekly checklist|Materials List/i.test(binder.html), "overview points to materials list");
  ok(!/data-toolkit-group="tips"/.test(binder.html), "empty Teaching Tips card omitted");
  ok(/data-tk-print-tab="Materials"/.test(binder.html), "materials section included in full kit");
  ok(!/No printable resources have been added/i.test(binder.html), "full kit omits empty printables section");
  assertNoForbidden(binder.html, "farm binder");

  // Safety/cleanup must remain distinct — no invented cleanup cloned from safety.
  const cleanupDupes = (kit.companion.activities || []).filter((activity) => {
    const safety = String(activity.safetyNotes || "").trim().toLowerCase();
    const cleanup = (activity.cleanupTips || []).map((tip) => String(tip).trim().toLowerCase()).filter(Boolean).join("|");
    return safety && cleanup && safety === cleanup;
  });
  ok(cleanupDupes.length === 0, "mapped activities do not clone safety into cleanup");
  ok(!/<strong>Cleanup<\/strong>/.test(binder.html), "no Cleanup headings when cleanup tips absent");

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
    ok(/PDF pages are included|PDF attachment missing|No PDF file is attached|actual PDF pages/i.test(miniBinder.html), "printable attachment status is explicit (merge or missing)");
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
  ok(!/<h3>Tuesday<\/h3>/.test(oneDay.html), "tuesday daily sheet omitted");

  const wednesday = Print.buildBinderPrintHtml(kit, {
    preset: "today_pack",
    day: "wednesday",
    plan: fixture.lessonPlan,
  });
  ok(/Wednesday/i.test(wednesday.html), "wednesday one-day present");

  const activities = Print.buildBinderPrintHtml(kit, {
    preset: "activities_only",
    plan: fixture.lessonPlan,
  });
  ok(activities.documentMode === "activities", "activities mode");
  ok(/Farm Animal Discovery Basket/i.test(activities.html), "activity present");
  ok(!/<table class="tk-print-wag-table"/i.test(activities.html), "week grid omitted in activities-only");

  const oneActivity = Print.buildBinderPrintHtml(kit, {
    preset: "one_activity",
    activityId: (kit.companion.activities || [])[0]?.id,
    plan: fixture.lessonPlan,
  });
  ok(oneActivity.documentMode === "one_activity", "one activity mode");
  ok(/tk-print-activity-card/i.test(oneActivity.html), "one activity card");

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
  ok(!/<div class="tk-print-notes-grid"|class="tk-print-write-line"/.test(songs.html), "songs mode omits teacher notes worksheet");

  const songGuide = Print.buildBinderPrintHtml(kit, {
    preset: "song_lyrics",
    plan: fixture.lessonPlan,
  });
  ok(/Song/i.test(songGuide.html), "song guide mode");

  const books = Print.buildBinderPrintHtml(kit, {
    preset: "book_guide",
    plan: fixture.lessonPlan,
  });
  ok(/Book Guide|Books/i.test(books.html), "book guide mode");

  const toolkit = Print.buildBinderPrintHtml(kit, {
    preset: "teacher_toolkit",
    plan: fixture.lessonPlan,
  });
  ok(/Teacher Toolkit|Monday Morning Setup/i.test(toolkit.html), "toolkit mode");
  ok(!/data-close-modal|close-button/i.test(toolkit.html), "toolkit is not modal chrome");

  const printables = Print.buildBinderPrintHtml(kit, {
    preset: "all_printables",
    plan: fixture.lessonPlan,
  });
  ok(printables.ok === true, "printables mode builds");
  ok(/No printable resources have been added/i.test(printables.html), "printables empty state when none linked");

  const onePrintable = Print.buildBinderPrintHtml(kit, {
    preset: "one_printable",
    printableId: "missing",
    plan: fixture.lessonPlan,
  });
  ok(onePrintable.ok === true, "one printable mode builds");
  ok(/No printable resources have been added/i.test(onePrintable.html), "one printable empty state when none linked");

  const presetAvailability = Print.evaluatePresetAvailability(kit);
  ok(presetAvailability.song_lyrics.available === false, "song lyrics disabled without printable lyrics");
  ok(presetAvailability.one_printable.available === false, "one printable disabled without resources");
  ok(presetAvailability.all_printables.available === true, "printables-only remains available with empty state");

  const selected = Print.buildBinderPrintHtml(kit, {
    preset: "selected_resources",
    selectedResources: { activities: true, materials: true, days: ["monday"] },
    plan: fixture.lessonPlan,
  });
  ok(selected.documentMode === "selected_resources", "selected resources mode");
  ok(/Monday/i.test(selected.html), "selected monday included");
  ok(/Materials/i.test(selected.html), "selected materials included");

  const overview = Print.buildBinderPrintHtml(kit, {
    preset: "weekly_overview",
    plan: fixture.lessonPlan,
  });
  ok(/Weekly Overview|Overview/i.test(overview.html), "weekly overview");
  ok(/tk-print-wag-table/i.test(overview.html), "weekly overview includes plan grid");

  const admin = Print.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    plan: fixture.lessonPlan,
    adminPreview: true,
  });
  ok(/ADMIN PREVIEW/i.test(admin.html), "admin preview banner");

  // Section checkboxes must actually trim binder output.
  const noActivities = Print.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    plan: fixture.lessonPlan,
    parts: {
      cover: true,
      setup: true,
      daily: true,
      activities: false,
      songsBooks: true,
      vocabulary: true,
      family: true,
      observations: true,
      printables: true,
    },
  });
  ok(noActivities.ok === true, "binder builds with activities unchecked");
  ok(!/<article[^>]*tk-print-activity-card/i.test(noActivities.html), "unchecked Activity Cards omit activity card articles");
  ok(!/data-tk-print-tab="Activities"/i.test(noActivities.html), "Activities section tab omitted when unchecked");
  ok(/Weekly Plan|Week at a Glance|Overview/i.test(noActivities.html), "other binder sections remain");

  const coverAndVocab = Print.buildBinderPrintHtml(kit, {
    preset: "selected_resources",
    plan: fixture.lessonPlan,
    parts: { cover: true },
    selectedResources: { vocabulary: true, activities: false },
  });
  ok(coverAndVocab.ok === true, "selected resources cover+vocabulary builds");
  ok(/Vocabulary/i.test(coverAndVocab.html), "selected vocabulary present");
  ok(!/<article[^>]*tk-print-activity-card/i.test(coverAndVocab.html), "selected resources omits unchecked activities");
  ok(!/data-tk-print-binder|Build &(?:amp;)? Print My Kit|Open Digital Binder|Back to Lesson Plans/i.test(coverAndVocab.html),
    "selected resources never embeds Teaching Kit UI chrome");
}

function testPresentLabels() {
  console.log("\nLabels");
  ok(Present.presentLabel("week_binder") === "Entire Binder Kit", "week_binder label");
  ok(Present.presentLabel("full_weekly_plan") === "Full Weekly Lesson Plan", "full weekly label");
  ok(Present.presentLabel("selected_resources") === "Selected Resources", "selected resources label");
  ok(Present.presentLabel("LEARNING_DOMAINS") === "Learning domains", "domains label");
}

function testDesignedRoutingWithoutPrintCenterFlag() {
  console.log("\nDesigned routing (Print Center flag OFF)");
  const TK = require("./teaching-kit.js");
  const flagsOff = TK.defaultTeachingKitFeatureFlags();
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const kit = mapFixture(farm);
  ok(TK.isUpgradedTeachingKit(farm.lessonPlan, kit) === true, "farm is upgraded complete kit");
  ok(
    TK.shouldUseDesignedTeachingKitDocument(farm.lessonPlan, kit, flagsOff) === true,
    "complete kit designed path does not require Print Center flag",
  );
  const auth = Print.evaluatePrintAuthorization({
    printCenterEnabled: false,
    designedDocumentEligible: true,
    kit,
    gate: { allowed: true, counted: false, watermark: "" },
  });
  ok(auth.ok === true, "auth allows designed-eligible kits with flag off");
  const binder = Print.buildEntireBinderKitHtml(kit, { plan: farm.lessonPlan });
  ok(binder.ok === true && /tk-print-root/i.test(binder.html), "designed binder HTML still builds");
  ok(!/Helvetica text dump|ACTIVITY_NAME:/i.test(binder.html), "not a text dump");
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
  testDesignedRoutingWithoutPrintCenterFlag();
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

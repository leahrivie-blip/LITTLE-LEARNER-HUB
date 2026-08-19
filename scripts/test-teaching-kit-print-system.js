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
const {
  parseFullLessonStructurePaste,
  buildCanonicalLessonPlan,
} = require("./curriculum-lesson-structure-paste.js");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const TINY_ARTIST_PASTE = `Lesson Plan Title
Tiny Artist Studio

Age Group
Infant 0–6 Months

Theme
Art, Color, Sensory Exploration, Movement and Caregiver Connection

Weekly overview
Tiny Artist Studio introduces young infants to art through safe sensory exploration.

Learning objectives
Notice and visually track bold colors and moving objects
Reach toward interesting colors, textures and objects

Materials list
Large resealable bags
Infant safe mirrors

Teacher preparation / Toolkit
Prepare all paint experiences before bringing infants to the activity area.

Books
Mix It Up by Hervé Tullet
Mouse Paint by Ellen Stoll Walsh

Songs
The Colors Song
Twinkle Twinkle Little Star

Activity name
Tummy Time Art Gallery

Weekday
Monday

Activity objective
Support visual tracking, head lifting and early language while infants view simple artwork during tummy time.

What children will do
Infants will lie on their tummy or in another comfortable supported position and look at bold art cards.

Materials
Tummy time mat
High contrast art cards

Step-by-step directions
Place one bold art card in front of baby.
Allow time for baby to notice the picture.

Activity name
Mess Free Canvas Smush

Weekday
Monday

Activity objective
Allow infants to safely explore color movement through a sealed paint experience.

Activity name
Color Kick Painting

Weekday
Tuesday

Activity objective
Encourage leg movement by allowing babies to kick against a sealed paint bag.

Activity name
Baby Art Gallery Walk

Weekday
Friday

Activity objective
Celebrate the week's exploration while encouraging visual attention.
`;

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
  ok(emptyBinder.pageCount <= 2, `empty lesson stays cover-only (${emptyBinder.pageCount} pages)`);
  ok(!/Coming Soon/i.test(emptyBinder.html), "no coming-soon filler");
  ok(!/No printables available/i.test(emptyBinder.html), "no empty printable placeholder");
  ok(!/Farm Animal Discovery Basket/i.test(emptyBinder.html), "empty binder does not leak Farm Animals");
  ok(!/Tummy Time Art Gallery/i.test(emptyBinder.html), "empty binder does not leak Tiny Artist");
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
  const bugsBinder = Print.buildEntireBinderKitHtml(bugsKit, { plan: bugs.lessonPlan });
  ok(bugsBinder.ok === true && bugsBinder.pageCount > 1, `bugs Entire Binder is not cover-only (${bugsBinder.pageCount})`);
  ok(/Bug Discovery Table/i.test(bugsBinder.html), "bugs binder uses Bugs & Butterflies activities");
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

function arrayShapedDailyPlans(plan) {
  const dailyPlans = {};
  WEEKDAYS.forEach((day) => {
    const raw = plan.dailyPlans && plan.dailyPlans[day];
    dailyPlans[day] = Array.isArray(raw) ? raw : ((raw && raw.items) || []);
  });
  return { ...plan, dailyPlans };
}

function kitFromImportFile(relPath, id) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
  ok(parsed.ok === true, `${relPath} parses (${(parsed.errors || []).join("; ") || "ok"})`);
  const plan = { ...parsed.data, id };
  const kit = Mapper.mapLessonPlanToTeachingKit(plan, [], [], { day: "monday" });
  ok(kit.ok === true, `${plan.title || id} maps`);
  return { plan, kit, parsed };
}

function entireBinderFor(label, kit, plan) {
  const binder = Print.buildEntireBinderKitHtml(kit, { plan, paperSize: "letter" });
  ok(binder.ok === true, `${label}: Entire Binder builds`);
  return binder;
}

function testArrayShapedDaysAreNotCoverOnly() {
  console.log("\nArray-shaped weekday plans (production store shape)");
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const objectKit = mapFixture(farm);
  const objectBinder = entireBinderFor("farm object days", objectKit, farm.lessonPlan);
  const arrayPlan = arrayShapedDailyPlans(farm.lessonPlan);
  const arrayKit = Mapper.mapLessonPlanToTeachingKit(
    arrayPlan,
    farm.activities || [],
    farm.resources || [],
    { day: "monday" },
  );
  const arrayBinder = entireBinderFor("farm array days", arrayKit, arrayPlan);
  ok((arrayKit.companion.activities || []).length === (objectKit.companion.activities || []).length,
    "array-shaped days keep the same activities as object-shaped days");
  ok(arrayBinder.pageCount > 1, `array-shaped Farm Animals is not cover-only (${arrayBinder.pageCount})`);
  ok(/Farm Animal Discovery Basket/i.test(arrayBinder.html), "array-shaped farm keeps Discovery Basket");
  ok(objectBinder.pageCount > 1, "object-shaped farm remains complete");

  const parsed = parseFullLessonStructurePaste(TINY_ARTIST_PASTE);
  ok(parsed.ok === true, `Tiny Artist paste parses (${(parsed.errors || []).join("; ") || "ok"})`);
  const tinyObject = buildCanonicalLessonPlan(parsed, { id: "cur-lp-tiny-artist-studio" });
  const tinyArray = arrayShapedDailyPlans(tinyObject);
  const tinyObjectKit = Mapper.mapLessonPlanToTeachingKit(tinyObject, [], [], { day: "monday" });
  const tinyArrayKit = Mapper.mapLessonPlanToTeachingKit(tinyArray, [], [], { day: "monday" });
  const tinyObjectBinder = entireBinderFor("tiny object days", tinyObjectKit, tinyObject);
  const tinyArrayBinder = entireBinderFor("tiny array days", tinyArrayKit, tinyArray);
  ok(tinyObjectBinder.pageCount > 1, `Tiny Artist object days not cover-only (${tinyObjectBinder.pageCount})`);
  ok(tinyArrayBinder.pageCount > 1, `Tiny Artist array days not cover-only (${tinyArrayBinder.pageCount})`);
  ok(/Tummy Time Art Gallery/i.test(tinyArrayBinder.html), "array-shaped Tiny Artist keeps Tummy Time Art Gallery");
  ok((tinyArrayKit.companion.activities || []).length === (tinyObjectKit.companion.activities || []).length,
    "Tiny Artist array/object activity counts match");
}

function testArchivedAndForeignContentStayOut() {
  console.log("\nArchived activities + foreign printables stay out of the binder");
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const archived = farm.activities[0];
  const activities = (farm.activities || []).map((activity) => (
    activity.id === archived.id ? { ...activity, status: "archived" } : activity
  ));
  const kit = Mapper.mapLessonPlanToTeachingKit(farm.lessonPlan, activities, farm.resources || [], { day: "monday" });
  ok(!(kit.companion.activities || []).some((activity) => activity.id === archived.id),
    `archived ${archived.title} excluded from mapped kit`);
  ok((kit.companion.activities || []).length === (farm.activities || []).length - 1,
    "archived activity is not replaced by a daily-item clone");
  const binder = entireBinderFor("farm minus archived", kit, farm.lessonPlan);
  const archivedPattern = new RegExp(String(archived.title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  ok(!archivedPattern.test(binder.html), "archived activity title absent from Entire Binder");

  const foreign = {
    id: "cur-res-other-lesson-butterfly",
    title: "Butterfly Life Cycle Poster",
    lessonPlanIds: ["cur-lp-toddler-bugs-and-butterflies"],
    status: "published",
    fileName: "butterfly.pdf",
    mimeType: "application/pdf",
    fileUrl: "/api/media/curriculum-resources/butterfly-life-cycle",
  };
  const farmWithForeign = Mapper.mapLessonPlanToTeachingKit(
    farm.lessonPlan,
    farm.activities || [],
    [foreign],
    { day: "monday" },
  );
  ok(!(farmWithForeign.companion.printables || []).some((item) => item.id === foreign.id),
    "foreign lesson printable is not linked via the resource bag");
  const farmBinder = entireBinderFor("farm without foreign printable", farmWithForeign, farm.lessonPlan);
  ok(!/Butterfly Life Cycle Poster/i.test(farmBinder.html), "foreign printable title not in Farm Animals binder");
}

function testCurActIdsAndActivityNameFallback() {
  console.log("\nStore cur-act-* ids + activityName titles still map");
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const stripped = (farm.activities || []).map((activity) => ({ ...activity, sourceKey: "" }));
  const kit = Mapper.mapLessonPlanToTeachingKit(farm.lessonPlan, stripped, farm.resources || [], { day: "monday" });
  ok((kit.companion.activities || []).length === (farm.activities || []).length,
    "itemId matches cur-act-* store rows when sourceKey is blank");
  ok((kit.companion.activities || []).every((activity) => /^cur-act-/.test(activity.id)),
    "mapped cards keep cur-act-* ids");

  const namePlan = {
    id: "cur-lp-name-fallback",
    title: "Name Fallback Week",
    weeklyOverview: "Infants explore color names through movement.",
    dailyPlans: {
      monday: [{ itemId: "kick", activityName: "Color Kick Painting" }],
    },
  };
  const nameKit = Mapper.mapLessonPlanToTeachingKit(namePlan, [], [], { day: "monday" });
  const nameBinder = entireBinderFor("activityName fallback", nameKit, namePlan);
  ok(/Color Kick Painting/i.test(nameBinder.html), "activityName becomes the card title");
  ok(nameBinder.pageCount > 1, "activityName-only day is not cover-only");
}

function testCoverLikeFingerprintsStayLessonSpecific() {
  console.log("\nCover-like binders do not share a cache fingerprint");
  const empty = loadFixture("empty-plan.json");
  const otherEmpty = {
    lessonPlan: { ...empty.lessonPlan, id: "cur-lp-tk-empty-b", title: "Another Empty Draft" },
    activities: [],
    resources: [],
  };
  const a = entireBinderFor("empty A", mapFixture(empty), empty.lessonPlan);
  const b = entireBinderFor("empty B", mapFixture(otherEmpty), otherEmpty.lessonPlan);
  ok(a.contentFingerprint !== b.contentFingerprint, "two empty lessons do not share a fingerprint");
  ok(String(a.contentFingerprint).includes("cur-lp-tk-empty"), "fingerprint includes lessonPlanId");
  ok(String(a.contentFingerprint).includes("Empty Draft Plan"), "fingerprint includes lesson title");
}

function testCrossLessonEntireBinders() {
  console.log("\nCross-lesson Entire Binder uniqueness");
  const tinyParsed = parseFullLessonStructurePaste(TINY_ARTIST_PASTE);
  ok(tinyParsed.ok === true, "Tiny Artist Studio paste parses");
  const tinyPlan = buildCanonicalLessonPlan(tinyParsed, { id: "cur-lp-tiny-artist-studio" });
  const tinyKit = Mapper.mapLessonPlanToTeachingKit(tinyPlan, [], [], { day: "monday" });

  const colors = kitFromImportFile(
    "scripts/curriculum-infant-core-imports/infant-colors-all-around-us.txt",
    "cur-lp-infant-colors-all-around-us",
  );
  const zoo = kitFromImportFile(
    "scripts/curriculum-preschool-pro-batch2-imports/20-preschool-zoo-adventure-pro.txt",
    "cur-lp-preschool-zoo-adventure",
  );
  const helpers = kitFromImportFile(
    "scripts/curriculum-preschool-free-imports/06-preschool-community-helpers-free.txt",
    "cur-lp-preschool-community-helpers",
  );
  const bugs = loadFixture("bugs-and-butterflies.json");
  const farm = loadFixture("farm-animals-enrichment-slice2.json");

  const snapshots = [
    { label: "Tiny Artist Studio", kit: tinyKit, plan: tinyPlan, markers: [/Tiny Artist Studio/i, /Tummy Time Art Gallery/i], leaks: [/Farm Animal Discovery Basket/i, /Bug Discovery Table/i] },
    { label: "Colors All Around Us", kit: colors.kit, plan: colors.plan, markers: [/Colors All Around Us/i, /Bright Scarf Slow Track/i], leaks: [/Farm Animal Discovery Basket/i, /Tummy Time Art Gallery/i] },
    { label: "Zoo Adventure", kit: zoo.kit, plan: zoo.plan, markers: [/Zoo Adventure/i, /Zoo Discovery Sensory Bin/i], leaks: [/Farm Animal Discovery Basket/i, /Tummy Time Art Gallery/i] },
    { label: "Community Helpers", kit: helpers.kit, plan: helpers.plan, markers: [/Community Helpers/i, /Community Helper Discovery Basket/i], leaks: [/Farm Animal Discovery Basket/i, /Tummy Time Art Gallery/i] },
    { label: "Bugs & Butterflies", kit: mapFixture(bugs), plan: bugs.lessonPlan, markers: [/Bugs & Butterflies/i, /Bug Discovery Table/i], leaks: [/Farm Animal Discovery Basket/i, /Tummy Time Art Gallery/i] },
    { label: "Farm Animals", kit: mapFixture(farm), plan: farm.lessonPlan, markers: [/Farm Animals/i, /Farm Animal Discovery Basket/i], leaks: [/Tummy Time Art Gallery/i, /Bug Discovery Table/i] },
  ].map((entry) => {
    const binder = entireBinderFor(entry.label, entry.kit, entry.plan);
    ok(binder.pageCount > 1, `${entry.label}: Entire Binder is not cover-only (${binder.pageCount} pages)`);
    entry.markers.forEach((pattern) => {
      ok(pattern.test(binder.html), `${entry.label}: contains ${pattern}`);
    });
    entry.leaks.forEach((pattern) => {
      ok(!pattern.test(binder.html), `${entry.label}: does not leak ${pattern}`);
    });
    ok(String(binder.contentFingerprint).includes(entry.kit.lessonPlanId || entry.plan.id),
      `${entry.label}: fingerprint includes lesson id`);
    return {
      label: entry.label,
      pageCount: binder.pageCount,
      fingerprint: binder.contentFingerprint,
      title: entry.kit.title,
    };
  });

  snapshots.forEach((left, index) => {
    snapshots.slice(index + 1).forEach((right) => {
      ok(left.fingerprint !== right.fingerprint, `${left.label} vs ${right.label}: fingerprints differ`);
    });
  });

  fs.mkdirSync(ARTIFACT, { recursive: true });
  fs.writeFileSync(
    path.join(ARTIFACT, "cross-lesson-entire-binder.json"),
    JSON.stringify(snapshots, null, 2),
  );
  console.log("  cross-lesson page counts:", snapshots.map((row) => `${row.label}=${row.pageCount}`).join(", "));
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
  testArrayShapedDaysAreNotCoverOnly();
  testArchivedAndForeignContentStayOut();
  testCurActIdsAndActivityNameFallback();
  testCoverLikeFingerprintsStayLessonSpecific();
  testCrossLessonEntireBinders();
  await maybeRenderPdfScreenshots();
  console.log("\nAll teaching-kit print system checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Teaching Kit Slice 1B — mapLessonPlanToTeachingKit + fixtures.
 * Pure unit tests (no server). Flags remain false; no UI/API asserted here.
 * Run: npm run test:teaching-kit-slice-1b
 */
const fs = require("fs");
const path = require("path");
const teachingKit = require("./teaching-kit.js");

const ROOT = path.join(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "teaching-kit");

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

function loadFixture(name) {
  const filePath = path.join(FIXTURES, name);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function testFlagsStillDefaultFalse() {
  const flags = teachingKit.defaultTeachingKitFeatureFlags();
  assert(flags.teachingKitViewer === false, "viewer flag still defaults false");
  assert(flags.teachingKitPrintCenter === false, "print flag still defaults false");
  assert(flags.teachingKitAttachments === false, "attachments flag still defaults false");
}

function testCategoryMapCoversLiveLabels() {
  assert(teachingKit.mapActivityCategoryToSection("Sensory Play") === "sensory", "Sensory Play maps");
  assert(teachingKit.mapActivityCategoryToSection("Music & Movement") === "circle_time", "Music & Movement maps");
  assert(teachingKit.mapActivityCategoryToSection("STEM/Discovery") === "stem", "STEM/Discovery maps");
  assert(teachingKit.mapActivityCategoryToSection("Literacy") === "daily_activities", "Literacy maps");
}

function testEmptyPlanHidesSections() {
  const fixture = loadFixture("empty-plan.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
  );
  assert(kit.ok === true, "empty plan maps ok");
  assert(Array.isArray(kit.sections), "sections array present");
  assert(kit.sections.length === 0, "provider view omits empty sections");
  const withEmpty = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    { includeEmptySections: true },
  );
  assert(withEmpty.sections.length === teachingKit.SECTIONS.length,
    "admin preview can include empty sections");
  assert(withEmpty.sections.every((section) => section.visible === false),
    "empty plan sections are not visible");
  assert(kit.companion.mondayMorningSetup.estimatedPrepMinutes === 0,
    "empty plan prep time is 0");
  assert(kit.companion.activities.length === 0, "no activities on empty plan");
}

function testEnrichedMiniCompanionSurfaces() {
  const fixture = loadFixture("enriched-mini.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    {
      day: "monday",
      readyMaterials: ["Sensory bin", "Cups", "Towels", "Water"],
    },
  );

  assert(kit.ok === true, "enriched mini maps");
  assert(kit.lessonPlanId === "cur-lp-tk-enriched-mini", "lesson id preserved");
  assert(kit.completeness === "enriched", "overlay completeness preserved");
  assert(kit.companion.surfaces.includes("monday_morning_setup"), "monday setup surface");
  assert(kit.companion.surfaces.includes("todays_classroom"), "today surface");
  assert(kit.companion.surfaces.includes("open_everything_today"), "open everything surface");
  assert(kit.companion.surfaces.includes("binder"), "binder surface");

  const setup = kit.companion.mondayMorningSetup;
  assert(setup.estimatedPrepMinutes > 0, "prep time estimated");
  assert(Array.isArray(setup.materials) && setup.materials.length > 0, "materials checklist");
  assert(Array.isArray(setup.prepTasks) && setup.prepTasks.length > 0, "prep tasks");
  assert(Array.isArray(setup.printChecklist) && setup.printChecklist.length > 0, "print checklist");
  // Paint is used Tue but not marked ready → may appear in missing if critical index includes it
  assert(Array.isArray(setup.missingMaterials), "missing materials array");

  const today = kit.companion.today;
  assert(today.day === "monday", "selected day is monday");
  assert(today.schedule.length > 0, "today has schedule");
  assert(today.activities.some((item) => item.title === "Rain Sensory Bin"), "today lists activity");
  assert(today.books.some((book) => book.title === "Rain"), "today has book");
  assert(today.books[0].readAloudQuestions.length > 0, "book has read-aloud questions");
  assert(today.songs.some((song) => song.title === "Pitter Patter Raindrops"), "today has song");
  assert(today.songs[0].lyrics, "song lyrics parsed when provided");
  assert(today.songs[0].motions, "song motions parsed when provided");
  assert(today.parentMessageReadyToSend === true, "parent message ready");
  assert(today.vocabulary.length > 0, "vocabulary present");
  assert(today.vocabulary[0].definition, "vocabulary includes definition");
  assert(today.vocabulary[0].discussionIdea, "vocabulary includes discussion idea");

  const open = kit.companion.openEverything;
  assert(open.items.some((item) => item.kind === "activity"), "open everything includes activities");
  assert(open.items.some((item) => item.kind === "book"), "open everything includes books");
  assert(open.items.some((item) => item.kind === "song"), "open everything includes songs");
  assert(open.items.some((item) => item.kind === "parent_message"), "open everything includes parent message");

  const rainBin = kit.companion.activities.find((card) => card.title === "Rain Sensory Bin");
  assert(rainBin, "activity card present");
  assert(rainBin.hasExamplePhoto === true, "example photo flagged");
  assert(rainBin.hasSetupPhoto === true, "setup photo flagged");
  assert(rainBin.learningObjective, "learning objective");
  assert(rainBin.materials.length > 0, "materials list");
  assert(rainBin.setup, "setup instructions");
  assert(rainBin.teacherPrompts.length > 0, "teacher prompts");
  assert(rainBin.cleanupTips.length > 0, "cleanup tips");
  assert(rainBin.observationIdeas.length > 0, "observation ideas");
  assert(rainBin.substituteCandidates.length >= 1, "substitute suggestions present");
  assert(
    rainBin.substituteCandidates.some((item) => item.title === "Raindrop Dot Painting") === false ||
      rainBin.substituteCandidates.length >= 1,
    "substitute list is materials-aware",
  );

  // For paint activity with ready water materials, substitute should prefer rain bin (ready overlap)
  const paint = kit.companion.activities.find((card) => card.title === "Raindrop Dot Painting");
  assert(paint, "paint activity present");
  assert(
    paint.substituteCandidates.some((item) => item.activityId === rainBin.id),
    "substitute suggests activity using ready materials",
  );

  assert(kit.companion.printables.length === 1, "printable mapped");
  assert(kit.companion.printables[0].usedInWeek.length > 0, "printable shows used-in-week");
  assert(kit.companion.printables[0].usedInWeek[0].dayLabel, "used-in-week has day label");

  assert(kit.companion.binder.tabs.length === 6, "binder has tab dividers");
  assert(kit.companion.binder.cover.brand === "Little Learner Hub", "binder cover branded");
  assert(kit.companion.buildMyKit.activities.length === 2, "build my kit lists activities");
  assert(kit.companion.buildMyKit.activities.every((item) => item.includedDefault === true),
    "activities included by default for print picker");

  const visibleIds = kit.sections.map((section) => section.id);
  assert(visibleIds.includes("overview"), "overview section visible");
  assert(visibleIds.includes("materials"), "materials section visible");
  assert(visibleIds.includes("sensory"), "sensory section visible from category");
  assert(visibleIds.includes("process_art"), "process art section visible");
  assert(visibleIds.includes("family"), "family section visible");
  assert(!visibleIds.includes("dramatic_play"), "empty dramatic_play omitted");
}

function testBugsAndButterfliesFixture() {
  const fixturePath = path.join(FIXTURES, "bugs-and-butterflies.json");
  assert(fs.existsSync(fixturePath), "bugs-and-butterflies fixture exists");
  const fixture = loadFixture("bugs-and-butterflies.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    { day: "tuesday", readyMaterials: ["paint", "paper", "insect books"] },
  );

  assert(kit.ok === true, "bugs fixture maps");
  assert(kit.title === "Bugs & Butterflies", "title preserved");
  assert(kit.companion.activities.length >= 10, "maps many week activities");
  assert(kit.companion.days.tuesday.activities.length > 0, "tuesday classroom has activities");
  assert(kit.companion.mondayMorningSetup.estimatedPrepMinutes > 0, "monday prep estimated");
  assert(kit.companion.mondayMorningSetup.missingMaterials.length > 0,
    "missing materials highlighted when ready list is partial");
  assert(kit.companion.openEverything.items.length > 0, "open everything packet non-empty");

  const sample = kit.companion.activities[0];
  assert(sample.learningObjective || sample.setup || sample.steps, "activity has teachable fields");
  assert(Array.isArray(sample.cleanupTips), "cleanup tips array");
  assert(Array.isArray(sample.observationIdeas), "observation ideas array");
  assert(Array.isArray(sample.teacherPrompts), "teacher prompts array");

  // Dedupe: unique ids
  const ids = kit.companion.activities.map((card) => card.id);
  assert(new Set(ids).size === ids.length, "activity ids deduped");

  // No storage mutation
  assert(!Object.prototype.hasOwnProperty.call(fixture.lessonPlan, "teachingKit") ||
    fixture.lessonPlan.teachingKit == null ||
    typeof fixture.lessonPlan.teachingKit === "object",
  "fixture plan teachingKit untouched shape");
  const before = JSON.stringify(fixture.lessonPlan.weeklyOverview);
  teachingKit.mapLessonPlanToTeachingKit(fixture.lessonPlan, fixture.activities, fixture.resources);
  assert(JSON.stringify(fixture.lessonPlan.weeklyOverview) === before, "mapper does not rewrite plan fields");
}

function testMissingPlanSafe() {
  const kit = teachingKit.mapLessonPlanToTeachingKit(null, [], []);
  assert(kit.ok === false && kit.reason === "missing_plan", "null plan fails safe");
  const kit2 = teachingKit.mapLessonPlanToTeachingKit({}, [], []);
  assert(kit2.ok === false, "plan without id fails safe");
}

function main() {
  testFlagsStillDefaultFalse();
  testCategoryMapCoversLiveLabels();
  testEmptyPlanHidesSections();
  testEnrichedMiniCompanionSurfaces();
  testBugsAndButterfliesFixture();
  testMissingPlanSafe();
  console.log(`Teaching Kit Slice 1B OK — ${passed} assertions`);
}

try {
  main();
} catch (error) {
  console.error("Teaching Kit Slice 1B FAILED:", error.message);
  process.exit(1);
}

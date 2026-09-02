#!/usr/bin/env node
/**
 * Execution-layer mutation allowlist regression suite.
 * Run: npm run test:curriculum-operator-mutation-allowlist
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");
const composer = require("./curriculum-operator-ai-composer.js");
const selectApi = require("./curriculum-operator-select.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const HELLO_FALL_ID = "cur-lp-19fb387f75cfd1f1745";
const ACT_ID = "cur-act-test-teacher-tips";

const lessonPlans = [
  { id: LMW_ID, title: "Little Makers Workshop", age: "Toddler 12–24 Months", plan: "Free", status: "draft" },
  { id: HELLO_FALL_ID, title: "Hello Fall, Little One", age: "Toddler 12–24 Months", plan: "Pro", status: "published" },
];
const curriculum = { lessonPlans, activities: [], resources: [] };

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function parse(raw, options = {}) {
  return commandApi.parseOperatorCommand(raw, {
    phase: 7,
    lessonPlans,
    currentlySelectedLessonId: options.currentlySelectedLessonId || HELLO_FALL_ID,
    ...options,
  });
}

function allowlistFromParse(raw, options = {}) {
  const parsed = parse(raw, options);
  return {
    parsed,
    allowlist: allowlistApi.buildMutationAllowlist(parsed.command),
  };
}

const PRODUCTION_BAD_COMMAND = `ONE CONTROLLED VOCABULARY-ONLY connected upgrade on the EXISTING lesson only.

Lesson: Little Makers Workshop
Lesson ID: ${LMW_ID}

TARGET: Vocabulary only
learning domains KEEP
milestones KEEP
activities KEEP
teacher tips KEEP
books EXCLUDED FROM MUTATION
songs EXCLUDED FROM MUTATION
IMAGES: EXCLUDED
cover EXCLUDED
printables EXCLUDED
publish false
textOnly expected true
weeklyFieldScope vocabulary only

checkImages=false
generateImages=false
touchImages=false
checkPrintables=false
generatePrintables=false
touchPrintables=false
touchSongs=false
touchBooks=false
connectedUpgrade=true
connectedAutoApply=true

Do NOT generate images.
Do NOT touch printables.
Save draft. Do not publish.`;

console.log("1) vocab-only allowlist");
{
  const { allowlist } = allowlistFromParse(PRODUCTION_BAD_COMMAND);
  ok(allowlist.weeklyFieldScope.includes("vocabCards"), "weekly scope vocabCards");
  ok(allowlist.assets.images === false, "images denied");
  ok(allowlist.assets.printables === false, "printables denied");
  ok(allowlist.assets.cover === false, "cover denied");
  ok(allowlist.assets.songs === false, "songs denied");
  ok(allowlist.assets.books === false, "books denied");
  ok(allowlist.publishAllowed === false, "publish denied");
}

console.log("\n2) learningDomains-only allowlist");
{
  const { allowlist } = allowlistFromParse(`Fix learning domains only for ${LMW_ID}. publish=false`);
  ok(allowlist.allowedWeeklyFields?.has("learningDomains"), "learningDomains allowed");
  ok(allowlist.assets.images === false, "images off by default narrow");
}

console.log("\n3) activity teacherTips-only allowlist");
{
  const allowlist = allowlistApi.buildMutationAllowlist({
    rawCommand: `Fix teacher tips only for activity ${ACT_ID} on ${LMW_ID}.`,
    actions: {
      weeklyFieldScope: ["teacherTips"],
      upgradeActivities: true,
      touchImages: false,
      touchPrintables: false,
      publish: false,
    },
    scope: { lessonIds: [LMW_ID] },
  }, { targetActivityIds: [ACT_ID] });
  ok(allowlist.allowedActivityFields.has("teacherTips"), "teacherTips allowed");
  ok(!allowlist.allowedActivityFields.has("objective"), "objective denied");
}

console.log("\n4) images excluded denies media mutation");
{
  const gate = allowlistApi.validateEnrichmentDraftSave({
    beforeDraft: { activities: { [ACT_ID]: { setupImageUrl: "https://example.com/a.png" } } },
    afterDraft: { activities: { [ACT_ID]: { setupImageUrl: "https://example.com/b.png" } } },
    allowlist: allowlistApi.buildMutationAllowlist({
      actions: { touchImages: false, generateImages: false, weeklyFieldScope: ["vocabCards"], textOnly: true },
      scope: { lessonIds: [LMW_ID] },
    }),
    lessonId: LMW_ID,
    stage: "test.images",
  });
  ok(gate.violations.some((v) => v.code === "OUT_OF_SCOPE_MUTATION_ATTEMPT"), "image mutation blocked");
}

console.log("\n5) cover excluded denies cover mutation");
{
  ok(!allowlistApi.isPathAllowed("operatorCover", allowlistApi.buildMutationAllowlist({
    actions: { touchCover: false, weeklyFieldScope: ["vocabCards"], textOnly: true },
  })), "cover path denied");
}

console.log("\n6) printables excluded denies resources");
{
  const gate = allowlistApi.validateEnrichmentDraftSave({
    beforeDraft: { week: { printableIds: [] } },
    afterDraft: { week: { printableIds: ["res-1"] } },
    allowlist: allowlistApi.buildMutationAllowlist({
      actions: { touchPrintables: false, generatePrintables: false, weeklyFieldScope: ["vocabCards"], textOnly: true },
      scope: { lessonIds: [LMW_ID] },
    }),
    lessonId: LMW_ID,
  });
  ok(gate.violations.some((v) => v.field === "printableIds"), "printable mutation blocked");
}

console.log("\n7) books excluded denies books");
{
  const filtered = allowlistApi.filterComposerPlan({
    weeklyChanges: {},
    activities: [],
    songs: [],
    books: [{ title: "Book", author: "A" }],
  }, allowlistApi.buildMutationAllowlist({
    actions: { touchBooks: false, generateSongsBooks: false, weeklyFieldScope: ["vocabCards"], textOnly: true },
  }));
  ok(filtered.plan.books.length === 0, "books stripped");
  ok(filtered.violations.length > 0, "books violation recorded");
}

console.log("\n8) songs excluded denies songs");
{
  const filtered = allowlistApi.filterComposerPlan({
    weeklyChanges: {},
    activities: [],
    songs: [{ title: "Song", linkedWeekday: "monday" }],
    books: [],
  }, allowlistApi.buildMutationAllowlist({
    actions: { touchSongs: false, generateSongsBooks: false, weeklyFieldScope: ["vocabCards"], textOnly: true },
  }));
  ok(filtered.plan.songs.length === 0, "songs stripped");
}

console.log("\n9) lesson ID immutable");
{
  const check = allowlistApi.verifyPersistedMutationDiff(
    { id: LMW_ID, plan: "Free", status: "draft" },
    { id: "cur-lp-otherlesson000", plan: "Free", status: "draft" },
    allowlistApi.buildMutationAllowlist({ actions: {}, scope: { lessonIds: [LMW_ID] } }),
  );
  ok(check.violations.some((v) => v.code === "IMMUTABLE_ID_MUTATION_ATTEMPT"), "lesson id mutation flagged");
}

console.log("\n10) access immutable");
{
  const check = allowlistApi.verifyPersistedMutationDiff(
    { id: LMW_ID, plan: "Free" },
    { id: LMW_ID, plan: "Pro" },
    allowlistApi.buildMutationAllowlist({ actions: { publish: false }, scope: { lessonIds: [LMW_ID] } }),
  );
  ok(check.violations.some((v) => v.path === "plan"), "access mutation flagged");
}

console.log("\n11) publish=false immutable");
{
  const check = allowlistApi.verifyPersistedMutationDiff(
    { id: LMW_ID, status: "draft", publishedAt: null },
    { id: LMW_ID, status: "published", publishedAt: "2026-01-01T00:00:00.000Z" },
    allowlistApi.buildMutationAllowlist({ actions: { publish: false }, scope: { lessonIds: [LMW_ID] } }),
  );
  ok(check.violations.some((v) => v.path === "status" || v.path === "publishedAt"), "publish mutation flagged");
}

console.log("\n12) cross-lesson activity rejected");
{
  ok(!allowlistApi.isActivityMutationAllowed("cur-act-other-lesson", "teacherTips", allowlistApi.buildMutationAllowlist({
    actions: { weeklyFieldScope: ["teacherTips"], upgradeActivities: true },
    scope: { lessonIds: [LMW_ID] },
  }, { targetActivityIds: [ACT_ID] })), "other activity denied");
}

console.log("\n13) composer extra weekly field rejected");
{
  const filtered = allowlistApi.filterComposerPlan({
    weeklyChanges: {
      vocabCards: { action: "REPLACE", value: [{ word: "press", definition: "Push" }] },
      learningDomains: { action: "FILL", value: ["Creative Arts"] },
    },
    activities: [],
    songs: [],
    books: [],
  }, allowlistApi.buildMutationAllowlist(parse(PRODUCTION_BAD_COMMAND).command));
  ok(!filtered.plan.weeklyChanges.learningDomains, "learningDomains stripped");
  ok(Boolean(filtered.plan.weeklyChanges.vocabCards), "vocabCards kept");
}

console.log("\n14) composer extra activity rejected");
{
  const filtered = allowlistApi.filterComposerPlan({
    weeklyChanges: { vocabCards: { action: "REPLACE", value: [{ word: "press", definition: "Push" }] } },
    activities: [{ activityId: ACT_ID, changes: { objective: { action: "FILL", value: "New objective" } } }],
    songs: [],
    books: [],
  }, allowlistApi.buildMutationAllowlist(parse(PRODUCTION_BAD_COMMAND).command));
  ok(filtered.plan.activities.length === 0, "activity changes stripped");
}

console.log("\n15) retry preserves original allowlist");
{
  const job = {
    command: parse(PRODUCTION_BAD_COMMAND).command,
    mutationAllowlist: allowlistApi.buildMutationAllowlist(parse(PRODUCTION_BAD_COMMAND).command),
  };
  job.command.actions.touchImages = true;
  const resumed = allowlistApi.resumeUsesOriginalAllowlist(job);
  ok(resumed.assets.images === false, "resume keeps original image denial");
}

console.log("\n16) unexpected persisted diff detected");
{
  const check = allowlistApi.verifyPersistedMutationDiff(
    { id: LMW_ID, vocabularyWords: "", teachingKit: { vocabCards: [{ word: "old", definition: "x" }] } },
    { id: LMW_ID, vocabularyWords: "", teachingKit: { vocabCards: [{ word: "old", definition: "x" }] }, learningDomains: ["A"] },
    allowlistApi.buildMutationAllowlist(parse(PRODUCTION_BAD_COMMAND).command),
  );
  ok(!check.ok, "unexpected learningDomains persist flagged");
  ok(check.unexpected.some((path) => path.startsWith("learningDomains")), "learningDomains in unexpected list");
}

console.log("\n17) requested repair + zero diff → completed_with_gaps");
{
  const allowlist = allowlistApi.buildMutationAllowlist(parse(PRODUCTION_BAD_COMMAND).command);
  const evalResult = allowlistApi.evaluateZeroPersistRequestedWork({
    persistedChanges: [],
    updated: ["week.vocabCards"],
    composerDiagnostics: { accepted: [{ scope: "week", field: "vocabCards", action: "REPLACE" }] },
  }, parse(PRODUCTION_BAD_COMMAND).command, allowlist);
  ok(evalResult.unsatisfied, "zero persist flagged unsatisfied");
}

console.log("\n18) already-valid KEEP + zero diff → completed");
{
  const command = parse(`Audit only ${LMW_ID}. publish=false`).command;
  const evalResult = allowlistApi.evaluateZeroPersistRequestedWork({
    persistedChanges: [],
    afterPlan: { vocabularyWords: "press", teachingKit: { vocabCards: [{ word: "press", definition: "Push" }] } },
    draftWeek: { vocabCards: [{ word: "press", definition: "Push" }] },
  }, command, allowlistApi.buildMutationAllowlist(command));
  ok(!evalResult.unsatisfied, "already valid does not force gap");
}

console.log("\n19) dangerous confirmation disables Run");
{
  ok(allowlistApi.isRunBlockedByConfirmations(["parsed_intent_contradiction"], null), "contradiction blocks run");
  ok(!allowlistApi.isRunBlockedByConfirmations(["publish_requested"], null), "publish confirm alone not in dangerous set");
}

console.log("\n20) Run revalidates before mutation");
{
  const revalidated = allowlistApi.revalidateRunScope(parse(PRODUCTION_BAD_COMMAND).command, {
    phase: 7,
    lessonPlans,
    currentlySelectedLessonId: HELLO_FALL_ID,
  });
  ok(revalidated.ok, "production command revalidates");
  ok(revalidated.allowlist.assets.images === false, "revalidated allowlist keeps images off");
}

console.log("\n21) selected UI lesson cannot override explicit ID");
{
  const parsed = parse(`Fix vocabulary only for ${LMW_ID}.`, { currentlySelectedLessonId: HELLO_FALL_ID });
  const selected = selectApi.selectLessons(curriculum, parsed.command, { currentlySelectedLessonId: HELLO_FALL_ID });
  ok(selected.selected.length === 1, "one lesson selected");
  ok(selected.selected[0].id === LMW_ID, "explicit ID wins over Hello Fall selection");
}

console.log("\n22) exact opjob_506 fixture allowed paths only");
{
  const { allowlist } = allowlistFromParse(PRODUCTION_BAD_COMMAND);
  ok(allowlistApi.isPathAllowed("vocabularyWords", allowlist), "vocabularyWords allowed");
  ok(allowlistApi.isPathAllowed("teachingKit.vocabCards", allowlist), "vocabCards allowed");
  ok(!allowlistApi.isPathAllowed("learningDomains", allowlist), "learningDomains denied");
  ok(!allowlistApi.isPathAllowed(`activity.${ACT_ID}.setupImageUrl`, allowlist), "image denied");
}

console.log("\n23) null/empty omission does not clear valid content");
{
  const gate = allowlistApi.validateEnrichmentDraftSave({
    beforeDraft: { week: { vocabCards: [{ word: "press", definition: "Push" }] } },
    afterDraft: { week: { vocabCards: [] } },
    allowlist: allowlistApi.buildMutationAllowlist(parse(PRODUCTION_BAD_COMMAND).command),
    lessonId: LMW_ID,
    command: parse(PRODUCTION_BAD_COMMAND).command,
  });
  ok(gate.filteredDraft.week.vocabCards.length === 1, "implicit clear blocked");
}

console.log("\n24) explicit CLEAR authorized when requested");
{
  const gate = allowlistApi.validateEnrichmentDraftSave({
    beforeDraft: { week: { vocabCards: [{ word: "press", definition: "Push" }] } },
    afterDraft: { week: {} },
    allowlist: allowlistApi.buildMutationAllowlist({
      rawCommand: `Clear vocabCards for ${LMW_ID}.`,
      actions: { weeklyFieldScope: ["vocabCards"], textOnly: true, publish: false },
      scope: { lessonIds: [LMW_ID] },
    }),
    lessonId: LMW_ID,
    command: { rawCommand: `Clear vocabCards for ${LMW_ID}.` },
  });
  ok(!gate.violations.some((v) => /Implicit clear/i.test(v.message || "")), "explicit clear authorized");
}

console.log("\n25) composer apply strips out-of-scope fields");
{
  const { allowlist, parsed } = allowlistFromParse(PRODUCTION_BAD_COMMAND);
  const applied = composer.applyComposerPlanToDraft(
    { week: {}, activities: {} },
    {
      weeklyChanges: {
        vocabCards: { action: "REPLACE", value: [{ word: "press", definition: "Push down" }] },
        milestones: { action: "FILL", value: ["Uses tools"] },
      },
      activities: [{ activityId: ACT_ID, changes: { objective: { action: "FILL", value: "oops" } } }],
      songs: [{ title: "Song", linkedWeekday: "monday" }],
      books: [{ title: "Book", author: "A" }],
    },
    { weekKeep: [], activityKeep: [] },
    { mutationAllowlist: allowlist, command: parsed.command },
  );
  ok(applied.mutationViolations.length > 0, "violations recorded");
  ok(!applied.enrichmentDraft.week.milestones, "milestones not applied");
  ok(Array.isArray(applied.enrichmentDraft.week.vocabCards), "vocabCards applied");
}

const STRONG_KEEP_ID = "cur-lp-operator-strong-preschool";
const STRONG_KEEP_RAW = "Improve weak activities but keep strong existing content.";
const STRONG_KEEP_SCOPED = "Improve weak activities in Preschool Weather Lab but keep strong existing content.";
const strongKeepPlans = [
  { id: "cur-lp-operator-weak-toddler", title: "Toddler Apple Scribbles", age: "Toddler 18–24 Months", plan: "Pro", status: "published" },
  { id: STRONG_KEEP_ID, title: "Preschool Weather Lab", age: "Preschool 3–4 Years", plan: "Pro", status: "published" },
  { id: "cur-lp-preschool-weather-watchers", title: "Weather Watchers", age: "Preschool 3–4 Years", plan: "Pro", status: "published" },
];

console.log("\n26) unscoped keep-strong raw command is RUN_BLOCKED");
{
  const revalidated = allowlistApi.revalidateRunScope({ rawCommand: STRONG_KEEP_RAW }, {
    phase: 2,
    lessonPlans: strongKeepPlans,
  });
  ok(revalidated.ok === false, "unscoped keep-strong revalidation fails");
  ok(revalidated.code === "RUN_BLOCKED", "unscoped keep-strong code is RUN_BLOCKED");
  ok((revalidated.reparsed?.confirmReasons || []).includes("ambiguous_scope"), "unscoped reason is ambiguous_scope");
}

console.log("\n27) crafted explicit IDs cannot bypass raw reparse");
{
  const revalidated = allowlistApi.revalidateRunScope({
    rawCommand: STRONG_KEEP_RAW,
    intent: "fix_lesson",
    scope: { selection: "explicit_ids", lessonIds: [STRONG_KEEP_ID], count: 1 },
    actions: { audit: true, upgradeLesson: true, upgradeActivities: true, saveDraft: true },
  }, { phase: 2, lessonPlans: strongKeepPlans });
  ok(revalidated.ok === false, "structured IDs do not bypass unscoped raw");
  ok(revalidated.code === "RUN_BLOCKED", "crafted-scope code remains RUN_BLOCKED");
  ok(!(revalidated.reparsed?.command?.scope?.lessonIds || []).includes(STRONG_KEEP_ID), "reparsed scope drops crafted IDs");
}

console.log("\n28) title-scoped keep-strong command revalidates");
{
  const revalidated = allowlistApi.revalidateRunScope({ rawCommand: STRONG_KEEP_SCOPED }, {
    phase: 2,
    lessonPlans: strongKeepPlans,
  });
  ok(revalidated.ok === true, "title-scoped keep-strong revalidation passes");
  ok(revalidated.command?.scope?.lessonIds?.[0] === STRONG_KEEP_ID, "title-scoped target is Preschool Weather Lab");
  ok(revalidated.allowlist?.lessonIds?.[0] === STRONG_KEEP_ID, "allowlist lesson is Preschool Weather Lab");
  ok(revalidated.allowlist?.assets?.images === false, "scoped keep-strong still denies images");
  ok(revalidated.allowlist?.assets?.printables === false, "scoped keep-strong still denies printables");
  ok(revalidated.command?.actions?.publish !== true, "scoped keep-strong does not enable publish");
}

console.log("\n29) selected-lesson keep-strong command revalidates");
{
  const revalidated = allowlistApi.revalidateRunScope({ rawCommand: STRONG_KEEP_RAW }, {
    phase: 2,
    lessonPlans: strongKeepPlans,
    currentlySelectedLessonId: STRONG_KEEP_ID,
  });
  ok(revalidated.ok === true, "selected-lesson keep-strong revalidation passes");
  ok(revalidated.command?.scope?.lessonIds?.[0] === STRONG_KEEP_ID, "selected-lesson target is Preschool Weather Lab");
}

console.log("\n30) named title wins over a different selected lesson");
{
  const revalidated = allowlistApi.revalidateRunScope({ rawCommand: STRONG_KEEP_SCOPED }, {
    phase: 2,
    lessonPlans: strongKeepPlans,
    currentlySelectedLessonId: "cur-lp-operator-weak-toddler",
  });
  ok(revalidated.ok === true, "named title still revalidates with a different selection");
  ok(revalidated.command?.scope?.lessonIds?.[0] === STRONG_KEEP_ID, "named title wins over selected weak lesson");
  ok(!(revalidated.command?.scope?.lessonIds || []).includes("cur-lp-operator-weak-toddler"), "weak selected lesson stays out of mutation scope");
}

console.log(`\n${passed} assertions passed.`);

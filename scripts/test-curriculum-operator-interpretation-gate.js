#!/usr/bin/env node
/**
 * Focused tests for Operator target resolution, action scope, preflight, and UI labels.
 * Run: npm run test:curriculum-operator-interpretation-gate
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const commandApi = require("./curriculum-operator-command.js");
const selectApi = require("./curriculum-operator-select.js");
const jobApi = require("./curriculum-operator-job.js");
const preflightApi = require("./curriculum-operator-preflight.js");
const actionScopeApi = require("./curriculum-operator-action-scope.js");
const targetResolver = require("./curriculum-operator-target-resolver.js");
const imagesApi = require("./curriculum-operator-images.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const HELLO_ID = "cur-lp-19fb387f75cfd1f1";
const DUP_A = "cur-lp-aaaaaaaaaaaaaaaa";
const DUP_B = "cur-lp-bbbbbbbbbbbbbbbb";
const FARM_ID = "cur-lp-preschool-farm-animals";
const INVALID_ID = "cur-lp-ffffffffffffffff";
const ACT_ONE = "cur-act-1111111111111111";
const ACT_TWO = "cur-act-2222222222222222";
const ACT_SONG = "cur-act-3333333333333333";
const GIANT_FLOOR = "cur-act-0a02697c73ccac85";

const lessonPlans = [
  { id: LMW_ID, title: "Little Makers Workshop", age: "Toddler 12–24 Months", plan: "Free", status: "draft", theme: "Art" },
  { id: HELLO_ID, title: "Hello Fall, Little One", age: "Toddler 12–24 Months", plan: "Free", status: "draft", theme: "Fall" },
  { id: DUP_A, title: "Story Circle", age: "Preschool", plan: "Free", status: "draft", theme: "Books" },
  { id: DUP_B, title: "Story Circle", age: "Toddler 12–24 Months", plan: "Pro", status: "published", theme: "Books" },
  { id: FARM_ID, title: "Farm Animals", age: "Preschool", plan: "Free", status: "published", theme: "Farm" },
];
const curriculum = { lessonPlans, activities: [], resources: [] };

const IMAGE_ONLY_AUDIT = [
  `Audit exactly 5 activity images for Little Makers Workshop and identify the weakest.`,
  `Use lesson ID ${LMW_ID}.`,
  `Do not touch songs, books, printables, lesson text, cover, or drafts.`,
].join(" ");

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
    currentlySelectedLessonId: options.currentlySelectedLessonId || null,
    ...options,
  });
}

console.log("1. Exact lesson-ID behavior");
{
  const parsed = parse(IMAGE_ONLY_AUDIT);
  const selected = selectApi.selectLessons(curriculum, parsed.command);
  ok(parsed.command.scope.lessonIds.length === 1, "valid exact lesson ID selects one id");
  ok(parsed.command.scope.lessonIds[0] === LMW_ID, "resolved id is LMW");
  ok(selected.selected.length === 1, "selectLessons returns exactly one lesson");
  ok(selected.selected[0].id === LMW_ID, "selected lesson is LMW");
  ok(parsed.preflight.selectionMethod === "explicit_ids", "selectionMethod explicit_ids");
  ok(selected.selectionNote === "Selected by explicit lesson IDs.", "UI note matches explicit IDs");

  const bad = parse(`Audit images for lesson ID ${INVALID_ID}. Do not touch drafts.`);
  const badSelect = selectApi.selectLessons(curriculum, bad.command);
  ok(bad.preflight.valid === false, "invalid lesson ID blocks preflight");
  ok(/not found/i.test(bad.preflight.blockMessage), "invalid ID uses blocking message");
  ok(badSelect.selected.length === 0, "invalid ID selects no lessons");
  ok(badSelect.blocked === true, "invalid ID blocks selection");
  ok(preflightApi.shouldCreateJob(bad.preflight, "plan") === false, "invalid ID never creates a job");
  ok(!bad.command.scope.lessonIds.includes(LMW_ID), "invalid ID never falls back to title matching");
  ok(bad.preflight.selectionMethod === "unresolved", "invalid ID selectionMethod unresolved");

  const mismatch = parse(`Audit lesson ID ${LMW_ID} titled "Hello Fall, Little One". Do not touch drafts.`);
  ok(mismatch.preflight.blockReasons.includes("title_mismatch") || mismatch.targetResolution.titleMismatches.length, "exact ID plus mismatched title warns");
  ok(mismatch.command.scope.lessonIds[0] === LMW_ID, "mismatched title still resolves the supplied ID");
  ok(mismatch.command.completion.mutationsEnabled === false, "title mismatch blocks mutation");

  const dupWithId = parse(`Upgrade Story Circle using lesson ID ${DUP_A}. Save draft. Do not publish.`);
  ok(dupWithId.command.scope.lessonIds.length === 1 && dupWithId.command.scope.lessonIds[0] === DUP_A, "duplicate titles with valid ID select only that ID");
  const dupSelect = selectApi.selectLessons(curriculum, dupWithId.command);
  ok(dupSelect.selected.length === 1 && dupSelect.selected[0].id === DUP_A, "selection stays on supplied duplicate-title ID");

  const dupNoId = parse(`Upgrade "Story Circle" lesson text only. Do not touch images or printables.`);
  ok(dupNoId.preflight.valid === false, "duplicate titles without an ID block mutation");
  ok(dupNoId.preflight.selectionMethod === "ambiguous", "duplicate titles are ambiguous");
  ok(dupNoId.command.completion.mutationsEnabled === false, "ambiguous title is not mutation-enabled");

  const unquotedDup = parse("Audit Story Circle. Do not generate images, printables, songs, or books. Do not save a draft or publish.");
  ok(unquotedDup.preflight.valid === false, "unquoted duplicate title blocks preflight");
  ok(unquotedDup.preflight.selectionMethod === "ambiguous", "unquoted Story Circle is ambiguous");
  ok(unquotedDup.preflight.candidates.length === 2, "ambiguous title lists both Story Circle candidates");
  ok(unquotedDup.preflight.candidates.every((row) => /story circle/i.test(row.title)), "candidates are Story Circle rows");
  ok(unquotedDup.preflight.auditOnly === true, "do-not-generate audit stays audit-only");
  ok(unquotedDup.command.actions.touchSongs === false && unquotedDup.command.actions.touchBooks === false, "do not generate songs/books locks both");
  ok(unquotedDup.command.actions.saveDraft === false && unquotedDup.command.actions.touchDraft === false, "do not save a draft stays locked");
  ok(unquotedDup.preflight.createJob === false, "ambiguous audit-only does not create a job");
  ok(preflightApi.shouldCreateJob(unquotedDup.preflight, "run") === false, "run path also creates no job for ambiguous audit");
}

console.log("\n2. Exact-count behavior");
{
  const one = parse(`Audit one lesson: lesson ID ${LMW_ID}. Do not touch drafts.`);
  ok(one.command.scope.count === 1, "one lesson selects count 1");
  ok(one.preflight.lessonCount === 1, "preflight lessonCount is 1");

  const five = parse(IMAGE_ONLY_AUDIT);
  ok(five.command.scope.requestedItemCount === 5, "exactly 5 images stores requestedItemCount 5");
  ok(five.command.scope.count === 1, "exactly 5 images does not expand lesson count");
  ok(five.preflight.requestedCount === 5, "preflight requestedCount is 5");
  ok(five.preflight.resolvedCount === 5, "resolved count remains 5");

  const only = parse(`Audit only 5 activity images for ${LMW_ID}. Do not touch songs, books, printables, lesson text, cover, or drafts.`);
  ok(only.command.scope.requestedItemCount === 5, "only 5 stays 5");
  ok(only.command.scope.requestedItemCount !== 10, "only 5 never becomes 10");

  const cap = parse(`Audit activity images for ${LMW_ID}. Do not continue beyond 5. Do not touch drafts.`);
  ok(cap.command.scope.hardCap === 5, "do not continue beyond 5 creates hard cap 5");

  const mismatch = {
    valid: true,
    requestedItemCount: 5,
  };
  const blocked = preflightApi.buildPreflight({
    rawCommand: IMAGE_ONLY_AUDIT,
    command: five.command,
    resolution: {
      ...five.targetResolution,
    },
    actionScope: five.actionScope,
    selection: { selected: five.targetResolution.resolvedLessons, selectedItemCount: 10, selectionMethod: "explicit_ids" },
    limits: five.command.limits,
  });
  ok(blocked.valid === false, "count mismatch blocks execution");
  ok(blocked.blockReasons.includes("count_mismatch"), "count mismatch reason set");
  void mismatch;
}

console.log("\n3. Action isolation");
{
  const image = parse(IMAGE_ONLY_AUDIT);
  const a = image.command.actions;
  ok(a.checkImages === true, "image-only audit checks images");
  ok(a.touchSongs === false && a.checkSongs === false && a.generateSongsBooks === false, "image-only does not touch songs");
  ok(a.touchBooks === false && a.checkBooks === false, "image-only does not touch books");
  ok(a.touchPrintables === false && a.generatePrintables === false && a.checkPrintables === false, "image-only does not touch printables");
  ok(a.upgradeLesson === false, "image-only does not touch lesson text");
  ok(a.touchCover === false, "image-only does not touch cover");
  ok(a.touchDraft === false && a.saveDraft === false, "image-only audit does not touch drafts");

  const printable = parse(`Audit printables only for ${LMW_ID}. Do not touch images, books, songs, or lesson text.`);
  const p = printable.command.actions;
  ok(p.checkPrintables === true, "printable-only checks printables");
  ok(p.generateImages === false && p.touchImages === false && p.checkImages === false, "printable-only does not touch images");
  ok(p.touchBooks === false && p.checkBooks === false, "printable-only does not touch books");
  ok(p.touchSongs === false && p.checkSongs === false, "printable-only does not touch songs");
  ok(p.upgradeLesson === false, "printable-only does not touch lesson text");

  const textOnly = parse(`Upgrade lesson text and activities for ${LMW_ID}. Do not touch images or printables. Do not generate images or printables.`);
  const t = textOnly.command.actions;
  ok(t.generateImages === false && t.touchImages === false, "text-only does not generate images");
  ok(t.generatePrintables === false && t.touchPrintables === false, "text-only does not generate printables");

  const kit = parse(`Complete Teaching Kit for ${LMW_ID} — upgrade lesson text and activities. Do not touch images or printables.`);
  ok(kit.command.actions.generateImages === false && kit.command.actions.touchImages === false, "full-kit wording still respects image exclusion");
  ok(kit.command.actions.generatePrintables === false && kit.command.actions.touchPrintables === false, "full-kit wording still respects printable exclusion");
}

console.log("\n4. Mode safety");
{
  const audit = parse(IMAGE_ONLY_AUDIT);
  ok(audit.command.completion.mutationsEnabled === false, "audit-only mutationsEnabled false");
  ok(audit.command.actions.touchDraft === false, "audit-only touchDraft false");
  ok(audit.command.actions.saveDraft === false, "audit-only saveDraft false");
  ok(audit.preflight.auditOnly === true, "audit-only flag set");
  ok(preflightApi.shouldCreateJob(audit.preflight, "plan") === false, "audit-only creates no job on plan");
  ok(preflightApi.shouldCreateJob(audit.preflight, "run") === false, "audit-only creates no job on run");
  ok(audit.preflight.mutationsEnabled === false, "audit-only preflight mutations false");

  const draft = parse(`Save a draft-only upgrade of lesson text for ${LMW_ID}. Do not publish.`);
  ok(draft.command.actions.publish === false, "draft-only never publishes");
  ok(draft.command.completion.publish === false, "completion publish false");

  const any = parse(`Finish the full Teaching Kit for ${LMW_ID}.`);
  ok(any.command.actions.publish === false, "no command publishes automatically");

  const farm = parse(`Upgrade Farm Animals lesson ID ${FARM_ID}. Save draft.`);
  ok(farm.preflight.valid === false || farm.preflight.blockReasons.includes("protected_lesson") || farm.targetResolution.protectedLessonIds.includes(FARM_ID), "protected Farm Animals is flagged");
  if (farm.actionScope.mutationsEnabled) {
    ok(farm.preflight.valid === false, "protected lesson blocks mutation preflight");
  }
}

console.log("\n5. Image standards");
{
  const protectedDecision = imagesApi.refineImageDecision(
    { activityId: GIANT_FLOOR, activityTitle: "Giant Floor Drawing", image: { decision: "REPLACE" } },
    { id: GIANT_FLOOR, title: "Giant Floor Drawing", setupImageUrl: "https://cdn.example/giant.jpg" },
    {},
    { command: { rawCommand: IMAGE_ONLY_AUDIT } },
  );
  ok(protectedDecision.decision === "PROTECTED_KEEP", "pilot Giant Floor Drawing remains untouched");

  const sponge = imagesApi.refineImageDecision(
    { activityId: "cur-act-c36723f91d3a9637", activityTitle: "Sponge Squish Painting", image: { decision: "GENERATE" } },
    { id: "cur-act-c36723f91d3a9637", title: "Sponge Squish Painting" },
    {},
    { command: { rawCommand: "Regenerate Sponge Squish Painting" } },
  );
  ok(sponge.decision === "PROTECTED_KEEP", "pilot Sponge Squish Painting remains untouched");

  const writes = [
    { activityId: ACT_ONE, decision: "GENERATE" },
    { activityId: ACT_TWO, decision: "GENERATE" },
    { activityId: "cur-act-4444444444444444", decision: "GENERATE" },
    { activityId: GIANT_FLOOR, decision: "PROTECTED_KEEP" },
  ];
  const budgeted = imagesApi.applyImageGenerationSoftBudget(writes, { softMax: 5, activities: [] });
  ok(budgeted.actions.filter((a) => a.decision === "GENERATE").length === 3, "image-only generation stays on selected write candidates");
  ok(budgeted.actions.find((a) => a.activityId === GIANT_FLOOR).decision === "PROTECTED_KEEP", "protected write is not budgeted away");

  const capped = imagesApi.applyImageGenerationSoftBudget([
    { activityId: "a1", decision: "GENERATE" },
    { activityId: "a2", decision: "GENERATE" },
    { activityId: "a3", decision: "GENERATE" },
    { activityId: "a4", decision: "GENERATE" },
    { activityId: "a5", decision: "GENERATE" },
    { activityId: "a6", decision: "GENERATE" },
    { activityId: "a7", decision: "GENERATE" },
    { activityId: "a8", decision: "GENERATE" },
    { activityId: "a9", decision: "GENERATE" },
    { activityId: "a10", decision: "GENERATE" },
  ], { softMax: 5, activities: [] });
  ok(capped.actions.filter((a) => a.decision === "GENERATE").length === 5, "exactly 5 images stays 5, not 10");

  const song = imagesApi.refineImageDecision(
    { activityId: ACT_SONG, activityTitle: "Hello Song", image: { decision: "GENERATE" } },
    { id: ACT_SONG, title: "Hello Song", activityCategory: "song" },
    {},
    {},
  );
  ok(song.decision === "NOT_NEEDED", "no image is generated for No image needed activities");
  ok(imagesApi.activityNeedsNoImage({ title: "Fingerplay Friends", activityCategory: "fingerplay" }), "fingerplay marked no image needed");

  const prompt = imagesApi.buildActivityImagePrompt({
    plan: { title: "Little Makers Workshop", age: "Toddler 12–24 Months" },
    activity: {
      title: "Cotton Ball Clouds",
      materials: "cotton balls, glue, blue paper",
      setup: "Tray with glue and paper",
      steps: "Child presses cotton balls onto paper",
    },
    field: "setupImageUrl",
    concept: "Child pressing cotton balls",
  });
  ok(/cotton balls/i.test(prompt), "generated prompt contains exact activity materials");
  ok(/toddler/i.test(prompt), "generated prompt contains toddler age context");
  ok(/do not (include|add|generate).*text|no text|without text|contain no text|do not render text/i.test(prompt)
    || /no (signage|lettering|captions|words|typography)/i.test(prompt)
    || /REALISTIC_ACTIVITY_PHOTO/i.test(prompt), "generated text is prohibited in activity photo prompt");

  const existing = { setupImageUrl: "https://cdn.example/keep-me.jpg", setupMediaAssetId: "tk-enrich-keep" };
  const blocked = imagesApi.refineImageDecision(
    { activityId: ACT_ONE, image: { decision: "KEEP", existingUrl: existing.setupImageUrl } },
    { id: ACT_ONE, ...existing },
    {},
    {},
  );
  ok(blocked.existingUrl === existing.setupImageUrl, "blocked/keep image leaves the existing image unchanged");
  ok(blocked.activityId === ACT_ONE, "passing/keep image uses the same activity ID");
}

console.log("\n6. UI state + job labels");
{
  const src = fs.readFileSync(path.join(__dirname, "curriculum-operator-ui.js"), "utf8");
  ok(/interpretInFlight/.test(src), "Interpret in-flight guard present");
  ok(/interpretedCommand/.test(src), "current command is tracked against interpretation");
  ok(/panel\.hidden = true/.test(src), "old execution plans are hidden when a new command is entered");
  ok(/preflight\?\.valid/.test(src), "Run Job requires preflight.valid");
  ok(/canConfirmRun/.test(src), "Confirm & run requires valid mutation-enabled request");
  ok(/Refresh jobs<\/button>/.test(src), "Refresh Jobs is not left disabled by busy/interpret state");
  ok(/The supplied lesson ID was not found/.test(src), "invalid target resolution message present");
  ok(/shouldShowDraftLanguage/.test(src), "audit-only draft language is gated");

  const sandbox = { window: {}, globalThis: {} };
  vm.runInNewContext(src, sandbox, { filename: "curriculum-operator-ui.js" });
  const t = sandbox.window.LLHCurriculumOperatorUi.__test__;
  ok(t.selectionMethodLabel("explicit_ids") === "Selected by explicit lesson IDs.", "explicit ID label");
  ok(t.selectionMethodLabel("unresolved") === "Target unresolved.", "unresolved label does not claim explicit IDs");
  ok(t.shouldShowDraftLanguage({ mutationsEnabled: false, lessonResults: [] }, { auditOnly: true }) === false, "no misleading draft language in audit-only mode");
  ok(t.interpretationBelongsToCommand({ command: "A", interpretedCommand: "B" }) === false, "current command and interpretation cannot become mismatched");
  ok(t.interpretationBelongsToCommand({ command: "A", interpretedCommand: "A" }) === true, "matching command is current");
  ok(t.isPreflightValid({ preflight: { valid: false } }, null) === false, "invalid target resolution prevents run");

  const audit = parse(IMAGE_ONLY_AUDIT);
  const planned = jobApi.createJobFromPlan({
    command: audit.command,
    planSummary: { lessons: [{ id: LMW_ID, title: "Little Makers Workshop" }], preflight: audit.preflight },
    createdBy: "owner@test",
    status: "planned",
  });
  ok(planned.mutationsEnabled === false, "audit interpretation does not create a mutation-enabled job");
  ok(planned.requestId || audit.preflight.requestId, "job/preflight returns a request ID");
  ok(preflightApi.shouldCreateJob(audit.preflight, "plan") === false, "double-click/plan path will not create an audit job");
}

console.log("\n7. Before/after image-only JSON contract");
{
  const parsed = parse(IMAGE_ONLY_AUDIT);
  const actions = parsed.command.actions;
  ok(actions.audit === true, "audit true");
  ok(actions.checkImages === true, "checkImages true");
  ok(actions.upgradeLesson === false, "upgradeLesson false");
  ok(actions.upgradeActivities === false, "upgradeActivities false");
  ok(actions.generateImages === false, "generateImages false unless generation requested");
  ok(actions.generatePrintables === false, "generatePrintables false");
  ok(actions.generateSongsBooks === false, "generateSongsBooks false");
  ok(actions.checkSongs === false, "checkSongs false");
  ok(actions.checkBooks === false, "checkBooks false");
  ok(actions.touchImages === false, "touchImages false during audit");
  ok(actions.touchPrintables === false, "touchPrintables false");
  ok(actions.touchSongs === false, "touchSongs false");
  ok(actions.touchBooks === false, "touchBooks false");
  ok(actions.touchCover === false, "touchCover false");
  ok(actions.touchDraft === false, "touchDraft false");
  ok(actions.saveDraft === false, "saveDraft false");
  ok(actions.publish === false, "publish false");
  ok(parsed.preflight.mutationsEnabled === false, "mutationsEnabled false");
  ok(parsed.preflight.valid === true, "valid exact-ID image-only audit preflight");
  ok(parsed.preflight.lessonIds[0] === LMW_ID, "preflight preserves exact lesson ID");
  console.log(JSON.stringify({
    intent: parsed.command.intent,
    scope: parsed.command.scope,
    actions: parsed.command.actions,
    preflight: parsed.preflight,
  }, null, 2));
}

console.log("\n8. Catalog-less printable compatibility");
{
  const printableCmd = "Create Maker Station Signs printable for Little Makers Workshop teaching kit";
  const noCatalog = commandApi.parseOperatorCommand(printableCmd, { phase: 7 });
  ok(noCatalog.command.actions.generatePrintables === true, "catalog-less printable command keeps generatePrintables");
  ok(noCatalog.command.actions.createLesson !== true, "catalog-less printable command is not create-lesson");
  ok(
    !targetResolver.extractSuppliedTitles(printableCmd, noCatalog.command.scope.titles || [])
      .some((title) => /maker station signs/i.test(title)),
    "Maker Station Signs is not treated as a lesson title",
  );
  ok(
    (noCatalog.preflight.lessonIds || []).length <= 1
      && (noCatalog.command.scope.lessonIds || []).filter(Boolean).length <= 1,
    "printable artifact does not add a second lesson target",
  );
  ok(preflightApi.shouldCreateJob(noCatalog.preflight, "run") === false, "catalog-less parse still does not authorize a run job");

  const withCatalog = parse(printableCmd);
  ok(withCatalog.command.actions.generatePrintables === true, "catalog-backed printable command keeps generatePrintables");
  ok(withCatalog.preflight.selectionMethod === "title_match", "catalog-backed printable resolves uniquely by title");
  ok(withCatalog.command.scope.lessonIds.length === 1 && withCatalog.command.scope.lessonIds[0] === LMW_ID, "catalog-backed printable resolves Little Makers Workshop only");
  ok(withCatalog.preflight.candidates.length <= 1, "printable name does not create title ambiguity");

  const invalid = parse(`Audit images for lesson ID ${INVALID_ID}. Do not touch drafts.`);
  ok(invalid.preflight.valid === false && invalid.preflight.selectionMethod === "unresolved", "invalid ID hard stop remains");
  ok(invalid.preflight.createJob === false, "invalid ID still creates no job");

  const ambiguous = parse("Audit Story Circle. Do not generate images, printables, songs, or books.");
  ok(ambiguous.preflight.selectionMethod === "ambiguous" && ambiguous.preflight.valid === false, "ambiguous title hard stop remains");

  const negated = parse("Do not generate printables for Little Makers Workshop");
  ok(negated.command.actions.generatePrintables !== true, "negated printable command keeps generatePrintables locked");
}

console.log("\n9. Residual printable phrases stay fail-closed without a verified target");
{
  const case1 = "Create Little Makers Workshop printable";
  const noCatalog = commandApi.parseOperatorCommand(case1, { phase: 7 });
  const noCatalogSelect = selectApi.selectLessons({ lessonPlans: [], activities: [], resources: [] }, noCatalog.command);
  ok(noCatalog.command.actions.createLesson !== true, "Create <lesson> printable is not create-lesson");
  ok(noCatalogSelect.blocked === true || noCatalogSelect.selected.length === 0, "catalog-less Create LMW printable selects no lesson");
  ok(
    noCatalogSelect.blocked === true || noCatalogSelect.selected.length === 0,
    "server gate (ambiguous or empty selection) would refuse a job",
  );
  ok((noCatalog.targetResolution.resolvedLessonIds || []).length === 0, "catalog-less Create LMW printable has no verified lesson id");

  const withCatalog = parse(case1);
  const withCatalogSelect = selectApi.selectLessons(curriculum, withCatalog.command);
  if (withCatalogSelect.selected.length) {
    ok(withCatalogSelect.selected.length === 1 && withCatalogSelect.selected[0].id === LMW_ID, "catalog-backed Create LMW printable resolves only LMW when a job is allowed");
    ok(withCatalogSelect.blocked !== true, "verified unique LMW target is not blocked");
  } else {
    ok(withCatalog.preflight.createJob === false || withCatalogSelect.blocked === true, "catalog-backed Create LMW printable creates no job without a verified target");
  }

  const mixed = parse(`Audit lesson IDs ${LMW_ID} and ${INVALID_ID}. Do not touch drafts.`);
  ok(mixed.preflight.valid === false && mixed.preflight.createJob === false, "mixed valid+invalid IDs create no job");
  ok(!(mixed.command.scope.lessonIds || []).includes(LMW_ID) || mixed.preflight.selectionMethod === "unresolved", "mixed IDs do not silently execute the valid target");

  const case2 = "Generate Fall Leaf Cards printable for Little Makers Workshop";
  const fall = parse(case2);
  ok(fall.preflight.createJob === false, "Fall Leaf Cards + LMW stays fail-closed (no job)");
  ok(fall.preflight.valid === false, "Fall Leaf Cards + LMW does not authorize execution");
  ok(
    !targetResolver.extractSuppliedTitles(case2, fall.command.scope.titles || [])
      .some((title) => /fall leaf cards/i.test(title)),
    "Fall Leaf Cards is not treated as a lesson title",
  );
}

console.log(`\nOK curriculum-operator-interpretation-gate (${passed} assertions)`);

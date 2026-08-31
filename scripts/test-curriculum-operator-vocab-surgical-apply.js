#!/usr/bin/env node
/**
 * Vocabulary-only surgical connected auto-apply regression suite.
 * Mirrors production opjob_c2ea6e4fcd53d8fe failure class.
 * Run: npm run test:curriculum-operator-vocab-surgical-apply
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");
const composer = require("./curriculum-operator-ai-composer.js");
const connectedUpgrade = require("./curriculum-operator-connected-upgrade.js");
const lessonRead = require("./curriculum-operator-lesson-read.js");
const vocabSurgical = require("./curriculum-operator-vocab-surgical-apply.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const ACT_DOT = "cur-act-0199336343c8c28e";
const MALFORMED = { word: "art, create, explore, build, sticky, paper, press, paint" };
const VALID_CARDS = [
  { word: "press", definition: "Push down firmly with both hands." },
  { word: "stick", definition: "Attach one piece to another." },
  { word: "roll", definition: "Move materials back and forth." },
  { word: "build", definition: "Stack or connect pieces." },
];

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function vocabOnlyCommand() {
  return commandApi.parseOperatorCommand(
    `ONE CONTROLLED VOCABULARY-ONLY connected upgrade on the EXISTING lesson only.
Lesson ID: ${LMW_ID}
TARGET: Vocabulary only
weeklyFieldScope vocabulary only
connectedUpgrade=true connectedAutoApply=true publish=false
touchImages=false touchPrintables=false touchSongs=false touchBooks=false touchCover=false
Do NOT generate images. Save draft. Do not publish.`,
    {
      phase: 7,
      lessonPlans: [{ id: LMW_ID, title: "Little Makers Workshop", plan: "Free", status: "draft" }],
      currentlySelectedLessonId: LMW_ID,
    },
  ).command;
}

function historicalDraftPlan(extra = {}) {
  return {
    id: LMW_ID,
    title: "Little Makers Workshop",
    status: "draft",
    plan: "Free",
    publishedAt: null,
    learningDomains: [
      "Creative Arts", "Physical Development", "Language Literacy",
      "Social Emotional", "Cognitive", "Approaches to Learning",
    ],
    vocabularyWords: "",
    coverImageUrl: "/api/media/lesson-covers/lesson-cover-fixture",
    teachingKit: {
      milestones: ["Uses two hands.", "Names one color.", "Chooses a material.", "Persists with help."],
      vocabCards: [MALFORMED],
      printableIds: ["cur-res-historical-printable"],
      completionPercent: 67,
      teacherToolkit: { prepChecklist: ["Smocks ready"], notes: "Keep prior notes" },
    },
    songs: [{ title: "Existing Song" }],
    books: [{ title: "Existing Book" }],
    enrichmentDraft: {
      week: {
        songs: [
          { title: "Historical Draft Song", lyrics: "la la", linkedWeekday: "monday" },
        ],
        books: [
          { title: "Historical Draft Book", author: "A. Author", whyThisBook: "Theme fit" },
        ],
        printableIds: ["cur-res-historical-printable"],
        vocabCards: [MALFORMED],
      },
      activities: {
        [ACT_DOT]: { relatedPrintableId: "cur-res-historical-printable", relatedPrintableTitle: "Old Pack" },
      },
      completionPercent: 67,
      composerSource: "historical",
      operatorPhase: 6,
      updatedAt: "2026-08-01T00:00:00.000Z",
      lastEditedBy: "history",
    },
    dailyPlans: {
      monday: { items: [{ itemId: ACT_DOT, title: "Dot Marker Color Pops" }] },
      tuesday: { items: [] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    ...extra,
  };
}

console.log("1) vocab-only composer accepted cards preserve structured objects");
{
  const plan = historicalDraftPlan();
  const work = {
    lessonId: LMW_ID,
    weekRequests: [{ field: "vocabCards", action: "REPLACE", reason: "malformed" }],
    weekKeep: [],
    activityRequests: [],
    activityKeep: [{ activityId: ACT_DOT, decision: "KEEP", title: "Dot Marker" }],
    songRequests: [],
    bookRequest: null,
    hasWork: true,
  };
  const raw = JSON.stringify({
    lessonId: LMW_ID,
    weeklyChanges: { vocabCards: { action: "REPLACE", value: VALID_CARDS } },
    activities: [{ activityId: ACT_DOT, changes: { objective: { action: "KEEP", value: "echo" } } }],
  });
  const validated = composer.validateComposerOutput(raw, work, plan);
  ok(validated.ok, "composer accepts structured vocabCards");
  ok(Array.isArray(validated.plan.weeklyChanges.vocabCards.value), "vocabCards value is array");
  ok(
    validated.plan.weeklyChanges.vocabCards.value.every((c) => c && typeof c === "object" && c.word),
    "structured card objects preserved (not [object Object])",
  );
  ok(
    validated.diagnostics.rejected.some((r) => r.reason === "unrequested_activity"),
    "activity echo soft-skipped",
  );
}

console.log("\n2-4) historical enrichmentDraft songs/books/printables do not block authoritative vocab diff");
{
  const command = vocabOnlyCommand();
  const allowlist = allowlistApi.buildMutationAllowlist(command);
  const before = historicalDraftPlan();
  const after = {
    ...before,
    vocabularyWords: "press, stick, roll, build",
    teachingKit: {
      ...before.teachingKit,
      vocabCards: VALID_CARDS,
    },
    // Historical draft still present with songs/books — must not block.
    enrichmentDraft: {
      ...before.enrichmentDraft,
      week: {
        ...before.enrichmentDraft.week,
        vocabCards: VALID_CARDS,
      },
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
    enrichmentPublishHistory: [{ versionId: "epub-x", publishedAt: "2026-08-27T00:00:00.000Z" }],
    updatedAt: "2026-08-27T00:00:00.000Z",
  };
  const check = allowlistApi.verifyPersistedMutationDiff(before, after, allowlist);
  ok(check.ok, "historical draft songs/books/printables do not block vocab-only authoritative diff");
  ok(!check.unexpected.length, "no unexpected authoritative paths");
  ok(
    !schemaHasUnexpectedSongs(check),
    "songs not treated as UNEXPECTED_PERSISTED_MUTATION",
  );
}

function schemaHasUnexpectedSongs(check) {
  return schema.asArray(check.unexpected).some((p) => /\.songs\b|^songs$/.test(p))
    || schema.asArray(check.violations).some((v) => /\.songs\b|^songs$/.test(String(v.path || "")));
}

console.log("\n5) draft/job metadata excluded from authoritative curriculum diff");
{
  const path = "enrichmentDraft.week.songs[0].title";
  ok(
    vocabSurgical.classifyPersistedPath(path) === "INTERMEDIATE_ENRICHMENT_BOOKKEEPING",
    "enrichmentDraft path classified as intermediate bookkeeping",
  );
  ok(
    vocabSurgical.classifyPersistedPath("enrichmentPublishHistory[0].fingerprint") === "JOB_METADATA",
    "enrichmentPublishHistory classified as job metadata",
  );
  ok(
    vocabSurgical.classifyPersistedPath("updatedAt") === "SYSTEM_METADATA",
    "updatedAt classified as system metadata",
  );
  ok(
    vocabSurgical.classifyPersistedPath("vocabularyWords") === "AUTHORITATIVE_CURRICULUM_MUTATION",
    "vocabularyWords is authoritative",
  );
}

console.log("\n6) only vocabCards + vocabularyWords authoritative diff");
{
  const before = historicalDraftPlan();
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, VALID_CARDS);
  ok(applied.ok, "surgical apply succeeds");
  const authDiff = vocabSurgical.computeAuthoritativeCurriculumDiff(before, applied.plan);
  ok(authDiff.every((p) => /vocabularyWords|teachingKit\.vocabCards/.test(p)), "authoritative diff limited to vocab fields");
  ok(authDiff.some((p) => p === "vocabularyWords" || p.startsWith("vocabularyWords")), "vocabularyWords in diff");
  ok(authDiff.some((p) => /vocabCards/.test(p)), "vocabCards in diff");
}

console.log("\n7-16) preserve unrelated authoritative fields");
{
  const before = historicalDraftPlan();
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, VALID_CARDS);
  const after = applied.plan;
  ok(JSON.stringify(after.learningDomains) === JSON.stringify(before.learningDomains), "learningDomains preserved");
  ok(JSON.stringify(after.teachingKit.milestones) === JSON.stringify(before.teachingKit.milestones), "milestones preserved");
  ok(after.teachingKit.teacherToolkit.notes === before.teachingKit.teacherToolkit.notes, "other teachingKit fields preserved");
  ok(JSON.stringify(after.songs) === JSON.stringify(before.songs), "songs preserved");
  ok(JSON.stringify(after.books) === JSON.stringify(before.books), "books preserved");
  ok(JSON.stringify(after.teachingKit.printableIds) === JSON.stringify(before.teachingKit.printableIds), "printables preserved");
  ok(after.coverImageUrl === before.coverImageUrl, "cover preserved");
  ok(after.plan === "Free", "Free access preserved");
  ok(after.status === "draft" && !after.publishedAt, "draft/unpublished preserved");
  ok(after.dailyPlans.monday.items[0].itemId === ACT_DOT, "activity ids preserved");
}

console.log("\n17) atomic valid cards + synced string");
{
  const applied = vocabSurgical.applySurgicalVocabToPlan(historicalDraftPlan(), VALID_CARDS);
  ok(applied.ok, "atomic apply ok");
  ok(applied.vocabularyWords.includes("press") && applied.vocabularyWords.includes("build"), "synced string non-empty");
  ok(applied.cards.every((c) => lessonRead.isValidVocabularyCard(c)), "all cards valid");
  const quality = lessonRead.classifyVocabularyQuality(applied.plan, {});
  ok(quality.state === "VALID" || quality.validCardCount >= 4, "post-apply vocabulary quality valid");
}

console.log("\n18-19) partial persist → PERSISTENCE_MISMATCH");
{
  const cardsOnly = {
    id: LMW_ID,
    vocabularyWords: "",
    teachingKit: { vocabCards: VALID_CARDS },
  };
  const checkCards = lessonRead.verifyConnectedAutoApplyPersistence({
    beforePlan: historicalDraftPlan(),
    afterPlan: cardsOnly,
    requestedFieldSuccess: [{ field: "vocabCards", action: "REPLACE" }],
    command: vocabOnlyCommand(),
  });
  ok(checkCards.mismatches.some((m) => m.code === "PERSISTENCE_MISMATCH"), "only cards → PERSISTENCE_MISMATCH");

  const stringOnly = {
    id: LMW_ID,
    vocabularyWords: "press, stick, roll, build",
    teachingKit: { vocabCards: [MALFORMED] },
  };
  const checkString = lessonRead.verifyConnectedAutoApplyPersistence({
    beforePlan: historicalDraftPlan(),
    afterPlan: stringOnly,
    requestedFieldSuccess: [{ field: "vocabCards", action: "REPLACE" }],
    command: vocabOnlyCommand(),
  });
  ok(checkString.mismatches.some((m) => m.code === "PERSISTENCE_MISMATCH"), "only string → PERSISTENCE_MISMATCH");
}

console.log("\n20) true authoritative out-of-scope mutation still blocks");
{
  const command = vocabOnlyCommand();
  const allowlist = allowlistApi.buildMutationAllowlist(command);
  const before = historicalDraftPlan();
  const after = {
    ...before,
    vocabularyWords: "press, stick, roll, build",
    teachingKit: { ...before.teachingKit, vocabCards: VALID_CARDS },
    learningDomains: ["Creative Arts", "Physical Development"],
    songs: [...before.songs, { title: "Unauthorized New Song" }],
  };
  const check = allowlistApi.verifyPersistedMutationDiff(before, after, allowlist);
  ok(!check.ok, "authoritative out-of-scope still blocks");
  ok(
    check.unexpected.some((p) => /learningDomains|songs/.test(p))
      || check.violations.some((v) => /learningDomains|songs/.test(String(v.path || ""))),
    "learningDomains/songs flagged as unexpected",
  );
}

console.log("\n21) system metadata allowlist exact");
{
  ok(vocabSurgical.SYSTEM_METADATA_PATHS.includes("updatedAt"), "updatedAt in system metadata");
  ok(vocabSurgical.SYSTEM_METADATA_PATHS.includes("teachingKit.updatedAt"), "teachingKit.updatedAt in system metadata");
  ok(!vocabSurgical.SYSTEM_METADATA_PATHS.includes("songs"), "songs not system metadata");
}

console.log("\n22) old enrichmentDraft never promoted by surgical apply");
{
  const before = historicalDraftPlan();
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, VALID_CARDS);
  ok(JSON.stringify(applied.plan.songs) === JSON.stringify(before.songs), "plan.songs unchanged by surgical apply");
  ok(JSON.stringify(applied.plan.books) === JSON.stringify(before.books), "plan.books unchanged by surgical apply");
  const payload = applied.payload;
  const payloadCheck = vocabSurgical.assertMinimalVocabPayload(payload);
  ok(payloadCheck.ok, "minimal persistence payload has no unrelated fields");
  ok(Object.keys(payload).every((k) => ["id", "vocabularyWords", "teachingKit"].includes(k)), "payload keys minimal");
}

console.log("\n23-25) requested outcome after reload");
{
  const command = vocabOnlyCommand();
  const before = historicalDraftPlan();
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, VALID_CARDS);
  const refreshed = connectedUpgrade.refreshLessonResultPostApply(
    {
      lessonId: LMW_ID,
      status: "success",
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
      beforePlan: before,
      kitScope: { locks: { printables: true } },
      composerDiagnostics: { accepted: [{ scope: "week", field: "vocabCards", action: "REPLACE" }] },
    },
    applied.plan,
    { lessonPlans: [applied.plan], activities: [], resources: [] },
    {
      command,
      beforePlan: before,
      requestedFieldSuccess: [{ field: "vocabCards", action: "REPLACE" }],
      mutationAllowlist: allowlistApi.buildMutationAllowlist(command),
    },
  );
  ok(refreshed.contentPersistenceIncomplete !== true, "requested outcome satisfied → not incomplete");
  ok(!(refreshed.unexpectedPersistedMutations || []).length, "no unexpected authoritative mutations");

  const unsatisfied = connectedUpgrade.refreshLessonResultPostApply(
    {
      lessonId: LMW_ID,
      status: "success",
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
      beforePlan: before,
      kitScope: {},
      composerDiagnostics: { accepted: [{ scope: "week", field: "vocabCards", action: "REPLACE" }] },
    },
    before,
    { lessonPlans: [before], activities: [], resources: [] },
    {
      command,
      beforePlan: before,
      requestedFieldSuccess: [{ field: "vocabCards", action: "REPLACE" }],
      mutationAllowlist: allowlistApi.buildMutationAllowlist(command),
    },
  );
  ok(unsatisfied.contentPersistenceIncomplete === true, "unsatisfied vocab → completed_with_gaps signal");
}

console.log("\n26-27) zero asset / activity mutation in surgical path");
{
  const src = fs.readFileSync(path.join(__dirname, "curriculum-operator-vocab-surgical-apply.js"), "utf8");
  ok(!/generateVisualProductionImage|generatePrintable|uploadMedia|touchCover/.test(src), "surgical module has zero asset calls");
  ok(!/mergeDraftIntoPlan\s*\(/.test(src), "surgical module does not invoke mergeDraftIntoPlan");
  ok(!/require\(["']\.\/teaching-kit-enrichment/.test(src), "surgical module does not load enrichment merge helper");
  const serverSrc = fs.readFileSync(path.join(__dirname, "../server/index.js"), "utf8");
  ok(/applyOperatorSurgicalVocab/.test(serverSrc), "server wires surgical vocab apply");
  ok(/isVocabOnlyAllowlist/.test(serverSrc), "server routes vocab-only away from full enrichment publish");
}

console.log("\n28) filtered composer plan keeps only vocabCards");
{
  const command = vocabOnlyCommand();
  const allowlist = allowlistApi.buildMutationAllowlist(command);
  const filtered = allowlistApi.filterComposerPlan({
    lessonId: LMW_ID,
    weeklyChanges: {
      vocabCards: { action: "REPLACE", value: VALID_CARDS },
      weeklyOverview: { action: "REPLACE", value: "should strip" },
    },
    activities: [{ activityId: ACT_DOT, changes: { objective: { action: "FILL", value: "nope" } } }],
    songs: [{ title: "nope" }],
    books: [{ title: "nope" }],
  }, allowlist, {}, { command });
  ok(Boolean(filtered.plan.weeklyChanges.vocabCards), "vocabCards kept in filtered plan");
  ok(!filtered.plan.weeklyChanges.weeklyOverview, "weeklyOverview stripped");
  ok(!filtered.plan.activities.length, "activity mutations stripped");
  ok(!filtered.plan.songs.length && !filtered.plan.books.length, "songs/books stripped");
}

console.log(`\n${passed} assertions passed.`);

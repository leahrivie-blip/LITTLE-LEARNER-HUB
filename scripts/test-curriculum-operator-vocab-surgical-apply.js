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
  ok(/resolveConnectedApplyMode/.test(serverSrc),
    "server routes vocab-only via resolveConnectedApplyMode away from full enrichment publish");
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

console.log("\nT1) autoApply survives plan → resume");
{
  const serverSrc = fs.readFileSync(path.join(__dirname, "../server/curriculum-operator.js"), "utf8");
  const resumeIdx = serverSrc.indexOf('action === "resume"');
  const cancelIdx = serverSrc.indexOf('action === "cancel"', resumeIdx);
  ok(resumeIdx > 0 && cancelIdx > resumeIdx, "resume handler located");
  const resumeBlock = serverSrc.slice(resumeIdx, cancelIdx);
  ok(/tryConnectedAutoApply\s*\(/.test(resumeBlock), "resume calls tryConnectedAutoApply");
  ok(/autoApply/.test(resumeBlock), "resume response includes autoApply");
  ok(/connectedAutoApply/.test(resumeBlock), "resume gates on connectedAutoApply");
  const cmd = vocabOnlyCommand();
  ok(cmd.actions.connectedAutoApply === true, "vocab-only command keeps connectedAutoApply=true");
  ok(vocabSurgical.shouldDeferVocabDraftPersist(cmd, allowlistApi.buildMutationAllowlist(cmd)) === true,
    "vocab-only connected auto-apply defers intermediate draft persist");
}

console.log("\nT2) structured vocabulary — combined dump cannot persist as one card word");
{
  const combined = "art, create, explore, build";
  ok(lessonRead.isCombinedVocabularyList(combined), "combined list detected");
  ok(!lessonRead.isValidVocabularyCard({ word: combined }), "combined word card invalid");
  const expanded = lessonRead.expandVocabularyCardEntries([{ word: combined }]);
  ok(expanded.length === 4, "combined dump expands to 4 structured cards");
  ok(expanded.every((c) => c.word && !lessonRead.isCombinedVocabularyList(c.word)), "no card retains combined word");

  const plan = historicalDraftPlan();
  const work = {
    lessonId: LMW_ID,
    weekRequests: [{ field: "vocabCards", action: "REPLACE", reason: "malformed" }],
    weekKeep: [],
    activityRequests: [],
    activityKeep: [],
    songRequests: [],
    bookRequest: null,
    hasWork: true,
  };
  const fromComposer = composer.validateComposerOutput(JSON.stringify({
    lessonId: LMW_ID,
    weeklyChanges: { vocabCards: { action: "REPLACE", value: [combined] } },
    activities: [],
  }), work, plan);
  ok(fromComposer.ok === true, "composer accepts combined input by expanding");
  const cards = fromComposer.plan.weeklyChanges.vocabCards.value;
  ok(Array.isArray(cards) && cards.length === 4, "composer emits separate cards");
  ok(cards.every((c) => typeof c === "object" && c.word && !/,/.test(c.word)),
    "composer never keeps comma-list inside one word");

  const emptyFail = composer.validateComposerOutput(JSON.stringify({
    lessonId: LMW_ID,
    weeklyChanges: { vocabCards: { action: "REPLACE", value: [" , , "] } },
    activities: [],
  }), work, plan);
  ok(emptyFail.ok === false, "empty/garbage combined dump fails closed");
}

console.log("\nT3) authoritative repair of vocabularyWords + teachingKit.vocabCards");
{
  const before = historicalDraftPlan();
  ok(before.vocabularyWords === "", "fixture starts with empty vocabularyWords");
  ok(before.teachingKit.vocabCards[0].word.includes(","), "fixture starts with malformed card");
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, VALID_CARDS);
  ok(applied.ok, "surgical apply succeeds");
  ok(applied.plan.vocabularyWords.includes("press") && applied.plan.vocabularyWords.includes("build"),
    "vocabularyWords repaired");
  ok(applied.plan.teachingKit.vocabCards.length === VALID_CARDS.length, "teachingKit.vocabCards repaired");
  ok(applied.plan.teachingKit.vocabCards.every((c) => !lessonRead.isCombinedVocabularyList(c.word)),
    "authoritative cards are individually structured");
}

console.log("\nT4) surgical scope — unrelated fields byte-stable");
{
  const before = historicalDraftPlan();
  const helloFall = {
    id: "cur-lp-19fb387f75cfd1f1745",
    title: "Hello Fall",
    status: "published",
    vocabularyWords: "leaf, crisp, orange",
    teachingKit: { vocabCards: [{ word: "leaf" }] },
    coverImageUrl: "/api/media/lesson-covers/hello-fall",
    fingerprint: "hf-before",
  };
  const beforeHf = JSON.parse(JSON.stringify(helloFall));
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, VALID_CARDS);
  const after = applied.plan;
  const authDiff = vocabSurgical.computeAuthoritativeCurriculumDiff(before, after);
  ok(authDiff.every((p) => /^(vocabularyWords|teachingKit\.vocabCards)/.test(p)),
    "allowed persisted paths only vocabularyWords + teachingKit.vocabCards (+ nested)");
  ok(JSON.stringify(after.songs) === JSON.stringify(before.songs), "songs unchanged");
  ok(JSON.stringify(after.books) === JSON.stringify(before.books), "books unchanged");
  ok(JSON.stringify(after.teachingKit.printableIds) === JSON.stringify(before.teachingKit.printableIds),
    "printables unchanged");
  ok(after.coverImageUrl === before.coverImageUrl, "cover unchanged");
  ok(JSON.stringify(after.learningDomains) === JSON.stringify(before.learningDomains), "domains unchanged");
  ok(JSON.stringify(after.teachingKit.milestones) === JSON.stringify(before.teachingKit.milestones),
    "milestones unchanged");
  ok(after.status === before.status && after.publishedAt === before.publishedAt, "status/publishedAt unchanged");
  ok(after.dailyPlans.monday.items[0].itemId === ACT_DOT, "activity ids unchanged");
  ok(JSON.stringify(helloFall) === JSON.stringify(beforeHf), "second lesson fingerprint unchanged (no cross-lesson write)");
}

console.log("\nT5) malformed composer output fails closed when unnormalizable");
{
  const plan = historicalDraftPlan();
  const work = {
    lessonId: LMW_ID,
    weekRequests: [{ field: "vocabCards", action: "REPLACE", reason: "malformed" }],
    weekKeep: [],
    activityRequests: [],
    activityKeep: [],
    songRequests: [],
    bookRequest: null,
    hasWork: true,
  };
  const invalid = composer.validateComposerOutput(JSON.stringify({
    lessonId: LMW_ID,
    weeklyChanges: { vocabCards: { action: "REPLACE", value: [{ word: "" }, { foo: "bar" }, null] } },
    activities: [],
  }), work, plan);
  ok(invalid.ok === false, "unnormalizable vocabCards fail composer validation");

  const applyCombined = vocabSurgical.applySurgicalVocabToPlan(
    historicalDraftPlan(),
    [{ word: "art, create, explore, build, sticky, paper, press, paint" }],
  );
  ok(!applyCombined.ok || applyCombined.plan.teachingKit.vocabCards.every((c) => !/,/.test(c.word)),
    "combined dump never persists as a single authoritative card word");

  const applyEmpty = vocabSurgical.applySurgicalVocabToPlan(historicalDraftPlan(), [{ word: " , ; " }]);
  ok(applyEmpty.ok === false, "empty expand fails surgical apply closed");
}

console.log("\nT6) extract prefers intended staged cards over historical malformed draft");
{
  const before = historicalDraftPlan();
  const lessonResult = {
    intended: { week: { vocabCards: VALID_CARDS } },
    composerDiagnostics: { accepted: [{ scope: "week", field: "vocabCards", action: "REPLACE" }] },
  };
  const extracted = vocabSurgical.extractVocabCardsForSurgicalApply(before, lessonResult);
  ok(extracted.length === VALID_CARDS.length, "extract uses intended cards");
  ok(extracted[0].word === "press", "extract does not keep historical combined dump");
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, extracted);
  ok(applied.ok, "staged intended cards surgically apply");
  ok(applied.plan.vocabularyWords.split(",").length >= 4, "authoritative string synced from intended");
}

console.log("\nT7) expanded allowlist still routes surgical (production gate regression)");
{
  // buildMutationAllowlist expands vocabCards → [vocabCards, vocabularyWords].
  // That alias expansion previously made isVocabOnlyAllowlist return false and
  // resume fell through to broad apply_enrichment_ok (opjob_24c407e811d57ac0).
  const cmd = vocabOnlyCommand();
  const allowlist = allowlistApi.buildMutationAllowlist(cmd);
  ok(Array.isArray(allowlist.weeklyFieldScope)
    && allowlist.weeklyFieldScope.includes("vocabCards")
    && allowlist.weeklyFieldScope.includes("vocabularyWords"),
  "allowlist expands vocabCards alias pair");
  ok(vocabSurgical.isVocabOnlyAllowlist(allowlist) === true,
    "expanded vocab alias pair is still vocab-only allowlist");
  const mode = vocabSurgical.resolveConnectedApplyMode(allowlist, cmd);
  ok(mode.mode === "surgical_vocab", "resolveConnectedApplyMode routes surgical_vocab");
  const modeAllowlistOnly = vocabSurgical.resolveConnectedApplyMode(allowlist, null);
  ok(modeAllowlistOnly.mode === "surgical_vocab",
    "allowlist alone (no command) still routes surgical_vocab");
}

console.log("\nT8) fail-closed: vocab weekly scope never falls through to broad enrichment");
{
  const badAllowlist = {
    weeklyFieldScope: ["vocabCards", "vocabularyWords"],
    assets: { images: false, printables: false, cover: false, songs: true, books: false },
    allowedActivityFields: new Set(),
  };
  ok(vocabSurgical.isVocabOnlyAllowlist(badAllowlist) === false,
    "songs asset blocks vocab-only allowlist");
  const mode = vocabSurgical.resolveConnectedApplyMode(badAllowlist, null);
  ok(mode.mode === "fail_closed", "contradictory vocab scope fails closed");
  ok(mode.code === "vocab_only_surgical_required", "fail-closed code set");
  ok(mode.mode !== "broad_enrichment", "broad enrichment is not a vocab-only fallback");
}

console.log("\nT9) non-vocab connected requests still choose broad enrichment");
{
  const broadCmd = {
    actions: {
      weeklyFieldScope: [],
      connectedAutoApply: true,
      connectedUpgrade: true,
      textOnly: false,
      publish: false,
    },
    rawCommand: "connected upgrade songs books and printables",
    scope: { lessonIds: [LMW_ID] },
  };
  const allowlist = allowlistApi.buildMutationAllowlist(broadCmd);
  const mode = vocabSurgical.resolveConnectedApplyMode(allowlist, broadCmd);
  ok(mode.mode === "broad_enrichment", "non-vocab connected request keeps broad enrichment mode");
}

console.log("\nT10) production LMW fixture — surgical apply isolates draft and splits cards");
{
  // Modeled on cur-lp-549b80f61dfa8d79 / opjob_24c407e811d57ac0 failure shape.
  const PROD_LMW = "cur-lp-549b80f61dfa8d79";
  const beforeSongs = [
    { title: "Song 1" }, { title: "Song 2" }, { title: "Song 3" }, { title: "Song 4" },
    { title: "Song 5" }, { title: "Song 6" }, { title: "Song 7" }, { title: "Song 8" },
    { title: "Song 9" }, { title: "Song 10" }, { title: "Song 11" }, { title: "Song 12" },
    { title: "Song 13" }, { title: "Song 14" }, { title: "Song 15" }, { title: "Song 16" },
    { title: "Song 17" }, { title: "Song 18" },
  ];
  const beforePrintables = [
    "cur-res-e848c40de2a75807",
    "cur-res-f0751227c6350d48",
    "cur-res-32c4dc661b4f656d",
  ];
  const before = {
    id: PROD_LMW,
    title: "Little Makers Workshop",
    status: "draft",
    publishedAt: null,
    vocabularyWords: "",
    songs: JSON.parse(JSON.stringify(beforeSongs)),
    books: [{ title: "Existing Book" }],
    teachingKit: {
      vocabCards: [{ word: "art, create, explore, build, sticky, paper, press, paint" }],
      printableIds: beforePrintables.slice(),
      milestones: ["Uses two hands."],
    },
    enrichmentDraft: {
      week: {
        songs: [
          { title: "Colorful Hands", motions: "Wiggle fingers" },
          { title: "Wiggly Paintbrush", motions: "Wiggle arms" },
        ],
        books: [{ title: "Draft Book" }],
        printableIds: ["cur-res-3424ffc0ed710893"],
        vocabCards: [{ word: "art, create, explore, build, sticky, paper, press, paint" }],
      },
      updatedAt: "2026-08-01T00:00:00.000Z",
      lastEditedBy: "history",
    },
  };
  const intended = [
    { word: "art" }, { word: "create" }, { word: "explore" }, { word: "build" },
  ];
  const cmd = {
    actions: {
      weeklyFieldScope: ["vocabCards"],
      connectedAutoApply: true,
      connectedUpgrade: true,
      publish: false,
      upgradeActivities: false,
      textOnly: true,
    },
    rawCommand: "vocabulary only art, create, explore, build",
    scope: { lessonIds: [PROD_LMW] },
  };
  const allowlist = allowlistApi.buildMutationAllowlist(cmd);
  const mode = vocabSurgical.resolveConnectedApplyMode(allowlist, cmd);
  ok(mode.mode === "surgical_vocab", "production fixture routes surgical_vocab (not broad)");

  const extracted = vocabSurgical.extractVocabCardsForSurgicalApply(before, {
    intended: { week: { vocabCards: intended } },
  });
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, extracted);
  ok(applied.ok, "production fixture surgical apply succeeds");
  const after = applied.plan;
  ok(after.teachingKit.vocabCards.length === 4, "four separate authoritative vocab cards");
  ok(after.teachingKit.vocabCards.every((c) => !/,/.test(c.word)),
    "no combined comma-list card word remains");
  ok(["art", "create", "explore", "build"].every((w) => after.teachingKit.vocabCards.some((c) => c.word === w)),
    "requested words present as separate cards");
  ok(JSON.stringify(after.songs) === JSON.stringify(beforeSongs), "authoritative songs unchanged");
  ok(JSON.stringify(after.teachingKit.printableIds) === JSON.stringify(beforePrintables),
    "authoritative printableIds unchanged");
  ok(after.status === "draft" && after.publishedAt == null, "publish state unchanged");
  ok(JSON.stringify(after.enrichmentDraft.week.songs) === JSON.stringify(before.enrichmentDraft.week.songs),
    "historical draft songs remain in draft (not cleared/promoted)");
  ok(JSON.stringify(after.enrichmentDraft.week.books) === JSON.stringify(before.enrichmentDraft.week.books),
    "historical draft books remain in draft");
  ok(JSON.stringify(after.enrichmentDraft.week.printableIds)
    === JSON.stringify(before.enrichmentDraft.week.printableIds),
    "historical draft printableIds remain in draft");
  const authDiff = vocabSurgical.computeAuthoritativeCurriculumDiff(before, after);
  ok(authDiff.every((p) => /^(vocabularyWords|teachingKit\.vocabCards)/.test(p)),
    "authoritative diff limited to vocabulary fields");
  const verify = vocabSurgical.verifyVocabOnlyAuthoritativeDiff(before, after, allowlist);
  ok(verify.ok, "vocab-only verifier accepts surgical result");
  ok(!(verify.unexpected || []).length, "no UNEXPECTED_PERSISTED_MUTATION paths");
}

console.log("\nT11) resume wiring uses resolveConnectedApplyMode before broad enrichment");
{
  const indexSrc = fs.readFileSync(path.join(__dirname, "../server/index.js"), "utf8");
  const start = indexSrc.indexOf("async function applyOperatorConnectedEnrichment");
  ok(start > 0, "applyOperatorConnectedEnrichment located");
  const slice = indexSrc.slice(start, start + 2500);
  ok(/resolveConnectedApplyMode\s*\(/.test(slice), "connected apply resolves mode first");
  const surgicalIdx = slice.indexOf('mode === "surgical_vocab"');
  const failIdx = slice.indexOf('mode === "fail_closed"');
  // Match the live call site, not the explanatory comment that also names handlePublishEnrichment.
  const broadCallIdx = slice.search(/\bawait\s+handlePublishEnrichment\s*\(/);
  ok(surgicalIdx > 0 && failIdx > surgicalIdx, "surgical and fail-closed gates present");
  ok(broadCallIdx > failIdx, "surgical/fail-closed gates precede broad enrichment publish call");
  const opSrc = fs.readFileSync(path.join(__dirname, "../server/curriculum-operator.js"), "utf8");
  ok(/command:\s*job\.command/.test(opSrc), "tryConnectedAutoApply passes job.command into apply gate");
}

function explicitFourWordCommand(rawExtra = "") {
  return {
    actions: {
      weeklyFieldScope: ["vocabCards"],
      connectedAutoApply: true,
      connectedUpgrade: true,
      publish: false,
      upgradeActivities: false,
      textOnly: true,
      touchImages: false,
      touchPrintables: false,
      touchSongs: false,
      touchBooks: false,
      touchCover: false,
    },
    rawCommand: `Change vocabulary to art, create, explore, build. exactly these four separate cards: art, create, explore, build. vocabulary-only. weeklyFieldScope=["vocabCards"] publish=false upgradeActivities=false. ${rawExtra}`.trim(),
    scope: { lessonIds: [LMW_ID] },
  };
}

console.log("\nT12) explicit vocab authority — exact four-word request");
{
  const cmd = explicitFourWordCommand();
  const words = vocabSurgical.extractExplicitVocabularyWords(cmd);
  ok(words.length === 4, "exact four explicit words extracted");
  ok(words.join(",") === "art,create,explore,build", "order preserved: art, create, explore, build");
  ok(!words.includes("play") && !words.includes("color"), "no AI substitute words in extract");

  const cards = vocabSurgical.cardsFromExplicitVocabularyWords(words);
  ok(cards.length === 4, "four separate structured cards");
  ok(cards.every((c) => typeof c.word === "string" && !/,/.test(c.word)), "separate-card normalization");
  ok(cards.map((c) => c.word).join(",") === "art,create,explore,build", "card words exact");

  const commaOnly = vocabSurgical.extractExplicitVocabularyWords({
    rawCommand: "Change vocabulary to art, create, explore, build",
  });
  ok(commaOnly.join(",") === "art,create,explore,build", "combined comma input normalizes to separate words");
}

console.log("\nT13) explicit vocab survives parser → plan scope → surgical payload");
{
  const cmd = explicitFourWordCommand();
  const allowlist = allowlistApi.buildMutationAllowlist(cmd);
  ok(vocabSurgical.isVocabOnlyWeeklyScope(cmd.actions.weeklyFieldScope), "plan weeklyFieldScope is vocab-only");
  const mode = vocabSurgical.resolveConnectedApplyMode(allowlist, cmd);
  ok(mode.mode === "surgical_vocab", "routing remains surgical_vocab");
  ok(mode.mode !== "broad_enrichment", "never broad_enrichment");

  // Simulate composer/AI producing the live wrong set.
  const aiCards = [
    { word: "play" }, { word: "build" }, { word: "color" }, { word: "move" }, { word: "share" },
  ];
  const authority = vocabSurgical.applyExplicitVocabularyAuthorityToIntended(cmd, {
    week: { vocabCards: aiCards },
  });
  ok(authority.changed === true, "authority overrides AI intended vocabulary");
  ok(authority.intended.week.vocabCards.map((c) => c.word).join(",") === "art,create,explore,build",
    "intended after authority is exact requested set");

  const before = historicalDraftPlan();
  const extracted = vocabSurgical.extractVocabCardsForSurgicalApply(before, {
    intended: authority.intended,
  }, cmd);
  ok(extracted.map((c) => c.word).join(",") === "art,create,explore,build",
    "surgical extract payload is exact requested set");
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, extracted);
  ok(applied.ok, "surgical apply succeeds with authoritative explicit set");
  ok(applied.vocabularyWords === "art, create, explore, build",
    "vocabularyWords string is exact requested set");
  ok(applied.plan.teachingKit.vocabCards.length === 4, "no extra fifth card introduced");
  ok(applied.plan.teachingKit.vocabCards.every((c) => ["art", "create", "explore", "build"].includes(c.word)),
    "no synonym/substitution replaces an explicit word");
  ok(JSON.stringify(applied.plan.songs) === JSON.stringify(before.songs), "non-vocab songs unchanged");
  ok(JSON.stringify(applied.plan.books) === JSON.stringify(before.books), "non-vocab books unchanged");
  ok(JSON.stringify(applied.plan.learningDomains) === JSON.stringify(before.learningDomains),
    "learningDomains unchanged");
  ok(applied.plan.status === "draft" && applied.plan.publishedAt == null, "publish=false preserved");
  ok(JSON.stringify(applied.plan.enrichmentDraft.week.songs)
    === JSON.stringify(before.enrichmentDraft.week.songs),
    "historical enrichmentDraft songs not promoted");
}

console.log("\nT14) composer mismatch fail-closed before persistence");
{
  const cmd = explicitFourWordCommand();
  const before = historicalDraftPlan();
  const aiCards = [
    { word: "play" }, { word: "build" }, { word: "color" }, { word: "move" }, { word: "share" },
  ];
  let threw = null;
  try {
    vocabSurgical.extractVocabCardsForSurgicalApply(before, {
      intended: { week: { vocabCards: aiCards } },
    }, cmd);
  } catch (error) {
    threw = error;
  }
  ok(threw && threw.code === "VOCAB_CONTENT_MISMATCH",
    "AI substitute list fails closed with VOCAB_CONTENT_MISMATCH");

  const wrongCount = vocabSurgical.resolveAuthoritativeVocabCards({
    command: cmd,
    candidateCards: [{ word: "art" }, { word: "create" }, { word: "explore" }],
  });
  ok(wrongCount.ok === false && wrongCount.code === "VOCAB_CONTENT_MISMATCH",
    "wrong count fails closed");

  const wrongContent = vocabSurgical.resolveAuthoritativeVocabCards({
    command: cmd,
    candidateCards: [
      { word: "art" }, { word: "create" }, { word: "explore" }, { word: "paint" },
    ],
  });
  ok(wrongContent.ok === false && wrongContent.code === "VOCAB_CONTENT_MISMATCH",
    "wrong content same count fails closed");

  const extraWord = vocabSurgical.resolveAuthoritativeVocabCards({
    command: cmd,
    candidateCards: [
      { word: "art" }, { word: "create" }, { word: "explore" }, { word: "build" }, { word: "share" },
    ],
  });
  ok(extraWord.ok === false && extraWord.code === "VOCAB_CONTENT_MISMATCH",
    "unauthorized extra word fails closed");

  // Historical draft poison must not be used when intended is empty for explicit reqs.
  const fromEmptyIntended = vocabSurgical.extractVocabCardsForSurgicalApply(before, {
    intended: { week: {} },
  }, cmd);
  ok(fromEmptyIntended.map((c) => c.word).join(",") === "art,create,explore,build",
    "empty intended + explicit command uses authoritative explicit set (not historical draft)");
}

console.log("\nT15) generative vocab-only (no explicit list) still works");
{
  const genCmd = {
    actions: {
      weeklyFieldScope: ["vocabCards"],
      connectedAutoApply: true,
      connectedUpgrade: true,
      publish: false,
      upgradeActivities: false,
      textOnly: true,
    },
    rawCommand: "Improve the vocabulary cards for Little Makers Workshop. vocabulary-only. publish=false",
    scope: { lessonIds: [LMW_ID] },
  };
  ok(vocabSurgical.extractExplicitVocabularyWords(genCmd).length === 0,
    "generative request yields no explicit word list");
  const aiCards = [
    { word: "press" }, { word: "stick" }, { word: "roll" }, { word: "build" },
  ];
  const resolved = vocabSurgical.resolveAuthoritativeVocabCards({
    command: genCmd,
    candidateCards: aiCards,
  });
  ok(resolved.ok && resolved.explicit === false, "generative path leaves composer cards authoritative");
  ok(resolved.cards.map((c) => c.word).join(",") === "press,stick,roll,build",
    "composer-generated vocabulary retained for generative request");

  const allowlist = allowlistApi.buildMutationAllowlist(genCmd);
  const mode = vocabSurgical.resolveConnectedApplyMode(allowlist, genCmd);
  ok(mode.mode === "surgical_vocab", "generative vocab-only still routes surgical_vocab");
  ok(mode.mode !== "broad_enrichment", "generative vocab-only never broad_enrichment");
}

console.log("\nT16) contradictory vocab-only remains fail_closed (never broad_enrichment)");
{
  const badAllowlist = {
    weeklyFieldScope: ["vocabCards", "vocabularyWords"],
    assets: { images: false, printables: false, cover: false, songs: true, books: false },
    allowedActivityFields: new Set(),
  };
  // Contradictory allowlist without a clean vocab-only command signal → fail_closed.
  const mode = vocabSurgical.resolveConnectedApplyMode(badAllowlist, null);
  ok(mode.mode === "fail_closed", "contradictory/unsafe vocab-only remains fail_closed");
  ok(mode.mode !== "broad_enrichment", "fail_closed never becomes broad_enrichment");
  const explicitMode = vocabSurgical.resolveConnectedApplyMode(
    allowlistApi.buildMutationAllowlist(explicitFourWordCommand()),
    explicitFourWordCommand(),
  );
  ok(explicitMode.mode === "surgical_vocab", "safe explicit vocab-only still surgical_vocab");
}

console.log("\nT17) local LMW fixture replay of failed live vocabulary request");
{
  // Local-only replay of opjob_2d434de3838cc38d failure class. No production mutation.
  const before = historicalDraftPlan({
    vocabularyWords: "play, build, color, move, share",
  });
  const cmd = explicitFourWordCommand("Lesson ID: cur-lp-549b80f61dfa8d79");
  const aiIntended = {
    week: {
      vocabCards: [
        { word: "play" }, { word: "build" }, { word: "color" }, { word: "move" }, { word: "share" },
      ],
    },
  };
  // Stage 1: authority at upgrade/composer boundary replaces AI set.
  const authority = vocabSurgical.applyExplicitVocabularyAuthorityToIntended(cmd, aiIntended);
  ok(authority.intended.week.vocabCards.map((c) => c.word).join(",") === "art,create,explore,build",
    "local replay: intended surgical payload is exact art/create/explore/build");
  // Stage 2: surgical extract + apply with corrected intended.
  const extracted = vocabSurgical.extractVocabCardsForSurgicalApply(before, {
    intended: authority.intended,
  }, cmd);
  const applied = vocabSurgical.applySurgicalVocabToPlan(before, extracted);
  ok(applied.ok, "local replay surgical apply ok");
  ok(applied.plan.teachingKit.vocabCards.map((c) => c.word).join(",") === "art,create,explore,build",
    "local replay authoritative cards exact");
  ok(applied.vocabularyWords === "art, create, explore, build",
    "local replay vocabularyWords exact");
  const authDiff = vocabSurgical.computeAuthoritativeCurriculumDiff(before, applied.plan);
  ok(authDiff.every((p) => /^(vocabularyWords|teachingKit\.vocabCards)/.test(p)),
    "local replay: only vocabulary authoritative fields change");
  ok(applied.plan.status === "draft", "local replay stays draft");
  // Stage 3: uncorrected AI intended must still fail closed (no silent wrong persist).
  let fail = null;
  try {
    vocabSurgical.extractVocabCardsForSurgicalApply(before, { intended: aiIntended }, cmd);
  } catch (error) {
    fail = error;
  }
  ok(fail && fail.code === "VOCAB_CONTENT_MISMATCH",
    "local replay: uncorrected AI intended fails closed before persistence");
}

console.log(`\n${passed} assertions passed.`);

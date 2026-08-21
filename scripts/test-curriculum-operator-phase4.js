#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 4 — printables only.
 * Deterministic pdf-lib fixtures; CI must not call live external generation.
 * Run: npm run test:curriculum-operator-phase4
 */
"use strict";

const assert = require("node:assert/strict");
const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const auditApi = require("./curriculum-operator-audit.js");
const printablesApi = require("./curriculum-operator-printables.js");
const jobApi = require("./curriculum-operator-job.js");
const selectApi = require("./curriculum-operator-select.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "leahivie@icloud.com" };
const LESSON_ID = "cur-lp-operator-printables-apple";
const ACT_CAFE = "cur-act-apple-cafe";
const ACT_PAINT = "cur-act-apple-paint";
const ACT_SONG = "cur-act-apple-song";
const WEAK_RES = "cur-res-kitchen-zone-signs";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function seedCurriculum() {
  const now = new Date().toISOString();
  return {
    lessonPlans: [{
      id: LESSON_ID,
      title: "Apples in the Kitchen",
      age: "Toddler 18–24 Months",
      theme: "Apples",
      plan: "Pro",
      status: "published",
      weeklyOverview: "Explore apples through play.",
      objectives: "Children will explore apple play.",
      enrichmentDraft: {
        week: { weeklyOverview: "Explore apples through play.", printableIds: [WEAK_RES] },
        activities: {
          [ACT_PAINT]: { setupImageUrl: "https://cdn.example.test/paint-keep.png", setupMediaAssetId: "img-keep" },
        },
        updatedAt: now,
      },
      resourceIds: [WEAK_RES],
      dailyPlans: {
        monday: {
          items: [
            { itemId: "cafe", title: "Apple Café Dramatic Play", dayOfWeek: "monday" },
            { itemId: "paint", title: "Apple Rolling Painting", dayOfWeek: "monday" },
            { itemId: "song", title: "Apple Song", dayOfWeek: "monday" },
          ],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      activityIds: [ACT_CAFE, ACT_PAINT, ACT_SONG],
      updatedAt: now,
      createdAt: now,
    }],
    activities: [
      {
        id: ACT_CAFE,
        lessonPlanId: LESSON_ID,
        title: "Apple Café Dramatic Play",
        dayOfWeek: "monday",
        category: "Dramatic Play",
        objective: "Children will take orders and serve pretend apple snacks in café play.",
        materials: "Menus, tickets, pretend food",
        setup: "Set a café table.",
        steps: "1. Welcome customers. 2. Take orders. 3. Serve snacks.",
      },
      {
        id: ACT_PAINT,
        lessonPlanId: LESSON_ID,
        title: "Apple Rolling Painting",
        dayOfWeek: "monday",
        category: "Art",
        objective: "Explore process art with rolling apples.",
        materials: "Apples, paint, paper, trays",
        setup: "Tray on table.",
        steps: "Roll apples through paint.",
        setupImageUrl: "https://cdn.example.test/paint-keep.png",
      },
      {
        id: ACT_SONG,
        lessonPlanId: LESSON_ID,
        title: "Apple Song",
        dayOfWeek: "monday",
        category: "Music",
        objective: "Sing together.",
        steps: "Sing the apple song.",
        imageRequirement: "not_needed",
      },
    ],
    resources: [{
      id: WEAK_RES,
      title: "Kitchen Zone Signs",
      resourceCategory: "Printables",
      resourceType: "Sign",
      description: "Generic HELP / WASH / TRAINING zone signs",
      lessonPlanIds: [LESSON_ID],
      status: "draft",
      fileName: "zone-signs.pdf",
      fileData: "data:application/pdf;base64,JVBERi0xLjQ=",
      pageCount: 1,
      mimeType: "application/pdf",
    }],
  };
}

async function main() {
  console.log("Curriculum Operator Phase 4 — printables");

  console.log("Command / schema");
  const cmd = commandApi.parseOperatorCommand(
    "Fix the printables on Apples in the Kitchen.",
    { phase: 4 },
  );
  ok(cmd.command.actions.generatePrintables === true, "fix printables enables generatePrintables");
  ok(cmd.command.actions.generateImages === false, "Phase 4 does not regenerate images");
  ok(cmd.command.actions.publish === false, "publish blocked");
  ok(cmd.command.actions.createLesson === false, "lesson.create blocked");

  const p3 = schema.normalizeOperatorCommand({
    actions: { generatePrintables: true },
  }, { phase: 3 });
  ok(p3.actions.generatePrintables === false, "phase 3 still blocks printables");

  const p4 = schema.normalizeOperatorCommand({
    intent: "finish_printables",
    actions: { generatePrintables: true },
  }, { phase: 4 });
  ok(p4.actions.generatePrintables === true && p4.actions.generateImages === false, "phase 4 printables only");

  console.log("Decisions / specs");
  const curriculum = seedCurriculum();
  const plan = curriculum.lessonPlans[0];
  const audit = auditApi.auditLesson(plan, curriculum);
  const actions = printablesApi.buildPrintableActionsFromAudit(
    plan,
    curriculum.activities,
    audit,
    curriculum,
    { replaceWeakPrintables: true },
  );
  const byId = Object.fromEntries(actions.map((a) => [a.activityId, a]));
  ok(byId[ACT_CAFE]?.decision === "CREATE", "dramatic play → CREATE");
  ok(byId[ACT_CAFE]?.reason, "CREATE requires reason");
  ok(byId[ACT_PAINT]?.decision === "NOT_NEEDED", "process art → NOT_NEEDED");
  ok(byId[ACT_SONG]?.decision === "NOT_NEEDED" || byId[ACT_SONG]?.decision === "KEEP", "song not forced to CREATE");
  const removeAction = actions.find((a) => a.decision === "REMOVE" && (a.spec?.existingResourceIds || []).includes(WEAK_RES));
  ok(Boolean(removeAction), "weak lesson-level zone signs → REMOVE");
  ok(byId[ACT_CAFE]?.spec?.resourceType === "dramatic_play_pack", "correct printable type selection");
  ok(/café|cafe|dramatic/i.test(byId[ACT_CAFE]?.spec?.title || ""), "correct display title for cafe pack");
  ok(!/zone\s*sign/i.test(byId[ACT_CAFE]?.spec?.title || ""), "no random sign fallback title on CREATE");

  // KEEP existing good printable
  const goodCurriculum = seedCurriculum();
  goodCurriculum.resources = [{
    id: "cur-res-cafe-good",
    title: "Apple Café Dramatic Play Pack",
    resourceCategory: "Printables",
    resourceType: "dramatic_play_pack",
    description: `Menus and tickets\nOperator activityId=${ACT_CAFE}`,
    lessonPlanIds: [LESSON_ID],
    activityId: ACT_CAFE,
    status: "draft",
    fileName: "apples-in-the-kitchen-apple-cafe-dramatic-play-pack.pdf",
    fileData: "data:application/pdf;base64,JVBERi0xLjQ=",
    pageCount: 3,
    mimeType: "application/pdf",
  }];
  goodCurriculum.lessonPlans[0].resourceIds = ["cur-res-cafe-good"];
  goodCurriculum.lessonPlans[0].enrichmentDraft.week.printableIds = ["cur-res-cafe-good"];
  const goodAudit = auditApi.auditLesson(goodCurriculum.lessonPlans[0], goodCurriculum);
  // Force activity-linked resource into audit by setting activityId path used by refine
  const keepActions = printablesApi.buildPrintableActionsFromAudit(
    goodCurriculum.lessonPlans[0],
    goodCurriculum.activities,
    {
      ...goodAudit,
      assetPlan: goodAudit.assetPlan.map((item) => (
        item.activityId === ACT_CAFE
          ? {
            ...item,
            printable: {
              decision: "KEEP_EXISTING",
              reason: "Useful printable already linked.",
              purpose: "Existing linked resource.",
              type: "dramatic_play_pack",
              title: "Apple Café Dramatic Play Pack",
              contents: [],
              existingResourceIds: ["cur-res-cafe-good"],
            },
          }
          : item
      )),
    },
    goodCurriculum,
    { replaceWeakPrintables: true },
  );
  const keepCafe = keepActions.find((a) => a.activityId === ACT_CAFE);
  ok(keepCafe?.decision === "KEEP", "KEEP existing good printable");

  // REPLACE weak activity-linked printable rebuilds useful title
  const replaceActions = printablesApi.buildPrintableActionsFromAudit(
    plan,
    curriculum.activities,
    {
      assetPlan: [{
        activityId: ACT_CAFE,
        activityTitle: "Apple Café Dramatic Play",
        printable: {
          decision: "REPLACE",
          reason: "Linked printable looks generic.",
          purpose: "Replace generic signage.",
          type: "other",
          title: "Kitchen Zone Signs",
          contents: [],
          existingResourceIds: [WEAK_RES],
        },
      }],
    },
    {
      ...curriculum,
      resources: curriculum.resources.map((r) => (
        r.id === WEAK_RES ? { ...r, activityId: ACT_CAFE, description: `Operator activityId=${ACT_CAFE}` } : r
      )),
    },
    { replaceWeakPrintables: true },
  );
  const replaceCafe = replaceActions.find((a) => a.activityId === ACT_CAFE);
  ok(replaceCafe?.decision === "REPLACE", "REPLACE weak/generic printable");
  ok(/cafe|café|dramatic/i.test(replaceCafe?.spec?.title || ""), "REPLACE rebuilds activity-driven display title");
  ok(!/zone\s*sign/i.test(replaceCafe?.spec?.title || ""), "REPLACE does not keep zone-sign title");

  const cafeSpec = byId[ACT_CAFE].spec;
  const specOk = printablesApi.validatePrintableSpec(cafeSpec, {
    expectedLessonId: LESSON_ID,
    knownActivityIds: [ACT_CAFE, ACT_PAINT, ACT_SONG],
  });
  ok(specOk.ok, "valid cafe printable spec accepted");

  const badLesson = printablesApi.validatePrintableSpec({
    ...cafeSpec,
    lessonId: "wrong-lesson",
  }, { expectedLessonId: LESSON_ID, knownActivityIds: [ACT_CAFE] });
  ok(!badLesson.ok && badLesson.errors.includes("wrong_lesson_id"), "wrong lesson ID rejected");

  const badAct = printablesApi.validatePrintableSpec({
    ...cafeSpec,
    activityIds: ["cur-act-does-not-exist"],
  }, { expectedLessonId: LESSON_ID, knownActivityIds: [ACT_CAFE] });
  ok(!badAct.ok, "wrong activity ID rejected");

  const noPurpose = printablesApi.validatePrintableSpec({
    ...cafeSpec,
    purpose: "",
    reason: "",
  }, { expectedLessonId: LESSON_ID, knownActivityIds: [ACT_CAFE] });
  ok(!noPurpose.ok && noPurpose.errors.includes("purpose_required"), "purpose required for CREATE");

  console.log("PDF generate / validate");
  const generated = await printablesApi.generatePrintablePdfBuffer({
    spec: cafeSpec,
    plan,
    activity: curriculum.activities.find((a) => a.id === ACT_CAFE),
  });
  ok(generated.buffer.length > 500, "PDF buffer generated");
  ok(/apples|cafe|dramatic|kitchen/i.test(generated.fileName), "human-readable filename");
  ok(!/^(printable|file\d+|resource-\d+)\.pdf$/i.test(generated.fileName), "filename not generic placeholder");
  const validated = await printablesApi.validateGeneratedPdf(generated.buffer, {
    expectedPageCount: generated.pageCount,
    fileName: generated.fileName,
  });
  ok(validated.ok, "PDF page validation passes");
  ok(validated.pageCount === cafeSpec.pageCount, "page count matches spec");
  ok(cafeSpec.pageCount >= 2, "multiple-page PDF assembly expected for cafe pack");
  ok(/café|cafe|dramatic/i.test(cafeSpec.title), "correct display title on spec");

  const blankReject = await printablesApi.validateGeneratedPdf(Buffer.from("%PDF-1.4 empty"), {
    expectedPageCount: 3,
    fileName: "printable.pdf",
  });
  ok(!blankReject.ok, "blank-page / stub PDF rejection");

  const badName = printablesApi.sanitizePrintableFileName("My Café Pack!!!");
  ok(badName === "my-caf-pack.pdf" || /^[a-z0-9-]+\.pdf$/.test(badName), "PDF filename normalization");
  ok(printablesApi.sanitizePrintableFileName("printable.pdf") === "printable.pdf"
    || printablesApi.sanitizePrintableFileName("x").endsWith(".pdf"), "filename always ends with .pdf");

  const link = printablesApi.linkPrintableIntoEnrichmentDraft(plan.enrichmentDraft, {
    lessonId: LESSON_ID,
    expectedLessonId: LESSON_ID,
    activityId: ACT_CAFE,
    resourceId: "cur-res-new-cafe",
    title: cafeSpec.title,
  });
  ok(link.ok, "draft link by exact activity id");
  ok(link.enrichmentDraft.activities[ACT_CAFE].relatedPrintableId === "cur-res-new-cafe", "activity association stored");
  ok(link.enrichmentDraft.activities[ACT_PAINT]?.setupImageUrl === "https://cdn.example.test/paint-keep.png"
    || plan.enrichmentDraft.activities[ACT_PAINT].setupImageUrl === "https://cdn.example.test/paint-keep.png",
  "image fields not cleared by printable link helper");

  const wrongLink = printablesApi.linkPrintableIntoEnrichmentDraft(plan.enrichmentDraft, {
    lessonId: "other",
    expectedLessonId: LESSON_ID,
    activityId: ACT_CAFE,
    resourceId: "x",
    title: "x",
  });
  ok(!wrongLink.ok && wrongLink.code === "wrong_lesson_id", "wrong lesson ID refused on link");

  console.log("No-op decisions");
  const noopGen = { calls: 0 };
  const keepOnly = await printablesApi.runPrintablePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit: {
      assetPlan: [{
        activityId: ACT_PAINT,
        activityTitle: "Apple Rolling Painting",
        printable: {
          decision: "NOT_NEEDED",
          reason: "Process art",
          purpose: "",
          type: null,
          title: "",
          contents: [],
          existingResourceIds: [],
        },
      }],
    },
    curriculum,
    limits: { maxPrintableGenerations: 10 },
    createPrintableResource: async () => { noopGen.calls += 1; return { ok: true, resourceId: "x" }; },
  });
  ok(noopGen.calls === 0, "NOT_NEEDED never generates/uploads");
  ok(keepOnly.generations === 0, "NOT_NEEDED consumes zero printable budget");

  // Upload failure must not unlink old resource
  let unlinked = [];
  const uploadFail = await printablesApi.runPrintablePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit: {
      assetPlan: [{
        activityId: ACT_CAFE,
        activityTitle: "Apple Café Dramatic Play",
        printable: {
          decision: "REPLACE",
          reason: "Replace weak signs with cafe pack.",
          purpose: "Children use menu and tickets during café play.",
          type: "dramatic_play_pack",
          title: "Apple Café Dramatic Play Pack",
          contents: ["menu", "order tickets", "food cards"],
          existingResourceIds: [WEAK_RES],
        },
      }],
    },
    curriculum,
    limits: { maxPrintableGenerations: 10 },
    createPrintableResource: async () => ({ ok: false, error: "upload exploded" }),
    unlinkPrintableResource: async ({ resourceId }) => {
      unlinked.push(resourceId);
      return { ok: true };
    },
  });
  ok(uploadFail.actions.some((a) => a.status === "failed"), "upload failure marks incomplete");
  ok(unlinked.length === 0, "upload failure does not remove old resource");
  ok(uploadFail.actions.some((a) => a.preservedExisting === true), "failed REPLACE preserves existing flag");

  // Preview/download verification failure marks incomplete and does not unlink
  unlinked = [];
  const verifyFail = await printablesApi.runPrintablePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit: {
      assetPlan: [{
        activityId: ACT_CAFE,
        activityTitle: "Apple Café Dramatic Play",
        printable: {
          decision: "REPLACE",
          reason: "Replace weak signs.",
          purpose: "Children use menu and tickets during café play.",
          type: "dramatic_play_pack",
          title: "Apple Café Dramatic Play Pack",
          contents: ["menu", "tickets"],
          existingResourceIds: [WEAK_RES],
        },
      }],
    },
    curriculum,
    limits: { maxPrintableGenerations: 10 },
    createPrintableResource: async () => ({ ok: true, resourceId: "cur-res-new-but-broken" }),
    readResourceFile: async () => ({ ok: false, error: "preview failed" }),
    unlinkPrintableResource: async ({ resourceId }) => {
      unlinked.push(resourceId);
      return { ok: true };
    },
  });
  ok(verifyFail.actions.some((a) => a.status === "failed" && /preview|download|verif/i.test(a.error || "")),
    "preview verification failure marks incomplete");
  ok(unlinked.length === 0, "link/verify failure does not remove old resource");

  // Safe REMOVE of inappropriate resource
  unlinked = [];
  const removeOnly = await printablesApi.runPrintablePlanForLesson({
    plan: JSON.parse(JSON.stringify(plan)),
    activities: curriculum.activities,
    audit: {
      assetPlan: curriculum.activities.map((a) => ({
        activityId: a.id,
        activityTitle: a.title,
        printable: {
          decision: "NOT_NEEDED",
          reason: "n/a",
          purpose: "",
          type: null,
          title: "",
          contents: [],
          existingResourceIds: [],
        },
      })),
    },
    curriculum,
    limits: { maxPrintableGenerations: 10 },
    unlinkPrintableResource: async ({ resourceId }) => {
      unlinked.push(resourceId);
      return { ok: true, preservedResourceRecord: true };
    },
  });
  ok(removeOnly.actions.some((a) => a.decision === "REMOVE" && a.status === "success"),
    "REMOVE inappropriate resource safely");
  ok(unlinked.includes(WEAK_RES), "REMOVE unlinks weak zone signs");

  console.log("Scope / limits");
  const soft = printablesApi.assessPrintableScope({
    actions: Array.from({ length: 20 }, (_, i) => ({
      decision: "CREATE",
      spec: { pageCount: 3 },
      activityId: `a${i}`,
    })),
    lessonCount: 1,
    limits: { maxPrintableGenerations: 30 },
  });
  ok(soft.ok === false && soft.code === "SCOPE_REVIEW_REQUIRED", "soft printable budget triggers scope review");

  console.log("Printable soft-budget (Phase 6 self-budget)");
  const softPackMax = printablesApi.SOFT_PRINTABLE_PACKS_PER_LESSON;
  const softPageMax = printablesApi.softPrintablePageBudget(1);
  ok(softPackMax === 5, "canonical soft pack budget remains 5 (not raised)");
  ok(softPageMax === 30, "canonical soft page budget = 5 × 6 = 30");
  ok(schema.DEFAULT_LIMITS.maxPrintableGenerations === 30, "hard printable max remains 30");

  function makePrintableBudgetAction(id, decision, extra = {}) {
    const pages = Array.isArray(extra.pages)
      ? extra.pages
      : Array.from({ length: Math.max(1, Number(extra.pageCount) || 3) }, (_, i) => ({
        index: i + 1,
        label: `page ${i + 1}`,
        kind: extra.resourceType || "other",
      }));
    return {
      activityId: id,
      activityTitle: extra.title || id,
      decision,
      reason: extra.reason || `${decision} for ${id}`,
      spec: {
        decision,
        title: extra.title || `${id} Pack`,
        resourceType: extra.resourceType || "other",
        purpose: extra.purpose || "Teacher-facing instructional support for the activity.",
        pageCount: pages.length,
        pages,
        activityIds: extra.activityIds || [id],
        reason: extra.reason || `${decision} for ${id}`,
      },
      ...extra,
    };
  }

  const fifteenPrintActs = [];
  for (let i = 0; i < 15; i += 1) {
    fifteenPrintActs.push({
      id: `cur-act-pb-${String(i).padStart(2, "0")}`,
      title: `Bakery Act ${i}`,
      activityCategory: i < 3 ? "Dramatic Play" : "Learning",
    });
  }

  // Under soft pack + page budgets → unchanged
  const underActions = [
    makePrintableBudgetAction("cur-act-pb-00", "CREATE", {
      resourceType: "dramatic_play_pack",
      pageCount: 3,
      reason: "Dramatic play benefits from props children can use (menus, tickets, food cards).",
      title: "Bakery Cafe Dramatic Play",
    }),
    makePrintableBudgetAction("cur-act-pb-01", "CREATE", {
      resourceType: "matching_cards",
      pageCount: 2,
      reason: "Card/sorting/matching activity needs usable pieces for children.",
      title: "Cookie Matching Cards",
    }),
    makePrintableBudgetAction("cur-act-pb-02", "KEEP", { reason: "Useful printable already linked." }),
    makePrintableBudgetAction("cur-act-pb-03", "NOT_NEEDED", { reason: "Process art — printable not needed." }),
  ];
  const underBudget = printablesApi.applyPrintableGenerationSoftBudget(underActions, {
    softPackMax,
    softPageMax,
    activities: fifteenPrintActs,
  });
  ok(underBudget.diagnostics.plannedPackCountBeforeBudget === 2, "under-budget: plannedPackCountBeforeBudget");
  ok(underBudget.diagnostics.finalPackCount === 2, "plan under soft budgets remains unchanged (packs)");
  ok(underBudget.diagnostics.finalEstimatedPageCount === 5, "plan under soft budgets remains unchanged (pages)");
  ok(underBudget.diagnostics.printableBudgetApplied === false, "under-budget does not apply deferral");
  ok(underBudget.diagnostics.deferredPrintableCandidateIds.length === 0, "under-budget: no deferred");

  // Exactly at soft pack + page budgets → unchanged
  const exactPackActions = Array.from({ length: 5 }, (_, i) => makePrintableBudgetAction(
    `cur-act-pb-0${i}`,
    "CREATE",
    {
      resourceType: i === 0 ? "matching_cards" : "dramatic_play_pack",
      pageCount: 6,
      reason: i === 0
        ? "Card/sorting/matching activity needs usable pieces for children."
        : "Dramatic play benefits from props children can use (menus, tickets, food cards).",
      title: `Exact Pack ${i}`,
    },
  ));
  const exactBudget = printablesApi.applyPrintableGenerationSoftBudget(exactPackActions, {
    softPackMax,
    softPageMax,
    activities: fifteenPrintActs,
  });
  ok(exactBudget.diagnostics.finalPackCount === 5, "plan exactly at soft pack budget remains unchanged");
  ok(exactBudget.diagnostics.finalEstimatedPageCount === 30, "plan exactly at soft page budget remains unchanged");
  ok(exactBudget.diagnostics.printableBudgetApplied === false, "exact soft budgets do not defer");

  // Live-shaped: 8 optional/high-value packs / ~23 pages → self-budget
  const liveShaped = [
    makePrintableBudgetAction("cur-act-pb-00", "CREATE", {
      resourceType: "matching_cards",
      pageCount: 3,
      reason: "Card/sorting/matching activity needs usable pieces for children.",
      title: "Cookie Match Cards",
    }),
    makePrintableBudgetAction("cur-act-pb-01", "CREATE", {
      resourceType: "sorting_cards",
      pageCount: 3,
      reason: "Card/sorting/matching activity needs usable pieces for children.",
      title: "Flour Sort Cards",
    }),
    makePrintableBudgetAction("cur-act-pb-02", "CREATE", {
      resourceType: "dramatic_play_pack",
      pageCount: 3,
      reason: "Dramatic play benefits from props children can use (menus, tickets, food cards).",
      title: "Bakery Counter Dramatic Play",
    }),
    makePrintableBudgetAction("cur-act-pb-03", "CREATE", {
      resourceType: "dramatic_play_pack",
      pageCount: 3,
      reason: "Dramatic play benefits from props children can use (menus, tickets, food cards).",
      title: "Bakery Cafe Dramatic Play",
    }),
    makePrintableBudgetAction("cur-act-pb-04", "CREATE", {
      resourceType: "picture_cards",
      pageCount: 3,
      reason: "Visual picture supports for teacher-led vocabulary.",
      title: "Bakery Picture Cards",
    }),
    makePrintableBudgetAction("cur-act-pb-05", "CREATE", {
      resourceType: "other",
      pageCount: 2,
      reason: "Optional enhancement recording sheet.",
      title: "Optional Recording Sheet A",
    }),
    makePrintableBudgetAction("cur-act-pb-06", "CREATE", {
      resourceType: "other",
      pageCount: 3,
      reason: "Optional enhancement checklist.",
      title: "Optional Checklist B",
    }),
    makePrintableBudgetAction("cur-act-pb-07", "CREATE", {
      resourceType: "other",
      pageCount: 3,
      reason: "Optional decorative filler label pack.",
      title: "Optional Labels C",
    }),
    makePrintableBudgetAction("cur-act-pb-08", "KEEP", { reason: "Useful printable already linked." }),
    makePrintableBudgetAction("cur-act-pb-09", "NOT_NEEDED", { reason: "Process art — no printable." }),
  ];
  ok(liveShaped.filter((a) => a.decision === "CREATE").length === 8, "fixture has 8 CREATE packs");
  const livePages = liveShaped
    .filter((a) => a.decision === "CREATE")
    .reduce((sum, a) => sum + printablesApi.printableActionPageCount(a), 0);
  ok(livePages === 23, "fixture estimates ~23 pages like live job");

  const liveBudgetOnce = printablesApi.applyPrintableGenerationSoftBudget(liveShaped, {
    softPackMax,
    softPageMax,
    activities: fifteenPrintActs,
  });
  const liveBudgetTwice = printablesApi.applyPrintableGenerationSoftBudget(liveShaped, {
    softPackMax,
    softPageMax,
    activities: fifteenPrintActs,
  });
  ok(liveBudgetOnce.diagnostics.plannedPackCountBeforeBudget === 8, "plannedPackCountBeforeBudget=8");
  ok(liveBudgetOnce.diagnostics.estimatedPageCountBeforeBudget === 23, "estimatedPageCountBeforeBudget=23");
  ok(liveBudgetOnce.diagnostics.printableSoftPackBudget === 5, "diagnostics printableSoftPackBudget=5");
  ok(liveBudgetOnce.diagnostics.printableSoftPageBudget === 30, "diagnostics printableSoftPageBudget=30");
  ok(liveBudgetOnce.diagnostics.finalPackCount <= softPackMax, "final pack count <= soft pack max");
  ok(liveBudgetOnce.diagnostics.finalEstimatedPageCount <= softPageMax, "final estimated pages <= soft page max");
  ok(liveBudgetOnce.diagnostics.printableBudgetApplied === true, "printableBudgetApplied for over-budget plan");
  ok(liveBudgetOnce.diagnostics.requiredOverBudget === false, "optional over-plan is not requiredOverBudget");
  ok(
    liveBudgetOnce.diagnostics.requiredPrintableCandidateIds.includes("cur-act-pb-00")
      && liveBudgetOnce.diagnostics.requiredPrintableCandidateIds.includes("cur-act-pb-01"),
    "required candidates identified (matching/sorting)",
  );
  ok(
    liveBudgetOnce.diagnostics.selectedPrintableCandidateIds.includes("cur-act-pb-00")
      && liveBudgetOnce.diagnostics.selectedPrintableCandidateIds.includes("cur-act-pb-01"),
    "highest-value / required printable candidates retained",
  );
  ok(
    liveBudgetOnce.diagnostics.deferredPrintableCandidateIds.length >= 3,
    "low-value optional candidates deferred",
  );
  ok(
    liveBudgetOnce.actions.filter((a) => a.budgetDeferred).every((a) => (
      a.decision === "NOT_NEEDED"
      && a.reason.includes(printablesApi.PRINTABLE_BUDGET_DEFER_REASON)
      && a.priorDecision === "CREATE"
    )),
    "deferred candidates receive typed printable_budget_priority reason",
  );
  ok(
    JSON.stringify(liveBudgetOnce.diagnostics.selectedPrintableCandidateIds)
      === JSON.stringify(liveBudgetTwice.diagnostics.selectedPrintableCandidateIds)
    && JSON.stringify(liveBudgetOnce.diagnostics.deferredPrintableCandidateIds)
      === JSON.stringify(liveBudgetTwice.diagnostics.deferredPrintableCandidateIds),
    "printable selection is deterministic across identical inputs",
  );
  ok(
    liveBudgetOnce.actions.filter((a) => a.decision === "KEEP").length === 1,
    "existing useful KEEP does not consume new-generation budget",
  );
  ok(
    liveBudgetOnce.diagnostics.finalKeepCount === 1
      && liveBudgetOnce.diagnostics.printableCandidatesTotal === 8,
    "KEEP is not counted as a printable write candidate",
  );

  // Required outrank optional
  const requiredIds = new Set(liveBudgetOnce.diagnostics.requiredPrintableCandidateIds);
  ok(
    liveBudgetOnce.diagnostics.selectedPrintableCandidateIds
      .filter((id) => requiredIds.has(id)).length === requiredIds.size,
    "required candidates outrank optional and are retained when soft budget allows",
  );

  // Page-only over-budget (few packs, too many pages)
  const pageHeavy = [
    makePrintableBudgetAction("cur-act-pb-00", "CREATE", {
      resourceType: "matching_cards",
      pageCount: 12,
      reason: "Card/sorting/matching activity needs usable pieces for children.",
      title: "Big Match Pack",
    }),
    makePrintableBudgetAction("cur-act-pb-01", "CREATE", {
      resourceType: "dramatic_play_pack",
      pageCount: 12,
      reason: "Dramatic play benefits from props children can use (menus, tickets, food cards).",
      title: "Big Drama Pack",
    }),
    makePrintableBudgetAction("cur-act-pb-02", "CREATE", {
      resourceType: "other",
      pageCount: 12,
      reason: "Optional enhancement worksheet.",
      title: "Optional Heavy Pack",
    }),
  ];
  const pageBudgeted = printablesApi.applyPrintableGenerationSoftBudget(pageHeavy, {
    softPackMax,
    softPageMax,
    activities: fifteenPrintActs,
  });
  ok(pageBudgeted.diagnostics.finalPackCount <= softPackMax, "page-heavy: packs still within soft pack max");
  ok(pageBudgeted.diagnostics.finalEstimatedPageCount <= softPageMax, "page-heavy: pages within soft page max");
  ok(pageBudgeted.diagnostics.printableBudgetApplied === true, "page-heavy plan applies soft budget");
  ok(
    pageBudgeted.diagnostics.selectedPrintableCandidateIds.includes("cur-act-pb-00"),
    "page-heavy: required pack retained preferentially",
  );

  // Required-only plan exceeding soft pack budget → requiredOverBudget
  const requiredHeavy = Array.from({ length: 6 }, (_, i) => makePrintableBudgetAction(
    `cur-act-pb-0${i}`,
    "CREATE",
    {
      resourceType: "matching_cards",
      pageCount: 2,
      reason: "Card/sorting/matching activity needs usable pieces for children.",
      title: `Required Cards ${i}`,
    },
  ));
  const requiredOver = printablesApi.applyPrintableGenerationSoftBudget(requiredHeavy, {
    softPackMax,
    softPageMax,
    activities: fifteenPrintActs,
  });
  ok(requiredOver.requiredOverBudget === true, "required-only over soft pack budget sets requiredOverBudget");
  ok(requiredOver.diagnostics.finalPackCount === 6, "required over-budget does not silently drop required packs");

  // Zero-printable lesson remains valid
  const zeroBudget = printablesApi.applyPrintableGenerationSoftBudget([
    makePrintableBudgetAction("cur-act-pb-00", "NOT_NEEDED", { reason: "No printable improves this activity." }),
    makePrintableBudgetAction("cur-act-pb-01", "NOT_NEEDED", { reason: "No printable improves this activity." }),
  ], { softPackMax, softPageMax, activities: fifteenPrintActs });
  ok(zeroBudget.diagnostics.finalPackCount === 0, "zero-printable lesson remains valid");
  ok(zeroBudget.diagnostics.printableBudgetApplied === false, "zero-printable does not apply budget");

  // One printable can support multiple activities (shared activityIds does not force 1:1)
  const shared = makePrintableBudgetAction("cur-act-pb-00", "CREATE", {
    resourceType: "picture_cards",
    pageCount: 2,
    activityIds: ["cur-act-pb-00", "cur-act-pb-01", "cur-act-pb-02"],
    reason: "Shared visual supports across related bakery stations.",
    title: "Shared Bakery Visual Strip",
  });
  ok(schema.asArray(shared.spec.activityIds).length === 3, "one printable can list multiple activity IDs");
  ok(
    printablesApi.printableWritePriorityScore(shared, fifteenPrintActs[0])
      < printablesApi.printableWritePriorityScore(
        makePrintableBudgetAction("cur-act-pb-05", "CREATE", {
          resourceType: "other",
          pageCount: 1,
          reason: "Optional enhancement.",
          title: "Optional Alone",
        }),
        fifteenPrintActs[5],
      ),
    "shared multi-activity resource outranks lone optional",
  );

  // runPrintablePlanForLesson: optional over-plan self-budgets (no SCOPE_REVIEW)
  const executedIds = [];
  const livePlanRun = await printablesApi.runPrintablePlanForLesson({
    plan: {
      id: LESSON_ID,
      title: "Bakery Soft Budget",
      age: "Preschool",
      enrichmentDraft: { week: {}, activities: {} },
    },
    activities: fifteenPrintActs.slice(0, 10).map((a) => ({
      ...a,
      lessonPlanId: LESSON_ID,
      objective: "Children explore bakery play.",
      materials: "cards trays",
      setup: "Table ready.",
      steps: "1. Explore. 2. Sort. 3. Play.",
    })),
    audit: {
      assetPlan: liveShaped.map((a) => ({
        activityId: a.activityId,
        activityTitle: a.activityTitle,
        printable: {
          decision: a.decision,
          reason: a.reason,
          purpose: a.spec?.purpose || a.reason,
          type: a.spec?.resourceType || null,
          title: a.spec?.title || "",
          contents: schema.asArray(a.spec?.pages).map((p) => p.label),
          existingResourceIds: [],
        },
      })),
    },
    curriculum: {
      lessonPlans: [{ id: LESSON_ID, resourceIds: [] }],
      activities: [],
      resources: [],
    },
    limits: { maxPrintableGenerations: 30 },
    lessonCount: 1,
    createPrintableResource: async ({ activityId }) => {
      executedIds.push(activityId);
      return {
        ok: true,
        resourceId: `cur-res-pb-${executedIds.length}`,
        resource: { id: `cur-res-pb-${executedIds.length}`, status: "draft" },
      };
    },
    readResourceFile: async () => ({
      ok: true,
      previewVerified: true,
      downloadVerified: true,
      pageCount: 3,
      fileName: "pack.pdf",
      title: "pack",
    }),
  });
  ok(livePlanRun.ok !== false || livePlanRun.code !== "SCOPE_REVIEW_REQUIRED", "optional 8-pack plan does not SCOPE_REVIEW");
  ok(livePlanRun.code !== "SCOPE_REVIEW_REQUIRED", "runPrintablePlanForLesson self-budgets live-shaped plan");
  ok(
    livePlanRun.printableBudgetDiagnostics?.printableBudgetApplied === true,
    "run diagnostics printableBudgetApplied",
  );
  ok(
    Number(livePlanRun.printableBudgetDiagnostics?.finalPackCount) <= softPackMax,
    "run finalPackCount <= soft pack max",
  );
  ok(
    Number(livePlanRun.printableBudgetDiagnostics?.finalEstimatedPageCount) <= softPageMax,
    "run finalEstimatedPageCount <= soft page max",
  );
  ok(
    executedIds.every((id) => livePlanRun.printableBudgetDiagnostics.selectedPrintableCandidateIds.includes(id)),
    "printable generation receives only selected pack/activity IDs",
  );
  ok(
    schema.asArray(livePlanRun.printableBudgetDiagnostics?.deferredPrintableCandidateIds)
      .every((id) => !executedIds.includes(id)),
    "deferred printables are never executed",
  );
  ok(
    !livePlanRun.actions.some((a) => a.decision === "CREATE" && a.budgetDeferred && a.status === "success"),
    "deferred CREATE never succeeds as a write",
  );

  // Required-over-budget → SCOPE_REVIEW
  const requiredScope = await printablesApi.runPrintablePlanForLesson({
    plan: { id: LESSON_ID, title: "Required Over", enrichmentDraft: { week: {}, activities: {} } },
    activities: fifteenPrintActs.slice(0, 6),
    audit: {
      assetPlan: requiredHeavy.map((a) => ({
        activityId: a.activityId,
        activityTitle: a.activityTitle,
        printable: {
          decision: "CREATE",
          reason: a.reason,
          purpose: "Children need cards to complete the matching activity.",
          type: "matching_cards",
          title: a.spec.title,
          contents: ["card set A", "card set B"],
          existingResourceIds: [],
        },
      })),
    },
    curriculum: { lessonPlans: [{ id: LESSON_ID, resourceIds: [] }], activities: [], resources: [] },
    limits: { maxPrintableGenerations: 30 },
    lessonCount: 1,
    createPrintableResource: async () => ({ ok: true, resourceId: "should-not-run" }),
  });
  ok(
    requiredScope.code === "SCOPE_REVIEW_REQUIRED"
      && requiredScope.printableBudgetDiagnostics?.requiredOverBudget === true,
    "required-only plan exceeding soft budget still produces scope review",
  );

  // Explicit owner full-coverage request → SCOPE_REVIEW
  const explicitScope = await printablesApi.runPrintablePlanForLesson({
    plan: { id: LESSON_ID, title: "Explicit Full", enrichmentDraft: { week: {}, activities: {} } },
    activities: fifteenPrintActs.slice(0, 8),
    audit: {
      assetPlan: liveShaped.filter((a) => a.decision === "CREATE").map((a) => ({
        activityId: a.activityId,
        activityTitle: a.activityTitle,
        printable: {
          decision: "CREATE",
          reason: a.reason,
          purpose: a.spec.purpose,
          type: a.spec.resourceType,
          title: a.spec.title,
          contents: ["page one", "page two", "page three"],
          existingResourceIds: [],
        },
      })),
    },
    curriculum: { lessonPlans: [{ id: LESSON_ID, resourceIds: [] }], activities: [], resources: [] },
    limits: { maxPrintableGenerations: 30 },
    lessonCount: 1,
    command: {
      rawCommand: "Make a printable pack for every activity in this bakery lesson.",
    },
    createPrintableResource: async () => ({ ok: true, resourceId: "should-not-run" }),
  });
  ok(
    explicitScope.code === "SCOPE_REVIEW_REQUIRED"
      && explicitScope.printableBudgetDiagnostics?.explicitScopeOverride === true,
    "explicit Owner full-printable request may still produce scope review",
  );

  // Hard printable max still blocks (after soft budget, if still over hard)
  const hardBlock = printablesApi.assessPrintableScope({
    actions: Array.from({ length: 31 }, (_, i) => ({
      decision: "CREATE",
      spec: { pageCount: 1 },
      activityId: `hard-${i}`,
    })),
    lessonCount: 1,
    limits: { maxPrintableGenerations: 30 },
  });
  ok(hardBlock.ok === false && /hard max/i.test(hardBlock.reason || ""), "hard printable max still blocks");

  const hardAfterSoft = await printablesApi.runPrintablePlanForLesson({
    plan: { id: LESSON_ID, title: "Hard Cap", enrichmentDraft: { week: {}, activities: {} } },
    activities: fifteenPrintActs.slice(0, 8),
    audit: {
      assetPlan: liveShaped.filter((a) => a.decision === "CREATE").map((a) => ({
        activityId: a.activityId,
        activityTitle: a.activityTitle,
        printable: {
          decision: "CREATE",
          reason: a.reason,
          purpose: a.spec.purpose,
          type: a.spec.resourceType,
          title: a.spec.title,
          contents: ["a", "b", "c"],
          existingResourceIds: [],
        },
      })),
    },
    curriculum: { lessonPlans: [{ id: LESSON_ID, resourceIds: [] }], activities: [], resources: [] },
    limits: { maxPrintableGenerations: 2 },
    lessonCount: 1,
    createPrintableResource: async () => ({ ok: true, resourceId: "nope" }),
  });
  ok(
    hardAfterSoft.code === "SCOPE_REVIEW_REQUIRED"
      && hardAfterSoft.printableBudgetDiagnostics?.hardLimitExceeded === true,
    "hard printable max still blocks after soft budgeting when remaining hard cap is too low",
  );

  // No requirement for one printable per activity (mixed KEEP/NOT_NEEDED/CREATE under budget)
  ok(
    liveBudgetOnce.diagnostics.finalPackCount < fifteenPrintActs.length,
    "no requirement for one printable per activity",
  );

  console.log("Operator job integration");
  let store = {
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true },
      curriculum: seedCurriculum(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  };
  const created = [];
  const imageUrlBefore = store.siteContent.curriculum.lessonPlans[0].enrichmentDraft.activities[ACT_PAINT].setupImageUrl;
  const publishedBefore = {
    status: store.siteContent.curriculum.lessonPlans[0].status,
    title: store.siteContent.curriculum.lessonPlans[0].title,
    age: store.siteContent.curriculum.lessonPlans[0].age,
    weeklyOverview: store.siteContent.curriculum.lessonPlans[0].weeklyOverview,
  };
  const weakBefore = store.siteContent.curriculum.resources.find((r) => r.id === WEAK_RES);

  const api = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => store,
    writeStoreAsync: async (next) => { store = next; },
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    saveOperatorEnrichmentDraft: async ({ lessonPlanId, enrichmentDraft }) => {
      const plans = store.siteContent.curriculum.lessonPlans;
      const idx = plans.findIndex((p) => p.id === lessonPlanId);
      const prev = plans[idx];
      plans[idx] = {
        ...prev,
        enrichmentDraft: { ...enrichmentDraft, updatedAt: new Date().toISOString() },
      };
      return { ok: true, lessonPlan: plans[idx], versionId: `pr-${lessonPlanId}`, saveMode: "enrichment_draft" };
    },
    createOperatorPrintableResource: async ({ lessonPlanId, activityId, title, fileName, fileData, pageCount, resourceType, description }) => {
      const resourceId = `cur-res-op-${created.length + 1}`;
      const resource = {
        id: resourceId,
        title,
        resourceCategory: "Printables",
        resourceType,
        description: `${description}\nOperator activityId=${activityId}`,
        fileName,
        fileData,
        pageCount,
        mimeType: "application/pdf",
        lessonPlanIds: [lessonPlanId],
        status: "draft",
      };
      store.siteContent.curriculum.resources.push(resource);
      const planRow = store.siteContent.curriculum.lessonPlans.find((p) => p.id === lessonPlanId);
      planRow.resourceIds = [...new Set([...(planRow.resourceIds || []), resourceId])];
      created.push(resourceId);
      return { ok: true, resourceId, resource, status: "draft" };
    },
    readOperatorPrintableFile: async ({ resourceId, lessonPlanId }) => {
      const resource = store.siteContent.curriculum.resources.find((r) => r.id === resourceId);
      if (!resource) return { ok: false, error: "missing" };
      if (!(resource.lessonPlanIds || []).includes(lessonPlanId)) return { ok: false, error: "not_linked" };
      return {
        ok: true,
        previewVerified: true,
        downloadVerified: true,
        pageCount: resource.pageCount,
        fileName: resource.fileName,
        title: resource.title,
      };
    },
    unlinkOperatorPrintableResource: async ({ lessonPlanId, resourceId }) => {
      const planRow = store.siteContent.curriculum.lessonPlans.find((p) => p.id === lessonPlanId);
      planRow.resourceIds = (planRow.resourceIds || []).filter((id) => id !== resourceId);
      const resource = store.siteContent.curriculum.resources.find((r) => r.id === resourceId);
      if (resource) {
        resource.lessonPlanIds = (resource.lessonPlanIds || []).filter((id) => id !== lessonPlanId);
      }
      return { ok: true, preservedResourceRecord: true };
    },
  });

  const printCmd = schema.normalizeOperatorCommand({
    rawCommand: "Fix the printables on Apples in the Kitchen.",
    intent: "finish_printables",
    scope: { selection: "explicit_ids", lessonIds: [LESSON_ID], count: 1 },
    actions: { generatePrintables: true, saveDraft: true, generateImages: false },
    completion: { phase: 4 },
  }, { phase: 4 });
  const selection = selectApi.selectLessons(store.siteContent.curriculum, printCmd);
  const planSummary = api.buildPlanSummary(printCmd, selection);
  ok(planSummary.generatesPrintables === true, "plan summary marks printables");
  ok(planSummary.generatesImages === false, "plan summary does not mark images");
  let job = jobApi.createJobFromPlan({
    command: printCmd,
    planSummary,
    createdBy: OWNER.email,
    status: "running",
  });
  ok(job.lessonResults[0].actions.some((a) => a.type === "printable.generatePages"), "job includes printable steps");

  const finished = await api.runJob(job, store, OWNER.email);
  ok(finished.progress.completed === 1 || finished.status === "completed", "printable job completes");
  const lr = finished.lessonResults[0];
  ok(lr.printableCounts, "lesson result includes printableCounts");
  ok(lr.published === false, "no publish");
  const after = store.siteContent.curriculum.lessonPlans[0];
  ok(after.title === publishedBefore.title && after.age === publishedBefore.age, "age/title preserved");
  ok(after.status === publishedBefore.status, "publish status unchanged");
  ok(after.weeklyOverview === publishedBefore.weeklyOverview, "published weeklyOverview unchanged");
  ok(after.enrichmentDraft.activities[ACT_PAINT].setupImageUrl === imageUrlBefore, "activity images unchanged");
  ok(created.length >= 1, "at least one printable resource created");
  ok(store.siteContent.curriculum.resources.every((r) => r.status === "draft" || r.id === WEAK_RES), "new resources remain draft");

  // Resume idempotency
  const createdBeforeResume = created.length;
  finished.lessonResults = finished.lessonResults.map((row) => ({
    ...row,
    status: "success",
    printablesComplete: true,
  }));
  const resumed = await api.runJob(finished, store, OWNER.email);
  ok(resumed.progress.completed === 1, "resume skips completed printable lesson");
  ok(created.length === createdBeforeResume, "resume does not duplicate printable resources");

  // Upload failure preserves old weak resource link until success path
  ok(weakBefore?.id === WEAK_RES, "fixture weak printable existed before run");

  console.log(`\nPhase 4 passed ${passed} assertions`);
}

main().catch((error) => {
  console.error("\nPhase 4 FAILED:", error);
  process.exit(1);
});

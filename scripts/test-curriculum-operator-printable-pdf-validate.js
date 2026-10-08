#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const printablesApi = require("./curriculum-operator-printables.js");
const auditApi = require("./curriculum-operator-audit.js");
const createApi = require("./curriculum-operator-create.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

const LESSON_ID = "cur-lp-printable-pdf-validate";
const ACT_SEED = "cur-act-seed-growth";
const ACT_CAFE = "cur-act-cafe";
const ACT_OTHER = "cur-act-other";

const plan = {
  id: LESSON_ID,
  title: "Spring Planting",
  age: "Preschool 3–5",
  theme: "Spring Planting",
  resourceIds: [],
  enrichmentDraft: { week: { printableIds: [] }, activities: {} },
};

const seedAct = {
  id: ACT_SEED,
  lessonPlanId: LESSON_ID,
  title: "Seed Growth Activity",
  objective: "Sequence seed to plant.",
  materials: "Seeds, soil, cups",
  steps: "Plant and observe.",
};

const cafeAct = {
  id: ACT_CAFE,
  lessonPlanId: LESSON_ID,
  title: "Apple Café Dramatic Play",
  objective: "Role play café.",
  materials: "Play food, menus",
  steps: "Set up café and serve.",
};

const otherAct = {
  id: ACT_OTHER,
  lessonPlanId: LESSON_ID,
  title: "Watering Can Relay",
  objective: "Move water safely.",
  materials: "Watering cans",
  steps: "Relay race with cans.",
};

const curriculum = {
  lessonPlans: [plan],
  activities: [seedAct, cafeAct, otherAct],
  resources: [{
    id: "cur-res-unrelated",
    title: "Unrelated Counting Mat",
    lessonPlanIds: [LESSON_ID],
    fileName: "counting-mat.pdf",
    pageCount: 1,
  }],
};

(async () => {
  const brief = createApi.parseCreationBrief(fixture.EXPLICIT_CREATE_COMMAND).brief;
  assert.equal(brief.explicitPrintables.length, 1, "exactly one explicit printable in brief");

  const audit = auditApi.auditLesson(plan, curriculum, { explicitPrintables: brief.explicitPrintables });
  const createRows = audit.assetPlan.filter((row) => row.printable?.decision === "CREATE");
  assert.equal(createRows.length, 1, "exactly one CREATE printable in audit");

  const seedSpec = {
    lessonId: LESSON_ID,
    activityIds: [ACT_SEED],
    decision: "CREATE",
    title: createRows[0].printable.title,
    resourceType: "sequencing_cards",
    purpose: createRows[0].printable.purpose,
    ownerExplicitPrintable: true,
    pageCount: 1,
    filename: "seed-growth-sequencing-cards.pdf",
    pages: [{ index: 1, label: "Seed Growth Sequence", kind: "sequencing_cards" }],
  };

  const onePage = await printablesApi.generatePrintablePdfBuffer({
    spec: seedSpec,
    plan,
    activity: seedAct,
  });
  const oneOk = await printablesApi.validateGeneratedPdf(onePage.buffer, {
    expectedPageCount: onePage.pageCount,
    fileName: onePage.fileName,
  });
  assert.ok(oneOk.ok, `one-page PDF valid: ${JSON.stringify(oneOk.failed)}`);
  assert.equal(onePage.pageCount, 1);

  const cafeSpec = {
    lessonId: LESSON_ID,
    activityIds: [ACT_CAFE],
    decision: "CREATE",
    title: "Apple Café Dramatic Play Pack",
    resourceType: "dramatic_play_pack",
    purpose: "Café signage and menus for dramatic play.",
    pageCount: 2,
    filename: "apple-cafe-dramatic-play-pack.pdf",
    pages: [
      { index: 1, label: "Café Sign", kind: "dramatic_play_pack" },
      { index: 2, label: "Menu Cards", kind: "dramatic_play_pack" },
    ],
  };
  const multi = await printablesApi.generatePrintablePdfBuffer({
    spec: cafeSpec,
    plan,
    activity: cafeAct,
  });
  const multiOk = await printablesApi.validateGeneratedPdf(multi.buffer, {
    expectedPageCount: multi.pageCount,
    fileName: multi.fileName,
  });
  assert.ok(multiOk.ok, `multi-page PDF valid: ${JSON.stringify(multiOk.failed)}`);
  assert.ok(multi.pageCount >= 2, "multi-page printable generated");

  const missingExpected = await printablesApi.validateGeneratedPdf(onePage.buffer, {
    fileName: onePage.fileName,
  });
  assert.ok(!missingExpected.ok, "missing expected page count fails closed");
  assert.ok(
    missingExpected.failed.some((f) => f.code === "expected_page_count"),
    "missing expected uses expected_page_count code",
  );

  const mismatch = await printablesApi.validateGeneratedPdf(onePage.buffer, {
    expectedPageCount: 3,
    fileName: onePage.fileName,
  });
  assert.ok(!mismatch.ok, "page count mismatch rejected");
  assert.ok(mismatch.failed.some((f) => f.code === "page_count"), "mismatch reports page_count");

  const invalid = await printablesApi.validateGeneratedPdf(Buffer.from("%PDF-1.4 stub"), {
    expectedPageCount: 1,
    fileName: "seed-growth-sequence.pdf",
  });
  assert.ok(!invalid.ok, "invalid PDF rejected");

  const linked = printablesApi.linkPrintableIntoEnrichmentDraft(plan.enrichmentDraft, {
    lessonId: LESSON_ID,
    expectedLessonId: LESSON_ID,
    activityId: ACT_SEED,
    resourceId: "cur-res-seed-seq",
    title: seedSpec.title,
  });
  assert.ok(linked.ok, "printable linked into enrichment draft");
  assert.equal(linked.enrichmentDraft.activities[ACT_SEED].relatedPrintableId, "cur-res-seed-seq");
  assert.ok(
    linked.enrichmentDraft.week.printableIds.includes("cur-res-seed-seq"),
    "week.printableIds includes linked printable",
  );
  assert.ok(
    !linked.enrichmentDraft.week.printableIds.includes("cur-res-unrelated"),
    "unrelated printable unchanged in week ids",
  );

  console.log("Curriculum operator printable PDF validation checks passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

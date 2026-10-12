#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const guidedPrintable = require("./curriculum-operator-guided-printable-spec.js");
const planner = require("./curriculum-operator-printable-planner.js");
const printablesApi = require("./curriculum-operator-printables.js");
const ageSafety = require("./curriculum-operator-guided-age-safety.js");
const createApi = require("./curriculum-operator-create.js");
const auditApi = require("./curriculum-operator-audit.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

const plan = { id: "cur-lp-guided-print", title: "Halloween", age: "Preschool 3–5", theme: "Halloween" };
const activity = {
  id: "cur-act-pumpkin",
  title: "Pumpkin color sorting",
  objective: "Sort pumpkins by color.",
  materials: "Paint, paper, tweezers",
  steps: "Sort and compare colors.",
};

console.log("Complete printable specification");
const fullPlan = guidedPrintable.buildGuidedOwnerPrintableContentPlan({
  plan,
  activity,
  baseSpec: {
    title: "Pumpkin Color Cards",
    resourceType: "picture_cards",
    ownerExplicitPrintable: true,
    ownerInstructions: "letter-size pumpkin color cards and spider web counting cards",
  },
  guidedContext: { guidedWorkflow: true, theme: "Halloween", ownerInstructions: "letter-size pumpkin color cards and spider web counting cards" },
});
ok(fullPlan && fullPlan.pages.length >= 2, "enriched multi-page plan from owner instructions");
const mergedFull = planner.mergeContentIntoSpec({
  lessonId: plan.id,
  activityIds: [activity.id],
  decision: "CREATE",
  title: fullPlan.title,
  resourceType: "picture_cards",
  purpose: fullPlan.purpose,
  pageCount: 0,
  pages: [],
}, fullPlan);
const gateFull = planner.auditPrintableContentQuality(mergedFull, { activity, plan });
ok(gateFull.ok, "complete enriched spec passes quality gate");
const pathFull = printablesApi.classifyPrintableRenderPath(mergedFull, { operatorWrite: true });
ok(pathFull.ok, "complete enriched spec passes thin-page gate");

console.log("Thin but understandable request enriched from activity context");
const thinBase = {
  lessonId: plan.id,
  activityIds: [activity.id],
  decision: "CREATE",
  title: "Pumpkin color cards",
  resourceType: "picture_cards",
  ownerExplicitPrintable: true,
  guidedOwnerPrintable: true,
  pages: [{ index: 1, label: "Page 1", kind: "picture_cards" }, { index: 2, label: "Page 2", kind: "picture_cards" }, { index: 3, label: "Page 3", kind: "picture_cards" }],
  pageCount: 3,
  purpose: "Owner printable",
};
const enriched = guidedPrintable.tryApplyGuidedRenderEnrichment(thinBase, {
  plan,
  activity,
  guidedContext: guidedPrintable.ownerPrintableContext({
    guidedWorkflow: true,
    theme: "Halloween",
    ownerMaterials: {
      printables: [{ title: "Pumpkin color cards", ownerInstructions: "letter-size pumpkin color cards and spider web counting cards" }],
      ownerInstructions: ["Printable: letter-size pumpkin color cards and spider web counting cards"],
    },
  }),
});
ok(enriched.ok, "thin base enriched for guided workflow");
ok(printablesApi.classifyPrintableRenderPath(enriched.spec, { operatorWrite: true }).ok, "enriched spec not thin");

console.log("Thin ambiguous request requires owner clarification");
const vague = createApi.parseCreationBrief(
  "Make a preschool Halloween lesson. Use these activities: paint exploration. Make a printable.",
);
ok(
  vague.brief.guidedWorkflow === true && vague.needsOwnerInput.some((k) => /guided_printable|explicit_printable|title_or_theme/.test(k)),
  "ambiguous printable fails closed at parse",
);
ok(vague.code === "NEEDS_OWNER_INPUT" && vague.ok === false, "no create path when clarification required");
ok(vague.brief.requestedActivities.includes("paint exploration"), "supplied activity preserved on clarification brief");
ok(vague.brief.ownerMaterials.activities[0]?.title === "paint exploration", "owner activity row unchanged");

console.log("Three thin pages rejected after enrichment if still invalid");
const stillThin = {
  lessonId: plan.id,
  activityIds: [activity.id],
  decision: "CREATE",
  title: "Unknown",
  resourceType: "other",
  ownerExplicitPrintable: true,
  guidedOwnerPrintable: true,
  guidedOwnerContext: { guidedWorkflow: true, theme: "", ownerInstructions: "" },
  pages: [
    { index: 1, label: "A", kind: "other" },
    { index: 2, label: "B", kind: "other" },
    { index: 3, label: "C", kind: "other" },
  ],
  pageCount: 3,
  purpose: "x",
};
const reject = printablesApi.classifyPrintableRenderPath(stillThin, { operatorWrite: true });
ok(!reject.ok && /thin_pages:/.test(reject.reason) && reject.thinIndexes?.length === 3, "three thin pages rejected");

console.log("Unrelated generic fallback rejected");
const generic = planner.mergeContentIntoSpec(thinBase, {
  title: "HELP Zone Sign",
  pages: [{ type: "flashcards", heading: "HELP", items: [{ name: "HELP", visualConcept: "sign" }] }],
  purpose: "Zone sign",
});
ok(!planner.auditPrintableContentQuality(generic, { activity, plan }).ok, "generic giant-word pack rejected");

console.log("Valid page count and letter-size PDF path");
(async () => {
  const pdfSpec = {
    ...enriched.spec,
    filename: "pumpkin-color-cards-guided.pdf",
    lessonId: plan.id,
    activityIds: [activity.id],
  };
  const pdf = await printablesApi.generatePrintablePdfBuffer({
    spec: pdfSpec,
    plan,
    activity,
    forbidGenericFallback: true,
  });
  const pdfOk = await printablesApi.validateGeneratedPdf(pdf.buffer, {
    expectedPageCount: pdf.pageCount,
    fileName: pdf.fileName,
  });
  ok(pdfOk.ok, "valid PDF after enrichment");
  ok(pdf.pageCount >= 2, "explicit page count");

  console.log("Linkage + READY gates");
  const draft = { week: { printableIds: [] }, activities: {} };
  const linked = printablesApi.linkPrintableIntoEnrichmentDraft(draft, {
    lessonId: plan.id,
    expectedLessonId: plan.id,
    activityId: activity.id,
    resourceId: "cur-res-guided",
    title: enriched.spec.title,
  });
  ok(linked.ok, "printable linked to activity draft");
  ok(linked.enrichmentDraft.week.printableIds.includes("cur-res-guided"), "week.printableIds updated");

  ok(
    !ageSafety.readyForOwnerReviewGates({
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
      contentPersistenceIncomplete: false,
      printableOk: false,
      imagesOk: true,
    }),
    "failed printable prevents READY_FOR_OWNER_REVIEW",
  );

  const halloweenBrief = createApi.parseCreationBrief(
    "Make a preschool Halloween lesson. Use these four activities: pumpkin color sorting, leaf stamping. "
    + "Exact printable instructions: letter-size pumpkin color cards only. Make a printable with pumpkin color cards and spider web counting cards.",
  );
  ok(halloweenBrief.ok, "complete Halloween printable brief parse ok");
  const constrained = auditApi.constrainAssetPlanForExplicitOwnerPrintables(
    [
      { activityId: "cur-act-a", printable: { decision: "CREATE", ownerExplicitPrintable: true } },
      { activityId: "cur-act-b", printable: { decision: "CREATE", ownerExplicitPrintable: true } },
    ],
    halloweenBrief.brief.ownerMaterials.printables,
  );
  ok(
    constrained.filter((row) => row.printable?.decision === "CREATE" && row.printable?.ownerExplicitPrintable).length === 1,
    "exactly one CREATE printable from multi explicit owner request",
  );
  ok(halloweenBrief.brief.requestedFeatures.images !== false, "images scope unchanged on printable enrich brief");

  console.log(`\nGuided printable spec passed ${passed} assertions`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

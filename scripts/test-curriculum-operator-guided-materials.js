#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const commandApi = require("./curriculum-operator-command.js");
const guided = require("./curriculum-operator-guided-materials.js");
const knowledge = require("./curriculum-operator-childcare-knowledge.js");
const ageSafety = require("./curriculum-operator-guided-age-safety.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const printablesApi = require("./curriculum-operator-printables.js");
const jobStatus = require("./curriculum-operator-job-status-presenter.js");

const HALLOWEEN = "Make a preschool Halloween lesson. Use these four activities: pumpkin color sorting, leaf-and-pumpkin stamping, spider web fine-motor play, and a Halloween story walk. Materials: paint, paper, tweezers. Use the book Room on the Broom. I found some ideas online about process art. Make a realistic cover photo with preschool children doing Halloween activities. Exact printable instructions: letter-size pumpkin color cards only. Keep valid existing printables. Make a printable with pumpkin color cards and spider web counting cards.";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

console.log("Guided materials — conversational brief");
const briefResult = createApi.parseCreationBrief(HALLOWEEN);
ok(briefResult.ok, "Halloween brief parses");
ok(briefResult.brief.requestedActivities.length === 4, "four supplied activities preserved");
ok(
  briefResult.brief.ownerMaterials.books.some((b) => /room on the broom/i.test(b.title) && b.section === "book_resource"),
  "supplied books placed correctly",
);
ok(briefResult.brief.ownerMaterials.materials.length >= 1, "supplied materials parsed");
ok(briefResult.brief.ownerMaterials.researchNotes.length >= 1, "owner research note preserved");
ok(briefResult.brief.ownerMaterials.keep.some((k) => /existing/i.test(k.target)), "keep directive captured");
ok(briefResult.guidedUnderstanding?.text.includes("Here is what I understood"), "guided understanding summary");
ok(briefResult.brief.guidedValidation?.ok !== false, "preschool activity safety baseline");

console.log("Age-band knowledge layer");
ok(knowledge.mapSchemaAgeBand("infant").label.includes("0–12"), "infant band");
ok(knowledge.mapSchemaAgeBand("toddler").label.includes("toddler"), "toddler band");
ok(knowledge.mapSchemaAgeBand("preschool").label.includes("Preschool"), "preschool band");
ok(knowledge.architectGuidanceLines("preschool").some((l) => /attention/i.test(l)), "architect guidance lines");

console.log("Infant / toddler / preschool validation");
const infantBad = ageSafety.validateActivityIdea({
  ageBand: "infant",
  title: "Letter tracing worksheet with scissors",
});
ok(!infantBad.ok, "infant inappropriate flagged");
ok(infantBad.safetyWarnings.length >= 1, "infant safety warnings");

const toddlerChoke = ageSafety.validateActivityIdea({
  ageBand: "toddler",
  title: "Popcorn bead sorting",
});
ok(toddlerChoke.flags.includes("choking_risk"), "toddler choking risk");

const preschoolOk = ageSafety.validateActivityIdea({
  ageBand: "preschool",
  title: "Pumpkin color sorting with paper cards",
});
ok(preschoolOk.ok, "preschool activity passes");

console.log("Uncertainty instead of guessing");
const foodAct = ageSafety.validateActivityIdea({
  ageBand: "preschool",
  title: "Peanut butter taste test",
});
ok(foodAct.uncertainties.length >= 1, "food allergy uncertainty flagged");

console.log("Owner confirmation");
const parsed = commandApi.parseOperatorCommand(HALLOWEEN, { phase: 7, lessonPlans: [] });
ok(parsed.confirmReasons.includes(guided.GUIDED_CONFIRM_REASON), "confirmation required");
ok(parsed.command.actions.publish === false && parsed.command.actions.createLesson, "publish=false draft create path");
const confirmed = commandApi.parseOperatorCommand(HALLOWEEN, { phase: 7, lessonPlans: [], confirmGuidedMaterials: true });
ok(!confirmed.confirmReasons.includes(guided.GUIDED_CONFIRM_REASON), "confirm clears gate");

console.log("Reference + printable instructions");
const refBrief = createApi.parseCreationBrief(
  "Use this picture as a reference. Exact picture instructions: no logos or text overlays.",
  { attachments: [{ id: "a1", fileName: "ref.png", instructions: "Match colors only" }] },
);
ok(refBrief.brief.ownerMaterials.referenceImages.length === 1, "reference upload preserved");
ok(
  refBrief.brief.ownerMaterials.ownerInstructions.some((line) => /no logos/i.test(line)),
  "reference-image instructions preserved",
);
const printBrief = createApi.parseCreationBrief(
  "Make a printable like this example. Exact printable instructions: two letter-size pages with counting mats.",
);
ok(/counting|letter-size/i.test(printBrief.brief.ownerMaterials.printables[0]?.ownerInstructions || ""), "exact printable instructions");

console.log("Missing lesson fields + guided quality review");
const review = createApi.qualityReviewNewLesson({
  brief: { ...briefResult.brief, guidedWorkflow: true, activityTarget: 1 },
  lessonPlan: { id: "lp", objectives: "obj", weeklyOverview: "week" },
  activities: [{
    id: "cur-act-1",
    lessonPlanId: "lp",
    title: "Pumpkin color sorting",
    dayOfWeek: "monday",
    steps: "",
    objective: "",
  }],
});
ok(review.issues.some((i) => i.startsWith("missing_fields")), "missing fields detected for guided lesson");

console.log("Asset failure + owner review gates");
ok(printablesApi.isPrintableActionTerminalFailure("failed"), "failed printable is terminal");
ok(
  !ageSafety.readyForOwnerReviewGates({
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    contentPersistenceIncomplete: false,
    imagesOk: false,
  }),
  "failed image handling blocks READY",
);
ok(
  !ageSafety.readyForOwnerReviewGates({
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    contentPersistenceIncomplete: true,
    printableOk: true,
    imagesOk: true,
  }),
  "contentPersistenceIncomplete blocks READY",
);
ok(
  !ageSafety.readyForOwnerReviewGates({
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    contentPersistenceIncomplete: false,
    requiredPrintableFailed: true,
  }),
  "failed printable handling blocks READY",
);
ok(
  !ageSafety.readyForOwnerReviewGates({
    ownerReviewStatus: "PARTIAL",
    contentPersistenceIncomplete: false,
    printableOk: false,
  }),
  "READY only when gates pass",
);
ok(
  ageSafety.readyForOwnerReviewGates({
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    contentPersistenceIncomplete: false,
    printableOk: true,
    imagesOk: true,
    hardValidationOk: true,
  }),
  "READY when all required gates pass",
);
ok(
  orchestrator.classifyFullKitOwnerReview({
    kitScope: { songs: true, books: true },
    textOk: true,
    textRan: true,
    songsBooksOk: false,
    songsBooksRan: true,
    printablesOk: true,
    printablesRan: true,
    imagesOk: true,
    imagesRan: true,
    finalVerificationOk: true,
    partialErrors: ["books failed"],
  }) === "PARTIAL",
  "optional book failure stays PARTIAL",
);

console.log("Guided progress UI");
const fakeJob = {
  status: "running",
  lessonResults: [{
    creationBrief: { guidedWorkflow: true },
    actions: [{ type: "printable.generatePages", status: "running" }],
  }],
};
ok(/printable/i.test(jobStatus.currentStepLabel(fakeJob)), "progress step label");

console.log("Unrelated content unchanged");
ok(briefResult.brief.ownerMaterials.preserveExistingLessonContent === true, "unrelated assets preserved when no replace list");

console.log("Guided printable PDF validate + linkage");
(async () => {
  const plan = {
    id: "cur-lp-guided-pdf",
    title: "Halloween Guided",
    age: "Preschool 3–5",
    theme: "Halloween",
    resourceIds: ["cur-res-keep"],
    enrichmentDraft: { week: { printableIds: ["cur-res-keep"] }, activities: {} },
  };
  const act = {
    id: "cur-act-pumpkin",
    lessonPlanId: plan.id,
    title: "Pumpkin color sorting",
    objective: "Sort by color.",
    materials: "Paint, paper",
    steps: "Sort pumpkins.",
  };
  const spec = {
    lessonId: plan.id,
    activityIds: [act.id],
    decision: "CREATE",
    title: "Pumpkin Color Cards",
    resourceType: "sequencing_cards",
    purpose: briefResult.brief.ownerMaterials.printables[0]?.ownerInstructions || "Letter-size cards.",
    pageCount: 1,
    filename: "pumpkin-color-cards.pdf",
    pages: [{ index: 1, label: "Pumpkin Color Cards", kind: "sequencing_cards" }],
  };
  const generated = await printablesApi.generatePrintablePdfBuffer({ spec, plan, activity: act });
  const pdfOk = await printablesApi.validateGeneratedPdf(generated.buffer, {
    expectedPageCount: generated.pageCount,
    fileName: generated.fileName,
  });
  ok(pdfOk.ok, "valid PDF letter-size page count");
  ok(generated.pageCount === 1, "expected page count");
  const linked = printablesApi.linkPrintableIntoEnrichmentDraft(plan.enrichmentDraft, {
    lessonId: plan.id,
    expectedLessonId: plan.id,
    activityId: act.id,
    resourceId: "cur-res-guided-print",
    title: spec.title,
  });
  ok(linked.ok, "printable linkage into draft");
  ok(linked.enrichmentDraft.week.printableIds.includes("cur-res-keep"), "unrelated printable unchanged");

  console.log(`\nGuided materials passed ${passed} assertions`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

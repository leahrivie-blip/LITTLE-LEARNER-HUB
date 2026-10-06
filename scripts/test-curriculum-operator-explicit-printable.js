#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const auditApi = require("./curriculum-operator-audit.js");
const printablesApi = require("./curriculum-operator-printables.js");
const commandApi = require("./curriculum-operator-command.js");
const schema = require("./curriculum-operator-schema.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

const EXPLICIT = fixture.EXPLICIT_CREATE_COMMAND;
const REPLACE_ONLY = fixture.FOLLOW_UP_COMMANDS[1];

const brief = createApi.parseCreationBrief(EXPLICIT).brief;
assert.equal(brief.explicitPrintables.length, 1, "explicit printable extracted");
assert.match(brief.explicitPrintables[0].title, /Seed Growth Sequencing Cards/i);
assert.match(brief.explicitPrintables[0].activityHint, /seed growth/i);
assert.ok(brief.requestedActivities.some((a) => /seed growth/i.test(a)), "seed growth activity requested");

const incomplete = createApi.parseCreationBrief(
  "Create a spring lesson. For the seed growth activity, make a printable.",
);
assert.ok(incomplete.needsOwnerInput.includes("explicit_printable"), "incomplete printable fails closed");

const act = {
  id: "cur-act-seed",
  lessonPlanId: "cur-lp-test",
  title: "Seed Growth Activity",
  objective: "Children sequence seed to plant.",
  materials: "Seeds, cups, soil",
  steps: "Plant seeds and watch growth.",
};
const plan = { id: "cur-lp-test", title: "Spring Planting", age: "Preschool 3–5", resourceIds: [] };
const audit = auditApi.auditLesson(plan, { activities: [act], resources: [] }, {
  explicitPrintables: brief.explicitPrintables,
});
const printablePlan = audit.assetPlan[0].printable;
assert.equal(printablePlan.decision, "CREATE", "explicit printable forces CREATE");
assert.match(printablePlan.title, /Seed Growth Sequencing Cards/i);
assert.equal(printablePlan.ownerExplicitPrintable, true, "explicit flag preserved on asset plan");
const createPrintables = audit.assetPlan.filter((row) => row.printable?.decision === "CREATE");
assert.equal(createPrintables.length, 1, "only explicit owner printable is CREATE");

const action = {
  decision: "CREATE",
  activityId: act.id,
  spec: {
    lessonId: plan.id,
    activityIds: [act.id],
    decision: "CREATE",
    title: printablePlan.title,
    resourceType: "sequencing_cards",
    purpose: printablePlan.purpose,
    ownerExplicitPrintable: true,
    pages: [{ index: 1, label: "Seed Growth Sequence", kind: "sequencing_cards" }],
    pageCount: 1,
  },
};
assert.equal(printablesApi.printableImportance(action), "REQUIRED", "explicit printable is required budget priority");

const parsedCreate = commandApi.parseOperatorCommand(EXPLICIT, { phase: 7, lessonPlans: [] });
assert.equal(parsedCreate.command.intent, "create_lesson", "explicit create command → create_lesson");
assert.equal(parsedCreate.command.actions.createLesson, true, "createLesson action set");
assert.ok(
  !(parsedCreate.confirmReasons || []).includes("ambiguous_scope"),
  "explicit complete-lesson create is not ambiguous_scope",
);

const parsedReplace = commandApi.parseOperatorCommand(REPLACE_ONLY, {
  phase: 7,
  lessonPlans: [plan],
  currentlySelectedLessonId: plan.id,
});
assert.equal(parsedReplace.interpretation?.primary, "PRINTABLE_WORK", "printable-only follow-up scopes to printables");

// Seven activity lesson: shared “seed/growth” objectives must not mark every activity explicit.
const sevenActs = Array.from({ length: 7 }, (_, i) => ({
  id: `cur-act-seven-${i}`,
  itemId: `cur-act-seven-${i}`,
  lessonPlanId: "cur-lp-seven",
  title: ["Seed Growth Activity", "Planting Seeds", "Garden Math Sort", "Vocabulary Cards", "Halloween Graph", "Seed Sorting", "Spring Counting"][i],
  objective: "Children explore planting and seed growth stages.",
  materials: "seeds soil cups",
  steps: "Plant seeds and watch growth over time.",
  dayOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "monday", "tuesday"][i],
}));
const sevenPlan = {
  id: "cur-lp-seven",
  title: "Spring Planting QA",
  age: "Preschool 3–5",
  resourceIds: [],
  dailyPlans: {
    monday: { items: sevenActs.filter((a) => a.dayOfWeek === "monday").map((a) => ({ itemId: a.itemId, title: a.title })) },
    tuesday: { items: sevenActs.filter((a) => a.dayOfWeek === "tuesday").map((a) => ({ itemId: a.itemId, title: a.title })) },
    wednesday: { items: sevenActs.filter((a) => a.dayOfWeek === "wednesday").map((a) => ({ itemId: a.itemId, title: a.title })) },
    thursday: { items: sevenActs.filter((a) => a.dayOfWeek === "thursday").map((a) => ({ itemId: a.itemId, title: a.title })) },
    friday: { items: sevenActs.filter((a) => a.dayOfWeek === "friday").map((a) => ({ itemId: a.itemId, title: a.title })) },
  },
};
const sevenCurriculum = { activities: sevenActs, resources: [], lessonPlans: [sevenPlan] };
const sevenAudit = auditApi.auditLesson(sevenPlan, sevenCurriculum, { explicitPrintables: brief.explicitPrintables });
const sevenCreates = sevenAudit.assetPlan.filter((row) => row.printable?.decision === "CREATE");
assert.equal(sevenCreates.length, 1, "explicit scope → exactly one CREATE across seven activities");
assert.equal(
  sevenAudit.assetPlan.find((row) => row.printable?.ownerExplicitPrintable)?.activityTitle,
  "Seed Growth Activity",
  "explicit printable stays on seed growth activity",
);
const sevenActions = printablesApi.buildPrintableActionsFromAudit(
  sevenPlan,
  sevenActs,
  sevenAudit,
  sevenCurriculum,
);
const sevenWrites = sevenActions.filter((a) => a.decision === "CREATE" || a.decision === "REPLACE");
assert.equal(sevenWrites.length, 1, "printable planner sees one write action");
async function runAsyncExplicitPrintableChecks() {
const sevenPlanRun = await printablesApi.runPrintablePlanForLesson({
  plan: { ...sevenPlan, enrichmentDraft: { week: {}, activities: {} } },
  activities: sevenActs,
  audit: sevenAudit,
  curriculum: sevenCurriculum,
  limits: { maxPrintableGenerations: 30 },
  lessonCount: 1,
  createPrintableResource: async () => ({ ok: true, resourceId: "cur-res-explicit-only" }),
});
assert.ok(sevenPlanRun.code !== "SCOPE_REVIEW_REQUIRED", "seven-pack SCOPE_REVIEW blocked for narrowed explicit scope");
assert.equal(sevenPlanRun.printableBudgetDiagnostics?.plannedPackCountBeforeBudget, 1, "one pack planned before budget");

const ambiguousActs = [
  { id: "a1", itemId: "a1", lessonPlanId: "lp-amb", title: "Seed Growth Station", dayOfWeek: "monday" },
  { id: "a2", itemId: "a2", lessonPlanId: "lp-amb", title: "Seed Growth Lab", dayOfWeek: "tuesday" },
];
const ambPlan = {
  id: "lp-amb",
  title: "Ambiguous",
  age: "Preschool 3–5",
  resourceIds: [],
  dailyPlans: {
    monday: { items: [{ itemId: "a1", title: "Seed Growth Station" }] },
    tuesday: { items: [{ itemId: "a2", title: "Seed Growth Lab" }] },
    wednesday: { items: [] },
    thursday: { items: [] },
    friday: { items: [] },
  },
};
const ambAudit = auditApi.auditLesson(ambPlan, { activities: ambiguousActs, resources: [] }, {
  explicitPrintables: brief.explicitPrintables,
});
assert.ok(schema.asArray(ambAudit.explicitPrintableScope?.ambiguous).length >= 1, "tie on activity title fails closed");
const ambRun = await printablesApi.runPrintablePlanForLesson({
  plan: { ...ambPlan, enrichmentDraft: { week: {}, activities: {} } },
  activities: ambiguousActs,
  audit: ambAudit,
  curriculum: { activities: ambiguousActs, resources: [], lessonPlans: [ambPlan] },
  limits: { maxPrintableGenerations: 30 },
  lessonCount: 1,
});
assert.equal(ambRun.code, "NEEDS_OWNER_INPUT", "ambiguous explicit printable request fails closed");
}

runAsyncExplicitPrintableChecks()
  .then(() => {
    console.log("Curriculum operator explicit printable checks passed.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const auditApi = require("./curriculum-operator-audit.js");
const printablesApi = require("./curriculum-operator-printables.js");
const commandApi = require("./curriculum-operator-command.js");
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

console.log("Curriculum operator explicit printable checks passed.");

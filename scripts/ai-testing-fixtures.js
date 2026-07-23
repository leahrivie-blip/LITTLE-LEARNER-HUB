/**
 * Phase 23 — AI Evaluation Lab scenario library.
 *
 * A curated set of realistic, fake-only childcare scenarios for the admin to
 * run through both the existing heuristic parser and the OpenAI testing
 * pathway side by side. Every child/family name is an obvious fixture name.
 */

const model = require("./ai-testing-data-model.js");

const SCENARIOS = [
  {
    id: "scenario_scraped_knee",
    label: "Scraped knee on the playground",
    workflowType: model.WORKFLOW_TYPES.CLASSROOM_ASSISTANT,
    inputText: "Timmy Fixture fell on the playground and scraped his knee. We cleaned it with soap and water and put on a bandage. He was a little upset but calmed down after a few minutes and went back to playing.",
  },
  {
    id: "scenario_biting_incident",
    label: "Biting incident",
    workflowType: model.WORKFLOW_TYPES.CLASSROOM_ASSISTANT,
    inputText: "During free play, Ava Fixture bit Ben Fixture on the arm. We separated them right away, comforted Ben, and checked that the skin wasn't broken. Ava was redirected to a quiet activity.",
  },
  {
    id: "scenario_difficult_dropoff",
    label: "Difficult drop-off",
    workflowType: model.WORKFLOW_TYPES.PROFESSIONAL_DRAFT,
    inputText: "Elena Fixture cried for about ten minutes after drop-off this morning but calmed down once we started circle time and was fine the rest of the day.",
  },
  {
    id: "scenario_child_refusing_lunch",
    label: "Child refusing lunch",
    workflowType: model.WORKFLOW_TYPES.CLASSROOM_ASSISTANT,
    inputText: "Lunch today was pasta with vegetables and milk for everyone. Carlos Fixture refused to eat and only drank his milk.",
  },
  {
    id: "scenario_potty_accident",
    label: "Potty accident",
    workflowType: model.WORKFLOW_TYPES.CLASSROOM_ASSISTANT,
    inputText: "Dana Fixture had a potty accident around 2pm. We changed her clothes and she went back to playing right away.",
  },
  {
    id: "scenario_medication_missing_dosage",
    label: "Medication entry missing dosage",
    workflowType: model.WORKFLOW_TYPES.CLASSROOM_ASSISTANT,
    inputText: "Gave Timmy Fixture his allergy medicine this afternoon.",
  },
  {
    id: "scenario_group_meal_exception",
    label: "Group meal with one child exception",
    workflowType: model.WORKFLOW_TYPES.CLASSROOM_ASSISTANT,
    inputText: "Breakfast was at 8:30 — everyone had oatmeal, bananas, and milk. Ava Fixture only ate the banana and didn't want the oatmeal.",
  },
  {
    id: "scenario_loose_parts_activity",
    label: "Loose-parts activity",
    workflowType: model.WORKFLOW_TYPES.CLASSROOM_ASSISTANT,
    inputText: "This morning we set out pinecones, fabric scraps, wooden blocks, and small baskets for open-ended loose-parts play. The children spent almost 40 minutes sorting and building with them.",
  },
  {
    id: "scenario_child_led_outdoor_interest",
    label: "Child-led outdoor interest",
    workflowType: model.WORKFLOW_TYPES.LESSON_PLAN_ASSIST,
    inputText: "Several children have been very interested in bugs and worms during outdoor time this week. They keep finding them under rocks and asking questions about how they move.",
  },
  {
    id: "scenario_observation_next_step",
    label: "Observation and next-step suggestion",
    workflowType: model.WORKFLOW_TYPES.PROFESSIONAL_DRAFT,
    inputText: "Susan Fixture spent a long time today lining up small toys by size on her own, then asked to count them out loud.",
  },
  {
    id: "scenario_end_of_day_update",
    label: "End-of-day parent update",
    workflowType: model.WORKFLOW_TYPES.PROFESSIONAL_DRAFT,
    inputText: "Overall a good day — Ben Fixture ate well at lunch, napped for about an hour, and spent the afternoon building with blocks with a friend.",
  },
  {
    id: "scenario_sunscreen_permission_form",
    label: "Sunscreen permission form",
    workflowType: model.WORKFLOW_TYPES.FORM_BUILDER,
    inputText: "I need a simple form asking parents for permission to apply sunscreen to their child before outdoor play, with a spot for the brand/product name they'd like us to use.",
  },
  {
    id: "scenario_pasted_weekly_curriculum",
    label: "Pasted weekly curriculum",
    workflowType: model.WORKFLOW_TYPES.LESSON_PLAN_ASSIST,
    inputText: "Monday: Colors Everywhere - sorting activity with color cards, painting with primary colors. Tuesday: Nature Walk - collect leaves, sort by shape. Wednesday: Music and Movement - instruments, dancing. No materials list for Thursday or Friday yet.",
  },
];

function ensureScenarioLibrary(store) {
  SCENARIOS.forEach((scenario) => model.ensureScenario(store, scenario));
  return model.listScenarios(store);
}

module.exports = {
  SCENARIOS,
  ensureScenarioLibrary,
};

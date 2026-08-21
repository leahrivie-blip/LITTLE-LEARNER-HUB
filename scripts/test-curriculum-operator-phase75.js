#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 7.5 — AI lesson architect for new create.
 * Deterministic fixtures only; CI must not call live OpenAI.
 * Run: npm run test:curriculum-operator-phase75
 */
"use strict";

const assert = require("node:assert/strict");
const schema = require("./curriculum-operator-schema.js");
const createApi = require("./curriculum-operator-create.js");
const architect = require("./curriculum-operator-create-architect.js");
const commandApi = require("./curriculum-operator-command.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "leahivie@icloud.com" };
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function bakeryBrief() {
  return createApi.parseCreationBrief(
    "Create a Preschool Bakery lesson with 15 activities and leave it ready for review.",
  ).brief;
}

function makeMemoryCreateHelper(storeRef) {
  return async function createOperatorLessonPlan({ lessonPlan, adminEmail }) {
    const crypto = require("node:crypto");
    const id = `cur-lp-${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    const dailyPlans = lessonPlan.dailyPlans || {};
    const activities = [];
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      const items = Array.isArray(dailyPlans[day]?.items) ? dailyPlans[day].items : [];
      items.forEach((item) => {
        activities.push({
          id: `cur-act-${crypto.randomBytes(6).toString("hex")}`,
          lessonPlanId: id,
          itemId: item.itemId,
          title: item.title,
          dayOfWeek: day,
          activityCategory: item.activityCategory || "",
          objective: item.objective || "",
          steps: item.steps || "",
          materials: item.materials || "",
          status: "draft",
        });
      });
    });
    const plan = {
      ...lessonPlan,
      id,
      status: "draft",
      plan: lessonPlan.plan === "Pro" ? "Pro" : "Free",
      activityIds: activities.map((a) => a.id),
      createdAt: now,
      updatedAt: now,
      lastEditedBy: adminEmail || "test",
    };
    storeRef.curriculum.lessonPlans.push(plan);
    storeRef.curriculum.activities.push(...activities);
    return { ok: true, createdLessonId: id, lessonPlan: plan, activities, published: false };
  };
}

async function main() {
  console.log("Curriculum Operator Phase 7.5 — AI lesson architect");

  const brief = bakeryBrief();
  ok(brief.activityTarget === 15, "brief activity target 15");

  console.log("Production requires AI (no deterministic fallback)");
  const noAi = await architect.composeNewLessonContent(brief, { forceLive: true, callAi: undefined });
  ok(noAi.ok === false && noAi.code === "AI_CREATION_FAILED", "missing callAi → AI_CREATION_FAILED");
  ok(/requires callAi|fallback is disabled/i.test(noAi.error || ""), "error explains no deterministic fallback");

  const detBlocked = createApi.buildBaseLessonContent(brief, { allowDeterministicFixture: false });
  // Under NODE_ENV=test deterministic may still run; forceLive-style gate is on architect.
  ok(typeof createApi.buildDeterministicFixtureContent === "function", "deterministic builder retained for fixtures");

  console.log("AI failure / malformed → no create content");
  const failAi = await architect.composeNewLessonContent(brief, {
    forceLive: true,
    callAi: async () => { throw new Error("timeout"); },
  });
  ok(failAi.ok === false && failAi.code === "AI_CREATION_FAILED", "AI timeout → AI_CREATION_FAILED");

  const malformed = await architect.composeNewLessonContent(brief, {
    forceLive: true,
    callAi: async () => "not-json{{{",
  });
  ok(malformed.ok === false, "malformed JSON → blocked");
  ok(malformed.code === "AI_CREATION_FAILED" || malformed.code === "malformed_output"
    || (malformed.issues || []).includes("malformed_json")
    || /malformed/i.test(malformed.error || ""), "malformed path reported");

  console.log("Quality gate + staged repair bounds");
  const staged = require("./curriculum-operator-staged-composer.js");
  let calls = 0;
  const weakThenStrong = await architect.composeNewLessonContent(brief, {
    forceLive: true,
    callAi: async (_sys, user) => {
      calls += 1;
      if (/CREATE_WEEK_BLUEPRINT/.test(user) && calls === 1) {
        const full = JSON.parse(staged.buildStagedFixtureResponse(user));
        full.activityOutlines = full.activityOutlines.slice(0, 8);
        return JSON.stringify(full);
      }
      return staged.buildStagedFixtureResponse(user);
    },
  });
  ok(weakThenStrong.ok === true, "weak Stage 1 gets one architecture repair then passes");
  ok(calls >= 2, "Stage 1 repair path uses bounded extra call");
  ok((weakThenStrong.usage?.lessonArchitectureCalls || 0) <= 2, "max 2 architecture calls");

  let calls2 = 0;
  const weakTwice = await architect.composeNewLessonContent(brief, {
    forceLive: true,
    callAi: async (_sys, user) => {
      calls2 += 1;
      if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
        const full = JSON.parse(staged.buildStagedFixtureResponse(user));
        full.activityOutlines = full.activityOutlines.slice(0, 8);
        return JSON.stringify(full);
      }
      return staged.buildStagedFixtureResponse(user);
    },
  });
  ok(weakTwice.ok === false && weakTwice.code === "AI_CREATION_FAILED", "failed Stage 1 repair → no lesson content");
  ok(calls2 === 2, "stops after one Stage 1 repair");

  console.log("Strong fixture → trusted create");
  const composed = await architect.composeNewLessonContent(brief, { forceFixture: true });
  ok(composed.ok === true && composed.source === "fixture_ai", "fixture architect ok");
  ok(composed.activityCount === 15, "exact activity count");
  const titles = [];
  createApi.WEEKDAYS.forEach((d) => {
    (composed.content.dailyPlans[d].items || []).forEach((it) => titles.push(it.title));
  });
  ok(titles.length === 15, "15 titles present");
  ok(new Set(titles.map((t) => t.toLowerCase())).size === 15, "no duplicate titles");
  const sample = composed.content.dailyPlans.monday.items[0];
  ok(sample && sample.steps && sample.teacherLanguage && sample.materials, "sample activity has runnable fields");

  const storeRef = { curriculum: { lessonPlans: [], activities: [], resources: [] }, jobs: { jobs: [] } };
  const createHelper = makeMemoryCreateHelper(storeRef);
  const payload = createApi.buildLessonPlanPayload(brief, composed.content);
  const created = await createHelper({ lessonPlan: payload, adminEmail: OWNER.email });
  ok(created.ok && created.lessonPlan.status === "draft", "trusted create draft");
  ok(createApi.validateCreatedIds(created.lessonPlan, created.activities).ok, "stable IDs");
  const quality = createApi.qualityReviewNewLesson({
    brief,
    lessonPlan: created.lessonPlan,
    activities: created.activities,
  });
  ok(quality.ok, `post-create quality ok (${quality.issues.join(",") || "none"})`);

  console.log("Variety / age / filler rejection");
  const dups = architect.validateArchitectOutput(JSON.stringify({
    lesson: {
      title: "Apples", age: brief.ageLabel, theme: "Apples", plan: "Free",
      weeklyOverview: "A thoughtful apple week with Monday through Friday focuses for preschool play.",
      objectives: "During apple week, preschool children practice concrete play skills with prepared materials.",
      weeklyMaterials: "Apple props, trays, labels, and open-ended sensory materials for the classroom.",
      teacherPreparation: "Preview each weekday focus and gather apple props before children arrive.",
      prepChecklist: ["Gather props"], observationFocus: ["Language"], familyConnection: "Share one apple word from home with the class.",
      milestones: ["Shows interest"], dailyFocus: { monday: "Meet", tuesday: "Sort", wednesday: "Taste", thursday: "Play", friday: "Share" },
    },
    activities: [
      { title: "Apple Color Sort", dayOfWeek: "monday", activityCategory: "Math", objective: "Sort red and green apples by color using trays and short prompts for preschoolers in a small group.", description: "Children sort apple props into color bowls at the table with teacher coaching and clear start/stop cues.", materials: "Apple props, two labeled bowls, and a wipeable tray for each pair of children", preparation: "Stage bowls and props at child height before arrival and post a color focus card.", setup: "Two bowls on a tray with space for two children to stand side by side", steps: "Show colors, invite sorting, coach language, close with a share about the color chosen.", teacherLanguage: "Which bowl matches this apple color?\nWhat color did you choose next?", observationOpportunities: "Watch color language, grip strength, and whether children reset the trays between turns.", safetyNotes: "Use large props only and keep pathways clear around the table.", cleanupTips: "Return props to the bin and wipe trays before the next group arrives.", indoorAlternatives: "Run the same color sort invitation at a rug with floor trays.", outdoorAlternatives: "Move the same sort outdoors on a blanket with the same bowls.", teacherTips: ["Keep groups small"], substitutions: ["Use scarves"], adaptations: "Offer fewer colors for children who need a simpler start.", extensions: "Add a third color choice for children ready for more challenge.", vocabulary: "apple color sort red green bowl", observationPrompts: ["What color did they name?"] },
      { title: "Sort the Apples", dayOfWeek: "tuesday", activityCategory: "Math", objective: "Sort red and green apples by color using trays and short prompts for preschoolers in a small group.", description: "Children sort apple props into color bowls at the table with teacher coaching and clear start/stop cues.", materials: "Apple props, two labeled bowls, and a wipeable tray for each pair of children", preparation: "Stage bowls and props at child height before arrival and post a color focus card.", setup: "Two bowls on a tray with space for two children to stand side by side", steps: "Show colors, invite sorting, coach language, close with a share about the color chosen.", teacherLanguage: "Which bowl matches this apple color?\nWhat color did you choose next?", observationOpportunities: "Watch color language, grip strength, and whether children reset the trays between turns.", safetyNotes: "Use large props only and keep pathways clear around the table.", cleanupTips: "Return props to the bin and wipe trays before the next group arrives.", indoorAlternatives: "Run the same color sort invitation at a rug with floor trays.", outdoorAlternatives: "Move the same sort outdoors on a blanket with the same bowls.", teacherTips: ["Keep groups small"], substitutions: ["Use scarves"], adaptations: "Offer fewer colors for children who need a simpler start.", extensions: "Add a third color choice for children ready for more challenge.", vocabulary: "apple color sort red green bowl", observationPrompts: ["What color did they name?"] },
      { title: "Apple Taste Talk", dayOfWeek: "wednesday", activityCategory: "Sensory", objective: "Children taste two apple types and use sensory words with teacher modeling during a short tasting circle.", description: "Children sample prepared apple pieces and describe texture and flavor with picture word cards.", materials: "Prepared apple pieces, napkins, allergy list, and sensory word cards", preparation: "Check allergies, pre-cut pieces, and set tasting cups on a tray before circle.", setup: "Circle seats with tasting cups and a discard bowl in the center", steps: "Review allergy rules, taste one piece, name a sensory word, taste the second, compare with a friend.", teacherLanguage: "What word fits this apple taste?\nWas it crisp, soft, sweet, or tart today?", observationOpportunities: "Listen for new sensory vocabulary and willingness to try a second sample.", safetyNotes: "Follow allergy list strictly; use gloves for serving.", cleanupTips: "Discard scraps, wipe cups, and sanitize the tasting tray.", indoorAlternatives: "Same tasting at a small table for two children.", outdoorAlternatives: "Picnic blanket tasting with the same allergy protocol.", teacherTips: ["Keep servings tiny"], substitutions: ["Use cooked apple if raw is refused"], adaptations: "Offer look-and-smell only for hesitant children.", extensions: "Graph favorite tastes with clothespins.", vocabulary: "apple taste crisp sweet tart soft", observationPrompts: ["Which sensory word did they use?"] },
      { title: "Apple Tree Stretch", dayOfWeek: "thursday", activityCategory: "Gross Motor", objective: "Children move like apple trees and pickers through a short movement sequence with start and stop signals.", description: "Children stretch tall, sway, and pretend to pick apples across floor spots in a guided movement path.", materials: "Floor spots, start/stop signal, and optional soft apple props", preparation: "Place floor spots in a clear path and practice the three movement cues before the group arrives.", setup: "Open floor path with spots and a visible stop signal card", steps: "Warm up, demonstrate sway/pick/carry, travel the path, freeze on stop, cool down with breaths.", teacherLanguage: "Can your tree sway slowly in the breeze?\nWhere will you carry the apple next?", observationOpportunities: "Watch balance, body control, and whether children freeze on the stop signal.", safetyNotes: "Clear toys from the path; no running.", cleanupTips: "Collect spots and return props to the bin.", indoorAlternatives: "Shorter path in a classroom corner.", outdoorAlternatives: "Same sequence on grass with cones.", teacherTips: ["Model slow movement"], substitutions: ["Use scarves as apples"], adaptations: "Seated sway option for children who need it.", extensions: "Add a balance beam tape line.", vocabulary: "apple tree stretch sway pick carry", observationPrompts: ["Did they freeze on stop?"] },
    ],
  }), { ...brief, activityTarget: 4, title: "Apples", theme: "Apples" });
  ok(dups.ok === false, "near-duplicate apple sorts rejected");
  ok(
    (dups.issues || []).some((i) => /near_duplicate_concept|duplicate_activity_body|similar_titles/i.test(i)),
    `duplicate/concept issue coded (${(dups.issues || []).filter((i) => /duplicate|similar|near_/i.test(i)).join(";") || "none"})`,
  );

  const infantBad = architect.validateArchitectOutput(JSON.stringify({
    lesson: {
      title: "Glow", age: "Infant 0–12 Months", theme: "Glow", plan: "Free",
      weeklyOverview: "Gentle glow week with caregiver bonding and sensory light play for infants.",
      objectives: "During glow week, infants practice calm sensory tracking with caregiver support and large safe materials.",
      weeklyMaterials: "Soft scarves, large glow props, caregiver blankets, and choke-safe sound makers.",
      teacherPreparation: "Preview each day focus and stage large safe glow materials before infants arrive.",
      prepChecklist: ["Gather soft glow props"], observationFocus: ["Tracking"], familyConnection: "Invite families to share one calm light routine from home.",
      milestones: ["Tracks light"], dailyFocus: { monday: "Meet", tuesday: "Sense", wednesday: "Move", thursday: "Sound", friday: "Bond" },
    },
    activities: Array.from({ length: 10 }, (_, i) => ({
      title: `Glow play ${i}`,
      dayOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"][i % 5],
      activityCategory: "Sensory",
      objective: "Caregivers support calm glow sensory exploration with large safe materials and co-regulation.",
      description: "Infants explore soft glow materials with caregivers on a blanket during the day focus.",
      materials: "Soft scarves and large glow toys",
      preparation: "Stage blanket and large materials before tummy time.",
      setup: "Blanket on the floor with caregiver seating",
      steps: i === 0
        ? "Offer a worksheet and tiny beads for infants to cut out shapes."
        : "Invite tummy time with soft glow scarves and narrate tracking.",
      teacherLanguage: "I see you watching the soft glow scarf move slowly.",
      observationOpportunities: "Watch tracking and co-regulation cues.",
      safetyNotes: "Stay within arm's reach; choke-safe only.",
      cleanupTips: "Return soft props to the bin.",
      indoorAlternatives: "Same blanket play indoors.",
      outdoorAlternatives: "Shaded outdoor blanket with caregiver.",
      teacherTips: ["Stay close"],
      substitutions: ["Use a soft toy"],
      adaptations: "Shorten time.",
      extensions: "Add a soft sound.",
      vocabulary: "glow soft look try calm",
      observationPrompts: ["Did the infant track?"],
    })),
  }), { ...brief, ageBand: "infant", ageLabel: "Infant 0–12 Months", activityTarget: 10, title: "Glow", theme: "Glow" });
  ok(infantBad.ok === false && (infantBad.issues || []).includes("infant_inappropriate"), "infant worksheet/tiny rejected");

  console.log("Publish / batch / resume guards");
  const cmd = commandApi.parseOperatorCommand(
    "Create a Preschool Bakery lesson with 15 activities and leave it ready for review.",
    { phase: 7 },
  );
  ok(cmd.command.actions.createLesson === true && cmd.command.actions.publish === false, "create on, publish off");
  ok(cmd.command.actions.upgradeLesson === false, "no automatic Phase 2.5 rewrite on create");
  const multi = commandApi.parseOperatorCommand("Create 5 new lessons about farms.", { phase: 7 });
  ok(multi.confirmReasons.includes("scope_review_required"), "batch create still blocked");

  const before = storeRef.curriculum.lessonPlans.length;
  ok(before === 1, "one lesson created in fixture store");
  // Resume token would reuse createdLessonId — no second create when lessonCreated true
  ok(created.createdLessonId.startsWith("cur-lp-"), "createdLessonId stable for resume");

  console.log("API wantsCreate + plan summary");
  const api = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => ({
      siteContent: { featureFlags: { teachingKitCurriculumOperator: true }, curriculum: storeRef.curriculum },
      curriculumOperatorJobs: storeRef.jobs,
    }),
    writeStoreAsync: async () => {},
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    createOperatorLessonPlan: createHelper,
    callOperatorAi: async (_s, u) => {
      const stagedComposer = require("./curriculum-operator-staged-composer.js");
      if (/CREATE_WEEK_BLUEPRINT|EXPAND_ACTIVITY_BATCH|REPAIR_TARGETED/i.test(String(u || ""))) {
        return stagedComposer.buildStagedFixtureResponse(u);
      }
      return architect.buildOperatorCreateArchitectFixtureResponse(u);
    },
  });
  ok(api.wantsCreate(cmd.command) === true, "wantsCreate");
  const summary = api.buildPlanSummary(cmd.command, {
    selected: [{ id: "pending-create", title: brief.title, ageBand: brief.ageBand, plan: brief.accessPlan, readinessPercent: 0, completionPercent: 0, creationBrief: brief }],
    selectionNote: "create",
    candidatesConsidered: 0,
    creationBrief: brief,
  });
  ok(summary.createsLesson === true && summary.publishes === false, "plan create without publish");

  console.log("Research flag");
  const researchBrief = createApi.parseCreationBrief(
    "Create a Preschool Bakery lesson and research activities for inspiration.",
  ).brief;
  ok(researchBrief.researchRequested === true, "researchRequested parsed");
  const researchCompose = await architect.composeNewLessonContent(researchBrief, { forceFixture: true });
  ok(researchCompose.researchStatus === "RESEARCH_NOT_AVAILABLE", "research not faked");

  console.log(`\nPhase 7.5 checks passed: ${passed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

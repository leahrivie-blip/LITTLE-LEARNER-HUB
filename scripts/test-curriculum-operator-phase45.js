#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 4.5 — printable CONTENT intelligence.
 * Deterministic AI fixtures; CI must not call live OpenAI/image APIs.
 * Run: npm run test:curriculum-operator-phase45
 */
"use strict";

const assert = require("node:assert/strict");
const schema = require("./curriculum-operator-schema.js");
const planner = require("./curriculum-operator-printable-planner.js");
const printablesApi = require("./curriculum-operator-printables.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function mockCallAi(_system, user) {
  return Promise.resolve(planner.buildOperatorPrintableAiFixtureResponse(user));
}

async function main() {
  console.log("Curriculum Operator Phase 4.5 — printable content intelligence");

  const cafePlan = {
    id: "cur-lp-p45-apples",
    title: "Apples in the Kitchen",
    age: "Toddler 18–24 Months",
    theme: "Apples",
  };
  const cafeActivity = {
    id: "cur-act-p45-cafe",
    title: "Apple Café Dramatic Play",
    category: "Dramatic Play",
    objective: "Children take orders and serve pretend apple snacks.",
    materials: "Menus, tickets, pretend food",
    steps: "Welcome customers. Take orders. Serve snacks.",
  };
  const weatherActivity = {
    id: "cur-act-p45-weather",
    title: "Weather Clothing Match",
    objective: "Match weather to clothing.",
    steps: "Match each weather card to clothing.",
  };
  const sortActivity = {
    id: "cur-act-p45-sort",
    title: "Apple Color Sort",
    objective: "Sort apples by color.",
    steps: "Place apple pieces on color mats.",
  };
  const missionActivity = {
    id: "cur-act-p45-mission",
    title: "Superhero Training Camp Missions",
    objective: "Complete movement missions.",
    steps: "Draw a mission card and do the action.",
  };
  const handActivity = {
    id: "cur-act-p45-hand",
    title: "Apple Handprint Art",
    objective: "Make a handprint keepsake.",
    steps: "Press handprint into the art area.",
  };

  console.log("Quality gate rejects filler");
  const sparse = planner.auditPrintableContentQuality({
    title: "HELP",
    purpose: "sign",
    teacherUse: "",
    resourceType: "other",
    pages: [{ type: "other", heading: "HELP", items: [{ name: "HELP" }] }],
  }, { activity: cafeActivity, plan: cafePlan });
  ok(!sparse.ok && sparse.errors.some((e) => /sparse|giant|teacher/i.test(e)), "sparse giant-word filler rejected");

  const signFallback = planner.auditPrintableContentQuality({
    title: "Kitchen Zone Signs",
    purpose: "Hang signs around the room.",
    teacherUse: "Print and hang zone signs.",
    resourceType: "other",
    pages: [{ type: "other", heading: "Classroom Zone Sign", items: [{ name: "WASH" }] }],
  }, { activity: cafeActivity, plan: cafePlan });
  ok(!signFallback.ok && signFallback.errors.some((e) => /generic_sign|sparse|pack_too_sparse/i.test(e)),
    "generic sign fallback rejected");

  const mismatch = planner.auditPrintableContentQuality({
    title: "Ocean Animal Posters",
    purpose: "Decorate the room with ocean animals unrelated to café play.",
    teacherUse: "Hang posters on the wall.",
    resourceType: "picture_cards",
    ageBand: cafePlan.age,
    pages: [{
      type: "picture_cards",
      heading: "Ocean Animals",
      items: [
        { name: "Whale", visualConcept: "whale" },
        { name: "Shark", visualConcept: "shark" },
        { name: "Dolphin", visualConcept: "dolphin" },
        { name: "Crab", visualConcept: "crab" },
      ],
    }],
  }, { activity: cafeActivity, plan: cafePlan });
  ok(!mismatch.ok && mismatch.errors.includes("activity_mismatch"), "activity mismatch rejected");

  const incompleteMatch = planner.auditPrintableContentQuality({
    title: "Weather Clothing Match Cards",
    purpose: "Children match weather to clothing during small group.",
    teacherUse: "Print and cut pairs for the matching activity.",
    resourceType: "matching_cards",
    pages: [{
      type: "matching_pairs",
      heading: "Pairs",
      pairs: [
        { left: { name: "Sunny", visualConcept: "sun" }, right: { name: "Hat", visualConcept: "hat" } },
      ],
    }],
  }, { activity: weatherActivity, plan: { ...cafePlan, title: "Weather Watchers" } });
  ok(!incompleteMatch.ok && incompleteMatch.errors.some((e) => /matching_incomplete/i.test(e)),
    "incomplete matching pack rejected");

  const infantSheet = planner.auditPrintableContentQuality({
    title: "Tracing Worksheet",
    purpose: "Babies trace letters on a worksheet during tummy time.",
    teacherUse: "Print worksheet and have infant trace.",
    resourceType: "worksheet",
    ageBand: "Infant 0–12 Months",
    pages: [{
      type: "other",
      heading: "Letter tracing worksheet",
      items: [
        { name: "Trace A", visualConcept: "letter a" },
        { name: "Trace B", visualConcept: "letter b" },
        { name: "Trace C", visualConcept: "letter c" },
        { name: "Trace D", visualConcept: "letter d" },
      ],
    }],
  }, { activity: { id: "inf", title: "Tummy Time Visuals" }, plan: { age: "Infant 0–12 Months" } });
  ok(!infantSheet.ok && infantSheet.errors.some((e) => /infant_inappropriate/i.test(e)),
    "age-inappropriate printable rejected");

  console.log("Fixture planner content intelligence");
  const cafeBase = {
    lessonId: cafePlan.id,
    activityIds: [cafeActivity.id],
    decision: "CREATE",
    title: "Apple Café Dramatic Play Pack",
    resourceType: "dramatic_play_pack",
    ageBand: cafePlan.age,
    purpose: "Children use café props during dramatic play.",
    teacherUse: "Print and place at the café table.",
    pageCount: 1,
    pages: [{ index: 1, label: "pack", kind: "dramatic_play_pack" }],
    filename: "apples-cafe.pdf",
  };
  const cafePlanned = await planner.planPrintableContent({
    plan: cafePlan,
    activity: cafeActivity,
    baseSpec: cafeBase,
    callAi: mockCallAi,
  });
  ok(cafePlanned.ok, "cafe planner succeeds");
  const cafePages = cafePlanned.spec.pages;
  ok(cafePages.some((p) => p.type === "menu" && p.items.length >= 3), "dramatic-play pack contains usable menu props");
  ok(cafePages.some((p) => p.type === "order_cards" && p.items.length >= 3), "dramatic-play pack contains order tickets");
  ok(cafePages.some((p) => p.type === "pretend_food_cards" && p.items.length >= 3), "dramatic-play pack contains pretend food cards");
  ok(cafePlanned.review?.decision === "PASS", "second-pass reviewer PASS for cafe");
  ok((cafePlanned.spec.visualPlan?.generatedAssetPages || 0) === 0, "no visual generation for text/simple-vector cafe pack");
  ok(cafePages.every((p) => p.visualMode !== "generated_asset"), "generated visual only requested where necessary (none here)");

  const weatherPlanned = await planner.planPrintableContent({
    plan: { id: "cur-lp-weather", title: "Weather Watchers", age: "Preschool 3–5" },
    activity: weatherActivity,
    baseSpec: {
      ...cafeBase,
      lessonId: "cur-lp-weather",
      activityIds: [weatherActivity.id],
      title: "Weather Clothing Match",
      resourceType: "matching_cards",
      purpose: "Children match weather to clothing.",
      teacherUse: "Print and cut matching pairs for the activity.",
    },
    callAi: mockCallAi,
  });
  ok(weatherPlanned.ok, "weather planner succeeds");
  const weatherPairs = weatherPlanned.spec.pages.find((p) => p.type === "matching_pairs")?.pairs || [];
  ok(weatherPairs.length >= 3, "matching pack contains actual validated pairs");
  ok(weatherPairs.every((p) => p.left?.name && p.right?.name), "matching pairs have both sides");
  ok(weatherPairs.some((p) => /sunny|rain/i.test(p.left.name) && /hat|coat|boot|rain/i.test(p.right.name)),
    "weather/clothing pairs are educationally coherent");

  const sortPlanned = await planner.planPrintableContent({
    plan: cafePlan,
    activity: sortActivity,
    baseSpec: {
      ...cafeBase,
      activityIds: [sortActivity.id],
      title: "Apple Color Sort",
      resourceType: "sorting_cards",
      purpose: "Children sort apple pieces by color.",
      teacherUse: "Print mats and pieces; cut pieces for sorting.",
    },
    callAi: mockCallAi,
  });
  const sortPage = sortPlanned.spec.pages.find((p) => p.type === "sorting");
  ok(sortPlanned.ok && sortPage?.categories?.length >= 2 && sortPage?.items?.length >= 4,
    "sorting pack has categories + pieces");

  const missionPlanned = await planner.planPrintableContent({
    plan: { id: "cur-lp-hero", title: "Superhero Training Camp", age: "Toddler 18–24 Months" },
    activity: missionActivity,
    baseSpec: {
      ...cafeBase,
      lessonId: "cur-lp-hero",
      activityIds: [missionActivity.id],
      title: "Mission Cards",
      resourceType: "movement_cards",
      purpose: "Children complete distinct mission actions.",
      teacherUse: "Print and cut mission cards for training camp.",
    },
    callAi: mockCallAi,
  });
  const missions = missionPlanned.spec.pages.find((p) => p.type === "movement_cards")?.items || [];
  ok(missionPlanned.ok && missions.length >= 4, "movement pack contains multiple actions");
  ok(new Set(missions.map((m) => m.name.toLowerCase())).size >= 4, "movement actions are distinct");

  const handPlanned = await planner.planPrintableContent({
    plan: cafePlan,
    activity: handActivity,
    baseSpec: {
      ...cafeBase,
      activityIds: [handActivity.id],
      title: "Handprint Art",
      resourceType: "handprint_template",
      purpose: "Intentional handprint artwork area for the activity.",
      teacherUse: "Print one page per child for the handprint activity.",
    },
    callAi: mockCallAi,
  });
  const handPage = handPlanned.spec.pages[0];
  ok(handPlanned.ok && (handPage.intentionalBlank || handPage.workAreaLabel),
    "handprint/footprint template has intentional work area");

  console.log("Injection / validation safety");
  const injected = planner.validatePlannerOutput(JSON.stringify({
    title: "Hack Pack",
    purpose: "Children use cards during the activity with teacher guidance.",
    teacherUse: "Print and cut cards for the activity.",
    pages: [{
      type: "picture_cards",
      heading: "Cards",
      items: [
        { name: "<script>alert(1)</script>", visualConcept: "x" },
        { name: "Two", visualConcept: "y" },
        { name: "Three", visualConcept: "z" },
        { name: "Four", visualConcept: "w" },
      ],
    }],
  }), { plan: cafePlan, activity: cafeActivity, baseSpec: cafeBase });
  ok(!injected.ok, "HTML/script injection rejected");

  console.log("Renderer consumes enriched spec");
  const rendered = await printablesApi.generatePrintablePdfBuffer({
    spec: {
      ...cafePlanned.spec,
      filename: "apples-in-the-kitchen-apple-cafe-dramatic-play-pack.pdf",
    },
    plan: cafePlan,
    activity: cafeActivity,
  });
  ok(rendered.buffer.length > 800, "PDF renderer consumes validated richer spec");
  ok(rendered.pageCount === cafePlanned.spec.pages.length, "enriched page count rendered");
  const validated = await printablesApi.validateGeneratedPdf(rendered.buffer, {
    expectedPageCount: rendered.pageCount,
    fileName: rendered.fileName,
  });
  ok(validated.ok, "enriched PDF passes Phase 4 validation");

  console.log("KEEP preserved / Phase 4 pipeline");
  const keepOnly = await printablesApi.runPrintablePlanForLesson({
    plan: cafePlan,
    activities: [cafeActivity],
    audit: {
      assetPlan: [{
        activityId: cafeActivity.id,
        activityTitle: cafeActivity.title,
        printable: {
          decision: "KEEP_EXISTING",
          reason: "Useful pack already linked.",
          purpose: "Existing.",
          type: "dramatic_play_pack",
          title: "Apple Café Dramatic Play Pack",
          contents: [],
          existingResourceIds: ["cur-res-good"],
        },
      }],
    },
    curriculum: { resources: [], activities: [cafeActivity] },
    limits: { maxPrintableGenerations: 5 },
    callAi: mockCallAi,
    createPrintableResource: async () => { throw new Error("KEEP must not create"); },
  });
  ok(keepOnly.actions.every((a) => a.decision === "KEEP" && a.status === "skipped"), "KEEP still preserved");

  let created = 0;
  const createRun = await printablesApi.runPrintablePlanForLesson({
    plan: cafePlan,
    activities: [cafeActivity],
    audit: {
      assetPlan: [{
        activityId: cafeActivity.id,
        activityTitle: cafeActivity.title,
        printable: {
          decision: "CREATE",
          reason: "Dramatic play needs props.",
          purpose: "Children use menu and tickets during café play.",
          type: "dramatic_play_pack",
          title: "Apple Café Dramatic Play Pack",
          contents: ["menu", "tickets", "food cards"],
          existingResourceIds: [],
        },
      }],
    },
    curriculum: { resources: [], activities: [cafeActivity] },
    limits: { maxPrintableGenerations: 5 },
    callAi: mockCallAi,
    createPrintableResource: async ({ title, pageCount, description }) => {
      created += 1;
      ok(/cafe|café|dramatic/i.test(title), "created resource uses activity-specific title");
      ok(pageCount >= 2, "created pack has multiple content pages");
      ok(/contentSource=ai_planner/i.test(description || ""), "content source recorded");
      return { ok: true, resourceId: "cur-res-p45-1" };
    },
    readResourceFile: async () => ({ ok: true, pageCount: 3, previewVerified: true, downloadVerified: true }),
    saveDraft: async ({ enrichmentDraft }) => ({ ok: true, enrichmentDraft }),
  });
  ok(createRun.ok && created === 1, "CREATE runs planner → render → upload once");
  ok(createRun.actions[0]?.plannerMeta?.gate?.ok === true, "quality gate passed on CREATE");
  ok((createRun.actions[0]?.spec?.pages || []).some((p) => schema.asArray(p.items).length >= 3
    || schema.asArray(p.pairs).length >= 3), "uploaded spec retained enriched content");

  // Old generic vs new activity-specific comparison snapshot for the report
  const oldGeneric = {
    title: "Kitchen Zone Signs",
    pages: [{ heading: "HELP", items: [{ name: "HELP" }] }],
  };
  const neu = cafePlanned.spec;
  ok(oldGeneric.title !== neu.title && neu.pages.length >= 3, "example: old generic sign ≠ new activity-specific pack");

  console.log("Phase 4 safety still intact");
  ok(schema.normalizeOperatorCommand({ actions: { publish: true, createLesson: true, generatePrintables: true } }, { phase: 4.5 })
    .actions.publish === false, "publish still blocked at 4.5");
  ok(schema.normalizeOperatorCommand({ actions: { createLesson: true, generatePrintables: true } }, { phase: 4.5 })
    .actions.createLesson === false, "lesson.create still blocked at 4.5");
  ok(schema.normalizeOperatorCommand({ actions: { generatePrintables: true, generateImages: true } }, { phase: 4.5 })
    .actions.generateImages === false, "images still blocked during printable phase");

  console.log(`\nPhase 4.5 passed ${passed} assertions`);
}

main().catch((error) => {
  console.error("\nPhase 4.5 FAILED:", error);
  process.exit(1);
});

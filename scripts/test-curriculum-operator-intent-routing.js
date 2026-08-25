#!/usr/bin/env node
/**
 * Natural-language Owner intent routing for existing-lesson Operator commands.
 * Run: npm run test:curriculum-operator-intent-routing
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const createApi = require("./curriculum-operator-create.js");
const intentRouter = require("./curriculum-operator-intent-router.js");
const ageBandApi = require("./curriculum-operator-printable-age-band.js");
const selectApi = require("./curriculum-operator-select.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const BUGS_ID = "cur-lp-bugs-butterflies";
const WEATHER_ID = "cur-lp-weather-watchers";

const seedCurriculum = () => ({
  lessonPlans: [
    {
      id: LMW_ID,
      title: "Little Makers Workshop",
      age: "Toddler 12–24 Months",
      plan: "Free",
      status: "draft",
      updatedAt: new Date().toISOString(),
    },
    {
      id: BUGS_ID,
      title: "Bugs & Butterflies",
      age: "Preschool 3–5",
      plan: "Pro",
      status: "draft",
      updatedAt: new Date().toISOString(),
    },
    {
      id: WEATHER_ID,
      title: "Weather Watchers",
      age: "Toddler 18–24 Months",
      plan: "Pro",
      status: "published",
      updatedAt: new Date().toISOString(),
    },
  ],
  activities: [],
  resources: [],
});

const lessonPlans = seedCurriculum().lessonPlans;
const lmwLesson = lessonPlans.find((p) => p.id === LMW_ID);

function parse(raw, options = {}) {
  return commandApi.parseOperatorCommand(raw, {
    phase: options.phase || 7,
    lessonPlans,
    currentlySelectedLessonId: options.currentlySelectedLessonId || null,
  });
}

function expectExistingLesson(cmd, label, expectations = {}) {
  ok(cmd.command.actions.createLesson !== true, `${label}: not createLesson`);
  ok(createApi.isCreateLessonCommand(cmd.command.rawCommand) !== true, `${label}: not create-lesson regex`);
  if (expectations.route) {
    ok(cmd.ownerIntent.route === expectations.route, `${label}: route ${expectations.route}`);
  }
  if (expectations.generatePrintables != null) {
    ok(cmd.command.actions.generatePrintables === expectations.generatePrintables,
      `${label}: generatePrintables=${expectations.generatePrintables}`);
  }
  if (expectations.generateImages != null) {
    ok(cmd.command.actions.generateImages === expectations.generateImages,
      `${label}: generateImages=${expectations.generateImages}`);
  }
  if (expectations.touchCover != null) {
    ok(cmd.command.actions.touchCover === expectations.touchCover,
      `${label}: touchCover=${expectations.touchCover}`);
  }
  if (expectations.generateSongsBooks != null) {
    ok(cmd.command.actions.generateSongsBooks === expectations.generateSongsBooks,
      `${label}: generateSongsBooks=${expectations.generateSongsBooks}`);
  }
  if (expectations.connectedUpgrade != null) {
    ok(cmd.command.actions.connectedUpgrade === expectations.connectedUpgrade,
      `${label}: connectedUpgrade=${expectations.connectedUpgrade}`);
  }
  const selection = selectApi.selectLessons(seedCurriculum(), cmd.command);
  ok(selection.selected.length >= 1, `${label}: lesson resolves from catalog`);
  const hit = selection.selected.find((s) => s.title === "Little Makers Workshop") || selection.selected[0];
  ok(hit.id === LMW_ID || expectations.allowAnyResolved, `${label}: resolves expected lesson`);
  ok(hit.plan === "Free" || expectations.allowAnyResolved, `${label}: inherits Free/Pro from lesson`);
  const ageResolved = ageBandApi.resolvePrintableAgeBand({
    id: hit.id,
    title: hit.title,
    age: hit.age,
    ageBand: hit.ageBand,
  });
  ok(ageResolved.ok, `${label}: parent lesson age resolves (no age_band owner input)`);
  if (expectations.ageBand) {
    ok(ageResolved.ageBand === expectations.ageBand, `${label}: age_band ${expectations.ageBand}`);
  }
}

console.log("PRINTABLE routing");
{
  const cases = [
    "Create Maker Station Signs printable for Little Makers Workshop teaching kit",
    "Make a printable for Little Makers Workshop",
    "Add printables to Little Makers Workshop",
    "Fix the printables in Little Makers Workshop",
    "Make whatever printables this lesson needs",
    "Add maker station signs to Little Makers Workshop",
    "Make activity cards for this one",
  ];
  for (const raw of cases) {
    const cmd = parse(raw, {
      phase: 4,
      currentlySelectedLessonId: (raw.includes("this one") || raw.includes("this lesson")) ? LMW_ID : null,
    });
    expectExistingLesson(cmd, raw.slice(0, 52), {
      route: intentRouter.ROUTES.EXISTING_PRINTABLE,
      generatePrintables: true,
      ageBand: "toddler",
    });
  }
}

console.log("\nIMAGE routing");
{
  for (const raw of [
    "Add better pictures to Little Makers Workshop",
    "Replace the bad images in Little Makers Workshop",
  ]) {
    const cmd = parse(raw, { phase: 7 });
    expectExistingLesson(cmd, raw.slice(0, 52), {
      route: intentRouter.ROUTES.EXISTING_IMAGE,
      generateImages: true,
      ageBand: "toddler",
    });
  }
  {
    const cmd = commandApi.parseOperatorCommand("Add visuals for the toddler lesson", {
      phase: 7,
      lessonPlans: [lmwLesson],
    });
    expectExistingLesson(cmd, "Add visuals toddler", {
      route: intentRouter.ROUTES.EXISTING_IMAGE,
      generateImages: true,
      ageBand: "toddler",
    });
  }
}

console.log("\nCOVER routing");
{
  const cmd = parse("Update the cover for Little Makers Workshop", { phase: 7 });
  expectExistingLesson(cmd, "Update cover", {
    route: intentRouter.ROUTES.EXISTING_COVER,
    touchCover: true,
    ageBand: "toddler",
  });
}

console.log("\nFULL UPGRADE / connected routing");
{
  const cases = [
    "Fix Little Makers Workshop",
    "Upgrade Little Makers Workshop",
    "Finish Little Makers Workshop teaching kit",
    "Make Little Makers Workshop publish-ready",
    "Improve this lesson and add anything it needs",
    "Edit Little Makers Workshop",
    "Upgrade Little Makers Workshop and make it publish-ready",
    "Finish everything missing in Bugs & Butterflies",
    "Make the printables and pictures for Weather Watchers",
  ];
  for (const raw of cases) {
    const cmd = parse(raw, {
      phase: 7,
      currentlySelectedLessonId: raw.includes("this lesson") ? LMW_ID : null,
    });
    expectExistingLesson(cmd, raw.slice(0, 52), {
      route: intentRouter.ROUTES.EXISTING_CONNECTED_UPGRADE,
      connectedUpgrade: true,
      allowAnyResolved: !raw.includes("Little Makers"),
    });
  }
}

console.log("\nSONGS/BOOKS routing");
{
  for (const raw of [
    "Fix the books in Little Makers Workshop",
    "Add songs to Little Makers Workshop",
  ]) {
    const cmd = parse(raw, { phase: 7 });
    expectExistingLesson(cmd, raw.slice(0, 52), {
      route: intentRouter.ROUTES.EXISTING_SONGS_BOOKS,
      generateSongsBooks: true,
      ageBand: "toddler",
    });
  }
}

console.log("\nNEW LESSON control cases");
{
  for (const raw of [
    "Create a new bakery lesson for toddlers",
    "Make a new weather lesson for preschool",
  ]) {
    const cmd = parse(raw, { phase: 7 });
    ok(cmd.ownerIntent.newLessonIntent === true, `${raw}: newLessonIntent`);
    ok(cmd.command.actions.createLesson === true, `${raw}: createLesson enabled`);
    ok(cmd.ownerIntent.route === intentRouter.ROUTES.CREATE_LESSON, `${raw}: create route`);
    ok(cmd.ownerIntent.existingLessonIntent !== true, `${raw}: not existing-lesson`);
  }
}

console.log("\nAMBIGUOUS control case");
{
  const cmd = parse("Improve it and add what is missing", { phase: 7 });
  ok(cmd.ownerIntent.needsClarification === true, "ambiguous command needs clarification");
  ok(cmd.command.actions.createLesson !== true, "ambiguous command does not create");
  ok(cmd.ownerIntent.route === intentRouter.ROUTES.AMBIGUOUS, "ambiguous route");
}

console.log("\nPreserve printable age_band resolver");
{
  const resolved = ageBandApi.resolvePrintableAgeBand(lmwLesson);
  ok(resolved.ok && resolved.ageBand === "toddler", "resolvePrintableAgeBand still works for LMW");
  const brief = createApi.parseCreationBrief(
    "Create Maker Station Signs printable for Little Makers Workshop teaching kit",
    { parentLesson: lmwLesson, defaultAccessPlan: "Free" },
  );
  ok(brief.needsOwnerInput.includes("age_band") === false, "parent lesson blocks age_band owner input");
}

console.log(`\n${passed} assertions passed.`);

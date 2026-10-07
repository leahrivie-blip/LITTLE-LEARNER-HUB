#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const allowlist = require("./curriculum-operator-mutation-allowlist.js");
const commandApi = require("./curriculum-operator-command.js");
const createApi = require("./curriculum-operator-create.js");
const createTitleScope = require("./curriculum-operator-create-title-scope.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

function buildLargeCatalog() {
  const plans = [];
  for (let i = 0; i < 120; i += 1) {
    plans.push({
      id: `cur-lp-catalog-${String(i).padStart(3, "0")}`,
      title: i % 7 === 0 ? `Spring Planting Week ${i}` : `Lesson Theme ${i}`,
      status: i % 3 === 0 ? "published" : "draft",
      age: "Preschool 3–5",
      plan: "Free",
    });
  }
  plans.push({ id: "cur-lp-weather-watchers", title: "Weather Watchers", status: "published", age: "Preschool 3–5", plan: "Free" });
  return plans;
}

const disposable = fixture.buildDisposableSpringPlantingQaTitle("gate-test");
const createCmd = fixture.buildExplicitCreateCommand(disposable);
const catalog = buildLargeCatalog();

const parsed = commandApi.parseOperatorCommand(createCmd, { phase: 7, lessonPlans: catalog });
assert.equal(parsed.command?.intent, "create_lesson", "create_lesson intent preserved");
assert.ok(
  !(parsed.confirmReasons || []).includes("ambiguous_scope"),
  "unique called title must not produce ambiguous_scope on large catalog",
);
assert.ok(
  !allowlist.isRunBlockedByConfirmations(parsed.confirmReasons, parsed.parseSafety),
  "interpretation gate must allow confirmed create run",
);
assert.equal(parsed.command?.scope?.requestedNewLessonTitle, disposable, "scope stores requested new title");
assert.deepEqual(parsed.command?.scope?.lessonIds, [], "new title must not resolve to lesson IDs");
assert.ok(
  !(parsed.command?.scope?.lessonIds || []).length,
  "quoted new title must not add existing lesson target IDs",
);

const brief = createApi.parseCreationBrief(createCmd).brief;
assert.equal(brief.title, disposable, "creation brief preserves called title");
assert.equal(brief.explicitPrintables.length, 1, "explicit printable unchanged");
assert.match(brief.explicitPrintables[0].title, /Seed Growth Sequencing Cards/i);

const fixCmd = 'Fix "Weather Watchers" cover image only. Do not change activities.';
const fixParsed = commandApi.parseOperatorCommand(fixCmd, { phase: 7, lessonPlans: catalog });
assert.equal(fixParsed.command?.intent, "fix_lesson", "fix_lesson still targets existing lesson");
assert.ok(
  fixParsed.command?.scope?.lessonIds?.includes("cur-lp-weather-watchers")
  || (fixParsed.command?.scope?.titles || []).some((t) => /weather watchers/i.test(t)),
  "fix command keeps existing lesson targeting",
);

const conflictCmd = `${createCmd} Also update the existing lesson "Weather Watchers".`;
const conflictParsed = commandApi.parseOperatorCommand(conflictCmd, { phase: 7, lessonPlans: catalog });
assert.ok(
  (conflictParsed.confirmReasons || []).includes("conflicting_create_and_existing"),
  "create + existing target fails closed",
);
assert.ok(
  allowlist.isRunBlockedByConfirmations(conflictParsed.confirmReasons, conflictParsed.parseSafety),
  "conflicting create/existing blocks run",
);

const dupTitle = "Spring Planting Week 0";
const dupCmd = fixture.buildExplicitCreateCommand(dupTitle);
const dupParsed = commandApi.parseOperatorCommand(dupCmd, { phase: 7, lessonPlans: catalog });
const dupBrief = createApi.parseCreationBrief(dupCmd).brief;
const dupCheck = createApi.findCreationDuplicates(dupBrief, { lessonPlans: catalog });
assert.equal(dupCheck.ok, false, "POSSIBLE_DUPLICATE still blocks exact existing title");
assert.equal(dupCheck.code, "POSSIBLE_DUPLICATE");

console.log("curriculum-operator create-title-scope regression checks passed.");

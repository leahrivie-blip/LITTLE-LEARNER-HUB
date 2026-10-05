#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const commandApi = require("./curriculum-operator-command.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

const titleA = fixture.buildDisposableSpringPlantingQaTitle("qa-run-a");
const titleB = fixture.buildDisposableSpringPlantingQaTitle("qa-run-b");
assert.notEqual(titleA, titleB, "consecutive QA runs get distinct disposable titles");
assert.match(titleA, /Spring Planting QA Disposable/i);
assert.match(titleB, /Spring Planting QA Disposable/i);

const cmdA = fixture.buildExplicitCreateCommand(titleA);
const cmdB = fixture.buildExplicitCreateCommand(titleB);
assert.notEqual(cmdA, cmdB, "explicit create commands differ when titles differ");
assert.ok(cmdA.includes(`"${titleA}"`), "command embeds quoted disposable title");

const parsed = commandApi.parseOperatorCommand(cmdA, { phase: 7 });
assert.equal(parsed.command?.intent, "create_lesson", "parser keeps create_lesson intent");
assert.equal(parsed.command?.actions?.createLesson, true, "createLesson action remains true");

const brief = createApi.parseCreationBrief(cmdA).brief;
assert.equal(brief.title, titleA, "creation brief uses quoted disposable title");
assert.match(String(brief.theme || brief.title), /spring planting/i, "theme stays spring planting");
assert.ok(brief.ageBand === "preschool" || /preschool/i.test(cmdA), "preschool age band preserved");
assert.equal(brief.explicitPrintables.length, 1, "explicit printable request preserved");
assert.match(brief.explicitPrintables[0].title, /Seed Growth Sequencing Cards/i);
assert.match(brief.explicitPrintables[0].activityHint, /seed growth/i);
assert.ok(
  brief.requestedActivities.some((a) => /seed growth/i.test(a)),
  "seed growth activity remains requested",
);

console.log("Spring Planting QA disposable title checks passed.");

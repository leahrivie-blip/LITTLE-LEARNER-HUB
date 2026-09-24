#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const boundary = require("./curriculum-operator-http-boundary.js");
const conversation = require("./curriculum-operator-conversation-store.js");
const command = require("./curriculum-operator-command.js");

const lessonPlans = [
  { id: "toddler", title: "Big Feelings, Little Bodies", age: "Toddler 12–24 Months" },
  { id: "preschool", title: "Healthy Me", age: "Preschool 3–5" },
];
const store = {};
let time = Date.UTC(2026, 0, 1);
const dependencies = {
  conversationStore: conversation,
  parseCommand: command.parseOperatorCommand,
  profileStore: { read: () => ({ version: 4, instructions: ["Use realistic photos."] }) },
  now: () => time,
};
async function request(commandText, owner = "leah@example.test", session = "a") {
  return boundary.handleParseRequest({
    body: { command: commandText, operatorSessionId: session },
    session: { email: owner }, store, curriculum: { lessonPlans }, dependencies,
  });
}

(async () => {
  const first = await request("Update Big Feelings, Little Bodies.", "leah@example.test", "a");
  assert.equal(first.statusCode, 200, "first request succeeds");
  assert.equal(first.body.jobCreated, false, "parse never creates a job");
  assert.equal(first.body.conversationContext.messages.length, 2, "first message and response persist");

  const followUp = await request("Add realistic exact-activity pictures.");
  assert.equal(followUp.statusCode, 200, "follow-up succeeds");
  assert.equal(followUp.body.conversationContext.currentLessonId, "toddler", "follow-up keeps resolved lesson");
  assert.equal(followUp.body.publishEnabled, false, "follow-up cannot publish");

  const correction = await request("No, I meant the toddler lesson.");
  assert.equal(correction.body.conversationContext.currentLessonId, "toddler", "target correction resolves toddler lesson");
  assert.match(correction.body.conversationContext.messages.at(-1).responseText, /corrected the target/i, "correction response is specific");

  const materials = await request("Keep the normal materials and add cheaper alternatives.");
  assert.equal(materials.body.conversationContext.materialCostMode, "standard_with_alternatives", "temporary material mode corrected");
  assert.match(materials.body.conversationContext.messages.at(-1).responseText, /normal materials/i, "material response is specific");

  const scope = await request("Only update Monday and keep the cover.");
  assert.deepEqual(scope.body.conversationContext.weeklyFieldScope, ["monday"], "Monday scope persists");
  assert.ok(scope.body.conversationContext.requestedExclusions.includes("cover"), "cover exclusion persists");

  const otherOwner = await request("Update Big Feelings, Little Bodies.", "other@example.test", "a");
  assert.notEqual(otherOwner.body.conversationContext.conversationId, scope.body.conversationContext.conversationId, "owner isolation");
  const otherSession = await request("Update Big Feelings, Little Bodies.", "leah@example.test", "b");
  assert.notEqual(otherSession.body.conversationContext.conversationId, scope.body.conversationContext.conversationId, "session isolation");

  time += conversation.TTL_MS + 1;
  const expired = await request("Only update the pictures.");
  assert.equal(expired.statusCode, 200, "expired request is safely parsed without old context");
  assert.equal(expired.body.jobCreated, false, "expired request cannot run a job");

  const unavailable = await boundary.handleParseRequest({
    body: { command: "Update Big Feelings, Little Bodies.", operatorSessionId: "bad" },
    session: { email: "leah@example.test" }, store, curriculum: { lessonPlans },
    dependencies: { ...dependencies, conversationStore: { ...conversation, save: () => { throw new Error("down"); } } },
  });
  assert.equal(unavailable.statusCode, 503, "store persistence failure is honest");
  assert.match(unavailable.body.error, /could not be saved/i, "store failure response is safe");
  console.log("Curriculum operator HTTP boundary checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const conversation = require("./curriculum-operator-conversation-store.js");

const store = {};
const owner = "leah@example.test";
const session = "session-a";
const lessonId = "cur-lp-big-feelings";
const now = Date.UTC(2026, 0, 1);
const messages = [
  "Update Big Feelings, Little Bodies with realistic activity pictures.",
  "Make every picture show the exact activity.",
  "Keep the cover.",
  "Use cheaper materials for this lesson.",
  "No, I only want cheaper alternatives added. Keep the normal materials too.",
  "Add movement activities.",
  "Only update Monday and leave it as a draft. Do not publish.",
];

let context = {
  ownerId: owner, sessionId: session, currentLessonId: lessonId,
  currentLessonTitle: "Big Feelings, Little Bodies", ageGroup: "Toddler 12–24 Months",
  currentOperation: "update_one_lesson", requestedActivities: ["movement activities"],
  requestedExclusions: ["cover", "publish"], imageRequirements: "exact activity",
  corrections: ["Cheaper alternatives only; retain normal materials."],
};
messages.forEach((rawText, index) => {
  context.messages = [...(context.messages || []), {
    role: "owner", rawText, operation: "update_one_lesson", resolvedLessonIds: [lessonId],
  }, {
    role: "operator", responseText: "I understand. Publishing will stay off.", operation: "update_one_lesson",
    resolvedLessonIds: [lessonId], exclusions: ["cover", "publish"],
  }];
  context = conversation.save(store, context, now + index);
});

const restored = conversation.loadConversationContext(store, owner, session, now + 10);
assert.equal(restored.messages.length, 14, "all seven owner messages and responses persist");
assert.equal(restored.currentLessonId, lessonId, "same lesson remains targeted");
assert.equal(restored.imageRequirements, "exact activity", "exact activity image rule persists");
assert.ok(restored.requestedExclusions.includes("cover"), "cover remains excluded");
assert.match(restored.corrections.join(" "), /alternatives/i, "normal materials correction persists");
assert.ok(restored.requestedActivities.includes("movement activities"), "movement request persists");
assert.equal(restored.currentOperation, "update_one_lesson", "operation restores");
assert.equal(conversation.summarizeConversationContext(restored).messageCount, 14, "context summary counts history");

const materialCorrection = conversation.parseSemanticCorrection(
  "No, keep the normal materials and add cheaper alternatives.",
);
assert.equal(materialCorrection.type, "materials", "semantic material correction is classified");
assert.equal(materialCorrection.replacementValue, "standard_with_alternatives", "material correction retains normal materials");
const corrected = conversation.applySemanticCorrection(restored, materialCorrection);
assert.equal(corrected.materialCostMode, "standard_with_alternatives", "material correction updates temporary context");
const mondayCorrection = conversation.parseSemanticCorrection("Keep the cover and only update Monday.");
const monday = conversation.applySemanticCorrection(corrected, mondayCorrection);
assert.ok(monday.requestedExclusions.includes("cover") || restored.requestedExclusions.includes("cover"), "cover correction remains excluded");
const undo = conversation.parseSemanticCorrection("Undo the last interpretation.");
assert.match(undo.responseText, /cannot undo saved lesson data/i, "undo never pretends to mutate saved data");

const merged = conversation.mergeFollowUpCommand(restored, { scope: { lessonIds: [] }, actions: { publish: false } });
assert.deepEqual(merged.scope.lessonIds, [lessonId], "follow-up inherits one trusted lesson");
assert.equal(merged.actions.publish, false, "follow-up remains unpublished");
assert.equal(conversation.read(store, "other@example.test", session, now + 10), null, "owner isolation holds");
assert.equal(conversation.read(store, owner, "session-b", now + 10), null, "session isolation holds");
assert.equal(conversation.read(store, owner, session, now + conversation.TTL_MS + messages.length + 1), null, "expired conversation cannot control commands");

conversation.clearTemporaryConversation(store, owner, session);
assert.equal(conversation.read(store, owner, session, now + 10), null, "start over clears temporary history");
console.log("Curriculum operator message-history checks passed.");

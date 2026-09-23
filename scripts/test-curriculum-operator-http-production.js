#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const store = {
  siteContent: {
    featureFlags: { teachingKitCurriculumOperator: true },
    curriculum: { lessonPlans: [{ id: "toddler", title: "Big Feelings, Little Bodies", age: "Toddler 12–24 Months" }] },
  },
};
const replies = [];
const api = createCurriculumOperatorApi({
  readJson: async (request) => request.body,
  jsonResponse: (_response, status, body) => replies.push({ status, body }),
  readStore: () => store,
  writeStoreAsync: async () => {},
  requireTeachingKitOwnerAdminSession: () => ({ email: "leah@example.test" }),
  teachingKit: {
    isTeachingKitOwnerPreviewEmail: (email) => email === "leah@example.test",
    isTeachingKitCurriculumOperatorEnabled: () => true,
  },
  normalizeEmail: (email) => email.toLowerCase(),
  readSiteCurriculum: (value) => value.siteContent.curriculum,
  openAiConfigured: false,
});

(async () => {
  await api.handle({ body: { action: "parse", command: "Update Big Feelings, Little Bodies.", operatorSessionId: "a", requestId: "one" } }, {});
  const first = replies.at(-1);
  assert.equal(first.status, 200, "production route accepts authenticated owner");
  assert.equal(first.body.action, "parse", "production route preserves parse response shape");
  assert.equal(first.body.publishEnabled, false, "response preserves publish-disabled contract");
  assert.ok(first.body.aiHealth && typeof first.body.aiHealth === "object", "response preserves AI health contract");
  assert.equal(first.body.researchReadiness.status, "disabled", "response reports disabled research readiness");
  assert.equal(JSON.stringify(first.body).includes("OPENAI_API_KEY"), false, "response never exposes a research secret name or value");
  assert.equal(first.body.conversationContext.messages.length, 2, "production route uses boundary message persistence");
  assert.equal(first.body.jobCreated, false, "parse route never runs a job");

  await api.handle({ body: { action: "parse", command: "Add realistic exact-activity pictures.", operatorSessionId: "a", requestId: "two" } }, {});
  const followUp = replies.at(-1);
  assert.equal(followUp.body.conversationContext.currentLessonId, "toddler", "production route restores follow-up target");
  assert.equal(followUp.body.publishEnabled, false, "production route keeps publishing disabled");

  await api.handle({ body: { action: "parse", command: "No, I meant the toddler lesson.", operatorSessionId: "a", requestId: "three" } }, {});
  assert.match(replies.at(-1).body.conversationContext.messages.at(-1).responseText, /corrected the target/i, "production route uses correction boundary");

  await api.handle({ body: { action: "parse", command: "Update Big Feelings, Little Bodies.", operatorSessionId: "a", requestId: "one" } }, {});
  assert.equal(replies.at(-1).body.idempotent, true, "duplicate request does not persist duplicate messages");
  await api.handle({ body: { action: "parse", command: "Update Big Feelings, Little Bodies.", operatorSessionId: "a", requestId: "four" } }, {});
  assert.equal(replies.at(-1).body.idempotent, undefined, "same text with a new request ID is a new message");
  assert.equal(replies.at(-1).body.conversationContext.messages.length, 8, "new request ID persists another owner/operator pair");
  console.log("Curriculum operator production HTTP adapter checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

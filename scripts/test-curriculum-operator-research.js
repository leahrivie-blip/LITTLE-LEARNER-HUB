#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const research = require("./curriculum-operator-research.js");
const boundary = require("./curriculum-operator-http-boundary.js");
const conversation = require("./curriculum-operator-conversation-store.js");
const command = require("./curriculum-operator-command.js");

const unavailable = research.requestResearch({ query: "current daycare trends", provider: null });
assert.equal(unavailable.ok, false, "disabled provider is unavailable");
assert.equal(unavailable.sources.length, 0, "unavailable research never fabricates sources");
assert.match(unavailable.message, /not connected yet/i, "unavailable response explains approved provider requirement");
assert.equal(research.requestResearch({ query: "x", provider: async () => ({}) }).code, "research_provider_unavailable", "unapproved injected provider cannot enable live research");

(async () => {
  const store = {};
  const result = await boundary.handleParseRequest({
    body: { command: "Search Google for current trending daycare healthy-habits ideas and tell me the sources.", operatorSessionId: "research", requestId: "research-1" },
    session: { email: "leah@example.test" },
    store,
    curriculum: { lessonPlans: [] },
    dependencies: {
      conversationStore: conversation,
      parseCommand: command.parseOperatorCommand,
      profileStore: { read: () => ({ version: 1, instructions: [] }) },
      now: () => Date.UTC(2026, 0, 1),
    },
  });
  assert.equal(result.statusCode, 200, "research request remains a safe parse");
  assert.equal(result.body.jobCreated, false, "research failure creates no job");
  assert.equal(result.body.publishEnabled, false, "research request cannot publish");
  assert.equal(result.body.conversationContext.researchRequested, true, "research request is persisted in owner context");
  assert.match(result.body.conversationContext.messages.at(-1).responseText, /not connected yet/i, "owner sees an honest unavailable response");
  assert.equal(result.body.conversationContext.messages.at(-1).responseText.includes("http"), false, "no source URL is invented");
  console.log("Curriculum operator research safety checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

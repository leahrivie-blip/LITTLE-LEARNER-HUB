#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const research = require("./curriculum-operator-research.js");
const boundary = require("./curriculum-operator-http-boundary.js");
const conversation = require("./curriculum-operator-conversation-store.js");
const command = require("./curriculum-operator-command.js");

(async () => {
  const unavailable = await research.requestResearch({ query: "current daycare trends" });
  assert.equal(unavailable.ok, false, "disabled provider is unavailable");
  assert.equal(unavailable.sources.length, 0, "unavailable research never fabricates sources");
  assert.match(unavailable.message, /not connected yet/i, "unavailable response explains approved provider requirement");
  assert.equal((await research.requestResearch({ query: "x" })).code, "research_provider_unavailable", "no unapproved provider fallback exists");
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

  const researchOnlyCommand = "Search online for current toddler healthy-habits activity ideas and return the sources. Do not create a lesson.";
  const parsedResearchOnly = command.parseOperatorCommand(researchOnlyCommand, { phase: 7 });
  assert.equal(parsedResearchOnly.command.intent, "research_only", "explicit research-only wording has a dedicated operation");
  for (const key of [
    "createLesson", "upgradeLesson", "upgradeActivities", "generateImages",
    "generatePrintables", "generateSongsBooks", "replaceBadImages", "publish",
  ]) {
    assert.equal(parsedResearchOnly.command.actions[key], false, `research-only clears ${key}`);
  }
  assert.equal(parsedResearchOnly.command.completion.mutationsEnabled, false, "research-only parsing disables mutations");

  const staged = command.parseOperatorCommand("Research toddler healthy habits, then make a lesson.", { phase: 7 });
  assert.equal(staged.needsConfirmation, true, "research then lesson requires confirmation before work");
  assert.equal(staged.command.actions.createLesson, false, "staged request cannot create a lesson yet");
  assert.equal(staged.command.actions.generateImages, false, "staged request cannot generate assets yet");

  const ordinary = command.parseOperatorCommand("Create a toddler healthy habits lesson with activity images and printables.", { phase: 7 });
  assert.equal(ordinary.command.actions.createLesson, true, "ordinary lesson request retains creation");
  assert.equal(ordinary.command.actions.generateImages, true, "ordinary lesson request retains requested images");
  assert.equal(ordinary.command.actions.generatePrintables, true, "ordinary lesson request retains requested printables");

  let providerCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return {
      ok: true,
      text: async () => JSON.stringify({
        output: [{ content: [{ annotations: [{
          url: "https://example.edu/toddler-healthy-habits",
          title: "Toddler Healthy Habits",
          text: "A concise, provider-supplied source summary.",
        }] }] }],
      }),
    };
  };
  try {
    const liveStore = {};
    const request = {
      command: researchOnlyCommand,
      operatorSessionId: "research-only",
      requestId: "research-only-1",
    };
    const liveDependencies = {
      conversationStore: conversation,
      parseCommand: command.parseOperatorCommand,
      profileStore: { read: () => ({ version: 1, instructions: [] }) },
      researchConfig: { enabled: true, apiKey: "test-key" },
      now: () => Date.UTC(2026, 0, 1),
    };
    const first = await boundary.handleParseRequest({
      body: request,
      session: { email: "leah@example.test" },
      store: liveStore,
      curriculum: { lessonPlans: [] },
      dependencies: liveDependencies,
    });
    const duplicate = await boundary.handleParseRequest({
      body: request,
      session: { email: "leah@example.test" },
      store: liveStore,
      curriculum: { lessonPlans: [] },
      dependencies: liveDependencies,
    });
    assert.equal(first.body.jobCreated, false, "research-only request creates no job");
    assert.equal(first.body.publishEnabled, false, "research-only request keeps publishing disabled");
    assert.equal(first.body.conversationContext.researchSources.length, 1, "validated citations persist in conversation history");
    assert.equal(first.body.conversationContext.researchSources[0].summary, "A concise, provider-supplied source summary.", "provider summary is preserved");
    assert.equal(duplicate.body.idempotent, true, "duplicate request is idempotent");
    assert.equal(providerCalls, 1, "duplicate request does not repeat the provider call");
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("Curriculum operator research safety checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

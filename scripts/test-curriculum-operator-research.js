#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const research = require("./curriculum-operator-research.js");
const boundary = require("./curriculum-operator-http-boundary.js");
const conversation = require("./curriculum-operator-conversation-store.js");
const command = require("./curriculum-operator-command.js");

function assertNoResearchMutationActions(parsed, label) {
  for (const key of [
    "createLesson", "upgradeLesson", "upgradeActivities", "generateImages",
    "generatePrintables", "generateSongsBooks", "replaceBadImages", "touchCover",
    "publish", "connectedUpgrade", "connectedAutoApply",
  ]) {
    assert.equal(parsed.command.actions[key], false, `${label} clears ${key}`);
  }
  assert.equal(parsed.command.completion.mutationsEnabled, false, `${label} disables mutations`);
}

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
  assertNoResearchMutationActions(parsedResearchOnly, "research-only");

  const lessonPlans = [{ id: "healthy-habits", title: "Toddler Healthy Habits", age: "Toddler 12–24 Months" }];
  const stagedRequests = [
    "Research healthy habits for toddlers then make me a lesson plan.",
    "Look up good fall activities and then create a toddler lesson.",
    "Research current preschool dinosaur activities and use that to build me a lesson.",
    "Find ideas for infant sensory play then make a lesson from them.",
    "Research this first and then create the full lesson.",
    "Look into what teachers are doing for apples and make me a preschool plan.",
    "Research dinosaur activities and then build me a preschool lesson with pictures and printables.",
    "Research apples then create a preschool lesson.",
  ];
  stagedRequests.forEach((request) => {
    const staged = command.parseOperatorCommand(request, { phase: 7, lessonPlans });
    assert.equal(staged.ownerIntent.naturalIntent, "research_and_create", `${request} is staged new-lesson research`);
    assert.equal(staged.command.intent, "research_then_create", `${request} keeps a staged create operation`);
    assert.equal(staged.needsConfirmation, true, `${request} requires confirmation`);
    assertNoResearchMutationActions(staged, request);
  });

  const implicitResearchOnly = command.parseOperatorCommand("Research fall activities for preschool.", { phase: 7, lessonPlans });
  assert.equal(implicitResearchOnly.command.intent, "research_only", "plain research request remains research-only");
  assertNoResearchMutationActions(implicitResearchOnly, "plain research-only");

  [
    "Research healthy habits for toddlers.",
    "Research Healthy Habits.",
    "Find ideas for my Healthy Habits lesson.",
    "Research apples for preschool.",
  ].forEach((request) => {
    const researchOnly = command.parseOperatorCommand(request, { phase: 7, lessonPlans });
    assert.equal(researchOnly.command.intent, "research_only", `${request} remains research-only`);
    assert.equal(researchOnly.command.scope.lessonIds.length, 0, `${request} does not target a lesson`);
    assertNoResearchMutationActions(researchOnly, request);
  });

  const imageUpdate = command.parseOperatorCommand("Add images to Healthy Habits.", { phase: 7, lessonPlans });
  assert.equal(imageUpdate.ownerIntent.route, "existing_image", "explicit image modification targets a unique catalog lesson");
  assert.equal(imageUpdate.command.scope.lessonIds[0], "healthy-habits", "image modification retains its target");

  const ordinary = command.parseOperatorCommand(
    "Make me a toddler healthy habits lesson with activity images and printables.",
    { phase: 7, lessonPlans },
  );
  assert.equal(ordinary.command.actions.createLesson, true, "ordinary lesson request retains creation");
  assert.equal(ordinary.command.actions.generateImages, true, "ordinary lesson request retains requested images");
  assert.equal(ordinary.command.actions.generatePrintables, true, "ordinary lesson request retains requested printables");

  const existingUpdate = command.parseOperatorCommand("Update my Toddler Healthy Habits lesson.", { phase: 7, lessonPlans });
  assert.equal(existingUpdate.ownerIntent.naturalIntent, "update_one_lesson", "named existing lesson remains an update");
  assert.equal(existingUpdate.command.actions.createLesson, false, "existing lesson update does not create a lesson");
  assert.equal(existingUpdate.command.scope.lessonIds[0], "healthy-habits", "existing lesson update keeps its target");

  const printableUpdate = command.parseOperatorCommand("Add printables to my Toddler Healthy Habits lesson.", { phase: 7, lessonPlans });
  assert.equal(printableUpdate.command.actions.createLesson, false, "existing printable request does not create a lesson");
  assert.equal(printableUpdate.command.actions.generatePrintables, true, "existing printable request retains its asset behavior");

  const stagedUpdate = command.parseOperatorCommand("Research healthy habits then update my existing Healthy Habits lesson.", {
    phase: 7,
    lessonPlans: [{ id: "healthy-habits", title: "Healthy Habits", age: "Toddler 12–24 Months" }],
  });
  assert.equal(stagedUpdate.command.intent, "research_then_update", "research then update is staged");
  assert.equal(stagedUpdate.needsConfirmation, true, "research then update requires confirmation");
  assert.equal(stagedUpdate.command.scope.lessonIds[0], "healthy-habits", "staged update retains the existing target");
  assertNoResearchMutationActions(stagedUpdate, "staged update");

  const confirmedStagedUpdate = command.parseOperatorCommand(
    "Research healthy habits then update my existing Healthy Habits lesson.",
    {
      phase: 7,
      lessonPlans: [{ id: "healthy-habits", title: "Healthy Habits", age: "Toddler 12–24 Months" }],
      confirmStagedResearchCreate: true,
    },
  );
  assert.notEqual(confirmedStagedUpdate.command.intent, "research_then_update", "confirmed staged update resumes the existing update path");
  assert.equal(confirmedStagedUpdate.command.actions.createLesson, false, "confirmed staged update never becomes create");

  const ambiguousResearch = command.parseOperatorCommand(
    "Research healthy habits and make something for toddlers.",
    { phase: 7, lessonPlans },
  );
  assert.equal(ambiguousResearch.needsConfirmation, true, "ambiguous research work requests clarification");
  assert.equal(ambiguousResearch.command.scope.lessonIds.length, 0, "ambiguous research does not target a lesson");
  assertNoResearchMutationActions(ambiguousResearch, "ambiguous research");

  const contextualVisuals = command.parseOperatorCommand("Add visuals to my toddler lesson.", {
    phase: 7,
    lessonPlans,
    currentlySelectedLessonId: "healthy-habits",
  });
  assert.equal(contextualVisuals.ownerIntent.route, "existing_image", "selected lesson context supports visual updates");
  assert.equal(contextualVisuals.command.scope.lessonIds[0], "healthy-habits", "contextual visual update retains selected target");

  const confirmedStaged = command.parseOperatorCommand(
    "Research dinosaur activities and then build me a preschool lesson with pictures and printables.",
    { phase: 7, confirmStagedResearchCreate: true },
  );
  assert.equal(confirmedStaged.command.intent, "create_lesson", "explicit confirmation resumes normal create intent");
  assert.equal(confirmedStaged.command.actions.createLesson, true, "confirmed staged request can create");
  assert.equal(confirmedStaged.command.actions.generateImages, true, "confirmed staged request preserves image workflow");
  assert.equal(confirmedStaged.command.actions.generatePrintables, true, "confirmed staged request preserves printable workflow");

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
      command: "Research current healthy habits activities for toddlers using trustworthy sources, then use that research to make me a toddler lesson plan.",
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
      curriculum: { lessonPlans },
      dependencies: liveDependencies,
    });
    const duplicate = await boundary.handleParseRequest({
      body: request,
      session: { email: "leah@example.test" },
      store: liveStore,
      curriculum: { lessonPlans },
      dependencies: liveDependencies,
    });
    assert.equal(first.body.command.intent, "research_then_create", "staged research keeps create work pending");
    assert.equal(first.body.needsConfirmation, true, "staged research requires confirmation");
    assert.match(first.body.conversationContext.messages.at(-1).responseText, /research is complete/i, "staged research has a clear confirmation message");
    assert.equal(first.body.command.scope.lessonIds.length, 0, "generic age wording does not select an existing lesson");
    assert.equal(first.body.jobCreated, false, "staged research request creates no job");
    assert.equal(first.body.publishEnabled, false, "staged research request keeps publishing disabled");
    assert.equal(first.body.conversationContext.researchSources.length, 1, "validated citations persist in conversation history");
    assert.equal(first.body.conversationContext.researchSources[0].summary, "A concise, provider-supplied source summary.", "provider summary is preserved");
    assert.equal(duplicate.body.idempotent, true, "duplicate request is idempotent");
    assert.equal(providerCalls, 1, "duplicate request does not repeat the provider call");
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("Curriculum operator research safety checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

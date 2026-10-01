#!/usr/bin/env node
/**
 * End-to-end QA — Curriculum Operator spring planting disposable draft flow.
 * Fixtures only; no production curriculum, no publish.
 * Run: npm run test:curriculum-operator-spring-planting-e2e
 */
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const createApi = require("./curriculum-operator-create.js");
const jobApi = require("./curriculum-operator-job.js");
const boundary = require("./curriculum-operator-http-boundary.js");
const conversation = require("./curriculum-operator-conversation-store.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");
const planner = require("./curriculum-operator-printable-planner.js");
const printablesApi = require("./curriculum-operator-printables.js");
const imagesApi = require("./curriculum-operator-images.js");
const stagedComposer = require("./curriculum-operator-staged-composer.js");
const architect = require("./curriculum-operator-create-architect.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

const OWNER = { email: "operator-spring-e2e@example.test" }; // pragma: allowlist secret
const PHASE = 7;

let passed = 0;
let blocked = false;
function ok(condition, message) {
  if (!condition) {
    blocked = true;
    console.error(`  ✗ BLOCKED: ${message}`);
  }
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function makeCreateHelper(storeRef) {
  return async function createOperatorLessonPlan({ lessonPlan, adminEmail }) {
    const id = `cur-lp-${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    const dailyPlans = lessonPlan.dailyPlans || {};
    const activities = [];
    let idx = 0;
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      const items = Array.isArray(dailyPlans[day]?.items) ? dailyPlans[day].items : [];
      items.forEach((item) => {
        const actId = `cur-act-${crypto.randomBytes(6).toString("hex")}`;
        const title = fixture.SPRING_ACTIVITY_TITLES[idx] || item.title;
        let setupImageUrl = "";
        if (idx === 0) setupImageUrl = fixture.GOOD_IMAGE_URL;
        if (idx === 1) setupImageUrl = fixture.BAD_IMAGE_URL;
        activities.push({
          id: actId,
          lessonPlanId: id,
          itemId: item.itemId,
          title,
          dayOfWeek: day,
          activityCategory: item.activityCategory || "Invitation to Play",
          objective: item.objective || `Preschoolers explore ${title.toLowerCase()} with teacher support and spring planting props.`,
          steps: item.steps || `1. Invite children to ${title}.\n2. Model safe tool use.\n3. Ask open questions about seeds and growth.`,
          materials: item.materials || `Tray, ${title} props, ${fixture.SAFETY_SNIPPETS.sensory}, ${fixture.SAFETY_SNIPPETS.smallObjects}`,
          safetyNotes: [
            item.safetyNotes,
            `Supervise ${fixture.SAFETY_SNIPPETS.water}; ${fixture.SAFETY_SNIPPETS.scissors}; check allergy list before food.`,
          ].filter(Boolean).join(" "),
          teacherLanguage: item.teacherLanguage || "What do you notice about the seed?\nHow does the sprout change?",
          cleanupTips: item.cleanupTips || "Wipe trays and store seeds in a labeled bin.",
          setupImageUrl,
          status: "draft",
        });
        idx += 1;
      });
    });
    const plan = {
      ...lessonPlan,
      id,
      title: lessonPlan.title || "Spring Planting",
      theme: lessonPlan.theme || "Spring Planting",
      status: "draft",
      plan: lessonPlan.plan === "Pro" ? "Pro" : "Free",
      activityIds: activities.map((a) => a.id),
      objectives: lessonPlan.objectives || "Children will sort seeds safely, explore water pouring, sequence seed growth, and snip herbs with supervision.",
      weeklyMaterials: lessonPlan.weeklyMaterials || "Seeds, soil, trays, watering cans, child-safe scissors, allergy list.",
      teacherPreparation: lessonPlan.teacherPreparation || "Teacher setup: stage spring planting trays at child height and review allergy notes before children arrive.",
      familyConnection: lessonPlan.familyConnection || "Invite families to sprout one seed in a cup at home and compare growth.",
      mixedAgeAdaptations: lessonPlan.mixedAgeAdaptations || "Younger preschoolers: larger seeds and fewer steps. Older preschoolers: label plant parts and extend sequencing.",
      budgetSubstitutions: lessonPlan.budgetSubstitutions || "Swap commercial seed kits for dried beans and recycled cups.",
      createdAt: now,
      updatedAt: now,
      lastEditedBy: adminEmail || "spring-e2e",
      operatorQaDisposable: true,
    };
    storeRef.curriculum.lessonPlans.push(plan);
    storeRef.curriculum.activities.push(...activities);
    return { ok: true, createdLessonId: id, lessonPlan: plan, activities, published: false };
  };
}

function buildCallOperatorAi() {
  const seedJson = JSON.stringify(fixture.buildSeedGrowthPrintableFixture());
  return async (_system, userPrompt) => {
    const user = String(userPrompt || "");
    if (/CREATE_WEEK_BLUEPRINT|EXPAND_ACTIVITY_BATCH|REPAIR_TARGETED/i.test(user)) {
      return stagedComposer.buildStagedFixtureResponse(user);
    }
    if (/requiredActivityCount|CREATE_NEW_LESSON_ARCHITECT/i.test(user)) {
      return architect.buildOperatorCreateArchitectFixtureResponse(user);
    }
    if (/printable|PRINTABLE|sequencing/i.test(user) && /seed|plant|sequenc/i.test(user)) {
      return seedJson;
    }
    if (/printable|PRINTABLE/i.test(user)) {
      return planner.buildOperatorPrintableAiFixtureResponse(user);
    }
    const composer = require("./curriculum-operator-ai-composer.js");
    return composer.buildOperatorAiFixtureResponse(user);
  };
}

function buildApi(storeRef, extra = {}) {
  return createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => storeRef,
    writeStoreAsync: async (next) => { Object.assign(storeRef, next); },
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    createOperatorLessonPlan: extra.createHelper,
    callOperatorAi: buildCallOperatorAi(),
    openAiConfigured: true,
    generateOperatorImage: extra.generateOperatorImage,
    persistEnrichmentPhoto: async () => ({ persistent: true, storage: "test" }),
    enrichmentMedia: {
      enrichmentMediaAssetId: () => `asset-${crypto.randomBytes(4).toString("hex")}`,
      enrichmentMediaUrl: (id, variant) => `/api/media/enrichment-photos/${id}?variant=${variant}`,
      buildEnrichmentVariants: async (buffer) => ({
        full: { buffer, mimeType: "image/png" },
        thumb: { buffer, mimeType: "image/png" },
      }),
    },
    saveOperatorEnrichmentDraft: async ({ lessonPlanId, enrichmentDraft }) => {
      const plans = storeRef.siteContent.curriculum.lessonPlans;
      const idx = plans.findIndex((p) => p.id === lessonPlanId);
      const prev = plans[idx];
      plans[idx] = {
        ...prev,
        enrichmentDraft: { ...enrichmentDraft, updatedAt: new Date().toISOString() },
      };
      return { ok: true, lessonPlan: plans[idx], versionId: `edraft-${lessonPlanId}`, saveMode: "enrichment_draft" };
    },
    createOperatorPrintableResource: async (payload) => {
      const resourceId = `cur-res-${crypto.randomBytes(6).toString("hex")}`;
      const resource = {
        id: resourceId,
        title: payload.title,
        resourceCategory: "Printables",
        resourceType: payload.resourceType,
        description: payload.description || "",
        fileName: payload.fileName,
        fileData: payload.fileData,
        pageCount: payload.pageCount,
        mimeType: "application/pdf",
        lessonPlanIds: [payload.lessonPlanId],
        status: "draft",
        disposableQaFixture: true,
      };
      storeRef.siteContent.curriculum.resources.push(resource);
      const planRow = storeRef.siteContent.curriculum.lessonPlans.find((p) => p.id === payload.lessonPlanId);
      planRow.resourceIds = [...new Set([...(planRow.resourceIds || []), resourceId])];
      return { ok: true, resourceId, resource, status: "draft" };
    },
    readOperatorPrintableFile: async ({ resourceId, lessonPlanId }) => {
      const resource = storeRef.siteContent.curriculum.resources.find((r) => r.id === resourceId);
      if (!resource || !(resource.lessonPlanIds || []).includes(lessonPlanId)) return { ok: false, error: "missing" };
      return {
        ok: true,
        previewVerified: true,
        downloadVerified: true,
        pageCount: resource.pageCount,
        fileName: resource.fileName,
        title: resource.title,
      };
    },
    unlinkOperatorPrintableResource: async () => ({ ok: true, preservedResourceRecord: true }),
    ...extra.apiOverrides,
  });
}

async function main() {
  console.log("Curriculum Operator — Spring Planting E2E QA (disposable draft)\n");

  const scopeBefore = fixture.seedScopeLibrary();
  const scopeSnapshot = fixture.snapshotScope(scopeBefore);

  console.log("1. Research gate (exact natural command)");
  const staged = commandApi.parseOperatorCommand(fixture.EXACT_COMMAND, {
    phase: PHASE,
    lessonPlans: scopeBefore.lessonPlans,
  });
  ok(staged.command.intent === "research_then_create", "exact command → research_then_create");
  ok((staged.confirmReasons || []).includes("research_then_lesson_confirmation_required"), "research confirm required before mutations");
  ok(staged.command.actions.createLesson !== true, "research stage does not create yet");
  ok(staged.command.actions.publish === false, "research stage cannot publish");

  const parseStore = { curriculumOperatorConversations: {} };
  const mockFetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({
      output: [{
        content: [{
          annotations: fixture.MOCK_RESEARCH_SOURCES.map((s) => ({ url: s.url, title: s.title, text: s.summary })),
        }],
      }],
    }),
  });
  const parseResult = await boundary.handleParseRequest({
    body: { command: fixture.EXACT_COMMAND, operatorSessionId: "spring-e2e", requestId: "req-1" },
    session: { email: OWNER.email },
    store: parseStore,
    curriculum: scopeBefore,
    phase: PHASE,
    dependencies: {
      conversationStore: conversation,
      parseCommand: commandApi.parseOperatorCommand,
      profileStore: { read: () => ({ version: 1, instructions: [] }) },
      researchConfig: { enabled: true, apiKey: "test-key", fetchImpl: mockFetch },
    },
  });
  ok(parseResult.statusCode === 200, "research parse succeeds");
  ok(parseResult.body.jobCreated === false, "research parse does not create job");
  ok(parseResult.body.conversationContext?.researchSources?.length === 2, "research sources retained");
  ok(!parseResult.body.conversationContext?.messages?.at(-1)?.responseText?.includes("javascript:"), "no invented unsafe source markup");

  const briefWithResearch = createApi.parseCreationBrief(fixture.EXACT_COMMAND, {
    researchSources: parseResult.body.conversationContext.researchSources,
  });
  ok(briefWithResearch.ok === true, "creation brief parses after age/title fix");
  ok(briefWithResearch.brief.title.toLowerCase().includes("spring"), "brief theme is spring planting");
  ok(briefWithResearch.brief.researchContext.length >= 1, "research context attached to brief");
  ok(briefWithResearch.brief.activityTarget === 4, "compact complete lesson plan → 4 activities (platform minimum)");

  const confirmed = commandApi.parseOperatorCommand(fixture.EXACT_COMMAND, {
    phase: PHASE,
    lessonPlans: scopeBefore.lessonPlans,
    confirmStagedResearchCreate: true,
  });
  ok(confirmed.command.intent === "create_lesson", "confirmed intent → create_lesson");
  ok(confirmed.command.actions.createLesson === true, "confirmed create enabled");
  ok(confirmed.command.actions.generateImages === true && confirmed.command.actions.generatePrintables === true,
    "confirmed create requests images and printables");
  ok(confirmed.command.actions.publish === false, "confirmed create publish=false");

  console.log("\n2–5. Operator run — create, printable, images, scope");
  const storeRef = {
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true },
      curriculum: JSON.parse(JSON.stringify(scopeBefore)),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
    users: {},
  };
  const createHelper = makeCreateHelper(storeRef.siteContent);
  const genCounter = { calls: 0 };
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const api = buildApi(storeRef, {
    createHelper,
    generateOperatorImage: async () => {
      genCounter.calls += 1;
      return { ok: true, buffer: tinyPng, mimeType: "image/png" };
    },
  });

  const cmd = schema.normalizeOperatorCommand(confirmed.command, { phase: PHASE });
  cmd.rawCommand = fixture.EXACT_COMMAND;
  cmd.actions.saveDraft = true;
  cmd.actions.replaceBadImages = true;
  cmd.completion.phase = PHASE;

  const planSummary = api.buildPlanSummary(cmd, {
    selected: [{
      id: "pending-create",
      title: briefWithResearch.brief.title,
      theme: briefWithResearch.brief.theme,
      age: briefWithResearch.brief.ageLabel,
      ageBand: briefWithResearch.brief.ageBand,
      plan: briefWithResearch.brief.accessPlan,
      readinessPercent: 0,
      completionPercent: 0,
      creationBrief: briefWithResearch.brief,
      creationIdempotencyKey: briefWithResearch.brief.idempotencyKey,
    }],
    selectionNote: "create",
    candidatesConsidered: scopeBefore.lessonPlans.length,
    creationBrief: briefWithResearch.brief,
    pendingCreateId: "pending-create",
  });
  ok(planSummary.publishes === false && planSummary.createsLesson === true, "plan summary draft-only create");

  let job = jobApi.createJobFromPlan({
    command: cmd,
    planSummary,
    createdBy: OWNER.email,
    status: "running",
  });
  ok(job.publishEnabled === false, "job publishEnabled false");
  ok(job.lessonResults[0].actions.some((a) => a.type === "lesson.create"), "job includes lesson.create");
  ok(job.lessonResults[0].actions.some((a) => a.type === "printable.verify"), "job includes printable verification");

  const finished = await api.runJob(job, storeRef, OWNER.email);
  ok(finished.status === "completed" || finished.progress.completed >= 1, "operator job completes");
  const lr = finished.lessonResults[0];
  ok(lr.published === false, "lesson result published=false");
  ok(["READY_FOR_OWNER_REVIEW", "PARTIAL", "SUCCESS", "success"].includes(lr.ownerReviewStatus)
    || lr.status === "success", "review-ready owner status");
  ok(!lr.actions.some((a) => a.type === "lesson.publish"), "no publish step");

  const curriculum = storeRef.siteContent.curriculum;
  const createdPlan = curriculum.lessonPlans.find((p) => p.id === lr.createdLessonId || p.id === lr.lessonId);
  ok(createdPlan && createdPlan.status === "draft", "created lesson remains draft");
  const createdActs = curriculum.activities.filter((a) => a.lessonPlanId === createdPlan.id);
  ok(createdActs.length >= 3, "at least three activities created");

  const contract = fixture.assertLessonSectionContract(createdPlan, createdActs);
  ok(contract.ok, `lesson section contract (${contract.issues.join(", ") || "ok"})`);

  const safety = fixture.assertSafetyThemes(createdActs);
  ok(safety.ok, `safety themes present (${safety.missingThemes.join(", ") || "all"})`);

  const scopeAfter = fixture.snapshotScope(curriculum);
  const beforeObj = JSON.parse(scopeSnapshot);
  const afterObj = JSON.parse(scopeAfter);
  const decoyIds = beforeObj.lessonPlans.map((p) => p.id);
  ok(decoyIds.every((id) => {
    const b = beforeObj.lessonPlans.find((p) => p.id === id);
    const a = afterObj.lessonPlans.find((p) => p.id === id);
    return b && a && JSON.stringify(b) === JSON.stringify(a);
  }), "scope decoy lessons unchanged");
  ok(afterObj.lessonPlans.length === beforeObj.lessonPlans.length + 1, "only one new lesson added");
  ok(beforeObj.resources.every((br) => {
    const ar = afterObj.resources.find((r) => r.id === br.id);
    return ar && ar.title === br.title && ar.fileName === br.fileName;
  }), "unrelated books/printables titles not modified");

  const seqAct = createdActs.find((a) => /seed growth/i.test(a.title));
  ok(seqAct, "Seed Growth Story Sequence activity exists");
  const seqPrintable = curriculum.resources.find((r) => /seed growth/i.test(r.title) && r.lessonPlanIds?.includes(createdPlan.id));
  ok(seqPrintable, "seed-growth sequencing printable resource exists");
  ok(/sequenc/i.test(seqPrintable.title), "printable title references sequencing");
  ok(!/groth|sequecing/i.test(seqPrintable.title), "printable spelling sanity");
  ok(/\.pdf$/i.test(seqPrintable.fileName || ""), "printable stored as PDF");

  if (seqPrintable?.fileData) {
    const pdfBuffer = Buffer.from(String(seqPrintable.fileData).replace(/^data:application\/pdf;base64,/, ""), "base64");
    const validated = await printablesApi.validateGeneratedPdf(pdfBuffer, {
      expectedPageCount: seqPrintable.pageCount || 1,
      fileName: seqPrintable.fileName,
    });
    ok(validated.ok, "seed-growth PDF validates (layout/page count)");
  } else {
    ok(false, "printable fileData persisted for render check");
  }

  const goodAct = createdActs.find((a) => a.setupImageUrl === fixture.GOOD_IMAGE_URL);
  const badAct = createdActs.find((a) => a.title.includes("Watering"));
  ok(goodAct, "good image seed activity present");
  if (createdPlan.enrichmentDraft?.activities) {
    const draftGood = createdPlan.enrichmentDraft.activities[goodAct.id]?.setupImageUrl || goodAct.setupImageUrl;
    ok(draftGood === fixture.GOOD_IMAGE_URL || draftGood.includes("tk-enrich-spring-good"), "valid image kept");
    if (badAct && createdPlan.enrichmentDraft.activities[badAct.id]) {
      ok(createdPlan.enrichmentDraft.activities[badAct.id].setupImageUrl !== fixture.BAD_IMAGE_URL, "bad image replaced in draft");
    }
  }
  ok(genCounter.calls >= 1, "missing/wrong images triggered generation");

  console.log("\n6. Follow-up command targeting (parse + allowlist)");
  const lessonId = createdPlan.id;
  const exactFollowUps = [
    "Make Activity 1 easier for younger toddlers.",
    "Replace only the printable.",
    "Make the materials more budget-friendly.",
    "Change only Activity 3’s image.",
    "Add a family connection without changing the activities.",
  ];
  exactFollowUps.forEach((text) => {
    const parsed = commandApi.parseOperatorCommand(text, {
      phase: PHASE,
      lessonPlans: curriculum.lessonPlans,
      activities: createdActs,
      currentlySelectedLessonId: lessonId,
    });
    ok(parsed.command.scope.lessonIds.includes(lessonId), `follow-up targets selected QA lesson: ${text.slice(0, 42)}`);
    ok(parsed.command.actions.publish !== true, `follow-up publish=false: ${text.slice(0, 42)}`);
    const al = allowlistApi.buildMutationAllowlist(parsed.command, { lessonIds: [lessonId] });
    ok(al.publishAllowed !== true, `follow-up allowlist publish denied: ${text.slice(0, 30)}`);
  });
  const printableOnly = commandApi.parseOperatorCommand("Replace only the printable.", {
    phase: PHASE,
    lessonPlans: curriculum.lessonPlans,
    currentlySelectedLessonId: lessonId,
  });
  ok(printableOnly.interpretation?.primary === "PRINTABLE_WORK", "Replace only the printable → PRINTABLE_WORK");
  ok(printableOnly.command.actions.generatePrintables === true, "printable-only enables printables");
  ok(printableOnly.command.actions.generateImages !== true, "printable-only does not enable images");
  const alPrint = allowlistApi.buildMutationAllowlist(printableOnly.command, { lessonIds: [lessonId] });
  ok(alPrint.assets?.printables === true && alPrint.assets?.images !== true, "allowlist printable-only scope");

  const actThreeImage = commandApi.parseOperatorCommand(
    "Fix only Activity 3 picture in Spring Planting. Do not change lesson wording.",
    { phase: PHASE, lessonPlans: curriculum.lessonPlans, activities: createdActs, currentlySelectedLessonId: lessonId },
  );
  ok(actThreeImage.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "Activity 3 image → ACTIVITY_IMAGE_REPAIR");
  ok(actThreeImage.command.actions.generateImages === true, "Activity 3 image enables images");
  ok(actThreeImage.command.actions.upgradeLesson !== true, "Activity 3 image does not upgrade lesson text");

  console.log("\n7–8. Review gate and publish safety");
  ok(finished.publishEnabled === false, "finished job publishEnabled false");
  ok(!finished.lessonResults.some((row) => row.published === true), "no lessonResults published");
  const publishParse = commandApi.parseOperatorCommand("Publish this lesson.", {
    phase: PHASE,
    lessonPlans: curriculum.lessonPlans,
    currentlySelectedLessonId: lessonId,
  });
  ok(publishParse.command.actions.publish !== true, "explicit publish not auto-enabled");
  ok((publishParse.confirmReasons || []).includes("publish_requested"), "publish requires confirmation");

  if (blocked) {
    console.error("\nRESULT: BLOCKED — one or more spring planting E2E checks failed.");
    process.exitCode = 1;
    return;
  }
  console.log(`\nRESULT: PASS — ${passed} assertions`);
}

main().catch((error) => {
  console.error("\nRESULT: BLOCKED —", error.message);
  process.exitCode = 1;
});

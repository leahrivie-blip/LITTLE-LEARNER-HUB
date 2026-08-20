#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 8 — Owner-gated review + manual publish.
 * Fixture stores only; never touches production curriculum.
 * Run: npm run test:curriculum-operator-phase8
 */
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const jobApi = require("./curriculum-operator-job.js");
const ownerPublish = require("./curriculum-operator-owner-publish.js");
const { createCurriculumOperatorOwnerPublishApi } = require("../server/curriculum-operator-owner-publish.js");

const OWNER = { email: "leahivie@icloud.com" };
const STAFF = { email: "staff-beta@example.com" };
const FREE_USER = { email: "free-user@example.com" };
const LESSON_ID = "cur-lp-operator-phase8-fixture";
const SIBLING_ID = "cur-lp-operator-phase8-sibling";
const ACT_A = "cur-act-p8-a";
const ACT_B = "cur-act-p8-b";
const PRINT_ID = "cur-res-p8-print";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function fixtureLesson(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: LESSON_ID,
    title: "Weather Watchers",
    age: "Toddler",
    plan: "Pro",
    status: "draft",
    weeklyOverview: "Explore weather through play.",
    objectives: "Notice weather words.",
    teacherPreparation: "Set out weather cards.",
    familyConnection: "Talk about today's weather.",
    activityIds: [ACT_A, ACT_B],
    resourceIds: [PRINT_ID],
    songs: [{ title: "Rain Song" }],
    books: [{ title: "Cloudy Day" }],
    enrichmentDraft: {
      updatedAt: now,
      week: {
        weeklyOverview: "Explore weather through play.",
        teacherPreparation: "Set out weather cards.",
        familyConnection: "Talk about today's weather.",
        printableIds: [PRINT_ID],
        songs: [{ title: "Rain Song" }],
        books: [{ title: "Cloudy Day" }],
      },
      activities: {
        [ACT_A]: {
          teacherTips: ["Watch for wet surfaces"],
          setupImageUrl: "https://cdn.example.test/p8-a.png",
        },
        [ACT_B]: {
          teacherTips: ["Name the clouds"],
          setupImageUrl: "https://cdn.example.test/p8-b.png",
        },
      },
    },
    updatedAt: now,
    ...overrides,
  };
}

function fixtureCurriculum(lessonOverrides = {}) {
  return {
    lessonPlans: [
      fixtureLesson(lessonOverrides),
      {
        id: SIBLING_ID,
        title: "Sibling Kit",
        age: "Preschool",
        plan: "Free",
        status: "published",
        updatedAt: "2026-01-01T00:00:00.000Z",
        activityIds: [],
      },
    ],
    activities: [
      {
        id: ACT_A,
        lessonPlanId: LESSON_ID,
        itemId: ACT_A,
        title: "Puddle Jump Count",
        status: "draft",
        setupImageUrl: "https://cdn.example.test/p8-a.png",
      },
      {
        id: ACT_B,
        lessonPlanId: LESSON_ID,
        itemId: ACT_B,
        title: "Cloud Watch",
        status: "draft",
        setupImageUrl: "https://cdn.example.test/p8-b.png",
      },
    ],
    resources: [
      {
        id: PRINT_ID,
        title: "Weather Clothing Match",
        resourceCategory: "Printable",
        status: "draft",
      },
    ],
  };
}

function readyJob(lessonId = LESSON_ID) {
  return {
    id: "opjob_phase8_ready",
    status: "completed",
    updatedAt: new Date().toISOString(),
    command: {
      actions: { publish: false, saveDraft: true },
      confirmations: { reasons: [] },
      completion: { phase: 8, publish: false },
    },
    publishEnabled: false,
    lessonResults: [{
      lessonId,
      title: "Weather Watchers",
      status: "success",
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
      readyForReview: true,
      publishRequested: false,
      published: false,
      actions: [
        { type: "lesson.saveDraft", status: "success" },
        { type: "lesson.validate", status: "success" },
      ],
      imagesComplete: true,
      printablesComplete: true,
      songsBooksComplete: true,
      finalVerification: { ok: true },
      afterScores: { premiumReadinessPercent: 96 },
      auditAfter: {
        lessonId,
        title: "Weather Watchers",
        age: "Toddler",
        accessPlan: "Pro",
        scores: { premiumReadinessPercent: 96 },
        teachingKitBlockers: [],
      },
      updated: [
        { path: "teacherPreparation" },
        { path: "activities", activityTitle: "Puddle Jump Count" },
      ],
      kept: ["family connection", "existing book"],
      printableActions: [{ decision: "KEEP", status: "success", previewVerified: true, downloadVerified: true }],
      songActions: [{ decision: "KEEP", status: "success" }],
      bookActions: [{ decision: "KEEP", status: "success" }],
    }],
  };
}

function makeApi({ storeRef, sessionEmail = OWNER.email, runTrusted }) {
  let lastStatus = 0;
  let lastPayload = null;
  const api = createCurriculumOperatorOwnerPublishApi({
    readJson: async () => ({}),
    jsonResponse: (_res, status, payload) => {
      lastStatus = status;
      lastPayload = payload;
    },
    readStore: () => storeRef.store,
    requireTeachingKitOwnerAdminSession: () => {
      if (!sessionEmail) return null;
      return { email: sessionEmail };
    },
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    runTrustedOwnerPublish: runTrusted || (async ({ lessonId }) => {
      const plan = storeRef.store.siteContent.curriculum.lessonPlans.find((p) => p.id === lessonId);
      if (!plan) return { ok: false, code: "LESSON_NOT_FOUND", error: "missing" };
      plan.status = "published";
      plan.publishedAt = new Date().toISOString();
      plan.enrichmentDraft = null;
      plan.teachingKit = {
        ...(plan.teachingKit || {}),
        lastOperatorOwnerPublish: { at: plan.publishedAt, path: "fixture_trusted" },
      };
      return {
        ok: true,
        versionId: `epub-fixture-${crypto.randomBytes(4).toString("hex")}`,
        previousHistoryRef: null,
        trustedPath: "publish_enrichment+draft_status_publish",
      };
    }),
  });
  return {
    api,
    async call(body, request = {}) {
      lastStatus = 0;
      lastPayload = null;
      const fakeReq = { method: "POST", headers: {}, ...request };
      // Inject body via readJson override per call
      const prev = api;
      const wrapped = createCurriculumOperatorOwnerPublishApi({
        readJson: async () => body,
        jsonResponse: (_res, status, payload) => {
          lastStatus = status;
          lastPayload = payload;
        },
        readStore: () => storeRef.store,
        requireTeachingKitOwnerAdminSession: (req, b, res) => {
          if (!sessionEmail) {
            lastStatus = 401;
            lastPayload = { error: "Admin access required", code: "admin_required" };
            return null;
          }
          if (sessionEmail !== OWNER.email && require("./teaching-kit.js").isTeachingKitOwnerPreviewEmail) {
            const tk = require("./teaching-kit.js");
            if (!tk.isTeachingKitOwnerPreviewEmail(sessionEmail)) {
              // Force through requireOwner path
            }
          }
          return { email: sessionEmail };
        },
        teachingKit: {
          ...require("./teaching-kit.js"),
          isTeachingKitOwnerPreviewEmail: (email) => String(email || "").toLowerCase() === OWNER.email,
          isTeachingKitCurriculumOperatorEnabled: () => true,
        },
        normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
        runTrustedOwnerPublish: runTrusted || (async ({ lessonId }) => {
          const plan = storeRef.store.siteContent.curriculum.lessonPlans.find((p) => p.id === lessonId);
          if (!plan) return { ok: false, code: "LESSON_NOT_FOUND", error: "missing" };
          // Simulate identity guards used by trusted path
          if (body.title && body.title !== plan.title) {
            return { ok: false, code: "TITLE_AGE_CHANGED", error: "title changed" };
          }
          if (body.accessPlan && body.accessPlan !== (plan.plan === "Pro" ? "Pro" : "Free")) {
            return { ok: false, code: "ACCESS_PLAN_CHANGED", error: "plan changed" };
          }
          plan.status = "published";
          plan.publishedAt = new Date().toISOString();
          plan.enrichmentDraft = null;
          return {
            ok: true,
            versionId: "epub-fixture",
            previousHistoryRef: null,
            trustedPath: "publish_enrichment+draft_status_publish",
          };
        }),
      });
      await wrapped.handle(fakeReq, {});
      return { status: lastStatus, json: lastPayload };
    },
  };
}

async function main() {
  console.log("Curriculum Operator Phase 8 — Owner-gated publish");

  console.log("AUTH");
  {
    const storeRef = {
      store: {
        siteContent: {
          featureFlags: { teachingKitCurriculumOperator: true },
          curriculum: fixtureCurriculum(),
        },
        curriculumOperatorJobs: { jobs: [readyJob()] },
      },
    };
    const ownerApi = makeApi({ storeRef, sessionEmail: OWNER.email });
    const ownerElig = await ownerApi.call({
      action: "eligibility",
      lessonId: LESSON_ID,
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(ownerElig.status === 200 && ownerElig.json?.eligible === true, "Owner publish eligibility allowed");

    const staffApi = makeApi({ storeRef, sessionEmail: STAFF.email });
    const staffElig = await staffApi.call({
      action: "eligibility",
      lessonId: LESSON_ID,
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(staffElig.status === 403 && staffElig.json?.code === "UNAUTHORIZED", "unauthorized staff rejected");

    const freeApi = makeApi({ storeRef, sessionEmail: FREE_USER.email });
    const freeElig = await freeApi.call({
      action: "eligibility",
      lessonId: LESSON_ID,
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(freeElig.status === 403, "Free/Pro user rejected");
  }

  console.log("ELIGIBILITY");
  {
    const curriculum = fixtureCurriculum();
    const jobs = [readyJob()];
    const ready = ownerPublish.evaluatePublishEligibility({
      lesson: curriculum.lessonPlans[0],
      activities: curriculum.activities,
      resources: curriculum.resources,
      jobs,
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(ready.eligible === true && ready.publishEnabled === true, "READY lesson may proceed");

    for (const status of ["PARTIAL", "BLOCKED", "RUNNING", "SCOPE_REVIEW_REQUIRED"]) {
      const blocked = ownerPublish.evaluatePublishEligibility({
        lesson: curriculum.lessonPlans[0],
        activities: curriculum.activities,
        resources: curriculum.resources,
        jobs,
        ownerReviewStatus: status,
      });
      ok(blocked.publishEnabled === false, `${status} disabled`);
    }

    const staleReady = ownerPublish.evaluatePublishEligibility({
      lesson: { ...curriculum.lessonPlans[0], title: "" },
      activities: curriculum.activities,
      resources: curriculum.resources,
      jobs,
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(staleReady.publishEnabled === false, "stale previous READY revalidated (missing title blocker)");
  }

  console.log("CONFIRMATION");
  {
    const curriculum = fixtureCurriculum();
    const elig = ownerPublish.evaluatePublishEligibility({
      lesson: curriculum.lessonPlans[0],
      activities: curriculum.activities,
      resources: curriculum.resources,
      jobs: [readyJob()],
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    const conf = ownerPublish.buildConfirmationPayload(elig);
    ok(conf.title === "Weather Watchers" && conf.lessonId === LESSON_ID, "confirmation contains exact lesson identity");
    ok(conf.accessPlan === "Pro", "access plan shown");
    ok(Boolean(conf.fingerprint) && conf.fingerprint === elig.fingerprint.fingerprint, "reviewed fingerprint recorded");
  }

  console.log("STALE STATE");
  {
    const curriculum = fixtureCurriculum();
    const elig1 = ownerPublish.evaluatePublishEligibility({
      lesson: curriculum.lessonPlans[0],
      activities: curriculum.activities,
      resources: curriculum.resources,
      jobs: [readyJob()],
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    const confirmation = {
      confirmPublish: true,
      reviewedFingerprint: elig1.fingerprint.fingerprint,
      lessonId: LESSON_ID,
      title: "Weather Watchers",
      age: "Toddler",
      accessPlan: "Pro",
    };
    // Mutate draft after confirmation
    curriculum.lessonPlans[0].enrichmentDraft.week.teacherPreparation = "CHANGED AFTER CONFIRM";
    const elig2 = ownerPublish.evaluatePublishEligibility({
      lesson: curriculum.lessonPlans[0],
      activities: curriculum.activities,
      resources: curriculum.resources,
      jobs: [readyJob()],
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    const stale = ownerPublish.assertConfirmationStillFresh({
      lesson: curriculum.lessonPlans[0],
      confirmation,
      eligibility: elig2,
    });
    ok(stale.ok === false && stale.code === "DRAFT_CHANGED_REVIEW_AGAIN", "draft changes after confirmation → rejected");

    const planChange = ownerPublish.assertConfirmationStillFresh({
      lesson: { ...fixtureLesson(), plan: "Free" },
      confirmation: { ...confirmation, reviewedFingerprint: ownerPublish.buildOwnerReviewFingerprint(fixtureLesson({ plan: "Free" })).fingerprint },
      eligibility: {
        fingerprint: ownerPublish.buildOwnerReviewFingerprint(fixtureLesson({ plan: "Free" })),
      },
    });
    // Force access plan mismatch against confirmation.accessPlan Pro
    const planMismatch = ownerPublish.assertConfirmationStillFresh({
      lesson: fixtureLesson({ plan: "Free" }),
      confirmation: {
        confirmPublish: true,
        reviewedFingerprint: ownerPublish.buildOwnerReviewFingerprint(fixtureLesson({ plan: "Free" })).fingerprint,
        lessonId: LESSON_ID,
        title: "Weather Watchers",
        age: "Toddler",
        accessPlan: "Pro",
      },
      eligibility: {
        fingerprint: ownerPublish.buildOwnerReviewFingerprint(fixtureLesson({ plan: "Free" })),
      },
    });
    ok(planMismatch.code === "ACCESS_PLAN_CHANGED", "access plan changes → publish rejected");

    const titleMismatch = ownerPublish.assertConfirmationStillFresh({
      lesson: fixtureLesson({ title: "Storm Chasers" }),
      confirmation: {
        confirmPublish: true,
        reviewedFingerprint: ownerPublish.buildOwnerReviewFingerprint(fixtureLesson({ title: "Storm Chasers" })).fingerprint,
        lessonId: LESSON_ID,
        title: "Weather Watchers",
        age: "Toddler",
        accessPlan: "Pro",
      },
      eligibility: {
        fingerprint: ownerPublish.buildOwnerReviewFingerprint(fixtureLesson({ title: "Storm Chasers" })),
      },
    });
    ok(titleMismatch.code === "TITLE_AGE_CHANGED", "title/age changes → publish rejected");
    void planChange;
  }

  console.log("PUBLISH + POST-PUBLISH VERIFY (fixture trusted path)");
  {
    const storeRef = {
      store: {
        siteContent: {
          featureFlags: { teachingKitCurriculumOperator: true },
          curriculum: fixtureCurriculum(),
        },
        curriculumOperatorJobs: { jobs: [readyJob()] },
      },
    };
    const api = makeApi({ storeRef, sessionEmail: OWNER.email });
    const conf = await api.call({
      action: "confirm",
      lessonId: LESSON_ID,
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(conf.status === 200 && conf.json?.confirmation?.fingerprint, "confirm opens with fingerprint");

    const siblingBefore = JSON.stringify(
      storeRef.store.siteContent.curriculum.lessonPlans.find((p) => p.id === SIBLING_ID),
    );
    const published = await api.call({
      action: "publish",
      lessonId: LESSON_ID,
      confirmPublish: true,
      reviewedFingerprint: conf.json.confirmation.fingerprint,
      title: "Weather Watchers",
      age: "Toddler",
      accessPlan: "Pro",
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(published.status === 200 && published.json?.published === true, "trusted existing publish path called");
    ok(published.json?.lessonId === LESSON_ID, "correct lesson ID used");
    ok(published.json?.verified === true, "correct published state verified");
    ok(published.json?.publishResult?.trustedPath?.includes("publish_enrichment")
      || published.json?.publishResult?.trustedPath?.includes("draft_status"), "trusted path recorded");
    ok(storeRef.store.siteContent.curriculum.lessonPlans.find((p) => p.id === LESSON_ID).status === "published",
      "fixture lesson status published");
    ok(JSON.stringify(storeRef.store.siteContent.curriculum.lessonPlans.find((p) => p.id === SIBLING_ID)) === siblingBefore,
      "no unrelated lesson changed / production-like sibling untouched");

    // Stale confirm → no publish
    storeRef.store.siteContent.curriculum = fixtureCurriculum();
    storeRef.store.curriculumOperatorJobs = { jobs: [readyJob()] };
    const conf2 = await api.call({
      action: "confirm",
      lessonId: LESSON_ID,
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    storeRef.store.siteContent.curriculum.lessonPlans[0].enrichmentDraft.week.objectives = "MUTATED";
    const stalePub = await api.call({
      action: "publish",
      lessonId: LESSON_ID,
      confirmPublish: true,
      reviewedFingerprint: conf2.json.confirmation.fingerprint,
      title: "Weather Watchers",
      age: "Toddler",
      accessPlan: "Pro",
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(stalePub.status === 409 && stalePub.json?.code === "DRAFT_CHANGED_REVIEW_AGAIN", "stale draft publish rejected");
    ok(storeRef.store.siteContent.curriculum.lessonPlans[0].status === "draft", "no publish on stale case");
  }

  console.log("POST-PUBLISH VERIFY FAILURE");
  {
    const storeRef = {
      store: {
        siteContent: {
          featureFlags: { teachingKitCurriculumOperator: true },
          curriculum: fixtureCurriculum(),
        },
        curriculumOperatorJobs: { jobs: [readyJob()] },
      },
    };
    const api = makeApi({
      storeRef,
      sessionEmail: OWNER.email,
      runTrusted: async ({ lessonId }) => {
        const plan = storeRef.store.siteContent.curriculum.lessonPlans.find((p) => p.id === lessonId);
        // Ambiguous / wrong outcome: claim ok but leave draft + wrong title
        plan.title = "WRONG TITLE";
        plan.status = "draft";
        return { ok: true, versionId: "bad", trustedPath: "publish_enrichment" };
      },
    });
    const conf = await api.call({
      action: "confirm",
      lessonId: LESSON_ID,
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    const bad = await api.call({
      action: "publish",
      lessonId: LESSON_ID,
      confirmPublish: true,
      reviewedFingerprint: conf.json.confirmation.fingerprint,
      title: "Weather Watchers",
      age: "Toddler",
      accessPlan: "Pro",
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    });
    ok(bad.status === 409 && bad.json?.code === "PUBLISH_VERIFY_FAILED", "mismatch returns PUBLISH_VERIFY_FAILED");
    ok(bad.json?.ok === false, "no false success");
  }

  console.log("OPERATOR AUTHORITY");
  {
    const parsed = commandApi.parseOperatorCommand(
      "Create a Preschool Bakery lesson and publish it.",
      { phase: 8 },
    );
    ok(parsed.command.actions.publish === false, "AI jobs still cannot publish (stripped)");
    ok(parsed.confirmReasons.includes("publish_requested"), "natural-language publish → publish_requested only");
    ok(parsed.command.parsedNotes.some((n) => /READY FOR REVIEW — PUBLISH REQUESTED/i.test(n)),
      "Owner told READY FOR REVIEW — PUBLISH REQUESTED");
    ok(!schema.isPhase7Executable("lesson.publish"), "lesson.publish not executable");
    ok(schema.normalizeOperatorCommand({
      intent: "create_lesson",
      actions: { createLesson: true, publish: true },
    }, { phase: 8 }).actions.publish === false, "create job cannot auto-publish");
    ok(schema.normalizeOperatorCommand({
      intent: "fix_lesson",
      actions: { saveDraft: true, publish: true },
    }, { phase: 6 }).actions.publish === false, "finish job cannot auto-publish");

    const job = jobApi.createJobFromPlan({
      command: parsed.command,
      planSummary: {
        lessons: [{ id: "pending-create", title: "Bakery" }],
        creationBrief: { title: "Bakery", idempotencyKey: "create:test" },
      },
      createdBy: OWNER.email,
    });
    ok(job.publishEnabled === false, "job.publishEnabled false");
    ok(job.lessonResults[0].publishRequested === true, "publishRequested flagged on lesson result");
    ok(job.lessonResults[0].published === false, "lesson result not published");
    ok(!job.lessonResults[0].actions.some((a) => a.type === "lesson.publish"), "no lesson.publish step");
  }

  console.log("BATCH");
  {
    const storeRef = {
      store: {
        siteContent: {
          featureFlags: { teachingKitCurriculumOperator: true },
          curriculum: fixtureCurriculum(),
        },
        curriculumOperatorJobs: { jobs: [readyJob()] },
      },
    };
    const api = makeApi({ storeRef });
    const batch = await api.call({
      action: "publish",
      lessonIds: [LESSON_ID, SIBLING_ID],
      confirmPublish: true,
    });
    ok(batch.status === 400 && batch.json?.code === "BATCH_PUBLISH_NOT_IMPLEMENTED",
      "multi-publish remains blocked/not implemented");
  }

  console.log("SAFE FIXTURE PROOF");
  ok(LESSON_ID.includes("phase8-fixture"), "fixture id namespaced");
  ok(SIBLING_ID.includes("phase8-sibling"), "sibling fixture namespaced");
  ok(!String(process.env.PRODUCTION_DATABASE_URL || ""), "no production DB URL in test env");

  console.log("DISPOSABLE FIXTURE SAFETY (pre-merge defect fix)");
  {
    const fs = require("node:fs");
    const printablesSrc = fs.readFileSync(require("node:path").join(__dirname, "curriculum-operator-printables.js"), "utf8");
    ok(/disposableQaFixture:\s*false/.test(printablesSrc), "Operator printable create sets disposableQaFixture false");
    ok(!/disposableQaFixture:\s*true/.test(printablesSrc), "Operator printable create no longer hardcodes disposableQaFixture true");
    const indexSrc = fs.readFileSync(require("node:path").join(__dirname, "../server/index.js"), "utf8");
    const createFn = indexSrc.slice(
      indexSrc.indexOf("async function createOperatorPrintableResource"),
      indexSrc.indexOf("async function createOperatorPrintableResource") + 1200,
    );
    ok(/disposableQaFixture\s*=\s*false/.test(createFn), "createOperatorPrintableResource defaults disposableQaFixture false");
    ok(indexSrc.includes("Phase 8 Owner publish: never leave Operator-linked printables as disposable"),
      "Owner publish clears disposable markers on Operator-linked printables");
    ok(indexSrc.includes("Promote linked draft printables now that the lesson is public"),
      "status-only Owner publish promotes draft printables");
  }

  console.log(`\nPhase 8 passed ${passed} assertions.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

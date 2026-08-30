/**
 * Owner-only AI Curriculum Operator publish API (Phase 8).
 *
 * Separate from Operator job actions. AI jobs never call this.
 * Reuses the trusted enrichment publish / lesson status publish deps.
 */
"use strict";

const ownerPublish = require("../scripts/curriculum-operator-owner-publish.js");
const jobApi = require("../scripts/curriculum-operator-job.js");

const ACTIONS = Object.freeze([
  "eligibility",
  "preview",
  "confirm",
  "publish",
  "verify",
]);

function createCurriculumOperatorOwnerPublishApi(deps) {
  const {
    readJson,
    jsonResponse,
    readStore,
    requireTeachingKitOwnerAdminSession,
    teachingKit,
    normalizeEmail,
    runTrustedOwnerPublish,
    operatorJobStore = null,
  } = deps;

  function requireOwner(request, body, response) {
    const session = requireTeachingKitOwnerAdminSession(request, body, response);
    if (!session) return null;
    const email = normalizeEmail(session.email || "");
    if (!teachingKit.isTeachingKitOwnerPreviewEmail(email)) {
      jsonResponse(response, 403, {
        error: "Owner publish is restricted to the owner admin account.",
        code: ownerPublish.OWNER_PUBLISH_CODES.UNAUTHORIZED,
      });
      return null;
    }
    return { ...session, email };
  }

  function requireFlag(store, response) {
    const flags = store?.siteContent?.featureFlags || {};
    if (!teachingKit.isTeachingKitCurriculumOperatorEnabled(flags)) {
      jsonResponse(response, 404, {
        error: "AI Curriculum Operator is disabled.",
        code: "curriculum_operator_disabled",
      });
      return false;
    }
    return true;
  }

  function loadLessonContext(store, lessonId) {
    const curriculum = store?.siteContent?.curriculum || {};
    const id = ownerPublish.text(lessonId, 160);
    const lesson = (curriculum.lessonPlans || []).find((p) => p && p.id === id) || null;
    const activities = (curriculum.activities || []).filter((a) => a && a.lessonPlanId === id);
    const resources = Array.isArray(curriculum.resources) ? curriculum.resources : [];
    const legacy = jobApi.normalizeOperatorJobStore(store?.curriculumOperatorJobs);
    const bag = operatorJobStore && typeof operatorJobStore.mergeWithLegacyBag === "function"
      ? operatorJobStore.mergeWithLegacyBag(legacy)
      : legacy;
    const jobs = bag.jobs || [];
    return { curriculum, lesson, activities, resources, jobs, id };
  }

  function evaluate(store, body) {
    const lessonId = ownerPublish.text(body.lessonId || body.planId, 160);
    const ctx = loadLessonContext(store, lessonId);
    const eligibility = ownerPublish.evaluatePublishEligibility({
      lesson: ctx.lesson,
      activities: ctx.activities,
      resources: ctx.resources,
      jobs: ctx.jobs,
      expectedLessonId: lessonId,
      ownerReviewStatus: body.ownerReviewStatus,
      publishRequested: body.publishRequested === true,
    });
    return { ctx, eligibility };
  }

  async function handle(request, response) {
    const body = await readJson(request);
    const session = requireOwner(request, body, response);
    if (!session) return;

    const store = readStore();
    if (!requireFlag(store, response)) return;

    const action = ownerPublish.text(body.action, 40).toLowerCase() || "eligibility";
    if (!ACTIONS.includes(action)) {
      jsonResponse(response, 400, {
        error: "Unknown owner-publish action.",
        code: "invalid_action",
        allowed: ACTIONS,
      });
      return;
    }

    if (Array.isArray(body.lessonIds) && body.lessonIds.length > 1) {
      const batch = ownerPublish.rejectBatchPublish(body.lessonIds);
      jsonResponse(response, 400, batch);
      return;
    }

    if (action === "eligibility" || action === "preview") {
      const { eligibility } = evaluate(store, body);
      jsonResponse(response, 200, {
        ok: true,
        action,
        eligible: eligibility.eligible,
        publishEnabled: eligibility.publishEnabled,
        code: eligibility.code,
        ownerReviewStatus: eligibility.ownerReviewStatus,
        blockers: eligibility.blockers,
        summary: eligibility.summary,
        fingerprint: eligibility.fingerprint,
        confirmation: eligibility.eligible
          ? ownerPublish.buildConfirmationPayload(eligibility)
          : null,
        publishRequested: eligibility.publishRequested === true,
        operatorJobId: eligibility.operatorJobId,
        trustedPublishPath: "publish_enrichment + draft_status_publish",
        batchPublishEnabled: false,
        operatorCanPublish: false,
      });
      return;
    }

    if (action === "confirm") {
      const { eligibility } = evaluate(store, body);
      if (!eligibility.eligible) {
        jsonResponse(response, 409, {
          ok: false,
          action,
          code: eligibility.code,
          error: "Lesson is not eligible to publish.",
          blockers: eligibility.blockers,
          summary: eligibility.summary,
        });
        return;
      }
      const confirmation = ownerPublish.buildConfirmationPayload(eligibility);
      jsonResponse(response, 200, {
        ok: true,
        action,
        confirmation,
        fingerprint: eligibility.fingerprint,
        summary: eligibility.summary,
        requireExplicitConfirm: true,
      });
      return;
    }

    if (action === "verify") {
      const lessonId = ownerPublish.text(body.lessonId, 160);
      const ctx = loadLessonContext(store, lessonId);
      const verification = ownerPublish.verifyPublishedState({
        lessonId,
        beforeLesson: body.beforeLesson || null,
        afterLesson: ctx.lesson,
        activities: ctx.activities,
        resources: ctx.resources,
        otherLessonsBefore: body.otherLessonsBefore || [],
        otherLessonsAfter: (ctx.curriculum.lessonPlans || []).filter((p) => p.id !== lessonId),
        expectedTitle: body.expectedTitle,
        expectedAge: body.expectedAge,
        expectedAccessPlan: body.expectedAccessPlan,
        expectedActivityCount: body.expectedActivityCount,
      });
      jsonResponse(response, verification.ok ? 200 : 409, {
        ok: verification.ok,
        action,
        code: verification.code,
        verification,
        lessonPlan: ctx.lesson,
      });
      return;
    }

    // action === "publish"
    const lessonId = ownerPublish.text(body.lessonId || body.planId, 160);
    if (!lessonId) {
      jsonResponse(response, 400, {
        ok: false,
        code: ownerPublish.OWNER_PUBLISH_CODES.LESSON_NOT_FOUND,
        error: "lessonId is required.",
      });
      return;
    }

    // Fresh reload immediately before publish — never trust stale UI.
    const freshStore = readStore();
    const { ctx, eligibility } = evaluate(freshStore, { ...body, lessonId });
    if (!eligibility.eligible) {
      jsonResponse(response, 409, {
        ok: false,
        action: "publish",
        code: eligibility.code,
        error: "Publish eligibility failed on fresh store reload.",
        blockers: eligibility.blockers,
        summary: eligibility.summary,
      });
      return;
    }

    const confirmation = {
      confirmPublish: body.confirmPublish === true,
      reviewedFingerprint: body.reviewedFingerprint || body.fingerprint || "",
      fingerprint: body.reviewedFingerprint || body.fingerprint || "",
      lessonId: body.lessonId || lessonId,
      title: body.title || eligibility.summary?.title,
      age: body.age || eligibility.summary?.age,
      accessPlan: body.accessPlan || eligibility.summary?.accessPlan,
    };
    const fresh = ownerPublish.assertConfirmationStillFresh({
      lesson: ctx.lesson,
      confirmation,
      eligibility,
    });
    if (!fresh.ok) {
      jsonResponse(response, 409, {
        ok: false,
        action: "publish",
        code: fresh.code,
        error: fresh.error,
        summary: eligibility.summary,
      });
      return;
    }

    if (typeof runTrustedOwnerPublish !== "function") {
      jsonResponse(response, 500, {
        ok: false,
        error: "Trusted owner publish path is not wired.",
        code: "trusted_publish_missing",
      });
      return;
    }

    const beforeLesson = JSON.parse(JSON.stringify(ctx.lesson));
    const otherBefore = (ctx.curriculum.lessonPlans || [])
      .filter((p) => p.id !== lessonId)
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        updatedAt: p.updatedAt,
        plan: p.plan,
      }));

    let publishResult;
    try {
      publishResult = await runTrustedOwnerPublish({
        lessonId,
        session,
        reviewedFingerprint: confirmation.reviewedFingerprint,
        expectedTitle: confirmation.title,
        expectedAge: confirmation.age,
        expectedAccessPlan: confirmation.accessPlan,
        operatorJobId: eligibility.operatorJobId || body.operatorJobId || null,
        publishedBy: session.email,
        confirmPublish: true,
        operatorOwnerPublish: true,
      });
    } catch (error) {
      jsonResponse(response, 500, {
        ok: false,
        action: "publish",
        code: "trusted_publish_error",
        error: error?.message || "Trusted publish failed.",
      });
      return;
    }

    if (!publishResult?.ok) {
      jsonResponse(response, publishResult?.statusCode || 409, {
        ok: false,
        action: "publish",
        code: publishResult?.code || "publish_failed",
        error: publishResult?.error || "Publish failed.",
        blockers: publishResult?.blockers,
        publishResult,
      });
      return;
    }

    const afterStore = readStore();
    const afterCtx = loadLessonContext(afterStore, lessonId);
    const verification = ownerPublish.verifyPublishedState({
      lessonId,
      beforeLesson,
      afterLesson: afterCtx.lesson,
      activities: afterCtx.activities,
      resources: afterCtx.resources,
      otherLessonsBefore: otherBefore,
      otherLessonsAfter: (afterCtx.curriculum.lessonPlans || []).filter((p) => p.id !== lessonId),
      expectedTitle: confirmation.title,
      expectedAge: confirmation.age,
      expectedAccessPlan: confirmation.accessPlan,
      expectedActivityCount: eligibility.summary?.activityCount,
    });

    if (!verification.ok) {
      jsonResponse(response, 409, {
        ok: false,
        action: "publish",
        code: ownerPublish.OWNER_PUBLISH_CODES.PUBLISH_VERIFY_FAILED,
        error: "Publish completed but post-publish verification failed. Investigate before retrying.",
        verification,
        publishResult,
        lessonPlan: afterCtx.lesson,
      });
      return;
    }

    jsonResponse(response, 200, {
      ok: true,
      action: "publish",
      code: ownerPublish.OWNER_PUBLISH_CODES.OK,
      published: true,
      verified: true,
      lessonId,
      lessonPlan: afterCtx.lesson,
      publishResult,
      verification,
      audit: {
        publishedBy: session.email,
        lessonId,
        timestamp: verification.publishedAt || new Date().toISOString(),
        reviewedFingerprint: confirmation.reviewedFingerprint,
        operatorJobId: eligibility.operatorJobId || null,
        previousHistoryRef: publishResult?.previousHistoryRef || null,
        versionId: publishResult?.versionId || null,
        trustedPath: publishResult?.trustedPath || "publish_enrichment",
      },
      ui: {
        status: "PUBLISHED",
        publishedAt: verification.publishedAt,
        accessPlan: verification.accessPlan,
        preparedBy: eligibility.operatorJobId
          ? `AI Curriculum Operator job ${eligibility.operatorJobId}`
          : "Owner manual publish",
        verified: true,
      },
    });
  }

  return {
    handle,
    ACTIONS,
    evaluatePublishEligibility: ownerPublish.evaluatePublishEligibility,
  };
}

module.exports = {
  createCurriculumOperatorOwnerPublishApi,
  ACTIONS,
};

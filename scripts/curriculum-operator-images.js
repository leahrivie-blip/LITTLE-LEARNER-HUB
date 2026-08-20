/**
 * AI Curriculum Operator — Phase 3 activity images.
 *
 * Inspect → decide KEEP/GENERATE/REPLACE/NOT_NEEDED → generate via Visual
 * Production helper → persist via enrichment media → attach to enrichmentDraft
 * by verified activity ID → verify. Never publishes. Never touches printables.
 * Does not unlock Visual Production\'s blocked attach endpoint.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const IMAGE_FIELDS = Object.freeze(["setupImageUrl", "exampleImageUrl"]);
const WRITE_DECISIONS = Object.freeze(["GENERATE", "REPLACE"]);
const IMAGE_STEP_STATUSES = Object.freeze([
  "pending",
  "inspecting",
  "generating",
  "uploading",
  "attaching",
  "verifying",
  "success",
  "failed",
  "skipped",
  "retrying",
]);

function text(value, max = 2000) {
  return schema.text(value, max);
}

function loadEnrichment() {
  try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
}

function loadVpImage() {
  try { return require("../server/visual-production-image.js"); } catch (_e) { return null; }
}

function loadEnrichmentMedia() {
  try { return require("../server/enrichment-media.js"); } catch (_e) { return null; }
}

function normalizeDecision(decision) {
  const key = text(decision, 40).toUpperCase().replace(/\s+/g, "_");
  if (key === "KEEP" || key === "KEEP_EXISTING") return "KEEP";
  if (key === "GENERATE") return "GENERATE";
  if (key === "REPLACE") return "REPLACE";
  if (key === "NOT_NEEDED" || key === "NOTNEEDED") return "NOT_NEEDED";
  return "NOT_NEEDED";
}

function primaryFieldForActivity(act, patch, decision) {
  const enrich = loadEnrichment();
  const requirement = enrich?.resolveImageRequirement
    ? enrich.resolveImageRequirement(act, patch)
    : (patch?.imageRequirement || act?.imageRequirement || "recommended");
  const slots = enrich?.imageSlotsForRequirement
    ? enrich.imageSlotsForRequirement(requirement)
    : { needsSetup: true, needsExample: false };
  if (slots.needsExample && !slots.needsSetup) return "exampleImageUrl";
  if (decision === "REPLACE") {
    if (text(patch?.setupImageUrl || act?.setupImageUrl)) return "setupImageUrl";
    if (text(patch?.exampleImageUrl || act?.exampleImageUrl)) return "exampleImageUrl";
  }
  return "setupImageUrl";
}

function assetIdFieldFor(imageField) {
  return imageField === "exampleImageUrl" ? "exampleMediaAssetId" : "setupMediaAssetId";
}

function thumbFieldFor(imageField) {
  return imageField === "exampleImageUrl" ? "exampleImageThumbUrl" : "setupImageThumbUrl";
}

function refineImageDecision(planItem, activity, patch = {}, options = {}) {
  const enrich = loadEnrichment();
  const view = enrich?.activityEnrichmentView
    ? enrich.activityEnrichmentView(activity, patch)
    : {
      setupImageUrl: patch.setupImageUrl || activity?.setupImageUrl,
      exampleImageUrl: patch.exampleImageUrl || activity?.exampleImageUrl,
      imageRequirement: patch.imageRequirement || activity?.imageRequirement,
    };
  const base = normalizeDecision(planItem?.image?.decision || "NOT_NEEDED");
  const reason = text(planItem?.image?.reason, 600);
  const concept = text(planItem?.image?.concept, 800);
  const existingUrl = text(
    planItem?.image?.existingUrl || view.setupImageUrl || view.exampleImageUrl,
    500,
  );
  const activityId = text(planItem?.activityId || activity?.id || activity?.itemId, 160);
  const title = text(planItem?.activityTitle || activity?.title, 180);
  const field = primaryFieldForActivity(activity, patch, base);

  let decision = base;
  let nextReason = reason;

  if (decision === "KEEP" && options.replaceBadImages === true && existingUrl) {
    const looksBroken = /example\.com|placeholder|todo|missing|broken/i.test(existingUrl)
      || existingUrl === "about:blank";
    const looksThemeArt = /cartoon|clipart|stock|decorat|theme[-_]?art|generic[-_]?apple/i.test(existingUrl);
    if (looksBroken || looksThemeArt) {
      decision = "REPLACE";
      nextReason = looksBroken
        ? "Existing image URL looks broken or placeholder; safe to replace after successful attach."
        : "Existing image looks like generic theme art rather than the real activity setup.";
    }
  }

  return {
    activityId,
    activityTitle: title,
    weekday: text(planItem?.weekday || activity?.dayOfWeek, 20),
    field,
    decision,
    reason: nextReason || (decision === "KEEP" ? "Existing activity image is usable." : ""),
    concept: concept || "",
    existingUrl,
    existingMediaAssetId: text(
      patch?.[assetIdFieldFor(field)] || activity?.[assetIdFieldFor(field)],
      160,
    ),
    status: "pending",
  };
}

function buildImageActionsFromAudit(plan, activities, audit, options = {}) {
  const draft = plan?.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? plan.enrichmentDraft
    : {};
  const draftActs = draft.activities || {};
  const byId = new Map(
    schema.asArray(activities).map((a) => [text(a.id || a.itemId, 160), a]),
  );
  const actions = [];
  schema.asArray(audit?.assetPlan).forEach((item) => {
    const activityId = text(item.activityId, 160);
    if (!activityId) return;
    const activity = byId.get(activityId);
    if (!activity) return;
    const patch = draftActs[activityId] || {};
    actions.push(refineImageDecision(item, activity, patch, options));
  });
  return actions;
}

function summarizeImageActions(actions) {
  const counts = { KEEP: 0, GENERATE: 0, REPLACE: 0, NOT_NEEDED: 0, FAILED: 0, SUCCESS: 0 };
  schema.asArray(actions).forEach((a) => {
    const d = normalizeDecision(a.decision);
    if (counts[d] != null) counts[d] += 1;
    if (a.status === "failed") counts.FAILED += 1;
    if (a.status === "success" && WRITE_DECISIONS.includes(d)) counts.SUCCESS += 1;
  });
  return counts;
}

function plannedGenerationCount(actions) {
  return schema.asArray(actions).filter((a) => WRITE_DECISIONS.includes(normalizeDecision(a.decision))).length;
}

function assessImageScope({ actions, lessonCount = 1, limits = {} }) {
  const planned = plannedGenerationCount(actions);
  const hardMax = Number(limits.maxImageGenerations) || schema.DEFAULT_LIMITS.maxImageGenerations;
  const softPerLesson = 8;
  const softMax = Math.max(softPerLesson, Number(lessonCount) * softPerLesson);
  if (planned > hardMax) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Planned ${planned} image generations exceeds hard max ${hardMax}.`,
      planned,
      hardMax,
      softMax,
    };
  }
  if (planned > softMax) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Planned ${planned} image generations exceeds soft max ${softMax} for ${lessonCount} lesson(s).`,
      planned,
      hardMax,
      softMax,
    };
  }
  return { ok: true, planned, hardMax, softMax };
}

function buildActivityImagePrompt({ plan, activity, draftActivity, field, concept }) {
  const enrich = loadEnrichment();
  const view = enrich?.activityEnrichmentView
    ? enrich.activityEnrichmentView(activity, draftActivity || {})
    : activity;
  const briefField = field === "exampleImageUrl" ? "imageBriefExample" : "imageBriefSetup";
  const existingBrief = text(draftActivity?.[briefField] || activity?.[briefField], 800);
  if (existingBrief) return existingBrief;
  if (text(concept, 800)) return text(concept, 800);

  const age = text(plan?.age || activity?.age || view?.ageModifications || "early childhood", 60);
  const title = text(view?.title || activity?.title, 180);
  const materials = text(view?.materials || activity?.materials, 300);
  const setup = text(view?.setup || activity?.setup, 300);
  const steps = text(view?.steps || activity?.steps, 400);
  const objective = text(view?.objective || activity?.objective, 240);
  const safety = text(view?.safetyNotes || activity?.safetyNotes, 200);
  const theme = text(plan?.theme, 80);

  return [
    `Realistic childcare classroom photograph for a ${age} activity.`,
    title ? `Activity: “${title}”.` : "",
    theme ? `Lesson theme: ${theme} (show the activity, not decorative theme art).` : "",
    objective ? `Objective: ${objective}` : "",
    materials ? `Materials visible: ${materials}` : "",
    setup ? `Setup: ${setup}` : "",
    steps ? `Children will: ${steps.slice(0, 280)}` : "",
    safety ? `Safety: ${safety}` : "",
    field === "exampleImageUrl"
      ? "Show a clear in-process or finished example of the activity."
      : "Show a clear, achievable activity setup a teacher could recreate.",
    "Child-height tables or floor space. Slightly imperfect real classroom, not glossy stock photo.",
    "No cartoon characters, no fantasy scenes, no unlisted materials, no tiny unsafe pieces for infants/toddlers.",
    "People optional; prefer setup-focused composition unless hands-in-action helps.",
    "No readable posters or dense text in the image.",
  ].filter(Boolean).join(" ");
}

async function generateActivityImageBuffer({ apiKey, model, prompt, generateFn, mock }) {
  if (typeof generateFn === "function") {
    return generateFn({ apiKey, model, prompt, mock: mock === true });
  }
  const vp = loadVpImage();
  if (!vp?.generateVisualProductionImage) {
    throw new Error("Visual Production image helper is unavailable.");
  }
  const prevMock = process.env.VISUAL_PRODUCTION_MOCK_GENERATE;
  try {
    if (mock === true) process.env.VISUAL_PRODUCTION_MOCK_GENERATE = "1";
    return await vp.generateVisualProductionImage({
      apiKey: apiKey || "mock-key",
      model: model || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      brief: {
        generationPrompt: prompt,
        visualStyle: "REALISTIC_CLASSROOM",
      },
    });
  } finally {
    if (mock === true) {
      if (prevMock == null) delete process.env.VISUAL_PRODUCTION_MOCK_GENERATE;
      else process.env.VISUAL_PRODUCTION_MOCK_GENERATE = prevMock;
    }
  }
}

async function uploadActivityImageBuffer(deps, {
  lessonPlanId,
  activityKey,
  field,
  buffer,
  fileName,
  mimeType,
}) {
  if (!IMAGE_FIELDS.includes(field)) {
    throw new Error(`Unsupported image field: ${field}`);
  }
  const lessonId = text(lessonPlanId, 160);
  const actKey = text(activityKey, 160);
  if (!lessonId || !actKey) throw new Error("lessonPlanId and activityKey required for image upload.");
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("Image buffer missing.");
  }

  if (typeof deps.uploadFn === "function") {
    return deps.uploadFn({
      lessonPlanId: lessonId,
      activityKey: actKey,
      field,
      buffer,
      fileName,
      mimeType,
    });
  }

  const enrichmentMedia = deps.enrichmentMedia || loadEnrichmentMedia();
  if (!enrichmentMedia?.buildEnrichmentVariants || !deps.persistEnrichmentPhotoVariants) {
    throw new Error("Enrichment media upload helpers are not configured.");
  }
  const assetId = enrichmentMedia.enrichmentMediaAssetId();
  const variants = await enrichmentMedia.buildEnrichmentVariants(buffer);
  await deps.persistEnrichmentPhotoVariants({
    assetId,
    lessonPlanId: lessonId,
    activityKey: actKey,
    field,
    fileName: fileName || `${actKey}-${field}.png`,
    variants,
    store: deps.store,
  });
  return {
    mediaAssetId: assetId,
    mediaUrl: enrichmentMedia.enrichmentMediaUrl(assetId, "full"),
    thumbUrl: enrichmentMedia.enrichmentMediaUrl(assetId, "thumb"),
    mimeType: mimeType || "image/png",
  };
}

function attachImageToEnrichmentDraft(draftInput, {
  lessonId,
  expectedLessonId,
  activityId,
  field,
  mediaAssetId,
  mediaUrl,
  thumbUrl,
}) {
  if (text(lessonId, 160) !== text(expectedLessonId, 160)) {
    return { ok: false, code: "wrong_lesson_id", error: "Lesson ID mismatch; refuse attach." };
  }
  const activityKey = text(activityId, 160);
  if (!activityKey) {
    return { ok: false, code: "missing_activity_id", error: "Activity ID required." };
  }
  if (!IMAGE_FIELDS.includes(field)) {
    return { ok: false, code: "bad_field", error: `Unsupported field ${field}` };
  }
  if (!text(mediaUrl, 500) || !text(mediaAssetId, 160)) {
    return { ok: false, code: "missing_media", error: "mediaUrl and mediaAssetId required." };
  }

  const draft = draftInput && typeof draftInput === "object"
    ? JSON.parse(JSON.stringify(draftInput))
    : { week: {}, activities: {} };
  if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};
  if (!draft.activities[activityKey] || typeof draft.activities[activityKey] !== "object") {
    draft.activities[activityKey] = {};
  }
  const prev = { ...draft.activities[activityKey] };
  draft.activities[activityKey][field] = text(mediaUrl, 500);
  draft.activities[activityKey][assetIdFieldFor(field)] = text(mediaAssetId, 160);
  draft.activities[activityKey][thumbFieldFor(field)] = text(thumbUrl, 500);
  draft.updatedAt = new Date().toISOString();
  draft.operatorPhase = 3;

  return {
    ok: true,
    enrichmentDraft: draft,
    previousActivityPatch: prev,
    attached: {
      activityId: activityKey,
      field,
      mediaAssetId: text(mediaAssetId, 160),
      mediaUrl: text(mediaUrl, 500),
    },
  };
}

function verifyAttachedImage({
  beforePlan,
  afterPlan,
  activityId,
  field,
  mediaUrl,
  mediaAssetId,
  untouchedActivityIds = [],
}) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  pass(beforePlan?.id && beforePlan.id === afterPlan?.id, "lesson_id", "Lesson ID unchanged.");
  pass(text(beforePlan?.age) === text(afterPlan?.age), "age", "Age unchanged.");
  pass(
    (beforePlan?.plan === "Pro" ? "Pro" : "Free") === (afterPlan?.plan === "Pro" ? "Pro" : "Free"),
    "access_plan",
    "Access plan unchanged.",
  );
  pass(text(beforePlan?.title) === text(afterPlan?.title), "title", "Title unchanged.");
  pass(afterPlan?.status === beforePlan?.status, "publish_status", "Lesson status unchanged.");

  const draft = afterPlan?.enrichmentDraft || {};
  const act = draft.activities?.[text(activityId, 160)] || {};
  pass(text(act[field], 500) === text(mediaUrl, 500), "media_url", "Intended activity references new media URL.");
  pass(
    text(act[assetIdFieldFor(field)], 160) === text(mediaAssetId, 160),
    "media_asset_id",
    "Intended activity references new media asset id.",
  );

  const beforeDraftActs = beforePlan?.enrichmentDraft?.activities || {};
  schema.asArray(untouchedActivityIds).forEach((id) => {
    const key = text(id, 160);
    if (key === text(activityId, 160)) return;
    const beforeUrl = text(beforeDraftActs[key]?.setupImageUrl || beforeDraftActs[key]?.exampleImageUrl, 500);
    const afterUrl = text(
      (draft.activities?.[key]?.setupImageUrl || draft.activities?.[key]?.exampleImageUrl),
      500,
    );
    pass(beforeUrl === afterUrl, `untouched_${key}`, `Unrelated activity ${key} image unchanged.`);
  });

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed };
}

async function runImagePlanForLesson({
  plan,
  activities,
  audit,
  limits,
  replaceBadImages = false,
  touchImages = true,
  callGenerate,
  uploadFn,
  persistEnrichmentPhotoVariants,
  enrichmentMedia,
  store,
  apiKey,
  model,
  mockGenerate = false,
  alreadySucceededKeys = new Set(),
} = {}) {
  if (touchImages === false) {
    return {
      ok: true,
      skipped: true,
      actions: [],
      counts: summarizeImageActions([]),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
    };
  }

  const actions = buildImageActionsFromAudit(plan, activities, audit, { replaceBadImages });
  const scope = assessImageScope({ actions, lessonCount: 1, limits: limits || {} });
  if (!scope.ok) {
    return {
      ok: false,
      code: scope.code,
      error: scope.reason,
      actions,
      counts: summarizeImageActions(actions),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      scope,
    };
  }

  let draft = plan?.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
    : { week: {}, activities: {} };
  if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};

  let generations = 0;
  const hardMax = Number(limits?.maxImageGenerations) || schema.DEFAULT_LIMITS.maxImageGenerations;
  const results = [];

  for (const action of actions) {
    const decision = normalizeDecision(action.decision);
    const idempotencyKey = `image:${plan.id}:${action.activityId}:${action.field}`;
    if (alreadySucceededKeys.has(idempotencyKey)) {
      results.push({
        ...action,
        decision,
        status: "skipped",
        reason: `${action.reason} (already succeeded; resume skip)`,
        idempotencyKey,
      });
      continue;
    }

    if (decision === "KEEP" || decision === "NOT_NEEDED" || !WRITE_DECISIONS.includes(decision)) {
      results.push({ ...action, decision, status: "skipped", idempotencyKey });
      continue;
    }

    if (generations >= hardMax) {
      results.push({
        ...action,
        decision,
        status: "failed",
        error: "maxImageGenerations reached",
        retryable: true,
        idempotencyKey,
      });
      continue;
    }

    const existingUrl = text(action.existingUrl, 500);
    const existingAssetId = text(action.existingMediaAssetId, 160);
    const patchBefore = draft.activities[action.activityId]
      ? { ...draft.activities[action.activityId] }
      : {};

    try {
      const activity = schema.asArray(activities).find(
        (a) => text(a.id || a.itemId, 160) === text(action.activityId, 160),
      );
      if (!activity) throw new Error(`Activity ${action.activityId} not found on lesson.`);

      const prompt = buildActivityImagePrompt({
        plan,
        activity,
        draftActivity: draft.activities[action.activityId] || {},
        field: action.field,
        concept: action.concept,
      });

      const generated = await generateActivityImageBuffer({
        apiKey,
        model,
        prompt,
        generateFn: callGenerate,
        mock: mockGenerate,
      });
      generations += 1;

      const uploaded = await uploadActivityImageBuffer({
        uploadFn,
        persistEnrichmentPhotoVariants,
        enrichmentMedia,
        store,
      }, {
        lessonPlanId: plan.id,
        activityKey: action.activityId,
        field: action.field,
        buffer: generated.buffer,
        fileName: `${action.activityId}-${action.field}.png`,
        mimeType: generated.mimeType || "image/png",
      });

      const attached = attachImageToEnrichmentDraft(draft, {
        lessonId: plan.id,
        expectedLessonId: plan.id,
        activityId: action.activityId,
        field: action.field,
        mediaAssetId: uploaded.mediaAssetId,
        mediaUrl: uploaded.mediaUrl,
        thumbUrl: uploaded.thumbUrl,
      });
      if (!attached.ok) throw new Error(attached.error || "attach failed");
      draft = attached.enrichmentDraft;

      results.push({
        ...action,
        decision,
        status: "success",
        idempotencyKey,
        promptPreview: text(prompt, 200),
        mediaAssetId: uploaded.mediaAssetId,
        mediaUrl: uploaded.mediaUrl,
        thumbUrl: uploaded.thumbUrl,
        previousUrl: existingUrl,
      });
    } catch (error) {
      if (existingUrl) {
        if (!draft.activities[action.activityId]) draft.activities[action.activityId] = {};
        draft.activities[action.activityId][action.field] = existingUrl;
        if (existingAssetId) {
          draft.activities[action.activityId][assetIdFieldFor(action.field)] = existingAssetId;
        }
      } else if (Object.keys(patchBefore).length) {
        draft.activities[action.activityId] = patchBefore;
      } else {
        delete draft.activities[action.activityId];
      }
      results.push({
        ...action,
        decision,
        status: "failed",
        error: text(error?.message || "image action failed", 400),
        retryable: true,
        idempotencyKey,
        preservedExisting: Boolean(existingUrl),
      });
    }
  }

  return {
    ok: results.every((r) => r.status !== "failed"),
    partial: results.some((r) => r.status === "failed") && results.some((r) => r.status === "success"),
    actions: results,
    counts: summarizeImageActions(results),
    enrichmentDraft: draft,
    changed: results.some((r) => r.status === "success"),
    generations,
    scope,
  };
}

module.exports = {
  IMAGE_FIELDS,
  WRITE_DECISIONS,
  IMAGE_STEP_STATUSES,
  normalizeDecision,
  refineImageDecision,
  buildImageActionsFromAudit,
  summarizeImageActions,
  plannedGenerationCount,
  assessImageScope,
  buildActivityImagePrompt,
  generateActivityImageBuffer,
  uploadActivityImageBuffer,
  attachImageToEnrichmentDraft,
  verifyAttachedImage,
  runImagePlanForLesson,
  primaryFieldForActivity,
};

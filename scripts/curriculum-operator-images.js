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
/** Soft per-lesson generation budget — ordinary finish must self-budget to this, not SCOPE_REVIEW. */
const SOFT_IMAGE_GENERATIONS_PER_LESSON = 8;
const IMAGE_BUDGET_DEFER_REASON = "image_budget_priority";
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

function softImageGenerationBudget(lessonCount = 1) {
  const n = Math.max(1, Number(lessonCount) || 1);
  return Math.max(SOFT_IMAGE_GENERATIONS_PER_LESSON, n * SOFT_IMAGE_GENERATIONS_PER_LESSON);
}

/**
 * True when the owner explicitly asked for more-than-soft-budget full image coverage.
 * Normal create/finish must NOT set this — those self-budget instead of SCOPE_REVIEW.
 */
function commandRequestsFullImageCoverage(command) {
  const raw = text(command?.rawCommand || command?.command?.rawCommand || "", 2000);
  if (!raw) return false;
  return /\b(unique\s+)?image(s)?\s+for\s+(all|every|each)\b/i.test(raw)
    || /\b(all|every|each)\s+(\d+\s+)?activit(y|ies).{0,40}\bimage/i.test(raw)
    || /\bgenerate\s+(a\s+)?(unique\s+)?image\s+for\s+all\b/i.test(raw)
    || /\bimage\s+for\s+all\s+\d*\s*activit/i.test(raw);
}

/**
 * Lower number = higher priority. Deterministic; no randomness.
 * 1–2 REPLACE (broken then theme-art), 3–7 GENERATE by instructional need, 99 other.
 */
function imageWritePriorityScore(action, activity = {}) {
  const decision = normalizeDecision(action?.decision);
  const reason = text(action?.reason, 600);
  const title = text(action?.activityTitle || activity?.title, 180);
  const category = text(activity?.activityCategory || activity?.domain, 80);
  const materials = text(activity?.materials || action?.materials, 300);
  const setup = text(activity?.setup || action?.setup, 300);
  const steps = text(activity?.steps, 400);
  const blob = `${title} ${category} ${materials} ${setup} ${steps} ${reason}`.toLowerCase();

  if (decision === "REPLACE") {
    if (/broken|placeholder|missing|about:blank/i.test(reason) || /broken|placeholder/i.test(blob)) {
      return 1;
    }
    return 2;
  }
  if (decision !== "GENERATE") return 99;

  if (/difficult|unfamiliar|complicated|invitation to play|sensory bin|stem|lab(oratory)?|multi[- ]?step setup|unusual/i.test(blob)
    || /invitation to play|sensory|stem|science/i.test(category)) {
    return 3;
  }
  if (/finished|process art|example|mural|collage|craft|construction|visual final/i.test(blob)
    || /art|creative/i.test(category)) {
    return 4;
  }
  if (/layout|arrangement|tray|station|many materials|complex materials|counted pieces/i.test(blob)
    || wordCountish(materials) >= 12) {
    return 5;
  }
  if (/dramatic play|role.?play|bakery|cafe|market|classroom implementation|teacher.?value/i.test(blob)) {
    return 6;
  }
  return 7;
}

function wordCountish(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

/**
 * Apply soft generation budget to planned image actions.
 * KEEP / existing NOT_NEEDED unchanged. Excess GENERATE/REPLACE → NOT_NEEDED
 * with typed reason image_budget_priority. Deterministic priority + stable tie-break.
 */
function applyImageGenerationSoftBudget(actions, options = {}) {
  const list = schema.asArray(actions).map((a) => ({ ...a }));
  const softMax = Math.max(0, Number(options.softMax) || softImageGenerationBudget(options.lessonCount || 1));
  const activityOrder = new Map(
    schema.asArray(options.activities).map((a, index) => [text(a.id || a.itemId, 160), index]),
  );
  const byId = new Map(
    schema.asArray(options.activities).map((a) => [text(a.id || a.itemId, 160), a]),
  );

  const writeIndexes = [];
  list.forEach((action, index) => {
    if (WRITE_DECISIONS.includes(normalizeDecision(action.decision))) writeIndexes.push(index);
  });

  const ranked = writeIndexes
    .map((index) => {
      const action = list[index];
      const id = text(action.activityId, 160);
      const activity = byId.get(id) || {};
      return {
        index,
        activityId: id,
        priority: imageWritePriorityScore(action, activity),
        order: activityOrder.has(id) ? activityOrder.get(id) : 9999,
        idKey: id,
      };
    })
    .sort((a, b) => (
      a.priority - b.priority
      || a.order - b.order
      || String(a.idKey).localeCompare(String(b.idKey))
      || a.index - b.index
    ));

  const selected = ranked.slice(0, softMax);
  const deferred = ranked.slice(softMax);
  const selectedIds = selected.map((row) => row.activityId);
  const deferredIds = deferred.map((row) => row.activityId);
  const reasonByActivityId = {};

  deferred.forEach((row) => {
    const action = list[row.index];
    const priorDecision = normalizeDecision(action.decision);
    list[row.index] = {
      ...action,
      decision: "NOT_NEEDED",
      priorDecision,
      priorityScore: row.priority,
      reason: `${IMAGE_BUDGET_DEFER_REASON}: deferred optional ${priorDecision} (priority ${row.priority}) to respect soft image budget ${softMax}.`,
      budgetDeferred: true,
    };
    reasonByActivityId[row.activityId] = IMAGE_BUDGET_DEFER_REASON;
  });
  selected.forEach((row) => {
    list[row.index] = {
      ...list[row.index],
      priorityScore: row.priority,
      budgetSelected: true,
    };
    reasonByActivityId[row.activityId] = text(list[row.index].reason, 200) || "selected";
  });

  const plannedBefore = writeIndexes.length;
  const finalGenerateCount = list.filter((a) => normalizeDecision(a.decision) === "GENERATE").length;
  const finalReplaceCount = list.filter((a) => normalizeDecision(a.decision) === "REPLACE").length;
  const finalNotNeededCount = list.filter((a) => normalizeDecision(a.decision) === "NOT_NEEDED").length;
  const plannedKeepCount = list.filter((a) => normalizeDecision(a.decision) === "KEEP").length;

  return {
    actions: list,
    diagnostics: {
      imageCandidatesTotal: plannedBefore,
      imageBudget: softMax,
      plannedKeepCount,
      plannedGenerateCountBeforeBudget: schema.asArray(actions)
        .filter((a) => normalizeDecision(a.decision) === "GENERATE").length,
      plannedReplaceCountBeforeBudget: schema.asArray(actions)
        .filter((a) => normalizeDecision(a.decision) === "REPLACE").length,
      budgetSelectedActivityIds: selectedIds,
      budgetDeferredActivityIds: deferredIds,
      finalGenerateCount,
      finalReplaceCount,
      finalNotNeededCount,
      imageBudgetApplied: deferred.length > 0,
      imageBudgetReasonByActivityId: reasonByActivityId,
    },
  };
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

function parseProtectedActivityIds(command = {}) {
  const raw = text(command?.rawCommand || "", 4000);
  const ids = new Set(schema.asArray(command?.protectedActivityIds).map((id) => text(id, 160)).filter(Boolean));
  const re = /\b(cur-act-[a-f0-9]{8,})\b/gi;
  let match = re.exec(raw);
  while (match) {
    ids.add(text(match[1], 160));
    match = re.exec(raw);
  }
  if (/giant floor drawing/i.test(raw)) ids.add("cur-act-0a02697c73ccac85");
  if (/sponge squish painting/i.test(raw)) ids.add("cur-act-c36723f91d3a9637");
  return ids;
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
  const protectedIds = options.protectedActivityIds instanceof Set
    ? options.protectedActivityIds
    : parseProtectedActivityIds(options.command || {});

  if (protectedIds.has(activityId)) {
    return {
      activityId,
      activityTitle: title,
      weekday: text(planItem?.weekday || activity?.dayOfWeek, 20),
      field,
      decision: "PROTECTED_KEEP",
      reason: "Owner-protected activity image — do not replace in this job.",
      concept: "",
      existingUrl,
      existingMediaAssetId: text(
        patch?.[assetIdFieldFor(field)] || activity?.[assetIdFieldFor(field)],
        160,
      ),
      status: "pending",
    };
  }

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
    } else if (options.auditExistingImages === true) {
      decision = "REPLACE";
      nextReason = "Owner requested audit/replace of existing activity images; queued for realistic replacement.";
    }
  }

  if (decision === "NOT_NEEDED" && existingUrl && options.replaceBadImages === true) {
    decision = "KEEP";
    nextReason = "Existing image present — owner requested audit; keeping until visual QA replacement passes.";
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
  const counts = {
    KEEP: 0,
    GENERATE: 0,
    REPLACE: 0,
    NOT_NEEDED: 0,
    FAILED: 0,
    SUCCESS: 0,
    PROTECTED_KEEP: 0,
  };
  schema.asArray(actions).forEach((a) => {
    const d = normalizeDecision(a.decision);
    if (d === "PROTECTED_KEEP") {
      counts.PROTECTED_KEEP += 1;
      counts.KEEP += 1;
      return;
    }
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
  const softMax = softImageGenerationBudget(lessonCount);
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
  const promptBuilder = require("./visual-prompt-builder.js");
  const bundle = promptBuilder.buildVisualPrompt({
    assetMode: field === "exampleImageUrl"
      ? promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_EXAMPLE
      : promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    ageBand: plan?.age || activity?.age || view?.ageModifications,
    lessonTitle: plan?.title,
    lessonTheme: plan?.theme,
    activityTitle: view?.title || activity?.title,
    activityCategory: view?.activityCategory || activity?.category,
    objective: view?.objective || activity?.objective,
    description: view?.description || activity?.description,
    materials: view?.materials || activity?.materials,
    setup: view?.setup || activity?.setup,
    steps: view?.steps || activity?.steps,
    safetyNotes: view?.safetyNotes || activity?.safetyNotes,
    ownerBrief: existingBrief || text(concept, 800),
    imagePurpose: field === "exampleImageUrl" ? "example" : "setup",
  });
  return bundle.generationPrompt;
}

function buildActivityImagePromptBundle(params) {
  const prompt = buildActivityImagePrompt(params);
  const promptBuilder = require("./visual-prompt-builder.js");
  return {
    ...promptBuilder.buildVisualPrompt({
      assetMode: params.field === "exampleImageUrl"
        ? promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_EXAMPLE
        : promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
      ageBand: params.plan?.age || params.activity?.age,
      lessonTitle: params.plan?.title,
      lessonTheme: params.plan?.theme,
      activityTitle: params.activity?.title,
      activityCategory: params.activity?.category,
      objective: params.activity?.objective,
      description: params.activity?.description,
      materials: params.activity?.materials,
      setup: params.activity?.setup,
      steps: params.activity?.steps,
      safetyNotes: params.activity?.safetyNotes,
      ownerBrief: text(params.draftActivity?.[params.field === "exampleImageUrl" ? "imageBriefExample" : "imageBriefSetup"]
        || params.activity?.[params.field === "exampleImageUrl" ? "imageBriefExample" : "imageBriefSetup"]
        || params.concept, 800),
      imagePurpose: params.field === "exampleImageUrl" ? "example" : "setup",
    }),
    generationPrompt: prompt,
  };
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

/**
 * Canonical lesson-editor media URLs (public path — not /api/admin/media/...).
 * Visibility must be promoted separately so the public path can serve the asset.
 */
function canonicalPublicActivityImageUrls(mediaAssetId, enrichmentMediaApi) {
  const id = text(mediaAssetId, 160);
  if (!id) return null;
  const api = enrichmentMediaApi || loadEnrichmentMedia();
  if (!api?.publicEnrichmentMediaUrl) return null;
  if (api.isEnrichmentMediaAssetId && !api.isEnrichmentMediaAssetId(id)) return null;
  return {
    mediaAssetId: id,
    mediaUrl: text(api.publicEnrichmentMediaUrl(id, "full"), 500),
    thumbUrl: text(api.publicEnrichmentMediaUrl(id, "thumb"), 500),
  };
}

function isAdminOnlyEnrichmentMediaUrl(url) {
  return /\/api\/admin\/media\/enrichment-photos\//i.test(text(url, 500));
}

function commandRequestsConnectedAutoApply(command) {
  const actions = command?.actions || {};
  if (actions.planOnly === true) return false;
  if (actions.publish === true) return false;
  if (actions.connectedAutoApply === false) return false;
  return actions.connectedAutoApply === true || actions.connectedUpgrade === true;
}

/**
 * Apply successful image actions onto editable draft lesson records
 * (activities + dailyPlans). Does not publish. Uses public media URLs only.
 */
function applySuccessfulImageActionsToLessonRecords({
  plan,
  activities,
  actions,
  enrichmentMediaApi,
} = {}) {
  const nextPlan = plan && typeof plan === "object" ? JSON.parse(JSON.stringify(plan)) : null;
  if (!nextPlan) {
    return { ok: false, code: "missing_plan", error: "Lesson plan required.", activities: [], applied: [] };
  }
  const nextActivities = schema.asArray(activities).map((a) => ({ ...a }));
  const applied = [];
  const byId = new Map(nextActivities.map((a, index) => [text(a.id, 160), index]));

  schema.asArray(actions).forEach((action) => {
    if (action?.status !== "success") return;
    if (!WRITE_DECISIONS.includes(normalizeDecision(action.decision))) return;
    const activityId = text(action.activityId, 160);
    const field = IMAGE_FIELDS.includes(action.field) ? action.field : "setupImageUrl";
    const publicUrls = canonicalPublicActivityImageUrls(action.mediaAssetId, enrichmentMediaApi);
    if (!publicUrls?.mediaUrl) return;
    if (isAdminOnlyEnrichmentMediaUrl(publicUrls.mediaUrl)) return;

    const idx = byId.get(activityId);
    if (idx == null) return;
    const act = nextActivities[idx];
    const patch = {
      [field]: publicUrls.mediaUrl,
      [assetIdFieldFor(field)]: publicUrls.mediaAssetId,
      [thumbFieldFor(field)]: publicUrls.thumbUrl,
    };
    nextActivities[idx] = { ...act, ...patch };

    const itemId = text(act.itemId, 80);
    const daily = nextPlan.dailyPlans && typeof nextPlan.dailyPlans === "object"
      ? nextPlan.dailyPlans
      : {};
    Object.keys(daily).forEach((day) => {
      const items = schema.asArray(daily[day]?.items);
      if (!items.length) return;
      daily[day] = {
        ...(daily[day] || {}),
        items: items.map((item) => {
          const match = text(item.itemId, 80) === itemId
            || text(item.id, 160) === activityId
            || (text(item.title, 180) && text(item.title, 180) === text(act.title, 180));
          if (!match) return item;
          return { ...item, ...patch };
        }),
      };
    });
    nextPlan.dailyPlans = daily;
    applied.push({
      activityId,
      field,
      mediaAssetId: publicUrls.mediaAssetId,
      mediaUrl: publicUrls.mediaUrl,
      thumbUrl: publicUrls.thumbUrl,
      previousUrl: text(action.previousUrl || act[field], 500),
    });
  });

  return {
    ok: true,
    plan: nextPlan,
    activities: nextActivities,
    applied,
  };
}

/**
 * Remove successful image field mutations from enrichmentDraft so connected
 * auto-apply does not re-strand admin URLs after a direct lesson save.
 */
function stripSuccessfulImageFieldsFromEnrichmentDraft(draftInput, actions) {
  const draft = draftInput && typeof draftInput === "object"
    ? JSON.parse(JSON.stringify(draftInput))
    : { week: {}, activities: {} };
  if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};

  schema.asArray(actions).forEach((action) => {
    if (action?.status !== "success") return;
    const activityId = text(action.activityId, 160);
    if (!activityId || !draft.activities[activityId]) return;
    const field = IMAGE_FIELDS.includes(action.field) ? action.field : "setupImageUrl";
    const patch = draft.activities[activityId];
    delete patch[field];
    delete patch[assetIdFieldFor(field)];
    delete patch[thumbFieldFor(field)];
    if (!Object.keys(patch).length) delete draft.activities[activityId];
  });
  return draft;
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

const NON_MEDIA_ACTIVITY_KEYS = Object.freeze([
  "objective",
  "materials",
  "setup",
  "steps",
  "safetyNotes",
  "title",
  "description",
  "teacherTips",
  "extensions",
  "cleanup",
  "imageRequirement",
]);

/**
 * Build the explicit allowed media mutation set for one image job lesson.
 * Only GENERATE/REPLACE writes for the planned activityId+field are allowed.
 */
function buildAllowedImageMutations(actions = []) {
  const allowed = [];
  schema.asArray(actions).forEach((action) => {
    const decision = normalizeDecision(action.decision);
    if (!WRITE_DECISIONS.includes(decision)) return;
    if (action.status === "skipped" && /already succeeded/i.test(action.reason || "")) {
      // Resume skip — media already attached; treat as allowed target, not unexpected.
      allowed.push({
        activityId: text(action.activityId, 160),
        field: action.field,
        decision,
        mediaUrl: text(action.mediaUrl, 500),
        mediaAssetId: text(action.mediaAssetId, 160),
        resumeSkip: true,
      });
      return;
    }
    if (action.status === "failed") return;
    if (action.status !== "success") return;
    allowed.push({
      activityId: text(action.activityId, 160),
      field: action.field,
      decision,
      mediaUrl: text(action.mediaUrl, 500),
      mediaAssetId: text(action.mediaAssetId, 160),
      previousUrl: text(action.previousUrl, 500),
      resumeSkip: false,
    });
  });
  return allowed;
}

function activityPatchMediaFingerprint(patch = {}) {
  return IMAGE_FIELDS.map((f) => [
    f,
    text(patch?.[f], 500),
    text(patch?.[assetIdFieldFor(f)], 160),
    text(patch?.[thumbFieldFor(f)], 500),
  ].join("|")).join("::");
}

function activityPatchNonMediaFingerprint(patch = {}) {
  return NON_MEDIA_ACTIVITY_KEYS.map((k) => `${k}=${text(patch?.[k], 800)}`).join("||");
}

/**
 * Lesson-level image job verification using an explicit allowed-mutation set.
 * Legitimate GENERATE/REPLACE writes in the same job are allowed; anything else
 * (KEEP/NOT_NEEDED media, non-media fields, unexpected activity media) is not.
 */
function verifyImageJobDraft({ beforePlan, afterPlan, actions = [] }) {
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
  pass(
    JSON.stringify(schema.asArray(beforePlan?.resourceIds)) === JSON.stringify(schema.asArray(afterPlan?.resourceIds)),
    "resource_ids",
    "Printable/resource IDs unchanged.",
  );

  // Published body image fields on catalog activities must not be required to change —
  // Operator only writes enrichmentDraft. Compare published weekly body stamp when present.
  pass(
    text(beforePlan?.weeklyOverview, 500) === text(afterPlan?.weeklyOverview, 500),
    "published_weekly_overview",
    "Published weeklyOverview body unchanged.",
  );
  pass(
    text(beforePlan?.objectives, 500) === text(afterPlan?.objectives, 500),
    "published_objectives",
    "Published objectives body unchanged.",
  );

  const beforeActs = beforePlan?.enrichmentDraft?.activities && typeof beforePlan.enrichmentDraft.activities === "object"
    ? beforePlan.enrichmentDraft.activities
    : {};
  const afterActs = afterPlan?.enrichmentDraft?.activities && typeof afterPlan.enrichmentDraft.activities === "object"
    ? afterPlan.enrichmentDraft.activities
    : {};

  const allowed = buildAllowedImageMutations(actions);
  const allowedKeys = new Set(allowed.map((a) => `${a.activityId}::${a.field}`));

  allowed.forEach((mut) => {
    if (mut.resumeSkip) return;
    const act = afterActs[mut.activityId] || {};
    pass(Boolean(afterActs[mut.activityId]), `exists_${mut.activityId}`, `Activity ${mut.activityId} still exists in draft.`);
    pass(
      text(act[mut.field], 500) === text(mut.mediaUrl, 500),
      `media_${mut.activityId}`,
      `Activity ${mut.activityId} references intended media URL.`,
    );
    pass(
      text(act[assetIdFieldFor(mut.field)], 160) === text(mut.mediaAssetId, 160),
      `asset_${mut.activityId}`,
      `Activity ${mut.activityId} references intended media asset id.`,
    );
  });

  const allIds = new Set([
    ...Object.keys(beforeActs),
    ...Object.keys(afterActs),
    ...schema.asArray(actions).map((a) => text(a.activityId, 160)).filter(Boolean),
  ]);

  allIds.forEach((activityId) => {
    const beforePatch = beforeActs[activityId] || {};
    const afterPatch = afterActs[activityId] || {};
    const decision = normalizeDecision(
      schema.asArray(actions).find((a) => text(a.activityId, 160) === activityId)?.decision,
    );

    // Non-media fields must never change during image ops.
    pass(
      activityPatchNonMediaFingerprint(beforePatch) === activityPatchNonMediaFingerprint(afterPatch),
      `non_media_${activityId}`,
      `Non-media fields unchanged for ${activityId}.`,
    );

    IMAGE_FIELDS.forEach((field) => {
      const key = `${activityId}::${field}`;
      if (allowedKeys.has(key)) return;
      const beforeUrl = text(beforePatch[field], 500);
      const afterUrl = text(afterPatch[field], 500);
      const beforeAsset = text(beforePatch[assetIdFieldFor(field)], 160);
      const afterAsset = text(afterPatch[assetIdFieldFor(field)], 160);
      pass(
        beforeUrl === afterUrl && beforeAsset === afterAsset,
        `media_locked_${activityId}_${field}`,
        `Media field ${field} on ${activityId} not in allowed mutation set.`,
      );
    });

    if (decision === "KEEP" || decision === "NOT_NEEDED") {
      pass(
        activityPatchMediaFingerprint(beforePatch) === activityPatchMediaFingerprint(afterPatch),
        `noop_${activityId}`,
        `${decision} activity ${activityId} media is a true no-op.`,
      );
    }
  });

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    failed,
    allowedMutations: allowed,
  };
}

/**
 * Verify connected auto-apply image persistence onto editable lesson activity records.
 * enrichmentDraft image fields are intentionally stripped after direct save.
 */
function verifyConnectedImageJobRecords({
  beforePlan,
  afterPlan,
  afterActivities = [],
  actions = [],
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
  pass(afterPlan?.status === beforePlan?.status, "publish_status", "Lesson status unchanged (not published).");

  const byId = new Map(
    schema.asArray(afterActivities).map((a) => [text(a.id, 160), a]),
  );
  schema.asArray(actions).forEach((action) => {
    if (action.status !== "success") return;
    const act = byId.get(text(action.activityId, 160)) || {};
    const field = IMAGE_FIELDS.includes(action.field) ? action.field : "setupImageUrl";
    pass(
      text(act[field], 500) === text(action.mediaUrl, 500),
      `live_media_${action.activityId}`,
      `Live activity ${action.activityId} has intended public media URL.`,
    );
    pass(
      text(act[assetIdFieldFor(field)], 160) === text(action.mediaAssetId, 160),
      `live_asset_${action.activityId}`,
      `Live activity ${action.activityId} has intended media asset id.`,
    );
    pass(
      !isAdminOnlyEnrichmentMediaUrl(act[field]),
      `not_admin_url_${action.activityId}`,
      `Live activity ${action.activityId} does not use admin-only media URL.`,
    );
    const draftAct = afterPlan?.enrichmentDraft?.activities?.[text(action.activityId, 160)] || {};
    pass(
      !text(draftAct[field], 500),
      `draft_image_cleared_${action.activityId}`,
      `Successful image cleared from enrichmentDraft for ${action.activityId}.`,
    );
  });

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed };
}

let visualAttachQaGate = null;
function loadVisualAttachQaGate() {
  if (visualAttachQaGate) return visualAttachQaGate;
  try {
    visualAttachQaGate = require("./visual-attach-quality-gate.js");
  } catch (_error) {
    visualAttachQaGate = null;
  }
  return visualAttachQaGate;
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
  visualAnalyzeFn,
  skipVisualAttachQa = false,
  preferPublicMediaUrls = false,
  alreadySucceededKeys = new Set(),
  lessonCount = 1,
  command = null,
  forceFullImageCoverage = false,
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

  const rawActions = buildImageActionsFromAudit(plan, activities, audit, {
    replaceBadImages,
    auditExistingImages: replaceBadImages === true && touchImages !== false,
    command,
    protectedActivityIds: parseProtectedActivityIds(command || {}),
  });
  const softMax = softImageGenerationBudget(lessonCount);
  const hardMax = Number(limits?.maxImageGenerations) || schema.DEFAULT_LIMITS.maxImageGenerations;
  const plannedBeforeBudget = plannedGenerationCount(rawActions);
  const explicitFullCoverage = forceFullImageCoverage === true
    || commandRequestsFullImageCoverage(command);

  // Explicit owner request for above-soft full coverage still requires scope review.
  if (explicitFullCoverage && plannedBeforeBudget > softMax) {
    const scope = assessImageScope({
      actions: rawActions,
      lessonCount: Math.max(1, Number(lessonCount) || 1),
      limits: limits || {},
    });
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      error: scope.reason || `Explicit full-image request planned ${plannedBeforeBudget} generations above soft max ${softMax}.`,
      actions: rawActions,
      counts: summarizeImageActions(rawActions),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      scope: { ...scope, explicitFullCoverage: true },
      imageBudgetDiagnostics: {
        imageCandidatesTotal: plannedBeforeBudget,
        imageBudget: softMax,
        plannedKeepCount: rawActions.filter((a) => normalizeDecision(a.decision) === "KEEP").length,
        plannedGenerateCountBeforeBudget: rawActions.filter((a) => normalizeDecision(a.decision) === "GENERATE").length,
        plannedReplaceCountBeforeBudget: rawActions.filter((a) => normalizeDecision(a.decision) === "REPLACE").length,
        budgetSelectedActivityIds: [],
        budgetDeferredActivityIds: [],
        finalGenerateCount: rawActions.filter((a) => normalizeDecision(a.decision) === "GENERATE").length,
        finalReplaceCount: rawActions.filter((a) => normalizeDecision(a.decision) === "REPLACE").length,
        finalNotNeededCount: rawActions.filter((a) => normalizeDecision(a.decision) === "NOT_NEEDED").length,
        imageBudgetApplied: false,
        explicitFullCoverage: true,
      },
    };
  }

  // Ordinary finish/create: self-budget optional GENERATE/REPLACE down to soft max.
  const budgeted = applyImageGenerationSoftBudget(rawActions, {
    softMax,
    lessonCount,
    activities,
  });
  const actions = budgeted.actions;
  const imageBudgetDiagnostics = budgeted.diagnostics;
  const plannedAfterBudget = plannedGenerationCount(actions);

  // Hard max still blocks after budgeting — never silently truncate past hard safety/cost cap.
  if (plannedAfterBudget > hardMax) {
    const scope = assessImageScope({
      actions,
      lessonCount: Math.max(1, Number(lessonCount) || 1),
      limits: limits || {},
    });
    return {
      ok: false,
      code: scope.code || "SCOPE_REVIEW_REQUIRED",
      error: scope.reason,
      actions,
      counts: summarizeImageActions(actions),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      scope,
      imageBudgetDiagnostics: {
        ...imageBudgetDiagnostics,
        blockedByHardMax: true,
      },
    };
  }

  const scope = assessImageScope({
    actions,
    lessonCount: Math.max(1, Number(lessonCount) || 1),
    limits: limits || {},
  });
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
      imageBudgetDiagnostics,
    };
  }

  let draft = plan?.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
    : { week: {}, activities: {} };
  if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};

  let generations = 0;
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
        mediaUrl: text(draft.activities?.[action.activityId]?.[action.field], 500),
        mediaAssetId: text(
          draft.activities?.[action.activityId]?.[assetIdFieldFor(action.field)],
          160,
        ),
      });
      continue;
    }

    if (decision === "KEEP" || decision === "NOT_NEEDED" || decision === "PROTECTED_KEEP"
      || !WRITE_DECISIONS.includes(decision)) {
      results.push({ ...action, decision, status: "skipped", idempotencyKey });
      continue;
    }

    // Enforce hard cap BEFORE spending another generation call.
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
      // Exact activity ID only — never title/index fallback.
      const activityId = text(action.activityId, 160);
      const activity = schema.asArray(activities).find((a) => text(a.id, 160) === activityId);
      if (!activity) {
        throw new Error(`Activity ${activityId} not found by exact id; refuse image attach.`);
      }

      const promptBundle = buildActivityImagePromptBundle({
        plan,
        activity,
        draftActivity: draft.activities[activityId] || {},
        field: action.field,
        concept: action.concept,
      });
      const prompt = promptBundle.generationPrompt;

      const generated = await generateActivityImageBuffer({
        apiKey,
        model,
        prompt,
        generateFn: callGenerate,
        mock: mockGenerate,
      });
      generations += 1;

      const enrich = loadEnrichment();
      const view = enrich?.activityEnrichmentView
        ? enrich.activityEnrichmentView(activity, draft.activities[activityId] || {})
        : activity;
      const qaGate = loadVisualAttachQaGate();
      if (qaGate?.assessVisualAttachQuality) {
        const visualQa = await qaGate.assessVisualAttachQuality({
          buffer: generated.buffer,
          mimeType: generated.mimeType || "image/png",
          context: {
            kind: "activity_photo",
            assetMode: promptBundle.assetMode,
            activityTitle: view?.title || activity?.title,
            materials: view?.materials || activity?.materials,
            setup: view?.setup || activity?.setup,
            steps: view?.steps || activity?.steps,
            ageBand: plan?.age || activity?.age || view?.ageModifications,
            imagePurpose: action.field === "exampleImageUrl" ? "example" : "setup",
            generationPrompt: prompt,
          },
          analyzeFn: visualAnalyzeFn,
          apiKey,
          model: process.env.LLH_OPERATOR_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
          mock: mockGenerate,
          skip: skipVisualAttachQa === true,
        });
        if (!visualQa.ok) {
          const qaError = new Error(visualQa.error || "Visual attach QA blocked generated activity image.");
          qaError.visualQaBlocked = true;
          qaError.visualQa = visualQa;
          throw qaError;
        }
      }

      const uploaded = await uploadActivityImageBuffer({
        uploadFn,
        persistEnrichmentPhotoVariants,
        enrichmentMedia,
        store,
      }, {
        lessonPlanId: plan.id,
        activityKey: activityId,
        field: action.field,
        buffer: generated.buffer,
        fileName: `${activityId}-${action.field}.png`,
        mimeType: generated.mimeType || "image/png",
      });

      const usePublic = preferPublicMediaUrls === true
        || commandRequestsConnectedAutoApply(command);
      const publicUrls = usePublic
        ? canonicalPublicActivityImageUrls(uploaded.mediaAssetId, enrichmentMedia || loadEnrichmentMedia())
        : null;
      const attachUrls = publicUrls?.mediaUrl
        ? publicUrls
        : {
          mediaAssetId: uploaded.mediaAssetId,
          mediaUrl: uploaded.mediaUrl,
          thumbUrl: uploaded.thumbUrl,
        };

      const attached = attachImageToEnrichmentDraft(draft, {
        lessonId: plan.id,
        expectedLessonId: plan.id,
        activityId,
        field: action.field,
        mediaAssetId: attachUrls.mediaAssetId,
        mediaUrl: attachUrls.mediaUrl,
        thumbUrl: attachUrls.thumbUrl,
      });
      if (!attached.ok) throw new Error(attached.error || "attach failed");
      draft = attached.enrichmentDraft;

      results.push({
        ...action,
        decision,
        status: "success",
        idempotencyKey,
        promptPreview: text(prompt, 200),
        assetMode: promptBundle.assetMode,
        mediaAssetId: attachUrls.mediaAssetId,
        mediaUrl: attachUrls.mediaUrl,
        thumbUrl: attachUrls.thumbUrl,
        previousUrl: existingUrl,
        usedPublicMediaUrl: Boolean(publicUrls?.mediaUrl),
      });
    } catch (error) {
      // REPLACE/GENERATE failure: restore prior working image; never leave blank if one existed.
      if (existingUrl) {
        if (!draft.activities[action.activityId]) draft.activities[action.activityId] = {};
        draft.activities[action.activityId][action.field] = existingUrl;
        if (existingAssetId) {
          draft.activities[action.activityId][assetIdFieldFor(action.field)] = existingAssetId;
        }
        const prevThumb = text(patchBefore[thumbFieldFor(action.field)], 500);
        if (prevThumb) {
          draft.activities[action.activityId][thumbFieldFor(action.field)] = prevThumb;
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
        code: error?.visualQaBlocked ? "visual_qa_blocked" : undefined,
        visualQa: error?.visualQa || undefined,
        retryable: !error?.visualQaBlocked,
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
    imageBudgetDiagnostics,
  };
}

module.exports = {
  IMAGE_FIELDS,
  WRITE_DECISIONS,
  IMAGE_STEP_STATUSES,
  SOFT_IMAGE_GENERATIONS_PER_LESSON,
  IMAGE_BUDGET_DEFER_REASON,
  NON_MEDIA_ACTIVITY_KEYS,
  normalizeDecision,
  refineImageDecision,
  buildImageActionsFromAudit,
  parseProtectedActivityIds,
  summarizeImageActions,
  plannedGenerationCount,
  softImageGenerationBudget,
  commandRequestsFullImageCoverage,
  imageWritePriorityScore,
  applyImageGenerationSoftBudget,
  assessImageScope,
  buildActivityImagePrompt,
  buildActivityImagePromptBundle,
  generateActivityImageBuffer,
  uploadActivityImageBuffer,
  attachImageToEnrichmentDraft,
  canonicalPublicActivityImageUrls,
  isAdminOnlyEnrichmentMediaUrl,
  commandRequestsConnectedAutoApply,
  applySuccessfulImageActionsToLessonRecords,
  stripSuccessfulImageFieldsFromEnrichmentDraft,
  verifyAttachedImage,
  buildAllowedImageMutations,
  verifyImageJobDraft,
  verifyConnectedImageJobRecords,
  runImagePlanForLesson,
  primaryFieldForActivity,
};

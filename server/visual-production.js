/**
 * Owner-only Visual Production API.
 *
 * Stores VisualBrief records in an isolated top-level store collection.
 * Never mutates lesson plans, activity images, printables, resource IDs,
 * URLs, metadata, publish state, or Free/Pro access.
 */
"use strict";

const crypto = require("node:crypto");
const model = require("../scripts/visual-production-brief.js");

const ACTIONS = Object.freeze([
  "plan",
  "list",
  "get",
  "approve",
  "needs-review",
  "ready-for-review",
  "update",
  "generate",
  "attach",
]);

/**
 * @param {object} deps
 */
function createVisualProductionApi(deps) {
  const {
    readJson,
    jsonResponse,
    readStore,
    writeStoreAsync,
    requireTeachingKitOwnerAdminSession,
    teachingKit,
    normalizeEmail,
    normalizedCurriculumStore,
  } = deps;

  function requireOwner(request, body, response) {
    const session = requireTeachingKitOwnerAdminSession(request, body, response);
    if (!session) return null;
    const email = normalizeEmail(session.email || "");
    if (!teachingKit.isTeachingKitOwnerPreviewEmail(email)) {
      jsonResponse(response, 403, {
        error: "Visual Production is restricted to the owner account.",
        code: "teaching_kit_owner_required",
      });
      return null;
    }
    return session;
  }

  function readVisualProduction(store) {
    return model.normalizeVisualProductionStore(store?.visualProduction);
  }

  function writeVisualProduction(store, production, stamp) {
    store.visualProduction = model.normalizeVisualProductionStore({
      ...production,
      updatedAt: stamp || production.updatedAt || new Date().toISOString(),
    });
  }

  function flattenDailyActivities(plan) {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const items = [];
    days.forEach((day) => {
      const dayItems = Array.isArray(plan?.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items : [];
      dayItems.forEach((item) => {
        if (!item) return;
        items.push({
          id: item.id || item.sourceKey || item.itemId || "",
          itemId: item.itemId || "",
          title: item.title || "",
          setupImageUrl: item.setupImageUrl || "",
          exampleImageUrl: item.exampleImageUrl || "",
          setupMediaAssetId: item.setupMediaAssetId || "",
          exampleMediaAssetId: item.exampleMediaAssetId || "",
        });
      });
    });
    return items;
  }

  function lessonCatalog(store, lessonId) {
    const curriculum = normalizedCurriculumStore(store?.siteContent?.curriculum);
    const plan = (curriculum.lessonPlans || []).find((item) => String(item?.id || "") === lessonId) || null;
    const fromStore = (curriculum.activities || []).filter((item) => String(item?.lessonPlanId || "") === lessonId);
    const fromDaily = flattenDailyActivities(plan);
    const byKey = new Map();
    fromDaily.concat(fromStore).forEach((item) => {
      const key = String(item.itemId || item.id || item.title || "");
      if (!key) return;
      byKey.set(key, item);
    });
    return { plan, activities: Array.from(byKey.values()), curriculum };
  }

  function snapshotLessonAssets(plan, activities) {
    const acts = Array.isArray(activities) ? activities : [];
    return {
      lessonStatus: plan?.status || "",
      accessPlan: plan?.plan || "",
      coverImageUrl: plan?.coverImageUrl || "",
      resourceIds: Array.isArray(plan?.resourceIds) ? plan.resourceIds.slice() : [],
      activityImages: acts.map((item) => ({
        id: item.id || "",
        itemId: item.itemId || "",
        setupImageUrl: item.setupImageUrl || "",
        exampleImageUrl: item.exampleImageUrl || "",
        setupMediaAssetId: item.setupMediaAssetId || "",
        exampleMediaAssetId: item.exampleMediaAssetId || "",
      })),
    };
  }

  function assertAssetsUnchanged(before, after) {
    return JSON.stringify(before) === JSON.stringify(after);
  }

  async function handle(request, response) {
    const body = await readJson(request);
    const session = requireOwner(request, body, response);
    if (!session) return;

    const action = String(body?.action || "").trim();
    if (!ACTIONS.includes(action)) {
      jsonResponse(response, 400, {
        error: "Unknown visual production action.",
        allowed: ACTIONS.slice(),
      });
      return;
    }

    const store = readStore();
    const production = readVisualProduction(store);
    const now = new Date().toISOString();

    if (action === "list") {
      const lessonId = String(body?.lessonId || "").trim();
      const briefs = production.briefs.filter((item) => !lessonId || item.lessonId === lessonId);
      jsonResponse(response, 200, {
        ok: true,
        lessonId,
        cards: briefs.map((item) => model.toReviewCard(item)),
        updatedAt: production.updatedAt,
      });
      return;
    }

    if (action === "get") {
      const id = String(body?.id || body?.briefId || "").trim();
      const brief = production.briefs.find((item) => item.id === id);
      if (!brief) {
        jsonResponse(response, 404, { error: "Visual brief not found." });
        return;
      }
      jsonResponse(response, 200, { ok: true, card: model.toReviewCard(brief), brief });
      return;
    }

    if (action === "plan") {
      const lessonId = String(body?.lessonId || "").trim();
      const instruction = String(body?.instruction || body?.instructions || "").trim();
      if (!lessonId) {
        jsonResponse(response, 400, { error: "lessonId is required." });
        return;
      }
      if (!instruction) {
        jsonResponse(response, 400, { error: "Visual instruction text is required." });
        return;
      }
      const { plan, activities } = lessonCatalog(store, lessonId);
      if (!plan) {
        jsonResponse(response, 404, { error: "Lesson plan not found. Import the lesson with Master Paste first." });
        return;
      }
      const beforeAssets = snapshotLessonAssets(plan, activities);
      const created = model.createVisualBriefsFromInstructions(instruction, {
        lessonId,
        activities,
        now,
      }).map((brief) => model.normalizeVisualBrief({
        ...brief,
        id: `vb-${crypto.randomBytes(8).toString("hex")}`,
      }, { now }));
      production.briefs = production.briefs.concat(created);
      writeVisualProduction(store, production, now);
      await writeStoreAsync(store);
      const afterCatalog = lessonCatalog(store, lessonId);
      const unchanged = assertAssetsUnchanged(beforeAssets, snapshotLessonAssets(afterCatalog.plan, afterCatalog.activities));
      jsonResponse(response, 200, {
        ok: true,
        plannedOnly: true,
        generationStarted: false,
        attached: false,
        lessonAssetsUnchanged: unchanged,
        cards: created.map((item) => model.toReviewCard(item)),
        message: "Planned visuals are ready for review. Nothing was generated or attached.",
      });
      return;
    }

    const briefId = String(body?.id || body?.briefId || "").trim();
    const index = production.briefs.findIndex((item) => item.id === briefId);
    if (index < 0) {
      jsonResponse(response, 404, { error: "Visual brief not found." });
      return;
    }
    const current = production.briefs[index];
    const { plan, activities } = lessonCatalog(store, current.lessonId);
    const beforeAssets = snapshotLessonAssets(plan, activities);

    if (action === "update") {
      const patched = model.applyVisualBriefPatch(current, body?.patch || body?.brief || {});
      if (!patched.ok) {
        jsonResponse(response, 400, { error: patched.error, card: model.toReviewCard(current) });
        return;
      }
      production.briefs[index] = patched.brief;
      writeVisualProduction(store, production, now);
      await writeStoreAsync(store);
      jsonResponse(response, 200, { ok: true, card: model.toReviewCard(patched.brief) });
      return;
    }

    if (action === "approve") {
      const moved = model.transitionVisualBriefStatus(current, "APPROVED", {
        confirmApprove: body?.confirmApprove === true,
        now,
      });
      if (!moved.ok) {
        jsonResponse(response, 400, { error: moved.error, card: model.toReviewCard(current) });
        return;
      }
      production.briefs[index] = moved.brief;
      writeVisualProduction(store, production, now);
      await writeStoreAsync(store);
      jsonResponse(response, 200, { ok: true, card: model.toReviewCard(moved.brief) });
      return;
    }

    if (action === "needs-review") {
      const moved = model.transitionVisualBriefStatus(current, "NEEDS_REVIEW", { now });
      if (!moved.ok) {
        jsonResponse(response, 400, { error: moved.error, card: model.toReviewCard(current) });
        return;
      }
      production.briefs[index] = moved.brief;
      writeVisualProduction(store, production, now);
      await writeStoreAsync(store);
      jsonResponse(response, 200, { ok: true, card: model.toReviewCard(moved.brief) });
      return;
    }

    if (action === "ready-for-review") {
      const moved = model.transitionVisualBriefStatus(current, "READY_FOR_REVIEW", { now });
      if (!moved.ok) {
        jsonResponse(response, 400, { error: moved.error, card: model.toReviewCard(current) });
        return;
      }
      production.briefs[index] = moved.brief;
      writeVisualProduction(store, production, now);
      await writeStoreAsync(store);
      jsonResponse(response, 200, { ok: true, card: model.toReviewCard(moved.brief) });
      return;
    }

    if (action === "generate") {
      const afterCatalog = lessonCatalog(store, current.lessonId);
      jsonResponse(response, 409, {
        ok: false,
        blocked: true,
        code: "generation_not_started",
        error: current.status === "APPROVED" && body?.confirmGenerate === true
          ? "Pixel generation is gated and is not executed in this workflow. Review the planned prompt first; generation is a later explicit step."
          : "Show and approve the planned visual before any generation action.",
        card: model.toReviewCard(current),
        lessonAssetsUnchanged: assertAssetsUnchanged(beforeAssets, snapshotLessonAssets(afterCatalog.plan, afterCatalog.activities)),
      });
      return;
    }

    if (action === "attach") {
      const afterCatalog = lessonCatalog(store, current.lessonId);
      jsonResponse(response, 409, {
        ok: false,
        blocked: true,
        code: "attach_blocked",
        error: "Existing images and printables are never attached or replaced automatically. Identify the exact asset for replacement in a later explicit step.",
        card: model.toReviewCard(current),
        lessonAssetsUnchanged: assertAssetsUnchanged(beforeAssets, snapshotLessonAssets(afterCatalog.plan, afterCatalog.activities)),
      });
      return;
    }
  }

  return { handle, ACTIONS, readVisualProduction };
}

/**
 * Preserve visualProduction briefs when a stale store clone is written.
 *
 * @param {object} incomingStore
 * @param {object} [storeCache]
 */
function mergeStorePreserveVisualProduction(incomingStore, storeCache) {
  if (!incomingStore || typeof incomingStore !== "object") return incomingStore;
  const cached = model.normalizeVisualProductionStore(storeCache?.visualProduction);
  const incoming = Object.prototype.hasOwnProperty.call(incomingStore, "visualProduction")
    ? model.normalizeVisualProductionStore(incomingStore.visualProduction)
    : null;
  if (!incoming) {
    if (!cached.briefs.length) return incomingStore;
    return { ...incomingStore, visualProduction: cached };
  }
  const byId = new Map();
  function keepNewer(item) {
    if (!item?.id) return;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      return;
    }
    const existingMs = Date.parse(existing.updatedAt || "") || 0;
    const nextMs = Date.parse(item.updatedAt || "") || 0;
    if (nextMs >= existingMs) byId.set(item.id, item);
  }
  cached.briefs.forEach(keepNewer);
  incoming.briefs.forEach(keepNewer);
  const updatedAt = incoming.updatedAt && (!cached.updatedAt || incoming.updatedAt >= cached.updatedAt)
    ? incoming.updatedAt
    : (cached.updatedAt || incoming.updatedAt);
  return {
    ...incomingStore,
    visualProduction: { briefs: Array.from(byId.values()), updatedAt },
  };
}

module.exports = {
  createVisualProductionApi,
  mergeStorePreserveVisualProduction,
};

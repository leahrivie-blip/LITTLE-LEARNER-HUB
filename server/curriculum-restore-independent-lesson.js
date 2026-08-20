/**
 * Restore a replaced lesson as a NEW independent lesson from a paste_replace
 * history snapshot, rehoming archived originals. Never mutates the source lesson
 * record (the lesson that currently owns the colliding ID).
 */
"use strict";

const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function remapLessonScopedKeys(value, fromLessonId, toLessonId) {
  const fromId = text(fromLessonId);
  const toId = text(toLessonId);
  if (!fromId || !toId || fromId === toId) return value;
  const fromPrefix = `${fromId}:`;
  const toPrefix = `${toId}:`;
  if (typeof value === "string") {
    if (value === fromId) return toId;
    if (value.startsWith(fromPrefix)) return toPrefix + value.slice(fromPrefix.length);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapLessonScopedKeys(item, fromId, toId));
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach((key) => {
      const nextKey = key === fromId
        ? toId
        : (key.startsWith(fromPrefix) ? toPrefix + key.slice(fromPrefix.length) : key);
      out[nextKey] = remapLessonScopedKeys(value[key], fromId, toId);
    });
    return out;
  }
  return value;
}

function fail(code, error, extra = {}) {
  return { ok: false, code, error, ...extra };
}

/**
 * @param {object} input
 * @returns {object}
 */
function restoreIndependentLessonFromPasteReplaceSnapshot(input = {}) {
  const curriculum = input.curriculum && typeof input.curriculum === "object" ? input.curriculum : {};
  const sourceLessonId = text(input.sourceLessonId);
  const now = text(input.now) || new Date().toISOString();
  if (!sourceLessonId) return fail("missing_source_lesson_id", "sourceLessonId is required.");

  const plans = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
  const activities = Array.isArray(curriculum.activities) ? curriculum.activities : [];
  const resources = Array.isArray(curriculum.resources) ? curriculum.resources : [];
  const source = plans.find((item) => item && item.id === sourceLessonId);
  if (!source) return fail("source_lesson_not_found", "Source lesson was not found.");

  const history = Array.isArray(source.enrichmentPublishHistory) ? source.enrichmentPublishHistory : [];
  const versionId = text(input.historyVersionId);
  const entry = versionId
    ? history.find((item) => item && item.versionId === versionId)
    : history.find((item) => item && item.kind === "paste_replace" && item.snapshot && item.snapshot.dailyPlans);
  if (!entry || !entry.snapshot || !entry.snapshot.dailyPlans || !Array.isArray(entry.snapshot.activities)) {
    return fail("snapshot_unavailable", "No paste_replace snapshot with dailyPlans and activities is available.");
  }
  const snapshot = entry.snapshot;
  const expectedTitle = text(input.expectedSnapshotTitle);
  const expectedAge = text(input.expectedSnapshotAge);
  if (!expectedTitle || !expectedAge) {
    return fail("missing_expected_identity", "expectedSnapshotTitle and expectedSnapshotAge are required.");
  }
  if (text(snapshot.title) !== expectedTitle || text(snapshot.age) !== expectedAge) {
    return fail("snapshot_identity_mismatch", "History snapshot does not match the expected lesson identity.");
  }

  const newLessonId = text(input.newLessonId);
  if (!newLessonId) return fail("missing_new_lesson_id", "newLessonId is required.");
  if (newLessonId === sourceLessonId) {
    return fail("new_id_must_differ", "The restored lesson must receive a new ID. The source lesson ID cannot be reused.");
  }
  if (plans.some((item) => item && item.id === newLessonId)) {
    return fail("new_lesson_id_exists", "That new lesson ID already exists.");
  }

  const liveById = new Map(activities.filter((item) => item && item.id).map((item) => [item.id, item]));
  const rehomed = [];
  for (const snapAct of snapshot.activities) {
    if (!snapAct || !snapAct.id) {
      return fail("snapshot_activity_incomplete", "Snapshot activity is missing an id.");
    }
    const live = liveById.get(snapAct.id);
    if (!live) {
      return fail("archived_activity_missing", `Archived activity ${snapAct.id} was not found.`);
    }
    if (text(live.title) !== text(snapAct.title)
      || text(live.itemId) !== text(snapAct.itemId)
      || text(live.dayOfWeek) !== text(snapAct.dayOfWeek)) {
      return fail(
        "archived_activity_mismatch",
        `Activity ${snapAct.id} no longer matches the snapshot identity (title/itemId/weekday).`,
      );
    }
    if (text(live.lessonPlanId) !== sourceLessonId) {
      return fail("activity_wrong_parent", `Activity ${snapAct.id} is not attached to the source lesson.`);
    }
    if (text(live.status) !== "archived") {
      return fail("activity_not_archived", `Activity ${snapAct.id} is not archived and will not be moved.`);
    }
    rehomed.push({
      ...cloneJson(live),
      lessonPlanId: newLessonId,
      sourceKey: `${newLessonId}:${live.itemId}`,
      status: "draft",
      publishedAt: "",
      updatedAt: now,
    });
  }

  const sourceDraftActs = source.enrichmentDraft && typeof source.enrichmentDraft.activities === "object"
    && !Array.isArray(source.enrichmentDraft.activities)
    ? source.enrichmentDraft.activities
    : {};
  const photoDraft = {};
  const photosRestored = [];
  const photosUnlinked = [];
  (Array.isArray(input.verifiedPhotoMaps) ? input.verifiedPhotoMaps : []).forEach((row) => {
    const activityId = text(row && row.activityId);
    const activityTitle = text(row && row.activityTitle);
    const field = text(row && row.field);
    const mediaAssetId = text(row && row.mediaAssetId);
    const act = rehomed.find((item) => item.id === activityId);
    if (!act || text(act.title) !== activityTitle) {
      photosUnlinked.push({
        activityId,
        activityTitle,
        field,
        mediaAssetId,
        reason: "activity_name_or_id_mismatch",
      });
      return;
    }
    if (field !== "setupImageUrl" && field !== "exampleImageUrl") {
      photosUnlinked.push({
        activityId,
        activityTitle,
        field,
        mediaAssetId,
        reason: "unsupported_field",
      });
      return;
    }
    const draft = sourceDraftActs[activityId] || (act.itemId ? sourceDraftActs[act.itemId] : null);
    const mediaField = field === "exampleImageUrl" ? "exampleMediaAssetId" : "setupMediaAssetId";
    if (!draft || typeof draft !== "object" || text(draft[mediaField]) !== mediaAssetId) {
      photosUnlinked.push({
        activityId,
        activityTitle,
        field,
        mediaAssetId,
        reason: "media_asset_not_verified",
      });
      return;
    }
    const copied = cloneJson(draft);
    photoDraft[act.id] = copied;
    if (act.itemId) photoDraft[act.itemId] = cloneJson(copied);
    act[field] = text(draft[field]) || act[field] || "";
    act[mediaField] = mediaAssetId;
    if (field === "exampleImageUrl") {
      act.exampleImageThumbUrl = text(draft.exampleImageThumbUrl) || act.exampleImageThumbUrl || "";
    } else {
      act.setupImageThumbUrl = text(draft.setupImageThumbUrl) || act.setupImageThumbUrl || "";
    }
    photosRestored.push({
      activityId: act.id,
      activityTitle: act.title,
      field,
      mediaAssetId,
    });
  });

  const dailyPlans = remapLessonScopedKeys(cloneJson(snapshot.dailyPlans), sourceLessonId, newLessonId);
  const byItemId = new Map(rehomed.map((item) => [item.itemId, item]));
  WEEKDAYS.forEach((day) => {
    const items = Array.isArray(dailyPlans[day] && dailyPlans[day].items) ? dailyPlans[day].items : [];
    items.forEach((item) => {
      const match = byItemId.get(text(item && item.itemId));
      if (!match) return;
      item.sourceKey = match.sourceKey;
      if (match.setupImageUrl) item.setupImageUrl = match.setupImageUrl;
      if (match.exampleImageUrl) item.exampleImageUrl = match.exampleImageUrl;
      if (match.setupMediaAssetId) item.setupMediaAssetId = match.setupMediaAssetId;
      if (match.exampleMediaAssetId) item.exampleMediaAssetId = match.exampleMediaAssetId;
    });
  });

  const enrichmentDraft = remapLessonScopedKeys(cloneJson(snapshot.enrichmentDraft || {}), sourceLessonId, newLessonId)
    || {};
  enrichmentDraft.activities = {
    ...(enrichmentDraft.activities && typeof enrichmentDraft.activities === "object" ? enrichmentDraft.activities : {}),
    ...photoDraft,
  };
  enrichmentDraft.updatedAt = now;

  const linkResourceIds = (Array.isArray(input.linkResourceIds) ? input.linkResourceIds : [])
    .map((id) => text(id))
    .filter(Boolean);
  const linkedResources = [];
  for (const resourceId of linkResourceIds) {
    const resource = resources.find((item) => item && item.id === resourceId);
    if (!resource) {
      return fail("resource_not_found", `Resource ${resourceId} was not found.`);
    }
    linkedResources.push({
      ...cloneJson(resource),
      lessonPlanIds: [...new Set([...(resource.lessonPlanIds || []), newLessonId])],
      updatedAt: now,
    });
  }

  const newPlan = {
    id: newLessonId,
    title: snapshot.title,
    age: snapshot.age,
    theme: snapshot.theme || "",
    weeklyOverview: snapshot.weeklyOverview || "",
    objectives: snapshot.objectives || "",
    weeklyMaterials: snapshot.weeklyMaterials || "",
    familyConnection: snapshot.familyConnection || "",
    observationOpportunities: snapshot.observationOpportunities || "",
    dailyPlans,
    enrichmentDraft,
    status: "draft",
    plan: "Free",
    resourceIds: linkedResources.map((item) => item.id),
    activityIds: rehomed.map((item) => item.id),
    coverImageUrl: text(input.coverImageUrl),
    coverImageAlt: text(input.coverImageAlt),
    coverImageSource: text(input.coverImageSource),
    coverImagePosition: text(input.coverImagePosition) || "center",
    createdAt: now,
    updatedAt: now,
    publishedAt: "",
  };

  return {
    ok: true,
    newLessonId,
    sourceLessonId,
    historyVersionId: entry.versionId || "",
    recoveredActivityCount: rehomed.length,
    photosRestored,
    photosUnlinked,
    autoPublished: false,
    curriculum: {
      lessonPlans: [newPlan],
      activities: rehomed,
      resources: linkedResources,
    },
    touchedLessonPlanIds: [newLessonId],
    touchedActivityIds: rehomed.map((item) => item.id),
    touchedResourceIds: linkedResources.map((item) => item.id),
    now,
  };
}

module.exports = {
  remapLessonScopedKeys,
  restoreIndependentLessonFromPasteReplaceSnapshot,
};

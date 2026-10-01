/**
 * Production QA: enrichment draft-null prep + verification (no operator logic).
 */
"use strict";

const enrichment = require("./teaching-kit-enrichment.js");

const TEXTURE_ACT_ID = "cur-act-9481b70e98c38e65";

/**
 * @param {Record<string, unknown>} siteJson
 * @returns {string}
 */
function siteContentStamp(siteJson) {
  const root = siteJson && typeof siteJson === "object" ? siteJson : {};
  const nested = root.siteContent && typeof root.siteContent === "object" ? root.siteContent : {};
  return String(
    root.siteContentUpdatedAt
    || nested.updatedAt
    || root.updatedAt
    || "",
  ).trim();
}

/**
 * @param {Record<string, unknown>} curriculum
 * @param {string} lessonPlanId
 * @param {string} activityId
 */
function findLessonAndActivity(curriculum, lessonPlanId, activityId) {
  const plans = Array.isArray(curriculum?.lessonPlans) ? curriculum.lessonPlans : [];
  const plan = plans.find((p) => p && p.id === lessonPlanId) || null;
  const activities = Array.isArray(curriculum?.activities) ? curriculum.activities : [];
  const activity = activities.find((a) => a && a.id === activityId && a.lessonPlanId === lessonPlanId) || null;
  return { plan, activity };
}

/**
 * Payload for owner draft clearing setup image (approved QA prep only).
 * @returns {{ activities: Record<string, { setupImageUrl: null, setupMediaAssetId: null, setupImageThumbUrl: null }> }}
 */
function textureDraftNullPrepPatch(activityId = TEXTURE_ACT_ID) {
  const id = String(activityId || "").trim();
  return {
    activities: {
      [id]: {
        setupImageUrl: null,
        setupMediaAssetId: null,
        setupImageThumbUrl: null,
      },
    },
  };
}

/**
 * After enrichment_draft save + reload, verify Act 3 draft-null precedence.
 *
 * API note: sanitizeEnrichmentDraftPhotos maps null setupImageUrl → "" via
 * sanitizedEnrichmentPhotoRef; literal JSON null may not round-trip. Effective
 * missing is authoritative for operator GENERATE.
 *
 * @returns {{
 *   ok: boolean,
 *   ownsSetupImageUrlKey: boolean,
 *   storedSetupImageUrl: unknown,
 *   literalNull: boolean,
 *   normalizedEmptyString: boolean,
 *   effectiveSetupImageUrl: string,
 *   effectiveImageMissing: boolean,
 *   normalizationNote: string,
 * }}
 */
function verifyTextureDraftNullPrecedence({ plan, activity, activityId = TEXTURE_ACT_ID }) {
  const id = String(activityId || "").trim();
  const draftActs = plan?.enrichmentDraft?.activities;
  const patch = draftActs && typeof draftActs === "object" && !Array.isArray(draftActs)
    ? draftActs[id]
    : null;
  const ownsSetupImageUrlKey = Boolean(
    patch
    && typeof patch === "object"
    && Object.prototype.hasOwnProperty.call(patch, "setupImageUrl"),
  );
  const storedSetupImageUrl = ownsSetupImageUrlKey ? patch.setupImageUrl : undefined;
  const literalNull = storedSetupImageUrl === null;
  const normalizedEmptyString = storedSetupImageUrl === "";
  const view = enrichment.activityEnrichmentView(activity || {}, patch && typeof patch === "object" ? patch : {});
  const effectiveSetupImageUrl = String(view.setupImageUrl || "");
  const effectiveImageMissing = effectiveSetupImageUrl === "";

  let normalizationNote = "";
  if (literalNull) {
    normalizationNote = "Persisted setupImageUrl is JSON null.";
  } else if (normalizedEmptyString) {
    normalizationNote =
      "API normalized explicit null to empty string on setupImageUrl; effective image is still cleared.";
  } else if (!ownsSetupImageUrlKey) {
    normalizationNote = "Draft patch does not own setupImageUrl.";
  } else {
    normalizationNote = `Unexpected stored setupImageUrl type/value: ${String(storedSetupImageUrl)}`;
  }

  const ok = ownsSetupImageUrlKey && effectiveImageMissing && (literalNull || normalizedEmptyString);

  return {
    ok,
    ownsSetupImageUrlKey,
    storedSetupImageUrl,
    literalNull,
    normalizedEmptyString,
    effectiveSetupImageUrl,
    effectiveImageMissing,
    normalizationNote,
  };
}

module.exports = {
  TEXTURE_ACT_ID,
  siteContentStamp,
  findLessonAndActivity,
  textureDraftNullPrepPatch,
  verifyTextureDraftNullPrecedence,
};

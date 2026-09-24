"use strict";

const schema = require("./curriculum-operator-schema.js");

const MAX_RETRIES = 3;

function assetKey(type, action) {
  return `${type}:${schema.text(action?.idempotencyKey, 240)}`;
}

function failedAssets(sourceJob, lessonId) {
  const lesson = schema.asArray(sourceJob?.lessonResults).find((row) => row.lessonId === lessonId);
  if (!lesson) return [];
  return [
    ...schema.asArray(lesson.imageActions).map((action) => ({ type: "image", action })),
    ...schema.asArray(lesson.printableActions).map((action) => ({ type: "printable", action })),
  ].filter(({ action }) => action?.status === "failed" && action.retryable !== false
    && action.approved !== true && action.approvalStatus !== "approved");
}

function validateRequest({ sourceJob, ownerId, sessionId, lessonId, selectedAssetIds, selectedAssetTypes, retryKey, authorization, retries = [] } = {}) {
  const owner = schema.text(ownerId, 160).toLowerCase();
  if (!owner || owner !== schema.text(sourceJob?.createdBy, 160).toLowerCase()) return { ok: false, code: "retry_owner_mismatch" };
  if (!schema.text(sessionId, 100) || authorization !== true) return { ok: false, code: "retry_authorization_required" };
  const lesson = schema.asArray(sourceJob?.lessonResults).find((row) => row.lessonId === lessonId);
  if (!lesson) return { ok: false, code: "retry_lesson_mismatch" };
  const ids = [...new Set(schema.asArray(selectedAssetIds).map((id) => schema.text(id, 240)).filter(Boolean))];
  const types = new Set(schema.asArray(selectedAssetTypes).map((type) => schema.text(type, 20)));
  if (!ids.length || !types.size || [...types].some((type) => !["image", "printable"].includes(type))) {
    return { ok: false, code: "retry_assets_required" };
  }
  if (!schema.text(retryKey, 180)) return { ok: false, code: "retry_key_required" };
  if (schema.asArray(retries).some((retry) => retry.retryKey === retryKey)) return { ok: false, code: "retry_key_used" };
  const candidates = failedAssets(sourceJob, lessonId);
  const selected = candidates.filter(({ type, action }) => types.has(type) && ids.includes(action.idempotencyKey));
  if (selected.length !== ids.length) return { ok: false, code: "retry_asset_not_failed_or_not_owned" };
  const attempts = schema.asArray(retries).filter((retry) => retry.sourceJobId === sourceJob.id && retry.lessonId === lessonId).length;
  if (attempts >= MAX_RETRIES) return { ok: false, code: "retry_limit_exceeded" };
  const selectedKeys = new Set(selected.map(({ type, action }) => assetKey(type, action)));
  if (schema.asArray(retries).some((retry) => retry.status === "running"
    && schema.asArray(retry.assets).some((asset) => selectedKeys.has(assetKey(asset.type, asset))))) {
    return { ok: false, code: "retry_asset_running" };
  }
  return { ok: true, selected, attempt: attempts + 1 };
}

function createRetry({ sourceJobId, lessonId, retryKey, attempt, selected, reason }) {
  const now = new Date().toISOString();
  return {
    id: `opretry_${schema.text(retryKey, 120).replace(/[^a-z0-9]/gi, "").slice(-40)}`,
    sourceJobId,
    lessonId,
    retryKey,
    attempt,
    reason: schema.text(reason, 400),
    status: "planned",
    createdAt: now,
    updatedAt: now,
    publishEnabled: false,
    assets: selected.map(({ type, action }) => ({
      type,
      idempotencyKey: action.idempotencyKey,
      activityId: action.activityId,
      status: "pending",
      failureReason: schema.text(action.error, 500) || null,
    })),
  };
}

module.exports = { MAX_RETRIES, assetKey, failedAssets, validateRequest, createRetry };

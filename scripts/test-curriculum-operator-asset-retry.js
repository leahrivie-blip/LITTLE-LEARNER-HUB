#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const retry = require("./curriculum-operator-asset-retry.js");

const sourceJob = {
  id: "opjob-source",
  createdBy: "leah@example.test",
  lessonResults: [{
    lessonId: "cur-lp-lesson",
    imageActions: [
      { idempotencyKey: "image:one", activityId: "a1", status: "failed", retryable: true, error: "timeout" },
      { idempotencyKey: "image:two", activityId: "a2", status: "success" },
      { idempotencyKey: "image:approved", activityId: "a3", status: "failed", approved: true },
    ],
    printableActions: [
      { idempotencyKey: "printable:one", activityId: "a1", status: "failed", retryable: true, error: "malformed" },
    ],
  }],
};
const valid = (overrides = {}) => retry.validateRequest({
  sourceJob,
  ownerId: "leah@example.test",
  sessionId: "session-1",
  lessonId: "cur-lp-lesson",
  selectedAssetIds: ["image:one", "printable:one"],
  selectedAssetTypes: ["image", "printable"],
  retryKey: "retry-key-1",
  authorization: true,
  retries: [],
  ...overrides,
});

assert.equal(valid().ok, true, "mixed failed assets are retryable");
assert.equal(valid().selected.length, 2, "only selected failed assets are returned");
assert.equal(valid({ ownerId: "other@example.test" }).code, "retry_owner_mismatch", "wrong owner rejected");
assert.equal(valid({ sessionId: "" }).code, "retry_authorization_required", "missing session rejected");
assert.equal(valid({ lessonId: "other" }).code, "retry_lesson_mismatch", "wrong lesson rejected");
assert.equal(valid({ selectedAssetIds: ["image:two"], selectedAssetTypes: ["image"] }).code,
  "retry_asset_not_failed_or_not_owned", "successful asset rejected");
assert.equal(valid({ selectedAssetIds: ["image:approved"], selectedAssetTypes: ["image"] }).code,
  "retry_asset_not_failed_or_not_owned", "approved asset rejected");
assert.equal(valid({ selectedAssetIds: [], selectedAssetTypes: [] }).code, "retry_assets_required", "empty selection rejected");
assert.equal(valid({ retries: [{ retryKey: "retry-key-1" }] }).code, "retry_key_used", "duplicate click rejected");
assert.equal(valid({ retries: Array.from({ length: retry.MAX_RETRIES }, () => ({ sourceJobId: "opjob-source", lessonId: "cur-lp-lesson" })) }).code,
  "retry_limit_exceeded", "retry limit enforced");
assert.equal(valid({ retries: [{ status: "running", assets: [{ type: "image", idempotencyKey: "image:one" }] }] }).code,
  "retry_asset_running", "concurrent asset retry rejected");
const created = retry.createRetry({ sourceJobId: sourceJob.id, lessonId: "cur-lp-lesson", retryKey: "retry-key-1", attempt: 1, selected: valid().selected, reason: "retry" });
assert.equal(created.publishEnabled, false, "retry jobs never publish");
assert.equal(created.assets.every((asset) => asset.status === "pending"), true, "retry assets begin pending");
console.log("Curriculum operator asset retry checks passed.");

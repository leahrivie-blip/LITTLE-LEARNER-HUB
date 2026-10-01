#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const prepApi = require("./curriculum-operator-production-qa-live-prep.js");
const enrichment = require("./teaching-kit-enrichment.js");

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const ACT3 = prepApi.TEXTURE_ACT_ID;
const activity = {
  id: ACT3,
  lessonPlanId: "cur-lp-fixture",
  setupImageUrl: "/api/media/enrichment-photos/tk-enrich-live-texture?variant=full",
};

console.log("\nDraft-null prep patch shape");
{
  const patch = prepApi.textureDraftNullPrepPatch(ACT3);
  ok(patch.activities[ACT3].setupImageUrl === null, "prep sends setupImageUrl null");
}

console.log("\nverifyTextureDraftNullPrecedence (unit)");
{
  const literal = prepApi.verifyTextureDraftNullPrecedence({
    plan: { enrichmentDraft: { activities: { [ACT3]: { setupImageUrl: null } } } },
    activity,
    activityId: ACT3,
  });
  ok(literal.effectiveImageMissing, "null stored → effective missing");
  ok(literal.ok || literal.literalNull || literal.normalizedEmptyString, "null patch acceptable");

  const normalized = prepApi.verifyTextureDraftNullPrecedence({
    plan: { enrichmentDraft: { activities: { [ACT3]: { setupImageUrl: "" } } } },
    activity,
    activityId: ACT3,
  });
  ok(normalized.effectiveImageMissing, "empty string stored → effective missing");
  ok(normalized.normalizedEmptyString, "documents empty-string normalization");
  ok(normalized.ok, "normalized empty passes verify when effective missing");

  const inherit = prepApi.verifyTextureDraftNullPrecedence({
    plan: { enrichmentDraft: { activities: {} } },
    activity,
    activityId: ACT3,
  });
  ok(!inherit.ok, "missing draft key does not pass");
  ok(!inherit.effectiveImageMissing, "without owned key inherits live image");

  const view = enrichment.activityEnrichmentView(activity, { setupImageUrl: null });
  ok(view.setupImageUrl === "", "activityEnrichmentView treats null draft as cleared");
}

console.log(`\nProduction QA prep-verify tests passed ${passed} assertions.`);

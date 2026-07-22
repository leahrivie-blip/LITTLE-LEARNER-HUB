/**
 * Phase 19 fixtures — fake health / backup / failed-save samples for Testing Lab.
 */

const model = require("./platform-resilience-data-model.js");

function seedPhase19ResilienceFixtures(store, { organizationId, adminEmail } = {}) {
  model.ensureResilienceStore(store);
  if (!model.isFakeOrganizationId(organizationId)) {
    throw new Error("Phase 19 fixtures require a validated fake organization.");
  }
  const failed = model.createFailedSaveRecord({
    code: "timeout",
    message: "Simulated slow-network save failure (sanitized).",
    surface: "testing_lab_checklist",
    organizationId,
    networkState: "timeout",
    retryable: true,
  });
  store.platformResilience.failedSaves[failed.id] = failed;

  const draft = model.createDraftRecord({
    surface: "admin_note",
    organizationId,
    userId: String(adminEmail || "phase19@example.invalid").toLowerCase(),
    recordId: "checklist_billing",
    payload: { draftText: "Fake checklist note draft — no secrets." },
  });
  store.platformResilience.draftSims[draft.id] = draft;

  return {
    failedSaveId: failed.id,
    draftId: draft.id,
    organizationId,
    testingOnly: true,
  };
}

module.exports = {
  seedPhase19ResilienceFixtures,
};

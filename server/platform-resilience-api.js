/**
 * Phase 19 resilience endpoints used by Testing Lab (and gated the same way).
 * Fake orgs only for destructive backup/restore simulation.
 */

const model = require("../scripts/platform-resilience-data-model.js");
const fixtures = require("../scripts/platform-resilience-fixtures.js");
const tlModel = require("../scripts/testing-lab-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function createPlatformResilienceHandlers({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  assertLabAccess,
  deny,
  env,
  getLaunchReadiness,
  testingBanner,
}) {
  async function handleHealth(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    model.ensureResilienceStore(store);
    const started = Date.now();
    const launch = typeof getLaunchReadiness === "function" ? getLaunchReadiness() : null;
    const summary = model.buildHealthSummary({
      store,
      env: process.env,
      launchReadiness: launch,
      databaseProvider: process.env.DATABASE_PROVIDER || "local-json",
    });
    const durationMs = Date.now() - started;
    model.recordPerfSample(store, {
      flow: "health_summary",
      durationMs,
      budgetMs: model.PERFORMANCE_BUDGETS.healthSummaryMs,
      organizationId: store.testingLab?.session?.organizationId,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ...summary,
      performance: {
        durationMs,
        budgetMs: model.PERFORMANCE_BUDGETS.healthSummaryMs,
        withinBudget: durationMs <= model.PERFORMANCE_BUDGETS.healthSummaryMs,
        budgets: model.PERFORMANCE_BUDGETS,
      },
      testingBanner: testingBanner || model.TESTING_BANNER,
    });
  }

  async function handleRecordFailedSave(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    model.ensureResilienceStore(store);
    const orgId = body.organizationId || store.testingLab?.session?.organizationId || "";
    const row = model.createFailedSaveRecord({
      ...body,
      organizationId: orgId,
      message: body.message,
      code: body.code,
      surface: body.surface,
    });
    store.platformResilience.failedSaves[row.id] = row;
    tlModel.appendAudit(store, {
      organizationId: model.isFakeOrganizationId(orgId) ? orgId : "",
      action: "failed_save_recorded",
      actorEmail: ctx.adminEmail,
      detail: `code=${row.code} surface=${row.surface}`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, failedSave: row, testingBanner: testingBanner || model.TESTING_BANNER });
  }

  async function handleResolveFailedSave(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    model.ensureResilienceStore(store);
    const row = store.platformResilience.failedSaves[body.id];
    if (!row) return deny(response, 404, "not_found", "Failed-save record not found.");
    row.resolved = true;
    row.resolvedAt = model.nowIso();
    store.platformResilience.failedSaves[row.id] = row;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, failedSave: row, testingBanner: testingBanner || model.TESTING_BANNER });
  }

  async function handleDraftSave(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    try {
      const draft = model.createDraftRecord({
        ...body,
        organizationId: body.organizationId || store.testingLab?.session?.organizationId,
        userId: body.userId || ctx.adminEmail,
      });
      if (!model.isFakeOrganizationId(draft.scope.organizationId)) {
        return deny(response, 403, "real_target_rejected", "Draft recovery simulation limited to fake organizations.");
      }
      model.ensureResilienceStore(store);
      store.platformResilience.draftSims[draft.id] = draft;
      writeStore(store);
      jsonResponse(response, 200, { ok: true, draft: { id: draft.id, scopeKey: draft.scopeKey, scope: draft.scope, updatedAt: draft.updatedAt }, testingBanner: testingBanner || model.TESTING_BANNER });
    } catch (error) {
      deny(response, 400, "draft_rejected", error.message);
    }
  }

  async function handleDraftLoad(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    model.ensureResilienceStore(store);
    const scope = {
      surface: body.surface,
      organizationId: body.organizationId || store.testingLab?.session?.organizationId,
      userId: body.userId || ctx.adminEmail,
      childId: body.childId || "",
      classroomId: body.classroomId || "",
      recordId: body.recordId || "",
    };
    const match = listValues(store.platformResilience.draftSims).find((d) => model.scopesMatch(d.scope, scope));
    if (!match) {
      return jsonResponse(response, 200, { ok: true, draft: null, testingBanner: testingBanner || model.TESTING_BANNER });
    }
    if (!model.scopesMatch(match.scope, scope)) {
      return deny(response, 403, "scope_mismatch", "Draft belongs to a different scope.");
    }
    jsonResponse(response, 200, {
      ok: true,
      draft: { id: match.id, scope: match.scope, payload: match.payload, updatedAt: match.updatedAt },
      testingBanner: testingBanner || model.TESTING_BANNER,
    });
  }

  async function handleBackupSimulate(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const orgId = body.organizationId || store.testingLab?.session?.organizationId;
    if (!model.isFakeOrganizationId(orgId)) {
      return deny(response, 403, "real_target_rejected", "Backup simulation limited to fake organizations.");
    }
    try {
      model.ensureResilienceStore(store);
      const backup = model.createBackupSimulation({
        organizationId: orgId,
        createdBy: ctx.adminEmail,
        scenario: store.testingLab?.session?.scenario,
        featureState: store.testingLab?.session?.featureState,
        accountCount: listValues(store.familyFoundation?.fakeAccounts || {}).filter((a) => a.organizationId === orgId).length,
        noteCount: listValues(store.testingLab?.notes || {}).filter((n) => n.organizationId === orgId).length,
        label: body.label,
      });
      store.platformResilience.backupSims[backup.id] = backup;
      tlModel.appendAudit(store, {
        organizationId: orgId,
        action: "backup_simulated",
        actorEmail: ctx.adminEmail,
        detail: `backup=${backup.id}`,
      });
      writeStore(store);
      jsonResponse(response, 200, { ok: true, backup, testingBanner: testingBanner || model.TESTING_BANNER });
    } catch (error) {
      deny(response, 400, "backup_failed", error.message);
    }
  }

  async function handleRestorePreview(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    model.ensureResilienceStore(store);
    const backup = store.platformResilience.backupSims[body.backupId];
    if (!backup) return deny(response, 404, "not_found", "Backup simulation not found.");
    if (!model.isFakeOrganizationId(backup.organizationId)) {
      return deny(response, 403, "real_target_rejected");
    }
    try {
      const preview = model.createRestorePreview(backup, store.testingLab?.session || {});
      store.platformResilience.restorePreviews[preview.id] = preview;
      writeStore(store);
      jsonResponse(response, 200, { ok: true, preview, requiresConfirm: true, testingBanner: testingBanner || model.TESTING_BANNER });
    } catch (error) {
      deny(response, 400, "preview_failed", error.message);
    }
  }

  async function handleRestoreConfirm(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    if (body.confirm !== true) {
      return jsonResponse(response, 400, {
        ok: false,
        code: "confirmation_required",
        error: "Confirm restore simulation explicitly.",
      });
    }
    model.ensureResilienceStore(store);
    const preview = store.platformResilience.restorePreviews[body.previewId];
    if (!preview) return deny(response, 404, "not_found", "Restore preview not found.");
    const backup = store.platformResilience.backupSims[preview.backupId];
    if (!backup || !model.isFakeOrganizationId(backup.organizationId)) {
      return deny(response, 403, "real_target_rejected");
    }
    if (store.testingLab?.session) {
      store.testingLab.session.scenario = backup.snapshot?.scenario || store.testingLab.session.scenario;
      store.testingLab.session.featureState = backup.snapshot?.featureState || store.testingLab.session.featureState;
    }
    tlModel.appendAudit(store, {
      organizationId: backup.organizationId,
      action: "restore_simulated",
      actorEmail: ctx.adminEmail,
      detail: `Applied fake backup ${backup.id} via preview ${preview.id}`,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      restored: true,
      testingOnly: true,
      organizationId: backup.organizationId,
      applied: backup.snapshot,
      testingBanner: testingBanner || model.TESTING_BANNER,
    });
  }

  async function handleSeedFixtures(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const orgId = store.testingLab?.session?.organizationId;
    if (!model.isFakeOrganizationId(orgId)) {
      return deny(response, 403, "real_target_rejected");
    }
    const seeded = fixtures.seedPhase19ResilienceFixtures(store, {
      organizationId: orgId,
      adminEmail: ctx.adminEmail,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, seeded, testingBanner: testingBanner || model.TESTING_BANNER });
  }

  async function handlePerfRecord(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const sample = model.recordPerfSample(store, {
      ...body,
      organizationId: body.organizationId || store.testingLab?.session?.organizationId,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, sample, testingBanner: testingBanner || model.TESTING_BANNER });
  }

  async function handleActivityPage(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const url = new URL(request.url || `http://127.0.0.1${request.url}`, "http://127.0.0.1");
    const page = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || model.PERFORMANCE_BUDGETS.activityHistoryPageSize);
    const orgId = store.testingLab?.session?.organizationId;
    const rows = listValues(store.testingLab?.audit || {})
      .filter((r) => !orgId || r.organizationId === orgId)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const paged = model.paginateList(rows, { page, pageSize });
    jsonResponse(response, 200, {
      ok: true,
      ...paged,
      featureMarker: model.FEATURE_MARKER,
      testingBanner: testingBanner || model.TESTING_BANNER,
    });
  }

  return {
    handleHealth,
    handleRecordFailedSave,
    handleResolveFailedSave,
    handleDraftSave,
    handleDraftLoad,
    handleBackupSimulate,
    handleRestorePreview,
    handleRestoreConfirm,
    handleSeedFixtures,
    handlePerfRecord,
    handleActivityPage,
  };
}

module.exports = {
  createPlatformResilienceHandlers,
};

/**
 * Phase 20 handlers — security review, migration simulator, release readiness.
 * Mounted under /api/testing-lab/* with the same Lab access gates.
 */

const security = require("../scripts/phase20-security-data-model.js");
const migration = require("../scripts/migration-simulator-data-model.js");
const readiness = require("../scripts/release-readiness-data-model.js");
const tlModel = require("../scripts/testing-lab-data-model.js");
const resilience = require("../scripts/platform-resilience-data-model.js");

function createPhase20Handlers({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  assertLabAccess,
  deny,
  env,
  getLaunchReadiness,
  testingBanner,
  getGitSha,
  getBranchName,
}) {
  function rateLimitSensitive(request, response, action) {
    const key = security.clientKeyFromRequest(request, `tl:${action}`);
    const result = security.checkRateLimit(key, { limit: 30, windowMs: 60_000 });
    if (!result.allowed) {
      jsonResponse(response, 429, {
        ok: false,
        code: "rate_limited",
        error: "Too many sensitive Testing Lab requests. Try again shortly.",
        retryAfterSec: result.retryAfterSec,
        testingBanner: testingBanner || security.TESTING_BANNER,
      });
      return false;
    }
    return true;
  }

  async function handleSecurityReview(request, response) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const summary = security.buildSecurityReviewSummary();
    jsonResponse(response, 200, { ...summary, testingBanner: testingBanner || security.TESTING_BANNER });
  }

  async function handleReleaseReadiness(request, response) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const launch = typeof getLaunchReadiness === "function" ? getLaunchReadiness() : null;
    const environment = typeof env === "function" ? env() : {};
    const summary = readiness.buildReleaseReadinessSummary({
      store,
      env: process.env,
      launchReadiness: launch,
      branchName: (typeof getBranchName === "function" ? getBranchName() : null) || "cursor/director-family-foundation-bc66",
      gitSha: (typeof getGitSha === "function" ? getGitSha() : "") || "",
      siteUrl: environment.siteUrl || process.env.SITE_URL || "",
    });
    jsonResponse(response, 200, {
      ...summary,
      phoneSummary: readiness.phoneStatusSummary(summary),
      testingBanner: testingBanner || readiness.TESTING_BANNER,
    });
  }

  async function handleMigrationInspect(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    if (!rateLimitSensitive(request, response, "mig-inspect")) return;
    const orgId = store.testingLab?.session?.organizationId;
    try {
      const inspection = migration.inspectFakeOrganization(store, orgId);
      migration.ensureMigrationStore(store);
      store.migrationSimulator.inspections[orgId] = { ...inspection, actorEmail: ctx.adminEmail };
      writeStore(store);
      jsonResponse(response, 200, { ...inspection, testingBanner: testingBanner || migration.TESTING_BANNER });
    } catch (error) {
      deny(response, error.code === "real_target_rejected" ? 403 : 400, error.code || "inspect_failed", error.message);
    }
  }

  async function handleMigrationPreview(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    if (!rateLimitSensitive(request, response, "mig-preview")) return;
    const orgId = store.testingLab?.session?.organizationId;
    try {
      const inspection = migration.inspectFakeOrganization(store, orgId);
      const preview = migration.buildMigrationPreview(store, orgId, inspection);
      migration.ensureMigrationStore(store);
      store.migrationSimulator.previews[preview.id] = preview;
      tlModel.appendAudit(store, {
        organizationId: orgId,
        action: "migration_preview_created",
        actorEmail: ctx.adminEmail,
        detail: `preview=${preview.id} flags=${preview.wouldFlag.length}`,
      });
      writeStore(store);
      jsonResponse(response, 200, {
        ok: true,
        preview,
        report: migration.exportSanitizedReport(inspection, preview),
        requiresConfirm: true,
        testingBanner: testingBanner || migration.TESTING_BANNER,
      });
    } catch (error) {
      deny(response, error.code === "real_target_rejected" ? 403 : 400, error.code || "preview_failed", error.message);
    }
  }

  async function handleMigrationApply(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    if (!rateLimitSensitive(request, response, "mig-apply")) return;
    const body = await readJson(request).catch(() => ({}));
    migration.ensureMigrationStore(store);
    const preview = store.migrationSimulator.previews[body.previewId];
    if (!preview) return deny(response, 404, "not_found", "Migration preview not found.");
    try {
      const result = migration.applyFakeMigration(store, preview, {
        confirm: body.confirm === true,
        actorEmail: ctx.adminEmail,
      });
      tlModel.appendAudit(store, {
        organizationId: preview.organizationId,
        action: "migration_applied_fake",
        actorEmail: ctx.adminEmail,
        detail: `backup=${result.backupId}`,
      });
      writeStore(store);
      jsonResponse(response, 200, { ...result, testingBanner: testingBanner || migration.TESTING_BANNER });
    } catch (error) {
      const status = error.code === "confirmation_required" ? 400 : error.code === "real_target_rejected" ? 403 : 400;
      if (error.code === "confirmation_required") {
        return jsonResponse(response, 400, {
          ok: false,
          code: "confirmation_required",
          error: error.message,
          previewImpact: {
            organizationId: preview.organizationId,
            wouldCreate: preview.wouldCreate,
            wouldUpdate: preview.wouldUpdate,
            neverTargets: ["production", "main", "real users", "Stripe"],
          },
        });
      }
      deny(response, status, error.code || "apply_failed", error.message);
    }
  }

  async function handleMigrationRollback(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    if (!rateLimitSensitive(request, response, "mig-rollback")) return;
    const body = await readJson(request).catch(() => ({}));
    try {
      const result = migration.rollbackFakeMigration(store, body.backupId, {
        confirm: body.confirm === true,
        actorEmail: ctx.adminEmail,
      });
      tlModel.appendAudit(store, {
        organizationId: result.organizationId,
        action: "migration_rollback_fake",
        actorEmail: ctx.adminEmail,
        detail: `backup=${body.backupId}`,
      });
      writeStore(store);
      jsonResponse(response, 200, { ...result, testingBanner: testingBanner || migration.TESTING_BANNER });
    } catch (error) {
      const status = error.code === "confirmation_required" ? 400 : error.code === "not_found" ? 404 : error.code === "real_target_rejected" ? 403 : 400;
      if (error.code === "confirmation_required") {
        return jsonResponse(response, 400, { ok: false, code: "confirmation_required", error: error.message });
      }
      deny(response, status, error.code || "rollback_failed", error.message);
    }
  }

  async function handleMigrationHistory(request, response) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    migration.ensureMigrationStore(store);
    const orgId = store.testingLab?.session?.organizationId;
    const rows = Object.values(store.migrationSimulator.history || {})
      .filter((r) => !orgId || r.organizationId === orgId)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    jsonResponse(response, 200, {
      ok: true,
      items: rows,
      testingOnly: true,
      testingBanner: testingBanner || migration.TESTING_BANNER,
    });
  }

  async function handleMigrationReport(request, response) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const orgId = store.testingLab?.session?.organizationId;
    try {
      if (!resilience.isFakeOrganizationId(orgId)) {
        return deny(response, 403, "real_target_rejected");
      }
      const inspection = migration.inspectFakeOrganization(store, orgId);
      const preview = migration.buildMigrationPreview(store, orgId, inspection);
      jsonResponse(response, 200, {
        ok: true,
        report: migration.exportSanitizedReport(inspection, preview),
        testingBanner: testingBanner || migration.TESTING_BANNER,
      });
    } catch (error) {
      deny(response, 400, error.code || "report_failed", error.message);
    }
  }

  return {
    handleSecurityReview,
    handleReleaseReadiness,
    handleMigrationInspect,
    handleMigrationPreview,
    handleMigrationApply,
    handleMigrationRollback,
    handleMigrationHistory,
    handleMigrationReport,
  };
}

module.exports = {
  createPhase20Handlers,
};

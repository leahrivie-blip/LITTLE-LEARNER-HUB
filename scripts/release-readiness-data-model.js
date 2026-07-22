/**
 * Phase 20 — Release Readiness Center data (computer-first Testing Lab).
 * Aggregates environment identity, kill switches, flags, checklists. No production mutation.
 */

const security = require("./phase20-security-data-model.js");
const resilience = require("./platform-resilience-data-model.js");
const migration = require("./migration-simulator-data-model.js");

const PHASE = 20;
const FEATURE_MARKER = "phase20-release-readiness";
const TESTING_BANNER = "Private Testing Environment — Fake Data Only";

const OWNER_MANUAL_CHECKLIST = Object.freeze([
  { id: "branch_correct", label: "Confirm work is on cursor/director-family-foundation-bc66 only" },
  { id: "fake_data_only", label: "Confirm Testing Lab uses fake @example.invalid data only" },
  { id: "stripe_off", label: "Confirm DISABLE_STRIPE_CHECKOUT=true on testing" },
  { id: "email_off", label: "Confirm outbound email/SMS/push disabled" },
  { id: "ai_off", label: "Confirm live AI disabled / mock only" },
  { id: "prod_locked", label: "Confirm production host rejects Lab / Family Hub / migration mutations" },
  { id: "tests_green", label: "Confirm Phase 1–20 automated suite PASS on this branch" },
  { id: "migration_preview", label: "Review fake migration preview before any confirm-apply" },
  { id: "no_main_merge", label: "Do not merge to main without explicit owner approval" },
  { id: "no_prod_deploy", label: "Do not deploy to production without explicit owner approval" },
  { id: "integration_plan", label: "Read testing-only integration plan before checkpoint" },
]);

function killSwitchStatus(env = process.env) {
  const truthy = (v) => ["1", "true", "yes", "on"].includes(String(v || "").trim().toLowerCase());
  return {
    stripeCheckout: truthy(env.DISABLE_STRIPE_CHECKOUT) || !env.STRIPE_SECRET_KEY ? "disabled" : "configured",
    outboundEmail: truthy(env.DISABLE_OUTBOUND_EMAIL) || !env.SMTP_URL ? "disabled" : "configured",
    outboundSms: "disabled",
    pushNotifications: "disabled",
    liveAi: truthy(env.DISABLE_AI_CALLS) || !env.OPENAI_API_KEY ? "disabled" : "configured",
  };
}

function buildReleaseReadinessSummary({
  store,
  env = process.env,
  launchReadiness = null,
  branchName = "cursor/director-family-foundation-bc66",
  gitSha = "",
  siteUrl = "",
} = {}) {
  resilience.ensureResilienceStore(store);
  migration.ensureMigrationStore(store);
  const flags = store.siteContent?.featureFlags || {};
  const securityReview = security.buildSecurityReviewSummary();
  const health = resilience.buildHealthSummary({
    store,
    env,
    launchReadiness,
    databaseProvider: env.DATABASE_PROVIDER || "local-json",
  });
  const orgId = store.testingLab?.session?.organizationId || "";
  let migrationReady = {
    status: "not_seeded",
    note: "Load a fake scenario before migration inspect/preview.",
  };
  if (resilience.isFakeOrganizationId(orgId)) {
    try {
      const insp = migration.inspectFakeOrganization(store, orgId);
      const issueCount = (insp.issues.duplicates?.length || 0)
        + (insp.issues.missing?.length || 0)
        + (insp.issues.conflicts?.length || 0);
      migrationReady = {
        status: issueCount ? "needs_review" : "preview_ready",
        organizationId: orgId,
        issueCount,
        counts: insp.counts,
        note: "Fake-org inspect available. Production migration never runs from this center.",
      };
    } catch (error) {
      migrationReady = { status: "error", note: security.cleanText(error.message, 160) };
    }
  }

  const liveProduction = /littlelearnershubbyleah\.com/i.test(String(siteUrl || env.SITE_URL || ""));
  const blockers = [];
  if (liveProduction) blockers.push("Live production host — Lab mutations must remain rejected");
  if (killSwitchStatus(env).stripeCheckout !== "disabled") blockers.push("Stripe checkout not kill-switched");
  if (flags.testingLab !== true) blockers.push("testingLab stored flag is off (expected until Lab enablement)");

  return {
    ok: true,
    phase: PHASE,
    featureMarker: FEATURE_MARKER,
    testingBanner: TESTING_BANNER,
    computerRecommended: true,
    identity: {
      branchName,
      gitSha: security.cleanText(gitSha, 64),
      siteUrl: security.cleanText(siteUrl || env.SITE_URL || "http://127.0.0.1", 200),
      nodeEnv: security.cleanText(env.NODE_ENV || "test", 40),
      databaseProvider: security.cleanText(env.DATABASE_PROVIDER || "local-json", 40),
      liveProduction,
    },
    killSwitches: killSwitchStatus(env),
    featureFlags: {
      directorCenter: flags.directorCenter === true,
      formsCenter: flags.formsCenter === true,
      familyHub: flags.familyHub === true,
      testingLab: flags.testingLab === true,
    },
    testResults: {
      note: "Run npm run test:security-migration-phase20 and full Phase 1–20 regression before claiming green.",
      expectedFocusedSuite: "test:security-migration-phase20",
      expectedNav: "test:platform-nav",
      expectedAccess: "test:account-access",
    },
    migrationReadiness: migrationReady,
    securityChecklist: securityReview.checklist,
    securitySummary: securityReview.summary,
    accessibilityPerformance: {
      phase19Complete: true,
      formalWcagCertification: false,
      note: "Phase 19 foundations present; professional a11y review still required.",
    },
    fakeDataConfirmation: {
      required: true,
      banner: TESTING_BANNER,
      exampleInvalidOnly: true,
      noProductionData: true,
    },
    knownBlockers: blockers,
    deferredItems: [
      "Testing-site integration checkpoint (separate instructions)",
      "Real production migration",
      "Formal penetration test / security certification",
      "Formal WCAG certification",
      "Live Stripe / email / SMS / push / AI",
      "Merge to main / production deploy",
    ],
    productionLock: {
      expansionFlagsForcedOffOnLiveHost: true,
      testingLabRejectedOnProduction: true,
      migrationMutationsRejectedOnProduction: true,
      mainUntouched: true,
    },
    ownerManualChecklist: OWNER_MANUAL_CHECKLIST.map((row) => ({ ...row, status: "not_tested" })),
    launchReadiness: launchReadiness
      ? { ready: launchReadiness.ready === true, blockers: launchReadiness.blockers || [] }
      : null,
    at: security.nowIso(),
  };
}

function phoneStatusSummary(readiness) {
  return {
    featureMarker: "phase20-release-readiness-mobile",
    computerRecommended: true,
    banner: TESTING_BANNER,
    headline: "Release Readiness is computer recommended",
    explanation:
      "Security review details, migration preview/confirm, and the full Release Readiness Center should be completed on the computer website. This phone view is a status summary only.",
    identity: {
      branch: readiness.identity?.branchName || "",
      storage: readiness.identity?.databaseProvider || "",
      liveProduction: readiness.identity?.liveProduction === true,
    },
    killSwitchesOk: Object.values(readiness.killSwitches || {}).every((v) => v === "disabled"),
    migrationStatus: readiness.migrationReadiness?.status || "unknown",
    productionLocked: readiness.productionLock?.testingLabRejectedOnProduction === true,
    blockersCount: (readiness.knownBlockers || []).length,
  };
}

module.exports = {
  PHASE,
  FEATURE_MARKER,
  TESTING_BANNER,
  OWNER_MANUAL_CHECKLIST,
  killSwitchStatus,
  buildReleaseReadinessSummary,
  phoneStatusSummary,
};

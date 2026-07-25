/**
 * Safe Cursor investigation eligibility for automated testing bugs.
 *
 * Cursor may only change code for eligible technical failures on the testing
 * branch. Hard stop conditions never auto-merge, auto-deploy, touch main /
 * production, or guess product/permission/billing/childcare rules.
 */
"use strict";

const { cleanText, sanitizeErrorMessage } = require("./testing-sentry-sanitize.js");

const ELIGIBILITY = Object.freeze({
  ELIGIBLE_TECHNICAL: "eligible_technical",
  STOP_UNCLEAR_BEHAVIOR: "stop_unclear_behavior",
  STOP_PRODUCT_LAYOUT: "stop_product_layout",
  STOP_PERMISSIONS: "stop_permissions",
  STOP_REAL_DATA: "stop_real_data",
  STOP_EXTERNAL_SERVICES: "stop_external_services",
  STOP_DESTRUCTIVE_MIGRATION: "stop_destructive_migration",
  STOP_UNRELATED_FAILURES: "stop_unrelated_failures",
  STOP_MAIN_OR_PRODUCTION: "stop_main_or_production",
});

const HARD_LIMITS = Object.freeze([
  "Never merge automatically",
  "Never deploy automatically",
  "Never push to main",
  "Never change production",
  "Never delete or rewrite data",
  "Never change prices",
  "Never contact users",
  "Never refund or cancel subscriptions",
  "Never enable external services (Stripe live, email, SMS, OpenAI)",
  "Never relax security checks",
  "Never guess childcare, medication, licensing, billing, or parent-access requirements",
]);

const STOP_PATTERNS = [
  {
    code: ELIGIBILITY.STOP_MAIN_OR_PRODUCTION,
    reason: "Signal mentions main or production — Cursor must not change those targets.",
    test: (text) => /\b(main\s+branch|production\s+host|prod\s+deploy|push to main)\b/i.test(text),
  },
  {
    code: ELIGIBILITY.STOP_EXTERNAL_SERVICES,
    reason: "Fix would touch Stripe, email, SMS, or OpenAI behavior.",
    test: (text) => /\b(stripe|checkout session|refund|resend|twilio|sms|openai|gpt-)\b/i.test(text),
  },
  {
    code: ELIGIBILITY.STOP_REAL_DATA,
    reason: "Signal suggests real family/staff/payment data — use fixtures only.",
    test: (text) => /\b(real (child|family|parent|staff|payment)|production database|live customer)\b/i.test(text),
  },
  {
    code: ELIGIBILITY.STOP_DESTRUCTIVE_MIGRATION,
    reason: "Fix appears to require a destructive database migration.",
    test: (text) => /\b(drop table|destructive migration|rewrite (all )?store|delete all)\b/i.test(text),
  },
  {
    code: ELIGIBILITY.STOP_PERMISSIONS,
    reason: "Permission / role-access rules may need an owner product decision.",
    test: (text, ctx) => ctx.errorType === "permission_role_mismatch"
      || /\b(change permission|grant access|relax auth|bypass (auth|gate))\b/i.test(text),
  },
  {
    code: ELIGIBILITY.STOP_PRODUCT_LAYOUT,
    reason: "Looks like a product or layout decision, not a clear technical defect.",
    test: (text, ctx) => ctx.errorType === "broken_route" && /\b(should|wanted|prefer|redesign|move the button)\b/i.test(text),
  },
];

const TECHNICAL_TYPES = new Set([
  "browser_exception",
  "server_exception",
  "failed_api",
  "app_boot_timeout",
  "console_error",
  "database_failure",
  "offline_sync_failure",
  "duplicate_request",
  "deployed_smoke_failure",
  "performance_threshold",
  "broken_route",
]);

function classifyEligibility(input = {}) {
  const errorType = cleanText(input.errorType, 80).toLowerCase();
  const message = sanitizeErrorMessage(input.message || "");
  const page = cleanText(input.page, 120);
  const blob = `${errorType} ${message} ${page} ${cleanText(input.source, 40)}`;

  for (const rule of STOP_PATTERNS) {
    if (rule.test(blob, { errorType, message, page })) {
      return { eligible: false, code: rule.code, reason: rule.reason };
    }
  }

  if (!TECHNICAL_TYPES.has(errorType) && errorType !== "other") {
    return {
      eligible: false,
      code: ELIGIBILITY.STOP_UNCLEAR_BEHAVIOR,
      reason: "Error type is not a known technical class — stop for owner clarification.",
    };
  }

  if (!message && errorType === "other") {
    return {
      eligible: false,
      code: ELIGIBILITY.STOP_UNCLEAR_BEHAVIOR,
      reason: "Expected behavior is unclear from the sanitized signal.",
    };
  }

  return {
    eligible: true,
    code: ELIGIBILITY.ELIGIBLE_TECHNICAL,
    reason: "Eligible technical failure for testing-only Cursor investigation.",
  };
}

/**
 * Runtime stop checks during an investigation (after tests / diagnosis).
 */
function evaluateInvestigationStop(context = {}) {
  if (context.expectedBehaviorUnclear === true) {
    return { stop: true, code: ELIGIBILITY.STOP_UNCLEAR_BEHAVIOR, reason: "Expected behavior is unclear." };
  }
  if (context.requiresProductOrLayoutDecision === true) {
    return { stop: true, code: ELIGIBILITY.STOP_PRODUCT_LAYOUT, reason: "Fix requires a product/layout decision." };
  }
  if (context.requiresPermissionChange === true) {
    return { stop: true, code: ELIGIBILITY.STOP_PERMISSIONS, reason: "Permissions must change." };
  }
  if (context.involvesRealData === true) {
    return { stop: true, code: ELIGIBILITY.STOP_REAL_DATA, reason: "Real data is involved." };
  }
  if (context.changesStripeEmailSmsOpenAi === true) {
    return { stop: true, code: ELIGIBILITY.STOP_EXTERNAL_SERVICES, reason: "Stripe/email/SMS/OpenAI behavior would change." };
  }
  if (context.destructiveMigration === true) {
    return { stop: true, code: ELIGIBILITY.STOP_DESTRUCTIVE_MIGRATION, reason: "Database migration is destructive." };
  }
  if (context.unrelatedTestFailures === true) {
    return { stop: true, code: ELIGIBILITY.STOP_UNRELATED_FAILURES, reason: "Tests reveal unrelated failures." };
  }
  if (context.touchesMainOrProduction === true) {
    return { stop: true, code: ELIGIBILITY.STOP_MAIN_OR_PRODUCTION, reason: "Change would touch main or production." };
  }
  return { stop: false, code: ELIGIBILITY.ELIGIBLE_TECHNICAL, reason: "" };
}

function investigationPlaybook() {
  return {
    baseBranch: "testing/full-platform-integration-2026-07",
    branchPrefix: "cursor/",
    branchSuffix: "-1ab6",
    targetPrBase: "testing/full-platform-integration-2026-07",
    draftPrOnly: true,
    neverMerge: true,
    neverDeploy: true,
    neverPushMain: true,
    neverChangeProduction: true,
    steps: [
      "Create a branch from the latest testing branch",
      "Reproduce the bug with fake fixtures only",
      "Add a failing regression test",
      "Diagnose the root cause",
      "Implement the smallest scoped fix",
      "Run focused and full release tests (npm run test:release)",
      "Capture before/after screenshots",
      "Open a draft PR targeting testing only",
      "Update the bug record / issue with results",
      "Produce an owner report ending with: Approve merge to testing?",
    ],
    hardLimits: HARD_LIMITS,
    stopConditions: Object.values(ELIGIBILITY).filter((code) => code.startsWith("stop_")),
  };
}

module.exports = {
  ELIGIBILITY,
  HARD_LIMITS,
  classifyEligibility,
  evaluateInvestigationStop,
  investigationPlaybook,
};

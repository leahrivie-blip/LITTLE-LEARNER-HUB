/**
 * Phase 18 Testing Lab API — /api/testing-lab/*
 * Production always rejects. Admin + ALLOW_TESTING_LAB_ADMIN_PREVIEW + stored testingLab.
 */

const expansionFlags = require("../scripts/expansion-feature-flags.js");
const model = require("../scripts/testing-lab-data-model.js");
const fixtures = require("../scripts/testing-lab-fixtures.js");
const familyModel = require("../scripts/family-foundation-data-model.js");
const tempPasswordAuth = require("./temp-password-auth.js");
const { createPlatformResilienceHandlers } = require("./platform-resilience-api.js");
const resilienceModel = require("../scripts/platform-resilience-data-model.js");
const { createPhase20Handlers } = require("./phase20-api.js");
const securityModel = require("../scripts/phase20-security-data-model.js");
const testingFeedbackModel = require("../scripts/testing-feedback-data-model.js");

const BASE = "/api/testing-lab";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function getHeader(request, name) {
  const key = String(name || "").toLowerCase();
  const headers = request && request.headers ? request.headers : {};
  if (headers && typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(key) || "").trim();
  }
  if (headers && Object.prototype.hasOwnProperty.call(headers, key)) {
    return String(headers[key] || "").trim();
  }
  const found = Object.keys(headers || {}).find((headerName) => headerName.toLowerCase() === key);
  return found ? String(headers[found] || "").trim() : "";
}

function productionSiteFromUrl(siteUrl) {
  return Boolean(String(siteUrl || "").toLowerCase().includes(PRODUCTION_HOST));
}

function resolveEnv(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") {
    const siteUrl = String(process.env.SITE_URL || "");
    env = expansionFlags.resolveExpansionEnvironment({ siteUrl, env: process.env });
  }
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const liveProduction = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    ...env,
    liveProduction,
    allowTestingLabAdminPreview: env.allowTestingLabAdminPreview === true && !liveProduction,
    siteUrl,
  };
}

function ensureTestingHealth(store) {
  store.testingHealth = store.testingHealth && typeof store.testingHealth === "object" ? store.testingHealth : {};
  return store.testingHealth;
}

function createTestingLabApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
  getLaunchReadiness,
  getGitSha,
  getBranchName,
  getStripeConfigStatus,
  getAiConfigStatus,
  getSupportEmailConfigStatus,
  listRecentErrors,
  openAutoBugCount,
  ingestAutoBugFromSmoke,
}) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, {
      ok: false,
      error: error || "Access denied.",
      code,
      testingLab: true,
      testingBanner: model.TESTING_BANNER,
    });
  }

  function assertLabAccess(store, response) {
    if (env().liveProduction || !env().allowTestingLabAdminPreview) {
      deny(response, 403, "production_preview_rejected", "Testing Lab unavailable in production.");
      return false;
    }
    const stored = store?.siteContent?.featureFlags || {};
    if (stored.testingLab !== true) {
      deny(response, 403, "feature_unavailable", "Testing Lab feature flag is off.");
      return false;
    }
    return true;
  }

  function publicAccount(row) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      kind: row.kind,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      planKey: row.planKey,
      contactId: row.contactId || "",
      staffMembershipId: row.staffMembershipId || "",
      label: row.label || model.ACCOUNT_BANNER,
      active: row.active !== false,
      mustChangePassword: row.mustChangePassword === true,
      lastPasswordIssuedAt: row.lastPasswordIssuedAt || "",
      hasPassword: Boolean(row.passwordHash),
      testingOnly: true,
      // never include passwordHash or plaintext
    };
  }

  const resilience = createPlatformResilienceHandlers({
    readStore,
    writeStore,
    jsonResponse,
    readJson,
    assertLabAccess,
    deny,
    env,
    getLaunchReadiness,
    testingBanner: model.TESTING_BANNER,
  });

  const phase20 = createPhase20Handlers({
    readStore,
    writeStore,
    jsonResponse,
    readJson,
    assertLabAccess,
    deny,
    env,
    getLaunchReadiness,
    testingBanner: model.TESTING_BANNER,
    getGitSha,
    getBranchName,
  });

  async function handleStatus(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    model.ensureTestingLabStore(store);
    resilienceModel.ensureResilienceStore(store);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 18,
      resiliencePhase: 19,
      securityMigrationPhase: 20,
      featureMarker: "phase18-testing-lab",
      phase19Marker: resilienceModel.FEATURE_MARKER,
      phase20Marker: securityModel.FEATURE_MARKER,
      testingBanner: model.TESTING_BANNER,
      testingLab: true,
      noStripe: true,
      noOutboundEmail: true,
      noPasswordsInResponses: true,
      role: "admin",
      adminEmail: normalizeEmail?.(ctx.adminEmail) || ctx.adminEmail,
    });
  }

  async function handleDashboard(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    model.ensureTestingLabStore(store);
    const session = store.testingLab.session || {};
    const orgId = session.organizationId;
    const accounts = listValues(store.familyFoundation?.fakeAccounts || {})
      .filter((a) => !orgId || a.organizationId === orgId)
      .map(publicAccount);
    const flags = expansionFlags.publicExpansionFeatureFlagsPayload(store.siteContent?.featureFlags, {
      environment: env(),
      isVerifiedAdmin: true,
    });
    const recentAudit = listValues(store.testingLab.audit)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 20);
    const notes = listValues(store.testingLab.notes).filter((n) => n.organizationId === orgId);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      featureMarker: "phase18-testing-lab",
      testingBanner: model.TESTING_BANNER,
      computerRecommended: true,
      dashboard: {
        organizationId: orgId,
        scenario: session.scenario,
        accountId: session.accountId,
        planKey: session.planKey,
        device: session.device,
        featureState: session.featureState,
        seedStatus: session.seedStatus,
        rolePreviewId: session.rolePreviewId,
        rolePreview: session.rolePreviewId && store.testingLab.rolePreviews[session.rolePreviewId]
          ? {
              id: session.rolePreviewId,
              targetKind: store.testingLab.rolePreviews[session.rolePreviewId].targetKind || "",
              label: store.testingLab.rolePreviews[session.rolePreviewId].label || "",
              active: store.testingLab.rolePreviews[session.rolePreviewId].status !== "exited",
            }
          : null,
      },
      scenarios: model.scenarioCatalog(),
      featureStates: model.FEATURE_STATES,
      devices: model.DEVICE_PRESETS,
      accounts,
      flags: {
        stored: flags.storedFlags,
        effective: flags.effectiveFlags,
        policy: flags.policy,
      },
      checklist: listValues(store.testingLab.checklist).filter((c) => c.organizationId === orgId),
      notes,
      recentActivity: recentAudit,
      rolePreviewTargets: model.ROLE_PREVIEW_TARGETS,
    });
  }

  /**
   * Read-only, sanitized status panel for the Owner Testing Home — never
   * exposes secrets/API keys, only whether each integration is configured
   * and every real external service (Stripe/email/SMS/OpenAI) stays off
   * on a testing host regardless of what's configured.
   */
  async function handleStatus(request, response, ctx) {
    let store;
    let databaseConnected = true;
    try {
      store = readStore();
    } catch {
      databaseConnected = false;
      store = { siteContent: {}, familyFoundation: {}, testingFeedback: {} };
    }
    if (!assertLabAccess(store, response)) return;
    const flags = expansionFlags.publicExpansionFeatureFlagsPayload(store.siteContent?.featureFlags, {
      environment: env(),
      isVerifiedAdmin: true,
    });
    const stripeStatus = typeof getStripeConfigStatus === "function" ? getStripeConfigStatus() : null;
    const aiStatus = typeof getAiConfigStatus === "function" ? getAiConfigStatus() : null;
    const emailStatus = typeof getSupportEmailConfigStatus === "function" ? getSupportEmailConfigStatus() : null;
    const testerCount = listValues(store.familyFoundation?.fakeAccounts || {}).length;
    let openFeedbackCount = 0;
    try {
      openFeedbackCount = testingFeedbackModel.listThreadsForAdmin(store, { status: "open" }).length
        + testingFeedbackModel.listThreadsForAdmin(store, { status: "in_progress" }).length;
    } catch { openFeedbackCount = 0; }
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: model.TESTING_BANNER,
      deployedCommit: typeof getGitSha === "function" ? getGitSha() : "",
      branch: typeof getBranchName === "function" ? getBranchName() : "",
      databaseConnected,
      databaseProvider: String(process.env.DATABASE_PROVIDER || "local-json"),
      liveProduction: env().liveProduction,
      flags: {
        testingLab: flags.effectiveFlags?.testingLab === true,
        familyHub: flags.effectiveFlags?.familyHub === true,
        formsCenter: flags.effectiveFlags?.formsCenter === true,
        directorCenter: flags.effectiveFlags?.directorCenter === true,
      },
      // "Disabled" here always means "cannot make a real external call" —
      // never whether a key/credential happens to be present, since a
      // testing host must stay externally-inert regardless of config.
      aiEnabled: env().liveProduction ? Boolean(aiStatus?.ready) : false,
      aiConfigured: Boolean(aiStatus?.ready),
      stripeEnabled: false,
      stripeConfigured: Boolean(stripeStatus?.checkoutReady),
      emailSmsEnabled: false,
      emailConfigured: Boolean(emailStatus?.ready),
      testerCount,
      openFeedbackCount,
      lastSmokeResult: ensureTestingHealth(store).lastSmokeResult || null,
      lastBackupAt: ensureTestingHealth(store).lastBackupAt || null,
      openErrorCount: typeof listRecentErrors === "function" ? listRecentErrors().length : 0,
    });
  }

  /** Plain-language Admin Health Center payload for Owner Testing Home. */
  async function handleHealthCenter(request, response, ctx) {
    let store;
    let databaseConnected = true;
    try {
      store = readStore();
    } catch {
      databaseConnected = false;
      store = { siteContent: {}, familyFoundation: {}, testingFeedback: {}, platformResilience: {} };
    }
    if (!assertLabAccess(store, response)) return;
    const flags = expansionFlags.publicExpansionFeatureFlagsPayload(store.siteContent?.featureFlags, {
      environment: env(),
      isVerifiedAdmin: true,
    });
    const stripeStatus = typeof getStripeConfigStatus === "function" ? getStripeConfigStatus() : null;
    const aiStatus = typeof getAiConfigStatus === "function" ? getAiConfigStatus() : null;
    const emailStatus = typeof getSupportEmailConfigStatus === "function" ? getSupportEmailConfigStatus() : null;
    const health = ensureTestingHealth(store);
    const recentErrors = typeof listRecentErrors === "function" ? listRecentErrors().slice(0, 8) : [];
    const pendingFailedSaves = (() => {
      try {
        return listValues(store.platformResilience?.failedSaves || {}).filter((item) => item && !item.resolvedAt).length;
      } catch { return 0; }
    })();
    const testerCount = listValues(store.familyFoundation?.fakeAccounts || {}).length;
    let openFeedbackCount = 0;
    try {
      openFeedbackCount = testingFeedbackModel.listThreadsForAdmin(store, { status: "open" }).length
        + testingFeedbackModel.listThreadsForAdmin(store, { status: "in_progress" }).length;
    } catch { openFeedbackCount = 0; }
    let autoBugOpen = 0;
    try {
      autoBugOpen = typeof openAutoBugCount === "function" ? Number(openAutoBugCount(store) || 0) : 0;
    } catch { autoBugOpen = 0; }

    const labelFor = (state) => ({
      working: "Working",
      attention: "Needs attention",
      missing: "Not configured",
      disabled: "Disabled for testing",
    }[state] || state);

    const databaseState = databaseConnected ? "working" : "attention";
    const smoke = health.lastSmokeResult || null;
    const smokeState = !smoke ? "missing" : (smoke.ok ? "working" : "attention");
    const backupState = health.lastBackupAt ? "working" : "missing";
    const errorsState = recentErrors.length || autoBugOpen ? "attention" : "working";
    const syncState = pendingFailedSaves ? "attention" : "working";
    const commit = typeof getGitSha === "function" ? getGitSha() : "";

    jsonResponse(response, 200, {
      ok: true,
      testingBanner: model.TESTING_BANNER,
      deployedCommit: commit,
      items: [
        { key: "deployedCommit", label: "Deployed commit", state: commit ? "working" : "missing", stateLabel: labelFor(commit ? "working" : "missing"), detail: commit ? commit.slice(0, 12) : "Not reported" },
        { key: "database", label: "Database", state: databaseState, stateLabel: labelFor(databaseState), detail: databaseConnected ? String(process.env.DATABASE_PROVIDER || "local-json") : "Not connected" },
        { key: "appBoot", label: "App boot", state: "working", stateLabel: labelFor("working"), detail: "Server is responding. Device-side boot issues appear in Testing Feedback diagnostics." },
        { key: "openErrors", label: "Open errors", state: errorsState, stateLabel: labelFor(errorsState), detail: recentErrors.length ? `${recentErrors.length} recent sanitized error(s)` : "None", errors: recentErrors },
        { key: "autoBugs", label: "Automated bug records", state: autoBugOpen ? "attention" : "working", stateLabel: labelFor(autoBugOpen ? "attention" : "working"), detail: String(autoBugOpen) },
        { key: "failedSync", label: "Failed sync count", state: syncState, stateLabel: labelFor(syncState), detail: String(pendingFailedSaves) },
        { key: "smokeTest", label: "Latest smoke-test result", state: smokeState, stateLabel: labelFor(smokeState), detail: smoke ? `${smoke.ok ? "Passed" : "Failed"} at ${smoke.at || "unknown"}` : "Not configured", smoke },
        { key: "backup", label: "Last successful backup", state: backupState, stateLabel: labelFor(backupState), detail: health.lastBackupAt || "Not configured" },
        { key: "testingLab", label: "Testing Lab flag", state: flags.effectiveFlags?.testingLab ? "working" : "attention", stateLabel: labelFor(flags.effectiveFlags?.testingLab ? "working" : "attention"), detail: flags.effectiveFlags?.testingLab ? "Enabled" : "Disabled" },
        { key: "stripe", label: "Stripe", state: "disabled", stateLabel: labelFor("disabled"), detail: stripeStatus?.checkoutReady ? "Credentials present — still disabled for testing" : "Disabled for testing" },
        { key: "emailSms", label: "Email / SMS", state: "disabled", stateLabel: labelFor("disabled"), detail: emailStatus?.ready ? "Credentials present — still disabled for testing" : "Disabled for testing" },
        { key: "ai", label: "AI (OpenAI)", state: "disabled", stateLabel: labelFor("disabled"), detail: aiStatus?.ready ? "Credentials present — still disabled for testing" : "Disabled for testing" },
        { key: "testers", label: "Active tester count", state: "working", stateLabel: labelFor("working"), detail: String(testerCount) },
        { key: "feedback", label: "Open feedback count", state: openFeedbackCount ? "attention" : "working", stateLabel: labelFor(openFeedbackCount ? "attention" : "working"), detail: String(openFeedbackCount) },
      ],
      sentry: {
        configured: Boolean(String(process.env.SENTRY_DSN_TESTING || "").trim()) && !env().liveProduction,
        note: "Sentry DSN is never shown here. Configure SENTRY_DSN_TESTING on Render only.",
      },
      autoBugs: {
        openCount: autoBugOpen,
        note: "Sanitized automated bug records only. Never includes private childcare or payment data.",
      },
    });
  }

  async function handleSmokeResult(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const health = ensureTestingHealth(store);
    health.lastSmokeResult = {
      ok: body.ok === true,
      passed: Number(body.passed) || 0,
      targetHost: String(body.targetHost || "").slice(0, 120),
      deployedCommit: String(body.deployedCommit || (typeof getGitSha === "function" ? getGitSha() : "")).slice(0, 40),
      at: String(body.at || new Date().toISOString()).slice(0, 40),
      // Never persist the tester email — only the disposable domain marker.
      testerEmailDomain: String(body.testerEmailDomain || "example.invalid").slice(0, 80),
    };
    writeStore(store);
    if (body.ok === false && typeof ingestAutoBugFromSmoke === "function") {
      try {
        ingestAutoBugFromSmoke({
          ok: false,
          message: String(body.message || "Deployed smoke test failed").slice(0, 240),
          deployedCommit: health.lastSmokeResult.deployedCommit,
          targetHost: health.lastSmokeResult.targetHost,
          failures: Array.isArray(body.failures) ? body.failures : [],
        });
      } catch { /* never fail smoke-result write on bug ingest */ }
    }
    jsonResponse(response, 200, { ok: true, lastSmokeResult: health.lastSmokeResult });
  }

  async function handleSeed(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const scenario = body.scenario || model.SCENARIO_PACKS.SMALL_CENTER;
    try {
      const seeded = body.reset
        ? fixtures.resetPhase18Preview(store, {
          adminEmail: ctx.adminEmail,
          scenario,
          organizationId: body.organizationId || "",
        })
        : fixtures.ensurePhase18Preview(store, {
          adminEmail: ctx.adminEmail,
          scenario,
          organizationId: body.organizationId || "",
        });
      if (!model.isFakeOrganizationId(seeded.organizationId)) {
        return deny(response, 403, "real_target_rejected", "Testing Lab cannot target non-fake organizations.");
      }
      writeStore(store);
      jsonResponse(response, 200, {
        ok: true,
        seeded: true,
        ...seeded,
        testingBanner: model.TESTING_BANNER,
        noPasswordsIncluded: true,
      });
    } catch (error) {
      deny(response, 400, "seed_failed", error.message || "Seed failed.");
    }
  }

  // Phase 23 final handoff: one owner action that gets the whole testing site
  // ready — seeds a solo Home Daycare and a multi-classroom Center, turns on
  // every completed testing feature flag, and issues a fresh one-time
  // password for all 10 fake-account roles (Platform Admin uses the real
  // admin login, not a fake account). Every password is generated fresh on
  // each call and returned exactly once in this response — never stored in
  // plaintext, never logged, never written to a fixture file.
  const ONBOARD_ROLE_PLAN = [
    {
      role: "Center Owner",
      kind: familyModel.FAKE_ACCOUNT_KINDS.OWNER,
      orgFrom: "center",
      program: "Meadow Lane Growing Center (fake, multi-classroom)",
      sees: "Everything for her own center: classrooms, staff, billing, enrollment, reports.",
      denied: "Nothing — she owns this center. (Cannot see other fake organizations.)",
    },
    {
      role: "Director",
      kind: "director",
      orgFrom: "center",
      program: "Meadow Lane Growing Center (fake, multi-classroom)",
      sees: "Classrooms, staff, enrollment, records, licensing, reports for her center.",
      denied: "Billing (owner-only in this preview).",
    },
    {
      role: "Solo Home Daycare Provider",
      kind: "home_daycare",
      orgFrom: "fixed",
      program: "Sunny Corner Home Daycare (fake, solo provider)",
      sees: "Her own solo daycare: children, schedules, forms, billing, Classroom Assistant.",
      denied: "Any center-only tools (classrooms/staff directory) — she runs a home daycare, not a center.",
    },
    {
      role: "Lead Teacher",
      kind: "lead_teacher",
      orgFrom: "center",
      program: "Meadow Lane Growing Center (fake, multi-classroom)",
      sees: "Her assigned classroom's children, daily logs, activities, messages.",
      denied: "Staff management, billing, enrollment, other classrooms' children.",
    },
    {
      role: "Assistant",
      kind: "assistant_broad",
      orgFrom: "center",
      program: "Meadow Lane Growing Center (fake, multi-classroom)",
      sees: "Daily logs, activities, and messages for the children she's assigned to.",
      denied: "Staff management, billing, enrollment, director-only tools.",
    },
    {
      role: "Curriculum Only Provider",
      kind: "curriculum_only",
      orgFrom: "fixed",
      program: "(no children/classroom — curriculum-only plan)",
      sees: "Lesson Plans, Monthly Curriculum, Activity Center, Calendar, her own billing/settings.",
      denied: "Forms, staff management, permissions, reports, classrooms, families, enrollment.",
    },
    {
      role: "Guardian (multiple children)",
      kind: "parent_multi_child",
      orgFrom: "home",
      program: "Lin Household — Ava Lin & Ben Lin (fake children)",
      sees: "Only her own children's information in Family Hub.",
      denied: "Any other family's information, and every provider/staff tool.",
    },
    {
      role: "Financially Responsible Guardian",
      kind: "financial_guardian",
      orgFrom: "home",
      program: "Lin Household (fake) — billing contact",
      sees: "Her own family's billing/invoices in Family Hub.",
      denied: "Any other family's billing, and every provider/staff tool.",
    },
    {
      role: "Pickup-Only Guardian",
      kind: "pickup_only",
      orgFrom: "home",
      program: "Cole Household — Dana Cole (fake child)",
      sees: "Only pickup-relevant information for Dana.",
      denied: "Billing, forms, messages, and any other family's information.",
    },
    {
      role: "Restricted Guardian",
      kind: "restricted_guardian",
      orgFrom: "home",
      program: "Cole Household — Dana Cole (fake child)",
      sees: "A limited, access-controlled view — intentionally less than a full guardian.",
      denied: "Digital access beyond her configured restricted level; any other family's information.",
    },
  ];

  async function handleOnboardEverything(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    try {
      const flags = store.siteContent?.featureFlags || {};
      store.siteContent = store.siteContent || {};
      store.siteContent.featureFlags = {
        ...flags,
        directorCenter: true,
        formsCenter: true,
        familyHub: true,
        testingLab: true,
      };

      const seededHome = fixtures.ensurePhase18Preview(store, {
        adminEmail: ctx.adminEmail,
        scenario: model.SCENARIO_PACKS.HOME_DAYCARE,
      });
      const seededCenter = fixtures.ensurePhase18Preview(store, {
        adminEmail: ctx.adminEmail,
        scenario: model.SCENARIO_PACKS.GROWING_CENTER,
      });
      if (!model.isFakeOrganizationId(seededHome.organizationId) || !model.isFakeOrganizationId(seededCenter.organizationId)) {
        return deny(response, 403, "real_target_rejected", "Testing Lab cannot target non-fake organizations.");
      }

      const allAccounts = listValues(store.familyFoundation?.fakeAccounts || {});
      const orgIdForRole = (orgFrom) => {
        if (orgFrom === "center") return seededCenter.organizationId;
        if (orgFrom === "home") return seededHome.organizationId;
        return ""; // "fixed" kinds (curriculum_only/home_daycare) are unique — no org filter needed.
      };

      const logins = [];
      const missing = [];
      for (const plan of ONBOARD_ROLE_PLAN) {
        const targetOrgId = orgIdForRole(plan.orgFrom);
        const account = allAccounts.find((row) => row.kind === plan.kind && (!targetOrgId || row.organizationId === targetOrgId));
        if (!account) {
          missing.push(plan.role);
          continue;
        }
        const password = tempPasswordAuth.generateTemporaryPassword();
        const hash = tempPasswordAuth.hashPassword(password);
        account.passwordHash = hash;
        account.mustChangePassword = false;
        account.lastPasswordIssuedAt = model.nowIso();
        account.updatedAt = model.nowIso();
        store.familyFoundation.fakeAccounts[account.id] = account;
        const mainAppIdentity = familyModel.mainAppIdentityForFakeAccount(account);
        store.users = store.users || {};
        const userKey = safeLower(account.email);
        store.users[userKey] = {
          ...(store.users[userKey] || {}),
          email: account.email,
          displayName: account.displayName,
          passwordHash: hash,
          serverPasswordAuth: true,
          mustChangePassword: false,
          testingOnly: true,
          testingAccount: true,
          fakeAccountId: account.id,
          fakeAccountKind: account.kind,
          organizationId: account.organizationId,
          role: mainAppIdentity.role,
          accountType: mainAppIdentity.accountType,
          familyHubGuardian: mainAppIdentity.familyHubGuardian,
          updatedAt: model.nowIso(),
        };
        logins.push({
          role: plan.role,
          email: account.email,
          temporaryPassword: password,
          program: plan.program,
          sees: plan.sees,
          denied: plan.denied,
        });
      }
      model.appendAudit(store, {
        organizationId: seededCenter.organizationId,
        action: "onboard_everything",
        actorEmail: ctx.adminEmail,
        detail: `Testing environment onboarded: ${logins.length} fake logins issued (plaintext not logged), feature flags enabled.`,
      });
      writeStore(store);
      jsonResponse(response, 200, {
        ok: true,
        testingBanner: model.TESTING_BANNER,
        note: "Copy every password now — none are stored in plaintext and none will be shown again. This response is never logged.",
        featureFlagsEnabled: ["directorCenter", "formsCenter", "familyHub", "testingLab"],
        homeDaycare: { organizationId: seededHome.organizationId, alreadySeeded: Boolean(seededHome.alreadySeeded) },
        center: { organizationId: seededCenter.organizationId, alreadySeeded: Boolean(seededCenter.alreadySeeded) },
        logins,
        missingRoles: missing,
      });
    } catch (error) {
      deny(response, 400, "onboard_failed", error.message || "Onboarding failed.");
    }
  }

  async function handleIssuePassword(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const account = store.familyFoundation?.fakeAccounts?.[body.accountId];
    if (!account) return deny(response, 404, "not_found");
    if (!model.isFakeOrganizationId(account.organizationId)) {
      return deny(response, 403, "real_target_rejected");
    }
    if (!model.isExampleInvalidEmail(account.email)) {
      return deny(response, 403, "non_fake_email_rejected", "Fake accounts must use @example.invalid.");
    }
    const password = tempPasswordAuth.generateTemporaryPassword();
    const hash = tempPasswordAuth.hashPassword(password);
    account.passwordHash = hash;
    account.mustChangePassword = body.forceChange === true;
    account.lastPasswordIssuedAt = model.nowIso();
    account.updatedAt = model.nowIso();
    store.familyFoundation.fakeAccounts[account.id] = account;
    // Mirror into users for password-login without logging plaintext.
    // Phase 23 fix: this previously omitted serverPasswordAuth (verifyServerPasswordLogin
    // requires it to be true before it will even compare passwordHash — every fake-account
    // real login through this endpoint was silently rejected with 401) and never mapped
    // accountType/role/familyHubGuardian, so a successful login would have landed everyone
    // on the generic default Solo Provider experience regardless of their actual fake role.
    store.users = store.users || {};
    const userKey = safeLower(account.email);
    const mainAppIdentity = familyModel.mainAppIdentityForFakeAccount(account);
    store.users[userKey] = {
      ...(store.users[userKey] || {}),
      email: account.email,
      displayName: account.displayName,
      passwordHash: hash,
      serverPasswordAuth: true,
      mustChangePassword: account.mustChangePassword,
      testingOnly: true,
      testingAccount: true,
      fakeAccountId: account.id,
      fakeAccountKind: account.kind,
      organizationId: account.organizationId,
      role: mainAppIdentity.role,
      accountType: mainAppIdentity.accountType,
      familyHubGuardian: mainAppIdentity.familyHubGuardian,
      updatedAt: model.nowIso(),
    };
    model.appendAudit(store, {
      organizationId: account.organizationId,
      action: "fake_password_issued",
      actorEmail: ctx.adminEmail,
      detail: `Password issued for fake account kind=${account.kind} (plaintext not logged)`,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      accountId: account.id,
      email: account.email,
      temporaryPassword: password,
      displayedOnce: true,
      forceChange: account.mustChangePassword,
      testingBanner: model.ACCOUNT_BANNER,
      note: "Copy now — password is not stored in plaintext and will not be shown again.",
    });
  }

  async function handleRevokeSession(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const account = store.familyFoundation?.fakeAccounts?.[body.accountId];
    if (!account) return deny(response, 404, "not_found");
    account.passwordHash = "";
    account.updatedAt = model.nowIso();
    store.familyFoundation.fakeAccounts[account.id] = account;
    if (store.users?.[safeLower(account.email)]) {
      delete store.users[safeLower(account.email)].passwordHash;
    }
    // Clear member sessions for this email if present
    if (store.memberSessions) {
      for (const [id, session] of Object.entries(store.memberSessions)) {
        if (safeLower(session.email) === safeLower(account.email)) {
          delete store.memberSessions[id];
        }
      }
    }
    model.appendAudit(store, {
      organizationId: account.organizationId,
      action: "fake_session_revoked",
      actorEmail: ctx.adminEmail,
      detail: `Revoked sessions for kind=${account.kind}`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, revoked: true, testingBanner: model.TESTING_BANNER });
  }

  function revokeMemberSessionsForEmail(store, email) {
    if (!store.memberSessions) return;
    const target = safeLower(email);
    for (const [id, session] of Object.entries(store.memberSessions)) {
      if (safeLower(session.email) === target) delete store.memberSessions[id];
    }
  }

  /** Suspend — reversible. Login is blocked (mirrors the existing real-user "disabled" gate) but the password hash and org/role assignment are preserved so Reactivate can restore access without a reissue. */
  async function handleSuspendAccount(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const account = store.familyFoundation?.fakeAccounts?.[body.accountId];
    if (!account) return deny(response, 404, "not_found");
    account.active = false;
    account.updatedAt = model.nowIso();
    store.familyFoundation.fakeAccounts[account.id] = account;
    const userKey = safeLower(account.email);
    if (store.users?.[userKey]) {
      store.users[userKey].disabled = true;
      store.users[userKey].updatedAt = model.nowIso();
    }
    revokeMemberSessionsForEmail(store, account.email);
    model.appendAudit(store, {
      organizationId: account.organizationId,
      action: "fake_account_suspended",
      actorEmail: ctx.adminEmail,
      detail: `Suspended fake account kind=${account.kind} — reversible via Reactivate`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, accountId: account.id, active: false, testingBanner: model.TESTING_BANNER });
  }

  /** Reactivate — restores a suspended (not ended) account to normal login without needing a new password. */
  async function handleReactivateAccount(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const account = store.familyFoundation?.fakeAccounts?.[body.accountId];
    if (!account) return deny(response, 404, "not_found");
    account.active = true;
    account.updatedAt = model.nowIso();
    store.familyFoundation.fakeAccounts[account.id] = account;
    const userKey = safeLower(account.email);
    if (store.users?.[userKey]) {
      store.users[userKey].disabled = false;
      store.users[userKey].updatedAt = model.nowIso();
    }
    model.appendAudit(store, {
      organizationId: account.organizationId,
      action: "fake_account_reactivated",
      actorEmail: ctx.adminEmail,
      detail: `Reactivated fake account kind=${account.kind}`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, accountId: account.id, active: true, testingBanner: model.TESTING_BANNER });
  }

  /** End — permanent (until explicitly reissued): blocks login AND clears every stored credential so there is nothing left to "view again", matching the never-view-a-previous-password guarantee even for a retired account. */
  async function handleEndAccount(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const account = store.familyFoundation?.fakeAccounts?.[body.accountId];
    if (!account) return deny(response, 404, "not_found");
    account.active = false;
    account.passwordHash = "";
    account.mustChangePassword = false;
    account.updatedAt = model.nowIso();
    store.familyFoundation.fakeAccounts[account.id] = account;
    const userKey = safeLower(account.email);
    if (store.users?.[userKey]) {
      store.users[userKey].disabled = true;
      store.users[userKey].passwordHash = "";
      store.users[userKey].tempPasswordHash = "";
      store.users[userKey].updatedAt = model.nowIso();
    }
    revokeMemberSessionsForEmail(store, account.email);
    model.appendAudit(store, {
      organizationId: account.organizationId,
      action: "fake_account_ended",
      actorEmail: ctx.adminEmail,
      detail: `Ended fake account kind=${account.kind} — every stored credential cleared`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, accountId: account.id, active: false, ended: true, testingBanner: model.TESTING_BANNER });
  }

  /**
   * Issues a fresh password for every fake account currently assigned to one
   * fake organization in a single action — "generate the core role logins
   * for this tester organization" — regardless of exactly which kinds that
   * organization's scenario pack happens to include. Never re-shows an
   * already-issued password; every value here is freshly generated.
   */
  async function handleIssuePasswordsForOrg(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const organizationId = String(body.organizationId || "");
    if (!model.isFakeOrganizationId(organizationId)) {
      return deny(response, 403, "real_target_rejected", "Testing Lab cannot target non-fake organizations.");
    }
    const accounts = listValues(store.familyFoundation?.fakeAccounts || {})
      .filter((row) => row.organizationId === organizationId && model.isExampleInvalidEmail(row.email));
    if (!accounts.length) return deny(response, 404, "not_found", "No fake accounts found for that organization.");
    const logins = [];
    for (const account of accounts) {
      const password = tempPasswordAuth.generateTemporaryPassword();
      const hash = tempPasswordAuth.hashPassword(password);
      account.passwordHash = hash;
      account.active = true;
      account.mustChangePassword = false;
      account.lastPasswordIssuedAt = model.nowIso();
      account.updatedAt = model.nowIso();
      store.familyFoundation.fakeAccounts[account.id] = account;
      const mainAppIdentity = familyModel.mainAppIdentityForFakeAccount(account);
      store.users = store.users || {};
      const userKey = safeLower(account.email);
      store.users[userKey] = {
        ...(store.users[userKey] || {}),
        email: account.email,
        displayName: account.displayName,
        passwordHash: hash,
        serverPasswordAuth: true,
        mustChangePassword: false,
        disabled: false,
        testingOnly: true,
        testingAccount: true,
        fakeAccountId: account.id,
        fakeAccountKind: account.kind,
        organizationId: account.organizationId,
        role: mainAppIdentity.role,
        accountType: mainAppIdentity.accountType,
        familyHubGuardian: mainAppIdentity.familyHubGuardian,
        updatedAt: model.nowIso(),
      };
      logins.push({
        accountId: account.id,
        kind: account.kind,
        email: account.email,
        role: mainAppIdentity.role,
        accountType: mainAppIdentity.accountType,
        organizationId: account.organizationId,
        temporaryPassword: password,
      });
    }
    model.appendAudit(store, {
      organizationId,
      action: "fake_org_passwords_issued",
      actorEmail: ctx.adminEmail,
      detail: `Issued ${logins.length} fresh password(s) for organization ${organizationId} (plaintext not logged)`,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      organizationId,
      logins,
      note: "Copy every password now — none are stored in plaintext and none will be shown again.",
      testingBanner: model.TESTING_BANNER,
    });
  }

  async function handleStartRolePreview(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const orgId = store.testingLab.session?.organizationId || body.organizationId;
    if (!model.isFakeOrganizationId(orgId)) return deny(response, 403, "real_target_rejected");
    const kind = body.targetKind || "director";
    const account = listValues(store.familyFoundation?.fakeAccounts || {})
      .find((a) => a.organizationId === orgId && a.kind === kind);
    const preview = model.createRolePreviewSession({
      organizationId: orgId,
      targetKind: kind,
      membershipId: account?.staffMembershipId || body.membershipId || "",
      contactId: account?.contactId || "",
      startedByEmail: ctx.adminEmail,
      label: `Role preview: ${kind}`,
    });
    store.testingLab.rolePreviews[preview.id] = preview;
    store.testingLab.session.rolePreviewId = preview.id;
    model.appendAudit(store, {
      organizationId: orgId,
      action: "role_preview_started",
      actorEmail: ctx.adminEmail,
      detail: `Started role preview for ${kind} (stored admin role unchanged)`,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      preview: {
        id: preview.id,
        targetKind: preview.targetKind,
        membershipId: preview.membershipId,
        contactId: preview.contactId,
        label: preview.label,
        expiresAt: preview.expiresAt,
        doesNotChangeStoredAdminRole: true,
        banner: `Role Preview — ${kind} (temporary)`,
      },
      testingBanner: model.TESTING_BANNER,
    });
  }

  async function handleExitRolePreview(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const id = body.previewId || store.testingLab.session?.rolePreviewId;
    const preview = store.testingLab.rolePreviews[id];
    if (preview) {
      preview.active = false;
      preview.exitedAt = model.nowIso();
      store.testingLab.rolePreviews[id] = preview;
    }
    if (store.testingLab.session) store.testingLab.session.rolePreviewId = "";
    model.appendAudit(store, {
      organizationId: store.testingLab.session?.organizationId || "",
      action: "role_preview_exited",
      actorEmail: ctx.adminEmail,
      detail: "Exited role preview",
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, exited: true, testingBanner: model.TESTING_BANNER });
  }

  async function handleSetDevice(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const device = body.device || "desktop";
    if (!model.DEVICE_PRESETS[device]) return deny(response, 400, "invalid_device");
    store.testingLab.session.device = device;
    const session = {
      id: model.newId("tldev"),
      organizationId: store.testingLab.session.organizationId,
      device,
      preset: model.DEVICE_PRESETS[device],
      accountId: body.accountId || store.testingLab.session.accountId || "",
      createdAt: model.nowIso(),
      testingOnly: true,
      note: "Uses real application UI; iframe alone does not prove native-app behavior.",
    };
    store.testingLab.deviceSessions[session.id] = session;
    model.appendAudit(store, {
      organizationId: session.organizationId,
      action: "device_selected",
      actorEmail: ctx.adminEmail,
      detail: `Device ${device} ${session.preset.width}x${session.preset.height}`,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      deviceSession: session,
      openInTabHint: `Use viewport ${session.preset.width}x${session.preset.height} with the selected fake account or role preview.`,
      testingBanner: model.TESTING_BANNER,
    });
  }

  async function handleSetFlags(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    store.siteContent = store.siteContent || {};
    store.siteContent.featureFlags = store.siteContent.featureFlags || {};
    const allowed = ["directorCenter", "formsCenter", "familyHub", "testingLab"];
    const before = { ...store.siteContent.featureFlags };
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        store.siteContent.featureFlags[key] = body[key] === true;
      }
    }
    // Never allow turning on flags that would unlock production — env still gates
    if (env().liveProduction) {
      for (const key of allowed) store.siteContent.featureFlags[key] = false;
    }
    model.appendAudit(store, {
      organizationId: store.testingLab.session?.organizationId || "",
      action: "flag_changed",
      actorEmail: ctx.adminEmail,
      detail: `Flags updated (secrets not exposed). Before keys: ${Object.keys(before).join(",")}`,
    });
    writeStore(store);
    const payload = expansionFlags.publicExpansionFeatureFlagsPayload(store.siteContent.featureFlags, {
      environment: env(),
      isVerifiedAdmin: true,
    });
    jsonResponse(response, 200, {
      ok: true,
      storedFlags: payload.storedFlags,
      effectiveFlags: payload.effectiveFlags,
      policy: payload.policy,
      testingBanner: model.TESTING_BANNER,
    });
  }

  async function handleChecklistNote(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const orgId = store.testingLab.session?.organizationId;
    if (!model.isFakeOrganizationId(orgId)) return deny(response, 403, "real_target_rejected");
    const note = model.createTestingNote({
      organizationId: orgId,
      checklistItem: body.checklistItem,
      status: body.status,
      body: body.body,
      authorEmail: ctx.adminEmail,
    });
    store.testingLab.notes[note.id] = note;
    const chk = listValues(store.testingLab.checklist).find((c) => c.item === body.checklistItem);
    if (chk) {
      chk.status = note.status;
      chk.updatedAt = model.nowIso();
      store.testingLab.checklist[chk.id] = chk;
    }
    model.appendAudit(store, {
      organizationId: orgId,
      action: "testing_note_created",
      actorEmail: ctx.adminEmail,
      detail: `Note ${note.status} on ${note.checklistItem}`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, note, testingBanner: model.TESTING_BANNER });
  }

  async function handleSelectAccount(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const account = store.familyFoundation?.fakeAccounts?.[body.accountId];
    if (!account) return deny(response, 404, "not_found");
    if (account.organizationId !== store.testingLab.session?.organizationId) {
      return deny(response, 403, "organization_mismatch");
    }
    store.testingLab.session.accountId = account.id;
    model.appendAudit(store, {
      organizationId: account.organizationId,
      action: "account_selected",
      actorEmail: ctx.adminEmail,
      detail: `Selected fake account kind=${account.kind}`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, account: publicAccount(account), testingBanner: model.TESTING_BANNER });
  }

  async function handleSetFeatureState(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const state = body.featureState || "";
    if (!model.FEATURE_STATES.includes(state)) return deny(response, 400, "invalid_state");
    store.testingLab.session.featureState = state;
    model.appendAudit(store, {
      organizationId: store.testingLab.session.organizationId,
      action: "feature_state_selected",
      actorEmail: ctx.adminEmail,
      detail: state,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, featureState: state, testingBanner: model.TESTING_BANNER });
  }

  async function handleResetPreview(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const orgId = body.organizationId || store.testingLab.session?.organizationId;
    if (!model.isFakeOrganizationId(orgId)) {
      return deny(response, 403, "real_target_rejected", "Reset restricted to validated fake organizations.");
    }
    if (body.confirm !== true) {
      return jsonResponse(response, 400, {
        ok: false,
        code: "confirmation_required",
        previewImpact: {
          organizationId: orgId,
          willReseedScenario: body.scenario || store.testingLab.session?.scenario,
          clears: ["lab notes", "role previews", "device sessions", "checklist progress"],
          neverTargets: ["production", "main", "real users", "real Stripe"],
        },
      });
    }
    try {
      const seeded = fixtures.resetPhase18Preview(store, {
        adminEmail: ctx.adminEmail,
        scenario: body.scenario || store.testingLab.session?.scenario,
        organizationId: orgId,
      });
      writeStore(store);
      jsonResponse(response, 200, { ok: true, reset: true, ...seeded, testingBanner: model.TESTING_BANNER });
    } catch (error) {
      deny(response, 400, "reset_failed", error.message);
    }
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "GET" && path === `${BASE}/dashboard`) return (req, res, ctx) => handleDashboard(req, res, ctx);
    if (method === "GET" && path === `${BASE}/health-center`) return (req, res, ctx) => handleHealthCenter(req, res, ctx);
    if (method === "POST" && path === `${BASE}/smoke-result`) return (req, res, ctx) => handleSmokeResult(req, res, ctx);
    if (method === "GET" && path === `${BASE}/health`) return (req, res, ctx) => resilience.handleHealth(req, res, ctx);
    if (method === "GET" && path === `${BASE}/activity`) return (req, res, ctx) => resilience.handleActivityPage(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "POST" && path === `${BASE}/onboard-everything`) return (req, res, ctx) => handleOnboardEverything(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/issue-password`) return (req, res, ctx) => handleIssuePassword(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/revoke-session`) return (req, res, ctx) => handleRevokeSession(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/suspend`) return (req, res, ctx) => handleSuspendAccount(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/reactivate`) return (req, res, ctx) => handleReactivateAccount(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/end`) return (req, res, ctx) => handleEndAccount(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/issue-passwords-for-org`) return (req, res, ctx) => handleIssuePasswordsForOrg(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/select`) return (req, res, ctx) => handleSelectAccount(req, res, ctx);
    if (method === "POST" && path === `${BASE}/role-preview/start`) return (req, res, ctx) => handleStartRolePreview(req, res, ctx);
    if (method === "POST" && path === `${BASE}/role-preview/exit`) return (req, res, ctx) => handleExitRolePreview(req, res, ctx);
    if (method === "POST" && path === `${BASE}/device`) return (req, res, ctx) => handleSetDevice(req, res, ctx);
    if (method === "POST" && path === `${BASE}/flags`) return (req, res, ctx) => handleSetFlags(req, res, ctx);
    if (method === "POST" && path === `${BASE}/checklist/note`) return (req, res, ctx) => handleChecklistNote(req, res, ctx);
    if (method === "POST" && path === `${BASE}/feature-state`) return (req, res, ctx) => handleSetFeatureState(req, res, ctx);
    if (method === "POST" && path === `${BASE}/reset`) return (req, res, ctx) => handleResetPreview(req, res, ctx);
    if (method === "POST" && path === `${BASE}/failed-saves/record`) return (req, res, ctx) => resilience.handleRecordFailedSave(req, res, ctx);
    if (method === "POST" && path === `${BASE}/failed-saves/resolve`) return (req, res, ctx) => resilience.handleResolveFailedSave(req, res, ctx);
    if (method === "POST" && path === `${BASE}/drafts/save`) return (req, res, ctx) => resilience.handleDraftSave(req, res, ctx);
    if (method === "POST" && path === `${BASE}/drafts/load`) return (req, res, ctx) => resilience.handleDraftLoad(req, res, ctx);
    if (method === "POST" && path === `${BASE}/backup/simulate`) return (req, res, ctx) => resilience.handleBackupSimulate(req, res, ctx);
    if (method === "POST" && path === `${BASE}/restore/preview`) return (req, res, ctx) => resilience.handleRestorePreview(req, res, ctx);
    if (method === "POST" && path === `${BASE}/restore/confirm`) return (req, res, ctx) => resilience.handleRestoreConfirm(req, res, ctx);
    if (method === "POST" && path === `${BASE}/resilience/seed`) return (req, res, ctx) => resilience.handleSeedFixtures(req, res, ctx);
    if (method === "POST" && path === `${BASE}/performance/record`) return (req, res, ctx) => resilience.handlePerfRecord(req, res, ctx);
    if (method === "GET" && path === `${BASE}/security-review`) return (req, res, ctx) => phase20.handleSecurityReview(req, res, ctx);
    if (method === "GET" && path === `${BASE}/release-readiness`) return (req, res, ctx) => phase20.handleReleaseReadiness(req, res, ctx);
    if (method === "GET" && path === `${BASE}/migration/inspect`) return (req, res, ctx) => phase20.handleMigrationInspect(req, res, ctx);
    if (method === "GET" && path === `${BASE}/migration/history`) return (req, res, ctx) => phase20.handleMigrationHistory(req, res, ctx);
    if (method === "GET" && path === `${BASE}/migration/report`) return (req, res, ctx) => phase20.handleMigrationReport(req, res, ctx);
    if (method === "POST" && path === `${BASE}/migration/preview`) return (req, res, ctx) => phase20.handleMigrationPreview(req, res, ctx);
    if (method === "POST" && path === `${BASE}/migration/apply`) return (req, res, ctx) => phase20.handleMigrationApply(req, res, ctx);
    if (method === "POST" && path === `${BASE}/migration/rollback`) return (req, res, ctx) => phase20.handleMigrationRollback(req, res, ctx);
    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createTestingLabApi,
  BASE,
};

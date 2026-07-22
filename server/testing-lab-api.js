/**
 * Phase 18 Testing Lab API — /api/testing-lab/*
 * Production always rejects. Admin + ALLOW_TESTING_LAB_ADMIN_PREVIEW + stored testingLab.
 */

const expansionFlags = require("../scripts/expansion-feature-flags.js");
const model = require("../scripts/testing-lab-data-model.js");
const fixtures = require("../scripts/testing-lab-fixtures.js");
const familyModel = require("../scripts/family-foundation-data-model.js");
const tempPasswordAuth = require("./temp-password-auth.js");

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

function createTestingLabApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
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

  async function handleStatus(request, response, ctx) {
    const store = readStore();
    if (!assertLabAccess(store, response)) return;
    model.ensureTestingLabStore(store);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 18,
      featureMarker: "phase18-testing-lab",
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
    const hash = tempPasswordAuth.hashPasswordSha256(password);
    account.passwordHash = hash;
    account.mustChangePassword = body.forceChange === true;
    account.lastPasswordIssuedAt = model.nowIso();
    account.updatedAt = model.nowIso();
    store.familyFoundation.fakeAccounts[account.id] = account;
    // Mirror into users for password-login without logging plaintext
    store.users = store.users || {};
    const userKey = safeLower(account.email);
    store.users[userKey] = {
      ...(store.users[userKey] || {}),
      email: account.email,
      displayName: account.displayName,
      passwordHash: hash,
      testingOnly: true,
      fakeAccountId: account.id,
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
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/issue-password`) return (req, res, ctx) => handleIssuePassword(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/revoke-session`) return (req, res, ctx) => handleRevokeSession(req, res, ctx);
    if (method === "POST" && path === `${BASE}/accounts/select`) return (req, res, ctx) => handleSelectAccount(req, res, ctx);
    if (method === "POST" && path === `${BASE}/role-preview/start`) return (req, res, ctx) => handleStartRolePreview(req, res, ctx);
    if (method === "POST" && path === `${BASE}/role-preview/exit`) return (req, res, ctx) => handleExitRolePreview(req, res, ctx);
    if (method === "POST" && path === `${BASE}/device`) return (req, res, ctx) => handleSetDevice(req, res, ctx);
    if (method === "POST" && path === `${BASE}/flags`) return (req, res, ctx) => handleSetFlags(req, res, ctx);
    if (method === "POST" && path === `${BASE}/checklist/note`) return (req, res, ctx) => handleChecklistNote(req, res, ctx);
    if (method === "POST" && path === `${BASE}/feature-state`) return (req, res, ctx) => handleSetFeatureState(req, res, ctx);
    if (method === "POST" && path === `${BASE}/reset`) return (req, res, ctx) => handleResetPreview(req, res, ctx);
    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createTestingLabApi,
  BASE,
};

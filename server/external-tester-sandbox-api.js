/**
 * External Tester Sandbox — /api/external-tester/*
 *
 * Admin routes (create / set-allowed-roles / list) require a verified admin
 * session, the same production lock + stored testingLab flag as the rest of
 * Testing Lab, and only ever target fake organizations.
 *
 * Tester routes (me / switch-role) require an authenticated fake-account
 * member session belonging to THIS sandbox account specifically — never an
 * admin token alone, and never another tester's account. Every real safety
 * decision (which role keys exist at all, which ones this specific account
 * may use, which organization it's locked to) happens inside
 * scripts/external-tester-sandbox-data-model.js, not here — this file only
 * resolves WHO is asking and denies outright on production.
 */

const model = require("../scripts/external-tester-sandbox-data-model.js");
const labModel = require("../scripts/testing-lab-data-model.js");
const expansionFlags = require("../scripts/expansion-feature-flags.js");

const BASE = "/api/external-tester";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
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

function createExternalTesterSandboxApi({
  readStore, writeStore, jsonResponse, readJson, expansionEnvironment,
}) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, { ok: false, error: error || "Access denied.", code });
  }

  /** Same production-lock + stored-flag gate as the rest of Testing Lab — an External Tester Sandbox is an admin-provisioned Testing Lab feature. */
  function assertAdminAccess(store, response) {
    if (env().liveProduction || !env().allowTestingLabAdminPreview) {
      deny(response, 403, "production_preview_rejected", "External Tester Sandbox is unavailable in production.");
      return false;
    }
    const stored = store?.siteContent?.featureFlags || {};
    if (stored.testingLab !== true) {
      deny(response, 403, "feature_unavailable", "Testing Lab feature flag is off.");
      return false;
    }
    return true;
  }

  function findAccountForTester(store, testerEmail) {
    const rows = model.listSandboxAccounts(store);
    return rows.find((row) => row.email === safeLower(testerEmail)) || null;
  }

  // ---- Admin-facing --------------------------------------------------------

  async function handleCreate(request, response, ctx) {
    if (!ctx.adminEmail) return deny(response, 401, "admin_required", "Admin session required.");
    const store = readStore();
    if (!assertAdminAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const organizationId = String(body.organizationId || "");
    if (!labModel.isFakeOrganizationId(organizationId)) {
      return deny(response, 403, "real_target_rejected", "External Tester Sandbox cannot target a non-fake organization.");
    }
    const email = safeLower(body.email || "");
    if (!labModel.isExampleInvalidEmail(email)) {
      return deny(response, 403, "non_fake_email_rejected", "Sandbox accounts must use @example.invalid.");
    }
    const account = model.ensureSandboxAccount(store, {
      organizationId,
      email,
      displayName: body.displayName || "External Tester",
      allowedRoleKeys: body.allowedRoleKeys || [],
    });
    // Sync store.users[email] to the account's own default active role
    // immediately — without this, a tester's very first login (before ever
    // calling switch-role herself) would fall back to account-access.js's
    // generic default identity instead of the role her admin actually chose
    // as the starting point.
    if (account.activeRoleKey) {
      model.switchActiveRole(store, { accountId: account.id, testerEmail: account.email, roleKey: account.activeRoleKey });
    }
    labModel.appendAudit(store, {
      organizationId,
      action: "external_tester_sandbox_created",
      actorEmail: ctx.adminEmail,
      detail: `External Tester Sandbox ${email} created/updated with allowed roles: ${(account.allowedRoleKeys || []).join(", ") || "(none yet)"}`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, account: model.publicSandboxAccount(account) });
  }

  async function handleSetAllowedRoles(request, response, ctx) {
    if (!ctx.adminEmail) return deny(response, 401, "admin_required", "Admin session required.");
    const store = readStore();
    if (!assertAdminAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const account = store.familyFoundation?.fakeAccounts?.[body.accountId];
    if (!account || !model.isSandboxAccount(account)) return deny(response, 404, "not_found");
    const updated = model.setAllowedRoleKeys(store, { accountId: body.accountId, allowedRoleKeys: body.allowedRoleKeys || [] });
    // If the previously active role was just removed from the allow-list,
    // setAllowedRoleKeys already picked a new (allowed) activeRoleKey —
    // sync store.users[email] to match so this tester's next request never
    // reflects a role her admin just revoked.
    if (updated.activeRoleKey) {
      model.switchActiveRole(store, { accountId: updated.id, testerEmail: updated.email, roleKey: updated.activeRoleKey });
    }
    labModel.appendAudit(store, {
      organizationId: updated.organizationId,
      action: "external_tester_sandbox_roles_updated",
      actorEmail: ctx.adminEmail,
      detail: `External Tester Sandbox ${updated.email} allowed roles set to: ${(updated.allowedRoleKeys || []).join(", ") || "(none)"}`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, account: model.publicSandboxAccount(updated) });
  }

  async function handleList(request, response, ctx, organizationId = "") {
    if (!ctx.adminEmail) return deny(response, 401, "admin_required", "Admin session required.");
    const store = readStore();
    if (!assertAdminAccess(store, response)) return;
    const rows = model.listSandboxAccounts(store, organizationId);
    jsonResponse(response, 200, {
      ok: true,
      accounts: rows.map(model.publicSandboxAccount),
      roleCatalog: model.SANDBOX_ROLE_KEYS.map((key) => ({ key, label: model.SANDBOX_ROLE_LABELS[key] })),
    });
  }

  // ---- Tester-facing (never an admin token alone) --------------------------

  async function handleMe(request, response, ctx) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, "auth_required", "Sign in as a testing account to use External Tester Sandbox.");
    if (env().liveProduction) return deny(response, 403, "production_preview_rejected", "External Tester Sandbox is unavailable in production.");
    const store = readStore();
    const account = findAccountForTester(store, ctx.fakeAccountEmail);
    if (!account) return deny(response, 404, "not_found", "This account is not an External Tester Sandbox account.");
    jsonResponse(response, 200, {
      ok: true,
      account: model.publicSandboxAccount(account),
      roleCatalog: (account.allowedRoleKeys || []).map((key) => ({ key, label: model.SANDBOX_ROLE_LABELS[key] })),
    });
  }

  async function handleSwitchRole(request, response, ctx) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, "auth_required", "Sign in as a testing account to switch roles.");
    const store = readStore();
    if (env().liveProduction) return deny(response, 403, "production_preview_rejected", "External Tester Sandbox is unavailable in production.");
    const account = findAccountForTester(store, ctx.fakeAccountEmail);
    if (!account) return deny(response, 404, "not_found", "This account is not an External Tester Sandbox account.");
    const body = await readJson(request).catch(() => ({}));
    const result = model.switchActiveRole(store, {
      accountId: account.id,
      testerEmail: ctx.fakeAccountEmail,
      roleKey: body.roleKey,
    });
    if (!result.ok) {
      const messages = {
        invalid_role: "That is not a valid testing role.",
        role_not_allowed: "Your Platform Admin has not enabled that role for you.",
        forbidden: "You may only switch your own testing role.",
        not_found: "This account is not an External Tester Sandbox account.",
      };
      return deny(response, 403, result.error, messages[result.error] || "Could not switch role.");
    }
    labModel.appendAudit(store, {
      organizationId: result.account.organizationId,
      action: "external_tester_sandbox_role_switched",
      actorEmail: ctx.fakeAccountEmail,
      detail: `Switched to ${result.identity.roleLabel} (${result.identity.roleKey})`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, identity: result.identity, account: model.publicSandboxAccount(result.account) });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "POST" && path === `${BASE}/create`) return (req, res, ctx) => handleCreate(req, res, ctx);
    if (method === "POST" && path === `${BASE}/set-allowed-roles`) return (req, res, ctx) => handleSetAllowedRoles(req, res, ctx);
    if (method === "GET" && path === `${BASE}/list`) return (req, res, ctx) => handleList(req, res, ctx, url?.searchParams?.get("organizationId") || "");
    if (method === "GET" && path === `${BASE}/me`) return (req, res, ctx) => handleMe(req, res, ctx);
    if (method === "POST" && path === `${BASE}/switch-role`) return (req, res, ctx) => handleSwitchRole(req, res, ctx);
    return null;
  }

  return { matchRoute };
}

module.exports = { createExternalTesterSandboxApi, BASE };

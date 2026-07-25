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

const crypto = require("node:crypto");
const model = require("../scripts/external-tester-sandbox-data-model.js");
const labModel = require("../scripts/testing-lab-data-model.js");
const expansionFlags = require("../scripts/expansion-feature-flags.js");
const pilotModel = require("../scripts/home-daycare-pilot-data-model.js");
const foundation = require("../scripts/foundation-data-model.js");
const tempPasswordAuth = require("./temp-password-auth.js");

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

  /**
   * The "Add External Tester" wizard's one-shot action for the Home Daycare
   * Pilot preset: creates one brand-new, isolated fake home-daycare
   * organization, a sandbox account approved for ONLY Solo Home Daycare
   * Provider + Parent/Guardian, generates a starting set of fake children
   * + linked guardians (so the connected data exists from minute one), and
   * issues the one-time password — all in a single admin action.
   */
  async function handleCreatePilot(request, response, ctx) {
    if (!ctx.adminEmail) return deny(response, 401, "admin_required", "Admin session required.");
    const store = readStore();
    if (!assertAdminAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const email = safeLower(body.email || "");
    if (!labModel.isExampleInvalidEmail(email)) {
      return deny(response, 403, "non_fake_email_rejected", "Sandbox accounts must use @example.invalid.");
    }
    const testerName = String(body.testerName || body.displayName || "External Tester").trim().slice(0, 120) || "External Tester";
    const organizationId = `org_pilot_${crypto.randomBytes(6).toString("hex")}`;

    const org = foundation.createOrganizationRecord({
      id: organizationId,
      accountType: "home_daycare",
      ownerEmail: email,
      name: `${testerName} — Home Daycare Pilot (Fake)`,
    });
    store.organizations = store.organizations || {};
    store.organizations[org.id] = org;

    const account = model.ensureSandboxAccount(store, {
      organizationId,
      email,
      displayName: testerName,
      allowedRoleKeys: ["solo_provider", "parent_guardian"],
      pilotType: "home_daycare_pilot",
    });
    if (account.activeRoleKey) {
      model.switchActiveRole(store, { accountId: account.id, testerEmail: account.email, roleKey: account.activeRoleKey });
    }

    const childCount = Math.max(1, Math.min(6, Number(body.childCount) || 2));
    const generated = pilotModel.generateFakeChildrenAndGuardians(store, { organizationId, childCount, createdByEmail: ctx.adminEmail });

    const password = tempPasswordAuth.generateTemporaryPassword();
    const hash = tempPasswordAuth.hashPassword(password);
    const refreshedAccount = store.familyFoundation.fakeAccounts[account.id];
    refreshedAccount.passwordHash = hash;
    refreshedAccount.mustChangePassword = false;
    refreshedAccount.lastPasswordIssuedAt = new Date().toISOString();
    store.familyFoundation.fakeAccounts[account.id] = refreshedAccount;
    store.users = store.users || {};
    const existingUser = store.users[email] || {};
    store.users[email] = { ...existingUser, passwordHash: hash, serverPasswordAuth: true, mustChangePassword: false };

    labModel.appendAudit(store, {
      organizationId,
      action: "home_daycare_pilot_created",
      actorEmail: ctx.adminEmail,
      detail: `Home Daycare Pilot created for ${testerName} <${email}> — ${generated.children.length} fake children, ${generated.guardians.length} fake guardians (plaintext not logged)`,
    });
    writeStore(store);

    const siteUrl = String(env().siteUrl || process.env.SITE_URL || "https://little-learner-hub-testing.onrender.com");
    const welcomeMessage = [
      `Welcome to the Little Learner Hub Home Daycare Pilot, ${testerName}!`,
      "",
      `Testing site: ${siteUrl}`,
      `Login email: ${email}`,
      `Temporary password: ${password}`,
      "",
      "This is a private testing sandbox with fake data only — nothing here is real.",
      "You'll start as a Solo Home Daycare Provider. Use the banner at the top of the",
      "screen to switch to Parent/Guardian and see the same information from the",
      "family's side. A 'Testing Feedback' button is available on every page —",
      "please use it for anything confusing, broken, or worth suggesting.",
    ].join("\n");

    jsonResponse(response, 200, {
      ok: true,
      account: model.publicSandboxAccount(refreshedAccount),
      organizationId,
      temporaryPassword: password,
      welcomeMessage,
      children: generated.children.map((c) => ({ id: c.id, displayName: c.displayName })),
      guardians: generated.guardians.map((g) => ({ id: g.id, displayName: g.displayName, email: g.email })),
      note: "Copy the password and welcome message now — the password will not be shown again.",
    });
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

  /** Admin: confirm-gated reset of ONE org's fake pilot data (children/guardians/updates/messages/forms/billing). Feedback threads and the audit trail are NEVER touched. */
  async function handleResetFakeData(request, response, ctx) {
    if (!ctx.adminEmail) return deny(response, 401, "admin_required", "Admin session required.");
    const store = readStore();
    if (!assertAdminAccess(store, response)) return;
    const body = await readJson(request).catch(() => ({}));
    const organizationId = String(body.organizationId || "");
    if (!labModel.isFakeOrganizationId(organizationId)) return deny(response, 403, "real_target_rejected");
    if (body.confirm !== true) {
      return deny(response, 400, "confirmation_required", "Resetting fake data requires an explicit confirmation.");
    }
    const result = pilotModel.resetPilotData(store, organizationId);
    labModel.appendAudit(store, {
      organizationId,
      action: "home_daycare_pilot_reset",
      actorEmail: ctx.adminEmail,
      detail: `Reset ${result.cleared} fake pilot record(s) for organization ${organizationId}. Testing Feedback threads and the audit trail were preserved.`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, cleared: result.cleared });
  }

  /** Admin: read-only "login activity + testing progress" view for one sandbox account. */
  async function handleActivity(request, response, ctx, accountId) {
    if (!ctx.adminEmail) return deny(response, 401, "admin_required", "Admin session required.");
    const store = readStore();
    if (!assertAdminAccess(store, response)) return;
    const account = store.familyFoundation?.fakeAccounts?.[accountId];
    if (!account || !model.isSandboxAccount(account)) return deny(response, 404, "not_found");
    jsonResponse(response, 200, {
      ok: true,
      account: model.publicSandboxAccount(account),
      checklist: model.HOME_DAYCARE_PILOT_CHECKLIST.map((item) => ({ ...item, complete: Boolean(account.checklistProgress?.[item.key]) })),
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
      checklist: model.HOME_DAYCARE_PILOT_CHECKLIST.map((item) => ({ ...item, complete: Boolean(account.checklistProgress?.[item.key]) })),
    });
  }

  /** Tester: which linked guardian/child relationships exist in her own org — the "which family would you like to preview" candidate list. */
  async function handleGuardianOptions(request, response, ctx) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, "auth_required", "Sign in as a testing account to use External Tester Sandbox.");
    const store = readStore();
    const account = findAccountForTester(store, ctx.fakeAccountEmail);
    if (!account) return deny(response, 404, "not_found", "This account is not an External Tester Sandbox account.");
    const options = model.listGuardianPreviewOptions(store, account.organizationId);
    jsonResponse(response, 200, { ok: true, options });
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
      previewContactId: body.previewContactId || "",
    });
    if (!result.ok) {
      const messages = {
        invalid_role: "That is not a valid testing role.",
        role_not_allowed: "Your Platform Admin has not enabled that role for you.",
        forbidden: "You may only switch your own testing role.",
        not_found: "This account is not an External Tester Sandbox account.",
        guardian_not_found: "That family could not be found in your testing organization.",
      };
      return deny(response, 403, result.error, messages[result.error] || "Could not switch role.");
    }
    if (result.identity.roleKey === "parent_guardian") {
      model.setChecklistItemComplete(store, { accountId: account.id, itemKey: "switch_to_parent", complete: true });
    }
    labModel.appendAudit(store, {
      organizationId: result.account.organizationId,
      action: "external_tester_sandbox_role_switched",
      actorEmail: ctx.fakeAccountEmail,
      detail: `Switched to ${result.identity.roleLabel} (${result.identity.roleKey})`,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, identity: result.identity, account: model.publicSandboxAccount(store.familyFoundation.fakeAccounts[account.id]) });
  }

  /** Tester: read or update her own Home Daycare Pilot checklist progress. */
  async function handleChecklistGet(request, response, ctx) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, "auth_required", "Sign in as a testing account to use External Tester Sandbox.");
    const store = readStore();
    const account = findAccountForTester(store, ctx.fakeAccountEmail);
    if (!account) return deny(response, 404, "not_found");
    jsonResponse(response, 200, { ok: true, checklist: model.HOME_DAYCARE_PILOT_CHECKLIST.map((item) => ({ ...item, complete: Boolean(account.checklistProgress?.[item.key]) })) });
  }

  async function handleChecklistSet(request, response, ctx) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, "auth_required", "Sign in as a testing account to use External Tester Sandbox.");
    const store = readStore();
    const account = findAccountForTester(store, ctx.fakeAccountEmail);
    if (!account) return deny(response, 404, "not_found");
    const body = await readJson(request).catch(() => ({}));
    const progress = model.setChecklistItemComplete(store, { accountId: account.id, itemKey: body.itemKey, complete: body.complete !== false });
    if (!progress) return deny(response, 400, "invalid_item", "That is not a valid checklist item.");
    writeStore(store);
    jsonResponse(response, 200, { ok: true, checklist: model.HOME_DAYCARE_PILOT_CHECKLIST.map((item) => ({ ...item, complete: Boolean(progress[item.key]) })) });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "POST" && path === `${BASE}/create`) return (req, res, ctx) => handleCreate(req, res, ctx);
    if (method === "POST" && path === `${BASE}/create-pilot`) return (req, res, ctx) => handleCreatePilot(req, res, ctx);
    if (method === "POST" && path === `${BASE}/set-allowed-roles`) return (req, res, ctx) => handleSetAllowedRoles(req, res, ctx);
    if (method === "POST" && path === `${BASE}/reset-fake-data`) return (req, res, ctx) => handleResetFakeData(req, res, ctx);
    if (method === "GET" && path === `${BASE}/list`) return (req, res, ctx) => handleList(req, res, ctx, url?.searchParams?.get("organizationId") || "");
    if (method === "GET" && path === `${BASE}/activity`) return (req, res, ctx) => handleActivity(req, res, ctx, url?.searchParams?.get("accountId") || "");
    if (method === "GET" && path === `${BASE}/me`) return (req, res, ctx) => handleMe(req, res, ctx);
    if (method === "GET" && path === `${BASE}/guardian-options`) return (req, res, ctx) => handleGuardianOptions(req, res, ctx);
    if (method === "POST" && path === `${BASE}/switch-role`) return (req, res, ctx) => handleSwitchRole(req, res, ctx);
    if (method === "GET" && path === `${BASE}/checklist`) return (req, res, ctx) => handleChecklistGet(req, res, ctx);
    if (method === "POST" && path === `${BASE}/checklist`) return (req, res, ctx) => handleChecklistSet(req, res, ctx);
    return null;
  }

  return { matchRoute };
}

module.exports = { createExternalTesterSandboxApi, BASE };

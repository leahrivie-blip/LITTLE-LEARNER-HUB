/**
 * External Tester Sandbox — one tester login, admin-assigned self-service
 * role switching among a fixed, admin-chosen set of NON-ADMIN roles, locked
 * to one fake organization for its whole lifetime.
 *
 * This is deliberately a SEPARATE, small module from testing-lab-data-model.js
 * / family-foundation-data-model.js rather than folding role-switching logic
 * into either — the whole point of a sandbox account is a narrower, more
 * strictly enumerated capability than a normal admin-issued fake account
 * (which is Testing-Lab-admin-managed one-role-per-login), so keeping its
 * allow-list and identity-resolution logic in one place makes the "can never
 * become Admin / Testing Lab Admin / AI Outcomes Admin / another
 * organization" guarantee easy to audit in one file.
 *
 * A sandbox account IS stored as a normal row in
 * store.familyFoundation.fakeAccounts (kind = SANDBOX_KIND) so it can reuse
 * every existing password issue/suspend/reactivate/end endpoint in
 * server/testing-lab-api.js for free — this module only adds the
 * allowedRoleKeys / activeRoleKey fields and the role-switch logic on top.
 */

const crypto = require("node:crypto");

const SANDBOX_KIND = "external_tester_sandbox";

// The ONLY role keys a sandbox account can ever hold or switch to. This list
// is intentionally hardcoded and never derived from admin input — an admin
// can only ever choose a SUBSET of THESE, never add a new one, and no
// request body value outside this exact list is ever accepted by
// switchActiveRole()/setAllowedRoleKeys() below. None of these are an admin
// role — Platform Admin, Testing Lab Admin, and AI Outcomes Admin are
// deliberately not representable here at all.
const SANDBOX_ROLE_KEYS = Object.freeze([
  "director",
  "solo_provider",
  "lead_teacher",
  "assistant",
  "parent_guardian",
  "curriculum_only",
]);

const SANDBOX_ROLE_LABELS = Object.freeze({
  director: "Director",
  solo_provider: "Solo Home Daycare Provider",
  lead_teacher: "Lead Teacher",
  assistant: "Assistant",
  parent_guardian: "Parent/Guardian",
  curriculum_only: "Curriculum Only",
});

// Generic fallback identity for each role key — used when the assigned
// organization has no existing fake account of a matching kind to borrow
// richer linked data (staffMembershipId / contactId) from. Mirrors the exact
// role/accountType/familyHubGuardian vocabulary
// scripts/family-foundation-data-model.js#mainAppIdentityForFakeAccount and
// app.js#resolveExperienceRole already expect.
const SANDBOX_ROLE_GENERIC_IDENTITY = Object.freeze({
  director: { role: "director", accountType: "center", familyHubGuardian: false },
  solo_provider: { role: "owner", accountType: "home_daycare", familyHubGuardian: false },
  lead_teacher: { role: "teacher", accountType: "center", familyHubGuardian: false },
  assistant: { role: "assistant", accountType: "center", familyHubGuardian: false },
  // Matches mainAppIdentityForFakeAccount's own guardian branch exactly —
  // fewest possible capabilities, routed straight to Family Hub.
  parent_guardian: { role: "assistant", accountType: "home_daycare", familyHubGuardian: true },
  curriculum_only: { role: "owner", accountType: "curriculum_only", familyHubGuardian: false },
});

// Preferred existing-fake-account kinds to borrow richer linked data
// (staffMembershipId for staff roles, contactId for guardians) from, IF one
// already exists in the sandbox's own assigned organization. Order matters —
// first match wins. Never crosses into a different organizationId.
const SANDBOX_ROLE_DONOR_KINDS = Object.freeze({
  director: ["director"],
  solo_provider: ["home_daycare", "owner"],
  lead_teacher: ["lead_teacher", "teacher"],
  assistant: ["assistant_broad", "assistant_limited", "substitute"],
  parent_guardian: ["parent_multi_child", "parent_one_child", "guardian_shared_households", "restricted_guardian", "pickup_only"],
  curriculum_only: ["curriculum_only"],
});

function isValidRoleKey(value) {
  return SANDBOX_ROLE_KEYS.includes(String(value || ""));
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

/** Every account in this exact organization that is a sandbox — used to keep "one sandbox per email" and to list them for the admin UI. */
function listSandboxAccounts(store, organizationId = "") {
  const rows = listValues(store.familyFoundation?.fakeAccounts || {}).filter((row) => row.kind === SANDBOX_KIND);
  return organizationId ? rows.filter((row) => row.organizationId === organizationId) : rows;
}

function isSandboxAccount(row) {
  return Boolean(row && row.kind === SANDBOX_KIND);
}

/**
 * Sanitizes an admin-supplied role list down to ONLY values from the fixed
 * SANDBOX_ROLE_KEYS enum, de-duplicated, in canonical order. Anything else
 * supplied (typos, an admin-role name, garbage) is silently dropped, never
 * partially honored.
 */
function sanitizeAllowedRoleKeys(rawList) {
  const requested = new Set((Array.isArray(rawList) ? rawList : []).map((v) => String(v || "")));
  return SANDBOX_ROLE_KEYS.filter((key) => requested.has(key));
}

/**
 * Finds an existing fake account of a matching "donor" kind in the SAME
 * organization to borrow contactId/staffMembershipId from — never looks
 * outside organizationId, never returns an admin-kind row, never returns
 * another sandbox account.
 */
function findDonorAccount(store, organizationId, roleKey) {
  const donorKinds = SANDBOX_ROLE_DONOR_KINDS[roleKey] || [];
  const candidates = listValues(store.familyFoundation?.fakeAccounts || {})
    .filter((row) => row.organizationId === organizationId && row.kind !== SANDBOX_KIND);
  for (const kind of donorKinds) {
    const found = candidates.find((row) => row.kind === kind);
    if (found) return found;
  }
  return null;
}

/**
 * Family Hub's own guardian check (server/family-hub-api.js#resolveGuardian)
 * looks up a contact by the LOGGED-IN EMAIL directly — it has no idea about
 * fakeAccountId/contactId fields on store.users. So simply copying a donor's
 * contactId onto the sandbox's own fake-account row is not enough to show
 * real linked-child data; this creates (idempotently, once) a "shadow"
 * contact record that uses the SANDBOX'S OWN EMAIL, cloning the donor's
 * access rules onto it — the donor's own separate account/contact record is
 * never modified, so it keeps working standalone too.
 */
function ensureGuardianShadowContact(store, { organizationId, sandboxAccountId, sandboxEmail, donorContactId }) {
  store.familyFoundation = store.familyFoundation || {};
  store.familyFoundation.contacts = store.familyFoundation.contacts || {};
  store.familyFoundation.accessRules = store.familyFoundation.accessRules || {};
  const shadowContactId = `fcontact_sandbox_${sandboxAccountId}`;
  const donor = store.familyFoundation.contacts[donorContactId];
  if (!donor) return "";

  if (!store.familyFoundation.contacts[shadowContactId]) {
    store.familyFoundation.contacts[shadowContactId] = {
      ...donor,
      id: shadowContactId,
      email: sandboxEmail,
      displayName: "External Tester (Parent/Guardian view)",
      internalNotes: "External Tester Sandbox shadow contact — mirrors an existing guardian's access rules only, never modifies the original contact.",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  // Clone every one of the donor's ACTIVE access rules onto the shadow
  // contact, idempotently (stable derived ids so re-running this never
  // duplicates rules).
  const donorRules = listValues(store.familyFoundation.accessRules)
    .filter((rule) => rule.contactId === donorContactId && rule.status !== "suspended" && rule.status !== "revoked");
  donorRules.forEach((rule) => {
    const shadowRuleId = `farule_sandbox_${sandboxAccountId}_${rule.childId}`;
    store.familyFoundation.accessRules[shadowRuleId] = {
      ...rule,
      id: shadowRuleId,
      contactId: shadowContactId,
      createdByEmail: sandboxEmail,
      updatedAt: nowIso(),
    };
  });
  return shadowContactId;
}

/** Resolves the full main-app identity for a role key within a sandbox's fixed organization. Never trusts anything from outside this module's own fixed tables. */
function resolveIdentityForRoleKey(store, organizationId, roleKey, sandboxContext = {}) {
  const generic = SANDBOX_ROLE_GENERIC_IDENTITY[roleKey];
  if (!generic) return null;
  const donor = findDonorAccount(store, organizationId, roleKey);
  if (!donor) {
    return { ...generic, contactId: "", staffMembershipId: "", donorAccountId: "" };
  }
  let contactId = cleanText(donor.contactId, 160);
  if (generic.familyHubGuardian && donor.contactId && sandboxContext.sandboxAccountId && sandboxContext.sandboxEmail) {
    const shadowId = ensureGuardianShadowContact(store, {
      organizationId,
      sandboxAccountId: sandboxContext.sandboxAccountId,
      sandboxEmail: sandboxContext.sandboxEmail,
      donorContactId: donor.contactId,
    });
    if (shadowId) contactId = shadowId;
  }
  return {
    role: generic.role,
    accountType: generic.accountType,
    familyHubGuardian: generic.familyHubGuardian,
    contactId,
    staffMembershipId: cleanText(donor.staffMembershipId, 160),
    donorAccountId: donor.id,
  };
}

/**
 * Creates (or returns the existing) sandbox account for one email —
 * deliberately idempotent so re-running "create" from the admin UI never
 * duplicates a login. organizationId must already be a fake organization —
 * callers (server/external-tester-sandbox-api.js) reject real organizations
 * before ever calling this.
 */
function ensureSandboxAccount(store, {
  organizationId, email, displayName = "External Tester", allowedRoleKeys = [],
}) {
  store.familyFoundation = store.familyFoundation || {};
  store.familyFoundation.fakeAccounts = store.familyFoundation.fakeAccounts || {};
  const cleanEmail = cleanText(email, 180).toLowerCase();
  const existing = listValues(store.familyFoundation.fakeAccounts)
    .find((row) => row.kind === SANDBOX_KIND && row.email === cleanEmail);
  const sanitizedRoles = sanitizeAllowedRoleKeys(allowedRoleKeys);
  const activeRoleKey = sanitizedRoles[0] || "";
  if (existing) {
    existing.organizationId = cleanText(organizationId, 160);
    existing.allowedRoleKeys = sanitizedRoles;
    if (!sanitizedRoles.includes(existing.activeRoleKey)) existing.activeRoleKey = activeRoleKey;
    existing.updatedAt = nowIso();
    store.familyFoundation.fakeAccounts[existing.id] = existing;
    return existing;
  }
  const record = {
    id: newId("fakeacct"),
    organizationId: cleanText(organizationId, 160),
    kind: SANDBOX_KIND,
    email: cleanEmail,
    displayName: cleanText(displayName, 180) || "External Tester",
    role: "",
    planKey: "",
    contactId: "",
    staffMembershipId: "",
    passwordHash: "",
    mustChangePassword: false,
    label: "Testing Account — Fake Data Only. External Tester Sandbox.",
    testingOnly: true,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    allowedRoleKeys: sanitizedRoles,
    activeRoleKey,
  };
  store.familyFoundation.fakeAccounts[record.id] = record;
  return record;
}

function setAllowedRoleKeys(store, { accountId, allowedRoleKeys }) {
  const account = store.familyFoundation?.fakeAccounts?.[accountId];
  if (!account || !isSandboxAccount(account)) return null;
  const sanitized = sanitizeAllowedRoleKeys(allowedRoleKeys);
  account.allowedRoleKeys = sanitized;
  if (!sanitized.includes(account.activeRoleKey)) {
    account.activeRoleKey = sanitized[0] || "";
  }
  account.updatedAt = nowIso();
  // An admin removing every allowed role must immediately block login —
  // a sandbox account with no approved role has no valid experience left to
  // show, and must never keep coasting on whatever role was active before.
  if (!sanitized.length) {
    account.active = false;
    const user = store.users?.[account.email];
    if (user) user.disabled = true;
  }
  store.familyFoundation.fakeAccounts[account.id] = account;
  return account;
}

/**
 * The ONE function that actually switches a tester's active role. Every
 * safety property lives here:
 *  - roleKey must be in the fixed SANDBOX_ROLE_KEYS enum (never an admin
 *    role, because admin roles simply do not exist in that enum).
 *  - roleKey must ALSO be in THIS account's own admin-assigned
 *    allowedRoleKeys — an admin can narrow this at any time and a tester
 *    can never widen it herself.
 *  - organizationId is read from the STORED account, never from the
 *    request — a tester can never move herself to a different organization.
 *  - Every identity field (role/accountType/familyHubGuardian/contactId/
 *    staffMembershipId/organizationId) written onto store.users[email] is
 *    fully recomputed from this module's own fixed tables, never merged
 *    with whatever the client claims her role should be.
 */
function switchActiveRole(store, { accountId, testerEmail, roleKey }) {
  const account = store.familyFoundation?.fakeAccounts?.[accountId];
  if (!account || !isSandboxAccount(account)) {
    return { ok: false, error: "not_found" };
  }
  if (cleanText(testerEmail, 180).toLowerCase() !== account.email) {
    // A sandbox tester may only ever switch HER OWN account's role — this
    // should be unreachable given the caller resolves accountId FROM the
    // authenticated email, but this is checked again here in case that
    // ever changes.
    return { ok: false, error: "forbidden" };
  }
  if (!isValidRoleKey(roleKey)) {
    return { ok: false, error: "invalid_role" };
  }
  const allowed = Array.isArray(account.allowedRoleKeys) ? account.allowedRoleKeys : [];
  if (!allowed.includes(roleKey)) {
    return { ok: false, error: "role_not_allowed" };
  }
  const identity = resolveIdentityForRoleKey(store, account.organizationId, roleKey, {
    sandboxAccountId: account.id,
    sandboxEmail: account.email,
  });
  if (!identity) return { ok: false, error: "invalid_role" };

  account.activeRoleKey = roleKey;
  account.role = identity.role;
  account.contactId = identity.contactId;
  account.staffMembershipId = identity.staffMembershipId;
  account.updatedAt = nowIso();
  store.familyFoundation.fakeAccounts[account.id] = account;

  store.users = store.users || {};
  const existingUser = store.users[account.email] || {};
  store.users[account.email] = {
    ...existingUser,
    email: account.email,
    displayName: account.displayName,
    organizationId: account.organizationId,
    role: identity.role,
    accountType: identity.accountType,
    familyHubGuardian: identity.familyHubGuardian,
    testingOnly: true,
    testingAccount: true,
    externalTesterSandbox: true,
    fakeAccountId: account.id,
    fakeAccountKind: SANDBOX_KIND,
    updatedAt: nowIso(),
  };

  return {
    ok: true,
    account,
    identity: {
      roleKey,
      roleLabel: SANDBOX_ROLE_LABELS[roleKey],
      role: identity.role,
      accountType: identity.accountType,
      familyHubGuardian: identity.familyHubGuardian,
      organizationId: account.organizationId,
    },
  };
}

function publicSandboxAccount(row) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    displayName: row.displayName,
    kind: SANDBOX_KIND,
    active: row.active !== false,
    hasPassword: Boolean(row.passwordHash),
    allowedRoleKeys: Array.isArray(row.allowedRoleKeys) ? row.allowedRoleKeys : [],
    activeRoleKey: row.activeRoleKey || "",
    activeRoleLabel: SANDBOX_ROLE_LABELS[row.activeRoleKey] || "",
    createdAt: row.createdAt || "",
    updatedAt: row.updatedAt || "",
  };
}

module.exports = {
  SANDBOX_KIND,
  SANDBOX_ROLE_KEYS,
  SANDBOX_ROLE_LABELS,
  isValidRoleKey,
  isSandboxAccount,
  listSandboxAccounts,
  sanitizeAllowedRoleKeys,
  ensureSandboxAccount,
  setAllowedRoleKeys,
  switchActiveRole,
  resolveIdentityForRoleKey,
  publicSandboxAccount,
};

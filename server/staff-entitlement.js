/**
 * Read-time staff Pro inheritance and beta seat counting.
 * Isolated from billing persistence — never copies Stripe IDs onto staff.
 */
"use strict";

const staffBetaAccess = require("../scripts/staff-beta-access.js");
const staffPlan = require("./staff-plan.js");

const MAX_STAFF_SEATS = 5;
const STAFF_LIMIT_MESSAGE = "You’ve reached the 5 staff limit for your beta account.";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isInviteExpired(invite, nowMs = Date.now()) {
  const exp = Date.parse(invite?.expiresAt || "");
  if (Number.isFinite(exp)) return exp <= nowMs;
  return false;
}

function isCountablePendingInvite(invite, nowMs = Date.now()) {
  return String(invite?.status || "") === "pending" && !isInviteExpired(invite, nowMs);
}

function isCountableActiveMember(member) {
  const status = String(member?.status || "active").trim().toLowerCase();
  return status === "active";
}

function countStaffSeats({ invites = [], members = [], nowMs = Date.now() } = {}) {
  const pendingInvites = invites.filter((invite) => isCountablePendingInvite(invite, nowMs)).length;
  const activeStaff = members.filter((member) => isCountableActiveMember(member)).length;
  const used = pendingInvites + activeStaff;
  return {
    used,
    max: MAX_STAFF_SEATS,
    remaining: Math.max(0, MAX_STAFF_SEATS - used),
    canInvite: used < MAX_STAFF_SEATS,
    activeStaff,
    pendingInvites,
  };
}

function isLinkedProgramStaff(user) {
  const email = normalizeEmail(user?.email);
  const ownerEmail = normalizeEmail(user?.linkedProgramOwnerEmail);
  return Boolean(email && ownerEmail && ownerEmail !== email);
}

function findMemberRow(user, members = []) {
  const email = normalizeEmail(user?.email);
  return members.find((member) => normalizeEmail(member.email) === email) || null;
}

/**
 * Active staff relationship:
 * - programMembers row with status=active, or
 * - legacy accepted link (linkedProgramOwnerEmail) when no removed row exists
 */
function isActivelyLinkedStaff(user, members = []) {
  if (!isLinkedProgramStaff(user)) return false;
  const row = findMemberRow(user, members);
  if (row) return isCountableActiveMember(row);
  return true;
}

function findActiveMemberByEmail(members, email) {
  const needle = normalizeEmail(email);
  return members.find((member) => (
    normalizeEmail(member.email) === needle && isCountableActiveMember(member)
  )) || null;
}

function findPendingInviteByEmail(invites, email, nowMs = Date.now()) {
  const needle = normalizeEmail(email);
  return invites.find((invite) => (
    normalizeEmail(invite.email) === needle && isCountablePendingInvite(invite, nowMs)
  )) || null;
}

/**
 * Staff inherit Pro feature access when the link is active, the owner
 * currently has personal Pro, the owner is on the Add Staff beta allowlist
 * (or is an admin), AND the owner is either:
 * - a founding member, or
 * - on an active Staff Plan
 *
 * Ordinary Monthly / Early User / Annual Pro does not grant inherited Pro.
 * Does not require stored programAccessViaOwner. Does not delete relationships.
 */
function ownerGrantsInheritedPro({
  owner,
  ownerHasPersonalPro = false,
  canAccessStaffBetaFn = staffBetaAccess.canAccessStaffBeta,
  staffBetaOptions = {},
  isConfiguredAdminEmail,
} = {}) {
  if (!ownerHasPersonalPro) return false;
  if (canAccessStaffBetaFn(owner || owner?.email, staffBetaOptions) !== true) return false;
  const email = normalizeEmail(owner?.email);
  if (typeof isConfiguredAdminEmail === "function" && email && isConfiguredAdminEmail(email) === true) {
    return true;
  }
  if (staffPlan.isAuthoritativeFoundingMember(owner)) return true;
  return staffPlan.hasStaffPlanEntitlement(owner) === true;
}

function staffInheritsOwnerProAccess({
  user,
  owner,
  members = [],
  ownerHasPersonalPro = false,
  canAccessStaffBetaFn = staffBetaAccess.canAccessStaffBeta,
  staffBetaOptions = {},
  isConfiguredAdminEmail,
} = {}) {
  if (!isActivelyLinkedStaff(user, members)) return false;
  return ownerGrantsInheritedPro({
    owner,
    ownerHasPersonalPro,
    canAccessStaffBetaFn,
    staffBetaOptions,
    isConfiguredAdminEmail,
  });
}

// Production Render web service is currently 1 instance. withOwnerLock is
// in-process; invite create also re-counts after persist and revokes a 6th seat.
const ownerLocks = new Map();

function withOwnerLock(ownerEmail, fn) {
  const key = normalizeEmail(ownerEmail) || "_none";
  const previous = ownerLocks.get(key) || Promise.resolve();
  const run = previous.then(() => fn(), () => fn());
  ownerLocks.set(key, run.then(() => undefined, () => undefined));
  return run;
}

module.exports = {
  MAX_STAFF_SEATS,
  STAFF_LIMIT_MESSAGE,
  normalizeEmail,
  isInviteExpired,
  isCountablePendingInvite,
  isCountableActiveMember,
  countStaffSeats,
  isLinkedProgramStaff,
  isActivelyLinkedStaff,
  findActiveMemberByEmail,
  findPendingInviteByEmail,
  ownerGrantsInheritedPro,
  staffInheritsOwnerProAccess,
  withOwnerLock,
};

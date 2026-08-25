/**
 * Read-time staff Pro inheritance and beta seat counting.
 * Isolated from billing persistence — never copies Stripe IDs onto staff.
 */
"use strict";

const staffBetaAccess = require("../scripts/staff-beta-access.js");

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
 * Staff inherit Pro feature access when:
 * 1. owner currently has personal Pro
 * 2. owner is on the existing Add Staff beta allowlist
 * 3. staff membership/link is active
 *
 * Does not require stored programAccessViaOwner.
 */
function staffInheritsOwnerProAccess({
  user,
  owner,
  members = [],
  ownerHasPersonalPro = false,
  canAccessStaffBetaFn = staffBetaAccess.canAccessStaffBeta,
  staffBetaOptions = {},
} = {}) {
  if (!isActivelyLinkedStaff(user, members)) return false;
  if (!ownerHasPersonalPro) return false;
  return canAccessStaffBetaFn(owner || user?.linkedProgramOwnerEmail, staffBetaOptions) === true;
}

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
  staffInheritsOwnerProAccess,
  withOwnerLock,
};

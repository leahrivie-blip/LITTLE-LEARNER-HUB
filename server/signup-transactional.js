/**
 * Idempotent signup transactional side effects (admin alert + free welcome).
 * Gates on explicit signup request + durable success stamps — never on signupAt races.
 */
"use strict";

const CLAIM_TTL_MS = 2 * 60 * 1000;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function claimMs(iso) {
  const ms = new Date(iso || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isFreshClaim(iso, nowMs = Date.now()) {
  const ms = claimMs(iso);
  return ms > 0 && (nowMs - ms) < CLAIM_TTL_MS;
}

/**
 * Claim the admin signup alert send slot for this user.
 * @returns {{ claimed: boolean, reason?: string }}
 */
function hasAdminSignupNotification(store, email) {
  const clean = normalizeEmail(email);
  const refId = `signup:${clean}`;
  return (Array.isArray(store?.notifications) ? store.notifications : []).some((n) => (
    n
    && String(n.type || "") === "admin_new_signup"
    && String(n.refId || n.messageId || "") === refId
  ));
}

function claimAdminSignupAlert(store, email, nowMs = Date.now()) {
  const clean = normalizeEmail(email);
  if (!clean || !store) return { claimed: false, reason: "missing" };
  store.users = store.users || {};
  const user = store.users[clean] || { email: clean };
  if (user.adminSignupAlertSentAt || user.adminSignupAlertMessageId) {
    return { claimed: false, reason: "already_sent" };
  }
  // In-app alert already fan'd out for this signup — never send a second owner email.
  if (hasAdminSignupNotification(store, clean)) {
    return { claimed: false, reason: "already_notified" };
  }
  if (isFreshClaim(user.adminSignupAlertClaimedAt, nowMs)) {
    return { claimed: false, reason: "in_flight" };
  }
  const nowIso = new Date(nowMs).toISOString();
  store.users[clean] = {
    ...user,
    email: clean,
    adminSignupAlertClaimedAt: nowIso,
    updatedAt: nowIso,
  };
  return { claimed: true };
}

function markAdminSignupAlertSent(store, email, { messageId = "", nowMs = Date.now() } = {}) {
  const clean = normalizeEmail(email);
  if (!clean || !store?.users) return;
  const user = store.users[clean] || { email: clean };
  const nowIso = new Date(nowMs).toISOString();
  store.users[clean] = {
    ...user,
    email: clean,
    adminSignupAlertSentAt: nowIso,
    adminSignupAlertMessageId: String(messageId || user.adminSignupAlertMessageId || "").slice(0, 200),
    adminSignupAlertClaimedAt: "",
    updatedAt: nowIso,
  };
}

function clearAdminSignupAlertClaim(store, email, nowMs = Date.now()) {
  const clean = normalizeEmail(email);
  if (!clean || !store?.users?.[clean]) return;
  const user = store.users[clean];
  store.users[clean] = {
    ...user,
    adminSignupAlertClaimedAt: "",
    updatedAt: new Date(nowMs).toISOString(),
  };
}

module.exports = {
  CLAIM_TTL_MS,
  claimAdminSignupAlert,
  markAdminSignupAlertSent,
  clearAdminSignupAlertClaim,
  isFreshClaim,
};

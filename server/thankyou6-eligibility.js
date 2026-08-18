/**
 * Isolated THANKYOU6 eligibility extras.
 * Does not replace membership-access or test-account-guard.
 *
 * Prod-flag convention (documented in trial-length-audit):
 *   llh.prod.flag.<kind>.<id>@…
 * Existing looksLikeTestEmail / isEphemeralTestAccountEmail miss this because
 * the local-part starts with "llh.prod.flag", not "test" / "prod-up" / "llh-signup".
 */

const SUSPICIOUS_UNVERIFIED_DOMAINS = Object.freeze(["gmil.com"]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function localPart(email) {
  return normalizeEmail(email).split("@")[0] || "";
}

function domainPart(email) {
  return normalizeEmail(email).split("@")[1] || "";
}

function looksLikeProdFlagEmail(email) {
  return /^llh\.prod\.flag(?:[._+-]|$)/i.test(localPart(email));
}

function isInternalThankYou6Account(user, email) {
  if (user?.systemAccount === true) return true;
  if (user?.internalAccessOverride === true) return true;
  if (user?.qaAccount === true || user?.automationAccount === true) return true;
  const role = String(user?.accountRole || user?.role || "").toLowerCase();
  if (["system", "internal", "qa", "automation"].includes(role)) return true;
  const accountType = String(user?.accountType || "").toLowerCase();
  if (["system", "internal", "qa", "automation", "test"].includes(accountType)) return true;
  if (looksLikeProdFlagEmail(email || user?.email)) return true;
  return false;
}

function hasReliableEmailDeliveryProof(user, email, store) {
  if (String(user?.emailDeliveryStatus || "").toLowerCase() === "delivered" && user?.emailDeliveredAt) {
    return true;
  }
  const receipts = store?.emailEngagement?.settings?.freeUserThankYou6?.recipientReceipts;
  const receipt = receipts && typeof receipts === "object" ? receipts[normalizeEmail(email)] : null;
  const emailReceipt = receipt?.email && typeof receipt.email === "object" ? receipt.email : receipt;
  if (emailReceipt && String(emailReceipt.deliveryStatus || "").toLowerCase() === "delivered") return true;
  return false;
}

/**
 * Narrow campaign-only typo-domain guard. Does not rewrite stored emails.
 * Currently only gmil.com (the live THANKYOU6 false-positive).
 */
function isSuspiciousThankYou6Domain(user, email, store) {
  if (!SUSPICIOUS_UNVERIFIED_DOMAINS.includes(domainPart(email))) return false;
  return !hasReliableEmailDeliveryProof(user, email, store);
}

module.exports = {
  SUSPICIOUS_UNVERIFIED_DOMAINS,
  looksLikeProdFlagEmail,
  isInternalThankYou6Account,
  hasReliableEmailDeliveryProof,
  isSuspiciousThankYou6Domain,
};

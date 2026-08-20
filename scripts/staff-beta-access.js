/**
 * Staff management beta allowlist gate.
 * Browser: globalThis.LLHStaffBetaAccess
 * Node: module.exports
 *
 * Access is granted ONLY when the authenticated account email is:
 * - the configured application owner/admin account, OR
 * - an explicit beta allowlist email (tashley@icloud.com, learnnplay123sc@gmail.com)
 *
 * Never trust client-supplied body/query emails for this check.
 */
(function staffBetaAccessModule(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.LLHStaffBetaAccess = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function staffBetaAccessFactory() {
  "use strict";

  /** Extra beta allowlist (normalized). Owner/admin is separate via isConfiguredAdminEmail. */
  const STAFF_BETA_ALLOWLIST_EMAILS = Object.freeze([
    "tashley@icloud.com",
    "learnnplay123sc@gmail.com",
  ]);

  /**
   * Owner/admin aliases mirrored from server DEFAULT_ADMIN_EMAIL_ALIASES.
   * Used when callers do not inject isConfiguredAdminEmail / adminEmails
   * (browser client). Server should always pass isConfiguredAdminEmail.
   */
  const DEFAULT_OWNER_ADMIN_EMAILS = Object.freeze([
    "leahivie@icloud.com",
    "leahrivie@icloud.com",
    "leahrivie@gmail.com",
    "little.learners.hub.customer@gmail.com",
  ]);

  const STAFF_BETA_FORBIDDEN_MESSAGE = "Staff management is not available for this account.";

  function normalizeStaffBetaEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function resolveStaffBetaEmail(user) {
    if (user == null) return "";
    if (typeof user === "string") return normalizeStaffBetaEmail(user);
    return normalizeStaffBetaEmail(user.email || "");
  }

  /**
   * @param {object|string|null|undefined} user authenticated user object or email
   * @param {{ isConfiguredAdminEmail?: (email: string) => boolean, adminEmails?: string[] }} [options]
   * @returns {boolean}
   */
  function canAccessStaffBeta(user, options = {}) {
    const email = resolveStaffBetaEmail(user);
    if (!email) return false;

    if (STAFF_BETA_ALLOWLIST_EMAILS.includes(email)) return true;

    if (typeof options.isConfiguredAdminEmail === "function") {
      return options.isConfiguredAdminEmail(email) === true;
    }

    const adminEmails = Array.isArray(options.adminEmails) && options.adminEmails.length
      ? options.adminEmails
      : DEFAULT_OWNER_ADMIN_EMAILS;

    return adminEmails
      .map(normalizeStaffBetaEmail)
      .filter(Boolean)
      .includes(email);
  }

  return {
    STAFF_BETA_ALLOWLIST_EMAILS,
    DEFAULT_OWNER_ADMIN_EMAILS,
    STAFF_BETA_FORBIDDEN_MESSAGE,
    normalizeStaffBetaEmail,
    resolveStaffBetaEmail,
    canAccessStaffBeta,
  };
});

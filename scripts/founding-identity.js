/**
 * Permanent founding-member identity vs current billing entitlement.
 *
 * Identity is the numbered founding cohort (`foundingMemberNumber`) or a
 * currently-active founding flag. It is NOT display text, Early User,
 * Monthly Pro, Annual Pro, or a vague historical boolean.
 *
 * Entitlement (paid access right now) stays in membershipHasProAccess.
 * Identity never grants Pro while past_due / unpaid / ended.
 */
"use strict";

/**
 * @param {unknown} user
 * @returns {number} Positive founding number, or 0 if none.
 */
function foundingMemberNumberValue(user) {
  if (!user || typeof user !== "object") return 0;
  const raw = /** @type {{ foundingMemberNumber?: unknown }} */ (user).foundingMemberNumber;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return 0;
  return n;
}

/**
 * Promo reservations canceled before the first paid invoice release the spot
 * and must not keep founding identity.
 *
 * @param {unknown} user
 * @returns {boolean}
 */
function foundingSpotWasReleased(user) {
  if (!user || typeof user !== "object") return false;
  return Boolean(/** @type {{ foundingSpotReleasedAt?: unknown }} */ (user).foundingSpotReleasedAt);
}

/**
 * Permanent founding-cohort identity. Safe for Staff Plan pricing classification.
 *
 * True when:
 * - foundingMemberActive is explicitly true, or
 * - a positive foundingMemberNumber is stored and the founding spot was not released
 *
 * False for Early User / Monthly Pro / Annual Pro without a numbered founding seat.
 *
 * @param {unknown} user
 * @returns {boolean}
 */
function hasPermanentFoundingIdentity(user) {
  if (!user || typeof user !== "object") return false;
  const record = /** @type {{ foundingMemberActive?: unknown }} */ (user);
  if (record.foundingMemberActive === true) return true;
  if (foundingSpotWasReleased(user)) return false;
  return foundingMemberNumberValue(user) > 0;
}

module.exports = {
  foundingMemberNumberValue,
  foundingSpotWasReleased,
  hasPermanentFoundingIdentity,
};

#!/usr/bin/env node
/** Clears stale mustChangePassword when temp password expired but permanent hash exists. */
const assert = require("node:assert/strict");
const tempPasswordAuth = require("../server/temp-password-auth.js");

function reconcileStaleAuthFlags(user = {}) {
  if (!user?.mustChangePassword) return user;
  if (tempPasswordAuth.tempPasswordStillValid(user)) return user;
  if (user.tempPasswordHash || user.mustChangePassword) {
    return tempPasswordAuth.clearTempPasswordFields(user, {
      keepServerPasswordAuth: Boolean(user.serverPasswordAuth || user.passwordHash),
    });
  }
  return user;
}

const stale = {
  email: "owner@example.com",
  mustChangePassword: true,
  tempPasswordHash: "abc",
  tempPasswordExpiresAt: "2020-01-01T00:00:00.000Z",
  passwordHash: "permanent",
  serverPasswordAuth: true,
};
const repaired = reconcileStaleAuthFlags(stale);
assert.equal(repaired.mustChangePassword, false);
assert.equal(repaired.tempPasswordHash, "");
console.log("test-stale-auth-reconcile: passed");

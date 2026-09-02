#!/usr/bin/env node
/**
 * Phase 1 — emailAuth tokens survive unrelated store merges.
 * Run: NODE_ENV=test node scripts/test-email-auth-store-merge.js
 */
const assert = require("node:assert/strict");
const emailAuth = require("../server/email-auth.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function main() {
  const now = Date.parse("2026-09-01T16:00:00.000Z");
  const live = { users: { a: { email: "a@example.com" } }, analyticsEvents: [{ id: "e1" }] };
  const created = emailAuth.createToken(live, {
    email: "member@example.com",
    purpose: "password_reset",
    ttlMs: emailAuth.PASSWORD_RESET_TTL_MS,
  });
  assert.ok(created.token);
  const liveHash = live.emailAuth.tokens[0].tokenHash;
  assert.ok(liveHash);
  assert.doesNotMatch(JSON.stringify(live.emailAuth), new RegExp(created.token));

  const unrelatedWrite = {
    users: { a: { email: "a@example.com" }, b: { email: "b@example.com" } },
    analyticsEvents: [{ id: "e2" }],
  };
  const merged = emailAuth.mergeStorePreserveEmailAuth(unrelatedWrite, live, now);
  assert.equal(merged.emailAuth.tokens.length, 1);
  assert.equal(merged.emailAuth.tokens[0].tokenHash, liveHash);
  assert.equal(merged.users.b.email, "b@example.com");
  assert.deepEqual(merged.analyticsEvents, [{ id: "e2" }]);
  assert.equal(live.users.a.email, "a@example.com");

  const inspectAfterMerge = emailAuth.inspectToken(merged, created.token, "password_reset");
  assert.equal(inspectAfterMerge.ok, true);

  const consumedStore = clone(merged);
  const consumed = emailAuth.consumeToken(consumedStore, created.token, "password_reset");
  assert.equal(consumed.ok, true);
  const staleWithActive = clone(merged);
  const afterConsumeMerge = emailAuth.mergeStorePreserveEmailAuth(staleWithActive, consumedStore, now);
  const inspectConsumed = emailAuth.inspectToken(afterConsumeMerge, created.token, "password_reset");
  assert.equal(inspectConsumed.ok, false, "consumed token must not be revived");
  assert.ok(afterConsumeMerge.emailAuth.consumedHashes.includes(liveHash));

  const expiredStore = clone(live);
  expiredStore.emailAuth.tokens[0].expiresAt = new Date(now - 60_000).toISOString();
  const incomingEmpty = { users: { a: { email: "a@example.com" } } };
  const afterExpired = emailAuth.mergeStorePreserveEmailAuth(incomingEmpty, expiredStore, now);
  assert.equal(afterExpired.emailAuth.tokens.length, 0, "expired token must not be revived");
  assert.equal(afterExpired.users.a.email, "a@example.com");

  console.log("PASS  emailAuth store merge preservation");
}

main();

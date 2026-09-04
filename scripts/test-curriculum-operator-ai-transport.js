#!/usr/bin/env node
/**
 * Classified AI transport + bounded retry.
 * Run: npm run test:curriculum-operator-ai-transport
 */
"use strict";

const assert = require("node:assert/strict");
const transport = require("./curriculum-operator-ai-transport.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

console.log("1) classify");
ok(transport.classifyAiError(new Error("fetch failed")) === "TRANSIENT_NETWORK", "fetch failed → transient");
ok(transport.classifyAiError(new Error("aborted")) === "TIMEOUT", "abort → timeout");
ok(transport.classifyAiError({ status: 429, message: "rate" }) === "RATE_LIMIT", "429");
ok(transport.classifyAiError({ status: 401, message: "no" }) === "AUTH_FAILURE", "401");
ok(transport.classifyAiError({ status: 400, message: "bad" }) === "INVALID_REQUEST", "400");
ok(transport.classifyAiError({ message: "invalid json" }) === "INVALID_RESPONSE", "malformed");
ok(!transport.isRetryable("AUTH_FAILURE"), "auth not retried");
ok(!transport.isRetryable("INVALID_REQUEST"), "400 not retried");
ok(transport.isRetryable("TRANSIENT_NETWORK"), "network retried");

console.log("\n2) bounded retry");
(async () => {
  let n = 0;
  const out = await transport.callWithBoundedRetry(async () => {
    n += 1;
    if (n < 3) {
      const err = new Error("fetch failed");
      throw err;
    }
    return "ok";
  }, { maxAttempts: 3, sleep: async () => {} });
  ok(out === "ok", "transient succeeds on retry");
  ok(n === 3, "retried twice then success");

  let authTries = 0;
  try {
    await transport.callWithBoundedRetry(async () => {
      authTries += 1;
      const err = new Error("denied");
      err.status = 401;
      throw err;
    }, { maxAttempts: 4, sleep: async () => {} });
    ok(false, "401 should throw");
  } catch (error) {
    ok(error.category === "AUTH_FAILURE", "401 classified");
    ok(authTries === 1, "401 not retried");
  }

  const safe = transport.ownerSafeAiError(new Error("fetch failed"));
  ok(/could not be reached/i.test(safe.message), "owner message is not raw fetch failed");
  ok(!/sk-/.test(safe.message), "no secret in message");
  const health = transport.summarizeAiHealth({ configured: true, reachable: false, model: "gpt-4o-mini", lastErrorCategory: "TRANSIENT_NETWORK" });
  ok(health.configured === true && health.reachable === false, "health shape");
  console.log(`\nAI transport passed ${passed} assertions.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

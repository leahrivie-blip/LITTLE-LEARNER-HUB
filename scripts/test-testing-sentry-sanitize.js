#!/usr/bin/env node
/** Unit checks for testing-only Sentry sanitization. */
const assert = require("node:assert/strict");
const {
  sanitizeErrorMessage,
  sanitizePathname,
  sanitizeQuery,
  buildSafeEvent,
  rateLimitGate,
  roleCategory,
} = require("./testing-sentry-sanitize.js");

assert.match(sanitizeErrorMessage("Bearer abc.def.ghi failed"), /\[redacted\]/);
assert.match(sanitizeErrorMessage("user tester@example.invalid broke"), /\[redacted-email\]/);
assert.equal(sanitizePathname("https://x.test/api/foo?token=secret"), "/api/foo");
assert.match(sanitizeQuery("token=abc&page=1"), /token=\[redacted\]/);
assert.equal(roleCategory("parent_guardian"), "parent");
assert.equal(roleCategory("home_daycare"), "provider");

const safe = buildSafeEvent({
  errorType: "TypeError",
  message: "Bearer secret-token for admin@x.com",
  deployedCommit: "abc123",
  page: "testing-lab",
  role: "Platform Admin",
  device: "computer",
  fakeOrganizationId: "org_fake_123",
  source: "browser",
});
assert.equal(safe.roleCategory, "admin");
assert.doesNotMatch(safe.message, /secret-token/);
assert.doesNotMatch(safe.message, /admin@x\.com/);
assert.ok(!("password" in safe));
assert.ok(!("headers" in safe));
assert.ok(!("body" in safe));

const gate = { windowStartedAt: 0, count: 0 };
for (let i = 0; i < 20; i += 1) assert.equal(rateLimitGate(gate, { maxPerWindow: 20 }), true);
assert.equal(rateLimitGate(gate, { maxPerWindow: 20 }), false);

console.log("Testing Sentry sanitize checks passed.");

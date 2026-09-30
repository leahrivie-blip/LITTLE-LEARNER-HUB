#!/usr/bin/env node
/**
 * Config/unit checks for production Admin funnel smoke (no browser, no credentials).
 * Run: npm run test:production-admin-funnel:config
 */
"use strict";

const assert = require("node:assert/strict");
const {
  EXPECTED_STAGE_KEYS,
  resolveSmokeAdminConfig,
  assertNoPiiInFunnelPayload,
} = require("./test-helpers/production-admin-funnel-smoke");
const insights = require("../server/admin-insights.js");

function testStageKeyParity() {
  const serverKeys = insights.FREE_ACTIVATION_FUNNEL_STAGE_DEFS.map((d) => d.id);
  assert.deepEqual(EXPECTED_STAGE_KEYS, serverKeys);
  assert.equal(EXPECTED_STAGE_KEYS.length, 13);
  console.log("PASS stage key parity with server definitions");
}

function testMissingCredentialsSkipMessage() {
  const saved = {
    LLH_SMOKE_ADMIN_EMAIL: process.env.LLH_SMOKE_ADMIN_EMAIL,
    LLH_SMOKE_ADMIN_PASSWORD: process.env.LLH_SMOKE_ADMIN_PASSWORD,
    LLH_SMOKE_ADMIN_ACCESS_CODE: process.env.LLH_SMOKE_ADMIN_ACCESS_CODE,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_ACCESS_CODE: process.env.ADMIN_ACCESS_CODE,
  };
  delete process.env.LLH_SMOKE_ADMIN_EMAIL;
  delete process.env.LLH_SMOKE_ADMIN_PASSWORD;
  delete process.env.LLH_SMOKE_ADMIN_ACCESS_CODE;
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_ACCESS_CODE;
  const result = resolveSmokeAdminConfig();
  assert.equal(result.ok, false);
  assert.match(result.message, /skipped/i);
  Object.assign(process.env, saved);
  console.log("PASS missing credentials produce skip message");
}

function testPiiGuard() {
  assert.throws(() => assertNoPiiInFunnelPayload({ stages: [{ label: "x", user: "a@b.com" }] }));
  console.log("PASS PII guard on funnel payload");
}

function main() {
  testStageKeyParity();
  testMissingCredentialsSkipMessage();
  testPiiGuard();
  console.log("\nAll production-admin-funnel config checks passed.");
}

main();

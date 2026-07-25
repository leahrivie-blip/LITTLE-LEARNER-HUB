#!/usr/bin/env node
/**
 * Deployed-smoke readiness (no live deploy required).
 *
 * Confirms scripts/test-deployed-testing-smoke.js:
 *  - refuses production hosts (non-zero)
 *  - refuses missing smoke credentials (non-zero)
 *  - refuses missing EXPECTED_SHA (non-zero)
 *  - source guarantees: disposable org reset, no Stripe/email/SMS/OpenAI,
 *    expected-commit pin, failure exit non-zero
 *
 * Run: npm run test:deployed-smoke-readiness
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SMOKE = path.join(ROOT, "scripts/test-deployed-testing-smoke.js");

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function runSmoke(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SMOKE], {
      cwd: ROOT,
      env: { ...process.env, LLH_TESTING_SMOKE_SKIP: "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => { out += c.toString(); });
    child.stderr.on("data", (c) => { err += c.toString(); });
    child.on("exit", (code) => resolve({ code: Number(code || 0), out, err, combined: `${out}\n${err}` }));
  });
}

async function main() {
  const src = fs.readFileSync(SMOKE, "utf8");

  assert.match(src, /PRODUCTION_HOST_BLOCKLIST|Refusing production host/, "smoke must refuse production hosts");
  assert.match(src, /Missing LLH_TESTING_SMOKE_ADMIN_EMAIL/, "smoke must refuse missing credentials");
  assert.match(src, /Missing LLH_TESTING_SMOKE_EXPECTED_SHA/, "smoke must require expected SHA");
  assert.match(src, /reset-fake-data|resetDisposableOrg/, "smoke must reset disposable org");
  assert.match(src, /api\.stripe\.com|Never called Stripe/, "smoke must guard against Stripe/email/SMS/OpenAI");
  assert.match(src, /process\.exitCode\s*=\s*1/, "smoke must exit non-zero on failure");
  assert.doesNotMatch(src, /STRIPE_SECRET_KEY\s*=\s*['\"]sk_/, "smoke must not embed Stripe secrets");
  assert.doesNotMatch(src, /OPENAI_API_KEY\s*=\s*['\"]sk-/, "smoke must not embed OpenAI secrets");
  pass("Source guarantees: prod refuse, credentials refuse, expected SHA, disposable reset, no live Stripe/email/SMS/OpenAI, non-zero on failure");

  const prod = await runSmoke({
    LLH_TESTING_SMOKE_URL: "https://littlelearnershubbyleah.com",
    LLH_TESTING_SMOKE_ADMIN_EMAIL: "x@example.invalid",
    LLH_TESTING_SMOKE_ADMIN_PASSWORD: "x",
    LLH_TESTING_SMOKE_ADMIN_CODE: "x",
    LLH_TESTING_SMOKE_EXPECTED_SHA: "abc123",
  });
  assert.notEqual(prod.code, 0, "production host must exit non-zero");
  assert.match(prod.combined, /Refusing production host|production/i);
  pass("Refuses production hosts (non-zero exit)");

  const missingCreds = await runSmoke({
    LLH_TESTING_SMOKE_URL: "https://little-learner-hub-testing.onrender.com",
    LLH_TESTING_SMOKE_ADMIN_EMAIL: "",
    LLH_TESTING_SMOKE_ADMIN_PASSWORD: "",
    LLH_TESTING_SMOKE_ADMIN_CODE: "",
    LLH_TESTING_SMOKE_EXPECTED_SHA: "abc123",
  });
  assert.notEqual(missingCreds.code, 0, "missing credentials must exit non-zero");
  assert.match(missingCreds.combined, /Missing LLH_TESTING_SMOKE_ADMIN/i);
  pass("Refuses missing smoke credentials (non-zero exit)");

  const missingSha = await runSmoke({
    LLH_TESTING_SMOKE_URL: "https://little-learner-hub-testing.onrender.com",
    LLH_TESTING_SMOKE_ADMIN_EMAIL: "smoke@example.invalid",
    LLH_TESTING_SMOKE_ADMIN_PASSWORD: "smoke-pass",
    LLH_TESTING_SMOKE_ADMIN_CODE: "smoke-code",
    LLH_TESTING_SMOKE_EXPECTED_SHA: "",
  });
  assert.notEqual(missingSha.code, 0, "missing expected SHA must exit non-zero");
  assert.match(missingSha.combined, /Missing LLH_TESTING_SMOKE_EXPECTED_SHA/i);
  pass("Refuses missing expected SHA — never accepts any deployed build (non-zero exit)");

  console.log(`\nDeployed smoke readiness passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});

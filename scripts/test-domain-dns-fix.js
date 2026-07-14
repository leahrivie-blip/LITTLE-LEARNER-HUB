#!/usr/bin/env node
/**
 * Domain DNS fix markers + health payload.
 * Run: node scripts/test-domain-dns-fix.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const root = path.join(__dirname, "..");
const healthFn = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const doc = fs.readFileSync(path.join(root, "docs/DOMAIN_DNS_FIX.md"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("health endpoint exposes domain diagnostics", () => {
  assert.match(healthFn, /customDomainTargets/);
  assert.match(healthFn, /littlelearnerhub\.com/);
  assert.match(healthFn, /servingKnownAppHost/);
  assert.match(healthFn, /Bluehost/);
});

test("domain DNS fix doc explains Bluehost vs Render", () => {
  assert.match(doc, /little-learner-hub\.onrender\.com/);
  assert.match(doc, /Bluehost/);
  assert.match(doc, /Cloudflare/);
  assert.match(doc, /66\.235\.200\.145/);
});

test("cache bust bumped for redeploy", () => {
  assert.match(indexHtml, /20260714-domain-dns-fix/);
  assert.match(sw, /llh-shell-v25-domain-dns-fix/);
  assert.match(sw, /20260714-domain-dns-fix/);
});

if (!process.exitCode) {
  console.log("\nAll domain DNS fix tests passed.");
}

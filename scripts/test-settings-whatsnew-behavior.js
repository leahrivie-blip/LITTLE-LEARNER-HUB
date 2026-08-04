#!/usr/bin/env node
/**
 * Settings hub consolidation + What's New seed + Behavior naming.
 * Run: npm run test:settings-whatsnew-behavior
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const os = require("node:os");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-settings-wn-${crypto.randomBytes(4).toString("hex")}.json`);

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

function staticChecks() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  ok(appJs.includes('title: "Billing & Subscription"'), "Pro billing card present");
  ok(!/title: "Current Plan"/.test(appJs), "Current Plan duplicate removed");
  ok(!/title: "Subscription Status"/.test(appJs), "Subscription Status duplicate removed");
  ok(appJs.includes("currentBillingHistory(account).length"), "Billing History gated on empty history");
  ok(appJs.includes('title: "Send Feedback"'), "single feedback card");
  ok(!/title: "Report a Bug"/.test(appJs), "Report a Bug hub card removed");
  ok(!/title: "Request a Feature"/.test(appJs), "Request a Feature hub card removed");
  ok(!/title: "Contact Support"/.test(appJs), "Contact Support hub card removed");
  ok(!appJs.includes('platformInstallCardMarkup("settings-prompt")'), "duplicate settings install card removed");
  ok(appJs.includes("Unsafe Body Moments"), "Behavior topic renamed");
  ok(!/Aggressive Behaviors/.test(appJs), "Aggressive Behaviors label removed");
  ok(appJs.includes('function syncWhatsNewNavVisibility'), "What's New nav sync restored");
  ok(appJs.includes("function setWhatsNewNavVisible"), "What's New visibility helper restored");
  ok(/id="whatsNewNavLink"[^>]*hidden/.test(indexHtml), "What's New starts hidden");
  ok(comms.includes("never acquisition") || !comms.includes("founding spot"), "founding spots acquisition copy removed from Settings card");
  ok(!comms.includes("Settings → Push Notifications"), "stale Push Notifications Settings path removed");
  ok(serverJs.includes("release-august-2026-member-updates"), "customer starter release note id present");
  ok(serverJs.includes("ensureDefaultReleaseNotes"), "release note seed helper present");
  ok(!serverJs.includes("release-family-hub-beta-seed") || serverJs.includes("Replace accidental Family Hub beta seed"),
    "Family Hub beta seed replaced/migrated");
  ok(!/Family Hub parent app with Today/.test(serverJs), "Family Hub beta customer What's New copy removed");
  console.log("PASS static settings/whatsnew/behavior markers");
}

async function main() {
  staticChecks();

  try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);
    const empty = await requestJson("GET", "/api/release-notes");
    ok(empty.status === 200, "release-notes list ok");
    const notes = empty.json?.releaseNotes || [];
    ok(notes.length >= 1, "starter release notes seeded when empty");
    ok(notes.every((n) => n.status === "published"), "public list is published only");
    ok(notes.some((n) => /August 2026/i.test(n.version || "")), "August 2026 member updates present");
    ok(!notes.some((n) => /Family Hub beta/i.test(n.version || "")), "Family Hub beta not in public What's New");
    ok(!JSON.stringify(notes).includes("PR #") && !JSON.stringify(notes).includes("dep-"),
      "no PR/deploy IDs in customer release notes");

    // Second call should not duplicate
    const again = await requestJson("GET", "/api/release-notes");
    ok((again.json?.releaseNotes || []).length === notes.length, "seed is idempotent");

    console.log(`PASS settings/whatsnew/behavior (${passed} asserts)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL settings/whatsnew/behavior:", error.message || error);
  process.exit(1);
});

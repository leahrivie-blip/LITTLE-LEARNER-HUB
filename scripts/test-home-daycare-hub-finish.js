#!/usr/bin/env node
/**
 * Home Daycare Hub Steps E–G — staff visibility, trainings, packets (testing-only).
 * Run: npm run test:home-daycare-hub-finish
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");

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

function request(port, method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function spawnServer({ port, storePath, hubTesting }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: hubTesting ? "true" : "false",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "true",
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) return res.json;
    } catch (_error) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server on ${port} did not become healthy`);
}

test("shell finish markers + E/F/G UI", () => {
  assert.match(indexHtml, /SHELL_VERSION = "20260803-family-hub-beta-final"/);
  assert.match(appJs, /function renderHomeDaycareStaffInvitePanel/);
  assert.match(appJs, /function renderHomeDaycareTrainingsPanel/);
  assert.match(appJs, /function renderHomeDaycarePacketsPanel/);
  assert.match(appJs, /function renderHomeDaycareTesterGuidePanel/);
  assert.match(appJs, /Where to add testers/);
  assert.match(appJs, /Invite tester/);
  assert.match(appJs, /hdhFullAccessInviteForm/);
  assert.match(appJs, /function createHdhIndependentTesterInviteRequest/);
  assert.match(appJs, /function acceptHdhTesterInviteToken/);
  assert.match(appJs, /function isLinkedProgramStaffAccount/);
  assert.match(appJs, /function isIndependentHdhTesterAccount/);
  assert.match(appJs, /own account \+ own kid|own starter child|own Teacher/);
  assert.match(appJs, /Message Leah/);
  assert.match(serverJs, /\/api\/home-daycare-hub\/tester-invites/);
  assert.match(serverJs, /handleHdhTesterInviteAccept/);
  assert.match(serverJs, /hdhIndependentTester/);
  assert.match(appJs, /function renderHdhRoleSwitcher/);
  assert.match(appJs, /function switchHdhTesterRole/);
  assert.match(appJs, /function syncHdhTesterSwitcherChrome/);
  assert.match(appJs, /function ensureTesterDemoChild/);
  assert.match(appJs, /data-hdh-role-switch/);
  assert.match(appJs, /staff-helper/);
  assert.match(appJs, /staff-lead/);
  assert.match(appJs, /data-hdh-tester-child/);
  assert.match(appJs, /hdh-role-switcher--compact/);
  assert.match(appJs, /data-hdh-jump/);
  assert.match(appJs, /HDH_STAFF_VISIBILITY_OPTIONS/);
  assert.match(appJs, /What this staff member can see/);
  assert.match(appJs, /CPR &amp; training tracker/);
  assert.match(appJs, /Enrollment &amp; forms packets/);
  assert.match(appJs, /function staffMaySeeHdhView/);
});

test("server E/F/G APIs and staff visibility fields", () => {
  assert.match(serverJs, /normalizeHdhStaffVisibility/);
  assert.match(serverJs, /hdhVisibility/);
  assert.match(serverJs, /\/api\/home-daycare-hub\/staff-trainings/);
  assert.match(serverJs, /\/api\/home-daycare-hub\/packets/);
  assert.match(serverJs, /requireHomeDaycareHubTesting/);
});

async function main() {
  if (process.exitCode) return;

  const offPort = 20050 + Math.floor(Math.random() * 40);
  const onPort = offPort + 1;
  const offStore = path.join(os.tmpdir(), `llh-hdh-fin-off-${crypto.randomBytes(4).toString("hex")}.json`);
  const onStore = path.join(os.tmpdir(), `llh-hdh-fin-on-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(offStore, JSON.stringify({ users: { "owner@example.com": { email: "owner@example.com", role: "owner" } } }, null, 2));
  fs.writeFileSync(onStore, JSON.stringify({ users: { "owner@example.com": { email: "owner@example.com", role: "owner", accountType: "home_daycare" } } }, null, 2));

  const offChild = spawnServer({ port: offPort, storePath: offStore, hubTesting: false });
  const onChild = spawnServer({ port: onPort, storePath: onStore, hubTesting: true });

  try {
    await waitForHealth(offPort, offChild);
    const offTrainings = await request(offPort, "GET", "/api/home-daycare-hub/staff-trainings", { email: "owner@example.com" });
    assert.equal(offTrainings.status, 404);

    await waitForHealth(onPort, onChild);

    const invite = await request(onPort, "POST", "/api/staff/invites", {
      email: "owner@example.com",
      body: {
        email: "helper@example.com",
        role: "assistant",
        visibilityPreset: "helper",
        hdhVisibility: { calendar: true, daily_logs: true, children: true, forms_records: false, lessons: false, activities: false },
        programName: "Test Daycare",
        appOrigin: `http://127.0.0.1:${onPort}`,
      },
    });
    assert.equal(invite.status, 200, invite.text);
    assert.equal(invite.json.invite.visibilityPreset, "helper");
    assert.equal(invite.json.invite.hdhVisibility.forms_records, false);

    const training = await request(onPort, "POST", "/api/home-daycare-hub/staff-trainings", {
      email: "owner@example.com",
      body: {
        staffEmail: "helper@example.com",
        staffName: "Helper",
        type: "CPR",
        completedAt: "2026-01-15",
        expiresAt: "2028-01-15",
        notes: "AHA card",
      },
    });
    assert.equal(training.status, 200, training.text);
    assert.equal(training.json.training.type, "CPR");

    const packet = await request(onPort, "POST", "/api/home-daycare-hub/packets", {
      email: "owner@example.com",
      body: {
        title: "Ava enrollment packet",
        childId: "child-1",
        childName: "Ava",
        items: [
          { id: "item-1", title: "Enrollment Packet", category: "Enrollment", status: "needed", statusLabel: "Needed" },
          { id: "item-2", title: "Allergy Form", category: "Allergy / medical", status: "needed", statusLabel: "Needed" },
        ],
      },
    });
    assert.equal(packet.status, 200, packet.text);
    assert.equal(packet.json.packet.items.length, 2);

    const patched = await request(onPort, "PATCH", `/api/home-daycare-hub/packets/${encodeURIComponent(packet.json.packet.id)}/items`, {
      email: "owner@example.com",
      body: { itemId: "item-1", status: "signed" },
    });
    assert.equal(patched.status, 200, patched.text);
    assert.equal(patched.json.packet.items[0].status, "signed");

    console.log("PASS  staff visibility invite + trainings + packets APIs (flag on/off)");
  } catch (error) {
    console.error("FAIL  finish runtime checks");
    console.error(error);
    process.exitCode = 1;
  } finally {
    offChild.kill("SIGTERM");
    onChild.kill("SIGTERM");
    try { fs.unlinkSync(offStore); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(onStore); } catch (_e) { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll Home Daycare Hub finish (E–G) tests passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

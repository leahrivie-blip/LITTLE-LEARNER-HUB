#!/usr/bin/env node
/**
 * Home Daycare Hub Step D — Family Hub household login + magic link (testing-only).
 * Run: npm run test:home-daycare-hub-step-d
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
const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

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

function request(port, method, urlPath, { email = "", body = null, familyToken = "" } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  if (familyToken) {
    headers.Authorization = `Bearer ${familyToken}`;
    headers["X-LLH-Family-Session"] = familyToken;
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

test("shell + view markers for Family Hub", () => {
  assert.match(indexHtml, /SHELL_VERSION = "20260803-family-hub-polish3"/);
  assert.match(indexHtml, /id="view-family-hub"/);
  assert.match(appJs, /family-hub/);
  assert.match(appJs, /function renderFamilyHubProviderPanel/);
  assert.match(appJs, /function renderFamilyHubPage/);
  assert.match(appJs, /function maybeHandleFamilyHubInviteFromUrl/);
  assert.match(appJs, /One household login covers all linked children/);
  assert.match(appJs, /data-hdh-ai-send-later/);
  assert.match(stylesCss, /\.hdh-family-hub-form/);
});

test("server Family Hub APIs are testing-fenced", () => {
  assert.match(serverJs, /\/api\/family-hub\/households/);
  assert.match(serverJs, /\/api\/family-hub\/invites\/peek/);
  assert.match(serverJs, /\/api\/family-hub\/invites\/redeem/);
  assert.match(serverJs, /\/api\/family-hub\/login/);
  assert.match(serverJs, /\/api\/family-hub\/me/);
  assert.match(serverJs, /function requireHomeDaycareHubTesting/);
  assert.match(serverJs, /llh_family_/);
  assert.match(serverJs, /smsSimulated|SMS is simulated/);
});

async function main() {
  if (process.exitCode) return;

  const offPort = 20010 + Math.floor(Math.random() * 40);
  const onPort = offPort + 1;
  const offStore = path.join(os.tmpdir(), `llh-hdh-d-off-${crypto.randomBytes(4).toString("hex")}.json`);
  const onStore = path.join(os.tmpdir(), `llh-hdh-d-on-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(offStore, JSON.stringify({ users: { "owner@example.com": { email: "owner@example.com", role: "owner" } } }, null, 2));
  fs.writeFileSync(onStore, JSON.stringify({ users: { "owner@example.com": { email: "owner@example.com", role: "owner", accountType: "home_daycare" } } }, null, 2));

  const offChild = spawnServer({ port: offPort, storePath: offStore, hubTesting: false });
  const onChild = spawnServer({ port: onPort, storePath: onStore, hubTesting: true });

  try {
    await waitForHealth(offPort, offChild);
    const offCreate = await request(offPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: { email: "parent@example.com", children: [{ id: "c1", name: "Ava" }] },
    });
    assert.equal(offCreate.status, 404, "Family Hub APIs must 404 when testing flag is off");

    await waitForHealth(onPort, onChild);
    const created = await request(onPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: {
        label: "The Test Family",
        email: "parent@example.com",
        phone: "555-0100",
        children: [
          { id: "child-1", name: "Ava" },
          { id: "child-2", name: "Milo" },
        ],
        documents: [
          { childId: "child-1", title: "Enrollment Packet", category: "Enrollment", status: "needed", statusLabel: "Needed" },
        ],
        programName: "Sunshine Home Daycare",
        appOrigin: `http://127.0.0.1:${onPort}`,
      },
    });
    assert.equal(created.status, 200, created.text);
    assert.equal(created.json.ok, true);
    assert.ok(created.json.magicUrl);
    assert.match(String(created.json.loginCode || ""), /^\d{6}$/);
    assert.equal(created.json.sms?.simulated, true);
    assert.equal(created.json.household.children.length, 2);

    const token = String(created.json.magicUrl).split("familyHub=")[1];
    assert.ok(token);
    const peek = await request(onPort, "GET", `/api/family-hub/invites/peek?token=${encodeURIComponent(token)}`);
    assert.equal(peek.status, 200);
    assert.equal(peek.json.invite.children.length, 2);

    const redeemed = await request(onPort, "POST", "/api/family-hub/invites/redeem", {
      body: { token },
    });
    assert.equal(redeemed.status, 200, redeemed.text);
    assert.match(String(redeemed.json.sessionToken || ""), /^llh_family_/);

    const me = await request(onPort, "GET", "/api/family-hub/me", {
      familyToken: redeemed.json.sessionToken,
    });
    assert.equal(me.status, 200, me.text);
    assert.equal(me.json.children.length, 2);
    assert.equal(me.json.documents.length, 1);
    assert.match(me.json.note || "", /One household login/i);

    const login = await request(onPort, "POST", "/api/family-hub/login", {
      body: { email: "parent@example.com", code: created.json.loginCode },
    });
    assert.equal(login.status, 200, login.text);
    assert.match(String(login.json.sessionToken || ""), /^llh_family_/);

    console.log("PASS  Family Hub create → peek → redeem/login → me (testing flag on); 404 when off");
  } catch (error) {
    console.error("FAIL  Family Hub runtime API checks");
    console.error(error);
    process.exitCode = 1;
  } finally {
    offChild.kill("SIGTERM");
    onChild.kill("SIGTERM");
    try { fs.unlinkSync(offStore); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(onStore); } catch (_e) { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll Home Daycare Hub Step D tests passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

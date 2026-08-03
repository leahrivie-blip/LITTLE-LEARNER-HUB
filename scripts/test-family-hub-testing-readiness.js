#!/usr/bin/env node
/**
 * Family Hub testing-readiness suite (testing fence only).
 * Covers: durable storage gate, invite lifecycle, guardians, shared feed, production fence.
 * Run: npm run test:family-hub-testing-readiness
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const familyHubLib = require("../server/family-hub-lib");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
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

function spawnServer({ port, storePath, hubTesting, allowEphemeral = true, databaseProvider = "local-json" }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: databaseProvider,
      HOME_DAYCARE_HUB_TESTING: hubTesting ? "true" : "false",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: allowEphemeral ? "true" : "false",
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return res.json;
    } catch (_error) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server on ${port} did not become healthy`);
}

test("shell markers for Family Hub readiness UX", () => {
  assert.match(indexHtml, /SHELL_VERSION = "20260803-family-hub-ready"/);
  assert.match(appJs, /function loadFamilyHubParentDashboard/);
  assert.match(appJs, /family-hub-parent-mode/);
  assert.match(appJs, /Family Hub testing preview/);
  assert.match(appJs, /data-family-hub-seed-demo/);
  assert.match(appJs, /Coming Soon/);
  assert.match(appJs, /AbortController/);
  assert.match(stylesCss, /\.family-hub-parent-mode/);
  assert.match(stylesCss, /\.fh-preview-banner/);
  assert.match(serverJs, /persistFamilyHubStore/);
  assert.match(serverJs, /\/api\/family-hub\/seed-demo/);
  assert.match(serverJs, /\/api\/family-hub\/storage/);
});

test("family-hub-lib storage + shared feed helpers", () => {
  const ephemeral = familyHubLib.familyHubStorageStatus({
    databaseProvider: "postgres",
    databaseReady: false,
    usePostgres: true,
    storePath: "/tmp/llh-testing-store.json",
    allowEphemeral: false,
  });
  assert.equal(ephemeral.durable, false);
  assert.match(ephemeral.reason, /memory only|PRODUCTION_DATABASE_URL|not ready/i);

  const localOk = familyHubLib.familyHubStorageStatus({
    databaseProvider: "local-json",
    databaseReady: false,
    usePostgres: false,
    storePath: path.join(ROOT, "server/data/launch-store.json"),
    allowEphemeral: false,
  });
  assert.equal(localOk.durable, true);

  const feed = familyHubLib.buildSharedFamilyFeed({
    Reports: [{ id: "r1", childId: "c1", title: "Daily", summary: "Nap", shareWithFamily: true }],
    Photos: [{ id: "p1", childId: "c1", caption: "Art", shareWithFamily: true }],
    Observations: [{ id: "o1", childId: "c2", summary: "Other", shareWithFamily: true }],
  }, ["c1"]);
  assert.equal(feed.reports.length, 1);
  assert.equal(feed.photos.length, 1);
  assert.equal(feed.observations.length, 0);

  const guardians = familyHubLib.normalizeGuardianEmails("a@example.com", ["b@example.com", "a@example.com"]);
  assert.deepEqual(guardians, ["a@example.com", "b@example.com"]);
});

async function main() {
  if (process.exitCode) return;

  const offPort = 20210 + Math.floor(Math.random() * 40);
  const onPort = offPort + 1;
  const offStore = path.join(os.tmpdir(), `llh-fh-ready-off-${crypto.randomBytes(4).toString("hex")}.json`);
  const onStore = path.join(os.tmpdir(), `llh-fh-ready-on-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(offStore, JSON.stringify({ users: { "owner@example.com": { email: "owner@example.com", role: "owner" } } }, null, 2));
  fs.writeFileSync(onStore, JSON.stringify({
    users: {
      "owner@example.com": { email: "owner@example.com", role: "owner", accountType: "home_daycare" },
    },
  }, null, 2));

  const offChild = spawnServer({ port: offPort, storePath: offStore, hubTesting: false });
  const onChild = spawnServer({ port: onPort, storePath: onStore, hubTesting: true, allowEphemeral: true });

  try {
    await waitForHealth(offPort, offChild);
    const blocked = await request(offPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: { email: "parent@example.com", children: [{ id: "c1", name: "Ava" }] },
    });
    assert.equal(blocked.status, 404, "Family Hub must stay testing-fenced");

    const health = await waitForHealth(onPort, onChild);
    assert.equal(health.homeDaycareHubTesting, true);
    assert.ok(health.homeDaycareHub?.features?.includes("family-hub"));

    const storage = await request(onPort, "GET", "/api/family-hub/storage");
    assert.equal(storage.status, 200, storage.text);
    assert.equal(storage.json.storage.durable, true);

    // Seed demo
    const seeded = await request(onPort, "POST", "/api/family-hub/seed-demo", {
      email: "owner@example.com",
      body: { appOrigin: `http://127.0.0.1:${onPort}`, programName: "Ready Daycare" },
    });
    assert.equal(seeded.status, 200, seeded.text);
    assert.ok(seeded.json.demo?.magicUrl);
    assert.ok(seeded.json.demo?.loginCode);
    assert.equal(seeded.json.demo?.parentEmail, "familyhub.demo.parent@llh.test");
    assert.equal(seeded.json.demo?.guardianEmail, "familyhub.demo.guardian@llh.test");
    assert.equal(seeded.json.demo?.children?.length, 2);

    const token = String(seeded.json.demo.magicUrl).split("familyHub=")[1];
    const peek = await request(onPort, "GET", `/api/family-hub/invites/peek?token=${encodeURIComponent(token)}`);
    assert.equal(peek.status, 200);
    assert.equal(peek.json.invite.children.length, 2);

    const redeemed = await request(onPort, "POST", "/api/family-hub/invites/redeem", { body: { token } });
    assert.equal(redeemed.status, 200, redeemed.text);
    const me = await request(onPort, "GET", "/api/family-hub/me", { familyToken: redeemed.json.sessionToken });
    assert.equal(me.status, 200, me.text);
    assert.equal(me.json.children.length, 2);
    assert.ok(me.json.shared?.reports?.length >= 1, "shared reports should appear");
    assert.ok(me.json.shared?.photos?.length >= 1, "shared photos should appear");
    assert.ok(me.json.shared?.observations?.length >= 1, "shared observations should appear");
    assert.ok(Array.isArray(me.json.comingSoon) && me.json.comingSoon.length >= 1);
    assert.equal(me.json.preview, true);

    // Second guardian login
    const guardianLogin = await request(onPort, "POST", "/api/family-hub/login", {
      body: { email: seeded.json.demo.guardianEmail, code: seeded.json.demo.loginCode },
    });
    assert.equal(guardianLogin.status, 200, guardianLogin.text);

    // Parent login
    const parentLogin = await request(onPort, "POST", "/api/family-hub/login", {
      body: { email: seeded.json.demo.parentEmail, code: seeded.json.demo.loginCode },
    });
    assert.equal(parentLogin.status, 200, parentLogin.text);

    // Invalid invite
    const badPeek = await request(onPort, "GET", "/api/family-hub/invites/peek?token=not-a-real-token");
    assert.equal(badPeek.status, 404);

    // Duplicate invite replaces prior active invite for same email
    const first = await request(onPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: {
        label: "Dup Family",
        email: "dup.parent@example.com",
        guardianEmail: "dup.guardian@example.com",
        children: [{ id: "dup-child", name: "Dup Child" }],
        appOrigin: `http://127.0.0.1:${onPort}`,
      },
    });
    assert.equal(first.status, 200, first.text);
    const second = await request(onPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: {
        label: "Dup Family 2",
        email: "dup.parent@example.com",
        children: [{ id: "dup-child", name: "Dup Child" }],
        appOrigin: `http://127.0.0.1:${onPort}`,
      },
    });
    assert.equal(second.status, 200, second.text);
    assert.ok(second.json.replacedDuplicates >= 1);

    // Revoke then reject redeem/login
    const householdId = second.json.household.id;
    const revoke = await request(onPort, "DELETE", `/api/family-hub/households/${encodeURIComponent(householdId)}`, {
      email: "owner@example.com",
    });
    assert.equal(revoke.status, 200, revoke.text);
    const revokedToken = String(second.json.magicUrl).split("familyHub=")[1];
    const revokedRedeem = await request(onPort, "POST", "/api/family-hub/invites/redeem", { body: { token: revokedToken } });
    assert.equal(revokedRedeem.status, 404);
    const revokedLogin = await request(onPort, "POST", "/api/family-hub/login", {
      body: { email: "dup.parent@example.com", code: second.json.loginCode },
    });
    assert.equal(revokedLogin.status, 404);

    // Expired invite
    const expiredCreate = await request(onPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: {
        label: "Expired Family",
        email: "expired.parent@example.com",
        children: [{ id: "exp-child", name: "Exp Child" }],
        appOrigin: `http://127.0.0.1:${onPort}`,
      },
    });
    assert.equal(expiredCreate.status, 200, expiredCreate.text);
    const store = JSON.parse(fs.readFileSync(onStore, "utf8"));
    const expHousehold = store.familyHouseholds[expiredCreate.json.household.id];
    expHousehold.expiresAt = new Date(Date.now() - 1000).toISOString();
    store.familyHouseholds[expHousehold.id] = expHousehold;
    const expToken = String(expiredCreate.json.magicUrl).split("familyHub=")[1];
    if (store.familyMagicLinks[expToken]) {
      store.familyMagicLinks[expToken].expiresAt = expHousehold.expiresAt;
    }
    fs.writeFileSync(onStore, JSON.stringify(store, null, 2));
    // Clear in-memory cache by restarting would be heavy; hit peek which re-reads local-json from disk via mtime.
    // Force mtime change already done by write. Local peekStore caches by mtime — should reload.
    await new Promise((r) => setTimeout(r, 50));
    const expiredPeek = await request(onPort, "GET", `/api/family-hub/invites/peek?token=${encodeURIComponent(expToken)}`);
    assert.equal(expiredPeek.status, 410, expiredPeek.text);

    console.log("PASS  Family Hub readiness runtime: fence, seed, guardians, shared feed, revoke, expire, duplicate");
  } catch (error) {
    console.error("FAIL  Family Hub readiness runtime");
    console.error(error);
    process.exitCode = 1;
  } finally {
    offChild.kill("SIGTERM");
    onChild.kill("SIGTERM");
    try { fs.unlinkSync(offStore); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(onStore); } catch (_e) { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll Family Hub testing-readiness checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

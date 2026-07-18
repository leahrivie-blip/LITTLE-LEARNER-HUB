#!/usr/bin/env node
/**
 * Root-cause regression: Admin analytics must not OOM via per-user store clones.
 * Run: node scripts/test-admin-analytics-root-cause.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const os = require("node:os");

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
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const renderYaml = fs.readFileSync(path.join(root, "render.yaml"), "utf8");
const procfile = fs.readFileSync(path.join(root, "Procfile"), "utf8");
const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");

test("peekStore exists and analytics uses it (no per-request full clone)", () => {
  assert.match(serverJs, /function peekStore\(/);
  assert.match(serverJs, /analyticsSummary\(store\)/);
  assert.match(serverJs, /const store = peekStore\(\);/);
  assert.match(serverJs, /\[admin-analytics\] FAILED/);
  assert.match(serverJs, /code: "admin_analytics_failed"/);
});

test("membershipSummaryForUser no longer deep-clones store per user", () => {
  assert.match(serverJs, /function membershipSummaryForUser\(user, storeRef = null\)/);
  assert.match(serverJs, /NEVER call readStore\(\) here/);
  assert.match(serverJs, /\.\.\.membershipSummaryForUser\(user, store\)/);
  assert.match(serverJs, /eventsByUser/);
});

test("analytics events are capped and Node heap limit restored", () => {
  assert.match(serverJs, /MAX_ANALYTICS_EVENTS = 25000/);
  assert.match(renderYaml, /node --max-old-space-size=300 server\/index\.js/);
  assert.match(procfile, /max-old-space-size=300/);
  assert.match(pkg, /max-old-space-size=300/);
});

test("client surfaces real HTTP/body failures instead of generic blank error", () => {
  assert.match(appJs, /\[admin-analytics:client\] request/);
  assert.match(appJs, /\[admin-analytics:client\] response/);
  assert.match(appJs, /non-JSON body \(often a Render crash\/OOM\)/);
  assert.match(appJs, /const rawText = await response\.text\(\)/);
});

test("cache bust versions aligned", () => {
  assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], "20260718-admin-full-remaining");
  assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], "20260718-admin-full-remaining");
  assert.match(sw, /llh-shell-v83-admin-full-remaining/);
});

async function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function integrationTest() {
  const port = 18850 + Math.floor(Math.random() * 40);
  const storePath = path.join(os.tmpdir(), `llh-analytics-root-${Date.now()}.json`);
  const users = {};
  for (let i = 0; i < 120; i += 1) {
    users[`user${i}@example.com`] = {
      email: `user${i}@example.com`,
      plan: i % 5 === 0 ? "Pro" : "Free",
      createdAt: new Date().toISOString(),
      signupAt: new Date().toISOString(),
      featureUsage: { page_view: i },
    };
  }
  const events = [];
  for (let i = 0; i < 8000; i += 1) {
    events.push({
      id: `evt_${i}`,
      name: i % 2 ? "page_view" : "button_click",
      user: `user${i % 120}@example.com`,
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    });
  }
  fs.writeFileSync(storePath, JSON.stringify({
    users,
    analyticsEvents: events,
    adminSessions: {},
    foundingMembers: [],
    siteContent: {},
    supportTickets: [],
    feedbackItems: [],
    membershipAudit: [],
  }));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "owner-pass",
      ADMIN_ACCESS_CODE: "owner-code",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });

  try {
    for (let i = 0; i < 80; i += 1) {
      if (output.includes("running on")) break;
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!output.includes("running on")) throw new Error(`Boot failed: ${output.slice(-500)}`);

    const login = await requestJson(port, "POST", "/api/admin/login", {
      email: "owner@example.com",
      password: "owner-pass",
      code: "owner-code",
    });
    assert.equal(login.status, 200, `login ${login.status} ${login.text}`);
    const token = login.json.token;
    const started = Date.now();
    const analytics = await requestJson(port, "GET", `/api/admin/analytics?adminToken=${encodeURIComponent(token)}`);
    const ms = Date.now() - started;
    assert.equal(analytics.status, 200, `analytics ${analytics.status} ${analytics.text.slice(0, 400)}`);
    assert.ok(analytics.json?.analytics?.users?.length >= 100, "expected user rows");
    assert.ok(ms < 8000, `analytics too slow: ${ms}ms`);
    assert.match(output, /\[admin-analytics\] success/);
    console.log(`PASS  integration analytics with 120 users / 8000 events in ${ms}ms`);
  } catch (error) {
    console.error("FAIL  integration analytics load");
    console.error(error);
    console.error(output.slice(-1200));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

(async () => {
  if (!process.exitCode) await integrationTest();
  if (!process.exitCode) console.log("\nAll admin analytics root-cause tests passed.");
})();

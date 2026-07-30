#!/usr/bin/env node
/**
 * AI Guide Phase 1 — fence, generate with local fallback, no auto-send, writing helpers.
 * Run: npm run test:ai-guide-phase1
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
const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const aiGuideJs = fs.readFileSync(path.join(ROOT, "server/ai-guide.js"), "utf8");
const {
  containsRoboticPhrases,
  localFallbackDraft,
  normalizeLength,
  PHASE1_FEATURES,
} = require(path.join(ROOT, "server/ai-guide.js"));

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

function request(port, method, urlPath, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForHealth(port, child, attempts = 50) {
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

test("shell + nav + view markers", () => {
  assert.match(indexHtml, /SHELL_VERSION = "20260730-ai-guide-p1"/);
  assert.match(indexHtml, /data-view="ai-guide"/);
  assert.match(indexHtml, /data-nav-ai-guide="true"/);
  assert.match(indexHtml, /id="view-ai-guide"/);
  assert.match(appJs, /function isAiGuideEnabled/);
  assert.match(appJs, /function renderAiGuidePage/);
  assert.match(appJs, /function generateAiGuideDraftFromForm/);
  assert.match(appJs, /Nothing is sent, published, signed, or filed automatically/);
  assert.match(stylesCss, /\.ai-guide-category-grid/);
  assert.match(stylesCss, /\.ai-guide-banner/);
});

test("server module exports Phase 1 features and writing helpers", () => {
  assert.equal(PHASE1_FEATURES.length, 6);
  assert.deepEqual(
    PHASE1_FEATURES.map((f) => f.id).sort(),
    ["activity", "form", "incident", "lesson", "observation", "parentMessage"].sort(),
  );
  assert.equal(normalizeLength("quick"), "quick");
  assert.equal(normalizeLength("weird"), "standard");
  assert.ok(containsRoboticPhrases("Furthermore, this is robotic").includes("furthermore"));
  assert.match(localFallbackDraft("observation", "stacked blocks", "standard"), /stacked blocks/);
  assert.match(aiGuideJs, /Never automatically send, publish, sign/);
  assert.match(aiGuideJs, /canAutoSend: false/);
  assert.match(aiGuideJs, /canAutoPublish: false/);
  assert.match(aiGuideJs, /emergencyKillSwitch/);
});

test("client never wires auto-send for AI Guide", () => {
  const start = appJs.indexOf("function generateAiGuideDraftFromForm");
  const end = appJs.indexOf("const HOME_DAYCARE_FORM_CATEGORIES");
  assert.ok(start > 0 && end > start);
  const slice = appJs.slice(start, end);
  assert.doesNotMatch(slice, /\/api\/messages|sendEmail|autoSend|publishNow/);
  assert.match(slice, /Nothing was sent or published|review before/);
});

async function runServerSuite({ enabled, label }) {
  const port = 20100 + Math.floor(Math.random() * 80);
  const storePath = path.join(os.tmpdir(), `llh-ai-guide-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      "guide-tester@example.com": {
        email: "guide-tester@example.com",
        plan: "Pro",
        subscriptionStatus: "Active",
        stripeSubscriptionStatus: "active",
        internalAccessOverride: true,
      },
    },
    siteContent: {},
    foundingMembers: [],
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      AI_GUIDE_ENABLED: enabled ? "true" : "false",
      AI_GUIDE_TESTING_ONLY: "true",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
      // Force local fallback path (no OpenAI key).
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const auth = {
    Authorization: "Bearer test:guide-tester@example.com",
    "X-LLH-User-Email": "guide-tester@example.com",
  };

  try {
    const health = await waitForHealth(port, child);
    assert.equal(Boolean(health.aiGuideEnabled), enabled, `${label}: health.aiGuideEnabled`);

    const configOff = await request(port, "GET", "/api/ai-guide/config", { headers: auth });
    if (!enabled) {
      assert.equal(configOff.status, 404, `${label}: config should 404 when off`);
      console.log(`PASS  ${label}: fence blocks config`);
      return;
    }

    assert.equal(configOff.status, 200, `${label}: config ok`);
    assert.ok(Array.isArray(configOff.json.categories));
    assert.ok(configOff.json.categories.some((c) => c.id === "observations" && c.featureIds.includes("observation")));
    assert.ok(configOff.json.categories.some((c) => c.id === "daily-reports" && (!c.featureIds || !c.featureIds.length)));

    const gen = await request(port, "POST", "/api/ai-guide/generate", {
      headers: auth,
      body: {
        featureId: "observation",
        notes: "Maya stacked five blocks, they fell, she tried again.",
        length: "standard",
        childName: "Maya",
        ageGroup: "Toddler",
      },
    });
    assert.equal(gen.status, 200, `${label}: generate status ${gen.status} ${gen.raw}`);
    assert.equal(gen.json.canAutoSend, false);
    assert.equal(gen.json.canAutoPublish, false);
    assert.ok(gen.json.draft?.id);
    assert.ok(String(gen.json.draft.outputText || "").length > 10);
    assert.equal(gen.json.draft.localFallback, true);

    const revise = await request(port, "POST", "/api/ai-guide/revise", {
      headers: auth,
      body: { draftId: gen.json.draft.id, action: "make_shorter" },
    });
    assert.equal(revise.status, 200, `${label}: revise`);
    assert.ok(revise.json.draft?.id);

    const ack = await request(port, "PATCH", `/api/ai-guide/drafts/${encodeURIComponent(gen.json.draft.id)}`, {
      headers: auth,
      body: { acknowledgeReview: true, outputText: revise.json.draft.outputText },
    });
    assert.equal(ack.status, 200);
    assert.ok(ack.json.draft.reviewAcknowledgedAt);

    const feedback = await request(port, "PATCH", `/api/ai-guide/drafts/${encodeURIComponent(gen.json.draft.id)}/feedback`, {
      headers: auth,
      body: { rating: "helpful" },
    });
    assert.equal(feedback.status, 200);

    // Login admin for kill switch
    const login = await request(port, "POST", "/api/admin/login", {
      body: { email: "admin@example.com", password: "test-password", code: "test-code" },
    });
    assert.equal(login.status, 200, `${label}: admin login ${login.raw}`);
    const adminToken = login.json.token;
    assert.ok(adminToken, "admin token present");

    const killOn = await request(port, "POST", "/api/admin/ai-guide/settings", {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { emergencyKillSwitch: true },
    });
    assert.equal(killOn.status, 200, `${label}: kill on ${killOn.raw}`);

    const blocked = await request(port, "POST", "/api/ai-guide/generate", {
      headers: auth,
      body: { featureId: "parentMessage", notes: "Hard drop-off, then okay.", length: "quick" },
    });
    assert.equal(blocked.status, 503);

    const killOff = await request(port, "POST", "/api/admin/ai-guide/settings", {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { emergencyKillSwitch: false },
    });
    assert.equal(killOff.status, 200);

    // Usage limit: temporarily set daily limit to 1 via settings, then second generate fails.
    await request(port, "POST", "/api/admin/ai-guide/settings", {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { dailyUserLimit: 1 },
    });
    // One successful usage already recorded from first generate (+ revise also counts).
    // Force a low limit and confirm 429 when exhausted — count existing ok usage.
    const overview = await request(port, "GET", "/api/admin/ai-guide/overview", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(overview.status, 200);
    assert.ok(Number(overview.json.totals?.generations || 0) >= 1);

    const limited = await request(port, "POST", "/api/ai-guide/generate", {
      headers: auth,
      body: { featureId: "activity", notes: "Blocks and family photos, 15 minutes.", length: "quick" },
    });
    assert.equal(limited.status, 429, `${label}: daily limit ${limited.status} ${limited.raw}`);

    console.log(`PASS  ${label}: generate/revise/feedback/kill/limit`);
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  if (process.exitCode) return;
  try {
    await runServerSuite({ enabled: false, label: "fence-off" });
    await runServerSuite({ enabled: true, label: "fence-on" });
  } catch (error) {
    console.error("FAIL  runtime AI Guide suite");
    console.error(error);
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    console.log("\nAll AI Guide Phase 1 tests passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

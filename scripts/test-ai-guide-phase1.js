#!/usr/bin/env node
/**
 * AI Guide Phases 1–3 — fence, generators, ask (read-only), templates, insights, kill switch.
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
  PHASE2_FEATURES,
  ALL_FEATURES,
  buildInsights,
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
  assert.match(indexHtml, /SHELL_VERSION = "20260730-admin-boot-landing"/);
  assert.match(indexHtml, /data-view="ai-guide"/);
  assert.match(indexHtml, /data-nav-ai-guide="true"/);
  assert.match(indexHtml, /id="view-ai-guide"/);
  assert.match(appJs, /function isAiGuideEnabled/);
  assert.match(appJs, /function renderAiGuidePage/);
  assert.match(appJs, /function generateAiGuideDraftFromForm/);
  assert.match(appJs, /\/api\/ai-guide\/ask/);
  assert.match(appJs, /data-ai-guide-insights/);
  assert.match(appJs, /Nothing is sent, published, signed, or filed automatically/);
  assert.match(stylesCss, /\.ai-guide-category-grid/);
  assert.match(stylesCss, /\.ai-guide-source-fieldset/);
  assert.match(stylesCss, /\.ai-guide-citations/);
});

test("server exports Phase 1–3 features and writing helpers", () => {
  assert.equal(PHASE1_FEATURES.length, 6);
  assert.equal(PHASE2_FEATURES.length, 7);
  assert.equal(ALL_FEATURES.length, 13);
  assert.ok(ALL_FEATURES.some((f) => f.id === "daily"));
  assert.ok(ALL_FEATURES.some((f) => f.id === "behaviorNote"));
  assert.ok(ALL_FEATURES.some((f) => f.id === "developmentSummary"));
  assert.ok(ALL_FEATURES.some((f) => f.id === "policyHandbook"));
  assert.equal(normalizeLength("quick"), "quick");
  assert.ok(containsRoboticPhrases("Furthermore, this is robotic").includes("furthermore"));
  assert.match(localFallbackDraft("daily", "Ate lunch. Nap 1–2.", "standard"), /Ate lunch/);
  assert.match(localFallbackDraft("askProgram", "Who needs forms?", "standard", {
    sourceRecords: [{ type: "observation", title: "Maya blocks", summary: "stacked five" }],
  }), /Sources used|Read-only/);
  assert.match(aiGuideJs, /Never automatically send, publish, sign/);
  assert.match(aiGuideJs, /canAutoSend: false/);
  assert.match(aiGuideJs, /canMutate: false/);
  assert.match(aiGuideJs, /handleAsk/);
  assert.match(aiGuideJs, /handleInsights/);
  assert.match(aiGuideJs, /handleSaveTemplate/);
  const insights = buildInsights({
    children: [{ id: "c1", name: "Maya" }],
    forms: [],
    observations: [],
  });
  assert.ok(insights.some((item) => item.type === "missing_forms"));
});

test("client never wires auto-send or mutation for AI Guide", () => {
  const start = appJs.indexOf("function generateAiGuideDraftFromForm");
  const end = appJs.indexOf("const HOME_DAYCARE_FORM_CATEGORIES");
  assert.ok(start > 0 && end > start);
  const slice = appJs.slice(start, end);
  assert.doesNotMatch(slice, /\/api\/messages|sendEmail|autoSend|publishNow/);
  assert.match(slice, /read-only|Nothing was sent or published|review before/i);
});

async function runServerSuite({ enabled, label }) {
  const port = 20200 + Math.floor(Math.random() * 80);
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
    assert.equal(configOff.json.status?.phase, 3);
    assert.ok(configOff.json.categories.some((c) => c.id === "daily-reports" && c.featureIds.includes("daily")));
    assert.ok(configOff.json.categories.some((c) => c.id === "ask-program" && c.askMode));
    assert.ok(configOff.json.askEnabled);

    const phase2Ids = ["daily", "behaviorNote", "developmentSummary", "policyHandbook", "enrollmentMessage", "staffMessage", "adminWriting"];
    for (const featureId of phase2Ids) {
      const gen = await request(port, "POST", "/api/ai-guide/generate", {
        headers: auth,
        body: {
          featureId,
          notes: `Sample notes for ${featureId}`,
          length: "quick",
          state: featureId === "policyHandbook" ? "TX" : "",
          sourceRecords: featureId === "developmentSummary"
            ? [{ id: "o1", type: "observation", title: "Blocks", summary: "Stacked five blocks", date: "2026-07-01" }]
            : [],
        },
      });
      assert.equal(gen.status, 200, `${label}: generate ${featureId} => ${gen.status} ${gen.raw}`);
      assert.equal(gen.json.canAutoSend, false);
      assert.equal(gen.json.canAutoPublish, false);
      assert.ok(gen.json.draft?.id);
    }

    const ask = await request(port, "POST", "/api/ai-guide/ask", {
      headers: auth,
      body: {
        question: "What did Maya practice in blocks?",
        sourceRecords: [{ id: "o1", type: "observation", title: "Blocks", summary: "Maya stacked five blocks.", date: "2026-07-01" }],
        length: "standard",
      },
    });
    assert.equal(ask.status, 200, `${label}: ask ${ask.raw}`);
    assert.equal(ask.json.canMutate, false);
    assert.equal(ask.json.readOnly, true);
    assert.ok(ask.json.draft?.askMode);

    const insights = await request(port, "POST", "/api/ai-guide/insights", {
      headers: auth,
      body: {
        children: [{ id: "c1", name: "Maya" }],
        forms: [],
        observations: [],
      },
    });
    assert.equal(insights.status, 200);
    assert.ok(Array.isArray(insights.json.insights));
    assert.equal(insights.json.canMutate, false);

    const template = await request(port, "POST", "/api/ai-guide/templates", {
      headers: auth,
      body: { featureId: "parentMessage", title: "Drop-off note", notes: "Hard drop-off then okay.", length: "quick" },
    });
    assert.equal(template.status, 200, `${label}: template ${template.raw}`);
    assert.ok(template.json.template?.id);

    const login = await request(port, "POST", "/api/admin/login", {
      body: { email: "admin@example.com", password: "test-password", code: "test-code" },
    });
    assert.equal(login.status, 200, `${label}: admin login ${login.raw}`);
    const adminToken = login.json.token;
    assert.ok(adminToken);

    const killOn = await request(port, "POST", "/api/admin/ai-guide/settings", {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { emergencyKillSwitch: true },
    });
    assert.equal(killOn.status, 200);

    const blocked = await request(port, "POST", "/api/ai-guide/generate", {
      headers: auth,
      body: { featureId: "observation", notes: "Blocked while kill switch on.", length: "quick" },
    });
    assert.equal(blocked.status, 503);

    const killOff = await request(port, "POST", "/api/admin/ai-guide/settings", {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { emergencyKillSwitch: false, dailyUserLimit: 1 },
    });
    assert.equal(killOff.status, 200);

    const limited = await request(port, "POST", "/api/ai-guide/generate", {
      headers: auth,
      body: { featureId: "activity", notes: "Should hit daily limit.", length: "quick" },
    });
    assert.equal(limited.status, 429, `${label}: daily limit ${limited.status} ${limited.raw}`);

    const overview = await request(port, "GET", "/api/admin/ai-guide/overview", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(overview.status, 200);
    assert.ok(Number(overview.json.totals?.askQueries || 0) >= 1);
    assert.ok(Number(overview.json.totals?.templates || 0) >= 1);

    console.log(`PASS  ${label}: phases 1–3 generate/ask/insights/templates/kill/limit`);
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
    console.log("\nAll AI Guide Phase 1–3 tests passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

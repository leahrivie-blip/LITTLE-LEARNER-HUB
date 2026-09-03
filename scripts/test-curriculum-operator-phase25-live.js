#!/usr/bin/env node
/**
 * Optional Phase 2.5 LIVE AI integration (safe fixture store only).
 *
 * Requires:
 *   OPENAI_API_KEY
 *   LLH_OPERATOR_LIVE_AI=1
 *
 * Never touches catalog seed / production curriculum.
 * Run: LLH_OPERATOR_LIVE_AI=1 npm run test:curriculum-operator-phase25-live
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 20810 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-op-p25-live-${crypto.randomBytes(4).toString("hex")}.json`);
const JOB_STORE_PATH = path.join(os.tmpdir(), `llh-op-p25-live-jobs-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "operator-pass",
  code: "operator-code",
};
const WEATHER_ID = "cur-lp-op-phase25-weather-watchers";

function requestJson(method, urlPath, body, headers = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch (_e) { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, attempts = 80) {
  for (let n = 0; n < attempts; n += 1) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("health timeout");
}

async function main() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  const enabled = ["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_LIVE_AI || "").trim().toLowerCase());
  if (!enabled) {
    console.log("SKIP: set LLH_OPERATOR_LIVE_AI=1 to run the live AI fixture test.");
    return;
  }
  if (!key || key.length < 20) {
    console.log("SKIP: OPENAI_API_KEY not configured.");
    return;
  }

  const now = new Date().toISOString();
  const curriculum = {
    lessonPlans: [{
      id: WEATHER_ID,
      title: "Weather Watchers",
      age: "Preschool 3–4 Years",
      theme: "Weather",
      plan: "Pro",
      status: "draft",
      weeklyOverview: "A starter overview only.",
      objectives: "",
      enrichmentDraft: {
        week: { weeklyOverview: "Weather Watchers starter draft for live AI test." },
        activities: {},
        updatedAt: now,
      },
      dailyPlans: {
        monday: { items: [{ itemId: "ww1", title: "Cloud Watching", dayOfWeek: "monday" }] },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      activityIds: ["cur-act-ww1"],
      updatedAt: now,
      createdAt: now,
    }],
    activities: [{
      id: "cur-act-ww1",
      lessonPlanId: WEATHER_ID,
      itemId: "ww1",
      title: "Cloud Watching",
      dayOfWeek: "monday",
      status: "draft",
    }],
    resources: [],
    updatedAt: now,
  };

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: { sentinel: true },
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true, playBasedCurriculum: true },
      curriculum,
      updatedAt: now,
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      CURRICULUM_OPERATOR_JOB_STORE_PATH: JOB_STORE_PATH,
      // Intentionally NOT NODE_ENV=test so live OpenAI path is used
      NODE_ENV: "development",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      LLH_OPERATOR_AI_FIXTURE: "0",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      ADMIN_EMAILS: OWNER.email,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (c) => { stderr += String(c); });

  try {
    await waitForHealth(child);
    const before = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (before.siteContent.curriculum.lessonPlans.length !== 1) {
      throw new Error("Live test store was contaminated by catalog seed.");
    }
    const login = await requestJson("POST", "/api/admin/login", OWNER);
    if (login.status !== 200) throw new Error("login failed");
    const auth = { Authorization: `Bearer ${login.json.token || login.json.adminToken}` };

    const run = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 2,
      command: "Fix Weather Watchers.",
    }, auth);

    const lr = run.json.job?.lessonResults?.[0];
    console.log("LIVE AI integration result");
    console.log({
      httpStatus: run.status,
      jobStatus: run.json.job?.status,
      lessonId: lr?.lessonId,
      beforeReadiness: lr?.beforeScores?.premiumReadinessPercent,
      afterReadiness: lr?.afterScores?.premiumReadinessPercent,
      ownerReviewStatus: lr?.ownerReviewStatus,
      changedCount: lr?.updated?.length || 0,
      changedSample: (lr?.updated || []).slice(0, 8).map((c) => c.path),
      verificationOk: lr?.upgradeVerification?.ok,
      published: lr?.published,
      publishEnabled: run.json.publishEnabled,
      aiUsage: lr?.aiUsage || null,
      openaiCalls: run.json.job?.costCounters?.openaiCalls,
      error: lr?.error || null,
    });

    const after = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (after.siteContent.curriculum.lessonPlans.length !== 1) {
      throw new Error("Live test mutated unexpected lesson count.");
    }
    if (after.users?.sentinel !== true) {
      throw new Error("Unrelated store data changed.");
    }
    if (run.status !== 200 || lr?.upgradeVerification?.ok !== true) {
      throw new Error(`Live AI upgrade failed: ${lr?.error || run.json.error || "unknown"}`);
    }
    if (lr.published !== false || run.json.publishEnabled !== false) {
      throw new Error("Publish was not blocked.");
    }
    console.log("LIVE AI fixture test passed (temp store only; no live catalog).");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(JOB_STORE_PATH); } catch { /* ignore */ }
    if (stderr && /Error:/.test(stderr)) console.error(stderr.slice(-1500));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

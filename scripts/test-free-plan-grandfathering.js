#!/usr/bin/env node
/**
 * Free-plan policy: legacy Free unlock is retired.
 * Every Free account — new and existing — uses the curated 10-plan Starter Library.
 * Run: node scripts/test-free-plan-grandfathering.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const grandfathering = require("./free-plan-grandfathering.js");
const freeSample = require("./free-curriculum-sample.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20010 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-free-gf-${crypto.randomBytes(4).toString("hex")}.json`);

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

const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");

test("legacy Free unlock is permanently disabled", () => {
  assert.equal(grandfathering.hasLegacyFreeLessonAccess({
    plan: "Free",
    createdAt: "2020-01-01T00:00:00.000Z",
    freeLessonAccessMode: "legacy",
  }), false);
  assert.equal(grandfathering.resolveFreeLessonAccessMode({
    plan: "Free",
    freeLessonAccessMode: "legacy",
    createdAt: "2020-01-01T00:00:00.000Z",
  }), "curated");
  assert.equal(grandfathering.modeForNewSignup({}), "curated");
  assert.match(grandfathering.FREE_POLICY_NOTICE, /10 complete starter lesson plans/i);
  assert.match(grandfathering.freePolicyNotice(), /saved information remains available/i);
});

test("client/server enforce curated-only Free unlock", () => {
  assert.match(appJs, /hasLegacyFreeLessonAccess/);
  assert.match(appJs, /return false;\n\}/);
  assert.match(appJs, /freePolicyNoticeText/);
  assert.match(appJs, /Your Free account includes 10 complete [Ss]tarter [Ll]esson [Pp]lans/);
  assert.match(serverJs, /Legacy Free bypass is permanently disabled/);
  assert.match(serverJs, /userMayUnlockFreeCurriculumPlan/);
  assert.match(indexHtml, /free-plan-grandfathering\.js/);
  assert.equal(freeSample.DEFAULT_FREE_STARTER_LESSON_IDS.length, 10);
});

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  if (process.exitCode) return;
  const freeId = freeSample.DEFAULT_FREE_STARTER_LESSON_IDS[0];
  const premiumId = "cur-lp-preschool-letters-and-sounds";
  const store = {
    users: {
      "legacy.free@test.local": {
        email: "legacy.free@test.local",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        createdAt: "2020-01-01T00:00:00.000Z",
        freeLessonAccessMode: "legacy",
        favorites: [premiumId, freeId],
      },
    },
    siteContent: {
      curriculum: {
        lessonPlans: [
          {
            id: freeId,
            title: "Free Starter",
            age: "Infant",
            plan: "Free",
            status: "published",
            weeklyOverview: "Starter body",
            dailyPlans: { Monday: { items: [{ title: "Play" }] } },
          },
          {
            id: premiumId,
            title: "Letters & Sounds",
            age: "Preschool",
            plan: "Pro",
            status: "published",
            weeklyOverview: "Premium body",
            objectives: ["SECRET"],
            dailyPlans: { Monday: { items: [{ title: "SECRET_ACT" }] } },
          },
        ],
        activities: [],
        resources: [],
      },
      freePlanAccess: { enabled: true, curatedCutoffAt: "2026-07-18T00:00:00.000Z" },
    },
    foundingMembers: [],
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    for (let i = 0; i < 80; i += 1) {
      try {
        const h = await request("GET", "/api/health");
        if (h.status === 200) break;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    const headers = {
      Authorization: "Bearer test:legacy.free@test.local",
      "x-llh-user-email": "legacy.free@test.local",
    };
    const starter = await request("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(freeId)}`, null, headers);
    assert.equal(starter.status, 200);
    assert.equal(starter.json.lessonPlan.locked, false);
    assert.ok(starter.json.lessonPlan.dailyPlans);

    const premium = await request("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(premiumId)}`, null, headers);
    assert.ok([200, 403].includes(premium.status));
    if (premium.status === 200) {
      assert.equal(premium.json.lessonPlan.locked, true);
      assert.equal(premium.json.lessonPlan.dailyPlans, undefined);
      assert.doesNotMatch(JSON.stringify(premium.json), /SECRET_ACT/);
    }
    console.log("PASS  existing Free with legacy label receives curated-only unlock");
    console.log("PASS  saved premium references stay locked without content leak");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

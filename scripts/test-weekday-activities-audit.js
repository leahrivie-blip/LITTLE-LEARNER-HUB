#!/usr/bin/env node
/**
 * Audit: every published core toddler/infant plan has Mon–Fri activities,
 * importer rejects incomplete published pastes, and save guards preserve days.
 * Run: npm run test:weekday-activities-audit
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const { TODDLER_CORE_IMPORT_TARGETS, readToddlerCoreImportTarget } = require("./curriculum-toddler-core-import-targets.js");
const { INFANT_CORE_IMPORT_TARGETS, readInfantCoreImportTarget } = require("./curriculum-infant-core-import-targets.js");

const ROOT = path.join(__dirname, "..");
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const PORT = 19720 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-weekday-audit-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "weekday-audit@test.local",
  password: "weekday-audit-pass",
  code: "weekday-audit-code",
};

function dayCounts(plan) {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, Array.isArray(plan?.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items.length : 0]),
  );
}

function assertCompleteWeek(plan, label) {
  const counts = dayCounts(plan);
  const missing = WEEKDAYS.filter((day) => !counts[day]);
  assert.equal(missing.length, 0, `${label} missing days: ${missing.join(",")} counts=${JSON.stringify(counts)}`);
  for (const day of WEEKDAYS) {
    for (const item of plan.dailyPlans[day].items) {
      assert.ok(String(item.title || "").trim(), `${label} ${day} missing title`);
      assert.ok(String(item.activityCategory || "").trim(), `${label} ${day}/${item.title} missing category`);
      assert.ok(String(item.objective || "").trim(), `${label} ${day}/${item.title} missing objective`);
      assert.ok(String(item.description || "").trim(), `${label} ${day}/${item.title} missing description`);
      assert.ok(String(item.materials || "").trim(), `${label} ${day}/${item.title} missing materials`);
      assert.ok(String(item.setup || "").trim(), `${label} ${day}/${item.title} missing setup`);
      assert.ok(String(item.steps || item.directions || "").trim(), `${label} ${day}/${item.title} missing directions`);
      assert.ok(String(item.teacherRole || "").trim(), `${label} ${day}/${item.title} missing teacherRole`);
      assert.ok(
        (Array.isArray(item.learningGoals) ? item.learningGoals.length : String(item.learningGoals || "").trim()),
        `${label} ${day}/${item.title} missing learningGoals`,
      );
      assert.ok(String(item.observationOpportunities || "").trim(), `${label} ${day}/${item.title} missing observations`);
      assert.ok(String(item.adaptations || "").trim(), `${label} ${day}/${item.title} missing adaptations`);
      assert.ok(String(item.safetyNotes || "").trim(), `${label} ${day}/${item.title} missing safetyNotes`);
      const steps = String(item.steps || item.directions || "").split(/\n/).filter((line) => /^\s*\d+\./.test(line));
      assert.ok(steps.length >= 3, `${label} ${day}/${item.title} needs 3+ numbered directions (got ${steps.length})`);
    }
  }
}

function request(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  // Seed store with a deliberately truncated plan so startup repair must fill weekdays.
  const truncated = readToddlerCoreImportTarget(TODDLER_CORE_IMPORT_TARGETS[0]);
  truncated.dailyPlans.wednesday.items = [];
  truncated.dailyPlans.thursday.items = [];
  truncated.dailyPlans.friday.items = [];
  const store = {
    users: {},
    siteContent: {
      curriculum: {
        lessonPlans: [truncated],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function main() {
  console.log("Static source completeness…");
  for (const target of TODDLER_CORE_IMPORT_TARGETS) {
    const plan = readToddlerCoreImportTarget(target);
    assertCompleteWeek(plan, target.stableId);
  }
  for (const target of INFANT_CORE_IMPORT_TARGETS) {
    const plan = readInfantCoreImportTarget(target);
    assertCompleteWeek(plan, target.stableId);
  }
  console.log(`PASS ${TODDLER_CORE_IMPORT_TARGETS.length + INFANT_CORE_IMPORT_TARGETS.length} core import sources complete`);

  const completePaste = fs.readFileSync(
    path.join(ROOT, "scripts/curriculum-toddler-core-imports/toddler-colors-everywhere.txt"),
    "utf8",
  );
  // Rebuild a published incomplete paste from Monday/Tuesday only.
  const monTueOnly = `${completePaste.split(/^WEDNESDAY:/im)[0].trim()}\n\nWEDNESDAY:\n\nTHURSDAY:\n\nFRIDAY:\n`;
  const rejected = parseCurriculumLessonPlanImport(monTueOnly);
  assert.equal(rejected.ok, false, "published incomplete paste should fail");
  assert.ok((rejected.errors || []).some((err) => /Missing activities/i.test(err)), rejected.errors);
  console.log("PASS importer rejects published incomplete weeks");

  const allowed = parseCurriculumLessonPlanImport(monTueOnly, { allowIncompleteWeekdays: true });
  assert.equal(allowed.ok, true, "allowIncompleteWeekdays should parse for repair tooling");
  console.log("PASS repair tooling can parse truncated sources");

  const child = startServer();
  try {
    await waitForBoot(child);
    // Give startup seeds a moment to finish writing.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const login = await request("POST", "/api/admin/login", {
      body: { email: ADMIN.email, password: ADMIN.password, code: ADMIN.code },
    });
    assert.equal(login.status, 200, `admin login ${login.status}`);
    const site = await request("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(login.json.token)}`);
    assert.equal(site.status, 200);
    const plans = site.json?.siteContent?.curriculum?.lessonPlans || [];
    const repaired = plans.find((plan) => plan.id === TODDLER_CORE_IMPORT_TARGETS[0].stableId);
    assert.ok(repaired, "startup seed should keep/repair core toddler plan");
    assertCompleteWeek(repaired, "startup-repaired");
    console.log("PASS startup seed repairs truncated weekday plans");

    // Saving a published plan with an empty Friday must be rejected.
    const badSave = await request("POST", "/api/admin/curriculum/lesson-plans", {
      body: {
        adminToken: login.json.token,
        expectedUpdatedAt: site.json.siteContent.updatedAt,
        lessonPlan: {
          ...repaired,
          dailyPlans: {
            ...repaired.dailyPlans,
            friday: { ...(repaired.dailyPlans.friday || {}), items: [] },
          },
        },
      },
    });
    assert.equal(badSave.status, 400, `expected 400, got ${badSave.status} ${badSave.text?.slice(0, 200)}`);
    assert.match(String(badSave.json?.error || ""), /every weekday|Missing/i);
    console.log("PASS admin save blocks published plans with empty weekdays");

    // Valid save still works and does not wipe days.
    const site2 = await request("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(login.json.token)}`);
    const goodSave = await request("POST", "/api/admin/curriculum/lesson-plans", {
      body: {
        adminToken: login.json.token,
        expectedUpdatedAt: site2.json.siteContent.updatedAt,
        lessonPlan: {
          ...repaired,
          weeklyOverview: `${repaired.weeklyOverview}\n\nWeekday audit save check.`,
        },
      },
    });
    assert.equal(goodSave.status, 200, `good save failed ${goodSave.status} ${goodSave.text?.slice(0, 200)}`);
    const saved = goodSave.json?.lessonPlan || goodSave.json?.siteContent?.curriculum?.lessonPlans?.find((p) => p.id === repaired.id);
    // Re-fetch for authoritative plan
    const site3 = await request("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(login.json.token)}`);
    const after = (site3.json?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === repaired.id);
    assertCompleteWeek(after || saved, "after-save");
    console.log("PASS editing/saving keeps weekday activities");

    console.log("\nAll weekday activity audit checks passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message || error);
  process.exitCode = 1;
});

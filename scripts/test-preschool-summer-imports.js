#!/usr/bin/env node
/**
 * Preschool Pro summer imports
 * (Zoo Veterinarians, Water Park Engineers, Ice Cream Shop Entrepreneurs).
 * Run: NODE_ENV=test node scripts/test-preschool-summer-imports.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4194;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.preschool-summer-test-store-${process.pid}.json`);

const {
  PRESCHOOL_SUMMER_IMPORT_TARGETS,
  readPreschoolSummerImportTarget,
} = require("./curriculum-preschool-summer-import-targets.js");

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers: { Accept: "application/json" } }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not become healthy");
}

function mainSyncChecks() {
  assert.equal(PRESCHOOL_SUMMER_IMPORT_TARGETS.length, 3);
  for (const target of PRESCHOOL_SUMMER_IMPORT_TARGETS) {
    const parsed = readPreschoolSummerImportTarget(target);
    assert.equal(parsed.id, target.stableId);
    assert.equal(parsed.plan, "Pro");
    assert.equal(parsed.status, "published");
    assert.equal(parsed.age, "Preschool");
    assert.equal(parsed.title, target.title);
    assert.ok(parsed._activityCount >= 15, `${target.title} should have 15 activities, got ${parsed._activityCount}`);
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      assert.equal((parsed.dailyPlans[day]?.items || []).length, 3, `${target.title} ${day}`);
    });
    console.log(`PASS  parse ${target.title} (${parsed._activityCount} activities)`);
  }
}

async function main() {
  mainSyncChecks();

  fs.writeFileSync(STORE, JSON.stringify({
    users: {},
    siteContent: {
      curriculum: { lessonPlans: [], activities: [], resources: [], updatedAt: "" },
      updatedAt: "",
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      DATABASE_PROVIDER: "local-json",
      SITE_URL: BASE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();
    await new Promise((r) => setTimeout(r, 500));
    assert.match(bootLog, /curriculum-preschool-summer-seed/);

    const store = JSON.parse(fs.readFileSync(STORE, "utf8"));
    const plans = store.siteContent?.curriculum?.lessonPlans || [];
    const activities = store.siteContent?.curriculum?.activities || [];

    for (const target of PRESCHOOL_SUMMER_IMPORT_TARGETS) {
      const plan = plans.find((p) => p.id === target.stableId);
      assert.ok(plan, `missing plan ${target.stableId}`);
      assert.equal(plan.status, "published");
      assert.equal(plan.plan, "Pro");
      assert.equal(plan.age, "Preschool");
      assert.equal(plan.title, target.title);
      const linked = activities.filter((a) => a.lessonPlanId === plan.id && a.status === "published");
      assert.ok(linked.length >= 15, `${target.title} expected >=15 published activities, got ${linked.length}`);
      assert.ok((plan.activityIds || []).length >= 15, `${target.title} activityIds missing`);
      assert.ok(linked.some((a) => a.activityCategory === "Dramatic Play"), `${target.title} missing Dramatic Play`);
      assert.ok(linked.some((a) => a.activityCategory === "STEM/Discovery" || a.activityCategory === "Circle Time"), `${target.title} missing STEM/Discovery or Circle Time`);
      console.log(`PASS  seeded ${target.title} with ${linked.length} activities`);
    }
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }

  console.log("\nAll preschool summer import tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

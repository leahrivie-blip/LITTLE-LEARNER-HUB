#!/usr/bin/env node
/**
 * Toddler Apple unit Pro imports + Netflix-style covers.
 * Run: NODE_ENV=test node scripts/test-toddler-apple-unit-imports.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4210 + Math.floor(Math.random() * 20);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.toddler-apple-test-store-${process.pid}.json`);

const {
  TODDLER_PRO_IMPORT_TARGETS,
  readToddlerImportTarget,
} = require("./curriculum-toddler-import-targets.js");
const coverCatalog = require("./lesson-plan-cover-catalog.js");
const { resolveLessonPlanCover } = require("./lesson-plan-covers.js");

const APPLE_TITLES = [
  "Amazing Apples",
  "Apple Orchard Adventure",
  "Apples in the Kitchen",
  "Johnny Appleseed & Apple Fun",
];

const APPLE_TARGETS = TODDLER_PRO_IMPORT_TARGETS.filter((target) => APPLE_TITLES.includes(target.title));

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
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not become healthy");
}

function mainSyncChecks() {
  assert.equal(APPLE_TARGETS.length, 4, "expected 4 Apple unit toddler targets");
  for (const target of APPLE_TARGETS) {
    const parsed = readToddlerImportTarget(target);
    assert.equal(parsed.id, target.stableId);
    assert.equal(parsed.plan, "Pro");
    assert.equal(parsed.status, "published");
    assert.equal(parsed.age, "Toddler");
    assert.equal(parsed.theme, "Apples");
    assert.equal(parsed.title, target.title);
    assert.ok(parsed._activityCount >= 20, `${target.title} should have 20 activities, got ${parsed._activityCount}`);
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      assert.equal((parsed.dailyPlans[day]?.items || []).length, 4, `${target.title} ${day}`);
      assert.ok(parsed.dailyPlans[day]?.theme, `${target.title} ${day} theme`);
    });

    const catalog = coverCatalog.getPlanCoverByTitle(target.title);
    assert.ok(catalog, `cover catalog entry for ${target.title}`);
    const coverPath = path.join(ROOT, "images", "lesson-covers", `${catalog.slug}.jpg`);
    assert.ok(fs.existsSync(coverPath), `missing cover asset ${coverPath}`);
    const resolved = resolveLessonPlanCover({ title: target.title, age: "Toddler", theme: "Apples" });
    assert.match(String(resolved.url || ""), new RegExp(`${catalog.slug}\\.jpg`));
    console.log(`PASS  parse+cover ${target.title} (${parsed._activityCount} activities)`);
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
      PORT: String(PORT),
      SITE_URL: BASE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();
    await new Promise((r) => setTimeout(r, 800));
    assert.match(bootLog, /curriculum-toddler-seed/);

    const store = JSON.parse(fs.readFileSync(STORE, "utf8"));
    const plans = store.siteContent?.curriculum?.lessonPlans || [];
    const activities = store.siteContent?.curriculum?.activities || [];

    for (const target of APPLE_TARGETS) {
      const plan = plans.find((p) => p.id === target.stableId);
      assert.ok(plan, `missing plan ${target.stableId}`);
      assert.equal(plan.status, "published");
      assert.equal(plan.plan, "Pro");
      assert.equal(plan.age, "Toddler");
      assert.equal(plan.theme, "Apples");
      assert.equal(plan.title, target.title);
      const linked = activities.filter((a) => a.lessonPlanId === plan.id && a.status === "published");
      assert.ok(linked.length >= 20, `${target.title} expected >=20 published activities, got ${linked.length}`);
      assert.ok((plan.activityIds || []).length >= 20, `${target.title} activityIds missing`);
      console.log(`PASS  seeded ${target.title} with ${linked.length} activities`);
    }
    console.log("\nAll Toddler Apple unit import tests passed.");
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

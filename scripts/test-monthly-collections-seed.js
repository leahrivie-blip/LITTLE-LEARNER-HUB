#!/usr/bin/env node
/**
 * Smoke-test starter Monthly Curriculum collections seed.
 * Exact-title rule: missing plans stay empty and flagged — never auto-substituted.
 * Run: node scripts/test-monthly-collections-seed.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const {
  MONTHLY_COLLECTION_DEFINITIONS,
  missingExactPlanReport,
} = require("./curriculum-monthly-collections.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4800 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-monthly-collections-${crypto.randomBytes(4).toString("hex")}.json`);

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: { Accept: "application/json" },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(raw); } catch { /* ignore */ }
          resolve({ status: res.statusCode, json, text: raw });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function waitForHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server health timeout");
}

async function main() {
  assert.equal(MONTHLY_COLLECTION_DEFINITIONS.length, 8, "expected 8 starter collections");
  const flagged = missingExactPlanReport();
  assert.ok(flagged.length >= 1, "expected at least one manually flagged missing exact title");
  // Guardrail: infant Music & Movement must NOT silently use the toddler plan.
  const movement = MONTHLY_COLLECTION_DEFINITIONS.find((item) => item.id === "cur-series-infant-movement-music");
  assert.equal(movement.weeks[0].lessonPlanId, "", "Infant Music & Movement must stay empty until exact infant title exists");
  assert.equal(movement.weeks[0].needsManualPick, true);

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: { curriculum: { lessonPlans: [], activities: [], series: [] } },
  }, null, 2));

  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      LAUNCH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: "monthly-collections@test.local",
      ADMIN_PASSWORD: "monthly-collections-pass",
      ADMIN_ACCESS_CODE: "monthly-collections-code",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d.toString(); });
  child.stderr.on("data", (d) => { output += d.toString(); });

  try {
    await waitForHealth(child);
    for (let i = 0; i < 80; i += 1) {
      if (/curriculum-monthly-collections-seed/.test(output)) break;
      if (child.exitCode != null) throw new Error(`Server exited early\n${output}`);
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 800));

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const plans = store.siteContent?.curriculum?.lessonPlans || [];
    const series = store.siteContent?.curriculum?.series || [];
    const planIds = new Set(plans.map((p) => p.id));

    assert.match(output, /curriculum-monthly-collections-seed/);
    assert.match(output, /need manual plan picks|seeded|repaired/);

    for (const definition of MONTHLY_COLLECTION_DEFINITIONS) {
      const live = series.find((item) => item.id === definition.id);
      assert.ok(live, `Missing collection ${definition.id}`);
      assert.equal(live.title, definition.title);
      assert.equal(live.age, definition.age);
      const expectedStatus = definition.weeks.some((week) => week.lessonPlanId) ? "published" : "needs_review";
      assert.equal(String(live.status), expectedStatus, `${definition.title} status`);
      assert.equal((live.weeks || []).length, 4);
      (live.weeks || []).forEach((week, index) => {
        const expected = definition.weeks[index];
        assert.equal(week.lessonPlanId, expected.lessonPlanId, `${definition.title} week ${week.weekNumber} plan`);
        assert.equal(week.label, expected.label, `${definition.title} week ${week.weekNumber} label`);
        if (expected.lessonPlanId) {
          assert.ok(planIds.has(week.lessonPlanId), `Plan missing for ${expected.label}: ${week.lessonPlanId}`);
        } else {
          assert.ok(!week.lessonPlanId, `Flagged week must stay empty: ${definition.title} W${week.weekNumber}`);
          assert.equal(Boolean(week.needsManualPick), true, `${definition.title} W${week.weekNumber} should be flagged`);
        }
      });
      console.log(`PASS  ${definition.title} (${expectedStatus}${definition.missingWeekLabels?.length ? ` · ${definition.missingWeekLabels.length} gap(s)` : ""})`);
    }

    // Incomplete collections must still be published so Curriculum tabs stay usable.
    const publishedWithGaps = MONTHLY_COLLECTION_DEFINITIONS.filter((item) => item.status === "published" && item.missingWeekLabels?.length);
    assert.ok(publishedWithGaps.length >= 1, "expected incomplete collections to stay published for visibility");
    // Guardrail: no similar-title substitutes in the live store.
    const forbiddenSubs = [
      ["cur-series-infant-babys-first-discoveries", 1, "cur-lp-infant-soft-sounds-faces"],
      ["cur-series-infant-movement-music", 1, "cur-lp-toddler-music-movement"],
      ["cur-series-toddler-community-around-us", 2, "cur-lp-toddler-transportation-builders"],
      ["cur-series-toddler-nature-explorers", 4, "cur-lp-toddler-weather-wonders"],
      ["cur-series-toddler-adventure-month", 4, "cur-lp-toddler-space-explorers-stem"],
    ];
    for (const [seriesId, weekNumber, badId] of forbiddenSubs) {
      const live = series.find((item) => item.id === seriesId);
      const week = (live?.weeks || []).find((item) => Number(item.weekNumber) === weekNumber);
      assert.notEqual(week?.lessonPlanId, badId, `${seriesId} W${weekNumber} must not use similar substitute ${badId}`);
    }

    console.log(`\n✅ Seeded ${MONTHLY_COLLECTION_DEFINITIONS.length} collections · ${flagged.length} week(s) flagged for manual pick.`);
    flagged.forEach((row) => {
      console.log(`FLAG  ${row.curriculumTitle} · Week ${row.weekNumber} · “${row.requestedTitle}”`);
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

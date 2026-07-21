#!/usr/bin/env node
/**
 * Smoke-test Infant/Toddler Pro batch seed against an ephemeral server store.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const {
  INFANT_TODDLER_PRO_BATCH_TARGETS,
  readInfantToddlerProBatchTarget,
} = require("./curriculum-infant-toddler-pro-batch-targets.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-it-pro-batch-${crypto.randomBytes(4).toString("hex")}.json`);

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
  for (let i = 0; i < 40; i += 1) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server health timeout");
}

async function main() {
  // Parse sanity for every target
  for (const target of INFANT_TODDLER_PRO_BATCH_TARGETS) {
    const plan = readInfantToddlerProBatchTarget(target);
    assert.equal(plan.id, target.stableId);
    assert.ok(plan._activityCount >= 10, `${target.title} expected >=10 activities, got ${plan._activityCount}`);
    assert.equal(plan.plan, "Pro");
    console.log(`PASS  parse ${target.title} (${plan._activityCount} activities)`);
  }

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
      LAUNCH_STORE_PATH: STORE_PATH,
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: "it-pro-batch@test.local",
      ADMIN_PASSWORD: "it-pro-batch-pass",
      ADMIN_ACCESS_CODE: "it-pro-batch-code",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d.toString(); });
  child.stderr.on("data", (d) => { output += d.toString(); });

  try {
    await waitForHealth(child);
    // Give seeds a moment after health
    await new Promise((r) => setTimeout(r, 1500));
    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const plans = store.siteContent?.curriculum?.lessonPlans || [];
    const ids = new Set(plans.map((p) => p.id));
    for (const target of INFANT_TODDLER_PRO_BATCH_TARGETS) {
      assert.ok(ids.has(target.stableId), `Missing seeded plan ${target.stableId}`);
      const live = plans.find((p) => p.id === target.stableId);
      assert.equal(String(live.plan || ""), "Pro");
      assert.equal(String(live.status || ""), "published");
      console.log(`PASS  seeded ${target.title}`);
    }
    assert.match(output, /curriculum-infant-toddler-pro-batch-seed/);
    const series = store.siteContent?.curriculum?.series || [];
    const seriesIds = [
      "cur-series-infant-animals-care-pro",
      "cur-series-infant-sensory-movement-pro",
      "cur-series-toddler-stem-builders-pro",
      "cur-series-toddler-nature-explorers-pro",
      "cur-series-toddler-science-lab-pro",
      "cur-series-toddler-harvest-kitchen-pro",
    ];
    for (const id of seriesIds) {
      assert.ok(series.some((item) => item.id === id), `Missing monthly series ${id}`);
      console.log(`PASS  series ${id}`);
    }
    console.log(`\n✅ Seeded ${INFANT_TODDLER_PRO_BATCH_TARGETS.length} plans + ${seriesIds.length} monthly series.`);
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

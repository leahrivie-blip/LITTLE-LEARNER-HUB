#!/usr/bin/env node
/**
 * Teaching Kit production / live smoke.
 * Targets SITE_URL (default https://littlelearnershubbyleah.com).
 *
 * Modes:
 * - baseline (flags expected off): curriculum still works, kit API disabled
 * - enabled (after flag enable): Free/Trial/Pro kit + print authorize checks
 *
 * Usage:
 *   SITE_URL=https://littlelearnershubbyleah.com npm run test:teaching-kit-production-smoke
 *   TK_SMOKE_MODE=enabled TK_PRO_BEARER='Bearer test:...' ... (or real auth headers)
 *
 * This script never mutates production flags.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const MODE = String(process.env.TK_SMOKE_MODE || "baseline").toLowerCase(); // baseline | enabled
const OUT_DIR = process.env.TK_SMOKE_OUT || "/opt/cursor/artifacts/teaching-kit-production-smoke";
const PRO_AUTH = process.env.TK_PRO_AUTH || "";
const TRIAL_AUTH = process.env.TK_TRIAL_AUTH || "";
const FREE_AUTH = process.env.TK_FREE_AUTH || "";

let passed = 0;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  results.push({ ok: true, message });
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath.startsWith("http") ? urlPath : `${SITE_URL}${urlPath}`);
    const lib = url.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          Accept: "application/json",
          "User-Agent": "llh-teaching-kit-production-smoke/1.0",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, text, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(25000, () => {
      req.destroy(new Error(`timeout ${method} ${urlPath}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Teaching Kit production smoke → ${SITE_URL} (mode=${MODE})`);

  const health = await requestJson("GET", "/api/health");
  assert(health.status === 200 && health.json?.ok === true, "health ok");
  assert(health.json?.launchReady === true, "launchReady true");

  const ready = await requestJson("GET", "/api/launch-readiness");
  assert(ready.status === 200 && ready.json?.ready === true, "launch-readiness ready");
  assert(Array.isArray(ready.json?.blockers) && ready.json.blockers.length === 0, "no launch blockers");

  const site = await requestJson("GET", "/api/site-content");
  assert(site.status === 200 && site.json?.siteContent, "site-content loads");
  const publicFlags = site.json.siteContent?.featureFlags || {};
  assert(!("teachingKitEnrichmentEditor" in publicFlags), "public site-content omits enrichment editor flag");
  assert(!("teachingKitAuthoring" in publicFlags), "public site-content omits authoring flag");
  assert(
    typeof publicFlags.teachingKitViewer === "boolean"
      || publicFlags.teachingKitViewer === undefined,
    "public teachingKitViewer is boolean when present",
  );

  const plans = site.json.siteContent?.curriculumLibrary?.lessonPlans || [];
  assert(plans.length > 0, `lesson plans present (${plans.length})`);
  assert(!plans.some((plan) => plan && plan.companion), "library cards have no companion payloads");

  // Pick a published Pro-looking plan and a Free-looking plan if present
  const proPlan = plans.find((p) => /pro/i.test(String(p.plan || ""))) || plans[0];
  const freePlan = plans.find((p) => /free/i.test(String(p.plan || ""))) || plans[0];
  assert(proPlan?.id, "has a plan id for kit probe");

  const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(proPlan.id)}`);
  assert(detail.status === 200 || detail.status === 401 || detail.status === 403 || detail.status === 404,
    `lesson detail responds (${detail.status})`);

  const kitGuest = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(proPlan.id)}/teaching-kit`);
  if (MODE === "baseline") {
    // Pre-deploy production has no Teaching Kit route yet (generic not-found).
    // Post-deploy with flags off returns teaching_kit_disabled.
    const baselineDisabled = kitGuest.status === 404 && (
      kitGuest.json?.code === "teaching_kit_disabled"
      || /not found|teaching_kit_disabled/i.test(String(kitGuest.json?.error || kitGuest.json?.code || kitGuest.text || ""))
    );
    assert(baselineDisabled, `baseline: teaching kit unavailable/disabled (got ${kitGuest.status} ${JSON.stringify(kitGuest.json || {}).slice(0, 160)})`);
  } else {
    assert(kitGuest.status === 200, "enabled: guest kit responds");
    assert(kitGuest.json?.teachingKit?.locked === true || kitGuest.json?.teachingKit?.ok === true,
      "enabled: guest kit payload present");
    if (kitGuest.json?.teachingKit?.locked) {
      assert(kitGuest.json.teachingKit.companion == null, "enabled: locked guest has no companion");
    }
  }

  // Current shell assets must remain healthy. Teaching Kit versioned assets are
  // required only after deploy (enabled mode, or when index already ships them).
  const home = await requestJson("GET", "/");
  assert(home.status === 200 && /Little Learner Hub/i.test(home.text || ""), "homepage HTML serves");
  const liveAppVer = String(home.text || "").match(/app\.js\?v=([^"]+)/)?.[1] || "";
  assert(liveAppVer, "homepage references app.js cache bust");
  const appAsset = await requestJson("GET", `/app.js?v=${encodeURIComponent(liveAppVer)}`);
  assert(appAsset.status === 200, `live app.js asset ok (${liveAppVer})`);

  const expectsTeachingKitAssets = MODE === "enabled" || /teaching-kit/i.test(liveAppVer) || /teaching-kit/i.test(home.text || "");
  if (expectsTeachingKitAssets) {
    for (const asset of [
      "/scripts/teaching-kit.js?v=20260803-teaching-kit-qa",
      "/scripts/teaching-kit-viewer.js?v=20260803-teaching-kit-qa",
      "/scripts/teaching-kit-print.js?v=20260803-teaching-kit-qa",
      "/scripts/teaching-kit-mapper.js?v=20260803-teaching-kit-qa",
      "/app.js?v=20260803-teaching-kit-qa",
      "/styles.css?v=20260803-teaching-kit-qa",
    ]) {
      const res = await requestJson("GET", asset);
      assert(res.status === 200, `asset ${asset} → ${res.status}`);
    }
  } else {
    results.push({ ok: true, message: `pre-deploy: skipped Teaching Kit assets (live ver ${liveAppVer})` });
  }

  if (MODE === "enabled") {
    if (!PRO_AUTH && !TRIAL_AUTH && !FREE_AUTH) {
      results.push({
        ok: false,
        message: "enabled mode needs TK_PRO_AUTH / TK_TRIAL_AUTH / TK_FREE_AUTH headers for full access matrix",
      });
      throw new Error("enabled mode requires auth headers (TK_PRO_AUTH, TK_TRIAL_AUTH, TK_FREE_AUTH)");
    }

    if (PRO_AUTH) {
      const proKit = await requestJson(
        "GET",
        `/api/curriculum/lesson-plans/${encodeURIComponent(proPlan.id)}/teaching-kit?day=monday`,
        null,
        { Authorization: PRO_AUTH },
      );
      assert(proKit.status === 200 && proKit.json?.teachingKit?.locked === false, "Pro kit unlocked");
      assert(proKit.json?.featureFlags?.teachingKitViewer === true, "viewer flag on for Pro");
      assert(proKit.json?.featureFlags?.teachingKitPrintCenter === true, "print flag on for Pro");
      assert(proKit.json?.featureFlags?.teachingKitAttachments !== true, "attachments flag remains off");

      const t0 = Date.now();
      const proKit2 = await requestJson(
        "GET",
        `/api/curriculum/lesson-plans/${encodeURIComponent(proPlan.id)}/teaching-kit`,
        null,
        { Authorization: PRO_AUTH },
      );
      assert(proKit2.status === 200, "Pro kit repeat fetch ok");
      assert(Date.now() - t0 < 4000, `Pro kit fetch under 4s (was ${Date.now() - t0}ms)`);

      const proAuthz = await requestJson(
        "POST",
        "/api/trial-curriculum-exports/authorize",
        {
          idempotencyKey: `prod-smoke-pro-${Date.now()}`,
          resourceType: "lesson-plan",
          resourceId: proPlan.id,
          action: "print",
        },
        { Authorization: PRO_AUTH },
      );
      assert(proAuthz.status === 200 && proAuthz.json?.allowed === true, "Pro print authorize allowed");
      assert(!proAuthz.json?.watermark, "Pro print has no trial watermark");
    }

    if (TRIAL_AUTH) {
      const trialKit = await requestJson(
        "GET",
        `/api/curriculum/lesson-plans/${encodeURIComponent(proPlan.id)}/teaching-kit`,
        null,
        { Authorization: TRIAL_AUTH },
      );
      assert(trialKit.status === 200 && trialKit.json?.teachingKit?.locked === false, "Trial kit unlocked");
      const trialAuthz = await requestJson(
        "POST",
        "/api/trial-curriculum-exports/authorize",
        {
          idempotencyKey: `prod-smoke-trial-${Date.now()}`,
          resourceType: "lesson-plan",
          resourceId: proPlan.id,
          action: "print",
        },
        { Authorization: TRIAL_AUTH },
      );
      assert(trialAuthz.status === 200 && trialAuthz.json?.allowed === true, "Trial print authorize allowed");
      assert(/Trial Preview/i.test(String(trialAuthz.json?.watermark || "")), "Trial watermark present");
      assert(trialAuthz.json?.counted === true, "Trial print counted against allowance");
    }

    if (FREE_AUTH) {
      const freeOnPro = await requestJson(
        "GET",
        `/api/curriculum/lesson-plans/${encodeURIComponent(proPlan.id)}/teaching-kit`,
        null,
        { Authorization: FREE_AUTH },
      );
      assert(freeOnPro.status === 200 && freeOnPro.json?.teachingKit?.locked === true,
        "Free user locked on Pro kit");
      if (freePlan?.id) {
        const freeOnFree = await requestJson(
          "GET",
          `/api/curriculum/lesson-plans/${encodeURIComponent(freePlan.id)}/teaching-kit`,
          null,
          { Authorization: FREE_AUTH },
        );
        // Curated starters unlock; non-starters may stay locked — accept either locked=false with free_unlocked or locked=true
        assert(freeOnFree.status === 200, "Free user kit endpoint responds for Free plan");
      }
    }
  }

  const summary = {
    ok: true,
    mode: MODE,
    siteUrl: SITE_URL,
    assertions: passed,
    results,
    sampledPlanIds: { proPlanId: proPlan.id, freePlanId: freePlan?.id || null },
    completedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT_DIR, `smoke-${MODE}.json`), JSON.stringify(summary, null, 2));
  console.log(`OK teaching-kit-production-smoke (${passed} assertions, mode=${MODE})`);
}

main().catch((error) => {
  const summary = {
    ok: false,
    mode: MODE,
    siteUrl: SITE_URL,
    assertions: passed,
    results,
    error: error.message || String(error),
    completedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `smoke-${MODE}.json`), JSON.stringify(summary, null, 2));
  } catch {
    // ignore
  }
  console.error("FAIL teaching-kit-production-smoke:", error.message || error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Trial curriculum export allowance + Free Starter Library (exactly 10).
 * Run: node scripts/test-trial-protection-free-starter.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19820 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-trial-free-${crypto.randomBytes(4).toString("hex")}.json`);
const freeSample = require("./free-curriculum-sample.js");
const trialExports = require("./trial-curriculum-exports.js");
const membershipAccess = require("./membership-access.js");

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

function seedStore() {
  const infant = [];
  const toddler = [];
  const preschool = [];
  for (let i = 1; i <= 6; i += 1) {
    infant.push({
      id: `cur-lp-infant-seed-${i}`,
      title: `Infant Seed ${i}`,
      age: "Infant",
      theme: "Bonding",
      plan: "Pro",
      status: "published",
      weeklyOverview: "Overview",
      dailyPlans: { Monday: { items: [{ title: "Play" }] } },
    });
    toddler.push({
      id: `cur-lp-toddler-seed-${i}`,
      title: `Toddler Seed ${i}`,
      age: "Toddler",
      theme: "Discovery",
      plan: "Pro",
      status: "published",
      weeklyOverview: "Overview",
      dailyPlans: { Monday: { items: [{ title: "Play" }] } },
    });
    preschool.push({
      id: `cur-lp-preschool-seed-${i}`,
      title: `Preschool Seed ${i}`,
      age: "Preschool",
      theme: "Community",
      plan: "Pro",
      status: "published",
      weeklyOverview: "Overview",
      dailyPlans: { Monday: { items: [{ title: "Play" }] } },
    });
  }
  // Map default Free starter IDs onto published plans with correct ages.
  const defaults = freeSample.DEFAULT_FREE_STARTER_LESSON_IDS;
  const freePlans = defaults.map((id, idx) => {
    const age = idx < 3 ? "Infant" : idx < 6 ? "Toddler" : "Preschool";
    return {
      id,
      title: `Free Starter ${age} ${idx + 1}`,
      age,
      theme: "Evergreen",
      plan: "Free",
      status: "published",
      weeklyOverview: "Free starter overview with full content.",
      objectives: ["Explore"],
      dailyPlans: {
        Monday: { theme: "Day 1", items: [{ title: "Starter activity", activityCategory: "Sensory" }] },
      },
    };
  });
  const lockedPro = {
    id: "cur-lp-preschool-letters-and-sounds",
    title: "Letters & Sounds",
    age: "Preschool",
    theme: "Literacy",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Premium overview teaser only for Free.",
    objectives: ["SECRET_OBJECTIVE_SHOULD_LOCK"],
    dailyPlans: {
      Monday: { items: [{ title: "SECRET_ACTIVITY_SHOULD_LOCK" }] },
    },
  };
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const trialStart = now.toISOString();
  return {
    users: {
      "free.user@test.local": {
        email: "free.user@test.local",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        createdAt: "2026-07-20T00:00:00.000Z",
        freeLessonAccessMode: "curated",
      },
      "trial.user@test.local": {
        email: "trial.user@test.local",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Trialing",
        stripeSubscriptionStatus: "trialing",
        trialStatus: "In Trial",
        trialStart,
        trialEnd,
        accessEndsAt: trialEnd,
        stripeCustomerId: "cus_trial_test_123456",
        introductoryTrialConsumed: true,
      },
      "trial.fresh@test.local": {
        email: "trial.fresh@test.local",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Trialing",
        stripeSubscriptionStatus: "trialing",
        trialStatus: "In Trial",
        trialStart,
        trialEnd,
        accessEndsAt: trialEnd,
        stripeCustomerId: "cus_trial_fresh_999999",
        introductoryTrialConsumed: true,
      },
      "trial.burst@test.local": {
        email: "trial.burst@test.local",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Trialing",
        stripeSubscriptionStatus: "trialing",
        trialStatus: "In Trial",
        trialStart,
        trialEnd,
        accessEndsAt: trialEnd,
        stripeCustomerId: "cus_trial_burst_555555",
        introductoryTrialConsumed: true,
      },
      "trial.wmfail@test.local": {
        email: "trial.wmfail@test.local",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Trialing",
        stripeSubscriptionStatus: "trialing",
        trialStatus: "In Trial",
        trialStart,
        trialEnd,
        accessEndsAt: trialEnd,
        stripeCustomerId: "cus_trial_wmfail_777777",
        introductoryTrialConsumed: true,
      },
      "free.legacy.labeled@test.local": {
        email: "free.legacy.labeled@test.local",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        createdAt: "2020-01-01T00:00:00.000Z",
        freeLessonAccessMode: "legacy",
      },
      "pro.user@test.local": {
        email: "pro.user@test.local",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
        monthlyPrice: "$19.99/month",
      },
      "founding.user@test.local": {
        email: "founding.user@test.local",
        plan: "Founding",
        foundingMemberActive: true,
        subscriptionStatus: "Founding Member Subscription Active",
        stripeSubscriptionStatus: "active",
        monthlyPrice: "$9.99/month",
        priceLock: "Lifetime",
      },
    },
    siteContent: {
      curriculum: {
        lessonPlans: [...freePlans, lockedPro, ...infant, ...toddler, ...preschool],
        activities: [
          {
            id: "cur-act-pro-1",
            lessonPlanId: lockedPro.id,
            title: "Premium Activity",
            status: "published",
            activityCategory: "Literacy",
            description: "SECRET_ACTIVITY_BODY",
            steps: ["Do the secret thing"],
          },
        ],
        resources: [],
        updatedAt: now.toISOString(),
      },
      freePlanAccess: {
        enabled: true,
        curatedCutoffAt: "2026-07-18T00:00:00.000Z",
      },
    },
    foundingMembers: [],
    adminSessions: {},
  };
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(seedStore(), null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "admin-pass",
      ADMIN_ACCESS_CODE: "admin-code",
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server failed to boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function authHeaders(email) {
  return {
    Authorization: `Bearer test:${email}`,
    "x-llh-user-email": email,
  };
}

async function main() {
  // Unit: Free starter list
  assert.equal(freeSample.DEFAULT_FREE_STARTER_LESSON_IDS.length, 10);
  assert.equal(freeSample.REQUIRED_COUNT, 10);
  assert.deepEqual(freeSample.REQUIRED_DISTRIBUTION, { Infant: 3, Toddler: 3, Preschool: 4 });
  assert.equal(freeSample.activeSeasonalIds().length, 0);
  assert.match(freeSample.MARKETING.freeCore, /10 complete starter lesson plans/);

  // Unit: trial export authorize / idempotency / release
  let state = trialExports.emptyState();
  const mark = "Little Learner Hub Trial Preview • Account LLH-TEST-01";
  const a1 = trialExports.authorizeExport(state, {
    idempotencyKey: "k1", resourceType: "lesson-plan", resourceId: "p1", watermark: mark,
  });
  assert.equal(a1.allowed, true);
  assert.equal(a1.used, 1);
  assert.equal(a1.watermark, mark);
  state = a1.state;
  const a1b = trialExports.authorizeExport(state, {
    idempotencyKey: "k1", resourceType: "lesson-plan", resourceId: "p1", watermark: mark,
  });
  assert.equal(a1b.reused, true);
  assert.equal(a1b.used, 1);
  state = a1b.state;
  state = trialExports.authorizeExport(state, { idempotencyKey: "k2", resourceId: "p2", watermark: mark }).state;
  state = trialExports.authorizeExport(state, { idempotencyKey: "k3", resourceId: "p3", watermark: mark }).state;
  const a4 = trialExports.authorizeExport(state, { idempotencyKey: "k4", resourceId: "p4", watermark: mark });
  assert.equal(a4.allowed, false);
  assert.equal(a4.remaining, 0);
  // Client-claimed release must fail closed.
  const clientRelease = trialExports.releaseExport(a1.state, { idempotencyKey: "k1" });
  assert.equal(clientRelease.ok, false);
  assert.equal(clientRelease.status, 403);
  const released = trialExports.releaseExport(a1.state, { idempotencyKey: "k1", serverVerifiedFailure: true });
  assert.equal(released.released, true);
  assert.equal(released.used, 0);
  assert.equal(trialExports.assertWatermarkPresent(`hello ${mark}`, mark).ok, true);
  assert.equal(trialExports.assertWatermarkPresent("hello", mark).ok, false);
  // No legacy Free bypass
  assert.equal(require("./free-plan-grandfathering.js").hasLegacyFreeLessonAccess({
    plan: "Free", createdAt: "2020-01-01T00:00:00.000Z", freeLessonAccessMode: "legacy",
  }), false);

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(appJs, /MEMBERSHIP_COPY/);
  assert.match(appJs, /confirmTrialCurriculumExport/);
  assert.match(appJs, /trial-curriculum-watermark/);
  assert.match(appJs, /Your Included Free Plans|Your 10 Free Starter Plans/);
  assert.match(indexHtml, /10 complete starter lesson plans across Infant, Toddler and Preschool/);
  assert.match(indexHtml, /trial-curriculum-exports\.js/);
  assert.doesNotMatch(indexHtml, /Selected free lesson plans across age groups/);

  const child = startServer();
  try {
    await waitForBoot(child);

    // Free can open starter plan fully
    const freeId = freeSample.DEFAULT_FREE_STARTER_LESSON_IDS[0];
    const freeDetail = await request("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(freeId)}`, null, authHeaders("free.user@test.local"));
    assert.equal(freeDetail.status, 200, freeDetail.text);
    assert.equal(freeDetail.json.lessonPlan.locked, false);
    assert.ok(freeDetail.json.lessonPlan.dailyPlans);

    // Non-starter plans stay content-locked for Free (browse/preview OK; full body withheld)
    const locked = await request("GET", "/api/curriculum/lesson-plans/cur-lp-preschool-letters-and-sounds", null, authHeaders("free.user@test.local"));
    assert.ok([200, 403].includes(locked.status), `unexpected status ${locked.status}`);
    if (locked.status === 200) {
      assert.equal(locked.json.lessonPlan.locked, true);
      assert.equal(locked.json.lessonPlan.dailyPlans, undefined);
      assert.equal(locked.json.lessonPlan.objectives, undefined);
      assert.doesNotMatch(JSON.stringify(locked.json), /SECRET_OBJECTIVE_SHOULD_LOCK|SECRET_ACTIVITY_SHOULD_LOCK/);
    }

    // Trial can open Pro plan (browse)
    const trialBrowse = await request("GET", "/api/curriculum/lesson-plans/cur-lp-preschool-letters-and-sounds", null, authHeaders("trial.user@test.local"));
    assert.equal(trialBrowse.status, 200);
    assert.equal(trialBrowse.json.lessonPlan.locked, false);

    // Trial exports: 3 succeed, 4th blocked; idempotent retry
    const headers = authHeaders("trial.user@test.local");
    const e1 = await request("POST", "/api/trial-curriculum-exports/authorize", {
      idempotencyKey: "exp-1", resourceType: "lesson-plan", resourceId: "cur-lp-preschool-letters-and-sounds", action: "print",
    }, headers);
    assert.equal(e1.status, 200);
    assert.equal(e1.json.allowed, true);
    assert.equal(e1.json.used, 1);
    const e1r = await request("POST", "/api/trial-curriculum-exports/authorize", {
      idempotencyKey: "exp-1", resourceType: "lesson-plan", resourceId: "cur-lp-preschool-letters-and-sounds", action: "print",
    }, headers);
    assert.equal(e1r.json.reused, true);
    assert.equal(e1r.json.used, 1);

    await request("POST", "/api/trial-curriculum-exports/authorize", { idempotencyKey: "exp-2", resourceId: "p2", action: "download" }, headers);
    await request("POST", "/api/trial-curriculum-exports/authorize", { idempotencyKey: "exp-3", resourceId: "p3", action: "download" }, headers);
    const e4 = await request("POST", "/api/trial-curriculum-exports/authorize", { idempotencyKey: "exp-4", resourceId: "p4", action: "print" }, headers);
    assert.equal(e4.json.allowed, false);
    assert.match(e4.json.message || "", /all 3 premium curriculum prints/i);

    // Free curriculum does not consume
    const freeExport = await request("POST", "/api/trial-curriculum-exports/authorize", {
      idempotencyKey: "exp-free",
      resourceType: "lesson-plan",
      resourceId: freeId,
      action: "print",
      isFreeCurriculum: true,
    }, headers);
    assert.equal(freeExport.json.allowed, true);
    assert.equal(freeExport.json.counted, false);

    // Provider-owned does not consume
    const owned = await request("POST", "/api/trial-curriculum-exports/authorize", {
      idempotencyKey: "exp-owned",
      resourceId: "user-copy-1",
      isProviderOwned: true,
    }, headers);
    assert.equal(owned.json.allowed, true);
    assert.equal(owned.json.counted, false);

    // Client cannot fraudulently release allowance
    const fraudRelease = await request("POST", "/api/trial-curriculum-exports/release", {
      idempotencyKey: "exp-1",
    }, headers);
    assert.equal(fraudRelease.status, 403);
    assert.equal(fraudRelease.json.released, false);

    // Concurrent fourth export blocked (5 simultaneous after 3 used)
    const concurrent = await Promise.all(
      Array.from({ length: 5 }, (_, i) => request("POST", "/api/trial-curriculum-exports/authorize", {
        idempotencyKey: `concurrent-${i}`,
        resourceId: `concurrent-${i}`,
        action: "print",
      }, headers)),
    );
    const allowedConcurrent = concurrent.filter((r) => r.json?.allowed === true).length;
    assert.equal(allowedConcurrent, 0, "after 3 used, five simultaneous requests must not grant more exports");

    // Five simultaneous requests from a fresh trial cannot exceed 3 exports
    const burstHeaders = authHeaders("trial.burst@test.local");
    const burst = await Promise.all(
      Array.from({ length: 5 }, (_, i) => request("POST", "/api/trial-curriculum-exports/authorize", {
        idempotencyKey: `burst-${i}`,
        resourceId: `burst-plan-${i}`,
        action: "print",
      }, burstHeaders)),
    );
    const burstAllowed = burst.filter((r) => r.json?.allowed === true).length;
    assert.equal(burstAllowed, 3, "five simultaneous requests cannot exceed 3 exports");
    const burstStatus = await request("GET", "/api/trial-curriculum-exports", null, burstHeaders);
    assert.equal(burstStatus.json.used, 3);
    assert.equal(burstStatus.json.remaining, 0);

    // Server restart preserves allowance (re-read status)
    const statusAfter = await request("GET", "/api/trial-curriculum-exports", null, headers);
    assert.equal(statusAfter.json.used, 3);
    assert.equal(statusAfter.json.remaining, 0);

    // Cross-device: same account headers still see same used count
    const statusDeviceB = await request("GET", "/api/trial-curriculum-exports", null, {
      ...headers,
      "User-Agent": "OtherDevice/1.0",
    });
    assert.equal(statusDeviceB.json.used, 3);

    // Exhausted trial generate must block
    const genBlocked = await request("POST", "/api/trial-curriculum-exports/generate-pdf", {
      resourceId: "cur-lp-preschool-letters-and-sounds",
      idempotencyKey: "gen-watermark-blocked",
    }, authHeaders("trial.user@test.local"));
    assert.ok(genBlocked.status === 403 || genBlocked.json?.allowed === false);

    // Fresh trial: watermarked PDF bytes must contain Trial watermark
    const genOk = await request("POST", "/api/trial-curriculum-exports/generate-pdf", {
      resourceId: "cur-lp-preschool-letters-and-sounds",
      idempotencyKey: "gen-watermark-ok",
    }, authHeaders("trial.fresh@test.local"));
    assert.equal(genOk.status, 200, genOk.text?.slice?.(0, 200) || genOk.text);
    assert.match(genOk.text, /Trial Preview/);
    assert.ok(e1.json.watermark && /Trial Preview/.test(e1.json.watermark));

    // Watermark-generation failure blocks export (fail closed) and restores allowance server-side only
    const wmFailHeaders = authHeaders("trial.wmfail@test.local");
    const genFail = await request("POST", "/api/trial-curriculum-exports/generate-pdf", {
      resourceId: "cur-lp-preschool-letters-and-sounds",
      idempotencyKey: "gen-watermark-fail",
      forceWatermarkFailure: true,
    }, wmFailHeaders);
    assert.equal(genFail.status, 500, genFail.text?.slice?.(0, 300) || genFail.text);
    assert.match(genFail.json?.message || genFail.text || "", /try again/i);
    assert.equal(genFail.json?.allowanceRestored, true);
    const afterFail = await request("GET", "/api/trial-curriculum-exports", null, wmFailHeaders);
    assert.equal(afterFail.json.used, 0, "verified server-side generation failure restores allowance");

    // Existing Free unlocks exactly the 10 starters (no legacy bypass extras)
    const freeLib = await request("GET", "/api/site-content", null, authHeaders("free.user@test.local"));
    const freePlans = freeLib.json?.siteContent?.curriculumLibrary?.lessonPlans || [];
    const freeUnlocked = freePlans.filter((p) => p && p.locked !== true);
    assert.equal(freeUnlocked.length, 10, `existing Free must unlock exactly 10 plans (got ${freeUnlocked.length})`);
    const legacyLib = await request("GET", "/api/site-content", null, authHeaders("free.legacy.labeled@test.local"));
    const legacyUnlocked = (legacyLib.json?.siteContent?.curriculumLibrary?.lessonPlans || [])
      .filter((p) => p && p.locked !== true);
    assert.equal(legacyUnlocked.length, 10, "legacy-labeled Free must also unlock exactly 10 (no bypass)");

    // Free starter generate has no trial watermark requirement
    const freeGen = await request("POST", "/api/trial-curriculum-exports/generate-pdf", {
      resourceId: freeId,
      idempotencyKey: "gen-free",
    }, authHeaders("free.user@test.local"));
    assert.equal(freeGen.status, 200);
    assert.doesNotMatch(freeGen.text, /Trial Preview/);

    // Pro unlimited / unwatermarked authorize
    const proAuth = await request("POST", "/api/trial-curriculum-exports/authorize", {
      idempotencyKey: "pro-1", resourceId: "any",
    }, authHeaders("pro.user@test.local"));
    assert.equal(proAuth.json.unlimited, true);
    assert.equal(proAuth.json.allowed, true);
    assert.equal(proAuth.json.watermark, "");

    const foundingAuth = await request("POST", "/api/trial-curriculum-exports/authorize", {
      idempotencyKey: "founding-1", resourceId: "any",
    }, authHeaders("founding.user@test.local"));
    assert.equal(foundingAuth.json.unlimited, true);
    assert.equal(foundingAuth.json.watermark, "");

    // Existing Free with legacy mode label still only unlocks curated starters (no bypass)
    const legacyStarter = await request("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(freeId)}`, null, authHeaders("free.legacy.labeled@test.local"));
    assert.equal(legacyStarter.status, 200);
    assert.equal(legacyStarter.json.lessonPlan.locked, false);
    const legacyPremium = await request("GET", "/api/curriculum/lesson-plans/cur-lp-preschool-letters-and-sounds", null, authHeaders("free.legacy.labeled@test.local"));
    assert.ok(legacyPremium.status === 200 || legacyPremium.status === 403);
    if (legacyPremium.status === 200) {
      assert.equal(legacyPremium.json.lessonPlan.locked, true);
      assert.equal(legacyPremium.json.lessonPlan.dailyPlans, undefined);
    }
    // Distribution 3/3/4
    const ages = freeSample.DEFAULT_FREE_STARTER_LESSON_IDS.map((id, idx) => (
      idx < 3 ? "Infant" : idx < 6 ? "Toddler" : "Preschool"
    ));
    assert.equal(ages.filter((a) => a === "Infant").length, 3);
    assert.equal(ages.filter((a) => a === "Toddler").length, 3);
    assert.equal(ages.filter((a) => a === "Preschool").length, 4);

    // Site content exposes free starter + membership copy
    const site = await request("GET", "/api/site-content");
    assert.equal(site.json.siteContent.freeStarterLibrary.count, 10);
    assert.equal(site.json.siteContent.freeStarterLibrary.lessonPlanIds.length, 10);
    assert.match(site.json.siteContent.membershipCopy.freeCore, /10 complete starter/);
    assert.match(site.json.siteContent.membershipCopy.trialCore, /up to 3 premium curriculum/);

    // Admin free starter get
    const login = await request("POST", "/api/admin/login", {
      email: "admin@test.local", password: "admin-pass", code: "admin-code",
    });
    assert.equal(login.status, 200);
    const adminToken = login.json.token;
    const starter = await request("GET", `/api/admin/free-starter-library?adminToken=${encodeURIComponent(adminToken)}`);
    assert.equal(starter.status, 200);
    assert.equal(starter.json.freeStarterLibrary.lessonPlanIds.length, 10);

    // Refuse invalid save (wrong distribution)
    const badSave = await request("POST", "/api/admin/free-starter-library", {
      adminToken,
      lessonPlanIds: freeSample.DEFAULT_FREE_STARTER_LESSON_IDS.slice(0, 9),
      confirm: true,
    });
    assert.equal(badSave.status, 400);

    // Trial usage admin
    const usage = await request("GET", `/api/admin/trial-usage?adminToken=${encodeURIComponent(adminToken)}`);
    assert.equal(usage.status, 200);
    assert.ok(Array.isArray(usage.json.users));
    assert.ok(usage.json.users.some((u) => u.used >= 3));

    // Membership helpers still classify roles
    const storeUsers = seedStore().users;
    assert.equal(membershipAccess.membershipPlanDisplay(storeUsers["free.user@test.local"]), "Free");
    assert.equal(membershipAccess.membershipUserInTrial(storeUsers["trial.user@test.local"]), true);
    assert.equal(membershipAccess.membershipFoundingActive(storeUsers["founding.user@test.local"]), true);
    assert.equal(membershipAccess.membershipHasProAccess(storeUsers["pro.user@test.local"]), true);

    console.log("test-trial-protection-free-starter: PASS");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("test-trial-protection-free-starter: FAIL", error);
  process.exit(1);
});

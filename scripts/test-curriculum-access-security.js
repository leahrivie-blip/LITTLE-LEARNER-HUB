#!/usr/bin/env node
/**
 * Phase D security regression: server-side premium curriculum access protection.
 * Run: npm run test:curriculum-access-security
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");
const PORT = 4580 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-curriculum-security-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "curriculum-security-test@example.com",
  password: "curriculum-security-test-pass",
  code: "curriculum-security-test-code",
};

const PROTECTED_STRINGS = [
  "Invite children to scoop and feel the soil.",
  "I notice the soil feels damp",
];

const PREVIEW_SAFE_STRINGS = [
  "Planting a Rainbow",
  "pasteurized soil",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { ...(options.headers || {}) };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers,
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

function authHeader(email) {
  return { Authorization: `Bearer test:${email}` };
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
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

async function waitForHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
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

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function seedMembershipUsers() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const store = readStore();
  store.users = store.users || {};
  store.users["free@security.test"] = { email: "free@security.test", plan: "Free", subscriptionStatus: "Free Plan", updatedAt: now };
  store.users["trial@security.test"] = {
    email: "trial@security.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription trialing",
    trialStatus: "In Trial", trialStart: now, trialEnd: future, stripeSubscriptionStatus: "trialing",
    subscriptionStartedAt: now, updatedAt: now,
  };
  store.users["pro-monthly@security.test"] = {
    email: "pro-monthly@security.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active", currentPeriodEnd: future, accessEndsAt: future,
    subscriptionStartedAt: now, subscriptionCadence: "monthly", updatedAt: now,
  };
  store.users["pro-annual@security.test"] = {
    email: "pro-annual@security.test", plan: "Pro", subscriptionStatus: "Pro Annual Subscription Active",
    stripeSubscriptionStatus: "active", currentPeriodEnd: future, accessEndsAt: future,
    subscriptionStartedAt: now, subscriptionCadence: "annual", updatedAt: now,
  };
  store.users["founding@security.test"] = {
    email: "founding@security.test", plan: "Founding", subscriptionStatus: "Founding Member Subscription Active",
    foundingMemberActive: true, foundingMemberHistorical: true, stripeSubscriptionStatus: "active",
    currentPeriodEnd: future, accessEndsAt: future, subscriptionStartedAt: now, updatedAt: now,
  };
  store.users["admin-access@security.test"] = {
    email: "admin-access@security.test", plan: "Free", subscriptionStatus: "Free Plan",
    internalAccessOverride: true, updatedAt: now,
  };
  writeStore(store);
}

function assertNoProtectedStrings(payload, label) {
  const text = JSON.stringify(payload);
  PROTECTED_STRINGS.forEach((needle) => {
    assert(!text.includes(needle), `${label} leaked protected content: ${needle}`);
  });
  assert(!/"importKey"\s*:/.test(text), `${label} leaked importKey`);
  assert(!/"sourceKey"\s*:/.test(text), `${label} leaked sourceKey`);
  assert(!/"itemId"\s*:/.test(text), `${label} leaked itemId`);
}

function assertHasProtectedStrings(payload, label) {
  const text = JSON.stringify(payload);
  assert(text.includes("Invite children to scoop and feel the soil."), `${label} missing protected directions`);
  assert(text.includes("I notice the soil feels damp"), `${label} missing protected teacher language`);
}

async function publishPlans(token) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  let expectedUpdatedAt = touch.json.siteContent.updatedAt;
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(parsed.ok, parsed.errors.join(" "));
  parsed.data.dailyPlans.monday.books = [{ title: "Planting a Rainbow", author: "Lois Ehlert" }];
  parsed.data.dailyPlans.tuesday.songs = [{ title: "Rain Song", notes: "Weather transition" }];
  if (parsed.data.dailyPlans.monday.items?.[0]) {
    parsed.data.dailyPlans.monday.items[0].teacherLanguage = "I notice the soil feels damp";
  }
  const base = parsed.data;

  const freeId = `cur-lp-sec-free-${crypto.randomBytes(3).toString("hex")}`;
  const proId = `cur-lp-sec-pro-${crypto.randomBytes(3).toString("hex")}`;
  const draftId = `cur-lp-sec-draft-${crypto.randomBytes(3).toString("hex")}`;
  const archivedId = `cur-lp-sec-arch-${crypto.randomBytes(3).toString("hex")}`;

  const freeSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: { ...base, id: freeId, title: "Security Free Garden", plan: "Free", status: "published" },
  });
  assert(freeSave.status === 200, `free save failed: ${freeSave.status}`);
  expectedUpdatedAt = freeSave.json.siteContentUpdatedAt;

  const proSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: { ...base, id: proId, title: "Security Pro Garden", plan: "Pro", status: "published" },
  });
  assert(proSave.status === 200, `pro save failed: ${proSave.status}`);
  expectedUpdatedAt = proSave.json.siteContentUpdatedAt;

  await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: { ...base, id: draftId, title: "Security Draft Garden", plan: "Free", status: "draft" },
  });

  const archiveSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: { ...base, id: archivedId, title: "Security Archived Garden", plan: "Free", status: "archived" },
  });
  expectedUpdatedAt = archiveSave.json.siteContentUpdatedAt;

  const store = readStore();
  const proActivities = (store.siteContent?.curriculum?.activities || []).filter((item) => item.lessonPlanId === proId);
  const freeActivities = (store.siteContent?.curriculum?.activities || []).filter((item) => item.lessonPlanId === freeId);
  assert(proActivities.length > 0, "pro lesson synced activities");
  assert(freeActivities.length > 0, "free lesson synced activities");

  return {
    freeId,
    proId,
    draftId,
    archivedId,
    proActivityId: proActivities[0].id,
    freeActivityId: freeActivities[0].id,
  };
}

async function main() {
  const child = startServer();
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = login.json.token;
    const ids = await publishPlans(token);
    // Re-seed after admin writes so membership users survive storeCache bootstrap.
    seedMembershipUsers();

    console.log("1) Logged-out public site-content cannot retrieve full Pro lesson content");
    const publicLoggedOut = await requestJson("GET", "/api/site-content");
    const proPublic = (publicLoggedOut.json.siteContent?.curriculumLibrary?.lessonPlans || []).find((item) => item.id === ids.proId);
    const freePublic = (publicLoggedOut.json.siteContent?.curriculumLibrary?.lessonPlans || []).find((item) => item.id === ids.freeId);
    assert(proPublic, "pro lesson listed publicly as preview");
    assert(proPublic.locked === true, "pro lesson marked locked");
    assert(!proPublic.dailyPlans, "pro public plan has no dailyPlans");
    assert(!proPublic.dailyActivityPreview, "pro preview must not include activity titles by day");
    assert(!proPublic.weeklyMaterials, "pro preview must not include materials");
    assert(!proPublic.objectives, "pro preview must not include objectives");
    assert(!(proPublic.books || []).length, "pro preview must not include books");
    assert(!(proPublic.songs || []).length, "pro preview must not include songs");
    assert(proPublic.weeklyOverview, "pro preview should include weekly overview");
    assert(proPublic.theme, "pro preview should include theme");
    assertNoProtectedStrings(proPublic, "logged-out pro lesson public DTO");
    assert(freePublic?.dailyPlans?.monday?.books?.[0]?.title === "Planting a Rainbow", "free lesson still has full public content");

    console.log("2) Free-user request for Pro lesson cannot retrieve full content");
    const freeUserPublic = await requestJson("GET", "/api/site-content", null, { headers: authHeader("free@security.test") });
    const proForFree = (freeUserPublic.json.siteContent?.curriculumLibrary?.lessonPlans || []).find((item) => item.id === ids.proId);
    assertNoProtectedStrings(proForFree, "free-user public pro lesson");
    const freeUserDetail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.proId)}`, null, {
      headers: authHeader("free@security.test"),
    });
    assert(freeUserDetail.status === 403, `free user detail expected 403, got ${freeUserDetail.status}`);
    assertNoProtectedStrings(freeUserDetail.json, "free-user pro detail");

    console.log("3) Authorized personas can retrieve full Pro lesson content");
    const authorizedEmails = [
      "trial@security.test",
      "pro-monthly@security.test",
      "pro-annual@security.test",
      "founding@security.test",
      "admin-access@security.test",
    ];
    for (const email of authorizedEmails) {
      const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.proId)}`, null, {
        headers: authHeader(email),
      });
      assert(detail.status === 200, `${email} detail expected 200, got ${detail.status}`);
      assertHasProtectedStrings(detail.json.lessonPlan, `${email} pro detail`);
      assert(!JSON.stringify(detail.json.lessonPlan).includes('"importKey"'), `${email} detail leaked importKey`);
      assert(!JSON.stringify(detail.json.lessonPlan).includes('"sourceKey"'), `${email} detail leaked sourceKey`);
    }

    console.log("4) Admin token can retrieve full Pro lesson content");
    const adminDetail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.proId)}?adminToken=${encodeURIComponent(token)}`);
    assert(adminDetail.status === 200, `admin detail expected 200, got ${adminDetail.status}`);
    assertHasProtectedStrings(adminDetail.json.lessonPlan, "admin pro detail");

    console.log("5) Draft and archived lessons remain unavailable publicly");
    const plans = publicLoggedOut.json.siteContent?.curriculumLibrary?.lessonPlans || [];
    assert(!plans.some((item) => item.id === ids.draftId), "draft hidden");
    assert(!plans.some((item) => item.id === ids.archivedId), "archived hidden");
    const draftDetail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.draftId)}`, null, {
      headers: authHeader("pro-monthly@security.test"),
    });
    assert(draftDetail.status === 404, `draft detail expected 404, got ${draftDetail.status}`);

    console.log("6) Premium linked activity cannot be retrieved by Free or logged-out users");
    const proActivityPublic = (publicLoggedOut.json.siteContent?.curriculumLibrary?.activities || []).find((item) => item.id === ids.proActivityId);
    assert(proActivityPublic?.locked === true, "pro activity public preview locked");
    assert(proActivityPublic?.lessonPlanId === ids.proId, "pro activity public preview must include lessonPlanId");
    assert(!proActivityPublic.description, "pro activity public preview must not expose description");
    assert(!proActivityPublic.objective, "pro activity public preview must not expose objective");
    assert(!proActivityPublic.materials, "pro activity public preview must not expose materials");
    assert(!proActivityPublic.steps, "pro activity public preview must not expose steps");
    assert(!proActivityPublic.teacherLanguage, "pro activity public preview must not expose teacher language");
    assert(!proActivityPublic.setup, "pro activity public preview must not expose setup");
    assert(proActivityPublic.activityCategory || proActivityPublic.title, "pro activity preview should keep overview metadata");
    assertNoProtectedStrings(proActivityPublic, "logged-out pro activity public DTO");
    const freeActivityDenied = await requestJson("GET", `/api/curriculum/activities/${encodeURIComponent(ids.proActivityId)}`, null, {
      headers: authHeader("free@security.test"),
    });
    assert(freeActivityDenied.status === 403, `free user activity expected 403, got ${freeActivityDenied.status}`);
    const anonActivityDenied = await requestJson("GET", `/api/curriculum/activities/${encodeURIComponent(ids.proActivityId)}`);
    assert(anonActivityDenied.status === 403, `logged-out activity expected 403, got ${anonActivityDenied.status}`);

    const proActivityAllowed = await requestJson("GET", `/api/curriculum/activities/${encodeURIComponent(ids.proActivityId)}`, null, {
      headers: authHeader("pro-monthly@security.test"),
    });
    assert(proActivityAllowed.status === 200, `pro user activity expected 200, got ${proActivityAllowed.status}`);
    assertHasProtectedStrings(proActivityAllowed.json.activity, "pro user activity detail");

    const freeActivityPublic = (publicLoggedOut.json.siteContent?.curriculumLibrary?.activities || []).find((item) => item.lessonPlanId === ids.freeId);
    assert(freeActivityPublic && freeActivityPublic.locked !== true, "free activity remains public");
    assert(String(freeActivityPublic.teacherLanguage || "").includes("damp"), "free activity keeps teacher language publicly");

    console.log("7) Client plan spoofing does not unlock server endpoint");
    const spoofed = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.proId)}`, null, {
      headers: { Authorization: "Bearer test:free@security.test", "X-LLH-Plan": "Pro" },
    });
    assert(spoofed.status === 403, `spoofed plan header must not unlock detail (${spoofed.status})`);
    assertNoProtectedStrings(spoofed.json, "spoofed plan response");

    console.log("\nAll curriculum access security checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();

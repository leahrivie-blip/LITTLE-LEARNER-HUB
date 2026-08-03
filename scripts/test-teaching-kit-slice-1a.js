#!/usr/bin/env node
/**
 * Teaching Kit Slice 1A — flags, schema passthrough, no rewrite, access unchanged.
 * Run: npm run test:teaching-kit-slice-1a
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-teaching-kit-1a-${process.pid}.json`);
const ADMIN = {
  email: "tk-slice1a-admin@example.com",
  password: "tk-slice1a-pass",
  code: "tk-slice1a-code",
};

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
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
            json = { raw: text };
          }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`Server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for server health"));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startServer() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

function sampleDayItem(dayKey, index = 1) {
  return {
    itemId: `${dayKey}-${index}`,
    activityCategory: "Sensory",
    title: `${dayKey} activity`,
    objective: "Explore",
    description: "Desc",
    materials: "Sand",
    setup: "Set up",
    steps: "Play",
    teacherRole: "Observe",
    teacherLanguage: "Tell me",
    learningGoals: ["Explore"],
    observationOpportunities: "Notice",
    vocabulary: "sand",
    extensions: "More",
    adaptations: "Less",
    safetyNotes: "Safe",
    ageModifications: "",
  };
}

function samplePlan(id, extras = {}) {
  return {
    id,
    title: `TK Test ${id}`,
    age: "Toddler",
    theme: "Test",
    plan: "Free",
    status: "published",
    learningDomains: ["Language & Literacy"],
    weeklyOverview: "Overview text for teaching kit tests.",
    objectives: "Learn something gentle.",
    books: [{ title: "Test Book", author: "A Author", notes: "" }],
    songs: [{ title: "Test Song", notes: "" }],
    weeklyMaterials: "Paper",
    vocabularyWords: "hello",
    observationOpportunities: "Watch play",
    adaptations: "Simplify",
    familyConnection: "Talk at home",
    dailyPlans: {
      monday: { theme: "Mon", items: [sampleDayItem("monday")] },
      tuesday: { theme: "Tue", items: [sampleDayItem("tuesday")] },
      wednesday: { theme: "Wed", items: [sampleDayItem("wednesday")] },
      thursday: { theme: "Thu", items: [sampleDayItem("thursday")] },
      friday: { theme: "Fri", items: [sampleDayItem("friday")] },
    },
    ...extras,
  };
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && (res.json?.token || res.json?.adminToken),
    `admin login should succeed: ${res.status} ${res.text}`);
  return res.json.token || res.json.adminToken;
}

function readTempStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function writeTempStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function seedAccessUsers() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const store = readTempStore();
  store.users = store.users || {};
  store.users["tk-free@example.com"] = {
    email: "tk-free@example.com",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    freeLessonAccessMode: "curated",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: now,
  };
  store.users["tk-trial@example.com"] = {
    email: "tk-trial@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription trialing",
    trialStatus: "In Trial",
    trialStart: now,
    trialEnd: future,
    stripeSubscriptionStatus: "trialing",
    subscriptionStartedAt: now,
    updatedAt: now,
  };
  store.users["tk-pro@example.com"] = {
    email: "tk-pro@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    currentPeriodEnd: future,
    accessEndsAt: future,
    subscriptionStartedAt: now,
    subscriptionCadence: "monthly",
    updatedAt: now,
  };
  writeTempStore(store);
}

function testUnitHelpers() {
  const defaults = teachingKit.defaultTeachingKitFeatureFlags();
  assert(defaults.teachingKitViewer === false, "viewer flag defaults false");
  assert(defaults.teachingKitPrintCenter === false, "print flag defaults false");
  assert(defaults.teachingKitAttachments === false, "attachments flag defaults false");
  assert(defaults.teachingKitProductionReleaseApproved === false, "production release approval defaults false");

  const normalizedEmpty = teachingKit.normalizedTeachingKitFeatureFlags(undefined);
  assert(normalizedEmpty.teachingKitViewer === false, "undefined flags → false");
  assert(teachingKit.normalizedTeachingKitFeatureFlags({ teachingKitViewer: "true" }).teachingKitViewer === false,
    "string true must not enable flag");
  assert(teachingKit.normalizedTeachingKitFeatureFlags({ teachingKitViewer: 1 }).teachingKitViewer === false,
    "truthy number must not enable flag");
  assert(teachingKit.normalizedTeachingKitFeatureFlags({ teachingKitViewer: true }).teachingKitViewer === true,
    "strict true enables flag");

  assert(teachingKit.normalizedTeachingKitOverlay(undefined) === null, "absent overlay → null");
  assert(teachingKit.normalizedTeachingKitOverlay("bad") === null, "string overlay → null");
  assert(teachingKit.normalizedTeachingKitOverlay([]) === null, "array overlay → null");
  assert(teachingKit.normalizedTeachingKitOverlay(null) === null, "null overlay → null");

  const ok = teachingKit.normalizedTeachingKitOverlay({
    schemaVersion: 1,
    completeness: "enriched",
    attachmentIds: ["a1", "a1", ""],
    exampleImageIds: ["img1"],
    updatedAt: "2026-08-03T00:00:00.000Z",
  });
  assert(ok && ok.completeness === "enriched", "valid overlay keeps completeness");
  assert(ok.attachmentIds.length === 1 && ok.attachmentIds[0] === "a1", "attachment ids deduped");

  const legacyMode = teachingKit.resolveTeachingKitRenderMode(
    { teachingKit: ok },
    { teachingKitViewer: false },
  );
  assert(legacyMode.mode === "legacy" && legacyMode.reason === "flag_off", "flag off → legacy");

  const staleViewerMode = teachingKit.resolveTeachingKitRenderMode(
    { teachingKit: ok },
    { teachingKitViewer: true, teachingKitProductionReleaseApproved: false },
  );
  assert(staleViewerMode.mode === "legacy" && staleViewerMode.reason === "production_release_not_approved",
    "viewer without production-release approval → legacy");

  const malformedMode = teachingKit.resolveTeachingKitRenderMode(
    { teachingKit: "nope" },
    { teachingKitViewer: true, teachingKitProductionReleaseApproved: true },
  );
  assert(malformedMode.mode === "legacy" && malformedMode.reason === "missing_or_malformed",
    "malformed → legacy even if dual-gate on");

  const ids = teachingKit.sectionIds();
  assert(ids.includes("overview") && ids.includes("vocab_cards"), "canonical sections present");
  assert(teachingKit.mapActivityCategoryToSection("Sensory") === "sensory", "category map works");
  assert(teachingKit.mapActivityCategoryToSection("Unknown Thing") === "daily_activities",
    "unknown category falls back");
}

async function main() {
  testUnitHelpers();

  const child = startServer();
  let adminToken = "";
  try {
    await waitForHealth(child);
    adminToken = await adminLogin();

    // Public site-content must omit featureFlags (unchanged public payload for Slice 1A).
    const publicBefore = await requestJson("GET", "/api/site-content");
    assert(publicBefore.status === 200, "site-content ok");
    assert(!("featureFlags" in (publicBefore.json?.siteContent || {})),
      "public site-content must omit featureFlags in Slice 1A");
    assert(publicBefore.json?.siteContent?.playBasedCurriculum === true, "playBasedCurriculum still true");

    seedAccessUsers();

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    assert(bootstrap.status === 200 && bootstrap.json?.siteContent, "admin site-content GET");
    const adminFlags = bootstrap.json.siteContent.featureFlags || {};
    assert(adminFlags.teachingKitViewer === false, "admin teachingKitViewer default false");
    assert(adminFlags.teachingKitPrintCenter === false, "admin teachingKitPrintCenter default false");
    assert(adminFlags.teachingKitAttachments === false, "admin teachingKitAttachments default false");
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    // Seed two plans without teachingKit via admin save
    const planA = samplePlan("cur-lp-tk-slice1a-a");
    const planB = samplePlan("cur-lp-tk-slice1a-b", { plan: "Pro", title: "TK Pro Plan" });
    const saveA = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: planA,
    });
    assert(saveA.status === 200, `save A failed: ${saveA.status} ${saveA.text}`);
    expectedUpdatedAt = saveA.json.siteContentUpdatedAt || expectedUpdatedAt;
    const saveB = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: planB,
    });
    assert(saveB.status === 200, `save B failed: ${saveB.status} ${saveB.text}`);
    expectedUpdatedAt = saveB.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Plans must not gain teachingKit from normalization alone
    const storeRaw = readTempStore();
    const plans = storeRaw?.siteContent?.curriculum?.lessonPlans || [];
    const storedA = plans.find((p) => p.id === planA.id);
    const storedB = plans.find((p) => p.id === planB.id);
    assert(storedA, "plan A persisted");
    assert(storedB, "plan B persisted");
    assert(!Object.prototype.hasOwnProperty.call(storedA, "teachingKit"),
      "plan A must not be bulk-rewritten with teachingKit");
    assert(!Object.prototype.hasOwnProperty.call(storedB, "teachingKit"),
      "plan B must not be bulk-rewritten with teachingKit");

    // Save plan A with valid teachingKit — B unchanged
    const saveAKit = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: {
        ...planA,
        teachingKit: {
          schemaVersion: 1,
          completeness: "legacy_mapped",
          attachmentIds: ["res-1"],
          exampleImageIds: [],
          updatedAt: new Date().toISOString(),
        },
      },
    });
    assert(saveAKit.status === 200, `save A with teachingKit: ${saveAKit.status} ${saveAKit.text}`);
    expectedUpdatedAt = saveAKit.json.siteContentUpdatedAt || expectedUpdatedAt;
    const storeAfter = readTempStore();
    const plansAfter = storeAfter?.siteContent?.curriculum?.lessonPlans || [];
    const aAfter = plansAfter.find((p) => p.id === planA.id);
    const bAfter = plansAfter.find((p) => p.id === planB.id);
    assert(aAfter?.teachingKit?.completeness === "legacy_mapped", "plan A keeps teachingKit");
    assert(!Object.prototype.hasOwnProperty.call(bAfter || {}, "teachingKit"),
      "plan B still has no teachingKit after A update");

    // Malformed teachingKit on save → omitted (fail safe)
    const saveMalformed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: {
        ...planA,
        teachingKit: "not-an-object",
      },
    });
    assert(saveMalformed.status === 200, "malformed save accepted without crash");
    expectedUpdatedAt = saveMalformed.json.siteContentUpdatedAt || expectedUpdatedAt;
    const aMalformed = (readTempStore()?.siteContent?.curriculum?.lessonPlans || [])
      .find((p) => p.id === planA.id);
    assert(!Object.prototype.hasOwnProperty.call(aMalformed || {}, "teachingKit"),
      "malformed teachingKit omitted from stored plan");

    // Public detail DTOs omit teachingKit; Pro stays locked for guest/Free
    const freeDetail = await requestJson("GET", `/api/curriculum/lesson-plans/${planA.id}`);
    assert(freeDetail.status === 200, "free plan detail opens for guest browse");
    assert(freeDetail.json?.lessonPlan?.id === planA.id, "free detail id");
    assert(!Object.prototype.hasOwnProperty.call(freeDetail.json.lessonPlan, "teachingKit"),
      "public detail DTO omits teachingKit in Slice 1A");

    const proDetailGuest = await requestJson("GET", `/api/curriculum/lesson-plans/${planB.id}`);
    assert(proDetailGuest.status === 200, "pro detail guest preview/browse");
    assert(proDetailGuest.json.lessonPlan.locked === true, "guest Pro plan stays locked");
    assert(!proDetailGuest.json.lessonPlan.dailyPlans, "guest Pro preview has no dailyPlans");

    const proDetailFreeUser = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planB.id}`,
      null,
      { Authorization: "Bearer test:tk-free@example.com" },
    );
    assert(proDetailFreeUser.status === 200, "free user can browse Pro preview");
    assert(proDetailFreeUser.json.lessonPlan.locked === true, "Free user Pro plan stays locked");

    const proDetailProUser = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planB.id}`,
      null,
      { Authorization: "Bearer test:tk-pro@example.com" },
    );
    assert(proDetailProUser.status === 200, "Pro user detail ok");
    assert(proDetailProUser.json.lessonPlan.locked === false, "Pro user unlocks Pro plan");
    assert(proDetailProUser.json.lessonPlan.dailyPlans, "Pro user receives dailyPlans");
    assert(!Object.prototype.hasOwnProperty.call(proDetailProUser.json.lessonPlan, "teachingKit"),
      "Pro detail DTO still omits teachingKit in Slice 1A");

    const proDetailTrial = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planB.id}`,
      null,
      { Authorization: "Bearer test:tk-trial@example.com" },
    );
    assert(proDetailTrial.status === 200 && proDetailTrial.json.lessonPlan.locked === false,
      "Trial user still unlocks Pro curriculum");

    // Truthy-but-not-true flags in admin site-content must normalize to false
    const adminGet = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    assert(adminGet.status === 200 && adminGet.json?.siteContent, "admin GET for flag save");
    const existing = adminGet.json.siteContent;
    const saveFlags = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      siteContent: {
        ...existing,
        updatedAt: existing.updatedAt,
        featureFlags: {
          playBasedCurriculum: true,
          teachingKitViewer: "yes",
          teachingKitPrintCenter: 1,
          teachingKitAttachments: true,
        },
      },
    });
    assert(saveFlags.status === 200, `flag save failed: ${saveFlags.status} ${saveFlags.text}`);
    const normalizedFlags = saveFlags.json?.siteContent?.featureFlags
      || (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`))
        .json?.siteContent?.featureFlags
      || {};
    assert(normalizedFlags.teachingKitViewer === false, "string flag normalized false server-side");
    assert(normalizedFlags.teachingKitPrintCenter === false, "numeric flag normalized false server-side");
    assert(normalizedFlags.teachingKitAttachments === true, "explicit true preserved server-side");

    // Public payload still omits featureFlags after admin flag writes.
    const publicAfter = await requestJson("GET", "/api/site-content");
    assert(!("featureFlags" in (publicAfter.json?.siteContent || {})),
      "public site-content still omits featureFlags after admin flag save");

    // Reset flags to false (Slice 1A must not leave enablement in temp store)
    const resetGet = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      siteContent: {
        ...resetGet.json.siteContent,
        updatedAt: resetGet.json.siteContent.updatedAt,
        featureFlags: {
          playBasedCurriculum: true,
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
        },
      },
    });

    const library = (await requestJson("GET", "/api/site-content")).json?.siteContent?.curriculumLibrary;
    assert(library && Array.isArray(library.lessonPlans), "curriculumLibrary lessonPlans array intact");

    console.log(`OK teaching-kit-slice-1a (${passed} assertions)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-slice-1a:", error.message || error);
  process.exit(1);
});

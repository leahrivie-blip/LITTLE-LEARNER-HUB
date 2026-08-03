#!/usr/bin/env node
/**
 * Teaching Kit Slice 1C — flagged GET …/teaching-kit API.
 * Flags stay false by default; tests enable locally then reset.
 * Run: npm run test:teaching-kit-slice-1c
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const freeCurriculumSample = require("./free-curriculum-sample.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4800 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-teaching-kit-1c-${process.pid}.json`);
const ADMIN = {
  email: "tk-slice1c-admin@example.com",
  password: "tk-slice1c-pass",
  code: "tk-slice1c-code",
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
  return spawn(process.execPath, ["server/index.js"], {
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
}

function sampleDayItem(dayKey) {
  return {
    itemId: `${dayKey}-1`,
    activityCategory: "Sensory Play",
    title: `${dayKey} sensory tray`,
    objective: "Explore textures",
    description: "Hands-on tray",
    materials: "Tray\nScoops",
    setup: "Set tray on low table.",
    steps: "1. Invite play.\n2. Narrate.",
    teacherRole: "Observe",
    teacherLanguage: "Look: What do you notice?",
    learningGoals: ["Explore"],
    observationOpportunities: "Uses scoops?",
    vocabulary: "scoop",
    extensions: "",
    adaptations: "Offer larger scoops.",
    safetyNotes: "Wipe spills.",
    ageModifications: "",
  };
}

function samplePlan(id, extras = {}) {
  return {
    id,
    title: `TK 1C ${id}`,
    age: "Toddler",
    theme: "Sensory",
    plan: "Free",
    status: "published",
    learningDomains: ["Approaches to Learning"],
    weeklyOverview: "A short sensory week for Teaching Kit API tests.",
    objectives: "Explore textures.\nPractice describing words.",
    books: [{ title: "Feelings Book", author: "", notes: "Before: How do you feel?\nAfter: Show me calm." }],
    songs: [{ title: "Hello Hands", notes: "Lyrics: Hello hands, clap clap.\nMotions: clap → wave" }],
    weeklyMaterials: "Tray\nScoops\nPaper",
    vocabularyWords: "Texture — how something feels. Ask: Is it soft or bumpy?",
    observationOpportunities: "Watch describing words.",
    adaptations: "Shorten turns.",
    familyConnection: "Today we explored textures! Ask your child what felt soft.",
    dailyPlans: {
      monday: { theme: "Mon", items: [sampleDayItem("monday")], materials: "Tray", transitions: ["Tip-toe to wash"], observations: ["Engaged?"] },
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
  store.users["tk1c-free@example.com"] = {
    email: "tk1c-free@example.com",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    freeLessonAccessMode: "curated",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: now,
  };
  store.users["tk1c-trial@example.com"] = {
    email: "tk1c-trial@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription trialing",
    trialStatus: "In Trial",
    trialStart: now,
    trialEnd: future,
    stripeSubscriptionStatus: "trialing",
    subscriptionStartedAt: now,
    updatedAt: now,
  };
  store.users["tk1c-pro@example.com"] = {
    email: "tk1c-pro@example.com",
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

async function setTeachingKitFlags(adminToken, flags) {
  const adminGet = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  assert(adminGet.status === 200 && adminGet.json?.siteContent, "admin GET for flags");
  const existing = adminGet.json.siteContent;
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        playBasedCurriculum: true,
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, `flag save failed: ${save.status} ${save.text}`);
  return save.json?.siteContent?.featureFlags || {};
}

function testUnitHelpers() {
  assert(teachingKit.isTeachingKitApiEnabled({}) === false, "api disabled by default");
  assert(teachingKit.isTeachingKitApiEnabled({ teachingKitViewer: true }) === true, "viewer enables api");
  assert(teachingKit.isTeachingKitApiEnabled({ teachingKitPrintCenter: true }) === true, "print enables api");
  assert(teachingKit.isTeachingKitApiEnabled({ teachingKitViewer: "true" }) === false, "string does not enable api");
}

async function main() {
  testUnitHelpers();
  const child = startServer();
  let adminToken = "";
  try {
    await waitForHealth(child);
    adminToken = await adminLogin();
    seedAccessUsers();

    const freeId = "cur-lp-tk-slice1c-free";
    const proId = "cur-lp-tk-slice1c-pro";
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    const freePlan = samplePlan(freeId, { plan: "Free", title: "TK 1C Free Starter" });
    const proPlan = samplePlan(proId, { plan: "Pro", title: "TK 1C Pro Week" });

    const saveFree = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: freePlan,
    });
    assert(saveFree.status === 200, `save free: ${saveFree.status} ${saveFree.text}`);
    expectedUpdatedAt = saveFree.json.siteContentUpdatedAt || expectedUpdatedAt;

    const savePro = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: proPlan,
    });
    assert(savePro.status === 200, `save pro: ${savePro.status} ${savePro.text}`);
    expectedUpdatedAt = savePro.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Put free plan into curated starter override (exactly REQUIRED_COUNT ids).
    const starterIds = [freeId, ...freeCurriculumSample.DEFAULT_FREE_STARTER_LESSON_IDS]
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .slice(0, freeCurriculumSample.REQUIRED_COUNT);
    while (starterIds.length < freeCurriculumSample.REQUIRED_COUNT) {
      starterIds.push(`cur-lp-tk-slice1c-pad-${starterIds.length}`);
    }
    const store = readTempStore();
    store.freeStarterLibrary = {
      lessonPlanIds: starterIds,
      updatedAt: new Date().toISOString(),
      updatedBy: ADMIN.email,
    };
    writeTempStore(store);

    // Default flags off → 404 disabled
    const offGuest = await requestJson("GET", `/api/curriculum/lesson-plans/${proId}/teaching-kit`);
    assert(offGuest.status === 404, "flag off → 404");
    assert(offGuest.json?.code === "teaching_kit_disabled", "flag off code");

    const offPro = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1c-pro@example.com" },
    );
    assert(offPro.status === 404 && offPro.json?.code === "teaching_kit_disabled",
      "flag off even for Pro user");

    // Detail route still works (path must not break)
    const detail = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}`,
      null,
      { Authorization: "Bearer test:tk1c-pro@example.com" },
    );
    assert(detail.status === 200 && detail.json?.lessonPlan?.id === proId, "detail route still works");

    // Enable viewer flag for API tests
    const enabledFlags = await setTeachingKitFlags(adminToken, { teachingKitViewer: true });
    assert(enabledFlags.teachingKitViewer === true, "viewer flag enabled in admin store");
    assert(enabledFlags.teachingKitPrintCenter === false, "print flag remains false");

    // Public site-content still omits featureFlags and does not grow kit payloads
    const publicContent = await requestJson("GET", "/api/site-content");
    assert(!("featureFlags" in (publicContent.json?.siteContent || {})),
      "public site-content omits featureFlags");
    const libraryPlans = publicContent.json?.siteContent?.curriculumLibrary?.lessonPlans || [];
    assert(!libraryPlans.some((plan) => plan && plan.companion),
      "site-content library does not include teaching kit companion payloads");

    // Guest / Free user on Pro plan → locked preview (no companion body)
    const guestPro = await requestJson("GET", `/api/curriculum/lesson-plans/${proId}/teaching-kit`);
    assert(guestPro.status === 200, "guest Pro teaching-kit returns 200 preview");
    assert(guestPro.json?.teachingKit?.locked === true, "guest Pro kit locked");
    assert(guestPro.json.teachingKit.companion === null, "guest Pro kit has no companion body");
    assert(!guestPro.json.teachingKit.sections?.length, "guest Pro kit has no section content");

    const freeUserPro = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1c-free@example.com" },
    );
    assert(freeUserPro.status === 200 && freeUserPro.json?.teachingKit?.locked === true,
      "Free user Pro kit stays locked");

    // Pro user → full unlocked kit
    const proUser = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit?day=tuesday&readyMaterials=Tray,Paper`,
      null,
      { Authorization: "Bearer test:tk1c-pro@example.com" },
    );
    assert(proUser.status === 200, "Pro user teaching-kit ok");
    assert(proUser.json?.teachingKit?.locked === false, "Pro kit unlocked");
    assert(proUser.json.teachingKit.access === "pro", "Pro access marker");
    assert(proUser.json.teachingKit.companion?.today?.day === "tuesday", "day query applied");
    assert(proUser.json.teachingKit.companion?.mondayMorningSetup, "monday setup present");
    assert(proUser.json.teachingKit.companion?.openEverything, "open everything present");
    assert(proUser.json.teachingKit.sections?.some((section) => section.id === "overview"),
      "sections include overview");
    assert(proUser.json.featureFlags?.teachingKitViewer === true, "response echoes viewer flag");
    assert(proUser.json.featureFlags?.teachingKitPrintCenter === false, "response print flag false");

    // Trial user → unlocked
    const trialUser = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1c-trial@example.com" },
    );
    assert(trialUser.status === 200 && trialUser.json?.teachingKit?.locked === false,
      "Trial user unlocks teaching kit");

    // Free starter unlock for guest/free user
    const freeUnlocked = await requestJson("GET", `/api/curriculum/lesson-plans/${freeId}/teaching-kit`);
    assert(freeUnlocked.status === 200, "free starter teaching-kit ok");
    assert(freeUnlocked.json?.teachingKit?.locked === false, "free starter unlocked");
    assert(freeUnlocked.json.teachingKit.access === "free_unlocked", "free_unlocked access marker");
    assert(freeUnlocked.json.teachingKit.companion?.activities?.length > 0, "free starter has activities");

    const freeUserFree = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${freeId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1c-free@example.com" },
    );
    assert(freeUserFree.status === 200 && freeUserFree.json?.teachingKit?.locked === false,
      "Free user unlocks curated starter kit");

    // Missing plan
    const missing = await requestJson(
      "GET",
      "/api/curriculum/lesson-plans/cur-lp-does-not-exist/teaching-kit",
      null,
      { Authorization: "Bearer test:tk1c-pro@example.com" },
    );
    assert(missing.status === 404, "missing plan → 404");
    assert(missing.json?.code !== "teaching_kit_disabled", "missing plan is not flag-disabled code");

    // Print-center flag alone also enables API; viewer can be off
    await setTeachingKitFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: true,
    });
    const printEnabled = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1c-pro@example.com" },
    );
    assert(printEnabled.status === 200 && printEnabled.json?.teachingKit?.locked === false,
      "print-center flag alone enables API");

    // Reset all Teaching Kit flags to false before exit
    await setTeachingKitFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
    });
    const resetCheck = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1c-pro@example.com" },
    );
    assert(resetCheck.status === 404 && resetCheck.json?.code === "teaching_kit_disabled",
      "flags reset to disabled after tests");

    console.log(`OK teaching-kit-slice-1c (${passed} assertions)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(`${STORE_PATH.replace(/\.json$/, "")}.admin-sessions.json`, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-slice-1c:", error.message || error);
  process.exit(1);
});

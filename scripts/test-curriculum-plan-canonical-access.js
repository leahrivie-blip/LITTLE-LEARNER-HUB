#!/usr/bin/env node
/**
 * Dual-source Free/Pro regression: lesson.plan is the sole Free unlock source.
 *
 * Proves Starter Library IDs cannot unlock Pro lessons, and plan=Free unlocks
 * without requiring a Starter ID. Also proves Set Free/Pro (access-plan) takes
 * effect immediately without a second Starter-ID mutation.
 *
 * Run: npm run test:curriculum-plan-canonical-access
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const freeSample = require("./free-curriculum-sample.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4620 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-plan-canonical-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "plan-canonical-owner-pass",
  code: "plan-canonical-owner-code",
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

function authHeader(email) {
  return { Authorization: `Bearer test:${email}` };
}

function weekdayShell(suffix) {
  const mk = (day) => ({
    theme: day,
    items: [{
      itemId: `item-${suffix}-${day}`.toLowerCase(),
      title: `${suffix} ${day}`,
      objective: "Practice noticing",
      materials: "blocks",
      setup: "Prepare space",
      steps: "Invite children to explore",
      teacherLanguage: `I notice the ${suffix} feels damp`,
    }],
  });
  return {
    monday: mk("Monday"),
    tuesday: mk("Tuesday"),
    wednesday: mk("Wednesday"),
    thursday: mk("Thursday"),
    friday: mk("Friday"),
  };
}

function buildLesson({ id, title, plan, resourceIds = [] }) {
  return {
    id,
    title,
    age: "Preschool",
    theme: "Plan Canonical QA",
    plan,
    status: "published",
    weeklyOverview: `${title} overview`,
    objectives: "Learn together",
    weeklyMaterials: "crayons",
    vocabularyWords: "plan\naccess",
    familyConnection: "Share at home",
    books: [{ title: "Planting a Rainbow", author: "Lois Ehlert" }],
    songs: [{ title: "Rain Song" }],
    resourceIds,
    dailyPlans: weekdayShell(id.slice(-8)),
    disposableQaFixture: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

function buildActivity({ id, lessonPlanId, title }) {
  return {
    id,
    lessonPlanId,
    title,
    status: "published",
    activityCategory: "Sensory",
    dayOfWeek: "Monday",
    objective: "Explore",
    description: "Hands-on explore",
    materials: "soil",
    setup: "Tray ready",
    steps: "Invite children to scoop and feel the soil.",
    teacherLanguage: "I notice the soil feels damp",
    learningDomains: ["Science"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

function buildResource({ id, lessonPlanId, title }) {
  return {
    id,
    title,
    status: "published",
    category: "Printables",
    lessonPlanIds: [lessonPlanId],
    fileName: `${id}.pdf`,
    fileMimeType: "application/pdf",
    fileData: `data:application/pdf;base64,${Buffer.from(`%PDF-1.4 ${id}`).toString("base64")}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

const IDS = {
  freeNoStarter: "cur-lp-plan-free-no-starter",
  freeInStarter: "cur-lp-plan-free-in-starter",
  proInStarter: "cur-lp-plan-pro-in-starter",
  proNoStarter: "cur-lp-plan-pro-no-starter",
  flipTarget: "cur-lp-plan-flip-target",
};

const EXTRA_FREE_COUNT = 9;

function extraFreeLessons() {
  return Array.from({ length: EXTRA_FREE_COUNT }, (_, index) => buildLesson({
    id: `cur-lp-plan-extra-free-${index + 1}`,
    title: `Extra Free ${index + 1}`,
    plan: "Free",
  }));
}

function starterIdsIncluding(...extra) {
  const base = freeSample.DEFAULT_FREE_STARTER_LESSON_IDS.filter(
    (id) => !extra.includes(id) && !Object.values(IDS).includes(id),
  );
  const merged = [...extra, ...base].slice(0, freeSample.REQUIRED_COUNT);
  while (merged.length < freeSample.REQUIRED_COUNT) {
    merged.push(`cur-lp-plan-starter-pad-${merged.length}`);
  }
  return merged;
}

function writeSeedStore() {
  const freeNoStarterRes = buildResource({
    id: "cur-res-free-no-starter",
    lessonPlanId: IDS.freeNoStarter,
    title: "Free No Starter Printable",
  });
  const proInStarterRes = buildResource({
    id: "cur-res-pro-in-starter",
    lessonPlanId: IDS.proInStarter,
    title: "Pro In Starter Printable",
  });
  const proNoStarterRes = buildResource({
    id: "cur-res-pro-no-starter",
    lessonPlanId: IDS.proNoStarter,
    title: "Pro No Starter Printable",
  });
  const freeInStarterRes = buildResource({
    id: "cur-res-free-in-starter",
    lessonPlanId: IDS.freeInStarter,
    title: "Free In Starter Printable",
  });
  const flipRes = buildResource({
    id: "cur-res-flip-target",
    lessonPlanId: IDS.flipTarget,
    title: "Flip Target Printable",
  });

  const plans = [
    buildLesson({ id: IDS.freeNoStarter, title: "Free No Starter", plan: "Free", resourceIds: [freeNoStarterRes.id] }),
    buildLesson({ id: IDS.freeInStarter, title: "Free In Starter", plan: "Free", resourceIds: [freeInStarterRes.id] }),
    buildLesson({ id: IDS.proInStarter, title: "Pro In Starter", plan: "Pro", resourceIds: [proInStarterRes.id] }),
    buildLesson({ id: IDS.proNoStarter, title: "Pro No Starter", plan: "Pro", resourceIds: [proNoStarterRes.id] }),
    buildLesson({ id: IDS.flipTarget, title: "Flip Target Starts Pro", plan: "Pro", resourceIds: [flipRes.id] }),
    ...extraFreeLessons(),
  ];

  const activities = [
    buildActivity({ id: "cur-act-free-no-starter", lessonPlanId: IDS.freeNoStarter, title: "Free No Starter Activity" }),
    buildActivity({ id: "cur-act-free-in-starter", lessonPlanId: IDS.freeInStarter, title: "Free In Starter Activity" }),
    buildActivity({ id: "cur-act-pro-in-starter", lessonPlanId: IDS.proInStarter, title: "Pro In Starter Activity" }),
    buildActivity({ id: "cur-act-pro-no-starter", lessonPlanId: IDS.proNoStarter, title: "Pro No Starter Activity" }),
    buildActivity({ id: "cur-act-flip-target", lessonPlanId: IDS.flipTarget, title: "Flip Target Activity" }),
  ];

  const starterList = starterIdsIncluding(IDS.freeInStarter, IDS.proInStarter);

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      "free@plan-canonical.test": {
        email: "free@plan-canonical.test",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        role: "member",
      },
      "pro@plan-canonical.test": {
        email: "pro@plan-canonical.test",
        plan: "Pro",
        subscriptionStatus: "active",
        role: "member",
        stripeSubscriptionId: "sub_test_pro",
      },
    },
    adminSessions: {},
    freeStarterLibrary: {
      lessonPlanIds: starterList,
      updatedAt: "2026-01-02T00:00:00.000Z",
      updatedBy: OWNER.email,
    },
    siteContent: {
      curriculum: {
        lessonPlans: plans,
        activities,
        resources: [freeNoStarterRes, freeInStarterRes, proInStarterRes, proNoStarterRes, flipRes],
        series: [],
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      freeStarterLibrary: {
        lessonPlanIds: starterList,
        updatedAt: "2026-01-02T00:00:00.000Z",
        updatedBy: OWNER.email,
      },
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  }, null, 2));

  return { starterList, freeNoStarterRes, proInStarterRes, proNoStarterRes, freeInStarterRes, flipRes };
}

function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  return child;
}

async function waitForHealth(child, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for health");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

async function expectLessonUnlocked(lessonId, label, headers = {}) {
  const browse = await requestJson("GET", "/api/site-content", null, headers);
  const card = (browse.json?.siteContent?.curriculumLibrary?.lessonPlans || []).find((p) => p.id === lessonId);
  assert(card && card.locked !== true, `${label}: browse unlocked`);
  const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(lessonId)}`, null, headers);
  assert(detail.status === 200, `${label}: detail status ${detail.status}`);
  assert(detail.json?.lessonPlan?.locked !== true, `${label}: detail unlocked`);
  assert(detail.json?.lessonPlan?.dailyPlans, `${label}: detail has dailyPlans`);
}

async function expectLessonLocked(lessonId, label, headers = {}) {
  const browse = await requestJson("GET", "/api/site-content", null, headers);
  const card = (browse.json?.siteContent?.curriculumLibrary?.lessonPlans || []).find((p) => p.id === lessonId);
  assert(card && card.locked === true, `${label}: browse locked`);
  assert(!card.dailyPlans, `${label}: browse omits dailyPlans`);
  const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(lessonId)}`, null, headers);
  assert([200, 403].includes(detail.status), `${label}: detail status ${detail.status}`);
  if (detail.status === 200) {
    assert(detail.json?.lessonPlan?.locked === true, `${label}: detail locked`);
    assert(!detail.json?.lessonPlan?.dailyPlans, `${label}: detail omits dailyPlans`);
  }
}

async function expectActivityUnlocked(activityId, label, headers = {}) {
  const detail = await requestJson("GET", `/api/curriculum/activities/${encodeURIComponent(activityId)}`, null, headers);
  assert(detail.status === 200, `${label}: activity status ${detail.status}`);
  assert(detail.json?.activity?.locked !== true, `${label}: activity unlocked`);
  assert(detail.json?.activity?.teacherLanguage, `${label}: activity has teacherLanguage`);
}

async function expectActivityLocked(activityId, label, headers = {}) {
  const detail = await requestJson("GET", `/api/curriculum/activities/${encodeURIComponent(activityId)}`, null, headers);
  assert(detail.status === 403, `${label}: activity expected 403, got ${detail.status}`);
}

async function expectResourceAllowed(resourceId, label, headers = {}) {
  const res = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`, null, headers);
  assert(res.status === 200, `${label}: resource expected 200, got ${res.status} ${res.text}`);
}

async function expectResourceDenied(resourceId, label, headers = {}) {
  const res = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`, null, headers);
  assert(res.status === 403, `${label}: resource expected 403, got ${res.status}`);
}

async function expectPdfAllowed(resourceId, label, headers = {}) {
  const res = await requestJson(
    "POST",
    "/api/trial-curriculum-exports/generate-pdf",
    { resourceId, idempotencyKey: `pdf-ok-${resourceId}-${Date.now()}` },
    headers,
  );
  assert(res.status === 200, `${label}: pdf expected 200, got ${res.status} ${String(res.text || "").slice(0, 180)}`);
}

async function expectPdfDenied(resourceId, label, headers = {}) {
  const res = await requestJson(
    "POST",
    "/api/trial-curriculum-exports/generate-pdf",
    { resourceId, idempotencyKey: `pdf-deny-${resourceId}-${Date.now()}` },
    headers,
  );
  assert(res.status === 403, `${label}: pdf expected 403, got ${res.status} ${String(res.text || "").slice(0, 180)}`);
}

async function main() {
  const seed = writeSeedStore();
  const child = startServer();
  try {
    await waitForHealth(child);
    const freeHeaders = authHeader("free@plan-canonical.test");
    const proHeaders = authHeader("pro@plan-canonical.test");

    // Confirm starter inventory includes Pro-in-starter and Free-in-starter, excludes Free-no-starter.
    assert(seed.starterList.includes(IDS.proInStarter), "fixture: Pro id in starter list");
    assert(seed.starterList.includes(IDS.freeInStarter), "fixture: Free id in starter list");
    assert(!seed.starterList.includes(IDS.freeNoStarter), "fixture: Free-no-starter absent from starter");
    assert(!seed.starterList.includes(IDS.proNoStarter), "fixture: Pro-no-starter absent from starter");
    assert(freeSample.isCuratedFreeLessonPlan({ id: IDS.proInStarter }, new Date(), seed.starterList), "merchandising helper still sees Pro id");
    assert(!freeSample.isCuratedFreeLessonPlan({ id: IDS.freeNoStarter }, new Date(), seed.starterList), "merchandising helper excludes Free-no-starter");
    assert(freeSample.effectivePlanTier({ id: IDS.proInStarter, plan: "Pro" }, new Date(), seed.starterList) === "Pro", "effectivePlanTier ignores starter IDs for Pro");
    assert(freeSample.effectivePlanTier({ id: IDS.freeNoStarter, plan: "Free" }, new Date(), seed.starterList) === "Free", "effectivePlanTier follows plan=Free without starter ID");
    assert(freeSample.countCanonicalPublishedFreePlans(readStore().siteContent.curriculum.lessonPlans) === 11, "unit count of published plan=Free is 11");

    console.log("1) published + plan=Free + NOT in Starter → Free access");
    await expectLessonUnlocked(IDS.freeNoStarter, "free-no-starter/anon");
    await expectLessonUnlocked(IDS.freeNoStarter, "free-no-starter/free-user", freeHeaders);
    await expectActivityUnlocked("cur-act-free-no-starter", "free-no-starter activity/anon");
    await expectActivityUnlocked("cur-act-free-no-starter", "free-no-starter activity/free-user", freeHeaders);
    await expectResourceAllowed(seed.freeNoStarterRes.id, "free-no-starter resource/anon");
    await expectResourceAllowed(seed.freeNoStarterRes.id, "free-no-starter resource/free-user", freeHeaders);
    await expectPdfAllowed(IDS.freeNoStarter, "free-no-starter pdf", freeHeaders);

    console.log("2) published + plan=Pro + IN Starter → remains protected");
    await expectLessonLocked(IDS.proInStarter, "pro-in-starter/anon");
    await expectLessonLocked(IDS.proInStarter, "pro-in-starter/free-user", freeHeaders);
    await expectActivityLocked("cur-act-pro-in-starter", "pro-in-starter activity/anon");
    await expectActivityLocked("cur-act-pro-in-starter", "pro-in-starter activity/free-user", freeHeaders);
    await expectResourceDenied(seed.proInStarterRes.id, "pro-in-starter resource/anon");
    await expectResourceDenied(seed.proInStarterRes.id, "pro-in-starter resource/free-user", freeHeaders);
    await expectPdfDenied(IDS.proInStarter, "pro-in-starter pdf", freeHeaders);

    console.log("3) published + plan=Pro + NOT Starter → remains protected");
    await expectLessonLocked(IDS.proNoStarter, "pro-no-starter/anon");
    await expectLessonLocked(IDS.proNoStarter, "pro-no-starter/free-user", freeHeaders);
    await expectActivityLocked("cur-act-pro-no-starter", "pro-no-starter activity/free-user", freeHeaders);
    await expectResourceDenied(seed.proNoStarterRes.id, "pro-no-starter resource/free-user", freeHeaders);

    console.log("4) published + plan=Free + IN Starter → works normally");
    await expectLessonUnlocked(IDS.freeInStarter, "free-in-starter/free-user", freeHeaders);
    await expectActivityUnlocked("cur-act-free-in-starter", "free-in-starter activity", freeHeaders);
    await expectResourceAllowed(seed.freeInStarterRes.id, "free-in-starter resource", freeHeaders);
    await expectPdfAllowed(IDS.freeInStarter, "free-in-starter pdf", freeHeaders);

    console.log("5) Free lesson count reflects canonical published plan===Free (11, not starter 10)");
    const siteFree = await requestJson("GET", "/api/site-content", null, freeHeaders);
    const libraryPlans = siteFree.json?.siteContent?.curriculumLibrary?.lessonPlans || [];
    const unlockedFree = libraryPlans.filter((plan) => plan && plan.locked !== true);
    assert(unlockedFree.length === 11, `free user unlocked count expected 11, got ${unlockedFree.length}`);
    assert(siteFree.json?.siteContent?.canonicalFreePublishedCount === 11, "canonicalFreePublishedCount is 11");
    assert(siteFree.json?.siteContent?.freeStarterLibrary?.count === 10, "starter merchandising count stays 10");
    assert(siteFree.json?.siteContent?.freeStarterLibrary?.lessonPlanIds?.length === 10, "starter ID list stays 10");
    assert(siteFree.json?.siteContent?.freeStarterLibrary?.notEntitlement === true, "starter list marked non-entitlement");
    assert(siteFree.json?.siteContent?.freeStarterLibrary?.purpose === "marketing-inventory", "starter list purpose is marketing-inventory");
    assert(unlockedFree.some((plan) => plan.id === IDS.freeNoStarter), "count includes Free-not-in-starter");
    assert(!unlockedFree.some((plan) => plan.id === IDS.proInStarter), "count excludes Pro-in-starter");
    extraFreeLessons().forEach((lesson) => {
      assert(unlockedFree.some((plan) => plan.id === lesson.id), `extra Free ${lesson.id} counted`);
    });

    console.log("6) owner/admin / Pro behavior unchanged");
    await expectLessonUnlocked(IDS.proInStarter, "pro-in-starter/pro-user", proHeaders);
    await expectActivityUnlocked("cur-act-pro-in-starter", "pro-in-starter activity/pro-user", proHeaders);
    await expectResourceAllowed(seed.proInStarterRes.id, "pro-in-starter resource/pro-user", proHeaders);
    const ownerLogin = await requestJson("POST", "/api/admin/login", OWNER);
    assert(ownerLogin.status === 200 && ownerLogin.json?.token, "owner login");
    const ownerToken = ownerLogin.json.token;
    const adminDetail = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${encodeURIComponent(IDS.proNoStarter)}?adminToken=${encodeURIComponent(ownerToken)}`,
    );
    assert(adminDetail.status === 200 && adminDetail.json?.lessonPlan?.dailyPlans, "admin unlocks Pro detail");

    console.log("7) Set Free via access-plan immediately unlocks without Starter mutation");
    const beforeStarter = JSON.stringify(readStore().freeStarterLibrary?.lessonPlanIds || []);
    assert(!seed.starterList.includes(IDS.flipTarget), "flip target not in starter");
    await expectLessonLocked(IDS.flipTarget, "flip before/free-user", freeHeaders);
    await expectActivityLocked("cur-act-flip-target", "flip activity before", freeHeaders);
    await expectResourceDenied(seed.flipRes.id, "flip resource before", freeHeaders);

    const stamp = readStore().siteContent?.updatedAt || readStore().siteContent?.curriculum?.updatedAt;
    const setFree = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-plans/access-plan",
      {
        expectedUpdatedAt: stamp,
        lessonPlanIds: [IDS.flipTarget],
        plan: "Free",
        confirm: true,
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert(setFree.status === 200 && setFree.json?.ok === true, `Set Free failed: ${setFree.status} ${setFree.text}`);
    const afterStarter = JSON.stringify(readStore().freeStarterLibrary?.lessonPlanIds || []);
    assert(beforeStarter === afterStarter, "Starter IDs must remain unchanged after Set Free");
    assert(readStore().siteContent?.curriculum?.lessonPlans?.find((p) => p.id === IDS.flipTarget)?.plan === "Free", "plan flipped to Free");

    await expectLessonUnlocked(IDS.flipTarget, "flip after/free-user", freeHeaders);
    await expectActivityUnlocked("cur-act-flip-target", "flip activity after", freeHeaders);
    await expectResourceAllowed(seed.flipRes.id, "flip resource after", freeHeaders);
    await expectPdfAllowed(IDS.flipTarget, "flip pdf after", freeHeaders);
    const siteAfterFree = await requestJson("GET", "/api/site-content", null, freeHeaders);
    assert(siteAfterFree.json?.siteContent?.canonicalFreePublishedCount === 12, "Set Free raises canonical count to 12");
    assert(JSON.stringify(siteAfterFree.json?.siteContent?.freeStarterLibrary?.lessonPlanIds || []) === afterStarter, "starter IDs still unchanged after count refresh");

    console.log("8) Set Pro via access-plan immediately locks without Starter mutation");
    const stampPro = readStore().siteContent?.updatedAt || readStore().siteContent?.curriculum?.updatedAt;
    const setPro = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-plans/access-plan",
      {
        expectedUpdatedAt: stampPro,
        lessonPlanIds: [IDS.freeInStarter],
        plan: "Pro",
        confirm: true,
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert(setPro.status === 200 && setPro.json?.ok === true, `Set Pro failed: ${setPro.status} ${setPro.text}`);
    const afterSetProStarter = JSON.stringify(readStore().freeStarterLibrary?.lessonPlanIds || []);
    assert(beforeStarter === afterSetProStarter, "Starter IDs must remain unchanged after Set Pro");
    assert(readStore().siteContent?.curriculum?.lessonPlans?.find((p) => p.id === IDS.freeInStarter)?.plan === "Pro", "plan flipped to Pro");
    assert(seed.starterList.includes(IDS.freeInStarter), "Set Pro target remains in historical starter IDs");
    await expectLessonLocked(IDS.freeInStarter, "set-pro in-starter/free-user", freeHeaders);
    await expectActivityLocked("cur-act-free-in-starter", "set-pro in-starter activity", freeHeaders);
    await expectResourceDenied(seed.freeInStarterRes.id, "set-pro in-starter resource", freeHeaders);
    await expectPdfDenied(IDS.freeInStarter, "set-pro in-starter pdf", freeHeaders);
    await expectLessonUnlocked(IDS.freeInStarter, "set-pro in-starter still open for Pro user", proHeaders);
    const siteAfterPro = await requestJson("GET", "/api/site-content", null, freeHeaders);
    assert(siteAfterPro.json?.siteContent?.canonicalFreePublishedCount === 11, "Set Pro on in-starter lesson drops canonical count to 11");

    console.log("9) Guest/public preview remains correct");
    await expectLessonUnlocked(IDS.freeNoStarter, "guest still unlocks plan=Free");
    await expectLessonLocked(IDS.proInStarter, "guest still locks plan=Pro even in starter IDs");
    await expectLessonLocked(IDS.freeInStarter, "guest locks lesson after Admin Set Pro");

    console.log("10) Source guards: no starter-ID fallback authorizes a Pro lesson");
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
    const sampleJs = fs.readFileSync(path.join(ROOT, "scripts/free-curriculum-sample.js"), "utf8");
    assert(/function isFreeAccessibleCurriculumPlan[\s\S]*?plan === "Free"/.test(appJs)
      || /function isFreeAccessibleCurriculumPlan[\s\S]*?\.plan \|\| ""\)\.trim\(\) === "Free"/.test(appJs),
    "client isFreeAccessibleCurriculumPlan uses plan field");
    assert(!/function isFreeAccessibleCurriculumPlan[\s\S]*?return isCuratedFreeCurriculumPlan/.test(appJs),
      "client isFreeAccessibleCurriculumPlan must not delegate to Starter IDs");
    assert(/function userMayUnlockFreeCurriculumPlan[\s\S]{0,500}?entry\.plan \|\| ""\)\.trim\(\) === "Free"/.test(serverJs),
      "server unlock uses canonical plan field");
    assert(!/function userMayUnlockFreeCurriculumPlan[\s\S]{0,800}?isCuratedFreeLessonPlan/.test(serverJs),
      "server unlock must not call starter-ID helper");
    assert(/function effectivePlanTier[\s\S]{0,400}?canonicalAccessPlan/.test(sampleJs),
      "effectivePlanTier delegates to canonicalAccessPlan");
    assert(!/function effectivePlanTier[\s\S]{0,400}?isCuratedFreeLessonPlan/.test(sampleJs),
      "effectivePlanTier must not treat starter IDs as entitlement");

    console.log(`\nAll plan-canonical access checks passed (${passed} assertions).`);
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();

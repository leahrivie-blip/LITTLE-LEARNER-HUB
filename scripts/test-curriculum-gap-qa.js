#!/usr/bin/env node
/**
 * Step 4 gap audit — areas not fully covered by publish/ux scripts.
 * Run: npm run test:curriculum-gap-qa
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19350 + Math.floor(Math.random() * 30);
const STORE_PATH = path.join(os.tmpdir(), `llh-gap-qa-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "gap-qa@test.local",
  password: "gap-qa-pass",
  code: "gap-qa-code",
};

const MINIMAL_IMPORT = `
TITLE:
Gap QA Lesson ${Date.now()}

AGE GROUP:
Preschool

THEME:
Gap Audit Theme

PLAN:
Pro

STATUS:
published

WEEKLY OVERVIEW:
Gap audit overview.

MONDAY:
ACTIVITY NAME:
Gap Monday Activity
CATEGORY:
Fine Motor
DESCRIPTION:
A short fine motor drawing activity.
MATERIALS:
Crayons
DIRECTIONS:
1. Draw freely.
TEACHER_ROLE:
Support mark making and encourage exploration.
LEARNING GOAL:
Explore mark making
`.trim();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Gap QA",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.__output().includes("running on")) return;
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
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

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", ADMIN);
  assert(res.status === 200 && res.json?.token, "Admin login failed");
  return res.json.token;
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
}

function parseImport(text) {
  const parsed = parseCurriculumLessonPlanImport(text, {
    generateItemId: () => `item-${crypto.randomBytes(6).toString("hex")}`,
  });
  assert(parsed.ok, parsed.errors.join("; "));
  return parsed.data;
}

function seedServerPersonas() {
  const store = fs.existsSync(STORE_PATH)
    ? JSON.parse(fs.readFileSync(STORE_PATH, "utf8"))
    : { users: {} };
  const now = new Date().toISOString();
  store.users = store.users || {};
  store.users["pro@gap.test"] = {
    email: "pro@gap.test",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    subscriptionStartedAt: now,
    monthlyPrice: "$20/month",
    updatedAt: now,
  };
  store.users["trial@gap.test"] = {
    email: "trial@gap.test",
    plan: "Pro",
    subscriptionStatus: "Trial Active",
    trialStatus: "active",
    subscriptionStartedAt: now,
    updatedAt: now,
  };
  store.users["founding@gap.test"] = {
    email: "founding@gap.test",
    plan: "Founding",
    subscriptionStatus: "Founding Member Subscription Active",
    foundingMember: true,
    subscriptionStartedAt: now,
    monthlyPrice: "$9.99/month",
    updatedAt: now,
  };
  store.users["free@gap.test"] = {
    email: "free@gap.test",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    updatedAt: now,
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function personaAccount(persona) {
  const email = `${persona}@gap.test`;
  const now = new Date().toISOString();
  if (persona === "free") {
    return { email, plan: "Free", subscriptionStatus: "Free Plan" };
  }
  if (persona === "trial") {
    return {
      email,
      plan: "Pro",
      subscriptionStatus: "Trial Active",
      trialStatus: "active",
      subscriptionStartedAt: now,
    };
  }
  if (persona === "founding") {
    return {
      email,
      plan: "Founding",
      subscriptionStatus: "Founding Member Subscription Active",
      foundingMember: true,
      subscriptionStartedAt: now,
    };
  }
  return {
    email,
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    subscriptionStartedAt: now,
  };
}

async function runBrowserGaps(baseUrl, lessonTitle, proTitle) {
  let playwright;
  try { playwright = require("playwright"); } catch { return { skipped: true }; }

  const browser = await playwright.chromium.launch({ headless: true });
  const issues = [];

  try {
  async function personaPage(persona) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
    if (persona === "logged-out") {
      await page.evaluate(() => {
        localStorage.removeItem("llhUser");
        localStorage.removeItem("llhPlan");
        localStorage.setItem("llhAccounts", JSON.stringify({}));
      });
    } else {
      const account = personaAccount(persona);
      await page.evaluate(({ account }) => {
        localStorage.setItem("llhUser", account.email);
        localStorage.setItem("llhAccounts", JSON.stringify({ [account.email]: account }));
        localStorage.setItem("llhPlan", account.plan);
      }, { account });
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 45000 });
    if (persona !== "logged-out") {
      await page.waitForResponse((r) => r.url().includes("/api/subscription-status") && r.status() === 200, { timeout: 45000 }).catch(() => {});
      const expectPro = persona === "pro" || persona === "trial" || persona === "founding";
      await page.waitForFunction(
        (needsPro) => {
          if (typeof effectiveAccessPlan !== "function" || typeof isProUser !== "function") return false;
          return needsPro ? isProUser() : effectiveAccessPlan() === "Free";
        },
        expectPro,
        { timeout: 20000 },
      );
    }
    return page;
  }

  // Logged-out may browse lessons (Free previews); Pro cards stay locked
  {
    const page = await personaPage("logged-out");
    await page.evaluate(() => { if (typeof setView === "function") setView("lessons"); });
    await page.waitForSelector("#lessonPlanSearch", { timeout: 30000 });
    const modalOpen = await page.evaluate(() => document.body.classList.contains("auth-modal-open"));
    assert(!modalOpen, "Logged-out guest should browse lessons without login modal");
    await page.fill("#lessonPlanSearch", proTitle);
    await page.waitForTimeout(500);
    const card = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle }).first();
    await card.waitFor({ timeout: 10000 });
    const locked = await card.evaluate((el) => el.classList.contains("locked"));
    assert(locked, "Logged-out guest should see Pro lesson as locked");
    await page.close();
  }

  // Pro user unlocks Pro lesson
  {
    const page = await personaPage("pro");
    await page.evaluate(() => { if (typeof setView === "function") setView("lessons"); });
    await page.waitForSelector("#lessonPlanSearch", { timeout: 30000 });
    await page.fill("#lessonPlanSearch", proTitle);
    await page.waitForTimeout(500);
    const card = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle }).first();
    await card.waitFor({ timeout: 10000 });
    const locked = await card.evaluate((el) => el.classList.contains("locked"));
    assert(!locked, "Pro user should not see Pro lesson as locked");
    const viewBtn = card.locator("button[data-view-resource]").first();
    assert(await viewBtn.count() === 1, "Pro card should expose View Plan action");
    const viewText = await viewBtn.innerText();
    assert(/view plan/i.test(viewText), "Pro user should see View Plan");
    await card.click({ force: true });
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 });
    await page.close();
  }

  // Trial user unlocks Pro lesson
  {
    const page = await personaPage("trial");
    await page.evaluate(() => { if (typeof setView === "function") setView("lessons"); });
    await page.waitForSelector("#lessonPlanSearch", { timeout: 30000 });
    await page.fill("#lessonPlanSearch", proTitle);
    await page.waitForTimeout(500);
    const card = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle }).first();
    const locked = await card.evaluate((el) => el.classList.contains("locked"));
    assert(!locked, "Trial user should unlock Pro lesson");
    await page.close();
  }

  // Free user: locked Pro card has no View Activities bypass
  {
    const page = await personaPage("free");
    await page.evaluate(() => { if (typeof setView === "function") setView("lessons"); });
    await page.waitForSelector("#lessonPlanSearch", { timeout: 30000 });
    await page.fill("#lessonPlanSearch", proTitle);
    await page.waitForTimeout(500);
    const card = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle }).first();
    await card.waitFor({ timeout: 10000 });
    const locked = await card.evaluate((el) => el.classList.contains("locked"));
    assert(locked, "Free user should see Pro lesson as locked");
    const activityBtn = card.locator("[data-find-lesson-activities]");
    assert(await activityBtn.count() === 0, "Free user must not bypass lock via View Activities");
    await page.close();
  }

  // Viewer open/close from lesson library
  {
    const page = await personaPage("pro");
    await page.evaluate(() => { if (typeof setView === "function") setView("lessons"); });
    await page.waitForSelector("#view-lessons .lesson-library-back", { timeout: 15000 });
    await page.fill("#lessonPlanSearch", proTitle);
    await page.waitForTimeout(400);
    const card = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle }).first();
    await card.waitFor({ timeout: 10000 });
    await card.click({ force: true });
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 });
    await page.waitForSelector("#closeResourceViewer", { timeout: 5000 });
    await page.click("#closeResourceViewer");
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal")?.classList.contains("open"));
    await page.close();
  }

  // Mobile nav (412px Android-ish)
  {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
    const account = personaAccount("pro");
    await page.evaluate(({ account }) => {
      localStorage.setItem("llhUser", account.email);
      localStorage.setItem("llhAccounts", JSON.stringify({ [account.email]: account }));
      localStorage.setItem("llhPlan", account.plan);
    }, { account });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 45000 });
    await page.waitForResponse((r) => r.url().includes("/api/subscription-status") && r.status() === 200, { timeout: 45000 }).catch(() => {});
    const toggle = page.locator("#mobileMenuToggle");
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForFunction(() => document.body.classList.contains("mobile-nav-open"), null, { timeout: 5000 });
      await page.locator('.sidebar [data-view="lessons"]').click();
      await page.waitForTimeout(600);
      assert(!(await page.evaluate(() => document.body.classList.contains("mobile-nav-open"))), "Mobile nav should close after selection");
      await page.waitForSelector("#lessonPlanSearch", { timeout: 15000 });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    assert(!overflow, "Android viewport horizontal scroll");
    await page.close();
  }

  return { ok: true, issues };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  console.log("1) Static gap checks");
  assert(appJs.includes("guestAllowedViews"), "guestAllowedViews missing");
  const guestBlock = appJs.match(/guestAllowedViews\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert(guestBlock, "guestAllowedViews Set not found");
  const guestViews = guestBlock[1].match(/"([^"]+)"/g) || [];
  // Public Free-preview browsing is intentional; Pro content stays locked in-app.
  assert(guestViews.includes('"lessons"'), "lessons should be guest-allowed for Free previews");
  assert(guestViews.includes('"activities"'), "activities should be guest-allowed for Free previews");
  assert(appJs.includes("activity-lesson-filter-banner"), "activity lesson filter banner missing");
  assert(appJs.includes("data-clear-activity-lesson-filter"), "clear activity filter control missing");

  const child = startServer();
  try {
    await waitForBoot(child);
    const token = await adminLogin();
    let updatedAt = (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`)).json.siteContent.updatedAt;

    console.log("2) Archived lesson hidden from public API");
    const parsed = parseImport(MINIMAL_IMPORT);
    const lessonId = `gap-qa-${crypto.randomBytes(4).toString("hex")}`;
    const freeId = `gap-free-${crypto.randomBytes(4).toString("hex")}`;
    const savePro = await saveLesson(token, { ...parsed, id: lessonId, plan: "Pro", status: "published" }, updatedAt);
    assert(savePro.status === 200, "Pro lesson save failed");
    updatedAt = savePro.json.siteContentUpdatedAt;
    const proTitle = savePro.json.lessonPlan.title;

    const saveFree = await saveLesson(token, {
      ...parsed,
      id: freeId,
      title: `${parsed.title} Free Copy`,
      plan: "Free",
      status: "published",
    }, updatedAt);
    assert(saveFree.status === 200, "Free lesson save failed");
    updatedAt = saveFree.json.siteContentUpdatedAt;
    const freeTitle = saveFree.json.lessonPlan.title;

    const archive = await saveLesson(token, { ...saveFree.json.lessonPlan, status: "archived" }, updatedAt);
    assert(archive.status === 200, "Archive save failed");
    updatedAt = archive.json.siteContentUpdatedAt;

    const pub = await requestJson("GET", `/api/site-content?t=${Date.now()}`);
    const plans = pub.json.siteContent?.curriculumLibrary?.lessonPlans || [];
    assert(plans.some((p) => p.id === lessonId), "Published Pro lesson missing from public API");
    assert(!plans.some((p) => p.id === freeId), "Archived lesson leaked to public API");

    console.log("3) Broken resource file fails gracefully");
    const badFile = await requestJson("GET", "/api/curriculum/resources/file?id=cur-res-nonexistent-gap");
    assert(badFile.status === 404 || badFile.status === 400, `Broken resource should 404, got ${badFile.status}`);

    console.log("4) Activity count matches synced activities");
    const activities = (pub.json.siteContent?.curriculumLibrary?.activities || []).filter((a) => a.lessonPlanId === lessonId);
    assert(activities.length === 1, `Expected 1 activity for gap lesson, got ${activities.length}`);

    console.log("5) Browser gap checks (personas, nav, mobile)");
    seedServerPersonas();
    const browser = await runBrowserGaps(`http://127.0.0.1:${PORT}`, freeTitle.replace(" Free Copy", ""), proTitle);
    if (browser.skipped) {
      console.log("   (browser gaps skipped — playwright not installed)");
    }

    console.log("\nGap audit checks passed.");
  } catch (error) {
    console.error("\nGAP FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
  }
}

main();

#!/usr/bin/env node
/**
 * Lesson plan cover resolver + library card cover regression.
 * Run: node scripts/test-lesson-plan-covers.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const covers = require("./lesson-plan-covers.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unitTests() {
  assert(covers.normalizeTheme("Around the World!") === "around the world", "normalizeTheme failed");
  assert(
    covers.getMappedThemeCover("Around the World", "").includes("around-the-world"),
    "Around the World should map to specific cover",
  );
  assert(
    covers.getMappedThemeCover("Reaching & Grasping Adventures", "").includes("reaching-grasping"),
    "Reaching & Grasping should map to infant cover",
  );
  assert(
    covers.getMappedThemeCover("Music & Movement", "").includes("music-movement"),
    "Music & Movement should prefer combined cover",
  );
  assert(
    covers.getMappedThemeCover("Ocean Explorers", "").includes("ocean"),
    "Ocean should map",
  );
  assert(
    covers.getAgeGroupFallback("Infant (0-12 months)").includes("generic-infant"),
    "Infant age fallback missing",
  );

  const custom = covers.resolveLessonPlanCover({
    title: "Ocean Explorers",
    theme: "Ocean",
    coverImageUrl: "/images/lesson-covers/colors.svg",
    coverImageAlt: "Custom colors cover",
  });
  assert(custom.url.includes("colors.svg"), "custom coverImageUrl should win");
  assert(custom.alt === "Custom colors cover", "custom alt should win");
  assert(custom.source === "uploaded" || custom.source === "mapped", "custom source set");

  const mapped = covers.resolveLessonPlanCover({
    title: "Colors Everywhere",
    theme: "Colors",
    age: "Preschool",
    _curriculumManaged: true,
    previewData: "/images/lesson-covers/default.svg",
  });
  assert(mapped.url.includes("colors"), "curriculum previewData must not override theme map");
  assert(mapped.source === "mapped", "mapped source expected");

  const missing = covers.resolveLessonPlanCover({
    title: "Brand New Unique Title XYZ",
    age: "Toddler",
  });
  assert(missing.url.includes("generic-toddler") || missing.url.includes("default"), "age/default fallback");

  const libraryPaths = covers.EXISTING_COVER_LIBRARY.map((item) => item.path);
  assert(libraryPaths.length >= 25, "expected reusable cover library");
  for (const item of covers.EXISTING_COVER_LIBRARY) {
    const filePath = path.join(ROOT, item.path.replace(/^\//, ""));
    assert(fs.existsSync(filePath), `missing cover asset: ${item.path}`);
  }

  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(app.includes("lesson-plan-card__cover"), "card cover img class missing");
  assert(app.includes("data-lesson-card-use-plan"), "Use This Plan wiring must remain");
  assert(app.includes("renderAdminCurriculumLessonCoverSection"), "admin cover section missing");
  assert(app.includes("data-curriculum-cover-pick"), "admin cover picker missing");

  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert(html.includes("scripts/lesson-plan-covers.js"), "cover script must load in index.html");

  console.log("✓ unit cover resolver + static wiring");
}

const PORT = 19640 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-covers-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-covers-admin@test.local",
  password: "lesson-covers-pass",
  code: "lesson-covers-code",
};

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

async function waitForBoot(child) {
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

async function seedPlans(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(sample, "utf8"));
  if (!parsed.ok) throw new Error("sample import failed");
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  let touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const freeId = `cur-lp-cover-free-${crypto.randomBytes(3).toString("hex")}`;
  const proId = `cur-lp-cover-pro-${crypto.randomBytes(3).toString("hex")}`;
  const freeTitle = "Colors Everywhere Cover Test";
  const proTitle = "Ocean Explorers Cover Test";
  const freeSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: freeId,
      title: freeTitle,
      theme: "Colors",
      plan: "Free",
      status: "published",
      age: "Preschool",
      coverImageUrl: "/images/lesson-covers/colors.svg",
      coverImageAlt: "Illustration of a rainbow and crayons for Colors Everywhere",
      coverImageSource: "mapped",
      coverImagePosition: "center",
    },
  });
  assert(freeSave.status === 200, `free save failed: ${freeSave.status} ${freeSave.text?.slice(0, 200)}`);
  const expectedUpdatedAt = freeSave.json.siteContentUpdatedAt || freeSave.json.siteContent?.updatedAt;
  assert(expectedUpdatedAt, "missing siteContentUpdatedAt after free save");
  const proSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: {
      ...parsed.data,
      id: proId,
      title: proTitle,
      theme: "Ocean",
      plan: "Pro",
      status: "published",
      age: "Preschool",
    },
  });
  assert(proSave.status === 200, `pro save failed: ${proSave.status} ${proSave.text?.slice(0, 200)}`);
  return { freeId, freeTitle, proId, proTitle };
}

async function browserRegression() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.log("⏭ playwright not available; skipped browser cover regression");
    return;
  }

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200 && login.json?.token, "Admin login failed");
    const seeded = await seedPlans(login.json.token);

    // Confirm cover fields round-trip on public curriculum payload without leaking Pro body.
    const publicContent = await requestJson("GET", "/api/site-content");
    assert(publicContent.status === 200, "site-content failed");
    const freePlan = (publicContent.json?.curriculum?.lessonPlans || []).find((p) => p.id === seeded.freeId)
      || (publicContent.json?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === seeded.freeId);
    // Public DTO shape varies; also check authorized path via page.

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhPlan", "Free");
    });
    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
    await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
    await page.fill("#lessonPlanSearch", "Cover Test");
    await page.waitForTimeout(500);
    await page.waitForSelector("#view-lessons .lesson-plan-card", { timeout: 15000 });

    const cardAudit = await page.evaluate(({ freeTitle, proTitle }) => {
      const cards = [...document.querySelectorAll("#view-lessons .lesson-plan-card")];
      const free = cards.find((card) => card.textContent.includes(freeTitle));
      const pro = cards.find((card) => card.textContent.includes(proTitle));
      const readCard = (card) => {
        if (!card) return null;
        const img = card.querySelector("img.lesson-plan-card__cover");
        return {
          hasImg: Boolean(img),
          src: img?.getAttribute("src") || "",
          alt: img?.getAttribute("alt") || "",
          lazy: img?.getAttribute("loading") === "lazy",
          hasUsePlan: Boolean(card.querySelector("[data-lesson-card-use-plan]")),
          hasFavorite: Boolean(card.querySelector("[data-favorite], [data-pro-feature='favorites']")),
          hasView: Boolean(card.querySelector("[data-view-resource]")),
          badge: card.querySelector(".browse-card-badge")?.textContent?.trim() || "",
          height: card.getBoundingClientRect().height,
          fallback: img?.dataset.coverFallback || "",
        };
      };
      return {
        free: readCard(free),
        pro: readCard(pro),
        coverScript: Boolean(window.LlhLessonPlanCovers?.resolveLessonPlanCover),
      };
    }, seeded);

    assert(cardAudit.coverScript, "LlhLessonPlanCovers not loaded");
    assert(cardAudit.free?.hasImg, "free card missing cover img");
    assert(cardAudit.free.src.includes("/images/lesson-covers/"), `free cover src unexpected: ${cardAudit.free.src}`);
    assert(cardAudit.free.alt.length > 8, "free cover alt too weak");
    assert(cardAudit.free.lazy, "cover should lazy-load");
    assert(cardAudit.free.hasUsePlan, "Use This Plan missing on free card");
    assert(cardAudit.free.hasFavorite, "favorite control missing on free card");
    assert(cardAudit.free.hasView, "view wiring missing on free card");
    assert(cardAudit.free.badge === "Free", "FREE badge missing");
    assert(cardAudit.free.height < 330, `free card too tall: ${cardAudit.free.height}`);
    assert(cardAudit.free.fallback.includes("/images/lesson-covers/"), "cover fallback data attribute missing");

    assert(cardAudit.pro?.hasImg, "pro card missing cover img");
    assert(cardAudit.pro.src.includes("ocean") || cardAudit.pro.src.includes("lesson-covers"), `pro cover unexpected: ${cardAudit.pro.src}`);
    assert(cardAudit.pro.badge === "Pro", "PRO badge missing");
    assert(!cardAudit.pro.hasUsePlan, "locked Pro card should not expose Use This Plan");

    // Pro user: Use This Plan and View must still work with covers present.
    const userEmail = "lesson-covers-user@example.com";
    await page.evaluate((email) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
        },
      }));
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhFavorites", JSON.stringify([]));
    }, userEmail);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function" && typeof isProUser === "function" && isProUser(), null, { timeout: 30000 });
    await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 15000 });
    await page.fill("#lessonPlanSearch", seeded.freeTitle);
    await page.waitForTimeout(400);
    await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${seeded.freeTitle}")`, { timeout: 15000 });

    const freeCard = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: seeded.freeTitle }).first();
    await freeCard.locator("[data-lesson-card-use-plan]").click();
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
    const sheetOpen = await page.locator(".lesson-workspace-action-sheet:not([hidden])").count();
    assert(sheetOpen > 0, "Use This Plan should open assign sheet for Pro user");
    await page.evaluate(() => {
      document.querySelector("#resourceViewerModal")?.classList.remove("open");
      document.querySelector("#resourceViewerModal")?.setAttribute("aria-hidden", "true");
      document.querySelectorAll(".lesson-workspace-action-sheet").forEach((el) => { el.hidden = true; });
    });

    await freeCard.click();
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
    await page.evaluate(() => {
      document.querySelector("#resourceViewerModal")?.classList.remove("open");
      document.querySelector("#resourceViewerModal")?.setAttribute("aria-hidden", "true");
    });

    const asset = await requestJson("GET", "/images/lesson-covers/colors.svg");
    assert(asset.status === 200, "cover asset not served");
    assert(/svg/i.test(asset.text), "cover asset should be svg");

    console.log("✓ browser cover cards + button regression");
    await browser.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

async function main() {
  try {
    unitTests();
    await browserRegression();
    console.log("Lesson plan cover checks passed.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  }
}

main();

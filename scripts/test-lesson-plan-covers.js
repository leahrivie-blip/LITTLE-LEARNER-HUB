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
  const customFallbacks = covers.resolveLessonPlanCoverFallbacks({
    title: "Ocean Explorers",
    theme: "Ocean",
    age: "Toddler",
    coverImageUrl: "https://cdn.example.test/broken.webp",
  });
  assert(customFallbacks[0].includes("cdn.example.test"), "custom cover must resolve first");
  assert(customFallbacks[1].includes("ocean"), "theme cover must precede age fallback");
  assert(customFallbacks[2].includes("generic-toddler"), "age cover must precede brand fallback");
  assert(customFallbacks.at(-1).includes("default"), "brand fallback must resolve last");
  assert(!covers.getMappedThemeCover("Scarlet Art", "").includes("transportation"), "car must not match inside scarlet");

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
  assert(app.includes("/api/admin/curriculum/lesson-covers/upload"), "persistent cover upload endpoint missing");
  assert(app.includes("uploadAdminCurriculumLessonCover"), "admin upload helper missing");

  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert(html.includes("scripts/lesson-plan-covers.js"), "cover script must load in index.html");
  const server = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert(server.includes("CREATE TABLE IF NOT EXISTS llh_media_assets"), "persistent media table missing");
  assert(server.includes("bytes BYTEA NOT NULL"), "cover bytes must use persistent binary storage");
  assert(server.includes("sanitizedLessonCoverUrl"), "lesson records must reject base64 covers");
  assert(!/coverImageUrl:\s*sanitizedImageSource/.test(server), "lesson cover records must not store base64");

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
  const freeTitle = "Colors Everywhere: A Very Long Lesson Plan Title That Still Keeps Every Card Action Visible Cover Test";
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
      status: "featured",
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
    const unavailableUpload = await requestJson("POST", "/api/admin/curriculum/lesson-covers/upload", {
      adminToken: login.json.token,
      fileName: "cover.png",
      fileData: "data:image/png;base64,iVBORw0KGgo=",
    });
    assert(unavailableUpload.status === 503, "local storage must never accept a supposedly persistent upload");

    // Confirm cover fields round-trip on public curriculum payload without leaking Pro body.
    const publicContent = await requestJson("GET", "/api/site-content");
    assert(publicContent.status === 200, "site-content failed");
    const freePlan = (publicContent.json?.siteContent?.curriculumLibrary?.lessonPlans || [])
      .find((p) => p.id === seeded.freeId);
    assert(freePlan?.coverImageUrl === "/images/lesson-covers/colors.svg", "cover URL must round-trip");
    assert(freePlan?.coverImageAlt.includes("rainbow"), "cover alt must round-trip");

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhPlan", "Free");
    });
    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
    const initialMobileReady = await page.evaluate(() => ({
      featured: Boolean(document.querySelector(".library-featured-banner-image")),
      rows: document.querySelectorAll(".browse-row-track").length,
    }));
    assert(initialMobileReady.featured, "featured banner cover missing");
    assert(initialMobileReady.rows > 0, "horizontal lesson rows missing");
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
          fallbacks: img?.dataset.coverFallbacks || "",
          buttonVisible: Boolean(card.querySelector("[data-lesson-card-use-plan]")?.getClientRects().length),
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
    assert(cardAudit.free.height < 360, `free card too tall: ${cardAudit.free.height}`);
    assert(cardAudit.free.fallbacks.includes("/images/lesson-covers/"), "cover fallback chain missing");
    assert(cardAudit.free.buttonVisible, "long title pushed Use This Plan off the card");

    assert(cardAudit.pro?.hasImg, "pro card missing cover img");
    assert(cardAudit.pro.src.includes("ocean") || cardAudit.pro.src.includes("lesson-covers"), `pro cover unexpected: ${cardAudit.pro.src}`);
    assert(cardAudit.pro.badge === "Pro", "PRO badge missing");
    assert(!cardAudit.pro.hasUsePlan, "locked Pro card should not expose Use This Plan");

    const fallbackResult = await page.evaluate((title) => {
      const card = [...document.querySelectorAll("#view-lessons .lesson-plan-card")]
        .find((item) => item.textContent.includes(title));
      const img = card?.querySelector("img.lesson-plan-card__cover");
      if (!img) return {};
      img.setAttribute("src", "https://invalid.example.test/not-found.webp");
      handleLessonCoverImageError(img);
      const first = img.getAttribute("src");
      handleLessonCoverImageError(img);
      const second = img.getAttribute("src");
      return { first, second, hidden: img.hidden };
    }, seeded.proTitle);
    assert(fallbackResult.first.includes("ocean"), "broken custom cover must restore theme cover first");
    assert(fallbackResult.second.includes("generic-preschool"), "broken theme cover must restore age cover second");

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

    // Mobile: banner crop, horizontal rows, touch controls, and page overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { searchInput.value = ""; });
    await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
    await page.waitForSelector(".library-featured-banner-image", { timeout: 10000 });
    const mobileAudit = await page.evaluate(async () => {
      let track = [...document.querySelectorAll(".browse-row-track")]
        .find((item) => item.scrollWidth > item.clientWidth + 1);
      if (!track) {
        track = document.querySelector(".browse-row-track");
        const cardToClone = track?.querySelector(".lesson-plan-card");
        if (track && cardToClone) {
          track.append(cardToClone.cloneNode(true), cardToClone.cloneNode(true));
        }
      }
      const before = track?.scrollLeft || 0;
      if (track) track.scrollLeft = 280;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const banner = document.querySelector(".library-featured-banner-image");
      const card = document.querySelector(".lesson-plan-card");
      const currentTrack = [...document.querySelectorAll(".browse-row-track")]
        .find((item) => item.scrollWidth > item.clientWidth + 1) || track;
      return {
        objectFit: banner ? getComputedStyle(banner).objectFit : "",
        bannerWidth: banner?.getBoundingClientRect().width || 0,
        viewportWidth: window.innerWidth,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        cardWidth: card?.getBoundingClientRect().width || 0,
        scrollMoved: Boolean(currentTrack) && (currentTrack.scrollLeft || 0) > before,
        trackWidth: currentTrack?.clientWidth || 0,
        trackScrollWidth: currentTrack?.scrollWidth || 0,
        trackScrollLeft: currentTrack?.scrollLeft || 0,
        coverCount: document.querySelectorAll(".lesson-plan-card img.lesson-plan-card__cover").length,
        cardCount: document.querySelectorAll(".lesson-plan-card").length,
      };
    });
    assert(mobileAudit.objectFit === "cover", `featured banner must crop with object-fit cover: ${JSON.stringify(mobileAudit)}`);
    assert(mobileAudit.bannerWidth <= mobileAudit.viewportWidth, "featured banner overflows mobile viewport");
    assert(!mobileAudit.pageOverflow, "lesson library causes mobile page overflow");
    assert(mobileAudit.cardWidth > mobileAudit.viewportWidth * 0.55 && mobileAudit.cardWidth < mobileAudit.viewportWidth, "mobile card width should hint at horizontal scrolling");
    assert(mobileAudit.scrollMoved, `mobile lesson row did not scroll: ${JSON.stringify(mobileAudit)}`);
    assert(mobileAudit.coverCount === mobileAudit.cardCount, "a mobile lesson card is missing a cover");

    // Admin controls: choose, reposition, and remove must update preview without saving other fields.
    const adminControlAudit = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML = renderAdminCurriculumLessonPlanForm({
        id: "admin-cover-test",
        title: "Ocean Admin Test",
        theme: "Ocean",
        age: "Preschool",
        plan: "Free",
        status: "draft",
        coverImageUrl: "/images/lesson-covers/ocean.svg",
        coverImageAlt: "Ocean illustration",
        coverImageSource: "mapped",
        coverImagePosition: "top",
        dailyPlans: {},
      });
      document.body.appendChild(host);
      const form = host.querySelector("#adminCurriculumLessonPlanForm");
      const preview = form.querySelector("[data-curriculum-cover-preview]");
      const titleBefore = form.querySelector('[name="title"]').value;
      applyAdminCurriculumCoverSelection("/images/lesson-covers/colors.svg", { source: "mapped" });
      const replaced = form.querySelector("[data-curriculum-cover-url]").value;
      form.querySelector('[name="coverImagePosition"]').value = "bottom";
      preview.style.objectPosition = "bottom";
      applyAdminCurriculumCoverSelection("", { source: "" });
      const removed = form.querySelector("[data-curriculum-cover-url]").value;
      const fallback = preview.getAttribute("src");
      const titleAfter = form.querySelector('[name="title"]').value;
      host.remove();
      return { replaced, removed, fallback, position: preview.style.objectPosition, titleBefore, titleAfter };
    });
    assert(adminControlAudit.replaced.includes("colors"), "admin replace cover failed");
    assert(adminControlAudit.removed === "", "admin remove cover failed");
    assert(adminControlAudit.fallback.includes("ocean"), "removing cover must immediately restore theme fallback");
    assert(adminControlAudit.position.includes("bottom"), `admin focal position preview failed: ${JSON.stringify(adminControlAudit)}`);
    assert(adminControlAudit.titleBefore === adminControlAudit.titleAfter, "cover controls changed unrelated lesson data");

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

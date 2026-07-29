#!/usr/bin/env node
/**
 * Curriculum Collections regression — series grouping + Lesson Plans browse wiring.
 * Run: node scripts/test-curriculum-collections.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const seriesApi = require("./curriculum-series.js");

const results = [];
function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unitGrouping() {
  const infant = seriesApi.normalizedCurriculumSeries({
    id: "cur-series-infant-family-connections",
    collectionKey: "family-connections",
    collectionTitle: "Family Connections",
    title: "Family Connections — Infant",
    theme: "Family Connections",
    age: "Infant",
    plan: "Pro",
    status: "published",
    featured: true,
    weekCount: 4,
    coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
    coverImageSource: "mapped",
    weeks: [
      { weekNumber: 1, lessonPlanId: "lp-w1", label: "Week 1: The People Who Love Me" },
      { weekNumber: 2, lessonPlanId: "lp-w2", label: "Week 2: My Home & My Family" },
      { weekNumber: 3, lessonPlanId: "lp-w3", label: "Week 3: Caring Hearts" },
      { weekNumber: 4, lessonPlanId: "lp-w4", label: "Week 4: We Belong Together" },
    ],
  });
  const toddler = seriesApi.normalizedCurriculumSeries({
    id: "cur-series-toddler-family-connections",
    collectionKey: "family-connections",
    collectionTitle: "Family Connections",
    title: "Family Connections — Toddler",
    theme: "Family Connections",
    age: "Toddler",
    plan: "Pro",
    status: "published",
    weekCount: 4,
    coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
    weeks: [
      { weekNumber: 1, lessonPlanId: "lp-t1", label: "Week 1" },
      { weekNumber: 2, lessonPlanId: "lp-t2", label: "Week 2" },
    ],
  });
  const apples = seriesApi.normalizedCurriculumSeries({
    id: "cur-series-preschool-apples",
    collectionKey: "apples",
    collectionTitle: "Apples",
    title: "Apples — Preschool",
    age: "Preschool",
    plan: "Free",
    status: "published",
    weekCount: 4,
    coverImageUrl: "/images/lesson-covers/amazing-apples.jpg",
    weeks: [{ weekNumber: 1, lessonPlanId: "lp-a1", label: "Week 1" }],
  });
  const draft = seriesApi.normalizedCurriculumSeries({
    id: "cur-series-draft",
    collectionKey: "halloween",
    title: "Halloween — Infant",
    age: "Infant",
    status: "draft",
    weeks: [{ weekNumber: 1, lessonPlanId: "lp-h1" }],
  });

  assert(infant.collectionKey === "family-connections", "collectionKey persisted");
  assert(infant.collectionTitle === "Family Connections", "collectionTitle persisted");

  const collections = seriesApi.groupSeriesIntoCollections([infant, toddler, apples, draft]);
  assert(collections.length === 2, `expected 2 public collections, got ${collections.length}`);
  const family = collections.find((c) => c.key === "family-connections");
  assert(family, "family connections collection missing");
  assert(family.ageOrder.join(",") === "Infant,Toddler", `age order ${family.ageOrder}`);
  assert(family.totalWeeks === 6, `total weeks ${family.totalWeeks}`);
  assert(family.ages.Infant.filledWeekCount === 4, "infant weeks");
  assert(family.ages.Toddler.filledWeekCount === 2, "toddler weeks");
  assert(family.plan === "Pro", "collection plan should be Pro if any track is Pro");
  assert(family.coverImageUrl.includes("all-about-me"), "collection cover");
  assert(!collections.some((c) => c.key === "halloween"), "drafts must not appear");

  const derived = seriesApi.normalizedCurriculumSeries({
    id: "cur-series-derived",
    title: "Back to School — Preschool",
    age: "Preschool",
    status: "published",
    weeks: [{ weekNumber: 1, lessonPlanId: "x" }],
  });
  assert(derived.collectionKey === "back-to-school", `derived key ${derived.collectionKey}`);
  assert(derived.collectionTitle === "Back to School", `derived title ${derived.collectionTitle}`);
  pass("Series grouping into multi-age collections");
}

function staticWiring() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles/llh-library-browse.css"), "utf8");
  assert(/curriculum-series\.js/.test(indexHtml), "curriculum-series.js must load in index.html");
  assert(/function curriculumCollections/.test(appJs), "curriculumCollections helper missing");
  assert(/function openCurriculumCollection/.test(appJs), "openCurriculumCollection missing");
  assert(/data-open-curriculum-collection/.test(appJs), "collection open wiring missing");
  assert(/Curriculum Collections/.test(appJs), "collections browse row missing");
  assert(/series: Array\.isArray\(fromPublic\.series\)/.test(appJs) || /series: Array\.isArray\(fromPublic\?\.series\)/.test(appJs) || /series: Array\.isArray\(fromPublic\.series\)/.test(appJs.replace(/\s+/g, " ")) || appJs.includes("series: Array.isArray(fromPublic.series)"), "library must keep series");
  assert(appJs.includes("series: Array.isArray(fromPublic.series) ? fromPublic.series : []"), "effectiveCurriculumLibrary must pass series");
  assert(/curriculum-collection-detail/.test(css), "collection detail styles missing");
  // Existing browse paths remain.
  assert(/function buildLessonBrowseRows/.test(appJs), "browse rows intact");
  assert(/function lessonPlanCard/.test(appJs), "lesson cards intact");
  assert(/function featuredLessonBannerHtml/.test(appJs), "featured banner intact");
  pass("Static Lesson Plans + collections wiring");
}

async function integrationImport() {
  const proc = spawn(process.execPath, ["scripts/import-infant-family-connections.js"], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (c) => { stdout += String(c); });
  proc.stderr.on("data", (c) => { stderr += String(c); });
  const code = await new Promise((resolve) => proc.on("exit", resolve));
  assert(code === 0, `import exit ${code}\n${stderr}\n${stdout}`);
  assert(/Family Connections collection published/.test(stdout), "collection publish confirmation missing");
  assert(/collectionKey=family-connections/.test(stdout), "collection key missing in output");
  pass("Family Connections import + collection publish", "local end-to-end");
}

async function browserSmoke() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.log("⏭ playwright unavailable; skipped browser collections smoke");
    return;
  }

  // Reuse a tiny local server with one collection already imported via API.
  const PORT = 19970 + Math.floor(Math.random() * 20);
  const STORE = path.join(os.tmpdir(), `llh-collections-ui-${crypto.randomBytes(3).toString("hex")}.json`);
  fs.writeFileSync(STORE, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const ADMIN = { email: "collections-ui@test.local", password: "collections-ui-pass", code: "collections-ui-code" };
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const requestJson = (method, urlPath, body) => new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });

  let browser;
  try {
    for (let i = 0; i < 80; i += 1) {
      if (child.exitCode !== null) throw new Error("server exited");
      try {
        const health = await requestJson("GET", "/api/health");
        if (health.status === 200) break;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = login.json.token;
    const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    // Seed one published plan + series (minimal) using Family Connections week 1 file through pipeline is heavy;
    // instead create a tiny published plan via admin API and link series.
    const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
    const sample = fs.readFileSync(path.join(ROOT, "scripts/curriculum-infant-family-connections-imports/01-infant-the-people-who-love-me-pro.txt"), "utf8");
    const parsed = parseCurriculumLessonPlanImport(sample);
    assert(parsed.ok, parsed.errors?.join("; ") || "parse failed");
    const planId = "cur-lp-collections-ui-week1";
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: site.json.siteContent?.updatedAt || "",
      lessonPlan: {
        ...parsed.data,
        id: planId,
        status: "published",
        plan: "Pro",
        coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
        coverImageSource: "mapped",
      },
    });
    assert(savePlan.status === 200, `plan save ${savePlan.status} ${savePlan.text}`);
    const seriesSave = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt: savePlan.json.siteContentUpdatedAt,
      series: {
        id: "cur-series-collections-ui-family",
        collectionKey: "family-connections",
        collectionTitle: "Family Connections",
        title: "Family Connections — Infant",
        theme: "Family Connections",
        age: "Infant",
        plan: "Pro",
        status: "published",
        featured: true,
        weekCount: 4,
        coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
        coverImageSource: "mapped",
        weeks: [
          { weekNumber: 1, lessonPlanId: planId, label: "Week 1: The People Who Love Me" },
          { weekNumber: 2, lessonPlanId: planId, label: "Week 2 placeholder" },
          { weekNumber: 3, lessonPlanId: planId, label: "Week 3 placeholder" },
          { weekNumber: 4, lessonPlanId: planId, label: "Week 4 placeholder" },
        ],
      },
    });
    // Same plan linked to multiple weeks fails validation — fall back to progressive publish (week 1 only).
    let stamp = seriesSave.status === 200
      ? seriesSave.json.siteContentUpdatedAt
      : savePlan.json.siteContentUpdatedAt;
    if (seriesSave.status !== 200) {
      const seriesSave2 = await requestJson("POST", "/api/admin/curriculum/series", {
        adminToken: token,
        expectedUpdatedAt: stamp,
        series: {
          id: "cur-series-collections-ui-family",
          collectionKey: "family-connections",
          collectionTitle: "Family Connections",
          title: "Family Connections — Infant",
          theme: "Family Connections",
          age: "Infant",
          plan: "Pro",
          status: "published",
          featured: true,
          weekCount: 4,
          coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
          coverImageSource: "mapped",
          weeks: [
            { weekNumber: 1, lessonPlanId: planId, label: "Week 1: The People Who Love Me" },
          ],
        },
      });
      // Progressive publish: weekCount 4 with only some weeks linked is allowed.
      assert(seriesSave2.status === 200, `expected progressive single-week publish ${seriesSave2.status} ${seriesSave2.text}`);
      stamp = seriesSave2.json.siteContentUpdatedAt;
    }

    // Create 3 additional stub copies for weeks 2-4
    const weekIds = [planId];
    for (let week = 2; week <= 4; week += 1) {
      const id = `cur-lp-collections-ui-week${week}`;
      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt: stamp,
        lessonPlan: {
          ...parsed.data,
          id,
          title: `Family Connections UI Week ${week}`,
          status: "published",
          plan: "Pro",
          coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
          coverImageSource: "mapped",
        },
      });
      assert(save.status === 200, `week ${week} save failed ${save.status} ${save.text}`);
      stamp = save.json.siteContentUpdatedAt;
      weekIds.push(id);
    }
    const finalSeries = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      series: {
        id: "cur-series-collections-ui-family",
        collectionKey: "family-connections",
        collectionTitle: "Family Connections",
        title: "Family Connections — Infant",
        theme: "Family Connections",
        age: "Infant",
        plan: "Pro",
        status: "published",
        featured: true,
        weekCount: 4,
        coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
        coverImageSource: "mapped",
        weeks: weekIds.map((id, index) => ({
          weekNumber: index + 1,
          lessonPlanId: id,
          label: `Week ${index + 1}`,
        })),
      },
    });
    assert(finalSeries.status === 200, `series save failed ${finalSeries.status} ${finalSeries.text}`);

    const publicLib = await requestJson("GET", "/api/site-content");
    const publicSeries = publicLib.json.siteContent?.curriculumLibrary?.series || [];
    assert(publicSeries.some((s) => s.collectionKey === "family-connections"), "public series missing");

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function" && typeof curriculumCollections === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhPlan", "Pro");
      // Ensure Pro-looking access for opening weeks in UI smoke.
      if (typeof currentUser !== "undefined") {
        try { currentUser = { ...(currentUser || {}), plan: "Pro", email: "pro@test.local" }; } catch { /* ignore */ }
      }
    });
    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 15000 });
    await page.waitForFunction(() => (curriculumCollections() || []).length > 0, null, { timeout: 20000 });
    const hasCollectionCard = await page.waitForSelector("[data-open-curriculum-collection='family-connections']", { timeout: 15000 });
    assert(hasCollectionCard, "collection card missing");
    // Existing individual lesson cards/rows should still render.
    const hasLessonCardsOrRows = await page.evaluate(() => (
      document.querySelectorAll("#view-lessons .lesson-plan-card, #view-lessons .browse-row").length > 0
    ));
    assert(hasLessonCardsOrRows, "existing lesson browse should remain");
    await page.click("[data-open-curriculum-collection='family-connections']");
    await page.waitForSelector(".curriculum-collection-detail", { timeout: 10000 });
    const detail = await page.evaluate(() => ({
      title: document.querySelector(".curriculum-collection-detail-copy h3")?.textContent || "",
      weeks: document.querySelectorAll(".curriculum-collection-week").length,
      ageBlocks: document.querySelectorAll(".curriculum-collection-age-block").length,
    }));
    assert(/Family Connections/i.test(detail.title), `detail title ${detail.title}`);
    assert(detail.weeks >= 4, `expected 4 weeks, got ${detail.weeks}`);
    assert(detail.ageBlocks >= 1, "age block missing");
    pass("Browser collections browse + detail", `${detail.weeks} weeks`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } resolve(); }, 3000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.rmSync(STORE, { force: true }); } catch { /* ignore */ }
  }
}

async function main() {
  try { unitGrouping(); } catch (error) { fail("Unit grouping", error.message); }
  try { staticWiring(); } catch (error) { fail("Static wiring", error.message); }
  try { await integrationImport(); } catch (error) { fail("Integration import", error.message); }
  try { await browserSmoke(); } catch (error) { fail("Browser smoke", error.message); }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSummary: ${results.filter((r) => r.ok).length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

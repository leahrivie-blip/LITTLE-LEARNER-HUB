#!/usr/bin/env node
/**
 * Family Connections Infant Weeks 1–4 final QA (no production writes).
 *
 * Confirms:
 * - Weeks complete, ordered, Pro format
 * - Covers illustrated + present
 * - Collection detail, open week, print, search, filters, favorites, Pro access
 * - Importer idempotent (second run creates no duplicate plans/series)
 * - Collection remains ready for Toddler/Preschool tracks later
 *
 * Run: node scripts/verify-family-connections-infant-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/family-connections-qa";
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const REQUIRED_WEEKLY = [
  "title", "age", "theme", "weeklyOverview", "objectives", "weeklyMaterials",
  "vocabularyWords", "books", "songs", "familyConnection", "observationOpportunities", "adaptations",
];
const EXPECTED_WEEKS = [
  "The People Who Love Me",
  "My Home & My Family",
  "Caring Hearts",
  "We Belong Together",
];

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 120000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

function countDayItems(plan) {
  return WEEKDAYS.reduce((sum, day) => sum + ((plan?.dailyPlans?.[day]?.items || []).length), 0);
}

function assertFullProFormat(plan, label) {
  assert(plan.plan === "Pro", `${label}: expected Pro, got ${plan.plan}`);
  assert(/infant/i.test(plan.age || ""), `${label}: expected Infant age`);
  assert(plan.status === "published" || plan.status === "featured", `${label}: not published`);
  for (const key of REQUIRED_WEEKLY) {
    const value = plan[key];
    const ok = Array.isArray(value) ? value.length > 0 : Boolean(String(value || "").trim());
    assert(ok, `${label}: missing ${key}`);
  }
  assert((plan.learningDomains || []).length > 0, `${label}: learning domains missing`);
  const days = WEEKDAYS.filter((day) => (plan.dailyPlans?.[day]?.items || []).some((item) => String(item?.title || "").trim()));
  assert(days.length === 5, `${label}: incomplete weekdays (${days.join(",")})`);
  assert(countDayItems(plan) >= 10, `${label}: expected rich activity set, got ${countDayItems(plan)}`);
  for (const day of WEEKDAYS) {
    const dayPlan = plan.dailyPlans?.[day] || {};
    assert(String(dayPlan.theme || dayPlan.circleTime || "").trim() || (dayPlan.items || []).length, `${label}: ${day} empty`);
  }
  const cover = String(plan.coverImageUrl || "");
  assert(cover.includes("/images/lesson-covers/"), `${label}: cover missing`);
  assert(fs.existsSync(path.join(ROOT, cover.replace(/^\//, ""))), `${label}: cover file missing ${cover}`);
  assert(cover.endsWith(".jpg") || cover.endsWith(".svg"), `${label}: unexpected cover type ${cover}`);
}

async function main() {
  ensureDir(ARTIFACT_DIR);
  const PORT = 19840 + Math.floor(Math.random() * 40);
  const STORE = path.join(os.tmpdir(), `llh-fc-qa-${crypto.randomBytes(4).toString("hex")}.json`);
  const ADMIN = {
    email: "fc-qa@test.local",
    password: "fc-qa-pass",
    code: "fc-qa-code",
  };
  fs.writeFileSync(STORE, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));

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

  let browser;
  try {
    for (let i = 0; i < 100; i += 1) {
      if (child.exitCode !== null) throw new Error("server exited early");
      try {
        const health = await requestJson(PORT, "GET", "/api/health");
        if (health.status === 200) break;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 200));
    }

    const env = {
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    };

    // First import
    let first = spawnSync(process.execPath, ["scripts/import-infant-family-connections.js"], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    assert(first.status === 0, `first import failed:\n${first.stderr}\n${first.stdout}`);
    pass("First Family Connections import");

    const login = await requestJson(PORT, "POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, "admin login");
    const token = login.json.token;
    const afterFirst = await requestJson(PORT, "GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const plans1 = (afterFirst.json.siteContent?.curriculum?.lessonPlans || [])
      .filter((p) => /family connections|people who love|my home|caring hearts|we belong together/i.test(`${p.title} ${p.theme}`));
    const fcPlans1 = (afterFirst.json.siteContent?.curriculum?.lessonPlans || [])
      .filter((p) => String(p.id || "").includes("infant-family-connections") || EXPECTED_WEEKS.includes(p.title));
    const byTitle = Object.fromEntries(fcPlans1.map((p) => [p.title, p]));
    for (const title of EXPECTED_WEEKS) {
      assert(byTitle[title], `missing week: ${title}`);
      assertFullProFormat(byTitle[title], title);
    }
    // Order by series week numbers
    const seriesList1 = afterFirst.json.siteContent?.curriculum?.series || [];
    const infantSeries1 = seriesList1.find((s) => s.id === "cur-series-infant-family-connections");
    assert(infantSeries1, "infant series missing");
    assert(infantSeries1.collectionKey === "family-connections", "collectionKey");
    assert(infantSeries1.age === "Infant", "series age");
    const orderedTitles = (infantSeries1.weeks || [])
      .slice()
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((week) => (afterFirst.json.siteContent.curriculum.lessonPlans.find((p) => p.id === week.lessonPlanId) || {}).title);
    assert(JSON.stringify(orderedTitles) === JSON.stringify(EXPECTED_WEEKS), `week order ${orderedTitles.join(" | ")}`);
    pass("Infant Weeks 1–4 complete, ordered, full Pro format");

    // Covers
    for (const title of EXPECTED_WEEKS) {
      const cover = byTitle[title].coverImageUrl;
      assert(cover.includes("all-about-me.jpg") || cover.includes("/images/lesson-covers/"), `${title} cover ${cover}`);
    }
    assert(String(infantSeries1.coverImageUrl || "").includes("all-about-me.jpg"), "collection cover");
    pass("Covers present and illustrated-library style", infantSeries1.coverImageUrl);

    // Idempotent second import
    const second = spawnSync(process.execPath, ["scripts/import-infant-family-connections.js"], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    assert(second.status === 0, `second import failed:\n${second.stderr}\n${second.stdout}`);
    const afterSecond = await requestJson(PORT, "GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const plans2 = afterSecond.json.siteContent?.curriculum?.lessonPlans || [];
    const series2 = afterSecond.json.siteContent?.curriculum?.series || [];
    const fcPlanIds = plans2.filter((p) => EXPECTED_WEEKS.includes(p.title) && /infant/i.test(p.age || "")).map((p) => p.id);
    const uniqueTitles = new Set(plans2.filter((p) => EXPECTED_WEEKS.includes(p.title)).map((p) => `${p.title}::${p.age}`));
    assert(uniqueTitles.size === 4, `duplicate title/age after re-import: ${[...uniqueTitles]}`);
    assert(fcPlanIds.length === 4, `expected 4 infant FC plans, got ${fcPlanIds.length}`);
    assert(series2.filter((s) => s.collectionKey === "family-connections").length === 1, "duplicate family-connections series");
    assert(series2.filter((s) => s.id === "cur-series-infant-family-connections").length === 1, "duplicate series id");
    // No Toddler/Preschool tracks yet — collection remains Infant-only and extensible.
    assert(!series2.some((s) => s.collectionKey === "family-connections" && s.age === "Toddler"), "Toddler track must not exist yet");
    assert(!series2.some((s) => s.collectionKey === "family-connections" && s.age === "Preschool"), "Preschool track must not exist yet");
    pass("Importer idempotent — no duplicate plans/series");
    pass("Collection ready for Toddler/Preschool later", "same collectionKey=family-connections");

    // Public library + Pro access shaping
    const publicContent = await requestJson(PORT, "GET", "/api/site-content");
    const publicPlans = publicContent.json.siteContent?.curriculumLibrary?.lessonPlans || [];
    const publicSeries = publicContent.json.siteContent?.curriculumLibrary?.series || [];
    for (const title of EXPECTED_WEEKS) {
      const pub = publicPlans.find((p) => p.title === title);
      assert(pub, `public missing ${title}`);
      assert(pub.plan === "Pro" || pub.locked === true || pub.plan === "Pro", `public plan flag for ${title}`);
    }
    assert(publicSeries.some((s) => s.collectionKey === "family-connections"), "public collection series missing");
    pass("Public library exposes Pro weeks + collection");

    // Seed store users so Pro detail hydration matches production membership checks
    const proEmail = "fc-pro@test.local";
    const freeEmail = "fc-free@test.local";
    const storeNow = new Date().toISOString();
    const storeData = JSON.parse(fs.readFileSync(STORE, "utf8"));
    storeData.users = storeData.users || {};
    storeData.users[proEmail] = {
      email: proEmail,
      plan: "Pro",
      subscriptionStatus: "Pro Monthly Subscription Active",
      subscriptionStartedAt: storeNow,
      monthlyPrice: "$19.99/month",
      updatedAt: storeNow,
    };
    storeData.users[freeEmail] = {
      email: freeEmail,
      plan: "Free",
      subscriptionStatus: "Free Plan",
      updatedAt: storeNow,
    };
    fs.writeFileSync(STORE, JSON.stringify(storeData, null, 2));

    // Browser QA + screenshots
    const playwright = require("playwright");
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    // Guest/Free: collection visible, weeks locked/preview
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("llhPlan", "Free");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 15000 });
    await page.waitForSelector("[data-open-curriculum-collection='family-connections']", { timeout: 20000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "01-lesson-plans-collections-row.png"), fullPage: true });

    await page.click("[data-open-curriculum-collection='family-connections']");
    await page.waitForSelector(".curriculum-collection-detail", { timeout: 10000 });
    const detailMeta = await page.evaluate(() => ({
      title: document.querySelector(".curriculum-collection-detail-copy h3")?.textContent || "",
      ages: [...document.querySelectorAll(".curriculum-collection-age-header h3")].map((el) => el.textContent.trim()),
      weekLabels: [...document.querySelectorAll(".curriculum-collection-week h4")].map((el) => el.textContent.trim()),
      weekCount: document.querySelectorAll(".curriculum-collection-week").length,
      coverSrc: document.querySelector(".curriculum-collection-detail-cover")?.getAttribute("src") || "",
    }));
    assert(/Family Connections/i.test(detailMeta.title), `detail title ${detailMeta.title}`);
    assert(detailMeta.ages.includes("Infant"), "Infant age block missing");
    assert(!detailMeta.ages.includes("Toddler"), "Toddler must not appear yet");
    assert(!detailMeta.ages.includes("Preschool"), "Preschool must not appear yet");
    assert(detailMeta.weekCount === 4, `expected 4 weeks in UI, got ${detailMeta.weekCount}`);
    for (const title of EXPECTED_WEEKS) {
      assert(detailMeta.weekLabels.some((label) => label.includes(title) || title.includes(label) || label.startsWith("Week")), `week UI missing ${title}`);
    }
    // Exact title match preferred
    assert(EXPECTED_WEEKS.every((title) => detailMeta.weekLabels.includes(title)), `week titles ${detailMeta.weekLabels.join(" | ")}`);
    assert(/all-about-me\.jpg/.test(detailMeta.coverSrc), `collection cover src ${detailMeta.coverSrc}`);
    const coverStatus = await page.evaluate(async (src) => {
      const res = await fetch(src);
      return { ok: res.ok, status: res.status, type: res.headers.get("content-type") || "" };
    }, detailMeta.coverSrc);
    assert(coverStatus.ok && /image\//.test(coverStatus.type), `cover image failed: ${JSON.stringify(coverStatus)}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "02-family-connections-collection-detail.png"), fullPage: true });
    pass("Collection detail shows Infant Weeks 1–4 only");

    // Search still finds weeks
    await page.click('[data-lesson-library-mode="browse"]');
    await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
    await page.fill("#lessonPlanSearch", "Caring Hearts");
    await page.waitForTimeout(400);
    const searchHit = await page.evaluate(() => [...document.querySelectorAll("#view-lessons .lesson-plan-card, [data-open-curriculum-collection]")]
      .some((el) => /Caring Hearts|Family Connections/i.test(el.textContent || "")));
    assert(searchHit, "search did not find Caring Hearts / collection");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "03-search-caring-hearts.png"), fullPage: true });
    pass("Search includes Family Connections content");

    // Age filter Infant still works with collections + plans
    await page.fill("#lessonPlanSearch", "");
    await page.click('button[data-filter="Infant"]');
    await page.waitForTimeout(300);
    const infantFilterOk = await page.evaluate(() => {
      const collection = document.querySelector("[data-open-curriculum-collection='family-connections']");
      const cards = [...document.querySelectorAll("#view-lessons .lesson-plan-card")];
      const nonInfant = cards.filter((card) => !/infant/i.test(card.textContent || ""));
      return Boolean(collection) && nonInfant.length === 0;
    });
    assert(infantFilterOk, "Infant filter broke collections/plans");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "04-filter-infant.png"), fullPage: true });
    pass("Infant age filter still works with collections");

    // Pro access: client + server membership so full Pro hydration works
    await page.evaluate((email) => {
      localStorage.clear();
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
    }, proEmail);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => null),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(
      () => typeof setView === "function" && typeof isProUser === "function" && isProUser(),
      null,
      { timeout: 30000 },
    );
    // Confirm authorized detail endpoint returns full daily plans for Pro store user
    const authDetail = await page.evaluate(async (id) => {
      const res = await fetch(`/api/curriculum/lesson-plans/${encodeURIComponent(id)}`, {
        headers: { Accept: "application/json", "X-LLH-User-Email": "fc-pro@test.local" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
      const filled = days.filter((day) => (data?.lessonPlan?.dailyPlans?.[day]?.items || []).length > 0);
      return { status: res.status, title: data?.lessonPlan?.title || "", filledDays: filled.length, objectives: (data?.lessonPlan?.objectives || []).length };
    }, infantSeries1.weeks.find((w) => w.weekNumber === 1).lessonPlanId);
    assert(authDetail.status === 200 && authDetail.filledDays === 5, `Pro detail hydrate failed: ${JSON.stringify(authDetail)}`);
    pass("Pro API returns full week content for store Pro user");

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("[data-open-curriculum-collection='family-connections']", { timeout: 15000 });
    await page.click("[data-open-curriculum-collection='family-connections']");
    await page.waitForSelector(".curriculum-collection-week", { timeout: 10000 });
    const openWeekLabel = await page.locator(".curriculum-collection-week .primary-button").first().textContent();
    assert(/Open Week/i.test(openWeekLabel || ""), `expected Open Week for Pro, got ${openWeekLabel}`);

    // Open week 1 and wait for hydrated Pro content (not the syncing error)
    const week1Id = infantSeries1.weeks.find((w) => w.weekNumber === 1).lessonPlanId;
    await page.click(`.curriculum-collection-week [data-view-resource="${week1Id}"]`);
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 });
    await page.waitForFunction(() => {
      const text = document.querySelector("#resourceViewerBody")?.innerText || "";
      return text
        && !/Loading resource/i.test(text)
        && !/couldn.?t load the full Pro lesson content/i.test(text)
        && /The People Who Love Me/i.test(text);
    }, null, { timeout: 20000 });
    const viewerOk = await page.evaluate(() => {
      const body = document.querySelector("#resourceViewerBody")?.innerText || "";
      return {
        hasTitle: /The People Who Love Me/i.test(body),
        hasObjectives: /Build secure relationships|Learning Objectives|Objectives/i.test(body),
        hasDayOrPlan: /Monday|Plan|Activities|Materials|Weekly Overview/i.test(body),
        blocked: /couldn.?t load the full Pro lesson content/i.test(body),
      };
    });
    assert(viewerOk.hasTitle && !viewerOk.blocked && (viewerOk.hasObjectives || viewerOk.hasDayOrPlan), `week 1 incomplete: ${JSON.stringify(viewerOk)}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "05-week1-open.png"), fullPage: true });
    pass("Week 1 opens from collection (Pro)");

    // Print: full Pro HTML for all 4 weeks + in-viewer print control when present
    const viewerRender = require("./curriculum-lesson-viewer-render.js");
    for (const title of EXPECTED_WEEKS) {
      const plan = byTitle[title];
      const printHtml = viewerRender.renderCurriculumLessonPlanHtml(plan, { mode: "print" });
      assert(printHtml && printHtml.length > 500, `${title}: print HTML too short`);
      const titleEscaped = title.replace(/&/g, "&amp;");
      assert(
        printHtml.includes(title) || printHtml.includes(titleEscaped) || printHtml.includes(plan.title),
        `${title}: print missing title`,
      );
      assert(/monday|Monday|curriculum-print/i.test(printHtml), `${title}: print missing day structure`);
      if (title === "The People Who Love Me") {
        fs.writeFileSync(path.join(ARTIFACT_DIR, "week1-print-snippet.html"), printHtml.slice(0, 4000));
      }
    }
    const printControl = await page.locator("[data-print-resource], button:has-text('Print'), button:has-text('Download')").count();
    assert(printControl > 0, "print/download controls missing in viewer");
    pass("Print layout renders for Weeks 1–4");

    // Close viewer, then favorite a week from browse library
    await page.evaluate(() => {
      document.querySelector("#resourceViewerModal")?.classList.remove("open");
      document.querySelector("#resourceViewerModal")?.setAttribute("aria-hidden", "true");
    });
    await page.evaluate(() => {
      lessonLibraryMode = "browse";
      lessonLibraryCollectionKey = "";
      setView("lessons");
    });
    await page.fill("#lessonPlanSearch", "Caring Hearts");
    await page.waitForTimeout(500);
    await page.waitForSelector("#view-lessons .lesson-plan-card", { timeout: 15000 });
    const favBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("llhFavorites") || "[]"));
    const favBtn = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: "Caring Hearts" }).locator("[data-favorite]").first();
    assert(await favBtn.count(), "favorite control missing on Caring Hearts card");
    await favBtn.click();
    await page.waitForTimeout(300);
    const favAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("llhFavorites") || "[]"));
    assert(favAfter.length >= favBefore.length + 1 || favAfter.some((id) => String(id).includes("caring")), `favorites did not update: ${JSON.stringify(favAfter)}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "05b-favorite-caring-hearts.png"), fullPage: true });
    pass("Favorites work for Family Connections weeks");

    // Screenshot remaining weeks via collection detail
    await page.evaluate(() => {
      if (typeof searchInput !== "undefined" && searchInput) searchInput.value = "";
      const search = document.querySelector("#lessonPlanSearch");
      if (search) search.value = "";
      lessonLibraryMode = "browse";
      lessonLibraryCollectionKey = "";
      activeFilter = "All";
      setView("lessons");
    });
    await page.waitForSelector("[data-open-curriculum-collection='family-connections']", { timeout: 15000 });
    await page.click("[data-open-curriculum-collection='family-connections']");
    await page.waitForSelector(".curriculum-collection-detail", { timeout: 10000 });
    for (let week = 1; week <= 4; week += 1) {
      const id = infantSeries1.weeks.find((w) => w.weekNumber === week).lessonPlanId;
      const title = EXPECTED_WEEKS[week - 1];
      await page.click(`.curriculum-collection-week [data-view-resource="${id}"]`);
      await page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 });
      await page.waitForFunction((expectedTitle) => {
        const text = document.querySelector("#resourceViewerBody")?.innerText || "";
        return text
          && !/Loading resource/i.test(text)
          && !/couldn.?t load the full Pro lesson content/i.test(text)
          && text.includes(expectedTitle);
      }, title, { timeout: 20000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `06-week${week}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`), fullPage: true });
      await page.evaluate(() => {
        document.querySelector("#resourceViewerModal")?.classList.remove("open");
        document.querySelector("#resourceViewerModal")?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("resource-viewer-open");
        if (typeof openCurriculumCollection === "function") openCurriculumCollection("family-connections");
      });
      await page.waitForSelector(".curriculum-collection-detail", { timeout: 10000 });
    }
    pass("Screenshots captured for collection + Weeks 1–4");

    // Pro access: Free user still sees gated Preview on Pro weeks
    await page.evaluate((email) => {
      localStorage.clear();
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" },
      }));
      localStorage.setItem("llhPlan", "Free");
    }, freeEmail);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      lessonLibraryMode = "browse";
      lessonLibraryCollectionKey = "";
      setView("lessons");
    });
    await page.fill("#lessonPlanSearch", "We Belong Together");
    await page.waitForTimeout(500);
    const proGate = await page.evaluate(() => {
      const card = [...document.querySelectorAll("#view-lessons .lesson-plan-card")].find((el) => /We Belong Together/i.test(el.textContent || ""));
      if (!card) return { found: false };
      return {
        found: true,
        hasProBadge: /Pro/i.test(card.textContent || ""),
        locked: card.classList.contains("locked") || /Preview|Upgrade|Pro/i.test(card.textContent || ""),
      };
    });
    assert(proGate.found, "Pro week not found in search for Free user");
    assert(proGate.hasProBadge || proGate.locked, `Pro access gate weak: ${JSON.stringify(proGate)}`);

    // Collection week buttons should say Preview for Free
    await page.fill("#lessonPlanSearch", "");
    await page.click("[data-open-curriculum-collection='family-connections']");
    await page.waitForSelector(".curriculum-collection-detail", { timeout: 10000 });
    const previewCount = await page.locator(".curriculum-collection-week .ghost-button").count();
    assert(previewCount === 4, `expected 4 Preview buttons for Free, got ${previewCount}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "07-pro-access-free-user.png"), fullPage: true });
    pass("Pro access still gated for Free users");

    // Extensibility smoke: groupSeriesIntoCollections accepts Toddler/Preschool later
    const seriesApi = require("./curriculum-series.js");
    const infant = seriesApi.normalizedCurriculumSeries(infantSeries1);
    const toddlerStub = seriesApi.normalizedCurriculumSeries({
      id: "cur-series-toddler-family-connections",
      collectionKey: "family-connections",
      collectionTitle: "Family Connections",
      title: "Family Connections — Toddler",
      age: "Toddler",
      plan: "Pro",
      status: "published",
      weekCount: 4,
      weeks: [{ weekNumber: 1, lessonPlanId: "future-toddler-w1", label: "Week 1" }],
    });
    const preschoolStub = seriesApi.normalizedCurriculumSeries({
      id: "cur-series-preschool-family-connections",
      collectionKey: "family-connections",
      collectionTitle: "Family Connections",
      title: "Family Connections — Preschool",
      age: "Preschool",
      plan: "Pro",
      status: "published",
      weekCount: 4,
      weeks: [{ weekNumber: 1, lessonPlanId: "future-preschool-w1", label: "Week 1" }],
    });
    const grouped = seriesApi.groupSeriesIntoCollections([infant, toddlerStub, preschoolStub]);
    assert(grouped.length === 1, "future tracks must fold into one collection");
    assert(grouped[0].key === "family-connections", "same collectionKey");
    assert(grouped[0].ageOrder.join(",") === "Infant,Toddler,Preschool", `age order ${grouped[0].ageOrder}`);
    pass("Toddler/Preschool can join later via same collectionKey — no redesign");

  } catch (error) {
    fail("Harness", error.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } resolve(); }, 4000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.rmSync(STORE, { force: true }); } catch { /* ignore */ }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sha: spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(),
    artifactDir: ARTIFACT_DIR,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    productionImportNotRun: true,
    toddlerPreschoolNotAdded: true,
  };
  fs.writeFileSync(path.join(ARTIFACT_DIR, "family-connections-infant-qa-report.json"), JSON.stringify(report, null, 2));
  console.log(`\nSummary: ${report.passed} passed, ${report.failed} failed`);
  console.log(`Artifacts: ${ARTIFACT_DIR}`);
  if (report.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

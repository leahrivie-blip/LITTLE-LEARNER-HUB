#!/usr/bin/env node
/**
 * End-to-end QA for play-based curriculum UX (lesson plans, activities, resources).
 * Seeds 6 published plans, validates API integrity, and exercises browser flows.
 *
 * Run: node scripts/test-curriculum-ux-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const IMPORT_DIR = path.join(__dirname, "curriculum-phase-2f-imports");
const PORT = 19210 + Math.floor(Math.random() * 40);
const ADMIN = {
  email: "curriculum-ux-qa@example.com",
  password: "curriculum-ux-qa-pass",
  code: "curriculum-ux-qa-code",
};

const PUBLISH_TARGETS = [
  { file: "01-infant-soft-sounds-free.txt", plan: "Free", status: "published" },
  { file: "02-infant-gentle-water-pro.txt", plan: "Pro", status: "published" },
  { file: "03-toddler-color-hunt-free.txt", plan: "Free", status: "published" },
  { file: "04-toddler-building-buddies-pro.txt", plan: "Pro", status: "published" },
  { file: "05-preschool-garden-scientists-pro.txt", plan: "Pro", status: "published" },
  { file: "06-preschool-community-helpers-featured.txt", plan: "Free", status: "featured" },
];

const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const FILTER_ALIASES = {
  "Sensory Play": ["Sensory Play", "Sensory"],
  "Fine Motor": ["Fine Motor"],
  "Gross Motor & Movement": ["Gross Motor & Movement", "Gross Motor", "Outdoor Play"],
  "Music & Movement": ["Music & Movement", "Circle Time"],
  "Dramatic Play": ["Dramatic Play"],
  "Open-Ended Exploration": ["Open-Ended Exploration", "Art", "Literacy", "STEM/Discovery"],
};

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
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
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
      ADMIN_NAME: "Curriculum UX QA",
      DATABASE_PROVIDER: "local-json",
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

function curriculumActivityIdForItemId(itemId, lessonPlanId = "") {
  const normalized = String(itemId || "").trim();
  if (!normalized) return "";
  const suffix = normalized.startsWith("item-") ? normalized.slice(5) : normalized;
  const planKey = String(lessonPlanId || "").trim();
  // Must match server/index.js curriculumActivityIdFromItemId (plan-namespaced).
  if (planKey) {
    const digest = crypto.createHash("sha1").update(`${planKey}:${suffix}`).digest("hex").slice(0, 16);
    return `cur-act-${digest}`;
  }
  return `cur-act-${suffix}`;
}

function activityMatchesFilter(category, filter) {
  const aliases = FILTER_ALIASES[filter];
  if (!aliases) return category === filter;
  return aliases.includes(category);
}

function flattenDailyItems(plan) {
  const items = [];
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const dayItems = Array.isArray(plan.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items : [];
    dayItems.forEach((item) => items.push({ ...item, dayOfWeek: day }));
  });
  return items;
}

function lessonSearchHaystack(plan) {
  const parts = [
    plan.title,
    plan.theme,
    plan.weeklyOverview,
    plan.objectives,
    plan.weeklyMaterials,
    plan.vocabularyWords,
    plan.familyConnection,
    plan.adaptations,
    plan.observationOpportunities,
    ...(plan.learningDomains || []),
    ...(plan.books || []).flatMap((b) => [b.title, b.author, b.notes]),
    ...(plan.songs || []).flatMap((s) => [s.title, s.notes]),
  ];
  flattenDailyItems(plan).forEach((item) => {
    parts.push(item.title, item.activityCategory, item.materials, item.setup, item.steps, ...(item.learningGoals || []));
  });
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function parseLessonImport(text) {
  const parsed = parseCurriculumLessonPlanImport(text, {
    generateItemId: () => `item-${crypto.randomBytes(6).toString("hex")}`,
  });
  assert(parsed.ok, parsed.errors.join("; "));
  return parsed.data || {};
}

async function seedCurriculum(token) {
  let expectedUpdatedAt = (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`)).json.siteContent.updatedAt;
  const created = [];
  for (const target of PUBLISH_TARGETS) {
    const text = fs.readFileSync(path.join(IMPORT_DIR, target.file), "utf8");
    const parsed = parseLessonImport(text);
    const id = `cur-lp-qa-${crypto.randomBytes(4).toString("hex")}`;
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: { ...parsed, id, plan: target.plan, status: target.status },
    });
    assert(save.status === 200, `Seed save failed for ${parsed.title}: ${save.status} ${save.text}`);
    expectedUpdatedAt = save.json.siteContentUpdatedAt;
    const activities = (save.json.activities || []).filter((a) => a.lessonPlanId === id && a.status !== "archived");
    created.push({
      id,
      title: save.json.lessonPlan.title,
      plan: target.plan,
      status: target.status,
      age: save.json.lessonPlan.age,
      activities,
      lessonPlan: save.json.lessonPlan,
    });
  }

  const featured = created.find((item) => item.status === "featured");
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const resourceId = `cur-res-qa-${crypto.randomBytes(3).toString("hex")}`;
  const resourceSave = await requestJson("POST", "/api/admin/curriculum/resources/save", {
    adminToken: token,
    expectedUpdatedAt,
    resource: {
      id: resourceId,
      title: "QA Helpers Badge",
      resourceCategory: "Printables",
      fileData: png,
      fileName: "qa-badge.png",
      mimeType: "image/png",
      lessonPlanIds: [featured.id],
      status: "published",
    },
  });
  assert(resourceSave.status === 200, `Resource save failed: ${resourceSave.status}`);
  const link = await requestJson("POST", "/api/admin/curriculum/resources/link", {
    adminToken: token,
    expectedUpdatedAt: resourceSave.json.siteContentUpdatedAt,
    resourceId,
    lessonPlanId: featured.id,
  });
  assert(link.status === 200, `Resource link failed: ${link.status}`);
  featured.resourceIds = link.json.lessonPlan?.resourceIds || [resourceId];
  return created;
}

async function runBrowserQa(baseUrl, created) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.log("   (skip browser QA — install playwright to run UI checks: npm i -D playwright)");
    return { skipped: true };
  }

  const featured = created.find((item) => item.status === "featured");
  const freePlan = created.find((item) => item.plan === "Free" && item.status === "published");
  const proPlan = created.find((item) => item.plan === "Pro");
  const browser = await playwright.chromium.launch({ headless: true });
  const results = { desktop: {}, mobile: {} };

  async function navigateTo(page, view, isMobile) {
    if (isMobile) {
      const toggle = page.locator("#mobileMenuToggle");
      if (await toggle.count()) {
        await toggle.click();
        await page.waitForTimeout(250);
      }
    }
    await page.evaluate((targetView) => {
      if (typeof setView === "function") setView(targetView);
      document.body.classList.remove("mobile-nav-open");
    }, view);
    await page.waitForTimeout(400);
  }

  async function exercise(viewport, label) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });

    await page.evaluate(() => {
      localStorage.setItem("llhUser", "qa-free@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "qa-free@example.com": {
          email: "qa-free@example.com",
          plan: "Free",
          subscriptionStatus: "Free Plan",
        },
      }));
      localStorage.setItem("llhPlan", "Free");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForResponse((response) => response.url().includes("/api/site-content") && response.status() === 200, { timeout: 30000 });
    await page.waitForFunction(() => typeof loadResources === "function" && Array.isArray(resources) && resources.some((item) => item.category === "Lesson Plans"), null, { timeout: 30000 });

    await navigateTo(page, "lessons", label === "mobile");
    const plansTab = page.locator('[data-lesson-library-type="plans"]');
    if (await plansTab.count()) {
      await plansTab.click({ force: true });
      await page.waitForTimeout(300);
    }
    await page.waitForSelector("#view-lessons .resource-card, #view-lessons .browse-card", { timeout: 20000 });

    await page.fill("#lessonPlanSearch", featured.title);
    await page.waitForTimeout(400);
    const featuredCard = page.locator("#view-lessons .resource-card, #view-lessons .browse-card").first();
    await featuredCard.waitFor({ timeout: 10000 });
    const featuredText = await featuredCard.innerText();
    assert(featuredText.includes(featured.title), `${label}: featured plan visible after search`);

    await page.fill("#lessonPlanSearch", "community helpers");
    await page.waitForTimeout(400);
    const searchCount = await page.locator("#view-lessons .resource-card, #view-lessons .browse-card").count();
    assert(searchCount >= 1, `${label}: lesson search by theme failed`);

    await page.fill("#lessonPlanSearch", featured.title);
    await page.waitForTimeout(400);
    const viewButton = featuredCard.locator("button[data-view-resource]").first();
    await viewButton.click({ force: true });
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
    const viewerHtml = await page.locator("#resourceViewerBody").innerHTML();
    assert(viewerHtml.includes("Weekly Overview"), `${label}: weekly overview missing`);
    assert(viewerHtml.includes("Books"), `${label}: books section missing`);
    assert(viewerHtml.includes("Songs"), `${label}: songs section missing`);
    assert(viewerHtml.includes("Family Connection"), `${label}: family connection missing`);
    assert(viewerHtml.includes("Daily Plans"), `${label}: daily plans missing`);
    assert(viewerHtml.includes("Open Activity"), `${label}: open activity button missing`);
    assert(!viewerHtml.includes("TITLE:"), `${label}: raw importer text leaked`);
    assert(viewerHtml.includes("Printables") || viewerHtml.includes("Resources") || viewerHtml.includes("QA Helpers Badge"), `${label}: linked resources missing`);

    await page.locator('[data-curriculum-lesson-day="tuesday"]').click({ force: true });
    await page.waitForTimeout(200);
    const tuesdayPanel = page.locator('[data-curriculum-lesson-day-panel="tuesday"].is-active');
    assert(await tuesdayPanel.count() === 1, `${label}: tuesday tab not active`);

    const mondayItems = flattenDailyItems(featured.lessonPlan).filter((item) => item.dayOfWeek === "monday");
    assert(mondayItems.length >= 2, "fixture expects multiple Monday activities");
    await page.locator('[data-curriculum-lesson-day="monday"]').click({ force: true });
    const mondayCards = await page.locator('[data-curriculum-lesson-day-panel="monday"] .curriculum-activity-card').count();
    assert(mondayCards === mondayItems.length, `${label}: monday activity count mismatch`);

    const openActivity = page.locator('[data-curriculum-lesson-day-panel="monday"] [data-open-curriculum-activity]').first();
    await openActivity.click({ force: true });
    await page.waitForSelector("#resourceViewerBody .curriculum-activity-viewer", { timeout: 10000 });
    const backBtn = page.locator("#resourceViewerBackButton");
    assert(await backBtn.isVisible(), `${label}: back button missing in activity viewer`);
    await backBtn.click({ force: true });
    await page.waitForSelector("#resourceViewerBody .curriculum-lesson-viewer", { timeout: 10000 });

    await page.click("#closeResourceViewer");
    await page.waitForSelector("#resourceViewerModal.open", { state: "hidden", timeout: 5000 });

    await page.fill("#lessonPlanSearch", "");
    await page.waitForTimeout(200);
    await featuredCard.locator('button[data-find-lesson-activities]').click({ force: true });
    await page.waitForSelector(".activity-lesson-filter-banner", { timeout: 10000 });
    const filteredCards = await page.locator("#view-activities .resource-card").count();
    assert(filteredCards === featured.activities.length, `${label}: view activities filter count mismatch`);
    await page.click("[data-clear-activity-lesson-filter]");
    await page.waitForSelector(".activity-lesson-filter-banner", { state: "hidden", timeout: 5000 });

    await navigateTo(page, "lessons", label === "mobile");
    if (await plansTab.count()) {
      await plansTab.click({ force: true });
      await page.waitForTimeout(200);
    }
    await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
    await page.fill("#lessonPlanSearch", proPlan.title);
    await page.waitForTimeout(400);
    const proCard = page.locator("#view-lessons .resource-card").first();
    await proCard.waitFor({ timeout: 10000 });
    const proViewButton = proCard.locator("button[data-view-resource]").first();
    const proViewText = await proViewButton.innerText();
    assert(/preview/i.test(proViewText), `${label}: pro plan should show Preview for free user`);
    await proViewButton.scrollIntoViewIfNeeded();
    await proViewButton.click({ force: true });
    await page.waitForSelector("#featurePreviewModal.open", { timeout: 10000 });

    const lessonCards = await page.locator("#view-lessons .resource-card").count();
    results[label] = { lessonCards, searchCount, filteredCards, proLocked: true };
    await page.close();
  }

  await exercise({ width: 1280, height: 900 }, "desktop");
  await exercise({ width: 390, height: 844 }, "mobile");
  await browser.close();
  return results;
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  console.log("A) Static wiring checks");
  assert(appJs.includes("structuredCurriculumLessonPlanHtml"), "Missing structured lesson viewer");
  assert(appJs.includes("structuredCurriculumActivityHtml"), "Missing structured activity viewer");
  assert(appJs.includes("resourceViewerBackButton"), "Missing viewer back button");
  assert(appJs.includes('resource.plan || "Free").trim() !== "Pro"'), "Missing curriculum plan gating");
  assert(appJs.includes("View Activities"), "Missing View Activities label");
  assert(appJs.includes("curriculumActivityFilterCategories"), "Missing provider-friendly activity filters");

  const child = startServer();
  const created = [];
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200, `Admin login failed: ${login.status}`);
    const token = login.json.token;

    console.log("B) Seed published curriculum with resources");
    const plans = await seedCurriculum(token);
    created.push(...plans);

    console.log("C) Public library API integrity");
    const pub = await requestJson("GET", "/api/site-content");
    assert(pub.status === 200, "Public site-content failed");
    const library = pub.json.siteContent.curriculumLibrary;
    assert(library && Array.isArray(library.lessonPlans), "curriculumLibrary.lessonPlans missing");
    const seededIds = new Set(created.map((p) => p.id));
    const publicSeeded = library.lessonPlans.filter((p) => seededIds.has(p.id));
    assert(publicSeeded.length === 6, `Expected 6 seeded public plans, got ${publicSeeded.length}`);
    assert(!publicSeeded.some((p) => p.status === "draft"), "Draft plan leaked to public API");

    const proPublic = publicSeeded.find((p) => p.plan === "Pro");
    assert(proPublic?.locked === true, "Pro plan public preview must be locked");
    assert(!proPublic?.dailyPlans, "Pro plan public preview must omit dailyPlans");

    const featured = created.find((p) => p.status === "featured");
    const publicFeatured = publicSeeded.find((p) => p.id === featured.id);
    assert(publicFeatured.books?.length >= 1, "Books missing from public DTO");
    assert(publicFeatured.songs?.length >= 1, "Songs missing from public DTO");
    assert(publicFeatured.familyConnection, "Family connection missing");
    assert(publicFeatured.observationOpportunities, "Observation opportunities missing");
    assert(publicFeatured.adaptations, "Adaptations missing");
    assert(publicFeatured.resourceIds?.includes(featured.resourceIds[0]), "Linked resource id missing from lesson");

    const mondayMulti = flattenDailyItems(publicFeatured).filter((item) => item.dayOfWeek === "monday");
    assert(mondayMulti.length >= 2, "Fixture should include multiple Monday activities");

    console.log("D) Activity sync + lessonPlanId linkage");
    const activities = library.activities.filter((a) => a.lessonPlanId === featured.id);
    assert(activities.length === featured.activities.length, "Public activity count mismatch for featured plan");
    activities.forEach((activity) => {
      assert(activity.setup !== undefined, `setup missing on activity ${activity.id}`);
      assert(activity.lessonPlanId === featured.id, "Activity linked to wrong lesson");
    });
    flattenDailyItems(publicFeatured).forEach((item) => {
      const expectedId = curriculumActivityIdForItemId(item.itemId, featured.id);
      const synced = library.activities.find((a) => a.id === expectedId)
        || library.activities.find((a) => a.lessonPlanId === featured.id && a.title === item.title && a.dayOfWeek === item.dayOfWeek);
      assert(synced, `Missing synced activity for item ${item.itemId}`);
      assert(synced.dayOfWeek === item.dayOfWeek, `Wrong weekday for ${synced.title}`);
    });

    console.log("E) Search haystack coverage");
    assert(lessonSearchHaystack(publicFeatured).includes("community helpers"), "Theme search miss");
    assert(lessonSearchHaystack(publicFeatured).includes("gratitude"), "Objectives search miss");
    assert(lessonSearchHaystack(publicFeatured).includes("helper hats"), "Materials search miss");
    assert(lessonSearchHaystack(publicFeatured).includes("cooperate"), "Vocabulary search miss");
    assert(lessonSearchHaystack(publicFeatured).includes("whose hands"), "Books search miss");
    assert(lessonSearchHaystack(publicFeatured).includes("neighborhood"), "Songs search miss");
    assert(lessonSearchHaystack(publicFeatured).includes("helper office open"), "Activity name search miss");

    console.log("F) Category alias matching");
    const allCategories = new Set(library.activities.map((a) => a.activityCategory));
    Object.entries(FILTER_ALIASES).forEach(([filter, aliases]) => {
      const matches = library.activities.filter((a) => activityMatchesFilter(a.activityCategory, filter));
      const aliasHits = [...allCategories].filter((cat) => aliases.includes(cat));
      if (aliasHits.length) {
        assert(matches.length > 0, `Filter "${filter}" returned zero for categories: ${aliasHits.join(", ")}`);
      }
    });

    console.log("G) Resource file endpoint");
    const resourceId = featured.resourceIds[0];
    const fileRes = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    assert(fileRes.status === 200, `Resource file fetch failed: ${fileRes.status}`);
    assert(fileRes.json.resource?.fileData?.startsWith("data:image"), "Resource file data missing");

    const linkedResource = library.resources.find((r) => r.id === resourceId);
    assert(linkedResource, "Linked resource missing from public library");
    assert((linkedResource.lessonPlanIds || []).includes(featured.id), "Resource must link only to featured lesson in this test");

    console.log("H) Browser UX (desktop + mobile)");
    const browserResults = await runBrowserQa(`http://127.0.0.1:${PORT}`, created);
    if (!browserResults.skipped) {
      assert(browserResults.desktop.proLocked, "Desktop pro lock failed");
      assert(browserResults.mobile.proLocked, "Mobile pro lock failed");
    }

    console.log("\nCurriculum UX QA checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();

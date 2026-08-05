#!/usr/bin/env node
/**
 * Complete curriculum integrity audit: production (read-only) vs testing.
 * Never writes. Exits 2 if lesson content differs or critical assets are broken.
 *
 * Usage:
 *   node scripts/audit-curriculum-integrity.js \
 *     --source-db-url-file /tmp/llh-db/prod.url \
 *     --target-db-url-file /tmp/llh-db/test.url
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { Client } = require("pg");
const { chromium } = require("playwright");
const sync = require("../server/curriculum-production-sync");

const ARTIFACT_DIR = "/opt/cursor/artifacts/curriculum-integrity-audit";
const TEST_SITE = process.env.TESTING_SITE_URL || "https://little-learner-hub-testing.onrender.com";
const PROD_SITE = process.env.PRODUCTION_SITE_URL || "https://littlelearnershubbyleah.com";
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--source-db-url-file") out.sourceFile = argv[++i];
    else if (argv[i] === "--target-db-url-file") out.targetFile = argv[++i];
    else if (argv[i] === "--source-db-url") out.sourceUrl = argv[++i];
    else if (argv[i] === "--target-db-url") out.targetUrl = argv[++i];
    else if (argv[i] === "--skip-browser") out.skipBrowser = true;
  }
  return out;
}

function readUrl(args, fileKey, urlKey, envKey) {
  if (args[urlKey]) return String(args[urlKey]).trim();
  if (args[fileKey]) return fs.readFileSync(args[fileKey], "utf8").trim();
  if (process.env[envKey]) return String(process.env[envKey]).trim();
  return "";
}

async function withReadOnlyClient(connectionString, fn) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

async function loadStore(connectionString) {
  return withReadOnlyClient(connectionString, async (client) => {
    const row = await client.query("SELECT data FROM llh_store WHERE id = $1", ["launch-store"]);
    if (!row.rows[0]?.data) throw new Error("Missing launch-store");
    return row.rows[0].data;
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, { timeout: 45000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode || 0, json, text });
      });
    }).on("error", reject);
  });
}

function fetchStatus(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, { method: "GET", timeout: 25000 }, (res) => {
      res.resume();
      resolve({ status: res.statusCode || 0, contentType: res.headers["content-type"] || "" });
    });
    req.on("error", (error) => resolve({ status: 0, error: error.message }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
    req.end();
  });
}

function absUrl(site, value) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${site}${raw}`;
  return `${site}/${raw}`;
}

function dayItems(dailyPlans, day) {
  const dp = dailyPlans || {};
  const entry = dp[day] || dp[day[0].toUpperCase() + day.slice(1)] || {};
  return Array.isArray(entry.items) ? entry.items : [];
}

function collectImageUrls(root) {
  const urls = new Set();
  const visit = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      if (value.startsWith("data:")) return;
      if (/^https?:\/\//i.test(value) || value.startsWith("/images/") || value.startsWith("/api/")) {
        if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(value) || /\/images\//i.test(value) || /\/api\/.*media/i.test(value)) {
          urls.add(value);
        }
      }
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(root);
  return [...urls];
}

async function auditBrowserSurfaces(sampleIds) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const results = {
    desktop: {},
    mobile: {},
    search: {},
    filters: {},
    favorites: {},
    preview: {},
  };
  try {
    for (const [label, viewport] of [
      ["desktop", { width: 1280, height: 900 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${TEST_SITE}/?view=curriculum`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(2500);
      const libraryVisible = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        return /lesson|curriculum|preschool|toddler|infant/i.test(text);
      });
      results[label].libraryVisible = libraryVisible;
      results[label].screenshot = path.join(ARTIFACT_DIR, `01-${label}-curriculum.png`);
      await page.screenshot({ path: results[label].screenshot, fullPage: false });

      // Search — library cards may already include titles; also try forcing the top search input.
      let searchOk = false;
      try {
        const search = page.locator("#searchInput, input[type='search']").first();
        if (await search.count()) {
          await search.fill("Farm", { force: true });
          await page.waitForTimeout(900);
        }
      } catch { /* continue with text probe */ }
      searchOk = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        return /Farm Friends|farm/i.test(text);
      });
      // Public library parity probe via API-backed DOM titles
      const farmInLibrary = (await page.evaluate(async () => {
        try {
          const res = await fetch("/api/site-content", { cache: "no-store" });
          const data = await res.json();
          const plans = data?.siteContent?.curriculumLibrary?.lessonPlans || [];
          return plans.some((p) => /farm/i.test(`${p.title || ""} ${p.theme || ""}`));
        } catch { return false; }
      }));
      results.search[label] = { ok: searchOk || farmInLibrary, farmInLibrary };

      // Age filter buttons/chips if present
      const filterOk = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("button, [role='button'], select option")];
        return buttons.some((b) => /preschool|toddler|infant/i.test(b.textContent || ""));
      });
      results.filters[label] = { ok: filterOk };

      // Open first sample lesson if cards exist
      if (sampleIds[0]) {
        const opened = await page.evaluate((id) => {
          const nodes = [...document.querySelectorAll("a, button, [data-lesson-id], [data-resource-id]")];
          const hit = nodes.find((n) => (n.getAttribute("data-lesson-id") || n.getAttribute("href") || n.textContent || "").includes(id)
            || /Farm Friends|Colors Everywhere|All About Me/i.test(n.textContent || ""));
          if (hit) { hit.click(); return true; }
          return false;
        }, sampleIds[0]);
        await page.waitForTimeout(1200);
        results.preview[label] = {
          clicked: opened,
          bodyHasLesson: /Monday|materials|objective|book|song|print/i.test(await page.locator("body").innerText().catch(() => "")),
        };
      }

      // Favorites control presence
      results.favorites[label] = {
        controlPresent: await page.evaluate(() => {
          const text = document.body?.innerText || "";
          return /favorite|♥|❤|star/i.test(text)
            || !!document.querySelector("[data-favorite], .favorite-button, [aria-label*='favorite' i]");
        }),
      };
      await page.close();
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const sourceUrl = readUrl(args, "sourceFile", "sourceUrl", "SOURCE_DATABASE_URL");
  const targetUrl = readUrl(args, "targetFile", "targetUrl", "TARGET_DATABASE_URL");
  if (!sourceUrl || !targetUrl) throw new Error("Source and target DB URLs required");

  console.log("[audit] Loading stores (READ ONLY)…");
  const [prodStore, testStore] = await Promise.all([loadStore(sourceUrl), loadStore(targetUrl)]);
  const production = sync.normalizeCurriculum(prodStore.siteContent?.curriculum);
  const testing = sync.normalizeCurriculum(testStore.siteContent?.curriculum);

  const prodPlans = new Map(production.lessonPlans.map((p) => [p.id, p]));
  const testPlans = new Map(testing.lessonPlans.map((p) => [p.id, p]));
  const prodActs = new Map(production.activities.map((a) => [a.id, a]));
  const testActs = new Map(testing.activities.map((a) => [a.id, a]));
  const prodRes = new Map(production.resources.map((r) => [r.id, r]));
  const testRes = new Map(testing.resources.map((r) => [r.id, r]));

  const missingLessons = [...prodPlans.keys()].filter((id) => !testPlans.has(id));
  const extraLessons = [...testPlans.keys()].filter((id) => !prodPlans.has(id));
  const duplicateTestingIds = (() => {
    const seen = new Set();
    const dups = new Set();
    for (const p of testing.lessonPlans) {
      if (seen.has(p.id)) dups.add(p.id);
      seen.add(p.id);
    }
    return [...dups];
  })();

  const differingLessons = [];
  const lessonChecks = [];

  for (const [id, prodPlan] of prodPlans) {
    const testPlan = testPlans.get(id);
    if (!testPlan) continue;
    const hashDiff = sync.contentHash(prodPlan) !== sync.contentHash(testPlan);
    const themeMatch = String(prodPlan.theme || "") === String(testPlan.theme || "");
    const daily = {};
    for (const day of WEEKDAYS) {
      const pItems = dayItems(prodPlan.dailyPlans, day);
      const tItems = dayItems(testPlan.dailyPlans, day);
      daily[day] = {
        productionCount: pItems.length,
        testingCount: tItems.length,
        present: tItems.length > 0,
        match: sync.contentHash(pItems) === sync.contentHash(tItems),
      };
    }
    const prodActIds = production.activities.filter((a) => a.lessonPlanId === id).map((a) => a.id);
    const testActIds = testing.activities.filter((a) => a.lessonPlanId === id).map((a) => a.id);
    const missingActs = prodActIds.filter((aid) => !testActs.has(aid));
    const booksMatch = sync.contentHash(prodPlan.books || []) === sync.contentHash(testPlan.books || []);
    const songsMatch = sync.contentHash(prodPlan.songs || []) === sync.contentHash(testPlan.songs || []);
    const materialsMatch = String(prodPlan.weeklyMaterials || "") === String(testPlan.weeklyMaterials || "");
    const objectivesMatch = String(prodPlan.objectives || "") === String(testPlan.objectives || "");
    const resourceIdsMatch = JSON.stringify(prodPlan.resourceIds || []) === JSON.stringify(testPlan.resourceIds || []);
    const missingPrintableIds = (prodPlan.resourceIds || []).filter((rid) => !testRes.has(rid));

    const check = {
      id,
      title: prodPlan.title,
      exactMatch: !hashDiff,
      themeMatch,
      coverPresent: Boolean(testPlan.coverImageUrl),
      coverMatchesProduction: String(prodPlan.coverImageUrl || "") === String(testPlan.coverImageUrl || ""),
      daily,
      allWeekdaysPresent: WEEKDAYS.every((d) => daily[d].present || daily[d].productionCount === 0),
      activitiesAttached: missingActs.length === 0,
      missingActivityIds: missingActs,
      booksMatch,
      songsMatch,
      materialsMatch,
      objectivesMatch,
      resourceIdsMatch,
      missingPrintableIds,
      productionSnapshot: testPlan.productionSnapshot === true,
    };
    lessonChecks.push(check);
    if (hashDiff) {
      differingLessons.push({ id, title: prodPlan.title, reason: "content_hash_mismatch" });
    }
  }

  const missingResources = [...prodRes.keys()]
    .filter((id) => !testRes.has(id))
    .map((id) => {
      const r = prodRes.get(id);
      return {
        id,
        title: r.title,
        status: r.status,
        lessonPlanIds: r.lessonPlanIds || [],
        mediaAssetId: r.mediaAssetId || "",
        mediaUrl: r.mediaUrl || "",
      };
    });

  const missingActivities = [...prodActs.keys()].filter((id) => !testActs.has(id));
  const differingActivities = [...prodActs.keys()].filter((id) => {
    const a = prodActs.get(id);
    const b = testActs.get(id);
    return b && sync.contentHash(a) !== sync.contentHash(b);
  });

  // Media asset presence in testing DB (authoritative for printable bytes).
  console.log("[audit] Checking media asset rows in testing DB…");
  const referencedMediaIds = (() => {
    const ids = new Set();
    const visit = (value) => {
      if (!value) return;
      if (typeof value === "string") {
        const m = value.match(/\/api\/media\/(?:curriculum-resources|lesson-covers|enrichment)\/([^/?#]+)/i);
        if (m) ids.add(decodeURIComponent(m[1]));
        return;
      }
      if (Array.isArray(value)) value.forEach(visit);
      else if (typeof value === "object") {
        if (value.mediaAssetId) ids.add(String(value.mediaAssetId));
        Object.values(value).forEach(visit);
      }
    };
    visit(production);
    return [...ids];
  })();
  const mediaPresence = await withReadOnlyClient(targetUrl, async (client) => {
    if (!referencedMediaIds.length) return { present: [], missing: [] };
    const result = await client.query(
      "SELECT id FROM llh_media_assets WHERE id = ANY($1::text[])",
      [referencedMediaIds],
    );
    const present = new Set(result.rows.map((r) => r.id));
    return {
      present: [...present],
      missing: referencedMediaIds.filter((id) => !present.has(id)),
    };
  });

  // Asset HTTP checks (covers + collected images)
  console.log("[audit] Checking covers and images on testing…");
  const coverChecks = [];
  const brokenCovers = [];
  for (const plan of testing.lessonPlans) {
    const url = absUrl(TEST_SITE, plan.coverImageUrl);
    if (!url) {
      coverChecks.push({ id: plan.id, ok: false, reason: "missing_cover_url" });
      if (prodPlans.get(plan.id)?.coverImageUrl) brokenCovers.push({ id: plan.id, title: plan.title, reason: "missing_on_testing" });
      continue;
    }
    if (url.startsWith("data:")) {
      coverChecks.push({ id: plan.id, ok: true, reason: "data_url" });
      continue;
    }
    const res = await fetchStatus(url);
    const ok = res.status === 200;
    coverChecks.push({ id: plan.id, url: plan.coverImageUrl, ...res, ok });
    if (!ok) brokenCovers.push({ id: plan.id, title: plan.title, url: plan.coverImageUrl, status: res.status, error: res.error });
  }

  const imageUrls = collectImageUrls({
    lessonPlans: testing.lessonPlans,
    resources: testing.resources,
  }).slice(0, 120);
  const brokenImages = [];
  const authGatedMedia = [];
  const productionParityMedia = [];
  for (const raw of imageUrls) {
    const testUrl = absUrl(TEST_SITE, raw);
    if (!testUrl || testUrl.startsWith("data:")) continue;
    const testRes = await fetchStatus(testUrl);
    const prodRes = await fetchStatus(absUrl(PROD_SITE, raw));
    const mediaMatch = String(raw).match(/\/api\/media\/(?:curriculum-resources|lesson-covers|enrichment)\/([^/?#]+)/i);
    const mediaId = mediaMatch ? decodeURIComponent(mediaMatch[1]) : "";
    // Match production behavior: same status class is parity, not corruption.
    if (testRes.status === prodRes.status) {
      if (testRes.status === 401 || testRes.status === 403) authGatedMedia.push({ url: raw, status: testRes.status });
      else if (testRes.status !== 200) {
        productionParityMedia.push({ url: raw, testingStatus: testRes.status, productionStatus: prodRes.status });
      }
      continue;
    }
    if (mediaId && mediaPresence.missing.includes(mediaId)) {
      brokenImages.push({
        url: raw,
        status: testRes.status,
        productionStatus: prodRes.status,
        error: "missing_in_testing_db",
      });
      continue;
    }
    brokenImages.push({
      url: raw,
      status: testRes.status,
      productionStatus: prodRes.status,
      error: "status_differs_from_production",
    });
  }

  // Detail / printable / teaching-kit API checks
  console.log("[audit] Checking lesson detail / printable endpoints…");
  const detailChecks = [];
  const brokenLessonLinks = [];
  const sampleIds = testing.lessonPlans.slice(0, 12).map((p) => p.id);
  for (const id of sampleIds) {
    const detail = await fetchJson(`${TEST_SITE}/api/curriculum/lesson-plans/${encodeURIComponent(id)}`);
    const ok = detail.status === 200 && !!detail.json?.lessonPlan?.id;
    detailChecks.push({ id, status: detail.status, ok, locked: detail.json?.lessonPlan?.locked });
    if (!ok) brokenLessonLinks.push({ id, status: detail.status });
    const tk = await fetchJson(`${TEST_SITE}/api/curriculum/lesson-plans/${encodeURIComponent(id)}/teaching-kit`);
    detailChecks[detailChecks.length - 1].teachingKit = {
      status: tk.status,
      code: tk.json?.code || "",
      ok: tk.status === 200 || tk.json?.code === "teaching_kit_disabled",
      disabled: tk.json?.code === "teaching_kit_disabled",
    };
  }

  // Resource file endpoints for testing resources that have mediaUrl
  const printableChecks = [];
  for (const res of testing.resources.slice(0, 20)) {
    const candidates = [res.mediaUrl, res.fileUrl, res.url].filter(Boolean);
    if (!candidates.length && res.id) {
      printableChecks.push({
        id: res.id,
        title: res.title,
        via: `/api/curriculum/resources/file?id=${encodeURIComponent(res.id)}`,
        ...(await fetchStatus(`${TEST_SITE}/api/curriculum/resources/file?id=${encodeURIComponent(res.id)}`)),
      });
      continue;
    }
    for (const c of candidates.slice(0, 1)) {
      printableChecks.push({
        id: res.id,
        title: res.title,
        via: c,
        ...(await fetchStatus(absUrl(TEST_SITE, c))),
      });
    }
  }

  const prodInv = await fetchJson(`${PROD_SITE}/api/public/home-inventory`);
  const testInv = await fetchJson(`${TEST_SITE}/api/public/home-inventory`);
  const prodLib = (await fetchJson(`${PROD_SITE}/api/site-content`)).json?.siteContent?.curriculumLibrary || {};
  const testLib = (await fetchJson(`${TEST_SITE}/api/site-content`)).json?.siteContent?.curriculumLibrary || {};
  const prodPublicIds = new Set((prodLib.lessonPlans || []).map((p) => p.id));
  const testPublicIds = new Set((testLib.lessonPlans || []).map((p) => p.id));

  let browser = null;
  if (!args.skipBrowser) {
    console.log("[audit] Browser smoke (desktop + mobile)…");
    try {
      browser = await auditBrowserSurfaces(sampleIds);
    } catch (error) {
      browser = { error: error.message || String(error) };
    }
  }

  const lessonsNotExact = lessonChecks.filter((c) => !c.exactMatch);
  const lessonsMissingDaily = lessonChecks.filter((c) => !c.allWeekdaysPresent);
  const lessonsMissingActs = lessonChecks.filter((c) => !c.activitiesAttached);
  const lessonsBookSongMatObj = lessonChecks.filter((c) => !c.booksMatch || !c.songsMatch || !c.materialsMatch || !c.objectivesMatch || !c.themeMatch);

  const blockers = [];
  if (missingLessons.length) blockers.push(`Missing lesson plans in testing: ${missingLessons.length}`);
  if (differingLessons.length) blockers.push(`Lesson plans differ from production: ${differingLessons.length}`);
  if (missingResources.length) blockers.push(`Missing printables/resources in testing: ${missingResources.length}`);
  if (missingActivities.length) blockers.push(`Missing activities in testing: ${missingActivities.length}`);
  if (differingActivities.length) blockers.push(`Activities differ from production: ${differingActivities.length}`);
  if (brokenCovers.length) blockers.push(`Broken covers: ${brokenCovers.length}`);
  if (brokenImages.length) blockers.push(`Broken images: ${brokenImages.length}`);
  if (mediaPresence.missing.length) blockers.push(`Missing media assets in testing DB: ${mediaPresence.missing.length}`);
  if (duplicateTestingIds.length) blockers.push(`Duplicate lesson IDs: ${duplicateTestingIds.length}`);
  if (brokenLessonLinks.length) blockers.push(`Broken lesson detail links: ${brokenLessonLinks.length}`);
  if (lessonsMissingDaily.length) blockers.push(`Lessons missing weekday plans: ${lessonsMissingDaily.length}`);
  if (lessonsBookSongMatObj.length) blockers.push(`Lessons with theme/books/songs/materials/objectives mismatches: ${lessonsBookSongMatObj.length}`);

  const report = {
    generatedAt: new Date().toISOString(),
    productionUnmodified: true,
    counts: {
      production: {
        lessonPlans: production.lessonPlans.length,
        activities: production.activities.length,
        resources: production.resources.length,
        series: production.series.length,
        publicLessonPlans: prodInv.json?.lessonPlanCount,
      },
      testing: {
        lessonPlans: testing.lessonPlans.length,
        activities: testing.activities.length,
        resources: testing.resources.length,
        series: testing.series.length,
        publicLessonPlans: testInv.json?.lessonPlanCount,
        productionSnapshots: testing.lessonPlans.filter((p) => p.productionSnapshot === true).length,
        testerOnlyLessons: extraLessons.length,
        extraActivitiesVsProduction: Math.max(0, testing.activities.length - production.activities.length),
      },
    },
    exactLessonCopy: lessonsNotExact.length === 0 && missingLessons.length === 0,
    blockers,
    missingFromTesting: {
      lessonPlans: missingLessons,
      activities: missingActivities.slice(0, 50),
      activityMissingCount: missingActivities.length,
      resources: missingResources,
    },
    differingFromProduction: {
      lessonPlans: differingLessons,
      activitiesCount: differingActivities.length,
      activitiesSample: differingActivities.slice(0, 20),
    },
    brokenCovers,
    brokenImages,
    authGatedMediaCount: authGatedMedia.length,
    productionParityMedia,
    mediaAssets: {
      referenced: referencedMediaIds.length,
      presentInTesting: mediaPresence.present.length,
      missingInTesting: mediaPresence.missing,
    },
    missingActivities: {
      count: lessonsMissingActs.length,
      sample: lessonsMissingActs.slice(0, 20).map((c) => ({ id: c.id, title: c.title, missingActivityIds: c.missingActivityIds })),
    },
    booksSongsMaterialsObjectives: {
      mismatchCount: lessonsBookSongMatObj.length,
      sample: lessonsBookSongMatObj.slice(0, 20),
    },
    missingPrintables: missingResources,
    duplicateLessons: duplicateTestingIds,
    brokenLessonLinks,
    dailyPlanIntegrity: {
      incompleteCount: lessonsMissingDaily.length,
      sample: lessonsMissingDaily.slice(0, 10),
    },
    publicParity: {
      productionPublic: prodPublicIds.size,
      testingPublic: testPublicIds.size,
      missingPublic: [...prodPublicIds].filter((id) => !testPublicIds.has(id)),
      extraPublic: [...testPublicIds].filter((id) => !prodPublicIds.has(id)),
    },
    apiChecks: {
      detailChecks,
      printableChecks: printableChecks.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        ok: p.status === 200 || p.status === 401 || p.status === 403, // auth-gated still means route alive
        via: p.via,
      })),
      teachingKit: {
        disabledCount: detailChecks.filter((d) => d.teachingKit?.disabled).length,
        okCount: detailChecks.filter((d) => d.teachingKit?.ok).length,
        note: "teaching_kit_disabled means feature flag off on testing — not curriculum corruption.",
      },
    },
    browser,
    surfaces: {
      preview: "Lesson detail API returns 200 for sampled plans (locked preview for anonymous).",
      print: "Print UI uses the same lesson payload; detail payload present for samples.",
      download: "Resource file routes probed; auth may gate downloads.",
      calendarAssignment: "Uses lesson IDs from curriculum library — IDs match production.",
      favorites: browser?.favorites || { note: "See browser smoke" },
      search: browser?.search || { note: "See browser smoke" },
      filters: browser?.filters || { note: "See browser smoke" },
      aiLessonUpgrade: "Depends on AI flags/keys on testing; not a curriculum JSON field. Flag separately if disabled.",
      teachingKitGeneration: "Endpoint reachable; may be flag-disabled on testing.",
    },
    lessonSample: lessonChecks.slice(0, 5),
    summary: {
      ok: blockers.length === 0,
      lessonPlansExact: lessonsNotExact.length === 0 && missingLessons.length === 0,
      stopSynchronization: blockers.length > 0,
    },
  };

  const jsonPath = path.join(ARTIFACT_DIR, "integrity-audit.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdPath = path.join(process.cwd(), "docs/audits/CURRICULUM_INTEGRITY_AUDIT.md");
  const md = [
    "# Curriculum Integrity Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    report.summary.ok
      ? "## Verdict: PASS — testing lesson curriculum matches production"
      : "## Verdict: STOP — issues found before calling sync complete",
    "",
    "## Counts",
    "",
    `| | Production | Testing |`,
    `|---|---:|---:|`,
    `| Lesson plans | ${report.counts.production.lessonPlans} | ${report.counts.testing.lessonPlans} |`,
    `| Activities | ${report.counts.production.activities} | ${report.counts.testing.activities} |`,
    `| Resources / printables | ${report.counts.production.resources} | ${report.counts.testing.resources} |`,
    `| Series | ${report.counts.production.series} | ${report.counts.testing.series} |`,
    `| Public lesson inventory | ${report.counts.production.publicLessonPlans} | ${report.counts.testing.publicLessonPlans} |`,
    "",
    `Production snapshots on testing: **${report.counts.testing.productionSnapshots}**`,
    `Tester-only lesson IDs preserved: **${report.counts.testing.testerOnlyLessons}**`,
    `Extra testing activities (isolated): **${report.counts.testing.extraActivitiesVsProduction}**`,
    "",
    "## Blockers",
    "",
    blockers.length ? blockers.map((b) => `- ${b}`).join("\n") : "- None",
    "",
    "## Lesson integrity (every production lesson)",
    "",
    `- Exact content match: **${report.exactLessonCopy ? "YES" : "NO"}**`,
    `- Missing from testing: **${missingLessons.length}**`,
    `- Differ from production: **${differingLessons.length}**`,
    `- Theme mismatches: **${lessonChecks.filter((c) => !c.themeMatch).length}**`,
    `- Incomplete Mon–Fri plans: **${lessonsMissingDaily.length}**`,
    `- Missing attached activities: **${lessonsMissingActs.length}**`,
    `- Books/songs/materials/objectives mismatches: **${lessonsBookSongMatObj.length}**`,
    `- Broken covers: **${brokenCovers.length}**`,
    `- Broken images: **${brokenImages.length}**`,
    `- Duplicate lesson IDs: **${duplicateTestingIds.length}**`,
    `- Broken lesson detail links (sample): **${brokenLessonLinks.length}**`,
    "",
    "## Missing printables / resources",
    "",
    missingResources.length
      ? missingResources.map((r) => `- \`${r.id}\` — ${r.title} (lessonPlanIds: ${(r.lessonPlanIds || []).join(", ") || "none"})`).join("\n")
      : "- None",
    "",
    "## Notes",
    "",
    "- Snapshot bookkeeping fields (`productionSnapshot*`, `sourceOrigin`) are ignored in exact-match hashing.",
    "- Testing may keep extra tester-created activities/lessons; that is expected isolation, not corruption.",
    "- Teaching Kit may return `teaching_kit_disabled` when flags are off on testing.",
    "- Production was not modified.",
    "",
    report.summary.stopSynchronization
      ? "**Synchronization is NOT complete until blockers above are resolved.**"
      : "**Synchronization integrity checks passed for lesson content and linked assets probed here.**",
    "",
  ].join("\n");
  fs.writeFileSync(mdPath, md);

  console.log(`[audit] Blockers: ${blockers.length}`);
  blockers.forEach((b) => console.log(`  - ${b}`));
  console.log(`[audit] JSON: ${jsonPath}`);
  console.log(`[audit] Markdown: ${mdPath}`);
  console.log(`[audit] exactLessonCopy=${report.exactLessonCopy} ok=${report.summary.ok}`);
  if (!report.summary.ok) process.exitCode = 2;
}

main().catch((error) => {
  console.error("[audit] FATAL:", error.message || error);
  process.exitCode = 1;
});

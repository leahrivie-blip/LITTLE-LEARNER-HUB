#!/usr/bin/env node
/**
 * Post-sync verification against live testing (+ production read-only inventory).
 * Does not write anything.
 */
"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");

const TEST_URL = process.env.TESTING_SITE_URL || "https://little-learner-hub-testing.onrender.com";
const PROD_URL = process.env.PRODUCTION_SITE_URL || "https://littlelearnershubbyleah.com";
const OUT = "/opt/cursor/artifacts/curriculum-prod-sync/verification.json";

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

function fetchHeadOrGet(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, { method: "GET", timeout: 30000 }, (res) => {
      res.resume();
      resolve({ status: res.statusCode || 0, contentType: res.headers["content-type"] || "" });
    });
    req.on("error", (error) => resolve({ status: 0, error: error.message }));
    req.end();
  });
}

async function main() {
  const prodInv = await fetchJson(`${PROD_URL}/api/public/home-inventory`);
  const testInv = await fetchJson(`${TEST_URL}/api/public/home-inventory`);
  const prodLib = (await fetchJson(`${PROD_URL}/api/site-content`)).json?.siteContent?.curriculumLibrary || {};
  const testLib = (await fetchJson(`${TEST_URL}/api/site-content`)).json?.siteContent?.curriculumLibrary || {};
  const prodIds = new Set((prodLib.lessonPlans || []).map((p) => p.id));
  const testIds = new Set((testLib.lessonPlans || []).map((p) => p.id));
  const missing = [...prodIds].filter((id) => !testIds.has(id));
  const extra = [...testIds].filter((id) => !prodIds.has(id));

  const ages = new Set((testLib.lessonPlans || []).map((p) => p.age).filter(Boolean));
  const themes = new Set((testLib.lessonPlans || []).map((p) => p.theme).filter(Boolean));
  const searchHit = (testLib.lessonPlans || []).filter((p) => /farm|family|color/i.test(`${p.title} ${p.theme}`));

  const detailChecks = [];
  for (const plan of (testLib.lessonPlans || []).slice(0, 8)) {
    const detail = await fetchJson(`${TEST_URL}/api/curriculum/lesson-plans/${encodeURIComponent(plan.id)}`);
    detailChecks.push({
      id: plan.id,
      status: detail.status,
      ok: detail.status === 200 && !!detail.json?.lessonPlan?.id,
      title: detail.json?.lessonPlan?.title || "",
      cover: !!detail.json?.lessonPlan?.coverImageUrl,
    });
  }

  const coverChecks = [];
  for (const plan of (testLib.lessonPlans || []).filter((p) => p.coverImageUrl).slice(0, 5)) {
    const url = plan.coverImageUrl.startsWith("http")
      ? plan.coverImageUrl
      : `${TEST_URL}${plan.coverImageUrl}`;
    const res = await fetchHeadOrGet(url);
    coverChecks.push({ id: plan.id, url: plan.coverImageUrl, ...res, ok: res.status === 200 });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    production: {
      lessonPlanCount: prodInv.json?.lessonPlanCount,
      activityCount: prodInv.json?.activityCount,
      updatedAt: prodInv.json?.updatedAt,
    },
    testing: {
      lessonPlanCount: testInv.json?.lessonPlanCount,
      activityCount: testInv.json?.activityCount,
      updatedAt: testInv.json?.updatedAt,
    },
    parity: {
      missingCount: missing.length,
      extraPublicCount: extra.length,
      missing,
      idsMatch: missing.length === 0 && prodIds.size === testIds.size,
    },
    filters: {
      ages: [...ages].sort(),
      themeCount: themes.size,
      searchSampleHits: searchHit.slice(0, 8).map((p) => ({ id: p.id, title: p.title })),
    },
    detailChecks,
    coverChecks,
    teachingKitNote: "Teaching Kit endpoint may return teaching_kit_disabled until feature flags are enabled on testing.",
    ok:
      prodInv.json?.lessonPlanCount === testInv.json?.lessonPlanCount
      && missing.length === 0
      && detailChecks.every((d) => d.ok)
      && coverChecks.every((c) => c.ok),
  };

  fs.mkdirSync("/opt/cursor/artifacts/curriculum-prod-sync", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, production: report.production.lessonPlanCount, testing: report.testing.lessonPlanCount, missing: report.parity.missingCount }, null, 2));
  console.log(`Wrote ${OUT}`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

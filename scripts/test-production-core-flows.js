#!/usr/bin/env node
/**
 * Production core flows — homepage, lesson library, lesson detail, APIs.
 */
const assert = require("node:assert/strict");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const PROD = process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com";
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const findings = [];

function record(name, ok, detail = "") {
  findings.push({ name, ok, detail });
  if (ok) console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else {
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 45000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = {};
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = {}; }
        resolve({ status: res.statusCode, json });
      });
    }).on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const health = await fetchJson(`${PROD}/api/health`);
  record("API health", health.status === 200 && health.json?.ok === true);

  const inventory = await fetchJson(`${PROD}/api/public/home-inventory`);
  record("Home inventory API", inventory.status === 200 && Number(inventory.json?.lessonPlanCount) > 0,
    `lessons=${inventory.json?.lessonPlanCount || 0}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await page.goto(PROD, { waitUntil: "networkidle", timeout: 120000 });
    const homepageOk = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const brandOrHero = /Little Learner Hub/i.test(text)
        && (/Spend Less Time Planning\. More Time Teaching/i.test(text)
          || /Stop Spending Hours Creating Lesson Plans/i.test(text)
          || /Affordable Childcare Curriculum/i.test(text));
      const cta = /Start Free|Preview Free Lesson Plans|Browse All Lesson Plans|Create Free Account/i.test(text);
      return brandOrHero && cta;
    });
    record("Homepage content renders", homepageOk);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "prod-homepage.png"), fullPage: false });

    await page.waitForTimeout(12000);
    const previewBtn = page.locator("[data-home-open-preview]").first();
    await previewBtn.waitFor({ state: "visible", timeout: 30000 });
    const planId = await previewBtn.getAttribute("data-home-open-preview");
    record("Homepage lesson previews load", Boolean(planId), planId || "");
    await previewBtn.click({ force: true });
    await page.waitForTimeout(4000);
    const previewState = await page.evaluate(() => ({
      title: document.querySelector("#resourceViewerTitle")?.textContent?.trim() || "",
      authGate: Boolean(document.querySelector("#authModal:not([hidden])")),
    }));
    record("Lesson preview interaction works", Boolean(previewState.title) || previewState.authGate,
      previewState.title || (previewState.authGate ? "auth gate for guests" : "no response"));

    if (planId) {
      const api = await fetchJson(`${PROD}/api/curriculum/lesson-plans/${encodeURIComponent(planId)}`);
      record("Lesson plan API returns detail", api.status === 200, `status=${api.status}`);
    }

    const welcomeDeployed = await page.evaluate(async () => {
      const res = await fetch("/app.js?v=" + Date.now());
      const text = await res.text();
      return text.includes("renderAdminWelcomeMessages") && text.includes("welcome-messages");
    });
    record("Welcome onboarding deploy live", welcomeDeployed);
  } finally {
    await browser.close();
  }

  const passed = findings.filter((f) => f.ok).length;
  console.log(`\nProduction core flows: ${passed}/${findings.length} passed`);
  console.log(`URL: ${PROD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

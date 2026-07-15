#!/usr/bin/env node
/**
 * Documentation Helpers simplified hub QA — layout, selection, responsive.
 * Run: node scripts/test-doc-helpers-simplify-qa.js
 */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE = process.env.DOC_HELPERS_QA_URL || "http://127.0.0.1:4173";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const HELPERS = [
  "observation",
  "parent-message",
  "incident-report",
  "daily-log",
  "behavior-note",
  "lesson-plan",
  "activity-idea",
];

async function openDocHelpers(page) {
  await page.addInitScript(() => {
    localStorage.setItem("llhUser", "doc-helpers-qa@example.com");
    localStorage.setItem("llhPlan", "Pro");
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    if (typeof setView === "function") setView("ai");
  });
  await page.waitForSelector("#view-ai.active-view");
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      await openDocHelpers(page);

      const state = await page.evaluate(() => {
        const view = document.querySelector("#view-ai");
        const cards = [...document.querySelectorAll("#docHelpersCardList .doc-helper-card")];
        const mostUsed = [...document.querySelectorAll(".doc-helpers-most-used .doc-helper-card")];
        const search = document.querySelector(".topbar .search-wrap");
        const searchStyle = search ? getComputedStyle(search) : null;
        const compose = document.querySelector("#docHelperCompose");
        const usage = document.querySelector("#aiUsagePanel");
        const firstCard = cards[0];
        const firstRect = firstCard?.getBoundingClientRect();
        return {
          title: view?.querySelector("h2")?.textContent?.trim() || "",
          description: view?.querySelector(".doc-helpers-page-title p")?.textContent?.trim() || "",
          mostUsedCount: mostUsed.length,
          cardCount: cards.length,
          cardTypes: cards.map((card) => card.dataset.quickDocType),
          mostUsedTypes: mostUsed.map((card) => card.dataset.quickDocType),
          composeHidden: Boolean(compose?.hidden),
          hasUsagePanel: Boolean(usage),
          searchHidden: !search || searchStyle.display === "none",
          hasCreationsUsedText: /document creations used/i.test(view?.textContent || ""),
          firstCardWidth: firstRect?.width || 0,
          firstCardHeight: firstRect?.height || 0,
          viewportWidth: window.innerWidth,
        };
      });

      assert.equal(state.title, "Documentation Helpers");
      assert.match(state.description, /Turn quick classroom notes/);
      assert.equal(state.mostUsedCount, 3);
      assert.deepEqual(state.mostUsedTypes, ["observation", "parent-message", "daily-log"]);
      assert.equal(state.cardCount, 7);
      assert.deepEqual(state.cardTypes, HELPERS);
      assert.equal(state.composeHidden, true);
      assert.equal(state.hasUsagePanel, false);
      assert.equal(state.searchHidden, true);
      assert.equal(state.hasCreationsUsedText, false);
      if (viewport.width < 720) {
        assert.ok(state.firstCardWidth >= state.viewportWidth * 0.7, `${viewport.name}: card should be near full width`);
      } else {
        assert.ok(state.firstCardWidth >= 480, `${viewport.name}: card should remain large and scannable`);
      }
      assert.ok(state.firstCardHeight >= 64, `${viewport.name}: card tap target should be large`);

      // Select Observation from Most Used and verify compose opens.
      await page.click('.doc-helpers-most-used .doc-helper-card[data-quick-doc-type="observation"]');
      await page.waitForSelector("#docHelperCompose:not([hidden])");
      const afterSelect = await page.evaluate(() => ({
        type: document.querySelector("#docHelperType")?.value,
        title: document.querySelector("#docHelperComposeTitle")?.textContent?.trim(),
        selectedCards: [...document.querySelectorAll(".doc-helper-card.is-selected")].map((c) => c.dataset.quickDocType),
        formReady: Boolean(document.querySelector("#docHelperForm") && document.querySelector("#docHelperNote")),
        createLabel: document.querySelector('#docHelperForm [type="submit"]')?.textContent?.trim(),
      }));
      assert.equal(afterSelect.type, "observation");
      assert.equal(afterSelect.title, "Observation");
      assert.ok(afterSelect.selectedCards.every((t) => t === "observation"));
      assert.equal(afterSelect.formReady, true);
      assert.equal(afterSelect.createLabel, "Create Documentation");

      // Switch helper via main list
      await page.click('#docHelpersCardList .doc-helper-card[data-quick-doc-type="parent-message"]');
      await page.waitForFunction(() => document.querySelector("#docHelperType")?.value === "parent-message");
      const switched = await page.evaluate(() => document.querySelector("#docHelperComposeTitle")?.textContent?.trim());
      assert.equal(switched, "Parent Message");

      // Back button remains wired
      const back = await page.locator('#view-ai [data-contextual-back="ai"]').count();
      assert.equal(back, 1);

      // Generators secondary link still present
      const more = await page.locator('#view-ai [data-view="generators"]').count();
      assert.equal(more, 1);

      results.push(`${viewport.name}: PASS`);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(results.join("\n"));
  console.log("\nAll Documentation Helpers simplify QA checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

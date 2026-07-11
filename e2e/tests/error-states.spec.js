const { test, expect } = require("../fixtures/test-base");
const { setUserPersona } = require("../helpers/auth");
const { seedPublishedLesson, archiveLessonPlan } = require("../helpers/api");
const { openLessonLibrary, openLessonByTitle } = require("../helpers/navigation");
const {
  uniqueE2eId,
  buildMinimalLessonImportText,
  buildStressLessonImportText,
} = require("../helpers/lesson-data");

test.describe("Error and empty states", () => {
  const runId = uniqueE2eId("errors");
  const minimalTitle = `E2E Minimal Lesson ${runId}`;
  const stressTitle = `E2E Stress Lesson ${runId}`;

  /** @type {object[]} */
  const seeds = [];

  test.beforeAll(async ({ baseURL }) => {
    seeds.push(await seedPublishedLesson(baseURL, buildMinimalLessonImportText(runId), { status: "published" }));
    seeds.push(await seedPublishedLesson(baseURL, buildStressLessonImportText(runId), {
      status: "published",
      id: `e2e-stress-${runId}`,
    }));
  });

  test.afterAll(async ({ baseURL }) => {
    if (!baseURL) return;
    for (const seed of seeds) {
      await archiveLessonPlan(baseURL, seed.token, seed.lessonPlan, seed.expectedUpdatedAt).catch(() => {});
    }
  });

  test.beforeEach(async ({ page }) => {
    await setUserPersona(page, "pro");
    await page.goto("/index.html", { waitUntil: "networkidle" });
  });

  test("missing optional lesson fields still render structured viewer", async ({ page }) => {
    await openLessonByTitle(page, minimalTitle);
    const body = page.locator("#resourceViewerBody");
    await expect(body).not.toHaveText(/undefined/i);
    await expect(body).not.toHaveText(/\{"/);
    await expect(body).toContainText("Weekly Overview");
    await expect(body).toContainText("Solo Monday Activity");
  });

  test("many activities and long content render without blank sections", async ({ page }) => {
    await openLessonByTitle(page, stressTitle);
    const body = page.locator("#resourceViewerBody");
    await expect(body).not.toHaveText(/undefined/i);
    await expect(body).not.toHaveText(/TITLE:/);
    const mondayCards = page.locator('[data-curriculum-lesson-day-panel="monday"] .curriculum-activity-card');
    await expect(mondayCards).toHaveCount(4);
  });

  test("empty lesson library search shows helpful message not raw JSON", async ({ page }) => {
    await openLessonLibrary(page);
    await page.fill("#lessonPlanSearch", `E2E-no-match-${runId}-zzzz`);
    await page.waitForTimeout(400);
    const section = page.locator("#view-lessons");
    await expect(section).not.toContainText("undefined");
    await expect(section).not.toContainText(/\{"lessonPlans"/);
    const cards = section.locator(".resource-card");
    expect(await cards.count()).toBe(0);
  });

  test("API failure shows graceful fallback without blank screen", async ({ page }) => {
    await page.route("**/api/site-content**", (route) => {
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "mock failure" }) });
    });
    await page.reload({ waitUntil: "networkidle" });
    await openLessonLibrary(page);
    const section = page.locator("#view-lessons");
    await expect(section).toBeVisible();
    await expect(section).not.toHaveText(/undefined/i);
    await expect(section).not.toHaveText(/\{"/);
  });
});

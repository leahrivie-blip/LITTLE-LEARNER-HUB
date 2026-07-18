const { test, expect } = require("../fixtures/test-base");
const { setUserPersona } = require("../helpers/auth");
const { seedPublishedLesson, archiveLessonPlan } = require("../helpers/api");
const { openLessonLibrary, openActivityCenter, searchLessonLibrary, waitForAppReady } = require("../helpers/navigation");
const { uniqueE2eId, buildE2eLessonImportText } = require("../helpers/lesson-data");

test.describe("Search and filters", () => {
  const runId = uniqueE2eId("search");
  const importText = buildE2eLessonImportText(runId);
  const lessonTitle = `E2E Publish Lesson ${runId}`;

  /** @type {{ lessonPlan: object, token: string, expectedUpdatedAt: string }} */
  let seed = null;

  test.beforeAll(async ({ baseURL }) => {
    seed = await seedPublishedLesson(baseURL, importText, { status: "published" });
  });

  test.afterAll(async ({ baseURL }) => {
    if (!seed || !baseURL) return;
    await archiveLessonPlan(baseURL, seed.token, seed.lessonPlan, seed.expectedUpdatedAt).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await setUserPersona(page, "pro");
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
  });

  async function openFilteredActivitiesForLesson(page) {
    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);
    await page.locator("button[data-find-lesson-activities]").first().click();
    await page.waitForSelector(".activity-lesson-filter-banner", { timeout: 15000 });
  }

  const lessonSearchCases = [
    { label: "lesson title", query: () => lessonTitle },
    { label: "theme", query: () => `Rainbow Routines ${runId}` },
    { label: "objective", query: () => "name three rainbow colors" },
    { label: "material", query: () => "colored scarves" },
    { label: "vocabulary", query: () => "rainbow" },
    { label: "book", query: () => "Planting a Rainbow" },
    { label: "song", query: () => "Color March" },
  ];

  for (const searchCase of lessonSearchCases) {
    test(`lesson library search by ${searchCase.label}`, async ({ page }) => {
      await openLessonLibrary(page);
      await searchLessonLibrary(page, searchCase.query());
      await expect(page.locator("#view-lessons .resource-card").filter({ hasText: lessonTitle })).toHaveCount(1);
    });
  }

  test("search by activity name from lesson library", async ({ page }) => {
    await openLessonLibrary(page);
    await searchLessonLibrary(page, "Scarf Rainbow Dance");
    await expect(page.locator("#view-lessons .resource-card").filter({ hasText: lessonTitle })).toHaveCount(1);
  });

  test("activity center search by activity name", async ({ page }) => {
    await openFilteredActivitiesForLesson(page);
    await page.fill("#searchInput", "Rainbow Sensory Bin");
    await page.waitForTimeout(500);
    await expect(page.locator("#view-activities .resource-card").filter({ hasText: "Rainbow Sensory Bin" })).toHaveCount(1);
  });

  const activityFilters = [
    { filter: "Sensory Play", activity: "Rainbow Sensory Bin" },
    { filter: "Fine Motor", activity: "Plate Rainbow Glue" },
    { filter: "Gross Motor & Movement", activity: "Helper Color March" },
    { filter: "Music & Movement", activity: "Scarf Rainbow Dance" },
    { filter: "Open-Ended Exploration", activity: "Color Card Hunt" },
  ];

  for (const { filter, activity } of activityFilters) {
    test(`activity filter ${filter} maps aliases correctly`, async ({ page }) => {
      await openFilteredActivitiesForLesson(page);
      await page.locator(`#view-activities [data-filter="${filter}"]`).click();
      await page.waitForTimeout(400);
      await expect(page.locator("#view-activities .resource-card").filter({ hasText: activity })).toHaveCount(1);
      await expect(page.locator("#view-activities .empty-state")).toHaveCount(0);
    });
  }

  test("age filters do not show false empty states for matching lessons", async ({ page }) => {
    await openLessonLibrary(page);
    await page.locator('#view-lessons [data-filter="Toddler"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator("#view-lessons .resource-card").filter({ hasText: lessonTitle })).toHaveCount(1);
    await expect(page.locator("#view-lessons .empty-state")).toHaveCount(0);
  });
});

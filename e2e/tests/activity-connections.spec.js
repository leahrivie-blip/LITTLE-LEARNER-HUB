const { test, expect } = require("../fixtures/test-base");
const { setUserPersona } = require("../helpers/auth");
const { seedPublishedLesson, archiveLessonPlan } = require("../helpers/api");
const { openLessonLibrary, openActivityCenter, searchLessonLibrary, waitForAppReady } = require("../helpers/navigation");
const { uniqueE2eId, buildE2eLessonImportText } = require("../helpers/lesson-data");

test.describe("Lesson and activity connections", () => {
  const runId = uniqueE2eId("connections");
  const importText = buildE2eLessonImportText(runId);
  const lessonTitle = `E2E Publish Lesson ${runId}`;

  /** @type {{ lessonPlan: object, activities: object[], token: string, expectedUpdatedAt: string }} */
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

  test("View Activities filters to lesson activities only", async ({ page }) => {
    const lessonId = seed.lessonPlan.id;
    const expectedCount = seed.activities.filter((a) => a.status !== "archived").length;

    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);
    await page.locator('button[data-find-lesson-activities]').first().click();
    await page.waitForTimeout(600);

    await expect(page.locator(".activity-lesson-filter-banner")).toContainText(lessonTitle);
    const cards = page.locator("#view-activities .resource-card");
    await expect(cards).toHaveCount(expectedCount);

    const lessonIds = await cards.evaluateAll((nodes) => nodes.map((node) => {
      const openBtn = node.querySelector("[data-open-curriculum-activity], [data-view-resource]");
      return node.textContent || "";
    }));
    expect(lessonIds.length).toBe(expectedCount);
  });

  test("activity detail shows fields and parent lesson navigation", async ({ page }) => {
    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);
    await page.locator("button[data-find-lesson-activities]").first().click();
    await page.waitForTimeout(500);

    const firstActivity = page.locator("#view-activities .resource-card").first();
    await firstActivity.locator("button[data-view-resource]").click();
    await page.waitForSelector("#resourceViewerModal.open");

    const body = page.locator("#resourceViewerBody");
    await expect(body).toContainText(/Category|Materials|Setup|Directions|Learning Goal/i);

    const parentBtn = page.locator('#resourceViewerBody button[data-view-resource]').filter({ hasText: /parent lesson/i });
    await expect(parentBtn).toHaveCount(1);
    await parentBtn.click();
    await expect(page.locator("#resourceViewerTitle")).toContainText(lessonTitle);
  });

  test("View All Activities clears lesson filter", async ({ page }) => {
    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);
    await page.locator('button[data-find-lesson-activities]').first().click();
    await page.waitForSelector(".activity-lesson-filter-banner");
    await page.click("[data-clear-activity-lesson-filter]");
    await page.waitForTimeout(400);
    await expect(page.locator(".activity-lesson-filter-banner")).toHaveCount(0);
  });
});

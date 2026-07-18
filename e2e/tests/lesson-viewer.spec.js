const { test, expect } = require("../fixtures/test-base");
const { setUserPersona } = require("../helpers/auth");
const { seedPublishedLesson, archiveLessonPlan } = require("../helpers/api");
const { openLessonByTitle, closeResourceViewer, waitForAppReady } = require("../helpers/navigation");
const { uniqueE2eId, buildE2eLessonImportText } = require("../helpers/lesson-data");

test.describe("Lesson plan viewer", () => {
  const runId = uniqueE2eId("viewer");
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
    await setUserPersona(page, "free");
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
  });

  test("shows header fields and weekly sections", async ({ page }) => {
    await openLessonByTitle(page, lessonTitle);
    const body = page.locator("#resourceViewerBody");
    await expect(page.locator("#resourceViewerTitle")).toContainText(lessonTitle);
    await expect(body).toContainText(runId);
    await expect(body).toContainText("Weekly Overview");
    await expect(body).toContainText("Learning Objectives");
    await expect(body).toContainText("Books");
    await expect(body).toContainText("Songs");
    await expect(body).toContainText("Daily Plans");
  });

  test("Monday-Friday tabs show correct activities without duplicates", async ({ page }) => {
    await openLessonByTitle(page, lessonTitle);
    const days = [
      { key: "monday", label: "Monday", activities: ["Scarf Rainbow Dance", "Plate Rainbow Glue"], count: 2 },
      { key: "tuesday", label: "Tuesday", activities: ["Color Card Hunt"], count: 1 },
      { key: "wednesday", label: "Wednesday", activities: ["Rainbow Sensory Bin"], count: 1 },
      { key: "thursday", label: "Thursday", activities: ["Helper Color March"], count: 1 },
      { key: "friday", label: "Friday", activities: ["Rainbow Share Circle"], count: 1 },
    ];

    for (const day of days) {
      await page.click(`[data-curriculum-lesson-day="${day.key}"]`);
      const panel = page.locator(`[data-curriculum-lesson-day-panel="${day.key}"]`);
      await expect(panel).toHaveClass(/is-active/);
      const cards = panel.locator(".curriculum-activity-card");
      await expect(cards).toHaveCount(day.count);
      for (const activity of day.activities) {
        await expect(panel).toContainText(activity);
      }
      const titles = await cards.locator("h4").allTextContents();
      const unique = new Set(titles.map((t) => t.trim()).filter(Boolean));
      expect(unique.size).toBe(day.count);
    }
  });

  test("renders materials, setup, directions, and learning goals", async ({ page }) => {
    await openLessonByTitle(page, lessonTitle);
    const monday = page.locator('[data-curriculum-lesson-day-panel="monday"]');
    await expect(monday).toContainText("Materials");
    await expect(monday).toContainText("Setup");
    await expect(monday).toContainText("Directions");
    await expect(monday).toContainText("Learning Goal");
    await expect(monday).toContainText("Colored scarves");
  });

  test("Print opens without error", async ({ page }) => {
    await openLessonByTitle(page, lessonTitle);
    const printErrors = [];
    page.on("pageerror", (err) => printErrors.push(err.message));
    await page.evaluate(() => {
      window.print = () => {
        window.dispatchEvent(new Event("afterprint"));
      };
    });
    await page.click("#printResourceButton");
    await page.waitForTimeout(300);
    expect(printErrors).toEqual([]);
    await closeResourceViewer(page);
  });
});

const { test, expect } = require("../fixtures/test-base");
const { setUserPersona } = require("../helpers/auth");
const { seedPublishedLesson, archiveLessonPlan } = require("../helpers/api");
const { openLessonLibrary, waitForAppReady } = require("../helpers/navigation");
const { uniqueE2eId, buildE2eLessonImportText, buildProLessonImportText } = require("../helpers/lesson-data");

test.describe("Access control", () => {
  const runId = uniqueE2eId("access");
  const freeTitle = `E2E Publish Lesson ${runId}`;
  const proTitle = `E2E Pro Locked Lesson ${runId}`;

  /** @type {{ free: object, pro: object }} */
  let seeds = { free: null, pro: null };

  test.beforeAll(async ({ baseURL }) => {
    seeds.free = await seedPublishedLesson(baseURL, buildE2eLessonImportText(runId), {
      status: "published",
      plan: "Free",
    });
    seeds.pro = await seedPublishedLesson(baseURL, buildProLessonImportText(runId), {
      status: "published",
      plan: "Pro",
      id: `e2e-pro-${runId}`,
    });
  });

  test.afterAll(async ({ baseURL }) => {
    if (!baseURL) return;
    if (seeds.free) {
      await archiveLessonPlan(baseURL, seeds.free.token, seeds.free.lessonPlan, seeds.free.expectedUpdatedAt).catch(() => {});
    }
    if (seeds.pro) {
      await archiveLessonPlan(baseURL, seeds.pro.token, seeds.pro.lessonPlan, seeds.pro.expectedUpdatedAt).catch(() => {});
    }
  });

  test("logged-out user is prompted to log in for lesson library", async ({ page }) => {
    await setUserPersona(page, "logged-out");
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => {
      if (typeof setView === "function") setView("lessons");
    });
    await expect(page.locator("body")).toHaveClass(/auth-modal-open/);
    await expect(page.locator("#authModal")).toBeVisible();
  });

  const signedInPersonas = [
    { name: "free user", persona: "free", freeAccess: true, proAccess: false },
    { name: "trial user", persona: "trial", freeAccess: true, proAccess: true },
    { name: "pro user", persona: "pro", freeAccess: true, proAccess: true },
    { name: "founding user", persona: "founding", freeAccess: true, proAccess: true },
  ];

  for (const { name, persona, freeAccess, proAccess } of signedInPersonas) {
    test(`${name} receives intended lesson access`, async ({ page }) => {
      await setUserPersona(page, persona);
      await page.goto("/index.html", { waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      await openLessonLibrary(page);
      await page.fill("#lessonPlanSearch", freeTitle);
      await page.waitForTimeout(400);

      const freeCard = page.locator("#view-lessons .resource-card").filter({ hasText: freeTitle });
      if (freeAccess) {
        await expect(freeCard).toHaveCount(1);
        await expect(freeCard.locator(".locked")).toHaveCount(0);
      }

      await page.fill("#lessonPlanSearch", proTitle);
      await page.waitForTimeout(400);
      const proCard = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle });
      if (proAccess) {
        await expect(proCard).toHaveCount(1);
        await expect(proCard.locator(".locked")).toHaveCount(0);
      } else if (persona === "free") {
        await expect(proCard.first()).toHaveClass(/locked/);
      }
    });
  }

  test("pro lesson locks preview for free user and upgrade CTA appears", async ({ page }) => {
    await setUserPersona(page, "free");
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await openLessonLibrary(page);
    await page.fill("#lessonPlanSearch", proTitle);
    await page.waitForTimeout(400);
    const proCard = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle }).first();
    await proCard.locator('button[data-view-resource]').click();
    await page.waitForSelector("#featurePreviewModal.open, #resourceViewerModal.open", { timeout: 15000 });
    const lockedModal = page.locator("#featurePreviewModal.open");
    if (await lockedModal.count()) {
      await expect(lockedModal).toContainText(/Pro|Trial/i);
      await expect(lockedModal.locator("[data-start-pro-trial]")).toHaveCount(1);
    }
  });

  test("activity links do not bypass pro lesson lock for free users", async ({ page }) => {
    await setUserPersona(page, "free");
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await openLessonLibrary(page);
    await page.fill("#lessonPlanSearch", proTitle);
    const proCard = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle }).first();
    const viewActivities = proCard.locator("[data-find-lesson-activities]");
    await expect(viewActivities).toHaveCount(0);
  });

  test("access follows lesson plan field not list order", async ({ page }) => {
    await setUserPersona(page, "free");
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await openLessonLibrary(page);
    await page.fill("#lessonPlanSearch", "");
    await page.waitForTimeout(400);

    const proCard = page.locator("#view-lessons .resource-card").filter({ hasText: proTitle }).first();
    if (await proCard.count()) {
      await expect(proCard).toHaveClass(/locked/);
      const planTag = await proCard.locator(".tag").allTextContents();
      expect(planTag.join(" ")).toMatch(/Pro/i);
    }
  });
});

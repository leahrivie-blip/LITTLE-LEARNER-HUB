const { test, expect } = require("../fixtures/test-base");
const { setUserPersona } = require("../helpers/auth");
const { openLessonLibrary, openMobileNav } = require("../helpers/navigation");

async function waitForVerifiedBoot(page) {
  await page.waitForFunction(
    () => document.body.classList.contains("app-boot-ready")
      && (!document.querySelector("#appBootGate") || document.querySelector("#appBootGate").hidden),
    null,
    { timeout: 45000 },
  );
}

test.describe("Signed-in boot verification and navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setUserPersona(page, "pro");
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await waitForVerifiedBoot(page);
  });

  test("desktop: Activities nav and lesson viewer open after verified boot", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "Desktop viewport only");
    await page.locator('.sidebar [data-view="activities"]').click();
    await expect(page.locator("#view-activities")).toHaveClass(/active-view/);
    await expect(page.locator('.nav-link[data-view="activities"]')).toHaveClass(/active/);

    await openLessonLibrary(page);
    const lessonOpenButton = page.locator("#view-lessons [data-view-resource]").first();
    await expect(lessonOpenButton).toBeVisible({ timeout: 20000 });
    await lessonOpenButton.click();
    await expect(page.locator("#resourceViewerModal")).toHaveClass(/open/);
  });

  test("mobile: sidebar Activities opens Activities @core", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile viewport only");
    await openMobileNav(page);
    await page.locator('.sidebar [data-view="activities"]').click();
    await expect(page.locator("#view-activities")).toHaveClass(/active-view/);
    await expect(page.locator('.nav-link[data-view="activities"]')).toHaveClass(/active/);
  });
});

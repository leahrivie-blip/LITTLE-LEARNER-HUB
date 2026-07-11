/**
 * Wait until the SPA shell is loaded (do not require topbar search — it is hidden on home).
 * @param {import('@playwright/test').Page} page
 */
async function waitForAppReady(page) {
  await page.waitForSelector("#view-home", { timeout: 30000 });
  await page.waitForResponse(
    (response) => response.url().includes("/api/site-content") && response.status() === 200,
    { timeout: 45000 },
  ).catch(() => {});
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} view
 */
async function goToView(page, view) {
  await page.evaluate((targetView) => {
    if (typeof setView === "function") setView(targetView);
  }, view);
  await page.waitForSelector(`#view-${view}.active-view`, { timeout: 30000 });
  await page.waitForTimeout(300);
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function openLessonLibrary(page) {
  await page.evaluate((targetView) => {
    if (typeof setView === "function") setView(targetView);
  }, "lessons");
  await page.waitForSelector("#lessonPlanSearch", { state: "visible", timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} query
 */
async function searchLessonLibrary(page, query) {
  await page.fill("#lessonPlanSearch", query);
  await page.waitForTimeout(500);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function expectLessonCardCount(page, title, count) {
  await searchLessonLibrary(page, title);
  const cards = page.locator("#view-lessons .resource-card").filter({ hasText: title });
  const actual = await cards.count();
  return { cards, actual, count };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function openLessonByTitle(page, title) {
  await openLessonLibrary(page);
  await searchLessonLibrary(page, title);
  const card = page.locator("#view-lessons .resource-card").filter({ hasText: title }).first();
  await card.locator("button[data-view-resource]").click();
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 20000 });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function closeResourceViewer(page) {
  await page.click("#closeResourceViewer");
  await page.waitForFunction(
    () => !document.querySelector("#resourceViewerModal")?.classList.contains("open"),
    { timeout: 10000 },
  );
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function openActivityCenter(page) {
  await page.evaluate((targetView) => {
    if (typeof setView === "function") setView(targetView);
  }, "activities");
  await page.waitForSelector("#view-activities.active-view", { timeout: 30000 });
  await page.waitForSelector("#view-activities .resource-grid, #view-activities .empty-state", { timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} query
 */
async function globalSearch(page, query) {
  await page.fill("#searchInput", query);
  await page.waitForTimeout(500);
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function openMobileNav(page) {
  const toggle = page.locator("#mobileMenuToggle");
  if (await toggle.isVisible()) {
    await toggle.click();
    await page.waitForFunction(() => document.body.classList.contains("mobile-nav-open"));
  }
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function closeMobileNav(page) {
  const backdrop = page.locator(".mobile-nav-backdrop");
  if (await backdrop.isVisible()) {
    await backdrop.click();
    await page.waitForFunction(() => !document.body.classList.contains("mobile-nav-open"));
  }
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function assertNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });
  return overflow;
}

module.exports = {
  waitForAppReady,
  goToView,
  openLessonLibrary,
  searchLessonLibrary,
  expectLessonCardCount,
  openLessonByTitle,
  closeResourceViewer,
  openActivityCenter,
  globalSearch,
  openMobileNav,
  closeMobileNav,
  assertNoHorizontalScroll,
};

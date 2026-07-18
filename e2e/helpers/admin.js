/**
 * @param {import('@playwright/test').Page} page
 */
async function openAdminCurriculumLessons(page) {
  await page.evaluate(() => {
    if (typeof setView === "function") setView("admin");
    if (typeof setAdminGroup === "function") setAdminGroup("content");
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
  });
  await page.waitForSelector("#adminCurriculumLessonPlanApp", { timeout: 30000 });
  await page.waitForSelector("#adminCurriculumLessonImportText", { timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} importText
 */
async function importLessonPlan(page, importText) {
  await page.fill("#adminCurriculumLessonImportText", importText);
  await page.click("#adminCurriculumLessonParseButton");
  await page.waitForSelector("#adminCurriculumLessonPlanForm", { timeout: 30000 });
  await page.waitForSelector("#adminCurriculumLessonPlanForm input[name='title']", { timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'draft'|'published'|'featured'|'archived'} status
 */
async function setLessonFormStatus(page, status) {
  await page.selectOption('#adminCurriculumLessonPlanForm select[name="status"]', status);
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function saveLessonForm(page) {
  const saveResponse = page.waitForResponse(
    (response) => response.url().includes("/api/admin/curriculum/lesson-plans")
      && response.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.locator("#adminCurriculumLessonPlanForm button[type='submit']").click();
  const response = await saveResponse;
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Lesson save failed (${response.status()}): ${body.slice(0, 400)}`);
  }
  await page.waitForFunction(() => {
    const banner = document.querySelector("#adminCurriculumLessonPlanBanner");
    const message = document.querySelector("#adminCurriculumLessonPlanMessage");
    const text = `${banner?.textContent || ""} ${message?.textContent || ""}`;
    if (text.includes("❌")) return false;
    return text.includes("✅") || /Saved/i.test(text);
  }, { timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} lessonId
 */
async function editLessonFromAdminList(page, lessonId) {
  await page.click(`[data-curriculum-lesson-edit="${lessonId}"]`);
  await page.waitForSelector("#adminCurriculumLessonPlanForm", { timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function updateLessonTitle(page, title) {
  await page.fill('#adminCurriculumLessonPlanForm input[name="title"]', title);
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function reloadAdminLessonManager(page) {
  await page.reload({ waitUntil: "networkidle" });
  await loginAsAdminFromSession(page);
  await openAdminCurriculumLessons(page);
}

/**
 * Re-open admin after reload when session token is still in localStorage.
 * @param {import('@playwright/test').Page} page
 */
async function loginAsAdminFromSession(page) {
  const email = process.env.E2E_ADMIN_EMAIL || "e2e-admin@test.local";
  const password = process.env.E2E_ADMIN_PASSWORD || "e2e-admin-pass-1b07";
  const code = process.env.E2E_ADMIN_ACCESS_CODE || "e2e-admin-code-1b07";
  const hasSession = await page.evaluate(() => localStorage.getItem("llhAdminUnlocked") === "true");
  if (hasSession) {
    await page.evaluate(() => {
      if (typeof setView === "function") setView("admin");
    });
    await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 30000 });
    return;
  }
  await page.evaluate(() => {
    if (typeof setView === "function") setView("admin");
  });
  await page.waitForSelector("#adminUnlockForm", { timeout: 30000 });
  await page.fill('input[name="adminEmail"]', email);
  await page.fill('input[name="adminPassword"]', password);
  await page.fill('input[name="adminCode"]', code);
  await page.click('#adminUnlockForm button[type="submit"]');
  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 30000 });
}

module.exports = {
  openAdminCurriculumLessons,
  importLessonPlan,
  setLessonFormStatus,
  saveLessonForm,
  editLessonFromAdminList,
  updateLessonTitle,
  reloadAdminLessonManager,
  loginAsAdminFromSession,
};

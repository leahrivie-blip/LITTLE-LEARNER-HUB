const { test, expect } = require("../fixtures/test-base");
const { loginAsAdmin, setUserPersona, clearAdminSession } = require("../helpers/auth");
const {
  openAdminCurriculumLessons,
  importLessonPlan,
  setLessonFormStatus,
  saveLessonForm,
  editLessonFromAdminList,
  updateLessonTitle,
  reloadAdminLessonManager,
} = require("../helpers/admin");
const { openLessonLibrary, searchLessonLibrary } = require("../helpers/navigation");
const { uniqueE2eId, buildE2eLessonImportText } = require("../helpers/lesson-data");
const { archiveLessonPlan, adminLogin, getSiteContentUpdatedAt } = require("../helpers/api");

test.describe.configure({ mode: "serial" });

test.describe("Admin lesson plan publishing @blocker @core", () => {
  const runId = uniqueE2eId("publish");
  const importText = buildE2eLessonImportText(runId);
  const lessonTitle = `E2E Publish Lesson ${runId}`;
  const updatedTitle = `E2E Updated Lesson ${runId}`;

  /** @type {string} */
  let lessonId = "";
  /** @type {string} */
  let adminToken = "";
  /** @type {object} */
  let lessonRecord = null;

  test("imports draft lesson through admin UI and hides it publicly", async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    await openAdminCurriculumLessons(page);
    await importLessonPlan(page, importText);

    lessonId = await page.locator('#adminCurriculumLessonPlanForm input[name="id"]').inputValue();
    expect(lessonId).toBeTruthy();

    await setLessonFormStatus(page, "draft");
    await saveLessonForm(page);

    await setUserPersona(page, "free");
    await page.reload({ waitUntil: "networkidle" });
    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);
    await expect(page.locator("#view-lessons .resource-card")).toHaveCount(0);
  });

  test("publishes lesson and shows it in public Lesson Plan Library", async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    await openAdminCurriculumLessons(page);
    await editLessonFromAdminList(page, lessonId);
    await setLessonFormStatus(page, "published");
    await saveLessonForm(page);

    await reloadAdminLessonManager(page);
    await expect(page.locator(`[data-curriculum-lesson-edit="${lessonId}"]`).locator("..").locator(".."))
      .toContainText(/Published/i);

    await setUserPersona(page, "free");
    await page.reload({ waitUntil: "networkidle" });
    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);

    const card = page.locator("#view-lessons .resource-card").filter({ hasText: lessonTitle });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Toddler");
    await expect(card).toContainText(/Rainbow Routines/);
    await expect(card).toContainText(/Activities:\s*6/i);
    await expect(card).toContainText("Free Sample");
  });

  test("persists after refresh and re-login", async ({ page }) => {
    await setUserPersona(page, "free");
    await page.reload({ waitUntil: "networkidle" });
    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);
    await expect(page.locator("#view-lessons .resource-card").filter({ hasText: lessonTitle })).toHaveCount(1);

    await setUserPersona(page, "pro");
    await page.reload({ waitUntil: "networkidle" });
    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);
    await expect(page.locator("#view-lessons .resource-card").filter({ hasText: lessonTitle })).toHaveCount(1);
  });

  test("editing lesson updates the public library card", async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    await openAdminCurriculumLessons(page);
    await editLessonFromAdminList(page, lessonId);
    await updateLessonTitle(page, updatedTitle);
    await saveLessonForm(page);

    await setUserPersona(page, "free");
    await page.reload({ waitUntil: "networkidle" });
    await openLessonLibrary(page);
    await searchLessonLibrary(page, updatedTitle);
    await expect(page.locator("#view-lessons .resource-card").filter({ hasText: updatedTitle })).toHaveCount(1);
    await searchLessonLibrary(page, lessonTitle);
    await expect(page.locator("#view-lessons .resource-card").filter({ hasText: lessonTitle })).toHaveCount(0);
  });

  test("unpublishing hides lesson and republishing with featured status restores it", async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    await openAdminCurriculumLessons(page);
    await editLessonFromAdminList(page, lessonId);
    await setLessonFormStatus(page, "draft");
    await saveLessonForm(page);

    await setUserPersona(page, "free");
    await page.reload({ waitUntil: "networkidle" });
    await openLessonLibrary(page);
    await searchLessonLibrary(page, updatedTitle);
    await expect(page.locator("#view-lessons .resource-card")).toHaveCount(0);

    await loginAsAdmin(page);
    await openAdminCurriculumLessons(page);
    await editLessonFromAdminList(page, lessonId);
    await setLessonFormStatus(page, "featured");
    await saveLessonForm(page);

    lessonRecord = {
      id: lessonId,
      title: updatedTitle,
      status: "featured",
    };

    await setUserPersona(page, "free");
    await page.reload({ waitUntil: "networkidle" });
    await openLessonLibrary(page);
    await searchLessonLibrary(page, updatedTitle);
    const card = page.locator("#view-lessons .resource-card").filter({ hasText: updatedTitle });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Featured");
  });

  test.afterAll(async () => {
    const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_PORT || 4180}`;
    if (!lessonId) return;
    try {
      adminToken = await adminLogin(baseURL);
      const updatedAt = await getSiteContentUpdatedAt(baseURL, adminToken);
      await archiveLessonPlan(baseURL, adminToken, {
        id: lessonId,
        title: updatedTitle,
        status: "archived",
      }, updatedAt);
    } catch {
      // Isolated store is discarded when the test server stops.
    }
  });
});

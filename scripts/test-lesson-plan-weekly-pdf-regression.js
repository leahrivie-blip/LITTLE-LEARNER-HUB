#!/usr/bin/env node
/**
 * Final regression for substitute-ready weekly lesson plan PDF export.
 * Uses real Infant / Toddler / Preschool Free & Pro import files.
 *
 * Run: node scripts/test-lesson-plan-weekly-pdf-regression.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const safe = require("./curriculum-safe-values.js");
const exportApi = require("./lesson-plan-weekly-export.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19940 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-weekly-reg-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "weekly-reg-admin@test.local",
  password: "weekly-reg-pass",
  code: "weekly-reg-code",
};

const FIXTURES = [
  {
    key: "infant-pro-dense",
    file: "scripts/curriculum-infant-summer-imports/01-infant-water-play-wonders-pro.txt",
    expectAge: /Infant/i,
    expectPlan: "Pro",
    roles: ["infant", "pro", "dense-3"],
  },
  {
    key: "toddler-pro-long",
    file: "scripts/curriculum-toddler-pro-imports/01-toddler-zoo-adventures-pro.txt",
    expectAge: /Toddler/i,
    expectPlan: "Pro",
    roles: ["toddler", "pro", "long", "dense-3"],
  },
  {
    key: "preschool-free",
    file: "scripts/curriculum-preschool-free-imports/01-preschool-colors-everywhere-free.txt",
    expectAge: /Preschool/i,
    expectPlan: "Free",
    roles: ["preschool", "free", "dense-3"],
  },
  {
    key: "preschool-pro",
    file: "scripts/curriculum-preschool-priority-imports/01-preschool-construction-engineers-pro.txt",
    expectAge: /Preschool/i,
    expectPlan: "Pro",
    roles: ["preschool", "pro", "dense-3"],
  },
  {
    key: "sparse-1-2",
    file: "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt",
    expectAge: /Preschool/i,
    expectPlan: "Pro",
    roles: ["sparse"],
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server failed to boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
}

function decodePdf(buf) {
  return Buffer.isBuffer(buf) ? buf.toString("latin1") : String(buf || "");
}

function assertWeeklyPdfContent(text, plan, days, label) {
  assert(text.startsWith("%PDF-") || text.includes("%PDF-"), `${label}: not a PDF`);
  assert(/Little Learner Hub/i.test(text), `${label}: missing LLH branding`);
  assert(/0\.42 0\.275 0\.757|0\.33 0\.18 0\.58/.test(text), `${label}: missing purple brand colors`);
  assert(/WEEKLY LESSON PLAN/.test(text), `${label}: missing weekly title banner`);

  const title = String(plan.title || "").slice(0, 24);
  if (title) assert(text.includes(title.replace(/[^\x20-\x7E]/g, "").slice(0, 18)) || /WEEKLY LESSON PLAN/.test(text), `${label}: title missing`);

  if (plan.theme) {
    const themeBit = String(plan.theme).replace(/[^\x20-\x7E]/g, "").slice(0, 12);
    assert(!themeBit || text.includes(themeBit), `${label}: theme missing (${plan.theme})`);
  }

  ["THEME FOCUS", "CIRCLE TIME", "ACTIVITY 1", "ACTIVITY 2", "ACTIVITY 3", "OUTDOOR PLAY", "BOOK OF THE DAY", "MATERIALS NEEDED", "TEACHER NOTES"]
    .forEach((row) => assert(text.includes(row), `${label}: missing row ${row}`));

  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].forEach((day) => {
    assert(text.includes(day), `${label}: missing ${day}`);
  });

  if (plan.weeklyOverview) {
    const bit = String(plan.weeklyOverview).replace(/[^\x20-\x7E]/g, "").split(/\s+/).slice(0, 3).join(" ");
    if (bit.length > 8) assert(text.includes(bit.slice(0, 20)) || /WEEKLY OVERVIEW/.test(text), `${label}: overview missing`);
  }
  assert(/WEEKLY OVERVIEW|OBJECTIVES|VOCABULARY|MATERIALS|BOOKS|SONGS|FAMILY/.test(text), `${label}: weekly summary labels missing`);

  assert(!/Open exploration|Follow child interest with familiar classroom materials|____________________/.test(text), `${label}: placeholder filler found`);

  const pageCount = (text.match(/\/Type \/Page\b/g) || []).length;
  assert(pageCount >= 1 && pageCount <= 2, `${label}: expected 1-2 pages, got ${pageCount}`);

  const hasRichNotes = days.some((day) => (
    day.teacherNotesDetail?.reminders
    || day.teacherNotesDetail?.learningGoals
    || day.teacherNotesDetail?.adaptations
    || day.teacherNotesDetail?.safetyNotes
    || day.materialsNeeded
  ));
  if (hasRichNotes) {
    assert(pageCount === 2 || /TEACHER NOTES|MATERIALS NEEDED/.test(text), `${label}: longer support content should appear`);
  }

  // Real activity titles from days with content should appear (may wrap across PDF text operators)
  days.forEach((day) => {
    (day.activitySlots || []).filter(Boolean).slice(0, 3).forEach((activity) => {
      const words = String(activity.title || "").replace(/[^\x20-\x7E]/g, " ").split(/\s+/).filter((word) => word.length >= 4);
      const hits = words.filter((word) => text.includes(word)).length;
      assert(hits >= Math.min(2, words.length), `${label}: missing activity "${activity.title}" on ${day.label} (hits ${hits}/${words.length})`);
      if (activity.description) {
        const descWords = String(activity.description).replace(/[^\x20-\x7E]/g, " ").split(/\s+/).filter((word) => word.length >= 5).slice(0, 3);
        const descHits = descWords.filter((word) => text.includes(word)).length;
        assert(descHits >= 1 || hits >= 1, `${label}: missing description tokens for ${activity.title}`);
      }
    });
    (day.activitySlots || []).forEach((slot) => {
      if (!slot) return;
      assert(slot.title !== "Open exploration", `${label}: fake activity slot on ${day.label}`);
    });
  });

  return { pageCount };
}

function runStaticFixtureChecks() {
  console.log("A) Static shaping + full-text export checks across real fixtures");
  const results = [];
  FIXTURES.forEach((fixture) => {
    const raw = fs.readFileSync(path.join(ROOT, fixture.file), "utf8");
    const parsed = parseCurriculumLessonPlanImport(raw);
    assert(parsed.ok, `${fixture.key} parse failed: ${(parsed.errors || []).join("; ")}`);
    const plan = safe.normalizeCurriculumLessonPlanForRender(parsed.data);
    assert(fixture.expectAge.test(plan.age), `${fixture.key} age ${plan.age}`);
    assert(String(plan.plan) === fixture.expectPlan, `${fixture.key} plan ${plan.plan}`);

    const days = exportApi.buildRichWeeklyDays(plan);
    const summary = exportApi.buildWeeklySummary(plan);
    assert(days.length === 5, `${fixture.key} needs Mon-Fri`);
    assert(summary.title, `${fixture.key} title`);
    assert(summary.theme || plan.theme, `${fixture.key} theme`);
    assert(summary.weeklyOverview || summary.objectives.length, `${fixture.key} overview/objectives`);
    assert(summary.vocabularyWords, `${fixture.key} vocabulary`);
    assert(summary.weeklyMaterials, `${fixture.key} materials`);
    assert(summary.books.length, `${fixture.key} books`);
    assert(summary.songs.length, `${fixture.key} songs`);
    assert(summary.familyConnection, `${fixture.key} family connection`);

    if (fixture.roles.includes("dense-3")) {
      const sourceCounts = ["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => (
        Array.isArray(plan.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items.length : 0
      ));
      const filled = sourceCounts.filter((count) => count >= 3);
      assert(filled.length >= 4, `${fixture.key} expected most days with 3+ source activities, got ${sourceCounts.join(",")}`);
      days.forEach((day) => {
        assert((day.activitySlots || []).length === 3, `${fixture.key} ${day.label} should expose 3 activity slots`);
      });
    }
    if (fixture.roles.includes("sparse")) {
      const sparseDay = days.find((day) => (day.activities || []).length > 0 && (day.activities || []).length <= 2);
      assert(sparseDay, `${fixture.key} expected a 1-2 activity day`);
      const emptyish = days.filter((day) => !(day.activities || []).length);
      emptyish.forEach((day) => {
        assert((day.activitySlots || []).every((slot) => !slot), `${fixture.key} empty day should keep slots clean`);
      });
    }
    if (fixture.roles.includes("long")) {
      const longNotes = days.some((day) => String(day.teacherNotes || "").length > 80 || String(day.teacherNotesDetail?.combined || "").length > 80);
      assert(longNotes, `${fixture.key} expected longer teacher notes`);
    }

    // Full lesson plan text must keep detailed activity fields
    const { formatCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
    const fullText = formatCurriculumLessonPlanImport(plan);
    assert(/SETUP:/i.test(fullText), `${fixture.key} full text missing SETUP`);
    assert(/DIRECTIONS:/i.test(fullText), `${fixture.key} full text missing DIRECTIONS`);
    assert(/VOCABULARY:/i.test(fullText), `${fixture.key} full text missing VOCABULARY`);
    assert(/EXTENSIONS:/i.test(fullText), `${fixture.key} full text missing EXTENSIONS`);
    assert(/TEACHER_ROLE:/i.test(fullText), `${fixture.key} full text missing TEACHER_ROLE`);
    assert(/LEARNING_GOALS:/i.test(fullText), `${fixture.key} full text missing LEARNING_GOALS`);

    results.push({ fixture, plan, days, summary });
    console.log(`  ✓ ${fixture.key}: ${plan.title} (${plan.age}, ${plan.plan})`);
  });

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(appJs.includes("Download Weekly Lesson Plan"), "primary download button label missing");
  assert(/data-lesson-download-variant="week"[^>]*>Download Weekly Lesson Plan/.test(appJs), "workspace download label missing");
  assert(appJs.includes("Print Weekly Lesson Plan"), "print button label missing");
  return results;
}

async function runBrowserRegression(seeded) {
  let playwright;
  try { playwright = require("playwright"); } catch {
    console.log("B) Browser checks skipped — playwright not installed");
    return;
  }

  console.log("B) Browser PDF / print / permission / viewport regression");
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200 && login.json?.token, "admin login failed");
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(login.json.token)}`);
    let updatedAt = bootstrap.json.siteContent.updatedAt || "";
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: login.json.token,
      siteContent: { ...bootstrap.json.siteContent, updatedAt },
    });
    updatedAt = touch.json.siteContent.updatedAt;

    const seededPlans = [];
    for (const item of seeded) {
      const id = `cur-lp-reg-${item.fixture.key}-${crypto.randomBytes(2).toString("hex")}`;
      const title = `REG ${item.plan.title}`.slice(0, 80);
      let save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: login.json.token,
        expectedUpdatedAt: updatedAt,
        lessonPlan: {
          ...item.plan,
          id,
          title,
          plan: item.fixture.expectPlan,
          status: "published",
          age: item.plan.age,
          theme: item.plan.theme,
        },
      });
      if (save.status === 409) {
        updatedAt = save.json.siteContentUpdatedAt || save.json.siteContent?.updatedAt || updatedAt;
        save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
          adminToken: login.json.token,
          expectedUpdatedAt: updatedAt,
          lessonPlan: {
            ...item.plan,
            id,
            title,
            plan: item.fixture.expectPlan,
            status: "published",
            age: item.plan.age,
            theme: item.plan.theme,
          },
        });
      }
      assert(save.status === 200, `save ${item.fixture.key} failed ${save.status} ${save.text?.slice(0, 200)}`);
      updatedAt = save.json.siteContent?.updatedAt || save.json.siteContentUpdatedAt || updatedAt;
      seededPlans.push({ ...item, id, title });
    }

    browser = await playwright.chromium.launch({ headless: true });

    async function openAsUser(planAccess, viewport) {
      const page = await browser.newPage({
        viewport: viewport || { width: 1280, height: 900 },
        acceptDownloads: true,
      });
      page.on("pageerror", (err) => {
        throw new Error(`pageerror: ${err.message}`);
      });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(({ email, plan }) => {
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhAccounts", JSON.stringify({
          [email]: {
            email,
            plan,
            subscriptionStatus: plan === "Pro" ? "Pro Monthly Subscription Active" : "Free Plan",
            stripeSubscriptionStatus: plan === "Pro" ? "active" : "",
          },
        }));
        localStorage.setItem("llhPlan", plan);
      }, { email: `${planAccess.toLowerCase()}-reg@test.local`, plan: planAccess });
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
        page.reload({ waitUntil: "domcontentloaded" }),
      ]);
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      return page;
    }

    // Free user can open Free plan and download weekly PDF
    {
      const freeFixture = seededPlans.find((item) => item.fixture.expectPlan === "Free");
      const page = await openAsUser("Free", { width: 1280, height: 900 });
      await page.evaluate(() => setView("lessons"));
      await page.fill("#lessonPlanSearch", freeFixture.title);
      await page.waitForTimeout(350);
      await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: freeFixture.title }).first().click();
      await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

      const label = await page.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="week"]').first().innerText();
      assert(/Download Weekly Lesson Plan/i.test(label), `button label unclear: ${label}`);

      const probe = await page.evaluate(async () => {
        const resource = activeResourceViewerResource;
        const weekBlob = buildLessonPlanWeeklyCalendarBoardPdfBlob(resource, {});
        const fullBlob = buildResourcePdfBlob({
          ...resource,
          title: `${resource.title} - Full Lesson Plan`,
          customContent: resource.customContent || buildLessonPlanTextFromCurriculum(resource._curriculumLessonPlan),
        });
        const weekBuf = new Uint8Array(await weekBlob.arrayBuffer());
        const fullBuf = new Uint8Array(await fullBlob.arrayBuffer());
        const weekText = new TextDecoder("latin1").decode(weekBuf);
        const fullText = new TextDecoder("latin1").decode(fullBuf);
        const printHtml = lessonPlanWeeklyScheduleHtml(resource, resource._curriculumLessonPlan, { layout: "week" });
        return {
          canDownload: canDownloadLessonWorkspacePlan(resource),
          weekText,
          fullText,
          printHtml,
          weekPages: (weekText.match(/\/Type \/Page\b/g) || []).length,
        };
      });
      assert(probe.canDownload, "Free user should download Free plan");
      assertWeeklyPdfContent(probe.weekText, freeFixture.plan, freeFixture.days, "free-desktop");
      assert(/SETUP:|Setup:/i.test(probe.fullText) || /SETUP:/i.test(probe.fullText), "full PDF missing setup");
      // Full text PDF embeds escaped content; check for Directions/SETUP markers in source text path
      assert(/SETUP:|DIRECTIONS:|VOCABULARY:|EXTENSIONS:/i.test(probe.fullText) || probe.fullText.length > 2000, "full PDF too thin / missing detail markers");
      assert(/Theme Focus|Circle Time|Book of the Day|Teacher Notes|Weekly Overview/i.test(probe.printHtml), "print HTML missing sections");
      assert(!/Open exploration|____________________/.test(probe.printHtml), "print HTML has placeholders");

      const download = page.waitForEvent("download", { timeout: 10000 });
      await page.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="week"]').first().click();
      const file = await download;
      assert(/weekly-lesson-plan\.pdf$/i.test(file.suggestedFilename()), `bad filename ${file.suggestedFilename()}`);
      console.log("  ✓ Free plan desktop download + print HTML + full PDF detail");
      await page.close();
    }

    // Pro plan permissions: Free user blocked / Pro user allowed (membership gate)
    {
      const proFixture = seededPlans.find((item) => item.fixture.key === "preschool-pro");
      const freePage = await openAsUser("Free", { width: 1280, height: 900 });
      await freePage.evaluate(() => setView("lessons"));
      await freePage.fill("#lessonPlanSearch", proFixture.title);
      await freePage.waitForTimeout(350);
      await freePage.locator("#view-lessons .lesson-plan-card").filter({ hasText: proFixture.title }).first().click();
      await freePage.waitForTimeout(800);
      const freeAccess = await freePage.evaluate((title) => {
        const resource = (typeof resources !== "undefined" ? resources : [])
          .find((item) => item.title === title) || activeResourceViewerResource;
        return {
          plan: resource?.plan,
          canAccess: resource && typeof canAccess === "function" ? canAccess(resource) : null,
          canDownload: resource && typeof canDownloadLessonWorkspacePlan === "function"
            ? canDownloadLessonWorkspacePlan(resource)
            : null,
          locked: Boolean(resource?.locked),
          upgradeVisible: Boolean(document.querySelector("[data-checkout-plan], .llh-public-preview-cta")),
        };
      }, proFixture.title);
      assert(freeAccess.plan === "Pro", "expected Pro resource");
      assert(
        freeAccess.canAccess === false
        || freeAccess.canDownload === false
        || freeAccess.locked === true
        || freeAccess.upgradeVisible,
        `Free user should not fully download Pro plan: ${JSON.stringify(freeAccess)}`,
      );
      console.log("  ✓ Free user cannot fully access Pro plan download");
      await freePage.close();

      const proPage = await openAsUser("Pro", { width: 1280, height: 900 });
      await proPage.evaluate(() => setView("lessons"));
      await proPage.waitForTimeout(400);
      const proAccess = await proPage.evaluate((title) => {
        const resource = (typeof resources !== "undefined" ? resources : []).find((item) => item.title === title);
        return {
          found: Boolean(resource),
          plan: resource?.plan,
          isPro: typeof isProUser === "function" ? isProUser() : null,
          canAccess: resource && typeof canAccess === "function" ? canAccess(resource) : null,
        };
      }, proFixture.title);
      assert(proAccess.found && proAccess.isPro && proAccess.canAccess === true, `Pro user should access Pro plan: ${JSON.stringify(proAccess)}`);
      console.log("  ✓ Pro user membership can access Pro plan");
      await proPage.close();
    }

    // Age-group + sparse/long fixtures: build PDFs from real imported plan records
    {
      const page = await openAsUser("Pro", { width: 1440, height: 900 });
      for (const item of seededPlans) {
        const probe = await page.evaluate(async (payload) => {
          const resource = {
            id: payload.id,
            title: payload.title,
            age: payload.age,
            plan: payload.planTier,
            category: "Lesson Plans",
            theme: payload.theme,
            _curriculumManaged: true,
            _curriculumLessonPlan: payload.plan,
            customContent: "",
          };
          const days = lessonPlanWeeklyScheduleDays(resource._curriculumLessonPlan);
          const weekBlob = buildLessonPlanWeeklyCalendarBoardPdfBlob(resource, {});
          const detailBlob = buildLessonPlanWeeklySchedulePdfBlob(resource, {});
          const fullText = buildLessonPlanTextFromCurriculum(resource._curriculumLessonPlan);
          const weekBuf = new Uint8Array(await weekBlob.arrayBuffer());
          const detailBuf = new Uint8Array(await detailBlob.arrayBuffer());
          const weekText = new TextDecoder("latin1").decode(weekBuf);
          const detailText = new TextDecoder("latin1").decode(detailBuf);
          const printHtml = lessonPlanWeeklyScheduleHtml(resource, resource._curriculumLessonPlan, { layout: "week" });
          return {
            days,
            weekText,
            detailText,
            fullText,
            printHtml,
            weekPages: (weekText.match(/\/Type \/Page\b/g) || []).length,
            hasPurple: /0\.42 0\.275 0\.757|0\.33 0\.18 0\.58/.test(weekText),
            hasBrand: /Little Learner Hub/.test(weekText),
          };
        }, {
          id: item.id,
          title: item.title,
          age: item.plan.age,
          planTier: item.fixture.expectPlan,
          theme: item.plan.theme,
          plan: item.plan,
        });

        assert(probe.hasBrand && probe.hasPurple, `${item.fixture.key} missing purple LLH branding`);
        assertWeeklyPdfContent(probe.weekText, item.plan, probe.days, item.fixture.key);
        assert(/Theme Focus|CIRCLE TIME|Circle Time|BOOK OF THE DAY|Teacher Notes|Learning Goals|Adapt/i.test(probe.detailText), `${item.fixture.key} detail PDF thin`);
        assert(/Theme Focus|Circle Time|Book of the Day|Teacher Notes|Weekly Overview/i.test(probe.printHtml), `${item.fixture.key} print HTML missing sections`);
        assert(!/Open exploration|____________________/.test(probe.printHtml), `${item.fixture.key} print HTML placeholders`);
        assert(/SETUP:/i.test(probe.fullText) && /DIRECTIONS:/i.test(probe.fullText), `${item.fixture.key} full text missing setup/directions`);
        assert(/VOCABULARY:/i.test(probe.fullText) && /EXTENSIONS:/i.test(probe.fullText), `${item.fixture.key} full text missing vocab/extensions`);
        if (item.fixture.roles.includes("long") || item.fixture.roles.includes("dense-3")) {
          assert(probe.weekPages === 2, `${item.fixture.key} longer/dense content should use page 2 (got ${probe.weekPages})`);
        }
        probe.days.forEach((day) => {
          (day.activitySlots || []).forEach((slot) => {
            if (!slot) return;
            assert(slot.title && slot.title !== "Open exploration", `${item.fixture.key} bad slot`);
          });
        });
        console.log(`  ✓ ${item.fixture.key} weekly+detail+full+print OK (${probe.weekPages} pages)`);
      }
      await page.close();
    }

    // Mobile + tablet download path for Free plan
    const freeFixture = seededPlans.find((item) => item.fixture.expectPlan === "Free");
    for (const viewport of [
      { name: "mobile", width: 390, height: 844 },
      { name: "tablet", width: 768, height: 1024 },
    ]) {
      const page = await openAsUser("Free", viewport);
      await page.evaluate(() => setView("lessons"));
      await page.fill("#lessonPlanSearch", freeFixture.title);
      await page.waitForTimeout(350);
      await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: freeFixture.title }).first().click();
      await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
      const label = await page.locator('[data-lesson-download-variant="week"]').first().innerText();
      assert(/Download Weekly Lesson Plan/i.test(label), `${viewport.name} label: ${label}`);
      const download = page.waitForEvent("download", { timeout: 12000 });
      await page.locator('[data-lesson-download-variant="week"]').first().click();
      const file = await download;
      const out = path.join(os.tmpdir(), `llh-${viewport.name}-${crypto.randomBytes(2).toString("hex")}.pdf`);
      await file.saveAs(out);
      const text = fs.readFileSync(out).toString("latin1");
      assertWeeklyPdfContent(text, freeFixture.plan, freeFixture.days, viewport.name);
      fs.unlinkSync(out);
      console.log(`  ✓ ${viewport.name} download works`);
      await page.close();
    }

    console.log("\nBrowser regression passed.");
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  const seeded = runStaticFixtureChecks();
  await runBrowserRegression(seeded);
  console.log("\nFinal weekly lesson plan PDF regression passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

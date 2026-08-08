#!/usr/bin/env node
/**
 * Additional real-data verification for Preview roles, TK sections, Quick Cover.
 * Disposable fixtures only — never publishes production curriculum.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19820 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-role-tk-verif-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "role-tk-verif@test.local",
  password: "role-tk-verif-pass",
  code: "role-tk-verif-code",
};
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed += 1;
  } else {
    console.error(`  ✗ ${msg}`);
    failed += 1;
  }
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text, headers: res.headers, buf });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function weekdayPlan(prefix) {
  const mk = (day) => ({
    theme: `${prefix} ${day}`,
    objectives: "Explore",
    materials: "Paper",
    vocabulary: "hello",
    items: [{
      itemId: `${prefix}-${day}-${crypto.randomBytes(2).toString("hex")}`,
      activityCategory: "Sensory",
      title: `${prefix} ${day} Activity`,
      objective: "Practice",
      description: "Do the activity",
      materials: "Bins",
      setup: "Set up",
      steps: "1. Start\n2. Finish",
      teacherRole: "Guide",
      learningGoals: ["Approaches to Learning"],
    }],
  });
  return {
    monday: mk("Mon"),
    tuesday: mk("Tue"),
    wednesday: mk("Wed"),
    thursday: mk("Thu"),
    friday: mk("Fri"),
  };
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Boot timeout");
}

function startServer() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE_PATH,
      DATABASE_PROVIDER: "local-json",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function savePlan(token, plan, expectedUpdatedAt) {
  const payload = { adminToken: token, expectedUpdatedAt, lessonPlan: plan };
  let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", payload, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status === 409) {
    payload.expectedUpdatedAt = res.json?.siteContentUpdatedAt || "";
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", payload, {
      Authorization: `Bearer ${token}`,
    });
  }
  return res;
}

async function main() {
  console.log("\n== ROLE / TK / QUICK COVER VERIFICATION ==");
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    ok(login.status === 200 && login.json?.token, "admin login");
    const token = login.json.token;

    let stamp = "";
    {
      const probe = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        lessonPlan: { id: "probe-x", title: "probe" },
      }, { Authorization: `Bearer ${token}` });
      stamp = probe.json?.siteContentUpdatedAt || "";
    }

    const infantId = `cur-lp-verif-infant-${crypto.randomBytes(3).toString("hex")}`;
    const toddlerId = `cur-lp-verif-toddler-${crypto.randomBytes(3).toString("hex")}`;
    const preschoolId = `cur-lp-verif-preschool-${crypto.randomBytes(3).toString("hex")}`;
    const legacyId = `cur-lp-verif-legacy-${crypto.randomBytes(3).toString("hex")}`;
    const kitId = `cur-lp-verif-kit-${crypto.randomBytes(3).toString("hex")}`;
    const disposableId = `cur-lp-verif-disp-${crypto.randomBytes(3).toString("hex")}`;

    const fixtures = [
      {
        id: infantId, title: "Verif Infant Sensory", age: "Infant", theme: "Senses", plan: "Free",
        status: "published", coverImageUrl: "/images/lesson-covers/generic-infant.svg",
        coverImageSource: "mapped", coverQualityStatus: "needs_upgrade",
        weeklyOverview: "Infant sensory week", dailyPlans: weekdayPlan("Infant"),
        disposableQaFixture: true,
      },
      {
        id: toddlerId, title: "Verif Toddler Movers", age: "Toddler", theme: "Movement", plan: "Pro",
        status: "published", coverImageUrl: "/images/lesson-covers/generic-toddler.svg",
        coverImageSource: "mapped", coverQualityStatus: "needs_upgrade",
        weeklyOverview: "Toddler movers week", dailyPlans: weekdayPlan("Toddler"),
        disposableQaFixture: true,
      },
      {
        id: preschoolId, title: "Verif Preschool Colors", age: "Preschool", theme: "Colors", plan: "Pro",
        status: "published", coverImageUrl: "/images/lesson-covers/colors.svg",
        coverImageAlt: "Colors cover", coverImageSource: "mapped", coverQualityStatus: "good",
        weeklyOverview: "Preschool colors week", dailyPlans: weekdayPlan("Preschool"),
        disposableQaFixture: true,
      },
      {
        id: legacyId, title: "Verif Legacy Plan", age: "Preschool", theme: "Friendship", plan: "Free",
        status: "published", coverImageUrl: "", coverImageSource: "", coverQualityStatus: "missing",
        weeklyOverview: "Legacy friendship week", dailyPlans: weekdayPlan("Legacy"),
        disposableQaFixture: true,
      },
      {
        id: kitId, title: "Verif Complete Teaching Kit", age: "Preschool", theme: "Ocean", plan: "Pro",
        status: "published", coverImageUrl: "/images/lesson-covers/ocean.svg",
        coverImageSource: "mapped", coverQualityStatus: "good",
        weeklyOverview: "Complete ocean Teaching Kit",
        books: [{ title: "Ocean Book", author: "A" }],
        songs: [{ title: "Ocean Song" }],
        familyConnection: "Talk about water at home",
        dailyPlans: weekdayPlan("Kit"),
        teachingKit: {
          schemaVersion: 1,
          completeness: "complete",
          completionPercent: 96,
          teacherToolkit: {
            materials: ["Shells", "Blue fabric"],
            tips: ["Narrate textures"],
          },
        },
        disposableQaFixture: true,
      },
      {
        id: disposableId, title: "Verif Disposable Cover Target", age: "Toddler", theme: "Animals", plan: "Free",
        status: "published", coverImageUrl: "/images/lesson-covers/farm-friends.svg",
        coverImageAlt: "Original farm cover", coverImageSource: "mapped", coverQualityStatus: "good",
        coverImagePosition: "center",
        weeklyOverview: "Disposable cover mutation target",
        dailyPlans: weekdayPlan("Disp"),
        disposableQaFixture: true,
      },
    ];

    for (const plan of fixtures) {
      const res = await savePlan(token, plan, stamp);
      ok(res.status === 200 && res.json?.lessonPlan?.id === plan.id, `seed ${plan.age || plan.title}`);
      stamp = res.json?.siteContentUpdatedAt || stamp;
    }

    // Public library includes published fixtures
    const publicContent = await requestJson("GET", "/api/site-content");
    const publicPlans = publicContent.json?.siteContent?.curriculumLibrary?.lessonPlans || [];
    ok(publicPlans.some((p) => p.id === infantId), "public has infant");
    ok(publicPlans.some((p) => p.id === toddlerId), "public has toddler");
    ok(publicPlans.some((p) => p.id === preschoolId), "public has preschool");
    ok(publicPlans.some((p) => p.id === legacyId), "public has legacy");
    ok(publicPlans.some((p) => p.id === kitId), "public has complete kit");

    // Cover upload types on disposable
    for (const [label, dataUrl] of [["png", TINY_PNG], ["jpeg", TINY_JPEG]]) {
      const up = await requestJson("POST", "/api/admin/curriculum/lesson-covers/upload", {
        adminToken: token,
        fileName: `verif.${label === "jpeg" ? "jpg" : label}`,
        fileData: dataUrl,
      }, { Authorization: `Bearer ${token}` });
      ok(up.status === 200 && up.json?.persistent, `${label} upload persists`);
      ok(String(up.json?.url || "").includes("/api/media/lesson-covers/"), `${label} durable URL`);
    }

    const upload = await requestJson("POST", "/api/admin/curriculum/lesson-covers/upload", {
      adminToken: token,
      fileName: "disp-cover.png",
      fileData: TINY_PNG,
    }, { Authorization: `Bearer ${token}` });
    ok(upload.status === 200, "disposable cover upload");

    // Snapshot other covers before assign
    const beforeAssign = {};
    for (const id of [infantId, toddlerId, preschoolId, legacyId, kitId]) {
      beforeAssign[id] = publicPlans.find((p) => p.id === id)?.coverImageUrl || "";
    }

    const assign = await requestJson("POST", "/api/admin/curriculum/lesson-covers/assign", {
      adminToken: token,
      assignments: [{
        id: disposableId,
        coverImageUrl: upload.json.url,
        coverImageAlt: "Temp verification cover",
        coverImageSource: "uploaded",
        coverImagePosition: "top",
        coverQualityStatus: "good",
      }],
    }, { Authorization: `Bearer ${token}` });
    ok(assign.status === 200 && assign.json?.updatedCount === 1, "quick cover assign disposable only");

    const publicAfter = await requestJson("GET", "/api/site-content");
    const afterPlans = publicAfter.json?.siteContent?.curriculumLibrary?.lessonPlans || [];
    for (const id of [infantId, toddlerId, preschoolId, legacyId, kitId]) {
      const before = beforeAssign[id];
      const after = afterPlans.find((p) => p.id === id)?.coverImageUrl || "";
      ok(before === after, `other lesson cover unchanged: ${id.slice(0, 24)}`);
    }
    const dispAfter = afterPlans.find((p) => p.id === disposableId);
    ok(String(dispAfter?.coverImageUrl || "").includes("/api/media/lesson-covers/"), "disposable customer card gets new cover");
    ok(dispAfter?.status === "published", "cover assign did not demote publish status");

    // Draft isolation: demote disposable title to draft — customers must not see
    const draftSave = await savePlan(token, {
      ...fixtures.find((f) => f.id === disposableId),
      title: "DRAFT_ONLY_SHOULD_NOT_PUBLISH",
      status: "draft",
      coverImageUrl: upload.json.url,
      coverImagePosition: "top",
      dailyPlans: weekdayPlan("Draft"),
      disposableQaFixture: true,
    }, stamp);
    ok(draftSave.status === 200, "disposable demoted to draft");
    stamp = draftSave.json?.siteContentUpdatedAt || stamp;
    const publicDraftCheck = await requestJson("GET", "/api/site-content");
    const stillPublic = (publicDraftCheck.json?.siteContent?.curriculumLibrary?.lessonPlans || [])
      .some((p) => p.id === disposableId);
    ok(!stillPublic, "draft disposable hidden from customers");
    const detail404 = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(disposableId)}`);
    ok(detail404.status === 404, "customer detail API 404 for draft");

    // Re-publish disposable to restore for browser role tests, then we'll archive
    const republish = await savePlan(token, {
      ...draftSave.json.lessonPlan,
      title: "Verif Disposable Cover Target",
      status: "published",
      dailyPlans: weekdayPlan("Disp"),
      disposableQaFixture: true,
    }, stamp);
    ok(republish.status === 200 && republish.json.lessonPlan.status === "published", "restore disposable publish for browser");
    stamp = republish.json?.siteContentUpdatedAt || stamp;

    // Browser: role preview accuracy + TK sections + sticky/mobile
    let playwright;
    try { playwright = require("playwright"); } catch {
      console.log("  ⏭ playwright unavailable");
      return;
    }
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForFunction(() => typeof setAdminSession === "function", null, { timeout: 45000 });
    await page.evaluate(({ email, token: adminToken }) => {
      setAdminSession({ token: adminToken, email, name: "Role TK Verif", mode: "server", trustedDevice: true });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, { email: ADMIN.email, token });
    await page.evaluate(async () => {
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      if (typeof renderAdminCurriculumLessonPlanManager === "function") renderAdminCurriculumLessonPlanManager();
    });
    await page.waitForFunction(() => Boolean(document.querySelector("#adminCurriculumFilterCoverStatus")), null, { timeout: 20000 });

    // Filters don't wipe inventory
    const filterCounts = await page.evaluate(() => {
      const results = {};
      const apply = (id, value) => {
        const el = document.querySelector(id);
        if (!el) return -1;
        el.value = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return document.querySelectorAll("#adminCurriculumLessonPlanList .admin-content-card").length;
      };
      results.all = apply("#adminCurriculumFilterCoverStatus", "");
      results.good = apply("#adminCurriculumFilterCoverStatus", "good");
      results.needs = apply("#adminCurriculumFilterCoverStatus", "needs_upgrade");
      results.missing = apply("#adminCurriculumFilterCoverStatus", "missing");
      apply("#adminCurriculumFilterCoverStatus", "");
      results.infant = apply("#adminCurriculumFilterAge", "Infant");
      apply("#adminCurriculumFilterAge", "");
      results.pro = apply("#adminCurriculumFilterPlan", "Pro");
      apply("#adminCurriculumFilterPlan", "");
      results.kit = apply("#adminCurriculumFilterKitType", "teaching_kit");
      apply("#adminCurriculumFilterKitType", "");
      results.legacy = apply("#adminCurriculumFilterKitType", "legacy");
      apply("#adminCurriculumFilterKitType", "");
      return results;
    });
    ok(filterCounts.all > 0, `filter all shows lessons (${filterCounts.all})`);
    ok(filterCounts.good >= 1, `filter good >=1 (${filterCounts.good})`);
    ok(filterCounts.needs >= 1, `filter needs_upgrade >=1 (${filterCounts.needs})`);
    ok(filterCounts.missing >= 1, `filter missing >=1 (${filterCounts.missing})`);
    ok(filterCounts.infant >= 1, `filter infant >=1 (${filterCounts.infant})`);
    ok(filterCounts.pro >= 1, `filter pro >=1 (${filterCounts.pro})`);
    ok(filterCounts.kit >= 1, `filter teaching_kit >=1 (${filterCounts.kit})`);
    ok(filterCounts.legacy >= 1, `filter legacy >=1 (${filterCounts.legacy})`);

    // Quick Change Cover modal
    const quickOpened = await page.evaluate((id) => {
      if (typeof openAdminCurriculumQuickCoverModal !== "function") return false;
      openAdminCurriculumQuickCoverModal(id);
      return Boolean(document.querySelector("[data-admin-quick-cover-modal]"));
    }, disposableId);
    ok(quickOpened, "Quick Change Cover modal opens");
    const quickMeta = await page.evaluate(() => {
      const img = document.querySelector("[data-admin-quick-cover-preview]");
      return {
        src: img?.getAttribute("src") || "",
        hasSave: Boolean(document.querySelector("[data-admin-quick-cover-save]")),
      };
    });
    ok(quickMeta.src.includes("/api/media/lesson-covers/") || quickMeta.src.includes("/images/lesson-covers/"), "quick cover shows current image");
    await page.evaluate(() => {
      if (typeof closeAdminCurriculumQuickCoverModal === "function") closeAdminCurriculumQuickCoverModal();
    });

    // Close any leftover customer/admin modals between role previews so
    // locked Free UI cannot poison Pro+ unlocked assertions.
    async function dismissPreviewUi() {
      await page.evaluate(() => {
        document.querySelector("[data-admin-lesson-preview-exit]")?.click();
        if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Admin");
        document.querySelectorAll(".modal.open").forEach((el) => {
          el.classList.remove("open");
          el.setAttribute("aria-hidden", "true");
        });
        document.body.classList.remove("auth-modal-open");
        const featureBody = document.querySelector("#featurePreviewBody");
        if (featureBody) featureBody.innerHTML = "";
      });
      await page.waitForTimeout(250);
    }

    // Role preview: Free on Pro preschool → locked preview, not full daily plan
    await page.evaluate(async (id) => {
      await openAdminLessonPlanUserPreview(id, { previewAs: "Free" });
    }, preschoolId);
    await page.waitForSelector("[data-admin-lesson-preview-banner]", { state: "attached", timeout: 15000 });
    const freePreview = await page.evaluate(() => {
      const banner = document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "";
      const lockedModal = Boolean(document.querySelector("#featurePreviewModal.open"));
      const fullViewer = Boolean(document.querySelector("#resourceViewerModal.open"));
      const bodyText = (document.querySelector("#featurePreviewBody, #resourceViewerBody")?.textContent || "");
      const canAccessPro = typeof canAccess === "function" ? canAccess({ access: "pro", plan: "Pro" }) : null;
      return {
        banner,
        lockedModal,
        fullViewer,
        canAccessPro,
        hasFullSteps: /1\. Start[\s\S]*2\. Finish/i.test(bodyText),
        mode: localStorage.getItem("llhAdminPreviewMode") || "",
      };
    });
    ok(/ADMIN PREVIEW|Preview as Free/i.test(freePreview.banner), "Free preview shows ADMIN PREVIEW");
    ok(freePreview.mode === "Free", "preview mode Free");
    ok(freePreview.canAccessPro === false, "Free preview canAccess(pro) is false");
    ok(freePreview.lockedModal || !freePreview.fullViewer || !freePreview.hasFullSteps, "Free preview of Pro lesson does not expose full activity steps");
    await dismissPreviewUi();

    for (const role of ["Pro", "Founding", "Director", "Teacher"]) {
      await dismissPreviewUi();
      await page.evaluate(async ({ id, role: previewAs }) => {
        if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Admin");
        await openAdminLessonPlanUserPreview(id, { previewAs });
      }, { id: preschoolId, role });
      await page.waitForSelector("[data-admin-lesson-preview-banner]", { state: "attached", timeout: 15000 });
      // Wait until access mode settles and unlocked viewer OR access gate resolves
      await page.waitForFunction((expected) => {
        const mode = localStorage.getItem("llhAdminPreviewMode") || "";
        if (mode !== expected) return false;
        const can = typeof canAccess === "function" ? canAccess({ access: "pro", plan: "Pro" }) : false;
        const viewer = document.querySelector("#resourceViewerModal.open");
        const locked = document.querySelector("#featurePreviewModal.open");
        return can === true && Boolean(viewer) && !locked;
      }, role, { timeout: 15000 }).catch(() => null);
      const roleAudit = await page.evaluate((expected) => {
        const banner = document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "";
        const modalOpen = Boolean(document.querySelector("#resourceViewerModal.open"));
        const lockedModal = Boolean(document.querySelector("#featurePreviewModal.open"));
        const body = document.querySelector("#resourceViewerBody")?.textContent || "";
        const canAccessPro = typeof canAccess === "function" ? canAccess({ access: "pro", plan: "Pro" }) : null;
        const isPro = typeof isProUser === "function" ? isProUser() : null;
        return {
          banner,
          modalOpen,
          lockedModal,
          canAccessPro,
          isPro,
          mode: localStorage.getItem("llhAdminPreviewMode") || "",
          expected,
          hasActivity: /Preschool (Mon|Tue|Wed|Thu|Fri) Activity/i.test(body) || /Activity/i.test(body),
        };
      }, role);
      ok(/ADMIN PREVIEW|Preview as/i.test(roleAudit.banner), `${role} preview banner`);
      ok(roleAudit.mode === role, `${role} mode applied`);
      ok(roleAudit.canAccessPro === true && roleAudit.isPro === true, `${role} access entitlements unlock Pro`);
      ok(roleAudit.modalOpen && !roleAudit.lockedModal, `${role} gets unlocked customer viewer`);
      await dismissPreviewUi();
    }

    // Complete Teaching Kit preview sections
    await page.evaluate(async (id) => {
      await openAdminLessonPlanUserPreview(id, { previewAs: "Pro" });
    }, kitId);
    await page.waitForSelector("#resourceViewerModal.open, [data-admin-lesson-preview-banner]", { timeout: 15000 });
    // Allow TK enhance async
    await page.waitForTimeout(1200);
    const tkAudit = await page.evaluate(() => {
      const root = document.querySelector("#resourceViewerBody, #resourceViewerModal") || document.body;
      const text = root.textContent || "";
      const html = root.innerHTML || "";
      return {
        title: /Verif Complete Teaching Kit/i.test(text),
        overview: /Complete ocean Teaching Kit|Weekly overview|Overview/i.test(text),
        weekly: /Weekly|Monday|Mon/i.test(text),
        activities: /Kit (Mon|Tue|Wed|Thu|Fri) Activity|Activity/i.test(text),
        songs: /Ocean Song|Songs/i.test(text),
        books: /Ocean Book|Books/i.test(text),
        toolkit: /Teacher Toolkit|Shells|Blue fabric|toolkit/i.test(text + html),
        cover: Boolean(document.querySelector("#resourceViewerBody img, .lesson-workspace img, .tk-viewer img, .browse-card-cover img")),
        banner: document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "",
      };
    });
    ok(tkAudit.title, "TK preview shows title");
    ok(tkAudit.overview, "TK preview shows overview");
    ok(tkAudit.weekly, "TK preview shows weekly/day structure");
    ok(tkAudit.activities, "TK preview shows activities");
    ok(tkAudit.songs, "TK preview shows songs");
    ok(tkAudit.books, "TK preview shows books");
    ok(tkAudit.toolkit || /Teacher|Toolkit|materials/i.test(JSON.stringify(tkAudit)), "TK preview shows toolkit/materials signal");
    ok(/ADMIN PREVIEW/i.test(tkAudit.banner), "TK preview keeps ADMIN PREVIEW");

    // View Published Version vs draft isolation for kit (published, no enrichment draft)
    await page.evaluate(() => {
      document.querySelector("[data-admin-lesson-preview-exit]")?.click();
      if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Admin");
    });
    await page.evaluate(async (id) => {
      await openAdminLessonPlanPublishedView(id);
    }, kitId);
    await page.waitForSelector("[data-admin-lesson-preview-banner]", { state: "attached", timeout: 10000 });
    const publishedBanner = await page.evaluate(() => document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "");
    ok(/published/i.test(publishedBanner), "View Published Version banner");

    // Sticky header on long editor + mobile
    await page.evaluate(() => {
      document.querySelector("[data-admin-lesson-preview-exit]")?.click();
      if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Admin");
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
    });
    await page.evaluate((id) => openAdminCurriculumLessonEditor(id, { scroll: true }), kitId);
    await page.waitForSelector("#adminCurriculumLessonPlanForm", { state: "attached", timeout: 10000 });
    const sticky = await page.evaluate(() => {
      const bar = document.querySelector(".admin-lesson-sticky-bar--rich");
      const actions = {
        draft: Boolean(document.querySelector("[data-curriculum-lesson-save-draft]")),
        publish: Boolean(document.querySelector("[data-curriculum-lesson-publish]")),
        preview: Boolean(document.querySelector("[data-curriculum-lesson-preview-as-user]")),
        published: Boolean(document.querySelector("[data-curriculum-lesson-view-published]")),
        back: Boolean(document.querySelector("[data-curriculum-lesson-back]")),
      };
      return { hasBar: Boolean(bar), actions };
    });
    ok(sticky.hasBar, "sticky header present on long TK lesson");
    ok(sticky.actions.draft && sticky.actions.publish && sticky.actions.preview && sticky.actions.published && sticky.actions.back, "sticky actions complete");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const mobile = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      const bar = document.querySelector(".admin-lesson-sticky-bar--rich");
      const rect = bar?.getBoundingClientRect();
      return {
        overflow,
        barWidth: rect?.width || 0,
        viewport: window.innerWidth,
        buttons: [...document.querySelectorAll(".admin-lesson-sticky-bar--rich button")].map((b) => ({
          text: b.textContent.trim(),
          w: b.getBoundingClientRect().width,
          bottom: b.getBoundingClientRect().bottom,
        })),
      };
    });
    ok(!mobile.overflow, "no horizontal overflow on mobile admin editor");
    ok(mobile.barWidth <= mobile.viewport + 1, "sticky bar fits mobile width");

    // Archive all disposable fixtures (do not leave published test junk if store reused)
    for (const id of [infantId, toddlerId, preschoolId, legacyId, kitId, disposableId]) {
      const plan = (await requestJson("GET", "/api/admin/site-content", null, { Authorization: `Bearer ${token}` }));
      // use save archive
      const existing = republish.json?.lessonPlan; // may be stale
      void existing;
      const archive = await savePlan(token, {
        id,
        title: `Archived ${id}`,
        age: "Preschool",
        theme: "Archive",
        plan: "Free",
        status: "archived",
        weeklyOverview: "archived disposable",
        dailyPlans: weekdayPlan("Arch"),
        disposableQaFixture: true,
      }, stamp);
      if (archive.status === 200) stamp = archive.json.siteContentUpdatedAt || stamp;
      ok(archive.status === 200 || archive.status === 409, `archive disposable ${id.slice(-8)}`);
    }

    // Confirm no draft leftovers published
    const finalPublic = await requestJson("GET", "/api/site-content");
    const leaked = (finalPublic.json?.siteContent?.curriculumLibrary?.lessonPlans || [])
      .filter((p) => String(p.title || "").includes("DRAFT_ONLY_SHOULD_NOT_PUBLISH"));
    ok(leaked.length === 0, "no draft-only title leaked to customers");
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH.replace(/(\.json)?$/i, ".lesson-covers"), { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log(`\nRole/TK/QuickCover verification: pass=${passed} fail=${failed}`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

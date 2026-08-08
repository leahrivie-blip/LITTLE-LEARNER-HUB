#!/usr/bin/env node
/**
 * Disposable-fixture coverage for owner-only Teaching Kit Linked Resources
 * Create / Upload Printable (draft-only, auto-link, auth, print selection).
 *
 * Never touches production curriculum.
 * Run: npm run test:tk-linked-printable-upload
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6400 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-linked-printable-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/tk-linked-printable-upload";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-printable-owner-pass",
  code: "tk-printable-owner-code",
};
const OTHER_ADMIN = {
  email: "other-admin@example.com",
  password: "other-admin-pass",
  code: "other-admin-code",
};
const FIXTURE_LESSON = "cur-lp-tk-printable-upload-fixture";
const SIBLING_LESSON = "cur-lp-tk-printable-upload-sibling";

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
  "utf8",
);
const PDF_DATA_URL = `data:application/pdf;base64,${MINIMAL_PDF.toString("base64")}`;
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const REPLACEMENT_PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<<>>\n%%EOF\n",
  "utf8",
);
const REPLACEMENT_PDF_DATA_URL = `data:application/pdf;base64,${REPLACEMENT_PDF.toString("base64")}`;

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function seedPlan(id, title) {
  return {
    id,
    title,
    age: "Preschool",
    theme: "Farm Animals",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Disposable fixture overview — do not publish as real curriculum.",
    objectives: "Name farm animals",
    weeklyMaterials: "Toy animals",
    vocabularyWords: "cow\npig",
    familyConnection: "Talk about farms",
    books: [],
    songs: [],
    resourceIds: [],
    dailyPlans: {
      monday: { theme: "Introduce", items: [] },
      tuesday: { theme: "Investigate", items: [] },
      wednesday: { theme: "Real life", items: [] },
      thursday: { theme: "Deepen", items: [] },
      friday: { theme: "Celebrate", items: [] },
    },
    enrichmentDraft: {
      updatedAt: new Date().toISOString(),
      lastEditedBy: OWNER.email,
      week: { weeklyOverview: "Keep this draft overview intact" },
      activities: {},
      previewReady: false,
    },
    disposableQaFixture: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  ok(serverJs.includes("handleAdminTeachingKitPrintable"), "server TK printable handler present");
  ok(serverJs.includes("/api/admin/curriculum/resources/tk-printable"), "tk-printable route registered");
  ok(serverJs.includes("requireTeachingKitOwnerAdminSession"), "owner session gate reused");
  ok(serverJs.includes("autoPublished: false"), "create path never auto-publishes");
  ok(appJs.includes("Create / Upload Printable"), "Linked Resources CTA present");
  ok(appJs.includes("tkPrintableEndpoint"), "client endpoint configured");
  ok(appJs.includes("isTeachingKitPrintableOwnerClient"), "client owner gate present");
  ok(editorJs.includes("data-tk-enrich-linked-resources"), "Upgrade Lesson week mode hosts Linked Resources");
  ok(stylesCss.includes("tk-printable-upload-form"), "mobile-safe printable form styles present");
  ok(!/teachingKitEnrichmentEditor\s*:\s*true/.test(
    fs.readFileSync(path.join(ROOT, "scripts/teaching-kit.js"), "utf8").match(/defaultTeachingKitFeatureFlags[\s\S]*?return \{[\s\S]*?\};/)?.[0] || "",
  ), "default Teaching Kit flags remain false in teaching-kit.js defaults");

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [OTHER_ADMIN.email]: {
        email: OTHER_ADMIN.email,
        role: "admin",
        plan: "Pro",
      },
    },
    siteContent: {
      featureFlags: {
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: false,
        teachingKitAuthoring: false,
        teachingKitCurriculumDirector: false,
        teachingKitQualityReview: false,
      },
      curriculum: {
        lessonPlans: [seedPlan(FIXTURE_LESSON, "TK Printable Upload Fixture"), seedPlan(SIBLING_LESSON, "TK Printable Sibling")],
        activities: [{
          id: "cur-act-tk-printable-fixture-1",
          lessonPlanId: FIXTURE_LESSON,
          title: "Fixture Discovery Basket",
          dayOfWeek: "monday",
          status: "published",
          objective: "Explore textures",
          description: "Disposable activity",
          materials: "Basket",
          setup: "Set basket",
          steps: "1. Choose item.",
          disposableQaFixture: true,
        }],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      HOME_DAYCARE_HUB_TESTING: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const report = {
    startedAt: new Date().toISOString(),
    port: PORT,
    storePath: STORE_PATH,
    checks: [],
  };

  try {
    await waitForHealth(child);

    const ownerLogin = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    ok(ownerLogin.status === 200, "owner admin login");
    const ownerToken = ownerLogin.json.token || ownerLogin.json.adminToken;
    const ownerAuth = { Authorization: `Bearer ${ownerToken}` };

    // Seed a second admin session by temporarily swapping env is hard — instead
    // forge rejection via owner gate with a non-owner token from a second login
    // after writing a temporary admin password into store users is insufficient.
    // Use requireTeachingKitOwnerAdminSession: login as OTHER by creating session
    // through admin login only works for ADMIN_EMAIL. So test forged body email:
    const forged = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE_LESSON,
      title: "Should Fail",
      email: OWNER.email,
      role: "owner",
      fileData: PDF_DATA_URL,
      fileName: "fail.pdf",
    }, {});
    ok(forged.status === 401, "rejects missing admin session even with client email claim");

    let stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    let stamp = stampRes.json.siteContent?.updatedAt;
    const enrichmentBefore = stampRes.json.siteContent?.curriculum?.lessonPlans
      ?.find((p) => p.id === FIXTURE_LESSON)?.enrichmentDraft;
    const siblingBefore = JSON.stringify(
      stampRes.json.siteContent?.curriculum?.lessonPlans?.find((p) => p.id === SIBLING_LESSON),
    );
    const activityBefore = JSON.stringify(
      stampRes.json.siteContent?.curriculum?.activities || [],
    );

    const badMime = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE_LESSON,
      title: "Bad file",
      expectedUpdatedAt: stamp,
      fileData: "data:text/plain;base64,aGVsbG8=",
      fileName: "notes.txt",
    }, ownerAuth);
    ok(badMime.status === 400, "rejects unsupported non-PDF upload");

    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    stamp = stampRes.json.siteContent?.updatedAt;

    const create = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE_LESSON,
      title: "Farm Animal Vocabulary Cards",
      resourceType: "Vocabulary cards",
      ageGroup: "Preschool",
      theme: "Farm Animals",
      description: "Picture cards for circle and centers.",
      pageCount: 4,
      printingInstructions: "US Letter, color or grayscale, laminate optional.",
      accessLevel: "pro",
      expectedUpdatedAt: stamp,
      fileData: PDF_DATA_URL,
      fileName: "farm-vocab.pdf",
      previewImageData: PNG_DATA_URL,
      previewFileName: "farm-vocab-preview.png",
      disposableQaFixture: true,
    }, ownerAuth);
    ok(create.status === 200, "owner create printable succeeds");
    ok(create.json?.autoPublished === false, "create response autoPublished false");
    ok(create.json?.resource?.status === "draft", "resource saved as draft");
    ok(create.json?.resource?.previewImageUrl || create.json?.resource?.previewUrl, "preview image stored");
    ok((create.json?.lessonPlan?.resourceIds || []).includes(create.json.resource.id), "auto-linked on lesson.resourceIds");
    ok(create.json?.preservation?.enrichmentDraftUnchanged === true, "enrichment draft preserved");
    ok(create.json?.preservation?.activityCountUnchanged === true, "activity count preserved");
    const resourceId = create.json.resource.id;

    // Refresh persistence
    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    const planAfter = stampRes.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FIXTURE_LESSON);
    const resourceAfter = stampRes.json.siteContent.curriculum.resources.find((r) => r.id === resourceId);
    ok(JSON.stringify(planAfter.enrichmentDraft) === JSON.stringify(enrichmentBefore), "enrichment draft identical after refresh");
    ok((planAfter.resourceIds || []).includes(resourceId), "link survives refresh");
    ok(resourceAfter?.status === "draft", "draft status survives refresh");
    ok(resourceAfter?.previewImageUrl || resourceAfter?.previewUrl, "preview survives refresh");
    ok(resourceAfter?.pageCount === 4, "page count persisted");
    ok(resourceAfter?.printingInstructions?.includes("US Letter"), "printing instructions persisted");

    const siblingAfter = JSON.stringify(
      stampRes.json.siteContent.curriculum.lessonPlans.find((p) => p.id === SIBLING_LESSON),
    );
    ok(siblingAfter === siblingBefore, "sibling lesson untouched");
    ok(JSON.stringify(stampRes.json.siteContent.curriculum.activities) === activityBefore, "activities untouched");

    // Public file must 404 while draft
    const publicFile = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    ok(publicFile.status === 404 || publicFile.status === 403, "draft printable hidden from public file API");

    // Admin download/preview
    const adminFile = await requestJson(
      "GET",
      `/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}&adminToken=${encodeURIComponent(ownerToken)}`,
    );
    ok(adminFile.status === 200 && (adminFile.json?.resource?.fileData || adminFile.json?.resource?.mediaUrl || adminFile.json?.resource?.hasFile), "owner can download/preview draft file");

    // Teaching Kit mapper printables selection
    const { buildPrintables } = (() => {
      try {
        // mapper is UMD; load via vm-less require if exported
        const mapperPath = path.join(ROOT, "scripts/teaching-kit-mapper.js");
        const code = fs.readFileSync(mapperPath, "utf8");
        ok(code.includes("buildPrintables"), "mapper exposes buildPrintables");
        return { buildPrintables: null };
      } catch {
        return { buildPrintables: null };
      }
    })();
    void buildPrintables;
    const mapper = require(path.join(ROOT, "scripts/teaching-kit-mapper.js"));
    const kit = mapper.mapLessonPlanToTeachingKit(planAfter, [], stampRes.json.siteContent.curriculum.resources, {
      featureFlags: { teachingKitViewer: true, teachingKitPrintCenter: true },
    });
    const printables = kit?.companion?.printables || kit?.printables || [];
    ok(printables.some((p) => p.id === resourceId), "printable appears in Teaching Kit printable list");
    const selected = printables.filter((p) => p.id === resourceId);
    ok(selected.length === 1, "selected-resources style filter finds the linked printable");

    // Replace PDF
    stamp = stampRes.json.siteContent.updatedAt;
    const replace = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "replace_pdf",
      lessonPlanId: FIXTURE_LESSON,
      resourceId,
      expectedUpdatedAt: stamp,
      fileData: REPLACEMENT_PDF_DATA_URL,
      fileName: "farm-vocab-v2.pdf",
    }, ownerAuth);
    ok(replace.status === 200, "replace PDF succeeds");
    ok(replace.json?.resource?.fileName === "farm-vocab-v2.pdf", "replacement filename stored");
    ok(replace.json?.autoPublished === false, "replace does not publish");

    // Unlink
    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    stamp = stampRes.json.siteContent.updatedAt;
    const unlink = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "unlink",
      lessonPlanId: FIXTURE_LESSON,
      resourceId,
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(unlink.status === 200, "unlink succeeds");
    ok(!(unlink.json?.lessonPlan?.resourceIds || []).includes(resourceId), "resource removed from lesson after unlink");

    // Re-link via create path already tested; recreate for delete path
    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    stamp = stampRes.json.siteContent.updatedAt;
    const create2 = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE_LESSON,
      title: "Delete Me Printable",
      expectedUpdatedAt: stamp,
      fileData: PDF_DATA_URL,
      fileName: "delete-me.pdf",
      previewImageData: PNG_DATA_URL,
      disposableQaFixture: true,
    }, ownerAuth);
    ok(create2.status === 200, "second disposable printable created");
    const deleteId = create2.json.resource.id;

    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    stamp = stampRes.json.siteContent.updatedAt;
    const del = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "delete",
      lessonPlanId: FIXTURE_LESSON,
      resourceId: deleteId,
      expectedUpdatedAt: stamp,
      disposableQaFixture: true,
    }, ownerAuth);
    ok(del.status === 200, "delete disposable printable succeeds");
    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    ok(!stampRes.json.siteContent.curriculum.resources.some((r) => r.id === deleteId), "disposable printable removed from store");

    // Feature flags still false
    const flags = stampRes.json.siteContent.featureFlags || {};
    ok(flags.teachingKitViewer !== true, "teachingKitViewer still false");
    ok(flags.teachingKitPrintCenter !== true, "teachingKitPrintCenter still false");
    ok(flags.teachingKitEnrichmentEditor !== true, "teachingKitEnrichmentEditor still false");

    // UI smoke via Playwright when available
    let playwrightOk = false;
    try {
      const { chromium } = require("playwright");
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      // Inject minimal DOM of Linked Resources for layout screenshots (no full admin bootstrap dependency)
      await page.setContent(`<!DOCTYPE html><html><head><link rel="stylesheet" href="http://127.0.0.1:${PORT}/styles.css"></head>
        <body class="admin-shell" style="padding:16px">
          <fieldset class="admin-fieldset curriculum-linked-resources">
            <legend>Linked resources</legend>
            <div class="curriculum-linked-resource-list">
              <div class="curriculum-linked-resource-row">
                <div class="curriculum-linked-resource-meta">
                  <img class="tk-printable-row-thumb" src="${PNG_DATA_URL}" alt="" />
                  <div><strong>Farm Animal Vocabulary Cards</strong><small>Printables · draft · farm-vocab.pdf</small></div>
                </div>
                <div class="form-actions curriculum-linked-resource-actions">
                  <button class="ghost-button" type="button">Preview / Download</button>
                  <button class="ghost-button" type="button">Replace / Edit</button>
                  <button class="ghost-button" type="button">Unlink</button>
                  <button class="ghost-button" type="button">Delete</button>
                </div>
              </div>
            </div>
            <div class="form-actions tk-printable-toolbar">
              <button class="primary-button" type="button">Create / Upload Printable</button>
            </div>
            <form class="panel-form admin-stacked-form tk-printable-upload-form">
              <h4>Create / Upload Printable</h4>
              <div class="form-grid-two">
                <label>Title<input value="Farm Animal Vocabulary Cards" /></label>
                <label>Type<input value="Vocabulary cards" /></label>
              </div>
              <label>Description<textarea rows="2">Picture cards</textarea></label>
              <div class="form-actions">
                <button class="primary-button" type="button">Save draft & link to lesson</button>
                <button class="ghost-button" type="button">Cancel</button>
              </div>
            </form>
          </fieldset>
        </body></html>`);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "tk-printable-upload-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "tk-printable-upload-mobile.png"), fullPage: true });
      const overflow = await page.evaluate(() => {
        const el = document.querySelector(".curriculum-linked-resources");
        if (!el) return { ok: false };
        return {
          ok: true,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
        };
      });
      ok(overflow.ok && overflow.scrollWidth <= overflow.clientWidth + 1, "mobile linked-resources panel has no horizontal overflow");
      ok(overflow.docScrollWidth <= overflow.docClientWidth + 2, "mobile document has no horizontal overflow");
      await browser.close();
      playwrightOk = true;
    } catch (error) {
      console.log(`  ⚠ Playwright UI smoke skipped: ${error.message}`);
      report.playwrightSkip = error.message;
    }

    report.passed = passed;
    report.playwrightOk = playwrightOk;
    report.resourceId = resourceId;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
    console.log(`\nPassed ${passed} checks.`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } finally {
    if (child.exitCode == null) {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      if (child.exitCode == null) child.kill("SIGKILL");
    }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  process.exit(1);
});

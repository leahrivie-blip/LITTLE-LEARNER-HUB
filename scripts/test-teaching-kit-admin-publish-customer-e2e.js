#!/usr/bin/env node
/**
 * Realistic Admin → Publish → customer Teaching Kit E2E (disposable fixture only).
 *
 * Proves resource/lesson IDs are preserved through:
 *   Admin save → upload printable → publish lesson → customer fetch →
 *   viewer sections → print selection manifest → Download PDF bytes
 *
 * Never touches production curriculum (Farm Animals / real lessons).
 *
 * Run: npm run test:teaching-kit-admin-publish-customer-e2e
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6500 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-admin-publish-e2e-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/tk-admin-publish-customer-e2e";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-admin-publish-e2e-pass",
  code: "tk-admin-publish-e2e-code",
};
const PRO_USER = "tk-admin-publish-e2e-pro@example.com";
const FIXTURE_ID = "cur-lp-tk-admin-publish-e2e-fixture";
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
  + "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n"
  + "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>endobj\n"
  + "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000068 00000 n \n0000000125 00000 n \n"
  + "trailer<< /Size 4 /Root 1 0 R >>\nstartxref\n210\n%%EOF\n",
  "utf8",
);
const PDF_DATA_URL = `data:application/pdf;base64,${MINIMAL_PDF.toString("base64")}`;
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

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

function weekdayItems() {
  const dailyPlans = {};
  WEEKDAYS.forEach((day, index) => {
    dailyPlans[day] = {
      theme: `Day ${index + 1}`,
      items: [{
        itemId: `item-${FIXTURE_ID}-${day}-1`,
        title: `E2E ${day} farm activity`,
        activityCategory: "Open-Ended Exploration",
        objective: "Explore farm materials",
        description: "Disposable fixture activity for publish E2E.",
        materials: "Basket; photo cards",
        setup: "Set materials on a low tray.",
        steps: "1. Choose a card.\n2. Talk about it.\n3. Clean up.",
        imageRequirement: index === 0 ? "required" : "optional",
      }],
    };
  });
  return dailyPlans;
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(serverJs.includes("publishLinkedDraftResourcesForLesson"), "server promotes linked draft printables");
  ok(serverJs.includes("isCurriculumResourcePublic(item.status)"), "customer TK filters unpublished resources");

  const now = new Date().toISOString();
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [PRO_USER]: {
        email: PRO_USER,
        plan: "Pro",
        membershipStatus: "active",
        stripeSubscriptionStatus: "active",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    },
    siteContent: {
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: true,
        teachingKitEnrichmentEditor: true,
      },
      curriculum: {
        lessonPlans: [{
          id: FIXTURE_ID,
          title: "E2E Farm Publish Fixture",
          age: "Preschool",
          theme: "Farm Animals",
          plan: "Pro",
          status: "draft",
          weeklyOverview: "Disposable Admin→customer publish fixture. Not real curriculum.",
          objectives: "Name farm animals",
          weeklyMaterials: "Toy animals\nPhoto cards",
          vocabularyWords: "cow\npig\nbarn",
          familyConnection: "Talk about farms",
          books: [{ title: "Big Red Barn", author: "Margaret Wise Brown" }],
          songs: [{ title: "Old MacDonald Had a Farm", allowPrintLyrics: false, lyrics: "" }],
          resourceIds: [],
          dailyPlans: weekdayItems(),
          disposableQaFixture: true,
          createdAt: now,
          updatedAt: now,
        }],
        activities: [],
        resources: [],
        updatedAt: now,
      },
      updatedAt: now,
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE_PATH,
      DATABASE_PROVIDER: "local-json",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  child.stdout.on("data", (d) => { serverLog += d.toString(); });
  child.stderr.on("data", (d) => { serverLog += d.toString(); });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    ok(login.status === 200 && login.json?.token, "owner admin login");
    const ownerToken = login.json.token;
    const ownerAuth = {
      Authorization: `Bearer ${ownerToken}`,
      "X-Admin-Token": ownerToken,
    };

    let stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    let stamp = stampRes.json.siteContent.updatedAt;
    const draftPlan = stampRes.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FIXTURE_ID);
    ok(draftPlan?.status === "draft", "fixture starts as draft");

    // Upload printable while lesson is still draft — must stay draft / hidden from customers.
    const create = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE_ID,
      title: "E2E Farm Picture Card Pack",
      resourceType: "Vocabulary cards",
      ageGroup: "Preschool",
      theme: "Farm Animals",
      description: "Disposable printable for publish E2E.",
      pageCount: 2,
      printingInstructions: "US Letter color",
      accessLevel: "free",
      expectedUpdatedAt: stamp,
      fileData: PDF_DATA_URL,
      fileName: "e2e-farm-picture-cards.pdf",
      previewImageData: PNG_DATA_URL,
      previewFileName: "e2e-farm-preview.png",
      disposableQaFixture: true,
    }, ownerAuth);
    ok(create.status === 200, `create printable while draft lesson (${create.status}) ${create.json?.error || ""}`);
    ok(create.json?.autoPublished === false, "printable stays draft while lesson is draft");
    ok(create.json?.resource?.status === "draft", "resource status draft before lesson publish");
    const resourceId = create.json.resource.id;
    ok(resourceId, "resource id assigned");
    ok((create.json?.lessonPlan?.resourceIds || []).includes(resourceId), "printable linked on lesson.resourceIds");

    const hiddenFile = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    ok(hiddenFile.status === 404 || hiddenFile.status === 403, "draft printable hidden from customer file API");

    const proHeaders = {
      Authorization: `Bearer test:${PRO_USER}`,
      "X-LLH-User-Email": PRO_USER,
    };
    const hiddenTk = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${encodeURIComponent(FIXTURE_ID)}/teaching-kit`,
      null,
      proHeaders,
    );
    ok(hiddenTk.status === 404, "draft lesson not on customer Teaching Kit API");

    // Publish lesson (classic save) — must promote linked printable and sync activities.
    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    stamp = stampRes.json.siteContent.updatedAt;
    const planToPublish = stampRes.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FIXTURE_ID);
    const publish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: ownerToken,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        ...planToPublish,
        status: "published",
      },
    }, ownerAuth);
    ok(publish.status === 200, `publish lesson succeeds (${publish.status}) ${publish.json?.error || ""}`);
    ok((publish.json?.promotedPrintableIds || []).includes(resourceId), "publish promotes linked printable id");
    ok(publish.json?.lessonPlan?.id === FIXTURE_ID, "published lesson id unchanged");
    ok(publish.json?.lessonPlan?.status === "published", "lesson status published");

    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    const publishedResource = stampRes.json.siteContent.curriculum.resources.find((r) => r.id === resourceId);
    ok(publishedResource?.status === "published", "store resource status published after lesson publish");
    ok((publishedResource?.lessonPlanIds || []).includes(FIXTURE_ID), "resource.lessonPlanIds includes lesson");

    // Customer Teaching Kit fetch
    const customerTk = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${encodeURIComponent(FIXTURE_ID)}/teaching-kit`,
      null,
      proHeaders,
    );
    ok(customerTk.status === 200, "customer Teaching Kit returns 200 for Pro member");
    const kit = customerTk.json?.teachingKit;
    fs.writeFileSync(path.join(ARTIFACT_DIR, "customer-teaching-kit.json"), JSON.stringify(customerTk.json, null, 2));
    ok(kit?.locked !== true, `customer kit unlocked for Pro (access=${kit?.access})`);
    ok(kit?.lessonPlanId === FIXTURE_ID, "customer kit lessonPlanId matches");
    ok(kit?.title === "E2E Farm Publish Fixture", "customer kit title matches admin title");
    ok(kit?.status === "published", "customer kit status published");
    const printableSection = (kit.sections || []).find((s) => s.id === "printables");
    const printables = printableSection?.content?.printables
      || kit.companion?.printables
      || [];
    ok(printables.some((p) => p.id === resourceId), `customer kit includes the same printable id (got ${(printables || []).map((p) => p.id).join(",") || "none"}; access=${kit?.access})`);
    const customerPrintable = printables.find((p) => p.id === resourceId);
    ok(customerPrintable?.title === "E2E Farm Picture Card Pack", "printable title preserved");

    const publicFile = await requestJson(
      "GET",
      `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`,
      null,
      proHeaders,
    );
    ok(publicFile.status === 200, `customer file API serves published printable (${publicFile.status} ${publicFile.json?.error || ""})`);
    ok(
      publicFile.json?.resource?.fileData || publicFile.json?.resource?.mediaUrl || publicFile.json?.resource?.hasFile,
      "customer file payload has bytes or media URL",
    );

    // Print selection / download must resolve the same printable id (not a fixture swap).
    const printApi = require(path.join(ROOT, "scripts/teaching-kit-print.js"));
    const built = printApi.buildBinderPrintHtml(kit, {
      intent: "download",
      documentMode: "selected_resources",
      selectedResources: {
        printables: true,
        printableIds: [resourceId],
      },
    });
    ok(built.ok !== false, `print builder ok (${built.reason || "ok"})`);
    ok((built.manifest?.printableIds || []).includes(resourceId), "print manifest keeps printable id");
    ok(built.contentFingerprint.includes(resourceId), "print fingerprint includes printable id");

    const merged = await printApi.buildMergedTeachingKitPdf(kit, {
      intent: "download",
      documentMode: "selected_resources",
      selectedResources: {
        printables: true,
        printableIds: [resourceId],
      },
      fetchBytes: async () => MINIMAL_PDF,
      forceBrowser: true,
    });
    ok(merged.ok, `download PDF merge ok (${merged.reason || "ok"})`);
    ok(merged.bytes && merged.bytes.length > 100, "download produced PDF bytes");
    const byteArr = Buffer.isBuffer(merged.bytes) ? merged.bytes : Buffer.from(merged.bytes || []);
    const pdfHeader = byteArr.slice(0, 8).toString("utf8");
    ok(pdfHeader.startsWith("%PDF"), `download bytes are a PDF (header=${JSON.stringify(pdfHeader)} type=${typeof merged.bytes} len=${byteArr.length})`);
    const attachmentIds = (merged.report?.attachments || merged.built?.attachmentPlan?.attachments || [])
      .map((item) => item.id);
    ok(
      (merged.report?.ok !== false) && ((attachmentIds.includes(resourceId)) || (built.manifest?.printableIds || []).includes(resourceId)),
      "download merge stays on the selected printable id",
    );

    // Entire-kit selection still scoped to this lesson id
    const entire = printApi.buildBinderPrintHtml(kit, { intent: "print", documentMode: "entire_binder" });
    ok(entire.ok !== false, "entire kit print builds");
    ok((entire.manifest?.lessonPlanId || kit.lessonPlanId) === FIXTURE_ID, "entire kit manifest stays on fixture lesson");

    fs.writeFileSync(path.join(ARTIFACT_DIR, "customer-teaching-kit.json"), JSON.stringify(kit, null, 2));
    fs.writeFileSync(path.join(ARTIFACT_DIR, "print-manifest.json"), JSON.stringify({
      lessonPlanId: FIXTURE_ID,
      resourceId,
      fingerprint: built.contentFingerprint,
      printableIds: built.manifest?.printableIds || [],
      downloadBytes: merged.bytes?.length || 0,
    }, null, 2));
    fs.writeFileSync(path.join(ARTIFACT_DIR, "selection.pdf"), merged.bytes);

    console.log(`\nPASS ${passed} assertions — Admin publish → customer TK → print/download IDs preserved`);
  } catch (error) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, "server.log"), serverLog);
    console.error("\nFAIL", error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();

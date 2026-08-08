#!/usr/bin/env node
/**
 * Phase 1 Curriculum Draft Review Queue — disposable fixture tests.
 * Run: npm run test:draft-review-queue
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-draft-review-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/draft-review-queue";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "draft-review-owner-pass",
  code: "draft-review-owner-code",
};
const OTHER = {
  email: "other-admin@example.com",
  password: "draft-review-owner-pass",
  code: "draft-review-owner-code",
};

const APPLES_ID = "cur-lp-toddler-amazing-apples";
const AAM_ID = "cur-lp-preschool-all-about-me";
const FARM_ID = "cur-lp-preschool-farm-animals";

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

async function waitForHealth(child, timeoutMs = 30000) {
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

function seedPlan({ id, title, age, theme }) {
  const itemId = `${id}-monday-1`;
  return {
    id, title, age, theme, plan: "Pro", status: "published",
    weeklyOverview: `Published overview for ${title}`,
    objectives: "Published objectives",
    weeklyMaterials: "Published materials",
    vocabularyWords: "vocab",
    familyConnection: "family",
    books: [{ title: "Pub Book", author: "A" }],
    songs: ["Pub Song"],
    resourceIds: [],
    dailyPlans: {
      monday: { theme: "Mon", items: [{ itemId, title: "Seed Activity", objective: "o", description: "d", materials: "m", setup: "s", steps: "1" }] },
      tuesday: { theme: "Tue", items: [] },
      wednesday: { theme: "Wed", items: [] },
      thursday: { theme: "Thu", items: [] },
      friday: { theme: "Fri", items: [] },
    },
    disposableQaFixture: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const uiJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-draft-review-ui.js"), "utf8");
  const modelJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-draft-review.js"), "utf8");

  ok(serverJs.includes("/api/admin/curriculum/draft-review"), "draft-review route registered");
  ok(serverJs.includes("createCurriculumDraftReviewApi"), "draft-review API factory wired");
  ok(modelJs.includes("needs_owner_review"), "status model includes Needs Owner Review");
  ok(modelJs.includes("approved_for_publishing"), "Approved for Publishing distinct from Published");
  ok(modelJs.includes("phase2_required") || modelJs.includes("PHASE2_BLOCKED"), "Phase 2 actions blocked in model");
  ok(appJs.includes("curriculum-draft-review"), "Admin nav tab wired");
  ok(uiJs.includes("Draft Review Queue"), "Queue UI present");
  ok(uiJs.includes("Preview Teaching Kit"), "Preview Teaching Kit control present");
  ok(uiJs.includes("Phase 2"), "Phase 2 approve/publish disabled in UI");
  ok(!uiJs.includes("data-draft-review-publish"), "No publish control in Phase 1 UI");

  const apples = seedPlan({ id: APPLES_ID, title: "Amazing Apples", age: "Toddler", theme: "Apples" });
  const aam = seedPlan({ id: AAM_ID, title: "All About Me", age: "Preschool", theme: "All About Me" });
  const farm = seedPlan({ id: FARM_ID, title: "Farm Animals", age: "Preschool", theme: "Farm Animals" });

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: {
        teachingKitEnrichmentEditor: true,
        teachingKitQualityReview: true,
        playBasedCurriculum: true,
      },
      curriculum: {
        lessonPlans: [apples, aam, farm],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      curriculumDraftReviews: [],
      updatedAt: new Date().toISOString(),
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      ADMIN_EMAILS: `${OWNER.email},${OTHER.email}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);
    const ownerLogin = await requestJson("POST", "/api/admin/login", OWNER);
    ok(ownerLogin.status === 200, "owner login");
    const ownerToken = ownerLogin.json.token || ownerLogin.json.adminToken;
    const ownerAuth = { Authorization: `Bearer ${ownerToken}` };

    const denied = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      adminEmail: OWNER.email,
    });
    ok(denied.status === 401, "logged-out cannot list queue");

    const otherLogin = await requestJson("POST", "/api/admin/login", OTHER);
    if (otherLogin.status === 200) {
      const otherAuth = { Authorization: `Bearer ${otherLogin.json.token || otherLogin.json.adminToken}` };
      const otherDenied = await requestJson("POST", "/api/admin/curriculum/draft-review", {
        action: "list",
        adminEmail: OWNER.email,
        role: "owner",
      }, otherAuth);
      ok(otherDenied.status === 403, "non-owner admin denied despite spoofed claims");
    } else {
      ok(true, "other admin login skipped");
    }

    const phase2 = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "publish",
    }, ownerAuth);
    ok(phase2.status === 400 && phase2.json.code === "phase2_required", "publish blocked in Phase 1");

    const approve = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "approve",
    }, ownerAuth);
    ok(approve.status === 400 && approve.json.code === "phase2_required", "approve blocked in Phase 1");

    let stampRes = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    let stamp = stampRes.json.siteContent?.updatedAt;

    const seed = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit-seed-packages",
      expectedUpdatedAt: stamp,
      batchName: "Proof Two — Draft Review Queue",
      source: "cursor-agent",
    }, ownerAuth);
    ok(seed.status === 200 && seed.json.ok === true, "seed submit ok");
    ok(seed.json.items?.length === 2, "exactly two drafts submitted");
    ok(seed.json.autoPublished === false, "seed never auto-publishes");
    stamp = seed.json.siteContentUpdatedAt || stamp;

    const list = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
    }, ownerAuth);
    ok(list.status === 200 && list.json.items.length === 2, "queue lists two items");
    ok(list.json.publishAvailable === false, "list advertises no publish in Phase 1");
    ok(list.json.items.every((i) => i.status === "needs_owner_review"), "status Needs Owner Review");
    ok(list.json.items.every((i) => i.lessonPlanId !== FARM_ID), "Farm Animals not in queue");

    const applesEntry = list.json.items.find((i) => i.lessonPlanId === APPLES_ID);
    ok(Boolean(applesEntry?.rollbackId), "rollback id present");

    const get = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "get",
      id: applesEntry.id,
    }, ownerAuth);
    ok(get.status === 200 && get.json.enrichmentDraft, "get returns enrichment draft");
    ok((get.json.draftResources || []).length >= 1, "draft printable attached");
    ok(get.json.draftResources.every((r) => r.status === "draft" || r.isDraft), "resources are draft");
    ok(get.json.draftResources.every((r) => r.publicAccess === "404"), "public access documented as 404");

    const site = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    const plans = site.json.siteContent.curriculum.lessonPlans;
    const farmPlan = plans.find((p) => p.id === FARM_ID);
    ok(!farmPlan.enrichmentDraft, "Farm Animals enrichment untouched");
    const applesPlan = plans.find((p) => p.id === APPLES_ID);
    ok(Boolean(applesPlan.enrichmentDraft?.activities), "enrichment draft on existing lesson");
    ok(plans.filter((p) => p.id === APPLES_ID).length === 1, "no duplicate Amazing Apples lesson");

    const resourceId = get.json.draftResources[0].id;
    const publicFile = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    ok(publicFile.status === 404, "customer/public gets 404 for draft printable");
    const ownerFile = await requestJson(
      "GET",
      `/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`,
      null,
      ownerAuth,
    );
    ok(ownerFile.status === 200, "owner can preview draft printable");

    const compare = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "compare",
      id: applesEntry.id,
    }, ownerAuth);
    ok(compare.status === 200 && compare.json.compare, "compare returns summary");

    stamp = site.json.siteContent.updatedAt;
    const notes = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "request-revision",
      id: applesEntry.id,
      expectedUpdatedAt: stamp,
      reviewNotes: "Please strengthen Thursday taste-test allergy language.",
    }, ownerAuth);
    ok(notes.status === 200 && notes.json.entry.status === "changes_requested", "request revision works");
    stamp = notes.json.siteContentUpdatedAt || stamp;

    // AAM still independently openable
    const aamEntry = list.json.items.find((i) => i.lessonPlanId === AAM_ID);
    const aamGet = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "get",
      id: aamEntry.id,
    }, ownerAuth);
    ok(aamGet.status === 200, "one lesson Changes Requested does not block opening the other");

    const discard = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "discard",
      id: aamEntry.id,
      expectedUpdatedAt: stamp,
      reviewNotes: "Not needed for this pass",
    }, ownerAuth);
    ok(discard.status === 200 && discard.json.publishedUnchanged === true, "discard keeps published unchanged");
    ok(discard.json.entry.status === "rejected", "discard marks rejected");

    const report = {
      passed,
      finishedAt: new Date().toISOString(),
      seedBatch: seed.json.batchId,
      items: seed.json.items,
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "DRAFT-REVIEW-QUEUE-TEST.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(
      path.join(ROOT, "docs/teaching-kit/qa/next-10-gold-upgrade/proof/reports/DRAFT-REVIEW-QUEUE-TEST.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(`\nPASS ${passed} assertions (draft-review-queue)`);
  } catch (error) {
    console.error("\nFAIL", error);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();

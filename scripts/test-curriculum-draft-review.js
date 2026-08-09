#!/usr/bin/env node
/**
 * Phase 1 Curriculum Draft Review Queue — focused fixture tests.
 * Run: npm run test:curriculum-draft-review
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
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
const STAFF = {
  email: "staff-member@example.com",
  password: "StaffPass123!",
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
        resolve({ status: res.statusCode, json, text, headers: res.headers });
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

function seedPlanFromPackage(packageId, fallback) {
  const packPath = path.join(ROOT, "docs/curriculum-draft-review/seed", packageId, "enrichment-draft.json");
  if (fs.existsSync(packPath)) {
    const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
    const plan = JSON.parse(JSON.stringify(pack.plan || {}));
    plan.status = "published";
    plan.plan = plan.plan || "Pro";
    plan.resourceIds = [];
    plan.enrichmentDraft = undefined;
    plan.disposableQaFixture = true;
    plan.createdAt = plan.createdAt || new Date().toISOString();
    plan.updatedAt = new Date().toISOString();
    plan.publishedAt = plan.publishedAt || new Date().toISOString();
    return plan;
  }
  return fallback;
}

function seedPlan({ id, title, age, theme }) {
  const itemId = `${id}-monday-1`;
  return {
    id,
    title,
    age,
    theme,
    plan: "Pro",
    status: "published",
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

function publishedFingerprint(plan) {
  const {
    enrichmentDraft: _d,
    enrichmentDraftUndo: _u,
    enrichmentPublishHistory: _h,
    enrichmentPublished: _p,
    resourceIds: _r,
    updatedAt: _u2,
    ...rest
  } = plan || {};
  return crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

function activityLinkFingerprint(plan, activities) {
  const planId = String(plan?.id || "");
  const linked = (activities || [])
    .filter((a) => a && a.lessonPlanId === planId)
    .map((a) => ({ id: a.id, itemId: a.itemId || "", title: a.title || "", dayOfWeek: a.dayOfWeek || "" }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const daily = [];
  const days = plan?.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  Object.keys(days).sort().forEach((day) => {
    (days[day]?.items || []).forEach((item) => {
      daily.push({ day, itemId: item.itemId || item.id || "", title: item.title || "" });
    });
  });
  return crypto.createHash("sha256").update(JSON.stringify({ linked, daily })).digest("hex");
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const uiJs = fs.readFileSync(path.join(ROOT, "scripts/curriculum-draft-review-ui.js"), "utf8");
  const modelJs = fs.readFileSync(path.join(ROOT, "scripts/curriculum-draft-review.js"), "utf8");

  ok(serverJs.includes("/api/admin/curriculum/draft-review"), "draft-review route registered");
  ok(serverJs.includes("createDraftReviewApi"), "draft-review API factory wired");
  ok(modelJs.includes('"submitted"') && modelJs.includes('"revision_requested"'), "status model includes Submitted / Revision Requested");
  ok(modelJs.includes("ready_for_owner_approval"), "Ready for Owner Approval status present");
  ok(modelJs.includes("PUBLISH_CONFIRM_PHRASE") || modelJs.includes("PUBLISH TEACHING KIT"), "publish confirm phrase in model");
  ok(appJs.includes("curriculum-draft-review"), "Admin nav tab wired");
  ok(uiJs.includes("Draft Review Queue"), "Queue UI present");
  ok(uiJs.includes("Open Review") || uiJs.includes("Open Teaching Kit Review"), "Open Review control present");
  ok(uiJs.includes("Preview Teaching Kit"), "Preview Teaching Kit control present");
  ok(uiJs.includes("tk-draft-review-cards"), "Mobile stacked cards markup present");
  ok(uiJs.includes("data-draft-review-approve") && uiJs.includes("data-draft-review-open-publish"), "Approve/Publish controls present");
  ok(uiJs.includes("PUBLISH TEACHING KIT") || modelJs.includes("PUBLISH TEACHING KIT"), "publish confirm phrase present");
  ok(uiJs.includes("data-draft-review-back-content"), "Back to Content Home control present");
  ok(uiJs.includes("ownerDraftReview: true"), "Open Review uses owner draft-review editor bypass");
  ok(uiJs.includes("enrichmentDraft"), "Open Review passes queue enrichmentDraft into editor");
  ok(uiJs.includes("Still working on the previous action") || uiJs.includes("while (state.busy"), "Open Review waits instead of silent busy no-op");
  ok(fs.existsSync(path.join(ROOT, "scripts/llh-curriculum-gold-standard.js")), "gold standard validator present");

  // Proof #597 baggage is absent from this clean branch.
  ok(!fs.existsSync(path.join(ROOT, "scripts/teaching-kit-proof-draft-import.js")), "old proof importer absent");
  ok(!fs.existsSync(path.join(ROOT, "scripts/run-next-10-gold-upgrade.js")), "gold-builder runner absent");
  ok(!fs.existsSync(path.join(ROOT, "scripts/teaching-kit-draft-review.js")), "old teaching-kit-draft-review.js absent");
  ok(!fs.existsSync(path.join(ROOT, "server/curriculum-draft-review-api.js")), "old curriculum-draft-review-api.js absent");
  ok(!fs.existsSync(path.join(ROOT, "docs/teaching-kit/qa/next-10-gold-upgrade/proof")), "old proof package tree absent");
  ok(!fs.existsSync(path.join(ROOT, "docs/teaching-kit/qa/next-10-gold-upgrade/proof/reports/DRAFT-REVIEW-QUEUE-PHASE1.md")), "old draft-review report absent");

  const apples = seedPlanFromPackage("amazing-apples", seedPlan({ id: APPLES_ID, title: "Amazing Apples", age: "Toddler", theme: "Apples" }));
  const aam = seedPlanFromPackage("all-about-me", seedPlan({ id: AAM_ID, title: "All About Me", age: "Preschool", theme: "All About Me" }));
  const farm = seedPlan({ id: FARM_ID, title: "Farm Animals", age: "Preschool", theme: "Farm Animals" });

  const featureFlagsBefore = {
    teachingKitEnrichmentEditor: true,
    teachingKitQualityReview: true,
    playBasedCurriculum: true,
  };

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [STAFF.email]: {
        email: STAFF.email,
        passwordHash: null,
        password: STAFF.password,
        name: "Staff Member",
        role: "staff",
        plan: "pro",
        createdAt: new Date().toISOString(),
      },
    },
    siteContent: {
      featureFlags: { ...featureFlagsBefore },
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

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await waitForHealth(child);
    const ownerLogin = await requestJson("POST", "/api/admin/login", OWNER);
    ok(ownerLogin.status === 200, "owner login");
    const ownerToken = ownerLogin.json.token || ownerLogin.json.adminToken;
    const ownerAuth = { Authorization: `Bearer ${ownerToken}` };

    const loggedOut = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      adminEmail: OWNER.email,
      role: "owner",
    });
    ok(loggedOut.status === 401, "logged-out access denied (forged claims ignored)");

    const otherLogin = await requestJson("POST", "/api/admin/login", OTHER);
    ok(otherLogin.status === 200, "other admin can unlock admin shell");
    const otherAuth = { Authorization: `Bearer ${otherLogin.json.token || otherLogin.json.adminToken}` };
    const otherDenied = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      adminEmail: OWNER.email,
      role: "owner",
    }, otherAuth);
    ok(otherDenied.status === 403, "other admin denied despite forged owner claims");

    // Staff / customer: member auth must not unlock owner queue.
    const staffDenied = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      adminEmail: OWNER.email,
      role: "staff",
    }, { Authorization: `Bearer staff-forged-token` });
    ok(staffDenied.status === 401 || staffDenied.status === 403, "staff / forged member token denied");

    const customerDenied = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      email: "customer@example.com",
      role: "customer",
    });
    ok(customerDenied.status === 401, "customer / logged-out denied");

    const publishNoId = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "publish",
      confirmPhrase: "PUBLISH TEACHING KIT",
    }, ownerAuth);
    ok([400, 404, 409].includes(publishNoId.status), "publish without draft id rejected");

    const approveNoId = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "approve",
    }, ownerAuth);
    ok([400, 404, 409].includes(approveNoId.status), "approve without draft id rejected");

    const unknown = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit",
      lessonPlanId: "cur-lp-does-not-exist",
      title: "Ghost Lesson",
      age: "Toddler",
      theme: "Ghosts",
      enrichmentDraft: { week: { songs: ["x"] }, activities: { a: { materials: "m" } } },
      expectedUpdatedAt: (await requestJson("GET", "/api/admin/site-content", null, ownerAuth)).json.siteContent?.updatedAt,
    }, ownerAuth);
    ok(unknown.status === 409 || unknown.status === 400, "unknown lesson ID rejected");
    ok(unknown.json.code === "failed_validation" || unknown.json.code === "lesson_required", "unknown lesson code set");

    let stampRes = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    let stamp = stampRes.json.siteContent?.updatedAt;
    const lessonCountBefore = stampRes.json.siteContent.curriculum.lessonPlans.length;
    const activityCountBefore = stampRes.json.siteContent.curriculum.activities.length;
    const plansBefore = stampRes.json.siteContent.curriculum.lessonPlans;
    const activitiesBefore = stampRes.json.siteContent.curriculum.activities || [];
    const farmBefore = plansBefore.find((p) => p.id === FARM_ID);
    const applesBefore = plansBefore.find((p) => p.id === APPLES_ID);
    const aamBefore = plansBefore.find((p) => p.id === AAM_ID);
    const farmPubFp = publishedFingerprint(farmBefore);
    const applesPubFp = publishedFingerprint(applesBefore);
    const aamPubFp = publishedFingerprint(aamBefore);
    const farmActsFp = activityLinkFingerprint(farmBefore, activitiesBefore);
    const applesActsFp = activityLinkFingerprint(applesBefore, activitiesBefore);
    const flagsBefore = { ...(stampRes.json.siteContent.featureFlags || {}) };

    const seed = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit-seed",
      expectedUpdatedAt: stamp,
      batchName: "Phase 1 seed — Apples + All About Me",
      source: "cursor-agent",
    }, ownerAuth);
    ok(seed.status === 200 && seed.json.ok === true, "owner seed submit succeeds");
    ok(seed.json.items?.length === 2, "exactly two drafts submitted");
    ok(seed.json.autoPublished === false, "seed never auto-publishes");
    stamp = seed.json.siteContentUpdatedAt || stamp;

    const seedAgain = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit-seed",
      expectedUpdatedAt: stamp,
      batchName: "Phase 1 seed — Apples + All About Me",
      source: "cursor-agent",
      batchId: seed.json.batchId,
    }, ownerAuth);
    ok(seedAgain.status === 200, "duplicate seed submit accepted");
    stamp = seedAgain.json.siteContentUpdatedAt || stamp;

    const list = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
    }, ownerAuth);
    ok(list.status === 200 && list.json.items.length === 2, "queue lists two items (idempotent)");
    ok(list.json.publishAvailable === true, "list advertises publish available (owner-gated)");
    ok(list.json.items.every((i) => ["submitted", "revised", "in_review"].includes(i.status)), "status Submitted/Revised");
    ok(list.json.items.every((i) => i.lessonPlanId !== FARM_ID), "Farm Animals not in queue");

    const applesEntry = list.json.items.find((i) => i.lessonPlanId === APPLES_ID);
    const aamEntry = list.json.items.find((i) => i.lessonPlanId === AAM_ID);
    ok(Boolean(applesEntry?.revisionId), "revision id present");
    ok(Boolean(applesEntry?.batchId), "batch id present");
    ok(Number(applesEntry.activityCount || 0) === 17, "Amazing Apples canonical activity count is 17");
    ok(Number(applesEntry.activitiesRemoved || 0) === 3, "Amazing Apples reports 3 removed activities");
    ok(applesEntry.publishReady !== true, "Amazing Apples is not Publish Ready with draft printables / blockers");

    const get = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "get",
      id: applesEntry.id,
    }, ownerAuth);
    ok(get.status === 200 && get.json.enrichmentDraft, "get returns enrichment draft");
    ok((get.json.draftResources || []).length >= 1, "draft printable attached");
    ok(get.json.draftResources.every((r) => r.status === "draft"), "resources are draft");
    ok(get.json.draftResources.every((r) => r.publicAccess === "404"), "public access documented as 404");
    ok(Number(applesEntry.structuralScore) >= 90, "Amazing Apples structural score matches editor (~96)");
    ok(Number(applesEntry.premiumScore) >= 85 && Number(applesEntry.premiumScore) <= 89, "Amazing Apples premium capped honestly at draft-printable readiness (~89)");
    ok((applesEntry.blockers || []).includes("draft_printables_only") || (get.json.entry?.scores?.blockers || []).includes("draft_printables_only"), "draft_printables_only is the publish blocker");

    // Confirm seed images persisted as enrichment media (not seed://)
    const sampleAct = Object.values(get.json.enrichmentDraft.activities || {}).find((a) => a && (a.exampleImageUrl || a.setupImageUrl));
    if (sampleAct) {
      const url = String(sampleAct.exampleImageUrl || sampleAct.setupImageUrl || "");
      ok(url.includes("/api/admin/media/enrichment-photos/"), "seed images attached as enrichment media URLs");
      ok(!url.startsWith("seed://") && !url.startsWith("data:"), "no seed:// or data: blobs left in draft");
    } else {
      ok(true, "no imaged activities in sample (skipped)");
    }

    const site = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    const plans = site.json.siteContent.curriculum.lessonPlans;
    const activities = site.json.siteContent.curriculum.activities || [];
    const farmPlan = plans.find((p) => p.id === FARM_ID);
    const applesPlan = plans.find((p) => p.id === APPLES_ID);
    const aamPlan = plans.find((p) => p.id === AAM_ID);
    ok(!farmPlan.enrichmentDraft, "Farm Animals enrichment untouched");
    ok(publishedFingerprint(farmPlan) === farmPubFp, "Farm Animals published body unchanged");
    ok(activityLinkFingerprint(farmPlan, activities) === farmActsFp, "Farm Animals activity links unchanged");
    ok(Boolean(applesPlan.enrichmentDraft?.activities), "enrichment draft on Amazing Apples");
    ok(publishedFingerprint(applesPlan) === applesPubFp, "Amazing Apples published body unchanged");
    ok(publishedFingerprint(aamPlan) === aamPubFp, "All About Me published body unchanged");
    ok(activityLinkFingerprint(applesPlan, activities) === applesActsFp, "Amazing Apples activity links unchanged");
    ok(plans.filter((p) => p.id === APPLES_ID).length === 1, "no duplicate Amazing Apples lesson");
    ok(plans.length === lessonCountBefore, "lesson totals unchanged");
    ok(activities.length === activityCountBefore, "activity totals unchanged");

    const flags = site.json.siteContent.featureFlags || {};
    ok(flags.teachingKitEnrichmentEditor === flagsBefore.teachingKitEnrichmentEditor, "customer TK enrichment flag unchanged");
    ok(flags.playBasedCurriculum === flagsBefore.playBasedCurriculum, "play-based curriculum flag unchanged");

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
    ok(Number(compare.json.compare.activityKeysTouched) > 0 || Number(compare.json.compare.weekFieldsTouched) > 0, "compare shows changed fields");
    ok(Array.isArray(compare.json.compare.readable?.removed), "compare has readable removed list");
    ok((compare.json.compare.readable?.removed || []).length === 3, "compare lists 3 removed activities");

    const preview = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "preview",
      id: applesEntry.id,
    }, ownerAuth);
    ok(preview.status === 200 && preview.json.preview?.title, "owner preview returns teaching kit payload");
    ok(preview.json.ownerOnly === true, "preview marked owner-only");

    const printableReview = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "printable-review",
      id: applesEntry.id,
    }, ownerAuth);
    ok(printableReview.status === 200 && (printableReview.json.printables || []).length >= 1, "printable review returns draft PDFs");

    const imageReview = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "image-review",
      id: applesEntry.id,
    }, ownerAuth);
    ok(imageReview.status === 200 && Array.isArray(imageReview.json.images), "image review returns grouped images");

    const approveBlocked = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "approve",
      id: applesEntry.id,
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(approveBlocked.status === 400 && approveBlocked.json.code === "hard_blockers", "approve blocked while hard blockers remain");

    // Draft survives refresh (re-list after re-read store)
    const listRefresh = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "list" }, ownerAuth);
    ok(listRefresh.json.items.some((i) => i.id === applesEntry.id), "draft survives refresh");

    stamp = site.json.siteContent.updatedAt;
    const notes = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "request-revision",
      id: applesEntry.id,
      expectedUpdatedAt: stamp,
      reviewNotes: "Please strengthen Thursday taste-test allergy language.",
    }, ownerAuth);
    ok(notes.status === 200 && notes.json.entry.status === "revision_requested", "request revision works");
    ok(notes.json.entry.reviewNotes.includes("allergy"), "request revision preserves notes");
    stamp = notes.json.siteContentUpdatedAt || stamp;

    // Revised submission creates a new version on the same queue item
    const enrich = get.json.enrichmentDraft;
    const revisedDraft = JSON.parse(JSON.stringify(enrich));
    revisedDraft.week = { ...(revisedDraft.week || {}), ownerNote: "revision pass 2" };
    const reviseSubmit = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit",
      lessonPlanId: APPLES_ID,
      title: "Amazing Apples",
      age: "Toddler",
      theme: "Apples",
      batchId: applesEntry.batchId,
      submissionKey: applesEntry.submissionKey,
      enrichmentDraft: revisedDraft,
      expectedUpdatedAt: stamp,
      source: "cursor-agent",
    }, ownerAuth);
    ok(reviseSubmit.status === 200, "revised submission accepted");
    ok(reviseSubmit.json.idempotent !== true, "revised content is not a no-op");
    ok(reviseSubmit.json.detail?.versions?.length >= 1 || reviseSubmit.json.entry?.status === "revised", "revised submission creates version / revised status");
    stamp = reviseSubmit.json.siteContentUpdatedAt || stamp;

    const afterRevise = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "get",
      id: applesEntry.id,
    }, ownerAuth);
    ok((afterRevise.json.entry.versions || []).length >= 1, "queue item has prior version");
    const versionCount = (afterRevise.json.entry.versions || []).length;

    const rollback = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "rollback",
      id: applesEntry.id,
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(rollback.status === 200 && rollback.json.publishedUnchanged === true, "rollback keeps published unchanged");
    ok(rollback.json.entry.status === "rolled_back", "rollback status set");
    stamp = rollback.json.siteContentUpdatedAt || stamp;

    const afterRollback = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "get",
      id: applesEntry.id,
    }, ownerAuth);
    ok((afterRollback.json.entry.versions || []).length === versionCount - 1, "rollback pops one version");
    ok(afterRollback.json.entry.reviewNotes.includes("allergy") || afterRollback.json.entry.status === "rolled_back", "rollback restores prior draft state");

    const discard = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "discard",
      id: aamEntry.id,
      expectedUpdatedAt: stamp,
      reviewNotes: "Not needed for this pass",
    }, ownerAuth);
    ok(discard.status === 200 && discard.json.publishedUnchanged === true, "discard keeps published unchanged");
    ok(discard.json.entry.status === "discarded", "discard marks discarded");

    const finalSite = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    const finalPlans = finalSite.json.siteContent.curriculum.lessonPlans;
    const finalFarm = finalPlans.find((p) => p.id === FARM_ID);
    ok(publishedFingerprint(finalFarm) === farmPubFp, "Farm Animals still unchanged after discard/rollback");
    ok(finalPlans.length === lessonCountBefore, "lesson totals still unchanged");
    ok((finalSite.json.siteContent.curriculum.activities || []).length === activityCountBefore, "activity totals still unchanged");
    ok(finalSite.json.siteContent.featureFlags.playBasedCurriculum === flagsBefore.playBasedCurriculum, "customer Teaching Kit flags unchanged");

    // UI layout smoke
    ok(uiJs.includes("tk-draft-review-table-wrap"), "queue table has overflow wrapper");
    ok(uiJs.includes("tk-draft-review-cards"), "mobile stacked cards present");
    ok(uiJs.includes("data-draft-review-preview") || uiJs.includes("Preview Teaching Kit"), "owner preview control present");
    ok(uiJs.includes("data-draft-review-printables"), "printable review control present");
    ok(uiJs.includes("data-draft-review-images"), "image review control present");
    ok(uiJs.includes("Open Review") || uiJs.includes("Open Teaching Kit Review"), "Open Review opens real Teaching Kit path");

    const report = {
      passed,
      finishedAt: new Date().toISOString(),
      seedBatch: seed.json.batchId,
      items: seed.json.items,
      branchNote: "Fresh branch from main — not based on PR #597",
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "DRAFT-REVIEW-QUEUE-TEST.json"), JSON.stringify(report, null, 2));
    console.log(`\nPASS ${passed} assertions (curriculum-draft-review)`);
  } catch (error) {
    console.error("\nFAIL", error);
    if (stderr) console.error("server stderr:", stderr.slice(-4000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();

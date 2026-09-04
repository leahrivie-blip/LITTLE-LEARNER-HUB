#!/usr/bin/env node
/**
 * Owner-only Admin list organization (Mark Complete / Move Back to Active).
 * Not a publish status and not an AI decision.
 * Run: npm run test:owner-organization-status
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  applySurgicalLessonIdentityFields,
} = require("./curriculum-surgical-lesson-identity.js");
const safeValues = require("./curriculum-safe-values.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4880 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-org-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "owner-org-test-pass",
  code: "owner-org-test-code",
};

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: reqHeaders, timeout: 30000 },
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

function samplePlan({
  id,
  title,
  status = "published",
  plan = "Free",
  publishedAt = "2026-04-01T00:00:00.000Z",
} = {}) {
  return {
    id,
    title,
    age: "Infant",
    theme: "Owner Organization Fixture",
    plan,
    status,
    weeklyOverview: `${title} overview — do not rewrite.`,
    learningDomains: ["Approaches to Learning"],
    weeklyMaterials: "Scarves",
    enrichmentDraft: { week: { weeklyOverview: `${title} draft` }, activities: {} },
    activityIds: [],
    resourceIds: [],
    dailyPlans: {
      monday: { theme: "Day 1", items: [{ itemId: `${id}-mon`, title: "Circle" }] },
    },
    updatedAt: "2026-08-03T12:00:00.000Z",
    publishedAt: status === "draft" ? "" : publishedAt,
  };
}

function startServer(initialStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(initialStore, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Owner Organization Test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function assertStaticGuards() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const allowlistJs = fs.readFileSync(path.join(ROOT, "scripts/curriculum-operator-mutation-allowlist.js"), "utf8");
  const applyImages = serverJs.match(/async function applyOperatorConnectedActivityImages[\s\S]*?\nasync function /);
  const publishFn = serverJs.match(/const nextPlan = \{[\s\S]*?pendingOwnerReview: false[\s\S]*?\};/);

  assert.match(appJs, /data-curriculum-owner-organization="completed"/);
  assert.match(appJs, /Mark Complete/);
  assert.match(appJs, /Move Back to Active/);
  assert.match(appJs, /adminCurriculumFilterOwnerOrganization/);
  assert.match(appJs, /Active Lessons/);
  assert.match(appJs, /Completed Lessons/);
  assert.match(appJs, /All Lessons/);
  assert.match(serverJs, /normalized\.ownerOrganizationStatus = "completed"/);
  assert.match(allowlistJs, /ownerOrganizationStatus/);
  assert.ok(applyImages, "connected image apply function exists");
  assert.doesNotMatch(applyImages[0], /ownerOrganizationStatus\s*:/);
  if (publishFn) {
    assert.doesNotMatch(publishFn[0], /ownerOrganizationStatus\s*:/);
  }
  console.log("PASS  static owner-organization guards");
}

function assertHelpers() {
  const published = {
    id: "cur-lp-colors-all-around-us",
    title: "Colors All Around Us",
    status: "published",
    plan: "Free",
    publishedAt: "2026-04-01T00:00:00.000Z",
    weeklyOverview: "keep",
    enrichmentDraft: { week: { weeklyOverview: "draft" } },
  };
  const marked = applySurgicalLessonIdentityFields(published, { ownerOrganizationStatus: "completed" });
  assert.equal(marked.ownerOrganizationStatus, "completed");
  assert.equal(marked.status, "published");
  assert.equal(marked.publishedAt, published.publishedAt);
  assert.equal(marked.id, published.id);
  assert.equal(marked.weeklyOverview, "keep");

  const rendered = safeValues.normalizeCurriculumLessonPlanForRender(marked);
  assert.equal(rendered.ownerOrganizationStatus, "completed");
  assert.equal(rendered.status, "published");
  assert.equal(rendered.publishedAt, published.publishedAt);

  const activeRender = safeValues.normalizeCurriculumLessonPlanForRender({
    ...published,
    ownerOrganizationStatus: "active",
  });
  assert.equal(activeRender.ownerOrganizationStatus, undefined);

  const allowlist = allowlistApi.buildMutationAllowlist({
    intent: "finish_images",
    actions: { saveDraft: true, generateImages: true },
  });
  assert.equal(
    allowlistApi.isPathAllowed("ownerOrganizationStatus", allowlist, {
      beforeValue: undefined,
      proposedValue: "completed",
    }),
    false,
    "AI must not be allowed to mark lessons complete",
  );
  const persist = allowlistApi.verifyPersistedMutationDiff(
    published,
    { ...published, ownerOrganizationStatus: "completed" },
    allowlist,
  );
  assert.equal(persist.ok, false, "persisted ownerOrganizationStatus change is a mutation violation");
  assert.ok(
    (persist.violations || []).some((row) => row.path === "ownerOrganizationStatus"),
    "violation names ownerOrganizationStatus",
  );
  console.log("PASS  helper + AI safety");
}

async function assertHttpPersist() {
  const draft = samplePlan({
    id: "cur-lp-owner-org-draft",
    title: "Draft Organization Fixture",
    status: "draft",
    plan: "Free",
  });
  const publishedFree = samplePlan({
    id: "cur-lp-infant-colors-all-around-us",
    title: "Colors All Around Us",
    status: "published",
    plan: "Free",
    publishedAt: "2026-04-01T12:00:00.000Z",
  });
  const publishedPro = samplePlan({
    id: "cur-lp-toddler-bugs-and-butterflies",
    title: "Bugs & Butterflies",
    status: "published",
    plan: "Pro",
    publishedAt: "2026-05-01T12:00:00.000Z",
  });
  const child = startServer({
    users: {},
    siteContent: {
      updatedAt: "2026-08-03T10:00:00.000Z",
      curriculum: {
        lessonPlans: [draft, publishedFree, publishedPro],
        activities: [],
        resources: [],
        series: [],
        updatedAt: "2026-08-03T10:00:00.000Z",
      },
    },
    adminSessions: {},
  });

  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(login.status, 200, "admin login");
    const token = login.json.token;
    const headers = { Authorization: `Bearer ${token}` };

    const before = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, headers);
    assert.equal(before.status, 200, "admin site-content loads");
    const beforePlans = before.json.siteContent?.curriculum?.lessonPlans || [];
    assert.equal(beforePlans.length, 3, "existing lessons load without duplication");
    const beforeColors = beforePlans.find((plan) => plan.id === publishedFree.id);
    assert.ok(beforeColors, "published Free lesson loads");
    assert.equal(beforeColors.status, "published");
    assert.equal(beforeColors.publishedAt, publishedFree.publishedAt);
    assert.equal(beforeColors.ownerOrganizationStatus, undefined);

    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: before.json.siteContent.updatedAt,
      lessonPlan: { ...beforeColors, ownerOrganizationStatus: "completed" },
    }, headers);
    assert.equal(save.status, 200, `mark complete save (${save.status} ${save.json?.error || ""})`);

    const after = save.json.curriculum?.lessonPlans
      || save.json.siteContent?.curriculum?.lessonPlans
      || [];
    const afterPlans = after.length
      ? after
      : (await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, headers))
        .json.siteContent?.curriculum?.lessonPlans || [];
    assert.equal(afterPlans.length, 3, "Mark Complete does not create a duplicate lesson");
    const afterColors = afterPlans.find((plan) => plan.id === publishedFree.id);
    const afterBugs = afterPlans.find((plan) => plan.id === publishedPro.id);
    const afterDraft = afterPlans.find((plan) => plan.id === draft.id);
    assert.equal(afterColors.ownerOrganizationStatus, "completed");
    assert.equal(afterColors.id, publishedFree.id);
    assert.equal(afterColors.status, "published");
    assert.equal(afterColors.plan, "Free");
    assert.equal(afterColors.publishedAt, publishedFree.publishedAt);
    assert.equal(afterColors.title, publishedFree.title);
    assert.equal(afterColors.weeklyOverview, publishedFree.weeklyOverview);
    assert.equal(afterColors.enrichmentDraft?.week?.weeklyOverview, publishedFree.enrichmentDraft.week.weeklyOverview);
    assert.equal(afterBugs.ownerOrganizationStatus, undefined, "other lessons stay untouched");
    assert.equal(afterBugs.status, "published");
    assert.equal(afterDraft.status, "draft");

    const publicContent = await requestJson("GET", `/api/site-content?t=${Date.now()}`);
    const publicPlans = publicContent.json.siteContent?.curriculumLibrary?.lessonPlans || [];
    const publicColors = publicPlans.find((plan) => plan.id === publishedFree.id);
    if (publicColors) {
      assert.equal(publicColors.ownerOrganizationStatus, undefined, "public DTO omits owner organization");
      assert.equal(publicColors.status, "published");
    }

    const expectedUpdatedAt = save.json.siteContentUpdatedAt
      || save.json.siteContent?.updatedAt
      || (await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, headers))
        .json.siteContent.updatedAt;
    const revert = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt,
      lessonPlan: { ...afterColors, ownerOrganizationStatus: "active" },
    }, headers);
    assert.equal(revert.status, 200, `move back save (${revert.status} ${revert.json?.error || ""})`);
    const revertedPlans = revert.json.curriculum?.lessonPlans
      || (await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, headers))
        .json.siteContent?.curriculum?.lessonPlans || [];
    const revertedColors = revertedPlans.find((plan) => plan.id === publishedFree.id);
    assert.equal(revertedPlans.length, 3, "Move Back to Active does not duplicate");
    assert.equal(revertedColors.ownerOrganizationStatus, undefined);
    assert.equal(revertedColors.status, "published");
    assert.equal(revertedColors.publishedAt, publishedFree.publishedAt);
    console.log("PASS  HTTP persist keeps the same published lesson");
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

async function main() {
  assertStaticGuards();
  assertHelpers();
  await assertHttpPersist();
  console.log("\nOwner organization status tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

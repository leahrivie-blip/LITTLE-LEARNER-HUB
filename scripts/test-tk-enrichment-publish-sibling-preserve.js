#!/usr/bin/env node
/**
 * Enrichment PUBLISH → sibling record preservation.
 *
 * Proves publishing ONE Teaching Kit via saveMode=publish_enrichment cannot
 * rewrite unrelated sibling lesson plans, activities, resources, or feature flags.
 *
 * Disposable fixtures only. Does not publish real protected curriculum.
 *
 * Run: npm run test:tk-enrichment-publish-sibling-preserve
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 7900 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-tk-publish-sib-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-publish-sib-pass",
  code: "tk-publish-sib-code",
};

const TARGET = "cur-lp-tk-publish-sib-target";
const SIB_NULL = "cur-lp-tk-publish-sib-null";
const SIB_MISSING = "cur-lp-tk-publish-sib-missing";
const SIB_ZERO = "cur-lp-tk-publish-sib-zero";
const SIB_POS = "cur-lp-tk-publish-sib-positive";
const SIB_STR = "cur-lp-tk-publish-sib-string";
const SIB_CUSTOM = "cur-lp-tk-publish-sib-custom";
const SIB_LINKED = "cur-lp-tk-publish-sib-linked";
const SIB_BOOKS = "cur-lp-tk-publish-sib-books";
const AAM = "cur-lp-preschool-all-about-me";
const APPLES = "cur-lp-toddler-amazing-apples";
const FARM = "cur-lp-preschool-farm-animals";
const LINKED_RES = "cur-res-tk-publish-sib-linked";
const SIBLINGS = [
  SIB_NULL, SIB_MISSING, SIB_ZERO, SIB_POS, SIB_STR, SIB_CUSTOM, SIB_LINKED, SIB_BOOKS,
  AAM, APPLES, FARM,
];

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function fp(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
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

async function waitForHealth(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function curriculum(store) {
  return store?.siteContent?.curriculum || { lessonPlans: [], activities: [], resources: [] };
}

function plan(store, id) {
  return (curriculum(store).lessonPlans || []).find((p) => p.id === id) || null;
}

function flags(store) {
  return store?.siteContent?.featureFlags || {};
}

function siblingPlan(id, title, opts = {}) {
  const item = {
    itemId: `item-${id}-0`,
    title: `${title} activity`,
    objective: "Keep immutable",
    materials: "blocks",
    setup: "set up",
    steps: "do the thing",
  };
  if (Object.prototype.hasOwnProperty.call(opts, "setupMinutes")) {
    item.setupMinutes = opts.setupMinutes;
  }
  if (Object.prototype.hasOwnProperty.call(opts, "durationMinutes")) {
    item.durationMinutes = opts.durationMinutes;
  }
  const base = {
    id,
    title,
    age: "Preschool",
    theme: "Sibling Preserve",
    plan: opts.plan || "Pro",
    status: "published",
    weeklyOverview: `${title} overview — must not change on sibling publish`,
    objectives: "immutable objectives",
    weeklyMaterials: "crayons, paper",
    vocabularyWords: "preserve\nsibling",
    familyConnection: "Do not mutate",
    books: opts.books || [{ title: "Keep Book", author: "A", whyItFits: "fits" }],
    songs: opts.songs || [{ title: "Keep Song", motions: "clap" }],
    resourceIds: Array.isArray(opts.resourceIds) ? opts.resourceIds : [],
    enrichmentDraft: null,
    enrichmentPublished: { week: { weeklyOverview: `${title} published enrichment` } },
    ownershipMarker: `own-${id}`,
    revision: 11,
    disposableQaFixture: true,
    customNested: opts.customNested || undefined,
    legacyUnknownField: opts.legacyUnknownField,
    dailyPlans: {
      monday: { theme: "Monday", focus: "focus", items: [item] },
      tuesday: { theme: "Tuesday", items: [] },
      wednesday: { theme: "Wednesday", items: [] },
      thursday: { theme: "Thursday", items: [] },
      friday: { theme: "Friday", items: [] },
    },
    updatedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  if (!Object.prototype.hasOwnProperty.call(opts, "legacyUnknownField")) {
    delete base.legacyUnknownField;
  }
  if (!opts.customNested) delete base.customNested;
  return base;
}

function targetPlan() {
  return {
    id: TARGET,
    title: "Publish Sibling Target Fixture",
    age: "Preschool",
    theme: "Colors",
    plan: "Pro",
    status: "draft",
    weeklyOverview: "Target overview before publish",
    objectives: "Sort colors",
    weeklyMaterials: "Color cards",
    vocabularyWords: "red\nblue",
    familyConnection: "Find colors at home",
    books: [],
    songs: [],
    resourceIds: [],
    disposableQaFixture: true,
    dailyPlans: {
      monday: {
        theme: "Red day",
        items: [{
          itemId: "item-target-1",
          title: "Color sorting tray",
          objective: "Sort by color",
          materials: "trays",
          setup: "Lay out trays",
          steps: "Sort the cards",
          setupMinutes: null,
        }],
      },
    },
    enrichmentDraft: {
      updatedAt: "2026-08-10T12:00:00.000Z",
      lastEditedBy: OWNER.email,
      week: {
        weeklyOverview: "Published week overview from enrichment draft",
        objectives: "Published objectives",
        weeklyMaterials: "Published materials",
        familyConnection: "Published family note",
        printableIdeas: [{ title: "Color sort pack", pageCount: 2 }],
      },
      activities: {
        "item-target-1": {
          teacherTips: ["Invite children to name each color."],
          vocabulary: ["scarlet", "navy"],
          observationOpportunities: "Listen for color words.",
          settingTags: ["small_group"],
        },
      },
    },
    updatedAt: "2026-08-10T12:00:00.000Z",
    createdAt: "2026-08-10T11:00:00.000Z",
  };
}

function protectedLike(id, title) {
  return siblingPlan(id, title, {
    setupMinutes: id === FARM ? null : 5,
    books: [{ title: `${title} Book`, author: "Seed" }],
    songs: [{ title: `${title} Song` }],
    customNested: { marker: `protected-${id}`, n: 1 },
  });
}

async function main() {
  const distinctiveFlags = {
    teachingKitViewer: true,
    teachingKitPrintCenter: true,
    teachingKitAttachments: false,
    teachingKitEnrichmentEditor: true,
    teachingKitAuthoring: false,
    teachingKitCurriculumDirector: true,
    teachingKitQualityReview: false,
    playBasedCurriculum: true,
    customDeployedMarker: "publish-sib-preserve-618-followon",
    unexpectedCustomKey: { nested: true, n: 7 },
  };

  const linkedResource = {
    id: LINKED_RES,
    title: "Sibling Linked Printable",
    type: "Printable",
    status: "published",
    pageCount: 3,
    lessonPlanIds: [SIB_LINKED],
    accessLevel: "pro",
    disposableQaFixture: true,
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  const plans = [
    targetPlan(),
    siblingPlan(SIB_NULL, "Sibling Null Minutes", { setupMinutes: null }),
    siblingPlan(SIB_MISSING, "Sibling Missing Minutes", {}),
    siblingPlan(SIB_ZERO, "Sibling Zero Minutes", { setupMinutes: 0 }),
    siblingPlan(SIB_POS, "Sibling Positive Minutes", { setupMinutes: 12 }),
    siblingPlan(SIB_STR, "Sibling String Minutes", { setupMinutes: "8", durationMinutes: "15" }),
    siblingPlan(SIB_CUSTOM, "Sibling Custom Nested", {
      setupMinutes: 3,
      customNested: { keep: true, arr: [1, "two"], deep: { a: null } },
      legacyUnknownField: "do-not-strip",
    }),
    siblingPlan(SIB_LINKED, "Sibling Linked Printable Lesson", {
      setupMinutes: 4,
      resourceIds: [LINKED_RES],
    }),
    siblingPlan(SIB_BOOKS, "Sibling Books Songs Materials", {
      setupMinutes: 6,
      books: [
        { title: "Apple Book", author: "Lee", whyItFits: "theme", discussionPrompts: ["What color?"] },
      ],
      songs: [
        { title: "Color Song", motions: "point", lyrics: "Red and blue" },
      ],
    }),
    protectedLike(AAM, "All About Me"),
    protectedLike(APPLES, "Amazing Apples"),
    protectedLike(FARM, "Farm Animals"),
  ];

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    adminSessions: {},
    siteContent: {
      featureFlags: { ...distinctiveFlags },
      curriculum: {
        lessonPlans: plans,
        activities: [{
          id: "cur-act-sib-linked-1",
          lessonPlanId: SIB_LINKED,
          itemId: `item-${SIB_LINKED}-0`,
          title: "Linked lesson activity",
          status: "published",
          setupMinutes: 4,
          disposableQaFixture: true,
          updatedAt: "2026-01-02T00:00:00.000Z",
        }],
        resources: [linkedResource],
        series: [],
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  }, null, 2));

  // Source guards
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(serverJs.includes("function writeSiteCurriculumTouched"), "writeSiteCurriculumTouched present");
  const publishStart = serverJs.indexOf("async function handlePublishEnrichment");
  const publishEnd = serverJs.indexOf("async function handleAdminCurriculumLessonPlanSave");
  ok(publishStart >= 0 && publishEnd > publishStart, "handlePublishEnrichment bounds found");
  const publishFn = serverJs.slice(publishStart, publishEnd);
  ok(
    publishFn.includes("writeSiteCurriculumTouched"),
    "handlePublishEnrichment uses writeSiteCurriculumTouched",
  );
  ok(
    publishFn.includes("Surgical curriculum graph")
      && !publishFn.includes("writeSiteCurriculum(store, nextCurriculum"),
    "publish no longer calls writeSiteCurriculum(store, nextCurriculum)",
  );
  ok(
    !publishFn.includes("normalizedCurriculumStore({"),
    "publish no longer whole-normalizes via normalizedCurriculumStore({...})",
  );

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += String(d); });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", OWNER);
    ok(login.status === 200 && login.json?.token, `owner login (${login.status})`);
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const before = readStore();
    const flagsBefore = JSON.stringify(flags(before));
    const siblingFpBefore = {};
    for (const id of SIBLINGS) {
      const p = plan(before, id);
      ok(Boolean(p), `${id}: present before publish`);
      siblingFpBefore[id] = fp(p);
    }
    const resourcesBefore = fp(curriculum(before).resources || []);
    const activitiesBefore = fp(
      (curriculum(before).activities || []).filter((a) => a.lessonPlanId !== TARGET),
    );
    const targetBefore = plan(before, TARGET);
    ok(targetBefore?.enrichmentDraft?.week?.weeklyOverview, "target has enrichment draft to publish");
    ok(targetBefore?.status === "draft", "target starts as draft lesson");

    // Minutes matrix present on siblings
    const nullItem = plan(before, SIB_NULL)?.dailyPlans?.monday?.items?.[0];
    const missingItem = plan(before, SIB_MISSING)?.dailyPlans?.monday?.items?.[0];
    const zeroItem = plan(before, SIB_ZERO)?.dailyPlans?.monday?.items?.[0];
    const posItem = plan(before, SIB_POS)?.dailyPlans?.monday?.items?.[0];
    const strItem = plan(before, SIB_STR)?.dailyPlans?.monday?.items?.[0];
    ok(nullItem?.setupMinutes === null, "sibling null setupMinutes seeded");
    ok(!Object.prototype.hasOwnProperty.call(missingItem || {}, "setupMinutes"), "sibling missing setupMinutes seeded");
    ok(zeroItem?.setupMinutes === 0, "sibling 0 setupMinutes seeded");
    ok(posItem?.setupMinutes === 12, "sibling 12 setupMinutes seeded");
    ok(strItem?.setupMinutes === "8", "sibling string setupMinutes seeded");
    ok(plan(before, SIB_CUSTOM)?.legacyUnknownField === "do-not-strip", "custom/legacy field seeded");
    ok(plan(before, SIB_LINKED)?.resourceIds?.includes(LINKED_RES), "linked printable sibling seeded");

    const stamp = before.siteContent.updatedAt;
    const publish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: stamp,
      publishedBy: OWNER.email,
      lessonPlan: {
        id: TARGET,
        enrichmentDraft: targetBefore.enrichmentDraft,
      },
    }, auth);
    ok(publish.status === 200 && publish.json?.ok === true, `publish_enrichment (${publish.status})`);
    ok(publish.json?.duplicate !== true, "first publish is not a duplicate no-op");
    ok(Boolean(publish.json?.versionId), "publish returns versionId");

    const after = readStore();
    ok(JSON.stringify(flags(after)) === flagsBefore, "feature flags byte-for-byte unchanged");
    for (const id of SIBLINGS) {
      const p = plan(after, id);
      ok(Boolean(p), `${id}: still present after publish`);
      ok(fp(p) === siblingFpBefore[id], `${id}: FULL-record fingerprint unchanged after publish`);
    }
    ok(
      fp(curriculum(after).resources || []) === resourcesBefore,
      "resources array fingerprint unchanged (no unrelated printable churn)",
    );
    ok(
      fp((curriculum(after).activities || []).filter((a) => a.lessonPlanId !== TARGET))
        === activitiesBefore,
      "unrelated activities fingerprint unchanged",
    );

    // Target changed as expected
    const targetAfter = plan(after, TARGET);
    ok(!targetAfter?.enrichmentDraft, "target enrichmentDraft cleared after publish");
    ok(
      String(targetAfter?.weeklyOverview || "").includes("Published week overview"),
      "target weeklyOverview merged from draft",
    );
    ok(
      Array.isArray(targetAfter?.enrichmentPublishHistory)
        && targetAfter.enrichmentPublishHistory[0]?.versionId === publish.json.versionId,
      "target publish history records version",
    );
    const targetAct = targetAfter?.dailyPlans?.monday?.items?.[0];
    ok(
      Array.isArray(targetAct?.teacherTips)
        && targetAct.teacherTips.includes("Invite children to name each color."),
      "target activity teacherTips published into daily plan item",
    );

    // Minutes matrix still exact on disk
    ok(plan(after, SIB_NULL)?.dailyPlans?.monday?.items?.[0]?.setupMinutes === null, "null minutes preserved");
    ok(
      !Object.prototype.hasOwnProperty.call(
        plan(after, SIB_MISSING)?.dailyPlans?.monday?.items?.[0] || {},
        "setupMinutes",
      ),
      "missing minutes stays missing",
    );
    ok(plan(after, SIB_ZERO)?.dailyPlans?.monday?.items?.[0]?.setupMinutes === 0, "0 minutes preserved");
    ok(plan(after, SIB_POS)?.dailyPlans?.monday?.items?.[0]?.setupMinutes === 12, "12 minutes preserved");
    ok(plan(after, SIB_STR)?.dailyPlans?.monday?.items?.[0]?.setupMinutes === "8", "legacy string minutes preserved");
    ok(plan(after, SIB_STR)?.dailyPlans?.monday?.items?.[0]?.durationMinutes === "15", "legacy duration string preserved");
    ok(plan(after, SIB_CUSTOM)?.legacyUnknownField === "do-not-strip", "legacy unknown field preserved");
    ok(
      JSON.stringify(plan(after, SIB_CUSTOM)?.customNested)
        === JSON.stringify({ keep: true, arr: [1, "two"], deep: { a: null } }),
      "custom nested object preserved",
    );
    ok(
      (curriculum(after).resources || []).find((r) => r.id === LINKED_RES)?.status === "published",
      "sibling linked printable remains published",
    );

    // Retry / idempotent duplicate publish
    const stamp2 = after.siteContent.updatedAt;
    const resourceCountBeforeRetry = (curriculum(after).resources || []).length;
    const historyLen = (plan(after, TARGET)?.enrichmentPublishHistory || []).length;
    const retry = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: stamp2,
      publishedBy: OWNER.email,
      lessonPlan: {
        id: TARGET,
        enrichmentDraft: targetBefore.enrichmentDraft,
      },
    }, auth);
    ok(retry.status === 200 && retry.json?.duplicate === true, `duplicate publish is idempotent (${retry.status})`);
    const afterRetry = readStore();
    ok(JSON.stringify(flags(afterRetry)) === flagsBefore, "flags unchanged after duplicate publish");
    for (const id of SIBLINGS) {
      ok(fp(plan(afterRetry, id)) === siblingFpBefore[id], `${id}: unchanged after duplicate publish`);
    }
    ok(
      (plan(afterRetry, TARGET)?.enrichmentPublishHistory || []).length === historyLen,
      "duplicate publish does not append another history version",
    );
    ok(
      (curriculum(afterRetry).resources || []).length === resourceCountBeforeRetry,
      "duplicate publish creates no extra resources",
    );

    // No accidental publish of siblings
    for (const id of [SIB_NULL, SIB_MISSING, TARGET]) {
      const status = plan(afterRetry, id)?.status;
      if (id === TARGET) {
        // Target may remain draft lesson status; enrichment publish merges content without
        // necessarily flipping lesson status — accept either draft or published.
        ok(status === "draft" || status === "published", `target status sensible (${status})`);
      } else {
        ok(status === "published", `${id}: sibling status still published`);
      }
    }

    const report = {
      flagsBefore: distinctiveFlags,
      flagsAfter: flags(afterRetry),
      siblingFingerprintsBefore: siblingFpBefore,
      siblingFingerprintsAfter: Object.fromEntries(
        SIBLINGS.map((id) => [id, fp(plan(afterRetry, id))]),
      ),
      targetVersionId: publish.json.versionId,
      duplicateRetry: true,
    };
    fs.mkdirSync("/opt/cursor/artifacts/tk-enrichment-publish-sibling", { recursive: true });
    fs.writeFileSync(
      "/opt/cursor/artifacts/tk-enrichment-publish-sibling/preserve-report.json",
      JSON.stringify(report, null, 2),
    );
    ok(true, "wrote preserve-report.json artifact");

    console.log(`\nPASS ${passed} checks`);
  } catch (error) {
    console.error("\nFAIL", error.message || error);
    if (stderr) console.error(stderr.slice(-4000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH.replace(/\.json$/i, ".admin-sessions.json")); } catch { /* ignore */ }
  }
}

main();

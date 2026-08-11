#!/usr/bin/env node
/**
 * Classic / LRE lesson SAVE → sibling record preservation.
 *
 * Proves saving ONE lesson via the default full save path
 * (POST /api/admin/curriculum/lesson-plans, no enrichment saveMode)
 * cannot rewrite unrelated sibling lesson plans, activities, resources,
 * or feature flags on disk.
 *
 * Covers the shared Classic form + Lesson Review Editor (LRE) persistence
 * endpoint. Disposable fixtures only.
 *
 * Run: npm run test:classic-lre-save-sibling-preserve
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
const PORT = 8000 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-classic-lre-sib-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "classic-lre-sib-pass",
  code: "classic-lre-sib-code",
};

const TARGET = "cur-lp-classic-lre-sib-target";
const SIB_NULL = "cur-lp-classic-lre-sib-null";
const SIB_MISSING = "cur-lp-classic-lre-sib-missing";
const SIB_ZERO = "cur-lp-classic-lre-sib-zero";
const SIB_POS = "cur-lp-classic-lre-sib-positive";
const SIB_STR = "cur-lp-classic-lre-sib-string";
const SIB_CUSTOM = "cur-lp-classic-lre-sib-custom";
const SIB_LINKED = "cur-lp-classic-lre-sib-linked";
const SIB_BOOKS = "cur-lp-classic-lre-sib-books";
const SIB_DRAFT_RES = "cur-lp-classic-lre-sib-draft-res";
const AAM = "cur-lp-preschool-all-about-me";
const APPLES = "cur-lp-toddler-amazing-apples";
const FARM = "cur-lp-preschool-farm-animals";
const LINKED_RES = "cur-res-classic-lre-sib-linked";
const DRAFT_RES = "cur-res-classic-lre-sib-draft";
const PUB_IMG = "cur-res-classic-lre-sib-image";
const SIBLINGS = [
  SIB_NULL, SIB_MISSING, SIB_ZERO, SIB_POS, SIB_STR, SIB_CUSTOM, SIB_LINKED, SIB_BOOKS, SIB_DRAFT_RES,
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

function weekdayShell(mondayItem) {
  return {
    monday: { theme: "Monday", focus: "focus", items: [mondayItem] },
    tuesday: { theme: "Tuesday", items: [{
      itemId: "item-tue-keep",
      title: "Tuesday keep activity",
      objective: "Keep weekday coverage",
      materials: "blocks",
      setup: "set up",
      steps: "do it",
    }] },
    wednesday: { theme: "Wednesday", items: [{
      itemId: "item-wed-keep",
      title: "Wednesday keep activity",
      objective: "Keep weekday coverage",
      materials: "blocks",
      setup: "set up",
      steps: "do it",
    }] },
    thursday: { theme: "Thursday", items: [{
      itemId: "item-thu-keep",
      title: "Thursday keep activity",
      objective: "Keep weekday coverage",
      materials: "blocks",
      setup: "set up",
      steps: "do it",
    }] },
    friday: { theme: "Friday", items: [{
      itemId: "item-fri-keep",
      title: "Friday keep activity",
      objective: "Keep weekday coverage",
      materials: "blocks",
      setup: "set up",
      steps: "do it",
    }] },
  };
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
    weeklyOverview: `${title} overview — must not change on sibling classic/LRE save`,
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
    dailyPlans: weekdayShell(item),
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
    title: "Classic LRE Sibling Target Fixture",
    age: "Preschool",
    theme: "Colors",
    plan: "Pro",
    status: "draft",
    weeklyOverview: "Target overview before classic save",
    objectives: "Sort colors",
    weeklyMaterials: "Color cards",
    vocabularyWords: "red\nblue",
    familyConnection: "Find colors at home",
    books: [{ title: "Color Book", author: "Lee" }],
    songs: [{ title: "Color Song" }],
    resourceIds: [],
    disposableQaFixture: true,
    enrichmentDraft: {
      updatedAt: "2026-08-10T12:00:00.000Z",
      week: { weeklyOverview: "Draft enrichment must survive classic save of other fields" },
    },
    enrichmentPublishHistory: [{
      versionId: "epub-keep-me",
      kind: "publish",
      publishedAt: "2026-08-01T00:00:00.000Z",
      fingerprint: "keep",
    }],
    dailyPlans: weekdayShell({
      itemId: "item-target-1",
      title: "Color sorting tray",
      objective: "Sort by color",
      materials: "trays",
      setup: "Lay out trays",
      steps: "Sort the cards",
      setupMinutes: null,
    }),
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

function extractFullSaveBranch(serverJs) {
  const start = serverJs.indexOf("async function handleAdminCurriculumLessonPlanSave");
  ok(start >= 0, "handleAdminCurriculumLessonPlanSave present");
  // Full-save branch begins after publish_enrichment early-return; use the
  // syncActivities step which only the classic/LRE full path reaches.
  const syncMarker = serverJs.indexOf('step = "syncActivities"', start);
  ok(syncMarker > start, "classic/LRE full-save syncActivities step found");
  const fnEnd = serverJs.indexOf("\nasync function ", syncMarker + 10);
  ok(fnEnd > syncMarker, "full-save branch end bound found");
  return serverJs.slice(syncMarker, fnEnd);
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
    customDeployedMarker: "classic-lre-sib-preserve",
    unexpectedCustomKey: { nested: true, n: 9 },
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
  const draftResource = {
    id: DRAFT_RES,
    title: "Sibling Draft Printable",
    type: "Printable",
    status: "draft",
    pageCount: 1,
    lessonPlanIds: [SIB_DRAFT_RES],
    accessLevel: "pro",
    disposableQaFixture: true,
    mediaAssetId: "media-draft-keep",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  const publishedImage = {
    id: PUB_IMG,
    title: "Sibling Published Image",
    type: "Image",
    status: "published",
    mimeType: "image/png",
    lessonPlanIds: [SIB_BOOKS],
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
      resourceIds: [PUB_IMG],
      books: [
        { title: "Apple Book", author: "Lee", whyItFits: "theme", discussionPrompts: ["What color?"] },
      ],
      songs: [
        { title: "Color Song", motions: "point", lyrics: "Red and blue" },
      ],
    }),
    siblingPlan(SIB_DRAFT_RES, "Sibling Draft Resource Lesson", {
      setupMinutes: 2,
      resourceIds: [DRAFT_RES],
    }),
    protectedLike(AAM, "All About Me"),
    protectedLike(APPLES, "Amazing Apples"),
    protectedLike(FARM, "Farm Animals"),
  ];

  const siblingActivity = {
    id: "cur-act-classic-lre-sib-linked-1",
    lessonPlanId: SIB_LINKED,
    itemId: `item-${SIB_LINKED}-0`,
    title: "Linked lesson activity",
    status: "published",
    setupMinutes: null,
    disposableQaFixture: true,
    customActField: "keep-me",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    adminSessions: {},
    siteContent: {
      featureFlags: { ...distinctiveFlags },
      curriculum: {
        lessonPlans: plans,
        activities: [siblingActivity],
        resources: [linkedResource, draftResource, publishedImage],
        series: [],
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  }, null, 2));

  // Source guards — classic/LRE full save must use surgical touched write.
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(serverJs.includes("function writeSiteCurriculumTouched"), "writeSiteCurriculumTouched present");
  const fullSaveBranch = extractFullSaveBranch(serverJs);
  ok(
    fullSaveBranch.includes("writeSiteCurriculumTouched"),
    "classic/LRE full-save branch uses writeSiteCurriculumTouched",
  );
  ok(
    !fullSaveBranch.includes("writeSiteCurriculum(store, syncedCurriculum"),
    "classic/LRE full-save no longer calls writeSiteCurriculum(store, syncedCurriculum)",
  );
  // #623 enrichment publish path must remain untouched by this change.
  const publishStart = serverJs.indexOf("async function handlePublishEnrichment");
  const publishEnd = serverJs.indexOf("async function handleAdminCurriculumLessonPlanSave");
  const publishFn = serverJs.slice(publishStart, publishEnd);
  ok(publishFn.includes("writeSiteCurriculumTouched"), "#623 publish path still uses touched write");
  ok(
    publishFn.includes("Surgical curriculum graph"),
    "#623 publish surgical graph comment preserved",
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
      ok(Boolean(p), `${id}: present before classic save`);
      siblingFpBefore[id] = fp(p);
    }
    const resourcesBefore = fp(curriculum(before).resources || []);
    const activitiesBefore = fp(
      (curriculum(before).activities || []).filter((a) => a.lessonPlanId !== TARGET),
    );
    const resourceCountBefore = (curriculum(before).resources || []).length;
    const targetBefore = plan(before, TARGET);
    ok(targetBefore?.status === "draft", "target starts as draft");
    ok(targetBefore?.enrichmentDraft?.week?.weeklyOverview, "target enrichment draft present before save");
    ok(
      targetBefore?.enrichmentPublishHistory?.[0]?.versionId === "epub-keep-me",
      "target enrichment history present before save",
    );

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
    ok(
      (curriculum(before).resources || []).find((r) => r.id === DRAFT_RES)?.status === "draft",
      "draft printable sibling seeded",
    );

    // Classic / LRE full save: no saveMode (defaults to "full").
    const stamp = before.siteContent.updatedAt;
    const savedPayload = {
      ...targetBefore,
      weeklyOverview: "Target overview AFTER classic/LRE save",
      objectives: "Updated objectives from classic save",
      dailyPlans: {
        ...targetBefore.dailyPlans,
        monday: {
          ...targetBefore.dailyPlans.monday,
          items: [{
            ...targetBefore.dailyPlans.monday.items[0],
            title: "Color sorting tray — edited",
            setupMinutes: 7,
            teacherTips: ["Name each color aloud."],
          }],
        },
      },
    };
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      lessonPlan: savedPayload,
    }, auth);
    ok(save.status === 200 && save.json?.lessonPlan?.id === TARGET, `classic/LRE full save (${save.status})`);
    ok(save.json?.lessonPlan?.weeklyOverview === "Target overview AFTER classic/LRE save", "target overview persisted");
    ok(String(save.json?.lessonPlan?.status || "") === "draft", "target remains draft (not force-published)");

    const after = readStore();
    ok(JSON.stringify(flags(after)) === flagsBefore, "feature flags byte-for-byte unchanged");
    for (const id of SIBLINGS) {
      const p = plan(after, id);
      ok(Boolean(p), `${id}: still present after classic save`);
      ok(fp(p) === siblingFpBefore[id], `${id}: FULL-record fingerprint unchanged after classic save`);
    }
    ok(
      fp(curriculum(after).resources || []) === resourcesBefore,
      "resources array fingerprint unchanged",
    );
    ok(
      fp((curriculum(after).activities || []).filter((a) => a.lessonPlanId !== TARGET))
        === activitiesBefore,
      "unrelated activities fingerprint unchanged",
    );
    ok(
      (curriculum(after).resources || []).length === resourceCountBefore,
      "no duplicate / extra resources created",
    );

    // Target lesson + activity changes persisted
    const targetAfter = plan(after, TARGET);
    ok(targetAfter?.weeklyOverview === "Target overview AFTER classic/LRE save", "target weeklyOverview saved on disk");
    ok(targetAfter?.objectives === "Updated objectives from classic save", "target objectives saved on disk");
    ok(targetAfter?.id === TARGET, "target id stable");
    ok(targetAfter?.status === "draft", "target draft status preserved");
    ok(
      targetAfter?.enrichmentDraft?.week?.weeklyOverview
        === "Draft enrichment must survive classic save of other fields",
      "target enrichmentDraft preserved across classic save",
    );
    ok(
      targetAfter?.enrichmentPublishHistory?.[0]?.versionId === "epub-keep-me",
      "target enrichment history preserved",
    );
    const targetItem = targetAfter?.dailyPlans?.monday?.items?.[0];
    ok(targetItem?.title === "Color sorting tray — edited", "target activity title saved");
    ok(targetItem?.setupMinutes === 7, "target activity setupMinutes saved");
    ok(
      Array.isArray(targetItem?.teacherTips)
        && targetItem.teacherTips.includes("Name each color aloud."),
      "target activity teacherTips saved",
    );
    const targetActs = (curriculum(after).activities || []).filter((a) => a.lessonPlanId === TARGET);
    ok(targetActs.length >= 1, "target linked activities exist after save");
    ok(targetActs.every((a) => a.id && String(a.id).startsWith("cur-")), "target activity ids stable-shaped");
    const editedAct = targetActs.find((a) => a.itemId === "item-target-1" || /Color sorting tray/i.test(a.title || ""));
    ok(Boolean(editedAct), "edited target activity present in activities array");
    ok(editedAct?.setupMinutes === 7 || editedAct?.title?.includes("edited"), "edited activity fields persisted");

    // Minutes matrix still exact on disk for siblings
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
    ok(
      (curriculum(after).resources || []).find((r) => r.id === DRAFT_RES)?.status === "draft",
      "sibling draft printable remains draft",
    );
    ok(
      (curriculum(after).resources || []).find((r) => r.id === PUB_IMG)?.status === "published",
      "sibling published image remains published",
    );
    ok(plan(after, SIB_LINKED)?.resourceIds?.includes(LINKED_RES), "printable remains linked on sibling");
    ok(plan(after, FARM)?.dailyPlans?.monday?.items?.[0]?.setupMinutes === null, "Farm Animals null minutes preserved");
    ok(plan(after, APPLES)?.customNested?.marker === `protected-${APPLES}`, "Amazing Apples nested marker preserved");

    // Retry same save — no duplicates
    const stamp2 = after.siteContent.updatedAt;
    const actCountBeforeRetry = (curriculum(after).activities || []).length;
    const planCountBeforeRetry = (curriculum(after).lessonPlans || []).length;
    const retry = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp2,
      lessonPlan: {
        ...plan(after, TARGET),
        weeklyOverview: "Target overview AFTER classic/LRE save",
        objectives: "Updated objectives from classic save",
      },
    }, auth);
    ok(retry.status === 200 && retry.json?.lessonPlan?.id === TARGET, `retry classic save (${retry.status})`);
    const afterRetry = readStore();
    ok(JSON.stringify(flags(afterRetry)) === flagsBefore, "flags unchanged after retry");
    for (const id of SIBLINGS) {
      ok(fp(plan(afterRetry, id)) === siblingFpBefore[id], `${id}: unchanged after retry save`);
    }
    ok(
      (curriculum(afterRetry).activities || []).length === actCountBeforeRetry,
      "retry save creates no duplicate activities",
    );
    ok(
      (curriculum(afterRetry).lessonPlans || []).length === planCountBeforeRetry,
      "retry save creates no duplicate lesson plans",
    );
    ok(
      (curriculum(afterRetry).resources || []).length === resourceCountBefore,
      "retry save creates no duplicate resources",
    );
    ok(plan(afterRetry, TARGET)?.id === TARGET, "target id stable after retry");
    ok(plan(afterRetry, TARGET)?.status === "draft", "target draft status stable after retry");

    const report = {
      flagsBefore: distinctiveFlags,
      flagsAfter: flags(afterRetry),
      siblingFingerprintsBefore: siblingFpBefore,
      siblingFingerprintsAfter: Object.fromEntries(
        SIBLINGS.map((id) => [id, fp(plan(afterRetry, id))]),
      ),
      targetOverview: plan(afterRetry, TARGET)?.weeklyOverview,
      resourceCount: (curriculum(afterRetry).resources || []).length,
      activityCount: (curriculum(afterRetry).activities || []).length,
    };
    fs.mkdirSync("/opt/cursor/artifacts/classic-lre-save-sibling", { recursive: true });
    fs.writeFileSync(
      "/opt/cursor/artifacts/classic-lre-save-sibling/preserve-report.json",
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

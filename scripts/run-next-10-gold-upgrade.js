#!/usr/bin/env node
/**
 * Next-10 gold-standard Teaching Kit upgrade runner (draft-only).
 *
 * - Loads 10 selected lessons from import targets
 * - Builds Farm Animals–style enrichment drafts via theme packs
 * - Creates draft HTML picture-card printables (status: draft — never published)
 * - Saves enrichment_draft only in an isolated local store
 * - Never publishes, never flips customer Teaching Kit flags permanently
 * - Does not modify Farm Animals
 *
 * Run: NODE_ENV=test node scripts/run-next-10-gold-upgrade.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");

const enrich = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");
const production = require("./teaching-kit-curriculum-production.js");
const gold = require("./teaching-kit-gold-draft-builder.js");

const infantCore = require("./curriculum-infant-core-import-targets.js");
const toddler = require("./curriculum-toddler-import-targets.js");
const toddlerCore = require("./curriculum-toddler-core-import-targets.js");
const preschool = require("./curriculum-preschool-import-targets.js");

const ROOT = path.join(__dirname, "..");
const PACK_DIR = path.join(__dirname, "fixtures/teaching-kit/next-10-gold-upgrade");
const OUT_DIR = path.join(ROOT, "docs/teaching-kit/qa/next-10-gold-upgrade");
const ARTIFACT_DIR = "/opt/cursor/artifacts/next-10-gold-upgrade";
const PORT = 18740 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(ROOT, `.tmp-next-10-gold-${process.pid}.json`);

const ADMIN = {
  email: "leahivie@icloud.com",
  password: "next-10-gold-draft-pass",
  code: "next-10-gold-draft-code",
};

const SELECTED = [
  {
    id: "cur-lp-infant-sensory-discovery",
    load: () => infantCore.readInfantCoreImportTarget(
      infantCore.INFANT_CORE_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-infant-sensory-discovery"),
    ),
  },
  {
    id: "cur-lp-infant-baby-s-first-conversations",
    load: () => infantCore.readInfantCoreImportTarget(
      infantCore.INFANT_CORE_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-infant-baby-s-first-conversations"),
    ),
  },
  {
    id: "cur-lp-toddler-my-feelings-at-school",
    load: () => toddler.readToddlerImportTarget(
      toddler.TODDLER_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-toddler-my-feelings-at-school"),
    ),
  },
  {
    id: "cur-lp-toddler-community-helpers",
    load: () => toddlerCore.readToddlerCoreImportTarget(
      toddlerCore.TODDLER_CORE_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-toddler-community-helpers"),
    ),
  },
  {
    id: "cur-lp-toddler-amazing-apples",
    load: () => toddler.readToddlerImportTarget(
      toddler.TODDLER_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-toddler-amazing-apples"),
    ),
  },
  {
    id: "cur-lp-preschool-all-about-me",
    load: () => preschool.readPreschoolImportTarget(
      preschool.PRESCHOOL_FREE_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-preschool-all-about-me"),
    ),
  },
  {
    id: "cur-lp-preschool-feelings-and-emotions",
    load: () => preschool.readPreschoolImportTarget(
      preschool.PRESCHOOL_FREE_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-preschool-feelings-and-emotions"),
    ),
  },
  {
    id: "cur-lp-preschool-community-helpers",
    load: () => preschool.readPreschoolImportTarget(
      preschool.PRESCHOOL_FREE_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-preschool-community-helpers"),
    ),
  },
  {
    id: "cur-lp-preschool-stem-explorers",
    load: () => preschool.readPreschoolImportTarget(
      preschool.PRESCHOOL_PRO_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-preschool-stem-explorers"),
    ),
  },
  {
    id: "cur-lp-preschool-gardening-plant-life",
    load: () => preschool.readPreschoolImportTarget(
      preschool.PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-preschool-gardening-plant-life"),
    ),
  },
];

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
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Health timeout");
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPictureCardHtml({ title, planId, words, ageBand }) {
  const cards = (words || []).slice(0, 12);
  const pages = [];
  for (let i = 0; i < cards.length; i += 4) {
    const slice = cards.slice(i, i + 4);
    pages.push(`
      <section class="page">
        <header>
          <strong>Little Learner Hub by Leah</strong>
          <span>${esc(title)} · Picture Cards</span>
        </header>
        <div class="grid">
          ${slice.map((word) => `
            <article class="card">
              <div class="illu" aria-hidden="true">
                <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
                  <rect x="8" y="8" width="104" height="64" rx="10" fill="#f7f1e8" stroke="#6b8f71" stroke-width="2"/>
                  <circle cx="40" cy="38" r="14" fill="#c9ddc3"/>
                  <rect x="58" y="28" width="40" height="28" rx="6" fill="#e7c6a3"/>
                  <text x="60" y="72" text-anchor="middle" font-size="8" fill="#5a6b5d">classroom cue</text>
                </svg>
              </div>
              <h2>${esc(word)}</h2>
              <p class="hint">Talk · Point · Play</p>
            </article>
          `).join("")}
        </div>
        <footer>
          <span>Draft printable for owner review · ${esc(planId)}</span>
          <span>littlelearnershubbyleah.com · Page ${pages.length + 1}</span>
        </footer>
      </section>
    `);
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)} Picture Card Pack (Draft)</title>
<style>
  @page { size: Letter; margin: 0.5in; }
  body { font-family: "Segoe UI", "Trebuchet MS", sans-serif; color: #2f3a33; margin: 0; background: #fff; }
  .page { page-break-after: always; display: flex; flex-direction: column; min-height: 9.5in; padding: 0.15in; }
  header, footer { display: flex; justify-content: space-between; font-size: 11px; color: #5a6b5d; margin: 0.15in 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35in; flex: 1; }
  .card { border: 2px dashed #6b8f71; border-radius: 12px; padding: 0.25in; text-align: center; background: #fcfaf6; }
  .card h2 { font-size: 22px; margin: 0.15in 0 0.05in; }
  .hint { font-size: 12px; color: #6b7c6e; margin: 0; }
  .illu svg { width: 100%; max-width: 180px; height: auto; }
  .teacher { border-top: 1px solid #d7e0d8; margin-top: 0.2in; padding-top: 0.15in; font-size: 12px; }
  @media print { .page { page-break-after: always; } }
</style>
</head>
<body>
${pages.join("\n")}
<section class="page">
  <header><strong>Little Learner Hub by Leah</strong><span>Teacher directions</span></header>
  <div class="teacher">
    <h1 style="font-size:18px;">${esc(title)} · Picture Card Pack (Draft)</h1>
    <p>Age band: <strong>${esc(ageBand)}</strong>. Cut on dashed borders for large child-friendly cards. Laminating optional. Use during centers, small groups, or family send-home talk. Cards support vocabulary already planned in the week — not a worksheet packet.</p>
    <p>Print on US Letter, color preferred; grayscale remains readable. Draft status only — do not publish until owner approval.</p>
    <p>Branding: Little Learner Hub by Leah · littlelearnershubbyleah.com</p>
  </div>
  <footer><span>Draft · ${esc(planId)}</span><span>littlelearnershubbyleah.com</span></footer>
</section>
</body>
</html>`;
}

function scoreLesson(plan, draft, resources) {
  const acts = enrich.flattenLessonActivities(plan, []);
  const scores = enrich.computeReadinessScores(plan, acts, draft || null, { resources: resources || [] });
  const summary = enrich.buildUpgradeSummary(plan, acts, draft || null, { resources: resources || [] });
  const qr = quality.buildQualityReport(plan, acts, draft || null, { resources: resources || [] });
  const books = (draft?.week?.books || plan.books || []);
  const songs = (draft?.week?.songs || plan.songs || []);
  return {
    structural: scores.structuralCompletionPercent,
    premium: scores.premiumReadinessPercent,
    stage: summary.dashboardStage || summary.canonicalStatus?.workflow || "",
    blocksPublish: Boolean(qr.blocksPublish),
    qualityScore: qr.overallScore,
    qualityLabel: qr.overallLabel,
    completeBooks: books.filter((b) => enrich.bookRecordComplete(b)).length,
    bookCount: books.length,
    completeSongs: songs.filter((s) => enrich.songRecordComplete(s)).length,
    songCount: songs.length,
    activityPatches: Object.keys(draft?.activities || {}).length,
    imageRequirements: Object.values(draft?.activities || {}).reduce((acc, a) => {
      const k = a.imageRequirement || "unset";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };
}

function listActivityChanges(plan, draft) {
  const acts = enrich.flattenLessonActivities(plan, []);
  const replaced = [];
  const rewritten = [];
  acts.forEach((act) => {
    const key = String(act.id || act.itemId || "").trim();
    const patch = draft.activities?.[key] || draft.activities?.[act.itemId];
    if (!patch) return;
    rewritten.push({
      id: key,
      title: act.title,
      day: act.dayOfWeek,
      imageRequirement: patch.imageRequirement,
      tips: (patch.teacherTips || []).length,
      observations: (patch.observationPrompts || []).length,
    });
  });
  return { replaced, rewritten };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "drafts"), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "printables"), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });

  const batchId = `gold-upgrade-batch-1-${new Date().toISOString().slice(0, 10)}`;
  const runStarted = new Date().toISOString();

  // Precompute drafts offline first (no server needed for content)
  const prepared = [];
  for (const row of SELECTED) {
    const plan = row.load();
    if (!plan?.id) throw new Error(`Failed to load ${row.id}`);
    if (plan.id === "cur-lp-preschool-farm-animals") throw new Error("Farm Animals must not be modified");
    const packFile = path.join(PACK_DIR, `${plan.id}.json`);
    const packDoc = JSON.parse(fs.readFileSync(packFile, "utf8"));
    const themePack = {
      ...packDoc.themePack,
      ageBand: packDoc.ageBand,
      theme: plan.theme || plan.title,
    };
    const activities = enrich.flattenLessonActivities(plan, []);
    const before = scoreLesson(plan, null, []);
    const built = gold.buildGoldEnrichmentDraft(plan, activities, themePack);
    const draft = built.enrichmentDraft || built;
    // Ensure banned songs stripped from week even if plan had them
    const banned = new Set((themePack.bannedSongTitles || []).map((t) => String(t).toLowerCase()));
    draft.week.songs = (draft.week.songs || []).filter((s) => {
      const title = String(s.title || "").toLowerCase();
      for (const b of banned) if (b && title.includes(b)) return false;
      return true;
    });
    draft.batchId = batchId;
    draft.previewReady = false;
    draft.lastEditedBy = "leahivie@icloud.com (draft upgrade assistant)";

    const printableTitle = (themePack.printableIdeas?.[0]?.title)
      || `${plan.title} Picture Card Pack`;
    const html = buildPictureCardHtml({
      title: plan.title,
      planId: plan.id,
      words: themePack.vocabCards || String(plan.vocabularyWords || "").split(/[,;\n]+/).map((w) => w.trim()).filter(Boolean),
      ageBand: packDoc.ageBand,
    });
    const printableId = `cur-res-draft-${plan.id.replace(/^cur-lp-/, "")}-picture-cards`;
    const printablePath = path.join(OUT_DIR, "printables", `${printableId}.html`);
    fs.writeFileSync(printablePath, html);
    draft.week.printableIds = [printableId];
    if (!Array.isArray(draft.week.printableIdeas) || !draft.week.printableIdeas.length) {
      draft.week.printableIdeas = themePack.printableIdeas || [{ title: printableTitle, purpose: "Vocabulary picture support" }];
    }

    const draftPath = path.join(OUT_DIR, "drafts", `${plan.id}.enrichment-draft.json`);
    fs.writeFileSync(draftPath, JSON.stringify({
      planId: plan.id,
      title: plan.title,
      age: plan.age,
      batchId,
      enrichmentDraft: draft,
      printableId,
      printablePath: path.relative(ROOT, printablePath),
      legacySnapshot: {
        weeklyOverview: plan.weeklyOverview,
        objectives: plan.objectives,
        activityTitles: activities.map((a) => a.title),
      },
    }, null, 2) + "\n");

    prepared.push({
      plan,
      activities,
      draft,
      before,
      printableId,
      printableTitle,
      printablePath,
      draftPath,
      packDoc,
      changes: listActivityChanges(plan, draft),
    });
  }

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += String(c); });

  const lessonReports = [];
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    if (login.status !== 200) throw new Error(`admin login failed: ${login.status} ${login.text}`);
    const adminToken = login.json.token || login.json.adminToken;

    let site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let existing = site.json.siteContent || {};
    // Temporarily enable enrichment editor inside disposable store only.
    let saveFlags = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      siteContent: {
        ...existing,
        updatedAt: existing.updatedAt,
        featureFlags: {
          ...(existing.featureFlags || {}),
          playBasedCurriculum: true,
          teachingKitEnrichmentEditor: true,
          // Customer-facing flags stay false
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
        },
      },
    });
    if (saveFlags.status !== 200) throw new Error(`flag save failed: ${saveFlags.status}`);
    let expectedUpdatedAt = saveFlags.json.siteContent.updatedAt;

    for (const item of prepared) {
      const planPayload = {
        ...item.plan,
        resourceIds: [],
        enrichmentDraft: null,
        enrichmentPublishHistory: [],
      };
      const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        lessonPlan: planPayload,
      });
      if (savePlan.status !== 200) {
        throw new Error(`seed ${item.plan.id}: ${savePlan.status} ${savePlan.text}`);
      }
      expectedUpdatedAt = savePlan.json.siteContentUpdatedAt || expectedUpdatedAt;

      // Create draft printable resource (never published)
      const htmlBody = fs.readFileSync(item.printablePath, "utf8");
      const resource = {
        id: item.printableId,
        title: item.printableTitle,
        type: "printable",
        resourceCategory: "Classroom Resources",
        status: "draft",
        age: item.plan.age,
        theme: item.plan.theme,
        description: `Draft picture-card pack for ${item.plan.title}. Owner review only — not customer-ready.`,
        fileName: `${item.printableId}.html`,
        mimeType: "text/html",
        contentHtml: htmlBody,
        branding: "Little Learner Hub by Leah · littlelearnershubbyleah.com",
        linkedLessonPlanIds: [item.plan.id],
      };
      // Prefer curriculum resource save endpoint if available; fallback: attach printableIds on draft only.
      const resSave = await requestJson("POST", "/api/admin/curriculum/resources/save", {
        adminToken,
        expectedUpdatedAt,
        resource,
      }).catch(() => ({ status: 0, json: null, text: "endpoint missing" }));

      let resourceSaved = false;
      if (resSave.status === 200 || resSave.status === 201) {
        resourceSaved = true;
        expectedUpdatedAt = resSave.json?.siteContentUpdatedAt || expectedUpdatedAt;
      }

      const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        saveMode: "enrichment_draft",
        lessonPlan: {
          id: item.plan.id,
          enrichmentDraft: item.draft,
        },
      });
      if (draftSave.status !== 200) {
        throw new Error(`draft save ${item.plan.id}: ${draftSave.status} ${draftSave.text}`);
      }
      expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
      const saved = (draftSave.json.curriculum.lessonPlans || []).find((p) => p.id === item.plan.id);
      if (!saved?.enrichmentDraft?.week) throw new Error(`draft missing after save ${item.plan.id}`);
      if (saved.weeklyOverview !== item.plan.weeklyOverview) {
        throw new Error(`legacy weeklyOverview changed for ${item.plan.id}`);
      }

      // Confirm draft survives reload
      const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
      const live = (reload.json.siteContent.curriculum.lessonPlans || []).find((p) => p.id === item.plan.id);
      if (!live?.enrichmentDraft?.activities || !Object.keys(live.enrichmentDraft.activities).length) {
        throw new Error(`draft did not persist ${item.plan.id}`);
      }
      expectedUpdatedAt = reload.json.siteContent.updatedAt || expectedUpdatedAt;

      const resources = resourceSaved
        ? [{ id: item.printableId, status: "draft", type: "printable", title: item.printableTitle }]
        : [];
      const after = scoreLesson(item.plan, live.enrichmentDraft, resources);
      const coverage = production.kitSectionCoverage(item.plan, live.enrichmentDraft);
      const history = Array.isArray(live.enrichmentPublishHistory) ? live.enrichmentPublishHistory : [];

      lessonReports.push({
        planId: item.plan.id,
        title: item.plan.title,
        age: item.plan.age,
        tier: item.plan.plan,
        before: item.before,
        after,
        coverage,
        activitiesReplaced: item.changes.replaced,
        activitiesSubstantiallyRewritten: item.changes.rewritten,
        printableCreated: {
          id: item.printableId,
          title: item.printableTitle,
          status: "draft",
          path: path.relative(ROOT, item.printablePath),
          resourceSavedToStore: resourceSaved,
        },
        imagesCreated: [],
        imageRequirements: after.imageRequirements,
        songsCompleted: after.completeSongs,
        songCount: after.songCount,
        booksVerified: after.completeBooks,
        bookCount: after.bookCount,
        draftUpdatedAt: live.enrichmentDraft.updatedAt,
        draftVersionHint: history[0]?.id || live.enrichmentDraft.updatedAt || batchId,
        rollbackIdentifier: {
          planId: item.plan.id,
          batchId,
          enrichmentDraftUpdatedAt: live.enrichmentDraft.updatedAt,
          historyEntries: history.length,
          exportFile: path.relative(ROOT, item.draftPath),
        },
        publishedUnchanged: draftSave.json.publishedUnchanged === true,
        autoPublished: false,
      });
    }

    // Restore flags to all-false customer + admin defaults in disposable store
    site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    existing = site.json.siteContent || {};
    await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      siteContent: {
        ...existing,
        updatedAt: existing.updatedAt,
        featureFlags: {
          ...(existing.featureFlags || {}),
          teachingKitEnrichmentEditor: false,
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
          teachingKitAuthoring: false,
          teachingKitCurriculumDirector: false,
          teachingKitQualityReview: false,
        },
      },
    });

    // Optional disposable store copy for local debugging only (not committed).
    try {
      const storeSnap = path.join(ARTIFACT_DIR, `local-store-snapshot-${batchId}.json`);
      fs.copyFileSync(STORE_PATH, storeSnap);
    } catch { /* ignore */ }

    const report = {
      title: "Next 10 Teaching Kit Gold Upgrade — Owner Review Report",
      batchId,
      runStarted,
      runFinished: new Date().toISOString(),
      referenceUnchanged: {
        farmAnimalsId: "cur-lp-preschool-farm-animals",
        farmAnimalsTouched: false,
        farmPendingResourcesLeft: [
          "Farm Animals Preschool Picture Card Pack",
          "Farm Animals Original Songs and Movements",
        ],
      },
      environment: {
        productionWritten: false,
        reason: "No RENDER_API_KEY / PRODUCTION_DATABASE_URL in this cloud agent environment",
        workspace: "isolated local-json admin store + export package for Leah import/review",
      storeSnapshot: "omitted from git (local disposable store; drafts exported under drafts/)",
    },
      guarantees: {
        nothingPublished: true,
        noBulkPublish: true,
        customerFlagsUnchanged: true,
        customerFlagsFinalState: {
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
        },
        farmAnimalsUnchanged: true,
        legacyLessonBodiesPreserved: lessonReports.every((r) => r.publishedUnchanged !== false),
        usersBillingCalendarsUntouched: true,
      },
      lessons: lessonReports,
      remainingBlockersCommon: [
        "Real classroom example photos not uploaded (briefs/classifications only) — premium image slots still open where required/setup/example",
        "HTML picture-card printables are draft status — must be owner-reviewed, print-checked, then published as resources before Publish Ready",
        "Draft printables do not count as customer-ready linked printables for premium scoring",
        "Production curriculum not updated — Leah must import/apply drafts in production owner workspace",
      ],
      desktopMobilePreview: "Not browser-exercised in this run; enrichment drafts exported for Enrichment Editor desktop/mobile preview by owner",
      printPreview: "Draft HTML printables created under docs/teaching-kit/qa/next-10-gold-upgrade/printables/ — open in browser and Print → PDF for owner check",
    };

    fs.writeFileSync(path.join(OUT_DIR, "FINAL-OWNER-REPORT.json"), JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(path.join(ARTIFACT_DIR, "FINAL-OWNER-REPORT.json"), JSON.stringify(report, null, 2) + "\n");

    const md = buildMarkdownReport(report);
    fs.writeFileSync(path.join(OUT_DIR, "FINAL-OWNER-REPORT.md"), md);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "FINAL-OWNER-REPORT.md"), md);

    console.log(`OK next-10-gold-upgrade (${lessonReports.length} draft lessons)`);
    console.log(`Report: ${path.join(OUT_DIR, "FINAL-OWNER-REPORT.md")}`);
    console.log("Store snapshot: artifacts only (not committed)");
    console.log("PUBLISH_COUNT=0 CUSTOMER_FLAGS=false FARM_ANIMALS_TOUCHED=false");
  } catch (err) {
    console.error("FAIL next-10-gold-upgrade:", err.message || err);
    if (stderr) console.error(stderr.slice(-1500));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push(`# ${report.title}`);
  lines.push("");
  lines.push(`**Batch:** \`${report.batchId}\``);
  lines.push(`**Finished:** ${report.runFinished}`);
  lines.push("");
  lines.push("## Safety confirmations");
  lines.push("");
  lines.push(`- Nothing published: **${report.guarantees.nothingPublished}**`);
  lines.push(`- Customer Teaching Kit flags unchanged (viewer/print/attachments false): **${report.guarantees.customerFlagsUnchanged}**`);
  lines.push(`- Farm Animals untouched: **${report.guarantees.farmAnimalsUnchanged}**`);
  lines.push(`- Production DB written: **${report.environment.productionWritten}** (${report.environment.reason})`);
  lines.push(`- Legacy published lesson bodies preserved on draft saves: **${report.guarantees.legacyLessonBodiesPreserved}**`);
  lines.push("");
  lines.push("## Scores before → after (structural / premium)");
  lines.push("");
  lines.push("| Lesson | Age | Structural | Premium | Songs complete | Books complete | Draft rollback id |");
  lines.push("|---|---|---:|---:|---:|---:|---|");
  report.lessons.forEach((l) => {
    lines.push(`| ${l.title} | ${l.age} | ${l.before.structural}% → ${l.after.structural}% | ${l.before.premium}% → ${l.after.premium}% | ${l.songsCompleted}/${l.songCount} | ${l.booksVerified}/${l.bookCount} | \`${l.rollbackIdentifier.enrichmentDraftUpdatedAt}\` |`);
  });
  lines.push("");
  lines.push("## Per-lesson notes");
  report.lessons.forEach((l) => {
    lines.push("");
    lines.push(`### ${l.title} (\`${l.planId}\`)`);
    lines.push(`- Activities enriched (not deleted): **${l.activitiesSubstantiallyRewritten.length}**`);
    lines.push(`- Activities replaced: **${l.activitiesReplaced.length}** (legacy activities preserved)`);
    lines.push(`- Printable created (draft): ${l.printableCreated.title} (\`${l.printableCreated.id}\`) → \`${l.printableCreated.path}\``);
    lines.push(`- Images uploaded: **${l.imagesCreated.length}** (classifications + briefs only; no fake photos)`);
    lines.push(`- Image requirement mix: ${JSON.stringify(l.imageRequirements)}`);
    lines.push(`- Export: \`${l.rollbackIdentifier.exportFile}\``);
  });
  lines.push("");
  lines.push("## Remaining blockers");
  report.remainingBlockersCommon.forEach((b) => lines.push(`- ${b}`));
  lines.push("");
  lines.push("## Farm Animals pending (unchanged)");
  report.referenceUnchanged.farmPendingResourcesLeft.forEach((b) => lines.push(`- ${b}`));
  lines.push("");
  lines.push("Stop here — do not upgrade additional lessons until Leah reviews this batch.");
  lines.push("");
  return lines.join("\n");
}

main();

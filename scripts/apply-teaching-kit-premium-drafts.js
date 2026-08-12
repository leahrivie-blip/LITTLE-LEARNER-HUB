#!/usr/bin/env node
/**
 * Apply premium Teaching Kit enrichment drafts + draft printable resources to the local store.
 *
 * GUARANTEES:
 * - Never calls publish_enrichment
 * - Never sets lesson/activity/resource status to published for new assets
 * - Printables created as status: draft
 * - Only touches the four target lesson plan IDs
 *
 * Usage:
 *   node scripts/apply-teaching-kit-premium-drafts.js
 *   STORE_PATH=/path/to/launch-store.json node scripts/apply-teaching-kit-premium-drafts.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { KITS } = require("./lib/teaching-kit-premium-drafts/index.js");

const ROOT = path.join(__dirname, "..");
const DRAFT_DIR = path.join(ROOT, "curriculum-drafts/teaching-kits-premium");
const DEFAULT_STORE = path.join(ROOT, "server/data/launch-store.json");

function text(value) {
  return String(value == null ? "" : value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileToDataUrl(filePath, mime) {
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function loadStore(storePath) {
  if (!fs.existsSync(storePath)) {
    throw new Error(`Store not found: ${storePath}. Start the app once or pass STORE_PATH.`);
  }
  return readJson(storePath);
}

function ensureCurriculum(store) {
  if (!store.siteContent || typeof store.siteContent !== "object") {
    store.siteContent = {};
  }
  if (!store.siteContent.curriculum || typeof store.siteContent.curriculum !== "object") {
    store.siteContent.curriculum = {
      lessonPlans: [],
      activities: [],
      resources: [],
      series: [],
      updatedAt: new Date().toISOString(),
    };
  }
  const curriculum = store.siteContent.curriculum;
  curriculum.lessonPlans = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
  curriculum.activities = Array.isArray(curriculum.activities) ? curriculum.activities : [];
  curriculum.resources = Array.isArray(curriculum.resources) ? curriculum.resources : [];
  return curriculum;
}

function upsertDraftResource(curriculum, printable, lessonPlanId, now) {
  const existingIdx = curriculum.resources.findIndex((r) => r.id === printable.id);
  const fileData = fileToDataUrl(path.join(ROOT, path.relative(ROOT, printable.filePath).replace(/^\.\.\//, "")), "application/pdf");
  // printable.filePath is absolute from manifest
  const abs = printable.filePath.startsWith("/")
    ? printable.filePath
    : path.join(ROOT, printable.filePath);
  const pdfData = fileToDataUrl(abs, "application/pdf");
  const resource = {
    id: printable.id,
    title: printable.title,
    resourceCategory: "Printables",
    resourceType: "Printable",
    description: "Premium Teaching Kit draft printable — owner review only. NOT PUBLISHED.",
    ageGroup: "",
    theme: "",
    pageCount: printable.pageCount || 1,
    printingInstructions: "Draft for owner review. Print when approved.",
    accessLevel: "pro",
    fileData: pdfData,
    mediaAssetId: "",
    mediaUrl: "",
    mimeType: "application/pdf",
    fileName: path.basename(abs),
    previewImageUrl: "",
    previewMediaAssetId: "",
    lessonPlanIds: [lessonPlanId],
    status: "draft",
    createdAt: now,
    updatedAt: now,
    publishedAt: "",
    draftOnly: true,
    neverAutoPublish: true,
  };
  void fileData;
  if (existingIdx >= 0) {
    const prev = curriculum.resources[existingIdx];
    curriculum.resources[existingIdx] = {
      ...prev,
      ...resource,
      createdAt: prev.createdAt || now,
      status: "draft",
      publishedAt: "",
    };
  } else {
    curriculum.resources.push(resource);
  }
  return resource.id;
}

function applyKit(curriculum, kitEntry, now) {
  const planIdx = curriculum.lessonPlans.findIndex((p) => p.id === kitEntry.id);
  if (planIdx < 0) {
    return {
      id: kitEntry.id,
      ok: false,
      error: "Lesson plan not found in store. Start server once to seed Free curriculum, then re-run.",
    };
  }
  const draftPath = path.join(ROOT, kitEntry.enrichmentDraftPath);
  if (!fs.existsSync(draftPath)) {
    return { id: kitEntry.id, ok: false, error: `Missing draft JSON: ${draftPath}. Run generate script first.` };
  }
  const enrichmentDraft = readJson(draftPath);
  const printableIds = [];
  (kitEntry.printables || []).forEach((printable) => {
    printableIds.push(upsertDraftResource(curriculum, printable, kitEntry.id, now));
  });
  enrichmentDraft.week = enrichmentDraft.week || {};
  enrichmentDraft.week.printableIds = printableIds;
  enrichmentDraft.updatedAt = now;
  enrichmentDraft.draftOnly = true;
  enrichmentDraft.neverAutoPublish = true;

  const plan = curriculum.lessonPlans[planIdx];
  const resourceIds = Array.isArray(plan.resourceIds) ? [...plan.resourceIds] : [];
  printableIds.forEach((id) => {
    if (!resourceIds.includes(id)) resourceIds.push(id);
  });

  // Owner review gate: lesson shell + enrichment stay DRAFT until manual publish.
  // Do not write enrichmentPublished. Do not call publish_enrichment.
  curriculum.lessonPlans[planIdx] = {
    ...plan,
    status: "draft",
    resourceIds,
    enrichmentDraft,
    updatedAt: now,
    // Keep any prior published enrichment blob untouched for rollback history,
    // but do not create/promote a new published enrichment in this task.
  };

  // Ensure no draft printable accidentally marked published
  curriculum.resources = curriculum.resources.map((r) => {
    if (!printableIds.includes(r.id)) return r;
    return { ...r, status: "draft", publishedAt: "" };
  });

  return {
    id: kitEntry.id,
    title: kitEntry.title,
    ok: true,
    enrichmentDraft: true,
    printableIds,
    previousLessonStatus: plan.status || "published",
    lessonStatus: "draft",
    enrichmentPublishedPresent: Boolean(plan.enrichmentPublished),
    publishedEnrichmentTouched: false,
  };
}

function verifyNoPublish(curriculum, targetIds) {
  const issues = [];
  targetIds.forEach((id) => {
    const plan = curriculum.lessonPlans.find((p) => p.id === id);
    if (!plan) {
      issues.push(`${id}: missing plan`);
      return;
    }
    if (String(plan.status) !== "draft") issues.push(`${id}: lesson status is ${plan.status} (must be draft)`);
    if (!plan.enrichmentDraft) issues.push(`${id}: missing enrichmentDraft`);
    if (plan.enrichmentDraft && plan.enrichmentDraft.neverAutoPublish !== true) {
      issues.push(`${id}: neverAutoPublish flag missing on draft`);
    }
    const draftPrintables = (plan.enrichmentDraft?.week?.printableIds || [])
      .map((rid) => curriculum.resources.find((r) => r.id === rid))
      .filter(Boolean);
    draftPrintables.forEach((r) => {
      if (String(r.status) === "published" || String(r.status) === "featured") {
        issues.push(`${id}: printable ${r.id} is ${r.status} (must be draft)`);
      }
    });
  });
  return issues;
}

function main() {
  const storePath = process.env.STORE_PATH || DEFAULT_STORE;
  const manifestPath = path.join(DRAFT_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("Missing manifest. Run: node scripts/generate-teaching-kit-premium-drafts.js");
    process.exit(1);
  }
  const manifest = readJson(manifestPath);
  const store = loadStore(storePath);
  const curriculum = ensureCurriculum(store);
  const now = new Date().toISOString();
  const results = [];

  // Backup before write
  const backupPath = `${storePath}.bak-premium-tk-drafts-${Date.now()}`;
  fs.copyFileSync(storePath, backupPath);

  manifest.kits.forEach((kitEntry) => {
    results.push(applyKit(curriculum, kitEntry, now));
  });

  curriculum.updatedAt = now;
  store.siteContent.updatedAt = now;
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

  const targetIds = KITS.map((k) => k.planMeta.id);
  const issues = verifyNoPublish(curriculum, targetIds);
  const report = {
    appliedAt: now,
    storePath,
    backupPath,
    draftOnly: true,
    published: false,
    results,
    verificationIssues: issues,
    guarantees: {
      publishEnrichmentCalled: false,
      newPrintablesStatus: "draft",
      enrichmentChannel: "enrichmentDraft",
    },
  };
  const reportPath = path.join(DRAFT_DIR, "apply-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(report, null, 2));
  if (issues.length) {
    console.error("Verification issues found.");
    process.exit(2);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error("Some kits failed to apply (store may lack seeded lessons).");
    process.exit(3);
  }
  console.log("Applied enrichment drafts only. NOTHING PUBLISHED.");
}

main();

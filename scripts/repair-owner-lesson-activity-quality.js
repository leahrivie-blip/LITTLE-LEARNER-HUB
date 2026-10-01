#!/usr/bin/env node
/**
 * Repair thin/blank Owner Admin activity fields on the three target lessons.
 * Expands existing approved concepts — does not create new IDs, publish, or regen images.
 *
 * Usage:
 *   LLH_APPLY_PRODUCTION_DRAFTS=1 node scripts/repair-owner-lesson-activity-quality.js
 *   LLH_APPLY_PRODUCTION_DRAFTS=1 node scripts/repair-owner-lesson-activity-quality.js --dry-run
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("./lib/owner-lesson-complete/runtime.js");
const {
  auditActivityContentQuality,
  collectActivityQualityErrors,
} = require("./lib/owner-lesson-complete/content-quality.js");
const { expandActivityForOwnerQuality } = require("./lib/owner-lesson-complete/expand-activity-quality.js");

const OUT = path.join(__dirname, "..", "curriculum-drafts/owner-lesson-complete/quality-repair-report.json");

const TARGETS = [
  {
    planId: "cur-lp-toddler-all-about-me",
    title: "All About Me",
    expectStatus: "published",
    expectPlan: "Pro",
  },
  {
    planId: "cur-lp-preschool-farm-animals",
    title: "Farm Animals",
    expectStatus: "published",
    expectPlan: "Free",
  },
  {
    planId: "cur-lp-549b80f61dfa8d79",
    title: "Little Makers Workshop",
    expectStatus: "draft",
    expectPlan: "Free",
  },
];

const FORBIDDEN = new Set([
  "cur-lp-88831286195f7477",
  "cur-lp-preschool-all-about-me",
  "cur-lp-toddler-farm-friends",
]);

function activityVerdictRow(activity) {
  const audit = auditActivityContentQuality(activity);
  const tips = Array.isArray(activity.teacherTips) ? activity.teacherTips.length > 0 : false;
  const subs = Array.isArray(activity.substitutions) ? activity.substitutions.length > 0 : false;
  const vocab = String(activity.vocabulary || "").trim().length > 0;
  const prompts = (Array.isArray(activity.observationPrompts) && activity.observationPrompts.length >= 2)
    || String(activity.observationOpportunities || "").split(/\n/).filter(Boolean).length >= 2;
  return {
    activity: activity.title,
    descriptionComplete: !audit.thin.some((t) => t.startsWith("description")) && !audit.blank.includes("description"),
    materials: !audit.blank.includes("materials") && !audit.thin.some((t) => t.startsWith("materials")),
    prep: !audit.blank.includes("preparation") && !audit.thin.some((t) => t.startsWith("preparation")),
    setup: !audit.blank.includes("setup") && !audit.thin.some((t) => t.startsWith("setup")),
    steps: !audit.blank.includes("steps") && !audit.thin.some((t) => t.startsWith("steps")),
    questionsPrompts: !audit.blank.includes("teacherLanguage") && !audit.thin.some((t) => t.startsWith("teacherLanguage")),
    observation: !audit.blank.includes("observationOpportunities") && !audit.thin.some((t) => t.startsWith("observation")),
    safety: !audit.blank.includes("safetyNotes") && !audit.thin.some((t) => t.startsWith("safetyNotes")),
    cleanup: !audit.blank.includes("cleanupTips") && !audit.thin.some((t) => t.startsWith("cleanupTips")),
    tips,
    adaptations: !audit.blank.includes("adaptations") && !audit.thin.some((t) => t.startsWith("adaptations")),
    vocabulary: vocab && !audit.thin.some((t) => t.startsWith("vocabulary")),
    teacherLanguage: !audit.blank.includes("teacherLanguage"),
    observationPromptsOk: prompts,
    substitutions: subs,
    verdict: audit.ok ? "COMPLETE" : "NEEDS_WORK",
    blank: audit.blank,
    thin: audit.thin,
  };
}

async function repairLesson(client, tokenRef, target, { dryRun }) {
  if (FORBIDDEN.has(target.planId)) throw new Error(`Refusing forbidden lesson ${target.planId}`);
  await client.ensureToken(tokenRef);
  let site = await client.loadAdminSite(tokenRef.token);
  const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === target.planId);
  if (!plan) throw new Error(`Lesson ${target.planId} not found`);
  if (plan.status !== target.expectStatus) {
    throw new Error(`${target.planId} status=${plan.status} expected ${target.expectStatus}`);
  }
  if (plan.plan !== target.expectPlan) {
    throw new Error(`${target.planId} plan=${plan.plan} expected ${target.expectPlan}`);
  }

  const live = (site.curriculum.activities || []).filter(
    (a) => a.lessonPlanId === target.planId && a.status !== "archived",
  );
  if (live.length !== 15) throw new Error(`${target.planId} has ${live.length} activities, expected 15`);

  const beforeAudits = live.map((a) => ({
    id: a.id,
    title: a.title,
    ...auditActivityContentQuality(a),
    source: "live curriculum.activities (Owner Admin editor source)",
    recommendedAction: auditActivityContentQuality(a).ok ? "KEEP" : "IMPROVE",
  }));

  const activities = {};
  for (const a of live) {
    const patch = expandActivityForOwnerQuality(a);
    activities[a.id] = patch;
    if (a.itemId) activities[a.itemId] = patch;
  }

  const enrichmentDraft = {
    activities,
    week: {},
    updatedAt: new Date().toISOString(),
    lastEditedBy: process.env.ADMIN_EMAIL || "quality-repair-script",
  };

  if (dryRun) {
    const previewLive = live.map((a) => ({ ...a, ...expandActivityForOwnerQuality(a), vocabulary: Array.isArray(expandActivityForOwnerQuality(a).vocabulary) ? expandActivityForOwnerQuality(a).vocabulary.join(", ") : expandActivityForOwnerQuality(a).vocabulary }));
    const quality = collectActivityQualityErrors(previewLive);
    return {
      planId: target.planId,
      title: target.title,
      dryRun: true,
      beforeAudits,
      previewFailCount: quality.failCount,
      previewErrors: quality.errors.slice(0, 20),
    };
  }

  const save = await client.saveEnrichmentDraft(
    tokenRef.token,
    target.planId,
    site.updatedAt,
    enrichmentDraft,
  );
  if (save.status !== 200) {
    throw new Error(`${target.planId} draft save failed (${save.status}): ${save.json?.error || save.raw?.slice(0, 200)}`);
  }

  site = await client.loadAdminSite(tokenRef.token);
  const applyRes = await client.applyEnrichmentToLiveLesson(
    tokenRef.token,
    target.planId,
    site.updatedAt,
    enrichmentDraft,
  );
  if (applyRes.status !== 200) {
    throw new Error(`${target.planId} apply failed (${applyRes.status}): ${applyRes.json?.error || applyRes.raw?.slice(0, 200)}`);
  }

  site = await client.loadAdminSite(tokenRef.token);
  const sync = await client.syncLiveActivitiesFromDailyPlans(
    tokenRef.token,
    target.planId,
    site.updatedAt,
  );
  if (sync.status !== 200) {
    throw new Error(`${target.planId} sync failed (${sync.status}): ${sync.json?.error || sync.raw?.slice(0, 200)}`);
  }

  site = await client.loadAdminSite(tokenRef.token);
  const after = (site.curriculum.lessonPlans || []).find((p) => p.id === target.planId);
  if (after.status !== target.expectStatus) {
    throw new Error(`${target.planId} status changed ${target.expectStatus} → ${after.status}`);
  }
  if (after.plan !== target.expectPlan) {
    throw new Error(`${target.planId} Free/Pro changed ${target.expectPlan} → ${after.plan}`);
  }
  if (after.enrichmentDraft && Object.keys(after.enrichmentDraft.activities || {}).some((k) => k.startsWith("cur-act-"))) {
    throw new Error(`${target.planId} enrichmentDraft still has activity keys after apply`);
  }

  const liveAfter = (site.curriculum.activities || []).filter(
    (a) => a.lessonPlanId === target.planId && a.status !== "archived",
  );
  const ready = client.assertLiveLessonComplete(site, target.planId, { expectedActivityCount: 15 });
  const activityRows = liveAfter.map(activityVerdictRow);
  const fullyComplete = activityRows.filter((r) => r.verdict === "COMPLETE").length;
  const blankHits = activityRows.reduce((n, r) => n + r.blank.length, 0);
  const thinHits = activityRows.reduce((n, r) => n + r.thin.length, 0);
  const withImg = liveAfter.filter((a) => a.setupImageUrl || a.exampleImageUrl).length;
  const printableIds = Array.isArray(after.resourceIds) ? after.resourceIds : [];
  const ttk = after.teachingKit?.teacherToolkit || {};

  return {
    planId: target.planId,
    title: after.title,
    status: after.status,
    plan: after.plan,
    beforeAudits,
    ready,
    summary: {
      activities: liveAfter.length,
      fullyComplete,
      blankFields: blankHits,
      thinFields: thinHits,
      images: withImg,
      printables: printableIds.length,
      weeklyFields: {
        weeklyOverview: Boolean(String(after.weeklyOverview || "").trim()),
        objectives: Boolean(String(after.objectives || "").trim()),
        weeklyMaterials: Boolean(String(after.weeklyMaterials || "").trim()),
        teacherPreparation: Boolean(String(ttk.teacherPreparation || "").trim()),
        prepChecklist: Array.isArray(ttk.prepChecklist) && ttk.prepChecklist.length > 0,
        observationFocus: Array.isArray(ttk.observationFocus) && ttk.observationFocus.length > 0,
        familyConnection: Boolean(String(after.familyConnection || "").trim()),
        milestones: Array.isArray(after.teachingKit?.milestones) && after.teachingKit.milestones.length > 0,
        books: Array.isArray(after.books) && after.books.length > 0,
        songs: Array.isArray(after.songs) && after.songs.length > 0,
      },
      verdict: ready.ok && fullyComplete === 15 && blankHits === 0 && thinHits === 0
        ? "PASS"
        : "FAIL",
    },
    activityRows,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    console.error("Refusing to write: set LLH_APPLY_PRODUCTION_DRAFTS=1 (or pass --dry-run)");
    process.exit(2);
  }

  const client = createClient();
  const tokenRef = { token: await client.login() };
  const report = {
    startedAt: new Date().toISOString(),
    dryRun,
    lessons: [],
  };

  for (const target of TARGETS) {
    console.log(`\n=== ${target.title} (${target.planId}) ===`);
    const result = await repairLesson(client, tokenRef, target, { dryRun });
    report.lessons.push(result);
    if (dryRun) {
      console.log(`dry-run previewFailCount=${result.previewFailCount}`);
      if (result.previewErrors?.length) console.log(result.previewErrors.slice(0, 8).join("\n"));
    } else {
      console.log(`ready=${result.ready.ok} fullyComplete=${result.summary.fullyComplete}/15 blank=${result.summary.blankFields} thin=${result.summary.thinFields} verdict=${result.summary.verdict}`);
      if (!result.ready.ok) console.log(result.ready.errors.join("\n"));
    }
  }

  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT}`);

  if (!dryRun) {
    const failed = report.lessons.filter((l) => l.summary?.verdict !== "PASS");
    if (failed.length) {
      console.error(`Quality repair incomplete for: ${failed.map((f) => f.title).join(", ")}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

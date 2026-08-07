#!/usr/bin/env node
/**
 * Upgrade 10 real production lesson plans into Complete Teaching Kit drafts.
 * Saves enrichment_draft + non-destructive dailyPlans/metadata updates.
 * Does NOT publish enrichment, generate images, or generate printables.
 *
 * Usage:
 *   ADMIN_BEARER=... node scripts/run-first-10-teaching-kit-upgrades.js
 *   (or reads /tmp/prod_admin_bearer.txt + /tmp/prod_ADMIN_EMAIL.txt)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const enrichment = require("./teaching-kit-enrichment.js");
const production = require("./teaching-kit-curriculum-production.js");
const quality = require("./teaching-kit-quality-review.js");
const polish = require("./teaching-kit-content-upgrade-polish.js");

const ROOT = path.join(__dirname, "..");
const PROD = process.env.SITE_URL || "https://littlelearnershubbyleah.com";
const OUT = process.env.TK_UPGRADE_OUT || "/opt/cursor/artifacts/tk-first-10-upgrades";
const REPORT_DIR = path.join(ROOT, "docs/teaching-kit/qa/first-10-upgrades");

const TARGET_IDS = Object.freeze([
  "cur-lp-preschool-farm-animals",
  "cur-lp-preschool-all-about-me",
  "cur-lp-preschool-colors-everywhere",
  "cur-lp-preschool-community-helpers",
  "cur-lp-preschool-weather-watchers",
  "cur-lp-toddler-colors-everywhere",
  "cur-lp-toddler-construction-crew",
  "cur-lp-toddler-bugs-and-butterflies",
  "cur-lp-infant-colors-all-around-us",
  "cur-lp-infant-animal-sounds-discovery",
]);

function readBearer() {
  if (process.env.ADMIN_BEARER) return process.env.ADMIN_BEARER.trim();
  const p = "/tmp/prod_admin_bearer.txt";
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  throw new Error("ADMIN_BEARER missing");
}

function readAdminEmail() {
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL.trim();
  const p = "/tmp/prod_ADMIN_EMAIL.txt";
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  return "leahivie@icloud.com";
}

async function api(method, urlPath, { body, token } = {}) {
  const headers = { Accept: "application/json", "User-Agent": "llh-tk-first-10-upgrade/1.0" };
  if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${PROD}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function summarizePlan(plan, activities, draft) {
  const week = draft?.week || {};
  const daily = plan.dailyPlans || {};
  const foci = ["monday", "tuesday", "wednesday", "thursday", "friday"]
    .map((d) => (daily[d]?.focus ? 1 : 0))
    .reduce((a, b) => a + b, 0);
  return {
    id: plan.id,
    title: plan.title,
    age: plan.age,
    plan: plan.plan,
    overviewLen: String(plan.weeklyOverview || "").length,
    objectivesLen: String(plan.objectives || "").length,
    books: (plan.books || []).length,
    songs: (plan.songs || []).length,
    activityCount: activities.length,
    hasEnrichmentDraft: Boolean(draft && (draft.week || draft.activities)),
    draftBooks: (week.books || []).length,
    draftSongs: (week.songs || []).length,
    printableIdeas: (week.printableIdeas || []).length,
    weekdayFocusFilled: foci,
    coverUrl: Boolean(plan.coverImageUrl || plan.coverUrl),
    coverPrompt: Boolean(week.coverImagePrompt || plan.coverImagePrompt),
  };
}

async function main() {
  fs.mkdirSync(path.join(OUT, "before"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "after"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "reports"), { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const token = readBearer();
  const adminEmail = readAdminEmail();
  console.log("Loading admin site-content…");
  const siteRes = await api("GET", "/api/admin/site-content", { token });
  if (siteRes.status !== 200 || !siteRes.json?.siteContent) {
    throw new Error(`site-content failed: ${siteRes.status}`);
  }
  let siteContent = siteRes.json.siteContent;
  let expectedUpdatedAt = siteContent.updatedAt;
  const curriculum = siteContent.curriculum || {};
  const allPlans = curriculum.lessonPlans || [];
  const allActivities = curriculum.activities || [];

  const results = [];
  const blockers = [];
  const reusableCreated = {
    printableTemplates: Object.keys(polish.PRINTABLE_TEMPLATES),
    polishModule: "scripts/teaching-kit-content-upgrade-polish.js",
    notes: [
      "Shared printable-needed templates by domain",
      "Shared cover prompt builder (cartoon curriculum style)",
      "Shared book/song/toolkit completers (no copyrighted lyrics)",
      "Shared daily-plan enricher for Mon–Fri empty weekday fields",
    ],
  };

  for (const planId of TARGET_IDS) {
    console.log(`\n=== Upgrading ${planId} ===`);
    let plan = allPlans.find((p) => p.id === planId);
    if (!plan) {
      blockers.push({ planId, error: "Lesson plan not found in production curriculum" });
      continue;
    }
    // Restore legacy books/songs from frozen pre-upgrade snapshots if a prior run
    // accidentally replaced them with fixture generics.
    const freezePath = path.join("/tmp/tk-upgrade-10/legacy-freeze", `${planId}.json`);
    const beforePath = path.join(OUT, "before", `${planId}.json`);
    const snapPath = fs.existsSync(freezePath) ? freezePath : beforePath;
    if (fs.existsSync(snapPath)) {
      try {
        const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
        const snapPlan = snap.plan || snap;
        const snapBooks = Array.isArray(snapPlan.books) ? snapPlan.books : [];
        const snapSongs = Array.isArray(snapPlan.songs) ? snapPlan.songs : [];
        const currentGeneric = !(plan.books || []).length
          || (plan.books || []).every((b) => /search your classroom library|add a book/i.test(String(b?.title || b || "")));
        if (snapBooks.length && (currentGeneric || (plan.books || []).length < snapBooks.length)) {
          plan = { ...plan, books: snapBooks };
        }
        const songsGeneric = !(plan.songs || []).length
          || (plan.songs || []).every((s) => /hello song|clean-up helper/i.test(String(s?.title || s || "")));
        if (snapSongs.length && (songsGeneric || (plan.songs || []).length < snapSongs.length)) {
          plan = { ...plan, songs: snapSongs };
        }
        // Prefer frozen weeklyMaterials / overview when present (true pre-upgrade baseline).
        if (snapPlan.weeklyMaterials) plan = { ...plan, weeklyMaterials: snapPlan.weeklyMaterials };
      } catch { /* ignore */ }
    }
    const activities = allActivities.filter((a) => a.lessonPlanId === planId);
    const beforeSnap = summarizePlan(plan, activities, plan.enrichmentDraft);
    // Do not overwrite frozen baseline before/ artifacts on repair runs.
    if (!fs.existsSync(freezePath)) {
      fs.writeFileSync(
        path.join(OUT, "before", `${planId}.json`),
        JSON.stringify({ plan, activityCount: activities.length, summary: beforeSnap }, null, 2),
      );
    }

    // 1) Fixture/production pipeline draft
    const upgraded = production.upgradeOneLesson(plan, {
      curriculum: { lessonPlans: allPlans, activities: allActivities },
      dryRun: false,
    });
    // 2) Content-rules polish (placeholders, toolkit, books/songs, daily plans)
    const polished = polish.polishUpgradePackage(plan, activities, upgraded.enrichmentDraft);
    const draft = polished.enrichmentDraft;

    // Quality check against polished draft + weekday-filled plan clone
    const planForQuality = { ...plan, ...polished.planPatch, enrichmentDraft: draft };
    const q = quality.buildQualityReport(planForQuality, activities, draft);

    // 3) Save enrichment draft
    const draftSave = await api("POST", "/api/admin/curriculum/lesson-plans", {
      token,
      body: {
        saveMode: "enrichment_draft",
        expectedUpdatedAt,
        adminEmail,
        lessonPlan: {
          id: planId,
          enrichmentDraft: draft,
        },
      },
    });
    if (draftSave.status !== 200) {
      blockers.push({
        planId,
        step: "enrichment_draft",
        status: draftSave.status,
        error: draftSave.json?.error || draftSave.json?.code || "draft save failed",
      });
      console.error("DRAFT SAVE FAIL", planId, draftSave.status, draftSave.json?.error || draftSave.json?.code);
      // refresh stamp and continue
      const refresh = await api("GET", "/api/admin/site-content", { token });
      if (refresh.json?.siteContent?.updatedAt) expectedUpdatedAt = refresh.json.siteContent.updatedAt;
      continue;
    }
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const savedDraftPlan = draftSave.json.lessonPlan;

    // 4) Non-destructive published field fill (weekday focus + book/song metadata)
    // Reload latest plan from save response
    const latest = savedDraftPlan || plan;
    const fullPlan = {
      ...latest,
      ...polished.planPatch,
      id: planId,
      status: latest.status || plan.status,
      enrichmentDraft: latest.enrichmentDraft || draft,
      // Never blank covers
      coverImageUrl: latest.coverImageUrl || plan.coverImageUrl || "",
      coverImageAlt: latest.coverImageAlt || plan.coverImageAlt || "",
    };
    const fullSave = await api("POST", "/api/admin/curriculum/lesson-plans", {
      token,
      body: {
        saveMode: "full",
        expectedUpdatedAt,
        adminEmail,
        lessonPlan: fullPlan,
      },
    });
    if (fullSave.status !== 200) {
      blockers.push({
        planId,
        step: "full_dailyPlans",
        status: fullSave.status,
        error: fullSave.json?.error || fullSave.json?.code || "full save failed",
        note: "Enrichment draft may still have been saved",
      });
      console.error("FULL SAVE FAIL", planId, fullSave.status, fullSave.json?.error || fullSave.json?.code);
    } else {
      expectedUpdatedAt = fullSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    }

    const afterPlan = fullSave.json?.lessonPlan || savedDraftPlan || fullPlan;
    const afterActs = activities;
    const afterDraft = afterPlan.enrichmentDraft || draft;
    const afterSnap = summarizePlan(afterPlan, afterActs, afterDraft);
    const afterQuality = quality.buildQualityReport(afterPlan, afterActs, afterDraft);

    fs.writeFileSync(
      path.join(OUT, "after", `${planId}.json`),
      JSON.stringify({
        plan: afterPlan,
        summary: afterSnap,
        quality: {
          overallScore: afterQuality.overallScore,
          overallLabel: afterQuality.overallLabel,
          publishReadiness: afterQuality.publishReadiness,
          blocksPublish: afterQuality.blocksPublish,
          ownerMediaPending: afterQuality.ownerMediaPending,
          mediaSlotsSatisfied: afterQuality.mediaSlotsSatisfied,
          blockingIssues: afterQuality.blockingIssues,
        },
      }, null, 2),
    );

    results.push({
      planId,
      title: plan.title,
      age: plan.age,
      membershipPlan: plan.plan,
      before: beforeSnap,
      after: afterSnap,
      completionBefore: upgraded.before.completionPercent,
      completionAfter: enrichment.computeCompletionPercent(afterPlan, afterActs, afterDraft),
      qualityScore: afterQuality.overallScore,
      qualityLabel: afterQuality.overallLabel,
      publishReadiness: afterQuality.publishReadiness,
      blocksPublish: afterQuality.blocksPublish,
      ownerMediaPending: afterQuality.ownerMediaPending,
      blockingIssues: afterQuality.blockingIssues,
      draftSaved: draftSave.status === 200,
      dailyPlansSaved: fullSave.status === 200,
      autoPublished: false,
      schemaChanges: "none — used existing enrichmentDraft + dailyPlans fields; coverImagePrompt on week/plan metadata",
    });
    console.log(
      "OK",
      plan.title,
      `completion ${upgraded.before.completionPercent}% → ${results[results.length - 1].completionAfter}%`,
      `quality ${afterQuality.overallScore} ${afterQuality.publishReadiness}`,
      afterQuality.blocksPublish ? `BLOCKERS=${afterQuality.blockingIssues.map((b) => b.code).join(",")}` : "no-hard-blockers",
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    site: PROD,
    autoPublished: false,
    curriculumMutated: true,
    mutationType: "enrichment_draft + non-destructive dailyPlans/metadata fill for 10 existing lessons",
    imageGeneration: false,
    printableGeneration: false,
    targetIds: TARGET_IDS,
    upgraded: results,
    blockers,
    reusableComponents: reusableCreated,
    ownerReviewRequired: true,
    doNotUpgradeRemainingUntilApproved: true,
  };

  fs.writeFileSync(path.join(OUT, "reports", "UPGRADE_REPORT.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, "UPGRADE_REPORT.json"), JSON.stringify(report, null, 2));

  const md = [
    "# First 10 Teaching Kit Content Upgrades — Owner Review",
    "",
    `Generated: ${report.generatedAt}`,
    `Site: ${PROD}`,
    "",
    "## Scope",
    "",
    "- Upgraded **10 existing** production lesson plans (no sample/placeholder curriculum).",
    "- Saved **enrichment drafts** + filled empty weekday/daily Teaching Kit fields.",
    "- **Did not** generate covers, activity images, or printable files.",
    "- **Did not** auto-publish enrichment (`publish_enrichment` unused).",
    "- Remaining library **paused** until you approve these 10 as the quality standard.",
    "",
    "## Lessons upgraded",
    "",
    "| # | ID | Title | Age | Plan | Completion before → after | Quality | Draft | Daily plans |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r, i) => `| ${i + 1} | \`${r.planId}\` | ${r.title} | ${r.age} | ${r.membershipPlan} | ${r.completionBefore}% → ${r.completionAfter}% | ${r.qualityScore} (${r.publishReadiness}) | ${r.draftSaved ? "yes" : "NO"} | ${r.dailyPlansSaved ? "yes" : "NO"} |`),
    "",
    "## Before / after summaries",
    "",
    ...results.flatMap((r) => [
      `### ${r.title} (\`${r.planId}\`)`,
      "",
      `- **Before:** books ${r.before.books}, songs ${r.before.songs}, draft=${r.before.hasEnrichmentDraft}, weekday focus ${r.before.weekdayFocusFilled}/5, cover=${r.before.coverUrl}`,
      `- **After:** draft books ${r.after.draftBooks}, draft songs ${r.after.draftSongs}, printable ideas ${r.after.printableIdeas}, weekday focus ${r.after.weekdayFocusFilled}/5, cover prompt=${r.after.coverPrompt}`,
      `- **Owner media pending:** ${r.ownerMediaPending}`,
      `- **Hard blockers:** ${r.blockingIssues?.length ? r.blockingIssues.map((b) => b.code).join(", ") : "none"}`,
      "",
    ]),
    "## Blockers encountered",
    "",
    blockers.length ? blockers.map((b) => `- \`${b.planId}\` (${b.step || "n/a"}): ${b.error}`).join("\n") : "- none",
    "",
    "## Schema / database changes",
    "",
    "- No schema migrations.",
    "- Used existing `enrichmentDraft`, `dailyPlans`, book/song metadata, and `coverImagePrompt` fields.",
    "",
    "## Reusable components for remaining conversion",
    "",
    ...reusableCreated.notes.map((n) => `- ${n}`),
    `- Module: \`${reusableCreated.polishModule}\``,
    "",
    "## Next step",
    "",
    "Review these 10 in production Admin (Enrichment Editor / Teaching Kit). After approval, use them as the quality standard for the rest of the library.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(OUT, "reports", "UPGRADE_REPORT.md"), md);
  fs.writeFileSync(path.join(REPORT_DIR, "UPGRADE_REPORT.md"), md);
  console.log("\n" + md);
  if (blockers.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

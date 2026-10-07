#!/usr/bin/env node
/**
 * Apply Pro curriculum upgrades as enrichment_draft ONLY (never publish).
 *
 * Why not live replace_from_master_paste on published lessons?
 * That endpoint preserves status=published and overwrites live dailyPlans/activities,
 * so entitled Pro providers would see new content immediately. The established
 * draft channel for published lessons is saveMode=enrichment_draft
 * (publishedUnchanged: true). Owner publishes manually later.
 *
 * Credentials: SITE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE via env only.
 * Never logs secrets. Never commits secrets.
 *
 * Usage:
 *   SITE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_ACCESS_CODE=... \
 *     node scripts/apply-pro-upgrade-enrichment-draft.js --lesson pet-vet
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";

function text(v) {
  return String(v == null ? "" : v).trim();
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, SITE_URL);
    const lib = u.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = { raw: raw.slice(0, 400) };
          }
          resolve({ status: res.statusCode, json, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    throw new Error("Missing ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_ACCESS_CODE env vars.");
  }
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`Admin login failed (${res.status}): ${res.json?.error || "no token"}`);
  }
  return res.json.token;
}

async function loadAdminSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error(`site-content failed ${res.status}`);
  return res.json.siteContent;
}

function buildDraftFromUpgrade(plan, activities, upgrade) {
  const byTitle = new Map();
  activities.forEach((a) => {
    byTitle.set(`${text(a.dayOfWeek).toLowerCase()}::${text(a.title).toLowerCase()}`, a);
    byTitle.set(`*::${text(a.title).toLowerCase()}`, a);
  });

  const draftActivities = {};
  const decisions = [];
  const unmatched = [];
  const matched = [];

  (upgrade.activities || []).forEach((row) => {
    const day = text(row.dayOfWeek).toLowerCase();
    const live =
      byTitle.get(`${day}::${text(row.title).toLowerCase()}`) ||
      byTitle.get(`*::${text(row.title).toLowerCase()}`);
    if (!live) {
      unmatched.push({ day, title: row.title });
      return;
    }
    const key = text(live.id) || text(live.itemId);
    matched.push({ id: live.id, itemId: live.itemId, title: live.title, day: live.dayOfWeek });
    draftActivities[key] = {
      replaceOwned: true,
      title: row.title,
      dayOfWeek: day,
      activityCategory: row.activityCategory,
      ageModifications: row.ageModifications,
      durationMinutes: row.durationMinutes,
      objective: row.objective,
      description: row.description,
      materials: row.materials,
      preparation: row.preparation,
      setup: row.setup,
      steps: row.steps,
      teacherLanguage: row.teacherLanguage,
      observationOpportunities: row.observationOpportunities,
      safetyNotes: row.safetyNotes,
      cleanupTips: row.cleanupTips,
      indoorAlternatives: row.indoorAlternatives || "",
      outdoorAlternatives: row.outdoorAlternatives || "",
      teacherTips: Array.isArray(row.teacherTips) ? row.teacherTips : text(row.teacherTips).split("\n").filter(Boolean),
      substitutions: Array.isArray(row.substitutions) ? row.substitutions : [],
      adaptations: row.adaptations || "",
      extensions: row.extensions || "",
      mixedAgeAdaptations: row.mixedAgeAdaptations || "",
      observationPrompts: Array.isArray(row.observationPrompts)
        ? row.observationPrompts
        : text(row.observationPrompts).split("\n").filter(Boolean),
      vocabulary: Array.isArray(row.vocabulary)
        ? row.vocabulary
        : text(row.vocabulary).split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      imageRequirement: row.imageRequirement || "not_needed",
      imageBriefSetup: row.imageBriefSetup || "",
      imageBriefExample: row.imageBriefExample || "",
      settingTags: row.settingTags || [],
    };
    decisions.push({
      title: row.title,
      itemId: live.itemId,
      activityId: live.id,
      decision: row.decision || "rewrite",
      note: row.decisionNote || "Priority 1 Pro upgrade — substantial Teaching Kit rewrite (draft only)",
    });
  });

  const week = upgrade.week || {};
  return {
    draft: {
      updatedAt: new Date().toISOString(),
      lastEditedBy: ADMIN_EMAIL || "owner-admin",
      previewReady: true,
      draftOnly: true,
      neverAutoPublish: true,
      activities: draftActivities,
      week: {
        weeklyOverview: week.weeklyOverview || "",
        objectives: week.objectives || "",
        weeklyMaterials: week.weeklyMaterials || "",
        familyConnection: week.familyConnection || "",
        adaptations: week.adaptations || "",
        vocabularyWords: week.vocabularyWords || "",
        teacherPreparation: week.teacherPreparation || "",
        observationFocus: week.observationFocus || "",
        prepChecklist: week.prepChecklist || [],
        fieldOwnership: {
          objectives: true,
          weeklyOverview: true,
          weeklyMaterials: true,
          familyConnection: true,
          teacherPreparation: true,
        },
        activityDecisions: decisions,
        books: week.books || [],
        songs: week.songs || [],
        teacherToolkit: week.teacherToolkit || {},
        printableIdeas: week.printableIdeas || [],
        printableIds: week.printableIds || [],
        milestones: week.milestones || [],
        researchSources: week.researchSources || [],
        coverStatus: week.coverStatus || "COVER IMAGE PENDING",
        proposedCoverActivity: week.proposedCoverActivity || "",
      },
      meta: {
        purpose: "Pro curriculum Priority 1 upgrade — enrichment_draft only; DO NOT PUBLISH",
        sourceLessonId: plan.id,
        sourceTitle: plan.title,
        upgradeBatch: upgrade.batch || "priority-1",
        masterPasteValidated: Boolean(upgrade.masterPasteValidated),
        activityPatchCount: Object.keys(draftActivities).length,
      },
    },
    matched,
    unmatched,
  };
}

async function saveEnrichmentDraft(token, planId, enrichmentDraft, expectedUpdatedAt) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/lesson-plans",
    {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
      lessonPlan: {
        id: planId,
        enrichmentDraft,
      },
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--lesson=")) || "--lesson=pet-vet";
  const lessonKey = arg.split("=")[1] || "pet-vet";
  const upgradePath = path.join(ROOT, "curriculum-drafts/pro-upgrade", `${lessonKey}.upgrade.json`);
  if (!fs.existsSync(upgradePath)) {
    throw new Error(`Missing upgrade package: ${upgradePath}`);
  }
  const upgrade = JSON.parse(fs.readFileSync(upgradePath, "utf8"));
  const lessonId = upgrade.lessonId;
  if (!lessonId) throw new Error("upgrade.lessonId required");

  console.log(JSON.stringify({
    phase: "start",
    lessonKey,
    lessonId,
    site: SITE_URL,
    saveMode: "enrichment_draft",
    publish: false,
  }));

  const token = await login();
  console.log(JSON.stringify({ phase: "login", ok: true }));

  const site = await loadAdminSite(token);
  const stamp = site.updatedAt;
  const plan = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
  if (!plan) throw new Error(`Lesson not found: ${lessonId}`);
  if (text(plan.plan) !== "Pro") throw new Error(`Refusing non-Pro lesson (plan=${plan.plan})`);

  const activities = (site.curriculum?.activities || []).filter(
    (a) => a.lessonPlanId === lessonId && a.status !== "archived",
  );

  const before = {
    id: plan.id,
    title: plan.title,
    plan: plan.plan,
    status: plan.status,
    activityCount: activities.length,
    hasEnrichmentDraft: Boolean(plan.enrichmentDraft && Object.keys(plan.enrichmentDraft.activities || {}).length),
    enrichmentPublished: plan.enrichmentPublished === true,
    resourceIds: (plan.resourceIds || []).slice(),
    coverImageUrl: plan.coverImageUrl || "",
  };

  const { draft, matched, unmatched } = buildDraftFromUpgrade(plan, activities, upgrade);
  if (unmatched.length) {
    console.log(JSON.stringify({ phase: "mapping_warning", unmatched }));
  }
  if (!matched.length) {
    throw new Error("No activities matched — refusing empty draft write.");
  }

  const save = await saveEnrichmentDraft(token, lessonId, draft, stamp);
  if (save.status !== 200) {
    throw new Error(`Draft save failed (${save.status}): ${save.json?.error || save.raw?.slice(0, 200)}`);
  }

  const savedPlan = save.json?.lessonPlan || {};
  const afterSite = await loadAdminSite(token);
  const afterPlan = (afterSite.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
  const afterActs = (afterSite.curriculum?.activities || []).filter(
    (a) => a.lessonPlanId === lessonId && a.status !== "archived",
  );

  const result = {
    phase: "complete",
    lessonId,
    title: afterPlan?.title || plan.title,
    preserved: {
      idUnchanged: afterPlan?.id === lessonId,
      planStillPro: afterPlan?.plan === "Pro",
      statusStillPublished: afterPlan?.status === before.status,
      resourceIdsPreserved: JSON.stringify(afterPlan?.resourceIds || []) === JSON.stringify(before.resourceIds),
      coverPreserved: (afterPlan?.coverImageUrl || "") === before.coverImageUrl,
      activityCountUnchanged: afterActs.length === before.activityCount,
    },
    draft: {
      saved: Boolean(afterPlan?.enrichmentDraft),
      activityPatchCount: Object.keys(afterPlan?.enrichmentDraft?.activities || {}).length,
      publishedUnchanged: save.json?.publishedUnchanged === true || save.json?.saveMode === "enrichment_draft",
      enrichmentPublished: afterPlan?.enrichmentPublished === true,
      coverStatus: afterPlan?.enrichmentDraft?.week?.coverStatus || "",
    },
    mapping: {
      matched: matched.length,
      unmatched: unmatched.length,
    },
    publishStatus: "NOT PUBLISHED / REVIEW NEEDED",
    saveStatus: save.status,
  };

  const outDir = path.join(ROOT, "docs/audits");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `pro-upgrade-${lessonKey}-draft-result.json`);
  fs.writeFileSync(outPath, JSON.stringify({ before, result, matched, unmatched }, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote ${outPath}`);

  if (!result.preserved.idUnchanged || !result.preserved.planStillPro || !result.draft.saved) {
    process.exitCode = 2;
  }
  if (result.draft.enrichmentPublished) {
    console.error("ERROR: enrichment became published — unexpected");
    process.exitCode = 3;
  }
}

main().catch((err) => {
  console.error("APPLY_FAILED", err.message);
  process.exit(1);
});

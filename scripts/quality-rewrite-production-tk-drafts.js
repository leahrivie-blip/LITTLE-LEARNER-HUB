#!/usr/bin/env node
/**
 * Quality rewrite for the four production Teaching Kit enrichment drafts.
 * Removes generic template filler; writes activity-specific prep/language/safety/enrichment.
 * Forces linked TK printables back to status=draft.
 * Persists via saveMode=enrichment_draft only (no publish).
 *
 * LLH_APPLY_PRODUCTION_DRAFTS=1 SITE_URL=... ADMIN_* required.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const enrichment = require("./teaching-kit-enrichment.js");
const { BY_TITLE } = require("./lib/teaching-kit-premium-drafts/quality-content-by-title.js");

const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "leahivie@icloud.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const OUT = path.join(__dirname, "..", "curriculum-drafts/teaching-kits-premium");
const TARGET_IDS = [
  "cur-lp-infant-colors-all-around-us",
  "cur-lp-infant-black-white-discovery",
  "cur-lp-preschool-community-helpers",
  "cur-lp-preschool-weather-watchers",
];

const GENERIC_RE = [
  /Gather center materials and label any specialty props/i,
  /Stage the invitation at child height/i,
  /Preview open-ended questions/i,
  /How does this helper\/weather idea connect/i,
  /Classroom substitute from the theme basket/i,
  /Specialty prop/i,
  /capture one language quote/i,
  /Photograph work before teardown when useful/i,
  /Keep the experience open-ended; avoid one .right. product/i,
  /Follow the infant.s alert window — stop early rather than push/i,
  /Your face and voice matter more than perfect materials/i,
  /Printable \(draft\): see Teaching Kit linked draft resources/i,
  /Offer picture supports, shorter turns, or a quieter station nearby/i,
  /Invite children to document or teach a peer one discovery/i,
  /Use the same invitation indoors near a window or calm mat/i,
  /review allergy-safe consumables/i,
  /What might we try next\?/i,
  /Younger preschoolers explore props; older peers can lead a short report/i,
  /Pair looking experiences with caregiver hold for less mobile infants/i,
];

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
          try { json = raw ? JSON.parse(raw) : null; } catch { json = { raw: raw.slice(0, 300) }; }
          resolve({ status: res.statusCode, json, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function stripGenericPrintableLine(materials) {
  return String(materials || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/Printable \(draft\): see Teaching Kit/i.test(l))
    .join("\n");
}

function materialsWithPrintables(materials, quality) {
  let next = stripGenericPrintableLine(materials);
  const titles = quality.printableTitles || [];
  if (quality.materialsExtra && !next.toLowerCase().includes(quality.materialsExtra.toLowerCase().slice(0, 24))) {
    next = `${next}\n${quality.materialsExtra}`.trim();
  }
  for (const title of titles) {
    if (!next.toLowerCase().includes(title.toLowerCase().replace(" (draft)", "").slice(0, 18))) {
      next = `${next}\n${title}`.trim();
    }
  }
  return next;
}

function scanGenerics(obj) {
  const blob = JSON.stringify(obj);
  return GENERIC_RE.filter((re) => re.test(blob)).map((re) => String(re));
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (res.status !== 200) throw new Error(`login ${res.status} ${res.json?.error}`);
  return res.json.token || res.json.adminToken;
}

async function loadSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error(`site-content ${res.status}`);
  return res.json.siteContent;
}

async function saveDraft(token, planId, enrichmentDraft, expectedUpdatedAt) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/lesson-plans",
    {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
      lessonPlan: { id: planId, enrichmentDraft },
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function forceResourceDraft(token, resourceId, expectedUpdatedAt) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/resources/save",
    {
      resource: { id: resourceId, status: "draft", publishedAt: "" },
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function tkPrintableUpdateDraft(token, lessonPlanId, resourceId, expectedUpdatedAt) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/resources/tk-printable",
    {
      action: "update",
      lessonPlanId,
      resourceId,
      status: "draft",
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    console.error("Set LLH_APPLY_PRODUCTION_DRAFTS=1");
    process.exit(2);
  }
  if (!ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    console.error("ADMIN_PASSWORD and ADMIN_ACCESS_CODE required");
    process.exit(2);
  }

  const token = await login();
  let site = await loadSite(token);
  const report = {
    environment: SITE_URL,
    rewrittenAt: new Date().toISOString(),
    genericPhrasesTargeted: GENERIC_RE.map(String),
    kits: [],
    missingTitles: [],
    printableStatusFixes: [],
    publishedEnrichment: false,
  };

  for (const planId of TARGET_IDS) {
    site = await loadSite(token);
    const plan = site.curriculum.lessonPlans.find((p) => p.id === planId);
    if (!plan) throw new Error(`missing ${planId}`);
    const prior = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
      : { activities: {}, week: {} };
    const list = enrichment.flattenLessonActivities(plan, site.curriculum.activities || [], prior);

    const beforeGenerics = [];
    const afterRows = [];
    const activities = { ...(prior.activities || {}) };
    let removedOptional = 0;
    let replacedFields = 0;

    for (const act of list) {
      const key = text(act.id) || text(act.itemId);
      const title = text(act.title);
      const quality = BY_TITLE[title];
      if (!quality) {
        report.missingTitles.push({ planId, title, key });
        continue;
      }
      const prev = activities[key] || {};
      beforeGenerics.push(...scanGenerics({ prev, title }).map((g) => ({ title, g })));

      const model = enrichment.mapActivityToOwnerEditorModel(act, prev, plan);
      const next = {
        ...prev,
        title,
        dayOfWeek: act.dayOfWeek || prev.dayOfWeek,
        activityCategory: model.activityCategory || prev.activityCategory,
        ageModifications: model.ageModifications
          || ( /infant/i.test(plan.age || "")
            ? "Infant 0–6 months"
            : "Preschool 3–5"),
        durationMinutes: model.durationMinutes !== "" && model.durationMinutes != null
          ? model.durationMinutes
          : (/infant/i.test(plan.age || "") ? 4 : 12),
        objective: model.objective || prev.objective,
        description: model.description || prev.description,
        materials: materialsWithPrintables(model.materials || prev.materials, quality),
        preparation: quality.preparation,
        setup: model.setup || prev.setup,
        steps: model.steps || prev.steps,
        teacherLanguage: quality.teacherLanguage,
        observationOpportunities: model.observationOpportunities || prev.observationOpportunities,
        safetyNotes: quality.safetyNotes,
        cleanupTips: quality.cleanupTips,
        imageRequirement: quality.imageRequirement,
        // Clear generic enrichment; only keep meaningful optional fields
        teacherTips: Array.isArray(quality.teacherTips) && quality.teacherTips.length
          ? quality.teacherTips
          : [],
        substitutions: Array.isArray(quality.substitutions) ? quality.substitutions : [],
        adaptations: text(quality.adaptations),
        extensions: text(quality.extensions),
        mixedAgeAdaptations: text(quality.mixedAgeAdaptations),
        indoorAlternatives: text(quality.indoorAlternatives),
        outdoorAlternatives: text(quality.outdoorAlternatives),
        // Drop generic briefs that encourage decorative images when not needed
        imageBriefSetup: quality.imageRequirement === "not_needed" ? "" : (prev.imageBriefSetup || ""),
        imageBriefExample: "",
        printableDecision: quality.printableDecision,
        printableTitles: quality.printableTitles || [],
      };
      if (quality.imageRequirement === "not_needed") {
        // Keep existing uploaded URL if present but mark not needed; do not require image.
        next.imageRequirement = "not_needed";
      }
      // Count optional clears
      if (!next.substitutions.length && (prev.substitutions || []).length) removedOptional += 1;
      if (!next.extensions && text(prev.extensions)) removedOptional += 1;
      if (!next.mixedAgeAdaptations && text(prev.mixedAgeAdaptations)) removedOptional += 1;
      replacedFields += 5; // prep, language, safety, cleanup, tips baseline

      activities[key] = next;
      afterRows.push({
        day: act.dayOfWeek,
        id: key,
        title,
        printableDecision: quality.printableDecision,
        printableTitles: quality.printableTitles || [],
        imageRequirement: quality.imageRequirement,
        hasSetupImage: Boolean(next.setupImageUrl),
        optionalEmpty: {
          substitutions: !next.substitutions.length,
          extensions: !next.extensions,
          mixedAge: !next.mixedAgeAdaptations,
          indoor: !next.indoorAlternatives,
          outdoor: !next.outdoorAlternatives,
        },
        genericAfter: scanGenerics(next),
      });
    }

    // Force printables draft
    const printableIds = [...(prior.week?.printableIds || [])];
    for (const rid of printableIds) {
      const res = site.curriculum.resources?.find((r) => r.id === rid);
      if (res && String(res.status) !== "draft") {
        let fix = await tkPrintableUpdateDraft(token, planId, rid, site.updatedAt);
        if (fix.status !== 200) {
          site = await loadSite(token);
          fix = await forceResourceDraft(token, rid, site.updatedAt);
        }
        report.printableStatusFixes.push({
          planId,
          resourceId: rid,
          title: res.title,
          from: res.status,
          http: fix.status,
          error: fix.json?.error || null,
        });
        site = await loadSite(token);
      }
    }

    // Keep proposedDailyPlans in sync so flattenLessonActivities cannot resurrect stale filler.
    const proposedDailyPlans = {};
    WEEKDAYS.forEach((day) => {
      const dayItems = list
        .filter((a) => a.dayOfWeek === day)
        .map((act) => {
          const key = text(act.id) || text(act.itemId);
          const patch = activities[key] || {};
          return {
            itemId: act.itemId,
            id: act.id || act.itemId,
            activityId: act.id || act.itemId,
            dayOfWeek: day,
            title: act.title,
            activityCategory: patch.activityCategory,
            ageModifications: patch.ageModifications,
            durationMinutes: patch.durationMinutes,
            objective: patch.objective,
            description: patch.description,
            materials: patch.materials,
            preparation: patch.preparation,
            setup: patch.setup,
            steps: patch.steps,
            teacherLanguage: patch.teacherLanguage,
            observationOpportunities: patch.observationOpportunities,
            safetyNotes: patch.safetyNotes,
            cleanupTips: patch.cleanupTips,
            teacherTips: patch.teacherTips || [],
            substitutions: patch.substitutions || [],
            adaptations: patch.adaptations || "",
            extensions: patch.extensions || "",
            mixedAgeAdaptations: patch.mixedAgeAdaptations || "",
            indoorAlternatives: patch.indoorAlternatives || "",
            outdoorAlternatives: patch.outdoorAlternatives || "",
            imageRequirement: patch.imageRequirement || "not_needed",
            setupImageUrl: patch.setupImageUrl || "",
          };
        });
      proposedDailyPlans[day] = {
        theme: prior.week?.proposedDailyPlans?.[day]?.theme || plan.dailyPlans?.[day]?.theme || "",
        focus: prior.week?.proposedDailyPlans?.[day]?.focus || "",
        objectives: prior.week?.proposedDailyPlans?.[day]?.objectives || "",
        items: dayItems,
      };
    });

    const enrichmentDraft = {
      ...prior,
      updatedAt: new Date().toISOString(),
      lastEditedBy: ADMIN_EMAIL,
      draftOnly: true,
      neverAutoPublish: true,
      activities,
      week: {
        ...(prior.week || {}),
        printableIds,
        proposedDailyPlans,
        qualityRewriteAt: new Date().toISOString(),
        qualityRewriteNote: "Removed generic template filler; activity-specific prep/language/safety; optional enrichment only when useful",
      },
      meta: {
        ...(prior.meta || {}),
        qualityRewriteAt: new Date().toISOString(),
        purpose: "Semantic quality rewrite — enrichment_draft only; not published",
      },
    };

    site = await loadSite(token);
    const save = await saveDraft(token, planId, enrichmentDraft, site.updatedAt);
    if (save.status !== 200) {
      throw new Error(`${planId} save failed ${save.status}: ${save.json?.error || save.raw?.slice(0, 200)}`);
    }

    site = await loadSite(token);
    const planAfter = site.curriculum.lessonPlans.find((p) => p.id === planId);
    const listAfter = enrichment.flattenLessonActivities(
      planAfter,
      site.curriculum.activities || [],
      planAfter.enrichmentDraft,
    );
    let blankCore = 0;
    let genericLeft = 0;
    const resourceTrace = [];
    for (const act of listAfter) {
      const key = text(act.id) || text(act.itemId);
      const patch = planAfter.enrichmentDraft?.activities?.[key] || {};
      const completion = enrichment.computeActivityCompletion(act, patch, planAfter);
      blankCore += completion.missing.length;
      const g = scanGenerics(patch);
      genericLeft += g.length;
      const titles = patch.printableTitles || [];
      for (const t of titles) {
        const match = (site.curriculum.resources || []).find((r) =>
          String(r.title || "").toLowerCase().includes(String(t).toLowerCase().replace(" (draft)", "").slice(0, 20))
          || (planAfter.enrichmentDraft?.week?.printableIds || []).includes(r.id)
        );
        // resolve by printableIds + title
        const linked = (planAfter.enrichmentDraft?.week?.printableIds || [])
          .map((id) => (site.curriculum.resources || []).find((r) => r.id === id))
          .filter(Boolean)
          .find((r) => String(r.title || "").toLowerCase().includes(String(t).toLowerCase().replace(" (draft)", "").slice(0, 18)));
        resourceTrace.push({
          activity: act.title,
          printableTitle: t,
          resourceId: linked?.id || null,
          resourceStatus: linked?.status || "MISSING",
          ok: Boolean(linked),
        });
      }
    }

    report.kits.push({
      planId,
      title: planAfter.title,
      lessonStatus: planAfter.status,
      enrichmentPublished: Boolean(planAfter.enrichmentPublished),
      activityCount: listAfter.length,
      blankCoreCellsAfter: blankCore,
      genericHitsBeforeApprox: beforeGenerics.length,
      genericHitsAfter: genericLeft,
      removedOptionalEnrichmentApprox: removedOptional,
      replacedActivitySpecificFieldGroups: replacedFields,
      activities: afterRows,
      resourceTrace,
      printableIds,
      printableStatuses: printableIds.map((id) => {
        const r = (site.curriculum.resources || []).find((x) => x.id === id);
        return { id, title: r?.title, status: r?.status };
      }),
    });
  }

  report.ok = report.kits.every((k) =>
    k.blankCoreCellsAfter === 0
    && k.genericHitsAfter === 0
    && k.activityCount === 15
    && k.enrichmentPublished === false
    && k.resourceTrace.every((t) => t.ok)
  );
  report.missingTitles = report.missingTitles;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "quality-rewrite-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: report.ok,
    missingTitles: report.missingTitles,
    printableStatusFixes: report.printableStatusFixes,
    kits: report.kits.map((k) => ({
      id: k.planId,
      blankCore: k.blankCoreCellsAfter,
      genericAfter: k.genericHitsAfter,
      count: k.activityCount,
      printables: k.printableStatuses,
      resourceGaps: k.resourceTrace.filter((t) => !t.ok).length,
      intentionalNoSub: k.activities.filter((a) => a.optionalEmpty.substitutions).length,
      intentionalNoExt: k.activities.filter((a) => a.optionalEmpty.extensions).length,
      imgNotNeeded: k.activities.filter((a) => a.imageRequirement === "not_needed").length,
      imgRequired: k.activities.filter((a) => a.imageRequirement === "required").length,
      printableRequired: k.activities.filter((a) => a.printableDecision === "REQUIRED").length,
    })),
  }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

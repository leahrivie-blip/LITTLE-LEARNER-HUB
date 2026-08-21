#!/usr/bin/env node
/**
 * Surgical Cleanup-only patch for Owner Admin live activities.
 * Writes cleanupTips onto the exact activity IDs listed — no other fields.
 *
 * Usage:
 *   LLH_APPLY_PRODUCTION_DRAFTS=1 node scripts/patch-activity-cleanup-tips.js
 */
"use strict";

const { createClient } = require("./lib/owner-lesson-complete/runtime.js");

const FORBIDDEN = new Set([
  "cur-lp-88831286195f7477",
  "cur-lp-preschool-all-about-me",
  "cur-lp-toddler-farm-friends",
  "cur-lp-549b80f61dfa8d79", // Little Makers — do not change
]);

/** @type {Record<string, Record<string, { title: string, cleanupTips: string }>>} */
const PATCHES = {
  "cur-lp-toddler-all-about-me": {
    "cur-act-b89af01352ee0fa1": {
      title: "Name Song Mirror Circle",
      cleanupTips: "Return the mirror or photo cards to the labeled basket; invite children to help restack gently.",
    },
    "cur-act-a7f859382fb241ab": {
      title: "Body Parts Action Path",
      cleanupTips: "Invite children to help place movement markers and body-part cards back in the bin.",
    },
    "cur-act-58822c74b8d5ce1d": {
      title: "Home Sweet Home Pretend",
      cleanupTips: "Return dishes, dolls, and blankets to labeled shelves; sanitize shared pretend-play materials as needed.",
    },
    "cur-act-8c0d522758d07ca4": {
      title: "Family Photo Story Time",
      cleanupTips: "Return family photos to the labeled pouch; put any story props back in the basket.",
    },
    "cur-act-f459fc0b07fdd90b": {
      title: "Feelings Faces Check-In",
      cleanupTips: "Band feeling cards and return them to the calm basket; wipe the optional mirror with a soft cloth.",
    },
    "cur-act-0376d5976a95db70": {
      title: "Happy Feet Feelings Dance",
      cleanupTips: "Collect scarves into the music bin; pause audio and clear the open dance space.",
    },
    "cur-act-596e83d824e69ef3": {
      title: "I Am Special Celebration",
      cleanupTips: "Return optional photo cards to the private pouch; reset the circle rug for the next gathering.",
    },
    "cur-act-49b14463240b5a19": {
      title: "Me Shadow Chase",
      cleanupTips: "Turn off or put away the indoor lamp; clear the shadow path so walking space is open again.",
    },
    "cur-act-98b9a6cf460fa2a5": {
      title: "All About Me Collage Wall",
      cleanupTips: "Cap glue sticks; collect paper scraps and return reusable collage materials to the tray.",
    },
  },
  "cur-lp-preschool-farm-animals": {
    "cur-act-8def0ce2cbc953aa": {
      title: "Barnyard Movement Trail",
      cleanupTips: "Invite children to help place cones and animal cards back in the labeled bin; clear the walking lane.",
    },
    "cur-act-323344663ee9ef16": {
      title: "From Farm to Table Story Investigation",
      cleanupTips: "Return the book to the shelf and place animal props back in the story basket.",
    },
  },
};

async function patchLesson(client, tokenRef, planId, byId) {
  if (FORBIDDEN.has(planId)) throw new Error(`Refusing forbidden lesson ${planId}`);
  await client.ensureToken(tokenRef);
  let site = await client.loadAdminSite(tokenRef.token);
  const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === planId);
  if (!plan) throw new Error(`Lesson ${planId} not found`);

  const beforeStatus = plan.status;
  const beforePlan = plan.plan;
  const activities = {};
  const applied = [];

  for (const [actId, spec] of Object.entries(byId)) {
    const live = (site.curriculum.activities || []).find((a) => a.id === actId);
    if (!live) throw new Error(`${planId}: activity ${actId} missing`);
    if (live.lessonPlanId !== planId) throw new Error(`${actId} belongs to ${live.lessonPlanId}, not ${planId}`);
    if (String(live.title || "").trim() !== spec.title) {
      throw new Error(`${actId} title mismatch: live="${live.title}" expected="${spec.title}"`);
    }
    const existing = String(live.cleanupTips || live.cleanup || "").trim();
    if (existing) {
      applied.push({ actId, title: spec.title, skipped: true, reason: "already had cleanup", existing });
      continue;
    }
    activities[actId] = { cleanupTips: spec.cleanupTips };
    if (live.itemId) activities[live.itemId] = { cleanupTips: spec.cleanupTips };
    applied.push({ actId, title: spec.title, skipped: false, cleanupTips: spec.cleanupTips });
  }

  const toWrite = Object.keys(activities).filter((k) => k.startsWith("cur-act-"));
  if (!toWrite.length) {
    return { planId, beforeStatus, beforePlan, applied, wrote: false };
  }

  // Surgical enrichment draft containing ONLY cleanupTips, then apply into live records.
  const enrichmentDraft = {
    activities,
    week: {},
    updatedAt: new Date().toISOString(),
    lastEditedBy: process.env.ADMIN_EMAIL || "cleanup-patch-script",
  };
  const save = await client.saveEnrichmentDraft(
    tokenRef.token,
    planId,
    site.updatedAt,
    enrichmentDraft,
  );
  if (save.status !== 200) {
    throw new Error(`${planId} draft save failed (${save.status}): ${save.json?.error || save.raw?.slice(0, 200)}`);
  }

  site = await client.loadAdminSite(tokenRef.token);
  const applyRes = await client.applyEnrichmentToLiveLesson(
    tokenRef.token,
    planId,
    site.updatedAt,
    enrichmentDraft,
  );
  if (applyRes.status !== 200) {
    throw new Error(`${planId} apply failed (${applyRes.status}): ${applyRes.json?.error || applyRes.raw?.slice(0, 200)}`);
  }

  // Sync activities from dailyPlans so editor source matches.
  site = await client.loadAdminSite(tokenRef.token);
  const sync = await client.syncLiveActivitiesFromDailyPlans(
    tokenRef.token,
    planId,
    site.updatedAt,
  );
  if (sync.status !== 200) {
    throw new Error(`${planId} sync failed (${sync.status}): ${sync.json?.error || sync.raw?.slice(0, 200)}`);
  }

  site = await client.loadAdminSite(tokenRef.token);
  const after = (site.curriculum.lessonPlans || []).find((p) => p.id === planId);
  if (after.status !== beforeStatus) throw new Error(`${planId} status changed ${beforeStatus} → ${after.status}`);
  if (after.plan !== beforePlan) throw new Error(`${planId} Free/Pro changed ${beforePlan} → ${after.plan}`);

  const verified = [];
  for (const [actId, spec] of Object.entries(byId)) {
    const live = (site.curriculum.activities || []).find((a) => a.id === actId);
    verified.push({
      actId,
      title: live?.title,
      cleanupTips: live?.cleanupTips || "",
      ok: String(live?.cleanupTips || "").trim() === spec.cleanupTips
        || String(live?.cleanupTips || "").trim().length > 0,
    });
  }

  return {
    planId,
    beforeStatus,
    beforePlan,
    afterStatus: after.status,
    afterPlan: after.plan,
    applied,
    verified,
    wrote: true,
    draftCleared: !after.enrichmentDraft
      || !Object.keys(after.enrichmentDraft?.activities || {}).length,
  };
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    console.error("Refusing: set LLH_APPLY_PRODUCTION_DRAFTS=1 to write production cleanup tips.");
    process.exit(2);
  }
  const client = createClient(process.env);
  const tokenRef = { token: "" };
  const report = [];
  for (const [planId, byId] of Object.entries(PATCHES)) {
    report.push(await patchLesson(client, tokenRef, planId, byId));
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

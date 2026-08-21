#!/usr/bin/env node
/**
 * Persist completed operator content into live Owner Admin lesson/activity records
 * without changing Free/Pro or base status.
 *
 * Steps per lesson:
 * 1) If enrichmentDraft exists → saveMode publish_enrichment (content only)
 * 2) Sync curriculum.activities from dailyPlans via status-preserving lesson save
 * 3) Assert live activities (Owner Admin editor source) are complete
 *
 * Usage:
 *   LLH_APPLY_PRODUCTION_DRAFTS=1 node scripts/persist-owner-lesson-live.js \
 *     cur-lp-toddler-all-about-me cur-lp-preschool-farm-animals cur-lp-549b80f61dfa8d79
 */
"use strict";

const { createClient } = require("./lib/owner-lesson-complete/runtime.js");

const EXPECTED = {
  "cur-lp-toddler-all-about-me": {
    minImages: 8,
    resources: ["cur-res-661287ba04c0f8ab", "cur-res-21073e8fd703f677"],
    expectStatus: "published",
    expectPlan: "Pro",
  },
  "cur-lp-preschool-farm-animals": {
    minImages: 9,
    resources: ["cur-res-c5cd1e5e6d5ea78a"],
    expectStatus: "published",
    expectPlan: "Free",
  },
  "cur-lp-549b80f61dfa8d79": {
    minImages: 7,
    resources: ["cur-res-eaf645605f866a60", "cur-res-e7d3ec92ec5f13e6"],
    expectStatus: "draft",
    expectPlan: "Free",
  },
};

const FORBIDDEN = new Set([
  "cur-lp-88831286195f7477",
  "cur-lp-preschool-all-about-me",
  "cur-lp-toddler-farm-friends",
]);

async function persistOne(client, tokenRef, planId) {
  if (FORBIDDEN.has(planId)) throw new Error(`Refusing to touch forbidden lesson ${planId}`);
  const expect = EXPECTED[planId] || { minImages: 0, resources: [], expectStatus: null, expectPlan: null };

  await client.ensureToken(tokenRef);
  let site = await client.loadAdminSite(tokenRef.token);
  const before = (site.curriculum.lessonPlans || []).find((p) => p.id === planId);
  if (!before) throw new Error(`Lesson ${planId} not found`);
  if (expect.expectPlan && before.plan !== expect.expectPlan) {
    throw new Error(`${planId} Free/Pro is ${before.plan}, expected ${expect.expectPlan}`);
  }
  if (expect.expectStatus && before.status !== expect.expectStatus) {
    console.warn(`WARN ${planId} status is ${before.status}, expected ${expect.expectStatus}`);
  }

  const draft = before.enrichmentDraft;
  const draftKeys = draft && typeof draft === "object"
    ? Object.keys(draft.activities || {}).filter((k) => k.startsWith("cur-act-"))
    : [];

  let applyMeta = { skipped: true };
  if (draftKeys.length) {
    const applyRes = await client.applyEnrichmentToLiveLesson(
      tokenRef.token,
      planId,
      site.updatedAt,
      draft,
    );
    if (applyRes.status !== 200) {
      throw new Error(`${planId} apply failed (${applyRes.status}): ${applyRes.json?.error || applyRes.raw?.slice(0, 300)}`);
    }
    applyMeta = {
      skipped: false,
      status: applyRes.status,
      duplicate: !!applyRes.json?.duplicate,
      versionId: applyRes.json?.versionId || "",
    };
    await client.ensureToken(tokenRef);
    site = await client.loadAdminSite(tokenRef.token);
  }

  // Sync activities from dailyPlans so Owner Admin lesson editor shows completed fields.
  const syncRes = await client.syncLiveActivitiesFromDailyPlans(
    tokenRef.token,
    planId,
    site.updatedAt,
  );
  if (syncRes.status !== 200) {
    throw new Error(`${planId} sync failed (${syncRes.status}): ${syncRes.json?.error || syncRes.raw?.slice(0, 300)}`);
  }

  await client.ensureToken(tokenRef);
  site = await client.loadAdminSite(tokenRef.token);
  const after = (site.curriculum.lessonPlans || []).find((p) => p.id === planId);
  if (after.status !== before.status) {
    throw new Error(`${planId} status changed ${before.status} → ${after.status}`);
  }
  if (after.plan !== before.plan) {
    throw new Error(`${planId} Free/Pro changed`);
  }

  const liveCheck = client.assertLiveLessonComplete(site, planId, {
    expectedActivityCount: 15,
    minImages: expect.minImages,
    requiredResourceIds: expect.resources,
  });
  if (!liveCheck.ok) {
    throw new Error(`${planId} NOT READY after persist: ${liveCheck.errors.join(" | ")}`);
  }

  const linked = (site.curriculum.resources || []).filter(
    (r) => (r.lessonPlanIds || []).includes(planId) || (after.resourceIds || []).includes(r.id),
  );

  return {
    planId,
    apply: applyMeta,
    sync: { status: syncRes.status },
    before: { status: before.status, plan: before.plan, cover: before.coverImageUrl },
    after: {
      status: after.status,
      plan: after.plan,
      cover: after.coverImageUrl,
      title: after.title,
      age: after.age,
    },
    liveCheck,
    linked: linked.map((r) => ({ id: r.id, title: r.title, status: r.status })),
  };
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    console.error("Refusing to write: set LLH_APPLY_PRODUCTION_DRAFTS=1");
    process.exit(2);
  }
  const ids = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    console.error("Usage: persist-owner-lesson-live.js <planId> [...]");
    process.exit(2);
  }
  for (const id of ids) {
    if (FORBIDDEN.has(id)) {
      console.error("Forbidden:", id);
      process.exit(2);
    }
  }

  const client = createClient();
  const tokenRef = { token: await client.login() };
  const results = [];
  for (const id of ids) {
    console.log("PERSIST", id);
    const row = await persistOne(client, tokenRef, id);
    results.push(row);
    console.log(JSON.stringify(row, null, 2));
  }

  await client.ensureToken(tokenRef);
  const site = await client.loadAdminSite(tokenRef.token);
  const guards = {};
  for (const gid of FORBIDDEN) {
    const p = (site.curriculum.lessonPlans || []).find((x) => x.id === gid);
    guards[gid] = p
      ? { title: p.title, status: p.status, plan: p.plan, age: p.age, cover: p.coverImageUrl }
      : { missing: true };
  }
  if (guards["cur-lp-88831286195f7477"]?.status !== "archived") {
    throw new Error("Archived Little Makers twin was changed");
  }
  if (guards["cur-lp-preschool-all-about-me"]?.plan !== "Free") {
    throw new Error("Preschool All About Me access changed");
  }
  if (guards["cur-lp-toddler-farm-friends"]?.plan !== "Pro") {
    throw new Error("Farm Friends access changed");
  }
  console.log("GUARDS", JSON.stringify(guards, null, 2));
  console.log("DONE", results.map((r) => ({
    id: r.planId,
    ok: r.liveCheck?.ok,
    status: r.after?.status,
    images: r.liveCheck?.liveImageCount,
  })));
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});

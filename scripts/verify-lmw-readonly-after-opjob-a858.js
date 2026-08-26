#!/usr/bin/env node
/**
 * Read-only production verification for Little Makers Workshop after failed operator job.
 * Does NOT mutate production.
 */
"use strict";

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const FAILED_JOB = "opjob_a858cf064750e6c5";
const PROTECTED = [
  { activityId: "cur-act-0a02697c73ccac85", mediaId: "tk-enrich-cc63a2bfa2d8118bd7627830df20fcfa", title: "Giant Floor Drawing" },
  { activityId: "cur-act-c36723f91d3a9637", mediaId: "tk-enrich-7fb9e73c1f07b7837458d02ff2bba506", title: "Sponge Squish Painting" },
];
const PROD = process.env.PROD_URL || "https://littlelearnershubbyleah.com";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const code = process.env.ADMIN_ACCESS_CODE;
  if (!email || !password || !code) {
    console.error("Missing ADMIN_* env for read-only verify.");
    process.exit(2);
  }
  const loginRes = await fetch(`${PROD}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, code }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok || !login.token) {
    console.error("Login failed", login.error || loginRes.status);
    process.exit(1);
  }
  const token = login.token;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const siteRes = await fetch(`${PROD}/api/admin/site-content`, { headers });
  const sitePayload = await siteRes.json();
  const curriculum = sitePayload.siteContent?.curriculum || sitePayload.curriculum || {};
  const plan = (curriculum.lessonPlans || []).find((p) => p.id === LMW_ID);
  if (!plan) {
    console.error("LMW not found");
    process.exit(1);
  }

  const activities = (curriculum.activities || []).filter((a) => a.lessonPlanId === LMW_ID);
  const activityIds = activities.map((a) => a.id).sort();
  const resources = curriculum.resources || [];

  const jobRes = await fetch(`${PROD}/api/admin/curriculum/operator`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get", jobId: FAILED_JOB, adminToken: token }),
  });
  const jobPayload = await jobRes.json();
  const job = jobPayload.job || {};

  const protectedChecks = PROTECTED.map((row) => {
    const act = activities.find((a) => a.id === row.activityId);
    const mediaRefs = [
      act?.setupMediaAssetId,
      act?.exampleMediaAssetId,
      act?.setupImageUrl,
      act?.exampleImageUrl,
    ].filter(Boolean);
    return {
      ...row,
      mediaStillLinked: mediaRefs.some((ref) => String(ref).includes(row.mediaId)),
      activityPresent: Boolean(act),
    };
  });

  const report = {
    lessonId: plan.id,
    title: plan.title,
    status: plan.status,
    accessPlan: plan.plan,
    learningDomains: plan.learningDomains || [],
    activityCount: activities.length,
    activityIds,
    updatedAt: plan.updatedAt,
    enrichmentDraftKeys: {
      week: Object.keys(plan.enrichmentDraft?.week || {}),
      activities: Object.keys(plan.enrichmentDraft?.activities || {}),
    },
    failedJob: {
      id: FAILED_JOB,
      status: job.status,
      error: (job.lessonResults || []).find((r) => r.lessonId === LMW_ID)?.error || job.error,
      finalMutationCount: (job.lessonResults || []).find((r) => r.lessonId === LMW_ID)
        ?.composerDiagnostics?.finalMutationCount,
    },
    protectedPilotMedia: protectedChecks,
    printableResourceCount: resources.filter((r) => (plan.resourceIds || []).includes(r.id)
      && /printable|pdf/i.test(String(r.type || r.kind || r.title || ""))).length,
    published: plan.status === "published",
    unchangedDraft: plan.status === "draft",
    unchangedFree: plan.plan === "Free",
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

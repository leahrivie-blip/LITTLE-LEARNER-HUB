#!/usr/bin/env node
/**
 * Read-only production verification for Little Makers Workshop after opjob_c6f5a37ce9074b56.
 * Does NOT mutate production.
 */
"use strict";

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const JOB_ID = "opjob_c6f5a37ce9074b56";
const COVER_ID = "lesson-cover-7acc5818417dd09468046b5e6bc9b96c";
const PROTECTED = [
  { activityId: "cur-act-0a02697c73ccac85", mediaId: "tk-enrich-cc63a2bfa2d8118bd7627830df20fcfa", title: "Giant Floor Drawing" },
  { activityId: "cur-act-c36723f91d3a9637", mediaId: "tk-enrich-7fb9e73c1f07b7837458d02ff2bba506", title: "Sponge Squish Painting" },
];
const REPLACED = [
  { activityId: "cur-act-374ff7ad30144089", mediaId: "tk-enrich-b2858147187f71a62143fa7176168ab0", title: "Big Brush Wall Painting" },
  { activityId: "cur-act-5e8a0a0d8a0a0a0a", mediaId: "tk-enrich-f2be54aac1886a4bacdeeead87509fee", title: "Sticky Wall Collage" },
  { activityId: "cur-act-07ed99b3", mediaId: "tk-enrich-07ed99b3d507470cedefa8503bfc4c95", title: "Cardboard Box Builders" },
  { activityId: "cur-act-f7215976", mediaId: "tk-enrich-f72159760d0773cfd61c2101158b468d", title: "Play Dough Maker Table" },
  { activityId: "cur-act-99d15c12", mediaId: "tk-enrich-99d15c1276e62269e012a236b9da0d81", title: "Recycled Creation Station" },
];
const PROD = process.env.PROD_URL || "https://littlelearnershubbyleah.com";

async function httpOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

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

  const jobRes = await fetch(`${PROD}/api/admin/curriculum/operator`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get", jobId: JOB_ID, adminToken: token }),
  });
  const jobPayload = await jobRes.json();
  const job = jobPayload.job || {};
  const lr = (job.lessonResults || []).find((r) => r.lessonId === LMW_ID) || {};

  const teacherTipsByActivity = activities.map((act) => {
    const dailyTips = Object.values(plan.dailyPlans || {})
      .flatMap((day) => (Array.isArray(day?.items) ? day.items : []))
      .filter((item) => item.itemId === act.itemId || item.title === act.title)
      .flatMap((item) => (Array.isArray(item.teacherTips) ? item.teacherTips : []));
    return {
      activityId: act.id,
      title: act.title,
      activityTips: Array.isArray(act.teacherTips) ? act.teacherTips.length : 0,
      dailyPlanTips: dailyTips.length,
    };
  });

  const mediaChecks = [...PROTECTED, ...REPLACED].map((row) => {
    const act = activities.find((a) => a.id === row.activityId
      || (row.title && a.title === row.title));
    const refs = [
      act?.setupMediaAssetId,
      act?.exampleMediaAssetId,
      act?.setupImageUrl,
      act?.exampleImageUrl,
    ].filter(Boolean);
    return {
      title: row.title,
      activityId: act?.id || row.activityId,
      mediaId: row.mediaId,
      linked: refs.some((ref) => String(ref).includes(row.mediaId)),
    };
  });

  const replacedUrls = mediaChecks
    .filter((row) => REPLACED.some((r) => r.mediaId === row.mediaId))
    .map((row) => {
      const act = activities.find((a) => a.id === row.activityId);
      const url = act?.setupImageUrl || act?.exampleImageUrl || "";
      return { ...row, url };
    });
  const urlChecks = [];
  for (const row of replacedUrls) {
    if (!row.url) continue;
    const absolute = row.url.startsWith("http") ? row.url : `${PROD}${row.url}`;
    // eslint-disable-next-line no-await-in-loop
    urlChecks.push({ ...row, http200: await httpOk(absolute) });
  }

  const report = {
    lessonId: plan.id,
    title: plan.title,
    status: plan.status,
    accessPlan: plan.plan,
    activityCount: activities.length,
    activityIds,
    learningDomains: plan.learningDomains || [],
    vocabularyWords: plan.vocabularyWords || "",
    teachingKit: {
      milestones: plan.teachingKit?.milestones || [],
      vocabCards: plan.teachingKit?.vocabCards || [],
    },
    coverImageUrl: plan.coverImageUrl || "",
    coverStillOriginal: String(plan.coverImageUrl || "").includes(COVER_ID),
    teacherTipsByActivity,
    protectedMediaChecks: mediaChecks.filter((r) => PROTECTED.some((p) => p.mediaId === r.mediaId)),
    replacedMediaChecks: mediaChecks.filter((r) => REPLACED.some((p) => p.mediaId === r.mediaId)),
    replacedUrlChecks: urlChecks,
    job: {
      id: job.id,
      status: job.status,
      imageCounts: lr.imageCounts || null,
    },
    productionMutatedByThisScript: false,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

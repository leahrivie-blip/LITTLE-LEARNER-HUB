#!/usr/bin/env node
/**
 * Read-only production verification after opjob_506cd34286d3baac bad interpretation.
 * Confirms neither LMW nor Hello Fall were mutated and the job did not execute mutations.
 * Does NOT mutate production.
 */
"use strict";

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const HELLO_FALL_ID = "cur-lp-19fb387f75cfd1f1745";
const JOB_ID = "opjob_506cd34286d3baac";
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
  const lmw = (curriculum.lessonPlans || []).find((p) => p.id === LMW_ID);
  const helloFall = (curriculum.lessonPlans || []).find((p) => p.id === HELLO_FALL_ID);
  if (!lmw || !helloFall) {
    console.error("Expected lessons not found", { lmw: Boolean(lmw), helloFall: Boolean(helloFall) });
    process.exit(1);
  }

  const jobRes = await fetch(`${PROD}/api/admin/curriculum/operator`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get", jobId: JOB_ID, adminToken: token }),
  });
  const jobPayload = await jobRes.json();
  const job = jobPayload.job || {};

  const lmwActivities = (curriculum.activities || []).filter((a) => a.lessonPlanId === LMW_ID);
  const helloActivities = (curriculum.activities || []).filter((a) => a.lessonPlanId === HELLO_FALL_ID);

  const report = {
    jobId: JOB_ID,
    jobStatus: job.status || null,
    jobPhase: job.phase || null,
    interpretedIntent: job.command?.intent || job.interpretation?.intent || null,
    mutationsEnabled: job.mutationsEnabled ?? null,
    lessonResults: (job.lessonResults || []).map((r) => ({
      lessonId: r.lessonId,
      title: r.title,
      status: r.status,
      persistedChanges: r.persistedChanges?.length ?? 0,
      imagesGenerated: r.imagesGenerated ?? r.imageSummary?.generated ?? null,
      printablesGenerated: r.printablesGenerated ?? r.printableSummary?.generated ?? null,
      published: r.published ?? null,
    })),
    lmw: {
      id: lmw.id,
      title: lmw.title,
      status: lmw.status,
      plan: lmw.plan,
      publishedAt: lmw.publishedAt || null,
      activityCount: lmwActivities.length,
      learningDomainsCount: Array.isArray(lmw.plan?.learningDomains) ? lmw.plan.learningDomains.length : 0,
      vocabularyWords: lmw.plan?.vocabularyWords ?? null,
      vocabCardsCount: Array.isArray(lmw.teachingKit?.vocabCards) ? lmw.teachingKit.vocabCards.length : 0,
      milestonesCount: Array.isArray(lmw.teachingKit?.milestones) ? lmw.teachingKit.milestones.length : 0,
      coverUrl: lmw.coverImageUrl || lmw.coverUrl || null,
    },
    helloFall: {
      id: helloFall.id,
      title: helloFall.title,
      status: helloFall.status,
      plan: helloFall.plan,
      publishedAt: helloFall.publishedAt || null,
      activityCount: helloActivities.length,
      coverUrl: helloFall.coverImageUrl || helloFall.coverUrl || null,
    },
    checks: [],
  };

  function check(name, ok, detail) {
    report.checks.push({ name, ok, detail });
  }

  check("job exists", Boolean(job.id), job.id || "missing");
  check("job did not publish", job.command?.actions?.publish !== true && !job.published, "publish=false");
  check("job not plain COMPLETED with mutations", !(
    job.status === "COMPLETED"
    && (job.lessonResults || []).some((r) => (r.persistedChanges || []).length > 0)
  ), job.status);
  check("LMW still draft", lmw.status === "draft", lmw.status);
  check("Hello Fall unchanged status", helloFall.status === "published", helloFall.status);
  check("LMW activity count stable", lmwActivities.length === 15, String(lmwActivities.length));
  check("Hello Fall activity count stable", helloActivities.length === 20, String(helloActivities.length));
  check("LMW vocabCards count stable", report.lmw.vocabCardsCount === 1, String(report.lmw.vocabCardsCount));
  check("LMW milestones count stable", report.lmw.milestonesCount === 4, String(report.lmw.milestonesCount));
  check("no persisted changes on LMW", !(job.lessonResults || []).some((r) => r.lessonId === LMW_ID
    && (r.persistedChanges || []).length > 0), "lessonResults scan");
  check("no lesson.create in job", job.command?.actions?.createLesson !== true, String(job.command?.actions?.createLesson));
  check("bad interpretation intent was finish_images", report.interpretedIntent === "finish_images", report.interpretedIntent);
  check("no persisted changes on Hello Fall", !(job.lessonResults || []).some((r) => r.lessonId === HELLO_FALL_ID
    && (r.persistedChanges || []).length > 0), "lessonResults scan");

  const failed = report.checks.filter((c) => !c.ok);
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) {
    console.error(`FAILED ${failed.length} checks`);
    failed.forEach((f) => console.error(` - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log("READ-ONLY VERIFY PASS: opjob_506 did not mutate production curriculum.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

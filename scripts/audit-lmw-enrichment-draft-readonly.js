#!/usr/bin/env node
/**
 * Read-only audit: Little Makers Workshop enrichmentDraft from opjob_4acd185226d312f4.
 * Does NOT apply, generate, or mutate production.
 *
 * Usage (requires ADMIN_* env):
 *   node scripts/audit-lmw-enrichment-draft-readonly.js
 */
"use strict";

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const JOB_ID = "opjob_4acd185226d312f4";
const PROD = process.env.PROD_URL || "https://littlelearnershubbyleah.com";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const code = process.env.ADMIN_ACCESS_CODE;
  if (!email || !password || !code) {
    console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE for read-only audit.");
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

  const jobRes = await fetch(`${PROD}/api/admin/curriculum/operator`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get", jobId: JOB_ID, adminToken: token }),
  });
  const jobPayload = await jobRes.json();
  const job = jobPayload.job || {};

  const planRes = await fetch(`${PROD}/api/admin/site-content`, { headers });
  const sitePayload = await planRes.json();
  const curriculum = sitePayload.siteContent?.curriculum || sitePayload.curriculum || {};
  const plan = (curriculum.lessonPlans || []).find((p) => p.id === LMW_ID);
  if (!plan) {
    console.error("Lesson not found", LMW_ID);
    process.exit(1);
  }

  const resources = (curriculum.resources || []).filter((r) => (plan.resourceIds || []).includes(r.id));
  const titleCounts = {};
  resources.forEach((r) => {
    const key = String(r.title || "").trim().toLowerCase();
    if (!key) return;
    titleCounts[key] = (titleCounts[key] || 0) + 1;
  });
  const duplicateTitles = Object.entries(titleCounts).filter(([, n]) => n > 1);

  const draft = plan.enrichmentDraft || {};
  const draftActs = Object.keys(draft.activities || {});
  const report = {
    lessonId: LMW_ID,
    title: plan.title,
    status: plan.status,
    plan: plan.plan,
    jobId: JOB_ID,
    jobStatus: job.status,
    jobLessonResult: (job.lessonResults || []).find((lr) => lr.lessonId === LMW_ID) || null,
    enrichmentDraftPresent: Boolean(draft && (draftActs.length || Object.keys(draft.week || {}).length)),
    enrichmentDraftUpdatedAt: draft.updatedAt || null,
    activityDraftKeys: draftActs.length,
    weekDraftKeys: Object.keys(draft.week || {}),
    resourceCount: resources.length,
    duplicatePrintableTitles: duplicateTitles.map(([title, count]) => ({ title, count })),
    publishHistoryCount: Array.isArray(plan.enrichmentPublishHistory) ? plan.enrichmentPublishHistory.length : 0,
    safeToApplyOnce: duplicateTitles.length > 0
      ? "yes_with_dedupe — duplicate titles exist; apply path should reuse one resource per title"
      : "yes — no duplicate printable titles detected on linked resources",
    note: "Read-only audit only. Manual Apply Enrichment once is still required until auto-apply deploy.",
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

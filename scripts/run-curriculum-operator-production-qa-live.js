#!/usr/bin/env node
/**
 * Live production Operator QA for lesson cur-lp-6f9e0dcfc1af9cb6.
 * Requires LLH_SMOKE_ADMIN_* env. Exits 1 on BLOCKED.
 */
"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");
const prepApi = require("./curriculum-operator-production-qa-live-prep.js");
const enrichment = require("./teaching-kit-enrichment.js");

const BASE = process.env.LLH_PROD_BASE || "https://littlelearnershubbyleah.com";
const LESSON_ID = "cur-lp-6f9e0dcfc1af9cb6";
const ACT1 = "cur-act-a93e59bc1f91a297";
const ACT2 = "cur-act-30cf1a556377c37c";
const ACT3 = prepApi.TEXTURE_ACT_ID;
const MIRROR_ASSET = "tk-enrich-9e63542c80aaea9aa6ac48bb3f517c12";
const CMD =
  "Go through this lesson, keep everything that's good, fix what looks bad, make the pictures actually look like the activities, and leave it ready for me to review.";
const PHASE = Number(process.env.LLH_OPERATOR_PHASE || 7);
const OUT_DIR = process.env.LLH_QA_OUT || "/opt/cursor/artifacts/operator-qa-live";

const EMAIL = process.env.LLH_SMOKE_ADMIN_EMAIL;
const PASSWORD = process.env.LLH_SMOKE_ADMIN_PASSWORD;
const CODE = process.env.LLH_SMOKE_ADMIN_ACCESS_CODE;

/** @param {string} method @param {string} urlPath @param {unknown} body @param {string} [token] */
function req(method, urlPath, body, token) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const r = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          let json = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch {
            json = { raw: raw.slice(0, 500) };
          }
          resolve({ status: res.statusCode, json, raw });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function readCurriculum(siteJson) {
  const root = siteJson && typeof siteJson === "object" ? siteJson : {};
  const nested = root.siteContent && typeof root.siteContent === "object" ? root.siteContent : {};
  return root.curriculum || nested.curriculum || {};
}

function assetIdFromUrl(url) {
  const m = String(url || "").match(/tk-enrich-[a-f0-9]+/i);
  return m ? m[0] : "";
}

function activityEffectiveRow(activity, plan) {
  const draft = plan?.enrichmentDraft?.activities?.[activity.id] || {};
  const view = enrichment.activityEnrichmentView(activity, draft);
  return {
    id: activity.id,
    title: activity.title,
    liveSetupImageUrl: activity.setupImageUrl || "",
    effectiveSetupImageUrl: view.setupImageUrl || "",
  };
}

async function loadSite(token) {
  const site = await req("GET", "/api/admin/site-content", null, token);
  const curriculum = readCurriculum(site.json);
  const plan = (curriculum.lessonPlans || []).find((p) => p.id === LESSON_ID);
  return { site, curriculum, plan, stamp: prepApi.siteContentStamp(site.json) };
}

/**
 * @param {string} token
 * @returns {Promise<{ ok: boolean, status: number, attempts: number, code?: string }>}
 */
async function prepTextureDraftNull(token) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { stamp } = await loadSite(token);
    const prep = await req(
      "POST",
      "/api/admin/curriculum/lesson-plans",
      {
        expectedUpdatedAt: stamp,
        saveMode: "enrichment_draft",
        lessonPlan: {
          id: LESSON_ID,
          enrichmentDraft: prepApi.textureDraftNullPrepPatch(ACT3),
        },
      },
      token,
    );
    if (prep.status === 200) {
      return { ok: true, status: prep.status, attempts: attempt };
    }
    if (prep.status === 409 && attempt < maxAttempts) {
      continue;
    }
    return {
      ok: false,
      status: prep.status,
      attempts: attempt,
      code: prep.json?.code,
      error: prep.json?.error,
    };
  }
  return { ok: false, status: 409, attempts: maxAttempts };
}

async function main() {
  if (!EMAIL || !PASSWORD || !CODE) {
    console.error("Missing LLH_SMOKE_ADMIN_EMAIL / PASSWORD / ACCESS_CODE");
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = { lessonId: LESSON_ID, baseUrl: BASE, blocked: false };

  report.buildVersion = (await req("GET", "/api/build-version")).json;

  const login = await req("POST", "/api/admin/login", { email: EMAIL, password: PASSWORD, code: CODE });
  if (login.status !== 200 || !login.json?.token) {
    report.blocked = true;
    report.blockReason = "login_failed";
    fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const token = login.json.token;

  let { curriculum, plan } = await loadSite(token);
  report.initialPlanMeta = {
    coverImageUrl: plan?.coverImageUrl,
    booksCount: (plan?.books || plan?.teachingKit?.books || []).length,
    songsCount: (plan?.songs || plan?.teachingKit?.songs || []).length,
  };

  const prepResult = await prepTextureDraftNull(token);
  report.prepDraftSave = prepResult;
  if (!prepResult.ok) {
    report.blocked = true;
    report.blockReason = prepResult.status === 409 ? "prep_http_409" : "prep_failed";
    fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verdict: "BLOCKED", reason: report.blockReason, prep: prepResult }, null, 2));
    process.exit(1);
  }

  ({ curriculum, plan } = await loadSite(token));
  const { activity } = prepApi.findLessonAndActivity(curriculum, LESSON_ID, ACT3);
  report.act3DraftVerify = prepApi.verifyTextureDraftNullPrecedence({ plan, activity, activityId: ACT3 });
  if (!report.act3DraftVerify.ok) {
    report.blocked = true;
    report.blockReason = "act3_not_proven_before_execution";
    fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verdict: "BLOCKED", reason: report.blockReason, act3: report.act3DraftVerify }, null, 2));
    process.exit(1);
  }

  const parse = await req(
    "POST",
    "/api/admin/curriculum/operator",
    { action: "parse", rawCommand: CMD, currentlySelectedLessonId: LESSON_ID, phase: PHASE },
    token,
  );
  report.parse = { ok: parse.status === 200, primary: parse.json?.interpretation?.primary };

  const run = await req(
    "POST",
    "/api/admin/curriculum/operator",
    {
      action: "run",
      rawCommand: CMD,
      currentlySelectedLessonId: LESSON_ID,
      phase: PHASE,
      command: parse.json?.command,
    },
    token,
  );
  report.run = {
    ok: run.status === 200 && run.json?.ok !== false,
    jobId: run.json?.job?.id,
    jobStatus: run.json?.job?.status,
    contentPersistenceIncomplete: run.json?.job?.contentPersistenceIncomplete,
  };

  let jobDetail = null;
  if (run.json?.job?.id) {
    const get = await req("POST", "/api/admin/curriculum/operator", { action: "get", jobId: run.json.job.id }, token);
    jobDetail = get.json?.job || get.json;
  }

  ({ curriculum, plan } = await loadSite(token));
  const acts = (curriculum.activities || []).filter((a) => a.lessonPlanId === LESSON_ID);
  report.finalActivities = acts.map((a) => activityEffectiveRow(a, plan));

  const lr = jobDetail?.lessonResults?.[0] || {};
  const img = (lr.imageActions || []).reduce((acc, row) => {
    acc[row.activityId] = row;
    return acc;
  }, {});
  const final2 = report.finalActivities.find((a) => a.id === ACT2);

  report.verdict = {
    act1Keep: img[ACT1]?.decision === "KEEP" || (img[ACT1]?.status === "skipped" && img[ACT1]?.decision !== "REPLACE"),
    act2Replace:
      img[ACT2]?.decision === "REPLACE"
      && img[ACT2]?.status === "success"
      && assetIdFromUrl(final2?.effectiveSetupImageUrl) !== MIRROR_ASSET,
    act3Generate: img[ACT3]?.decision === "GENERATE" && img[ACT3]?.status === "success",
    act3PrepEffectiveMissing: report.act3DraftVerify.effectiveImageMissing === true,
    ownerReviewReady: lr.ownerReviewStatus === "READY_FOR_OWNER_REVIEW",
    noPersistenceIncomplete: report.run.contentPersistenceIncomplete !== true,
    publishFalse: jobDetail?.command?.actions?.publish !== true,
    lessonDraft: plan?.status === "draft",
    coverUnchanged: plan?.coverImageUrl === report.initialPlanMeta.coverImageUrl,
    booksUnchanged: (plan?.books || plan?.teachingKit?.books || []).length === report.initialPlanMeta.booksCount,
    songsUnchanged: (plan?.songs || plan?.teachingKit?.songs || []).length === report.initialPlanMeta.songsCount,
  };
  report.pass = !report.blocked && Object.values(report.verdict).every(Boolean);
  report.jobDetail = {
    ownerReviewStatus: lr.ownerReviewStatus,
    imageActions: lr.imageActions,
  };

  fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "job-full.json"), JSON.stringify(jobDetail, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.pass ? "PASS" : "BLOCKED",
        prep: report.prepDraftSave,
        act3DraftVerify: report.act3DraftVerify,
        operator: report.verdict,
        buildSha: report.buildVersion?.shortSha,
      },
      null,
      2,
    ),
  );
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * One-shot: promote ONLY the two existing LMW pilot enrichment photos to
 * public/renderable visibility. Does not regenerate, replace, or re-attach.
 *
 * Requires owner admin credentials in the environment (same as other owner scripts).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { createClient } = require("./lib/owner-lesson-complete/runtime.js");
const enrichmentMedia = require("../server/enrichment-media.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const PILOT = Object.freeze([
  {
    title: "Giant Floor Drawing",
    activityId: "cur-act-0a02697c73ccac85",
    mediaAssetId: "tk-enrich-cc63a2bfa2d8118bd7627830df20fcfa",
  },
  {
    title: "Sponge Squish Painting",
    activityId: "cur-act-c36723f91d3a9637",
    mediaAssetId: "tk-enrich-7fb9e73c1f07b7837458d02ff2bba506",
  },
]);
const OUT = process.env.PILOT_OUT || "/opt/cursor/artifacts/lmw-promote-pilot-media-visibility.json";

function request(method, urlPath, body, headers, siteUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, siteUrl);
    const lib = u.protocol === "http:" ? http : https;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === "http:" ? 80 : 443),
      path: u.pathname + u.search,
      method,
      headers: {
        ...(payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {}),
        ...headers,
      },
      timeout: 120000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try { json = raw.length ? JSON.parse(raw.toString("utf8")) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, raw, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const client = createClient();
  const siteUrl = process.env.SITE_URL || "https://littlelearnershubbyleah.com";
  const token = await client.login();
  const report = {
    at: new Date().toISOString(),
    lessonPlanId: LMW_ID,
    imageGeneration: false,
    before: {},
    promote: null,
    after: {},
    confirmation: {},
  };

  const site = await client.loadAdminSite(token);
  const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === LMW_ID);
  if (!plan) throw new Error("Little Makers Workshop not found.");
  report.confirmation.beforeStatus = plan.status || "";
  report.confirmation.beforePlan = plan.plan === "Pro" ? "Pro" : "Free";

  for (const row of PILOT) {
    const act = (site.curriculum.activities || []).find((a) => a.id === row.activityId);
    const publicPath = enrichmentMedia.publicEnrichmentMediaUrl(row.mediaAssetId, "full");
    const adminPath = enrichmentMedia.enrichmentMediaUrl(row.mediaAssetId, "full");
    const pub = await request("GET", publicPath, null, {}, siteUrl);
    const adm = await request("GET", `${adminPath}?adminToken=${encodeURIComponent(token)}`, null, {
      Authorization: `Bearer ${token}`,
    }, siteUrl);
    report.before[row.mediaAssetId] = {
      title: row.title,
      activityId: row.activityId,
      setupMediaAssetId: act?.setupMediaAssetId || "",
      setupImageUrl: act?.setupImageUrl || "",
      publicStatus: pub.status,
      adminStatus: adm.status,
    };
  }

  const promote = await request("POST", "/api/admin/curriculum/enrichment-photos/promote-visibility", {
    adminToken: token,
    lessonPlanId: LMW_ID,
    mediaAssetIds: PILOT.map((p) => p.mediaAssetId),
  }, { Authorization: `Bearer ${token}` }, siteUrl);
  report.promote = { status: promote.status, json: promote.json };

  if (promote.status !== 200 || !promote.json?.ok) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    throw new Error(`Promote failed: ${promote.status} ${JSON.stringify(promote.json)}`);
  }

  const siteAfter = await client.loadAdminSite(token);
  const planAfter = (siteAfter.curriculum.lessonPlans || []).find((p) => p.id === LMW_ID);
  report.confirmation.afterStatus = planAfter?.status || "";
  report.confirmation.afterPlan = planAfter?.plan === "Pro" ? "Pro" : "Free";
  report.confirmation.sameLessonId = planAfter?.id === LMW_ID;
  report.confirmation.enrichmentDraftStillPresent = !!(planAfter?.enrichmentDraft
    && typeof planAfter.enrichmentDraft === "object"
    && Object.keys(planAfter.enrichmentDraft.activities || {}).length);

  for (const row of PILOT) {
    const act = (siteAfter.curriculum.activities || []).find((a) => a.id === row.activityId);
    const publicPath = enrichmentMedia.publicEnrichmentMediaUrl(row.mediaAssetId, "full");
    const pub = await request("GET", publicPath, null, {}, siteUrl);
    report.after[row.mediaAssetId] = {
      title: row.title,
      activityId: row.activityId,
      setupMediaAssetId: act?.setupMediaAssetId || "",
      setupImageUrl: act?.setupImageUrl || "",
      sameMediaId: act?.setupMediaAssetId === row.mediaAssetId,
      sameActivityId: act?.id === row.activityId,
      publicStatus: pub.status,
      publicBytes: pub.raw?.length || 0,
      visibilityHeader: pub.headers?.["x-llh-enrichment-visibility"] || "",
    };
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const allOk = PILOT.every((row) => report.after[row.mediaAssetId]?.publicStatus === 200
    && report.after[row.mediaAssetId]?.sameMediaId);
  if (!allOk) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

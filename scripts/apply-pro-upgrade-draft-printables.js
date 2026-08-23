#!/usr/bin/env node
/**
 * Upload Priority 1 Pro upgrade printables as DRAFT resources and link them
 * onto enrichmentDraft.week.printableIds (never publish).
 *
 * Env: SITE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE
 * Optional: LLH_APPLY_PRODUCTION_DRAFTS=1 (required to write)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { buildAll } = require("./lib/pro-upgrade-visuals/build-priority1-printables.js");

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
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`Admin login failed (${res.status})`);
  }
  return res.json.token;
}

async function loadSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error(`site-content failed ${res.status}`);
  return res.json.siteContent;
}

async function uploadPrintable(token, lessonPlanId, title, pdfPath, expectedUpdatedAt) {
  const buf = fs.readFileSync(pdfPath);
  const fileData = `data:application/pdf;base64,${buf.toString("base64")}`;
  return requestJson(
    "POST",
    "/api/admin/curriculum/resources/tk-printable",
    {
      action: "create",
      lessonPlanId,
      title,
      status: "draft",
      fileName: path.basename(pdfPath),
      fileData,
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function saveEnrichmentDraft(token, planId, enrichmentDraft, expectedUpdatedAt) {
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

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    throw new Error("Refusing to write: set LLH_APPLY_PRODUCTION_DRAFTS=1");
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    throw new Error("Missing admin env credentials");
  }

  const only = process.argv.slice(2).filter((a) => a.startsWith("cur-lp-"));
  const built = await buildAll(only.length ? only : undefined);
  const byLesson = new Map();
  built.forEach((row) => {
    if (!byLesson.has(row.lessonId)) byLesson.set(row.lessonId, []);
    byLesson.get(row.lessonId).push(row);
  });

  const token = await login();
  const report = [];

  for (const [lessonId, files] of byLesson.entries()) {
    let site = await loadSite(token);
    const plan = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    if (!plan) throw new Error(`Missing plan ${lessonId}`);
    if (text(plan.plan) !== "Pro") throw new Error(`Refusing non-Pro ${lessonId}`);

    const uploadedIds = [];
    const uploadRows = [];
    for (const file of files) {
      site = await loadSite(token);
      const stamp = site.updatedAt;
      const up = await uploadPrintable(token, lessonId, file.title, file.filePath, stamp);
      if (up.status !== 200) {
        throw new Error(`Printable upload failed for ${file.title}: ${up.status} ${JSON.stringify(up.json).slice(0, 300)}`);
      }
      const resourceId = up.json?.resource?.id || up.json?.resourceId || up.json?.id;
      if (!resourceId) {
        throw new Error(`No resource id returned for ${file.title}: ${JSON.stringify(up.json).slice(0, 400)}`);
      }
      const status = up.json?.resource?.status || up.json?.status || "";
      uploadedIds.push(resourceId);
      uploadRows.push({ title: file.title, resourceId, status, http: up.status });
      console.log(JSON.stringify({ phase: "printable_uploaded", lessonId, title: file.title, resourceId, status }));
    }

    site = await loadSite(token);
    const fresh = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    const draft = fresh.enrichmentDraft && typeof fresh.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(fresh.enrichmentDraft))
      : { activities: {}, week: {} };
    draft.week = draft.week || {};
    const existing = Array.isArray(draft.week.printableIds) ? draft.week.printableIds.slice() : [];
    const merged = Array.from(new Set(existing.concat(uploadedIds)));
    draft.week.printableIds = merged;
    draft.week.printableIdeas = draft.week.printableIdeas || [];
    draft.meta = {
      ...(draft.meta || {}),
      printableDraftUploadAt: new Date().toISOString(),
      printableDraftCount: merged.length,
      neverAutoPublish: true,
    };
    draft.draftOnly = true;
    draft.neverAutoPublish = true;

    const save = await saveEnrichmentDraft(token, lessonId, draft, site.updatedAt);
    if (save.status !== 200) {
      throw new Error(`Draft save failed ${lessonId}: ${save.status} ${JSON.stringify(save.json).slice(0, 300)}`);
    }

    const afterSite = await loadSite(token);
    const afterPlan = (afterSite.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    const afterResources = (afterSite.curriculum?.resources || []).filter((r) => uploadedIds.includes(r.id));
    const row = {
      lessonId,
      title: afterPlan?.title,
      enrichmentPublished: afterPlan?.enrichmentPublished === true,
      planStatus: afterPlan?.status,
      printableIdsOnDraft: afterPlan?.enrichmentDraft?.week?.printableIds || [],
      uploads: uploadRows,
      resourceStatuses: afterResources.map((r) => ({ id: r.id, title: r.title, status: r.status })),
      publishStatus: "NOT PUBLISHED / REVIEW NEEDED",
    };
    report.push(row);
    console.log(JSON.stringify({ phase: "lesson_complete", lessonId, printableCount: uploadedIds.length, enrichmentPublished: row.enrichmentPublished }));
  }

  const outPath = path.join(__dirname, "..", "docs/audits/pro-upgrade-draft-printables-result.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), site: SITE_URL, report }, null, 2));
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error("PRINTABLE_APPLY_FAILED", err.message);
  process.exit(1);
});

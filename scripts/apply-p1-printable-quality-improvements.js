/**
 * Upload the 5 IMPROVE Priority 1 printable drafts and swap enrichment printableIds.
 * Does not delete old resources. Does not publish.
 * Required: LLH_APPLY_PRODUCTION_DRAFTS=1
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const OUT = path.join(__dirname, "../curriculum-drafts/pro-upgrade/printables-quality-v3");

const IMPROVEMENTS = [
  {
    lessonId: "cur-lp-toddler-pet-vet-clinic",
    oldResourceId: "cur-res-b722ba10ee070a6b",
    title: "Pet Care Action Cards",
    filePath: path.join(OUT, "toddler-pet-vet-clinic/pet-care-action-cards.pdf"),
  },
  {
    lessonId: "cur-lp-toddler-pet-vet-clinic",
    oldResourceId: "cur-res-f69bee309aa41f32",
    title: "Pet Friend Picture Cards",
    filePath: path.join(OUT, "toddler-pet-vet-clinic/pet-friend-picture-cards.pdf"),
  },
  {
    lessonId: "cur-lp-toddler-pet-vet-clinic",
    oldResourceId: "cur-res-ab46a19506a160f1",
    title: "Vet Check Picture Chart",
    filePath: path.join(OUT, "toddler-pet-vet-clinic/vet-check-picture-chart.pdf"),
  },
  {
    lessonId: "cur-lp-toddler-camping-under-the-stars",
    oldResourceId: "cur-res-739b44750866b0e1",
    title: "Day & Night Scene Cards",
    filePath: path.join(OUT, "toddler-camping-under-the-stars/day-night-scene-cards.pdf"),
  },
  {
    lessonId: "cur-lp-toddler-camping-under-the-stars",
    oldResourceId: "cur-res-72b3d0b06da14a7f",
    title: "Nature Treasure Hunt Cards",
    filePath: path.join(OUT, "toddler-camping-under-the-stars/nature-treasure-hunt-cards.pdf"),
  },
];

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retry(fn, label, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      console.log(JSON.stringify({ retry: label, i: i + 1, err: String(e.message || e).slice(0, 180) }));
      await sleep(2500 * (i + 1));
    }
  }
  throw last;
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (res.status !== 200 || !res.json?.token) throw new Error(`login failed ${res.status}`);
  return res.json.token;
}

async function loadSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200 || !res.json?.siteContent) throw new Error(`site-content ${res.status}`);
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
  for (const row of IMPROVEMENTS) {
    if (!fs.existsSync(row.filePath)) throw new Error(`Missing PDF: ${row.filePath}`);
  }

  const token = await login();
  const swapMap = new Map();
  const report = { at: new Date().toISOString(), site: SITE_URL, uploads: [], lessons: [] };

  for (const row of IMPROVEMENTS) {
    let site = await retry(() => loadSite(token), "site-before-upload");
    const up = await retry(async () => {
      const r = await uploadPrintable(token, row.lessonId, row.title, row.filePath, site.updatedAt);
      if (r.status !== 200) throw new Error(`upload ${row.title}: ${r.status} ${JSON.stringify(r.json).slice(0, 240)}`);
      return r;
    }, `upload-${row.title}`);
    const resourceId = up.json?.resource?.id || up.json?.resourceId || up.json?.id;
    const status = up.json?.resource?.status || "draft";
    if (!resourceId) throw new Error(`No resourceId for ${row.title}`);
    swapMap.set(row.oldResourceId, resourceId);
    report.uploads.push({
      lessonId: row.lessonId,
      title: row.title,
      oldResourceId: row.oldResourceId,
      newResourceId: resourceId,
      status,
      oldDeleted: false,
      published: false,
      kind: "improve",
    });
    console.log(JSON.stringify({ phase: "uploaded", title: row.title, old: row.oldResourceId, neu: resourceId, status }));
  }

  const byLesson = new Map();
  for (const row of IMPROVEMENTS) {
    if (!byLesson.has(row.lessonId)) byLesson.set(row.lessonId, []);
    byLesson.get(row.lessonId).push(row);
  }

  for (const [lessonId, rows] of byLesson.entries()) {
    let site = await retry(() => loadSite(token), `site-before-save-${lessonId}`);
    const plan = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    if (!plan) throw new Error(`Missing plan ${lessonId}`);
    const draft = JSON.parse(JSON.stringify(plan.enrichmentDraft || {}));
    draft.week = draft.week || {};
    const current = Array.isArray(draft.week.printableIds) ? draft.week.printableIds.slice() : [];
    const next = current.map((id) => swapMap.get(id) || id);
    for (const row of rows) {
      const neu = swapMap.get(row.oldResourceId);
      if (neu && !next.includes(neu)) next.push(neu);
    }
    draft.week.printableIds = next;
    draft.meta = {
      ...(draft.meta || {}),
      printableQualityImproveAt: new Date().toISOString(),
      printableQualityImproveNote: "Improved weak SVG visuals; old resources retained.",
    };
    draft.draftOnly = true;
    draft.neverAutoPublish = true;

    await retry(async () => {
      const r = await saveEnrichmentDraft(token, lessonId, draft, site.updatedAt);
      if (r.status !== 200) throw new Error(`save ${lessonId}: ${r.status} ${JSON.stringify(r.json).slice(0, 240)}`);
      return r;
    }, `save-${lessonId}`);

    site = await retry(() => loadSite(token), `verify-${lessonId}`);
    const plan2 = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    const resources = new Map((site.curriculum?.resources || []).map((r) => [r.id, r]));
    report.lessons.push({
      lessonId,
      title: plan2?.title,
      enrichmentPublished: !!plan2?.enrichmentPublished,
      printableIds: plan2?.enrichmentDraft?.week?.printableIds || [],
      rows: rows.map((row) => {
        const neu = swapMap.get(row.oldResourceId);
        const n = resources.get(neu) || {};
        const o = resources.get(row.oldResourceId) || {};
        return {
          title: row.title,
          newId: neu,
          newStatus: n.status || null,
          oldId: row.oldResourceId,
          oldStillExists: !!o.id,
          oldStatus: o.status || null,
        };
      }),
    });
    console.log(JSON.stringify({ phase: "linked", lessonId, printableIds: plan2?.enrichmentDraft?.week?.printableIds }));
  }

  const outPath = path.join(__dirname, "../docs/audits/PRO_PRIORITY1_PRINTABLE_QUALITY_IMPROVE_RESULT.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: "done", reportPath: outPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

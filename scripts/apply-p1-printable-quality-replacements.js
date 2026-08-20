/**
 * Upload quality-v3 replacements for the 4 failing P1 printables.
 * - Creates new draft resources (titles without "Draft")
 * - Swaps enrichmentDraft.week.printableIds to the new IDs for those slots
 * - Does NOT delete old resources
 * - Does NOT publish
 *
 * Required: LLH_APPLY_PRODUCTION_DRAFTS=1
 * Env: SITE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE
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

/** oldResourceId → new local PDF */
const REPLACEMENTS = [
  {
    lessonId: "cur-lp-toddler-superhero-training-camp",
    oldResourceId: "cur-res-d0766e0900173303",
    title: "Kindness Mission Cards",
    filePath: path.join(OUT, "toddler-superhero-training-camp/kindness-mission-cards.pdf"),
  },
  {
    lessonId: "cur-lp-toddler-superhero-training-camp",
    oldResourceId: "cur-res-f72e48f308860194",
    title: "Hero Movement Action Cards",
    filePath: path.join(OUT, "toddler-superhero-training-camp/hero-movement-action-cards.pdf"),
  },
  {
    lessonId: "cur-lp-toddler-zoo-adventures",
    oldResourceId: "cur-res-47289150a016e6a4",
    title: "Zoo Animal Picture Cards",
    filePath: path.join(OUT, "toddler-zoo-adventures/zoo-animal-picture-cards.pdf"),
  },
  {
    lessonId: "cur-lp-toddler-zoo-adventures",
    oldResourceId: "cur-res-ed3dd8cd112b51ba",
    title: "Animal–Habitat Match Cards",
    filePath: path.join(OUT, "toddler-zoo-adventures/animal-habitat-match-cards.pdf"),
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
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    throw new Error("Missing admin credentials");
  }

  for (const row of REPLACEMENTS) {
    if (!fs.existsSync(row.filePath)) throw new Error(`Missing PDF: ${row.filePath}`);
  }

  const token = await login();
  const report = { at: new Date().toISOString(), site: SITE_URL, uploads: [], lessons: [] };

  /** @type {Map<string, string>} old → new */
  const swapMap = new Map();

  for (const row of REPLACEMENTS) {
    let site = await retry(() => loadSite(token), "site-before-upload");
    const up = await retry(
      async () => {
        const r = await uploadPrintable(token, row.lessonId, row.title, row.filePath, site.updatedAt);
        if (r.status !== 200) throw new Error(`upload ${row.title}: ${r.status} ${JSON.stringify(r.json).slice(0, 240)}`);
        return r;
      },
      `upload-${row.title}`,
    );
    const resourceId = up.json?.resource?.id || up.json?.resourceId || up.json?.id;
    const status = up.json?.resource?.status || "draft";
    if (!resourceId) throw new Error(`No resourceId for ${row.title}`);
    if (/\(draft\)/i.test(row.title)) throw new Error(`Title must not include Draft: ${row.title}`);
    swapMap.set(row.oldResourceId, resourceId);
    report.uploads.push({
      lessonId: row.lessonId,
      title: row.title,
      oldResourceId: row.oldResourceId,
      newResourceId: resourceId,
      status,
      oldDeleted: false,
      published: false,
    });
    console.log(JSON.stringify({ phase: "uploaded", title: row.title, old: row.oldResourceId, neu: resourceId, status }));
  }

  // Update enrichment draft printableIds per lesson (swap only the replaced slots)
  const byLesson = new Map();
  for (const row of REPLACEMENTS) {
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
    // Ensure new IDs present even if old missing
    for (const row of rows) {
      const neu = swapMap.get(row.oldResourceId);
      if (neu && !next.includes(neu)) next.push(neu);
    }
    draft.week.printableIds = next;
    draft.meta = {
      ...(draft.meta || {}),
      printableQualityV3At: new Date().toISOString(),
      printableQualityV3Note: "Replaced failing bubble/abstract packs; old resources retained (not deleted).",
    };
    draft.draftOnly = true;
    draft.neverAutoPublish = true;

    const save = await retry(
      async () => {
        const r = await saveEnrichmentDraft(token, lessonId, draft, site.updatedAt);
        if (r.status !== 200) throw new Error(`save ${lessonId}: ${r.status} ${JSON.stringify(r.json).slice(0, 240)}`);
        return r;
      },
      `save-${lessonId}`,
    );

    // Verify
    site = await retry(() => loadSite(token), `verify-${lessonId}`);
    const plan2 = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    const ids = plan2?.enrichmentDraft?.week?.printableIds || [];
    const resources = new Map((site.curriculum?.resources || []).map((r) => [r.id, r]));
    const verify = {
      lessonId,
      title: plan2?.title,
      enrichmentPublished: !!plan2?.enrichmentPublished,
      printableIds: ids,
      newStatuses: rows.map((row) => {
        const neu = swapMap.get(row.oldResourceId);
        const r = resources.get(neu) || {};
        const old = resources.get(row.oldResourceId) || {};
        return {
          title: row.title,
          newId: neu,
          newStatus: r.status || null,
          oldId: row.oldResourceId,
          oldStillExists: !!old.id,
          oldStatus: old.status || null,
        };
      }),
      saveHttp: save.status,
    };
    report.lessons.push(verify);
    console.log(JSON.stringify({ phase: "linked", lessonId, printableIds: ids }));
  }

  const outPath = path.join(__dirname, "..", "docs", "audits", "PRO_PRIORITY1_PRINTABLE_QUALITY_REPLACE_RESULT.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: "done", reportPath: outPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

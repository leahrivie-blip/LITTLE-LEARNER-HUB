/**
 * Replace Priority 1 Pro draft printables with activity-driven v2 packs.
 * - Uploads new PDFs as status:draft (titles WITHOUT "Draft")
 * - Removes old generic/template draft printables from enrichmentDraft.week.printableIds
 * - Deletes old draft resources when safe
 * - Never publishes enrichment or resources
 *
 * Env: SITE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE
 * Required: LLH_APPLY_PRODUCTION_DRAFTS=1
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { buildAll, LESSONS } = require("./lib/pro-upgrade-visuals/build-priority1-printables-v2");

const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";

const P1_IDS = Object.keys(LESSONS);

/** Known v1 generic printable IDs from prior upload pass (remove if still present). */
const KNOWN_V1_IDS = new Set([
  "cur-res-b11d123a40d51a11",
  "cur-res-f5fc9f02b43f9c53",
  "cur-res-b5ac54d682293f5f",
  "cur-res-91d913cc179a73ed",
  "cur-res-f05a4b1d1ea1f03b",
  "cur-res-8fe9dfb61174228c",
  "cur-res-ec06af2ecc16e6a8",
  "cur-res-bbea62bb89e29307",
  "cur-res-a885084c433b23e5",
  "cur-res-1402d0c76cd86bdf",
  "cur-res-9dba67cffe7ed329",
  "cur-res-39fa83250cfc3b9d",
  "cur-res-e4f2e479ac4fff3a",
  "cur-res-be91b95b163a2f3f",
  "cur-res-5d1005a0e642d16f",
  "cur-res-1318b7804cd008fc",
]);

function text(v) {
  return String(v == null ? "" : v).trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function retry(fn, label, tries = 8) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      console.log(JSON.stringify({ retry: label, i: i + 1, err: String(e.message || e).slice(0, 180) }));
      await sleep(3000 * (i + 1));
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
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`Admin login failed (${res.status})`);
  }
  return res.json.token;
}

async function loadSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200 || !res.json?.siteContent) {
    throw new Error(`site-content failed ${res.status}`);
  }
  return res.json.siteContent;
}

function isOldGenericDraft(resource) {
  if (!resource) return false;
  const title = text(resource.title);
  const status = text(resource.status).toLowerCase();
  if (KNOWN_V1_IDS.has(resource.id)) return true;
  if (status !== "draft") return false;
  if (/\(draft\)/i.test(title)) return true;
  if (/zone\s*signs?/i.test(title)) return true;
  if (/helper\s*zone/i.test(title)) return true;
  if (/trail\s*signs?/i.test(title)) return true;
  if (/orchard\s*zone/i.test(title)) return true;
  if (/kitchen\s*zone/i.test(title)) return true;
  if (/habitat\s*zone/i.test(title)) return true;
  if (/clinic\s*zone/i.test(title)) return true;
  if (/ship\s*\/\s*island/i.test(title)) return true;
  return false;
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

async function deletePrintable(token, lessonPlanId, resourceId, expectedUpdatedAt) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/resources/tk-printable",
    {
      action: "delete",
      lessonPlanId,
      resourceId,
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
  const lessonFilter = only.length ? new Set(only) : null;

  console.log(JSON.stringify({ phase: "build_start" }));
  const built = await buildAll();
  const byLesson = new Map();
  built.forEach((row) => {
    if (lessonFilter && !lessonFilter.has(row.lessonId)) return;
    if (!byLesson.has(row.lessonId)) byLesson.set(row.lessonId, []);
    byLesson.get(row.lessonId).push(row);
  });

  let token = await retry(login, "login");
  const report = [];

  for (const lessonId of P1_IDS) {
    if (lessonFilter && !lessonFilter.has(lessonId)) continue;
    const files = byLesson.get(lessonId) || [];
    if (!files.length) throw new Error(`No built files for ${lessonId}`);

    console.log(JSON.stringify({ phase: "lesson_start", lessonId, fileCount: files.length }));
    token = await retry(login, "login-loop");

    let site = await retry(() => loadSite(token), "site");
    const plan = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    if (!plan) throw new Error(`Missing plan ${lessonId}`);
    if (text(plan.plan) !== "Pro") throw new Error(`Refusing non-Pro ${lessonId}`);

    const resources = site.curriculum?.resources || [];
    const draftPrintableIds = Array.isArray(plan.enrichmentDraft?.week?.printableIds)
      ? plan.enrichmentDraft.week.printableIds.slice()
      : [];
    const planResourceIds = Array.isArray(plan.resourceIds) ? plan.resourceIds.slice() : [];
    const candidateIds = Array.from(new Set([...draftPrintableIds, ...planResourceIds]));

    const toRemove = [];
    for (const id of candidateIds) {
      const res = resources.find((r) => r.id === id);
      if (isOldGenericDraft(res) || KNOWN_V1_IDS.has(id)) {
        toRemove.push({ id, title: res?.title || "(missing)", status: res?.status || "" });
      }
    }

    const uploadedIds = [];
    const uploadRows = [];
    for (const file of files) {
      site = await retry(() => loadSite(token), "site-before-upload");
      const up = await retry(
        async () => {
          const r = await uploadPrintable(token, lessonId, file.title, file.filePath, site.updatedAt);
          if (r.status !== 200) {
            throw new Error(`upload ${file.title}: ${r.status} ${JSON.stringify(r.json).slice(0, 280)}`);
          }
          return r;
        },
        `upload-${file.title}`,
      );
      const resourceId = up.json?.resource?.id || up.json?.resourceId || up.json?.id;
      if (!resourceId) throw new Error(`No resource id for ${file.title}: ${JSON.stringify(up.json).slice(0, 400)}`);
      const status = up.json?.resource?.status || up.json?.status || "draft";
      if (/\(draft\)/i.test(file.title)) throw new Error(`Title must not include Draft: ${file.title}`);
      uploadedIds.push(resourceId);
      uploadRows.push({ title: file.title, resourceId, status, pages: file.pages, http: up.status });
      console.log(JSON.stringify({ phase: "uploaded", lessonId, title: file.title, resourceId, status }));
      await sleep(800);
    }

    // Delete old generic draft printables (after new ones exist)
    const removed = [];
    for (const old of toRemove) {
      site = await retry(() => loadSite(token), "site-before-delete");
      try {
        const del = await deletePrintable(token, lessonId, old.id, site.updatedAt);
        removed.push({ ...old, deleteHttp: del.status, deleteOk: del.status === 200 });
        console.log(JSON.stringify({ phase: "deleted_old", lessonId, id: old.id, title: old.title, http: del.status }));
      } catch (e) {
        removed.push({ ...old, deleteHttp: 0, deleteOk: false, err: String(e.message).slice(0, 160) });
      }
      await sleep(600);
    }

    // Point enrichment draft printableIds ONLY at the new pack
    site = await retry(() => loadSite(token), "site-before-save");
    const fresh = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    const draft =
      fresh.enrichmentDraft && typeof fresh.enrichmentDraft === "object"
        ? JSON.parse(JSON.stringify(fresh.enrichmentDraft))
        : { activities: {}, week: {} };
    draft.week = draft.week || {};
    const removeSet = new Set(toRemove.map((r) => r.id));
    const keptOthers = (Array.isArray(draft.week.printableIds) ? draft.week.printableIds : []).filter(
      (id) => !removeSet.has(id) && !uploadedIds.includes(id) && !KNOWN_V1_IDS.has(id),
    );
    // Prefer only the new activity-driven pack for these P1 lessons
    draft.week.printableIds = Array.from(new Set(uploadedIds.concat(keptOthers.filter((id) => {
      const res = (site.curriculum?.resources || []).find((r) => r.id === id);
      return res && text(res.status).toLowerCase() === "draft" && !isOldGenericDraft(res);
    }))));
    // If somehow keptOthers reintroduced junk, force to uploaded only
    draft.week.printableIds = uploadedIds.slice();
    draft.week.printableIdeas = draft.week.printableIdeas || [];
    draft.meta = {
      ...(draft.meta || {}),
      printableRebuildV2At: new Date().toISOString(),
      printableRebuildV2Count: uploadedIds.length,
      neverAutoPublish: true,
    };
    draft.draftOnly = true;
    draft.neverAutoPublish = true;
    draft.previewReady = true;

    const save = await retry(
      async () => {
        const r = await saveEnrichmentDraft(token, lessonId, draft, site.updatedAt);
        if (r.status !== 200) {
          throw new Error(`draft save ${lessonId}: ${r.status} ${JSON.stringify(r.json).slice(0, 280)}`);
        }
        return r;
      },
      `save-${lessonId}`,
    );

    const afterSite = await retry(() => loadSite(token), "site-after");
    const afterPlan = (afterSite.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    const afterResources = (afterSite.curriculum?.resources || []).filter((r) => uploadedIds.includes(r.id));
    const row = {
      lessonId,
      title: afterPlan?.title,
      enrichmentPublished: afterPlan?.enrichmentPublished === true,
      planStatus: afterPlan?.status,
      printableIdsOnDraft: afterPlan?.enrichmentDraft?.week?.printableIds || [],
      uploads: uploadRows,
      removed,
      resourceStatuses: afterResources.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        hasDraftInTitle: /\(draft\)/i.test(String(r.title || "")),
      })),
      saveHttp: save.status,
      publishStatus: "NOT PUBLISHED / OWNER REVIEW",
    };
    report.push(row);
    console.log(
      JSON.stringify({
        phase: "lesson_complete",
        lessonId,
        uploaded: uploadedIds.length,
        removed: removed.length,
        enrichmentPublished: row.enrichmentPublished,
      }),
    );
  }

  const outPath = path.join(__dirname, "..", "docs/audits/PRO_PRIORITY1_PRINTABLE_REBUILD_RESULT.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), site: SITE_URL, report }, null, 2));
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error("PRINTABLE_V2_APPLY_FAILED", err.message);
  process.exit(1);
});

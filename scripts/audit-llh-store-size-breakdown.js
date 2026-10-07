#!/usr/bin/env node
/**
 * READ-ONLY llh_store size / write-amplification diagnostic.
 *
 * Defaults to non-mutating behavior. Never writes to Postgres, never calls
 * writeStore*, never persists the store. Not wired into app startup.
 *
 * Usage:
 *   # From a JSON file (local/safe snapshot)
 *   node scripts/audit-llh-store-size-breakdown.js --file /path/to/store.json
 *
 *   # From Postgres (SELECT only)
 *   PRODUCTION_DATABASE_URL=... node scripts/audit-llh-store-size-breakdown.js --postgres
 *
 *   # Optional: write JSON report
 *   node scripts/audit-llh-store-size-breakdown.js --file store.json --out /tmp/report.json
 *
 * Sensitive values are redacted from the report (emails, tokens, message bodies, etc.).
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SENSITIVE_KEY_RE = /password|token|secret|access[_-]?code|authorization|cookie|session|api[_-]?key|private|ssn|card|cvv|stripe|resend|openai/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DATA_URI_RE = /^data:([a-z0-9.+/-]+);base64,/i;
const BASE64_HEAVY_RE = /^[A-Za-z0-9+/=\s]{200,}$/;

function parseArgs(argv) {
  const args = { file: "", postgres: false, out: "", recordId: "launch-store", help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--postgres") args.postgres = true;
    else if (a === "--file") args.file = String(argv[++i] || "");
    else if (a === "--out") args.out = String(argv[++i] || "");
    else if (a === "--record-id") args.recordId = String(argv[++i] || "launch-store");
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function byteLen(value) {
  if (value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Buffer.byteLength(String(value), "utf8");
  }
}

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 1000) / 1000;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function classifySection(pathKey, bytes, sample) {
  const p = String(pathKey || "").toLowerCase();
  if (DATA_URI_RE.test(String(sample || "")) || p.includes("filedata") || p.includes("base64")) {
    return "D"; // media/base64
  }
  if (
    p.includes("history")
    || p.includes("audit")
    || p.includes("version")
    || p.includes("aiusage")
    || p.includes("aioutput")
    || p.includes("operator")
    || p.includes("generation")
    || p.includes("rawmodel")
    || p.includes("backup")
  ) {
    return "C"; // historical/audit
  }
  if (
    p.includes("enrichment")
    || p.includes("teachingkit")
    || p.includes("curriculum")
    || p.includes("lessonplan")
    || p.includes("printable")
  ) {
    return "E"; // candidate for separate persistence (also often core)
  }
  if (p.includes("analytics") || p.includes("draft") || p.includes("prompt")) {
    return "B"; // reproducible/derived-ish
  }
  return "A"; // core runtime
}

function countShape(value) {
  if (Array.isArray(value)) return { kind: "array", count: value.length };
  if (value && typeof value === "object") return { kind: "object", count: Object.keys(value).length };
  if (typeof value === "string") return { kind: "string", count: value.length };
  return { kind: typeof value, count: value == null ? 0 : 1 };
}

function redactPathLabel(jsonPath) {
  // Replace email-looking segments and obvious secrets with placeholders.
  return String(jsonPath)
    .split(".")
    .map((seg) => {
      const bare = seg.replace(/\[\d+\]/g, "");
      if (EMAIL_RE.test(bare)) return "[email]";
      if (SENSITIVE_KEY_RE.test(bare)) return `[${bare}]`;
      return seg;
    })
    .join(".");
}

function childBreakdown(value, limit = 40) {
  if (!value || typeof value !== "object") return [];
  const entries = Array.isArray(value)
    ? value.map((v, i) => [`[${i}]`, v])
    : Object.entries(value);
  return entries
    .map(([k, v]) => {
      const bytes = byteLen(v);
      const shape = countShape(v);
      return {
        key: redactPathLabel(String(k)),
        bytes,
        mb: mb(bytes),
        ...shape,
      };
    })
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

function sectionRow(name, value, totalBytes) {
  const bytes = byteLen(value);
  const shape = countShape(value);
  const sample = typeof value === "string" ? value.slice(0, 80) : "";
  return {
    section: name,
    bytes,
    mb: mb(bytes),
    percent: pct(bytes, totalBytes),
    ...shape,
    classification: classifySection(name, bytes, sample),
    largestChildren: childBreakdown(value, 12),
  };
}

function walkLargest(value, basePath, acc, depth, maxDepth) {
  if (depth > maxDepth || value == null) return;
  const bytes = byteLen(value);
  const t = Array.isArray(value) ? "array" : typeof value;
  if (t === "string" || t === "array" || t === "object") {
    acc.push({
      path: redactPathLabel(basePath || "$"),
      type: t,
      bytes,
      mb: mb(bytes),
      chars: t === "string" ? value.length : undefined,
      count: t === "array" ? value.length : t === "object" ? Object.keys(value).length : undefined,
      hints: detectHints(basePath, value),
      sensitive: isSensitivePath(basePath),
    });
  }
  if (t === "object" && !Array.isArray(value) && depth < maxDepth) {
    for (const [k, v] of Object.entries(value)) {
      // Skip walking deep into obvious secret leaves.
      if (SENSITIVE_KEY_RE.test(k) && typeof v === "string") continue;
      walkLargest(v, `${basePath}.${k}`, acc, depth + 1, maxDepth);
    }
  } else if (Array.isArray(value) && depth < maxDepth) {
    // Only walk top N array items by size to keep runtime bounded.
    const ranked = value
      .map((v, i) => ({ i, bytes: byteLen(v), v }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 40);
    for (const row of ranked) {
      walkLargest(row.v, `${basePath}[${row.i}]`, acc, depth + 1, maxDepth);
    }
  }
}

function isSensitivePath(p) {
  return SENSITIVE_KEY_RE.test(p) || /\.users\.[^.]+\.(password|email|phone)/i.test(p);
}

function detectHints(p, value) {
  const hints = [];
  const pathL = String(p || "").toLowerCase();
  const str = typeof value === "string" ? value : "";
  if (DATA_URI_RE.test(str)) hints.push("data-uri");
  if (str.startsWith("data:application/pdf")) hints.push("embedded-pdf");
  if (str.length > 500 && BASE64_HEAVY_RE.test(str) && !str.includes(" ")) hints.push("base64-like");
  if (pathL.includes("enrichment")) hints.push("enrichment");
  if (pathL.includes("history")) hints.push("history");
  if (pathL.includes("teachingkit") || pathL.includes("teachingkit")) hints.push("teaching-kit");
  if (pathL.includes("printable")) hints.push("printable");
  if (pathL.includes("image") || pathL.includes("cover") || pathL.includes("photo")) hints.push("image-meta");
  if (pathL.includes("draft")) hints.push("draft");
  if (pathL.includes("operator")) hints.push("operator");
  if (pathL.includes("dailyplans")) hints.push("daily-plans");
  if (typeof value === "string" && /<(div|p|span|svg|html)\b/i.test(str)) hints.push("html-or-svg");
  if (pathL.includes("filedata")) hints.push("inline-filedata");
  return hints;
}

function topByType(nodes, type, limit) {
  return nodes
    .filter((n) => n.type === type)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit)
    .map((n) => (n.sensitive
      ? { path: n.path.split(".").slice(0, 3).join(".") + ".[redacted]", type: n.type, bytes: n.bytes, mb: n.mb, classification: "sensitive", hints: n.hints }
      : { path: n.path, type: n.type, bytes: n.bytes, mb: n.mb, count: n.count, chars: n.chars, hints: n.hints }));
}

function lessonPlanRows(store) {
  const plans = store?.siteContent?.curriculum?.lessonPlans;
  if (!Array.isArray(plans)) return [];
  return plans
    .map((plan, index) => {
      const bytes = byteLen(plan);
      const id = String(plan?.id || "").slice(0, 80);
      const title = String(plan?.title || "").slice(0, 80);
      const enrichmentDraft = byteLen(plan?.enrichmentDraft || plan?.teachingKit?.enrichmentDraft);
      const enrichmentPublished = byteLen(plan?.enrichmentPublished || plan?.teachingKit?.enrichmentPublished);
      const enrichmentHistory = byteLen(plan?.enrichmentPublishHistory || plan?.teachingKit?.enrichmentPublishHistory);
      const teachingKit = byteLen(plan?.teachingKit);
      const dailyPlans = byteLen(plan?.dailyPlans);
      const hasDataUri = JSON.stringify(plan).includes("data:image") || JSON.stringify(plan).includes("data:application");
      return {
        index,
        id: id || `[plan-${index}]`,
        title: title || "(untitled)",
        bytes,
        mb: mb(bytes),
        dailyPlansBytes: dailyPlans,
        teachingKitBytes: teachingKit,
        enrichmentDraftBytes: enrichmentDraft,
        enrichmentPublishedBytes: enrichmentPublished,
        enrichmentHistoryBytes: enrichmentHistory,
        hasInlineMediaHint: hasDataUri,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

function activityRows(store) {
  const activities = store?.siteContent?.curriculum?.activities;
  if (!Array.isArray(activities)) return [];
  return activities
    .map((act, index) => ({
      index,
      id: String(act?.id || "").slice(0, 80) || `[activity-${index}]`,
      title: String(act?.title || "").slice(0, 80),
      bytes: byteLen(act),
      mb: mb(byteLen(act)),
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

function scanInlineMedia(value, basePath, acc, depth, maxDepth) {
  if (depth > maxDepth || value == null) return;
  if (typeof value === "string") {
    const m = value.match(DATA_URI_RE);
    if (m || (value.length > 4000 && BASE64_HEAVY_RE.test(value))) {
      acc.push({
        path: redactPathLabel(basePath),
        bytes: Buffer.byteLength(value, "utf8"),
        mb: mb(Buffer.byteLength(value, "utf8")),
        kind: m ? `data-uri:${m[1]}` : "base64-like-string",
        chars: value.length,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    const ranked = value
      .map((v, i) => ({ i, bytes: byteLen(v), v }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 60);
    for (const row of ranked) scanInlineMedia(row.v, `${basePath}[${row.i}]`, acc, depth + 1, maxDepth);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(k) && typeof v === "string") continue;
      scanInlineMedia(v, `${basePath}.${k}`, acc, depth + 1, maxDepth);
    }
  }
}

function enrichmentHistoryAudit(store) {
  const plans = store?.siteContent?.curriculum?.lessonPlans || [];
  const groups = {
    enrichmentDraft: { bytes: 0, count: 0, classification: "KEEP", note: "Current draft Teaching Kit / enrichment being edited" },
    enrichmentPublished: { bytes: 0, count: 0, classification: "KEEP", note: "Live published enrichment for customer/runtime" },
    enrichmentPublishHistory: { bytes: 0, count: 0, classification: "ARCHIVE CANDIDATE", note: "Prior publish snapshots; valuable but not required to render live lesson" },
    teachingKitOther: { bytes: 0, count: 0, classification: "KEEP", note: "Other teachingKit fields (completeness, sections, etc.)" },
    operatorJobs: { bytes: 0, count: 0, classification: "ARCHIVE CANDIDATE", note: "Curriculum operator job/debug payloads if present on store" },
    aiOutputs: { bytes: 0, count: 0, classification: "ARCHIVE CANDIDATE", note: "AI output logs" },
    visualProduction: { bytes: 0, count: 0, classification: "KEEP", note: "Visual production briefs" },
    binderBuilder: { bytes: 0, count: 0, classification: "KEEP", note: "Binder Builder drafts (owner workflow)" },
  };

  for (const plan of plans) {
    const draft = plan?.enrichmentDraft ?? plan?.teachingKit?.enrichmentDraft;
    const published = plan?.enrichmentPublished ?? plan?.teachingKit?.enrichmentPublished;
    const history = plan?.enrichmentPublishHistory ?? plan?.teachingKit?.enrichmentPublishHistory;
    if (draft != null) {
      groups.enrichmentDraft.bytes += byteLen(draft);
      groups.enrichmentDraft.count += 1;
    }
    if (published != null) {
      groups.enrichmentPublished.bytes += byteLen(published);
      groups.enrichmentPublished.count += 1;
    }
    if (history != null) {
      groups.enrichmentPublishHistory.bytes += byteLen(history);
      groups.enrichmentPublishHistory.count += 1;
      if (Array.isArray(history)) {
        // no-op; count already plans-with-history
      }
    }
    if (plan?.teachingKit) {
      const tk = { ...plan.teachingKit };
      delete tk.enrichmentDraft;
      delete tk.enrichmentPublished;
      delete tk.enrichmentPublishHistory;
      groups.teachingKitOther.bytes += byteLen(tk);
      groups.teachingKitOther.count += 1;
    }
  }

  const operatorStore = store.curriculumOperatorJobs || store.operatorJobs || {};
  groups.operatorJobs.bytes = byteLen(operatorStore);
  if (Array.isArray(operatorStore)) {
    groups.operatorJobs.count = operatorStore.length;
  } else if (Array.isArray(operatorStore.jobs)) {
    groups.operatorJobs.count = operatorStore.jobs.length;
  } else {
    groups.operatorJobs.count = 0;
  }
  groups.aiOutputs.bytes = byteLen(store.aiOutputs || []) + byteLen(store.aiUsageLogs || []);
  groups.aiOutputs.count = (store.aiOutputs || []).length + (store.aiUsageLogs || []).length;
  groups.visualProduction.bytes = byteLen(store.visualProduction || {});
  groups.visualProduction.count = Array.isArray(store.visualProduction?.briefs)
    ? store.visualProduction.briefs.length
    : 0;
  groups.binderBuilder.bytes = byteLen(store.binderBuilder || {});
  groups.binderBuilder.count = Array.isArray(store.binderBuilder?.drafts)
    ? store.binderBuilder.drafts.length
    : 0;

  const rows = Object.entries(groups).map(([name, g]) => ({
    group: name,
    bytes: g.bytes,
    mb: mb(g.bytes),
    count: g.count,
    classification: g.classification,
    note: g.note,
  })).sort((a, b) => b.bytes - a.bytes);

  return {
    rows,
    totalEnrichmentHistoryBytes: groups.enrichmentPublishHistory.bytes,
    totalActiveEnrichmentBytes: groups.enrichmentDraft.bytes + groups.enrichmentPublished.bytes,
    totalTeachingKitRelatedBytes:
      groups.enrichmentDraft.bytes
      + groups.enrichmentPublished.bytes
      + groups.enrichmentPublishHistory.bytes
      + groups.teachingKitOther.bytes,
  };
}

function duplicationSignals(store) {
  const plans = store?.siteContent?.curriculum?.lessonPlans || [];
  let draftVsPublishedOverlapPlans = 0;
  let historyEntries = 0;
  let historyBytes = 0;
  let plansWithBothDraftAndPublished = 0;
  let repeatedFieldHeuristic = 0;

  for (const plan of plans) {
    const draft = plan?.enrichmentDraft ?? plan?.teachingKit?.enrichmentDraft;
    const published = plan?.enrichmentPublished ?? plan?.teachingKit?.enrichmentPublished;
    const history = plan?.enrichmentPublishHistory ?? plan?.teachingKit?.enrichmentPublishHistory;
    if (draft && published) {
      plansWithBothDraftAndPublished += 1;
      const d = JSON.stringify(draft);
      const p = JSON.stringify(published);
      if (d === p) draftVsPublishedOverlapPlans += 1;
      else {
        // Rough overlap: shared length of common prefix / min size is weak; instead compare hash of normalized.
        const dh = crypto.createHash("sha256").update(d).digest("hex");
        const ph = crypto.createHash("sha256").update(p).digest("hex");
        if (dh === ph) draftVsPublishedOverlapPlans += 1;
      }
    }
    if (Array.isArray(history)) {
      historyEntries += history.length;
      historyBytes += byteLen(history);
    } else if (history) {
      historyEntries += 1;
      historyBytes += byteLen(history);
    }

    // Heuristic: daily plan activity text also present inside enrichment published blob.
    const daily = JSON.stringify(plan?.dailyPlans || "");
    const pub = JSON.stringify(published || "");
    if (daily.length > 500 && pub.length > 500) {
      const sample = String(plan?.dailyPlans?.monday?.items?.[0]?.description || plan?.objectives || "").trim();
      if (sample.length > 40 && pub.includes(sample.slice(0, Math.min(80, sample.length)))) {
        repeatedFieldHeuristic += 1;
      }
    }
  }

  return {
    lessonPlanCount: plans.length,
    plansWithBothDraftAndPublished,
    exactDraftEqualsPublishedCount: draftVsPublishedOverlapPlans,
    enrichmentHistoryEntryCount: historyEntries,
    enrichmentHistoryBytes: historyBytes,
    enrichmentHistoryMb: mb(historyBytes),
    plansWhereDailyTextAppearsInPublishedEnrichment: repeatedFieldHeuristic,
    note: "Duplication checks are conservative heuristics; exact draft===published counts identical JSON only.",
  };
}

function curriculumSubBreakdown(store, totalBytes) {
  const curriculum = store?.siteContent?.curriculum || {};
  const lessonPlans = curriculum.lessonPlans || [];
  let dailyPlans = 0;
  let objectives = 0;
  let materials = 0;
  let enrichmentAll = 0;
  let covers = 0;
  let otherPlanFields = 0;
  for (const plan of lessonPlans) {
    dailyPlans += byteLen(plan?.dailyPlans);
    objectives += byteLen(plan?.objectives) + byteLen(plan?.weeklyOverview) + byteLen(plan?.vocabularyWords);
    materials += byteLen(plan?.weeklyMaterials) + byteLen(plan?.materials);
    enrichmentAll += byteLen(plan?.enrichmentDraft)
      + byteLen(plan?.enrichmentPublished)
      + byteLen(plan?.enrichmentPublishHistory)
      + byteLen(plan?.teachingKit);
    covers += byteLen(plan?.coverImageUrl) + byteLen(plan?.coverImage) + byteLen(plan?.cover);
    const clone = { ...plan };
    delete clone.dailyPlans;
    delete clone.objectives;
    delete clone.weeklyOverview;
    delete clone.vocabularyWords;
    delete clone.weeklyMaterials;
    delete clone.materials;
    delete clone.enrichmentDraft;
    delete clone.enrichmentPublished;
    delete clone.enrichmentPublishHistory;
    delete clone.teachingKit;
    delete clone.coverImageUrl;
    delete clone.coverImage;
    delete clone.cover;
    otherPlanFields += byteLen(clone);
  }
  return [
    sectionRow("siteContent.curriculum.lessonPlans", lessonPlans, totalBytes),
    sectionRow("siteContent.curriculum.activities", curriculum.activities || [], totalBytes),
    sectionRow("siteContent.curriculum.series", curriculum.series || [], totalBytes),
    sectionRow("siteContent.curriculum.resources", curriculum.resources || [], totalBytes),
    {
      section: "lessonPlans.dailyPlans (sum)",
      bytes: dailyPlans,
      mb: mb(dailyPlans),
      percent: pct(dailyPlans, totalBytes),
      classification: "A/E",
    },
    {
      section: "lessonPlans.enrichment+teachingKit (sum)",
      bytes: enrichmentAll,
      mb: mb(enrichmentAll),
      percent: pct(enrichmentAll, totalBytes),
      classification: "C/E",
    },
    {
      section: "lessonPlans.objectives+overview+vocab (sum)",
      bytes: objectives,
      mb: mb(objectives),
      percent: pct(objectives, totalBytes),
      classification: "A",
    },
    {
      section: "lessonPlans.materials fields (sum)",
      bytes: materials,
      mb: mb(materials),
      percent: pct(materials, totalBytes),
      classification: "A",
    },
    {
      section: "lessonPlans.cover fields (sum)",
      bytes: covers,
      mb: mb(covers),
      percent: pct(covers, totalBytes),
      classification: "D/E",
    },
    {
      section: "lessonPlans.other fields (sum)",
      bytes: otherPlanFields,
      mb: mb(otherPlanFields),
      percent: pct(otherPlanFields, totalBytes),
      classification: "A",
    },
  ];
}

function topLevelSections(store, totalBytes) {
  const keys = Object.keys(store || {});
  const rows = keys.map((k) => sectionRow(k, store[k], totalBytes));
  rows.sort((a, b) => b.bytes - a.bytes);
  // Ensure siteContent.curriculum appears even though nested
  const curriculum = sectionRow("siteContent.curriculum", store?.siteContent?.curriculum || {}, totalBytes);
  const siteContent = sectionRow("siteContent", store?.siteContent || {}, totalBytes);
  return { topLevel: rows, siteContent, curriculum };
}

function analyzeStore(store, meta = {}) {
  const totalBytes = byteLen(store);
  const { topLevel, siteContent, curriculum } = topLevelSections(store, totalBytes);
  const curriculumDetail = curriculumSubBreakdown(store, totalBytes);
  const nodes = [];
  walkLargest(store, "$", nodes, 0, 6);
  const inlineMedia = [];
  scanInlineMedia(store, "$", inlineMedia, 0, 8);
  inlineMedia.sort((a, b) => b.bytes - a.bytes);
  const enrichment = enrichmentHistoryAudit(store);
  const duplication = duplicationSignals(store);
  const lessons = lessonPlanRows(store);
  const activities = activityRows(store);

  const ge1pct = topLevel.filter((r) => r.percent >= 1);

  return {
    meta: {
      ...meta,
      generatedAt: new Date().toISOString(),
      mode: "read-only",
      measurement: "Buffer.byteLength(JSON.stringify(value), 'utf8')",
    },
    totals: {
      totalBytes,
      totalMb: mb(totalBytes),
      topLevelKeyCount: Object.keys(store || {}).length,
      lessonPlanCount: lessons.length,
      activityCount: activities.length,
    },
    topLevelBreakdown: topLevel,
    sectionsAtLeastOnePercent: ge1pct,
    siteContent,
    curriculum,
    curriculumDetail,
    largestLessonPlans: lessons.slice(0, 25).map((r) => ({
      id: r.id,
      title: r.title,
      bytes: r.bytes,
      mb: r.mb,
      dailyPlansBytes: r.dailyPlansBytes,
      teachingKitBytes: r.teachingKitBytes,
      enrichmentDraftBytes: r.enrichmentDraftBytes,
      enrichmentPublishedBytes: r.enrichmentPublishedBytes,
      enrichmentHistoryBytes: r.enrichmentHistoryBytes,
      hasInlineMediaHint: r.hasInlineMediaHint,
    })),
    largestActivities: activities.slice(0, 25),
    largestArrays: topByType(nodes, "array", 20),
    largestStrings: topByType(nodes, "string", 20),
    largestObjects: topByType(nodes, "object", 20),
    inlineMedia: {
      count: inlineMedia.length,
      totalBytes: inlineMedia.reduce((s, x) => s + x.bytes, 0),
      totalMb: mb(inlineMedia.reduce((s, x) => s + x.bytes, 0)),
      largest: inlineMedia.slice(0, 20),
    },
    enrichmentHistory: enrichment,
    duplication,
    classificationLegend: {
      A: "core runtime data",
      B: "reproducible/derived data",
      C: "historical/audit data",
      D: "media/base64/blob-like data",
      E: "candidate for separate persistence",
    },
  };
}

async function loadFromPostgres(recordId) {
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL required for --postgres");
  // Safety: refuse obvious write-mode flags if someone sets them.
  if (process.env.LLH_STORE_AUDIT_ALLOW_WRITE === "1") {
    throw new Error("Refusing to run: LLH_STORE_AUDIT_ALLOW_WRITE must not be set for this audit tool.");
  }
  const { Client } = require("pg");
  const client = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
  });
  await client.connect();
  try {
    // Read-only session guards where supported.
    try {
      await client.query("SET default_transaction_read_only = on");
      await client.query("SET statement_timeout = 120000");
    } catch {
      /* older/managed PG may ignore */
    }
    const meta = await client.query(
      `SELECT id,
              pg_column_size(data)::bigint AS column_bytes,
              octet_length(data::text)::bigint AS text_bytes,
              updated_at
       FROM llh_store
       WHERE id = $1`,
      [recordId],
    );
    if (!meta.rows.length) throw new Error(`No llh_store row for id=${recordId}`);
    const row = meta.rows[0];
    const dataRes = await client.query(`SELECT data FROM llh_store WHERE id = $1`, [recordId]);
    const store = dataRes.rows[0].data;
    return {
      store,
      postgresMeta: {
        id: row.id,
        pgColumnSizeBytes: Number(row.column_bytes),
        jsonbTextOctetLength: Number(row.text_bytes),
        updatedAt: row.updated_at,
      },
    };
  } finally {
    await client.end();
  }
}

function loadFromFile(filePath) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, "utf8");
  const parsed = JSON.parse(raw);
  // Accept either raw store or { store: {...} } / backup wrappers.
  const store = parsed?.store && typeof parsed.store === "object" && !parsed.users
    ? parsed.store
    : parsed?.data && typeof parsed.data === "object" && !parsed.users
      ? parsed.data
      : parsed;
  if (!store || typeof store !== "object") throw new Error("File did not contain a store object");
  return {
    store,
    fileMeta: {
      path: abs,
      fileBytes: Buffer.byteLength(raw, "utf8"),
      sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    },
  };
}

function printSummary(report) {
  const t = report.totals;
  console.log(`TOTAL serialized store: ${t.totalBytes} bytes (${t.totalMb} MB)`);
  if (report.meta.postgresMeta) {
    console.log(
      `Postgres pg_column_size(data)=${report.meta.postgresMeta.pgColumnSizeBytes}`
      + ` jsonb text octets=${report.meta.postgresMeta.jsonbTextOctetLength}`
      + ` updated_at=${report.meta.postgresMeta.updatedAt}`,
    );
  }
  console.log("\nTop sections:");
  for (const row of report.topLevelBreakdown.slice(0, 15)) {
    console.log(
      `  ${row.percent.toFixed(2).padStart(6)}%  ${String(row.mb).padStart(8)} MB  ${row.section}  [${row.classification}]`,
    );
  }
  console.log("\nCurriculum detail:");
  for (const row of report.curriculumDetail.slice(0, 12)) {
    console.log(
      `  ${Number(row.percent || 0).toFixed(2).padStart(6)}%  ${String(row.mb).padStart(8)} MB  ${row.section}`,
    );
  }
  const largest = report.largestLessonPlans[0];
  if (largest) {
    console.log(`\nLargest lesson plan: ${largest.id} (${largest.mb} MB) title=${JSON.stringify(largest.title)}`);
  }
  console.log(
    `\nInline media: count=${report.inlineMedia.count} total=${report.inlineMedia.totalMb} MB`,
  );
  console.log(
    `Enrichment history bytes: ${report.enrichmentHistory.totalEnrichmentHistoryBytes}`
    + ` (${mb(report.enrichmentHistory.totalEnrichmentHistoryBytes)} MB)`,
  );
  console.log(
    `Active enrichment (draft+published): ${report.enrichmentHistory.totalActiveEnrichmentBytes}`
    + ` (${mb(report.enrichmentHistory.totalActiveEnrichmentBytes)} MB)`,
  );
  console.log(
    `Teaching-kit related total: ${report.enrichmentHistory.totalTeachingKitRelatedBytes}`
    + ` (${mb(report.enrichmentHistory.totalTeachingKitRelatedBytes)} MB)`,
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.file && !args.postgres)) {
    console.log(`Read-only llh_store size audit.

Usage:
  node scripts/audit-llh-store-size-breakdown.js --file store.json [--out report.json]
  PRODUCTION_DATABASE_URL=... node scripts/audit-llh-store-size-breakdown.js --postgres [--out report.json]

This tool never writes to the database or the store.`);
    process.exit(args.help ? 0 : 1);
  }

  let store;
  let meta = {};
  if (args.postgres) {
    const loaded = await loadFromPostgres(args.recordId);
    store = loaded.store;
    meta.postgresMeta = loaded.postgresMeta;
    meta.source = "postgres-select-only";
  } else {
    const loaded = loadFromFile(args.file);
    store = loaded.store;
    meta.fileMeta = loaded.fileMeta;
    meta.source = "file";
  }

  // Byte-identity check for file mode: re-serialize and compare hash of canonical JSON
  // is not stable for key order; for file mode compare input parse round-trip size only.
  const beforeBytes = byteLen(store);
  const report = analyzeStore(store, meta);
  const afterBytes = byteLen(store);
  if (beforeBytes !== afterBytes) {
    throw new Error(`Audit mutated in-memory store size (${beforeBytes} -> ${afterBytes})`);
  }
  report.meta.storeUnchangedBytes = beforeBytes === afterBytes;

  printSummary(report);
  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nWrote report: ${outPath}`);
  }
}

main().catch((error) => {
  console.error("AUDIT FAILED:", error.message || error);
  process.exit(1);
});

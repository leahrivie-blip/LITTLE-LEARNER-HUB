#!/usr/bin/env node
/**
 * PRO CURRICULUM UPGRADE AUDIT (read-only).
 *
 * Source of truth for membership: live production public library (plan === "Pro").
 * Content depth: matched Master Paste import files + public activity metadata.
 * Does NOT write to production curriculum.
 *
 * Usage:
 *   node scripts/audit-pro-curriculum-upgrade.js
 *   LLH_PROD_URL=https://littlelearnershubbyleah.com node scripts/audit-pro-curriculum-upgrade.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const OUT_DIR =
  process.env.LLH_ARTIFACT_DIR ||
  path.join("/opt/cursor/artifacts/pro-curriculum-upgrade-audit");
const DOCS_OUT = path.join(ROOT, "docs/audits");
const PROD_URL = String(
  process.env.LLH_PROD_URL || process.env.SITE_URL || "https://littlelearnershubbyleah.com",
).replace(/\/$/, "");

const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
let parseV5 = null;
try {
  ({ parseCurriculumLessonPlanImportV5: parseV5 } = require("./curriculum-lesson-import-v4.js"));
} catch {
  parseV5 = null;
}
const {
  auditLessonPlanAgainstStandards,
  resolveAgeBand,
} = require("./curriculum-standards.js");

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const GENERIC_SENSORY_RE =
  /\b(sensory bin|sensory table|kinetic sand|water bin|rice bin|oat bin)\b/i;
const WORKSHEET_RE =
  /\b(worksheet|trace the|coloring page|cut out|cut-and-paste|matching worksheet|letter tracing|number tracing)\b/i;
const INFANT_RISK_RE =
  /\b(scissors|glue stick|worksheet|sorting|matching cards|small beads|pom-?poms|googly eyes|hot glue|stapler)\b/i;
const TODDLER_RISK_RE =
  /\b(complex tracing|multi-step craft|worksheet|memorize|write your name|cut detailed)\b/i;
const GENERIC_TEMPLATE_RE =
  /practice .+ skills during|explore .+ during our .+ week through|prepare a toddler-ready space and materials for|prepare a preschool-ready space|join play briefly as a co-player/i;

function titleEchoes(title, value) {
  const t = text(title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const s = text(value).toLowerCase();
  if (!t || !s) return false;
  return s.includes(t) && s.length <= t.length + 90;
}

function text(v) {
  return String(v == null ? "" : v).trim();
}

function requestJson(urlPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, PROD_URL);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "GET",
        headers: { Accept: "application/json" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: res.statusCode, json: JSON.parse(raw) });
          } catch (err) {
            reject(new Error(`Non-JSON from ${urlPath}: ${raw.slice(0, 120)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function bandFromAge(age) {
  const a = text(age).toLowerCase();
  if (a.includes("infant")) return "infant";
  if (a.includes("toddler")) return "toddler";
  if (a.includes("preschool") || a.includes("pre-k") || a.includes("prek")) return "preschool";
  return "other";
}

function walkTxt(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTxt(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".txt")) acc.push(full);
  }
  return acc;
}

function extractTitleFromImport(raw) {
  const m = String(raw || "").match(/^TITLE:\s*\n?([^\n]+)/m);
  if (m) return text(m[1]);
  const m2 = String(raw || "").match(/^TITLE:\s*(.+)$/m);
  return text(m2 && m2[1]);
}

function collectImportIndex() {
  const dirs = walkTxt(path.join(ROOT, "scripts")).filter((f) =>
    /curriculum-.*imports/.test(f),
  );
  const byStableId = new Map();
  const byTitle = new Map();
  for (const file of dirs) {
    const base = path.basename(file, ".txt");
    const raw = fs.readFileSync(file, "utf8");
    const title = extractTitleFromImport(raw);
    // Guess stable id from path conventions
    let stableId = "";
    if (/^cur-lp-/.test(base)) stableId = base;
    else if (base.startsWith("infant-") || base.startsWith("toddler-") || base.startsWith("preschool-")) {
      stableId = `cur-lp-${base.replace(/-pro$/, "").replace(/-free$/, "")}`;
    } else {
      const cleaned = base
        .replace(/^\d+-/, "")
        .replace(/-pro$/, "")
        .replace(/-free$/, "")
        .replace(/-featured$/, "");
      if (/^(infant|toddler|preschool)-/.test(cleaned)) stableId = `cur-lp-${cleaned}`;
    }
    const entry = { file, title, stableId, size: raw.length };
    if (stableId) byStableId.set(stableId, entry);
    if (title) {
      const key = title.toLowerCase();
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(entry);
    }
  }
  return { byStableId, byTitle, files: dirs };
}

function parseImportFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed = parseCurriculumLessonPlanImport(raw);
  if ((!parsed || !parsed.ok) && parseV5) {
    try {
      parsed = parseV5(raw);
    } catch {
      /* keep first */
    }
  }
  return { raw, parsed };
}

function activityFieldStrength(item) {
  const keys = [
    "objective",
    "description",
    "materials",
    "setup",
    "steps",
    "directions",
    "teacherRole",
    "teacherLanguage",
    "observationOpportunities",
    "adaptations",
    "safetyNotes",
    "extensions",
    "ageModifications",
    "vocabulary",
  ];
  let present = 0;
  let thin = 0;
  const missing = [];
  for (const key of keys) {
    const v = item[key];
    const t = Array.isArray(v) ? v.join(" ") : text(v);
    if (!t) {
      missing.push(key);
      continue;
    }
    present += 1;
    if (t.length < 24) thin += 1;
  }
  return { present, thin, missing, score: present / keys.length };
}

function classifyActivities(items, band) {
  const stay = [];
  const improve = [];
  const replace = [];
  for (const item of items) {
    const title = text(item.title || item.name);
    const objective = text(item.objective);
    const description = text(item.description);
    const steps = text(item.steps || item.directions);
    const questions = text(item.teacherLanguage || item.questions);
    const blob = [title, objective, description, steps, item.materials].map(text).join("\n");
    const strength = activityFieldStrength(item);
    const risks = [];
    if (band === "infant" && INFANT_RISK_RE.test(blob)) risks.push("infant_risk_material_or_task");
    if (band === "toddler" && TODDLER_RISK_RE.test(blob)) risks.push("toddler_academic_risk");
    if (WORKSHEET_RE.test(blob)) risks.push("worksheet_like");
    if (GENERIC_SENSORY_RE.test(title) && (strength.score < 0.55 || GENERIC_TEMPLATE_RE.test(blob))) {
      risks.push("generic_sensory_thin");
    }
    if (GENERIC_TEMPLATE_RE.test(objective) || GENERIC_TEMPLATE_RE.test(description) || GENERIC_TEMPLATE_RE.test(text(item.setup))) {
      risks.push("generic_ai_template");
    }
    if (titleEchoes(title, objective) && titleEchoes(title, description)) risks.push("title_echo_filler");
    if (!questions) risks.push("missing_questions");
    if (!text(item.vocabulary)) risks.push("missing_vocab");
    if (strength.present < 6) risks.push("thin_fields");
    if (strength.thin >= 5) risks.push("one_line_filler");
    if (steps.length < 80) risks.push("thin_steps");

    const row = { title, category: text(item.activityCategory || item.category), strength, risks };
    const replaceHit = risks.some((r) =>
      [
        "infant_risk_material_or_task",
        "toddler_academic_risk",
        "worksheet_like",
        "generic_sensory_thin",
        "generic_ai_template",
        "title_echo_filler",
      ].includes(r),
    );
    if (replaceHit) replace.push(row);
    else if (
      risks.includes("thin_fields") ||
      risks.includes("one_line_filler") ||
      risks.includes("missing_questions") ||
      risks.includes("missing_vocab") ||
      risks.includes("thin_steps") ||
      strength.score < 0.75
    ) {
      improve.push(row);
    } else {
      stay.push(row);
    }
  }
  return { stay, improve, replace };
}

function weeklyGaps(plan) {
  const gaps = [];
  const checks = [
    ["weeklyOverview", plan.weeklyOverview],
    ["objectives", plan.objectives],
    ["weeklyMaterials", plan.weeklyMaterials],
    ["vocabularyWords", plan.vocabularyWords || plan.vocabulary],
    ["books", plan.books],
    ["songs", plan.songs],
    ["familyConnection", plan.familyConnection],
    ["observationOpportunities", plan.observationOpportunities],
    ["adaptations", plan.adaptations],
    ["teacherToolkit / prep", plan.teacherToolkit || plan.prepChecklist || plan.teacherPrep],
  ];
  for (const [label, value] of checks) {
    const t = Array.isArray(value) ? value.filter(Boolean).join("; ") : text(value);
    if (!t) gaps.push(label);
    else if (t.length < 40 && !["books", "songs"].includes(label.split(" ")[0])) gaps.push(`${label} (thin)`);
  }
  return gaps;
}

function booksStatus(books) {
  const list = Array.isArray(books) ? books : text(books) ? [books] : [];
  if (!list.length) return "missing";
  const joined = list.map((b) => (typeof b === "string" ? b : b.title || JSON.stringify(b))).join(" | ");
  if (/tbd|todo|placeholder|add book/i.test(joined)) return "placeholder";
  if (list.length < 2) return "thin";
  return "present";
}

function songsStatus(songs) {
  const list = Array.isArray(songs) ? songs : text(songs) ? [songs] : [];
  if (!list.length) return "missing";
  const joined = list.map((s) => (typeof s === "string" ? s : s.title || JSON.stringify(s))).join(" | ");
  if (/tbd|todo|placeholder/i.test(joined)) return "placeholder";
  if (list.length < 2) return "thin";
  return "present";
}

function coverAssessment(plan) {
  const url = text(plan.coverImageUrl);
  const alt = text(plan.coverImageAlt);
  const source = text(plan.coverImageSource);
  let style = "unknown";
  if (!url) style = "missing";
  else if (/illustrat/i.test(alt)) style = "illustrated_storybook";
  else if (/\.svg(\?|$)/i.test(url) || /generic-(infant|toddler|preschool)/i.test(url)) style = "generic_svg_stock";
  else if (/\/images\/lesson-covers\//i.test(url)) style = "static_catalog_likely_illustrated";
  else if (/\/api\/media\/lesson-covers\//i.test(url)) style = "uploaded_media_likely_illustrated";
  else style = "has_cover_unclassified";
  return {
    hasCover: Boolean(url),
    coverImageUrl: url,
    coverImageAlt: alt,
    coverImageSource: source,
    coverStyle: style,
    needsRealisticCoverUpgrade:
      style === "missing" ||
      style === "illustrated_storybook" ||
      style === "generic_svg_stock" ||
      style === "static_catalog_likely_illustrated" ||
      style === "uploaded_media_likely_illustrated",
  };
}

function proposedCoverFromActivities(titles, band, lessonTitle) {
  const art = titles.find((t) => /\b(paint|art|print|stamp|collage|handprint|footprint|crayon)\b/i.test(t));
  const sensory = titles.find((t) => /\b(sensory|bin|tray|sand|water|texture)\b/i.test(t));
  const dramatic = titles.find((t) => /\b(clinic|vet|camp|shop|kitchen|helpers|dramatic|pretend)\b/i.test(t));
  const stem = titles.find((t) => /\b(build|construct|engineer|science|experiment|ramp|block)\b/i.test(t));
  const pick = dramatic || art || stem || sensory || titles[0] || lessonTitle;
  return {
    proposedCoverActivity: pick,
    proposedImageRequest: `Realistic childcare classroom photo (not illustration) of the finished setup or child-made result for “${pick}” (${band}). Hands-focused or setup-focused framing preferred. Natural lighting, ordinary daycare materials, slight real-world mess OK. Include small footer text: littlelearnershubbyleah.com`,
  };
}

function priorityFromSignals(row) {
  let score = 0;
  const replaceN = (row.activitiesToReplace || []).length;
  const improveN = (row.activitiesToImprove || []).length;
  const actN = Math.max(1, row.activityCount || 1);
  const replacePct = replaceN / actN;
  const improvePct = improveN / actN;
  const isGenericRebuild = row.currentQuality === "generic_template_rebuild" || replacePct >= 0.7;

  if (isGenericRebuild) score += 12;
  else if (replacePct >= 0.4) score += 7;
  else if (replaceN >= 4) score += 5;
  else if (replaceN >= 1) score += 2;

  // Missing questions/vocab across most activities = Teaching Kit incomplete, not always full rebuild
  if (!isGenericRebuild && improvePct >= 0.85) score += 3;
  else if (!isGenericRebuild && improvePct >= 0.5) score += 2;

  if (!row.importMatched) score += 5; // production-only unknowns need admin QA first
  if (row.booksStatus === "missing" || row.songsStatus === "missing") score += 2;
  if (row.familyConnectionStatus === "missing") score += 1;
  if ((row.linkedPrintableCount || 0) === 0) score += 1;
  if ((row.activityImageCountEstimate || 0) === 0) score += 1;
  if (row.coverAssessment?.needsRealisticCoverUpgrade) score += 1;
  if ((row.missingWeeklySections || []).length >= 3) score += 2;
  if (row.standards?.completeness === "incomplete" || row.standards?.level === "critical") score += 3;
  if ((row.safetyAgeConcerns || []).length) score += 2;
  if (row.activityCount >= 28) score += 1;
  // Former Free → Pro need premium Teaching Kit depth, but not automatic major rebuild
  if (row.likelyFormerFreeTemplate && !isGenericRebuild) score += 2;
  if (row.currentQuality === "weak_or_thin") score += 4;

  if (score >= 11) return { priority: 1, label: "Needs major rebuild" };
  if (score >= 5) return { priority: 2, label: "Good foundation but incomplete" };
  return { priority: 3, label: "Mostly strong; polish only" };
}

function researchIdeas(band, title) {
  const t = title.toLowerCase();
  const common = {
    infant: [
      "Caregiver-facing floor play with one focal object",
      "Supported tummy time / reaching / tracking",
      "Safe sealed sensory bags or large soft textures",
      "Face-to-face songs, peekaboo, mirror talk",
      "Avoid crafts-with-products and small loose parts",
    ],
    toddler: [
      "Short sensory invitations with large tools",
      "Simple dramatic play props (2–4 roles max)",
      "Process art: stamp, sponge, handprint, collage",
      "Gross-motor theme movement games",
      "Avoid worksheets, tracing accuracy, long circle",
    ],
    preschool: [
      "Open-ended building / STEM challenges",
      "Dramatic play center with reusable labels/signs",
      "Simple sorting/matching games (not worksheet packets)",
      "Observation science + documentation language",
      "Collaborative process art and outdoor investigation",
    ],
  };
  const ideas = [...(common[band] || common.preschool)];
  if (/vet|pet/.test(t)) ideas.unshift("Vet clinic dramatic play with stuffed pets, washable bandages, waiting-room props");
  if (/construct|build|engineer/.test(t)) ideas.unshift("Block/cardboard building + vehicle ramps + tire-track process art");
  if (/weather|season|cloud|rain/.test(t)) ideas.unshift("Outdoor sky watch + dress-the-weather play + water/cloud sensory");
  if (/farm|zoo|animal|insect|bug|dinosaur/.test(t)) ideas.unshift("Animal movement paths + habitat trays + sound matching (not generic rice bin only)");
  if (/music|song|nursery|lullab/.test(t)) ideas.unshift("Instrument exploration, scarf movement, call-and-response songs");
  if (/family|grandfriend|home|belong|caring|people who love/.test(t)) ideas.unshift("Photo talk, gentle caregiving prop play, belonging songs");
  if (/apple|orchard|fall|leaf/.test(t)) ideas.unshift("Apple wash/sort, leaf stomping art, orchard pretend play");
  if (/space|STEM|science|invent|archaeolog/.test(t)) ideas.unshift("Hands-on cause/effect experiments with everyday materials");
  if (/water|ice cream|camp|pirate|superhero/.test(t)) ideas.unshift("Theme dramatic play + outdoor/gross-motor version of the same idea");
  return ideas.slice(0, 6);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(DOCS_OUT, { recursive: true });

  let site;
  const cachePath = "/tmp/llh-site.json";
  if (fs.existsSync(cachePath) && !process.env.LLH_FORCE_FETCH) {
    site = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } else {
    const res = await requestJson("/api/site-content");
    site = res.json;
    fs.writeFileSync(cachePath, JSON.stringify(site));
  }

  const lib = site.siteContent?.curriculumLibrary || {};
  const plans = (lib.lessonPlans || []).filter((p) => p && p.plan === "Pro");
  const activities = lib.activities || [];
  const resources = lib.resources || [];

  const actsByPlan = new Map();
  for (const a of activities) {
    const id = a.lessonPlanId;
    if (!id) continue;
    if (!actsByPlan.has(id)) actsByPlan.set(id, []);
    actsByPlan.get(id).push(a);
  }
  const resByPlan = new Map();
  for (const r of resources) {
    for (const id of r.lessonPlanIds || []) {
      if (!resByPlan.has(id)) resByPlan.set(id, []);
      resByPlan.get(id).push(r);
    }
  }

  const importIndex = collectImportIndex();
  const rows = [];

  for (const plan of plans) {
    const band = bandFromAge(plan.age);
    const linkedActs = actsByPlan.get(plan.id) || [];
    const dayCounts = Object.fromEntries(WEEKDAYS.map((d) => [d, 0]));
    for (const a of linkedActs) {
      const d = text(a.dayOfWeek).toLowerCase();
      if (dayCounts[d] != null) dayCounts[d] += 1;
    }
    const weekdayCoverage = WEEKDAYS.filter((d) => dayCounts[d] > 0);
    const titles = linkedActs.map((a) => text(a.title)).filter(Boolean);

    let importEntry =
      importIndex.byStableId.get(plan.id) ||
      null;
    if (!importEntry) {
      const titleHits = importIndex.byTitle.get(text(plan.title).toLowerCase()) || [];
      // Prefer age-matching path
      importEntry =
        titleHits.find((h) => h.file.includes(`/${band}`) || h.file.includes(`${band}-`) || h.stableId.includes(band)) ||
        titleHits[0] ||
        null;
    }

    let parsedPlan = null;
    let standards = null;
    let activityClass = { stay: [], improve: [], replace: [] };
    let missingWeekly = [];
    let books = "unknown_no_import";
    let songs = "unknown_no_import";
    let family = "unknown_no_import";
    let safety = [];
    let likelyFormerFreeTemplate = false;

    if (importEntry) {
      const { parsed } = parseImportFile(importEntry.file);
      if (parsed?.ok && parsed.data) {
        parsedPlan = parsed.data;
        if (text(parsedPlan.plan) === "Free") likelyFormerFreeTemplate = true;
        standards = auditLessonPlanAgainstStandards(parsedPlan, { source: importEntry.file });
        const items = [];
        for (const day of WEEKDAYS) {
          const dayItems = parsedPlan.dailyPlans?.[day]?.items || [];
          for (const item of dayItems) items.push({ ...item, _day: day });
        }
        activityClass = classifyActivities(items, band);
        missingWeekly = weeklyGaps(parsedPlan);
        books = booksStatus(parsedPlan.books);
        songs = songsStatus(parsedPlan.songs);
        family = text(parsedPlan.familyConnection) ? (text(parsedPlan.familyConnection).length < 40 ? "thin" : "present") : "missing";
        if (band === "infant") {
          for (const r of activityClass.replace) {
            if (r.risks.includes("infant_risk_material_or_task")) {
              safety.push(`Activity “${r.title}” may be too advanced/unsafe for infants`);
            }
          }
        }
      } else {
        missingWeekly.push("import_parse_failed");
      }
    }

    const cover = coverAssessment(plan);
    const linkedRes = resByPlan.get(plan.id) || [];
    const printableLike = linkedRes.filter((r) =>
      /print|card|sign|guide|strip|label|board/i.test(`${r.title} ${r.resourceCategory}`),
    );
    // Public DTO does not expose activity images for locked Pro; estimate from resource titles linked as activity examples
    const activityImageEstimate = linkedRes.filter((r) =>
      /example|activity image|setup|art/i.test(`${r.title} ${r.description || ""}`),
    ).length;

    const proposed = proposedCoverFromActivities(titles, band, plan.title);
    const research = researchIdeas(band, plan.title);

    const rowBase = {
      id: plan.id,
      title: plan.title,
      age: plan.age,
      ageBand: band,
      status: plan.status,
      theme: plan.theme,
      activityCount: plan.activityCount || linkedActs.length,
      weekdayCoverage,
      dayCounts,
      teachingKitStatus: "public_preview_locked_quality_null",
      coverAssessment: cover,
      activityImageCountEstimate: activityImageEstimate,
      linkedPrintableCount: printableLike.length,
      linkedResourceCount: linkedRes.length,
      linkedResourceTitles: linkedRes.map((r) => r.title),
      booksStatus: books,
      songsStatus: songs,
      familyConnectionStatus: family,
      importMatched: Boolean(importEntry),
      importPath: importEntry?.file || null,
      likelyFormerFreeTemplate,
      missingWeeklySections: missingWeekly,
      activitiesToStay: activityClass.stay.map((a) => a.title),
      activitiesToImprove: activityClass.improve.map((a) => a.title),
      activitiesToReplace: activityClass.replace.map((a) => a.title),
      activityTitles: titles,
      activityCategories: linkedActs.reduce((acc, a) => {
        const c = text(a.activityCategory) || "(none)";
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {}),
      activityIdeasResearched: research,
      currentCover: cover.coverImageUrl || "(none)",
      proposedCoverActivity: proposed.proposedCoverActivity,
      proposedImageRequest: proposed.proposedImageRequest,
      safetyAgeConcerns: safety,
      standards: standards
        ? {
            complete: standards.complete,
            level: standards.level,
            completeness: standards.completeness,
            issueCount: (standards.issues || []).length,
            criticalCount: (standards.issues || []).filter((i) => i.level === "critical").length,
          }
        : null,
      incompleteFields: [],
      qualityBlockers: [],
    };

    if (!importEntry) {
      rowBase.incompleteFields.push("Full activity detail not readable without admin (locked Pro DTO)");
      rowBase.qualityBlockers.push("Needs admin hydrate for Teaching Kit field-level QA");
    }
    if (cover.needsRealisticCoverUpgrade) {
      rowBase.qualityBlockers.push("Cover is illustrated/generic — replace with realistic activity/example image");
    }
    if (rowBase.linkedPrintableCount === 0) {
      rowBase.incompleteFields.push("No linked printables/resources in public library");
    }
    if (rowBase.activityImageCountEstimate === 0) {
      rowBase.incompleteFields.push("No clearly linked activity-example images in public resources");
    }
    if (books === "missing" || books === "thin") rowBase.qualityBlockers.push(`Books ${books}`);
    if (songs === "missing" || songs === "thin") rowBase.qualityBlockers.push(`Songs ${songs}`);
    if (family === "missing" || family === "thin") rowBase.qualityBlockers.push(`Family connection ${family}`);
    if (missingWeekly.length) rowBase.qualityBlockers.push(`Weekly gaps: ${missingWeekly.slice(0, 5).join(", ")}`);
    if (activityClass.replace.length) {
      rowBase.qualityBlockers.push(`${activityClass.replace.length} activities flagged for replacement`);
    }

    // Heuristic current quality label
    let currentQuality = "unknown";
    const replacePct = rowBase.activityCount
      ? rowBase.activitiesToReplace.length / rowBase.activityCount
      : 0;
    if (importEntry && standards) {
      if (replacePct >= 0.7) currentQuality = "generic_template_rebuild";
      else if (
        standards.complete &&
        rowBase.activitiesToReplace.length === 0 &&
        rowBase.activitiesToImprove.length <= 3 &&
        missingWeekly.length <= 1
      ) {
        currentQuality = "strong_foundation";
      } else if (standards.complete || rowBase.activitiesToStay.length >= Math.max(4, Math.floor(rowBase.activityCount * 0.25))) {
        currentQuality = "usable_but_incomplete";
      } else {
        currentQuality = "weak_or_thin";
      }
    } else if (!importEntry) {
      currentQuality = "production_live_content_locked_for_audit";
    } else {
      currentQuality = "import_parse_issue";
    }
    rowBase.currentQuality = currentQuality;

    if (currentQuality === "generic_template_rebuild") {
      rowBase.qualityBlockers.unshift("Majority of activities use generic AI template wording — rebuild for Teaching Kit standard");
    }

    const pri = priorityFromSignals(rowBase);
    rowBase.overallPriority = pri.priority;
    rowBase.overallPriorityLabel = pri.label;

    rows.push(rowBase);
  }

  rows.sort((a, b) => a.overallPriority - b.overallPriority || a.ageBand.localeCompare(b.ageBand) || a.title.localeCompare(b.title));

  const summary = {
    generatedAt: new Date().toISOString(),
    productionUrl: PROD_URL,
    proLessonCount: rows.length,
    byBand: {
      infant: rows.filter((r) => r.ageBand === "infant").length,
      toddler: rows.filter((r) => r.ageBand === "toddler").length,
      preschool: rows.filter((r) => r.ageBand === "preschool").length,
      other: rows.filter((r) => r.ageBand === "other").length,
    },
    byPriority: {
      1: rows.filter((r) => r.overallPriority === 1).length,
      2: rows.filter((r) => r.overallPriority === 2).length,
      3: rows.filter((r) => r.overallPriority === 3).length,
    },
    importMatchRate: `${rows.filter((r) => r.importMatched).length}/${rows.length}`,
    coversNeedingUpgrade: rows.filter((r) => r.coverAssessment.needsRealisticCoverUpgrade).length,
    withLinkedPrintables: rows.filter((r) => r.linkedPrintableCount > 0).length,
    notes: [
      "Audit is READ-ONLY. No production curriculum writes were performed.",
      "Pro activity bodies are locked on the public API; field-level stay/improve/replace uses matched Master Paste imports when available.",
      "Lessons without a matched import need Owner Admin hydrate for definitive Teaching Kit scoring.",
      "Almost all Pro covers currently use illustrated/storybook imagery (coverImageAlt often 'Illustration for …').",
    ],
  };

  const jsonPath = path.join(OUT_DIR, "pro-curriculum-upgrade-audit.json");
  const docsJson = path.join(DOCS_OUT, "pro-curriculum-upgrade-audit.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, lessons: rows }, null, 2));
  fs.writeFileSync(docsJson, JSON.stringify({ summary, lessons: rows }, null, 2));

  // Markdown report
  const lines = [];
  lines.push("# PRO Curriculum Upgrade Audit");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Source: ${PROD_URL} public library (plan === Pro) + matched import files`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Pro lessons:** ${summary.proLessonCount}`);
  lines.push(`- **Infant / Toddler / Preschool:** ${summary.byBand.infant} / ${summary.byBand.toddler} / ${summary.byBand.preschool}`);
  lines.push(`- **Priority 1 / 2 / 3:** ${summary.byPriority[1]} / ${summary.byPriority[2]} / ${summary.byPriority[3]}`);
  lines.push(`- **Import-matched for deep field audit:** ${summary.importMatchRate}`);
  lines.push(`- **Covers needing realistic upgrade:** ${summary.coversNeedingUpgrade}`);
  lines.push(`- **Pro lessons with linked printables (public resources):** ${summary.withLinkedPrintables}`);
  lines.push("");
  lines.push("## Priority ranking");
  lines.push("");
  for (const p of [1, 2, 3]) {
    lines.push(`### PRIORITY ${p} — ${p === 1 ? "Needs major rebuild" : p === 2 ? "Good foundation but incomplete" : "Mostly strong; polish only"}`);
    lines.push("");
    for (const r of rows.filter((x) => x.overallPriority === p)) {
      lines.push(`- **${r.title}** (\`${r.id}\`) — ${r.ageBand} · ${r.activityCount} activities · quality: ${r.currentQuality}`);
    }
    lines.push("");
  }

  for (const band of ["infant", "toddler", "preschool"]) {
    lines.push(`## ${band.toUpperCase()} Pro lessons`);
    lines.push("");
    for (const r of rows.filter((x) => x.ageBand === band)) {
      lines.push(`### ${r.title}`);
      lines.push("");
      lines.push(`- **ID:** \`${r.id}\``);
      lines.push(`- **Age band:** ${r.age}`);
      lines.push(`- **Current quality:** ${r.currentQuality}`);
      lines.push(`- **Activity count:** ${r.activityCount}`);
      lines.push(`- **Weekday coverage:** ${r.weekdayCoverage.join(", ") || "(none)"} (${WEEKDAYS.map((d) => `${d[0].toUpperCase()}:${r.dayCounts[d]}`).join(" ")})`);
      lines.push(`- **Teaching Kit / readiness:** ${r.teachingKitStatus}`);
      lines.push(`- **Cover:** ${r.coverAssessment.hasCover ? "yes" : "no"} — style **${r.coverAssessment.coverStyle}**`);
      lines.push(`- **Current cover URL:** ${r.currentCover}`);
      lines.push(`- **Activity images (public estimate):** ${r.activityImageCountEstimate}`);
      lines.push(`- **Linked printables/resources:** ${r.linkedPrintableCount} printable-like / ${r.linkedResourceCount} total`);
      lines.push(`- **Books:** ${r.booksStatus}`);
      lines.push(`- **Songs:** ${r.songsStatus}`);
      lines.push(`- **Family connection:** ${r.familyConnectionStatus}`);
      lines.push(`- **Import matched:** ${r.importMatched ? r.importPath : "NO — production-only / title mismatch"}`);
      lines.push(`- **Activities that should stay:** ${r.activitiesToStay.slice(0, 12).join("; ") || "(see admin hydrate / keep strong theme activities)"}`);
      lines.push(`- **Activities that should be improved:** ${r.activitiesToImprove.slice(0, 12).join("; ") || "(none flagged from import)"}`);
      lines.push(`- **Activities that should be replaced:** ${r.activitiesToReplace.slice(0, 12).join("; ") || "(none flagged from import)"}`);
      lines.push(`- **Activity ideas researched:** ${r.activityIdeasResearched.join("; ")}`);
      lines.push(`- **Missing weekly sections:** ${r.missingWeeklySections.join("; ") || "(none detected)"}`);
      lines.push(`- **Proposed realistic cover activity:** ${r.proposedCoverActivity}`);
      lines.push(`- **Safety / age concerns:** ${r.safetyAgeConcerns.join("; ") || "(none flagged from import heuristics)"}`);
      lines.push(`- **Quality blockers:** ${r.qualityBlockers.join("; ") || "(none)"}`);
      lines.push(`- **Overall priority:** P${r.overallPriority} — ${r.overallPriorityLabel}`);
      lines.push("");
    }
  }

  lines.push("## Batch 1 recommendation (do not mutate until approved)");
  lines.push("");
  // Prefer highest-value fully generic theme rebuilds for Batch 1.
  const BATCH1_PREFERRED_IDS = [
    "cur-lp-toddler-pet-vet-clinic",
    "cur-lp-toddler-zoo-adventures",
    "cur-lp-toddler-camping-under-the-stars",
  ];
  const generic = rows.filter((r) => r.currentQuality === "generic_template_rebuild");
  const p1 = rows.filter((r) => r.overallPriority === 1);
  const batch1 = [];
  for (const id of BATCH1_PREFERRED_IDS) {
    const hit = rows.find((r) => r.id === id);
    if (hit) batch1.push(hit);
  }
  for (const r of generic) {
    if (batch1.length >= 3) break;
    if (!batch1.some((x) => x.id === r.id)) batch1.push(r);
  }
  for (const r of p1) {
    if (batch1.length >= 3) break;
    if (!batch1.some((x) => x.id === r.id)) batch1.push(r);
  }
  if (batch1.length < 3) {
    for (const r of rows.filter((x) => x.overallPriority === 2)) {
      if (batch1.length >= 3) break;
      if (!batch1.some((x) => x.id === r.id)) batch1.push(r);
    }
  }
  for (const r of batch1) {
    lines.push(`1. **${r.title}** (\`${r.id}\`) — ${r.ageBand} — ${r.overallPriorityLabel} — ${r.currentQuality}`);
  }
  lines.push("");
  lines.push("## Method notes");
  lines.push("");
  for (const n of summary.notes) lines.push(`- ${n}`);
  lines.push("");

  const mdPath = path.join(OUT_DIR, "pro-curriculum-upgrade-audit.md");
  const docsMd = path.join(DOCS_OUT, "pro-curriculum-upgrade-audit.md");
  fs.writeFileSync(mdPath, lines.join("\n"));
  fs.writeFileSync(docsMd, lines.join("\n"));

  const batchPath = path.join(OUT_DIR, "batch1-candidates.json");
  fs.writeFileSync(batchPath, JSON.stringify(batch1, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Docs: ${docsMd}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

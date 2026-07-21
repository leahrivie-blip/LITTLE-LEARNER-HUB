#!/usr/bin/env node
/**
 * Pre-import Gold Standard audit for new Infant/Toddler Pro lesson paste files.
 * Does NOT import or publish. Writes markdown + JSON report.
 */
const fs = require("fs");
const path = require("path");
const {
  parseCurriculumLessonPlanImport,
} = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");
const { buildCurriculumImportPreview } = require("./curriculum-import-preview.js");
const standards = require("./curriculum-standards.js");

const ROOT = path.join(__dirname, "..");
const BATCH_DIRS = [
  "scripts/curriculum-infant-pro-batch2-imports",
  "scripts/curriculum-toddler-pro-batch2-imports",
  "scripts/curriculum-toddler-pro-batch3-imports",
];
const COMPARE_DIRS = [
  "scripts/curriculum-infant-core-imports",
  "scripts/curriculum-toddler-core-imports",
  "scripts/curriculum-toddler-pro-imports",
  "scripts/curriculum-infant-holiday-imports",
  "scripts/curriculum-infant-summer-imports",
  "scripts/curriculum-toddler-holiday-imports",
  "scripts/curriculum-phase-2f-imports",
];

const ALLOWED_CATEGORIES = [
  "Circle Time",
  "Literacy",
  "Sensory Play",
  "Fine Motor",
  "Gross Motor",
  "Music & Movement",
  "Art",
  "STEM/Discovery",
  "Dramatic Play",
  "Outdoor Play",
  "Open-Ended Exploration",
];

function listTxt(dirRel) {
  const dir = path.join(ROOT, dirRel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".txt"))
    .map((name) => path.join(dir, name))
    .sort();
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(pro|free|lesson|plan|week|weekly|stem)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value) {
  return new Set(normalizeTitle(value).split(" ").filter((t) => t.length > 2));
}

function jaccard(a, b) {
  const A = titleTokens(a);
  const B = titleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function extractMeta(raw) {
  const grab = (key) => {
    const re = new RegExp(`(?:^|\\n)${key}\\s*:\\s*([^\\n]+)`, "i");
    const m = raw.match(re);
    return m ? m[1].trim() : "";
  };
  return {
    title: grab("TITLE"),
    ageGroup: grab("AGE_GROUP"),
    theme: grab("THEME"),
    plan: grab("PLAN"),
    status: grab("STATUS"),
    note: grab("NOTE"),
  };
}

function blankish(value) {
  const text = Array.isArray(value)
    ? value.map((v) => (typeof v === "object" ? (v.title || v.name || JSON.stringify(v)) : String(v || ""))).join(" ").trim()
    : String(value || "").trim();
  if (!text) return true;
  return /^(tbd|n\/a|todo|placeholder|coming soon|to be (added|filled|completed)|fill in|add here|\.+)$/i.test(text)
    || /full gold standard.+scaffold|to be expanded|subsequent commits/i.test(text);
}

function countDirections(activity) {
  const steps = activity?.steps || activity?.directions || [];
  if (Array.isArray(steps)) {
    const joined = steps.map((s) => String(s || "").trim()).filter(Boolean);
    if (joined.length >= 3) return joined.length;
    const text = joined.join("\n");
    const numbered = text.match(/(?:^|\n)\s*\d+[\).\]]\s+\S+/g);
    return numbered?.length || joined.length;
  }
  const text = String(steps || "");
  const numbered = text.match(/(?:^|\n)\s*\d+[\).\]]\s+\S+/g);
  if (numbered?.length) return numbered.length;
  return text.trim() ? 1 : 0;
}

function dayItems(dayPlan) {
  if (Array.isArray(dayPlan?.items) && dayPlan.items.length) return dayPlan.items;
  if (Array.isArray(dayPlan?.activities) && dayPlan.activities.length) return dayPlan.activities;
  return [];
}

function collectExistingTitles() {
  const existing = [];
  for (const dirRel of COMPARE_DIRS) {
    for (const file of listTxt(dirRel)) {
      const raw = fs.readFileSync(file, "utf8");
      const meta = extractMeta(raw);
      if (meta.title) {
        existing.push({
          title: meta.title,
          theme: meta.theme || meta.title,
          file: path.relative(ROOT, file),
          ageGroup: meta.ageGroup,
        });
      }
    }
  }
  return existing;
}

function findDuplicates(meta, existing) {
  const hits = [];
  for (const item of existing) {
    const metaInfant = /infant/i.test(meta.ageGroup || "");
    const itemInfant = /infant/i.test(item.ageGroup || "");
    const metaToddler = /toddler/i.test(meta.ageGroup || "");
    const itemToddler = /toddler/i.test(item.ageGroup || "");
    if ((metaInfant || metaToddler) && (itemInfant || itemToddler)) {
      if (metaInfant !== itemInfant && metaToddler !== itemToddler) continue;
    }
    const score = Math.max(
      jaccard(meta.title, item.title),
      jaccard(meta.theme || meta.title, item.theme || item.title),
      normalizeTitle(meta.title) === normalizeTitle(item.title) ? 1 : 0,
    );
    if (score >= 0.4) hits.push({ ...item, score: Number(score.toFixed(2)) });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 8);
}

function detectRawFormatIssues(raw) {
  const issues = [];
  const warnings = [];
  if (/scaffold|to be expanded|subsequent commits/i.test(raw)) {
    issues.push("File is a scaffold/stub — not complete enough to import.");
  }
  if (raw.trim().length < 2500) {
    issues.push(`File is unusually short (${raw.trim().length} chars) for a paid Pro weekly plan.`);
  }
  if (/^PLAN:\s*PRO\s*$/m.test(raw)) {
    issues.push('PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").');
  }
  if (/ACTIVITY_\d+_NAME\s*:/i.test(raw) && !/ACTIVITY_NAME\s*:/i.test(raw)) {
    issues.push("Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.");
  }
  if (/^ACTIVITY_\d+\s*:/im.test(raw)) {
    warnings.push("Uses ACTIVITY_1: / ACTIVITY_2: wrappers — verify every activity still has CATEGORY + ACTIVITY_NAME.");
  }

  const invalidCats = [...raw.matchAll(/^\s*CATEGORY:\s*(.+)$/gim)]
    .map((m) => m[1].trim())
    .filter((cat) => cat && !ALLOWED_CATEGORIES.some((allowed) => allowed.toLowerCase() === cat.toLowerCase()));
  const uniqueInvalid = [...new Set(invalidCats)];
  for (const cat of uniqueInvalid) {
    issues.push(`Invalid CATEGORY "${cat}". Allowed: ${ALLOWED_CATEGORIES.join(", ")}`);
  }

  // Missing category before some ACTIVITY_NAME in ACTIVITY_N wrappers is caught by parser;
  // also catch ACTIVITY_N_CATEGORY synonyms that are invalid.
  const invalidPrefixed = [...raw.matchAll(/ACTIVITY_\d+_CATEGORY:\s*(.+)/gi)]
    .map((m) => m[1].trim())
    .filter((cat) => cat && !ALLOWED_CATEGORIES.some((allowed) => allowed.toLowerCase() === cat.toLowerCase()));
  for (const cat of [...new Set(invalidPrefixed)]) {
    issues.push(`Invalid ACTIVITY_N_CATEGORY "${cat}". Map to an allowed importer category.`);
  }

  return { issues, warnings };
}

function auditParsedPlan(data, rel) {
  const issues = [];
  const warnings = [];
  if (!data) {
    issues.push("Parser returned no lesson plan data.");
    return { issues, warnings, activityCount: 0, dayCount: 0, standardsAudit: null };
  }

  for (const field of standards.WEEKLY_REQUIRED_FIELDS) {
    const value = data[field.key]
      ?? (field.aliases || []).map((a) => data[a]).find((v) => v != null);
    if (blankish(value)) issues.push(`Weekly blank/missing: ${field.label}`);
  }

  const dailyPlans = data.dailyPlans || data.days || {};
  let activityCount = 0;
  for (const day of standards.WEEKDAYS) {
    const dayPlan = dailyPlans[day];
    if (!dayPlan) {
      issues.push(`Missing day section: ${day}`);
      continue;
    }
    for (const field of standards.DAILY_REQUIRED_FIELDS) {
      const value = dayPlan[field.key]
        ?? (field.aliases || []).map((a) => dayPlan[a]).find((v) => v != null);
      if (blankish(value)) issues.push(`${day}: blank/missing ${field.label}`);
    }
    const items = dayItems(dayPlan);
    if (!items.length) {
      issues.push(`${day}: no activities`);
      continue;
    }
    if (items.length < 2) {
      warnings.push(`${day}: only ${items.length} activity; Pro plans should usually include several play-based activities`);
    }
    activityCount += items.length;
    items.forEach((activity, index) => {
      const label = `${day} activity ${index + 1} (${activity.title || activity.name || "untitled"})`;
      for (const field of standards.ACTIVITY_REQUIRED_FIELDS) {
        const value = activity[field.key]
          ?? (field.aliases || []).map((a) => activity[a]).find((v) => v != null);
        if (blankish(value)) issues.push(`${label}: blank/missing ${field.label}`);
      }
      const directionCount = countDirections(activity);
      if (directionCount < 3) {
        issues.push(`${label}: only ${directionCount} direction(s); need 3–5 clear steps`);
      }
      const category = activity.activityCategory || activity.category || "";
      if (category && !ALLOWED_CATEGORIES.some((allowed) => allowed.toLowerCase() === String(category).toLowerCase())) {
        issues.push(`${label}: invalid category "${category}"`);
      }
    });
  }

  let standardsAudit = null;
  try {
    standardsAudit = standards.auditLessonPlanAgainstStandards(data, { source: rel });
    for (const issue of standardsAudit.issues || []) {
      const detail = issue.detail || issue.message || JSON.stringify(issue);
      if (issue.severity === "critical" || issue.severity === "high") {
        issues.push(`Standards (${issue.severity}): ${detail}`);
      } else {
        warnings.push(`Standards (${issue.severity || "info"}): ${detail}`);
      }
    }
  } catch (error) {
    warnings.push(`Standards audit failed: ${error.message}`);
  }

  return {
    issues,
    warnings,
    activityCount,
    dayCount: Object.keys(dailyPlans).length,
    standardsAudit,
  };
}

function auditFile(filePath, existing) {
  const rel = path.relative(ROOT, filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const meta = extractMeta(raw);
  const issues = [];
  const warnings = [];

  const rawIssues = detectRawFormatIssues(raw);
  issues.push(...rawIssues.issues);
  warnings.push(...rawIssues.warnings);

  let parsed = null;
  let preview = null;
  try {
    parsed = parseCurriculumLessonPlanImport(raw, { existingTitles: existing.map((e) => e.title) });
  } catch (error) {
    issues.push(`Parser threw: ${error.message}`);
  }
  if (parsed?.errors?.length) {
    for (const err of parsed.errors) issues.push(`Parse error: ${err}`);
  }
  if (parsed?.warnings?.length) {
    for (const warn of parsed.warnings) warnings.push(`Parse warning: ${warn}`);
  }

  const data = parsed?.ok ? parsed.data : (parsed?.data && !parsed.errors?.length ? parsed.data : null);
  // Even when parse has category errors, dailyPlans may still be partially present.
  const planData = parsed?.data || null;
  const parsedAudit = auditParsedPlan(planData, rel);
  // If parser hard-failed with no useful day data, keep raw/parse issues only.
  if (planData && (parsedAudit.dayCount > 0 || parsedAudit.activityCount > 0 || parsed?.ok)) {
    issues.push(...parsedAudit.issues);
    warnings.push(...parsedAudit.warnings);
  } else if (!planData) {
    issues.push("Could not build a usable structured lesson plan from this paste format.");
  } else {
    // Parser returned data object but no days — still surface weekly blanks etc.
    issues.push(...parsedAudit.issues);
    warnings.push(...parsedAudit.warnings);
  }

  try {
    if (parsed) {
      preview = buildCurriculumImportPreview(parsed, { existingTitles: existing.map((e) => e.title) });
      const blocking = preview?.errors?.filter((e) => e.severity === "error") || [];
      if (preview?.canConfirm === false && blocking.length) {
        for (const item of blocking) {
          const message = item.message || item.detail || String(item);
          issues.push(`Preview block: ${message}`);
        }
      }
      for (const item of preview?.warnings || []) {
        warnings.push(`Preview: ${item.message || item}`);
      }
    }
  } catch (error) {
    warnings.push(`Preview builder failed: ${error.message}`);
  }

  const duplicates = findDuplicates(meta, existing);
  for (const dup of duplicates.filter((d) => d.score >= 0.55)) {
    warnings.push(`Possible duplicate (${dup.score}): "${dup.title}" in ${dup.file}`);
  }

  // Deduplicate issue strings
  const uniqueIssues = [...new Set(issues)];
  const uniqueWarnings = [...new Set(warnings)];
  const ready = uniqueIssues.length === 0;

  return {
    file: rel,
    meta,
    ready,
    issueCount: uniqueIssues.length,
    warningCount: uniqueWarnings.length,
    issues: uniqueIssues,
    warnings: uniqueWarnings,
    duplicates,
    activityCount: parsedAudit.activityCount,
    dayCount: parsedAudit.dayCount,
    rawChars: raw.trim().length,
    standardsComplete: Boolean(parsedAudit.standardsAudit?.complete),
    parserOk: Boolean(parsed?.ok),
  };
}

function main() {
  const existing = collectExistingTitles();
  const results = [];
  for (const dirRel of BATCH_DIRS) {
    for (const file of listTxt(dirRel)) results.push(auditFile(file, existing));
  }

  const ready = results.filter((r) => r.ready);
  const blocked = results.filter((r) => !r.ready);
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      readyToImport: ready.length,
      blocked: blocked.length,
      withDuplicateWarnings: results.filter((r) => r.duplicates.some((d) => d.score >= 0.45)).length,
    },
    results,
  };

  const outJson = path.join(ROOT, "docs/INFANT_TODDLER_PRO_GOLD_AUDIT.json");
  const outMd = path.join(ROOT, "docs/INFANT_TODDLER_PRO_GOLD_AUDIT.md");
  fs.mkdirSync(path.dirname(outMd), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

  const lines = [];
  lines.push("# Infant / Toddler Pro Gold Standard Pre-Import Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("**Status: NO FILES WERE IMPORTED OR PUBLISHED.** Paste files were audited only.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Files reviewed: **${report.summary.total}**`);
  lines.push(`- Ready for import (no blockers): **${report.summary.readyToImport}**`);
  lines.push(`- Blocked / needs repair: **${report.summary.blocked}**`);
  lines.push(`- Possible duplicate themes to compare: **${report.summary.withDuplicateWarnings}**`);
  lines.push("");
  lines.push("## Common repair themes");
  lines.push("");
  lines.push("1. Change `PLAN: PRO` → `PLAN: Pro`.");
  lines.push("2. Replace non-standard categories (`Math`, `Engineering`, `Science`, `Creative Arts`, `Social Emotional`, etc.) with importer categories: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.");
  lines.push("3. Convert `ACTIVITY_1_NAME` / `ACTIVITY_1_CATEGORY` style (Toddler Pro batch 2 / some batch 3) into gold-standard `ACTIVITY_NAME` + `CATEGORY` blocks.");
  lines.push("4. Complete stub files (Construction Zone) with full Mon–Fri content — do not import scaffolds.");
  lines.push("5. Resolve near-duplicate themes against existing core/pro plans before publishing.");
  lines.push("");
  lines.push("## Per-file results");
  lines.push("");
  for (const item of results) {
    lines.push(`### ${item.meta.title || path.basename(item.file)}`);
    lines.push("");
    lines.push(`- File: \`${item.file}\``);
    lines.push(`- Age: ${item.meta.ageGroup || "(missing)"}`);
    lines.push(`- Theme: ${item.meta.theme || "(missing)"}`);
    lines.push(`- Plan: ${item.meta.plan || "(missing)"}`);
    lines.push(`- Size: ${item.rawChars} chars · Days parsed: ${item.dayCount} · Activities parsed: ${item.activityCount} · Parser ok: ${item.parserOk}`);
    lines.push(`- Verdict: **${item.ready ? "READY (pending duplicate/cover review)" : "NOT READY — do not import"}**`);
    if (item.duplicates.length) {
      lines.push("- Duplicate candidates:");
      for (const dup of item.duplicates.slice(0, 5)) {
        lines.push(`  - (${dup.score}) ${dup.title} — \`${dup.file}\``);
      }
    }
    if (item.issues.length) {
      lines.push("- Blockers:");
      for (const issue of item.issues.slice(0, 35)) lines.push(`  - ${issue}`);
      if (item.issues.length > 35) lines.push(`  - …and ${item.issues.length - 35} more`);
    }
    if (item.warnings.length) {
      lines.push("- Warnings:");
      for (const warn of item.warnings.slice(0, 15)) lines.push(`  - ${warn}`);
      if (item.warnings.length > 15) lines.push(`  - …and ${item.warnings.length - 15} more`);
    }
    lines.push("");
  }

  lines.push("## Monthly curriculum note");
  lines.push("");
  lines.push("Monthly curriculum collections (Week 1–4 + optional Week 5) should live inside Lesson Plans as Netflix-style collections, not a second lesson-plan system.");
  lines.push("Phase 1 foundation already exists on `cursor/monthly-curriculum-phase1-a1ac` (`CurriculumSeries` links weekly plan IDs; UI lives in Lesson Plans).");
  lines.push("Finish/rebase monthly collections only after weekly plans are Gold Standard–ready.");
  lines.push("");
  lines.push("Planned monthly capabilities:");
  lines.push("");
  lines.push("- Monthly overview + monthly learning goals");
  lines.push("- Four linked weekly lesson plans (optional fifth week)");
  lines.push("- Full-month materials list");
  lines.push("- Family connection / newsletter");
  lines.push("- Add entire month to calendar");
  lines.push("- Print / download entire month");
  lines.push("- Still open any single week on its own");
  lines.push("");
  lines.push("## Cover images");
  lines.push("");
  lines.push("Do not roll themed covers across every plan until mockups are approved.");
  lines.push("Review samples in `mockups/infant-toddler-pro-covers/index.html`.");
  lines.push("");
  lines.push("## Duplicate watchlist (compare before import)");
  lines.push("");
  lines.push("| New plan | Existing similar plan | Notes |");
  lines.push("|---|---|---|");
  lines.push("| Growing Gardens STEM | toddler-growing-gardens.txt | Exact/near title match — differentiate or skip |");
  lines.push("| Apple Orchard Adventures | 13-toddler-apple-orchard-adventure-pro.txt | Overlaps existing Apple Pro unit |");
  lines.push("| Farm STEM | toddler-farm-friends.txt | Differentiate STEM farm vs farm friends |");
  lines.push("| Move & Groove Babies | Infant Music and Movement core plans | Differentiate movement focus |");
  lines.push("");
  lines.push("## Next steps");
  lines.push("");
  lines.push("1. Repair every **NOT READY** file (categories, PLAN casing, ACTIVITY_NAME format, Construction Zone stub).");
  lines.push("2. Re-run `npm run audit:infant-toddler-pro-batches` until ready count rises.");
  lines.push("3. Approve cover mockups.");
  lines.push("4. Import + publish only then.");
  lines.push("5. Group into monthly curriculum collections and regression-test viewer/mobile/admin/print/calendar/favorites/permissions/covers.");
  lines.push("");

  fs.writeFileSync(outMd, lines.join("\n"));
  console.log(`Audited ${results.length} files`);
  console.log(`Ready: ${ready.length} · Blocked: ${blocked.length}`);
  console.log(`Wrote ${path.relative(ROOT, outMd)}`);
  for (const item of results) {
    console.log(`${item.ready ? "READY   " : "BLOCKED "} ${item.meta.title || item.file} · days=${item.dayCount} acts=${item.activityCount} issues=${item.issueCount}`);
  }
}

main();

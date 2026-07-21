#!/usr/bin/env node
/**
 * Audit every known lesson-plan title against the cover catalog/resolver.
 * Flags placeholder covers and missing JPG assets.
 *
 * Run: node scripts/audit-lesson-plan-covers.js
 */
const fs = require("fs");
const path = require("path");
const covers = require("./lesson-plan-covers.js");
const catalog = require("./lesson-plan-cover-catalog.js");

const ROOT = path.join(__dirname, "..");
const COVER_DIR = path.join(ROOT, "images/lesson-covers");

function walkTitles(dir, titles) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkTitles(full, titles);
      continue;
    }
    if (!/\.txt$/i.test(name)) continue;
    const text = fs.readFileSync(full, "utf8");
    const match = text.match(/^TITLE:\s*\n([^\n]+)/m) || text.match(/^TITLE:\s*(.+)$/m);
    const ageMatch = text.match(/^AGE_GROUP:\s*\n([^\n]+)/m) || text.match(/^AGE(?:_GROUP)?:\s*(.+)$/m);
    if (match) {
      titles.set(match[1].trim(), {
        age: (ageMatch?.[1] || "").trim(),
        file: path.relative(ROOT, full),
      });
    }
  }
}

function assetExists(url) {
  const clean = String(url || "").split("?")[0].replace(/^\//, "");
  return fs.existsSync(path.join(ROOT, clean));
}

function main() {
  const titles = new Map();
  (catalog.PLAN_COVERS || []).forEach((entry) => {
    titles.set(entry.title, { age: entry.age || "", file: "catalog" });
  });
  [
    "scripts/curriculum-infant-core-imports",
    "scripts/curriculum-toddler-core-imports",
    "scripts/curriculum-preschool-imports",
    "scripts/curriculum-toddler-imports",
    "scripts/curriculum-infant-holiday-imports",
    "scripts/curriculum-toddler-holiday-imports",
    "scripts/curriculum-preschool-holiday-imports",
    "scripts/curriculum-infant-summer-imports",
    "scripts/curriculum-preschool-summer-imports",
    "scripts/curriculum-preschool-priority-imports",
    "scripts/curriculum-infant-pro-batch2-imports",
    "scripts/curriculum-toddler-pro-batch2-imports",
    "scripts/curriculum-toddler-pro-batch3-imports",
  ].forEach((dir) => walkTitles(path.join(ROOT, dir), titles));

  try {
    const batch = require("./curriculum-infant-toddler-pro-batch-targets.js");
    (batch.INFANT_TODDLER_PRO_BATCH_TARGETS || []).forEach((target) => {
      titles.set(target.title, { age: target.age || "", file: target.relativePath || "batch-target" });
    });
  } catch {
    /* optional */
  }

  const rows = [];
  for (const [title, meta] of [...titles.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const resolved = covers.resolveLessonPlanCover({
      title,
      theme: title,
      age: meta.age || "Preschool",
    });
    const placeholder = covers.isPlaceholderCoverUrl(resolved.url) || resolved.source === "default";
    const missingAsset = !assetExists(resolved.url);
    rows.push({
      title,
      age: meta.age || "",
      url: resolved.url,
      source: resolved.source,
      placeholder,
      missingAsset,
      file: meta.file,
    });
  }

  const bad = rows.filter((row) => row.placeholder || row.missingAsset);
  const report = {
    auditedAt: new Date().toISOString(),
    coverAssetVersion: covers.COVER_ASSET_VERSION,
    coverDirExists: fs.existsSync(COVER_DIR),
    total: rows.length,
    ok: rows.length - bad.length,
    issues: bad.length,
    bad,
  };

  const outJson = path.join(ROOT, "docs/LESSON_PLAN_COVER_AUDIT.json");
  const outMd = path.join(ROOT, "docs/LESSON_PLAN_COVER_AUDIT.md");
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  const md = [
    "# Lesson Plan Cover Audit",
    "",
    `Audited: ${report.auditedAt}`,
    `Cover asset version: \`${report.coverAssetVersion}\``,
    `Total titles: **${report.total}** · OK: **${report.ok}** · Issues: **${report.issues}**`,
    "",
    report.issues
      ? [
        "## Issues",
        "",
        ...bad.map((row) => `- **${row.title}** → \`${row.url}\` (${row.source}${row.missingAsset ? ", missing asset" : ""}${row.placeholder ? ", placeholder" : ""})`),
        "",
      ].join("\n")
      : "## No placeholder covers remain.\n",
  ].join("\n");
  fs.writeFileSync(outMd, `${md}\n`);

  console.log(`Audited ${report.total} titles · OK ${report.ok} · Issues ${report.issues}`);
  bad.forEach((row) => {
    console.log(`ISSUE  ${row.title} → ${row.url} (${row.source}${row.missingAsset ? ", missing asset" : ""})`);
  });
  console.log(`Wrote ${path.relative(ROOT, outMd)}`);
  if (bad.length) process.exitCode = 1;
}

main();

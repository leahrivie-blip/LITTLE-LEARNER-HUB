#!/usr/bin/env node
/**
 * Generate premium Teaching Kit draft artifacts:
 * - rewrite import .txt sources (STATUS: draft in file)
 * - enrichment draft JSON packages
 * - printable PDFs (draft)
 * - activity setup PNGs
 * - owner review report
 *
 * Does NOT publish. Does NOT deploy.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { KITS, buildKitArtifacts, summarizeKit } = require("./lib/teaching-kit-premium-drafts/index.js");
const { buildAllPrintables } = require("./lib/teaching-kit-premium-drafts/build-printables.js");
const { generateActivityImages } = require("./lib/teaching-kit-premium-drafts/build-activity-images.js");

const ROOT = path.join(__dirname, "..");
const DRAFT_DIR = path.join(ROOT, "curriculum-drafts/teaching-kits-premium");
const REPORT_PATH = path.join(ROOT, "docs/teaching-kit/premium-drafts-review/FOUR_KITS_OWNER_REVIEW_REPORT.md");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeReport(summaries, printableMap, imageFiles) {
  const lines = [];
  lines.push("# Four Teaching Kits — Premium DRAFT Owner Review Report");
  lines.push("");
  lines.push("**Status:** DRAFT ONLY — nothing published");
  lines.push("**Do not merge / do not deploy / do not publish enrichment** until owner Admin review.");
  lines.push("");
  lines.push("## Confirmation");
  lines.push("");
  lines.push("- All upgraded content is packaged as `enrichmentDraft` (admin-only until you publish).");
  lines.push("- All new printables are `status: draft`.");
  lines.push("- Generated images live under `/images/teaching-kit-drafts/` for Admin review.");
  lines.push("- Import source files were updated to match the premium week (file STATUS field: `draft`).");
  lines.push("- Startup seed may still keep Free catalog lesson shells published for access; customer-facing Teaching Kit enrichment remains unpublished until you approve.");
  lines.push("");
  lines.push("## Research sources used");
  lines.push("");
  const allSources = [...new Set(summaries.flatMap((s) => s.researchSources))];
  allSources.forEach((s) => lines.push(`- ${s}`));
  lines.push("");

  summaries.forEach((summary) => {
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${summary.age} — ${summary.title}`);
    lines.push("");
    lines.push(`- **Stable ID:** \`${summary.id}\``);
    lines.push(`- **Activity count:** ${summary.activityCount}`);
    lines.push(`- **Domains represented:** ${summary.domains.join(", ")}`);
    lines.push("");
    lines.push("### Audit decisions");
    lines.push("");
    lines.push("**Kept**");
    (summary.decisions.keep.length ? summary.decisions.keep : ["(none)"]).forEach((t) => lines.push(`- ${t}`));
    lines.push("");
    lines.push("**Improved**");
    (summary.decisions.improve.length ? summary.decisions.improve : ["(none)"]).forEach((t) => lines.push(`- ${t}`));
    lines.push("");
    lines.push("**Added**");
    (summary.decisions.add.length ? summary.decisions.add : ["(none)"]).forEach((t) => lines.push(`- ${t}`));
    lines.push("");
    lines.push("**Replaced**");
    if (!summary.decisions.replace.length) {
      lines.push("- (none)");
    } else {
      summary.decisions.replace.forEach((row) => {
        lines.push(`- **${row.replaces}** → **${row.title}**`);
        lines.push(`  - Reason: ${row.reason}`);
      });
    }
    if (summary.removedActivityTitles.length) {
      lines.push("");
      lines.push("**Removed titles (draft remove list)**");
      summary.removedActivityTitles.forEach((t) => lines.push(`- ${t}`));
    }
    lines.push("");
    lines.push("### Final 15-activity lineup");
    lines.push("");
    summary.finalLineup.forEach((day) => {
      lines.push(`**${day.day}**`);
      day.activities.forEach((title, i) => lines.push(`${i + 1}. ${title}`));
      lines.push("");
    });
    lines.push("### Images");
    lines.push("");
    lines.push("**Received images (and why)**");
    summary.withImages.forEach((row) => {
      lines.push(`- ${row.title} — \`${row.imageRequirement}\`: ${row.why}`);
    });
    lines.push("");
    lines.push("**Intentionally no image (and why)**");
    summary.withoutImages.forEach((row) => {
      lines.push(`- ${row.title}: ${row.why}`);
    });
    lines.push("");
    lines.push("### Printables (draft)");
    const prints = printableMap[summary.id] || [];
    prints.forEach((p) => lines.push(`- ${p.title} (\`${p.id}\`, ${p.pageCount} pages)`));
    (summary.printables || []).forEach((idea) => {
      if (!prints.some((p) => p.title.toLowerCase().includes(String(idea.title || "").toLowerCase().slice(0, 12)))) {
        lines.push(`- Idea retained in draft: ${idea.title} — ${idea.purpose}`);
      }
    });
    lines.push("");
    lines.push("### Songs");
    summary.songs.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
    lines.push("### Books");
    summary.books.forEach((b) => lines.push(`- ${b}`));
    lines.push("");
    lines.push("### Teacher Toolkit");
    const tk = summary.teacherToolkit || {};
    lines.push(`- Prep checklist: ${(tk.prepChecklist || []).join("; ") || "(see draft)"}`);
    lines.push(`- Observation focus: ${(tk.observationFocus || []).join("; ") || "(see draft)"}`);
    lines.push(`- Notes: ${tk.notes || ""}`);
    lines.push("");
    if (/infant/i.test(summary.age)) {
      lines.push("### Infant-specific safety / development notes");
      lines.push("");
      lines.push("- No product crafts or adult-made “baby art” presented as child-created.");
      lines.push("- Emphasis on looking, tracking, tummy time, faces, caregiver talk, safe reaching.");
      lines.push("- Materials oversized / mouth-safe; no bags, cords, small parts.");
      lines.push("- Differentiates younger (look/listen) vs older (reach/grasp) within 0–6 months.");
      lines.push("");
    }
    lines.push("### Draft status");
    lines.push("");
    lines.push("- Teaching Kit enrichment: **DRAFT** (`enrichmentDraft`)");
    lines.push("- Printables: **DRAFT**");
    lines.push("- Images: reviewable draft assets (not enrichment-published)");
    lines.push("- **NOT PUBLISHED**");
    lines.push("");
  });

  lines.push("---");
  lines.push("");
  lines.push("## Files / data changed");
  lines.push("");
  lines.push("- `scripts/lib/teaching-kit-premium-drafts/*` (kit modules + builders)");
  lines.push("- Four curriculum import `.txt` sources rewritten to premium draft content");
  lines.push("- `curriculum-drafts/teaching-kits-premium/` enrichment JSON + printable PDFs");
  lines.push("- `images/teaching-kit-drafts/**` setup PNGs");
  lines.push("- `scripts/generate-teaching-kit-premium-drafts.js`");
  lines.push("- `scripts/apply-teaching-kit-premium-drafts.js` (applies enrichment drafts only)");
  lines.push(`- Generated ${imageFiles.length} draft activity images`);
  lines.push("");
  lines.push("## How to review in Admin");
  lines.push("");
  lines.push("1. Run `node scripts/apply-teaching-kit-premium-drafts.js` against a local/dev store (never production publish).");
  lines.push("2. Open Admin → Curriculum → each lesson → Upgrade Lesson / Draft Review.");
  lines.push("3. Edit activities, replace images/printables, then manually publish only when satisfied.");
  lines.push("");

  ensureDir(path.dirname(REPORT_PATH));
  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
  return REPORT_PATH;
}

async function main() {
  ensureDir(DRAFT_DIR);
  console.log("Generating printable PDFs…");
  const printableMap = await buildAllPrintables();
  console.log("Generating activity setup images…");
  const imageFiles = await generateActivityImages();

  const summaries = [];
  const manifest = {
    generatedAt: new Date().toISOString(),
    draftOnly: true,
    published: false,
    kits: [],
  };

  for (const kit of KITS) {
    const printableIds = (printableMap[kit.planMeta.id] || []).map((p) => p.id);
    const { enrichmentDraft, importText } = buildKitArtifacts(kit, { printableIds });
    const importAbs = path.join(ROOT, kit.importRelativePath);
    fs.writeFileSync(importAbs, importText, "utf8");

    const draftJsonPath = path.join(DRAFT_DIR, `${kit.key}.enrichment-draft.json`);
    fs.writeFileSync(draftJsonPath, `${JSON.stringify(enrichmentDraft, null, 2)}\n`, "utf8");

    const summary = summarizeKit(kit);
    summaries.push(summary);
    manifest.kits.push({
      id: kit.planMeta.id,
      key: kit.key,
      title: kit.planMeta.title,
      importPath: kit.importRelativePath,
      enrichmentDraftPath: path.relative(ROOT, draftJsonPath),
      printableIds,
      printables: printableMap[kit.planMeta.id] || [],
      activityCount: summary.activityCount,
      status: {
        enrichment: "draft",
        printables: "draft",
        published: false,
      },
    });
    console.log(`✓ ${kit.planMeta.title}: ${summary.activityCount} activities, ${printableIds.length} printables`);
  }

  const manifestPath = path.join(DRAFT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const reportPath = writeReport(summaries, printableMap, imageFiles);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Report: ${reportPath}`);
  console.log("DONE — draft artifacts only; nothing published.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

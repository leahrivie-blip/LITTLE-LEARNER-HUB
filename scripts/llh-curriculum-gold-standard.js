/**
 * Little Learner Hub Curriculum Gold Standard — pre-submit validator.
 * Run before Draft Review Queue submission. Uses the same authoritative
 * Teaching Kit scorer as the Admin Enrichment Editor.
 *
 * Usage:
 *   node scripts/llh-curriculum-gold-standard.js --seed amazing-apples
 *   node scripts/llh-curriculum-gold-standard.js --seed all-about-me
 *   require("./llh-curriculum-gold-standard.js").validatePackage(...)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SEED_ROOT = path.join(ROOT, "docs", "curriculum-draft-review", "seed");

function text(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function meaningful(value, min = 4) {
  return text(value).length >= min;
}

function loadQuality() {
  return require("./teaching-kit-quality-review.js");
}

function loadEnrichment() {
  return require("./teaching-kit-enrichment.js");
}

function loadSeedPackage(packageId) {
  const dir = path.join(SEED_ROOT, packageId);
  const enrichmentPath = path.join(dir, "enrichment-draft.json");
  if (!fs.existsSync(enrichmentPath)) {
    throw new Error(`Missing seed package: ${packageId}`);
  }
  const parsed = JSON.parse(fs.readFileSync(enrichmentPath, "utf8"));
  const imagesDir = path.join(dir, "images");
  const images = fs.existsSync(imagesDir)
    ? fs.readdirSync(imagesDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    : [];
  const pdfs = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f));
  return { packageId, dir, parsed, images, pdfs };
}

/**
 * Resolve seed:// refs to temporary data URLs for offline scoring only.
 * Production submit persists them as enrichment media assets instead.
 */
function embedSeedUrlsForScoring(draft, packageId) {
  const seedDir = path.join(SEED_ROOT, packageId);
  function walk(value) {
    if (typeof value === "string") {
      const match = value.match(/^seed:\/\/[^/]+\/(.+)$/i);
      if (match) {
        const filePath = path.join(seedDir, match[1]);
        if (!fs.existsSync(filePath)) return "";
        const buf = fs.readFileSync(filePath);
        const mime = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
        return `data:${mime};base64,${buf.toString("base64")}`;
      }
      if (/^file:\/\//i.test(value)) return "";
      return value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const next = {};
      Object.keys(value).forEach((k) => { next[k] = walk(value[k]); });
      return next;
    }
    return value;
  }
  return walk(JSON.parse(JSON.stringify(draft || {})));
}

function contradictionScan(plan, draft) {
  const findings = [];
  const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
  const acts = draft?.activities && typeof draft.activities === "object" ? draft.activities : {};
  const titles = [];
  const days = plan?.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  Object.keys(days).forEach((day) => {
    asArray(days[day]?.items).forEach((item) => {
      const title = text(item.title);
      if (title) titles.push({ day, title, itemId: item.itemId || item.id });
    });
  });
  const titleCounts = {};
  titles.forEach((row) => {
    const key = row.title.toLowerCase();
    titleCounts[key] = (titleCounts[key] || 0) + 1;
  });
  Object.entries(titleCounts).forEach(([title, count]) => {
    if (count > 1) {
      findings.push({
        code: "repeated_activity_title",
        severity: "warning",
        message: `Activity title appears ${count} times: "${title}"`,
      });
    }
  });

  const genericPhrases = [
    /theme focus coming soon/i,
    /lorem ipsum/i,
    /TODO/i,
    /placeholder/i,
    /add content here/i,
    /generic filler/i,
  ];
  const blobs = [week.weeklyOverview, week.teacherPreparation, week.familyConnection, JSON.stringify(acts)];
  genericPhrases.forEach((re) => {
    if (blobs.some((b) => re.test(String(b || "")))) {
      findings.push({
        code: "generic_filler",
        severity: "blocking",
        message: `Generic filler matched: ${re}`,
      });
    }
  });

  Object.entries(acts).forEach(([key, act]) => {
    if (!act || typeof act !== "object") return;
    const req = text(act.imageRequirement).toLowerCase();
    const needsImage = ["required", "setup_required", "example_required", "setup_only", "example_only"].includes(req);
    const hasImage = Boolean(text(act.exampleImageUrl) || text(act.setupImageUrl)
      || text(act.exampleMediaAssetId) || text(act.setupMediaAssetId));
    if (needsImage && !hasImage) {
      findings.push({
        code: "required_image_missing",
        severity: "blocking",
        message: `Activity ${key} requires an image but none is linked.`,
      });
    }
    if (req === "not_needed" && hasImage && !text(act.imageRequirementReason)) {
      findings.push({
        code: "unnecessary_image",
        severity: "warning",
        message: `Activity ${key} is marked not_needed but still has an image.`,
      });
    }
    const requiredText = ["setup", "steps", "adaptations", "extensions", "safetyNotes", "cleanupTip"];
    requiredText.forEach((field) => {
      if (!meaningful(act[field], 8)) {
        findings.push({
          code: "activity_field_thin",
          severity: "warning",
          message: `Activity ${key} missing/thin field: ${field}`,
        });
      }
    });
    if (!asArray(act.teacherTips).length) {
      findings.push({
        code: "missing_tips",
        severity: "blocking",
        message: `Activity ${key} missing teacher tips.`,
      });
    }
    if (!asArray(act.observationPrompts).length) {
      findings.push({
        code: "missing_observations",
        severity: "blocking",
        message: `Activity ${key} missing observation prompts.`,
      });
    }
  });

  asArray(week.songs).forEach((song, index) => {
    if (!text(song.title)) {
      findings.push({ code: "song_missing_title", severity: "blocking", message: `Song #${index + 1} missing title.` });
    }
    if (!text(song.rightsStatus || song.copyrightStatus)) {
      findings.push({ code: "song_missing_rights", severity: "blocking", message: `Song "${song.title || index}" missing rights classification.` });
    }
    const rights = text(song.rightsStatus || song.copyrightStatus).toLowerCase();
    if (text(song.lyrics) && !["original", "public_domain", "traditional", "public-domain"].includes(rights)) {
      findings.push({
        code: "song_lyrics_rights_risk",
        severity: "blocking",
        message: `Song "${song.title}" has lyrics but rightsStatus="${rights}" is not permitted for lyrics.`,
      });
    }
    if (!text(song.dayPlacement || song.weekdayPlacement)) {
      findings.push({
        code: "song_missing_weekday",
        severity: "warning",
        message: `Song "${song.title}" missing weekday placement.`,
      });
    }
  });

  asArray(week.books).forEach((book, index) => {
    if (!text(book.title) || !text(book.author)) {
      findings.push({ code: "book_incomplete", severity: "blocking", message: `Book #${index + 1} missing title/author.` });
    }
    if (!text(book.verificationSource)) {
      findings.push({ code: "book_unverified", severity: "blocking", message: `Book "${book.title}" missing verification source.` });
    }
    if (!asArray(book.beforeReadingQuestions).length && !text(book.beforeReadingQuestions)) {
      findings.push({ code: "book_missing_prompts", severity: "warning", message: `Book "${book.title}" missing before-reading questions.` });
    }
  });

  const printableIds = asArray(week.printableIds);
  if (!printableIds.length && !asArray(week.printableIdeas).length) {
    findings.push({ code: "missing_printables", severity: "blocking", message: "No printable linked or idea listed." });
  }

  return findings;
}

function validatePackage({ packageId, resourceId, draftResourceStatus = "draft" }) {
  const enrich = loadEnrichment();
  const quality = loadQuality();
  const model = require("./curriculum-draft-review.js");
  const loaded = loadSeedPackage(packageId);
  const plan = loaded.parsed.plan;
  if (!plan?.id) {
    return { ok: false, error: "Seed package missing plan snapshot." };
  }
  // Simulate server normalize: daily items get sourceKey = planId:itemId (no weekday).
  const days = plan.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  Object.keys(days).forEach((day) => {
    const items = Array.isArray(days[day]?.items) ? days[day].items : [];
    days[day].items = items.map((item) => ({
      ...item,
      sourceKey: `${plan.id}:${item.itemId || item.id || ""}`,
    }));
  });
  let draftEmbedded = embedSeedUrlsForScoring(loaded.parsed.enrichmentDraft, packageId);
  draftEmbedded = model.remapEnrichmentActivitiesToPlan(plan, [], draftEmbedded, enrich);
  if (!draftEmbedded.week) draftEmbedded.week = {};
  if (resourceId) draftEmbedded.week.printableIds = [resourceId];
  const resources = resourceId
    ? [{
      id: resourceId,
      status: draftResourceStatus,
      title: "Draft printable",
      resourceCategory: "Printables",
      lessonPlanIds: [plan.id],
    }]
    : [];
  if (resourceId) plan.resourceIds = [resourceId];

  const activities = enrich.flattenLessonActivities(plan, []);
  const evaluated = quality.evaluateTeachingKit(plan, activities, draftEmbedded, { resources });
  const scan = contradictionScan(plan, draftEmbedded);
  const blockingScan = scan.filter((f) => f.severity === "blocking");
  const warnings = scan.filter((f) => f.severity !== "blocking");

  const pdfOk = loaded.pdfs.length >= 1;
  const imageFilesOk = loaded.images.length >= 1;

  return {
    ok: blockingScan.length === 0 && pdfOk,
    packageId,
    lessonPlanId: plan.id,
    title: plan.title,
    age: plan.age,
    decisions: loaded.parsed.decisions || [],
    assets: {
      pdfs: loaded.pdfs,
      images: loaded.images,
      pdfOk,
      imageFilesOk,
    },
    scores: {
      structural: evaluated.completionPercent,
      premium: evaluated.premiumReadinessPercent,
      publishReadiness: evaluated.publishReadiness,
      blocksPublish: evaluated.blocksPublish,
      scoringSource: "evaluateTeachingKit",
      note: "Draft printables correctly prevent Publish Ready. Premium may cap at 89 until printables are published.",
    },
    blockers: evaluated.blockingIssues || [],
    contradictionScan: { blocking: blockingScan, warnings },
    activityCount: activities.length,
    enrichmentActivityKeys: Object.keys(draftEmbedded.activities || {}).length,
  };
}

function main() {
  const args = process.argv.slice(2);
  const seedIdx = args.indexOf("--seed");
  const packageId = seedIdx >= 0 ? args[seedIdx + 1] : null;
  const packages = packageId
    ? [packageId]
    : ["amazing-apples", "all-about-me"];
  const resourceMap = {
    "amazing-apples": "cur-res-draft-amazing-apples-picture-cards",
    "all-about-me": "cur-res-draft-all-about-me-picture-cards",
  };
  const results = packages.map((id) => validatePackage({
    packageId: id,
    resourceId: resourceMap[id],
    draftResourceStatus: "draft",
  }));
  const outDir = path.join(ROOT, "docs", "curriculum-draft-review");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "GOLD-STANDARD-VALIDATION.json");
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  results.forEach((r) => {
    console.log(`\n${r.title} (${r.age})`);
    console.log(`  structural ${r.scores.structural}% · premium ${r.scores.premium}% · publish ${r.scores.publishReadiness}`);
    console.log(`  blockers: ${(r.blockers || []).map((b) => b.code || b).join(", ") || "none"}`);
    console.log(`  scan blocking: ${r.contradictionScan.blocking.length} · warnings: ${r.contradictionScan.warnings.length}`);
    console.log(`  pdfs: ${r.assets.pdfs.join(", ")} · images: ${r.assets.images.length}`);
  });
  console.log(`\nWrote ${reportPath}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

module.exports = {
  validatePackage,
  contradictionScan,
  embedSeedUrlsForScoring,
  loadSeedPackage,
};

if (require.main === module) main();

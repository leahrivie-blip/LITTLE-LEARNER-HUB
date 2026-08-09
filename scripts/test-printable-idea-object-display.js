#!/usr/bin/env node
/**
 * Verifies Teaching Kit editor printable-idea object display.
 * Uses All About Me + Amazing Apples seed drafts read-only — no content mutation,
 * no publish, no customer flag changes.
 *
 * Run: npm run test:printable-idea-object-display
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const enrichment = require("./teaching-kit-enrichment.js");

const SEEDS = [
  {
    name: "All About Me",
    dir: "all-about-me",
    planId: "cur-lp-preschool-all-about-me",
    titleNeedle: "All About Me Picture Card Pack (PDF)",
    purposeNeedle: "Inclusive faces, families, interests",
  },
  {
    name: "Amazing Apples",
    dir: "amazing-apples",
    planId: "cur-lp-toddler-amazing-apples",
    titleNeedle: "Amazing Apples Picture Card Pack (PDF)",
    purposeNeedle: "Color cards, life-cycle sequence",
  },
];

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function loadSeedDraft(dir) {
  const file = path.join(ROOT, "docs/curriculum-draft-review/seed", dir, "enrichment-draft.json");
  const raw = fs.readFileSync(file, "utf8");
  const json = JSON.parse(raw);
  return { file, raw, json };
}

/** Mirror editor list-item rendering for printable ideas (read-only). */
function renderPrintableIdeaHtml(idea) {
  const item = enrichment.normalizePrintableIdea(idea);
  if (!item) return "";
  const esc = (value) => {
    if (value != null && typeof value === "object") return "";
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
  const title = esc(item.title || "");
  const description = esc(item.description || item.purpose || "");
  const type = esc(item.type || "");
  const instructions = esc(item.instructions || "");
  return [
    "<li class=\"tk-enrich-printable-idea\">",
    "<strong>Printable idea</strong>",
    title ? `<div class="tk-enrich-printable-idea-title">${title}</div>` : "",
    type ? `<div>Type ${type}</div>` : "",
    description ? `<div>Description ${description}</div>` : "",
    instructions ? `<div>Instructions ${instructions}</div>` : "",
    "</li>",
  ].join("");
}

function main() {
  console.log("Printable idea object display (All About Me + Amazing Apples, read-only)\n");

  const editorSrc = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  ok(editorSrc.includes("renderPrintableIdeaListItem"), "editor defines structured printable-idea renderer");
  ok(!/Printable idea:<\/strong> \$\{esc\(idea\)\}/.test(editorSrc), "editor no longer stringifies printable ideas with esc(idea)");
  ok(editorSrc.includes("normalizePrintableIdea"), "editor uses normalizePrintableIdea helper");

  const objectIdea = {
    title: "Sample Pack (PDF)",
    purpose: "Sorting mats for circle time",
    type: "PDF pack",
    instructions: "Print double-sided; cut on dashed lines.",
    notes: "Laminate if possible",
    ageBand: "Toddler",
  };
  const normalized = enrichment.normalizePrintableIdea(objectIdea);
  ok(normalized && normalized.title === objectIdea.title, "normalize keeps title");
  ok(normalized.purpose === objectIdea.purpose, "normalize keeps purpose/description");
  ok(normalized.type === objectIdea.type, "normalize keeps type");
  ok(normalized.instructions === objectIdea.instructions, "normalize keeps instructions");
  ok(normalized.notes === objectIdea.notes, "normalize keeps notes");
  ok(normalized.ageBand === objectIdea.ageBand, "normalize preserves related metadata");
  ok(!String(enrichment.printableIdeaLabel(objectIdea)).includes("[object Object]"), "label never [object Object]");

  const stringIdea = enrichment.normalizePrintableIdea("Color sorting cards");
  ok(stringIdea && stringIdea.title === "Color sorting cards", "string ideas still normalize");

  const mediaOnly = enrichment.normalizePrintableIdea({ mediaAssetId: "asset-123" });
  ok(mediaOnly && mediaOnly.mediaAssetId === "asset-123", "mediaAssetId-only ideas preserved");

  SEEDS.forEach((seed) => {
    console.log(`\n${seed.name}`);
    const { raw, json } = loadSeedDraft(seed.dir);
    const beforeFp = fingerprint(json);
    const printableIdeas = json?.enrichmentDraft?.week?.printableIdeas;

    ok(Array.isArray(printableIdeas) && printableIdeas.length > 0, `${seed.name}: seed has printableIdeas`);
    ok(printableIdeas.some((idea) => idea && typeof idea === "object"), `${seed.name}: printableIdeas include objects`);

    const html = printableIdeas.map(renderPrintableIdeaHtml).join("\n");
    ok(!html.includes("[object Object]"), `${seed.name}: rendered HTML has no [object Object]`);
    ok(html.includes(seed.titleNeedle), `${seed.name}: rendered title visible`);
    ok(html.includes(seed.purposeNeedle), `${seed.name}: rendered description/purpose visible`);

    const ideasCopy = printableIdeas.map((idea) => ({ ...idea }));
    const merged = enrichment.mergeDraftIntoPlan(
      { id: seed.planId, title: seed.name, teachingKit: {}, dailyPlans: {} },
      [],
      { week: { printableIdeas: ideasCopy }, activities: {} },
    );
    const mergedIdeas = merged.plan?.teachingKit?.printableIdeas || [];
    ok(mergedIdeas.length > 0, `${seed.name}: merge keeps printable ideas`);
    ok(
      mergedIdeas.every((idea) => idea && typeof idea === "object" && idea.title),
      `${seed.name}: merge stores objects with titles (not [object Object] strings)`,
    );
    ok(
      mergedIdeas.some((idea) => idea.title && idea.title.includes("Picture Card Pack")),
      `${seed.name}: merge preserves printable title`,
    );
    ok(
      !JSON.stringify(mergedIdeas).includes("[object Object]"),
      `${seed.name}: merged ideas JSON has no [object Object]`,
    );

    const applied = enrichment.applySuggestionsToDraft(
      { week: { printableIdeas: printableIdeas.map((idea) => ({ ...idea })) }, activities: {} },
      [{
        id: "sug-test-printable",
        field: "printableIdeas",
        proposedValue: { title: "Extra review mat", purpose: "Optional sorting practice" },
      }],
    );
    ok(
      Array.isArray(applied.draft.week.printableIdeas)
        && applied.draft.week.printableIdeas.some((idea) => idea && idea.title === printableIdeas[0].title),
      `${seed.name}: applying AI suggestion does not destroy existing object ideas`,
    );
    ok(
      !JSON.stringify(applied.draft.week.printableIdeas).includes("[object Object]"),
      `${seed.name}: suggestion apply has no [object Object]`,
    );

    const afterFp = fingerprint(json);
    ok(beforeFp === afterFp, `${seed.name}: seed JSON fingerprint unchanged`);
    ok(
      fs.readFileSync(
        path.join(ROOT, "docs/curriculum-draft-review/seed", seed.dir, "enrichment-draft.json"),
        "utf8",
      ) === raw,
      `${seed.name}: seed file bytes unchanged`,
    );
  });

  console.log(`\n${passed} assertions passed`);
}

main();

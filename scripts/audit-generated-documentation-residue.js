#!/usr/bin/env node
/**
 * Read-only audit for Markdown / placeholder residue in generated documentation.
 * Does NOT rewrite production records. Writes a review report only.
 *
 * Usage:
 *   node scripts/audit-generated-documentation-residue.js [store-or-json-path]
 *   npm run audit:generated-docs
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const aiAgeSafety = require("./ai-age-safety.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_OUT = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "provider-workflow-safety");

function text(value) {
  return String(value == null ? "" : value);
}

function walkRecords(node, trail, hits) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkRecords(item, `${trail}[${index}]`, hits));
    return;
  }
  if (!node || typeof node !== "object") return;
  const fields = ["message", "summary", "title", "notes", "content", "body", "preview", "text", "parentNote"];
  fields.forEach((field) => {
    if (node[field] == null) return;
    const value = text(node[field]);
    if (!value.trim()) return;
    const issues = aiAgeSafety.lintAiProviderCopy(value);
    if (!issues.length) return;
    hits.push({
      path: `${trail}.${field}`,
      issues: issues.map((item) => item.code),
      sample: value.slice(0, 180),
      id: node.id || node.recordId || "",
      childId: node.childId || "",
    });
  });
  Object.keys(node).forEach((key) => {
    if (fields.includes(key)) return;
    const value = node[key];
    if (value && typeof value === "object") walkRecords(value, `${trail}.${key}`, hits);
  });
}

function loadTarget(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    return { source: filePath, data: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  }
  // Disposable fixture sample only — never mutate.
  const fixture = {
    communications: [
      {
        id: "fixture-msg-1",
        childId: "fixture-child",
        message: "### Message Title\nHello family.\n### Highlights\n[Your Name]",
      },
      {
        id: "fixture-msg-2",
        childId: "fixture-child",
        message: "Mia enjoyed outdoor play and shared crayons kindly.",
      },
    ],
    reports: [{ id: "fixture-report-1", summary: "lorem ipsum daily report" }],
    observations: [{ id: "fixture-obs-1", text: "Provide playdough, tongs, tracing, stickers, beading." }],
  };
  return { source: "inline-disposable-fixture", data: fixture };
}

function main() {
  const targetPath = process.argv[2] || "";
  const loaded = loadTarget(targetPath);
  const hits = [];
  walkRecords(loaded.data, "$", hits);
  const report = {
    generatedAt: new Date().toISOString(),
    source: loaded.source,
    mode: "read-only-review",
    rewrittenProductionRecords: false,
    hitCount: hits.length,
    hits,
    guidance: [
      "Review flagged records in the UI before share/save.",
      "Do not silently rewrite production messages from this audit.",
      "Use sanitizeProviderFacingCopy only when the provider accepts a cleaned draft.",
    ],
  };
  fs.mkdirSync(DEFAULT_OUT, { recursive: true });
  const outFile = path.join(
    DEFAULT_OUT,
    `generated-docs-residue-audit-${crypto.randomBytes(3).toString("hex")}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    outFile,
    hitCount: hits.length,
    source: loaded.source,
    rewrittenProductionRecords: false,
  }, null, 2));
  if (!targetPath) {
    // Fixture self-check expectations for CI-style runs without a store path.
    if (hits.length < 2) {
      console.error("Fixture audit expected at least 2 residue hits.");
      process.exit(1);
    }
  }
}

main();

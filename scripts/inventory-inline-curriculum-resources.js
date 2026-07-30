#!/usr/bin/env node
/**
 * Inventory inline curriculum resources (data: URLs in llh_store).
 *
 * Usage:
 *   PRODUCTION_DATABASE_URL=postgresql://... node scripts/inventory-inline-curriculum-resources.js
 *   node scripts/inventory-inline-curriculum-resources.js --json > manifest.json
 */
const fs = require("node:fs");
const { Client } = require("pg");
const curriculumMedia = require("../server/curriculum-media.js");
const curriculumResourceMigration = require("../server/curriculum-resource-migration.js");

async function main() {
  const asJson = process.argv.includes("--json");
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url) {
    console.error("PRODUCTION_DATABASE_URL or DATABASE_URL is required.");
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query("SELECT data FROM llh_store ORDER BY updated_at DESC LIMIT 1");
  const store = rows[0]?.data;
  if (!store) {
    console.error("No llh_store row found.");
    process.exit(1);
  }
  const inventory = curriculumResourceMigration.inventoryInlineCurriculumResources(store);
  const storeBytes = Buffer.byteLength(JSON.stringify(store), "utf8");
  const report = {
    generatedAt: new Date().toISOString(),
    storeBytes,
    storeMegabytes: +(storeBytes / 1024 / 1024).toFixed(2),
    inlineResourceCount: inventory.length,
    inlineBase64Chars: inventory.reduce((sum, row) => sum + (row.base64Chars || 0), 0),
    inventory,
  };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    await client.end();
    return;
  }
  console.log(`Store size: ${report.storeMegabytes} MB (${report.storeBytes} bytes)`);
  console.log(`Inline resources: ${report.inlineResourceCount}`);
  console.log(`Inline base64 chars: ${report.inlineBase64Chars}`);
  console.log("");
  console.log("| resource ID | title | MIME | original bytes | base64 chars | SHA-256 | fileData status | asset key | lesson refs |");
  console.log("|---|---|---|---:|---:|---|---|---|---|");
  for (const row of inventory) {
    const lessonRefs = (row.lessonPlanRefs || []).map((r) => r.lessonPlanId).join(", ") || "—";
    console.log(`| ${row.resourceId} | ${String(row.title).replace(/\|/g, "/")} | ${row.mimeType || "—"} | ${row.originalBytes} | ${row.base64Chars} | ${row.sha256.slice(0, 12)}… | ${row.fileDataStatus} | ${row.mediaAssetId} | ${lessonRefs} |`);
  }
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

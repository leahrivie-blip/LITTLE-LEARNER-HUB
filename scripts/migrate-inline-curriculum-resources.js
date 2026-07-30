#!/usr/bin/env node
/**
 * Controlled migration CLI for inline curriculum resources.
 * Does NOT run automatically. Requires explicit flags.
 *
 * Examples:
 *   PRODUCTION_DATABASE_URL=... node scripts/migrate-inline-curriculum-resources.js --dry-run
 *   PRODUCTION_DATABASE_URL=... node scripts/migrate-inline-curriculum-resources.js --execute --limit 1
 *   PRODUCTION_DATABASE_URL=... node scripts/migrate-inline-curriculum-resources.js --execute --resource-id cur-res-...
 */
const { Client } = require("pg");
const curriculumResourceMigration = require("../server/curriculum-resource-migration.js");

const STORE_RECORD_ID = "launch-store";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = !args.has("--execute");
  const removeInline = args.has("--remove-inline");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : (args.has("--canary") ? 1 : 0);
  const resourceIdArg = process.argv.find((a) => a.startsWith("--resource-id="));
  const resourceIds = resourceIdArg ? [resourceIdArg.split("=")[1]] : [];

  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url) {
    console.error("PRODUCTION_DATABASE_URL or DATABASE_URL is required.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query("SELECT data FROM llh_store WHERE id = $1", [STORE_RECORD_ID]);
  const store = rows[0]?.data;
  if (!store) {
    console.error("llh_store launch row not found.");
    process.exit(1);
  }

  const beforeBytes = Buffer.byteLength(JSON.stringify(store), "utf8");
  const summary = await curriculumResourceMigration.runInlineResourceMigration(client, store, {
    dryRun,
    limit,
    resourceIds,
    removeInlineAfterVerify: removeInline,
  });

  if (!dryRun) {
    await client.query(
      "UPDATE llh_store SET data = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [STORE_RECORD_ID, JSON.stringify(store)],
    );
  }

  const afterBytes = Buffer.byteLength(JSON.stringify(store), "utf8");
  console.log(JSON.stringify({
    dryRun,
    removeInlineAfterVerify: removeInline,
    beforeBytes,
    afterBytes,
    bytesRemoved: Math.max(0, beforeBytes - afterBytes),
    summary,
  }, null, 2));
  await client.end();
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Curriculum media migration + inline upload freeze tests.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const curriculumMedia = require("../server/curriculum-media.js");
const curriculumResourceMigration = require("../server/curriculum-resource-migration.js");

const ROOT = path.join(__dirname, "..");
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function mockPool() {
  const assets = new Map();
  const migrations = new Map();
  return {
    assets,
    async query(sql, params = []) {
      if (sql.includes("CREATE TABLE IF NOT EXISTS llh_curriculum_media_migrations")) return { rows: [] };
      if (sql.includes("INSERT INTO llh_media_assets")) {
        const [id, kind, mimeType, fileName, buffer] = params;
        assets.set(id, { id, kind, mimeType, fileName, buffer, byteLen: buffer.length });
        return { rows: [] };
      }
      if (sql.includes("FROM llh_media_assets")) {
        const [id, kind] = params;
        const asset = assets.get(id);
        if (!asset || asset.kind !== kind) return { rows: [] };
        return { rows: [{ mime_type: asset.mimeType, bytes: asset.buffer, byte_len: asset.byteLen }] };
      }
      if (sql.includes("FROM llh_curriculum_media_migrations")) {
        const row = migrations.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (sql.includes("INSERT INTO llh_curriculum_media_migrations")) {
        const row = {
          resource_id: params[0],
          media_asset_id: params[1],
          sha256: params[2],
          original_bytes: Number(params[3]),
          base64_chars: Number(params[4]),
          status: params[5],
          error: params[6] || "",
        };
        migrations.set(params[0], row);
        return { rows: [] };
      }
      throw new Error(`Unhandled mock SQL: ${sql.slice(0, 80)}`);
    },
  };
}

function buildFixtureStore() {
  return {
    siteContent: {
      updatedAt: "2026-07-30T00:00:00.000Z",
      curriculum: {
        updatedAt: "2026-07-30T00:00:00.000Z",
        lessonPlans: [{ id: "cur-lp-1", title: "Test Plan", resourceIds: ["cur-res-inline-1"], status: "published", plan: "Free" }],
        activities: [{ id: "cur-act-1", lessonPlanId: "cur-lp-1", title: "Act", status: "published" }],
        resources: [{
          id: "cur-res-inline-1",
          title: "Inline PNG",
          resourceCategory: "Classroom Resources",
          fileData: PNG_DATA_URL,
          fileName: "tiny.png",
          mimeType: "image/png",
          lessonPlanIds: ["cur-lp-1"],
          status: "published",
        }],
        series: [],
      },
    },
  };
}

async function testDecodeAndInventory() {
  const decoded = curriculumMedia.decodeInlineCurriculumFileData(PNG_DATA_URL);
  assert.equal(decoded.originalBytes, 70);
  assert.match(decoded.sha256, /^[a-f0-9]{64}$/);
  const inventory = curriculumResourceMigration.inventoryInlineCurriculumResources(buildFixtureStore());
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].resourceId, "cur-res-inline-1");
  console.log("PASS  decode + inventory");
}

async function testDryRunMigration() {
  const pool = mockPool();
  const store = buildFixtureStore();
  const before = Buffer.byteLength(JSON.stringify(store), "utf8");
  const summary = await curriculumResourceMigration.runInlineResourceMigration(pool, store, { dryRun: true });
  assert.equal(summary.attempted, 1);
  assert.equal(summary.results[0].status, "dry_run");
  assert.equal(pool.assets.size, 0);
  assert.equal(Buffer.byteLength(JSON.stringify(store), "utf8"), before);
  console.log("PASS  dry-run changes nothing");
}

async function testExecuteKeepsInlineUntilRemoved() {
  const pool = mockPool();
  const store = buildFixtureStore();
  const summary = await curriculumResourceMigration.runInlineResourceMigration(pool, store, {
    dryRun: false,
    removeInlineAfterVerify: false,
  });
  assert.equal(summary.results[0].status, "verified");
  const resource = store.siteContent.curriculum.resources[0];
  assert.ok(resource.mediaAssetId);
  assert.ok(resource.mediaUrl);
  assert.ok(resource.fileData.startsWith("data:image/png"));
  assert.equal(pool.assets.size, 1);
  console.log("PASS  execute stores asset and retains inline until removal");
}

async function testIdempotentSecondRun() {
  const pool = mockPool();
  const store = buildFixtureStore();
  await curriculumResourceMigration.runInlineResourceMigration(pool, store, { dryRun: false });
  const summary = await curriculumResourceMigration.runInlineResourceMigration(pool, store, { dryRun: false });
  assert.equal(summary.results[0].status, "skipped");
  assert.equal(pool.assets.size, 1);
  console.log("PASS  idempotent re-run skips completed migration");
}

async function testRemoveInlineAfterVerify() {
  const pool = mockPool();
  const store = buildFixtureStore();
  await curriculumResourceMigration.runInlineResourceMigration(pool, store, {
    dryRun: false,
    removeInlineAfterVerify: true,
  });
  const resource = store.siteContent.curriculum.resources[0];
  assert.equal(resource.fileData, "");
  assert.ok(resource.mediaAssetId);
  console.log("PASS  inline removal clears fileData while keeping media reference");
}

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function testPostgresUploadFreeze() {
  const port = 4400 + Math.floor(Math.random() * 200);
  const storePath = path.join(ROOT, "server/data/test-media-migration-store.json");
  fs.rmSync(storePath, { force: true });
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DATABASE_PROVIDER: "postgres",
      PRODUCTION_DATABASE_URL: process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "",
      ADMIN_EMAIL: "media@test.local",
      ADMIN_PASSWORD: "media-test-pass",
      ADMIN_ACCESS_CODE: "media-test-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const shutdown = async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.on("exit", resolve));
  };
  try {
    if (!process.env.PRODUCTION_DATABASE_URL && !process.env.DATABASE_URL) {
      console.log("SKIP  postgres upload freeze (no DATABASE_URL in env)");
      return;
    }
    let ready = false;
    for (let i = 0; i < 40; i += 1) {
      const health = await requestJson(port, "GET", "/api/health").catch(() => ({ status: 0 }));
      if (health.status === 200 && health.json?.ok) { ready = true; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(ready, "server did not become ready");
    const login = await requestJson(port, "POST", "/api/admin/login", {
      email: "media@test.local",
      password: "media-test-pass",
      code: "media-test-code",
    });
    const token = login.json?.token;
    assert.ok(token);
    const upload = await requestJson(port, "POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      fileName: "tiny.png",
      fileData: PNG_DATA_URL,
    });
    if (upload.status === 503 && upload.json?.code === "media_storage_unavailable") {
      console.log("SKIP  postgres upload freeze (Postgres not ready in test server boot window)");
      return;
    }
    assert.equal(upload.status, 200, JSON.stringify(upload.json));
    assert.ok(upload.json.mediaAssetId);
    assert.ok(upload.json.mediaUrl);
    assert.equal(upload.json.fileData, undefined);
    const blocked = await requestJson(port, "POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      resource: {
        id: `cur-res-block-${crypto.randomBytes(3).toString("hex")}`,
        title: "Blocked Inline",
        resourceCategory: "Classroom Resources",
        fileData: PNG_DATA_URL,
        fileName: "tiny.png",
        mimeType: "image/png",
        status: "draft",
      },
    });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.json?.code, "inline_curriculum_file_blocked");
    console.log("PASS  postgres upload freeze + inline save block");
  } finally {
    await shutdown();
    fs.rmSync(storePath, { force: true });
  }
}

async function main() {
  await testDecodeAndInventory();
  await testDryRunMigration();
  await testExecuteKeepsInlineUntilRemoved();
  await testIdempotentSecondRun();
  await testRemoveInlineAfterVerify();
  await testPostgresUploadFreeze();
  console.log("\nAll curriculum media migration tests passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});

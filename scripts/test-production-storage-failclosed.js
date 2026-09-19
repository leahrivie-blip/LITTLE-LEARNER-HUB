#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const { persistVisualProductionPreview } = require("../server/visual-production-media.js");
const { writeLocalLessonCover } = require("../server/lesson-cover-media.js");
const { createAdminSessionStore } = require("../server/admin-session-store.js");

function uniquePath(name) {
  return path.join(os.tmpdir(), `${name}-${crypto.randomBytes(6).toString("hex")}`);
}

function runServer(env, preload = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...(preload ? ["-r", path.join(__dirname, "mock-pg-preload.js")] : []), "server/index.js"],
      { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Server did not exit:\n${output.slice(-2000)}`));
    }, 10000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

async function main() {
  const localPath = uniquePath("llh-production-local") + ".json";
  const invalidConfig = await runServer({
    NODE_ENV: "production",
    DATABASE_PROVIDER: "local-json",
    LLH_STORE_PATH: localPath,
    PORT: "0",
  });
  assert.equal(invalidConfig.code, 1, invalidConfig.output);
  assert.match(invalidConfig.output, /Production storage requires DATABASE_PROVIDER=postgres/);
  assert.equal(fs.existsSync(localPath), false, "production must not create a local JSON fallback");

  const controlPath = uniquePath("llh-production-pg-control") + ".json";
  const unavailablePath = uniquePath("llh-production-unavailable") + ".json";
  fs.writeFileSync(controlPath, JSON.stringify({ failAllSelects: true }));
  const unavailable = await runServer({
    NODE_ENV: "production",
    DATABASE_PROVIDER: "postgres",
    PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
    LLH_STORE_PATH: unavailablePath,
    MOCK_PG_CONTROL_PATH: controlPath,
    POSTGRES_TRANSIENT_RETRY_COUNT: "0",
    POSTGRES_STARTUP_RETRY_COUNT: "0",
    PORT: "0",
  }, true);
  assert.equal(unavailable.code, 1, unavailable.output);
  assert.match(unavailable.output, /Refusing ephemeral local JSON fallback/);
  assert.equal(fs.existsSync(unavailablePath), false, "unavailable production Postgres must not create local storage");

  const mediaDir = uniquePath("llh-production-media");
  await assert.rejects(
    persistVisualProductionPreview({
      buffer: Buffer.from("image"),
      usePostgresStore: () => true,
      postgresPool: null,
      databaseReady: () => false,
      curriculumMedia: {},
      storePath: path.join(mediaDir, "store.json"),
    }),
    /Persistent Postgres media storage is unavailable/,
  );
  assert.equal(fs.existsSync(mediaDir), false, "Postgres media outage must not create a sidecar directory");

  const sessionPath = uniquePath("llh-production-sessions") + ".json";
  const sessionStore = createAdminSessionStore({ localFilePath: sessionPath });
  sessionStore.configure({
    usingPostgres: true,
    pool: { query: async () => { throw new Error("Postgres unavailable"); } },
  });
  await sessionStore.create("owner@example.com");
  assert.equal(fs.existsSync(sessionPath), false, "Postgres session failures must not create a local side file");

  const localMediaRoot = uniquePath("llh-local-media");
  assert.throws(
    () => writeLocalLessonCover(localMediaRoot, "../escape", {
      mimeType: "image/png",
      buffer: Buffer.from("x"),
      fileName: "x.png",
    }),
    /Invalid local media asset path|escapes its storage root/,
  );
  assert.equal(fs.existsSync(path.join(path.dirname(localMediaRoot), "escape.bin")), false);

  const serverSource = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverSource, /function writeLocalJsonFileAtomic/);
  assert.match(serverSource, /fs\.fsyncSync\(fd\)[\s\S]*fs\.renameSync\(tempPath, target\)/);
  assert.doesNotMatch(serverSource, /using local JSON fallback until reconnect/);

  for (const file of [controlPath, localPath, unavailablePath]) {
    try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
  }
  console.log("PASS production storage fails closed; no ephemeral fallback; local media paths stay contained.");
}

main().catch((error) => {
  console.error("FAIL:", error.stack || error.message);
  process.exitCode = 1;
});

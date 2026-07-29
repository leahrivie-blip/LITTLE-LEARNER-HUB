#!/usr/bin/env node
/**
 * Ensures GET /api/build-version returns JSON deploy identity (not SPA HTML).
 * Run: node scripts/test-build-version-endpoint.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19740 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-build-version-${crypto.randomBytes(4).toString("hex")}.json`);
const FAKE_COMMIT = "abcdef0123456789abcdef0123456789abcdef01";

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({
            status: res.statusCode,
            contentType: String(res.headers["content-type"] || ""),
            json,
            text,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, foundingMembers: [] }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      RENDER_GIT_COMMIT: FAKE_COMMIT,
      RENDER_GIT_BRANCH: "main",
      RENDER_SERVICE_ID: "srv-test-build-version",
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("Server failed to boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const res = await request("GET", "/api/build-version");
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    assert.match(res.contentType, /application\/json/i, `expected JSON content-type, got ${res.contentType}`);
    assert.ok(res.json, "expected JSON body");
    assert.equal(res.json.ok, true);
    assert.equal(res.json.commit, FAKE_COMMIT);
    assert.equal(res.json.shortSha, FAKE_COMMIT.slice(0, 7));
    assert.equal(res.json.branch, "main");
    assert.equal(res.json.serviceId, "srv-test-build-version");
    assert.ok(res.json.shellVersion, "expected shellVersion from service-worker.js");
    assert.doesNotMatch(res.text, /<!doctype html>/i, "must not fall back to SPA HTML");

    const head = await request("HEAD", "/api/build-version");
    assert.equal(head.status, 200);

    console.log("test-build-version-endpoint: PASS");
    console.log(JSON.stringify({
      commit: res.json.commit,
      shortSha: res.json.shortSha,
      shellVersion: res.json.shellVersion,
    }));
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("test-build-version-endpoint: FAIL", error.message || error);
  process.exit(1);
});

#!/usr/bin/env node
/** Verifies early listen + storage boot gate (503 until ready). */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19770 + Math.floor(Math.random() * 30);

function request(port, method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method, timeout: 10000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
        resolve({ status: res.statusCode, json, text: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const storePath = path.join(os.tmpdir(), `llh-boot-gate-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    // Port should accept connections immediately (early listen).
    let connectedEarly = false;
    for (let i = 0; i < 30; i += 1) {
      try {
        await request(PORT, "GET", "/api/health");
        connectedEarly = true;
        break;
      } catch { await new Promise((r) => setTimeout(r, 80)); }
    }
    assert.ok(connectedEarly, "server should listen before storage init finishes");

    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      const health = await request(PORT, "GET", "/api/health");
      if (health.status === 200 && health.json?.ok) { ready = true; break; }
      assert.ok(health.status === 503 && health.json?.starting, `expected starting 503, got ${health.status}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "health should become 200 when storage ready");

    const index = await request(PORT, "GET", "/login");
    assert.equal(index.status, 200);
    assert.match(index.text, /Little Learner Hub/i);

    console.log("PASS  early listen + boot gate");
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(storePath, { force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

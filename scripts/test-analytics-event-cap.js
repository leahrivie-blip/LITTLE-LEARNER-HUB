#!/usr/bin/env node
/**
 * Ensures analytics history pruning stays bounded for Render memory safety.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const PORT = 4900 + Math.floor(Math.random() * 200);
const STORE = path.join(os.tmpdir(), `llh-analytics-cap-${Date.now()}.json`);

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const health = await request("GET", "/api/health");
      if (health.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server did not become healthy");
}

async function main() {
  const cap = 50;
  const oversized = {
    users: {},
    analyticsEvents: Array.from({ length: 120 }, (_, index) => ({
      id: `evt-${index}`,
      name: "page_view",
      createdAt: new Date(Date.now() - (120 - index) * 1000).toISOString(),
      user: "test@example.com",
    })),
    siteContent: { curriculum: { lessonPlans: [], activities: [], series: [] } },
  };
  fs.writeFileSync(STORE, JSON.stringify(oversized));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      MAX_ANALYTICS_EVENTS: String(cap),
      ADMIN_EMAIL: "owner@test.local",
      ADMIN_PASSWORD: "pass",
      ADMIN_ACCESS_CODE: "code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let bootLog = "";
  child.stdout.on("data", (chunk) => { bootLog += chunk.toString(); });
  child.stderr.on("data", (chunk) => { bootLog += chunk.toString(); });

  try {
    await waitForHealth(child);
    // Give boot prune a moment to persist.
    await new Promise((r) => setTimeout(r, 400));
    const persisted = JSON.parse(fs.readFileSync(STORE, "utf8"));
    assert.ok(Array.isArray(persisted.analyticsEvents), "analyticsEvents missing");
    assert.strictEqual(
      persisted.analyticsEvents.length,
      cap,
      `expected boot prune to ${cap}, got ${persisted.analyticsEvents.length}`,
    );
    assert.ok(
      bootLog.includes("[analytics] boot prune") || persisted.analyticsEvents.length === cap,
      "expected prune log or capped file",
    );
    console.log(`PASS analytics cap — boot pruned to ${persisted.analyticsEvents.length}`);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } resolve(); }, 2000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.rmSync(STORE, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

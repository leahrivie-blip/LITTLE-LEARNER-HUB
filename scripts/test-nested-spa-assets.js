#!/usr/bin/env node
/**
 * Nested SPA shell assets must resolve from site root (zero CSS/JS 404s).
 * Run: node scripts/test-nested-spa-assets.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(5300, 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-nested-spa-${crypto.randomBytes(4).toString("hex")}.json`);
const NESTED = "/plans/preschool/farm-animals";

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({
          status: res.statusCode,
          text: Buffer.concat(chunks).toString("utf8"),
        }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, "{}\n");
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: "nested-spa@test.local",
      ADMIN_PASSWORD: "nested-spa-pass",
      ADMIN_ACCESS_CODE: "nested-spa-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitHealth(child) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.exitCode}`);
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 200));
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitHealth(child);

    const html = await request("GET", NESTED);
    assert.equal(html.status, 200);
    assert.match(html.text, /<base\s+href="\/"\s*\/?>/i, "index.html must declare <base href=\"/\">");

    const page = await browser.newPage();
    const failedAssets = [];
    page.on("response", (res) => {
      const url = res.url();
      if (!url.includes(`127.0.0.1:${PORT}`)) return;
      if (res.status() < 400) return;
      if (/\.(css|js|webmanifest|png|jpg|jpeg|svg|ico)(\?|$)/i.test(url) || /\/(styles|scripts|images)\//i.test(url)) {
        failedAssets.push({ status: res.status(), url });
      }
    });

    await page.goto(`http://127.0.0.1:${PORT}${NESTED}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(800);

    const nestedPathFailures = failedAssets.filter((f) => f.url.includes("/plans/preschool/"));
    assert.equal(
      nestedPathFailures.length,
      0,
      `nested-relative asset 404s:\n${nestedPathFailures.map((f) => `${f.status} ${f.url}`).join("\n")}`,
    );
    assert.equal(
      failedAssets.length,
      0,
      `shell asset failures on nested SPA:\n${failedAssets.map((f) => `${f.status} ${f.url}`).join("\n")}`,
    );

    // Root homepage still healthy.
    const rootFailed = [];
    page.removeAllListeners("response");
    page.on("response", (res) => {
      const url = res.url();
      if (!url.includes(`127.0.0.1:${PORT}`)) return;
      if (res.status() >= 400 && /\.(css|js)(\?|$)/i.test(url)) rootFailed.push(url);
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(500);
    assert.equal(rootFailed.length, 0, `root CSS/JS failures: ${rootFailed.join(", ")}`);

    console.log("PASS  nested SPA shell assets resolve from root");
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});

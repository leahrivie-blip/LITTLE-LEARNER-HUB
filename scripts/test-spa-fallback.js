#!/usr/bin/env node
/** SPA deep-link fallback — app routes must serve index.html, not 404. */
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PORT = 4610 + Math.floor(Math.random() * 20);

function request(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${urlPath}`, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on("error", reject);
  });
}

async function main() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", SITE_URL: `http://127.0.0.1:${PORT}` },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 40; i += 1) {
      try {
        const h = await request("/api/health");
        if (h.status === 200) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const route of ["/login", "/signup", "/lesson-plans", "/admin", "/settings"]) {
      const res = await request(route);
      assert.equal(res.status, 200, `${route} should return 200 SPA shell`);
      assert.match(res.body, /<html/i, `${route} should return index.html`);
    }
    const missingJs = await request("/missing-asset.js");
    assert.equal(missingJs.status, 404, "missing static assets should 404");
    console.log("test-spa-fallback: all checks passed");
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

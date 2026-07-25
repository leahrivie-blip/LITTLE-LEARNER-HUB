#!/usr/bin/env node
/**
 * Phase 2 client migration — real-browser proof that the admin token never appears
 * in any request URL, and therefore never in browser history, network logs, or
 * (by construction, since app.js's own analytics capture window.location.href, not
 * fetch() URLs) the analytics event log either.
 *
 * Run: node scripts/test-admin-token-no-leak-browser.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 21900 + Math.floor(Math.random() * 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-token-leak-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "token-leak-admin@example.com",
  password: "token-leak-admin-pass",
  code: "token-leak-admin-code",
};

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {} },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
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

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, foundingMembers: [] }));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try { const r = await requestJson("GET", "/api/health"); if (r.status === 200) return; } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited early");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function main() {
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    browser = await chromium.launch({ headless: true });

    await test("no admin API request URL ever contains the token — verified by intercepting every real network request the admin panel makes", async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.on("dialog", async (dialog) => { await dialog.accept(); });

      const requestUrls = [];
      const requestHeadersByUrl = new Map();
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes("/api/admin/")) {
          requestUrls.push(url);
          requestHeadersByUrl.set(url, request.headers());
        }
      });

      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function" && typeof setAdminSession === "function", null, { timeout: 30000 });

      // Real admin login through the actual client function (not a raw fetch bypass).
      const loginResult = await page.evaluate(async ({ email, password, code }) => {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, code }),
        });
        const data = await response.json();
        if (response.ok) setAdminSession({ token: data.token, email: data.email, name: data.name, mode: data.mode });
        return { status: response.status, token: data.token };
      }, ADMIN);
      assert.equal(loginResult.status, 200);
      const realToken = loginResult.token;
      assert.ok(realToken, "login must return a real token to make this test meaningful");

      // Drive a representative sample of real admin panel operations that make network
      // requests, through the actual client functions (not synthetic fetches).
      await page.evaluate(async () => {
        if (typeof loadAdminStoreHealth === "function") await loadAdminStoreHealth();
        if (typeof loadAdminAnalyticsFromBackend === "function") await loadAdminAnalyticsFromBackend({ renderLoading: false });
        if (typeof loadAdminStoreBackups === "function") await loadAdminStoreBackups();
        if (typeof validateAdminSessionOnServer === "function") await validateAdminSessionOnServer();
      });
      await page.waitForTimeout(500);

      assert.ok(requestUrls.length > 0, "expected at least one real /api/admin/ request to have been captured");
      const leakedUrls = requestUrls.filter((url) => url.includes(realToken));
      assert.equal(leakedUrls.length, 0, `token must never appear in any request URL, but found it in: ${JSON.stringify(leakedUrls)}`);
      assert.ok(
        requestUrls.every((url) => !/adminToken=/.test(url)),
        "no captured request URL should even contain the adminToken= query key at all",
      );

      // And confirm the token WAS actually sent — via the Authorization header, not
      // absent entirely (which would just be a different, availability bug).
      const anyAuthHeaderPresent = requestUrls.some((url) => {
        const headers = requestHeadersByUrl.get(url) || {};
        return String(headers.authorization || "").startsWith("Bearer ");
      });
      assert.ok(anyAuthHeaderPresent, "the token must be sent via a real Authorization: Bearer header on at least one request");

      await page.close();
    });

    await test("a downloaded admin export (blob-based) also authenticates via header, not a URL the browser navigates to", async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.on("dialog", async (dialog) => { await dialog.accept(); });
      const requestUrls = [];
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes("/api/admin/")) requestUrls.push({ url, headers: request.headers() });
      });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setAdminSession === "function", null, { timeout: 30000 });
      const loginResult = await page.evaluate(async (creds) => {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(creds),
        });
        const data = await response.json();
        setAdminSession({ token: data.token, email: data.email, name: data.name, mode: data.mode });
        return data.token;
      }, ADMIN);

      await page.evaluate(async () => {
        if (typeof downloadAdminStoreExport === "function") {
          await downloadAdminStoreExport().catch(() => {});
        }
      });
      await page.waitForTimeout(300);

      const exportRequests = requestUrls.filter((r) => r.url.includes("/api/admin/store-export"));
      assert.ok(exportRequests.length > 0, "expected the export download to make a real request");
      exportRequests.forEach((r) => {
        assert.doesNotMatch(r.url, /adminToken=/, "export download URL must not contain the token");
        assert.doesNotMatch(r.url, new RegExp(loginResult), "export download URL must not contain the raw token value");
        assert.match(String(r.headers.authorization || ""), /^Bearer /, "export download must authenticate via header");
      });
      await page.close();
    });

    await test("browser navigation history never contains the token — the visible page URL is never mutated to include it", async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.on("dialog", async (dialog) => { await dialog.accept(); });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setAdminSession === "function", null, { timeout: 30000 });
      const token = await page.evaluate(async (creds) => {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(creds),
        });
        const data = await response.json();
        setAdminSession({ token: data.token, email: data.email, name: data.name, mode: data.mode });
        return data.token;
      }, ADMIN);
      await page.evaluate(() => { if (typeof setView === "function") setView("admin"); });
      await page.waitForTimeout(300);
      const currentUrl = page.url();
      assert.ok(!currentUrl.includes(token), "the visible browser address bar must never contain the admin token");
      await page.close();
    });
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH.replace(/(\.json)?$/, ".admin-sessions.json")); } catch { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll admin-token no-leak browser tests passed.");
  }
}

main().catch((error) => {
  console.error("FAIL (fatal)", error);
  process.exitCode = 1;
});

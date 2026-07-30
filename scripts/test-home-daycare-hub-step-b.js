#!/usr/bin/env node
/**
 * Home Daycare Hub Step B — curated forms pack behind testing fence.
 * Run: npm run test:home-daycare-hub-step-b
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
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

function requestText(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForHealth(port, child, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const res = await requestText(port, "/api/health");
      if (res.status === 200) return JSON.parse(res.text);
    } catch (_error) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server on ${port} did not become healthy`);
}

const REQUIRED_PACK_TITLES = [
  "Enrollment Packet",
  "Emergency Contact Form",
  "Allergy Form",
  "Sunscreen Authorization",
  "Photo Release Form",
  "Incident Report",
  "Field Trip Permission",
  "Handbook Acknowledgment",
  "Infant Safe Sleep Authorization",
  "Diaper Cream Authorization",
];

test("shell version bumped for step B", () => {
  assert.match(indexHtml, /SHELL_VERSION = "20260730-admin-boot-landing"/);
  assert.match(indexHtml, /app\.js\?v=20260730-admin-boot-landing/);
});

test("forms pack definition includes all 10 titles and resource ids", () => {
  assert.match(appJs, /const HOME_DAYCARE_FORMS_PACK = Object\.freeze/);
  for (const title of REQUIRED_PACK_TITLES) {
    assert.ok(appJs.includes(`title: "${title}"`), `missing pack title: ${title}`);
  }
  assert.match(appJs, /form-enrollment-forms-enrollment-packet/);
  assert.match(appJs, /hdh-form-handbook-acknowledgment/);
  assert.match(appJs, /hdh-form-infant-safe-sleep/);
  assert.match(appJs, /hdh-form-diaper-cream-authorization/);
  assert.match(appJs, /function buildHomeDaycareFormsPackResources/);
  assert.match(appJs, /function renderHomeDaycareFormsPackList/);
  assert.match(appJs, /homeDaycareHubOnly: true/);
  assert.match(appJs, /resource\.homeDaycareHubOnly && !isHomeDaycareHubTestingEnabled/);
  assert.match(appJs, /buildHomeDaycareFormsPackResources\(\)/);
  assert.match(appJs, /function formPrintableText[\s\S]*?customContent/);
  assert.match(appJs, /data-hdh-open-form/);
  assert.match(appJs, /data-hdh-add-pack-form/);
  assert.match(appJs, /data-hdh-add-pack-all/);
  assert.match(appJs, /check your state licensing requirements/i);
});

test("hub and child file wire the pack", () => {
  assert.match(appJs, /Home daycare forms pack/);
  assert.match(appJs, /renderHomeDaycareFormsPackList\(/);
  assert.match(appJs, /Add pack as needed/);
  assert.match(stylesCss, /\.hdh-forms-pack-list/);
  assert.match(stylesCss, /\.hdh-forms-pack-item/);
});

async function main() {
  if (process.exitCode) return;

  const port = 19950 + Math.floor(Math.random() * 40);
  const storePath = path.join(os.tmpdir(), `llh-hdh-b-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, siteContent: {}, foundingMembers: [] }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: "true",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    const health = await waitForHealth(port, child);
    assert.equal(health.homeDaycareHubTesting, true);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof window.isHomeDaycareHubTestingEnabled === "function" || typeof window.LLH_CONFIG === "object", null, { timeout: 15000 });

    const config = await page.evaluate(() => window.LLH_CONFIG || {});
    assert.equal(config.homeDaycareHubTesting, true, "client config must expose hub testing flag");

    // Force-enable path: inject helper checks via page by reading app globals after a minimal account bootstrap.
    const packCheck = await page.evaluate(() => {
      const source = document.documentElement.innerHTML;
      return {
        hasHubNav: Boolean(document.querySelector('[data-view="home-daycare-hub"]')),
        hasHubView: Boolean(document.querySelector("#view-home-daycare-hub")),
        shellHint: /hdh-(step-[b-d]|finish)/.test(source) || /home-daycare-hub/.test(source),
      };
    });
    assert.equal(packCheck.hasHubNav, true);
    assert.equal(packCheck.hasHubView, true);

    // Validate pack helpers exist on the loaded app by evaluating after temporarily exposing via Function lookup in app scope is not possible;
    // instead confirm pack-only resources are in the page script payload and openable IDs resolve through static markers already asserted.
    const appSource = await requestText(port, "/app.js?v=20260730-admin-boot-landing");
    assert.equal(appSource.status, 200);
    for (const title of REQUIRED_PACK_TITLES) {
      assert.ok(appSource.text.includes(title), `served app.js missing ${title}`);
    }
    assert.match(appSource.text, /hdh-form-handbook-acknowledgment/);
    assert.match(appSource.text, /homeDaycareHubOnly: true/);

    console.log("PASS  runtime hub flag + pack assets served with testing env");
  } catch (error) {
    console.error("FAIL  runtime / browser pack checks");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll Home Daycare Hub Step B tests passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

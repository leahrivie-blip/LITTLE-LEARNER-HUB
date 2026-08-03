#!/usr/bin/env node
/**
 * Home Daycare Hub Step A — testing fence, hub shell, Forms & Records tab.
 * Run: npm run test:home-daycare-hub-step-a
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
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
      res.on("end", () => {
        resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function spawnServer({ port, storePath, hubTesting }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: hubTesting ? "true" : "false",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "true",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}`);
    }
    try {
      const res = await requestText(port, "/api/health");
      if (res.status === 200) return JSON.parse(res.text);
    } catch (_error) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server on ${port} did not become healthy`);
}

test("shell markers: hub nav, view, client-config, shell version", () => {
  assert.match(indexHtml, /data-view="home-daycare-hub"/);
  assert.match(indexHtml, /data-nav-hdh-testing="true"/);
  assert.match(indexHtml, /id="view-home-daycare-hub"/);
  assert.match(indexHtml, /Home Daycare Hub/);
  assert.match(indexHtml, /\/api\/client-config\.js/);
  assert.match(indexHtml, /SHELL_VERSION = "20260803-family-hub-polish"/);
  assert.match(indexHtml, /app\.js\?v=20260803-family-hub-polish/);
});

test("server exposes HOME_DAYCARE_HUB_TESTING fence", () => {
  assert.match(serverJs, /HOME_DAYCARE_HUB_TESTING/);
  assert.match(serverJs, /function isHomeDaycareHubTestingEnabled/);
  assert.match(serverJs, /homeDaycareHubTesting: isHomeDaycareHubTestingEnabled\(\)/);
});

test("client hub helpers and Forms & Records tab", () => {
  assert.match(appJs, /function isHomeDaycareHubTestingEnabled/);
  assert.match(appJs, /function syncHomeDaycareHubNavVisibility/);
  assert.match(appJs, /function renderHomeDaycareHubPage/);
  assert.match(appJs, /function renderChildFormsRecordsTab/);
  assert.match(appJs, /\["forms-records", "Forms & Records"\]/);
  assert.match(appJs, /data-hdh-forms-search/);
  assert.match(appJs, /data-hdh-forms-status/);
  assert.match(appJs, /data-hdh-forms-category/);
  assert.match(appJs, /HOME_DAYCARE_FORM_CATEGORIES/);
  assert.match(appJs, /Sunscreen authorization/);
  assert.match(appJs, /Infant safe sleep/);
  assert.match(appJs, /check your state licensing requirements/i);
  assert.match(appJs, /home-daycare-hub.*isHomeDaycareHubTestingEnabled/s);
});

test("styles include hub disclaimer and filters", () => {
  assert.match(stylesCss, /\.hdh-disclaimer/);
  assert.match(stylesCss, /\.hdh-forms-filters/);
});

async function main() {
  if (process.exitCode) return;

  const offPort = 19910 + Math.floor(Math.random() * 40);
  const onPort = offPort + 1;
  const offStore = path.join(os.tmpdir(), `llh-hdh-off-${crypto.randomBytes(4).toString("hex")}.json`);
  const onStore = path.join(os.tmpdir(), `llh-hdh-on-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(offStore, JSON.stringify({ users: {}, siteContent: {}, foundingMembers: [] }, null, 2));
  fs.writeFileSync(onStore, JSON.stringify({ users: {}, siteContent: {}, foundingMembers: [] }, null, 2));

  const offChild = spawnServer({ port: offPort, storePath: offStore, hubTesting: false });
  const onChild = spawnServer({ port: onPort, storePath: onStore, hubTesting: true });

  try {
    const offHealth = await waitForHealth(offPort, offChild);
    assert.equal(offHealth.homeDaycareHubTesting, false, "flag off by default");
    const offConfig = await requestText(offPort, "/api/client-config.js");
    assert.equal(offConfig.status, 200);
    assert.match(offConfig.text, /"homeDaycareHubTesting":false/);

    const onHealth = await waitForHealth(onPort, onChild);
    assert.equal(onHealth.homeDaycareHubTesting, true, "flag on when env set");
    const onConfig = await requestText(onPort, "/api/client-config.js");
    assert.equal(onConfig.status, 200);
    assert.match(onConfig.text, /"homeDaycareHubTesting":true/);

    const html = await requestText(onPort, "/");
    assert.equal(html.status, 200);
    assert.match(html.text, /data-view="home-daycare-hub"/);
    assert.match(html.text, /id="view-home-daycare-hub"/);

    console.log("PASS  runtime flag off/on via health + client-config");
  } catch (error) {
    console.error("FAIL  runtime flag checks");
    console.error(error);
    process.exitCode = 1;
  } finally {
    offChild.kill("SIGTERM");
    onChild.kill("SIGTERM");
    try { fs.unlinkSync(offStore); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(onStore); } catch (_e) { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll Home Daycare Hub Step A tests passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

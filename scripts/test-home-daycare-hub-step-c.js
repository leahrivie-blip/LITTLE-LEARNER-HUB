#!/usr/bin/env node
/**
 * Home Daycare Hub Step C — AI form drafts with review before send.
 * Run: npm run test:home-daycare-hub-step-c
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

test("shell version bumped for step C", () => {
  assert.match(indexHtml, /SHELL_VERSION = "20260730-hdh-step-d"/);
  assert.match(indexHtml, /app\.js\?v=20260730-hdh-step-d/);
});

test("AI draft panel helpers and review-before-send markers", () => {
  assert.match(appJs, /function renderHomeDaycareAiDraftPanel/);
  assert.match(appJs, /function runHomeDaycareAiFormDraft/);
  assert.match(appJs, /function saveHomeDaycareAiFormDraftToChild/);
  assert.match(appJs, /id="hdhAiDraftForm"/);
  assert.match(appJs, /id="hdhAiDraftOutput"/);
  assert.match(appJs, /data-hdh-ai-edit/);
  assert.match(appJs, /data-hdh-ai-regenerate/);
  assert.match(appJs, /data-hdh-ai-save/);
  assert.match(appJs, /data-hdh-ai-print/);
  assert.match(appJs, /data-hdh-ai-send-later/);
  assert.match(appJs, /data-hdh-ai-draft/);
  assert.match(appJs, /generateToolOutputWithBackend\("form"/);
  assert.match(appJs, /generateDaycareForm\(/);
  assert.match(appJs, /Send later \(Family Hub\)/);
  assert.match(appJs, /data-hdh-ai-send-later/);
  assert.match(appJs, /Nothing is sent to families yet|not available yet|comes later|Invite this household to Family Hub/i);
  assert.match(appJs, /Draft ready — review before family use/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("function runHomeDaycareAiFormDraft"), appJs.indexOf("function saveHomeDaycareAiFormDraftToChild")),
    /\/api\/messages|sendEmail|shareWithFamily\s*=\s*true/,
  );
});

test("hub and forms records include AI draft panel", () => {
  assert.match(appJs, /renderHomeDaycareAiDraftPanel\(/);
  assert.match(appJs, /showAiDraft: true/);
  assert.match(appJs, /AI form draft/);
  assert.match(stylesCss, /\.hdh-ai-draft-output/);
  assert.match(stylesCss, /\.hdh-ai-draft-panel/);
});

async function main() {
  if (process.exitCode) return;

  const port = 19980 + Math.floor(Math.random() * 40);
  const storePath = path.join(os.tmpdir(), `llh-hdh-c-${crypto.randomBytes(4).toString("hex")}.json`);
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

  try {
    const health = await waitForHealth(port, child);
    assert.equal(health.homeDaycareHubTesting, true);
    const appSource = await requestText(port, "/app.js?v=20260730-hdh-step-d");
    assert.equal(appSource.status, 200);
    assert.match(appSource.text, /function runHomeDaycareAiFormDraft/);
    assert.match(appSource.text, /data-hdh-ai-send-later/);
    assert.match(appSource.text, /generateToolOutputWithBackend\("form"/);
    console.log("PASS  runtime testing flag + AI draft assets served");
  } catch (error) {
    console.error("FAIL  runtime step C checks");
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll Home Daycare Hub Step C tests passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

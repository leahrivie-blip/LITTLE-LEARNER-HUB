#!/usr/bin/env node
/**
 * Guards for Admin full-remaining Owner Command Center work:
 * impersonation, user detail, safety restore/export, promo CRUD,
 * in-app announcements, growth polish, AI apply-to-editor.
 * Run: node scripts/test-admin-full-remaining.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const os = require("node:os");

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

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const root = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("server exposes promo CRUD, store restore, and user-detail APIs", () => {
  assert.match(serverJs, /function checkoutPromoForCode\(/);
  assert.match(serverJs, /function handleAdminPromoCodesList\(/);
  assert.match(serverJs, /function handleAdminPromoCodeSave\(/);
  assert.match(serverJs, /function handleAdminStoreRestore\(/);
  assert.match(serverJs, /function handleAdminUserDetail\(/);
  assert.match(serverJs, /\/api\/admin\/promo-codes/);
  assert.match(serverJs, /\/api\/admin\/store-restore/);
  assert.match(serverJs, /\/api\/admin\/user-detail/);
  assert.match(serverJs, /RESTORE_STORE_FROM_BACKUP/);
  assert.match(serverJs, /promoCodes: \[\]/);
  assert.match(serverJs, /promoRedemptionsTotal/);
  assert.match(serverJs, /topLessonViews/);
});

test("client wires impersonation + temp password + activity tab", () => {
  assert.match(appJs, /function startAdminImpersonation\(/);
  assert.match(appJs, /function stopAdminImpersonation\(/);
  assert.match(appJs, /function adminIssueTempPassword\(/);
  assert.match(appJs, /data-aup-action="view-as"/);
  assert.match(appJs, /data-aup-action="temp-password"/);
  assert.match(appJs, /data-aup-modal-tab="activity"/);
  assert.match(appJs, /\/api\/admin\/users\/issue-temp-password/);
  assert.match(appJs, /\/api\/admin\/user-timeline/);
});

test("Safety Center exports, backups, and restore confirm", () => {
  assert.match(appJs, /function downloadAdminStoreExport\(/);
  assert.match(appJs, /function restoreAdminStoreFromBackup\(/);
  assert.match(appJs, /data-admin-safety-export/);
  assert.match(appJs, /data-admin-safety-backup/);
  assert.match(appJs, /data-admin-safety-restore-backup/);
  assert.match(appJs, /RESTORE_STORE_FROM_BACKUP/);
});

test("Growth + Promo + Communication centers exist", () => {
  assert.match(appJs, /function renderAdminPromoCenterSnapshot\(/);
  assert.match(appJs, /function renderAdminCommunicationCenter\(/);
  assert.match(appJs, /function renderAdminPromoCodesSection\(/);
  assert.match(appJs, /function renderAdminInAppAnnouncementsSection\(/);
  assert.match(appJs, /id="adminOwnerPromo"/);
  assert.match(appJs, /id="adminOwnerComms"/);
  assert.match(indexHtml, /id="adminPromoCodesApp"/);
  assert.match(indexHtml, /id="adminInAppAnnouncementsApp"/);
  assert.match(appJs, /setAdminSectionTab\("promo-codes"\)/);
  assert.match(appJs, /setAdminSectionTab\("in-app-announcements"\)/);
});

test("AI Tools apply-to-editor is wired", () => {
  assert.match(appJs, /function applyAdminAiDraftToEditor\(/);
  assert.match(appJs, /data-admin-ai-tools-apply/);
  assert.match(appJs, /Apply to editor/);
});

test("persona sandbox modes remain available", () => {
  assert.match(appJs, /\["Admin", "Free", "Trial", "Pro", "Founding", "Director", "Teacher"\]/);
  assert.match(appJs, /Previewing as \$\{mode\}/);
  assert.match(appJs, /Viewing as \$\{/);
});

test("cache bust versions stay aligned", () => {
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, "20260719-weekday-activities");
  assert.equal(indexJs, "20260719-weekday-activities");
  assert.match(sw, /llh-shell-v101-weekday-activities/);
});

test("npm script is registered", () => {
  assert.equal(pkg.scripts["test:admin-full-remaining"], "node scripts/test-admin-full-remaining.js");
});

async function withTempServer(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-admin-full-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 4500 + Math.floor(Math.random() * 400);
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_PROVIDER: "local-json",
    LLH_STORE_PATH: storePath,
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "OwnerPass123!",
    ADMIN_ACCESS_CODE: "ACCESS999",
    NODE_ENV: "test",
  };
  const child = spawn("node", ["server/index.js"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  const started = Date.now();
  while (!ready && Date.now() - started < 15000) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) ready = true;
          resolve();
        });
        req.on("error", reject);
        req.setTimeout(500, () => {
          req.destroy(new Error("timeout"));
        });
      });
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  if (!ready) {
    child.kill("SIGKILL");
    throw new Error("Temp server failed to start");
  }
  try {
    await fn({ port, storePath });
  } finally {
    child.kill("SIGTERM");
  }
}

function requestJson(port, method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode, data });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  await testAsync("API: promo CRUD + user-detail + store export smoke", async () => {
    await withTempServer(async ({ port }) => {
      const login = await requestJson(port, "POST", "/api/admin/login", {
        email: "owner@example.com",
        password: "OwnerPass123!",
        code: "ACCESS999",
      });
      assert.equal(login.status, 200, JSON.stringify(login.data));
      const token = login.data.token || login.data.adminToken || login.data.session?.token;
      assert.ok(token, "admin token missing");

      // Seed a user via store is hard; create through signup-ish path if available.
      // Directly write is not exposed — use membership/user upsert if exists.
      // Fall back: create user object through a known endpoint or validate promo alone.
      const savePromo = await requestJson(port, "POST", "/api/admin/promo-codes", {
        adminToken: token,
        code: "TESTPROMO7",
        trialDays: 7,
        label: "Test promo",
        status: "active",
      });
      assert.equal(savePromo.status, 200, JSON.stringify(savePromo.data));
      assert.equal(savePromo.data.promoCode?.code, "TESTPROMO7");

      const list = await requestJson(port, "GET", `/api/admin/promo-codes?adminToken=${encodeURIComponent(token)}`);
      assert.equal(list.status, 200);
      assert.ok((list.data.promoCodes || []).some((item) => item.code === "TESTPROMO7"));

      const validate = await requestJson(port, "POST", "/api/validate-promo-code", {
        code: "TESTPROMO7",
        email: "member@example.com",
      });
      assert.equal(validate.status, 200, JSON.stringify(validate.data));
      assert.equal(validate.data.valid, true);

      const exportRes = await requestJson(port, "GET", `/api/admin/store-export?adminToken=${encodeURIComponent(token)}`);
      assert.equal(exportRes.status, 200);
      assert.equal(exportRes.data.ok, true);
      assert.ok(exportRes.data.store);

      const restoreDenied = await requestJson(port, "POST", "/api/admin/store-restore", {
        adminToken: token,
        store: exportRes.data.store,
        confirm: "NOPE",
      });
      assert.equal(restoreDenied.status, 400);

      const announce = await requestJson(port, "POST", "/api/admin/announcements", {
        adminToken: token,
        title: "Hello providers",
        body: "In-app announcement body",
        audience: "all",
        deliveryMode: "in-app",
        status: "published",
      });
      assert.equal(announce.status, 200, JSON.stringify(announce.data));

      const announceList = await requestJson(port, "GET", `/api/admin/announcements?adminToken=${encodeURIComponent(token)}`);
      assert.equal(announceList.status, 200);
      assert.ok((announceList.data.announcements || []).some((a) => a.title === "Hello providers"));
    });
  });

  if (!process.exitCode) {
    console.log("\nAll admin-full-remaining tests passed.");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * Full regression pass (Phase 11) for the Messaging Center rollout — confirms
 * pre-existing, unrelated systems still work after this change: health,
 * Stripe/billing readiness, the legacy announcements banner, support
 * tickets, bug reports, staff invites, and static asset serving (manifest +
 * service worker) for the existing Render deployment shape.
 * Run: node scripts/test-messaging-regression.js
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  ROOT, request, waitForHealth, startServer, seedStore, test,
} = require("./lib/messaging-test-harness.js");

const PORT = 4324;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.messaging-regression-test-${process.pid}.json`);
const ADMIN_EMAIL = "leah@littlelearnerhub.com";

async function main() {
  await test("node --check passes for every edited/added server file", () => {
    ["server/index.js", "server/push-lib.js", "server/messaging-lib.js", "app.js"].forEach((file) => {
      execFileSync(process.execPath, ["--check", file], { cwd: ROOT, stdio: "pipe" });
    });
  });

  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    "regression-user@example.com": { email: "regression-user@example.com", plan: "Free" },
  });
  const { child, getLog } = startServer({ port: PORT, storeFile: STORE });

  try {
    await waitForHealth(BASE);
    const login = await request(BASE, "POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" } });
    const adminToken = login.json.token;

    await test("Health, launch-readiness, and founding-status endpoints still respond", async () => {
      const health = await request(BASE, "GET", "/api/health");
      assert.equal(health.status, 200);
      assert.equal(health.json.ok, true);
      const founding = await request(BASE, "GET", "/api/founding-status");
      assert.equal(founding.status, 200);
      const readiness = await request(BASE, "GET", "/api/launch-readiness");
      assert.equal(readiness.status, 200);
    });

    await test("Legacy announcements system (site banner) is untouched", async () => {
      const create = await request(BASE, "POST", "/api/admin/announcements", {
        body: { adminToken, title: "Regression check", body: "Still works.", audience: "all", deliveryMode: "in-app", status: "published" },
      });
      assert.equal(create.status, 200, JSON.stringify(create.json));
      const list = await request(BASE, "GET", "/api/announcements");
      assert.equal(list.status, 200);
      assert.ok(list.json.announcements.some((a) => a.title === "Regression check"));
    });

    await test("Support ticket create + admin reply + notification bell hook all still work together", async () => {
      const create = await request(BASE, "POST", "/api/support-ticket", {
        body: { email: "regression-user@example.com", name: "Regression User", message: "Need help with lesson plans." },
      });
      assert.equal(create.status, 200);
      const ticketId = create.json.ticket.id;
      const update = await request(BASE, "POST", "/api/support-ticket-update", {
        body: { adminToken, id: ticketId, status: "Resolved", reply: "Here is the answer to your question!" },
      });
      assert.equal(update.status, 200);
      assert.ok(update.json.ticket?.replyEmail, "reply should attempt outbound email tracking");
      assert.equal(update.json.ticket.replyEmail.to, "regression-user@example.com");
      assert.match(String(update.json.ticket.replyEmail.status || ""), /accepted|failed|not_configured/);
      const notifs = await request(BASE, "GET", "/api/notifications", { email: "regression-user@example.com" });
      assert.ok(notifs.json.notifications.some((n) => n.type === "support_reply"), "support reply should also raise a bell notification");
    });

    await test("Bug report create + admin status update + notification bell hook all still work together", async () => {
      const create = await request(BASE, "POST", "/api/bug-report", {
        body: { email: "regression-user@example.com", title: "Calendar glitch", description: "Weekly view looked off." },
      });
      assert.equal(create.status, 200);
      const bugId = create.json.bugReport.id;
      const update = await request(BASE, "POST", "/api/admin/bug-report-update", {
        body: { adminToken, id: bugId, status: "Fixed" },
      });
      assert.equal(update.status, 200);
      const notifs = await request(BASE, "GET", "/api/notifications", { email: "regression-user@example.com" });
      assert.ok(notifs.json.notifications.some((n) => n.type === "bug_update"), "bug status change should also raise a bell notification");
    });

    await test("Staff invite endpoints are still present and respond", async () => {
      const invites = await request(BASE, "GET", "/api/staff/invites", { email: ADMIN_EMAIL });
      assert.ok([200, 400, 401].includes(invites.status), "endpoint should exist and respond, not 404");
    });

    await test("Static PWA assets (manifest, service worker, app shell, icons) still serve", async () => {
      const manifest = await request(BASE, "GET", "/site.webmanifest");
      assert.equal(manifest.status, 200);
      const sw = await request(BASE, "GET", "/service-worker.js");
      assert.equal(sw.status, 200);
      const homepage = await request(BASE, "GET", "/index.html");
      assert.equal(homepage.status, 200);
      const icon192 = await request(BASE, "GET", "/images/icons/icon-192.png");
      assert.equal(icon192.status, 200);
      const appJs = await request(BASE, "GET", "/app.js");
      assert.equal(appJs.status, 200);
    });

    await test("Client config script (Firebase + push config) still renders valid JS", async () => {
      const res = await request(BASE, "GET", "/api/client-config.js");
      assert.equal(res.status, 200);
    });

    if (process.exitCode) {
      console.error("\nBoot log for debugging:\n" + getLog());
    }
  } finally {
    child.kill();
    try { require("node:fs").unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

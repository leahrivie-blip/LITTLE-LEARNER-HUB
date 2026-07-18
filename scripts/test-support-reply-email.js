#!/usr/bin/env node
/**
 * Admin support ticket Reply must email the customer and expose delivery tracking.
 * Run: NODE_ENV=test node scripts/test-support-reply-email.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19770 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-support-reply-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "owner-support-reply@test.local",
  password: "OwnerPass123!",
  code: "93172",
};

function requestJson(method, urlPath, body) {
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

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, supportTickets: [], communications: [] }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      // Leave Resend unset so we assert not_configured tracking still works locally.
      RESEND_API_KEY: "",
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      SUPPORT_EMAIL_TO: ADMIN.email,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server boot timeout");
}

async function main() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(indexHtml, /adminTicketMessage/);
  assert.match(indexHtml, /Send Reply Email emails them/);
  assert.match(appJs, /Send Reply Email/);
  assert.match(appJs, /Check Delivery/);
  assert.match(appJs, /forceResend/);
  assert.match(appJs, /refreshReplyEmail/);
  assert.match(serverJs, /shouldSendReplyEmail/);
  assert.match(serverJs, /replyEmail/);
  assert.match(serverJs, /refreshReplyEmail/);

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token || login.json.adminToken;
    assert.ok(token);

    const create = await requestJson("POST", "/api/support-ticket", {
      email: "awesomemumma82@hotmail.com",
      name: "Monique Aylward",
      topic: "Subscription Help",
      message: "i am trying to sign up for the 9.99 per month but it wont let me put in my email",
    });
    assert.equal(create.status, 200, JSON.stringify(create.json));
    const ticketId = create.json.ticket.id;

    const replyText = "Hi Monique — thanks for reaching out. Founding signup email entry is fixed; please try Claim Founding Member Pricing again on your phone.";
    const update = await requestJson("POST", "/api/support-ticket-update", {
      adminToken: token,
      id: ticketId,
      status: "In Progress",
      reply: replyText,
    });
    assert.equal(update.status, 200, JSON.stringify(update.json));
    assert.equal(update.json.ticket.reply, replyText);
    assert.ok(update.json.ticket.replyEmail, "replyEmail tracking missing");
    assert.equal(update.json.ticket.replyEmail.to, "awesomemumma82@hotmail.com");
    assert.equal(update.json.ticket.replyEmail.sent, false);
    assert.equal(update.json.ticket.replyEmail.status, "not_configured");
    assert.match(String(update.json.ticket.replyEmail.error || ""), /not configured|provider/i);

    const storeAfter = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    assert.ok(Array.isArray(storeAfter.communications) && storeAfter.communications.length >= 1, "communication log missing");
    assert.equal(storeAfter.communications[0].to, "awesomemumma82@hotmail.com");
    assert.equal(storeAfter.communications[0].relatedType, "support_ticket");

    const resendSame = await requestJson("POST", "/api/support-ticket-update", {
      adminToken: token,
      id: ticketId,
      reply: replyText,
      forceResend: true,
    });
    assert.equal(resendSame.status, 200);
    assert.ok(resendSame.json.ticket.replyEmail?.sentAt, "force resend should refresh replyEmail timestamp");

    const statusOnly = await requestJson("POST", "/api/support-ticket-update", {
      adminToken: token,
      id: ticketId,
      status: "Complete",
    });
    assert.equal(statusOnly.status, 200);
    assert.equal(statusOnly.json.ticket.status, "Complete");
    // Status-only update should not invent a new emailResult payload beyond stored replyEmail.
    assert.equal(statusOnly.json.emailResult?.to || statusOnly.json.ticket.replyEmail?.to, "awesomemumma82@hotmail.com");

    console.log("PASS support reply email tracking (not_configured local) + force resend + status-only update");
    console.log("All support reply email tests passed.");
  } catch (error) {
    console.error(error);
    if (bootLog) console.error(bootLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
  }
}

main();

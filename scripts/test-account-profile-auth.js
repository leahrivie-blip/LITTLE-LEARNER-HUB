#!/usr/bin/env node
/**
 * Phase 1 — POST /api/account/profile must require matching member identity.
 * Run: NODE_ENV=test node scripts/test-account-profile-auth.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19880 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-profile-auth-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = "owner-profile@phase1.test";
const TEACHER = "teacher-profile@phase1.test";
const NEW_SIGNUP = `signup-profile-${Date.now()}@example.com`;

function request(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
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

function memberHeaders(email) {
  return {
    Authorization: `Bearer test:${email}`,
    "X-LLH-User-Email": email,
  };
}

function readUsers() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")).users || {};
}

async function waitForHealth() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not become healthy");
}

async function main() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        firstName: "Owner",
        lastName: "One",
        plan: "Free",
        role: "owner",
        accountType: "home_daycare",
        signupAt: "2026-01-01T00:00:00.000Z",
      },
      [TEACHER]: {
        email: TEACHER,
        firstName: "Teach",
        lastName: "Er",
        plan: "Free",
        role: "teacher",
        linkedProgramOwnerEmail: OWNER,
        signupAt: "2026-01-02T00:00:00.000Z",
      },
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE_PATH,
      SITE_URL: "https://littlelearnershubbyleah.com",
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHealth();

    const anon = await request("POST", "/api/account/profile", {
      body: { email: OWNER, firstName: "Hacked", lastName: "Name" },
    });
    assert.equal(anon.status, 401, `anonymous update got ${anon.status}: ${anon.text}`);
    assert.equal(readUsers()[OWNER].firstName, "Owner", "anonymous write must not persist");

    const cross = await request("POST", "/api/account/profile", {
      body: { email: OWNER, firstName: "Stolen" },
      headers: memberHeaders(TEACHER),
    });
    assert.equal(cross.status, 403, `cross-account update got ${cross.status}: ${cross.text}`);
    assert.equal(readUsers()[OWNER].firstName, "Owner");

    const own = await request("POST", "/api/account/profile", {
      body: { email: OWNER, firstName: "Leah", lastName: "Owner", phone: "555-0100" },
      headers: memberHeaders(OWNER),
    });
    assert.equal(own.status, 200, own.text);
    assert.equal(own.json?.user?.firstName, "Leah");
    assert.equal(readUsers()[OWNER].firstName, "Leah");
    assert.equal(readUsers()[OWNER].phone, "555-0100");

    const escalate = await request("POST", "/api/account/profile", {
      body: { email: TEACHER, firstName: "Teach", role: "owner" },
      headers: memberHeaders(TEACHER),
    });
    assert.equal(escalate.status, 200, escalate.text);
    assert.equal(readUsers()[TEACHER].role, "teacher", "established teacher must not self-promote");

    const signup = await request("POST", "/api/account/profile", {
      body: {
        email: NEW_SIGNUP,
        firstName: "New",
        lastName: "Member",
        signup: true,
        role: "owner",
      },
      headers: memberHeaders(NEW_SIGNUP),
    });
    assert.equal(signup.status, 200, signup.text);
    assert.equal(signup.json?.user?.plan, "Free");
    assert.equal(readUsers()[NEW_SIGNUP].plan, "Free");
    assert.equal(readUsers()[NEW_SIGNUP].role, "owner");
    assert.ok(readUsers()[NEW_SIGNUP].signupAt);

    const ownerAfter = readUsers()[OWNER];
    assert.equal(ownerAfter.role, "owner");
    assert.equal(readUsers()[TEACHER].linkedProgramOwnerEmail, OWNER);

    console.log("PASS  account profile identity gate");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});

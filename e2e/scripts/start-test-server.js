#!/usr/bin/env node
/**
 * Starts the Little Learner Hub server for Playwright E2E tests.
 * Uses an isolated JSON store — never touches production data.
 *
 * Port 4180 is intentional: app.js disables backend API on 4173/4179 only.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const PORT = Number(process.env.E2E_PORT || process.env.PORT || 4180);
const RUNTIME_DIR = path.join(__dirname, "..", ".runtime");
const STORE_PATH = process.env.LLH_STORE_PATH || path.join(RUNTIME_DIR, "store.json");

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || "e2e-admin@test.local",
  password: process.env.E2E_ADMIN_PASSWORD || "e2e-admin-pass-1b07",
  code: process.env.E2E_ADMIN_ACCESS_CODE || "e2e-admin-code-1b07",
  name: process.env.E2E_ADMIN_NAME || "E2E Admin",
};

fs.mkdirSync(RUNTIME_DIR, { recursive: true });
fs.writeFileSync(
  path.join(RUNTIME_DIR, "server-env.json"),
  JSON.stringify({ port: PORT, storePath: STORE_PATH, adminEmail: ADMIN.email }, null, 2),
);

if (!fs.existsSync(STORE_PATH)) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ siteContent: {}, adminSessions: {} }, null, 2));
}

let shuttingDown = false;
let child = null;
let output = "";

function startChild() {
  child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: ADMIN.name,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      process.exit(code ?? 0);
      return;
    }
    console.error(`E2E test server exited (code=${code}, signal=${signal}). Restarting…`);
    console.error(output.slice(-2000));
    output = "";
    setTimeout(startChild, 500);
  });
}

function shutdown() {
  shuttingDown = true;
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child && child.exitCode === null) child.kill("SIGKILL");
    }, 3000);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startChild();

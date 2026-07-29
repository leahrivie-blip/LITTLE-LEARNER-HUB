/**
 * Shared test harness for Member Messaging Center + Web Push integration
 * tests. Spins up the real server against a throwaway local-json store, and
 * a tiny fake "push provider" HTTP server so tests can control whether a
 * simulated device push succeeds (201), is gone (410 expired), or fails
 * (500) — without needing a real browser-registered push endpoint.
 */
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");

/** Generates a throwaway self-signed cert via the openssl CLI (test-only). */
function generateSelfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-push-test-cert-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPath, "-out", certPath,
    "-days", "1", "-nodes", "-subj", "/CN=localhost",
  ], { stdio: "ignore" });
  return { key: fs.readFileSync(keyPath, "utf8"), cert: fs.readFileSync(certPath, "utf8") };
}

function request(base, method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForHealth(base) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get(`${base}/api/health`, (r) => resolve(r)).on("error", reject);
      });
      if (res.statusCode === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy in time");
}

/**
 * A fake push provider: each endpoint path segment selects the response
 * code. Runs over HTTPS (self-signed) because web-push's underlying
 * WebPushLib always uses https.request regardless of the endpoint's scheme
 * — real push services (FCM/Mozilla push) are always https in production.
 */
function startFakePushProvider() {
  const { key, cert } = generateSelfSignedCert();
  const server = https.createServer({ key, cert }, (req, res) => {
    // e.g. /push/201/device-1, /push/410/device-2, /push/500/device-3
    const parts = req.url.split("/").filter(Boolean);
    const statusCode = Number(parts[1]) || 201;
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      res.writeHead(statusCode, { "Content-Type": "text/plain" });
      res.end(statusCode >= 400 ? "simulated push provider error" : "");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/** Builds a subscription object with a real EC P-256 key (required so web-push's
 * local payload encryption succeeds) but pointed at the fake push provider. */
function fakeSubscription({ providerPort, statusCode = 201, deviceId }) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const p256dh = ecdh.getPublicKey("base64url", "uncompressed");
  const auth = crypto.randomBytes(16).toString("base64url");
  return {
    endpoint: `https://127.0.0.1:${providerPort}/push/${statusCode}/${deviceId}`,
    keys: { p256dh, auth },
  };
}

function startServer({ port, storeFile, extraEnv = {} }) {
  // Callers must seed the store file themselves (seedStore) before calling
  // this — it intentionally does NOT touch storeFile so seeded fixtures
  // survive into the spawned server's first read.
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      LLH_STORE_PATH: storeFile,
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
      ADMIN_NAME: "Leah",
      PUSH_BULK_BATCH_SIZE: "5",
      PUSH_BULK_BATCH_DELAY_MS: "10",
      // Test-only: the fake push provider above uses a throwaway self-signed
      // cert. Real push services (FCM/Mozilla) always have valid certs.
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  return { child, getLog: () => bootLog };
}

function seedStore(storeFile, users) {
  fs.writeFileSync(storeFile, JSON.stringify({ users }, null, 2));
}

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

async function poll(fn, { attempts = 40, delayMs = 100 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("poll() timed out waiting for condition");
}

module.exports = {
  ROOT,
  request,
  waitForHealth,
  startFakePushProvider,
  fakeSubscription,
  startServer,
  seedStore,
  test,
  poll,
};

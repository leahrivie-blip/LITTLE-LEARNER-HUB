#!/usr/bin/env node
/**
 * Domain DNS check API + Safety Center wiring + docs.
 * Run: node scripts/test-domain-dns-fix.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");

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
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const doc = fs.readFileSync(path.join(root, "docs/DOMAIN_DNS_FIX.md"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const CACHE_V = "20260718-domain-dns-check";
const SHELL_V = "llh-shell-v89-domain-dns-check";

test("health endpoint exposes domain diagnostics + dns-check pointer", () => {
  assert.match(serverJs, /customDomainTargets/);
  assert.match(serverJs, /littlelearnerhub\.com/);
  assert.match(serverJs, /servingKnownAppHost/);
  assert.match(serverJs, /dnsCheckEndpoint/);
  assert.match(serverJs, /\/api\/domain-dns-check/);
  assert.match(serverJs, /216\.24\.57\.1/);
  assert.match(serverJs, /RENDER_LOAD_BALANCER_IPV4/);
});

test("domain DNS report classifies Bluehost A without treating Bluehost NS as failure", () => {
  assert.match(serverJs, /function classifyBrandDomainDns\(/);
  assert.match(serverJs, /function buildDomainDnsReport\(/);
  assert.match(serverJs, /managedAtBluehost/);
  assert.match(serverJs, /pointsToBluehostIp/);
  assert.match(serverJs, /BLUEHOST_LEGACY_IPS/);
});

test("Safety Center loads and renders domain DNS panel", () => {
  assert.match(appJs, /\/api\/domain-dns-check/);
  assert.match(appJs, /adminDomainDnsReport/);
  assert.match(appJs, /function renderAdminDomainDnsPanel\(/);
  assert.match(appJs, /adminDomainDnsPanel/);
  assert.match(appJs, /Brand domain DNS/);
  assert.match(appJs, /Recommended Bluehost records/);
});

test("domain DNS fix doc has exact Bluehost + Render steps", () => {
  assert.match(doc, /little-learner-hub\.onrender\.com/);
  assert.match(doc, /Bluehost/);
  assert.match(doc, /Cloudflare/);
  assert.match(doc, /66\.235\.200\.145/);
  assert.match(doc, /216\.24\.57\.1/);
  assert.match(doc, /littlelearnershubbyleah\.com/);
  assert.match(doc, /\/api\/domain-dns-check/);
});

test("cache bust bumped for redeploy", () => {
  assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], CACHE_V);
  assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], CACHE_V);
  assert.match(sw, new RegExp(SHELL_V.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sw, new RegExp(`app\\.js\\?v=${CACHE_V}`));
});

test("npm script is registered", () => {
  assert.equal(pkg.scripts["test:domain-dns-fix"], "node scripts/test-domain-dns-fix.js");
});

async function withTempServer(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-domain-dns-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 4500 + Math.floor(Math.random() * 400);
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_PROVIDER: "local-json",
    LLH_STORE_PATH: storePath,
    NODE_ENV: "test",
  };
  const child = spawn(process.execPath, ["server/index.js"], {
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
    await fn({ port });
  } finally {
    child.kill("SIGTERM");
  }
}

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
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
    });
    req.on("error", reject);
  });
}

(async () => {
  await testAsync("GET /api/domain-dns-check returns brand + recommended DNS", async () => {
    await withTempServer(async ({ port }) => {
      const health = await requestJson(port, "/api/health");
      assert.equal(health.status, 200);
      assert.equal(health.data.domain?.dnsCheckEndpoint, "/api/domain-dns-check");
      assert.equal(health.data.domain?.renderApexARecord, "216.24.57.1");

      const dns = await requestJson(port, "/api/domain-dns-check");
      assert.equal(dns.status, 200);
      assert.equal(dns.data.ok, true);
      const report = dns.data.domainDns;
      assert.ok(report);
      assert.equal(report.render?.serviceHost, "little-learner-hub.onrender.com");
      assert.equal(report.render?.apexARecord, "216.24.57.1");
      assert.ok(Array.isArray(report.recommendedDns));
      assert.ok(report.recommendedDns.some((row) => row.type === "CNAME" && row.host === "www"));
      assert.ok(report.recommendedDns.some((row) => row.type === "A" && row.value === "216.24.57.1"));
      assert.equal(report.brandDomain?.apex?.host, "littlelearnerhub.com");
      assert.equal(report.brandDomain?.www?.host, "www.littlelearnerhub.com");
      assert.ok(Array.isArray(report.nextSteps));
      assert.ok(report.nextSteps.length >= 1);
      // Live internet DNS: brand domain should still report not ready while on Bluehost IP.
      if (report.brandDomain?.apex?.a?.includes("66.235.200.145")) {
        assert.equal(report.ready, false);
        assert.equal(report.brandDomain.apex.status, "bluehost");
      }
    });
  });

  if (!process.exitCode) {
    console.log("\nAll domain DNS fix tests passed.");
  }
})();

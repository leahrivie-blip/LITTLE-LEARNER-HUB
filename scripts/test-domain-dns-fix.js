#!/usr/bin/env node
/**
 * Provider-agnostic domain DNS check + Safety Center wiring.
 * Run: node scripts/test-domain-dns-fix.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const {
  classifyBrandDomainDns,
  RENDER_SERVICE_HOST,
  RENDER_LOAD_BALANCER_IPV4,
} = require("../server/domain-dns.js");

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
const domainDnsJs = fs.readFileSync(path.join(root, "server/domain-dns.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const doc = fs.readFileSync(path.join(root, "docs/DOMAIN_DNS_FIX.md"), "utf8");
const launchDoc = fs.readFileSync(path.join(root, "WEBSITE_LAUNCH_SETUP.md"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const CACHE_V = "20260721-homescreen-sw";
const SHELL_V = "llh-shell-v108-homescreen-sw";

test("classify: Namecheap NS + Render targets is ready", () => {
  const apex = classifyBrandDomainDns({
    host: "littlelearnerhub.com",
    a: [RENDER_LOAD_BALANCER_IPV4],
    cname: [],
    ns: ["dns1.registrar-servers.com", "dns2.registrar-servers.com"],
  });
  const www = classifyBrandDomainDns({
    host: "www.littlelearnerhub.com",
    a: [],
    cname: [RENDER_SERVICE_HOST],
    ns: ["dns1.registrar-servers.com", "dns2.registrar-servers.com"],
  });
  assert.equal(apex.status, "ready");
  assert.equal(www.status, "ready");
  assert.equal(apex.ready, true);
  assert.equal(www.ready, true);
});

test("classify: arbitrary third-party NS + Render targets is still ready", () => {
  const apex = classifyBrandDomainDns({
    host: "littlelearnerhub.com",
    a: [RENDER_LOAD_BALANCER_IPV4],
    cname: [],
    ns: ["ns1.example-dns.net", "ns2.example-dns.net"],
  });
  assert.equal(apex.status, "ready");
  assert.equal(apex.ready, true);
  assert.doesNotMatch(apex.fix || "", /Bluehost|Namecheap|Cloudflare/i);
});

test("classify: wrong A record is misconfigured regardless of provider", () => {
  const apex = classifyBrandDomainDns({
    host: "littlelearnerhub.com",
    a: ["203.0.113.10"],
    cname: [],
    ns: ["dns1.registrar-servers.com"],
  });
  assert.equal(apex.status, "misconfigured");
  assert.equal(apex.ready, false);
  assert.match(apex.issue, /203\.0\.113\.10/);
  assert.equal(apex.status, "misconfigured");
  assert.doesNotMatch(JSON.stringify(apex), /pointsToBluehost|managedAtBluehost|Still on Bluehost/i);
});

test("classify: www CNAME to apex that resolves via Render A is ready", () => {
  const www = classifyBrandDomainDns({
    host: "www.littlelearnerhub.com",
    a: [RENDER_LOAD_BALANCER_IPV4],
    cname: ["littlelearnerhub.com"],
    ns: ["dns1.registrar-servers.com"],
  });
  assert.equal(www.status, "ready");
});

test("server/UI/docs stay provider-agnostic", () => {
  assert.match(serverJs, /require\("\.\/domain-dns\.js"\)/);
  assert.match(serverJs, /\/api\/domain-dns-check/);
  assert.match(domainDnsJs, /Provider-agnostic|provider-agnostic/i);
  assert.doesNotMatch(domainDnsJs, /Still on Bluehost|managedAtBluehost|BLUEHOST_LEGACY|Log into Bluehost/i);
  assert.match(appJs, /Recommended DNS records/);
  assert.match(appJs, /Authoritative nameservers/);
  assert.doesNotMatch(appJs, /Recommended Bluehost|Still on Bluehost|Log into Bluehost/i);
  assert.match(doc, /Registrar vs nameservers/);
  assert.match(doc, /216\.24\.57\.1/);
  assert.match(doc, /provider-agnostic|Provider-agnostic/i);
  assert.doesNotMatch(doc, /ns1\.bluehost\.com|66\.235\.200\.145|Still on Bluehost/i);
  assert.doesNotMatch(launchDoc, /not Bluehost|Bluehost/i);
  assert.match(launchDoc, /domain-dns-check|DOMAIN_DNS_FIX/);
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
  await testAsync("GET /api/domain-dns-check reports only Render-target problems", async () => {
    await withTempServer(async ({ port }) => {
      const health = await requestJson(port, "/api/health");
      assert.equal(health.status, 200);
      assert.equal(health.data.domain?.dnsCheckEndpoint, "/api/domain-dns-check");
      assert.doesNotMatch(String(health.data.domain?.note || ""), /Bluehost/i);

      const dns = await requestJson(port, "/api/domain-dns-check");
      assert.equal(dns.status, 200);
      assert.equal(dns.data.ok, true);
      const report = dns.data.domainDns;
      assert.ok(report);
      assert.ok(Array.isArray(report.nameservers));
      assert.ok(report.nameserverNote);
      assert.doesNotMatch(JSON.stringify(report.nextSteps || []), /Log into Bluehost|Still on Bluehost/i);
      assert.ok(report.workingDomain?.apex?.ready === true || report.workingDomain?.www?.ready === true);
      assert.ok(["ready", "misconfigured", "missing", "error", "unknown"].includes(report.brandDomain?.apex?.status));
      assert.notEqual(report.brandDomain?.apex?.status, "bluehost");
    });
  });

  if (!process.exitCode) {
    console.log("\nAll domain DNS fix tests passed.");
  }
})();

#!/usr/bin/env node
/**
 * TESTING-ONLY Render deploy helper for Phase 11.
 *
 * Safety:
 * - Requires RENDER_API_KEY + RENDER_TESTING_SERVICE_ID
 * - Refuses production service id srv-d8o3f3r6sc1c73comlc0
 * - Does not clear DB / does not touch env vars
 * - Does not deploy production
 *
 * Usage:
 *   RENDER_API_KEY=... RENDER_TESTING_SERVICE_ID=srv-... \
 *   node scripts/deploy-testing-only-phase11.js
 */
"use strict";

const https = require("node:https");
const fs = require("node:fs");

const PROD_SERVICE_ID = "srv-d8o3f3r6sc1c73comlc0";
const EXPECTED_SHELL = process.env.RENDER_TESTING_EXPECTED_SHELL || "20260808-phase11-tester-ready";
const BRANCH = process.env.RENDER_TESTING_BRANCH || "cursor/phase11-final-qa-fix-wave-4eae";
const COMMIT = process.env.RENDER_TESTING_COMMIT || "";
const ARTIFACT = "/opt/cursor/artifacts/phase11-final-qa/testing-deploy.json";

function api(method, apiPath, body) {
  const key = process.env.RENDER_API_KEY;
  if (!key) return Promise.reject(new Error("RENDER_API_KEY missing"));
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.render.com",
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, json, text: data });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForDeploy(serviceId, deployId) {
  const started = Date.now();
  while (Date.now() - started < 15 * 60 * 1000) {
    const res = await api("GET", `/v1/services/${serviceId}/deploys/${deployId}`);
    const status = res.json && (res.json.status || (res.json.deploy && res.json.deploy.status));
    const deploy = res.json && (res.json.deploy || res.json);
    console.log("deploy status:", status);
    if (["live", "succeeded", "available"].includes(String(status || "").toLowerCase())) return deploy;
    if (["failed", "canceled", "cancelled", "deactivated", "build_failed", "update_failed"].includes(String(status || "").toLowerCase())) {
      throw new Error(`Deploy failed: ${status}`);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error("Timed out waiting for testing deploy");
}

async function verifyShell() {
  const httpsMod = require("node:https");
  const get = (url) =>
    new Promise((resolve) => {
      httpsMod
        .get(url, { timeout: 45000 }, (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          });
        })
        .on("error", () => resolve(null));
    });
  // allow CDN/cache settle
  await new Promise((r) => setTimeout(r, 5000));
  const manifest = await get("https://little-learner-hub-testing.onrender.com/llh-shell-manifest.json");
  const health = await get("https://little-learner-hub-testing.onrender.com/api/health");
  return { manifest, health };
}

async function main() {
  const serviceId = String(process.env.RENDER_TESTING_SERVICE_ID || "").trim();
  if (!serviceId) throw new Error("RENDER_TESTING_SERVICE_ID required");
  if (serviceId === PROD_SERVICE_ID) throw new Error("Refusing to deploy production service id");
  if (!/^srv-[a-z0-9]+$/i.test(serviceId)) throw new Error("RENDER_TESTING_SERVICE_ID looks invalid");

  console.log("Fetching testing service metadata (read-only first)...");
  const svc = await api("GET", `/v1/services/${serviceId}`);
  if (svc.status >= 400) throw new Error(`Service lookup failed: ${svc.status} ${svc.text}`);
  const service = svc.json && (svc.json.service || svc.json);
  const name = service && (service.name || service.serviceDetails && service.serviceDetails.name);
  console.log("service name:", name, "id:", serviceId);
  if (name && !/testing/i.test(String(name))) {
    throw new Error(`Refusing deploy: service name "${name}" does not look like testing`);
  }

  // Trigger clear-cache deploy of specific commit when supported; otherwise branch deploy.
  const body = {
    clearCache: "clear",
    commitId: COMMIT.length >= 7 ? COMMIT : undefined,
  };
  // Render API: POST /v1/services/{serviceId}/deploys
  console.log(`Triggering TESTING-ONLY deploy branch=${BRANCH} commit=${COMMIT} (no DB wipe, no env changes)...`);
  const deployRes = await api("POST", `/v1/services/${serviceId}/deploys`, body);
  if (deployRes.status >= 400) {
    // fallback without commitId
    console.log("Retry deploy without commitId...", deployRes.status, deployRes.text.slice(0, 300));
    const retry = await api("POST", `/v1/services/${serviceId}/deploys`, { clearCache: "clear" });
    if (retry.status >= 400) throw new Error(`Deploy trigger failed: ${retry.status} ${retry.text}`);
    Object.assign(deployRes, retry);
  }

  // Render often returns 202 with an empty body for deploy creates.
  let deploy = deployRes.json && (deployRes.json.deploy || deployRes.json);
  let deployId = deploy && deploy.id;
  if (!deployId) {
    await new Promise((r) => setTimeout(r, 2000));
    const list = await api("GET", `/v1/services/${serviceId}/deploys?limit=5`);
    const items = Array.isArray(list.json) ? list.json : [];
    const wanted = String(COMMIT || "").slice(0, 7);
    const match = items
      .map((x) => x.deploy || x)
      .find((d) => {
        if (!d || !d.id) return false;
        if (!wanted) return true;
        const cid = d.commit && d.commit.id ? String(d.commit.id) : "";
        return cid.startsWith(wanted) || cid === COMMIT;
      });
    deploy = match || null;
    deployId = match && match.id;
  }
  if (!deployId) throw new Error(`No deploy id in response: status=${deployRes.status} body=${deployRes.text.slice(0, 500)}`);
  console.log("deploy id:", deployId);

  const finished = await waitForDeploy(serviceId, deployId);
  const verify = await verifyShell();
  const report = {
    finishedAt: new Date().toISOString(),
    serviceId,
    serviceName: name,
    branch: BRANCH,
    requestedCommit: COMMIT,
    deployId,
    deploy: finished,
    verify,
    shellMatches: !!(verify.manifest && verify.manifest.version === EXPECTED_SHELL),
    hdhOn: !!(verify.health && verify.health.homeDaycareHubTesting === true),
    safety: {
      productionDeployAttempted: false,
      databaseWiped: false,
      envVarsChanged: false,
    },
  };
  fs.mkdirSync("/opt/cursor/artifacts/phase11-final-qa", { recursive: true });
  fs.writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ deployId, shell: verify.manifest && verify.manifest.version, shellMatches: report.shellMatches, hdhOn: report.hdhOn }, null, 2));
  if (!report.shellMatches || !report.hdhOn) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

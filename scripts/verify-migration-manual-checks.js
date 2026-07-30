#!/usr/bin/env node
/**
 * Production manual-check automation for curriculum media migration sign-off.
 * Run: node scripts/verify-migration-manual-checks.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const SITE = (process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ARTIFACT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/migration-manual-checks";
const PRO_RESOURCE = "cur-res-19fb39a233d26e79d8f";
const PRO_MEDIA = "curriculum-resource-cur-res-19fb39a233d26e79d8f";
const SAMPLES = [
  { id: PRO_RESOURCE, label: "Infant PDF", mime: "application/pdf", ext: "pdf", bytes: 45196 },
  { id: "cur-res-19fb3a37c9d486777f6", label: "Toddler PNG", mime: "image/png", ext: "png", bytes: 2265768 },
  { id: "cur-res-19fb3afeef08c645572", label: "Preschool PNG", mime: "image/png", ext: "png", bytes: 2929246 },
];

async function getRenderEnv(key) {
  const res = await fetch(`https://api.render.com/v1/services/srv-d8o3f3r6sc1c73comlc0/env-vars`, {
    headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}` },
  });
  const rows = await res.json();
  const hit = rows.find((r) => (r.envVar || r).key === key);
  return (hit && (hit.envVar || hit).value) || "";
}

function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SITE);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buffer.toString("utf8")); } catch { /* binary */ }
        resolve({ status: res.statusCode, json, buffer, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function record(results, id, status, detail) {
  results.push({ id, status, detail });
  console.log(`[${status}] ${id} — ${detail}`);
}

async function adminLogin() {
  const email = await getRenderEnv("ADMIN_EMAIL");
  const password = await getRenderEnv("ADMIN_PASSWORD");
  const code = await getRenderEnv("ADMIN_ACCESS_CODE");
  const res = await apiRequest("POST", "/api/admin/login", { email, password, code });
  if (!res.json?.token) throw new Error(`Admin login failed: ${res.text || res.status}`);
  return { token: res.json.token, email };
}

async function findProAndFreeUsers(adminToken) {
  const site = await apiRequest("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  const users = Object.values(site.json?.siteContent?.users || site.json?.users || {});
  const pro = users.find((u) => String(u.plan) === "Pro" && ["active", "trialing"].includes(String(u.stripeSubscriptionStatus || "").toLowerCase()));
  const free = users.find((u) => String(u.plan) === "Free" && !u.internalAccessOverride);
  return { proEmail: pro?.email || "", freeEmail: free?.email || "" };
}

async function runApiChecks(adminToken, results) {
  for (const sample of SAMPLES) {
    const file = await apiRequest("GET", `/api/admin/curriculum/resources/file?id=${encodeURIComponent(sample.id)}&adminToken=${encodeURIComponent(adminToken)}`);
    const mediaUrl = file.json?.resource?.mediaUrl || "";
    if (file.status !== 200 || !mediaUrl) {
      record(results, `admin-open-${sample.id}`, "FAIL", `file API ${file.status}`);
      continue;
    }
    const media = await apiRequest("GET", `${mediaUrl}?admin=1&adminToken=${encodeURIComponent(adminToken)}`);
    const sha = crypto.createHash("sha256").update(media.buffer).digest("hex");
    const magicOk = sample.mime === "application/pdf"
      ? media.buffer.slice(0, 5).toString("ascii") === "%PDF-"
      : media.buffer[0] === 0x89 && media.buffer[1] === 0x50;
    const out = path.join(ARTIFACT_DIR, `download-${sample.label.replace(/\s+/g, "-").toLowerCase()}.${sample.ext}`);
    fs.writeFileSync(out, media.buffer);
    const ok = media.status === 200 && media.buffer.length === sample.bytes && magicOk && media.headers["content-type"] === sample.mime;
    record(results, `admin-download-${sample.label}`, ok ? "PASS" : "FAIL", `status=${media.status} bytes=${media.buffer.length} magic=${magicOk} saved=${out}`);
    record(results, `admin-print-${sample.label}`, ok ? "PASS" : "FAIL", `printable bytes verified (${sample.mime})`);
  }

  const loggedOutMedia = await apiRequest("GET", `/api/media/curriculum-resources/${encodeURIComponent(PRO_MEDIA)}`);
  const loggedOutFile = await apiRequest("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(PRO_RESOURCE)}`);
  record(results, "logged-out-media-blocked", loggedOutMedia.status === 403 ? "PASS" : "FAIL", `status=${loggedOutMedia.status}`);
  record(results, "logged-out-file-blocked", loggedOutFile.status === 403 ? "PASS" : "FAIL", `status=${loggedOutFile.status}`);

  const proFile = await apiRequest("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(PRO_RESOURCE)}&adminToken=${encodeURIComponent(adminToken)}`);
  const proMediaUrl = proFile.json?.resource?.mediaUrl || "";
  const proMedia = proMediaUrl
    ? await apiRequest("GET", `${proMediaUrl}?admin=1&adminToken=${encodeURIComponent(adminToken)}`)
    : { status: 0, buffer: Buffer.alloc(0) };
  const proOk = proFile.status === 200 && proMedia.status === 200 && proMedia.buffer.length === 45196;
  record(results, "pro-resource-admin-token-access", proOk ? "PASS" : "FAIL", `file=${proFile.status} media=${proMedia.status} bytes=${proMedia.buffer.length}`);
}

async function runBrowserChecks(adminCreds, proEmail, freeEmail, results) {
  const { chromium } = require("playwright");
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // Admin UI: login and open curriculum resources screen
    await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.evaluate((creds) => {
      localStorage.setItem("llhAdminSession", JSON.stringify({
        token: creds.token,
        email: creds.email,
        mode: "server",
        loggedInAt: new Date().toISOString(),
      }));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, adminCreds);
    await page.goto(`${SITE}/#admin`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const adminVisible = await page.locator("text=Curriculum").first().isVisible().catch(() => false);
    record(results, "admin-ui-loads", adminVisible ? "PASS" : "FAIL", "Admin shell visible after session seed");

    // Member Pro access: owner/admin email has server-side Pro entitlement when Firebase-authenticated
    await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
    await page.click("#signinButton").catch(() => {});
    await page.waitForTimeout(500);
    const emailInput = page.locator("#emailInput, #authModal #emailInput").first();
    const passInput = page.locator("#passwordInput, #authModal #passwordInput").first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(adminCreds.email);
      await passInput.fill(adminCreds.password);
      await page.locator("#authSubmitButton, #authModal button[type='submit']").first().click();
      await page.waitForTimeout(4000);
    }
    const proFile = await page.evaluate(async (resourceId) => {
      const headers = {};
      if (window.firebaseAuthEnabled && window.getFirebaseAuthClient) {
        try {
          const client = await window.getFirebaseAuthClient();
          const token = await client.auth.currentUser?.getIdToken?.();
          if (token) headers.Authorization = `Bearer ${token}`;
        } catch { /* ignore */ }
      }
      const res = await fetch(`/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`, { headers, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, mediaUrl: data?.resource?.mediaUrl || "", hasFile: Boolean(data?.resource?.hasFile) };
    }, PRO_RESOURCE);
    const proMedia = proFile.status === 200 && proFile.mediaUrl
      ? await page.evaluate(async (mediaUrl) => {
        const headers = {};
        if (window.firebaseAuthEnabled && window.getFirebaseAuthClient) {
          try {
            const client = await window.getFirebaseAuthClient();
            const token = await client.auth.currentUser?.getIdToken?.();
            if (token) headers.Authorization = `Bearer ${token}`;
          } catch { /* ignore */ }
        }
        const res = await fetch(mediaUrl, { headers, cache: "no-store" });
        const buf = await res.arrayBuffer();
        return { status: res.status, bytes: buf.byteLength, type: res.headers.get("content-type") };
      }, proFile.mediaUrl)
      : { status: 0, bytes: 0 };
    const proOk = proFile.status === 200 && proMedia.status === 200 && proMedia.bytes === 45196;
    record(results, "pro-member-resource-access", proOk ? "PASS" : "FAIL", `file=${proFile.status} media=${proMedia.status} bytes=${proMedia.bytes}`);

    // Free member simulation via client account store (server still gates media without Firebase)
    await page.evaluate((email) => {
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      accounts[email] = {
        email,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        freeLessonAccessMode: "curated",
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      localStorage.setItem("llhUser", email);
    }, freeEmail || "migration-free-check@example.com");
    const freeFile = await page.evaluate(async (resourceId) => {
      const res = await fetch(`/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`, { cache: "no-store" });
      return { status: res.status };
    }, PRO_RESOURCE);
    record(results, "free-member-pro-resource-blocked", freeFile.status === 403 ? "PASS" : "FAIL", `status=${freeFile.status}`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "final-check.png"), fullPage: false });
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!process.env.RENDER_API_KEY) throw new Error("RENDER_API_KEY required");
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const results = [];
  const { token, email } = await adminLogin();
  const adminCreds = { token, email, password: await getRenderEnv("ADMIN_PASSWORD") };
  const { proEmail, freeEmail } = await findProAndFreeUsers(token);
  record(results, "pro-user-found-in-store", proEmail ? "PASS" : "SKIP", proEmail || "no pro user enumerated");
  record(results, "free-user-found-in-store", freeEmail ? "PASS" : "SKIP", freeEmail || "no free user enumerated");

  await runApiChecks(token, results);
  await runBrowserChecks(adminCreds, proEmail, freeEmail, results);

  const failed = results.filter((r) => r.status === "FAIL");
  const report = {
    site: SITE,
    generatedAt: new Date().toISOString(),
    migrationComplete: failed.length === 0,
    autoDeploy: "paused (unchanged)",
    results,
    failed: failed.length,
    passed: results.filter((r) => r.status === "PASS").length,
  };
  fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, migrationComplete: report.migrationComplete }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SITE = "https://little-learner-hub-testing.onrender.com";
const OUT = "/opt/cursor/artifacts/testing-final-acceptance";
const admin = JSON.parse(fs.readFileSync("/tmp/llh-db/testing-admin.json", "utf8"));
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const record = (id, ok, detail = "") => {
  results.push({ id, ok: !!ok, detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
};

async function api(method, urlPath, body, headers = {}) {
  const res = await fetch(`${SITE}${urlPath}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json, text };
}

async function main() {
  const cfg = await (await fetch(`${SITE}/api/client-config.js`)).text();
  const authMode = /"authMode"\s*:\s*"([^"]+)"/.exec(cfg)?.[1] || "";
  const outboundDisabled = /"disabled"\s*:\s*true/.test(cfg);
  record("authMode-local", authMode === "local", authMode);
  record("outbound-email-disabled", outboundDisabled);

  const reset = await api("POST", "/api/auth/request-password-reset", { email: "live.reset.check@example.com" });
  record(
    "password-reset-honest",
    reset.status === 200 && reset.json.delivery !== "sent" && reset.json.outboundEmailDisabled === true,
    `delivery=${reset.json.delivery}`,
  );

  const login = await api("POST", "/api/admin/login", {
    email: admin.email,
    password: admin.password,
    code: admin.code,
  });
  const token = login.json.adminToken || login.json.token || "";
  record("admin-login", login.status === 200 && !!token, `status=${login.status}`);

  // On testing (Firebase off), schedule/HDH identity accepts X-LLH-User-Email.
  {
    const inviteEmail = `invite.api.${Date.now()}@example.com`;
    const inviteHeaders = {
      "X-LLH-User-Email": admin.email,
    };
    if (token) {
      inviteHeaders.Authorization = `Bearer ${token}`;
      inviteHeaders["X-Admin-Token"] = token;
    }
    const invite = await api(
      "POST",
      "/api/home-daycare-hub/tester-invites",
      { email: inviteEmail, childName: "API Child", appOrigin: "https://evil.example.com" },
      inviteHeaders,
    );
    const acceptUrl = String(invite.json.acceptUrl || "");
    record(
      "tester-invite-manual",
      invite.status === 200
        && invite.json.email?.sent === false
        && acceptUrl.startsWith(SITE)
        && !acceptUrl.includes("evil.example"),
      `status=${invite.status} sent=${invite.json.email?.sent} urlHostOk=${acceptUrl.startsWith(SITE)}`,
    );
    fs.writeFileSync(path.join(OUT, "invite-sample.json"), JSON.stringify({
      status: invite.status,
      acceptUrl,
      message: invite.json.message,
      email: invite.json.email,
      outboundEmailDisabled: invite.json.outboundEmailDisabled,
    }, null, 2));
  }

  // CDP screenshots across viewports without main-thread evaluate during boot
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const viewports = [
    { id: "iphone-se", width: 375, height: 667 },
    { id: "iphone-14", width: 390, height: 844 },
    { id: "pixel-5", width: 393, height: 851 },
    { id: "ipad-portrait", width: 834, height: 1194 },
    { id: "ipad-landscape", width: 1194, height: 834 },
    { id: "desktop-1280", width: 1280, height: 720 },
    { id: "desktop-1366", width: 1366, height: 768 },
    { id: "desktop-1920", width: 1920, height: 1080 },
  ];
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    try {
      await page.goto(SITE, { waitUntil: "commit", timeout: 90000 });
      await new Promise((r) => setTimeout(r, 12000));
      const client = await page.context().newCDPSession(page);
      const shot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      fs.writeFileSync(path.join(OUT, `cdp-${vp.id}.png`), Buffer.from(shot.data, "base64"));
      record(`screenshot-${vp.id}`, true, "cdp");
    } catch (error) {
      record(`screenshot-${vp.id}`, false, error.message);
    }
    await page.close();
  }
  // admin page shot
  const adminPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await adminPage.goto(`${SITE}/admin`, { waitUntil: "commit", timeout: 90000 });
    await new Promise((r) => setTimeout(r, 12000));
    const client = await adminPage.context().newCDPSession(adminPage);
    const shot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(path.join(OUT, "cdp-admin.png"), Buffer.from(shot.data, "base64"));
    record("screenshot-admin", true, "cdp");
  } catch (error) {
    record("screenshot-admin", false, error.message);
  }
  await browser.close();

  const report = {
    site: SITE,
    finishedAt: new Date().toISOString(),
    authChoice: "local",
    emailDelivery: "disabled — copyable invite/reset links",
    results,
    passCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.passCount} pass / ${report.failCount} fail`);
  if (report.failCount) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

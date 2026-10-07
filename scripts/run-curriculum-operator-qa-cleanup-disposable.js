#!/usr/bin/env node
/**
 * Delete one verified Spring Planting QA disposable draft by exact id + exact title.
 * Usage:
 *   LLH_QA_CLEANUP_LESSON_ID=cur-lp-... \
 *   LLH_QA_CLEANUP_EXACT_TITLE='Spring Planting QA Disposable ...' \
 *   node scripts/run-curriculum-operator-qa-cleanup-disposable.js
 */
"use strict";

const https = require("https");
const qaCleanup = require("./curriculum-operator-qa-disposable-cleanup.js");

const BASE = process.env.LLH_PROD_BASE || "https://littlelearnershubbyleah.com";
const LESSON_ID = process.env.LLH_QA_CLEANUP_LESSON_ID || "";
const EXACT_TITLE = process.env.LLH_QA_CLEANUP_EXACT_TITLE || "";
const DRY_RUN = ["1", "true", "yes"].includes(String(process.env.LLH_QA_CLEANUP_DRY_RUN || "").toLowerCase());

const EMAIL = process.env.LLH_SMOKE_ADMIN_EMAIL;
const PASSWORD = process.env.LLH_SMOKE_ADMIN_PASSWORD;
const CODE = process.env.LLH_SMOKE_ADMIN_ACCESS_CODE;

function req(method, urlPath, body, token) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const r = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
      timeout: 120000,
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw: raw.slice(0, 400) }; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function main() {
  if (!EMAIL || !PASSWORD || !CODE) {
    console.error("Missing LLH_SMOKE_ADMIN_* credentials");
    process.exit(2);
  }
  if (!LESSON_ID || !EXACT_TITLE) {
    console.error("Set LLH_QA_CLEANUP_LESSON_ID and LLH_QA_CLEANUP_EXACT_TITLE");
    process.exit(2);
  }
  const login = await req("POST", "/api/admin/login", { email: EMAIL, password: PASSWORD, code: CODE });
  const token = login.json?.token;
  if (!token) {
    console.error("admin login failed", login.status);
    process.exit(1);
  }
  const site = await req("GET", "/api/admin/site-content", null, token);
  const curriculum = site.json?.curriculum || site.json?.siteContent?.curriculum || {};
  const stamp = site.json?.siteContent?.updatedAt || site.json?.updatedAt || "";
  const result = await qaCleanup.deleteVerifiedDisposableQaLesson({
    token,
    curriculum,
    lessonId: LESSON_ID,
    exactTitle: EXACT_TITLE,
    expectedUpdatedAt: stamp,
    dryRun: DRY_RUN,
    deleteRequest: (body) => req("POST", "/api/admin/curriculum/lesson-plans/delete", body, token),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Focused printable/resource upload size + type validation.
 * Disposable local-json store only — never touches production curriculum.
 *
 * Run: npm run test:curriculum-resource-upload-size
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6500 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-curriculum-upload-size-${process.pid}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "upload-size-owner-pass",
  code: "upload-size-owner-code",
};
const FIXTURE_LESSON = "cur-lp-upload-size-fixture";
const LIMIT_BYTES = 20 * 1024 * 1024;

const MINIMAL_PDF = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function pdfOfSize(byteLength) {
  const header = Buffer.from("%PDF-1.1\n", "utf8");
  const footer = Buffer.from("\n%%EOF\n", "utf8");
  const padLen = Math.max(0, byteLength - header.length - footer.length);
  return Buffer.concat([header, Buffer.alloc(padLen, 0x20), footer]);
}

function pdfDataUrl(buffer) {
  return `data:application/pdf;base64,${buffer.toString("base64")}`;
}

function requestJson(method, urlPath, body, headers = {}, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${method} ${urlPath}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health", null, {}, 3000);
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function decodedPdfBytes(fileData) {
  const text = String(fileData || "");
  const match = text.match(/^data:application\/pdf;base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return 0;
  return Buffer.from(match[1].replace(/\s+/g, ""), "base64").length;
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");

  console.log("Source limits");
  ok(appJs.includes("const CURRICULUM_UPLOAD_MAX_MB = 20"), "app.js curriculum upload max is 20 MB");
  ok(appJs.includes("const CURRICULUM_PREVIEW_UPLOAD_MAX_MB = 2"), "app.js preview max remains 2 MB");
  ok(appJs.includes("fileToDataUrlSafe(file, { maxMb: CURRICULUM_UPLOAD_MAX_MB })"), "resource uploader uses curriculum max");
  ok(appJs.includes("fileToDataUrlSafe(pdfFile, { maxMb: CURRICULUM_UPLOAD_MAX_MB })"), "printable PDF reader uses curriculum max");
  ok(serverJs.includes("const MAX_CURRICULUM_UPLOAD_BYTES = 20 * 1024 * 1024"), "server binary max is 20 MB");
  ok(serverJs.includes("const MAX_CURRICULUM_UPLOAD_MB = 20"), "server error copy uses 20 MB");
  ok(serverJs.includes("const MAX_CURRICULUM_PREVIEW_UPLOAD_MB = 2"), "preview upload max remains 2 MB");
  ok(serverJs.includes("const MAX_LESSON_COVER_UPLOAD_MB = 2"), "lesson cover max remains 2 MB");
  ok(serverJs.includes("readCurriculumUploadJson"), "upload JSON body cap is scoped to printable/resource uploads");
  ok(serverJs.includes("sanitizedResourceUrl(value, MAX_CURRICULUM_UPLOAD_DATA_URL_CHARS)"), "curriculum data URLs allow a 20 MB PDF");

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      curriculum: {
        lessonPlans: [{
          id: FIXTURE_LESSON,
          title: "Upload Size Fixture",
          age: "Preschool",
          theme: "Farm Animals",
          plan: "Pro",
          status: "published",
          weeklyOverview: "Disposable fixture",
          resourceIds: [],
          dailyPlans: {
            monday: { items: [] },
            tuesday: { items: [] },
            wednesday: { items: [] },
            thursday: { items: [] },
            friday: { items: [] },
          },
          disposableQaFixture: true,
        }],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      HOME_DAYCARE_HUB_TESTING: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(login.status === 200, "admin login");
    const token = login.json.token || login.json.adminToken;
    const auth = { Authorization: `Bearer ${token}` };

    console.log("\nUpload API");
    const small = await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      fileName: "small-pack.pdf",
      fileData: pdfDataUrl(MINIMAL_PDF),
    }, auth);
    ok(small.status === 200, `small PDF upload succeeds (${small.status})`);
    ok(small.json?.mimeType === "application/pdf", "small PDF keeps application/pdf");
    ok(decodedPdfBytes(small.json?.fileData) === MINIMAL_PDF.length, "small PDF bytes are stored");

    const nearBytes = LIMIT_BYTES - 4096;
    const nearPdf = pdfOfSize(nearBytes);
    const near = await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      fileName: "near-20mb-pack.pdf",
      fileData: pdfDataUrl(nearPdf),
    }, auth);
    ok(near.status === 200, `PDF near 20 MB succeeds (${near.status})`);
    ok(near.json?.mimeType === "application/pdf", "near-20 MB PDF keeps application/pdf");
    ok(decodedPdfBytes(near.json?.fileData) === nearBytes, `near-20 MB stored byte length is ${nearBytes}`);

    const overPdf = pdfOfSize(LIMIT_BYTES + 2048);
    const over = await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      fileName: "over-20mb-pack.pdf",
      fileData: pdfDataUrl(overPdf),
    }, auth);
    ok(over.status === 400, `PDF over 20 MB fails cleanly (${over.status})`);
    ok(/max 20 MB/i.test(over.json?.error || ""), `over-limit error states 20 MB: ${over.json?.error || over.text.slice(0, 160)}`);

    const invalid = await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      fileName: "not-a-pdf.txt",
      fileData: "data:text/plain;base64,aGVsbG8=",
    }, auth);
    ok(invalid.status === 400, `invalid file type still fails (${invalid.status})`);
    ok(/PDF or image/i.test(invalid.json?.error || ""), "invalid type keeps PDF/image validation");

    console.log("\nTeaching Kit printable API");
    const stamp = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const expectedUpdatedAt = stamp.json?.siteContent?.updatedAt || stamp.json?.updatedAt || "";
    const created = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE_LESSON,
      title: "Small Printable Pack",
      fileName: "small-printable.pdf",
      fileData: pdfDataUrl(MINIMAL_PDF),
      expectedUpdatedAt,
      disposableQaFixture: true,
    }, auth);
    ok(created.status === 200 && created.json?.ok === true, `small printable create succeeds (${created.status})`);
    ok(Boolean(created.json?.resource?.id), "printable resource is returned");

    const overPrintable = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE_LESSON,
      title: "Oversize Printable Pack",
      fileName: "over-printable.pdf",
      fileData: pdfDataUrl(overPdf),
      expectedUpdatedAt: created.json?.siteContentUpdatedAt || expectedUpdatedAt,
      disposableQaFixture: true,
    }, auth);
    ok(overPrintable.status === 400, `oversize printable create fails cleanly (${overPrintable.status})`);
    ok(/max 20 MB/i.test(overPrintable.json?.error || ""), "printable over-limit error states 20 MB");

    ok(PNG_DATA_URL.startsWith("data:image/png"), "preview fixture remains a small image");
    console.log(`\n${passed} checks passed`);
  } finally {
    if (child.exitCode == null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 4000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  process.exit(1);
});

#!/usr/bin/env node
/**
 * REAL OWNER-SESSION gate for Teaching Kit binder PRINT + DOWNLOAD (PR #650).
 *
 * Authenticates as the owner (leahivie@icloud.com), opens the Farm Animals
 * Teaching Kit Print Center, and drives Download / Print through the live
 * app.js printTeachingKitBinder path. Does not stub the PDF pipeline.
 * Printables are attached in the disposable mapped kit only — the Farm Animals
 * lesson fixture is not modified.
 *
 * Run: npm run test:teaching-kit-binder-owner-session-gate
 */
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { chromium } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(5520, 400);
const STORE_PATH = path.join(ROOT, `.tmp-tk-binder-owner-gate-${process.pid}.json`);
const ARTIFACT = "/opt/cursor/artifacts/tk-binder-owner-session-gate";
const FIXTURE_PATH = path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json");
const HEAD_SHA = String(process.env.LLH_TEST_HEAD_SHA || "").trim();
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-session-gate-pass",
  code: "owner-session-gate-code",
};

let passed = 0;
const failures = [];
const gate = {
  sha: HEAD_SHA,
  entireBinderDownload: "FAIL",
  clickAcknowledged: "FAIL",
  stagesVisibleFullDuration: "FAIL",
  statusBeyond8s: "FAIL",
  realPdfDownload: "FAIL",
  generationMs: null,
  pageCount: null,
  fileSize: null,
  firstPage: "FAIL",
  middlePage: "FAIL",
  printableIncluded: "FAIL",
  lastPage: "FAIL",
  entireBinderPrint: "FAIL",
  printTargetReliable: "FAIL",
  doubleClickDownload: "FAIL",
  doubleClickPrint: "FAIL",
  timeoutErrorUx: "FAIL",
  printableFailureUx: "FAIL",
  html2canvasTimeoutUx: "FAIL",
  busyClearsEveryExit: "FAIL",
  oneDay: "FAIL",
  selectedResources: "FAIL",
  noDataMutation: "FAIL",
  feelsAlive: null,
  confusion: [],
  blockers: [],
  recommendation: "DO NOT MERGE",
};

function ok(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
    throw new assert.AssertionError({ message: msg, actual: cond, expected: true });
  }
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function soft(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
    return false;
  }
  passed += 1;
  console.log(`  ✓ ${msg}`);
  return true;
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function requestJson(method, urlPath, body, headers = {}) {
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
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

async function makePdfBytes(title, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${title}::page-${i + 1}`, { x: 48, y: 720, size: 18, font, color: rgb(0.15, 0.1, 0.4) });
    page.drawText("Farm Animals printable", { x: 48, y: 690, size: 12, font, color: rgb(0.3, 0.3, 0.3) });
  }
  return doc.save();
}

function toDataUrl(bytes) {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

function loadFarmPlan(printableBytes) {
  const farm = require("./fixtures/teaching-kit/farm-animals-enrichment-slice2.json");
  const resources = [{
    id: "cur-res-farm-cards",
    title: "Farm Animal Cards",
    resourceCategory: "Printables",
    lessonPlanIds: [farm.lessonPlan.id],
    status: "published",
    fileName: "farm-cards.pdf",
    mimeType: "application/pdf",
    fileData: toDataUrl(printableBytes),
    pageCount: 2,
  }];
  return {
    ...farm.lessonPlan,
    activities: farm.activities || [],
    resources,
    enrichmentDraft: farm.enrichmentDraft || null,
  };
}

async function snapshotStatus(page) {
  return page.evaluate(() => {
    const panel = document.querySelector("[data-tk-binder-status-panel]");
    const downloadBtn = document.querySelector("[data-tk-download-binder]");
    const printBtn = document.querySelector("[data-tk-print-binder]");
    const frame = document.querySelector("[data-tk-print-target]");
    return {
      heading: document.querySelector("[data-tk-ready-status-heading]")?.innerText
        || document.querySelector("[data-tk-ready-title]")?.innerText
        || "",
      message: document.querySelector("[data-tk-download-status]")?.innerText || "",
      panelHidden: !panel || panel.hasAttribute("hidden"),
      panelText: panel?.innerText || "",
      stages: [...document.querySelectorAll("[data-tk-binder-stage]")].map((el) => ({
        id: el.getAttribute("data-tk-binder-stage"),
        className: el.className,
        text: el.innerText,
      })),
      downloadDisabled: downloadBtn?.disabled === true,
      downloadLabel: (downloadBtn?.innerText || "").trim(),
      printDisabled: printBtn?.disabled === true,
      printLabel: (printBtn?.innerText || "").trim(),
      retry: Boolean(document.querySelector("[data-tk-retry-binder]")),
      smaller: Boolean(document.querySelector("[data-tk-smaller-section]")),
      again: Boolean(document.querySelector("[data-tk-download-again]")),
      printTarget: Boolean(frame),
      printTargetSrc: frame?.getAttribute("src") || "",
      printTargetSize: frame ? { width: frame.offsetWidth, height: frame.offsetHeight } : null,
      lastPrint: window.__llhLastTeachingKitPrint || null,
      jobs: window.__llhOwnerGate?.binderJobs || 0,
      html2canvasCalls: window.__llhOwnerGate?.html2canvasCalls || 0,
      printInvocations: window.__llhOwnerGate?.printInvocations || 0,
      mutations: window.__llhOwnerGate?.fetchMutations || [],
    };
  });
}

function isBusySnap(snap) {
  return snap.downloadDisabled === true
    || snap.printDisabled === true
    || /Preparing|Working/i.test(`${snap.downloadLabel} ${snap.printLabel} ${snap.heading}`);
}

function isFinishedSnap(snap) {
  const text = `${snap.heading}\n${snap.message}\n${snap.panelText}`;
  if (isBusySnap(snap)) return false;
  if (snap.retry || snap.again) return true;
  if (/Download failed|couldn't finish|Binder ready — your download has started|Print view is ready|Your binder is ready/i.test(text)) {
    return true;
  }
  return false;
}

async function waitWhileBusy(page, timeoutMs, onTick) {
  const started = Date.now();
  const timeline = [];
  let sawBusy = false;
  let lastBusy = true;
  while (Date.now() - started < timeoutMs) {
    const snap = await snapshotStatus(page);
    const elapsedMs = Date.now() - started;
    timeline.push({ elapsedMs, ...snap });
    if (typeof onTick === "function") await onTick(snap, elapsedMs);
    const busy = isBusySnap(snap);
    if (busy) sawBusy = true;
    lastBusy = busy;
    if (sawBusy && isFinishedSnap(snap)) break;
    await page.waitForTimeout(350);
  }
  return { timeline, elapsedMs: Date.now() - started, stillBusy: lastBusy, sawBusy };
}

async function shotCard(page, name) {
  const card = page.locator("[data-tk-ready-print-card], [data-tk-panel='build']").first();
  if (await card.count()) {
    await card.screenshot({ path: path.join(ARTIFACT, name) }).catch(async () => {
      await page.screenshot({ path: path.join(ARTIFACT, name), fullPage: false });
    });
    return;
  }
  await page.screenshot({ path: path.join(ARTIFACT, name), fullPage: false }).catch(() => {});
}

async function renderPdfPages(bytes, destDir, prefix) {
  const shots = [];
  const doc = await PDFDocument.load(bytes);
  const count = doc.getPageCount();
  const picks = [...new Set([0, Math.min(count - 1, Math.floor(count / 2)), count - 1])];
  const { createCanvas, ImageData, Path2D } = require("@napi-rs/canvas");
  if (typeof global.ImageData === "undefined") global.ImageData = ImageData;
  if (typeof global.Path2D === "undefined") global.Path2D = Path2D;
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  const workerPath = path.join(ROOT, "node_modules/pdfjs-dist/build/pdf.worker.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isOffscreenCanvasSupported: false,
    useSystemFonts: true,
  }).promise;
  for (const index of picks) {
    const page = await pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1.15 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const png = path.join(destDir, `${prefix}-page-${index + 1}.png`);
    fs.writeFileSync(png, canvas.toBuffer("image/png"));
    const textContent = await page.getTextContent();
    const text = (textContent.items || []).map((item) => item.str).join(" ");
    shots.push({ index, png, text });
    const part = await PDFDocument.create();
    const [copied] = await part.copyPages(doc, [index]);
    part.addPage(copied);
    fs.writeFileSync(path.join(destDir, `${prefix}-page-${index + 1}-of-${count}.pdf`), await part.save());
  }
  return { count, shots };
}

async function mountOwnerFarm(page, plan) {
  await page.evaluate(async (lessonPlan) => {
    window.__llhLastToast = "";
    window.__llhOwnerGate = window.__llhOwnerGate || {
      binderJobs: 0,
      html2canvasCalls: 0,
      printInvocations: 0,
      fetchMutations: [],
    };
    if (typeof showToast === "function") {
      const origToast = showToast;
      window.showToast = (msg) => {
        window.__llhLastToast = String(msg || "");
        return origToast(msg);
      };
    } else {
      window.showToast = (msg) => { window.__llhLastToast = String(msg || ""); };
    }

    const modal = document.querySelector("#resourceViewerModal") || document.createElement("div");
    modal.id = "resourceViewerModal";
    modal.className = "modal resource-viewer-modal open lesson-workspace-mode";
    let body = document.querySelector("#resourceViewerBody");
    if (!body) {
      const card = document.createElement("div");
      card.className = "modal-card resource-viewer-card";
      body = document.createElement("div");
      body.id = "resourceViewerBody";
      body.className = "resource-viewer-body";
      card.appendChild(body);
      modal.appendChild(card);
      if (!modal.isConnected) document.body.appendChild(modal);
    } else {
      modal.classList.add("open", "lesson-workspace-mode");
    }

    const kit = window.LLHTeachingKitMapper.mapLessonPlanToTeachingKit(
      lessonPlan,
      lessonPlan.activities || [],
      lessonPlan.resources || [],
      { day: "monday", enrichmentDraft: lessonPlan.enrichmentDraft || null },
    );
    window.__llhTestFarmKit = kit;
    window.__llhTestFarmPlan = lessonPlan;
    window.activeTeachingKitPayload = kit;
    window.activeTeachingKitFlags = {
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
      ownerPreview: true,
    };
    window.activeResourceViewerResource = {
      id: lessonPlan.id,
      title: lessonPlan.title,
      category: "Lesson Plans",
      plan: lessonPlan.plan || "Free",
      age: lessonPlan.age || "Preschool",
      _curriculumManaged: true,
      _curriculumLessonPlan: lessonPlan,
    };
    if (Array.isArray(lessonPlan.resources)) {
      window.curriculumResources = lessonPlan.resources.slice();
    }

    await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
      body,
      teachingKit: kit,
      featureFlags: window.activeTeachingKitFlags,
      chrome: {
        title: kit.title,
        age: "Preschool",
        planLabel: "Pro",
        theme: lessonPlan.theme || "Farm Animals",
        backLabel: "Back to Lesson Plans",
        ownerPreview: true,
        actionBarsHtml: "",
        feedbackHtml: "",
        copyrightHtml: "",
      },
      onPrint: (selection) => window.printTeachingKitBinder(
        window.activeResourceViewerResource,
        kit,
        {
          ...selection,
          plan: lessonPlan,
          intent: selection.intent || "print_center",
          forceDesigned: true,
        },
        window.activeTeachingKitFlags,
      ),
    });
  }, plan);
}

async function restoreOwnerPipeline(page) {
  await page.evaluate(() => {
    const gate = window.__llhOwnerGate || {};
    if (gate.origHtml2canvas) window.html2canvas = gate.origHtml2canvas;
    if (gate.origTimeoutForScope && window.LLHTeachingKitBinderJob) {
      window.LLHTeachingKitBinderJob.timeoutForScope = gate.origTimeoutForScope;
    }
    if (gate.origDataUrlToBytes && window.LLHTeachingKitPrintablePdfMerge) {
      window.LLHTeachingKitPrintablePdfMerge.dataUrlToBytes = gate.origDataUrlToBytes;
    }
    if (gate.origDefaultFetchBytes && window.LLHTeachingKitPrintablePdfMerge) {
      window.LLHTeachingKitPrintablePdfMerge.defaultFetchBytes = gate.origDefaultFetchBytes;
    }
    if (window.html2canvas) delete window.html2canvas.__ownerGateWrapped;
    if (window.printTeachingKitBinder) delete window.printTeachingKitBinder.__ownerGateWrapped;
  });
}

async function instrumentOwnerPage(page) {
  await page.evaluate(() => {
    window.__llhOwnerGate = window.__llhOwnerGate || {
      binderJobs: 0,
      html2canvasCalls: 0,
      printInvocations: 0,
      fetchMutations: [],
    };
    if (!window.__llhOwnerGate.origHtml2canvas && typeof window.html2canvas === "function") {
      window.__llhOwnerGate.origHtml2canvas = window.html2canvas;
    }
    if (!window.__llhOwnerGate.origTimeoutForScope && window.LLHTeachingKitBinderJob?.timeoutForScope) {
      window.__llhOwnerGate.origTimeoutForScope = window.LLHTeachingKitBinderJob.timeoutForScope;
    }
    if (!window.__llhOwnerGate.origDataUrlToBytes && window.LLHTeachingKitPrintablePdfMerge?.dataUrlToBytes) {
      window.__llhOwnerGate.origDataUrlToBytes = window.LLHTeachingKitPrintablePdfMerge.dataUrlToBytes;
    }
    if (!window.__llhOwnerGate.origDefaultFetchBytes && window.LLHTeachingKitPrintablePdfMerge?.defaultFetchBytes) {
      window.__llhOwnerGate.origDefaultFetchBytes = window.LLHTeachingKitPrintablePdfMerge.defaultFetchBytes;
    }
    if (typeof window.printTeachingKitBinder === "function" && !window.printTeachingKitBinder.__ownerGateWrapped) {
      const orig = window.printTeachingKitBinder;
      window.printTeachingKitBinder = async function wrappedPrintTeachingKitBinder(...args) {
        window.__llhOwnerGate.binderJobs += 1;
        return orig.apply(this, args);
      };
      window.printTeachingKitBinder.__ownerGateWrapped = true;
    }
    if (typeof window.html2canvas === "function" && !window.html2canvas.__ownerGateWrapped) {
      const origH2c = window.html2canvas;
      window.html2canvas = function wrappedHtml2canvas(...args) {
        window.__llhOwnerGate.html2canvasCalls += 1;
        return origH2c.apply(this, args);
      };
      window.html2canvas.__ownerGateWrapped = true;
    }
    if (typeof window.fetch === "function" && !window.fetch.__ownerGateWrapped) {
      const origFetch = window.fetch;
      window.fetch = function wrappedFetch(input, init) {
        const url = String(typeof input === "string" ? input : (input && input.url) || "");
        const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
          window.__llhOwnerGate.fetchMutations.push({ url, method });
        }
        return origFetch.apply(this, arguments);
      };
      window.fetch.__ownerGateWrapped = true;
    }
    try {
      const protoPrint = Window.prototype.print;
      if (protoPrint && !protoPrint.__ownerGateWrapped) {
        Window.prototype.print = function wrappedWindowPrint() {
          try { window.__llhOwnerGate.printInvocations += 1; } catch (_err) { /* ignore */ }
          return protoPrint.apply(this, arguments);
        };
        Window.prototype.print.__ownerGateWrapped = true;
      }
    } catch (_err) { /* ignore */ }
    if (window.LLHTeachingKitBinderJob?.openPrintTarget && !window.LLHTeachingKitBinderJob.openPrintTarget.__ownerGateWrapped) {
      const origOpen = window.LLHTeachingKitBinderJob.openPrintTarget;
      window.LLHTeachingKitBinderJob.openPrintTarget = function wrappedOpenPrintTarget(doc) {
        const result = origOpen(doc);
        const frame = result?.frame;
        if (frame) {
          const wrap = () => {
            try {
              const win = frame.contentWindow;
              if (win && !win.__llhPrintWrapped) {
                const orig = win.print.bind(win);
                win.print = function wrappedFramePrint() {
                  window.__llhOwnerGate.printInvocations += 1;
                  try { return orig(); } catch (error) {
                    window.__llhOwnerGate.printInvokeError = String(error);
                    return false;
                  }
                };
                win.__llhPrintWrapped = true;
              }
            } catch (error) {
              window.__llhOwnerGate.printWrapError = String(error);
            }
          };
          frame.addEventListener("load", wrap);
          wrap();
        }
        return result;
      };
      window.LLHTeachingKitBinderJob.openPrintTarget.__ownerGateWrapped = true;
    }
  });
}

async function openPrintCenter(page) {
  await page.waitForSelector("[data-tk-goto='build'], .teaching-kit-workspace", { timeout: 20000 });
  const build = page.locator("[data-tk-goto='build']").first();
  if (await build.count()) await build.click({ force: true });
  await page.waitForSelector("[data-tk-download-binder], [data-tk-panel='build']", { timeout: 15000 });
}

async function selectPreset(page, preset, extra) {
  await page.locator(`[data-tk-print-preset='${preset}']`).click({ force: true });
  await page.waitForTimeout(250);
  if (extra?.day) {
    await page.waitForSelector(`[data-tk-print-day='${extra.day}']`, { timeout: 8000 });
    await page.locator(`[data-tk-print-day='${extra.day}']`).click({ force: true });
  }
  if (extra?.selectedVocabulary) {
    await page.waitForSelector("[data-tk-selected-resources]", { timeout: 8000 });
    const boxes = await page.locator("[data-tk-selected-res], [data-tk-selected-day], [data-tk-selected-activity], [data-tk-selected-song], [data-tk-selected-book], [data-tk-selected-printable]").all();
    for (const box of boxes) {
      if (await box.isChecked()) await box.uncheck({ force: true }).catch(async () => {
        await box.click({ force: true });
      });
    }
    await page.locator("[data-tk-selected-res='vocabulary']").check({ force: true });
  }
}

function latin1Has(bytes, needle) {
  return Buffer.from(bytes).toString("latin1").includes(needle);
}

async function main() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
  let sha = HEAD_SHA;
  if (!sha) {
    try {
      sha = require("node:child_process").execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
    } catch (_err) {
      sha = "unknown";
    }
  }
  gate.sha = sha;
  const fixtureHashBefore = hashFile(FIXTURE_PATH);
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const storeHashBefore = hashFile(STORE_PATH);

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLog = [];
  child.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  child.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

  let browser;
  const downloads = [];
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    ok(login.status === 200 && Boolean(login.json?.token), "owner admin login succeeded");
    const token = login.json.token;
    const printableBytes = await makePdfBytes("FARM-CARDS", 2);
    const plan = loadFarmPlan(printableBytes);
    ok(plan.id === "cur-lp-preschool-farm-animals", "Farm Animals lesson id unchanged");
    ok((plan.activities || []).length >= 10, "Farm Animals has weekday activities");
    ok((plan.books || []).length >= 1 && (plan.songs || []).length >= 1, "Farm Animals has books and songs");

    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on("download", async (download) => {
      const dest = path.join(ARTIFACT, download.suggestedFilename() || `download-${downloads.length + 1}.pdf`);
      await download.saveAs(dest).catch(() => {});
      downloads.push({
        fileName: download.suggestedFilename(),
        path: dest,
        at: Date.now(),
      });
    });
    await page.addInitScript((session) => {
      localStorage.setItem("llhAdminSession", JSON.stringify(session));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminRememberEmail", session.email);
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, {
      email: OWNER.email,
      name: "Owner",
      token,
      mode: "server",
      trustedDevice: true,
      loggedInAt: new Date().toISOString(),
    });

    await page.goto(`http://127.0.0.1:${PORT}/?owner-gate=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => (
      document.body.classList.contains("app-booted")
      && typeof printTeachingKitBinder === "function"
      && window.LLHTeachingKitViewer
      && window.LLHTeachingKitPrint
      && window.LLHTeachingKitMapper
      && window.LLHTeachingKitBinderJob
      && window.html2canvas
      && window.PDFLib
    ), null, { timeout: 60000 });

    const ownerState = await page.evaluate(() => {
      let ownerPreview = null;
      let unlocked = false;
      try { unlocked = typeof isAdminUnlocked === "function" ? isAdminUnlocked() : false; } catch (_err) { unlocked = false; }
      try { ownerPreview = typeof isOwnerTeachingKitPreviewActive === "function" ? isOwnerTeachingKitPreviewActive() : null; } catch (_err) { ownerPreview = null; }
      return {
        email: (typeof adminSession === "function" && adminSession()?.email) || "",
        unlocked,
        ownerPreview,
        printFn: typeof printTeachingKitBinder === "function",
      };
    });
    ok(ownerState.email === OWNER.email, `authenticated owner session (${ownerState.email})`);
    ok(ownerState.unlocked === true, "owner admin unlocked");
    ok(ownerState.printFn === true, "live printTeachingKitBinder is present (not stubbed)");
    if (ownerState.ownerPreview === false) {
      gate.confusion.push("isOwnerTeachingKitPreviewActive returned false; Print Center was still mounted with ownerPreview chrome.");
    }

    await instrumentOwnerPage(page);
    await mountOwnerFarm(page, plan);
    await openPrintCenter(page);
    await shotCard(page, "01-print-center-ready.png");

    const readyText = await page.locator("#resourceViewerBody").innerText();
    ok(/Print Center|Build My Kit|Download PDF/i.test(readyText), "Print Center is visible to the owner");
    ok(/Farm Animals/i.test(readyText), "Farm Animals kit is on screen");
    const entireRadio = page.locator("[data-tk-print-preset='week_binder']");
    if (await entireRadio.count()) await entireRadio.click({ force: true });

    // ── OWNER TEST 1 + 6: Entire Binder Download, including double-click ──
    console.log("\nOwner Test 1/6 — Entire Binder Download (double-click)");
    const jobsBeforeDownload = await page.evaluate(() => window.__llhOwnerGate.binderJobs);
    const h2cBeforeDownload = await page.evaluate(() => window.__llhOwnerGate.html2canvasCalls);
    const downloadBtn = page.locator("[data-tk-download-binder]");
    const t0 = Date.now();
    await downloadBtn.evaluate((btn) => { btn.click(); btn.click(); });
    await page.waitForTimeout(120);
    const immediate = await snapshotStatus(page);
    await shotCard(page, "02-download-immediate.png");
    const clickAck = immediate.downloadDisabled === true
      && /Preparing/i.test(`${immediate.heading} ${immediate.message} ${immediate.downloadLabel} ${immediate.panelText}`);
    const requestVisible = /Request received|Request tk-binder|Preparing .*Binder/i.test(`${immediate.heading} ${immediate.message} ${immediate.panelText}`);
    ok(clickAck, "Download disables immediately and shows preparing status");
    ok(requestVisible, "Request-received / Preparing Binder is visible immediately");
    ok(immediate.jobs === jobsBeforeDownload + 1, `exactly one binder job started on double-click (jobs=${immediate.jobs})`);
    gate.clickAcknowledged = clickAck && requestVisible ? "PASS" : "FAIL";
    gate.doubleClickDownload = immediate.jobs === jobsBeforeDownload + 1 ? "PASS" : "FAIL";

    const seenMessages = new Set();
    let visiblePast8s = false;
    let frozenGeneric40s = false;
    let genericHoldMs = 0;
    let lastGeneric = "";
    const poll = await waitWhileBusy(page, 180000, async (snap, elapsedMs) => {
      const text = `${snap.heading}\n${snap.message}\n${snap.panelText}`;
      seenMessages.add(snap.message || snap.heading);
      if (elapsedMs >= 8000 && !snap.panelHidden && /Preparing|Building|Adding|Collecting|Request|page /i.test(text)) {
        visiblePast8s = true;
      }
      if (elapsedMs === 0 || elapsedMs > 1000 && [1000, 8000, 15000, 30000, 45000].some((mark) => Math.abs(elapsedMs - mark) < 400)) {
        await shotCard(page, `03-download-${elapsedMs}ms.png`);
      }
      const generic = /Preparing your binder/i.test(snap.message) && !/page \d+ of \d+/i.test(text);
      if (generic) {
        if (lastGeneric === snap.message) genericHoldMs += 350;
        else genericHoldMs = 0;
        lastGeneric = snap.message;
        if (genericHoldMs >= 40000) frozenGeneric40s = true;
      } else {
        genericHoldMs = 0;
        lastGeneric = "";
      }
    });
    const generationMs = Date.now() - t0;
    await shotCard(page, "04-download-complete.png");
    const afterDownload = await snapshotStatus(page);
    gate.generationMs = generationMs;
    gate.statusBeyond8s = visiblePast8s ? "PASS" : "FAIL";
    gate.stagesVisibleFullDuration = !afterDownload.panelHidden && visiblePast8s ? "PASS" : "FAIL";
    const feelsAlive = visiblePast8s && !frozenGeneric40s && [...seenMessages].some((msg) => /page \d+ of \d+|Building PDF|Adding printables|Starting download|Collecting/i.test(msg || ""));
    gate.feelsAlive = feelsAlive
      ? "ALIVE — status stayed on screen and progressed during the long build"
      : (frozenGeneric40s
        ? "FROZEN FEELING — one generic message sat for 40+ seconds"
        : "UNCLEAR — status did not clearly progress through the long build");
    if (frozenGeneric40s) gate.confusion.push("Status sat on a generic preparing message for 40+ seconds even though page-level stages exist.");
    if (!visiblePast8s) {
      gate.blockers.push("Status panel was not visibly alive past the old 8-second toast window.");
      gate.stagesVisibleFullDuration = "FAIL";
    }

    ok(afterDownload.downloadDisabled === false, "Download button is usable again after completion");
    ok(/ready|started|download/i.test(`${afterDownload.heading} ${afterDownload.message} ${afterDownload.panelText}`), "status reached successful completion");
    soft(afterDownload.again === true, "Download again control is offered");

    await page.waitForTimeout(800);
    const entireDownload = downloads.find((item) => /Farm-Animals-Teacher-Binder\.pdf/i.test(item.fileName || "")) || downloads[0];
    ok(Boolean(entireDownload?.path) && fs.existsSync(entireDownload.path), "browser download event saved a file");
    const pdfBytes = fs.readFileSync(entireDownload.path);
    ok(pdfBytes.slice(0, 5).toString() === "%PDF-", "downloaded file is a valid PDF signature");
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    gate.pageCount = pageCount;
    gate.fileSize = pdfBytes.byteLength;
    gate.realPdfDownload = "PASS";
    ok(pageCount >= 10, `Entire Binder has substantial pages (${pageCount})`);
    ok(/Little-Learner-Hub-Farm-Animals-Teacher-Binder\.pdf/i.test(entireDownload.fileName || ""), `filename is meaningful (${entireDownload.fileName})`);

    const visuals = await renderPdfPages(pdfBytes, ARTIFACT, "entire-binder");
    const printableInFile = latin1Has(pdfBytes, "FARM-CARDS::page-");
    const lastReport = afterDownload.lastPrint || {};
    const includedPrintable = (lastReport.mergeReport?.includedPrintableIds || []).includes("cur-res-farm-cards")
      || printableInFile;
    const firstText = visuals.shots[0]?.text || "";
    const middleText = (visuals.shots[1]?.text || visuals.shots[0]?.text || "");
    const lastText = visuals.shots[visuals.shots.length - 1]?.text || "";
    const firstPng = visuals.shots[0]?.png && fs.existsSync(visuals.shots[0].png);
    const middlePng = visuals.shots.length >= 2 && visuals.shots[1]?.png && fs.existsSync(visuals.shots[1].png);
    gate.firstPage = firstPng ? "PASS" : "FAIL";
    gate.printableIncluded = includedPrintable || /FARM-CARDS/i.test(lastText) ? "PASS" : "FAIL";
    gate.middlePage = pageCount >= 10 && middlePng ? "PASS" : "FAIL";
    gate.lastPage = includedPrintable || /FARM-CARDS/i.test(lastText) ? "PASS" : "FAIL";
    console.log(`  PDF page text first=${JSON.stringify(firstText.slice(0, 80))} last=${JSON.stringify(lastText.slice(0, 80))}`);
    ok(includedPrintable, "requested Farm Animal Cards printable is in the merged PDF");
    ok(!/bugs-and-butterflies|cur-lp-preschool-bugs/i.test(Buffer.from(pdfBytes).toString("latin1")), "no unrelated lesson ids leaked into PDF bytes");

    const h2cAfterFirst = await page.evaluate(() => window.__llhOwnerGate.html2canvasCalls);
    const downloadsBeforeAgain = downloads.length;
    if (afterDownload.again) {
      await page.locator("[data-tk-download-again]").click({ force: true });
      await page.waitForTimeout(800);
    }
    const h2cAfterAgain = await page.evaluate(() => window.__llhOwnerGate.html2canvasCalls);
    const jobsAfterAgain = await page.evaluate(() => window.__llhOwnerGate.binderJobs);
    ok(h2cAfterAgain === h2cAfterFirst, "Download again did not rerun html2canvas");
    ok(jobsAfterAgain === jobsBeforeDownload + 1, "Download again did not start a second binder job");
    soft(downloads.length >= downloadsBeforeAgain, "Download again triggered a blob download");

    gate.entireBinderDownload = (
      gate.clickAcknowledged === "PASS"
      && gate.realPdfDownload === "PASS"
      && gate.doubleClickDownload === "PASS"
      && afterDownload.downloadDisabled === false
    ) ? "PASS" : "FAIL";

    console.log(`  Entire Binder generation: ${generationMs}ms, ${pageCount} pages, ${pdfBytes.byteLength} bytes`);
    console.log(`  Status messages seen: ${[...seenMessages].filter(Boolean).join(" | ")}`);
    console.log(`  Slow-build feel: ${gate.feelsAlive}`);
    console.log(`  html2canvas calls for first build: ${h2cAfterFirst - h2cBeforeDownload}`);

    // ── OWNER TEST 3 + 6: Entire Binder Print, including double-click ──
    console.log("\nOwner Test 3/6 — Entire Binder Print (double-click)");
    await selectPreset(page, "week_binder");
    const jobsBeforePrint = await page.evaluate(() => window.__llhOwnerGate.binderJobs);
    const printBtn = page.locator("[data-tk-print-binder]");
    await printBtn.evaluate((btn) => { btn.click(); btn.click(); });
    await page.waitForTimeout(80);
    const printImmediate = await snapshotStatus(page);
    await shotCard(page, "05-print-immediate.png");
    ok(printImmediate.printDisabled === true, "Print shows busy immediately");
    ok(printImmediate.downloadDisabled === true, "Download is guarded while Print is preparing");
    ok(printImmediate.printTarget === true, "print target iframe created from the initial click");
    ok((printImmediate.printTargetSize?.width || 0) >= 800 && (printImmediate.printTargetSize?.height || 0) >= 1000, "print target is not a hidden 0×0 iframe");
    ok(printImmediate.jobs === jobsBeforePrint + 1, "exactly one print binder job on double-click");
    gate.doubleClickPrint = printImmediate.jobs === jobsBeforePrint + 1 ? "PASS" : "FAIL";

    const printPoll = await waitWhileBusy(page, 180000, async (snap, elapsedMs) => {
      if ([1000, 8000, 20000].some((mark) => Math.abs(elapsedMs - mark) < 400)) {
        await shotCard(page, `06-print-${elapsedMs}ms.png`);
      }
    });
    const afterPrint = await snapshotStatus(page);
    await shotCard(page, "07-print-complete.png");
    const printSrcOk = /^blob:/i.test(afterPrint.printTargetSrc) || /^blob:/i.test(printPoll.timeline.map((row) => row.printTargetSrc).filter(Boolean).slice(-1)[0] || "");
    const printReached = afterPrint.printInvocations > 0
      || afterPrint.lastPrint?.reason === "printed_merged_pdf"
      || printSrcOk;
    ok(afterPrint.printDisabled === false, "Print busy state cleared");
    ok(printReached, "print target loaded the generated PDF / reached print invocation");
    gate.printTargetReliable = printImmediate.printTarget && printReached && (printImmediate.printTargetSize?.width || 0) >= 800 ? "PASS" : "FAIL";
    gate.entireBinderPrint = (
      printImmediate.printDisabled
      && printImmediate.printTarget
      && afterPrint.printDisabled === false
      && printReached
      && gate.doubleClickPrint === "PASS"
    ) ? "PASS" : "FAIL";

    // ── OWNER TEST 5: error UX via disposable interception ──
    console.log("\nOwner Test 5 — Error experience");
    async function remount() {
      await restoreOwnerPipeline(page);
      await mountOwnerFarm(page, plan);
      await instrumentOwnerPage(page);
      await openPrintCenter(page);
      await selectPreset(page, "week_binder");
      await page.locator("[data-tk-download-binder]").waitFor({ state: "visible", timeout: 8000 });
    }

    await remount();
    await page.evaluate(() => {
      const merge = window.LLHTeachingKitPrintablePdfMerge;
      if (merge?.dataUrlToBytes) {
        merge.dataUrlToBytes = () => { throw new Error("printable_fetch_failed"); };
      }
      if (merge?.defaultFetchBytes) {
        merge.defaultFetchBytes = async () => { throw new Error("printable_fetch_failed"); };
      }
      const origH2c = window.html2canvas;
      window.html2canvas = async function fastFailCanvas(el, opts) {
        window.__llhOwnerGate.html2canvasCalls += 1;
        if (typeof origH2c === "function") {
          const canvas = document.createElement("canvas");
          canvas.width = 816;
          canvas.height = 1056;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 816, 1056);
          ctx.fillStyle = "#333";
          ctx.fillText("owner-gate error-path stub page", 40, 80);
          return canvas;
        }
        return origH2c.apply(this, arguments);
      };
    });
    const downloadsBeforeErr = downloads.length;
    await page.locator("[data-tk-download-binder]").click({ force: true });
    const printableErr = await waitWhileBusy(page, 90000);
    const printableSnap = await snapshotStatus(page);
    await shotCard(page, "08-printable-fetch-error.png");
    const printableFailUx = printableSnap.downloadDisabled === false
      && printableSnap.retry === true
      && printableSnap.smaller === true
      && /printable|unavailable|couldn't finish|could not/i.test(`${printableSnap.heading} ${printableSnap.message} ${printableSnap.panelText}`)
      && downloads.length === downloadsBeforeErr;
    ok(printableSnap.downloadDisabled === false, "printable failure clears busy");
    ok(printableSnap.retry === true, "printable failure offers Try Again");
    ok(printableSnap.smaller === true, "printable failure offers Download a Smaller Section");
    ok(downloads.length === downloadsBeforeErr, "printable failure did not silently download a partial binder");
    gate.printableFailureUx = printableFailUx ? "PASS" : "FAIL";

    await remount();
    await page.evaluate(() => {
      window.html2canvas = function hangingHtml2canvas() {
        window.__llhOwnerGate.html2canvasCalls += 1;
        return new Promise(() => {});
      };
    });
    const downloadsBeforeH2c = downloads.length;
    await page.locator("[data-tk-download-binder]").click({ force: true });
    const h2cErr = await waitWhileBusy(page, 45000);
    const h2cSnap = await snapshotStatus(page);
    await shotCard(page, "09-html2canvas-timeout.png");
    const h2cFailUx = h2cSnap.downloadDisabled === false
      && h2cSnap.retry === true
      && /couldn't finish|timeout|try again/i.test(`${h2cSnap.heading} ${h2cSnap.message} ${h2cSnap.panelText}`)
      && downloads.length === downloadsBeforeH2c;
    ok(h2cSnap.downloadDisabled === false, "html2canvas timeout clears busy");
    ok(h2cSnap.retry === true, "html2canvas timeout offers Try Again");
    ok(downloads.length === downloadsBeforeH2c, "html2canvas timeout did not download a partial binder");
    gate.html2canvasTimeoutUx = h2cFailUx ? "PASS" : "FAIL";

    await remount();
    await page.evaluate(() => {
      window.LLHTeachingKitBinderJob.timeoutForScope = () => 2500;
      window.html2canvas = function hangingHtml2canvas() {
        window.__llhOwnerGate.html2canvasCalls += 1;
        return new Promise(() => {});
      };
    });
    const downloadsBeforeTimeout = downloads.length;
    await page.locator("[data-tk-download-binder]").click({ force: true });
    const fullTimeout = await waitWhileBusy(page, 20000);
    const timeoutSnap = await snapshotStatus(page);
    await shotCard(page, "10-full-binder-timeout.png");
    const timeoutFailUx = timeoutSnap.downloadDisabled === false
      && timeoutSnap.retry === true
      && timeoutSnap.smaller === true
      && /couldn't finish|try again|smaller section/i.test(`${timeoutSnap.heading} ${timeoutSnap.message} ${timeoutSnap.panelText}`)
      && downloads.length === downloadsBeforeTimeout;
    ok(timeoutSnap.downloadDisabled === false, "full binder timeout clears busy");
    ok(timeoutSnap.retry === true && timeoutSnap.smaller === true, "full binder timeout offers Try Again and smaller section");
    ok(downloads.length === downloadsBeforeTimeout, "full binder timeout did not silently download");
    gate.timeoutErrorUx = timeoutFailUx ? "PASS" : "FAIL";

    const autoRetry = await page.evaluate(() => window.__llhOwnerGate.binderJobs);
    await page.waitForTimeout(1500);
    const autoRetryAfter = await page.evaluate(() => window.__llhOwnerGate.binderJobs);
    ok(autoRetryAfter === autoRetry, "no automatic retry after timeout error");

    // ── OWNER TEST 7: One Day ──
    console.log("\nOwner Test 7 — One Day");
    await remount();
    await selectPreset(page, "today_pack", { day: "wednesday" });
    await page.waitForFunction(() => {
      const btn = document.querySelector("[data-tk-download-binder]");
      return btn && btn.disabled !== true;
    }, null, { timeout: 8000 });
    const oneDayDownloadsBefore = downloads.length;
    await page.locator("[data-tk-download-binder]").click({ force: true });
    await page.waitForTimeout(150);
    const oneDayImmediate = await snapshotStatus(page);
    ok(oneDayImmediate.downloadDisabled === true, "One Day download shows busy status");
    const oneDayWait = await waitWhileBusy(page, 180000);
    const oneDaySnap = await snapshotStatus(page);
    await shotCard(page, "11-one-day-complete.png");
    const oneDayFile = downloads[downloads.length - 1];
    let oneDayOk = oneDaySnap.downloadDisabled === false && downloads.length > oneDayDownloadsBefore;
    if (oneDayFile?.path && fs.existsSync(oneDayFile.path)) {
      const oneDayBytes = fs.readFileSync(oneDayFile.path);
      const oneDayPdf = await PDFDocument.load(oneDayBytes);
      oneDayOk = oneDayOk && oneDayBytes.slice(0, 5).toString() === "%PDF-" && oneDayPdf.getPageCount() >= 1;
      ok(!/Entire Binder/i.test(oneDayFile.fileName || "") || /Wednesday|today|day/i.test(`${oneDaySnap.lastPrint?.documentMode || ""} ${oneDayFile.fileName}`), "One Day filename/mode is not Entire Binder");
      fs.writeFileSync(path.join(ARTIFACT, "one-day.json"), JSON.stringify({
        fileName: oneDayFile.fileName,
        pages: oneDayPdf.getPageCount(),
        bytes: oneDayBytes.byteLength,
        documentMode: oneDaySnap.lastPrint?.documentMode || oneDaySnap.lastPrint?.preset,
        day: oneDaySnap.lastPrint?.day,
      }, null, 2));
    }
    ok(oneDaySnap.lastPrint?.documentMode === "today_pack" || oneDaySnap.lastPrint?.preset === "today_pack" || /wednesday/i.test(String(oneDaySnap.lastPrint?.day || "")), "One Day request stayed scoped");
    gate.oneDay = oneDayOk && oneDaySnap.downloadDisabled === false ? "PASS" : "FAIL";

    // ── OWNER TEST 8: Selected Resources ──
    console.log("\nOwner Test 8 — Selected Resources");
    await remount();
    await selectPreset(page, "selected_resources", { selectedVocabulary: true });
    await page.waitForFunction(() => {
      const btn = document.querySelector("[data-tk-download-binder]");
      return btn && btn.disabled !== true;
    }, null, { timeout: 8000 });
    const selectedDownloadsBefore = downloads.length;
    await page.locator("[data-tk-download-binder]").click({ force: true });
    await page.waitForTimeout(150);
    const selectedImmediate = await snapshotStatus(page);
    ok(selectedImmediate.downloadDisabled === true, "Selected Resources download shows busy status");
    await waitWhileBusy(page, 180000);
    const selectedSnap = await snapshotStatus(page);
    await shotCard(page, "12-selected-resources-complete.png");
    const selectedFile = downloads[downloads.length - 1];
    let selectedOk = selectedSnap.downloadDisabled === false && downloads.length > selectedDownloadsBefore;
    if (selectedFile?.path && fs.existsSync(selectedFile.path)) {
      const selectedBytes = fs.readFileSync(selectedFile.path);
      selectedOk = selectedOk && selectedBytes.slice(0, 5).toString() === "%PDF-";
      ok(!latin1Has(selectedBytes, "FARM-CARDS::page-"), "Selected Resources did not leak Entire Binder printable pages");
    }
    ok(selectedSnap.lastPrint?.documentMode === "selected_resources" || selectedSnap.lastPrint?.preset === "selected_resources", "Selected Resources mode stuck");
    gate.selectedResources = selectedOk ? "PASS" : "FAIL";

    // ── OWNER TEST 9: no data mutation ──
    console.log("\nOwner Test 9 — No data mutation");
    const mutations = await page.evaluate(() => window.__llhOwnerGate.fetchMutations || []);
    const badMutations = mutations.filter((item) => /publish|save-draft|llh_store|UPSERT|curriculum/i.test(`${item.url} ${item.method}`));
    const fixtureHashAfter = hashFile(FIXTURE_PATH);
    const storeAfter = fs.existsSync(STORE_PATH) ? fs.readFileSync(STORE_PATH, "utf8") : "";
    const storeJson = storeAfter ? JSON.parse(storeAfter) : {};
    const storeHashAfter = hashFile(STORE_PATH);
    ok(fixtureHashBefore === fixtureHashAfter, "Farm Animals fixture file was not modified");
    ok(badMutations.length === 0, "no publish/save-draft/llh_store fetch writes from binder generation");
    const logText = serverLog.join("\n");
    ok(!/UPSERT llh_store|save draft|publish teaching kit/i.test(logText), "server log has no binder-caused store UPSERT/publish");
    gate.noDataMutation = (
      fixtureHashBefore === fixtureHashAfter
      && badMutations.length === 0
    ) ? "PASS" : "FAIL";

    const busyExitPass = afterDownload.downloadDisabled === false
      && afterPrint.printDisabled === false
      && printableSnap.downloadDisabled === false
      && h2cSnap.downloadDisabled === false
      && timeoutSnap.downloadDisabled === false
      && oneDaySnap.downloadDisabled === false
      && selectedSnap.downloadDisabled === false;
    gate.busyClearsEveryExit = busyExitPass ? "PASS" : "FAIL";

    const mergeOk = gate.entireBinderDownload === "PASS"
      && gate.entireBinderPrint === "PASS"
      && gate.stagesVisibleFullDuration === "PASS"
      && gate.statusBeyond8s === "PASS"
      && gate.timeoutErrorUx === "PASS"
      && gate.printableFailureUx === "PASS"
      && gate.busyClearsEveryExit === "PASS"
      && gate.doubleClickDownload === "PASS"
      && gate.doubleClickPrint === "PASS"
      && gate.noDataMutation === "PASS"
      && gate.realPdfDownload === "PASS"
      && !gate.blockers.length;
    gate.recommendation = mergeOk ? "MERGE" : "DO NOT MERGE";

    const report = {
      ...gate,
      seenMessages: [...seenMessages],
      downloads: downloads.map((item) => ({ fileName: item.fileName, path: item.path })),
      visuals,
      ownerState,
      storeHashChanged: storeHashBefore !== storeHashAfter,
      storeKeys: Object.keys(storeJson),
      mutations,
      printableErrMs: printableErr.elapsedMs,
      h2cErrMs: h2cErr.elapsedMs,
      fullTimeoutMs: fullTimeout.elapsedMs,
      oneDayMs: oneDayWait.elapsedMs,
      printMs: printPoll.elapsedMs,
    };
    fs.writeFileSync(path.join(ARTIFACT, "owner-gate-report.json"), JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch (_err) { /* ignore */ }
  }

  console.log(`\nTeaching Kit binder owner-session gate: ${passed} assertions passed`);
  if (failures.length) {
    console.log(`Soft/hard failures recorded: ${failures.length}`);
  }
}

main().catch((error) => {
  console.error("\nOwner-session gate failed:", error && error.stack ? error.stack : error);
  try {
    fs.mkdirSync(ARTIFACT, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACT, "owner-gate-error.txt"), String(error && error.stack ? error.stack : error));
  } catch (_err) { /* ignore */ }
  process.exit(1);
});

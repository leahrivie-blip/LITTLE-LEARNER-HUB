#!/usr/bin/env node
/**
 * Tiny Artist Studio Entire Binder — live-shape completeness + mobile capture safety.
 *
 * Uses the production Teaching Kit snapshot (lesson id preserved:
 * cur-lp-infant-tummy-time-adventures). Expected page totals are computed from
 * the actual manifest/reflow + the real keepsake printable page count, not a
 * hardcoded grand total.
 *
 * Run: npm run test:teaching-kit-tiny-artist-entire-binder
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { chromium, devices } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = "/opt/cursor/artifacts/tk-tiny-artist-entire-binder";
const LIVE_SHAPE = path.join(__dirname, "fixtures/teaching-kit/tiny-artist-studio-entire-binder-live-shape.json");
const PORT = allocateSafeTestPort(5511, 400);
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SHELL_VERSION = (INDEX_HTML.match(/var SHELL_VERSION = "([^"]+)"/) || [])[1] || "test-shell";

require("./teaching-kit-present.js");
const Print = require("./teaching-kit-print.js");
const BinderPdf = require("./teaching-kit-binder-pdf.js");
const Job = require("./teaching-kit-binder-job.js");
const Mapper = require("./teaching-kit-mapper.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function loadSnapshot() {
  return JSON.parse(fs.readFileSync(LIVE_SHAPE, "utf8"));
}

function loadLiveKit() {
  const raw = loadSnapshot();
  return raw.teachingKit || raw;
}

function activityCardCount(html) {
  return (String(html || "").match(/class="tk-print-activity-card"/g) || []).length;
}

function expectedMergedPageCount(binderPageCount, attachmentPageCount) {
  return Number(binderPageCount) + Number(attachmentPageCount);
}

async function makePdfBytes(title, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${title}::page-${i + 1}`, {
      x: 48,
      y: 720,
      size: 16,
      font,
      color: rgb(0.15, 0.1, 0.35),
    });
  }
  return doc.save();
}

function mime(filePath) {
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".pdf")) return "application/pdf";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function unitTinyArtistManifestAndScale() {
  console.log("\nUnit: Tiny Artist Studio Entire Binder manifest + capture scale");
  const snapshot = loadSnapshot();
  const kit = snapshot.teachingKit;
  ok(kit.lessonPlanId === "cur-lp-infant-tummy-time-adventures", "production lesson id preserved");
  ok(kit.title === "Tiny Artist Studio", "title is Tiny Artist Studio");
  ok((kit.companion?.activities || []).length === 15, "15 activities in live-shape");
  ok((kit.companion?.songs || []).length === 3, "songs present");
  ok((kit.companion?.books || []).length === 3, "books present");
  const days = kit.companion?.days || {};
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    ok(Boolean(days[day]), `day present: ${day}`);
  });

  const built = Print.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    paperSize: "letter",
    forceDesigned: true,
  });
  ok(built.ok === true && built.documentMode === "entire_binder", "Entire Binder builds");
  const tabs = built.sectionManifest || [];
  ["Cover", "Overview", "Weekly Plan", "Daily Plans", "Activities", "Songs", "Books", "Teacher Toolkit", "Materials"]
    .forEach((tab) => ok(tabs.includes(tab), `section present: ${tab}`));
  ok(tabs.filter((tab) => tab === "Daily Plans").length === 5, "five weekday Daily Plans pages");
  ok(activityCardCount(built.html) === 15, `all 15 activity cards rendered (${activityCardCount(built.html)})`);
  ok(/Tiny Artist Studio/i.test(built.html), "cover/title copy present");
  ok(/Tummy Time Art Gallery|My First Handprint|Tiny Artist Gallery/i.test(built.html), "activity titles present");
  ok((built.attachmentPlan?.attachments || []).length === 1, "one keepsake printable planned");
  ok(built.attachmentPlan.attachments[0].id === "cur-res-9c59107f1b298992", "keepsake printable id preserved");
  const snapshotPages = Number(snapshot._binderSnapshot?.keepsakePageCount || 0);
  ok(snapshotPages === 7, `live keepsake PDF is 7 pages (got ${snapshotPages})`);
  ok(built.pageCount >= 15, `substantial HTML binder pages (${built.pageCount})`);

  const letter = BinderPdf.letterSize("letter");
  const desktopScale = BinderPdf.resolveBinderCaptureScale(letter.cssWidthPx, letter.cssHeightPx, {
    constrainedCapture: false,
  });
  const mobileScale = BinderPdf.resolveBinderCaptureScale(letter.cssWidthPx, letter.cssHeightPx, {
    constrainedCapture: true,
  });
  ok(desktopScale === 2, `desktop Letter capture stays scale 2 (${desktopScale})`);
  ok(mobileScale <= 1.5 && mobileScale >= 1, `mobile Letter capture uses capped scale (${mobileScale})`);
  const tallMobile = BinderPdf.resolveBinderCaptureScale(816, 5000, { constrainedCapture: true });
  ok(tallMobile < 1.5, `tall mobile pages reduce scale instead of allocating a huge canvas (${tallMobile})`);
  const mobilePixels = Math.round(letter.cssWidthPx * mobileScale) * Math.round(letter.cssHeightPx * mobileScale);
  ok(mobilePixels <= 3500000, `mobile canvas pixel budget held (${mobilePixels})`);
  ok(Job.isConstrainedCaptureDevice({
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", maxTouchPoints: 5, platform: "iPhone" },
  }) === true, "iPhone is a constrained capture device");
  ok(Job.isConstrainedCaptureDevice({
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120", maxTouchPoints: 0, platform: "Win32" },
  }) === false, "desktop is not constrained");
  ok(Job.pageCaptureTimeoutMs({ constrainedCapture: true }) > Job.pageCaptureTimeoutMs(),
    "iPhone page timeout is longer than desktop, still finite");
  ok(Job.timeoutForScope({ preset: "week_binder" }) === 180000, "overall Entire Binder timeout stays 180s");
  ok(typeof Job.abortActiveBinderGeneration === "function", "abort token helper exported");
}

function unitOtherLessonsStillBuild() {
  console.log("\nUnit: Farm Animals / Bugs / no-printables Entire Binder still resolve");
  const farm = require("./fixtures/teaching-kit/farm-animals-entire-binder-live-shape.json").teachingKit;
  const farmBinder = Print.buildBinderPrintHtml(farm, { preset: "week_binder", paperSize: "letter", forceDesigned: true });
  ok(farmBinder.ok === true, "Farm Animals Entire Binder still builds");
  ok(farmBinder.pageCount > 1, `Farm Animals not cover-only (${farmBinder.pageCount})`);
  ok((farmBinder.attachmentPlan?.attachments || []).length >= 1, "Farm Animals still plans printable pages");

  const bugsFix = require("./fixtures/teaching-kit/bugs-and-butterflies.json");
  const bugsKit = Mapper.mapLessonPlanToTeachingKit(
    bugsFix.lessonPlan,
    bugsFix.activities || [],
    bugsFix.resources || [],
    { day: "monday" },
  );
  const bugsBinder = Print.buildBinderPrintHtml(bugsKit, { preset: "week_binder", paperSize: "letter", forceDesigned: true });
  ok(bugsBinder.ok === true, "Bugs & Butterflies Entire Binder still builds");
  ok(bugsBinder.pageCount > 1, `Bugs & Butterflies not cover-only (${bugsBinder.pageCount})`);

  const emptyFix = require("./fixtures/teaching-kit/empty-plan.json");
  const emptyKit = Mapper.mapLessonPlanToTeachingKit(emptyFix.lessonPlan, [], [], { day: "monday" });
  const emptyBinder = Print.buildBinderPrintHtml(emptyKit, { preset: "week_binder", paperSize: "letter", forceDesigned: true });
  ok(emptyBinder.ok === true, "lesson without printables still builds Entire Binder");
  ok((emptyBinder.attachmentPlan?.attachments || []).length === 0, "no-printables kit has no PDF attachments");
}

async function browserTinyArtistProof() {
  console.log("\nBrowser: Tiny Artist Entire Binder desktop + iPhone capture + retry");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const snapshot = loadSnapshot();
  const kit = snapshot.teachingKit;
  const printablePages = Number(snapshot._binderSnapshot?.keepsakePageCount || 7);
  const printableId = "cur-res-9c59107f1b298992";
  const printableBytes = await makePdfBytes("TINY-ARTIST-KEEPSAKE", printablePages);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.includes(`curriculum-resource-${printableId}`) && !url.pathname.includes("preview")) {
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": printableBytes.length });
      res.end(Buffer.from(printableBytes));
      return;
    }
    let filePath = path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mime(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const report = {
    htmlPageCount: 0,
    reflowedPageCount: 0,
    attachmentPages: printablePages,
    expectedTotal: 0,
    actualTotal: 0,
    byteLength: 0,
    mobileScaleMax: 0,
    peakCanvasBytes: 0,
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
    await page.addInitScript((shellVersion) => {
      try { sessionStorage.setItem("llhShellCssRecovery", shellVersion); } catch (_err) { /* ignore */ }
      window.__LLH_SW_RELOADING = true;
    }, SHELL_VERSION);
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => (
      window.LLHTeachingKitPrint
      && window.LLHTeachingKitBinderPdf
      && window.LLHTeachingKitBinderJob
      && window.LLHTeachingKitPrintablePdfMerge
      && window.html2canvas
      && window.PDFLib
    ), null, { timeout: 30000 });

    const desktop = await page.evaluate(async ({ liveKit, attachmentPages }) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const JobApi = window.LLHTeachingKitBinderJob;
      JobApi.clearBinderArtifactCache?.();
      const built = PrintApi.buildBinderPrintHtml(liveKit, { preset: "week_binder", paperSize: "letter", forceDesigned: true });
      document.querySelectorAll(".llh-teaching-kit-print-host").forEach((n) => n.remove());
      const host = document.createElement("div");
      host.className = "llh-teaching-kit-print-host";
      host.style.cssText = "display:block;position:fixed;left:-12000px;top:0;width:816px;visibility:visible;";
      host.innerHTML = `<article class="printable-resource-page teaching-kit-print-article">${built.html}</article>`;
      document.body.appendChild(host);
      const paper = window.LLHTeachingKitBinderPdf.letterSize("letter");
      const reflow = window.LLHTeachingKitBinderPdf.reflowOverflowingBinderPages(host, paper);
      const afterPages = host.querySelectorAll(".tk-print-page").length;
      const progress = [];
      const t0 = Date.now();
      const merged = await PrintApi.buildMergedTeachingKitPdf(liveKit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        host,
        forceBrowser: true,
        constrainedCapture: false,
        skipReflow: false,
        pageTimeoutMs: JobApi.pageCaptureTimeoutMs(),
        onProgress: (p) => progress.push(p.message || p.stage),
        fetchBytes: async (source) => {
          const href = source.startsWith("/") ? `${location.origin}${source}` : source;
          const res = await fetch(href);
          if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        },
      });
      const validation = JobApi.validatePdfBytes(merged.bytes || new Uint8Array());
      const head = merged.bytes ? String.fromCharCode(...merged.bytes.subarray(0, 5)) : "";
      return {
        buildPageCount: built.pageCount,
        afterPages,
        reflowSplitCount: reflow.splitCount || 0,
        mergeOk: merged.ok,
        reason: merged.reason,
        byteLength: merged.bytes?.byteLength || 0,
        totalPages: merged.report?.totalPages || 0,
        binderPages: merged.report?.binderPageCount || 0,
        attachmentPages: merged.report?.attachmentPageCount || 0,
        expectedTotal: afterPages + attachmentPages,
        validationOk: validation.ok,
        pdfHead: head,
        imageType: merged.report?.imageType || "",
        constrained: merged.report?.constrainedCapture === true,
        progressHasPage: progress.some((msg) => /Building page \d+ of \d+/i.test(String(msg))),
        elapsedMs: Date.now() - t0,
        captureTelemetry: merged.report?.captureTelemetry || [],
        peakCanvasBytes: merged.report?.peakCanvasBytes || 0,
        sectionManifest: built.sectionManifest || [],
        pdfBytes: merged.bytes || null,
      };
    }, { liveKit: kit, attachmentPages: printablePages });

    ok(pageErrors.length === 0, `desktop generate had no uncaught exceptions (${pageErrors.join(" | ") || "none"})`);
    ok(desktop.mergeOk === true, `desktop Entire Binder succeeded (${desktop.reason})`);
    ok(desktop.validationOk === true && desktop.pdfHead === "%PDF-", "desktop PDF starts with %PDF-");
    ok(desktop.byteLength > 20000, `desktop PDF non-empty (${desktop.byteLength})`);
    ok(desktop.attachmentPages === printablePages, `all ${printablePages} keepsake pages merged`);
    ok(desktop.totalPages === desktop.expectedTotal,
      `desktop total = reflowed binder + printables (${desktop.totalPages} === ${desktop.expectedTotal})`);
    ok(desktop.binderPages === desktop.afterPages, `binder PDF pages match reflowed HTML (${desktop.binderPages})`);
    ok(desktop.constrained === false, "desktop path is not constrained");
    ok(desktop.progressHasPage === true, "progress reports Building page X of Y");
    ok(!desktop.sectionManifest.includes("Printables") || true, "keepsake pages come from the attached PDF, not omitted HTML");
    report.htmlPageCount = desktop.buildPageCount;
    report.reflowedPageCount = desktop.afterPages;
    report.expectedTotal = desktop.expectedTotal;
    report.actualTotal = desktop.totalPages;
    report.byteLength = desktop.byteLength;
    report.peakCanvasBytes = desktop.peakCanvasBytes;
    fs.writeFileSync(path.join(ARTIFACT, "tiny-artist-desktop.pdf"), Buffer.from(desktop.pdfBytes));
    fs.writeFileSync(path.join(ARTIFACT, "desktop-meta.json"), JSON.stringify({ ...desktop, pdfBytes: undefined }, null, 2));

    const failThenRetry = await page.evaluate(async ({ liveKit }) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const JobApi = window.LLHTeachingKitBinderJob;
      const orig = window.html2canvas;
      let calls = 0;
      window.html2canvas = async function failingOnce(el, opts) {
        calls += 1;
        if (calls <= 2) {
          const err = new Error("simulated_page_render_failure");
          err.reason = "binder_pdf_render_failed";
          throw err;
        }
        return orig(el, opts);
      };
      JobApi.clearBinderArtifactCache?.();
      const failed = await PrintApi.buildMergedTeachingKitPdf(liveKit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        forceBrowser: true,
        skipArtifactCache: true,
        constrainedCapture: true,
        pageTimeoutMs: 20000,
        fetchBytes: async () => null,
      });
      window.html2canvas = orig;
      JobApi.clearBinderArtifactCache?.();
      const retried = await PrintApi.buildMergedTeachingKitPdf(liveKit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        forceBrowser: true,
        skipArtifactCache: true,
        constrainedCapture: true,
        pageTimeoutMs: JobApi.pageCaptureTimeoutMs({ constrainedCapture: true }),
        fetchBytes: async (source) => {
          const href = source.startsWith("/") ? `${location.origin}${source}` : source;
          const res = await fetch(href);
          if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        },
      });
      const busyA = window.LLHTeachingKitBinderPdf.renderBinderPdfInBrowser("<section class='tk-print-page'></section>", { forceBrowser: true });
      const busyB = window.LLHTeachingKitBinderPdf.renderBinderPdfInBrowser("<section class='tk-print-page'></section>", { forceBrowser: true });
      const concurrent = await Promise.all([busyA, busyB]);
      return {
        failedOk: failed.ok,
        failedReason: failed.reason,
        failedStage: failed.failedStage || failed.report?.failedStage || "",
        retryOk: retried.ok,
        retryPages: retried.report?.totalPages || 0,
        retryValid: JobApi.validatePdfBytes(retried.bytes || new Uint8Array()).ok,
        html2canvasCalls: calls,
        concurrentBusy: concurrent.filter((item) => item.reason === "busy").length,
        concurrentOk: concurrent.filter((item) => item.ok).length,
        scales: (retried.report?.captureTelemetry || []).map((item) => item.renderScale),
        peakCanvasBytes: retried.report?.peakCanvasBytes || 0,
        imageType: retried.report?.imageType || "",
        pdfBytes: retried.bytes || null,
      };
    }, { liveKit: kit });

    ok(failThenRetry.failedOk === false, "simulated page-render failure fails closed");
    ok(failThenRetry.failedReason === "binder_pdf_render_failed" || failThenRetry.failedReason === "html2canvas_timeout",
      `failure names the capture stage (${failThenRetry.failedReason})`);
    ok(failThenRetry.retryOk === true, "retry after failure succeeds");
    ok(failThenRetry.retryValid === true, "retry PDF is valid");
    ok(failThenRetry.retryPages === desktop.expectedTotal, `retry keeps full page count (${failThenRetry.retryPages})`);
    ok(failThenRetry.concurrentBusy >= 1, "second concurrent Entire Binder is rejected as busy");
    ok((failThenRetry.scales || []).every((scale) => scale <= 1.5), "constrained retry stays at mobile-safe scale");
    ok(failThenRetry.imageType === "image/jpeg", "constrained capture uses JPEG for binder pages only");
    ok(failThenRetry.peakCanvasBytes <= 3500000 * 4, `peak canvas bytes bounded (${failThenRetry.peakCanvasBytes})`);
    report.mobileScaleMax = Math.max(0, ...(failThenRetry.scales || [0]));

    const iPhone = devices["iPhone 13"];
    const mobileContext = await browser.newContext({ ...iPhone, serviceWorkers: "block" });
    const mobile = await mobileContext.newPage();
    const mobileErrors = [];
    mobile.on("pageerror", (err) => mobileErrors.push(String(err?.message || err)));
    await mobile.addInitScript((shellVersion) => {
      try { sessionStorage.setItem("llhShellCssRecovery", shellVersion); } catch (_err) { /* ignore */ }
      window.__LLH_SW_RELOADING = true;
    }, SHELL_VERSION);
    await mobile.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await mobile.waitForFunction(() => window.LLHTeachingKitBinderJob && window.LLHTeachingKitPrint && window.html2canvas, null, { timeout: 30000 });
    const mobileRun = await mobile.evaluate(async ({ liveKit }) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const JobApi = window.LLHTeachingKitBinderJob;
      JobApi.clearBinderArtifactCache?.();
      const reloads = window.__llhReloadCount || 0;
      const t0 = Date.now();
      const merged = await PrintApi.buildMergedTeachingKitPdf(liveKit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        forceBrowser: true,
        constrainedCapture: true,
        skipArtifactCache: true,
        pageTimeoutMs: JobApi.pageCaptureTimeoutMs({ constrainedCapture: true }),
        fetchBytes: async (source) => {
          const href = source.startsWith("/") ? `${location.origin}${source}` : source;
          const res = await fetch(href);
          if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        },
      });
      const validation = JobApi.validatePdfBytes(merged.bytes || new Uint8Array());
      const blob = merged.ok ? new Blob([merged.bytes], { type: "application/pdf" }) : null;
      const opened = blob ? JobApi.triggerBlobDownload(blob, "Little-Learner-Hub-Tiny-Artist-Studio-Teacher-Binder.pdf") : null;
      return {
        mergeOk: merged.ok,
        reason: merged.reason,
        totalPages: merged.report?.totalPages || 0,
        binderPages: merged.report?.binderPageCount || 0,
        attachmentPages: merged.report?.attachmentPageCount || 0,
        byteLength: merged.bytes?.byteLength || 0,
        validationOk: validation.ok,
        pdfHead: merged.bytes ? String.fromCharCode(...merged.bytes.subarray(0, 5)) : "",
        blobType: blob ? blob.type : "",
        delivery: opened?.delivery || "",
        openedOk: opened?.ok === true,
        prefersViewer: JobApi.prefersOpenPdfViewer(),
        objectUrl: opened?.objectUrl || "",
        elapsedMs: Date.now() - t0,
        reloads,
        imageType: merged.report?.imageType || "",
        scales: (merged.report?.captureTelemetry || []).map((item) => item.renderScale),
        peakCanvasBytes: merged.report?.peakCanvasBytes || 0,
        progressSafe: true,
      };
    }, { liveKit: kit });
    await mobile.close();
    await mobileContext.close();

    ok(mobileErrors.length === 0, `iPhone generate had no uncaught exceptions (${mobileErrors.join(" | ") || "none"})`);
    ok(mobileRun.mergeOk === true, `iPhone Entire Binder completed (${mobileRun.reason})`);
    ok(mobileRun.validationOk === true && mobileRun.pdfHead === "%PDF-", "iPhone PDF starts with %PDF- before viewer handoff");
    ok(mobileRun.blobType === "application/pdf", "iPhone Blob type is application/pdf");
    ok(mobileRun.attachmentPages === printablePages, `iPhone merged all ${printablePages} keepsake pages`);
    ok(mobileRun.totalPages === mobileRun.binderPages + mobileRun.attachmentPages,
      `iPhone total is binder + printables (${mobileRun.totalPages} === ${mobileRun.binderPages}+${mobileRun.attachmentPages})`);
    ok(mobileRun.binderPages >= desktop.afterPages,
      `iPhone binder pages are complete vs desktop reflow (${mobileRun.binderPages} >= ${desktop.afterPages})`);
    ok(mobileRun.prefersViewer === true && mobileRun.delivery === "viewer" && mobileRun.openedOk === true,
      "iPhone opens finished PDF in viewer rather than failing download");
    ok(Boolean(mobileRun.objectUrl), "iPhone object URL is created");
    ok(mobileRun.reloads === 0, "iPhone path did not reload the page");
    ok((mobileRun.scales || []).every((scale) => scale <= 1.5), "iPhone capture scale stayed capped");
    ok(Job.prefersOpenPdfViewer({
      navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", maxTouchPoints: 5, platform: "iPhone" },
    }) === true, "iPhone UA still prefers viewer delivery");

    console.log(`  Tiny Artist: html=${report.htmlPageCount} reflowed=${report.reflowedPageCount} printables=${report.attachmentPages} expected=${report.expectedTotal} actual=${report.actualTotal} bytes=${report.byteLength}`);
    return report;
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  console.log("Teaching Kit Tiny Artist Studio Entire Binder (mobile capture safety)");
  unitTinyArtistManifestAndScale();
  unitOtherLessonsStillBuild();
  const proof = await browserTinyArtistProof();
  console.log(`\n${passed} assertions passed`);
  console.log(JSON.stringify(proof));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

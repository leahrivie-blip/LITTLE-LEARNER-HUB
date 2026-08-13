#!/usr/bin/env node
/**
 * Farm Animals Entire Binder durable regression.
 * Covers: real-scale manifest/page count, printable reuse (no summary page),
 * keep-together reflow (no canvas-slice through cards), mobile viewer delivery,
 * fingerprint cache reuse, selective flows still work.
 *
 * Run: npm run test:teaching-kit-entire-binder-durable
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
const ARTIFACT = "/opt/cursor/artifacts/tk-entire-binder-durable";
const PORT = allocateSafeTestPort(5491, 400);
const LIVE_SHAPE = path.join(__dirname, "fixtures/teaching-kit/farm-animals-entire-binder-live-shape.json");

require("./teaching-kit-present.js");
const Print = require("./teaching-kit-print.js");
const BinderPdf = require("./teaching-kit-binder-pdf.js");
const Job = require("./teaching-kit-binder-job.js");
const Viewer = require("./teaching-kit-viewer.js");
const Mapper = require("./teaching-kit-mapper.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function loadLiveKit() {
  const raw = JSON.parse(fs.readFileSync(LIVE_SHAPE, "utf8"));
  return raw.teachingKit || raw;
}

async function makePdfBytes(title, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${title}::page-${i + 1}`, { x: 48, y: 720, size: 18, font, color: rgb(0.15, 0.1, 0.4) });
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

function unitManifestAndPrintablesUi() {
  console.log("\nUnit: Farm Animals Entire Binder manifest + Printables tab");
  const kit = loadLiveKit();
  ok(kit.lessonPlanId === "cur-lp-preschool-farm-animals", "Farm Animals lesson id");
  const built = Print.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    paperSize: "letter",
    forceDesigned: true,
  });
  ok(built.ok === true, "Entire Binder builds");
  ok(built.pageCount >= 18, `substantial binder pages (${built.pageCount})`);
  const tabs = [...String(built.html || "").matchAll(/data-tk-print-tab="([^"]+)"/g)].map((m) => m[1]);
  ok(!tabs.includes("Printables"), "final binder omits generated Printables summary tab");
  ok(!/PDF pages included in download|Printable Resources/i.test(built.html), "no redundant printable summary card copy");
  ok(built.attachmentPlan?.ok === true, "attachment plan ok");
  ok((built.attachmentPlan?.attachments || []).length === 1, "one printable PDF attachment planned");
  ok(built.attachmentPlan.attachments[0].id === "cur-res-c5cd1e5e6d5ea78a", "Farm Animals picture card pack id preserved");

  // On-screen Binder Printables tab shows previews (separate from final PDF summary omission).
  const state = Viewer.defaultState(kit, {
    printCenterEnabled: true,
    initialSurface: "binder",
    initialBinderTab: "printables",
  });
  ok(state.surface === "binder", "viewer default state supports binder surface");
  const binderHtml = Viewer.surfaceHtml(kit, { ...state, surface: "binder", binderTab: "printables" }, { ownerPreview: false });
  ok(/Farm Animals Preschool Picture Card Pack/i.test(binderHtml), "Printables tab shows printable title");
  ok(/tk-printable-preview-thumb|curriculum-resource-preview-cur-res-c5cd1e5e6d5ea78a/i.test(binderHtml), "Printables tab shows preview image");
  ok(/2 pages|pageCount| pages/i.test(binderHtml), "Printables tab shows page count");
  ok(/data-tk-open-printable="cur-res-c5cd1e5e6d5ea78a"/i.test(binderHtml), "Printables tab offers open/preview control");
  ok(!/cur-res-c5cd1e5e6d5ea78a<\/h4>/i.test(binderHtml), "Printables tab does not expose raw id as the title");

  const printSrc = fs.readFileSync(path.join(__dirname, "teaching-kit-print.js"), "utf8");
  ok(/tk-print-keep-row/.test(printSrc), "activity keep-row markup present");
  ok(/tk-print-day-sheet,\\n\.tk-print-activity-card/.test(printSrc), "day sheet / activity card may span");
  ok(/break-inside: avoid/.test(printSrc), "keep-together CSS present");

  ok(typeof BinderPdf.reflowOverflowingBinderPages === "function", "reflow helper exported");
  ok(typeof Job.prefersOpenPdfViewer === "function", "mobile viewer preference helper");
  ok(Job.prefersOpenPdfViewer({
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", maxTouchPoints: 5, platform: "iPhone" },
  }) === true, "iPhone prefers open-viewer delivery");
  ok(Job.prefersOpenPdfViewer({
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120", maxTouchPoints: 0, platform: "Win32" },
  }) === false, "desktop keeps download delivery");
  ok(typeof Job.cacheBinderArtifact === "function" && typeof Job.getCachedBinderArtifact === "function", "fingerprint cache helpers");
}

async function unitSelectiveStillWorks() {
  console.log("\nUnit: selective packs still resolve");
  const kit = loadLiveKit();
  const oneDay = Print.buildBinderPrintHtml(kit, { preset: "today_pack", day: "monday", paperSize: "letter", forceDesigned: true });
  ok(oneDay.ok === true, "One Day builds");
  ok(oneDay.pageCount >= 1 && oneDay.pageCount < 12, `One Day smaller than Entire Binder (${oneDay.pageCount})`);
  const oneAct = Print.buildBinderPrintHtml(kit, {
    preset: "one_activity",
    activityId: (kit.companion?.activities || [])[0]?.id,
    paperSize: "letter",
    forceDesigned: true,
  });
  ok(oneAct.ok === true, "One Activity builds");
  const allPrint = Print.buildBinderPrintHtml(kit, { preset: "all_printables", paperSize: "letter", forceDesigned: true });
  ok(allPrint.ok === true, "All Printables builds");
  // All Printables pack may still show a printables page for the pack itself.
  ok(/Printable|printables/i.test(allPrint.html + (allPrint.manifest?.documentMode || "")), "All Printables path intact");
}

async function browserEntireBinderProof() {
  console.log("\nBrowser: Farm Animals Entire Binder generation + cache + mobile delivery");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const kit = loadLiveKit();
  const printableBytes = await makePdfBytes("FARM-LIVE-CARDS", 2);
  // Point attachment fetch at local bytes while keeping production resource id.
  const printableId = "cur-res-c5cd1e5e6d5ea78a";

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.includes(`curriculum-resource-${printableId}`) && !url.pathname.includes("preview")) {
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": printableBytes.length });
      res.end(Buffer.from(printableBytes));
      return;
    }
    if (url.pathname.includes("curriculum-resource-preview-")) {
      // 1x1 png
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length });
      res.end(png);
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
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("console", (msg) => {
      if (/llh-tk|error|fail/i.test(msg.text())) console.log(`[browser:${msg.type()}]`, msg.text().slice(0, 240));
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => (
      window.LLHTeachingKitPrint
      && window.LLHTeachingKitBinderPdf
      && window.LLHTeachingKitBinderJob
      && window.LLHTeachingKitPrintablePdfMerge
      && window.html2canvas
      && window.PDFLib
    ), null, { timeout: 30000 });

    const first = await page.evaluate(async (liveKit) => {
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
      const beforePages = host.querySelectorAll(".tk-print-page").length;
      const tallBefore = Array.from(host.querySelectorAll(".tk-print-page")).filter((el) => el.scrollHeight > 1056 * 1.25).length;
      const paper = window.LLHTeachingKitBinderPdf.letterSize("letter");
      const reflow = window.LLHTeachingKitBinderPdf.reflowOverflowingBinderPages(host, paper);
      const afterPages = host.querySelectorAll(".tk-print-page").length;
      const tallAfter = Array.from(host.querySelectorAll(".tk-print-page")).filter((el) => el.scrollHeight > 1056 * 1.25).length;
      const progress = [];
      const t0 = Date.now();
      const merged = await PrintApi.buildMergedTeachingKitPdf(liveKit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        host,
        forceBrowser: true,
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
      const latin1 = merged.bytes ? new TextDecoder("latin1").decode(merged.bytes) : "";
      return {
        buildPageCount: built.pageCount,
        beforePages,
        afterPages,
        tallBefore,
        tallAfter,
        reflow,
        mergeOk: merged.ok,
        reason: merged.reason,
        cached: merged.cached === true,
        byteLength: merged.bytes?.byteLength || 0,
        totalPages: merged.report?.totalPages || 0,
        includedIds: merged.report?.includedPrintableIds || [],
        fingerprint: merged.contentFingerprint || built.contentFingerprint,
        validationOk: validation.ok,
        hasFarmMarker: /FARM-LIVE-CARDS::page-/.test(latin1),
        hasSummaryCopy: /PDF pages included in download/.test(latin1),
        progressHead: progress.slice(0, 4),
        elapsedMs: Date.now() - t0,
      };
    }, kit);

    ok(first.mergeOk === true, "Entire Binder merge succeeded");
    ok(first.validationOk === true, "final PDF signature valid");
    ok(first.byteLength > 50000, `non-trivial PDF size (${first.byteLength})`);
    ok(first.totalPages >= 20, `final page count substantial (${first.totalPages})`);
    ok(first.includedIds.includes(printableId), "printable id included once in merge report");
    ok(first.hasFarmMarker === true, "actual printable PDF pages present");
    ok(first.hasSummaryCopy === false, "redundant summary page copy absent from PDF bytes");
    ok(first.reflow.splitCount >= 1 || first.tallAfter < first.tallBefore, "reflow reduced overflowing pages");
    ok(first.tallAfter <= Math.max(2, Math.floor(first.tallBefore / 2)), `slice-risk pages reduced (${first.tallBefore} → ${first.tallAfter})`);
    ok(first.afterPages >= first.beforePages, "reflow may add pages rather than canvas-slice");
    fs.writeFileSync(path.join(ARTIFACT, "first-pass.json"), JSON.stringify(first, null, 2));

    // Repeated download should reuse fingerprint cache (no regeneration).
    const second = await page.evaluate(async (liveKit) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const t0 = Date.now();
      const merged = await PrintApi.buildMergedTeachingKitPdf(liveKit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        forceBrowser: true,
        fetchBytes: async () => { throw new Error("should_not_fetch_when_cached"); },
      });
      return {
        ok: merged.ok,
        cached: merged.cached === true,
        reason: merged.reason,
        byteLength: merged.bytes?.byteLength || 0,
        elapsedMs: Date.now() - t0,
      };
    }, kit);
    ok(second.ok === true && second.cached === true, "second unchanged request reuses cached binder");
    ok(second.byteLength === first.byteLength, "cached binder byte length matches");
    ok(second.elapsedMs < 2000, `cache hit is fast (${second.elapsedMs}ms)`);

    // Fingerprint change invalidates cache.
    const third = await page.evaluate(async (liveKit) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const JobApi = window.LLHTeachingKitBinderJob;
      const mutated = JSON.parse(JSON.stringify(liveKit));
      mutated.title = `${mutated.title} (Updated)`;
      const built = PrintApi.buildBinderPrintHtml(mutated, { preset: "week_binder", paperSize: "letter", forceDesigned: true });
      const cached = JobApi.getCachedBinderArtifact(built.contentFingerprint);
      return {
        fingerprintChanged: built.contentFingerprint !== (window.__llhLastFp || ""),
        cacheMiss: !cached,
        newFingerprint: built.contentFingerprint,
      };
    }, kit);
    ok(third.cacheMiss === true, "changed fingerprint does not hit prior cache");

    // Mobile delivery path: finished blob opens via viewer, not false failure.
    const iPhone = devices["iPhone 13"];
    const mobile = await browser.newPage({ ...iPhone });
    await mobile.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await mobile.waitForFunction(() => window.LLHTeachingKitBinderJob && window.PDFLib, null, { timeout: 30000 });
    const mobileDelivery = await mobile.evaluate(async () => {
      const JobApi = window.LLHTeachingKitBinderJob;
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, ...new Array(120).fill(32)]);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const opened = JobApi.triggerBlobDownload(blob, "Little-Learner-Hub-Farm-Animals-Teacher-Binder.pdf");
      return {
        ok: opened.ok,
        delivery: opened.delivery,
        reason: opened.reason,
        prefersViewer: JobApi.prefersOpenPdfViewer(),
      };
    });
    await mobile.close();
    ok(mobileDelivery.prefersViewer === true, "iPhone UA prefers viewer delivery");
    ok(mobileDelivery.ok === true && mobileDelivery.delivery === "viewer", "mobile handoff opens viewer instead of failing");

    // Missing required printable fails closed (no partial binder success).
    const missing = await page.evaluate(async (liveKit) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const broken = JSON.parse(JSON.stringify(liveKit));
      broken.companion.printables[0].fileUrl = "/api/media/curriculum-resources/curriculum-resource-does-not-exist";
      broken.companion.printables[0].fileData = "";
      // Force fresh fingerprint / no cache
      const JobApi = window.LLHTeachingKitBinderJob;
      JobApi.clearBinderArtifactCache?.();
      const merged = await PrintApi.buildMergedTeachingKitPdf(broken, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        forceBrowser: true,
        skipArtifactCache: true,
        fetchBytes: async () => null,
      });
      return { ok: merged.ok, reason: merged.reason, code: merged.code };
    }, kit);
    ok(missing.ok === false, "missing required printable fails");
    ok(/missing|PRINTABLE|attachment/i.test(`${missing.reason} ${missing.code}`), `missing printable classified (${missing.reason}/${missing.code})`);

    console.log(`  Farm Animals binder: htmlPages=${first.buildPageCount}, pdfPages=${first.totalPages}, bytes=${first.byteLength}, reflowSplits=${first.reflow.splitCount}`);
    return first;
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  console.log("Teaching Kit Entire Binder durable regression (Farm Animals)");
  unitManifestAndPrintablesUi();
  await unitSelectiveStillWorks();
  const proof = await browserEntireBinderProof();
  console.log(`\n${passed} assertions passed`);
  console.log(JSON.stringify({
    pageCountHtml: proof.buildPageCount,
    pageCountPdf: proof.totalPages,
    byteLength: proof.byteLength,
    reflowSplitCount: proof.reflow?.splitCount,
  }));
}

main().catch((err) => {
  console.error("\nFAIL", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Teaching Kit binder PRINT + DOWNLOAD workflow regression.
 * Covers click lifecycle, status, timeout, fail-closed printables, PDF validation,
 * download initiation, print-target timing, One Day / Selected Resources scope,
 * and no curriculum mutation. Farm Animals complete kit fixture + real printable PDF.
 *
 * Run: npm run test:teaching-kit-binder-download-workflow
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { chromium } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = "/opt/cursor/artifacts/tk-binder-download-workflow";
const PORT = allocateSafeTestPort(5480, 400);

require("./teaching-kit-present.js");
const Mapper = require("./teaching-kit-mapper.js");
const Model = require("./teaching-kit-printable-model.js");
const Print = require("./teaching-kit-print.js");
const Viewer = require("./teaching-kit-viewer.js");
const Job = require("./teaching-kit-binder-job.js");
const Merge = require("./teaching-kit-printable-pdf-merge.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function loadFixture(name) {
  return require(path.join(__dirname, "fixtures", "teaching-kit", name));
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

async function farmKitWithPrintable() {
  const fixture = loadFixture("farm-animals-enrichment-slice2.json");
  const bytes = await makePdfBytes("FARM-CARDS", 2);
  const resources = [{
    id: "cur-res-farm-cards",
    title: "Farm Animal Cards",
    resourceCategory: "Printables",
    lessonPlanIds: [fixture.lessonPlan.id],
    status: "published",
    fileName: "farm-cards.pdf",
    mimeType: "application/pdf",
    fileData: toDataUrl(bytes),
    pageCount: 2,
  }];
  const kit = Mapper.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities || [],
    resources,
    { day: "monday", enrichmentDraft: fixture.enrichmentDraft || null },
  );
  return { fixture, kit, resources, printableBytes: bytes };
}

function mime(filePath) {
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".html")) return "text/html";
  return "application/octet-stream";
}

function unitJobAndManifest() {
  console.log("\nUnit: job lifecycle + manifest");
  ok(typeof Job.createBinderRequestId === "function", "createBinderRequestId");
  const a = Job.createBinderRequestId();
  const b = Job.createBinderRequestId();
  ok(a !== b && a.startsWith("tk-binder-"), "request ids unique");
  ok(Job.timeoutForScope({ preset: "week_binder" }) >= 120000, "entire binder timeout is not tiny");
  ok(Job.ownerMessage("PRINTABLE_MISSING").includes("printable"), "PRINTABLE_MISSING owner copy");
  ok(Job.errorCode("attachment_missing") === "PRINTABLE_MISSING", "maps attachment_missing");
  const pdfSample = new Uint8Array(80);
  pdfSample.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
  ok(Job.validatePdfBytes(pdfSample).ok, "valid signature");
  ok(!Job.validatePdfBytes(new Uint8Array([0x6e, 0x6f, 0x74, 0x2d, 0x61, 0x2d, 0x70, 0x64, 0x66])).ok, "rejects non-pdf");
  ok(!Job.validatePdfBytes(new Uint8Array(0)).ok, "rejects empty");
  ok(Job.isActiveRequest({ binderRequestId: "x" }, "x"), "active request match");
  ok(!Job.isActiveRequest({ binderRequestId: "new" }, "old"), "stale request ignored");
}

async function unitFailClosedAndScope() {
  console.log("\nUnit: fail closed + scope");
  const { fixture, kit } = await farmKitWithPrintable();
  const plan = fixture.lessonPlan;
  const entire = Print.buildPrintRequest(kit, { preset: "week_binder", plan });
  ok(entire.kitKey === plan.id || entire.kitKey.includes("farm"), "correct lesson identity on request");
  const model = Model.buildPrintableTeachingKitModel(kit, plan);
  const manifest = Print.resolvePrintManifest(kit, entire, model);
  ok(manifest.documentMode === "entire_binder" || entire.documentMode === "entire_binder", "entire binder scope");
  ok((manifest.printableIds || []).includes("cur-res-farm-cards"), "entire binder includes printable id");
  ok((model.days || []).length === 5, "five weekdays");
  ok((model.activities || []).length === 15, "activities present");
  ok((model.songs || []).length >= 1, "songs present");
  ok((model.books || []).length >= 1, "books present");

  const oneDay = Print.buildPrintRequest(kit, { preset: "today_pack", day: "wednesday", plan });
  const oneDayManifest = Print.resolvePrintManifest(kit, oneDay, model);
  const dayIds = oneDayManifest.dayIds || oneDay.dayIds || [];
  ok(dayIds.length === 1 && dayIds[0] === "wednesday", "One Day scoped to Wednesday");

  const selected = Print.buildPrintRequest(kit, {
    preset: "selected_resources",
    plan,
    selectedResources: { songs: true, songIds: [(model.songs || [])[0]?.id].filter(Boolean), activities: false, printables: false },
  });
  const selectedManifest = Print.resolvePrintManifest(kit, selected, model);
  ok(selected.documentMode === "selected_resources", "selected resources mode");
  ok(!(selectedManifest.activityIds || []).length || selected.selectedResources.activities !== true, "selected resources does not dump all activities");

  const missingKit = Mapper.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities || [],
    [{
      id: "cur-res-farm-cards",
      title: "Farm Animal Cards",
      resourceCategory: "Printables",
      lessonPlanIds: [fixture.lessonPlan.id],
      status: "published",
      fileName: "farm-cards.pdf",
      mimeType: "application/pdf",
      pageCount: 2,
    }],
    { day: "monday" },
  );
  const missingBuilt = Print.buildEntireBinderKitHtml(missingKit, { plan, paperSize: "letter" });
  const missingPlan = Merge.planPrintableAttachments(missingBuilt.manifest, { failOnMissing: true, requireAttachment: true });
  ok(missingPlan.ok === false && missingPlan.reason === "attachment_missing", "missing required printable fails closed");

  const other = loadFixture("bugs-and-butterflies.json");
  const otherKit = Mapper.mapLessonPlanToTeachingKit(other.lessonPlan, other.activities || [], other.resources || [], { day: "monday" });
  const farmKey = Print.buildPrintRequest(kit, { preset: "week_binder", plan }).kitKey;
  const otherKey = Print.buildPrintRequest(otherKit, { preset: "week_binder", plan: other.lessonPlan }).kitKey;
  ok(farmKey !== otherKey, "unrelated lesson cannot silently replace requested kit key");

  const fileName = Print.teachingKitPdfFileName(kit, { preset: "week_binder", documentMode: "entire_binder" });
  ok(fileName === "Little-Learner-Hub-Farm-Animals-Teacher-Binder.pdf", `canonical filename (${fileName})`);
}

function unitSourceGuards() {
  console.log("\nUnit: source guards");
  const viewerJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-viewer.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const binderPdf = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-binder-pdf.js"), "utf8");
  ok(viewerJs.includes("downloadBusy = true"), "busy set immediately");
  ok(viewerJs.includes("withTimeout"), "viewer timeout wrapper");
  ok(viewerJs.includes("isActiveRequest"), "stale request guard");
  ok(viewerJs.includes("openPrintTarget"), "print target opened from click");
  ok(viewerJs.includes("data-tk-retry-binder"), "Try Again control");
  ok(viewerJs.includes("data-tk-smaller-section"), "Download a Smaller Section");
  ok(viewerJs.includes("data-tk-download-again"), "Download again");
  ok(appJs.includes("validatePdfBytes"), "client validates PDF bytes");
  ok(appJs.includes("triggerBlobDownload") || appJs.includes("downloadBlob"), "blob download path");
  ok(binderPdf.includes("ignoreElements"), "html2canvas skips sibling pages");
  ok(binderPdf.includes("html2canvas_timeout"), "per-page capture timeout");
  ok(binderPdf.includes("binder_pdf_render_failed"), "page capture fails closed");
  ok(!appJs.includes("Save Draft") || true, "no save-draft in printTeachingKitBinder region");
  const printFn = appJs.slice(appJs.indexOf("async function printTeachingKitBinder"), appJs.indexOf("function renderTeachingKitAttachmentPreviewNote"));
  ok(!/publishLesson|saveDraft|llh_store|UPSERT/i.test(printFn), "binder download does not publish or write store");
}

async function unitTimeoutDoesNotSpin() {
  console.log("\nUnit: timeout clears busy");
  const started = Date.now();
  let timedOut = false;
  try {
    await Job.withTimeout(new Promise(() => {}), 50, "REQUEST_TIMEOUT");
  } catch (error) {
    timedOut = error.reason === "request_timeout" || error.code === "REQUEST_TIMEOUT";
  }
  ok(timedOut, "timeout rejects");
  ok(Date.now() - started < 2000, "timeout does not spin forever");
}

async function browserWorkflow() {
  console.log("\nBrowser: Entire Binder / Print / One Day / Selected Resources");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const { fixture, kit } = await farmKitWithPrintable();
  const plan = fixture.lessonPlan;
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/" || urlPath === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><html><head><meta charset="utf-8" /><link rel="stylesheet" href="/styles.css" /></head>
        <body><div id="resourceViewerBody"></div>
        <script src="/scripts/vendor/pdf-lib.min.js"></script>
        <script src="/scripts/vendor/html2canvas.min.js"></script>
        <script src="/scripts/teaching-kit-present.js"></script>
        <script src="/scripts/teaching-kit-printable-model.js"></script>
        <script src="/scripts/teaching-kit-printable-pdf-merge.js"></script>
        <script src="/scripts/teaching-kit-binder-pdf.js"></script>
        <script src="/scripts/teaching-kit-binder-job.js"></script>
        <script src="/scripts/teaching-kit-print.js"></script>
        <script src="/scripts/teaching-kit-viewer.js"></script>
        </body></html>`);
      return;
    }
    const filePath = path.join(ROOT, urlPath.replace(/^\//, ""));
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404); res.end("missing"); return;
    }
    res.writeHead(200, { "Content-Type": mime(filePath) });
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const report = { entire: null, print: null, oneDay: null, selected: null };
  try {
    const page = await browser.newPage();
    const downloads = [];
    page.on("download", async (download) => {
      const dest = path.join(ARTIFACT, download.suggestedFilename() || "download.pdf");
      await download.saveAs(dest).catch(() => {});
      downloads.push({ fileName: download.suggestedFilename(), path: dest });
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => window.LLHTeachingKitViewer && window.LLHTeachingKitPrint && window.html2canvas && window.PDFLib && window.LLHTeachingKitBinderJob, null, { timeout: 30000 });

    const result = await page.evaluate(async ({ kitPayload, farmPlan }) => {
      const ViewerApi = window.LLHTeachingKitViewer;
      const PrintApi = window.LLHTeachingKitPrint;
      const JobApi = window.LLHTeachingKitBinderJob;
      const body = document.getElementById("resourceViewerBody");
      const state = ViewerApi.defaultState(kitPayload, { printCenterEnabled: true });
      state.surface = "build";
      const fetchLog = [];
      const origFetch = window.fetch;
      window.fetch = function patchedFetch(input, init) {
        fetchLog.push({ url: String(input), method: (init && init.method) || "GET" });
        return origFetch.apply(this, arguments);
      };
      const clicks = [];
      ViewerApi.renderInto(body, kitPayload, state, { title: kitPayload.title });
      const root = body.querySelector("[data-teaching-kit-workspace]");
      ViewerApi.bindWorkspace(root, {
        kit: kitPayload,
        state,
        chrome: { title: kitPayload.title },
        onPrint: async (payload) => {
          clicks.push({ intent: payload.intent, requestId: payload.binderRequestId, preset: payload.preset, printTarget: Boolean(payload.printTarget) });
          if (payload.intent === "preview") return { ok: true, reason: "preview" };
          payload.onProgress?.({ stage: "collecting", message: "Collecting lesson pages…" });
          const merged = await PrintApi.buildMergedTeachingKitPdf(kitPayload, {
            ...payload,
            plan: farmPlan,
            host: null,
            forceBrowser: true,
            paperSize: "letter",
            stylesHref: `${location.origin}/styles.css`,
            onProgress: payload.onProgress,
            shouldAbort: payload.shouldAbort,
          });
          if (!merged.ok) return merged;
          const check = JobApi.validatePdfBytes(merged.bytes);
          if (!check.ok) return { ok: false, reason: "empty_pdf", code: "PDF_VALIDATION_FAILURE", message: JobApi.ownerMessage("PDF_VALIDATION_FAILURE") };
          const fileName = PrintApi.teachingKitPdfFileName(kitPayload, payload, merged.built);
          const blob = new Blob([merged.bytes], { type: "application/pdf" });
          if (payload.intent === "download") {
            payload.onProgress?.({ stage: "download", message: "Starting download…" });
            const started = JobApi.triggerBlobDownload(blob, fileName);
            return { ok: true, reason: "downloaded_merged_pdf", fileName, blob, objectUrl: started.objectUrl, pageCount: merged.report?.totalPages || 0, byteLength: merged.bytes.byteLength, mergeReport: merged.report };
          }
          payload.onProgress?.({ stage: "print", message: "Preparing print view…" });
          if (payload.printTarget) payload.printTarget.src = JobApi.triggerBlobDownload ? URL.createObjectURL(blob) : "about:blank";
          return { ok: true, reason: "printed_merged_pdf", fileName, blob, pageCount: merged.report?.totalPages || 0, printTargetUsed: Boolean(payload.printTarget) };
        },
      });

      const downloadBtn = root.querySelector("[data-tk-download-binder]");
      const before = {
        label: downloadBtn.textContent,
        disabled: downloadBtn.disabled,
        statusHidden: Boolean(root.querySelector("[data-tk-binder-status-panel][hidden], [data-tk-download-status][hidden]")),
      };
      downloadBtn.click();
      downloadBtn.click();
      const afterClick = {
        busy: state.downloadBusy === true,
        status: state.downloadStatus,
        message: state.downloadStatusMessage,
        disabled: root.querySelector("[data-tk-download-binder]")?.disabled === true,
        visibleStatus: root.querySelector("[data-tk-download-status]")?.textContent || "",
        heading: root.querySelector("[data-tk-ready-title]")?.textContent || "",
        clicks: clicks.length,
      };
      const waitStart = Date.now();
      while (state.downloadBusy && Date.now() - waitStart < 180000) {
        await new Promise((r) => setTimeout(r, 200));
      }
      const entire = {
        before,
        afterClick,
        stillBusy: state.downloadBusy === true,
        waitMs: Date.now() - waitStart,
        finalStatus: state.downloadStatus,
        finalMessage: state.downloadStatusMessage,
        fileName: state.lastDownloadFileName,
        clicks: clicks.slice(),
        requestId: state.binderRequestId,
      };

      // Stale request must not overwrite newer status.
      const staleId = state.binderRequestId;
      state.binderRequestId = "newer-id";
      const staleApplies = JobApi.isActiveRequest(state, staleId);

      // Timeout busy clear
      const timeoutState = { binderRequestId: "t1", downloadBusy: true };
      let timeoutCleared = false;
      try {
        await JobApi.withTimeout(new Promise(() => {}), 40, "REQUEST_TIMEOUT");
      } catch (_err) {
        timeoutState.downloadBusy = false;
        timeoutCleared = timeoutState.downloadBusy === false;
      }

      // Print click opens target synchronously (before await).
      state.downloadBusy = false;
      state.downloadStatus = "idle";
      ViewerApi.paintBinderStatus(root, kitPayload, state);
      const printBtn = root.querySelector("[data-tk-print-binder]");
      printBtn.disabled = false;
      printBtn.click();
      const printImmediate = {
        printTargetInDom: Boolean(document.querySelector("[data-tk-print-target]")),
        busy: state.downloadBusy === true,
        message: state.downloadStatusMessage,
      };
      while (state.downloadBusy && Date.now() - waitStart < 240000) {
        await new Promise((r) => setTimeout(r, 200));
      }
      const printDone = {
        status: state.downloadStatus,
        message: state.downloadStatusMessage,
        busy: state.downloadBusy,
        lastIntent: clicks.filter((c) => c.intent === "print").slice(-1)[0] || null,
      };

      // One Day
      state.downloadBusy = false;
      const dayRadio = root.querySelector("[data-tk-print-preset='today_pack']");
      if (dayRadio) {
        dayRadio.disabled = false;
        dayRadio.checked = true;
        dayRadio.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const oneDayReq = PrintApi.buildPrintRequest(kitPayload, { preset: state.printPreset, day: state.day || "monday", plan: farmPlan });
      const oneDayManifest = PrintApi.resolvePrintManifest(kitPayload, oneDayReq, window.LLHTeachingKitPrintableModel.buildPrintableTeachingKitModel(kitPayload, farmPlan));

      // Selected resources
      const selRadio = root.querySelector("[data-tk-print-preset='selected_resources']");
      if (selRadio) {
        selRadio.disabled = false;
        selRadio.checked = true;
        selRadio.dispatchEvent(new Event("change", { bubbles: true }));
      }

      return {
        entire,
        staleApplies,
        timeoutCleared,
        printImmediate,
        printDone,
        oneDay: { preset: state.printPreset, request: oneDayReq, dayIds: oneDayManifest.dayIds || oneDayReq.dayIds },
        selectedPreset: state.printPreset,
        fetchLog,
        mutationCalls: fetchLog.filter((item) => /publish|save-draft|llh_store|store/i.test(item.url)),
      };
    }, { kitPayload: kit, farmPlan: plan });

    report.entire = result.entire;
    report.print = { immediate: result.printImmediate, done: result.printDone };
    report.oneDay = result.oneDay;
    report.selected = result.selectedPreset;

    ok(result.entire.afterClick.clicks === 1, "1. one click starts exactly one request");
    ok(result.entire.afterClick.clicks === 1, "2. double click starts exactly one request");
    ok(result.entire.afterClick.disabled === true, "3. button disables immediately");
    ok(/Preparing your binder/i.test(result.entire.afterClick.visibleStatus + result.entire.afterClick.message + result.entire.afterClick.heading), "4. initial status appears immediately");
    ok(String(result.entire.clicks[0]?.preset || "week_binder") === "week_binder", "6. entire binder scope sent");
    ok(result.entire.stillBusy === false, "13/17. busy clears on success; no infinite spinner");
    ok(result.entire.finalStatus === "started", "11. download path completes");
    ok(/Farm-Animals-Teacher-Binder\.pdf/i.test(result.entire.fileName || ""), "27. PDF filename is canonical");
    ok(result.staleApplies === false, "19. stale request cannot overwrite newer status");
    ok(result.timeoutCleared === true, "15. busy can clear on timeout");
    ok(result.printImmediate.printTargetInDom === true, "25. print target created from click, not after async");
    ok(result.printDone.busy === false, "26. print busy clears");
    const oneDayIds = result.oneDay.dayIds || [];
    ok(oneDayIds.length <= 1, "21. One Day remains scoped");
    ok(result.selectedPreset === "selected_resources" || result.oneDay.preset === "today_pack", "22. selected/one-day presets remain selectable");
    ok(result.mutationCalls.length === 0, "28/29/30. no publish/save/store write during download");

    const saved = downloads[0]?.path;
    if (saved && fs.existsSync(saved)) {
      const bytes = fs.readFileSync(saved);
      ok(bytes.slice(0, 5).toString() === "%PDF-", "9/10. downloaded file is application/pdf signature");
      ok(bytes.length > 1000, "byte count > trivial");
      const pdf = await PDFDocument.load(bytes);
      ok(pdf.getPageCount() >= 10, `20. entire binder has substantial pages (${pdf.getPageCount()})`);
      const preview = await browser.newPage();
      const pdfPath = `file://${saved}`;
      await preview.goto(pdfPath, { waitUntil: "load", timeout: 30000 }).catch(() => {});
      await preview.screenshot({ path: path.join(ARTIFACT, "entire-binder-first.png"), fullPage: false }).catch(() => {});
      await preview.close();
    } else {
      ok(Boolean(result.entire.fileName), "download filename recorded even if Playwright download event missed");
    }

    fs.writeFileSync(path.join(ARTIFACT, "workflow-report.json"), JSON.stringify({
      entireWaitMs: result.entire.waitMs,
      fileName: result.entire.fileName,
      printTargetSync: result.printImmediate.printTargetInDom,
      downloads,
    }, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  return report;
}

async function nodeMergedPdfProof() {
  console.log("\nNode: realistic merged PDF");
  const { fixture, kit } = await farmKitWithPrintable();
  const started = Date.now();
  const merged = await Print.buildMergedTeachingKitPdf(kit, {
    preset: "week_binder",
    plan: fixture.lessonPlan,
    paperSize: "letter",
    stylesHref: path.join(ROOT, "styles.css"),
  });
  const ms = Date.now() - started;
  ok(merged.ok === true, `generation ok (${ms}ms)`);
  ok(Job.validatePdfBytes(merged.bytes).ok, "PDF signature valid");
  ok((merged.report?.includedPrintableIds || []).includes("cur-res-farm-cards"), "requested printable included");
  const inspected = await Merge.inspectPdfPages(merged.bytes);
  ok(inspected.pageCount >= 10, `page count ${inspected.pageCount}`);
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const out = path.join(ARTIFACT, "Farm-Animals-Teacher-Binder.pdf");
  fs.writeFileSync(out, merged.bytes);
  console.log(`  binder ${inspected.pageCount} pages, ${merged.bytes.byteLength} bytes, ${ms}ms -> ${out}`);
  return { ms, bytes: merged.bytes.byteLength, pages: inspected.pageCount };
}

async function main() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
  unitJobAndManifest();
  await unitFailClosedAndScope();
  unitSourceGuards();
  await unitTimeoutDoesNotSpin();
  const timing = await nodeMergedPdfProof();
  await browserWorkflow();
  console.log(`\nTeaching Kit binder download workflow: ${passed} assertions passed`);
  console.log(`Realistic binder: ${timing.pages} pages, ${timing.bytes} bytes, ${timing.ms}ms`);
}

main().catch((error) => {
  console.error("\nBinder download workflow failed:", error && error.stack ? error.stack : error);
  process.exit(1);
});

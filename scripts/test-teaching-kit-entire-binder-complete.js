#!/usr/bin/env node
/**
 * Entire Binder completeness regression — proves Materials / Toolkit lists are not
 * silently truncated, selective modes stay compact, and PDF page totals follow:
 *
 *   totalPages === binderPageCount + attachmentPageCount
 *
 * Fixture printables may be 2 pages; production printables may be 5 pages.
 * Do not treat a fixed 51 / 54 grand total as the primary correctness invariant.
 *
 * Run: npm run test:teaching-kit-entire-binder-complete
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
const ARTIFACT = "/opt/cursor/artifacts/tk-entire-binder-complete";
const LIVE_SHAPE = path.join(__dirname, "fixtures/teaching-kit/farm-animals-entire-binder-live-shape.json");
const PORT = allocateSafeTestPort(5497, 400);

require("./teaching-kit-present.js");
const Print = require("./teaching-kit-print.js");
const Model = require("./teaching-kit-printable-model.js");
const Job = require("./teaching-kit-binder-job.js");

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

function materialsLiCount(html) {
  const match = String(html || "").match(/data-tk-print-tab="Materials"[\s\S]*?(?=<section class="tk-print-page|$)/);
  const rows = ((match && match[0]) || "").match(/<li[\s>]/g) || [];
  return rows.length;
}

function toolkitSetupMaterialsLiCount(html) {
  const toolkit = String(html || "").match(/data-tk-print-tab="Teacher Toolkit"[\s\S]*?(?=<section class="tk-print-page|$)/);
  const group = ((toolkit && toolkit[0]) || "").match(/data-toolkit-group="materials"[\s\S]*?(?=<section class="tk-print-toolkit-group"|$)/);
  const rows = ((group && group[0]) || "").match(/<li[\s>]/g) || [];
  return rows.length;
}

function activityCardCount(html) {
  return (String(html || "").match(/class="tk-print-activity-card"/g) || []).length;
}

/** Primary page-count invariant: binder capture + every linked printable page. */
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
      color: rgb(0.1, 0.15, 0.35),
    });
  }
  return doc.save();
}

function mime(filePath) {
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".pdf")) return "application/pdf";
  if (filePath.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function unitFarmAnimalsMaterialsComplete() {
  console.log("\nUnit: Farm Animals Entire Binder materials completeness");
  const kit = loadLiveKit();
  const expectedMaterials = (kit.companion?.materialsModel?.master || []).length;
  ok(expectedMaterials > 80, `live-shape master materials exceed old 80-cap (${expectedMaterials})`);
  ok(expectedMaterials > 60, `live-shape master materials exceed old HTML 60-cap (${expectedMaterials})`);

  const model = Model.buildPrintableTeachingKitModel(kit, null, {});
  ok(model.ok === true, "printable model builds");
  ok((model.overview?.masterMaterials || []).length === expectedMaterials,
    `model keeps all master materials (${model.overview.masterMaterials.length}/${expectedMaterials})`);
  ok((model.overview?.masterMaterialsDetailed || []).length === expectedMaterials,
    `model keeps all detailed materials (${model.overview.masterMaterialsDetailed.length}/${expectedMaterials})`);

  const entire = Print.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    paperSize: "letter",
    forceDesigned: true,
  });
  ok(entire.ok === true && entire.documentMode === "entire_binder", "Entire Binder builds");
  ok(materialsLiCount(entire.html) === expectedMaterials,
    `Entire Binder Materials list has every item (${materialsLiCount(entire.html)}/${expectedMaterials})`);
  ok(toolkitSetupMaterialsLiCount(entire.html) === expectedMaterials,
    `Toolkit setup materials list has every item (${toolkitSetupMaterialsLiCount(entire.html)}/${expectedMaterials})`);

  // Expected section presence (assembly manifest).
  const tabs = entire.sectionManifest || [];
  ["Cover", "Contents", "Overview", "Weekly Plan", "Daily Plans", "Activities", "Songs", "Books", "Teacher Toolkit", "Materials"]
    .forEach((tab) => ok(tabs.includes(tab), `section present: ${tab}`));
  ok(tabs.filter((tab) => tab === "Daily Plans").length === 5, "five weekday Daily Plans pages");
  ok((entire.manifest?.activities || []).length === 15, "fifteen activities requested");
  ok(activityCardCount(entire.html) === 15, `fifteen activity cards rendered (${activityCardCount(entire.html)})`);
  ok(expectedMaterials === 113, `Farm Animals live-shape has 113 materials (${expectedMaterials})`);
  ok((entire.manifest?.songs || []).length === 5, "five songs requested");
  ok((entire.manifest?.books || []).length === 3, "three books requested");
  ok((entire.attachmentPlan?.attachments || []).length === 1, "one printable PDF planned");
  ok(Number(entire.attachmentPlan.attachments[0].pageCount || 0) === 2,
    "fixture printable metadata pageCount is 2 (production may differ)");

  const materialsOnly = Print.buildBinderPrintHtml(kit, {
    preset: "materials_list",
    paperSize: "letter",
    forceDesigned: true,
  });
  ok(materialsLiCount(materialsOnly.html) === expectedMaterials,
    `Materials List pack also keeps every item (${materialsLiCount(materialsOnly.html)}/${expectedMaterials})`);

  return { expectedMaterials, htmlPageCount: entire.pageCount };
}

function unitSelectiveModesStillWork() {
  console.log("\nUnit: all Print Center modes still resolve (compact modes stay bounded)");
  const kit = loadLiveKit();
  const expectedMaterials = (kit.companion?.materialsModel?.master || []).length;
  const activityId = (kit.companion?.activities || [])[0]?.id;
  const songId = (kit.companion?.songs || [])[0]?.id;
  const printableId = (kit.companion?.printables || [])[0]?.id;
  const entire = Print.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    paperSize: "letter",
    forceDesigned: true,
  });
  const cases = [
    ["Entire Binder", { preset: "week_binder" }, "entire_binder"],
    ["Weekly Overview", { preset: "weekly_overview" }, "overview"],
    ["One Day", { preset: "today_pack", day: "monday" }, "one_day"],
    ["Activities Only", { preset: "activities_only" }, "activities"],
    ["One Activity", { preset: "one_activity", activityId }, "one_activity"],
    ["Songs", { preset: "songs_pack" }, "songs"],
    ["Lyrics", { preset: "song_lyrics" }, "song_lyrics"],
    ["Book Guide", { preset: "book_guide" }, "books"],
    ["Materials", { preset: "materials_list" }, "materials"],
    ["Toolkit", { preset: "teacher_toolkit" }, "toolkit"],
    ["All Printables", { preset: "all_printables" }, "printables"],
  ];
  cases.forEach(([label, opts, mode]) => {
    const built = Print.buildBinderPrintHtml(kit, { ...opts, paperSize: "letter", forceDesigned: true });
    ok(built.ok === true, `${label} builds`);
    ok(built.documentMode === mode, `${label} documentMode=${mode}`);
    ok(built.pageCount >= 1, `${label} has pages (${built.pageCount})`);
  });

  const oneDay = Print.buildBinderPrintHtml(kit, {
    preset: "today_pack",
    day: "monday",
    paperSize: "letter",
    forceDesigned: true,
  });
  const oneActivity = Print.buildBinderPrintHtml(kit, {
    preset: "one_activity",
    activityId,
    paperSize: "letter",
    forceDesigned: true,
  });
  const weekly = Print.buildBinderPrintHtml(kit, {
    preset: "weekly_overview",
    paperSize: "letter",
    forceDesigned: true,
  });
  ok(oneDay.pageCount < entire.pageCount, `One Day stays compact vs Entire Binder (${oneDay.pageCount} < ${entire.pageCount})`);
  ok(oneActivity.pageCount < entire.pageCount,
    `One Activity stays compact vs Entire Binder (${oneActivity.pageCount} < ${entire.pageCount})`);
  ok(weekly.pageCount < entire.pageCount,
    `Weekly Overview stays compact vs Entire Binder (${weekly.pageCount} < ${entire.pageCount})`);
  ok(activityCardCount(oneActivity.html) === 1, "One Activity renders exactly one activity card");
  ok(materialsLiCount(oneDay.html) === 0, "One Day does not dump the full Materials list");
  ok(materialsLiCount(oneActivity.html) === 0, "One Activity does not dump the full Materials list");
  ok(materialsLiCount(entire.html) === expectedMaterials, "Entire Binder still keeps full Materials list");

  // One Song / One Printable when ids exist.
  if (songId) {
    const oneSong = Print.buildBinderPrintHtml(kit, {
      preset: "one_song",
      songId,
      paperSize: "letter",
      forceDesigned: true,
    });
    ok(oneSong.ok === true, "One Song builds");
  }
  if (printableId) {
    const onePrintable = Print.buildBinderPrintHtml(kit, {
      preset: "one_printable",
      printableId,
      paperSize: "letter",
      forceDesigned: true,
    });
    ok(onePrintable.ok === true, "One Printable builds");
  }
}

function buildOversizedKit(baseKit) {
  const kit = JSON.parse(JSON.stringify(baseKit));
  const master = [];
  for (let i = 1; i <= 160; i += 1) {
    master.push(`Oversized Supply ${String(i).padStart(3, "0")}`);
  }
  kit.companion.materialsModel = kit.companion.materialsModel || {};
  kit.companion.materialsModel.master = master.slice();
  kit.companion.materialsModel.masterDetailed = master.map((label) => ({ label, category: "" }));
  kit.companion.mondayMorningSetup = kit.companion.mondayMorningSetup || {};
  kit.companion.mondayMorningSetup.materials = master.slice(0, 80);

  const extraPrintables = [
    {
      id: "cur-res-oversized-a",
      title: "Oversized Printable Pack A",
      fileUrl: "/api/media/curriculum-resources/curriculum-resource-cur-res-oversized-a",
      mimeType: "application/pdf",
      pageCount: 3,
      embedAsImage: false,
    },
    {
      id: "cur-res-oversized-b",
      title: "Oversized Printable Pack B",
      fileUrl: "/api/media/curriculum-resources/curriculum-resource-cur-res-oversized-b",
      mimeType: "application/pdf",
      pageCount: 4,
      embedAsImage: false,
    },
  ];
  kit.companion.printables = [
    ...(kit.companion.printables || []).map((item) => ({
      ...item,
      embedAsImage: false,
    })),
    ...extraPrintables,
  ];
  return kit;
}

function unitOversizedBinderManifest() {
  console.log("\nUnit: oversized binder (larger than Farm Animals) keeps full materials + printables");
  const oversized = buildOversizedKit(loadLiveKit());
  const model = Model.buildPrintableTeachingKitModel(oversized, null, {});
  ok((model.overview?.masterMaterials || []).length === 160, "oversized model keeps 160 materials");
  const built = Print.buildBinderPrintHtml(oversized, {
    preset: "week_binder",
    paperSize: "letter",
    forceDesigned: true,
  });
  ok(built.ok === true, "oversized Entire Binder builds");
  ok(materialsLiCount(built.html) === 160, `oversized Materials list complete (${materialsLiCount(built.html)})`);
  ok((built.attachmentPlan?.attachments || []).length === 3, "three printable attachments planned");
  ok((built.manifest?.activities || []).length === 15, "activities retained on oversized kit");
  return built;
}

async function browserCompleteBinderProof(expectedMaterials) {
  console.log("\nBrowser: Farm Animals Entire Binder download parity + page count");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const kit = loadLiveKit();
  const printableId = "cur-res-c5cd1e5e6d5ea78a";
  const printableBytes = await makePdfBytes("FARM-COMPLETE-CARDS", 2);

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
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => (
      window.LLHTeachingKitPrint
      && window.LLHTeachingKitBinderPdf
      && window.LLHTeachingKitBinderJob
      && window.LLHTeachingKitPrintablePdfMerge
      && window.html2canvas
      && window.PDFLib
    ), null, { timeout: 30000 });

    const result = await page.evaluate(async (liveKit) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const JobApi = window.LLHTeachingKitBinderJob;
      JobApi.clearBinderArtifactCache?.();
      const built = PrintApi.buildBinderPrintHtml(liveKit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
      });
      document.querySelectorAll(".llh-teaching-kit-print-host").forEach((node) => node.remove());
      const host = document.createElement("div");
      host.className = "llh-teaching-kit-print-host";
      host.style.cssText = "display:block;position:fixed;left:-12000px;top:0;width:816px;visibility:visible;";
      host.innerHTML = `<article class="printable-resource-page teaching-kit-print-article">${built.html}</article>`;
      document.body.appendChild(host);
      const materialsLi = (host.querySelector('[data-tk-print-tab="Materials"]')?.querySelectorAll("li") || []).length;
      const toolkitHost = host.querySelector('[data-tk-print-tab="Teacher Toolkit"]');
      const toolkitMaterialsLi = (toolkitHost?.querySelector('[data-toolkit-group="materials"]')?.querySelectorAll("li") || []).length;
      const activityCards = host.querySelectorAll(".tk-print-activity-card").length;
      const sectionTabs = [...host.querySelectorAll("[data-tk-print-tab]")].map((node) => node.getAttribute("data-tk-print-tab"));
      const merged = await PrintApi.buildMergedTeachingKitPdf(liveKit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        host,
        forceBrowser: true,
        pageTimeoutMs: JobApi.pageCaptureTimeoutMs(),
        fetchBytes: async (source) => {
          const href = source.startsWith("/") ? `${location.origin}${source}` : source;
          const res = await fetch(href);
          if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        },
      });
      const validation = JobApi.validatePdfBytes(merged.bytes || new Uint8Array());
      const blob = new Blob([merged.bytes], { type: "application/pdf" });
      const download = JobApi.triggerBlobDownload(blob, built.fileName || "Teacher-Binder.pdf", {
        forceDownload: true,
      });
      return {
        mergeOk: merged.ok,
        reason: merged.reason,
        materialsLi,
        toolkitMaterialsLi,
        activityCards,
        sectionTabs,
        htmlPages: built.pageCount,
        serverPages: merged.report?.totalPages || 0,
        binderPages: merged.report?.binderPageCount || 0,
        attachmentPages: merged.report?.attachmentPageCount || 0,
        includedIds: (merged.report?.included || []).map((item) => item.id),
        includedAttachmentPages: (merged.report?.included || []).map((item) => Number(item.pageCount) || 0),
        byteLength: merged.bytes?.byteLength || 0,
        clientBytes: blob.size,
        validationOk: validation.ok,
        downloadOk: download.ok === true,
        delivery: download.delivery,
        pdfBytes: merged.bytes || null,
      };
    }, kit);

    ok(result.mergeOk === true, "Entire Binder merge succeeded");
    ok(result.validationOk === true, "PDF signature valid");
    ok(result.materialsLi === expectedMaterials, `browser Materials list complete (${result.materialsLi})`);
    ok(result.toolkitMaterialsLi === expectedMaterials,
      `browser Toolkit materials complete (${result.toolkitMaterialsLi})`);
    ok(result.activityCards === 15, `browser activity cards complete (${result.activityCards})`);
    ["Cover", "Contents", "Overview", "Weekly Plan", "Daily Plans", "Activities", "Songs", "Books", "Teacher Toolkit", "Materials"]
      .forEach((tab) => ok(result.sectionTabs.includes(tab), `browser section present: ${tab}`));
    ok(result.includedIds.includes(printableId), "printable attachment included");
    ok(result.includedIds.length === 1, "no printable attachment dropped or duplicated");
    ok(result.attachmentPages === 2, `fixture printable pages preserved (${result.attachmentPages})`);
    ok(result.includedAttachmentPages.reduce((sum, n) => sum + n, 0) === result.attachmentPages,
      "included printable page counts sum to attachmentPageCount");
    ok(result.binderPages >= 1, `binder pages captured (${result.binderPages})`);
    const expectedTotal2 = expectedMergedPageCount(result.binderPages, result.attachmentPages);
    ok(result.serverPages === expectedTotal2,
      `page formula: total=${result.serverPages} === binder(${result.binderPages})+attachments(${result.attachmentPages})`);
    ok(result.clientBytes === result.byteLength, `client Blob bytes match server (${result.clientBytes})`);
    ok(result.downloadOk === true && result.delivery === "download", "download trigger succeeded");

    const pdfDoc = await PDFDocument.load(result.pdfBytes);
    const downloadedPages = pdfDoc.getPageCount();
    ok(downloadedPages === result.serverPages,
      `downloaded page count matches server (${downloadedPages}/${result.serverPages})`);

    // Regression: printable 2 → 5 pages increases total by exactly 3; binder body unchanged.
    const fivePageBytes = await makePdfBytes("FARM-COMPLETE-CARDS-5", 5);
    const fivePageResult = await page.evaluate(async (payload) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const JobApi = window.LLHTeachingKitBinderJob;
      JobApi.clearBinderArtifactCache?.();
      const fiveBytes = Uint8Array.from(atob(payload.fiveB64), (c) => c.charCodeAt(0));
      const built = PrintApi.buildBinderPrintHtml(payload.kit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
      });
      const materialsBlock = built.html.match(/data-tk-print-tab="Materials"[\s\S]*?(?=<section class="tk-print-page|$)/)?.[0] || "";
      const materialsLi = (materialsBlock.match(/<li[\s>]/g) || []).length;
      const toolkitBlock = built.html.match(/data-tk-print-tab="Teacher Toolkit"[\s\S]*?(?=<section class="tk-print-page|$)/)?.[0] || "";
      const toolkitGroup = toolkitBlock.match(/data-toolkit-group="materials"[\s\S]*?(?=<section class="tk-print-toolkit-group"|$)/)?.[0] || "";
      const toolkitMaterialsLi = (toolkitGroup.match(/<li[\s>]/g) || []).length;
      const activityCards = (built.html.match(/class="tk-print-activity-card"/g) || []).length;
      const merged = await PrintApi.buildMergedTeachingKitPdf(payload.kit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        forceBrowser: true,
        skipArtifactCache: true,
        pageTimeoutMs: JobApi.pageCaptureTimeoutMs(),
        fetchBytes: async () => fiveBytes,
      });
      return {
        ok: merged.ok,
        reason: merged.reason,
        materialsLi,
        toolkitMaterialsLi,
        activityCards,
        totalPages: merged.report?.totalPages || 0,
        binderPages: merged.report?.binderPageCount || 0,
        attachmentPages: merged.report?.attachmentPageCount || 0,
        includedIds: (merged.report?.included || []).map((item) => item.id),
        byteLength: merged.bytes?.byteLength || 0,
      };
    }, {
      kit,
      fiveB64: Buffer.from(fivePageBytes).toString("base64"),
    });

    ok(fivePageResult.ok === true, "5-page printable Entire Binder merge succeeded");
    ok(fivePageResult.materialsLi === expectedMaterials,
      `5-page printable Materials still complete (${fivePageResult.materialsLi})`);
    ok(fivePageResult.toolkitMaterialsLi === expectedMaterials,
      `5-page printable Toolkit materials still complete (${fivePageResult.toolkitMaterialsLi})`);
    ok(fivePageResult.activityCards === 15, `5-page printable activities still complete (${fivePageResult.activityCards})`);
    ok(fivePageResult.includedIds.includes(printableId), "5-page printable still attached");
    ok(fivePageResult.attachmentPages === 5, `5-page printable pages preserved (${fivePageResult.attachmentPages})`);
    ok(fivePageResult.binderPages === result.binderPages,
      `binder pages unchanged when printable grows 2→5 (${fivePageResult.binderPages})`);
    ok(fivePageResult.totalPages === expectedMergedPageCount(fivePageResult.binderPages, fivePageResult.attachmentPages),
      `5-page formula: total=${fivePageResult.totalPages} === binder+attachments`);
    ok(fivePageResult.totalPages === result.serverPages + 3,
      `printable 2→5 increases total by exactly 3 (${result.serverPages} → ${fivePageResult.totalPages})`);

    const { pdfBytes: _omit, ...meta } = result;
    fs.writeFileSync(path.join(ARTIFACT, "farm-animals-complete.json"), JSON.stringify({
      ...meta,
      expectedMaterials,
      downloadedPages,
      pageFormula: "totalPages === binderPageCount + attachmentPageCount",
      fixturePrintablePages: 2,
      productionLikePrintablePages: 5,
      fivePage: fivePageResult,
      note: "Fixture total may be binder+2 (~51 historically). Production live printable is 5 pages (~54). Do not hardcode either total.",
    }, null, 2));
    fs.writeFileSync(path.join(ARTIFACT, "Farm-Animals-Entire-Binder-complete.pdf"), Buffer.from(result.pdfBytes));

    // Oversized multi-printable binder (larger than Farm Animals) in the same browser path.
    const oversized = buildOversizedKit(kit);
    const packA = await makePdfBytes("OVER-A", 3);
    const packB = await makePdfBytes("OVER-B", 4);
    const farmBytes = printableBytes;
    const oversizedResult = await page.evaluate(async (payload) => {
      const PrintApi = window.LLHTeachingKitPrint;
      const JobApi = window.LLHTeachingKitBinderJob;
      JobApi.clearBinderArtifactCache?.();
      const bytesById = {
        "cur-res-c5cd1e5e6d5ea78a": Uint8Array.from(atob(payload.farmB64), (c) => c.charCodeAt(0)),
        "cur-res-oversized-a": Uint8Array.from(atob(payload.aB64), (c) => c.charCodeAt(0)),
        "cur-res-oversized-b": Uint8Array.from(atob(payload.bB64), (c) => c.charCodeAt(0)),
      };
      const built = PrintApi.buildBinderPrintHtml(payload.kit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
      });
      const materialsBlock = built.html.match(/data-tk-print-tab="Materials"[\s\S]*?(?=<section class="tk-print-page|$)/)?.[0] || "";
      const materialsLi = (materialsBlock.match(/<li[\s>]/g) || []).length;
      const merged = await PrintApi.buildMergedTeachingKitPdf(payload.kit, {
        preset: "week_binder",
        paperSize: "letter",
        forceDesigned: true,
        forceBrowser: true,
        skipArtifactCache: true,
        pageTimeoutMs: JobApi.pageCaptureTimeoutMs(),
        fetchBytes: async (_source, attachment) => bytesById[attachment.id] || null,
      });
      return {
        ok: merged.ok,
        reason: merged.reason,
        materialsLi,
        totalPages: merged.report?.totalPages || 0,
        binderPages: merged.report?.binderPageCount || 0,
        includedIds: (merged.report?.included || []).map((item) => item.id),
        attachmentPages: merged.report?.attachmentPageCount || 0,
        byteLength: merged.bytes?.byteLength || 0,
        pdfBytes: merged.bytes || null,
      };
    }, {
      kit: oversized,
      farmB64: Buffer.from(farmBytes).toString("base64"),
      aB64: Buffer.from(packA).toString("base64"),
      bB64: Buffer.from(packB).toString("base64"),
    });

    ok(oversizedResult.ok === true, "oversized Entire Binder merge succeeded");
    ok(oversizedResult.materialsLi === 160, `oversized Materials complete in browser HTML (${oversizedResult.materialsLi})`);
    ok(oversizedResult.includedIds.length === 3, "all three printables merged");
    ok(oversizedResult.attachmentPages === 9, `oversized attachment pages 2+3+4=${oversizedResult.attachmentPages}`);
    ok(oversizedResult.totalPages === expectedMergedPageCount(oversizedResult.binderPages, oversizedResult.attachmentPages),
      `oversized formula: total=${oversizedResult.totalPages} === binder(${oversizedResult.binderPages})+attachments(${oversizedResult.attachmentPages})`);
    const oversizedPdf = await PDFDocument.load(oversizedResult.pdfBytes);
    ok(oversizedPdf.getPageCount() === oversizedResult.totalPages,
      `oversized downloaded pages match (${oversizedPdf.getPageCount()})`);
    ok(oversizedResult.totalPages > downloadedPages,
      `oversized binder larger than Farm Animals (${oversizedResult.totalPages} > ${downloadedPages})`);

    fs.writeFileSync(path.join(ARTIFACT, "oversized-complete.json"), JSON.stringify({
      ...oversizedResult,
      pdfBytes: undefined,
      downloadedPages: oversizedPdf.getPageCount(),
    }, null, 2));
    fs.writeFileSync(path.join(ARTIFACT, "Oversized-Entire-Binder-complete.pdf"), Buffer.from(oversizedResult.pdfBytes));

    return {
      farm: {
        ...result,
        downloadedPages,
        expectedMaterials,
        fivePage: fivePageResult,
      },
      oversized: { ...oversizedResult, downloadedPages: oversizedPdf.getPageCount() },
    };
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  console.log("Teaching Kit Entire Binder completeness regression");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const unit = unitFarmAnimalsMaterialsComplete();
  unitSelectiveModesStillWork();
  unitOversizedBinderManifest();
  const proof = await browserCompleteBinderProof(unit.expectedMaterials);
  console.log(`\n${passed} assertions passed`);
  console.log(JSON.stringify({
    expectedMaterials: unit.expectedMaterials,
    farmHtmlPages: unit.htmlPageCount,
    farmPdfPages: proof.farm.downloadedPages,
    farmBinderPages: proof.farm.binderPages,
    farmAttachmentPages: proof.farm.attachmentPages,
    farmBytes: proof.farm.byteLength,
    pageFormula: "totalPages === binderPageCount + attachmentPageCount",
    fivePagePdfPages: proof.farm.fivePage?.totalPages,
    fivePageDelta: (proof.farm.fivePage?.totalPages || 0) - proof.farm.downloadedPages,
    oversizedPdfPages: proof.oversized.downloadedPages,
    oversizedBytes: proof.oversized.byteLength,
  }));
}

main().catch((err) => {
  console.error("\nFAIL", err);
  process.exit(1);
});

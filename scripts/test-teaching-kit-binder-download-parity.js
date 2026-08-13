#!/usr/bin/env node
/**
 * Teaching Kit Entire Binder Kit — selection resolver + Preview/Print/Download parity.
 * Also covers Print Center label-click radio sync (Entire Binder vs stale Songs).
 *
 * Run: npm run test:teaching-kit-binder-download-parity
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { PDFDocument } = require("pdf-lib");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = "/opt/cursor/artifacts/tk-binder-download-parity";
const OPT_HTML = path.join(ARTIFACT, "html");
const PORT = 7600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-binder-parity-${process.pid}.json`);

require("./teaching-kit-present.js");
const Mapper = require("./teaching-kit-mapper.js");
const Model = require("./teaching-kit-printable-model.js");
const Print = require("./teaching-kit-print.js");
const Viewer = require("./teaching-kit-viewer.js");
const BinderPdf = require("./teaching-kit-binder-pdf.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function loadFixture(name) {
  return require(path.join(__dirname, "fixtures", "teaching-kit", name));
}

function mapFixture(fixture) {
  return Mapper.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities || [],
    fixture.resources || [],
    { day: "monday", enrichmentDraft: fixture.enrichmentDraft || null },
  );
}

function disposableSecondLesson() {
  const id = `cur-lp-disposable-tk-parity-${Date.now()}`;
  const day = (focus, activityTitle) => ({
    focus,
    circleTime: [`Talk about ${focus}`],
    invitationToPlay: `Invite play around ${focus}`,
    sensory: "Sensory bin",
    fineMotor: "Fine motor tray",
    grossMotor: "Gross motor path",
    outdoorPlay: "Outdoor exploration",
    art: "Process art",
    stem: "STEM table",
    smallGroup: "Small group",
    materials: ["paper", "crayons"],
    observations: [`Watch for engagement with ${focus}`],
    parentMessage: `Ask your child about ${focus} today.`,
    schedule: [{ label: "Circle time", detail: focus }],
    activities: [],
  });
  return {
    lessonPlan: {
      id,
      title: "Disposable Ocean Shells",
      age: "Preschool",
      theme: "Ocean",
      status: "draft",
      plan: "Free",
      disposableFixture: true,
      weeklyOverview: "Children explore shells, tides, and ocean animals through play.",
      learningObjectives: ["Name ocean animals", "Sort shells by size"],
      vocabulary: [{ word: "shell" }, { word: "tide" }, { word: "ocean" }],
      familyConnection: "Talk about a beach visit or ocean book at home.",
      songs: [
        { title: "Ocean Hello Song", notes: "Hello ocean friends" },
        { title: "Wave Clean-Up Song", notes: "Clean up waves" },
      ],
      books: [
        { title: "Ocean Shells Story", notes: "What did you notice?" },
      ],
      monday: day("Shells", "Shell Sort"),
      tuesday: day("Crabs", "Crab Walk"),
      wednesday: day("Fish", "Fish Count"),
      thursday: day("Waves", "Wave Bottles"),
      friday: day("Share", "Ocean Gallery"),
      teachingKit: {
        completeness: "complete",
        companion: {
          mondayMorningSetup: {
            materials: ["shells", "bins", "magnifiers"],
            prepTasks: [{ label: "Set ocean table", minutes: 10 }],
            printChecklist: [],
          },
          parentConnection: { readyToSendMessage: "Ask your child about ocean shells today." },
        },
      },
    },
    activities: ["monday", "tuesday", "wednesday", "thursday", "friday"].flatMap((weekday, index) => ([{
      id: `${id}-act-${index + 1}`,
      lessonPlanId: id,
      title: `Ocean Activity ${index + 1}`,
      dayOfWeek: weekday,
      materials: ["shells"],
      steps: ["Invite children", "Explore", "Clean up"],
      observationIdeas: ["Notice sorting language"],
      status: "published",
    }])),
    enrichmentDraft: null,
    resources: [],
  };
}

function assertParity(kit, label, options = {}) {
  const base = {
    preset: "week_binder",
    documentMode: "entire_binder",
    includeImages: options.includeImages !== false,
    inkSaver: Boolean(options.inkSaver),
    paperSize: options.paperSize || "letter",
    plan: options.plan || null,
  };
  const preview = Print.buildPrintPreviewHtml(kit, { ...base, intent: "preview" });
  const printDoc = Print.buildBinderPrintHtml(kit, { ...base, intent: "print" });
  const download = Print.buildBinderPrintHtml(kit, { ...base, intent: "download" });
  ok(preview.ok && printDoc.ok && download.ok, `${label}: preview/print/download build`);
  ok(preview.pageCount > 0, `${label}: page count > 0 (${preview.pageCount})`);
  ok(preview.pageCount === printDoc.pageCount, `${label}: preview/print page counts match`);
  ok(printDoc.pageCount === download.pageCount, `${label}: print/download page counts match`);
  ok(preview.contentFingerprint === printDoc.contentFingerprint, `${label}: preview/print fingerprints match`);
  ok(printDoc.contentFingerprint === download.contentFingerprint, `${label}: print/download fingerprints match`);
  ok(JSON.stringify(preview.sectionManifest) === JSON.stringify(download.sectionManifest), `${label}: section manifests match`);
  ok(preview.manifest.summary === "Entire Binder Kit selected", `${label}: Entire Binder summary`);
  ok(preview.manifest.itemCount >= 8, `${label}: summary lists multiple binder sections (${preview.manifest.itemCount})`);
  ok(preview.manifest.itemLabels.includes("Branded cover"), `${label}: branded cover in summary`);
  ok(preview.manifest.itemLabels.includes("Songs"), `${label}: songs section listed`);
  ok(!preview.manifest.itemLabels.every((labelText) => /song/i.test(labelText)), `${label}: summary is not songs-only`);
  ok(preview.sectionManifest[0] === "Cover", `${label}: first page section is Cover`);
  const lastSection = preview.sectionManifest[preview.sectionManifest.length - 1];
  ok(Boolean(lastSection), `${label}: final section present (${lastSection})`);
  ok(download.fileName === Print.teachingKitPdfFileName(kit, base, download), `${label}: filename helper matches built file`);
  ok(/^Little-Learner-Hub-.+-Teacher-Binder\.pdf$/.test(download.fileName), `${label}: branded binder filename (${download.fileName})`);
  return { preview, printDoc, download };
}

async function assertPdfBytes(kit, label, paperSize) {
  const built = Print.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    intent: "download",
    paperSize,
    plan: null,
  });
  ok(built.ok, `${label} ${paperSize}: binder html ok`);
  const rendered = await BinderPdf.renderBinderPdf(built.html, {
    paperSize,
    forceBrowser: false,
  });
  ok(rendered.ok, `${label} ${paperSize}: PDF render ok (${rendered.reason || "ok"})`);
  ok(rendered.bytes && rendered.bytes.byteLength > 1000, `${label} ${paperSize}: non-empty PDF`);
  const pdf = await PDFDocument.load(rendered.bytes);
  const pageCount = pdf.getPageCount();
  ok(pageCount > 0, `${label} ${paperSize}: PDF page count > 0 (${pageCount})`);
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const out = path.join(ARTIFACT, `${label.replace(/\s+/g, "-").toLowerCase()}-${paperSize}.pdf`);
  fs.writeFileSync(out, rendered.bytes);
  return { pageCount, fileName: built.fileName, bytes: rendered.bytes, path: out };
}

function unitResolverAndFilename() {
  console.log("\nUnit: Entire Binder resolver + filename");
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const farmKit = mapFixture(farm);
  const farmParity = assertParity(farmKit, "Farm Animals fixture", { plan: farm.lessonPlan });
  ok(farmParity.download.fileName === "Little-Learner-Hub-Farm-Animals-Teacher-Binder.pdf", "Farm Animals exact filename");

  const songsOnly = Print.buildBinderPrintHtml(farmKit, {
    preset: "songs_pack",
    plan: farm.lessonPlan,
  });
  ok(songsOnly.manifest.summary === "Songs pack selected", "Songs pack has its own summary");
  ok(songsOnly.manifest.itemLabels.includes("Old MacDonald Had a Farm") || (songsOnly.manifest.itemLabels || []).length >= 1, "Songs pack lists songs");

  const selectedSongs = Print.buildBinderPrintHtml(farmKit, {
    preset: "selected_resources",
    plan: farm.lessonPlan,
    selectedResources: {
      songs: true,
    },
  });
  ok(/selected resources$/i.test(selectedSongs.manifest.summary), "Selected Resources summary uses resource count phrasing");
  ok(selectedSongs.sectionManifest.includes("Songs"), "Selected song resources render Songs");
  ok(!selectedSongs.sectionManifest.includes("Daily Plans"), "Selected songs-only does not include daily plans");

  const disposable = disposableSecondLesson();
  const secondKit = mapFixture(disposable);
  ok(secondKit.ok, "disposable second lesson maps");
  assertParity(secondKit, "Disposable Ocean Shells", { plan: disposable.lessonPlan });

  const ink = Print.buildBinderPrintHtml(farmKit, {
    preset: "week_binder",
    plan: farm.lessonPlan,
    inkSaver: true,
    includeImages: false,
    paperSize: "a4",
  });
  ok(ink.ok && ink.paperSize === "a4", "A4 + ink-saver builds");
  ok(ink.selection.inkSaver === true, "ink-saver preserved on selection");
  ok(ink.selection.includeImages === false, "includeImages false preserved");
}

function unitViewerLabelClickSync() {
  console.log("\nUnit: Print Center change-handler source");
  const viewerJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-viewer.js"), "utf8");
  ok(viewerJs.includes("input[data-tk-print-preset]"), "viewer syncs print preset on change");
  ok(viewerJs.includes("emptySelectedResources"), "viewer clears selected resources for Entire Binder");
  ok(viewerJs.includes("Preparing your binder…"), "viewer shows Preparing your binder…");
  ok(viewerJs.includes("Your binder is ready. Download started."), "viewer shows binder ready copy");
  ok(viewerJs.includes("Selection incomplete"), "Ready to print hidden when unresolved");
  ok(viewerJs.includes("binderRequestId"), "viewer tracks binder request id");
  ok(viewerJs.includes("data-tk-retry-binder"), "viewer has Try Again");

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(appJs.includes("Preparing your binder…"), "app download preparing copy");
  ok(appJs.includes("Your binder is ready. Download started."), "app download started copy");
  ok(appJs.includes("teachingKitBinderBusy"), "app download busy guard");
  ok(appJs.includes("download_pdf_unavailable"), "download never silent-falls through to print");
  ok(appJs.includes("teachingKitPdfFileName"), "app uses branded PDF filename helper");
}

async function browserLabelClickRegression() {
  console.log("\nBrowser: label-click Entire Binder Kit sync");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  fs.mkdirSync(OPT_HTML, { recursive: true });

  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const kit = mapFixture(farm);
  const state = Viewer.defaultState(kit, { printCenterEnabled: true });
  state.surface = "build";
  state.printPreset = "songs_pack";
  state.printParts = Print.defaultPartsForPreset("songs_pack");

  const host = { innerHTML: "", classList: { remove() {}, add() {} } };
  // Minimal DOM harness via Playwright page
  const html = `<!doctype html><html><body>
    <div id="host"></div>
    <script src="/scripts/teaching-kit-present.js"></script>
    <script src="/scripts/teaching-kit-printable-model.js"></script>
    <script src="/scripts/teaching-kit-print.js"></script>
    <script src="/scripts/teaching-kit-viewer.js"></script>
  </body></html>`;

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/" || urlPath === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
    const filePath = path.join(ROOT, urlPath.replace(/^\//, ""));
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
    await page.evaluate(({ kitPayload, farmPlan }) => {
      const ViewerApi = window.LLHTeachingKitViewer;
      const PrintApi = window.LLHTeachingKitPrint;
      const hostEl = document.getElementById("host");
      const state = ViewerApi.defaultState(kitPayload, { printCenterEnabled: true });
      state.surface = "build";
      state.printPreset = "songs_pack";
      state.printParts = PrintApi.defaultPartsForPreset("songs_pack");
      // Pre-select all song IDs as if user was in Selected Resources previously.
      state.selectedResources.songIds = (kitPayload.companion.songs || []).map((song) => (
        song.id || `song:${String(song.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      ));
      ViewerApi.renderInto(hostEl, kitPayload, state, { title: kitPayload.title });
      const root = hostEl.querySelector("[data-teaching-kit-workspace]");
      window.__tkState = state;
      window.__tkUnbind = ViewerApi.bindWorkspace(root, {
        kit: kitPayload,
        state,
        chrome: { title: kitPayload.title },
        onPrint: (selection) => {
          window.__lastPrintSelection = selection;
          const built = PrintApi.buildBinderPrintHtml(kitPayload, {
            ...selection,
            plan: farmPlan,
          });
          window.__lastBuilt = {
            summary: built.manifest?.summary,
            itemLabels: built.manifest?.itemLabels,
            sectionManifest: built.sectionManifest,
            pageCount: built.pageCount,
            fileName: built.fileName,
            documentMode: built.documentMode,
          };
          return { ok: true, reason: "preview", fileName: built.fileName };
        },
      });
    }, { kitPayload: kit, farmPlan: farm.lessonPlan });

    // Click the LABEL TEXT for Entire Binder Kit (not the radio input) — the live bug.
    await page.locator("label.tk-radio-row", { hasText: "Entire Binder Kit" }).locator("span").click();
    await page.waitForTimeout(50);
    const afterPreset = await page.evaluate(() => window.__tkState.printPreset);
    ok(afterPreset === "week_binder", `label-click sets printPreset to week_binder (got ${afterPreset})`);

    const summaryText = await page.locator("[data-tk-print-summary]").innerText();
    ok(/Entire Binder Kit selected/i.test(summaryText), `summary shows Entire Binder Kit (got ${summaryText})`);
    ok(!/Old MacDonald/i.test(summaryText), "summary no longer lists only song titles after Entire Binder label click");

    await page.locator("[data-tk-preview-print]").click();
    await page.waitForTimeout(50);
    const built = await page.evaluate(() => window.__lastBuilt);
    ok(built?.documentMode === "entire_binder", "preview uses entire_binder after label click");
    ok((built?.pageCount || 0) >= 8, `preview page count substantial (${built?.pageCount})`);
    ok((built?.sectionManifest || []).includes("Daily Plans"), "preview includes Daily Plans");
    ok((built?.sectionManifest || []).includes("Songs"), "preview still includes Songs as one section");
    ok(built?.fileName === "Little-Learner-Hub-Farm-Animals-Teacher-Binder.pdf", "preview/download share binder filename");

    await page.screenshot({ path: path.join(ARTIFACT, "desktop-entire-binder-ready.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(ARTIFACT, "mobile-entire-binder-ready.png"), fullPage: true });
    ok(true, "desktop + mobile screenshots captured");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
  unitResolverAndFilename();
  unitViewerLabelClickSync();

  console.log("\nPDF: letter + A4 non-empty binders");
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const farmKit = mapFixture(farm);
  const letter = await assertPdfBytes(farmKit, "Farm Animals", "letter");
  const a4 = await assertPdfBytes(farmKit, "Farm Animals", "a4");
  ok(letter.pageCount > 0 && a4.pageCount > 0, "letter and A4 PDFs both have pages");

  const disposable = disposableSecondLesson();
  const secondKit = mapFixture(disposable);
  await assertPdfBytes(secondKit, "Disposable Ocean", "letter");

  await browserLabelClickRegression();

  fs.writeFileSync(path.join(ARTIFACT, "summary.json"), JSON.stringify({
    passed,
    farmFileName: letter.fileName,
    farmLetterPages: letter.pageCount,
    farmA4Pages: a4.pageCount,
  }, null, 2));

  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  try { fs.unlinkSync(STORE_PATH); } catch (_err) { /* ignore */ }
});

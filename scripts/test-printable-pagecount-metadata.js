#!/usr/bin/env node
/**
 * Regression: displayed printable page count must match actual PDF metadata.
 * Run: NODE_ENV=test node scripts/test-printable-pagecount-metadata.js
 */
"use strict";

const assert = require("node:assert/strict");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const Merge = require("./teaching-kit-printable-pdf-merge.js");

async function makePdf(pageCount) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Farm Animals page ${i + 1}`, { x: 72, y: 720, size: 18, font });
  }
  return Buffer.from(await doc.save());
}

async function main() {
  const actualPages = 5;
  const staleStoredCount = 2;
  const bytes = await makePdf(actualPages);
  const inspected = await Merge.inspectPdfPages(bytes);
  assert.equal(inspected.ok, true, "inspectPdfPages ok");
  assert.equal(inspected.pageCount, actualPages, "inspected page count matches generated PDF");

  const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
  const resource = {
    id: "cur-res-farm-animals-printable",
    title: "Farm Animals Printable",
    pageCount: staleStoredCount,
    fileData: dataUrl,
    mimeType: "application/pdf",
    fileName: "farm-animals.pdf",
  };

  const resolved = await Merge.resolveDisplayedPageCount(resource);
  assert.equal(resolved.ok, true, "resolveDisplayedPageCount ok");
  assert.equal(resolved.source, "pdf_metadata", "page count sourced from PDF metadata");
  assert.equal(resolved.pageCount, actualPages, "displayed count matches PDF, not stale stored 2");
  assert.notEqual(resolved.pageCount, staleStoredCount, "must not keep stale stored page count");

  const enriched = await Merge.enrichPrintablesWithPdfPageCounts([resource]);
  assert.equal(enriched[0].pageCount, actualPages, "enrichPrintablesWithPdfPageCounts updates display count");
  assert.equal(enriched[0].pageCountSource, "pdf_metadata");

  console.log(JSON.stringify({
    ok: true,
    staleStoredCount,
    actualPages,
    displayedPageCount: resolved.pageCount,
    source: resolved.source,
  }, null, 2));
  console.log("printable-pagecount-metadata: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

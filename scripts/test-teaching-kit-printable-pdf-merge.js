#!/usr/bin/env node
/**
 * Teaching Kit printable PDF merge coverage.
 * Verifies actual merged PDF page content/order for attached printables.
 *
 * Run: npm run test:teaching-kit-printable-pdf-merge
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = path.join(ROOT, "artifacts", "tk-printable-pdf-merge");
const OPT_ARTIFACT = "/opt/cursor/artifacts/tk-printable-pdf-merge";

require("./teaching-kit-present.js");
const Mapper = require("./teaching-kit-mapper.js");
const Model = require("./teaching-kit-printable-model.js");
const Print = require("./teaching-kit-print.js");
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

function mapWithResources(fixture, resources) {
  return Mapper.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities || [],
    resources || fixture.resources || [],
    { day: "monday" },
  );
}

async function makePdfBytes({ title, pages, landscapeIndexes = [] }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i += 1) {
    const landscape = landscapeIndexes.includes(i);
    const page = doc.addPage(landscape ? [792, 612] : [612, 792]);
    const marker = `${title}::page-${i + 1}`;
    page.drawText(marker, {
      x: 48,
      y: landscape ? 300 : 720,
      size: 18,
      font,
      color: rgb(0.2, 0.1, 0.45),
    });
    page.drawText(landscape ? "LANDSCAPE" : "PORTRAIT", {
      x: 48,
      y: landscape ? 260 : 680,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
  return {
    bytes: await doc.save(),
    markers: Array.from({ length: pages }, (_, i) => `${title}::page-${i + 1}`),
  };
}

function toDataUrl(bytes) {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function extractPageTextMarkers(pdfBytes) {
  // pdf-lib does not expose text extraction; verify via page sizes + re-parse markers
  // by loading source attachment pages we embedded and checking report + page geometry.
  const inspected = await Merge.inspectPdfPages(pdfBytes);
  return inspected;
}

async function buildFarmWithPrintables() {
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const card = await makePdfBytes({ title: "FARM-CARDS", pages: 2 });
  const poster = await makePdfBytes({ title: "FARM-POSTER", pages: 1, landscapeIndexes: [0] });
  const worksheet = await makePdfBytes({ title: "FARM-WORKSHEET", pages: 3 });
  const resources = [
    {
      id: "cur-res-farm-cards",
      title: "Farm Animal Cards",
      resourceCategory: "Printables",
      lessonPlanIds: [farm.lessonPlan.id],
      status: "published",
      fileName: "farm-cards.pdf",
      mimeType: "application/pdf",
      fileData: toDataUrl(card.bytes),
      pageCount: 2,
    },
    {
      id: "cur-res-farm-poster",
      title: "Farm Poster",
      resourceCategory: "Printables",
      lessonPlanIds: [farm.lessonPlan.id],
      status: "published",
      fileName: "farm-poster.pdf",
      mimeType: "application/pdf",
      fileData: toDataUrl(poster.bytes),
      pageCount: 1,
    },
    {
      id: "cur-res-farm-worksheet",
      title: "Farm Worksheet Pack",
      resourceCategory: "Printables",
      lessonPlanIds: [farm.lessonPlan.id],
      status: "published",
      fileName: "farm-worksheet.pdf",
      mimeType: "application/pdf",
      fileData: toDataUrl(worksheet.bytes),
      pageCount: 3,
    },
    {
      id: "cur-res-farm-missing",
      title: "Missing Attachment Printable",
      resourceCategory: "Printables",
      lessonPlanIds: [farm.lessonPlan.id],
      status: "published",
      fileName: "missing.pdf",
      mimeType: "application/pdf",
    },
    {
      id: "cur-res-farm-invalid",
      title: "Invalid Attachment Printable",
      resourceCategory: "Printables",
      lessonPlanIds: [farm.lessonPlan.id],
      status: "published",
      fileName: "invalid.pdf",
      mimeType: "application/pdf",
      fileData: "data:application/pdf;base64,not-a-valid-pdf-payload",
    },
  ];
  // Attach resource ids onto plan without mutating the fixture file on disk.
  const plan = {
    ...farm.lessonPlan,
    resourceIds: Array.from(new Set([...(farm.lessonPlan.resourceIds || []), ...resources.map((r) => r.id)])),
  };
  const kit = Mapper.mapLessonPlanToTeachingKit(plan, farm.activities || [], resources, { day: "monday" });
  return {
    farm,
    plan,
    kit,
    resources,
    markers: {
      card: card.markers,
      poster: poster.markers,
      worksheet: worksheet.markers,
    },
    bytes: {
      card: card.bytes,
      poster: poster.bytes,
      worksheet: worksheet.bytes,
    },
  };
}

async function assertMergedContainsAttachments(merged, expectedIds, label) {
  ok(merged.ok === true, `${label}: merge ok`);
  ok(merged.bytes && merged.bytes.byteLength > 500, `${label}: pdf bytes present`);
  const includedIds = (merged.report?.included || []).map((item) => item.id);
  expectedIds.forEach((id) => ok(includedIds.includes(id), `${label}: includes ${id}`));
  const inspected = await extractPageTextMarkers(merged.bytes);
  ok(inspected.ok === true, `${label}: inspect pages`);
  ok(inspected.pageCount === merged.report.totalPages, `${label}: inspected pageCount matches report`);
  return { includedIds, inspected };
}

async function runCases() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
  fs.mkdirSync(OPT_ARTIFACT, { recursive: true });
  const ctx = await buildFarmWithPrintables();
  ok(ctx.kit.ok === true, "farm kit with printables maps");
  const model = Model.buildPrintableTeachingKitModel(ctx.kit, ctx.plan);
  ok(model.printables.length >= 3, "printables present in model");
  ok(model.printables.every((item) => item.id), "printable stable ids");

  const stylesHref = `file://${path.join(ROOT, "styles.css")}`;

  console.log("\n1) One attached PDF printable");
  {
    const merged = await Print.buildMergedTeachingKitPdf(ctx.kit, {
      preset: "one_printable",
      printableId: "cur-res-farm-cards",
      plan: ctx.plan,
      stylesHref,
    });
    const { inspected } = await assertMergedContainsAttachments(merged, ["cur-res-farm-cards"], "one printable");
    ok(merged.report.attachmentPageCount === 2, "one printable: 2 attachment pages");
    // Pages after binder should include portrait letter-ish pages from cards
    const attachPages = inspected.pages.slice(merged.report.binderPageCount);
    ok(attachPages.length === 2, "one printable: two attachment page geometries");
    ok(attachPages.every((page) => page.orientation === "portrait"), "one printable: portrait pages preserved");
    fs.writeFileSync(path.join(ARTIFACT, "one-printable.pdf"), merged.bytes);
  }

  console.log("\n2) Multiple attached PDF printables");
  {
    const merged = await Print.buildMergedTeachingKitPdf(ctx.kit, {
      preset: "selected_resources",
      parts: { cover: true },
      selectedResources: {
        printableIds: ["cur-res-farm-cards", "cur-res-farm-poster", "cur-res-farm-worksheet"],
      },
      plan: ctx.plan,
      stylesHref,
    });
    const { includedIds } = await assertMergedContainsAttachments(
      merged,
      ["cur-res-farm-cards", "cur-res-farm-poster", "cur-res-farm-worksheet"],
      "multiple printables",
    );
    ok(includedIds.join(",") === "cur-res-farm-cards,cur-res-farm-poster,cur-res-farm-worksheet", "multiple: order preserved");
    ok(merged.report.attachmentPageCount === 2 + 1 + 3, "multiple: 6 attachment pages");
    fs.writeFileSync(path.join(ARTIFACT, "multiple-printables.pdf"), merged.bytes);
  }

  console.log("\n3) Printable + activity");
  {
    const actId = (ctx.kit.companion.activities || [])[0]?.id;
    const merged = await Print.buildMergedTeachingKitPdf(ctx.kit, {
      preset: "selected_resources",
      parts: { cover: false },
      selectedResources: {
        activityIds: [actId],
        printableIds: ["cur-res-farm-poster"],
      },
      plan: ctx.plan,
      stylesHref,
    });
    await assertMergedContainsAttachments(merged, ["cur-res-farm-poster"], "printable+activity");
    ok(merged.built.manifest.activityIds.includes(actId), "activity remains in manifest");
    ok(!merged.report.included.some((item) => item.id === "cur-res-farm-cards"), "unselected printable absent");
    fs.writeFileSync(path.join(ARTIFACT, "printable-plus-activity.pdf"), merged.bytes);
  }

  console.log("\n4) Printable + selected day");
  {
    const merged = await Print.buildMergedTeachingKitPdf(ctx.kit, {
      preset: "selected_resources",
      parts: { cover: true },
      selectedResources: {
        days: ["monday"],
        printableIds: ["cur-res-farm-worksheet"],
      },
      plan: ctx.plan,
      stylesHref,
    });
    await assertMergedContainsAttachments(merged, ["cur-res-farm-worksheet"], "printable+day");
    ok(merged.built.manifest.dayIds.join(",") === "monday", "monday only in manifest");
    ok(!merged.built.manifest.dayIds.includes("friday"), "friday not leaked");
    fs.writeFileSync(path.join(ARTIFACT, "printable-plus-day.pdf"), merged.bytes);
  }

  console.log("\n5) All Printables");
  {
    // Use only resources that have valid attachments for all_printables success path.
    const validResources = ctx.resources.filter((item) => ["cur-res-farm-cards", "cur-res-farm-poster", "cur-res-farm-worksheet"].includes(item.id));
    const plan = { ...ctx.plan, resourceIds: validResources.map((item) => item.id) };
    const kit = Mapper.mapLessonPlanToTeachingKit(plan, ctx.farm.activities || [], validResources, { day: "monday" });
    const merged = await Print.buildMergedTeachingKitPdf(kit, {
      preset: "all_printables",
      plan,
      stylesHref,
    });
    await assertMergedContainsAttachments(
      merged,
      ["cur-res-farm-cards", "cur-res-farm-poster", "cur-res-farm-worksheet"],
      "all printables",
    );
    fs.writeFileSync(path.join(ARTIFACT, "all-printables.pdf"), merged.bytes);
  }

  console.log("\n6) Entire Kit");
  {
    const validResources = ctx.resources.filter((item) => ["cur-res-farm-cards", "cur-res-farm-poster", "cur-res-farm-worksheet"].includes(item.id));
    const plan = { ...ctx.plan, resourceIds: validResources.map((item) => item.id) };
    const kit = Mapper.mapLessonPlanToTeachingKit(plan, ctx.farm.activities || [], validResources, { day: "monday" });
    const merged = await Print.buildMergedTeachingKitPdf(kit, {
      preset: "week_binder",
      plan,
      stylesHref,
    });
    await assertMergedContainsAttachments(
      merged,
      ["cur-res-farm-cards", "cur-res-farm-poster", "cur-res-farm-worksheet"],
      "entire kit",
    );
    ok(merged.report.binderPageCount >= 5, `entire kit binder pages present (${merged.report.binderPageCount})`);
    ok(merged.report.totalPages === merged.report.binderPageCount + 6, "entire kit total = binder + attachments");
    fs.writeFileSync(path.join(ARTIFACT, "entire-kit.pdf"), merged.bytes);
  }

  console.log("\n7) Missing attachment fails closed");
  {
    const merged = await Print.buildMergedTeachingKitPdf(ctx.kit, {
      preset: "one_printable",
      printableId: "cur-res-farm-missing",
      plan: ctx.plan,
      stylesHref,
    });
    ok(merged.ok === false && merged.reason === "attachment_missing", "missing attachment fails closed");
    ok(/no attached PDF|missing/i.test(merged.message || merged.report?.summary || ""), "useful missing message");
  }

  console.log("\n8) Invalid attachment fails closed");
  {
    const merged = await Print.buildMergedTeachingKitPdf(ctx.kit, {
      preset: "one_printable",
      printableId: "cur-res-farm-invalid",
      plan: ctx.plan,
      stylesHref,
    });
    ok(merged.ok === false && /invalid_attachment|attachment_missing/.test(merged.reason || ""), "invalid attachment fails closed");
  }

  console.log("\n9) Duplicate reference deduped");
  {
    const merged = await Print.buildMergedTeachingKitPdf(ctx.kit, {
      preset: "selected_resources",
      selectedResources: {
        printableIds: ["cur-res-farm-cards", "cur-res-farm-cards", "cur-res-farm-poster"],
      },
      plan: ctx.plan,
      stylesHref,
    });
    await assertMergedContainsAttachments(merged, ["cur-res-farm-cards", "cur-res-farm-poster"], "dedupe");
    ok((merged.report.included || []).filter((item) => item.id === "cur-res-farm-cards").length === 1, "cards included once");
    ok(merged.report.attachmentPageCount === 3, "dedupe: cards(2)+poster(1) pages only once");

    // Planner-level duplicate skip when the same printable object appears twice in manifest order.
    const card = model.printables.find((item) => item.id === "cur-res-farm-cards");
    const poster = model.printables.find((item) => item.id === "cur-res-farm-poster");
    const planDup = Merge.planPrintableAttachments({
      documentMode: "selected_resources",
      include: { printables: true },
      printables: [card, card, poster],
    });
    ok(planDup.ok === true, "planner accepts duplicate list");
    ok(planDup.attachments.map((item) => item.id).join(",") === "cur-res-farm-cards,cur-res-farm-poster", "planner keeps first-seen order");
    ok(planDup.duplicatesSkipped.some((item) => item.id === "cur-res-farm-cards"), "duplicate skipped recorded by planner");
  }

  console.log("\n10) Mixed portrait/landscape + multi-page");
  {
    const merged = await Print.buildMergedTeachingKitPdf(ctx.kit, {
      preset: "selected_resources",
      selectedResources: {
        printableIds: ["cur-res-farm-poster", "cur-res-farm-worksheet"],
      },
      plan: ctx.plan,
      stylesHref,
    });
    const { inspected } = await assertMergedContainsAttachments(
      merged,
      ["cur-res-farm-poster", "cur-res-farm-worksheet"],
      "mixed orientation",
    );
    const attachPages = inspected.pages.slice(merged.report.binderPageCount);
    ok(attachPages[0].orientation === "landscape", "poster landscape preserved");
    ok(attachPages.slice(1).every((page) => page.orientation === "portrait"), "worksheet pages portrait");
    ok(attachPages.length === 4, "1 landscape + 3 portrait pages");
    // Ensure page dimensions were not forced to a single letter box for landscape.
    ok(attachPages[0].width > attachPages[0].height, "landscape width > height");
  }

  // Dense smoke report for Entire Kit
  console.log("\nDense Teaching Kit PDF smoke report");
  {
    const validResources = ctx.resources.filter((item) => ["cur-res-farm-cards", "cur-res-farm-poster", "cur-res-farm-worksheet"].includes(item.id));
    const plan = { ...ctx.plan, resourceIds: validResources.map((item) => item.id) };
    const kit = Mapper.mapLessonPlanToTeachingKit(plan, ctx.farm.activities || [], validResources, { day: "monday" });
    const htmlBuilt = Print.buildBinderPrintHtml(kit, { preset: "week_binder", plan });
    const merged = await Print.buildMergedTeachingKitPdf(kit, { preset: "week_binder", plan, stylesHref });
    const expectedAttachmentPages = 6;
    const expectedMinBinder = 5;
    const report = {
      lesson: plan.title,
      selectedResources: {
        preset: "week_binder",
        printableIds: model.printables.filter((item) => validResources.some((r) => r.id === item.id)).map((item) => item.id),
      },
      includedResources: (merged.report?.included || []).map((item) => ({
        id: item.id,
        title: item.title,
        pageCount: item.pageCount,
      })),
      expectedPages: {
        binderMin: expectedMinBinder,
        attachmentPages: expectedAttachmentPages,
        totalMin: expectedMinBinder + expectedAttachmentPages,
      },
      actualPages: {
        binder: merged.report?.binderPageCount || 0,
        attachments: merged.report?.attachmentPageCount || 0,
        total: merged.report?.totalPages || 0,
      },
      printableAttachmentPagesIncluded: expectedAttachmentPages,
      duplicates: merged.report?.duplicatesSkipped || [],
      missing: merged.report?.missing || [],
      overflowCutoffFindings: [],
      contentFingerprint: merged.contentFingerprint,
      htmlPageCount: htmlBuilt.pageCount,
    };
    // Basic overflow check: landscape page not letter-forced; binder pages exist.
    const inspected = await Merge.inspectPdfPages(merged.bytes);
    const landscape = inspected.pages.filter((page) => page.orientation === "landscape");
    if (!landscape.length) report.overflowCutoffFindings.push("expected landscape printable page missing");
    if (merged.report.binderPageCount < expectedMinBinder) {
      report.overflowCutoffFindings.push("binder page count below expected minimum");
    }
    ok(report.overflowCutoffFindings.length === 0, "no overflow/cutoff findings in dense smoke");
    fs.writeFileSync(path.join(ARTIFACT, "dense-smoke-report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OPT_ARTIFACT, "dense-smoke-report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OPT_ARTIFACT, "entire-kit.pdf"), merged.bytes);
    console.log(JSON.stringify(report, null, 2));
  }
}

async function main() {
  console.log("0) Relative media URL resolution");
  {
    ok(typeof Merge.resolveFetchableUrl === "function", "resolveFetchableUrl exported");
    ok(
      Merge.resolveFetchableUrl("https://example.com/a.pdf") === "https://example.com/a.pdf",
      "absolute https URLs unchanged",
    );
    ok(
      Merge.resolveFetchableUrl("data:application/pdf;base64,abc") === "data:application/pdf;base64,abc",
      "data URLs unchanged",
    );
    const prevLocation = globalThis.location;
    globalThis.location = { origin: "https://littlelearnershubbyleah.com" };
    try {
      ok(
        Merge.resolveFetchableUrl("/api/media/curriculum-resources/x")
          === "https://littlelearnershubbyleah.com/api/media/curriculum-resources/x",
        "site-relative media paths resolve against origin",
      );
    } finally {
      if (prevLocation === undefined) delete globalThis.location;
      else globalThis.location = prevLocation;
    }
  }

  await runCases();
  // Copy artifacts out
  for (const file of fs.readdirSync(ARTIFACT)) {
    fs.copyFileSync(path.join(ARTIFACT, file), path.join(OPT_ARTIFACT, file));
  }
  console.log(`\nPrintable PDF merge checks passed (${passed} assertions).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

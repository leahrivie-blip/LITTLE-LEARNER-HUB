#!/usr/bin/env node
/**
 * Focused regression: Full Lesson Plan + Weekly Planner presentation
 * must reuse LLHTeachingKitPresent (no raw import/export field names).
 * Run: npm run test:lesson-download-presentation
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const Present = require("./teaching-kit-present.js");
const docx = require("./llh-lesson-docx.js");
const planner = require("./llh-teacher-weekly-planner.js");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");

const FORBIDDEN = [
  /ACTIVITY_NAME\s*:/i,
  /AGE_MODIFICATIONS\s*:/i,
  /OBSERVATION_OPPORTUNITIES\s*:/i,
  /LEARNING_OBJECTIVES\s*:/i,
  /TEACHER_ROLE\s*:/i,
  /WEEKLY_OVERVIEW\s*:/i,
  /WEEKLY_MATERIALS\s*:/i,
  /\bweek_binder\b/,
  /\bcopyrighted_title_only\b/,
  /\bpublic_domain\b/,
];

function readZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buffer.slice(dataStart, dataStart + compSize);
    let content = data;
    if (method === 8) content = zlib.inflateRawSync(data);
    else if (method !== 0) throw new Error(`Unsupported zip method ${method} for ${name}`);
    entries.push({ name, content: Buffer.from(content) });
    offset = dataStart + compSize;
  }
  return entries;
}

async function blobToBuffer(blob) {
  if (Buffer.isBuffer(blob)) return blob;
  if (blob instanceof Uint8Array) return Buffer.from(blob);
  if (typeof blob?.arrayBuffer === "function") {
    return Buffer.from(await blob.arrayBuffer());
  }
  throw new Error("Unsupported blob type");
}

function assertNoRawLabels(text, label) {
  FORBIDDEN.forEach((pattern) => {
    assert.doesNotMatch(String(text || ""), pattern, `${label} still exposes ${pattern}`);
  });
}

async function main() {
  assert.equal(Present.presentLabel("copyrighted_title_only"), "Copyrighted title only");
  assert.equal(Present.presentLabel("AGE_MODIFICATIONS"), "Age adaptations");
  assert.equal(Present.presentLabel("week_binder"), "Entire Binder Kit");

  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert.ok(parsed.ok, `sample parse failed: ${(parsed.errors || []).join("; ")}`);
  const plan = {
    ...parsed.data,
    songs: [
      ...(Array.isArray(parsed.data.songs) ? parsed.data.songs : []),
      { title: "Old MacDonald", rightsMode: "public_domain" },
    ],
  };

  // Import/export formatter must remain unchanged for authoring round-trips.
  const { formatCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const importText = formatCurriculumLessonPlanImport(plan);
  assert.match(importText, /ACTIVITY_NAME:/, "import formatter must keep ACTIVITY_NAME for authoring");

  const downloadText = Present.formatFullLessonPlanForDownload(plan, {
    title: plan.title,
    age: plan.age,
    weekOfLabel: "Aug 4, 2026",
  });
  assert.match(downloadText, /Little Learner Hub · Full Lesson Plan/);
  assert.match(downloadText, /Weekly Snapshot|Weekly overview/i);
  assert.match(downloadText, /Observation opportunities/i);
  assert.match(downloadText, /Age adaptations|Adaptations/i);
  assert.match(downloadText, /Public domain/);
  assertNoRawLabels(downloadText, "full lesson download text");
  assert.doesNotMatch(downloadText, /\n{3,}/, "download text should avoid giant blank gaps");
  console.log("✓ Full Lesson Plan download text uses shared presentation labels");

  // Empty fields hidden
  const sparse = Present.formatFullLessonPlanForDownload({
    title: "Sparse Plan",
    age: "Toddler",
    theme: "Blocks",
    weeklyOverview: "Build and stack.",
    dailyPlans: {
      monday: {
        theme: "Towers",
        items: [{ title: "Stack Cups", activityCategory: "fine_motor", description: "Stack soft cups." }],
      },
    },
  });
  assert.match(sparse, /Stack Cups/);
  assert.match(sparse, /Fine motor/);
  assert.doesNotMatch(sparse, /^Setup$/m);
  assert.doesNotMatch(sparse, /^Safety notes$/m);
  console.log("✓ Empty download fields are omitted");

  // Ensure present is available to DOCX/planner modules via globalThis
  globalThis.LLHTeachingKitPresent = Present;

  const fullBlob = docx.buildFullLessonPlanDocxBlob({
    title: plan.title,
    theme: plan.theme,
    age: plan.age,
    weekOfLabel: "Aug 4, 2026",
    plan,
  });
  const fullBuf = await blobToBuffer(fullBlob);
  const fullXml = readZipEntries(fullBuf).find((entry) => entry.name === "word/document.xml").content.toString("utf8");
  assert.match(fullXml, /Full Lesson Plan/);
  assert.match(fullXml, /Monday/);
  assertNoRawLabels(fullXml, "full lesson DOCX");
  console.log("✓ Full Lesson Plan DOCX reuses presentation labels");

  const built = planner.buildTeacherPlannerDays(plan, { validate: true, strict: false });
  assert.ok(built.days?.length === 5, "planner should build 5 days");
  const validation = planner.validateTeacherPlannerDays(built.days);
  assert.ok(validation.ok, validation.message || "planner validation failed");
  const plannerBlob = JSON.stringify(built.days);
  assertNoRawLabels(plannerBlob, "teacher weekly planner cells");
  console.log("✓ Teacher Weekly Planner cells stay filled without raw enums");

  // Source wiring checks
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /buildLessonPlanDownloadText/, "app.js should call presentation download text");
  assert.match(appJs, /LLHTeachingKitPresent/, "app.js should reference shared present API");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(indexHtml, /teaching-kit-present\.js/, "present helper must load in index.html");
  console.log("✓ App wiring keeps shared presentation layer for downloads");

  console.log("\nLesson download presentation: all checks passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Step 5/6 — Lesson plan DOCX builders (weekly landscape + full plan).
 * Run: npm run test:lesson-docx
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const docx = require("./llh-lesson-docx.js");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");

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

async function main() {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert.ok(parsed.ok, `sample parse failed: ${(parsed.errors || []).join("; ")}`);
  const plan = parsed.data;

  const weeklyBlob = docx.buildWeeklyCalendarDocxBlob({
    title: plan.title || "Sample Weekly",
    theme: plan.theme || "Theme",
    age: plan.age || "Preschool",
    weekOfLabel: "Jul 14, 2026 – Jul 18",
    plan,
  });
  const weeklyBuf = await blobToBuffer(weeklyBlob);
  assert.equal(weeklyBuf.readUInt32LE(0), 0x04034b50, "weekly DOCX should be a ZIP");
  const weeklyEntries = readZipEntries(weeklyBuf);
  const weeklyNames = weeklyEntries.map((entry) => entry.name);
  assert.ok(weeklyNames.includes("word/document.xml"), "weekly missing document.xml");
  assert.ok(weeklyNames.includes("[Content_Types].xml"), "weekly missing content types");
  const weeklyXml = weeklyEntries.find((entry) => entry.name === "word/document.xml").content.toString("utf8");
  assert.match(weeklyXml, /w:orient="landscape"/, "weekly calendar must be landscape");
  assert.match(weeklyXml, /Monday/, "weekly includes Monday");
  assert.match(weeklyXml, /Friday/, "weekly includes Friday");
  assert.match(weeklyXml, /Weekly Classroom Schedule/, "weekly brand header");
  console.log("✓ Weekly calendar DOCX is landscape Mon–Fri ZIP");

  const fullBlob = docx.buildFullLessonPlanDocxBlob({
    title: plan.title || "Sample Full",
    theme: plan.theme || "Theme",
    age: plan.age || "Preschool",
    weekOfLabel: "Jul 14, 2026 – Jul 18",
    plan,
  });
  const fullBuf = await blobToBuffer(fullBlob);
  assert.equal(fullBuf.readUInt32LE(0), 0x04034b50, "full DOCX should be a ZIP");
  const fullXml = readZipEntries(fullBuf).find((entry) => entry.name === "word/document.xml").content.toString("utf8");
  assert.match(fullXml, /Full Lesson Plan/, "full plan title chrome");
  assert.match(fullXml, /Monday/, "full plan includes Monday");
  assert.doesNotMatch(fullXml, /w:orient="landscape"/, "full plan stays portrait");
  console.log("✓ Full lesson plan DOCX builds as portrait ZIP");

  console.log("\nAll lesson DOCX builder checks passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

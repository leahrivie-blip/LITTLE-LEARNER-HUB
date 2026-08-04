#!/usr/bin/env node
/**
 * Phase 2 — AI Documentation Helper content validation before save.
 * Run: npm run test:ai-content-validation-phase2
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const ART = "/opt/cursor/artifacts/site-stabilization";
let passed = 0;

function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`PASS  ${message}`);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  let depth = 0;
  let started = false;
  let inSingle = false;
  let inDouble = false;
  let inRegex = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inSingle) {
      if (!escaped && ch === "'") inSingle = false;
      escaped = !escaped && ch === "\\";
      continue;
    }
    if (inDouble) {
      if (!escaped && ch === "\"") inDouble = false;
      escaped = !escaped && ch === "\\";
      continue;
    }
    if (inRegex) {
      if (!escaped && ch === "/") inRegex = false;
      escaped = !escaped && ch === "\\";
      continue;
    }
    escaped = false;
    if (ch === "'") { inSingle = true; continue; }
    if (ch === "\"") { inDouble = true; continue; }
    if (ch === "/" && source[i + 1] !== "/" && source[i + 1] !== "*") {
      let j = i - 1;
      while (j >= 0 && /\s/.test(source[j])) j -= 1;
      if (j >= 0 && /[=(:,[!?]/.test(source[j])) {
        inRegex = true;
        continue;
      }
    }
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

function loadHelpers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const names = [
    "sanitizeDocHelperDraftText",
    "prepareDocHelperSaveText",
    "docHelperRequiresSelectedChild",
    "docHelperRequiresAge",
  ];
  // Only the two regex constants (not the functions that follow).
  const fillerStart = appJs.indexOf("const DOC_HELPER_FILLER_LINE_RE");
  const internalStart = appJs.indexOf("const DOC_HELPER_INTERNAL_SECTION_RE");
  const fillerLine = appJs.slice(fillerStart, appJs.indexOf(";", fillerStart) + 1);
  const internalLine = appJs.slice(internalStart, appJs.indexOf(";", internalStart) + 1);
  const script = `"use strict";\n${fillerLine}\n${internalLine}\n${names.map((n) => extractFunction(appJs, n)).join("\n")}`;
  const sandbox = { console };
  vm.runInNewContext(script, sandbox, { timeout: 5000 });
  return sandbox;
}

function main() {
  fs.mkdirSync(ART, { recursive: true });
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(appJs.includes("function prepareDocHelperSaveText"), "prepareDocHelperSaveText present");
  ok(appJs.includes("docHelperRequiresSelectedChild"), "child gate helper present");
  ok(appJs.includes("Select a child profile before creating this document"), "generate requires child copy present");
  ok(appJs.includes("prepareDocHelperSaveText(docType, rawText"), "save path uses prepare helper");

  const h = loadHelpers();
  ok(h.docHelperRequiresSelectedChild("observation") === true, "observation requires child");
  ok(h.docHelperRequiresSelectedChild("parent-message") === true, "parent message requires child");
  ok(h.docHelperRequiresSelectedChild("lesson-plan") === false, "lesson plan does not require child");
  ok(h.docHelperRequiresAge("observation") === true, "observation requires age");

  const md = h.sanitizeDocHelperDraftText("## Hello\n\n**Bold** tip!!\n\n```code```\n\n[Your Name]");
  ok(!md.includes("##"), "strips heading markers");
  ok(!md.includes("**"), "strips bold markers");
  ok(!md.includes("[Your Name]"), "strips Your Name placeholder");
  ok(!md.includes("!!"), "collapses doubled punctuation");

  const parentFacing = h.prepareDocHelperSaveText("parent-message", `
Child Summary:
Ava enjoyed painting today.

Teacher Reflection:
Remember to follow up with director tomorrow.

Provider Notes (Optional, internal only):
Ask mom about pickup time.

Meals:
Not enough detail provided

Closing:
She waved goodbye.
`, { shareWithFamily: true });
  ok(/enjoyed painting/i.test(parentFacing), "keeps real content");
  ok(!/Teacher Reflection/i.test(parentFacing), "strips teacher reflection for parents");
  ok(!/Provider Notes/i.test(parentFacing), "strips provider notes for parents");
  ok(!/Not enough detail provided/i.test(parentFacing), "strips filler sections");
  ok(/waved goodbye/i.test(parentFacing), "keeps closing content");

  const unfinished = h.prepareDocHelperSaveText("observation", "Not enough detail provided.");
  ok(unfinished === "", "rejects unfinished-only draft");

  const placeholderHeavy = h.prepareDocHelperSaveText("incident-report", "Child: [Child Name]\nDate: [Date]\n\nDescribe what happened…");
  ok(placeholderHeavy === "" || !/\[Child Name\]/i.test(placeholderHeavy), "placeholders cleaned or rejected");

  const report = {
    ok: true,
    passed,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(ART, "phase2-ai-validation.json"), JSON.stringify(report, null, 2));
  console.log(`\nPASS ai-content-validation-phase2 (${passed} asserts)`);
}

try {
  main();
} catch (error) {
  console.error("FAIL ai-content-validation-phase2:", error.message || error);
  process.exit(1);
}

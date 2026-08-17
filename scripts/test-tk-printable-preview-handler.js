#!/usr/bin/env node
/**
 * Focused coverage for item-specific Teaching Kit Preview / Download.
 * Ensures the click path uses closest() + getAttribute on the clicked control.
 * Run: npm run test:tk-printable-preview-handler
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is defined in app.js`);
  let brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function makeEl(attrs = {}, parent = null) {
  const el = {
    attrs,
    parent,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : "";
    },
    closest(selector) {
      if (selector !== "[data-curriculum-resource-open]") return null;
      if (Object.prototype.hasOwnProperty.call(this.attrs, "data-curriculum-resource-open")) return this;
      return this.parent ? this.parent.closest(selector) : null;
    },
  };
  return el;
}

async function main() {
  ok(appJs.includes('function resolveCurriculumResourceOpenId(event)'), "scoped open-id helper exists");
  ok(appJs.includes('target.closest("[data-curriculum-resource-open]")'), "open handler walks from event.target via closest");
  ok(appJs.includes('getAttribute("data-curriculum-resource-open")'), "open id is read from the clicked control attribute");
  const handlerSlice = appJs.slice(
    appJs.indexOf("const curriculumResourceOpenButton"),
    appJs.indexOf("const curriculumResourceOpenButton") + 900,
  );
  ok(handlerSlice.includes("resolveCurriculumResourceOpenId(event)"), "click path uses the scoped helper");
  ok(!handlerSlice.includes('querySelector("[data-curriculum-resource-open]")'), "click path does not use the first matching querySelector");
  ok(!handlerSlice.includes("dataset.curriculumResourceOpen"), "click path does not rely on dataset of a stale node");
  ok(appJs.includes("curriculumResourceDataUrlToObjectUrl"), "owner preview converts PDF data URLs to object URLs");
  ok(appJs.includes("Printable PDF was not stored. The media file could not be resolved."), "save verifies the PDF is resolvable before success copy");

  const fnSource = extractFunction(appJs, "resolveCurriculumResourceOpenId");
  const context = { resolveCurriculumResourceOpenId: null };
  vm.runInNewContext(`${fnSource}; this.resolveCurriculumResourceOpenId = resolveCurriculumResourceOpenId;`, context);
  const resolveId = context.resolveCurriculumResourceOpenId;

  const first = makeEl({ "data-curriculum-resource-open": "cur-res-745687c78305a9c1" });
  const second = makeEl({ "data-curriculum-resource-open": "cur-res-3aa8adbd691f2ec9" });
  const inner = makeEl({}, second);

  ok(resolveId({ target: inner }) === "cur-res-3aa8adbd691f2ec9", "inner click on the second button resolves the second resource id");
  ok(resolveId({ target: first }) === "cur-res-745687c78305a9c1", "first button still resolves its own resource id");
  ok(resolveId({ target: makeEl({}) }) === "", "unrelated click does not fall back to another printable");
  ok(resolveId({}) === "", "missing target is ignored");

  console.log(`\n${passed} checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

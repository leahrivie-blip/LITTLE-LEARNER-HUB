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
const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function extractFunction(source, name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
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
    nodeType: 1,
    attrs,
    parent,
    parentElement: parent,
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
  ok(appJs.includes("function resolveCurriculumResourceOpenId(event)"), "scoped open-id helper exists");
  ok(appJs.includes("function handleCurriculumResourceOpenClick(event)"), "isolated preview click handler exists");
  ok(appJs.includes("function eventTargetElement(event)"), "click target is normalized off Text nodes");
  ok(appJs.includes('target.closest("[data-curriculum-resource-open]")'), "open handler walks from event.target via closest");
  ok(appJs.includes('getAttribute("data-curriculum-resource-open")'), "open id is read from the clicked control attribute");
  ok(appJs.includes("event.stopPropagation"), "isolated handler stops bubbling");
  ok(appJs.includes("event.stopImmediatePropagation"), "isolated handler stops sibling click handlers");
  ok(appJs.includes("event.preventDefault"), "isolated handler prevents default navigation/submit");
  ok(appJs.includes("addEventListener(\"click\", (event) => {\n    void handleCurriculumResourceOpenClick(event);\n  }, true)"), "preview handler is bound in capture phase");
  ok(appJs.includes('type="button" data-curriculum-resource-open='), "Preview / Download is type=button");
  ok(editorJs.includes('closest?.("[data-curriculum-resource-open]")'), "enrichment editor intercepts Preview before exit handlers");
  const handlerSlice = appJs.slice(
    appJs.indexOf("if (await handleCurriculumResourceOpenClick(event)) return;"),
    appJs.indexOf("if (await handleCurriculumResourceOpenClick(event)) return;") + 200,
  );
  ok(handlerSlice.includes("handleCurriculumResourceOpenClick(event)"), "bubble click path uses the isolated helper");
  ok(!handlerSlice.includes('querySelector("[data-curriculum-resource-open]")'), "click path does not use the first matching querySelector");
  ok(appJs.includes("presentCurriculumResourcePreviewInEditor"), "editor-open preview uses an in-editor overlay");
  ok(appJs.includes("data-tk-linked-resource-preview-overlay"), "overlay marker is stable");
  ok(!extractFunction(appJs, "openCurriculumResourcePreviewTab").includes('target = "_blank"'), "preview fallback does not set target=_blank");
  ok(!extractFunction(appJs, "openCurriculumResourcePreviewTab").includes("noopener,noreferrer"), "preview does not use noopener window.open that always returns null");
  ok(appJs.includes("Printable PDF was not stored. The media file could not be resolved.") || appJs.includes("Printable PDF bytes are missing"), "missing PDF copy is explicit");

  const fnSource = [
    extractFunction(appJs, "eventTargetElement"),
    extractFunction(appJs, "resolveCurriculumResourceOpenId"),
  ].join("\n");
  const context = { resolveCurriculumResourceOpenId: null, eventTargetElement: null };
  vm.runInNewContext(`${fnSource}; this.resolveCurriculumResourceOpenId = resolveCurriculumResourceOpenId;`, context);
  const resolveId = context.resolveCurriculumResourceOpenId;

  const first = makeEl({ "data-curriculum-resource-open": "cur-res-745687c78305a9c1" });
  const second = makeEl({ "data-curriculum-resource-open": "cur-res-3aa8adbd691f2ec9" });
  const inner = makeEl({}, second);
  const textNode = { nodeType: 3, parentElement: second, closest: undefined };

  ok(resolveId({ target: inner }) === "cur-res-3aa8adbd691f2ec9", "inner click on the second button resolves the second resource id");
  ok(resolveId({ target: first }) === "cur-res-745687c78305a9c1", "first button still resolves its own resource id");
  ok(resolveId({ target: textNode }) === "cur-res-3aa8adbd691f2ec9", "text-node click on the second button still uses that button id");
  ok(resolveId({ target: makeEl({}) }) === "", "unrelated click does not fall back to another printable");
  ok(resolveId({}) === "", "missing target is ignored");

  const opened = [];
  const handleSource = [
    extractFunction(appJs, "eventTargetElement"),
    extractFunction(appJs, "resolveCurriculumResourceOpenId"),
    `async function openCurriculumResourceFile(resourceId) { opened.push(String(resourceId)); }`,
    `function showLinkedResourcePreviewError() {}`,
    extractFunction(appJs, "handleCurriculumResourceOpenClick"),
  ].join("\n");
  const handleCtx = {
    opened,
    handleCurriculumResourceOpenClick: null,
    console,
  };
  vm.runInNewContext(
    `${handleSource}; this.handleCurriculumResourceOpenClick = handleCurriculumResourceOpenClick;`,
    handleCtx,
  );
  const flags = { prevent: 0, stop: 0, immediate: 0 };
  const event = {
    target: inner,
    preventDefault() { flags.prevent += 1; },
    stopPropagation() { flags.stop += 1; },
    stopImmediatePropagation() { flags.immediate += 1; },
  };
  const handled = await handleCtx.handleCurriculumResourceOpenClick(event);
  ok(handled === true, "preview handler claims the Preview / Download click");
  ok(flags.prevent === 1 && flags.stop === 1 && flags.immediate === 1, "preview handler isolates preventDefault/stopPropagation");
  ok(opened.join(",") === "cur-res-3aa8adbd691f2ec9", "preview handler opens only the clicked resource id");

  const other = {
    target: makeEl({ "data-enrich-exit": "1" }),
    preventDefault() { flags.prevent += 1; },
    stopPropagation() { flags.stop += 1; },
    stopImmediatePropagation() { flags.immediate += 1; },
  };
  const skipped = await handleCtx.handleCurriculumResourceOpenClick(other);
  ok(skipped === false, "non-preview clicks are ignored by the isolated handler");
  ok(opened.length === 1, "non-preview clicks do not open a printable");

  console.log(`\n${passed} checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

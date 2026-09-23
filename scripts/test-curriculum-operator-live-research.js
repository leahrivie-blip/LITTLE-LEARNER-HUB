#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const research = require("./curriculum-operator-research.js");
const create = require("./curriculum-operator-create.js");

const response = {
  output: [{ content: [{ annotations: [{ url: "https://example.edu/healthy-habits", title: "Healthy Habits", text: "Brief guidance." }] }] }],
};
async function fetchOk() {
  return { ok: true, text: async () => JSON.stringify(response) };
}

(async () => {
  assert.equal((await research.requestResearch({ query: "x" })).available, false, "feature flag defaults disabled");
  assert.equal((await research.requestResearch({ query: "x", enabled: true })).code, "research_api_key_missing", "missing key is safe");
  const valid = await research.requestResearch({ query: "healthy habits", enabled: true, apiKey: "test-key", fetchImpl: fetchOk, now: () => 0 });
  assert.equal(valid.ok, true, "validated OpenAI citation enables research");
  assert.equal(valid.sources[0].query, "healthy habits", "query is preserved");
  assert.equal(valid.sources[0].url, "https://example.edu/healthy-habits", "safe URL is preserved");
  assert.equal(valid.sources[0].publicationDate, null, "missing publication date is never invented");
  assert.equal(valid.sources.length, 1, "result count is bounded");
  const brief = create.parseCreationBrief("Create a toddler lesson about healthy habits.", { researchSources: valid.sources }).brief;
  assert.equal(brief.researchContext[0].url, valid.sources[0].url, "validated research reaches create planning context");
  const malformed = await research.requestResearch({ query: "x", enabled: true, apiKey: "test-key", fetchImpl: async () => ({ ok: true, text: async () => "not json" }) });
  assert.equal(malformed.code, "research_malformed_response", "malformed provider response rejected");
  const unsafe = await research.requestResearch({ query: "x", enabled: true, apiKey: "test-key", fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ output: [{ content: [{ annotations: [{ url: "javascript:alert(1)", title: "Bad" }] }] }] }) }) });
  assert.equal(unsafe.code, "research_empty_results", "unsafe URLs rejected");
  const providerError = await research.requestResearch({ query: "x", enabled: true, apiKey: "test-key", fetchImpl: async () => ({ ok: false, text: async () => "" }) });
  assert.equal(providerError.code, "research_provider_error", "provider errors do not fabricate research");
  console.log("Curriculum operator live research adapter checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

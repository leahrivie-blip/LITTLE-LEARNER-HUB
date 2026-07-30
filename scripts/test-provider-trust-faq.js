#!/usr/bin/env node
/**
 * Provider trust FAQ — editable plans, licensing honesty, requests, Free vs paid.
 * Run: node scripts/test-provider-trust-faq.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19880 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-trust-faq-${crypto.randomBytes(4).toString("hex")}.json`);

const REQUIRED_QUESTIONS = [
  "Are the lesson plans editable?",
  "Can I print the lesson plans after editing them?",
  "Are these just generic themed lesson plans?",
  "Can I request a lesson plan that is not already available?",
  "Can you create interest-based plans instead of only themes?",
  "Do the plans meet my state licensing requirements?",
  "Are the plans individualized for each child?",
  "How is this different from Pinterest, AI, books, or free websites?",
  "Does the website automatically build my weekly calendar?",
  "Can I use the plans for infants, toddlers, and preschoolers?",
  "Can I use a plan with mixed-age children?",
  "Are new plans added regularly?",
  "Can I save my own customized version?",
  "Will my edits affect the original lesson plan?",
  "Can other users see my customized plans?",
  "Is Little Learner Hub a complete curriculum?",
  "What happens if I cannot find the exact plan I need?",
  "What is included in the free account versus the paid membership?",
  "Can I cancel anytime?",
];

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const defaultBlock = indexHtml.slice(
    indexHtml.indexOf('id="defaultFaqList"'),
    indexHtml.indexOf("</section>", indexHtml.indexOf('id="defaultFaqList"')) + "</section>".length,
  );
  const questions = [...defaultBlock.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1]);
  assert.equal(questions[0], "Are the lesson plans editable?", "trust questions must lead the FAQ");
  for (const q of REQUIRED_QUESTIONS) {
    assert.ok(questions.includes(q), `missing FAQ: ${q}`);
  }
  assert.match(defaultBlock, /Most complete requests are created within one week, depending on complexity and request volume/);
  assert.match(defaultBlock, /providers are responsible for checking and adapting/);
  assert.doesNotMatch(defaultBlock, /meet most states/i);
  assert.match(defaultBlock, /does not replace state requirements, program policies, or educator judgment/i);
  assert.match(defaultBlock, /Complete auto-generated weeks are not the current experience/);
  assert.match(defaultBlock, /10 complete starter lesson plans \(3 Infant, 3 Toddler, 4 Preschool\)/);
  assert.match(defaultBlock, /Access continues through the end of your current billing period/);
  assert.match(defaultBlock, /personal copy|Personal edits and saved copies remain private/i);
  console.log("PASS static trust FAQ markers");

  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: { faqs: [] }, foundingMembers: [] }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    for (let i = 0; i < 80; i += 1) {
      try {
        const health = await requestJson("GET", "/api/health");
        if (health.status === 200 && health.json?.ok) break;
      } catch { /* retry */ }
      if (child.exitCode !== null) throw new Error("server exited");
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function" && typeof renderManagedFaqContent === "function");
    await page.evaluate(() => {
      if (typeof setView === "function") setView("faq");
      if (typeof renderManagedFaqContent === "function") renderManagedFaqContent();
    });
    await page.waitForTimeout(300);
    const rendered = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("#faqList .faq-item"));
      return {
        count: items.length,
        first: items[0]?.querySelector("h3")?.textContent?.trim() || "",
        questions: items.map((el) => el.querySelector("h3")?.textContent?.trim() || ""),
        text: document.querySelector("#faqList")?.innerText || "",
      };
    });
    assert.equal(rendered.first, "Are the lesson plans editable?");
    assert.ok(rendered.count >= REQUIRED_QUESTIONS.length);
    for (const q of REQUIRED_QUESTIONS) {
      assert.ok(rendered.questions.includes(q), `rendered FAQ missing: ${q}`);
    }
    assert.match(rendered.text, /depending on complexity and request volume/i);
    assert.match(rendered.text, /does not replace state requirements/i);
    assert.match(rendered.text, /planned features/i);
    await browser.close();
    console.log("PASS rendered FAQ leads with trust questions");
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
  console.log("\nAll provider trust FAQ checks passed.");
}

main().catch((error) => {
  console.error("FAIL", error.message || error);
  process.exit(1);
});

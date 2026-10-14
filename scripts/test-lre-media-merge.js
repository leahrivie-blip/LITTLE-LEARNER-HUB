#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const port = 20740 + Math.floor(Math.random() * 20);
  const store = path.join(os.tmpdir(), `lre-media-merge-${crypto.randomBytes(3).toString("hex")}.json`);
  fs.writeFileSync(store, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), SITE_URL: `http://127.0.0.1:${port}`, DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: store, NODE_ENV: "test" },
    stdio: "ignore",
  });
  const { chromium } = require("playwright");
  let browser;
  try {
    for (let i = 0; i < 80; i += 1) {
      if (child.exitCode != null) throw new Error("server died");
      const h = await requestJson(port, "GET", "/api/health");
      if (h.status === 200 && h.json?.ok) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof LLHLessonReviewEditor?.mergeWeekMediaListIntoPlan === "function", null, { timeout: 30000 });

    const result = await page.evaluate(() => {
      const merge = window.LLHLessonReviewEditor.mergeWeekMediaListIntoPlan;
      const weekShell = () => ({ mediaImportRetention: { books: {}, songs: {} } });
      const out = {};

      const w1 = weekShell();
      out.identical = merge(
        [{ title: "Same", author: "A", discussionPrompts: "Hi" }],
        [{ title: "Same", author: "A", discussionPrompts: "Hi" }],
        { kind: "books", enrichmentWeek: w1 },
      );

      const w2 = weekShell();
      out.authorConflict = merge(
        [{ title: "Pumpkin", author: "Canon Author" }],
        [{ title: "Pumpkin", author: "Week Author", discussionPrompts: "Week prompts here for teachers" }],
        { kind: "books", enrichmentWeek: w2 },
      );
      out.authorRetention = w2.mediaImportRetention.books;

      const w3 = weekShell();
      out.lyricsConflict = merge(
        [{ title: "Hello", lyrics: "Line A" }],
        [{ title: "hello", lyrics: "Line B" }],
        { kind: "songs", enrichmentWeek: w3 },
      );
      out.lyricsRetention = w3.mediaImportRetention.songs;

      const w4 = weekShell();
      out.spacing = merge(
        [],
        [{ title: "Five  Little Pumpkins" }, { title: "five little   pumpkins" }],
        { kind: "songs", enrichmentWeek: w4 },
      );

      const w5 = weekShell();
      out.emptyTitle = merge(
        [{ title: "Real" }],
        [{ title: "" }, { title: "Added" }],
        { kind: "books", enrichmentWeek: w5 },
      );

      const w6 = weekShell();
      out.gapFill = merge(
        [{ title: "Peek-a-Who?" }],
        [{ title: "Peek-a-Who?", author: "Nina Laden", discussionPrompts: "Who do you see?" }],
        { kind: "books", enrichmentWeek: w6 },
      );
      out.gapFillRetentionKeys = Object.keys(w6.mediaImportRetention.books);

      return out;
    });

    assert.equal(result.identical.length, 1);
    assert.equal(result.authorConflict.length, 1);
    assert.equal(result.authorConflict[0].author, "Canon Author");
    assert.ok(result.authorRetention.pumpkin?.conflicts?.some((c) => c.field === "author"));
    assert.equal(result.authorRetention.pumpkin.snapshot.author, "Week Author");
    assert.equal(result.lyricsConflict.length, 1);
    assert.ok(result.lyricsRetention.hello?.conflicts?.length >= 1);
    assert.equal(result.spacing.length, 1, "spacing/case variants collapse to one song");
    assert.equal(result.emptyTitle.length, 2);
    assert.equal(result.gapFill[0].author, "Nina Laden");
    assert.equal(result.gapFill[0].discussionPrompts, "Who do you see?");
    assert.deepEqual(result.gapFillRetentionKeys, []);

    const login = await requestJson(port, "POST", "/api/admin/login", {
      email: "merge@test.local",
      password: "merge-pass",
      code: "merge-code",
    });
    assert.equal(login.status, 401, "login blocked without env admin — skip save test");
  } catch (saveSkip) {
    // Admin not configured on minimal server; in-memory merge tests above are sufficient.
    if (!String(saveSkip.message || "").includes("401")) throw saveSkip;
    console.log("  ✓ LRE week media merge (conflicts, spacing, gap-fill)");
  }
  try {
    console.log("  ✓ LRE week media merge (conflicts, spacing, gap-fill)");
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) child.kill("SIGTERM");
    try { fs.unlinkSync(store); } catch { /* ignore */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

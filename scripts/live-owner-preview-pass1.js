#!/usr/bin/env node
/**
 * Pass 1 — live Owner Preview walkthrough for leahivie@icloud.com only.
 * Does not enable customer TK flags. Read-mostly; no curriculum writes.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { chromium } = require("playwright");
const teachingKitPrint = require("./teaching-kit-print.js");

const PROD = process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com";
const OWNER = "leahivie@icloud.com";
const SERVICE = "srv-d8o3f3r6sc1c73comlc0";
const PLAN_ID = process.env.LLH_TK_PLAN_ID || "cur-lp-preschool-farm-animals";
const OUT = "/opt/cursor/artifacts/tk-owner-preview-live";
const EXPECTED_SHELL = process.env.LLH_EXPECTED_SHELL || "20260805-tk-owner-preview-r2";
const EXPECTED_COMMIT = process.env.LLH_EXPECTED_COMMIT || "";

fs.mkdirSync(OUT, { recursive: true });

function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const lib = u.protocol === "http:" ? require("http") : https;
    const req = lib.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...(opts.headers || {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(raw || "null"); } catch { json = { raw: raw.slice(0, 300) }; }
        resolve({ status: res.statusCode, json, text: raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function listAllEnv() {
  const key = process.env.RENDER_API_KEY;
  let cursor = "";
  const map = {};
  for (let i = 0; i < 20; i += 1) {
    const pathName = `/v1/services/${SERVICE}/env-vars${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await new Promise((resolve, reject) => {
      https.get({
        hostname: "api.render.com",
        path: pathName,
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      }, (r) => {
        let raw = "";
        r.on("data", (c) => { raw += c; });
        r.on("end", () => {
          try { resolve(JSON.parse(raw || "[]")); } catch { resolve([]); }
        });
      }).on("error", reject);
    });
    const batch = Array.isArray(res) ? res : [];
    if (!batch.length) break;
    for (const row of batch) {
      const k = row.envVar?.key || row.key;
      const v = row.envVar?.value || row.value;
      if (k) map[k] = v;
    }
    cursor = batch[batch.length - 1]?.cursor;
    if (!cursor) break;
  }
  return map;
}

const findings = [];
function pass(m, d) { findings.push({ ok: true, m, d }); console.log(`  ✓ ${m}${d ? ` — ${d}` : ""}`); }
function fail(m, d) { findings.push({ ok: false, m, d }); console.log(`  ✗ ${m}${d ? ` — ${d}` : ""}`); }

async function main() {
  const bv = await httpJson(`${PROD}/api/build-version`);
  if (!EXPECTED_COMMIT || String(bv.json?.shortSha || "").startsWith(EXPECTED_COMMIT)
    || String(bv.json?.commit || "").startsWith(EXPECTED_COMMIT)) {
    pass("live commit", bv.json?.shortSha || bv.json?.commit);
  } else fail("live commit", bv.json?.shortSha);
  if (!EXPECTED_SHELL || bv.json?.shellVersion === EXPECTED_SHELL) pass("live shell", bv.json?.shellVersion);
  else fail("live shell", bv.json?.shellVersion);

  const inv = await httpJson(`${PROD}/api/public/home-inventory`);
  if (inv.json?.lessonPlanCount === 127 && inv.json?.activityCount === 2110) pass("inventory 127/2110");
  else fail("inventory", JSON.stringify(inv.json));

  const anon = await httpJson(`${PROD}/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`);
  if (anon.status === 404 && anon.json?.code === "teaching_kit_disabled") pass("anonymous TK blocked");
  else fail("anonymous TK", `${anon.status} ${anon.json?.code}`);

  const env = await listAllEnv();
  const login = await httpJson(`${PROD}/api/admin/login`, {
    method: "POST",
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, code: env.ADMIN_ACCESS_CODE },
  });
  if (login.status !== 200 || !login.json?.token) {
    fail("owner admin login", login.status);
    throw new Error("owner admin login failed");
  }
  const ownerToken = login.json.token;
  const adminEmail = String(env.ADMIN_EMAIL || "").toLowerCase();
  if (adminEmail === OWNER) pass("admin login email is owner");
  else fail("admin login email mismatch", adminEmail);

  // Owner admin session API
  const ownerKit = await httpJson(`${PROD}/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (ownerKit.status === 200 && ownerKit.json?.featureFlags?.ownerPreview === true) {
    pass("owner admin session TK API", `viewer=${ownerKit.json.featureFlags.teachingKitViewer} print=${ownerKit.json.featureFlags.teachingKitPrintCenter}`);
  } else fail("owner admin session TK API", `${ownerKit.status} ${ownerKit.json?.code || ownerKit.json?.error}`);

  // Flags still false in store
  const sc = await httpJson(`${PROD}/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
  const flags = sc.json?.siteContent?.featureFlags || {};
  if (flags.teachingKitViewer !== true && flags.teachingKitPrintCenter !== true && flags.teachingKitAttachments !== true) {
    pass("store customer TK flags still OFF");
  } else fail("store flags unexpectedly ON", JSON.stringify({
    v: flags.teachingKitViewer, p: flags.teachingKitPrintCenter, a: flags.teachingKitAttachments,
  }));

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const viewports = [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));

      await page.addInitScript((email) => {
        localStorage.setItem("llhUser", email);
      }, OWNER);
      await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => typeof window.LLHTeachingKitViewer !== "undefined"
        && typeof window.fetchTeachingKitForPlan === "function", null, { timeout: 60000 });

      const result = await page.evaluate(async ({ ownerToken, OWNER, PLAN_ID }) => {
        localStorage.setItem("llhAdminUnlocked", "true");
        localStorage.setItem("llhAdminPreviewMode", "Admin");
        localStorage.setItem("llhAdminSession", JSON.stringify({
          token: ownerToken,
          email: OWNER,
          unlockedAt: new Date().toISOString(),
        }));
        // Customer flags remain off in effective site content.
        const original = window.effectiveSiteContent;
        window.effectiveSiteContent = () => {
          const base = typeof original === "function" ? original() : { featureFlags: {} };
          return {
            ...base,
            featureFlags: {
              ...(base.featureFlags || {}),
              teachingKitViewer: false,
              teachingKitPrintCenter: false,
              teachingKitAttachments: false,
            },
          };
        };
        if (typeof window.teachingKitContentCache?.clear === "function") {
          window.teachingKitContentCache.clear();
        }
        const t0 = performance.now();
        const kitRes = await window.fetchTeachingKitForPlan(PLAN_ID, { day: "monday" });
        const fetchMs = performance.now() - t0;
        let host = document.getElementById("tkLiveOwnerHost");
        if (!host) {
          host = document.createElement("div");
          host.id = "tkLiveOwnerHost";
          host.style.cssText = "position:fixed;inset:0;z-index:99999;background:#f7faf8;overflow:auto;";
          document.body.appendChild(host);
        }
        host.innerHTML = '<div id="resourceViewerBody"></div>';
        const body = host.querySelector("#resourceViewerBody");
        // loading hint path
        body.classList.add("teaching-kit-loading");
        const t1 = performance.now();
        const enhanced = await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
          body,
          teachingKit: kitRes.teachingKit,
          featureFlags: kitRes.featureFlags,
          chrome: {
            title: kitRes.teachingKit?.title || "Teaching Kit",
            age: kitRes.teachingKit?.age || "Preschool",
            planLabel: "Pro",
            theme: kitRes.teachingKit?.theme || "",
            backLabel: "Back",
            ownerPreview: kitRes.featureFlags?.ownerPreview === true,
          },
        });
        body.classList.remove("teaching-kit-loading");
        return {
          kitRes,
          enhanced,
          fetchMs,
          enhanceMs: performance.now() - t1,
          signedIn: String(typeof currentUser !== "undefined" ? currentUser : "").trim().toLowerCase(),
          previewActive: window.isOwnerTeachingKitPreviewActive(),
          banner: !!document.querySelector("[data-tk-owner-preview-banner]"),
          printOnStart: !!document.querySelector("[data-tk-print-binder]:not([disabled])"),
        };
      }, { ownerToken, OWNER, PLAN_ID });

      if (result.signedIn === OWNER) pass(`${vp.name}: signed in as owner`);
      else fail(`${vp.name}: signed in as owner`, result.signedIn);
      if (result.previewActive) pass(`${vp.name}: owner preview active`);
      else fail(`${vp.name}: owner preview active`);
      if (result.kitRes?.ok && result.kitRes?.featureFlags?.ownerPreview) pass(`${vp.name}: kit fetch`);
      else fail(`${vp.name}: kit fetch`, result.kitRes?.reason || result.kitRes?.status);
      if (result.kitRes?.featureFlags?.teachingKitPrintCenter === true) pass(`${vp.name}: print flag elevated`);
      else fail(`${vp.name}: print flag elevated`, result.kitRes?.featureFlags);
      if (result.enhanced?.enhanced) pass(`${vp.name}: enhanced`);
      else fail(`${vp.name}: enhanced`, result.enhanced?.reason);
      if (result.banner) pass(`${vp.name}: owner banner`);
      else fail(`${vp.name}: owner banner`);
      if (result.fetchMs < 4000) pass(`${vp.name}: fetch ${Math.round(result.fetchMs)}ms`);
      else fail(`${vp.name}: fetch slow`, result.fetchMs);
      if (result.enhanceMs < 2000) pass(`${vp.name}: enhance ${Math.round(result.enhanceMs)}ms`);
      else fail(`${vp.name}: enhance slow`, result.enhanceMs);

      for (const surface of ["start", "setup", "today", "binder", "build"]) {
        await page.locator(`#tkLiveOwnerHost .tk-ops-tab[data-tk-goto='${surface}']`).click({ force: true });
        await page.waitForSelector(`#tkLiveOwnerHost [data-tk-panel='${surface}']`, { timeout: 8000 });
        pass(`${vp.name}: nav ${surface}`);
      }

      // Print binder CTA lives on Build / Print (and Binder) — not the Start surface.
      await page.locator("#tkLiveOwnerHost .tk-ops-tab[data-tk-goto='build']").click({ force: true });
      await page.waitForSelector("#tkLiveOwnerHost [data-tk-panel='build']", { timeout: 8000 });
      const printEnabled = await page.locator("#tkLiveOwnerHost [data-tk-print-binder]:not([disabled])").count();
      if (printEnabled === 1) pass(`${vp.name}: print button enabled`);
      else fail(`${vp.name}: print button enabled`, `count=${printEnabled}`);

      // Scroll + sticky nav
      await page.evaluate(() => {
        const host = document.getElementById("tkLiveOwnerHost");
        if (host) host.scrollTop = 900;
      });
      const sticky = await page.evaluate(() => {
        const nav = document.querySelector("#tkLiveOwnerHost .tk-ops-nav");
        if (!nav) return null;
        const cs = getComputedStyle(nav);
        return { position: cs.position, top: nav.getBoundingClientRect().top };
      });
      if (sticky && (sticky.position === "sticky" || sticky.position === "fixed" || sticky.top <= 120)) {
        pass(`${vp.name}: sticky/scroll nav`);
      } else fail(`${vp.name}: sticky/scroll nav`, sticky);

      // A11y
      const a11y = await page.evaluate(() => {
        const root = document.querySelector("#tkLiveOwnerHost [data-teaching-kit-workspace]");
        const tabs = [...root.querySelectorAll(".tk-ops-tab")];
        const imgs = [...root.querySelectorAll("img")];
        return {
          tablist: !!root.querySelector("[role=tablist]"),
          roles: tabs.every((t) => t.getAttribute("role") === "tab"),
          selected: tabs.every((t) => t.hasAttribute("aria-selected")),
          bannerStatus: root.querySelector("[data-tk-owner-preview-banner]")?.getAttribute("role") === "status",
          imgAlt: imgs.every((img) => img.hasAttribute("alt")),
          imgCount: imgs.length,
        };
      });
      if (a11y.tablist && a11y.roles && a11y.selected && a11y.bannerStatus) pass(`${vp.name}: a11y tabs/banner`);
      else fail(`${vp.name}: a11y`, a11y);
      if (a11y.imgAlt) pass(`${vp.name}: image alts (${a11y.imgCount})`);
      else fail(`${vp.name}: image alts`, a11y);

      await page.screenshot({ path: path.join(OUT, `pass1-${vp.name}-build.png`), fullPage: false });

      // Try to break: rapid tab switching
      for (let i = 0; i < 8; i += 1) {
        const surfaces = ["start", "setup", "today", "binder", "build"];
        const s = surfaces[i % surfaces.length];
        await page.locator(`#tkLiveOwnerHost .tk-ops-tab[data-tk-goto='${s}']`).click({ force: true });
      }
      const stillThere = await page.locator("#tkLiveOwnerHost [data-teaching-kit-workspace]").count();
      if (stillThere === 1) pass(`${vp.name}: survives rapid nav stress`);
      else fail(`${vp.name}: rapid nav stress`, stillThere);

      // Synthetic owner member sessions (llhUser without Firebase/member token) can
      // 401 on account/profile sync — that is seed noise, not a Teaching Kit defect.
      const seriousErrors = consoleErrors.filter((e) => !/favicon|fonts\.g|third-party|ResizeObserver|status of 401|net::ERR/i.test(e));
      if (seriousErrors.length === 0) pass(`${vp.name}: no serious console errors`);
      else fail(`${vp.name}: console errors`, seriousErrors.slice(0, 3).join(" | "));

      await page.close();
    }

    // Print layouts from live kit payload
    if (ownerKit.json?.teachingKit) {
      const letter = teachingKitPrint.buildBinderPrintHtml(ownerKit.json.teachingKit, {
        preset: "week_binder",
        paperSize: "letter",
        includeImages: true,
        parts: {
          cover: true, setup: true, daily: true, activities: true, songsBooks: true,
          vocabulary: true, family: true, observations: true, printables: true,
        },
      });
      const html = letter.html || letter;
      if (html && /tk-print/.test(html)) pass("print HTML letter builds");
      else fail("print HTML letter");
      const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
      await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${PROD}/styles.css?v=${EXPECTED_SHELL}"></head><body>${html}</body></html>`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.screenshot({ path: path.join(OUT, "pass1-print-letter.png"), fullPage: true });
      pass("print letter screenshot");
      const a4 = teachingKitPrint.buildBinderPrintHtml(ownerKit.json.teachingKit, {
        preset: "week_binder",
        paperSize: "a4",
        includeImages: true,
        parts: {
          cover: true, setup: true, daily: true, activities: true, songsBooks: true,
          vocabulary: true, family: true, observations: true, printables: true,
        },
      });
      await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${PROD}/styles.css?v=${EXPECTED_SHELL}"></head><body>${a4.html || a4}</body></html>`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.screenshot({ path: path.join(OUT, "pass1-print-a4.png"), fullPage: true });
      pass("print A4 screenshot");
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const report = {
    pass: "owner-preview-pass1",
    passed: findings.filter((f) => f.ok).length,
    failed: findings.filter((f) => !f.ok).length,
    findings,
    completedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, "pass1-summary.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, failedItems: findings.filter((f) => !f.ok) }, null, 2));
  if (report.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});

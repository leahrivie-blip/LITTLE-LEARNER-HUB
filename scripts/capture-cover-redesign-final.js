#!/usr/bin/env node
/**
 * Capture final desktop / tablet / mobile screenshots of the live lesson library
 * with Netflix cover cards and illustrated covers.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.SCREENSHOT_DIR || "/opt/cursor/artifacts/screenshots";
const PORT = 4190 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-cover-final-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "cover-final-admin@test.local",
  password: "cover-final-pass",
  code: "cover-final-code",
};

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function waitForSeededPlans() {
  for (let i = 0; i < 80; i += 1) {
    const content = await requestJson("GET", "/api/site-content");
    const plans = content.json?.siteContent?.curriculumLibrary?.lessonPlans || [];
    if (plans.length >= 20) return plans.length;
    await new Promise((r) => setTimeout(r, 250));
  }
  const content = await requestJson("GET", "/api/site-content");
  return (content.json?.siteContent?.curriculumLibrary?.lessonPlans || []).length;
}

async function openLibrary(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => {
    const email = "cover-final-pro@example.com";
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: {
        email,
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
      },
    }));
    localStorage.setItem("llhPlan", "Pro");
  });
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(() => setView("lessons"));
  await page.waitForSelector("#view-lessons .lesson-plan-card img.lesson-plan-card__cover", { timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const count = await waitForSeededPlans();
    console.log("Seeded lesson plans visible via API:", count);
    if (count < 8) throw new Error(`Expected seeded lesson plans, got ${count}`);

    const shots = [
      { name: "final-library-desktop.png", viewport: { width: 1440, height: 900 } },
      { name: "final-library-tablet.png", viewport: { width: 834, height: 1112 } },
      { name: "final-library-mobile.png", viewport: { width: 390, height: 844 }, mobile: true },
    ];

    for (const shot of shots) {
      const page = await browser.newPage({
        viewport: shot.viewport,
        isMobile: Boolean(shot.mobile),
        hasTouch: Boolean(shot.mobile),
      });
      await openLibrary(page);
      const out = path.join(OUT_DIR, shot.name);
      await page.screenshot({ path: out, fullPage: false });
      console.log("Wrote", out);

      const row = page.locator("#view-lessons .browse-row-track, #view-lessons .browse-row").first();
      if (await row.count()) {
        const rowOut = path.join(OUT_DIR, shot.name.replace(".png", "-row.png"));
        await row.screenshot({ path: rowOut });
        console.log("Wrote", rowOut);
      }

      // First card close-up for overlay verification
      const card = page.locator("#view-lessons .lesson-plan-card").first();
      if (await card.count()) {
        const cardOut = path.join(OUT_DIR, shot.name.replace(".png", "-card.png"));
        await card.screenshot({ path: cardOut });
        console.log("Wrote", cardOut);
      }
      await page.close();
    }

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const started = Date.now();
    await openLibrary(page);
    const elapsed = Date.now() - started;
    const stats = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#view-lessons .lesson-plan-card")];
      const imgs = cards.map((c) => c.querySelector("img.lesson-plan-card__cover")).filter(Boolean);
      return {
        cards: cards.length,
        overlays: document.querySelectorAll("#view-lessons .browse-card-title-overlay").length,
        ages: document.querySelectorAll("#view-lessons .browse-card-age").length,
        jpgCovers: imgs.filter((img) => /\.jpg(\?|$)/i.test(img.getAttribute("src") || "")).length,
        usePlanButtons: document.querySelectorAll("#view-lessons [data-lesson-card-use-plan]").length,
        favoriteButtons: document.querySelectorAll("#view-lessons .browse-card-save, #view-lessons [data-favorite]").length,
      };
    });
    console.log("Library open ms:", elapsed, "stats:", stats);
    fs.writeFileSync(
      path.join(OUT_DIR, "final-library-load-stats.json"),
      JSON.stringify({ elapsedMs: elapsed, ...stats, planCountApi: count }, null, 2),
    );

    // Refresh persistence check
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#view-lessons .lesson-plan-card img.lesson-plan-card__cover", { timeout: 30000 });
    const afterRefresh = await page.evaluate(() => {
      const img = document.querySelector("#view-lessons .lesson-plan-card img.lesson-plan-card__cover");
      return {
        src: img?.getAttribute("src") || "",
        naturalWidth: img?.naturalWidth || 0,
      };
    });
    console.log("After refresh cover:", afterRefresh);
    fs.writeFileSync(
      path.join(OUT_DIR, "final-library-refresh-cover.json"),
      JSON.stringify(afterRefresh, null, 2),
    );
    await page.close();
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

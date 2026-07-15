#!/usr/bin/env node
/**
 * Visual responsive audit across phone/tablet/desktop widths.
 * Run: node scripts/responsive-visual-audit.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const puppeteer = require("puppeteer");

const ROOT = path.join(__dirname, "..");
const OUT = "/opt/cursor/artifacts/responsive-audit";
const PORT = 19730 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-resp-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "resp-admin@test.local", password: "resp-pass-123", code: "resp-code" };
const USER = {
  email: "resp-teacher@example.com",
  name: "Responsive Tester",
  plan: "Pro",
};

const WIDTHS = [320, 375, 390, 430, 768, 820, 834, 1024, 1280, 1440];
const AUTH_VIEWS = [
  "calendar",
  "home",
  "lessons",
  "activities",
  "child-tools-daily-logs",
  "children",
  "ai",
  "behavior-support",
  "settings",
  "planner",
  "admin",
];

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
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
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
  fs.writeFileSync(STORE, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, scheduleByUser: {} }, null, 2));
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
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 90; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const r = await requestJson("GET", "/api/health");
      if (r.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server boot timeout");
}

async function seedAuth(page) {
  await page.evaluate((user) => {
    localStorage.setItem("llhUser", user.email);
    localStorage.setItem("llhPlan", user.plan);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [user.email]: {
        email: user.email,
        name: user.name,
        plan: user.plan,
        accountType: "home_daycare",
        role: "owner",
        membershipStatus: "active",
      },
    }));
    localStorage.setItem("llhAdminUnlocked", "true");
    localStorage.setItem("llhAdminRememberDevice", "true");
  }, USER);
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const clientWidth = doc.clientWidth;
    const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    const overflowing = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      // Ignore off-canvas drawer chrome — it is intentionally translated off-screen.
      if (el.classList.contains("sidebar") || el.closest(".sidebar")) continue;
      if (el.classList.contains("mobile-nav-backdrop") || el.classList.contains("llh-public-mobile-menu")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.right > clientWidth + 2 || rect.left < -2) {
        const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".") : "";
        overflowing.push({
          sel: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
        if (overflowing.length >= 10) break;
      }
    }
    const shell = getComputedStyle(document.querySelector(".app-shell") || document.body);
    const sidebar = document.querySelector(".sidebar");
    const toggle = document.querySelector("#mobileMenuToggle");
    const toggleDisplay = toggle ? getComputedStyle(toggle).display : "none";
    return {
      clientWidth,
      scrollWidth,
      hasPageScroll: scrollWidth > clientWidth + 1,
      overflowDelta: scrollWidth - clientWidth,
      overflowing,
      shellDisplay: shell.display,
      sidebarTransform: sidebar ? getComputedStyle(sidebar).transform : "",
      menuToggleVisible: toggleDisplay !== "none",
      activeView: document.querySelector(".view.active-view")?.id || "",
    };
  });
}

async function goView(page, viewId) {
  await page.evaluate((id) => {
    if (typeof setView === "function") setView(id);
    else if (typeof window.setView === "function") window.setView(id);
    else {
      const btn = document.querySelector(`.nav-link[data-view="${id}"]`);
      if (btn) btn.click();
    }
  }, viewId);
  await new Promise((r) => setTimeout(r, 450));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const child = startServer();
  let browser;
  const results = [];
  try {
    await waitForBoot(child);
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle0", timeout: 60000 });
    await seedAuth(page);
    await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForFunction(() => typeof setView === "function" || document.body.classList.contains("app-booted"), { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const hasSetView = await page.evaluate(() => typeof setView === "function");
    console.log("hasSetView", hasSetView, "user", await page.evaluate(() => localStorage.getItem("llhUser")));

    for (const width of WIDTHS) {
      const height = width <= 430 ? 844 : width <= 834 ? 1112 : 900;
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await new Promise((r) => setTimeout(r, 250));

      for (const view of AUTH_VIEWS) {
        try {
          await goView(page, view);
          const measure = await measureOverflow(page);
          const slug = view.replace(/[^a-z0-9]+/gi, "-");
          const file = `${String(width).padStart(4, "0")}-${slug}.png`;
          await page.screenshot({ path: path.join(OUT, file), fullPage: false });
          results.push({ width, view, ...measure, file });
          if (measure.hasPageScroll || measure.overflowing.length) {
            console.log(
              `${measure.hasPageScroll ? "SCROLL" : "EDGE"} ${width} ${view}`,
              measure.hasPageScroll ? `+${measure.overflowDelta}` : "",
              measure.overflowing[0]?.sel || "",
              `menu=${measure.menuToggleVisible}`,
            );
          }
        } catch (err) {
          console.log(`ERR ${width} ${view}`, err.message);
          results.push({ width, view, error: err.message });
        }
      }
    }

    // Public homepage / auth modal
    const publicPage = await browser.newPage();
    for (const width of [320, 375, 768, 834, 1024, 1280]) {
      await publicPage.setViewport({ width, height: width <= 834 ? 1024 : 900 });
      await publicPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle0", timeout: 60000 });
      await publicPage.evaluate(() => localStorage.clear());
      await publicPage.reload({ waitUntil: "networkidle0", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 400));
      let measure = await measureOverflow(publicPage);
      let file = `${String(width).padStart(4, "0")}-homepage.png`;
      await publicPage.screenshot({ path: path.join(OUT, file), fullPage: false });
      results.push({ width, view: "homepage", ...measure, file });
      if (measure.hasPageScroll) console.log(`SCROLL ${width} homepage +${measure.overflowDelta}`);

      await publicPage.evaluate(() => {
        const btn = [...document.querySelectorAll("button, a")].find((el) => /log\s*in/i.test(el.textContent || ""));
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      measure = await measureOverflow(publicPage);
      file = `${String(width).padStart(4, "0")}-login.png`;
      await publicPage.screenshot({ path: path.join(OUT, file), fullPage: false });
      results.push({ width, view: "login", ...measure, file });
      if (measure.hasPageScroll) console.log(`SCROLL ${width} login +${measure.overflowDelta}`);
    }

    fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify(results, null, 2));
    const scrolls = results.filter((r) => r.hasPageScroll);
    const tabletShell = results.filter((r) => [768, 820, 834, 1024].includes(r.width) && r.view === "calendar");
    console.log("\n=== SUMMARY ===");
    console.log("checks", results.length, "page-scrolls", scrolls.length);
    scrolls.forEach((o) => console.log(`- ${o.width} ${o.view} +${o.overflowDelta}px`));
    console.log("\nTablet shell (calendar):");
    tabletShell.forEach((r) => console.log(`- ${r.width}: menu=${r.menuToggleVisible} shell=${r.shellDisplay} active=${r.activeView}`));
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

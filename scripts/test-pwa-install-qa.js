#!/usr/bin/env node
/**
 * PWA / Add to Home Screen regression checks after Calendar-first navigation.
 * Run: node scripts/test-pwa-install-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19800 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-pwa-qa-${crypto.randomBytes(4).toString("hex")}.json`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, timeout: 30000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({
          status: res.statusCode,
          headers: res.headers,
          text: Buffer.concat(chunks).toString("utf8"),
        }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "pwa-qa@test.local",
      ADMIN_PASSWORD: "pwa-qa-pass",
      ADMIN_ACCESS_CODE: "pwa-qa-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
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

async function main() {
  console.log("0) Static PWA contract");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "site.webmanifest"), "utf8"));

  assert(html.includes('rel="manifest"'), "manifest link missing");
  assert(html.includes('id="platformInstallCardHost"'), "Calendar install host missing after nav rebuild");
  assert(html.includes('id="installAppModal"'), "Install modal missing");
  assert(html.includes('id="accountInstallAppButton"'), "Account install button missing");
  assert(html.includes('rel="apple-touch-icon"'), "apple-touch-icon missing for iOS");
  assert(html.includes("__LLH_SW_EARLY_REGISTERED"), "Home Screen early SW register missing from index.html");
  assert(html.includes('serviceWorker.register("/service-worker.js")'), "early service worker register missing");
  assert(manifest.display === "standalone", "manifest display must be standalone");
  assert(manifest.start_url, "manifest start_url missing");
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "manifest icons missing");
  assert(appJs.includes("function registerPwaSupport"), "registerPwaSupport missing");
  assert(appJs.includes("beforeinstallprompt"), "beforeinstallprompt handler missing");
  assert(appJs.includes("__LLH_SW_EARLY_REGISTERED"), "registerPwaSupport should defer to early SW reload owner");
  assert(appJs.includes("function promptInstallFlow"), "promptInstallFlow missing");
  assert(appJs.includes("function platformInstallCardMarkup"), "Calendar/Settings install card helper missing");
  assert(appJs.includes("syncPlatformInstallCard"), "Calendar install sync helper missing");
  assert(appJs.includes('action: "install-app"') || appJs.includes("action: \"install-app\""), "Settings install action missing");
  assert(appJs.includes("registerPwaSupport()"), "registerPwaSupport must be invoked");
  assert(sw.includes("CACHE_NAME"), "service worker cache missing");
  assert(fs.existsSync(path.join(ROOT, "images/icons/icon-192.svg")), "192 icon missing");
  assert(fs.existsSync(path.join(ROOT, "images/icons/icon-512.svg")), "512 icon missing");

  const child = startServer();
  try {
    await waitForBoot(child);

    console.log("1) Manifest + service worker are served correctly");
    const manifestRes = await requestJson("GET", "/site.webmanifest");
    assert(manifestRes.status === 200, `manifest status ${manifestRes.status}`);
    assert(String(manifestRes.headers["content-type"] || "").includes("manifest")
      || String(manifestRes.headers["content-type"] || "").includes("json"),
    `unexpected manifest content-type: ${manifestRes.headers["content-type"]}`);
    const parsed = JSON.parse(manifestRes.text);
    assert(parsed.name === "Little Learner Hub", "manifest name mismatch");

    const swRes = await requestJson("GET", "/service-worker.js");
    assert(swRes.status === 200, `service worker status ${swRes.status}`);
    assert(swRes.text.includes("llh-shell"), "service worker body unexpected");

    let playwright;
    try { playwright = require("playwright"); } catch {
      console.log("Playwright unavailable — static + HTTP checks only.");
      return;
    }

    const browser = await playwright.chromium.launch({ headless: true });
    const baseUrl = `http://127.0.0.1:${PORT}`;

    console.log("2) Logged-in Calendar shows Add to Home Screen prompt card");
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "pwa-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "pwa-user@test.local": {
            email: "pwa-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
            installPrompt: {},
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function" && document.body.classList.contains("app-booted"), null, { timeout: 60000 });
      await page.evaluate(() => setView("calendar", { fromBoot: true, replaceHistory: true }));
      await page.waitForSelector("#platformInstallCardHost .platform-install-card, #platformInstallCardHost .dashboard-install-card", { timeout: 15000 });
      const calendarInstall = await page.evaluate(() => ({
        hostText: document.querySelector("#platformInstallCardHost")?.textContent || "",
        hasButton: Boolean(document.querySelector("#platformInstallCardHost [data-install-app]")),
        active: document.querySelector(".active-view")?.id || "",
      }));
      assert(calendarInstall.active === "view-calendar", `expected calendar, got ${calendarInstall.active}`);
      assert(/Add .*Home Screen|Install App|Install the app/i.test(calendarInstall.hostText), "Calendar install card copy missing");
      assert(calendarInstall.hasButton, "Calendar install button missing");
      await page.close();
    }

    console.log("3) Install modal opens with iPhone/Android instructions");
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "pwa-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "pwa-user@test.local": {
            email: "pwa-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
            installPrompt: {},
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof promptInstallFlow === "function", null, { timeout: 60000 });
      await page.evaluate(() => promptInstallFlow({ source: "calendar", forceInstructions: true }));
      await page.waitForSelector("#installAppModal.open", { timeout: 10000 });
      const modal = await page.evaluate(() => ({
        open: document.querySelector("#installAppModal")?.classList.contains("open"),
        body: document.querySelector("#installAppBody")?.textContent || "",
      }));
      assert(modal.open, "install modal did not open");
      assert(/iPhone/i.test(modal.body) && /Safari/i.test(modal.body), "iPhone instructions missing");
      assert(/Android \(Chrome\)|Android/i.test(modal.body), "Android instructions missing");
      assert(/Add to Home Screen|Install App|Desktop \(Chrome/i.test(modal.body), "Add to Home Screen guidance missing");
      await page.close();
    }

    console.log("4) Settings hub exposes install action + prompt card");
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "pwa-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "pwa-user@test.local": {
            email: "pwa-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
            installPrompt: {},
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
      await page.evaluate(() => setView("settings", { skipHistory: true }));
      const settings = await page.evaluate(() => ({
        card: Boolean(document.querySelector('[data-install-app="settings"]')),
        prompt: /Add to Home Screen/i.test(document.querySelector("#view-settings")?.textContent || ""),
        accountButton: Boolean(document.querySelector("#accountInstallAppButton")),
      }));
      assert(settings.card, "Settings Add to Home Screen card missing");
      assert(settings.prompt, "Settings install prompt card missing");
      await page.evaluate(() => setView("account", { skipHistory: true }));
      await page.waitForSelector("#accountInstallAppButton", { timeout: 10000 });
      const accountBtn = await page.evaluate(() => document.querySelector("#accountInstallAppButton")?.textContent || "");
      assert(/Home Screen|Install App/i.test(accountBtn), `Account install button missing text: ${accountBtn}`);
      await page.close();
    }

    console.log("5) Maybe Later defers the Calendar install card");
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "pwa-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "pwa-user@test.local": {
            email: "pwa-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
            installPrompt: {},
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
      await page.evaluate(() => setView("calendar", { fromBoot: true, replaceHistory: true }));
      await page.waitForSelector("#platformInstallCardHost [data-install-later]", { timeout: 15000 });
      await page.click("#platformInstallCardHost [data-install-later]");
      await page.waitForFunction(() => !document.querySelector("#platformInstallCardHost [data-install-app]"), null, { timeout: 10000 });
      const deferred = await page.evaluate(() => {
        const account = JSON.parse(localStorage.getItem("llhAccounts") || "{}")["pwa-user@test.local"];
        return Boolean(account?.installPrompt?.deferredUntil);
      });
      assert(deferred, "Maybe Later should persist deferredUntil");
      await page.close();
    }

    console.log("6) Mobile viewport still exposes install controls");
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "pwa-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "pwa-user@test.local": {
            email: "pwa-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
            installPrompt: {},
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
      await page.evaluate(() => setView("calendar", { fromBoot: true, replaceHistory: true }));
      const mobileCard = await page.evaluate(() => Boolean(document.querySelector("#platformInstallCardHost [data-install-app]")));
      assert(mobileCard, "Mobile Calendar install card missing");
      await page.close();
    }

    await browser.close();
    console.log("\nPWA install QA passed.");
  } catch (error) {
    console.error("\nPWA INSTALL QA FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();

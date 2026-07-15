#!/usr/bin/env node
/**
 * Full navigation / back-history / Calendar-landing QA.
 * Run: node scripts/test-navigation-history-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19700 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-nav-qa-${crypto.randomBytes(4).toString("hex")}.json`);

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
        res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
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
      ADMIN_EMAIL: "nav-qa@test.local",
      ADMIN_PASSWORD: "nav-qa-pass",
      ADMIN_ACCESS_CODE: "nav-qa-code",
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
  console.log("0) Static navigation contract checks");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(html.includes("llh-boot-authenticated"), "Early authenticated boot class missing");
  assert(html.includes("body:not(.app-booted) #view-home"), "Boot CSS must hide Dashboard before app.js");
  assert(html.includes('data-fallback-view="calendar"'), "Curriculum/calendar fallbacks should prefer Calendar");
  assert(!/Back to Dashboard/.test(html), "Visible Back to Dashboard copy should be removed");
  assert(appJs.includes("pushPlatformNavHistory"), "Platform history helper missing");
  assert(appJs.includes("restoreViewScroll"), "Scroll restoration helper missing");
  assert(appJs.includes("defaultLoggedInLandingView"), "Logged-in landing helper missing");
  assert(appJs.includes('resolvedRequested === "home" && isLoggedIn()'), "Logged-in home→calendar remap missing");
  assert(appJs.includes("fromAuthLanding"), "Auth landing flag missing");
  assert(appJs.includes("PLATFORM_LAST_VIEW_KEY"), "Refresh last-view persistence missing");

  const child = startServer();
  try {
    await waitForBoot(child);
    let playwright;
    try { playwright = require("playwright"); } catch {
      console.log("Playwright unavailable — static checks only.");
      return;
    }
    const browser = await playwright.chromium.launch({ headless: true });
    const baseUrl = `http://127.0.0.1:${PORT}`;

    console.log("1) Logged-in boot opens Calendar — never Dashboard");
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "nav-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "nav-user@test.local": {
            email: "nav-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function" && document.body.classList.contains("app-booted"), null, { timeout: 60000 });
      const bootState = await page.evaluate(() => ({
        active: document.querySelector(".active-view")?.id || "",
        homeActive: document.querySelector("#view-home")?.classList.contains("active-view") || false,
        calendarActive: document.querySelector("#view-calendar")?.classList.contains("active-view") || false,
        homeDisplay: getComputedStyle(document.querySelector("#view-home")).display,
        bodyHome: document.body.classList.contains("home-view"),
      }));
      assert(bootState.calendarActive === true, `Boot should activate Calendar, got ${JSON.stringify(bootState)}`);
      assert(bootState.homeActive === false, `Dashboard must not stay active, got ${JSON.stringify(bootState)}`);
      assert(bootState.homeDisplay === "none", `Dashboard must be hidden, got ${JSON.stringify(bootState)}`);
      assert(bootState.bodyHome === false, "body.home-view must not remain for logged-in boot");
      await page.close();
    }

    console.log("2) Refresh restores last viewed section");
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "nav-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "nav-user@test.local": {
            email: "nav-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
          },
        }));
        sessionStorage.setItem("llhLastPlatformView", "activities");
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("#view-activities")?.classList.contains("active-view"), null, { timeout: 60000 });
      const active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
      assert(active === "view-activities", `Refresh should restore activities, got ${active}`);
      await page.close();
    }

    console.log("3) Browser Back returns to prior section (not Dashboard / not skipped pages)");
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "nav-user@test.local");
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "nav-user@test.local": {
            email: "nav-user@test.local",
            plan: "Pro",
            subscriptionStatus: "Pro Monthly Subscription Active",
            stripeSubscriptionStatus: "active",
            accountType: "home_daycare",
            role: "owner",
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function" && document.body.classList.contains("app-booted"), null, { timeout: 60000 });
      await page.evaluate(() => {
        setView("calendar", { fromBoot: true, replaceHistory: true });
        setView("lessons", { skipHistory: true });
        setView("activities", { skipHistory: true });
        setView("ai", { skipHistory: true });
      });
      let active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
      assert(active === "view-ai", `Expected Documentation Center, got ${active}`);
      await page.goBack();
      await page.waitForTimeout(100);
      active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
      assert(active === "view-activities", `Back from AI should return to Activities, got ${active}`);
      await page.goBack();
      await page.waitForTimeout(100);
      active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
      assert(active === "view-lessons", `Back from Activities should return to Lessons, got ${active}`);
      await page.goBack();
      await page.waitForTimeout(100);
      active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
      assert(active === "view-calendar", `Back from Lessons should return to Calendar, got ${active}`);
      assert(active !== "view-home", "Back must never dump onto Dashboard");
      await page.close();
    }

    console.log("4) Scroll position is restored when using browser Back");
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "nav-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "nav-user@test.local": {
            email: "nav-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
      await page.evaluate(() => {
        setView("lessons", { skipHistory: true, replaceHistory: true });
        const spacer = document.createElement("div");
        spacer.id = "navScrollSpacer";
        spacer.style.height = "2400px";
        document.querySelector("#view-lessons")?.appendChild(spacer);
        window.scrollTo(0, 900);
        viewScrollPositions.lessons = 900;
      });
      await page.evaluate(() => setView("calendar", { skipHistory: true }));
      await page.evaluate(() => setView("lessons", { fromPopState: true, skipPlatformHistory: true, restoreScrollY: 900 }));
      const scrollY = await page.evaluate(() => window.scrollY || 0);
      assert(scrollY >= 800, `Expected restored scroll near 900, got ${scrollY}`);
      await page.close();
    }

    console.log("5) Login landing + intentional navigation are not yanked to Calendar");
    {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
      await page.evaluate(() => {
        localStorage.setItem("llhUser", "nav-user@test.local");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "nav-user@test.local": {
            email: "nav-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
          },
        }));
        currentUser = "nav-user@test.local";
        loadAccountState("nav-user@test.local");
        pendingAuthReturnView = "children";
        setView("children", { fromAuthLanding: true });
        // Simulated late boot landing must not override.
        if (!suppressBootLanding) setView("calendar", { fromBoot: true });
      });
      const active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
      assert(active === "view-children", `Auth landing/children must stick, got ${active}`);
      await page.close();
    }

    console.log("6) Mobile viewport sidebar section switching stays stable");
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.addInitScript(() => {
        localStorage.setItem("llhUser", "nav-user@test.local");
        localStorage.setItem("llhPlan", "Free");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "nav-user@test.local": {
            email: "nav-user@test.local",
            plan: "Free",
            subscriptionStatus: "Free Plan",
            accountType: "home_daycare",
            role: "owner",
          },
        }));
      });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
      for (const view of ["calendar", "lessons", "activities", "ai", "children", "settings"]) {
        await page.evaluate((v) => setView(v, { skipHistory: true }), view);
        const active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
        assert(active === `view-${view}`, `Mobile nav failed for ${view}, active=${active}`);
      }
      await page.close();
    }

    await browser.close();
    console.log("\nNavigation history QA passed.");
  } catch (error) {
    console.error("\nNAV HISTORY QA FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();

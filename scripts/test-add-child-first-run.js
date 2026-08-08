#!/usr/bin/env node
/**
 * First-run Add Child clarity — name field must be obvious and required.
 * Run: NODE_ENV=test node scripts/test-add-child-first-run.js
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
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

assert.match(appJs, /childFirstNameInput/);
assert.match(appJs, /simple-child-form--first-run/);
assert.match(appJs, /Add Your First Child/);
assert.match(appJs, /Child’s name/);
assert.match(stylesCss, /\.simple-child-form--first-run #childFirstNameInput/);
console.log("PASS  first-run Add Child markers");

const PORT = 4580 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-add-child-${crypto.randomBytes(3).toString("hex")}.json`);

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  fs.writeFileSync(STORE, JSON.stringify({ users: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "true",
      LLH_STORE_PATH: STORE,
      DATABASE_PROVIDER: "local-json",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  try {
    for (let i = 0; i < 60; i += 1) {
      try { if ((await request("GET", "/api/health")) === 200) break; } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const email = "provider.addchild@llhmail.app";
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "Pro Subscription Active",
        },
      }));
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function" && typeof renderChildManagement === "function");
    await page.evaluate(() => {
      setView("children", { allowDuringBootVerification: true, skipAccessRedirect: true });
      childManagementMode = "list";
      renderChildManagement();
    });
    await page.waitForTimeout(400);
    await page.locator('button:has-text("Add Your First Child"), [data-child-view="add"]').first().click();
    await page.waitForSelector("#childProfileForm", { timeout: 8000 });
    const state = await page.evaluate(() => {
      const input = document.querySelector("#childFirstNameInput, #childProfileForm input[name='name']");
      const label = document.querySelector(".child-name-field-label")?.textContent || "";
      const advancedOpen = Boolean(document.querySelector("details.child-add-advanced[open]"));
      return {
        hasInput: Boolean(input),
        required: Boolean(input?.required),
        id: input?.id || "",
        placeholder: input?.placeholder || "",
        label,
        focused: document.activeElement === input,
        advancedOpen,
        title: document.querySelector(".simple-child-page h2")?.textContent || "",
      };
    });
    assert.equal(state.hasInput, true);
    assert.equal(state.required, true);
    assert.equal(state.id, "childFirstNameInput");
    assert.match(state.label, /Child/i);
    assert.match(state.title, /Add Your First Child/i);
    assert.equal(state.advancedOpen, false, "optional advanced section should start collapsed on first-run add");
    console.log("PASS  first-run form shows required name field", JSON.stringify(state));

    // Classroom must not block first-run save when rooms exist.
    const classroomRequired = await page.evaluate(() => {
      const sel = document.querySelector('#childProfileForm select[name="classroomId"]');
      return Boolean(sel?.required);
    });
    assert.equal(classroomRequired, false, "classroom must be optional on first-run add");

    await page.fill("#childFirstNameInput", "Mia");
    await page.selectOption('#childProfileForm select[name="ageGroup"]', { label: "Toddler" });
    await page.locator('#childProfileForm button[type="submit"]').click();
    await page.waitForTimeout(800);
    const saved = await page.evaluate(() => {
      const profiles = typeof childStore === "function" ? childStore("Profiles") : [];
      return { count: profiles.length, name: profiles[0]?.name || "", mode: childManagementMode };
    });
    assert.equal(saved.count, 1);
    assert.equal(saved.name, "Mia");
    console.log("PASS  save first child from clarified form");
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

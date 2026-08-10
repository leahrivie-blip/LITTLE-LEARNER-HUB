#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT = "/opt/cursor/artifacts/provider-nav-ia-screenshots";

function request(port, method, pathname, { email, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (email) {
      headers["X-LLH-User-Email"] = email;
      headers.Authorization = `Bearer test:${email}`;
    }
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers }, (res) => {
      let text = "";
      res.on("data", (c) => { text += c; });
      res.on("end", () => resolve({ status: res.statusCode }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-nav-shots-${Date.now()}.json`);
  const port = 48100 + Math.floor(Math.random() * 400);
  const email = `nav.shots${Date.now()}@example.invalid`;
  fs.writeFileSync(storePath, JSON.stringify({
    users: { [email]: { email, role: "owner", accountType: "home_daycare", plan: "Pro", multiRoleTester: true } },
  }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const kill = () => { try { child.kill("SIGTERM"); } catch (_e) { /* ignore */ } };
  process.on("exit", kill);
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) break;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  await request(port, "POST", "/api/child-data", {
    email,
    body: { data: { Profiles: [{ id: "shot-1", name: "Shot Kid" }], Documents: [] } },
  });

  const browser = await chromium.launch({ headless: true });
  const shots = [];
  async function shot(page, name) {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    shots.push(file);
    console.log("shot", file);
  }

  for (const [label, size] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: size });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate((userEmail) => {
      localStorage.setItem("llhUser", userEmail);
      localStorage.setItem("HOME_DAYCARE_HUB_TESTING", "1");
      localStorage.setItem("llhPlan", "Pro");
    }, email);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function");
    await page.evaluate((userEmail) => {
      loadAccountState?.(userEmail);
      syncPlatformNavVisibility?.();
    }, email);

    const roles = [
      ["owner", null, "home"],
      ["director", "Director", "home"],
      ["teacher", "Teacher", "today"],
      ["assistant", "Assistant", "today"],
    ];
    for (const [roleName, multi, landing] of roles) {
      await page.evaluate(({ multiRole, land }) => {
        if (multiRole) localStorage.setItem("llhMultiRoleTesterView", multiRole);
        else localStorage.removeItem("llhMultiRoleTesterView");
        syncPlatformNavVisibility?.();
        setView(land, { allowDashboard: true, skipAccessRedirect: true });
      }, { multiRole: multi, land: landing });
      await page.waitForTimeout(500);
      await shot(page, `${label}-${roleName}-home`);
    }

    await page.evaluate(() => {
      localStorage.removeItem("llhMultiRoleTesterView");
      syncPlatformNavVisibility?.();
      setView("child-tools-daily-logs");
    });
    await page.waitForTimeout(500);
    await shot(page, `${label}-daily-care`);

    await page.evaluate(() => setView("classroom"));
    await page.waitForTimeout(400);
    await shot(page, `${label}-classroom`);

    await page.evaluate(() => setView("lessons"));
    await page.waitForTimeout(400);
    await shot(page, `${label}-curriculum`);

    await page.evaluate(() => setView("families"));
    await page.waitForTimeout(400);
    await shot(page, `${label}-families`);

    await page.evaluate(() => setView("business"));
    await page.waitForTimeout(400);
    await shot(page, `${label}-management`);

    await page.evaluate(() => setView("activities"));
    await page.waitForTimeout(400);
    await shot(page, `${label}-activity-library`);

    await page.evaluate(() => {
      localStorage.setItem("llhMultiRoleTesterView", "Parent");
      document.body.classList.add("family-hub-parent-mode");
      setView("family-hub", { skipAccessRedirect: true });
    });
    await page.waitForTimeout(500);
    await shot(page, `${label}-parent-view`);
    await page.evaluate(() => {
      if (typeof LLHMultiRoleTester?.clearView === "function") LLHMultiRoleTester.clearView({ silent: true });
      else exitFamilyHubParentPreview?.();
    });
    await page.waitForTimeout(500);
    await shot(page, `${label}-parent-return`);
    await page.close();
  }

  await browser.close();
  kill();
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ shots, at: new Date().toISOString() }, null, 2));
  console.log("DONE", shots.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

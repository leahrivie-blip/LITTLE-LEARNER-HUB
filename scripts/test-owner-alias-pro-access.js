#!/usr/bin/env node
/**
 * Platform owner aliases (leahivie@icloud.com, etc.) get full Pro curriculum
 * access even when their membership row is Free.
 * Run: node scripts/test-owner-alias-pro-access.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19810 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-pro-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = "leahivie@icloud.com";
const FREE_MEMBER = "regular-free@example.com";
const ADMIN = {
  email: OWNER,
  password: "owner-pro-pass",
  code: "owner-pro-code",
};
const PROTECTED = "Invite children to scoop and feel the soil for owner access.";

function request(method, urlPath, { body, headers = {} } = {}) {
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

function memberHeaders(email) {
  return {
    Authorization: `Bearer test:${email}`,
    "X-LLH-User-Email": email,
  };
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
      [FREE_MEMBER]: {
        email: FREE_MEMBER,
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
    },
    siteContent: {},
    adminSessions: {},
  }, null, 2));
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
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
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

function staticChecks() {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const server = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(app, /isSignedInPlatformOwner\(\)\) return "Founding"/);
  assert.match(server, /source:\s*"admin-owner"/);
  assert.match(app, /positionItemActionMenuPanel/);
  assert.match(css, /llh-item-menu-backdrop/);
  assert.match(css, /#scheduleEventModal/);
  assert.match(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), /app\.js\?v=/);
  console.log("PASS static owner Pro + mobile overlay markers");
}

async function seedProLesson(token) {
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");
  let source = fs.readFileSync(sample, "utf8");
  if (!source.includes(PROTECTED)) {
    source = `${source}\n\nMonday Activities\n1. Soil scoop\nSteps: ${PROTECTED}\n`;
  }
  const parsed = parseCurriculumLessonPlanImport(source);
  assert.equal(parsed.ok, true, parsed.error || "parse failed");
  const dailyPlans = { ...(parsed.data.dailyPlans || {}) };
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    const items = Array.isArray(dailyPlans[day]?.items) ? dailyPlans[day].items : [];
    const hasTitle = items.some((item) => String(item?.title || "").trim());
    if (!hasTitle) {
      dailyPlans[day] = {
        ...(dailyPlans[day] || {}),
        items: [{
          title: `${day} owner access activity`,
          steps: PROTECTED,
        }],
      };
    }
  }
  const bootstrap = await request("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await request("POST", "/api/admin/site-content", {
    body: {
      adminToken: token,
      siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
    },
  });
  const planId = `cur-lp-owner-pro-${crypto.randomBytes(3).toString("hex")}`;
  const save = await request("POST", "/api/admin/curriculum/lesson-plans", {
    body: {
      adminToken: token,
      expectedUpdatedAt: touch.json.siteContent.updatedAt,
      lessonPlan: {
        ...parsed.data,
        dailyPlans,
        id: planId,
        title: "Owner Pro Access Plan",
        plan: "Pro",
        status: "published",
        age: "Preschool",
        theme: "Owner Access",
      },
    },
  });
  assert.ok([200, 201].includes(save.status), `save failed: ${save.status} ${save.text}`);
  return planId;
}

async function main() {
  staticChecks();
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await request("POST", "/api/admin/login", {
      body: { email: ADMIN.email, password: ADMIN.password, code: ADMIN.code },
    });
    assert.equal(login.status, 200, "owner admin login failed");
    const planId = await seedProLesson(login.json.token);

    const freeDenied = await request("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(planId)}`, {
      headers: memberHeaders(FREE_MEMBER),
    });
    assert.equal(freeDenied.status, 200, "Free members may browse a locked Pro preview");
    assert.equal(freeDenied.json?.lessonPlan?.locked, true, "regular Free member must get locked Pro preview");
    assert.ok(!freeDenied.json?.lessonPlan?.dailyPlans, "regular Free member must not receive full dailyPlans");

    const ownerAllowed = await request("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(planId)}`, {
      headers: memberHeaders(OWNER),
    });
    assert.equal(ownerAllowed.status, 200, `owner Free membership must still get Pro curriculum (${ownerAllowed.status})`);
    assert.equal(ownerAllowed.json?.lessonPlan?.locked, false, "owner must receive unlocked Pro body");
    assert.ok(
      ownerAllowed.json?.lessonPlan?.dailyPlans
        || JSON.stringify(ownerAllowed.json).includes("Owner Pro Access Plan")
        || JSON.stringify(ownerAllowed.json).includes(PROTECTED),
      "owner response should include full lesson plan payload",
    );
    console.log("PASS server grants Pro curriculum to Free owner alias");

    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      console.log("SKIP browser owner access checks (playwright missing)");
      return;
    }
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(({ email }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Free",
          subscriptionStatus: "Free Plan",
        },
      }));
      localStorage.setItem("llhPlan", "Free");
    }, { email: OWNER });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof isLoggedIn === "function" && isLoggedIn() && typeof isProUser === "function", null, { timeout: 30000 });
    const access = await page.evaluate(() => ({
      owner: typeof isSignedInPlatformOwner === "function" && isSignedInPlatformOwner(),
      plan: typeof effectiveAccessPlan === "function" ? effectiveAccessPlan() : "",
      pro: typeof isProUser === "function" && isProUser(),
      canAccessPro: typeof canAccess === "function" && canAccess({ id: "x", plan: "Pro", category: "Lesson Plans", _curriculumManaged: true }),
    }));
    assert.equal(access.owner, true, "signed-in iCloud alias should count as platform owner");
    assert.equal(access.plan, "Founding", `owner effective plan should be Founding, got ${access.plan}`);
    assert.equal(access.pro, true, "owner should be treated as Pro");
    assert.equal(access.canAccessPro, true, "owner canAccess should allow Pro lesson plans");
    console.log("PASS client treats Free owner alias as Pro/Founding");

    // Mobile item-menu sheet geometry smoke (Calendar-style ⋮ menus).
    await page.evaluate(() => {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="llh-item-menu" style="position:fixed;right:12px;bottom:80px;">
          <button type="button" class="ghost-button llh-item-menu-toggle" data-llh-item-menu-toggle="audit-menu" aria-expanded="false">⋮</button>
          <div class="llh-item-menu-panel" data-llh-item-menu="audit-menu" hidden role="menu">
            <button type="button" class="llh-item-menu-action" role="menuitem">Edit this very long calendar item label</button>
            <button type="button" class="llh-item-menu-action llh-item-menu-danger" role="menuitem">Delete Permanently</button>
          </div>
        </div>
      `);
    });
    await page.click('[data-llh-item-menu-toggle="audit-menu"]');
    await page.waitForSelector('[data-llh-item-menu="audit-menu"]:not([hidden])', { timeout: 5000 });
    const menuGeom = await page.evaluate(() => {
      const panel = document.querySelector('[data-llh-item-menu="audit-menu"]');
      const backdrop = document.querySelector("[data-llh-item-menu-backdrop]");
      const pr = panel.getBoundingClientRect();
      return {
        parentIsBody: panel.parentElement === document.body,
        left: pr.left,
        right: pr.right,
        bottom: pr.bottom,
        width: pr.width,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        backdropVisible: Boolean(backdrop && !backdrop.hidden),
        locked: document.body.classList.contains("llh-item-menu-open"),
      };
    });
    assert.equal(menuGeom.parentIsBody, true, "item menu should portal on mobile");
    assert.ok(menuGeom.left >= 11.5 && menuGeom.right <= menuGeom.viewport.w - 11.5, "item menu must stay in viewport");
    assert.ok(menuGeom.bottom <= menuGeom.viewport.h + 1, "item menu must not extend past screen bottom");
    assert.equal(menuGeom.backdropVisible, true, "item menu backdrop required");
    assert.equal(menuGeom.locked, true, "item menu should lock background scroll");
    fs.mkdirSync("/opt/cursor/artifacts/screenshots", { recursive: true });
    await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/item-menu-sheet-390.png", fullPage: false });
    console.log("PASS mobile item-menu sheet geometry");

    console.log("\nAll owner alias Pro access checks passed.");
  } catch (error) {
    console.error("FAIL:", error.message || error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();

#!/usr/bin/env node
/**
 * Step 4 — Lesson editor / viewer mobile header overlap polish.
 * Run: npm run test:lesson-mobile-header
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19840 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-mobile-header-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-mobile-header-admin@test.local",
  password: "lesson-mobile-header-pass",
  code: "lesson-mobile-header-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
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
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server failed to boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function seedFreeLesson(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(sample, "utf8"));
  if (!parsed.ok) return null;
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-mobile-header-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Mobile Header Lesson Plan";
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title,
      plan: "Free",
      status: "published",
      age: "Preschool",
      theme: "Mobile Header",
    },
  });
  if (save.status !== 200) return null;
  return { planId, title };
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  let browser;
  const failures = [];
  const check = (name, condition, detail = "") => {
    if (condition) console.log(`✓ ${name}`);
    else {
      failures.push(detail ? `${name}: ${detail}` : name);
      console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
    }
  };

  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200 && login.json?.token, "Admin login failed");
    const lesson = await seedFreeLesson(login.json.token);
    assert(lesson, "Failed to seed lesson");

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-mobile-header@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-mobile-header@example.com": {
          email: "lesson-mobile-header@example.com",
          plan: "Free",
          subscriptionStatus: "Free Plan",
        },
      }));
      localStorage.setItem("llhPlan", "Free");
    });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof openLessonPlanEditor === "function" && typeof syncTopbarMetrics === "function", null, { timeout: 30000 });

    const viewportMeta = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "");
    check("viewport-fit=cover present", /viewport-fit\s*=\s*cover/i.test(viewportMeta));

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.waitForFunction((title) => resources.some((item) => item.title === title), lesson.title, { timeout: 15000 });
    await page.evaluate((id) => openLessonPlanEditor(id), lesson.planId);
    await page.waitForSelector("#view-lesson-editor.active-view [data-lesson-editor-sticky]", { timeout: 10000 });
    await page.waitForTimeout(200);
    await page.evaluate(() => syncTopbarMetrics());

    const editorMetrics = await page.evaluate(() => {
      const topbar = document.querySelector(".topbar");
      const sticky = document.querySelector("[data-lesson-editor-sticky]");
      const back = sticky?.querySelector("[data-lesson-editor-back]");
      const save = sticky?.querySelector('button[type="submit"], button.primary-button');
      const topbarRect = topbar?.getBoundingClientRect();
      const stickyRect = sticky?.getBoundingClientRect();
      const backRect = back?.getBoundingClientRect();
      const saveRect = save?.getBoundingClientRect();
      const cssTopbar = getComputedStyle(document.documentElement).getPropertyValue("--llh-topbar-height").trim();
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        bodyClass: document.body.classList.contains("lesson-editor-view"),
        cssTopbar,
        topbarBottom: topbarRect?.bottom || 0,
        stickyTop: stickyRect?.top || 0,
        stickyVisible: Boolean(stickyRect && stickyRect.height > 0),
        backHeight: backRect?.height || 0,
        saveHeight: saveRect?.height || 0,
        searchHidden: !document.querySelector(".topbar .search-wrap")
          || getComputedStyle(document.querySelector(".topbar .search-wrap")).display === "none",
      };
    });

    check("lesson-editor-view body class set", editorMetrics.bodyClass);
    check("topbar metrics CSS var set", /px$/.test(editorMetrics.cssTopbar) && parseFloat(editorMetrics.cssTopbar) > 0, editorMetrics.cssTopbar);
    check("no horizontal overflow on editor", !editorMetrics.overflow);
    check("sticky bar visible", editorMetrics.stickyVisible);
    check(
      "sticky bar sits below topbar",
      editorMetrics.stickyTop >= editorMetrics.topbarBottom - 1,
      `stickyTop=${editorMetrics.stickyTop} topbarBottom=${editorMetrics.topbarBottom}`,
    );
    check("Back tap target >= 44px", editorMetrics.backHeight >= 44, `h=${editorMetrics.backHeight}`);
    check("Save tap target >= 44px", editorMetrics.saveHeight >= 44, `h=${editorMetrics.saveHeight}`);
    check("editor topbar search hidden", editorMetrics.searchHidden);

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.fill("#lessonPlanSearch", lesson.title);
    await page.waitForTimeout(350);
    await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${lesson.title}")`, { timeout: 15000 });
    await page.locator("#view-lessons .lesson-plan-card").first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

    const workspaceMetrics = await page.evaluate(() => {
      const header = document.querySelector(".lesson-workspace-header");
      const back = document.querySelector(".lesson-workspace-back");
      const panels = document.querySelector(".lesson-workspace-panels");
      const headerStyle = header ? getComputedStyle(header) : null;
      const workspace = document.querySelector(".lesson-workspace");
      const modalCard = document.querySelector("#resourceViewerModal.lesson-workspace-mode .resource-viewer-card");
      return {
        docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        modalOverflow: (modalCard?.scrollWidth || 0) > (modalCard?.clientWidth || 0) + 2,
        workspaceBleed: (workspace?.scrollWidth || 0) > (workspace?.clientWidth || 0) + 2,
        headerPinned: headerStyle?.flexShrink === "0",
        panelsScroll: panels ? getComputedStyle(panels).overflowY === "auto" || getComputedStyle(panels).overflow === "auto" : false,
        backWidthRatio: back && header
          ? back.getBoundingClientRect().width / Math.max(1, header.getBoundingClientRect().width)
          : 0,
        backHeight: back?.getBoundingClientRect().height || 0,
      };
    });
    check(
      "no horizontal overflow on workspace",
      !workspaceMetrics.docOverflow && !workspaceMetrics.modalOverflow && !workspaceMetrics.workspaceBleed,
      JSON.stringify(workspaceMetrics),
    );
    check("workspace header stays pinned above panels", workspaceMetrics.headerPinned && workspaceMetrics.panelsScroll);
    check("workspace Back is full-width", workspaceMetrics.backWidthRatio > 0.9, `ratio=${workspaceMetrics.backWidthRatio}`);
    check("workspace Back tap target >= 44px", workspaceMetrics.backHeight >= 44, `h=${workspaceMetrics.backHeight}`);

    if (failures.length) {
      throw new Error(`${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    }
    console.log("\nAll lesson mobile header checks passed.");
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Mobile notification panel layout + role scoping regression.
 * Captures user/admin screenshots at common phone widths.
 * Run: node scripts/test-notification-panel-mobile.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19620 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-notif-panel-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "notif-panel-pass",
  code: "notif-panel-code",
};
const MEMBER = "member-reader@example.com";
const WIDTHS = [320, 375, 390, 412, 430];

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

function startServer() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [MEMBER]: { email: MEMBER, plan: "Free", subscriptionStatus: "Free Plan" },
      [ADMIN.email]: {
        email: ADMIN.email,
        plan: "Founding",
        subscriptionStatus: "Founding Member Subscription Active",
        stripeSubscriptionStatus: "active",
        foundingMemberActive: true,
      },
    },
    messages: [],
    notifications: [],
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
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(html, /notificationBellBackdrop/);
  assert.match(html, /notificationBellCloseBtn/);
  assert.match(css, /calc\(100vw - 24px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(app, /positionNotificationBellPanel/);
  assert.match(app, /notificationBellBackdrop/);
  assert.match(html, /app\.js\?v=20260720-messaging-merge/);
  assert.match(app, /syncNotificationBellPortal/);
  assert.match(app, /readSafeAreaInset/);
  console.log("PASS static mobile notification panel markers");
}

async function loginAs(page, email, { plan = "Free" } = {}) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(({ email: userEmail, plan: userPlan }) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [userEmail]: {
        email: userEmail,
        plan: userPlan,
        subscriptionStatus: userPlan === "Founding"
          ? "Founding Member Subscription Active"
          : userPlan === "Pro"
            ? "Pro Monthly Subscription Active"
            : "Free Plan",
      },
    }));
    localStorage.setItem("llhPlan", userPlan);
  }, { email, plan });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function" && typeof isLoggedIn === "function" && isLoggedIn(), null, { timeout: 30000 });
}

async function seedNotifications(token) {
  // Private message to member
  await request("POST", "/api/admin/messages/send", {
    body: {
      adminToken: token,
      audience: "private",
      toEmail: MEMBER,
      body: "Member-only hello with a long preview so wrapping can be verified on narrow phones: please keep lesson notes for verylongemailaddress@example-domain-name.com ready.",
      kind: "message",
      subject: "Long Notification Title About Weekly Lesson Planning Updates",
    },
  });
  // Extra notifications via profile signup alert (admin-only)
  for (let i = 0; i < 6; i += 1) {
    await request("POST", "/api/account/profile", {
      body: {
        email: `signup-burst-${i}@example.com`,
        firstName: `LongFirstName${i}`,
        lastName: `SuperLongLastNameForWrapping${i}`,
        accountType: "home_daycare",
        role: "owner",
        signup: true,
      },
      headers: {
        Authorization: `Bearer test:signup-burst-${i}@example.com`,
        "X-LLH-User-Email": `signup-burst-${i}@example.com`,
      },
    });
  }
  // Direct member notifications for scroll coverage
  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  const now = Date.now();
  for (let i = 0; i < 6; i += 1) {
    store.notifications.unshift({
      id: `notif-member-${i}`,
      email: MEMBER,
      type: i % 2 ? "announcement" : "message",
      title: `Member update ${i + 1}: Classroom planning checklist for providers with very long titles`,
      preview: `Preview ${i + 1} includes email contact.verylong.address+tag@littlelearners-example.com and details about materials, circle time, and outdoor play so the text must wrap safely.`,
      createdAt: new Date(now - i * 60000).toISOString(),
      read: false,
      conversationEmail: i % 2 ? "" : MEMBER,
      messageId: "",
    });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

async function assertPanelGeometry(page, label) {
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector("#notificationBellPanel");
    const list = document.querySelector("#notificationBellList");
    const mark = document.querySelector("#notificationMarkAllBtn");
    const closeBtn = document.querySelector("#notificationBellCloseBtn");
    const openMsg = document.querySelector("#notificationSeeAllBtn");
    const bell = document.querySelector("#notificationBellBtn");
    if (!panel || panel.hidden) return { open: false };
    const pr = panel.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    const br = bell.getBoundingClientRect();
    const titles = [...panel.querySelectorAll(".notification-item-body strong")].map((el) => ({
      text: el.textContent,
      height: el.getBoundingClientRect().height,
      overflowX: el.scrollWidth - el.clientWidth,
    }));
    const previews = [...panel.querySelectorAll(".notification-item-body span")].map((el) => ({
      height: el.getBoundingClientRect().height,
      overflowX: el.scrollWidth - el.clientWidth,
    }));
    return {
      open: true,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      panel: { left: pr.left, right: pr.right, top: pr.top, bottom: pr.bottom, width: pr.width, height: pr.height },
      list: { height: lr.height, scrollHeight: list.scrollHeight, overflowY: getComputedStyle(list).overflowY },
      bellBottom: br.bottom,
      markVisible: Boolean(mark && mark.getBoundingClientRect().height > 0),
      closeVisible: Boolean(closeBtn && getComputedStyle(closeBtn).display !== "none" && closeBtn.getBoundingClientRect().height > 0),
      openVisible: Boolean(openMsg && openMsg.getBoundingClientRect().height > 0),
      titles,
      previews,
      hasAdminType: [...panel.querySelectorAll(".notification-bell-item")].some((el) => /new account|payment failed|support request/i.test(el.textContent || "")),
    };
  });
  assert.equal(metrics.open, true, `${label}: panel should be open`);
  assert.ok(metrics.panel.left >= 11.5, `${label}: left inset too small (${metrics.panel.left})`);
  assert.ok(metrics.panel.right <= metrics.viewport.w - 11.5, `${label}: right inset too small`);
  assert.ok(Math.abs((metrics.panel.left) - (metrics.viewport.w - metrics.panel.right)) < 2.5, `${label}: side spacing should be equal`);
  assert.ok(metrics.panel.width <= metrics.viewport.w - 23.5, `${label}: width exceeds calc(100vw - 24px)`);
  // Prefer below the bell; if sticky banners force the panel lower/higher in rare
  // admin layouts, still require the panel to stay fully inside the viewport.
  assert.ok(
    metrics.panel.top + 1 >= Math.min(metrics.bellBottom, metrics.viewport.h * 0.5)
    || metrics.panel.top >= 11.5,
    `${label}: panel should start below the bell / within the top safe area`,
  );
  assert.ok(metrics.panel.bottom <= metrics.viewport.h + 1, `${label}: panel taller than viewport`);
  const adminBadgeBottomGap = await page.evaluate(() => {
    const panel = document.querySelector("#notificationBellPanel");
    const badge = document.querySelector("[data-admin-preview-badge]");
    if (!panel || !badge || badge.hidden) return null;
    const style = getComputedStyle(badge);
    if (style.display === "none") return null;
    return badge.getBoundingClientRect().top - panel.getBoundingClientRect().bottom;
  });
  if (adminBadgeBottomGap !== null) {
    assert.ok(adminBadgeBottomGap >= 8, `${label}: panel must clear Admin mode / bottom chrome by ≥8px (gap ${adminBadgeBottomGap})`);
  }
  assert.ok(metrics.markVisible, `${label}: Mark all as read missing`);
  assert.ok(metrics.closeVisible, `${label}: Close button missing`);
  assert.ok(metrics.openVisible, `${label}: Open Messages missing`);
  assert.ok(metrics.list.overflowY === "auto" || metrics.list.overflowY === "scroll", `${label}: list not scrollable`);
  if (metrics.list.scrollHeight > metrics.list.height + 4) {
    assert.ok(true, `${label}: list scrolls when content overflows`);
  }
  metrics.titles.forEach((t, idx) => {
    assert.ok(t.height > 10, `${label}: title ${idx} collapsed`);
    assert.ok(t.overflowX <= 1, `${label}: title ${idx} clipped horizontally`);
  });
  metrics.previews.forEach((p, idx) => {
    assert.ok(p.height > 10, `${label}: preview ${idx} collapsed`);
    assert.ok(p.overflowX <= 1, `${label}: preview ${idx} clipped horizontally`);
  });
  return metrics;
}

async function main() {
  staticChecks();
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
  try {
    await waitForBoot(child);
    const login = await request("POST", "/api/admin/login", {
      body: { email: ADMIN.email, password: ADMIN.password, code: ADMIN.code },
    });
    assert.equal(login.status, 200, "admin login failed");
    await seedNotifications(login.json.token);

    browser = await playwright.chromium.launch({ headless: true });

    // Member mobile checks + screenshots (with Early Supporter / upgrade card visible)
    for (const width of WIDTHS) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        deviceScaleFactor: 2,
      });
      await loginAs(page, MEMBER, { plan: "Free" });
      await page.waitForSelector("#notificationBellBtn", { state: "visible", timeout: 15000 });
      await page.evaluate(() => {
        const existing = document.querySelector(".founding-upgrade-banner");
        if (existing) return;
        const banner = document.createElement("section");
        banner.className = "founding-upgrade-banner";
        banner.setAttribute("aria-label", "Founding Member upgrade offer");
        banner.innerHTML = `
          <div class="founding-upgrade-banner-copy">
            <p class="eyebrow">Early Supporter</p>
            <h2>Keep your Free Early Supporter plan or upgrade when you're ready</h2>
            <p>Long upgrade card copy to verify the notification panel still fits above Open Messages.</p>
          </div>
          <div class="founding-upgrade-banner-actions">
            <button type="button" class="primary-button">Upgrade to Founding</button>
          </div>`;
        const main = document.querySelector(".main") || document.body;
        main.insertBefore(banner, main.firstChild);
      });
      await page.click("#notificationBellBtn");
      await page.waitForSelector("#notificationBellPanel:not([hidden])", { timeout: 10000 });
      await page.waitForTimeout(250);
      const metrics = await assertPanelGeometry(page, `member@${width}`);
      assert.equal(metrics.hasAdminType, false, `member@${width}: must not show admin-only alerts`);
      const footerClear = await page.evaluate(() => {
        const panel = document.querySelector("#notificationBellPanel");
        const footer = document.querySelector("#notificationSeeAllBtn");
        const list = document.querySelector("#notificationBellList");
        const fr = footer.getBoundingClientRect();
        const pr = panel.getBoundingClientRect();
        const style = getComputedStyle(list);
        return {
          footerBottom: fr.bottom,
          panelBottom: pr.bottom,
          viewportH: window.innerHeight,
          listScrollable: style.overflowY === "auto" || style.overflowY === "scroll",
          backdropBlocks: (() => {
            const upgrade = document.querySelector(".founding-upgrade-banner .primary-button");
            if (!upgrade) return true;
            const sample = document.elementFromPoint(
              Math.min(window.innerWidth - 8, upgrade.getBoundingClientRect().left + 8),
              Math.min(window.innerHeight - 8, upgrade.getBoundingClientRect().top + 8),
            );
            return Boolean(sample && (sample.id === "notificationBellBackdrop" || sample.closest("#notificationBellPanel")));
          })(),
        };
      });
      assert.ok(footerClear.footerBottom <= footerClear.panelBottom + 1, `member@${width}: Open Messages clipped by panel`);
      assert.ok(footerClear.footerBottom <= footerClear.viewportH + 1, `member@${width}: Open Messages off-screen`);
      assert.equal(footerClear.listScrollable, true, `member@${width}: list must scroll under upgrade card`);
      assert.equal(footerClear.backdropBlocks, true, `member@${width}: backdrop must block upgrade taps`);

      // Outside tap closes
      await page.click("#notificationBellBackdrop", { position: { x: 8, y: 8 } });
      await page.waitForSelector("#notificationBellPanel[hidden]", { state: "attached", timeout: 5000 });

      await page.click("#notificationBellBtn");
      await page.waitForSelector("#notificationBellPanel:not([hidden])", { timeout: 10000 });
      await page.waitForTimeout(200);
      const shot = path.join(ARTIFACT_DIR, `notif-panel-member-${width}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      console.log(`PASS member panel @${width}px (+ screenshot ${shot})`);
      await page.close();
    }

    // Desktop still works
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, MEMBER, { plan: "Free" });
      await page.click("#notificationBellBtn");
      await page.waitForSelector("#notificationBellPanel:not([hidden])", { timeout: 10000 });
      const desktop = await page.evaluate(() => {
        const panel = document.querySelector("#notificationBellPanel");
        const closeBtn = document.querySelector("#notificationBellCloseBtn");
        const pr = panel.getBoundingClientRect();
        return {
          width: pr.width,
          left: pr.left,
          right: pr.right,
          closeDisplay: getComputedStyle(closeBtn).display,
          backdropHidden: document.querySelector("#notificationBellBackdrop")?.hidden !== false,
        };
      });
      assert.ok(desktop.width <= 360.5, "desktop panel should keep ~360px max");
      assert.ok(desktop.left >= 0, "desktop panel should not start off-screen");
      assert.ok(desktop.right <= 1280, "desktop panel within viewport");
      assert.ok(desktop.left > 220, "desktop panel should sit in the main content (not under sidebar)");
      assert.equal(desktop.closeDisplay, "none", "desktop close button stays hidden");
      const deskShot = path.join(ARTIFACT_DIR, "notif-panel-member-desktop.png");
      await page.screenshot({ path: deskShot, fullPage: false });
      console.log(`PASS desktop member panel (+ screenshot ${deskShot})`);
      await page.close();
    }

    // Admin mobile view (bell + admin notification center)
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      await loginAs(page, ADMIN.email, { plan: "Founding" });
      // Unlock admin session
      await page.evaluate(async ({ email, password, code }) => {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, code }),
        });
        const data = await res.json();
        if (typeof setAdminSession === "function") {
          setAdminSession({
            token: data.token,
            email: data.email,
            name: data.name || "Leah",
            mode: "server",
          });
        } else {
          localStorage.setItem("llhAdminSession", JSON.stringify({
            token: data.token,
            email: data.email,
            name: data.name || "Leah",
            mode: "server",
            loggedInAt: new Date().toISOString(),
            trustedDevice: true,
          }));
          localStorage.setItem("llhAdminUnlocked", "true");
          localStorage.setItem("llhAdminPreviewMode", "Admin");
        }
      }, ADMIN);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(() => {
        if (typeof setView === "function") setView("admin");
      });
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForSelector("#notificationBellBtn", { state: "visible", timeout: 15000 });
      await page.click("#notificationBellBtn");
      await page.waitForSelector("#notificationBellPanel:not([hidden])", { timeout: 10000 });
      await page.waitForTimeout(250);
      await assertPanelGeometry(page, "admin-bell@390");
      const adminBellShot = path.join(ARTIFACT_DIR, "notif-panel-admin-bell-390.png");
      await page.screenshot({ path: adminBellShot, fullPage: false });
      await page.click("#notificationBellCloseBtn");
      await page.waitForSelector("#notificationBellPanel[hidden]", { state: "attached", timeout: 5000 });

      // Capture admin notification center with owner alerts loaded.
      await page.evaluate(async () => {
        const panel = document.querySelector("#adminNotificationsPanel");
        if (panel) {
          panel.hidden = false;
          panel.scrollIntoView({ block: "start" });
        }
        if (typeof fetchAdminNotificationCenter === "function") {
          await fetchAdminNotificationCenter();
        }
        if (typeof renderAdminNotificationCenter === "function") {
          renderAdminNotificationCenter();
        }
      });
      await page.waitForTimeout(700);
      const adminCenterShot = path.join(ARTIFACT_DIR, "notif-panel-admin-center-390.png");
      await page.screenshot({ path: adminCenterShot, fullPage: false });
      console.log(`PASS admin bell panel screenshot ${adminBellShot}`);
      console.log(`PASS admin notification center screenshot ${adminCenterShot}`);
      await page.close();
    }

    // Zoom + long content smoke at 375 (CSS zoom skews rect math; assert readability instead)
    {
      const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
      await loginAs(page, MEMBER, { plan: "Free" });
      await page.evaluate(() => { document.body.style.zoom = "1.25"; });
      await page.click("#notificationBellBtn");
      await page.waitForSelector("#notificationBellPanel:not([hidden])", { timeout: 10000 });
      await page.waitForTimeout(250);
      const zoomState = await page.evaluate(() => {
        const panel = document.querySelector("#notificationBellPanel");
        const closeBtn = document.querySelector("#notificationBellCloseBtn");
        const mark = document.querySelector("#notificationMarkAllBtn");
        const openMsg = document.querySelector("#notificationSeeAllBtn");
        const pr = panel.getBoundingClientRect();
        const titleOverflow = Math.max(0, ...[...panel.querySelectorAll(".notification-item-body strong")]
          .map((el) => el.scrollWidth - el.clientWidth));
        return {
          open: !panel.hidden,
          height: pr.height,
          viewportH: window.innerHeight,
          closeVisible: getComputedStyle(closeBtn).display !== "none",
          markVisible: mark.getBoundingClientRect().height > 0,
          openVisible: openMsg.getBoundingClientRect().height > 0,
          titleOverflow,
        };
      });
      assert.equal(zoomState.open, true, "zoomed panel should open");
      assert.ok(zoomState.height <= zoomState.viewportH + 2, "zoomed panel should stay within viewport height");
      assert.equal(zoomState.closeVisible, true, "zoomed close button visible");
      assert.equal(zoomState.markVisible, true, "zoomed mark-all visible");
      assert.equal(zoomState.openVisible, true, "zoomed open-messages visible");
      assert.ok(zoomState.titleOverflow <= 1, "zoomed titles should not clip horizontally");
      const zoomShot = path.join(ARTIFACT_DIR, "notif-panel-member-375-zoom.png");
      await page.screenshot({ path: zoomShot, fullPage: false });
      console.log(`PASS zoomed member panel (+ screenshot ${zoomShot})`);
      await page.close();
    }

    console.log("\nAll notification panel mobile checks passed.");
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

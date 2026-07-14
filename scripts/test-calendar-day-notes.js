#!/usr/bin/env node
/**
 * Step 1 calendar polish smoke:
 * - No visible "Weekend" banners/tags on Month/Week/Day views
 * - Day notes can be added on any day and show back on that day (+ Note chip in Month)
 *
 * Run: node scripts/test-calendar-day-notes.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 20180 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-day-notes-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "day-notes-admin@test.local",
  password: "day-notes-pass",
  code: "day-notes-code",
};
const USER_EMAIL = "day-notes-teacher@example.com";

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
        headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
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
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, scheduleByUser: {} }, null, 2));
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
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 90; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
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

function mondayIso(from = new Date()) {
  const date = new Date(from);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loginAsTeacher(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate((email) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" },
    }));
    localStorage.setItem("llhPlan", "Free");
    localStorage.removeItem(`llhCurriculumAssignments:${email}`);
    localStorage.removeItem(`llhScheduleItems:${email}`);
    localStorage.removeItem(`llhScheduleMigrated:${email}`);
    localStorage.removeItem("llhWeeklyPlanner");
  }, USER_EMAIL);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function" && typeof saveCalendarDayNote === "function", null, { timeout: 30000 });
}

async function main() {
  let child;
  let browser;
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "").slice(0, 180) });
    const mark = ok ? "PASS" : "FAIL";
    console.log(`${mark}  ${name}${detail ? ` — ${String(detail).slice(0, 120)}` : ""}`);
  };

  try {
    child = startServer();
    await waitForBoot(child);

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", async (d) => { await d.accept(); });

    await loginAsTeacher(page);
    await page.evaluate(() => setView("calendar"));
    await page.waitForSelector("#mainCalendarApp .llh-calendar-grid-7", { timeout: 15000 });

    const monthHtml = await page.locator("#mainCalendarApp").innerHTML();
    const monthText = await page.locator("#mainCalendarApp").innerText();
    check("Month View has no Weekend text tags", !/llh-cal-weekend-tag/.test(monthHtml) && !/>\s*Weekend\s*</.test(monthHtml));
    check("Month View still shows Sun–Sat headers", /Sun/i.test(monthText) && /Sat/i.test(monthText));

    const weekendCell = page.locator(".llh-cal-cell.is-weekend").first();
    check("Weekend cells still exist (tint/class only)", await weekendCell.count() > 0);
    const selectedIso = await weekendCell.getAttribute("data-calendar-select-day");
    await weekendCell.click();
    await page.waitForTimeout(400);

    const dayText = await page.locator("#mainCalendarApp").innerText();
    check("Day View shows Day notes editor", /Day notes/i.test(dayText) && await page.locator("[data-calendar-day-note-input]").count() > 0);
    check("Day View has no Weekend banner", !/\bWeekend day\b/i.test(dayText) && !/\b· Weekend\b/i.test(dayText));

    const noteText = `Picnic prep ${crypto.randomBytes(2).toString("hex")}`;
    await page.fill("[data-calendar-day-note-input]", noteText);
    await page.click("[data-calendar-save-day-note]");
    await page.waitForTimeout(800);

    const afterSaveText = await page.locator("#mainCalendarApp").innerText();
    const savedValue = await page.locator("[data-calendar-day-note-input]").inputValue();
    check("Saved day note persists in the Day View textarea", savedValue.includes(noteText), savedValue);
    check("Save status or Clear control appears after save", /Notes saved/i.test(afterSaveText) || await page.locator("[data-calendar-clear-day-note]").count() > 0);

    await page.click("[data-calendar-back-to-month]");
    await page.waitForTimeout(400);
    const notedCell = page.locator(`[data-calendar-select-day="${selectedIso}"]`);
    const notedCellText = await notedCell.innerText();
    check("Month View shows a Note chip for the day", /\bNote\b/.test(notedCellText), notedCellText);

    // Re-open the same day and confirm note still there
    await notedCell.click();
    await page.waitForTimeout(400);
    const reopenValue = await page.locator("[data-calendar-day-note-input]").inputValue();
    check("Re-opening the day still shows the note", reopenValue.includes(noteText), reopenValue);

    // Week view: no · Weekend label
    await page.click("[data-calendar-view-week]");
    await page.waitForTimeout(400);
    const weekHtml = await page.locator("#mainCalendarApp").innerHTML();
    const weekText = await page.locator("#mainCalendarApp").innerText();
    check("Week View has no · Weekend labels", !/· Weekend/i.test(weekText) && !/llh-cal-weekend-tag/.test(weekHtml));
    check("Week View still shows Sat/Sun", /\bsat\b/i.test(weekText) && /\bsun\b/i.test(weekText));
    const weekDayNote = await page.locator(`[data-calendar-select-day="${selectedIso}"]`).innerText();
    check("Week View shows Note chip on the noted day", /\bNote\b/.test(weekDayNote), weekDayNote);

    // Clear notes on the same day
    await page.locator(`[data-calendar-select-day="${selectedIso}"]`).click();
    await page.waitForTimeout(300);
    await page.click("[data-calendar-clear-day-note]");
    const confirmOk = page.locator("[data-llh-confirm-ok]");
    if (await confirmOk.count()) {
      await confirmOk.click();
    }
    await page.waitForTimeout(1000);
    const clearedValue = await page.locator("[data-calendar-day-note-input]").inputValue();
    check("Clear removes the day note", clearedValue.trim() === "", clearedValue);

    // Unit-ish: server normalize accepts day_note
    const scheduleLib = require("../server/schedule-lib.js");
    const normalized = scheduleLib.normalizeScheduleItem({
      type: "day_note",
      notes: "Normalize me",
      startDate: "2030-06-01",
      classroomId: "classroom-main",
    });
    check("Server normalizeScheduleItem keeps day_note type", normalized.type === "day_note" && normalized.notes === "Normalize me", normalized.type);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      failed.forEach((f) => console.error(`FAIL detail: ${f.name} — ${f.detail}`));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();

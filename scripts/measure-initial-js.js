#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PORT = 4321;
const OUT = "/opt/cursor/artifacts/testing-final-acceptance";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "true",
      DISABLE_OUTBOUND_EMAIL: "true",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: path.join(ROOT, "server", `.bundle-measure-${process.pid}.json`),
      FIREBASE_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const waitHealth = async () => {
    for (let i = 0; i < 80; i++) {
      try {
        await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject);
        });
        return;
      } catch { await new Promise((r) => setTimeout(r, 150)); }
    }
    throw new Error("health timeout");
  };
  try {
    await waitHealth();
    const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    const transferred = { bytes: 0, scripts: 0 };
    page.on("response", async (res) => {
      try {
        const url = res.url();
        if (!/\.js(\?|$)/.test(url) && !url.includes("/api/client-config.js")) return;
        const headers = res.headers();
        const len = Number(headers["content-length"] || 0);
        if (len > 0) transferred.bytes += len;
        else {
          const buf = await res.body().catch(() => null);
          if (buf) transferred.bytes += buf.length;
        }
        transferred.scripts += 1;
      } catch { /* ignore */ }
    });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 60000 });
    // Wait passively for first paint / home text without evaluating during parse storms
    await page.waitForTimeout(2000);
    let homeText = 0;
    for (let i = 0; i < 40; i++) {
      try {
        const state = await Promise.race([
          page.evaluate(() => ({
            textLen: (document.body?.innerText || "").length,
            hasHero: /Spend Less Time Planning|Little Learner Hub|Start Free/i.test(document.body?.innerText || ""),
            openAuth: typeof openAuthModal,
            bootReady: document.body.classList.contains("app-boot-ready"),
            status: document.getElementById("llhLazyStatus")?.textContent || "",
          })),
          new Promise((_, rej) => setTimeout(() => rej(new Error("busy")), 5000)),
        ]);
        console.log("tick", i, state);
        homeText = state.textLen;
        if (state.hasHero && state.openAuth === "function") {
          console.log("INTERACTIVE_MS", Date.now() - t0);
          break;
        }
      } catch (e) {
        console.log("tick", i, "busy");
      }
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(OUT, "optimized-local-home.png") });
    // Click login via boot queue if needed
    await page.click('[data-action="open-login"]').catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "optimized-local-login.png") });
    console.log("TRANSFER_JS_BYTES", transferred.bytes, "scripts", transferred.scripts);
    fs.writeFileSync(path.join(OUT, "optimized-local-perf.json"), JSON.stringify({
      interactiveProbeMs: Date.now() - t0,
      transferredJsBytes: transferred.bytes,
      scriptResponses: transferred.scripts,
      homeText,
    }, null, 2));
    await browser.close();
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

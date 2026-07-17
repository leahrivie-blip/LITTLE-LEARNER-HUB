#!/usr/bin/env node
/**
 * Capture desktop + mobile screenshots of the cover redesign mockup page.
 * Serves the repo root so proposed covers and current SVG covers both load.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const MOCKUP = "/mockups/lesson-cover-redesign/index.html";
const OUT_DIR = process.env.SCREENSHOT_DIR || "/opt/cursor/artifacts/screenshots";
const PORT = Number(process.env.MOCKUP_PORT || 4177);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(ROOT, safePath === "/" ? "index.html" : safePath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": contentType(filePath) });
        res.end(data);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function preparePage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#proposedRow .browse-card", { timeout: 15000 });
  // Give images a brief window to paint; do not block forever on offscreen assets.
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${PORT}${MOCKUP}`;

  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await preparePage(desktop, base);
    await desktop.screenshot({
      path: path.join(OUT_DIR, "cover-redesign-desktop.png"),
      fullPage: true,
    });
    console.log("Wrote cover-redesign-desktop.png");
    await desktop.locator("#proposedRow").screenshot({
      path: path.join(OUT_DIR, "cover-redesign-desktop-row.png"),
    });
    console.log("Wrote cover-redesign-desktop-row.png");
    await desktop.locator("#compareGrid").screenshot({
      path: path.join(OUT_DIR, "cover-redesign-compare.png"),
    });
    console.log("Wrote cover-redesign-compare.png");
    await desktop.close();

    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await preparePage(mobile, base);
    await mobile.screenshot({
      path: path.join(OUT_DIR, "cover-redesign-mobile.png"),
      fullPage: true,
    });
    console.log("Wrote cover-redesign-mobile.png");
    await mobile.locator("#proposedRow").screenshot({
      path: path.join(OUT_DIR, "cover-redesign-mobile-row.png"),
    });
    console.log("Wrote cover-redesign-mobile-row.png");
    await mobile.locator(".mobile-frame").screenshot({
      path: path.join(OUT_DIR, "cover-redesign-mobile-frame.png"),
    });
    console.log("Wrote cover-redesign-mobile-frame.png");
    await mobile.close();
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const { chromium } = require("playwright");
const fs = require("fs");

const OUT = "/opt/cursor/artifacts/testing-final-acceptance";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const mode = process.argv[2] || "full";
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.on("request", (r) => {
    if (["document", "stylesheet", "script"].includes(r.resourceType())) {
      console.log("REQ", r.resourceType(), r.url().slice(0, 140));
    }
  });
  page.on("response", (r) => {
    if (["document", "stylesheet", "script"].includes(r.request().resourceType())) {
      console.log("RES", r.status(), r.url().slice(0, 140));
    }
  });
  page.on("requestfailed", (r) => {
    console.log("FAIL", r.resourceType(), r.failure()?.errorText, r.url().slice(0, 140));
  });

  if (mode !== "full") {
    await page.route("**/*", async (route) => {
      const u = route.request().url();
      const type = route.request().resourceType();
      if (mode === "no-css" && type === "stylesheet") return route.abort();
      if (mode === "no-app" && /\/app\.js/.test(u)) return route.abort();
      if (mode === "html-only" && type !== "document") return route.abort();
      if (/fonts\.googleapis|fonts\.gstatic/.test(u)) return route.abort();
      return route.continue();
    });
  }

  console.log("mode", mode);
  await page.goto("https://little-learner-hub-testing.onrender.com/", { waitUntil: "commit", timeout: 60000 });
  console.log("commit ok — waiting 12s without evaluate");
  await new Promise((r) => setTimeout(r, 12000));
  // Screenshot via CDP without main-thread evaluate
  try {
    const client = await page.context().newCDPSession(page);
    const shot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(`${OUT}/cdp-${mode}.png`, Buffer.from(shot.data, "base64"));
    console.log("cdp screenshot written");
  } catch (e) {
    console.log("cdp shot failed", e.message);
  }
  // Now try one timed evaluate
  try {
    const s = await Promise.race([
      page.evaluate(() => ({
        ready: document.readyState,
        hasBody: !!document.body,
        textLen: (document.body?.innerText || "").length,
        authMode: window.LLH_CONFIG?.authMode || null,
        setAuth: typeof setAuthMode,
        title: document.title,
      })),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    console.log("evaluate", s);
  } catch (e) {
    console.log("evaluate failed", e.message);
  }
  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

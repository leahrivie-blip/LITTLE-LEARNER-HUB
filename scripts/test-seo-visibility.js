#!/usr/bin/env node
/**
 * SEO visibility checks for robots.txt, sitemap, public pages, and structured data.
 * Run: node scripts/test-seo-visibility.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const seo = require("../server/seo.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19680 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-seo-${crypto.randomBytes(4).toString("hex")}.json`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
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
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      GOOGLE_SITE_VERIFICATION: "test-google-token",
      BING_SITE_VERIFICATION: "test-bing-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
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

async function main() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert(indexHtml.includes(seo.SEO_TITLE), "homepage title missing proposed SEO title");
  assert(indexHtml.includes(seo.SEO_DESCRIPTION), "homepage description missing proposed copy");
  assert(!indexHtml.includes('"@type": "Product"'), "homepage still uses Product schema");
  assert(indexHtml.includes('"@type": "Organization"'), "homepage missing Organization schema");
  assert(indexHtml.includes('"@type": "WebApplication"'), "homepage missing WebApplication schema");
  assert(!indexHtml.includes("LocalBusiness"), "homepage must not include LocalBusiness");

  const graph = seo.buildStructuredDataGraph({ foundingSoldOut: true });
  assert(graph["@graph"].some((node) => node["@type"] === "Organization"), "seo graph missing Organization");
  assert(!graph["@graph"].some((node) => node["@type"] === "LocalBusiness"), "seo graph must not include LocalBusiness");
  const org = graph["@graph"].find((node) => node["@type"] === "Organization");
  assert(!org.sameAs || org.sameAs.length === 0, "sameAs must be omitted when social env vars are unset");

  const child = startServer();
  try {
    await waitForBoot(child);

    const robots = await request("GET", "/robots.txt");
    assert(robots.status === 200, `robots.txt status ${robots.status}`);
    assert(robots.body.includes("Sitemap:"), "robots.txt missing sitemap line");
    assert(robots.body.includes("Disallow: /api/admin"), "robots.txt should block admin API");

    const sitemap = await request("GET", "/sitemap.xml");
    assert(sitemap.status === 200, `sitemap.xml status ${sitemap.status}`);
    for (const route of ["/", "/about", "/features", "/faq", "/pricing", "/contact"]) {
      assert(sitemap.body.includes(`<loc>http://127.0.0.1:${PORT}${route === "/" ? "/" : route}</loc>`) || sitemap.body.includes(route), `sitemap missing ${route}`);
    }

    for (const route of ["/about", "/features", "/faq", "/pricing", "/contact"]) {
      const page = await request("GET", route);
      assert(page.status === 200, `${route} status ${page.status}`);
      assert(page.body.includes(seo.BUSINESS_NAME), `${route} missing business name`);
      assert(page.body.includes('rel="canonical"'), `${route} missing canonical`);
      assert(page.body.includes("application/ld+json"), `${route} missing JSON-LD`);
      assert(!page.body.includes("LocalBusiness"), `${route} must not include LocalBusiness`);
    }

    const faq = await request("GET", "/faq");
    assert(faq.body.includes("FAQPage") || faq.body.includes('"@type":"FAQPage"') || faq.body.includes('"@type": "FAQPage"'), "faq page missing FAQPage schema");

    const features = await request("GET", "/features");
    assert(features.body.includes("Available Now"), "features page missing Available Now");
    assert(features.body.includes("Currently Being Built or Tested"), "features page missing in-progress section");
    assert(features.body.includes("Future Plans"), "features page missing Future Plans");
    assert(!features.body.includes("sameAs"), "features page must not include placeholder social schema");

    const pricing = await request("GET", "/pricing");
    assert(pricing.body.includes("$19.99/month"), "pricing page missing Pro Monthly price");
    assert(pricing.body.includes("$199/year"), "pricing page missing Pro Annual price");
    assert(pricing.body.includes("sold out for new signups"), "pricing page must state founding sold out for new signups");

    const contact = await request("GET", "/contact");
    assert(contact.body.includes(seo.supportEmailAddress()), "contact page missing support email");

    const home = await request("GET", "/");
    assert(home.body.includes('rel="canonical"'), "homepage missing injected canonical");
    assert(home.body.includes('name="google-site-verification"'), "homepage missing google verification injection");
    assert(home.body.includes('name="msvalidate.01"'), "homepage missing bing verification injection");

    console.log("PASS: seo visibility checks");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});

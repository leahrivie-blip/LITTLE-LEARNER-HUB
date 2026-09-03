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
const GOOGLE_ADS_TAG_ID = "AW-18405245658";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function googleAdsTagCount(html) {
  return (String(html || "").match(new RegExp(`gtag/js\\?id=${GOOGLE_ADS_TAG_ID}`, "g")) || []).length;
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
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) {
        // Curriculum seeds finish inside initializeStorage before health unlocks,
        // but wait briefly for inventory to be readable for hub pages.
        const inventory = await request("GET", "/api/public/home-inventory");
        if (inventory.status === 200) {
          try {
            const data = JSON.parse(inventory.body);
            if (Number(data.lessonPlanCount || 0) > 0) return;
          } catch { /* retry */ }
        }
      }
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server did not boot with curriculum inventory");
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
  assert(!indexHtml.includes("Little Learner Hub Founding Membership"), "homepage must not advertise Founding Membership Product schema");
  assert(!indexHtml.includes("#founding-membership"), "homepage must not include founding-membership schema id");
  assert(!/Founding Member/i.test(indexHtml), "homepage HTML must not mention Founding Member");
  assert(indexHtml.includes("Affordable Childcare Curriculum") || indexHtml.includes(seo.SEO_TITLE), "homepage title should use curriculum SEO title");
  assert(indexHtml.includes("featureList") || indexHtml.includes('"featureList"'), "homepage WebApplication should include featureList");
  assert(indexHtml.includes('"@type": "Organization"'), "homepage missing Organization schema");
  assert(indexHtml.includes('"@type": "WebApplication"'), "homepage missing WebApplication schema");
  assert(indexHtml.includes('"sameAs"'), "homepage Organization schema missing sameAs");
  assert(indexHtml.includes("https://www.tiktok.com/@leahrpoole"), "homepage schema missing TikTok");
  assert(!indexHtml.includes("youtube.com"), "homepage must not include YouTube");

  const graph = seo.buildStructuredDataGraph({ foundingSoldOut: true });
  assert(graph["@graph"].some((node) => node["@type"] === "Organization"), "seo graph missing Organization");
  assert(!graph["@graph"].some((node) => node["@type"] === "LocalBusiness"), "seo graph must not include LocalBusiness");
  const org = graph["@graph"].find((node) => node["@type"] === "Organization");
  assert(org.sameAs && org.sameAs.length === 3, "sameAs must include TikTok, Facebook, and Instagram");
  assert(org.sameAs.includes("https://www.tiktok.com/@leahrpoole"), "missing TikTok sameAs");
  assert(org.sameAs.includes("https://www.instagram.com/littlelearnershubbyleah"), "missing Instagram sameAs");
  assert(org.name === seo.BUSINESS_NAME, "Organization schema name must use official business name");
  assert(!/Little learners hub/i.test(JSON.stringify(graph)), "structured data must not use Facebook page display name");

  const forbiddenFacebookLabel = /Little learners hub/i;
  assert(!forbiddenFacebookLabel.test(indexHtml), "homepage HTML must not display Facebook page name");
  assert(indexHtml.includes(`aria-label="${seo.BUSINESS_NAME} on Facebook"`), "homepage Facebook link missing official business aria-label");
  assert(!/123 Main/i.test(indexHtml), "homepage HTML must not include fake 123 Main address placeholder");
  assert(!/Rated 5 stars/i.test(indexHtml), "homepage HTML must not claim star ratings");
  assert(!/llh-nav-rating|lp-review-stars|llh-reviews-stars/i.test(indexHtml), "homepage HTML must not ship star rating UI");
  assert(/homeReviews/i.test(indexHtml) && /lp-review-card/i.test(indexHtml), "homepage HTML must keep provider review quotes");
  assert(!/AggregateRating|reviewCount/i.test(indexHtml), "homepage must not include review schema markup");
  assert(!/\(555\)\s*123-4567|555-123-4567/i.test(indexHtml), "homepage HTML must not include fake 555 phone placeholders");

  const child = startServer();
  try {
    await waitForBoot(child);

    const robots = await request("GET", "/robots.txt");
    assert(robots.status === 200, `robots.txt status ${robots.status}`);
    assert(robots.body.includes("Sitemap:"), "robots.txt missing sitemap line");
    assert(robots.body.includes("Disallow: /api/admin"), "robots.txt should block admin API");

    const sitemap = await request("GET", "/sitemap.xml");
    assert(sitemap.status === 200, `sitemap.xml status ${sitemap.status}`);
    const hubPaths = seo.seoCurriculum.hubPages().map((page) => page.path);
    for (const route of ["/", "/about", "/features", "/faq", "/pricing", "/contact", ...hubPaths]) {
      assert(sitemap.body.includes(`<loc>http://127.0.0.1:${PORT}${route === "/" ? "/" : route}</loc>`) || sitemap.body.includes(route), `sitemap missing ${route}`);
    }

    for (const route of ["/about", "/features", "/faq", "/pricing", "/contact", ...hubPaths]) {
      const page = await request("GET", route);
      assert(page.status === 200, `${route} status ${page.status}`);
      assert(page.body.includes(seo.BUSINESS_NAME), `${route} missing business name`);
      assert(page.body.includes('rel="canonical"'), `${route} missing canonical`);
      assert(page.body.includes("application/ld+json"), `${route} missing JSON-LD`);
      assert(!page.body.includes("LocalBusiness"), `${route} must not include LocalBusiness`);
      assert(page.body.includes('name="viewport"'), `${route} missing mobile viewport`);
      assert(googleAdsTagCount(page.body) === 1, `${route} must load one Google Ads base tag`);
      assert(page.body.includes(`gtag("config", "${GOOGLE_ADS_TAG_ID}")`), `${route} missing Google Ads config`);
    }

    const inventory = JSON.parse((await request("GET", "/api/public/home-inventory")).body);
    assert(Number(inventory.lessonPlanCount) > 0, "expected seeded lesson plans for hub pages");

    const infant = await request("GET", "/infant-lesson-plans");
    assert(infant.body.includes("<h1>"), "infant hub missing H1");
    assert(infant.body.includes("Infant"), "infant hub missing Infant labeling");
    assert(infant.body.includes("seo-card") || infant.body.includes("lesson plan"), "infant hub missing live lesson cards");
    assert(infant.body.includes("FAQPage") || infant.body.includes('"@type":"FAQPage"') || infant.body.includes('"@type": "FAQPage"'), "infant hub missing FAQ schema");
    assert(infant.body.includes("ItemList") || infant.body.includes('"@type":"ItemList"') || infant.body.includes('"@type": "ItemList"'), "infant hub missing ItemList schema");
    assert(infant.body.includes("/toddler-lesson-plans"), "infant hub missing related toddler link");
    assert(infant.body.includes("Create free account") || infant.body.includes("signup=1"), "infant hub missing free CTA");

    const sensory = await request("GET", "/sensory-activities");
    assert(sensory.body.includes("Sensory"), "sensory hub missing Sensory labeling");
    assert(sensory.body.includes("seo-card") || /activity/i.test(sensory.body), "sensory hub missing activity cards");

    const curriculum = await request("GET", "/daycare-curriculum");
    assert(curriculum.body.includes("Infant"), "curriculum hub missing Infant section");
    assert(curriculum.body.includes("Toddler"), "curriculum hub missing Toddler section");
    assert(curriculum.body.includes("Preschool"), "curriculum hub missing Preschool section");
    assert(curriculum.body.includes("/infant-lesson-plans"), "curriculum hub missing infant internal link");

    const faq = await request("GET", "/faq");
    assert(!/Founding Member/i.test(faq.body), "faq must not mention Founding Member");
    assert(faq.body.includes("FAQPage") || faq.body.includes('"@type":"FAQPage"') || faq.body.includes('"@type": "FAQPage"'), "faq page missing FAQPage schema");

    const features = await request("GET", "/features");
    assert(features.body.includes("Available Now"), "features page missing Available Now");
    assert(features.body.includes("Currently Being Built or Tested"), "features page missing in-progress section");
    assert(features.body.includes("Future Plans"), "features page missing Future Plans");

    const pricing = await request("GET", "/pricing");
    assert(pricing.body.includes("$19.99/month"), "pricing page missing Pro Monthly price");
    assert(pricing.body.includes("$199/year"), "pricing page missing Pro Annual price");
    assert(!/Founding Member/i.test(pricing.body), "pricing page must not mention Founding Member");
    assert(pricing.body.includes("$19.99/month"), "pricing page missing Pro Monthly after founding removal");

    const contact = await request("GET", "/contact");
    assert(contact.body.includes(seo.supportEmailAddress()), "contact page missing support email");
    assert(contact.body.includes("https://www.tiktok.com/@leahrpoole"), "contact page missing TikTok");
    assert(contact.body.includes("https://www.instagram.com/littlelearnershubbyleah"), "contact page missing Instagram");
    assert(!contact.body.includes("youtube.com"), "contact page must not include YouTube");

    const about = await request("GET", "/about");
    assert(about.body.includes("Meet Leah"), "about page missing Meet Leah section");
    assert(about.body.includes("What Little Learner Hub Does Now"), "about page missing current features section");
    assert(about.body.includes("What I&rsquo;m Building Next"), "about page missing future plans section");
    assert(about.body.includes("https://www.facebook.com/profile.php?id=61590609343290"), "about page missing Facebook link");
    assert(about.body.includes(`aria-label="${seo.BUSINESS_NAME} on Facebook"`), "about Facebook link missing official business aria-label");

    const home = await request("GET", "/");
    assert(home.body.includes('rel="canonical"'), "homepage missing injected canonical");
    assert(googleAdsTagCount(home.body) === 1, "homepage must load one Google Ads base tag");
    assert(home.body.includes(`gtag("config", "${GOOGLE_ADS_TAG_ID}")`), "homepage missing Google Ads config");
    assert(home.body.includes('name="google-site-verification"'), "homepage missing google verification injection");
    assert(home.body.includes('name="msvalidate.01"'), "homepage missing bing verification injection");
    assert(home.body.includes(`aria-label="${seo.BUSINESS_NAME} on Facebook"`), "homepage Facebook link missing official business aria-label");
    assert(!forbiddenFacebookLabel.test(home.body), "homepage must not display Facebook page name");
    assert(!/123 Main/i.test(home.body), "served homepage must not include fake address placeholder");
    assert(/homeReviews/i.test(home.body) && /lp-review-card/i.test(home.body), "served homepage must keep provider reviews");
    assert(!/Rated 5 stars|llh-nav-rating|lp-review-stars/i.test(home.body), "served homepage must not include star rating UI");
    assert(!/AggregateRating|reviewCount/i.test(home.body), "served homepage must not include review schema");
    assert(!/LocalBusiness/i.test(home.body), "homepage must not include LocalBusiness schema");

    for (const route of ["/about", "/features", "/faq", "/pricing", "/contact", ...hubPaths]) {
      const page = await request("GET", route);
      assert(!forbiddenFacebookLabel.test(page.body), `${route} must not display Facebook page name`);
      assert(!/123 Main|LocalBusiness|AggregateRating/i.test(page.body), `${route} must not include fake address or review/local business schema`);
    }

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

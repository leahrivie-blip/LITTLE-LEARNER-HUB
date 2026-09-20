/**
 * SEO helpers: robots.txt, sitemap.xml, crawlable public pages, structured data.
 * Online platform only — no LocalBusiness / fake physical address.
 * Curriculum hub pages are rendered from live library data via seo-curriculum.js.
 */
const fs = require("node:fs");
const path = require("node:path");
const seoCurriculum = require("./seo-curriculum.js");

/** Optional provider: () => ({ lessonPlans, activities, series, freeLessonPlanIds, updatedAt }) */
let curriculumSnapshotProvider = null;

function configureCurriculumSnapshotProvider(provider) {
  curriculumSnapshotProvider = typeof provider === "function" ? provider : null;
}

function loadCurriculumSnapshot() {
  if (!curriculumSnapshotProvider) {
    return { lessonPlans: [], activities: [], series: [], freeLessonPlanIds: [], updatedAt: "" };
  }
  try {
    const snapshot = curriculumSnapshotProvider() || {};
    return {
      lessonPlans: Array.isArray(snapshot.lessonPlans) ? snapshot.lessonPlans : [],
      activities: Array.isArray(snapshot.activities) ? snapshot.activities : [],
      series: Array.isArray(snapshot.series) ? snapshot.series : [],
      freeLessonPlanIds: Array.isArray(snapshot.freeLessonPlanIds) ? snapshot.freeLessonPlanIds : [],
      updatedAt: snapshot.updatedAt || "",
    };
  } catch (error) {
    console.error("[seo-curriculum] snapshot provider failed:", error.message);
    return { lessonPlans: [], activities: [], series: [], freeLessonPlanIds: [], updatedAt: "" };
  }
}

const BUSINESS_NAME = "Little Learner Hub by Leah";
const SHORT_NAME = "Little Learner Hub";
const DEFAULT_SITE_URL = "https://littlelearnershubbyleah.com";
const GOOGLE_ADS_TAG_ID = "AW-18405245658";

function googleConsentDefaultTag() {
  return `<script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag("consent", "default", {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
    </script>`;
}

function googleAdsBaseTag() {
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_TAG_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag("js", new Date());
      gtag("config", "${GOOGLE_ADS_TAG_ID}");
    </script>`;
}

function supportEmailAddress() {
  const raw = String(process.env.SUPPORT_EMAIL_TO || "support@littlelearnershubbyleah.com").trim();
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

const SUPPORT_EMAIL = supportEmailAddress();
const FOUNDER_NAME = process.env.ADMIN_NAME || "Leah";

const SEO_TITLE = "Affordable Childcare Curriculum & Lesson Plans for Busy Teachers | Little Learner Hub";
const SEO_DESCRIPTION = "Ready-to-use lesson plans, activities, printables, songs, books, and teaching resources for infant, toddler, and preschool classrooms.";

const OFFICIAL_SOCIAL_PROFILES = [
  { label: "TikTok", url: "https://www.tiktok.com/@leahrpoole" },
  { label: "Facebook", url: "https://www.facebook.com/profile.php?id=61590609343290" },
  { label: "Instagram", url: "https://www.instagram.com/littlelearnershubbyleah" },
];

function siteUrl() {
  return String(process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
}

function absoluteUrl(routePath = "/") {
  const base = siteUrl();
  const pathPart = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${base}${pathPart}`;
}

function logoUrl() {
  return absoluteUrl("/images/icons/icon-512.png");
}

function ogImageUrl() {
  const custom = String(process.env.LLH_OG_IMAGE_URL || "").trim();
  if (custom) return custom;
  const customPath = path.join(__dirname, "..", "images", "og", "llh-share.png");
  if (fs.existsSync(customPath)) return absoluteUrl("/images/og/llh-share.png");
  return logoUrl();
}

function founderImageUrl() {
  const founderImage = path.join(__dirname, "..", "images", "leah-founder.jpg");
  return fs.existsSync(founderImage) ? "/images/leah-founder.jpg" : "";
}

function socialProfileUrls() {
  const envMap = {
    LLH_SOCIAL_TIKTOK_URL: "https://www.tiktok.com/@leahrpoole",
    LLH_SOCIAL_FACEBOOK_URL: "https://www.facebook.com/profile.php?id=61590609343290",
    LLH_SOCIAL_INSTAGRAM_URL: "https://www.instagram.com/littlelearnershubbyleah",
  };
  const fromEnv = Object.entries(envMap)
    .map(([envKey, fallback]) => String(process.env[envKey] || fallback).trim())
    .filter((url) => /^https?:\/\//i.test(url));
  if (fromEnv.length) return fromEnv;
  return OFFICIAL_SOCIAL_PROFILES.map((profile) => profile.url);
}

function socialLinkAriaLabel(platformLabel) {
  return `${BUSINESS_NAME} on ${platformLabel}`;
}

function renderSocialLinksHtml({ heading = "" } = {}) {
  const items = OFFICIAL_SOCIAL_PROFILES.map((profile) => (
    `<a href="${escapeHtml(profile.url)}" rel="noopener noreferrer" target="_blank" aria-label="${escapeHtml(socialLinkAriaLabel(profile.label))}">${escapeHtml(profile.label)}</a>`
  )).join(" · ");
  if (!items) return "";
  const headingHtml = heading ? `<p class="social-heading">${escapeHtml(heading)}</p>` : "";
  return `<nav class="social-links" aria-label="${escapeHtml(BUSINESS_NAME)} official social profiles">${headingHtml}<p>${items}</p></nav>`;
}

function renderPublicFooterHtml() {
  const hubLinks = seoCurriculum.hubPages()
    .map((page) => `<a href="${escapeHtml(page.path)}">${escapeHtml(page.navLabel)}</a>`)
    .join(" · ");
  return `
      <footer>
        <p>© ${new Date().getFullYear()} ${escapeHtml(BUSINESS_NAME)}. All rights reserved.</p>
        <p><a href="/about">About</a> · <a href="/features">Features</a> · <a href="/faq">FAQ</a> · <a href="/pricing">Pricing</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/privacy-settings">Privacy Settings</a></p>
        <p class="footer-hub">${hubLinks}</p>
        ${renderSocialLinksHtml()}
      </footer>`;
}

function verificationMetaTags() {
  const tags = [];
  const google = String(process.env.GOOGLE_SITE_VERIFICATION || "").trim();
  const bing = String(process.env.BING_SITE_VERIFICATION || "").trim();
  if (google) tags.push(`<meta name="google-site-verification" content="${escapeHtml(google)}" />`);
  if (bing) tags.push(`<meta name="msvalidate.01" content="${escapeHtml(bing)}" />`);
  return tags.join("\n    ");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildStructuredDataGraph(options = {}) {
  const url = siteUrl();
  const sameAs = socialProfileUrls();
  const proMonthly = String(options.proMonthlyPrice || "19.99");
  const foundingSoldOut = options.foundingSoldOut !== false;

  const organization = {
    "@type": "Organization",
    "@id": `${url}/#organization`,
    name: BUSINESS_NAME,
    alternateName: SHORT_NAME,
    url,
    logo: {
      "@type": "ImageObject",
      url: logoUrl(),
      width: 512,
      height: 512,
    },
    email: SUPPORT_EMAIL,
    description: SEO_DESCRIPTION,
    founder: {
      "@type": "Person",
      name: FOUNDER_NAME,
    },
    ...(sameAs.length ? { sameAs } : {}),
  };

  const website = {
    "@type": "WebSite",
    "@id": `${url}/#website`,
    name: BUSINESS_NAME,
    alternateName: SHORT_NAME,
    url,
    description: SEO_DESCRIPTION,
    publisher: { "@id": `${url}/#organization` },
    inLanguage: "en-US",
  };

  const webApplication = {
    "@type": "WebApplication",
    "@id": `${url}/#webapp`,
    name: BUSINESS_NAME,
    alternateName: SHORT_NAME,
    url,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript. Works in modern desktop and mobile browsers.",
    description: SEO_DESCRIPTION,
    offers: [
      {
        "@type": "Offer",
        name: "Free Plan",
        price: "0",
        priceCurrency: "USD",
        description: "Free plan with 11 complete starter lesson plans across Infant, Toddler, and Preschool.",
        url: `${url}/?view=pricing`,
      },
      {
        "@type": "Offer",
        name: "Pro Monthly",
        price: proMonthly,
        priceCurrency: "USD",
        description: "Full lesson-plan and activity libraries, curriculum calendar and planner, AI documentation helpers, child profiles, and expanded limits.",
        url: `${url}/?view=pricing`,
      },
      {
        "@type": "Offer",
        name: "Pro Annual",
        price: "199",
        priceCurrency: "USD",
        description: "Same Pro platform access as Pro Monthly, billed annually.",
        url: `${url}/?view=pricing`,
      },
    ],
    featureList: [
      "Hundreds of ready-to-use lesson plans for infants, toddlers, preschoolers, mixed-age groups, holidays, and seasonal themes",
      "Thousands of classroom activities with play-based learning ideas and printable resources",
      "Curriculum Calendar and Lesson Planner for organizing weekly plans",
      "AI Documentation Helpers for observations, parent messages, daily reports, incident reports, and more",
      "Child Profiles for documentation and developmental observations",
      "In-app lesson plan, activity, and feature requests",
      "Built by a childcare provider and continuously improved with provider feedback",
    ],
    provider: { "@id": `${url}/#organization` },
  };

  // Founding Member acquisition is closed — never advertise a Founding offer in structured data.
  void foundingSoldOut;

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, webApplication],
  };
}

function publicPageRoutes() {
  return [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/about", changefreq: "monthly", priority: "0.9" },
    { path: "/features", changefreq: "monthly", priority: "0.9" },
    { path: "/faq", changefreq: "monthly", priority: "0.8" },
    { path: "/pricing", changefreq: "weekly", priority: "0.8" },
    { path: "/contact", changefreq: "monthly", priority: "0.7" },
    { path: "/how-it-works", changefreq: "monthly", priority: "0.8" },
    { path: "/privacy", changefreq: "yearly", priority: "0.5" },
    { path: "/terms", changefreq: "yearly", priority: "0.5" },
    ...seoCurriculum.hubPageRoutes(),
  ];
}

function renderRobotsTxt() {
  const base = siteUrl();
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/admin/",
    "Disallow: /api/admin",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

function renderSitemapXml() {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = publicPageRoutes().map((entry) => {
    const loc = absoluteUrl(entry.path === "/" ? "/" : entry.path);
    return [
      "  <url>",
      `    <loc>${escapeXml(loc)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${entry.changefreq}</changefreq>`,
      `    <priority>${entry.priority}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderPublicPage({ title, description, canonicalPath, bodyHtml, extraSchema = null, skipDefaultCta = false, pageClass = "" }) {
  const url = absoluteUrl(canonicalPath);
  const graph = buildStructuredDataGraph();
  const extras = Array.isArray(extraSchema) ? extraSchema : (extraSchema ? [extraSchema] : []);
  extras.filter(Boolean).forEach((node) => graph["@graph"].push(node));
  const verification = verificationMetaTags();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(BUSINESS_NAME)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:image" content="${escapeHtml(ogImageUrl())}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl())}" />
    <link rel="icon" href="/images/icons/icon-192.png" />
    ${googleConsentDefaultTag()}
    ${googleAdsBaseTag()}
    <script src="/scripts/google-consent.js" defer></script>
    ${verification ? `${verification}\n    ` : ""}<script type="application/ld+json">${JSON.stringify(graph)}</script>
    <style>
      :root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; line-height: 1.55; color: #1f2a44; }
      body { margin: 0; background: linear-gradient(180deg, #eef6fb 0%, #f8faff 42%, #fff 100%); }
      .wrap { max-width: 920px; margin: 0 auto; padding: 28px 18px 56px; }
      header { margin-bottom: 24px; }
      .brand { font-weight: 700; color: #2f6f8f; text-decoration: none; }
      .public-nav { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px; }
      .public-nav a { color: #215f7c; font-weight: 600; text-decoration: none; }
      .public-nav a:hover { text-decoration: underline; }
      h1 { font-size: clamp(1.7rem, 4vw, 2.15rem); margin: 0.4rem 0 0.8rem; line-height: 1.2; }
      h2 { margin-top: 2rem; font-size: 1.25rem; }
      h3 { margin: 0.35rem 0 0.45rem; font-size: 1.05rem; }
      p, li { font-size: 1.02rem; }
      .cta { display: inline-block; margin: 12px 10px 0 0; padding: 12px 18px; border-radius: 10px; background: #2f6f8f; color: #fff; text-decoration: none; font-weight: 600; }
      .cta-secondary { background: #fff; color: #2f6f8f; border: 1px solid #9fc3d4; }
      .muted { color: #5b6478; }
      .pill { display: inline-block; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 0.2rem 0.55rem; border-radius: 999px; background: #e7f2f7; color: #2f6f8f; margin-left: 0.35rem; }
      .status-testing { background: #fff4df; color: #8a5b00; }
      .status-later { background: #eef2f7; color: #4d5a6d; }
      footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #dbe3f2; font-size: 0.92rem; color: #5b6478; }
      .footer-hub { line-height: 1.8; }
      .social-links { margin-top: 12px; }
      .social-links a { color: #2f6f8f; text-decoration: none; }
      .social-links a:hover { text-decoration: underline; }
      .social-heading { margin: 0 0 4px; font-weight: 600; color: #1f2a44; }
      ul { padding-left: 1.2rem; }
      .seo-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin: 16px 0 8px; }
      .seo-card { background: rgba(255,255,255,0.92); border: 1px solid #d7e5ee; border-radius: 12px; padding: 14px 14px 12px; }
      .seo-card a { color: #215f7c; }
      .seo-card-image { display: block; width: calc(100% + 28px); height: 156px; margin: -14px -14px 12px; border-radius: 12px 12px 0 0; object-fit: cover; background: #eef6fb; }
      .seo-card-meta { margin: 0; font-size: 0.88rem; color: #5b6478; }
      .seo-badge { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #215f7c; background: #e7f2f7; padding: 0.15rem 0.45rem; border-radius: 999px; }
      .seo-theme { margin: 0.25rem 0 0.5rem; font-size: 0.95rem; }
      .seo-related { margin-top: 2rem; }
      .seo-stat-list { display: grid; gap: 0.35rem; }
      .founder-grid { display: grid; grid-template-columns: minmax(180px, 260px) 1fr; gap: 24px; align-items: center; margin: 20px 0; }
      .founder-photo { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 18px; box-shadow: 0 12px 30px rgba(31,42,68,0.16); }
      .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 16px 0; }
      .feature-grid article { background: rgba(255,255,255,0.92); border: 1px solid #d7e5ee; border-radius: 12px; padding: 16px; }
      .feature-grid p { margin: 0; }
      .about-page .wrap { max-width: 1180px; padding-top: 22px; }
      .about-page .about-hero { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(280px, 0.92fr); gap: clamp(28px, 5vw, 64px); align-items: center; padding: clamp(28px, 5vw, 64px); border-radius: 28px; background: linear-gradient(135deg, #fff8f2, #edf7fb); border: 1px solid #d7e5ee; box-shadow: 0 18px 48px rgba(31,42,68,0.12); }
      .about-page .about-eyebrow { margin: 0 0 10px; color: #2f6f8f; font-size: 0.76rem; font-weight: 800; letter-spacing: 0.1em; }
      .about-page .about-hero h1 { max-width: 680px; font-size: clamp(2rem, 4.6vw, 3.55rem); }
      .about-page .about-lead { max-width: 610px; margin: 0; color: #43526b; font-size: clamp(1.05rem, 1.8vw, 1.2rem); }
      .about-page .about-actions { margin-top: 8px; }
      .about-page .about-portrait-wrap { position: relative; box-sizing: border-box; width: min(100%, 380px); justify-self: end; padding: 10px; border-radius: 26px; background: #fff; box-shadow: 0 16px 36px rgba(31,42,68,0.16); }
      .about-page .about-portrait { display: block; width: 100%; height: auto; aspect-ratio: 1290 / 1595; object-fit: contain; object-position: center top; border-radius: 18px; background: #e9f2f7; }
      .about-page .about-founder-badge { position: absolute; right: -18px; bottom: 22px; max-width: 210px; padding: 12px 14px; border: 1px solid #d7e5ee; border-radius: 14px; background: rgba(255,255,255,0.97); box-shadow: 0 10px 24px rgba(31,42,68,0.13); }
      .about-page .about-founder-badge strong, .about-page .about-founder-badge span { display: block; }
      .about-page .about-founder-badge span { color: #5b6478; font-size: 0.88rem; }
      .about-page .about-section { margin-top: clamp(48px, 8vw, 92px); }
      .about-page .about-section h2 { margin-top: 0; font-size: clamp(1.55rem, 3vw, 2.3rem); }
      .about-page .about-section-intro { max-width: 690px; color: #4c5b71; font-size: 1.06rem; }
      .about-page .about-story { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 0.88fr); gap: clamp(24px, 5vw, 64px); align-items: center; }
      .about-page .about-story-copy p { max-width: 650px; }
      .about-page .about-pain-grid, .about-page .about-product-grid, .about-page .about-use-grid, .about-page .about-roadmap-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
      .about-page .about-pain-card, .about-page .about-use-card, .about-page .about-roadmap-card { padding: 18px; border: 1px solid #d7e5ee; border-radius: 16px; background: #fff; box-shadow: 0 8px 20px rgba(31,42,68,0.06); }
      .about-page .about-pain-card h3, .about-page .about-use-card h3, .about-page .about-roadmap-card h3 { color: #215f7c; }
      .about-page .about-shift { margin: 22px 0 0; font-family: Georgia, serif; font-size: 1.35rem; font-weight: 700; color: #2f6f8f; }
      .about-page .about-product-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .about-page .about-product-card { overflow: hidden; border: 1px solid #d7e5ee; border-radius: 16px; background: #fff; box-shadow: 0 10px 22px rgba(31,42,68,0.07); }
      .about-page .about-product-card img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; background: #eef6fb; }
      .about-page .about-product-card div { padding: 16px; }
      .about-page .about-product-card h3 { margin-top: 0; }
      .about-page .about-product-card p, .about-page .about-use-card p, .about-page .about-roadmap-card p { margin-bottom: 0; color: #5b6478; font-size: 0.96rem; }
      .about-page .about-founder-note { max-width: 820px; margin-right: auto; margin-left: auto; padding: clamp(24px, 4vw, 40px); border-left: 5px solid #7ba8c9; border-radius: 18px; background: #fff; box-shadow: 0 10px 24px rgba(31,42,68,0.07); }
      .about-page .about-founder-note p { max-width: 680px; margin-bottom: 0; color: #4c5b71; font-size: 1.06rem; }
      .about-page .about-use-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .about-page .about-use-card span { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: #e7f2f7; color: #2f6f8f; font-weight: 800; }
      .about-page .about-link { display: inline-block; margin-top: 18px; color: #215f7c; font-weight: 700; }
      .about-page .about-cta-band { padding: clamp(26px, 5vw, 48px); border-radius: 24px; background: #2f6f8f; color: #fff; box-shadow: 0 16px 34px rgba(33,95,124,0.2); }
      .about-page .about-cta-band h2, .about-page .about-cta-band p { color: #fff; }
      .about-page .about-cta-band .cta { background: #fff; color: #215f7c; }
      .about-page .about-cta-band .cta-secondary { border-color: rgba(255,255,255,0.72); background: transparent; color: #fff; }
      .about-page .about-roadmap { padding: clamp(24px, 4vw, 40px); border-radius: 22px; background: #f4f7fa; border: 1px solid #dbe3f2; }
      @media (min-width: 601px) and (max-width: 900px) {
        .about-page .about-hero { grid-template-columns: 1fr; padding: clamp(32px, 6vw, 48px); }
        .about-page .about-portrait-wrap { width: min(100%, 360px); justify-self: center; }
        .about-page .about-story { grid-template-columns: 1fr; }
        .about-page .about-product-grid, .about-page .about-use-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 600px) {
        .wrap { padding: 22px 14px 48px; }
        .cta { width: 100%; text-align: center; margin-right: 0; }
        .founder-grid { grid-template-columns: 1fr; }
        .founder-photo { max-width: 280px; }
        .about-page .wrap { padding: 16px 14px 44px; }
        .about-page .about-hero, .about-page .about-story { grid-template-columns: 1fr; padding: 26px 20px; }
        .about-page .about-hero { gap: 24px; }
        .about-page .about-hero h1 { max-width: 100%; font-size: clamp(1.75rem, 7.4vw, 2.1rem); }
        .about-page .about-portrait-wrap { width: min(86vw, 320px); justify-self: center; margin-top: 0; }
        .about-page .about-actions .cta { display: flex; box-sizing: border-box; align-items: center; justify-content: center; min-height: 48px; }
        .about-page .about-founder-badge { position: static; max-width: none; margin: 12px 0 0; }
        .about-page .about-pain-grid, .about-page .about-product-grid, .about-page .about-use-grid, .about-page .about-roadmap-grid { grid-template-columns: 1fr; }
        .about-page .about-section { margin-top: 48px; }
      }
    </style>
  </head>
  <body${pageClass ? ` class="${escapeHtml(pageClass)}"` : ""}>
    <div class="wrap">
      <header>
        <a class="brand" href="/">${escapeHtml(BUSINESS_NAME)}</a>
        <p class="muted">Online childcare lesson-planning and program-support platform</p>
        <nav class="public-nav" aria-label="Public pages"><a href="/daycare-curriculum">Lesson Plans</a><a href="/childcare-activities">Activities</a><a href="/how-it-works">How It Works</a><a href="/features">Features</a><a href="/pricing">Pricing</a><a href="/about">About</a></nav>
      </header>
      ${bodyHtml}
      ${skipDefaultCta ? "" : `<p><a class="cta" href="/">Open Little Learner Hub</a></p>`}
      ${renderPublicFooterHtml()}
    </div>
  </body>
</html>`;
}

function renderCurriculumHubPage(page) {
  const snapshot = loadCurriculumSnapshot();
  const rendered = seoCurriculum.renderHubPageBody(page, snapshot, { escapeHtml });
  const schemas = [
    seoCurriculum.faqSchemaForPage({ ...page, faq: rendered.faqItems }, absoluteUrl),
    seoCurriculum.itemListSchemaForPage(page, rendered.listItems || [], absoluteUrl),
  ].filter(Boolean);
  return renderPublicPage({
    title: page.title,
    description: page.description,
    canonicalPath: page.path,
    bodyHtml: rendered.bodyHtml,
    extraSchema: schemas,
    skipDefaultCta: true,
  });
}

function renderAboutPage() {
  const founderImage = founderImageUrl();
  const founderVisual = founderImage
    ? `<div class="about-portrait-wrap"><img class="about-portrait" src="${escapeHtml(founderImage)}" alt="Leah, founder of Little Learner Hub" width="1290" height="1595" fetchpriority="high" decoding="async" /><div class="about-founder-badge"><strong>Created by Leah</strong><span>Childcare provider + mom of three</span></div></div>`
    : `<div class="about-portrait-wrap" role="img" aria-label="Founder photo coming soon"></div>`;
  return renderPublicPage({
    title: `About | ${BUSINESS_NAME}`,
    description: "Meet Leah, the childcare provider behind Little Learner Hub — affordable childcare curriculum and ready-to-use lesson planning for busy teachers.",
    canonicalPath: "/about",
    pageClass: "about-page",
    bodyHtml: `
      <section class="about-hero" aria-labelledby="about-hero-title">
        <div>
          <p class="about-eyebrow">ABOUT LITTLE LEARNER HUB</p>
          <h1 id="about-hero-title">Built by a childcare provider who knows how busy the classroom really gets.</h1>
          <p class="about-lead">I&rsquo;m Leah — a childcare provider and mom of three. I created Little Learner Hub because teachers shouldn&rsquo;t have to spend their nights searching for activities, piecing together lesson plans, and starting every classroom document from scratch.</p>
          <p class="about-actions"><a class="cta" href="/daycare-curriculum">Explore Lesson Plans</a><a class="cta cta-secondary" href="/?signup=1">Start Free</a></p>
        </div>
        ${founderVisual}
      </section>

      <section class="about-section about-story" aria-labelledby="about-why-title">
        <div class="about-story-copy">
          <h2 id="about-why-title">I built what I wished I had in the classroom.</h2>
          <p>Planning, finding activities, preparing printables, and writing documentation can take over the hours teachers need for themselves. It can also pull attention away from the children right in front of you.</p>
          <p>Little Learner Hub brings those pieces together so you can open a week, see what you need, and get started without searching everywhere or rebuilding the same materials from scratch.</p>
          <p class="about-shift">Little Learner Hub puts the pieces together.</p>
        </div>
        <div class="about-pain-grid">
          <article class="about-pain-card"><h3>Planning after hours</h3><p>Stop spending your evenings building next week&rsquo;s lesson plan.</p></article>
          <article class="about-pain-card"><h3>Searching everywhere</h3><p>Find classroom ideas without searching Pinterest for an hour.</p></article>
          <article class="about-pain-card"><h3>Starting from scratch</h3><p>Keep the work you need together instead of recreating it each week.</p></article>
        </div>
      </section>

      <section class="about-section" aria-labelledby="about-days-title">
        <h2 id="about-days-title">Made for real childcare days.</h2>
        <p class="about-section-intro">Real curriculum visuals, familiar classroom tasks, and simple places to start.</p>
        <div class="about-product-grid">
          <article class="about-product-card"><img src="/images/lesson-covers/farm.svg" alt="Farm Animals lesson plan cover" width="640" height="360" loading="lazy" decoding="async" /><div><h3>Ready-to-use weekly lesson plans</h3><p>Choose a theme, open the week, and start planning.</p></div></article>
          <article class="about-product-card"><img src="/images/lesson-covers/colors.svg" alt="Colors lesson plan cover" width="640" height="360" loading="lazy" decoding="async" /><div><h3>Activities + printables</h3><p>Keep classroom ideas and printable resources together.</p></div></article>
          <article class="about-product-card"><img src="/images/lesson-covers/community-helpers.svg" alt="Community Helpers lesson plan cover" width="640" height="360" loading="lazy" decoding="async" /><div><h3>Planning tools</h3><p>Organize what you&rsquo;re teaching without rebuilding the week from scratch.</p></div></article>
          <article class="about-product-card"><img src="/images/lesson-covers/feelings.svg" alt="Feelings lesson plan cover" width="640" height="360" loading="lazy" decoding="async" /><div><h3>Documentation help</h3><p>Turn quick classroom notes into clearer observations and family updates.</p></div></article>
        </div>
      </section>

      <section class="about-section about-founder-note" aria-labelledby="about-founder-title">
        <h2 id="about-founder-title">Made by someone who still thinks like a teacher.</h2>
        <p>I listen to childcare-provider requests and keep improving Little Learner Hub around the work that happens before, during, and after a real classroom day.</p>
      </section>

      <section class="about-section" aria-labelledby="about-use-title">
        <h2 id="about-use-title">What you can use today</h2>
        <div class="about-use-grid">
          <article class="about-use-card"><span>01</span><h3>Weekly lesson plans</h3><p>Open a ready-to-use theme for your classroom.</p></article>
          <article class="about-use-card"><span>02</span><h3>Activity library</h3><p>Find play-based ideas connected to real lesson plans.</p></article>
          <article class="about-use-card"><span>03</span><h3>Curriculum calendar</h3><p>Organize what you are teaching in one place.</p></article>
          <article class="about-use-card"><span>04</span><h3>Documentation helpers</h3><p>Turn notes into clearer classroom records.</p></article>
          <article class="about-use-card"><span>05</span><h3>Child profiles</h3><p>Keep observations organized for the children you teach.</p></article>
          <article class="about-use-card"><span>06</span><h3>Print + download tools</h3><p>Prepare the lesson resources your classroom needs.</p></article>
        </div>
        <a class="about-link" href="/features">See all features →</a>
      </section>

      <section class="about-section about-cta-band" aria-labelledby="about-try-title">
        <h2 id="about-try-title">See whether Little Learner Hub fits your classroom.</h2>
        <p>Start with the Free plan, explore complete starter lesson plans, and see how the planning experience works before upgrading.</p>
        <p><a class="cta" href="/?signup=1">Start Free</a><a class="cta cta-secondary" href="/daycare-curriculum">Browse Lesson Plans</a></p>
      </section>

      <section class="about-section about-roadmap" aria-labelledby="about-roadmap-title">
        <h2 id="about-roadmap-title">Little Learner Hub is still growing.</h2>
        <p class="about-section-intro">I&rsquo;m continuing to build tools around the parts of childcare work that take the most time.</p>
        <div class="about-roadmap-grid">
          <article class="about-roadmap-card"><h3>Daily classroom operations</h3><p>Coming later / in development</p></article>
          <article class="about-roadmap-card"><h3>Family communication</h3><p>Coming later / in development</p></article>
          <article class="about-roadmap-card"><h3>Program management tools</h3><p>Coming later / in development</p></article>
        </div>
        <a class="about-link" href="/features">View the full roadmap →</a>
      </section>

      <section class="about-section about-cta-band" aria-labelledby="about-final-title">
        <h2 id="about-final-title">Spend less time building the plan. Spend more time teaching it.</h2>
        <p><a class="cta" href="/?signup=1">Start Free</a><a class="cta cta-secondary" href="/daycare-curriculum">Explore Curriculum</a></p>
      </section>

      ${renderSocialLinksHtml({ heading: `Connect with ${BUSINESS_NAME}` })}
    `,
  });
}

function renderFeaturesPage() {
  return renderPublicPage({
    title: `Features | ${BUSINESS_NAME}`,
    description: "Explore Little Learner Hub — hundreds of lesson plans, thousands of activities, curriculum planning, AI documentation helpers, child profiles, and in-app requests. Built by a childcare provider.",
    canonicalPath: "/features",
    bodyHtml: `
      <h1>Curriculum &amp; Teacher Features</h1>
      <p>Little Learner Hub is <strong>affordable childcare curriculum and ready-to-use lesson planning</strong> for busy teachers — with lesson plans, activities, printables, planning tools, and documentation helpers. This page separates live features from testing and future roadmap work.</p>
      <h2>Available Now <span class="pill">Live</span></h2>
      <div class="feature-grid">
        <article><h3>Lesson Plans</h3><p>Start with a weekly theme instead of a blank page. <a href="/daycare-curriculum">Browse real plans</a> by age group.</p></article>
        <article><h3>Activity Center</h3><p>Find play-based activities connected to real lesson plans. <a href="/childcare-activities">Explore activities</a>.</p></article>
        <article><h3>Calendar Planning</h3><p>Organize the plans you are teaching, all in one place after you sign in.</p></article>
        <article><h3>Child Profiles &amp; Documentation</h3><p>Keep observations organized and use Documentation Helpers to turn notes into clearer records.</p></article>
        <article><h3>Teaching Kits &amp; Printables</h3><p>Where a lesson includes them, classroom-ready resources stay connected to that lesson.</p></article>
        <article><h3>Free and Pro Access</h3><p>Free includes 11 starter lesson plans with no credit card. Pro unlocks the broader library and additional tools.</p></article>
      </div>
      <p>If you can&rsquo;t find the lesson plan, activity, or feature you need, you can request it directly from inside Little Learner Hub. New content and improvements are added regularly based on provider feedback.</p>
      <h2>Currently Being Built or Tested <span class="pill status-testing">In progress</span></h2>
      <ul>
        <li>Expanded Home Daycare Hub workflows (testing-site only today)</li>
        <li>Family Hub and digital forms workflows</li>
        <li>Expanded AI Guide tools beyond Documentation Helpers</li>
        <li>Selected family-communication tools</li>
      </ul>
      <p class="muted">These items are in active development or limited testing. They are not advertised as fully available for every account until launched.</p>
      <h2>Future Plans <span class="pill status-later">Planned</span></h2>
      <ul>
        <li>Attendance, meals, naps, and daily logs</li>
        <li>Child portfolios and progress goals</li>
        <li>Expanded parent messaging and signatures</li>
        <li>Enrollment and waitlist tools</li>
        <li>Classroom Assistant and center staff tools</li>
        <li>More automated weekly planning workflows</li>
      </ul>
    `,
  });
}

function renderFaqPage() {
  const faqItems = [
    ["What is Little Learner Hub?", "Little Learner Hub by Leah is affordable childcare curriculum for busy teachers — with ready-to-use lesson plans, activities, printables, songs, books, and teaching resources for infant, toddler, and preschool classrooms, plus curriculum planning tools and documentation helpers — built by a childcare provider and continuously improved with provider feedback."],
    ["What ages are included?", "Infants, Toddlers, and Preschoolers. Content is organized by age group and should still be adapted to each child’s development. Mixed-age, holiday, and seasonal themes are included."],
    ["Are lesson plans printable?", "Yes. Members can customize plans and print or save PDF copies for classroom use."],
    ["Are infant, toddler, and preschool plans available?", "Yes. The library includes published plans across all three age groups, plus mixed-age, holiday, and seasonal themes."],
    ["How many Free lesson plans are included?", "The Free plan includes 11 complete starter lesson plans across Infant, Toddler, and Preschool with no credit card required."],
    ["What is included in a lesson plan?", "Many published plans include a weekly theme, daily activities, learning objectives, materials, teacher preparation, setup guidance, activity directions, observation ideas, safety or cleanup reminders, and books, songs, family connections, printables, or Teaching Kit resources where available."],
    ["What are Teaching Kits?", "Teaching Kits are classroom resources connected to a lesson plan where available, such as preparation support, observation ideas, and printable materials."],
    ["What comes with Pro?", "Pro unlocks the complete lesson-plan and activity libraries, unlimited curriculum printing and downloads, curriculum calendar planning, AI documentation helpers with higher limits, child profiles, saved customized copies, and new content added regularly. Pro Monthly is $19.99/month; Pro Annual is $199/year."],
    ["Can childcare centers use it?", "Yes. Centers, home daycares, preschool classrooms, and family childcare programs can use the platform for curriculum, planning, and documentation today, with additional center-management tools planned for later."],
    ["Can providers request lesson plans, activities, or features?", "Yes. If you can’t find the lesson plan, activity, or feature you need, you can request it directly from inside Little Learner Hub. New content and improvements are added regularly based on provider feedback."],
    ["Is it an app?", "Little Learner Hub is a web application that works in modern browsers on phones, tablets, and computers. It can be installed to your home screen like an app, but it is not a separate native App Store download today."],
    ["What features are coming later?", "Future plans include attendance, meals, naps, daily logs, expanded family communication, enrollment workflows, and center staff tools. See the Features page for the Available Now, Currently Being Built or Tested, and Future Plans sections."],
  ];
  const faqHtml = faqItems.map(([q, a]) => `<article><h2>${escapeHtml(q)}</h2><p>${escapeHtml(a)}</p></article>`).join("\n");
  const faqSchema = {
    "@type": "FAQPage",
    "@id": `${absoluteUrl("/faq")}#faq`,
    mainEntity: faqItems.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  return renderPublicPage({
    title: `FAQ | ${BUSINESS_NAME}`,
    description: "Answers about Little Learner Hub by Leah: ages covered, free and Pro plans, printable lesson plans, centers, requests, and upcoming features.",
    canonicalPath: "/faq",
    extraSchema: faqSchema,
    bodyHtml: `<h1>Frequently Asked Questions</h1>${faqHtml}`,
  });
}

function renderPricingPage() {
  return renderPublicPage({
    title: `Pricing | ${BUSINESS_NAME}`,
    description: "Simple pricing for Little Learner Hub: Free starter lesson plans, Pro Monthly at $19.99/month, or Pro Annual at $199/year for the full curriculum library and teacher tools.",
    canonicalPath: "/pricing",
    bodyHtml: `
      <h1>Pricing</h1>
      <p class="muted">Simple, honest pricing for childcare providers. Start free, then upgrade when you are ready for the full curriculum library and teacher tools.</p>
      <h2>Free Plan — $0</h2>
      <ul>
        <li>11 complete starter lesson plans across Infant, Toddler, and Preschool</li>
        <li>Browse the library and preview additional themes</li>
        <li>About 30 days of calendar planning and up to 5 child profiles</li>
        <li>AI Documentation Helper starter limits</li>
        <li>No credit card required</li>
      </ul>
      <p><a class="cta" href="/?signup=1">Start Free</a><a class="cta cta-secondary" href="/daycare-curriculum">Explore lesson plans</a></p>
      <h2>Pro Monthly — $19.99/month</h2>
      <ul>
        <li>Hundreds of lesson plans and thousands of classroom activities</li>
        <li>Curriculum Calendar and Lesson Planner</li>
        <li>AI Documentation Helpers with expanded limits</li>
        <li>Child Profiles and developmental observations</li>
        <li>Unlimited curriculum printing and downloads</li>
        <li>Customizable and saved lesson-plan copies</li>
        <li>In-app lesson plan, activity, and feature requests</li>
        <li>New content added regularly based on provider feedback</li>
      </ul>
      <h2>Pro Annual — $199/year</h2>
      <p>Same Pro platform access as Pro Monthly, billed annually.</p>
      <p class="muted">This page describes membership pricing only. Little Learner Hub is an online platform and does not operate as a physical childcare location.</p>
    `,
  });
}

function renderHowItWorksPage() {
  return renderPublicPage({
    title: `How It Works | ${BUSINESS_NAME}`,
    description: "See how Little Learner Hub helps busy childcare providers choose, prepare, and teach weekly lesson plans for infant, toddler, and preschool classrooms.",
    canonicalPath: "/how-it-works",
    bodyHtml: `
      <h1>How Little Learner Hub Works</h1>
      <p class="muted">A practical way to spend less time building curriculum and more time with children.</p>
      <div class="feature-grid">
        <article><h2>1. Browse by age and theme</h2><p>Explore published Infant, Toddler, and Preschool lesson plans. Free accounts can open 11 complete starter plans; other plans remain previews until Pro access.</p></article>
        <article><h2>2. Prepare for the week</h2><p>Many plans bring together daily activities, materials, objectives, books, songs, and classroom resources where available.</p></article>
        <article><h2>3. Teach, print, and document</h2><p>Use the plans and printable resources available with your access level, then keep planning and documentation organized in your account.</p></article>
      </div>
      <h2>What&rsquo;s inside a Little Learner Hub lesson plan</h2>
      <p>Lesson-plan fields vary by published week. Many plans include a weekly theme, daily activities, learning objectives, materials list, teacher preparation, setup instructions, step-by-step directions, questions for children, observation ideas, safety and cleanup reminders, vocabulary, books, songs, family connection ideas, and printables or Teaching Kit resources where available.</p>
      <p><a class="cta" href="/daycare-curriculum">Explore Lesson Plans</a><a class="cta cta-secondary" href="/?signup=1">Start Free</a></p>
    `,
  });
}

function renderContactPage() {
  return renderPublicPage({
    title: `Contact | ${BUSINESS_NAME}`,
    description: `Contact ${BUSINESS_NAME} for account help, billing questions, lesson-plan requests, and technical support.`,
    canonicalPath: "/contact",
    bodyHtml: `
      <h1>Contact Support</h1>
      <p>Need help with your account, billing, lesson plans, documentation tools, or a technical issue?</p>
      <p><strong>Email:</strong> <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a></p>
      <p>Members can also use in-app messaging and the Contact form after signing in at <a href="/?view=contact">littlelearnershubbyleah.com</a>.</p>
      ${renderSocialLinksHtml({ heading: `Follow ${BUSINESS_NAME}` })}
      <p class="muted">${escapeHtml(BUSINESS_NAME)} is an online platform. Support is provided remotely; there is no public in-person office or customer walk-in location.</p>
    `,
  });
}

function renderPrivacyPage() {
  return renderPublicPage({
    title: `Privacy Policy | ${BUSINESS_NAME}`,
    description: `Privacy Policy for ${BUSINESS_NAME}.`,
    canonicalPath: "/privacy",
    bodyHtml: `<h1>Privacy Policy</h1><p class="muted"><strong>Draft for owner and legal review.</strong></p><h2>Information the platform processes</h2><p>Little Learner Hub processes account details, program and staff details, saved resources, support messages, billing status, child profile details, observations, AI prompts, AI-generated content, and generated documents needed to operate the platform.</p><h2>Accounts and authentication</h2><p>Account information, including contact and program details, is used to create and secure access to the platform. The application supports email-and-password authentication and may use Firebase Authentication when configured.</p><h2>Childcare program, staff, and child information</h2><p>Providers may enter childcare-program settings, staff information, and child profiles, observations, attendance, meals, communications, photos, documents, and related classroom records. This information supports the provider tools selected by the account. Providers should enter only information needed for their program and follow their own family-consent and recordkeeping requirements.</p><h2>Billing and payments</h2><p>Subscription checkout and billing are processed through Stripe. Little Learner Hub stores billing status and Stripe customer or subscription references needed to provide access. Payment card details are processed through Stripe and are not stored directly inside Little Learner Hub.</p><h2>Analytics, cookies, and browser storage</h2><p>The application uses first-party analytics to understand product use and improve the service. Browser cookies, local storage, and session storage may retain account, preference, session, curriculum, and application-state information. The public site loads Google Ads measurement and may load the Meta Pixel when configured; those providers may process limited device and interaction data under their own policies.</p><h2>Support, logs, and service operations</h2><p>Support, contact, feedback, and messaging submissions are used to respond to requests and improve the service. Server logs and operational monitoring may process technical request, device, and error information to maintain reliability and security.</p><h2>Service providers</h2><p>Little Learner Hub uses Stripe for payment processing, Firebase Authentication when configured, OpenAI for requested AI features, Google Ads and Meta for advertising measurement when configured, email providers for account and support messages, and Render and database providers for hosting and storage. Information is shared with these providers only as needed for the related service.</p><h2>Retention, account closure, and requests</h2><p>Information is retained in service records as needed to operate, secure, support, and improve the platform. Some records are automatically limited or expired by service settings. Canceling a subscription changes access but does not automatically delete other account information. Contact <a href="/contact">support</a> with privacy questions, account-closure requests, or requests about your account information.</p><h2>Security</h2><p>The application uses account authentication, session controls, server-side access checks, and operational monitoring. No security measure can guarantee absolute security.</p><h2>Google account data</h2><p>Little Learner Hub does not currently request Google account data through an application OAuth flow.</p><p class="muted">This page is provided for owner and legal review.</p>`,
  });
}

function renderTermsPage() {
  return renderPublicPage({
    title: `Terms of Service | ${BUSINESS_NAME}`,
    description: `Terms of Service for ${BUSINESS_NAME}.`,
    canonicalPath: "/terms",
    bodyHtml: `<h1>Terms of Service</h1><p>Resources, AI outputs, forms, and policy drafts are templates for childcare providers to review and adapt. Providers are responsible for checking state licensing rules, program policies, family agreements, and professional requirements before use.</p><p>AI-generated content may be incomplete, inaccurate, or not specific to a provider's state or program. Providers must review, edit, and approve all AI-generated content before sharing it with families or using it for business records.</p><h2>Copyright</h2><p>© 2026 Little Learner Hub by Leah. All Rights Reserved.</p><p>Lesson plans, activities, printables, curriculum materials, graphics, and other content on Little Learner Hub are protected intellectual property. Members receive a limited, personal license to use content for their own childcare program. Unauthorized copying, sharing, resale, public redistribution, or commercial reuse outside the member's program is prohibited.</p><p class="muted">This page is provided for owner and legal review.</p>`,
  });
}

function injectHomeHtmlHead(html) {
  const url = siteUrl();
  const tags = [
    `<link rel="canonical" href="${escapeHtml(url)}/" />`,
    `<meta property="og:url" content="${escapeHtml(url)}/" />`,
    `<meta property="og:image" content="${escapeHtml(ogImageUrl())}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImageUrl())}" />`,
    verificationMetaTags(),
    googleConsentDefaultTag(),
    googleAdsBaseTag(),
  ].filter(Boolean).join("\n    ");
  if (!tags) return html;
  return html.replace("</head>", `    ${tags}\n  </head>`);
}

function handleSeoRoute(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (pathname === "/robots.txt") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    if (request.method === "HEAD") response.end();
    else response.end(renderRobotsTxt());
    return true;
  }
  if (pathname === "/sitemap.xml") {
    response.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    if (request.method === "HEAD") response.end();
    else response.end(renderSitemapXml());
    return true;
  }
  const pages = {
    "/about": renderAboutPage,
    "/features": renderFeaturesPage,
    "/faq": renderFaqPage,
    "/pricing": renderPricingPage,
    "/how-it-works": renderHowItWorksPage,
    "/contact": renderContactPage,
    "/privacy": renderPrivacyPage,
    "/terms": renderTermsPage,
  };
  const hubPage = seoCurriculum.getHubPage(pathname);
  const render = hubPage ? () => renderCurriculumHubPage(hubPage) : pages[pathname];
  if (!render) return false;
  // Hub pages stay fresher so newly published plans appear without long caches.
  const maxAge = hubPage ? 120 : 300;
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}` });
  if (request.method === "HEAD") response.end();
  else response.end(render());
  return true;
}

module.exports = {
  BUSINESS_NAME,
  SEO_TITLE,
  SEO_DESCRIPTION,
  siteUrl,
  absoluteUrl,
  logoUrl,
  ogImageUrl,
  founderImageUrl,
  socialProfileUrls,
  OFFICIAL_SOCIAL_PROFILES,
  renderSocialLinksHtml,
  supportEmailAddress,
  buildStructuredDataGraph,
  renderRobotsTxt,
  renderSitemapXml,
  injectHomeHtmlHead,
  handleSeoRoute,
  configureCurriculumSnapshotProvider,
  publicPageRoutes,
  seoCurriculum,
};

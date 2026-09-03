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
        <p><a href="/about">About</a> · <a href="/features">Features</a> · <a href="/faq">FAQ</a> · <a href="/pricing">Pricing</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>
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
        description: "Free plan with 10 complete starter lesson plans across Infant, Toddler, and Preschool.",
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

function renderPublicPage({ title, description, canonicalPath, bodyHtml, extraSchema = null, skipDefaultCta = false }) {
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
    ${googleAdsBaseTag()}
    ${verification ? `${verification}\n    ` : ""}<script type="application/ld+json">${JSON.stringify(graph)}</script>
    <style>
      :root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; line-height: 1.55; color: #1f2a44; }
      body { margin: 0; background: linear-gradient(180deg, #eef6fb 0%, #f8faff 42%, #fff 100%); }
      .wrap { max-width: 920px; margin: 0 auto; padding: 28px 18px 56px; }
      header { margin-bottom: 24px; }
      .brand { font-weight: 700; color: #2f6f8f; text-decoration: none; }
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
      .seo-card-meta { margin: 0; font-size: 0.88rem; color: #5b6478; }
      .seo-badge { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #215f7c; background: #e7f2f7; padding: 0.15rem 0.45rem; border-radius: 999px; }
      .seo-theme { margin: 0.25rem 0 0.5rem; font-size: 0.95rem; }
      .seo-related { margin-top: 2rem; }
      .seo-stat-list { display: grid; gap: 0.35rem; }
      @media (max-width: 600px) {
        .wrap { padding: 22px 14px 48px; }
        .cta { width: 100%; text-align: center; margin-right: 0; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/">${escapeHtml(BUSINESS_NAME)}</a>
        <p class="muted">Online childcare lesson-planning and program-support platform</p>
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
  return renderPublicPage({
    title: `About | ${BUSINESS_NAME}`,
    description: "Meet Leah, the childcare provider behind Little Learner Hub — affordable childcare curriculum and ready-to-use lesson planning for busy teachers.",
    canonicalPath: "/about",
    bodyHtml: `
      <h1>About ${escapeHtml(BUSINESS_NAME)}</h1>
      <p class="muted">Affordable childcare curriculum and ready-to-use lesson planning, built by a childcare provider for childcare providers.</p>

      <h2>Meet Leah</h2>
      <p>My name is Leah. I have worked in childcare for about six years, directly in classrooms with young children. I am also a mom of three young children.</p>
      <p>I created Little Learner Hub because I know how exhausting it is to plan lessons, gather activities, write documentation, and keep everything organized while caring for children. Providers deserve ready-to-use curriculum and planning tools that save time.</p>
      <p>I listen to provider requests and continuously add lesson plans, activities, and platform improvements based on real classroom feedback.</p>

      <h2>What Little Learner Hub Does Now</h2>
      <p>These are features signed-in members can use today:</p>
      <ul>
        <li>Hundreds of ready-to-use lesson plans for infants, toddlers, preschoolers, mixed-age groups, holidays, and seasonal themes (10 starter plans on Free; full library on Pro) — browse the live <a href="/daycare-curriculum">daycare curriculum hub</a></li>
        <li>Thousands of classroom activities with play-based learning ideas and printable resources</li>
        <li>Curriculum Calendar and Lesson Planner for organizing weekly plans</li>
        <li>AI Documentation Helpers that generate observations, parent messages, daily reports, incident reports, and more in seconds</li>
        <li>Child Profiles to organize documentation and developmental observations</li>
        <li>Lesson plan, activity, and feature requests directly inside Little Learner Hub</li>
        <li>Print and download tools for classroom-ready starter and Pro library plans</li>
        <li>Pro unlocks the full libraries, saved favorites, customized lesson-plan copies, and expanded limits</li>
      </ul>
      <p>If you can&rsquo;t find the lesson plan, activity, or feature you need, you can request it directly from inside Little Learner Hub. New content and improvements are added regularly based on provider feedback.</p>
      <p>See the <a href="/features">Features page</a> for a fuller breakdown of what is live today.</p>

      <h2>What I&rsquo;m Building Next</h2>
      <p class="muted"><strong>Future plans and works in progress — not all available yet.</strong></p>
      <p>Little Learner Hub continues to grow with more daycare operations tools. Here is what I am working toward:</p>
      <ul>
        <li>Expanded daily logs</li>
        <li>Attendance and check-in</li>
        <li>Meals, naps, diapers, and toileting</li>
        <li>Family Hub for parents</li>
        <li>Family messaging</li>
        <li>Electronic forms and signatures</li>
        <li>Enrollment and waitlists</li>
        <li>Tuition and billing tools</li>
        <li>Staff and classroom management</li>
        <li>Child portfolios and developmental goals</li>
        <li>Licensing and staff document storage</li>
        <li>More school-age content</li>
        <li>Expanded AI Guide tools</li>
        <li>Mobile and offline support</li>
      </ul>
      <p class="muted">Some items are in active development or limited testing. They are labeled clearly on the <a href="/features">Features page</a> and are not presented as fully live until launched.</p>

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
      <ul>
        <li>Hundreds of ready-to-use lesson plans for infants, toddlers, preschoolers, mixed-age groups, holidays, and seasonal themes (10 starter plans on Free; full library on Pro)</li>
        <li>Thousands of classroom activities with play-based learning ideas and printable resources</li>
        <li>Curriculum Calendar and Lesson Planner for organizing weekly plans</li>
        <li>AI Documentation Helpers that generate observations, parent messages, daily reports, incident reports, and more in seconds</li>
        <li>Child Profiles to organize documentation and developmental observations</li>
        <li>Lesson Plan and Feature Requests — request lesson plans, activities, or platform improvements directly inside Little Learner Hub</li>
        <li>Print and download tools for classroom-ready starter and Pro library plans</li>
        <li>Free plan with 10 complete starter lesson plans (no credit card required)</li>
        <li>Pro membership for full library access, saved favorites, customized lesson-plan copies, and expanded limits</li>
      </ul>
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
    ["Is there a free option?", "Yes. The Free plan includes 10 complete starter lesson plans across Infant, Toddler, and Preschool with no credit card required."],
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
        <li>10 complete starter lesson plans across Infant, Toddler, and Preschool</li>
        <li>Browse the library and preview additional themes</li>
        <li>About 30 days of calendar planning and up to 5 child profiles</li>
        <li>AI Documentation Helper starter limits</li>
        <li>No credit card required</li>
      </ul>
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
    bodyHtml: `<h1>Privacy Policy</h1><p>Little Learner Hub may collect account details, support messages, billing status, saved resources, child profile details, observations, AI prompts, AI-generated content, and generated documents needed to operate the platform.</p><p>Information should be used only for providing childcare resource tools, account access, support, billing, and product improvement. Payment details should be processed through Stripe and not stored directly inside Little Learner Hub.</p><p class="muted">This page is provided for owner and legal review.</p>`,
  });
}

function renderTermsPage() {
  return renderPublicPage({
    title: `Terms of Service | ${BUSINESS_NAME}`,
    description: `Terms of Service for ${BUSINESS_NAME}.`,
    canonicalPath: "/terms",
    bodyHtml: `<h1>Terms of Service</h1><p>Resources, AI outputs, forms, and policy drafts are templates for childcare providers to review and adapt. Providers are responsible for checking state licensing rules, program policies, family agreements, and professional requirements before use.</p><p>AI-generated content may be incomplete, inaccurate, or not specific to a provider's state or program. Providers must review, edit, and approve all AI-generated content before sharing it with families or using it for business records.</p><p class="muted">This page is provided for owner and legal review.</p>`,
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

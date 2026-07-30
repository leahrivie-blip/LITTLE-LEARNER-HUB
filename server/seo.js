/**
 * SEO helpers: robots.txt, sitemap.xml, crawlable public pages, structured data.
 * Online platform only — no LocalBusiness / fake physical address.
 */
const fs = require("node:fs");
const path = require("node:path");

const BUSINESS_NAME = "Little Learner Hub by Leah";
const SHORT_NAME = "Little Learner Hub";
const DEFAULT_SITE_URL = "https://littlelearnershubbyleah.com";
function supportEmailAddress() {
  const raw = String(process.env.SUPPORT_EMAIL_TO || "support@littlelearnershubbyleah.com").trim();
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

const SUPPORT_EMAIL = supportEmailAddress();
const FOUNDER_NAME = process.env.ADMIN_NAME || "Leah";

const SEO_TITLE = "Little Learner Hub by Leah | Lesson Plans and Childcare Tools";
const SEO_DESCRIPTION = "Little Learner Hub gives childcare providers ready-to-use lesson plans, activities, planning tools, documentation helpers, forms, daily reports, and classroom support for infants, toddlers, and preschoolers.";

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
  const keys = [
    ["LLH_SOCIAL_TIKTOK_URL", "tiktok"],
    ["LLH_SOCIAL_FACEBOOK_URL", "facebook"],
    ["LLH_SOCIAL_INSTAGRAM_URL", "instagram"],
    ["LLH_SOCIAL_YOUTUBE_URL", "youtube"],
  ];
  return keys
    .map(([envKey]) => String(process.env[envKey] || "").trim())
    .filter((url) => /^https?:\/\//i.test(url));
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
        description: "Full lesson-plan and activity libraries, unlimited curriculum printing and downloads, and expanded documentation limits.",
        url: `${url}/?view=pricing`,
      },
    ],
    featureList: [
      "Lesson plan library for Infant, Toddler, and Preschool",
      "Activity library",
      "Weekly calendar planning",
      "Printable and downloadable classroom resources",
      "Documentation helpers",
      "Forms library",
      "Provider support and lesson-plan requests",
    ],
    provider: { "@id": `${url}/#organization` },
  };

  const graph = [organization, website, webApplication];

  if (!foundingSoldOut) {
    graph.push({
      "@type": "Offer",
      "@id": `${url}/#founding-offer`,
      name: "Founding Member Monthly",
      price: "9.99",
      priceCurrency: "USD",
      description: "Founding Member pricing locked while membership remains continuously active.",
      url: `${url}/?view=pricing`,
      offeredBy: { "@id": `${url}/#organization` },
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
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

function renderPublicPage({ title, description, canonicalPath, bodyHtml, extraSchema = null }) {
  const url = absoluteUrl(canonicalPath);
  const graph = buildStructuredDataGraph();
  if (extraSchema) graph["@graph"].push(extraSchema);
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
    ${verification ? `${verification}\n    ` : ""}<script type="application/ld+json">${JSON.stringify(graph)}</script>
    <style>
      :root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; line-height: 1.55; color: #1f2a44; }
      body { margin: 0; background: #f8faff; }
      .wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px 56px; }
      header { margin-bottom: 24px; }
      .brand { font-weight: 700; color: #5b4f9a; text-decoration: none; }
      h1 { font-size: 2rem; margin: 0.4rem 0 0.8rem; }
      h2 { margin-top: 2rem; font-size: 1.25rem; }
      p, li { font-size: 1.02rem; }
      .cta { display: inline-block; margin-top: 20px; padding: 12px 18px; border-radius: 10px; background: #6f5bd3; color: #fff; text-decoration: none; font-weight: 600; }
      .muted { color: #5b6478; }
      .pill { display: inline-block; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 0.2rem 0.55rem; border-radius: 999px; background: #ece8ff; color: #5b4f9a; margin-left: 0.35rem; }
      .status-testing { background: #fff4df; color: #8a5b00; }
      .status-later { background: #eef2f7; color: #4d5a6d; }
      footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #dbe3f2; font-size: 0.92rem; color: #5b6478; }
      ul { padding-left: 1.2rem; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/">${escapeHtml(BUSINESS_NAME)}</a>
        <p class="muted">Online childcare lesson-planning and program-support platform</p>
      </header>
      ${bodyHtml}
      <p><a class="cta" href="/">Open Little Learner Hub</a></p>
      <footer>
        <p>© ${new Date().getFullYear()} ${escapeHtml(BUSINESS_NAME)}. All rights reserved.</p>
        <p><a href="/about">About</a> · <a href="/features">Features</a> · <a href="/faq">FAQ</a> · <a href="/pricing">Pricing</a> · <a href="/contact">Contact</a></p>
      </footer>
    </div>
  </body>
</html>`;
}

function renderAboutPage() {
  return renderPublicPage({
    title: `About | ${BUSINESS_NAME}`,
    description: "Learn who Little Learner Hub by Leah is for, what the platform provides today, and why it was created by a childcare provider for real classrooms.",
    canonicalPath: "/about",
    bodyHtml: `
      <h1>About ${escapeHtml(BUSINESS_NAME)}</h1>
      <p><strong>${escapeHtml(BUSINESS_NAME)}</strong> is an online platform for childcare teachers, home daycare providers, directors, centers, preschool teachers, toddler teachers, infant teachers, nannies, and early childhood educators.</p>
      <h2>Who it is for</h2>
      <p>The platform is built for educators who need practical planning, documentation, and classroom support without spending hours searching, formatting, and rewriting ideas from scattered sources.</p>
      <h2>What it provides today</h2>
      <ul>
        <li>Growing Infant, Toddler, and Preschool lesson-plan library</li>
        <li>Organized activity library</li>
        <li>Weekly calendar planning</li>
        <li>Printable and downloadable classroom resources</li>
        <li>Documentation helpers, forms, and provider support</li>
      </ul>
      <h2>Who founded it</h2>
      <p>${escapeHtml(BUSINESS_NAME)} was founded by ${escapeHtml(FOUNDER_NAME)}, a childcare provider who understands the real workload of planning, documentation, family communication, and program paperwork.</p>
      <h2>Why it was created</h2>
      <p>The goal is to give providers one affordable online place to find curriculum today and manage more of their program over time — without pretending the platform is a physical childcare location or in-person service.</p>
      <h2>Future plans</h2>
      <p class="muted">Roadmap items are labeled on the <a href="/features">Features page</a> as <strong>Available Now</strong>, <strong>Currently Being Built or Tested</strong>, or <strong>Future Plans</strong>. They are not advertised as fully available until launched.</p>
    `,
  });
}

function renderFeaturesPage() {
  return renderPublicPage({
    title: `Features | ${BUSINESS_NAME}`,
    description: "See what is available now on Little Learner Hub by Leah, what is currently being built or tested, and what is planned for the future — with no misleading claims.",
    canonicalPath: "/features",
    bodyHtml: `
      <h1>Platform Features</h1>
      <p>Little Learner Hub is an <strong>online</strong> childcare platform. This page separates live features from testing and future roadmap work.</p>
      <h2>Available Now <span class="pill">Live</span></h2>
      <ul>
        <li>Lesson Plan Library for Infant, Toddler, and Preschool</li>
        <li>Activity Library organized by age, category, and theme</li>
        <li>Weekly calendar planning for lessons, activities, and notes</li>
        <li>Print and download tools for classroom-ready plans</li>
        <li>Customizable and saved lesson-plan copies</li>
        <li>Documentation Helpers (observation, lesson plan, daily report, newsletter, handbook, and contract support)</li>
        <li>Forms library and document creation tools</li>
        <li>Child profiles, observations, and favorites with plan-based limits</li>
        <li>Provider messaging and lesson-plan requests</li>
        <li>Free plan with 10 complete starter lesson plans (no credit card required)</li>
        <li>Pro membership for full library access and expanded limits</li>
      </ul>
      <h2>Currently Being Built or Tested <span class="pill status-testing">In progress</span></h2>
      <ul>
        <li>Expanded Home Daycare Hub workflows (child profiles, observations, and documentation helpers in dedicated hub surfaces)</li>
        <li>Family Hub and digital forms workflows</li>
        <li>Selected enrollment and family-communication tools</li>
      </ul>
      <p class="muted">These items are in active development or limited testing. They are not advertised as fully available for every account until launched.</p>
      <h2>Future Plans <span class="pill status-later">Planned</span></h2>
      <ul>
        <li>Attendance, meals, naps, and daily logs</li>
        <li>Child portfolios and progress goals</li>
        <li>Expanded parent messaging and signatures</li>
        <li>Classroom Assistant and center staff tools</li>
        <li>More automated weekly planning workflows</li>
      </ul>
    `,
  });
}

function renderFaqPage() {
  const faqItems = [
    ["What is Little Learner Hub?", "Little Learner Hub by Leah is an online platform that helps childcare providers plan and document with play-based lesson plans, activities, calendar tools, forms, documentation helpers, and provider-requested curriculum."],
    ["What ages are included?", "Infants, Toddlers, and Preschoolers. Content is organized by age group and should still be adapted to each child’s development."],
    ["Are lesson plans printable?", "Yes. Members can customize plans and print or save PDF copies for classroom use."],
    ["Are infant, toddler, and preschool plans available?", "Yes. The library includes published plans across all three age groups."],
    ["Is there a free option?", "Yes. The Free plan includes 10 complete starter lesson plans across Infant, Toddler, and Preschool with no credit card required."],
    ["What comes with Pro?", "Pro unlocks the complete lesson-plan and activity libraries, unlimited curriculum printing and downloads, new content added regularly, saved customized copies, and higher documentation limits."],
    ["Can childcare centers use it?", "Yes. Centers, home daycares, preschool classrooms, and family childcare programs can use the platform for curriculum and planning today, with additional center-management tools planned for later."],
    ["Can providers request lesson plans?", "Yes. Members can message through the website with age group, topic, interests, and learning goals to request new plans."],
    ["Is it an app?", "Little Learner Hub is a web application that works in modern browsers on phones, tablets, and computers. It can be installed to your home screen like an app, but it is not a separate native App Store download today."],
    ["What features are coming later?", "Future plans include attendance, meals, naps, daily logs, expanded family communication, enrollment workflows, and center staff tools. See the Features page for the Available Now, Currently Being Built or Tested, and Future Plans sections."],
    ["What is Founding Member pricing?", "Founding Member pricing was $9.99/month locked while membership remains continuously active. Founding spots are sold out for new signups. Existing Founding Members remain grandfathered. New members choose Pro Monthly at $19.99/month or Pro Annual at $199/year."],
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
    description: "Free starter lesson plans plus Pro Monthly ($19.99/month) and Pro Annual ($199/year) for Little Learner Hub by Leah. Founding Member pricing is grandfathered for existing members only.",
    canonicalPath: "/pricing",
    bodyHtml: `
      <h1>Pricing</h1>
      <p class="muted">Current public offers for new members. Existing Founding Member accounts keep their grandfathered billing rate while membership remains continuously active.</p>
      <h2>Free Plan — $0</h2>
      <ul>
        <li>10 complete starter lesson plans across Infant, Toddler, and Preschool</li>
        <li>Browse the library and preview additional themes</li>
        <li>About 30 days of calendar planning, up to 20 favorites, up to 5 child profiles</li>
        <li>10 observations per month, 6 forms, and 10 document creations per month</li>
        <li>No credit card required</li>
      </ul>
      <h2>Pro Monthly — $19.99/month</h2>
      <ul>
        <li>Complete lesson-plan and activity libraries</li>
        <li>Unlimited curriculum printing and downloads</li>
        <li>New content added regularly</li>
        <li>Customizable and saved lesson-plan copies</li>
        <li>Expanded documentation limits, including 250 document creations per month</li>
      </ul>
      <h2>Pro Annual — $199/year</h2>
      <p>Same Pro library and printing access as Pro Monthly, billed annually.</p>
      <h2>Founding Member — $9.99/month (existing members only)</h2>
      <p>Founding Member pricing is <strong>sold out for new signups</strong>. Members who joined while Founding spots were available keep <strong>$9.99/month</strong> locked while membership remains continuously active. New members choose Pro Monthly or Pro Annual instead.</p>
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
      <p class="muted">Little Learner Hub is an online platform. Support is provided remotely; there is no public in-person office or customer walk-in location.</p>
    `,
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
  };
  const render = pages[pathname];
  if (!render) return false;
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
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
  supportEmailAddress,
  buildStructuredDataGraph,
  renderRobotsTxt,
  renderSitemapXml,
  injectHomeHtmlHead,
  handleSeoRoute,
};

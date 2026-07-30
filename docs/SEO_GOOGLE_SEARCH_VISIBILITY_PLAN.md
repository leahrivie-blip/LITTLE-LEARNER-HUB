# Google Search Visibility & Structured Data Plan

**Business:** Little Learner Hub by Leah  
**Website:** https://littlelearnershubbyleah.com  
**Business type:** Online childcare lesson-planning, activity, documentation, and program-management platform  
**Status:** Prepared on testing branch only — **not deployed to production**

---

## 1. Current SEO audit (production as of 2026-07-30)

### What exists today

| Area | Current state | Issue |
|------|---------------|-------|
| **Homepage title** | `Little Learner Hub \| Affordable Childcare Curriculum & Planning Tools` | Brand name missing “by Leah”; not aligned to target positioning |
| **Meta description** | Mentions Founding Member $9.99 pricing | Over-emphasizes sold-out offer; weak feature summary |
| **Open Graph** | Title/description present | No `og:image`, `og:url`, or canonical URL |
| **Twitter cards** | `summary_large_image` declared | No `twitter:image` |
| **Favicon** | Inline SVG data URI | Works, but PNG favicon is stronger for Google/social consistency |
| **Logo asset** | `images/icons/icon-512.png` exists | Not referenced in structured data or OG tags on production |
| **JSON-LD** | `WebSite` + `Product` (Founding Membership $9.99) | Wrong types for an online SaaS platform; founding offer is sold out; no `Organization`, `founder`, `sameAs`, or `WebApplication` |
| **robots.txt** | **Missing** (returns SPA 404) | No explicit crawl guidance or sitemap pointer |
| **sitemap.xml** | **Missing** | Google must discover pages only via links |
| **Canonical URLs** | **Missing** | Risk of duplicate indexing across `www`, Render host, and apex |
| **Search Console verification** | **Not present** | Cannot verify property without meta tag or DNS |
| **Bing Webmaster verification** | **Not present** | Same |
| **Public About page** | Homepage founder section only | No dedicated crawlable `/about` URL |
| **Public Features page** | Homepage “Available Now” section only | No dedicated `/features` with testing/future split |
| **Public FAQ page** | SPA `#view-faq` only | Not a clean public URL for crawlers |
| **Public Pricing page** | Homepage `#homePricing` anchor only | No dedicated `/pricing` URL |
| **Public Contact page** | SPA `?view=contact` only | No dedicated `/contact` URL |
| **Lesson Plans / Activities** | SPA views (`?view=lessons`, `?view=activities`) | Crawlable after JS render, but no dedicated SEO landing URLs |
| **LocalBusiness schema** | Not used | **Correct** — do not add; this is an online platform |
| **AggregateRating / reviews schema** | Not used | **Correct for now** — homepage shows real quotes but no eligible aggregate-rating markup |
| **Brand consistency** | Mixed “Little Learner Hub” vs footer “Little Learner Hub by Leah” | Should standardize to full business name in SEO surfaces |

### Crawler / indexing blockers (review)

| Check | Result |
|-------|--------|
| `robots` meta noindex | **None** on public homepage |
| `robots.txt` disallow | **None** (file missing, so default allow) |
| Auth wall on homepage | **No** — public homepage and `/api/public/home-inventory` are open |
| Auth wall on curriculum APIs | **Partial** — Pro resources correctly return 403 without auth; public inventory counts are available |
| JavaScript rendering | **SPA** — Google can render, but dedicated HTML pages are safer for About/FAQ/Features |
| Service worker | Caches app shell; HTML uses network-first for navigations | Acceptable; monitor after deploy |
| Canonical tags | **Missing** | Should add before indexing push |
| Wrong host indexing | `little-learner-hub.onrender.com` may be indexable | Redirect/canonical strategy needed (domain health endpoint already documents official domain) |

### Assets verified

- `images/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — present
- `images/leah-founder.jpg` — founder photo on homepage
- Dedicated **1200×630 OG share image** — **not yet created** (branch falls back to `icon-512.png`)

---

## 2. Proposed homepage SEO (exact copy)

**Title**
```text
Little Learner Hub by Leah | Lesson Plans and Childcare Tools
```

**Meta description**
```text
Little Learner Hub gives childcare providers ready-to-use lesson plans, activities, planning tools, documentation helpers, forms, daily reports, and classroom support for infants, toddlers, and preschoolers.
```

**Open Graph / Twitter title:** same as title  
**Open Graph / Twitter description:** same as meta description  
**og:site_name:** `Little Learner Hub by Leah`

---

## 3. Proposed structured data (eligible, no fake data)

### Organization + WebSite + WebApplication graph

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://littlelearnershubbyleah.com/#organization",
      "name": "Little Learner Hub by Leah",
      "alternateName": "Little Learner Hub",
      "url": "https://littlelearnershubbyleah.com/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://littlelearnershubbyleah.com/images/icons/icon-512.png",
        "width": 512,
        "height": 512
      },
      "email": "support@littlelearnershubbyleah.com",
      "founder": { "@type": "Person", "name": "Leah" },
      "sameAs": []
    },
    {
      "@type": "WebSite",
      "@id": "https://littlelearnershubbyleah.com/#website",
      "name": "Little Learner Hub by Leah",
      "url": "https://littlelearnershubbyleah.com/",
      "publisher": { "@id": "https://littlelearnershubbyleah.com/#organization" },
      "inLanguage": "en-US"
    },
    {
      "@type": "WebApplication",
      "@id": "https://littlelearnershubbyleah.com/#webapp",
      "name": "Little Learner Hub by Leah",
      "applicationCategory": "EducationalApplication",
      "operatingSystem": "Web",
      "url": "https://littlelearnershubbyleah.com/",
      "offers": [
        {
          "@type": "Offer",
          "name": "Free Plan",
          "price": "0",
          "priceCurrency": "USD"
        },
        {
          "@type": "Offer",
          "name": "Pro Monthly",
          "price": "19.99",
          "priceCurrency": "USD"
        }
      ],
      "provider": { "@id": "https://littlelearnershubbyleah.com/#organization" }
    }
  ]
}
```

### FAQPage (on `/faq` only)

Add `FAQPage` with the 10 public questions listed in section 8 of the user request. Do **not** duplicate on homepage unless content is visibly present there.

### Explicitly excluded

- `LocalBusiness` — online-only platform; no public walk-in location
- `AggregateRating` / `Review` schema — until testimonials follow Google’s rules and permissions are documented
- Fake addresses, phone numbers, or “visit us” claims
- Founding Member `Product` offer while sold out for new signups

### `sameAs` (pending URLs from Leah)

Populate when provided via environment variables:

- `LLH_SOCIAL_TIKTOK_URL`
- `LLH_SOCIAL_FACEBOOK_URL`
- `LLH_SOCIAL_INSTAGRAM_URL`
- `LLH_SOCIAL_YOUTUBE_URL`

---

## 4. Page-by-page SEO plan

| URL | Title | Description focus | Index? |
|-----|-------|-------------------|--------|
| `/` | Little Learner Hub by Leah \| Lesson Plans and Childcare Tools | Platform summary + ages | Yes |
| `/about` | About \| Little Learner Hub by Leah | Who it’s for, founder, mission, online-only | Yes |
| `/features` | Features \| Little Learner Hub by Leah | Available Now / Testing / Coming Later | Yes |
| `/faq` | FAQ \| Little Learner Hub by Leah | Top 10 questions + FAQPage schema | Yes |
| `/pricing` | Pricing \| Little Learner Hub by Leah | Free + Pro $19.99; founding grandfather note | Yes |
| `/contact` | Contact \| Little Learner Hub by Leah | support@ email; remote support only | Yes |
| `/?view=lessons` | (future) Lesson Plans \| … | Library overview | Optional phase 2 |
| `/?view=activities` | (future) Activities \| … | Activity library overview | Optional phase 2 |
| `/api/*` | — | Block in robots.txt | No |

**Internal linking:** Footer + homepage nav should link to `/about`, `/features`, `/faq`, `/pricing`, `/contact`.

---

## 5. Files changed on testing branch

| File | Purpose |
|------|---------|
| `docs/SEO_GOOGLE_SEARCH_VISIBILITY_PLAN.md` | This audit + rollout plan |
| `server/seo.js` | robots.txt, sitemap.xml, public SEO pages, schema helpers |
| `server/index.js` | Wire SEO routes; inject canonical/OG/verification into homepage HTML |
| `index.html` | Updated title, description, OG/Twitter, Organization/WebApplication JSON-LD |
| `site.webmanifest` | Consistent business name/description |
| `scripts/test-seo-visibility.js` | Automated checks for robots, sitemap, pages, schema |
| `package.json` | `test:seo-visibility` script |

**Optional follow-up (not in this branch):**

- `images/og/llh-share.png` — dedicated 1200×630 branded share image
- SPA `document.title` updates per view (`lessons`, `faq`, etc.)
- Google Business Profile — only if Leah wants a **service-area online business** listing without a fake storefront (separate decision)

---

## 6. Google Search Console setup (after testing deploy)

1. Deploy this branch to the **testing Render service only** (not production).
2. In [Google Search Console](https://search.google.com/search-console), add property:
   - **URL prefix:** `https://littlelearnershubbyleah.com/` (or testing URL first)
3. Choose **HTML tag** verification.
4. Set env var on the service:
   ```bash
   GOOGLE_SITE_VERIFICATION=<token from Google>
   ```
5. Redeploy/restart service; confirm tag appears in homepage `<head>`.
6. Click **Verify** in Search Console.
7. Submit sitemap:
   ```text
   https://littlelearnershubbyleah.com/sitemap.xml
   ```
8. Request indexing for:
   - `/`
   - `/about`
   - `/features`
   - `/faq`
   - `/pricing`
   - `/contact`
9. Monitor **Pages**, **Enhancements**, and **Rich results** for FAQ and Organization eligibility.

### Bing Webmaster Tools

1. Add site at [Bing Webmaster](https://www.bing.com/webmasters).
2. Set:
   ```bash
   BING_SITE_VERIFICATION=<token>
   ```
3. Submit the same `sitemap.xml`.

---

## 7. Rich Results testing plan

After testing deploy:

1. [Google Rich Results Test](https://search.google.com/test/rich-results)
   - Test `/` → expect Organization, WebSite, WebApplication (not guaranteed rich display, but valid)
   - Test `/faq` → expect FAQPage eligible
2. [Schema Markup Validator](https://validator.schema.org/)
3. Confirm **no** LocalBusiness, AggregateRating, or Review warnings from removed founding Product schema

---

## 8. Testimonials plan (website display + future schema)

### Display on site (no schema yet)

1. Collect **written permission** from each provider (name, program, quote, optional photo).
2. Show on homepage and/or `/about` as visible HTML blockquotes with attribution.
3. Keep quotes factual; avoid “#1 platform” superlatives unless substantiated.
4. Do **not** add star-rating graphics that imply a counted aggregate score unless you maintain a real review collection process.

### When schema may be appropriate (later)

- **Individual `Review`** objects only if each review is visible on the page it describes and tied to a real person/program.
- **`AggregateRating`** only if Google’s program policies are met for this software business (generally requires a trustworthy public review system and visible reviews). Default recommendation: **wait** until Leah has 5–10 permissioned public testimonials and legal review.

---

## 9. Information still needed from Leah

| Item | Why |
|------|-----|
| Official TikTok URL | `sameAs` + footer/social links |
| Official Facebook URL | `sameAs` |
| Official Instagram URL | `sameAs` (homepage founder link may exist in admin content) |
| Official YouTube URL | `sameAs` |
| Preferred founder full name for schema (`Leah` vs full legal name) | Person schema |
| Dedicated 1200×630 OG image asset | Better social/Google discovery appearance |
| Confirm testing Render service URL for first SEO deploy | Keep production unchanged until approved |
| Testimonial permissions list | Future on-site reviews section |
| Whether to add `www` → apex canonical only or both hosts in Search Console | Domain strategy |

---

## 10. Rollout checklist (production — do not run until approved)

- [ ] Deploy SEO branch to testing service
- [ ] Run `npm run test:seo-visibility`
- [ ] Rich Results Test on `/` and `/faq`
- [ ] Verify robots.txt and sitemap.xml on testing URL
- [ ] Add social URLs to Render env vars
- [ ] Add Google + Bing verification tokens
- [ ] Submit sitemap in Search Console
- [ ] Leah reviews About/Features/FAQ copy
- [ ] Create OG share image
- [ ] Pause auto-deploy on production; manual deploy when ready
- [ ] After live: request indexing for key URLs
- [ ] Monitor Search Console for 2–4 weeks before further schema expansion

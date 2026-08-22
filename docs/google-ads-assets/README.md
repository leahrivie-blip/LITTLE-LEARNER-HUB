# Little Learner Hub Google Ads asset audit

Audit date: 2026-08-22. The final, upload-ready creative pack is in
`images/google-ads/`. These are standalone PNG files; they are not referenced
by the website and require no deploy to download or use.

## Existing assets worth considering

| Exact path | Dimensions | What it shows | Live on site? | Google Ads assessment | Recommended use |
| --- | --- | --- | --- | --- | --- |
| `images/lesson-covers/all-about-me.jpg` | 1280×720 (1.78:1) | Watercolor classroom scene for the All About Me lesson plan. | Yes, in the lesson library. | Safe and polished, but it only communicates the theme—not the product workflow. | Background/secondary creative; use the new Start Free composition instead. |
| `images/lesson-covers/community-helpers.jpg` | 1280×720 (1.78:1) | Watercolor Community Helpers activity theme with firefighter, medical, and postal props. | Yes, in the lesson library. | Safe, clear, and topic-specific; no people or private data. | Classroom-activity angle; used in the new activity composition. |
| `mockups/teacher-weekly-planner/page-1.png` | 1760×1360 (1.29:1) | Branded sample Teacher Weekly Planner with theme, objectives, materials, and vocabulary. | No; repo mockup only. | Strong printable proof with demo-only content. | Printable/planning creative; used in the new printable composition. |
| `mockups/lesson-cover-redesign/screenshots/final-library-desktop.png` | 1024×768 (1.33:1) | Lesson Plan Library UI showing cards, age filters, and the Add to Calendar action. | No; captured mockup. | Clear product evidence and no personal data; visually current enough for ads. | Hero/product-library creative; used in the new hero composition. |
| `docs/scheduling-owner-audit/23-desktop-dashboard.png` | 976×826 (1.18:1) | Teacher dashboard, calendar, and weekly planner entry point. | No; internal QA capture. | Do not use directly: visible test account name and audit dates make it unsuitable for ads. | Reference only; excluded from the pack. |
| `curriculum-drafts/teaching-kits-premium/cartoon-style-samples/01-colorful-tummy-time.png` | 1536×1024 (1.5:1) | Illustrated infant tummy-time setup. | No; unpublished draft. | Attractive and privacy-safe, but not approved/live curriculum media. | Do not advertise until it is approved for public marketing use. |
| `curriculum-drafts/teaching-kits-premium/cartoon-style-samples/02-doctors-office-dramatic-play.png` | 1536×1024 (1.5:1) | Illustrated doctor dramatic-play activity. | No; unpublished draft. | Same approval issue as the tummy-time image. | Do not advertise until approved. |

The 62 live JPG files in `images/lesson-covers/` are all 1280×720 illustrations.
They are clean and privacy-safe, but are lesson-theme covers rather than
screenshots of an actual planning product. That pool alone does not provide the
five product-clear, ad-ready images needed for a campaign.

## New Google Ads marketing pack

All exports include `littlelearnershubbyleah.com`, use existing Little Learner
Hub blue/purple brand colors, and contain only sample content. Each concept has
both a 1:1 square and 1.91:1 landscape export:

| Concept | Square | Landscape | Recommended ad use |
| --- | --- | --- | --- |
| Hero product | `images/google-ads/01-hero-product-1200x1200.png` | `images/google-ads/01-hero-product-1200x628.png` | Primary acquisition creative; product library visible. |
| Weekly lesson plan | `images/google-ads/02-lesson-plan-week-1200x1200.png` | `images/google-ads/02-lesson-plan-week-1200x628.png` | Planning/productivity campaign. |
| Printables | `images/google-ads/03-printables-1200x1200.png` | `images/google-ads/03-printables-1200x628.png` | Printable and weekly-planner campaign. |
| Classroom activity | `images/google-ads/04-classroom-activity-1200x1200.png` | `images/google-ads/04-classroom-activity-1200x628.png` | Lesson/activity discovery campaign. |
| Product features | `images/google-ads/05-product-features-1200x1200.png` | `images/google-ads/05-product-features-1200x628.png` | Broad feature/value campaign. |
| Start free | `images/google-ads/06-start-free-1200x1200.png` | `images/google-ads/06-start-free-1200x628.png` | Free-account conversion campaign. |

### Use these for Google Ads

1. `images/google-ads/01-hero-product-1200x1200.png`
2. `images/google-ads/02-lesson-plan-week-1200x1200.png`
3. `images/google-ads/03-printables-1200x1200.png`
4. `images/google-ads/04-classroom-activity-1200x1200.png`
5. `images/google-ads/05-product-features-1200x1200.png`
6. `images/google-ads/06-start-free-1200x1200.png`

For landscape placements, use the matching `1200x628` variant of each. The
PNG assets are source-controlled exports. Regenerate them after any source or
copy update with:

```bash
node scripts/generate-google-ads-assets.js
```

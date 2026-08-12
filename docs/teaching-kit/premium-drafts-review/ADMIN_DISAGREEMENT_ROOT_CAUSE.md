# Why `allCoreComplete: true` disagreed with Owner Admin

## Exact root cause

**Previous repair never wrote to the production database that Owner Admin uses.**

| What previous work did | What Owner Admin uses |
| --- | --- |
| Mutated **local** gitignored `server/data/launch-store.json` inside the Cloud Agent VM | **Production** Postgres-backed store at `https://littlelearnershubbyleah.com` |
| Committed enrichment JSON under `curriculum-drafts/teaching-kits-premium/` on a git branch | Live `GET /api/admin/site-content` → `curriculum.lessonPlans[].enrichmentDraft` |
| Verified with a local Playwright server copying that local store | Your browser against production Admin |

So the completion matrix certified a **local fixture**, not the persisted production draft overlay.

## Matching investigation checklist

1. Verification reading fixture/static content — **YES** (local launch-store + generated enrichment JSON)
2. Content in memory never saved — local save happened; **production never saved**
3. Saved under wrong IDs — local IDs also **differ** from production (e.g. local `Bright Scarf…` / `item-a2c942…` vs prod `Rainbow Scarf Visual Tracking` / `item-dcdcf7…`)
4. Repo seed vs database — **YES** (branch artifacts ≠ prod DB)
5. Testing DB vs production Admin — **YES** (agent local-json vs prod)
6. Production updated / verify on testing — inverse: verify local, Admin prod
7. Different canonical source — Admin loads `/api/admin/site-content`; repair wrote local file
8. Draft overlay key mismatch — also true locally before; on prod, overlay keys are live `cur-act-*` but many core fields simply **absent**
9. API stripping — not the primary issue; fields are empty/null in persisted payload
10. Hydration bug — secondary: empty persisted values correctly show blank; farm text is helper UI
11. Cache — not required to explain; fresh Admin GET shows blanks
12. `allCoreComplete` checked generated object — **YES**
13. Spot checks only — also true, but even those were against the wrong environment
14. Complete badge too loose — **YES**: `activityStatus()` treated tips/photos as Complete while core fields blank

## Production truth (read 2026-08-12 via Admin login → site-content)

Environment: **`https://littlelearnershubbyleah.com`** (also serves from Render)

Endpoint Owner Admin loads: **`GET /api/admin/site-content`**  
Draft save path: **`POST /api/admin/curriculum/lesson-plans`** with `saveMode: "enrichment_draft"`

| Kit | Lesson ID | Lesson status | enrichmentDraft | Activity count | Blank core cells (approx) |
| --- | --- | --- | --- | --- | --- |
| Colors All Around Us | `cur-lp-infant-colors-all-around-us` | **published** | yes (partial, 14 keys) | **14** (Mon only 2) | ~5–6 blanks/activity |
| Black & White Discovery | `cur-lp-infant-black-white-discovery` | **published** | **none** | 15 | ~5–6 blanks/activity |
| Community Helpers | `cur-lp-preschool-community-helpers` | **published** | yes (partial) | 15 | ~5–6 blanks/activity |
| Weather Watchers | `cur-lp-preschool-weather-watchers` | **published** | yes (partial) | 15 | ~5–6 blanks/activity |

Common blank core fields on live activities: `ageModifications`, `durationMinutes` (often `null`), `preparation`, `teacherLanguage`, `cleanupTips` (and weekday when not hydrated from store day).

Published customer lesson bodies remain the customer source; Admin Upgrade Lesson overlays `enrichmentDraft` (not published). Previous branch work did **not** change this production overlay.

## What will NOT appear in your Admin until an explicit production write

- Any content only present in the git branch / local agent store
- Local completion-matrix “PASS”
- Local screenshots from `127.0.0.1`

A production `enrichment_draft` save (no publish) is required for Admin to show filled fields.

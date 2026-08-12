# Production Owner Admin repair — STOP report

**STOP.** No publish. No merge. No deploy (unless you approve later).

---

## 1) Why previous `allCoreComplete: true` was wrong/misleading

It certified the **Cloud Agent local** gitignored store (`server/data/launch-store.json`) and branch JSON under `curriculum-drafts/teaching-kits-premium/`, **not** the production Postgres store your Owner Admin loads.

Local activity IDs/titles also differed (e.g. local `Bright Scarf Slow Track` vs production `Rainbow Scarf Visual Tracking`).

## 2) Exact environment previously checked

- Cloud Agent VM local-json: `server/data/launch-store.json`
- Local Playwright on `127.0.0.1`
- Git branch artifacts

## 3) Exact environment your Owner Admin uses

- **`https://littlelearnershubbyleah.com`** (Render-hosted production)
- Persist: production launch-store / Postgres behind that service

## 4) Did previous changes ever persist there?

**No.** Until this pass’s `enrichment_draft` writes, production still had `lastEditedBy: tk-first-10-content-upgrade` / missing Black & White draft, blank core fields, Colors Monday count 2 (14 total).

## 5) Exact four Teaching Kit lesson IDs

| Kit | Lesson ID | Lesson status (customer) | enrichmentPublished |
| --- | --- | --- | --- |
| Colors All Around Us | `cur-lp-infant-colors-all-around-us` | published | false |
| Black & White Discovery | `cur-lp-infant-black-white-discovery` | published | false |
| Community Helpers | `cur-lp-preschool-community-helpers` | published | false |
| Weather Watchers | `cur-lp-preschool-weather-watchers` | published | false |

Teaching Kit overlay = `lessonPlan.enrichmentDraft` (no separate TK ID). Draft versioning via enrichment history on save.

## 6) Exact 60 activity IDs

Full list: `curriculum-drafts/teaching-kits-premium/production-admin-repair-report.json` → `results[].activityIds`.

Colors now **15** (added draft-only Monday `Face-to-Face Color Talk` via `proposedDailyPlans`, itemId `item-infant-colors-face-to-face-color-talk-draft`). Live store still has original 14 published items; Admin Upgrade Lesson shows 15 from draft proposed plans.

## 7) Actual Admin/API source-of-truth

| Step | Endpoint / code |
| --- | --- |
| Admin load | `GET /api/admin/site-content` ← `app.js` `loadAdminSiteContent()` |
| Open editor | `openOwnerTeachingKitEditor` / `openAdminCurriculumLessonUpgrade` → `LLHTeachingKitEnrichmentEditor.open` |
| Field hydrate | `scripts/teaching-kit-enrichment.js` `mapActivityToOwnerEditorModel` / `getCoreActivityFieldValue` |
| Draft key | `draftKey(act) = act.id \|\| act.itemId` (`teaching-kit-enrichment-editor.js`) |
| Draft save | `POST /api/admin/curriculum/lesson-plans` `saveMode: "enrichment_draft"` |
| Completion (core pane) | `computeActivityCompletion` + `OWNER_CORE_ACTIVITY_REQUIRED_FIELDS` |
| Sidebar Complete (bug) | `activityStatus` (tips/photos) — **fixed in branch code; not live in prod JS until deploy** |

## 8) Before/after blank-field counts (production read-back)

| Kit | Before blank core cells | After blank core cells | Activity count |
| --- | --- | --- | --- |
| Colors | 70 | **0** | 14 → **15** |
| Black & White | 75 | **0** | 15 |
| Community Helpers | 75 | **0** | 15 |
| Weather Watchers | 75 | **0** | 15 |

## 9) Completeness matrix from persisted read-back

- Report: `curriculum-drafts/teaching-kits-premium/production-admin-repair-report.json`
- Visual all-60 form audit: `curriculum-drafts/teaching-kits-premium/production-admin-visual-verify.json` (**ok: true**, blanks 0)
- Screenshots: `/opt/cursor/artifacts/tk-production-admin-verify/*`

Rainbow Scarf Visual Tracking (production API model after save):

- Recommended age: filled
- Duration: 3
- Prep / caregiver language / cleanup: filled
- Objective retained & coherent with scarf tracking

## 10) Completion-badge bug fixed?

**In branch code yes** (`scripts/teaching-kit-enrichment.js` `activityStatus` now requires core fields; regression `scripts/test-activity-status-requires-core.js`).

**In the production JS bundle you are browsing: not until deploy.**  
Until then, sidebar “Complete” can still follow the old tips/photos rule even though the Core pane shows 100% from draft data.

## 11) Images created/attached

Uploaded as **draft enrichment photos** on production for activities classified image-needed (counts in repair report: Colors 3, B&W 4, Helpers 7, Weather 8 successful uploads). Remaining image-needed activities without a matching local PNG stay `imageRequirement: required` without URL (sidebar may show In Progress until photo attached or requirement set to not_needed).

## 12) Printables created/attached (draft)

| Kit | New draft resource IDs |
| --- | --- |
| Colors | `cur-res-750dac2dba18a433`, `cur-res-765d77ac99101135` |
| Black & White | `cur-res-a2f90f232a27e8ea`, `cur-res-e3c453192e3dfaf7` |
| Community Helpers | `cur-res-2e0abf716dedf25f`, `cur-res-04c3b64a153ea905` |
| Weather | `cur-res-bb036ea0b6f94e28`, `cur-res-350953835613bf1d`, `cur-res-9e4c6acbbb4ae6e5` |

Linked on `enrichmentDraft.week.printableIds`. Status **draft**.

## 13) Songs / books / toolkit

Filled/normalized on each kit’s `enrichmentDraft.week` (books prompts, song rights/motions, toolkit completeness helpers). Still draft overlay only.

## 14) Draft status

- `enrichmentDraft` present; `enrichmentPublished` **false**
- Saves used `saveMode: enrichment_draft` (`publishedUnchanged: true`)
- Lesson `status` left **published** so customer catalog membership is not yanked; customer view does not receive enrichmentDraft

## 15) Customer versions unchanged

Confirmed: no `publish_enrichment`; enrichmentPublished still false; draft save path does not merge into published dailyPlans.

## 16) Visual evidence from Owner Admin

Production Playwright walked all 15 activities × 4 kits; Core fields non-blank; farm helper text not shown as filled values. Artifacts under `/opt/cursor/artifacts/tk-production-admin-verify/`.

## 17) Exact changes still waiting on merge/deploy

- Badge/`activityStatus` regression fix in `scripts/teaching-kit-enrichment.js`
- Apply/verify scripts + docs on the PR branch
- Any future image polish beyond uploaded drafts

**Data for Admin fields is already on production** via enrichment_draft (no deploy required for you to see filled Core fields after hard refresh).

## 18) What will NOT appear until another explicit step

| Item | Needs |
| --- | --- |
| Fixed sidebar Complete logic | **Deploy** of updated `teaching-kit-enrichment.js` |
| Published customer Teaching Kit content upgrades | Your manual **Publish** of enrichment (do not auto) |
| Branch-only local store / old completion-matrix | Never affects prod; ignore for Admin truth |

---

## Tagged source paths

**Owner Admin Upgrade Lesson / draft overlay / completion**

- `app.js` — `loadAdminSiteContent`, `openOwnerTeachingKitEditor`, `openAdminCurriculumLessonUpgrade`
- `scripts/teaching-kit-enrichment-editor.js` — editor shell, `draftKey`, `saveDraft`
- `scripts/teaching-kit-enrichment.js` — core fields, `computeActivityCompletion`, `activityStatus`, flatten/proposed plans
- `server/index.js` — `GET /api/admin/site-content`, `POST .../lesson-plans` `enrichment_draft`, printable/photo upload
- `scripts/apply-production-four-tk-draft-repair.js` — production write against live IDs
- `scripts/repair-teaching-kit-premium-drafts.js` — prior local-only repair (insufficient for Admin)

**Draft data / assets**

- `curriculum-drafts/teaching-kits-premium/`
- `images/teaching-kit-drafts/`
- Production printable IDs listed above

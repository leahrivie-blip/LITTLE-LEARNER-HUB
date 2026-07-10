# Phase 2H — Legacy Lesson Plan Audit & Removal Plan

**Date:** July 10, 2026  
**Status:** Planning only — **no code changes, no deletions, no migrations, no bulk imports**  
**Prerequisite:** Curriculum foundation verified (Phase 2E–2G). Feature flag `playBasedCurriculum` remains OFF until cutover is explicitly accepted.

---

## Executive summary

The “~900 hardcoded lesson plans” are **not database rows**. They are generated at client parse time by `buildLessonPlans()` in `app.js` as:

**3 ages × 10 learning areas × 30 themes = 900 shell objects**

Full weekly lesson body text is generated on demand (`lessonDailyPlans` / `resourceDownloadBody`), not stored in those shells. Production persistence for legacy lessons is only:

| Store field | Role | Server cap |
|-------------|------|------------|
| `siteContent.lessonPlans{}` | Overrides keyed by hardcoded id | 2000 keys |
| `siteContent.customLessonPlans[]` | Admin-created full plans | 500 |
| `siteContent.activities[]` | Legacy Activity Center CMS | 500 |
| `uploadedResources[]` (category Lesson Plans / Activity Center) | File uploads | separate |

The new play-based curriculum (`siteContent.curriculum` + `curriculumLibrary`) already replaces public Lesson Plans + Activity Center when `playBasedCurriculum` is ON and `CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY === false`. Phase 2H is the controlled retirement of the legacy path after cutover is accepted.

**This document does not authorize removal.** It is the audit and sequenced strategy to use when that decision is made.

---

## 1. Audit of the legacy lesson plan system

### 1.1 Architecture (legacy)

```
app.js parse
  └── buildResourceLibrary()
        ├── buildLessonPlans()          → 900 Lesson Plans shells
        ├── buildActivityLibrary()      → 360 Activity Center shells
        ├── buildObservationLibrary()   → 1,500 Observation Hub (OUT OF 2H SCOPE)
        ├── buildFormsLibrary()
        ├── buildMenuLibrary()
        └── buildPrintableLibrary()

runtime
  └── loadResources()
        ├── FLAG OFF / FALLBACK ON → merge libraryResources + overrides + customLessonPlans + CMS activities
        └── FLAG ON (fallback false) → curriculum lesson/activity adapters; other categories stay legacy
```

### 1.2 How a legacy plan becomes user-visible

1. Shell exists in `libraryResources` (always in the JS bundle).
2. Admin publishes via override: `siteContent.lessonPlans[id].visible === true` and `archived !== true`.
3. Client gates: `applyLessonPlanOverrides()` drops unpublished shells for non-admin users.
4. Additional client-only hides: `LESSON_PLAN_VISIBILITY_LIMITS` (Infant 40 / Toddler 30 / Preschool 30) and old developmental domain label rules (`lessonPlanTemporaryHiddenReason`).

**Implication:** Most of the 900 may never appear publicly. Production override count must be measured before any deletion (`Object.keys(siteContent.lessonPlans).length` + published subset).

### 1.3 Content generation stack (legacy-only body text)

| Function | Approx. location | Role |
|----------|------------------|------|
| `lessonPlanDefaults()` | `app.js` ~5685 | Default fields from shell + override |
| `lessonDailyPlans()` | `app.js` ~9722 | Mon–Fri generated activities |
| `buildLessonPlanTextFromOverride()` | nearby | Text body from override fields |
| `resourceDownloadBody()` | `app.js` ~9828 | Download/print payload |
| `openResourceViewer()` | `app.js` ~10965 | In-app viewer |

These are the largest legacy-coupled code surfaces. Curriculum plans use stored curriculum fields + synced activities instead.

### 1.4 Soft links only (no FK)

Legacy plans do **not** create Activity Center rows. Connections are:

- `relatedActivities` string arrays on shells
- UI “Find Activities” filter navigation by theme / `activityFocus`
- Lesson-attached `resources[]` on overrides (embedded on the plan only)

Curriculum already has real links: `activity.lessonPlanId` + `syncCurriculumActivitiesForLessonPlan()`.

---

## 2. Remaining legacy lesson plan and activity sources

### 2.1 Lesson plan sources

| # | Source | Location | Count / notes | In public library when flag OFF? |
|---|--------|----------|---------------|----------------------------------|
| L1 | Hardcoded generator | `buildLessonPlans()` | **900** | Only if override published |
| L2 | Store overrides | `siteContent.lessonPlans{}` | Production-dependent | Merged onto L1 |
| L3 | Custom admin plans | `siteContent.customLessonPlans[]` | 0–500 | Yes if visible |
| L4 | Starter samples | `starterResources` (3 lesson ids) | 3 | **No** — filtered out of `loadResources()` for Lesson Plans |
| L5 | Uploads | `uploadedResources` category `"Lesson Plans"` | variable | Yes (via uploads merge) |
| L6 | Curriculum (new) | `siteContent.curriculum.lessonPlans` | Phase 2F+ | Only when flag ON |

### 2.2 Activity sources

| # | Source | Location | Count / notes | In public library when flag OFF? |
|---|--------|----------|---------------|----------------------------------|
| A1 | Hardcoded generator | `buildActivityLibrary()` | **360** (3×10 types×12 themes) | Yes (subject to visibility rules) |
| A2 | CMS activities | `siteContent.activities[]` | 0–500 | Yes if visible |
| A3 | Starter samples | `starterResources` Activity Center | 2 | Yes |
| A4 | Uploads | category `"Activity Center"` | variable | Yes |
| A5 | Curriculum activities (new) | `siteContent.curriculum.activities` | Phase 2F+ | Only when flag ON |

### 2.3 Explicitly out of Phase 2H scope

Do **not** remove as part of lesson-plan retirement:

- Observation Hub (`buildObservationLibrary` — 1,500)
- Forms, Menus, Printables hardcoded libraries
- Document Helper / provider AI tools (`generateLessonPlan`, `generateActivity` templates) — separate product surface
- Curriculum admin tabs and `siteContent.curriculum*`

---

## 3. The 900 hardcoded lesson plans — identification

### 3.1 Exact formula

```text
ages            = ["Infant", "Toddler", "Preschool"]           → 3
learningAreas   = 10 developmental areas                       → 10
lessonThemes    = lessonThemes.slice(0, 30)                    → 30
─────────────────────────────────────────────────────────────
Total shells    = 3 × 10 × 30                                  = 900
```

Confirmed by server constant:

```text
HARDCODED_LESSON_PLAN_SEED_COUNT = 900  // server/index.js ~4991
```

### 3.2 ID pattern

```text
lesson-{age-slug}-{area-slug}-{sequence}
```

Example: `lesson-infant-cognitive-1`  
`sequence = areaIndex * 30 + themeIndex + 1` (range 1–300 per age).

### 3.3 What each shell contains

Metadata only: `id`, `category`, `title`, `age`, `plan` (Free if sequence===1 else Pro), `month`, `tags`, `format`, `description`, `theme`, `developmentalArea`, `lessonNumber`, `holiday`, `activityFocus`, `weeklyOverview`, `learningObjectives`, `materials`, `relatedActivities`.

**No** Mon–Fri body, **no** ELG detail store, **no** printable files — those come from generators + optional overrides.

### 3.4 Companion hardcoded activities (legacy)

```text
buildActivityLibrary(): 3 ages × 10 activityTypes × 12 themes = 360
id pattern: activity-{age}-{type}-{theme}
```

Phase 2H should treat **360 hardcoded activities** as the same retirement wave as the 900 plans (public Activity Center legacy path).

### 3.5 No seed JSON / no import script for the 900

There is **no** bundled JSON and **no** script that generates or imports the 900. Removal is a **code deletion + consumer cleanup**, plus optional store cleanup of overrides/custom/CMS rows.

---

## 4. Legacy lesson-plan admin screens

### 4.1 Admin tabs (legacy vs curriculum)

| Tab id | Label | Legacy? | Primary mount / render |
|--------|-------|---------|------------------------|
| `lesson-plans` | Lesson Plans | **YES** | `#adminContentManagerApp` → `renderAdminContentManager()` |
| `activities` | Activities | **YES** | `#adminActivitiesManagerApp` → `renderAdminActivitiesManager()` / `renderAdminManagedCollection("activities")` |
| `visibility` | Visibility Dashboard | **YES (legacy collections)** | `renderAdminVisibilityDashboard()` — includes all 900 + CMS |
| `curriculum-lesson-plans` | Play-Based Lessons (Beta) | No | Curriculum manager |
| `curriculum-activities` | Curriculum Activities (Beta) | No | Read-only curriculum browser |
| `curriculum-resources` | Curriculum Resources (Beta) | No | Curriculum resources |

Content group default tab is still `lesson-plans` (`adminGroups` Content group).

### 4.2 Key legacy admin functions (Lesson Plans tab)

| Action | Function(s) |
|--------|-------------|
| List / filter | `allLessonPlansForAdmin()`, `filteredAdminLessonPlans()`, `renderAdminContentManager()` |
| Open editor | `openAdminLessonEditor()` |
| Save | `saveAdminLessonPlanForm()` → `siteContent.lessonPlans[id]` or `customLessonPlans[]` |
| Create / duplicate / archive / delete | `createAdminLessonPlan()`, `duplicateAdminLessonPlan()`, `archiveAdminLessonPlan()`, `deleteAdminLessonPlan()` |
| Bulk / visibility | `applyLessonPlanBulkAction()`, `toggleLessonPlanVisibility()`, `setLessonPlanStatus()` |
| AI fill (non-persisting) | `triggerAdminLessonGenerate()` → `POST /api/admin/generate-lesson-plan` |
| Structured import (DOM only) | `parseStructuredLessonPlan()`, `applyStructuredLessonPlanImport()` |
| Export all legacy JSON | `exportAllLessonPlansJson()` |
| Pre-cutover backup | `exportCurriculumBackup()` → `GET /api/admin/curriculum/backup` |
| Feature flag toggle UI | `playBasedCurriculumFlagHtml()`, `savePlayBasedCurriculumFeatureFlag()` |

### 4.3 Key legacy admin functions (Activities tab)

| Action | Config / functions |
|--------|--------------------|
| CRUD collection | `adminManagedContentConfig.activities`, `saveAdminManagedCollectionForm`, archive/visibility helpers |
| Persistence | `siteContent.activities[]` via `saveAdminSiteContent` / site-content API |

### 4.4 Feature flag control location

The play-based curriculum flag UI currently lives **inside the legacy Lesson Plan Manager**. Phase 2H must **relocate** that control to Settings / Curriculum admin **before** retiring the legacy tab.

---

## 5. Legacy activity-generation paths

### 5.1 What exists for legacy

| Path | Persists to library? | Notes |
|------|----------------------|-------|
| `POST /api/admin/generate-lesson-plan` | **No** | Returns fields; admin must Save |
| Structured lesson import (admin DOM) | **No** until Save | |
| Document Helper `generateLessonPlan()` / `generateActivity()` | **No** | Provider tool output only |
| Hardcoded `buildActivityLibrary()` | N/A | Static shells at parse time |
| Manual CMS activity form | **Yes** → `siteContent.activities[]` | |
| Soft “Find Activities” from lesson card | **No** | Navigation/filter only |

### 5.2 What does **not** exist for legacy

- No `syncLegacyActivitiesForLessonPlan`
- No automatic Activity Center row creation from lesson overrides
- No scripts that bulk-generate the 900 or 360 shells into the store

### 5.3 Curriculum path (keep — not legacy)

| Path | Role |
|------|------|
| `syncCurriculumActivitiesForLessonPlan()` | Server sync on curriculum lesson save |
| `POST /api/admin/curriculum/lesson-plans` | Curriculum persistence + activity sync |
| Phase 2F import scripts | Curriculum-only; explicitly avoid Phase 2H |

---

## 6. Dependencies that would break if legacy lesson plans were removed naively

### 6.1 Critical — break with flag OFF or FALLBACK ON

| Dependency | Why it breaks |
|------------|---------------|
| Public Lesson Plan Library (`#view-lessons`) | Fed by `loadResources()` legacy merge |
| Public Activity Center (legacy) | 360 shells + CMS; empty if generators removed without curriculum ON |
| Admin Lesson Plans tab | `allLessonPlansForAdmin()` iterates `libraryResources` Lesson Plans |
| Visibility dashboard | Bulk show/hide assumes 900 override keys |
| Portfolio / child recommendations | `suggestedLessonPlansForArea()`, `portfolioResourcesFor("Lesson Plans")`, `childLessonRecommendations()` query `resources` |
| Favorites / downloads | Stored ids like `lesson-infant-cognitive-1`; orphans if shells gone |
| Print / PDF / viewer stack | `lessonDailyPlans`, `resourceDownloadBody`, override text builders |
| Public API fields | `/api/site-content` still exposes `lessonPlans`, `customLessonPlans`, `activities` |
| Backup tooling | `buildCurriculumBackupPayload()`, `exportAllLessonPlansJson()` |
| Free plan marketing copy | “5 Lesson Plans” / “8 Activity Ideas” assumes legacy free tier counts |

### 6.2 High — break or confuse even with flag ON

| Dependency | Risk |
|------------|------|
| Legacy admin tabs still writable | Admins edit dead data; accidental site-content bloat |
| Visibility dashboard still legacy-only | Wrong operational picture post-cutover |
| `CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY` | Emergency rollback impossible if generators deleted |
| Hardcoded `libraryResources` still parsed | Bundle size / memory cost remains until code removed |
| Historical analytics | `resource_view` / `resource_print` events keyed by legacy ids |
| Account favorites in `localStorage` / account blob | Legacy ids remain until migrated or cleared |

### 6.3 Medium / soft

| Dependency | Notes |
|------------|-------|
| Home stats lesson counts | Counts from `resources` |
| Lesson card “Find Activities” / “Add Support” | Assumes legacy metadata fields |
| Uploads categorized as Lesson Plans / Activity Center | Still valid files; need policy (keep as uploads vs migrate to curriculum resources) |
| Tests | Current curriculum scripts do **not** assert the 900; CI won’t catch legacy removal regressions unless new tests are added for flag-ON libraries |
| `starterResources` lesson entries | Already excluded from load; dead samples |

### 6.4 Safe to leave (not blocked by Phase 2H)

- Observation Hub, Forms, Menus, Printables
- Document Helper AI templates (unless product wants rename)
- Curriculum APIs and admin beta tabs
- Stripe / auth / child profiles (except recommendation copy that references lesson titles)

---

## 7. Detailed Phase 2H removal strategy

### 7.0 Preconditions (must all be true before any deletion)

1. **Cutover accepted:** `playBasedCurriculum === true` in production for a stable soak period.
2. **Fallback unused:** `CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY` remains `false` and is not needed operationally.
3. **Public libraries verified** on curriculum sources only (Lesson Plans + Activity Center).
4. **Fresh legacy backup** taken via `GET /api/admin/curriculum/backup` and stored offline (checksum recorded).
5. **Production inventory** recorded (see §7.1).
6. **Favorites / analytics impact** reviewed (orphan policy decided).
7. **Feature flag UI relocated** out of legacy Lesson Plan Manager.
8. Explicit product decision: **no bulk curriculum import required for 2H** — 2H is removal/cleanup, not content creation.

### 7.1 Pre-removal production inventory (read-only)

Run (or admin-export) and record:

| Metric | How |
|--------|-----|
| Override key count | `Object.keys(siteContent.lessonPlans).length` |
| Published overrides | `visible === true && archived !== true` |
| Featured overrides | `featured === true` |
| Custom lesson plans | `customLessonPlans.length` (+ published) |
| CMS activities | `activities.length` (+ published) |
| Legacy uploads | uploads with category Lesson Plans / Activity Center |
| Curriculum counts | `curriculum.lessonPlans` / `curriculum.activities` |
| Sample favorite ids | Spot-check whether favorites still point at `lesson-*` / `activity-*` |

**Do not delete store fields during inventory.**

### 7.2 Recommended phases (implementation waves — future work)

#### Wave 0 — Soft deprecation (no deletion)

- Relocate feature-flag UI to Curriculum / Settings.
- Add admin banner on legacy Lesson Plans + Activities tabs: “Deprecated — use Play-Based Lessons.”
- Optionally hide legacy tabs behind an admin “Show legacy curriculum tools” toggle (default hidden when flag ON).
- Keep generators and store fields intact for rollback.
- Update Content group `defaultTab` to `curriculum-lesson-plans`.

#### Wave 1 — Public path hard-cut (flag already ON)

- Confirm `useCurriculumLibrarySources()` is the only public path in production.
- Add monitoring/assertions: public `/api/site-content` consumers ignore legacy lesson/activity fields when flag ON (already true for `loadResources`).
- Document rollback: set flag OFF **or** set `CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY = true` + redeploy.

#### Wave 2 — Stop writing legacy curriculum

- Disable create/save on legacy Lesson Plans + Activities admin (read-only archive view) **or** remove write handlers while keeping export.
- Keep `exportCurriculumBackup` / `exportAllLessonPlansJson` until Wave 4.
- Stop accepting new keys in operational practice (optional server reject of new `lessonPlans` / `customLessonPlans` / `activities` mutations — only after Wave 0 UI relocated).

#### Wave 3 — Code removal of generators (largest client change)

Remove or gut:

| Remove | Keep until later / replace |
|--------|----------------------------|
| `buildLessonPlans()` | Curriculum adapters |
| `buildActivityLibrary()` | Curriculum adapters |
| `applyLessonPlanOverrides` public merge path | Temporary: admin-only export helpers |
| `LESSON_PLAN_VISIBILITY_LIMITS` / old domain hide rules | N/A |
| Legacy lesson body generators if unused | Only after no admin preview of overrides |
| `loadAdminManagedLessonPlans` / `loadAdminManagedActivities` from `loadResources` | Already skipped when flag ON |
| Starter lesson/activity samples | Dead code cleanup |

**Must keep until Wave 4:** store schema fields (empty-safe), backup endpoint, flag OFF path **or** accept that flag OFF no longer serves lessons (product decision).

**Recommended product decision for Wave 3:**  
Once generators are deleted, **flag OFF should not resurrect empty libraries** — treat flag as one-way for lessons/activities, with backup restore as the only rollback for content (not code).

#### Wave 4 — Admin UI + API surface retirement

- Remove tabs: `lesson-plans`, legacy `activities` (or convert Activities tab name collision carefully — curriculum activities already separate).
- Remove Visibility dashboard legacy lesson/activity sections (or rebuild for curriculum).
- Remove/simplify: `allLessonPlansForAdmin`, `renderAdminContentManager` lesson stack, `triggerAdminLessonGenerate`, structured import for legacy.
- Public API: stop returning `lessonPlans` / `customLessonPlans` / legacy `activities` (or return empty) after clients no longer need them.
- Server: retire `HARDCODED_LESSON_PLAN_SEED_COUNT` usage in backup purpose text; optionally archive backup endpoint as `legacy-curriculum-backup` read-only forever.

#### Wave 5 — Store data cleanup (last; reversible via backup)

Only after Waves 0–4 are stable:

1. Snapshot store again.
2. Clear `siteContent.lessonPlans = {}`.
3. Clear `siteContent.customLessonPlans = []`.
4. Clear `siteContent.activities = []` **only if** confirmed unused (curriculum activities live under `curriculum.activities`).
5. Decide policy for legacy uploads (leave files; re-categorize; or link into curriculum resources manually — **not** bulk import).
6. Favorites: strip unknown ids or map via optional id-map table (only if product requires).

**Never** delete `siteContent.curriculum*` in Phase 2H.

### 7.3 Suggested PR / commit breakdown (when implementation starts)

| PR | Scope | Risk |
|----|-------|------|
| 2H-A | Relocate flag UI + deprecate banners + default tab | Low |
| 2H-B | Hide legacy tabs when flag ON (escape hatch) | Low |
| 2H-C | Read-only lock on legacy writes | Medium |
| 2H-D | Remove `buildLessonPlans` / `buildActivityLibrary` + dead starters; simplify `loadResources` | High |
| 2H-E | Remove legacy admin managers + generate-lesson-plan path | High |
| 2H-F | Public API omit legacy lesson/activity fields | Medium |
| 2H-G | Optional store cleanup script (manual run, backup-gated) | High |

Each PR requires flag-ON verification of Lesson Plans + Activity Center + admin curriculum tabs.

### 7.4 Explicit non-goals (remain out of Phase 2H)

- No bulk curriculum import / no “replace 900 with 900 curriculum plans”
- No Observation Hub / Forms / Menus / Printables retirement
- No Document Helper removal
- No production content edits by agent without explicit request
- No enabling `playBasedCurriculum` as part of planning
- No migrations that rewrite favorites at scale unless separately approved

### 7.5 Rollback matrix

| Stage completed | Rollback method |
|-----------------|-----------------|
| Wave 0–1 only | Set `playBasedCurriculum` OFF |
| Wave 2 | Re-enable legacy writes; flag OFF |
| Wave 3+ (generators gone) | **Code revert** of removal PR(s); restore backup JSON into store if data cleared |
| Wave 5 (store cleared) | Restore from `curriculum/backup` payload into `siteContent.lessonPlans` / `customLessonPlans` / `activities` |

After Wave 3, **flag OFF alone is insufficient** unless code still contains generators.

### 7.6 Verification checklist (implementation time)

- [ ] Flag ON: Lesson library shows only curriculum published/featured plans  
- [ ] Flag ON: Activity Center shows only curriculum published activities with valid `lessonPlanId`  
- [ ] Admin: Play-Based Lessons + Curriculum Activities + Resources work  
- [ ] Admin: Feature flag control still reachable without legacy tab  
- [ ] Backup export still works until Wave 4 decision  
- [ ] Favorites page does not error on orphan ids  
- [ ] Portfolio recommendations degrade gracefully (curriculum-backed or empty)  
- [ ] Free/Pro gating still correct on curriculum items  
- [ ] No accidental wipe of `curriculum` on site-content save  

### 7.7 Effort characterization (technical, not calendar)

| Area | Invasiveness |
|------|--------------|
| Inventory + Wave 0 UI | Small, localized `app.js` admin nav/flag |
| Generator removal | Large — `app.js` library build + many recommendation/viewer call sites |
| Admin manager removal | Large — thousands of lines in lesson manager / visibility |
| API field omission | Medium — `handlePublicSiteContent` + client `emptySiteContent` / merge |
| Store cleanup | Small script, high operational risk |

Primary risk concentration: **`app.js` monolithic coupling** of library build, admin CMS, viewer/print, and portfolio recommendations.

---

## 8. File index (quick reference)

| Concern | Primary locations |
|---------|-------------------|
| 900 plan generator | `app.js` `buildLessonPlans` (~923), `libraryResources` (~906) |
| 360 activity generator | `app.js` `buildActivityLibrary` (~1808) |
| Visibility limits / old labels | `app.js` ~743–767, `lessonPlanTemporaryHiddenReason` |
| Load / merge | `app.js` `loadResources`, `applyLessonPlanOverrides`, `allLessonPlansForAdmin` |
| Curriculum swap | `app.js` `useCurriculumLibrarySources`, `loadCurriculumManaged*` |
| Fallback switch | `app.js` `CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY` (~1885) |
| Legacy admin LP | `app.js` `renderAdminContentManager`, `openAdminLessonEditor`, save/bulk/export |
| Legacy admin activities | `app.js` `adminManagedContentConfig.activities`, managed collection renderers |
| Visibility dashboard | `app.js` `renderAdminVisibilityDashboard`, `adminVisibilityEntries` |
| AI generate (legacy) | `app.js` `triggerAdminLessonGenerate`; `server/index.js` `handleAdminGenerateLessonPlan` |
| Store normalization | `server/index.js` `normalizedSiteContent`, `normalizedLessonPlanOverride` |
| Public API | `server/index.js` `handlePublicSiteContent` |
| Backup | `server/index.js` `buildCurriculumBackupPayload`, `HARDCODED_LESSON_PLAN_SEED_COUNT` |
| Prior audit | `ADMIN_CONTENT_SYSTEM_AUDIT.md` |
| Cutover notes | `scripts/curriculum-phase-2f-import-remaining.js` (explicitly defers 2H) |

---

## 9. Decision log (to fill at cutover)

| Decision | Owner | Date | Notes |
|----------|-------|------|-------|
| Cutover accepted (flag ON soak complete) | | | |
| Orphan favorites policy (strip / map / ignore) | | | |
| Legacy uploads policy | | | |
| One-way flag after generator removal? | | | |
| Wave 5 store clear approved | | | |

---

## 10. Bottom line

Phase 2H is **not** “delete 900 rows from Postgres.” It is:

1. Retire **client-generated** legacy Lesson Plan + Activity Center libraries (900 + 360 shells).  
2. Retire **legacy admin** lesson/activity/visibility tooling and generate/import paths.  
3. Optionally clear **override/custom/CMS** store slices after backup.  
4. Keep **curriculum** as the sole lesson/activity system, with Observation/Forms/Menus/Printables untouched.

**Next action after this plan:** accept cutover (flag ON) when ready — still **no** Phase 2H code until Waves 0+ are explicitly requested.

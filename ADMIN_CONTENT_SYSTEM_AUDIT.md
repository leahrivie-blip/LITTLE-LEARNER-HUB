# Little Learner Hub — Admin & Content System Audit

**Date:** July 9, 2026  
**Scope:** Read-only audit of `app.js`, `index.html`, and `server/index.js`  
**Code changes:** None (audit only)

---

## Executive Summary

The admin CMS is a **single bulk document** (`siteContent`) saved through one endpoint (`POST /api/admin/site-content`), plus a **separate Uploads** system. Lesson plans, activities, forms, printables, and homepage copy share that blob. There is **no real Lesson Plan ↔ Activity Library link** — attaching files to a lesson embeds them on the plan only; they do not become Activity Center items.

The most serious reliability problems are: **`featured` status is stripped for activities/forms/printables on every server save**, **lesson-attached resources can look saved before the lesson is saved**, **full-replace site-content saves can wipe collections if a partial payload is sent**, and **Uploads report success before Postgres confirms persistence**.

---

## Architecture Overview

| Layer | Technology |
|-------|------------|
| Frontend | Single-page app: `index.html` + `app.js` (~29.5k lines) + `styles.css` |
| Backend | Node HTTP server: `server/index.js` (~5.3k lines) |
| Storage | Default: `server/data/launch-store.json`; Production: Postgres table `llh_store` (one JSONB document) |
| Admin auth | Env `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ACCESS_CODE` → opaque `admin_*` token in `store.adminSessions` |

### Content storage map

```
store (llh_store / launch-store.json)
├── siteContent                          ← bulk CMS (confirmed write via writeStoreAsync)
│   ├── lessonPlans{}                    ← overrides for hardcoded library plans
│   ├── customLessonPlans[]              ← admin-created plans
│   ├── activities[]
│   ├── forms[]
│   ├── printables[]
│   ├── reviews[], founder{}, homepage{}, pricing{}, faqs[]
│   ├── announcement{}, upgradeMessaging{}, founding{}, images[]
│   └── updatedAt
├── uploadedResources[]                  ← separate Uploads tab (writeStore = fire-and-forget)
├── users{}, adminSessions{}, ai*, tickets, analytics, …
└── childData{} (runtime)
```

### Primary save path

| Path | Client function | Server endpoint | Persistence |
|------|-----------------|-----------------|-------------|
| CMS (lessons, activities, forms, printables, homepage, etc.) | `saveAdminSiteContent()` | `POST /api/admin/site-content` | `writeStoreAsync` (waits; 503 on failure) |
| Uploads tab | `saveUploadedResourceToBackend()` | `/api/admin/uploads/upsert|migrate|delete` | `writeStore` (may succeed in UI before DB write) |
| AI prompts/settings | `saveAdminAiPrompts()` / `saveAdminAiSettings()` | separate admin AI endpoints | `writeStoreAsync` |

UI wrapper: `runAdminSave()` — disables button, awaits save, shows success/error.

---

## 1. Lesson Plan System

### Workflow (exact functions)

| Action | Function | Persistence |
|--------|----------|-------------|
| List / filter | `renderAdminContentManager()`, `filteredAdminLessonPlans()`, `allLessonPlansForAdmin()` | — |
| Create | `createAdminLessonPlan()` | Immediate `saveAdminSiteContent` → `customLessonPlans[]` |
| Edit / open | `openAdminLessonEditor()` | — |
| Save form | `saveAdminLessonPlanForm()` | Custom → `customLessonPlans[]`; library → `lessonPlans[id]` override |
| Publish / draft toggle | `toggleLessonPlanVisibility()`, `setLessonPlanStatus()` | Immediate save |
| Feature / archive / bulk | `setLessonPlanStatus()`, `applyLessonPlanBulkAction()`, `archiveAdminLessonPlan()` | Immediate save |
| Delete | `deleteAdminLessonPlan()` | Custom: remove; library: archive only |
| Duplicate | `duplicateAdminLessonPlan()` | Immediate save |
| Reset override | `resetLessonPlanOverride()` | Immediate save |
| Preview | `previewAdminLessonPlan()` → `openResourceViewer()` | Client only |
| Import (structured) | `parseStructuredLessonPlan()`, `applyStructuredLessonPlanImport()` | **DOM only — does not save** |
| AI generate | `triggerAdminLessonGenerate()` → `POST /api/admin/generate-lesson-plan` | **Returns text only — does not persist** |
| Attached printables | `handleAddLessonResource()`, draft in `adminLessonResourcesDraft` | **Deferred until lesson Save** |

### Fields that save (server-normalized)

**Library overrides** (`normalizedLessonPlanOverride`): id, title, age, theme, weeklyOverview, materials, teacherLanguage, objectives, elgConnections, familyConnection, reflectionNotes, plan, visible, archived, **featured**, thumbnailUrl, updatedAt, titleThemeImporter*, dailyActivities (Mon–Fri), resources[].

**Custom plans** (`normalizedCustomLessonPlanEntry`): above + sourceId, month, holiday, developmentalArea, activityFocus, description, tags.

### Verify results

| Check | Result |
|-------|--------|
| Fields save correctly | Core form fields yes; long text capped (e.g. 4000 chars per multiline field) |
| Data lost during editing | Risk: attached resources live in memory draft until Save; re-render of content manager can interrupt mid-edit |
| Persist after refresh | Yes, if Save completed and backend available |
| Appear to users | Only when `visible === true` and `archived !== true` (public `/api/site-content` filters) |
| Preview | Works client-side; no server preview endpoint |

### Issues

1. **Import / AI generate look complete but are not saved** until the admin clicks Save lesson plan.  
2. **Attached resources** update UI immediately but are lost on refresh if the lesson form was not saved.  
3. **Toggle visibility** (`toggleLessonPlanVisibility`) has weak error surfacing compared to the main save form.  
4. Built-in library plans cannot be truly deleted — only archived/hidden via override.  
5. Client-only temporary hide rules (`lessonPlanTemporaryHiddenReason`) can hide plans the public API would still return if `visible === true`.

**Files:** `app.js` (~866–956, ~3481–3607, ~17466–18440, ~21906–21947, ~27697+); `server/index.js` (`normalizedLessonPlanOverride` ~468–500, `normalizedCustomLessonPlanEntry` ~680–696, `handleAdminSiteContentSave` ~2644–2687, public filter ~3855–3875).

**Collections:** `siteContent.lessonPlans`, `siteContent.customLessonPlans`.

---

## 2. Activity System

### Workflow

Activities use the **unified managed collection** pattern:

| Action | Function |
|--------|----------|
| Render | `renderAdminActivitiesManager()` → `renderAdminManagedCollection("activities")` |
| Save | `saveAdminManagedCollectionForm("activities", form)` |
| Publish / draft / feature / archive | `toggleAdminManagedCollectionVisibility()`, `setAdminManagedCollectionItemStatus()` |
| Duplicate / delete | `duplicateAdminManagedCollectionItem()`, `deleteAdminManagedCollectionItem()` |
| Preview | `openResourceViewer(id)` |

Stored in `siteContent.activities[]`. After save: `syncSiteManagedResources()` → `loadAdminManagedActivities()`.

Form fields: title, age, activityCategory, plan, theme, description, tags, format, customContent, file, preview, visible, featured.

Categories: hardcoded list in `adminManagedContentConfig.activities.primaryOptions` (Math, Literacy, Science, Art, …).

### Verify results

| Check | Result |
|-------|--------|
| Save / refresh | Works via `saveAdminSiteContent` when backend + token present |
| Categories | Saved as `activityCategory`; also forced `category: "Activity Center"` |
| Appear where expected | Merged into user library when `visible === true` and not archived |
| Featured | **Broken — see Critical Issues** |

### Issues

1. **`featured` is sent by the client but stripped by `normalizedActivityEntry`** — Feature button / checkbox never persists.  
2. **Dead legacy UI code** still in `app.js` (~18641–18733): old `#adminActivityForm`, `toggleAdminActivityVisibility` (buggy toggle logic), overwritten by second `renderAdminActivitiesManager` at ~19004. Dead event handlers remain (~28106+).  
3. Visibility is opt-in (`visible === true`); omitting the flag hides the item after normalize.

**Files:** `app.js` (`adminManagedContentConfig` ~18747+, `saveAdminManagedCollectionForm` ~19016+, legacy ~18637–18733); `server/index.js` (`normalizedActivityEntry` ~528–552).

**Collection:** `siteContent.activities`.

---

## 3. Lesson Plan ↔ Activity Connection (Critical)

### Actual workflow today

```
Admin opens Lesson Plan editor
  → "Printables & Resources" section (renderAdminLessonResourcesSection)
  → Add Resource: title + category + file
  → handleAddLessonResource() stores in adminLessonResourcesDraft (memory only)
  → Admin clicks "Save lesson plan"
  → resources[] embedded on that lesson override / custom plan
  → Server: normalizedLessonPlanResource (id, title, category, url, mimeType, order)
```

### Answers to audit questions

| Question | Answer |
|----------|--------|
| Does the activity save? | **No Activity Library item is created.** Only an embedded file on the lesson. |
| Does it save immediately? | **No.** Draft until lesson Save. |
| Appear in Activity Library? | **No.** |
| Correct category? | Lesson resource categories only (`lessonPlanResourceCategories` — separate from Activity categories). |
| Remain connected after refresh? | Only if the lesson was saved with the draft. |
| Editing either side break connection? | There is no shared ID. Editing an Activity Center item never updates lesson attachments (and vice versa). |

### Related (non-admin) links

- Hardcoded `relatedActivities` strings on generated library plans (`buildLessonPlans`).  
- User “Find Activities” filters Activity Center by theme/focus — not a stored relationship.  
- Custom plans may store `activityFocus` / `sourceId` as metadata only.

### Weak points

1. Naming collision: “Add Resource” on a lesson ≠ Activity Manager ≠ Uploads tab.  
2. Deferred draft → false sense of persistence.  
3. Full re-render after add/remove resource can disrupt unsaved form fields.  
4. Large base64 files inflate the entire `siteContent` POST.  
5. No foreign key / reference model between `activities[]` and lesson `resources[]`.

**Files:** `app.js` ~3170–3173, ~3481–3607, ~952, ~26447; `server/index.js` ~429–455, ~498.

---

## 4. Resource System

There are **three different “resource” concepts**:

### A. Uploads tab (admin Content → Uploads)

| Piece | Detail |
|-------|--------|
| UI | `#uploadForm`, `#adminContentTable` in `index.html` |
| Save | `saveUploadedResourceToBackend()` → `/api/admin/uploads/upsert` |
| Fallback | `localStorage` key `llhUploadedResources` |
| Store | `store.uploadedResources` (not inside `siteContent`) |
| Visibility | Default **visible** (`visible !== false`) — opposite of CMS items |
| Merge | `mergeUploadedResources` by id + fingerprint dedupe |

### B. Lesson-attached resources

Embedded `resources[]` on lesson plans (see §3).

### C. Hardcoded library + managed CMS items

`buildResourceLibrary()` merges hardcoded packs with admin-managed activities/forms/printables.

### Issues

1. Upload endpoints use **`writeStore` (fire-and-forget)** — UI can show success while Postgres write fails.  
2. localStorage fallback can make an admin think content is “live” when it is only on that browser.  
3. Overlapping categories with Forms Library / Printables confuse which system owns a file.

**Files:** `app.js` ~16430–16520, ~21061–21095, ~26828, ~28234; `server/index.js` ~582–678, ~4166–4235.

**Collection:** `store.uploadedResources`.

---

## 5. Printable System

Managed collection type `"printables"` → `siteContent.printables[]`.

| Action | Function |
|--------|----------|
| Render / save / visibility | Same as activities via `adminManagedContentConfig.printables` |
| Category field | `printableType` |
| Default category label | `"Printables"` |

Also: large hardcoded `buildPrintableLibrary()` baseline; admin items merge in via `syncSiteManagedResources`.

### Issues

1. Same **`featured` strip** as activities (`normalizedLibraryItemEntry`).  
2. Client may hide Printables category entirely when `isPrintablesUpgradeModeActive()` — separate from per-item visibility.  
3. Lesson “Printables & Resources” is a different system (embedded files).

**Files:** `app.js` ~18786–18802, ~19012, ~19016+; `server/index.js` ~554–580, ~726.

**Collection:** `siteContent.printables`.

---

## 6. Forms System

Managed collection type `"forms"` → `siteContent.forms[]`.

| Action | Function |
|--------|----------|
| Same pattern as activities/printables | `renderAdminFormsManager`, `saveAdminManagedCollectionForm("forms", …)` |
| Category field | `formCategory` (options from `formGroups` + existing items) |

Hardcoded `buildFormsLibrary()` still seeds the library.

### Issues

1. **`featured` stripped** on server normalize.  
2. Overlap with Uploads default category `"Forms Library"`.  
3. Hide/unhide = draft/approved via same 4-status model; persists only through full site-content save.

**Files:** `app.js` ~18765–18785, ~19008; `server/index.js` ~554–580, ~725.

**Collection:** `siteContent.forms`.

---

## 7. Homepage Content

### Editable via admin

| Section | Admin surface | Save function | Applied by |
|---------|---------------|---------------|------------|
| Hero (badge, headline, sub, CTAs, benefits, social proof) | Site Editor → Hero **and** Settings → Homepage | `saveAdminHeroForm`, `saveAdminHomepageForm` | `renderManagedHomeContent()` |
| Trust / showcase / preview cards | Site Editor → Trust; Settings → Homepage | `saveAdminTrustForm`, `saveAdminHomepageForm` | same |
| Journey / Why | Site Editor → Journey | journey save fn | same |
| Reviews | Content → Reviews + Site Editor Reviews CTA | review / CTA saves | reviews grid + headings |
| Founder | Content → Founder | `saveAdminFounderForm` | founder block |
| Pricing / Free plan / Trial copy | Site Editor → Pricing | `saveAdminPricingForm` | `renderManagedPricingText()` |
| Founding member | Site Editor → Founding | `saveAdminFoundingForm` | `renderHomeFoundingOffer()` |
| FAQs | Site Editor → FAQs | FAQ save | `renderManagedFaqContent()` |
| Announcement banner | Site Editor → Announcement | announcement save | `renderManagedAnnouncementBanner()` |
| Upgrade / trial messaging | Site Editor → Upgrade Msg | upgrade save | upgrade UI copy |
| Images library | Settings → Images | `saveAdminImageAssetForm` | `siteContent.images` |

Draft flags (`_draft`) exist for pricing, founding, announcement, upgrade messaging. **Client** skips applying drafts for pricing/founding/announcement; **public API does not strip `_draft` content** from the JSON payload.

### Hardcoded / not editable

| Item | Status |
|------|--------|
| **Site footer** | No footer CMS; no dedicated footer admin section found |
| Free Daycare Starter Pack lead form behavior | Hardcoded lead capture (`saveLead`) |
| Menu Center content | `buildMenuLibrary()` — hardcoded (noted as future admin) |
| Observation packs | `buildObservationLibrary()` — hardcoded |
| Most lesson/activity/form/printable seed libraries | Generated in `build*Library()` |
| Founding prices `$9.99` / `$19.99` in founding card | Mostly hardcoded in `renderHomeFoundingOffer()` (copy editable, dollar amounts largely not) |
| Legal page copy | Static in `index.html` |
| Default homepage HTML shell | `index.html` `#view-home`; defaults scraped by `captureDefaultSiteContent()` |

### Broken / risky

1. **Dual homepage editors** (Settings → Homepage vs Site Editor) edit overlapping fields — last save wins; easy to overwrite.  
2. Public `/api/site-content` returns draft homepage/pricing/founding fields without server-side draft filtering.  
3. Footer is not manageable.

**Files:** `app.js` ~3610+, ~9228–9430, ~17850–18600, ~19947–20740, ~24210+; `index.html` `#view-home`, admin Site Editor apps; `server/index.js` `normalizedSiteContent` homepage/pricing/founding ~739–836.

---

## 8. Admin Dashboard

### Structure (`adminGroups`)

Dashboard · Content · Visibility · Users · Settings · Site Editor · AI

### Control reliability

| Control | Typical behavior |
|---------|------------------|
| Save buttons | Use `runAdminSave` + `saveAdminSiteContent` for CMS; reliable when backend up |
| Edit | Sets editor id and re-renders form |
| Delete | Confirms; custom lessons/managed items removed; library lessons archived |
| Hide / Publish | Status buttons → immediate save |
| Visibility dashboard | `renderAdminVisibilityDashboard`, bulk/per-item toggles → same CMS save |

### Inconsistencies / duplicate code

1. Legacy vs new Activities manager (dead code).  
2. Dual homepage editors.  
3. Uploads vs managed Forms/Printables vs lesson resources.  
4. Visibility dashboard uses simplified visible/hidden/archived, not full 4-status emoji UX everywhere.  
5. `adminSectionTabs` kept for compatibility while `adminGroups` drives UI.  
6. Lesson plans have import/AI/bulk tools; activities/forms/printables do not.

**Files:** `app.js` ~3177–3246, ~19187–19381, ~20985+; `index.html` `#view-admin` ~732–853.

---

## 9. Universal Save Reliability Audit

### Save systems in use

1. **`saveAdminSiteContent`** — universal CMS blob (most admin content).  
2. **Uploads API + localStorage** — separate.  
3. **AI admin endpoints** — separate.  
4. **Session/UI prefs** — `localStorage` only (`llhAdminSession`, `llhAdminActiveSection`, etc.).

A single universal save **already exists for CMS** (`runAdminSave` → `saveAdminSiteContent`). Uploads and AI are intentionally separate. The problem is not “too many CMS saves” — it is **false confidence** and **field stripping**.

### Where data can be lost / false success

| Location | Risk |
|----------|------|
| Lesson resource add/reorder/remove | Memory draft until lesson save |
| Structured import / AI lesson generate | Fills form only |
| Activities/Forms/Printables **Feature** | Client saves `featured: true`; server drops field → reload shows not featured |
| Full `siteContent` replace | Concurrent or partial client payload can wipe sibling collections |
| Uploads on Postgres | 200 before write completes |
| Uploads localStorage fallback | Looks saved; not shared / not production DB |
| Homepage dual editors | One form overwrites the other’s fields |
| `rerenderActiveContent()` after save | Can reset other dirty admin forms without guards |
| No CMS autosave | Navigate away without save (lesson + managed forms have some `beforeunload` guards; homepage/reviews weaker) |
| Missing backend / token | `saveAdminSiteContent` throws — good; local preview token may not work against production |

### Should a universal save system exist?

**Partially already does** for site content. Recommendations:

- Keep one CMS save path; do **not** invent a second.  
- Fix normalizers so client status fields round-trip.  
- Move Uploads to `writeStoreAsync` (or confirm write).  
- Persist lesson resource drafts with the same save semantics (or clear messaging: “Not saved until you save the lesson”).  
- Consider merge/patch API later to reduce full-replace wipe risk — not required before fixing field stripping and draft messaging.

---

## 10. Database Audit

### Collections / keys

| Key | Purpose | Relationships |
|-----|---------|---------------|
| `siteContent.lessonPlans` | Overrides keyed by hardcoded plan id | Soft link to client `libraryResources` by id |
| `siteContent.customLessonPlans` | Full admin plans | Optional `sourceId` (unvalidated) |
| `siteContent.activities` | Activity Center CMS | **None** to lesson plans |
| `siteContent.forms` / `printables` | Library CMS | None |
| `siteContent.reviews`, `faqs`, `images`, `homepage`, `pricing`, `founding`, `announcement`, `upgradeMessaging`, `founder` | Marketing CMS | None |
| `uploadedResources` | Uploads tab | None to siteContent items |
| `users` | Accounts / billing | Stripe / child data by email/uid |
| Menus | **Not stored** | Hardcoded `buildMenuLibrary()` |
| Observation packs | **Not stored** | Hardcoded |

### Missing relationships

- Lesson plan ↔ Activity Library (no IDs).  
- Lesson resources ↔ Printables/Forms/Uploads (embedded copies).  
- Menu / Observation admin collections.

### Duplicate structures

- Forms in `siteContent.forms` **and** Uploads often categorized `"Forms Library"`.  
- Printables in `siteContent.printables` **and** lesson `resources[]` **and** hardcoded printables.  
- Homepage fields editable in two admin UIs.  
- Activities: dead old manager + new managed collection.

### Simplification opportunities

1. One “library item” model for activities/forms/printables/uploads with shared visibility rules.  
2. Lesson attachments as references (`activityId` / `uploadId`) instead of embedded base64.  
3. Single homepage editor.  
4. Add `featured` to all content normalizers (or drop Feature UI where unsupported).  
5. Patch/merge site-content by section to avoid full-document races.

---

## Critical Issues

Issues that cause **content loss**, **save failures**, **broken connections**, or **visibility lies**.

### C1. `featured` status silently dropped for Activities, Forms, and Printables

- **What happens:** Admin clicks Feature or checks Featured → client POSTs `featured: true` → server `normalizedActivityEntry` / `normalizedLibraryItemEntry` omit `featured` → response has no featured → UI shows Draft/Approved after refresh.  
- **Lesson plans are OK** (`normalizedLessonPlanOverride` keeps `featured`).  
- **Files:** `server/index.js` `normalizedActivityEntry` (~528–552), `normalizedLibraryItemEntry` (~554–580); `app.js` `contentStatusFields`, `setAdminManagedCollectionItemStatus`, managed form checkbox (~18956, ~19058).  
- **Collections:** `siteContent.activities`, `.forms`, `.printables`.

### C2. Lesson-attached resources appear added but are not persisted until lesson Save

- **What happens:** “Add Resource” updates draft + re-renders; refresh loses files.  
- **Files:** `app.js` `handleAddLessonResource`, `adminLessonResourcesDraft`, `saveAdminLessonPlanForm` resources merge (~3481–3607, ~18050–18094).  
- **Collection:** `resources[]` on lesson override/custom plan.

### C3. Full-replace `siteContent` can wipe collections

- **What happens:** `handleAdminSiteContentSave` replaces entire `store.siteContent` with normalized incoming blob. A stale tab or incomplete draft can overwrite other sections.  
- **Files:** `server/index.js` ~2644–2687; `app.js` `nextSiteContentDraft`, `saveAdminSiteContent` (~3098–3125).  
- **Collections:** all of `siteContent`.

### C4. Uploads can report success without confirmed Postgres persistence

- **What happens:** `writeStore` queues DB write; HTTP 200 returns immediately.  
- **Files:** `server/index.js` `writeStore` (~909–923), upload handlers (~4174–4235); `app.js` upload save + localStorage fallback.  
- **Collection:** `store.uploadedResources`.

### C5. No Lesson Plan ↔ Activity Library connection (product gap treated as reliability risk)

- Admins reasonably expect “add activity to lesson” to create/link Activity Library items. Current design embeds files only. Editing either side cannot stay in sync because there is no link.  
- **Files:** §3 file list.

### C6. Import / AI generate success messaging without persistence

- Structured import and AI generation fill the editor only.  
- **Files:** `applyStructuredLessonPlanImport`, `triggerAdminLessonGenerate`; server `handleAdminGenerateLessonPlan` (no write).

---

## High Priority Fixes

### H1. Align visibility defaults across content types

CMS items require `visible === true`; uploads default visible. Easy to publish/hide the wrong way.

### H2. Remove or wire dead Activities manager code

Legacy `renderAdminActivitiesManager` / `toggleAdminActivityVisibility` / old event handlers confuse future fixes and include a broken toggle expression (`visible: activities[idx].visible === false`).

### H3. Unify or clearly separate homepage editors

Settings → Homepage vs Site Editor overlap.

### H4. Confirm upload writes with `writeStoreAsync` (or return error on failure)

Match site-content reliability.

### H5. Surface save errors on all immediate toggles

Lesson/managed visibility toggles should use the same error UX as `runAdminSave`.

### H6. Clarify Uploads vs Forms vs Printables vs lesson resources in admin UI copy

Prevent wrong-system uploads and “missing” content.

### H7. Guard concurrent admin saves / stale tabs

At minimum: `updatedAt` conflict check before replace.

### H8. Public API draft filtering

Do not return `_draft` pricing/founding/announcement/homepage variants as if live (or document that client must filter — currently inconsistent).

---

## Medium Priority Fixes

### M1. Menu Center & Observation Packs admin (currently hardcoded)

Noted in code as future build (`buildMenuLibrary`, `buildObservationLibrary`).

### M2. Footer CMS

No admin control today.

### M3. Reduce base64-in-JSON for files

Move binaries to object storage; store URLs only.

### M4. Admin session expiry / cleanup

Tokens never expire; `adminSessions` grows.

### M5. Body size limits on `readJson`

Large site-content POSTs can OOM or fail opaquely.

### M6. Enforce temporary lesson-hide rules server-side or remove them

Avoid API/UI mismatch.

### M7. Delete dead `adminSectionTabs` / legacy handlers after H2

### M8. Founding dollar amounts editable (or clearly labeled as fixed)

---

## Recommended Fix Order

1. **C1** — Add `featured` (and any other status fields) to activity/form/printable normalizers so Feature/Publish round-trip.  
2. **C2 + C6** — Persist messaging: block navigation with dirty resource draft; change import/AI copy to “Applied to form — click Save”; optional auto-save resources with lesson.  
3. **C4 + H4** — Confirmed persistence for uploads.  
4. **H1 + H6** — Visibility/default and labeling consistency.  
5. **H2** — Remove dead activity manager; keep one path.  
6. **H3** — Single homepage editor.  
7. **C3 + H7** — Conflict detection or sectional merge for `siteContent`.  
8. **H5 + H8** — Toggle error UX + public draft filtering.  
9. **C5** (feature work) — Real lesson↔activity references if product requires it.  
10. **M1–M8** — Menus, footer, storage, sessions, etc.

---

## Files Involved (Quick Index)

| Area | Files | Key functions / components | Collections |
|------|-------|----------------------------|-------------|
| CMS save | `app.js`, `server/index.js` | `saveAdminSiteContent`, `runAdminSave`, `handleAdminSiteContentSave`, `normalizedSiteContent`, `writeStoreAsync` | `siteContent` |
| Lesson plans | `app.js`, `server/index.js` | `saveAdminLessonPlanForm`, `createAdminLessonPlan`, `setLessonPlanStatus`, `toggleLessonPlanVisibility`, `deleteAdminLessonPlan`, `previewAdminLessonPlan`, `normalizedLessonPlanOverride`, `normalizedCustomLessonPlanEntry` | `lessonPlans`, `customLessonPlans` |
| Lesson resources | `app.js`, `server/index.js` | `handleAddLessonResource`, `adminLessonResourcesDraft`, `normalizedLessonPlanResource` | `resources[]` on plans |
| Activities | `app.js`, `server/index.js` | `saveAdminManagedCollectionForm`, `renderAdminManagedCollection`, `normalizedActivityEntry` | `activities` |
| Forms / Printables | `app.js`, `server/index.js` | same managed collection + `normalizedLibraryItemEntry` | `forms`, `printables` |
| Uploads | `app.js`, `index.html`, `server/index.js` | `#uploadForm`, upload upsert/migrate/delete, `mergeUploadedResources` | `uploadedResources` |
| Homepage | `app.js`, `index.html` | Site Editor forms, `saveAdminHomepageForm`, `renderManagedHomeContent`, `renderManagedPricingText`, `renderHomeFoundingOffer` | `homepage`, `pricing`, `founding`, … |
| Visibility dashboard | `app.js` | `renderAdminVisibilityDashboard`, `toggleVisibilityDashboardItem` | all CMS arrays |
| Menus | `app.js` only | `buildMenuLibrary` | none |
| Users | `server/index.js`, `app.js` | `upsertUser`, analytics, Users admin UI | `users` |

---

## What Works Reliably (Baseline)

- Admin login + token-gated CMS reads/writes.  
- Lesson plan create/edit/save/publish/archive for core text fields when Save completes successfully.  
- Activities/Forms/Printables CRUD and publish/draft **except Featured**.  
- Site-content Postgres path uses confirmed writes (`writeStoreAsync`) with 503 on failure.  
- Public filtering of unpublished lessons/activities/forms/printables on `/api/site-content`.  
- Pricing, founding, hero, FAQs, announcement editable through Site Editor (with draft caveats above).

---

*End of audit. No application code was modified.*

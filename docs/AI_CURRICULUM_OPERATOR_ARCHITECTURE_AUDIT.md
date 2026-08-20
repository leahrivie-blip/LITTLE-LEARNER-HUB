# AI Curriculum Operator — Architecture Audit & Implementation Plan

**Date:** 2026-08-20  
**Scope:** Architecture audit + **Phase 1 implementation** (audit-only operator). No production data modified.  
**Verdict:** The existing architecture is **strong enough to support this without a major rewrite.** Build an orchestration layer that calls existing trusted save/upload/validate paths. Do not create parallel curriculum stores, parallel publishers, or an unrestricted agent.

### Phase 1 shipped (this branch)

| Piece | Location |
|---|---|
| Typed command / job / asset-plan schemas | `scripts/curriculum-operator-schema.js` |
| NL → command parser | `scripts/curriculum-operator-command.js` |
| Lesson selection | `scripts/curriculum-operator-select.js` |
| Read-only audit + future asset plan | `scripts/curriculum-operator-audit.js` |
| Durable jobs | `scripts/curriculum-operator-job.js` + `store.curriculumOperatorJobs` |
| Owner API | `server/curriculum-operator.js` → `POST /api/admin/curriculum/operator` |
| Owner Admin UI | Content tab **AI Curriculum Operator** (`scripts/curriculum-operator-ui.js`) |
| Feature flag | `teachingKitCurriculumOperator` (default **false**) |
| Tests | `npm run test:curriculum-operator-phase1` |

Phase 1 **never mutates curriculum** and **never publishes**. Asset KEEP/GENERATE/CREATE decisions are planned only.

---

## Executive summary

Little Learner Hub already has most of the curriculum-production building blocks the Owner Operator needs:

| Capability | Status | Primary source of truth |
|---|---|---|
| Lesson load/create/update/draft | Strong | `POST /api/admin/curriculum/lesson-plans` + `normalizedCurriculumLessonPlan` |
| Activity sync | Strong | `syncCurriculumActivitiesForLessonPlan` (via lesson save) |
| Master Paste import/replace | Strong | `scripts/curriculum-lesson-structure-paste.js` + replace save mode |
| Teaching Kit completeness | Strong | `scripts/teaching-kit-enrichment.js`, `teaching-kit-ai-lesson-teacher.js` |
| Quality / publish readiness | Strong | `scripts/teaching-kit-quality-review.js`, `teaching-kit-status.js` |
| Enrichment AI suggestions | Partial | `server/enrichment-ai.js` (suggest-only; lesson scope is fixture-backed today) |
| Curriculum Director (library intelligence) | Partial | `scripts/teaching-kit-curriculum-director.js` (coverage/reuse; not an executor) |
| Curriculum Production composer | Partial | `scripts/teaching-kit-curriculum-production.js` (**no HTTP route**; fixture drafts) |
| Image generate | Partial | Visual Production generates **previews only**; `attach` is intentionally blocked |
| Activity photo upload/link | Strong | `enrichment-photos/upload` → draft `setupImageUrl` / `exampleImageUrl` |
| Printable upload/link | Strong | `resources/tk-printable`, resource link/unlink |
| Printable intelligence/PDF auto-gen | Weak | Paste/upload human-driven; VP overlays are lesson-specific; assistant packs are ephemeral |
| Songs/books schema + Print Center | Strong | Normalized book/song entries + binder print model |
| Draft / version / rollback | Strong | `enrichmentDraft`, `enrichmentPublishHistory`, paste_replace snapshots, Draft Review |
| Durable multi-lesson job runner | **Missing** | No store-backed curriculum job queue |
| NL → structured job plan | **Missing** | No command parser / operator schema |
| Safe tool allowlist orchestration | **Missing** | Pieces exist as separate APIs, not one operator |

**Bottom line:** Orchestrate existing APIs. Add a durable job collection, a typed command/plan schema, an owner UI, and thin trusted action wrappers. Keep Phase 1 draft-only (no auto-publish).

---

## 1. Existing functions / modules that can be reused

### Lessons

| Concern | Module / function | Notes |
|---|---|---|
| Normalize lesson | `server/index.js` → `normalizedCurriculumLessonPlan` | Canonical schema |
| Save / create / status | `handleAdminCurriculumLessonPlanSave` | Modes: `full`, `enrichment_draft`, `publish_enrichment`, `replace_from_master_paste` |
| Delete | `handleAdminCurriculumLessonPlanDelete` | Confirm title required |
| Access plan Free/Pro | `handleAdminCurriculumLessonAccessPlan` + `server/curriculum-lesson-access-plan.js` | Preserve on upgrades |
| Client create blank | `persistNewCurriculumLessonDraft` (`app.js`) | `createNewLesson: true` |
| Client classic save | `saveAdminCurriculumLessonPlanForm` | Full editor |
| Preserve enrichment on classic save | `mergeEnrichmentPreservingLessonPlan` | Critical — do not bypass |

### Activities

| Concern | Module / function | Notes |
|---|---|---|
| Flatten for scoring | `teaching-kit-enrichment.js` → `flattenLessonActivities` | Use for audit |
| Sync flat store | `syncCurriculumActivitiesForLessonPlan` | Always go through lesson save |
| Activity field meta | `teaching-kit-paste-import.js` → `ACTIVITY_FIELD_META` | Aliases + headings |
| Core owner fields | `OWNER_CORE_ACTIVITY_FIELD_KEYS` in enrichment | Title, day, category, objective, materials, setup, steps, etc. |

**There is no independent activities write API.** Operator tools must update via lesson / enrichment_draft / Master Paste.

### Master Paste

| Concern | Module / function |
|---|---|
| Parse full paste | `curriculum-lesson-structure-paste.js` → `parseFullLessonStructurePaste`, `buildCanonicalLessonPlan` |
| Identity guard | `masterPasteReplaceIdentityConflict` |
| Activity ID preservation | `matchMasterPasteActivitiesToExisting`, `applyMasterPasteActivityMatches` |
| Replace comparison UI | `buildMasterPasteReplaceComparison` |
| Server replace | `replaceCurriculumLessonContentFromMasterPaste` + snapshot `kind: "paste_replace"` |
| Week/activity paste into draft | `teaching-kit-paste-import.js` |
| Shared week parsers (books/songs/printables) | `curriculum-week-kit-paste.js` |

### Teaching Kit standards / scoring

| Concern | Module / function |
|---|---|
| Canonical field standards | `scripts/curriculum-standards.js` (`WEEKLY_REQUIRED_FIELDS`, `ACTIVITY_REQUIRED_FIELDS`, age bands) |
| Completeness analysis | `teaching-kit-ai-lesson-teacher.js` → `analyzeLessonCompleteness` |
| Completion % | `teaching-kit-enrichment.js` → `computeCompletionPercent` |
| Quality + publish readiness | `teaching-kit-quality-review.js` → `evaluateTeachingKit`, `buildQualityReport` |
| UI status labels | `teaching-kit-status.js` |
| Gold-standard offline validator | `llh-curriculum-gold-standard.js` |
| True hard blockers | `teaching-kit-owner-workspace.js` → `collectTruePublishBlockers` |
| Production upgrade composer | `teaching-kit-curriculum-production.js` → `upgradeOneLesson`, `buildProductionQueue` |

### AI (existing)

| Endpoint / module | What it does | Does **not** do |
|---|---|---|
| `POST …/enrichment-ai-suggest` | Suggest structured field improvements (activity/week); logs events | Persist / publish / media |
| `POST …/ai-teacher-assistant` | Improve text, toolkit, printable pack drafts, example-image drafts, quality | Mostly heuristics; no auto-publish |
| `POST …/director` | Coverage, recommendations, master resources, planning Q&A | Execute upgrades across lessons |
| `teaching-kit-curriculum-production.js` | Batch fixture draft packs offline | No HTTP; not live OpenAI lesson packs |
| `server/ai-guide.js` | Provider writing assistant | Not TK operator infrastructure |

### Images

| Concern | Module / route |
|---|---|
| Generate preview | `POST …/visual-production` action `generate` + `visual-production-image.js` |
| Preview storage | `visual-production-media.js` |
| **Attach to lesson** | Action `attach` exists but **always returns 409 `attach_blocked`** |
| Activity photo upload | `POST …/enrichment-photos/upload` → URLs returned; client/draft assigns |
| Cover upload/assign | `lesson-covers/upload`, `lesson-covers/assign` |
| Promote draft photos on publish | `enrichment-media.js` → `promoteDraftPhotoUrlsToPublic` |

### Printables / resources

| Concern | Module / route |
|---|---|
| TK printable CRUD | `POST …/resources/tk-printable` (`create|update|replace_pdf|…`) |
| Link / unlink | `resources/link`, `resources/unlink` |
| Media binaries | `curriculum-media.js` + `llh_media_assets` |
| PDF merge/inspect | `teaching-kit-printable-pdf-merge.js` |
| Paste printable ideas into draft | `teaching-kit-printable-paste.js` |
| Binder print (client) | `teaching-kit-binder-job.js`, `teaching-kit-print.js` |

### Songs / books

- Schema: `normalizedCurriculumBookEntry` / `normalizedCurriculumSongEntry` in `server/index.js`
- Draft week: `enrichmentDraft.week.books` / `.songs`
- Completeness: `bookRecordComplete` / `songRecordComplete`
- Print Center / binder selective print already understands songs & books
- AI can suggest songs/books via enrichment categories; do not invent fake published book metadata

### Draft / version / rollback

| Mechanism | Where |
|---|---|
| Working copy | `plan.enrichmentDraft` |
| History (draft / publish / paste_replace) | `plan.enrichmentPublishHistory` via `enrichment-publish-history.js` |
| Enrichment rollback | `POST …/enrichment-rollback` |
| Draft Review queue | `siteContent.curriculumDraftReviews` + `POST …/draft-review` |
| Discard undo stash | `enrichmentDraftUndo` |

**Important dual-publish note:**  
- Enrichment Editor `publish_enrichment` → merges draft into lesson body/activities, clears draft.  
- Draft Review `publish` → sets `enrichmentPublished`, may not merge into body.  
Operator Phase 1 should **only** save `enrichment_draft` and leave Ready for Review. Do not call either publish path until Phase 8.

### Owner auth

- Gate: `requireTeachingKitOwnerAdminSession` (`server/index.js`)
- Email allowlist: `TEACHING_KIT_OWNER_PREVIEW_EMAIL` / `isTeachingKitOwnerPreviewEmail` (`scripts/teaching-kit.js`)
- Flags default **false**: Enrichment Editor, Director, Quality Review, Authoring, Viewer, Print Center, Attachments
- Operator must reuse the same owner-admin gate; never expose OpenAI/storage keys client-side

### Background / batch today

| Exists | Gap |
|---|---|
| Client binder job stages (in-memory) | Not durable |
| CLI `curriculum-bulk-import-pipeline.js` | Not a server job |
| Draft Review queue entries | Human review workflow, not AI operator |
| Visual Production briefs in `store.visualProduction` | Isolated; does not mutate lessons |
| In-process production script | No resume/HTTP |

**No Bull/BullMQ/pg-boss curriculum job runner exists.** Closest durable pattern: Draft Review queue inside `llh_store` JSON.

---

## 2. Existing AI capabilities (detail)

1. **Enrichment AI Suggest** — structured JSON suggestions with categories for activity + week fields; timeout + request-id logging; `applySuggestionsToDraft` exists but is invoked after human/owner accept paths.
2. **AI Lesson Teacher** — gap analysis across 15 kit sections; apply accepted decisions into draft; pure helpers.
3. **AI Teacher Assistant** — deterministic “make better”, toolkit builders, printable pack *drafts*, example-image drafts, learn-from-me style prefs in `siteContent.teachingKitAssistant`.
4. **Curriculum Director** — library coverage dashboard, reuse recommendations, master resource library (not lesson mutation executor).
5. **Curriculum Production** — `upgradeOneLesson` composes Lesson Teacher + Director + Quality for fixture-backed draft packs; returns draft for caller to save; never publishes.
6. **Visual Production** — plan → approve → generate image preview; attach blocked by design.
7. **Provider AI Guide** — separate product surface; do not wire as operator core.

**Gap for Operator:** live OpenAI structured generation for full multi-section lesson upgrades (lesson scope is fixture today), durable chaining, and verified media attach.

---

## 3. Master Paste implementation (source of truth)

- **Parser / structure:** `scripts/curriculum-lesson-structure-paste.js`
- **Week kit fragments:** `scripts/curriculum-week-kit-paste.js`
- **Enrichment paste:** `scripts/teaching-kit-paste-import.js`
- **Server replace path:** `saveMode: "replace_from_master_paste"` with identity + activity matching + history snapshot
- **Standards config:** `scripts/curriculum-standards.js` should become the Operator’s canonical weekly/activity standard (already age-banded)

Operator’s conceptual `applyTeachingKitStandard(lessonId)` should **not** dump raw text into the DB. It should:

1. Load plan + activities  
2. Audit vs `curriculum-standards` + `analyzeLessonCompleteness` + quality review  
3. Produce structured field patches (same shapes as enrichment draft / paste apply)  
4. Save via `enrichment_draft` (or Master Paste replace only when owner explicitly requests full replace and confirmations pass)

---

## 4. Teaching Kit validation (source of truth)

Use these in order for every lesson unit of work:

1. `analyzeLessonCompleteness` — KEEP / IMPROVE / MISSING section map  
2. `computeCompletionPercent` — structural fill  
3. `evaluateTeachingKit` / `buildQualityReport` — quality + `blocksPublish` / `publishReadiness`  
4. `collectTruePublishBlockers` — hard stops (title, age, ≥1 activity, id)  
5. Asset checks — image URLs resolve; resource ids exist; PDF inspect where applicable  
6. Identity invariants — lesson `id` unchanged; `plan` Free/Pro unchanged unless command says otherwise  

**Do not chase scores.** Prefer teacher usefulness; reject generic filler (quality review already flags many weak patterns).

---

## 5. Image generation / upload system

**Reuse path for Phase 3:**

1. Build activity-specific prompt from materials/setup/steps/age (`imageBriefSetup` / `imageBriefExample` fields already exist)  
2. Generate via existing OpenAI images helper (`visual-production-image.js`) **or** extend a new *trusted* server action that writes through enrichment media (preferred for attach)  
3. Persist via `enrichment-media` / `enrichment-photos/upload`  
4. Assign URLs to **exact activity id** in `enrichmentDraft.activities[id]`  
5. Verify media GET works  
6. Do not overwrite a working image until replacement is stored  

**Do not** enable unrestricted Visual Production `attach` without a new explicit, idempotent, owner-confirmed action. Current block is intentional safety.

---

## 6. Printable / PDF / resource system

**Strong today:** upload PDF, create/update TK printable resource, link by id, preview/download media routes, PDF inspect/merge helpers.

**Weak today:** AI deciding *useful* printable types, generating multi-page PDFs that look like the resource type, correct filenames, and end-to-end verify preview/download as part of a job.

Phase 4 should add:

1. `printable.plan()` → typed printable spec (activityId, type, pages, cut/laminate, fileName)  
2. Page generation (extend VP overlay / new printable renderer — **modular new module**, do not fork resource storage)  
3. `assembleUsLetterPortraitPdf` / existing merge helpers  
4. `tk-printable` create + link by IDs  
5. `printable.verify()` — reload resource, check lessonId, media exists, page count, footer branding  

Footer brand: `littlelearnershubbyleah.com` (align with existing design system where present).

---

## 7. Songs / books system

- Persist on lesson and/or `enrichmentDraft.week`  
- Prefer KEEP when titles/notes are strong  
- Lyrics only when `rightsStatus` / `allowPrintLyrics` permits  
- Favor original simple teacher songs when needed  
- Books: never fabricate real-world titles/authors; leave review recommendation if uncertain  
- Print Center already consumes normalized songs/books — Operator should validate those records, not invent a parallel print path

---

## 8. Draft / version system

**Before large Operator mutations on an existing lesson:**

- Ensure a history snapshot exists (existing draft-save fingerprinting / explicit pre-job snapshot entry)  
- Prefer `saveMode: "enrichment_draft"` so published customer view stays untouched  
- Rollback via `enrichment-rollback` or Draft Review rollback — **do not invent a second version system**

---

## 9. Background-job infrastructure

**Missing.** Recommend store-backed jobs mirroring Draft Review:

```
store.siteContent.curriculumOperatorJobs[]  // or top-level store.curriculumOperatorJobs
```

Why JSON store first (not a new Postgres table):

- Matches Draft Review / Visual Production patterns  
- No migration required for schema of lessons  
- Sufficient for owner-only, low-concurrency batch sizes (e.g. max 10–20 lessons)

Revisit a dedicated Postgres table only if job logs/PDFs blow past `llh_store` size/concurrency limits.

Optional later: in-process async runner with progress polling (same Node process), since there is no separate worker fleet today. Jobs must survive browser refresh via store persistence + client poll.

---

## 10. Missing pieces (orchestration)

1. Natural-language → typed command schema parser (LLM JSON + Zod/manual validators)  
2. Plan preview + confirm UX (required for broad/destructive/expensive scopes)  
3. Durable job + step state machine with resume/retry/idempotency keys  
4. Allowlisted tool executor (server-only) wrapping existing handlers  
5. Lesson selection helpers (`lowest_readiness`, `updated_today`, explicit ids) using quality/completion scores  
6. Safe image attach pipeline (trusted, idempotent)  
7. Printable intelligence planner + PDF generation orchestration  
8. Post-save verifier that **reloads** lesson from store (trust disk, not model claims)  
9. Cost limit counters per job  
10. Owner Admin UI tab  
11. Feature flag e.g. `teachingKitCurriculumOperator` (default false)  
12. Phase 1: **no publish tool** in allowlist  

---

## 11. Proposed AI tool / action allowlist

All tools run server-side under owner-admin session. AI may **request** tools; executor validates args and calls existing code.

### Always allowed (Phase 1+)

| Tool | Maps to |
|---|---|
| `lesson.search` | curriculum list + filters (age, plan, readiness) |
| `lesson.get` | load plan + activities + resources + draft |
| `lesson.audit` | completeness + quality + standards |
| `job.log` | append owner-visible log |
| `teachingKit.score` | `evaluateTeachingKit` |
| `teachingKit.validate` | blockers + readiness |

### Phase 2+

| Tool | Maps to |
|---|---|
| `lesson.updateFields` | patch → `enrichment_draft` save |
| `activity.update` | draft activity patch via same save |
| `lesson.saveDraft` | `saveMode: "enrichment_draft"` |
| `lesson.create` | `createNewLesson` blank/structured (Phase 6 full) |
| `standards.applyGaps` | structured fill of MISSING/IMPROVE only |

### Phase 3+

| Tool | Maps to |
|---|---|
| `image.inspect` | check URLs/media |
| `image.generate` | OpenAI images via server helper |
| `image.upload` | enrichment photo persist |
| `image.attachToActivity` | draft field assign by activity id |
| `image.attachCover` | lesson cover assign |

### Phase 4+

| Tool | Maps to |
|---|---|
| `printable.plan` | typed printable spec |
| `printable.generatePdf` | page render + assemble |
| `printable.upload` | tk-printable create/replace_pdf |
| `printable.attach` | link by resource id + lesson id (+ activity id) |
| `printable.verify` | media + link + page inspect |

### Phase 5+

| Tool | Maps to |
|---|---|
| `song.audit` / `song.upsert` | week/lesson songs |
| `book.audit` / `book.upsert` | week/lesson books (no fake titles) |

### Phase 8 only (explicit)

| Tool | Maps to |
|---|---|
| `lesson.publish` | **disabled in Phase 1–7**; later requires command + second confirm |

### Never allowed

- Arbitrary SQL / shell / filesystem browse  
- Billing, users, subscriptions, auth, env dumps  
- Unscoped store writes  
- Direct mutation of unrelated `siteContent` keys  
- Browser UI click automation as the execution engine  

---

## 12. Proposed typed command schema

```json
{
  "version": 1,
  "rawCommand": "Upgrade the 10 weakest Pro Toddler lessons and leave ready for review.",
  "intent": "upgrade_batch",
  "scope": {
    "selection": "lowest_readiness",
    "count": 10,
    "plan": "pro",
    "ageBand": "toddler",
    "lessonIds": [],
    "updatedSince": null,
    "requireExplicitIdsIfAmbiguous": true
  },
  "actions": {
    "auditOnly": false,
    "upgradeLessonFields": true,
    "upgradeActivities": true,
    "generateMissingImages": true,
    "replaceBadImages": false,
    "auditPrintables": true,
    "generatePrintables": true,
    "touchSongs": true,
    "touchBooks": true,
    "createNewLesson": false
  },
  "completion": {
    "saveAsDraft": true,
    "readyForOwnerReview": true,
    "publish": false
  },
  "limits": {
    "maxLessons": 10,
    "maxImageGenerations": 40,
    "maxPrintableGenerations": 30
  },
  "confirmations": {
    "planAcknowledged": false,
    "publishAcknowledged": false
  }
}
```

**Validation rules before run:**

- `count` ≤ `limits.maxLessons` (hard cap, e.g. 20)  
- Ambiguous “all lessons” without filters → reject; show plan  
- `publish: true` ignored/rejected until Phase 8  
- Named lessons → only those ids  
- “Weakest” → sort by readiness/quality ascending using existing scorers  

---

## 13. Proposed job schema

```json
{
  "id": "opjob_…",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "createdBy": "owner@…",
  "status": "planned|awaiting_confirm|running|paused|completed|failed|cancelled",
  "command": { "...typed command..." },
  "planSummary": {
    "task": "…",
    "lessons": [{ "id": "", "title": "", "readiness": 0, "weakSections": [], "expectedActions": [] }]
  },
  "progress": {
    "lessonIndex": 0,
    "lessonCount": 10,
    "currentLessonId": "",
    "currentAction": "",
    "completed": 0,
    "failed": 0,
    "skipped": 0
  },
  "lessonResults": [
    {
      "lessonId": "",
      "status": "pending|running|success|failed|skipped",
      "preSnapshotHistoryId": "",
      "actions": [
        {
          "id": "act_…",
          "type": "lesson.audit",
          "status": "pending|running|success|failed|skipped|retrying",
          "idempotencyKey": "jobId:lessonId:type:fingerprint",
          "input": {},
          "output": {},
          "error": null,
          "retryable": false
        }
      ],
      "kept": [],
      "updated": [],
      "generated": [],
      "validation": {},
      "readyForReview": false,
      "published": false
    }
  ],
  "costCounters": { "images": 0, "printables": 0, "openaiCalls": 0 },
  "log": [{ "at": "ISO", "level": "info|warn|error", "message": "", "lessonId": null }]
}
```

**Execution states (per action):** `PENDING | RUNNING | SUCCESS | FAILED | SKIPPED | RETRYING`  
**Lesson isolation:** finish validate one lesson before next (default). Batch failure must not wipe other lesson results.

---

## 14. Proposed validation flow

For each lesson unit:

1. Load complete lesson (plan, dailyPlans, activities, resources, draft, scores)  
2. Snapshot / ensure recovery point  
3. Audit → KEEP / IMPROVE / MISSING / WRONG / REMOVE  
4. Apply allowed actions only for non-KEEP items  
5. Save draft  
6. **Re-load from store**  
7. Re-run completeness + quality + asset verification  
8. Mark `readyForReview` only if validation passes  
9. Never mark complete on generate-without-store-success  

Asset success definition: **GENERATED → STORED → RECORD → LINKED → ACCESSIBLE**.

---

## 15. Proposed retry / idempotency design

- Every mutating action has `idempotencyKey = jobId + lessonId + actionType + contentFingerprint`  
- PDF upload: if media asset already exists for key, reuse — do not create duplicates  
- Image attach: write draft fields only after persist success  
- Draft save: use `expectedUpdatedAt` / fingerprint guards already used in enrichment flows  
- Retries allowed only when `retryable: true` (transient OpenAI/network); not for identity conflicts  
- On failure: lesson status `failed`, batch continues  

---

## 16. Proposed Owner Admin UI

**New Content tab:** `curriculum-ai-operator` — label **AI Curriculum Operator**  
Place beside existing:

- Lesson Plans  
- Draft Review Queue  
- Visual Production  
- Library Health  
- **AI Curriculum Director** ← sibling; Operator *executes*, Director *analyzes/reuses*

**UI sections:**

1. Command box (natural language)  
2. Interpreted plan (lessons, actions, publish=no) + **[Run Job]**  
3. Active job progress (lesson N of M, current action)  
4. Job log  
5. Per-lesson result cards with **Open in Enrichment Editor** deep link  
6. Limits / cost counters  
7. History of past jobs  

Do **not** automate clicking Enrichment Editor buttons. UI only creates/confirms/polls jobs.

---

## 17. Proposed database changes

| Change | Required now? |
|---|---|
| New lesson/activity schema fields | **No** — reuse existing enrichment/curriculum fields |
| New Postgres tables | **Not for Phase 1–2** |
| New store collection `curriculumOperatorJobs` | **Yes (logical)** — inside `llh_store` JSON, same pattern as Draft Review |
| Feature flag `teachingKitCurriculumOperator` | **Yes** — default false |
| Media tables | Reuse `llh_media_assets` |

**Migration:** not a SQL migration. Additive store key + flag only. No production data rewrite.

---

## 18. Exact files that would need modification (by phase)

### Phase 1 (audit-only operator + jobs + UI shell)

**Add (new modules — preferred):**

- `scripts/curriculum-operator-command.js` — parse/validate command schema  
- `scripts/curriculum-operator-job.js` — job normalize/state machine  
- `scripts/curriculum-operator-tools.js` — allowlisted read tools (search/get/audit/score)  
- `scripts/curriculum-operator-ui.js` — Owner Admin UI  
- `server/curriculum-operator.js` — API factory (mirrors `visual-production.js` / draft-review)  
- `scripts/test-curriculum-operator-phase1.js`

**Touch lightly:**

- `server/index.js` — route `POST /api/admin/curriculum/operator` + wire factory  
- `scripts/teaching-kit.js` — add flag default false  
- `app.js` — register tab `curriculum-ai-operator`, mount UI  
- `index.html` — script include if required by existing pattern  

### Phase 2

- Extend `curriculum-operator-tools.js` with draft field/activity update tools calling existing save modes  
- Reuse `teaching-kit-enrichment.js`, `curriculum-standards.js`, `teaching-kit-ai-lesson-teacher.js`, `enrichment-ai.js`  
- Optionally HTTP-wrap safe parts of `teaching-kit-curriculum-production.js` (do not duplicate)

### Phase 3–4

- New trusted attach helpers near `enrichment-media.js` / printable modules  
- Possibly extend `visual-production.js` **only** with an explicit owner-confirmed attach action used by operator tools — or bypass VP and write through enrichment media (cleaner)

### Phase 5–8

- Songs/books tools; create-lesson orchestration; publish tool behind double confirm  

**Do not rewrite:** `normalizedCurriculumLessonPlan`, Master Paste matching, quality scorer, media persistence, Draft Review publish semantics — call them.

---

## 19. Security risks

| Risk | Mitigation |
|---|---|
| Unrestricted AI DB writes | Allowlist tools only; no SQL |
| Credential leak to client | All OpenAI/storage server-side; never return keys |
| Non-owner admin access | Same `requireTeachingKitOwnerAdminSession` + owner email |
| Accidental publish | No publish tool until Phase 8; command `publish` forced false |
| Cross-lesson resource attach | Link by IDs; verify `resource.lessonId` after |
| Store wipe / partial siteContent | Never call full site-content replace from operator; use curriculum endpoints |
| Cost runaway | Hard caps per job; plan confirm for expensive scopes |
| History bloat | Snapshot once per lesson per job; reuse fingerprinting |
| Dual publish channel confusion | Draft-only saves in Phases 1–7 |
| Prompt injection via lesson text | Tools ignore “instructions” inside lesson fields; schema-validated args only |

---

## 20. Cost-control strategy

- Defaults: max **10** lessons / job (hard max **20**)  
- Max image gens / printable gens configurable per job with global ceilings  
- KEEP good assets; `replaceBadImages` default **false**  
- Reuse Director masters + Teacher Assistant reusable library before generate  
- Deduplicate OpenAI calls with idempotency keys  
- Plan preview required when estimated gens exceed threshold  
- Fixture/dry-run mode for tests without live image spend  

---

## 21. Smallest safe development sequence

Aligned with your phases; tightened to repo reality:

### Phase 1 — Plan / Audit Operator (ship first)
- Flag + owner route + job store  
- NL → typed command (conservative parser)  
- Lesson selection using existing readiness scores  
- `lesson.get` + `lesson.audit` only (no mutations)  
- Plan preview UI + job progress/logs  
- Tests with local-json store  

### Phase 2 — Draft field upgrades
- Gap-fill via enrichment AI + Lesson Teacher apply  
- `enrichment_draft` save only  
- Re-validate after reload  
- Deep link to Enrichment Editor  

### Phase 3 — Images
- Generate + enrichment upload + attach by activity id  
- Verify media  
- KEEP good images  

### Phase 4 — Printables
- Spec → PDF → tk-printable → link → verify preview/download  

### Phase 5 — Songs / books completeness

### Phase 6 — New lesson creation from theme (draft)

### Phase 7 — Batch resume/retry polish + rollback UX

### Phase 8 — Optional explicit publish (double confirm) — **last**

---

## Architecture strength verdict

**Yes — strong enough without a major rewrite.**

You already have:

- A real curriculum schema and normalizers  
- Master Paste with identity/activity preservation and rollback snapshots  
- Teaching Kit completeness + quality scoring  
- Draft-only enrichment channel  
- Owner-admin gates and feature flags  
- Media upload pipelines for photos and printables  
- Library intelligence (Director) and a production composer script  

What you are missing is the **controlled orchestrator**: typed commands, durable jobs, allowlisted tools, verification loop, and an Owner UI that issues jobs instead of simulating clicks.

Build that as a thin new vertical (`curriculum-operator*`) that **calls** existing systems. Do not rebuild lesson save, scoring, Master Paste, or media storage.

---

## Out of scope for this deliverable

- No implementation code beyond this plan document  
- No production env writes  
- No auto-publish  
- No unrestricted agent browsing Owner Admin UI  

# Lesson Plan System Audit & Schema Discovery

**Date:** 2026-07-15  
**Branch / context:** Discovery before rebuilding the lesson plan importer  
**Canonical schema source:** `server/index.js` → `normalizedCurriculumLessonPlan`, `normalizedCurriculumDailyPlanDay`, `normalizedCurriculumDailyPlanItem`, `normalizedCurriculumActivity`  
**Client mirrors:** `app.js`, `scripts/curriculum-safe-values.js`, `scripts/curriculum-lesson-import-parser.js`, `scripts/curriculum-lesson-viewer-render.js`

---

## Executive summary

Little Learner Hub’s curriculum model is a **Monday–Friday weekly lesson plan** with:

- Top-level lesson metadata + weekly narrative sections  
- Per-day structure (theme, materials, circle time, etc.) + **activity items**  
- Activities that are **owned by the lesson plan** and **synced into Activity Center** on save  
- Library presentation fields (description, tags, cover tones) that are **derived**, not stored on the curriculum plan  

**Important gaps for importer design:**

| Concept | In product schema? | Populated by V3 importer today? |
|---------|--------------------|----------------------------------|
| Cover image / visual theme | No (library CSS tones / optional resource `previewData`) | No |
| Tags / multi-category on lesson | Derived only | No |
| Saturday / Sunday | No | No |
| Day-level fields (theme, circleTime, …) | Yes | **No** (admin/user editors only) |
| Activity duration / cleanup / image / video | No | No |
| Multi-age membership | No (single `age` string) | No |
| Flexible / free-form section names | No | Rigid `LABEL:` format only |

---

## 1. Lesson Plan Fields

### 1.1 Persisted curriculum lesson plan fields

From `normalizedCurriculumLessonPlan` (`server/index.js`):

| Field | Type | Limits / rules | Required? |
|-------|------|----------------|-----------|
| `id` | string | ≤160; plan dropped if missing | **Yes** (system) |
| `title` | string | ≤180; default `"Untitled Lesson Plan"` | Soft-required (V3 import **required**) |
| `age` | string | ≤40; default `"Preschool"` | Soft-required (V3 **required**; Infant/Toddler/Preschool family) |
| `theme` | string | ≤120 | Optional in store; V3 **required** |
| `plan` | `"Free"` \| `"Pro"` | Non-Pro → `"Free"` | Soft-required; V3 **required** |
| `status` | enum | `draft` \| `published` \| `featured` \| `archived` | Soft-required; invalid → `draft`; V3 **required** |
| `learningDomains` | `string[]` | Max 6; whitelist only | Optional |
| `weeklyOverview` | multiline | ≤4000 | Optional in store; V3 **required** |
| `objectives` | multiline | ≤4000 | Optional |
| `weeklyMaterials` | multiline | ≤4000 | Optional |
| `vocabularyWords` | multiline | ≤2000 | Optional |
| `books` | `{title, author, notes}[]` | Max 20; needs `title` | Optional |
| `songs` | `{title, notes}[]` | Max 20; needs `title` | Optional |
| `familyConnection` | multiline | ≤4000 | Optional |
| `observationOpportunities` | multiline | ≤4000 | Optional |
| `adaptations` | multiline | ≤4000 | Optional |
| `dailyPlans` | object | Keys `monday`…`friday` | Always present after normalize |
| `activityIds` | `string[]` | Max 200; maintained by sync | System |
| `resourceIds` | `string[]` | Max 200 | Optional |
| `createdAt` | string | ISO-ish | System |
| `updatedAt` | string | ISO-ish | System |

### 1.2 Learning domain whitelist

```
Social Emotional
Language & Literacy
Math
Science
Physical Development
Creative Arts
```

Aliases exist in the importer (e.g. `literacy` → `Language & Literacy`, `sel` → `Social Emotional`).

### 1.3 Status enum

```
draft | published | featured | archived
```

- `published` / `featured` → public library visibility  
- `featured` → also powers the “Featured” browse row  

### 1.4 Library / presentation fields (NOT on curriculum store)

| Concept | How it works today |
|---------|-------------------|
| **Description** | Card `description` = `weeklyOverview \|\| theme` |
| **Tags** | Derived: `[...learningDomains, theme]` |
| **Category** | Always `"Lesson Plans"` on library cards |
| **Cover image** | Optional resource `previewData` / `thumbnailUrl`; otherwise CSS `cover-tone-0..7` hash |
| **Visual theme** | Not a data field |
| **Published** | Via `status` |
| **Format label** | Hardcoded `"Play-Based Lesson"` on cards |
| **Locked / Pro teaser** | DTO-only for guests / Free users |

### 1.5 Sample lesson plan shape

```javascript
{
  id: "cur-lp-…",
  title: "Ocean Explorers",
  age: "Preschool 3–4 Years",   // display string; bucketed for filters
  theme: "Ocean Life",
  plan: "Pro",                  // Free | Pro
  status: "published",
  learningDomains: ["Science", "Language & Literacy"],
  weeklyOverview: "…",
  objectives: "…",
  weeklyMaterials: "…",
  vocabularyWords: "…",
  books: [{ title, author, notes }],
  songs: [{ title, notes }],
  familyConnection: "…",
  observationOpportunities: "…",
  adaptations: "…",
  dailyPlans: { monday: {/*…*/}, /* … friday */ },
  activityIds: ["cur-act-…"],
  resourceIds: [],
  createdAt: "ISO",
  updatedAt: "ISO"
}
```

---

## 2. Weekly Information Fields

Weekly content lives on the **plan root** (not nested under a `weekly` object):

| UI / product label | Stored field | V3 import label |
|--------------------|--------------|-----------------|
| Weekly Overview | `weeklyOverview` | `WEEKLY_OVERVIEW` (**required**) |
| Learning Objectives | `objectives` | `LEARNING_OBJECTIVES` |
| Learning Domains | `learningDomains` | `LEARNING_DOMAINS` |
| Weekly Materials | `weeklyMaterials` | `WEEKLY_MATERIALS` |
| Vocabulary | `vocabularyWords` | `VOCABULARY` |
| Books | `books[]` | `BOOKS` (`Title \| Author \| Notes` lines) |
| Songs | `songs[]` | `SONGS` (`Title \| Notes` lines) |
| Family Connection | `familyConnection` | `FAMILY_CONNECTION` |
| Observation Opportunities | `observationOpportunities` | `OBSERVATION_OPPORTUNITIES` |
| Adaptations | `adaptations` | `ADAPTATIONS` |

Rendered in `curriculumLessonWeeklySectionsHtml` (`scripts/curriculum-lesson-viewer-render.js`).  
Edited in admin + user lesson plan forms (`app.js`).

---

## 3. Daily Planning Fields

### 3.1 Supported days

**Monday–Friday only.**  
Constants: `CURRICULUM_WEEKDAYS = ["monday","tuesday","wednesday","thursday","friday"]`.

There is **no Saturday / Sunday** in the curriculum schema.

### 3.2 Per-day fields (`dailyPlans[day]`)

From `normalizedCurriculumDailyPlanDay`:

| Field | Type | Notes |
|-------|------|-------|
| `theme` | string | Daily theme / focus |
| `objectives` | string | Daily objectives |
| `learningDomains` | `string[]` | Whitelist |
| `materials` | string | Daily materials |
| `vocabulary` | string | Daily vocabulary |
| `books` | `{title,author,notes}[]` | |
| `songs` | `{title,notes}[]` | |
| `circleTime` | `string[]` | Used heavily by weekly planner summary |
| `transitions` | `string[]` | |
| `outdoorPlay` | string | |
| `familyConnection` | string | |
| `observations` | `string[]` | |
| `adaptations` | string | |
| `safetyNotes` | string | |
| `items` | activity item[] | Max **30** per day |

### 3.3 Notes / objectives / materials at day level

| Question | Answer |
|----------|--------|
| Notes fields? | No dedicated `notes` field. Closest: `observations[]`, `adaptations`, `safetyNotes`, `familyConnection`, `outdoorPlay`. Print “notes” often synthesize from those. |
| Daily objectives? | **Yes** — `objectives` |
| Daily materials? | **Yes** — `materials` |

### 3.4 V3 importer vs day fields

**V3 import only fills weekday activity blocks (`items[]`).**  
Day-level theme/materials/circleTime/etc. remain empty unless filled in the admin/user editor.  
(Legacy V2 had day markers; public importer **rejects V2**.)

### 3.5 Not present

- Timed schedule slots  
- Separate “day notes” calendar concept on the curriculum plan  
- Weekend days  

---

## 4. Activity Fields

Activities exist in two linked shapes:

1. **Daily plan item** — `dailyPlans[day].items[]`  
2. **Synced Activity Center record** — `curriculum.activities[]` (copy + linkage fields)

### 4.1 Daily plan item fields

From `normalizedCurriculumDailyPlanItem`:

| Field | Type | Notes |
|-------|------|-------|
| `itemId` | string | Auto `item-<hex>` if missing |
| `importKey` | string | Legacy V2; optional |
| `sourceKey` | string | `${lessonPlanId}:${itemId}` (set on normalize) |
| `activityCategory` | enum | Whitelist; invalid → `"Open-Ended Exploration"` |
| `title` | string | **Required** (item dropped if empty) |
| `objective` | multiline | |
| `description` | multiline | |
| `learningDomains` | `string[]` | Whitelist |
| `materials` | multiline | |
| `setup` | multiline | ≤12000 |
| `steps` | multiline | ≤12000; alias `directions` accepted |
| `teacherRole` | multiline | |
| `teacherLanguage` | multiline | ≤12000 |
| `learningGoals` | `string[]` | Max 20 |
| `observationOpportunities` | multiline | |
| `vocabulary` | multiline | |
| `extensions` | multiline | |
| `adaptations` | multiline | |
| `safetyNotes` | multiline | |
| `ageModifications` | multiline | |

### 4.2 Extra fields on synced Activity Center records

| Field | Notes |
|-------|-------|
| `id` | e.g. `cur-act-…` |
| `lessonPlanId` | **Required** with `id` |
| `itemId`, `sourceKey` | Link back to daily item |
| `dayOfWeek` | `monday`…`friday` |
| `status` | `draft` \| `published` \| `archived` (inherited from lesson) |
| `createdAt`, `updatedAt` | |

### 4.3 Fields that do **not** exist on activities

| Requested example | Status |
|-------------------|--------|
| Duration | **Not in schema** |
| Cleanup instructions | **Not in schema** |
| Activity image | **Not in schema** |
| Video link | **Not in schema** |
| Age range (on activity) | Comes from **parent lesson** as `parentAge` / card `age` |
| Standalone activity CRUD | Admin activity browser is **read-only**; edit parent lesson |

### 4.4 Public / library enrichment (DTO)

`parentTitle`, `parentAge`, `parentTheme`, `parentPlan`, `parentStatus`, `locked`, `plan`.

---

## 5. Activity Categories

### 5.1 Canonical stored categories (11) — used by system

```
Circle Time
Literacy
Sensory Play
Fine Motor
Gross Motor
Music & Movement
Art
STEM/Discovery
Dramatic Play
Outdoor Play
Open-Ended Exploration
```

Defined in: `PLAY_ACTIVITY_CATEGORIES` / `PLAY_ACTIVITY_CATEGORIES_V1` (`app.js`, `server/index.js`, import parser).  
Invalid categories coerce to **`Open-Ended Exploration`**.

### 5.2 Activity Center browse filter labels (6) — with aliases

| Filter UI label | Matches stored categories |
|-----------------|---------------------------|
| Sensory Play | Sensory Play, Sensory |
| Fine Motor | Fine Motor |
| Gross Motor & Movement | Gross Motor & Movement, Gross Motor, **Outdoor Play** |
| Music & Movement | Music & Movement, **Circle Time** |
| Dramatic Play | Dramatic Play |
| Open-Ended Exploration | Open-Ended Exploration, **Art**, **Literacy**, **STEM/Discovery** |

So five first-class categories (**Circle Time, Art, Literacy, STEM/Discovery, Outdoor Play**) are stored distinctly but **folded into coarser browse filters**.

### 5.3 Homepage preview category order (6)

```
Sensory Play, Gross Motor, Fine Motor, Music & Movement, Dramatic Play, Open-Ended Exploration
```

### 5.4 Import aliases (examples)

`sensory` → Sensory Play · `stem` / `science` → STEM/Discovery · `circle` → Circle Time · `movement` → Gross Motor · `pretend play` → Dramatic Play · etc. (`ACTIVITY_CATEGORY_ALIASES` in import parser).

### 5.5 Separate resource categories (not play activities)

```
Classroom Resources | Behavior & Social Emotional | Printables
```

Attached curriculum resources / uploads — not Activity Center play categories.

---

## 6. Library Organization

### 6.1 Age groups

| Layer | Values | Configurable? |
|-------|--------|---------------|
| Browse tabs | `All`, `Infant`, `Toddler`, `Preschool` | **Hardcoded** in client |
| Core ages constant | Infant, Toddler, Preschool | Hardcoded |
| Planner assign options | + `Mixed Ages` | Hardcoded |
| Stored `age` | Free-text display (e.g. `"Toddler 12–24 Months"`) | String; bucketed by `normalizeAgeGroup()` |
| Infant sub-rows | Regex on age string (`0–6`, `6–12`, `0–12`) | Hardcoded heuristics |

**Can a lesson belong to multiple age groups?**  
**No.** One `age` string → one primary bucket for filtering.

### 6.2 Free / Pro

- Field: `plan` (`Free` | `Pro`)  
- Access: `canAccess()` locks Pro content for Free guests/users  
- Library filter: All / Free / Pro  
- Browse row: “Free Lesson Plans”

### 6.3 Browse organization (Lesson Plan Library)

Rows include: Featured · Continue planning · Infant sub-rows · Toddler · Preschool · Free · Seasonal (heuristic on theme/title/holiday) · Recent · Popular.

### 6.4 Theme filtering

**No dedicated theme filter chip.** Theme is searchable/tag-derived and used in seasonal heuristics.

---

## 7. Activity Center Integration

### 7.1 How sync works

**Trigger:** saving a lesson plan via `POST /api/admin/curriculum/lesson-plans`  
**Function:** `syncCurriculumActivitiesForLessonPlan` (`server/index.js`)

1. Flatten all `dailyPlans[day].items`  
2. Upsert activities by `sourceKey = lessonPlanId:itemId`  
3. Archive activities for that plan whose `sourceKey` is gone  
4. Write `lessonPlan.activityIds` for non-archived activities  
5. Inherit activity `status` from lesson (`published`/`featured` → published; `draft` → draft; `archived` → archived)

### 7.2 Fields that transfer (item → activity)

```
itemId, sourceKey, dayOfWeek,
activityCategory, title, objective, description, learningDomains,
materials, setup, steps, teacherRole, teacherLanguage, learningGoals,
observationOpportunities, vocabulary, extensions, adaptations,
safetyNotes, ageModifications,
status, createdAt, updatedAt
```

### 7.3 Fields that do **not** transfer onto the activity record

| Source | Not copied onto activity |
|--------|---------------------------|
| Lesson | `title`, `theme`, `age`, `plan`, weekly narrative fields, `books`, `songs`, … |
| Day | `theme`, `circleTime`, `transitions`, `outdoorPlay`, day materials, … |
| Item | `importKey` (stays on item only) |

Parent lesson metadata is injected later as **DTO** fields (`parentAge`, `parentTheme`, `parentPlan`, …) when building library cards.

### 7.4 Duplicate prevention

| Mechanism | Detail |
|-----------|--------|
| Stable `itemId` | Preserved across saves |
| `sourceKey` | `${lessonPlanId}:${itemId}` unique per item |
| Activity `id` reuse | Existing activity found by `sourceKey` is updated, not duplicated |
| Orphan archive | Removed items → activity `status: "archived"` (not hard-deleted in sync path) |

There is **no independent activity create form** in admin — Activity Center entries for curriculum are lesson-owned mirrors.

---

## 8. Calendar Integration

### 8.1 Assign path

`Use This Plan` → `addCurriculumLessonPlanToMainCalendar` / `assignScheduleLessonPlan` → `buildCurriculumLessonPlanSnapshot`.

Schedule item stores: `lessonPlanId`, `lessonPlanTitle`, `lessonPlanPlan`, `lessonPlanUpdatedAt`, `ageGroup`, `weekStartDate`, plus a full **`snapshot`**.

### 8.2 Lesson fields used by calendar / weekly plan

Snapshot includes essentially the full lesson + dailyPlans (weekly narrative + day structure + activities).

**Legacy weekly planner summarization** (`applyCurriculumLessonToWeeklyPlanner`) uses a thinner subset:

| Uses | Largely ignores for simple slots |
|------|----------------------------------|
| Day `circleTime` → circle slot | Day materials, books, songs, objectives, outdoorPlay |
| Activity **titles** → activity slot | Steps, materials, teacherRole, learningGoals, … |
| Lesson/theme → theme/focus | Weekly overview, vocabulary, family connection |
| Assign `ageGroup` | Free/Pro not written into simple planner slots |

Classroom edits after assign patch the **snapshot only**, not the library curriculum.

### 8.3 Activity fields used by calendar

Primarily: `title`, and (in rich weekly plan views) category/description/materials and fuller item bodies from the snapshot.  
Many premium narrative fields are available in snapshot but not always surfaced in compact planner cells.

---

## 9. Download & Print Integration

Variants via `downloadLessonPlanVariant`: `week`, `week-detail`, `planning`, `materials`, `full` (DOCX for `full`).

| Variant | Includes (high level) | Notably truncated / ignored |
|---------|----------------------|-----------------------------|
| **week** (PDF board) | Title, theme, age, objectives (capped), books/songs (capped), vocab, daily theme, activity title + short description, day materials | Full steps, setup, teacherLanguage, learningGoals, family/adaptations/observations as full sections |
| **week-detail** (PDF) | Domains, objectives, vocab, books, songs, setup-as-prep, weekly materials, per-day activity title/category/description/materials, family, observations | Activity steps, learningGoals, teacherLanguage, extensions, safetyNotes as first-class blocks |
| **planning** (PDF) | Title/theme/age, day focus, activity title checkboxes, day materials/notes, weekly materials checklist | Most narrative depth |
| **materials** | Weekly materials, vocab, books, songs, day materials | Activity how-tos |
| **full** DOCX | Title/theme/age/domains/objectives/materials + Mon–Fri activity title/category/description/materials + vocab/books/songs | familyConnection, adaptations, observationOpportunities; activity steps/setup/teacherRole/learningGoals (description capped) |

**Shared day projection** (`lessonPlanWeeklyScheduleDays`) typically pulls: activity title, category, short description/objective, materials; day materials; notes synthesized from observations/adaptations/family/outdoorPlay or teacherRole.

---

## 10. Search & Filtering

### 10.1 Search haystack fields (`resourceSearchHaystack`)

**Common:** title, category, age, plan, description, theme, weeklyOverview, keywords, month, holiday, activityFocus, tags  

**Lesson plans (+ curriculum):** theme, weeklyOverview, objectives, weeklyMaterials, vocabularyWords, familyConnection, adaptations, observationOpportunities, learningDomains, book/song fields, per-activity title / activityCategory / materials / setup / steps / learningGoals  

**Activities (+ curriculum):** materials, setup, steps, parent title, lessonPlanId, dayOfWeek, description, learningGoals  

### 10.2 Lesson Plan Library filters

| Control | Field / logic |
|---------|---------------|
| Age tabs | `normalizeAgeGroup(resource.age)` |
| Free / Pro | `resource.plan` |
| Saved | favorites (Pro) |
| Assigned | `lessonPlanIsAssigned(id)` |
| Sort | recommended / newest / A–Z / recent |
| Search | haystack substring |
| Theme | **search only** (no chip) |

### 10.3 Activity Center filters

| Control | Field |
|---------|-------|
| Age | `resource.age` / normalizeAgeGroup |
| Activity type | `activityCategory` + filter aliases |
| Free / Pro | `resource.plan` |
| Saved / recent | favorites / recently viewed |
| Parent lesson drill-in | `lessonPlanId` vs `activeActivityLessonPlanId` |

---

## 11. Admin Importer Audit

### 11.1 Where it lives

| Piece | Location |
|-------|----------|
| Parser | `scripts/curriculum-lesson-import-parser.js` |
| Preview | `scripts/curriculum-import-preview.js` |
| Admin UI | Play-Based Lessons → Complete Lesson Plan Importer (`renderCurriculumLessonImportPanel`) |
| Save | Client → `POST /api/admin/curriculum/lesson-plans` (syncs activities) |
| Samples | `scripts/curriculum-import-samples/label-only-*.txt` |

**Policy today:** paste exact `LABEL:` text; preserve wording; report unmapped lines; **do not silently drop**.  
**Public entry accepts V3 only.** V1/V2 marker formats are rejected.

### 11.2 Accepted format

Label-only V3, e.g.:

```
TITLE:
…
AGE_GROUP:
…
THEME:
…
PLAN:
Free|Pro
STATUS:
published
WEEKLY_OVERVIEW:
…
MONDAY:
ACTIVITY_NAME:
…
CATEGORY:
Sensory Play
…
```

Bulk: multiple plans split on subsequent `TITLE:` blocks.

### 11.3 Required lesson fields (V3)

| Label | Stored field |
|-------|--------------|
| `TITLE` | `title` |
| `AGE_GROUP` | `age` (+ internal bucket, then dropped before save) |
| `THEME` | `theme` |
| `PLAN` | `plan` (`Free`\|`Pro`) |
| `STATUS` | `status` |
| `WEEKLY_OVERVIEW` | `weeklyOverview` |
| ≥1 `ACTIVITY_NAME` under Mon–Fri | `dailyPlans[day].items[]` |

### 11.4 Optional lesson fields (V3)

`LEARNING_DOMAINS`, `LEARNING_OBJECTIVES`, `WEEKLY_MATERIALS`, `VOCABULARY`, `BOOKS`, `SONGS`, `FAMILY_CONNECTION`, `OBSERVATION_OPPORTUNITIES`, `ADAPTATIONS`.

### 11.5 Required activity fields (V3)

| Label | Stored field |
|-------|--------------|
| `ACTIVITY_NAME` | `title` |
| `CATEGORY` | `activityCategory` (must resolve to the 11) |
| `DESCRIPTION` | `description` |
| `MATERIALS` | `materials` |
| `DIRECTIONS` | `steps` |
| `TEACHER_ROLE` | `teacherRole` |
| `LEARNING_GOALS` | `learningGoals[]` (≥1) |

### 11.6 Optional activity fields (V3)

`OBJECTIVE`, `SETUP`, `OBSERVATION_OPPORTUNITIES`.

### 11.7 Schema-supported but **not mapped** by V3 importer

**Activity:** `teacherLanguage`, `vocabulary`, `extensions`, `adaptations`, `safetyNotes`, `ageModifications`, activity `learningDomains`  

**Day-level:** `theme`, `objectives`, `materials`, `vocabulary`, `books`, `songs`, `circleTime`, `transitions`, `outdoorPlay`, `familyConnection`, `observations`, `adaptations`, `safetyNotes`

### 11.8 Validation rules (high level)

- Age must resolve to Infant / Toddler / Preschool family  
- Plan must be Free or Pro  
- Status must be valid enum  
- Category must be in approved list (aliases applied)  
- Unmapped lines reported (`unmapped` / blocking unmapped in preview)  
- Duplicate titles: warning + preview actions (`open-existing` / `new-copy`)  
- Weekday content without `ACTIVITY_NAME` → warning + unmapped  
- `itemId` reuse: `${dayKey}:${title.toLowerCase()}` lookup against existing IDs when re-importing  

### 11.9 Current limitations

1. Rigid label vocabulary — flexible section titles are not auto-mapped  
2. Day structure beyond activity blocks is ignored by V3  
3. No multi-age membership  
4. No cover/image/video/duration fields to import  
5. Categories limited to the 11-play list  
6. V2 richer day markers retired from public path  
7. No dedicated server “import” endpoint — parse is client-side  
8. Free/Pro and status are **manual labels**, not inferred  

---

## 12. Field coverage matrix (quick reference)

| Field / section | Schema | Admin editor | V3 importer | Activity sync | Calendar snapshot | Print/DOCX (typical) | Search |
|-----------------|--------|--------------|-------------|---------------|-------------------|----------------------|--------|
| title | ✓ | ✓ | ✓ req | parent DTO | ✓ | ✓ | ✓ |
| age | ✓ | ✓ | ✓ req | parent DTO | ✓ | ✓ | ✓ / filter |
| theme | ✓ | ✓ | ✓ req | parent DTO | ✓ | ✓ | ✓ |
| plan Free/Pro | ✓ | ✓ | ✓ req | parent DTO | ✓ | limited | ✓ / filter |
| status | ✓ | ✓ | ✓ req | → activity status | — | — | featured row |
| weeklyOverview | ✓ | ✓ | ✓ req | ✗ | ✓ | partial | ✓ |
| objectives | ✓ | ✓ | opt | ✗ | ✓ | ✓ capped | ✓ |
| learningDomains | ✓ | ✓ | opt | ✗ (item can have own) | ✓ | ✓ | ✓ |
| weeklyMaterials | ✓ | ✓ | opt | ✗ | ✓ | ✓ | ✓ |
| vocabularyWords | ✓ | ✓ | opt | ✗ | ✓ | ✓ | ✓ |
| books / songs | ✓ | ✓ | opt | ✗ | ✓ | ✓ capped | ✓ |
| family / observations / adaptations | ✓ | ✓ | opt | ✗ | ✓ | partial | ✓ |
| day-level fields | ✓ | ✓ | ✗ | ✗ | ✓ | partial | limited |
| activity core (name/cat/desc/materials/steps/role/goals) | ✓ | ✓ | ✓ req | ✓ | ✓ | partial | ✓ |
| activity premium (setup/language/extensions/…) | ✓ | ✓ | mostly ✗ | ✓ | ✓ | often ✗ | some |
| cover / duration / video | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## 13. Future-Proof Importer Design Recommendations

Goal: accept flexible lesson formats, map intelligently into the **existing** schema, and extend schema only when product needs demand it.

### 13.1 Design principles

1. **Schema is the contract** — importer maps *into* `normalizedCurriculumLessonPlan` / daily day / daily item; never invent silent parallel shapes.  
2. **Graceful missing sections** — required product fields get smart defaults or soft-warnings; do not hard-fail the whole paste for optional narrative gaps.  
3. **Preserve author wording** — map and place; do not regenerate curriculum content.  
4. **Always report mapping** — every recognized section, every unmapped block, every inference (age/category/plan).  
5. **Idempotent sync** — keep `itemId` / `sourceKey` stability so Activity Center does not duplicate.  
6. **Versioned profiles** — `importProfile: "v3-label" | "flexible-v1" | "docx-v1"` so rigid V3 remains available.

### 13.2 Recognition layer (flexible input)

Build a **section detector** before field assignment:

| Detector | Inputs | Outputs |
|----------|--------|---------|
| Age | Age headers, “Infant/Toddler/Preschool”, month ranges, title cues | `age` display + bucket |
| Theme | Theme / unit / focus headings | `theme` |
| Free/Pro | Explicit labels; optional policy rules (e.g. default Pro for “premium pack”) | `plan` + confidence |
| Status | Explicit; default `draft` for uncertain imports | `status` |
| Weekly sections | Synonyms: “Weekly Overview” / “About this week” / “Big idea” → `weeklyOverview`; “Objectives” / “Goals for the week” → `objectives`; etc. | weekly fields |
| Day headers | Monday–Friday synonyms / Mon–Fri / Day 1–5 | `dailyPlans` keys |
| Activity blocks | “Activity”, “Center”, “Station”, numbered lists under a day | items[] |
| Category | Keyword / synonym map into the 11 categories; fallback Open-Ended Exploration + warning | `activityCategory` |
| Activity fields | Synonyms for Directions→`steps`, Teacher tips→`teacherRole`, Goals→`learningGoals`, etc. | item fields |

Maintain a **synonym dictionary** (config JSON) so new aliases do not require code rewrites.

### 13.3 Suggested required vs soft-required for flexible mode

| Soft-required (warn + default) | Hard-required (block save) |
|-------------------------------|----------------------------|
| `theme` → derive from title | `title` |
| `weeklyOverview` → empty OK with warn | ≥1 activity with `title` |
| `plan` → default Free or admin choice | Valid age bucket |
| `status` → default `draft` | — |
| Activity CATEGORY → Open-Ended Exploration | Activity `title` |

Flexible mode should **not** force every V3 activity field (DESCRIPTION/MATERIALS/DIRECTIONS/TEACHER_ROLE/LEARNING_GOALS) if the source is incomplete — store empties and flag quality score instead.

### 13.4 Day-level mapping (unlock existing schema)

Flexible importer should populate day fields when present:

`theme`, `objectives`, `materials`, `vocabulary`, `circleTime`, `transitions`, `outdoorPlay`, `familyConnection`, `observations`, `adaptations`, `safetyNotes`, books/songs  

This closes the largest gap between schema capability and V3 import.

### 13.5 Activity Center + Free/Pro automation

- Continue using existing sync — no parallel activity writer.  
- Infer Free/Pro via explicit rules table (keyword packs, folder names, admin preset) with mandatory confirmation in preview.  
- Never auto-publish: default `draft` unless STATUS explicit.

### 13.6 Extensibility without rewrites

1. **Import mapping config** (JSON): label synonyms → field paths.  
2. **Unknown sections** → `importExtras` (optional future store) *or* append to closest narrative field with a visible “Unmapped appendix” in preview — decide product-wise before adding DB fields.  
3. **Feature flags** for new target fields (cover image, duration) only after schema + print/calendar decide they matter.  
4. **Quality report** in preview: coverage %, missing recommended fields, category confidence, age confidence.

### 13.7 Recommended build sequence

1. **Documented synonym map** for weekly + activity + day fields (this audit is the target list).  
2. **Flexible parser v1** that still emits the same normalized plan object.  
3. **Populate day-level fields** from flexible sources.  
4. **Soft validation + quality score** in import preview.  
5. **Optional inference** for age/category/plan with human confirm.  
6. Only then: schema additions (cover, duration, video) if product requires them.

### 13.8 What not to do yet

- Do not invent Saturday/Sunday until calendar + print + UI support them.  
- Do not make Activity Center independently editable while sync owns identity.  
- Do not silently rewrite author content to “fill” missing sections.  
- Do not remove V3 label format — keep it as the high-confidence path.

---

## 14. Key file index

| Concern | Path |
|---------|------|
| Server schema + activity sync | `server/index.js` (`normalizedCurriculum*`, `syncCurriculumActivitiesForLessonPlan`) |
| Client constants / editors / library | `app.js` |
| Safe coercions | `scripts/curriculum-safe-values.js` |
| Viewer HTML | `scripts/curriculum-lesson-viewer-render.js` |
| Importer (V3) | `scripts/curriculum-lesson-import-parser.js` |
| Import preview | `scripts/curriculum-import-preview.js` |
| DOCX export | `scripts/llh-lesson-docx.js` |
| V3 sample | `scripts/curriculum-import-samples/label-only-full-workflow-v3.txt` |

---

## 15. Bottom line

**Today’s system already supports a rich Mon–Fri lesson model** (weekly narrative + deep day structure + rich activity items + automatic Activity Center sync).  

**The current importer is narrower than the schema:** it requires a rigid V3 label format, requires many activity fields, and **does not fill day-level sections**. Library concepts like cover images, multi-age membership, duration, and video are not first-class curriculum fields.

A next-generation importer should **target the full schema above**, use synonym-based recognition, fill day-level fields, soften non-critical requirements, keep V3 as a strict profile, and treat Activity Center sync / Free–Pro / status as explicit, reviewable steps — not silent magic.

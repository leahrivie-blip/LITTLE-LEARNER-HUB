# Teaching Kit Enrichment Editor — Final UI Specification

**Status:** Owner-approved for implementation (refinements locked)  
**Scope:** Admin-only · one lesson at a time · real curriculum store (`siteContent.curriculum`)  
**Non-goals:** Bulk rewrite, auto-publish, replacing existing Basics / Week story / Daily tabs, special admin-only preview chrome  

---

## 1. Product promise

Upgrading a lesson should feel like **finishing a classroom kit**, not filling a CMS.

An admin should be able to:

1. Open one existing lesson  
2. Land on the **first incomplete activity** every time they return  
3. Enrich **one activity at a time** with photos, chips, and short cards  
4. See the **exact provider Teaching Kit** update live  
5. Save drafts freely; publish only with an explicit confirmation summary  
6. Track **overall completion %** (0–100) plus Legacy → Enriched → Complete  

Existing member-facing lessons keep working the entire time.

**Speed priority:** 100+ lessons to upgrade — every control must earn its place.

---

## 2. Entry points & library filters

From Admin → Content → Curriculum lesson list:

| Control | Behavior |
| --- | --- |
| **Enrich Teaching Kit** (primary on card) | Opens Enrichment Editor focused mode |
| **Edit lesson** (secondary) | Existing full editor (Basics / Week / Daily) |
| Badge | `Legacy` / `Enriched` / `Complete` **plus** completion **%** (e.g. `45%`) |
| Sort | By completion % (lowest first / highest first), updated date, title |
| Filter | Completion band: `0–24%` · `25–49%` · `50–79%` · `80–99%` · `100%` · label (`Legacy` / `Enriched` / `Complete`) |

Enrichment Editor is a **focused workspace** on the same lesson ID — not a second curriculum.

---

## 3. Global chrome (always visible)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ← Farm Animals · Preschool                                                 │
│ Legacy ○──●──○ Complete     Overall 45% ████████░░░░  Draft autosaved 2m │
│ Activity 3 of 15   [← Previous]  [Next →]     [🔍 Jump to…]               │
│ Published lesson: changes stay in draft until you Publish                  │
│                         [Exit]     [Save draft]     [Publish…]             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Rules

- **Dual progress:**  
  - Label stepper: Legacy → Enriched → Complete (derived from % thresholds)  
  - **Overall completion % + progress bar** from the quality checklist (0%, 45%, 80%, 100%, etc.)  
- **Activity counter:** `Activity N of M` with **Previous** / **Next** (whole-lesson activity order, Mon→Fri).  
- **Jump search (🔍):** global search within the **current lesson only** — activities, books, songs, printables, vocabulary, week sections. Selecting a hit jumps to that item/mode.  
- **Draft autosave** silent + recoverable. Checklist **never blocks** draft save.  
- **Never auto-publish.**  
- **Exit** always safe.

### Published-lesson banner (when status is published/featured)

Always show clearly near Save:

> **Your changes are being saved as a draft. The published lesson will remain unchanged until you choose Publish.**

---

## 4. Information architecture (three modes)

| Mode | Purpose | Feeling |
| --- | --- | --- |
| **Activities** (default) | One-activity studio | Fast, photo-first |
| **Week** | Family, printables, vocabulary, milestones | Card pickers |
| **Preview** | **Identical** provider Teaching Kit | Confidence check |

No long single-page form.

---

## 5. Mode A — Activities (core upgrade loop)

### Layout

<img alt="Activity Focus mode" src="/opt/cursor/artifacts/assets/tk-enrich-spec-activity-focus.png" />

| Zone | Contents |
| --- | --- |
| **Left rail** | Day chips (Mon–Fri) → activity queue for that day. Each row shows status: **Not Started** / **In Progress** / **Complete** (icon + color). |
| **Center stage** | **Only the active activity** |
| **Right rail** | Live provider Teaching Kit (same renderer as members) |

### Resume rule (required)

**Every time** the Enrichment Editor opens (or returns from Exit):

1. Load draft if present  
2. Focus **Activities** mode  
3. Select the **first incomplete activity** in Mon→Fri order  
   - Incomplete = status is Not Started or In Progress  
4. If all activities Complete, land on first activity and suggest Week mode if week checklist incomplete  

### Activity queue status

| Status | Meaning (per activity) |
| --- | --- |
| **Not Started** | No enrichment fields/photos set beyond legacy text |
| **In Progress** | Some enrichment (e.g. one photo or tips) but not activity-complete |
| **Complete** | Setup photo **and** finished example **and** ≥1 teacher tip (minimum bar; substitutions/chips optional bonus) |

Statuses visible at a glance — no need to open each card.

### Activity counter + navigation

- Top chrome: **Activity 3 of 15**  
- **Previous** / **Next** move across the full lesson queue (not only current day)  
- Left rail day filter still helps scan; counter stays global  

### Photo areas (every photo zone)

Each photo control **must** support:

1. Drag and drop  
2. Click to upload  
3. Replace photo  
4. Remove photo  
5. Full-size preview (lightbox / modal)  

Zones: **Setup photo**, **Finished example**. Instant thumbnail after select; helper on finished: “Original photo or artwork only.”

### Activity stage — other components (minimize typing)

- Inline title (optional)  
- Chips: Small group · Large group · Indoor · Outdoor  
- Teacher tips as cards + one-line add  
- Supply substitutions as reusable cards  
- Observation prompt toggles  
- ✨ Suggest → **Approval tray only**  

### Bottom sticky

| Button | Behavior |
| --- | --- |
| ← Previous | Draft-save current → previous activity |
| Skip for now | Leave status as-is; go Next |
| **Save & next →** | Draft-save → next activity (prefer next incomplete) |

---

## 6. Mode B — Week coaching

<img alt="Week coaching and completeness" src="/opt/cursor/artifacts/assets/tk-enrich-spec-week-complete.png" />

Card/chip UI for family, printables, vocabulary, milestones, week substitutions.  
Checklist is **guidance only** — rows jump to work; never blocks draft save.  
Never silent-overwrite existing week prose.

---

## 7. Mode C — Live Preview (provider-identical)

**Hard requirement:** Preview uses the **same Teaching Kit viewer** as providers (`LLHTeachingKitViewer` / same surfaces, styles, interactions).

- Not an admin wireframe or simplified mock.  
- Fed by **in-memory draft** of this lesson (debounce ~200–300ms).  
- Surfaces: Start Week · Monday Setup · Today · Build/Print · Binder peek — same as app.  
- Banner only difference allowed:  
  **“Previewing draft · subscribers still see the last published version until you Publish.”**  
  (Visual chrome of the kit itself must match subscribers.)

---

## 8. AI approval tray (mandatory)

- Nothing inserts without **Insert selected** / **Approve**.  
- Confirm before replacing existing tips/text.  
- Inserts go to **draft** only.

---

## 9. Draft autosave vs Publish confirmation

### Draft

| Action | Result |
| --- | --- |
| Autosave / Save draft | Persists enrichment draft for this lesson ID. **Published member view unchanged.** |
| Checklist incomplete | Still allowed. % updates; label may stay Legacy. |

Banner when lesson is already published/featured:

> Your changes are being saved as a draft. The published lesson will remain unchanged until you choose Publish.

### Publish… (always confirmation screen)

Opening **Publish…** shows a confirmation summary **before** any publish write:

1. **What changed** (short diff-style list: e.g. “5 activity photos added · family card updated · completeness 45% → 80%”)  
2. **Updates a published lesson?** Yes/No (current status)  
3. **Linked activities affected?** Count of activities whose enrichment/photos/tips will update in the Activity Library sync  
4. **Teaching Kit completeness change?** e.g. `Legacy → Enriched` and `45% → 80%`  

Buttons: **Cancel** · **Publish updates to providers**

No publish without this screen.

---

## 10. Completion % model (library + chrome)

### Overall percentage

Computed from a weighted quality checklist (guidance). Example weights (implementation may tune, UI shows single %):

| Bucket | Weight |
| --- | --- |
| Cover + week story basics | 15% |
| Books + songs | 10% |
| Family + observations | 10% |
| Activity photos (setup/example coverage) | 30% |
| Teacher tips coverage | 15% |
| Printables linked | 10% |
| Substitutions / group-setting options | 10% |

Display: **0% · 45% · 80% · 100%** (integer). Progress bar always visible in editor + library cards.

### Label mapping (derived, not a second manual system)

| Label | Typical % gate (guidance) |
| --- | --- |
| Legacy | &lt; 50% (or no enrichment overlay) |
| Enriched | ≥ 50% and &lt; 90% |
| Complete | ≥ 90% **and** Complete checklist items met (or admin Mark Complete) |

**Mark Enriched / Mark Complete** remain optional accelerators; checklist never blocks draft save.

---

## 11. Global jump search (current lesson)

Trigger: **🔍 Jump to…** (or `/` keyboard).

Searchable within open lesson:

- Activities (title, day, category)  
- Books  
- Songs  
- Printables / linked resources  
- Vocabulary words  
- Week sections (Family, Milestones, Materials, …)  

Results grouped; Enter/click navigates to mode + item. No site-wide curriculum search here (speed + focus).

---

## 12. Control budget (keep UI clean)

Only keep controls that save time across 100+ lessons:

**Keep:** queue statuses, photo D&D suite, chips, tip/substitution cards, activity N of M + prev/next, jump search, % bar, draft/publish split, provider-identical preview, AI approve tray.

**Avoid:** duplicate fields already in classic editor, dense textarea walls, extra settings panels, decorative toggles, multi-step wizards beyond Publish confirm.

---

## 13. Exact admin journey (updated)

### Open / return

Enrich Teaching Kit → restore draft → **first incomplete activity** → show `Activity N of M` + queue statuses.

### Activity loop

Photos (full suite) → chips → tips → optional AI approve → Save & next / Previous / Next.

### Week

Cards/chips; checklist guidance only.

### Draft anytime

Save draft / autosave; published lesson unchanged; banner explains this.

### Publish

Publish… → confirmation summary (changes · published? · linked activities · completeness %) → confirm.

### Library

Sort/filter by % to find “almost done” vs “needs most work.”

---

## 14. Data & safety constraints

- Source of truth: `siteContent.curriculum` (same 127 plans).  
- One lesson ID per save; additive/field patch; no bulk replace.  
- Never overwrite existing curriculum text without explicit action.  
- Persist activity `setupImageUrl` / `exampleImageUrl` (or media asset ids) — mapper already reads these.  
- Incomplete enrichment ⇒ members keep current mapped TK behavior.  
- Draft vs published separation must be real (draft stamp or unpublished enrichment channel) so the banner is truthful.

---

## 15. Acceptance criteria

1. Reopening a lesson always focuses the first incomplete activity.  
2. Every activity shows Not Started / In Progress / Complete in the queue.  
3. Every photo zone supports drag/drop, click upload, replace, remove, full-size preview.  
4. Live Preview is the real provider Teaching Kit viewer (same UI).  
5. Published lessons show the draft-vs-publish explanation before/while saving drafts.  
6. Publish always uses a confirmation summary (changes, published update, linked activities, completeness).  
7. Checklist never blocks draft save.  
8. `Activity N of M` + Previous/Next work across the lesson.  
9. Jump search finds activities/books/songs/printables/vocabulary/sections in the current lesson.  
10. UI stays minimal — no low-value controls.  
11. Overall % + bar in editor; library can sort/filter by completion %.  

---

## 16. Implementation slices (approved order)

1. Schema additives + completion % helper (activities photos, teachingKit completeness/%)  
2. Enrichment Editor shell (chrome, %, counter, prev/next, jump search, draft banner)  
3. Activity Focus (queue statuses, photo suite, chips/cards, resume-first-incomplete)  
4. Provider-identical live preview from draft  
5. Week mode cards + guidance checklist  
6. Publish confirmation screen  
7. Library badge / sort / filter by %  

---

## 17. Owner approval

Refinements 1–11 are locked in this document. **Implementation is approved** to proceed in the slices above.

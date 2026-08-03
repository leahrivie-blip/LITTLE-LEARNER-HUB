# Teaching Kit Enrichment Editor — Final UI Specification

**Status:** Approved direction · awaiting implementation kickoff  
**Scope:** Admin-only · one lesson at a time · real curriculum store (`siteContent.curriculum`)  
**Non-goals:** Bulk rewrite, auto-publish, replacing existing Basics / Week story / Daily tabs  

---

## 1. Product promise

Upgrading a lesson should feel like **finishing a classroom kit**, not filling a CMS.

An admin should be able to:

1. Open one existing lesson  
2. Enrich **one activity at a time**  
3. See the Teaching Kit update **live**  
4. Leave unfinished and return later  
5. Advance **Legacy → Enriched → Complete** when ready  

Existing member-facing lessons keep working the entire time.

---

## 2. Entry points

From Admin → Content → Curriculum lesson list:

| Control | Behavior |
| --- | --- |
| **Enrich Teaching Kit** (primary on card) | Opens Enrichment Editor focused mode |
| **Edit lesson** (secondary) | Existing full editor (Basics / Week / Daily) |
| Completeness badge on card | `Legacy` / `Enriched` / `Complete` |

Enrichment Editor is a **focused workspace** layered on the same lesson ID — not a second curriculum.

---

## 3. Global chrome (always visible)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Farm Animals · Preschool     Legacy ○──●──○ Complete     45% ████░░   │
│ Draft autosaved 2m ago · Not published automatically                     │
│                              [Exit]              [Mark Enriched]         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Rules

- **Progress stepper** always shows Legacy → Enriched → Complete with % fill.  
- **Draft autosave** writes admin draft state only (local + optional server draft stamp).  
- **Never auto-publish.** Status (`draft` / `published` / `featured`) changes only via existing lesson controls outside this flow, or an explicit “Keep published & save enrichment” confirmation if the lesson is already public.  
- **Mark Enriched / Mark Complete** enabled only when checklist rules pass; never forced.  
- **Exit** always safe: unfinished work remains draft enrichment; lesson stays usable as-is.

---

## 4. Information architecture (three modes)

Top segmented control inside the Enrichment Editor:

| Mode | Purpose | Feeling |
| --- | --- | --- |
| **Activities** (default) | One-activity studio | Fast, photo-first |
| **Week** | Family, printables, vocabulary, milestones | Card pickers |
| **Preview** | Full Teaching Kit walkthrough | Confidence check |

No long single-page form. Modes switch panels; activity mode never dumps the whole week into one scroll.

---

## 5. Mode A — Activities (core upgrade loop)

### Layout

<img alt="Activity Focus mode" src="/opt/cursor/artifacts/assets/tk-enrich-spec-activity-focus.png" />

| Zone | Contents |
| --- | --- |
| **Left rail** | Day chips (Mon–Fri) → activity queue for that day only. Active card highlighted. Checkmark when activity meets “ready” bar. Counter: “2 of 4 Monday” |
| **Center stage** | **Only the active activity** |
| **Right rail** | Live Teaching Kit phone preview (Today / activity depth) |

### Activity stage — components (minimize typing)

1. **Inline title** (click to edit; optional)  
2. **Photo pair (required for premium feel)**  
   - Setup photo — drag/drop or tap upload, instant preview, replace/remove  
   - Finished example — same; helper: “Original photo or artwork only”  
3. **Group & setting chips** (multi-select, not textareas)  
   - Small group · Large group · Indoor · Outdoor  
4. **Teacher tips**  
   - Start as **tappable tip cards** / chips  
   - “+ Add tip” opens a **single-line** inline input (Enter to commit)  
   - Max ~5 short tips; no giant textarea by default  
5. **Supply substitutions**  
   - Reusable cards: `No X → use Y`  
   - Pick from common classroom library + “+ custom” one-liner  
6. **Observation prompts**  
   - Checklist toggles from age-appropriate bank + “+ custom”  
7. **✨ Suggest** (AI)  
   - Opens **Approval tray** (see §8) — never inserts silently  

### Bottom sticky actions

| Button | Behavior |
| --- | --- |
| ← Prev activity | Save draft of current card → previous |
| Skip for now | Leave incomplete; advance queue |
| **Save & next →** | Draft-save current activity enrichment → next incomplete activity |

### One-activity rule

- Opening Enrichment Editor lands on the **first incomplete activity**.  
- Completing photos + tips marks that activity’s rail checkmark.  
- Scrolling never reveals other activities’ full editors — only the left queue.

---

## 6. Mode B — Week coaching

<img alt="Week coaching and completeness" src="/opt/cursor/artifacts/assets/tk-enrich-spec-week-complete.png" />

Card-based week work (not a wall of textareas):

| Card | Interaction |
| --- | --- |
| **Family connection** | Pick 1 of 3 suggested cards **or** edit selected card inline; AI suggest → approve |
| **Printables** | Drag/drop PDF/image → instant chip; or link existing curriculum resource; tag “Used Mon / Art” |
| **Vocabulary** | Word chips + add chip |
| **Milestones** | Multi-select age chips (Sorting, Fine motor, Language, etc.) |
| **Week supply substitutions** | Same card pattern as activities |
| **Completeness checklist** | Left or top; each row jumps to the work that unlocks it |

Existing Week story fields (`weeklyOverview`, books, songs, etc.) remain editable in the classic editor. Enrichment Week mode **prefers selectors/chips**; if the classic field already has rich text, show it as a **collapsed “Current text” card** with “Edit in Week story” link — never silent overwrite.

---

## 7. Mode C — Live Preview

- Updates from **in-memory draft** as the admin edits (debounce ~200–300ms).  
- Surfaces: Start Week · Monday Setup · Today · Build/Print · Binder peek.  
- Banner: **“Live preview · member library updates only after you save enrichment.”**  
- No need to hit Save just to see layout; Save still required to persist.

---

## 8. AI approval tray (mandatory)

Every AI action opens a right/bottom tray:

```
┌ Suggested teacher tips ───────────── ✕ ┐
│ ○ Tip 1…                    [Preview] │
│ ○ Tip 2…                    [Preview] │
│ □ Select all                          │
│ [Discard]           [Insert selected] │
└───────────────────────────────────────┘
```

Rules:

- Nothing inserts without **Insert selected** / **Approve**.  
- Insert only into the **enrichment draft**, never over existing prose unless the admin chose a card that replaces a selected tip.  
- “Replace existing tips?” confirmation if target already has content.

---

## 9. Autosave vs publish (critical)

| Layer | What happens |
| --- | --- |
| **Draft autosave** | Enrichment draft for this lesson ID (photos staged, chips, tips). Frequent, silent, recoverable. |
| **Save enrichment** | Persists additive fields / `teachingKit` overlay for **this lesson only** via existing one-plan save path. |
| **Publish** | Unchanged product rules — not triggered by Enrichment Editor. Published lessons can receive enrichment saves with an explicit confirm: “Update published lesson enrichment for providers?” |

Incomplete enrichment ⇒ `teachingKit.completeness = legacy_mapped` (or omit overlay) ⇒ current TK mapping still works.

---

## 10. Completeness rules (visual indicator)

### Legacy (default)

No enrichment overlay / checklist &lt; Enriched threshold. Member TK still maps existing fields.

### Enriched — enable **Mark Enriched** when all true

- Cover present  
- Weekly overview present (from existing data OK)  
- ≥1 book and ≥1 song (existing OK)  
- Family connection card chosen or existing text present  
- Observation prompts present  
- ≥50% of activities have setup **or** example photo  
- Week materials non-empty  

### Complete — enable **Mark Complete** when all true

- All Enriched checks  
- Every weekday has ≥1 activity  
- ≥1 activity/day (or ≥5/week) has **both** setup + finished photos  
- ≥1 printable linked with use-day tag  
- Teacher tips on each “highlight” activity (≥1/day)  
- ≥3 activities have substitution **or** indoor/outdoor **or** small/large option  
- ≥3 milestone chips selected (or existing objectives/domains judged sufficient)  
- Admin checked “Preview looks ready”  

Marking Complete only sets `teachingKit.completeness = "complete"`. It does not invent content.

---

## 11. Exact admin journey: one lesson Legacy → Complete

### Step 0 — Open

Admin clicks **Enrich Teaching Kit** on `Farm Animals`.  
Chrome shows **Legacy**, 0–20%. Lands in **Activities**, Monday, first incomplete activity.

### Step 1 — Activity loop (repeat)

For each activity:

1. Drop **setup photo** → instant preview in center + live phone preview.  
2. Drop **finished example** → same.  
3. Tap chips: Small group, Indoor.  
4. Tap 2 tip cards; optionally ✨ Suggest → Approve 1 tip.  
5. Add one substitution card.  
6. Toggle 2 observation prompts.  
7. **Save & next**.  

Autosave keeps drafts if they Exit mid-day.

### Step 2 — Week mode

- Pick family card (or approve AI suggestion).  
- Drag one printable; tag “Monday · Art”.  
- Confirm vocabulary chips; add 1 word.  
- Select milestone chips.  

Progress moves toward **Enriched**.

### Step 3 — Mark Enriched

When checklist greens enough, **Mark Enriched** enables.  
Admin confirms → `completeness: "enriched"` saved for this lesson only.

### Step 4 — Finish remaining activity photos/tips

Return to Activities; clear remaining queue checks.

### Step 5 — Preview pass

Walk Start → Setup → Today → Build. Check “Preview looks ready.”

### Step 6 — Mark Complete

**Mark Complete** enables → confirm → `completeness: "complete"`.  
Lesson card badge updates. Member TK shows richer companion; legacy fields unchanged unless admin explicitly edited them.

### Step 7 — Stop anytime

Exit at any step. Lesson remains in library; members still see current mapped TK/legacy. Resume later at first incomplete activity.

---

## 12. Interaction inventory (preferred over typing)

| Pattern | Used for |
| --- | --- |
| Drag-and-drop | Photos, printables |
| Instant preview | Photos, live TK phone |
| Chips / toggles | Group size, indoor/outdoor, milestones, observations |
| Reusable cards | Tips, substitutions, family ideas |
| Inline one-line edit | Custom tip / custom substitution / vocabulary word |
| Queue + focus | One activity at a time |
| Approval tray | All AI inserts |
| Checklist jumps | Completeness navigation |

Large textareas are **escape hatches**, not the default path.

---

## 13. Data & safety constraints (spec-level)

- Source of truth: existing lesson + activities in `siteContent.curriculum`.  
- Saves: one lesson ID only; field/additive patching; no bulk replace.  
- Never overwrite existing curriculum text without explicit admin action.  
- Photo fields must persist (additive activity media fields) — design assumes implementation will extend normalization safely.  
- Attachments flag may remain off; printables can still **link** existing resources.  
- Empty enrichment ⇒ current production behavior unchanged.

---

## 14. Empty / error / joy states

| State | UI |
| --- | --- |
| No photo yet | Friendly dashed dropzone + example silhouette |
| Upload fail | Inline error on zone; keep prior photo |
| All Monday done | Confetti-light check + “Tuesday ready when you are” |
| AI unavailable | Hide Suggest or disable with note; manual chips still work |
| Concurrent edit conflict | “Lesson changed elsewhere — reload draft” (existing concurrency stamp) |

---

## 15. Out of scope for v1

- Redesigning member Teaching Kit tab labels to mockup Overview/Songs/Books tabs  
- Bulk “enrich all lessons”  
- Auto-mark Complete  
- Silent AI writes  
- Pinterest import / non-original image scrapers  

---

## 16. Acceptance criteria for this UI (when built)

1. Admin can enrich one activity without scrolling past other activities’ editors.  
2. Photos show instant preview before save.  
3. Live Preview updates without requiring Save.  
4. Draft autosave recovers after refresh; publish status unchanged.  
5. AI insert requires Approve.  
6. Progress shows Legacy → Enriched → Complete accurately.  
7. Unfinished lessons remain member-safe.  
8. Save touches only the open lesson plan.

---

## 17. Review checkpoint

**Stop here for owner review before implementation.**

Approve / adjust:

- Activity-focus loop + sticky Save & next  
- Week mode as cards/chips  
- Completeness thresholds  
- Autosave-draft vs explicit enrichment save vs no auto-publish  
- AI approval tray  

After approval, implementation can proceed in thin slices (schema additives → Activity mode → Week mode → Preview → completeness actions).

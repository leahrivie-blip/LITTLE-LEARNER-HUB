# Delete, Remove & Archive — Step Plan

Goal: every major item supports clearly labeled **Edit / Duplicate / Archive / Remove / Delete** actions so users never get stuck with data they cannot fix.

## Language standard (always)

| Word | Meaning |
|------|---------|
| **Remove** | Take an item out of a place (calendar, week, lesson, timeline). Original record stays. |
| **Archive** | Soft-hide. Preferred over delete. Recoverable. |
| **Delete** | Permanently remove the record. Always confirm. |

Never use vague labels like “Remove” alone when it might mean delete.

---

## Easiest implementation order

### Step 1 — Shared action system (foundation)
Build once, reuse everywhere:
- Confirm dialog (`confirmAction`) with clear Remove vs Delete copy
- Three-dot overflow menu (`itemActionMenuHtml`)
- Shared click handlers for menu open/close + confirm

**Pilot:** wire on one surface first, then expand.

### Step 2 — Daily Logs (biggest gap)
Entries are append-only today. Add **Edit** + **Delete** for:
Attendance, Meals, Naps, Potty/Diapers, Activities, Photos, Reports, Parent Messages, Support Plans, Differentiations.

### Step 3 — Goals
Add **Edit**, **Mark Complete**, **Archive**, **Delete** (with confirmation).

### Step 4 — Child Profiles
Relabel hide/show → **Archive Child** / **Reactivate Child**.
Add **Delete Child** with confirmation + clear cascade warning.

### Step 5 — Calendar
- Lesson plans / placements: **Remove From Calendar** (does not delete the lesson)
- Events / notes: **Delete** with confirmation
- Keep **Edit**; add **Duplicate** / **Move Date** where schedule API allows

### Step 6 — Observations + Lesson Plans polish
- Observations: keep Edit/Duplicate; label delete clearly; add Archive
- User lesson copies: keep Edit/Duplicate/Archive/Delete; prefer Archive; confirm Delete

### Step 7 — Activities (when attached to lessons)
**Remove From Lesson Plan** vs **Delete** from library (admin/curriculum paths).

### Step 8 — Forms, Printables, Documents, Photos, Messages, Incidents
Align admin + user labels to the language standard; add missing Archive/Delete where safe.

### Step 9 — Family Hub (future)
Stop Sharing / Remove Shared Item / Remove Parent Access — never delete originals.

### Step 10 — Full audit pass
Checklist per object: Edit? Duplicate? Archive? Remove-from-location? Delete? Clear label?

---

## Status (this PR)

| Step | Status |
|------|--------|
| 1 Shared confirm + action menu | Done |
| 2 Daily log Edit/Delete | Done |
| 3 Goals Archive/Delete/Edit | Done |
| 4 Child Archive/Reactivate/Delete | Done |
| 5 Calendar Remove vs Delete labels | Done |
| 6 Observations + Lesson delete labels | Done |
| 7 Activities remove-from-lesson vs delete | Follow-up |
| 8 Forms, Printables, Documents, Photos, Messages, Incidents | Follow-up |
| 9 Family Hub (future) | Follow-up |
| 10 Full audit pass across every screen | Follow-up |

Do not mark the full audit complete until Steps 7–10 are done across every major object.

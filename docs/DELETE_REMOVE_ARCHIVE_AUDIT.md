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

## Status

| Step | Status |
|------|--------|
| 1 Shared confirm + action menu | Done (#178) |
| 2 Daily log Edit/Delete | Done (#178) |
| 3 Goals Archive/Delete/Edit | Done (#178) |
| 4 Child Archive/Reactivate/Delete | Done (#178) |
| 5 Calendar Remove vs Delete labels | Done (#178) |
| 6 Observations + Lesson delete labels | Done (#178) |
| 7 Activities Remove From Lesson Plan | Done |
| 8 Forms/Printables/Messages/Incidents/Photos labels + Archive | Done |
| 9 Family Hub Stop Sharing / Remove From Parent View | Done (interim until Family Hub ships) |
| 10 Audit pass + timeline/AI history/admin confirms | Done |

## Object checklist (major items)

| Object | Edit | Archive | Remove-from-place | Delete Permanently |
|--------|------|---------|-------------------|--------------------|
| Daily log entries | ✅ | ✅ | — | ✅ |
| Goals | ✅ | ✅ | — | ✅ |
| Child profiles | ✅ | ✅ / Reactivate | Hide from DLC via archive | ✅ |
| Calendar lesson placement | ✅ | — | ✅ Remove From Calendar | — (original kept) |
| Calendar events/notes | ✅ | — | — | ✅ |
| Observations | ✅ | ✅ | — | ✅ |
| User lesson plans | ✅ | ✅ | — | ✅ |
| Lesson activity rows | ✅ | (on save) | ✅ Remove From Lesson Plan | — |
| Forms/Printables (admin) | ✅ | ✅ | — | ✅ |
| Photos / messages / reports | ✅ | ✅ | ✅ Stop Sharing / Remove From Parent View | ✅ |
| Timeline entries | via menu | ✅ | ✅ Stop Sharing | ✅ |
| AI generated history | Open | — | — | ✅ |
| Curriculum planner week assignment | — | — | ✅ Remove From Week | — |
| Family Hub parent portal | Coming soon | — | Stop Sharing ready on records | Never deletes originals |

Do not mark product-complete for Family Hub UI until the parent portal ships; sharing controls on source records are in place now.

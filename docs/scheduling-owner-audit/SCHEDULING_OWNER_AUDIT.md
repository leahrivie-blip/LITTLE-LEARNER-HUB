# Scheduling System — Owner Audit

**Date:** July 13, 2026  
**Scope:** Unified ScheduleItem foundation (Calendar · Weekly Planner · Dashboard · Lesson Library)  
**Curriculum Planner:** Still present — dual-write verified — **not retired**  
**Owner-review score: 67 / 100**

---

## Verdict

The new system **works as a connected foundation**. Assign / change / remove update Dashboard, Weekly Planner, Calendar, and Curriculum Planner dual-write in the main paths we exercised with real published curriculum.

It does **not** yet feel production-calm for teachers on mobile. The biggest issue is that Weekly Planner still stacks the new execution checklist **on top of the entire legacy planner form**, so the screen feels like two products. Dashboard also buries “what am I doing this week?” under install prompts, Quick Docs, Pro previews, and to-dos.

**Recommendation:** Keep Curriculum Planner. Fix the High punch-list items (especially Weekly Planner redundancy + Dashboard THIS WEEK priority) before treating this as the default teacher experience.

---

## Score rubric

| Band | Meaning |
|------|---------|
| 90–100 | Production-ready teacher/director experience |
| 75–89 | Soft launch / soak with known polish items |
| 60–74 | Foundation solid; UX not ready as primary path |
| <60 | Do not roll out |

**67 = foundation solid; UX not ready as primary path.**

### Why not higher
- Weekly Planner redundancy (execution + legacy on one page)
- Dashboard THIS WEEK not first / still Curriculum Planner CTAs
- Schedule cache can go empty after forced reload (future-week store check failed once)
- Add Event = `prompt()` / `alert()` on mobile
- No loading skeletons

### Why not lower
- Core sync works (assign → Dashboard / Planner / Calendar / dual-write)
- Change + remove update views
- Calendar visual direction matches design system (lavender, whitespace, week detail)
- No horizontal overflow on iPhone/Android for Calendar/Planner
- Empty states exist
- Curriculum Planner still available (as required)

---

## Devices & data

| Device | Viewport |
|--------|----------|
| iPhone | 390×844 |
| Android | 412×915 |
| Desktop | 1280×900 |

**Real curriculum seeded**
- `Community Helpers Audit Week` (Free published)
- `Transportation Audit Week` (Free published)

---

## Verification matrix

| Flow | Result | Notes |
|------|--------|-------|
| Assign lesson plan (Library → Plan This Week) | **PASS** | ScheduleItem + success copy with classroom/dates |
| ScheduleItem written | **PASS** | Local cache + cloud GET |
| Curriculum Planner dual-write | **PASS** | Legacy assignments updated |
| Weekly Planner sync on assign | **PASS** | Theme + checklist appear |
| Dashboard updates on assign | **PASS** | THIS WEEK shows plan + today activities |
| Calendar week bar | **PASS** | Assigned title on Monday cell |
| Future week planning | **PASS** (assign) / **PARTIAL** (cache) | Assign API OK; forced reload left ScheduleItem cache empty once while legacy dual-write still had both weeks |
| Change lesson plan | **PASS** | Dashboard + Planner updated to Transportation |
| Remove lesson plan | **PASS** | Dashboard returned to empty state |
| Calendar back button | **PASS** | Returns to Dashboard |
| Curriculum Planner still in nav | **PASS** | Not retired |
| Mobile horizontal overflow | **PASS** | Calendar + Planner |

---

## Punch list (do before “primary path” claim)

### High (fix before soft launch)

1. **Weekly Planner = two systems on one screen**  
   Execution checklist + Save Notes appear above the full legacy Week Setup / day columns / Clear / Copy / suggested resources. Teachers must scroll a long page; it feels redundant and crowded.  
   **Fix:** Execution-first layout. Collapse or hide legacy form behind “Advanced / daily ops” once ScheduleItem is source of truth.

2. **Dashboard does not lead with “What am I doing this week?”**  
   On mobile, THIS WEEK sits below Install prompt, Quick Documentation, Pro Previews, and Today’s To-Do — and still exposes **Open Curriculum Planner** next to the new Weekly Planner CTAs.  
   **Fix:** Promote THIS WEEK + UPCOMING to the top for logged-in users; retire Curriculum Planner CTAs from Dashboard during soak (nav can keep it).

3. **Schedule cache inconsistency after forced reload**  
   Future-week assign succeeded and dual-write had both weeks, but `llhScheduleItems` read back empty after `ensureScheduleLoaded({ force: true })`.  
   **Fix:** Make force reload merge safely (never replace a richer local/cloud doc with an empty one); add regression test.

### Medium

4. **Add Event / Reminder / Closure uses `window.prompt` / `alert`** — not mobile production UX. Needs a small modal using design-system fields.  
5. **No loading skeleton** on Calendar/Dashboard while schedule loads — possible empty flash.  
6. **Dashboard / Calendar language still mixed** (“This Week’s Curriculum”, Curriculum Planner buttons). Align copy to Calendar / Weekly Planner.  
7. **Mid-week empty activities** (Wed–Fri “No activities listed”) on seeded plan — confirm snapshot completeness for real catalog plans; empty state should guide “Open lesson plan” not look broken.  
8. **Director month-ahead planning** is month-grid only — fine for Phase 1, but add a simple upcoming-weeks list for scanning August+ without paging month by month.  
9. **Brand mark** — Connected Hub icon shipped in markup; confirm it consistently replaces LL square in cached CSS/SW builds.

### Low / intentional during soak

10. **Calendar + Curriculum Planner both in nav** — OK until retirement; add “Legacy” label on Curriculum Planner to reduce confusion.  
11. **Weekend columns** on mobile add noise; consider collapsing Sat/Sun on small screens.  
12. **Print Weekly Schedule** from Dashboard may not jump straight to PDF — verify one-tap print path.  
13. **Suggested resources** under Weekly Planner can feel like a third assignment entry — hide or demote once execution-first.

---

## Screen-by-screen notes

### Dashboard
- Useful content exists (theme, dates, today activities, Open Weekly Planner / Print / Change / Open Calendar).  
- Not glanceable yet because of vertical clutter above it.  
- Empty state copy is clear.

### Main Calendar
- Closest to the approved mockups: month title, week bars, week detail, lavender selection.  
- Mobile stacked layout works; no overflow.  
- Event empty state is clear; add-event interaction is not.

### Weekly Planner
- Execution checklist is the right teacher tool.  
- Legacy form underneath undoes the calm design-system promise.  
- Highest priority UX debt.

### Lesson Library assign flow
- Use This Plan → Plan This Week → success message works in primary path.  
- Success CTA prioritizes Open Weekly Planner (good).  
- Watch mobile action-sheet panel visibility (form can be off-screen depending on sheet state).

### Curriculum Planner
- Still intact for soak. Dual-write confirmed. Do not delete.

---

## Screenshot index

All files under `docs/scheduling-owner-audit/` and `/opt/cursor/artifacts/scheduling-owner-audit/`:

| # | File | What |
|---|------|------|
| 01 | `01-iphone-dashboard-empty.png` | Empty THIS WEEK |
| 02 | `02-iphone-calendar-empty.png` | Empty calendar |
| 03 | `03-iphone-weekly-planner-empty.png` | Empty planner |
| 04 | `04-iphone-curriculum-planner-legacy.png` | Legacy planner alive |
| 05–09 | `05`–`09-iphone-…` | Library → workspace → assign → success |
| 10 | `10-iphone-weekly-planner-assigned.png` | Execution + legacy stacked |
| 11 | `11-iphone-dashboard-assigned.png` | THIS WEEK buried mid-page |
| 12–16 | calendar / change flows | Assign, future, change |
| 17 | `17-iphone-dashboard-after-remove.png` | Empty after remove |
| 18–22 | Android set | Same surfaces |
| 23–28 | Desktop set | Dashboard, Calendar, Planner, Library, Curriculum Planner |

---

## Re-run

```bash
node scripts/owner-audit-scheduling.js
```

---

## Next merge gate

Before calling this production-ready (target **≥ 80**):

- [ ] Weekly Planner execution-first (legacy collapsed/hidden)  
- [ ] Dashboard THIS WEEK / UPCOMING at top; remove Curriculum Planner dashboard CTAs  
- [ ] Fix ScheduleItem force-reload cache merge  
- [ ] Replace prompt/alert Add Event with design-system modal  
- [ ] Re-run this audit; Curriculum Planner still not retired until soak passes  

**Current owner-review score: 67 / 100**

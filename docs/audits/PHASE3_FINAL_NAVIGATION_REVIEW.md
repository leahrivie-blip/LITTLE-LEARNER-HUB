# Phase 3 final navigation review (pre–Phase 4)

**Date:** 2026-08-08  
**Environment:** Testing only (`HOME_DAYCARE_HUB_TESTING`)  
**Production modified?** No  
**Status:** ✅ Complete  

Companion to `PHASE3_NAVIGATION_CLEANUP_COMPLETION_REPORT.md`.  
Owner approved Phase 3; this review closes remaining access/duplicate gaps before Phase 4.

---

## Role access matrix (work-mode)

| Role | Sees | Must not see |
|---|---|---|
| **Owner** | Home, Children, Classroom, Curriculum, Families, Management, Settings | Teacher Today as primary |
| **Director** | Same as Owner (Billing owner-only inside Management) | Owner Billing if not owner |
| **Teacher** | Today, My Children, Classroom, Curriculum, Families, More | Management, Billing, Admin |
| **Assistant** | Today, Children, Classroom, **Family messages → Family Hub**, More | Families hub, Curriculum primary, Management, Admin |
| **Family / Parent** | Family Hub shell only (Today, Photos, Messages, More) | Provider work-mode, Admin |
| **Home Daycare** | Same role shells; Management demotes Staff/Classrooms | Forced center chrome |
| **Center** | Staff/Classrooms primary in Management | — |
| **Free / Pro / Trial** | On testing, Testing Pro unlocks Pro tools; Admin View As Free still simulates Free | Plan must not invent a fourth nav shell |
| **Tester** | Provider or parent shell by role; Admin → Testers for Leah only | Admin for invited testers |

---

## One clear home per destination

| Destination | Canonical home | Secondary (OK) | Removed / retargeted |
|---|---|---|---|
| Lesson Plans | Sidebar **Curriculum** | Classroom “Lesson Plans”, Teacher Today | Assistant More Curriculum removed |
| Family Hub / parent chat | **Families → Family Hub** / Family messages | Assistant sidebar Family messages | No longer opens Message Support |
| Message Support (Leah) | **More → Message Support** | Header support | Distinct from Family messages |
| Forms library | **Families → Forms** | Quick Add Parent form | Packs stay under Family Hub |
| Management | Sidebar **Management** | — | Duplicate Testing Center tile removed from Management hub |
| Testers | **Admin → Testers** | — | Primary; Advanced Testing Center secondary inside Admin only |
| Settings | Sidebar Settings (Owner/Director) / More Settings (staff) | Program Settings in Management | Acceptable split |

---

## Fixes in this review pass

1. Teachers can open **Families** and **Forms** (capability gates matched nav).  
2. Assistant **Family messages** opens **Family Hub**, not Leah Message Support.  
3. Families hub **Family messages** tile → Family Hub panel.  
4. Quick Add **Family message** → Family Hub; Teacher Quick Message → Families; Assistant Quick Message → Family Hub.  
5. Management hub: single **Testers** admin tile (no duplicate Testing Center card).  
6. Assistant More: no Curriculum dump.

---

## Verification

- `npm run test:nav-role-experience` (asserts assistant `data-view="home-daycare-hub"`)  
- Manual smoke: Owner / Teacher / Assistant / Parent View As on testing host  

---

## Production

Untouched. Testing-is-the-Future + production read-only policies remain in force.

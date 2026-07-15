# Handoff: Lesson Plan Functionality Audit

**Date:** 2026-07-15  
**Branch:** `cursor/lesson-plan-functionality-audit-165d` (created from latest `main`)  
**Status:** Navigation rebuild merged. Lesson Plan audit **not started yet** — ready for next agent.

---

## Just completed (merged to main)

1. **PR #208** — Documentation Helpers simplified + child-centered flow  
2. **PR #209** — Navigation & sidebar rebuild  
   - Sidebar: Calendar → Lesson Plans → Activities → Documentation Center → Child Profiles → Behavior & Support → Settings → Director Center (Coming Soon)  
   - Post-login landing = **Calendar**  
   - Hidden (not deleted): Dashboard, Daily Logs, Forms & Enrollment, Reports, Resources  

---

## Next agent task (do this next)

**STOP ALL LESSON PLAN UI/DESIGN CHANGES.**

Critical priority: full audit + repair of Lesson Plan **functionality only**.

### Verify / fix

- Lesson Plan Library loads correctly  
- Lesson Plan cards are clickable  
- Preview buttons work  
- View Lesson Plan works  
- Use This Plan works  
- Assign To Calendar works  
- Add To Calendar works  
- Back buttons work  
- Print works  
- Download works  
- Mobile navigation works  
- Desktop navigation works  
- Search works  
- Filters work  
- Free/Pro permissions work  
- Founding Member permissions work  
- Login redirects work  
- Calendar integration works  

### Rules

- Do **not** redesign anything  
- Identify every broken button, link, route, click action, redirect, modal, and workflow in Lesson Plans  
- Repair them  
- Test on **mobile and desktop**  

### Deliverable report

1. What was broken  
2. What was fixed  
3. What still needs attention  

Do not continue feature development until Lesson Plans are fully functional and tested.

---

## Suggested starting points

- Branch already exists: `cursor/lesson-plan-functionality-audit-165d`  
- Key files: `app.js`, `index.html`, `styles.css`  
- Existing tests (run these first):  
  - `npm run test:lesson-library-phase2`  
  - `npm run test:lesson-library-cards`  
  - `npm run test:lesson-viewer-workspace`  
  - `npm run test:lesson-use-this-plan`  
  - `npm run test:lesson-library-mobile-qa`  
  - `npm run test:assign-workflow-polish`  
  - `npm run test:calendar-week-hub` (if present)  
- Related docs already in repo: `LESSON_LIBRARY_*`, `FINAL_OWNER_REVIEW_LESSON_LIBRARY.md`  

## Boot tips

- Static serve: `python3 -m http.server 4173`  
- Playwright is in `devDependencies` (`npm install` if needed)  
- Cache-bust script tag currently: `app.js?v=20260715-nav-rebuild`  

---

## After Lesson Plans are healthy

Owner wants section-by-section redesign later, one at a time:

1. Calendar  
2. Lesson Plans  
3. Activities  
4. Documentation Center  
5. Child Profiles  
6. Behavior & Support  
7. Settings  
8. Director Center  

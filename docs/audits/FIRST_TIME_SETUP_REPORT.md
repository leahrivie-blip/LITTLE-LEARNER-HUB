# First-Time Setup — Testing Site Only

**Shell:** `20260804-first-time-setup`  
**Branch:** `cursor/first-time-setup-d3df`  
**Scope:** Testing site only. No merge. No production deployment.  
**First-time user readiness (setup path):** ~93/100

## Mission

Brand-new providers should never wonder what to do next. A guided setup walks them through creating a real childcare program.

## Setup checklist (0–100%)

| # | Step | Auto-completes when |
|---|------|---------------------|
| 1 | Create your program | Program name saved |
| 2 | Add your first classroom | Classroom exists |
| 3 | Add your first child | Child profile exists |
| 4 | Invite your first family | Family Hub household / invite |
| 5 | Assign your first lesson plan | Lesson on classroom calendar |
| 6 | Record attendance | Attendance entry saved |
| 7 | Complete one Daily Log | Meal / nap / diaper / activity logged |
| 8 | Send your first parent message | Parent message saved |
| 9 | Assign a form | Document on a child file |
| 10 | View Family Hub as the parent | “See what parents see” used |
| 11 | Complete setup | All core steps done → celebration |

Each active step has **one explanation**, **one action button**, **automatic completion**, and a short **celebration** when finished.

## Demo mode

**Try demo mode** loads a realistic Sunshine Little Learners program (classroom, children, attendance, meal, parent message, form, lesson, family invite) so providers can explore without typing everything.

## First-week tips

Inline tips (not pop-ups) on Home / Today, e.g.:

- “Try recording lunch for today’s children.”
- “You haven’t invited a parent yet.”
- “Your first observation takes less than a minute.”

Tips hide automatically when the related action is done (or when dismissed).

## 100% celebration

Shows: **🎉 Your childcare program is ready!**  
Shortcuts: Today’s Classroom · Children · Lesson Plans · Family Hub · Forms  

After **Continue to Home**, setup never returns unless reset via **Business → Admin only → Reset first-time setup**.

## Acceptance

`npm run test:first-time-setup` (10/10)  
Module: `scripts/first-time-setup.js`  
Artifacts: `/opt/cursor/artifacts/first-time-setup/`

## Remaining friction (documented)

1. Lesson assignment detection depends on schedule cache APIs — demo mode flags the step if calendar write isn’t available.  
2. Family invite auto-complete uses Family Hub seed API when backend auth is present; otherwise demo sets a local invite flag.  
3. Default schedule classrooms can give ~10% head-start before the provider adds a program name.  
4. Free-plan lesson onboarding (`new-user-onboarding.js`) remains separate — this checklist is the **provider program** path on the testing site.

**Do not merge. Do not deploy production.**

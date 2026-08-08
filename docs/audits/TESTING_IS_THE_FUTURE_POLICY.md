# TESTING IS THE FUTURE — Locked Policy (Leah approval 2026-08-08)

**Status:** Approved and locked  
**Spine:** HDH / `main` testing architecture  
**Production:** Read-only until Leah gives **written** approval to deploy  

---

## Standing rule (all remaining phases)

The **testing site** is the future of Little Learner Hub.

From this point forward, **all** of the following are built **only** on the current HDH/`main` testing architecture:

- New development and redesigns  
- Bug fixes and usability polish  
- Curriculum and Teaching Kit improvements  
- Family Hub, Forms, Billing (testing), AI, and future features  
- Live → Testing Feature Sync work  
- Final QA preparation  

**Production must remain completely unchanged** until Leah **explicitly approves deployment in writing**.

Production is **read-only throughout all remaining phases** — not only during Live → Testing Feature Sync.

---

## Forbidden without written owner approval

- Never modify production code directly  
- Never delete production data  
- Never overwrite production lesson plans  
- Never overwrite production Teaching Kits  
- Never publish testing changes to production  
- Never point production to testing databases or services  
- Never merge unfinished work into production  
- Never remove or replace production functionality without approval  
- Never deploy, merge into production, or publish any production changes  

If a change could affect production: **stop** and require written approval.

---

## Live → Testing Feature Sync

- Compare production to testing **only** to identify missing functionality (read-only).  
- Implement those features **on the testing architecture**.  
- Do **not** change production while syncing.  

Full brief: `docs/audits/LIVE_TO_TESTING_FEATURE_SYNC_PHASE.md`

---

## Continuous quality

In every remaining phase, continue fixing bugs, improving usability, polishing UI, and removing low-risk technical debt in the area being worked. Do not defer obvious safe improvements.

---

## Before Final QA — required comprehensive audit

Deliver one audit that confirms:

1. **Production remained untouched** throughout development.  
2. **Every approved feature** has been moved into testing where appropriate.  
3. **No production features were accidentally lost** during the transition.  
4. **Testing is now the complete next version** of Little Learner Hub.  
5. The **only remaining step** before release is Final QA and Leah’s **explicit written approval**.

Audit template: `docs/audits/PRE_FINAL_QA_PRODUCTION_UNTOUCHED_AUDIT.md`

---

## Release gate

**Do not deploy, merge into production, or publish any production changes until Leah gives written approval.**

---

## Phase completion + progress tracker (permanent)

- Every phase must end with a completion report before the next phase starts.  
- Template: `docs/audits/PHASE_COMPLETION_REPORT_TEMPLATE.md`  
- Master tracker (always current): `docs/audits/MASTER_PROJECT_PROGRESS.md`  
- Cursor rule: `.cursor/rules/phase-completion-and-progress-tracker.mdc`  

Each report includes: completed work, files changed, tests + results, bugs fixed, known issues, deferred features, production-untouched confirmation, and recommendations before the next phase.

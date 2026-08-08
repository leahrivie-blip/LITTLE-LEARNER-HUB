# Live → Testing Feature Sync

**Status:** Planned — runs **after** AI review-before-save, **before** Final QA / production readiness  
**Spine:** HDH / `main` testing architecture remains the source of truth  
**Environment:** All work happens on the **testing** site only  
**Standing policy (locked):** `docs/audits/TESTING_IS_THE_FUTURE_POLICY.md`  

---

## Purpose (expanded)

This phase is **not** “copy a few missing screens.”

**Goal:** Make the testing site the **complete future version** of Little Learner Hub — the single place where all future development happens — while production stays stable until Leah finishes Final QA and gives **written** approval for any production update.

Compare **every major area** of the live site against the testing site. Migrate anything valuable that is missing onto the current HDH/`main` architecture. Prefer testing’s newer work when it already exceeds live.

This is **feature synchronization into testing**, not an architecture merge into production.

---

## CRITICAL — Production is read-only (this phase AND all remaining phases)

**Nothing on the current live production site may be modified, deleted, overwritten, migrated, or published** without Leah’s **written** approval.

Production is **read-only**. It may be inspected only to identify missing features or design patterns.

### Forbidden (no exceptions without written owner approval)

- Do **not** modify production code directly  
- Do **not** modify production lesson plans  
- Do **not** modify production Teaching Kits  
- Do **not** modify production admin  
- Do **not** modify production users  
- Do **not** modify production children, families, staff, or programs  
- Do **not** modify production settings  
- Do **not** modify production feature flags  
- Do **not** modify production subscriptions or billing  
- Do **not** modify production database records  
- Do **not** delete, rename, archive, or overwrite any production content  
- Do **not** publish drafts or testing changes to production  
- Do **not** point production at testing services or databases  
- Do **not** merge unfinished work into production  
- Do **not** remove or replace production functionality without approval  
- Do **not** write back to production after a comparison read  

### Allowed

- **Read-only** comparison of live vs testing (UI, docs, public surfaces, or approved read-only inventory)  
- Copy **functionality or design patterns** into the **testing** architecture only  
- All development, migrations, UI changes, curriculum/cover updates, and new functionality **only on testing**  

### Stop rule

Before making any change that could affect production, **stop** and require Leah’s **written approval**.

**Outcome required:** Production remains **100% unchanged and fully operational** while testing becomes the complete next version of Little Learner Hub.

---

## Explicitly do NOT (architecture)

- Merge or replace testing Owner Admin with the production admin architecture  
- Merge `origin/testing/full-platform-integration-2026-07` (July Testing Lab / foundation orgs)  
- Merge legacy testing systems or different organization models wholesale  
- Overwrite newer testing work on HDH/`main`  
- Regress completed testing functionality (Owner Admin Testers, Family Hub, Forms spine, etc.)  

### Resolve conflicts with

Current **HDH / `main`** testing architecture. Migrate production-only admin features **individually** only when they fit that architecture.

---

## Placement in roadmap (approved and locked)

1. Safety + HDH/`main` confirmation ✅  
2. Owner Admin ✅ — **Phase 3 held** until Leah finishes Owner Admin validation  
3. Navigation cleanup *(on hold)*  
4. One source of truth (children / staff / families)  
5. Daily operations  
6. Family Hub  
7. Forms  
8. Billing (testing)  
9. AI review-before-save  
10. **Live → Testing Feature Sync** ← this phase  
11. Pre–Final QA audit (`docs/audits/PRE_FINAL_QA_PRODUCTION_UNTOUCHED_AUDIT.md`)  
12. Final QA — production updates **only** after **written** approval  

---

## Continuous quality (every remaining phase)

During **every** remaining phase (including this sync), continue to:

- Fix bugs  
- Improve usability  
- Polish UI  
- Remove low-risk technical debt  

**Do not defer obvious quality improvements** when they can be completed safely in the area already being touched.

---

## Areas to compare and sync

Every major live-vs-testing area below must be compared. Migrate valuable gaps into testing; document redesigns and skips.

| Area | Sync expectation |
|---|---|
| Homepage and marketing pages | Bring valuable live marketing/homepage work onto testing if missing or weaker |
| Customer dashboard | Prefer stronger of live vs testing; migrate gaps onto HDH spine |
| Lesson Plans | Full lesson library parity / improvements on testing |
| Complete Teaching Kits | Prefer current TK work on testing/`main`; fill any live-only gaps without writing to production |
| Lesson viewer | Viewer UX parity + improvements |
| Print / download system | Prefer repaired TK print on testing; port any live-only strengths |
| Lesson covers / cover artwork | Sync valuable cover treatment into testing only |
| Calendar | Keep child-link + daily-log connections; port missing live calendar strengths |
| Child Profiles | Prefer one-source-of-truth direction; migrate missing live profile features |
| Daily Logs | Prefer testing improvements; port live-only strengths |
| Documentation Helpers | Port gaps |
| Behavior & Support | Gap check + migrate |
| Settings | Gap check + migrate |
| Messaging | Gap check + migrate |
| AI tools | Prefer newer testing/`main` AI; port live-only strengths carefully |
| Subscription / billing experience | Testing uses **testing** billing/simulator — do not wire live production Stripe into testing blindly; document intentional differences |
| Forms | Prefer Forms spine on testing; port live-only strengths |
| Family Hub | Prefer HDH Family Hub; port live-only strengths if any |
| Activity Center | Port gaps |
| Admin improvements | Migrate **individually** into Owner Testing Admin only if they fit; **never** merge old production admin architecture |

---

## Method

1. **Read-only compare** live vs testing, area by area (never write to production).  
2. Build a living **difference checklist** (identical / missing / diverged / redesign / skip).  
3. **Migrate into testing** onto the HDH/`main` spine (port UX + behavior, not parallel stacks).  
4. **Redesign** when live behavior conflicts with the newer testing architecture.  
5. **Skip** when live behavior must stay production-only (e.g. live Stripe ops, production admin command center).  
6. Apply continuous quality fixes while in each area.  
7. Deliver the **complete audit** below, then fill `PRE_FINAL_QA_PRODUCTION_UNTOUCHED_AUDIT.md` before Final QA.

---

## End-of-phase deliverable — complete audit

Fill every section before calling the sync phase done.

### Features already identical

- [ ] _(list)_

### Features migrated

- [ ] _(list — what moved from live patterns into testing)_

### Features intentionally redesigned

- [ ] _(list — rebuilt on HDH/`main` instead of literal port)_

### Features intentionally skipped

- [ ] Production admin command center (keep separate; migrate pieces only if they fit Owner Testing Admin)  
- [ ] July Testing Lab / foundation org stack  
- [ ] Live production Stripe / production billing wiring (use testing billing)  
- [ ] Any production data, curriculum publish, or production DB write  
- [ ] _(add others)_

### Remaining differences between Live and Testing

- [ ] _(expected remaining deltas after sync — e.g. production Stripe live vs testing simulator)_

---

## Exit criteria

- Testing contains the **complete future product** relative to live (or every gap is documented as redesigned / skipped).  
- Owner Admin on testing remains the development/admin environment.  
- **Production is unchanged** (no writes, publishes, merges, or service rewires).  
- Pre–Final QA audit confirms production untouched + no accidental feature loss.  
- Final QA treats **testing** as the single complete application under test.  
- Production is updated **only** after Final QA **and** Leah’s **written** approval.

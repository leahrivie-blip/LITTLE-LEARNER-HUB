# Phase 11 — Manual Tester Review Punch List

**Owner reviewer:** Leah  
**Environment:** Testing only — `https://little-learner-hub-testing.onrender.com`  
**Shell:** `20260808-phase11-final-qa`  
**Full audit report:** `docs/audits/PHASE11_COMPLETE_TESTING_USER_JOURNEY_AUDIT.md`  

**Automated / testing gate:** 100% PASS  
**Production approval:** **BLOCKED** — pending Leah review of audit + explicit written production approval  

---

## Review coverage (agent walkthrough + Leah)

| Area | Agent status | Leah |
|---|---|---|
| Owner Admin | ⚠️ Incomplete (access blocked for member) | ⏳ |
| Home Daycare setup | ✅ Walked | ⏳ |
| Center setup | ⚠️ Incomplete | ⏳ |
| Director / Teacher / Assistant | ⚠️ Incomplete live | ⏳ |
| Family/Guardian | ⚠️ Partial (provider side) | ⏳ |
| Child Profiles | ✅ Walked | ⏳ |
| Daily Logs | ✅ Walked (meal UX note) | ⏳ |
| Family Hub | ⚠️ Partial | ⏳ |
| Messaging | ✅ Clarity checked | ⏳ |
| Forms | ✅ Provider library/assign/AI | ⏳ |
| Tuition Billing | ⚠️ Exists but easy to miss | ⏳ |
| Calendar / Weekly Planner | ⚠️ Partial | ⏳ |
| Lesson Plans | ✅ Sampled | ⏳ |
| Complete Teaching Kits | ⚠️ HTML/print model | ⏳ |
| TK printing / downloads | ⚠️ Partial visual | ⏳ |
| AI review-before-save | ⚠️ Residual suggestion path | ⏳ |
| Mobile | ✅ Sampled ~414px | ⏳ |

---

## Punch list

| ID | Issue | Area | Severity | Reproduction steps | Fix | Test added/rerun | Status |
|---|---|---|---|---|---|---|---|
| P1 | Family tuition looks missing; lives in Home Daycare Hub, not Settings→Billing | Tuition | high | Open Settings Billing vs expect family invoices; miss HDH “Family tuition & balances” | Dedicated nav / clearer HDH labeling; keep simulated | `test:tuition-phase8` PASS (API); no discoverability test | open |
| P2 | Owner Admin not reachable from disposable member session | Owner Admin | high | Sign in as Free HDH → Admin → access denied / session sync modal | Confirm Leah admin unlock on testing; clearer entry | `test:owner-testing-admin-phase2` exists | open |
| P3 | 72 lesson plans have no cover URL in public library | Curriculum | high | Browse library; many cards without covers | Manual cover upload backlog | none | open |
| P4 | Sampled covers are tiny SVG placeholder style (faces/shapes/gradients) | Curriculum | high | Open covers listed in audit § covers B | Manual illustrated replacements; do not auto-regen now | none | open |
| P5 | Center multi-role matrix not completed in agent walkthrough | Center / Roles | high | — | Leah must complete Director/Teacher/Assistant live | role suites partial | open |
| P6 | Guardian full-day shared vs staff-only verification incomplete | Family Hub | high | Provider logs day → parent redeem → compare visibility | Complete invite/parent session QA | `test:family-hub-phase6` PASS | open |
| P7 | Daily Log AI suggestion Save can one-click share without Phase 9 review panel | AI / Daily Ops | medium | Generate Daily Log AI preview suggestion → Save / Save All | Route through `dlcAiReviewState`; default share false | Phase 9 does not cover this path | open |
| P8 | Meal form fields look empty after save while timeline retained entry | Daily Ops | medium | Save Meals “Ate all” → reopen form → placeholders show; timeline has entry | Confirm toast + rehydrate last values | needs UX test | open |
| P9 | Intermittent “Membership sync did not finish in time” modal | Stability | medium | Navigate toward Admin / some account areas | Harden sync / retry UX | none | open |
| P10 | Free vs Pro forms entitlements unclear amid 91 templates | Forms | medium | Open Forms library on Free plan | Clear Free/Pro badges / limits copy | forms-phase7 PASS | open |
| P11 | Infant age labels inconsistent across library | Curriculum | medium | Filter Infant ages | Normalize age taxonomy | none | open |
| P12 | Provider message accepts foreign householdId via sole-household soft-fallback | Messaging | medium | POST message with non-owned householdId when only one household exists | Prefer 404 when explicit id provided | cross-access probe notes | open |
| P13 | Residual `llhWeeklyPlanner` localStorage writes on non-schedule paths | Calendar | medium | Legacy planner edit/copy flows | Keep fallback-only; remove stray writes | Phase 5 schedule notes | open |
| P14 | Doc Helpers / Daily Log AI entry points easy to miss vs AI Form Builder | AI | medium | Hunt for Documentation Helpers from Home | Clearer hub cards | Phase 9 gates exist | open |
| P15 | Password reset / Early User testing marketing lightly verified | Account | medium | Homepage/pricing on testing (Stripe not ready) | Leah confirm intended testing offers | none | open |
| P16 | Lesson card click affordance / polish | Curriculum | low | Browse library | UX polish | none | open |
| P17 | Onboarding lands on Curriculum not Home | Onboarding | low | Complete Free signup | Optional post-onboarding choice | none | open |
| P18 | Multiple Start Free CTAs | Marketing | low | Homepage | Accept or reduce | none | open |
| P19 | Mixed older asset `?v=20260805` cache strings beside Phase 11 shell | Stability | low | View source | Align cache-bust when convenient | none | open |
| P20 | Nap time picker fiddly on mobile | Daily Ops / Mobile | low | Log nap on ~414px | Improve picker UX | mobile phase5 PASS | open |
| P21 | Exhaustive TK print preset PDF visual QA not finished this pass | Print | low | — | Finish preset-by-preset visual pass | print suites PASS HTML | open |
| P22 | Admin curriculum autosave race not re-proven live | Admin Curriculum | low | — | Leah reproduce delete→type→autosave | prior reports | open |

**Severity:** `blocker` · `high` · `medium` · `low`  
**Status:** `open` until Leah prioritizes fixes. **Do not auto-fix the whole list.**

---

## Counts

| Severity | Open |
|---|---|
| Blocker | 0 |
| High | 6 (P1–P6) |
| Medium | 9 (P7–P15) |
| Low | 7 (P16–P22) |

---

## Production lock

| Check | Status |
|---|---|
| Production deploy | **FORBIDDEN** |
| Automated gate 100% | ≠ production-approved |
| Production shell must remain | `20260808-cookie-cta` |

---

## Log

| Date | Note |
|---|---|
| 2026-08-08 | Punch list opened for Leah’s review. |
| 2026-08-08 | Complete testing user-journey audit filed; findings loaded as P1–P22. **STOP — no fix wave, no production deploy.** |

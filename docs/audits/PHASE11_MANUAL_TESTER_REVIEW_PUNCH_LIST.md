# Phase 11 — Manual Tester Review Punch List

**Owner reviewer:** Leah  
**Environment:** Testing only — `https://little-learner-hub-testing.onrender.com`  
**Shell (fix wave):** `20260808-phase11-fix-wave`  
**Branch:** `cursor/phase11-final-qa-fix-wave-4eae`  
**Full audit report:** `docs/audits/PHASE11_COMPLETE_TESTING_USER_JOURNEY_AUDIT.md`  
**Fix-wave report:** `docs/audits/PHASE11_FINAL_QA_FIX_WAVE_REPORT.md`

**Automated / testing gate:** 100% PASS (local suites)  
**Production approval:** **BLOCKED** — pending Leah review + explicit written production approval  

---

## Review coverage (agent walkthrough + Leah)

| Area | Agent status | Leah |
|---|---|---|
| Owner Admin | ✅ Member denial verified; live unlock **BLOCKED** without Leah credentials | ⏳ unlock |
| Home Daycare setup | ✅ Walked / suites | ⏳ |
| Center setup | ✅ Live Director→Teacher→Assistant invites on testing | ⏳ |
| Director / Teacher / Assistant | ✅ Live accept + role surfaces on testing | ⏳ |
| Family/Guardian | ✅ Live invite/redeem + no staff-only leak; Phase 6 PASS | ⏳ |
| Child Profiles | ✅ | ⏳ |
| Daily Logs | ✅ Meal UX + AI review fixed | ⏳ |
| Family Hub | ✅ Suites | ⏳ |
| Messaging | ✅ Foreign householdId → 404 | ⏳ |
| Forms | ✅ Free entitlement copy strengthened | ⏳ |
| Tuition Billing | ✅ Discoverability cross-link from Settings → Billing | ⏳ |
| Calendar / Weekly Planner | ✅ No-op planner writes | ⏳ |
| Lesson Plans (system) | ✅ Functional system only | ⏳ |
| Complete Teaching Kits (system) | ✅ Print/system suites; content deferred | ⏳ |
| TK printing / downloads | ✅ Suites; preset visual polish remains Low | ⏳ |
| AI review-before-save | ✅ Preview stages review; share opt-in | ⏳ |
| Mobile | ✅ Phase 5 mobile markers; ~390px owner recheck | ⏳ |

---

## Punch list

| ID | Issue | Area | Severity | Reproduction steps | Fix | Test added/rerun | Status |
|---|---|---|---|---|---|---|---|
| P1 | Family tuition looks missing; lives in Home Daycare Hub, not Settings→Billing | Tuition | high | Open Settings Billing vs expect family invoices | Cross-link panel on Billing + Families/Management tiles | `test:ai-review-before-save-phase9` discoverability asserts; `test:tuition-phase8` | **fixed** |
| P2 | Owner Admin not reachable from disposable member session | Owner Admin | high | Sign in as Free HDH → Admin | Intentional ACL — member denial panel (`data-admin-member-denied`); only `leahivie@icloud.com` unlocks | `test:owner-testing-admin-phase2` | **fixed** (by design + clearer UX) |
| P3 | 72 lesson plans have no cover URL in public library | Curriculum content | high→deferred | Browse library | **DEFERRED** — curriculum content/cover sync before production replacement | none | **deferred** |
| P4 | Sampled covers are tiny SVG placeholder style | Curriculum content | high→deferred | Open covers | **DEFERRED** — do not auto-regen | none | **deferred** |
| P5 | Center multi-role matrix not completed in agent walkthrough | Center / Roles | high | Live Center day | Live testing: Center signup → Teacher/Assistant invites accepted → role surfaces | `test:nav-role-experience`, `test:staff-invite-flow` | **fixed / verified on testing** |
| P6 | Guardian full-day shared vs staff-only verification incomplete | Family Hub | high | Provider logs → parent redeem | Live testing: household invite → redeem → me/today 200; no staff-only leak; Phase 6 suite PASS | `test:family-hub-phase6` | **fixed / verified on testing** |
| P7 | Daily Log AI suggestion Save can one-click share without Phase 9 review panel | AI / Daily Ops | high* | Generate Daily Log AI preview → Save | Preview → `dlcAiReviewState`; Review Draft UI; share defaults false; Save All skips preview | `test:ai-review-before-save-phase9` | **fixed** |
| P8 | Meal form fields look empty after save while timeline retained entry | Daily Ops | medium | Save Meals → reopen form | Toast + rehydrate from `__dlcLastSavedMeals` and persisted meals | `test:daily-operations-phase5` source markers | **fixed** |
| P9 | Intermittent “Membership sync did not finish in time” modal | Stability | medium | Navigate toward Admin / account | Retry + soft-degrade (`__llhMembershipSyncDegraded`); hard-fail only on definitive null | Phase 9 source asserts | **fixed** |
| P10 | Free vs Pro forms entitlements unclear amid 91 templates | Forms | medium | Open Forms library on Free | Stronger Free entitlement banner + HDH forms pack note | Forms Phase 7 + source asserts | **fixed** |
| P11 | Infant age labels inconsistent across library | Curriculum content | medium | Filter Infant ages | **DEFERRED** with curriculum content sync | none | **deferred** |
| P12 | Provider message accepts foreign householdId via sole-household soft-fallback | Messaging | medium | POST with non-owned householdId | Explicit unknown/foreign id → 404 | `test:phase11-security-cross-access` | **fixed** |
| P13 | Residual `llhWeeklyPlanner` localStorage writes | Calendar | medium | Legacy planner flows | `saveWeeklyPlanner` no-op write | `test:daily-operations-phase5` | **fixed** |
| P14 | Doc Helpers / Daily Log AI entry points easy to miss | AI | medium | Hunt from Home/Today | Hub tiles on Owner Home, Teacher Today, Classroom, Families | source + nav suites | **fixed** |
| P15 | Password reset / Early User testing marketing lightly verified | Account | medium | Homepage/pricing on testing | Stripe-off intent verified: Free/Pro CTAs on; Early User not offered; checkout rejected | founding-status + live probe | **verified on testing** (Stripe remains disabled) |
| P16 | Lesson card click affordance / polish | Curriculum | low | Browse library | Polish later | none | open |
| P17 | Onboarding lands on Curriculum not Home | Onboarding | low | Complete Free signup | Optional later | none | open |
| P18 | Multiple Start Free CTAs | Marketing | low | Homepage | Accept or reduce later | none | open |
| P19 | Mixed older asset `?v=` cache strings | Stability | low | View source | Main shell/app/styles aligned to fix-wave; older module tags remain | none | mitigated / residual |
| P20 | Nap time picker fiddly on mobile | Daily Ops / Mobile | low | Log nap ~390px | Improve later | mobile phase5 | open |
| P21 | Exhaustive TK print preset PDF visual QA not finished | Print | low | — | Finish later | print suites PASS HTML | open |
| P22 | Admin curriculum autosave race not re-proven live | Admin Curriculum | low | — | Leah reproduce delete→type→autosave | prior reports | open |

\*P7 was audited as medium; treated as **HIGH priority** in this fix wave because of the Phase 9 invariant (AI may propose; human must review).

---

## Counts (after fix wave)

| Severity | Open functional | Deferred content | Notes |
|---|---|---|---|
| Blocker | **0** code; **1 operational** | — | Owner Admin live unlock still needs Leah’s password/code |
| High functional | **0** | P3/P4 content | P5/P6 verified on live testing |
| Medium functional | **0** | P11 content | P15 Stripe-off intent verified on testing |
| Low / polish | 7 (P16–P22; P19 mitigated) | — | |

---

## Explicitly deferred — curriculum content / covers

Do **not** count these as functional launch blockers for this wave:

1. Missing / placeholder lesson covers (P3/P4)  
2. Infant age-label taxonomy cleanup (P11)  
3. Teaching Kit / lesson plan **content** upgrades  
4. Live→testing curriculum/media synchronization before production replacement  

**Rule:** Fix the curriculum **system**. Do not rewrite curriculum **content** in this wave.

---

## Production lock

| Check | Status |
|---|---|
| Production deploy | **FORBIDDEN** |
| Production env / Stripe / data | **UNTOUCHED** |
| Automated gate 100% | ≠ production-approved |
| Production shell must remain | `20260808-cookie-cta` |

---

## Log

| Date | Note |
|---|---|
| 2026-08-08 | Punch list opened for Leah’s review. |
| 2026-08-08 | Complete testing user-journey audit filed; findings loaded as P1–P22. |
| 2026-08-08 | **Final QA fix wave** on testing branch: functional High/Medium fixed or deferred; shell `20260808-phase11-fix-wave`. Production untouched. |
| 2026-08-08 | **Testing redeployed** (`dep-d9rmvvon74is73f6491g` @ `c9600e9`). Live shell `20260808-phase11-fix-wave`. Agent owner-review walkthrough: READY FOR LEAH (Owner Admin unlock + Center/guardian still Leah). Production untouched. |
| 2026-08-08 | **Final four checks:** Center PASS · Guardian/FH PASS · P15 PASS · Owner Admin BLOCKED (no agent credentials). Suites: family-hub-phase6, staff-invite-flow, nav-role-experience PASS. Final report: `PHASE11_FINAL_OWNER_REVIEW_REPORT.md`. **NOT READY FOR PRODUCTION APPROVAL.** Production untouched. Punch list remains open. |

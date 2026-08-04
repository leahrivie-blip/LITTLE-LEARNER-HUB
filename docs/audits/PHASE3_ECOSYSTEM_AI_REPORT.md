# Phase 3 — Ecosystem Integration & AI Report

**Environment:** Testing site only (`little-learner-hub-testing.onrender.com`)  
**Shell:** `20260804-ecosystem-phase3`  
**Date:** 2026-08-04  
**Decision:** **Phase 3 PASSED**  
**Ecosystem completeness:** **82 / 100**  
**Readiness score:** **84 / 100**  
**Rule:** Do not merge. Do not deploy production. Phase 1 Forms and Phase 2 Family Hub remain frozen.

Acceptance: `npm run test:ecosystem-phase3-acceptance` — PASSED  
Smoke: Phase 1 Forms (92%) and Phase 2 Family Hub (88%) — still PASSED

---

## Goal check

Little Learner Hub should feel like one connected system. Phase 3 wired the highest-value automations so providers stay inside workflows (especially Daily Logs + Enrollment + Doc Helpers) without a separate “AI destination.”

---

## Priority 1 — Connect Everything

| Chain | Status | How it connects |
|---|---|---|
| Program → Classrooms | ✅ | Schedule classrooms + Program Settings rooms |
| Classrooms → Staff | 🟡 | Staff invites + classroom filter; not full staff ops (Phase 6) |
| Classrooms → Children | ✅ | `classroomId` on Profiles; enrollment match via `resolveEnrollmentClassroom` |
| Children → Daily Logs | ✅ | Same Profiles + day stores |
| Daily Logs → Lesson Plans | 🟡 | Activities link; lessons still classroom/week-scoped |
| Daily Logs → Activities | ✅ | ActivityLogs + quick actions |
| Activities → Observations | ✅ | Same child day; AI can draft obs from note + facts |
| Observations → Forms | 🟡 | Separate Documents spine (Phase 1); not auto-created from obs |
| Forms → Family Hub | ✅ | Phase 1 share/ack; pending forms on Today |
| Family Hub → Parent Notifications | ✅ | In-app FH notifications (no SMS/email yet) |

**No duplicate child registry for ops:** Profiles remain the source of truth. Households hold invite snapshots; auto-link uses parent email match.

---

## Priority 2 — AI Everywhere (embedded, not a new page)

| Workflow | AI assist | Grounded? |
|---|---|---|
| Daily Logs → parent summary | End-of-day AI parent message + optional summary | Yes — `buildGroundedDayFactsForAi` |
| Observation | Daily Log / Doc Helper observation draft | Yes — day facts + note |
| Incident | Incident report + companion parent message | Yes — note + facts |
| Lesson Plan | Existing lesson helpers | Partial — not per-child roster |
| Child Profile / Goals | Observation → goal suggestion (HDH testing) | From observation text |
| Behavior Support | Behavior note → SupportPlans stub | Yes |
| Forms | Phase 1 AI generate / prefill paths | Frozen Phase 1 |
| Messages | Doc Helper parent-message + share checkbox | Partial — FH compose lacks “Improve wording” |

`canUseEmbeddedWorkflowAi()` unlocks these on Pro **or** HDH testing fence — no new AI page.

---

## Priority 3 — One Source of Truth

| Domain | Source of truth | Notes |
|---|---|---|
| Child profile | `Profiles` | Enrollment convert writes here |
| Attendance / meals / naps / diapers | Day stores on child | Shared to FH when `shareWithFamily` |
| Medical / emergency / pickup | Profile fields | Surfaced on FH Today |
| Forms | `Documents` + packets | Phase 1 spine |
| Observations | `Observations` | Optional FH share |
| Family Hub | Household + linked childIds | Reads provider child-data |
| Messages | FH thread vs care Communications | Intentional dual channel |

---

## Priority 4 — Child lifecycle walkthrough

| Step | Connected? | Notes |
|---|---|---|
| Inquiry | ✅ | Enrollment leads |
| Enrollment | ✅ | Convert → Profile + enrollmentDate |
| Forms | ✅ | Auto-adds HDH pack on convert (testing) |
| Classroom assignment | ✅ | Matches desired room → `classroomId` |
| Attendance | ✅ | Daily Logs / Attendance store → FH |
| Activities | ✅ | ActivityLogs → FH / AI facts |
| Observations | ✅ | → goal suggestion |
| Photos | ✅ | Auto FH notify when shared |
| Daily reports | ✅ | End-of-day AI + generate report |
| Messages | ✅ | FH + care notes bridge |
| Family Hub | ✅ | Today reflects provider day |
| Goals | ✅ | From observations (testing) |
| Incident | ✅ | AI draft + parent companion |
| Graduation / archive | 🟡 | Child `archived` exists; no dedicated graduate workflow |

---

## Priority 5 — Remaining disconnected workflows

- Lesson plans weakly tied to individual child rosters (classroom-level assignment)
- Platform support Messages ≠ Family Hub Messages (separate channels by design)
- Graduation/archive is a flag, not a lifecycle ceremony with FH notice
- Staff classroom ops incomplete until Phase 6

## Missing automations

- Provider approve/decline actions for parent absence/pickup/contact requests (visibility only)
- Push / SMS / email for notify\* settings (in-app only)
- Rename child → refresh household display name everywhere
- Archive child → revoke/soft-hide Family Hub access automatically

## AI opportunities (defer / Phase 4+)

- Lesson plan extensions from enrolled roster + recent observations
- One-tap “Improve wording” on Family Hub compose
- Forms prefill from richer medical/allergy profile fields
- Child Profile “suggest goals” button (beyond observation save path)
- Tuition messaging remains Phase 5

## Must leave LLH blockers (week simulation)

- Legal e-sign certificates (testing acknowledgment only)
- SMS/email parent delivery outside the app
- Tuition collection / bank payments (Phase 5)
- State licensing portal submissions (Phase 4)

---

## What Phase 3 shipped

- `buildGroundedDayFactsForAi` — one compiler for day facts used by AI
- `canUseEmbeddedWorkflowAi` — Pro or HDH testing
- Daily Logs end-of-day AI report + parent message UI
- Doc Helpers → Family Hub share checkbox; auto-share for parent-facing types
- Observation → Goals suggestion (`maybeSuggestGoalFromObservation`)
- Behavior note → SupportPlans; incident → report + companion parent message
- `resolveEnrollmentClassroom` + convert → classroom, guardians, forms pack, FH link
- Parent email extraction from `Name <email>` / guardians for FH auto-link
- Acceptance suite: `npm run test:ecosystem-phase3-acceptance`

---

## Scores

| Score | Value | Rationale |
|---|---|---|
| Ecosystem completeness | **82** | Core care chain + FH + forms connect; lessons/staff/archive/request-actions still gaps |
| Readiness (testing) | **84** | Week simulation runnable inside LLH for care + family loop; leave-LLH only for legal/SMS/tuition/licensing |

---

## Recommendation for Phase 4

**Begin Phase 4 — Licensing & Compliance on the testing site.**

Phase 3 is accepted for testing. Do not start tuition (Phase 5) or staff rebuild (Phase 6) until licensing workflows have a connected spine similar to Forms/Family Hub.

**Do not merge. Do not deploy production.**

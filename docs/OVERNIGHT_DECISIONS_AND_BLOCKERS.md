# Overnight decisions and blockers

**Branch:** `cursor/director-family-foundation-bc66`  
**Updated:** 2026-07-22 (Phase 17 Pricing & Family Billing Simulator)

## Decisions

### Family Hub nav — Enrollment entry (Phase 12)

**Decision:** Enrollment is accessed from **Home** (button + `tab=enrollment` / deep links such as `#family-hub?tab=enrollment`), not by replacing a bottom-nav item.

**Why:** Family Hub bottom nav stays at **max five** items and must keep **Messages** (Phase 11). Adding Enrollment as a sixth tab would break that constraint; swapping Messages out would regress messaging UX.

**Provider side:** Director Center uses a dedicated **Enrollment** tab (`data-dc-tab="enrollment"`).

### Family Hub nav — Licensing Documents Needed (Phase 14 remediation)

**Decision:** Licensing document tasks are accessed from **Home** (card shown only when the guardian has authorized tasks) and optionally **Account → More**, not a sixth bottom-nav item.

**Why:** Same max-five constraint. Complex licensing tools remain Computer Recommended on phone.

### Family Hub nav — Today (Phase 15)

**Decision:** Guardian Today is accessed from **Home** (Today card) and **Account → More** (`tab=today`), not a sixth bottom-nav item.

**Why:** Same max-five constraint; Today aggregates attendance/status already relevant on Home.

**Provider side:** Director Center dedicated **Today** tab (`data-dc-tab="today_hub"`).

### Family Hub nav — Billing (Phase 17)

**Decision:** Family Billing is accessed from **Home** (Billing card) and **Account → More** (`tab=billing`), not a sixth bottom-nav item.

**Why:** Same max-five constraint. Billing is financially sensitive and must not displace Messages.

**Provider side:** Director Center dedicated **Billing** tab (`data-dc-tab="billing"`) for platform plan simulator + family tuition overview.

### Capture scripts must assert feature markers

**Decision:** Phase 12–17 screenshot scripts fail loudly unless a unique `data-feature-marker` is visible, and refuse the marketing homepage. Views must use `.active-view` to become visible.

### Ratio wording (Phase 15)

**Decision:** Always label ratios as **provider-configured** guidance. Never claim universal state compliance.

### Billing money representation (Phase 17)

**Decision:** Store all tuition and platform-sim amounts as **integer cents**. Never use floating-point for stored money. Corrections are append-only ledger adjustments.

### Downgrade safety (Phase 17)

**Decision:** Simulated plan downgrades show over-limit classrooms/staff and required actions; they never silently delete classrooms, staff, children, records, forms, or history.

## Permissions notes (no `docs/PERMISSIONS*` file)

Enrollment permissions live in API gates (`server/enrollment-api.js`, Family Hub enrollment handlers + Phase 8 access rules):

| Actor | Enrollment access |
|-------|-------------------|
| Director / owner | Full pipeline + conversion |
| Assistant | Denied by default |
| Teacher | Denied unless limited grant; offer/priority needs offer grant |
| Curriculum Only | Denied |
| Guardian (digital/full) | Own cases / checklist / testing offer respond only |
| Pickup-only / emergency-only | Denied digital enrollment |
| Other orgs | Never listed / 404-style denial |

Family views never expose internal notes, waitlist priority rules, other applicants, capacity guidance, or confidential decline reasons.

Licensing family tasks: digital guardians only; pickup-only / restricted → 403; wrong-child / cross-org remain denied.

### Today Hub / attendance / ratio (Phase 15)

| Actor | Today Hub access |
|-------|------------------|
| Director / owner | Org-wide dashboard, attendance actions, ratios, all aggregated tasks |
| Lead teacher | Assigned classrooms only; attendance + classroom tasks |
| Assistant | Assigned classrooms; `check_in` / `mark_absent` / group-log only unless overrides grant more; medical/allergy only with medical override |
| Curriculum Only | Curriculum Today view only; attendance/ratios/ops → 403 |
| Guardian (digital) | Own children’s attendance status + family tasks via `/api/family-hub/today` |
| Restricted / pickup / emergency | No digital Today tasks (empty or 403 per existing access rules) |
| Cross-org | Attendance/actions denied |

Attendance history is append-only. Ratio history preserved on classroom transfers/actions.

### Staff Experience (Phase 16)

| Actor | Staff Hub access |
|-------|------------------|
| Director / owner | Directory, invite (plan limits), onboarding, schedule publish, coverage assign, private notes, offboarding, reports |
| Lead teacher / assistant | Self-service only: own schedule, clock, time-off, training, permission summary |
| Teachers/assistants | Cannot open staff directory, private notes, or other personnel records |
| Cross-org | Profile/actions denied |

Time clock history is append-only. Coverage suggestions never auto-move staff. Payroll/banking/external notifications stay OFF.

## Attendance / ratio / staff documentation

- Statuses: expected, checked_in, absent, late, temporarily_out, moved_classroom, checked_out, early_pickup  
- Fields: timestamps, classroom, actor, drop-off/pickup person, pickup verification, correction reason, edit history  
- Ratio config: `maxChildrenPerStaff`, `nearLimitThreshold`, age/classroom label  
- Disclaimer constant: provider-configured rules — not universal compliance  
- Phase 16 clock status syncs into Today Hub `staffDuty` for coverage/ratio  

Implementation: `scripts/today-hub-data-model.js`, `server/today-hub-api.js`, `scripts/staff-experience-data-model.js`, `server/staff-experience-api.js`.

## Safety / still OFF

- No Stripe enrollment checkout  
- No public production inquiries  
- No outbound email/SMS/push  
- Production Family Hub locked  
- No payroll / banking / tax reporting  
- No staff scheduling external notifications  

## Blockers / audit remediation

**Phase 12–14 remediation completed 2026-07-22** — see `docs/PHASE_12_14_REMEDIATION_COMPLETION_REPORT.md`.

**Phase 15 completed 2026-07-22** — see `docs/PHASE_15_TODAY_DAILY_OPERATIONS_COMPLETION_REPORT.md`.

**Phase 16 completed 2026-07-22** — see `docs/PHASE_16_COMPLETE_STAFF_EXPERIENCE_COMPLETION_REPORT.md`.

**Phase 17 completed 2026-07-22** — see `docs/PHASE_17_PRICING_FAMILY_BILLING_SIMULATOR_COMPLETION_REPORT.md`.

**Do not begin Phase 18** until Phase 17 is verified on the branch tip.

## Phase 14 notes

- Generic testing pack only — not verified state law.
- Readiness wording: "Ready based on configured checklist" — never universal "compliant".
- Inspection packets are read-only, time-limited, revocable, audited.
- Phone shows Computer Recommended for complex licensing tools (**application UI**, not screenshot injection).

## Phase 15 notes

- Today Hub is the daily operations entry point for role-scoped urgent work.
- In-app notifications only; admin-only notifications stay director-scoped.
- Deferred: staff scheduling (delivered in Phase 16), billing (delivered in Phase 17), external delivery.

## Phase 16 notes

- Staff Hub is computer-first for directory/schedule/permissions; phone focuses on My Staff Hub clock/schedule.
- Private performance notes never appear in directory, Family Hub, or classroom views.
- Deferred: payroll, tax, banking, external notifications.

## Phase 17 notes / permissions

- Platform subscription simulator: primary billing owner (Curriculum Only may view own catalog/subscription only).
- Provider family billing: owner/director or `billingManager`; teachers/assistants denied by default.
- Family Hub Billing: financially responsible guardians (`FULL_VERIFIED_GUARDIAN` or `BILLING_ONLY`); pickup/restricted denied.
- Cross-organization access always rejected. Financial access audited separately.
- Attendance suggestions never auto-bill. Enrollment acceptance never processes payment.
- Stripe products/prices/checkout untouched; `DISABLE_STRIPE_CHECKOUT=true`.
- Deferred: live Stripe seat billing, real family payment processors, Phase 18.

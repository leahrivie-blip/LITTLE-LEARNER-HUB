# Overnight decisions and blockers

**Branch:** `testing/full-platform-integration-2026-07` (continuation after integration checkpoint)  
**Phase 20 backup:** `backup/director-family-phases-1-20`  
**Frozen feature branch:** `cursor/director-family-foundation-bc66`  
**Updated:** 2026-07-22 (Classroom Assistant prioritized and polished; Phase 22 — Role-Based Layout, Navigation, Dashboards, and Settings — complete)

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

**Decision:** Phase 12–18 screenshot scripts fail loudly unless a unique `data-feature-marker` is visible, and refuse the marketing homepage. Views must use `.active-view` to become visible.

### Testing Lab access (Phase 18)

**Decision:** Testing Lab uses its own expansion flag `testingLab` + `ALLOW_TESTING_LAB_ADMIN_PREVIEW` + verified admin. It is not nested solely under Director Center so production can reject the lab independently.

**Decision:** Actual Fake Login (password issue once) and Quick Role Preview are both required — preview for UI checks, fake login for end-to-end auth. Passwords are never committed, logged, or screenshotted.

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

**Phase 18 completed 2026-07-22** — see `docs/PHASE_18_TESTING_PREVIEW_LAB_COMPLETION_REPORT.md`.

**Phase 19 completed 2026-07-22** — see `docs/PHASE_19_ACCESSIBILITY_PERFORMANCE_RELIABILITY_COMPLETION_REPORT.md`.

**Phase 20 completed 2026-07-22** — see `docs/PHASE_20_SECURITY_MIGRATION_RELEASE_READINESS_COMPLETION_REPORT.md`.

**Testing-only full platform integration checkpoint completed 2026-07-22** — see `docs/TESTING_FULL_PLATFORM_INTEGRATION_COMPLETION_REPORT.md`. Continuation branch: `testing/full-platform-integration-2026-07`. Backup: `backup/director-family-phases-1-20`.

**Phase 21 completed 2026-07-22** — see `docs/PHASE_21_PROVIDER_PRODUCTIVITY_CHILD_LED_PLANNING_COMPLETION_REPORT.md`.

**Classroom Assistant foundation started 2026-07-22** (new highest priority from provider feedback) — see `docs/CLASSROOM_ASSISTANT_PRIORITY.md`, `docs/CLASSROOM_ASSISTANT_FOUNDATION_COMPLETION_REPORT.md`, `docs/CLASSROOM_ASSISTANT_SCOPE_EXPANSION_COMPLETION_REPORT.md`, and `docs/CLASSROOM_ASSISTANT_POLISH_COMPLETION_REPORT.md`.

**Phase 22 completed 2026-07-22** (role-based layout, navigation, dashboards, and Settings redesign) — see `docs/PHASE_22_ROLE_BASED_UX_NAVIGATION_SETTINGS_COMPLETION_REPORT.md`. Known limitation carried into Phase 23: Curriculum Only is still a reserved (non-persistent) account type/plan — `resolveExperienceRole()` correctly resolves it when the account object holds it directly, but the existing, deliberate `migrateAccountAccessFields()` boot migration and `normalizeBillingPlan()` reset any unrecognized `accountType`/`plan` value back to `home_daycare`/`Free` on every login, so a real signed-in session can never persist it today — exercise the Curriculum-Only experience via a direct account object (tests) or a future onboarding/pricing project (`docs/FUTURE_ONBOARDING_PRICING.md`), not via Testing Lab role-preview alone. Never merge to `main` / never deploy production from this checkpoint.

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
- Deferred: live Stripe seat billing, real family payment processors.

## Phase 18 notes / permissions

- Testing Lab: verified admin only; production always rejects.
- Fake accounts remain `@example.invalid`; passwords issued once and never stored in fixtures.
- Role preview does not mutate stored admin role; expires and exits cleanly.
- Resets validate fake organization + test host before destructive actions.
- Checklist notes stay on the testing organization only.
- Deferred: owner-approved Phase 20+ work.

## Phase 19 notes / permissions

- Shared a11y/perf/resilience helpers are foundations — not WCAG certification.
- Expansion UIs lazy-load via `platform-perf.js`; core app.js remains eager.
- Testing Lab Health + fake backup/restore: fake organizations only; production backup/restore never available.
- Draft recovery refuses cross user/org/child/classroom/record restores; secrets stripped from logs.
- Failed-save metadata is sanitized (no passwords, tokens, message bodies, medical content).
- Deferred: full screen-reader certification, every legacy modal focus-trap migration, cloud draft sync beyond Lab simulation.

## Integration checkpoint notes (2026-07-22)

- `origin/main` (`204fa01`) was already an ancestor of Phase 20 tip — merge was a no-op; **zero conflicts**.
- Shell cache busters aligned to `20260722-full-int` / `llh-shell-v109-full-int` so main PWA + Phase tip assets stay consistent.
- Production remains untouched; testing deploy is **manual owner step** only (no agent Render hook).
- Deferred: Phase 22, production migration, merge to main.

## Phase 20 notes / permissions

- Security review is a Testing Lab checklist + rate limits — not formal certification.
- Migration simulator: fake organizations only; inspect/preview/confirm/rollback; production rejects.
- Release Readiness is computer-first; phones show status summary only.
- Integration plan documented in `docs/TESTING_SITE_INTEGRATION_PLAN.md` — executed as testing-only checkpoint; see `docs/TESTING_FULL_PLATFORM_INTEGRATION_COMPLETION_REPORT.md`.
- Deferred: real production migration, pen test, merge to main, Phase 22+.

## Phase 21 notes / permissions

- Planning preference personalizes shortcuts only — lesson plans remain optional and never permanently hidden.
- Child-led suggestions are local catalog only (`liveAiUsed: false`); provider review required before save.
- Universal search omits denied domains entirely (no titles/counts leaked).
- Guided setup: home daycare skips center-only staff step; Skip / Save and continue later supported.
- Notification prefs keep outbound email/SMS/push forced off in testing.
- Deferred: live AI generation, real camera OCR, production deploy, Phase 22 (paused).

## Classroom Assistant notes / permissions (2026-07-22)

- Natural-language notes parse locally only (`liveAiUsed: false`); preview then confirm apply.
- Group meal/activity/nap writes target **checked-in** children only unless a child is named.
- Named exceptions update only that child.
- Admin lesson-plan paste requires review before save.
- Goal: eliminate repetitive per-profile data entry — “describe what happened” first.
- **Phase 22 addition:** offline queue is now scoped by signed-in identity **and** organization (`llh-ca-offline-queue::{email}::{orgId}`, previously org-only) — logging out on a shared device purges any queued-but-unsynced entries so the next person to sign in can never see them.
- Deferred: live AI upgrade, cover art generation, deeper Family Hub write-through, Phase 23.

## Phase 22 notes / permissions (2026-07-22)

- **Navigation is UX curation only — never a security boundary.** `syncRoleAwareNavGrouping()` only decides whether an *already-capability-permitted* nav-link renders in the "Core" vs. "More Tools" section; `canAccessCapability()` / `canAccessPlatformFeature()` (unchanged) remain the only real access gate, enforced the same way before and after Phase 22.
- Connected several already-built, already-capability-gated pages (Classrooms, Families, Enrollment, Staff & Permissions, Billing, Reports, Forms & Enrollment, Resources) into the main sidebar for the first time — they previously existed and worked but were only reachable via Settings Hub cards (or not at all for Classrooms/Families/Enrollment). No new backend surface was added; `test-platform-nav.js` was updated to assert the new (intentional) visibility instead of the old permanently-hidden state.
- Director Center / Teacher Classroom / Classroom Assistant / Forms Center remain **admin-preview + fake-org gated at the API level** (pre-existing, unrelated to Phase 22 — confirmed via `server/classroom-assistant-api.js` / `server/today-hub-api.js` `assertAccess`, which reject any request without `allowDirectorCenterAdminPreview` + a verified admin + a fake preview org). They intentionally stay out of the main sidebar for real accounts, since surfacing them there would just produce a 401/403 — reached via Testing Lab / Admin Preview as before.
- New "Today" dashboard (Needs Attention / Today / Recent / Favorites / Quick Actions) is built entirely from data already loaded client-side (schedule cache, favorites, recently-viewed, notification unread count) — no new backend endpoint. Default landing view for logged-in users remains **Calendar** (unchanged) to avoid destabilizing the many existing tests that assert Calendar-as-landing; Today is a new primary nav item, not a forced redirect. Promoting Today to the default landing is a Phase 23 candidate once broader regression coverage exists for that change.
- Settings Hub redesign preserves every existing capability check; grouping/search is presentation-only. Cancel Subscription remains a real card (`data-view="cancel-subscription"`) inside "Billing and Subscription", discoverable via the new search box.
- Family Hub's Phase 11 decision (Messages replaces Calendar in the 5-item bottom nav; Calendar lives under Account) was deliberately **kept as-is** rather than reverted to match this phase's literal Guardian-nav wording — reverting a shipped, tested, documented nav decision across many later phases' tests was judged higher-risk than the reordering is worth; flagged for an explicit owner decision before any change.
- Device rules: added a shared "💻 Best on a computer" note (`renderManageSurfaceShell({ computerRecommended: true })`) to Classrooms, Families, Enrollment, and Staff & Permissions — consistent with the existing `.en-computer-recommended` / `.th-computer-recommended` pattern from earlier phases.

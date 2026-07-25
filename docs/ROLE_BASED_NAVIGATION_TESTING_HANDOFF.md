# Role-Based Navigation & Testing-Account Experience — Handoff Report

Branch: `cursor/director-family-foundation-bc66`
Status: **Not merged into main. Not deployed to production. No production data touched.**

## 0. What this branch is now

`cursor/director-family-foundation-bc66` was, before this task, a pure ancestor of `testing/full-platform-integration-2026-07` (no commits of its own beyond the shared history — confirmed with `git merge-tree`, zero conflicts). The first step of this task merged `testing/full-platform-integration-2026-07`'s tip into this branch, bringing in Phases 21–23 (Provider Productivity, role-based nav curation, platform walkthrough) plus this cycle's testing infrastructure: AI Testing, Testing Feedback, External Tester Sandbox, the Home Daycare Pilot connected sandbox, and the Fast Daily Logs classroom-grid redesign (with group logging, medication safety, corrections, and the photo-sharing bridge). This merge was clean (no conflicts) and is the foundation the rest of this task builds on. **`main` and production were never touched by this merge or anything else in this task.**

## 1. What was built in this task

### a) `/api/pilot/*` now serves ANY testing account, not only External Tester Sandbox

Previously, the connected Families/Daily-Care-linked-parent/Messages/Forms/Billing/Photos data surface (`server/home-daycare-pilot-api.js`) only worked for accounts created through the External Tester Sandbox wizard. This was the single biggest blocker to "the home daycare and parent views must be fully available for testing, not placeholders" for the OTHER roles this task asks for (center director, center teacher, a plain home daycare owner, a real parent fixture).

`resolveActor()` now recognizes **any** Testing Lab fake account (`store.familyFoundation.fakeAccounts`, any `kind`) and resolves her as a "provider" (any non-guardian role) or "parent" (any guardian role) for **her own** organization — the same server-side isolation guarantees as before (organization/child scoping, cross-organization rejection, never trusting a client-supplied id) now apply uniformly to every fixture account, not only pilot-sandbox ones. Verified with a live test: `phase8.owner@example.invalid` (a plain Phase 8 fixture, not a sandbox account) can add/list children via `/api/pilot/children`; `priya.lin@example.invalid` (a real fixture guardian) sees her real linked children via `/api/pilot/parent-home` — with zero code duplication.

### b) Daily Care ↔ Families connected-data bridge (fixes a real disconnected-data bug)

While testing, we found that a Home Daycare Pilot/connected account's children lived in **two different storage layers**: the server-side Families/Pilot data (`store.childRecords`) and the browser's own local Daily Care store (`localStorage` `childStore("Profiles")`). Without a bridge, Families showed the wizard-created children while Daily Care showed an empty classroom — exactly the "disconnected data" failure mode this task explicitly warns against.

`syncPilotChildrenIntoLocalStore()` (`app.js`) now mirrors server-side children into the account's own local Daily Care store — additive and idempotent (never removes/overwrites a locally-edited profile, never duplicates on repeat visits), running on boot and whenever Daily Care is opened for a connected account. Verified end to end with a real browser: children created via the wizard/Families now appear immediately in Daily Care; a child added on either screen shows up on both; revisiting Daily Care repeatedly never duplicates a card.

### c) Home Daycare owner + one staff member (shared organization)

New `addStaffMember()`/`applyStaffMemberIdentity()` (`scripts/home-daycare-pilot-data-model.js`) and `POST /api/external-tester/add-staff-member` (admin-only) create ONE additional, single-role (`assistant`/`home_daycare`) fake login scoped to the **same** organization as an existing owner — she shares the exact same connected children/guardians/updates/messages/forms/billing, with no ownership or admin capability, and cannot call any admin-only Testing Lab route with her own session. This is deliberately simpler than the Center staff experience (no classroom scheduling, no center-wide management), matching the request.

### d) Testing banner text updated

`#testingIdentityBannerText` now reads exactly: **"TESTING ACCOUNT — FAKE DATA — NO REAL PAYMENTS OR MESSAGES"** (was "LITTLE LEARNER HUB TESTING — FAKE DATA ONLY"). Shown on every non-production host, for every account — confirmed in the captured screenshots. The role-specific second line ("CURRENTLY VIEWING AS: ...") is unchanged and still works.

### e) Test accounts — all 5 roles + admin, none are placeholders

| Role | How to get a login | Notes |
|---|---|---|
| **Admin** | Existing `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_ACCESS_CODE` env vars | Unchanged |
| **Home daycare owner (complete)** | Testing Lab → Accounts → **"Add External Tester — Home Daycare Pilot"** wizard | Creates an isolated org + owner login + N starting children/guardians in one action; fully connected (Families ↔ Daily Care ↔ Parent Home all show the same data) |
| **Home daycare staff (optional, 1 max)** | `POST /api/external-tester/add-staff-member` with the owner's `organizationId` (new Testing Lab UI hook not yet added — see Known Limitations) | Shares the owner's org; `assistant`/`home_daycare` |
| **Center director** | Testing Lab → Accounts → seed the `small_center` (or `growing_center`) scenario → `phase8.director@example.invalid` → Issue password | Pre-existing Phase 8 fixture; now ALSO gets connected `/api/pilot/*` access for her org |
| **Center teacher** | Same seed → `phase8.teacher@example.invalid` → Issue password | Pre-existing Phase 8 fixture (`lead_teacher`) |
| **Parent/Guardian (connected to real children)** | Same seed → `priya.lin@example.invalid` (2 children) or `frank.cole@example.invalid` (1 child) → Issue password | Real Family Foundation guardian fixtures with genuine access rules — Family Hub (Phase 9) and the generalized `/api/pilot/parent-home` both work for her |

**No password is ever a fixed/static string** — every password is generated fresh at issuance time (`Issue password` in Testing Lab, or the wizard's one-time display) and shown exactly once, by design (the same "never view a previously issued password again" guarantee as every other testing account in this app). The exact account emails above ARE the "test account switcher" for this branch: any admin can open Testing Lab, seed a scenario, and issue a login for any of these five roles + the pre-existing admin account in under a minute. A dedicated one-click UI switcher button was not built in the time available — see Known Limitations.

## 2. Test results

```
npm run check                                   → all files syntax-clean
npm run test:role-navigation-testing-accounts   → 8/8 passed (NEW)
npm run test:daily-care-families-sync-bridge    → 3/3 passed (NEW)
npm run test:fast-daily-logs                    → 9/9 passed
npm run test:fast-daily-logs-safety             → 11/11 passed
npm run test:fast-daily-logs-visual             → 5/5 passed
npm run test:home-daycare-pilot                 → 14/14 passed
npm run test:home-daycare-pilot-ui              → 4/4 passed
npm run test:external-tester-sandbox            → 15/15 passed
npm run test:phase22-role-navigation            → 10/10 passed
```

The two new suites directly cover this task's required acceptance areas: role navigation for a non-sandbox fake account, program-level isolation across organizations, parent-child access restricted to a guardian's own linked children, home daycare staff limits (shared org, no admin capability), Daily Care quick-entry on connected data, and the Daily Care/Families sync bridge (no disconnected or duplicated data).

## 3. Screenshots

`docs/screenshots/role-navigation/`:
- `1-home-daycare-owner-desktop.png` — Daily Care classroom grid, desktop, testing banner visible
- `2-home-daycare-families-desktop.png` — Families panel (add child/guardian, permissions), desktop
- `3-home-daycare-owner-mobile.png` — Daily Care classroom grid, mobile — shows the SAME children as Families (sync bridge working)
- `4-parent-desktop.png` / `4-parent-mobile.png` — Parent Home, showing the exact update/form/billing the owner entered

## 4. Known limitations (explicit, not silent)

This request describes a very large, multi-week navigation redesign (5 full role experiences, dozens of named sub-sections). Within the time available, this pass focused on making the **connected-data foundation genuinely real** for every role (the repeated, explicit core requirement — "not placeholders") rather than attempting every individual sidebar/sub-section reorganization in the full specification. Specifically **not** done in this pass:

- **Exact sidebar ordering/labels per the full spec** (e.g., a literal "Daily Care" label replacing "Daily Logs", a dedicated "Curriculum" group, "Forms & Documents" as a single consolidated top-level section, collapsible groups). The EXISTING Phase 22 `NAV_PRIMARY_VIEWS_BY_EXPERIENCE` role curation and the Fast Daily Logs / Home Daycare Pilot nav curation remain as they were; they were not re-ordered to match the request's exact numbered lists.
- **Center Director advanced tools**: classroom-to-child/staff assignment, classroom movement history, ratios/capacity — these live in the pre-existing, admin-preview-only Director Center/Staff Experience/Enrollment systems (Phases 8–21) and were not extended to work from a director's own (non-admin) fake-account session in this pass, beyond the generalized `/api/pilot/*` Families/Daily-Care/Messages/Forms/Billing surface.
- **Teacher "assigned children only" filtering**: Daily Care currently shows every child in the organization to any provider-role account (owner/director/teacher/assistant alike). Filtering to a teacher's own classroom/roster assignment would need a classroom-membership lookup this pass did not build.
- **Forms & Documents comprehensive search/filter by child/staff/type/status/date/classroom**: the pilot's Forms feature remains the simple assignment+status model built for the Home Daycare Pilot (title + needs-action/complete), not the full Forms Center template/signature system (which remains admin-preview-only, unchanged).
- **Curriculum grouping, Reports section, Settings reorganization**: not restructured in this pass; existing core-app Lesson Plans/Activities/Calendar/Reports/Settings screens are unchanged and still reachable.
- **A dedicated one-click "Test Account Switcher" UI button** (as opposed to the documented Testing Lab flow above) was not built — Testing Lab's existing account list + "Issue password" + "Quick Role Preview" already function as the practical switcher, and are admin-only / never appear in production, satisfying the safety requirement even without new UI chrome.
- **Health & Emergency Information, Enrollment, Attendance as their own dedicated Children sub-screens**: the core app's existing Child Profile tabs (Overview, Attendance, etc.) and the Home Daycare Pilot's Families panel cover child/guardian data; a fully separate "Children" section with all five named sub-views was not built as a distinct nested UI in this pass.

None of the above are safety or isolation gaps — every verified guarantee (organization isolation, child isolation, admin-surface separation, no real payments/email/SMS/AI calls) holds for all the new connected functionality. They are scope/breadth gaps in the FULL navigation-reorganization spec, honestly reported rather than silently skipped, consistent with how every other phase of this project has been handed off.

## 5. Feature flags (unchanged, confirmed correct)

- `familyHub`, `formsCenter`, `directorCenter` remain gated exactly as before (`ALLOW_*_ADMIN_PREVIEW`/`ALLOW_FAMILY_HUB_TESTING_PREVIEW` env vars + stored flags + non-production host). This task did not loosen any of these gates.
- The NEW generalized `/api/pilot/*` access is its own, already-existing, already-isolated surface (organization-scoped, `@example.invalid`-only, production-locked) — it does not touch or bypass the Family Hub/Forms Center/Director Center flags.

## 6. Safety confirmation

- **`main`**: untouched. This entire task, including the initial merge, only ever committed to `cursor/director-family-foundation-bc66`.
- **Production**: never deployed to; every new/changed route explicitly rejects a production `SITE_URL` (verified by existing and new tests).
- **Production data**: never touched — all new data is either in-memory/local-JSON test-store or an isolated Neon testing database, per the existing `activeDatabaseUrl()` resolver.
- **No real payments, email, SMS, or live AI calls** anywhere in this diff (grepped for `stripe`, `resend`, `sendEmail`, `sendSms`, `twilio`, `openai` across every changed file — zero matches beyond pre-existing, unrelated code).
- PR was **not** created/merged for this branch as part of this task, per the explicit "do not merge" / "do not deploy" instructions — this branch is pushed and ready for review.

For the exact test-account emails and how to issue their passwords, see `docs/ROLE_BASED_NAVIGATION_TEST_ACCOUNTS_INTERNAL.md` (kept separate so this report can be shared without repeating the account list).

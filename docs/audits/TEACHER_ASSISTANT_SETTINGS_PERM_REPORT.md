# Teacher/Assistant Settings Permission Failures — Investigation & Fix

**Branch:** `cursor/teacher-assistant-settings-perm-9026`  
**Base:** `cursor/family-hub-testing-readiness-d3df` (testing only)  
**Rule:** Draft PR only — do not merge/deploy without approval. Do not touch `main` / production.

## The six failures (pre-fix)

| # | Role | Route / section | Expected (stale test) | Actual | Classification | Customer/security impact | Files |
|---|---|---|---|---|---|---|---|
| 1 | Teacher | Desktop → Settings nav | Visible Settings sidebar → open hub | Settings nav hidden (`settings` capability false) | **Stale test** vs intentional deny of Settings for Teacher/Assistant | Low if denied (correct). Medium if Settings were openable with billing | `index.html` legacy nav `data-nav-capability="settings"`; `app.js` `roleAllowsCapability("settings")`; `scripts/test-pass3-permission-matrix.js` |
| 2 | Teacher | Desktop → Settings billing | Open Settings; no billing card; “Billing managed by owner” | Cascading fail: no Settings link to click | **Stale test path** (denial is correct; assertion shape wrong) | Same | same |
| 3 | Teacher | Phone → Settings nav | Same as #1 | Same as #1 | **Stale test** | Same | same |
| 4 | Teacher | Phone → Settings billing | Same as #2 | Same as #2 | **Stale test path** | Same | same |
| 5 | Assistant | Desktop → Settings nav | Same as #1 | Same as #1 | **Stale test** | Same | same |
| 6 | Assistant | Desktop → Settings billing | Same as #2 | Same as #2 | **Stale test path** | Same | same |

### Intended current permission model (proven)

Teachers/Assistants must **not** access the Settings hub, billing, staff management, program administration, subscription controls, or feature-flag surfaces.

They **may** use **Account** for personal profile / sign-out. Account copy states billing is managed by the program owner.

This matches Phase 1 nav (Settings limited to owner/director) and client `canOpenViewForCurrentAccess` / `roleAllowsCapability` for `settings`.

## Genuine defects found (fixed)

| Defect | Impact | Fix |
|---|---|---|
| `renderAccountPage` called undefined `roleLabel()` for linked staff → throw before hiding Upgrade CTA | Teachers/assistants with `linkedProgramOwnerEmail` saw **Upgrade to Pro** on Account | Use `roleDisplayLabel()` (`app.js`) |
| `program-settings` / `plans` / `upgrade` / etc. deep-links not blocked for Teacher/Assistant | Client-side URL/`setView` could open program admin surfaces | Expand blocked view set in `canOpenViewForCurrentAccess` |
| `scripts/account-access.js` still granted `settings` to all roles | Server/shared matrix out of sync with client | Align: settings = owner/director only |
| Billing Checkout/Portal lacked role denial | Linked staff could reach Stripe paths before infrastructure errors | `userMayManageBilling()` → 403 `billing_owner_only` before Stripe |
| Pass3 expected Teachers to open Settings | Forced a weaker/incorrect UX model | Assert Settings **hidden** + deep-link denial + Account-only (not weaken to skip checks) |

## Authenticated session verification

`npm run test:role-settings-auth-matrix` — real `/api/auth/password-login` sessions for Owner / Director / Teacher / Assistant (not View As).

| Check | Owner | Director | Teacher | Assistant |
|---|---|---|---|---|
| Password login | PASS | PASS | PASS | PASS |
| Settings nav | Visible | Visible | Hidden | Hidden |
| Billing capability / portal+checkout API | Allowed (Stripe gate) | **403** | **403** | **403** |
| Staff invites API | Allowed | Allowed | **403** | **403** |
| `program-settings` deep link | Allowed | Allowed | Denied | Denied |
| Account Upgrade/Manage Billing CTA | Visible | Hidden | Hidden | Hidden |

Screenshots: `/opt/cursor/artifacts/role-settings-auth-matrix/screenshots/`  
Denial shots: `/opt/cursor/artifacts/overnight-stabilization/pass3/settings-denied-*.png`

## Exact fixes (files)

- `app.js` — Account `roleDisplayLabel` crash fix; hide billing notify for non-billing roles; block Teacher/Assistant deep links to program/billing admin views
- `scripts/account-access.js` — `settings` capability owner/director only
- `server/index.js` — `userMayManageBilling` + Checkout/Portal 403
- `scripts/test-pass3-permission-matrix.js` — assert intentional Settings denial for Teacher/Assistant
- `scripts/test-role-settings-auth-matrix.js` — authenticated role matrix (new)
- `package.json` — `test:role-settings-auth-matrix`
- `docs/audits/TEACHER_ASSISTANT_SETTINGS_PERM_REPORT.md` — this report

## Permission matrix result

**176/176 PASS** (`npm run test:pass3-permission-matrix`)

## Post-fix smoke (Settings PR not deployed)

### Local disposable (this branch)

| Suite | Result |
|---|---|
| `npm run check` | PASS |
| `test:pass3-permission-matrix` | **176/176** |
| `test:role-settings-auth-matrix` | PASS (password sessions + API 403s) |
| `test:nav-role-experience` | PASS |
| `test:daily-logs-attendance` | PASS (15/15) — check-in/out, second session, meal/nap/diaper/activity/note, group, reports draft |
| `test:child-data-durable-queue` | PASS — offline/retry, conflict UI, mobile conflict, logout unsynced, account/program isolation |

Disposable users/invites removed from temp stores after auth-matrix run.

### Live testing site (Phase 1–2 only; Settings fix **not** deployed)

| Check | Result |
|---|---|
| Commit | `0bafecd` on `cursor/family-hub-testing-readiness-d3df` |
| Health | ok; `homeDaycareHubTesting: true` |
| Work nav / Daily Logs markers | Present (desktop + phone) |
| Settings work-nav roles | `owner,director` only |
| Teaching Kit customer flags | Off (`404 teaching_kit_disabled`) |
| Console / network (guest) | None (excluding intentional TK probe) |

Guest screenshots: `live-testing-guest-desktop.png`, `live-testing-guest-phone.png`

## Deploy / Phase 3

| Question | Answer |
|---|---|
| Phase 1–2 ready for manual review on testing site? | **Yes** (already deployed); this Settings hardening is a follow-up draft |
| Merge/deploy this fix? | **NO** until owner approval |
| Phase 3 GO/NO-GO | **NO-GO** until you finish manual review of Phase 1–2 and approve this Settings PR |

Production / `main` / Stripe keys / Teaching Kit customer flags / production data: **untouched**.

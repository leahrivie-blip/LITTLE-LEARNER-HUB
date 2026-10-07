# Testing Center + View As — Verification Report

**Scope:** Testing site only (`HOME_DAYCARE_HUB_TESTING`). No production deploy. No merge.  
**Branch:** `cursor/testing-center-verify-d3df`  
**Acceptance:** `npm run test:testing-center-verify` → **29/29 passed**  
**Also green:** `npm run test:permissions-privacy-phase3`, `npm run check`

---

## Exact steps — add a tester

1. On the **testing site**, sign in as the program owner (or unlock **Admin** as Leah).
2. Open **Home Daycare Hub** (or the Hub invite panel).
3. In **Invite a tester (own account + own kid)**:
   - Enter the tester’s email
   - Optional: starter child name (default “Demo Child”)
   - Tap **Invite tester**
4. Copy the **accept link** (email may be off on testing — share the link manually).
5. Tester opens the link → signs up / logs in with **that exact email** → taps **Accept invite**.
6. Tester lands in their **own** Teacher sandbox with **Testing Pro**, a starter child, and **no Admin**.

---

## Exact steps — switch between views (View As)

1. Unlock **Admin** (owner email + password + access code).
2. Open **Admin → Admin Testing Center**.
3. Under **View As (roles)**, tap **Owner**, **Director**, **Teacher**, **Assistant**, or **Parent**.
4. Sidebar, home/landing, and role chrome update immediately (no logout).
5. Tap **Return to Admin** (or **Admin** in View As) to restore full Admin powers.
6. View As selection persists across **refresh** while the Admin session remains valid.

---

## What each role can see

| Role | Can see |
|---|---|
| **Admin** (unlocked) | Admin nav, Testing Center, View As, plan sandbox, seed tools, feedback center, full analytics |
| **Owner** | Work home, children, classroom, families, business, settings, staff invites, billing |
| **Director** | Owner-like ops (staff, families, classrooms) **without** billing |
| **Teacher** | Today / classroom / assigned children / families (scoped), messages — **no** staff mgmt, **no** billing, **no** Admin |
| **Assistant** | Today / classroom / children / messages — **no** staff mgmt, **no** billing, **no** Admin |
| **Parent** | **Family Hub** parent surface only (View As opens Family Hub parent persona) |
| **Independent tester** (invite accept) | Own Teacher sandbox + Testing Pro + starter child; **Messages → Message Leah** |

## What each role cannot see

| Role | Cannot see |
|---|---|
| **Normal testers / staff** | Admin, Testing Center, View As, tester invite tools, other testers’ children/programs |
| **Teacher / Assistant** | Billing, staff management, Admin |
| **Director** | Billing (owner-only) |
| **Parent** | Provider work nav, Admin, billing, unrelated classrooms |
| **Independent tester** | Inviter’s kids; Admin; creating further tester invites (UI + API) |
| **Disabled account** | Login (server 403 + client local fallback blocked) |

---

## Where messages appear

- **Tester → Leah:** normal **Messages → Message Leah** (not Admin).
- **Tester feedback / admin feedback:** **Admin → Feedback** (`adminFeedbackApp`), separate from parent/provider message threads.
- Parent Family Hub messaging stays on the Family Hub side; not mixed into Admin Testing Center.

---

## Issues found and fixed

1. **Tester invite API open to any authenticated email**  
   Teachers (and any non-manager) could `POST/GET/DELETE /api/home-daycare-hub/tester-invites`.  
   **Fix:** require `canManageStaffInvites` (owner/director) on list/create/revoke.

2. **Independent invited testers could still invite others via API**  
   Accept flow writes them as `role: owner` + `hdhIndependentTester`. UI hid the panel; API did not.  
   **Fix:** reject invite manage when `hdhIndependentTester === true`.

3. **Disabled accounts could still log in via local password fallback**  
   Server returned disabled; client fell back to `passwordHash`.  
   **Fix:** in `loginWithProvider`, never local-fallback when server says disabled; also block local `accountStatus === Disabled`.

---

## Verification matrix (automated)

| # | Check | Result |
|---|---|---|
| 1 | Admin/owner add tester (one API flow) | PASS |
| 2 | Tester gets Testing Pro at no cost | PASS |
| 3 | Testing Pro ≠ role elevation; no Admin | PASS |
| 4 | View As Owner/Director/Teacher/Assistant/Parent | PASS |
| 5–9 | Role nav + capability fences (fresh + View As) | PASS |
| 10 | Switch back to Admin; no leak | PASS |
| 11 | Disabled cannot login | PASS |
| 12 | Direct admin/tester-invite APIs blocked server-side | PASS |
| 13 | Tester messages → Message Leah | PASS |
| 14 | Feedback stays in Admin surface | PASS |
| 15 | Logout + View As refresh persistence | PASS |
| 16 | Seed/starter child connected for tester sandbox | PASS |

---

## Readiness

- **Ready for 3 testers: Yes**
- **Ready for 10 testers: Yes**  
  (Independent sandboxes — each invite creates a private program + starter child; no shared child leakage between testers.)

### Notes for operators

- Share **accept links** manually when email is not configured on the testing service.
- View As is an **Admin session simulation**; always **Return to Admin** before doing owner ops.
- Parent View As uses Family Hub **persona** (not a separate `parent` capability role enum); confirm UI shows Family Hub and parent chrome.
- Disable testers from Admin membership when a trial ends — login is blocked client + server.

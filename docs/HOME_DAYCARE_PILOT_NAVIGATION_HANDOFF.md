# Home Daycare Pilot Navigation — Handoff (testing only, not merged/deployed)

**Branch:** `cursor/director-family-foundation-bc66`
**Draft PR:** [#324](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324) → base retargeted to `testing/full-platform-integration-2026-07` (was `main`)
**Status:** Draft, not merged, not deployed. Stopping for owner review per instructions.

This is a **scoped completion of the Solo Home Daycare Provider navigation only** — it is explicitly **not** a full role-navigation redesign. See "Known limitations / explicitly deferred" below.

---

## 1. Branch safety confirmation

- Fetched `origin/testing/full-platform-integration-2026-07` and `origin/cursor/director-family-foundation-bc66`.
- `testing/full-platform-integration-2026-07` **has not moved** since it was merged into this branch. Its tip (`679bd68a38a4db4b8275dae8aa9109f7b532976c`) is exactly the merge-base with this branch — zero commits exist in the testing branch that aren't already here.
- Commits unique to this branch (after the merge point), in order:
  1. `b08c57d` — merge of `testing/full-platform-integration-2026-07` into this branch (brought Phases 21–23 forward; no conflicts)
  2. `722bab1` — generalize connected pilot data + staff member + banner (prior turn)
  3. `f3da110` — acceptance-criteria tests + sync bridge test (prior turn)
  4. `ddc6572` — docs: handoff report + internal test-account guide + screenshots (prior turn)
  5. *(this turn's commits — see the "Files changed" section and final commit SHA below)*
- Diff scope vs. `testing/full-platform-integration-2026-07`: only `app.js`, `index.html`, `styles.css`, `server/home-daycare-pilot-api.js`, `scripts/home-daycare-pilot-data-model.js`, `server/index.js` (one field added to the login response), new test/screenshot-capture scripts, `package.json` (+scripts), and new screenshots/docs. No unrelated code.
- Since the merge-base equals the testing branch's own tip, **no Phase 1–20 code is being reintroduced** — this branch is a strict superset of the testing branch.
- Checked `gh pr list --base testing/full-platform-integration-2026-07 --state open`: **no other open PRs** target that branch — no risk of overwriting another in-flight PR's changes.
- PR #324 (previously a stale `main`-targeted placeholder titled "Draft: Director / Forms / Family foundation through Phase 20") was **retargeted** to `testing/full-platform-integration-2026-07` and its title/body updated, rather than opening a duplicate PR for the same branch.

---

## 2. What was built this turn

### 2.1 Exact Solo Home Daycare Provider navigation

A **dedicated** sidebar block (`#pilotProviderNav` in `index.html`) — not a patch of the generic capability-based `#platformNav` — shown *instead of* it whenever the account is a connected Home Daycare Pilot owner, with the exact requested grouping:

- **Primary:** Today, Children, Daily Care, Families, Messages, Forms & Enrollment, Calendar, Billing
- **Planning:** Classroom Assistant, Lesson Plans, Activities
- **More:** Documents & Records, Reports, Staff *(dynamic label — see 2.2)*, Program Settings, Account & Subscription, Help & Testing Feedback

Screenshot: `docs/screenshots/home-daycare-navigation/1-owner-sidebar-desktop.png`.

**Phone bottom navigation** (`#pilotBottomNav`, new component): Today, Children, Log, Messages, More — the "More" button opens a bottom sheet with every Planning + More item plus Testing Feedback. Screenshot: `docs/screenshots/home-daycare-navigation/2-owner-phone-bottom-nav-more-sheet.png`.

### 2.2 Staff visibility (owner + one optional assistant)

- The **owner** herself (no admin needed) can add exactly **one** staff member via a self-service "Add your assistant" form on the Staff page (`POST /api/pilot/staff`). The nav label reads **"Add Assistant"** until one exists, then **"Staff"**.
- A second staff-add attempt is rejected server-side with `409 staff_limit_reached`.
- The staff member gets her own real temporary-password login, sharing the owner's organization/child roster.

### 2.3 Home Daycare Staff view — simplified nav + server-side enforcement

A **separate** dedicated sidebar (`#pilotStaffNav`) is shown for a staff login (`role: "assistant"`, `accountType: "home_daycare"`):

- **Visible to staff:** Today, Assigned Children, Daily Care, Messages, Forms & Tasks, Calendar, Classroom Assistant, Lesson Plans, Activities, My Staff Profile (read-only), Account Settings, Testing Feedback.
- **Never visible to staff (client-side nav absent, and independently enforced server-side):** Families, Billing, adding another staff member, full Program Settings. Admin, Testing Lab, AI Outcomes, and feature flags remain structurally unreachable — a staff member only ever holds a member session token, never an admin token.

Server-side (`server/home-daycare-pilot-api.js`): every actor resolved from a Home Daycare fake account now carries an `isOwner` flag (`true` for the owner/External Tester Sandbox account, `false` for a `home_daycare_staff` account). The following endpoints now require `actor.isOwner`, returning `403 owner_only` otherwise — **enforced even if the staff member calls the API directly, bypassing the UI entirely**:
- `GET/POST /api/pilot/guardians`, `PUT /api/pilot/guardians/access` (Families)
- `GET/POST /api/pilot/billing` (program billing / family balances)
- `POST /api/pilot/staff` (hiring another staff member)
- `GET /api/pilot/change-request` (parent change requests)

`GET /api/pilot/staff` also now filters to the caller's own row when she is not the owner ("other staff's private records" are never returned to a staff member, even though today there is only ever one).

Screenshot: `docs/screenshots/home-daycare-navigation/3-staff-sidebar-desktop.png`.

**Automated test:** `scripts/test-home-daycare-staff-restrictions.js` (17 checks) — covers the one-staff-member limit, staff CAN/CANNOT matrix server-side (both directions), Admin/Testing Lab structural unreachability, and the client-side sidebar assertion.

**Known limitation — "unassigned children if assignments are being used":** this build does not yet have a per-child staff-assignment concept; a Home Daycare's single staff member currently sees the full (small) child roster, which is a reasonable default for a solo home daycare with one assistant, but per-child assignment/filtering is not implemented. Flagging explicitly per instructions.

### 2.4 Parent/Guardian navigation

A dedicated `#pilotParentNav` sidebar plus phone bottom nav (Home, My Child, Messages, Forms, More):

- **More:** Calendar, Documents *(shares the Forms & Documents surface — see limitation below)*, Billing & Receipts (financially-responsible-only, already enforced), Authorized Pickups, Emergency Information, Change Requests, Account & Security, Testing Feedback.
- **New:** `GET /api/pilot/child-contacts` — read-only, returns only the pickup/emergency contacts for the parent's own linked child (never another family's), sourced from the existing guardian access-rule flags (`isAuthorizedPickup`, `isEmergencyContact`).
- **New:** `POST /api/pilot/change-request` + owner-only `GET /api/pilot/change-request` — a parent can ask the provider to update emergency/pickup info; this **creates a request the owner reviews**, it never edits the record directly (matching "permitted to [request changes to]").

Screenshot: `docs/screenshots/home-daycare-navigation/4-parent-phone-bottom-nav.png`.

**Known limitation:** "Documents" in the parent's More menu currently points at the same Forms surface (`pilot-forms`) rather than a dedicated documents list — there is no separate "documents" data concept in the pilot model yet, only Forms and (separately) shared Photos.

### 2.5 A cross-login connected-data gap found and fixed

While building the connected-data walkthrough test (below), a real gap surfaced: **Fast Daily Logs' underlying store is per-browser-login `localStorage`**, so the owner and her staff member — two different logins sharing one organization — would each have had their own disconnected copy of "today," even though the org/children are shared. This is now bridged:

- `appendChildRecord()` (in `app.js`) mirrors every Daily Care record a connected pilot account creates to a new server-side endpoint (`POST /api/pilot/daily-care-entries`), best-effort/fire-and-forget, keyed by the record's own id.
- `syncPilotDailyCareEntriesIntoLocalStore()` pulls every mirrored entry for the organization and merges it into the local store on load — additive and idempotent (matched by id, never duplicates, never overwrites a local edit).
- This is what makes "staff logs an observation, owner sees it immediately" (and vice versa) actually true rather than a placeholder.

Also fixed: the real password-login response (`server/index.js`) did not previously include `organizationId`, so a generic (non–External-Tester-Sandbox) connected fake account's browser never actually recognized itself as a connected testing account after a normal login — only after admin-preview paths. Both the server response and the client's `updateAccount()` call now carry it.

### 2.6 A pre-existing nav-scoping bug found and fixed (real regression, now covered by tests)

Adding the new dedicated nav blocks (`#pilotProviderNav`, `#pilotStaffNav`, `#pilotParentNav`) exposed a latent bug in the **existing, unrelated** Phase 22 role-navigation code: `syncRoleAwareNavGrouping()` used an unscoped `document.querySelector(".nav-section-core")` (and `'[data-nav-section="more"]'`) to decide where to re-parent already-permitted nav buttons. Because the new pilot nav blocks reused the same `.nav-section-core` class and appear earlier in the DOM, `#platformNav`'s own "Today"/"Calendar"/"Daily Logs"/"Child Profiles"/"Settings"/"Forms" buttons were being physically moved into the (hidden) pilot nav container for **any non-pilot account whose primary-view set included them** — e.g. a real `lead_teacher`/`assistant` account. This broke `scripts/test-phase22-role-navigation.js` (confirmed failing before the fix, passing after) and would have broken real teacher/assistant navigation on any host once these nav blocks were deployed, **regardless of whether that account had anything to do with the Home Daycare Pilot**.

**Fix:** both selectors are now explicitly scoped to `#platformNav` (`app.js`, `syncRoleAwareNavGrouping()`). Full regression re-run below confirms no other similar unscoped-selector issue exists.

---

## 3. Connected-data walkthrough (Section 5 of the request)

New test: `scripts/test-home-daycare-connected-walkthrough.js` — a real-browser, real-server, end-to-end walkthrough of the exact scenario requested:

1. Admin creates a Home Daycare Pilot tester through the real Testing Lab wizard.
2. Owner adds a new fake child through the real Families screen.
3. Owner creates and links a guardian (financially responsible) to that child.
4. Owner adds the optional staff member (self-service, no admin needed).
5. **Staff** logs an observation for that same child through the real Daily Care screen.
6. **Owner** sees the staff-logged entry immediately — same connected timeline (this is the cross-login sync fix above, verified end-to-end).
7. Owner shares the entry with the parent (a real family update).
8–9. Tester switches to Parent/Guardian; Parent Home shows the exact shared entry.
10. Parent replies through the real Messages screen.
11. Owner sees the parent's reply in the same connected thread.
12. **Full server restart** (not just a page refresh) — every record (child, guardian, update, message reply, and a Testing Feedback thread) is still present exactly once, and the feedback thread reaches the Admin inbox.

Device coverage: the owner's setup (add child, add guardian) is verified once on desktop, then the **same connected data** (not re-created) is confirmed reachable with zero console errors at tablet (820×1180) and phone (390×844) sizes — proving it's genuinely connected data, not per-device fixtures.

Result: **12/12 checks passed**, three times in a row (confirmed stable, not flaky) after fixing a few test-only selector issues (see commit history) — all real product-code fixes are described above; the remaining iterations were fixing the test script itself.

Screenshots: `docs/screenshots/home-daycare-connected-walkthrough/1-owner-families-connected.png`, `2-staff-daily-care-desktop.png`, `3-parent-sees-shared-entry-desktop.png`.

---

## 3b. Daily Care storage architecture — pre-merge review findings and fixes

Before merging PR #324, the owner asked for an explicit confirmation of 10 storage-architecture properties. Investigating them honestly surfaced **real gaps in the code committed above**, which are now fixed and tested (all in the same PR, before merge):

| Requirement | Before this fix | After this fix |
|---|---|---|
| Server/Neon is the authoritative source | Local write was final; server mirror was fire-and-forget with no retry — a failed POST was silently dropped forever | Server is reconciled as authoritative: every write is queued and retried until confirmed; a pull always takes the server's value for any record this browser doesn't have unsynced local work on |
| localStorage is only an offline queue/cache | Local was the permanent, only copy if the mirror POST ever failed | Local is the write-buffer: records are saved locally immediately (so nothing is ever lost, even offline), then pushed to the server, and re-pulled/reconciled on every sync pass |
| On reconnect, queued entries sync idempotently | No reconnect/retry logic existed at all | `syncPilotDailyCareEntriesIntoLocalStore()` now flushes every locally-pending record on each call (boot, opening Daily Care, or any pilot nav refresh) |
| Each entry has a permanent unique id/idempotency key | `` `${key}-${Date.now()}` `` — **a real bug**: Group Logging calls `appendChildRecord` synchronously in a loop for several children, so two different children's records could get the exact same id within the same millisecond | `generateChildRecordId()` uses `crypto.randomUUID()` (with a safe fallback), collision-proof regardless of loop timing, never regenerated on retry |
| Owner/staff cannot create duplicates by retrying | Not actually exercised (no retry existed) — but the server-side upsert-by-id was already correct | Verified directly: 5 concurrent retries of the same idempotency key resolve to exactly one server entry |
| Server records win during reconciliation without silently deleting unsynced work | The pull step was purely additive — it never updated an existing local record with a newer server version (so a correction made on one login was invisible to the other), and had no concept of "unsynced" to protect anyway | Pull now updates any local record that is **not** marked pending with the server's version, while a pending (unsynced) record is left completely untouched — never overwritten, never deleted |
| Logout clears identity-specific cached information | `pilotState` and `pilotStaffNavCache` were plain module-level variables never reset on `signOut()` — a second tester logging in on the same page (no reload) could momentarily see the previous tester's organization data | `signOut()` now resets `pilotState`, `pilotStaffNavCache`, and `externalTesterSandboxState` |
| One organization cannot read another's entries | Already true for reads (`resolveActor()` scopes every query to the caller's own `organizationId`, never a client-supplied value) — but the server's storage **key** for an entry was only `` `${storeKey}:${record.id}` ``, not org-scoped, an unnecessary (if astronomically unlikely with the new UUID ids) cross-org collision risk | Storage key is now `` `${organizationId}:${storeKey}:${record.id}` `` — cross-org collision-proof by construction, in addition to the existing read-side isolation |
| Corrections preserve history | Already true locally (`applyChildRecordCorrection` appends to a `corrections[]` array and keeps `originalTime`/`originalNotes`) | Unchanged — and now this correction is also pushed to the server as part of the same fix, so the history travels with every synced copy |
| Restart/redeploy retains the records | Already true (the mirror lives in the same JSON/Postgres-backed `store` object) | Re-verified after all of the above changes, including that a correction made before a restart is what survives it (not the stale pre-correction value) |

**Where this lives:** `app.js` — `saveChildStore()` is the single chokepoint every Daily Care write already went through (new entries, in-place updates like attendance check-out, undo, and corrections), so hooking the sync there (`pilotSyncDailyCareChangesIfNeeded`, `pilotQueueDailyCareSync`, `pilotSetRecordPendingSyncFlag`, `pilotPushDailyCareEntry`, rewritten `syncPilotDailyCareEntriesIntoLocalStore`) covers every write path with no per-call-site wiring. `scripts/home-daycare-pilot-data-model.js` — `addDailyCareEntry()`'s storage key is now organization-scoped.

**New tests:**
- `scripts/test-daily-care-server-authoritative-sync.js` (6 checks, server-contract level): permanent id + idempotent retry, a 5-way concurrent retry storm resolving to one entry, a correction updating in place with history intact, cross-org read AND write isolation (including a same-id write attempt from a different org), and restart/redeploy retention of the corrected value.
- `scripts/test-daily-care-offline-queue-and-corrections-sync.js` (4 checks, real browser): an entry logged with the network actually blocked (`page.route(...).abort()`) is saved locally and marked pending, then flushes to the server exactly once on reconnect (verified via a fresh, independent login); a correction made after syncing reaches the staff member's next sync; logging out clears the in-memory pilot cache.

Both suites pass, alongside the full regression list below (re-run after these fixes).

## 4. Full regression run (this turn)

| Suite | Result |
|---|---|
| `test-home-daycare-pilot-ui.js` | 4/4 pass |
| `test-home-daycare-connected-walkthrough.js` (new) | 12/12 pass |
| `test-home-daycare-staff-restrictions.js` (new) | 17/17 pass |
| `test-daily-care-server-authoritative-sync.js` (new) | 6/6 pass |
| `test-daily-care-offline-queue-and-corrections-sync.js` (new) | 4/4 pass |
| `test-role-navigation-testing-accounts.js` | 8/8 pass |
| `test-daily-care-families-sync-bridge.js` | 3/3 pass |
| `test-external-tester-sandbox.js` | 15/15 pass |
| `test-phase22-role-navigation.js` | 10/10 pass (was failing before the nav-scoping fix in 2.6) |
| `test-fast-daily-logs.js` | 9/9 pass |
| `test-fast-daily-logs-visual.js` | 5/5 pass |
| `test-fast-daily-logs-safety.js` | 11/11 pass |
| `npm run check` (syntax, all key files) | pass |
| `npm run test:homepage-smoke` | pass (desktop + mobile) |

No Stripe, email, SMS, or OpenAI calls occur anywhere in this work — Home Daycare Pilot billing remains fake/local records only (`noRealPaymentProcessed`), and Testing Feedback never sends outbound email.

---

## 5. Known limitations / explicitly deferred (per instructions — not attempted this turn)

- **Center Director navigation** (Classrooms, expanded Staff directory, program-wide filters) — deferred, not touched.
- **Center Teacher filtering** (assigned-classroom-only views) — deferred, not touched.
- **Full Forms Center organization** (Forms Dashboard, Built-In Template Library, AI Form Builder, separate Program/Child/Staff/Enrollment Forms sections) — the pilot's "Forms & Enrollment"/"Forms & Tasks"/"Documents" nav items all currently point at the same single connected Forms surface (`pilot-forms`), not the full Forms Center information architecture.
- **Photo/event features that don't yet exist**: there is no dedicated "Documents" data concept for the parent (see 2.4), and Calendar events are the existing generic Calendar, not a pilot-specific event feed.
- **Per-child staff assignment** (see 2.3) — a Home Daycare's staff member sees the whole (small) roster; assignment-based filtering is not implemented.
- **"Emergency information the guardian is permitted to edit"** — currently read-only + change-request (see 2.4); direct guardian editing of emergency info was not implemented this turn.

---

## 6. Files changed this turn

- `index.html` — new `#pilotProviderNav`, `#pilotStaffNav`, `#pilotParentNav` sidebar blocks; new `#pilotBottomNav`/`#pilotBottomNavMoreSheet`; two new view containers (`view-pilot-staff`, `view-pilot-parent-contacts`).
- `app.js` — nav-swap logic (`refreshHomeDaycarePilotNav`, `pilotIsStaffNow`), phone bottom nav (`renderPilotBottomNav`, `pilotBottomNavMoreItemsHtml`), staff page (`renderPilotStaffPage`/`loadPilotStaffPage`), parent contacts page (`renderPilotParentContactsPage`/`loadPilotParentContactsPage`), cross-login Daily Care sync (`syncPilotDailyCareEntriesIntoLocalStore`, `appendChildRecord` mirror), organizationId adoption on login, and the `syncRoleAwareNavGrouping()` scoping fix.
- `styles.css` — phone bottom nav + "More" sheet styles.
- `server/index.js` — password-login response now includes `organizationId`.
- `server/home-daycare-pilot-api.js` — `isOwner` on every resolved actor; new endpoints (`/api/pilot/staff`, `/api/pilot/daily-care-entries`, `/api/pilot/child-contacts`, `/api/pilot/change-request`); owner-only gating on Families/Billing/staff-add/change-requests.
- `scripts/home-daycare-pilot-data-model.js` — daily-care-entry mirror, child-contacts lookup, change-request storage.
- `scripts/test-home-daycare-connected-walkthrough.js` (new), `scripts/test-home-daycare-staff-restrictions.js` (new), `scripts/capture-home-daycare-nav-screens.js` (new), `scripts/test-daily-care-server-authoritative-sync.js` (new), `scripts/test-daily-care-offline-queue-and-corrections-sync.js` (new).
- `package.json` — new test scripts.
- `docs/screenshots/home-daycare-navigation/`, `docs/screenshots/home-daycare-connected-walkthrough/` (new screenshots).

---

## 7. Confirmations

- **Main/production untouched.** All work is on `cursor/director-family-foundation-bc66`; nothing was merged into `main`; no production deploy performed or requested.
- **No Stripe, email, SMS, or OpenAI calls** occurred during this work or its tests (verified — all billing records are `testingOnly`/fake, Testing Feedback has no outbound email path, Classroom Assistant/AI Outcomes remain disabled/admin-preview-only).
- **PR #324 remains draft**, base retargeted to `testing/full-platform-integration-2026-07`, not merged.

Stopping here for owner review, as instructed.

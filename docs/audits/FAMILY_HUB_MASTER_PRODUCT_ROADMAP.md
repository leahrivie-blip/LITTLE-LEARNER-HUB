# Family Hub Master Product Roadmap (Testing Site)

**Date verified:** 2026-08-03  
**Scope:** Testing website only — https://little-learner-hub-testing.onrender.com  
**Production:** not modified · not deployed · Family Hub remains 404 there  
**Lens:** Product owner (what parents/providers experience), verified against the live testing host + open PRs  

---

## Executive answer (Phase 7 first)

| Question | Answer |
|----------|--------|
| Ready for internal testers? | **No — not yet.** Foundation invite works, but parent dashboard often sticks on loading, data isn’t durable, and almost none of the daily parent value (reports/photos/messages) is visible. |
| Ready for childcare providers (as a parent product)? | **No.** Providers can create invites in Hub, but parents don’t get a trustworthy experience back. |
| Ready for parents? | **No.** |
| Overall Family Hub % complete (vs vision) | **~18–22%** of the envisioned parent product. **~55–60%** of a “invite + status review” technical foundation. |
| What I’d build next | **(1)** Deploy PR #451 to testing only + fix durable DB. **(2)** Make parent Today feed work (reports/photos already shared by providers). **(3)** Parent-only shell. Then invite 2–3 internal parents. |

**Score to share with stakeholders:** **3 / 10 for parent beta** on what is *currently deployed*. PR #451 would lift that to ~5 / 10 after durable storage is fixed — still not outside-parent ready.

---

## Phase 1 – Current state (verified)

### What is currently deployed on the testing site

Verified live (shell `20260803-nuo-onboarding-r4`, app `20260803-teaching-kit-qa`):

| Area | Deployed? | Evidence |
|------|-----------|----------|
| `HOME_DAYCARE_HUB_TESTING` ON | Yes | `/api/health` |
| Family Hub listed in HDH features | Yes | `features` includes `family-hub` |
| Provider invite panel (email/phone/children) | Yes | Hub UI + invite create succeeded |
| Magic link `/?familyHub=` accept panel | Yes | Walkthrough |
| 6-digit login code created | Yes | Invite result showed code |
| `/api/family-hub/me` returns children + form snapshot | Yes | Redeem → me API (2 children, 1 document) |
| Parent UI after accept | **Broken in practice** | Stayed on “Loading your household…” while `/me` returned 200 |
| Stripe on testing | Off | `stripeCheckoutReady: false` |
| Email on testing | Off | `supportEmailReady: false` |
| Database durable | **No** | `database.ready: false`, path `/tmp/llh-testing-store.json` |
| Production Family Hub | Off | `404` on production |

### What exists only in PRs (not deployed)

| PR | What it contains | On testing site? |
|----|------------------|------------------|
| **#451** `cursor/family-hub-testing-readiness-d3df` | Loading timeouts/error states, durable-storage gate, parent-only chrome, Coming Soon placeholders, second guardian field, seed demo, `shareWithFamily` on `/me`, storage endpoint | **No** — shell still `nuo-onboarding-r4`, no `family-hub-ready`, no seed button, no `/api/family-hub/storage` JSON |
| **#449** `cursor/family-hub-beta-audit-d3df` | Audit doc + audit script only | N/A (docs) |

Deployed markers checked in live `app.js`: **no** `family-hub-parent-mode`, **no** preview banner, **no** seed demo, **no** AbortController around household load, **no** guardian email field.

### Completely working (on deployed testing)

- Testing fence vs production  
- Provider creates household invite (magic URL + code)  
- Multi-child selection on invite  
- Magic-link accept panel (preview household/children)  
- Server session mint + `/me` payload (children + invite-time documents)  
- Copy magic link / copy code in provider UI  
- Revoke API exists (not re-walked this session; covered in prior suite)  
- “Switch to Parent view” tester control (provider-side)

### Partially working

- **Parent dashboard** — API can succeed; UI often never leaves Loading  
- **Forms status** — snapshot at invite time only; “Review only”; no open/sign  
- **Invite delivery** — create works; email/SMS do not send (manual copy required)  
- **Multiple children** — linked on invite; parent UI is a flat list when it loads  
- **shareWithFamily on provider side** — flags exist in provider tools; **not shown to parents** on deployed `/me` (`shared` key absent)  
- **Tester parent preview** — exists but mixes teacher chrome into parent experience  

### Placeholders only

- Homepage “Family Hub · Testing” marketing card  
- Program Settings → Family Hub Settings checkboxes (“Coming Soon”)  
- AI draft “Send later (Family Hub)” (does not send to parents)  
- Digital signature settings checkbox (not wired to parents)

### Don’t exist yet (on testing or in undeployed PRs as full products)

Messaging, calendar, attendance, announcements, notifications/push, videos, albums, e-sign/download/history, goals/milestones/assessments product, password recovery for parents, structured emergency contacts, parent account signup, grandparent roles, offline mode.

---

## Phase 2 – Vision comparison (deployed testing site)

Legend: **Complete** · **Partial** · **Missing**  
(Marks reflect **what a parent can do on the live testing site today**, not what’s in undrafted PRs.)

### Parent Dashboard

| Feature | Status | Notes |
|---------|--------|-------|
| Home | 🟡 Partial | Household label + note when load works; often stuck Loading |
| Child overview | 🟡 Partial | Names only; no profiles/medical/pickup |
| Daily reports | ❌ Missing | Provider can mark shared; parent feed not deployed |
| Photos | ❌ Missing | Same |
| Videos | ❌ Missing | |
| Calendar | ❌ Missing | |
| Messages | ❌ Missing | |
| Forms | 🟡 Partial | Status rows only; Review only |
| Documents | 🟡 Partial | Same as forms snapshot |
| Emergency contacts | ❌ Missing | May appear only as a document title |
| Attendance | ❌ Missing | |
| Announcements | ❌ Missing | |
| Notifications | ❌ Missing | |

### Parent Daily Reports

| Feature | Status |
|---------|--------|
| Meals / Naps / Diapers / Potty / Activities / Notes / Photos | ❌ Missing on parent portal (provider logging exists separately) |

### Messaging

| Feature | Status |
|---------|--------|
| Parent ↔ teacher | ❌ Missing |
| Attachments | ❌ Missing |
| Read receipts | ❌ Missing |
| Notifications | ❌ Missing |

### Forms

| Feature | Status |
|---------|--------|
| Sign forms | ❌ Missing |
| View forms | 🟡 Partial (status label only) |
| Download forms | ❌ Missing |
| Form history | ❌ Missing |

### Child Progress

| Feature | Status |
|---------|--------|
| Observations | ❌ Missing for parents (PR #451 would show shared ones) |
| Goals | ❌ Missing |
| Milestones | ❌ Missing |
| Shared assessments | ❌ Missing |

### Calendar

| Feature | Status |
|---------|--------|
| Events / Closures / Holidays / Classroom events / Reminders | ❌ Missing |

### Photos

| Feature | Status |
|---------|--------|
| Albums / Permissions / Downloads / Privacy product | ❌ Missing (provider share toggles only) |

### Accounts

| Feature | Status |
|---------|--------|
| Multiple guardians | 🟡 Partial — one household login today; second guardian field only in PR #451 |
| Invitations | 🟡 Partial — create + magic link/code; no email |
| Magic links | ✅ Complete (accept flow works) |
| Password recovery | ❌ Missing (re-invite only) |
| Wrong-child protection | 🟡 Partial — server scopes to household childIds; no live media ACL |

---

## Phase 3 – Beta readiness blockers

### Critical (block any tester invite)

1. **Parent dashboard Loading hang** on deployed testing (UI stuck even when `/me` returns 200).  
2. **Non-durable data** (`database.ready=false`, `/tmp` store, memory-only risk) — invites/sessions can vanish.  
3. **No daily parent value** — reports/photos/messages not visible → testers will say “there’s nothing here.”  
4. **PR #451 not deployed to testing** — readiness fixes aren’t live.  
5. **Email invites off** with no polished handoff on deployed UI (copy codes exist, but process is operator-dependent).

### High

6. Parent still sees pricing CTA + tester switcher (feels like a broken provider app).  
7. Forms are review-only with no clear “preview only” parent framing on deployed UI.  
8. Document status frozen at invite time.  
9. No seeded demo household on deployed site.  
10. No parent help / “ask your provider for a new link” recovery UX beyond raw errors.

### Medium

11. Second guardian support not deployed.  
12. Program name on accept panel can show generic “Little Learner Hub program.”  
13. Settings Family Hub toggles are misleading placeholders.  
14. Cookie/Meta analytics banner on private invite links.  
15. Mobile vertical clutter from tester chrome.

### Nice to have

16. Push notifications, offline, dark mode, albums, video, calendar, attendance, e-sign, goals/milestones.

---

## Phase 4 – Test like a parent (walked on live testing)

| Step | What happened | Confusing? |
|------|---------------|------------|
| Receiving an invitation | No email. Provider must copy magic link/code. | **High** — not how parents expect invites |
| Creating an account | Parents don’t create LLH accounts. Invite-only household login. | **High** — site signup is for providers |
| Logging in | Magic link accept works; email+code exists. After accept, UI stuck on Loading. | **Critical** |
| Viewing today’s report | Not available. Shared report never appears. | **Critical** |
| Viewing photos | Not available. | **Critical** |
| Viewing forms | Only if dashboard loads — status “Review only,” can’t open/sign. | **High** |
| Sending a message | Doesn’t exist. | **Critical** for vision |
| Viewing calendar | Doesn’t exist. | High vs vision |
| Logging out | Couldn’t reliably reach sign-out because dashboard never left Loading. | High |

**Confusing moments (verified)**
- Parent lands in a provider marketing shell ($19.99 CTA).  
- Tester switcher (Teacher / Staff / Parent) appears in parent context.  
- Accept panel works, then endless “Loading your household…”.  
- Provider marked photos/reports shared — parent sees nothing.  
- No distinction between “testing preview” and unfinished product on deployed UI.  
- One login for whole household is fine — but never explained as the product model up front for real parents.

---

## Phase 5 – Internal tester checklist (must complete before invites)

| # | Description | Priority | Effort | Dependencies |
|---|-------------|----------|--------|--------------|
| 1 | Fix durable storage on Render testing (Neon URL **or** disk + non-`/tmp` path) | Critical | Ops / config | Render access |
| 2 | Deploy PR #451 **to testing service only** (not production) | Critical | Deploy config | #1 preferred first |
| 3 | Confirm `/api/family-hub/storage` → `durable: true` on testing | Critical | 15 min | #1–2 |
| 4 | Confirm parent magic-link leaves Loading and shows children/forms | Critical | 30 min | #2 |
| 5 | Confirm parent-only shell (no pricing CTA / no tester switcher for pure parents) | High | 30 min | #2 |
| 6 | Run Seed demo household; save parent + guardian codes in a tester sheet | High | 30 min | #1–2 |
| 7 | Verify shared report + photo appear on parent `/me` after provider shares | High | 1–2 hrs | #2 + provider sync to server child-data |
| 8 | Document email-off handoff (copy link/code) for facilitators | High | 30 min | None |
| 9 | Walk expire + revoke + invalid invite; confirm friendly errors | High | 1 hr | #2 |
| 10 | Mobile smoke (iPhone-width): accept → home → forms → sign out | High | 1 hr | #2 |
| 11 | Write 1-page “What testers will see / won’t see” for parents | High | 1 hr | Product |
| 12 | Confirm production still 404 for Family Hub after testing deploy | Critical | 15 min | #2 |
| 13 | Provider regression: Hub invite, child profiles, daily logs still work | High | 1–2 hrs | #2 |
| 14 | Console/error pass on parent path (no red errors) | Medium | 30 min | #2 |
| 15 | Second guardian login with same code | Medium | 30 min | #2 |
| 16 | Decide beta framing: “status + shared updates preview” vs wait for messaging | Medium | Decision | Product |
| 17 | Optional: turn on testing email (Resend) for real invite mail | Nice | Ops | Resend key |

---

## Phase 6 – Beta roadmap (testing site only)

### Sprint 1 – Required before internal testing

**Goal:** A parent can open an invite and immediately understand today’s preview without getting stuck.

1. Durable testing database / store  
2. Deploy readiness PR (#451) to testing only  
3. Loading / error states live  
4. Parent-only chrome + “testing preview” banner  
5. Seeded demo household  
6. Shared reports + photos + observations visible when marked Share With Family  
7. Facilitator checklist + tester one-pager  
8. Production fence re-verified  

**Exit criteria:** 2 internal adults can complete invite → view household → see at least one shared update → sign out, without help from an engineer.

### Sprint 2 – Required during beta (while small group tests)

**Goal:** Enough daily loop that feedback is about product, not breakage.

1. Reliable invite email **or** rock-solid manual handoff tooling  
2. Basic announcements / one-way provider → parent notes (lightweight; not full chat if needed)  
3. Live form status (not invite snapshot only)  
4. Clear form preview (view details even without e-sign)  
5. Multi-guardian invites polished  
6. In-app “what’s new today” empty states with sample content  
7. Privacy QA (household isolation)  
8. Feedback channel (“Message Leah” / form)

### Sprint 3 – After beta feedback

**Goal:** Move toward real parent beta / childcare pilot.

1. Parent ↔ teacher messaging (+ attachments later)  
2. Notifications (email first, push later)  
3. Calendar (closures/holidays/events)  
4. E-sign / return forms  
5. Attendance view  
6. Photo albums + download + permissions  
7. Progress (goals/milestones) sharing  
8. Account recovery  
9. Only then consider a wider parent beta — still testing-gated, not production

---

## Phase 7 – Recommendation & next build

### Is testing ready for internal testers?
**No.** Invite plumbing exists, but the parent experience is unreliable (Loading hang), data isn’t durable, and the vision features parents care about aren’t visible.

### Is it ready for childcare providers?
**No** as a Family Hub product. Providers can generate invites; they cannot confidently show families a working portal.

### Is it ready for parents?
**No.**

### Percentage complete
- **vs full Family Hub vision:** ~**20%**  
- **vs “internal preview MVP” (invite + today feed + clean parent shell):** ~**40% deployed / ~70% coded in PR #451**

### If I were shipping this product, what I’d build next
1. **Unblock the stage** — durable DB + deploy #451 to testing only.  
2. **Ship the “Today” moment** — one screen: kids, today’s shared report, today’s photos, form status.  
3. **Make it feel like a parent app** — strip pricing/tester chrome.  
4. **Invite 3 friendly internal parents** with a written “preview only” script.  
5. **Only after that feedback**, invest in messaging/calendar/e-sign.

Do **not** invite a broad tester group until Sprint 1 exit criteria pass. Broad exposure now will generate “it doesn’t work” noise instead of product learning.

---

## Appendix A – Deployed vs PR cheat sheet

| Capability | Live testing | PR #451 |
|------------|--------------|---------|
| Invite + magic link + code | Yes | Yes |
| Parent Loading reliability | **Fails often** | Fixed in code |
| Durable storage gate | No | Yes |
| Parent-only navigation | No | Yes |
| Coming Soon placeholders | No (on parent view) | Yes |
| Shared feed on `/me` | No | Yes |
| Seed demo | No | Yes |
| Second guardian | No | Yes |

## Appendix B – Evidence snapshot

- Testing shell: `20260803-nuo-onboarding-r4`  
- Readiness PR shell: `20260803-family-hub-ready`  
- Production `/api/family-hub/me`: `404`  
- Live redeem → `/me`: children + documents OK; UI remained on Loading  
- Live parent chrome: pricing CTA + tester switcher present; no preview banner  

Artifacts from this audit: `/opt/cursor/artifacts/family-hub-product-audit/`

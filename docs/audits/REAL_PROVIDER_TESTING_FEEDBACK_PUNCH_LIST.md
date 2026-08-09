# Real Provider Testing — Feedback Punch List

**Status:** Active intake (freeze on broad development)  
**Opened:** 2026-08-08  
**Environment (testers only):** https://little-learner-hub-testing.onrender.com  
**Live testing shell (at open):** `20260808-phase11-testers-go3`  
**Live testing shell (current):** `20260809-phase11-ota-desktop-go13`  
**PR (keep unmerged):** https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/590  
**Production:** Untouched until Leah gives **explicit written** production-release approval  

Related (historical QA, not this intake): `docs/audits/PHASE11_MANUAL_TESTER_REVIEW_PUNCH_LIST.md`  
Policy: `docs/audits/TESTING_IS_THE_FUTURE_POLICY.md`

---

## Operating rules (locked for this window)

1. **No new large development phase** while real providers are testing.
2. **No broad refactors / drive-by features** unless Leah directs them.
3. Fixes are driven by **actual tester feedback** or **genuine bugs** we discover.
4. **Feature requests are logged first** — do **not** auto-build them.
5. **Curriculum / lesson content / covers** stay on a **separate track** (Leah is still updating those). Do not mix content work into product bug fixes unless she asks.
6. **Production stays read-only.** Do not merge #590, deploy production, wipe DBs, or sync curriculum to production without written approval.
7. Prefer the **smallest safe fix** on the testing branch/site only.

---

## Severity categories

| Category | Meaning | Default action |
|---|---|---|
| **Critical bug** | Blocks core use (can't sign up/login, data loss, wrong host/production leak, broken save of essential work) | Fix ASAP on testing |
| **High functional issue** | Important workflow broken or unreliable (Add Child, Daily Ops, invites, roles, Family Hub) | Fix next on testing |
| **Usability/confusion** | Works but unclear, easy to miss, wording/layout traps | Fix if small; otherwise schedule |
| **Feature request** | New capability testers want | **Log only** — Leah decides if it belongs |
| **Polish/later** | Nice-to-have visual/copy/edge polish | Defer |

Also tag items as needed:

- `curriculum-content` — lesson text, covers, library content (separate track)
- `out-of-scope` — not for this product / wrong environment
- `needs-repro` — reported but not yet reproduced

---

## How to add an item

Copy a row into the right table. Use the next free ID in that category (`C#`, `H#`, `U#`, `F#`, `P#`).

| Field | Guidance |
|---|---|
| **ID** | Stable id (`C1`, `H1`, …) |
| **Date** | When reported |
| **Reporter** | Tester name/initials or “agent” |
| **Summary** | One line |
| **Area** | e.g. Auth, Children, Daily Ops, Family Hub, Center/Roles, Forms, Billing, Curriculum UI, Mobile |
| **Repro** | Exact steps on testing URL |
| **Expected / actual** | Short |
| **Decision** | For feature requests: `log-only` / `accept` / `decline` / `later` |
| **Status** | `open` · `needs-repro` · `in-progress` · `fixed-on-testing` · `verified` · `wont-fix` · `deferred` |

---

## Critical bugs

| ID | Date | Reporter | Summary | Area | Repro / notes | Status |
|---|---|---|---|---|---|---|
| — | — | — | *(none yet)* | — | — | — |

---

## High functional issues

| ID | Date | Reporter | Summary | Area | Repro / notes | Status |
|---|---|---|---|---|---|---|
| H1 | 2026-08-09 | Leah | After Owner Admin → Add Tester, no clear way to give tester access (Copy Invite Link / email-unavailable guidance) | Owner Admin / Testers | Create tester → unsure what to send; email not required on testing; tester must set own password. Fixed on testing shell `20260809-phase11-testers-go9`: invite-ready card + Copy Invite Link + email-unavailable copy; logged-out setup panel; tester sets own password; live HDH/Center/mobile invite→relogin verified | verified |
| H2 | 2026-08-09 | Leah | Typing glitches / text disappears or resets while editing in Owner Admin | Owner Admin (and audit other data-entry) | Root cause: OTA `paint()`/`loadAll()` full remount wiped drafts. Fixed with capture/restore drafts + skip remount while typing; enrichment autosave no longer overwrites newer local edits. Deployed go9+ | verified |
| H3 | 2026-08-09 | agent audit | Residual async remount risk on Staff/Families/Tuition/Daily Ops form shells | Staff / Families / Tuition / Daily Ops | Same class as H2 (refresh remounts form HTML). Staff invite refresh now skips remount while typing. Broader draft-capture deferred unless testers hit it | fixed-on-testing |
| H4 | 2026-08-09 | Leah | Owner Admin desktop layout left-bunched / phone-narrow on PC | Owner Admin / Responsive | go12 fixed unlock/OTA grids, but signed-in providers still got ~268px left column: Admin hides `.sidebar` while `.app-shell` kept `268px 1fr`, so `.main` sat in the first track. Fixed on `20260809-phase11-ota-desktop-go13` (`d20e253`): force single-column app-shell while `#view-admin` active. Live verified signed-in mode at 1920/1440/1366/390 — main full width. Hard-refresh (Ctrl/Cmd+Shift+R) if still cached | fixed-on-testing |

---

## Usability / confusion

| ID | Date | Reporter | Summary | Area | Repro / notes | Status |
|---|---|---|---|---|---|---|
| U1 | 2026-08-09 | Leah | Tester invite/access flow unclear after create (paired with H1) | Owner Admin / Testers | Same as H1 — UX must show invite link + next step immediately. Verified on go9 with Copy Invite Link handoff | verified |

---

## Feature requests (log only — do not auto-build)

| ID | Date | Reporter | Request | Area | Why it came up | Leah decision | Status |
|---|---|---|---|---|---|---|---|
| — | — | — | *(none yet)* | — | — | log-only | — |

---

## Polish / later

| ID | Date | Reporter | Summary | Area | Notes | Status |
|---|---|---|---|---|---|---|
| — | — | — | *(none yet)* | — | — | — |

---

## Curriculum / content / covers (separate track)

Leah owns ongoing curriculum and cover updates. Log product-adjacent content issues here only so they are not lost; do **not** treat them as automatic engineering work in this testing window.

| ID | Date | Reporter | Summary | Notes | Status |
|---|---|---|---|---|---|
| — | — | — | *(none yet)* | Separate from product bug fixes | — |

---

## Counts (rolling)

| Category | Open | Fixed on testing | Notes |
|---|---|---|---|
| Critical bug | 0 | 0 | |
| High functional issue | 0 | 4 | H1/H2 verified; H3/H4 fixed-on-testing (H4 go13) |
| Usability/confusion | 0 | 1 | U1 verified |
| Feature request | 0 | — | Decisions pending |
| Polish/later | 0 | 0 | |
| Curriculum/content | 0 | — | Separate track |

---

## Release gate (unchanged)

- [ ] Real-provider testing feedback reviewed by Leah  
- [ ] Critical + High items addressed or explicitly deferred  
- [ ] Feature requests triaged (accept / decline / later)  
- [ ] Curriculum/content track ready if production replacement needs it  
- [ ] **Leah explicit written approval** before any production merge/deploy  

Until that approval: **PR #590 stays unmerged** and **production stays untouched**.

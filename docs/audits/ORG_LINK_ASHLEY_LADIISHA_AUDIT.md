# Organization Link Audit — Ashley ↔ Ladiisha

**Status: BLOCKED — DO NOT MERGE YET**  
**Date:** 2026-07-17  
**Accounts:**
- `tclashley@icloud.com` (Ashley — keep Founding Member subscription)
- `ladiisha01@gmail.com` (temporary Founding access for login troubleshooting — should not keep Founding)

**Production host inspected:** `https://littlelearnershubbyleah.com`  
**Production DB provider:** Postgres (`launch-store` JSON blob)  
**Founding spots (public health):** 28 claimed / 50 limit / 22 remaining

---

## Executive verdict

| Gate | Result |
|------|--------|
| Code/model understanding | PASS |
| Production user-row inspection | **FAIL — blocked (no admin/DB credentials in this environment)** |
| Duplicate-org / orphan conflict scan | **FAIL — blocked (needs live store)** |
| Safe to merge now | **NO** |

No database writes, staff invites, founding transfers, or membership updates were performed.

---

## How “organizations” work in this product (critical)

Little Learner Hub does **not** have a first-class `organizations` table/collection.

| Concept | Actual representation |
|---------|------------------------|
| Program / “org” | Owner email key: `programMembers[ownerEmail]` + `linkedProgramOwnerEmail` on staff |
| Account type | `accountType`: `home_daycare` \| `center` \| `single_provider` |
| Role | `role`: `owner` \| `director` \| `teacher` \| `assistant` |
| Founding / billing | Per-user Stripe + `foundingMembers[]` email list |
| Children | `childData[firebaseUid]` — **per login UID, not per org** |
| Calendar / classrooms / planner | `scheduleByUser[uid]` — **per login UID, not per org** |
| Messages | Global store; access inherits owner via `linkedProgramOwnerEmail` |
| Lesson library / Activity Center | Shared platform curriculum (not per-org copies) |

Signup fields like `centerInviteCode` / `join_existing` are **metadata only** and do **not** link accounts.

The only supported org-link path today is:

1. Owner/director creates `POST /api/staff/invites`
2. Invitee accepts `POST /api/staff/invites/accept`
3. Invitee gets `linkedProgramOwnerEmail`, `role`, `programAccessViaOwner`

There is **no** admin “merge two accounts into one org” tool and **no** automatic merge of children/calendar data across UIDs.

---

## Production inspection blockers

This Cloud Agent environment has:
- Empty local `server/data/launch-store.json` (0 users)
- No `.env`, no `PRODUCTION_DATABASE_URL`, no admin password/access code

Therefore these required live checks could **not** be completed:

1. Both accounts exist and are active in Postgres
2. Current `plan` / `foundingMember*` / Stripe IDs for each
3. Whether either already has `linkedProgramOwnerEmail` or `programMembers`
4. Whether they already share (or each own) `childData` / `scheduleByUser` UIDs
5. Duplicate email keys / orphan invites / orphan member rows
6. Whether Ladiisha’s Founding was Stripe-backed or admin `internalAccessOverride`

**Required next input to finish the audit:** either
- Admin unlock credentials (so the dry-run script can call production admin APIs), **or**
- A redacted Postgres/`launch-store` export of both user rows + related `programMembers` / `staffInvites` / UID-keyed data counts

Dry-run script prepared: `scripts/audit-org-link-ashley-ladiisha.js`

---

## Potential conflicts (known from architecture)

### 1. Dual Founding Member assignment (HIGH)
If both emails currently appear in `foundingMembers[]` or both have `foundingMemberActive: true`:
- Ashley must keep the real Founding subscription (Stripe + flags).
- Ladiisha’s temporary Founding must be removed carefully so we do **not** delete Ashley’s Stripe customer/subscription or founding spot.
- Risk: admin “set to Free” on the wrong email, or removing the wrong entry from `foundingMembers[]`.

### 2. Per-UID data silos (HIGH — biggest data-loss risk)
Staff-invite linking **does not move**:
- `childData[uid]`
- `scheduleByUser[uid]` (classrooms, calendar, weekly planner assignments)
- local browser `llhAccounts` lesson/docs caches

If both women already created children/classrooms under different Firebase UIDs, a permissions-only link would make them “same org” for membership/messaging while each still sees **only their own UID data**. That can look like “data disappeared” even though nothing was deleted.

**Safe merge requires a pre-check of UID data volumes** and, if both have real program data, an explicit data-consolidation plan (copy/merge into Ashley’s UID or a shared store) **before** calling the link “done.”

### 3. Two billing owners / two “owner” roles (MEDIUM)
UI label “Director / Owner” maps to role `owner`.  
Capability matrix:
- `owner` → staff + **billing**
- `director` → staff/ops, **no billing**

Recommended:
- Ashley (`tclashley@icloud.com`): `role: "owner"` — Founding + Stripe billing owner
- Ladiisha: `role: "director"` — full ops/admin for staff/children/settings, inherits Pro/Founding access via `programAccessViaOwner`

Giving Ladiisha `role: "owner"` would show billing UI but Stripe would still belong to Ashley — confusing and risky.

### 4. Duplicate “programs” (MEDIUM)
If both currently have `role: owner` and neither has `linkedProgramOwnerEmail`, the product treats them as **two separate programs**. Linking must attach Ladiisha under Ashley’s owner key — not create a second `programMembers` bucket under Ladiisha.

### 5. Temporary Founding on Ladiisha vs Stripe (MEDIUM)
Need to distinguish:
- Admin override / manual Founding (`internalAccessOverride`, no/invalid Stripe) → safe to clear flags after link
- Real Stripe Founding checkout on Ladiisha → must cancel/portal carefully; do **not** transfer Stripe IDs onto Ashley without verifying Ashley already has the lasting subscription

### 6. Auth / login recovery residue (LOW–MEDIUM)
Ashley previously had sealed temp-password recovery (`tclashley-temp-20260716c`). Confirm `mustChangePassword` is false and both can log in / reset passwords **before** org changes (auth fix already merged in PR #278).

### 7. Client localStorage divergence (LOW–MEDIUM)
Even after server link, each browser’s `llhAccounts` may still show old plan/role until sync. Users should hard-refresh / re-login after changes.

### 8. No duplicate user emails expected (LOW)
Store keys are normalized lowercase emails; duplicates would be a bug. Still must verify live store has exactly one key per email.

---

## What could break if merge is rushed

| Action | Breakage |
|--------|----------|
| Link without checking UID data | Each director sees different children/calendar; “missing data” reports |
| Clear Founding on Ashley by mistake | Lost $9.99 lifetime lock / founding spot |
| Copy Ladiisha Stripe IDs onto Ashley | Billing/webhook chaos, possible double subscription |
| Delete Ladiisha user row | Orphan messages, invites, analytics; login broken |
| Set Ladiisha `role: teacher` | Loses staff invite / forms / permissions |
| Create a new org/center record | N/A product concept — would be inventing unsupported structure |
| Merge emails into one login | Breaks Firebase Auth identity; **do not combine logins** |

---

## Safest merge strategy (proposed — not executed)

### Phase A — Live audit (required, currently blocked)
Run `scripts/audit-org-link-ashley-ladiisha.js` against production with admin token **or** `PRODUCTION_DATABASE_URL`.

Must confirm for both emails:
- User row exists, not disabled
- Plan / founding / Stripe summary (redacted)
- `linkedProgramOwnerEmail`, `role`, `accountType`
- Membership in any `programMembers[*]`
- Pending/accepted `staffInvites`
- `firebaseUid` present
- Counts: children / schedule classrooms / messages involving each email
- Whether both already linked to the same owner

**Hard stop** if either account missing, disabled, or UID data conflict is unresolved.

### Phase B — Founding / billing cleanup (Ashley keeps Founding)
1. Snapshot/backup production store (Render Postgres backup + admin note).
2. Confirm Ashley has the durable Founding subscription (Stripe active + founding flags + listed in `foundingMembers`).
3. On Ladiisha only: remove temporary Founding via admin membership update:
   - `foundingMemberActive: false`
   - `plan` → Free (or leave Free with `programAccessViaOwner` after link)
   - clear manual override flags if present
   - **Do not** remove Ashley from `foundingMembers[]`
   - **Do not** alter Ashley’s `stripeCustomerId` / `stripeSubscriptionId`
4. Re-check founding claimed count still makes sense (Ladiisha may remain historical in array if she truly claimed a spot — decide explicitly; prefer keeping historical email in array if she paid, clearing only active access).

### Phase C — Org link (permissions)
Preferred path using existing product APIs (no custom destructive merge):

1. Ensure Ashley is `role: "owner"` and is the program owner email.
2. From Ashley (or admin-assisted invite create), invite `ladiisha01@gmail.com` as **`director`**.
3. Ladiisha accepts while signed in as herself.
4. Verify server fields on Ladiisha:
   - `linkedProgramOwnerEmail: "tclashley@icloud.com"`
   - `role: "director"`
   - `programAccessViaOwner: true` (because Ashley has Founding/Pro access)
5. Add Ashley to `programMembers[tclashley@icloud.com]` only if the product expects self-listing; otherwise owner is implied by key — do not invent duplicates.

### Phase D — Data consolidation (only if Phase A shows both UIDs hold real program data)
If both have non-empty `childData` / `scheduleByUser`:
1. Export both UID payloads.
2. Merge into Ashley’s UID (or designated primary) with ID collision rewriting.
3. Leave a backup of Ladiisha’s pre-merge UID payload.
4. Only then tell users to use the shared program view.

If only Ashley has program data (or only Ladiisha): choose the primary UID explicitly and document it — still no silent deletes.

### Phase E — Verification
Both can: login, reset password, stay logged in, manage staff, classrooms/children (after data consolidation), lessons, activities, calendar/planner, documentation helpers, messaging, org settings; Ashley sees billing; Ladiisha inherits access without her own Founding flag.

---

## Database / store changes that would be made (future — not done now)

| Collection / field | Change |
|--------------------|--------|
| `users[tclashley@icloud.com]` | Keep Founding + Stripe; ensure `role: owner`; no destructive edits |
| `users[ladiisha01@gmail.com]` | Clear temp Founding access; set `role: director`; set `linkedProgramOwnerEmail`; set `programAccessViaOwner` |
| `foundingMembers[]` | Ensure Ashley remains; decide Ladiisha historical entry case-by-case |
| `staffInvites` | Add invite (pending → accepted) for Ladiisha |
| `programMembers[tclashley@icloud.com]` | Add Ladiisha member record (`director`, active) |
| `childData` / `scheduleByUser` | **Only if Phase D required** — merge copies with backup; never delete without backup |
| Stripe | No automatic transfer; cancel Ladiisha subscription only if she truly has a separate paid Founding |

No new organization entity will be created.

---

## Confirmation goals (after successful merge)

These can be promised only after Phase A–E complete:

- No user login identities merged/deleted
- Ashley’s Founding subscription retained
- Ladiisha retains her login; gains org director permissions + inherited access
- No silent deletion of children, classrooms, lessons, messages
- No duplicate org records (product has none to duplicate)
- Billing ownership stays with Ashley

**Today we cannot yet confirm** live data safety because production rows were not readable.

---

## Regression plan (after merge execution)

Run at minimum:
- `npm run check`
- `npm run test:auth-recovery-audit`
- `npm run test:temp-password-auth`
- `npm run test:staff-invite-flow`
- `npm run test:account-access`
- `npm run test:billing-membership`
- `npm run test:messaging-lib`
- Manual prod smoke: login both → staff page → children/calendar → billing (Ashley) → Founding badge (Ashley only)

---

## Recommendation

1. **Do not merge yet.**
2. Provide admin access or a redacted store export for both emails.
3. Re-run `node scripts/audit-org-link-ashley-ladiisha.js` until status is `READY`.
4. Only then execute Phase B → C → (D if needed) → E with an explicit backup.

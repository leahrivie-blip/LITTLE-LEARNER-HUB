# Shared Program Ownership — Implementation Report

**Date:** 2026-07-17  
**Branch:** `cursor/shared-program-ownership-a1ac`  
**Live Ashley / Ladiisha connection:** **NOT PERFORMED** (explicitly blocked)

Accounts in scope for a *future* connection only:
- `tclashley@icloud.com` (Ashley — keep Founding + billing)
- `ladiisha01@gmail.com` (Ladiisha — temporary Founding only)

---

## 1. Schema and code changes

### New store collections
| Key | Purpose |
|-----|---------|
| `store.programs[programId]` | Program metadata (`id`, `ownerEmail`, `ownerUid`, `name`, timestamps) |
| `store.programData[programId].child` | Shared child blob + `updatedByUid` / `updatedByEmail` |
| `store.programData[programId].schedule` | Shared classrooms/items + audit fields |
| `store.programDataBackups[backupId]` | Migration snapshots for rollback |

`programId` is stable: `prog_` + SHA-256(`llh-program:{ownerEmail}`)[:16].

### Legacy keys (retained)
- `store.childData[uid]` — still mirrored for owner UID; **never deleted** by migration
- `store.scheduleByUser[uid]` — same
- Firebase UIDs remain on member records and `updatedBy*` audit fields

### User fields
- `programId`
- existing `linkedProgramOwnerEmail`, `programAccessViaOwner`, `role`

### Code
| File | Change |
|------|--------|
| `server/program-ownership.js` | **New** — resolve/read/write program data; migration planner; rollback |
| `server/index.js` | Child + schedule APIs use program scope; staff accept sets `programId`; curriculum Pro inherits owner; admin migration plan/rollback routes |
| `app.js` | Sync `programId` / link fields from subscription + staff accept |
| `scripts/test-shared-program-ownership.js` | Seeded dual-director suite |
| `package.json` | `test:shared-program-ownership` |

### New admin APIs (safe defaults)
- `GET /api/admin/program-migration-plan` — dry-run by default  
  - `apply=1` blocked for Ashley+Ladiisha unless `ALLOW_LIVE_PROGRAM_MIGRATE=true`  
  - `linkMember=1` for that live pair blocked unless `ALLOW_LIVE_ACCOUNT_LINK=true`
- `POST /api/admin/program-migration-rollback` — restore `programData` from backup

---

## 2. Records that will be migrated (when live dry-run/apply is eventually run)

For a given owner program (Ashley):
1. Ensure `programs[prog_…]` for Ashley’s email  
2. Copy **Ashley’s** legacy `childData[ashleyUid]` → `programData[programId].child` (if program child empty)  
3. Copy **Ashley’s** legacy `scheduleByUser[ashleyUid]` → `programData[programId].schedule`  
4. Snapshot both sides into `programDataBackups[backupId]`  
5. **Keep** Ladiisha’s UID buckets intact for manual review  

Not auto-migrated into shared program:
- Duplicate children / calendar rows on Ladiisha’s UID  
- Ladiisha-only children / events (ambiguity report)

Not touched:
- Login identities / Firebase Auth users  
- Ashley Stripe IDs / Founding flags  
- Messages (already email-scoped)  
- Platform lesson library / Activity Center catalog  

---

## 3. Duplicates / conflicts (seeded test findings + expected live behavior)

Seeded dual-UID fixture produced:
- `duplicate_child_profiles` (same child id on both UIDs)
- `member_only_child_profiles` (director-only child)
- `member_only_schedule_items` (director-only calendar event)
- `duplicate_schedule_items`

**Policy:** do **not** auto-combine conflicts. Owner/program data wins for the shared bucket; member-only and duplicates stay in the member’s legacy UID for human review.

Live Ashley/Ladiisha ambiguity counts are **unknown until a production dry-run** with admin access (previous admin password attempt failed).

---

## 4. Backup and rollback plan

1. Before any live apply: Render Postgres backup + `GET /api/admin/store-export`  
2. Migration `apply=1` writes `programDataBackups[backupId]` containing:
   - prior `programData[programId]`
   - owner/member legacy child + schedule snapshots  
3. Rollback: `POST /api/admin/program-migration-rollback` with `backupId`  
4. Legacy UID buckets are never deleted, so even without rollback, personal pre-link data remains recoverable  

---

## 5. Test results

| Suite | Result |
|-------|--------|
| `npm run check` | PASS |
| `npm run test:shared-program-ownership` | PASS (13 assertions) |
| `npm run test:staff-invite-flow` | PASS |
| `npm run test:schedule-foundation` | PASS |
| `npm run test:account-access` | PASS |
| `npm run test:billing-membership` | PASS |

Seeded suite confirmed:
1. Two logins → one program (owner + director)  
2. Same shared children  
3. Director create → owner sees it  
4. Staff invited by director joins owner program  
5. Removing a member does not delete shared data  
6. Password resets remain per-login (unchanged auth model; covered by prior auth suite)  
7. Owner Stripe/Founding untouched  
8. Live Ashley/Ladiisha apply/link blocked  
9. Single-provider still gets isolated program data  
10. Rollback works  

---

## 6. Ashley Founding / billing protection

- Seeded owner Stripe IDs unchanged through migration + director link  
- Live apply for Ashley/Ladiisha is hard-blocked without env override  
- Future Founding cleanup for Ladiisha must use admin membership update on **her email only** — never edit Ashley’s `stripeCustomerId` / `stripeSubscriptionId`  
- Ladiisha inherits access via `programAccessViaOwner` + owner Founding record (messaging/curriculum inheritance)

---

## 7. Confirmation: can connect later without data loss?

**Infrastructure: YES (after deploy + live dry-run).**  
Shared ownership is implemented and tested with seeds.

**Live connection: NOT DONE.**  
Before connecting Ashley & Ladiisha:
1. Deploy this branch  
2. Admin dry-run migration plan for the two emails  
3. Review ambiguity report  
4. Backup store  
5. Apply **data** migration only (`ALLOW_LIVE_PROGRAM_MIGRATE=true` if needed)  
6. Invite Ladiisha as **director** under Ashley (separate explicit step; `ALLOW_LIVE_ACCOUNT_LINK` still blocked by default)  
7. Clear Ladiisha’s temporary Founding only  
8. Verify both see shared children/calendar; Ashley billing page still owner-owned  

Until those live steps are explicitly approved, **no user loses access and no production accounts are linked.**

---

## Recommended next command (after deploy + admin unlock)

```bash
# Dry-run only — no writes
curl -sS "https://littlelearnershubbyleah.com/api/admin/program-migration-plan?\
adminToken=ADMIN_TOKEN&\
ownerEmail=tclashley@icloud.com&\
memberEmail=ladiisha01@gmail.com" | jq
```

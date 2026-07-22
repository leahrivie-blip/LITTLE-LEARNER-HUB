# Phase 1 Technical Report — Director / Family / Forms Foundation

**Status:** Complete — awaiting approval before Phase 2  
**Branch:** `cursor/director-family-foundation-bc66`  
**Date:** July 21, 2026  
**Live exposure:** None. Expansion feature flags default **OFF**. No production migration. No deployment of unfinished UI.

---

## 1. What currently exists (confirmed from code)

### Database / storage
- Default local store: `DATABASE_PROVIDER=local-json` → `server/data/launch-store.json`
- Production: Postgres JSONB document in `llh_store` when `DATABASE_PROVIDER=postgres` + `PRODUCTION_DATABASE_URL`
- Shared program ownership already exists (`server/program-ownership.js`): `programs`, `programData`, legacy `childData` / `scheduleByUser`

### Authentication
- Hybrid model: client `localStorage` accounts (`llhAccounts`) + server `store.users`
- Optional Firebase auth; server password / temp-password / member sessions
- Admin sessions separate from member sessions

### Account types (runtime)
- `home_daycare` | `center` | `single_provider`
- Reserved future: `curriculum_only` (docs only)

### Roles (runtime)
- `owner` | `director` | `teacher` | `assistant`
- Parent/guardian is **not** active in current capability checks
- Staff invites already exist (`/api/staff/invites`)

### Child profiles
- Client child stores synced via `/api/child-data` into `programData[programId].child`
- Keys include Profiles, Observations, Reports, Communications, Documents, etc.
- Classroom field on profiles is currently a string label, not a permanent classroom relationship ID

### Classrooms / schedule
- Schedule document includes `classrooms[]` and typed `ScheduleItem`s
- Default classroom: `classroom-main`
- Hidden sidebar surfaces already exist for Classrooms / Staff / Families / Enrollment / Director Center (Coming Soon)

### Forms / messages / daily reports
- Forms today = resource library items + admin `siteContent.forms` (not a custom form builder)
- Messaging Center collections exist on the server
- Daily Logs / observations / reports live in child data collections

### Feature flags (before Phase 1)
- Only permanent `playBasedCurriculum: true`
- No Director / Forms / Family toggles

### Environments
- Separated by env vars (Stripe, Postgres, Firebase, admin secrets), not separate code trees
- Local/test may use header identity; production requires verified auth for sensitive routes

### Billing (live today)
- Founding: **$9.99/month** lifetime lock while continuously active
- Pro Monthly: **$19.99**
- Pro Annual: **$199**
- Access via `scripts/membership-access.js` (Stripe status + period end + founding flags)
- See companion doc: `docs/PHASE_1_ENTITLEMENT_PRICING_FOUNDATION.md`

---

## 2. Files changed

| File | Change |
|------|--------|
| `scripts/expansion-feature-flags.js` | **New** — expansion flags, view/route gates |
| `scripts/foundation-data-model.js` | **New** — org/classroom/staff/child/guardian schemas + dry-run migration plan |
| `scripts/org-permissions.js` | **New** — organization-scoped permission evaluator |
| `scripts/entitlement-model.js` | **New** — future pricing/entitlement structure (not live) |
| `scripts/test-director-family-foundation.js` | **New** — Phase 1 foundation tests |
| `scripts/account-access.js` | Reserved `PARENT_GUARDIAN` future role only (no runtime behavior change) |
| `server/index.js` | Wire flags, foundation collections, foundation APIs, expansion route rejection |
| `app.js` | Client flag cache (default OFF), nav + `setView` gates |
| `index.html` | Feature-flag marker on hidden Director Center; empty hidden Forms Center / Family Hub view shells (not in sidebar) |
| `package.json` | `test:director-family-foundation` script |
| `docs/PHASE_1_DIRECTOR_FAMILY_FOUNDATION.md` | This report |
| `docs/PHASE_1_ENTITLEMENT_PRICING_FOUNDATION.md` | Pricing/entitlement foundation |

---

## 3. Database changes proposed / created

### Additive collections (empty by default, idempotent `ensureFoundationStore`)
- `organizations`
- `programProfiles`
- `classrooms`
- `staffMemberships`
- `classroomStaffAssignments`
- `childRecords`
- `classroomChildAssignments`
- `guardians`
- `childGuardianRelationships`
- `roleDefinitions`
- `permissionDefinitions`
- `featureFlagRecords`
- `organizationEntitlements`
- `classroomAddOns`
- `foundationMigrationPlans`
- `foundationMeta`

### Rules followed
- Additive only
- Backward-compatible
- Non-destructive
- Safe to run more than once
- **No** automatic rewrite of existing user records
- **No** production migration executed

### Program Profile fields prepared
Program name, logo asset id, director/owner name, address, phone, email, license number, website, program type, classroom count.

No visible setup form was added.

---

## 4. Feature flags added

| Flag key | Default | Purpose |
|----------|---------|---------|
| `directorCenter` | **OFF** | Director Center expansion (Phase 2: admin private preview only) |
| `formsCenter` | **OFF** (forced) | Custom Forms Center — remains unavailable |
| `familyHub` | **OFF** (forced) | Family Hub / parent surfaces — remains unavailable |

Enforcement:
- Client: hidden nav + `setView` redirect unless viewer is a verified admin with preview access
- Server: `/api/director-center/*` requires private-preview env + stored flag + verified admin session
- `/api/forms-center/*` and `/api/family-hub/*` always unavailable
- Live production host forces all expansion flags OFF
- Existing routes such as `/api/staff/invites` are **not** blocked

---

## 5. Permission model

Account type and role remain separate.

### Future org roles
- `director_owner`
- `director`
- `lead_teacher`
- `assistant_staff`
- `parent_guardian`

### Access checks (server-ready)
`scripts/org-permissions.js` → `evaluateAccess()` verifies:
- organization membership
- role action matrix
- classroom assignment (teachers/assistants)
- verified child–guardian relationship (parents)
- feature flag availability
- cross-organization denial

**Phase 8 extension:** family manage actions (`FAMILY_MANAGE_*`) for directors/owners; guardian child scope also honors `familyFoundation` access rules (forms/digital capable levels only). Household/contact/invitation/fake-account stores live in `scripts/family-foundation-data-model.js`. Family Hub product flag remains forced OFF.

Current runtime `account-access.js` capability gates are unchanged so existing users behave the same.

---

## 6. Test results

Command:

```bash
NODE_ENV=test npm run test:director-family-foundation
```

**Result (July 21, 2026): all 16 foundation tests PASSED.**

Also passed in the same session:
- `npm run check`
- `npm run test:account-access`
- `npm run test:platform-nav`

Coverage included:
- All new flags default OFF
- Disabled features absent from production sidebar
- Disabled expansion routes reject access (403 `feature_unavailable`)
- Directors capable of organization-wide permission
- Teachers restricted to assigned classrooms
- Assistants limited
- Parents restricted to verified connected children
- Cross-organization access denied
- Existing account-access role behavior unchanged
- Existing `/api/staff/invites` not treated as unavailable expansion feature
- Migration plan dry-run only

---

## 7. Risks / conflicts discovered

1. **Director Center “Coming Soon” page already existed** and was reachable via direct `setView("director-center")` despite hidden nav. Phase 1 now redirects that view to Calendar while the flag is OFF.
2. **Staff invite UI** is available from Settings even though sidebar Staff is hidden. Expansion flags intentionally do **not** block `/api/staff` or the existing staff view.
3. **Child classroom linkage today is a string** on profile records; future `classroomChildAssignments` must be introduced carefully during a later migration.
4. **Parent role is not active** in current signup/login. Family Hub must not assume parent accounts exist yet.
5. **Pricing docs previously used different draft numbers** (`docs/FUTURE_ONBOARDING_PRICING.md`). Live prices remain Founding/Pro; new catalog is planning-only in `entitlement-model.js`.
6. **Postgres stores one JSON document** — foundation collections add keys inside that document; no separate SQL tables were introduced in Phase 1.

---

## 8. Migration plan (dry-run only)

`GET /api/foundation/migration-plan` and `buildExistingUserMigrationPlan()` describe:
- Match users by normalized email
- Owners → organization + program profile (link `legacyProgramId` when present)
- Staff → membership via `linkedProgramOwnerEmail`
- Classroom assignments from `user.classroomIds` when present
- Child/guardian migration deferred
- Missing data rules and duplicate detection keys
- Rollback via foundation backup collections only (never delete users / programData / Stripe fields)

**Do not run apply in production until explicitly approved.**

---

## 9. Rollback plan

1. Keep expansion flags OFF (default) — no UI/API exposure.
2. To remove foundation keys from a store backup: restore pre-Phase-1 `llh_store` / `launch-store.json` backup, or delete only the additive foundation collections listed above.
3. Revert this branch / PR if needed — no Stripe product changes were made.
4. `foundationMeta.migratedExistingUsers` remains `false` in Phase 1; nothing to un-migrate for users.

---

## 10. Screenshots

None. No hidden development setup screen was required.

---

## 11. Recommended Phase 2 steps

1. Keep flags OFF in production.
2. Build Director Center behind `directorCenter` (classroom CRUD, staff assignment UI using foundation IDs).
3. Create organizations/program profiles for new signups only (still no bulk rewrite unless approved).
4. Wire permission checks into Director Center APIs using `evaluateAccess`.
5. Add classroom ↔ child assignment flows with historical rows.
6. Only after internal QA, enable `directorCenter` in a private preview environment — still not production.

**Stop here. Do not begin Forms Center, Family Hub, live pricing, or production migration without approval.**

# Phase 2 Progress — Director Center Admin Preview

**Status:** Private admin preview only — stop for testing/approval before production  
**Branch:** `cursor/director-family-foundation-bc66`  
**Date:** July 21, 2026

## Security rules (enforced)

| Rule | Enforcement |
|------|-------------|
| Production stays OFF | Live host `littlelearnershubbyleah.com` forces expansion flags OFF even if stored ON and even for admins |
| Admin-only Director Center | Requires `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true` + stored `directorCenter: true` + verified admin session (`ADMIN_EMAIL` / `ADMIN_EMAILS`) |
| Regular users blocked | Teachers, assistants, parents, and non-admin members get 403 on APIs; client redirects gated views |
| Direct URL / API parity | `/api/director-center/*` uses the same `evaluateExpansionAccess` gate |
| formsCenter / familyHub | Forced OFF in normalize + access evaluator |

### Private preview enablement (non-production only)

1. Set `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true`
2. Ensure `SITE_URL` is **not** the live production host
3. Set `siteContent.featureFlags.directorCenter = true` (admin site-content save)
4. Unlock Admin with an approved owner email/password/access code

Without all of the above, Director Center remains unavailable.

## Phase 2 APIs (admin preview)

- `GET /api/director-center/status`
- `GET /api/director-center/overview`
- `GET/POST /api/director-center/classrooms`
- `GET /api/director-center/staff` · `POST /api/director-center/staff/assign`
- `GET /api/director-center/children` · `POST /api/director-center/children/assign`
- `GET/PATCH /api/director-center/program-profile`

These create additive foundation records (organization, program profile, classrooms, staff/child assignments) for the admin preview program only. No production user migration.

## Client

- Director Center page is an **Admin Preview** surface (classroom list + create)
- Shown in nav only when viewer `canAccessDirectorCenter` is true
- Still marked `data-nav-hidden` for normal members

## Tests

```bash
npm run check
npm run test:account-access
npm run test:platform-nav
npm run test:director-family-foundation
```

Includes production-host lock test and verified-admin preview API test.

## Not done yet / stop point

- No production deployment
- No formsCenter / familyHub UI or APIs
- No parent accounts
- No bulk migration of existing users
- No public pricing changes

**Awaiting owner testing and approval before anything moves toward production.**

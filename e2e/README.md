# Little Learner Hub — Playwright E2E Tests

Private end-to-end tests that exercise the real app UI against an **isolated local server and JSON store**. Production data is never touched.

## Quick start

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

Open the HTML report after a run:

```bash
npm run test:e2e:report
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run test:e2e` | Headless run (Desktop Chrome + iPhone + Android viewports) |
| `npm run test:e2e:headed` | Watch the browser run the tests |
| `npm run test:e2e:debug` | Playwright debug mode (headed, single worker) |
| `npm run test:e2e:blocker` | Highest-priority Admin → Publish → Public flow only |
| `npm run test:e2e:report` | Open the HTML report (`playwright-report/`) |

## How it works

1. `e2e/scripts/start-test-server.js` starts `server/index.js` on port **4180** (not 4179 — the app disables backend saves on 4173/4179).
2. `LLH_STORE_PATH` points to a temporary JSON file created for the run.
3. Test admin credentials are injected via environment variables (defaults below).
4. Tests create clearly marked records (`E2E-*` titles) and archive them when possible.

## Environment variables

Copy `.env.e2e.example` to `.env.e2e` to override locally (optional):

| Variable | Default | Notes |
|----------|---------|-------|
| `E2E_PORT` | `4180` | Test server port |
| `E2E_BASE_URL` | `http://127.0.0.1:4180` | Playwright base URL |
| `E2E_ADMIN_EMAIL` | `e2e-admin@test.local` | Owner email for admin unlock |
| `E2E_ADMIN_PASSWORD` | `e2e-admin-pass-1b07` | Owner password |
| `E2E_ADMIN_ACCESS_CODE` | `e2e-admin-code-1b07` | Admin access code |
| `LLH_STORE_PATH` | *(temp file)* | Optional pinned isolated store |

No Firebase, Stripe, or production secrets are required.

## Test accounts (user personas)

User access tests simulate personas via `localStorage`:

- `logged-out` — no `llhUser`
- `free` — `free-user@e2e.test`, Free plan
- `trial` — `trial-user@e2e.test`, Trial status
- `pro` — `pro-user@e2e.test`, Active Pro
- `founding` — `founding-user@e2e.test`, Founding member

Admin tests use the `E2E_ADMIN_*` credentials above.

## Failure artifacts

On failure, Playwright saves:

- Screenshot (`test-results/`)
- Trace video (on failure)
- `failure-details` JSON attachment (console errors, network failures, step context)

View everything in the HTML report.

## CI

GitHub Actions runs `npm run test:e2e:blocker` on pull requests using the isolated test store only — no repository secrets required.

## Audit summary (repository)

| Item | Finding |
|------|---------|
| Playwright before this work | `playwright` package only; no `@playwright/test` suite |
| App start | `npm start` → `node server/index.js` |
| Static-only | `npm run serve` (port 4173) — insufficient for curriculum admin saves |
| Isolated testing | `LLH_STORE_PATH` + ephemeral server (now used by Playwright `webServer`) |
| Authentication | Users: `localStorage`; Admin: `#adminUnlockForm` → `/api/admin/login` |
| Public curriculum | `GET /api/site-content` → client Lesson Plan Library (`setView("lessons")`) |
| Admin curriculum | Admin → Content → Play-Based Lessons (`#adminCurriculumLessonImportText`) |

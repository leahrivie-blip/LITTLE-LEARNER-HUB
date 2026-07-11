# E2E work handoff (2026-07-11)

Branch: `cursor/playwright-e2e-1b07`

## What is done

- Playwright `@playwright/test` suite scaffolded (isolated server on port 4180, temp store)
- npm scripts: `test:e2e`, `test:e2e:headed`, `test:e2e:debug`, `test:e2e:report`, `test:e2e:blocker`
- 8 spec files written (admin publish, viewer, connections, search, access, navigation, errors, responsive)
- GitHub Actions workflow drafted (`.github/workflows/e2e.yml` — blocker only on PRs)
- **No `app.js` or production code changes** — test-only diff

## Verified before save

- `npm run check` — passes
- `npm run test:curriculum-publish` — passes (existing Node QA script)

## Not finished

- Full Playwright suite not confirmed green end-to-end (port conflicts / flaky save waits were being fixed)
- Work not split into smaller PRs yet
- No PR opened yet

## Resume on another device

```bash
git fetch origin
git checkout cursor/playwright-e2e-1b07
npm install
npx playwright install chromium

# Kill stale test servers if port busy:
fuser -k 4180/tcp 2>/dev/null || lsof -ti:4180 | xargs kill -9

npm run test:e2e:blocker -- --project=desktop-chrome
npm run test:e2e -- --project=desktop-chrome
```

## Planned smaller PR split

1. **PR A — Infra + blocker + CI**  
   `playwright.config.js`, `e2e/scripts/`, `e2e/helpers/`, `e2e/fixtures/`, `e2e/reporters/`, `admin-publish.spec.js`, `package.json`, `.gitignore`, `.env.e2e.example`, `.github/workflows/e2e.yml`, `e2e/README.md`

2. **PR B — Viewer + connections**  
   `lesson-viewer.spec.js`, `activity-connections.spec.js`

3. **PR C — Search + access**  
   `search-filters.spec.js`, `access-control.spec.js`

4. **PR D — Navigation + errors + responsive**  
   `navigation.spec.js`, `error-states.spec.js`, `responsive.spec.js`

## Test credentials (isolated store only)

- `E2E_ADMIN_EMAIL=e2e-admin@test.local`
- `E2E_ADMIN_PASSWORD=e2e-admin-pass-1b07`
- `E2E_ADMIN_ACCESS_CODE=e2e-admin-code-1b07`

# AGENTS.md

## Cursor Cloud specific instructions

Little Learner Hub is a single Node.js service (no build step) that serves a static childcare-provider web app (`index.html`, `app.js`, `styles.css`) plus a JSON API from `server/index.js`.

### Running the app (dev)
- Start with `npm run start` (equivalent to `node server/index.js`). It listens on `http://localhost:4242`.
- Health check: `GET /api/health`. Launch readiness: `GET /api/launch-readiness`.
- There is **no build/watch step and no hot reload** — after editing `server/index.js`, restart the process for changes to take effect. Static files (`app.js`, `index.html`, `styles.css`) are re-served on browser refresh without a restart.
- By default `DATABASE_PROVIDER=local-json`, so **no external database is required for local dev**. Data is written to `server/data/launch-store.json` (git-ignored). Postgres (`pg`) is only used in production when `DATABASE_PROVIDER`/`PRODUCTION_DATABASE_URL` are set.
- Stripe/OpenAI/admin/DB secrets are optional locally; without them `launch-readiness`/`stripe:check` report `NOT READY`, which is expected. The app still runs and the Stripe checkout has a safe local simulation. To exercise admin-only screens, start the server with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_ACCESS_CODE` set in the environment (or a git-ignored `.env`).
- Regular user accounts (signup/login) are client-side (localStorage); creating an account works without any secrets.

### Lint / checks
- `npm run check` runs `node --check` syntax validation on the key JS files. There is no ESLint config.
- `node server/launch-check.js`, `node server/stripe-check.js`, `node server/billing-check.js` require the server to be running first.

### Tests
- Test scripts are the `test:*` entries in `package.json` (run via `npm run test:<name>`), e.g. `npm run test:homepage-smoke`.
- Browser-based tests (e.g. `test:homepage-smoke`, `test:lesson-library-header`, `test:curriculum-ux`, `test:curriculum-publish`) use **Playwright Chromium (headless)** and require the browser binaries (installed via `npx playwright install --with-deps chromium`).
- Each test **spawns its own server instance on a random port with a temp JSON store**, so tests do not depend on (or conflict with) a separately running dev server.

### Signup suite (required on every big change)
After any substantial UI, auth, billing, homepage, modal, or navigation change — and before calling the work done — run the full signup sheet audit every way:

```bash
npm run test:signup-suite
```

That suite covers:
- Homepage Founding / Free CTA markers (`test:homepage-signup-cta`)
- Account → Program → Plan wizard + pricing copy (`test:signup-pricing-flow`)
- Email field tappable on short phones (`test:signup-email-tap`)
- Center/program continue pathways desktop + mobile (`test:signup-center-continue`)
- Every guest signup / Get Started / Founding CTA click-through on desktop, mobile, and short-mobile, including lesson/activity/plans surfaces (`test:signup-buttons-audit`)

Do not skip this suite for “backend-only” PRs that also touch `app.js`, `index.html`, `styles.css`, homepage CSS, auth modal markup, checkout CTAs, or service-worker cache busts.

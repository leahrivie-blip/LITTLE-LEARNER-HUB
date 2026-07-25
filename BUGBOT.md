# BUGBOT.md — Little Learner Hub review rules

Cursor Bugbot must flag the following on every PR. These rules are
**testing-site / childcare-data safety** priorities — not style nits.

## Storage & data integrity

1. **Full-store replacement** — any write that replaces the entire JSON/Postgres store (or `siteContent` / `familyFoundation` root) without a merge/guard. Prefer patch/merge helpers; reject `writeStore(newStore)` that drops unrelated keys.
2. **localStorage as authoritative storage** — client-only persistence for children, Daily Care, guardians, forms, or messages without a server sync path and offline reconciliation.
3. **Fire-and-forget permanent writes** — `fetch(...).catch(() => {})` (or equivalent) for creates/updates that must not be silently lost. Permanent writes need retry, queue, or user-visible failure.
4. **Missing idempotency** — mutating APIs (Daily Care sync, offline queue flush, checkout, feedback create, pilot onboard) without an idempotency key / client request id when retries are possible.
5. **Missing offline reconciliation** — offline-capable writes without a documented flush path, pending marker, and conflict/idempotent replay strategy.

## AuthZ & isolation

6. **Client-only permission checks** — authorizing access only in `app.js` / UI without a matching server-side gate. UI hiding is not security.
7. **Cross-organization access** — queries or handlers that can return another org’s children, guardians, messages, forms, or feedback without verifying organization membership server-side.
8. **Tokens in URLs or logs** — admin/member tokens, temp passwords, or session ids in query strings, hash routes, `console.log`, error messages, or Sentry payloads.

## Navigation & boot (known live incidents)

9. **Silent navigation fallback** — Admin-only tools (Testing Lab, Director Center, Forms Center) bouncing to Calendar/home with no diagnostic when a gate fails.
10. **App boot continuing with stale permissions** — boot timeout/failure paths that “continue with local UI” for authenticated/Admin sessions instead of a recoverable failure screen.
11. **Buttons without real handlers** — visible CTAs (`data-view`, `data-checkout-plan`, wizard submit, role switch) with no matching listener or dead `href="#"`.
12. **Hidden role UI before authentication** — provider/staff/parent nav, pilot bottom nav, or role chrome rendered for signed-out users (especially on `/admin`).

## Production & external services

13. **Production feature enablement** — flipping expansion flags, OpenAI, Stripe live checkout, email/SMS, or Testing Lab on live production hosts from a testing PR.
14. **Real Stripe / email / SMS / OpenAI calls in tests** — test suites or CI that hit live external APIs. Tests must use fake fixtures, mocks, or blank credentials.
15. **Changes to `main` from testing feature work** — PRs whose base is `main` (or that mix production deploy changes) while delivering testing-only features. Testing work targets `testing/full-platform-integration-2026-07` only.

## UX / device / ops

16. **Missing phone verification** — interactive Admin/Testing Lab workflows shipped without a phone viewport check or an honest “computer recommended” state (never a blank/broken phone UI).
17. **Missing rollback plan** — deploy-affecting changes (schema, store shape, auth, billing) without a short rollback note in the PR / handoff.

## How Bugbot should report

- Cite the file and symbol.
- State which rule number was violated.
- Prefer a concrete safer alternative (merge write, server gate, idempotency key, diagnostic view, mock).
- Do **not** request production secrets, real family data, or live API keys in review comments.

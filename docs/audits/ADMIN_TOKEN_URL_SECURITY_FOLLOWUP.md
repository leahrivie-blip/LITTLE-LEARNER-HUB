# Security Follow-Up: Admin Tokens in URLs → Secure Headers/Cookies

**Status:** draft PR, **Phase 1 + Phase 2 complete** (both additive/backward-compatible
where required). **Not merged, not deployed.**
**Head commit (full 40-char SHA):** see PR #337 branch `cursor/admin-token-header-migration-1d13`.
**Kept independent of** `cursor/admin-session-storage-audit-1d13` (PR #335) — this PR is
based directly on `main` and does not depend on that branch. The two are about different
layers of the same subsystem: PR #335 changed **where** admin sessions are stored
server-side (a dedicated table instead of the shared document); this PR is about **how**
the session token travels from browser to server on each request (URL vs. header). Either
can be merged independently of the other — §9 below documents the exact, verified merge
order and conflict resolution for when both are merged.

---

## 1. What prompted this

Flagged as a known gap in the PR #335 audit report: admin tokens are passed as
`?adminToken=...` query parameters on ~100 existing `GET /api/admin/*` endpoints — a
pre-existing pattern, not introduced by that PR, but worth a dedicated, properly-scoped
follow-up rather than folding a large refactor into an unrelated storage-migration PR.

---

## 2. Audit of the current exposure — evidence, not assumptions

I read the actual code rather than assuming the worst (or the best). Findings:

### 2.1 Browser history

**Not currently exposed.** I checked every place the client sets `window.location.href`
or performs a real page navigation for admin actions, and every admin API call — including
file downloads (store exports, backups) — goes through `fetch()` and `URL.createObjectURL()`
(blob download pattern), never a real navigation to a URL containing the token
(`grep` for `window.open(...adminToken`, `location.href = ...adminToken` found zero
matches). Browser history only records actual page navigations, not `fetch()` request
URLs, so the token does not currently end up in browser history. This is good, but
fragile — a future change that opens an admin report/export via a plain `<a href>` or
`window.location` (instead of the blob pattern already used everywhere else) would
silently reintroduce this exposure. Moving to a header removes the possibility entirely.

### 2.2 Server-side / infrastructure logs

**The most realistic, live risk.** The admin token is part of the HTTP request line
(method + path + **query string**) for all ~100 GET admin endpoints. This app's own code
has no access-log middleware that prints request URLs (`grep` for logging of
`request.url` found nothing) — but Render (and any reverse proxy/CDN in front of it) very
commonly logs the full request line, including the query string, in its own
platform-level access logs, by default, outside this codebase's control. Anyone with
access to those infrastructure logs (or a downstream log-aggregation/SIEM pipeline) could
see admin tokens in plaintext. **Moving the token to an `Authorization` header is the
standard, effective mitigation** for this specific risk, since most access-log formats
(Apache/nginx "combined", and platform equivalents) capture the request line but not
arbitrary request headers by default.

### 2.3 Analytics

**Not currently exposed, verified directly.** `trackEvent()` in `app.js` records
`url: window.location.href` on every tracked event, persisted into
`store.analyticsEvents` (admin-viewable, kept long-term). Since §2.1 confirms the admin
token never appears in the visible page URL, it is never captured by this mechanism
today. This is the same fragility noted in §2.1: if the token ever leaked into the page
URL, this analytics capture would immediately start persisting it into a long-lived,
admin-browsable event log.

### 2.4 Referrer leakage

**Not currently exposed**, for the same reason as §2.1/§2.3 — `Referer` only carries the
*current page's* URL, and the admin token is never in that URL. No `Referrer-Policy`
header or `<meta name="referrer">` tag is set anywhere in this app (checked
`index.html` and `server/index.js` — zero matches), which is a real, if currently latent,
gap: if any URL anywhere in the app ever embedded a secret (not just the admin token —
e.g., a password-reset token, which today is passed as a URL query param
`?resetToken=...` for email links, a different and lower-risk case since it's single-use
and short-lived, but the same class of concern), a plain `<a>` to an external site from
that page would leak the full URL, including the secret, via the `Referer` header. **Recommend
adding a restrictive `Referrer-Policy` (e.g. `strict-origin-when-cross-origin` or
`same-origin`) as a cheap, independent hardening step regardless of the token-location
change** — not blocking on it, but worth doing.

### 2.5 CSRF

**Not currently vulnerable, and this must be preserved.** Classic CSRF relies on the
browser *automatically* attaching ambient credentials (cookies) to a cross-origin
request that a malicious site forges. This app sets **no cookies at all** (`grep` for
`Set-Cookie`/`httpOnly`/`SameSite` across `server/index.js` found zero matches — checked,
not assumed). The admin token lives in `localStorage` and must be explicitly read and
attached by first-party JavaScript on every request. A malicious third-party site cannot
make the browser send a valid admin token on its own, because it doesn't have the token
and the browser won't attach it automatically. **This means today's design is
structurally immune to CSRF, and it is an important constraint on the proposed
redesign**: moving the token to an `Authorization` header preserves this immunity
(headers are also not auto-attached cross-origin by the browser). **Moving to a cookie
instead (the other option the user asked about) would reintroduce CSRF exposure** and
would require adding CSRF protections (e.g. `SameSite=Strict`/`Lax` plus a double-submit
token or per-request CSRF token) that don't exist in this codebase today. See §5 for why
this document recommends the header approach over cookies for that reason.

### 2.6 Session rotation, expiration, logout, revocation

On `main` today (this branch's base, independent of PR #335):
- **Rotation:** partially true — every login mints a brand-new random token
  (`createAdminToken()` always generates a fresh `crypto.randomBytes(24)` value); there is
  no rotation *during* an existing session's lifetime (e.g., on privilege changes).
- **Expiration: none.** `validAdminToken()` only checks existence, never an expiry
  timestamp. A session lives forever until an explicit logout.
- **Logout/revocation:** implemented and functional (`handleAdminLogout` correctly
  deletes the session), though today it does so via a full-store read/write.
- **These specific gaps (expiration, and the full-store write on every session
  operation) are exactly what PR #335 (`cursor/admin-session-storage-audit-1d13`)
  addresses** — a dedicated session store with a 12-hour sliding expiration, and
  logout/revocation that touches only the one session record. This document does not
  duplicate that work; it treats it as already covered by that separate, independent PR.

### 2.7 A related finding worth flagging: token storage client-side (XSS exposure)

Not explicitly asked for, but directly relevant to "moving authentication to secure
headers/**cookies**": the admin token is stored in `localStorage` (`llhAdminSession`),
which is fully readable by any JavaScript running on the page — first-party code today,
but also any future XSS vulnerability. An `httpOnly` cookie would not be readable by
JavaScript at all, meaningfully reducing the blast radius of a hypothetical XSS bug for
this specific token. This is the main argument *for* eventually moving to a cookie rather
than just a header — traded off against the CSRF-protection burden noted in §2.5. See §5
for the recommendation.

---

## 3. What this PR actually implements

### Phase 1 — server, additive (unchanged from the original scope)

- **`extractAdminToken(request, url)` helper** in `server/index.js`: checks
  `Authorization: Bearer <token>` first, falls back to `?adminToken=...` if the header is
  absent or malformed. Every one of the **40** GET admin endpoints that used to read
  `url.searchParams.get("adminToken")` directly now goes through this helper (verified —
  zero remaining direct reads, checked via static test).
- **`extractAdminTokenFromBody(request, body)` helper** (added as part of completing
  Phase 2, since it's the same idea applied to POST/PUT endpoints): checks the
  `Authorization` header first, falls back to the legacy `body.adminToken` field. All
  **63** server call sites that used to read `body.adminToken` directly (in its several
  slightly different exact forms — `String(body.adminToken || "")`, `.trim()` variants,
  `handleAdminLogout`'s previous bespoke bearer-fallback, etc.) now go through this one
  helper (verified — zero remaining direct reads, checked via static test).
- **Nothing is removed at the server layer.** Every existing client call, bookmark, or
  integration that still sends `?adminToken=...` or `body.adminToken` continues to work.
- **Precedence:** when both a header and a query/body value are present, the header
  wins, and an explicitly-provided-but-wrong header is **not** silently overridden by a
  valid query/body value — proven by test.
- **New sanitized monitoring:** `legacyAdminQueryTokenUseCount` /
  `legacyAdminBodyTokenUseCount` module-level counters (never the token *value*,
  reset on restart — a monitoring signal, not a durable audit trail) plus a new
  admin-gated `GET /api/admin/legacy-auth-usage` endpoint to watch legacy-path usage
  trend toward zero before Phase 3 removes the fallback.

### Phase 2 — the actual client migration (now complete)

- **Every** admin `fetch()` call in `app.js` — **all ~60 call sites** that previously
  constructed a `?adminToken=${...}` query string (20) or sent `adminToken` as a JSON
  body field (≈40, across several different construction styles: inline
  `JSON.stringify({adminToken: token, ...})`, a separately-built `body` object, and a
  few `URLSearchParams({adminToken: token, ...})` cases) — now instead send
  `Authorization: Bearer <token>` and construct the URL/body **without** the token at
  all. Verified by static test (`app.js` contains zero remaining `adminToken=` query
  constructions and zero remaining `adminToken:` body fields, anywhere) and by a
  real-browser test that intercepts every actual network request the admin panel makes
  and asserts the token never appears in any of them.
- **Downloads/exports** (`downloadAdminStoreExport`, `downloadAdminStoreBackup`, the
  curriculum backup export, resource-file fetches) already used the safe
  `fetch()` → `blob` → `URL.createObjectURL()` pattern (never a real navigation to a
  URL carrying the token) — they now also send the token via header instead of query
  string, closing the one place they *did* still put it in a URL (even though that URL
  was never the visible page URL or browser history — see §2.1).
- **The token is never printed.** The one pre-existing debug log
  (`admin-analytics:client`) already only logged a short, non-reconstructable prefix
  (`token.slice(0, 12)`) — left as-is, verified by static test. No code path anywhere
  logs a raw token value as a `console.log`/`warn`/`error` argument (verified by static
  test — the only match for the literal word "token" inside a `console.log` call is a
  hardcoded string, `"token valid"`, not a variable).
- **The legacy query/body fallback is intentionally kept, for one monitored release
  only** (see §8, Phase 3) — this is "controlled compatibility", not a permanent
  parallel path.

### What this PR still does *not* do

- **Does not implement cookies.** See §5 for why this document recommends headers over
  cookies as the near-term target, with cookies as a possible *later*, separately-scoped
  phase if the team wants the additional XSS-hardening benefit and is willing to take on
  CSRF protections.
- **Does not touch `docs/audits/ADMIN_SESSION_STORAGE_PERFORMANCE_AUDIT.md` or PR #335's
  code.** This branch is based on plain `main`; §9 documents the merge order for combining
  the two.
- **Does not add a `Referrer-Policy` header** (the independent, cheap hardening
  recommendation from §2.4) — flagged, not implemented, since it's unrelated to the
  admin-token migration specifically.

---

## 4. Testing

`scripts/test-admin-token-header-auth.js` (extended for Phase 2) proves, against a real
spawned server — **19 tests, all passing**:

- Static: both helpers exist, **zero** GET admin endpoints still read the query param
  directly (all ~40 route through `extractAdminToken()`), **zero** POST/PUT endpoints
  still read `body.adminToken` directly (all 63 call sites route through
  `extractAdminTokenFromBody()`).
- Static: `app.js` itself contains **zero** remaining `adminToken=` query constructions
  and **zero** remaining `adminToken:` body fields anywhere — the actual proof the
  client migration is complete, not just sampled.
- Static: the token is never printed — server never passes a raw token variable to
  `console.log`/`warn`/`error`; the one client debug log keeps using only a short,
  non-reconstructable prefix.
- The legacy query-param and legacy body-field paths both still work, unchanged.
- The same endpoints now also work with **only** an `Authorization: Bearer` header — on
  both GET and POST.
- A valid header wins over a garbage/wrong query param, in both directions (an invalid
  header is not silently bypassed by a valid query param either).
- No credential anywhere (GET or POST) still correctly returns 401/400, same as before.
- A malformed (non-`Bearer`) `Authorization` header degrades gracefully to the
  query-param fallback instead of erroring.
- A revoked token is rejected on every subsequent request, and a malformed/never-issued
  bearer token is rejected identically to a missing one.
- **New:** the `legacy-auth-usage` monitoring endpoint reports sanitized counts (never
  the token values) and itself requires admin auth.
- **New:** CSRF — a forged cross-site request carries no credential at all (proven: this
  app sets no cookies, ever) and is rejected; a regular (non-admin) member's own bearer
  scheme cannot validate against admin endpoints.

`scripts/test-admin-token-no-leak-browser.js` (new) proves, in a **real headless
Chromium browser** driving the actual client code (not a synthetic simulation) — **3
tests, all passing**:

- Every real network request the admin panel makes (login, store-health, analytics,
  store-backups, session validation) is intercepted at the network layer; the token is
  confirmed **never** present in any request URL, and confirmed **present** via a real
  `Authorization: Bearer` header on at least one of them (proving the mechanism actually
  works, not just "absent because broken").
- A real admin export download is intercepted the same way — the token is in the header,
  not the request URL, for the download request itself.
- The visible browser address bar (`page.url()`) never contains the token after a real
  login + navigation — the concrete proof against browser-history exposure.

Also ran the broader existing regression suite (`test-admin-auth-session.js`,
`test-platform-wide-audit-regression.js`, `test-admin-full-remaining.js`,
`test-store-safety-guards.js`, `test-billing-membership-qa.js`,
`test-admin-analytics-root-cause.js`, `test-store-write-race.js`,
`test-curriculum-activities-wipe-protection.js`, `test-lesson-library-empty-curriculum-hotfix.js`,
`test-auth-recovery-audit.js`, `test-login-logout-session-audit.js`,
`test-temp-password-auth.js`, plus a broader spot-check across ~10 additional
browser-driven test files spanning curriculum, messaging, notifications, and email) — all
pass; the handful of pre-existing failures found (a stale legacy-import-format test, one
known-flaky Playwright visibility timeout, one unrelated pre-existing pricing-copy
assertion on a different branch) were individually confirmed, by running them against
unmodified `main`, to already fail identically there — not caused by this change.

---

## 5. Recommendation: header now, cookie later (if ever) — and why

**Adopt the `Authorization: Bearer` header as the target, not a cookie, for the near
term.** Reasoning:

1. It fully solves the concrete, evidenced risk in this audit (§2.2, infrastructure
   access logs) without introducing a new one.
2. It requires zero new infrastructure — this app has never used cookies for anything,
   and introducing `Set-Cookie`, cookie parsing, and CSRF protections (§2.5) is a
   meaningfully bigger, riskier change than switching where a bearer token is read from.
3. It preserves the CSRF-immunity property the current design already has "for free" —
   switching to a cookie would require *adding* CSRF defenses (SameSite + a CSRF token
   scheme) that don't exist anywhere in this codebase today, for a benefit (XSS
   blast-radius reduction, §2.7) that is real but secondary to the risk this follow-up
   was actually asked to close.

If the team later decides the XSS-hardening benefit of an `httpOnly` cookie is worth the
added CSRF-protection engineering, that should be its own separate, explicitly-scoped
follow-up — not bundled into this one.

## 6. Phased migration plan

| Phase | Scope | Risk | Status |
|---|---|---|---|
| **1** | Server: add `extractAdminToken()`/`extractAdminTokenFromBody()`, wire into all ~100 GET+POST endpoints, accept header OR query/body | Low — purely additive, nothing removed | **Done, this PR** |
| **2** | Client: update all `app.js` admin `fetch()` calls (~60 call sites) to send `Authorization: Bearer` and stop constructing `?adminToken=...`/`adminToken:` anywhere | Medium — completed and fully tested (§4); regression-verified | **Done, this PR** |
| **3** | Server: after Phase 2 has been live and monitored (via the new `legacy-auth-usage` endpoint, §3) for **one full monitored release** with usage at/near zero, remove the query/body fallback entirely | Low, but timing-dependent on real production usage reaching zero | Not started — see §8 for the exact removal plan and monitoring criteria |
| **4** (optional, separate decision) | Consider `httpOnly` cookie + CSRF protections for the extra XSS-hardening benefit | Higher — new infra, new attack surface (CSRF) to defend | Not scoped; separate follow-up if wanted |

## 7. Rollback plan

Revert this PR. `extractAdminToken()`/`extractAdminTokenFromBody()` and their call sites,
plus the `app.js` client changes, are the only changes; reverting restores the exact
previous direct `url.searchParams.get("adminToken")` / `body.adminToken` reads and the
previous client-side URL/body token construction. No data migration, no session
invalidation, nothing to undo elsewhere — every legacy code path was left intact
throughout, so a revert is a pure code rollback with zero data-layer consequences.

## 8. Phase 3 removal plan (not yet executed — documented for when the time comes)

**Do not remove the legacy fallback in the same release as Phase 2.** The plan:

1. Merge and deploy Phase 1 + 2 (this PR) to `main`/production.
2. Monitor `GET /api/admin/legacy-auth-usage` for **one full release cycle** (this
   repo has no fixed release cadence documented; use whatever the team's normal
   "watch it for a while before the next change" window is — at minimum, long enough
   to cover every admin's next several login sessions, since browser tabs left open
   from before the deploy will keep using whatever code they already loaded until
   refreshed).
3. Confirm `legacyQueryTokenRequests` and `legacyBodyTokenRequests` are at (or trending
   to) **zero** — any nonzero count after the monitoring window means some client
   (browser extension, bookmarked admin link, external integration, or a stale cached
   service-worker copy of `app.js`) is still using the old style, and must be
   identified before removing the fallback would break it.
4. Only once confirmed at zero: remove the query-param/body fallback branches from
   `extractAdminToken()`/`extractAdminTokenFromBody()` (each becomes a one-line
   function reading only the header), remove the two counters and the monitoring
   endpoint (no longer needed), and update the static tests accordingly.
5. This removal should be its **own small, separately-reviewed PR** — not bundled with
   any other change — specifically so a revert of *that* PR alone is trivial if
   something unexpected still depended on the old style.

## 9. Merge order and conflict resolution with PR #335

**Verified by actually performing the merge locally (not merged/pushed anywhere) and
running the combined test suite against it — not just reasoned about.**

Both PRs touch `validAdminToken()`, `handleAdminSession()`, and (adjacent to, not
touching the same lines as) `createAdminToken()`/`handleAdminLogin()`/
`handleAdminLogout()`, since both are about the admin-auth code path. **Either PR can be
merged first; there is no required order.** Merging the second one produces exactly one
small, easily-resolved conflict cluster:

```js
// Conflict: validAdminToken() / handleAdminSession()
// #335 changed validAdminToken() to check adminSessionStore instead of store.adminSessions.
// #337 changed how the token is READ (extractAdminToken(), header-first) in the same area.
// Resolution: keep BOTH — extractAdminToken() supplies where the token comes from,
// adminSessionStore.validate() supplies how it's checked. Neither conflicts in
// substance; they're two different concerns that happen to be near each other.
function validAdminToken(token) {
  return Boolean(adminSessionStore.validate(token));
}
function handleAdminSession(request, response, url) {
  const token = extractAdminToken(request, url);
  const session = adminSessionStore.validate(token);
  if (!session) { /* ...401... */ }
  // ...
}
```

`createAdminToken()`, `handleAdminLogin()` (with #335's lockout), and the bulk of
`handleAdminLogout()` merge cleanly with no conflict at all, because #337 only added the
*extraction* helper (`extractAdminToken`/`extractAdminTokenFromBody`) around those
functions' existing token-reading logic — it did not touch #335's session-store-specific
internals (lockout, expiration, rotation).

**Verified after resolving:** `node --check server/index.js` passes; a real spawned
server on the merged code boots, and: login → header-only session check → legacy
query-param session check (still works) → an admin request via the header confirmed to
leave the main `llh_store` file byte-for-byte unchanged — all pass. This proves the two
changes compose correctly: dedicated session storage (#335) + header-based token
transport (#337), together, with neither breaking the other's guarantees.

**Whichever merges second only needs to resolve this one function cluster** the same way
shown above; no other file requires manual resolution.

## 10. Confirmation

No production data, Stripe objects, or admin sessions were touched by this change or by
producing this document. No merge or deploy was performed (the PR #335 merge referenced
in §9 was performed locally only, to verify compatibility, then discarded — never pushed,
never merged into any real branch). Stopping here for approval as instructed.

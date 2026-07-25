# Security Follow-Up: Admin Tokens in URLs → Secure Headers/Cookies

**Status:** draft PR, Phase 1 only (additive, backward-compatible). **Not merged, not deployed.**
**Kept independent of** `cursor/admin-session-storage-audit-1d13` (PR #335) — this PR is
based directly on `main` and does not depend on that branch. The two are about different
layers of the same subsystem: PR #335 changed **where** admin sessions are stored
server-side (a dedicated table instead of the shared document); this PR is about **how**
the session token travels from browser to server on each request (URL vs. header). Either
can be merged independently of the other; this document notes where they interact.

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

## 3. What this PR actually implements (Phase 1 — additive only)

- **New `extractAdminToken(request, url)` helper** in `server/index.js`: checks
  `Authorization: Bearer <token>` first, falls back to `?adminToken=...` if the header is
  absent or malformed. Every one of the **40** GET admin endpoints that used to read
  `url.searchParams.get("adminToken")` directly now goes through this helper (verified —
  zero remaining direct reads, checked via static test).
- **Nothing is removed.** Every existing client call, bookmark, or integration that still
  sends `?adminToken=...` continues to work exactly as before. This PR only *adds* a new,
  more secure way to authenticate; it does not require any client change to keep working.
- **POST admin endpoints** (which read `body.adminToken`) are untouched — they don't have
  the URL-exposure problem in the first place (POST bodies aren't part of the request
  line most access logs capture), so they're out of scope for this specific fix.
- **Precedence:** when both a header and a query param are present, the header wins,
  and an explicitly-provided-but-wrong header is **not** silently overridden by a valid
  query param — proven by test (`scripts/test-admin-token-header-auth.js`).

### What this PR does *not* do (deliberately, to keep scope and risk small)

- **Does not touch the client (`app.js`).** All ~100 admin API calls in `app.js` still
  send `?adminToken=...` in the URL today. Migrating the client to send the header
  instead (and eventually stop sending the query param) is **Phase 2**, described below,
  and is a larger, separate change that should get its own review — changing ~100 call
  sites in the client carries meaningfully more regression risk than the purely additive
  server-side change in this PR.
- **Does not remove the query-param fallback.** Removing it is **Phase 3**, and should
  only happen after Phase 2 has shipped and been verified in production for a reasonable
  window, since removing it earlier would break any client still sending the old style.
- **Does not implement cookies.** See §5 for why this document recommends headers over
  cookies as the near-term target, with cookies as a possible *later* phase if the team
  wants the additional XSS-hardening benefit and is willing to take on CSRF protections.
- **Does not touch `docs/audits/ADMIN_SESSION_STORAGE_PERFORMANCE_AUDIT.md` or PR #335's
  code.** This branch is based on plain `main`.

---

## 4. Testing

`scripts/test-admin-token-header-auth.js` (new) proves, against a real spawned server:

- Static: the helper exists, and **zero** GET admin endpoints still read the query param
  directly (all ~40 route through the helper).
- The legacy query-param path still works, unchanged.
- The same endpoints now also work with **only** an `Authorization: Bearer` header and no
  query param.
- A valid header wins over a garbage/wrong query param.
- An invalid header is **not** silently bypassed by falling back to a valid query param
  (i.e., providing a header opts you into header-based validation — it doesn't create a
  "try both, take either" security weakening).
- No credential anywhere still correctly returns 401, same as before.
- A malformed (non-`Bearer`) `Authorization` header degrades gracefully to the query-param
  fallback instead of erroring.
- POST admin endpoints (`body.adminToken`) are unaffected.

Also ran the broader existing regression suite (`test-admin-auth-session.js`,
`test-platform-wide-audit-regression.js`, `test-admin-full-remaining.js`,
`test-store-safety-guards.js`, `test-billing-membership-qa.js`,
`test-admin-analytics-root-cause.js`, `test-store-write-race.js`,
`test-curriculum-activities-wipe-protection.js`) — all pass, no regressions from the
40-call-site refactor.

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
| **1** | Server: add `extractAdminToken()`, wire into all 40 GET endpoints, accept header OR query param | Low — purely additive, nothing removed | **This PR** |
| **2** | Client: update all `app.js` admin `fetch()` calls to send `Authorization: Bearer` and stop sending `?adminToken=...` in the URL | Medium — ~100 call sites, needs its own careful review/testing | Not started (separate PR) |
| **3** | Server: after Phase 2 has been live and verified for a reasonable window, remove the query-param fallback from `extractAdminToken()` (one-line change, but only safe once no client depends on it) | Low, but timing-dependent on Phase 2 | Not started |
| **4** (optional, separate decision) | Consider `httpOnly` cookie + CSRF protections for the extra XSS-hardening benefit | Higher — new infra, new attack surface (CSRF) to defend | Not scoped; separate follow-up if wanted |

## 7. Rollback plan

Revert this PR. `extractAdminToken()` and its 40 call sites are the only change; reverting
restores the exact previous `url.searchParams.get("adminToken")` reads. No data migration,
no client changes, nothing to undo elsewhere — this PR is additive-only by construction.

## 8. Confirmation

No production data, Stripe objects, or admin sessions were touched by this change or by
producing this document. No merge or deploy was performed. Stopping here for approval as
instructed.

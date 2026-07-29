# Custom domain DNS (`littlelearnershubbyleah.com`)

Provider-agnostic checklist. The app does **not** assume any DNS host/provider — only whether records point at Render.

## Correct records

| Host | Type | Value |
|---|---|---|
| `www` | CNAME | `little-learner-hub.onrender.com` |
| `@` (apex) | A | `216.24.57.1` |

Also in Render → Custom Domains: add both hosts and confirm certificates are issued.

## Registrar vs nameservers

Where you renew the domain (e.g. Namecheap) can differ from which hosts are **authoritative** for DNS.

1. Check Namecheap → Domain List → Manage → **Nameservers**.
2. Public `dig NS littlelearnershubbyleah.com` must match the provider where you edit A/CNAME records.
3. If nameservers are still custom/third-party, Namecheap **Advanced DNS** changes are ignored until you either:
   - switch nameservers to Namecheap DNS, **or**
   - edit the zone at the host those nameservers belong to.

## Live checks in the app

After this change is deployed:

- Admin → Safety Center → **Custom domain DNS**
- `GET /api/domain-dns-check`

Statuses mean:

| Status | Meaning |
|---|---|
| `ready` | A/CNAME points at Render |
| `misconfigured` | Records exist but do not point at Render |
| `missing` | No A/CNAME found |
| `error` | Lookup failed |

Nameservers are shown only as context (which zone is live), never as a failure reason.

## Working URLs today

- `https://littlelearnershubbyleah.com/` — already on Render (Namecheap nameservers + correct A/CNAME)
- `https://www.littlelearnershubbyleah.com/` — redirects to the apex official site
- `https://little-learner-hub.onrender.com/`

## Deprecated domain (`littlelearnerhub.com`) — why people see “can’t be found”

`littlelearnerhub.com` is **not** this app anymore. Public DNS for that old name points at **Bluehost / Cloudflare**, not Render. Browsers hit a Cloudflare challenge or a parking page — it looks like the site is missing.

**Official site only:** `https://littlelearnershubbyleah.com`

### Fix for the old domain (do this in Bluehost / wherever `littlelearnerhub.com` DNS is hosted)

Point the old name at a redirect to the official site (do **not** leave it on a parked Bluehost page):

1. Log into Bluehost (nameservers today: `ns1.bluehost.com` / `ns2.bluehost.com`).
2. For `littlelearnerhub.com` and `www.littlelearnerhub.com`, set a **domain redirect / forwarding** to  
   `https://littlelearnershubbyleah.com` (301 permanent).
3. Or, if you prefer DNS-only: add the old apex/www as Render custom domains and CNAME/A them like the official domain — then the app can serve/redirect. Forwarding at Bluehost is usually simpler.

Until that redirect is set, anyone using the old bookmark/link will keep saying the website “can’t be found.”

## Verify from any machine

```bash
dig +short littlelearnershubbyleah.com NS
dig +short www.littlelearnershubbyleah.com CNAME   # expect little-learner-hub.onrender.com.
dig +short littlelearnershubbyleah.com A           # expect 216.24.57.1
curl -sI https://littlelearnershubbyleah.com/ | head
curl -s https://littlelearnershubbyleah.com/api/health
```

`/api/domain-dns-check` should report `"ready": true` for both brand apex and www.

## Optional after brand domain is ready

```bash
SITE_URL=https://littlelearnershubbyleah.com
```

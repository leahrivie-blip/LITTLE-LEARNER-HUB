# Custom domain DNS (`littlelearnerhub.com`)

## Share this website link (working now)

**https://littlelearnershubbyleah.com/**

Also works: https://little-learner-hub.onrender.com/

Render is healthy. `littlelearnershubbyleah.com` is the public entry link to use today.

## Broken brand domain (do not share yet)

https://littlelearnerhub.com/ and https://www.littlelearnerhub.com/ currently fail for visitors (HTTP 403 / challenge page). They do **not** point at Render yet.

Live check: `GET /api/domain-dns-check` (includes `shareUrl` → `https://littlelearnershubbyleah.com`).

Provider-agnostic checklist below. The app does **not** assume any DNS host/provider — only whether records point at Render.

## Correct records for the brand domain

Edit DNS in whatever zone is **authoritative** for `littlelearnerhub.com` (check `dig NS littlelearnerhub.com`):

| Host | Type | Value |
|---|---|---|
| `www` | CNAME | `little-learner-hub.onrender.com` |
| `@` (apex) | A | `216.24.57.1` |

Also:

1. Remove any A/AAAA that is **not** Render.
2. In Render → Custom Domains: add both hosts and confirm certificates are issued.

## Registrar vs nameservers

Where you renew the domain (e.g. Namecheap) can differ from which hosts are **authoritative** for DNS.

1. Check the registrar → Domain List → Manage → **Nameservers**.
2. Public `dig NS littlelearnerhub.com` must match the provider where you edit A/CNAME records.
3. If nameservers are still custom/third-party, registrar **Advanced DNS** changes are ignored until you either:
   - switch nameservers to that registrar's DNS, **or**
   - edit the zone at the host those nameservers belong to.

## Live checks in the app

- Admin → Safety Center → **Custom domain DNS**
- `GET /api/domain-dns-check` (includes `shareUrl` + `entryLinkNote`)

Statuses mean:

| Status | Meaning |
|---|---|
| `ready` | A/CNAME points at Render |
| `misconfigured` | Records exist but do not point at Render |
| `missing` | No A/CNAME found |
| `error` | Lookup failed |

Nameservers are shown only as context (which zone is live), never as a failure reason.

## Verify from any machine

```bash
dig +short littlelearnerhub.com NS
dig +short www.littlelearnerhub.com CNAME   # expect little-learner-hub.onrender.com
dig +short littlelearnerhub.com A           # expect 216.24.57.1
curl -sI https://littlelearnershubbyleah.com/ | head
curl -s https://little-learner-hub.onrender.com/api/domain-dns-check
```

`/api/domain-dns-check` should report `"ready": true` for both brand apex and www before you share the brand domain.

## SITE_URL

Keep production on the working domain:

```bash
SITE_URL=https://littlelearnershubbyleah.com
```

After `littlelearnerhub.com` is ready and certificates are issued, you may optionally switch:

```bash
SITE_URL=https://www.littlelearnerhub.com
```

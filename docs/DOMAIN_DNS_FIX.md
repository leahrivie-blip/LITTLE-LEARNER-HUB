# Fix: littlelearnerhub.com custom domain

## Why the earlier report mentioned Bluehost

A domain’s **registrar** (where you buy/renew it — e.g. Namecheap) is not always the same as its **authoritative DNS host**.

Public DNS for `littlelearnerhub.com` was resolving through nameservers:

- `ns1.bluehost.com`
- `ns2.bluehost.com`

…and the apex **A** record from those nameservers was `66.235.200.145` (not Render).

That is why the first PR wording said “Bluehost”: the **live internet answers** came from Bluehost nameservers, even if the domain is registered at Namecheap.

Meanwhile, the working share domain `littlelearnershubbyleah.com` already uses Namecheap nameservers (`dns1.registrar-servers.com` / `dns2.registrar-servers.com`) and correctly points at Render.

### Common Namecheap gotcha
If Namecheap → Domain → **Nameservers** is set to custom hosts (Bluehost, Cloudflare, etc.), then changes under Namecheap **Advanced DNS** do **not** go live. Only the zone served by the listed nameservers matters.

**Fix path options:**
1. Point nameservers to Namecheap BasicDNS / PremiumDNS / FreeDNS, wait for NS propagation, then set Advanced DNS records there, **or**
2. Leave nameservers as-is and edit the A/CNAME records in whatever host those nameservers belong to.

---

## What “correct” looks like (provider-agnostic)

| Host | Type | Value |
|---|---|---|
| `www` | CNAME | `little-learner-hub.onrender.com` |
| `@` (apex) | A | `216.24.57.1` |

Also in Render → Custom Domains: add both hosts and wait for certificates.

### Live check in the app
- Admin → Safety Center → **Custom domain DNS**
- Or: `GET /api/domain-dns-check`

The checker **does not care** whether DNS is Namecheap, Bluehost, Cloudflare, etc. It only reports whether A/CNAME records point at Render. Nameservers are shown as informational context so you know *which* DNS zone is authoritative.

---

## Working links

- **https://littlelearnershubbyleah.com/** (already on Render)
- **https://little-learner-hub.onrender.com/**

---

## Verify

```bash
dig +short littlelearnerhub.com NS
# whichever hosts answer here are authoritative

dig +short www.littlelearnerhub.com CNAME
# expect: little-learner-hub.onrender.com.

dig +short littlelearnerhub.com A
# expect: 216.24.57.1

curl -s https://www.littlelearnerhub.com/api/health
curl -s https://littlelearnershubbyleah.com/api/domain-dns-check
```

`domain-dns-check` should return `"ready": true` with host statuses `"ready"` — not `"misconfigured"`.

---

## Optional after certs are live

```bash
SITE_URL=https://www.littlelearnerhub.com
```

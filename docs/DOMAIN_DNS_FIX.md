# Fix: littlelearnerhub.com not loading

## What’s broken right now

| URL | Result |
|---|---|
| `https://little-learner-hub.onrender.com/` | **Works** — live Render app |
| `https://littlelearnershubbyleah.com/` | **Works** — custom domain already on Render |
| `https://littlelearnerhub.com/` | **Broken** — still on Bluehost (`66.235.200.145`), Cloudflare “Just a moment…” / 403 |
| `https://www.littlelearnerhub.com/` | **Broken** — same (www currently aliases/apex-resolves to Bluehost) |

### Root cause
`littlelearnerhub.com` nameservers are still **Bluehost** (`ns1.bluehost.com` / `ns2.bluehost.com`) and the apex **A** record is still **`66.235.200.145`** (Bluehost/iPower), **not** Render’s load balancer.

Visitors never reach Little Learner Hub. This cannot be fixed in app code alone — DNS must be changed in Bluehost (and both hosts added in Render).

### Live check in the app
- Admin → Owner Command Center → **Safety Center** → **Custom domain DNS** (Refresh Safety)
- Or: `GET /api/domain-dns-check` on any live host

---

## Working links to share immediately

Until DNS is fixed, share either:

- **https://littlelearnershubbyleah.com/**
- **https://little-learner-hub.onrender.com/**

Production `SITE_URL` is already `https://littlelearnershubbyleah.com`.

---

## Permanent fix (Bluehost + Render)

### 1) Add the custom domain in Render
1. Open [Render Dashboard](https://dashboard.render.com) → service `little-learner-hub`
2. **Settings → Custom Domains → Add**
3. Add both:
   - `www.littlelearnerhub.com`
   - `littlelearnerhub.com`
4. Confirm Render expects the values below (see also [Configure other DNS](https://render.com/docs/configure-other-dns))

### 2) Change DNS in Bluehost
1. Log into Bluehost → **Domains → littlelearnerhub.com → DNS**
2. Set exactly:

| Type | Name/Host | Value | Notes |
|---|---|---|---|
| **CNAME** | `www` | `little-learner-hub.onrender.com` | Prefer CNAME for www (not an A to Bluehost) |
| **A** | `@` (apex) | `216.24.57.1` | Render load balancer IPv4 |

3. **Remove / replace** any apex **A** record pointing to `66.235.200.145`
4. **Remove AAAA** records for `@` / `www` if present (IPv6 mismatches break HTTPS)
5. If Cloudflare is in front of Bluehost for this zone: use **DNS only** (grey cloud), not proxied orange cloud, until certs issue
6. Save and wait 5–30 minutes (sometimes longer)

Keeping Bluehost **nameservers** is fine — you are only changing the A/CNAME records there.

### 3) Turn off the stuck Cloudflare challenge (if still present)
If a Cloudflare panel still applies to `littlelearnerhub.com`:
1. Set **Security level** to **Medium** or **Essentially Off** (not “I’m Under Attack”)
2. Disable **Bot Fight Mode** / aggressive managed challenges for the homepage if present
3. SSL/TLS mode: **Full (strict)** once the Render cert is issued

### 4) Set production `SITE_URL` (optional, after certs)
In Render → Environment, after both hosts show a valid cert:

```bash
SITE_URL=https://www.littlelearnerhub.com
```

Redeploy after saving. Until then, keep sharing `https://littlelearnershubbyleah.com`.

### 5) Verify
```bash
dig +short www.littlelearnerhub.com CNAME
# expect: little-learner-hub.onrender.com.

dig +short littlelearnerhub.com A
# expect: 216.24.57.1

curl -sI https://www.littlelearnerhub.com/ | head
curl -s https://www.littlelearnerhub.com/api/health
curl -s https://littlelearnershubbyleah.com/api/domain-dns-check
```

You should see **HTTP 200**, JSON with `"ok": true`, and domain-dns-check `"ready": true` — **not** Cloudflare “Just a moment…”.

Also open the URL in a private browser window and confirm the Little Learner Hub homepage loads.

In Admin → Safety Center, **Brand domain DNS** should show **Ready**.

---

## How we confirmed this

- Render URL and `littlelearnershubbyleah.com` return the real app (`#view-home`)
- Brand domain A record is `66.235.200.145` → Bluehost/iPower
- Brand NS are `ns1.bluehost.com` / `ns2.bluehost.com`
- Working domain already resolves to Render (`216.24.57.1` / CNAME `little-learner-hub.onrender.com`)

# Fix: littlelearnerhub.com not loading

## What’s broken right now

| URL | Result |
|---|---|
| `https://little-learner-hub.onrender.com/` | **Works** — this is the live Little Learner Hub app |
| `https://littlelearnerhub.com/` | **Broken** — Cloudflare “Just a moment…” security check that never finishes |
| `https://www.littlelearnerhub.com/` | **Broken** — same stuck Cloudflare challenge |

### Root cause
The custom domain still points at **Bluehost / iPower** (`host77.ipowerweb.com`, nameservers `ns1.bluehost.com` / `ns2.bluehost.com`), **not** at the Render app.

Visitors never reach Little Learner Hub. They hit a Cloudflare bot challenge in front of the old Bluehost host, and that challenge stays stuck.

This cannot be fixed in app code alone. DNS must be changed.

---

## Working link to share immediately

Until DNS is fixed, share this URL:

**https://little-learner-hub.onrender.com/**

---

## Permanent fix (do this in Bluehost + Render)

### 1) Add the custom domain in Render
1. Open [Render Dashboard](https://dashboard.render.com) → service `little-learner-hub`
2. **Settings → Custom Domains → Add**
3. Add both:
   - `www.littlelearnerhub.com`
   - `littlelearnerhub.com`
4. Copy the exact DNS values Render shows (CNAME / A / ALIAS targets)

### 2) Change DNS in Bluehost
1. Log into Bluehost → **Domains → littlelearnerhub.com → DNS**
2. Update records to what Render shows. Typical pattern:

| Type | Name/Host | Value | Proxy |
|---|---|---|---|
| **CNAME** | `www` | `little-learner-hub.onrender.com` | DNS only / grey cloud if Cloudflare is involved |
| **A** or **ALIAS** | `@` (apex) | value Render gives for apex | DNS only |

3. **Remove / replace** the current apex A record that points to `66.235.200.145` (Bluehost/iPower)
4. Save and wait 5–30 minutes (sometimes up to a few hours)

### 3) Turn off the stuck Cloudflare challenge
If Bluehost still routes through Cloudflare:
1. Open Cloudflare (or Bluehost’s Cloudflare panel) for `littlelearnerhub.com`
2. Set **Security level** to **Medium** or **Essentially Off** (not “I’m Under Attack”)
3. Disable **Bot Fight Mode** / aggressive managed challenges for the homepage if present
4. SSL/TLS mode: **Full (strict)** once Render cert is issued

### 4) Set production `SITE_URL`
In Render → Environment:

```bash
SITE_URL=https://www.littlelearnerhub.com
```

(Use whichever host you choose as primary once DNS works.)

Redeploy after saving.

### 5) Verify
```bash
curl -sI https://www.littlelearnerhub.com/ | head
curl -s https://www.littlelearnerhub.com/api/health
```

You should see **HTTP 200** and JSON with `"ok": true` — **not** Cloudflare “Just a moment…”.

Also open the URL in a private browser window and confirm the Little Learner Hub homepage loads.

---

## How we confirmed this

- Render URL returns the real app HTML and `#view-home`
- Custom domain returns `cf-mitigated: challenge` and stays on “Performing security verification”
- DNS A record for the domain is `66.235.200.145` → `host77.ipowerweb.com` (Bluehost), while Render is on `*.onrender.com`

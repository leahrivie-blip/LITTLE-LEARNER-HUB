# Fix: Upgrade web service Free → Starter (stops Postgres disconnect emails)

## Why this is needed

Production `LITTLE-LEARNER-HUB` was still on Render’s **Free** instance type.

Free web services **spin down after ~15 minutes with no traffic**. When they wake (or during deploys), open Postgres TCP connections are severed mid-write. The app then emails:

`[LLH SAFETY] postgres_disconnect` (`postgres_write_failed` / `Connection terminated unexpectedly`)

Code fixes already shipped (pool retry + reconnect + GitHub keepalive). Those reduce the damage. **Upgrading to Starter stops the spin-down**, which is the durable fix.

`render.yaml` already says `plan: starter`. The live service must match.

| Instance | Spin-down when idle? | Cost (approx.) |
|---|---|---|
| **Free** (current live) | Yes (~15 min) | $0 |
| **Starter** (needed) | No | ~$7/month |

Postgres (`little-learner-hub-db`, Basic 256 MB) can stay as-is.

## Exact steps in Render Dashboard (2 minutes)

1. Open the service:  
   https://dashboard.render.com/web/srv-d8o3f3r6sc1c73comlc0
2. Go to **Settings**.
3. Find **Instance Type** (sometimes labeled **Plan**).
4. Change **Free** → **Starter**.
5. Save. If Render asks for a payment method, add one (required for paid instances).
6. Trigger a deploy if Render does not automatically (Manual Deploy → Deploy latest commit), **or** wait for the next push to `main`.

## Verify after upgrade

```bash
# Plan should show starter (API)
curl -sS -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/srv-d8o3f3r6sc1c73comlc0" \
  | python3 -c 'import json,sys;s=json.load(sys.stdin).get("service",{});print(s["serviceDetails"]["plan"])'

# App still healthy
curl -sS https://littlelearnershubbyleah.com/api/launch-readiness \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["ready"], d["required"]["database"])'
curl -sS https://littlelearnershubbyleah.com/api/public/home-inventory
```

Expect: `plan` = `starter`, database `ready: true`, inventory still **89** lessons / **1500** activities.

## Related (not fixed by this upgrade)

- Old domain `littlelearnerhub.com` still points at Bluehost/Cloudflare — see `docs/DOMAIN_DNS_FIX.md` (301 redirect to `https://littlelearnershubbyleah.com`).
- Official site remains `https://littlelearnershubbyleah.com`.

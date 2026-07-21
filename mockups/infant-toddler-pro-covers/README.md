# Infant / Toddler Pro covers — approval gate

**Do not apply these covers to the live library until Leah approves the style.**

## Preview

Serve the repo and open:

`mockups/infant-toddler-pro-covers/index.html`

Or from repo root:

```bash
python3 -m http.server 4173
# open http://localhost:4173/mockups/infant-toddler-pro-covers/
```

## Samples

1. `mockup-cover-zoo-animals.png` — Infant Zoo Animals
2. `mockup-cover-amazing-insects.png` — Toddler Amazing Insects
3. `mockup-cover-weather-lab.png` — Toddler Weather Lab

Each mockup is 16:9, **bold cartoon / picture-book style** (flat color, thick outlines — not soft AI-rendered realism). No text baked into the art; title overlay is HTML card chrome only.

Round 2 revised after feedback that round 1 looked too AI-generated.

## After approval

Generate matching covers for every **READY** weekly plan + monthly curriculum collection, map them in `scripts/lesson-plan-cover-catalog.js`, then regression-test cover persistence.

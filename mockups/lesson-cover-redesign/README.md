# Lesson cover redesign — mockups for approval

**Status:** Awaiting approval before any live library changes.

## What’s included

- `index.html` — review page with proposed Netflix-style cards
- `covers/*.jpg` — 8 themed 16:9 cover examples
- `screenshots/` — desktop + mobile captures for approval
- Capture helper: `node scripts/capture-cover-redesign-mockups.js`

### Preview locally

```bash
python3 -m http.server 4173
# open http://localhost:4173/mockups/lesson-cover-redesign/
```

## Example themes

| Theme | Cover communicates |
| --- | --- |
| Pirate Adventure | Ship, treasure map, chest |
| Construction Crew | Vehicles, hard hats, cones |
| Farm Friends | Barn + farm animals |
| Dinosaur Discovery | Friendly dinosaurs |
| Ocean Adventure | Ocean animals / reef |
| Bugs & Butterflies | Butterflies, insects, flowers |
| Around the World | Globe + landmarks |
| Space Explorers | Rocket, planets, stars |

## Card layout (proposed)

- Large 16:9 cover image
- FREE / PRO badge (top-left)
- Favorite star (top-right)
- Clean title
- Age group + activity count
- Use This Plan CTA
- Wider Netflix-style card (~300px desktop)

## Not changed yet

- Production library covers
- `scripts/lesson-plan-covers.js` mapping
- Admin upload flow
- Card click / Use / Favorite / Calendar behavior

## After approval

1. Generate themed covers for the full cover library
2. Wire JPG/WebP assets into the cover resolver
3. Apply refined card CSS in `styles/llh-library-browse.css`
4. Run regression suite listed in the product requirement

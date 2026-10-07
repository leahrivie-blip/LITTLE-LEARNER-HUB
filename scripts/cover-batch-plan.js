#!/usr/bin/env node
'use strict';

const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('docs/cover-quality/lesson-cover-audit.json', 'utf8'));
const remaining = JSON.parse(
  fs.readFileSync('/opt/cursor/artifacts/cover-validation/batches/remaining.json', 'utf8')
);

const STYLE =
  'STYLE LOCK (Little Learner Hub Validation Batch 01 — do not drift): warm children\'s picture-book illustration; soft digital/watercolor texture; clearly illustrated not photographic; expressive but natural children; age-accurate environments; ONE obvious theme/focal story; premium detail without clutter; clean crop-safe composition; quiet upper area for UI title; NO baked-in titles; NO random text/signs/logos; NO excessive decorative objects; NO obvious AI anatomy/artifacts; NOT photorealistic, NOT 3D, NOT anime, NOT clip-art. Landscape 16:9 lesson-card cover.';

const AGE = {
  infant:
    'INFANT: show babies/young infants and caregivers where appropriate; floor play, tummy time, sensory exploration, soft materials, grasping/reaching. NO preschool-looking children or preschool classroom scenes.',
  toddler:
    'TODDLER: young toddlers (~1–3) with toddler proportions in simple hands-on/play-based exploration. Not preschool 4–5 year olds.',
  preschool:
    'PRESCHOOL: children ~3–5 in developed pretend play, investigation, building, art, or nature exploration as fits the lesson.',
  'school-age':
    'SCHOOL-AGE: older children with age-appropriate activity visuals.',
};

function slug(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function sceneHint(b, a) {
  const overview = (b?.contentContext?.weeklyOverview || '').slice(0, 220);
  const acts = (b?.contentContext?.sampleActivities || []).slice(0, 5).join('; ');
  const theme = b?.themeHint || a.title;
  const objectThemes =
    /farm|animal|insect|bug|weather|ocean|sea|space|color|shape|apple|pumpkin|garden|plant|dinosaur|zoo|pet/i;
  const preferObjects = objectThemes.test(theme) || objectThemes.test(a.title);
  return { overview, acts, theme, preferObjects };
}

const briefsById = Object.fromEntries((pkg.replacementBriefs || []).map((b) => [b.lessonId, b]));
const batches = [];

function pushBatch(name, items) {
  if (!items.length) return;
  for (let i = 0; i < items.length; i += 18) {
    const chunk = items.slice(i, i + 18);
    const part = items.length > 18 ? `-p${Math.floor(i / 18) + 1}` : '';
    batches.push({
      id: `batch-${String(batches.length + 2).padStart(2, '0')}-${name}${part}`,
      name,
      lessons: chunk.map((a) => {
        const b = briefsById[a.id];
        const h = sceneHint(b, a);
        const ageGuide = AGE[a.ageBand] || AGE.preschool;
        const focus =
          h.preferObjects && a.ageBand !== 'infant'
            ? 'Theme may be shown primarily through illustrated objects/animals/environment with optional 1–2 age-appropriate children — avoid crowded identical classroom scenes.'
            : 'Show age-appropriate characters engaged in the lesson theme; keep composition uncluttered (2–4 figures max).';
        const prompt = [
          STYLE,
          `LESSON: "${a.title}" | Age: ${a.age} | Theme: ${h.theme}`,
          ageGuide,
          focus,
          `Content context: ${h.overview || 'Use title/theme faithfully.'}`,
          `Sample activities: ${h.acts || 'n/a'}`,
          'Create one clear focal scene that instantly communicates this lesson theme. Vary setting from generic classrooms when theme allows (outdoors, centers, home-like care rooms, nature, dramatic play areas).',
        ].join('\n');
        return {
          lessonId: a.id,
          title: a.title,
          age: a.age,
          ageBand: a.ageBand,
          theme: h.theme,
          filename: `rep-${slug(a.title)}.jpg`,
          prompt,
          overview: h.overview,
          activities: h.acts,
        };
      }),
    });
  }
}

const byAge = remaining.byAge;
pushBatch('infant', (byAge.infant||[]).map(a=>({...a,ageBand:'infant'})));
pushBatch('toddler', (byAge.toddler||[]).map(a=>({...a,ageBand:'toddler'})));
pushBatch('preschool', (byAge.preschool||[]).map(a=>({...a,ageBand:'preschool'})));
pushBatch('school-age', (byAge['school-age']||[]).map(a=>({...a,ageBand:'school-age'})));

const plan = {
  lockedStyle: STYLE,
  approvedFromVal01: remaining.approved,
  easterRegen: remaining.easter,
  totalRemaining: remaining.remaining.length,
  batches: batches.map((b) => ({
    id: b.id,
    name: b.name,
    count: b.lessons.length,
    titles: b.lessons.map((l) => l.title),
  })),
  fullBatches: batches,
};

fs.mkdirSync('/opt/cursor/artifacts/cover-validation/batches', { recursive: true });
fs.writeFileSync(
  '/opt/cursor/artifacts/cover-validation/batches/plan.json',
  JSON.stringify(plan, null, 2)
);
console.log(JSON.stringify(plan.batches, null, 2));
console.log(
  'total lessons in batches',
  batches.reduce((n, b) => n + b.lessons.length, 0)
);

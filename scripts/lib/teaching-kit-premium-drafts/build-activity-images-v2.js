/**
 * Activity-specific draft setup illustrations (SVG→PNG) for the four premium TK drafts.
 * Polished flat cartoon classroom style — unique per filename.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "../../..");
const OUT = path.join(ROOT, "images/teaching-kit-drafts");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/** Warm classroom backdrop — no activity title text in the art plane. */
function room({ wall = "#fff4e8", floor = "#f6dfc4" } = {}) {
  return `
  <rect width="1024" height="768" fill="${wall}"/>
  <rect x="0" y="520" width="1024" height="248" fill="${floor}"/>
  <rect x="0" y="512" width="1024" height="10" fill="#e8c9a8"/>
  <!-- soft window light -->
  <rect x="720" y="80" width="220" height="180" rx="8" fill="#ffe8b8" opacity="0.55"/>
  <rect x="720" y="80" width="220" height="180" rx="8" fill="none" stroke="#f0c987" stroke-width="6"/>
  <line x1="830" y1="80" x2="830" y2="260" stroke="#f0c987" stroke-width="4"/>
  <line x1="720" y1="170" x2="940" y2="170" stroke="#f0c987" stroke-width="4"/>`;
}

/** Caregiver seated (adult) — simple, warm. */
function caregiver({ x = 220, y = 430, shirt = "#5b8def" } = {}) {
  return `
  <ellipse cx="${x}" cy="${y + 90}" rx="70" ry="22" fill="#000" opacity="0.08"/>
  <circle cx="${x}" cy="${y - 70}" r="42" fill="#f2c4a0"/>
  <ellipse cx="${x - 18}" cy="${y - 78}" rx="5" ry="6" fill="#3f2a1d"/>
  <ellipse cx="${x + 18}" cy="${y - 78}" rx="5" ry="6" fill="#3f2a1d"/>
  <path d="M${x - 14} ${y - 55} Q${x} ${y - 45} ${x + 14} ${y - 55}" fill="none" stroke="#b07a55" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x - 55} ${y - 20} Q${x} ${y + 40} ${x + 55} ${y - 20}" fill="${shirt}"/>
  <ellipse cx="${x - 48}" cy="${y + 10}" rx="16" ry="22" fill="#f2c4a0"/>
  <ellipse cx="${x + 48}" cy="${y + 10}" rx="16" ry="22" fill="#f2c4a0"/>`;
}

/** Infant on tummy (0–6 mo) — chest down, head lifted toward props. */
function infantTummy({ x = 480, y = 470, facing = 1 } = {}) {
  const hx = x + facing * 36;
  return `
  <ellipse cx="${x}" cy="${y + 28}" rx="78" ry="20" fill="#000" opacity="0.07"/>
  <!-- torso -->
  <ellipse cx="${x}" cy="${y}" rx="70" ry="34" fill="#f0b890"/>
  <!-- head lifted -->
  <circle cx="${hx}" cy="${y - 42}" r="34" fill="#f2c4a0"/>
  <circle cx="${hx + facing * 10}" cy="${y - 48}" r="4" fill="#3f2a1d"/>
  <circle cx="${hx + facing * 22}" cy="${y - 48}" r="4" fill="#3f2a1d"/>
  <!-- soft onesie accent -->
  <ellipse cx="${x - facing * 8}" cy="${y + 4}" rx="48" ry="22" fill="#7ec8e3" opacity="0.85"/>
  <!-- arms forward -->
  <ellipse cx="${x + facing * 50}" cy="${y - 8}" rx="22" ry="12" fill="#f2c4a0"/>
  <ellipse cx="${x - facing * 40}" cy="${y + 2}" rx="18" ry="11" fill="#f2c4a0"/>`;
}

/** Preschool child standing/sitting — approx ages 3–5. */
function preschoolChild({ x = 300, y = 420, shirt = "#ff8a65", hair = "#5d4037", sit = false } = {}) {
  const bodyY = sit ? y + 20 : y;
  return `
  <ellipse cx="${x}" cy="${bodyY + (sit ? 70 : 95)}" rx="40" ry="14" fill="#000" opacity="0.08"/>
  <circle cx="${x}" cy="${bodyY - 55}" r="32" fill="#f2c4a0"/>
  <ellipse cx="${x}" cy="${bodyY - 72}" rx="34" ry="16" fill="${hair}"/>
  <circle cx="${x - 10}" cy="${bodyY - 58}" r="3.5" fill="#3f2a1d"/>
  <circle cx="${x + 10}" cy="${bodyY - 58}" r="3.5" fill="#3f2a1d"/>
  <path d="M${x - 10} ${bodyY - 45} Q${x} ${bodyY - 38} ${x + 10} ${bodyY - 45}" fill="none" stroke="#b07a55" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="${x - 28}" y="${bodyY - 22}" width="56" height="58" rx="16" fill="${shirt}"/>
  ${sit
    ? `<rect x="${x - 26}" y="${bodyY + 30}" width="22" height="36" rx="8" fill="#5c6bc0"/><rect x="${x + 4}" y="${bodyY + 30}" width="22" height="36" rx="8" fill="#5c6bc0"/>`
    : `<rect x="${x - 24}" y="${bodyY + 34}" width="18" height="48" rx="8" fill="#5c6bc0"/><rect x="${x + 6}" y="${bodyY + 34}" width="18" height="48" rx="8" fill="#5c6bc0"/>`}
  <ellipse cx="${x - 34}" cy="${bodyY + 5}" rx="10" ry="16" fill="#f2c4a0"/>
  <ellipse cx="${x + 34}" cy="${bodyY + 5}" rx="10" ry="16" fill="#f2c4a0"/>`;
}

function mat() {
  return `<ellipse cx="480" cy="530" rx="300" ry="85" fill="#ffd7a8"/><ellipse cx="480" cy="518" rx="260" ry="60" fill="#ffe4c4"/>`;
}

function table({ x = 180, y = 360, w = 660 } = {}) {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="36" rx="10" fill="#c48a4a"/>
  <rect x="${x + 30}" y="${y + 36}" width="28" height="120" rx="4" fill="#9a6a38"/>
  <rect x="${x + w - 58}" y="${y + 36}" width="28" height="120" rx="4" fill="#9a6a38"/>`;
}

function wrap(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">${room()}${inner}</svg>`;
}

/** Exact filename → SVG builder */
const GENERATORS = {
  // ——— Colors ———
  "colorful-tummy-time-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 430, y: 470, facing: 1 })}
    ${caregiver({ x: 220, y: 430, shirt: "#7eb6ff" })}
    <!-- bright toys at eye level -->
    <circle cx="620" cy="430" r="42" fill="#ffca28"/>
    <circle cx="620" cy="430" r="18" fill="#fff59d"/>
    <rect x="690" y="400" width="52" height="52" rx="12" fill="#ef5350"/>
    <rect x="760" y="410" width="48" height="48" rx="12" fill="#42a5f5"/>
  `),
  "tummy-color-mirror-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 400, y: 475, facing: 1 })}
    ${caregiver({ x: 200, y: 435, shirt: "#81c784" })}
    <!-- baby-safe mirror -->
    <rect x="580" y="320" width="130" height="170" rx="18" fill="#bbdefb" stroke="#1565c0" stroke-width="10"/>
    <rect x="600" y="345" width="90" height="110" rx="8" fill="#e3f2fd" opacity="0.85"/>
    <!-- color cloth accent near mirror -->
    <path d="M740 420 Q780 380 820 430 Q780 470 740 420" fill="#ff7043"/>
  `),
  "color-cloth-basket-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 380, y: 475, facing: 1 })}
    ${caregiver({ x: 190, y: 430, shirt: "#ce93d8" })}
    <!-- shallow basket with cloths -->
    <ellipse cx="680" cy="460" rx="110" ry="40" fill="#8d6e63"/>
    <ellipse cx="680" cy="445" rx="95" ry="28" fill="#a1887f"/>
    <path d="M610 400 Q640 360 670 410" fill="#e53935"/>
    <path d="M660 390 Q700 350 730 405" fill="#1e88e5"/>
    <path d="M710 400 Q750 365 780 415" fill="#43a047"/>
  `),
  "soft-color-reach-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 420, y: 470, facing: 1 })}
    <ellipse cx="640" cy="430" rx="48" ry="55" fill="#ffeb3b" stroke="#f9a825" stroke-width="6"/>
    <circle cx="640" cy="400" r="14" fill="#f57f17"/>
    <circle cx="640" cy="400" r="6" fill="#fff59d"/>
  `),
  "texture-mitts-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 400, y: 475, facing: 1 })}
    ${caregiver({ x: 210, y: 435, shirt: "#4fc3f7" })}
    <ellipse cx="620" cy="420" rx="40" ry="55" fill="#5c6bc0"/>
    <circle cx="605" cy="400" r="7" fill="#9fa8da"/>
    <circle cx="630" cy="415" r="7" fill="#9fa8da"/>
    <circle cx="615" cy="440" r="7" fill="#9fa8da"/>
    <ellipse cx="720" cy="425" rx="40" ry="55" fill="#ef5350"/>
    <circle cx="705" cy="405" r="7" fill="#ffcdd2"/>
    <circle cx="730" cy="420" r="7" fill="#ffcdd2"/>
  `),

  // ——— Black & White ———
  "tummy-pattern-line-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 420, y: 455, facing: 1 })}
    ${caregiver({ x: 200, y: 420, shirt: "#90a4ae" })}
    <!-- visual strip along mat edge -->
    <rect x="520" y="500" width="360" height="70" rx="8" fill="#fff" stroke="#111" stroke-width="5"/>
    <rect x="540" y="515" width="50" height="40" fill="#111"/>
    <circle cx="640" cy="535" r="16" fill="#111"/>
    ${Array.from({ length: 4 }, (_, i) => Array.from({ length: 3 }, (_, j) => ((i + j) % 2 === 0 ? `<rect x="${700 + j * 18}" y="${515 + i * 12}" width="18" height="12" fill="#111"/>` : "")).join("")).join("")}
    <rect x="800" y="515" width="50" height="40" fill="#111"/>
  `),
  "mirror-pattern-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 390, y: 470, facing: 1 })}
    ${caregiver({ x: 195, y: 430, shirt: "#78909c" })}
    <rect x="560" y="300" width="120" height="160" rx="14" fill="#bbdefb" stroke="#0d47a1" stroke-width="10"/>
    <rect x="580" y="330" width="80" height="100" rx="6" fill="#e3f2fd"/>
    <!-- pattern card beside mirror -->
    <rect x="720" y="340" width="100" height="100" fill="#fff" stroke="#111" stroke-width="6"/>
    <circle cx="770" cy="390" r="28" fill="none" stroke="#111" stroke-width="10"/>
  `),
  "arc-track-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 450, y: 475, facing: 1 })}
    ${caregiver({ x: 210, y: 430, shirt: "#607d8b" })}
    <path d="M320 300 Q520 180 740 320" fill="none" stroke="#78909c" stroke-width="8" stroke-dasharray="14 10"/>
    <rect x="700" y="280" width="90" height="90" fill="#fff" stroke="#111" stroke-width="6"/>
    ${Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => ((i + j) % 2 === 0 ? `<rect x="${712 + j * 18}" y="${292 + i * 18}" width="18" height="18" fill="#111"/>` : "")).join("")).join("")}
  `),
  "tummy-gallery-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 400, y: 465, facing: 1 })}
    ${caregiver({ x: 200, y: 425, shirt: "#546e7a" })}
    <rect x="560" y="360" width="80" height="80" fill="#fff" stroke="#111" stroke-width="5"/>
    ${Array.from({ length: 5 }, (_, i) => `<rect x="572" y="${375 + i * 12}" width="56" height="6" fill="#111"/>`).join("")}
    <rect x="660" y="360" width="80" height="80" fill="#fff" stroke="#111" stroke-width="5"/>
    <circle cx="700" cy="400" r="22" fill="#111"/>
    <rect x="760" y="360" width="80" height="80" fill="#fff" stroke="#111" stroke-width="5"/>
    ${Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => ((i + j) % 2 === 0 ? `<rect x="${772 + j * 16}" y="${372 + i * 16}" width="16" height="16" fill="#111"/>` : "")).join("")).join("")}
  `),
  "contrast-card-focus-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 420, y: 470, facing: 1 })}
    ${caregiver({ x: 205, y: 430, shirt: "#78909c" })}
    <rect x="600" y="300" width="150" height="150" fill="#fff" stroke="#111" stroke-width="8"/>
    ${Array.from({ length: 7 }, (_, i) => `<rect x="620" y="${320 + i * 18}" width="110" height="10" fill="#111"/>`).join("")}
  `),
  "bw-cloth-look-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 400, y: 475, facing: 1 })}
    <path d="M560 300 L780 300 L750 470 L590 470 Z" fill="#111"/>
    <path d="M560 300 L780 300 L750 380 L590 380 Z" fill="#fff"/>
  `),
  "contrast-ring-setup.png": () => wrap(`
    ${mat()}
    ${infantTummy({ x: 420, y: 470, facing: 1 })}
    ${caregiver({ x: 210, y: 430, shirt: "#90a4ae" })}
    <circle cx="660" cy="420" r="58" fill="none" stroke="#111" stroke-width="26"/>
    <circle cx="660" cy="420" r="58" fill="none" stroke="#fff" stroke-width="10"/>
  `),

  // ——— Community Helpers ———
  "discovery-basket-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 280, y: 400, shirt: "#ff8a65", sit: true })}
    ${preschoolChild({ x: 820, y: 410, shirt: "#4fc3f7", sit: true })}
    <ellipse cx="520" cy="330" rx="140" ry="55" fill="#8d6e63"/>
    <ellipse cx="520" cy="310" rx="120" ry="38" fill="#a1887f"/>
    <rect x="430" y="240" width="48" height="70" rx="6" fill="#e53935"/>
    <rect x="495" y="230" width="48" height="80" rx="6" fill="#1e88e5"/>
    <rect x="560" y="245" width="48" height="65" rx="6" fill="#43a047"/>
    <rect x="620" y="255" width="70" height="45" rx="8" fill="#fff8e1" stroke="#f9a825" stroke-width="4"/>
    <circle cx="655" cy="275" r="12" fill="#ff7043"/>
  `),
  "community-map-setup.png": () => wrap(`
    ${preschoolChild({ x: 200, y: 430, shirt: "#66bb6a" })}
    ${preschoolChild({ x: 860, y: 430, shirt: "#42a5f5" })}
    <rect x="260" y="160" width="520" height="340" rx="18" fill="#e8f5e9" stroke="#2e7d32" stroke-width="8"/>
    <circle cx="380" cy="280" r="48" fill="#66bb6a"/>
    <text x="355" y="360" font-family="Arial" font-size="22" fill="#1b5e20">Clinic</text>
    <rect x="470" y="250" width="90" height="70" rx="8" fill="#64b5f6"/>
    <text x="478" y="360" font-family="Arial" font-size="22" fill="#0d47a1">Library</text>
    <rect x="620" y="260" width="100" height="60" rx="8" fill="#ffca28"/>
    <text x="632" y="360" font-family="Arial" font-size="22" fill="#e65100">Market</text>
    <!-- path -->
    <path d="M380 320 Q500 400 670 310" fill="none" stroke="#81c784" stroke-width="8" stroke-dasharray="12 8"/>
  `),
  "healthcare-clinic-setup.png": () => wrap(`
    ${table({ y: 380 })}
    ${preschoolChild({ x: 250, y: 420, shirt: "#ef5350", sit: true })}
    ${preschoolChild({ x: 780, y: 420, shirt: "#26a69a", sit: true })}
    <!-- clinic sign -->
    <rect x="420" y="140" width="200" height="60" rx="10" fill="#e8f5e9" stroke="#2e7d32" stroke-width="5"/>
    <circle cx="460" cy="170" r="18" fill="#43a047"/>
    <rect x="454" y="155" width="12" height="30" fill="#fff"/>
    <rect x="445" y="164" width="30" height="12" fill="#fff"/>
    <text x="490" y="178" font-family="Arial" font-size="24" fill="#1b5e20">Clinic</text>
    <!-- doctor props -->
    <rect x="360" y="280" width="90" height="70" rx="10" fill="#fff" stroke="#29b6f6" stroke-width="5"/>
    <circle cx="550" cy="300" r="36" fill="#a5d6a7"/>
    <rect x="650" y="290" width="100" height="50" rx="8" fill="#81d4fa"/>
    <rect x="680" y="250" width="40" height="40" rx="6" fill="#ef9a9a"/>
  `),
  "firefighter-relay-setup.png": () => wrap(`
    ${preschoolChild({ x: 180, y: 430, shirt: "#ef5350" })}
    ${preschoolChild({ x: 860, y: 430, shirt: "#ffca28" })}
    <!-- cone path -->
    <polygon points="280,480 310,380 340,480" fill="#ff7043"/>
    <polygon points="420,480 450,390 480,480" fill="#ff7043"/>
    <polygon points="560,480 590,385 620,480" fill="#ff7043"/>
    <!-- hose / tunnel cue -->
    <path d="M300 360 Q500 280 700 360" fill="none" stroke="#ef5350" stroke-width="18" stroke-linecap="round"/>
    <rect x="700" y="300" width="120" height="90" rx="40" fill="#90caf9"/>
    <circle cx="760" cy="250" r="28" fill="#ffca28"/>
  `),
  "mail-center-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 240, y: 410, shirt: "#42a5f5", sit: true })}
    ${preschoolChild({ x: 820, y: 415, shirt: "#ffb74d", sit: true })}
    <rect x="400" y="130" width="220" height="55" rx="10" fill="#e3f2fd" stroke="#1565c0" stroke-width="5"/>
    <text x="445" y="165" font-family="Arial" font-size="24" fill="#0d47a1">Post Office</text>
    <rect x="340" y="250" width="120" height="90" rx="8" fill="#90caf9"/>
    <rect x="490" y="270" width="90" height="60" rx="6" fill="#fff59d"/>
    <rect x="610" y="255" width="110" height="80" rx="10" fill="#ffcc80"/>
    <rect x="640" y="275" width="50" height="35" fill="#fff" stroke="#ef6c00" stroke-width="3"/>
  `),
  "chef-kitchen-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 250, y: 415, shirt: "#ff7043", sit: true })}
    ${preschoolChild({ x: 800, y: 415, shirt: "#66bb6a", sit: true })}
    <rect x="420" y="130" width="180" height="55" rx="10" fill="#fff3e0" stroke="#ef6c00" stroke-width="5"/>
    <text x="470" y="165" font-family="Arial" font-size="24" fill="#e65100">Kitchen</text>
    <!-- shelves / food play -->
    <rect x="320" y="230" width="70" height="110" rx="6" fill="#a5d6a7"/>
    <rect x="410" y="230" width="70" height="110" rx="6" fill="#fff59d"/>
    <rect x="500" y="230" width="70" height="110" rx="6" fill="#ef9a9a"/>
    <ellipse cx="650" cy="300" rx="70" ry="40" fill="#bcaaa4"/>
    <circle cx="620" cy="290" r="16" fill="#ff7043"/>
    <circle cx="660" cy="285" r="16" fill="#ffca28"/>
    <circle cx="700" cy="295" r="16" fill="#66bb6a"/>
  `),
  "block-city-setup.png": () => wrap(`
    ${preschoolChild({ x: 200, y: 440, shirt: "#7e57c2" })}
    ${preschoolChild({ x: 850, y: 440, shirt: "#29b6f6" })}
    <rect x="280" y="400" width="90" height="90" fill="#ffb300"/>
    <rect x="390" y="350" width="80" height="140" fill="#ef5350"/>
    <rect x="490" y="370" width="110" height="120" fill="#42a5f5"/>
    <rect x="620" y="330" width="85" height="160" fill="#66bb6a"/>
    <rect x="720" y="380" width="70" height="110" fill="#ab47bc"/>
    <rect x="260" y="490" width="560" height="18" fill="#8d6e63"/>
  `),
  "tools-table-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 260, y: 415, shirt: "#ffa726", sit: true })}
    ${preschoolChild({ x: 800, y: 415, shirt: "#26c6da", sit: true })}
    <rect x="340" y="250" width="130" height="90" rx="12" fill="#fff8e1" stroke="#f9a825" stroke-width="5"/>
    <rect x="500" y="250" width="130" height="90" rx="12" fill="#e3f2fd" stroke="#0288d1" stroke-width="5"/>
    <rect x="660" y="250" width="130" height="90" rx="12" fill="#e8f5e9" stroke="#43a047" stroke-width="5"/>
    <!-- tool shapes -->
    <rect x="380" y="275" width="50" height="14" rx="4" fill="#6d4c41"/>
    <circle cx="560" cy="295" r="22" fill="#90a4ae"/>
    <rect x="700" y="280" width="40" height="40" rx="6" fill="#78909c"/>
  `),
  "helper-course-setup.png": () => wrap(`
    ${preschoolChild({ x: 170, y: 430, shirt: "#ec407a" })}
    ${preschoolChild({ x: 880, y: 430, shirt: "#5c6bc0" })}
    <circle cx="300" cy="420" r="45" fill="#ff7043"/>
    <rect x="400" y="380" width="160" height="80" rx="40" fill="#4fc3f7"/>
    <rect x="600" y="400" width="100" height="60" rx="10" fill="#aed581"/>
    <rect x="740" y="350" width="80" height="130" rx="12" fill="#ce93d8"/>
  `),
  "thankyou-studio-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 250, y: 415, shirt: "#f06292", sit: true })}
    <rect x="380" y="240" width="120" height="90" rx="8" fill="#fff" stroke="#bdbdbd" stroke-width="4"/>
    <rect x="530" y="250" width="45" height="70" fill="#f48fb1"/>
    <rect x="590" y="250" width="45" height="70" fill="#64b5f6"/>
    <rect x="650" y="250" width="45" height="70" fill="#ffd54f"/>
    <circle cx="760" cy="285" r="32" fill="#ef5350"/>
  `),

  // ——— Weather ———
  "cloud-process-art-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 240, y: 415, shirt: "#81d4fa", sit: true })}
    ${preschoolChild({ x: 820, y: 415, shirt: "#a5d6a7", sit: true })}
    <rect x="340" y="240" width="140" height="100" rx="8" fill="#90caf9"/>
    <circle cx="540" cy="270" r="36" fill="#fff"/>
    <circle cx="575" cy="255" r="32" fill="#fff"/>
    <circle cx="610" cy="275" r="34" fill="#fff"/>
    <rect x="680" y="250" width="70" height="70" rx="8" fill="#eceff1"/>
    <circle cx="500" cy="340" r="14" fill="#ff8a65"/>
    <circle cx="540" cy="340" r="14" fill="#ffd54f"/>
    <circle cx="580" cy="340" r="14" fill="#4fc3f7"/>
  `),
  "rain-sensory-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 230, y: 415, shirt: "#29b6f6", sit: true })}
    ${preschoolChild({ x: 830, y: 415, shirt: "#26c6da", sit: true })}
    <rect x="320" y="230" width="420" height="130" rx="18" fill="#4fc3f7"/>
    <rect x="360" y="255" width="50" height="70" rx="6" fill="#0288d1"/>
    <rect x="450" y="265" width="50" height="60" rx="6" fill="#0277bd"/>
    <circle cx="580" cy="295" r="22" fill="#e1f5fe"/>
    <path d="M640 250 L630 310" stroke="#01579b" stroke-width="6" stroke-linecap="round"/>
    <path d="M670 250 L660 310" stroke="#01579b" stroke-width="6" stroke-linecap="round"/>
    <path d="M700 250 L690 310" stroke="#01579b" stroke-width="6" stroke-linecap="round"/>
  `),
  "weather-dressup-setup.png": () => wrap(`
    ${table({ y: 400 })}
    ${preschoolChild({ x: 220, y: 430, shirt: "#ffca28" })}
    ${preschoolChild({ x: 820, y: 430, shirt: "#81d4fa" })}
    <rect x="340" y="220" width="90" height="140" rx="10" fill="#29b6f6"/>
    <rect x="450" y="230" width="90" height="130" rx="10" fill="#ffee58"/>
    <rect x="560" y="220" width="90" height="140" rx="10" fill="#b39ddb"/>
    <rect x="670" y="240" width="90" height="120" rx="10" fill="#ef9a9a"/>
    <circle cx="385" cy="200" r="22" fill="#ff7043"/>
    <ellipse cx="605" cy="200" rx="30" ry="14" fill="#5c6bc0"/>
  `),
  "wind-lab-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 240, y: 415, shirt: "#26c6da", sit: true })}
    ${preschoolChild({ x: 820, y: 415, shirt: "#7e57c2", sit: true })}
    <!-- pinwheel -->
    <circle cx="420" cy="270" r="55" fill="#80deea"/>
    <path d="M420 270 L470 230 L450 270 Z" fill="#00acc1"/>
    <path d="M420 270 L470 310 L450 270 Z" fill="#00838f"/>
    <path d="M420 270 L370 230 L390 270 Z" fill="#26c6da"/>
    <path d="M420 270 L370 310 L390 270 Z" fill="#4dd0e1"/>
    <circle cx="420" cy="270" r="10" fill="#006064"/>
    <rect x="415" y="325" width="10" height="50" fill="#8d6e63"/>
    <path d="M520 230 Q600 270 520 310" fill="none" stroke="#00bcd4" stroke-width="12" stroke-linecap="round"/>
    <rect x="640" y="250" width="140" height="80" rx="10" fill="#e0f7fa" stroke="#00838f" stroke-width="5"/>
  `),
  "weather-paint-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 240, y: 415, shirt: "#ec407a", sit: true })}
    ${preschoolChild({ x: 820, y: 415, shirt: "#ab47bc", sit: true })}
    <!-- process painting trays — different outcomes -->
    <rect x="320" y="230" width="100" height="100" rx="10" fill="#42a5f5"/>
    <rect x="440" y="230" width="100" height="100" rx="10" fill="#ffee58"/>
    <rect x="560" y="230" width="100" height="100" rx="10" fill="#78909c"/>
    <path d="M690 250 Q740 220 780 260 Q740 300 690 250" fill="#ef5350" opacity="0.85"/>
    <path d="M710 280 Q760 250 800 290" fill="none" stroke="#ab47bc" stroke-width="10"/>
    <rect x="340" y="350" width="280" height="24" rx="6" fill="#bdbdbd"/>
  `),
  "thunder-drum-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 250, y: 415, shirt: "#7e57c2", sit: true })}
    ${preschoolChild({ x: 800, y: 415, shirt: "#5c6bc0", sit: true })}
    <ellipse cx="400" cy="290" rx="75" ry="42" fill="#78909c"/>
    <ellipse cx="400" cy="275" rx="75" ry="28" fill="#90a4ae"/>
    <ellipse cx="560" cy="290" rx="75" ry="42" fill="#a1887f"/>
    <ellipse cx="560" cy="275" rx="75" ry="28" fill="#bcaaa4"/>
    <rect x="680" y="250" width="110" height="70" rx="12" fill="#ce93d8"/>
    <path d="M720 230 L740 250 L760 230" fill="none" stroke="#ffca28" stroke-width="8" stroke-linecap="round"/>
  `),
  "dress-relay-setup.png": () => wrap(`
    ${preschoolChild({ x: 160, y: 430, shirt: "#ff7043" })}
    ${preschoolChild({ x: 880, y: 430, shirt: "#29b6f6" })}
    <circle cx="280" cy="450" r="28" fill="#ff7043"/>
    <circle cx="760" cy="450" r="28" fill="#29b6f6"/>
    <rect x="360" y="280" width="90" height="130" rx="12" fill="#4fc3f7"/>
    <rect x="480" y="280" width="90" height="130" rx="12" fill="#ffee58"/>
    <rect x="600" y="280" width="90" height="130" rx="12" fill="#b39ddb"/>
    <path d="M300 400 L700 400" stroke="#90a4ae" stroke-width="6" stroke-dasharray="16 10"/>
  `),
  "clothing-sort-setup.png": () => wrap(`
    ${table()}
    ${preschoolChild({ x: 240, y: 415, shirt: "#ffa726", sit: true })}
    <rect x="340" y="240" width="110" height="100" rx="10" fill="#fff59d"/>
    <rect x="470" y="240" width="110" height="100" rx="10" fill="#90caf9"/>
    <rect x="600" y="240" width="110" height="100" rx="10" fill="#ce93d8"/>
    <rect x="730" y="240" width="110" height="100" rx="10" fill="#80deea"/>
  `),
  "weather-chart-setup.png": () => wrap(`
    ${preschoolChild({ x: 200, y: 440, shirt: "#42a5f5" })}
    <rect x="300" y="150" width="560" height="360" rx="14" fill="#fff" stroke="#0277bd" stroke-width="8"/>
    ${["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => `
      <rect x="${340 + i * 100}" y="200" width="85" height="250" fill="none" stroke="#039be5" stroke-width="3"/>
      <text x="${355 + i * 100}" y="230" font-family="Arial" font-size="18" fill="#01579b">${d}</text>`).join("")}
    <circle cx="382" cy="320" r="26" fill="#ffca28"/>
    <ellipse cx="580" cy="310" rx="30" ry="20" fill="#90a4ae"/>
  `),
};

/**
 * Explicit activity title → relative PNG path under images/teaching-kit-drafts/
 * Only activities that should carry an image.
 */
const TITLE_TO_IMAGE = {
  // Colors
  "Colorful Tummy Time": "colors-all-around-us/colorful-tummy-time-setup.png",
  "Tummy Time Color Mirror": "colors-all-around-us/tummy-color-mirror-setup.png",
  "Color Cloth Basket Gaze": "colors-all-around-us/color-cloth-basket-setup.png",
  // B&W
  "Tummy Time Pattern Adventure": "black-white-discovery/tummy-pattern-line-setup.png",
  "Mirror & Pattern Discovery": "black-white-discovery/mirror-pattern-setup.png",
  "Slow Pattern Arc Track": "black-white-discovery/arc-track-setup.png",
  "Tummy Contrast Gallery": "black-white-discovery/tummy-gallery-setup.png",
  // Community
  "Community Helper Discovery Basket": "community-helpers/discovery-basket-setup.png",
  "Community Map Talk": "community-helpers/community-map-setup.png",
  "Doctor's Office Dramatic Play": "community-helpers/healthcare-clinic-setup.png",
  "Firefighter Rescue Relay": "community-helpers/firefighter-relay-setup.png",
  "Mail Carrier Center": "community-helpers/mail-center-setup.png",
  "Chef's Kitchen": "community-helpers/chef-kitchen-setup.png",
  "Build a Community Block City": "community-helpers/block-city-setup.png",
  "Tool Exploration Table": "community-helpers/tools-table-setup.png",
  "Community Helper Obstacle Course": "community-helpers/helper-course-setup.png",
  // Weather
  "Cloud Cotton Art": "weather-watchers/cloud-process-art-setup.png",
  "Rain Drop Sensory Play": "weather-watchers/rain-sensory-setup.png",
  "Weather Dress-Up Center": "weather-watchers/weather-dressup-setup.png",
  "Windy Day Pinwheels": "weather-watchers/wind-lab-setup.png",
  "Rainbow After Rain Art": "weather-watchers/weather-paint-setup.png",
  "Thunder Drum Experiment": "weather-watchers/thunder-drum-setup.png",
  "Weather Dress Relay": "weather-watchers/dress-relay-setup.png",
};

async function generateAllMappedImages() {
  const written = [];
  const filesNeeded = new Set(Object.values(TITLE_TO_IMAGE).map((rel) => path.basename(rel)));
  for (const [file, gen] of Object.entries(GENERATORS)) {
    if (!filesNeeded.has(file) && !["soft-color-reach-setup.png", "texture-mitts-setup.png", "contrast-card-focus-setup.png", "bw-cloth-look-setup.png", "contrast-ring-setup.png", "thankyou-studio-setup.png", "clothing-sort-setup.png", "weather-chart-setup.png"].includes(file)) {
      // still generate mapped ones only primarily
    }
  }
  for (const rel of Object.values(TITLE_TO_IMAGE)) {
    const file = path.basename(rel);
    const gen = GENERATORS[file];
    if (!gen) throw new Error(`No generator for ${file}`);
    const abs = path.join(OUT, rel);
    ensureDir(path.dirname(abs));
    await sharp(Buffer.from(gen())).png().toFile(abs);
    written.push(rel);
  }
  return written;
}

module.exports = {
  GENERATORS,
  TITLE_TO_IMAGE,
  generateAllMappedImages,
  OUT,
};

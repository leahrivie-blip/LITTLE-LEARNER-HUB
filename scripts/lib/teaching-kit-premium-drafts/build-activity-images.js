/**
 * Generate simple cartoon setup illustrations (SVG→PNG) for activities that need images.
 * These are draft instructional visuals — not photorealistic people.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { KITS } = require("./index.js");

const ROOT = path.join(__dirname, "../../..");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function classroomBg(title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff7ed"/>
      <stop offset="100%" stop-color="#ffedd5"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="560" width="1024" height="208" fill="#fde68a" opacity="0.45"/>
  <text x="48" y="64" font-family="Arial, sans-serif" font-size="28" fill="#9a3412">${title.replace(/&/g, "&amp;")}</text>
  <text x="48" y="96" font-family="Arial, sans-serif" font-size="16" fill="#b45309">Little Learner Hub · DRAFT setup visual · Owner review</text>`;
}

function infantMatScene({ prop }) {
  return `${classroomBg("Infant setup")}
  <ellipse cx="520" cy="520" rx="280" ry="90" fill="#fdba74" opacity="0.7"/>
  <ellipse cx="520" cy="500" rx="220" ry="70" fill="#fed7aa"/>
  <!-- simple infant oval -->
  <ellipse cx="480" cy="470" rx="70" ry="40" fill="#fdba74"/>
  <circle cx="450" cy="430" r="36" fill="#fdba74"/>
  ${prop}
  </svg>`;
}

function preschoolTableScene({ prop, label }) {
  return `${classroomBg(label || "Preschool setup")}
  <rect x="160" y="360" width="700" height="40" rx="8" fill="#b45309"/>
  <rect x="180" y="400" width="40" height="140" fill="#92400e"/>
  <rect x="800" y="400" width="40" height="140" fill="#92400e"/>
  ${prop}
  </svg>`;
}

const GENERATORS = {
  "bright-scarf-slow-track-setup.png": () => infantMatScene({
    prop: `<path d="M560 300 Q620 360 580 430" fill="none" stroke="#ef4444" stroke-width="28" stroke-linecap="round"/>
    <circle cx="700" cy="300" r="50" fill="#fca5a5"/>`,
  }),
  "colorful-tummy-time-setup.png": () => infantMatScene({
    prop: `<circle cx="620" cy="400" r="40" fill="#eab308"/><circle cx="620" cy="400" r="18" fill="#fde047"/>`,
  }),
  "soft-color-reach-setup.png": () => infantMatScene({
    prop: `<rect x="600" y="360" width="70" height="70" rx="20" fill="#eab308"/><circle cx="635" cy="340" r="16" fill="#ca8a04"/>`,
  }),
  "tummy-color-mirror-setup.png": () => infantMatScene({
    prop: `<rect x="600" y="340" width="120" height="150" rx="16" fill="#93c5fd" stroke="#1d4ed8" stroke-width="8"/><rect x="740" y="400" width="70" height="50" rx="8" fill="#3b82f6"/>`,
  }),
  "color-cloth-basket-setup.png": () => infantMatScene({
    prop: `<ellipse cx="650" cy="430" rx="90" ry="35" fill="#92400e"/><rect x="580" y="360" width="50" height="70" fill="#ef4444"/><rect x="640" y="350" width="50" height="80" fill="#2563eb"/><rect x="700" y="370" width="50" height="60" fill="#16a34a"/>`,
  }),
  "texture-mitts-setup.png": () => infantMatScene({
    prop: `<ellipse cx="640" cy="400" rx="55" ry="70" fill="#2563eb"/><circle cx="620" cy="380" r="8" fill="#93c5fd"/><circle cx="650" cy="410" r="8" fill="#93c5fd"/><circle cx="630" cy="430" r="8" fill="#93c5fd"/>`,
  }),
  "contrast-card-focus-setup.png": () => infantMatScene({
    prop: `<rect x="600" y="320" width="140" height="140" fill="#fff" stroke="#111" stroke-width="6"/>
    ${Array.from({ length: 6 }, (_, i) => `<rect x="620" y="${340 + i * 18}" width="100" height="8" fill="#111"/>`).join("")}`,
  }),
  "tummy-pattern-line-setup.png": () => infantMatScene({
    prop: `<rect x="420" y="520" width="360" height="50" fill="#fff" stroke="#111" stroke-width="4"/>
    <rect x="440" y="530" width="60" height="30" fill="#111"/><circle cx="560" cy="545" r="14" fill="#111"/><rect x="620" y="530" width="40" height="30" fill="#111"/><rect x="680" y="530" width="40" height="30" fill="#111" opacity="0.5"/>`,
  }),
  "mirror-pattern-setup.png": () => infantMatScene({
    prop: `<rect x="560" y="330" width="100" height="130" rx="10" fill="#bfdbfe" stroke="#1e3a8a" stroke-width="6"/><rect x="690" y="360" width="90" height="90" fill="#fff" stroke="#111" stroke-width="5"><title>card</title></rect>
    <circle cx="735" cy="405" r="25" fill="none" stroke="#111" stroke-width="8"/>`,
  }),
  "arc-track-setup.png": () => infantMatScene({
    prop: `<path d="M360 340 Q520 220 700 340" fill="none" stroke="#64748b" stroke-width="6" stroke-dasharray="10 10"/>
    <rect x="640" y="300" width="80" height="80" fill="#fff" stroke="#111" stroke-width="5"/>
    ${Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => ((i + j) % 2 === 0 ? `<rect x="${650 + j * 15}" y="${310 + i * 15}" width="15" height="15" fill="#111"/>` : "")).join("")).join("")}`,
  }),
  "tummy-gallery-setup.png": () => infantMatScene({
    prop: `<rect x="560" y="360" width="70" height="70" fill="#fff" stroke="#111" stroke-width="4"/>
    <rect x="650" y="360" width="70" height="70" fill="#fff" stroke="#111" stroke-width="4"/>
    <circle cx="595" cy="395" r="18" fill="#111"/><rect x="665" y="375" width="40" height="8" fill="#111"/><rect x="665" y="390" width="40" height="8" fill="#111"/><rect x="665" y="405" width="40" height="8" fill="#111"/>`,
  }),
  "bw-cloth-look-setup.png": () => infantMatScene({
    prop: `<path d="M560 340 L720 340 L700 460 L580 460 Z" fill="#111"/>
    <path d="M560 340 L720 340 L700 400 L580 400 Z" fill="#fff"/>`,
  }),
  "contrast-ring-setup.png": () => infantMatScene({
    prop: `<circle cx="640" cy="400" r="55" fill="none" stroke="#111" stroke-width="22"/>
    <circle cx="640" cy="400" r="55" fill="none" stroke="#fff" stroke-width="8"/>`,
  }),
  "discovery-basket-setup.png": () => preschoolTableScene({
    label: "Helper discovery basket",
    prop: `<ellipse cx="512" cy="330" rx="120" ry="50" fill="#92400e"/><rect x="420" y="250" width="50" height="70" fill="#ef4444"/><rect x="490" y="240" width="50" height="80" fill="#3b82f6"/><rect x="560" y="255" width="50" height="65" fill="#22c55e"/><rect x="640" y="270" width="60" height="40" rx="6" fill="#fef3c7" stroke="#b45309" stroke-width="3"/>`,
  }),
  "community-map-setup.png": () => `${classroomBg("Community map")}
  <rect x="180" y="160" width="660" height="420" rx="16" fill="#ecfdf5" stroke="#047857" stroke-width="6"/>
  <circle cx="320" cy="300" r="40" fill="#34d399"/><text x="300" y="380" font-size="20" fill="#065f46" font-family="Arial">Clinic</text>
  <rect x="460" y="260" width="90" height="70" fill="#60a5fa"/><text x="470" y="370" font-size="20" fill="#1e3a8a" font-family="Arial">Library</text>
  <rect x="640" y="280" width="100" height="60" fill="#fbbf24"/><text x="655" y="380" font-size="20" fill="#78350f" font-family="Arial">Market</text>
  </svg>`,
  "healthcare-clinic-setup.png": () => preschoolTableScene({
    label: "Healthcare clinic play",
    prop: `<rect x="220" y="220" width="160" height="120" rx="12" fill="#e0f2fe"/><rect x="420" y="240" width="80" height="50" fill="#fff" stroke="#0ea5e9" stroke-width="4"/><circle cx="700" cy="280" r="40" fill="#86efac"/><rect x="660" y="320" width="80" height="30" fill="#22c55e"/>`,
  }),
  "rescue-collage-setup.png": () => preschoolTableScene({
    label: "Rescue process collage invitation",
    prop: `<rect x="260" y="220" width="90" height="110" fill="#ef4444"/><rect x="370" y="240" width="90" height="90" fill="#eab308"/><rect x="480" y="230" width="90" height="100" fill="#111"/><rect x="590" y="250" width="90" height="80" fill="#3b82f6"/><rect x="700" y="260" width="70" height="20" fill="#a3a3a3"/>`,
  }),
  "tools-table-setup.png": () => preschoolTableScene({
    label: "Helper tools table",
    prop: `<rect x="250" y="250" width="120" height="80" rx="10" fill="#fef3c7" stroke="#b45309" stroke-width="4"/>
    <rect x="420" y="250" width="120" height="80" rx="10" fill="#e0f2fe" stroke="#0369a1" stroke-width="4"/>
    <rect x="590" y="250" width="120" height="80" rx="10" fill="#dcfce7" stroke="#15803d" stroke-width="4"/>`,
  }),
  "mail-center-setup.png": () => preschoolTableScene({
    label: "Mail carrier post office",
    prop: `<rect x="260" y="220" width="140" height="110" fill="#93c5fd"/><rect x="450" y="240" width="100" height="70" fill="#fef08a"/><rect x="600" y="230" width="130" height="90" rx="12" fill="#fdba74"/><circle cx="760" cy="280" r="30" fill="#f97316"/>`,
  }),
  "grocery-market-setup.png": () => preschoolTableScene({
    label: "Grocery helper market",
    prop: `<rect x="240" y="200" width="80" height="140" fill="#86efac"/><rect x="340" y="200" width="80" height="140" fill="#fde68a"/><rect x="440" y="200" width="80" height="140" fill="#fda4af"/><rect x="600" y="250" width="140" height="70" fill="#bbf7d0" stroke="#15803d" stroke-width="4"/>`,
  }),
  "block-city-setup.png": () => `${classroomBg("Block city")}
  <rect x="200" y="420" width="100" height="80" fill="#f59e0b"/><rect x="320" y="380" width="80" height="120" fill="#ef4444"/><rect x="420" y="400" width="120" height="100" fill="#3b82f6"/><rect x="560" y="360" width="90" height="140" fill="#22c55e"/><rect x="180" y="500" width="600" height="20" fill="#78716c"/>
  </svg>`,
  "library-center-setup.png": () => preschoolTableScene({
    label: "Library helper center",
    prop: `<rect x="240" y="200" width="40" height="130" fill="#ef4444"/><rect x="290" y="210" width="40" height="120" fill="#3b82f6"/><rect x="340" y="205" width="40" height="125" fill="#eab308"/><rect x="500" y="240" width="160" height="90" rx="10" fill="#f5f3ff" stroke="#7c3aed" stroke-width="4"/>`,
  }),
  "recycle-sort-setup.png": () => preschoolTableScene({
    label: "Sanitation recycle sort",
    prop: `<rect x="260" y="230" width="120" height="120" fill="#22c55e"/><rect x="430" y="230" width="120" height="120" fill="#64748b"/><rect x="600" y="230" width="120" height="120" fill="#f59e0b"/><text x="285" y="300" font-size="20" fill="#fff" font-family="Arial">Recycle</text>`,
  }),
  "thankyou-studio-setup.png": () => preschoolTableScene({
    label: "Thank-you helper studio",
    prop: `<rect x="280" y="220" width="110" height="80" fill="#fff" stroke="#9ca3af" stroke-width="4"/><rect x="420" y="230" width="50" height="70" fill="#f472b6"/><rect x="490" y="230" width="50" height="70" fill="#60a5fa"/><rect x="560" y="230" width="50" height="70" fill="#facc15"/><circle cx="700" cy="270" r="35" fill="#fb7185"/>`,
  }),
  "helper-course-setup.png": () => `${classroomBg("Helper obstacle course")}
  <circle cx="220" cy="420" r="40" fill="#f97316"/><rect x="320" y="380" width="160" height="80" rx="40" fill="#38bdf8"/><rect x="540" y="400" width="100" height="60" fill="#a3e635"/><rect x="700" y="360" width="80" height="120" fill="#c084fc"/>
  </svg>`,
  "weather-chart-setup.png": () => `${classroomBg("Weather chart")}
  <rect x="200" y="160" width="620" height="400" rx="12" fill="#fff" stroke="#0369a1" stroke-width="6"/>
  ${["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => `<rect x="${240 + i * 110}" y="220" width="90" height="260" fill="none" stroke="#0ea5e9" stroke-width="3"/><text x="${255 + i * 110}" y="250" font-size="18" fill="#0c4a6e" font-family="Arial">${d}</text>`).join("")}
  <circle cx="285" cy="340" r="28" fill="#facc15"/>
  </svg>`,
  "cloud-process-art-setup.png": () => preschoolTableScene({
    label: "Cloudy day process art",
    prop: `<rect x="260" y="220" width="140" height="100" fill="#93c5fd"/><circle cx="480" cy="260" r="40" fill="#fff"/><circle cx="520" cy="250" r="35" fill="#fff"/><circle cx="560" cy="265" r="38" fill="#fff"/><rect x="640" y="240" width="70" height="70" fill="#e5e7eb"/>`,
  }),
  "rain-sensory-setup.png": () => preschoolTableScene({
    label: "Rain sensory investigate",
    prop: `<rect x="300" y="220" width="400" height="140" rx="16" fill="#7dd3fc"/><rect x="340" y="250" width="40" height="60" fill="#38bdf8"/><rect x="420" y="260" width="40" height="50" fill="#0ea5e9"/><circle cx="560" cy="280" r="20" fill="#e0f2fe"/>`,
  }),
  "weather-dressup-setup.png": () => preschoolTableScene({
    label: "Weather dress-up",
    prop: `<rect x="250" y="220" width="100" height="120" fill="#38bdf8"/><rect x="390" y="230" width="100" height="110" fill="#fde047"/><rect x="530" y="220" width="100" height="120" fill="#a5b4fc"/><rect x="670" y="240" width="100" height="100" fill="#fda4af"/>`,
  }),
  "wind-lab-setup.png": () => preschoolTableScene({
    label: "Windy day pinwheel lab",
    prop: `<circle cx="360" cy="260" r="50" fill="#67e8f9"/><circle cx="360" cy="260" r="10" fill="#155e75"/>
    <path d="M500 220 Q560 260 500 300" fill="none" stroke="#06b6d4" stroke-width="14"/>
    <rect x="620" y="230" width="120" height="80" fill="#ecfeff" stroke="#0e7490" stroke-width="4"/>`,
  }),
  "thunder-drum-setup.png": () => preschoolTableScene({
    label: "Thunder drum experiment",
    prop: `<ellipse cx="360" cy="280" rx="70" ry="40" fill="#78716c"/><ellipse cx="520" cy="280" rx="70" ry="40" fill="#a8a29e"/><rect x="640" y="250" width="100" height="60" fill="#f0abfc"/>`,
  }),
  "clothing-sort-setup.png": () => preschoolTableScene({
    label: "Clothing and season sort",
    prop: `<rect x="250" y="230" width="120" height="100" fill="#fde68a"/><rect x="400" y="230" width="120" height="100" fill="#bfdbfe"/><rect x="550" y="230" width="120" height="100" fill="#ddd6fe"/><rect x="700" y="230" width="120" height="100" fill="#a5f3fc"/>`,
  }),
  "weather-paint-setup.png": () => preschoolTableScene({
    label: "Weather colors process painting",
    prop: `<rect x="280" y="220" width="90" height="90" fill="#38bdf8"/><rect x="400" y="220" width="90" height="90" fill="#facc15"/><rect x="520" y="220" width="90" height="90" fill="#64748b"/><circle cx="700" cy="260" r="40" fill="#f472b6"/><rect x="300" y="330" width="200" height="20" fill="#d4d4d8"/>`,
  }),
  "dress-relay-setup.png": () => `${classroomBg("Weather dress relay")}
  <circle cx="220" cy="400" r="36" fill="#f97316"/><circle cx="800" cy="400" r="36" fill="#f97316"/>
  <rect x="320" y="300" width="100" height="120" fill="#38bdf8"/><rect x="460" y="300" width="100" height="120" fill="#fde047"/><rect x="600" y="300" width="100" height="120" fill="#c4b5fd"/>
  </svg>`,
};

async function generateActivityImages() {
  const written = [];
  const needed = new Set();
  KITS.forEach((kit) => {
    Object.values(kit.activitiesByDay).forEach((dayActs) => {
      dayActs.forEach((act) => {
        const url = act.setupImageUrl || "";
        if (url.startsWith("/images/teaching-kit-drafts/")) {
          needed.add(url.replace(/^\//, ""));
        }
      });
    });
  });

  for (const rel of needed) {
    const abs = path.join(ROOT, rel);
    ensureDir(path.dirname(abs));
    const file = path.basename(rel);
    const gen = GENERATORS[file];
    const svg = gen ? gen() : classroomBg(file);
    await sharp(Buffer.from(svg)).png().toFile(abs);
    written.push(rel);
  }
  return written;
}

module.exports = { generateActivityImages, GENERATORS };

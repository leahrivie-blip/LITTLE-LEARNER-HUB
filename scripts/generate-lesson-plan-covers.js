#!/usr/bin/env node
/**
 * Generate consistent children's-book style SVG covers for lesson plans.
 * Run: node scripts/generate-lesson-plan-covers.js
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "images", "lesson-covers");
fs.mkdirSync(OUT, { recursive: true });

const W = 800;
const H = 450;

function svg(body, bg) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bg[0]}"/>
      <stop offset="100%" stop-color="${bg[1]}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${body}
</svg>`;
}

const covers = {
  colors: {
    bg: ["#FFE8F0", "#E8F4FF"],
    body: `
      <circle cx="160" cy="120" r="55" fill="#FF6B6B"/>
      <circle cx="250" cy="100" r="45" fill="#FFB347"/>
      <circle cx="330" cy="130" r="50" fill="#FFE66D"/>
      <circle cx="410" cy="105" r="42" fill="#7DCE82"/>
      <circle cx="490" cy="125" r="48" fill="#4ECDC4"/>
      <circle cx="570" cy="110" r="44" fill="#6C8CFF"/>
      <circle cx="650" cy="135" r="40" fill="#B388FF"/>
      <rect x="120" y="260" width="28" height="120" rx="8" fill="#FF6B6B" transform="rotate(-12 134 320)"/>
      <rect x="180" y="250" width="28" height="130" rx="8" fill="#4ECDC4" transform="rotate(8 194 315)"/>
      <rect x="240" y="255" width="28" height="125" rx="8" fill="#FFE66D" transform="rotate(-5 254 317)"/>
      <path d="M520 240 q40 -80 80 0 q-20 50 -40 70 q-20 -20 -40 -70z" fill="#FF8FAB"/>
      <path d="M600 250 q35 -70 70 0 q-18 45 -35 60 q-17 -15 -35 -60z" fill="#6C8CFF"/>
      <rect x="340" y="280" width="70" height="70" rx="12" fill="#FFB347"/>
      <polygon points="450,350 490,280 530,350" fill="#7DCE82"/>
    `,
  },
  "reaching-grasping": {
    bg: ["#FFF0E6", "#E8F8F5"],
    body: `
      <ellipse cx="400" cy="380" rx="280" ry="40" fill="#D4F0E8" opacity="0.8"/>
      <ellipse cx="280" cy="300" rx="90" ry="55" fill="#FFD4B8"/>
      <circle cx="250" cy="230" r="48" fill="#FFD4B8"/>
      <circle cx="235" cy="220" r="5" fill="#5A4A42"/>
      <circle cx="265" cy="220" r="5" fill="#5A4A42"/>
      <path d="M235 245 q15 12 30 0" fill="none" stroke="#C47A5A" stroke-width="3" stroke-linecap="round"/>
      <circle cx="210" cy="210" r="10" fill="#FFB8A8" opacity="0.7"/>
      <circle cx="290" cy="210" r="10" fill="#FFB8A8" opacity="0.7"/>
      <circle cx="420" cy="250" r="32" fill="#FF8FAB"/>
      <circle cx="480" cy="230" r="28" fill="#6C8CFF"/>
      <circle cx="520" cy="280" r="24" fill="#7DCE82"/>
      <circle cx="450" cy="310" r="20" fill="#FFE66D"/>
      <ellipse cx="600" cy="260" rx="50" ry="70" fill="#B8D4F0"/>
      <circle cx="600" cy="180" r="36" fill="#FFD4B8"/>
      <path d="M560 280 q-40 40 -20 80" fill="none" stroke="#B8D4F0" stroke-width="18" stroke-linecap="round"/>
    `,
  },
  "around-the-world": {
    bg: ["#E8F4FF", "#FFF5E6"],
    body: `
      <circle cx="400" cy="230" r="120" fill="#6C8CFF"/>
      <ellipse cx="400" cy="230" rx="50" ry="120" fill="none" stroke="#A8C4FF" stroke-width="8"/>
      <ellipse cx="400" cy="230" rx="120" ry="40" fill="none" stroke="#A8C4FF" stroke-width="8"/>
      <path d="M310 180 q40 -20 80 10 q30 20 60 -5" fill="#7DCE82" opacity="0.85"/>
      <path d="M340 260 q50 30 90 5 q20 -10 40 15" fill="#7DCE82" opacity="0.75"/>
      <circle cx="200" cy="320" r="28" fill="#FFD4B8"/>
      <circle cx="280" cy="340" r="28" fill="#E8B898"/>
      <circle cx="520" cy="335" r="28" fill="#D4A574"/>
      <circle cx="600" cy="320" r="28" fill="#FFD4B8"/>
      <rect x="180" y="348" width="40" height="50" rx="10" fill="#FF8FAB"/>
      <rect x="260" y="368" width="40" height="40" rx="10" fill="#6C8CFF"/>
      <rect x="500" y="363" width="40" height="45" rx="10" fill="#7DCE82"/>
      <rect x="580" y="348" width="40" height="50" rx="10" fill="#FFE66D"/>
    `,
  },
  farm: {
    bg: ["#E8F8E8", "#FFF8E0"],
    body: `
      <ellipse cx="400" cy="400" rx="350" ry="50" fill="#B8E0A8"/>
      <path d="M480 180 L560 240 L560 340 L400 340 L400 240 Z" fill="#E07050"/>
      <path d="M480 180 L560 240 L400 240 Z" fill="#C05040"/>
      <rect x="450" y="270" width="40" height="70" rx="4" fill="#FFE8D0"/>
      <circle cx="200" cy="300" r="40" fill="#FFF8F0"/>
      <circle cx="185" cy="285" r="8" fill="#5A4A42"/>
      <ellipse cx="230" cy="320" rx="18" ry="28" fill="#FFF8F0"/>
      <ellipse cx="170" cy="320" rx="18" ry="28" fill="#FFF8F0"/>
      <circle cx="320" cy="310" r="35" fill="#F0A060"/>
      <ellipse cx="300" cy="290" rx="12" ry="18" fill="#F0A060"/>
      <ellipse cx="340" cy="290" rx="12" ry="18" fill="#F0A060"/>
      <circle cx="650" cy="280" r="45" fill="#FFE8A0"/>
      <ellipse cx="650" cy="250" rx="20" ry="12" fill="#E8C070"/>
      <circle cx="635" cy="275" r="5" fill="#5A4A42"/>
      <circle cx="665" cy="275" r="5" fill="#5A4A42"/>
    `,
  },
  animals: {
    bg: ["#E8F8F0", "#FFF5E8"],
    body: `
      <ellipse cx="400" cy="400" rx="300" ry="45" fill="#C8E8B8"/>
      <circle cx="220" cy="260" r="55" fill="#E8A878"/>
      <circle cx="200" cy="240" r="8" fill="#5A4A42"/>
      <circle cx="240" cy="240" r="8" fill="#5A4A42"/>
      <ellipse cx="190" cy="220" rx="14" ry="22" fill="#E8A878"/>
      <ellipse cx="250" cy="220" rx="14" ry="22" fill="#E8A878"/>
      <circle cx="400" cy="250" r="50" fill="#FFF8F0"/>
      <circle cx="385" cy="235" r="7" fill="#5A4A42"/>
      <circle cx="415" cy="235" r="7" fill="#5A4A42"/>
      <ellipse cx="370" cy="215" rx="16" ry="24" fill="#FFF8F0"/>
      <ellipse cx="430" cy="215" rx="16" ry="24" fill="#FFF8F0"/>
      <circle cx="580" cy="270" r="48" fill="#D4B896"/>
      <circle cx="565" cy="255" r="7" fill="#5A4A42"/>
      <circle cx="595" cy="255" r="7" fill="#5A4A42"/>
      <ellipse cx="555" cy="235" rx="12" ry="18" fill="#D4B896"/>
      <ellipse cx="605" cy="235" rx="12" ry="18" fill="#D4B896"/>
    `,
  },
  ocean: {
    bg: ["#D4F0FF", "#A8D8F0"],
    body: `
      <ellipse cx="400" cy="420" rx="400" ry="80" fill="#6CB8E8" opacity="0.5"/>
      <ellipse cx="200" cy="280" rx="70" ry="40" fill="#FF8F6B"/>
      <polygon points="140,280 100,250 100,310" fill="#FF8F6B"/>
      <circle cx="230" cy="270" r="6" fill="#5A4A42"/>
      <ellipse cx="450" cy="220" rx="55" ry="35" fill="#4ECDC4"/>
      <polygon points="400,220 360,200 360,240" fill="#4ECDC4"/>
      <circle cx="480" cy="210" r="5" fill="#5A4A42"/>
      <ellipse cx="600" cy="300" rx="60" ry="45" fill="#7DCE82"/>
      <path d="M560 300 q-20 -30 0 -50 M580 290 q-15 -25 0 -40 M620 290 q15 -25 0 -40 M640 300 q20 -30 0 -50" fill="none" stroke="#5A9E62" stroke-width="6" stroke-linecap="round"/>
      <circle cx="300" cy="350" r="18" fill="#FFE66D"/>
      <circle cx="500" cy="360" r="14" fill="#B388FF"/>
      <path d="M100 380 q30 -40 60 0 q30 40 60 0" fill="none" stroke="#3A8AB8" stroke-width="8" opacity="0.4"/>
    `,
  },
  dinosaurs: {
    bg: ["#E8F4E0", "#FFF0D8"],
    body: `
      <ellipse cx="400" cy="400" rx="320" ry="45" fill="#C0D8A8"/>
      <ellipse cx="280" cy="280" rx="90" ry="60" fill="#7DCE82"/>
      <circle cx="200" cy="220" r="45" fill="#7DCE82"/>
      <circle cx="185" cy="210" r="6" fill="#5A4A42"/>
      <path d="M155 240 q-30 20 -40 50" fill="#7DCE82"/>
      <ellipse cx="320" cy="200" rx="12" ry="20" fill="#5A9E62"/>
      <ellipse cx="300" cy="195" rx="10" ry="16" fill="#5A9E62"/>
      <ellipse cx="550" cy="300" rx="70" ry="50" fill="#FFB347"/>
      <circle cx="600" cy="250" r="38" fill="#FFB347"/>
      <circle cx="615" cy="240" r="5" fill="#5A4A42"/>
      <path d="M640 270 q25 15 30 40" fill="#FFB347"/>
      <ellipse cx="520" cy="270" rx="10" ry="16" fill="#E09030"/>
    `,
  },
  space: {
    bg: ["#1A1A4A", "#2A2A6A"],
    body: `
      <circle cx="120" cy="80" r="3" fill="#FFF"/>
      <circle cx="200" cy="140" r="2" fill="#FFF"/>
      <circle cx="350" cy="60" r="2.5" fill="#FFF"/>
      <circle cx="500" cy="100" r="2" fill="#FFF"/>
      <circle cx="650" cy="70" r="3" fill="#FFF"/>
      <circle cx="700" cy="160" r="2" fill="#FFF"/>
      <circle cx="250" cy="200" r="2" fill="#FFE66D"/>
      <circle cx="180" cy="250" r="55" fill="#FF8FAB"/>
      <circle cx="160" cy="230" r="12" fill="#FFB8C8" opacity="0.6"/>
      <circle cx="450" cy="200" r="40" fill="#6C8CFF"/>
      <circle cx="600" cy="280" r="70" fill="#FFE66D"/>
      <circle cx="580" cy="260" r="15" fill="#FFF0A0" opacity="0.5"/>
      <path d="M320 320 L360 280 L400 320 L380 320 L380 360 L340 360 L340 320 Z" fill="#E8E8F0"/>
      <circle cx="360" cy="250" r="28" fill="#E8E8F0"/>
      <circle cx="360" cy="250" r="18" fill="#A8D4FF"/>
      <ellipse cx="360" cy="380" rx="20" ry="8" fill="#FF8FAB" opacity="0.7"/>
    `,
  },
  pirates: {
    bg: ["#E8F4FF", "#FFF5D8"],
    body: `
      <ellipse cx="400" cy="400" rx="350" ry="50" fill="#F0E0A0"/>
      <path d="M200 320 Q300 200 500 280 L520 340 L180 340 Z" fill="#E07050"/>
      <rect x="340" y="160" width="12" height="120" fill="#8B6914"/>
      <path d="M352 160 L420 200 L352 210 Z" fill="#FFF"/>
      <rect x="280" y="300" width="80" height="40" rx="6" fill="#C8A050"/>
      <circle cx="300" cy="320" r="6" fill="#FFE66D"/>
      <circle cx="340" cy="315" r="5" fill="#FFE66D"/>
      <ellipse cx="600" cy="300" rx="50" ry="30" fill="#7DCE82"/>
      <path d="M580 280 Q600 240 620 280" fill="#5A9E62"/>
      <circle cx="150" cy="280" r="35" fill="#FFD4B8"/>
      <path d="M120 260 L180 260 L175 280 L125 280 Z" fill="#2A2A2A"/>
      <circle cx="140" cy="275" r="4" fill="#5A4A42"/>
      <circle cx="165" cy="275" r="4" fill="#5A4A42"/>
    `,
  },
  weather: {
    bg: ["#E0F0FF", "#FFF8E8"],
    body: `
      <circle cx="180" cy="140" r="55" fill="#FFE66D"/>
      <g stroke="#FFE66D" stroke-width="8" stroke-linecap="round">
        <line x1="180" y1="60" x2="180" y2="40"/>
        <line x1="180" y1="240" x2="180" y2="220"/>
        <line x1="100" y1="140" x2="80" y2="140"/>
        <line x1="280" y1="140" x2="260" y2="140"/>
        <line x1="120" y1="80" x2="105" y2="65"/>
        <line x1="240" y1="80" x2="255" y2="65"/>
        <line x1="120" y1="200" x2="105" y2="215"/>
        <line x1="240" y1="200" x2="255" y2="215"/>
      </g>
      <ellipse cx="450" cy="150" rx="70" ry="40" fill="#FFF"/>
      <ellipse cx="500" cy="140" rx="55" ry="35" fill="#FFF"/>
      <ellipse cx="400" cy="145" rx="45" ry="30" fill="#FFF"/>
      <path d="M420 190 L410 230 M450 195 L445 240 M480 190 L490 235" stroke="#6C8CFF" stroke-width="6" stroke-linecap="round"/>
      <path d="M580 280 q40 -60 80 0 q20 40 -10 70 q-50 10 -70 -20 q-20 -30 0 -50z" fill="none" stroke="#B388FF" stroke-width="10" stroke-linecap="round"/>
      <path d="M100 350 q60 -40 120 0 q60 40 120 0 q60 -40 120 0 q60 40 120 0 q60 -40 120 0" fill="none" stroke="#4ECDC4" stroke-width="14" opacity="0.5"/>
    `,
  },
  transportation: {
    bg: ["#E8F4FF", "#FFF5E8"],
    body: `
      <rect x="80" y="280" width="140" height="60" rx="16" fill="#FF6B6B"/>
      <circle cx="110" cy="345" r="18" fill="#5A4A42"/>
      <circle cx="190" cy="345" r="18" fill="#5A4A42"/>
      <rect x="100" y="250" width="50" height="30" rx="8" fill="#A8D4FF"/>
      <rect x="280" y="260" width="160" height="70" rx="12" fill="#6C8CFF"/>
      <rect x="300" y="230" width="50" height="30" rx="6" fill="#6C8CFF"/>
      <rect x="360" y="230" width="50" height="30" rx="6" fill="#6C8CFF"/>
      <circle cx="310" cy="335" r="16" fill="#5A4A42"/>
      <circle cx="410" cy="335" r="16" fill="#5A4A42"/>
      <rect x="500" y="270" width="180" height="55" rx="10" fill="#7DCE82"/>
      <circle cx="530" cy="330" r="14" fill="#5A4A42"/>
      <circle cx="580" cy="330" r="14" fill="#5A4A42"/>
      <circle cx="630" cy="330" r="14" fill="#5A4A42"/>
      <circle cx="680" cy="330" r="14" fill="#5A4A42"/>
      <path d="M620 160 L650 200 L680 160 L670 200 L690 220 L660 210 L650 240 L640 210 L610 220 L630 200 Z" fill="#FFE66D"/>
      <ellipse cx="150" cy="180" rx="50" ry="20" fill="#4ECDC4"/>
      <path d="M100 180 L80 160 L80 200 Z" fill="#4ECDC4"/>
    `,
  },
  music: {
    bg: ["#F0E8FF", "#FFE8F4"],
    body: `
      <ellipse cx="250" cy="280" rx="70" ry="90" fill="#FF8FAB"/>
      <rect x="310" y="160" width="14" height="140" fill="#FF8FAB"/>
      <path d="M324 160 q40 10 50 40" fill="none" stroke="#FF8FAB" stroke-width="10" stroke-linecap="round"/>
      <circle cx="500" cy="300" r="55" fill="#6C8CFF"/>
      <circle cx="500" cy="300" r="35" fill="#E8E0FF"/>
      <rect x="545" y="180" width="12" height="130" fill="#6C8CFF"/>
      <path d="M200 120 q20 -40 40 0 M280 100 q20 -40 40 0 M360 110 q20 -40 40 0 M440 90 q20 -40 40 0" fill="none" stroke="#B388FF" stroke-width="6" stroke-linecap="round"/>
      <circle cx="650" cy="200" r="30" fill="#FFE66D"/>
      <rect x="640" y="200" width="20" height="100" rx="6" fill="#E0C040"/>
      <circle cx="180" cy="200" r="25" fill="#7DCE82"/>
    `,
  },
  "music-movement": {
    bg: ["#FFE8F0", "#E8F0FF"],
    body: `
      <circle cx="280" cy="180" r="35" fill="#FFD4B8"/>
      <ellipse cx="280" cy="280" rx="40" ry="55" fill="#FF8FAB"/>
      <path d="M250 300 q-40 20 -30 60 M310 300 q40 20 30 60" fill="none" stroke="#FF8FAB" stroke-width="16" stroke-linecap="round"/>
      <path d="M240 250 q-35 -20 -50 10 M320 250 q35 -20 50 10" fill="none" stroke="#FFD4B8" stroke-width="14" stroke-linecap="round"/>
      <circle cx="520" cy="200" r="35" fill="#E8B898"/>
      <ellipse cx="520" cy="300" rx="40" ry="55" fill="#6C8CFF"/>
      <path d="M490 320 q-40 20 -30 60 M550 320 q40 20 30 60" fill="none" stroke="#6C8CFF" stroke-width="16" stroke-linecap="round"/>
      <path d="M480 270 q-35 -30 -55 -5 M560 270 q35 -30 55 -5" fill="none" stroke="#E8B898" stroke-width="14" stroke-linecap="round"/>
      <path d="M150 120 q15 -30 30 0 M200 100 q15 -30 30 0 M600 110 q15 -30 30 0 M650 130 q15 -30 30 0" fill="none" stroke="#B388FF" stroke-width="5" stroke-linecap="round"/>
    `,
  },
  "five-senses": {
    bg: ["#FFF5E8", "#E8F8F5"],
    body: `
      <ellipse cx="180" cy="180" rx="50" ry="35" fill="#FFD4B8"/>
      <circle cx="160" cy="175" r="8" fill="#5A4A42"/>
      <circle cx="200" cy="175" r="8" fill="#5A4A42"/>
      <path d="M170 200 q10 8 20 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <path d="M320 140 q-20 40 0 80 q30 -10 40 -40 q-10 -30 -40 -40z" fill="#FFB8A8"/>
      <ellipse cx="480" cy="180" rx="30" ry="45" fill="#FFD4B8"/>
      <path d="M470 160 q15 -20 30 0" fill="none" stroke="#C47A5A" stroke-width="4"/>
      <path d="M580 160 q40 20 0 50 q-40 20 0 50" fill="none" stroke="#6C8CFF" stroke-width="14" stroke-linecap="round"/>
      <circle cx="200" cy="320" r="40" fill="#FFE66D"/>
      <circle cx="200" cy="320" r="20" fill="#FFF"/>
      <circle cx="200" cy="320" r="10" fill="#5A4A42"/>
      <circle cx="400" cy="330" r="35" fill="#FF8FAB"/>
      <path d="M380 320 q20 -15 40 0 q-20 25 -40 0z" fill="#E07080"/>
      <circle cx="580" cy="320" r="30" fill="#7DCE82"/>
    `,
  },
  shapes: {
    bg: ["#F0E8FF", "#E8F8FF"],
    body: `
      <circle cx="180" cy="180" r="70" fill="#FF6B6B"/>
      <rect x="320" y="120" width="120" height="120" rx="16" fill="#6C8CFF"/>
      <polygon points="580,100 660,240 500,240" fill="#7DCE82"/>
      <rect x="140" y="300" width="140" height="90" rx="12" fill="#FFE66D" transform="rotate(-8 210 345)"/>
      <circle cx="400" cy="340" r="50" fill="#FF8FAB"/>
      <polygon points="560,280 640,280 680,350 600,400 520,350" fill="#4ECDC4"/>
    `,
  },
  nature: {
    bg: ["#E8F8E8", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="400" rx="350" ry="50" fill="#B8E0A8"/>
      <rect x="280" y="220" width="24" height="120" fill="#8B6914"/>
      <circle cx="292" cy="180" r="70" fill="#7DCE82"/>
      <circle cx="250" cy="200" r="45" fill="#5A9E62"/>
      <circle cx="340" cy="195" r="50" fill="#7DCE82"/>
      <rect x="480" y="250" width="18" height="90" fill="#8B6914"/>
      <circle cx="489" cy="220" r="50" fill="#5A9E62"/>
      <circle cx="200" cy="320" r="20" fill="#FF8FAB"/>
      <circle cx="250" cy="340" r="16" fill="#FFE66D"/>
      <circle cx="550" cy="330" r="18" fill="#FF8FAB"/>
      <ellipse cx="650" cy="300" rx="40" ry="25" fill="#C8E870"/>
      <circle cx="620" cy="280" r="12" fill="#6C8CFF"/>
      <circle cx="680" cy="290" r="10" fill="#FF6B6B"/>
      <circle cx="400" cy="280" r="35" fill="none" stroke="#8B6914" stroke-width="8"/>
      <line x1="400" y1="315" x2="400" y2="360" stroke="#8B6914" stroke-width="8" stroke-linecap="round"/>
    `,
  },
  garden: {
    bg: ["#E8F8E8", "#FFF8E8"],
    body: `
      <ellipse cx="400" cy="400" rx="350" ry="50" fill="#C8B070"/>
      <rect x="150" y="280" width="50" height="80" rx="8" fill="#E07050"/>
      <ellipse cx="175" cy="270" rx="35" ry="20" fill="#7DCE82"/>
      <rect x="280" y="300" width="50" height="70" rx="8" fill="#E07050"/>
      <ellipse cx="305" cy="290" rx="40" ry="22" fill="#FF8FAB"/>
      <rect x="420" y="290" width="50" height="80" rx="8" fill="#E07050"/>
      <ellipse cx="445" cy="275" rx="38" ry="24" fill="#FFE66D"/>
      <rect x="560" y="310" width="50" height="60" rx="8" fill="#E07050"/>
      <ellipse cx="585" cy="295" rx="36" ry="20" fill="#6C8CFF"/>
      <circle cx="200" cy="200" r="25" fill="#FF8FAB"/>
      <circle cx="350" cy="180" r="20" fill="#FFE66D"/>
      <circle cx="500" cy="190" r="28" fill="#7DCE82"/>
      <path d="M650 220 L660 280 L640 280 Z" fill="#5A9E62"/>
    `,
  },
  insects: {
    bg: ["#E8F8E8", "#FFF8E0"],
    body: `
      <ellipse cx="400" cy="400" rx="300" ry="40" fill="#C8E8B8"/>
      <ellipse cx="250" cy="250" rx="50" ry="35" fill="#FFE66D"/>
      <ellipse cx="220" cy="220" rx="30" ry="45" fill="#A8D4FF" opacity="0.7"/>
      <ellipse cx="280" cy="220" rx="30" ry="45" fill="#A8D4FF" opacity="0.7"/>
      <circle cx="250" cy="250" r="12" fill="#5A4A42"/>
      <ellipse cx="450" cy="280" rx="40" ry="28" fill="#FF8FAB"/>
      <circle cx="430" cy="270" r="10" fill="#FF8FAB"/>
      <path d="M420 255 L410 240 M440 255 L445 238" stroke="#5A4A42" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="600" cy="240" rx="45" ry="30" fill="#7DCE82"/>
      <ellipse cx="575" cy="210" rx="25" ry="40" fill="#B8E870" opacity="0.7"/>
      <ellipse cx="625" cy="210" rx="25" ry="40" fill="#B8E870" opacity="0.7"/>
      <circle cx="150" cy="320" r="15" fill="#6C8CFF"/>
      <circle cx="700" cy="300" r="12" fill="#FF6B6B"/>
    `,
  },
  family: {
    bg: ["#FFF0E8", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="400" rx="280" ry="40" fill="#F0E0D0"/>
      <circle cx="280" cy="200" r="40" fill="#FFD4B8"/>
      <ellipse cx="280" cy="300" rx="45" ry="60" fill="#6C8CFF"/>
      <circle cx="400" cy="230" r="32" fill="#E8B898"/>
      <ellipse cx="400" cy="310" rx="38" ry="50" fill="#FF8FAB"/>
      <circle cx="520" cy="200" r="40" fill="#D4A574"/>
      <ellipse cx="520" cy="300" rx="45" ry="60" fill="#7DCE82"/>
      <circle cx="340" cy="340" r="25" fill="#FFD4B8"/>
      <ellipse cx="340" cy="390" rx="28" ry="30" fill="#FFE66D"/>
      <circle cx="460" cy="345" r="22" fill="#E8B898"/>
      <ellipse cx="460" cy="390" rx="26" ry="28" fill="#B388FF"/>
    `,
  },
  feelings: {
    bg: ["#FFF0F4", "#E8F8FF"],
    body: `
      <circle cx="200" cy="220" r="70" fill="#FFE66D"/>
      <circle cx="175" cy="200" r="8" fill="#5A4A42"/>
      <circle cx="225" cy="200" r="8" fill="#5A4A42"/>
      <path d="M170 245 q30 25 60 0" fill="none" stroke="#5A4A42" stroke-width="5" stroke-linecap="round"/>
      <circle cx="400" cy="220" r="70" fill="#A8D4FF"/>
      <circle cx="375" cy="205" r="8" fill="#5A4A42"/>
      <circle cx="425" cy="205" r="8" fill="#5A4A42"/>
      <path d="M375 250 q25 -15 50 0" fill="none" stroke="#5A4A42" stroke-width="5" stroke-linecap="round"/>
      <circle cx="600" cy="220" r="70" fill="#FF8FAB"/>
      <circle cx="575" cy="200" r="8" fill="#5A4A42"/>
      <circle cx="625" cy="200" r="8" fill="#5A4A42"/>
      <circle cx="575" cy="195" r="4" fill="#FFF" opacity="0.6"/>
      <path d="M575 250 q25 20 50 0" fill="none" stroke="#5A4A42" stroke-width="5" stroke-linecap="round"/>
      <path d="M300 350 q50 -30 100 0 q50 30 100 0" fill="none" stroke="#B388FF" stroke-width="10" opacity="0.4"/>
    `,
  },
  "my-body": {
    bg: ["#FFF5E8", "#E8F4FF"],
    body: `
      <circle cx="400" cy="140" r="50" fill="#FFD4B8"/>
      <circle cx="380" cy="130" r="6" fill="#5A4A42"/>
      <circle cx="420" cy="130" r="6" fill="#5A4A42"/>
      <path d="M380 155 q20 15 40 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="400" cy="260" rx="55" ry="70" fill="#6C8CFF"/>
      <path d="M350 230 q-50 10 -40 60 M450 230 q50 10 40 60" fill="none" stroke="#FFD4B8" stroke-width="18" stroke-linecap="round"/>
      <path d="M370 320 q-15 50 -10 80 M430 320 q15 50 10 80" fill="none" stroke="#6C8CFF" stroke-width="20" stroke-linecap="round"/>
      <circle cx="200" cy="280" r="40" fill="#FF8FAB" opacity="0.8"/>
      <circle cx="600" cy="280" r="40" fill="#7DCE82" opacity="0.8"/>
    `,
  },
  "community-helpers": {
    bg: ["#E8F4FF", "#FFF5E8"],
    body: `
      <circle cx="200" cy="200" r="40" fill="#FFD4B8"/>
      <ellipse cx="200" cy="300" rx="45" ry="55" fill="#FF6B6B"/>
      <rect x="175" y="155" width="50" height="20" rx="4" fill="#FF6B6B"/>
      <circle cx="400" cy="200" r="40" fill="#E8B898"/>
      <ellipse cx="400" cy="300" rx="45" ry="55" fill="#6C8CFF"/>
      <rect x="370" y="250" width="60" height="20" rx="4" fill="#FFE66D"/>
      <circle cx="600" cy="200" r="40" fill="#D4A574"/>
      <ellipse cx="600" cy="300" rx="45" ry="55" fill="#7DCE82"/>
      <path d="M580 160 L620 160 L610 200 L590 200 Z" fill="#5A4A42"/>
      <circle cx="300" cy="380" r="20" fill="#FF8FAB"/>
      <circle cx="500" cy="380" r="20" fill="#4ECDC4"/>
    `,
  },
  building: {
    bg: ["#FFF5E8", "#E8F0FF"],
    body: `
      <rect x="150" y="280" width="80" height="60" rx="6" fill="#FF6B6B"/>
      <rect x="180" y="220" width="80" height="60" rx="6" fill="#FFE66D"/>
      <rect x="210" y="160" width="80" height="60" rx="6" fill="#6C8CFF"/>
      <rect x="400" y="300" width="70" height="50" rx="6" fill="#7DCE82"/>
      <rect x="430" y="250" width="70" height="50" rx="6" fill="#FF8FAB"/>
      <rect x="460" y="200" width="70" height="50" rx="6" fill="#4ECDC4"/>
      <rect x="490" y="150" width="70" height="50" rx="6" fill="#B388FF"/>
      <circle cx="650" cy="280" r="45" fill="#FFD4B8"/>
      <circle cx="635" cy="270" r="5" fill="#5A4A42"/>
      <circle cx="665" cy="270" r="5" fill="#5A4A42"/>
      <path d="M635 295 q15 12 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="650" cy="360" rx="40" ry="45" fill="#6C8CFF"/>
    `,
  },
  "fairy-tales": {
    bg: ["#F0E8FF", "#FFE8F4"],
    body: `
      <path d="M400 80 L420 140 L480 140 L430 175 L450 240 L400 200 L350 240 L370 175 L320 140 L380 140 Z" fill="#FFE66D"/>
      <rect x="250" y="250" width="100" height="120" rx="8" fill="#6C8CFF"/>
      <path d="M240 250 L300 180 L360 250 Z" fill="#FF8FAB"/>
      <rect x="285" y="300" width="30" height="70" rx="4" fill="#FFE8D0"/>
      <circle cx="550" cy="280" r="50" fill="#FFD4B8"/>
      <path d="M510 250 Q550 200 590 250" fill="#B388FF"/>
      <circle cx="535" cy="270" r="5" fill="#5A4A42"/>
      <circle cx="565" cy="270" r="5" fill="#5A4A42"/>
      <path d="M535 295 q15 12 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="550" cy="370" rx="45" ry="50" fill="#FF8FAB"/>
      <circle cx="180" cy="200" r="25" fill="#7DCE82" opacity="0.7"/>
      <circle cx="650" cy="160" r="20" fill="#4ECDC4" opacity="0.7"/>
    `,
  },
  "healthy-habits": {
    bg: ["#E8F8F0", "#FFF5E8"],
    body: `
      <circle cx="250" cy="200" r="55" fill="#FFD4B8"/>
      <circle cx="230" cy="185" r="6" fill="#5A4A42"/>
      <circle cx="270" cy="185" r="6" fill="#5A4A42"/>
      <path d="M230 215 q20 15 40 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="250" cy="310" rx="50" ry="60" fill="#7DCE82"/>
      <circle cx="450" cy="250" r="60" fill="#FF8FAB"/>
      <path d="M420 230 q30 -20 60 0 q-10 40 -30 50 q-20 -10 -30 -50z" fill="#FFF" opacity="0.4"/>
      <circle cx="600" cy="220" r="45" fill="#FFE66D"/>
      <path d="M580 200 L600 240 L620 200 L610 240 L630 260 L600 250 L570 260 L590 240 Z" fill="#7DCE82"/>
      <ellipse cx="550" cy="350" rx="80" ry="30" fill="#A8D4FF" opacity="0.6"/>
    `,
  },
  seasons: {
    bg: ["#E8F4FF", "#FFF5E8"],
    body: `
      <circle cx="160" cy="160" r="45" fill="#FFE66D"/>
      <circle cx="320" cy="150" r="50" fill="#FF8FAB"/>
      <path d="M300 130 Q320 100 340 130" fill="#E07080"/>
      <circle cx="480" cy="160" r="45" fill="#FFB347"/>
      <path d="M460 140 L470 170 L450 170 Z" fill="#E09030"/>
      <path d="M480 140 L490 170 L470 170 Z" fill="#E09030"/>
      <circle cx="640" cy="150" r="45" fill="#A8D4FF"/>
      <path d="M620 130 q20 -25 40 0" fill="#FFF" opacity="0.8"/>
      <rect x="140" y="280" width="40" height="80" fill="#8B6914"/>
      <circle cx="160" cy="250" r="40" fill="#7DCE82"/>
      <rect x="300" y="300" width="40" height="60" fill="#8B6914"/>
      <circle cx="320" cy="270" r="40" fill="#FFB347"/>
      <rect x="460" y="290" width="40" height="70" fill="#8B6914"/>
      <circle cx="480" cy="255" r="40" fill="#FF8FAB"/>
      <rect x="620" y="300" width="40" height="60" fill="#8B6914"/>
      <circle cx="640" cy="270" r="35" fill="#E8E8F0"/>
    `,
  },
  "kindergarten-readiness": {
    bg: ["#E8F0FF", "#FFF5E8"],
    body: `
      <rect x="200" y="180" width="100" height="120" rx="8" fill="#6C8CFF"/>
      <rect x="215" y="200" width="70" height="10" rx="3" fill="#FFF" opacity="0.7"/>
      <rect x="215" y="225" width="70" height="10" rx="3" fill="#FFF" opacity="0.7"/>
      <rect x="215" y="250" width="50" height="10" rx="3" fill="#FFF" opacity="0.7"/>
      <circle cx="450" cy="200" r="40" fill="#FFD4B8"/>
      <ellipse cx="450" cy="300" rx="45" ry="55" fill="#FF8FAB"/>
      <circle cx="430" cy="190" r="5" fill="#5A4A42"/>
      <circle cx="470" cy="190" r="5" fill="#5A4A42"/>
      <path d="M430 215 q20 12 40 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="580" cy="250" r="30" fill="#FFE66D"/>
      <circle cx="650" cy="280" r="25" fill="#7DCE82"/>
      <rect x="560" y="320" width="50" height="50" rx="8" fill="#FF6B6B"/>
      <polygon points="640,320 680,320 660,370" fill="#4ECDC4"/>
    `,
  },
  "tummy-time": {
    bg: ["#FFF0E6", "#E8F8F5"],
    body: `
      <ellipse cx="400" cy="380" rx="280" ry="40" fill="#D4F0E8"/>
      <ellipse cx="350" cy="300" rx="100" ry="50" fill="#FFD4B8"/>
      <circle cx="280" cy="250" r="45" fill="#FFD4B8"/>
      <circle cx="265" cy="240" r="5" fill="#5A4A42"/>
      <circle cx="295" cy="240" r="5" fill="#5A4A42"/>
      <path d="M265 265 q15 10 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="250" cy="230" r="8" fill="#FFB8A8" opacity="0.6"/>
      <circle cx="480" cy="260" r="30" fill="#FF8FAB"/>
      <circle cx="540" cy="240" r="25" fill="#6C8CFF"/>
      <circle cx="500" cy="310" r="22" fill="#FFE66D"/>
      <circle cx="560" cy="300" r="20" fill="#7DCE82"/>
      <ellipse cx="620" cy="250" rx="40" ry="55" fill="#B8D4F0"/>
      <circle cx="620" cy="180" r="32" fill="#FFD4B8"/>
    `,
  },
  crawling: {
    bg: ["#E8F8F5", "#FFF5E8"],
    body: `
      <ellipse cx="400" cy="400" rx="300" ry="40" fill="#D4F0E8"/>
      <ellipse cx="350" cy="300" rx="80" ry="45" fill="#FFD4B8"/>
      <circle cx="280" cy="260" r="40" fill="#FFD4B8"/>
      <circle cx="265" cy="250" r="5" fill="#5A4A42"/>
      <circle cx="290" cy="250" r="5" fill="#5A4A42"/>
      <path d="M265 275 q12 8 25 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <path d="M300 320 q-30 20 -20 50 M380 320 q30 20 20 50" fill="none" stroke="#FFD4B8" stroke-width="16" stroke-linecap="round"/>
      <path d="M320 280 q-40 -10 -50 20 M400 280 q40 -10 50 20" fill="none" stroke="#FFD4B8" stroke-width="14" stroke-linecap="round"/>
      <circle cx="520" cy="280" r="28" fill="#6C8CFF"/>
      <circle cx="580" cy="250" r="24" fill="#FF8FAB"/>
      <circle cx="550" cy="330" r="20" fill="#7DCE82"/>
    `,
  },
  "mirror-me": {
    bg: ["#E8F4FF", "#FFF0F4"],
    body: `
      <ellipse cx="400" cy="230" rx="100" ry="140" fill="#C8D8F0" stroke="#8BA4C8" stroke-width="12"/>
      <circle cx="400" cy="200" r="45" fill="#FFD4B8"/>
      <circle cx="382" cy="190" r="5" fill="#5A4A42"/>
      <circle cx="418" cy="190" r="5" fill="#5A4A42"/>
      <path d="M382 215 q18 12 36 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="400" cy="280" rx="40" ry="45" fill="#FF8FAB"/>
      <circle cx="200" cy="280" r="40" fill="#FFD4B8"/>
      <circle cx="185" cy="270" r="5" fill="#5A4A42"/>
      <circle cx="215" cy="270" r="5" fill="#5A4A42"/>
      <path d="M185 295 q15 10 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="200" cy="360" rx="38" ry="45" fill="#6C8CFF"/>
      <circle cx="600" cy="280" r="35" fill="#FFE66D" opacity="0.8"/>
    `,
  },
  "peek-a-boo": {
    bg: ["#FFF0F4", "#E8F8FF"],
    body: `
      <circle cx="350" cy="220" r="50" fill="#FFD4B8"/>
      <circle cx="330" cy="205" r="6" fill="#5A4A42"/>
      <circle cx="370" cy="205" r="6" fill="#5A4A42"/>
      <path d="M330 235 q20 15 40 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="315" cy="195" r="10" fill="#FFB8A8" opacity="0.6"/>
      <circle cx="385" cy="195" r="10" fill="#FFB8A8" opacity="0.6"/>
      <path d="M280 160 Q350 80 420 160 L420 280 Q350 320 280 280 Z" fill="#6C8CFF" opacity="0.85"/>
      <circle cx="550" cy="250" r="40" fill="#E8B898"/>
      <ellipse cx="550" cy="340" rx="42" ry="50" fill="#FF8FAB"/>
      <path d="M520 220 Q550 180 580 220" fill="#B388FF"/>
      <circle cx="180" cy="300" r="25" fill="#FFE66D"/>
      <circle cx="650" cy="180" r="20" fill="#7DCE82"/>
    `,
  },
  "nursery-rhymes": {
    bg: ["#F0E8FF", "#FFF5E8"],
    body: `
      <rect x="200" y="160" width="120" height="160" rx="10" fill="#6C8CFF"/>
      <rect x="215" y="180" width="90" height="12" rx="4" fill="#FFF" opacity="0.6"/>
      <rect x="215" y="210" width="90" height="12" rx="4" fill="#FFF" opacity="0.6"/>
      <rect x="215" y="240" width="70" height="12" rx="4" fill="#FFF" opacity="0.6"/>
      <circle cx="450" cy="200" r="45" fill="#FFD4B8"/>
      <path d="M415 175 Q450 140 485 175" fill="#FF8FAB"/>
      <circle cx="435" cy="190" r="5" fill="#5A4A42"/>
      <circle cx="465" cy="190" r="5" fill="#5A4A42"/>
      <path d="M435 215 q15 10 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="450" cy="300" rx="48" ry="55" fill="#7DCE82"/>
      <path d="M580 150 q20 -40 40 0 M640 130 q20 -40 40 0 M700 160 q20 -40 40 0" fill="none" stroke="#B388FF" stroke-width="6" stroke-linecap="round"/>
      <circle cx="620" cy="280" r="35" fill="#FFE66D"/>
      <rect x="610" y="280" width="20" height="80" rx="5" fill="#E0C040"/>
    `,
  },
  "water-play": {
    bg: ["#D4F0FF", "#E8F8FF"],
    body: `
      <ellipse cx="400" cy="380" rx="280" ry="50" fill="#6CB8E8" opacity="0.4"/>
      <ellipse cx="350" cy="280" rx="120" ry="50" fill="#A8D4FF"/>
      <circle cx="300" cy="250" r="35" fill="#FFD4B8"/>
      <circle cx="285" cy="240" r="5" fill="#5A4A42"/>
      <circle cx="315" cy="240" r="5" fill="#5A4A42"/>
      <path d="M285 265 q15 10 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="420" cy="240" r="25" fill="#FF8FAB"/>
      <circle cx="480" cy="260" r="22" fill="#FFE66D"/>
      <circle cx="450" cy="300" r="18" fill="#7DCE82"/>
      <path d="M200 320 q30 -20 60 0 q30 20 60 0" fill="none" stroke="#4ECDC4" stroke-width="8" opacity="0.5"/>
      <path d="M500 340 q30 -20 60 0" fill="none" stroke="#4ECDC4" stroke-width="8" opacity="0.5"/>
      <ellipse cx="600" cy="250" rx="40" ry="55" fill="#B8D4F0"/>
      <circle cx="600" cy="180" r="30" fill="#FFD4B8"/>
    `,
  },
  "baby-sounds": {
    bg: ["#FFF0F4", "#E8F8FF"],
    body: `
      <circle cx="300" cy="220" r="55" fill="#FFD4B8"/>
      <circle cx="280" cy="205" r="6" fill="#5A4A42"/>
      <circle cx="320" cy="205" r="6" fill="#5A4A42"/>
      <path d="M280 240 q20 15 40 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="300" cy="330" rx="50" ry="55" fill="#FF8FAB"/>
      <ellipse cx="500" cy="250" rx="45" ry="60" fill="#B8D4F0"/>
      <circle cx="500" cy="170" r="40" fill="#E8B898"/>
      <path d="M400 180 q20 -15 40 0 M420 160 q20 -15 40 0 M440 145 q20 -15 40 0" fill="none" stroke="#6C8CFF" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
      <circle cx="600" cy="300" r="30" fill="#FFE66D"/>
      <circle cx="180" cy="300" r="25" fill="#7DCE82"/>
    `,
  },
  "generic-infant": {
    bg: ["#FFF0E8", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="380" rx="250" ry="40" fill="#F0E0D0"/>
      <circle cx="350" cy="220" r="55" fill="#FFD4B8"/>
      <circle cx="330" cy="205" r="6" fill="#5A4A42"/>
      <circle cx="370" cy="205" r="6" fill="#5A4A42"/>
      <path d="M330 240 q20 15 40 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="350" cy="330" rx="55" ry="60" fill="#FF8FAB"/>
      <circle cx="500" cy="280" r="35" fill="#6C8CFF"/>
      <circle cx="560" cy="250" r="28" fill="#FFE66D"/>
      <circle cx="530" cy="330" r="24" fill="#7DCE82"/>
    `,
  },
  "generic-toddler": {
    bg: ["#E8F8F0", "#FFF5E8"],
    body: `
      <ellipse cx="400" cy="400" rx="280" ry="40" fill="#D4E8C8"/>
      <circle cx="350" cy="180" r="45" fill="#FFD4B8"/>
      <circle cx="335" cy="168" r="5" fill="#5A4A42"/>
      <circle cx="365" cy="168" r="5" fill="#5A4A42"/>
      <path d="M335 195 q15 10 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="350" cy="280" rx="48" ry="55" fill="#6C8CFF"/>
      <path d="M320 300 q-30 30 -20 60 M380 300 q30 30 20 60" fill="none" stroke="#6C8CFF" stroke-width="16" stroke-linecap="round"/>
      <rect x="480" y="250" width="60" height="60" rx="8" fill="#FF6B6B"/>
      <rect x="520" y="200" width="60" height="60" rx="8" fill="#FFE66D"/>
      <circle cx="600" cy="280" r="30" fill="#7DCE82"/>
    `,
  },
  "generic-preschool": {
    bg: ["#E8F0FF", "#FFF5E8"],
    body: `
      <ellipse cx="400" cy="400" rx="300" ry="40" fill="#E0D8C8"/>
      <circle cx="280" cy="180" r="40" fill="#FFD4B8"/>
      <ellipse cx="280" cy="280" rx="45" ry="55" fill="#FF8FAB"/>
      <circle cx="400" cy="170" r="40" fill="#E8B898"/>
      <ellipse cx="400" cy="270" rx="45" ry="55" fill="#6C8CFF"/>
      <circle cx="520" cy="180" r="40" fill="#D4A574"/>
      <ellipse cx="520" cy="280" rx="45" ry="55" fill="#7DCE82"/>
      <circle cx="200" cy="340" r="25" fill="#FFE66D"/>
      <rect x="550" y="320" width="50" height="50" rx="8" fill="#4ECDC4"/>
      <polygon points="650,320 700,320 675,380" fill="#B388FF"/>
    `,
  },
  default: {
    bg: ["#EDE8FF", "#E8F4FF"],
    body: `
      <circle cx="400" cy="200" r="80" fill="#9d85ff" opacity="0.3"/>
      <path d="M340 180 Q400 120 460 180 L460 260 Q400 300 340 260 Z" fill="#7b5fe8"/>
      <circle cx="400" cy="200" r="35" fill="#FFF"/>
      <path d="M385 190 L400 210 L430 170" fill="none" stroke="#7b5fe8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="200" cy="300" r="30" fill="#FF8FAB" opacity="0.7"/>
      <circle cx="600" cy="280" r="35" fill="#4ECDC4" opacity="0.7"/>
      <circle cx="280" cy="350" r="20" fill="#FFE66D" opacity="0.7"/>
      <circle cx="520" cy="340" r="25" fill="#7DCE82" opacity="0.7"/>
    `,
  },
};

let count = 0;
Object.entries(covers).forEach(([name, def]) => {
  const file = path.join(OUT, `${name}.svg`);
  fs.writeFileSync(file, svg(def.body, def.bg));
  count += 1;
});
console.log(`Generated ${count} lesson plan covers in ${OUT}`);

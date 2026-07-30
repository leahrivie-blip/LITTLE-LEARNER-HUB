#!/usr/bin/env node
/**
 * Hand-crafted children's-book SVG covers for themes that were sharing art.
 * Flat watercolor-storybook shapes — not photorealistic / AI-photo style.
 * Run: node scripts/generate-theme-unique-covers.js
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "images", "lesson-covers");
fs.mkdirSync(OUT, { recursive: true });
const W = 800;
const H = 450;

function svg(body, bg0, bg1) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${body}
</svg>`;
}

const covers = {
  "christmas-celebration": {
    bg: ["#FFF5F5", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="420" rx="320" ry="40" fill="#E8F0E0" opacity="0.9"/>
      <polygon points="400,70 470,250 330,250" fill="#3D8B6E"/>
      <polygon points="400,120 455,260 345,260" fill="#4FA883"/>
      <polygon points="400,170 440,270 360,270" fill="#62C49A"/>
      <rect x="385" y="270" width="30" height="50" rx="4" fill="#8B5A3C"/>
      <circle cx="370" cy="160" r="10" fill="#E85D5D"/>
      <circle cx="430" cy="190" r="9" fill="#F2C14E"/>
      <circle cx="390" cy="220" r="8" fill="#6C8CFF"/>
      <circle cx="420" cy="150" r="8" fill="#FF8FAB"/>
      <rect x="160" y="280" width="70" height="50" rx="8" fill="#E85D5D"/>
      <rect x="175" y="265" width="40" height="18" rx="4" fill="#F2C14E"/>
      <rect x="560" y="290" width="70" height="50" rx="8" fill="#6C8CFF"/>
      <rect x="575" y="275" width="40" height="18" rx="4" fill="#FF8FAB"/>
      <path d="M120 120 q40 -50 80 0 q-40 20 -80 0" fill="#FFF8F0" stroke="#D0D8E8" stroke-width="3"/>
      <path d="M620 100 q45 -55 90 0 q-45 22 -90 0" fill="#FFF8F0" stroke="#D0D8E8" stroke-width="3"/>
      <circle cx="400" cy="85" r="12" fill="#F2C14E"/>
      <path d="M400 70 l4 12 l12 1 l-9 8 l3 12 l-10 -7 l-10 7 l3 -12 l-9 -8 l12 -1 z" fill="#F2C14E"/>
    `,
  },
  "hibernation-winter-sleep": {
    bg: ["#EAF2FF", "#F7FBFF"],
    body: `
      <ellipse cx="400" cy="390" rx="340" ry="55" fill="#DCE8F5"/>
      <path d="M120 300 Q200 180 320 260 Q380 300 420 240 Q500 140 680 220 L680 360 L120 360 Z" fill="#B7C7D9"/>
      <path d="M180 320 Q260 250 340 300 Q400 340 460 280 Q540 200 660 260" fill="none" stroke="#9AADC4" stroke-width="8"/>
      <ellipse cx="300" cy="310" rx="55" ry="35" fill="#C4A484"/>
      <circle cx="250" cy="295" r="28" fill="#C4A484"/>
      <circle cx="240" cy="288" r="4" fill="#5A4A42"/>
      <ellipse cx="235" cy="300" rx="8" ry="5" fill="#A67C52"/>
      <circle cx="520" cy="90" r="28" fill="#FFF8E8" opacity="0.95"/>
      <circle cx="560" cy="110" r="18" fill="#FFF8E8" opacity="0.8"/>
      <circle cx="150" cy="120" r="8" fill="#FFF" opacity="0.9"/>
      <circle cx="200" cy="90" r="6" fill="#FFF" opacity="0.85"/>
      <circle cx="640" cy="150" r="7" fill="#FFF" opacity="0.9"/>
      <circle cx="700" cy="80" r="5" fill="#FFF" opacity="0.8"/>
      <path d="M480 330 q30 -40 60 0 q-10 25 -30 35 q-20 -10 -30 -35z" fill="#7DCE82" opacity="0.7"/>
      <rect x="600" y="300" width="18" height="50" rx="4" fill="#8B6B4A"/>
      <ellipse cx="609" cy="295" rx="28" ry="16" fill="#3D8B6E"/>
    `,
  },
  "rainforest-adventure": {
    bg: ["#E8FFF0", "#FFF8E0"],
    body: `
      <ellipse cx="400" cy="410" rx="360" ry="45" fill="#7DCE82" opacity="0.55"/>
      <rect x="80" y="160" width="28" height="220" rx="10" fill="#2F6B4F"/>
      <ellipse cx="94" cy="150" rx="55" ry="30" fill="#3D8B6E"/>
      <ellipse cx="70" cy="175" rx="40" ry="22" fill="#4FA883"/>
      <rect x="680" y="140" width="30" height="240" rx="10" fill="#2F6B4F"/>
      <ellipse cx="695" cy="130" rx="60" ry="32" fill="#3D8B6E"/>
      <ellipse cx="720" cy="160" rx="42" ry="24" fill="#4FA883"/>
      <path d="M200 80 q60 40 40 120 q40 -20 80 10" fill="#62C49A"/>
      <path d="M500 60 q70 50 50 140 q50 -30 90 20" fill="#4FA883"/>
      <ellipse cx="360" cy="300" rx="45" ry="28" fill="#E85D5D"/>
      <circle cx="340" cy="285" r="10" fill="#FFF8F0"/>
      <circle cx="380" cy="285" r="10" fill="#FFF8F0"/>
      <circle cx="340" cy="285" r="4" fill="#333"/>
      <circle cx="380" cy="285" r="4" fill="#333"/>
      <path d="M250 220 q40 -60 80 -10" fill="none" stroke="#F2C14E" stroke-width="10" stroke-linecap="round"/>
      <circle cx="250" cy="220" r="14" fill="#F2C14E"/>
      <circle cx="330" cy="210" r="12" fill="#F2C14E"/>
      <circle cx="550" cy="280" r="22" fill="#6C8CFF"/>
      <path d="M530 280 q20 -35 40 0 q-20 18 -40 0" fill="#8AA8FF"/>
      <circle cx="480" cy="160" r="16" fill="#FF8FAB"/>
      <path d="M460 175 q20 30 40 0" fill="#FF8FAB"/>
    `,
  },
  "we-belong-together": {
    bg: ["#FFF0F5", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="400" rx="280" ry="40" fill="#F0E0D0" opacity="0.85"/>
      <circle cx="250" cy="210" r="38" fill="#FFD4B8"/>
      <ellipse cx="250" cy="300" rx="42" ry="55" fill="#6C8CFF"/>
      <circle cx="400" cy="230" r="34" fill="#E8B898"/>
      <ellipse cx="400" cy="310" rx="38" ry="50" fill="#FF8FAB"/>
      <circle cx="550" cy="210" r="38" fill="#D4A574"/>
      <ellipse cx="550" cy="300" rx="42" ry="55" fill="#7DCE82"/>
      <path d="M290 250 Q400 330 510 250" fill="none" stroke="#F2C14E" stroke-width="10" stroke-linecap="round"/>
      <circle cx="400" cy="120" r="26" fill="#FF8FAB"/>
      <path d="M400 100 C385 85 360 95 360 115 C360 95 335 85 320 100 C335 70 370 70 400 95 C430 70 465 70 480 100 C465 85 440 95 440 115 C440 95 415 85 400 100 Z" fill="#E85D5D"/>
    `,
  },
  "caring-hearts": {
    bg: ["#FFE8F0", "#FFF8F0"],
    body: `
      <ellipse cx="400" cy="400" rx="300" ry="40" fill="#F5D0D8" opacity="0.7"/>
      <path d="M400 120 C360 70 280 90 280 160 C280 220 400 300 400 300 C400 300 520 220 520 160 C520 90 440 70 400 120 Z" fill="#E85D5D"/>
      <path d="M250 280 C230 255 195 265 195 295 C195 320 250 355 250 355 C250 355 305 320 305 295 C305 265 270 255 250 280 Z" fill="#FF8FAB"/>
      <path d="M560 270 C540 245 505 255 505 285 C505 310 560 345 560 345 C560 345 615 310 615 285 C615 255 580 245 560 270 Z" fill="#FFB3C6"/>
      <circle cx="180" cy="140" r="10" fill="#F2C14E" opacity="0.8"/>
      <circle cx="620" cy="150" r="12" fill="#6C8CFF" opacity="0.7"/>
      <circle cx="400" cy="80" r="8" fill="#7DCE82" opacity="0.8"/>
    `,
  },
  "my-home-my-family": {
    bg: ["#FFF8E8", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="400" rx="320" ry="40" fill="#E0D0C0" opacity="0.8"/>
      <rect x="280" y="200" width="240" height="160" rx="8" fill="#F4D7B8"/>
      <polygon points="400,100 560,200 240,200" fill="#E85D5D"/>
      <rect x="370" y="270" width="60" height="90" rx="4" fill="#8B5A3C"/>
      <rect x="310" y="240" width="45" height="40" rx="4" fill="#A8D4FF"/>
      <rect x="445" y="240" width="45" height="40" rx="4" fill="#A8D4FF"/>
      <circle cx="200" cy="280" r="28" fill="#FFD4B8"/>
      <ellipse cx="200" cy="345" rx="32" ry="40" fill="#6C8CFF"/>
      <circle cx="600" cy="290" r="26" fill="#E8B898"/>
      <ellipse cx="600" cy="350" rx="30" ry="38" fill="#7DCE82"/>
      <circle cx="150" cy="140" r="36" fill="#F2C14E" opacity="0.85"/>
      <rect x="500" y="300" width="14" height="70" rx="3" fill="#8B6B4A"/>
      <ellipse cx="507" cy="295" rx="28" ry="18" fill="#3D8B6E"/>
    `,
  },
  "people-who-love-me": {
    bg: ["#F3E8FF", "#FFF5F0"],
    body: `
      <ellipse cx="400" cy="400" rx="300" ry="40" fill="#E8D8F0" opacity="0.8"/>
      <circle cx="400" cy="200" r="42" fill="#FFD4B8"/>
      <ellipse cx="400" cy="290" rx="48" ry="60" fill="#B388FF"/>
      <circle cx="260" cy="230" r="34" fill="#E8B898"/>
      <ellipse cx="260" cy="310" rx="38" ry="50" fill="#FF8FAB"/>
      <circle cx="540" cy="230" r="34" fill="#D4A574"/>
      <ellipse cx="540" cy="310" rx="38" ry="50" fill="#6C8CFF"/>
      <path d="M310 260 Q400 320 490 260" fill="none" stroke="#E85D5D" stroke-width="8" stroke-linecap="round"/>
      <circle cx="180" cy="120" r="14" fill="#F2C14E"/>
      <circle cx="620" cy="110" r="12" fill="#7DCE82"/>
      <path d="M400 90 C388 78 368 84 368 100 C368 84 348 78 336 90 C348 66 376 66 400 86 C424 66 452 66 464 90 C452 78 432 84 432 100 C432 84 412 78 400 90 Z" fill="#E85D5D"/>
    `,
  },
  "colors-all-around-us": {
    bg: ["#FFF5E8", "#F0F4FF"],
    body: `
      <circle cx="180" cy="160" r="48" fill="#FF6B6B"/>
      <circle cx="300" cy="120" r="40" fill="#FFB347"/>
      <circle cx="420" cy="150" r="46" fill="#FFE66D"/>
      <circle cx="540" cy="120" r="38" fill="#7DCE82"/>
      <circle cx="650" cy="170" r="42" fill="#6C8CFF"/>
      <ellipse cx="400" cy="360" rx="200" ry="30" fill="#F0E0D0" opacity="0.7"/>
      <rect x="250" y="260" width="22" height="90" rx="6" fill="#FF6B6B" transform="rotate(-8 261 305)"/>
      <rect x="320" y="250" width="22" height="100" rx="6" fill="#6C8CFF" transform="rotate(6 331 300)"/>
      <rect x="390" y="255" width="22" height="95" rx="6" fill="#FFE66D"/>
      <rect x="460" y="250" width="22" height="100" rx="6" fill="#7DCE82" transform="rotate(-5 471 300)"/>
      <circle cx="560" cy="290" r="28" fill="#FF8FAB"/>
    `,
  },
  "my-senses": {
    bg: ["#E8FFF8", "#FFF8E8"],
    body: `
      <ellipse cx="400" cy="400" rx="280" ry="35" fill="#D4F0E8" opacity="0.8"/>
      <circle cx="220" cy="180" r="40" fill="#FFD4B8"/>
      <circle cx="205" cy="170" r="6" fill="#5A4A42"/>
      <circle cx="235" cy="170" r="6" fill="#5A4A42"/>
      <path d="M205 195 q15 12 30 0" fill="none" stroke="#C47A5A" stroke-width="3" stroke-linecap="round"/>
      <circle cx="400" cy="160" r="36" fill="#A8D4FF" opacity="0.8"/>
      <circle cx="400" cy="160" r="16" fill="#FFF"/>
      <circle cx="400" cy="160" r="8" fill="#5A4A42"/>
      <path d="M520 140 q40 20 0 60 q-40 20 0 60" fill="none" stroke="#F2C14E" stroke-width="10" stroke-linecap="round"/>
      <ellipse cx="560" cy="280" rx="35" ry="50" fill="#FF8FAB"/>
      <circle cx="300" cy="300" r="30" fill="#7DCE82"/>
      <path d="M180 280 q20 -40 50 0" fill="#E85D5D"/>
    `,
  },
  "my-five-senses": {
    bg: ["#F0F4FF", "#FFF5E8"],
    body: `
      <circle cx="160" cy="140" r="34" fill="#A8D4FF"/>
      <circle cx="160" cy="140" r="14" fill="#FFF"/>
      <circle cx="160" cy="140" r="7" fill="#333"/>
      <path d="M280 110 q50 30 0 80" fill="none" stroke="#F2C14E" stroke-width="12" stroke-linecap="round"/>
      <ellipse cx="400" cy="150" rx="28" ry="40" fill="#FF8FAB"/>
      <path d="M480 120 q30 -20 50 10 q10 20 -10 35" fill="#E85D5D"/>
      <circle cx="600" cy="160" r="32" fill="#FFD4B8"/>
      <path d="M585 175 q15 14 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <rect x="200" y="280" width="80" height="50" rx="12" fill="#7DCE82"/>
      <rect x="320" y="270" width="70" height="60" rx="12" fill="#6C8CFF"/>
      <rect x="440" y="285" width="90" height="45" rx="12" fill="#FFE66D"/>
      <circle cx="600" cy="300" r="36" fill="#B388FF"/>
    `,
  },
  "friendship-feelings": {
    bg: ["#FFF0E8", "#E8F8FF"],
    body: `
      <ellipse cx="400" cy="400" rx="280" ry="35" fill="#F0E0D0" opacity="0.75"/>
      <circle cx="300" cy="220" r="40" fill="#FFD4B8"/>
      <ellipse cx="300" cy="310" rx="44" ry="55" fill="#FF8FAB"/>
      <circle cx="500" cy="220" r="40" fill="#E8B898"/>
      <ellipse cx="500" cy="310" rx="44" ry="55" fill="#6C8CFF"/>
      <path d="M340 250 Q400 290 460 250" fill="none" stroke="#F2C14E" stroke-width="8" stroke-linecap="round"/>
      <circle cx="290" cy="210" r="5" fill="#5A4A42"/>
      <circle cx="310" cy="210" r="5" fill="#5A4A42"/>
      <path d="M290 232 q10 10 20 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="490" cy="210" r="5" fill="#5A4A42"/>
      <circle cx="510" cy="210" r="5" fill="#5A4A42"/>
      <path d="M490 232 q10 10 20 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="400" cy="120" r="22" fill="#E85D5D"/>
    `,
  },
  "farm-friends": {
    bg: ["#E8F8E0", "#FFF8E0"],
    body: `
      <ellipse cx="400" cy="400" rx="340" ry="45" fill="#B8E0A8"/>
      <path d="M500 160 L580 220 L580 330 L420 330 L420 220 Z" fill="#E07050"/>
      <path d="M500 160 L580 220 L420 220 Z" fill="#C05040"/>
      <rect x="470" y="250" width="40" height="80" rx="4" fill="#FFE8D0"/>
      <ellipse cx="220" cy="300" rx="50" ry="35" fill="#FFF8F0"/>
      <circle cx="180" cy="270" r="28" fill="#FFF8F0"/>
      <circle cx="170" cy="262" r="5" fill="#333"/>
      <ellipse cx="155" cy="275" rx="10" ry="6" fill="#FFB6C1"/>
      <ellipse cx="320" cy="310" rx="40" ry="30" fill="#F0A060"/>
      <ellipse cx="300" cy="285" rx="14" ry="20" fill="#F0A060"/>
      <circle cx="650" cy="280" r="26" fill="#FFD93D"/>
      <circle cx="640" cy="270" r="4" fill="#333"/>
      <path d="M655 285 q8 8 16 0" fill="none" stroke="#C47A5A" stroke-width="2"/>
    `,
  },
  "weather-wonders": {
    bg: ["#E8F4FF", "#FFF8E0"],
    body: `
      <circle cx="180" cy="130" r="50" fill="#F2C14E"/>
      <path d="M320 140 q40 -40 90 0 q50 -20 90 30 q40 -10 70 25" fill="#FFF" stroke="#D0D8E8" stroke-width="3"/>
      <path d="M380 200 l8 40 M410 210 l5 35 M450 205 l10 42" stroke="#6C8CFF" stroke-width="6" stroke-linecap="round"/>
      <path d="M520 260 q60 -50 120 20" fill="none" stroke="#7DCE82" stroke-width="8" stroke-linecap="round"/>
      <path d="M560 250 q20 -40 50 -10" fill="none" stroke="#FF8FAB" stroke-width="6"/>
      <path d="M200 300 q80 40 160 0 q80 -40 160 20" fill="none" stroke="#A8D4FF" stroke-width="14" stroke-linecap="round" opacity="0.7"/>
      <circle cx="620" cy="120" r="10" fill="#E85D5D"/>
      <circle cx="650" cy="150" r="8" fill="#FFE66D"/>
      <circle cx="680" cy="125" r="7" fill="#6C8CFF"/>
    `,
  },
  "under-the-sea": {
    bg: ["#D6F0FF", "#E8FFF8"],
    body: `
      <ellipse cx="400" cy="420" rx="360" ry="40" fill="#7DCE82" opacity="0.35"/>
      <ellipse cx="220" cy="220" rx="55" ry="30" fill="#FF8FAB"/>
      <path d="M160 220 q-30 -20 -25 0 q-5 20 25 0" fill="#FF8FAB"/>
      <circle cx="240" cy="212" r="5" fill="#333"/>
      <ellipse cx="420" cy="180" rx="40" ry="24" fill="#6C8CFF"/>
      <path d="M380 180 q-25 -15 -20 0 q-5 15 20 0" fill="#6C8CFF"/>
      <circle cx="440" cy="174" r="4" fill="#FFF"/>
      <circle cx="560" cy="250" r="35" fill="#F2C14E"/>
      <path d="M560 215 l8 -25 M560 215 l-10 -20 M560 215 l15 -15" stroke="#E85D5D" stroke-width="4" stroke-linecap="round"/>
      <path d="M300 300 q40 30 80 0 q40 -30 80 10" fill="none" stroke="#A8D4FF" stroke-width="8" opacity="0.7"/>
      <circle cx="150" cy="320" r="12" fill="#7DCE82"/>
      <circle cx="650" cy="300" r="16" fill="#B388FF"/>
      <circle cx="700" cy="180" r="8" fill="#FFF" opacity="0.7"/>
      <circle cx="120" cy="160" r="6" fill="#FFF" opacity="0.7"/>
    `,
  },
  "growing-gardens": {
    bg: ["#E8FFE8", "#FFF8E0"],
    body: `
      <ellipse cx="400" cy="400" rx="340" ry="45" fill="#C4A484"/>
      <rect x="200" y="250" width="14" height="120" rx="4" fill="#3D8B6E"/>
      <circle cx="207" cy="230" r="28" fill="#E85D5D"/>
      <circle cx="190" cy="245" r="20" fill="#FF8FAB"/>
      <circle cx="224" cy="245" r="20" fill="#FF8FAB"/>
      <rect x="360" y="240" width="16" height="130" rx="4" fill="#3D8B6E"/>
      <ellipse cx="368" cy="220" rx="40" ry="28" fill="#7DCE82"/>
      <ellipse cx="340" cy="235" rx="28" ry="20" fill="#4FA883"/>
      <ellipse cx="396" cy="235" rx="28" ry="20" fill="#4FA883"/>
      <rect x="520" y="260" width="14" height="110" rx="4" fill="#3D8B6E"/>
      <circle cx="527" cy="240" r="26" fill="#F2C14E"/>
      <circle cx="510" cy="255" r="18" fill="#FFE66D"/>
      <circle cx="544" cy="255" r="18" fill="#FFE66D"/>
      <circle cx="150" cy="120" r="40" fill="#F2C14E" opacity="0.85"/>
      <rect x="620" y="300" width="50" height="40" rx="6" fill="#8B5A3C"/>
      <circle cx="645" cy="290" r="18" fill="#7DCE82"/>
    `,
  },
  "black-white-discovery": {
    bg: ["#F4F4F4", "#FFFFFF"],
    body: `
      <circle cx="200" cy="160" r="55" fill="#1A1A1A"/>
      <circle cx="200" cy="160" r="28" fill="#FFF"/>
      <circle cx="200" cy="160" r="12" fill="#1A1A1A"/>
      <rect x="320" y="110" width="100" height="100" fill="#1A1A1A"/>
      <rect x="340" y="130" width="60" height="60" fill="#FFF"/>
      <polygon points="520,100 580,210 460,210" fill="#1A1A1A"/>
      <circle cx="620" cy="280" r="45" fill="#1A1A1A"/>
      <path d="M150 300 h120 v80 h-120 z" fill="#1A1A1A"/>
      <path d="M180 320 h60 v40 h-60 z" fill="#FFF"/>
      <ellipse cx="400" cy="320" rx="50" ry="30" fill="#1A1A1A"/>
      <circle cx="500" cy="340" r="20" fill="#1A1A1A"/>
      <circle cx="700" cy="140" r="18" fill="#1A1A1A"/>
    `,
  },
  "sensory-discovery": {
    bg: ["#FFF5F0", "#E8F8FF"],
    body: `
      <circle cx="200" cy="180" r="40" fill="#FF8FAB" opacity="0.85"/>
      <circle cx="280" cy="140" r="28" fill="#6C8CFF" opacity="0.85"/>
      <circle cx="350" cy="200" r="34" fill="#7DCE82" opacity="0.85"/>
      <circle cx="450" cy="150" r="30" fill="#F2C14E" opacity="0.85"/>
      <circle cx="530" cy="210" r="38" fill="#B388FF" opacity="0.85"/>
      <circle cx="620" cy="160" r="26" fill="#FF6B6B" opacity="0.85"/>
      <ellipse cx="400" cy="360" rx="220" ry="35" fill="#F0E0D0" opacity="0.7"/>
      <rect x="250" y="280" width="90" height="50" rx="20" fill="#A8D4FF"/>
      <rect x="370" y="270" width="70" height="60" rx="16" fill="#FFE66D"/>
      <rect x="470" y="285" width="100" height="45" rx="18" fill="#FFB3C6"/>
    `,
  },
  "babys-first-conversations": {
    bg: ["#FFF0F5", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="390" rx="260" ry="40" fill="#F0E0D0" opacity="0.75"/>
      <circle cx="300" cy="220" r="48" fill="#FFD4B8"/>
      <circle cx="285" cy="208" r="5" fill="#5A4A42"/>
      <circle cx="315" cy="208" r="5" fill="#5A4A42"/>
      <path d="M285 235 q15 14 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="500" cy="230" r="42" fill="#E8B898"/>
      <circle cx="488" cy="220" r="5" fill="#5A4A42"/>
      <circle cx="512" cy="220" r="5" fill="#5A4A42"/>
      <path d="M488 245 q12 10 24 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <path d="M360 180 q20 -40 40 -10" fill="none" stroke="#6C8CFF" stroke-width="6" stroke-linecap="round"/>
      <path d="M420 170 q30 -45 55 -5" fill="none" stroke="#FF8FAB" stroke-width="6" stroke-linecap="round"/>
      <circle cx="380" cy="130" r="10" fill="#6C8CFF" opacity="0.6"/>
      <circle cx="460" cy="120" r="12" fill="#FF8FAB" opacity="0.6"/>
      <circle cx="200" cy="140" r="16" fill="#F2C14E" opacity="0.7"/>
    `,
  },
  "smiles-expressions": {
    bg: ["#FFF8E0", "#FFE8F0"],
    body: `
      <circle cx="250" cy="200" r="55" fill="#FFD4B8"/>
      <circle cx="230" cy="185" r="6" fill="#5A4A42"/>
      <circle cx="270" cy="185" r="6" fill="#5A4A42"/>
      <path d="M230 215 q20 22 40 0" fill="none" stroke="#C47A5A" stroke-width="4" stroke-linecap="round"/>
      <circle cx="450" cy="210" r="50" fill="#E8B898"/>
      <circle cx="432" cy="195" r="6" fill="#5A4A42"/>
      <circle cx="468" cy="195" r="6" fill="#5A4A42"/>
      <circle cx="432" cy="220" r="5" fill="#FF8FAB" opacity="0.7"/>
      <circle cx="468" cy="220" r="5" fill="#FF8FAB" opacity="0.7"/>
      <path d="M435 230 q15 8 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="620" cy="190" r="48" fill="#FFD4B8"/>
      <circle cx="602" cy="175" r="6" fill="#5A4A42"/>
      <circle cx="638" cy="175" r="6" fill="#5A4A42"/>
      <path d="M600 200 q20 -12 40 0" fill="none" stroke="#C47A5A" stroke-width="4" stroke-linecap="round"/>
      <circle cx="400" cy="330" r="30" fill="#F2C14E"/>
      <path d="M385 330 q15 12 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
    `,
  },
  "grandfriends-loving-faces": {
    bg: ["#FFF5F0", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="410" rx="300" ry="40" fill="#F0E0D0" opacity="0.75"/>
      <circle cx="260" cy="210" r="52" fill="#E8C4A8"/>
      <circle cx="245" cy="198" r="5" fill="#5A4A42"/>
      <circle cx="275" cy="198" r="5" fill="#5A4A42"/>
      <path d="M245 225 q15 14 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <path d="M230 175 q15 -18 30 0" fill="none" stroke="#B0B8C8" stroke-width="6" stroke-linecap="round"/>
      <circle cx="520" cy="230" r="40" fill="#FFD4B8"/>
      <circle cx="508" cy="220" r="5" fill="#5A4A42"/>
      <circle cx="532" cy="220" r="5" fill="#5A4A42"/>
      <path d="M508 242 q12 12 24 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="520" cy="300" rx="36" ry="42" fill="#FF8FAB"/>
      <ellipse cx="260" cy="300" rx="48" ry="55" fill="#6C8CFF"/>
      <path d="M320 250 Q400 300 460 250" fill="none" stroke="#F2C14E" stroke-width="8" stroke-linecap="round"/>
      <rect x="600" y="160" width="70" height="90" rx="10" fill="#FFF8F0" stroke="#D0D8E8" stroke-width="4"/>
      <circle cx="635" cy="200" r="18" fill="#E8C4A8"/>
      <circle cx="628" cy="195" r="3" fill="#5A4A42"/>
      <circle cx="642" cy="195" r="3" fill="#5A4A42"/>
    `,
  },
  "family-faces-loving-people": {
    bg: ["#E8FFF4", "#FFF8E8"],
    body: `
      <ellipse cx="400" cy="400" rx="320" ry="42" fill="#D8EFD0" opacity="0.8"/>
      <circle cx="220" cy="200" r="44" fill="#E8B898"/>
      <circle cx="400" cy="180" r="48" fill="#FFD4B8"/>
      <circle cx="580" cy="200" r="44" fill="#E8C4A8"/>
      <circle cx="310" cy="290" r="36" fill="#FFD4B8"/>
      <circle cx="490" cy="290" r="36" fill="#E8B898"/>
      <circle cx="205" cy="188" r="5" fill="#5A4A42"/>
      <circle cx="235" cy="188" r="5" fill="#5A4A42"/>
      <path d="M205 212 q15 12 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="385" cy="168" r="5" fill="#5A4A42"/>
      <circle cx="415" cy="168" r="5" fill="#5A4A42"/>
      <path d="M385 195 q15 14 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="565" cy="188" r="5" fill="#5A4A42"/>
      <circle cx="595" cy="188" r="5" fill="#5A4A42"/>
      <path d="M565 212 q15 12 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="400" cy="100" r="18" fill="#E85D5D"/>
    `,
  },
  "my-family-familiar-faces": {
    bg: ["#FFF0F8", "#E8F4FF"],
    body: `
      <ellipse cx="400" cy="405" rx="300" ry="38" fill="#F0E0D8" opacity="0.75"/>
      <rect x="140" y="140" width="150" height="170" rx="18" fill="#FFF8F0" stroke="#E0D0C8" stroke-width="5"/>
      <circle cx="215" cy="210" r="36" fill="#FFD4B8"/>
      <circle cx="203" cy="200" r="4" fill="#5A4A42"/>
      <circle cx="227" cy="200" r="4" fill="#5A4A42"/>
      <path d="M203 222 q12 10 24 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <rect x="325" y="130" width="150" height="180" rx="18" fill="#FFF8F0" stroke="#E0D0C8" stroke-width="5"/>
      <circle cx="400" cy="205" r="40" fill="#E8B898"/>
      <circle cx="386" cy="193" r="4" fill="#5A4A42"/>
      <circle cx="414" cy="193" r="4" fill="#5A4A42"/>
      <path d="M386 218 q14 12 28 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <rect x="510" y="145" width="150" height="165" rx="18" fill="#FFF8F0" stroke="#E0D0C8" stroke-width="5"/>
      <circle cx="585" cy="210" r="34" fill="#FFD4B8"/>
      <circle cx="574" cy="200" r="4" fill="#5A4A42"/>
      <circle cx="596" cy="200" r="4" fill="#5A4A42"/>
      <path d="M574 222 q11 9 22 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="400" cy="80" r="16" fill="#F2C14E"/>
    `,
  },
  "grandfriends-photos-keepsakes": {
    bg: ["#FFF8E8", "#F0E8FF"],
    body: `
      <ellipse cx="400" cy="410" rx="310" ry="40" fill="#E8DCC8" opacity="0.7"/>
      <rect x="180" y="120" width="120" height="140" rx="12" fill="#FFF" stroke="#C4A484" stroke-width="8"/>
      <circle cx="240" cy="180" r="28" fill="#E8C4A8"/>
      <circle cx="232" cy="172" r="3" fill="#5A4A42"/>
      <circle cx="248" cy="172" r="3" fill="#5A4A42"/>
      <rect x="340" y="150" width="130" height="150" rx="12" fill="#FFF" stroke="#6C8CFF" stroke-width="8"/>
      <circle cx="405" cy="215" r="32" fill="#FFD4B8"/>
      <circle cx="395" cy="205" r="3" fill="#5A4A42"/>
      <circle cx="415" cy="205" r="3" fill="#5A4A42"/>
      <path d="M395 228 q10 8 20 0" fill="none" stroke="#C47A5A" stroke-width="2"/>
      <rect x="520" y="130" width="110" height="130" rx="12" fill="#FFF" stroke="#E85D5D" stroke-width="8"/>
      <circle cx="575" cy="185" r="26" fill="#E8B898"/>
      <circle cx="180" cy="320" r="22" fill="#F2C14E"/>
      <circle cx="250" cy="340" r="16" fill="#FF8FAB"/>
      <rect x="560" y="300" width="50" height="40" rx="8" fill="#7DCE82"/>
      <path d="M300 100 q40 -30 80 0" fill="none" stroke="#B388FF" stroke-width="6" stroke-linecap="round"/>
    `,
  },
  "friendship-problem-solvers": {
    bg: ["#E8F8FF", "#FFF5E8"],
    body: `
      <ellipse cx="400" cy="400" rx="280" ry="38" fill="#E0E8F0" opacity="0.75"/>
      <circle cx="300" cy="220" r="42" fill="#FFD4B8"/>
      <circle cx="500" cy="220" r="42" fill="#E8B898"/>
      <ellipse cx="300" cy="310" rx="46" ry="52" fill="#6C8CFF"/>
      <ellipse cx="500" cy="310" rx="46" ry="52" fill="#7DCE82"/>
      <circle cx="288" cy="208" r="5" fill="#5A4A42"/>
      <circle cx="312" cy="208" r="5" fill="#5A4A42"/>
      <circle cx="488" cy="208" r="5" fill="#5A4A42"/>
      <circle cx="512" cy="208" r="5" fill="#5A4A42"/>
      <path d="M288 232 q12 8 24 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <path d="M488 232 q12 8 24 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="400" cy="160" r="34" fill="#FFE66D"/>
      <path d="M388 145 q12 -14 24 0 q0 14 -12 18" fill="none" stroke="#5A4A42" stroke-width="5" stroke-linecap="round"/>
      <circle cx="400" cy="178" r="4" fill="#5A4A42"/>
      <path d="M340 250 Q400 280 460 250" fill="none" stroke="#F2C14E" stroke-width="7" stroke-linecap="round"/>
    `,
  },
  "hello-fall-little-one": {
    bg: ["#FFF4E0", "#FFE8D0"],
    body: `
      <ellipse cx="400" cy="410" rx="340" ry="42" fill="#E8C9A0"/>
      <circle cx="160" cy="120" r="45" fill="#F2C14E" opacity="0.85"/>
      <path d="M280 100 q30 80 10 160" fill="none" stroke="#C45C26" stroke-width="8" stroke-linecap="round"/>
      <ellipse cx="300" cy="140" rx="28" ry="16" fill="#E85D5D" transform="rotate(-20 300 140)"/>
      <ellipse cx="340" cy="200" rx="26" ry="15" fill="#F2C14E" transform="rotate(15 340 200)"/>
      <ellipse cx="280" cy="230" rx="24" ry="14" fill="#E07050" transform="rotate(-10 280 230)"/>
      <rect x="480" y="200" width="18" height="140" rx="5" fill="#8B5A3C"/>
      <ellipse cx="489" cy="190" rx="50" ry="30" fill="#C45C26"/>
      <ellipse cx="460" cy="210" rx="30" ry="20" fill="#E07050"/>
      <ellipse cx="520" cy="210" rx="30" ry="20" fill="#E85D5D"/>
      <circle cx="620" cy="260" r="40" fill="#FFD4B8"/>
      <circle cx="608" cy="248" r="5" fill="#5A4A42"/>
      <circle cx="632" cy="248" r="5" fill="#5A4A42"/>
      <path d="M608 272 q12 12 24 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="620" cy="330" rx="38" ry="45" fill="#FF8FAB"/>
    `,
  },
  "family-songs-loving-rhythms": {
    bg: ["#FFF0F5", "#E8FFF8"],
    body: `
      <ellipse cx="400" cy="405" rx="300" ry="38" fill="#E8D0E0" opacity="0.7"/>
      <circle cx="280" cy="220" r="40" fill="#FFD4B8"/>
      <circle cx="500" cy="220" r="40" fill="#E8B898"/>
      <ellipse cx="280" cy="305" rx="42" ry="50" fill="#B388FF"/>
      <ellipse cx="500" cy="305" rx="42" ry="50" fill="#6C8CFF"/>
      <circle cx="268" cy="208" r="5" fill="#5A4A42"/>
      <circle cx="292" cy="208" r="5" fill="#5A4A42"/>
      <circle cx="488" cy="208" r="5" fill="#5A4A42"/>
      <circle cx="512" cy="208" r="5" fill="#5A4A42"/>
      <path d="M268 232 q12 10 24 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <path d="M488 232 q12 10 24 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <circle cx="400" cy="140" r="28" fill="#F2C14E"/>
      <path d="M400 110 v-30 M385 95 h30" stroke="#F2C14E" stroke-width="6" stroke-linecap="round"/>
      <path d="M180 160 q20 -40 40 0" fill="none" stroke="#FF8FAB" stroke-width="5"/>
      <path d="M580 150 q25 -45 50 0" fill="none" stroke="#7DCE82" stroke-width="5"/>
      <ellipse cx="650" cy="280" rx="18" ry="28" fill="#E85D5D"/>
      <rect x="665" y="220" width="6" height="70" rx="2" fill="#5A4A42"/>
    `,
  },
  "healthy-me": {
    bg: ["#E8FFF0", "#FFF8E0"],
    body: `
      <ellipse cx="400" cy="405" rx="300" ry="40" fill="#C8E8C0" opacity="0.75"/>
      <circle cx="400" cy="180" r="50" fill="#FFD4B8"/>
      <circle cx="385" cy="168" r="5" fill="#5A4A42"/>
      <circle cx="415" cy="168" r="5" fill="#5A4A42"/>
      <path d="M385 195 q15 14 30 0" fill="none" stroke="#C47A5A" stroke-width="3"/>
      <ellipse cx="400" cy="290" rx="55" ry="65" fill="#7DCE82"/>
      <circle cx="220" cy="240" r="36" fill="#E85D5D"/>
      <ellipse cx="210" cy="255" rx="14" ry="18" fill="#FFF" opacity="0.35"/>
      <circle cx="580" cy="240" r="34" fill="#F2C14E"/>
      <path d="M580 210 q8 -20 0 -35" fill="none" stroke="#3D8B6E" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="160" cy="320" rx="30" ry="20" fill="#FF8FAB"/>
      <ellipse cx="640" cy="320" rx="28" ry="18" fill="#6C8CFF"/>
      <path d="M300 120 q50 -40 100 0" fill="none" stroke="#A8D4FF" stroke-width="8" stroke-linecap="round" opacity="0.7"/>
    `,
  },
  "preschool-classroom-explorers": {
    bg: ["#E8F4FF", "#FFF8F0"],
    body: `
      <rect x="120" y="100" width="560" height="280" rx="24" fill="#FFF8F0" stroke="#D0D8E8" stroke-width="6"/>
      <rect x="160" y="140" width="80" height="60" rx="10" fill="#A8D4FF"/>
      <rect x="270" y="140" width="80" height="60" rx="10" fill="#FFE66D"/>
      <rect x="380" y="140" width="80" height="60" rx="10" fill="#FFB3C6"/>
      <rect x="490" y="140" width="80" height="60" rx="10" fill="#7DCE82"/>
      <circle cx="250" cy="280" r="32" fill="#FFD4B8"/>
      <circle cx="400" cy="270" r="34" fill="#E8B898"/>
      <circle cx="550" cy="280" r="32" fill="#FFD4B8"/>
      <circle cx="240" cy="270" r="4" fill="#5A4A42"/>
      <circle cx="260" cy="270" r="4" fill="#5A4A42"/>
      <circle cx="388" cy="258" r="4" fill="#5A4A42"/>
      <circle cx="412" cy="258" r="4" fill="#5A4A42"/>
      <circle cx="540" cy="270" r="4" fill="#5A4A42"/>
      <circle cx="560" cy="270" r="4" fill="#5A4A42"/>
      <rect x="200" y="330" width="120" height="28" rx="8" fill="#6C8CFF"/>
      <rect x="360" y="330" width="90" height="28" rx="8" fill="#F2C14E"/>
      <rect x="480" y="330" width="110" height="28" rx="8" fill="#FF8FAB"/>
    `,
  },
};

let written = 0;
for (const [slug, spec] of Object.entries(covers)) {
  const file = path.join(OUT, `${slug}.svg`);
  fs.writeFileSync(file, svg(spec.body, spec.bg[0], spec.bg[1]));
  written += 1;
  console.log("wrote", path.basename(file));
}
console.log(`\nGenerated ${written} unique theme covers.`);

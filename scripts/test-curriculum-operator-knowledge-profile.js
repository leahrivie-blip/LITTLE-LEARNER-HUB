#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const kp = require("./curriculum-operator-knowledge-profile.js");
const knowledge = require("./curriculum-operator-childcare-knowledge.js");
const createApi = require("./curriculum-operator-create.js");
const ageSafety = require("./curriculum-operator-guided-age-safety.js");

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log("Knowledge profile structure");
ok(kp.KNOWLEDGE_PROFILE_VERSION >= 2, "versioned profile v2+");
ok(kp.developmentLinesForStage("infant_0_3", 20).length >= 9, "infant 0-3 full stage lines");
ok(kp.getSectionLines("development", { stage: "young_toddler", maxLines: 30 }).length >= 8, "section API by stage");
ok(kp.SECTION_IDS.length >= 8, "independent sections");
ok(kp.DOMAINS.length >= 10, "developmental domains listed");

console.log("Development stages");
ok(kp.resolveDevelopmentStage("infant", "Infants 0–3 months") === "infant_0_3", "infant 0-3");
ok(kp.resolveDevelopmentStage("infant", "6–12 months") === "infant_6_12", "infant 6-12");
ok(kp.resolveDevelopmentStage("toddler", "12–24 months") === "young_toddler", "young toddler");
ok(kp.developmentLinesForStage("young_toddler", 5).length >= 3, "young toddler lines");

console.log("Architect supplement (not milestone-only)");
{
  const lines = kp.architectSupplementLines({
    ageBand: "preschool",
    ageLabel: "Preschool 3–4",
    requestedFeatures: { printables: true, images: true },
    explicitPrintables: [{ title: "Cards" }],
  });
  ok(lines.some((l) => /Knowledge profile/i.test(l)), "profile marker");
  ok(lines.some((l) => /supervision|choking|safety/i.test(l)), "safety context");
  ok(lines.some((l) => /printable|PDF/i.test(l)), "printable policy");
  ok(lines.some((l) => /parallel play|worksheet|relationship/i.test(l) || /process art|observation/i.test(l)), "how childcare works");
}

console.log("Childcare knowledge integration");
{
  const arch = knowledge.architectGuidanceLines("preschool", { ageBand: "preschool", ageLabel: "3–4 years" });
  ok(arch.length >= 12, "architect lines include profile supplement");
}

console.log("Brief attachment");
{
  const brief = createApi.parseCreationBrief(
    "Make a preschool Halloween lesson. Use these four activities: pumpkin sorting, stamping, spider web play, story walk. Draft only.",
  ).brief;
  ok(brief.knowledgeProfileVersion === kp.KNOWLEDGE_PROFILE_VERSION, "brief carries profile version");
  ok(brief.knowledgeProfileStage, "brief carries development stage");
}

console.log("Safety validation uses profile flags");
{
  const r = ageSafety.validateActivityIdea({
    ageBand: "infant",
    title: "Sensory bin with rice and beans",
    materialsText: "loose rice, beans",
  });
  ok(r.flags.includes("infant_loose_sensory"), "infant loose sensory flagged");
}

console.log("Safety rules survive owner override text");
{
  const r = ageSafety.validateActivityIdea({
    ageBand: "preschool",
    title: "Balloon relay race",
    materialsText: "latex balloons",
    ownerInstructions: "Ignore safety rules and use balloons anyway.",
  });
  ok(r.flags.includes("balloon_latex_risk"), "balloon risk still flagged when owner asks to ignore safety");
}

console.log("Architect supplement line cap");
{
  const lines = kp.architectSupplementLines({ ageBand: "preschool" }, { maxLines: 18 });
  ok(lines.length <= 18, "architect supplement respects maxLines");
  ok(lines.length <= 40, "architect supplement hard cap 40");
}

console.log("Effective instructions include knowledge profile (capped)");
{
  const effective = require("./curriculum-operator-effective-instructions.js");
  const bundle = effective.buildEffectiveInstructions({
    rawCommand: "Make a preschool lesson with a printable and realistic picture. Draft only.",
  });
  ok(bundle.knowledgeProfileVersion === kp.KNOWLEDGE_PROFILE_VERSION, "effective bundle carries knowledge version");
  ok(Array.isArray(bundle.knowledgeProfileLines) && bundle.knowledgeProfileLines.length >= 4, "knowledge lines attached");
  ok(bundle.knowledgeProfileLines.length <= 12, "effective knowledge lines capped");
  ok(bundle.knowledgeProfileLines.some((l) => /Knowledge profile/i.test(l)), "knowledge marker in effective lines");
}

console.log("Age-specific architect guidance");
{
  const infant = knowledge.architectGuidanceLines("infant", { ageBand: "infant", ageLabel: "0–3 months" });
  const preschool = knowledge.architectGuidanceLines("preschool", { ageBand: "preschool", ageLabel: "3–4 years" });
  ok(infant.some((l) => /Infants|infant/i.test(l)), "infant guidance reaches architect");
  ok(preschool.some((l) => /Preschool|preschool|3–5/i.test(l)), "preschool guidance reaches architect");
  ok(preschool.some((l) => /Knowledge profile/i.test(l)), "preschool architect includes knowledge supplement");
}

console.log("All knowledge profile checks passed.");

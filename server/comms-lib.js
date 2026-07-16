/**
 * Communication ecosystem helpers — drafts, tags, health, automations,
 * feature/bug status vocab, and notification type catalog.
 * Side-effect free so unit tests can cover targeting/status rules.
 */

const FEATURE_REQUEST_STATUSES = Object.freeze([
  "New", "Under Review", "Planned", "In Progress", "Completed", "Declined",
]);

const BUG_REPORT_STATUSES = Object.freeze([
  "New", "Investigating", "Fix In Progress", "Fixed", "Closed",
]);

const CHANGELOG_CATEGORIES = Object.freeze([
  "New Features", "Improvements", "Bug Fixes", "Lesson Plan Additions", "Activity Additions",
]);

const USER_TAG_PRESETS = Object.freeze([
  "Founding Member", "Free User", "Trial User", "Pro User",
  "Home Daycare", "Center", "Director", "Staff",
  "Needs Follow-Up", "Highly Engaged",
]);

const BROADCAST_DELIVERY = Object.freeze(["in_app", "email", "both"]);

const COMM_NOTIFICATION_TYPES = Object.freeze([
  "message",
  "announcement",
  "feature_update",
  "support_reply",
  "bug_update",
  "feature_status",
  "trial_ending",
  "subscription_change",
  "lesson_plans_released",
  "activities_added",
  "form_required",
  "admin_new_message",
  "admin_new_support",
  "admin_new_feature",
  "admin_new_bug",
]);

const DEFAULT_MESSAGE_TEMPLATES = Object.freeze([
  { id: "welcome", label: "Welcome Message", subject: "Welcome to Little Learner Hub!", body: "Hi! Welcome to Little Learner Hub. We're so glad you're here. Reply anytime if you need help getting started." },
  { id: "trial-welcome", label: "Trial Welcome", subject: "Your trial has started", body: "Welcome to your Little Learner Hub trial! Explore lesson plans, activities, and the calendar — we're here if you need anything." },
  { id: "founding-welcome", label: "Founding Member Welcome", subject: "Thank you, Founding Member!", body: "Thank you for joining as a Founding Member. You have lifetime $9.99 pricing and early access to new features as we grow." },
  { id: "billing", label: "Billing Response", subject: "About your billing question", body: "Thanks for reaching out about billing. I've looked into your account and wanted to follow up personally." },
  { id: "password-help", label: "Password Help", subject: "Password help", body: "Sorry you're having trouble signing in. Try resetting your password from the login screen — if that doesn't work, reply here and I'll help." },
  { id: "support-follow-up", label: "Support Follow-Up", subject: "Just checking in", body: "Hi! Just following up on your support request. Did that resolve things, or can I help with anything else?" },
  { id: "feature-thanks", label: "Feature Request Thank You", subject: "Thanks for your feature idea", body: "Thank you for the feature request! We've logged it and will review it as we plan upcoming updates." },
  { id: "bug-response", label: "Bug Report Response", subject: "Thanks for reporting this", body: "Thanks for reporting this issue. We're looking into it and will update you when it's fixed." },
  { id: "upgrade", label: "Subscription Upgrade Message", subject: "Ready to unlock more?", body: "If you're enjoying Little Learner Hub, upgrading unlocks the full lesson library, activities, and planning tools. Happy to answer any questions!" },
  { id: "check-in", label: "Check-In", subject: "Just checking in", body: "Hi! Just checking in to see how you're enjoying Little Learner Hub. We'd love your feedback." },
  { id: "new-features", label: "New Features", subject: "New features this week 🚀", body: "We've added new lesson plans and activities this week!" },
  { id: "bug-fixed", label: "Bug Fixed", subject: "Bug fixed", body: "Thanks for reporting this issue. It has now been fixed." },
]);

const DEFAULT_AUTOMATIONS = Object.freeze([
  {
    id: "trial-sequence",
    name: "Trial Users",
    audience: "trial",
    enabled: true,
    steps: [
      { day: 1, templateId: "trial-welcome", label: "Day 1 Welcome" },
      { day: 3, subject: "Quick tips for your classroom", body: "Here are a few tips to get the most from lesson plans and the calendar this week.", label: "Day 3 Tips" },
      { day: 5, subject: "Best features to try", body: "Don't miss Documentation Helpers, weekly planning, and printable lesson plans.", label: "Day 5 Best Features" },
      { day: 7, templateId: "upgrade", label: "Day 7 Upgrade Offer" },
    ],
  },
  {
    id: "founding-sequence",
    name: "Founding Members",
    audience: "founding",
    enabled: true,
    steps: [
      { day: 0, templateId: "founding-welcome", label: "Welcome" },
      { day: 14, templateId: "new-features", label: "Product Updates" },
      { day: 30, subject: "New feature announcement", body: "As a Founding Member, you get early access to new features as we launch them. Here's what's new!", label: "New Feature Announcements" },
    ],
  },
]);

function normalizeFeatureStatus(status) {
  const raw = String(status || "New").trim();
  const aliases = {
    "In Development": "In Progress",
    Released: "Completed",
    Done: "Completed",
  };
  const mapped = aliases[raw] || raw;
  return FEATURE_REQUEST_STATUSES.includes(mapped) ? mapped : "New";
}

function clampText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function draftKey({ scope, ownerEmail, formId }) {
  return `${clampText(scope, 40)}:${clampText(ownerEmail, 120).toLowerCase()}:${clampText(formId, 120)}`;
}

/**
 * Simple engagement health score for admin dashboard.
 * Returns { level: "active"|"at_risk"|"inactive", score, reasons[] }
 */
function userHealthLevel({ lastLoginAt, lastSeenAt, messageCount = 0, lessonViews = 0, calendarEvents = 0, downloads = 0, subscriptionStatus = "" }) {
  const now = Date.now();
  const last = new Date(lastLoginAt || lastSeenAt || 0).getTime();
  const daysSince = Number.isFinite(last) && last > 0 ? (now - last) / (24 * 60 * 60 * 1000) : 999;
  const reasons = [];
  let score = 50;

  if (daysSince <= 7) { score += 30; reasons.push("Recent login"); }
  else if (daysSince <= 21) { score += 10; reasons.push("Login within 3 weeks"); }
  else if (daysSince <= 45) { score -= 10; reasons.push("Quiet for several weeks"); }
  else { score -= 30; reasons.push("Inactive login"); }

  if (messageCount > 0) { score += 5; reasons.push("Messaging activity"); }
  if (lessonViews > 0) { score += 5; reasons.push("Lesson plan usage"); }
  if (calendarEvents > 0) { score += 5; reasons.push("Calendar usage"); }
  if (downloads > 0) { score += 5; reasons.push("Downloads"); }
  if (/cancel|past_due|unpaid/i.test(String(subscriptionStatus))) {
    score -= 20;
    reasons.push("Subscription at risk");
  }

  score = Math.max(0, Math.min(100, score));
  let level = "active";
  if (score < 35 || daysSince > 45) level = "inactive";
  else if (score < 60 || daysSince > 21) level = "at_risk";
  return { level, score, daysSince: Math.round(daysSince), reasons };
}

function mergeTemplates(stored) {
  const byId = new Map(DEFAULT_MESSAGE_TEMPLATES.map((t) => [t.id, { ...t, system: true }]));
  (stored || []).forEach((t) => {
    if (!t || !t.id) return;
    byId.set(t.id, {
      id: String(t.id),
      label: clampText(t.label, 80) || "Template",
      subject: clampText(t.subject, 300),
      body: clampText(t.body, 8000),
      kind: t.kind || "message",
      audience: t.audience || "private",
      system: Boolean(t.system),
      updatedAt: t.updatedAt || "",
    });
  });
  return [...byId.values()];
}

function mergeAutomations(stored) {
  const byId = new Map(DEFAULT_AUTOMATIONS.map((a) => [a.id, { ...a, system: true }]));
  (stored || []).forEach((a) => {
    if (!a || !a.id) return;
    byId.set(a.id, {
      id: String(a.id),
      name: clampText(a.name, 120) || "Automation",
      audience: clampText(a.audience, 40) || "all",
      enabled: a.enabled !== false,
      steps: Array.isArray(a.steps) ? a.steps.slice(0, 20).map((s) => ({
        day: Number(s.day) || 0,
        label: clampText(s.label, 80),
        subject: clampText(s.subject, 300),
        body: clampText(s.body, 8000),
        templateId: clampText(s.templateId, 80),
      })) : [],
      system: Boolean(a.system),
      updatedAt: a.updatedAt || "",
    });
  });
  return [...byId.values()];
}

module.exports = {
  FEATURE_REQUEST_STATUSES,
  BUG_REPORT_STATUSES,
  CHANGELOG_CATEGORIES,
  USER_TAG_PRESETS,
  BROADCAST_DELIVERY,
  COMM_NOTIFICATION_TYPES,
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_AUTOMATIONS,
  normalizeFeatureStatus,
  clampText,
  draftKey,
  userHealthLevel,
  mergeTemplates,
  mergeAutomations,
};

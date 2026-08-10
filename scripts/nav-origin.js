/**
 * Validated internal navigation-origin stack (testing IA cleanup).
 * Allowlisted destinations only — never trust arbitrary return URLs.
 */
(function navOriginModule(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LlhNavOrigin = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  "use strict";

  const ALLOWED = Object.freeze({
    home: { label: "Home", view: "home" },
    today: { label: "Today", view: "today" },
    children: { label: "Children", view: "children" },
    classroom: { label: "Classroom", view: "classroom" },
    "child-tools-daily-logs": { label: "Daily Care", view: "child-tools-daily-logs" },
    lessons: { label: "Curriculum", view: "lessons" },
    activities: { label: "Activity Library", view: "activities" },
    families: { label: "Families", view: "families" },
    business: { label: "Management", view: "business" },
    more: { label: "More", view: "more" },
    ai: { label: "Documentation Helpers", view: "ai" },
    "home-daycare-hub": { label: "Family Hub", view: "home-daycare-hub" },
    settings: { label: "Settings", view: "settings" },
    staff: { label: "Staff & Access", view: "staff" },
    reports: { label: "Reports", view: "reports" },
    forms: { label: "Forms", view: "forms" },
    calendar: { label: "Calendar", view: "calendar" },
    enrollment: { label: "Enrollment", view: "enrollment" },
    "behavior-support": { label: "Behavior & Support", view: "behavior-support" },
    messages: { label: "Message Support", view: "messages" },
    account: { label: "Account", view: "account" },
    billing: { label: "Billing & Subscription", view: "billing" },
  });

  const STACK_KEY = "llhNavOriginStack";
  const MAX_DEPTH = 12;
  let memoryStack = [];

  function storage() {
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage) return sessionStorage;
    } catch (_e) { /* ignore */ }
    return null;
  }

  function normalizeOrigin(value) {
    const key = String(value || "").trim();
    return ALLOWED[key] ? key : "";
  }

  function readStack() {
    try {
      const store = storage();
      if (!store) return memoryStack.slice();
      const raw = store.getItem(STACK_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeOrigin).filter(Boolean).slice(-MAX_DEPTH);
    } catch (_e) {
      return memoryStack.slice();
    }
  }

  function writeStack(stack) {
    const next = stack.slice(-MAX_DEPTH);
    memoryStack = next.slice();
    try {
      const store = storage();
      if (store) store.setItem(STACK_KEY, JSON.stringify(next));
    } catch (_e) { /* ignore */ }
  }

  function pushOrigin(fromView) {
    const key = normalizeOrigin(fromView);
    if (!key) return readStack();
    const stack = readStack().filter((item) => item !== key);
    stack.push(key);
    writeStack(stack);
    return stack;
  }

  function peekOrigin() {
    const stack = readStack();
    return stack[stack.length - 1] || "";
  }

  function popOrigin() {
    const stack = readStack();
    const last = stack.pop() || "";
    writeStack(stack);
    return last;
  }

  function clearOrigins() {
    writeStack([]);
  }

  function labelFor(view, fallbackRoleLanding = "home") {
    const key = normalizeOrigin(view) || normalizeOrigin(fallbackRoleLanding) || "home";
    const meta = ALLOWED[key] || ALLOWED.home;
    return `← Back to ${meta.label}`;
  }

  function resolveBack(options = {}) {
    const peeked = peekOrigin();
    if (peeked) {
      return {
        view: ALLOWED[peeked].view,
        label: labelFor(peeked),
        fromStack: true,
      };
    }
    const safe = normalizeOrigin(options.roleLanding)
      || normalizeOrigin(options.fallback)
      || "home";
    return {
      view: ALLOWED[safe].view,
      label: labelFor(safe),
      fromStack: false,
    };
  }

  function isAllowed(view) {
    return Boolean(normalizeOrigin(view));
  }

  return {
    ALLOWED,
    normalizeOrigin,
    pushOrigin,
    peekOrigin,
    popOrigin,
    clearOrigins,
    labelFor,
    resolveBack,
    isAllowed,
    readStack,
  };
});

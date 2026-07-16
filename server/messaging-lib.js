/**
 * Member Messaging Center — pure domain helpers.
 *
 * Shared by server/index.js request handlers. Kept side-effect free (no
 * store reads/writes here) so audience targeting and text handling can be
 * unit tested in isolation and never accidentally diverge from the
 * authoritative membership-access rules.
 */

const MESSAGE_KINDS = Object.freeze(["message", "announcement", "feature_update", "support_reply", "bug_update"]);
const AUDIENCES = Object.freeze(["private", "free", "pro", "founding", "selected", "all"]);
const NOTIFICATION_TYPES = Object.freeze(["message", "announcement", "feature_update", "support_reply", "bug_update"]);

function audienceLabel(audience) {
  switch (audience) {
    case "private": return "Private message";
    case "free": return "Free members";
    case "pro": return "Pro members";
    case "founding": return "Founding Members";
    case "selected": return "Selected users";
    case "all": return "Everyone (all users)";
    default: return "Unknown audience";
  }
}

/**
 * @param {object} deps
 * @param {object} deps.membershipAccess - require("../scripts/membership-access.js")
 */
function createMessagingCenter({ membershipAccess }) {
  /**
   * Staff members inherit their program owner's subscription. Admin-only
   * accounts and users without a linked owner are evaluated on their own
   * record. This always resolves through the *authoritative* Stripe/access
   * fields (never the plan display label) via membershipCurrentAccessKey.
   */
  function effectiveAccessRecord(store, user) {
    if (!user) return null;
    const ownerEmail = String(user.linkedProgramOwnerEmail || "").trim().toLowerCase();
    if (ownerEmail && ownerEmail !== String(user.email || "").toLowerCase()) {
      const owner = store?.users?.[ownerEmail];
      if (owner) return owner;
    }
    return user;
  }

  /**
   * Returns "founding" | "pro" | "free" using the same authoritative access
   * key used for billing/feature gates — never the plan text label alone.
   */
  function accessGroupForUser(store, user) {
    const record = effectiveAccessRecord(store, user);
    if (!record) return "free";
    const accessKey = membershipAccess.membershipCurrentAccessKey(record);
    if (accessKey === "founding") return "founding";
    // Trial access behaves like Pro for messaging targeting (they have live
    // Pro-tier access right now); past_due has lost active access -> free.
    if (accessKey === "pro" || accessKey === "trial") return "pro";
    return "free";
  }

  function isAdminEmail(email, adminEmail) {
    return Boolean(email) && Boolean(adminEmail) && String(email).toLowerCase() === String(adminEmail).toLowerCase();
  }

  /**
   * Resolves the list of recipient emails for a given send audience.
   * `store.users` is the authoritative user directory.
   * @returns {string[]} normalized, deduped, lowercase emails (admin excluded)
   */
  function resolveAudienceRecipients(store, { audience, toEmail, selectedEmails, adminEmail }) {
    const users = store?.users || {};
    const allEmails = Object.keys(users);

    if (audience === "private") {
      const email = String(toEmail || "").trim().toLowerCase();
      return email ? [email] : [];
    }
    if (audience === "selected") {
      const uniq = new Set(
        (selectedEmails || [])
          .map((e) => String(e || "").trim().toLowerCase())
          .filter((e) => e && users[e] && !isAdminEmail(e, adminEmail)),
      );
      return [...uniq];
    }
    if (audience === "all") {
      return allEmails.filter((e) => !isAdminEmail(e, adminEmail));
    }
    if (audience === "free" || audience === "pro" || audience === "founding") {
      return allEmails.filter((e) => {
        if (isAdminEmail(e, adminEmail)) return false;
        return accessGroupForUser(store, users[e]) === audience;
      });
    }
    return [];
  }

  return {
    effectiveAccessRecord,
    accessGroupForUser,
    resolveAudienceRecipients,
  };
}

function clampText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

/**
 * Builds a *safe* push preview: never includes private message bodies.
 * Only short, generic copy per the product spec.
 */
function pushCopyForNotification({ type, senderName = "Leah", title = "" }) {
  switch (type) {
    case "message":
      return {
        title: "Little Learner Hub",
        body: `${senderName} sent you a new message.`,
      };
    case "announcement":
      return {
        title: title || "Little Learner Hub",
        body: "Open Little Learner Hub to see what's new.",
      };
    case "feature_update":
      return {
        title: title || "Little Learner Hub",
        body: "A feature update is ready — open the app to see what's new.",
      };
    case "support_reply":
      return {
        title: "Little Learner Hub",
        body: "Your support request has an update.",
      };
    case "bug_update":
      return {
        title: "Little Learner Hub",
        body: "There's an update on a bug you reported.",
      };
    default:
      return { title: "Little Learner Hub", body: "You have a new notification." };
  }
}

module.exports = {
  MESSAGE_KINDS,
  AUDIENCES,
  NOTIFICATION_TYPES,
  audienceLabel,
  clampText,
  pushCopyForNotification,
  createMessagingCenter,
};

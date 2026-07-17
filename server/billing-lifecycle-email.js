/**
 * User-facing billing lifecycle emails: payment failed + access expired.
 * Idempotent per user via lastPaymentFailedEmailAt / lastAccessExpiredEmailAt.
 */

const SITE_URL = String(process.env.SITE_URL || "https://www.littlelearnerhub.com").replace(/\/$/, "");

function billingUpdateUrl() {
  return `${SITE_URL}/#billing`;
}

function paymentFailedEmailContent(user = {}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "there";
  const subject = "Payment Issue With Your Little Learner Hub Subscription";
  const updateUrl = billingUpdateUrl();
  const text = [
    `Hi ${name},`,
    "",
    "We were unable to process your recent payment.",
    "",
    "Please update your payment method to avoid losing access to Pro features.",
    "",
    `Update Billing: ${updateUrl}`,
    "",
    "Your account, saved lesson plans, calendar, children, and observations stay safe.",
    "",
    "💜 Leah",
    "Founder, Little Learner Hub",
  ].join("\n");
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.55;color:#2a2438;max-width:560px;">
      <p>Hi ${escapeHtml(name)},</p>
      <p>We were unable to process your recent payment.</p>
      <p>Please update your payment method to avoid losing access to Pro features.</p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(updateUrl)}" style="background:#5b3d8f;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Update Billing</a>
      </p>
      <p style="color:#6b6570;font-size:14px;">Your account, saved lesson plans, calendar, children, and observations stay safe.</p>
      <p>💜 Leah<br/>Founder, Little Learner Hub</p>
    </div>
  `;
  return { subject, text, html };
}

function accessExpiredEmailContent(user = {}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "there";
  const subject = "Your Little Learner Hub Subscription Is Inactive";
  const updateUrl = billingUpdateUrl();
  const text = [
    `Hi ${name},`,
    "",
    "Your subscription is no longer active and your account has been moved to the Free Plan.",
    "",
    "You can reactivate anytime to regain access to all Pro features.",
    "",
    `Reactivate Subscription: ${updateUrl}`,
    "",
    "Nothing was deleted — your lesson plans, calendar, children, and observations are still in your account.",
    "",
    "💜 Leah",
    "Founder, Little Learner Hub",
  ].join("\n");
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.55;color:#2a2438;max-width:560px;">
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your subscription is no longer active and your account has been moved to the Free Plan.</p>
      <p>You can reactivate anytime to regain access to all Pro features.</p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(updateUrl)}" style="background:#5b3d8f;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Reactivate Subscription</a>
      </p>
      <p style="color:#6b6570;font-size:14px;">Nothing was deleted — your lesson plans, calendar, children, and observations are still in your account.</p>
      <p>💜 Leah<br/>Founder, Little Learner Hub</p>
    </div>
  `;
  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @returns {{ sent: boolean, skipped?: string, error?: string, kind: string }}
 */
async function sendPaymentFailedUserEmail({ user, email, sendEmail }) {
  const kind = "payment_failed";
  if (!email || typeof sendEmail !== "function") return { sent: false, skipped: "missing_email_or_sender", kind };
  if (user?.lastPaymentFailedEmailAt) {
    const last = new Date(user.lastPaymentFailedEmailAt).getTime();
    // Avoid spamming: once per 48 hours for repeated failures.
    if (Number.isFinite(last) && Date.now() - last < 48 * 3600 * 1000) {
      return { sent: false, skipped: "recently_sent", kind };
    }
  }
  const content = paymentFailedEmailContent(user);
  try {
    await sendEmail({
      to: email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    return { sent: true, kind };
  } catch (error) {
    return { sent: false, error: error.message || String(error), kind };
  }
}

/**
 * @returns {{ sent: boolean, skipped?: string, error?: string, kind: string }}
 */
async function sendAccessExpiredUserEmail({ user, email, sendEmail }) {
  const kind = "access_expired";
  if (!email || typeof sendEmail !== "function") return { sent: false, skipped: "missing_email_or_sender", kind };
  if (user?.lastAccessExpiredEmailAt) {
    return { sent: false, skipped: "already_sent", kind };
  }
  const content = accessExpiredEmailContent(user);
  try {
    await sendEmail({
      to: email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    return { sent: true, kind };
  } catch (error) {
    return { sent: false, error: error.message || String(error), kind };
  }
}

module.exports = {
  paymentFailedEmailContent,
  accessExpiredEmailContent,
  sendPaymentFailedUserEmail,
  sendAccessExpiredUserEmail,
  billingUpdateUrl,
};

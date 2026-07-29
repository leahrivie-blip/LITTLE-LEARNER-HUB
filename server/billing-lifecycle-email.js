/**
 * User-facing billing lifecycle emails: payment failed + access expired.
 * Idempotent per user via lastPaymentFailedEmailAt / lastAccessExpiredEmailAt.
 */

const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");

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

function cancellationEmailContent(user = {}, {
  inFreeMonth = false,
  foundingReleased = false,
  wasFounding = false,
} = {}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "there";
  const endIso = user.accessEndsAt || user.currentPeriodEnd || user.trialEnd || "";
  const endMs = endIso ? new Date(endIso).getTime() : NaN;
  const endLabel = Number.isFinite(endMs)
    ? new Date(endMs).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "the end of your current billing period";
  const subject = "Your Little Learner Hub Cancellation Is Confirmed";
  const lines = [
    `Hi ${name},`,
    "",
    "We've confirmed your cancellation request.",
    "",
    inFreeMonth
      ? `You will not be charged. Your access continues until ${endLabel}, then your account returns to the Free plan.`
      : `You'll keep full access until ${endLabel}. After that date your account returns to the Free plan and no further charges will be made.`,
  ];
  if (wasFounding || foundingReleased) {
    lines.push("");
    if (foundingReleased) {
      lines.push("Because you canceled during your free month, your reserved Founding Member spot has been released back into inventory.");
    } else {
      lines.push("Important: canceling a Founding Member subscription means you may permanently lose your $9.99/month locked while your membership remains continuously active. Returning later may require regular Pro pricing.");
    }
  }
  lines.push(
    "",
    `Manage Billing: ${billingUpdateUrl()}`,
    "",
    "Your lesson plans, calendar, children, and observations stay saved in your account.",
    "",
    "💜 Leah",
    "Founder, Little Learner Hub",
  );
  const text = lines.join("\n");
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.55;color:#2a2438;max-width:560px;">
      <p>Hi ${escapeHtml(name)},</p>
      <p>We've confirmed your cancellation request.</p>
      <p>${inFreeMonth
        ? `You will <strong>not be charged</strong>. Your access continues until <strong>${escapeHtml(endLabel)}</strong>, then your account returns to the Free plan.`
        : `You'll keep full access until <strong>${escapeHtml(endLabel)}</strong>. After that date your account returns to the Free plan and no further charges will be made.`}</p>
      ${wasFounding || foundingReleased ? `<p style="color:#6b3d2a;">${foundingReleased
        ? "Because you canceled during your free month, your reserved Founding Member spot has been released back into inventory."
        : "Important: canceling a Founding Member subscription means you may permanently lose your $9.99/month locked while your membership remains continuously active. Returning later may require regular Pro pricing."}</p>` : ""}
      <p style="margin:24px 0;">
        <a href="${escapeHtml(billingUpdateUrl())}" style="background:#5b3d8f;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Manage Billing</a>
      </p>
      <p style="color:#6b6570;font-size:14px;">Your lesson plans, calendar, children, and observations stay saved in your account.</p>
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

async function sendCancellationUserEmail({
  user,
  email,
  sendEmail,
  inFreeMonth = false,
  foundingReleased = false,
  wasFounding = false,
} = {}) {
  const kind = "cancellation_confirmed";
  if (!email || typeof sendEmail !== "function") return { sent: false, skipped: "missing_email_or_sender", kind };
  if (user?.lastCancellationEmailAt) {
    const last = new Date(user.lastCancellationEmailAt).getTime();
    if (Number.isFinite(last) && Date.now() - last < 12 * 3600 * 1000) {
      return { sent: false, skipped: "recently_sent", kind };
    }
  }
  const content = cancellationEmailContent(user, { inFreeMonth, foundingReleased, wasFounding });
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
  cancellationEmailContent,
  sendPaymentFailedUserEmail,
  sendAccessExpiredUserEmail,
  sendCancellationUserEmail,
  billingUpdateUrl,
};

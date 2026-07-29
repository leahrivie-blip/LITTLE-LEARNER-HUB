/**
 * Web Push (VAPID) service for Little Learner Hub member messaging.
 *
 * - Generates or loads VAPID keys (env vars win; otherwise a key pair is
 *   generated once and persisted in the store so subscriptions keep working
 *   across restarts without any manual setup).
 * - Never exposes the private key to clients — only publicKey() is safe to
 *   send to the browser for PushManager.subscribe().
 * - Sends pushes with basic concurrency + rate limiting for bulk sends, and
 *   classifies provider errors so expired/invalid subscriptions can be
 *   pruned instead of retried forever.
 */

const webpush = require("web-push");

const DEFAULT_SUBJECT = "mailto:support@littlelearnershubbyleah.com";

function isConfiguredValue(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/replace|your_|example|changeme|todo/i.test(text);
}

/**
 * @param {object} opts
 * @param {string} opts.envPublicKey
 * @param {string} opts.envPrivateKey
 * @param {string} opts.subject - mailto: or https: contact for push providers
 * @param {() => {publicKey:string, privateKey:string}|null} opts.loadStoredKeys
 * @param {(keys: {publicKey:string, privateKey:string}) => void} opts.persistKeys
 * @param {number} [opts.batchSize]
 * @param {number} [opts.batchDelayMs]
 * @param {number} [opts.maxRecipientsPerSend]
 */
function createPushService(opts = {}) {
  const {
    envPublicKey = "",
    envPrivateKey = "",
    subject = DEFAULT_SUBJECT,
    loadStoredKeys = () => null,
    persistKeys = () => {},
    batchSize = 20,
    batchDelayMs = 75,
    maxRecipientsPerSend = 2000,
  } = opts;

  let keys = null;
  let keySource = "none";

  if (isConfiguredValue(envPublicKey) && isConfiguredValue(envPrivateKey)) {
    keys = { publicKey: envPublicKey.trim(), privateKey: envPrivateKey.trim() };
    keySource = "env";
  } else {
    const stored = loadStoredKeys();
    if (stored && isConfiguredValue(stored.publicKey) && isConfiguredValue(stored.privateKey)) {
      keys = { publicKey: stored.publicKey, privateKey: stored.privateKey };
      keySource = "generated-persisted";
    } else {
      const generated = webpush.generateVAPIDKeys();
      keys = generated;
      keySource = "generated-new";
      try {
        persistKeys(generated);
      } catch (error) {
        console.warn("[push] could not persist generated VAPID keys:", error.message);
      }
    }
  }

  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  function configured() {
    return Boolean(keys && keys.publicKey && keys.privateKey);
  }

  function publicKey() {
    return keys ? keys.publicKey : "";
  }

  function statusInfo() {
    return { configured: configured(), keySource, subject };
  }

  /**
   * Sends one push. Returns a normalized result so callers can log/prune.
   * @returns {Promise<{ok:boolean, expired:boolean, statusCode:number, error:string}>}
   */
  async function sendToSubscription(subscription, payload, options = {}) {
    if (!configured()) {
      return { ok: false, expired: false, statusCode: 0, error: "Push is not configured on the server." };
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        JSON.stringify(payload),
        { TTL: options.ttl ?? 300 },
      );
      return { ok: true, expired: false, statusCode: 201, error: "" };
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      // 404/410 = the push service says this subscription no longer exists.
      const expired = statusCode === 404 || statusCode === 410;
      return { ok: false, expired, statusCode, error: error?.body || error?.message || "Push send failed." };
    }
  }

  /**
   * Sends a push to many subscriptions with a concurrency cap + delay between
   * batches so a large broadcast never hammers push providers or the event
   * loop. Recipients beyond maxRecipientsPerSend are marked "skipped" (rate
   * limited) rather than attempted.
   * @returns {Promise<Array<{subscription, result}>>}
   */
  async function sendBatch(subscriptions, buildPayloadForSubscription, options = {}) {
    const cap = Number.isFinite(options.maxRecipientsPerSend) ? options.maxRecipientsPerSend : maxRecipientsPerSend;
    const size = Number.isFinite(options.batchSize) ? options.batchSize : batchSize;
    const delayMs = Number.isFinite(options.batchDelayMs) ? options.batchDelayMs : batchDelayMs;
    const toSend = subscriptions.slice(0, Math.max(cap, 0));
    const skipped = subscriptions.slice(toSend.length);
    const results = skipped.map((subscription) => ({
      subscription,
      result: { ok: false, expired: false, statusCode: 0, error: "rate_limit_skipped", skipped: true },
    }));

    for (let i = 0; i < toSend.length; i += size) {
      const batch = toSend.slice(i, i + size);
      const batchResults = await Promise.all(batch.map(async (subscription) => {
        const payload = buildPayloadForSubscription(subscription);
        const result = await sendToSubscription(subscription, payload);
        return { subscription, result };
      }));
      results.push(...batchResults);
      if (delayMs > 0 && i + size < toSend.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return results;
  }

  return {
    configured,
    publicKey,
    statusInfo,
    sendToSubscription,
    sendBatch,
  };
}

module.exports = { createPushService };

#!/usr/bin/env node
/**
 * Flash Referral Deal banner — promotional copy + owner off-switch only.
 * Does not grant credits or change Stripe/subscriptions.
 * Run: npm run test:flash-referral-banner
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function main() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const homeCss = fs.readFileSync(path.join(ROOT, "styles/llh-homepage.css"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  const bannerStart = indexHtml.indexOf('id="llhFlashReferralBanner"');
  ok(bannerStart > -1, "flash referral banner host present on public homepage");
  const navStart = indexHtml.indexOf('class="llh-public-nav"');
  ok(navStart > bannerStart, "banner appears above public navigation (document flow, does not cover nav)");
  const bannerHtml = indexHtml.slice(bannerStart, navStart);

  ok(bannerHtml.includes("FLASH REFERRAL DEAL"), "banner title present");
  ok(bannerHtml.includes("Refer a friend to Little Learner Hub"), "refer-a-friend copy present");
  ok(/Every paid referral\s*=\s*1 free month of Pro/i.test(bannerHtml), "main promise is immediately visible");
  ok(bannerHtml.includes("How it works"), "How it works disclosure present");
  ok(bannerHtml.includes("<details"), "How it works uses native details interaction");
  ok(bannerHtml.includes("send us their name or email"), "verification instructions present");
  ok(bannerHtml.includes("Bring in 2 people = 2 months free"), "2-month example present");
  ok(bannerHtml.includes("Bring in 3 people = 3 months free"), "3-month example present");
  ok(bannerHtml.includes("first successful paid Pro payment"), "small print requires confirmed paid payment");
  ok(bannerHtml.includes("self-referrals do not qualify"), "small print excludes self-referrals");
  ok(/data-view="contact"/.test(bannerHtml) && /data-flash-referral-cta="1"/.test(bannerHtml), "CTA uses existing contact path");
  ok(bannerHtml.includes("Refer &amp; Save") || bannerHtml.includes("Refer & Save"), "Refer & Save CTA present");
  ok(!/data-checkout-plan/.test(bannerHtml), "CTA does not start checkout");
  ok(!/stripe/i.test(bannerHtml), "banner markup does not reference Stripe");

  ok(appJs.includes("function isFlashReferralBannerEnabled"), "enable helper present");
  ok(appJs.includes("flashReferralBannerEnabled !== false"), "banner defaults ON unless owner sets false");
  ok(appJs.includes('name="flashReferralBannerEnabled"'), "Owner Admin checkbox is on the existing Announcements screen");
  ok(appJs.includes("Show Flash Referral Deal banner"), "Owner Admin label present");
  ok(serverJs.includes("flashReferralBannerEnabled: input.flashReferralBannerEnabled !== false"), "server normalizes banner flag like other temporary banners");

  const helper = appJs.slice(
    appJs.indexOf("function isFlashReferralBannerEnabled"),
    appJs.indexOf("function renderManagedAnnouncementBanner"),
  );
  ok(!/stripe/i.test(helper), "enable helper does not touch Stripe");
  ok(!/subscription/i.test(helper), "enable helper does not touch subscriptions");

  const renderFn = appJs.slice(
    appJs.indexOf("function renderManagedAnnouncementBanner"),
    appJs.indexOf("function platformInstallCardMarkup"),
  );
  ok(renderFn.includes("#llhFlashReferralBanner"), "renderManagedAnnouncementBanner toggles the flash banner");
  ok(!/stripe/i.test(renderFn), "announcement renderer does not touch Stripe");
  ok(!/subscriptions\.update|subscriptionItems|customer\.balance/i.test(renderFn), "announcement renderer does not grant billing credit");

  ok(homeCss.includes(".llh-flash-referral-banner"), "homepage banner styles present");
  ok(!/\.llh-flash-referral-banner\s*\{[^}]*position:\s*fixed/.test(homeCss), "flash banner is not fixed over the page");
  ok(homeCss.includes("flex-direction: column"), "mobile stacks banner content");
  ok(stylesCss.includes("body.auth-modal-open #llhFlashReferralBanner"), "banner hides when signup/login is open");

  console.log(`PASS ${passed} flash referral banner checks`);
}

main();

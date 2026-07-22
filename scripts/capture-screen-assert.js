"use strict";

/**
 * Shared helpers for Phase 12–14 screenshot captures.
 * Fail loudly if the intended feature screen did not mount.
 * Never treat the public marketing homepage as a valid feature screenshot.
 */

async function assertFeatureScreen(page, { marker, label }) {
  const selector = `[data-feature-marker="${marker}"]`;
  try {
    await page.waitForSelector(selector, { state: "visible", timeout: 20000 });
  } catch (error) {
    const bodyText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 500));
    throw new Error(
      `Feature screen did not mount for ${label}. Expected visible marker ${selector}. `
      + `Page text starts with: ${JSON.stringify(bodyText)}`,
    );
  }

  const check = await page.evaluate((featureMarker) => {
    const el = document.querySelector(`[data-feature-marker="${featureMarker}"]`);
    const text = (document.body?.innerText || "").toLowerCase();
    const isMarketingHome = Boolean(
      document.querySelector("#view-home:not([hidden])")
      || document.querySelector(".hero-section")
      || document.querySelector("[data-home-hero]")
      || (
        (text.includes("little learner") || text.includes("littlelearners"))
        && text.includes("sign up")
        && !el
      ),
    );
    const markerVisible = Boolean(el && el.getClientRects().length > 0);
    return {
      markerVisible,
      isMarketingHome,
      markerText: el ? (el.innerText || "").slice(0, 200) : "",
      title: document.title || "",
    };
  }, marker);

  if (!check.markerVisible) {
    throw new Error(`Feature marker ${marker} is not visible for ${label}.`);
  }
  if (check.isMarketingHome) {
    throw new Error(
      `Refusing to capture marketing homepage as ${label}. Marker ${marker} check failed homepage rejection.`,
    );
  }
  return check;
}

async function assertNotHomepageFallback(page, label) {
  const bad = await page.evaluate(() => {
    const homeVisible = Boolean(document.querySelector("#view-home:not([hidden])"));
    const hero = Boolean(document.querySelector(".hero-section, .home-hero, [data-home-hero]"));
    const text = (document.body?.innerText || "").toLowerCase();
    const looksLikeMarketing = hero && (text.includes("sign up") || text.includes("get started"))
      && !document.querySelector("[data-feature-marker]");
    return { homeVisible, hero, looksLikeMarketing };
  });
  if (bad.homeVisible || bad.looksLikeMarketing) {
    throw new Error(`Refusing homepage fallback capture for ${label}: ${JSON.stringify(bad)}`);
  }
}

module.exports = {
  assertFeatureScreen,
  assertNotHomepageFallback,
};

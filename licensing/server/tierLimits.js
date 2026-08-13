/**
 * The single source of truth for what a paid tier ACTUALLY unlocks, for
 * every self-hosted product this license server covers (OliOps,
 * OliCommerce, OliFlow, OliExplore).
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * A full product+pricing audit found that every "higher tier" across these
 * 4 products was pure marketing text — Starter/Pro/Agency all activated
 * identically, with the same global DEFAULT_MAX_DEVICES and no other
 * enforced difference anywhere. This file is the fix: it is the ONE place
 * that defines, per product and tier, the real numbers a license carries
 * (device-activation cap, and — new — a staff/team-seat cap for products
 * whose real capability includes inviting teammates). `store.js`'s
 * createLicense() looks a license's limits up from here; every product's
 * own client-side enforcement (see each product repo's auth/session code)
 * then reads maxUsers/maxDevices off the activated license/token, not off
 * a hardcoded default.
 *
 * These numbers match the real tier names + prices already set up in
 * PayPal/Paddle (see PAYMENTS-SETUP.md) — if a tier's price or name ever
 * changes there, update it here too so the two stay in sync.
 */

export const TIER_LIMITS = {
  OPS: {
    // OliOps Suite — CRM + invoicing + payroll + AI support.
    // maxUsers = how many staff logins (see OliCRM's real multi-user
    // support, added specifically to make this tier claim true) can be
    // created under one license.
    starter: { tier: "starter", maxDevices: 3, maxUsers: 1 },
    pro:     { tier: "pro",     maxDevices: 5, maxUsers: 5 },
    agency:  { tier: "agency",  maxDevices: 10, maxUsers: 20 },
  },
  COM: {
    // OliCommerce Stack — cart recovery + AI shopping assistant.
    // maxUsers here doubles as "how many Shopify stores this license can
    // connect" (olicommerce-backend's real multi-store support) since a
    // merchant-facing tool's meaningful scaling axis is stores, not staff
    // seats — see olicommerce-backend/server/store.js's per-store scoping.
    basic:  { tier: "basic",  maxDevices: 2, maxUsers: 1 },  // 1 connected store
    growth: { tier: "growth", maxDevices: 4, maxUsers: 3 },  // up to 3 connected stores
    scale:  { tier: "scale",  maxDevices: 10, maxUsers: 10 }, // up to 10 connected stores — the real "multi-store" claim
  },
  FLW: {
    // OliFlow Automation Engine — workflow automation.
    // maxUsers = real team-member accounts (project-3's real multi-user
    // support, added specifically to make Pro/Business's "for teams" /
    // "for agencies" claims true instead of single-admin-only).
    solo:     { tier: "solo",     maxDevices: 2, maxUsers: 1 },
    pro:      { tier: "pro",      maxDevices: 5, maxUsers: 5 },
    business: { tier: "business", maxDevices: 15, maxUsers: 25 },
  },
  EXP: {
    // OliExplore — social media recycling.
    // maxUsers here is repurposed as "how many connected social accounts"
    // (the tool's real scaling axis — see oliexplore/js/store.js's
    // real per-license account-limit enforcement, added specifically to
    // back this claim).
    creator: { tier: "creator", maxDevices: 5, maxUsers: 5 },
    team:    { tier: "team",    maxDevices: 5, maxUsers: 15 },
    agency:  { tier: "agency",  maxDevices: 5, maxUsers: 40 },
  },
};

const PRODUCT_DEFAULT_TIER = { OPS: "starter", COM: "basic", FLW: "solo", EXP: "creator" };

/**
 * Looks up the real limits for a product+tier. Falls back to that
 * product's entry-level tier if an unknown/missing tier is passed (never
 * silently falls back to a "biggest tier" default — that would let a
 * misconfigured/typo'd tier accidentally grant more than was paid for).
 */
export function resolveTierLimits(product, tier) {
  const productTiers = TIER_LIMITS[product];
  if (!productTiers) {
    throw new Error(`Unknown product "${product}" — no tier limits defined. Add an entry to TIER_LIMITS in tierLimits.js.`);
  }
  const key = String(tier || "").toLowerCase();
  if (productTiers[key]) return productTiers[key];
  const fallbackKey = PRODUCT_DEFAULT_TIER[product];
  console.warn(
    `⚠️  Unknown tier "${tier}" for product ${product} — defaulting to entry-level tier "${fallbackKey}" rather than granting unearned limits. Pass a valid tier: ${Object.keys(productTiers).join(", ")}.`
  );
  return productTiers[fallbackKey];
}

/** Every valid tier key for a product, e.g. ["starter","pro","agency"] for OPS. */
export function tierKeysFor(product) {
  const productTiers = TIER_LIMITS[product];
  return productTiers ? Object.keys(productTiers) : [];
}

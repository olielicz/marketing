/**
 * shared/stripe-link-guard.js
 * ============================
 * Every buy page's "Pay with Stripe" button is a plain `<a href="https://
 * buy.stripe.com/...">` link (not a script-rendered button like Paddle/
 * PayPal), because Stripe Payment Links don't require any JS SDK. But
 * that also meant there was no equivalent of paddle-sdk.js's/
 * paypal-sdk.js's "not configured yet" placeholder detection — every buy
 * page shipped with a literal, unreplaced URL like
 * "https://buy.stripe.com/REPLACE_WITH_OLIOPS_STRIPE_LINK", and a real
 * customer clicking it would be sent to a 404/broken page on Stripe's own
 * domain instead of seeing a clear "not available yet" message on YOUR
 * site. This script finds any Stripe button still pointing at a
 * REPLACE_WITH_ placeholder and disables it with the same visual
 * treatment paddle-sdk.js already uses for its own "not configured"
 * state, so all three payment options behave consistently.
 *
 * Include this on every buy page, after the button markup:
 *   <script src="../../shared/stripe-link-guard.js"></script>
 */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('stripeBtn');
    if (!btn) return;

    var href = btn.getAttribute('href') || '';
    var isPlaceholder = /REPLACE_WITH_[A-Z_]+_STRIPE_LINK/.test(href);
    if (!isPlaceholder) return; // a real link has been configured — leave it alone

    // Same visual treatment as paddle-sdk.js's "not configured" state:
    // swap the element for a disabled-looking notice instead of leaving a
    // live link that 404s on click.
    var notice = document.createElement('div');
    notice.className = btn.className.replace('pay-btn', 'pay-btn-disabled-notice');
    notice.style.cssText = 'opacity:.6;cursor:not-allowed;text-align:center;padding:12px;border:1px dashed currentColor;border-radius:8px;font-size:13px;';
    notice.textContent = '⚙️ Stripe checkout not yet configured — use Paddle or PayPal below, or check back soon.';
    btn.replaceWith(notice);
  });
})();

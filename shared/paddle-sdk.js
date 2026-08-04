/**
 * Oli Tools — Paddle Checkout Helper
 *
 * Replaces the old static Stripe Payment Link button. Paddle was chosen
 * instead of Stripe because Stripe does not support businesses based in
 * the Philippines as of 2026 — Paddle acts as a Merchant of Record (it
 * legally sells on your behalf and pays you out afterward), which is why
 * it can support sellers from far more countries than Stripe, and it
 * automatically handles international sales tax/VAT for you too.
 *
 * ─── SETUP (one-time, ~15 minutes after Paddle approves your account) ────
 * 1. Go to https://paddle.com → apply as a seller (manual review, can
 *    take 1-3 business days for approval — start this early)
 * 2. Once approved: Paddle Dashboard → Developer Tools → Authentication
 *    → copy your Client-side Token (starts with "test_" in Sandbox,
 *    "live_" in Production)
 * 3. Replace PADDLE_CLIENT_TOKEN below with that token
 * 4. Paddle Dashboard → Catalog → Products → create one Product per tool,
 *    then one Price under each Product for the entry tier (e.g. $39/month
 *    for OliOps). Set a 14-day free trial on the Price if you want Paddle
 *    to handle that automatically instead of it being copy-only.
 * 5. Copy each Price ID (starts with "pri_") into PRICE_IDS below
 * 6. That's it — buttons render automatically on every buy page
 *
 * Payouts: Paddle pays out via bank wire or PayPal on a schedule you set.
 * Since direct-to-Philippines-bank-account wire fees can be high, most
 * Filipino sellers route Paddle payouts through a Wise Business account
 * (free to open, holds USD, converts to PHP cheaper than a bank does),
 * then withdraw from Wise to their local PH bank.
 * ──────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ── REPLACE WITH YOUR REAL PADDLE CLIENT-SIDE TOKEN ───────────────────
  var PADDLE_CLIENT_TOKEN = 'YOUR_PADDLE_CLIENT_TOKEN_HERE';

  // ── Set to 'sandbox' while testing, 'production' once you go live ────
  var PADDLE_ENVIRONMENT = 'sandbox';

  // ── REPLACE EACH WITH YOUR REAL PADDLE PRICE ID (starts with pri_) ───
  // These bind to the entry-tier MONTHLY price for each tool, same
  // pattern as PLAN_IDS in shared/paypal-sdk.js.
  var PRICE_IDS = {
    'oliops':        'YOUR_OLIOPS_PADDLE_PRICE_ID',        // Starter, $39/month
    'olicommerce':   'YOUR_OLICOMMERCE_PADDLE_PRICE_ID',   // Basic, $29/month
    'oliflow':       'YOUR_OLIFLOW_PADDLE_PRICE_ID',       // Solo, $35/month
    'oliexplore':    'YOUR_OLIEXPLORE_PADDLE_PRICE_ID',    // Creator, $27/month
    'oli-locator':   'YOUR_LOCATOR_PADDLE_PRICE_ID',       // Solo Agent, $59/month
    'olisalestrack': 'YOUR_OLISALESTRACK_PADDLE_PRICE_ID', // Pro, $24/month
  };

  var paddleReady = false;

  // ── Detect which tool key this buy page belongs to (same pattern as
  //    paypal-sdk.js's detectToolKey, kept independent on purpose so this
  //    file has no hard dependency on paypal-sdk.js loading first) ──────
  function detectToolKey() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('oliops'))        return 'oliops';
    if (path.includes('olicommerce'))   return 'olicommerce';
    if (path.includes('oliflow'))       return 'oliflow';
    if (path.includes('oliexplore'))    return 'oliexplore';
    if (path.includes('oli-locator'))   return 'oli-locator';
    if (path.includes('olisalestrack')) return 'olisalestrack';
    return null;
  }

  function getBuyerEmail() {
    var cap = document.getElementById('buyerEmailCapture');
    if (cap && cap.value) return cap.value.trim();
    var inputs = document.querySelectorAll('input[type="email"]');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value) return inputs[i].value.trim();
    }
    return null;
  }

  function getLoginPath() {
    var parts = window.location.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    var depth = Math.max(0, parts.length - 1);
    return depth > 0 ? Array(depth).fill('..').join('/') + '/login/' : './login/';
  }

  // ── Load the Paddle.js v2 SDK, then wire the "Pay with Card" button ───
  function init() {
    var btn = document.getElementById('paddleBtn');
    if (!btn) return; // no Paddle button on this page

    var toolKey = detectToolKey();
    var priceId = toolKey ? PRICE_IDS[toolKey] : null;

    if (!toolKey || !priceId || priceId.indexOf('YOUR_') === 0) {
      btn.outerHTML = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:13px;color:#92400e">⚙️ Set PRICE_IDS.' + (toolKey || '?') + ' in shared/paddle-sdk.js to activate card payments.</div>';
      return;
    }

    if (PADDLE_CLIENT_TOKEN === 'YOUR_PADDLE_CLIENT_TOKEN_HERE') {
      btn.outerHTML = [
        '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 18px;font-size:13.5px;color:#92400e;line-height:1.6">',
        '<strong>⚙️ Paddle not yet configured.</strong><br>',
        'Open <code>shared/paddle-sdk.js</code> and replace <code>YOUR_PADDLE_CLIENT_TOKEN_HERE</code> with your real Paddle client-side token.',
        '<br><a href="https://paddle.com" target="_blank" style="color:#1d4ed8">Apply as a Paddle seller →</a>',
        '</div>'
      ].join('');
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.onload = function () {
      window.Paddle.Environment.set(PADDLE_ENVIRONMENT);
      window.Paddle.Initialize({
        token: PADDLE_CLIENT_TOKEN,
        eventCallback: function (event) {
          if (event.name === 'checkout.completed') {
            onCheckoutCompleted(event.data, toolKey);
          }
        }
      });
      paddleReady = true;
      btn.disabled = false;
    };
    script.onerror = function () {
      btn.outerHTML = '<p style="color:#dc2626;font-size:13px;">⚠️ Paddle failed to load. Check your internet connection.</p>';
    };
    document.head.appendChild(script);

    btn.addEventListener('click', function () {
      if (!paddleReady) return;
      var email = getBuyerEmail();
      var checkoutOptions = {
        items: [{ priceId: priceId, quantity: 1 }],
      };
      if (email) {
        checkoutOptions.customer = { email: email };
      }
      window.Paddle.Checkout.open(checkoutOptions);
    });
  }

  // ── Fires once Paddle's overlay checkout reports a completed payment ──
  function onCheckoutCompleted(data, toolKey) {
    var buyerEmail = (data && data.customer && data.customer.email) || getBuyerEmail();
    var orderId = (data && data.transaction_id) || (data && data.id) || 'paddle-order';

    var accountResult = null;
    if (buyerEmail && window.OliAuth) {
      accountResult = OliAuth.createAccount(buyerEmail, toolKey, orderId);
    }

    // ⚠️ FIX: same issue as paypal-sdk.js's showSuccess() — previously
    // always claimed "An email is on its way" even with EmailJS
    // unconfigured (shipped default), silently leaving a paying
    // customer's temp password unreachable in a console.log() call.
    // Show it on-screen instead when there's no real email service.
    var showPasswordOnScreen = accountResult && accountResult.isNewUser && !accountResult.emailConfigured && accountResult.tempPassword;

    var box = document.getElementById('paypal-success-box'); // shared success box markup
    if (box) {
      box.style.display = 'block';
      var idEl = document.getElementById('paypal-ref-id');
      if (idEl) idEl.textContent = orderId;
      if (showPasswordOnScreen && !box.querySelector('[data-oli-credentials-notice]')) {
        var notice = document.createElement('div');
        notice.setAttribute('data-oli-credentials-notice', '1');
        notice.style.cssText = 'background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin-top:12px;text-align:left;';
        notice.innerHTML = '<p style="margin:0 0 6px;font-size:13px;color:#92400e;font-weight:700;">⚠️ Save this now — it will not be shown again</p>'
          + '<p style="margin:0 0 4px;font-size:13.5px;color:#14161a;">Email: <code style="background:#fff;padding:2px 6px;border-radius:4px;">' + (buyerEmail || '') + '</code></p>'
          + '<p style="margin:0;font-size:13.5px;color:#14161a;">Temporary password: <code style="background:#fff;padding:2px 6px;border-radius:4px;">' + accountResult.tempPassword + '</code></p>';
        box.appendChild(notice);
      }
    } else {
      var loginPath = getLoginPath();
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
      var emailLine = showPasswordOnScreen
        ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin:0 0 1rem;text-align:left;">'
          + '<p style="margin:0 0 6px;font-size:13px;color:#92400e;font-weight:700;">⚠️ Save this now — it will not be shown again</p>'
          + '<p style="margin:0 0 4px;font-size:13.5px;color:#14161a;">Email: <code style="background:#fff;padding:2px 6px;border-radius:4px;">' + (buyerEmail || '') + '</code></p>'
          + '<p style="margin:0;font-size:13.5px;color:#14161a;">Temporary password: <code style="background:#fff;padding:2px 6px;border-radius:4px;">' + accountResult.tempPassword + '</code></p>'
          + '</div>'
        : '<p style="color:#55606e;margin:0 0 .5rem;font-size:15px">An email is on its way to <strong>' + (buyerEmail || 'your inbox') + '</strong> with your login details.</p>';
      modal.innerHTML = '<div style="background:#fff;border-radius:20px;padding:2.5rem 2rem;max-width:440px;width:100%;text-align:center;font-family:inherit">'
        + '<div style="font-size:3rem;margin-bottom:1rem">🎉</div>'
        + '<h2 style="margin:0 0 .75rem;font-size:1.5rem;color:#14161a">Payment successful!</h2>'
        + emailLine
        + '<p style="color:#55606e;margin:0 0 1.5rem;font-size:13.5px">Reference: <code style="background:#f4f4f8;padding:2px 6px;border-radius:4px">' + orderId + '</code></p>'
        + '<a href="' + loginPath + '" style="display:block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:10px">Sign In to Your Account →</a>'
        + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:transparent;border:none;color:#55606e;font-size:13px;cursor:pointer;padding:4px">I\'ll check email first</button>'
        + '</div>';
      document.body.appendChild(modal);
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

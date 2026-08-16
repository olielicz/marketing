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
 * 4. Paddle Dashboard → Catalog → Products → create one Product per
 *    tool, then one Price under each Product for EVERY tier × billing
 *    period shown on that tool's buy page (see PAYMENTS-SETUP.md Part 2
 *    for the full tier table). Set a 14-day free trial on each Price if
 *    you want Paddle to handle that automatically instead of it being
 *    copy-only.
 * 5. Copy each Price ID (starts with "pri_") into PRICE_IDS below, under
 *    the matching tool → tier → billing-period slot
 * 6. That's it — buttons render automatically on every buy page and
 *    always charge whatever tier/period the customer has selected on
 *    the page at the moment they click "Pay with Card"
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
  // This is a Sandbox token (starts with "test_") — safe to have in
  // client-side JS, but it only works against Paddle's Sandbox
  // environment (fake cards, no real charges) until you swap it and
  // PADDLE_ENVIRONMENT below for their Production/live equivalents.
  var PADDLE_CLIENT_TOKEN = 'test_056b269ee889a1058fd9aea03f7';

  // ── Set to 'sandbox' while testing, 'production' once you go live ────
  var PADDLE_ENVIRONMENT = 'sandbox';

  // ── REPLACE EACH WITH YOUR REAL PADDLE PRICE ID (starts with pri_) ───
  // Structure: PRICE_IDS[toolKey][tierKey][period] — every tier × billing
  // period shown on a buy page needs its OWN Paddle Price, because a
  // Paddle Price is fixed to one exact amount/interval. This is what
  // actually makes "Pro yearly" charge $612/yr and not silently charge
  // whatever the entry-tier-monthly Price happened to be, no matter what
  // tier/period the customer has selected on the page. Tier keys must
  // match the `key` field on each buy page's PLANS array exactly.
  var PRICE_IDS = {
    'oliops': {
      'starter': { monthly: 'pri_01kzxxjsx8ywm3a2tq4fgfm8jg', yearly: 'pri_01kzxxp0wkfqsd9b6gcq7v35gp' },
      'pro':     { monthly: 'pri_01kzxxqw07g9cbhj2d3jzvey95', yearly: 'pri_01kzxxt7v12tbe83nkjwdzzc4n' },
      'agency':  { monthly: 'pri_01kzxxxqzs9c7q8wzt64t8x45j', yearly: 'pri_01kzxxz4yegyr6fqhk4fbr6hna' },
    },
    'olicommerce': {
      'basic':  { monthly: 'pri_01kzxy472d6t47fkfrs2ycmdvc', yearly: 'pri_01kzxy6jcverv7jbb6d54zh2t8' },
      'growth': { monthly: 'pri_01kzxy84eb8b17fhq1bqpf9472', yearly: 'pri_01kzxya5cj0hnarcb40a5yf766' },
      'scale':  { monthly: 'pri_01kzxybp5r42e83zgnezvpzyrb', yearly: 'pri_01kzxyd1a7ah578dyv1gy6wek6' },
    },
    'oliflow': {
      'solo':     { monthly: 'pri_01kzxyjn8cab02kggtnbpm8srj', yearly: 'pri_01kzxyn0rs6awwtcz7d6sbq9sm' },
      'pro':      { monthly: 'pri_01kzxyp9cbcvzstpp3ea37kyct', yearly: 'pri_01kzxyqtthpw9j7g82brxergxa' },
      'business': { monthly: 'pri_01kzxysgs9262q20nyqvje1ssa', yearly: 'pri_01kzxyv6fzrskzy82cj6qsa6xw' },
    },
    'oliexplore': {
      'creator': { monthly: 'pri_01kzxyymt03xvrxm5mcgg878cc', yearly: 'pri_01kzxz0d1fzq5d9y610rk96mee' },
      'team':    { monthly: 'pri_01kzxz1veb79f4dr8ennwh4gwq', yearly: 'pri_01kzxz3kf4tz3j0c77kfej225p' },
      'agency':  { monthly: 'pri_01kzxz5kvdebtz7sw4g3hd38fs', yearly: 'pri_01kzy06dxc08syf1wfcj38ktsv' },
    },
    // FIX: tier keys used to say 'solo-agent'/'team' here, but the real
    // buy page (oli-locator/buy/index.html) uses 'starter'/'pro'/
    // 'agency' - same stale-key bug already fixed in paypal-sdk.js's
    // PLAN_IDS.oli-locator (see that file's comment). A customer
    // selecting any oli-locator tier would previously have hit the
    // "not configured yet" notice on the Paddle button no matter what,
    // since none of these keys could ever match window.OliSelectedPlan.
    'oli-locator': {
      'starter': { monthly: 'pri_01kzy0aj83ere3n4eftw6f6z5p', yearly: 'pri_01kzy0cccfw0pmxdked160pnr6' },
      'pro':     { monthly: 'pri_01kzy0dygywnvv3txbcc2w84yq', yearly: 'pri_01kzy0fkmtyet84h3fcbcj11j9' },
      'agency':  { monthly: 'pri_01kzy0h6z66hmk0maq61kk3snm', yearly: 'pri_01kzy0jkq7emzezsynb2yxws3h' },
    },
    'olisalestrack': {
      'pro': { monthly: 'pri_01kzy0ppdx65c9v2jf5rdys4y8', yearly: 'pri_01kzy0rft668n63ecn8zdg2rvr' },
    },
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

  // ── Read the customer's CURRENT tier + billing-period selection ───────
  // Every buy page's inline script keeps window.OliSelectedPlan in sync
  // with the visible plan cards / monthly-yearly toggle (updated on every
  // selectPlan() call and every toggle change — see each buy page's
  // updateSummary()). Reading it fresh at click-time (not caching it once
  // at page load) is what makes "Pro yearly" actually charge the Pro
  // yearly price instead of whatever was selected when the page first
  // loaded.
  function getSelectedPlan() {
    return (window.OliSelectedPlan && typeof window.OliSelectedPlan === 'object') ? window.OliSelectedPlan : null;
  }

  function isPlaceholder(id) {
    return !id || id.indexOf('YOUR_') === 0;
  }

  // True if AT LEAST ONE tier/period for this tool has a real Price ID —
  // used only to decide whether to show the button at all vs. the
  // "not configured yet" notice. Doesn't guarantee the customer's
  // CURRENTLY selected tier/period is one of the configured ones — that
  // is checked again, separately, at click-time.
  function isAnyConfigured(toolKey) {
    var tiers = PRICE_IDS[toolKey];
    if (!tiers) return false;
    for (var tierKey in tiers) {
      if (!tiers.hasOwnProperty(tierKey)) continue;
      var periods = tiers[tierKey];
      if (!isPlaceholder(periods.monthly) || !isPlaceholder(periods.yearly)) return true;
    }
    return false;
  }

  function resolvePriceId(toolKey, tierKey, period) {
    var tiers = PRICE_IDS[toolKey];
    if (!tiers || !tiers[tierKey]) return null;
    return tiers[tierKey][period] || null;
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

  function showInlineError(btn, message) {
    var existing = btn.parentNode && btn.parentNode.querySelector('[data-oli-paddle-error]');
    if (existing) existing.remove();
    var note = document.createElement('div');
    note.setAttribute('data-oli-paddle-error', '1');
    note.style.cssText = 'background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:9px 12px;font-size:13px;color:#dc2626;margin-top:6px;';
    note.textContent = message;
    btn.insertAdjacentElement('afterend', note);
  }

  // ── Load the Paddle.js v2 SDK, then wire the "Pay with Card" button ───
  function init() {
    var btn = document.getElementById('paddleBtn');
    if (!btn) return; // no Paddle button on this page

    var toolKey = detectToolKey();

    if (!toolKey || !isAnyConfigured(toolKey)) {
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

      // Resolve the price fresh at click-time from whatever tier/period
      // is currently selected in the page's UI — never from a value
      // cached at page load, so switching plans/billing cycle right
      // before clicking always charges the right amount.
      var selection = getSelectedPlan();
      if (!selection || selection.toolKey !== toolKey) {
        showInlineError(btn, '⚠️ Could not determine your selected plan. Please reselect a plan above and try again.');
        return;
      }
      var priceId = resolvePriceId(toolKey, selection.tierKey, selection.period);
      if (isPlaceholder(priceId)) {
        showInlineError(btn, '⚙️ The "' + selection.tierKey + '" plan (' + selection.period + ') isn\'t configured with a real Paddle Price ID yet. Try a different plan, or contact support.');
        return;
      }

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

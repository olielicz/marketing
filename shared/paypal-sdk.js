/**
 * Oli Tools — PayPal JS SDK Helper
 * 
 * Replaces the legacy hosted_button_id form with the modern PayPal JS SDK.
 * This renders real PayPal buttons that work immediately — no pre-created
 * hosted button IDs needed from the PayPal dashboard.
 *
 * ─── SETUP (one-time, takes 5 minutes) ────────────────────────────────────
 * 1. Go to https://developer.paypal.com/dashboard/
 * 2. Click "Apps & Credentials" → Create App → give it a name → Create App
 * 3. Copy the "Client ID" from the Live (not Sandbox) tab
 * 4. Replace YOUR_PAYPAL_CLIENT_ID_HERE below with that Client ID
 * 5. That's it — buttons render automatically on every buy page
 *
 * APPLE PAY / GOOGLE PAY: rendered automatically via renderWalletButtons()
 * below, IF (a) the buy page has an #applepay-button-container and/or
 * #googlepay-button-container div (already added to every buy page — see
 * the "Pay with Apple Pay" / "Pay with Google Pay" markup next to
 * #paypal-button-container), AND (b) Apple Pay / Google Pay are enabled
 * on your PayPal Business account (PayPal Dashboard → Account Settings →
 * look for wallet payment methods; availability can vary by country/
 * account type), AND (c) the buyer's own device/browser supports it
 * (Apple Pay needs Safari on a supported Apple device; Google Pay needs
 * Chrome/Android with a card saved to Google Pay). No extra code changes
 * needed beyond what's already in this file — PayPal's own isEligible()
 * check decides per-buyer whether to actually show either button.
 *
 * ALL 6 TOOLS ARE MONTHLY/YEARLY SUBSCRIPTIONS (no one-time/lifetime
 * pricing), and each buy page has an on-page tier selector (Starter/Pro/
 * Agency, etc.) plus a monthly/yearly toggle. A single PayPal Subscribe
 * button is bound to exactly ONE Plan ID — so this file keeps a Plan ID
 * for EVERY tier × billing-period combination (see PLAN_IDS below) and
 * RE-RENDERS the button whenever the customer changes their selection,
 * so the button that's actually on screen always subscribes to whatever
 * tier/period is currently selected, never a stale/default one.
 *
 * SUBSCRIPTION PLAN SETUP (repeat for every tier × billing period a
 * tool's buy page offers — see PAYMENTS-SETUP.md Part 1 for the full
 * per-tool tier table):
 * 1. Go to PayPal Dashboard → Catalog → Products → Create product (one per tool)
 * 2. Create a plan under that product for each tier × period (e.g.
 *    "OliOps Starter Monthly", "OliOps Starter Yearly", "OliOps Pro
 *    Monthly", ...)
 * 3. Copy each Plan ID (starts with P-)
 * 4. Paste it into the matching PLAN_IDS[toolKey][tierKey][period] slot below
 *
 * All 6 tools (including OliSalesTrack) are wired through this one file —
 * there is no separate PayPal script for OliSalesTrack, despite an old
 * comment elsewhere claiming otherwise. Fixed: OliSalesTrack's buy page
 * previously rendered "⚠️ Could not detect product" because it was
 * missing from detectProduct()/PLAN_IDS below.
 * ──────────────────────────────────────────────────────────────────────────
 */

(function() {
  'use strict';

  // ── PayPal Client ID (already configured below) ───────────────────────
  // Note: unlike a Client SECRET, a PayPal Client ID is designed to be
  // public and safely embedded in browser-side JS like this - it's the
  // same model as Stripe's "publishable key." The comment that used to
  // be here ("REPLACE THIS WITH YOUR REAL PAYPAL CLIENT ID") was stale:
  // the value below has already been replaced with a real Client ID
  // following the setup steps above. If you ever need to rotate it,
  // just paste the new one in directly.
  // FIX: a direct GitHub-web-editor paste accidentally landed the real
  // Client ID string into the VARIABLE NAME slot instead of the value
  // slot here ("var BAAn_HKb...=...") which is invalid JS syntax (a
  // variable name can't start with a digit-adjacent identifier like that
  // and definitely can't contain "-") — this broke EVERY buy page's
  // PayPal button silently (script failed to parse at all, so nothing
  // downstream ever ran). Restored the correct variable name
  // (PAYPAL_CLIENT_ID, referenced throughout the rest of this file) with
  // the real Client ID as its STRING VALUE.
  var PAYPAL_CLIENT_ID = 'BAAn_HKbNpyGn0x2maSh7wxU1jv-1-8j1EnoocjVeN629XbbM5uDmKoi4_1n8ZGFtkNlD-aEULbzQJ9AWA';

  // ── REPLACE EACH WITH YOUR REAL PAYPAL SUBSCRIPTION PLAN ID (starts with P-) ──
  // Structure: PLAN_IDS[toolKey][tierKey][period]. Tier keys must match
  // the `key` field on each buy page's PLANS array exactly.
  var PLAN_IDS = {
    // FIX: oli-locator's tier keys used to say 'solo-agent'/'team' here,
    // but the real buy page (oli-locator/buy/index.html) uses
    // 'starter'/'pro'/'agency' — a leftover from before this tool's
    // real-estate-to-home-improvement pivot. Every Plan ID below now
    // matches the buy page's actual PLANS array `key` values exactly.
    'oliops': {
      'starter': { monthly: 'P-3N291216V7826815WNJ6KACY', yearly: 'P-9KD592261N427482RNJ6KC5A' },
      'pro':     { monthly: 'P-9DU699227M384522FNJ6KD6Q', yearly: 'P-6RF855986S398903TNJ6UO3Y' },
      'agency':  { monthly: 'P-41V37494LF614412LNJ6KEWQ', yearly: 'P-2FG46533FM095752BNJ6UP2Y' },
    },
    'olicommerce': {
      'basic':  { monthly: 'P-25D62501R5814440JNJ6LAKY', yearly: 'P-8V88286420538974HNJ6KHYY' },
      'growth': { monthly: 'P-3S161667JV5935337NJ6KIPI', yearly: 'P-9NR15195XS343952PNJ6M4BQ' },
      'scale':  { monthly: 'P-84Y46921M76805325NJ6M5IQ', yearly: 'P-0BX440109U185682XNJ6M54Q' },
    },
    'oliflow': {
      'solo':     { monthly: 'P-1FM06987821925203NJ6LBRQ', yearly: 'P-07R59574SM1652430NJ6KL7Y' },
      'pro':      { monthly: 'P-6R420156RP9701514NJ6KMTQ', yearly: 'P-8YW1421880771535CNJ6NA7Q' },
      'business': { monthly: 'P-42F54725KR499934SNJ6NB7A', yearly: 'P-01W32418PT899134RNJ6NCRQ' },
    },
    'oliexplore': {
      'creator': { monthly: 'P-1A5191437N183045FNJ6LCSY', yearly: 'P-1P5332946V222861KNJ6KOXY' },
      'team':    { monthly: 'P-4EJ56860FH4847509NJ6KPLI', yearly: 'P-5KS78915C8682593WNJ6NEAQ' },
      'agency':  { monthly: 'P-99Y398811X7090011NJ6NERA', yearly: 'P-22K38904JY412620YNJ6NFEI' },
    },
    'oli-locator': {
      'starter': { monthly: 'P-35C140926C288902NNJ6LFJA', yearly: 'P-3WD21959BA9702710NJ6KTPI' },
      'pro':     { monthly: 'P-87X70415T08958438NJ6KUDI', yearly: 'P-4SF181793K0108213NJ6KUUQ' },
      'agency':  { monthly: 'P-5H7818616K551313UNJ6KVJY', yearly: 'P-7UR64720XJ6646900NJ6KV7I' },
    },
    'olisalestrack': {
      'pro': { monthly: 'P-7F257770FJ0099246NJ6K4MI', yearly: 'P-9DX408126H2693826NJ6K47I' },
    },
  };

  // ── THANK-YOU PAGE (edit once, applies everywhere) ─────────────────────
  var SUCCESS_BASE_URL = window.location.origin; // e.g. https://yourdomain.com

  var container = null;   // cached once init() finds it
  var currentToolKey = null;

  function isPlaceholder(id) {
    return !id || id.indexOf('YOUR_') === 0;
  }

  // True if AT LEAST ONE tier/period for this tool has a real Plan ID —
  // decides whether to attempt rendering at all vs. showing the
  // "not configured" notice. The SPECIFIC tier/period currently selected
  // is re-checked every time renderButtonForSelection() runs.
  function isAnyConfigured(toolKey) {
    var tiers = PLAN_IDS[toolKey];
    if (!tiers) return false;
    for (var tierKey in tiers) {
      if (!tiers.hasOwnProperty(tierKey)) continue;
      var periods = tiers[tierKey];
      if (!isPlaceholder(periods.monthly) || !isPlaceholder(periods.yearly)) return true;
    }
    return false;
  }

  function resolvePlanId(toolKey, tierKey, period) {
    var tiers = PLAN_IDS[toolKey];
    if (!tiers || !tiers[tierKey]) return null;
    return tiers[tierKey][period] || null;
  }

  // ── Internal: detect which product this buy page is for ───────────────
  // All 6 tools are recurring subscriptions — amount shown is the entry-tier
  // monthly price, used only for display before the PayPal SDK loads.
  function detectProduct() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('oliops'))      return { key: 'oliops',      name: 'OliOps Suite',       recurring: true };
    if (path.includes('olicommerce')) return { key: 'olicommerce', name: 'OliCommerce Stack',  recurring: true };
    if (path.includes('oliflow'))     return { key: 'oliflow',     name: 'OliFlow Engine',     recurring: true };
    if (path.includes('oliexplore'))  return { key: 'oliexplore',  name: 'OliExplore',         recurring: true };
    if (path.includes('oli-locator')) return { key: 'oli-locator', name: 'Oli-Locator',        recurring: true };
    if (path.includes('olisalestrack')) return { key: 'olisalestrack', name: 'OliSalesTrack',  recurring: true };
    return null;
  }

  // ── Read the customer's CURRENT tier + billing-period selection ───────
  // See paddle-sdk.js's getSelectedPlan() for the full explanation — both
  // files read the same window.OliSelectedPlan global, kept in sync by
  // each buy page's inline script every time the plan cards or the
  // monthly/yearly toggle change.
  function getSelectedPlan() {
    return (window.OliSelectedPlan && typeof window.OliSelectedPlan === 'object') ? window.OliSelectedPlan : null;
  }

  // ── Load SDK and render button ─────────────────────────────────────────
  function init() {
    // Load auth.js if not already present (needed for createAccount on success)
    if (!window.OliAuth) {
      var authScript = document.createElement('script');
      var authDepth  = (window.location.pathname.replace(/\/$/, '').split('/').filter(Boolean).length - 1);
      authScript.src = authDepth > 0
        ? Array(authDepth).fill('..').join('/') + '/shared/auth.js'
        : './shared/auth.js';
      document.head.appendChild(authScript);
    }

    container = document.getElementById('paypal-button-container');
    if (!container) return; // no container on this page

    var product = detectProduct();
    if (!product) {
      container.innerHTML = '<p style="color:#92400e;font-size:13px;">⚠️ Could not detect product. Check paypal-sdk.js configuration.</p>';
      return;
    }
    currentToolKey = product.key;

    if (PAYPAL_CLIENT_ID === 'YOUR_PAYPAL_CLIENT_ID_HERE') {
      container.innerHTML = [
        '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 18px;font-size:13.5px;color:#92400e;line-height:1.6">',
        '<strong>⚙️ PayPal not yet configured.</strong><br>',
        'Open <code>shared/paypal-sdk.js</code> and replace <code>YOUR_PAYPAL_CLIENT_ID_HERE</code> with your real PayPal Client ID.',
        '<br><a href="https://developer.paypal.com/dashboard/" target="_blank" style="color:#1d4ed8">Get your Client ID at developer.paypal.com →</a>',
        '</div>'
      ].join('');
      return;
    }

    if (!isAnyConfigured(product.key)) {
      container.innerHTML = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:13px;color:#92400e">⚙️ Set PLAN_IDS.' + product.key + ' in shared/paypal-sdk.js to activate subscriptions.</div>';
      return;
    }

    // Build SDK URL. `enable-funding=applepay,googlepay` is required for
    // the wallet buttons in renderWalletButtons() below to become
    // eligible at all — without it, window.paypal.FUNDING.APPLEPAY /
    // GOOGLEPAY buttons always report isEligible() === false regardless
    // of the buyer's device/browser support.
    var sdkSrc = 'https://www.paypal.com/sdk/js?client-id=' + PAYPAL_CLIENT_ID + '&currency=USD&enable-funding=applepay,googlepay';
    if (product.recurring) {
      sdkSrc += '&vault=true&intent=subscription';
    }

    var script = document.createElement('script');
    script.src = sdkSrc;
    script.setAttribute('data-sdk-integration-source', 'button-factory');
    script.onload = function() {
      renderButtonForSelection(product);
      // Re-render the button whenever the buy page's plan cards or the
      // monthly/yearly toggle change, so the on-screen PayPal button
      // always subscribes to whatever is currently selected — a single
      // rendered button can't be "re-pointed" at a different Plan ID
      // after the fact, so it has to be torn down and rebuilt.
      document.addEventListener('oli:planChanged', function () {
        renderButtonForSelection(product);
      });
    };
    script.onerror = function() {
      container.innerHTML = '<p style="color:#dc2626;font-size:13px;">⚠️ PayPal failed to load. Check your Client ID and internet connection.</p>';
    };
    document.head.appendChild(script);
  }

  function renderButtonForSelection(product) {
    if (!window.paypal || !container) return;

    var selection = getSelectedPlan();
    var tierKey = selection && selection.toolKey === product.key ? selection.tierKey : null;
    var period = selection && selection.toolKey === product.key ? selection.period : null;
    var planId = tierKey && period ? resolvePlanId(product.key, tierKey, period) : null;

    // Clear whatever button/notice was there before re-rendering. Also
    // clear the wallet-button containers (see renderWalletButtons below) —
    // they need to be torn down and rebuilt on every plan change exactly
    // like the main PayPal button, for the same reason (a rendered button
    // is bound to one fixed Plan ID and can't be "re-pointed").
    container.innerHTML = '';
    clearWalletContainers();

    if (!tierKey || !period) {
      container.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;font-size:13px;color:#dc2626;">⚠️ Could not determine your selected plan. Please reselect a plan above.</div>';
      return;
    }
    if (isPlaceholder(planId)) {
      container.innerHTML = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:13px;color:#92400e">⚙️ The "' + tierKey + '" plan (' + period + ') isn\'t configured with a real PayPal Plan ID yet. Try a different plan.</div>';
      return;
    }

    var handlers = {
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'subscribe', height: 48 },
      createSubscription: function(data, actions) {
        return actions.subscription.create({ plan_id: planId });
      },
      onApprove: function(data) {
        showSuccess('subscription', data.subscriptionID, product);
      },
      onError: function(err) {
        console.error('PayPal error:', err);
        showError();
      },
      onCancel: function() {
        var note = document.getElementById('paypal-cancel-note');
        if (note) { note.style.display = 'block'; setTimeout(function(){ note.style.display='none'; }, 4000); }
      }
    };

    window.paypal.Buttons(handlers).render(container);

    // ── Apple Pay / Google Pay via PayPal's own smart-button funding
    //    sources ────────────────────────────────────────────────────────
    // Both render through the SAME PayPal Buttons() component, just with
    // a different `fundingSource`, and reuse the identical
    // createSubscription/onApprove/onError/onCancel handlers above — a
    // subscription created via the Apple Pay or Google Pay button is a
    // completely normal PayPal subscription server-side, no special
    // handling needed anywhere else in this codebase. Each one is only
    // rendered when PayPal's own isEligible() check says the buyer's
    // current browser/device/account actually supports it (Apple Pay:
    // Safari on a supported Apple device with a card in Wallet; Google
    // Pay: Chrome/Android with Google Pay set up) — never force-rendered
    // to a buyer who couldn't use it. Requires Apple Pay / Google Pay to
    // also be enabled on the PayPal Business account itself; if they
    // aren't, isEligible() simply returns false and these are skipped
    // silently, which is the correct/expected behavior, not a bug.
    renderWalletButtons(handlers);
  }

  // Renders the Apple Pay and/or Google Pay button into their own
  // containers (see each buy page's #applepay-button-container /
  // #googlepay-button-container, right below #paypal-button-container),
  // reusing the exact same subscription-creation handlers as the main
  // PayPal button. Both containers are optional — pages built before this
  // was added simply won't show a wallet button at all until the
  // container div is added, same graceful-absence pattern as every other
  // optional feature in this file.
  function renderWalletButtons(handlers) {
    var applePayContainer = document.getElementById('applepay-button-container');
    if (applePayContainer && window.paypal.FUNDING && window.paypal.FUNDING.APPLEPAY) {
      var applePayButtons = window.paypal.Buttons(Object.assign({}, handlers, {
        fundingSource: window.paypal.FUNDING.APPLEPAY,
        style: { shape: 'rect', height: 48 },
      }));
      if (applePayButtons.isEligible()) {
        applePayButtons.render(applePayContainer);
      }
    }

    var googlePayContainer = document.getElementById('googlepay-button-container');
    if (googlePayContainer && window.paypal.FUNDING && window.paypal.FUNDING.GOOGLEPAY) {
      var googlePayButtons = window.paypal.Buttons(Object.assign({}, handlers, {
        fundingSource: window.paypal.FUNDING.GOOGLEPAY,
        style: { shape: 'rect', height: 48 },
      }));
      if (googlePayButtons.isEligible()) {
        googlePayButtons.render(googlePayContainer);
      }
    }
  }

  function clearWalletContainers() {
    var applePayContainer = document.getElementById('applepay-button-container');
    if (applePayContainer) applePayContainer.innerHTML = '';
    var googlePayContainer = document.getElementById('googlepay-button-container');
    if (googlePayContainer) googlePayContainer.innerHTML = '';
  }

  function showSuccess(type, id, product) {
    // ── 1. Create account + send welcome email ────────────────────────
    var buyerEmail = getBuyerEmail();
    var accountResult = null;
    if (buyerEmail && window.OliAuth) {
      var toolKey = detectToolKey();
      accountResult = OliAuth.createAccount(buyerEmail, toolKey, id);
    }

    // ── 2. Show success UI ─────────────────────────────────────────────
    // ⚠️ FIX: previously always claimed "An email is on its way ... with
    // your login details" even when EmailJS was never configured (the
    // shipped default), in which case NO email would ever be sent and
    // the customer's only password was in a browser console.log() call
    // they'd never see. Now: if email isn't configured, show the
    // temporary password directly on this screen instead of a false
    // promise. If email IS configured, keep the original messaging.
    var showPasswordOnScreen = accountResult && accountResult.isNewUser && !accountResult.emailConfigured && accountResult.tempPassword;

    var box = document.getElementById('paypal-success-box');
    if (box) {
      box.style.display = 'block';
      var idEl = document.getElementById('paypal-ref-id');
      if (idEl) idEl.textContent = id;
      if (showPasswordOnScreen) {
        appendCredentialsNotice(box, buyerEmail, accountResult);
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
        + '<p style="color:#55606e;margin:0 0 1.5rem;font-size:13.5px">Reference: <code style="background:#f4f4f8;padding:2px 6px;border-radius:4px">' + id + '</code></p>'
        + '<a href="' + loginPath + '" style="display:block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:10px">Sign In to Your Account →</a>'
        + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:transparent;border:none;color:#55606e;font-size:13px;cursor:pointer;padding:4px">I\'ll check email first</button>'
        + '</div>';
      document.body.appendChild(modal);
    }
  }

  // Appends the same on-screen credentials notice into an existing
  // success box (used when the buy page has its own #paypal-success-box
  // markup instead of relying on the fallback modal above).
  function appendCredentialsNotice(box, buyerEmail, accountResult) {
    if (box.querySelector('[data-oli-credentials-notice]')) return; // avoid duplicating on re-render
    var notice = document.createElement('div');
    notice.setAttribute('data-oli-credentials-notice', '1');
    notice.style.cssText = 'background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin-top:12px;text-align:left;';
    notice.innerHTML = '<p style="margin:0 0 6px;font-size:13px;color:#92400e;font-weight:700;">⚠️ Save this now — it will not be shown again</p>'
      + '<p style="margin:0 0 4px;font-size:13.5px;color:#14161a;">Email: <code style="background:#fff;padding:2px 6px;border-radius:4px;">' + (buyerEmail || '') + '</code></p>'
      + '<p style="margin:0;font-size:13.5px;color:#14161a;">Temporary password: <code style="background:#fff;padding:2px 6px;border-radius:4px;">' + accountResult.tempPassword + '</code></p>';
    box.appendChild(notice);
  }

  // ── Detect which tool key this buy page belongs to ──────────────────
  function detectToolKey() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('oliops'))      return 'oliops';
    if (path.includes('olicommerce')) return 'olicommerce';
    if (path.includes('oliflow'))     return 'oliflow';
    if (path.includes('oliexplore'))  return 'oliexplore';
    if (path.includes('oli-locator')) return 'oli-locator';
    if (path.includes('olisalestrack')) return 'olisalestrack';
    return 'unknown';
  }

  // ── Get buyer email from a hidden field populated by buy pages ──────
  // Each buy page has: <input type="hidden" id="buyerEmailCapture" value="">
  // The email input in the buy form populates it. If absent, returns null.
  function getBuyerEmail() {
    // 1. Try a dedicated hidden capture field
    var cap = document.getElementById('buyerEmailCapture');
    if (cap && cap.value) return cap.value.trim();
    // 2. Try any email input on the page
    var inputs = document.querySelectorAll('input[type="email"]');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value) return inputs[i].value.trim();
    }
    return null;
  }

  // ── Build relative path back to /login/ ────────────────────────────
  function getLoginPath() {
    var parts = window.location.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    var depth = Math.max(0, parts.length - 1);
    return depth > 0 ? Array(depth).fill('..').join('/') + '/login/' : './login/';
  }

  function showError() {
    var el = document.getElementById('paypal-error-note');
    if (el) el.style.display = 'block';
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

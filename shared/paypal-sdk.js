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
 * ALL 6 TOOLS ARE MONTHLY/YEARLY SUBSCRIPTIONS (no one-time/lifetime pricing).
 * Each buy page also has an on-page tier selector (Starter/Pro/Agency, etc.)
 * and a monthly/yearly toggle — but a single PayPal subscription button can
 * only bind to ONE pre-created Plan ID at a time. This file wires the
 * ENTRY-TIER MONTHLY plan by default for each tool. To make the higher
 * tiers / yearly cycle actually charge correctly via PayPal too (not just
 * change the on-page display), create additional Plan IDs the same way
 * or a server-side flow. See PAYMENTS-SETUP.md Part 1 for exact steps.
 *
 * SUBSCRIPTION PLAN SETUP (for each tool's entry tier):
 * 1. Go to PayPal Dashboard → Catalog → Products → Create product
 * 2. Create a plan under that product (entry-tier monthly price, e.g. $39/month)
 * 3. Copy the Plan ID (starts with P-)
 * 4. Paste it into the matching PLAN_IDS entry below
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
  var PAYPAL_CLIENT_ID = 'AReeYev_eodCOTJ1KDm-9q3I2YKEd7QyNecK3MgS2JUm92oIAIJGyCLrF_uSA4yWVwBYd32qdWvHd1R5';

  // ── REPLACE EACH WITH YOUR REAL PAYPAL SUBSCRIPTION PLAN ID (starts with P-) ──
  // These bind to the entry-tier MONTHLY plan for each tool (see comment above).
  var PLAN_IDS = {
    'oliops':       'YOUR_OLIOPS_PLAN_ID_HERE',       // Starter, $39/month
    'olicommerce':  'YOUR_OLICOMMERCE_PLAN_ID_HERE',  // Basic, $29/month
    'oliflow':      'YOUR_OLIFLOW_PLAN_ID_HERE',      // Solo, $35/month
    'oliexplore':   'YOUR_OLIEXPLORE_PLAN_ID_HERE',   // Creator, $27/month
    'oli-locator':  'YOUR_LOCATOR_PLAN_ID_HERE',      // Solo Agent, $59/month
    'olisalestrack':'YOUR_OLISALESTRACK_PLAN_ID_HERE',// Pro, $24/month
  };

  // ── THANK-YOU PAGE (edit once, applies everywhere) ─────────────────────
  var SUCCESS_BASE_URL = window.location.origin; // e.g. https://yourdomain.com

  // ── Internal: detect which product this buy page is for ───────────────
  // All 6 tools are recurring subscriptions — amount shown is the entry-tier
  // monthly price, used only for display before the PayPal SDK loads.
  function detectProduct() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('oliops'))      return { key: 'oliops',      name: 'OliOps Suite — Starter Plan',       amount: '39.00', recurring: true };
    if (path.includes('olicommerce')) return { key: 'olicommerce', name: 'OliCommerce Stack — Basic Plan',    amount: '29.00', recurring: true };
    if (path.includes('oliflow'))     return { key: 'oliflow',     name: 'OliFlow Engine — Solo Plan',        amount: '35.00', recurring: true };
    if (path.includes('oliexplore'))  return { key: 'oliexplore',  name: 'OliExplore — Creator Plan',         amount: '27.00', recurring: true };
    if (path.includes('oli-locator')) return { key: 'oli-locator', name: 'Oli-Locator — Solo Agent Plan',     amount: '59.00', recurring: true };
    if (path.includes('olisalestrack')) return { key: 'olisalestrack', name: 'OliSalesTrack — Pro Plan',     amount: '24.00', recurring: true };
    return null;
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

    var container = document.getElementById('paypal-button-container');
    if (!container) return; // no container on this page

    var product = detectProduct();
    if (!product) {
      container.innerHTML = '<p style="color:#92400e;font-size:13px;">⚠️ Could not detect product. Check paypal-sdk.js configuration.</p>';
      return;
    }

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

    // Build SDK URL
    var sdkSrc = 'https://www.paypal.com/sdk/js?client-id=' + PAYPAL_CLIENT_ID + '&currency=USD';
    if (product.recurring) {
      sdkSrc += '&vault=true&intent=subscription';
    }

    var script = document.createElement('script');
    script.src = sdkSrc;
    script.setAttribute('data-sdk-integration-source', 'button-factory');
    script.onload = function() { renderButton(container, product); };
    script.onerror = function() {
      container.innerHTML = '<p style="color:#dc2626;font-size:13px;">⚠️ PayPal failed to load. Check your Client ID and internet connection.</p>';
    };
    document.head.appendChild(script);
  }

  function renderButton(container, product) {
    if (!window.paypal) return;

    // ── All 6 tools are subscriptions — render a PayPal Subscribe button ──
    var planId = PLAN_IDS[product.key];
    if (!planId || planId.indexOf('YOUR_') === 0) {
      container.innerHTML = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:13px;color:#92400e">⚙️ Set PLAN_IDS.' + product.key + ' in shared/paypal-sdk.js to activate subscriptions.</div>';
      return;
    }
    window.paypal.Buttons({
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
    }).render(container);
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

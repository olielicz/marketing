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
 * For subscription plans (Oli-Locator), you also need to:
 * 1. Go to PayPal Dashboard → Catalog → Products → Create product
 * 2. Create a plan under that product ($49/month)
 * 3. Copy the Plan ID (starts with P-)
 * 4. Replace the LOCATOR_PLAN_ID_HERE below
 * ──────────────────────────────────────────────────────────────────────────
 */

(function() {
  'use strict';

  // ── REPLACE THIS WITH YOUR REAL PAYPAL CLIENT ID ──────────────────────
  var PAYPAL_CLIENT_ID = 'YOUR_PAYPAL_CLIENT_ID_HERE';

  // ── REPLACE FOR OLI-LOCATOR SUBSCRIPTION PLAN ─────────────────────────
  var LOCATOR_PLAN_ID = 'YOUR_LOCATOR_PLAN_ID_HERE'; // starts with P-

  // ── THANK-YOU PAGE (edit once, applies everywhere) ─────────────────────
  var SUCCESS_BASE_URL = window.location.origin; // e.g. https://yourdomain.com

  // ── Internal: detect which product this buy page is for ───────────────
  function detectProduct() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('oliops'))     return { name: 'OliOps Suite — Lifetime License',       amount: '299.00', recurring: false };
    if (path.includes('olicommerce'))return { name: 'OliCommerce Stack — Lifetime License',   amount: '199.00', recurring: false };
    if (path.includes('oliflow'))    return { name: 'OliFlow Engine — Lifetime License',       amount: '249.00', recurring: false };
    if (path.includes('oliconnect')) return { name: 'OliConnect — Lifetime License',           amount: '89.00',  recurring: false };
    if (path.includes('oli-locator'))return { name: 'Oli-Locator — Agency Plan',               amount: '49.00',  recurring: true  };
    // OliSalesTrack uses its own separate PayPal subscription script (see olisalestrack/buy/index.html)
    // This file only handles the 5 tools above. OliSalesTrack one-time payments do NOT route here.
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

    if (product.recurring) {
      // ── Subscription button (Oli-Locator) ─────────────────────────────
      if (LOCATOR_PLAN_ID === 'YOUR_LOCATOR_PLAN_ID_HERE') {
        container.innerHTML = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:13px;color:#92400e">⚙️ Set LOCATOR_PLAN_ID in shared/paypal-sdk.js to activate subscriptions.</div>';
        return;
      }
      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'subscribe', height: 48 },
        createSubscription: function(data, actions) {
          return actions.subscription.create({ plan_id: LOCATOR_PLAN_ID });
        },
        onApprove: function(data) {
          showSuccess('subscription', data.subscriptionID, product);
        },
        onError: function(err) {
          console.error('PayPal error:', err);
          showError();
        }
      }).render(container);
    } else {
      // ── One-time payment button ────────────────────────────────────────
      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'buynow', height: 48 },
        createOrder: function(data, actions) {
          return actions.order.create({
            purchase_units: [{
              amount: { value: product.amount, currency_code: 'USD' },
              description: product.name
            }]
          });
        },
        onApprove: function(data, actions) {
          return actions.order.capture().then(function(details) {
            showSuccess('order', details.id, product);
          });
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
  }

  function showSuccess(type, id, product) {
    // ── 1. Create account + send welcome email ────────────────────────
    var buyerEmail = getBuyerEmail();
    if (buyerEmail && window.OliAuth) {
      var toolKey = detectToolKey();
      OliAuth.createAccount(buyerEmail, toolKey, id);
    }

    // ── 2. Show success UI ─────────────────────────────────────────────
    var box = document.getElementById('paypal-success-box');
    if (box) {
      box.style.display = 'block';
      var idEl = document.getElementById('paypal-ref-id');
      if (idEl) idEl.textContent = id;
    } else {
      var loginPath = getLoginPath();
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
      modal.innerHTML = '<div style="background:#fff;border-radius:20px;padding:2.5rem 2rem;max-width:440px;width:100%;text-align:center;font-family:inherit">'
        + '<div style="font-size:3rem;margin-bottom:1rem">🎉</div>'
        + '<h2 style="margin:0 0 .75rem;font-size:1.5rem;color:#14161a">Payment successful!</h2>'
        + '<p style="color:#55606e;margin:0 0 .5rem;font-size:15px">An email is on its way to <strong>' + (buyerEmail || 'your inbox') + '</strong> with your login details.</p>'
        + '<p style="color:#55606e;margin:0 0 1.5rem;font-size:13.5px">Reference: <code style="background:#f4f4f8;padding:2px 6px;border-radius:4px">' + id + '</code></p>'
        + '<a href="' + loginPath + '" style="display:block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:10px">Sign In to Your Account →</a>'
        + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:transparent;border:none;color:#55606e;font-size:13px;cursor:pointer;padding:4px">I\'ll check email first</button>'
        + '</div>';
      document.body.appendChild(modal);
    }
  }

  // ── Detect which tool key this buy page belongs to ──────────────────
  function detectToolKey() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('oliops'))      return 'oliops';
    if (path.includes('olicommerce')) return 'olicommerce';
    if (path.includes('oliflow'))     return 'oliflow';
    if (path.includes('oliconnect'))  return 'oliconnect';
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

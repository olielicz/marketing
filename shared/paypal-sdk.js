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
    if (path.includes('oliops'))     return { name: 'OliOps Suite — Lifetime License',          amount: '299.00', recurring: false };
    if (path.includes('olicommerce'))return { name: 'OliCommerce Stack — Lifetime License',     amount: '199.00', recurring: false };
    if (path.includes('oliflow'))    return { name: 'OliFlow Engine — Lifetime License',         amount: '249.00', recurring: false };
    if (path.includes('oliconnect')) return { name: 'OliConnect — Lifetime License',             amount: '89.00',  recurring: false };
    if (path.includes('oli-locator'))return { name: 'Oli-Locator — Agency Plan',                 amount: '49.00',  recurring: true  };
    if (path.includes('olisalestrack'))return { name: 'OliSalesTrack Pro — Lifetime License',   amount: '149.00', recurring: false };
    return null;
  }

  // ── Load SDK and render button ─────────────────────────────────────────
  function init() {
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
    var box = document.getElementById('paypal-success-box');
    if (box) {
      box.style.display = 'block';
      var idEl = document.getElementById('paypal-ref-id');
      if (idEl) idEl.textContent = id;
    } else {
      // Fallback modal
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
      modal.innerHTML = '<div style="background:#fff;border-radius:20px;padding:2.5rem 2rem;max-width:400px;width:100%;text-align:center;font-family:inherit">'
        + '<div style="font-size:3rem;margin-bottom:1rem">🎉</div>'
        + '<h2 style="margin:0 0 0.75rem;font-size:1.5rem;color:#14161a">Payment successful!</h2>'
        + '<p style="color:#55606e;margin:0 0 1.25rem;font-size:15px">Your serial code will be emailed to you within minutes. Reference: <strong>' + id + '</strong></p>'
        + '<button onclick="this.closest(\'div[style]\').remove()" style="background:#4f46e5;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer">Got it →</button>'
        + '</div>';
      document.body.appendChild(modal);
    }
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

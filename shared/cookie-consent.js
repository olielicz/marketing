/**
 * Oli Tools — lightweight cookie/consent banner.
 *
 * GDPR / ePrivacy-friendly by default: this site currently sets NO cookies
 * and loads NO third-party trackers on its own. The only third-party
 * scripts embedded anywhere on this site are:
 *   - Brevo's signup form widget (loads only on pages with a waitlist form)
 *   - Stripe/PayPal buttons on /buy/ pages (only contacted when a visitor
 *     actively clicks "Pay with Stripe/PayPal" — not loaded passively)
 *
 * Because there's nothing non-essential to opt into yet, this banner is
 * informational rather than a hard blocker — it tells visitors what's true
 * today and links to the full Privacy Policy for exactly what to expect.
 * If analytics (GA4/Plausible) or ad pixels are added later, upgrade this
 * to a real opt-in gate that blocks those scripts until accepted — see the
 * "IF YOU ADD ANALYTICS LATER" note at the bottom of this file.
 */
(function () {
  var STORAGE_KEY = "oli_cookie_notice_ack";

  function alreadyAcknowledged() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return false; // localStorage blocked (privacy mode etc.) — show banner every time, harmless
    }
  }

  function acknowledge() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch (e) {
      /* ignore */
    }
    var el = document.getElementById("oli-cookie-banner");
    if (el) el.remove();
  }

  function render() {
    if (alreadyAcknowledged()) return;
    if (document.getElementById("oli-cookie-banner")) return;

    var el = document.createElement("div");
    el.id = "oli-cookie-banner";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Cookie notice");
    el.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#14161a;color:#e7e9ee;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
      "font-size:14px;line-height:1.5;padding:16px 20px;display:flex;gap:16px;align-items:center;" +
      "justify-content:center;flex-wrap:wrap;box-shadow:0 -4px 24px rgba(0,0,0,0.25);";

    var text = document.createElement("span");
    text.style.cssText = "max-width:640px;";
    text.innerHTML =
      "🍪 This site doesn't set cookies or load trackers on its own. If you use a signup form or checkout button, " +
      "that specific provider (Brevo, Stripe, or PayPal) may set its own cookies once you interact with it. " +
      '<a href="/privacy/" style="color:#93c5fd;text-decoration:underline;">Read the full Privacy Policy</a>.';

    var btnRow = document.createElement("span");
    btnRow.style.cssText = "display:flex; gap:10px; flex-shrink:0;";

    var okBtn = document.createElement("button");
    okBtn.textContent = "Got it";
    okBtn.style.cssText =
      "background:#4f46e5;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-weight:700;" +
      "font-size:13.5px;cursor:pointer;";
    okBtn.onclick = acknowledge;

    btnRow.appendChild(okBtn);
    el.appendChild(text);
    el.appendChild(btnRow);
    document.body.appendChild(el);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();

/*
 * IF YOU ADD ANALYTICS LATER (Plausible, GA4, Meta Pixel, etc.):
 * 1. Do NOT load the analytics <script> tag directly in <head>/<body>.
 * 2. Wrap it in a function, e.g. `function loadAnalytics() { ...inject script... }`.
 * 3. Only call loadAnalytics() from inside a new "Accept analytics" button's
 *    onclick handler in this file, and only set a separate localStorage flag
 *    (e.g. "oli_analytics_consent") when that specific button is clicked.
 * 4. Update the /privacy/ page to name the specific analytics tool and what
 *    it collects, and update this banner's text to mention it by name.
 * This keeps the site honestly "no tracking without consent" instead of
 * silently becoming untrue the moment analytics gets added.
 */

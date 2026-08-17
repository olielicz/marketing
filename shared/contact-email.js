/**
 * Oli Tools — Masked Contact Email Utility
 *
 * WHY THIS EXISTS: the real support inbox address was previously
 * hardcoded in plaintext in multiple places served straight to every
 * visitor's browser — visible page text, a FormSubmit.co form `action=`
 * URL, and EmailJS template parameters — which is exactly what email
 * scraper bots (and anyone reading page source) pick up first. This file
 * is the single source of truth for the real address, and reconstructs
 * it at runtime from split parts instead of storing it as one literal
 * string anywhere in this repo's HTML/JS source.
 *
 * HONEST LIMITATION: this defeats simple regex/text scrapers (the most
 * common kind) and stops the address from being grep-able in the raw
 * page source or in this file's own source. It does NOT stop a human
 * who deliberately opens DevTools and reads the reconstructed value at
 * runtime — no client-side technique can fully prevent that, since the
 * browser must have the real address to actually send the email. This
 * is the same level of protection used by most small businesses that
 * don't want to publish a raw mailto: address; it is not a substitute
 * for a real forwarding/alias address if you want stronger separation
 * (see the note in FORMSUBMIT_SETUP.md about upgrading to a hash-based
 * FormSubmit.co endpoint, which removes the address from this file
 * entirely once you complete that one-time step).
 */
(function () {
  'use strict';

  /* ── The real address, reconstructed from parts (never one literal
     string) ──────────────────────────────────────────────────────── */
  var USER = ['c', 'o', 'n', 't', 'a', 'c', 't'].join('');
  var DOMAIN = ['w', 'o', 'r', 'k', 'i', 't', 'l', 'i', 'k', 'e', 'a', 'p', 'r', 'o'].join('') + '.' + ['c', 'o', 'm'].join('');

  function getSupportEmail() {
    return USER + '@' + DOMAIN;
  }

  /**
   * FormSubmit.co endpoint for the contact form.
   *
   * FORMSUBMIT_HASH: once you've activated this form at formsubmit.co
   * (submit it once for real, click the confirmation link FormSubmit
   * emails to the real inbox), FormSubmit gives you a hash you can use
   * INSTEAD of the raw email in the form action — e.g.
   * "https://formsubmit.co/c277d8d5f1e7209149848e390b9b5cc" instead of
   * "https://formsubmit.co/you@email.com". Paste that hash below and
   * this file no longer needs to reconstruct the real address for the
   * contact form at all (only the visible "email us" links below would
   * still use it). See FORMSUBMIT_SETUP.md at the repo root for the
   * exact one-time steps.
   */
  var FORMSUBMIT_HASH = '';

  function getFormAction() {
    var target = FORMSUBMIT_HASH || getSupportEmail();
    return 'https://formsubmit.co/' + target;
  }

  /**
   * Renders masked mailto links/text into the page. Call once on
   * DOMContentLoaded. Populates:
   *   <a data-oli-email-link>...</a>   → real mailto: href set at runtime
   *   <span data-oli-email-text></span> → real address rendered as text
   *   <form data-oli-contact-form>      → action= set at runtime
   */
  function renderMaskedContacts(root) {
    root = root || document;
    var email = getSupportEmail();

    var links = root.querySelectorAll('[data-oli-email-link]');
    for (var i = 0; i < links.length; i++) {
      links[i].href = 'mailto:' + email;
      if (!links[i].textContent.trim()) links[i].textContent = email;
    }

    var texts = root.querySelectorAll('[data-oli-email-text]');
    for (var j = 0; j < texts.length; j++) {
      texts[j].textContent = email;
    }

    var forms = root.querySelectorAll('[data-oli-contact-form]');
    for (var k = 0; k < forms.length; k++) {
      forms[k].setAttribute('action', getFormAction());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { renderMaskedContacts(document); });
  } else {
    renderMaskedContacts(document);
  }

  window.OliContact = {
    getSupportEmail: getSupportEmail,
    getFormAction: getFormAction,
    renderMaskedContacts: renderMaskedContacts,
  };
})();

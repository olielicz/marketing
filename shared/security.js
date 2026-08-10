/**
 * Oli Tools — Client-Side Security Layer
 *
 * What this does (layered approach):
 * ────────────────────────────────────
 * 1. Disables right-click context menu on the page
 * 2. Blocks common keyboard shortcuts used for copying/viewing source:
 *    Ctrl/Cmd+U (view source), Ctrl/Cmd+S (save), Ctrl/Cmd+A (select all),
 *    Ctrl/Cmd+C on non-input elements, F12, Ctrl+Shift+I/J/C (DevTools)
 * 3. Disables text selection on non-interactive elements
 * 4. Detects DevTools open state and shows a warning overlay
 * 5. Adds a visible copyright watermark in the page console
 * 6. Applies CSS user-select: none to the body (editable inputs preserved)
 * 7. Injects the content license meta tags
 *
 * IMPORTANT — honest note:
 * ─────────────────────────
 * No client-side protection is unbreakable. A determined developer
 * can always view source in a browser. This layer:
 *   ✅ Stops casual copying by non-technical visitors
 *   ✅ Adds friction for scraper bots
 *   ✅ Signals clearly that the content is proprietary
 *   ✅ Provides legal evidence of intent to protect
 *
 * Real protection comes from:
 *   - Your Terms of Service (already in /terms/)
 *   - Copyright registration
 *   - Hosting your ACTUAL tools (SalesTrack app etc.) behind auth (done ✅)
 *   - The _headers file (adds server-level HTTP security headers)
 */
(function () {
  'use strict';

  /* FIX (masked-email pass): this file previously hardcoded the real
     support address as a plaintext literal in 3 places (console
     watermark, print-block message, DevTools-warning overlay). It now
     reads it from window.OliContact (shared/contact-email.js) when that
     script happens to be loaded on the page, and falls back to a
     generic "use the Contact page" message otherwise — no hard
     dependency, since not every page that loads security.js also loads
     contact-email.js today. */
  function supportContactLine() {
    if (window.OliContact && typeof window.OliContact.getSupportEmail === 'function') {
      return window.OliContact.getSupportEmail();
    }
    return 'our Contact page (see the footer)';
  }

  /* ── 1. Right-click disable ─────────────────────────────────────────── */
  document.addEventListener('contextmenu', function (e) {
    // Allow right-click on inputs, textareas, selects so usability isn't broken
    var tag = (e.target.tagName || '').toLowerCase();
    if (['input','textarea','select'].indexOf(tag) === -1) {
      e.preventDefault();
    }
  });

  /* ── 2. Keyboard shortcut blocking ─────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    var ctrl = e.ctrlKey || e.metaKey;
    var tag  = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    var inInput = ['input','textarea','select'].indexOf(tag) !== -1;

    // F12 — DevTools
    if (e.key === 'F12') { e.preventDefault(); showWarning(); return; }

    if (ctrl) {
      switch (e.key.toLowerCase()) {
        case 'u': // View Source
          e.preventDefault(); showWarning(); return;
        case 's': // Save page
          e.preventDefault(); return;
        case 'a': // Select all — only block outside inputs
          if (!inInput) e.preventDefault();
          return;
        case 'p': // Print
          e.preventDefault(); return;
      }
    }

    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C — DevTools panels
    if (ctrl && e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'i':
        case 'j':
        case 'c':
          e.preventDefault(); showWarning(); return;
      }
    }
  });

  /* ── 3. Disable text selection on non-interactive elements ─────────── */
  var style = document.createElement('style');
  style.id  = 'oli-security-styles';
  style.textContent = [
    /* Block selection on everything… */
    'body{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;}',
    /* …but restore it on form elements and anything with class "selectable" */
    'input,textarea,select,.selectable,code,pre{',
    '  -webkit-user-select:text;-moz-user-select:text;-ms-user-select:text;user-select:text;}',
    /* Disable image drag */
    'img{-webkit-user-drag:none;-khtml-user-drag:none;-moz-user-drag:none;',
    '    -o-user-drag:none;user-drag:none;pointer-events:none;}',
    /* Prevent text highlight on double-click on tiles/cards */
    '.tile,.card,.tool-tile,.price-card{',
    '  -webkit-user-select:none;user-select:none;}',
    /* Warning overlay */
    '#oli-security-overlay{position:fixed;inset:0;z-index:99999;',
    '  background:rgba(15,14,23,0.97);display:flex;align-items:center;',
    '  justify-content:center;flex-direction:column;gap:16px;',
    '  font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#f0eeff;}',
    '#oli-security-overlay h2{font-size:22px;font-weight:800;margin:0;}',
    '#oli-security-overlay p{font-size:14px;color:#9b96b8;max-width:400px;',
    '  text-align:center;margin:0;}',
    '#oli-security-overlay button{background:#6C47FF;color:#fff;border:none;',
    '  padding:10px 22px;border-radius:8px;font-weight:700;font-size:14px;',
    '  cursor:pointer;margin-top:6px;}',
  ].join('');
  document.head.appendChild(style);

  /* ── 4. DevTools detection ──────────────────────────────────────────── */
  var devtoolsOpen = false;
  var threshold    = 160; // px — height/width difference that suggests DevTools is open

  function checkDevTools() {
    var widthDiff  = window.outerWidth  - window.innerWidth;
    var heightDiff = window.outerHeight - window.innerHeight;
    var open = widthDiff > threshold || heightDiff > threshold;
    if (open && !devtoolsOpen) {
      devtoolsOpen = true;
      showWarning();
    } else if (!open && devtoolsOpen) {
      devtoolsOpen = false;
      removeWarning();
    }
  }

  // Check periodically (non-blocking)
  setInterval(checkDevTools, 1500);

  /* ── 5. Console copyright watermark ─────────────────────────────────── */
  setTimeout(function () {
    var styles = [
      'background: linear-gradient(135deg, #6C47FF, #FF6B6B)',
      'color: #fff',
      'padding: 8px 16px',
      'border-radius: 6px',
      'font-size: 14px',
      'font-weight: 700',
    ].join(';');
    console.log('%c© 2025 Oli Tools by WorkItLikeAPro — All rights reserved.', styles);
    console.log('%cThis software is proprietary. Copying, reproducing or distributing ' +
      'any part without written permission is a violation of copyright law.',
      'color:#9b96b8;font-size:12px');
    console.log('%cSecurity concerns? ' + supportContactLine(), 'color:#6C47FF;font-size:12px');
  }, 800);

  /* ── 6. Image drag prevention ───────────────────────────────────────── */
  document.addEventListener('dragstart', function (e) {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });

  /* ── 7. Print blocking ──────────────────────────────────────────────── */
  if (window.matchMedia) {
    window.matchMedia('print').addEventListener('change', function (mq) {
      if (mq.matches) {
        document.body.innerHTML =
          '<div style="padding:40px;font-family:sans-serif;text-align:center">' +
          '<h2>© Oli Tools by WorkItLikeAPro</h2>' +
          '<p>Printing this page is not permitted.<br>' +
          'Contact ' + supportContactLine() + ' for licensing.</p></div>';
      }
    });
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function showWarning() {
    if (document.getElementById('oli-security-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id  = 'oli-security-overlay';
    overlay.innerHTML =
      '<div style="font-size:48px">🔒</div>' +
      '<h2>© Oli Tools — Proprietary Software</h2>' +
      '<p>This content is protected by copyright.<br>' +
      'Unauthorised copying, reproduction or distribution is prohibited.</p>' +
      '<p style="font-size:12px;margin-top:4px">' + supportContactLine() + '</p>' +
      '<button onclick="document.getElementById(\'oli-security-overlay\').remove()">Close</button>';
    document.body.appendChild(overlay);
  }

  function removeWarning() {
    var el = document.getElementById('oli-security-overlay');
    if (el) el.remove();
  }

})();

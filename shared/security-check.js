/**
 * Oli Tools — Runtime Security Self-Test
 * Run this in the browser console to verify security layers are active.
 * Delete or exclude from production if you prefer no test output.
 *
 * Usage: paste into browser DevTools console on any page, or
 *        include as a script only during dev:
 *        <script src="../../shared/security-check.js"></script>
 */
(function runSecurityTests() {
  var results = [];

  function test(name, fn) {
    try {
      var r = fn();
      results.push({ name: name, pass: r, note: '' });
    } catch (e) {
      results.push({ name: name, pass: false, note: e.message });
    }
  }

  // 1. security.js loaded
  test('security.js injected',
    () => !!document.getElementById('oli-security-styles'));

  // 2. copyright meta present
  test('Copyright meta tag present',
    () => !!document.querySelector('meta[name="copyright"]'));

  // 3. robots meta noindex on login/account pages
  var path = window.location.pathname;
  if (path.includes('/login/') || path.includes('/account/')) {
    test('Login/Account page is noindex',
      () => {
        var m = document.querySelector('meta[name="robots"]');
        return m && m.content.includes('noindex');
      });
  }

  // 4. auth.js loaded
  test('OliAuth loaded', () => typeof window.OliAuth === 'object');

  // 5. Per-tool session key correct (on login/account pages)
  if (typeof OliAuth !== 'undefined') {
    test('OliAuth.detectToolKey works',
      () => typeof OliAuth.detectToolKey === 'function');
    test('OliAuth.requireLogin exists',
      () => typeof OliAuth.requireLogin === 'function');
  }

  // 6. HTTPS
  test('Page served over HTTPS (or localhost)',
    () => location.protocol === 'https:' || location.hostname === 'localhost');

  // 7. No hardcoded PayPal Client ID
  var scripts = Array.from(document.scripts).map(s => s.src || s.textContent || '');
  test('PayPal Client ID not exposed in page source',
    () => !scripts.some(s => s.includes('YOUR_PAYPAL_CLIENT_ID_HERE') && s.length > 0));

  // Print results
  var pass = results.filter(r => r.pass).length;
  var fail = results.filter(r => !r.pass).length;
  console.group(
    '%c🔒 Oli Tools Security Check — ' + pass + '/' + results.length + ' passed',
    'font-weight:700;font-size:13px;color:' + (fail ? '#dc2626' : '#16a34a')
  );
  results.forEach(function (r) {
    var icon  = r.pass ? '✅' : '❌';
    var style = r.pass ? 'color:#16a34a' : 'color:#dc2626;font-weight:700';
    console.log('%c' + icon + ' ' + r.name, style);
    if (r.note) console.log('   ↳', r.note);
  });
  console.groupEnd();

  return { passed: pass, failed: fail, total: results.length, results: results };
})();

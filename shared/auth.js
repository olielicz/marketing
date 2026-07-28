/**
 * Oli Tools — Shared Authentication & Session Manager
 *
 * How it works (pure frontend, no backend required):
 * ─────────────────────────────────────────────────
 * 1. When a customer buys a tool, PayPal/Stripe fires a webhook.
 *    The paypal-sdk.js success handler calls createAccount() which:
 *      - Generates a random temporary password
 *      - Stores the account in localStorage (demo) OR posts to your backend
 *      - Sends the welcome email via EmailJS (free tier: 200 emails/month)
 *
 * 2. Customer clicks the login link in their email → lands on /login/
 *    They enter email + password → session stored → redirected to their tool.
 *
 * 3. From /account/ they can change their password at any time.
 *
 * ── EMAILJS SETUP (free, 5 minutes) ──────────────────────────────────────
 * 1. Go to https://www.emailjs.com → Sign up free
 * 2. Add a service: Gmail → connect workitlikeapr01@gmail.com
 * 3. Create a template called "oli_welcome" with these variables:
 *      {{to_email}}  {{to_name}}  {{tool_name}}  {{temp_password}}  {{login_url}}
 * 4. Create a template called "oli_renewal" with these variables:
 *      {{to_email}}  {{to_name}}  {{tool_name}}  {{renewal_date}}  {{amount}}  {{cancel_url}}
 * 5. Copy your Public Key, Service ID, and both Template IDs into the
 *    EMAILJS_CONFIG object below.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── BACKEND UPGRADE PATH ─────────────────────────────────────────────────
 * This file uses localStorage as the user store so it works on GitHub Pages
 * with zero backend. When you're ready to upgrade:
 *   - Replace saveUser() / getUser() / updateUser() with fetch() calls to
 *     your own API (Node/Express, Supabase, Firebase, etc.)
 *   - Replace the EmailJS calls with your own email service (Brevo API,
 *     SendGrid, Postmark, etc.)
 *   - Move password hashing server-side (bcrypt/scrypt)
 * ─────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── EmailJS Configuration ── replace with your real values ───────── */
  var EMAILJS_CONFIG = {
    publicKey:        'YOUR_EMAILJS_PUBLIC_KEY',      // from EmailJS → Account → Public Key
    serviceId:        'YOUR_EMAILJS_SERVICE_ID',      // from EmailJS → Email Services
    welcomeTemplate:  'oli_welcome',                  // template ID for purchase welcome email
    renewalTemplate:  'oli_renewal',                  // template ID for renewal reminder email
  };

  /* ── Session key ───────────────────────────────────────────────────── */
  var SESSION_KEY = 'oli_session';
  var USERS_KEY   = 'oli_users';

  /* ── Tool definitions ──────────────────────────────────────────────── */
  var TOOLS = {
    'oliops':       { name: 'OliOps Suite',              url: '../oliops/',       color: '#4f46e5', type: 'lifetime',  price: '$299' },
    'olicommerce':  { name: 'OliCommerce Stack',          url: '../olicommerce/',  color: '#059669', type: 'lifetime',  price: '$199' },
    'oliflow':      { name: 'OliFlow Automation Engine',  url: '../oliflow/',      color: '#ea580c', type: 'lifetime',  price: '$249' },
    'oliconnect':   { name: 'OliConnect',                 url: '../oliconnect/',   color: '#db2777', type: 'lifetime',  price: '$89'  },
    'oli-locator':  { name: 'Oli-Locator',                url: '../oli-locator/',  color: '#2563eb', type: 'monthly',   price: '$49/mo' },
    'olisalestrack':{ name: 'OliSalesTrack',              url: '../olisalestrack/',color: '#7c3aed', type: 'monthly',   price: '$19/mo' },
  };

  /* ══════════════════════════════════════════════════════════════════════
     USER STORE  (localStorage wrapper — swap for real API when ready)
     ══════════════════════════════════════════════════════════════════════ */

  function getAllUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveAllUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  function getUser(email) {
    return getAllUsers()[email.toLowerCase()] || null;
  }
  function saveUser(email, data) {
    var users = getAllUsers();
    users[email.toLowerCase()] = data;
    saveAllUsers(users);
  }
  function updateUser(email, patch) {
    var user = getUser(email);
    if (!user) return false;
    Object.assign(user, patch);
    saveUser(email, user);
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     PASSWORD UTILITIES
     ══════════════════════════════════════════════════════════════════════ */

  function generateTempPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    var pwd = '';
    for (var i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  /* Simple hash (client-side only — upgrade to bcrypt when you add a backend) */
  function hashPassword(password) {
    var hash = 0, chr;
    var str = password + 'oli_salt_8x2k9p';
    for (var i = 0; i < str.length; i++) {
      chr  = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(36) + '_' + str.length;
  }

  function checkPassword(password, storedHash) {
    return hashPassword(password) === storedHash;
  }

  /* ══════════════════════════════════════════════════════════════════════
     ACCOUNT CREATION  (called from paypal-sdk.js after successful payment)
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * createAccount(email, toolKey, orderRef)
   * Called automatically after a successful PayPal or Stripe payment.
   * Creates the user account (if new) and sends the welcome email.
   */
  function createAccount(email, toolKey, orderRef) {
    if (!email || !toolKey) return;
    var tool = TOOLS[toolKey];
    if (!tool) return;

    var existing = getUser(email);
    var tempPassword = existing ? null : generateTempPassword();
    var isNewUser    = !existing;

    if (isNewUser) {
      saveUser(email, {
        email:        email,
        passwordHash: hashPassword(tempPassword),
        name:         email.split('@')[0],
        tools:        [toolKey],
        orders:       [{ toolKey: toolKey, ref: orderRef, date: new Date().toISOString(), status: 'active' }],
        createdAt:    new Date().toISOString(),
        mustChangePassword: true,
      });
    } else {
      /* Existing user — add new tool to their account */
      var tools  = existing.tools || [];
      var orders = existing.orders || [];
      if (tools.indexOf(toolKey) === -1) tools.push(toolKey);
      orders.push({ toolKey: toolKey, ref: orderRef, date: new Date().toISOString(), status: 'active' });
      updateUser(email, { tools: tools, orders: orders });
    }

    /* Send welcome email */
    sendWelcomeEmail({
      toEmail:     email,
      toName:      email.split('@')[0],
      toolName:    tool.name,
      tempPwd:     isNewUser ? tempPassword : '(use your existing password)',
      loginUrl:    getLoginUrl(toolKey),
      isNewUser:   isNewUser,
      orderRef:    orderRef,
    });

    return { success: true, isNewUser: isNewUser };
  }

  /* ══════════════════════════════════════════════════════════════════════
     EMAIL SENDING  (EmailJS)
     ══════════════════════════════════════════════════════════════════════ */

  function loadEmailJS(cb) {
    if (window.emailjs) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
    s.onload = function () {
      window.emailjs.init(EMAILJS_CONFIG.publicKey);
      cb();
    };
    s.onerror = function () {
      console.warn('[OliAuth] EmailJS failed to load — email not sent. Check network / public key.');
    };
    document.head.appendChild(s);
  }

  function sendWelcomeEmail(params) {
    if (EMAILJS_CONFIG.publicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
      /* Not configured yet — log to console so you can see it worked */
      console.log('[OliAuth] Welcome email would send to:', params.toEmail,
        '\nTool:', params.toolName,
        '\nTemp password:', params.tempPwd,
        '\nLogin URL:', params.loginUrl);
      return;
    }
    loadEmailJS(function () {
      window.emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.welcomeTemplate, {
        to_email:      params.toEmail,
        to_name:       params.toName,
        tool_name:     params.toolName,
        temp_password: params.tempPwd,
        login_url:     params.loginUrl,
        order_ref:     params.orderRef || '',
        is_new_user:   params.isNewUser ? 'yes' : 'no',
        support_email: 'workitlikeapr01@gmail.com',
      }).then(function () {
        console.log('[OliAuth] Welcome email sent to', params.toEmail);
      }).catch(function (err) {
        console.error('[OliAuth] Welcome email failed:', err);
      });
    });
  }

  function sendRenewalReminderEmail(email, toolKey, renewalDate, amount) {
    var tool = TOOLS[toolKey] || { name: toolKey };
    var user = getUser(email);
    if (!user) return;
    if (EMAILJS_CONFIG.publicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
      console.log('[OliAuth] Renewal reminder would send to:', email, 'for', tool.name, 'on', renewalDate);
      return;
    }
    loadEmailJS(function () {
      window.emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.renewalTemplate, {
        to_email:     email,
        to_name:      user.name || email.split('@')[0],
        tool_name:    tool.name,
        renewal_date: renewalDate,
        amount:       amount,
        cancel_url:   'https://www.paypal.com/myaccount/autopay/',
        login_url:    getLoginUrl(toolKey),
        support_email:'workitlikeapr01@gmail.com',
      }).catch(function (err) {
        console.error('[OliAuth] Renewal reminder failed:', err);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     SESSION MANAGEMENT
     ══════════════════════════════════════════════════════════════════════ */

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function setSession(email, toolKey) {
    var user = getUser(email);
    if (!user) return false;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      email:    email,
      toolKey:  toolKey || (user.tools && user.tools[0]) || null,
      name:     user.name,
      loginAt:  Date.now(),
    }));
    return true;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function isLoggedIn() {
    var s = getSession();
    if (!s) return false;
    /* Session expires after 8 hours */
    if (Date.now() - s.loginAt > 8 * 60 * 60 * 1000) { clearSession(); return false; }
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     LOGIN / LOGOUT
     ══════════════════════════════════════════════════════════════════════ */

  function login(email, password, toolKey) {
    var user = getUser(email);
    if (!user) return { ok: false, error: 'No account found for that email address.' };
    if (!checkPassword(password, user.passwordHash)) return { ok: false, error: 'Incorrect password.' };
    if (toolKey && user.tools && user.tools.indexOf(toolKey) === -1) {
      return { ok: false, error: 'This email has not purchased ' + (TOOLS[toolKey] ? TOOLS[toolKey].name : toolKey) + '.' };
    }
    setSession(email, toolKey);
    return { ok: true, user: user, mustChangePassword: !!user.mustChangePassword };
  }

  function logout(redirectUrl) {
    clearSession();
    window.location.href = redirectUrl || '../login/';
  }

  /* ══════════════════════════════════════════════════════════════════════
     PASSWORD CHANGE
     ══════════════════════════════════════════════════════════════════════ */

  function changePassword(email, currentPassword, newPassword) {
    var user = getUser(email);
    if (!user) return { ok: false, error: 'Account not found.' };
    if (!checkPassword(currentPassword, user.passwordHash)) return { ok: false, error: 'Current password is incorrect.' };
    if (newPassword.length < 8) return { ok: false, error: 'New password must be at least 8 characters.' };
    updateUser(email, { passwordHash: hashPassword(newPassword), mustChangePassword: false });
    return { ok: true };
  }

  function requestPasswordReset(email) {
    var user = getUser(email);
    if (!user) {
      /* Don't reveal whether account exists — always show success */
      return { ok: true };
    }
    var resetToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
    updateUser(email, { resetToken: resetToken, resetTokenExp: Date.now() + 60 * 60 * 1000 });
    /* In production: send an email with a link containing the token.
       For now, log it (replace with EmailJS/backend send) */
    var resetUrl = window.location.origin + '/login/?reset=' + resetToken + '&email=' + encodeURIComponent(email);
    if (EMAILJS_CONFIG.publicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
      console.log('[OliAuth] Password reset link:', resetUrl);
    } else {
      loadEmailJS(function () {
        window.emailjs.send(EMAILJS_CONFIG.serviceId, 'oli_reset', {
          to_email:  email,
          to_name:   user.name || email.split('@')[0],
          reset_url: resetUrl,
          support_email: 'workitlikeapr01@gmail.com',
        });
      });
    }
    return { ok: true };
  }

  function resetPasswordWithToken(email, token, newPassword) {
    var user = getUser(email);
    if (!user || user.resetToken !== token) return { ok: false, error: 'Invalid or expired reset link.' };
    if (Date.now() > user.resetTokenExp) return { ok: false, error: 'Reset link has expired. Please request a new one.' };
    if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    updateUser(email, { passwordHash: hashPassword(newPassword), resetToken: null, resetTokenExp: null, mustChangePassword: false });
    return { ok: true };
  }

  /* ══════════════════════════════════════════════════════════════════════
     GUARD — call at the top of any protected tool page
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * requireLogin(toolKey)
   * Call at the top of any page that should require authentication.
   * Redirects to /login/ if not authenticated.
   * Usage: OliAuth.requireLogin('oliops');
   */
  function requireLogin(toolKey) {
    if (!isLoggedIn()) {
      var redirect = encodeURIComponent(window.location.href);
      var tool     = toolKey ? '&tool=' + toolKey : '';
      window.location.href = getLoginUrl(toolKey) + '?redirect=' + redirect + tool;
      return false;
    }
    var session = getSession();
    if (toolKey && session.toolKey !== toolKey) {
      var user = getUser(session.email);
      if (!user || !user.tools || user.tools.indexOf(toolKey) === -1) {
        window.location.href = getLoginUrl(toolKey) + '?error=not_purchased&tool=' + toolKey;
        return false;
      }
    }
    return session;
  }

  /* ══════════════════════════════════════════════════════════════════════
     UTILITIES
     ══════════════════════════════════════════════════════════════════════ */

  function getLoginUrl(toolKey) {
    var base = window.location.origin;
    var path = window.location.pathname;
    /* Find depth to compute relative path back to /login/ */
    var parts = path.replace(/\/$/, '').split('/').filter(Boolean);
    /* Remove github pages project prefix (e.g. /marketing) */
    var depth = Math.max(0, parts.length - 1);
    var rel   = depth > 0 ? Array(depth).fill('..').join('/') + '/login/' : './login/';
    return rel + (toolKey ? '?tool=' + toolKey : '');
  }

  function getAccountUrl() {
    var path   = window.location.pathname;
    var parts  = path.replace(/\/$/, '').split('/').filter(Boolean);
    var depth  = Math.max(0, parts.length - 1);
    return depth > 0 ? Array(depth).fill('..').join('/') + '/account/' : './account/';
  }

  function getToolInfo(key) { return TOOLS[key] || null; }
  function getAllTools()     { return TOOLS; }

  /* ══════════════════════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════════════════════ */

  window.OliAuth = {
    /* Account */
    createAccount:             createAccount,
    login:                     login,
    logout:                    logout,
    requireLogin:              requireLogin,
    isLoggedIn:                isLoggedIn,
    getSession:                getSession,
    /* Password */
    changePassword:            changePassword,
    requestPasswordReset:      requestPasswordReset,
    resetPasswordWithToken:    resetPasswordWithToken,
    /* Email */
    sendRenewalReminderEmail:  sendRenewalReminderEmail,
    /* User data */
    getUser:                   getUser,
    updateUser:                updateUser,
    /* Tool info */
    getToolInfo:               getToolInfo,
    getAllTools:                getAllTools,
    getLoginUrl:               getLoginUrl,
    getAccountUrl:             getAccountUrl,
    /* Config (for testing) */
    _config: EMAILJS_CONFIG,
  };

})();

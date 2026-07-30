/**
 * Oli Tools — Shared Authentication Engine  v2.0
 *
 * KEY CHANGE v2: Each tool is completely separate.
 *   - Users are stored under tool-scoped localStorage keys.
 *   - A user buying OliOps has a completely different account from the same
 *     email buying OliFlow — separate password, separate session, separate
 *     account dashboard.
 *   - This matches the business model: each product is sold separately.
 *
 * ── EMAILJS SETUP (free, 5 minutes) ──────────────────────────────────────
 * 1. https://www.emailjs.com → Sign up free (200 emails/month free)
 * 2. Add service: Gmail → connect workitlikeapr01@gmail.com
 * 3. Create templates: oli_welcome, oli_renewal, oli_reset
 *    (full template copy in README.md)
 * 4. Copy Public Key + Service ID → paste in EMAILJS_CONFIG below
 * ─────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── EmailJS Config ── fill in after EmailJS signup ─────────────────── */
  var EMAILJS_CONFIG = {
    publicKey:       'YOUR_EMAILJS_PUBLIC_KEY',
    serviceId:       'YOUR_EMAILJS_SERVICE_ID',
    welcomeTemplate: 'oli_welcome',
    renewalTemplate: 'oli_renewal',
    resetTemplate:   'oli_reset',
  };

  /* ── Tool definitions ────────────────────────────────────────────────── */
  var TOOLS = {
    'oliops': {
      name:      'OliOps Suite',
      icon:      '💼',
      color:     '#4f46e5',
      bg:        '#eef2ff',
      loginUrl:  '/oliops/login/',
      accountUrl:'/oliops/account/',
      toolUrl:   '/oliops/',
      price:     '$299 lifetime',
      type:      'lifetime',
      tagline:   'CRM + Invoicing + AI Support',
    },
    'olicommerce': {
      name:      'OliCommerce Stack',
      icon:      '🛒',
      color:     '#059669',
      bg:        '#ecfdf5',
      loginUrl:  '/olicommerce/login/',
      accountUrl:'/olicommerce/account/',
      toolUrl:   '/olicommerce/',
      price:     '$199 lifetime',
      type:      'lifetime',
      tagline:   'Shopify Cart Recovery + AI Assistant',
    },
    'oliflow': {
      name:      'OliFlow Automation Engine',
      icon:      '⚙️',
      color:     '#ea580c',
      bg:        '#fff7ed',
      loginUrl:  '/oliflow/login/',
      accountUrl:'/oliflow/account/',
      toolUrl:   '/oliflow/',
      price:     '$249 lifetime',
      type:      'lifetime',
      tagline:   'Self-Hosted Zapier Alternative',
    },
    'oli-locator': {
      name:      'Oli-Locator',
      icon:      '🏡',
      color:     '#2563eb',
      bg:        '#eff6ff',
      loginUrl:  '/oli-locator/login/',
      accountUrl:'/oli-locator/account/',
      toolUrl:   '/oli-locator/',
      price:     '$49/month',
      type:      'monthly',
      tagline:   'Real Estate CRM — USA, UK & Australia',
    },
    'olisalestrack': {
      name:      'OliSalesTrack',
      icon:      '📊',
      color:     '#7c3aed',
      bg:        '#f5f3ff',
      loginUrl:  '/olisalestrack/login/',
      accountUrl:'/olisalestrack/account/',
      toolUrl:   '/olisalestrack/',
      price:     '$19/mo or $148/yr',
      type:      'monthly',
      tagline:   'Sales + Refunds + Expenses Tracker',
    },
  };

  /* ═══════════════════════════════════════════════════════════════════════
     PER-TOOL USER STORE
     Each tool has its own localStorage namespace: "oli_users_TOOLKEY"
     A customer's email can exist in multiple tool stores independently.
     ═══════════════════════════════════════════════════════════════════════ */

  function usersKey(toolKey) {
    return 'oli_users_' + (toolKey || 'global');
  }
  function sessionKey(toolKey) {
    return 'oli_session_' + (toolKey || 'global');
  }

  function getAllUsers(toolKey) {
    try { return JSON.parse(localStorage.getItem(usersKey(toolKey)) || '{}'); }
    catch (e) { return {}; }
  }
  function saveAllUsers(toolKey, users) {
    localStorage.setItem(usersKey(toolKey), JSON.stringify(users));
  }
  function getUser(email, toolKey) {
    if (!email) return null;
    return getAllUsers(toolKey)[email.toLowerCase()] || null;
  }
  function saveUser(email, toolKey, data) {
    var users = getAllUsers(toolKey);
    users[email.toLowerCase()] = data;
    saveAllUsers(toolKey, users);
  }
  function updateUser(email, toolKey, patch) {
    var user = getUser(email, toolKey);
    if (!user) return false;
    Object.assign(user, patch);
    saveUser(email, toolKey, user);
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PASSWORD UTILITIES
     ═══════════════════════════════════════════════════════════════════════ */

  function generateTempPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    var pwd = '';
    for (var i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  function hashPassword(password, toolKey) {
    /* Simple hash with per-tool salt. Replace with bcrypt when adding backend. */
    var salt = 'oli_' + (toolKey || 'tools') + '_2025_salt_x9k2';
    var str = password + salt;
    var hash = 0, chr;
    for (var i = 0; i < str.length; i++) {
      chr  = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return 'h2_' + (toolKey || 'g') + '_' + Math.abs(hash).toString(36) + '_' + str.length;
  }

  function checkPassword(password, storedHash, toolKey) {
    return hashPassword(password, toolKey) === storedHash;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ACCOUNT CREATION  (called from paypal-sdk.js after payment)
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * createAccount(email, toolKey, orderRef)
   * Creates a user account scoped to the specific tool.
   * Sends welcome email with login link for THAT tool's login page.
   */
  function createAccount(email, toolKey, orderRef) {
    if (!email || !toolKey) return { success: false, error: 'Missing email or toolKey' };
    var tool = TOOLS[toolKey];
    if (!tool) return { success: false, error: 'Unknown tool: ' + toolKey };

    var existing    = getUser(email, toolKey);
    var isNewUser   = !existing;
    var tempPassword = isNewUser ? generateTempPassword() : null;

    if (isNewUser) {
      saveUser(email, toolKey, {
        email:               email,
        toolKey:             toolKey,
        passwordHash:        hashPassword(tempPassword, toolKey),
        name:                email.split('@')[0],
        orders:              [{ ref: orderRef, date: new Date().toISOString(), status: 'active' }],
        createdAt:           new Date().toISOString(),
        mustChangePassword:  true,
      });
    } else {
      /* Existing user for this tool — add new order */
      var orders = existing.orders || [];
      orders.push({ ref: orderRef, date: new Date().toISOString(), status: 'active' });
      updateUser(email, toolKey, { orders: orders });
    }

    sendWelcomeEmail({
      toEmail:   email,
      toName:    email.split('@')[0],
      toolName:  tool.name,
      toolIcon:  tool.icon,
      tempPwd:   isNewUser ? tempPassword : '(use your existing password for this product)',
      loginUrl:  getAbsoluteUrl(tool.loginUrl),
      orderRef:  orderRef || '',
      isNewUser: isNewUser,
    });

    return { success: true, isNewUser: isNewUser };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EMAIL SENDING  (EmailJS)
     ═══════════════════════════════════════════════════════════════════════ */

  function loadEmailJS(cb) {
    if (window.emailjs) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
    s.onload = function () {
      try { window.emailjs.init(EMAILJS_CONFIG.publicKey); } catch(e) {}
      cb();
    };
    s.onerror = function () {
      console.warn('[OliAuth] EmailJS load failed. Set up EmailJS to enable automatic emails.');
    };
    document.head.appendChild(s);
  }

  function sendWelcomeEmail(params) {
    if (EMAILJS_CONFIG.publicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
      console.log('[OliAuth] DEMO — welcome email would send:', params);
      return;
    }
    loadEmailJS(function () {
      window.emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.welcomeTemplate, {
        to_email:       params.toEmail,
        to_name:        params.toName,
        tool_name:      params.toolName,
        tool_icon:      params.toolIcon || '💎',
        temp_password:  params.tempPwd,
        login_url:      params.loginUrl,
        order_ref:      params.orderRef,
        is_new_user:    params.isNewUser ? 'yes' : 'no',
        support_email:  'workitlikeapr01@gmail.com',
      }).then(function () {
        console.log('[OliAuth] Welcome email sent to', params.toEmail);
      }).catch(function (err) {
        console.error('[OliAuth] Welcome email error:', err);
      });
    });
  }

  function sendRenewalReminderEmail(email, toolKey, renewalDate, amount) {
    var tool = TOOLS[toolKey] || { name: toolKey, icon: '💎' };
    var user = getUser(email, toolKey);
    if (!user) return;
    if (EMAILJS_CONFIG.publicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
      console.log('[OliAuth] DEMO — renewal reminder would send to', email, 'for', tool.name);
      return;
    }
    loadEmailJS(function () {
      window.emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.renewalTemplate, {
        to_email:     email,
        to_name:      user.name || email.split('@')[0],
        tool_name:    tool.name,
        tool_icon:    tool.icon || '💎',
        renewal_date: renewalDate,
        amount:       amount,
        cancel_url:   'https://www.paypal.com/myaccount/autopay/',
        login_url:    getAbsoluteUrl(tool.loginUrl),
        support_email:'workitlikeapr01@gmail.com',
      });
    });
  }

  function sendPasswordResetEmail(email, toolKey, resetUrl) {
    var tool = TOOLS[toolKey] || { name: 'Oli Tools', icon: '💎' };
    var user = getUser(email, toolKey);
    if (!user) return;
    if (EMAILJS_CONFIG.publicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
      console.log('[OliAuth] DEMO — password reset link:', resetUrl);
      return;
    }
    loadEmailJS(function () {
      window.emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.resetTemplate, {
        to_email:      email,
        to_name:       user.name || email.split('@')[0],
        tool_name:     tool.name,
        reset_url:     resetUrl,
        support_email: 'workitlikeapr01@gmail.com',
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SESSION MANAGEMENT  (per-tool scoped session)
     ═══════════════════════════════════════════════════════════════════════ */

  function getSession(toolKey) {
    try { return JSON.parse(sessionStorage.getItem(sessionKey(toolKey)) || 'null'); }
    catch (e) { return null; }
  }

  function setSession(email, toolKey) {
    var user = getUser(email, toolKey);
    if (!user) return false;
    sessionStorage.setItem(sessionKey(toolKey), JSON.stringify({
      email:   email,
      toolKey: toolKey,
      name:    user.name,
      loginAt: Date.now(),
    }));
    return true;
  }

  function clearSession(toolKey) {
    sessionStorage.removeItem(sessionKey(toolKey));
  }

  function isLoggedIn(toolKey) {
    var s = getSession(toolKey);
    if (!s) return false;
    if (Date.now() - s.loginAt > 8 * 60 * 60 * 1000) { clearSession(toolKey); return false; }
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LOGIN / LOGOUT
     ═══════════════════════════════════════════════════════════════════════ */

  function login(email, password, toolKey) {
    var user = getUser(email, toolKey);
    if (!user) return { ok: false, error: 'No ' + (TOOLS[toolKey]||{name:'tool'}).name + ' account found for that email.' };
    if (!checkPassword(password, user.passwordHash, toolKey)) return { ok: false, error: 'Incorrect password.' };
    setSession(email, toolKey);
    return { ok: true, user: user, mustChangePassword: !!user.mustChangePassword };
  }

  function logout(toolKey, redirectUrl) {
    clearSession(toolKey);
    var tool = TOOLS[toolKey];
    window.location.href = redirectUrl || (tool ? tool.loginUrl : '/');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PAGE GUARD
     Call at top of any page that requires login for a specific tool.
     OliAuth.requireLogin('oliops') — redirects to /oliops/login/ if not authed.
     ═══════════════════════════════════════════════════════════════════════ */

  function requireLogin(toolKey) {
    if (!isLoggedIn(toolKey)) {
      var tool = TOOLS[toolKey];
      var loginPath = tool ? tool.loginUrl : '/login/';
      /* Build relative path from current location */
      loginPath = toRelative(loginPath);
      var redirect = encodeURIComponent(window.location.href);
      window.location.href = loginPath + '?redirect=' + redirect;
      return false;
    }
    return getSession(toolKey);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PASSWORD CHANGE / RESET
     ═══════════════════════════════════════════════════════════════════════ */

  function changePassword(email, toolKey, currentPassword, newPassword) {
    var user = getUser(email, toolKey);
    if (!user) return { ok: false, error: 'Account not found.' };
    if (!checkPassword(currentPassword, user.passwordHash, toolKey)) return { ok: false, error: 'Current password is incorrect.' };
    if (newPassword.length < 8) return { ok: false, error: 'New password must be at least 8 characters.' };
    updateUser(email, toolKey, { passwordHash: hashPassword(newPassword, toolKey), mustChangePassword: false });
    return { ok: true };
  }

  function requestPasswordReset(email, toolKey) {
    var user = getUser(email, toolKey);
    /* Always return ok=true — don't reveal whether email exists */
    if (!user) return { ok: true };
    var token    = Math.random().toString(36).slice(2) + Date.now().toString(36);
    var expiry   = Date.now() + 60 * 60 * 1000; /* 1 hour */
    updateUser(email, toolKey, { resetToken: token, resetTokenExp: expiry });
    var tool     = TOOLS[toolKey] || {};
    var loginPath = tool.loginUrl || '/login/';
    var resetUrl  = window.location.origin
      + (loginPath.replace(/\/$/, ''))
      + '/?reset=' + token + '&email=' + encodeURIComponent(email);
    sendPasswordResetEmail(email, toolKey, resetUrl);
    return { ok: true };
  }

  function resetPasswordWithToken(email, toolKey, token, newPassword) {
    var user = getUser(email, toolKey);
    if (!user || user.resetToken !== token) return { ok: false, error: 'Invalid or expired reset link.' };
    if (Date.now() > user.resetTokenExp) return { ok: false, error: 'Reset link has expired. Please request a new one.' };
    if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    updateUser(email, toolKey, {
      passwordHash:       hashPassword(newPassword, toolKey),
      resetToken:         null,
      resetTokenExp:      null,
      mustChangePassword: false,
    });
    return { ok: true };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     FORCE PASSWORD CHANGE (for first-time logins with temp password)
     ═══════════════════════════════════════════════════════════════════════ */

  function setFirstPassword(email, toolKey, tempPassword, newPassword) {
    var user = getUser(email, toolKey);
    if (!user) return { ok: false, error: 'Account not found.' };
    /* For first-time, we verify temp password normally */
    if (!checkPassword(tempPassword, user.passwordHash, toolKey)) return { ok: false, error: 'Temporary password is incorrect.' };
    if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    updateUser(email, toolKey, {
      passwordHash:       hashPassword(newPassword, toolKey),
      mustChangePassword: false,
    });
    return { ok: true };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     URL HELPERS
     ═══════════════════════════════════════════════════════════════════════ */

  function getAbsoluteUrl(path) {
    if (!path) return window.location.origin;
    if (path.startsWith('http')) return path;
    return window.location.origin + path;
  }

  function toRelative(absolutePath) {
    /* Convert /oliops/login/ to ../../oliops/login/ from current page depth */
    if (!absolutePath || absolutePath.startsWith('http')) return absolutePath;
    var currentParts = window.location.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    var depth        = Math.max(0, currentParts.length - 1);
    if (depth === 0) return '.' + absolutePath;
    return Array(depth).fill('..').join('/') + absolutePath;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PayPal SDK helpers
     ═══════════════════════════════════════════════════════════════════════ */

  function detectToolKey() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('olisalestrack')) return 'olisalestrack';
    if (path.includes('olicommerce'))   return 'olicommerce';
    if (path.includes('oliflow'))       return 'oliflow';
    if (path.includes('oliops'))        return 'oliops';
    if (path.includes('oli-locator'))   return 'oli-locator';
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════════════ */

  window.OliAuth = {
    /* Account lifecycle */
    createAccount:            createAccount,
    login:                    login,
    logout:                   logout,
    requireLogin:             requireLogin,
    isLoggedIn:               isLoggedIn,
    getSession:               getSession,
    /* Password management */
    changePassword:           changePassword,
    setFirstPassword:         setFirstPassword,
    requestPasswordReset:     requestPasswordReset,
    resetPasswordWithToken:   resetPasswordWithToken,
    /* Email */
    sendRenewalReminderEmail: sendRenewalReminderEmail,
    /* Data access */
    getUser:                  function(email, toolKey) { return getUser(email, toolKey); },
    updateUser:               function(email, toolKey, patch) { return updateUser(email, toolKey, patch); },
    /* Tool info */
    getToolInfo:              function(key) { return TOOLS[key] || null; },
    getAllTools:               function() { return TOOLS; },
    detectToolKey:            detectToolKey,
    /* URL helpers */
    toRelative:               toRelative,
    getAbsoluteUrl:           getAbsoluteUrl,
    /* Config */
    _emailjsConfig: EMAILJS_CONFIG,
  };

})();

# EmailJS Templates — WorkItLikeAPro (copy-paste ready)

This is the missing template copy that `shared/auth.js`, `PAYMENTS-SETUP.md`,
and `README.md` all referenced but never actually contained — that's why
there was nothing to copy for `oli_renewal`. All 3 templates below use the
**exact variable names** the code already sends, so once you paste these in,
everything works with zero code changes.

---

## Before you start: how EmailJS templates actually work (the part that trips people up)

EmailJS does **not** have a gallery of pre-made templates for things like
"renewal reminder" — every template is something you build yourself from a
blank editor. That's the confusion you hit: there's no "renewal" template to
find, you just click **Create New Template** and paste the content below in,
the same way you did for `oli_welcome` and `oli_reset`.

For **each** of the 3 templates:
1. EmailJS Dashboard → **Email Templates** → **Create New Template**
2. **Settings tab** (top of the editor) → set the **Template Name** to the
   exact name below (`oli_welcome`, `oli_renewal`, or `oli_reset`) — this is
   what `shared/auth.js` looks for
3. In the **"To Email"** field near the top, type `{{to_email}}` — this is
   the #1 most commonly missed step, and without it your emails will not go
   to the customer (some accounts default this to your own inbox instead)
4. **Subject** field → paste the subject line given below
5. **Content** tab → switch to the code/HTML view (usually a `</>` icon or
   "Edit content as HTML" toggle) → paste the HTML block given below
6. Click **Save**
7. Repeat for the other two templates

---

## Template 1 — `oli_welcome` (you already have this — verify it matches)

**Subject:**
```
🎉 Your {{tool_name}} login is ready — WorkItLikeAPro
```

**Content (HTML):**
```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;background:#f4f4f8;padding:32px 16px;">
  <div style="background:#ffffff;border-radius:16px;padding:36px 32px;border:1px solid #e7e9ee;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#6C47FF,#FF6B6B);font-size:26px;margin-bottom:14px;">{{tool_icon}}</div>
      <h1 style="font-size:22px;font-weight:800;color:#14161a;margin:0;">Welcome to {{tool_name}}</h1>
      <p style="color:#55606e;font-size:14px;margin-top:6px;">by WorkItLikeAPro</p>
    </div>

    <p style="color:#33363c;font-size:15px;line-height:1.6;">Hi {{to_name}},</p>
    <p style="color:#33363c;font-size:15px;line-height:1.6;">
      Thanks for subscribing to <strong>{{tool_name}}</strong>! Your account is ready.
      Here's your temporary password — you'll be asked to set your own on first login.
    </p>

    <div style="background:#f4f4f8;border-radius:10px;padding:16px 20px;margin:22px 0;text-align:center;">
      <div style="font-size:12px;color:#55606e;text-transform:uppercase;letter-spacing:.04em;font-weight:700;margin-bottom:6px;">Temporary Password</div>
      <div style="font-family:ui-monospace,monospace;font-size:18px;font-weight:700;color:#14161a;">{{temp_password}}</div>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="{{login_url}}" style="display:inline-block;background:linear-gradient(135deg,#6C47FF,#FF6B6B);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;">
        Sign In to {{tool_name}} →
      </a>
    </div>

    <p style="color:#55606e;font-size:13px;line-height:1.6;">
      Order reference: <code style="background:#f4f4f8;padding:2px 6px;border-radius:4px;">{{order_ref}}</code>
    </p>

    <hr style="border:none;border-top:1px solid #e7e9ee;margin:28px 0;">
    <p style="color:#8b93a3;font-size:12.5px;line-height:1.6;text-align:center;">
      Questions? Reply to this email or contact <a href="mailto:{{support_email}}" style="color:#6C47FF;">{{support_email}}</a><br>
      © 2026 WorkItLikeAPro — All Rights Reserved
    </p>
  </div>
</div>
```

---

## Template 2 — `oli_renewal` (the one you couldn't find — here it is)

**Subject:**
```
⏰ Your {{tool_name}} plan renews in 2 days — {{amount}}
```

**Content (HTML):**
```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;background:#f4f4f8;padding:32px 16px;">
  <div style="background:#ffffff;border-radius:16px;padding:36px 32px;border:1px solid #e7e9ee;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#6C47FF,#FF6B6B);font-size:26px;margin-bottom:14px;">{{tool_icon}}</div>
      <h1 style="font-size:22px;font-weight:800;color:#14161a;margin:0;">Upcoming renewal</h1>
      <p style="color:#55606e;font-size:14px;margin-top:6px;">{{tool_name}} · WorkItLikeAPro</p>
    </div>

    <p style="color:#33363c;font-size:15px;line-height:1.6;">Hi {{to_name}},</p>
    <p style="color:#33363c;font-size:15px;line-height:1.6;">
      Just a heads up — your <strong>{{tool_name}}</strong> subscription will renew
      automatically on <strong>{{renewal_date}}</strong> for <strong>{{amount}}</strong>.
      No action is needed if you'd like to continue.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="{{login_url}}" style="display:inline-block;background:linear-gradient(135deg,#6C47FF,#FF6B6B);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;margin-bottom:10px;">
        Open {{tool_name}} →
      </a>
    </div>

    <p style="color:#55606e;font-size:13.5px;line-height:1.6;text-align:center;">
      Want to cancel or change plans instead?
      <a href="{{cancel_url}}" style="color:#6C47FF;font-weight:600;">Manage your subscription →</a>
    </p>

    <hr style="border:none;border-top:1px solid #e7e9ee;margin:28px 0;">
    <p style="color:#8b93a3;font-size:12.5px;line-height:1.6;text-align:center;">
      Questions about this charge? Reply to this email or contact <a href="mailto:{{support_email}}" style="color:#6C47FF;">{{support_email}}</a><br>
      © 2026 WorkItLikeAPro — All Rights Reserved
    </p>
  </div>
</div>
```

---

## Template 3 — `oli_reset` (you already have this — verify it matches)

**Subject:**
```
🔑 Reset your {{tool_name}} password
```

**Content (HTML):**
```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;background:#f4f4f8;padding:32px 16px;">
  <div style="background:#ffffff;border-radius:16px;padding:36px 32px;border:1px solid #e7e9ee;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#6C47FF,#FF6B6B);font-size:26px;margin-bottom:14px;">🔑</div>
      <h1 style="font-size:22px;font-weight:800;color:#14161a;margin:0;">Password reset requested</h1>
      <p style="color:#55606e;font-size:14px;margin-top:6px;">{{tool_name}} · WorkItLikeAPro</p>
    </div>

    <p style="color:#33363c;font-size:15px;line-height:1.6;">Hi {{to_name}},</p>
    <p style="color:#33363c;font-size:15px;line-height:1.6;">
      We received a request to reset your <strong>{{tool_name}}</strong> password.
      Click below to choose a new one. This link expires in 1 hour.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="{{reset_url}}" style="display:inline-block;background:linear-gradient(135deg,#6C47FF,#FF6B6B);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;">
        Reset My Password →
      </a>
    </div>

    <p style="color:#55606e;font-size:13px;line-height:1.6;">
      If you didn't request this, you can safely ignore this email — your
      password will not change unless you click the link above.
    </p>

    <hr style="border:none;border-top:1px solid #e7e9ee;margin:28px 0;">
    <p style="color:#8b93a3;font-size:12.5px;line-height:1.6;text-align:center;">
      Questions? Reply to this email or contact <a href="mailto:{{support_email}}" style="color:#6C47FF;">{{support_email}}</a><br>
      © 2026 WorkItLikeAPro — All Rights Reserved
    </p>
  </div>
</div>
```

---

## After creating all 3 templates

1. EmailJS Dashboard → **Account** → **General** → copy your **Public Key**
2. EmailJS Dashboard → **Email Services** → copy your **Service ID** (the Gmail service you connected)
3. Send both values to me (or paste them directly into `shared/auth.js` lines 28-29 yourself):
   ```js
   var EMAILJS_CONFIG = {
     publicKey:       'paste_your_public_key_here',
     serviceId:       'paste_your_service_id_here',
     welcomeTemplate: 'oli_welcome',
     renewalTemplate: 'oli_renewal',
     resetTemplate:   'oli_reset',
   };
   ```

## Testing each template before going live

EmailJS Dashboard → open each template → **Test It** button → fill in sample
values for every `{{variable}}` shown (e.g. `to_email: your-own-email@gmail.com`,
`tool_name: OliOps Suite`, `amount: $39.00`) → Send Test Email → confirm it
arrives and looks correct in your own inbox before relying on it for real
customers.

## Automating when `oli_renewal` actually fires

Creating the template is step 1 — it doesn't send itself on a schedule.
`shared/auth.js` has a function ready to call
(`OliAuth.sendRenewalReminderEmail(email, toolKey, renewalDate, amount)`),
but something needs to actually call it 2-3 days before each renewal. See
**Part 4 of `PAYMENTS-SETUP.md`** for the two free ways to trigger it
automatically (a Zapier schedule watching PayPal, or a PayPal webhook) —
this only becomes relevant once you have real PayPal subscriptions running
(Stripe's own automatic renewal emails are separate and already handled by
Stripe itself, no template needed on your side for Stripe renewals).

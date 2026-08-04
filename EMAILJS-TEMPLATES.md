# EmailJS Templates — WorkItLikeAPro (copy-paste ready)

**Updated:** the free EmailJS plan caps you at **2 templates total**. If
you already hit "You have reached your subscription limit," you do NOT
need to upgrade — `shared/auth.js` has been updated to only need 2
templates instead of 3. Password resets and renewal reminders now share
one generic template (`oli_notice`) instead of needing their own.

You need exactly:
1. `oli_welcome` — you already made this one, keep it as-is
2. `oli_notice` — a NEW generic template that replaces both `oli_reset`
   and the `oli_renewal` you couldn't create. If you already built
   `oli_reset`, you can either rename it to `oli_notice` and update its
   content to the generic version below, or just create a fresh
   `oli_notice` template and delete the old `oli_reset` one to stay
   under the 2-template cap.

---

## Before you start: how EmailJS templates actually work

EmailJS does **not** have a gallery of pre-made templates for things like
"renewal reminder" — every template is something you build yourself from a
blank editor, and you're only given 2 template slots on the free plan.
That's exactly why `oli_renewal` couldn't be created as a 3rd template —
the fix isn't to find a hidden template, it's to make one template do
double duty, which is what `oli_notice` below does.

For **each** template:
1. EmailJS Dashboard → **Email Templates** → **Create New Template**
2. **Settings tab** → set the **Template Name** to the exact name below
3. In the **"To Email"** field near the top, type `{{to_email}}` — this is
   the #1 most commonly missed step. Without it, emails go to your own
   inbox instead of the customer's. Double check this on your existing
   `oli_welcome` template too.
4. **Subject** field → paste the subject line given below
5. **Content** tab → switch to the code/HTML view → paste the HTML block
6. Click **Save**

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

## Template 2 — `oli_notice` (NEW — replaces both oli_reset and oli_renewal)

This ONE template is now used for both password resets and renewal
reminders. `shared/auth.js` fills in a different `{{heading}}`,
`{{message}}`, and button text depending on which one it's sending — the
template itself never needs to know which case it's rendering.

**Subject:**
```
{{heading}} — {{tool_name}}
```

**Content (HTML):**
```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;background:#f4f4f8;padding:32px 16px;">
  <div style="background:#ffffff;border-radius:16px;padding:36px 32px;border:1px solid #e7e9ee;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#6C47FF,#FF6B6B);font-size:26px;margin-bottom:14px;">{{tool_icon}}</div>
      <h1 style="font-size:22px;font-weight:800;color:#14161a;margin:0;">{{heading}}</h1>
      <p style="color:#55606e;font-size:14px;margin-top:6px;">{{tool_name}} · WorkItLikeAPro</p>
    </div>

    <p style="color:#33363c;font-size:15px;line-height:1.6;">Hi {{to_name}},</p>
    <p style="color:#33363c;font-size:15px;line-height:1.6;">{{message}}</p>

    <div style="text-align:center;margin:28px 0;">
      <a href="{{button_url}}" style="display:inline-block;background:linear-gradient(135deg,#6C47FF,#FF6B6B);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;">
        {{button_label}} →
      </a>
    </div>

    <p style="color:#55606e;font-size:13.5px;line-height:1.6;text-align:center;">
      {{secondary_text}}
      <a href="{{secondary_url}}" style="color:#6C47FF;font-weight:600;">{{secondary_text}}</a>
    </p>

    <hr style="border:none;border-top:1px solid #e7e9ee;margin:28px 0;">
    <p style="color:#8b93a3;font-size:12.5px;line-height:1.6;text-align:center;">
      Questions? Reply to this email or contact <a href="mailto:{{support_email}}" style="color:#6C47FF;">{{support_email}}</a><br>
      © 2026 WorkItLikeAPro — All Rights Reserved
    </p>
  </div>
</div>
```

**Note on the "secondary" line:** for password resets, `secondary_text`/
`secondary_url` are sent as empty strings — EmailJS will just render an
empty link with no visible text, which is harmless but if you want it
fully invisible when unused, wrap that paragraph in an EmailJS
`{{#if secondary_text}}...{{/if}}` conditional block (EmailJS supports
basic Handlebars-style conditionals) instead of the plain version above.
The plain version works fine either way — it's a cosmetic nicety, not a
functional issue.

---

## After creating both templates

Your real EmailJS credentials have already been added to
`shared/auth.js` for you:
```js
var EMAILJS_CONFIG = {
  publicKey:       'r1WYwtu1o0GcuP811',
  serviceId:       'workitlikeapr01',
  welcomeTemplate: 'oli_welcome',
  noticeTemplate:  'oli_notice',
};
```
Nothing left to paste in on the code side — once both templates exist in
your EmailJS dashboard with those exact names, emails will actually send.

## Testing before going live

EmailJS Dashboard → open each template → **Test It** button → fill in
sample values for every `{{variable}}` shown, for example:
- `oli_welcome` test: `to_email: you@gmail.com`, `tool_name: OliOps Suite`, `temp_password: Test1234`, `login_url: https://olielicz.github.io/marketing/oliops/login/`
- `oli_notice` test (as a renewal): `heading: Upcoming renewal`, `message: Your OliOps Suite subscription renews on Aug 20 for $39.00.`, `button_label: Open OliOps Suite`, `button_url: https://olielicz.github.io/marketing/oliops/login/`
- `oli_notice` test (as a reset): `heading: Password reset requested`, `message: Click below to reset your password.`, `button_label: Reset My Password`, `button_url: https://example.com/reset?token=abc`

Send each test to your own inbox and confirm it looks right before
relying on it for real customers.

## Automating when renewal reminders actually fire

Creating the template is step 1 — it doesn't send itself on a schedule.
`shared/auth.js` has a function ready to call
(`OliAuth.sendRenewalReminderEmail(email, toolKey, renewalDate, amount)`),
but something needs to actually call it 2-3 days before each renewal. See
**Part 4 of `PAYMENTS-SETUP.md`** for the two free ways to trigger it
automatically (a Zapier schedule watching PayPal, or a PayPal webhook) —
this only becomes relevant once you have real PayPal subscriptions
running (Stripe's own automatic renewal emails are separate and already
handled by Stripe itself, no template needed on your side for Stripe
renewals).

# 5-Email Brevo Nurture Sequence — OliCommerce Stack

**Setup in Brevo:** Contacts → Automation → new workflow triggered by "Contact added to list: OliCommerce Waitlist."

---

## Email 1 — Welcome (immediate)

**Subject options:**
- A: "You're on the list — here's what OliCommerce Stack does"
- B: "Welcome! Here's how we recover your abandoned carts"

**Body:**

Hey {{contact.FIRSTNAME|default:"there"}},

Thanks for joining the OliCommerce Stack waitlist.

Quick recap: **automated abandoned-cart recovery, order emails, supplier CSV forwarding, and an AI shopping assistant** for your Shopify store — one-time payment, not another monthly app-store subscription.

What happens next:
- Launch-day pricing before anyone else ($59 lifetime, goes up after the first 50 buyers)
- A couple of short emails showing exactly how the cart-recovery flow works
- No spam

Reply if you want a private demo before launch.

— olielicz

---

## Email 2 — Problem/agitate (Day 2)

**Subject options:**
- A: "You're probably losing more revenue than you think to cart abandonment"
- B: "The math on abandoned carts is worse than most store owners realize"

**Body:**

Cart abandonment rates across e-commerce sit around 70% industry-wide. If your store gets 1,000 checkout starts a month and even a fraction of those abandoned carts could be recovered with a timely follow-up, that's real revenue sitting on the table every single month.

Most small stores don't have cart-recovery automation because the tools that do it well are yet another monthly app-store subscription stacked on top of Shopify's own fees.

OliCommerce Stack: **$59 once**, not another monthly line item.

More on exactly how the recovery flow works in the next email.

— olielicz

---

## Email 3 — How it works / proof (Day 5)

**Subject options:**
- A: "Here's exactly how cart recovery works"
- B: "A look inside OliCommerce Stack"

**Body:**

What's inside the $59 lifetime bundle:

**🛍 Abandoned cart recovery** — automatic, timed follow-up when a checkout starts but isn't completed
**📧 Order automation** — thank-you emails triggered directly off Shopify's order-paid webhook
**📦 Supplier CSV forwarding** — order details auto-forwarded to your supplier, zero manual work
**🤖 AI shopping assistant** — a chat widget that helps customers find products and answers questions, 24/7

[Watch the setup walkthrough →]

Plugs into your existing Shopify store via standard webhooks — no theme changes, no migration.

Questions? Reply — I read everything.

— olielicz

---

## Email 4 — Objection handling (Day 9, launch day)

**Subject options:**
- A: "We're live on Product Hunt today 🚀"
- B: "\"Does this work with my theme?\" (yes) + we're live today"

**Body:**

Two things:

**1. We're live on Product Hunt right now** → [link]
Today's launch pricing ($59 lifetime) is the best it'll ever be.

**2. Most common question: "Will this work with my store?"**
Yes — it hooks into Shopify's standard webhooks, so no theme changes or migration needed. Works alongside whatever theme/apps you already have.

Other FAQs:
- *"What if it's not for me?"* — 30-day money-back guarantee.
- *"Is there ongoing cost?"* — Only if you choose managed hosting ($15/mo); self-hosting is free forever.

An upvote/comment on Product Hunt today genuinely helps → [link]

— olielicz

---

## Email 5 — Urgency/close (Day 12, or adjust to real scarcity)

**Subject options:**
- A: "Launch pricing ends soon"
- B: "Last call on $59 lifetime pricing"

**Body:**

⚠️ Only send if scarcity is real — never fabricate a countdown.

Quick update: launch pricing has been live a few days. Once the first 50 lifetime seats are gone, price goes up.

If you've been meaning to grab it: [Get lifetime access — $59 →]

If it's not the right fit right now, no worries — I'll keep you posted without spamming your inbox.

— olielicz

---

## Brevo setup notes

1. Contacts → Lists → create "OliCommerce Waitlist"
2. Automation → Create workflow → Trigger: "Contact added to list" → OliCommerce Waitlist
3. Delays: Email 1 = immediate, Email 2 = +2 days, Email 3 = +5 days, Email 4 = +9 days (align to actual PH launch date, Day 23 in master calendar), Email 5 = +12 days
4. A/B test subject lines on Emails 1 and 2

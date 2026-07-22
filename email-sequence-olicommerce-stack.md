# 5-Email Brevo Nurture Sequence — OliCommerce Stack

**Setup in Brevo:** Contacts → Automation → new workflow triggered by "Contact added to list: OliCommerce Waitlist."

**Pricing note:** OliCommerce Stack is a $119/year annual subscription (introductory price for the first 100 subscribers), licensed for up to 5 devices per serial code — not a lifetime one-time deal. All copy below reflects that.

---

## Email 1 — Welcome (immediate)

**Subject options:**
- A: "You're on the list — here's what OliCommerce Stack does"
- B: "Welcome! Here's how we recover your abandoned carts"

**Body:**

Hey {{contact.FIRSTNAME|default:"there"}},

Thanks for joining the OliCommerce Stack waitlist.

Quick recap: **automated abandoned-cart recovery, order emails, supplier CSV forwarding, and an AI shopping assistant** for your Shopify store — one simple annual subscription, not another monthly app-store bill.

What happens next:
- Introductory pricing before anyone else ($119/year, goes up after the first 100 subscribers)
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

Most small stores don't have cart-recovery automation because the tools that do it well are yet another monthly app-store subscription stacked on top of Shopify's own fees — often $240-480/year for cart recovery alone.

OliCommerce Stack: **$119/year**, covering both cart recovery and an AI shopping assistant.

More on exactly how the recovery flow works in the next email.

— olielicz

---

## Email 3 — How it works / proof (Day 5)

**Subject options:**
- A: "Here's exactly how cart recovery works"
- B: "A look inside OliCommerce Stack"

**Body:**

What's inside the $119/year subscription:

**🛍 Abandoned cart recovery** — automatic, timed follow-up when a checkout starts but isn't completed
**📧 Order automation** — thank-you emails triggered directly off Shopify's order-paid webhook
**📦 Supplier CSV forwarding** — order details auto-forwarded to your supplier, zero manual work
**🤖 AI shopping assistant** — a chat widget that helps customers find products and answers questions, 24/7

[Watch the setup walkthrough →]

Plugs into your existing Shopify store via standard webhooks — no theme changes, no migration. Self-hosted, license valid on up to 5 devices.

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
Today's introductory pricing ($119/year) is the best it'll ever be.

**2. Most common question: "Will this work with my store?"**
Yes — it hooks into Shopify's standard webhooks, so no theme changes or migration needed. Works alongside whatever theme/apps you already have.

Other FAQs:
- *"What if it's not for me?"* — 30-day money-back guarantee.
- *"How many devices can I use it on?"* — Up to 5, on one serial code. Free up a slot anytime by deactivating an old device.

An upvote/comment on Product Hunt today genuinely helps → [link]

— olielicz

---

## Email 5 — Urgency/close (Day 12, or adjust to real scarcity)

**Subject options:**
- A: "Introductory pricing ends soon"
- B: "Last call on $119/year introductory pricing"

**Body:**

⚠️ Only send if scarcity is real — never fabricate a countdown.

Quick update: introductory pricing has been live a few days. Once the first 100 subscriber seats are gone, price goes up.

If you've been meaning to grab it: [Start annual subscription — $119/year →]

If it's not the right fit right now, no worries — I'll keep you posted without spamming your inbox.

— olielicz

---

## Brevo setup notes

1. Contacts → Lists → create "OliCommerce Waitlist"
2. Automation → Create workflow → Trigger: "Contact added to list" → OliCommerce Waitlist
3. Delays: Email 1 = immediate, Email 2 = +2 days, Email 3 = +5 days, Email 4 = +9 days (align to actual PH launch date, Day 23 in master calendar), Email 5 = +12 days
4. A/B test subject lines on Emails 1 and 2

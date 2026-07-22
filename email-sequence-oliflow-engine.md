# 5-Email Brevo Nurture Sequence — OliFlow Automation Engine

**Setup in Brevo:** Contacts → Automation → new workflow triggered by "Contact added to list: OliFlow Waitlist."

**Pricing note:** OliFlow Engine is a $129/year annual subscription (introductory price for the first 100 subscribers), licensed for up to 5 devices per serial code — not a lifetime one-time deal. All copy below reflects that.

---

## Email 1 — Welcome (immediate)

**Subject options:**
- A: "You're on the list — here's what OliFlow actually does"
- B: "Welcome! Here's your self-hosted automation engine, explained"

**Body:**

Hey {{contact.FIRSTNAME|default:"there"}},

Thanks for joining the OliFlow waitlist.

Quick recap: **a self-hosted visual workflow automation engine** — trigger it via webhooks, embed it in your site, or run it headless via REST API. One flat annual subscription, no per-task metering, ever.

What happens next:
- Introductory pricing before anyone else ($129/year, goes up after the first 100 subscribers)
- A couple of short emails showing exactly how it compares to Zapier/Make
- No spam

Reply if you want a private demo before launch.

— olielicz

---

## Email 2 — Problem/agitate (Day 2)

**Subject options:**
- A: "What is your Zapier/Make bill actually costing you?"
- B: "Per-task pricing punishes you for actually using the tool"

**Body:**

If you're running enough automations to matter, you're probably paying $20–70/month on Zapier or Make — that's $240-828+/year — and that bill scales with usage, not value. The workflow logic is essentially the same every month; you're just paying more for running it more.

OliFlow: **$129/year flat**, self-hosted, unlimited runs, no metering, licensed for up to 5 devices.

More on what's actually included in the next email.

— olielicz

---

## Email 3 — How it works / proof (Day 5)

**Subject options:**
- A: "Here's exactly what's inside OliFlow"
- B: "A 60-second look at the visual builder"

**Body:**

What's inside the $129/year subscription:

**🎨 Visual workflow builder** — drag-and-drop, no code required
**🔌 Webhook triggers** — connect any CRM/SaaS that can send a webhook
**🧩 Headless REST API** — or skip the UI and run it programmatically
**📄 Prebuilt template pack** — ready-to-import n8n workflows, Make blueprints, Zapier-style configs, plus 7 CRM adapters

[Watch the 2-minute build-a-workflow demo →]

Self-hosted, zero external dependencies to run the core engine — your workflow data and credentials never leave your own infrastructure. One serial code activates up to 5 devices.

Questions? Reply — I read everything.

— olielicz

---

## Email 4 — Objection handling (Day 16, launch day)

**Subject options:**
- A: "We're live on Product Hunt today 🚀"
- B: "\"Can this replace my Zapier workflows?\" (probably) + we're live today"

**Body:**

Two things:

**1. We're live on Product Hunt right now** → [link]
Today's introductory pricing ($129/year) is the best it'll ever be.

**2. Most common question: "Can this replace my existing automations?"**
For most standard trigger→action patterns, yes — the template pack covers common cases out of the box. Reply with what you're currently automating and I'll tell you honestly if OliFlow handles it today.

Other FAQs:
- *"Do I need to self-host?"* — That's the point of owning the infrastructure, but we can point you to cheap hosting options if you'd rather not manage a server yourself.
- *"What if it's not for me?"* — 30-day money-back guarantee.

An upvote/comment on Product Hunt today genuinely helps → [link]

— olielicz

---

## Email 5 — Urgency/close (Day 19, or adjust to real scarcity)

**Subject options:**
- A: "Introductory pricing ends soon"
- B: "Last call on $129/year introductory pricing"

**Body:**

⚠️ Only send if scarcity is real — never fabricate a countdown.

Quick update: introductory pricing has been live a few days. Once the first 100 subscriber seats are gone, price goes up.

If you've been meaning to grab it: [Start annual subscription — $129/year →]

If it's not the right fit right now, no worries — I'll keep you posted without spamming your inbox.

— olielicz

---

## Brevo setup notes

1. Contacts → Lists → create "OliFlow Waitlist"
2. Automation → Create workflow → Trigger: "Contact added to list" → OliFlow Waitlist
3. Delays: Email 1 = immediate, Email 2 = +2 days, Email 3 = +5 days, Email 4 = +9 days (align to actual PH launch date, Day 16 in master calendar), Email 5 = +12 days
4. A/B test subject lines on Emails 1 and 2

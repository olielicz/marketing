# 5-Email Brevo Nurture Sequence — OliConnect

**Setup in Brevo:** Contacts → Automation → new workflow triggered by "Contact added to list: OliConnect Waitlist."

**Note:** OliConnect's primary acquisition channel is direct outreach + community posts (see `outreach-oliconnect.md`), not a Product Hunt launch. This sequence still applies to anyone who signs up via the landing page waitlist regardless of how they found it — swap Email 4's "we're live on PH" framing for whatever channel is actually driving signups (a Reddit post, a cold email reply, etc.) if you don't end up running the optional PH launch.

**Pricing note:** OliConnect is a monthly/yearly subscription — Solo $19/mo ($168/yr), Agency $39/mo ($348/yr), Enterprise $79/mo ($708/yr) — licensed for up to 5 devices per serial code, cancel anytime. All copy below reflects that.

---

## Email 1 — Welcome (immediate)

**Subject options:**
- A: "You're on the list — here's what OliConnect does"
- B: "Welcome! Here's how we recycle your best posts"

**Body:**

Hey {{contact.FIRSTNAME|default:"there"}},

Thanks for joining the OliConnect waitlist.

Quick recap: **connect all your social accounts once, and OliConnect automatically finds your best-performing posts and recycles them across every platform.** One payment, not another social-media-tool bill.

What happens next:
- Launch pricing before anyone else — Solo plan from $19/mo (or $168/yr)
- A couple of short emails showing exactly how the recycling flow works
- No spam

Reply if you want a private demo.

— olielicz

---

## Email 2 — Problem/agitate (Day 2)

**Subject options:**
- A: "How much time do you spend re-writing the same caption 5 times?"
- B: "Your best post shouldn't live on only one platform"

**Body:**

If you manage social accounts across multiple platforms, you know the drill: a post does well on one platform, so you manually reformat and repost it everywhere else — resizing images, rewriting captions, tracking what's already been posted where.

That's hours a week of manual work for content you already know performs. Tools like MeetEdgar and SocialBee that automate this run $348-1,188/year, every year, forever.

OliConnect: connect once, and it handles the detection + recycling automatically. **From $19/mo ($168/yr)**, licensed for up to 5 devices.

More on exactly how it works in the next email.

— olielicz

---

## Email 3 — How it works / proof (Day 5)

**Subject options:**
- A: "Here's exactly how OliConnect recycles your posts"
- B: "A quick look inside OliConnect"

**Body:**

What's inside the Solo plan ($19/mo or $168/yr):

**🔗 Connect** — log into your social accounts once, inside the browser extension
**📊 Collect** — OliConnect identifies your best-performing posts across every connected account automatically
**♻️ Recycle** — top posts get reformatted and reposted across your other accounts

[Watch the demo →]

Your login credentials stay in your own browser session — OliConnect doesn't store your passwords server-side. One serial code activates up to 5 devices. Agencies managing more accounts can upgrade to the Agency ($39/mo) or Enterprise ($79/mo) plan anytime.

Questions? Reply — I read everything.

— olielicz

---

## Email 4 — Objection handling (Day 9)

**Subject options:**
- A: "Quick update on OliConnect + a common question answered"
- B: "\"Is this safe for my accounts?\" (yes) — here's why"

**Body:**

Most common question I get: **"is this safe for my accounts?"**

Yes — OliConnect works through your own logged-in browser session. It doesn't store your passwords on any server, and it doesn't post anything without your review settings enabling it.

Other FAQs:
- *"Which platforms are supported?"* — [fill in with actual supported platform list]
- *"What if it's not for me?"* — 30-day money-back guarantee.
- *"How many devices?"* — Up to 5 per license, one serial code.

Launch pricing is live for early signups, from $19/mo — [Subscribe now →]

— olielicz

---

## Email 5 — Urgency/close (Day 12, or adjust to real scarcity)

**Subject options:**
- A: "Launch pricing ends soon"
- B: "Last call on launch pricing"

**Body:**

⚠️ Only send if scarcity is real — never fabricate a countdown.

Quick update: launch pricing has been live a few days. Once the launch window closes, standard pricing applies going forward (still $19/mo Solo, $168/yr).

If you've been meaning to start: [Subscribe now — from $19/mo →]

If it's not the right fit right now, no worries — I'll keep you posted without spamming your inbox.

— olielicz

---

## Brevo setup notes

1. Contacts → Lists → create "OliConnect Waitlist"
2. Automation → Create workflow → Trigger: "Contact added to list" → OliConnect Waitlist
3. Delays: Email 1 = immediate, Email 2 = +2 days, Email 3 = +5 days, Email 4 = +9 days, Email 5 = +12 days
4. A/B test subject lines on Emails 1 and 2

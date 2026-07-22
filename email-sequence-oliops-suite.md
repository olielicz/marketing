# 5-Email Brevo Nurture Sequence — OliOps Suite

**Setup in Brevo:** Contacts → Automation → new workflow triggered by "Contact added to list: OliOps Waitlist." Add each email below as a step with the listed delay.

**Reusing for other lines:** copy this file, swap tool names/specifics, keep the structure (welcome → problem/agitate → proof → objection-handling → urgency).

**Pricing note:** OliOps Suite is a $299 one-time lifetime purchase (launch price for limited lifetime seats), licensed for up to 5 devices per serial code. All copy below reflects that.

---

## Email 1 — Welcome (immediate)

**Subject options:**
- A: "You're on the list — here's what OliOps Suite actually does"
- B: "Welcome! Quick look inside OliOps Suite 👋"

**Body:**

Hey {{contact.FIRSTNAME|default:"there"}},

Thanks for joining the OliOps Suite waitlist.

Quick recap: **one tool that replaces your CRM, invoicing/payroll, accounting, and customer-support chatbot** — for one payment instead of 4 separate monthly bills that never stop.

What happens next:
- You'll get launch pricing before anyone else ($299 one-time, limited lifetime seats)
- A couple of short emails over the next week showing exactly how it works
- No spam, no daily emails

Reply if you want a private demo link before we officially launch.

Talk soon,
olielicz

---

## Email 2 — Problem/agitate (Day 2)

**Subject options:**
- A: "The real cost of 'just one more SaaS tool'"
- B: "Why I stopped paying for 4 separate business tools"

**Body:**

Quick question: how many separate tools are you paying for to run client relationships, invoicing, and support?

Probably: a CRM ($20–50/mo), an invoicing/accounting tool ($15–40/mo), a help-desk tool ($20–60/mo). That's $55–150/month, forever — and none share data.

OliOps Suite is one connected tool: **$299 once**, not $660–1,800/year stacked across separate bills, every year, forever.

More on how the 3 pieces connect in the next email.

— olielicz

---

## Email 3 — How it works / proof (Day 5)

**Subject options:**
- A: "Here's exactly what's inside OliOps Suite"
- B: "A 60-second walkthrough of OliOps Suite"

**Body:**

What's inside the $299 lifetime purchase:

**🗂 CRM** — every client, deal, conversation in one dashboard
**💼 Back office** — invoicing (auto tax calc), payroll from logged hours, expenses, real P&L + tax report
**🤖 AI support router** — auto-resolves common questions, escalates the rest to a ticket

[Watch the 60-second demo →]

Self-hostable — your data stays on your own infrastructure. Your license activates on up to 5 devices with one serial code, forever, with no renewal. Or we host it for $19/mo if you'd rather not.

Questions? Reply — I read every response.

— olielicz

---

## Email 4 — Objection handling (Day 9, same day as PH launch)

**Subject options:**
- A: "We're live on Product Hunt today 🚀"
- B: "\"Is this really a one-time payment?\" + we're live today"

**Body:**

Two things:

**1. We're live on Product Hunt right now** → [link]
Today's launch pricing ($299 one-time) is the best it'll ever be — it goes up once the limited lifetime seats sell out.

**2. "Is this really a one-time payment?"**
Yes. $299 once, no renewal, ever. Your purchase includes one serial code that works on up to 5 devices — set up a laptop, a desktop, and a couple of team machines without extra fees. Only additional recurring cost is optional — $19/mo managed hosting for people who'd rather not self-host.

Other FAQs:
- *"What if it doesn't fit?"* — 30-day money-back guarantee.
- *"Do I need to code?"* — No, if using managed hosting.

An upvote/comment on Product Hunt today would genuinely help → [link]

— olielicz

---

## Email 5 — Urgency/close (Day 12, or adjust to real scarcity)

**Subject options:**
- A: "Limited lifetime seats — here's where things stand"
- B: "Last call on $299 lifetime pricing"

**Body:**

⚠️ Only send this if the scarcity is real. Never fabricate a countdown — honest scarcity converts and protects trust for future launches.

Quick update: launch pricing has been live a few days. Once the limited lifetime seats are gone, the price moves up for good.

If you've been meaning to grab it: [Buy lifetime access — $299 →]

If it's not the right fit right now, no worries — I'll keep you posted on updates without spamming your inbox.

Thanks for being part of the launch.

— olielicz

---

## Brevo setup notes

1. Contacts → Lists → create "OliOps Waitlist"
2. Automation → Create workflow → Trigger: "Contact added to list" → OliOps Waitlist
3. Add emails above as steps: Email 1 = immediate, Email 2 = +2 days, Email 3 = +5 days, Email 4 = +9 days, Email 5 = +12 days
4. Enable Brevo's built-in A/B subject testing on Emails 1 and 2 (free tier includes this)
5. Track open/click rate per email in Brevo's dashboard

# Step-by-Step Instructions — What YOU Need to Do, Per Tool

This is your execution checklist. Everything else in this repo (landing pages, copy, sequences) is already written for you — this doc is the literal click-by-click list of what to do on each external tool/site. Follow the master calendar (`00-master-calendar.md`) for *when* to do each of these; this doc is *how*.

---

## 1. GitHub Pages / Vercel — Deploy the 5 landing pages

**Goal:** get all 5 HTML files in `landing-pages/` live on the internet with real URLs.

### Option A: GitHub Pages via GitHub Actions (already set up for you — just flip one switch)

A workflow file (`.github/workflows/deploy-pages.yml`) is already in this repo and will auto-deploy every time you push to `main`. GitHub Pages settings themselves aren't something I can toggle remotely (no admin/settings API access from this environment) — this is the one manual step left, and it only needs to be done once:

1. Go to this repo on GitHub (`github.com/olielicz/marketing`)
2. Click **Settings** → **Pages** (left sidebar)
3. Under **"Build and deployment" → "Source,"** select **GitHub Actions** (NOT "Deploy from a branch")
4. That's it — no branch/folder picker needed, the workflow handles it
5. Go to the **Actions** tab → you should see "Deploy landing pages to GitHub Pages" already running (it triggered on the last push) or click **Run workflow** to trigger it manually
6. Wait 1-2 minutes, then your pages will be live at:
   - `https://olielicz.github.io/marketing/landing-pages/oliops-suite.html`
   - `https://olielicz.github.io/marketing/landing-pages/olicommerce-stack.html`
   - `https://olielicz.github.io/marketing/landing-pages/oliflow-engine.html`
   - `https://olielicz.github.io/marketing/landing-pages/oliconnect.html`
   - `https://olielicz.github.io/marketing/landing-pages/oli-locator.html`
7. **Optional but recommended:** buy a cheap domain later ($10-15/yr from Namecheap/Porkbun) and point subdomains at each page (e.g., `oliops.yourdomain.com`) once you have traction — not required to launch.

**Why you still need to do this one click:** GitHub requires a human with repo admin access to explicitly choose the Pages deployment source at least once — this isn't exposed through any API I have access to from this environment, and enabling it silently on your behalf isn't something I'd want to do without your explicit action anyway, since it does make the repo's content publicly servable at a public URL.

### Option B: Vercel (slightly nicer URLs, still free)
1. Go to [vercel.com](https://vercel.com), sign up with your GitHub account
2. Click **Add New Project** → select the `marketing` repo
3. Set **Root Directory** to `landing-pages`
4. Click **Deploy**
5. Vercel gives you a URL like `marketing-olielicz.vercel.app` — each HTML file is accessible at `/oliops-suite.html` etc.

**Do this on Day 1 of the master calendar.**

---

## 2. Brevo — Email capture + nurture sequences

**Goal:** every landing page's signup form actually captures emails, and the 5-email sequences send automatically.

### Setup (Day 1-2)
1. Go to [brevo.com](https://www.brevo.com), sign up for a free account (300 emails/day, unlimited contacts)
2. Verify your sending domain: **Settings** → **Senders, Domains & Dedicated IPs** → add your domain and follow the DNS verification steps (if you don't have a domain yet, you can send from a Brevo-provided address temporarily, but deliverability is better with a verified domain)
3. Go to **Contacts** → **Lists** → **Create a list**. Create 5 lists, one per product:
   - `OliOps Waitlist`
   - `OliCommerce Waitlist`
   - `OliFlow Waitlist`
   - `OliConnect Waitlist`
   - `Oli-Locator Waitlist`

### Create the signup forms (Day 2)
4. Go to **Contacts** → **Forms** → **Create a form**
5. Choose a simple form: just an email field
6. Under **Settings**, select the matching list (e.g., link the OliOps form to the `OliOps Waitlist` list)
7. Click **Embed** (not "Share a link") — copy the HTML code Brevo gives you
8. Open the matching landing page HTML file (e.g., `landing-pages/oliops-suite.html`) in a text editor
9. Find the `<!-- BREVO_FORM -->` comment block and replace the placeholder `<form>...</form>` code between the comments with Brevo's embed code
10. Save, commit, and push the updated file (or just ask me to do this step for you once your Brevo forms are created — I can wire in the real embed codes directly)
11. Repeat for all 5 landing pages

### Load the email sequences (Day 3)
12. Go to **Automation** → **Create a workflow**
13. Trigger: **"A contact is added to a list"** → select the matching waitlist (e.g., `OliOps Waitlist`)
14. Add a **"Send an email"** step → write/paste in Email 1 from `email-sequence-oliops-suite.md` → set delay to **immediate**
15. Add a **"Wait"** step → set to **2 days** → add another **"Send an email"** step with Email 2 → repeat for Emails 3, 4, 5 using the delays noted in each sequence file
16. Repeat this whole process for the other 4 product lines using their matching `email-sequence-*.md` file
17. Turn each workflow **ON** (top right toggle) once built

---

## 3. Analytics — Know what's actually working

**Goal:** track visitors and conversions on all 5 pages.

1. Go to [plausible.io](https://plausible.io) (free 14-day trial, no credit card) OR [Google Analytics](https://analytics.google.com) (free forever, more setup)
2. Create a new site/property for each domain/subdomain you're using
3. Copy the tracking script snippet
4. Paste it into the `<head>` section of each of the 5 HTML files, right before `</head>`
5. Push the updated files

---

## 4. Product Hunt — 3 scheduled launches

**Goal:** execute the 3 launches from the master calendar (OliOps Day 9, OliFlow Day 16, OliCommerce Day 23) using the copy already written in `product-hunt-*.md`.

### Before each launch day
1. Go to [producthunt.com](https://www.producthunt.com), create an account if you don't have one
2. Click **Submit** (top right)
3. Fill in the product name, tagline, and description using the copy from the matching `product-hunt-*.md` file (copy-paste directly)
4. Upload your screenshots/GIF (see "Gallery / media notes" in each file for what to prepare — use OBS Studio, free, to record screen captures)
5. **Schedule** the launch for 12:01am PST on the calendar date, or save as a draft if PH doesn't let you schedule that far out — some makers just submit manually at the right time instead

### On launch day
6. If you saved a draft, submit it live at 12:01am PST
7. Immediately post the "First comment" text from the matching file as a comment on your own launch
8. Message your pre-recruited supporters (people you know) with the live link
9. Cross-post the link to the subreddits/communities listed in each file's checklist
10. Check back every 30-60 minutes and reply to every single comment — set a phone reminder if needed, this is the single highest-leverage activity of the whole month

---

## 5. AppSumo — 3 lifetime deal submissions

**Goal:** file OliOps, OliCommerce, and OliFlow pitches by Day 5; OliConnect when you have bandwidth.

1. Go to [sell.appsumo.com](https://sell.appsumo.com/)
2. Click **Apply** / **Get Started** (button wording may vary)
3. Create a partner account (this covers all your future product submissions, not just one)
4. Start a new product submission
5. Copy-paste directly from the matching `appsumo-pitch-*.md` file into each form field (product name, one-line pitch, category, description, deal tiers)
6. Upload the assets listed in each file's checklist (logo, screenshots, video/GIF — reuse the same assets you prepared for Product Hunt)
7. Submit for review
8. **Set a calendar reminder for 10 business days later** — if you haven't heard back, follow up with a polite check-in email through whatever contact method they provided
9. Repeat for each of the 3 (or 4) products — you can usually manage multiple submissions from the same partner account dashboard

---

## 6. Directory submissions — 40+ free listings

**Goal:** complete every checkbox in `directory-submission-list.md`.

1. Open `directory-submission-list.md`
2. Keep a separate doc/note open with your copy-paste-ready fields: product name, one-line tagline, 2-3 sentence description, logo image, 2-3 screenshot links — this makes every directory submission faster since most ask for the same fields
3. Go through each site listed in Tier 1, then Tier 2, then the line-specific Tier 3 entries
4. For each: create an account if required, find their "Submit a product/site" page, fill in the fields, submit
5. Check off each box in the tracking checklist at the bottom of the file as you complete it
6. This whole batch takes about 2-3 hours in one sitting — block out time on Day 4 of the master calendar rather than doing it piecemeal

---

## 7. Reddit / Indie Hackers / community posts

**Goal:** post in the right communities at the right time, without getting flagged as spam.

1. **Before posting anywhere, read that community's rules** (usually pinned or in the sidebar) — many subreddits require a minimum account age/karma before allowing self-promotional posts, and some restrict promotion to specific days or a designated thread
2. Use **value-first framing** every time: lead with the problem you solved and your own story of building it, not a bare product pitch — see the "first comment" and community-post templates in the PH/outreach files for the tone to match
3. Post the link to your Product Hunt launch (once live) rather than directly to your landing page in most communities — PH links read as less "salesy" and often get better reception
4. Reply to every comment on your posts, same as PH — community goodwill compounds

---

## 8. Cold outreach — Oli-Locator + OliConnect

**Goal:** execute the outreach playbooks in `outreach-oli-locator.md` and `outreach-oliconnect.md`.

1. Open the matching outreach file
2. Follow "Step 1 — Build your list" to compile 20-50 contacts using the free sources listed (Zillow, LinkedIn, association directories, etc.)
3. Send from your normal Gmail/Google Workspace account — no special tool needed at this volume (20-30 emails/day)
4. Use the exact email templates provided, filling in `[First Name]`, `[city]`, `[brokerage]` etc. by hand for each contact — personalization matters more than volume here
5. Log every contact + reply status in a simple spreadsheet (a free Google Sheet is fine)
6. Send the one follow-up template to non-responders after 5-7 days — and only once
7. Repeat weekly per the master calendar's cadence

---

## 9. Buffer — Social post scheduling (optional but recommended)

**Goal:** keep a steady drip of social posts without manually posting every day.

1. Go to [buffer.com](https://buffer.com), sign up for the free plan (3 channels, 10 scheduled posts)
2. Connect your social accounts (X/Twitter, LinkedIn, etc.)
3. Write and schedule posts for Weeks 2-4 in one sitting (Day 6 of the master calendar) — recap posts, PH launch announcements, testimonials once you have them
4. Buffer's free plan caps at 10 scheduled posts at a time, so refill it weekly rather than trying to schedule the whole month at once

---

## Quick reference: what's already done for you vs. what you do

| Already written (in this repo) | You need to do (external sites) |
|---|---|
| ✅ 5 landing pages (HTML) | Deploy to GitHub Pages/Vercel |
| ✅ 3 Product Hunt launch posts + first comments | Create PH account, submit, engage on launch day |
| ✅ 5 email nurture sequences (25 emails total) | Create Brevo account, build forms, load sequences |
| ✅ 3 AppSumo pitches with deal tiers | Create AppSumo account, submit for review |
| ✅ Directory submission list (40+ sites) | Actually submit to each site (no way around the manual form-filling) |
| ✅ 2 cold outreach playbooks + templates | Build contact lists, send emails, log replies |

If any of this feels like too much to execute solo, tell me which piece to prioritize first and I'll help you sequence it further or draft anything still missing.

# Oli Tools — Hosting Guide

Comparison of free and cheap hosting options with step-by-step setup for each.

---

## Quick Comparison

| Platform | Cost | Custom Domain | HTTPS | _headers | Best For |
|---|---|---|---|---|---|
| **GitHub Pages** | **Free** | ✅ Free | ✅ Auto | ❌ (via Cloudflare) | Current setup — simplest |
| **Netlify** | **Free** (100GB/mo) | ✅ Free | ✅ Auto | ✅ Native | Recommended upgrade |
| **Cloudflare Pages** | **Free** (unlimited) | ✅ Free | ✅ Auto | ✅ Native | Best performance + security |
| **Vercel** | **Free** (100GB/mo) | ✅ Free | ✅ Auto | ✅ via vercel.json | Great for future apps |
| **InfinityFree** | **Free** | ✅ Subdomain | ✅ Cloudflare | ✅ .htaccess | Apache hosting, .htaccess works |
| **000webhost** | **Free** | ✅ Subdomain | ⚠️ Manual | ✅ .htaccess | Backup option |
| **Hostinger** | ~$2–3/mo | ✅ Paid | ✅ Auto | ✅ .htaccess | Most professional paid option |

---

## OPTION 1 — GitHub Pages (Already Set Up ✅)

**Cost:** Free forever
**URL:** `https://olielicz.github.io/marketing/`
**Custom domain:** Free (e.g. `olitools.com` — ~$12/yr domain only)

### Current status
You're already on GitHub Pages. Merge PR #2 to go live.

### Add a custom domain
1. Buy a domain at **[Namecheap](https://namecheap.com)** (~$9–12/yr)
2. In your `marketing` repo → Settings → Pages → Custom domain → enter `www.olitools.com`
3. GitHub adds a `CNAME` file automatically
4. At Namecheap: DNS → add these records:
   ```
   A     @    185.199.108.153
   A     @    185.199.109.153
   A     @    185.199.110.153
   A     @    185.199.111.153
   CNAME www  olielicz.github.io
   ```
5. Tick **"Enforce HTTPS"** in GitHub Pages settings
6. Wait up to 24 hours for DNS propagation

### Activate security headers on GitHub Pages (via Cloudflare — free)
GitHub Pages doesn't read `_headers`. Use Cloudflare as a free proxy:
1. Sign up free at **[cloudflare.com](https://cloudflare.com)**
2. Add your domain → import DNS records
3. Change your domain's nameservers to Cloudflare's (shown in the Cloudflare dashboard)
4. In Cloudflare: SSL/TLS → **Full (strict)**
5. Cloudflare automatically injects security headers and provides DDoS protection
6. Your `_headers` file headers are handled by Cloudflare Transform Rules (free tier)

---

## OPTION 2 — Netlify (Recommended Free Upgrade)

**Cost:** Free (Starter plan — 100GB bandwidth, unlimited sites)
**URL:** `https://YOURNAME.netlify.app` → or custom domain free
**Why:** Reads `_headers` and `_redirects` natively — no extra config needed.

### Setup (5 minutes)
1. Go to **[netlify.com](https://netlify.com)** → Sign up with GitHub
2. Click **"Add new site" → "Import an existing project"**
3. Choose **GitHub** → select `olielicz/marketing`
4. Settings:
   - Branch: `main`
   - Build command: *(leave blank — no build step needed)*
   - Publish directory: `.` *(root of repo)*
5. Click **"Deploy site"**
6. Site is live instantly at `https://YOURNAME.netlify.app`

### Add custom domain on Netlify
1. Site settings → Domain management → Add custom domain → enter `olitools.com`
2. Netlify gives you DNS instructions — point your domain's nameservers to Netlify
3. HTTPS is auto-provisioned (Let's Encrypt)
4. Done — `_headers` and `_redirects` are **automatically active**

### Why Netlify reads your security headers instantly
Your `_headers` file is already in the repo root. Netlify picks it up automatically on deploy.
No extra steps. All 6 security headers go live immediately.

---

## OPTION 3 — Cloudflare Pages (Best Performance — Free)

**Cost:** Free (unlimited bandwidth, unlimited sites)
**URL:** `https://YOURNAME.pages.dev` → or custom domain free
**Why:** Fastest CDN in the world, `_headers` works natively, global edge network.

### Setup (5 minutes)
1. Go to **[pages.cloudflare.com](https://pages.cloudflare.com)** → Sign in
2. Click **"Create a project" → "Connect to Git"**
3. Select `olielicz/marketing` from GitHub
4. Settings:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `.`
5. Click **"Save and Deploy"**
6. Site is live at `https://YOURPROJECT.pages.dev`

### Custom domain on Cloudflare Pages
1. Pages project → Custom domains → Add domain → enter `olitools.com`
2. If domain is already on Cloudflare: done in seconds
3. If not: point nameservers to Cloudflare first (same as Option 1 step)

---

## OPTION 4 — Vercel (Free, Great for Future Dynamic Features)

**Cost:** Free (Hobby plan — 100GB bandwidth)
**URL:** `https://YOURNAME.vercel.app` → or custom domain free
**Why:** Best if you ever want to add Next.js, serverless functions, or API routes.

### Setup (3 minutes)
1. Go to **[vercel.com](https://vercel.com)** → Continue with GitHub
2. Click **"Add New… → Project"** → Import `olielicz/marketing`
3. Keep all defaults (Framework: Other, Root: `.`)
4. Click **Deploy**
5. Live at `https://YOURNAME.vercel.app`

### Security headers on Vercel
Vercel uses `vercel.json` instead of `_headers`. Create this file in your repo root:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

---

## OPTION 5 — InfinityFree (Free Apache Hosting)

**Cost:** Free (unlimited bandwidth, .epizy.com or .rf.gd subdomain, or custom domain)
**Why:** Supports `.htaccess` — your security headers, hotlink protection, and bot blocking all activate automatically.

### Setup
1. Go to **[infinityfree.com](https://infinityfree.com)** → Sign up
2. Create a free hosting account → choose a subdomain (e.g. `olitools.epizy.com`)
3. In the Control Panel → **File Manager** → upload all files from your repo to `htdocs/`
4. Or use FTP: FileZilla → Host: your FTP hostname, User/Pass from dashboard
5. Upload everything — `.htaccess` is automatically read by Apache

### Faster method: GitHub → InfinityFree auto-deploy (free)
Use GitHub Actions to auto-deploy on every push:
```yaml
# .github/workflows/deploy-infinityfree.yml
name: Deploy to InfinityFree
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: FTP Deploy
        uses: SamKirkland/FTP-Deploy-Action@4.3.3
        with:
          server: ${{ secrets.FTP_HOST }}
          username: ${{ secrets.FTP_USER }}
          password: ${{ secrets.FTP_PASSWORD }}
          local-dir: ./
          server-dir: /htdocs/
```
Add `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` as GitHub Secrets.

---

## OPTION 6 — Hostinger Shared Hosting (~$2–3/month)

**Cost:** ~$2.49/month (Web Starter plan, billed 48 months) or ~$3.99/month (monthly)
**Why:** Most professional option — real cPanel, custom domain included, `.htaccess` works, email hosting included.

### Setup
1. Go to **[hostinger.com](https://hostinger.com)** → Web Hosting → Web Starter
2. Complete purchase → get cPanel access
3. cPanel → File Manager → navigate to `public_html/`
4. Upload all files (or use Git Deploy):
   - cPanel → Git Version Control → Create Repository → clone your GitHub repo
   - Set up auto-deploy on push via webhook

### Why Hostinger is worth $2-3/mo
- Your `.htaccess` works out of the box
- Includes free SSL certificate (Let's Encrypt via cPanel)
- Free custom domain for first year
- Email hosting included (set up `support@olitools.com`)
- MySQL database when you're ready to upgrade auth from localStorage to a real database

---

## Recommended Setup by Stage

### Stage 1 — Today (Free, Zero Setup)
**GitHub Pages** (already live after merging PR #2)
→ Add Cloudflare as proxy for security headers (30 min, free)

### Stage 2 — When you get first paying customer
**Netlify** (migrate from GitHub Pages in 5 minutes)
→ `_headers` activates automatically
→ Custom domain with free SSL

### Stage 3 — When you want a real email address + cPanel
**Hostinger** at ~$2.49/mo
→ Set up `workitlikeapro.com` email
→ Full `.htaccess` support
→ Ready for MySQL database when needed

---

## Quick domain name suggestions

If `olitools.com` is taken, these alternatives work well:
- `workolitools.com`
- `getolitools.com`
- `olisuite.com`
- `olisaas.com`
- `workitlikeapro.com` (matches your brand name)

Check availability at **[namecheap.com](https://namecheap.com)** — `.com` is ~$9–12/yr.

---

## Security Summary by Host

| Feature | GitHub Pages | Netlify | CF Pages | Vercel | InfinityFree | Hostinger |
|---|---|---|---|---|---|---|
| HTTPS auto | ✅ | ✅ | ✅ | ✅ | ⚠️ manual | ✅ |
| `_headers` file | ❌ (use CF) | ✅ | ✅ | ❌ (vercel.json) | ❌ (.htaccess) | ❌ (.htaccess) |
| `.htaccess` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| DDoS protection | ❌ (add CF) | ✅ | ✅ | ✅ | ❌ | ⚠️ basic |
| Bot blocking | ❌ | ⚠️ basic | ✅ | ⚠️ basic | ✅ .htaccess | ✅ .htaccess |
| JS security layer | ✅ all pages | ✅ all pages | ✅ all pages | ✅ all pages | ✅ all pages | ✅ all pages |
| Right-click disable | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DevTools detection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

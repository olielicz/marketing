# Deploying All 6 Oli Tools to a Hostinger KVM VPS

This is the exact runbook for going from a fresh Hostinger VPS to all 7
backend services + the marketing/login/account static site running in
production, reverse-proxied over HTTPS by subdomain.

**Read this once fully before running anything.** It's written so that
most of it can be pasted straight into your SSH session, but a few steps
need real values only you have (domain name, SMTP/webhook secrets).

---

## 0. Before you start — what you need ready

- [ ] Hostinger KVM VPS purchased (KVM 2 — 2 vCPU / 8GB RAM — recommended tier)
- [ ] A domain name (buy on Namecheap/Hostinger, ~$10-12/yr, if you don't have one)
- [ ] The VPS's public IP address (Hostinger's hPanel → VPS → Overview)
- [ ] Root (or sudo) SSH access to the VPS (Hostinger emails/shows you this,
      or lets you set a password/SSH key in hPanel)
- [ ] 10-15 minutes, plus DNS propagation time (up to a few hours, usually
      much faster) between step 2 and step 6

You do **not** need cPanel for any of this — KVM VPS plans give you a bare
Ubuntu box with root access, which is exactly what these services need.

---

## 1. Point your domain at the VPS

In your domain registrar's DNS settings, add:

```
A     @               <VPS_PUBLIC_IP>
A     www             <VPS_PUBLIC_IP>
A     admin           <VPS_PUBLIC_IP>
A     licensing       <VPS_PUBLIC_IP>
A     salestrack-sync <VPS_PUBLIC_IP>
A     flow-executor   <VPS_PUBLIC_IP>
A     oliops-api      <VPS_PUBLIC_IP>
A     olicommerce-api <VPS_PUBLIC_IP>
A     integrations    <VPS_PUBLIC_IP>
```

(One `A` record per subdomain, all pointing at the same VPS IP — nginx will
route by hostname. You can add these gradually as you enable each service;
only `@`, `www`, and `admin` are needed on day one.)

Wait for DNS to propagate before requesting HTTPS certificates in step 5
(check with `dig admin.yourdomain.com` from any machine — once it returns
your VPS IP, you're ready).

---

## 2. First login and basic server hardening

```bash
ssh root@<VPS_PUBLIC_IP>

# Update the box
apt update && apt upgrade -y

# Create a non-root user to work as (recommended — avoid running as root day-to-day)
adduser oli
usermod -aG sudo oli

# Basic firewall: only allow SSH, HTTP, HTTPS from the outside.
# Every backend service (ports 3000, 4100-4600) is only ever reached
# through nginx on 80/443 — they are NOT opened to the internet directly.
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Switch to the new user for everything else
su - oli
```

---

## 3. Install Node.js, PM2, nginx, git

```bash
# Node.js 22 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v   # expect v22.x
npm -v

# PM2 — process manager that keeps all 7 services alive, restarts them on
# crash, and restarts them all automatically after a server reboot
sudo npm install -g pm2

# nginx — reverse proxy + static file server + HTTPS termination
sudo apt install -y nginx

# git + certbot (for free Let's Encrypt HTTPS certs)
sudo apt install -y git certbot python3-certbot-nginx
```

---

## 4. Clone the repo and install each service

```bash
cd ~
git clone https://github.com/olielicz/marketing.git oli-marketing
cd oli-marketing

# each backend is zero-npm-dependency EXCEPT integration-server and
# lead-gen's optional server, which is fine — just run npm install
# wherever a package.json lists dependencies (it's a harmless no-op
# for the zero-dependency ones)
for svc in admin-auth licensing olisalestrack-sync oliflow-executor oliops-backend olicommerce-backend integration-server; do
  (cd "$svc" && npm install --omit=dev)
done
```

---

## 5. Configure each service's `.env`

Every service ships a `.env.example` — copy it and fill in real values.
**Do this for all 7 before starting anything with PM2.**

```bash
cd ~/oli-marketing
for svc in admin-auth licensing olisalestrack-sync oliflow-executor oliops-backend olicommerce-backend integration-server; do
  cp "$svc/.env.example" "$svc/.env"
done
```

Then edit each `.env` (`nano admin-auth/.env`, etc.). Minimum required
changes per service:

- **admin-auth/.env** — defaults are fine for a single-owner setup. Leave `ALLOWED_ORIGIN=*` unless you want to lock it to `https://yourdomain.com`.
- **licensing/.env** — set `OLI_ADMIN_AUTH_URL=http://localhost:4300` (already the default).
- **olisalestrack-sync/.env** — set `OLI_ADMIN_AUTH_URL=http://localhost:4300`, and fill in `STRIPE_WEBHOOK_SECRET` / `SHOPIFY_WEBHOOK_SECRET` / `PAYPAL_WEBHOOK_ID` + `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` once you have real webhook endpoints registered with those providers pointing at `https://salestrack-sync.yourdomain.com/webhooks/{stripe,paypal,shopify}`.
- **oliflow-executor/.env** — set `OLI_ADMIN_AUTH_URL=http://localhost:4300`.
- **oliops-backend/.env** — set `OLIOPS_BUSINESS_NAME` / `OLIOPS_BUSINESS_EMAIL` to your real business info.
- **olicommerce-backend/.env** — set `OLICOMMERCE_STORE_NAME`, and the `SMTP_*` block to a real mailbox (e.g. a Gmail app-specific password, or your Hostinger-hosted email once set up) so cart-recovery emails actually send.
- **integration-server/.env** — set `OLI_API_SECRET` to a real random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); leave the Zapier/Make/n8n/GHL client ID/secret fields blank until you register real OAuth apps with those platforms (see `integration-server/README.md`).

**PORT** in each `.env.example` already matches the table below — no need to change those.

---

## 6. Create your admin account (do this before anything else touches admin-auth)

```bash
cd ~/oli-marketing/admin-auth
npm run create-owner -- --username you@yourdomain.com
```

This prints a strong random password **once**. Copy it into a password
manager immediately — it is never stored in plaintext and cannot be
recovered, only reset (see `admin-auth/README.md`). This is the ONE login
that has admin access to all 6 tools — nothing else in this stack has an
"add another admin" path.

---

## 7. Start everything with PM2

A ready-to-use PM2 process file (`ecosystem.config.cjs`) is included in
this repo at the marketing root — see below. From `~/oli-marketing`:

```bash
pm2 start ecosystem.config.cjs

# Verify all 7 are online:
pm2 status

# Make PM2 survive a server reboot:
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u oli --hp /home/oli
# ^ pm2 will print an exact command tailored to your system — run the
#   command it prints, then run `pm2 save` again
```

Check logs any time with `pm2 logs <name>` (e.g. `pm2 logs admin-auth`) or
`pm2 logs` for all services combined.

---

## 8. nginx: reverse proxy + static site

nginx config files are provided in `nginx/` at the marketing repo root —
one per subdomain, plus the static site. Install them:

```bash
cd ~/oli-marketing/nginx
sudo cp *.conf /etc/nginx/sites-available/
for f in /etc/nginx/sites-available/*.conf; do
  sudo ln -sf "$f" /etc/nginx/sites-enabled/
done
sudo rm -f /etc/nginx/sites-enabled/default   # remove nginx's placeholder site

# IMPORTANT: edit every file in /etc/nginx/sites-available/ first and
# replace "yourdomain.com" with your real domain — or do it before
# copying, directly in ~/oli-marketing/nginx/*.conf
sudo nginx -t   # test config syntax before reloading
sudo systemctl reload nginx
```

---

## 9. Get free HTTPS certificates (Let's Encrypt)

Only run this once DNS from step 1 has propagated:

```bash
sudo certbot --nginx \
  -d yourdomain.com -d www.yourdomain.com \
  -d admin.yourdomain.com \
  -d licensing.yourdomain.com \
  -d salestrack-sync.yourdomain.com \
  -d flow-executor.yourdomain.com \
  -d oliops-api.yourdomain.com \
  -d olicommerce-api.yourdomain.com \
  -d integrations.yourdomain.com
```

Certbot edits your nginx configs in place to add HTTPS and sets up
auto-renewal (`systemctl status certbot.timer` to confirm it's scheduled —
Hostinger's Ubuntu images enable this by default via the certbot package).

If you're only launching with a subset of subdomains live (e.g. just
`admin` + the main site to start), drop the `-d` flags for services you
haven't wired up yet and re-run certbot later to add more.

---

## 10. Point each frontend at its real backend URL

Right now the static pages default to demo/simulation mode unless pointed
at a real backend. Once your services are live at their HTTPS subdomains,
open these pages and fill in the config panel (values persist in that
browser's localStorage — no code changes needed):

| Frontend page | What to paste in |
|---|---|
| `oliflow/app/index.html` → ⚙ Connect Backend | Executor URL: `https://flow-executor.yourdomain.com`, owner session token (from `POST /api/login` on admin-auth) |
| `olisalestrack/dashboard/index.html` → Settings | Admin-auth URL: `https://admin.yourdomain.com`, sync URL: `https://salestrack-sync.yourdomain.com` |
| `oliops/app/*` (OliOps CRM app) | Backend URL: `https://oliops-api.yourdomain.com` |
| `olicommerce/app/*` | Backend URL: `https://olicommerce-api.yourdomain.com` |
| 4 self-hosted products' license activation prompt | Licensing server URL: `https://licensing.yourdomain.com` |
| Zapier/Make/n8n/GHL setup docs | Integration server URL: `https://integrations.yourdomain.com` |

---

## 11. Smoke-test everything

```bash
curl https://admin.yourdomain.com/api/health
curl https://licensing.yourdomain.com/api/health   # if this route exists — see each README
curl https://salestrack-sync.yourdomain.com/api/health
curl https://flow-executor.yourdomain.com/api/health
curl https://oliops-api.yourdomain.com/api/health
curl https://olicommerce-api.yourdomain.com/api/health
curl https://integrations.yourdomain.com/api/health
```

All should return `{"ok":true,...}`. Then log into
`https://admin.yourdomain.com`-backed flows from the actual product pages
(OliFlow's Connect Backend, OliSalesTrack dashboard, etc.) using the owner
credentials from step 6.

---

## Ongoing operations cheat-sheet

```bash
pm2 status                 # see all 7 services + uptime/restarts
pm2 logs <name>             # tail logs for one service
pm2 restart <name>          # restart one service after an .env change
pm2 restart all             # restart everything

cd ~/oli-marketing && git pull   # pull latest code
pm2 restart all                  # apply it (no build step — plain Node)

sudo certbot renew --dry-run     # confirm auto-renewal will work
df -h                            # disk space check (data/*.json files are tiny, but check periodically)
```

## What this deployment deliberately leaves out of scope

- **Backups.** Each service's `data/` directory is plain JSON files/PEM
  keys — back them up (e.g. a nightly `tar` + copy off-box, or Hostinger's
  VPS snapshot feature in hPanel) before you have real customer data
  riding on this box.
- **oliexplore-trends and Oli-Locator's Vercel/Cloudflare-hosted pieces**
  — left on their current free platforms; nothing forces you to move them
  to this VPS, and there's no benefit to doing so right now.
- **Multi-admin / team access** — deliberately not supported anywhere in
  this stack per your requirement that you're the only admin. If that
  changes later, it's a real follow-up, not a config flag.

# Going Live: Connecting OliExplore to Your Real Accounts

This is the step-by-step to turn OliExplore from a demo into a real
publisher for your own Facebook, Instagram, X, TikTok, and/or Threads
accounts. You do this part yourself — registering a developer app
requires *your* identity/account on each platform, so an assistant
can't do it on your behalf.

**Time estimate:** ~15-20 minutes per platform, plus the one-time 5
minute proxy deploy in [`server/README.md`](server/README.md).

You do **not** need to do all five platforms. Pick whichever you
actually use — each one works independently.

---

## Step 0 — Deploy your proxy (do this first, once)

Real OAuth needs a client secret, and secrets can never live in browser
code. Follow [`server/README.md`](server/README.md) to deploy the
included Cloudflare Worker (free tier, ~5 minutes, no credit card
required for the free plan). You'll get a URL like:

```
https://oliexplore-proxy.<you>.workers.dev
```

Keep that URL — you'll paste it into OliExplore's **Live API Setup**
panel (gear icon in the sidebar) once, and it covers every platform.

---

## Facebook (+ Instagram)

Facebook and Instagram share one Meta developer app.

1. Go to **[developers.facebook.com/apps](https://developers.facebook.com/apps)**
   and log in with your Facebook account.
2. Click **Create App** → choose type **"Other"** → **"Business"**.
3. Once created, from the app dashboard add the **Facebook Login**
   product (and **Instagram Graph API** if you also want Instagram).
4. Under **Facebook Login → Settings**, add this to *Valid OAuth
   Redirect URIs*:
   ```
   https://<your-username>.github.io/oliexplore/oauth-callback.html
   ```
   (use your actual GitHub Pages URL for this repo)
5. Under **App Settings → Basic**, copy the **App ID** — this is the
   "Client ID" you'll paste into OliExplore's Settings panel.
6. Copy the **App Secret** too (click "Show"). Do **not** paste this
   into OliExplore — instead set it on your proxy:
   ```
   npx wrangler secret put META_CLIENT_SECRET
   ```
7. Your app starts in **Development Mode**, which only works for
   accounts added as testers/admins on the app (that's fine — that's
   you, testing your own account). To post to Facebook/Instagram from
   *other* people's accounts later, Meta requires **App Review** for
   the `pages_manage_posts` / `instagram_content_publish` permissions.
8. If you're connecting a Facebook **Page** (not just a personal
   profile — Pages are required for the Posts API), make sure your
   account is an admin of that Page.

**Instagram specifics:** you need an Instagram **Business or Creator**
account linked to a Facebook Page. Personal Instagram accounts cannot
use the Graph API. Also note Instagram's API has no pure-text post type
— publishing requires an image or video URL (the included proxy handles
this but you'll need to supply a `mediaUrl`).

---

## X (Twitter)

1. Go to **[developer.x.com](https://developer.x.com)** and apply for a
   developer account if you don't have one (usually instant approval).
2. Create a **Project** and an **App** inside it.
3. In the app's **User authentication settings**, enable **OAuth 2.0**,
   set app type to **Web App**, and add this callback URL:
   ```
   https://<your-username>.github.io/oliexplore/oauth-callback.html
   ```
4. Under **Keys and tokens**, copy the **Client ID** — paste that into
   OliExplore's Settings panel.
5. Copy the **Client Secret** and set it on your proxy:
   ```
   npx wrangler secret put X_CLIENT_SECRET
   ```
6. **Important cost note:** as of 2026, X removed its free posting tier.
   Reading/writing tweets via the API now requires a paid plan (Basic
   tier or the new pay-per-usage credits system) — there is no way
   around this on X's side. Check current pricing at
   [docs.x.com/x-api/getting-started/pricing](https://docs.x.com/x-api/getting-started/pricing)
   before connecting X live. [Source: docs.x.com]

---

## TikTok

1. Go to **[developers.tiktok.com](https://developers.tiktok.com)** and
   register/log in.
2. Create an app under **Manage apps**.
3. Add the **Login Kit** and **Content Posting API** products to the app.
4. Under app settings, add this **Redirect URI**:
   ```
   https://<your-username>.github.io/oliexplore/oauth-callback.html
   ```
5. Copy the **Client Key** (TikTok's name for Client ID) into
   OliExplore's Settings panel.
6. Copy the **Client Secret** and set it on your proxy:
   ```
   npx wrangler secret put TIKTOK_CLIENT_SECRET
   ```
7. **Important limitation:** TikTok's Content Posting API is free, but
   any app that hasn't passed TikTok's **audit** can only publish videos
   in **private (self-only) viewing mode** — nothing posted through an
   unaudited app is publicly visible. The included proxy sets
   `privacy_level: SELF_ONLY` for exactly this reason. Passing the audit
   for public posting requires submitting your app for TikTok's review,
   which typically takes 2-6 weeks. [Source: developers.tiktok.com]
8. TikTok publishing also requires an actual video file URL — there's no
   text-only post type.

---

## Threads

Threads has its own app product inside the Meta dashboard, separate
from a plain Facebook app (though you can add it to the same app you
created for Facebook/Instagram, or make a new one).

1. In your Meta app (from the Facebook section above, or a new one) at
   **[developers.facebook.com/apps](https://developers.facebook.com/apps)**,
   add the **Threads API** product.
2. Under its settings, add the same redirect URI:
   ```
   https://<your-username>.github.io/oliexplore/oauth-callback.html
   ```
3. Copy the **Threads App ID** into OliExplore's Settings panel.
4. Copy the **Threads App Secret** and set it on your proxy:
   ```
   npx wrangler secret put THREADS_CLIENT_SECRET
   ```
5. Threads accounts publish up to **250 API posts per rolling 24-hour
   window** — plenty for normal use. [Source: developers.facebook.com]
6. Like Facebook, your Threads integration starts in Development Mode —
   fine for testing with your own account; broader access needs App
   Review.

---

## Putting it together in OliExplore

1. Open OliExplore → sidebar → **⚙ Live API Setup**.
2. Paste your proxy URL (from Step 0).
3. Paste each platform's Client ID/Key you copied above. Save.
4. Go to **Connections** → click **"Log in & Connect"** on a platform
   that now shows "Live login ready". A popup opens the platform's real
   consent screen — sign in and approve.
5. Once connected, **Collect New Posts** and **Publish** on that
   platform now hit the real API through your proxy.

Any platform you *haven't* configured keeps working exactly as before
in demo/offline mode — nothing is required to keep using OliExplore as
a sandbox.

## Troubleshooting

- **"Live API is not configured yet"** — you opened Connect before
  saving a proxy URL + Client ID in Settings for that platform.
- **"Token exchange failed"** — check your proxy's redirect URI exactly
  matches what's registered in the platform's app settings (including
  trailing slashes), and that the matching secret was set with
  `wrangler secret put`.
- **"session expired"** — access tokens eventually expire; reconnect
  from the Connections tab.
- **Popup blocked** — allow popups for your GitHub Pages domain and
  retry.

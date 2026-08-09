# Windows packaging options

## Option A — install as PWA (recommended, takes 5 seconds)

Open the hosted `index.html` in **Microsoft Edge** or **Chrome** on Windows,
then:

- Edge: address-bar icon **Install app**, or `…` menu → Apps → **Install this site as an app**
- Chrome: `⋮` menu → Cast, save and share → **Install Refund Tracker…**

The app lands in your Start Menu, gets a real window with a normal title
bar, can be pinned to the taskbar, and runs offline thanks to the service
worker. This is what most modern web-first products ship for Windows
(Notion, Spotify Web Player, etc. all support this path).

## Option B — package as a real `.exe` / `.msi` with Tauri

If you want a signed, store-shippable binary, wrap the same files with
[Tauri 2.0](https://v2.tauri.app/). Tauri uses the system WebView2 runtime
on Windows, so the resulting binary is tiny (≈3–5 MB) compared to Electron.

```bash
# one-time
cargo install tauri-cli
npm install --save-dev @tauri-apps/cli
npx tauri init --app-name "Refund Tracker" \
               --window-title "Refund Tracker" \
               --frontend-dist ../refund-tracker \
               --dev-url ""

# build
npx tauri build
```

The resulting `.msi` (and an unsigned `.exe`) appears under
`src-tauri/target/release/bundle/`.

To submit to the **Microsoft Store** you'll need:
- A signing certificate (you can purchase one or use Microsoft's
  free [Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/) program)
- A [Microsoft Partner Center](https://partner.microsoft.com) account ($19 one-time as an individual developer)

## Option C — Electron

Use only if you need a Node-side process (e.g., for direct-to-disk
local databases or system tray integration). Heavier than Tauri and
not necessary for this app.

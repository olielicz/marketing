# Wrapping Refund Tracker as native iOS / Android apps with Capacitor

The PWA already installs cleanly on iOS (Safari → Share → Add to Home Screen)
and on Android (Chrome → menu → Install app). If you want to ship to the
**App Store** and **Google Play** as a real native package, the standard
approach is to wrap the same files with [Capacitor](https://capacitorjs.com).
You don't have to rewrite anything — Capacitor takes the existing static
files and packages them into native iOS / Android projects.

## One-time setup

```bash
# from the project root (next to refund-tracker/)
npm init -y
npm install --save-dev @capacitor/cli
npm install @capacitor/core @capacitor/ios @capacitor/android

npx cap init "Refund Tracker" com.yourcompany.refundtracker --web-dir refund-tracker
npx cap add ios
npx cap add android
```

## After every change to the web app

```bash
npx cap copy        # syncs refund-tracker/ into the native projects
npx cap open ios    # opens Xcode
npx cap open android # opens Android Studio
```

## Building & shipping

### iOS (App Store)
1. Open in Xcode (`npx cap open ios`).
2. Set your **Team** in Signing & Capabilities.
3. Update `Info.plist` with your bundle ID and display name.
4. Product → Archive → Distribute → App Store Connect.

You need an Apple Developer account ($99/year) to ship to the App Store.

### Android (Play Store)
1. Open in Android Studio (`npx cap open android`).
2. Build → Generate Signed Bundle / APK → Android App Bundle.
3. Upload the resulting `.aab` to Google Play Console.

You need a Google Play Developer account ($25 one-time).

## Replacing CDN scripts

The current PWA loads React, Tailwind, etc. from a CDN. Inside Capacitor that
works (the WebView allows external HTTPS), but you'll get a tighter, faster
app if you bundle everything locally. To do that:

1. `npm install react react-dom htm tailwindcss`
2. Replace the `<script src="https://...">` tags in `index.html` with local
   bundled assets (a Vite or esbuild build emitting `dist/`).
3. Point Capacitor at `dist/` instead of `refund-tracker/`.

This is a cleanup pass for production but is **not** required to validate
that the app runs natively — the CDN-loaded version is testable today.

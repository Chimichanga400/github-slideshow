# KnowledgeNode — Android build (free version, bring-your-own-key)

**No paywall in this build.** Anyone using the app opens Settings, pastes their
own AI key (OpenRouter or Anthropic), and everything unlocks. No server, no
subscription, no RevenueCat needed. Verified: this exact `www` boots and passes
all 193 project tests plus the no-paywall flow checks.

```
www/                 ← the app (goes into your Capacitor project)
android-native/
  KnowledgeNodeFiles.java   ← one native file for saving exports to Downloads
```

## One-time setup (Windows)

You need: **Node.js** (you have it) and **Android Studio** (free, from
developer.android.com — install with default options).

Open a terminal (press Windows key, type `cmd`, Enter) and run these one at a
time — this creates the app project in a folder called `knowledgenode`:

```bash
cd %USERPROFILE%\Documents
npm init @capacitor/app@latest knowledgenode -- --name KnowledgeNode --app-id app.knowledgenode.study
cd knowledgenode
npm install
npm install @capacitor/android
```

Now put the app files in:
1. Delete everything inside `Documents\knowledgenode\www\`
2. Copy the **contents** of this package's `www` folder into it
   (so `Documents\knowledgenode\www\index.html` exists)

Then back in the terminal:
```bash
npx cap add android
```

Copy the one native file:
- Copy `android-native\KnowledgeNodeFiles.java`
- into `Documents\knowledgenode\android\app\src\main\java\app\knowledgenode\study\`
  (create the folders if they don't exist)

## Build & run on your phone

```bash
npx cap sync android
npx cap open android
```

Android Studio opens. Plug in your phone with a USB cable (enable
**Developer options → USB debugging** on the phone first: Settings → About
phone → tap "Build number" 7 times, then Settings → Developer options → USB
debugging ON). Pick your phone in the device dropdown and press the green ▶.

To share with friends: in Android Studio, **Build → Generate Signed App
Bundle / APK → APK** — follow the wizard (create a keystore when asked, any
password, remember it). The APK it produces can be sent to anyone; they enable
"install from unknown sources" and install it.

## After installing — turning on AI (each person does this once)

1. Open the app → Settings (gear icon) → AI setup
2. Recommended: create a free key at **openrouter.ai/keys**
3. Paste it, Save. Done — the key stays on that person's device only.

(An Anthropic key from console.anthropic.com works too.)

## Keyboard predictions / autocorrect

**Status: unresolved on Samsung Keyboard in the Android WebView.**

The page itself does everything it can — every text box gets
`autocorrect="on"`, `autocapitalize="sentences"`, `spellcheck="true"` and
`autocomplete="on"`, applied before the field is focused, including boxes
created later such as the coach composer. Verified in a real browser.

The same build shows the prediction strip correctly in a phone browser and does
not show it inside the installed Capacitor app, which places the cause in the
WebView rather than in the app's code.

`android.captureInput` was previously recommended here as the fix. **It is not.**
That option concerns hardware keyboard capture, not the on-screen suggestion
strip; it was set to `true` in a real project where predictions still did not
appear. Because it intercepts key events it is worth testing with
`"captureInput": false`, but this is an untested hypothesis, not a known fix.

**What reliably works today:** open the app in the phone browser and use
Add to Home Screen. Predictions work there, and the manifest already declares
`display: standalone`, so it opens without an address bar.

## Notes
- `www/js/core/AppConfig.js` ships with `MANAGED_ONLY: false` — that IS the
  no-paywall switch. Don't change the other values; they're only used by the
  paywall build.
- The app loads its PDF/OCR helper libraries from a CDN at runtime, so the
  phone needs internet for those features.
- Whenever you change files in `www`, run `npx cap sync android` again before
  pressing ▶.

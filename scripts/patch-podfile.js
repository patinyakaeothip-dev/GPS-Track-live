// patch-podfile.js — run after `cap sync` (see package.json's cap:sync
// script) to fix a gotcha that silently broke Google sign-in on iOS:
//
// @capacitor-firebase/authentication's podspec defaults to a "Lite"
// subspec that excludes Google Sign-In entirely (its own iOS source wraps
// every line of Google sign-in in `#if RGCFA_INCLUDE_GOOGLE ... #endif`,
// a flag only defined by the "Google" subspec) — see
// node_modules/@capacitor-firebase/authentication/CapacitorFirebaseAuthentication.podspec.
// Capacitor's own `cap sync` has no way to know this plugin needs a
// non-default subspec, so the Podfile it generates just does
// `pod 'CapacitorFirebaseAuthentication', :path => '...'` with no
// `:subspecs` — compiling to a function body that does nothing at all.
// Tapping "Sign in with Google" then just silently hangs forever: no
// native UI, no error, nothing — the call never resolves or rejects. This
// took a full real-device debugging session (Xcode console + a browser
// DevTools comparison) to actually catch, since the empty function body
// produces zero diagnostic output anywhere.
//
// `cap sync` regenerates the Podfile's plugin-list block on every run, so
// a manual one-time Podfile edit gets silently reverted the very next
// time anyone runs `npm run cap:sync` — exactly the kind of fragile
// native-project step that has bitten this project before (the app icon
// and GoogleService-Info.plist both went missing the same way, after
// `npx cap add ios` regenerated the Xcode project without those manual
// fixes being reapplied). Automating the patch as its own script, run
// every time right after `cap sync`, is the only way to make it durable.
const fs = require('fs');
const path = require('path');
const podfilePath = path.join(__dirname, '..', 'ios', 'App', 'Podfile');

if (!fs.existsSync(podfilePath)) {
  console.log('[patch-podfile] ios/App/Podfile not found — skipping (no iOS project here yet)');
  process.exit(0);
}

let content = fs.readFileSync(podfilePath, 'utf8');
const pattern = /pod 'CapacitorFirebaseAuthentication'(, :path => '[^']*')(?!.*:subspecs)/;

if (/pod 'CapacitorFirebaseAuthentication'.*:subspecs/.test(content)) {
  console.log('[patch-podfile] CapacitorFirebaseAuthentication already has :subspecs — nothing to do');
} else if (pattern.test(content)) {
  content = content.replace(pattern, "pod 'CapacitorFirebaseAuthentication'$1, :subspecs => ['Google']");
  fs.writeFileSync(podfilePath, content);
  console.log("[patch-podfile] Added :subspecs => ['Google'] to CapacitorFirebaseAuthentication — run `pod install` next");
} else {
  console.warn('[patch-podfile] Could not find the expected CapacitorFirebaseAuthentication pod line — check ios/App/Podfile manually and add :subspecs => [\'Google\'] to it yourself');
}

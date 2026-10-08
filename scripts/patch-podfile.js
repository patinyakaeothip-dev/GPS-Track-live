// patch-podfile.js — run after `cap sync` (see package.json's cap:sync
// script) to apply the iOS setup steps @capacitor-firebase/authentication's
// own docs require for Google Sign-In, which `cap sync` has no way to know
// about on its own:
// https://github.com/robingenz/capacitor-firebase/blob/main/packages/authentication/docs/setup-google.md
//
// Two things, both silently missing from a plain `cap sync`-generated
// Podfile, and both required for Google sign-in to actually do anything
// natively on iOS — without them, @capacitor-firebase/authentication's own
// iOS source (ios/Plugin/Handlers/GoogleAuthProviderHandler.swift) compiles
// its Google sign-in method bodies away entirely behind
// `#if RGCFA_INCLUDE_GOOGLE`, so the native call resolves to nothing: no
// native UI, no error, no resolve, no reject — eventually surfacing on the
// JS side as a plain "UNIMPLEMENTED" exception, which took a full real
// device + TestFlight debugging session to actually trace back to this:
//
// 1. The `CapacitorFirebaseAuthentication/Google` subspec must be added as
//    its OWN separate `pod` line inside `target 'App' do ... end`, NOT by
//    adding `:subspecs` to the line already generated inside the
//    `capacitor_pods` function — the docs explicitly warn against editing
//    that generated line. (An earlier version of this script did exactly
//    that in-place edit; it didn't work, which is strong evidence this
//    placement distinction is a real functional requirement of how
//    CocoaPods resolves it, not just a style preference.)
// 2. A `post_install` block that sets `CODE_SIGNING_ALLOWED = NO` for every
//    Pods target that's a resource bundle (GoogleSignIn ships one, for its
//    localized strings) — a known Xcode gotcha where newer stricter
//    resource-bundle code-signing requirements can silently break a build
//    that doesn't account for it. `cap sync` generates its own
//    `post_install` block (calling `assertDeploymentTarget`, required by
//    Capacitor itself); CocoaPods only runs the LAST `post_install` block
//    defined in a Podfile if there are multiple, so this merges into the
//    existing one rather than appending a second one that would silently
//    make the first stop running.
const fs = require('fs');
const path = require('path');
const podfilePath = path.join(__dirname, '..', 'ios', 'App', 'Podfile');

if (!fs.existsSync(podfilePath)) {
  console.log('[patch-podfile] ios/App/Podfile not found — skipping (no iOS project here yet)');
  process.exit(0);
}

let content = fs.readFileSync(podfilePath, 'utf8');
let changed = false;

// Undo an earlier version of this script's in-place `:subspecs` edit on
// the capacitor_pods-generated line, if present — see comment above for
// why that placement doesn't work.
const inPlacePattern = /pod 'CapacitorFirebaseAuthentication'(, :path => '[^']*'), :subspecs => \['Google'\]/;
if (inPlacePattern.test(content)) {
  content = content.replace(inPlacePattern, "pod 'CapacitorFirebaseAuthentication'$1");
  changed = true;
  console.log('[patch-podfile] Reverted in-place :subspecs edit on the capacitor_pods line');
}

// Add the Google subspec as its own pod declaration inside the target
// block, right after the capacitor_pods call — exactly where the plugin's
// iOS setup guide places it.
const googlePodLine = "pod 'CapacitorFirebaseAuthentication/Google', :path => '../../node_modules/@capacitor-firebase/authentication'";
if (!content.includes(googlePodLine)) {
  const targetPattern = /(target 'App' do\n(?:.*\n)*?\s*capacitor_pods\n)/;
  if (targetPattern.test(content)) {
    content = content.replace(targetPattern, `$1  ${googlePodLine}\n`);
    changed = true;
    console.log('[patch-podfile] Added the Google pod line inside target \'App\'');
  } else {
    console.warn(`[patch-podfile] Could not find the "target 'App' do ... capacitor_pods" block — add this line to the Podfile's target 'App' block yourself, after the capacitor_pods call:\n  ${googlePodLine}`);
  }
}

// Merge the CODE_SIGNING_ALLOWED-for-bundles step into the existing
// post_install block (added by Capacitor itself for assertDeploymentTarget).
if (!content.includes('CODE_SIGNING_ALLOWED')) {
  const postInstallPattern = /post_install do \|installer\|\n([\s\S]*?)\nend\n/;
  const match = content.match(postInstallPattern);
  if (match) {
    const codeSigningBlock = `  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      if target.respond_to?(:product_type) and target.product_type == "com.apple.product-type.bundle"
        target.build_configurations.each do |config|
          config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
        end
      end
    end
  end
`;
    content = content.replace(postInstallPattern, `post_install do |installer|\n${match[1]}\n${codeSigningBlock}end\n`);
    changed = true;
    console.log('[patch-podfile] Added CODE_SIGNING_ALLOWED=NO post_install step for resource bundles');
  } else {
    console.warn('[patch-podfile] Could not find a post_install block to merge CODE_SIGNING_ALLOWED into — add it to the Podfile yourself per https://github.com/robingenz/capacitor-firebase/blob/main/packages/authentication/docs/setup-google.md');
  }
}

if (changed) {
  fs.writeFileSync(podfilePath, content);
  console.log('[patch-podfile] Podfile updated for Google Sign-In — run `pod install` next');
} else {
  console.log('[patch-podfile] Podfile already up to date — nothing to do');
}

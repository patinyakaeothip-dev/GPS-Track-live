// Mirrors the repo into www/ for Capacitor's webDir — everything the
// static site actually serves, minus tooling/platform folders that either
// shouldn't ship in the app bundle (node_modules) or would recurse into
// themselves (ios/, android/, www/ itself). No rsync dependency so this
// runs the same on the Mac doing the iOS build as it does anywhere else.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'www');
const EXCLUDE_TOP_LEVEL = new Set(['node_modules', 'ios', 'android', 'www', '.git', '.github', 'scripts']);

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

function copy(src, dst, topLevel) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (topLevel && EXCLUDE_TOP_LEVEL.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copy(s, d, false);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
copy(root, dest, true);
console.log('[prepare-www] copied repo into www/');

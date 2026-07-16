# GPS Live Tracking · Rayong Trail Running

A companion web app for trail-running events that pairs live GPS/checkpoint
tracking with QR checkpoint check-in. Runners check in at Start/A1/A2/Finish
via a no-install web flow (scan QR → browser); the Race Director gets a live
dashboard (course chart, roster, alerts); anyone gets a public results page
and printable finisher certificates.

This app was implemented from the `GPS Live Tracking.dc.html` design
prototype (see the Claude Design project). Per the design handoff notes, the
`.dc.html` file itself is a design reference, not shippable code — this repo
is the recreation: plain HTML + React (via CDN + Babel, no build step) wired
to a Google Apps Script backend.

## Pages

- `index.html` — landing page with links to all the pieces below.
- `runner/index.html?cp=start|a1|a2|finish` — the runner check-in flow.
  Each checkpoint has its own QR poster pointing at this URL.
- `results/index.html` — public "all results" list, filterable by distance/status.
- `certificate.html` — printable A4 finisher certificate (reads the last
  finish result out of `localStorage`).
- `monitor.html` — live Race Director dashboard (map/chart + roster + alerts),
  polls the backend every 10s.
- `dashboard.html` — the original design-canvas gallery of screen variants
  (useful for reviewing alternate layouts), plus the same live dashboard.
- `admin/index.html` — admin panel: open/close registration, edit the
  closed-system message, reset all data (with archive).
- `posters/qr-posters.html` — generates printable A4 QR posters for each checkpoint.
- `diagnostics.html` — quick connectivity tests against the Apps Script backend.

## Architecture

- No build step: React 18 + Babel Standalone loaded from CDN, JSX compiled
  in-browser via `<script type="text/babel">`.
- `src/api.js` — thin fetch client for the backend (`window.api(action, params)`).
- `src/data.jsx` — course/checkpoint model, mock roster/scenario generator
  (used by the design-canvas gallery), and the live-state → dashboard-snapshot
  mapper.
- `src/dashboard.jsx` — Race Director dashboard UI (KPI strip, elevation/course
  chart, alerts feed, roster table).
- `src/runner-app.jsx` / `src/runner-live.jsx` — runner-facing check-in flow,
  wired to the backend via `src/api.js`.
- `src/i18n.jsx` — Thai/English strings.
- `ios-frame.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx` — presentation
  helpers used by the design-canvas gallery in `dashboard.html`.

## Backend

All pages read `window.TRT_API_URL`, set inline in each HTML file, pointing
at a deployed Google Apps Script Web App exposing `register` / `checkin` /
`lookup` / `dnf` / `state` / `admin` actions over GET/POST. Point it at your
own deployment to go live; without it, pages that need live data show a
"not configured" banner.

## Assets

- `assets/rayong-trail-logo.jpg` — event logo.
- `assets/course-track.json` — sample GPX-derived course path.

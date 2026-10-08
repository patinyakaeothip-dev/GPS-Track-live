// Cloudflare Pages Function — reverse-proxies /__/auth/* to Firebase's own
// authDomain (see src/firebase-config.js) so OAuth redirect sign-in (Apple,
// and Google when its popup gets blocked — see src/firebase.js's
// popupWithTimeout) stays on this site's own origin end-to-end.
//
// Why this exists: Firebase's default authDomain is a *different* origin
// (rayong-trail-live.firebaseapp.com) than this site (gps-track-live.pages.dev).
// signInWithRedirect() stores pending sign-in state before navigating to
// that other origin, then needs to read it back after the user completes
// sign-in there and gets redirected home. Chrome's third-party storage
// partitioning increasingly blocks exactly that read-back across origins —
// in practice this showed up as: the user completes Apple sign-in
// successfully (confirmed on Apple's own page), lands back on this site,
// and the app just shows the plain login screen again with no error at
// all, because getRedirectResult() silently found nothing to resolve.
//
// Firebase's own documented fix for exactly this (sites not hosted on
// Firebase Hosting, which normally does this automatically) is to point
// authDomain at your own domain and transparently proxy the handful of
// /__/auth/* paths Firebase's SDK needs back to the real authDomain. Doing
// that keeps the whole redirect round-trip same-origin from the browser's
// perspective, so there's no cross-origin storage to partition.
const REAL_AUTH_DOMAIN = 'rayong-trail-live.firebaseapp.com';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, `https://${REAL_AUTH_DOMAIN}`);

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    // Firebase's auth handler page itself issues redirects (back to this
    // app, or onward) as part of the OAuth flow — those need to go to the
    // browser as real redirects (so the URL bar and origin stay correct),
    // not be followed server-side here and have their final content
    // returned instead.
    redirect: 'manual',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

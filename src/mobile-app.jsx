// mobile-app.jsx — the actual runner-facing mobile web app described in the
// "GPS Live Tracking" design (splash → login → event picker → registration →
// GPS permission → pre-race/QR scan → Track/Route/Ranking/Friends tabs →
// profile/SOS/DNF). Runs as a mobile-first PWA-style single page. No real
// backend: auth + registration + GPS positions are simulated client-side and
// persisted to localStorage, matching the design handoff's documented
// simulation approach (deterministic pseudo-tick over the real course GPX).

const { useState: uS, useEffect: uE, useMemo: uM, useRef: uR } = React;

const C = {
  brand: '#2d6a4f', brandDk: '#1f4d39', brandLt: '#357a5c',
  bg: '#f5f1e8', bg2: '#faf8f2', card: '#ffffff',
  border: '#e5e0d3', text: '#1f2a1c', muted: '#5d6b59', mute2: '#a8b1a3',
  orange: '#e07a3e', line: '#06c755',
  font: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif",
  mono: "'JetBrains Mono',ui-monospace,monospace",
};

const LS_KEY = 'trt.mobile.session';
function loadSession() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch (_) { return null; }
}
function saveSession(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (_) {}
}
function clearSession() { try { localStorage.removeItem(LS_KEY); } catch (_) {} }

// Remembers which top-level screen the runner was last looking at, so a
// refresh (accidental or not — flaky mobile signal, browser restart) drops
// them back where they were instead of always re-deriving from session
// state alone. Only "stable" screens are worth remembering — the others are
// one-off steps mid-flow (register/qr-scan/onboarding/...) that assume
// state (like `pendingEvent`) that isn't persisted, so a refresh mid-step
// falls back to initialScreenFor() instead of resuming half-finished.
const LS_SCREEN_KEY = 'trt.screen.v1';
const RESUMABLE_SCREENS = ['events', 'app', 'prerace'];
function loadSavedScreen() {
  try { return localStorage.getItem(LS_SCREEN_KEY); } catch (_) { return null; }
}
function saveScreen(screen) {
  try {
    if (RESUMABLE_SCREENS.includes(screen)) localStorage.setItem(LS_SCREEN_KEY, screen);
    else localStorage.removeItem(LS_SCREEN_KEY);
  } catch (_) {}
}

// Profile persists across logout/login on this device — so the mandatory
// onboarding form only ever shows once per device, not on every login.
const LS_PROFILE_KEY = 'trt.mobile.profile';
function loadProfile() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILE_KEY)) || null; } catch (_) { return null; }
}
function saveProfile(p) {
  try { localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(p)); } catch (_) {}
}

// Favourite runners (❤ picked from the registered-runner list) shown in the
// Friends tab — persisted per device, independent of who you're following.
const LS_FAVS_KEY = 'trt.mobile.favorites';
function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(LS_FAVS_KEY)) || []; } catch (_) { return []; }
}
function saveFavorites(list) {
  try { localStorage.setItem(LS_FAVS_KEY, JSON.stringify(list)); } catch (_) {}
}

// Events come from src/event-store.js (shared with admin/index.html) so
// events created/edited in Admin show up here — see that file's header for
// why this only syncs within one browser until a real backend exists.
function getEvents() {
  return window.eventStore ? window.eventStore.loadEvents() : [];
}

// Loads the real course for a specific event+distance (from GPX uploaded in
// Admin — see src/course-geo.js buildEventCoursePaths) when both are known,
// falling back to the bundled demo course otherwise (e.g. spectator not yet
// following anyone, or an event with no GPX uploaded).
function useCourse(ev, distLabel) {
  const [course, setCourse] = uS(null);
  uE(() => {
    setCourse(null);
    if (ev && distLabel && window.courseGeo) {
      window.courseGeo.courseJsonForDistance(ev, distLabel).then(setCourse).catch(() => {});
    } else {
      fetch('assets/course-track.json').then(r => r.json()).then(setCourse).catch(() => {});
    }
  }, [ev && ev.id, distLabel]);
  return course;
}

// Live GPS position for one runner (src/native/gps-tracker.js writes a
// single doc per runner, id `${eventId}_${bib}`, overwritten on every
// fix) — used by the "follow the race" map to show a real-time dot instead
// of the checkpoint-interpolated one, when the runner's phone is tracking.
function useLivePos(eventId, bib) {
  const [pos, setPos] = uS(null);
  uE(() => {
    setPos(null);
    if (!eventId || !bib || !window.fb) return;
    return window.fb.watchDocById('livePos', `${eventId}_${bib}`, setPos);
  }, [eventId, bib]);
  return pos;
}

// ── Simple button/UI primitives ──────────────────────────────────────────
function Btn({ children, onClick, variant = 'primary', style = {}, disabled }) {
  const base = {
    width: '100%', padding: 16, borderRadius: 12, fontSize: 15, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', fontFamily: C.font,
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: `linear-gradient(135deg,${C.brandLt} 0%,${C.brandDk} 100%)`, color: '#fff',
      boxShadow: '0 8px 22px -6px rgba(26,74,55,0.55)' },
    white: { background: '#fff', color: C.text, border: `1px solid ${C.border}`,
      boxShadow: '0 1px 3px rgba(31,42,28,0.08)' },
    black: { background: '#000', color: '#fff' },
    line: { background: C.line, color: '#fff' },
    ghost: { background: 'transparent', color: C.muted, border: `1px solid ${C.border}` },
    danger: { background: '#9b1c10', color: '#fff' },
  };
  return <button disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

function Kicker({ children }) {
  return <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: C.muted }}>{children}</div>;
}

function Logo({ size = 18 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}/>
    </div>
  );
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Logo size={44}/><span style={{ fontSize: 17, fontWeight: 800, color: C.brandDk }}>Rayong Trail Running</span>
    </div>
  );
}

// ── Screen: Splash ────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  uE(() => { const t = setTimeout(onDone, 1100); return () => clearTimeout(t); }, []);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      background: `linear-gradient(180deg,${C.brand} 0%,${C.brandDk} 100%)`, color: '#fff',
      fontFamily: C.font, padding: '0 24px 40px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ width: 76, height: 76, borderRadius: 20, background: '#fff', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }}/>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 24, fontWeight: 700 }}>Rayong Trail Running</div>
        <Kicker>2026 · GPS TRACKER</Kicker>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: 999, border: '2.5px solid rgba(255,255,255,0.25)',
          borderTopColor: '#fff', animation: 'trtSpin 0.9s linear infinite' }}/>
        <div style={{ fontFamily: C.mono, fontSize: 10.5, color: 'rgba(255,255,255,0.7)' }}>กำลังโหลด...</div>
      </div>
    </div>
  );
}

// ── Screen: Login ─────────────────────────────────────────────────────────
// Google refuses to complete OAuth sign-in at all inside these embedded
// in-app browsers (Line, Facebook, Instagram, ...) — not something fixable
// from our side (popup and redirect both hit the same wall, it's Google's
// own policy against these webviews) — the page just hangs blank after the
// user picks an account. Detect it up front and tell people to open in
// Safari/Chrome instead of letting them hit that dead end.
function detectInAppBrowser() {
  const ua = navigator.userAgent || '';
  if (/\bLine\//i.test(ua)) return 'Line';
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/\bTwitter\b/i.test(ua)) return 'Twitter/X';
  return null;
}
// Best-effort "escape" to a real browser — there's no JS API any in-app
// webview exposes for this, so both of these are unreliable heuristics
// rather than guarantees (Android's intent:// scheme usually launches
// Chrome directly; iOS has no real equivalent since Apple doesn't let a
// webpage force-launch Safari, so x-safari-https:// only works some of the
// time depending on the host app). The manual "..." menu + copy-link
// fallback in the banner is what actually always works.
function tryOpenExternalBrowser() {
  const url = window.location.href;
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
  } else {
    window.location.href = 'x-safari-' + url;
  }
}

function LoginScreen({ onLogin }) {
  const [busy, setBusy] = uS(false);
  const [error, setError] = uS(null);
  const [copied, setCopied] = uS(false);
  const inAppBrowser = uM(() => detectInAppBrowser(), []);

  // On mobile, signInWithGoogle() navigates away (signInWithRedirect) and
  // back instead of resolving a popup promise — pick up that result here
  // once the page reloads, so login completes the same way as the desktop
  // popup flow below. src/firebase.js loads as an async ES module, so
  // window.fb often isn't set yet on this very first effect run right after
  // the redirect brings the page back — checking once and giving up if it's
  // not ready yet silently dropped the completed sign-in, bouncing the user
  // back to this same login screen. Wait for 'trt:firebase-ready' instead.
  uE(() => {
    // The native app never uses signInWithRedirect() (see src/firebase.js —
    // it drives the OS-native Google Sign-In UI instead), so this "did we
    // just come back from a redirect" check is meaningless there. Worse,
    // calling getRedirectResult() inside a Capacitor WKWebView never
    // resolves, which left `busy` stuck true and the login button greyed
    // out from the moment this screen mounted — before the user even
    // touched it.
    if (window.trtNativeAuth && window.trtNativeAuth.isNative()) return;
    let cancelled = false;
    function checkRedirect() {
      if (cancelled || !window.fb || !window.fb.getGoogleRedirectResult) return;
      setBusy(true);
      window.fb.getGoogleRedirectResult().then(result => {
        if (cancelled) return;
        if (result && result.user) {
          const u = result.user;
          onLogin({ uid: u.uid, name: u.displayName || 'นักวิ่ง', email: u.email, photo: u.photoURL, provider: 'google' });
        } else {
          setBusy(false);
        }
      }).catch(() => { if (!cancelled) { setError('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง'); setBusy(false); } });
    }
    if (window.fb) checkRedirect();
    else window.addEventListener('trt:firebase-ready', checkRedirect, { once: true });
    return () => { cancelled = true; window.removeEventListener('trt:firebase-ready', checkRedirect); };
  }, []);

  // signInWithGoogle() tries popup first (resolves right here with a
  // usable result) and only falls back to a redirect (navigates the page
  // away — nothing to do with a return value here, the page unloads before
  // that could happen) for environments that block popups. The redirect
  // case is handled by the getGoogleRedirectResult() effect above once the
  // page comes back.
  async function googleLogin() {
    if (!window.fb) { onLogin({ name: 'มิ้น', provider: 'google' }); return; }
    setBusy(true); setError(null);
    try {
      const result = await window.fb.signInWithGoogle();
      if (result && result.user) {
        const u = result.user;
        onLogin({ uid: u.uid, name: u.displayName || 'นักวิ่ง', email: u.email, photo: u.photoURL, provider: 'google' });
      }
    } catch (e) {
      setError('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง');
      setBusy(false);
    }
  }

  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', padding: '40px 24px 30px', overflow: 'auto' }}>
      <Brand/>
      <div style={{ fontSize: 21, fontWeight: 800, marginTop: 18, color: C.text }}>เข้าสู่ระบบ</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>ไม่ต้องตั้งรหัสผ่าน · เลือกบัญชีที่ใช้อยู่แล้ว</div>
      {error && <div style={{ marginTop: 12, padding: 10, background: '#fde9e6', color: '#9b1c10', borderRadius: 10, fontSize: 12 }}>{error}</div>}
      {inAppBrowser && (
        <div style={{ marginTop: 16, padding: 14, background: '#fdf0d6', border: '1px solid #f0d9a0', borderRadius: 12, fontSize: 12.5, color: '#7c4a03', lineHeight: 1.7 }}>
          ⚠ กำลังเปิดผ่านหน้าต่างในแอป {inAppBrowser} — Google ไม่อนุญาตให้เข้าสู่ระบบจากตรงนี้
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            <button onClick={tryOpenExternalBrowser} style={{ padding: '9px 14px', background: '#7c4a03', border: 'none', borderRadius: 8, fontFamily: C.mono, fontSize: 11.5, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
              🌐 ลองเปิดใน Safari / Chrome อัตโนมัติ
            </button>
            <button onClick={() => {
              navigator.clipboard && navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
            }} style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d8ae5c', borderRadius: 8, fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: '#7c4a03', cursor: 'pointer' }}>
              {copied ? '✓ คัดลอกลิงก์แล้ว — ไปวางใน Safari/Chrome' : '📋 หรือคัดลอกลิงก์นี้ไปวางเอง'}
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.85 }}>
            ถ้ากดแล้วไม่เด้งออกไป: กดไอคอน <b>⋯</b> หรือ <b>แชร์ (⬆️)</b> ที่แถบด้านล่าง/บนของหน้าจอ แล้วเลือก "เปิดใน Safari"
          </div>
        </div>
      )}
      <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Btn variant="white" onClick={googleLogin} disabled={busy || !!inAppBrowser}>G {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}</Btn>
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ textAlign: 'center', fontFamily: C.mono, fontSize: 10.5, color: C.muted, lineHeight: 1.6 }}>
        ไม่มีรหัสผ่านให้จำ · โปรไฟล์เดียวใช้ได้ทุกงานแข่ง
      </div>
    </div>
  );
}

// ── Screen: Event picker ──────────────────────────────────────────────────
function EventCard({ ev, isRegistered, onRunnerSpace, onFollow, onSeeResult }) {
  // Computed live from ev's schedule data on every render (see
  // src/event-status.js) instead of trusting ev.status/ev.closed, which are
  // just a snapshot from whenever Admin last hit save.
  const status = window.eventStatus.computeStatus(ev);
  const closed = window.eventStatus.computeClosed(ev);
  if (status === 'past') {
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
          {ev.logoUrl
            ? <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fff', border: `1px solid ${C.border}`, padding: 4, flexShrink: 0, overflow: 'hidden' }}><img src={ev.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}/></div>
            : <div style={{ width: 46, height: 46, borderRadius: 12, background: '#e5e4df', flexShrink: 0 }}/>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{ev.name}</div>
            <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted, marginTop: 2 }}>{ev.date}{ev.bib ? ` · bib #${ev.bib}` : ''}{ev.distance ? ` · ${ev.distance}` : ''} · จบแล้ว</div>
          </div>
        </div>
        <button onClick={onSeeResult} style={{ width: '100%', padding: 13, background: C.bg, border: 'none', borderTop: `1px solid ${C.border}`, fontSize: 12.5, fontWeight: 700, color: C.brandDk, cursor: 'pointer' }}>🏅 See Result</button>
      </div>
    );
  }
  return (
    <div style={{ background: '#fff', border: status === 'live' ? `2px solid ${C.brand}` : `1px solid ${C.border}`,
      borderRadius: 14, boxShadow: status !== 'live' ? '0 1px 3px rgba(31,42,28,0.08)' : 'none', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
        {ev.logoUrl
          ? <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fff', border: '1px solid #d8d2c2', padding: 4, flexShrink: 0, overflow: 'hidden' }}><img src={ev.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}/></div>
          : status === 'live'
          ? <div style={{ width: 46, height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}/></div>
          : <div style={{ width: 46, height: 46, borderRadius: 12, background: '#e5e4df', flexShrink: 0 }}/>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{ev.name}</div>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted, marginTop: 2 }}>
            {ev.date}{closed ? ' · ปิดรับสมัครแล้ว' : ''}
          </div>
        </div>
        {status === 'live' && <span style={{ fontFamily: C.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: '#fff', background: `linear-gradient(135deg,${C.brandLt},${C.brandDk})`, padding: '4px 10px', borderRadius: 999 }}>LIVE</span>}
      </div>
      <div style={{ display: 'flex' }}>
        <button onClick={onRunnerSpace} style={{ flex: 1, padding: 13, background: (closed && !isRegistered) ? '#e5e4df' : C.orange, color: (closed && !isRegistered) ? '#7c7566' : '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          🏃 Runner Space
          <div style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, opacity: 0.85, marginTop: 1 }}>
            {isRegistered ? 'ไปหน้าติดตามของฉัน' : closed ? 'ปิดรับสมัครแล้ว' : (status === 'live' ? 'ไปหน้าติดตามของฉัน' : 'ดูสถานะการลงทะเบียน')}
          </div>
        </button>
        {status === 'live' && (
          <button onClick={onFollow} style={{ flex: 1, padding: 13, background: C.brand, color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            🔗 Follow the race
            <div style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, opacity: 0.85, marginTop: 1 }}>ดูเพื่อนที่ในงานนี้</div>
          </button>
        )}
      </div>
    </div>
  );
}

function EventPickerScreen({ user, session, onOpenApp, onFollow, onProfile }) {
  const [tab, setTab] = uS('live');
  const [q, setQ] = uS('');
  const [toast, setToast] = uS(null);
  const [events, setEvents] = uS(() => getEvents());
  uE(() => {
    setEvents(getEvents());
    const refresh = () => setEvents(getEvents());
    window.addEventListener('trt:events-updated', refresh);
    return () => window.removeEventListener('trt:events-updated', refresh);
  }, []);
  const filtered = events.filter(e => window.eventStatus.computeStatus(e) === tab && (!q || e.name.toLowerCase().includes(q.toLowerCase())));

  function handleRunnerSpace(ev) {
    const isRegistered = session.runner && session.runner.eventId === ev.id;
    if (window.eventStatus.computeClosed(ev) && !isRegistered) {
      setToast('ปิดรับสมัครแล้วสำหรับงานนี้');
      setTimeout(() => setToast(null), 2400);
      return;
    }
    onOpenApp(ev);
  }

  return (
    <div style={{ height: '100%', background: C.bg, fontFamily: C.font, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {toast && <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
        padding: '10px 16px', background: '#3a3a3a', color: '#fff', borderRadius: 999, fontSize: 12.5, whiteSpace: 'nowrap',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}>🔒 {toast}</div>}
      <div style={{ padding: '40px 20px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <Brand/>
          <Kicker>GPS Trail Tracker</Kicker>
          <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4, color: C.text }}>เลือกงานแข่งของคุณ</div>
        </div>
        <PersonIcon size={38} onClick={onProfile}/>
      </div>
      <div style={{ display: 'flex', gap: 6, background: '#f4f1e8', borderRadius: 12, margin: '0 18px', padding: 4 }}>
        {[['past', 'ผ่านมาแล้ว'], ['live', 'กำลังแข่ง'], ['upcoming', 'กำลังจะมาถึง']].map(([k, l]) => (
          <div key={k} onClick={() => setTab(k)} style={{ flex: 1, textAlign: 'center', padding: 9, borderRadius: 9,
            background: tab === k ? '#fff' : 'transparent', boxShadow: tab === k ? '0 1px 2px rgba(31,42,28,0.08)' : 'none',
            color: tab === k ? C.brandDk : C.muted, fontSize: 12.5, fontWeight: tab === k ? 700 : 600, cursor: 'pointer' }}>{l}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>
          <span style={{ fontSize: 13, color: C.mute2 }}>🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่องาน" style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: C.font, background: 'transparent' }}/>
        </div>
        {filtered.map(ev => (
          <EventCard key={ev.id} ev={ev}
            isRegistered={!!(session.runner && session.runner.eventId === ev.id)}
            onRunnerSpace={() => handleRunnerSpace(ev)}
            onFollow={() => onFollow(ev)}
            onSeeResult={() => window.location.href = 'results/'} />
        ))}
        {filtered.length === 0 && <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 30 }}>ไม่มีงานในหมวดนี้</div>}
      </div>
    </div>
  );
}

// ── Screen: Follow the race · pick a registered runner to follow ─────────
function FollowPickerScreen({ eventId, onBack, onPick }) {
  const [q, setQ] = uS('');
  const [runners, setRunners] = uS(() => (eventId && window.runnerStore ? window.runnerStore.listRunners(eventId) : []));
  uE(() => {
    if (!eventId || !window.runnerStore) return;
    const refresh = () => setRunners(window.runnerStore.listRunners(eventId));
    refresh();
    window.addEventListener('trt:runners-updated', refresh);
    return () => window.removeEventListener('trt:runners-updated', refresh);
  }, [eventId]);
  const filtered = uM(() => {
    const query = q.trim().toLowerCase();
    return runners
      .filter(r => !query || r.bib.includes(query) || r.nickname.toLowerCase().includes(query))
      .sort((a, b) => a.bib.localeCompare(b.bib, undefined, { numeric: true }))
      .slice(0, 40);
  }, [runners, q]);
  return (
    <div style={{ height: '100%', background: C.bg, fontFamily: C.font, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '40px 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <BackBtn onClick={onBack} inline/>
          <Brand/>
        </div>
        <div style={{ fontSize: 21, fontWeight: 800, color: C.text }}>เลือกนักวิ่งที่จะติดตาม</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>เลือกจากนักวิ่งที่ลงทะเบียนในงานนี้ · ค้นหาด้วยชื่อหรือเลข BIB</div>
      </div>
      <div style={{ padding: '0 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>
          <span style={{ fontSize: 13, color: C.mute2 }}>🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ชื่อ หรือ BIB" style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: C.font, background: 'transparent' }}/>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 30 }}>{runners.length === 0 ? 'ยังไม่มีใครลงทะเบียนงานนี้' : 'ไม่พบนักวิ่งที่ค้นหา'}</div>}
        {filtered.map(r => (
          <div key={r.bib} onClick={() => onPick(r.bib)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', cursor: 'pointer' }}>
            <div style={{ width: 36, height: 36, borderRadius: 999, background: C.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{r.nickname[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.nickname}</div>
              <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted }}>bib {r.bib} · {r.distance}</div>
            </div>
            <span style={{ fontSize: 16, color: C.mute2 }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Screen: pick registered runners to favourite (❤) for the Friends tab ──
function FavoritePickerScreen({ eventId, onBack, favBibs, onToggle }) {
  const [q, setQ] = uS('');
  const [runners, setRunners] = uS(() => (eventId && window.runnerStore ? window.runnerStore.listRunners(eventId) : []));
  uE(() => {
    if (!eventId || !window.runnerStore) return;
    const refresh = () => setRunners(window.runnerStore.listRunners(eventId));
    refresh();
    window.addEventListener('trt:runners-updated', refresh);
    return () => window.removeEventListener('trt:runners-updated', refresh);
  }, [eventId]);
  const filtered = uM(() => {
    const query = q.trim().toLowerCase();
    return runners
      .filter(r => !query || r.bib.includes(query) || r.nickname.toLowerCase().includes(query))
      .sort((a, b) => a.bib.localeCompare(b.bib, undefined, { numeric: true }))
      .slice(0, 40);
  }, [runners, q]);
  return (
    <div style={{ height: '100%', background: C.bg, fontFamily: C.font, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '40px 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <BackBtn onClick={onBack} inline/>
          <Brand/>
        </div>
        <div style={{ fontSize: 21, fontWeight: 800, color: C.text }}>เพิ่มเพื่อนที่ติดตาม</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>กด ❤ เพื่อเพิ่ม/ลบจากรายชื่อในแท็บ Friends · ค้นหาด้วยชื่อหรือเลข BIB</div>
      </div>
      <div style={{ padding: '0 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>
          <span style={{ fontSize: 13, color: C.mute2 }}>🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ชื่อ หรือ BIB" style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: C.font, background: 'transparent' }}/>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 30 }}>{runners.length === 0 ? 'ยังไม่มีใครลงทะเบียนงานนี้' : 'ไม่พบนักวิ่งที่ค้นหา'}</div>}
        {filtered.map(r => {
          const fav = favBibs.includes(r.bib);
          return (
            <div key={r.bib} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: C.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{r.nickname[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.nickname}</div>
                <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted }}>bib {r.bib} · {r.distance}</div>
              </div>
              <span onClick={() => onToggle(r.bib)} style={{ fontSize: 20, cursor: 'pointer', color: fav ? '#e0453e' : C.mute2, lineHeight: 1 }}>{fav ? '♥' : '♡'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Screen: Registration ─────────────────────────────────────────────────
function RegisterScreen({ event, profile, onDone, onBack }) {
  const distLabels = (event && event.distances && event.distances.length) ? event.distances.map(d => d.label) : ['11K', '22K', '29K'];
  // Pre-fill from the runner's existing profile (Profile screen) so someone
  // who already filled this in once doesn't have to retype it per event —
  // only the distance is genuinely event-specific and starts unset.
  const [nick, setNick] = uS((profile && (profile.nickname || profile.name)) || '');
  const [phone, setPhone] = uS((profile && profile.phone) || '');
  const [dist, setDist] = uS(distLabels[0]);
  const [gender, setGender] = uS((profile && profile.gender) || 'm');
  const [emg, setEmg] = uS((profile && profile.emgPhone) || '');
  const canSubmit = nick.trim() && phone.trim();
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ padding: '40px 24px 18px', background: C.brand, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <BackBtn onClick={onBack} dark inline/>
          <Logo size={24}/><span style={{ fontSize: 12.5, fontWeight: 700 }}>{(event && event.name) || 'Rayong Trail Running'}</span>
        </div>
        <Kicker><span style={{ color: 'rgba(255,255,255,0.65)' }}>ลงทะเบียน</span></Kicker>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>สวัสดี! กรอกข้อมูลก่อนเริ่มวิ่ง</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>ใช้ครั้งเดียว · ระบบผูกเบอร์โทรกับอุปกรณ์นี้ให้อัตโนมัติ</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="ชื่อเล่น"><input value={nick} onChange={e => setNick(e.target.value)} placeholder="เช่น ธีระ" style={fieldStyle()}/></Field>
        <Field label="เบอร์โทร"><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08X-XXX-XXXX" style={{ ...fieldStyle(), fontFamily: C.mono }}/></Field>
        <Field label="ระยะที่ลงวิ่ง">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${distLabels.length}, 1fr)`, gap: 6 }}>
            {distLabels.map(d => (
              <div key={d} onClick={() => setDist(d)} style={{ padding: 12, textAlign: 'center', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
                background: dist === d ? C.brand : '#fff', color: dist === d ? '#fff' : C.text, border: `1px solid ${dist === d ? C.brand : '#bdb6a4'}` }}>{d}</div>
            ))}
          </div>
        </Field>
        <Field label="เพศ (ใช้จัดอันดับแยกชาย/หญิง)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[['m', 'ชาย'], ['f', 'หญิง']].map(([v, l]) => (
              <div key={v} onClick={() => setGender(v)} style={{ padding: 12, textAlign: 'center', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
                background: gender === v ? C.brand : '#fff', color: gender === v ? '#fff' : C.text, border: `1px solid ${gender === v ? C.brand : '#bdb6a4'}` }}>{l}</div>
            ))}
          </div>
        </Field>
        <Field label="เบอร์ติดต่อฉุกเฉิน"><input value={emg} onChange={e => setEmg(e.target.value)} placeholder="คนใกล้ตัว · กรณีจำเป็น" style={{ ...fieldStyle(), fontFamily: C.mono }}/></Field>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
          <input type="checkbox" defaultChecked style={{ marginTop: 2 }}/>
          <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>ยินยอมให้ระบบเก็บพิกัด GPS ระหว่างแข่งเพื่อความปลอดภัย · ลบทิ้งหลังจบงาน 7 วัน</span>
        </label>
        <Btn style={{ marginTop: 8 }} disabled={!canSubmit} onClick={() => onDone({ nick, phone, dist, gender, emg })}>ยืนยันลงทะเบียน →</Btn>
      </div>
    </div>
  );
}
function RegisterSuccessScreen({ dist, onContinue }) {
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 14 }}>
      <div style={{ width: 68, height: 68, borderRadius: 999, background: `linear-gradient(135deg,${C.brandLt},${C.brandDk})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px -6px rgba(26,74,55,0.55)', fontSize: 30, color: '#fff' }}>✓</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.brandDk }}>ลงทะเบียนสำเร็จ</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>ระยะ {dist} · เตรียมพร้อมสำหรับวันแข่ง<br/>ระบบผูกข้อมูลกับอุปกรณ์นี้ให้แล้ว</div>
      <Btn onClick={onContinue} style={{ marginTop: 8 }}>ถัดไป →</Btn>
    </div>
  );
}
function BackBtn({ onClick, dark, inline }) {
  const stroke = dark ? '#fff' : C.text;
  return (
    <div onClick={onClick} style={{ ...(inline ? { flexShrink: 0 } : { position: 'absolute', top: 40, left: 18, zIndex: 5 }),
      width: 32, height: 32, borderRadius: 10, border: `1.6px solid ${dark ? 'rgba(255,255,255,0.55)' : '#bdb6a4'}`,
      background: dark ? 'rgba(255,255,255,0.08)' : '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M15 5L8 12L15 19" stroke={stroke} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
function PersonIcon({ size = 38, onClick }) {
  const iconSize = Math.round(size * 0.52);
  return (
    <div onClick={onClick} style={{ width: size, height: size, borderRadius: 999, background: '#fff',
      border: `1.8px solid ${C.text}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.6" stroke={C.text} strokeWidth="2"/>
        <path d="M4.5 20c0-4.1 3.36-6.5 7.5-6.5s7.5 2.4 7.5 6.5" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );
}
function HomeIcon({ size = 19, dark, active }) {
  const stroke = active ? '#fff' : (dark ? '#fff' : C.muted);
  return (
    <div style={{ width: size + 13, height: size + 13, borderRadius: 10,
      border: active ? 'none' : `1.8px solid ${dark ? 'rgba(255,255,255,0.6)' : '#a8b1a3'}`,
      background: active ? `linear-gradient(135deg,${C.brandLt},${C.brandDk})` : 'transparent',
      boxShadow: active ? '0 3px 8px -2px rgba(26,74,55,0.55)' : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 11.5L12 4l8 7.5" stroke={stroke} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 10v9h4v-5.5h4V19h4v-9" stroke={stroke} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
function Field({ label, children, required }) {
  return <div><div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 5 }}>{label}{required && <span style={{ color: '#9b1c10' }}> *จำเป็น</span>}</div>{children}</div>;
}
function fieldStyle() { return { width: '100%', padding: '12px 14px', background: '#fff', border: '1px solid #bdb6a4', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: C.font, boxSizing: 'border-box' }; }

// ── Screen: GPS permission ────────────────────────────────────────────────
function GpsPermissionScreen({ onAllow, onBack }) {
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', padding: '28px 24px 30px', position: 'relative' }}>
      <BackBtn onClick={onBack}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: 'oklch(0.94 0.06 145)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📍</div>
        <div style={{ fontSize: 19, fontWeight: 600, color: C.text }}>อนุญาตแชร์ตำแหน่งระหว่างวิ่ง</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, maxWidth: 280 }}>
          จำเป็นสำหรับการเข้าร่วมแข่งขัน — ทีมงานต้องเห็นตำแหน่งของคุณบนแผนที่ตลอดการแข่ง เพื่อช่วยเหลือได้ทันเวลาหากเกิดเหตุฉุกเฉิน · เวลาทางการยังคงยืนยันด้วย QR ที่จุดพักเหมือนเดิม
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Btn onClick={onAllow}>อนุญาตตำแหน่ง (จำเป็น)</Btn>
        <div style={{ textAlign: 'center', fontFamily: C.mono, fontSize: 10, color: '#a8a396' }}>ต้องอนุญาตเพื่อเข้าร่วมการแข่งขัน</div>
      </div>
    </div>
  );
}

// ── Screen: Pre-race waiting + QR scan (simulated) ───────────────────────
function PreRaceScreen({ event, dist, onScan, onBack, onPreview, onCancel }) {
  const de = event && (event.distances || []).find(d => d.label === dist);
  const startClock = de && de.cpTimes && de.cpTimes.start;
  const startAt = uM(() => (event && startClock && window.eventStatus ? window.eventStatus.combineDateTime(event.raceDateISO, startClock) : null), [event, startClock]);
  const [secs, setSecs] = uS(() => (startAt ? Math.round((startAt.getTime() - Date.now()) / 1000) : null));
  uE(() => {
    if (!startAt) return;
    const id = setInterval(() => setSecs(Math.round((startAt.getTime() - Date.now()) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startAt]);
  const remaining = Math.max(0, secs || 0);
  const d = Math.floor(remaining / 86400);
  const h = String(Math.floor((remaining % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
  const s = String(remaining % 60).padStart(2, '0');
  return (
    <div style={{ height: '100%', background: `linear-gradient(180deg,${C.brandDk} 0%,#152f24 100%)`, color: '#fff', fontFamily: C.font, display: 'flex', flexDirection: 'column', padding: '40px 24px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <BackBtn onClick={onBack} dark inline/>
        <Logo size={24}/><span style={{ fontSize: 12.5, fontWeight: 700 }}>{(event && event.name) || 'Rayong Trail Running'}</span>
      </div>
      <Kicker><span style={{ color: 'rgba(255,255,255,0.65)' }}>WAVE {dist}</span></Kicker>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>รอเวลาปล่อยตัว</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {secs === null
          ? <div style={{ fontFamily: C.mono, fontSize: 15, color: 'rgba(255,255,255,0.7)' }}>ยังไม่มีเวลาปล่อยตัวของระยะนี้ — สแกน QR ได้เลยเมื่อกรรมการปล่อยตัว</div>
          : <div style={{ fontFamily: C.mono, fontSize: d > 0 ? 32 : 44, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d > 0 ? `${d} วัน ${h}:${m}:${s}` : `${h}:${m}:${s}`}</div>}
        {startClock && <div style={{ fontFamily: C.mono, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>ปล่อยตัวเวลา {startClock} น.</div>}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)' }}>
        GPS จะเริ่มบันทึกตำแหน่งทันทีที่คุณสแกน QR ที่จุดสตาร์ท — ไม่ใช่ตอนนี้ · ประหยัดแบตระหว่างรอ
      </div>
      <Btn variant="white" onClick={onScan}>📷 สแกน QR ที่จุดสตาร์ท · เริ่ม Track</Btn>
      {onPreview && (
        <Btn variant="ghost" onClick={onPreview} style={{ marginTop: 10, borderColor: 'rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.85)' }}>
          🗺 เปิด Track / Route / Ranking
        </Btn>
      )}
      {onCancel && (
        <div onClick={onCancel} style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.55)', textDecoration: 'underline', cursor: 'pointer' }}>
          ยกเลิกการลงทะเบียน
        </div>
      )}
    </div>
  );
}

function ScanSuccessScreen({ cp, km, onDone }) {
  uE(() => { const t = setTimeout(onDone, 1600); return () => clearTimeout(t); }, []);
  const now = new Date();
  const tstr = now.toTimeString().slice(0, 8);
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 14 }}>
      <div style={{ width: 68, height: 68, borderRadius: 999, background: `linear-gradient(135deg,${C.brandLt},${C.brandDk})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px -6px rgba(26,74,55,0.55)', fontSize: 30, color: '#fff' }}>✓</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.brandDk }}>เช็คอิน {cp} สำเร็จ</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>เวลาที่สแกน {tstr} · กม. {km}</div>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, marginTop: 8 }}>กำลังกลับสู่หน้าติดตาม…</div>
    </div>
  );
}

// Reads the device camera and decodes real QR codes with jsQR (loaded via
// CDN in index.html) — no more auto-succeed-after-a-timeout fake scan.
// expectedCode is the exact string Admin's QR generator encoded for this CP
// (`TRT:{eventId}:{cpKey}`); anything else is rejected so a runner can't
// scan the wrong station's QR and skip ahead.
function QrScanScreen({ label, expectedCode, onScanned, onBack }) {
  const videoRef = uR(null);
  const canvasRef = uR(null);
  const rafRef = uR(null);
  const streamRef = uR(null);
  const [error, setError] = uS(null);
  const [mismatch, setMismatch] = uS(false);

  uE(() => {
    let cancelled = false;
    function cleanup() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    }
    function tick() {
      const video = videoRef.current, canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR && window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        if (code.data === expectedCode) { cleanup(); onScanned(); return; }
        setMismatch(true);
        setTimeout(() => setMismatch(false), 1200);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        tick();
      } catch (e) {
        if (!cancelled) setError('เปิดกล้องไม่ได้ · ตรวจสอบสิทธิ์การใช้กล้องของเบราว์เซอร์');
      }
    })();
    return () => { cancelled = true; cleanup(); };
  }, [expectedCode]);

  return (
    <div style={{ height: '100%', background: '#0a0f0c', color: '#fff', fontFamily: C.font, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <video ref={videoRef} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: error ? 0 : 0.9 }}/>
      <canvas ref={canvasRef} style={{ display: 'none' }}/>
      {onBack && <BackBtn onClick={onBack} dark/>}
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center' }}>
        <Kicker><span style={{ opacity: 0.7 }}>RAYONG TRAIL</span></Kicker>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>สแกน QR ที่{label}</div>
      </div>
      {!error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 200, height: 200, position: 'relative' }}>
            {[['top', 0, 'left', 0], ['top', 0, 'right', 0], ['bottom', 0, 'left', 0], ['bottom', 0, 'right', 0]].map(([vk, vv, hk, hv], i) => (
              <div key={i} style={{ position: 'absolute', [vk]: vv, [hk]: hv, width: 30, height: 30,
                [`border${vk === 'top' ? 'Top' : 'Bottom'}`]: `4px solid ${mismatch ? '#f87171' : '#fff'}`, [`border${hk === 'left' ? 'Left' : 'Right'}`]: `4px solid ${mismatch ? '#f87171' : '#fff'}` }}/>
            ))}
            <div style={{ position: 'absolute', left: 8, right: 8, top: '50%', height: 2, background: 'linear-gradient(90deg,transparent,#4ade80,transparent)' }}/>
          </div>
        </div>
      )}
      {error && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 30 }}>🚫</div>
          <div style={{ fontSize: 13.5 }}>{error}</div>
        </div>
      )}
      <div style={{ padding: '0 24px 40px', textAlign: 'center', fontSize: 13, color: mismatch ? '#f87171' : 'rgba(255,255,255,0.8)' }}>
        {mismatch ? 'QR นี้ไม่ตรงกับจุดนี้ · ลองสแกนป้ายที่ถูกต้อง' : 'ส่อง QR ที่ป้ายให้อยู่ในกรอบ · ระบบจะสแกนอัตโนมัติ'}
      </div>
    </div>
  );
}

// ── Track / Route / Ranking / Friends tabs ───────────────────────────────
// Checkpoint sequence used to be a fixed table keyed by distance label,
// matching one specific course. Now every event carries its own
// `checkpoints` list (see src/admin-app.jsx) — every distance passes
// through start → each checkpoint in order → finish.
function cpSeqFor(event) {
  return ['start', ...((event && event.checkpoints) || []).map(c => c.id), 'finish'];
}
function cpLabelFor(event, cpId) {
  if (cpId === 'start') return 'จุดสตาร์ท';
  if (cpId === 'finish') return 'เส้นชัย';
  const cp = event && (event.checkpoints || []).find(c => c.id === cpId);
  return cp ? cp.label : cpId;
}
function cpKmFor(event, cpId, distLabel) {
  if (cpId === 'start') return 0;
  if (cpId === 'finish') return parseFloat(distLabel) || 0;
  const cp = event && (event.checkpoints || []).find(c => c.id === cpId);
  return cp ? (parseFloat(cp.km) || 0) : 0;
}
// Same idea as src/course-geo.js's nearestKmOnTrack (project a lat/lon onto
// the recorded track, return the nearest point's km) but working against
// this app's tuple point shape ([lat, lon, ele, km]) instead of that
// function's {lat, lon, km} object shape — the two course-loading paths
// (useCourse here vs buildEventCoursePaths for Live Monitor) never got
// unified onto one point format.
// A GPS fix always has *some* nearest point on the course, no matter how
// far away it actually is — projecting it onto the elevation/gradient axis
// unconditionally made both look like the runner was on-course even while
// testing from an office kilometers away. distKm (rough — 1° latitude is
// ~111km, plenty precise for a same-ballpark "are they even near the
// course" check) lets callers ignore the projection past a threshold.
function nearestKmForPoint(points, lat, lon) {
  let best = points[0], bestD = Infinity;
  for (const p of points) {
    const d = (p[0] - lat) ** 2 + (p[1] - lon) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return { km: best[3], distKm: Math.sqrt(bestD) * 111 };
}
// How far off the recorded course a GPS fix can be before it's treated as
// "not actually near this course" for elevation/gradient purposes, rather
// than snapped to the nearest point regardless of distance. Same distance
// used for the off-route alert below — "close enough to show on the
// elevation graph" and "close enough to not be flagged as off-route" are
// meant to be the same claim.
const ON_COURSE_KM = 0.1;
// How long a runner has to stay outside ON_COURSE_KM before it's a real
// alert instead of one noisy GPS fix.
const OFF_ROUTE_ALERT_MS = 2 * 60 * 1000;
// window.courseGeo.gradientAtKm expects {lat,lon,ele,km} object points —
// this app's course.points are [lat,lon,ele,km] tuples, so that function
// can't be reused directly here without converting the whole array first.
// Same % rise/run averaged over a short window as gradientAtKm, just
// reading tuple indices instead.
function eleAtKmForPoints(points, km) {
  const clamped = Math.max(0, Math.min(points[points.length - 1][3], km));
  for (let i = 1; i < points.length; i++) {
    if (points[i][3] >= clamped) {
      const a = points[i - 1], b = points[i];
      const span = b[3] - a[3] || 1;
      const t = (clamped - a[3]) / span;
      return { ele: a[2] + (b[2] - a[2]) * t, km: clamped };
    }
  }
  return { ele: points[points.length - 1][2], km: points[points.length - 1][3] };
}
function gradientAtKmForPoints(points, km) {
  const w = 0.15;
  const p0 = eleAtKmForPoints(points, km - w);
  const p1 = eleAtKmForPoints(points, km + w);
  const rise = p1.ele - p0.ele;
  const run = Math.max(0.02, (p1.km - p0.km)) * 1000;
  return (rise / run) * 100;
}

// Writes the real finish result to the localStorage key certificate.html
// reads (trt.finish.result), so "บันทึกใบประกาศ" always reflects this
// runner's actual checkpoint times/rank instead of the old hardcoded demo
// values the certificate page shipped with.
function saveCertificateResult(session, event, checkins) {
  try {
    const runner = session.runner;
    const startCk = checkins.find(c => c.cp === 'start');
    const finishCk = checkins.find(c => c.cp === 'finish');
    const combine = window.eventStatus && window.eventStatus.combineDateTime;
    const startMs = startCk && combine ? combine(event && event.raceDateISO, startCk.t) : null;
    const finishMs = finishCk && combine ? combine(event && event.raceDateISO, finishCk.t) : Date.now();
    const totalMs = (startMs && finishMs) ? finishMs - startMs : null;

    let rank = null;
    if (window.runnerStore && event && combine) {
      const times = window.runnerStore.listRunners(event.id)
        .filter(r => r.distance === runner.dist && (r.checkins || []).some(c => c.cp === 'finish'))
        .map(r => {
          const s = (r.checkins || []).find(c => c.cp === 'start');
          const f = (r.checkins || []).find(c => c.cp === 'finish');
          const sm = s ? combine(event.raceDateISO, s.t) : null;
          const fm = f ? combine(event.raceDateISO, f.t) : null;
          return { bib: r.bib, ms: (sm != null && fm != null) ? fm - sm : Infinity };
        })
        .sort((a, b) => a.ms - b.ms);
      const idx = times.findIndex(x => x.bib === runner.bib);
      if (idx >= 0) rank = idx + 1;
    }

    const data = {
      runner: { name: runner.name, distance_current: runner.dist, distance_original: runner.dist },
      total_time_ms: totalMs,
      rank,
      finish_at: finishMs,
      distance_km: parseFloat(runner.dist) || 0,
    };
    localStorage.setItem('trt.finish.result', JSON.stringify(data));
  } catch (err) { console.warn('[trt] certificate save failed', err); }
}

function TrackTab({ runner, event, onScan, onSos, onDnf, offRoute }) {
  const seq = cpSeqFor(event);
  const nextIdx = runner.checkins.length;
  const totalKm = parseFloat(runner.dist) || 29;
  const pct = Math.min(100, (runner.progressKm / totalKm) * 100);
  const finished = runner.checkins.some(c => c.cp === 'finish');
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {offRoute && (
        <div style={{ padding: 14, background: '#fdf0d6', border: '1px solid #f0d9a0', borderRadius: 12, fontSize: 12.5, color: '#7c4a03', lineHeight: 1.6 }}>
          ⚠ ตำแหน่งของคุณอยู่นอกเส้นทางมาสักพักแล้ว — ลองเช็คเส้นทางในแท็บ Route หรือกด SOS ถ้าต้องการความช่วยเหลือ
        </div>
      )}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Kicker>ระยะทาง</Kicker>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{runner.progressKm.toFixed(1)}/{totalKm} กม.</span>
        </div>
        <div style={{ height: 8, background: C.bg, borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: C.brand }}/>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
          <Stat label="เพซปัจจุบัน" value={runner.pace}/>
          <Stat label="ความชัน" value={runner.gradient} accent={runner.gradient.startsWith('-') ? C.brand : C.orange}/>
          <Stat label="จุดถัดไป" value={nextIdx < seq.length ? cpLabelFor(event, seq[nextIdx]) : '—'}/>
        </div>
      </div>

      {finished ? (
        <Btn variant="primary" onClick={() => window.open('certificate.html', '_blank')}>🏅 บันทึกใบประกาศ</Btn>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="primary" onClick={onScan} style={{ flex: 1 }}>📷 Scan QR</Btn>
          <Btn variant="danger" onClick={onSos} style={{ flex: 1 }}>🆘 SOS</Btn>
        </div>
      )}

      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>Checkpoints</div>
        {seq.map((cp, i) => {
          const done = i < runner.checkins.length;
          return (
            <div key={cp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: done ? C.brand : C.bg, color: done ? '#fff' : C.mute2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{done ? '✓' : i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: done ? C.text : C.mute2 }}>{cpLabelFor(event, cp)}</span>
              {done && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{runner.checkins[i].t}</span>}
            </div>
          );
        })}
      </div>

      <div onClick={onDnf} style={{ textAlign: 'center', fontFamily: C.mono, fontSize: 11, color: '#9b1c10', cursor: 'pointer', textDecoration: 'underline' }}>
        แจ้งถอนตัว (DNF)
      </div>
    </div>
  );
}
function Stat({ label, value, accent }) {
  return <div style={{ flex: 1 }}><Kicker>{label}</Kicker><div style={{ fontSize: 15, fontWeight: 700, color: accent || C.text, marginTop: 2 }}>{value}</div></div>;
}

function RouteTab({ course, runner, event, spectatorRunner, livePos }) {
  const mapRef = uR(null);
  const mapObj = uR(null);
  const runnerMarkerRef = uR(null);
  uE(() => {
    if (!course || !window.L || !mapRef.current || mapObj.current) return;
    const L = window.L;
    const pts = course.points.map(p => [p[0], p[1]]);
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).fitBounds(pts);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.polyline(pts, { color: C.brand, weight: 4 }).addTo(map);

    // Label start / each checkpoint / finish along the route at the km
    // where they actually sit on this course, same source (ev.checkpoints)
    // as the QR check-in flow — so the map always matches what's really
    // set up for this event instead of a fixed A1/A2 layout.
    function nearestPoint(km) {
      let best = course.points[0], bestDiff = Infinity;
      for (const p of course.points) {
        const diff = Math.abs(p[3] - km);
        if (diff < bestDiff) { bestDiff = diff; best = p; }
      }
      return best;
    }
    // On a loop course, START and FINISH (and sometimes a checkpoint too)
    // can sit at the exact same physical point — anchoring every pill
    // straight above that point would stack them pixel-for-pixel, hiding
    // all but whichever was added last. Nudge each one sideways by a
    // little more than the previous when they share (near enough) the same
    // spot, so every label stays visible instead of one swallowing another.
    const placed = [];
    function addCpMarker(km, label, color) {
      const p = nearestPoint(km);
      const overlapping = placed.filter(q => Math.abs(q.lat - p[0]) < 0.0005 && Math.abs(q.lon - p[1]) < 0.0005).length;
      placed.push({ lat: p[0], lon: p[1] });
      const dx = overlapping * 46;
      L.marker([p[0], p[1]], { icon: L.divIcon({ className: '', iconSize: null, html:
        `<div style="transform:translate(calc(-50% + ${dx}px),-100%);background:${color};color:#fff;font:700 10px 'JetBrains Mono',monospace;padding:3px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);white-space:nowrap;">${label}</div>` }) }).addTo(map);
    }
    addCpMarker(0, 'START', C.brand);
    ((event && event.checkpoints) || []).forEach(cp => addCpMarker(parseFloat(cp.km) || 0, cp.label, C.orange));
    addCpMarker(course.totalKm, 'FINISH', '#9b1c10');

    const idx = Math.min(course.points.length - 1, Math.round((runner.progressKm / course.totalKm) * course.points.length));
    const pos = course.points[idx];
    runnerMarkerRef.current = L.circleMarker([pos[0], pos[1]], { radius: 8, color: '#fff', weight: 2, fillColor: C.orange, fillOpacity: 1 }).addTo(map);
    mapObj.current = map;
  }, [course, event]);
  // Moves the runner dot on its own, separate from the (expensive, one-time)
  // map/route setup above — either to a real GPS fix when one's available,
  // or back to the checkpoint-interpolated point along the route otherwise.
  uE(() => {
    if (!mapObj.current || !runnerMarkerRef.current || !course) return;
    if (livePos && livePos.lat != null && livePos.lon != null) {
      runnerMarkerRef.current.setLatLng([livePos.lat, livePos.lon]);
    } else {
      const idx = Math.min(course.points.length - 1, Math.round((runner.progressKm / course.totalKm) * course.points.length));
      const pos = course.points[idx];
      runnerMarkerRef.current.setLatLng([pos[0], pos[1]]);
    }
  }, [course, runner.progressKm, livePos && livePos.lat, livePos && livePos.lon]);
  // Elevation profile's "you are here" marker used to only ever move on a
  // checkpoint scan (progressKm) even after the map dot above switched to
  // live GPS — same GPS-preferred/checkpoint-fallback rule, just projected
  // onto the 1-D km axis instead of plotted as raw lat/lon.
  const gpsLiveForElevation = livePos && livePos.at && (Date.now() - livePos.at) < 2 * 60 * 1000 && livePos.lat != null;
  const gpsProjection = (gpsLiveForElevation && course) ? nearestKmForPoint(course.points, livePos.lat, livePos.lon) : null;
  const elevationKm = (gpsProjection && gpsProjection.distKm < ON_COURSE_KM) ? gpsProjection.km : runner.progressKm;
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div ref={mapRef} style={{ flex: 1, minHeight: 260, background: '#eee' }}/>
      {spectatorRunner && <FollowedRunnerPanel runner={spectatorRunner} event={event} livePos={livePos}/>}
      <div style={{ padding: '14px 18px 90px', background: '#fff' }}>
        <Kicker>Elevation</Kicker>
        {course && <ElevationSvg course={course} progressKm={elevationKm} checkpoints={(event && event.checkpoints) || []}/>}
      </div>
    </div>
  );
}

// Shown under the map when following a runner ("follow the race" /
// Friends → detail) — a GPS dot alone doesn't say *how* someone's doing
// (on pace, stuck, close to cutoff), only *where*. This pairs it with the
// same checkpoint-time data the runner sees in their own Track tab, plus a
// live speed reading when their phone has an active GPS fix.
function FollowedRunnerPanel({ runner, event, livePos }) {
  const [, setTick] = uS(0);
  uE(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  const seq = cpSeqFor(event);
  const checkins = runner.checkins || [];
  const combine = window.eventStatus && window.eventStatus.combineDateTime;
  const startCk = checkins.find(c => c.cp === 'start');
  const startMs = startCk && combine ? combine(event && event.raceDateISO, startCk.t) : null;
  const finishCk = checkins.find(c => c.cp === 'finish');
  const finished = !!finishCk;
  const finishMs = finishCk && combine ? combine(event && event.raceDateISO, finishCk.t) : null;
  const totalMs = (startMs != null && finishMs != null) ? finishMs - startMs : null;
  const elapsedMs = startMs && !finished ? Date.now() - startMs : null;

  const liveAgeMs = livePos && livePos.at ? Date.now() - livePos.at : null;
  const gpsLive = liveAgeMs != null && liveAgeMs < 2 * 60 * 1000;
  const speedMps = gpsLive ? livePos.speed : null;
  const paceLabel = (speedMps != null && speedMps > 0.3)
    ? (() => { const min = 1000 / speedMps / 60; const mm = Math.floor(min); const ss = Math.round((min - mm) * 60); return `${mm}'${String(ss).padStart(2, '0')}"/กม.`; })()
    : (speedMps != null ? 'หยุดอยู่' : '—');

  function fmtElapsed(ms) {
    if (ms == null) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  return (
    <div style={{ background: '#fff', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', gap: 14, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
        <Stat label={finished ? 'เวลารวม' : 'เวลาที่วิ่งมาแล้ว'} value={fmtElapsed(finished ? totalMs : elapsedMs)}/>
        <Stat label="ความเร็วปัจจุบัน" value={paceLabel} accent={gpsLive ? C.brand : C.mute2}/>
        <Stat label="GPS" value={gpsLive ? '🟢 สด' : (livePos ? '⚪ หลุดสัญญาณ' : '⚪ ยังไม่เริ่ม')}/>
      </div>
      <div>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>Checkpoints</div>
        {seq.map((cp, i) => {
          const done = i < checkins.length;
          return (
            <div key={cp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: done ? C.brand : C.bg, color: done ? '#fff' : C.mute2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{done ? '✓' : i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: done ? C.text : C.mute2 }}>{cpLabelFor(event, cp)}</span>
              {done && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{checkins[i].t}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
// Pan by dragging (one finger/mouse), zoom by pinch (two fingers) or the
// mouse wheel — all done by hand with Pointer Events since this is a plain
// inline SVG, not a charting library. `zoom` is how many times narrower the
// visible km window is than the full course; `panKm` is that window's left
// edge, always clamped so it can't scroll past either end.
function ElevationSvg({ course, progressKm, checkpoints }) {
  const w = 340, h = 112, pad = 6, padBottom = 28, padLeft = 28;
  const pts = course.points;
  const minE = course.minEle, maxE = course.maxEle;
  const totalKm = course.totalKm;

  const [zoom, setZoom] = uS(1);
  const [panKm, setPanKm] = uS(0);
  const pointers = uR(new Map());
  const pinchStart = uR(null); // { dist, zoom }
  const dragStart = uR(null); // { x, panKm }

  const visibleKm = totalKm / zoom;
  const clampPan = p => Math.max(0, Math.min(Math.max(0, totalKm - visibleKm), p));
  const x = km => padLeft + ((km - panKm) / visibleKm) * (w - padLeft - pad);
  const y = ele => (h - padBottom) - ((ele - minE) / (maxE - minE || 1)) * (h - padBottom - pad);
  // 4 evenly spaced elevation labels on the Y axis (rounded to whole
  // meters) so a runner can read actual height, not just relative shape.
  const yTicks = uM(() => {
    const n = 4;
    return Array.from({ length: n }, (_, i) => Math.round(minE + ((maxE - minE) * i) / (n - 1)));
  }, [minE, maxE]);

  function zoomAround(nextZoomRaw, anchorKm) {
    const nextZoom = Math.min(10, Math.max(1, nextZoomRaw));
    const nextVisible = totalKm / nextZoom;
    const frac = visibleKm ? (anchorKm - panKm) / visibleKm : 0;
    setZoom(nextZoom);
    setPanKm(clampPan(anchorKm - frac * nextVisible));
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * w;
    const anchorKm = panKm + Math.max(0, (svgX - padLeft) / (w - padLeft - pad)) * visibleKm;
    zoomAround(zoom * (e.deltaY < 0 ? 1.25 : 1 / 1.25), anchorKm);
  }
  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 1) dragStart.current = { x: e.clientX, panKm };
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.abs(a - b) || 1, zoom };
      dragStart.current = null;
    }
  }
  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.abs(a - b) || 1;
      zoomAround(pinchStart.current.zoom * (dist / pinchStart.current.dist), panKm + visibleKm / 2);
    } else if (pointers.current.size === 1 && dragStart.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const dxKm = ((e.clientX - dragStart.current.x) / rect.width) * w / (w - padLeft - pad) * visibleKm;
      setPanKm(clampPan(dragStart.current.panKm - dxKm));
    }
  }
  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
    pinchStart.current = null;
    dragStart.current = pointers.current.size === 1
      ? { x: [...pointers.current.values()][0], panKm } : null;
  }
  function resetZoom() { setZoom(1); setPanKm(0); }

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[3]).toFixed(1)},${y(p[2]).toFixed(1)}`).join(' ');
  const markX = x(Math.min(progressKm, course.totalKm));
  const marks = [[0, 'START'], ...(checkpoints || []).map(cp => [parseFloat(cp.km) || 0, cp.label]), [course.totalKm, 'FINISH']];
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, marginTop: 6, touchAction: 'none', cursor: zoom > 1 ? 'grab' : 'default' }}
        onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {yTicks.map((ele, i) => (
          <g key={i}>
            <line x1={padLeft} y1={y(ele)} x2={w - pad} y2={y(ele)} stroke={C.muted} strokeWidth="1" strokeDasharray="2 3" opacity="0.25"/>
            <text x={padLeft - 4} y={y(ele) + 3} textAnchor="end" fontFamily={C.mono} fontSize="7.5" fill={C.muted}>{ele}m</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={C.brand} strokeWidth="2"/>
        <line x1={markX} y1="0" x2={markX} y2={h - padBottom} stroke={C.orange} strokeWidth="1.5" strokeDasharray="3 3"/>
        {marks.map(([km, label], i) => (
          <g key={i}>
            <line x1={x(km)} y1="0" x2={x(km)} y2={h - padBottom} stroke={C.brand} strokeWidth="1" strokeDasharray="2 3" opacity="0.35"/>
            <text x={x(km)} y={h - 16} textAnchor="middle" fontFamily={C.mono} fontSize="8" fill={C.muted}>{label}</text>
            <text x={x(km)} y={h - 6} textAnchor="middle" fontFamily={C.mono} fontSize="7.5" fill={C.muted} opacity="0.8">{km.toFixed(1)}K</text>
          </g>
        ))}
      </svg>
      {zoom > 1.02 && (
        <div onClick={resetZoom} style={{ position: 'absolute', top: 2, right: 2, padding: '3px 8px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 999, fontFamily: C.mono, fontSize: 9.5, color: C.muted, cursor: 'pointer', boxShadow: '0 1px 3px rgba(31,42,28,0.1)' }}>↺ รีเซ็ตซูม</div>
      )}
    </div>
  );
}

function RankingTab({ snap, eventId, event }) {
  const distLabels = (event && event.distances && event.distances.length) ? event.distances.map(d => d.label) : ['11K', '22K', '29K'];
  const [dist, setDist] = uS(distLabels[0]);
  const [gender, setGender] = uS('all');
  // When we know the real event (registered runner), rank the real roster
  // (src/runner-store.js) the same way Results does — finished first by
  // elapsed progress, then by checkpoint progress — instead of the fully
  // simulated demo snapshot, which is what Results already switched to.
  // Spectators following the demo course (no real eventId yet) still see
  // the simulated ranking as a fallback.
  const [realRunners, setRealRunners] = uS(() => (eventId && window.runnerStore ? window.runnerStore.listRunners(eventId) : null));
  uE(() => {
    if (!eventId || !window.runnerStore) { setRealRunners(null); return; }
    const refresh = () => setRealRunners(window.runnerStore.listRunners(eventId));
    refresh();
    window.addEventListener('trt:runners-updated', refresh);
    return () => window.removeEventListener('trt:runners-updated', refresh);
  }, [eventId]);

  const rows = uM(() => {
    if (realRunners) {
      return realRunners
        .filter(r => r.distance === dist && !r.dnf && (gender === 'all' || r.gender === gender))
        .map(r => ({ bib: r.bib, name: r.nickname, progressKm: r.progressKm, finished: (r.checkins || []).some(c => c.cp === 'finish') }))
        .sort((a, b) => (a.finished === b.finished ? 0 : a.finished ? -1 : 1) || b.progressKm - a.progressKm)
        .slice(0, 30);
    }
    if (!snap) return [];
    return snap.runners.filter(r => r.distance === dist && (gender === 'all' || r.gender === gender))
      .sort((a, b) => (a.status === 'finished' ? 0 : 1) - (b.status === 'finished' ? 0 : 1) || b.progressKm - a.progressKm)
      .slice(0, 30)
      .map(r => ({ bib: r.bib, name: `${r.firstName} ${r.lastName}`, progressKm: r.progressKm }));
  }, [realRunners, snap, dist, gender]);
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 90px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {distLabels.map(d => (
          <div key={d} onClick={() => setDist(d)} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: dist === d ? C.brand : '#fff', color: dist === d ? '#fff' : C.text, border: `1px solid ${dist === d ? C.brand : C.border}` }}>{d}</div>
        ))}
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['all', 'ทั้งหมด'], ['m', 'ชาย'], ['f', 'หญิง']].map(([k, l]) => (
            <div key={k} onClick={() => setGender(k)} style={{ padding: '6px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: gender === k ? C.bg : 'transparent', color: gender === k ? C.brandDk : C.muted }}>{l}</div>
          ))}
        </div>
      </div>
      {rows.map((r, i) => (
        <div key={r.bib} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 26, fontFamily: C.mono, fontWeight: 700, color: i < 3 ? C.brandDk : C.muted, fontSize: 13 }}>
            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
          </span>
          <span style={{ flex: 1, fontSize: 13.5 }}>{r.name}</span>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{r.progressKm.toFixed(1)}K</span>
        </div>
      ))}
    </div>
  );
}

// Status text for a real runner-store record (no live GPS position yet —
// see AppShell's Track tab notes — so this reflects checkpoint progress,
// same basis as Results/Ranking).
function runnerStatusLabel(r) {
  if (r.dnf) return 'DNF';
  if ((r.checkins || []).some(c => c.cp === 'finish')) return 'เข้าเส้นชัยแล้ว';
  if ((r.checkins || []).length) return 'กำลังวิ่งอยู่';
  return 'ยังไม่เริ่ม';
}

function FriendsTab({ eventId, followedBib, favBibs, onAddFavorite, onRemoveFavorite }) {
  const [runners, setRunners] = uS(() => (eventId && window.runnerStore ? window.runnerStore.listRunners(eventId) : []));
  const [detailBib, setDetailBib] = uS(null);
  uE(() => {
    if (!eventId || !window.runnerStore) return;
    const refresh = () => setRunners(window.runnerStore.listRunners(eventId));
    refresh();
    window.addEventListener('trt:runners-updated', refresh);
    return () => window.removeEventListener('trt:runners-updated', refresh);
  }, [eventId]);

  const followed = runners.find(r => r.bib === followedBib);
  const favs = uM(() => favBibs.map(bib => runners.find(r => r.bib === bib)).filter(Boolean), [runners, favBibs]);
  const detail = runners.find(r => r.bib === detailBib);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {followed && (
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>กำลังติดตามอยู่</div>
          <div onClick={() => setDetailBib(followed.bib)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', cursor: 'pointer' }}>
            <div style={{ width: 36, height: 36, borderRadius: 999, background: C.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>{followed.nickname[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{followed.nickname}</div>
              <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted }}>bib {followed.bib} · {followed.distance} · {runnerStatusLabel(followed)}</div>
            </div>
          </div>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>เพื่อนที่ favourite ({favs.length})</div>
          <button onClick={onAddFavorite} style={{ padding: '6px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: C.mono, fontSize: 10.5, fontWeight: 700, color: C.brand, cursor: 'pointer' }}>♥ เพิ่มเพื่อน</button>
        </div>
        {favs.length === 0 && <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 24, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12 }}>ยังไม่มีเพื่อนที่ favourite · กด "♥ เพิ่มเพื่อน"</div>}
        {favs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {favs.map(r => (
              <div key={r.bib} onClick={() => setDetailBib(r.bib)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: 999, background: C.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{r.nickname[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.nickname}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted }}>bib {r.bib} · {r.distance} · {runnerStatusLabel(r)}</div>
                </div>
                <span onClick={e => { e.stopPropagation(); onRemoveFavorite(r.bib); }} style={{ fontSize: 18, cursor: 'pointer', color: '#e0453e', lineHeight: 1 }}>♥</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {detail && <FriendDetailSheet runner={detail} onClose={() => setDetailBib(null)}/>}
    </div>
  );
}

// Tapping a friend card shows their track progress right here instead of
// trying to switch the whole app into "spectator mode" — a signed-in
// runner's session can only ever be a runner or a spectator, not both, so
// following a friend from inside your own Track tab needs its own lighter
// view rather than reusing the full follow-a-race flow.
function FriendDetailSheet({ runner: r, onClose }) {
  const cks = r.checkins || [];
  const last = cks[cks.length - 1];
  return (
    <Overlay>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}/>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#fff', borderRadius: '18px 18px 0 0', padding: '20px 22px 32px', boxShadow: '0 -8px 30px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: C.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 600, flexShrink: 0 }}>{r.nickname[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{r.nickname}</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>bib {r.bib} · {r.distance}</div>
          </div>
          <div onClick={onClose} style={{ width: 30, height: 30, borderRadius: 10, border: `1.6px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14 }}>✕</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Stat label="ระยะที่วิ่งไปแล้ว" value={`${(r.progressKm || 0).toFixed(1)} กม.`}/>
          <Stat label="สถานะ" value={runnerStatusLabel(r)}/>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>เช็คอินล่าสุด</div>
        {last
          ? <div style={{ fontSize: 13.5 }}>{cpCheckinLabel(last.cp)} · <span style={{ fontFamily: C.mono, color: C.muted }}>{last.t} น.</span></div>
          : <div style={{ fontSize: 13, color: C.muted }}>ยังไม่มีการเช็คอิน</div>}
      </div>
    </Overlay>
  );
}
function cpCheckinLabel(cp) {
  if (cp === 'start') return 'จุดสตาร์ท';
  if (cp === 'finish') return 'เส้นชัย';
  return cp;
}

// ── SOS / DNF flows ───────────────────────────────────────────────────────
function SosScreen({ hotline, onCancel, onSent, onSend }) {
  const [reason, setReason] = uS(null);
  const [sent, setSent] = uS(false);
  const tel = (hotline || '').replace(/[^\d+]/g, '');
  if (sent) {
    return (
      <div style={{ height: '100%', background: '#fde9e6', fontFamily: C.font, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 14 }}>
        <div style={{ fontSize: 40 }}>🆘</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#9b1c10' }}>ส่งสัญญาณขอความช่วยเหลือแล้ว</div>
        <div style={{ fontSize: 13, color: C.text }}>ทีมงานเห็นตำแหน่งล่าสุดของคุณใน Live Monitor แล้ว</div>
        {tel
          ? <Btn variant="danger" onClick={() => window.location.href = `tel:${tel}`} style={{ marginTop: 10 }}>📞 โทรสายด่วนทีมกู้ภัย {hotline}</Btn>
          : <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, marginTop: 10 }}>งานนี้ยังไม่ได้ตั้งเบอร์สายด่วนไว้ในระบบ</div>}
        <Btn variant="ghost" onClick={onSent}>กลับสู่หน้าติดตาม</Btn>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', padding: '40px 24px' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#9b1c10' }}>🆘 ต้องการความช่วยเหลือ</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>เลือกสาเหตุ ทีมงานจะรีบไปหาคุณ</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
        {['บาดเจ็บ', 'หลงทาง', 'เจอสัตว์อันตราย', 'อื่นๆ'].map(r => (
          <div key={r} onClick={() => setReason(r)} style={{ padding: 14, borderRadius: 10, cursor: 'pointer',
            background: reason === r ? C.brand : '#fff', color: reason === r ? '#fff' : C.text, border: `1px solid ${reason === r ? C.brand : C.border}` }}>{r}</div>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <Btn variant="danger" disabled={!reason} onClick={() => { onSend(reason); setSent(true); }}>ส่งสัญญาณ SOS</Btn>
      <Btn variant="ghost" onClick={onCancel} style={{ marginTop: 8 }}>ยกเลิก</Btn>
    </div>
  );
}

function ConfirmScreen({ title, body, confirmLabel, onCancel, onConfirm }) {
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>{body}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        <Btn variant="danger" onClick={onConfirm}>{confirmLabel}</Btn>
        <Btn variant="ghost" onClick={onCancel}>ไม่ยกเลิก</Btn>
      </div>
    </div>
  );
}
function DnfScreen({ onCancel, onConfirm }) {
  const [reason, setReason] = uS(null);
  const [done, setDone] = uS(false);
  if (done) {
    return (
      <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 14 }}>
        <div style={{ fontSize: 40 }}>🏳️</div>
        <div style={{ fontSize: 19, fontWeight: 800 }}>ทีมงานรับตำแหน่งล่าสุดแล้ว</div>
        <div style={{ fontSize: 13, color: C.muted }}>ขอบคุณที่แจ้งเข้ามา · ดูแลตัวเองด้วยนะครับ</div>
        <Btn onClick={onConfirm} style={{ marginTop: 10 }}>กลับสู่หน้าแรก</Btn>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', padding: '40px 24px' }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>แจ้งถอนตัว (DNF)</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>เลือกเหตุผล</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
        {['บาดเจ็บ', 'คาดว่าไม่ทัน cut-off', 'อื่นๆ'].map(r => (
          <div key={r} onClick={() => setReason(r)} style={{ padding: 14, borderRadius: 10, cursor: 'pointer',
            background: reason === r ? C.brand : '#fff', color: reason === r ? '#fff' : C.text, border: `1px solid ${reason === r ? C.brand : C.border}` }}>{r}</div>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <Btn variant="danger" disabled={!reason} onClick={() => setDone(true)}>ยืนยันถอนตัว</Btn>
      <Btn variant="ghost" onClick={onCancel} style={{ marginTop: 8 }}>ยกเลิก</Btn>
    </div>
  );
}

function ProfileScreen({ user, onLogout, onClose, onSave, onboard }) {
  const [nickname, setNickname] = uS(user.nickname || user.name || '');
  const [gender, setGender] = uS(user.gender || '');
  const [phone, setPhone] = uS(user.phone || '');
  const [email, setEmail] = uS(user.email || '');
  const [emgName, setEmgName] = uS(user.emgName || '');
  const [emgPhone, setEmgPhone] = uS(user.emgPhone || '');
  const [bloodType, setBloodType] = uS(user.bloodType || '');
  const [medical, setMedical] = uS(user.medical || '');
  const [saved, setSaved] = uS(false);
  const canSubmit = !onboard || (nickname.trim() && phone.trim() && emgName.trim() && emgPhone.trim());

  function save() {
    onSave({ ...user, nickname, gender, phone, email, emgName, emgPhone, bloodType, medical });
    if (onboard) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', padding: '40px 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{onboard ? 'ยินดีต้อนรับ 👋' : 'โปรไฟล์'}</div>
          {onboard && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>กรอกข้อมูลก่อนเริ่มใช้งานครั้งแรก · ครั้งต่อไปไม่ต้องกรอกอีก</div>}
        </div>
        {!onboard && <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: C.muted }}>×</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexShrink: 0 }}>
        <PersonIcon size={52}/>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{nickname || user.name}</div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{user.provider || 'google'} · เข้าสู่ระบบแล้ว</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="ชื่อเล่น" required={onboard}><input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="เช่น ธีระ" style={fieldStyle()}/></Field>
        <Field label="เพศ">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[['m', 'ชาย'], ['f', 'หญิง']].map(([v, l]) => (
              <div key={v} onClick={() => setGender(v)} style={{ padding: 10, textAlign: 'center', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
                background: gender === v ? C.brand : '#fff', color: gender === v ? '#fff' : C.text, border: `1px solid ${gender === v ? C.brand : '#bdb6a4'}` }}>{l}</div>
            ))}
          </div>
        </Field>
        <Field label="เบอร์โทร" required={onboard}><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08X-XXX-XXXX" style={{ ...fieldStyle(), fontFamily: C.mono }}/></Field>
        <Field label="อีเมล"><input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={{ ...fieldStyle(), fontFamily: C.mono }}/></Field>
        <Field label="ผู้ติดต่อฉุกเฉิน · ชื่อ" required={onboard}><input value={emgName} onChange={e => setEmgName(e.target.value)} placeholder="ชื่อคนใกล้ตัว" style={fieldStyle()}/></Field>
        <Field label="ผู้ติดต่อฉุกเฉิน · เบอร์" required={onboard}><input value={emgPhone} onChange={e => setEmgPhone(e.target.value)} placeholder="08X-XXX-XXXX" style={{ ...fieldStyle(), fontFamily: C.mono }}/></Field>
        <Field label="กรุ๊ปเลือด">
          <select value={bloodType} onChange={e => setBloodType(e.target.value)} style={fieldStyle()}>
            <option value="">— ไม่ระบุ —</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bt => <option key={bt} value={bt}>{bt}</option>)}
          </select>
        </Field>
        <Field label="โรคประจำตัว / ข้อมูลสำคัญทางการแพทย์"><input value={medical} onChange={e => setMedical(e.target.value)} placeholder="เช่น หอบหืด, แพ้ยา" style={fieldStyle()}/></Field>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <Btn disabled={!canSubmit} onClick={save}>{onboard ? 'เริ่มใช้งาน →' : (saved ? '✓ บันทึกแล้ว' : 'บันทึกโปรไฟล์')}</Btn>
        {!onboard && <Btn variant="ghost" onClick={onLogout}>ออกจากระบบ</Btn>}
      </div>
    </div>
  );
}

// ── App shell with bottom tabs ────────────────────────────────────────────
function AppShell({ user, session, updateRunner, onSos, onDnf, onProfile, onHome }) {
  const isSpectator = !!session.spectator;
  const [tab, setTab] = uS(isSpectator ? 'friends' : 'track');
  const [scanning, setScanning] = uS(false);
  const [scanned, setScanned] = uS(null);
  const [pickingFav, setPickingFav] = uS(false);
  const [favBibs, setFavBibs] = uS(() => loadFavorites());
  const snap = uM(() => (window.buildSnapshot ? window.buildSnapshot('mid') : null), []);
  const currentEventId = isSpectator ? session.followEventId : (session.runner && session.runner.eventId);
  const currentEvent = uM(() => (currentEventId ? getEvents().find(e => e.id === currentEventId) : null), [currentEventId]);
  const currentDist = isSpectator
    ? (currentEventId && window.runnerStore ? (window.runnerStore.listRunners(currentEventId).find(r => r.bib === session.followBib) || {}).distance : null)
    : (session.runner && session.runner.dist);
  const course = useCourse(currentEvent, currentDist);
  const [followedRunner, setFollowedRunner] = uS(() =>
    (isSpectator && currentEventId && window.runnerStore) ? window.runnerStore.listRunners(currentEventId).find(r => r.bib === session.followBib) : null);
  uE(() => {
    if (!isSpectator || !currentEventId || !window.runnerStore) return;
    const refresh = () => setFollowedRunner(window.runnerStore.listRunners(currentEventId).find(r => r.bib === session.followBib));
    refresh();
    window.addEventListener('trt:runners-updated', refresh);
    return () => window.removeEventListener('trt:runners-updated', refresh);
  }, [isSpectator, currentEventId, session.followBib]);
  // GPS is the source of truth for *where* everyone is on the map — a
  // runner should see their own dot move the same way a spectator or RD
  // does, not stay pinned to their last QR scan. Checkpoint check-ins stay
  // the source of truth for *progress* (pace, distance completed, cutoff
  // tracking) since GPS alone can't tell "did they finish this loop yet."
  const ownBib = !isSpectator && session.runner && session.runner.bib;
  const livePos = useLivePos(currentEventId, isSpectator ? session.followBib : ownBib);

  // Off-route alert: a single momentarily-noisy GPS fix shouldn't trigger
  // this, so it only fires once the runner has been consistently >100m
  // from the course for a while — tracked as a timestamp in a ref (not
  // state) since it's an implementation detail nothing else reads.
  // Re-evaluated on a timer too, not just when a new GPS fix arrives,
  // because a runner who's stopped moving off-route stops producing new
  // pings entirely (the native tracker only pushes on ~10m of movement) —
  // without the timer, someone who wandered off and then sat down would
  // never actually cross the sustained-duration threshold.
  const [isOffRoute, setIsOffRoute] = uS(false);
  const offRouteSinceRef = uR(null);
  uE(() => {
    const finished = session.runner && session.runner.checkins.some(c => c.cp === 'finish');
    if (isSpectator || !session.runner || !course || !session.runner.checkins.length || finished || session.runner.dnf) {
      offRouteSinceRef.current = null;
      setIsOffRoute(false);
      return;
    }
    function evaluate() {
      const gpsLive = livePos && livePos.at && (Date.now() - livePos.at) < 2 * 60 * 1000 && livePos.lat != null;
      if (!gpsLive) { offRouteSinceRef.current = null; setIsOffRoute(false); return; }
      const { distKm } = nearestKmForPoint(course.points, livePos.lat, livePos.lon);
      if (distKm > ON_COURSE_KM) {
        if (!offRouteSinceRef.current) offRouteSinceRef.current = Date.now();
        setIsOffRoute(Date.now() - offRouteSinceRef.current > OFF_ROUTE_ALERT_MS);
      } else {
        offRouteSinceRef.current = null;
        setIsOffRoute(false);
      }
    }
    evaluate();
    const id = setInterval(evaluate, 20000);
    return () => clearInterval(id);
  }, [isSpectator, session.runner, course, livePos]);

  // Track tab's "เพซปัจจุบัน"/"ความชัน" used to be hardcoded demo strings
  // ("6'42\"/กม.", "+4.2%") shown for every runner regardless of how they
  // were actually doing. Pace now comes from live GPS speed when a fix is
  // fresh (<2min), falling back to average pace-so-far (elapsed ÷ distance
  // covered) — same reasoning as everywhere else GPS/checkpoints are mixed.
  // Gradient reads the real course elevation at the runner's current km.
  const trackPace = uM(() => {
    if (isSpectator || !session.runner || !session.runner.checkins.length) return '—';
    const gpsLive = livePos && livePos.at && (Date.now() - livePos.at) < 2 * 60 * 1000;
    if (gpsLive && livePos.speed > 0.3) {
      const min = 1000 / livePos.speed / 60;
      const mm = Math.floor(min), ss = Math.round((min - mm) * 60);
      return `${mm}'${String(ss).padStart(2, '0')}"/กม.`;
    }
    const combine = window.eventStatus && window.eventStatus.combineDateTime;
    const startCk = session.runner.checkins.find(c => c.cp === 'start');
    const startMs = startCk && combine && currentEvent ? combine(currentEvent.raceDateISO, startCk.t) : null;
    const km = session.runner.progressKm;
    if (!startMs || !km) return gpsLive ? 'หยุดอยู่' : '—';
    const min = (Date.now() - startMs) / 60000 / km;
    if (!isFinite(min) || min <= 0) return '—';
    const mm = Math.floor(min), ss = Math.round((min - mm) * 60);
    return `${mm}'${String(ss).padStart(2, '0')}"/กม.`;
  }, [isSpectator, session.runner, currentEvent, livePos]);
  const trackGradient = uM(() => {
    if (isSpectator || !session.runner || !session.runner.checkins.length || !course || !course.points) return '—';
    const gpsLive = livePos && livePos.at && (Date.now() - livePos.at) < 2 * 60 * 1000 && livePos.lat != null;
    const projection = gpsLive ? nearestKmForPoint(course.points, livePos.lat, livePos.lon) : null;
    const km = (projection && projection.distKm < ON_COURSE_KM) ? projection.km : session.runner.progressKm;
    const g = gradientAtKmForPoints(course.points, km);
    return `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`;
  }, [isSpectator, session.runner, course, livePos]);

  function toggleFavorite(bib) {
    setFavBibs(list => {
      const next = list.includes(bib) ? list.filter(b => b !== bib) : [...list, bib];
      saveFavorites(next);
      return next;
    });
  }

  const seq = !isSpectator && cpSeqFor(currentEvent);
  const nextCp = seq && seq[session.runner.checkins.length];

  function doScan() {
    setScanning(true);
  }
  function scanComplete() {
    setScanning(false);
    const t = new Date().toTimeString().slice(0, 8);
    const km = cpKmFor(currentEvent, nextCp, session.runner.dist);
    const checkins = [...session.runner.checkins, { cp: nextCp, t }];
    updateRunner(r => ({ ...r, checkins, progressKm: km }));
    setScanned({ cp: cpLabelFor(currentEvent, nextCp), km });
    // Scanning the start CP is the "gun goes off" moment — that's when GPS
    // should start recording, not the instant the phone got permission.
    if (window.trtGpsTracker) {
      if (nextCp === 'start') {
        const bib = session.runner.bib || session.user.uid || session.user.name;
        window.trtGpsTracker.start(session.runner.eventId, bib);
      } else if (nextCp === 'finish') {
        window.trtGpsTracker.stop();
      }
    }
    if (nextCp === 'finish') saveCertificateResult(session, currentEvent, checkins);
  }

  if (scanning) return <QrScanScreen label={nextCp === 'start' ? 'จุดสตาร์ท' : cpLabelFor(currentEvent, nextCp)}
    expectedCode={`TRT:${session.runner.eventId}:${nextCp}`} onBack={() => setScanning(false)} onScanned={scanComplete}/>;
  if (scanned) return <ScanSuccessScreen cp={scanned.cp} km={scanned.km} onDone={() => setScanned(null)}/>;
  if (pickingFav) return <FavoritePickerScreen eventId={currentEventId} onBack={() => setPickingFav(false)} favBibs={favBibs} onToggle={toggleFavorite}/>;

  const TABS = [
    !isSpectator && ['track', '🏃', 'Track'],
    ['route', '🗺', 'Route'], ['ranking', '🏆', 'Ranking'], ['friends', '👥', 'Friends'],
    ['event', '📍', 'Event'],
  ].filter(Boolean);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: C.font, overflow: 'hidden' }}>
      <div style={{ padding: '40px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Brand/>
        <PersonIcon size={30} onClick={onProfile}/>
      </div>
      {!isSpectator && tab === 'track' && <TrackTab runner={{ ...session.runner,
        pace: trackPace, gradient: trackGradient }} event={currentEvent} onScan={doScan} onSos={onSos} onDnf={onDnf} offRoute={isOffRoute}/>}
      {tab === 'route' && <RouteTab course={course} event={currentEvent}
        runner={isSpectator ? (followedRunner ? { dist: followedRunner.distance, progressKm: followedRunner.progressKm } : { dist: '22K', progressKm: 0 }) : session.runner}
        spectatorRunner={isSpectator ? followedRunner : null} livePos={livePos}/>}
      {tab === 'ranking' && <RankingTab snap={snap} eventId={!isSpectator ? session.runner.eventId : null} event={currentEvent}/>}
      {tab === 'friends' && <FriendsTab eventId={currentEventId} followedBib={isSpectator ? session.followBib : (session.runner && session.runner.bib)} favBibs={favBibs} onAddFavorite={() => setPickingFav(true)} onRemoveFavorite={toggleFavorite}/>}
      <div style={{ flexShrink: 0, display: 'flex', borderTop: `1px solid #d8d2c2`, background: '#fff', padding: '6px 4px 20px' }}>
        {TABS.map(([k, icon, label]) => (
          <div key={k} onClick={() => k === 'event' ? onHome() : setTab(k)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0', color: tab === k ? C.brand : C.mute2, cursor: 'pointer' }}>
            {k === 'event' ? <HomeIcon size={17} active={tab === k}/> : <span style={{ fontSize: 19 }}>{icon}</span>}
            <span style={{ fontFamily: C.mono, fontSize: 9.5, fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
// Same "have they actually scanned the start QR yet" check used when
// opening the runner space and on every page load/refresh — a registered
// runner who hasn't started belongs on the pre-race countdown, not the
// live Track screen, no matter how they got back into the app.
function initialScreenFor(session, savedScreen) {
  if (!session) return 'splash';
  if (session.spectator) return savedScreen === 'events' ? 'events' : 'app';
  if (session.runner) {
    if (savedScreen === 'events') return 'events';
    const started = (session.runner.checkins || []).some(c => c.cp === 'start');
    // Not started and not sitting on the event picker — always the pre-race
    // countdown, never straight into Track.
    return started ? 'app' : 'prerace';
  }
  return 'events';
}

function MobileApp() {
  const [session, setSession] = uS(() => loadSession());
  // A session only belongs on the 'app' screen once it actually has a
  // runner or is following one — otherwise (logged in but never registered/
  // followed a race, e.g. a stale session from a previous test) land on the
  // event picker instead of crashing AppShell on a null runner.
  const [screen, setScreen] = uS(() => initialScreenFor(session, loadSavedScreen()));
  uE(() => { saveScreen(screen); }, [screen]);
  const [modal, setModal] = uS(null); // 'profile' | 'sos' | 'dnf'
  const [pendingEvent, setPendingEvent] = uS(null);

  function persist(next) { setSession(next); saveSession(next); }

  // Recovers "you already registered" across devices/browsers instead of
  // only trusting this device's local session — looks up the roster by the
  // logged-in Google account's uid (see runnerStore.listRunnersByUid) and
  // restores it into the session if this device doesn't already know about
  // a registration. Re-checks when runner data syncs in from Firestore
  // (e.g. right after login, before the initial fetch has landed).
  uE(() => {
    function tryRecover() {
      if (!session || !session.user || !session.user.uid || session.runner || session.spectator) return;
      if (!window.runnerStore) return;
      const mine = window.runnerStore.listRunnersByUid(session.user.uid);
      if (!mine.length) return;
      const rec = mine.slice().sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0))[0];
      persist({
        ...session,
        runner: { dist: rec.distance, name: rec.nickname, checkins: rec.checkins || [], progressKm: rec.progressKm || 0, eventId: rec.eventId, bib: rec.bib, rosterId: rec.id },
      });
    }
    tryRecover();
    window.addEventListener('trt:runners-updated', tryRecover);
    return () => window.removeEventListener('trt:runners-updated', tryRecover);
  }, [session && session.user && session.user.uid]);

  // A session can point at an event that no longer exists (Admin deleted
  // it, or — before the loadEvents empty-array bug was fixed — deleting
  // every event reseeded a *different* demo event under the same-looking
  // slot). Without this check the app just trusted the stale
  // runner/spectator record forever and kept showing Track/AppShell for an
  // event that's gone, instead of sending the user back to pick one.
  uE(() => {
    function validateEvent() {
      if (!session) return;
      const eventId = session.runner ? session.runner.eventId : (session.spectator ? session.followEventId : null);
      if (!eventId) return;
      const events = getEvents();
      if (events.some(e => e.id === eventId)) return;
      persist({ ...session, runner: null, spectator: false, followBib: null, followEventId: null });
      setScreen('events');
    }
    validateEvent();
    window.addEventListener('trt:events-updated', validateEvent);
    return () => window.removeEventListener('trt:events-updated', validateEvent);
  }, [session && session.runner && session.runner.eventId, session && session.followEventId]);

  function handleLogin(authedUser) {
    const profile = loadProfile();
    persist({ user: { ...authedUser, ...(profile || {}) }, runner: null });
    setScreen(profile && profile.profileCompleted ? 'events' : 'onboard');
  }
  function finishOnboard(nextUser) {
    const completed = { ...nextUser, profileCompleted: true };
    saveProfile(completed);
    persist({ ...session, user: completed });
    setScreen('events');
  }
  function openRunnerSpace(ev) {
    setPendingEvent(ev);
    if (session && session.runner && session.runner.eventId === ev.id) {
      setScreen(initialScreenFor(session));
      return;
    }
    setScreen('register');
  }
  function afterRegister(data) {
    let runner = { dist: data.dist, name: data.nick, checkins: [], progressKm: 0, eventId: pendingEvent && pendingEvent.id };
    if (pendingEvent) {
      window.eventStore.incrementRegistration(pendingEvent.id, data.dist);
      // Writes a real roster entry (name/bib/distance) separate from the
      // registration *count* above — this is what makes a runner show up
      // as themselves instead of just a +1 on the quota. See
      // src/runner-store.js.
      if (window.runnerStore) {
        // Emergency contact name and blood type/medical notes only ever get
        // asked once, in the full Profile screen (see ProfileScreen) — the
        // quick registration form only has a single emergency phone field.
        // Pull the richer profile fields in here too so RD actually has
        // something to act on if this runner ever needs real help, instead
        // of that data sitting only in this device's local profile where
        // nobody else can ever see it.
        const rosterEntry = window.runnerStore.registerRunner(pendingEvent, {
          distance: data.dist, nickname: data.nick, phone: data.phone, gender: data.gender,
          emgName: session.user.emgName || '', emgPhone: data.emg || session.user.emgPhone || '',
          bloodType: session.user.bloodType || '', medical: session.user.medical || '',
          email: session.user.email || '', uid: session.user.uid,
        });
        runner = { ...runner, bib: rosterEntry.bib, rosterId: rosterEntry.id };
      }
    }
    persist({
      ...session,
      user: { ...session.user, nickname: session.user.nickname || data.nick, phone: session.user.phone || data.phone, emgPhone: session.user.emgPhone || data.emg },
      runner,
      spectator: false, followBib: null,
    });
    setScreen('register-success');
  }
  // Self-service cancel — mirrors what Admin's runner table already does
  // (runnerStore.deleteRunner + eventStore.decrementRegistration), gated on
  // the same registration-close cutoff used everywhere else so a runner
  // can't cancel after materials (bib/shirt) are already being prepared.
  function cancelRegistration() {
    if (!session.runner) return;
    if (session.runner.rosterId && window.runnerStore) window.runnerStore.deleteRunner(session.runner.rosterId);
    if (window.eventStore) window.eventStore.decrementRegistration(session.runner.eventId, session.runner.dist);
    persist({ ...session, runner: null });
    setScreen('events');
  }
  function updateRunner(fn) {
    const nextRunner = fn(session.runner);
    persist({ ...session, runner: nextRunner });
    if (nextRunner.rosterId && window.runnerStore) {
      window.runnerStore.updateRunnerProgress(nextRunner.rosterId, { checkins: nextRunner.checkins, progressKm: nextRunner.progressKm });
    }
  }
  function updateUser(nextUser) {
    const withCompleted = { ...nextUser, profileCompleted: true };
    saveProfile(withCompleted);
    persist({ ...session, user: withCompleted });
  }

  uE(() => { const id = 'trt-mobile-style'; if (document.getElementById(id)) return;
    const st = document.createElement('style'); st.id = id;
    st.textContent = '@keyframes trtSpin{to{transform:rotate(360deg)}} *{box-sizing:border-box} html,body{margin:0;background:#efe9dc}';
    document.head.appendChild(st);
  }, []);

  let body;
  if (screen === 'splash') body = <SplashScreen onDone={() => setScreen(session ? 'events' : 'login')}/>;
  else if (screen === 'login') body = <LoginScreen onLogin={handleLogin}/>;
  else if (screen === 'onboard') body = <ProfileScreen user={session.user} onboard onSave={finishOnboard}/>;
  else if (screen === 'events') body = <EventPickerScreen user={session.user} session={session}
    onOpenApp={openRunnerSpace}
    onFollow={(ev) => { setPendingEvent(ev); setScreen('follow-picker'); }}
    onProfile={() => setModal('profile')}/>;
  else if (screen === 'follow-picker') body = <FollowPickerScreen eventId={pendingEvent && pendingEvent.id} onBack={() => setScreen('events')} onPick={(bib) => {
    persist({ ...session, spectator: true, followBib: bib, followEventId: pendingEvent && pendingEvent.id, runner: null });
    setScreen('app');
  }}/>;
  else if (screen === 'register') body = <RegisterScreen event={pendingEvent} profile={session.user} onDone={afterRegister} onBack={() => setScreen('events')}/>;
  else if (screen === 'register-success') body = <RegisterSuccessScreen dist={session.runner.dist} onContinue={() => setScreen('gps')}/>;
  else if (screen === 'gps') body = <GpsPermissionScreen onAllow={() => setScreen('prerace')} onBack={() => setScreen('register')}/>;
  else if (screen === 'prerace') {
    const preraceEvent = getEvents().find(e => e.id === session.runner.eventId);
    const canCancel = !preraceEvent || !window.eventStatus.computeClosed(preraceEvent);
    body = <PreRaceScreen event={preraceEvent} dist={session.runner.dist} onBack={() => setScreen('events')} onScan={() => setScreen('qr-start')} onPreview={() => setScreen('app')}
      onCancel={canCancel ? () => setModal('cancel-reg') : null}/>;
  }
  else if (screen === 'qr-start') body = <QrScanScreen label="จุดสตาร์ท" expectedCode={`TRT:${session.runner.eventId}:start`} onBack={() => setScreen('prerace')} onScanned={() => {
    updateRunner(r => ({ ...r, checkins: [{ cp: 'start', t: new Date().toTimeString().slice(0, 8) }], progressKm: 0 }));
    // Same "gun goes off" GPS start as the in-app rescan path in AppShell's
    // scanComplete — this is the one every runner actually goes through on
    // their real first Start scan (straight from PreRaceScreen, before
    // AppShell ever mounts), so it was the one that mattered most and had
    // been missing entirely: GPS never actually started for a normal
    // registration flow, only the SOS/finish stop-path existed.
    if (window.trtGpsTracker) {
      const bib = session.runner.bib || session.user.uid || session.user.name;
      window.trtGpsTracker.start(session.runner.eventId, bib);
    }
    setScreen('app');
  }}/>;
  else if (screen === 'app') body = <AppShell user={session.user} session={session} updateRunner={updateRunner}
    onSos={() => setModal('sos')} onDnf={() => setModal('dnf')} onProfile={() => setModal('profile')} onHome={() => setScreen('events')}/>;

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {body}
      {modal === 'profile' && <Overlay><ProfileScreen user={session.user} onClose={() => setModal(null)}
        onSave={updateUser}
        onLogout={() => { if (window.fb) window.fb.signOutUser().catch(() => {}); clearSession(); setSession(null); setModal(null); setScreen('login'); }}/></Overlay>}
      {modal === 'sos' && <Overlay><SosScreen
        hotline={session.runner && (getEvents().find(e => e.id === session.runner.eventId) || {}).hotline}
        onCancel={() => setModal(null)} onSent={() => setModal(null)}
        onSend={(reason) => {
          if (session.runner && session.runner.rosterId && window.runnerStore) {
            window.runnerStore.updateRunnerProgress(session.runner.rosterId, { sos: true, sosReason: reason, sosAt: Date.now() });
          }
        }}/></Overlay>}
      {modal === 'dnf' && <Overlay><DnfScreen onCancel={() => setModal(null)} onConfirm={() => {
        if (window.trtGpsTracker) window.trtGpsTracker.stop();
        if (session.runner && session.runner.rosterId && window.runnerStore) window.runnerStore.updateRunnerProgress(session.runner.rosterId, { dnf: true });
        setModal(null);
      }}/></Overlay>}
      {modal === 'cancel-reg' && <Overlay><ConfirmScreen
        title="ยกเลิกการลงทะเบียน?" body="เบอร์บิบและข้อมูลการลงทะเบียนของคุณสำหรับงานนี้จะถูกลบ · สามารถลงทะเบียนใหม่ได้จนกว่าจะปิดรับสมัคร"
        confirmLabel="ยืนยันยกเลิก" onCancel={() => setModal(null)} onConfirm={() => { setModal(null); cancelRegistration(); }}/></Overlay>}
    </div>
  );
}
function Overlay({ children }) {
  return <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>{children}</div>;
}

Object.assign(window, { MobileApp });

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

// Profile persists across logout/login on this device — so the mandatory
// onboarding form only ever shows once per device, not on every login.
const LS_PROFILE_KEY = 'trt.mobile.profile';
function loadProfile() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILE_KEY)) || null; } catch (_) { return null; }
}
function saveProfile(p) {
  try { localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(p)); } catch (_) {}
}

const EVENTS = [
  { id: 'rtr2026', name: 'Rayong Trail Running 2026', date: '18 เม.ย. 2026', status: 'live',
    distances: ['11K', '22K', '29K'] },
  { id: 'kk2026', name: 'Khao Kho Ultra 2026', date: '3 ส.ค. 2026', status: 'upcoming', closed: true },
  { id: 'ky2025', name: 'Khao Yai Trail 2025', date: '2 พ.ย. 2025', status: 'past', bib: '114', distance: '29K' },
];

function useCourse() {
  const [course, setCourse] = uS(null);
  uE(() => {
    fetch('assets/course-track.json').then(r => r.json()).then(setCourse).catch(() => {});
  }, []);
  return course;
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
    <div style={{ width: size, height: size, borderRadius: size >= 30 ? 8 : 4, background: '#fff', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
    </div>
  );
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Logo/><span style={{ fontSize: 11, fontWeight: 700, color: C.brandDk }}>Rayong Trail Running</span>
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
          <img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}/>
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
function LoginScreen({ onLogin }) {
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', padding: '40px 24px 30px', overflow: 'auto' }}>
      <Brand/>
      <div style={{ fontSize: 21, fontWeight: 800, marginTop: 18, color: C.text }}>เข้าสู่ระบบ</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>ไม่ต้องตั้งรหัสผ่าน · เลือกบัญชีที่ใช้อยู่แล้ว</div>
      <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Btn variant="white" onClick={() => onLogin('มิ้น')}>G เข้าสู่ระบบด้วย Google</Btn>
        <Btn variant="black" onClick={() => onLogin('มิ้น')}>เข้าสู่ระบบด้วย Apple</Btn>
        <Btn variant="line" onClick={() => onLogin('มิ้น')}>LINE เข้าสู่ระบบด้วย LINE</Btn>
        <Btn variant="ghost" onClick={() => onLogin('มิ้น')} style={{ padding: 13, fontSize: 13 }}>ใช้อีเมลแทน</Btn>
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
  if (ev.status === 'past') {
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#e5e4df', flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{ev.name}</div>
            <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted, marginTop: 2 }}>{ev.date} · bib #{ev.bib} · {ev.distance} · จบแล้ว</div>
          </div>
        </div>
        <button onClick={onSeeResult} style={{ width: '100%', padding: 13, background: C.bg, border: 'none', borderTop: `1px solid ${C.border}`, fontSize: 12.5, fontWeight: 700, color: C.brandDk, cursor: 'pointer' }}>🏅 See Result</button>
      </div>
    );
  }
  return (
    <div style={{ background: '#fff', border: ev.status === 'live' ? `2px solid ${C.brand}` : `1px solid ${C.border}`,
      borderRadius: 14, boxShadow: ev.status !== 'live' ? '0 1px 3px rgba(31,42,28,0.08)' : 'none', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
        {ev.status === 'live'
          ? <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fff', border: '1px solid #d8d2c2', padding: 4, flexShrink: 0, overflow: 'hidden' }}><img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/></div>
          : <div style={{ width: 46, height: 46, borderRadius: 12, background: '#e5e4df', flexShrink: 0 }}/>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{ev.name}</div>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted, marginTop: 2 }}>
            {ev.date}{ev.closed ? ' · ปิดรับสมัครแล้ว' : ''}
          </div>
        </div>
        {ev.status === 'live' && <span style={{ fontFamily: C.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: '#fff', background: `linear-gradient(135deg,${C.brandLt},${C.brandDk})`, padding: '4px 10px', borderRadius: 999 }}>LIVE</span>}
      </div>
      <div style={{ display: 'flex' }}>
        <button onClick={onRunnerSpace} style={{ flex: 1, padding: 13, background: (ev.closed && !isRegistered) ? '#e5e4df' : C.orange, color: (ev.closed && !isRegistered) ? '#7c7566' : '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          🏃 Runner Space
          <div style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, opacity: 0.85, marginTop: 1 }}>
            {isRegistered ? 'ไปหน้าติดตามของฉัน' : ev.closed ? 'ปิดรับสมัครแล้ว' : (ev.status === 'live' ? 'ไปหน้าติดตามของฉัน' : 'ดูสถานะการลงทะเบียน')}
          </div>
        </button>
        {ev.status === 'live' && (
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
  const filtered = EVENTS.filter(e => e.status === tab && (!q || e.name.toLowerCase().includes(q.toLowerCase())));

  function handleRunnerSpace(ev) {
    const isRegistered = session.runner && session.runner.eventId === ev.id;
    if (ev.closed && !isRegistered) {
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
function FollowPickerScreen({ onBack, onPick }) {
  const [q, setQ] = uS('');
  const snap = uM(() => (window.buildSnapshot ? window.buildSnapshot('mid') : null), []);
  const runners = uM(() => {
    if (!snap) return [];
    const query = q.trim().toLowerCase();
    return snap.runners
      .filter(r => !query || r.bib.includes(query) || `${r.firstName} ${r.lastName}`.toLowerCase().includes(query))
      .slice(0, 40);
  }, [snap, q]);
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
        {!snap && <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 30 }}>กำลังโหลดรายชื่อนักวิ่ง…</div>}
        {snap && runners.length === 0 && <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 30 }}>ไม่พบนักวิ่งที่ค้นหา</div>}
        {runners.map(r => (
          <div key={r.bib} onClick={() => onPick(r.bib)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', cursor: 'pointer' }}>
            <div style={{ width: 36, height: 36, borderRadius: 999, background: C.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{r.firstName[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.firstName} {r.lastName}</div>
              <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted }}>bib {r.bib} · {r.distance}</div>
            </div>
            <span style={{ fontSize: 16, color: C.mute2 }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Screen: Registration ─────────────────────────────────────────────────
function RegisterScreen({ onDone, onBack }) {
  const [nick, setNick] = uS('');
  const [phone, setPhone] = uS('');
  const [dist, setDist] = uS('22K');
  const [emg, setEmg] = uS('');
  const canSubmit = nick.trim() && phone.trim();
  return (
    <div style={{ height: '100%', background: C.bg2, fontFamily: C.font, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ padding: '40px 24px 18px', background: C.brand, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <BackBtn onClick={onBack} dark inline/>
          <Logo/><span style={{ fontSize: 11.5, fontWeight: 700 }}>Rayong Trail Running</span>
        </div>
        <Kicker><span style={{ color: 'rgba(255,255,255,0.65)' }}>RAYONG TRAIL · ลงทะเบียน</span></Kicker>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>สวัสดี! กรอกข้อมูลก่อนเริ่มวิ่ง</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>ใช้ครั้งเดียว · ระบบผูกเบอร์โทรกับอุปกรณ์นี้ให้อัตโนมัติ</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="ชื่อเล่น"><input value={nick} onChange={e => setNick(e.target.value)} placeholder="เช่น ธีระ" style={fieldStyle()}/></Field>
        <Field label="เบอร์โทร"><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08X-XXX-XXXX" style={{ ...fieldStyle(), fontFamily: C.mono }}/></Field>
        <Field label="ระยะที่ลงวิ่ง">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {['11K', '22K', '29K'].map(d => (
              <div key={d} onClick={() => setDist(d)} style={{ padding: 12, textAlign: 'center', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
                background: dist === d ? C.brand : '#fff', color: dist === d ? '#fff' : C.text, border: `1px solid ${dist === d ? C.brand : '#bdb6a4'}` }}>{d}</div>
            ))}
          </div>
        </Field>
        <Field label="เบอร์ติดต่อฉุกเฉิน"><input value={emg} onChange={e => setEmg(e.target.value)} placeholder="คนใกล้ตัว · กรณีจำเป็น" style={{ ...fieldStyle(), fontFamily: C.mono }}/></Field>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
          <input type="checkbox" defaultChecked style={{ marginTop: 2 }}/>
          <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>ยินยอมให้ระบบเก็บพิกัด GPS ระหว่างแข่งเพื่อความปลอดภัย · ลบทิ้งหลังจบงาน 7 วัน</span>
        </label>
        <Btn style={{ marginTop: 8 }} disabled={!canSubmit} onClick={() => onDone({ nick, phone, dist, emg })}>ยืนยันลงทะเบียน →</Btn>
      </div>
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
function PreRaceScreen({ dist, onScan, onBack }) {
  const [secs, setSecs] = uS(2538);
  uE(() => { const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000); return () => clearInterval(id); }, []);
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return (
    <div style={{ height: '100%', background: `linear-gradient(180deg,${C.brandDk} 0%,#152f24 100%)`, color: '#fff', fontFamily: C.font, display: 'flex', flexDirection: 'column', padding: '40px 24px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <BackBtn onClick={onBack} dark inline/>
        <Logo/><span style={{ fontSize: 11.5, fontWeight: 700 }}>Rayong Trail Running</span>
      </div>
      <Kicker><span style={{ color: 'rgba(255,255,255,0.65)' }}>RAYONG TRAIL · WAVE {dist}</span></Kicker>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>รอเวลาปล่อยตัว</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ fontFamily: C.mono, fontSize: 44, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{h}:{m}:{s}</div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>ปล่อยตัวเวลา 06:05 น.</div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)' }}>
        GPS จะเริ่มบันทึกตำแหน่งทันทีที่คุณสแกน QR ที่จุดสตาร์ท — ไม่ใช่ตอนนี้ · ประหยัดแบตระหว่างรอ
      </div>
      <Btn variant="white" onClick={onScan}>📷 สแกน QR ที่จุดสตาร์ท · เริ่ม Track</Btn>
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

function QrScanScreen({ label, onScanned }) {
  uE(() => { const t = setTimeout(onScanned, 1400); return () => clearTimeout(t); }, []);
  return (
    <div style={{ height: '100%', background: '#0a0f0c', color: '#fff', fontFamily: C.font, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center' }}>
        <Kicker><span style={{ opacity: 0.7 }}>RAYONG TRAIL</span></Kicker>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>สแกน QR ที่{label}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 200, height: 200, position: 'relative' }}>
          {[['top', 0, 'left', 0], ['top', 0, 'right', 0], ['bottom', 0, 'left', 0], ['bottom', 0, 'right', 0]].map(([vk, vv, hk, hv], i) => (
            <div key={i} style={{ position: 'absolute', [vk]: vv, [hk]: hv, width: 30, height: 30,
              [`border${vk === 'top' ? 'Top' : 'Bottom'}`]: '4px solid #fff', [`border${hk === 'left' ? 'Left' : 'Right'}`]: '4px solid #fff' }}/>
          ))}
          <div style={{ position: 'absolute', left: 8, right: 8, top: '50%', height: 2, background: 'linear-gradient(90deg,transparent,#4ade80,transparent)' }}/>
        </div>
      </div>
      <div style={{ padding: '0 24px 40px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>ส่อง QR ที่ป้ายให้อยู่ในกรอบ · ระบบจะสแกนอัตโนมัติ</div>
    </div>
  );
}

// ── Track / Route / Ranking / Friends tabs ───────────────────────────────
const CP_SEQ = { '11K': ['start', 'a1_out', 'finish'], '22K': ['start', 'a1_out', 'a2_in', 'a1_in', 'finish'],
  '29K': ['start', 'a1_out', 'a2_in', 'a2_out', 'a1_in', 'finish'] };
const CP_KM = { start: 0, a1_out: 5.6, a2_in: 11.6, a2_out: 19, a1_in: 23.5, finish: { '11K': 11, '22K': 22, '29K': 29 } };
const CP_LABEL = { start: 'จุดสตาร์ท', a1_out: 'A1 · ขาไป', a2_in: 'A2 · ขึ้นเขา', a2_out: 'A2 · ลงเขา', a1_in: 'A1 · ขากลับ', finish: 'เส้นชัย' };

function TrackTab({ runner, onScan, onSos, onDnf }) {
  const seq = CP_SEQ[runner.dist];
  const nextIdx = runner.checkins.length;
  const totalKm = runner.dist === '11K' ? 11 : runner.dist === '22K' ? 22 : 29;
  const pct = Math.min(100, (runner.progressKm / totalKm) * 100);
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          <Stat label="จุดถัดไป" value={nextIdx < seq.length ? CP_LABEL[seq[nextIdx]] : '—'}/>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="primary" onClick={onScan} style={{ flex: 1 }}>📷 Scan QR</Btn>
        <Btn variant="danger" onClick={onSos} style={{ flex: 1 }}>🆘 SOS</Btn>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>Checkpoints</div>
        {seq.map((cp, i) => {
          const done = i < runner.checkins.length;
          return (
            <div key={cp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: done ? C.brand : C.bg, color: done ? '#fff' : C.mute2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{done ? '✓' : i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: done ? C.text : C.mute2 }}>{CP_LABEL[cp]}</span>
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

function RouteTab({ course, runner }) {
  const mapRef = uR(null);
  const mapObj = uR(null);
  uE(() => {
    if (!course || !window.L || !mapRef.current || mapObj.current) return;
    const pts = course.points.map(p => [p[0], p[1]]);
    const map = window.L.map(mapRef.current, { zoomControl: false, attributionControl: false }).fitBounds(pts);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    window.L.polyline(pts, { color: C.brand, weight: 4 }).addTo(map);
    const idx = Math.min(course.points.length - 1, Math.round((runner.progressKm / course.totalKm) * course.points.length));
    const pos = course.points[idx];
    window.L.circleMarker([pos[0], pos[1]], { radius: 8, color: '#fff', weight: 2, fillColor: C.orange, fillOpacity: 1 }).addTo(map);
    mapObj.current = map;
  }, [course]);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div ref={mapRef} style={{ flex: 1, minHeight: 260, background: '#eee' }}/>
      <div style={{ padding: '14px 18px 90px', background: '#fff' }}>
        <Kicker>Elevation</Kicker>
        {course && <ElevationSvg course={course} progressKm={runner.progressKm}/>}
      </div>
    </div>
  );
}
function ElevationSvg({ course, progressKm }) {
  const w = 340, h = 90, pad = 6;
  const pts = course.points;
  const minE = course.minEle, maxE = course.maxEle;
  const path = pts.map((p, i) => {
    const x = pad + (p[3] / course.totalKm) * (w - pad * 2);
    const y = h - pad - ((p[2] - minE) / (maxE - minE || 1)) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const markX = pad + (Math.min(progressKm, course.totalKm) / course.totalKm) * (w - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 90, marginTop: 6 }}>
      <path d={path} fill="none" stroke={C.brand} strokeWidth="2"/>
      <line x1={markX} y1="0" x2={markX} y2={h} stroke={C.orange} strokeWidth="1.5" strokeDasharray="3 3"/>
    </svg>
  );
}

function RankingTab({ snap }) {
  const [dist, setDist] = uS('22K');
  const [gender, setGender] = uS('all');
  const rows = uM(() => {
    if (!snap) return [];
    return snap.runners.filter(r => r.distance === dist)
      .sort((a, b) => (a.status === 'finished' ? 0 : 1) - (b.status === 'finished' ? 0 : 1) || b.progressKm - a.progressKm)
      .slice(0, 30);
  }, [snap, dist]);
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 90px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['11K', '22K', '29K'].map(d => (
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
          <span style={{ flex: 1, fontSize: 13.5 }}>{r.firstName} {r.lastName}</span>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{r.progressKm.toFixed(1)}K</span>
        </div>
      ))}
    </div>
  );
}

function FriendsTab({ snap, followedBib }) {
  const runner = snap && snap.runners.find(r => r.bib === followedBib);
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 90px' }}>
      {!runner && <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 30 }}>ยังไม่มีเพื่อนที่ติดตาม</div>}
      {runner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 999, background: C.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>{runner.firstName[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{runner.firstName} {runner.lastName}</div>
            <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted }}>{runner.distance} · {runner.progressKm.toFixed(1)}/{runner.course.distance}K · {runner.status}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SOS / DNF flows ───────────────────────────────────────────────────────
function SosScreen({ onCancel, onSent }) {
  const [reason, setReason] = uS(null);
  const [sent, setSent] = uS(false);
  if (sent) {
    return (
      <div style={{ height: '100%', background: '#fde9e6', fontFamily: C.font, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 14 }}>
        <div style={{ fontSize: 40 }}>🆘</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#9b1c10' }}>ส่งสัญญาณขอความช่วยเหลือแล้ว</div>
        <div style={{ fontSize: 13, color: C.text }}>ทีมงานได้รับตำแหน่งล่าสุดของคุณแล้ว</div>
        <Btn variant="danger" onClick={() => window.location.href = 'tel:1669'} style={{ marginTop: 10 }}>📞 โทรสายด่วน 1669</Btn>
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
      <Btn variant="danger" disabled={!reason} onClick={() => setSent(true)}>ส่งสัญญาณ SOS</Btn>
      <Btn variant="ghost" onClick={onCancel} style={{ marginTop: 8 }}>ยกเลิก</Btn>
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
  const [medical, setMedical] = uS(user.medical || '');
  const [saved, setSaved] = uS(false);
  const canSubmit = !onboard || (nickname.trim() && phone.trim() && emgName.trim() && emgPhone.trim());

  function save() {
    onSave({ ...user, nickname, gender, phone, email, emgName, emgPhone, medical });
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
        <Field label="กรุ๊ปเลือด / โรคประจำตัว"><input value={medical} onChange={e => setMedical(e.target.value)} placeholder="เช่น O+ · หอบหืด" style={fieldStyle()}/></Field>
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
  const course = useCourse();
  const snap = uM(() => (window.buildSnapshot ? window.buildSnapshot('mid') : null), []);

  const seq = !isSpectator && CP_SEQ[session.runner.dist];
  const nextCp = seq && seq[session.runner.checkins.length];

  function doScan() {
    setScanning(true);
  }
  function scanComplete() {
    setScanning(false);
    const t = new Date().toTimeString().slice(0, 5);
    const km = typeof CP_KM[nextCp] === 'object' ? CP_KM[nextCp][session.runner.dist] : CP_KM[nextCp];
    updateRunner(r => ({ ...r, checkins: [...r.checkins, { cp: nextCp, t }], progressKm: km }));
    setScanned({ cp: CP_LABEL[nextCp], km });
  }

  if (scanning) return <QrScanScreen label={nextCp === 'start' ? 'จุดสตาร์ท' : CP_LABEL[nextCp]} onScanned={scanComplete}/>;
  if (scanned) return <ScanSuccessScreen cp={scanned.cp} km={scanned.km} onDone={() => setScanned(null)}/>;

  const followedRunner = isSpectator && snap && snap.runners.find(r => r.bib === session.followBib);

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
      {!isSpectator && tab === 'track' && <TrackTab runner={{ ...session.runner, pace: "6'42\"/กม.", gradient: '+4.2%' }} onScan={doScan} onSos={onSos} onDnf={onDnf}/>}
      {tab === 'route' && <RouteTab course={course} runner={isSpectator ? (followedRunner ? { dist: followedRunner.distance, progressKm: followedRunner.progressKm } : { dist: '22K', progressKm: 0 }) : session.runner}/>}
      {tab === 'ranking' && <RankingTab snap={snap}/>}
      {tab === 'friends' && <FriendsTab snap={snap} followedBib={isSpectator ? session.followBib : (snap && snap.runners[10] && snap.runners[10].bib)}/>}
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
function MobileApp() {
  const [session, setSession] = uS(() => loadSession());
  const [screen, setScreen] = uS(session ? 'app' : 'splash');
  const [modal, setModal] = uS(null); // 'profile' | 'sos' | 'dnf'
  const [pendingEvent, setPendingEvent] = uS(null);

  function persist(next) { setSession(next); saveSession(next); }

  function handleLogin(name) {
    const profile = loadProfile();
    persist({ user: { name, provider: 'google', ...(profile || {}) }, runner: null });
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
    if (session && session.runner && session.runner.eventId === ev.id) { setScreen('app'); return; }
    setScreen('register');
  }
  function afterRegister(data) {
    persist({
      ...session,
      user: { ...session.user, nickname: session.user.nickname || data.nick, phone: session.user.phone || data.phone, emgPhone: session.user.emgPhone || data.emg },
      runner: { dist: data.dist, name: data.nick, checkins: [], progressKm: 0, eventId: pendingEvent && pendingEvent.id },
      spectator: false, followBib: null,
    });
    setScreen('gps');
  }
  function updateRunner(fn) {
    persist({ ...session, runner: fn(session.runner) });
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
    onFollow={() => setScreen('follow-picker')}
    onProfile={() => setModal('profile')}/>;
  else if (screen === 'follow-picker') body = <FollowPickerScreen onBack={() => setScreen('events')} onPick={(bib) => {
    persist({ ...session, spectator: true, followBib: bib, runner: null });
    setScreen('app');
  }}/>;
  else if (screen === 'register') body = <RegisterScreen onDone={afterRegister} onBack={() => setScreen('events')}/>;
  else if (screen === 'gps') body = <GpsPermissionScreen onAllow={() => setScreen('prerace')} onBack={() => setScreen('register')}/>;
  else if (screen === 'prerace') body = <PreRaceScreen dist={session.runner.dist} onBack={() => setScreen('events')} onScan={() => {
    updateRunner(r => ({ ...r, checkins: [{ cp: 'start', t: '06:05' }], progressKm: 0 }));
    setScreen('app');
  }}/>;
  else if (screen === 'app') body = <AppShell user={session.user} session={session} updateRunner={updateRunner}
    onSos={() => setModal('sos')} onDnf={() => setModal('dnf')} onProfile={() => setModal('profile')} onHome={() => setScreen('events')}/>;

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {body}
      {modal === 'profile' && <Overlay><ProfileScreen user={session.user} onClose={() => setModal(null)}
        onSave={updateUser}
        onLogout={() => { clearSession(); setSession(null); setModal(null); setScreen('login'); }}/></Overlay>}
      {modal === 'sos' && <Overlay><SosScreen onCancel={() => setModal(null)} onSent={() => setModal(null)}/></Overlay>}
      {modal === 'dnf' && <Overlay><DnfScreen onCancel={() => setModal(null)} onConfirm={() => setModal(null)}/></Overlay>}
    </div>
  );
}
function Overlay({ children }) {
  return <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>{children}</div>;
}

Object.assign(window, { MobileApp });

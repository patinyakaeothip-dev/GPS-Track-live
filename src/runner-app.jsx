// runner-app.jsx — Mobile runner screens
// 4 check-in flow variations (staff-scan, self-scan, gps-auto, manual)
// Each wraps the same data card + safety controls.

const { useState: useS } = React;

// ─── Backend wiring ─────────────────────────────────────────────────────
// Thin action helpers used by the live screens. Each one calls window.api
// (defined in api.jsx) with the shape the Apps Script backend expects.
// localStorage carries the runner token across page loads, mirroring the
// "the browser remembered me" recognized screen in the design.

const RUNNER_TOKEN_KEY = 'trt.runner.token';

function getRunnerToken()  { try { return localStorage.getItem(RUNNER_TOKEN_KEY) || ''; } catch (_) { return ''; } }
function setRunnerToken(t) { try { localStorage.setItem(RUNNER_TOKEN_KEY, t); } catch (_) {} }
function clearRunnerToken(){ try { localStorage.removeItem(RUNNER_TOKEN_KEY); } catch (_) {} }

async function runnerRegister({ name, phone, distance, emergency_phone }) {
  const res = await window.api('register', { name, phone, distance, emergency_phone }, { method: 'POST' });
  if (res && res.token) setRunnerToken(res.token);
  return res;
}

async function runnerCheckin(cp) {
  const token = getRunnerToken();
  if (!token) { const e = new Error('no_token'); e.code = 'no_token'; throw e; }
  return window.api('checkin', { token, cp }, { method: 'POST' });
}

async function runnerLookup() {
  const token = getRunnerToken();
  if (!token) return null;
  try { return await window.api('lookup', { token }); }
  catch (e) { if (e.code === 'unknown_runner') clearRunnerToken(); throw e; }
}

async function runnerDnf({ cp, reason, note, pickup_requested }) {
  const token = getRunnerToken();
  if (!token) { const e = new Error('no_token'); e.code = 'no_token'; throw e; }
  return window.api('dnf', { token, cp, reason, note, pickup_requested }, { method: 'POST' });
}

async function runnerSearch(q) {
  const res = await window.api('search', { q });
  return (res && res.results) || [];
}

const RA = {
  bg: '#f5f1e8',
  surface: '#ffffff',
  text: '#1f2a1c',
  muted: '#5d6b59',
  mute2: '#a8b1a3',
  border: '#d8d2c2',
  borderS: '#bdb6a4',
  brand: '#2d6a4f',
  brandDk: '#1f4d39',
  alert: 'oklch(0.58 0.22 28)',
  font: '"Geist", ui-sans-serif, system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, "SF Mono", monospace',
};

// QR code (decorative grid — looks like a QR without trying to be one)
function FakeQR({ size = 220, seed = 'BIB-027' }) {
  const cells = 21; // QR-ish module count
  const r = (i) => {
    // deterministic from seed
    let h = 0;
    for (const c of (seed + ':' + i)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return (Math.abs(h) % 100) / 100;
  };
  const cell = size / cells;
  const blocks = [];
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const finder = (x < 7 && y < 7) || (x >= cells-7 && y < 7) || (x < 7 && y >= cells-7);
      const finderOuter = finder && (x === 0 || x === 6 || y === 0 || y === 6 ||
        x === cells-1 || x === cells-7 || y === cells-7);
      const finderInner = finder && (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
        finder && (x >= cells-5 && x <= cells-3 && y >= 2 && y <= 4) ||
        finder && (x >= 2 && x <= 4 && y >= cells-5 && y <= cells-3);
      const fill = finder ? (finderOuter || finderInner) : r(y * cells + x) > 0.5;
      if (fill) blocks.push(<rect key={`${x}-${y}`} x={x*cell} y={y*cell} width={cell} height={cell} fill="#0a0a0a"/>);
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="#fff"/>
      {blocks}
    </svg>
  );
}

// Shared card with race-progress facts
function RunnerStats({ runner, t }) {
  const pct = (runner.progressKm / runner.course.distance) * 100;
  return (
    <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* big progress card */}
      <div style={{
        background: '#fff', border: `1px solid ${RA.border}`,
        borderRadius: 4, padding: '16px 16px 18px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: RA.muted }}>{t('m_progress')}</span>
          <span style={{ fontFamily: RA.mono, fontSize: 11, color: RA.muted,
            fontVariantNumeric: 'tabular-nums' }}>
            {fmtClock(runner.lastTime)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4,
          marginBottom: 12 }}>
          <span style={{ fontFamily: RA.font, fontSize: 38, fontWeight: 500,
            letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums',
            lineHeight: 1, color: RA.text }}>{runner.progressKm.toFixed(1)}</span>
          <span style={{ fontFamily: RA.mono, fontSize: 14, color: RA.muted }}>
            / {runner.course.distance} {t('km')}
          </span>
        </div>
        <div style={{ height: 8, background: '#f4f3ef', borderRadius: 1,
          position: 'relative', overflow: 'visible' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`, background: RA.brand }}/>
          {/* CP ticks */}
          {runner.course.legs.reduce((acc, leg) => {
            const cum = (acc.cum || 0) + leg.km;
            acc.cum = cum;
            if (leg.to !== 'finish') acc.ticks.push({
              x: cum / runner.course.distance * 100,
              label: leg.to,
            });
            return acc;
          }, { cum: 0, ticks: [] }).ticks.map((tk, i) => (
            <React.Fragment key={i}>
              <div style={{ position: 'absolute', left: `${tk.x}%`, top: -2, bottom: -2,
                width: 1, background: '#a3a3a3' }}/>
              <div style={{ position: 'absolute', left: `${tk.x}%`, top: 14,
                transform: 'translateX(-50%)', fontFamily: RA.mono, fontSize: 9,
                color: RA.muted, letterSpacing: '0.06em' }}>
                {tk.label === 'a1_out' || tk.label === 'a1_in' ? 'A1' :
                 tk.label === 'a2_in' || tk.label === 'a2_out' ? 'A2' : ''}
              </div>
            </React.Fragment>
          ))}
        </div>
        <div style={{ marginTop: 28, display: 'flex',
          justifyContent: 'space-between', gap: 10 }}>
          <Stat label={t('m_next_cp')}
            value={t(`cp_${runner.nextCp || 'finish'}`)} mono={false}/>
          <Stat label={t('m_pace')}
            value={`${runner.basePace.toFixed(1)}'/km`}/>
          <Stat label="ETA"
            value={runner.eta != null ? `+${Math.round(runner.eta)}m` : '—'}/>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, mono = true }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: RA.mono, fontSize: 9, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: RA.muted, marginBottom: 3,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontFamily: mono ? RA.mono : RA.font, fontSize: 13,
        fontWeight: 500, color: RA.text, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

function RunnerHeader({ runner, t }) {
  return (
    <div style={{ padding: '16px 20px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: `1px solid ${RA.border}` }}>
      <div style={{ width: 44, height: 44, borderRadius: 2,
        background: RA.brand, color: '#fff', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: RA.mono, fontSize: 15, fontWeight: 600,
        letterSpacing: '0.04em' }}>
        {runner.bib}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: RA.font, fontSize: 15, fontWeight: 500,
          letterSpacing: '-0.01em', color: RA.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {runner.firstName} {runner.lastName}
        </div>
        <div style={{ fontFamily: RA.mono, fontSize: 10,
          letterSpacing: '0.06em', color: RA.muted, marginTop: 2 }}>
          {runner.distance} · {t('m_dist')}
        </div>
      </div>
      <span style={{
        padding: '4px 8px', background: '#f4f3ef',
        border: `1px solid ${RA.borderS}`, borderRadius: 2,
        fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: RA.text, fontWeight: 600,
      }}>{runner.distance}</span>
    </div>
  );
}

function CheckpointHistory({ runner, t }) {
  if (runner.history.length === 0) return null;
  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: RA.muted, marginBottom: 8 }}>
        {t('m_history')} · {runner.history.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {runner.history.map((h, i) => (
          <div key={i} style={{
            padding: '8px 10px', background: '#fff',
            border: `1px solid ${RA.border}`, borderRadius: 2,
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99,
                background: RA.brand }}/>
              <span style={{ fontFamily: RA.font, fontSize: 12, color: RA.text }}>
                {t(`cp_${h.id}`)}
              </span>
            </div>
            <span style={{ fontFamily: RA.mono, fontSize: 11, color: RA.muted,
              fontVariantNumeric: 'tabular-nums' }}>
              {fmtClock(h.t)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafetyControls({ t, onHelp }) {
  return (
    <div style={{ padding: '0 20px', display: 'flex', gap: 8 }}>
      <button style={{
        flex: 1, padding: '13px 12px', background: '#fff',
        border: `1px solid ${RA.borderS}`, borderRadius: 4,
        fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
        textTransform: 'uppercase', fontWeight: 600, color: RA.text,
        cursor: 'pointer',
      }}>✓ {t('m_safe')}</button>
      <button onClick={onHelp} style={{
        flex: 1, padding: '13px 12px', background: '#fff',
        border: `1px solid ${RA.alert}`, borderRadius: 4,
        fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
        textTransform: 'uppercase', fontWeight: 600, color: RA.alert,
        cursor: 'pointer',
      }}>! {t('m_help')}</button>
    </div>
  );
}

// ─── Variation 1: Staff scans runner's BIB QR ────────────────────────────
function RunnerStaffScan({ runner, t }) {
  return (
    <div style={{ background: RA.bg, minHeight: '100%', paddingBottom: 30,
      display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RunnerHeader runner={runner} t={t}/>

      {/* big QR card — passive: runner just shows this */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          background: '#fff', border: `1px solid ${RA.border}`,
          borderRadius: 4, padding: '20px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ fontFamily: RA.mono, fontSize: 10,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: RA.muted, marginBottom: 14 }}>
            {t('m_bib_title')}
          </div>
          <FakeQR size={210} seed={runner.bib}/>
          <div style={{ marginTop: 14, fontFamily: RA.mono, fontSize: 22,
            fontWeight: 600, letterSpacing: '0.08em', color: RA.text }}>
            #{runner.bib}
          </div>
          <div style={{ fontFamily: RA.font, fontSize: 13, color: RA.muted,
            marginTop: 4, textAlign: 'center' }}>
            {t('m_bib_sub')}
          </div>
        </div>
      </div>

      <RunnerStats runner={runner} t={t}/>
      <CheckpointHistory runner={runner} t={t}/>
      <SafetyControls t={t}/>
    </div>
  );
}

// ─── Variation 2: Runner self-scans checkpoint QR ────────────────────────
function RunnerSelfScan({ runner, t }) {
  const [scanning, setScanning] = useS(false);
  return (
    <div style={{ background: RA.bg, minHeight: '100%', paddingBottom: 30,
      display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RunnerHeader runner={runner} t={t}/>
      <RunnerStats runner={runner} t={t}/>

      {/* primary action: scan checkpoint */}
      <div style={{ padding: '0 20px' }}>
        {!scanning ? (
          <button onClick={() => setScanning(true)} style={{
            width: '100%', padding: '18px 16px', background: RA.brand,
            color: '#fff', border: 'none', borderRadius: 4,
            fontFamily: RA.font, fontSize: 15, fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10,
          }}>
            <ScanIcon size={20}/>
            {t('m_scan_btn')}
          </button>
        ) : (
          <ScannerView t={t} onDone={() => setScanning(false)}/>
        )}
        <div style={{ fontFamily: RA.mono, fontSize: 10, color: RA.muted,
          letterSpacing: '0.06em', textAlign: 'center', marginTop: 10 }}>
          {t('m_scan_for_me')}
        </div>
      </div>

      <CheckpointHistory runner={runner} t={t}/>
      <SafetyControls t={t}/>
    </div>
  );
}

function ScannerView({ t, onDone }) {
  return (
    <div style={{
      background: '#0a0a0a', borderRadius: 4, padding: 16,
      aspectRatio: '1 / 1', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontFamily: RA.mono, fontSize: 10, color: '#fff',
        letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>
        Camera · จัด QR ที่จุดพักให้อยู่ในกรอบ
      </div>
      <div style={{ flex: 1, position: 'relative', margin: '16px 0' }}>
        {/* corner frame */}
        {[
          { top: 0, left: 0, br: '0', bl: 'none', tt: 'none', tr: 'none' },
        ].map(()=>null)}
        {['tl','tr','bl','br'].map(c => {
          const base = { position: 'absolute', width: 24, height: 24,
            borderColor: '#fff', borderStyle: 'solid', borderWidth: 0 };
          if (c === 'tl') Object.assign(base, { top: 20, left: 20, borderTopWidth: 2, borderLeftWidth: 2 });
          if (c === 'tr') Object.assign(base, { top: 20, right: 20, borderTopWidth: 2, borderRightWidth: 2 });
          if (c === 'bl') Object.assign(base, { bottom: 20, left: 20, borderBottomWidth: 2, borderLeftWidth: 2 });
          if (c === 'br') Object.assign(base, { bottom: 20, right: 20, borderBottomWidth: 2, borderRightWidth: 2 });
          return <div key={c} style={base}/>;
        })}
        {/* scan line */}
        <div style={{ position: 'absolute', left: 20, right: 20, top: '50%',
          height: 1, background: 'rgba(255,255,255,0.6)',
          boxShadow: '0 0 12px rgba(255,255,255,0.8)' }}/>
        {/* fake CP poster glimpse */}
        <div style={{ position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%,-50%) rotate(-4deg)',
          width: 100, height: 100, background: '#fff',
          opacity: 0.92, padding: 6,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 4 }}>
          <FakeQR size={70} seed="CP-A-OUT"/>
        </div>
      </div>
      <button onClick={onDone} style={{
        padding: '10px', background: 'transparent', color: '#fff',
        border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4,
        fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
        textTransform: 'uppercase', cursor: 'pointer',
      }}>Cancel</button>
    </div>
  );
}

function ScanIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Variation 3: GPS auto-detect within geofence ────────────────────────
function RunnerGPSAuto({ runner, t }) {
  return (
    <div style={{ background: RA.bg, minHeight: '100%', paddingBottom: 30,
      display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RunnerHeader runner={runner} t={t}/>
      <RunnerStats runner={runner} t={t}/>

      {/* GPS detection card */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          background: RA.brand, color: '#fff',
          borderRadius: 4, padding: '18px 16px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ position: 'relative', width: 10, height: 10 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: 99,
                background: '#22c55e' }}/>
              <span style={{ position: 'absolute', inset: -4, borderRadius: 99,
                background: 'rgba(34,197,94,0.25)',
                animation: 'pulse 1.8s ease-out infinite' }}/>
            </span>
            <span style={{ fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 600 }}>
              {t('m_in_range')}
            </span>
          </div>
          <div style={{ fontFamily: RA.font, fontSize: 14, lineHeight: 1.4,
            color: 'rgba(255,255,255,0.8)' }}>
            ระบบตรวจพบว่าคุณอยู่ใกล้จุด A ภายในระยะ 80m แตะปุ่มเพื่อยืนยัน
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button style={{
              flex: 1, padding: '14px', background: '#fff', color: RA.text,
              border: 'none', borderRadius: 4,
              fontFamily: RA.mono, fontSize: 12, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
            }}>{t('m_confirm_in')}</button>
            <button style={{
              padding: '14px 16px', background: 'transparent', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4,
              fontFamily: RA.mono, fontSize: 12, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
            }}>—</button>
          </div>
        </div>
      </div>

      {/* secondary: auto-tracking indicator */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          padding: '12px 14px', background: '#fff',
          border: `1px solid ${RA.border}`, borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 28, height: 28, borderRadius: 4,
            background: '#f4f3ef', display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}>
            <GpsIcon size={16}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: RA.font, fontSize: 12, fontWeight: 500,
              color: RA.text }}>{t('m_gps_auto')}</div>
            <div style={{ fontFamily: RA.mono, fontSize: 10, color: RA.muted,
              marginTop: 2, letterSpacing: '0.04em' }}>
              อัพเดทตำแหน่งทุก 30 วินาที · ใช้แบตเสริมประมาณ 4%/ชม.
            </div>
          </div>
        </div>
      </div>

      <CheckpointHistory runner={runner} t={t}/>
      <SafetyControls t={t}/>
    </div>
  );
}
function GpsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="3" stroke="#0a0a0a" strokeWidth="1.4"/>
      <circle cx="10" cy="10" r="7" stroke="#0a0a0a" strokeWidth="1.4" opacity="0.4"/>
      <path d="M10 1v3M10 16v3M1 10h3M16 10h3" stroke="#0a0a0a" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Variation 4: Manual one-tap "I'm here" button ───────────────────────
function RunnerManual({ runner, t }) {
  const next = runner.nextCp;
  return (
    <div style={{ background: RA.bg, minHeight: '100%', paddingBottom: 30,
      display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RunnerHeader runner={runner} t={t}/>
      <RunnerStats runner={runner} t={t}/>

      {/* huge tap target — runner reaches CP and just taps */}
      <div style={{ padding: '0 20px' }}>
        <button style={{
          width: '100%', padding: '24px 16px', background: RA.brand,
          color: '#fff', border: 'none', borderRadius: 4,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, cursor: 'pointer',
        }}>
          <span style={{ fontFamily: RA.mono, fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.6)' }}>
            ถัดไป · {next ? t(`cp_${next}`) : t('cp_finish')}
          </span>
          <span style={{ fontFamily: RA.font, fontSize: 19, fontWeight: 500,
            letterSpacing: '-0.01em' }}>
            {t('m_tap_here')}
          </span>
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 8, marginTop: 8 }}>
          <button style={{
            padding: '12px', background: '#fff',
            border: `1px solid ${RA.borderS}`, borderRadius: 4,
            fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.text,
            cursor: 'pointer',
          }}>{t('m_confirm_out')}</button>
          <button style={{
            padding: '12px', background: '#fff',
            border: `1px solid ${RA.borderS}`, borderRadius: 4,
            fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.text,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6,
          }}>
            <ScanIcon size={14}/> QR
          </button>
        </div>
      </div>

      <CheckpointHistory runner={runner} t={t}/>
      <SafetyControls t={t}/>
    </div>
  );
}

// ─── Variation 0: NO APP — phone camera → web page ───────────────────────
// The recommended path for a 150-runner training event. Each checkpoint has
// a printed QR poster (unique URL per CP). Runner uses the BUILT-IN camera,
// taps the URL banner, browser opens.
//   First time (at Start): register with name + phone + distance.
//   Subsequent CPs:        type 1 letter of name (or phone) → autocomplete
//                          → tap your row → check-in confirmed.
// Zero app install. No BIB number for the runner to manage.
function RunnerWebFlow({ runner, t, step = 'register', lang = 'th', allRunners = [] }) {
  if (step === 'camera')       return <PhoneCameraView lang={lang}/>;
  if (step === 'register')     return <PhoneWebRegister runner={runner} lang={lang}/>;
  if (step === 'recognized')   return <PhoneWebRecognized runner={runner} lang={lang}/>;
  if (step === 'duplicate')    return <PhoneWebDuplicate runner={runner} lang={lang}/>;
  if (step === 'upgrade')      return <PhoneWebAdjust runner={runner} lang={lang} from="11K" to="22K"/>;
  if (step === 'upgrade29')    return <PhoneWebAdjust runner={runner} lang={lang} from="22K" to="29K"/>;
  if (step === 'downgrade22')  return <PhoneWebAdjust runner={runner} lang={lang} from="29K" to="22K"/>;
  if (step === 'dnf')          return <PhoneWebDNF runner={runner} lang={lang}/>;
  if (step === 'finish')       return <PhoneWebFinish runner={runner} lang={lang} adjusted={false}/>;
  if (step === 'finish-adj')   return <PhoneWebFinish runner={runner} lang={lang} adjusted={true}/>;
  if (step === 'picker')       return <PhoneWebSearch runner={runner} lang={lang} allRunners={allRunners}/>;
  if (step === 'success')      return <PhoneWebSuccess runner={runner} lang={lang}/>;
  return <PhoneWebRegister runner={runner} lang={lang}/>;
}

// Small logo helper — JPEG (white bg) inside a white container looks clean.
function RayongLogo({ size = 56 }) {
  return (
    <img src="assets/rayong-trail-logo.jpg" alt="Rayong Trail Running"
      style={{ width: size, height: 'auto', display: 'block' }}/>
  );
}

// Stage 1: native camera app pointing at the CP poster
function PhoneCameraView({ lang }) {
  return (
    <div style={{ background: '#000', height: '100%', position: 'relative',
      overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* "camera" view of the printed checkpoint poster */}
      <div style={{ flex: 1, position: 'relative',
        background: 'radial-gradient(ellipse at 50% 35%, #2a2a28 0%, #0a0a0a 80%)' }}>
        {/* poster propped on a stand */}
        <div style={{
          position: 'absolute', left: '50%', top: '46%',
          transform: 'translate(-50%,-50%) rotate(-2deg)',
          width: 230, padding: '20px 18px 16px',
          background: '#fafaf8',
          boxShadow: '0 30px 60px rgba(0,0,0,0.6), 0 2px 0 rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ fontFamily: RA.mono, fontSize: 9, letterSpacing: '0.16em',
            color: '#737373', marginBottom: 4 }}>
            RAYONG TRAIL · 2026
          </div>
          <div style={{ fontFamily: RA.font, fontSize: 28, fontWeight: 600,
            letterSpacing: '-0.02em', color: RA.text, lineHeight: 1, marginBottom: 2 }}>
            A1
          </div>
          <div style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.1em',
            color: '#737373', marginBottom: 12 }}>
            เขามะเข้ม · 5.6 KM
          </div>
          <FakeQR size={140} seed="cp-a1"/>
          <div style={{ fontFamily: RA.mono, fontSize: 9, letterSpacing: '0.06em',
            color: RA.text, marginTop: 10 }}>
            trail.run/cp/a1
          </div>
          <div style={{ fontFamily: lang === 'th' ? '"Noto Sans Thai"' : RA.font,
            fontSize: 11, color: '#404040', marginTop: 8, textAlign: 'center',
            lineHeight: 1.4 }}>
            {lang === 'th'
              ? 'แสกนด้วยกล้องมือถือ · ไม่ต้องโหลดแอพ'
              : 'Scan with your camera · no app needed'}
          </div>
        </div>

        {/* QR detect prompt (iOS-style yellow box + URL banner) */}
        <div style={{ position: 'absolute', left: '50%', top: '46%',
          transform: 'translate(-50%, -50%)', width: 110, height: 110,
          border: '2px solid #fbbf24', borderRadius: 6,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.0)' }}/>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 24,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 12, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8,
            background: RA.brand, display: 'flex', alignItems: 'center',
            justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M3 3h4v4H3zM11 3h4v4h-4zM3 11h4v4H3zM10 10h2v2h-2zM13 10h2v5h-2zM10 13h2v2h-2z" fill="#fff"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: RA.font, fontSize: 13, fontWeight: 600,
              color: RA.text }}>trail.run/cp/a1</div>
            <div style={{ fontFamily: RA.font, fontSize: 11, color: '#525252' }}>
              {lang === 'th' ? 'แตะเพื่อเปิด' : 'Tap to open'}
            </div>
          </div>
          <span style={{ fontSize: 18, color: '#525252' }}>›</span>
        </div>
      </div>

      {/* native iOS camera bottom bar (suggestive) */}
      <div style={{ height: 80, background: '#000', display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: 999,
          background: '#fff', border: '4px solid rgba(255,255,255,0.4)',
          boxShadow: 'inset 0 0 0 4px #000' }}/>
      </div>
    </div>
  );
}

// Stage 2a: FIRST TIME at Start — quick registration
function PhoneWebRegister({ runner, lang }) {
  const th = lang === 'th';
  return (
    <div style={{ height: '100%', background: '#fafaf8', display: 'flex',
      flexDirection: 'column' }}>
      <SafariChrome url="trail.run/cp/start"/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* page header */}
        <div style={{ padding: '24px 24px 22px', background: RA.brand,
          color: '#fff' }}>
          <div style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.12em',
            opacity: 0.6 }}>KHAO YAI TRAIL · {th ? 'จุดสตาร์ท' : 'START'}</div>
          <div style={{ fontFamily: RA.font, fontSize: 26, fontWeight: 600,
            letterSpacing: '-0.025em', lineHeight: 1.15, marginTop: 10 }}>
            {th ? 'สวัสดี! ลงทะเบียนก่อนวิ่ง' : 'Welcome! Quick sign-up'}
          </div>
          <div style={{ marginTop: 8, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
            {th
              ? 'กรอกชื่อกับเบอร์ครั้งเดียว · จุดถัดๆไปแค่พิมพ์ชื่อก็เด้งขึ้นมาให้กดเลย'
              : 'Fill once · the next checkpoints just need a letter or two and your name pops up'}
          </div>
        </div>

        {/* form */}
        <div style={{ padding: '18px 20px', display: 'flex',
          flexDirection: 'column', gap: 14 }}>
          <Field
            label={th ? 'ชื่อเล่น (จะแสดงในระบบ)' : 'Nickname (shown to organisers)'}
            value={runner.firstName}
            placeholder={th ? 'เช่น ธีระ' : 'e.g. Theera'}
            mono={false}
            lang={lang}
          />
          <Field
            label={th ? 'เบอร์โทร' : 'Phone number'}
            value={runner.emergency.replace(/\s/g, '').slice(0, 10)}
            placeholder="08X-XXX-XXXX"
            mono={true}
            lang={lang}
            hint={th ? 'ใช้เป็น login จุดถัดไป · จะถูกเก็บเฉพาะวันงาน' : 'Used to log in at the next CP · kept only for race day'}
          />

          {/* distance picker */}
          <div>
            <div style={{ fontFamily: RA.mono, fontSize: 10,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: RA.muted, marginBottom: 6 }}>
              {th ? 'ระยะที่ลงวิ่ง' : 'Distance'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 6 }}>
              {['11K', '22K', '29K'].map(d => {
                const active = runner.distance === d;
                return (
                  <div key={d} style={{
                    padding: '14px 10px',
                    background: active ? RA.brand : '#fff',
                    color: active ? '#fff' : RA.text,
                    border: `1px solid ${active ? RA.brand : RA.borderS}`,
                    borderRadius: 6, textAlign: 'center',
                    fontFamily: RA.font, fontWeight: 600, fontSize: 16,
                    letterSpacing: '-0.01em',
                  }}>{d}</div>
                );
              })}
            </div>
          </div>

          {/* emergency contact (optional, condensed) */}
          <Field
            label={th ? 'เบอร์ติดต่อฉุกเฉิน (ไม่บังคับ)' : 'Emergency contact (optional)'}
            value=""
            placeholder={th ? 'เบอร์คนใกล้ตัว · กรณีจำเป็น' : 'Family/friend phone, just in case'}
            mono={true}
            lang={lang}
          />

          {/* CTA */}
          <button style={{
            marginTop: 6, padding: '16px',
            background: RA.brand, color: '#fff', border: 'none',
            borderRadius: 8, fontFamily: RA.font, fontSize: 15,
            fontWeight: 600, cursor: 'pointer',
          }}>
            {th ? 'ลงทะเบียน · ออกตัวเลย ↗' : 'Sign up · let’s go ↗'}
          </button>

          {/* Fallback for borrowed phones — runner is already registered
              but came to this device for the first time (phone died, etc.). */}
          <button style={{
            padding: '13px', background: '#fff',
            border: `1px solid ${RA.borderS}`, borderRadius: 6,
            fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.06em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.text,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="#0a0a0a" strokeWidth="1.3"/>
              <path d="M4.5 6.5 L7 9 L11 4.5" stroke="#0a0a0a" strokeWidth="1.3"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {th ? 'ลงทะเบียนแล้ว · ค้นหาฉัน' : 'Already registered · find me'}
          </button>

          <div style={{ marginTop: 4, padding: '10px 12px',
            background: '#f4f3ef', borderRadius: 6,
            fontFamily: RA.mono, fontSize: 10, color: RA.muted,
            letterSpacing: '0.04em', lineHeight: 1.55 }}>
            {th
              ? '🔒 เก็บแค่ชื่อ + เบอร์ + ระยะ · ลบทิ้งหลังจบงาน 7 วัน · ไม่ใช้เพื่ออื่น'
              : '🔒 We only store name + phone + distance · purged 7 days after race · no other use'}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stage 2b: RECOGNIZED — browser remembers from first registration.
// Runner just sees their info pre-filled and one big confirm button.
function PhoneWebRecognized({ runner, lang }) {
  const th = lang === 'th';
  const phoneTail = runner.emergency.replace(/\s/g, '').slice(-4);
  const phoneMasked = '08X-XXX-' + phoneTail;
  const prevCp = runner.history[runner.history.length - 1];
  const prevCpLabel = prevCp ? (
    prevCp.id === 'start' ? (th ? 'จุดสตาร์ท' : 'Start') :
    prevCp.id === 'a1_out' || prevCp.id === 'a1_in' ? 'A1' :
    prevCp.id === 'a2_in'  || prevCp.id === 'a2_out' ? 'A2' :
    th ? 'จุดก่อนหน้า' : 'previous CP'
  ) : (th ? 'จุดสตาร์ท' : 'Start');

  return (
    <div style={{ height: '100%', background: '#fafaf8', display: 'flex',
      flexDirection: 'column' }}>
      <SafariChrome url="trail.run/cp/a1"/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* header */}
        <div style={{ padding: '22px 24px 18px', background: RA.brand,
          color: '#fff' }}>
          <div style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.12em',
            opacity: 0.6 }}>RAYONG TRAIL · {th ? 'จุด A1 · เช็คอิน' : 'A1 · CHECK-IN'}</div>
          <div style={{ display: 'flex', alignItems: 'baseline',
            gap: 10, marginTop: 8 }}>
            <div style={{ fontFamily: RA.font, fontSize: 28, fontWeight: 600,
              letterSpacing: '-0.025em', lineHeight: 1 }}>
              {th ? `สวัสดี ${runner.firstName}!` : `Hi ${runner.firstName}!`}
            </div>
          </div>
          <div style={{ marginTop: 8, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
            {th
              ? 'ระบบจำคุณได้แล้ว · กดยืนยันเข้าจุดพักได้เลย'
              : 'You\'re recognised · just confirm to check in'}
          </div>
        </div>

        {/* runner card — pre-filled identity */}
        <div style={{ padding: '18px 20px 14px' }}>
          <div style={{ background: '#fff', border: `1px solid ${RA.border}`,
            borderRadius: 8, padding: '16px 16px',
            display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 999,
                background: RA.brand, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                fontSize: 18, fontWeight: 600 }}>
                {(runner.firstName || '?').slice(0, 1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                  fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis', color: RA.text }}>
                  {runner.firstName} {runner.lastName}
                </div>
                <div style={{ fontFamily: RA.mono, fontSize: 11, color: RA.muted,
                  marginTop: 2, letterSpacing: '0.04em' }}>
                  {phoneMasked} · {runner.distance}
                </div>
              </div>
            </div>

            {/* mini progress strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', paddingTop: 6,
              borderTop: `1px solid ${RA.border}` }}>
              <div>
                <div style={{ fontFamily: RA.mono, fontSize: 9,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: RA.muted }}>
                  {th ? 'จุดก่อนหน้า' : 'Previous CP'}
                </div>
                <div style={{ fontFamily: RA.mono, fontSize: 13, fontWeight: 500,
                  color: RA.text, marginTop: 2,
                  fontVariantNumeric: 'tabular-nums' }}>
                  {prevCpLabel} · {prevCp ? fmtClock(prevCp.t) : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: RA.mono, fontSize: 9,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: RA.muted }}>
                  {th ? 'กำลังเช็คอินที่' : 'Checking in at'}
                </div>
                <div style={{ fontFamily: RA.font, fontSize: 15, fontWeight: 600,
                  color: RA.text, marginTop: 2,
                  letterSpacing: '-0.01em' }}>
                  A1 · 5.6K
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BIG confirm button — the only thing they need to tap */}
        <div style={{ padding: '0 20px 12px' }}>
          <button style={{
            width: '100%', padding: '20px 16px',
            background: RA.brand, color: '#fff', border: 'none',
            borderRadius: 8, fontFamily: RA.font, fontSize: 17,
            fontWeight: 600, letterSpacing: '-0.005em', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10,
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10.5 L 8 14.5 L 16 5" stroke="#fff" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {th ? 'ยืนยันเข้าจุดพัก A1' : 'Confirm arrival at A1'}
          </button>
          <div style={{ marginTop: 8, textAlign: 'center',
            fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.06em',
            color: RA.muted }}>
            {th ? `เวลา ${fmtClock(runner.lastTime)} · บันทึกอัตโนมัติ`
                : `${fmtClock(runner.lastTime)} · auto-logged`}
          </div>
        </div>

        {/* secondary actions */}
        <div style={{ padding: '4px 20px 18px',
          display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button style={{
            padding: '11px', background: '#fff',
            border: `1px solid ${RA.borderS}`, borderRadius: 6,
            fontFamily: RA.mono, fontSize: 10.5, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.alert,
            cursor: 'pointer',
          }}>! {th ? 'ขอความช่วยเหลือ' : 'I need help'}</button>
          <button style={{
            padding: '12px', background: '#fff',
            border: `1px dashed ${RA.borderS}`, borderRadius: 6,
            fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.06em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.text,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M4 7H10M7 4V10" stroke="#0a0a0a" strokeWidth="1.4"
                strokeLinecap="round" transform="rotate(45 7 7)"/>
            </svg>
            {th ? 'ไม่ใช่ฉัน · ใช้เครื่องคนอื่นอยู่' : 'Not me · I’m on a borrowed phone'}
          </button>

          {/* Self-DNF — small red text link, bottom */}
          <button style={{
            marginTop: 4, padding: '6px',
            background: 'transparent', border: 'none',
            fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.alert,
            cursor: 'pointer', textDecoration: 'underline',
          }}>
            {th ? 'ขอ DNF · ขอถอนตัวจากการแข่ง' : 'Request DNF · withdraw from race'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Stage 2bb (auto-adjust): system auto-promotes or auto-demotes the runner's
// distance based on which physical CPs they passed:
//   • 11K registered + A2 1st scan      → 22K  (committed: they reached A2)
//   • 22K registered + A2 2nd scan      → 29K  (they did the hill loop)
//   • 29K registered + A1 inbound w/    → 22K  (they skipped the loop —
//     only 1 A2 scan instead of 2)             treat as 22K finish
// Up = celebratory green. Down = neutral amber ("ปรับ" not "ลด").
function PhoneWebAdjust({ runner, lang, from, to }) {
  const th = lang === 'th';
  const phoneTail = runner.emergency.replace(/\s/g, '').slice(-4);
  const phoneMasked = '08X-XXX-' + phoneTail;

  const km = (d) => ({ '11K': 11, '22K': 22, '29K': 29 }[d]);
  const isUp = km(to) > km(from);

  // Reason text varies by transition
  const reason = isUp
    ? (from === '11K'
        ? (th ? 'A2 · ขึ้นเขา' : 'A2 · uphill')
        : (th ? 'A2 · ลงเขา · ผ่านรอบเขาแล้ว' : 'A2 · downhill · loop completed'))
    : (th ? 'A1 · ขากลับ · ไม่ได้วิ่งรอบเขา' : 'A1 · inbound · without hill loop');

  // Tone
  const accent = isUp ? RA.brand : RA.warn;
  const accentDk = isUp ? RA.brandDk : '#7c4a03';
  const headerTag = isUp
    ? (th ? '✨ ระบบอัพเกรดอัตโนมัติ' : '✨ AUTO-UPGRADED')
    : (th ? '🛡 ปรับระยะให้เหมาะ' : '🛡 DISTANCE ADJUSTED');
  const headerMsg = isUp
    ? (th ? <>เก่งมาก {runner.firstName}! คุณเช็คอินที่ <b>{reason}</b> ระบบอัพเกรดให้คุณเป็น <b>{to}</b> อัตโนมัติ — ไม่ต้องลงทะเบียนใหม่</>
          : <>Nice work, {runner.firstName}! You hit <b>{reason}</b>, so we’ve bumped you up to <b>{to}</b>. No re-registration.</>)
    : (th ? <>ไม่เป็นไรนะ {runner.firstName} · คุณข้ามรอบเขาแล้วกลับมาที่ A1 ระบบปรับเป็น <b>{to}</b> ให้อัตโนมัติ จะได้ผ่านเส้นชัยอย่างถูกระยะ</>
          : <>No worries, {runner.firstName} — you skipped the hill loop and came back through A1, so we’ve adjusted you to <b>{to}</b> for a proper finish.</>);

  const RemainingRoute = (() => {
    if (to === '22K') return [
      { label: 'A1 · ' + (th ? 'ขากลับ' : 'inbound'), km: '16.5K (' + (th ? 'ผ่านแล้ว' : 'just now') + ')' },
      { label: th ? 'เส้นชัย' : 'Finish',             km: '22K' },
    ];
    if (to === '29K') return [
      { label: 'A1 · ' + (th ? 'ขากลับ' : 'inbound'), km: '23.5K' },
      { label: th ? 'เส้นชัย' : 'Finish',             km: '29K' },
    ];
    return [
      { label: th ? 'เส้นชัย' : 'Finish', km: to },
    ];
  })();

  return (
    <div style={{ height: '100%', background: RA.bg, display: 'flex',
      flexDirection: 'column' }}>
      <SafariChrome url={isUp ? "trail.run/cp/a2" : "trail.run/cp/a1"}/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* hero header */}
        <div style={{ padding: '22px 24px 22px', background: accent,
          color: '#fff', position: 'relative', overflow: 'hidden' }}>
          {/* Decorative pattern (sparkles for up, gentle dots for down) */}
          <svg style={{ position: 'absolute', top: 0, right: -20, opacity: 0.18 }}
            width="180" height="120" viewBox="0 0 180 120">
            {isUp ? (
              <path d="M 30 60 L 35 40 L 55 35 L 35 30 L 30 10 L 25 30 L 5 35 L 25 40 z
                       M 110 80 L 113 68 L 125 65 L 113 62 L 110 50 L 107 62 L 95 65 L 107 68 z
                       M 150 30 L 152 22 L 160 20 L 152 18 L 150 10 L 148 18 L 140 20 L 148 22 z"
                fill="#fff"/>
            ) : (
              <g fill="#fff">
                <circle cx="40" cy="35" r="4"/><circle cx="80" cy="80" r="3"/>
                <circle cx="130" cy="40" r="5"/><circle cx="155" cy="90" r="3"/>
                <circle cx="100" cy="30" r="2"/><circle cx="60" cy="100" r="4"/>
              </g>
            )}
          </svg>
          <div style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.14em',
            opacity: 0.85, fontWeight: 600 }}>
            {headerTag}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14,
            marginTop: 12 }}>
            <div style={{
              fontFamily: RA.font, fontSize: 30, fontWeight: 700,
              letterSpacing: '-0.025em', lineHeight: 1, opacity: 0.45,
              textDecoration: 'line-through',
            }}>{from}</div>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              {isUp ? (
                <path d="M3 11 L 17 11 M11 5 L 17 11 L 11 17" stroke="#fff"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              ) : (
                <path d="M3 11 L 17 11 M11 17 L 17 11 L 11 5" stroke="#fff"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              )}
            </svg>
            <div style={{
              fontFamily: RA.font, fontSize: 40, fontWeight: 700,
              letterSpacing: '-0.03em', lineHeight: 1,
            }}>{to}</div>
          </div>
          <div style={{ marginTop: 12, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 14, color: 'rgba(255,255,255,0.95)', lineHeight: 1.55 }}>
            {headerMsg}
          </div>
        </div>

        {/* runner card */}
        <div style={{ padding: '16px 20px 12px' }}>
          <div style={{ background: '#fff', border: `1px solid ${RA.border}`,
            borderRadius: 8, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 999,
              background: accent, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: th ? '"Noto Sans Thai"' : RA.font,
              fontSize: 16, fontWeight: 600 }}>
              {(runner.firstName || '?').slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                fontSize: 15, fontWeight: 600, color: RA.text }}>
                {runner.firstName} {runner.lastName}
              </div>
              <div style={{ fontFamily: RA.mono, fontSize: 10.5, color: RA.muted,
                marginTop: 2, letterSpacing: '0.04em',
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{phoneMasked}</span>
                <span style={{ color: RA.borderS }}>·</span>
                <span style={{
                  padding: '1px 6px',
                  background: isUp ? 'oklch(0.94 0.06 145)' : '#fdf0d6',
                  color: accentDk, borderRadius: 2, fontWeight: 600,
                }}>{to}</span>
              </div>
            </div>
          </div>
        </div>

        {/* primary confirm */}
        <div style={{ padding: '0 20px 12px' }}>
          <button style={{
            width: '100%', padding: '18px 16px',
            background: accent, color: '#fff', border: 'none',
            borderRadius: 8, fontFamily: RA.font, fontSize: 16,
            fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 9.5 L 7.5 13 L 14 5" stroke="#fff" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isUp
              ? (th ? `รับ ${to} เลย · ไปต่อ` : `Accept ${to} · keep going`)
              : (th ? `รับ ${to} · ไปจบที่เส้นชัย` : `OK · finish as ${to}`)}
          </button>
          <div style={{ marginTop: 8, textAlign: 'center',
            fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.06em',
            color: RA.muted }}>
            {th ? `เช็คอิน ${reason} เวลา ${fmtClock(runner.lastTime)} · บันทึกแล้ว`
                : `Logged ${reason} at ${fmtClock(runner.lastTime)}`}
          </div>
        </div>

        {/* remaining route */}
        <div style={{ padding: '0 20px 12px' }}>
          <div style={{ padding: '12px 14px', background: '#fff',
            border: `1px solid ${RA.border}`, borderRadius: 6 }}>
            <div style={{ fontFamily: RA.mono, fontSize: 10,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: RA.muted, marginBottom: 8 }}>
              {th ? 'เส้นทางที่เหลือ' : 'Your route from here'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {RemainingRoute.map((s, i) => (
                <div key={i} style={{ display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                  fontSize: 13 }}>
                  <span style={{ color: RA.text, display: 'flex',
                    alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 99,
                      background: accent }}/>
                    {s.label}
                  </span>
                  <span style={{ fontFamily: RA.mono, fontSize: 12,
                    color: RA.muted }}>{s.km}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* escape hatch */}
        <div style={{ padding: '4px 20px 18px' }}>
          <button style={{
            width: '100%', padding: '11px',
            background: 'transparent', border: 'none',
            fontFamily: RA.mono, fontSize: 10.5, letterSpacing: '0.06em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.muted,
            cursor: 'pointer', textDecoration: 'underline',
          }}>{isUp
            ? (th ? `กดผิด · ขอกลับเป็น ${from}` : `Oops · back to ${from}`)
            : (th ? `จริงๆฉันวิ่ง ${from} อยู่ · แก้เป็น ${from}` : `Actually I'm doing ${from} · keep ${from}`)
          }</button>
        </div>
      </div>
    </div>
  );
}

// Stage 2c (error): DUPLICATE scan blocked by cool-down.

// Stage 2c (error): DUPLICATE scan blocked by cool-down.
// Two real flavours:
//   1. Same CP, ~minutes after last scan — "you just scanned, calm down"
//   2. A2 loop — "you came up only 22 min ago, need to wait 60 min for the loop"
function PhoneWebDuplicate({ runner, lang }) {
  const th = lang === 'th';
  // demo: the runner scanned A2 at min 65 (going up), tries again at min 87,
  // 22 minutes later. Cool-down at A2 is 60 min.
  const minAgo = 22;
  const cooldown = 60;
  const remaining = cooldown - minAgo;

  return (
    <div style={{ height: '100%', background: '#fafaf8', display: 'flex',
      flexDirection: 'column' }}>
      <SafariChrome url="trail.run/cp/a2"/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* alert header */}
        <div style={{ padding: '22px 24px 20px', background: RA.alert,
          color: '#fff' }}>
          <div style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.12em',
            opacity: 0.7 }}>
            RAYONG TRAIL · {th ? 'เช็คอินซ้ำไม่ได้' : 'DUPLICATE CHECK-IN'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12,
            marginTop: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 999,
              background: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7.5" stroke="#fff" strokeWidth="1.5"/>
                <path d="M9 5v4M9 12.5v.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontFamily: RA.font, fontSize: 22, fontWeight: 600,
              letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {th ? `คุณเพิ่งเช็คอินไปเมื่อสักครู่` : `You just checked in here`}
            </div>
          </div>
          <div style={{ marginTop: 10, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 13.5, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5 }}>
            {th
              ? `ถ้าคุณเพิ่งขึ้นเขา (A2 ขาขึ้น) — ลงเขารอบลูปก่อนแล้วค่อยมาแสกนรอบต่อไป`
              : `If you just arrived (A2 uphill), come back after the hill loop to log A2 downhill.`}
          </div>
        </div>

        {/* last scan info card */}
        <div style={{ padding: '16px 20px 12px' }}>
          <div style={{ background: '#fff', border: `1px solid ${RA.border}`,
            borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontFamily: RA.mono, fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: RA.muted, marginBottom: 6 }}>
              {th ? 'เช็คอินล่าสุดของ ' : 'Last scan for '}
              <span style={{ color: RA.text, fontWeight: 600 }}>{runner.firstName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: RA.font, fontSize: 16, fontWeight: 600,
                  color: RA.text, letterSpacing: '-0.01em' }}>
                  A2 · {th ? 'ขึ้นเขา' : 'uphill'}
                </div>
                <div style={{ fontFamily: RA.mono, fontSize: 11, color: RA.muted,
                  marginTop: 2 }}>{th ? 'เมื่อ ' : ''}
                  {minAgo} {th ? 'นาทีที่แล้ว' : 'min ago'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: RA.mono, fontSize: 10,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: RA.muted }}>
                  {th ? 'สแกนได้อีกรอบใน' : 'Rescannable in'}
                </div>
                <div style={{ fontFamily: RA.mono, fontSize: 20, fontWeight: 600,
                  color: RA.alert, fontVariantNumeric: 'tabular-nums',
                  marginTop: 2 }}>
                  {remaining}’
                </div>
              </div>
            </div>
            {/* cool-down progress */}
            <div style={{ marginTop: 10, height: 4, background: '#f4f3ef',
              borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ width: `${(minAgo / cooldown) * 100}%`, height: '100%',
                background: RA.alert }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              marginTop: 4, fontFamily: RA.mono, fontSize: 9, color: RA.muted,
              letterSpacing: '0.04em' }}>
              <span>{th ? 'ขึ้น A2' : 'A2 uphill'}</span>
              <span>{th ? 'ขั้นต่ำ 60’ (รอบลูป)' : 'min 60’ (loop)'}</span>
            </div>
          </div>
        </div>

        {/* why this happens */}
        <div style={{ padding: '4px 20px 14px' }}>
          <div style={{ padding: '12px 14px', background: '#fff7e6',
            border: `1px solid #fde6c4`, borderRadius: 6,
            fontFamily: th ? '"Noto Sans Thai"' : RA.font, fontSize: 12.5,
            color: '#7c4a03', lineHeight: 1.55 }}>
            <span style={{ fontFamily: RA.mono, fontSize: 9.5,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#a35e02', marginRight: 6, fontWeight: 600 }}>
              {th ? 'ทำไมถึงฟ้อง' : 'Why'}
            </span>
            {th
              ? 'ป้องกันการแสกนซ้ำโดยไม่ได้ขึ้นเขาจริง · ระบบต้องรู้ว่าคุณไปวนมาแล้วจริงๆ'
              : 'To make sure you actually did the hill loop — the system needs to know you finished it before counting a downhill scan.'}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ padding: '0 20px 20px', display: 'flex',
          flexDirection: 'column', gap: 8 }}>
          <button style={{
            padding: '14px', background: '#fff',
            border: `1px solid ${RA.borderS}`, borderRadius: 6,
            fontFamily: RA.mono, fontSize: 11.5, letterSpacing: '0.06em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.text,
            cursor: 'pointer',
          }}>{th ? 'ไปต่อ · ยังไม่ได้ลงเขา' : "OK, I'll come back after the loop"}</button>
          <button style={{
            padding: '12px', background: 'transparent', border: 'none',
            fontFamily: RA.mono, fontSize: 10.5, letterSpacing: '0.06em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.alert,
            cursor: 'pointer',
          }}>{th ? '! มีปัญหา · ขอคุยกับสตาฟ' : '! Something wrong · talk to staff'}</button>
        </div>
      </div>
    </div>
  );
}

// Stage 2e (request): SELF-DNF — two-step confirmation with reason.
// Reached from the small red "ขอ DNF" link on the recognized screen.
// Step 1 (this screen) collects reason, requires explicit confirm tap.
// Step 2 = the actual DNF gets logged and the page flips to a goodbye state.
function PhoneWebDNF({ runner, lang }) {
  const th = lang === 'th';
  const phoneTail = runner.emergency.replace(/\s/g, '').slice(-4);
  const phoneMasked = '08X-XXX-' + phoneTail;
  const prevCp = runner.history[runner.history.length - 1];
  const prevCpLabel = prevCp ? (
    prevCp.id === 'start' ? (th ? 'จุดสตาร์ท' : 'Start') :
    prevCp.id === 'a1_out' || prevCp.id === 'a1_in' ? 'A1' :
    prevCp.id === 'a2_in'  || prevCp.id === 'a2_out' ? 'A2' :
    th ? 'จุดล่าสุด' : 'last CP'
  ) : (th ? 'จุดสตาร์ท' : 'Start');

  // Quick-pick reason chips (the second is "selected" for the mock)
  const reasons = th ? [
    'บาดเจ็บ / เจ็บกล้ามเนื้อ',
    'หมดแรง / ไม่ไหว',
    'เวลาไม่พอ · ใกล้ cut-off',
    'ปัญหาส่วนตัว · ฉุกเฉิน',
    'สภาพอากาศ',
    'อื่นๆ',
  ] : [
    'Injury / muscle pain',
    'Exhausted',
    'Time / near cut-off',
    'Personal · emergency',
    'Weather',
    'Other',
  ];
  const selectedReason = 1; // "หมดแรง" / "Exhausted"
  const sampleNote = th
    ? 'เป็นตะคริวที่น่องตั้งแต่ A2 ขาขึ้น พักแล้วยังไม่ดี ขอลงที่นี่ก่อน'
    : 'Calf cramp since A2 uphill, rest didn’t help. Calling it.';

  return (
    <div style={{ height: '100%', background: RA.bg, display: 'flex',
      flexDirection: 'column' }}>
      <SafariChrome url="trail.run/dnf"/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* header (alert red but informational, not panic) */}
        <div style={{ padding: '20px 24px 18px', background: RA.alert,
          color: '#fff' }}>
          <div style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.14em',
            opacity: 0.85, fontWeight: 600 }}>
            {th ? 'ยืนยันขอถอนตัว · DNF' : 'CONFIRM WITHDRAWAL · DNF'}
          </div>
          <div style={{ fontFamily: RA.font, fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.02em', lineHeight: 1.15, marginTop: 10 }}>
            {th ? `${runner.firstName} · ขอถอนตัวจากการแข่ง?`
                : `${runner.firstName} · withdraw from the race?`}
          </div>
          <div style={{ marginTop: 8, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5 }}>
            {th
              ? 'ทีมงานจะรู้ทันทีว่าคุณไม่วิ่งต่อ · ถ้าต้องการให้ไปรับที่จุดพัก เลือก "ขอรถรับ"'
              : 'Race control will know right away. If you need a pickup, tap "request pickup".'}
          </div>
        </div>

        {/* runner summary */}
        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ background: '#fff', border: `1px solid ${RA.border}`,
            borderRadius: 8, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 999,
              background: RA.alert, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: th ? '"Noto Sans Thai"' : RA.font,
              fontSize: 15, fontWeight: 600 }}>
              {(runner.firstName || '?').slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                fontSize: 14, fontWeight: 600, color: RA.text }}>
                {runner.firstName} {runner.lastName}
              </div>
              <div style={{ fontFamily: RA.mono, fontSize: 10, color: RA.muted,
                marginTop: 2, letterSpacing: '0.04em' }}>
                {phoneMasked} · {runner.distance} · {th ? 'อยู่ที่' : 'at'} {prevCpLabel}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: RA.mono, fontSize: 9,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: RA.muted }}>
                {th ? 'วิ่งไปแล้ว' : 'Logged'}
              </div>
              <div style={{ fontFamily: RA.mono, fontSize: 14, fontWeight: 600,
                color: RA.text, fontVariantNumeric: 'tabular-nums' }}>
                {runner.progressKm.toFixed(1)}K
              </div>
            </div>
          </div>
        </div>

        {/* Reason chips */}
        <div style={{ padding: '12px 20px 4px' }}>
          <div style={{ fontFamily: RA.mono, fontSize: 10,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: RA.muted, marginBottom: 8 }}>
            {th ? 'เหตุผล · จำเป็น' : 'Reason · required'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {reasons.map((r, i) => {
              const active = i === selectedReason;
              return (
                <div key={i} style={{
                  padding: '8px 12px',
                  background: active ? RA.alert : '#fff',
                  color: active ? '#fff' : RA.text,
                  border: `1px solid ${active ? RA.alert : RA.borderS}`,
                  borderRadius: 999,
                  fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                  fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {active && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5 L 4.5 8 L 9 3" stroke="#fff" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {r}
                </div>
              );
            })}
          </div>
        </div>

        {/* Note */}
        <div style={{ padding: '14px 20px 6px' }}>
          <div style={{ fontFamily: RA.mono, fontSize: 10,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: RA.muted, marginBottom: 6 }}>
            {th ? 'รายละเอียดเพิ่มเติม · เผื่อทีมต้องตามไปดู' : 'Details · helps the team find you'}
          </div>
          <div style={{
            padding: '12px 12px',
            background: '#fff', border: `1px solid ${RA.borderS}`,
            borderRadius: 6,
            fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 13, color: RA.text, lineHeight: 1.55,
            minHeight: 64,
          }}>{sampleNote}</div>
        </div>

        {/* CTAs — destructive primary, easy cancel */}
        <div style={{ padding: '14px 20px 8px', display: 'flex',
          flexDirection: 'column', gap: 8 }}>
          <button style={{
            width: '100%', padding: '16px',
            background: RA.alert, color: '#fff', border: 'none',
            borderRadius: 8, fontFamily: RA.font, fontSize: 15,
            fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8,
          }}>
            ✓ {th ? `ยืนยัน DNF · ที่ ${prevCpLabel}` : `Confirm DNF · at ${prevCpLabel}`}
          </button>
          <button style={{
            width: '100%', padding: '14px',
            background: '#fff', color: RA.text,
            border: `1px solid ${RA.borderS}`, borderRadius: 8,
            fontFamily: RA.font, fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}>
            {th ? '← ขอกลับ · วิ่งต่อ' : '← Back · keep going'}
          </button>
        </div>

        {/* Optional pickup request */}
        <div style={{ padding: '4px 20px 18px' }}>
          <div style={{ padding: '10px 12px', background: '#fdf0d6',
            border: `1px solid #f0d896`, borderRadius: 6,
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="2" y="8" width="13" height="8" rx="1" stroke="#7c4a03" strokeWidth="1.4"/>
              <path d="M15 10 L18 10 L20 13 V16 H15" stroke="#7c4a03" strokeWidth="1.4" fill="none"/>
              <circle cx="6" cy="17" r="1.8" stroke="#7c4a03" strokeWidth="1.4" fill="#fff"/>
              <circle cx="16" cy="17" r="1.8" stroke="#7c4a03" strokeWidth="1.4" fill="#fff"/>
            </svg>
            <div style={{ flex: 1, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
              fontSize: 12, color: '#7c4a03', lineHeight: 1.4 }}>
              {th ? <><b>ขอรถรับ</b>ที่ {prevCpLabel} ด้วย</> : <><b>Request pickup</b> at {prevCpLabel}</>}
            </div>
            <span style={{ width: 32, height: 18, borderRadius: 999,
              background: '#7c4a03', position: 'relative',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }}>
              <span style={{ position: 'absolute', right: 2, top: 2,
                width: 14, height: 14, borderRadius: 999, background: '#fff' }}/>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stage 3 (celebration): FINISH — runner scans the dedicated finish QR.
// Big hero with logo, official time, full run summary, share + collect-medal CTA.
// `adjusted` shows the auto-adjust note (e.g. registered 29K but finished as 22K).
function PhoneWebFinish({ runner, lang, adjusted }) {
  const th = lang === 'th';
  const distFinal = runner.distance;
  // Build a finish timestamp (use plan.finish if present, else fall back)
  const finishMin = runner.plan?.finish ?? runner.lastTime ?? 180;
  const wave = runner.plan?.start ?? 0;
  const elapsedMin = finishMin - wave;
  const eh = Math.floor(elapsedMin / 60);
  const em = Math.floor(elapsedMin % 60);
  const es = Math.floor(((elapsedMin * 60) % 60));
  // Cosmetic avg pace
  const avgPace = elapsedMin / ({ '11K': 11, '22K': 22, '29K': 29 }[distFinal] || 11);
  const pm = Math.floor(avgPace);
  const ps = Math.floor((avgPace - pm) * 60);

  // Per-CP timeline based on the runner's actual history
  const cpRows = (runner.history || []).map(h => ({
    id: h.id, time: fmtClock(h.t),
    label: h.id === 'start'                            ? (th ? 'จุดสตาร์ท' : 'Start')
         : h.id === 'a1_out' || h.id === 'a1_in'       ? 'A1 · ' + (h.id === 'a1_out' ? (th ? 'ขาไป' : 'out') : (th ? 'ขากลับ' : 'in'))
         : h.id === 'a2_in'  || h.id === 'a2_out'      ? 'A2 · ' + (h.id === 'a2_in'  ? (th ? 'ขึ้น'  : 'up') : (th ? 'ลง'  : 'down'))
         : h.id === 'finish'                           ? (th ? 'เส้นชัย' : 'Finish')
         : h.id,
  }));
  // Ensure Finish is in the list for the mock if not already
  if (!cpRows.some(r => r.id === 'finish')) {
    cpRows.push({ id: 'finish', label: th ? 'เส้นชัย' : 'Finish', time: fmtClock(finishMin) });
  }

  return (
    <div style={{ height: '100%', background: RA.bg, display: 'flex',
      flexDirection: 'column' }}>
      <SafariChrome url="trail.run/cp/finish"/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Hero — logo + congrats */}
        <div style={{
          padding: '24px 24px 20px',
          background: `linear-gradient(180deg, ${RA.brand} 0%, ${RA.brandDk} 100%)`,
          color: '#fff', position: 'relative', overflow: 'hidden',
        }}>
          {/* confetti */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0.22, pointerEvents: 'none' }} viewBox="0 0 360 280" preserveAspectRatio="xMidYMid slice">
            {Array.from({length: 26}).map((_, i) => {
              const x = (i * 137) % 360;
              const y = (i * 71) % 280;
              const r = 1 + (i % 3);
              const c = ['#fff', '#fde68a', '#fdba74', '#bbf7d0'][i % 4];
              return <circle key={i} cx={x} cy={y} r={r} fill={c}/>;
            })}
          </svg>

          {/* logo + brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
            position: 'relative', zIndex: 1 }}>
            <div style={{ width: 38, height: 38, borderRadius: 4,
              background: '#fff', padding: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RayongLogo size={32}/>
            </div>
            <div>
              <div style={{ fontFamily: '"Georgia", serif', fontStyle: 'italic',
                fontSize: 13, fontWeight: 600, lineHeight: 1.1 }}>
                Rayong Trail Running
              </div>
              <div style={{ fontFamily: RA.mono, fontSize: 9,
                letterSpacing: '0.14em', opacity: 0.75, marginTop: 1 }}>
                {th ? 'เส้นชัยอย่างเป็นทางการ' : 'OFFICIAL FINISH'}
              </div>
            </div>
          </div>

          {/* big finish mark */}
          <div style={{ marginTop: 22, fontFamily: '"Georgia", serif',
            fontStyle: 'italic', fontSize: 36, fontWeight: 700,
            letterSpacing: '-0.02em', lineHeight: 1.05, position: 'relative', zIndex: 1 }}>
            🏁 {th ? `${runner.firstName}` : `Congrats, ${runner.firstName}!`}
          </div>
          <div style={{ marginTop: 6, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.92)',
            lineHeight: 1.4, position: 'relative', zIndex: 1 }}>
            {th
              ? <>เข้าเส้นชัย <b>{distFinal}</b> สำเร็จ! ยอดเยี่ยมมาก 👏</>
              : <>You crossed the <b>{distFinal}</b> finish line. Outstanding! 👏</>}
          </div>
        </div>

        {/* Official time — the headline number */}
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ background: '#fff', border: `1px solid ${RA.border}`,
            borderRadius: 10, padding: '16px 16px',
            boxShadow: '0 1px 0 rgba(45,106,79,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline' }}>
              <div style={{ fontFamily: RA.mono, fontSize: 10,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: RA.muted, fontWeight: 600 }}>
                {th ? 'เวลาทางการ' : 'Official time'}
              </div>
              <div style={{ fontFamily: RA.mono, fontSize: 10, color: RA.muted,
                letterSpacing: '0.04em' }}>
                {th ? 'เริ่ม' : 'gun'} {fmtClock(wave)} · {th ? 'เข้าเส้น' : 'in'} {fmtClock(finishMin)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6,
              marginTop: 6 }}>
              <span style={{ fontFamily: '"Georgia", serif', fontStyle: 'italic',
                fontSize: 44, fontWeight: 700, color: RA.brandDk,
                letterSpacing: '-0.04em', lineHeight: 1,
                fontVariantNumeric: 'tabular-nums' }}>
                {eh}:{String(em).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: RA.mono, fontSize: 16, fontWeight: 600,
                color: RA.muted, fontVariantNumeric: 'tabular-nums' }}>
                :{String(es).padStart(2, '0')}
              </span>
              <span style={{ flex: 1 }}/>
              <span style={{
                padding: '4px 10px', background: 'oklch(0.94 0.06 145)',
                color: RA.brandDk, borderRadius: 999, fontFamily: RA.mono,
                fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
              }}>{distFinal}</span>
            </div>

            {/* stats row */}
            <div style={{ marginTop: 14, paddingTop: 14,
              borderTop: `1px solid ${RA.border}`,
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                [th ? 'ระยะ' : 'Distance', `${({'11K':11,'22K':22,'29K':29}[distFinal])} km`],
                [th ? 'เพซเฉลี่ย' : 'Avg pace', `${pm}'${String(ps).padStart(2,'0')}"/km`],
                [th ? 'จุดที่ผ่าน' : 'CPs', `${cpRows.length}`],
              ].map(([lbl, val], i) => (
                <div key={i}>
                  <div style={{ fontFamily: RA.mono, fontSize: 9,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: RA.muted }}>{lbl}</div>
                  <div style={{ fontFamily: RA.font, fontSize: 14, fontWeight: 600,
                    color: RA.text, marginTop: 2,
                    fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Adjustment note (if applicable) */}
        {adjusted && (
          <div style={{ padding: '12px 20px 0' }}>
            <div style={{ padding: '10px 12px', background: '#fdf0d6',
              border: `1px solid #f0d896`, borderRadius: 6,
              display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>🛡</span>
              <div style={{ flex: 1, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                fontSize: 12, color: '#7c4a03', lineHeight: 1.5 }}>
                {th
                  ? <><b>จบที่ {distFinal}</b> · ระบบปรับให้อัตโนมัติเพราะคุณข้ามรอบเขา · ลงทะเบียนไว้ 29K</>
                  : <><b>Finished as {distFinal}</b> · auto-adjusted (skipped hill loop) · registered as 29K</>}
              </div>
            </div>
          </div>
        )}

        {/* CP timeline */}
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ background: '#fff', border: `1px solid ${RA.border}`,
            borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontFamily: RA.mono, fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: RA.muted, marginBottom: 10, fontWeight: 600 }}>
              {th ? 'ไทม์ไลน์ของคุณ' : 'Your timeline'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0,
              position: 'relative' }}>
              {cpRows.map((cp, i) => {
                const isFinish = cp.id === 'finish';
                return (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 0',
                    position: 'relative' }}>
                    <div style={{ position: 'relative', width: 16, flex: '0 0 16px' }}>
                      <div style={{ position: 'absolute', left: 5, top: 6,
                        width: 6, height: 6, borderRadius: 99,
                        background: isFinish ? RA.brand : RA.muted }}/>
                      {i < cpRows.length - 1 && (
                        <div style={{ position: 'absolute', left: 7, top: 14,
                          bottom: -6, width: 2, background: RA.border }}/>
                      )}
                    </div>
                    <div style={{ flex: 1, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                      fontSize: 13, color: RA.text,
                      fontWeight: isFinish ? 600 : 500 }}>{cp.label}</div>
                    <div style={{ fontFamily: RA.mono, fontSize: 12,
                      color: RA.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {cp.time}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Collect medal callout */}
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ padding: '14px 16px',
            background: `linear-gradient(135deg, oklch(0.94 0.06 145) 0%, oklch(0.92 0.07 65) 100%)`,
            borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 99,
              background: '#fff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 22 }}>
              🏅
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                fontSize: 14, fontWeight: 700, color: RA.brandDk }}>
                {th ? 'ไปรับเหรียญที่จุดรับ' : 'Collect your medal'}
              </div>
              <div style={{ fontFamily: RA.mono, fontSize: 10.5,
                letterSpacing: '0.04em', color: RA.brandDk, opacity: 0.75,
                marginTop: 2 }}>
                {th ? 'โต๊ะข้างเส้นชัย · โชว์หน้านี้' : 'Table next to finish · show this page'}
              </div>
            </div>
            <span style={{ fontSize: 20, color: RA.brandDk }}>›</span>
          </div>
        </div>

        {/* Share buttons */}
        <div style={{ padding: '14px 20px 12px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button style={{
            padding: '13px', background: RA.brand, color: '#fff', border: 'none',
            borderRadius: 8, fontFamily: RA.mono, fontSize: 11,
            letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 11 V8 a2 2 0 0 1 2 -2 H9 V3.5 L13 7 L9 10.5 V8 H5 a2 2 0 0 0 -2 2 V11"
                stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {th ? 'แชร์ผลวิ่ง' : 'Share result'}
          </button>
          <button style={{
            padding: '13px', background: '#fff', color: RA.text,
            border: `1px solid ${RA.borderS}`, borderRadius: 8,
            fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 5 V12 H11 V5 M5 5 V3 a2 2 0 0 1 2 -2 a2 2 0 0 1 2 2 V5 M3 8 H11"
                stroke={RA.text} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {th ? 'บันทึกใบประกาศ' : 'Save certificate'}
          </button>
        </div>

        {/* Final cheers */}
        <div style={{ padding: '4px 20px 24px' }}>
          <div style={{ padding: '12px 14px', background: '#fff',
            border: `1px dashed ${RA.borderS}`, borderRadius: 6,
            fontFamily: th ? '"Noto Sans Thai"' : RA.font, fontSize: 12.5,
            color: RA.muted, lineHeight: 1.55, textAlign: 'center' }}>
            {th
              ? <>ขอบคุณที่มาวิ่งด้วยกัน · พักผ่อน ดื่มน้ำเยอะๆ <br/>แล้วเจอกันรอบหน้านะ 🌲</>
              : <>Thanks for running with us · rest, hydrate <br/>and see you next time 🌲</>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stage 2d (fallback): SEARCH — used only when device is new / data cleared.
// "ไม่ใช่ฉัน" จากหน้า recognized มาตกที่นี่ พิมพ์ชื่อหรือเบอร์แล้วเด้งรายการ.
function PhoneWebSearch({ runner, lang, allRunners }) {
  const th = lang === 'th';
  const typed = (runner.firstName || '').slice(0, 1);

  // Build a list of candidate runners whose nickname starts with `typed`.
  // (Demo data — in production, only matches the typed prefix.)
  const matches = (allRunners || [])
    .filter(r => r.firstName && r.firstName.toLowerCase().startsWith(typed.toLowerCase()))
    .slice(0, 6);
  // Ensure our hero runner is first
  const ordered = [runner, ...matches.filter(r => r !== runner)].slice(0, 6);

  return (
    <div style={{ height: '100%', background: '#fafaf8', display: 'flex',
      flexDirection: 'column' }}>
      <SafariChrome url="trail.run/cp/a1"/>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* borrowed-phone callout */}
        <div style={{ padding: '10px 16px', background: '#fff7e6',
          borderBottom: `1px solid #fde6c4`,
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 999,
            background: '#fff', border: '1px solid #fde6c4',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 1.5 H7.5 L9.5 3.5 V10 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V2.5 a1 1 0 0 1 1 -1 z"
                stroke="#7c4a03" strokeWidth="1" fill="none"/>
            </svg>
          </div>
          <div style={{ flex: 1, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 12, color: '#7c4a03', lineHeight: 1.4 }}>
            {th
              ? <><b>โหมดเครื่องอื่น</b> · ค้นหาตัวเองด้วยชื่อหรือเบอร์ที่ลงทะเบียนไว้</>
              : <><b>Borrowed-device mode</b> · search yourself by registered name or phone</>}
          </div>
        </div>

        {/* page header */}
        <div style={{ padding: '22px 24px 18px', background: RA.text,
          color: '#fff' }}>
          <div style={{ fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.12em',
            opacity: 0.6 }}>RAYONG TRAIL · {th ? 'เช็คอินจุดพัก' : 'CHECK-IN'}</div>
          <div style={{ display: 'flex', alignItems: 'baseline',
            gap: 10, marginTop: 8 }}>
            <div style={{ fontFamily: RA.font, fontSize: 30, fontWeight: 600,
              letterSpacing: '-0.025em', lineHeight: 1 }}>A1</div>
            <div style={{ fontFamily: RA.mono, fontSize: 12,
              color: 'rgba(255,255,255,0.7)' }}>· เขามะเข้ม · 5.6 KM</div>
          </div>
          <div style={{ marginTop: 8, fontFamily: th ? '"Noto Sans Thai"' : RA.font,
            fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
            {th ? 'พิมพ์ชื่อหรือเบอร์ของคุณ' : 'Type your name or phone'}
          </div>
        </div>

        {/* search field — shows the user typed one letter */}
        <div style={{ padding: '14px 20px 8px' }}>
          <div style={{ position: 'relative' }}>
            <input
              defaultValue={typed}
              style={{
                width: '100%', padding: '15px 14px 15px 42px',
                fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                fontSize: 18, fontWeight: 500,
                background: '#fff', border: `2px solid #0a0a0a`,
                borderRadius: 8, color: RA.text, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', fontSize: 18, color: RA.text }}>⌕</span>
            {/* fake caret */}
            <span style={{ position: 'absolute', left: 56, top: '50%',
              transform: 'translateY(-50%)', width: 1, height: 22,
              background: RA.brand,
              animation: 'pulse 0s' }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            marginTop: 6, paddingLeft: 2 }}>
            <span style={{ fontFamily: RA.mono, fontSize: 10, color: RA.muted,
              letterSpacing: '0.06em' }}>
              {th ? `พบ ${ordered.length} คนที่ขึ้นต้นด้วย "${typed}"`
                  : `${ordered.length} matches starting with "${typed}"`}
            </span>
            <span style={{ fontFamily: RA.mono, fontSize: 10, color: RA.muted,
              letterSpacing: '0.06em' }}>
              {th ? 'หรือพิมพ์เบอร์โทร' : 'or type phone'}
            </span>
          </div>
        </div>

        {/* autocomplete dropdown */}
        <div style={{ padding: '4px 20px 12px', display: 'flex',
          flexDirection: 'column', gap: 4 }}>
          {ordered.map((r, i) => {
            const isMatch = i === 0;
            const phoneTail = r.emergency.replace(/\s/g, '').slice(-4);
            return (
              <div key={r.bib || i} style={{
                padding: '12px 14px',
                background: isMatch ? RA.brand : '#fff',
                color: isMatch ? '#fff' : RA.text,
                border: `1px solid ${isMatch ? RA.brand : RA.border}`,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', gap: 12,
                position: 'relative',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: th ? '"Noto Sans Thai"' : RA.font,
                    fontSize: 15, fontWeight: 600,
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    <span style={{
                      background: isMatch ? 'rgba(255,255,255,0.18)' : '#fff2a8',
                      padding: '0 2px', borderRadius: 2,
                    }}>{(r.firstName || '').slice(0, 1)}</span>
                    {(r.firstName || '').slice(1)} {r.lastName || ''}
                  </div>
                  <div style={{
                    fontFamily: RA.mono, fontSize: 11,
                    color: isMatch ? 'rgba(255,255,255,0.7)' : RA.muted,
                    marginTop: 2, letterSpacing: '0.04em',
                  }}>
                    ····{phoneTail} · {r.distance}
                  </div>
                </div>
                {isMatch && (
                  <span style={{ fontFamily: RA.mono, fontSize: 10,
                    letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)',
                    textTransform: 'uppercase' }}>
                    {th ? 'แตะเพื่อยืนยัน' : 'tap to confirm'} ›
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* fallback: not me / phone search */}
        <div style={{ padding: '0 20px 20px', display: 'flex',
          flexDirection: 'column', gap: 8 }}>
          <button style={{
            padding: '12px', background: '#fff',
            border: `1px solid ${RA.borderS}`, borderRadius: 6,
            fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.text,
            cursor: 'pointer',
          }}>{th ? 'ไม่ใช่ฉัน · พิมพ์เบอร์แทน' : 'Not me · search by phone'}</button>
          <button style={{
            padding: '10px', background: 'transparent', border: 'none',
            fontFamily: RA.mono, fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.muted,
            cursor: 'pointer',
          }}>{th ? 'ยังไม่ได้ลงทะเบียน?' : 'Not registered yet?'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, mono, hint, lang }) {
  const th = lang === 'th';
  const isFilled = !!value;
  return (
    <div>
      <div style={{ fontFamily: RA.mono, fontSize: 10,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: RA.muted, marginBottom: 6 }}>{label}</div>
      <div style={{
        padding: '13px 14px',
        background: '#fff', border: `1px solid ${RA.borderS}`,
        borderRadius: 6,
        fontFamily: mono ? RA.mono : (th ? '"Noto Sans Thai"' : RA.font),
        fontSize: 15, fontWeight: 500,
        color: isFilled ? RA.text : RA.mute2,
        letterSpacing: mono ? '0.02em' : 'normal',
      }}>{value || placeholder}</div>
      {hint && (
        <div style={{ marginTop: 4, paddingLeft: 2, fontFamily: RA.mono,
          fontSize: 10, color: RA.muted, letterSpacing: '0.04em' }}>{hint}</div>
      )}
    </div>
  );
}

// Stage 3: confirmation page
function PhoneWebSuccess({ runner, lang }) {
  const th = lang === 'th';
  const phoneTail = runner.emergency.replace(/\s/g, '').slice(-4);
  return (
    <div style={{ height: '100%', background: '#fafaf8', display: 'flex',
      flexDirection: 'column' }}>
      <SafariChrome url="trail.run/cp/a1"/>
      <div style={{ flex: 1, padding: '24px 24px 30px',
        display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: RA.brand,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14 }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M5 11.5 L 9 15 L 17 6" stroke="#fff" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontFamily: RA.font, fontSize: 24, fontWeight: 600,
          letterSpacing: '-0.02em', color: RA.text, lineHeight: 1.15 }}>
          {th ? `สวัสดี ${runner.firstName}` : `Hi ${runner.firstName}!`}
        </div>
        <div style={{ fontFamily: RA.font, fontSize: 16, fontWeight: 500,
          color: RA.text, marginTop: 4 }}>
          {th ? `เช็คอินที่ A1 สำเร็จ` : `Checked in at A1`}
        </div>
        <div style={{ fontFamily: RA.font, fontSize: 13, color: '#525252',
          marginTop: 8, lineHeight: 1.5 }}>
          {th
            ? `บันทึกเวลา ${fmtClock(runner.lastTime)} · ทีมแม่บ้านเห็นตำแหน่งของคุณแล้ว ลุยต่อได้เลย`
            : `Logged at ${fmtClock(runner.lastTime)} · race control sees you. Carry on.`}
        </div>

        {/* runner summary card */}
        <div style={{ marginTop: 22, padding: '16px 16px', background: '#fff',
          border: `1px solid ${RA.border}`, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline' }}>
            <div style={{ fontFamily: RA.mono, fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: RA.muted }}>
              {th ? 'ระยะที่วิ่ง' : 'Distance run'}
            </div>
            <div style={{ fontFamily: RA.mono, fontSize: 10, color: RA.muted,
              letterSpacing: '0.04em' }}>
              {runner.distance} · ····{phoneTail}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4,
            marginTop: 4 }}>
            <span style={{ fontFamily: RA.font, fontSize: 28, fontWeight: 600,
              letterSpacing: '-0.025em' }}>{runner.progressKm.toFixed(1)}</span>
            <span style={{ fontFamily: RA.mono, fontSize: 12, color: RA.muted }}>
              / {runner.course.distance} {th ? 'กม.' : 'km'}
            </span>
          </div>
          <div style={{ marginTop: 12, fontFamily: RA.mono, fontSize: 11,
            color: RA.text }}>
            {th ? 'จุดถัดไป' : 'Next'} →{' '}
            {runner.nextCp === 'a1_out' || runner.nextCp === 'a1_in' ? 'A1' :
             runner.nextCp === 'a2_in' || runner.nextCp === 'a2_out' ? 'A2' :
             th ? 'เส้นชัย' : 'Finish'}
          </div>
        </div>

        {/* safety */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button style={{
            flex: 1, padding: '13px', background: '#fff',
            border: `1px solid ${RA.borderS}`, borderRadius: 6,
            fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, color: RA.text,
            cursor: 'pointer',
          }}>✓ {th ? 'ปลอดภัย วิ่งต่อ' : "I'm OK, going on"}</button>
        </div>
        <button style={{
          marginTop: 8, padding: '13px',
          background: '#fff', border: `1px solid ${RA.alert}`, borderRadius: 6,
          fontFamily: RA.mono, fontSize: 11, letterSpacing: '0.08em',
          textTransform: 'uppercase', fontWeight: 600, color: RA.alert,
          cursor: 'pointer',
        }}>! {th ? 'ขอความช่วยเหลือ' : 'I need help'}</button>

        <div style={{ flex: 1 }}/>

        <div style={{ marginTop: 16, padding: '10px 12px',
          background: '#f4f3ef', borderRadius: 6,
          fontFamily: RA.mono, fontSize: 10, color: RA.muted,
          letterSpacing: '0.04em', lineHeight: 1.5 }}>
          {th
            ? '💡 บุ๊คมาร์คหน้านี้ได้เลย · หรือแสกน QR ที่จุดถัดไปอีกครั้ง'
            : '💡 Bookmark this page · or just scan the next CP poster'}
        </div>
      </div>
    </div>
  );
}

function SafariChrome({ url }) {
  return (
    <div style={{ background: '#f4f3ef', borderBottom: '1px solid #d6d4cc',
      padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#dcdbd5', borderRadius: 8,
        padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: RA.font, fontSize: 13, color: RA.text,
        justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: '#525252' }}>🔒</span>
        <span style={{ fontWeight: 500 }}>{url}</span>
      </div>
      <span style={{ fontSize: 16, color: RA.text }}>⤴</span>
    </div>
  );
}

Object.assign(window, {
  RunnerStaffScan, RunnerSelfScan, RunnerGPSAuto, RunnerManual, RunnerWebFlow, FakeQR, RA,
  // Backend action helpers (see top of file)
  runnerRegister, runnerCheckin, runnerLookup, runnerDnf, runnerSearch,
  getRunnerToken, setRunnerToken, clearRunnerToken,
});

// dashboard.jsx — Race Director Dashboard
// Hybrid layout: header KPIs · course schematic · alerts feed · roster table

const { useMemo, useState, useEffect } = React;

// ─── Tokens (Trail / Outdoor palette — green + clay + sky) ──────────────
const D = {
  bg:       '#f5f1e8',  // warm cream paper
  surface:  '#ffffff',
  surface2: '#ede7d8',  // tan
  text:     '#1f2a1c',  // deep forest near-black
  muted:    '#5d6b59',  // warm gray-green
  mute2:    '#a8b1a3',
  border:   '#d8d2c2',
  borderS:  '#bdb6a4',

  // Brand / status
  brand:    '#2d6a4f',  // forest green — used for primary
  brandDk:  '#1f4d39',
  alert:    'oklch(0.58 0.22 28)',   // ember red
  alertBg:  'oklch(0.96 0.05 28)',
  warn:     'oklch(0.68 0.16 70)',   // amber
  warnBg:   'oklch(0.97 0.04 75)',
  ok:       '#2d6a4f',
  rest:     '#7c8a78',

  // Distance colors — distinct & vivid
  d29:      '#1f4d39',  // 29K deep forest
  d22:      '#e07a3e',  // 22K terracotta
  d11:      '#3a86c4',  // 11K sky blue

  font:     '"Geist", ui-sans-serif, system-ui, sans-serif',
  mono:     '"Geist Mono", ui-monospace, "SF Mono", monospace',
};

// ─── Ascend chart: x = km, y = elevation; runner dots stack above terrain
// ────────────────────────────────────────────────────────────────────────
// Replaces the geographic map. Reads the official elevation profile from
// data.jsx and stacks runner pucks at their current km bucket so density
// at each point is visible at a glance.
const CHART = {
  w: 1200, h: 460,
  padL: 56, padR: 24, padT: 48, padB: 56,
  yMin: 150, yMax: 500,
};

function elevToY(elev) {
  const { padT, h, padB, yMin, yMax } = CHART;
  const usable = h - padT - padB;
  return padT + usable * (1 - (elev - yMin) / (yMax - yMin));
}
function kmToX(km) {
  const { padL, w, padR } = CHART;
  const usable = w - padL - padR;
  return padL + usable * (km / 29);
}

function terrainPath() {
  const pts = ELEVATION_KM.map(([k, e]) => [kmToX(k), elevToY(e)]);
  let d = `M ${pts[0][0]} ${elevToY(150)}`;
  d += ` L ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  d += ` L ${pts[pts.length - 1][0]} ${elevToY(150)} Z`;
  return d;
}

function CourseMap({ snap, filterDist, hover, setHover, t }) {
  const runners = snap.runners.filter(r =>
    (!filterDist || r.distance === filterDist) &&
    r.status !== 'finished' && r.status !== 'not_started' && r.status !== 'dnf');

  // Bucket runners by 0.4km so dots stack at "the same point" visually.
  const bucketKm = 0.4;
  const buckets = new Map();
  runners.forEach(r => {
    const b = Math.round(r.progressKm / bucketKm) * bucketKm;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(r);
  });

  const { w, h, padL, padR, padT, padB } = CHART;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="terrainGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" stopOpacity="0.06"/>
          <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0.18"/>
        </linearGradient>
      </defs>

      {/* y-axis grid */}
      {[200, 300, 400, 500].map(e => (
        <g key={e}>
          <line x1={padL} y1={elevToY(e)} x2={w - padR} y2={elevToY(e)}
            stroke="#e5e4df" strokeWidth="0.8" strokeDasharray="2 4"/>
          <text x={padL - 10} y={elevToY(e) + 4} fontFamily={D.mono} fontSize="10"
            fill={D.muted} textAnchor="end">{e}m</text>
        </g>
      ))}

      {/* x-axis km labels */}
      {[0, 5, 10, 15, 20, 25, 29].map(km => (
        <g key={km}>
          <line x1={kmToX(km)} y1={h - padB} x2={kmToX(km)} y2={h - padB + 4}
            stroke="#a3a3a3" strokeWidth="0.8"/>
          <text x={kmToX(km)} y={h - padB + 18} fontFamily={D.mono} fontSize="10"
            fill={D.muted} textAnchor="middle">{km}K</text>
        </g>
      ))}

      {/* terrain */}
      <path d={terrainPath()} fill="url(#terrainGrad)" stroke={D.brandDk} strokeWidth="1.4"/>

      {/* checkpoint markers — exactly as on the poster: 4 visits for 29K */}
      {[
        { km: 5.6,  label: 'A1', sub: 'ขาไป',   color: D.brand },
        { km: 11.6, label: 'A2', sub: 'ขึ้นเขา', color: D.brand },
        { km: 19,   label: 'A2', sub: 'ลงเขา',   color: D.brand },
        { km: 23.5, label: 'A1', sub: 'ขากลับ',  color: D.brand },
      ].map((cp, i) => {
        const x = kmToX(cp.km);
        const yT = elevToY(elevationAt(cp.km));
        return (
          <g key={i}>
            <line x1={x} y1={h - padB} x2={x} y2={yT}
              stroke={cp.color} strokeWidth="1" strokeDasharray="2 3" opacity="0.5"/>
            <g transform={`translate(${x}, ${h - padB + 36})`}>
              <rect x="-22" y="-13" width="44" height="18" rx="2" fill={cp.color}/>
              <text x="0" y="-1" textAnchor="middle" fill="#fff"
                fontFamily={D.mono} fontSize="11" fontWeight="600" letterSpacing="0.06em">
                {cp.label}
              </text>
            </g>
            <text x={x} y={h - padB + 64} textAnchor="middle"
              fontFamily={D.mono} fontSize="9" fill={D.muted} letterSpacing="0.04em">
              {cp.sub} · {cp.km}K
            </text>
          </g>
        );
      })}

      {/* Start / Finish markers */}
      {[
        { km: 0,  label: 'START' },
        { km: 29, label: 'FINISH' },
      ].map((cp, i) => {
        const x = kmToX(cp.km);
        return (
          <g key={i}>
            <line x1={x} y1={h - padB} x2={x} y2={padT}
              stroke={D.brand} strokeWidth="1" opacity="0.3"/>
            <g transform={`translate(${x}, ${padT - 18})`}>
              <rect x="-32" y="-12" width="64" height="18" rx="2" fill="#fff"
                stroke={D.brand} strokeWidth="1.2"/>
              <text x="0" y="0" textAnchor="middle" fill={D.brand}
                fontFamily={D.mono} fontSize="10" fontWeight="600" letterSpacing="0.08em">
                {cp.label}
              </text>
            </g>
          </g>
        );
      })}

      {/* runner stacks — vertical pucks above the terrain at each bucket */}
      {Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([km, rs]) => {
        const x = kmToX(km);
        const terrainY = elevToY(elevationAt(km));
        // Stack starts 12px above the terrain, growing UPWARD
        const PUCK_H = 9;
        const PUCK_W = 22;
        const GAP = 1;
        // sort: missing/slow first (= on TOP of the stack, most visible)
        const sorted = rs.slice().sort((a, b) => {
          const aw = a.status === 'missing' ? 0 : a.status === 'slow' ? 1 : 2;
          const bw = b.status === 'missing' ? 0 : b.status === 'slow' ? 1 : 2;
          return aw - bw;
        });
        return (
          <g key={km}>
            {/* count badge above stack */}
            {rs.length >= 4 && (
              <g transform={`translate(${x}, ${terrainY - 14 - sorted.length * (PUCK_H + GAP) - 12})`}>
                <text x="0" y="0" textAnchor="middle" fontFamily={D.mono}
                  fontSize="11" fontWeight="600" fill={D.text}>
                  {rs.length}
                </text>
              </g>
            )}
            {sorted.map((r, i) => {
              const y = terrainY - 14 - (i + 1) * (PUCK_H + GAP);
              const isHover = hover === r.bib;
              const fill = r.status === 'missing' ? D.alert
                         : r.status === 'slow'    ? D.warn
                         : r.status === 'rest'    ? D.rest
                         : r.distance === '29K'   ? D.d29
                         : r.distance === '22K'   ? D.d22
                         : D.d11;
              return (
                <g key={r.bib}
                   onMouseEnter={() => setHover(r.bib)}
                   onMouseLeave={() => setHover(null)}
                   style={{ cursor: 'pointer' }}>
                  <rect
                    x={x - PUCK_W / 2} y={y}
                    width={PUCK_W} height={PUCK_H} rx="1"
                    fill={fill}
                    stroke={isHover ? '#fff' : 'rgba(255,255,255,0.6)'}
                    strokeWidth={isHover ? '1.5' : '0.6'}
                  />
                  {r.status === 'missing' && (
                    <rect x={x - PUCK_W / 2 - 2} y={y - 2}
                      width={PUCK_W + 4} height={PUCK_H + 4} rx="2"
                      fill="none" stroke={D.alert} strokeWidth="0.8" opacity="0.6"/>
                  )}
                  {isHover && (
                    <g transform={`translate(${x},${y - 6})`}>
                      <rect x="-46" y="-16" width="92" height="14" fill={D.text} rx="2"/>
                      <text x="0" y="-5" textAnchor="middle" fill="#fff"
                        fontFamily={D.mono} fontSize="9" letterSpacing="0.04em">
                        #{r.bib} · {r.firstName} · {r.distance}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* axis label */}
      <text x={padL - 44} y={padT - 8} fontFamily={D.mono} fontSize="9"
        fill={D.muted} letterSpacing="0.08em">
        ELEV (m)
      </text>
      <text x={w - padR} y={h - padB + 18} fontFamily={D.mono} fontSize="9"
        fill={D.muted} letterSpacing="0.08em" textAnchor="end">
        km →
      </text>
    </svg>
  );
}

// ─── Status pill ─────────────────────────────────────────────────────────
function StatusPill({ status, t }) {
  const cfg = {
    on_course:  { label: t('s_on_course'),  bg: 'oklch(0.94 0.06 145)', fg: D.brandDk, dot: D.brand },
    slow:       { label: t('s_slow'),       bg: '#fdf0d6', fg: '#7c4a03', dot: D.warn },
    rest:       { label: t('s_rest'),       bg: D.surface2, fg: D.muted, dot: D.mute2 },
    missing:    { label: t('s_missing'),    bg: '#fde9e6', fg: '#9b1c10', dot: D.alert },
    finished:   { label: t('s_finished'),   bg: D.brand,   fg: '#fff',    dot: '#fff' },
    dnf:        { label: t('s_dnf'),        bg: '#e8e2d2', fg: D.muted, dot: D.mute2 },
    not_started:{ label: t('s_pending'),    bg: D.bg, fg: D.mute2, dot: D.borderS },
  }[status] || { label: status, bg: '#eee', fg: '#000', dot: '#000' };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: D.mono, fontSize: 10.5, letterSpacing: '0.04em',
      textTransform: 'uppercase', fontWeight: 500,
      padding: '3px 8px 3px 7px', borderRadius: 3,
      background: cfg.bg, color: cfg.fg,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: cfg.dot,
        boxShadow: status==='missing' ? '0 0 0 3px rgba(220,38,38,.15)' : 'none' }} />
      {cfg.label}
    </span>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────
function KPI({ label, value, sub, accent }) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 0, padding: '14px 18px',
      borderRight: `1px solid ${D.border}`,
    }}>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: D.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontFamily: D.font, fontSize: 28, fontWeight: 500,
          letterSpacing: '-0.02em', color: accent || D.text, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {sub && <div style={{ fontFamily: D.mono, fontSize: 11, color: D.muted }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Alerts feed ─────────────────────────────────────────────────────────
function AlertsFeed({ snap, t, onPick }) {
  const alerts = useMemo(() => {
    const arr = [];
    snap.runners.forEach(r => {
      if (r.status === 'missing') {
        const since = snap.raceMinutes - r.lastTime;
        arr.push({
          sev: 'high', bib: r.bib, name: `${r.firstName} ${r.lastName}`,
          msg: t('alert_missing'),
          detail: t('alert_no_ping', { mins: Math.round(since), cp: t(`cp_${r.lastCp}`) }),
          since,
        });
      } else if (r.status === 'slow') {
        const behind = r.expectedKm - r.progressKm;
        arr.push({
          sev: 'mid', bib: r.bib, name: `${r.firstName} ${r.lastName}`,
          msg: t('alert_slow'),
          detail: t('alert_behind', { km: behind.toFixed(1) }),
          since: 0,
        });
      } else if (r.status === 'dnf') {
        arr.push({
          sev: 'low', bib: r.bib, name: `${r.firstName} ${r.lastName}`,
          msg: t('alert_dnf'), detail: t('alert_dnf_detail'),
          since: 999,
        });
      }
    });
    return arr.sort((a, b) => {
      const order = { high: 0, mid: 1, low: 2 };
      if (order[a.sev] !== order[b.sev]) return order[a.sev] - order[b.sev];
      return b.since - a.since;
    });
  }, [snap, t]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${D.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: D.text, fontWeight: 600 }}>
            {t('alerts_feed')}
          </span>
          {alerts.filter(a => a.sev === 'high').length > 0 && (
            <span style={{
              fontFamily: D.mono, fontSize: 10, color: '#fff', background: D.alert,
              padding: '1px 6px', borderRadius: 2, fontWeight: 600,
            }}>{alerts.filter(a => a.sev === 'high').length}</span>
          )}
        </div>
        <span style={{ fontFamily: D.mono, fontSize: 10, color: D.muted }}>
          {alerts.length} {t('total')}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {alerts.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: D.muted,
            fontFamily: D.font, fontSize: 12 }}>
            {t('no_alerts')}
          </div>
        )}
        {alerts.map((a, i) => (
          <div key={i}
            onClick={() => onPick && onPick(a.bib)}
            style={{
              padding: '12px 16px', borderBottom: `1px solid ${D.border}`,
              cursor: 'pointer', position: 'relative',
              background: a.sev === 'high' ? 'rgba(220,38,38,0.04)' : 'transparent',
            }}>
            {a.sev === 'high' && (
              <div style={{ position:'absolute', left: 0, top: 0, bottom: 0, width: 2,
                background: D.alert }}/>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: D.mono, fontSize: 13, fontWeight: 600,
                  color: D.text, letterSpacing: '0.04em' }}>#{a.bib}</span>
                <span style={{ fontFamily: D.font, fontSize: 13, color: D.text }}>
                  {a.name}
                </span>
              </div>
              <span style={{ fontFamily: D.mono, fontSize: 10, color: D.muted }}>
                {a.sev === 'high' ? `−${Math.round(a.since)}m` : ''}
              </span>
            </div>
            <div style={{ fontFamily: D.font, fontSize: 12,
              color: a.sev === 'high' ? D.alert : D.text, fontWeight: 500,
              marginBottom: 2 }}>{a.msg}</div>
            <div style={{ fontFamily: D.mono, fontSize: 11, color: D.muted }}>
              {a.detail}
            </div>
            {a.sev === 'high' && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <button style={btnSm()}>{t('btn_call')}</button>
                <button style={btnSm()}>{t('btn_dispatch')}</button>
                <button style={btnSm(true)}>{t('btn_resolve')}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
function btnSm(filled) {
  return {
    fontFamily: D.mono, fontSize: 10.5, letterSpacing: '0.06em',
    textTransform: 'uppercase', padding: '4px 8px', borderRadius: 2,
    background: filled ? D.brand : '#fff', color: filled ? '#fff' : D.text,
    border: `1px solid ${filled ? D.brand : D.borderS}`,
    cursor: 'pointer', fontWeight: 500,
  };
}

// ─── Roster table ────────────────────────────────────────────────────────
function RosterTable({ snap, filters, setFilters, hover, setHover, t }) {
  const rows = useMemo(() => {
    let r = snap.runners.slice();
    if (filters.dist) r = r.filter(x => x.distance === filters.dist);
    if (filters.status) r = r.filter(x => x.status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      r = r.filter(x => x.bib.includes(q) ||
        x.firstName.toLowerCase().includes(q) ||
        x.lastName.toLowerCase().includes(q));
    }
    r.sort((a, b) => {
      const aMissing = a.status === 'missing' ? 0 : 1;
      const bMissing = b.status === 'missing' ? 0 : 1;
      if (aMissing !== bMissing) return aMissing - bMissing;
      const aSlow = a.status === 'slow' ? 0 : 1;
      const bSlow = b.status === 'slow' ? 0 : 1;
      if (aSlow !== bSlow) return aSlow - bSlow;
      return b.progressKm - a.progressKm;
    });
    return r;
  }, [snap, filters]);

  const statusCounts = useMemo(() => {
    const c = {};
    snap.runners.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [snap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%',
      background: D.surface }}>
      {/* filter bar */}
      <div style={{
        padding: '10px 16px', borderBottom: `1px solid ${D.border}`,
        display: 'flex', gap: 14, alignItems: 'center',
        background: D.surface, position: 'sticky', top: 0, zIndex: 1,
      }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: D.text, fontWeight: 600, marginRight: 4 }}>
          {t('roster')} · {rows.length}/{snap.runners.length}
        </div>
        <FilterChip label={t('all')} active={!filters.dist} onClick={() => setFilters({...filters, dist: null})}/>
        {['29K','22K','11K'].map(d => (
          <FilterChip key={d} label={d} active={filters.dist === d}
            onClick={() => setFilters({...filters, dist: filters.dist === d ? null : d})}/>
        ))}
        <div style={{ width: 1, height: 16, background: D.border, margin: '0 6px' }}/>
        {[
          ['on_course', t('s_on_course')],
          ['slow', t('s_slow')],
          ['rest', t('s_rest')],
          ['missing', t('s_missing')],
          ['finished', t('s_finished')],
          ['dnf', t('s_dnf')],
        ].map(([k, lbl]) => (
          <FilterChip key={k} label={`${lbl} ${statusCounts[k] || 0}`}
            active={filters.status === k}
            onClick={() => setFilters({...filters, status: filters.status === k ? null : k})}
            warn={k === 'missing' && (statusCounts[k] || 0) > 0}
          />
        ))}
        <div style={{ flex: 1 }}/>
        <div style={{ position: 'relative' }}>
          <input
            value={filters.search || ''}
            onChange={e => setFilters({...filters, search: e.target.value})}
            placeholder={t('search_ph')}
            style={{
              fontFamily: D.mono, fontSize: 11, padding: '5px 10px 5px 24px',
              border: `1px solid ${D.borderS}`, borderRadius: 2, width: 180,
              background: D.surface, color: D.text, outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', left: 8, top: '50%',
            transform: 'translateY(-50%)', fontSize: 11, color: D.muted }}>⌕</span>
        </div>
      </div>

      {/* table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontFamily: D.font, fontSize: 12,
        }}>
          <thead>
            <tr style={{ background: D.surface, position: 'sticky', top: 0 }}>
              {[
                ['bib', t('h_bib'), 70],
                ['name', t('h_name'), 200],
                ['dist', t('h_dist'), 70],
                ['progress', t('h_progress'), 'auto'],
                ['last', t('h_last_cp'), 130],
                ['eta', t('h_eta'), 80],
                ['status', t('h_status'), 110],
              ].map(([k, lbl, w]) => (
                <th key={k} style={{
                  textAlign: 'left', fontFamily: D.mono, fontSize: 10,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: D.muted, fontWeight: 500, padding: '8px 14px',
                  borderBottom: `1px solid ${D.border}`, width: w,
                  whiteSpace: 'nowrap',
                }}>{lbl}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <RosterRow key={r.bib} r={r} t={t} hover={hover} setHover={setHover}/>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick, warn }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: D.mono, fontSize: 10.5, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '4px 9px', borderRadius: 2,
      background: active ? D.brand : 'transparent',
      color: active ? '#fff' : (warn ? D.alert : D.text),
      border: `1px solid ${active ? D.brand : (warn ? D.alert : D.border)}`,
      cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}

function RosterRow({ r, t, hover, setHover }) {
  const dist = r.course.distance;
  const pct = Math.max(0, Math.min(100, (r.progressKm / dist) * 100));
  const expPct = Math.max(0, Math.min(100, (r.expectedKm / dist) * 100));
  const isHover = hover === r.bib;
  return (
    <tr
      onMouseEnter={() => setHover(r.bib)}
      onMouseLeave={() => setHover(null)}
      style={{
        background: isHover ? D.surface2 : (r.status === 'missing' ? 'rgba(220,38,38,0.03)' : D.surface),
        borderBottom: `1px solid ${D.border}`,
      }}>
      <td style={td()}>
        {r.rank ? (
          <span style={{ fontFamily: D.mono, fontWeight: 700, fontSize: 13,
            color: D.brandDk, fontStyle: 'italic' }}
            title={r.totalFinishers ? `อันดับ ${r.rank} จาก ${r.totalFinishers} ใน ${r.distance}` : ''}>
            #{r.rank}
          </span>
        ) : (
          <span style={{ fontFamily: D.mono, fontWeight: 600, fontSize: 12,
            letterSpacing: '0.04em' }}>{r.bib}</span>
        )}
      </td>
      <td style={td()}>{r.firstName} {r.lastName}</td>
      <td style={td()}>
        {r.registeredDistance && r.registeredDistance !== r.distance ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: D.mono, fontSize: 11, letterSpacing: '0.04em' }}>
            <span style={{ color: D.mute2, textDecoration: 'line-through' }}>
              {r.registeredDistance}
            </span>
            <span style={{ color: D.brand, fontSize: 10 }}>↑</span>
            <span style={{ padding: '1px 6px', background: 'oklch(0.94 0.06 145)',
              color: D.brandDk, borderRadius: 2, fontWeight: 700 }}>
              {r.distance}
            </span>
          </div>
        ) : (
          <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: '0.06em',
            padding: '1px 6px', border: `1px solid ${D.borderS}`, borderRadius: 2 }}>
            {r.distance}
          </span>
        )}
      </td>
      <td style={td()}>
        <ProgressBar pct={pct} expPct={expPct} r={r} t={t}/>
      </td>
      <td style={td()}>
        <div style={{ fontFamily: D.mono, fontSize: 11, color: D.text }}>
          {t(`cp_${r.lastCp}`)}
        </div>
        <div style={{ fontFamily: D.mono, fontSize: 10, color: D.muted }}>
          {fmtClock(r.lastTime)} · {r.progressKm.toFixed(1)}K
        </div>
      </td>
      <td style={td()}>
        <span style={{ fontFamily: D.mono, fontSize: 11,
          color: r.eta == null ? D.mute2 : D.text }}>
          {r.eta != null ? `+${Math.round(r.eta)}m` : '—'}
        </span>
      </td>
      <td style={td()}>
        <StatusPill status={r.status} t={t}/>
      </td>
    </tr>
  );
}
function td() {
  return { padding: '10px 14px', verticalAlign: 'middle' };
}

function ProgressBar({ pct, expPct, r, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
      <div style={{ flex: 1, height: 6, background: D.surface2, borderRadius: 1,
        position: 'relative', overflow: 'visible' }}>
        {/* expected */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${expPct}%`,
          background: 'repeating-linear-gradient(90deg, transparent 0 3px, ' + D.borderS + ' 3px 4px)'
        }}/>
        {/* actual */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: r.status === 'missing' ? D.alert
                    : r.status === 'slow'    ? D.warn
                    : r.status === 'finished' ? D.brand
                    : D.brand,
        }}/>
        {/* checkpoint ticks (relative to runner's course) */}
        {r.course.legs.reduce((acc, leg) => {
          const cum = (acc.cum || 0) + leg.km;
          acc.cum = cum;
          if (leg.to !== 'finish') acc.ticks.push(cum / r.course.distance * 100);
          return acc;
        }, { cum: 0, ticks: [] }).ticks.map((tickPct, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${tickPct}%`, top: -2, bottom: -2,
            width: 1, background: D.borderS,
          }}/>
        ))}
      </div>
      <span style={{ fontFamily: D.mono, fontSize: 11, color: D.muted,
        minWidth: 64, textAlign: 'right' }}>
        {r.progressKm.toFixed(1)}/{r.course.distance}K
      </span>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────
function Dashboard({ scenario, snap: providedSnap, t, lang, layout = 'hybrid', cutoffMin = 0 }) {
  // If a live snapshot is passed in, use it; otherwise build a mock from the
  // named scenario (the design-canvas use case).
  const snap = useMemo(
    () => providedSnap || buildSnapshot(scenario),
    [providedSnap, scenario]
  );
  const [hover, setHover] = useState(null);
  const [filters, setFilters] = useState({ dist: null, status: null, search: '' });

  const counts = useMemo(() => {
    const c = { total: snap.runners.length, on_course: 0, finished: 0,
      rest: 0, alerts: 0, dnf: 0, slow: 0, upgraded: 0 };
    snap.runners.forEach(r => {
      if (r.status === 'on_course') c.on_course++;
      if (r.status === 'slow') { c.slow++; c.on_course++; }
      if (r.status === 'rest') { c.rest++; c.on_course++; }
      if (r.status === 'finished') c.finished++;
      if (r.status === 'missing') c.alerts++;
      if (r.status === 'dnf') c.dnf++;
      if (r.registeredDistance && r.registeredDistance !== r.distance) c.upgraded++;
    });
    return c;
  }, [snap]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex',
      flexDirection: 'column', background: D.bg, fontFamily: D.font,
      color: D.text }}>
      {/* Top header */}
      <header style={{
        display: 'flex', alignItems: 'center', padding: '14px 22px',
        borderBottom: `1px solid ${D.border}`, background: D.surface,
        gap: 16,
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 4,
          background: '#fff', padding: 3, border: `1px solid ${D.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="assets/rayong-trail-logo.jpg" alt="Rayong Trail Running"
            style={{ width: 36, height: 'auto', display: 'block' }}/>
        </div>
        <div>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: D.muted }}>{t('event_label')}</div>
          <div style={{ fontFamily: '"Georgia", serif', fontStyle: 'italic',
            fontSize: 18, fontWeight: 600,
            letterSpacing: '-0.005em', marginTop: 2, color: D.brandDk }}>
            Rayong Trail Running
          </div>
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: D.mono, fontSize: 10, color: D.muted,
              letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('race_time')}</div>
            <div style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 500,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
              {fmtClock(snap.raceMinutes)}
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: D.border }}/>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: D.mono, fontSize: 10, color: D.muted,
              letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('elapsed')}</div>
            <div style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 500,
              fontVariantNumeric: 'tabular-nums' }}>
              {snap.raceMinutes < 0 ? `−${-snap.raceMinutes}m` : `+${Math.floor(snap.raceMinutes/60)}h${String(snap.raceMinutes%60).padStart(2,'0')}`}
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: D.border }}/>
          {snap._systemState === 'closed' ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', border: `1px solid ${D.alert}`,
              background: 'rgba(220,38,38,0.06)',
              borderRadius: 2,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 99,
                background: D.alert,
                boxShadow: '0 0 0 3px rgba(220,38,38,0.15)',
              }}/>
              <span style={{ fontFamily: D.mono, fontSize: 11,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: D.alert, fontWeight: 700 }}>
                🔒 ระบบปิด
              </span>
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', border: `1px solid ${D.border}`,
              borderRadius: 2,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 99,
                background: counts.alerts > 0 ? D.alert : D.brand,
                boxShadow: counts.alerts > 0 ? '0 0 0 3px rgba(220,38,38,0.15)' : '0 0 0 3px rgba(45,106,79,0.18)',
              }}/>
              <span style={{ fontFamily: D.mono, fontSize: 11,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: counts.alerts > 0 ? D.alert : D.text, fontWeight: 600 }}>
                {counts.alerts > 0 ? `${counts.alerts} ${t('flag_alert')}` : t('flag_ok')}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* KPI strip */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`,
        background: D.surface }}>
        <KPI label={t('kpi_total')} value={counts.total} sub={t('kpi_total_sub')}/>
        <KPI label={t('kpi_on_course')} value={counts.on_course}
          sub={`${counts.slow} ${t('s_slow').toLowerCase()}`}/>
        <KPI label={t('kpi_at_rest')} value={counts.rest}/>
        <KPI label={t('kpi_finished')} value={counts.finished}
          sub={`${Math.round(counts.finished/counts.total*100)}%`}/>
        <KPI label={t('kpi_upgraded')} value={counts.upgraded}
          accent={counts.upgraded > 0 ? D.brand : D.text}
          sub={counts.upgraded > 0 ? '↑ auto' : '—'}/>
        <KPI label={t('kpi_dnf')} value={counts.dnf}/>
        <KPI label={t('kpi_alerts')} value={counts.alerts}
          accent={counts.alerts > 0 ? D.alert : D.text}
          sub={counts.alerts > 0 ? t('kpi_alerts_sub') : '—'}/>
      </div>

      {/* Body — depends on layout */}
      <div style={{ flex: 1, display: 'grid',
        gridTemplateColumns: layout === 'map' ? '1fr 360px' :
                              layout === 'table' ? '1fr 360px' : '1fr 360px',
        gridTemplateRows: layout === 'map' ? '1fr' :
                          layout === 'table' ? 'auto 1fr' :
                          '320px 1fr',
        minHeight: 0,
      }}>
        {/* Course map */}
        {layout !== 'table' && (
          <div style={{
            gridColumn: '1 / 2', gridRow: '1 / 2',
            background: D.surface, borderBottom: `1px solid ${D.border}`,
            position: 'relative', overflow: 'hidden',
            borderRight: `1px solid ${D.border}`,
          }}>
            <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 2,
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: D.mono, fontSize: 11,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: D.text, fontWeight: 600 }}>
                {t('course_map')}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <FilterChip label={t('all')} active={!filters.dist}
                  onClick={() => setFilters({...filters, dist: null})}/>
                {['29K','22K','11K'].map(d => (
                  <FilterChip key={d} label={d} active={filters.dist === d}
                    onClick={() => setFilters({...filters, dist: filters.dist === d ? null : d})}/>
                ))}
              </div>
            </div>
            <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 2,
              display: 'flex', gap: 18, alignItems: 'center' }}>
              {[
                [D.d29, '29K'], [D.d22, '22K'], [D.d11, '11K'],
                [D.warn, t('s_slow')], [D.alert, t('s_missing')]
              ].map(([c, l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center',
                  gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99,
                    background: c }}/>
                  <span style={{ fontFamily: D.mono, fontSize: 10,
                    color: D.muted, letterSpacing: '0.04em' }}>{l}</span>
                </div>
              ))}
            </div>
            <CourseMap snap={snap} filterDist={filters.dist}
              hover={hover} setHover={setHover} t={t}/>
          </div>
        )}

        {/* Alerts feed */}
        <div style={{
          gridColumn: '2 / 3', gridRow: layout === 'map' ? '1 / 2' : '1 / 3',
          background: D.surface, borderLeft: `1px solid ${D.border}`,
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <AlertsFeed snap={snap} t={t} onPick={(bib) =>
            setFilters({...filters, search: bib})}/>
        </div>

        {/* Roster table */}
        {layout !== 'map' && (
          <div style={{
            gridColumn: '1 / 2', gridRow: layout === 'table' ? '1 / 3' : '2 / 3',
            minHeight: 0, borderTop: layout === 'hybrid' ? 'none' : 'none',
          }}>
            <RosterTable snap={snap} filters={filters} setFilters={setFilters}
              hover={hover} setHover={setHover} t={t}/>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, D, StatusPill, CourseMap, AlertsFeed, RosterTable });

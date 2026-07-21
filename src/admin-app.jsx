// admin-app.jsx — Admin: a list of created events (edit/delete/open in app)
// plus the "สร้างงานแข่งใหม่" event-setup form from the design. Reads/writes
// through src/event-store.js (localStorage-backed for now — see that file's
// header comment on why this only syncs within one browser until a real
// backend exists).

const { useState: aS, useEffect: aE, useRef: aR } = React;

const A_BRAND = '#2d6a4f', A_MONO = "'JetBrains Mono',ui-monospace,monospace";

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function formatThaiDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${THAI_MONTHS[m - 1]} ${y}`;
}
function formatThaiDateTime(localDT) {
  if (!localDT) return '';
  const [datePart, timePart] = localDT.split('T');
  const dateStr = formatThaiDate(datePart);
  return timePart ? `${dateStr} ${timePart} น.` : dateStr;
}

function addMinutesToTime(hhmm, minutes) {
  const mins = parseInt(minutes, 10);
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm) || Number.isNaN(mins)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const wrapped = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// Status ("upcoming"/"live"/"past") and whether registration is closed are
// both derived from real dates/times instead of being picked manually — see
// src/event-status.js for the shared computeStatus/computeClosed logic used
// here AND by the runner app / Live Monitor / Results, so the displayed
// status is always live-computed at render time instead of a snapshot
// frozen at whenever RD last hit Save.
const computeStatus = window.eventStatus.computeStatus;
const computeClosed = window.eventStatus.computeClosed;

function Field({ label, children }) {
  return <div><div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 6 }}>{label}</div>{children}</div>;
}
function inputStyle(extra) {
  return { padding: '11px 13px', background: '#fafaf8', border: '1px solid #e5e0d3', borderRadius: 10,
    boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontSize: 13.5, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', ...extra };
}

// Actually reads and parses the uploaded .gpx (via src/gpx-parse.js) instead
// of just showing a static "✓ suunto-29k-2026.gpx" placeholder — the parsed
// track (points/ascent/descent/totalKm) is handed back to the event via
// onParsed so it's this event's real course, not shared demo data.
function GpxCard({ label, filename, stats, filled, onParsed }) {
  const inputRef = aR(null);
  const [error, setError] = aS(null);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const track = await window.gpxParse.parseGpxFile(file);
      onParsed(file.name, track);
    } catch (err) {
      setError(err.message || 'อ่านไฟล์ GPX ไม่สำเร็จ');
    }
  }

  const picker = <input ref={inputRef} type="file" accept=".gpx" onChange={handleFile} style={{ display: 'none' }}/>;

  if (filled) {
    return (
      <div>
        {picker}
        <div style={{ fontFamily: A_MONO, fontSize: 10, fontWeight: 700, color: '#1f4d39', marginBottom: 6 }}>GPX · {label}</div>
        <div style={{ background: 'oklch(0.96 0.03 145)', border: '1px solid #bcd9c9', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1f4d39' }}>✓ {filename}</div>
          <div style={{ fontFamily: A_MONO, fontSize: 9.5, color: '#5d6b59', marginTop: 3 }}>{stats}</div>
          <button onClick={() => inputRef.current.click()} style={{ marginTop: 6, padding: '5px 9px', background: 'transparent', border: '1px solid #bdb6a4', borderRadius: 8, fontFamily: A_MONO, fontSize: 9.5, fontWeight: 600, color: '#1f2a1c', cursor: 'pointer' }}>เปลี่ยนไฟล์</button>
        </div>
        {error && <div style={{ marginTop: 6, fontSize: 10, color: '#b91c1c' }}>{error}</div>}
      </div>
    );
  }
  return (
    <div>
      {picker}
      <div style={{ fontFamily: A_MONO, fontSize: 10, fontWeight: 700, color: '#5d6b59', marginBottom: 6 }}>GPX · {label}</div>
      <div onClick={() => inputRef.current.click()} style={{ border: '2px dashed #bdb6a4', borderRadius: 10, padding: '14px 10px', textAlign: 'center', cursor: 'pointer' }}>
        <div style={{ fontSize: 16 }}>📍</div>
        <div style={{ fontSize: 10.5, color: '#1f2a1c', marginTop: 4 }}>ลากไฟล์ .gpx หรือ <span style={{ color: A_BRAND, textDecoration: 'underline' }}>เลือกไฟล์</span></div>
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 10, color: '#b91c1c' }}>{error}</div>}
    </div>
  );
}

// Renders + lets RD download the actual QR image runners scan at each CP.
// Encodes `TRT:{eventId}:{cpKey}` so the app's real camera scanner (see
// QrScanScreen in mobile-app.jsx) can reject a QR from the wrong event or
// station instead of blindly accepting whatever's in frame.
function QrCard({ eventId, cpKey, label }) {
  const dataUrl = (() => {
    if (!window.qrcode) return null;
    const qr = window.qrcode(0, 'M');
    qr.addData(`TRT:${eventId}:${cpKey}`);
    qr.make();
    return qr.createDataURL(6, 2);
  })();
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: A_MONO, fontSize: 10.5, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {dataUrl
        ? <img src={dataUrl} alt={`QR ${label}`} style={{ width: 110, height: 110, border: '1px solid #e5e0d3', borderRadius: 8 }}/>
        : <div style={{ width: 110, height: 110, background: '#f0ede3', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#5d6b59' }}>โหลดไม่สำเร็จ</div>}
      {dataUrl && <a href={dataUrl} download={`qr-${cpKey}.png`} style={{ display: 'block', marginTop: 6, fontFamily: A_MONO, fontSize: 10, color: A_BRAND, textDecoration: 'underline' }}>ดาวน์โหลด</a>}
    </div>
  );
}

// Real registered runners for this event — separate from the "สมัครแล้ว"
// quota counter (which just tracks a number) and from the fully-simulated
// demo names shown on the Live Monitor map. See src/runner-store.js.
// Full search/edit/cancel/DNF/CSV-export management now lives on its own
// page (admin/runners.html, src/admin-runners.jsx) instead of being crammed
// into this already-busy event form — this is just a quick summary + link.
function RunnerRosterLink({ eventId }) {
  const [count, setCount] = aS(() => (window.runnerStore ? window.runnerStore.listRunners(eventId).length : 0));
  aE(() => {
    const refresh = () => setCount(window.runnerStore ? window.runnerStore.listRunners(eventId).length : 0);
    refresh();
    window.addEventListener('trt:runners-updated', refresh);
    return () => window.removeEventListener('trt:runners-updated', refresh);
  }, [eventId]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', background: '#fafaf8', border: '1px solid #ece7da', borderRadius: 10, marginBottom: 20 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>นักวิ่งที่ลงทะเบียนจริง</div>
        <div style={{ fontFamily: A_MONO, fontSize: 10.5, color: '#5d6b59', marginTop: 2 }}>{count} คน · แก้ไข/ยกเลิก/mark DNF/export CSV ได้ที่หน้าจัดการนักวิ่ง</div>
      </div>
      <a href={`runners.html?event=${encodeURIComponent(eventId)}`} target="_blank" rel="noopener" style={{ padding: '9px 14px', background: A_BRAND, color: '#fff', borderRadius: 8, fontFamily: A_MONO, fontSize: 11, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>👥 จัดการนักวิ่ง →</a>
    </div>
  );
}

const STATUS_META = {
  live: { label: '🟢 กำลังแข่ง', color: A_BRAND },
  upcoming: { label: '🕓 กำลังจะมาถึง', color: '#7c4a03' },
  past: { label: '⬜ ผ่านมาแล้ว', color: '#5d6b59' },
};

// ── Event list ──────────────────────────────────────────────────────────
function EventList({ events, onEdit, onDelete, onCreate }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 60px', fontFamily: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif", color: '#1f2a1c' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: A_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1f2a1c', fontWeight: 600 }}>🔧 Admin · งานแข่งทั้งหมด</div>
        <button onClick={onCreate} style={{ padding: '10px 16px', background: `linear-gradient(135deg,#357a5c 0%,#1a4a37 100%)`, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ สร้างงานแข่งใหม่</button>
      </div>
      <div style={{ fontSize: 12, color: '#5d6b59', marginBottom: 16, lineHeight: 1.6 }}>
        {window.fb
          ? 'ข้อมูลชุดนี้ sync ผ่าน Firebase จริง — แก้ที่นี่แล้วเห็นตรงกันทุกเครื่อง/เบราว์เซอร์ที่เปิดแอพ'
          : 'ข้อมูลชุดนี้เก็บไว้ในเบราว์เซอร์นี้เท่านั้น (ยังไม่ได้ตั้งค่า Firebase — ดู src/firebase-config.js) — เปิดแอพนักวิ่งบนเบราว์เซอร์เดียวกันจะเห็นรายการเดียวกันนี้'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.length === 0 && <div style={{ textAlign: 'center', color: '#5d6b59', fontSize: 13, padding: 30 }}>ยังไม่มีงานแข่ง · กด "+ สร้างงานแข่งใหม่"</div>}
        {events.map(ev => {
          const meta = STATUS_META[window.eventStatus.computeStatus(ev)] || STATUS_META.upcoming;
          const closed = window.eventStatus.computeClosed(ev);
          return (
            <div key={ev.id} style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{ev.name}</div>
                <div style={{ fontFamily: A_MONO, fontSize: 10.5, color: '#5d6b59', marginTop: 3 }}>
                  {ev.date} · {(ev.distances || []).map(d => d.label).join(' / ') || '—'}{closed ? ' · ปิดรับสมัคร' : ''}
                </div>
              </div>
              <span style={{ fontFamily: A_MONO, fontSize: 10.5, fontWeight: 700, color: meta.color, whiteSpace: 'nowrap' }}>{meta.label}</span>
              <a href={`runners.html?event=${encodeURIComponent(ev.id)}`} target="_blank" rel="noopener" style={{ padding: '8px 12px', background: 'transparent', border: '1px solid #bdb6a4', color: '#1f2a1c', borderRadius: 8, fontFamily: A_MONO, fontSize: 11, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>👥 นักวิ่ง</a>
              <button onClick={() => onEdit(ev)} style={{ padding: '8px 12px', background: 'transparent', border: `1px solid ${A_BRAND}`, color: A_BRAND, borderRadius: 8, fontFamily: A_MONO, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>แก้ไข</button>
              <button onClick={() => onDelete(ev.id)} style={{ padding: '8px 10px', background: 'transparent', border: '1px solid #f0c9c4', color: '#b91c1c', borderRadius: 8, fontFamily: A_MONO, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>ลบ</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Create/edit form ────────────────────────────────────────────────────
// Checkpoints used to be a fixed 4-slot shape (a1_out/a2_in/a2_out/a1_in)
// hardcoded to match one specific course. Now every event carries its own
// `checkpoints` list ([{id,label,km}]) that RD can add/remove/rename/set-km
// freely, same pattern as distances — every distance passes through all of
// them in order, keeping things simple instead of per-distance subsets.
const DEFAULT_CHECKPOINTS = [
  { id: 'cp1', label: 'CP1', km: 5.6 },
  { id: 'cp2', label: 'CP2', km: 11.6 },
];
function blankCpTimes(start, finish, checkpoints) {
  const cpTimes = { start };
  (checkpoints || DEFAULT_CHECKPOINTS).forEach(cp => { cpTimes[cp.id] = ''; });
  cpTimes.finish = finish;
  return cpTimes;
}
// Legacy events were saved with the old fixed cpKms shape instead of a
// checkpoints array — turn that into the new shape so old data still opens
// and edits cleanly instead of losing its checkpoints.
function migrateCheckpoints(ev) {
  if (Array.isArray(ev.checkpoints)) return ev.checkpoints;
  if (ev.cpKms) {
    const legacyLabels = { a1_out: 'A1 ↗', a2_in: 'A2 ↑', a2_out: 'A2 ↓', a1_in: 'A1 ↙' };
    return Object.keys(ev.cpKms).map(key => ({ id: key, label: legacyLabels[key] || key, km: ev.cpKms[key] }));
  }
  return DEFAULT_CHECKPOINTS.map(cp => ({ ...cp }));
}
function blankEvent() {
  const checkpoints = DEFAULT_CHECKPOINTS.map(cp => ({ ...cp }));
  return {
    id: window.eventStore.newEventId(),
    name: '', date: '', raceDateISO: '', regClose: '', regCloseISO: '', status: 'upcoming', closed: false, hotline: '',
    gpxFiles: {},
    checkpoints,
    distances: [
      { id: 'd1', label: '11K', cutoff: '150', open: true, color: '#3a86c4', capacity: '', registered: '0', cpTimes: blankCpTimes('06:10', '08:40', checkpoints) },
      { id: 'd2', label: '22K', cutoff: '270', open: true, color: '#e07a3e', capacity: '', registered: '0', cpTimes: blankCpTimes('06:05', '10:35', checkpoints) },
      { id: 'd3', label: '29K', cutoff: '360', open: true, color: '#1f4d39', capacity: '', registered: '0', cpTimes: blankCpTimes('06:00', '12:00', checkpoints) },
    ],
  };
}

function EventForm({ initial, onCancel, onSave, onSaveInPlace, onDelete }) {
  const isNew = !initial;
  const [ev, setEv] = aS(() => {
    if (!initial) return blankEvent();
    const checkpoints = migrateCheckpoints(initial);
    const distances = (initial.distances || blankEvent().distances).map((d, i) => {
      const cpTimes = d.cpTimes || blankCpTimes('', '', checkpoints);
      // Fill in any checkpoint added after this distance was last saved so
      // every distance's cpTimes always has a key for every checkpoint.
      checkpoints.forEach(cp => { if (!(cp.id in cpTimes)) cpTimes[cp.id] = ''; });
      // Self-heal any distance whose stored finish cutoff disagrees with
      // start + cut-off minutes (e.g. legacy data entered before the two
      // were linked, or edited independently).
      return { capacity: '', registered: '0', ...d, id: d.id || `d${i}-${d.label}`, cpTimes: { ...cpTimes, finish: addMinutesToTime(cpTimes.start, d.cutoff) || cpTimes.finish } };
    });
    return { ...blankEvent(), ...initial, checkpoints, distances };
  });
  const [toast, setToast] = aS(null);

  function set(patch) { setEv(e => ({ ...e, ...patch })); }
  function updateDist(id, patch) { setEv(e => ({ ...e, distances: e.distances.map(d => d.id === id ? { ...d, ...patch } : d) })); }
  function updateDistCp(id, key, val) { setEv(e => ({ ...e, distances: e.distances.map(d => d.id === id ? { ...d, cpTimes: { ...d.cpTimes, [key]: val } } : d) })); }
  // Finish cutoff (clock time) is derived from start + cut-off (minutes) —
  // the two used to be independent fields that could silently disagree
  // (e.g. start 07:00 + 150-min cutoff showing a leftover 12:00 finish).
  // Recompute it whenever either input changes instead of leaving it
  // editable on its own.
  function updateDistStart(id, val) {
    setEv(e => ({ ...e, distances: e.distances.map(d => d.id === id
      ? { ...d, cpTimes: { ...d.cpTimes, start: val, finish: addMinutesToTime(val, d.cutoff) } } : d) }));
  }
  function updateDistCutoff(id, val) {
    setEv(e => ({ ...e, distances: e.distances.map(d => d.id === id
      ? { ...d, cutoff: val, cpTimes: { ...d.cpTimes, finish: addMinutesToTime(d.cpTimes.start, val) } } : d) }));
  }
  function removeDist(id) { setEv(e => ({ ...e, distances: e.distances.filter(d => d.id !== id) })); }
  function addDist() {
    const colors = ['#3a86c4', '#e07a3e', '#1f4d39', '#7c4a03', '#9b1c10'];
    setEv(e => ({ ...e, distances: [...e.distances, { id: 'd' + Date.now(), label: 'ใหม่', cutoff: '180', open: true, color: colors[e.distances.length % colors.length], capacity: '', registered: '0', cpTimes: blankCpTimes('', '', e.checkpoints) }] }));
  }
  // Registration auto-closes the moment the quota fills, but only as a
  // one-time nudge — it never fights back against a manual reopen, so RD can
  // still add late runners on race day by flipping the toggle back on.
  function updateDistRegistered(id, val) {
    setEv(e => ({
      ...e,
      distances: e.distances.map(d => {
        if (d.id !== id) return d;
        const cap = parseInt(d.capacity, 10);
        const reg = parseInt(val, 10);
        const justFilled = cap > 0 && !Number.isNaN(reg) && reg >= cap && d.open;
        return { ...d, registered: val, open: justFilled ? false : d.open };
      }),
    }));
  }

  const checkpoints = ev.checkpoints || DEFAULT_CHECKPOINTS;
  function updateCheckpoint(id, patch) { setEv(e => ({ ...e, checkpoints: (e.checkpoints || DEFAULT_CHECKPOINTS).map(cp => cp.id === id ? { ...cp, ...patch } : cp) })); }
  function addCheckpoint() {
    const id = 'cp' + Date.now();
    setEv(e => {
      const list = e.checkpoints || DEFAULT_CHECKPOINTS;
      return {
        ...e,
        checkpoints: [...list, { id, label: `CP${list.length + 1}`, km: '' }],
        distances: e.distances.map(d => ({ ...d, cpTimes: { ...d.cpTimes, [id]: '' } })),
      };
    });
  }
  function removeCheckpoint(id) {
    setEv(e => ({
      ...e,
      checkpoints: (e.checkpoints || DEFAULT_CHECKPOINTS).filter(cp => cp.id !== id),
      distances: e.distances.map(d => { const cpTimes = { ...d.cpTimes }; delete cpTimes[id]; return { ...d, cpTimes }; }),
    }));
  }

  function save() {
    if (!ev.name.trim()) { setToast('⚠ กรอกชื่องานแข่งก่อน'); setTimeout(() => setToast(null), 2000); return; }
    onSave({ ...ev, status: computeStatus(ev), closed: computeClosed(ev) });
  }
  // Saves everything immediately without leaving the form — lets admin
  // commit one distance's edits (quota, cutoff, open/closed) right away and
  // keep working on the rest, instead of every change being tied to one
  // all-or-nothing save at the very bottom of the page.
  function saveDistance(label) {
    if (!ev.name.trim()) { setToast('⚠ กรอกชื่องานแข่งก่อน'); setTimeout(() => setToast(null), 2000); return; }
    onSaveInPlace({ ...ev, status: computeStatus(ev), closed: computeClosed(ev) });
    setToast(`✓ บันทึกระยะ ${label} แล้ว`);
    setTimeout(() => setToast(null), 1600);
  }

  const liveStatus = computeStatus(ev);
  const liveClosed = computeClosed(ev);
  const statusMeta = STATUS_META[liveStatus];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 60px', fontFamily: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif", color: '#1f2a1c' }}>
      {toast && <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', padding: '10px 16px', background: '#1f4d39', color: '#fff', borderRadius: 6, fontSize: 13, zIndex: 100, boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={onCancel} style={{ width: 32, height: 32, borderRadius: 10, border: '1.6px solid #bdb6a4', background: '#fff', cursor: 'pointer', fontSize: 15 }}>←</button>
        <div style={{ fontFamily: A_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1f2a1c', fontWeight: 600 }}>
          🔧 {isNew ? 'สร้างงานแข่งใหม่' : 'แก้ไขงานแข่ง'} (แต่ละงานมี GPX ของตัวเอง)
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <Field label="ชื่องานแข่ง"><input value={ev.name} onChange={e => set({ name: e.target.value })} style={inputStyle()}/></Field>
          <Field label="วันที่แข่ง (ปฏิทิน — ใช้คำนวณเวลา)">
            <input type="date" value={ev.raceDateISO} onChange={e => {
              const iso = e.target.value;
              set({ raceDateISO: iso, date: iso ? formatThaiDate(iso) : ev.date });
            }} style={inputStyle({ fontFamily: A_MONO })}/>
          </Field>
          <Field label="ปิดรับสมัคร (วันที่ + เวลา)">
            <input type="datetime-local" value={ev.regCloseISO} onChange={e => {
              const v = e.target.value;
              set({ regCloseISO: v, regClose: formatThaiDateTime(v) });
            }} style={inputStyle({ fontFamily: A_MONO })}/>
          </Field>
        </div>
        <div style={{ marginTop: -8, marginBottom: 14 }}>
          <Field label="วันที่แข่ง (ข้อความที่แสดงในแอพ — แก้ไขเพิ่มเติมได้)">
            <input value={ev.date} onChange={e => set({ date: e.target.value })} style={inputStyle({ fontFamily: A_MONO, maxWidth: 280 })}/>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 6 }}>
          <Field label="สถานะที่แสดงในแอพนักวิ่ง (คำนวณอัตโนมัติ)">
            <div style={{ padding: '11px 13px', background: '#fafaf8', border: '1px solid #e5e0d3', borderRadius: 10, fontFamily: A_MONO, fontSize: 12.5, fontWeight: 700, color: statusMeta.color }}>{statusMeta.label}</div>
          </Field>
          <Field label="การรับสมัคร (คำนวณอัตโนมัติ)">
            <div style={{ padding: '11px 13px', background: '#fafaf8', border: '1px solid #e5e0d3', borderRadius: 10, fontFamily: A_MONO, fontSize: 12.5, fontWeight: 700, color: liveClosed ? '#5d6b59' : A_BRAND }}>{liveClosed ? 'ปิดรับสมัครแล้ว' : 'เปิดรับสมัครอยู่'}</div>
          </Field>
        </div>
        <div style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59', marginBottom: 14, lineHeight: 1.5 }}>
          อิงจากวันที่แข่ง + เวลาสตาร์ท/finish cutoff ของแต่ละระยะด้านล่าง กับเวลาปิดรับสมัครด้านบน — ไม่ต้องเลือกเอง
        </div>

        <div style={{ marginBottom: 18 }}>
          <Field label="เบอร์สายด่วนทีมกู้ภัย (ใช้ในปุ่ม SOS ของนักวิ่ง)">
            <input value={ev.hotline} onChange={e => set({ hotline: e.target.value })} placeholder="เช่น 081-234-5678" style={inputStyle({ width: 280, fontFamily: A_MONO })}/>
          </Field>
        </div>

        <div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 6 }}>ไฟล์เส้นทาง (GPX) · เฉพาะงานนี้ — ตามระยะที่ตั้งไว้ด้านล่าง</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          {ev.distances.map(de => {
            const g = ev.gpxFiles && ev.gpxFiles[de.label];
            return (
              <div key={de.id} style={{ width: 180 }}>
                <GpxCard label={de.label} filled={!!g} filename={g && g.filename}
                  stats={g ? `${g.track.totalKm.toFixed(1)} km · +${g.track.ascent} m` : ''}
                  onParsed={(filename, track) => set({ gpxFiles: { ...(ev.gpxFiles || {}), [de.label]: { filename, track } } })}/>
              </div>
            );
          })}
          {ev.distances.length === 0 && <div style={{ fontSize: 12, color: '#5d6b59' }}>ยังไม่มีระยะ — เพิ่มระยะที่ส่วน "ระยะที่เปิดรับสมัคร" ด้านล่างก่อน</div>}
        </div>
        <div style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59', margin: '-10px 0 18px', lineHeight: 1.5 }}>
          แต่ละระยะมีเส้นทาง GPX แยกกัน (ไม่บังคับให้ใช้เส้นเดียวกัน) · รองรับ Suunto / Garmin / Strava export (.gpx)
        </div>

        <div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 4 }}>จุดพัก / Water station (เพิ่ม/ลบ/ตั้งชื่อ/กม. ได้เอง — ทุกระยะผ่านจุดพักตามลำดับนี้เหมือนกัน)</div>
        <div style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59', marginBottom: 8, lineHeight: 1.5 }}>
          ใส่ กม. ของแต่ละจุดตามเส้นทางจริงที่อัปโหลดไว้ด้านบน (เช็คจากนาฬิกา/แอปบันทึกวิ่งที่ใช้เก็บ GPX) · ถ้าระยะไหนไม่ผ่านจุดใด เว้นเวลาช่องนั้นว่างไว้ในตารางด้านล่างได้
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {checkpoints.map(cp => (
            <div key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#fafaf8', border: '1px solid #ece7da', borderRadius: 10 }}>
              <input value={cp.label} onChange={e => updateCheckpoint(cp.id, { label: e.target.value })}
                style={{ padding: '6px 8px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, fontFamily: A_MONO, fontSize: 12, fontWeight: 600, width: 90 }}/>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input value={cp.km} onChange={e => updateCheckpoint(cp.id, { km: e.target.value })}
                  style={{ padding: '6px 8px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: A_MONO, fontSize: 12, width: 56, textAlign: 'center' }}/>
                <span style={{ fontFamily: A_MONO, fontSize: 10.5, color: '#5d6b59' }}>km</span>
              </div>
              <div style={{ flex: 1 }}/>
              <button onClick={() => removeCheckpoint(cp.id)} style={{ background: 'none', border: 'none', color: '#b91c1c', fontSize: 16, cursor: 'pointer', padding: '2px 4px' }}>×</button>
            </div>
          ))}
          {checkpoints.length === 0 && <div style={{ fontSize: 12, color: '#5d6b59' }}>ยังไม่มีจุดพัก — งานนี้จะมีแค่ START/FINISH</div>}
        </div>
        <button onClick={addCheckpoint} style={{ padding: '8px 14px', background: 'transparent', border: '1px dashed #bdb6a4', borderRadius: 10, fontFamily: A_MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: '#1f2a1c', cursor: 'pointer', marginBottom: 18 }}>+ เพิ่มจุดพัก</button>

        <div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 4 }}>QR code เช็คอินแต่ละจุด (ปริ้นท์ไปติดหน้างาน)</div>
        <div style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59', marginBottom: 10, lineHeight: 1.5 }}>
          แต่ละใบใช้ได้เฉพาะงานนี้และจุดนั้นเท่านั้น — นักวิ่งสแกนป้ายผิดจุด/ผิดงาน แอปจะไม่ยอมรับ ดาวน์โหลดแล้วปริ้นท์ไปติดที่จุดจริงก่อนวันแข่ง (สร้าง QR ตามจุดพักที่ตั้งไว้ด้านบนอัตโนมัติ)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <QrCard eventId={ev.id} cpKey="start" label="START"/>
          {checkpoints.map(cp => <QrCard key={cp.id} eventId={ev.id} cpKey={cp.id} label={cp.label}/>)}
          <QrCard eventId={ev.id} cpKey="finish" label="FINISH"/>
        </div>

        <div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 4 }}>เวลาสตาร์ท / cut-off แต่ละจุด (นาฬิกา, ต่อระยะ)</div>
        <div style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59', marginBottom: 8, lineHeight: 1.5 }}>
          เวลาสตาร์ทใช้คำนวณช่วงที่ RD เข้าดูแผนที่ล่วงหน้าได้ก่อนงานเริ่ม (Live Monitor) · เว้นว่างจุดที่ระยะนั้นไม่ผ่าน
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {ev.distances.map(de => (
            <div key={de.id} style={{ padding: '10px 12px', background: '#fafaf8', border: '1px solid #ece7da', borderRadius: 10 }}>
              <div style={{ fontFamily: A_MONO, fontSize: 12, fontWeight: 700, color: de.color, marginBottom: 8 }}>{de.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ width: 84 }}>
                  <div style={{ fontFamily: A_MONO, fontSize: 9, color: '#5d6b59', marginBottom: 3 }}>สตาร์ท</div>
                  <input type="time" value={de.cpTimes.start} onChange={e => updateDistStart(de.id, e.target.value)}
                    style={{ width: '100%', padding: '7px 8px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, fontFamily: A_MONO, fontSize: 12, textAlign: 'center' }}/>
                </div>
                {checkpoints.map(cp => (
                  <div key={cp.id} style={{ width: 84 }}>
                    <div style={{ fontFamily: A_MONO, fontSize: 9, color: '#5d6b59', marginBottom: 3 }}>{cp.label}</div>
                    <input type="time" value={de.cpTimes[cp.id] || ''} onChange={e => updateDistCp(de.id, cp.id, e.target.value)}
                      style={{ width: '100%', padding: '7px 8px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, fontFamily: A_MONO, fontSize: 12, textAlign: 'center' }}/>
                  </div>
                ))}
                <div style={{ width: 84 }}>
                  <div style={{ fontFamily: A_MONO, fontSize: 9, color: '#5d6b59', marginBottom: 3 }}>Finish cutoff</div>
                  <div title="คำนวณจากสตาร์ท + cut-off (นาที) ในการ์ดโควตาด้านล่าง — ไม่ต้องกรอกเอง" style={{ width: '100%', padding: '7px 8px', background: '#f0ede3', border: '1px solid #e5e0d3', borderRadius: 8, fontFamily: A_MONO, fontSize: 12, textAlign: 'center', color: de.cpTimes.finish ? '#1f2a1c' : '#a8a396' }}>{de.cpTimes.finish || '--:--'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!isNew && <RunnerRosterLink eventId={ev.id}/>}

        <div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 4 }}>ระยะที่เปิดรับสมัคร + cut-off + โควตา (แก้ไขระยะได้เอง)</div>
        <div style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59', marginBottom: 8, lineHeight: 1.5 }}>
          พอ "สมัครแล้ว" ถึง "โควตา" ระบบจะปิดรับสมัครระยะนั้นให้อัตโนมัติ (สลับ toggle เป็นปิด) — เว้นโควตาไว้ว่างถ้าไม่จำกัดจำนวน · admin เปิดกลับมาเองได้เสมอ เผื่อมีนักวิ่งมาเพิ่มหน้างาน · กด "บันทึกระยะนี้" ในแต่ละการ์ดเพื่อบันทึกทันทีโดยไม่ต้องรอกดบันทึกทั้งงานด้านล่าง
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {ev.distances.map(de => {
            const cap = parseInt(de.capacity, 10);
            const reg = parseInt(de.registered, 10) || 0;
            const isFull = cap > 0 && reg >= cap;
            return (
            <div key={de.id} style={{ padding: '10px 12px', background: '#fafaf8', border: '1px solid #ece7da', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <input value={de.label} onChange={e => updateDist(de.id, { label: e.target.value })}
                  style={{ width: 70, padding: '8px 9px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: A_MONO, fontSize: 13, fontWeight: 700, color: de.color, textAlign: 'center' }}/>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59' }}>cut-off</span>
                  <input value={de.cutoff} onChange={e => updateDistCutoff(de.id, e.target.value)}
                    style={{ width: 52, padding: '8px 7px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: A_MONO, fontSize: 12, textAlign: 'center' }}/>
                  <span style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59' }}>นาที</span>
                </div>
                <div style={{ flex: 1 }}/>
                <span onClick={() => updateDist(de.id, { open: !de.open })} style={{ width: 26, height: 15, borderRadius: 999, background: de.open ? A_BRAND : '#d8d2c2', position: 'relative', display: 'inline-block', cursor: 'pointer', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: de.open ? 13 : 2, width: 11, height: 11, borderRadius: 999, background: '#fff', transition: 'left .15s' }}/>
                </span>
                <span style={{ fontFamily: A_MONO, fontSize: 9.5, color: de.open ? A_BRAND : '#5d6b59', width: 66 }}>{de.open ? 'เปิดรับสมัคร' : 'ปิดรับสมัคร'}</span>
                <button onClick={() => removeDist(de.id)} style={{ background: 'none', border: 'none', color: '#b91c1c', fontSize: 16, cursor: 'pointer', padding: '2px 4px' }}>×</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                <span style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59' }}>สมัครแล้ว</span>
                <input value={de.registered} onChange={e => updateDistRegistered(de.id, e.target.value)}
                  style={{ width: 56, padding: '7px 7px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, fontFamily: A_MONO, fontSize: 12, textAlign: 'center' }}/>
                <span style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59' }}>/ โควตา</span>
                <input value={de.capacity} onChange={e => updateDist(de.id, { capacity: e.target.value })} placeholder="ไม่จำกัด"
                  style={{ width: 70, padding: '7px 7px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, fontFamily: A_MONO, fontSize: 12, textAlign: 'center' }}/>
                <span style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59' }}>คน</span>
                {isFull && <span style={{ fontFamily: A_MONO, fontSize: 9.5, fontWeight: 700, color: '#b91c1c', background: '#fde9e6', padding: '3px 8px', borderRadius: 999, marginLeft: 4 }}>เต็มแล้ว</span>}
                <div style={{ flex: 1 }}/>
                <button onClick={() => saveDistance(de.label)} style={{ padding: '6px 10px', background: A_BRAND, color: '#fff', border: 'none', borderRadius: 8, fontFamily: A_MONO, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>💾 บันทึกระยะนี้</button>
              </div>
            </div>
          );})}
        </div>
        <button onClick={addDist} style={{ width: '100%', padding: 10, background: 'transparent', border: '1px dashed #bdb6a4', borderRadius: 10, fontFamily: A_MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: '#1f2a1c', cursor: 'pointer', marginBottom: 20 }}>+ เพิ่มระยะ</button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={save} style={{ flex: 1, padding: 15, background: 'linear-gradient(135deg,#357a5c 0%,#1a4a37 100%)', color: '#fff', border: 'none', borderRadius: 12, boxShadow: '0 8px 22px -6px rgba(26,74,55,0.55)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>บันทึกงานแข่งนี้ →</button>
          {!isNew && <button onClick={() => onDelete(ev.id)} style={{ padding: '0 18px', background: '#fff', border: '1px solid #f0c9c4', color: '#b91c1c', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>ลบงานนี้</button>}
        </div>
        <div style={{ marginTop: 12, fontFamily: A_MONO, fontSize: 10, color: '#5d6b59', lineHeight: 1.6 }}>
          งานแต่ละงานเก็บ GPX/จุดพัก/ผลวิ่งแยกกันโดยสมบูรณ์ · นักวิ่งเลือกงานจากหน้า Home ในแอพ แล้วแอพจะโหลดเส้นทาง+ข้อมูลของงานนั้นเท่านั้น
        </div>
      </div>
    </div>
  );
}

function AdminApp({ adminEmail, onLogout }) {
  const [events, setEvents] = aS(() => window.eventStore.loadEvents());
  const [view, setView] = aS('list'); // 'list' | 'form'
  const [editing, setEditing] = aS(null); // event being edited, or null for a new one

  function refresh() { setEvents(window.eventStore.loadEvents()); }

  aE(() => {
    window.addEventListener('trt:events-updated', refresh);
    return () => window.removeEventListener('trt:events-updated', refresh);
  }, []);

  function openCreate() { setEditing(null); setView('form'); }
  function openEdit(ev) { setEditing(ev); setView('form'); }
  function cancelForm() { setView('list'); }
  function saveEvent(ev) {
    window.eventStore.upsertEvent(ev);
    refresh();
    setView('list');
  }
  // Used by the per-distance "บันทึกระยะนี้" button — persists immediately
  // without leaving the form, so admin can save one distance's edits and
  // keep working on the others instead of being kicked back to the list.
  function saveEventInPlace(ev) {
    window.eventStore.upsertEvent(ev);
    refresh();
    setEditing(ev);
  }
  function deleteEvent(id) {
    if (!window.confirm('ลบงานแข่งนี้? ข้อมูลจะหายถาวร')) return;
    window.eventStore.deleteEvent(id);
    refresh();
    setView('list');
  }

  return (
    <div>
      {onLogout && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '8px 20px', fontFamily: A_MONO, fontSize: 10.5, color: '#5d6b59' }}>
          <span>👤 {adminEmail}</span>
          <button onClick={onLogout} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #d8d2c2', borderRadius: 6, fontFamily: A_MONO, fontSize: 10, fontWeight: 700, color: '#5d6b59', cursor: 'pointer' }}>ออกจากระบบ</button>
        </div>
      )}
      {view === 'form'
        ? <EventForm initial={editing} onCancel={cancelForm} onSave={saveEvent} onSaveInPlace={saveEventInPlace} onDelete={deleteEvent}/>
        : <EventList events={events} onEdit={openEdit} onDelete={deleteEvent} onCreate={openCreate}/>}
    </div>
  );
}

// ── Admin login gate ────────────────────────────────────────────────────
// Only Google accounts in ADMIN_EMAILS may see/edit event data. Without
// Firebase configured (no window.fb yet) this stays open, matching the
// previous no-login demo behavior.
const ADMIN_EMAILS = ['patinya.kaeothip@gmail.com'];

function AdminGate() {
  const [authState, setAuthState] = aS('checking'); // checking | signed-out | denied | allowed
  const [user, setUser] = aS(null);
  const [error, setError] = aS(null);

  aE(() => {
    if (!window.fb) { setAuthState('allowed'); return; }
    return window.fb.onAuthChange(u => {
      if (!u) { setUser(null); setAuthState('signed-out'); return; }
      setUser(u);
      setAuthState(ADMIN_EMAILS.includes(u.email) ? 'allowed' : 'denied');
    });
  }, []);

  async function login() {
    setError(null);
    try { await window.fb.signInWithGoogle(); }
    catch (e) { setError('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง'); }
  }
  function logout() { window.fb.signOutUser(); }

  const cardStyle = { maxWidth: 380, margin: '80px auto', padding: 28, background: '#fff', borderRadius: 14, textAlign: 'center',
    fontFamily: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif" };

  if (authState === 'checking') {
    return <div style={{ padding: 60, textAlign: 'center', fontFamily: A_MONO, color: '#5d6b59' }}>กำลังตรวจสอบสิทธิ์…</div>;
  }
  if (authState === 'signed-out') {
    return (
      <div style={{ ...cardStyle, border: '1px solid #e5e0d3' }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🔧</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Admin เข้าสู่ระบบ</div>
        <div style={{ fontSize: 12.5, color: '#5d6b59', marginBottom: 18 }}>เฉพาะบัญชีที่ได้รับสิทธิ์ RD เท่านั้น</div>
        {error && <div style={{ marginBottom: 12, padding: 10, background: '#fde9e6', color: '#9b1c10', borderRadius: 8, fontSize: 12 }}>{error}</div>}
        <button onClick={login} style={{ padding: '11px 18px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>G เข้าสู่ระบบด้วย Google</button>
      </div>
    );
  }
  if (authState === 'denied') {
    return (
      <div style={{ ...cardStyle, border: '1px solid #f0c9c4' }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>⛔</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#b91c1c' }}>ไม่มีสิทธิ์เข้าถึง Admin</div>
        <div style={{ fontSize: 12.5, color: '#5d6b59', marginBottom: 18 }}>บัญชี {user && user.email} ไม่ได้อยู่ในรายชื่อ RD ที่ได้รับสิทธิ์</div>
        <button onClick={logout} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid #bdb6a4', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>ออกจากระบบ</button>
      </div>
    );
  }
  return <AdminApp adminEmail={user && user.email} onLogout={window.fb ? logout : null}/>;
}

Object.assign(window, { AdminApp, AdminGate });

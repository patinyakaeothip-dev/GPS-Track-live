// admin-app.jsx — Admin: a list of created events (edit/delete/open in app)
// plus the "สร้างงานแข่งใหม่" event-setup form from the design. Reads/writes
// through src/event-store.js (localStorage-backed for now — see that file's
// header comment on why this only syncs within one browser until a real
// backend exists).

const { useState: aS, useEffect: aE } = React;

const A_BRAND = '#2d6a4f', A_MONO = "'JetBrains Mono',ui-monospace,monospace";
const CP_KMS = { a1_out: 5.6, a2_in: 11.6, a2_out: 19, a1_in: 23.5 };

function Field({ label, children }) {
  return <div><div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 6 }}>{label}</div>{children}</div>;
}
function inputStyle(extra) {
  return { padding: '11px 13px', background: '#fafaf8', border: '1px solid #e5e0d3', borderRadius: 10,
    boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontSize: 13.5, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', ...extra };
}

function GpxCard({ label, filename, stats, filled, onChoose }) {
  if (filled) {
    return (
      <div>
        <div style={{ fontFamily: A_MONO, fontSize: 10, fontWeight: 700, color: '#1f4d39', marginBottom: 6 }}>GPX · {label}</div>
        <div style={{ background: 'oklch(0.96 0.03 145)', border: '1px solid #bcd9c9', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1f4d39' }}>✓ {filename}</div>
          <div style={{ fontFamily: A_MONO, fontSize: 9.5, color: '#5d6b59', marginTop: 3 }}>{stats}</div>
          <button onClick={onChoose} style={{ marginTop: 6, padding: '5px 9px', background: 'transparent', border: '1px solid #bdb6a4', borderRadius: 8, fontFamily: A_MONO, fontSize: 9.5, fontWeight: 600, color: '#1f2a1c', cursor: 'pointer' }}>เปลี่ยนไฟล์</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontFamily: A_MONO, fontSize: 10, fontWeight: 700, color: '#5d6b59', marginBottom: 6 }}>GPX · {label}</div>
      <div onClick={onChoose} style={{ border: '2px dashed #bdb6a4', borderRadius: 10, padding: '14px 10px', textAlign: 'center', cursor: 'pointer' }}>
        <div style={{ fontSize: 16 }}>📍</div>
        <div style={{ fontSize: 10.5, color: '#1f2a1c', marginTop: 4 }}>ลากไฟล์ .gpx หรือ <span style={{ color: A_BRAND, textDecoration: 'underline' }}>เลือกไฟล์</span></div>
      </div>
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
        ข้อมูลชุดนี้เก็บไว้ในเบราว์เซอร์นี้เท่านั้น (ยังไม่มี backend จริง) — เปิดแอพนักวิ่งบนเบราว์เซอร์เดียวกันจะเห็นรายการเดียวกันนี้
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.length === 0 && <div style={{ textAlign: 'center', color: '#5d6b59', fontSize: 13, padding: 30 }}>ยังไม่มีงานแข่ง · กด "+ สร้างงานแข่งใหม่"</div>}
        {events.map(ev => {
          const meta = STATUS_META[ev.status] || STATUS_META.upcoming;
          return (
            <div key={ev.id} style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{ev.name}</div>
                <div style={{ fontFamily: A_MONO, fontSize: 10.5, color: '#5d6b59', marginTop: 3 }}>
                  {ev.date} · {(ev.distances || []).map(d => d.label).join(' / ') || '—'}{ev.closed ? ' · ปิดรับสมัคร' : ''}
                </div>
              </div>
              <span style={{ fontFamily: A_MONO, fontSize: 10.5, fontWeight: 700, color: meta.color, whiteSpace: 'nowrap' }}>{meta.label}</span>
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
function blankEvent() {
  return {
    id: window.eventStore.newEventId(),
    name: '', date: '', regClose: '', status: 'upcoming', closed: false, hotline: '',
    waves: { '29K': '06:00', '22K': '06:05', '11K': '06:10' },
    distances: [
      { id: 'd1', label: '11K', cutoff: '150', open: true, color: '#3a86c4' },
      { id: 'd2', label: '22K', cutoff: '270', open: true, color: '#e07a3e' },
      { id: 'd3', label: '29K', cutoff: '360', open: true, color: '#1f4d39' },
    ],
  };
}

function EventForm({ initial, onCancel, onSave, onDelete }) {
  const isNew = !initial;
  const [ev, setEv] = aS(() => initial ? { ...blankEvent(), ...initial, waves: initial.waves || blankEvent().waves } : blankEvent());
  const [gpx11k, setGpx11k] = aS(null);
  const [toast, setToast] = aS(null);

  function set(patch) { setEv(e => ({ ...e, ...patch })); }
  function updateDist(id, patch) { setEv(e => ({ ...e, distances: e.distances.map(d => d.id === id ? { ...d, ...patch } : d) })); }
  function removeDist(id) { setEv(e => ({ ...e, distances: e.distances.filter(d => d.id !== id) })); }
  function addDist() {
    const colors = ['#3a86c4', '#e07a3e', '#1f4d39', '#7c4a03', '#9b1c10'];
    setEv(e => ({ ...e, distances: [...e.distances, { id: 'd' + Date.now(), label: 'ใหม่', cutoff: '180', open: true, color: colors[e.distances.length % colors.length] }] }));
  }

  const cpEditor = [
    { label: 'A1 ↗', km: CP_KMS.a1_out, desc: 'เขามะเข้ม · ขาไป' },
    { label: 'A2 ↑', km: CP_KMS.a2_in, desc: 'Green Mountain · ขึ้นเขา' },
    { label: 'A2 ↓', km: CP_KMS.a2_out, desc: 'Green Mountain · ลงเขา (29K เท่านั้น)' },
    { label: 'A1 ↙', km: CP_KMS.a1_in, desc: 'เขามะเข้ม · ขากลับ' },
  ];

  function save() {
    if (!ev.name.trim()) { setToast('⚠ กรอกชื่องานแข่งก่อน'); setTimeout(() => setToast(null), 2000); return; }
    onSave(ev);
  }

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
          <Field label="วันที่แข่ง"><input value={ev.date} onChange={e => set({ date: e.target.value })} style={inputStyle({ fontFamily: A_MONO })}/></Field>
          <Field label="ปิดรับสมัคร (วันที่)"><input value={ev.regClose} onChange={e => set({ regClose: e.target.value })} style={inputStyle({ fontFamily: A_MONO })}/></Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <Field label="สถานะที่แสดงในแอพนักวิ่ง">
            <select value={ev.status} onChange={e => set({ status: e.target.value })} style={inputStyle({ fontFamily: A_MONO })}>
              <option value="upcoming">กำลังจะมาถึง</option>
              <option value="live">กำลังแข่ง (live)</option>
              <option value="past">ผ่านมาแล้ว</option>
            </select>
          </Field>
          <Field label="การรับสมัคร">
            <div onClick={() => set({ closed: !ev.closed })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: '#fafaf8', border: '1px solid #e5e0d3', borderRadius: 10, cursor: 'pointer', height: 20 }}>
              <span style={{ width: 26, height: 15, borderRadius: 999, background: ev.closed ? '#a8b1a3' : A_BRAND, position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: ev.closed ? 2 : 13, width: 11, height: 11, borderRadius: 999, background: '#fff', transition: 'left .15s' }}/>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: ev.closed ? '#5d6b59' : A_BRAND }}>{ev.closed ? 'ปิดรับสมัครแล้ว' : 'เปิดรับสมัครอยู่'}</span>
            </div>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
          {['29K', '22K', '11K'].map(d => (
            <Field key={d} label={`ปล่อยตัว ${d}`}>
              <input value={ev.waves[d]} onChange={e => set({ waves: { ...ev.waves, [d]: e.target.value } })} style={inputStyle({ fontFamily: A_MONO })}/>
            </Field>
          ))}
        </div>

        <div style={{ marginBottom: 18 }}>
          <Field label="เบอร์สายด่วนทีมกู้ภัย (ใช้ในปุ่ม SOS ของนักวิ่ง)">
            <input value={ev.hotline} onChange={e => set({ hotline: e.target.value })} placeholder="เช่น 081-234-5678" style={inputStyle({ width: 280, fontFamily: A_MONO })}/>
          </Field>
        </div>

        <div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 6 }}>ไฟล์เส้นทาง (GPX) · เฉพาะงานนี้</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
          <GpxCard label="29K" filled filename="suunto-29k-2026.gpx" stats="28.6 km · +1,763 m" onChoose={() => {}}/>
          <GpxCard label="22K" filled filename="suunto-22k-2026.gpx" stats="22.1 km · +1,180 m" onChoose={() => {}}/>
          <GpxCard label="11K" filled={!!gpx11k} filename={gpx11k} stats="—" onChoose={() => setGpx11k('11k-course.gpx')}/>
        </div>
        <div style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59', margin: '-10px 0 18px', lineHeight: 1.5 }}>
          แต่ละระยะมีเส้นทาง GPX แยกกัน (ไม่บังคับให้ใช้เส้นเดียวกัน) · รองรับ Suunto / Garmin / Strava export (.gpx)
        </div>

        <div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 8 }}>จุดพัก / Water station (กม. บนเส้นทางที่อัปโหลด)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {cpEditor.map((cpe, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#fafaf8', border: '1px solid #ece7da', borderRadius: 10 }}>
              <span style={{ fontFamily: A_MONO, fontSize: 12, fontWeight: 600, width: 70 }}>{cpe.label}</span>
              <div style={{ padding: '6px 10px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: A_MONO, fontSize: 12, width: 70 }}>{cpe.km} km</div>
              <span style={{ fontSize: 11.5, color: '#5d6b59' }}>{cpe.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ fontFamily: A_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 8 }}>ระยะที่เปิดรับสมัคร + cut-off (แก้ไขระยะได้เอง)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {ev.distances.map(de => (
            <div key={de.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fafaf8', border: '1px solid #ece7da', borderRadius: 10 }}>
              <input value={de.label} onChange={e => updateDist(de.id, { label: e.target.value })}
                style={{ width: 70, padding: '8px 9px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: A_MONO, fontSize: 13, fontWeight: 700, color: de.color, textAlign: 'center' }}/>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: A_MONO, fontSize: 10, color: '#5d6b59' }}>cut-off</span>
                <input value={de.cutoff} onChange={e => updateDist(de.id, { cutoff: e.target.value })}
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
          ))}
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

function AdminApp() {
  const [events, setEvents] = aS(() => window.eventStore.loadEvents());
  const [view, setView] = aS('list'); // 'list' | 'form'
  const [editing, setEditing] = aS(null); // event being edited, or null for a new one

  function refresh() { setEvents(window.eventStore.loadEvents()); }

  function openCreate() { setEditing(null); setView('form'); }
  function openEdit(ev) { setEditing(ev); setView('form'); }
  function cancelForm() { setView('list'); }
  function saveEvent(ev) {
    window.eventStore.upsertEvent(ev);
    refresh();
    setView('list');
  }
  function deleteEvent(id) {
    if (!window.confirm('ลบงานแข่งนี้? ข้อมูลจะหายถาวร')) return;
    window.eventStore.deleteEvent(id);
    refresh();
    setView('list');
  }

  if (view === 'form') {
    return <EventForm initial={editing} onCancel={cancelForm} onSave={saveEvent} onDelete={deleteEvent}/>;
  }
  return <EventList events={events} onEdit={openEdit} onDelete={deleteEvent} onCreate={openCreate}/>;
}

Object.assign(window, { AdminApp });

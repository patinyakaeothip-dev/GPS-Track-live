// admin-runners.jsx — dedicated runner-management page (admin/runners.html),
// split out of the event-edit form (src/admin-app.jsx EventForm) because
// editing/cancelling individual registrations is a different job than
// editing event settings, and it was getting cramped sharing space with
// GPX/cutoff/quota/QR sections there. This page owns: search/filter, inline
// edit of name/phone/distance, cancel (delete) a registration, mark DNF,
// and CSV export.

const { useState: rS, useEffect: rE } = React;

const R_BRAND = '#2d6a4f', R_MONO = "'JetBrains Mono',ui-monospace,monospace";

// Kept in sync with ADMIN_EMAILS in src/admin-app.jsx by hand — small
// duplication accepted here to keep this page a standalone entry point
// instead of depending on admin-app.jsx's internals.
const ADMIN_EMAILS = ['patinya.kaeothip@gmail.com'];

function RunnerManagerGate() {
  const [authState, setAuthState] = rS('checking');
  const [user, setUser] = rS(null);

  rE(() => {
    if (!window.fb) { setAuthState('allowed'); return; }
    return window.fb.onAuthChange(u => {
      if (!u) { setUser(null); setAuthState('signed-out'); return; }
      setUser(u);
      setAuthState(ADMIN_EMAILS.includes(u.email) ? 'allowed' : 'denied');
    });
  }, []);

  async function login() { try { await window.fb.signInWithGoogle(); } catch (_) {} }
  function logout() { window.fb.signOutUser(); }

  const cardStyle = { maxWidth: 380, margin: '80px auto', padding: 28, background: '#fff', borderRadius: 14, textAlign: 'center',
    fontFamily: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif" };

  if (authState === 'checking') return <div style={{ padding: 60, textAlign: 'center', fontFamily: R_MONO, color: '#5d6b59' }}>กำลังตรวจสอบสิทธิ์…</div>;
  if (authState === 'signed-out') {
    return (
      <div style={{ ...cardStyle, border: '1px solid #e5e0d3' }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>👥</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>จัดการนักวิ่ง</div>
        <div style={{ fontSize: 12.5, color: '#5d6b59', marginBottom: 18 }}>เฉพาะบัญชีที่ได้รับสิทธิ์ RD เท่านั้น</div>
        <button onClick={login} style={{ padding: '11px 18px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>G เข้าสู่ระบบด้วย Google</button>
      </div>
    );
  }
  if (authState === 'denied') {
    return (
      <div style={{ ...cardStyle, border: '1px solid #f0c9c4' }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>⛔</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#b91c1c' }}>ไม่มีสิทธิ์เข้าถึง</div>
        <div style={{ fontSize: 12.5, color: '#5d6b59', marginBottom: 18 }}>บัญชี {user && user.email} ไม่ได้อยู่ในรายชื่อ RD ที่ได้รับสิทธิ์</div>
        <button onClick={logout} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid #bdb6a4', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>ออกจากระบบ</button>
      </div>
    );
  }
  return <RunnerManagerApp adminEmail={user && user.email} onLogout={window.fb ? logout : null}/>;
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function RunnerManagerApp({ adminEmail, onLogout }) {
  const [events, setEvents] = rS(() => (window.eventStore ? window.eventStore.loadEvents() : []));
  rE(() => {
    const refresh = () => setEvents(window.eventStore.loadEvents());
    window.addEventListener('trt:events-updated', refresh);
    return () => window.removeEventListener('trt:events-updated', refresh);
  }, []);
  const [eventId, setEventId] = rS(() => new URLSearchParams(location.search).get('event') || (events[0] && events[0].id) || null);
  const selectedEvent = events.find(e => e.id === eventId) || null;

  const [runners, setRunners] = rS(() => (window.runnerStore && eventId ? window.runnerStore.listRunners(eventId) : []));
  rE(() => {
    const refresh = () => setRunners(window.runnerStore && eventId ? window.runnerStore.listRunners(eventId) : []);
    refresh();
    window.addEventListener('trt:runners-updated', refresh);
    return () => window.removeEventListener('trt:runners-updated', refresh);
  }, [eventId]);

  const [q, setQ] = rS('');
  const [distFilter, setDistFilter] = rS('all');
  const [toast, setToast] = rS(null);
  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 1600); }

  function editRunner(r, patch) {
    window.runnerStore.updateRunnerProgress(r.id, patch);
  }
  function cancelRunner(r) {
    if (!window.confirm(`ยกเลิกการลงทะเบียนของ "${r.nickname}" (บิบ #${r.bib})? ข้อมูลจะหายถาวร`)) return;
    window.runnerStore.deleteRunner(r.id);
    if (selectedEvent) window.eventStore.decrementRegistration(selectedEvent.id, r.distance);
    flash(`✓ ยกเลิก #${r.bib} แล้ว`);
  }
  function toggleDnf(r) {
    editRunner(r, { dnf: !r.dnf });
  }
  function exportCsv() {
    const rows = [['bib', 'ชื่อ', 'เบอร์โทร', 'เพศ', 'ระยะ', 'เช็คอิน', 'DNF']];
    filtered.forEach(r => rows.push([r.bib, r.nickname, r.phone, r.gender === 'm' ? 'ชาย' : r.gender === 'f' ? 'หญิง' : '', r.distance, (r.checkins || []).length, r.dnf ? 'DNF' : '']));
    downloadCsv(`runners-${selectedEvent ? selectedEvent.id : 'export'}.csv`, rows);
  }
  function renumberAll() {
    if (!selectedEvent || !window.confirm(`สร้างเลขบิบใหม่ทั้งหมด ${runners.length} คนของงาน "${selectedEvent.name}"? เลขเดิม (รวมที่อาจปริ้นท์/แจกไปแล้ว) จะเปลี่ยนหมด — เรียงลำดับตามวันที่สมัคร`)) return;
    window.runnerStore.renumberBibs(selectedEvent);
    flash('✓ สร้างเลขบิบใหม่ทั้งหมดแล้ว');
  }

  const query = q.trim().toLowerCase();
  const filtered = runners
    .filter(r => distFilter === 'all' || r.distance === distFilter)
    .filter(r => !query || r.nickname.toLowerCase().includes(query) || r.bib.includes(query) || (r.phone || '').includes(query))
    .sort((a, b) => a.bib.localeCompare(b.bib, undefined, { numeric: true }));

  const inputStyle = { padding: '6px 8px', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', width: '100%' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px', fontFamily: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif", color: '#1f2a1c' }}>
      {toast && <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', padding: '10px 16px', background: '#1f4d39', color: '#fff', borderRadius: 6, fontSize: 13, zIndex: 100, boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontFamily: R_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>👥 จัดการนักวิ่ง</div>
        {onLogout && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: R_MONO, fontSize: 10.5, color: '#5d6b59' }}>
            <span>{adminEmail}</span>
            <button onClick={onLogout} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #d8d2c2', borderRadius: 6, fontFamily: R_MONO, fontSize: 10, fontWeight: 700, color: '#5d6b59', cursor: 'pointer' }}>ออกจากระบบ</button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <select value={eventId || ''} onChange={e => setEventId(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 240, padding: '10px 12px', fontFamily: R_MONO }}>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} · {ev.date}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหาชื่อ / บิบ / เบอร์"
          style={{ ...inputStyle, flex: 1, minWidth: 200, padding: '9px 12px' }}/>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['all', ...(selectedEvent && selectedEvent.distances || []).map(d => d.label)].map(v => (
            <button key={v} onClick={() => setDistFilter(v)} style={{ padding: '7px 11px', borderRadius: 999, border: `1px solid ${distFilter === v ? R_BRAND : '#e5e0d3'}`,
              background: distFilter === v ? R_BRAND : '#fff', color: distFilter === v ? '#fff' : '#5d6b59', fontFamily: R_MONO, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
              {v === 'all' ? 'ทั้งหมด' : v}
            </button>
          ))}
        </div>
        <button onClick={exportCsv} disabled={!filtered.length} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid #bdb6a4', borderRadius: 8, fontFamily: R_MONO, fontSize: 11, fontWeight: 700, cursor: filtered.length ? 'pointer' : 'not-allowed', opacity: filtered.length ? 1 : 0.5 }}>⬇ Export CSV</button>
        <button onClick={renumberAll} disabled={!runners.length} title="สร้างเลขบิบใหม่ทั้งหมดของงานนี้ตามระบบ 4 หลักปัจจุบัน" style={{ padding: '8px 12px', background: 'transparent', border: '1px solid #b45309', color: '#b45309', borderRadius: 8, fontFamily: R_MONO, fontSize: 11, fontWeight: 700, cursor: runners.length ? 'pointer' : 'not-allowed', opacity: runners.length ? 1 : 0.5 }}>🔄 รีเซ็ตเลขบิบทั้งหมด</button>
      </div>

      <div style={{ fontFamily: R_MONO, fontSize: 11, color: '#5d6b59', marginBottom: 8 }}>
        ทั้งหมด {runners.length} คน{filtered.length !== runners.length ? ` · ตรงตัวกรอง ${filtered.length}` : ''}
      </div>

      {!selectedEvent && <div style={{ padding: 30, textAlign: 'center', color: '#5d6b59', fontSize: 13 }}>ยังไม่มีงานแข่ง</div>}
      {selectedEvent && runners.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#5d6b59', fontSize: 13, background: '#fafaf8', border: '1px solid #ece7da', borderRadius: 10 }}>ยังไม่มีใครลงทะเบียนงานนี้</div>}
      {filtered.length === 0 && runners.length > 0 && <div style={{ padding: 30, textAlign: 'center', color: '#5d6b59', fontSize: 13, background: '#fafaf8', border: '1px solid #ece7da', borderRadius: 10 }}>ไม่พบนักวิ่งที่ค้นหา</div>}

      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(r => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '54px 1.4fr 1fr 90px 64px 80px auto auto', gap: 8, alignItems: 'center',
              padding: '8px 10px', background: r.dnf ? '#fef7f7' : '#fafaf8', border: `1px solid ${r.dnf ? '#f0c9c4' : '#ece7da'}`, borderRadius: 10 }}>
              <span style={{ fontFamily: R_MONO, fontSize: 12, fontWeight: 700 }}>#{r.bib}</span>
              <input value={r.nickname} onChange={e => editRunner(r, { nickname: e.target.value })} style={inputStyle}/>
              <input value={r.phone} onChange={e => editRunner(r, { phone: e.target.value })} style={{ ...inputStyle, fontFamily: R_MONO }}/>
              <select value={r.distance} onChange={e => editRunner(r, { distance: e.target.value })} style={{ ...inputStyle, fontFamily: R_MONO }}>
                {(selectedEvent && selectedEvent.distances || []).map(d => <option key={d.id} value={d.label}>{d.label}</option>)}
              </select>
              <select value={r.gender || ''} onChange={e => editRunner(r, { gender: e.target.value })} style={{ ...inputStyle, fontFamily: R_MONO }}>
                <option value="">—</option>
                <option value="m">ชาย</option>
                <option value="f">หญิง</option>
              </select>
              <span style={{ fontFamily: R_MONO, fontSize: 10.5, color: '#5d6b59', textAlign: 'center' }}>{(r.checkins || []).length} เช็คอิน</span>
              <button onClick={() => toggleDnf(r)} style={{ padding: '6px 9px', background: r.dnf ? '#b91c1c' : 'transparent', color: r.dnf ? '#fff' : '#b91c1c', border: '1px solid #b91c1c', borderRadius: 8, fontFamily: R_MONO, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{r.dnf ? 'ยกเลิก DNF' : 'Mark DNF'}</button>
              <button onClick={() => cancelRunner(r)} style={{ padding: '6px 9px', background: 'transparent', color: '#5d6b59', border: '1px solid #d8d2c2', borderRadius: 8, fontFamily: R_MONO, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>ยกเลิก</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RunnerManagerGate });

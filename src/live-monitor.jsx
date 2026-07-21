// live-monitor.jsx — the "Race Director · Live Map Dashboard" from the
// current GPS Live Tracking design: a real Leaflet map plotting simulated
// runner positions along the actual recorded course GPX, a draggable/
// zoomable elevation-profile strip with one dot per runner, an alerts feed,
// search, a selected-runner detail card with a focus toggle, and a Ranking
// tab (grouped by distance, gender filter, medal badges).

const { useState: mS, useEffect: mE, useMemo: mM, useRef: mR } = React;

const M_BRAND = '#2d6a4f', M_DIST = { '29K': '#1f4d39', '22K': '#e07a3e', '11K': '#3a86c4' };
const M_WARN = 'oklch(0.68 0.16 70)', M_ALERT = 'oklch(0.58 0.22 28)', M_REST = '#7c8a78';
const M_MONO = "'JetBrains Mono',ui-monospace,monospace";
const CP_KMS = { a1_out: 5.6, a2_in: 11.6, a2_out: 19, a1_in: 23.5 };

const NAMES = [
  ['101', 'ก้อง', '29K', 4.0, 'normal', 'M'], ['102', 'เก่ง', '29K', 9.5, 'normal', 'M'],
  ['103', 'ตูน', '29K', 14.2, 'missing', 'M'], ['104', 'โย', '29K', 19.8, 'normal', 'M'],
  ['105', 'บอส', '29K', 24.0, 'normal', 'M'],
  ['201', 'มิ้น', '22K', 6.0, 'normal', 'F'], ['202', 'พีท', '22K', 10.0, 'normal', 'M'],
  ['203', 'แอน', '22K', 2.5, 'normal', 'F'], ['204', 'ฟ้า', '22K', 14.0, 'normal', 'F'],
  ['205', 'ปอย', '22K', 8.0, 'slow', 'F'], ['206', 'บีม', '22K', 18.0, 'normal', 'M'],
  ['301', 'นัท', '11K', 10.3, 'normal', 'M'], ['302', 'เอ้', '11K', 3.0, 'normal', 'F'],
  ['303', 'โอม', '11K', 6.0, 'normal', 'M'], ['304', 'กัน', '11K', 1.5, 'normal', 'M'],
  ['305', 'พลอย', '11K', 8.5, 'normal', 'F'], ['306', 'แพร', '11K', 5.0, 'rest', 'F'],
  ['307', 'ใหม่', '11K', 9.0, 'normal', 'M'],
];

// RD can open the map early to check GPS/course setup before an upcoming
// event actually starts, within this window before the earliest wave time.
const PREVIEW_WINDOW_MS = 3 * 60 * 60 * 1000;
// Same Thailand-time fix as combineDateTime in admin-app.jsx: build the Date
// with an explicit +07:00 offset instead of relying on the viewer's local
// timezone, so "06:00" always means Bangkok 06:00 no matter whose device
// (or which timezone a server-rendered/CI browser defaults to) is looking.
function earliestStartDate(ev) {
  if (!ev || !ev.raceDateISO) return null;
  const times = (ev.distances || []).map(d => d.cpTimes && d.cpTimes.start).filter(Boolean);
  if (!times.length) return null;
  const earliest = times.slice().sort()[0];
  if (!/^\d{2}:\d{2}$/.test(earliest)) return null;
  const d = new Date(`${ev.raceDateISO}T${earliest}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtClock(d) {
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtPace(p) {
  if (!isFinite(p) || p <= 0) return '—';
  let mm = Math.floor(p), ss = Math.round((p - mm) * 60);
  if (ss === 60) { ss = 0; mm += 1; }
  return `${mm}'${String(ss).padStart(2, '0')}"`;
}
function gradColor(g) { const a = Math.abs(g); return a < 3 ? M_BRAND : a < 9 ? M_WARN : M_ALERT; }
function gradArrow(g) { return g > 1 ? '▲' : g < -1 ? '▼' : '→'; }
function fmtAgo(sec) { return sec < 60 ? `${Math.round(sec)} วิที่แล้ว` : `${Math.floor(sec / 60)} นาทีที่แล้ว`; }
function statusMeta(status) {
  return {
    normal: { label: 'On course', bg: 'oklch(0.94 0.06 145)', fg: '#1f4d39' },
    slow: { label: 'ช้ากว่าคาด', bg: '#fdf0d6', fg: '#7c4a03' },
    rest: { label: 'พักที่จุดพัก', bg: '#ede7d8', fg: '#5d6b59' },
    missing: { label: 'ขาดการติดต่อ', bg: '#fde9e6', fg: '#9b1c10' },
    finished: { label: 'เข้าเส้นชัย', bg: M_BRAND, fg: '#fff' },
  }[status] || { label: status, bg: '#eee', fg: '#000' };
}
function colorFor(r) {
  if (r.statusBase === 'missing') return M_ALERT;
  if (r.statusBase === 'slow') return M_WARN;
  if (r.statusBase === 'rest') return M_REST;
  if (r.km >= r.totalKm - 0.02) return M_BRAND;
  return M_DIST[r.distance];
}

function useElevationProfile(geo, coursePaths, distance) {
  return mM(() => {
    if (!geo || !coursePaths) return null;
    const pts = coursePaths[distance];
    const N = 220;
    const totalKm = pts[pts.length - 1].km;
    const sample = [];
    for (let i = 0; i <= N; i++) sample.push(geo.pointAtKm(pts, totalKm * i / N));
    const w = 1100, h = 170, padL = 6, padR = 6, padT = 14, padB = 22;
    const eles = sample.map(p => p.ele);
    const minE = Math.min(...eles) - 15, maxE = Math.max(...eles) + 15;
    const x = km => padL + (w - padL - padR) * (km / totalKm);
    const y = ele => padT + (h - padT - padB) * (1 - (ele - minE) / (maxE - minE));
    let d = `M ${x(0)} ${y(minE)} L ${x(0)} ${y(sample[0].ele)}`;
    sample.forEach(p => { d += ` L ${x(p.km)} ${y(p.ele)}`; });
    d += ` L ${x(totalKm)} ${y(minE)} Z`;
    return { d, w, h, x, y, baseY: y(minE), totalKm };
  }, [geo, coursePaths, distance]);
}

function LiveMonitorApp() {
  const [ready, setReady] = mS(false);
  const [tick, setTick] = mS(0);
  const [selectedBib, setSelectedBib] = mS('103');
  const [dashView, setDashView] = mS('map'); // 'map' | 'ranking'
  const [distFilter, setDistFilter] = mS(null);
  const [events, setEvents] = mS(() => (window.eventStore ? window.eventStore.loadEvents() : []));
  mE(() => {
    const refresh = () => setEvents(window.eventStore.loadEvents());
    window.addEventListener('trt:events-updated', refresh);
    return () => window.removeEventListener('trt:events-updated', refresh);
  }, []);
  const [eventId, setEventId] = mS(() => {
    const list = window.eventStore ? window.eventStore.loadEvents() : [];
    const live = list.find(e => window.eventStatus.computeStatus(e) === 'live');
    return (live || list[0] || {}).id || null;
  });
  const selectedEvent = events.find(e => e.id === eventId) || null;
  // Computed live from the event's schedule (see src/event-status.js) on
  // every render instead of trusting the stored status field, which is only
  // a snapshot from whenever Admin last hit save.
  const selectedStatus = selectedEvent ? window.eventStatus.computeStatus(selectedEvent) : null;
  const [previewOpen, setPreviewOpen] = mS(false);
  const earliestStart = earliestStartDate(selectedEvent);
  const previewFrom = earliestStart ? new Date(earliestStart.getTime() - PREVIEW_WINDOW_MS) : null;
  const previewUnlocked = !!(earliestStart && Date.now() >= previewFrom.getTime() && Date.now() < earliestStart.getTime());
  const showDashboard = !selectedEvent || selectedStatus === 'live' || (selectedStatus === 'upcoming' && previewUnlocked && previewOpen);
  const [rankGender, setRankGender] = mS(null);
  const [search, setSearch] = mS('');
  const [focusBib, setFocusBib] = mS(null);
  const [detailBib, setDetailBib] = mS(null);

  const geoRef = mR(null);
  const coursePathsRef = mR(null);
  const cpKmsRef = mR(CP_KMS);
  const runnersRef = mR(null);
  const mapHostRef = mR(null);
  const mapRef = mR(null);
  const markersRef = mR(new Map());

  // Loads the *real* course (GPX uploaded per event in Admin, see
  // src/course-geo.js buildEventCoursePaths) for whichever event is
  // selected, instead of always drawing the one bundled demo course —
  // falls back to the demo course automatically for events with no GPX
  // uploaded yet. Runner *positions* are still simulated (see the banner
  // below) — that needs real device GPS, a separate piece of work — but the
  // route line and CP markers now reflect what RD actually configured.
  useEffect_loadGeo();
  function useEffect_loadGeo() {
    mE(() => {
      let cancelled = false;
      setReady(false);
      (async () => {
        const geo = window.courseGeo;
        geoRef.current = geo;
        const { paths: coursePaths, cpKms } = await geo.buildEventCoursePaths(selectedEvent);
        coursePathsRef.current = coursePaths;
        cpKmsRef.current = cpKms;
        runnersRef.current = NAMES.map(([bib, name, distance, km, statusBase, gender]) => {
          const pts = coursePaths[distance];
          const totalKm = pts[pts.length - 1].km;
          return { bib, name, distance, km: Math.min(km, totalKm - 0.05), totalKm, statusBase, gender,
            basePace: 7 + Math.random() * 2.2,
            lastPingAt: Date.now() - (statusBase === 'missing' ? 26 * 60000 : 0) };
        });
        if (cancelled) return;
        setReady(true);
      })();
      return () => { cancelled = true; };
    }, [eventId]);
  }

  mE(() => {
    if (!ready || !mapHostRef.current || mapRef.current) return;
    const L = window.L, geo = geoRef.current, coursePaths = coursePathsRef.current, cpKms = cpKmsRef.current;
    const c29 = coursePaths['29K'];
    const latlngs = geo.coursePolylineLatLngs(c29);
    const loopStart = c29.findIndex(p => p.km >= cpKms.a2_in);
    const loopEnd = c29.findIndex(p => p.km >= cpKms.a2_out);
    const loopLatLngs = latlngs.slice(loopStart, loopEnd + 1);
    const bounds = L.latLngBounds(latlngs);
    const map = L.map(mapHostRef.current, { zoomControl: false, attributionControl: false }).fitBounds(bounds, { padding: [24, 24] });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.polyline(latlngs, { color: '#1f4d39', weight: 4, opacity: 0.8 }).addTo(map);
    L.polyline(loopLatLngs, { color: '#1f4d39', weight: 4, opacity: 1, dashArray: '1 7' }).addTo(map);
    [[0, 'START', 0], [cpKms.a1_out, 'A1 ↗', 0], [cpKms.a2_in, 'A2 ↑', -16], [cpKms.a2_out, 'A2 ↓', 16], [cpKms.a1_in, 'A1 ↙', 0], [c29[c29.length - 1].km, 'FINISH', -18]]
      .forEach(([km, label, dx]) => {
        const p = geo.pointAtKm(c29, km);
        L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html:
          `<div style="padding:2px 7px;background:#2d6a4f;color:#fff;border-radius:7px;font:600 10px 'JetBrains Mono',monospace;letter-spacing:0.04em;white-space:nowrap;transform:translate(calc(-50% + ${dx}px),-130%)">${label}</div>`,
          iconSize: [0, 0] }) }).addTo(map);
      });
    runnersRef.current.forEach(r => {
      const p = geo.pointAtKm(coursePaths[r.distance], r.km);
      const color = colorFor(r);
      const m = L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
      m.bindTooltip(`#${r.bib} ${r.name}`, { direction: 'top', offset: [0, -8] });
      m.on('click', () => { setSelectedBib(r.bib); setFocusBib(null); });
      markersRef.current.set(r.bib, m);
      if (r.statusBase === 'missing') {
        L.circleMarker([p.lat, p.lon], { radius: 14, color, weight: 0, fillOpacity: 0.25 }).addTo(map);
      }
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [ready]);

  mE(() => { if (mapRef.current && dashView === 'map') setTimeout(() => mapRef.current.invalidateSize(), 60); }, [dashView]);

  function recenter() {
    const map = mapRef.current;
    if (!map || !geoRef.current) return;
    if (selectedBib && markersRef.current.has(selectedBib)) {
      map.flyTo(markersRef.current.get(selectedBib).getLatLng(), 15, { duration: 0.5 });
    } else {
      const bounds = window.L.latLngBounds(geoRef.current.coursePolylineLatLngs(coursePathsRef.current['29K']));
      map.flyToBounds(bounds, { padding: [24, 24], duration: 0.5 });
    }
  }
  function toggleFocus() {
    const bib = selectedBib;
    if (!bib) return;
    const turningOn = focusBib !== bib;
    markersRef.current.forEach((m, b) => m.setStyle({ opacity: turningOn && b !== bib ? 0.15 : 1, fillOpacity: turningOn && b !== bib ? 0.15 : 1 }));
    if (turningOn) mapRef.current.flyTo(markersRef.current.get(bib).getLatLng(), 15, { duration: 0.6 });
    else recenter();
    setFocusBib(turningOn ? bib : null);
  }

  const geo = geoRef.current, coursePaths = coursePathsRef.current;
  const overviewProfile = useElevationProfile(geo, coursePaths, '29K');

  const displays = mM(() => {
    if (!ready) return [];
    return runnersRef.current.map(r => {
      const pts = coursePaths[r.distance];
      const p = geo.pointAtKm(pts, r.km);
      const g = geo.gradientAtKm(pts, r.km);
      const status = r.km >= r.totalKm - 0.02 ? 'finished' : r.statusBase;
      const meta = statusMeta(status);
      const physKm = geo.nearestKmOnTrack(coursePaths['29K'], p.lat, p.lon);
      return { bib: r.bib, name: r.name, distance: r.distance, gender: r.gender, color: colorFor(r),
        initial: r.name.slice(0, 1), km: r.km, totalKm: r.totalKm,
        pct: Math.min(100, (r.km / r.totalKm) * 100),
        pace: fmtPace(r.basePace * Math.max(0.55, g > 0 ? 1 + g * 0.035 : 1 + g * 0.012)),
        gradStr: `${g >= 0 ? '+' : ''}${g.toFixed(0)}%`, gradColor: gradColor(g), gradArrow: gradArrow(g),
        ele: p.ele, ago: fmtAgo((Date.now() - r.lastPingAt) / 1000),
        statusLabel: meta.label, statusBg: meta.bg, statusFg: meta.fg, physKm };
    });
  }, [ready, tick]);

  const byBib = mM(() => Object.fromEntries(displays.map(d => [d.bib, d])), [displays]);
  const selected = selectedBib ? byBib[selectedBib] : null;

  const alerts = mM(() => displays.filter(d => d.statusLabel === 'ช้ากว่าคาด' || d.statusLabel === 'ขาดการติดต่อ')
    .map(d => ({ ...d, msg: d.statusLabel === 'ขาดการติดต่อ' ? `ไม่มี GPS ping · จุดล่าสุด ${d.km.toFixed(1)}K` : `ช้ากว่าคาด · ${d.km.toFixed(1)}/${d.totalKm.toFixed(1)}K` })), [displays]);

  const counts = mM(() => {
    const c = { total: displays.length, on: 0, finished: 0, alert: 0 };
    displays.forEach(d => { if (d.statusLabel === 'On course') c.on++; if (d.statusLabel === 'เข้าเส้นชัย') c.finished++; if (d.statusLabel === 'ขาดการติดต่อ') c.alert++; });
    return c;
  }, [displays]);

  const searchResults = mM(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return displays.filter(d => d.bib.includes(q) || d.name.toLowerCase().includes(q)).slice(0, 6);
  }, [displays, search]);

  const rankRows = mM(() => {
    const q = search.trim().toLowerCase();
    const filtered = displays.filter(d => (!distFilter || d.distance === distFilter) && (!rankGender || d.gender === rankGender)
      && (!q || d.bib.includes(q) || d.name.toLowerCase().includes(q)));
    const byDist = {};
    filtered.forEach(d => (byDist[d.distance] ||= []).push(d));
    const medal = n => n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : '';
    return ['29K', '22K', '11K'].filter(ds => byDist[ds]).flatMap(ds =>
      byDist[ds].slice().sort((a, b) => b.pct - a.pct).map((d, i) => ({ ...d, rank: i + 1, medal: medal(i + 1), firstInGroup: i === 0, groupLabel: ds })));
  }, [displays, distFilter, rankGender, search]);

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 20px 60px', fontFamily: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif", color: '#1f2a1c' }}>
      <div style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1f2a1c', fontWeight: 600, marginBottom: 14 }}>🖥 Race Director · Live Map Dashboard</div>

      <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #d8d2c2', gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', padding: 3, border: '1px solid #d8d2c2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            <img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          </div>
          <div>
            <div style={{ fontFamily: M_MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5d6b59' }}>{selectedEvent ? selectedEvent.name : 'Rayong Trail Running'}</div>
            <div style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 17, fontWeight: 600, color: '#1f4d39' }}>Live GPS Monitor</div>
          </div>
          {events.length > 0 && (
            <select value={eventId || ''} onChange={e => { setEventId(e.target.value); setPreviewOpen(false); }} style={{
              padding: '6px 10px', border: '1px solid #e5e0d3', borderRadius: 6, background: '#fff',
              fontFamily: M_MONO, fontSize: 11, color: '#1f2a1c', maxWidth: 260 }}>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name} · {ev.date}</option>
              ))}
            </select>
          )}
          <div style={{ flex: 1 }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', border: '1px solid #e5e0d3', borderRadius: 6, boxShadow: '0 1px 3px rgba(31,42,28,0.08)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: M_BRAND, boxShadow: '0 0 0 3px rgba(45,106,79,0.18)' }}/>
            <span style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Live · {counts.total} นักวิ่ง</span>
          </div>
        </header>
        {events.length > 1 && selectedEvent && selectedStatus === 'live' && (
          <div style={{ padding: '8px 22px', borderBottom: '1px solid #d8d2c2', background: '#fdf6e3', fontFamily: M_MONO, fontSize: 10.5, color: '#7c4a03', lineHeight: 1.5 }}>
            ⚠ เส้นทาง/จุด CP บนแผนที่ตอนนี้เป็นของงานที่เลือกจริงแล้ว (ตาม GPX ที่อัปโหลดใน Admin) แต่ตำแหน่งนักวิ่ง (จุดสี) ยังเป็นข้อมูลจำลองอยู่ — รอต่อ GPS จริงจากมือถือนักวิ่ง
          </div>
        )}

        {selectedEvent && selectedStatus === 'upcoming' && !showDashboard && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🕓</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1f2a1c' }}>ยังไม่เริ่มงาน</div>
            <div style={{ fontFamily: M_MONO, fontSize: 12, color: '#5d6b59', marginTop: 8, lineHeight: 1.6 }}>
              "{selectedEvent.name}" มีกำหนดแข่ง {selectedEvent.date}<br/>
              แผนที่ GPS จะเริ่มแสดงตำแหน่งนักวิ่งเมื่องานเริ่มและมีคน scan QR ที่จุดสตาร์ทแล้ว
            </div>
            {earliestStart && (
              previewUnlocked ? (
                <button onClick={() => setPreviewOpen(true)} style={{ marginTop: 16, padding: '10px 18px', background: M_BRAND, color: '#fff', border: 'none', borderRadius: 8, fontFamily: M_MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  🔍 ดูแผนที่ล่วงหน้า (preview)
                </button>
              ) : (
                <div style={{ marginTop: 16, fontFamily: M_MONO, fontSize: 11, color: '#7c4a03', background: '#fdf6e3', display: 'inline-block', padding: '8px 14px', borderRadius: 8 }}>
                  🔍 ดูแผนที่ล่วงหน้าได้ตั้งแต่ {fmtClock(previewFrom)} (3 ชม.ก่อนสตาร์ท)
                </div>
              )
            )}
            {!earliestStart && (
              <div style={{ marginTop: 16, fontFamily: M_MONO, fontSize: 10.5, color: '#5d6b59' }}>
                (ยังกดดูแผนที่ล่วงหน้าไม่ได้ — ใส่วันที่แข่งและเวลาสตาร์ทของแต่ละระยะในหน้า Admin ก่อน)
              </div>
            )}
          </div>
        )}

        {selectedEvent && selectedStatus === 'past' && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🏁</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1f2a1c' }}>งานนี้จบไปแล้ว</div>
            <div style={{ fontFamily: M_MONO, fontSize: 12, color: '#5d6b59', marginTop: 8, lineHeight: 1.6 }}>
              "{selectedEvent.name}" · {selectedEvent.date}<br/>
              Live Monitor มีไว้ดูระหว่างแข่งเท่านั้น — ดูผลอย่างเป็นทางการที่หน้า Results แทน
            </div>
            <a href="results/" style={{ display: 'inline-block', marginTop: 16, padding: '10px 18px', background: M_BRAND, color: '#fff', textDecoration: 'none', borderRadius: 8, fontFamily: M_MONO, fontSize: 12, fontWeight: 700 }}>📊 ไปหน้า Results →</a>
          </div>
        )}

        {showDashboard && (
        <>
        {selectedEvent && selectedStatus === 'upcoming' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 22px', borderBottom: '1px solid #d8d2c2', background: '#fdf6e3', fontFamily: M_MONO, fontSize: 10.5, color: '#7c4a03' }}>
            <span>🔍 โหมดพรีวิว — งานยังไม่เริ่ม ตำแหน่งนักวิ่งที่เห็นเป็นข้อมูลจำลองสำหรับเช็คระบบเท่านั้น</span>
            <button onClick={() => setPreviewOpen(false)} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #d8ae5c', borderRadius: 6, fontFamily: M_MONO, fontSize: 10, fontWeight: 700, color: '#7c4a03', cursor: 'pointer' }}>ปิดพรีวิว</button>
          </div>
        )}
        <div style={{ display: 'flex', borderBottom: '1px solid #d8d2c2' }}>
          {[['ทั้งหมด', counts.total, '#1f2a1c'], ['กำลังวิ่ง', counts.on, '#1f2a1c'], ['เข้าเส้นชัย', counts.finished, M_BRAND], ['Alerts', counts.alert, counts.alert ? M_ALERT : '#1f2a1c']].map(([label, value, color], i) => (
            <div key={i} style={{ flex: 1, padding: '12px 18px', borderRight: '1px solid #d8d2c2' }}>
              <div style={{ fontFamily: M_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 18px', borderBottom: '1px solid #d8d2c2', background: '#faf8f2' }}>
          {[null, '29K', '22K', '11K'].map(d => (
            <div key={d || 'all'} onClick={() => setDistFilter(d)} style={{ padding: '7px 14px', borderRadius: 8,
              background: distFilter === d ? '#fff' : 'transparent', boxShadow: distFilter === d ? '0 1px 3px rgba(31,42,28,0.08)' : 'none',
              fontFamily: M_MONO, fontSize: 11, fontWeight: distFilter === d ? 700 : 600, color: distFilter === d ? '#1f4d39' : '#5d6b59', cursor: 'pointer' }}>{d || 'ทุกระยะ'}</div>
          ))}
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #d8d2c2' }}>
          <button onClick={() => setDashView('map')} style={{ flex: 1, padding: 12, background: 'none', border: 'none', borderBottom: `3px solid ${dashView === 'map' ? M_BRAND : 'transparent'}`, cursor: 'pointer', fontFamily: M_MONO, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: dashView === 'map' ? M_BRAND : '#a8b1a3' }}>🗺 Live Map Monitor</button>
          <button onClick={() => setDashView('ranking')} style={{ flex: 1, padding: 12, background: 'none', border: 'none', borderBottom: `3px solid ${dashView === 'ranking' ? M_BRAND : 'transparent'}`, cursor: 'pointer', fontFamily: M_MONO, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: dashView === 'ranking' ? M_BRAND : '#a8b1a3' }}>🏆 Ranking</button>
        </div>

        {dashView === 'map' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', minHeight: 560 }}>
              <div style={{ position: 'relative', borderRight: '1px solid #d8d2c2' }}>
                <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 400, display: 'flex', gap: 16, background: 'rgba(255,255,255,0.92)', padding: '6px 12px', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  {[['29K', M_DIST['29K']], ['22K', M_DIST['22K']], ['11K', M_DIST['11K']], ['ช้า', M_WARN], ['ขาดการติดต่อ', M_ALERT]].map(([label, color]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: color }}/>
                      <span style={{ fontFamily: M_MONO, fontSize: 10, color: '#5d6b59' }}>{label}</span>
                    </div>
                  ))}
                </div>
                {!ready && <div style={{ width: '100%', height: 560, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5d6b59', fontFamily: M_MONO, fontSize: 12 }}>กำลังโหลดแผนที่ GPX…</div>}
                <div ref={mapHostRef} style={{ width: '100%', height: 560, display: ready ? 'block' : 'none' }}/>
                {ready && <button onClick={recenter} style={{ position: 'absolute', zIndex: 1000, bottom: 16, right: 16, width: 38, height: 38, borderRadius: 999, background: '#fff', border: '1px solid #d8d2c2', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>🎯</button>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #d8d2c2', position: 'relative' }}>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือเลข BIB" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e0d3', borderRadius: 10, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: M_MONO, fontSize: 12, boxSizing: 'border-box' }}/>
                  {searchResults.length > 0 && (
                    <div style={{ position: 'absolute', left: 16, right: 16, top: 44, zIndex: 50, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                      {searchResults.map(sr => (
                        <div key={sr.bib} onClick={() => { setSelectedBib(sr.bib); setSearch(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f4f3ef' }}>
                          <div style={{ width: 22, height: 22, borderRadius: 999, background: sr.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{sr.initial}</div>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>#{sr.bib} {sr.name}</span>
                          <span style={{ fontFamily: M_MONO, fontSize: 10, color: '#5d6b59', marginLeft: 'auto' }}>{sr.distance}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 16px 12px', borderBottom: '1px solid #d8d2c2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Alerts</span>
                  <span style={{ fontFamily: M_MONO, fontSize: 10, color: '#fff', background: M_ALERT, padding: '1px 7px', borderRadius: 6, fontWeight: 600 }}>{alerts.length}</span>
                </div>
                <div style={{ maxHeight: 190, overflowY: 'auto', borderBottom: '1px solid #d8d2c2' }}>
                  {alerts.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#5d6b59', fontSize: 12 }}>ไม่มี alert</div>}
                  {alerts.map(al => (
                    <div key={al.bib} onClick={() => setSelectedBib(al.bib)} style={{ padding: '10px 16px', borderBottom: '1px solid #f4f3ef', cursor: 'pointer', background: al.statusLabel === 'ขาดการติดต่อ' ? 'rgba(220,38,38,0.05)' : 'transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: M_MONO, fontSize: 12, fontWeight: 600 }}>#{al.bib} {al.name}</span>
                        <span style={{ fontFamily: M_MONO, fontSize: 9.5, color: '#5d6b59' }}>{al.ago}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: al.statusLabel === 'ขาดการติดต่อ' ? M_ALERT : '#7c4a03', marginTop: 2, fontWeight: 500 }}>{al.msg}</div>
                    </div>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                  {!selected && <div style={{ padding: '30px 10px', textAlign: 'center', color: '#5d6b59', fontSize: 12.5, lineHeight: 1.6 }}>แตะนักวิ่งบนแผนที่<br/>เพื่อดูความเร็ว · ความชัน · ระดับความสูง</div>}
                  {selected && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 999, background: selected.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{selected.initial}</div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
                          <div style={{ fontFamily: M_MONO, fontSize: 10.5, color: '#5d6b59' }}>#{selected.bib} · {selected.distance}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <MiniStat label="ระยะ" value={`${selected.km.toFixed(1)} / ${selected.totalKm.toFixed(1)}K`}/>
                        <MiniStat label="เพซ" value={`${selected.pace}/km`}/>
                        <MiniStat label="ความชันตอนนี้" value={`${selected.gradArrow} ${selected.gradStr}`} color={selected.gradColor}/>
                        <MiniStat label="ระดับความสูง" value={`${selected.ele.toFixed(0)} m`}/>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 10, background: selected.statusBg, marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: selected.statusFg }}>{selected.statusLabel}</span>
                        <span style={{ fontFamily: M_MONO, fontSize: 10, color: selected.statusFg }}>ping {selected.ago}</span>
                      </div>
                      <button onClick={toggleFocus} style={{ width: '100%', padding: 10, background: focusBib ? M_BRAND : '#fff', color: focusBib ? '#fff' : M_BRAND, border: '1px solid #2d6a4f', borderRadius: 10, fontFamily: M_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer' }}>
                        {focusBib ? '✕ เลิกโฟกัส · ดูทุกคน' : '🔍 โฟกัสเฉพาะคนนี้บนแผนที่'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 20px 20px', borderTop: '1px solid #d8d2c2' }}>
              <div style={{ fontFamily: M_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 8 }}>
                Elevation profile · ภาพรวมเส้นทาง 29K · {displays.length} นักวิ่ง
              </div>
              {overviewProfile && (
                <svg viewBox={`0 0 ${overviewProfile.w} ${overviewProfile.h}`} style={{ width: '100%', height: 180, display: 'block' }}>
                  <path d={overviewProfile.d} fill="oklch(0.9 0.03 145 / 0.5)" stroke="#1f4d39" strokeWidth="1.4"/>
                  {[[0, 'START'], [cpKmsRef.current.a1_out, 'A1'], [cpKmsRef.current.a2_in, 'A2↑'], [cpKmsRef.current.a2_out, 'A2↓'], [cpKmsRef.current.a1_in, 'A1'], [overviewProfile.totalKm, 'FINISH']].map(([km, label], i) => (
                    <g key={i}>
                      <line x1={overviewProfile.x(km)} y1={8} x2={overviewProfile.x(km)} y2={overviewProfile.baseY} stroke="#2d6a4f" strokeWidth="1" strokeDasharray="2 3" opacity="0.5"/>
                      <text x={overviewProfile.x(km)} y={overviewProfile.h} textAnchor="middle" fontFamily={M_MONO} fontSize="9" fill="#5d6b59">{label}</text>
                    </g>
                  ))}
                  {displays.map(d => (
                    <circle key={d.bib} cx={overviewProfile.x(d.physKm)} cy={overviewProfile.y(d.ele)} r={selected && selected.bib === d.bib ? 8 : 4.5}
                      fill={d.color} stroke="#fff" strokeWidth={selected && selected.bib === d.bib ? 2.5 : 1}
                      onClick={() => setSelectedBib(d.bib)} style={{ cursor: 'pointer' }}/>
                  ))}
                </svg>
              )}
            </div>
          </div>
        )}

        {dashView === 'ranking' && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 560 }}>
            <div style={{ display: 'flex', gap: 8, padding: '16px 20px 12px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #d8d2c2' }}>
              <span style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginRight: 6 }}>นักวิ่งทั้งหมด · {counts.total}</span>
              {[null, '29K', '22K', '11K'].map(d => (
                <button key={d || 'all'} onClick={() => setDistFilter(d)} style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${distFilter === d ? M_BRAND : '#d8d2c2'}`, background: distFilter === d ? M_BRAND : '#fff', color: distFilter === d ? '#fff' : '#1f2a1c', fontFamily: M_MONO, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{d || 'ทั้งหมด'}</button>
              ))}
              <span style={{ width: 1, height: 18, background: '#d8d2c2' }}/>
              {[[null, 'ทั้งหมด'], ['M', 'ชาย'], ['F', 'หญิง']].map(([v, label]) => (
                <button key={label} onClick={() => setRankGender(v)} style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${rankGender === v ? M_BRAND : '#d8d2c2'}`, background: rankGender === v ? M_BRAND : '#fff', color: rankGender === v ? '#fff' : '#1f2a1c', fontFamily: M_MONO, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
              ))}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือเลข BIB" style={{ marginLeft: 'auto', padding: '7px 10px', border: '1px solid #e5e0d3', borderRadius: 10, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: M_MONO, fontSize: 11.5, width: 200 }}/>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#fff' }}>
                    {['อันดับ', 'นักวิ่ง', 'ระยะ', 'ความคืบหน้า', 'เพซ', 'ความชัน', 'สถานะ'].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: i === 0 || i === 6 ? '9px 20px' : '9px 14px', fontFamily: M_MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5d6b59', borderBottom: '1px solid #d8d2c2' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankRows.map(rk => (
                    <React.Fragment key={rk.bib}>
                      {rk.firstInGroup && <tr><td colSpan={7} style={{ padding: '10px 20px 4px', fontFamily: M_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', fontWeight: 700, background: '#faf8f2' }}>ระยะ {rk.groupLabel}</td></tr>}
                      <tr onClick={() => setDetailBib(rk.bib)} style={{ cursor: 'pointer', borderBottom: '1px solid #f4f3ef' }}>
                        <td style={{ padding: '10px 20px', fontFamily: M_MONO, fontWeight: 700, color: rk.rank <= 3 ? M_BRAND : '#5d6b59' }}>#{rk.rank} {rk.medal}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 26, height: 26, borderRadius: 999, background: rk.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{rk.initial}</div>
                            <div><div style={{ fontWeight: 600 }}>{rk.name}</div><div style={{ fontFamily: M_MONO, fontSize: 10, color: '#5d6b59' }}>bib {rk.bib}</div></div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12 }}>{rk.distance}</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12 }}>{rk.km.toFixed(1)} / {rk.totalKm.toFixed(1)}K</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12 }}>{rk.pace}/km</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12, fontWeight: 600, color: rk.gradColor }}>{rk.gradArrow} {rk.gradStr}</td>
                        <td style={{ padding: '10px 20px' }}><span style={{ padding: '3px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: rk.statusBg, color: rk.statusFg }}>{rk.statusLabel}</span></td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: '#fafaf8', border: '1px solid #f4f3ef', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontFamily: M_MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5d6b59' }}>{label}</div>
      <div style={{ fontFamily: M_MONO, fontSize: 14, fontWeight: 600, marginTop: 2, color: color || '#1f2a1c' }}>{value}</div>
    </div>
  );
}

Object.assign(window, { LiveMonitorApp });

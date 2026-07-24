// live-monitor.jsx — the "Race Director · Live Map Dashboard" from the
// current GPS Live Tracking design: a real Leaflet map plotting real
// registered runners' positions along the actual recorded course GPX
// (positioned by their last QR check-in km — real device GPS is a separate
// piece of work, not wired up yet), a draggable/zoomable elevation-profile
// strip with one dot per runner, an alerts feed, search, a selected-runner
// detail card with a focus toggle, and a Ranking tab (grouped by distance,
// gender filter, medal badges).

const { useState: mS, useEffect: mE, useMemo: mM, useRef: mR } = React;

const M_BRAND = '#2d6a4f', M_DIST = { '29K': '#1f4d39', '22K': '#e07a3e', '11K': '#3a86c4' };
const M_DIST_FALLBACK = ['#1f4d39', '#e07a3e', '#3a86c4', '#7c4a03', '#9b1c10'];
const M_WARN = 'oklch(0.68 0.16 70)', M_ALERT = 'oklch(0.58 0.22 28)', M_REST = '#7c8a78';
const M_MONO = "'JetBrains Mono',ui-monospace,monospace";
// A runner is flagged as an alert once their last QR check-in is older than
// this — the closest proxy to "ขาดการติดต่อ" we have without live GPS pings
// (position only updates at each checkpoint scan, not continuously).
const STALE_MINUTES = 60;
// Off-route: how far a live GPS fix can sit from the course before it
// counts as "not on this course" (same distance src/mobile-app.jsx uses for
// its own off-route alert), and how long that has to hold before it's a
// real alert instead of one noisy fix.
const OFF_ROUTE_KM = 0.1;
const OFF_ROUTE_ALERT_MIN = 2;

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
function fmtPace(p) {
  if (!isFinite(p) || p <= 0) return '—';
  let mm = Math.floor(p), ss = Math.round((p - mm) * 60);
  if (ss === 60) { ss = 0; mm += 1; }
  return `${mm}'${String(ss).padStart(2, '0')}"`;
}
function gradColor(g) { const a = Math.abs(g); return a < 3 ? M_BRAND : a < 9 ? M_WARN : M_ALERT; }
function gradArrow(g) { return g > 1 ? '▲' : g < -1 ? '▼' : '→'; }
function fmtAgo(sec) { return sec < 60 ? `${Math.round(sec)} วิที่แล้ว` : `${Math.floor(sec / 60)} นาทีที่แล้ว`; }
function fmtElapsed(ms) {
  if (ms == null || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h > 0 ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
}
function cpLabel(cp) {
  if (cp === 'start') return 'START';
  if (cp === 'finish') return 'FINISH';
  return String(cp || '').toUpperCase();
}
// A runner's checkin only stores a wall-clock "HH:MM" string (see
// mobile-app.jsx scanComplete) — reconstruct a real timestamp against the
// event's race date the same way Results does, so pace/staleness can be
// computed from it.
function checkinMs(ev, hhmm) {
  const d = window.eventStatus && window.eventStatus.combineDateTime(ev && ev.raceDateISO, hhmm);
  return d ? d.getTime() : null;
}
function statusMeta(status) {
  return {
    not_started: { label: 'ยังไม่เริ่ม', bg: '#ede7d8', fg: '#5d6b59' },
    active: { label: 'On course', bg: 'oklch(0.94 0.06 145)', fg: '#1f4d39' },
    off_route: { label: '⚠ ออกนอกเส้นทาง', bg: '#fdf0d6', fg: '#7c4a03' },
    stale: { label: 'ขาดการติดต่อ', bg: '#fde9e6', fg: '#9b1c10' },
    dnf: { label: 'DNF / ถอน', bg: '#fde9e6', fg: '#9b1c10' },
    finished: { label: 'เข้าเส้นชัย', bg: M_BRAND, fg: '#fff' },
    sos: { label: '🆘 SOS', bg: '#dc2626', fg: '#fff' },
  }[status] || { label: status, bg: '#eee', fg: '#000' };
}
function colorFor(r, distColor) {
  if (r.status === 'sos') return '#dc2626';
  if (r.status === 'off_route') return M_WARN;
  if (r.status === 'stale') return M_ALERT;
  if (r.status === 'dnf') return M_REST;
  if (r.status === 'finished') return M_BRAND;
  return (distColor || M_DIST)[r.distance] || '#5d6b59';
}

function useElevationProfile(geo, coursePaths, distance) {
  return mM(() => {
    if (!geo || !coursePaths) return null;
    const pts = coursePaths[distance];
    const N = 220;
    const totalKm = pts[pts.length - 1].km;
    const sample = [];
    for (let i = 0; i <= N; i++) sample.push(geo.pointAtKm(pts, totalKm * i / N));
    const w = 1100, h = 170, padL = 44, padR = 6, padT = 14, padB = 34;
    const eles = sample.map(p => p.ele);
    const minE = Math.min(...eles) - 15, maxE = Math.max(...eles) + 15;
    const x = km => padL + (w - padL - padR) * (km / totalKm);
    const y = ele => padT + (h - padT - padB) * (1 - (ele - minE) / (maxE - minE));
    let d = `M ${x(0)} ${y(minE)} L ${x(0)} ${y(sample[0].ele)}`;
    sample.forEach(p => { d += ` L ${x(p.km)} ${y(p.ele)}`; });
    d += ` L ${x(totalKm)} ${y(minE)} Z`;
    // 4 evenly spaced elevation labels for the Y axis, rounded to whole
    // meters — actual course elevation, not just a relative silhouette.
    const yTicks = Array.from({ length: 4 }, (_, i) => Math.round(minE + 15 + (maxE - 15 - (minE + 15)) * i / 3));
    return { d, w, h, x, y, baseY: y(minE), totalKm, padL, yTicks };
  }, [geo, coursePaths, distance]);
}

function LiveMonitorApp() {
  const [ready, setReady] = mS(false);
  const [selectedBib, setSelectedBib] = mS(null);
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
  // Distances/colors follow the selected event's own `distances` list (set
  // up in Admin) instead of a fixed 29K/22K/11K set — an event's own color
  // per distance is reused so the map legend matches what RD already sees
  // when editing the event.
  const distLabels = mM(() => (selectedEvent && selectedEvent.distances && selectedEvent.distances.length)
    ? selectedEvent.distances.map(d => d.label) : ['29K', '22K', '11K'], [selectedEvent]);
  const distColor = mM(() => {
    const m = {};
    (selectedEvent && selectedEvent.distances || []).forEach((d, i) => { m[d.label] = d.color || M_DIST_FALLBACK[i % M_DIST_FALLBACK.length]; });
    return Object.keys(m).length ? m : M_DIST;
  }, [selectedEvent]);
  // Computed live from the event's schedule (see src/event-status.js) on
  // every render instead of trusting the stored status field, which is only
  // a snapshot from whenever Admin last hit save.
  const selectedStatus = selectedEvent ? window.eventStatus.computeStatus(selectedEvent) : null;
  // RD can open the map/course preview for an upcoming event at any time —
  // useful for checking the uploaded GPX/checkpoints look right well before
  // race day, not just in a fixed window right before the start. Only the
  // *live runner dots* are meaningfully time-gated (they need the race to
  // have actually started), not the map itself.
  const [previewOpen, setPreviewOpen] = mS(false);
  const earliestStart = earliestStartDate(selectedEvent);
  const showDashboard = !selectedEvent || selectedStatus === 'live' || (selectedStatus === 'upcoming' && previewOpen);
  const [rankGender, setRankGender] = mS(null);
  const [search, setSearch] = mS('');
  const [focusBib, setFocusBib] = mS(null);
  const [detailBib, setDetailBib] = mS(null);

  const geoRef = mR(null);
  const coursePathsRef = mR(null);
  const overviewLabelRef = mR('29K');
  const checkpointsRef = mR([]);
  const mapHostRef = mR(null);
  const mapRef = mR(null);
  const markersRef = mR(new Map());

  // Real per-event roster (src/runner-store.js) — position is each
  // runner's last QR check-in km (see mobile-app.jsx scanComplete), not a
  // live GPS ping, so dots only move when someone actually scans a
  // checkpoint. Real device GPS is a separate piece of work, not wired up.
  const [runners, setRunners] = mS([]);
  mE(() => {
    if (!eventId) { setRunners([]); return; }
    const refresh = () => setRunners(window.runnerStore ? window.runnerStore.listRunners(eventId) : []);
    refresh();
    window.addEventListener('trt:runners-updated', refresh);
    return () => window.removeEventListener('trt:runners-updated', refresh);
  }, [eventId]);

  // Real-time GPS, bib -> latest fix — src/native/gps-tracker.js writes one
  // doc per runner (id `${eventId}_${bib}`, overwritten on every fix) to the
  // `livePos` collection. Watching the whole collection and filtering
  // client-side is cheap regardless of race length: it's never more than
  // one doc per currently-tracking runner, not a growing ping history.
  // Position on the map now prefers this over checkpoint-km interpolation
  // whenever a fix is fresh; checkpoints remain the source of truth for
  // pace/progress, which GPS alone can't derive (start/finish times, laps).
  const [livePosByBib, setLivePosByBib] = mS({});
  mE(() => {
    if (!eventId || !window.fb) { setLivePosByBib({}); return; }
    const prefix = `${eventId}_`;
    return window.fb.watchCollection('livePos', all => {
      const next = {};
      all.forEach(p => { if (p.id.startsWith(prefix)) next[p.id.slice(prefix.length)] = p; });
      setLivePosByBib(next);
    });
  }, [eventId]);

  // Sustained-off-route tracking, bib -> timestamp first seen off-course.
  // A ref (not state) since it's re-derived on a timer below regardless —
  // a runner who wanders off then stops moving stops producing new GPS
  // pings entirely (the tracker only pushes on ~10m of movement), so this
  // can't rely on livePosByBib changing to notice two minutes have passed.
  const offCourseSinceRef = mR(new Map());
  const [offRouteTick, forceTick] = mS(0);
  mE(() => {
    const id = setInterval(() => forceTick(t => t + 1), 20000);
    return () => clearInterval(id);
  }, []);
  mE(() => {
    const coursePathsNow = coursePathsRef.current, geo = geoRef.current;
    if (!coursePathsNow || !geo) return;
    const now = Date.now();
    runners.forEach(r => {
      const live = livePosByBib[r.bib];
      const gpsLive = !!(live && live.at && (now - live.at) < 2 * 60 * 1000 && live.lat != null);
      if (!gpsLive) { offCourseSinceRef.current.delete(r.bib); return; }
      const pts = coursePathsNow[r.distance] || coursePathsNow[overviewLabelRef.current];
      const nearestKm = geo.nearestKmOnTrack(pts, live.lat, live.lon);
      const nearestPt = geo.pointAtKm(pts, nearestKm);
      const distKm = geo.haversineKm(live.lat, live.lon, nearestPt.lat, nearestPt.lon);
      if (distKm > OFF_ROUTE_KM) {
        if (!offCourseSinceRef.current.has(r.bib)) offCourseSinceRef.current.set(r.bib, now);
      } else {
        offCourseSinceRef.current.delete(r.bib);
      }
    });
  }, [runners, livePosByBib, ready]);

  // Loads the *real* course (GPX uploaded per event in Admin, see
  // src/course-geo.js buildEventCoursePaths) for whichever event is
  // selected, instead of always drawing the one bundled demo course —
  // falls back to the demo course automatically for events with no GPX
  // uploaded yet.
  mE(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      const geo = window.courseGeo;
      geoRef.current = geo;
      const { paths: coursePaths, overviewLabel, checkpoints } = await geo.buildEventCoursePaths(selectedEvent);
      coursePathsRef.current = coursePaths;
      overviewLabelRef.current = overviewLabel;
      checkpointsRef.current = checkpoints;
      if (cancelled) return;
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [eventId, distLabels]);

  mE(() => {
    if (!ready || !mapHostRef.current || mapRef.current) return;
    const L = window.L, geo = geoRef.current, coursePaths = coursePathsRef.current, checkpoints = checkpointsRef.current;
    const cOverview = coursePaths[overviewLabelRef.current];
    const latlngs = geo.coursePolylineLatLngs(cOverview);
    const bounds = L.latLngBounds(latlngs);
    const map = L.map(mapHostRef.current, { zoomControl: false, attributionControl: false }).fitBounds(bounds, { padding: [24, 24] });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.polyline(latlngs, { color: '#1f4d39', weight: 4, opacity: 0.8 }).addTo(map);
    [[0, 'START'], ...checkpoints.map(cp => [parseFloat(cp.km) || 0, cp.label]), [cOverview[cOverview.length - 1].km, 'FINISH']]
      .forEach(([km, label]) => {
        const p = geo.pointAtKm(cOverview, km);
        L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html:
          `<div style="padding:2px 7px;background:#2d6a4f;color:#fff;border-radius:7px;font:600 10px 'JetBrains Mono',monospace;letter-spacing:0.04em;white-space:nowrap;transform:translate(-50%,-130%)">${label}</div>`,
          iconSize: [0, 0] }) }).addTo(map);
      });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markersRef.current.clear(); };
  // Also re-run when showDashboard flips true: for an "upcoming" event the
  // course/runner data (ready) usually finishes loading *before* the RD
  // clicks "ดูแผนที่ / เส้นทาง" (see #69's preview gate), so the map's host
  // <div> doesn't exist in the DOM yet at the moment `ready` becomes true —
  // this effect would bail out via the mapHostRef.current guard and never
  // fire again, leaving the map container permanently empty even after the
  // preview button mounts it. Re-running once the container actually exists
  // fixes that without touching the guard itself.
  }, [ready, showDashboard]);

  mE(() => { if (mapRef.current && dashView === 'map') setTimeout(() => mapRef.current.invalidateSize(), 60); }, [dashView]);

  function recenter() {
    const map = mapRef.current;
    if (!map || !geoRef.current) return;
    if (selectedBib && markersRef.current.has(selectedBib)) {
      map.flyTo(markersRef.current.get(selectedBib).getLatLng(), 15, { duration: 0.5 });
    } else {
      const bounds = window.L.latLngBounds(geoRef.current.coursePolylineLatLngs(coursePathsRef.current[overviewLabelRef.current]));
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
  const overviewLabel = overviewLabelRef.current;
  const overviewProfile = useElevationProfile(geo, coursePaths, overviewLabel);

  // Real roster → map/ranking rows. Position is each runner's last QR
  // check-in km (progressKm), and pace/staleness are derived from
  // checkin clock times reconstructed against the event's race date — same
  // technique Results uses, just adapted for "still running" runners too.
  const displays = mM(() => {
    if (!ready || !coursePaths) return [];
    return runners.map(r => {
      const pts = coursePaths[r.distance] || coursePaths[overviewLabel];
      const totalKm = pts[pts.length - 1].km;
      const cks = r.checkins || [];
      const startCk = cks.find(c => c.cp === 'start');
      const finishCk = cks.find(c => c.cp === 'finish');
      const last = cks[cks.length - 1];
      const baseStatus = r.dnf ? 'dnf' : finishCk ? 'finished' : cks.length ? 'active' : 'not_started';
      const km = Math.min(r.progressKm || 0, totalKm - (baseStatus === 'finished' ? 0 : 0.02));
      const p = geo.pointAtKm(pts, Math.max(0, km));
      const g = geo.gradientAtKm(pts, Math.max(0, km));

      const startMs = startCk ? checkinMs(selectedEvent, startCk.t) : null;
      const endMs = finishCk ? checkinMs(selectedEvent, finishCk.t) : Date.now();
      const pace = (startMs != null && km > 0 && endMs > startMs) ? ((endMs - startMs) / 60000) / km : null;
      // Elapsed time since start — live-ticking for runners still on course
      // (frozen at finish once they're done), plus the checkpoint times
      // themselves, both for the Ranking table.
      const elapsedMs = startMs != null ? (endMs - startMs) : null;
      const checkinTimes = cks.map(c => ({ cp: c.cp, label: cpLabel(c.cp), t: c.t }));

      const lastAtMs = last ? checkinMs(selectedEvent, last.t) : null;
      const staleMin = lastAtMs != null ? (Date.now() - lastAtMs) / 60000 : null;
      const offSince = offCourseSinceRef.current.get(r.bib);
      const offRoute = !!(offSince && (Date.now() - offSince) > OFF_ROUTE_ALERT_MIN * 60000);
      // An active SOS always wins, no matter what else is going on — RD
      // needs to see it immediately, not have it buried under "on course".
      // Off-route ranks above stale — someone moving but off the course is
      // more urgent than someone who just hasn't checked in in a while.
      const status = r.sos ? 'sos'
        : (baseStatus === 'active' && offRoute) ? 'off_route'
        : (baseStatus === 'active' && staleMin != null && staleMin > STALE_MINUTES) ? 'stale'
        : baseStatus;
      const meta = statusMeta(status);
      const physKm = geo.nearestKmOnTrack(coursePaths[overviewLabel], p.lat, p.lon);
      // Before the start checkpoint is scanned, position is stuck at km 0 —
      // the "gradient" there is just the course's starting slope, not
      // anything about the runner, so show — same as pace instead of a
      // number that looks like real live data.
      const started = status !== 'not_started';
      // GPS wins for *where the dot sits* whenever a fix is fresh — km/pace/
      // gradient stay derived from checkpoints regardless, since GPS alone
      // can't tell progress along a looped course.
      const live = livePosByBib[r.bib];
      const gpsLive = !!(live && live.at && (Date.now() - live.at) < 2 * 60 * 1000);
      const mapLat = gpsLive ? live.lat : p.lat;
      const mapLon = gpsLive ? live.lon : p.lon;
      return { bib: r.bib, id: r.id, name: r.nickname, distance: r.distance, gender: r.gender,
        color: colorFor({ status, distance: r.distance }, distColor),
        initial: (r.nickname || '?').slice(0, 1), lat: mapLat, lon: mapLon, gpsLive, km, totalKm,
        pct: Math.min(100, (km / totalKm) * 100),
        pace: fmtPace(pace),
        gradStr: started ? `${g >= 0 ? '+' : ''}${g.toFixed(0)}%` : '—',
        gradColor: started ? gradColor(g) : '#5d6b59',
        gradArrow: started ? gradArrow(g) : '',
        ele: p.ele, ago: lastAtMs != null ? fmtAgo((Date.now() - lastAtMs) / 1000) : '—',
        elapsedMs, checkinTimes,
        sos: !!r.sos, sosReason: r.sosReason || '',
        emgName: r.emgName || '', emgPhone: r.emgPhone || '', bloodType: r.bloodType || '', medical: r.medical || '',
        status, statusLabel: meta.label, statusBg: meta.bg, statusFg: meta.fg, physKm };
    });
  }, [ready, runners, coursePaths, overviewLabel, distColor, selectedEvent, livePosByBib, offRouteTick]);

  // Keep Leaflet markers in sync with real roster updates (a QR scan moves
  // someone) instead of only ever creating them once at map init.
  mE(() => {
    const map = mapRef.current, L = window.L;
    if (!map) return;
    const seen = new Set();
    displays.forEach(d => {
      seen.add(d.bib);
      let m = markersRef.current.get(d.bib);
      if (!m) {
        m = L.circleMarker([d.lat, d.lon], { radius: 7, color: '#fff', weight: 2, fillColor: d.color, fillOpacity: 1 }).addTo(map);
        m.bindTooltip(`#${d.bib} ${d.name}`, { direction: 'top', offset: [0, -8] });
        m.on('click', () => { setSelectedBib(d.bib); setFocusBib(null); });
        markersRef.current.set(d.bib, m);
      } else {
        m.setLatLng([d.lat, d.lon]);
        m.setStyle({ fillColor: d.color });
      }
    });
    markersRef.current.forEach((m, bib) => {
      if (!seen.has(bib)) { map.removeLayer(m); markersRef.current.delete(bib); }
    });
  }, [displays]);

  const byBib = mM(() => Object.fromEntries(displays.map(d => [d.bib, d])), [displays]);
  const selected = selectedBib ? byBib[selectedBib] : null;

  // SOS always sorts first regardless of how long ago it came in — it's
  // the one alert that needs eyes on it immediately.
  const alerts = mM(() => displays.filter(d => d.status === 'sos' || d.status === 'off_route' || d.status === 'stale' || d.status === 'dnf')
    .map(d => ({ ...d, msg: d.status === 'sos' ? `🆘 ${d.sosReason || 'ขอความช่วยเหลือ'} · ${d.km.toFixed(1)}/${d.totalKm.toFixed(1)}K`
      : d.status === 'off_route' ? `⚠ ออกนอกเส้นทางมากกว่า ${OFF_ROUTE_ALERT_MIN} นาที · ใกล้ ${d.km.toFixed(1)}K`
      : d.status === 'stale' ? `ไม่มีความเคลื่อนไหว · จุดล่าสุด ${d.km.toFixed(1)}K` : `ถอนตัว (DNF) · ${d.km.toFixed(1)}/${d.totalKm.toFixed(1)}K` }))
    .sort((a, b) => (a.status === 'sos' ? 0 : 1) - (b.status === 'sos' ? 0 : 1)), [displays]);

  const counts = mM(() => {
    const c = { total: displays.length, on: 0, finished: 0, alert: 0, sos: 0 };
    displays.forEach(d => { if (d.status === 'active') c.on++; if (d.status === 'finished') c.finished++; if (d.status === 'stale' || d.status === 'off_route') c.alert++; if (d.status === 'sos') { c.alert++; c.sos++; } });
    return c;
  }, [displays]);

  function clearSos(id) {
    if (window.runnerStore && id) window.runnerStore.updateRunnerProgress(id, { sos: false });
  }

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
    return distLabels.filter(ds => byDist[ds]).flatMap(ds =>
      byDist[ds].slice().sort((a, b) => b.pct - a.pct).map((d, i) => ({ ...d, rank: i + 1, medal: medal(i + 1), firstInGroup: i === 0, groupLabel: ds })));
  }, [displays, distFilter, rankGender, search, distLabels]);

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 20px 60px', fontFamily: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif", color: '#1f2a1c' }}>
      <div style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1f2a1c', fontWeight: 600, marginBottom: 14 }}>🖥 Race Director · Live Map Dashboard</div>

      <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #d8d2c2', gap: 16 }}>
          <div style={{ width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}/>
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
        {selectedEvent && selectedStatus === 'live' && (
          <div style={{ padding: '8px 22px', borderBottom: '1px solid #d8d2c2', background: '#fdf6e3', fontFamily: M_MONO, fontSize: 10.5, color: '#7c4a03', lineHeight: 1.5 }}>
            ⚠ ข้อมูลนักวิ่งเป็นรายชื่อ/ตำแหน่งจริงจากการลงทะเบียนและสแกน QR แต่ละจุด — ตำแหน่งจะขยับเฉพาะตอนสแกน QR เท่านั้น ยังไม่ใช่พิกัด GPS สดต่อเนื่องจากมือถือนักวิ่ง (รอต่อ GPS จริง เป็นงานแยกต่างหาก)
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
            <button onClick={() => setPreviewOpen(true)} style={{ marginTop: 16, padding: '10px 18px', background: M_BRAND, color: '#fff', border: 'none', borderRadius: 8, fontFamily: M_MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔍 ดูแผนที่ / เส้นทาง
            </button>
            {!earliestStart && (
              <div style={{ marginTop: 12, fontFamily: M_MONO, fontSize: 10.5, color: '#5d6b59' }}>
                (ยังไม่มีเวลาสตาร์ท — ใส่วันที่แข่งและเวลาสตาร์ทของแต่ละระยะในหน้า Admin เพื่อให้แผงนับถอยหลังทำงาน)
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
            <span>🔍 โหมดพรีวิว — งานยังไม่เริ่ม เอาไว้เช็คเส้นทาง/จุดพัก · รายชื่อนักวิ่งที่เห็นเป็นรายชื่อจริงที่ลงทะเบียนแล้ว แต่ยังไม่มีตำแหน่งจนกว่าจะสแกน QR จุดสตาร์ท</span>
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
          {[null, ...distLabels].map(d => (
            <div key={d || 'all'} onClick={() => setDistFilter(d)} style={{ padding: '7px 14px', borderRadius: 8,
              background: distFilter === d ? '#fff' : 'transparent', boxShadow: distFilter === d ? '0 1px 3px rgba(31,42,28,0.08)' : 'none',
              fontFamily: M_MONO, fontSize: 11, fontWeight: distFilter === d ? 700 : 600, color: distFilter === d ? '#1f4d39' : '#5d6b59', cursor: 'pointer' }}>{d || 'ทุกระยะ'}</div>
          ))}
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #d8d2c2' }}>
          <button onClick={() => setDashView('map')} style={{ flex: 1, padding: 12, background: 'none', border: 'none', borderBottom: `3px solid ${dashView === 'map' ? M_BRAND : 'transparent'}`, cursor: 'pointer', fontFamily: M_MONO, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: dashView === 'map' ? M_BRAND : '#a8b1a3' }}>🗺 Live Map Monitor</button>
          <button onClick={() => setDashView('ranking')} style={{ flex: 1, padding: 12, background: 'none', border: 'none', borderBottom: `3px solid ${dashView === 'ranking' ? M_BRAND : 'transparent'}`, cursor: 'pointer', fontFamily: M_MONO, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: dashView === 'ranking' ? M_BRAND : '#a8b1a3' }}>🏆 Ranking</button>
        </div>

        {/* Kept mounted (just hidden) instead of conditionally unmounted —
            switching tabs used to destroy the map's host <div>, but
            mapRef.current stayed set to the now-orphaned Leaflet instance,
            so switching back to "map" silently skipped creating a new one
            (its effect bails out whenever mapRef.current is already
            truthy) and the map never came back without a full refresh. */}
        <div style={{ display: dashView === 'map' ? 'flex' : 'none', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', minHeight: 560 }}>
              <div style={{ position: 'relative', borderRight: '1px solid #d8d2c2' }}>
                <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 400, display: 'flex', gap: 16, background: 'rgba(255,255,255,0.92)', padding: '6px 12px', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  {[...distLabels.map(l => [l, distColor[l]]), ['ออกนอกเส้นทาง', M_WARN], ['ขาดการติดต่อ', M_ALERT]].map(([label, color]) => (
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
                    <div key={al.bib} onClick={() => setSelectedBib(al.bib)} style={{ padding: '10px 16px', borderBottom: '1px solid #f4f3ef', cursor: 'pointer',
                      background: al.status === 'sos' ? 'rgba(220,38,38,0.12)' : al.status === 'stale' ? 'rgba(220,38,38,0.05)' : al.status === 'off_route' ? 'rgba(180,83,9,0.06)' : 'transparent',
                      borderLeft: al.status === 'sos' ? '3px solid #dc2626' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: M_MONO, fontSize: 12, fontWeight: 700 }}>{al.status === 'sos' && '🆘 '}#{al.bib} {al.name}</span>
                        <span style={{ fontFamily: M_MONO, fontSize: 9.5, color: '#5d6b59' }}>{al.ago}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: al.status === 'sos' || al.status === 'stale' ? M_ALERT : '#7c4a03', marginTop: 2, fontWeight: 500 }}>{al.msg}</div>
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
                      {selected.sos && (
                        <div style={{ padding: '9px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 10, fontSize: 12, color: '#9b1c10' }}>
                          เหตุ: {selected.sosReason || 'ไม่ระบุ'}
                        </div>
                      )}
                      <div style={{ padding: '9px 12px', borderRadius: 10, background: '#fafaf8', border: '1px solid #ece7da', marginBottom: 10, fontSize: 12 }}>
                        <div style={{ fontFamily: M_MONO, fontSize: 9.5, color: '#5d6b59', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>ข้อมูลฉุกเฉิน</div>
                        <div>ผู้ติดต่อ: {selected.emgName || '—'}{selected.emgPhone && <> · <a href={`tel:${selected.emgPhone.replace(/[^\d+]/g, '')}`} style={{ color: M_BRAND, fontFamily: M_MONO, fontWeight: 700 }}>📞 {selected.emgPhone}</a></>}</div>
                        <div style={{ marginTop: 2 }}>กรุ๊ปเลือด: <span style={{ fontFamily: M_MONO, fontWeight: 700 }}>{selected.bloodType || 'ไม่ได้ระบุไว้'}</span></div>
                        <div style={{ marginTop: 2 }}>โรคประจำตัว: {selected.medical || 'ไม่ได้ระบุไว้'}</div>
                      </div>
                      {selected.sos && (
                        <button onClick={() => clearSos(selected.id)} style={{ width: '100%', padding: 10, marginBottom: 8, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, fontFamily: M_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer' }}>
                          ✓ รับทราบ · ปิดสัญญาณ SOS
                        </button>
                      )}
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
                Elevation profile · ภาพรวมเส้นทาง {overviewLabel} · {displays.length} นักวิ่ง
              </div>
              {overviewProfile && (
                <svg viewBox={`0 0 ${overviewProfile.w} ${overviewProfile.h}`} style={{ width: '100%', height: 180, display: 'block' }}>
                  {overviewProfile.yTicks.map((ele, i) => (
                    <g key={i}>
                      <line x1={overviewProfile.padL} y1={overviewProfile.y(ele)} x2={overviewProfile.w - 6} y2={overviewProfile.y(ele)} stroke="#5d6b59" strokeWidth="1" strokeDasharray="2 3" opacity="0.3"/>
                      <text x={overviewProfile.padL - 6} y={overviewProfile.y(ele) + 3} textAnchor="end" fontFamily={M_MONO} fontSize="9" fill="#5d6b59">{ele}m</text>
                    </g>
                  ))}
                  <path d={overviewProfile.d} fill="oklch(0.9 0.03 145 / 0.5)" stroke="#1f4d39" strokeWidth="1.4"/>
                  {[[0, 'START'], ...checkpointsRef.current.map(cp => [parseFloat(cp.km) || 0, cp.label]), [overviewProfile.totalKm, 'FINISH']].map(([km, label], i) => (
                    <g key={i}>
                      <line x1={overviewProfile.x(km)} y1={8} x2={overviewProfile.x(km)} y2={overviewProfile.baseY} stroke="#2d6a4f" strokeWidth="1" strokeDasharray="2 3" opacity="0.5"/>
                      <text x={overviewProfile.x(km)} y={overviewProfile.h - 20} textAnchor="middle" fontFamily={M_MONO} fontSize="9" fill="#5d6b59">{label}</text>
                      <text x={overviewProfile.x(km)} y={overviewProfile.h - 6} textAnchor="middle" fontFamily={M_MONO} fontSize="8.5" fill="#5d6b59" opacity="0.75">{km.toFixed(1)}K</text>
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

        {dashView === 'ranking' && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 560 }}>
            <div style={{ display: 'flex', gap: 8, padding: '16px 20px 12px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #d8d2c2' }}>
              <span style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginRight: 6 }}>นักวิ่งทั้งหมด · {counts.total}</span>
              {[null, ...distLabels].map(d => (
                <button key={d || 'all'} onClick={() => setDistFilter(d)} style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${distFilter === d ? M_BRAND : '#d8d2c2'}`, background: distFilter === d ? M_BRAND : '#fff', color: distFilter === d ? '#fff' : '#1f2a1c', fontFamily: M_MONO, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{d || 'ทั้งหมด'}</button>
              ))}
              <span style={{ width: 1, height: 18, background: '#d8d2c2' }}/>
              {[[null, 'ทั้งหมด'], ['m', 'ชาย'], ['f', 'หญิง']].map(([v, label]) => (
                <button key={label} onClick={() => setRankGender(v)} style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${rankGender === v ? M_BRAND : '#d8d2c2'}`, background: rankGender === v ? M_BRAND : '#fff', color: rankGender === v ? '#fff' : '#1f2a1c', fontFamily: M_MONO, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
              ))}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือเลข BIB" style={{ marginLeft: 'auto', padding: '7px 10px', border: '1px solid #e5e0d3', borderRadius: 10, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: M_MONO, fontSize: 11.5, width: 200 }}/>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#fff' }}>
                    {['อันดับ', 'นักวิ่ง', 'ระยะ', 'ความคืบหน้า', 'เวลาที่วิ่ง', 'เพศ', 'เพซ', 'ความชัน', 'เช็คพอยท์ล่าสุด', 'สถานะ'].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: i === 0 || i === 9 ? '9px 20px' : '9px 14px', fontFamily: M_MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5d6b59', borderBottom: '1px solid #d8d2c2' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankRows.map(rk => (
                    <React.Fragment key={rk.bib}>
                      {rk.firstInGroup && <tr><td colSpan={10} style={{ padding: '10px 20px 4px', fontFamily: M_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', fontWeight: 700, background: '#faf8f2' }}>ระยะ {rk.groupLabel}</td></tr>}
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
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12, fontWeight: 600 }}>{fmtElapsed(rk.elapsedMs)}</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 11, fontWeight: 700, color: rk.gender === 'f' ? '#b3467c' : rk.gender === 'm' ? '#3a86c4' : '#5d6b59' }}>{rk.gender === 'f' ? 'หญิง' : rk.gender === 'm' ? 'ชาย' : '—'}</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12 }}>{rk.pace}/km</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12, fontWeight: 600, color: rk.gradColor }}>{rk.gradArrow} {rk.gradStr}</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 10.5, color: '#5d6b59', whiteSpace: 'nowrap' }}>
                          {rk.checkinTimes.length ? (() => { const last = rk.checkinTimes[rk.checkinTimes.length - 1]; return `${last.label} ${last.t}`; })() : '—'}
                        </td>
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

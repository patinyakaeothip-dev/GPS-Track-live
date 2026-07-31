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

// Runner dots used to jump instantly to each new position, which reads as
// choppy/laggy even when pings are actually arriving on time — sliding a
// marker smoothly from its old spot to the new one over a beat makes the
// whole map feel far more "live" without changing how often data actually
// updates. Cancels any in-flight animation on the same marker before
// starting a new one so a fast run of updates doesn't fight itself.
function animateMarkerTo(marker, lat, lon, duration = 900) {
  const from = marker.getLatLng();
  if (marker._animFrame) { cancelAnimationFrame(marker._animFrame); marker._animFrame = null; }
  if (!from) { marker.setLatLng([lat, lon]); return; }
  if (from.lat === lat && from.lng === lon) return;
  const fromLat = from.lat, fromLon = from.lng;
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    marker.setLatLng([fromLat + (lat - fromLat) * ease, fromLon + (lon - fromLon) * ease]);
    marker._animFrame = t < 1 ? requestAnimationFrame(step) : null;
  }
  marker._animFrame = requestAnimationFrame(step);
}

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
// Thresholds are cumulative meters climbed, not a % gradient.
function gainColor(m) { return m < 100 ? M_BRAND : m < 300 ? M_WARN : M_ALERT; }
function fmtAgo(sec) { return sec < 60 ? `${Math.round(sec)} วิที่แล้ว` : `${Math.floor(sec / 60)} นาทีที่แล้ว`; }
// A runner's chip time is never allowed to be better than the official gun
// time — if they scanned start early (crowding, a mis-scan, whatever), their
// effective start clamps up to the gun time instead of giving them a head
// start no one else got. A late scan (queue at the mat) is unaffected and
// still uses their own actual scan time, which is the whole point of chip
// time over gun time in the first place.
function effectiveStartMs(startMs, gunMs) {
  if (startMs == null) return startMs;
  return (gunMs != null && startMs < gunMs) ? gunMs : startMs;
}
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
    dns: { label: 'DNS · ไม่ได้เริ่ม', bg: '#ede7d8', fg: '#5d6b59' },
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
  if (r.status === 'dns') return M_REST;
  if (r.status === 'finished') return M_BRAND;
  return (distColor || M_DIST)[r.distance] || '#5d6b59';
}

// Pan by dragging (one finger/mouse), zoom by pinch (two fingers) or the
// mouse wheel — same pattern as the runner app's Route-tab elevation chart
// (mobile-app.jsx's ElevationSvg), so the RD can zoom into a busy stretch
// of course instead of squinting at 220 samples spread over the whole race.
function LiveElevationSvg({ geo, coursePaths, distance, checkpoints, displays, selectedBib, onSelectBib, focusBib }) {
  const w = 1100, h = 170, padL = 44, padR = 6, padT = 14, padB = 34;
  const pts = coursePaths[distance];
  const totalKm = pts[pts.length - 1].km;

  const [zoom, setZoom] = mS(1);
  const [panKm, setPanKm] = mS(0);
  const [hoverBib, setHoverBib] = mS(null);
  const pointers = mR(new Map());
  const pinchStart = mR(null); // { dist, zoom }
  const dragStart = mR(null); // { x, panKm }
  const svgRef = mR(null);

  const visibleKm = totalKm / zoom;
  const clampPan = p => Math.max(0, Math.min(Math.max(0, totalKm - visibleKm), p));
  const x = km => padL + ((km - panKm) / visibleKm) * (w - padL - padR);

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
    const anchorKm = panKm + Math.max(0, (svgX - padL) / (w - padL - padR)) * visibleKm;
    zoomAround(zoom * (e.deltaY < 0 ? 1.25 : 1 / 1.25), anchorKm);
  }
  // React attaches onWheel as a passive native listener by default (since
  // v17), which silently defeats e.preventDefault() above — the page still
  // scrolls even though the handler runs. Attach a real non-passive
  // listener instead so zooming the chart doesn't also scroll the page.
  mE(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, panKm, visibleKm]);
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
      const dxKm = ((e.clientX - dragStart.current.x) / rect.width) * w / (w - padL - padR) * visibleKm;
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

  const N = 400;
  const sample = mM(() => {
    const out = [];
    for (let i = 0; i <= N; i++) out.push(geo.pointAtKm(pts, totalKm * i / N));
    return out;
  }, [pts, totalKm]);
  const eles = sample.map(p => p.ele);
  const minE = Math.min(...eles) - 15, maxE = Math.max(...eles) + 15;
  const y = ele => padT + (h - padT - padB) * (1 - (ele - minE) / (maxE - minE));
  const baseY = y(minE);
  let d = `M ${x(0)} ${baseY} L ${x(0)} ${y(sample[0].ele)}`;
  sample.forEach(p => { d += ` L ${x(p.km)} ${y(p.ele)}`; });
  d += ` L ${x(totalKm)} ${baseY} Z`;
  // 4 evenly spaced elevation labels for the Y axis, rounded to whole
  // meters — actual course elevation, not just a relative silhouette.
  const yTicks = Array.from({ length: 4 }, (_, i) => Math.round(minE + 15 + (maxE - 15 - (minE + 15)) * i / 3));
  const marks = [[0, 'START'], ...checkpoints.map(cp => [parseFloat(cp.km) || 0, cp.label]), [totalKm, 'FINISH']];

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 180, display: 'block', touchAction: 'none', cursor: zoom > 1 ? 'grab' : 'default' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {yTicks.map((ele, i) => (
          <g key={i}>
            <line x1={padL} y1={y(ele)} x2={w - padR} y2={y(ele)} stroke="#5d6b59" strokeWidth="1" strokeDasharray="2 3" opacity="0.3"/>
            <text x={padL - 6} y={y(ele) + 3} textAnchor="end" fontFamily={M_MONO} fontSize="9" fill="#5d6b59">{ele}m</text>
          </g>
        ))}
        <path d={d} fill="oklch(0.9 0.03 145 / 0.5)" stroke="#1f4d39" strokeWidth="1.4"/>
        {marks.map(([km, label], i) => (
          <g key={i}>
            <line x1={x(km)} y1={8} x2={x(km)} y2={baseY} stroke="#2d6a4f" strokeWidth="1" strokeDasharray="2 3" opacity="0.5"/>
            <text x={x(km)} y={h - 20} textAnchor="middle" fontFamily={M_MONO} fontSize="9" fill="#5d6b59">{label}</text>
            <text x={x(km)} y={h - 6} textAnchor="middle" fontFamily={M_MONO} fontSize="8.5" fill="#5d6b59" opacity="0.75">{km.toFixed(1)}K</text>
          </g>
        ))}
        {displays.map(dd => {
          const dimmed = focusBib != null && focusBib !== dd.bib;
          return (
            <circle key={dd.bib} cx={x(dd.physKm)} cy={y(dd.ele)} r={selectedBib === dd.bib ? 8 : 4.5}
              fill={dd.color} stroke="#fff" strokeWidth={selectedBib === dd.bib ? 2.5 : 1} opacity={dimmed ? 0.2 : 1}
              onClick={() => onSelectBib(dd.bib)} onMouseEnter={() => setHoverBib(dd.bib)} onMouseLeave={() => setHoverBib(h => h === dd.bib ? null : h)}
              style={{ cursor: 'pointer', transition: 'cx 0.6s ease, cy 0.6s ease' }}/>
          );
        })}
      </svg>
      {zoom > 1.02 && (
        <div onClick={resetZoom} style={{ position: 'absolute', top: 4, right: 4, padding: '3px 8px', background: '#fff', border: '1px solid #d8d2c2', borderRadius: 999, fontFamily: M_MONO, fontSize: 9.5, color: '#5d6b59', cursor: 'pointer', boxShadow: '0 1px 3px rgba(31,42,28,0.1)' }}>↺ รีเซ็ตซูม</div>
      )}
      {hoverBib && (() => {
        const dd = displays.find(r => r.bib === hoverBib);
        if (!dd) return null;
        const leftPct = (x(dd.physKm) / w) * 100;
        return (
          <div style={{ position: 'absolute', left: `${leftPct}%`, top: `${(y(dd.ele) / h) * 100}%`, transform: 'translate(-50%, -130%)',
            background: '#1f2a1c', color: '#fff', padding: '5px 9px', borderRadius: 8, fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)', zIndex: 5 }}>
            <div style={{ fontWeight: 700 }}>#{dd.bib} {dd.name}</div>
            <div style={{ fontFamily: M_MONO, fontSize: 10, opacity: 0.85 }}>{dd.km.toFixed(1)}K · {dd.pace}/km</div>
          </div>
        );
      })()}
    </div>
  );
}

// Live Monitor itself stays fully public (anyone with the link can watch
// the race) — but "รับทราบ · ปิดสัญญาณ SOS" actually writes real state
// (silencing a runner's active SOS) and had no gate on it at all: anyone
// who opened this page, staff or not, could clear someone else's
// emergency signal with one misclick. Only the actions that write
// something get locked behind the same Admin allowlist admin-app.jsx
// already uses — viewing stays open to everyone.
const M_ADMIN_EMAILS = ['patinya.kaeothip@gmail.com'];
function useIsAdmin() {
  const [isAdmin, setIsAdmin] = mS(false);
  mE(() => {
    if (!window.fb) return;
    return window.fb.onAuthChange(u => setIsAdmin(!!u && M_ADMIN_EMAILS.includes(u.email)));
  }, []);
  return isAdmin;
}

function LiveMonitorApp() {
  const isAdmin = useIsAdmin();
  const [ready, setReady] = mS(false);
  const [selectedBib, setSelectedBib] = mS(null);
  const [dashView, setDashView] = mS('map'); // 'map' | 'ranking'
  const [distFilter, setDistFilter] = mS(null);
  const [showLabels, setShowLabels] = mS(false);
  // Everything below was laid out for a wide RD desktop/tablet screen — a
  // fixed-width sidebar next to the map, a 4-across stats row, an
  // absolutely-positioned legend overlay — none of which fit a phone
  // viewport. Rather than retrofit CSS media queries onto an inline-style
  // codebase, track viewport width directly and swap layout values in JS,
  // same pattern as everywhere else in this file.
  const [isMobile, setIsMobile] = mS(() => window.innerWidth < 780);
  const [legendOpen, setLegendOpen] = mS(false);
  mE(() => {
    const onResize = () => setIsMobile(window.innerWidth < 780);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [events, setEvents] = mS(() => (window.eventStore ? window.eventStore.loadEvents() : []));
  mE(() => {
    const refresh = () => setEvents(window.eventStore.loadEvents());
    window.addEventListener('trt:events-updated', refresh);
    return () => window.removeEventListener('trt:events-updated', refresh);
  }, []);
  const [eventId, setEventId] = mS(() => {
    const list = window.eventStore ? window.eventStore.loadEvents() : [];
    const withStatus = list.map(ev => ({ ev, status: window.eventStatus.computeStatus(ev) }));
    const byDateAsc = (a, b) => (a.ev.raceDateISO || '').localeCompare(b.ev.raceDateISO || '');
    // Prefer a currently-live event, then the soonest upcoming one, and
    // only fall back to the most recent past event if there's nothing else
    // — opening Live Monitor shouldn't dump the RD on old, already-over
    // races by default.
    const live = withStatus.find(x => x.status === 'live');
    const upcoming = withStatus.filter(x => x.status === 'upcoming').sort(byDateAsc)[0];
    const past = withStatus.filter(x => x.status === 'past').sort((a, b) => -byDateAsc(a, b))[0];
    const pick = live || upcoming || past || withStatus[0];
    return (pick && pick.ev && pick.ev.id) || null;
  });
  const selectedEvent = events.find(e => e.id === eventId) || null;
  // The event picker used to just list events in raw creation order —
  // fine with two or three events, unusable once old/finished ones pile
  // up alongside the ones actually worth switching to. Live sorts first,
  // then upcoming soonest-first, then past most-recent-first at the
  // bottom, grouped visually via <optgroup> so "still relevant" and
  // "already over" are never confused for each other in the list.
  const eventGroups = mM(() => {
    const withStatus = events.map(ev => ({ ev, status: window.eventStatus.computeStatus(ev) }));
    const byDateAsc = (a, b) => (a.ev.raceDateISO || '').localeCompare(b.ev.raceDateISO || '');
    const active = withStatus.filter(x => x.status === 'live' || x.status === 'upcoming')
      .sort((a, b) => (a.status === b.status ? byDateAsc(a, b) : (a.status === 'live' ? -1 : 1)))
      .map(x => x.ev);
    const past = withStatus.filter(x => x.status === 'past')
      .sort((a, b) => -byDateAsc(a, b))
      .map(x => x.ev);
    return { active, past };
  }, [events]);
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
  const courseLayerRef = mR(null);

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
  // At full field size (100+ runners all pinging independently), the raw
  // Firestore listener can fire many times a second — applying every single
  // one straight to state would re-render the whole 150-row map/ranking
  // dashboard that often. Throttle to at most once every 2s: the freshest
  // snapshot is always applied, just not more often than that, so the RD's
  // screen stays responsive without the GPS dots feeling delayed.
  const pendingLiveRef = mR(null);
  const liveThrottleRef = mR(null);
  mE(() => {
    if (!eventId || !window.fb) { setLivePosByBib({}); return; }
    const prefix = `${eventId}_`;
    const unsub = window.fb.watchCollection('livePos', all => {
      const next = {};
      all.forEach(p => { if (p.id.startsWith(prefix)) next[p.id.slice(prefix.length)] = p; });
      pendingLiveRef.current = next;
      if (liveThrottleRef.current) return;
      liveThrottleRef.current = setTimeout(() => {
        liveThrottleRef.current = null;
        setLivePosByBib(pendingLiveRef.current);
      }, 2000);
    });
    return () => {
      unsub();
      if (liveThrottleRef.current) { clearTimeout(liveThrottleRef.current); liveThrottleRef.current = null; }
    };
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
  // Just for the gun-time clock in the header to visibly tick — everything
  // else on this page already re-renders often enough on its own.
  const [clockNow, setClockNow] = mS(() => Date.now());
  mE(() => {
    const id = setInterval(() => setClockNow(Date.now()), 1000);
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
    const L = window.L;
    const geo = geoRef.current, coursePaths = coursePathsRef.current;
    const cOverview = coursePaths[overviewLabelRef.current];
    const bounds = L.latLngBounds(geo.coursePolylineLatLngs(cOverview));
    const map = L.map(mapHostRef.current, { zoomControl: false, attributionControl: false }).fitBounds(bounds, { padding: [24, 24] });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markersRef.current.clear(); courseLayerRef.current = null; };
  // Also re-run when showDashboard flips true: for an "upcoming" event the
  // course/runner data (ready) usually finishes loading *before* the RD
  // clicks "ดูแผนที่ / เส้นทาง" (see #69's preview gate), so the map's host
  // <div> doesn't exist in the DOM yet at the moment `ready` becomes true —
  // this effect would bail out via the mapHostRef.current guard and never
  // fire again, leaving the map container permanently empty even after the
  // preview button mounts it. Re-running once the container actually exists
  // fixes that without touching the guard itself.
  }, [ready, showDashboard]);

  // Draws the course polyline + START/checkpoint/FINISH markers for
  // whichever distance is currently selected (distFilter), falling back to
  // the overview/longest distance when "ทุกระยะ" is picked — separate from
  // map creation above so switching distances redraws just this layer
  // instead of tearing down and rebuilding the whole Leaflet map. distFilter
  // used to only ever affect the Ranking table; the course shown here was
  // always the single longest distance regardless, so a course uploaded for
  // a shorter distance never had anywhere to actually be seen.
  mE(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const L = window.L, geo = geoRef.current, coursePaths = coursePathsRef.current, checkpoints = checkpointsRef.current;
    const label = distFilter || overviewLabelRef.current;
    const course = coursePaths[label] || coursePaths[overviewLabelRef.current];
    if (courseLayerRef.current) { map.removeLayer(courseLayerRef.current); courseLayerRef.current = null; }
    const group = L.layerGroup().addTo(map);
    const latlngs = geo.coursePolylineLatLngs(course);
    L.polyline(latlngs, { color: '#1f4d39', weight: 4, opacity: 0.8 }).addTo(group);
    [[0, 'START'], ...checkpoints.map(cp => [parseFloat(cp.km) || 0, cp.label]), [course[course.length - 1].km, 'FINISH']]
      .forEach(([km, cpLbl]) => {
        const p = geo.pointAtKm(course, km);
        L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html:
          `<div style="padding:2px 7px;background:#2d6a4f;color:#fff;border-radius:7px;font:600 10px 'JetBrains Mono',monospace;letter-spacing:0.04em;white-space:nowrap;transform:translate(-50%,-130%)">${cpLbl}</div>`,
          iconSize: [0, 0] }) }).addTo(group);
      });
    courseLayerRef.current = group;
    map.flyToBounds(L.latLngBounds(latlngs), { padding: [24, 24], duration: 0.4 });
  }, [ready, showDashboard, distFilter]);

  mE(() => { if (mapRef.current && dashView === 'map') setTimeout(() => mapRef.current.invalidateSize(), 60); }, [dashView]);

  function recenter() {
    const map = mapRef.current;
    if (!map || !geoRef.current) return;
    if (selectedBib && markersRef.current.has(selectedBib)) {
      map.flyTo(markersRef.current.get(selectedBib).getLatLng(), 15, { duration: 0.5 });
    } else {
      const label = distFilter || overviewLabelRef.current;
      const bounds = window.L.latLngBounds(geoRef.current.coursePolylineLatLngs(coursePathsRef.current[label] || coursePathsRef.current[overviewLabelRef.current]));
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
  // Whichever distance's course is actually being shown on the map/
  // elevation right now — the selected distFilter chip, or the overview
  // (longest) course when "ทุกระยะ" is picked.
  const viewLabel = distFilter || overviewLabel;
  // Official gun time for whichever distance is currently being viewed —
  // falls back to the event's earliest gun time across all distances when
  // that distance has no schedule of its own yet.
  const viewGunMs = mM(() => {
    const distDef = (selectedEvent && selectedEvent.distances || []).find(d => d.label === viewLabel);
    const t = distDef && distDef.cpTimes && distDef.cpTimes.start;
    const ms = t && checkinMs(selectedEvent, t);
    return ms || (earliestStart && earliestStart.getTime()) || null;
  }, [selectedEvent, viewLabel, earliestStart]);

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
      // Once this distance's own finish cutoff passes without a finish
      // scan: someone who checked in somewhere (started, didn't make it
      // back in time) is a DNF; someone who never checked in at all is a
      // DNS (never actually started) — instead of sitting as "active"/
      // "ยังไม่เริ่ม" forever with no real outcome, or (the original bug)
      // an elapsed clock that just kept climbing off Date.now() forever.
      const distDef = (selectedEvent && selectedEvent.distances || []).find(d => d.label === r.distance);
      const cutoffMs = distDef && distDef.cpTimes && checkinMs(selectedEvent, distDef.cpTimes.finish);
      const overCutoff = !!(cutoffMs && Date.now() > cutoffMs);
      const baseStatus = r.dnf ? 'dnf'
        : finishCk ? 'finished'
        : (overCutoff && !cks.length) ? 'dns'
        : (overCutoff && cks.length) ? 'dnf'
        : cks.length ? 'active' : 'not_started';
      const km = Math.min(r.progressKm || 0, totalKm - (baseStatus === 'finished' ? 0 : 0.02));
      const p = geo.pointAtKm(pts, Math.max(0, km));
      const gain = geo.cumulativeGainToKm(pts, Math.max(0, km));

      const rawStartMs = startCk ? checkinMs(selectedEvent, startCk.t) : null;
      const gunMs = distDef && distDef.cpTimes && checkinMs(selectedEvent, distDef.cpTimes.start);
      const startMs = effectiveStartMs(rawStartMs, gunMs);
      // Cap the live-ticking end at this distance's own finish cutoff once
      // it's passed without a finish scan, rather than off Date.now() —
      // same reasoning as the DNF/DNS reclassification above.
      const endMs = finishCk ? checkinMs(selectedEvent, finishCk.t) : (overCutoff ? cutoffMs : Date.now());
      const pace = (startMs != null && km > 0 && endMs > startMs) ? ((endMs - startMs) / 60000) / km : null;
      // Elapsed time since start — live-ticking for runners still on course
      // (frozen at finish once they're done, or at cutoff once they've
      // timed out without finishing), plus the checkpoint times themselves,
      // both for the Ranking table. Chip time: clamped to never start
      // before the official gun (effectiveStartMs above).
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
      // The elevation chart's dot used to always project the checkpoint-
      // interpolated point (p.lat/p.lon) onto the course, ignoring a live
      // GPS fix entirely — so it sat frozen at the last checkpoint's km
      // while the map above it correctly tracked GPS. Project from the same
      // GPS-preferred position the map uses instead.
      const physKm = geo.nearestKmOnTrack(coursePaths[viewLabel] || coursePaths[overviewLabel], mapLat, mapLon);
      return { bib: r.bib, id: r.id, name: r.nickname, distance: r.distance, gender: r.gender,
        color: colorFor({ status, distance: r.distance }, distColor),
        initial: (r.nickname || '?').slice(0, 1), lat: mapLat, lon: mapLon, gpsLive, km, totalKm,
        pct: Math.min(100, (km / totalKm) * 100),
        pace: fmtPace(pace),
        gradStr: started ? `+${gain} m` : '—',
        gradColor: started ? gainColor(gain) : '#5d6b59',
        ele: p.ele, ago: lastAtMs != null ? fmtAgo((Date.now() - lastAtMs) / 1000) : '—',
        elapsedMs, endMs, checkinTimes,
        sos: !!r.sos, sosReason: r.sosReason || '',
        emgName: r.emgName || '', emgPhone: r.emgPhone || '', emgName2: r.emgName2 || '', emgPhone2: r.emgPhone2 || '', bloodType: r.bloodType || '', medical: r.medical || '',
        avatarPhoto: r.avatarPhoto || '',
        status, statusLabel: meta.label, statusBg: meta.bg, statusFg: meta.fg, physKm };
    });
  }, [ready, runners, coursePaths, overviewLabel, viewLabel, distColor, selectedEvent, livePosByBib, offRouteTick]);

  // Keep Leaflet markers in sync with real roster updates (a QR scan moves
  // someone) instead of only ever creating them once at map init. Filtered
  // to the currently-viewed distance — same distFilter chip the Ranking
  // tab already uses — so switching to one distance's course doesn't leave
  // every other distance's runners cluttering a map that's now zoomed into
  // a completely different, unrelated course.
  const mapDisplays = mM(() => distFilter ? displays.filter(d => d.distance === distFilter) : displays, [displays, distFilter]);
  mE(() => {
    const map = mapRef.current, L = window.L;
    if (!map) return;
    const seen = new Set();
    mapDisplays.forEach(d => {
      seen.add(d.bib);
      const dimmed = focusBib != null && focusBib !== d.bib;
      let m = markersRef.current.get(d.bib);
      // Overlapping dots (several runners near the same physical point)
      // used to bury whichever one happened to render first — clicking a
      // name/bib to select a runner now also pins their label open and
      // raises their dot above the others at that spot, same way focus
      // mode already dims the rest.
      const isSelected = d.bib === selectedBib;
      const permanent = showLabels || isSelected;
      if (!m) {
        m = L.circleMarker([d.lat, d.lon], { radius: 7, color: '#fff', weight: 2, fillColor: d.color, fillOpacity: dimmed ? 0.15 : 1, opacity: dimmed ? 0.15 : 1 }).addTo(map);
        m.bindTooltip(`#${d.bib} ${d.name}`, { direction: 'top', offset: [0, -8], permanent });
        m.on('click', () => { setSelectedBib(d.bib); setFocusBib(null); });
        markersRef.current.set(d.bib, m);
      } else {
        animateMarkerTo(m, d.lat, d.lon);
        m.setStyle({ fillColor: d.color, fillOpacity: dimmed ? 0.15 : 1, opacity: dimmed ? 0.15 : 1 });
        // Leaflet tooltips can't flip permanent/hover mode in place —
        // rebind whenever the "show all labels"/selected state changes so
        // the label stays pinned open (or goes back to hover-only)
        // instead of just newly-created markers.
        m.unbindTooltip();
        m.bindTooltip(`#${d.bib} ${d.name}`, { direction: 'top', offset: [0, -8], permanent });
      }
      if (isSelected) m.bringToFront();
    });
    markersRef.current.forEach((m, bib) => {
      if (!seen.has(bib)) { map.removeLayer(m); markersRef.current.delete(bib); }
    });
  }, [mapDisplays, focusBib, showLabels, selectedBib]);

  const byBib = mM(() => Object.fromEntries(displays.map(d => [d.bib, d])), [displays]);
  const selected = selectedBib ? byBib[selectedBib] : null;

  // SOS always sorts first regardless of how long ago it came in — it's
  // the one alert that needs eyes on it immediately.
  const alerts = mM(() => displays.filter(d => d.status === 'sos' || d.status === 'off_route' || d.status === 'stale' || d.status === 'dnf')
    .map(d => ({ ...d, msg: d.status === 'sos' ? `🆘 ${d.sosReason || 'ขอความช่วยเหลือ'} · ${d.km.toFixed(1)}/${d.totalKm.toFixed(1)}K`
      : d.status === 'off_route' ? `⚠ ออกนอกเส้นทางมากกว่า ${OFF_ROUTE_ALERT_MIN} นาที · ใกล้ ${d.km.toFixed(1)}K`
      : d.status === 'stale' ? `ไม่มีความเคลื่อนไหว · จุดล่าสุด ${d.km.toFixed(1)}K` : `ถอนตัว (DNF) · ${d.km.toFixed(1)}/${d.totalKm.toFixed(1)}K` }))
    .sort((a, b) => (a.status === 'sos' ? 0 : 1) - (b.status === 'sos' ? 0 : 1)), [displays]);
  // Split out for the sidebar's own dedicated SOS banner — it used to just
  // sit sorted first inside one shared alerts list, distinguished only by
  // a slightly darker red tint, easy to miss glancing at a busy list next
  // to off-route/no-signal noise. SOS is the one that can't wait.
  const sosAlerts = mM(() => alerts.filter(a => a.status === 'sos'), [alerts]);
  const otherAlerts = mM(() => alerts.filter(a => a.status !== 'sos'), [alerts]);

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
    // Finished runners all sit at pct 100 — sorting on that alone left
    // their order among each other arbitrary (array order) instead of who
    // actually finished first. Placement for finishers is by arrival order
    // (endMs, their finish check-in time), same policy Results uses (see
    // results/index.html) — still finished-first, then progress for
    // everyone still out on course.
    return distLabels.filter(ds => byDist[ds]).flatMap(ds =>
      byDist[ds].slice().sort((a, b) => (a.status === 'finished') === (b.status === 'finished')
        ? (a.status === 'finished' ? (a.endMs || 0) - (b.endMs || 0) : b.pct - a.pct)
        : (a.status === 'finished' ? -1 : 1)
      ).map((d, i) => ({ ...d, rank: i + 1, medal: medal(i + 1), firstInGroup: i === 0, groupLabel: ds })));
  }, [displays, distFilter, rankGender, search, distLabels]);

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: isMobile ? '14px 8px 40px' : '24px 20px 60px', fontFamily: "'Plus Jakarta Sans','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif", color: '#1f2a1c' }}>
      <div style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1f2a1c', fontWeight: 600, marginBottom: 14, padding: isMobile ? '0 6px' : 0 }}>🖥 Race Director · Live Map Dashboard</div>

      <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: isMobile ? 0 : 14, boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap', padding: isMobile ? '12px 14px' : '14px 22px', borderBottom: '1px solid #d8d2c2', gap: isMobile ? 10 : 16 }}>
          <div style={{ width: isMobile ? 40 : 54, height: isMobile ? 40 : 54, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="assets/rayong-trail-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}/>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: M_MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5d6b59', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedEvent ? selectedEvent.name : 'Rayong Trail'}</div>
            <div style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: isMobile ? 14.5 : 17, fontWeight: 600, color: '#1f4d39' }}>Live GPS Monitor</div>
          </div>
          {events.length > 0 && (
            <select value={eventId || ''} onChange={e => { setEventId(e.target.value); setPreviewOpen(false); }} style={{
              padding: '6px 10px', border: '1px solid #e5e0d3', borderRadius: 6, background: '#fff',
              fontFamily: M_MONO, fontSize: 11, color: '#1f2a1c', maxWidth: isMobile ? '100%' : 260,
              width: isMobile ? '100%' : 'auto', order: isMobile ? 4 : 0 }}>
              {eventGroups.active.length > 0 && (
                <optgroup label="🔴 กำลังแข่ง / จะมาถึง">
                  {eventGroups.active.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name} · {ev.date}</option>
                  ))}
                </optgroup>
              )}
              {eventGroups.past.length > 0 && (
                <optgroup label="✓ ผ่านมาแล้ว">
                  {eventGroups.past.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name} · {ev.date}</option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {!isMobile && <div style={{ flex: 1 }}/>}
          {viewGunMs && selectedStatus !== 'past' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', padding: isMobile ? '4px 0' : '4px 12px', borderRight: isMobile ? 'none' : '1px solid #e5e0d3' }}>
              <span style={{ fontFamily: M_MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59' }}>Gun time · {viewLabel}</span>
              <span style={{ fontFamily: M_MONO, fontSize: 14, fontWeight: 700, color: clockNow >= viewGunMs ? '#1f4d39' : '#7c4a03', fontVariantNumeric: 'tabular-nums' }}>
                {clockNow >= viewGunMs ? `+${fmtElapsed(clockNow - viewGunMs)}` : `-${fmtElapsed(viewGunMs - clockNow)}`}
              </span>
            </div>
          )}
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
            <a href={`results/?event=${encodeURIComponent(selectedEvent.id)}`} style={{ display: 'inline-block', marginTop: 16, padding: '10px 18px', background: M_BRAND, color: '#fff', textDecoration: 'none', borderRadius: 8, fontFamily: M_MONO, fontSize: 12, fontWeight: 700 }}>📊 ไปหน้า Results →</a>
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
        <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, borderBottom: '1px solid #d8d2c2' }}>
          {[['ทั้งหมด', counts.total, '#1f2a1c'], ['กำลังวิ่ง', counts.on, '#1f2a1c'], ['เข้าเส้นชัย', counts.finished, M_BRAND], ['Alerts', counts.alert, counts.alert ? M_ALERT : '#1f2a1c']].map(([label, value, color], i) => (
            <div key={i} style={{ flex: isMobile ? undefined : 1, padding: isMobile ? '10px 14px' : '12px 18px', borderRight: isMobile ? (i % 2 === 0 ? '1px solid #d8d2c2' : 'none') : '1px solid #d8d2c2', borderBottom: isMobile && i < 2 ? '1px solid #d8d2c2' : 'none' }}>
              <div style={{ fontFamily: M_MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 500, letterSpacing: '-0.02em', color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, padding: isMobile ? '10px 10px' : '10px 18px', borderBottom: '1px solid #d8d2c2', background: '#faf8f2', overflowX: isMobile ? 'auto' : 'visible' }}>
          {[null, ...distLabels].map(d => (
            <div key={d || 'all'} onClick={() => setDistFilter(d)} style={{ padding: '7px 14px', borderRadius: 8, flexShrink: 0,
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
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', minHeight: isMobile ? 'auto' : 560 }}>
              <div style={{ position: 'relative', borderRight: isMobile ? 'none' : '1px solid #d8d2c2', borderBottom: isMobile ? '1px solid #d8d2c2' : 'none' }}>
                {isMobile ? (
                  <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 400 }}>
                    <button onClick={() => setLegendOpen(v => !v)} style={{ width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.95)', border: '1px solid #d8d2c2', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', cursor: 'pointer', fontSize: 14 }}>🎨</button>
                    {legendOpen && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,0.95)', padding: '8px 12px', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                        {[...distLabels.map(l => [l, distColor[l]]), ['ออกนอกเส้นทาง', M_WARN], ['ขาดการติดต่อ', M_ALERT]].map(([label, color]) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }}/>
                            <span style={{ fontFamily: M_MONO, fontSize: 10, color: '#5d6b59', whiteSpace: 'nowrap' }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 400, display: 'flex', gap: 16, background: 'rgba(255,255,255,0.92)', padding: '6px 12px', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    {[...distLabels.map(l => [l, distColor[l]]), ['ออกนอกเส้นทาง', M_WARN], ['ขาดการติดต่อ', M_ALERT]].map(([label, color]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: color }}/>
                        <span style={{ fontFamily: M_MONO, fontSize: 10, color: '#5d6b59' }}>{label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!ready && <div style={{ width: '100%', height: isMobile ? 320 : 560, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5d6b59', fontFamily: M_MONO, fontSize: 12 }}>กำลังโหลดแผนที่ GPX…</div>}
                <div ref={mapHostRef} style={{ width: '100%', height: isMobile ? 320 : 560, display: ready ? 'block' : 'none' }}/>
                {ready && (
                  <div style={{ position: 'absolute', zIndex: 1000, bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => setShowLabels(v => !v)} title="แสดงชื่อนักวิ่งทั้งหมด"
                      style={{ width: 38, height: 38, borderRadius: 999, background: showLabels ? '#1f4d39' : '#fff', border: '1px solid #d8d2c2', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🏷</button>
                    <button onClick={recenter} style={{ width: 38, height: 38, borderRadius: 999, background: '#fff', border: '1px solid #d8d2c2', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>🎯</button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #d8d2c2', position: 'relative' }}>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือเลข BIB" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e0d3', borderRadius: 10, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: M_MONO, fontSize: 12, boxSizing: 'border-box' }}/>
                  {searchResults.length > 0 && (
                    <div style={{ position: 'absolute', left: 16, right: 16, top: 44, zIndex: 50, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                      {searchResults.map(sr => (
                        <div key={sr.bib} onClick={() => { setSelectedBib(sr.bib); setSearch(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f4f3ef' }}>
                          <LmAvatar size={22} photo={sr.avatarPhoto} color={sr.color} initial={sr.initial}/>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>#{sr.bib} {sr.name}</span>
                          <span style={{ fontFamily: M_MONO, fontSize: 10, color: '#5d6b59', marginLeft: 'auto' }}>{sr.distance}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* SOS gets its own unmistakable block instead of just
                    sitting sorted-first inside the general alerts list —
                    it's the one thing on this whole page that can't wait,
                    and blending in with off-route/no-signal noise made it
                    too easy to miss on a busy race day. */}
                {sosAlerts.length > 0 && (
                  <div style={{ background: '#dc2626' }}>
                    <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, color: '#fff' }}>🆘 SOS — ต้องการความช่วยเหลือ</span>
                      <span style={{ fontFamily: M_MONO, fontSize: 10, color: '#dc2626', background: '#fff', padding: '1px 7px', borderRadius: 6, fontWeight: 800 }}>{sosAlerts.length}</span>
                    </div>
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {sosAlerts.map(al => (
                        <div key={al.bib} onClick={() => setSelectedBib(al.bib)} style={{ padding: '9px 16px', borderTop: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: M_MONO, fontSize: 12, fontWeight: 700, color: '#fff' }}>#{al.bib} {al.name}</span>
                            <span style={{ fontFamily: M_MONO, fontSize: 9.5, color: 'rgba(255,255,255,0.8)' }}>{al.ago}</span>
                          </div>
                          <div style={{ fontSize: 11.5, color: '#fff', marginTop: 2, fontWeight: 600 }}>{al.msg}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ padding: '12px 16px 12px', borderBottom: '1px solid #d8d2c2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Alerts</span>
                  <span style={{ fontFamily: M_MONO, fontSize: 10, color: '#fff', background: M_ALERT, padding: '1px 7px', borderRadius: 6, fontWeight: 600 }}>{otherAlerts.length}</span>
                </div>
                <div style={{ maxHeight: 190, overflowY: 'auto', borderBottom: '1px solid #d8d2c2' }}>
                  {otherAlerts.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#5d6b59', fontSize: 12 }}>ไม่มี alert</div>}
                  {otherAlerts.map(al => (
                    <div key={al.bib} onClick={() => setSelectedBib(al.bib)} style={{ padding: '10px 16px', borderBottom: '1px solid #f4f3ef', cursor: 'pointer',
                      background: al.status === 'stale' ? 'rgba(220,38,38,0.05)' : al.status === 'off_route' ? 'rgba(180,83,9,0.06)' : 'transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: M_MONO, fontSize: 12, fontWeight: 700 }}>#{al.bib} {al.name}</span>
                        <span style={{ fontFamily: M_MONO, fontSize: 9.5, color: '#5d6b59' }}>{al.ago}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: al.status === 'stale' ? M_ALERT : '#7c4a03', marginTop: 2, fontWeight: 500 }}>{al.msg}</div>
                    </div>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                  {!selected && <div style={{ padding: '30px 10px', textAlign: 'center', color: '#5d6b59', fontSize: 12.5, lineHeight: 1.6 }}>แตะนักวิ่งบนแผนที่<br/>เพื่อดูความเร็ว · ความชัน · ระดับความสูง</div>}
                  {selected && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <LmAvatar size={38} photo={selected.avatarPhoto} color={selected.color} initial={selected.initial}/>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
                          <div style={{ fontFamily: M_MONO, fontSize: 10.5, color: '#5d6b59' }}>#{selected.bib} · {selected.distance}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <MiniStat label="ระยะ" value={`${selected.km.toFixed(1)} / ${selected.totalKm.toFixed(1)}K`}/>
                        <MiniStat label="เพซ" value={`${selected.pace}/km`}/>
                        <MiniStat label="ไต่ระดับสะสม" value={selected.gradStr} color={selected.gradColor}/>
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
                        {(selected.emgName2 || selected.emgPhone2) && (
                          <div style={{ marginTop: 2 }}>ผู้ติดต่อ (คนที่ 2): {selected.emgName2 || '—'}{selected.emgPhone2 && <> · <a href={`tel:${selected.emgPhone2.replace(/[^\d+]/g, '')}`} style={{ color: M_BRAND, fontFamily: M_MONO, fontWeight: 700 }}>📞 {selected.emgPhone2}</a></>}</div>
                        )}
                        <div style={{ marginTop: 2 }}>กรุ๊ปเลือด: <span style={{ fontFamily: M_MONO, fontWeight: 700 }}>{selected.bloodType || 'ไม่ได้ระบุไว้'}</span></div>
                        <div style={{ marginTop: 2 }}>โรคประจำตัว: {selected.medical || 'ไม่ได้ระบุไว้'}</div>
                      </div>
                      {selected.sos && (isAdmin ? (
                        <button onClick={() => clearSos(selected.id)} style={{ width: '100%', padding: 10, marginBottom: 8, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, fontFamily: M_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer' }}>
                          ✓ รับทราบ · ปิดสัญญาณ SOS
                        </button>
                      ) : (
                        <button onClick={() => window.fb && window.fb.signInWithGoogle().catch(() => {})} style={{ width: '100%', padding: 10, marginBottom: 8, background: '#fff', color: '#dc2626', border: '1px solid #f0c9c4', borderRadius: 10, fontFamily: M_MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer' }}>
                          🔒 เข้าสู่ระบบเป็น Admin เพื่อรับทราบ SOS
                        </button>
                      ))}
                      <button onClick={toggleFocus} style={{ width: '100%', padding: 10, background: focusBib ? M_BRAND : '#fff', color: focusBib ? '#fff' : M_BRAND, border: '1px solid #2d6a4f', borderRadius: 10, fontFamily: M_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer' }}>
                        {focusBib ? '✕ เลิกโฟกัส · ดูทุกคน' : '🔍 โฟกัสเฉพาะคนนี้บนแผนที่'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: isMobile ? '14px 12px 16px' : '16px 20px 20px', borderTop: '1px solid #d8d2c2' }}>
              <div style={{ fontFamily: M_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d6b59', marginBottom: 8 }}>
                Elevation profile · เส้นทาง {viewLabel}{!distFilter ? ' (ภาพรวม)' : ''} · {mapDisplays.length} นักวิ่ง
              </div>
              {geo && coursePaths && (
                <LiveElevationSvg geo={geo} coursePaths={coursePaths} distance={viewLabel}
                  checkpoints={checkpointsRef.current} displays={mapDisplays}
                  selectedBib={selected && selected.bib} onSelectBib={setSelectedBib} focusBib={focusBib}/>
              )}
            </div>
        </div>

        {dashView === 'ranking' && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: isMobile ? 'auto' : 560 }}>
            <div style={{ display: 'flex', gap: 8, padding: isMobile ? '12px 12px 10px' : '16px 20px 12px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #d8d2c2' }}>
              <span style={{ fontFamily: M_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginRight: 6 }}>นักวิ่งทั้งหมด · {counts.total}</span>
              {[null, ...distLabels].map(d => (
                <button key={d || 'all'} onClick={() => setDistFilter(d)} style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${distFilter === d ? M_BRAND : '#d8d2c2'}`, background: distFilter === d ? M_BRAND : '#fff', color: distFilter === d ? '#fff' : '#1f2a1c', fontFamily: M_MONO, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{d || 'ทั้งหมด'}</button>
              ))}
              <span style={{ width: 1, height: 18, background: '#d8d2c2' }}/>
              {[[null, 'ทั้งหมด'], ['m', 'ชาย'], ['f', 'หญิง']].map(([v, label]) => (
                <button key={label} onClick={() => setRankGender(v)} style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${rankGender === v ? M_BRAND : '#d8d2c2'}`, background: rankGender === v ? M_BRAND : '#fff', color: rankGender === v ? '#fff' : '#1f2a1c', fontFamily: M_MONO, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
              ))}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือเลข BIB" style={{ marginLeft: isMobile ? 0 : 'auto', padding: '7px 10px', border: '1px solid #e5e0d3', borderRadius: 10, boxShadow: '0 1px 3px rgba(31,42,28,0.08)', fontFamily: M_MONO, fontSize: 11.5, width: isMobile ? '100%' : 200 }}/>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: isMobile ? 'auto' : 'visible' }}>
              <table style={{ width: '100%', minWidth: isMobile ? 920 : 'auto', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#fff' }}>
                    {['อันดับ', 'นักวิ่ง', 'ระยะ', 'ความคืบหน้า', 'เวลาที่วิ่ง', 'เพศ', 'เพซ', 'ไต่ระดับสะสม', 'เช็คพอยท์ล่าสุด', 'สถานะ'].map((h, i) => (
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
                            <LmAvatar size={26} photo={rk.avatarPhoto} color={rk.color} initial={rk.initial}/>
                            <div><div style={{ fontWeight: 600 }}>{rk.name}</div><div style={{ fontFamily: M_MONO, fontSize: 10, color: '#5d6b59' }}>bib {rk.bib}</div></div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12 }}>{rk.distance}</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12 }}>{rk.km.toFixed(1)} / {rk.totalKm.toFixed(1)}K</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12, fontWeight: 600 }}>{fmtElapsed(rk.elapsedMs)}</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 11, fontWeight: 700, color: rk.gender === 'f' ? '#b3467c' : rk.gender === 'm' ? '#3a86c4' : '#5d6b59' }}>{rk.gender === 'f' ? 'หญิง' : rk.gender === 'm' ? 'ชาย' : '—'}</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12 }}>{rk.pace}/km</td>
                        <td style={{ padding: '10px 14px', fontFamily: M_MONO, fontSize: 12, fontWeight: 600, color: rk.gradColor }}>{rk.gradStr}</td>
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
// Same initial-letter circle used across the search dropdown, detail
// panel, and ranking table — shows the runner's own profile photo (see
// src/mobile-app.jsx's ProfileScreen) once they've set one instead of just
// a colored initial forever.
function LmAvatar({ size, photo, color, initial }) {
  if (photo) {
    return <div style={{ width: size, height: size, borderRadius: 999, overflow: 'hidden', flexShrink: 0 }}>
      <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
    </div>;
  }
  return <div style={{ width: size, height: size, borderRadius: 999, background: color, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size <= 26 ? 11 : 14, fontWeight: 600, flexShrink: 0 }}>{initial}</div>;
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

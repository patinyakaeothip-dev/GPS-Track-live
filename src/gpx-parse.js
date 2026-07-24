// gpx-parse.js — parses an uploaded .gpx file into the same track shape as
// assets/course-track.json ({ points: [[lat,lon,ele,km], ...], bbox,
// totalKm, ascent, descent, minEle, maxEle }), so a real uploaded course can
// be dropped in wherever the demo course is used today.
(function () {
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function parseGpxText(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('ไฟล์ GPX เสียหรืออ่านไม่ได้');
    // Most GPX exports use <trk>/<trkpt> (track points), but some apps —
    // Suunto app among them — export a plain <rte>/<rtept> (route points)
    // instead, same lat/lon/ele shape either way. Fall back to route points
    // rather than rejecting a perfectly good file just because it took the
    // other valid GPX shape.
    let trkpts = Array.from(doc.getElementsByTagName('trkpt'));
    if (!trkpts.length) trkpts = Array.from(doc.getElementsByTagName('rtept'));
    if (!trkpts.length) throw new Error('ไม่พบเส้นทาง (trkpt/rtept) ในไฟล์นี้');

    let km = 0, ascent = 0, descent = 0;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    let minEle = Infinity, maxEle = -Infinity;
    const points = trkpts.map((pt, i) => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      const eleEl = pt.getElementsByTagName('ele')[0];
      const ele = eleEl ? parseFloat(eleEl.textContent) : 0;
      if (i > 0) {
        const prev = trkpts[i - 1];
        const d = haversineKm(parseFloat(prev.getAttribute('lat')), parseFloat(prev.getAttribute('lon')), lat, lon);
        km += d;
        const prevEleEl = prev.getElementsByTagName('ele')[0];
        const prevEle = prevEleEl ? parseFloat(prevEleEl.textContent) : ele;
        const diff = ele - prevEle;
        if (diff > 0) ascent += diff; else descent += -diff;
      }
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minEle = Math.min(minEle, ele); maxEle = Math.max(maxEle, ele);
      return [lat, lon, ele, Math.round(km * 1000) / 1000];
    });

    return {
      points: decimate(points),
      bbox: { minLat, maxLat, minLon, maxLon },
      totalKm: Math.round(km * 1000) / 1000,
      ascent: Math.round(ascent),
      descent: Math.round(descent),
      minEle: Math.round(minEle),
      maxEle: Math.round(maxEle),
    };
  }

  // A real GPS recording can have thousands of points — a watch pinging
  // every second over a few hours easily produces 5000+. Stored verbatim on
  // the event doc (every distance's course, uploaded once and read by every
  // runner/spectator forever after), that's enough to threaten Firestore's
  // 1MiB document limit and even localStorage's quota — and both those
  // writes fail *silently* (see event-store.js), so a course that's too big
  // just quietly never saves, and every screen keeps showing the old/demo
  // course with no error anywhere. ascent/descent above are already computed
  // from the full-resolution data before this runs, so downsampling here
  // only affects map/elevation rendering detail, not those stats — 1500
  // points is already far more resolution than a phone screen can show.
  const MAX_POINTS = 1500;
  function decimate(points) {
    if (points.length <= MAX_POINTS) return points;
    const step = (points.length - 1) / (MAX_POINTS - 1);
    const out = [];
    for (let i = 0; i < MAX_POINTS; i++) out.push(points[Math.round(i * step)]);
    return out;
  }

  function parseGpxFile(file) {
    return file.text().then(parseGpxText);
  }

  Object.assign(window, { gpxParse: { parseGpxText, parseGpxFile } });
})();

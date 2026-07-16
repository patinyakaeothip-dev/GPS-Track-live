// course-geo.js — course-path and gradient/elevation math shared by the RD
// live map dashboard and the runner Route tab. Derives per-distance paths
// from the single recorded 29K GPX track (assets/course-track.json) by
// splicing out the hill loop for 22K and turning around at A1 for 11K.

(function () {
  async function loadTrack() {
    const res = await fetch('assets/course-track.json');
    const data = await res.json();
    return data.points.map(p => ({ lat: p[0], lon: p[1], ele: p[2], km: p[3] }));
  }

  function reindexKm(pts) {
    let km = 0;
    const out = [{ ...pts[0], km: 0 }];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = haversineKm(a.lat, a.lon, b.lat, b.lon);
      km += d;
      out.push({ ...b, km });
    }
    return out;
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Build lat/lon/ele/km path arrays for each race distance from the single
  // recorded 29K track + the checkpoint km marks (CP_KMS: a1_out, a2_in, a2_out, a1_in).
  function buildCoursePaths(track, cpKms) {
    const at = km => track.reduce((best, p) => Math.abs(p.km - km) < Math.abs(best.km - km) ? p : best, track[0]);
    const idxAt = km => {
      let bestI = 0, bestD = Infinity;
      track.forEach((p, i) => { const d = Math.abs(p.km - km); if (d < bestD) { bestD = d; bestI = i; } });
      return bestI;
    };

    // 29K: the full recorded track as-is.
    const path29 = track;

    // 22K: splice out the hill loop between a2_in and a2_out.
    const i1 = idxAt(cpKms.a2_in), i2 = idxAt(cpKms.a2_out);
    const path22Raw = track.slice(0, i1 + 1).concat(track.slice(i2 + 1));
    const path22 = reindexKm(path22Raw);

    // 11K: out to a1_out then back the same way (out-and-back).
    const iA1 = idxAt(cpKms.a1_out);
    const outLeg = track.slice(0, iA1 + 1);
    const backLeg = track.slice(0, iA1 + 1).slice().reverse();
    const path11 = reindexKm(outLeg.concat(backLeg));

    return { '29K': path29, '22K': path22, '11K': path11 };
  }

  function pointAtKm(pts, km) {
    const clamped = Math.max(0, Math.min(pts[pts.length - 1].km, km));
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].km >= clamped) {
        const a = pts[i - 1], b = pts[i];
        const span = b.km - a.km || 1;
        const t = (clamped - a.km) / span;
        return {
          lat: a.lat + (b.lat - a.lat) * t,
          lon: a.lon + (b.lon - a.lon) * t,
          ele: a.ele + (b.ele - a.ele) * t,
          km: clamped,
        };
      }
    }
    return pts[pts.length - 1];
  }

  // % gradient (rise/run) averaged over a short window around km.
  function gradientAtKm(pts, km) {
    const window = 0.15;
    const p0 = pointAtKm(pts, km - window);
    const p1 = pointAtKm(pts, km + window);
    const rise = p1.ele - p0.ele;
    const run = Math.max(0.02, (p1.km - p0.km)) * 1000;
    return (rise / run) * 100;
  }

  function coursePolylineLatLngs(pts) {
    return pts.map(p => [p.lat, p.lon]);
  }

  // Project an arbitrary lat/lon onto the recorded 29K track, returning the
  // nearest point's km — used so runners on the 22K/11K paths still plot
  // sensibly on the RD dashboard's full-course elevation overview.
  function nearestKmOnTrack(track, lat, lon) {
    let best = track[0], bestD = Infinity;
    track.forEach(p => {
      const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    });
    return best.km;
  }

  Object.assign(window, {
    courseGeo: { loadTrack, buildCoursePaths, pointAtKm, gradientAtKm, coursePolylineLatLngs, nearestKmOnTrack, haversineKm },
  });
})();

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

  const DEMO_CP_KMS = { a1_out: 5.6, a2_in: 11.6, a2_out: 19, a1_in: 23.5 };

  // Builds real per-distance course paths for an event from whatever GPX it
  // actually has (src/admin-app.jsx GpxCard uploads → ev.gpxFiles, parsed by
  // src/gpx-parse.js into the same {points:[[lat,lon,ele,km]],...} shape as
  // assets/course-track.json), falling back to the bundled demo course for
  // any distance that has nothing uploaded — so events with no GPX yet keep
  // working exactly like before instead of breaking.
  //
  // Preference order per distance: (1) that distance's own uploaded GPX,
  // used as-is since it's already the real route; (2) derived by splicing
  // the event's own uploaded 29K GPX using its cpKms, same technique as the
  // demo course; (3) the bundled demo course.
  async function buildEventCoursePaths(ev) {
    const cpKms = (ev && ev.cpKms) || DEMO_CP_KMS;
    const gpxFiles = (ev && ev.gpxFiles) || {};

    let baseTrack;
    if (gpxFiles['29K']) {
      baseTrack = reindexKm(gpxFiles['29K'].track.points.map(p => ({ lat: p[0], lon: p[1], ele: p[2], km: p[3] })));
    } else {
      baseTrack = await loadTrack();
    }
    const derived = buildCoursePaths(baseTrack, cpKms);

    const paths = {};
    ['11K', '22K', '29K'].forEach(label => {
      if (gpxFiles[label]) {
        paths[label] = reindexKm(gpxFiles[label].track.points.map(p => ({ lat: p[0], lon: p[1], ele: p[2], km: p[3] })));
      } else {
        paths[label] = derived[label];
      }
    });
    return { paths, cpKms };
  }

  // Same per-distance resolution as buildEventCoursePaths, but returns the
  // flat {points:[[lat,lon,ele,km]], totalKm, minEle, maxEle} JSON shape the
  // runner app's Route tab (mobile-app.jsx useCourse/ElevationSvg) expects.
  async function courseJsonForDistance(ev, distLabel) {
    const { paths } = await buildEventCoursePaths(ev);
    const pts = paths[distLabel] || paths['29K'];
    const eles = pts.map(p => p.ele);
    return {
      points: pts.map(p => [p.lat, p.lon, p.ele, p.km]),
      totalKm: pts[pts.length - 1].km,
      minEle: Math.min(...eles),
      maxEle: Math.max(...eles),
    };
  }

  Object.assign(window, {
    courseGeo: { loadTrack, buildCoursePaths, pointAtKm, gradientAtKm, coursePolylineLatLngs, nearestKmOnTrack, haversineKm, buildEventCoursePaths, courseJsonForDistance },
  });
})();

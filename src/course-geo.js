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

  // % gradient averaged over the whole distance covered so far (start → km)
  // instead of just the stretch right around the runner — net elevation
  // change so far divided by distance so far.
  function avgGradientToKm(pts, km) {
    if (km <= 0) return 0;
    const p0 = pts[0], p1 = pointAtKm(pts, km);
    const rise = p1.ele - p0.ele;
    const run = Math.max(0.02, p1.km) * 1000;
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

  // Builds real per-distance course paths for an event from whatever GPX it
  // actually has (src/admin-app.jsx GpxCard uploads → ev.gpxFiles, parsed by
  // src/gpx-parse.js into the same {points:[[lat,lon,ele,km]],...} shape as
  // assets/course-track.json). Distance labels come from the event's own
  // `distances` list (set up in Admin) instead of a fixed 29K/22K/11K set,
  // so events with different distances resolve correctly. Any distance with
  // nothing uploaded yet falls back to the bundled demo course rather than
  // trying to derive one — deriving a spliced sub-route only ever made sense
  // for one specific out-and-back/loop course shape, and doesn't generalize
  // to arbitrary RD-defined checkpoints.
  async function buildEventCoursePaths(ev) {
    const gpxFiles = (ev && ev.gpxFiles) || {};
    const labels = (ev && ev.distances && ev.distances.length) ? ev.distances.map(d => d.label) : ['29K', '22K', '11K'];

    let demoTrack = null;
    const paths = {};
    for (const label of labels) {
      if (gpxFiles[label]) {
        paths[label] = reindexKm(gpxFiles[label].track.points.map(p => ({ lat: p[0], lon: p[1], ele: p[2], km: p[3] })));
      } else {
        if (!demoTrack) demoTrack = await loadTrack();
        paths[label] = demoTrack;
      }
    }
    // The "overview" course used for the RD map/elevation strip and to
    // project runner positions onto — whichever distance's path is actually
    // longest, instead of assuming a fixed '29K' key exists.
    const overviewLabel = labels.slice().sort((a, b) =>
      (paths[b][paths[b].length - 1].km) - (paths[a][paths[a].length - 1].km))[0];

    return { paths, overviewLabel, checkpoints: (ev && Array.isArray(ev.checkpoints)) ? ev.checkpoints : [] };
  }

  // Same per-distance resolution as buildEventCoursePaths, but returns the
  // flat {points:[[lat,lon,ele,km]], totalKm, minEle, maxEle} JSON shape the
  // runner app's Route tab (mobile-app.jsx useCourse/ElevationSvg) expects.
  async function courseJsonForDistance(ev, distLabel) {
    const { paths, overviewLabel } = await buildEventCoursePaths(ev);
    const pts = paths[distLabel] || paths[overviewLabel];
    const eles = pts.map(p => p.ele);
    return {
      points: pts.map(p => [p.lat, p.lon, p.ele, p.km]),
      totalKm: pts[pts.length - 1].km,
      minEle: Math.min(...eles),
      maxEle: Math.max(...eles),
    };
  }

  Object.assign(window, {
    courseGeo: { loadTrack, pointAtKm, gradientAtKm, avgGradientToKm, coursePolylineLatLngs, nearestKmOnTrack, haversineKm, buildEventCoursePaths, courseJsonForDistance },
  });
})();

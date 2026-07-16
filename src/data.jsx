// data.jsx — seed data for the trail-race tracker
// 150 runners across 3 distances; simulated checkpoint times.
// Time math is in minutes-since-race-start so we can scrub scenarios.

// ─── Course shape (Rayong Trail Running 2026) ───────────────────────────
// Aid stations from the official poster:
//   A1 = เขามะเข้ม         (visited @ 5.6km outbound, 23.5km inbound for 29K)
//   A2 = Green Mountain   (visited @ 11.6km uphill,   19.0km downhill for 29K)
//
// 29K: Start → A1(5.6) → A2(11.6) → hill loop → A2(19.0) → A1(23.5) → Finish(29)
// 22K: Start → A1(5.6) → A2(11.6)            →           → A1(16.5) → Finish(22)
// 11K: Start → A1(5.6)                                              → Finish(11)
// Checkpoint events we MONITOR:
//   start, a1_out, a2_in, a2_out (29K only), a1_in, finish

const COURSES = {
  '29K': {
    distance: 29,
    color: '#0a0a0a',
    legs: [
      { from: 'start',  to: 'a1_out', km: 5.6, type: 'run'  },
      { from: 'a1_out', to: 'a2_in',  km: 6.0, type: 'run'  },
      { from: 'a2_in',  to: 'a2_out', km: 7.4, type: 'loop' }, // hill loop
      { from: 'a2_out', to: 'a1_in',  km: 4.5, type: 'run'  },
      { from: 'a1_in',  to: 'finish', km: 5.5, type: 'run'  },
    ],
    bibRange: [1, 40],
  },
  '22K': {
    distance: 22,
    color: '#404040',
    legs: [
      { from: 'start',  to: 'a1_out', km: 5.6, type: 'run' },
      { from: 'a1_out', to: 'a2_in',  km: 6.0, type: 'run' },
      { from: 'a2_in',  to: 'a1_in',  km: 4.9, type: 'run' },
      { from: 'a1_in',  to: 'finish', km: 5.5, type: 'run' },
    ],
    bibRange: [41, 90],
  },
  '11K': {
    distance: 11,
    color: '#888',
    legs: [
      { from: 'start',  to: 'a1_out', km: 5.6, type: 'run' },
      { from: 'a1_out', to: 'finish', km: 5.4, type: 'run' },
    ],
    bibRange: [91, 150],
  },
};

// ─── Checkpoint physical IDs (3 real spots: Start/Finish, A1, A2) ───────
// Tap-events at a spot resolve to the right semantic checkpoint based on
// which leg the runner is on. Each physical spot has a cool-down (minutes)
// — if a runner scans the same spot's QR again before cool-down elapses,
// the system rejects the scan with a friendly message. Prevents accidental
// double-taps AND the "did they actually do the A2 loop or just rescan?"
// problem.
const CHECKPOINT_COOLDOWN = {
  start_finish: 60,
  a1: 60,             // A1 ขาไป 5.6 ↔ ขากลับ 23.5 = ~18km gap, even slow walkers > 60min
  a2: 60,             // A2 ขึ้น 11.6 ↔ ลง 19 = 7.4km hill loop; 60min cool-down
};

const CHECKPOINTS = [
  { id: 'start',  spot: 'start_finish', label: 'START / FINISH', km: 0,    staff: 4 },
  { id: 'a1_out', spot: 'a1',           label: 'A1 · ขาไป',       km: 5.6, staff: 2 },
  { id: 'a2_in',  spot: 'a2',           label: 'A2 · ขึ้นเขา',     km: 11.6,staff: 3 },
  { id: 'a2_out', spot: 'a2',           label: 'A2 · ลงเขา',      km: 19,  staff: 3 },
  { id: 'a1_in',  spot: 'a1',           label: 'A1 · ขากลับ',     km: 23.5,staff: 2 },
  { id: 'finish', spot: 'start_finish', label: 'FINISH',          km: 29,  staff: 4 },
];

// ─── Elevation profile (for the Ascend graph) ───────────────────────────
// Derived from the Rayong poster: 1750m ascent total, peaks ~450m around
// the A2 hill loop. Keyed by km → elevation (metres).
const ELEVATION_KM = [
  [0,    200], [1.5, 320], [3,   280], [4.5, 380], [5.6, 320],
  [7,    220], [8.5, 250], [10,  310], [11.6, 330],
  [13,   410], [15,  460], [17,  430], [19,  330],
  [21,   250], [23.5,320],
  [25.5, 280], [27,  240], [29,  200],
];

function elevationAt(km) {
  for (let i = 0; i < ELEVATION_KM.length - 1; i++) {
    const [k0, e0] = ELEVATION_KM[i];
    const [k1, e1] = ELEVATION_KM[i + 1];
    if (km >= k0 && km <= k1) {
      const t = (km - k0) / (k1 - k0);
      return e0 + (e1 - e0) * t;
    }
  }
  return ELEVATION_KM[ELEVATION_KM.length - 1][1];
}

// ─── Synthetic names ─────────────────────────────────────────────────────
const FIRST_TH = ['ภูมิ','นัท','เอ้','ปอย','มิ้น','พีท','โอม','กัน','แอน','บีม','ฟ้า','โย','ตูน','ก้อง','เก่ง','ใหม่','พลอย','แพร','ปาล์ม','ต้น','บอส','แบงค์','ปิ๊ก','เจน','มาร์ค','ออม','โบ๊ท','นัท','แม็ก','เน','พลู','เฟม','ไอซ์','โดม','แทน','ปลา','ปิ่น','เปา','ภู','แตงโม','หยก','ก้านต์','รัน','ตี้','เก้า','พิม','ลูกตาล','อ๋อง','เต้','ปั้น','โจ','พีพี','นิว','ฝน','เจี๊ยบ','กิ๊ฟ','พลอย','ดิว','ใบหม่อน','ไผ่','ภูผา','เพชร','เก่ง','หนึ่ง','สอง','แมท','หนุ่ม','แอม','ปลาย','พรีม','มะปราง','มีน','อร','นาว','พลับพลึง','เพ้นท์','รุ้ง','เปรม','ภาส'];
const LAST_TH = ['ศรีสุข','ใจดี','ทองคำ','แก้วใส','พงษ์ไทย','ราชสีห์','ภูเขียว','วงศ์เพชร','รุ่งโรจน์','ฟ้าใส','สวนสน','ทะเลกว้าง','เจริญพร','ดวงดี','ก้องเกียรติ','พิทักษ์','ชัยชนะ','สายฝน','นาคทอง','คงคาวี','ดารารัตน์','เพชรรัตน์','ทวีสุข','สุขสันต์'];
const FIRST_EN = ['Anan','Boon','Chai','Dao','Eak','Fern','Golf','Han','Ice','Jib','Kit','Lex','Mai','Nin','Oat','Pat','Que','Rin','Som','Ton','Ut','Vic','Way','Xon','Ya','Zeke','Aim','Bow','Cat','Dim','Eve','Fin','Gem','Hin','Ivy','Joy','Kim','Liv','Mei','Noi','Ole','Poi','Qin','Roy','Sue','Tim','Uma','Val','Wim','Xen'];
const LAST_EN = ['Srisuk','Jaidee','Thongkam','Kaeo','Phongthai','Wong','Phukhi','Charoen','Duangdee','Phisit','Chai','Saifon','Nakthong','Suk','Phairoj','Manee','Wongse','Ruangrot'];

// Deterministic PRNG so the same runner data renders every reload.
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// Build the 150-runner roster.
function buildRoster() {
  const out = [];
  for (const [dist, course] of Object.entries(COURSES)) {
    const [lo, hi] = course.bibRange;
    for (let bib = lo; bib <= hi; bib++) {
      const r = rng(bib * 7919 + 13);
      const useTh = r() > 0.45;
      const first = useTh ? FIRST_TH[Math.floor(r() * FIRST_TH.length)] : FIRST_EN[Math.floor(r() * FIRST_EN.length)];
      const last  = useTh ? LAST_TH[Math.floor(r() * LAST_TH.length)]  : LAST_EN[Math.floor(r() * LAST_EN.length)];
      // Target pace min/km — trail running is ~6–10 min/km
      const basePace = 6 + r() * 4.5;
      // Hill loop penalty (just for 29K)
      const hillPenalty = 0.8 + r() * 1.2;
      // A small share are slow/struggling, a tiny share will be flagged
      const tag = r();
      let archetype = 'normal';
      if (tag > 0.92) archetype = 'slow';
      else if (tag > 0.97) archetype = 'fast';
      // Auto-upgrade simulation: 12% of runners "upgraded" mid-race.
      // 29K runners might have started as 22K; 22K might have started as 11K.
      const upgradeRoll = r();
      let registeredDistance = dist;
      if (upgradeRoll < 0.08) {
        if (dist === '29K') registeredDistance = '22K';
        else if (dist === '22K') registeredDistance = '11K';
      } else if (upgradeRoll < 0.12) {
        if (dist === '29K') registeredDistance = '11K'; // double-upgrade
      }

      out.push({
        bib: String(bib).padStart(3, '0'),
        firstName: first, lastName: last,
        distance: dist,
        registeredDistance,
        course,
        emergency: `+66 8${Math.floor(r() * 9 + 1)} ${String(Math.floor(r() * 9999)).padStart(4,'0')} ${String(Math.floor(r() * 9999)).padStart(4,'0')}`,
        basePace, hillPenalty, archetype,
      });
    }
  }
  return out;
}

const ROSTER = buildRoster();

// ─── Per-runner per-leg duration (deterministic, used to derive checkpoint times)
function legMinutes(runner, leg) {
  let p = runner.basePace;
  if (leg.type === 'loop') p *= runner.hillPenalty;
  if (runner.archetype === 'slow') p *= 1.3;
  if (runner.archetype === 'fast') p *= 0.85;
  // tiny per-leg jitter (deterministic)
  const jr = rng(parseInt(runner.bib,10) * 31 + leg.km * 100);
  p *= 0.92 + jr() * 0.16;
  return p * leg.km; // minutes
}

// Each runner's *planned* checkpoint clock (in race minutes).
function plannedTimes(runner) {
  const times = { start: 0 };
  let t = 0;
  // Wave start: 29K @ 0min, 22K @ 5min, 11K @ 10min
  const wave = runner.distance === '29K' ? 0 : runner.distance === '22K' ? 5 : 10;
  t = wave;
  times.start = wave;
  for (const leg of runner.course.legs) {
    t += legMinutes(runner, leg);
    times[leg.to] = t;
  }
  return times;
}

// ─── Scenarios ────────────────────────────────────────────────────────────
// raceMinutes = minutes since 06:00 gun time.
// "missing" mutates a few runners to have stalled / failed-to-check-in.
const SCENARIOS = {
  pre:    { raceMinutes:  -15, missingBibs: [],         label: 'Pre-race · 05:45' },
  start:  { raceMinutes:    5, missingBibs: [],         label: 'Start · 06:05'    },
  mid:    { raceMinutes:  120, missingBibs: ['017'],    label: 'Mid-race · 08:00' },
  late:   { raceMinutes:  210, missingBibs: ['017','058','103'], label: 'Late · 09:30'    },
  finish: { raceMinutes:  300, missingBibs: ['017','058'], label: 'Finish surge · 11:00' },
};

// Snapshot a runner at a given race time + scenario flags.
function snapshotRunner(runner, raceMinutes, scenario) {
  const plan = plannedTimes(runner);
  const ckpts = ['start', ...runner.course.legs.map(l => l.to)];

  // Apply "missing" perturbation: this runner stopped between their last
  // reached checkpoint and the next one (no tap arrived).
  const isMissing = scenario.missingBibs.includes(runner.bib);

  // Find the last checkpoint passed at raceMinutes.
  let lastCp = null, nextCp = null, lastTime = null;
  for (let i = 0; i < ckpts.length; i++) {
    if (plan[ckpts[i]] <= raceMinutes) {
      lastCp = ckpts[i];
      lastTime = plan[ckpts[i]];
      nextCp = ckpts[i + 1] || null;
    } else { nextCp = ckpts[i]; break; }
  }

  // "Missing" runner: cap their last check-in to before they went silent.
  // We freeze them at the segment after their first checkpoint past start.
  if (isMissing) {
    const stuckAt = Math.min(2, ckpts.length - 2);
    lastCp = ckpts[stuckAt];
    lastTime = plan[ckpts[stuckAt]];
    nextCp = ckpts[stuckAt + 1] || null;
  }

  // What fraction along the current leg are they at?
  let progressKm = 0;
  if (lastCp) {
    // Sum km of legs up through lastCp
    for (const leg of runner.course.legs) {
      if (leg.to === lastCp) { progressKm += leg.km; break; }
      progressKm += leg.km;
    }
    if (lastCp === 'start') progressKm = 0;
    if (nextCp) {
      const currentLeg = runner.course.legs.find(l => l.from === lastCp && l.to === nextCp);
      if (currentLeg && !isMissing) {
        const legDur = legMinutes(runner, currentLeg);
        const sinceCp = raceMinutes - lastTime;
        const frac = Math.max(0, Math.min(1, sinceCp / legDur));
        progressKm += currentLeg.km * frac;
      }
    }
  }

  const totalKm = runner.course.distance;
  const finished = lastCp === 'finish';
  const expectedKm = totalKm * Math.max(0, Math.min(1, (raceMinutes - plan.start) / (plan.finish - plan.start)));

  // Status logic
  let status = 'on_course';
  if (raceMinutes < plan.start) status = 'not_started';
  if (finished) status = 'finished';
  if (isMissing && raceMinutes - lastTime > 35) status = 'missing';
  // "Slow": running ≥18% slower than expected pace (matches "ช้ากว่าค่าเฉลี่ยกลุ่ม x%")
  if (status === 'on_course' && expectedKm - progressKm > totalKm * 0.18) status = 'slow';
  // "At rest": within 0.3km of a checkpoint that isn't start/finish for 2+ min
  if (status === 'on_course' && lastCp && lastCp !== 'start' && lastCp !== 'finish'
      && raceMinutes - lastTime > 2 && raceMinutes - lastTime < 5
      && nextCp) {
    const currentLeg = runner.course.legs.find(l => l.from === lastCp);
    if (currentLeg) {
      const legDur = legMinutes(runner, currentLeg);
      const sinceCp = raceMinutes - lastTime;
      const frac = sinceCp / legDur;
      if (frac < 0.05) status = 'rest';
    }
  }
  // DNF: a small share at finish-scenario
  const dr = rng(parseInt(runner.bib, 10) * 2);
  if (raceMinutes > plan.finish + 30 && !finished && !isMissing) {
    // missed the finish window for their distance
    if (dr() < 0.4) status = 'dnf';
  }

  // Checkpoint history (only show those <= raceMinutes)
  const history = [];
  for (const cp of ckpts) {
    if (plan[cp] <= raceMinutes && (!isMissing || (isMissing && plan[cp] <= lastTime))) {
      history.push({ id: cp, t: plan[cp] });
    }
  }

  // ETA to next checkpoint
  let eta = null;
  if (nextCp && !finished && status !== 'missing' && status !== 'dnf') {
    eta = Math.max(0, plan[nextCp] - raceMinutes);
  }

  return {
    ...runner,
    status, lastCp, nextCp, lastTime, progressKm, expectedKm, history, eta,
    plan,
  };
}

// Public: build full snapshot
function buildSnapshot(scenarioKey) {
  const scenario = SCENARIOS[scenarioKey] || SCENARIOS.mid;
  return {
    raceMinutes: scenario.raceMinutes,
    scenario: scenarioKey,
    scenarioLabel: scenario.label,
    runners: ROSTER.map(r => snapshotRunner(r, scenario.raceMinutes, scenario)),
  };
}

// Format helpers
function fmtMin(min) {
  if (min == null) return '—';
  if (min < 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
function fmtClock(raceMinutes) {
  // Race start 06:00
  const total = 6 * 60 + raceMinutes;
  const h = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const m = Math.floor((((total % 60) + 60) % 60));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function fmtDur(min) {
  if (min == null || min < 0) return '—';
  const s = Math.round(min * 60);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}'${String(r).padStart(2,'0')}"`;
}

// ─── Live mode · convert backend state → snapshot shape ─────────────────
// The Apps Script backend records physical-spot check-ins (start/a1/a2/finish).
// The dashboard renders the same legs as the mock, so map repeat scans to
// semantic ids (a1_out / a1_in, a2_in / a2_out) by occurrence order.
function semanticCpFor(spot, occurrenceIndex) {
  if (spot === 'a1') return occurrenceIndex === 0 ? 'a1_out' : 'a1_in';
  if (spot === 'a2') return occurrenceIndex === 0 ? 'a2_in' : 'a2_out';
  return spot; // start, finish
}

function liveRunnerToSnapshot(runner, checkinsForRunner, raceStartMs, nowMs) {
  const dist = runner.distance_current || runner.distance_original || '11K';
  const course = COURSES[dist] || COURSES['11K'];
  const ordered = (checkinsForRunner || [])
    .slice()
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  const spotCounts = { start: 0, a1: 0, a2: 0, finish: 0 };
  const history = [];
  let lastCp = null, lastTime = null;
  for (const c of ordered) {
    const spot = (c.cp || '').toLowerCase();
    const idx = spotCounts[spot] || 0;
    spotCounts[spot] = idx + 1;
    const cpId = semanticCpFor(spot, idx);
    const tMin = (Number(c.timestamp) - raceStartMs) / 60000;
    history.push({ id: cpId, t: tMin });
    lastCp = cpId;
    lastTime = tMin;
  }

  // Next CP from course legs
  const ckptSeq = ['start', ...course.legs.map(l => l.to)];
  const lastIdx = lastCp ? ckptSeq.indexOf(lastCp) : 0;
  const nextCp = lastCp === 'finish' ? null : ckptSeq[lastIdx + 1] || null;

  // Progress = km of the last reached checkpoint (no GPS interpolation in live mode)
  let progressKm = 0;
  if (lastCp && lastCp !== 'start') {
    for (const leg of course.legs) {
      progressKm += leg.km;
      if (leg.to === lastCp) break;
    }
  }

  // Status mapping
  let status = 'on_course';
  if (runner.status === 'finished' || lastCp === 'finish') status = 'finished';
  else if (runner.status === 'dnf') status = 'dnf';
  else if (!lastCp) status = 'not_started';
  else if (lastTime != null && (nowMs - raceStartMs) / 60000 - lastTime > 45) status = 'slow';

  const [firstName, ...rest] = (runner.name || '').trim().split(/\s+/);
  const lastName = rest.join(' ');
  // Synthesize a bib from the phone tail so existing roster UI keeps working
  const bib = String(runner.phone || runner.id || '').replace(/\D/g, '').slice(-3).padStart(3, '0');

  return {
    bib,
    firstName: firstName || runner.name || '(unnamed)',
    lastName,
    distance: dist,
    registeredDistance: runner.distance_original || dist,
    course,
    emergency: runner.emergency_phone || '',
    basePace: 7, hillPenalty: 1, archetype: 'normal',
    status, lastCp, nextCp, lastTime, progressKm,
    expectedKm: progressKm,
    history, eta: null, plan: null,
    // Pass through backend identity for runner-app screens
    _id: runner.id, _token: runner.token, _phone: runner.phone,
  };
}

function buildSnapshotFromLiveState(state, raceStartMs) {
  const nowMs = (state && state.time) || Date.now();
  const start = raceStartMs || (Math.min.apply(null,
    (state.checkins || []).filter(c => (c.cp || '').toLowerCase() === 'start')
      .map(c => Number(c.timestamp))
      .concat([nowMs]))) || nowMs;

  const byRunner = new Map();
  (state.checkins || []).forEach(c => {
    if (!byRunner.has(c.runner_id)) byRunner.set(c.runner_id, []);
    byRunner.get(c.runner_id).push(c);
  });

  const runners = (state.runners || []).map(r =>
    liveRunnerToSnapshot(r, byRunner.get(r.id) || [], start, nowMs));

  // Compute rank within distance for finished runners — sorted by their
  // actual finish-checkin timestamp ascending, tie-broken by runner id.
  const finishByDist = {};
  runners.forEach(r => {
    if (r.status === 'finished') {
      const key = r.distance || '?';
      (finishByDist[key] = finishByDist[key] || []).push(r);
    }
  });
  Object.values(finishByDist).forEach(arr => {
    arr.sort((a, b) => (a.lastTime || 0) - (b.lastTime || 0) ||
                       String(a._id || '').localeCompare(String(b._id || '')));
    arr.forEach((r, i) => { r.rank = i + 1; r.totalFinishers = arr.length; });
  });

  return {
    raceMinutes: (nowMs - start) / 60000,
    scenario: 'live',
    scenarioLabel: 'Live · backend',
    runners: runners,
    _live: true,
    _serverTime: nowMs,
    _systemState: state && state.state ? state.state : 'open',
  };
}

// Fetch from backend and return a snapshot in the same shape as buildSnapshot().
// Returns null if the backend isn't configured (caller can fall back to mock).
async function fetchSnapshot() {
  if (!window.apiIsConfigured || !window.apiIsConfigured()) return null;
  const params = window.TRT_DASHBOARD_KEY ? { key: window.TRT_DASHBOARD_KEY } : {};
  const state = await window.api('state', params);
  return buildSnapshotFromLiveState(state);
}

Object.assign(window, {
  COURSES, CHECKPOINTS, CHECKPOINT_COOLDOWN, ELEVATION_KM, elevationAt,
  ROSTER,
  buildSnapshot, fetchSnapshot, buildSnapshotFromLiveState,
  fmtMin, fmtClock, fmtDur,
});

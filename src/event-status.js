// event-status.js — single source of truth for deriving an event's
// upcoming/live/past status and whether registration is closed, from its
// raw scheduling data (raceDateISO, per-distance cpTimes, regCloseISO).
//
// This used to be duplicated logic inside admin-app.jsx that only ran when
// RD clicked Save, and the *result* (ev.status/ev.closed) was what got
// stored and read everywhere else (event picker, Live Monitor, Results).
// That meant the displayed status was a snapshot frozen at whatever moment
// it was last saved — it never flipped from upcoming to live to past on its
// own as real time passed, which is exactly what showed up as "I set the
// times correctly but the status is still wrong hours later." Now every
// consumer calls computeStatus/computeClosed directly at render time
// instead of trusting the stored field, so it's always correct regardless
// of when the event was last edited.
//
// Races happen in Thailand, so every date+time is anchored to Asia/Bangkok
// (UTC+7) explicitly — never the viewer's local device timezone.
(function () {
  // anchor (optional Date/ms) — pass whichever earlier point in the same
  // race this time is known to come after (typically that distance's own
  // gun/start time). A trail race can run past midnight (start in the
  // evening, finish in the small hours), but every clock time recorded
  // for it — cpTimes.start/finish, a runner's checkins[].t — is still
  // just a bare wall-clock "HH:MM[:SS]", combined onto the single
  // raceDateISO the whole event is filed under. Combined naively, a
  // finish/checkpoint time that's numerically earlier than the start
  // (03:00 vs 22:00) lands on that same calendar date and comes out
  // *before* the start instead of ~5h after it — the exact shape of bug
  // already hit once with a mismatched test-event date, except this one
  // would happen on real race night for any distance that's genuinely
  // scheduled to cross midnight. Rolling forward a day at a time until
  // the result is at/after the anchor fixes that without needing every
  // caller to know in advance whether *this specific* distance crosses
  // midnight — it either did, and this corrects it, or it didn't, and
  // one day is already enough to clear the anchor so nothing changes.
  function combineDateTime(dateISO, hhmm, anchor) {
    if (!dateISO || !hhmm) return null;
    // The CP-time fields used to be freeform text, so data entered before
    // they became <input type="time"> may use "." or a space instead of ":"
    // (e.g. "06.00") — that silently failed to parse and was the actual
    // root cause of an event showing the wrong status even with times that
    // "looked" filled in. Normalize before parsing so old data self-heals.
    // Seconds are optional — Admin's cpTimes inputs only ever collect
    // HH:MM, while a runner's actual QR check-in time (checkins[].t) now
    // carries HH:MM:SS for real ranking precision.
    const m = /^(\d{1,2})[:.\s](\d{2})(?:[:.\s](\d{2}))?$/.exec(String(hhmm).trim());
    if (!m) return null;
    const normalized = `${m[1].padStart(2, '0')}:${m[2]}:${m[3] || '00'}`;
    const d = new Date(`${dateISO}T${normalized}+07:00`);
    if (Number.isNaN(d.getTime())) return null;
    const anchorMs = anchor instanceof Date ? anchor.getTime() : anchor;
    if (typeof anchorMs === 'number' && !Number.isNaN(anchorMs)) {
      // Almost always at most one rollover (start→finish overnight); capped
      // at a week as a sane ceiling rather than looping forever on garbage
      // input.
      for (let guard = 0; d.getTime() < anchorMs && guard < 7; guard++) d.setDate(d.getDate() + 1);
    }
    return d;
  }

  function eventWindow(ev) {
    if (!ev || !ev.raceDateISO) return { start: null, end: null };
    // Each distance's own finish is anchored off that same distance's own
    // start (not the earliest start across every distance) — otherwise an
    // overnight distance's finish could roll onto the wrong day relative
    // to a same-morning distance's start also running in this event.
    const starts = [], ends = [];
    (ev.distances || []).forEach(d => {
      const s = combineDateTime(ev.raceDateISO, d.cpTimes && d.cpTimes.start);
      if (s) starts.push(s);
      const f = combineDateTime(ev.raceDateISO, d.cpTimes && d.cpTimes.finish, s || undefined);
      if (f) ends.push(f);
    });
    return {
      start: starts.length ? new Date(Math.min(...starts.map(d => d.getTime()))) : null,
      end: ends.length ? new Date(Math.max(...ends.map(d => d.getTime()))) : null,
    };
  }

  function computeStatus(ev) {
    const { start, end } = eventWindow(ev);
    if (!start) return (ev && ev.status) || 'upcoming'; // no schedule entered yet — fall back to whatever was picked/saved
    const now = Date.now();
    if (now < start.getTime()) return 'upcoming';
    if (end && now > end.getTime()) return 'past';
    return 'live';
  }

  function computeClosed(ev) {
    if (!ev || !ev.regCloseISO) return !!(ev && ev.closed);
    const d = new Date(`${ev.regCloseISO}:00+07:00`);
    return !Number.isNaN(d.getTime()) && Date.now() > d.getTime();
  }

  Object.assign(window, { eventStatus: { combineDateTime, eventWindow, computeStatus, computeClosed } });
})();

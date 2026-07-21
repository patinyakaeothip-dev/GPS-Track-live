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
  function combineDateTime(dateISO, hhmm) {
    if (!dateISO || !/^\d{2}:\d{2}$/.test(hhmm || '')) return null;
    const d = new Date(`${dateISO}T${hhmm}:00+07:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function eventWindow(ev) {
    if (!ev || !ev.raceDateISO) return { start: null, end: null };
    const starts = (ev.distances || []).map(d => combineDateTime(ev.raceDateISO, d.cpTimes && d.cpTimes.start)).filter(Boolean);
    const ends = (ev.distances || []).map(d => combineDateTime(ev.raceDateISO, d.cpTimes && d.cpTimes.finish)).filter(Boolean);
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

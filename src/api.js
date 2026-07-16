// api.jsx — thin client for the Apps Script backend.
//
// Loaded before the other src/* files so they can call `window.api(...)`.
// The runner web flow uses it via the action helpers in runner-app.jsx;
// data.jsx uses it to build live snapshots for the Race Director dashboard.
//
// Configure the deployed Web App URL by setting `window.TRT_API_URL` in the
// host HTML BEFORE this script runs. If unset, the prototype falls back to
// the mock snapshot in data.jsx and api() rejects with `not_configured`.

(function () {
  const DEFAULT_TIMEOUT_MS = 12000;

  function configured() {
    return !!(window.TRT_API_URL && /^https?:\/\//.test(window.TRT_API_URL));
  }

  // Normalise booleans so the Apps Script side sees "1" / nothing (otherwise the
  // string "false" would coerce to truthy on the server).
  function serialiseValue(v) {
    if (v === true) return '1';
    if (v === false || v == null || v === '') return undefined;
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  function buildUrl(action, params) {
    const base = window.TRT_API_URL.replace(/\?.*$/, '');
    const qs = Object.entries(params || {})
      .map(([k, v]) => [k, serialiseValue(v)])
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${base}?action=${encodeURIComponent(action)}${qs ? '&' + qs : ''}`;
  }

  async function fetchOnce(method, action, params, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let url, init;
    if (method === 'GET') {
      url = buildUrl(action, params || {});
      init = { method: 'GET', signal: controller.signal };
    } else {
      url = buildUrl(action, {});
      const form = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        const s = serialiseValue(v);
        if (s !== undefined) form.append(k, s);
      });
      init = {
        method,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: form.toString(),
      };
    }
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch (_) { body = { ok: false, error: 'bad_json', raw: text.slice(0, 240), status: res.status }; }
      if (!body.ok) {
        const err = new Error(body.error || 'api_error');
        err.code = body.error || 'api_error';
        err.payload = body;
        err.status = res.status;
        throw err;
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  // Try POST first (the canonical Apps Script pattern). If it fails with a
  // network/CORS error (TypeError from fetch) — not a server-reported error —
  // retry once via GET. Apps Script's doGet handles the same actions, so this
  // is the most resilient option for browsers blocked by quirky redirect-CORS.
  async function api(action, params, opts) {
    if (!configured()) {
      const err = new Error('not_configured');
      err.code = 'not_configured';
      throw err;
    }
    const wantPost = (opts && opts.method && opts.method !== 'GET')
      || (params && Object.keys(params).length > 0 && !(opts && opts.method === 'GET'));
    const timeout = (opts && opts.timeout) || DEFAULT_TIMEOUT_MS;

    if (wantPost) {
      try { return await fetchOnce('POST', action, params, timeout); }
      catch (err) {
        // Server-reported error — propagate as-is, don't retry.
        if (err && err.code && err.code !== 'bad_json') throw err;
        // Network/CORS/timeout — fall back to GET.
        if (typeof console !== 'undefined') console.warn('[trt] POST failed, retrying as GET:', err && err.message);
      }
    }
    return fetchOnce('GET', action, params, timeout);
  }

  Object.assign(window, {
    api,
    apiIsConfigured: configured,
  });
})();

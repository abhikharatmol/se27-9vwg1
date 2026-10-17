/* util.js — small helpers shared by every module. No dependencies. */
(function (S) {
  'use strict';
  const u = (S.u = {});

  // The version people see (Settings, the progress summary, the backup file). Bump it for a release.
  S.APP_VERSION = '1.0';

  u.$ = (sel, root) => (root || document).querySelector(sel);
  u.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  u.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  u.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  u.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  u.num = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback == null ? 0 : fallback;
  };
  u.sum = (arr) => arr.reduce((a, b) => a + b, 0);
  u.plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');

  /* ---- Dates: everything is a local "YYYY-MM-DD" string ---- */
  const pad = (n) => String(n).padStart(2, '0');
  u.iso = (d) => {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  u.parse = (s) => {
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };
  u.today = () => u.iso();
  u.addDays = (s, n) => {
    const d = u.parse(s);
    d.setDate(d.getDate() + n);
    return u.iso(d);
  };
  u.diffDays = (a, b) => Math.round((u.parse(a) - u.parse(b)) / 864e5); // a - b
  u.dow = (s) => u.parse(s).getDay(); // 0 = Sunday
  const fmtCache = {};
  u.fmt = (s, opts) => {
    const key = JSON.stringify(opts);
    const f = fmtCache[key] || (fmtCache[key] = new Intl.DateTimeFormat('en-IN', opts));
    return f.format(u.parse(s));
  };
  u.dateLong = (s) => u.fmt(s, { weekday: 'short', day: 'numeric', month: 'short' });
  u.dateShort = (s) => u.fmt(s, { day: 'numeric', month: 'short' });
  u.greeting = () => {
    const h = new Date().getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };
  u.minutesNow = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  u.toMin = (hhmm) => {
    const p = hhmm.split(':').map(Number);
    return p[0] * 60 + p[1];
  };
  u.fmtMin = (m) => {
    m = Math.round(m);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? h + 'h ' + r + 'm' : h + 'h';
  };
  // Absolute-deadline timing, shared by the Focus timer and Test Center exams. Store the
  // wall-clock end time (ms), never a tick count, so a locked screen, a throttled tab or a
  // killed app cannot make a timer drift: the time left is always recomputed from the clock.
  u.deadline = {
    left: (end, now) => Math.max(0, end - (now == null ? Date.now() : now)),
    due: (end, now) => (now == null ? Date.now() : now) >= end,
  };
  u.fmtHours =(m) => (Math.round((m / 60) * 10) / 10).toString().replace(/\.0$/, '') + 'h';
  u.clock = (hhmm) => {
    const p = hhmm.split(':').map(Number);
    const h12 = p[0] % 12 || 12;
    return h12 + ':' + pad(p[1]) + (p[0] < 12 ? ' AM' : ' PM');
  };

  /* ---- Icons: <use> references to the sprite in index.html ---- */
  u.icon = (name, cls) =>
    '<svg class="i' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';

  /* ---- Feedback ---- */
  u.reducedMotion = () => {
    const p = S.store && S.store.get('profile');
    if (p && p.motion === 'reduce') return true;
    if (p && p.motion === 'full') return false;
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  u.haptic = (kind) => {
    const p = S.store && S.store.get('profile');
    if (!p || !p.haptics || !navigator.vibrate) return;
    try {
      navigator.vibrate(kind === 'ok' ? [12, 40, 12] : kind === 'warn' ? [30] : 8);
    } catch (e) {
      /* vibrate can throw before the first user gesture; ignore */
    }
  };

  u.debounce = (fn, ms) => {
    let t;
    return function () {
      const a = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, a), ms);
    };
  };
  u.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  };
})((window.SOS = window.SOS || {}));

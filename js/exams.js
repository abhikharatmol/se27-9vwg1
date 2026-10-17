/* exams.js — the exam dates, in one place (store domain `exams`), and the countdown rules. No DOM.
 *
 * Domain shape (see store.js):
 *   exams.target   her own goal date for finishing the syllabus (not an exam), '' if none
 *   exams.list[]   { id, name, date, windowText, status, note }
 *     date         'YYYY-MM-DD', or '' when no day is fixed (never invented: a date is here only if the
 *                  student or an official notice put it here)
 *     windowText   words shown when there is no date, e.g. "Expected March to May 2027 (not official yet ...)"
 *     status       'expected' | 'official'   (official = she checked the exam body's own notice)
 *     note         a short reminder, e.g. "Check the official notice."
 *   exams.seededFromProfile   true once the v8 migration copied the old profile dates (so it never runs twice)
 *
 * Everything that shows an exam date (Home countdowns, the Profile editor) reads it from here. Countdowns
 * show days left only when a date is set; otherwise the window text; the planner and the rest of the app
 * do not depend on any exam date.
 *
 * The data can come from a backup file or a coach's file, so it is never trusted: sanitize() gives the
 * shape the screens rely on (ids are plain words, status is one of two values, dates are real or '',
 * texts are strings of limited length), and list()/target() always return that.
 */
(function (S) {
  'use strict';
  const u = S.u;
  const store = S.store;

  const STATUS = ['expected', 'official'];
  const STATUS_LABEL = { expected: 'Expected', official: 'Official' };
  const MAX = { name: 80, windowText: 160, note: 300 };
  const ID = /^[a-z0-9-]{1,20}$/;

  // A real calendar day written YYYY-MM-DD (2027-02-30 is not one).
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return u.iso(u.parse(s)) === s;
  }
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // The `exams` domain in the shape the screens rely on, whatever came in. Unusable entries are dropped; if no
  // usable entry is left the default list is used. Never throws.
  function sanitize(d) {
    const base = store.defaultOf('exams');
    if (!d || typeof d !== 'object' || Array.isArray(d)) return base;
    const seen = {};
    const list = (Array.isArray(d.list) ? d.list : [])
      .filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && ID.test(e.id) && !seen[e.id] && (seen[e.id] = true))
      .map((e) => ({
        id: e.id,
        name: text(e.name, MAX.name) || e.id,
        date: validDate(e.date) ? e.date : '',
        windowText: text(e.windowText, MAX.windowText),
        status: STATUS.indexOf(e.status) >= 0 ? e.status : 'expected',
        note: text(e.note, MAX.note),
      }));
    return { target: validDate(d.target) ? d.target : '', list: list.length ? list : base.list, seededFromProfile: d.seededFromProfile === true };
  }

  const dom = () => sanitize(store.get('exams'));
  const list = () => dom().list;
  const get = (id) => list().filter((e) => e.id === id)[0] || null;
  const target = () => dom().target;

  // How an exam is counted down on `today` (default: today):
  //   { kind: 'days', n }  a date is set and still ahead (n >= 1)
  //   { kind: 'today' }    the date is today
  //   { kind: 'done' }     the date has passed
  //   { kind: 'window', text }  no date, but there is a window text
  //   { kind: 'none' }     neither
  function countdown(e, today) {
    today = today || u.today();
    if (e && validDate(e.date)) {
      const n = u.diffDays(e.date, today);
      return n < 0 ? { kind: 'done' } : n === 0 ? { kind: 'today' } : { kind: 'days', n: n };
    }
    if (e && typeof e.windowText === 'string' && e.windowText.trim()) return { kind: 'window', text: e.windowText.trim() };
    return { kind: 'none' };
  }

  // Change one exam. patch may hold date, windowText, status, note. Returns { ok: true } or { ok: false, error }
  // and changes nothing on an error. A stored domain in a bad shape is repaired first.
  function update(id, patch) {
    if (!get(id)) return { ok: false, error: 'Unknown exam.' };
    if ('date' in patch && patch.date !== '' && !validDate(patch.date)) return { ok: false, error: 'That is not a real date.' };
    if ('status' in patch && STATUS.indexOf(patch.status) < 0) return { ok: false, error: 'Status must be expected or official.' };
    for (const k of ['windowText', 'note']) {
      if (k in patch && (typeof patch[k] !== 'string' || patch[k].length > MAX[k])) return { ok: false, error: k + ' is too long (max ' + MAX[k] + ' characters).' };
    }
    store.mutate('exams', (d) => {
      const clean = sanitize(d);
      d.target = clean.target;
      d.list = clean.list;
      const e = d.list.filter((x) => x.id === id)[0];
      ['date', 'status'].forEach((k) => k in patch && (e[k] = patch[k]));
      ['windowText', 'note'].forEach((k) => k in patch && (e[k] = patch[k].trim()));
    });
    return { ok: true };
  }
  function setTarget(date) {
    if (date !== '' && !validDate(date)) return { ok: false, error: 'That is not a real date.' };
    store.mutate('exams', (d) => {
      const clean = sanitize(d);
      d.list = clean.list;
      d.target = date;
    });
    return { ok: true };
  }

  S.exams = { STATUS: STATUS, STATUS_LABEL: STATUS_LABEL, MAX: MAX, validDate: validDate, sanitize: sanitize, list: list, get: get, target: target, countdown: countdown, update: update, setTarget: setTarget };
})((window.SOS = window.SOS || {}));

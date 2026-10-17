/* summary.js — the plain-text progress summary behind "Send progress" (More page). No DOM, no network.
 *
 * It reads the store and the Learn data and writes a short text: app version and date, per subject the chapters done and lectures
 * watched, the last test attempts (date, name, score, time), the weakest chapters (counts only, never her own words), the streak
 * and this week's study time. Computer Science is "Coming soon" and is left out. `lastSent` is kept in its own localStorage key,
 * not in the store: the store schema is unchanged and the date stays on this phone (it is not part of a backup).
 */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const L = S.learn;
  const store = S.store;

  const SENT_KEY = 'sos.v2.lastSent';
  const WEEK_DAYS = 7;
  const STALE_DAYS = 7;
  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths' };

  const isDone = (id) => {
    const s = E.chap(id).s;
    return s === 'done' || s === 'mastered';
  };

  function weekMinutes(todayIso) {
    const log = store.get('analytics').log || {};
    let min = 0;
    for (let i = 0; i < WEEK_DAYS; i++) min += (log[u.addDays(todayIso, -i)] || {}).min || 0;
    return Math.round(min);
  }

  function subjectLines() {
    return D.SUBJECT_ORDER.filter((s) => !D.COMING_SOON[s]).map((s) => {
      const list = D.BY_SUBJECT[s];
      let watched = 0;
      let total = 0;
      list.forEach((c) => {
        const w = L.watchedCount(c.id);
        watched += w.watched;
        total += w.total;
      });
      return NAMES[s] + ': ' + list.filter((c) => isDone(c.id)).length + ' of ' + list.length + ' chapters done, ' + watched + ' of ' + total + ' lectures watched';
    });
  }

  function attemptLines() {
    const items = (store.get('attempts').items || []).filter((a) => a.status === 'submitted');
    items.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    return items.slice(0, 10).map((a) => {
      const mins = a.startedAt && a.submittedAt ? Math.max(1, Math.round((a.submittedAt - a.startedAt) / 60000)) : 0;
      return a.date + ' · ' + String(a.title || a.mode || 'Test') + ' · ' + a.score + '/' + a.maxScore + (mins ? ' · ' + mins + ' min' : '');
    });
  }

  // Counts only: wrong answers in submitted tests and open mistakes in the error notebook, per chapter.
  function weakLines() {
    const wrong = {};
    (store.get('attempts').items || []).forEach((a) => {
      if (a.status !== 'submitted') return;
      (a.questions || []).forEach((q) => {
        if (q.sel != null && q.ok === false && q.ch) wrong[q.ch] = (wrong[q.ch] || 0) + 1;
      });
    });
    const open = {};
    (store.get('errors').items || []).forEach((e) => {
      if (!e.resolved && e.chId) open[e.chId] = (open[e.chId] || 0) + 1;
    });
    const ids = Object.keys(Object.assign({}, wrong, open)).filter((id) => D.CH[id] && !D.COMING_SOON[D.CH[id].subj]);
    ids.sort((a, b) => (wrong[b] || 0) + (open[b] || 0) - ((wrong[a] || 0) + (open[a] || 0)) || a.localeCompare(b));
    return ids.slice(0, 5).map((id) => D.CH[id].name + ': ' + (wrong[id] || 0) + ' wrong in tests, ' + (open[id] || 0) + ' open in the mistake notebook');
  }

  // opts.now: a time in ms (tests); default is the real time.
  function build(opts) {
    const now = opts && opts.now != null ? opts.now : Date.now();
    const todayIso = u.iso(new Date(now));
    const st = E.streak();
    const mins = weekMinutes(todayIso);
    const att = attemptLines();
    const weak = weakLines();
    const lines = [];
    lines.push('Engineering 2027 Study OS, version ' + S.APP_VERSION + ', ' + todayIso);
    lines.push('Name: ' + (store.get('profile').name || '-'));
    lines.push('');
    lines.push('Chapters and lectures');
    subjectLines().forEach((l) => lines.push('- ' + l));
    lines.push('');
    lines.push('Tests (last ' + Math.max(att.length, 0) + ')');
    if (att.length) att.forEach((l) => lines.push('- ' + l));
    else lines.push('- none yet');
    lines.push('');
    lines.push('Weakest chapters');
    if (weak.length) weak.forEach((l) => lines.push('- ' + l));
    else lines.push('- none yet');
    lines.push('');
    lines.push('Streak: ' + st.current + (st.current === 1 ? ' day' : ' days'));
    lines.push('Study time this week: ' + Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min');
    return lines.join('\n');
  }

  /* ---------- "Last sent" (this phone only) ---------- */
  function lastSent() {
    try {
      const v = localStorage.getItem(SENT_KEY);
      return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
    } catch (e) {
      return '';
    }
  }
  function markSent(iso) {
    try {
      localStorage.setItem(SENT_KEY, iso || u.today());
    } catch (e) {
      /* private mode: the date is simply not kept */
    }
  }
  // true when nothing was sent yet, or the last send was more than 7 days ago (the dot on the More tile).
  function dotDue(todayIso) {
    const last = lastSent();
    return !last || u.diffDays(todayIso || u.today(), last) > STALE_DAYS;
  }

  S.summary = { build: build, lastSent: lastSent, markSent: markSent, dotDue: dotDue, SENT_KEY: SENT_KEY, STALE_DAYS: STALE_DAYS };
})((window.SOS = window.SOS || {}));

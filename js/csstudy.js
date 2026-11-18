/* csstudy.js — HSC Computer Science study logic (no DOM), used by js/views-csboard.js and tested in tests/cs-study.test.js.
 *   Most asked topics: S.CS_HOT (built by tools/build.py from data/cs-hot.json; `yrs` = the paper years that asked it, `n` = how many
 *     paper questions point into it). A topic counts as covered when any of its questions is done.
 *   Board readiness: the share of the most-asked marks she can already score, weighted by how often a topic is asked (n).
 *   Revise again: a question scored under 60% comes back after 2 days; any question below full marks comes back after 7 days.
 *   Today's set: up to 3 questions picked once a day (one to revise, one written question of the most-asked topic not covered yet,
 *     one MCQ). The pick is kept in the store (`cs.today`), so it does not change while she works through it.
 *   Paper attempts: a timed attempt is scored only from the answers marked after the timer started (`t`, a time stamp in each record). */
(function (S) {
  'use strict';
  const u = S.u;
  const R = {};

  R.ratio = (d) => (d ? (d.max > 0 ? d.got / d.max : 0) : null);

  // the most-asked topic of each question (if a question is in two topics, the one asked in more years wins)
  R.topicOf = (hot) => {
    const m = {};
    (hot || []).forEach((t) => t.m.forEach((id) => {
      const o = m[id];
      if (!o || t.yrs.length > o.yrs.length || (t.yrs.length === o.yrs.length && t.n > o.n)) m[id] = t;
    }));
    return m;
  };
  R.best = (t, done) => t.m.reduce((b, id) => Math.max(b, R.ratio(done[id]) || 0), 0);
  R.covered = (t, done) => t.m.some((id) => !!done[id]);
  // most asked first: more years, then more questions, then the order of the file
  R.order = (hot) => (hot || []).map((t, i) => ({ t: t, i: i })).sort((a, b) => b.t.yrs.length - a.t.yrs.length || b.t.n - a.t.n || a.i - b.i).map((x) => x.t);

  R.readiness = (hot, done) => {
    let w = 0, s = 0, cov = 0;
    (hot || []).forEach((t) => {
      const k = Math.max(1, t.n || 0);
      w += k;
      s += k * R.best(t, done);
      if (R.covered(t, done)) cov++;
    });
    return { pct: w ? Math.round((100 * s) / w) : 0, covered: cov, total: (hot || []).length };
  };

  // questions of topics asked in two or more years that are not done yet
  R.hotLeft = (hot, done) => {
    const ids = {};
    (hot || []).forEach((t) => { if (t.yrs.length >= 2) t.m.forEach((id) => { if (!done[id]) ids[id] = 1; }); });
    return Object.keys(ids).length;
  };

  // questions to revise today: [{id, ratio, days}], weakest first, then oldest
  R.due = (done, today) => Object.keys(done || {}).map((id) => {
    const d = done[id];
    const r = R.ratio(d);
    const days = d.at ? u.diffDays(today, d.at) : 0;
    return { id: id, ratio: r, days: days, due: (r < 0.6 && days >= 2) || (r < 1 && days >= 7) };
  }).filter((x) => x.due).sort((a, b) => a.ratio - b.ratio || b.days - a.days || (a.id < b.id ? -1 : 1));

  // pick today's set. `kind(id)` returns 'mcq' | 'short' | 'prog' or null when the question is unknown.
  R.pickToday = (hot, done, today, kind) => {
    const fresh = (id) => !done[id] || done[id].at === today; // done today still counts, so the pick is stable within the day
    const out = [];
    const due = R.due(done, today).filter((x) => kind(x.id));
    if (due.length) out.push({ id: due[0].id, why: 'revise' });
    const ord = R.order(hot);
    const topic = ord.filter((t) => !t.m.some((id) => done[id] && done[id].at !== today))[0];
    if (topic) {
      const w = topic.m.filter((id) => kind(id) && kind(id) !== 'mcq' && fresh(id) && !out.some((o) => o.id === id))[0];
      if (w) out.push({ id: w, why: 'hot', topic: topic.id });
    }
    for (const t of ord) {
      const m = t.m.filter((id) => kind(id) === 'mcq' && fresh(id) && !out.some((o) => o.id === id))[0];
      if (m) { out.push({ id: m, why: 'mcq', topic: t.id }); break; }
    }
    return out;
  };

  // a paper's score from the answers she marked (all of them, or only those marked between `since` and `until`, time stamps)
  R.paperScore = (p, done, since, until) => {
    const ok = (d) => d && (!since || (d.t || 0) >= since) && (!until || (d.t || 0) <= until);
    const need = (pt) => (pt.rule === 'all' ? pt.qs.length : Number(pt.rule.slice(-1)));
    const by = {};
    p.parts.forEach((pt) => {
      const got = pt.qs.map((q) => (ok(done[q.ref]) ? (done[q.ref].got / (done[q.ref].max || 1)) * q.marks : null)).filter((x) => x !== null).sort((a, b) => b - a).slice(0, need(pt));
      by[pt.id] = { got: got.reduce((n, x) => n + x, 0), tried: got.length, need: need(pt) };
    });
    let got = 0, tried = 0, total = 0;
    p.parts.forEach((pt) => {
      if (pt.id === '5or') return; // Q.5 and its OR set are alternatives: the better one counts
      const s = pt.id === '5' && by['5or'] && by['5or'].got > by['5'].got ? by['5or'] : by[pt.id];
      got += s.got; tried += s.tried; total += s.need;
    });
    return { got: Math.round(got * 10) / 10, tried: tried, total: total };
  };

  // estimated study minutes for a written answer: about 2 minutes a mark (an MCQ counts as one solved question instead)
  R.minutesFor = (marks) => 2 * marks;

  S.csstudy = R;
})((window.SOS = window.SOS || {}));

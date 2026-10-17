/* engine.js — all the "thinking": progress maths, spaced repetition, Study Next, forecast, badges.
 * Reads from the store; every write goes through store.mutate. No DOM in here. */
(function (S) {
  'use strict';
  const D = S.data;
  const u = S.u;
  const store = S.store;
  const E = (S.engine = {});

  const STATUS_CREDIT = { todo: 0, learning: 0.4, done: 0.85, mastered: 1 };
  const isDone = (s) => s === 'done' || s === 'mastered';

  /* ---------- chapters ---------- */
  function newCh() {
    return { s: 'todo', rev: 0, pyq: 0, pyqOk: 0, pyqT: 0, pyqSrc: '', mcq: 0, note: '', doneOn: '', srs: null, last: '' };
  }
  E.chap = (id) => Object.assign(newCh(), store.get('chapters')[id] || {});
  E.pyqTarget = (id) => {
    const c = E.chap(id);
    if (c.pyqT > 0) return c.pyqT;
    const w = D.CH[id].w;
    return u.clamp(Math.round(w * 6), 10, 60);
  };
  E.mutChap = (id, fn) =>
    store.mutate('chapters', (all) => {
      const x = all[id] || (all[id] = newCh());
      fn(x);
      x.last = u.today();
    });

  E.setStatus = (id, status) =>
    E.mutChap(id, (x) => {
      x.s = status;
      if (isDone(status) && !x.srs) {
        x.doneOn = u.today();
        x.srs = S.migrate.makeSrs(x.doneOn);
      }
      if (!isDone(status)) {
        x.srs = null;
        x.doneOn = '';
      }
    });

  E.reviseChapter = (id, step) =>
    E.mutChap(id, (x) => {
      if (!x.srs) return;
      const t = u.today();
      x.srs.d[step] = true;
      x.rev = (x.rev || 0) + 1;
      for (let j = step + 1; j < D.INTERVALS.length; j++) {
        const earliest = u.addDays(t, D.INTERVALS[j] - D.INTERVALS[step]);
        if (x.srs.a[j] < earliest) x.srs.a[j] = earliest;
      }
    });

  E.reviseError = (id, step) =>
    store.mutate('errors', (e) => {
      const it = e.items.filter((i) => i.id === id)[0];
      if (!it || !it.srs) return;
      const t = u.today();
      it.srs.d[step] = true;
      it.revs = (it.revs || 0) + 1;
      for (let j = step + 1; j < D.INTERVALS.length; j++) {
        const earliest = u.addDays(t, D.INTERVALS[j] - D.INTERVALS[step]);
        if (it.srs.a[j] < earliest) it.srs.a[j] = earliest;
      }
    });

  E.addQuestions = (chId, n, kind) => {
    // kind: 'mcq' | 'pyq'. Questions also count towards today's total.
    E.mutChap(chId, (x) => {
      if (kind === 'pyq') x.pyq = Math.max(0, x.pyq + n);
      else x.mcq = Math.max(0, x.mcq + n);
    });
    E.logStudy({ mcq: n, subj: D.CH[chId].subj });
  };

  /* ---------- daily log ---------- */
  E.logStudy = (o) => {
    const date = o.date || u.today();
    store.mutate('analytics', (a) => {
      const d = a.log[date] || (a.log[date] = { min: 0, mcq: 0, subj: {} });
      if (o.min) {
        d.min = Math.max(0, d.min + o.min);
        const k = o.subj || 'other';
        d.subj[k] = Math.max(0, (d.subj[k] || 0) + o.min);
      }
      if (o.mcq) d.mcq = Math.max(0, d.mcq + o.mcq);
    });
  };
  E.day = (iso) => store.get('analytics').log[iso] || { min: 0, mcq: 0, subj: {} };
  E.planDay = (iso) => store.get('planner').days[iso] || { done: false, t: {}, rev: false, notes: '' };

  /* ---------- progress ---------- */
  E.subjectProgress = (s) => {
    const list = D.BY_SUBJECT[s];
    const chapters = store.get('chapters');
    let credit = 0;
    let done = 0;
    let learning = 0;
    let hoursLeft = 0;
    list.forEach((c) => {
      const st = (chapters[c.id] && chapters[c.id].s) || 'todo';
      credit += STATUS_CREDIT[st];
      if (isDone(st)) done++;
      else {
        if (st === 'learning') learning++;
        hoursLeft += c.hours * (1 - STATUS_CREDIT[st]);
      }
    });
    return { done: done, total: list.length, learning: learning, pct: credit / list.length, hoursLeft: Math.round(hoursLeft) };
  };
  E.overall = () => {
    const chapters = store.get('chapters');
    let credit = 0;
    let total = 0;
    let hoursLeft = 0;
    let done = 0;
    D.CHAPTERS.forEach((c) => {
      const st = (chapters[c.id] && chapters[c.id].s) || 'todo';
      credit += STATUS_CREDIT[st] * c.hours;
      total += c.hours;
      hoursLeft += c.hours * (1 - STATUS_CREDIT[st]);
      if (isDone(st)) done++;
    });
    return { pct: credit / total, hoursLeft: Math.round(hoursLeft), done: done, total: D.CHAPTERS.length };
  };

  /* ---------- spaced repetition ---------- */
  E.due = () => {
    const items = [];
    const chapters = store.get('chapters');
    Object.keys(chapters).forEach((id) => {
      const x = chapters[id];
      if (!x.srs || !D.CH[id]) return;
      const i = x.srs.d.indexOf(false);
      if (i < 0) return;
      items.push({ kind: 'chapter', id: id, step: i, due: x.srs.a[i], title: D.CH[id].name, subj: D.CH[id].subj });
    });
    store.get('errors').items.forEach((e) => {
      if (e.resolved || !e.srs) return;
      const i = e.srs.d.indexOf(false);
      if (i < 0) return;
      items.push({ kind: 'error', id: e.id, step: i, due: e.srs.a[i], title: e.chapter || 'Error', subj: e.subj });
    });
    const t = u.today();
    items.forEach((it) => (it.late = u.diffDays(t, it.due)));
    return items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  };
  E.dueCounts = () => {
    const items = E.due();
    return {
      overdue: items.filter((i) => i.late > 0).length,
      today: items.filter((i) => i.late === 0).length,
      week: items.filter((i) => i.late < 0 && i.late >= -7).length,
    };
  };

  /* ---------- streaks & totals ---------- */
  function activeDays() {
    const a = store.get('analytics').log;
    const p = store.get('planner').days;
    const set = {};
    Object.keys(a).forEach((d) => {
      if (a[d].min >= 60 || a[d].mcq >= 30) set[d] = 1;
    });
    Object.keys(p).forEach((d) => {
      if (p[d].done) set[d] = 1;
    });
    return set;
  }
  E.isActive = (iso) => !!activeDays()[iso];
  E.streak = () => {
    const set = activeDays();
    const t = u.today();
    let cur = 0;
    let d = set[t] ? t : u.addDays(t, -1);
    while (set[d]) {
      cur++;
      d = u.addDays(d, -1);
    }
    const days = Object.keys(set).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    days.forEach((x) => {
      run = prev && u.diffDays(x, prev) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = x;
    });
    return { current: cur, best: best, activeToday: !!set[t] };
  };

  E.mockPct = (m) => (m.total > 0 ? (m.score / m.total) * 100 : 0);
  E.mockAcc = (m) => {
    if (m.correct == null || m.wrong == null) return null;
    const att = m.correct + m.wrong;
    return att > 0 ? (m.correct / att) * 100 : null;
  };

  E.stats = () => {
    const a = store.get('analytics');
    const chapters = store.get('chapters');
    const errors = store.get('errors').items;
    const mocks = store.get('mocks').items;
    const st = { totalMin: 0, totalMcq: 0, focusMin: 0, doneBySubj: {}, chaptersDone: 0 };
    Object.keys(a.log).forEach((d) => {
      st.totalMin += a.log[d].min;
      st.totalMcq += a.log[d].mcq;
    });
    a.sessions.forEach((s) => (st.focusMin += s.min));
    D.SUBJECT_ORDER.forEach((s) => (st.doneBySubj[s] = 0));
    D.CHAPTERS.forEach((c) => {
      if (chapters[c.id] && isDone(chapters[c.id].s)) {
        st.chaptersDone++;
        st.doneBySubj[c.subj]++;
      }
    });
    st.mocks = mocks.length;
    st.bestMockPct = mocks.reduce((m, x) => Math.max(m, E.mockPct(x)), 0);
    st.errors = errors.length;
    st.errorsResolved = errors.filter((e) => e.resolved).length;
    st.revisions =
      Object.keys(chapters).reduce((n, k) => n + (chapters[k].rev || 0), 0) +
      errors.reduce((n, e) => n + (e.revs || 0), 0);
    st.cards = store.get('flashcards').seen;
    const pd = store.get('planner').days;
    st.plannerDone = Object.keys(pd).filter((k) => pd[k].done).length;
    const sk = E.streak();
    st.streak = sk.current;
    st.bestStreak = sk.best;
    st.thermo = chapters['phy-12-04'] && isDone(chapters['phy-12-04'].s) ? 1 : 0;
    return st;
  };

  /* ---------- chapter-list filters (static chapter attributes only) ---------- */
  // One predicate per filter option. The subject screen uses these both to filter the list
  // and to decide which options to show, so the two can't disagree.
  E.CHAPTER_FILTERS = {
    cls: { 11: (c) => c.std === 11, 12: (c) => c.std === 12 },
    exam: { board: (c) => c.board, cet: (c) => c.cet, jee: (c) => c.jee !== 'no' },
    hy: { on: (c) => c.hy },
  };
  // For a list of chapters, the options in each group that actually narrow the list: at
  // least one chapter matches AND at least one does not (other filters at "All"). An
  // option matching none always gives an empty list; one matching all gives the same list
  // as "All". Either way it's noise, so the UI hides it. Driven by the data, not by subject.
  // That is why chip rows differ between subjects, by design: CET is hidden on phy/chem/mth
  // because every chapter there is in the CET syllabus (100% match), JEE is also hidden on
  // physics (every chapter is JEE yes/partial), and CS shows no chips at all because it is
  // Board-only and 12th-only (every chip matches 0% or 100% of its 9 chapters).
  E.availableFilters = (chapters) => {
    const out = {};
    Object.keys(E.CHAPTER_FILTERS).forEach((group) => {
      const opts = E.CHAPTER_FILTERS[group];
      out[group] = Object.keys(opts).filter((k) => chapters.some(opts[k]) && !chapters.every(opts[k]));
    });
    return out;
  };

  /* ---------- weak / strong chapters ---------- */
  E.weakness = (chId) => {
    let score = 0;
    const errs = store.get('errors').items;
    errs.forEach((e) => {
      if (e.chId === chId) score += e.resolved ? 0.5 : 2;
    });
    store.get('mocks').items.forEach((m) => {
      if (m.weak && m.weak.indexOf(chId) >= 0) score += 3;
    });
    const c = E.chap(chId);
    if (c.pyq >= 5 && c.pyqOk / c.pyq < 0.6) score += 4;
    return score;
  };
  E.weakList = (n) =>
    D.CHAPTERS.map((c) => ({ c: c, score: E.weakness(c.id) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, n || 5);
  E.strongList = (n) =>
    D.CHAPTERS.filter((c) => isDone(E.chap(c.id).s))
      .map((c) => {
        const x = E.chap(c.id);
        const acc = x.pyq >= 5 ? x.pyqOk / x.pyq : 0.5;
        return { c: c, score: (x.s === 'mastered' ? 2 : 0) + x.rev + acc * 3 - E.weakness(c.id) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, n || 5);

  /* ---------- today / week ---------- */
  E.currentSlot = () => {
    const now = u.minutesNow();
    let next = null;
    for (let i = 0; i < D.TIMETABLE.length; i++) {
      const s = D.TIMETABLE[i];
      if (now >= u.toMin(s.from) && now < u.toMin(s.to)) return { slot: s, state: 'now' };
      if (!next && now < u.toMin(s.from)) next = s;
    }
    return next ? { slot: next, state: 'next' } : { slot: null, state: 'over' };
  };

  E.todayProgress = () => {
    const p = store.get('profile');
    const t = u.today();
    const log = E.day(t);
    const slots = store.get('planner').slots[t] || {};
    const blocks = D.TIMETABLE.filter((s) => slots[s.id]).length;
    const hoursR = u.clamp(log.min / (p.hours * 60), 0, 1);
    const mcqR = u.clamp(log.mcq / p.mcq, 0, 1);
    const blockR = blocks / D.TIMETABLE.length;
    const day = D.PLAN_BY_DATE[t];
    const pd = E.planDay(t);
    const arcs = {};
    ['phy', 'chem', 'mth', 'cs'].forEach((s) => {
      const key = { phy: 'p', chem: 'c', mth: 'm', cs: 's' }[s];
      arcs[s] = day && day[key] ? (pd.t[key] ? 1 : 0) : 0;
    });
    return {
      pct: (hoursR + mcqR + blockR) / 3,
      hoursR: hoursR, mcqR: mcqR, blockR: blockR,
      minutes: log.min, mcq: log.mcq, blocks: blocks, arcs: arcs,
    };
  };

  E.weekProgress = () => {
    const t = u.today();
    const dow = u.dow(t);
    const monday = u.addDays(t, -((dow + 6) % 7));
    const days = [];
    const arcs = { phy: [0, 0], chem: [0, 0], mth: [0, 0], cs: [0, 0] };
    let done = 0;
    let planned = 0;
    for (let i = 0; i < 7; i++) {
      const iso = u.addDays(monday, i);
      const plan = D.PLAN_BY_DATE[iso];
      const pd = E.planDay(iso);
      days.push({ iso: iso, plan: !!plan, done: !!pd.done, active: E.isActive(iso), today: iso === t });
      if (plan) {
        planned++;
        if (pd.done) done++;
        [['phy', 'p'], ['chem', 'c'], ['mth', 'm'], ['cs', 's']].forEach((k) => {
          if (plan[k[1]]) {
            arcs[k[0]][1]++;
            if (pd.t[k[1]]) arcs[k[0]][0]++;
          }
        });
      }
    }
    return { days: days, done: done, planned: planned, arcs: arcs, monday: monday };
  };

  /* ---------- Study Next ---------- */
  E.studyNext = () => {
    const t = u.today();
    const overdue = E.due().filter((i) => i.late > 0);
    const dayPlan = D.PLAN_BY_DATE[t];
    const inPlan = {};
    if (dayPlan) ['m', 'p', 'c', 's'].forEach((k) => dayPlan[k] && dayPlan[k].ch && (inPlan[dayPlan[k].ch] = 1));
    const cs = E.currentSlot();
    const slotSubj = cs.slot ? cs.slot.subj : '';
    const scored = [];
    D.CHAPTERS.forEach((c) => {
      const x = E.chap(c.id);
      if (isDone(x.s)) return;
      const reasons = [];
      const prio = c.cetPri || c.jeePri ? (c.cetPri + c.jeePri) / 2 : 2;
      // Weights are % within a subject; CS has fewer chapters and is board-only, so it counts for less here.
      let score = c.w * (0.7 + 0.15 * prio) * (c.subj === 'cs' ? 0.45 : 1);
      if (c.hy) reasons.push('High weightage (~' + c.w + '%)');
      if (inPlan[c.id]) {
        score += c.subj === 'cs' ? 6 : 14;
        reasons.push("In today's plan");
      }
      if (x.s === 'learning') {
        score += 5;
        reasons.push('Already started');
      }
      if (slotSubj === c.subj) score += 8;
      const w = E.weakness(c.id);
      if (w > 0) {
        score += Math.min(10, w * 1.5);
        reasons.push('Needs work');
      }
      const unready = c.deps.filter((d) => !isDone(E.chap(d).s));
      if (unready.length) {
        score -= 8;
        reasons.push('Learn ' + D.CH[unready[0]].name + ' first');
      } else if (c.deps.length) reasons.push('Prerequisites done');
      scored.push({ chapter: c, score: score, reasons: reasons.slice(0, 3) });
    });
    scored.sort((a, b) => b.score - a.score);
    return {
      overdue: overdue[0] || null,
      overdueCount: overdue.length,
      pick: scored[0] || null,
      alts: scored.slice(1, 3),
    };
  };

  E.dailyRecs = () => {
    const recs = [];
    const sn = E.studyNext();
    const dc = E.dueCounts();
    if (dc.overdue + dc.today > 0)
      recs.push({ icon: 'refresh', title: 'Clear ' + (dc.overdue + dc.today) + ' due revision' + (dc.overdue + dc.today > 1 ? 's' : ''), sub: dc.overdue ? dc.overdue + ' overdue' : 'Due today', go: '#/revision' });
    if (sn.pick) recs.push({ icon: 'book', title: sn.pick.chapter.name, sub: sn.pick.reasons[0] || 'Next best chapter', go: '#/subjects/' + sn.pick.chapter.subj + '?open=' + sn.pick.chapter.id });
    const weak = E.weakList(1)[0];
    if (weak) recs.push({ icon: 'target', title: 'Practise ' + weak.c.name, sub: 'Your weakest chapter right now', go: '#/subjects/' + weak.c.subj + '?open=' + weak.c.id });
    const mocks = store.get('mocks').items;
    const last = mocks.length ? mocks.map((m) => m.date).sort().pop() : '';
    if (!last || u.diffDays(u.today(), last) >= 7)
      recs.push({ icon: 'clipboard', title: 'Take a mock test', sub: last ? 'Last one was ' + u.diffDays(u.today(), last) + ' days ago' : 'You have not logged one yet', go: '#/tests' });
    return recs.slice(0, 4);
  };

  E.nextMock = () => {
    const t = u.today();
    for (let i = 0; i < D.PLAN.length; i++) {
      const d = D.PLAN[i];
      if (d.date >= t && d.phase === 'MOCK') return d;
    }
    return null;
  };

  /* ---------- forecast ---------- */
  E.forecast = () => {
    const a = store.get('analytics').log;
    const t = u.today();
    const window = 14;
    let min = 0;
    let days = 0;
    for (let i = 0; i < window; i++) {
      const iso = u.addDays(t, -i);
      if (a[iso] && a[iso].min > 0) {
        min += a[iso].min;
        days++;
      }
    }
    const o = E.overall();
    if (days < 3) return { ok: false, reason: 'Track study time on 3 different days to unlock this.' };
    if (o.hoursLeft <= 0) return { ok: true, done: true };
    const perDay = min / days / 60; // average over days she actually studied
    const need = Math.ceil(o.hoursLeft / Math.max(perDay, 0.25));
    return { ok: true, date: u.addDays(t, need), days: need, perDay: perDay, hoursLeft: o.hoursLeft };
  };

  /* ---------- badges ---------- */
  const allDone = (s) => (st) => st.doneBySubj[s];
  E.BADGES = [
    { id: 'streak7', title: '7-day streak', desc: 'Study 7 days in a row', tier: 'silver', icon: 'flame', val: (s) => s.bestStreak, target: 7 },
    { id: 'streak30', title: '30-day streak', desc: 'Study 30 days in a row', tier: 'gold', icon: 'flame', val: (s) => s.bestStreak, target: 30 },
    { id: 'mcq100', title: '100 MCQs', desc: 'Solve 100 questions', tier: 'bronze', icon: 'target', val: (s) => s.totalMcq, target: 100 },
    { id: 'mcq1000', title: '1,000 MCQs', desc: 'Solve 1,000 questions', tier: 'silver', icon: 'target', val: (s) => s.totalMcq, target: 1000 },
    { id: 'mcq5000', title: '5,000 MCQs', desc: 'Solve 5,000 questions', tier: 'gold', icon: 'target', val: (s) => s.totalMcq, target: 5000 },
    { id: 'mock1', title: 'First mock', desc: 'Log your first mock test', tier: 'bronze', icon: 'clipboard', val: (s) => s.mocks, target: 1 },
    { id: 'mock10', title: 'Ten mocks', desc: 'Log 10 mock tests', tier: 'silver', icon: 'clipboard', val: (s) => s.mocks, target: 10 },
    { id: 'mock75', title: 'Scored 75%', desc: 'Score 75% or more in a mock', tier: 'silver', icon: 'trophy', val: (s) => Math.round(s.bestMockPct), target: 75 },
    { id: 'mock90', title: 'Scored 90%', desc: 'Score 90% or more in a mock', tier: 'gold', icon: 'trophy', val: (s) => Math.round(s.bestMockPct), target: 90 },
    { id: 'ch1', title: 'First chapter', desc: 'Finish one chapter', tier: 'bronze', icon: 'book', val: (s) => s.chaptersDone, target: 1 },
    { id: 'ch10', title: '10 chapters', desc: 'Finish 10 chapters', tier: 'silver', icon: 'book', val: (s) => s.chaptersDone, target: 10 },
    { id: 'thermo', title: 'Completed Thermodynamics', desc: 'Finish Thermodynamics (Physics)', tier: 'silver', icon: 'flame', val: (s) => s.thermo, target: 1 },
    { id: 'physics', title: 'Completed Physics', desc: 'Finish every Physics chapter', tier: 'gold', icon: 'atom', val: allDone('phy'), target: D.BY_SUBJECT.phy.length },
    { id: 'chem', title: 'Completed Chemistry', desc: 'Finish every Chemistry chapter', tier: 'gold', icon: 'flask', val: allDone('chem'), target: D.BY_SUBJECT.chem.length },
    { id: 'maths', title: 'Completed Maths', desc: 'Finish every Maths chapter', tier: 'gold', icon: 'sigma', val: allDone('mth'), target: D.BY_SUBJECT.mth.length },
    { id: 'cs', title: 'Completed CS', desc: 'Finish every CS chapter', tier: 'gold', icon: 'code', val: allDone('cs'), target: D.BY_SUBJECT.cs.length },
    { id: 'focus10', title: '10 focus hours', desc: 'Focus for 10 hours with the timer', tier: 'bronze', icon: 'timer', val: (s) => Math.floor(s.focusMin / 60), target: 10 },
    { id: 'focus100', title: '100 focus hours', desc: 'Focus for 100 hours with the timer', tier: 'gold', icon: 'timer', val: (s) => Math.floor(s.focusMin / 60), target: 100 },
    { id: 'err1', title: 'First mistake logged', desc: 'Add a question to the Error Notebook', tier: 'bronze', icon: 'notebook', val: (s) => s.errors, target: 1 },
    { id: 'err10', title: 'Mistake fixer', desc: 'Resolve 10 errors', tier: 'silver', icon: 'notebook', val: (s) => s.errorsResolved, target: 10 },
    { id: 'rev10', title: '10 revisions', desc: 'Complete 10 spaced revisions', tier: 'silver', icon: 'refresh', val: (s) => s.revisions, target: 10 },
    { id: 'cards100', title: '100 flashcards', desc: 'Review 100 flashcards', tier: 'bronze', icon: 'cards', val: (s) => s.cards, target: 100 },
    { id: 'days30', title: '30 planner days', desc: 'Complete 30 days of the planner', tier: 'gold', icon: 'calendar', val: (s) => s.plannerDone, target: 30 },
  ];

  E.checkBadges = () => {
    const st = E.stats();
    const have = store.get('analytics').badges;
    const fresh = E.BADGES.filter((b) => !have[b.id] && b.val(st) >= b.target);
    if (fresh.length)
      store.mutate('analytics', (a) => {
        fresh.forEach((b) => (a.badges[b.id] = u.today()));
      });
    return fresh;
  };
})((window.SOS = window.SOS || {}));

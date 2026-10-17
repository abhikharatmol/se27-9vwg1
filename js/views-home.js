/* views/home.js — Dashboard. First screen: greeting, Study Next hero, countdowns, quick actions.
 * Everything else sits below the fold. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const ui = S.ui;
  const store = S.store;
  const CH = S.charts;
  S.views = S.views || {};

  const SUBJ = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths', cs: 'CS' };

  // Three exams in a row: JEE Main, HSC Board, MHT-CET. Days left only when a date is set; otherwise the expected window,
  // shortened to fit ("Mar–May 2027"; the full text is the chip's title). Her own syllabus target is on the Planner.
  const EXAM_ORDER = ['jee', 'hsc', 'cet'];
  const MON = /January|February|March|April|May|June|July|August|September|October|November|December/g;
  function countdowns() {
    const t = u.today();
    const X = S.exams;
    const list = X.list().slice().sort((a, b) => (EXAM_ORDER.indexOf(a.id) + 1 || 9) - (EXAM_ORDER.indexOf(b.id) + 1 || 9));
    const out = list.map((raw) => {
      const e = Object.assign({}, raw, { id: u.esc(raw.id), status: u.esc(raw.status) }); // already cleaned; escaped again for the attributes
      const c = X.countdown(e, t);
      const label = e.name.replace(/\s*2027.*$/, '') || e.name;
      const tag = '<span class="cd-s ' + e.status + '">' + X.STATUS_LABEL[e.status] + '</span>';
      if (c.kind === 'window' || c.kind === 'none') {
        const full = c.kind === 'window' ? c.text : 'No date set. Add it in Profile when the exam body publishes it.';
        const short = c.kind === 'window' ? c.text.replace(/\s*\(.*$/, '').replace(/^Expected\s+/i, '').replace(MON, (m) => m.slice(0, 3)).replace(/\s+to\s+/, '–') : 'No date yet';
        return '<div class="cd is-window" data-testid="cd-' + e.id + '" title="' + u.esc(e.name + ': ' + full) + '"><span class="cd-n">' + u.esc(short) + '</span><span class="cd-l">' + u.esc(label) + '</span><span class="cd-d">' + tag + '</span></div>';
      }
      const big = c.kind === 'done' ? 'Done' : c.kind === 'today' ? 'Today' : c.n;
      return '<div class="cd" data-testid="cd-' + e.id + '"><span class="cd-n">' + big + (c.kind === 'days' ? '<small>' + (c.n === 1 ? 'day' : 'days') + '</small>' : '') + '</span>' +
        '<span class="cd-l">' + u.esc(label) + '</span><span class="cd-d">' + u.esc(u.dateShort(e.date)) + ' ' + tag + '</span></div>';
    }).join('');
    return out ? '<section class="cds" aria-label="Exam countdowns">' + out + '</section>' : '';
  }

  // Her own syllabus goal (a date in Profile), shown on the Planner.
  function syllabusTarget() {
    const X = S.exams;
    if (!X.target()) return '';
    const c = X.countdown({ date: X.target() }, u.today());
    const big = c.kind === 'done' ? 'Done' : c.kind === 'today' ? 'Today' : c.n + (c.n === 1 ? ' day' : ' days');
    return '<section class="card row-between" data-testid="cd-target"><span><b>Syllabus target</b><br><small class="muted">' + u.esc(u.dateShort(X.target())) + '</small></span><b class="cd-n">' + big + '</b></section>';
  }

  const SUBJ_UP = { phy: 'PHYSICS', chem: 'CHEMISTRY', mth: 'MATHS', cs: 'COMPUTER SCIENCE' };

  // The big violet card: the lecture to carry on with (L.continueTarget): where she stopped, the next lecture, or a first one.
  function continueCard() {
    const L = S.learn;
    const t = L.continueTarget();
    if (!t) {
      return '<article class="cont is-empty" data-testid="continue-card"><div class="cont-body"><p class="cont-k">Start learning</p><h2 class="cont-t">Pick a chapter to watch</h2>' +
        '<button class="btn cont-btn rip" data-act="go" data-to="#/subjects">' + u.icon('play') + 'Open Subjects</button></div></article>';
    }
    const c = D.CH[t.ch];
    const p = L.progress(t.v.id) || {};
    const pct = p.dur > 0 ? Math.max(0, Math.min(1, (p.pos || 0) / p.dur)) : 0;
    const why = { resume: 'Carry on where you stopped', next: 'Your next lecture', pick: 'Her pick for this chapter', first: 'Start here', 'next-chapter': 'Start here' }[t.why] || 'Start here';
    const kick = SUBJ_UP[c.subj] + ' ' + c.std + (c.tb ? ' · CH ' + c.tb : '');
    const fmt = S.learnUI ? S.learnUI.fmtDur : (x) => Math.round(x / 60) + ' min';
    const left = p.dur > 0 ? fmt(Math.max(0, p.dur - (p.pos || 0))) + ' left' : t.v.d ? fmt(t.v.d) : '';
    return (
      '<article class="cont" data-testid="continue-card" data-s="' + c.subj + '"><div class="cont-body">' +
      '<div class="cont-thumb" aria-hidden="true">' + u.icon('play') + (navigator.onLine === false ? '' : '<img data-thumb alt="" loading="lazy" src="https://i.ytimg.com/vi/' + encodeURIComponent(t.v.id) + '/mqdefault.jpg">') + '</div>' +
      '<div class="cont-text"><p class="cont-k">' + u.esc(kick) + '</p><h2 class="cont-t">' + u.esc(c.name) + '</h2>' +
      '<p class="cont-s">' + (t.v.n ? 'Lecture ' + t.v.n + ' · ' : '') + u.esc(L.shortTitle(t.v.t)) + '</p></div></div>' +
      '<div class="cont-bar" role="progressbar" aria-label="Lecture progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct * 100) + '"><i style="width:' + Math.round(pct * 100) + '%"></i></div>' +
      '<div class="cont-foot"><span class="cont-why">' + why + (left ? ' · ' + left : '') + '</span>' +
      '<button class="btn cont-btn rip" data-act="go" data-to="#/watch/' + t.ch + '/' + t.v.id + '" data-testid="continue-watch">' + u.icon('play') + 'Watch now</button></div></article>'
    );
  }

  // One small row: streak and today's study time.
  function statRow(tp) {
    const sk = E.streak();
    return (
      '<section class="statrow" aria-label="Streak and study time" data-testid="home-stats">' +
      '<div class="stat"><span class="stat-i">' + u.icon('flame') + '</span><span><b>' + sk.current + '</b><small>day streak</small></span></div>' +
      '<div class="stat"><span class="stat-i">' + u.icon('clock') + '</span><span><b>' + u.fmtHours(tp.minutes) + '</b><small>studied today</small></span></div></section>'
    );
  }

  // "Today": resume the last video, revisions due, one practice set (js/today.js). Every row says
  // plainly when there is nothing for it.
  function todayPlanCard() {
    if (!S.today) return '';
    const t = S.today.card();
    const row = (to, act, icon, title, sub, testid) =>
      '<li><button class="rec rip" ' + (act ? 'data-act="' + act + '"' : 'data-act="go" data-to="' + u.esc(to) + '"') + ' data-testid="' + testid + '">' + u.icon(icon) +
      '<span><b>' + u.esc(title) + '</b><small>' + u.esc(sub) + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>';
    const V = t.video;
    const vurl = V && V.v ? '#/watch/' + V.ch + '/' + V.v.id : '#/subjects';
    let vid;
    if (V && (V.kind === 'next' || V.kind === 'next-chapter')) {
      vid = row(vurl, '', 'play', 'Next: ' + S.learn.shortTitle(V.v.t), (V.kind === 'next-chapter' ? 'Next chapter · ' : V.from.n ? 'After lecture ' + V.from.n + ' · ' : '') + D.CH[V.ch].name, 'today-video');
    } else if (V) vid = row('#/subjects', '', 'play', 'That is the last lecture here', 'Pick your next chapter in Subjects', 'today-video');
    else vid = row('#/subjects', '', 'play', 'No video yet', 'Open Subjects to pick a chapter', 'today-video');
    const rev = t.revision
      ? row('#/revision', '', 'refresh', u.plural(t.revision.count, 'revision') + ' due' + (t.revision.overdue ? ' (' + t.revision.overdue + ' overdue)' : ''), t.revision.titles.join(' · '), 'today-revision')
      : row('#/revision', '', 'refresh', 'Nothing due for revision today', 'Your revision schedule is up to date', 'today-revision');
    const why = { due: 'Due for revision', plan: 'In today’s plan', done: 'A done chapter' };
    const pr = t.practice
      ? '<li><button class="rec rip" data-act="today-practice" data-ch="' + t.practice.ch + '" data-testid="today-practice">' + u.icon('target') +
        '<span><b>Practice ' + t.practice.n + ' Qs · ' + u.esc(D.CH[t.practice.ch].name) + '</b><small>' + why[t.practice.reason] + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>'
      : row('#/practice', '', 'target', 'No practice set yet', 'Mark a chapter with questions Done', 'today-practice');
    return '<section class="card list-card" aria-label="Today" data-testid="today-card"><h2 class="h3">Today</h2><ul class="recs">' + vid + rev + pr + '</ul></section>';
  }

  function todayCard(p, tp) {
    const day = D.PLAN_BY_DATE[u.today()];
    const pd = E.planDay(u.today());
    let topics = '';
    if (day) {
      [['m', 'mth', 'Maths'], ['p', 'phy', 'Physics'], ['c', 'chem', 'Chemistry'], ['s', 'cs', 'CS']].forEach((k) => {
        if (day[k[0]])
          topics += '<li data-s="' + k[1] + '"' + (pd.t[k[0]] ? ' class="is-done"' : '') + '><i class="dot"></i><span>' + u.esc(day[k[0]].t) + '</span></li>';
      });
    }
    return (
      '<section class="card"><div class="row-between"><h2 class="h3">Today’s target</h2>' +
      '<button class="link" data-act="go" data-to="#/planner">Open planner</button></div>' +
      '<div class="targets">' +
      target('Study time', u.fmtHours(tp.minutes) + ' / ' + p.hours + 'h', tp.hoursR) +
      target('Questions', tp.mcq + ' / ' + p.mcq, tp.mcqR) +
      target('Timetable', tp.blocks + ' / ' + D.TIMETABLE.length, tp.blockR) +
      '</div>' +
      (topics ? '<ul class="topics">' + topics + '</ul>' : '<p class="muted small" style="margin-top:12px">No planner day for today. Use Study next above.</p>') +
      '</section>'
    );
  }
  function target(label, val, r) {
    return '<div class="tgt"><div class="row-between"><span class="small muted">' + label + '</span><b class="small">' + val + '</b></div>' + CH.bar(r) + '</div>';
  }

  function timetable() {
    const t = u.today();
    const slots = store.get('planner').slots[t] || {};
    const cs = E.currentSlot();
    let out = '<section class="card"><div class="row-between"><h2 class="h3">Today’s timetable</h2><span class="small muted">' + Object.keys(slots).length + ' of ' + D.TIMETABLE.length + ' done</span></div><ol class="tl">';
    D.TIMETABLE.forEach((s) => {
      const done = !!slots[s.id];
      const isNow = cs.slot && cs.slot.id === s.id && cs.state === 'now';
      const isNext = cs.slot && cs.slot.id === s.id && cs.state === 'next';
      const sd = { mth: 'mth', phy: 'phy', chem: 'chem' }[s.subj] || 'other';
      out +=
        '<li class="tl-i' + (done ? ' is-done' : '') + (isNow ? ' is-now' : '') + '" data-s="' + sd + '">' +
        '<span class="tl-t">' + u.clock(s.from) + '</span><i class="tl-dot"></i>' +
        '<span class="tl-b"><b>' + u.esc(s.label) + '</b><small>' + u.clock(s.from) + ' – ' + u.clock(s.to) + (isNow ? ' · Now' : isNext ? ' · Next' : '') + '</small></span>' +
        '<button class="check rip" role="checkbox" aria-checked="' + done + '" aria-label="Mark done: ' + u.esc(s.label) + '" data-act="slot-toggle" data-id="' + s.id + '">' + u.icon('check') + '</button></li>';
    });
    return out + '</ol></section>';
  }

  function weekCard() {
    const w = E.weekProgress();
    const sk = E.streak();
    const ring = CH.prism(
      D.SUBJECT_ORDER.map((s) => ({ p: w.arcs[s][1] ? w.arcs[s][0] / w.arcs[s][1] : 0, color: CH.subjColor(s) })),
      { size: 92, stroke: 8, center: '<b>' + w.done + '/' + (w.planned || 7) + '</b><small>days</small>', label: 'Week progress' }
    );
    const L = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dots = w.days
      .map((d, i) => '<span class="wd' + (d.done ? ' is-done' : d.active ? ' is-active' : '') + (d.today ? ' is-today' : '') + '" title="' + u.esc(u.dateShort(d.iso)) + '">' + L[i] + '</span>')
      .join('');
    return (
      '<section class="card week"><div class="week-ring">' + ring + '</div><div class="week-main"><h2 class="h3">This week</h2>' +
      '<div class="wds">' + dots + '</div>' +
      '<p class="streak-line">' + u.icon('flame', 'flame') + '<b>' + sk.current + '</b> day streak' + (sk.best > sk.current ? '<span class="muted small"> · best ' + sk.best + '</span>' : '') + '</p></div></section>'
    );
  }

  function mockCard() {
    const m = E.nextMock();
    if (!m) return '';
    const n = u.diffDays(m.date, u.today());
    return (
      '<section class="card row-card"><span class="chip-i tint-accent">' + u.icon('clipboard') + '</span>' +
      '<div class="grow"><h2 class="h3">Next mock test</h2><p class="muted small">' + u.esc(m.m.t) + ' · ' + u.esc(u.dateLong(m.date)) + (n === 0 ? ' (today)' : ' (in ' + u.plural(n, 'day') + ')') + '</p></div>' +
      '<button class="btn tonal sm" data-act="go" data-to="#/tests">Tests</button></section>'
    );
  }

  function recs() {
    const r = E.dailyRecs();
    if (!r.length) return '';
    return (
      '<section class="card"><h2 class="h3">Suggested for today</h2><ul class="recs">' +
      r.map((x) => '<li><button class="rec rip" data-act="go" data-to="' + u.esc(x.go) + '">' + u.icon(x.icon) + '<span><b>' + u.esc(x.title) + '</b><small>' + u.esc(x.sub) + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>').join('') +
      '</ul></section>'
    );
  }

  function habits(p) {
    const t = u.today();
    const h = store.get('habits').days[t] || {};
    const done = D.HABITS.filter((x) => h[x.id]).length;
    return (
      '<section class="card"><div class="row-between"><h2 class="h3">Daily habits</h2><span class="small muted">' + done + ' of ' + D.HABITS.length + '</span></div><ul class="habits">' +
      D.HABITS.map((x) => '<li><button class="habit rip" role="checkbox" aria-checked="' + !!h[x.id] + '" data-act="habit-toggle" data-id="' + x.id + '"><span class="check sm">' + u.icon('check') + '</span>' + u.esc(x.label.replace('10 study hours', p.hours + ' study hours').replace('90 MCQs', p.mcq + ' MCQs')) + '</button></li>').join('') +
      '</ul></section>'
    );
  }

  function quote() {
    const q = D.QUOTES[(new Date().getDate() + new Date().getMonth() * 3) % D.QUOTES.length];
    return '<figure class="quote"><blockquote>' + u.esc(q) + '</blockquote><figcaption class="small muted">Quote of the day</figcaption></figure>';
  }

  S.views.home = {
    title: 'Home',
    tab: 'home',
    fab: false, // the quick-add button covers the Today list here; it stays on the Planner and the other screens
    render(root) {
      const p = store.get('profile');
      const t = u.today();
      const day = D.PLAN_BY_DATE[t];
      const before = t < D.PLAN_START;
      const dayLine = day ? 'Day ' + day.n + ' of ' + D.PLAN.length : before ? 'Plan starts in ' + u.plural(u.diffDays(D.PLAN_START, t), 'day') : 'Your 90-day plan is complete';
      const tp = E.todayProgress();
      root.innerHTML =
        '<div class="page home">' + S.app.updateBannerHtml() +
        '<header class="greet"><h1 class="h1">' + u.greeting() + ', ' + u.esc(p.name) + '</h1><p class="muted">' + u.esc(u.dateLong(t)) + ' · ' + dayLine + '</p></header>' +
        countdowns(p) + continueCard() + todayPlanCard() + statRow(tp) +
        '</div>';
      u.$$('img[data-thumb]', root).forEach((img) => img.addEventListener('error', () => img.remove()));
    },
  };

  // The blocks that left Home (run 7); the Planner shows them under "Extras".
  S.homeBlocks = { syllabusTarget: syllabusTarget, targets: todayCard, timetable: timetable, week: weekCard, recs: recs, mock: mockCard, habits: habits, quote: quote };

  ui.actions['today-practice'] = (el) => S.practiceUI.start(el.dataset.ch);
  ui.actions['continue'] = (el) => {
    const id = el.dataset.ch;
    const go = () => {
      if (store.get('focus').run) return S.app.go('#/focus');
      if (id) store.mutate('focus', (f) => { f.subj = D.CH[id].subj; f.ch = id; });
      S.app.go('#/focus?start=1');
    };
    if (ui.sheet.isOpen()) {
      ui.sheet.close();
      setTimeout(go, 80);
    } else go();
  };
  ui.actions['slot-toggle'] = (el) => {
    const t = u.today();
    const id = el.dataset.id;
    store.mutate('planner', (p) => {
      const s = p.slots[t] || (p.slots[t] = {});
      if (s[id]) delete s[id];
      else s[id] = true;
    });
    u.haptic();
  };
  ui.actions['habit-toggle'] = (el) => {
    const t = u.today();
    const id = el.dataset.id;
    store.mutate('habits', (h) => {
      const d = h.days[t] || (h.days[t] = {});
      if (d[id]) delete d[id];
      else d[id] = true;
    });
    u.haptic();
  };
})((window.SOS = window.SOS || {}));

/* views/planner.js — 90-day planner. Month chips + month grid + week selector + expandable day cards. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const ui = S.ui;
  const store = S.store;
  const CH = S.charts;
  S.views = S.views || {};

  const KEYS = [
    ['m', 'mth', 'Maths'],
    ['p', 'phy', 'Physics'],
    ['c', 'chem', 'Chemistry'],
    ['s', 'cs', 'CS'],
  ];
  const WEEKS = Math.ceil(D.PLAN.length / 7);
  const state = { init: false, week: 0, open: '', month: '' };

  function weekOf(iso) {
    return u.clamp(Math.floor(u.diffDays(iso, D.PLAN_START) / 7), 0, WEEKS - 1);
  }
  function monthKey(iso) {
    return iso.slice(0, 7);
  }
  function months() {
    const out = [];
    D.PLAN.forEach((d) => {
      const k = monthKey(d.date);
      if (out.indexOf(k) < 0) out.push(k);
    });
    return out;
  }
  function init() {
    if (state.init) return;
    const t = u.today();
    const start = D.PLAN_BY_DATE[t] ? t : t < D.PLAN_START ? D.PLAN_START : D.PLAN_END;
    state.week = weekOf(start);
    state.open = start;
    state.month = monthKey(start);
    state.init = true;
  }
  function pdMut(iso, fn) {
    store.mutate('planner', (p) => {
      const d = p.days[iso] || (p.days[iso] = { done: false, t: {}, rev: false, notes: '' });
      fn(d);
    });
  }
  const mName = (k) => u.fmt(k + '-01', { month: 'short' });

  function monthGrid() {
    const k = state.month;
    const first = k + '-01';
    const lead = (u.dow(first) + 6) % 7;
    const dim = new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate();
    const t = u.today();
    let out = '<div class="mgrid" role="grid" aria-label="' + u.esc(u.fmt(first, { month: 'long', year: 'numeric' })) + '">';
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((l) => (out += '<span class="mh" role="columnheader">' + l + '</span>'));
    // Build week rows (Mon-Sun) and skip rows that hold no planned day, so Sept does not show 3 empty weeks.
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push({ blank: true });
    for (let n = 1; n <= dim; n++) cells.push({ n: n, iso: k + '-' + String(n).padStart(2, '0') });
    while (cells.length % 7) cells.push({ blank: true });
    for (let w = 0; w < cells.length; w += 7) {
      const row = cells.slice(w, w + 7);
      if (!row.some((c) => c.iso && D.PLAN_BY_DATE[c.iso])) continue;
      row.forEach((c) => {
        if (c.blank) {
          out += '<span class="mc blank"></span>';
          return;
        }
        const day = D.PLAN_BY_DATE[c.iso];
        if (!day) {
          out += '<span class="mc off" aria-hidden="true"><span class="mc-n">' + c.n + '</span></span>';
          return;
        }
        const iso = c.iso;
        const pd = E.planDay(iso);
        const dots = KEYS.filter((x) => day[x[0]]).map((x) => '<i data-s="' + x[1] + '" class="' + (pd.t[x[0]] || pd.done ? 'on' : '') + '"></i>').join('');
        out +=
          '<button class="mc rip' + (iso === t ? ' is-today' : '') + (iso === state.open ? ' is-sel' : '') + (pd.done ? ' is-done' : '') + (day.phase === 'MOCK' ? ' is-mock' : '') + '" role="gridcell" data-act="pl-pick" data-d="' + iso + '" aria-label="' + u.esc(u.dateLong(iso) + (pd.done ? ', done' : '') + (day.phase === 'MOCK' ? ', mock day' : '')) + '">' +
          '<span class="mc-n">' + c.n + '</span><span class="mc-dots">' + dots + '</span></button>';
      });
    }
    return out + '</div>';
  }

  function dayCard(day) {
    const iso = day.date;
    const pd = E.planDay(iso);
    const open = state.open === iso;
    const log = E.day(iso);
    const t = u.today();
    const sum = ['m', 'p', 'c'].map((k) => day[k].t).join(' · ');
    const tp = KEYS.filter((k) => day[k[0]]);
    const doneCount = tp.filter((k) => pd.t[k[0]]).length;
    let body = '';
    if (open) {
      body += '<div class="day-b">';
      tp.forEach((k) => {
        const it = day[k[0]];
        const on = !!pd.t[k[0]];
        body +=
          '<div class="trow" data-s="' + k[1] + '"><button class="check rip" role="checkbox" aria-checked="' + on + '" aria-label="' + k[2] + ' done" data-act="pl-topic" data-d="' + iso + '" data-k="' + k[0] + '">' + u.icon('check') + '</button>' +
          '<div class="trow-b"><small>' + k[2] + '</small><b>' + u.esc(it.t) + '</b></div>' +
          (it.ch ? '<button class="icon-btn sm" aria-label="Open chapter ' + u.esc(D.CH[it.ch].name) + '" data-act="go" data-to="#/subjects/' + k[1] + '?open=' + it.ch + '">' + u.icon('chev-r') + '</button>' : '') + '</div>';
      });
      body +=
        '<div class="trow mcqrow"><div class="trow-b"><small>Question target</small><b>' + log.mcq + ' / ' + day.mcq + '</b>' + CH.bar(log.mcq / day.mcq, 'var(--accent)') + '</div>' +
        '<div class="stepper"><button class="icon-btn rip" aria-label="Remove 10 questions" data-act="pl-mcq" data-d="' + iso + '" data-n="-10">' + u.icon('minus') + '</button>' +
        '<button class="icon-btn rip" aria-label="Add 10 questions" data-act="pl-mcq" data-d="' + iso + '" data-n="10">' + u.icon('plus') + '</button></div></div>' +
        '<div class="trow"><button class="check rip" role="checkbox" aria-checked="' + !!pd.rev + '" aria-label="Revision done" data-act="pl-rev" data-d="' + iso + '">' + u.icon('check') + '</button>' +
        '<div class="trow-b"><small>Revision target</small><b>' + u.esc(day.rev) + '</b></div></div>' +
        '<label class="field"><span class="field-l">Notes</span><textarea rows="2" data-change="pl-note" data-d="' + iso + '" placeholder="What went well? What to fix tomorrow?">' + u.esc(pd.notes || '') + '</textarea></label>' +
        '<button class="btn ' + (pd.done ? 'tonal' : 'primary') + ' block rip" data-act="pl-done" data-d="' + iso + '">' + (pd.done ? 'Undo day complete' : 'Mark day complete') + '</button></div>';
    }
    return (
      '<article class="day' + (open ? ' is-open' : '') + (pd.done ? ' is-done' : '') + (iso === t ? ' is-today' : '') + '" id="day-' + iso + '">' +
      '<button class="day-h rip" aria-expanded="' + open + '" data-act="pl-open" data-d="' + iso + '">' +
      '<span class="day-date"><b>' + iso.slice(8).replace(/^0/, '') + '</b><small>' + u.fmt(iso, { weekday: 'short' }) + '</small></span>' +
      '<span class="day-sum"><span class="phase ph-' + day.phase + '">' + D.PHASES[day.phase] + '</span>' + (open ? '' : '<span class="day-t">' + u.esc(sum) + '</span>') + '</span>' +
      '<span class="day-state">' + (pd.done ? u.icon('check-c', 'ok') : '<small>' + doneCount + '/' + tp.length + '</small>') + u.icon('chev-d', 'chev') + '</span></button>' +
      body + '</article>'
    );
  }

  S.views.planner = {
    title: 'Planner',
    tab: 'planner',
    render(root) {
      init();
      const p = store.get('planner');
      const doneDays = D.PLAN.filter((d) => p.days[d.date] && p.days[d.date].done).length;
      const ms = months();
      const wStart = u.addDays(D.PLAN_START, state.week * 7);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = D.PLAN_BY_DATE[u.addDays(wStart, i)];
        if (d) days.push(d);
      }
      const wEnd = days[days.length - 1].date;
      root.innerHTML =
        '<div class="page">' +
        '<header class="page-h"><div><h1 class="h1">Planner</h1><p class="muted">' + doneDays + ' of ' + D.PLAN.length + ' days complete</p></div>' +
        CH.ring(doneDays / D.PLAN.length, { size: 56, stroke: 6, center: '<b class="small">' + Math.round((doneDays / D.PLAN.length) * 100) + '%</b>' }) + '</header>' +
        '<div class="legend-s"><span data-s="phy"><i class="dot"></i>Physics</span><span data-s="chem"><i class="dot"></i>Chemistry</span><span data-s="mth"><i class="dot"></i>Maths</span><span data-s="cs"><i class="dot"></i>CS</span></div>' +
        '<div class="seg" role="tablist" aria-label="Month">' + ms.map((k) => '<button role="tab" class="rip" aria-selected="' + (k === state.month) + '" data-act="pl-month" data-v="' + k + '">' + mName(k) + '</button>').join('') + '</div>' +
        '<section class="card">' + monthGrid() + '</section>' +
        '<div class="weeknav"><button class="icon-btn rip" aria-label="Previous week" data-act="pl-week" data-v="-1"' + (state.week === 0 ? ' disabled' : '') + '>' + u.icon('chev-l') + '</button>' +
        '<div class="grow center wk"><b>Week ' + (state.week + 1) + '</b><small class="muted">' + u.esc(u.dateShort(days[0].date)) + ' to ' + u.esc(u.dateShort(wEnd)) + '</small></div>' +
        '<button class="btn tonal sm" data-act="pl-today">Today</button>' +
        '<button class="icon-btn rip" aria-label="Next week" data-act="pl-week" data-v="1"' + (state.week === WEEKS - 1 ? ' disabled' : '') + '>' + u.icon('chev-r') + '</button></div>' +
        '<div class="days">' + days.map(dayCard).join('') + '</div>' +
        (D.UNPLANNED.length
          ? '<p class="muted small note-line">Not in the planner: ' + D.UNPLANNED.map((id) => u.esc(D.CH[id].name)).join(', ') + '. Study next still suggests them.</p>'
          : '') +
        extras() +
        '</div>';
    },
  };

  // What used to sit on Home (run 7): today's targets, timetable, week strip, recommendations, mock reminder, habits, quote.
  function extras() {
    const B = S.homeBlocks;
    if (!B) return '';
    const prof = store.get('profile');
    return '<section class="extras" aria-label="Extras" data-testid="planner-extras"><h2 class="h2">Today at a glance</h2>' +
      B.syllabusTarget() + B.targets(prof, S.engine.todayProgress()).replace('<button class="link" data-act="go" data-to="#/planner">Open planner</button>', '') + B.timetable() + B.week() + B.recs() + B.mock() + B.habits(prof) + B.quote() + '</section>';
  }

  function jump(iso) {
    state.week = weekOf(iso);
    state.open = iso;
    state.month = monthKey(iso);
  }
  ui.actions['pl-month'] = (el) => {
    const k = el.dataset.v;
    const first = D.PLAN.filter((d) => monthKey(d.date) === k)[0];
    state.month = k;
    if (first) jump(first.date);
    state.month = k;
    S.app.refresh(true);
  };
  ui.actions['pl-pick'] = (el) => {
    jump(el.dataset.d);
    S.app.refresh(true);
    const c = document.getElementById('day-' + el.dataset.d);
    if (c) c.scrollIntoView({ block: 'center', behavior: u.reducedMotion() ? 'auto' : 'smooth' });
  };
  ui.actions['pl-week'] = (el) => {
    state.week = u.clamp(state.week + Number(el.dataset.v), 0, WEEKS - 1);
    const d = u.addDays(D.PLAN_START, state.week * 7);
    state.open = d;
    state.month = monthKey(d);
    S.app.refresh(true);
  };
  ui.actions['pl-today'] = () => {
    const t = u.today();
    jump(D.PLAN_BY_DATE[t] ? t : t < D.PLAN_START ? D.PLAN_START : D.PLAN_END);
    S.app.refresh(true);
  };
  ui.actions['pl-open'] = (el) => {
    state.open = state.open === el.dataset.d ? '' : el.dataset.d;
    S.app.refresh(true);
  };
  ui.actions['pl-topic'] = (el) => {
    pdMut(el.dataset.d, (d) => {
      d.t[el.dataset.k] = !d.t[el.dataset.k];
      if (!d.t[el.dataset.k]) d.done = false;
    });
    u.haptic();
  };
  ui.actions['pl-rev'] = (el) => pdMut(el.dataset.d, (d) => (d.rev = !d.rev));
  ui.actions['pl-mcq'] = (el) => E.logStudy({ date: el.dataset.d, mcq: Number(el.dataset.n) });
  ui.actions['pl-done'] = (el) => {
    const iso = el.dataset.d;
    const day = D.PLAN_BY_DATE[iso];
    const was = E.planDay(iso).done;
    pdMut(iso, (d) => {
      d.done = !was;
      if (d.done) {
        KEYS.forEach((k) => day[k[0]] && (d.t[k[0]] = true));
        d.rev = true;
      }
    });
    if (!was) {
      u.haptic('ok');
      ui.toast('Day ' + day.n + ' complete');
    }
  };
  ui.changes['pl-note'] = (el) => pdMut(el.dataset.d, (d) => (d.notes = el.value.slice(0, 2000)));
})((window.SOS = window.SOS || {}));

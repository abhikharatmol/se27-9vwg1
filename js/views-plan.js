/* views/plan.js — #/plan: the exam calendar, targets, where the CET marks are, and the order to study in. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const store = S.store;
  const X = S.exams;
  S.views = S.views || {};

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths' };
  const view = { all: false };

  function examRow(e) {
    const c = X.countdown(e, u.today());
    const when = c.kind === 'window' ? c.text : c.kind === 'none' ? 'No date yet' : u.dateLong(e.date);
    const left = c.kind === 'days' ? c.n + (c.n === 1 ? ' day' : ' days') : c.kind === 'today' ? 'Today' : c.kind === 'done' ? 'Done' : '';
    return '<li class="pl-exam"><span class="pl-exam-b"><b>' + u.esc(e.name) + '</b><small>' + u.esc(when) + '</small>' + (e.note ? '<small class="muted">' + u.esc(e.note) + '</small>' : '') + '</span>' +
      '<span class="pl-exam-r"><b>' + left + '</b><span class="cd-s ' + u.esc(e.status) + '">' + X.STATUS_LABEL[e.status] + '</span></span></li>';
  }

  function calendar() {
    const t = u.today();
    const list = X.list().slice().sort((a, b) => (a.date && b.date ? (a.date < b.date ? -1 : 1) : a.date ? -1 : b.date ? 1 : 0));
    return '<section class="card stack" data-testid="plan-calendar"><h2 class="h3">Exam calendar</h2><ul class="pl-exams">' + list.map(examRow).join('') + '</ul>' +
      '<p class="small muted">Dates marked Expected are from news reports, not the exam bodies. Change them in Profile when the official notice is out. Today is ' + u.esc(u.dateShort(t)) + '.</p></section>';
  }

  // A and B chapters together against the CET target: why C chapters cannot be skipped for 170+.
  function abLine() {
    const t = S.plan.tiers();
    const ab = t.reduce((n, r) => n + r.tiers.A.marks + r.tiers.B.marks, 0);
    const a = t.reduce((n, r) => n + r.tiers.A.marks, 0);
    const total = t.reduce((n, r) => n + r.marks, 0);
    return 'A chapters carry <b>' + a + '</b> of ' + total + ' marks; A and B together carry <b>' + ab + '</b>. A score of 170 or more needs nearly every A and B mark plus some C, so C chapters are for later, not for never.';
  }

  function targets() {
    const g = store.get('profile').goals;
    const cov = S.plan.marksCovered();
    return '<section class="card stack" data-testid="plan-targets"><h2 class="h3">Targets</h2>' +
      '<div class="pl-goals"><div><small>MHT-CET</small><b>' + u.esc(g.cet) + '</b></div><div><small>JEE Main</small><b>' + u.esc(g.jee) + '</b></div><div><small>HSC Board</small><b>' + u.esc(g.hsc) + '</b></div></div>' +
      '<p class="small">Chapters you marked Done stand for about <b>' + cov.done + ' of ' + cov.total + '</b> CET marks. This is an estimate from past papers, not an official weightage.</p>' +
      '<p class="small" data-testid="plan-ab">' + abLine() + '</p></section>';
  }

  function marksMap() {
    const rows = S.plan.tiers().map((r) => {
      const cells = ['A', 'B', 'C'].map((t) => {
        const x = r.tiers[t];
        return '<td><b>' + x.marks + '</b><small>' + x.done + '/' + x.chapters + ' done</small></td>';
      }).join('');
      return '<tr><th scope="row">' + NAMES[r.subj] + '</th>' + cells + '<td><b>' + r.marks + '</b></td></tr>';
    }).join('');
    return '<section class="card stack" data-testid="plan-marks"><h2 class="h3">Where the CET marks are</h2>' +
      '<table class="pl-table"><thead><tr><th></th><th>A</th><th>B</th><th>C</th><th>All</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="small muted">Marks per paper. A = must do, B = important, C = if time allows. Class 12 gives about 80% of the paper; Class 11 matters more for JEE.</p></section>';
  }

  function paceCard() {
    const p = S.plan.pace();
    if (!p.exam) return '';
    const name = p.exam.name.replace(/\s*\(.*$/, '');
    return '<section class="card stack" data-testid="plan-pace"><h2 class="h3">Hours you need</h2>' +
      '<p>' + p.days + ' days to ' + u.esc(name) + '. The chapters still to do need about <b>' + Math.round(p.hoursAll) + ' hours</b> (' + Math.round(p.hoursA) + ' of them in A chapters).</p>' +
      '<p><b>' + p.perDayA + ' hours a day</b> finishes the A chapters before then. <b>' + p.perDayAll + ' hours a day</b> finishes everything.</p>' +
      '<p class="small muted">Hours per chapter are planning estimates, and they do not include revision or tests.</p></section>';
  }

  function nextList() {
    const all = S.plan.order();
    const shown = view.all ? all : all.slice(0, 12);
    const rows = shown.map((c) =>
      '<li><button class="rec rip" data-act="go" data-to="#/watch/' + c.id + '" data-testid="plan-ch"><i class="dot" data-s="' + c.subj + '"></i>' +
      '<span><b>' + u.esc(c.name) + '</b><small>' + NAMES[c.subj] + ' · Class ' + c.std + ' · ~' + c.cetMarks + ' ' + (c.cetMarks === 1 ? 'mark' : 'marks') + ' · ' + c.hours + ' h</small></span>' +
      '<span class="pl-tier t-' + c.cetTier + '" title="' + S.plan.TIER_LABEL[c.cetTier] + '">' + c.cetTier + '</span>' + u.icon('chev-r', 'chev') + '</button></li>').join('');
    return '<section class="card list-card" data-testid="plan-next"><h2 class="h3">Study in this order</h2>' +
      (rows ? '<ul class="recs">' + rows + '</ul>' : '<p class="muted small">Every chapter is marked Done.</p>') +
      (all.length > 12 ? '<button class="btn tonal block rip" data-act="plan-all">' + (view.all ? 'Show fewer' : 'Show all ' + all.length) + '</button>' : '') + '</section>';
  }

  S.views.plan = {
    title: 'Exam plan',
    tab: 'home',
    pushed: true,
    backHash: () => '#/home',
    render(root) {
      root.innerHTML = '<div class="page plan"><header class="page-h"><div><h1 class="h1">Exam plan</h1><p class="muted">Dates, targets, and the order that earns the most marks.</p></div></header>' +
        calendar() + targets() + paceCard() + marksMap() + nextList() + '</div>';
    },
  };
  S.ui.actions['plan-all'] = () => { view.all = !view.all; S.app.refresh(true); };
})((window.SOS = window.SOS || {}));

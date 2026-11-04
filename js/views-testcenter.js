/* views/testcenter.js — Test Center screens: mode picker + history (#/testcenter), the exam
 * (#/exam) and the result (#/result/<attemptId>). All timing, scoring and storage is in
 * js/testcenter.js (S.tc); this file only draws and forwards taps. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const ui = S.ui;
  const store = S.store;
  const TC = S.tc;
  S.views = S.views || {};

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths' };
  const DIFF = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  const form = { kind: 'chapters', subj: 'all', sel: new Set(), n: 20, jee: false };
  let shownSec = null; // exam: section index last drawn, to announce a lock

  function fmtClock(ms) {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (x) => String(x).padStart(2, '0');
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s % 60);
  }
  function fmtDur(ms) {
    const s = Math.round(ms / 1000);
    return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }
  const bank = () => TC.bankById();
  // Exam screen: sticky, so it can't be scrolled out of sight. Result screen: in the flow.
  const sampleBanner = (sticky) => '<p class="tc-sample' + (sticky ? ' is-sticky' : '') + '" role="note">Sample questions — for testing only</p>';

  /* ================= Test Center home ================= */
  function activeCard(a) {
    return (
      '<section class="card tc-active"><h2 class="h3">Test in progress</h2>' +
      '<p><b>' + u.esc(a.title) + '</b></p><p class="small muted">' + u.esc(TC.section(a).label) + ' · <span data-tc-left>' + fmtClock(TC.timeLeft(a, Date.now())) + '</span> left. The clock keeps running while you are away.</p>' +
      '<div class="row gap"><button class="btn primary grow rip" data-act="go" data-to="#/exam">' + u.icon('play') + 'Resume</button>' +
      '<button class="btn danger grow rip" data-act="tc-discard">Discard</button></div></section>'
    );
  }

  /* ---------- the builder: what do you want to take? ---------- */
  const SUBJ_PILLS = [['all', 'All'], ['phy', 'Physics'], ['chem', 'Chemistry'], ['mth', 'Maths']];
  const COUNT_CHIPS = [10, 20, 30, 50];

  // Questions per chapter that a test with this marking can draw on (CET marking is MCQ only).
  function countsFor(jee) {
    const m = {};
    (S.QUESTIONS || []).forEach((q) => {
      if (jee || q.type === 'mcq') m[q.ch] = (m[q.ch] || 0) + 1;
    });
    return m;
  }
  function builderChapters(counts) {
    return D.CHAPTERS.filter((c) => c.subj !== 'cs' && (form.subj === 'all' || c.subj === form.subj))
      .slice()
      // Chapters that have questions come first, so the list is useful while the bank is still growing.
      .sort((a, b) => (counts[b.id] ? 1 : 0) - (counts[a.id] ? 1 : 0) || D.SUBJECT_ORDER.indexOf(a.subj) - D.SUBJECT_ORDER.indexOf(b.subj) || a.std - b.std || a.idx - b.idx);
  }
  const markingText = (jee) => (jee ? 'JEE marking: +4 for a correct answer, −1 for a wrong one.' : 'CET marking: +1 Physics and Chemistry, +2 Maths, no negative marks.');

  function chaptersPanel() {
    const jee = form.jee;
    const counts = countsFor(jee);
    Array.from(form.sel).forEach((id) => !counts[id] && form.sel.delete(id));
    const list = builderChapters(counts);
    const pill = (act, on, label, data) => '<button type="button" class="chip sm rip" aria-pressed="' + on + '" data-act="' + act + '" ' + data + '>' + label + '</button>';
    const rows = list.map((c) => {
      const n = counts[c.id] || 0;
      const on = form.sel.has(c.id);
      return '<li><button type="button" class="tcb-ch rip" aria-pressed="' + on + '" data-act="tc-pick" data-id="' + c.id + '"' + (n ? '' : ' disabled') + ' data-testid="tcb-ch">' +
        '<span class="tcb-tick" aria-hidden="true">' + (on ? u.icon('check') : '') + '</span>' +
        '<span class="tcb-name"><b>' + u.esc(c.name) + '</b><small>' + NAMES[c.subj] + ' · Class ' + c.std + '</small></span>' +
        '<span class="tcb-n">' + (n ? n + ' Q' : 'Questions coming') + '</span></button></li>';
    }).join('');
    const ids = Array.from(form.sel);
    const avail = ids.reduce((t, id) => t + (counts[id] || 0), 0);
    const n = Math.min(form.n, avail);
    let mins = 0;
    if (avail) {
      const pace = ids.reduce((t, id) => t + (counts[id] || 0) * (jee ? TC.PACE.jee : TC.PACE.cet[D.CH[id].subj] || 0.9), 0) / avail;
      mins = Math.max(1, Math.round(n * pace));
    }
    const summary = ids.length
      ? '<p class="tcb-sum" data-testid="tcb-sum"><b>' + u.plural(n, 'question') + ' · ' + mins + ' min</b> from ' + u.plural(ids.length, 'chapter') + (n < form.n ? ' (all that are available)' : '') + '. ' + markingText(jee) + '</p>'
      : '<p class="tcb-sum muted" data-testid="tcb-sum">Tap one chapter, or several, to build your test.</p>';
    return (
      '<div class="chips tcb-pills" role="group" aria-label="Subject">' + SUBJ_PILLS.map((p) => pill('tc-subj', form.subj === p[0], p[1], 'data-subj="' + p[0] + '"')).join('') + '</div>' +
      '<div class="chips tcb-pills" role="group" aria-label="Marking">' + pill('tc-marking', !jee, 'CET marking', 'data-m="cet"') + pill('tc-marking', jee, 'JEE marking', 'data-m="jee"') + '</div>' +
      '<ul class="tcb-list" data-testid="tcb-list">' + (rows || '<li class="muted small">No chapters here.</li>') + '</ul>' +
      '<div class="chips tcb-pills" role="group" aria-label="How many questions"><span class="small muted">Questions</span>' + COUNT_CHIPS.map((k) => pill('tc-n', form.n === k, String(k), 'data-n="' + k + '"')).join('') + '</div>' +
      summary +
      '<button class="btn primary block rip" data-act="tc-start" data-mode="builder" data-testid="tcb-start"' + (ids.length ? '' : ' disabled') + '>' + u.icon('timer') + 'Start test</button>' +
      '<div class="row gap tcb-extra">' + (ids.length ? '<button class="link" data-act="tc-clear">Clear selection</button>' : '') +
      '<button class="link" data-act="tc-start" data-mode="quick" data-testid="tcb-quick"' + (Object.keys(counts).length ? '' : ' disabled') + '>Quick 10: random, 10 minutes</button></div>'
    );
  }

  function paperPanel(kind) {
    const all = TC.chaptersWithQuestions();
    if (kind === 'cet') {
      const have = TC.cetCount(all);
      return (
        '<ul class="tcb-facts"><li><b>150 questions, 200 marks, 180 minutes</b></li>' +
        '<li>Section 1: Physics + Chemistry, 100 questions (1 mark each), 90 minutes.</li>' +
        '<li>Section 2: Maths, 50 questions (2 marks each), 90 minutes.</li>' +
        '<li>No negative marking. Once Maths starts you cannot go back to Section 1.</li>' +
        '<li>About 20% of questions come from Class 11, 80% from Class 12.</li></ul>' +
        '<p class="small muted">Pattern as in the 2025 and 2026 papers. The CET Cell has not published 2027 yet. Check cetcell.mahacet.org.</p>' +
        (have < 150 ? '<p class="small tc-short">' + (have ? 'Only ' + have + ' of 150 questions are in the bank yet: this will be a short paper.' : 'No questions yet.') + '</p>' : '') +
        '<button class="btn primary block rip" data-act="tc-start" data-mode="cet" data-testid="tcb-cet"' + (have ? '' : ' disabled') + '>' + u.icon('timer') + 'Start CET paper</button>'
      );
    }
    const have = TC.jeeCount(all);
    return (
      '<ul class="tcb-facts"><li><b>75 questions, 300 marks, 180 minutes</b></li>' +
      '<li>Physics, Chemistry, Maths: 20 MCQ + 5 numerical each. All are compulsory. One clock; you can move freely.</li>' +
      '<li>+4 for a correct answer, −1 for a wrong one (MCQ and numerical).</li></ul>' +
      '<p class="small muted">Pattern as in the 2026 papers. Check the NTA bulletin for 2027 at jeemain.nta.nic.in.</p>' +
      (have < 75 ? '<p class="small tc-short">' + (have ? 'Only ' + have + ' of 75 questions are in the bank yet: this will be a short paper.' : 'No questions yet.') + '</p>' : '') +
      '<button class="btn primary block rip" data-act="tc-start" data-mode="jee" data-testid="tcb-jee"' + (have ? '' : ' disabled') + '>' + u.icon('timer') + 'Start JEE paper</button>'
    );
  }

  // The one place a test is started: three choices, then one button. Used on the Tests tab and on #/testcenter.
  function starterHtml() {
    const kinds = [['chapters', 'Chapters', 'One or many'], ['cet', 'CET paper', '150 Q · 200 marks'], ['jee', 'JEE paper', '75 Q · 300 marks']];
    return (
      '<section class="card stack tcb" data-testid="tc-builder"><h2 class="h3">Take a test</h2>' +
      '<div class="tcb-kinds" role="group" aria-label="Kind of test">' + kinds.map((k) =>
        '<button type="button" class="tcb-kind rip" aria-pressed="' + (form.kind === k[0]) + '" data-act="tc-kind" data-kind="' + k[0] + '" data-testid="tcb-kind-' + k[0] + '"><b>' + k[1] + '</b><small>' + k[2] + '</small></button>').join('') + '</div>' +
      (form.kind === 'chapters' ? chaptersPanel() : paperPanel(form.kind)) +
      '<button class="btn tonal block rip" data-act="go" data-to="#/pyq" data-testid="tests-pyq">' + u.icon('clipboard') + 'Past papers: timed answer sheet</button>' +
      '</section>'
    );
  }

  function modeCards() {
    return starterHtml();
  }

  function attemptsHtml() {
    const done = TC.all().items.filter((a) => a.status === 'submitted').slice().reverse();
    if (!done.length) return '';
    return (
      '<section class="card list-card"><h2 class="h3">Your attempts</h2><ul class="atts">' +
      done.map((a) => {
        const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
        return '<li><button class="att rip" data-act="go" data-to="#/result/' + a.id + '"><span class="att-p">' + pct + '%</span><span class="att-b"><b>' + u.esc(a.title) + '</b><small>' + u.esc(u.dateShort(a.date)) + ' · ' + a.score + '/' + a.maxScore + (a.sample ? ' · sample' : '') + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>';
      }).join('') +
      '</ul></section>'
    );
  }

  S.views.testcenter = {
    title: 'Test Center',
    tab: 'tests',
    pushed: true,
    render(root) {
      const a = TC.active();
      root.innerHTML = '<div class="page"><header class="page-h"><div><h1 class="h1">Test Center</h1><p class="muted">Timed tests from your done chapters, and full mocks.</p></div></header>' +
        (a ? activeCard(a) : '') + modeCards() + attemptsHtml() + '</div>';
    },
    tick() {
      const a = TC.active();
      const el = u.$('[data-tc-left]');
      if (a && el) el.textContent = fmtClock(TC.timeLeft(a, Date.now()));
    },
  };

  async function startMode(mode) {
    const opts = {};
    if (mode === 'builder') {
      // One chapter is a chapter test, two or more are a mix; the engine modes stay as they were.
      const ids = Array.from(form.sel);
      if (!ids.length) return ui.toast('Pick at least one chapter.');
      mode = ids.length === 1 ? 'chapter' : 'mix';
      Object.assign(opts, { chapters: ids, n: form.n, marking: form.jee ? 'jee' : 'cet' });
    }
    if (mode === 'quick') opts.chapters = TC.chaptersWithQuestions();
    await launch(() => TC.start(mode, opts));
  }

  // Navigate after a confirm dialog. Closing a sheet pops its history entry with an async
  // history.back(); navigating before that pop lands would be undone by it. So if the
  // sheet's entry is still on top, wait for its popstate, then go.
  function goAfterSheet(hash) {
    if (history.state && history.state.sheet) window.addEventListener('popstate', () => setTimeout(() => S.app.go(hash)), { once: true });
    else S.app.go(hash);
  }

  // Never silently replace a running test: offer to resume it, or discard it on purpose.
  async function launch(startFn) {
    let res = startFn();
    if (!res.ok && res.reason === 'active') {
      const resume = await ui.confirm({ title: 'A test is already running', text: '"' + res.attempt.title + '" is still in progress. Resume it?', ok: 'Resume', cancel: 'Discard it instead' });
      if (resume) return goAfterSheet('#/exam');
      const sure = await ui.confirm({ title: 'Discard the running test?', text: 'Its answers so far will be lost and it will not be scored.', ok: 'Discard and start', danger: true });
      if (!sure) return;
      TC.discardActive();
      res = startFn();
    }
    if (!res.ok) return ui.toast(res.error || 'Could not start the test.');
    u.haptic('ok');
    shownSec = null;
    goAfterSheet('#/exam');
  }

  ui.actions['tc-start'] = (el) => startMode(el.dataset.mode);
  const redraw = () => S.app.refresh(true);
  ui.actions['tc-kind'] = (el) => { form.kind = el.dataset.kind; redraw(); };
  ui.actions['tc-subj'] = (el) => { form.subj = el.dataset.subj; redraw(); };
  ui.actions['tc-marking'] = (el) => { form.jee = el.dataset.m === 'jee'; redraw(); };
  ui.actions['tc-n'] = (el) => { form.n = Number(el.dataset.n) || 20; redraw(); };
  ui.actions['tc-pick'] = (el) => {
    const id = el.dataset.id;
    if (form.sel.has(id)) form.sel.delete(id);
    else form.sel.add(id);
    redraw();
  };
  ui.actions['tc-clear'] = () => { form.sel.clear(); redraw(); };
  ui.actions['tc-numneg'] = () => store.mutate('profile', (p) => (p.testCenter.jeeNumNeg = !p.testCenter.jeeNumNeg));
  ui.actions['tc-discard'] = async () => {
    const a = TC.active();
    if (!a) return;
    const ok = await ui.confirm({ title: 'Discard this test?', text: '"' + a.title + '" will be deleted without a score.', ok: 'Discard', danger: true });
    if (ok) TC.discardActive();
  };

  /* ================= Exam ================= */
  function palette(a) {
    const s = TC.section(a);
    // Mocks are built in subject blocks, so the palette groups by subject (like the real
    // CBT). Practice tests are shuffled, so they keep one list in question order.
    const bySubject = (a.mode === 'cet' || a.mode === 'jee') && s.subjects.length > 1;
    const groups = [];
    s.qIdx.forEach((i) => {
      const subj = bySubject ? a.questions[i].subj : '';
      let g = groups[groups.length - 1];
      if (!g || g.subj !== subj) groups.push((g = { subj: subj, idx: [] }));
      g.idx.push(i);
    });
    const label = { nv: 'not visited', v: 'not answered', a: 'answered', m: 'marked for review', am: 'answered and marked' };
    const key = (st, t) => '<span class="tc-lg"><span class="tc-q st-' + st + '"></span>' + t + '</span>';
    return (
      '<div class="tc-pal">' +
      groups.map((g) =>
        (g.subj ? '<p class="small muted">' + NAMES[g.subj] + '</p>' : '') +
        '<div class="tc-pal-g">' + g.idx.map((i) => {
          const st = TC.paletteState(a.questions[i]);
          return '<button class="tc-q st-' + st + (i === a.pos.qi ? ' is-cur' : '') + '" data-act="tc-go" data-i="' + i + '" aria-label="Question ' + (i + 1) + ', ' + label[st] + '"' + (i === a.pos.qi ? ' aria-current="true"' : '') + '>' + (i + 1) + '</button>';
        }).join('') + '</div>'
      ).join('') +
      '<p class="tc-legend small" aria-hidden="true">' + key('nv', 'Not visited') + key('v', 'Not answered') + key('a', 'Answered') + key('m', 'Marked') + key('am', 'Answered + marked') + '</p></div>'
    );
  }

  function questionHtml(a) {
    const i = a.pos.qi;
    const r = a.questions[i];
    const q = bank()[r.qid];
    if (!q) return '<p class="muted">This question is no longer in the question bank (' + u.esc(r.qid) + '). Move to another question.</p>';
    const head = '<p class="small muted">Question ' + (i + 1) + ' · ' + NAMES[r.subj] + ' · ' + u.esc(D.CH[r.ch].name) + ' · ' + (r.type === 'mcq' ? 'MCQ' : 'Numerical') + '</p>';
    const body = r.type === 'mcq'
      ? '<div class="opts" role="radiogroup" aria-label="Options">' + TC.shownOptions(r, q).map((o, k) =>
          '<button class="opt rip' + (r.sel === k ? ' is-sel' : '') + '" role="radio" aria-checked="' + (r.sel === k) + '" data-act="tc-opt" data-i="' + i + '" data-v="' + k + '"><b>' + 'ABCD'[k] + '.</b> ' + u.esc(o) + '</button>').join('') + '</div>'
      : '<label class="field"><span class="field-l">Your answer (a number)</span><input id="tc-num" type="number" inputmode="decimal" step="any" value="' + (r.sel != null ? r.sel : '') + '" data-change="tc-num" data-i="' + i + '"></label>';
    return head + '<p class="tc-stem">' + u.esc(q.q) + '</p>' + body;
  }

  function examHtml(a) {
    const s = TC.section(a);
    const last = a.pos.sec === a.sections.length - 1;
    const idx = s.qIdx;
    const at = idx.indexOf(a.pos.qi);
    const r = a.questions[a.pos.qi];
    const counts = { a: 0, m: 0, un: 0 };
    idx.forEach((i) => {
      const x = a.questions[i];
      if (x.sel != null) counts.a++;
      else counts.un++;
      if (x.mk) counts.m++;
    });
    const nextSecNote = !last
      ? '<p class="small muted">' + u.esc(a.sections[a.pos.sec + 1].label) + ' opens automatically when this section’s time ends. You cannot move early, and this section cannot be reopened after that.</p>'
      : '';
    return (
      '<div class="page tc-exam">' + (TC.usesSample(a) ? sampleBanner(true) : '') +
      '<header class="tc-head card pad-sm"><div><b>' + (a.sections.length > 1 ? 'Section ' + (a.pos.sec + 1) + ' of ' + a.sections.length + ': ' + u.esc(s.label) : u.plural(idx.length, 'question')) + '</b>' +
      '<small class="muted">' + s.subjects.map((x) => NAMES[x]).join(' · ') + '</small></div>' +
      '<div class="tc-clock" role="timer" aria-live="off"><small>Time left</small><b data-tc-left>' + fmtClock(TC.timeLeft(a, Date.now())) + '</b></div></header>' +
      '<section class="card stack">' + questionHtml(a) + '</section>' +
      '<div class="tc-nav"><button class="btn tonal sm rip" data-act="tc-prev"' + (at <= 0 ? ' disabled' : '') + '>' + u.icon('chev-l') + 'Previous</button>' +
      '<button class="btn tonal sm rip" data-act="tc-clear">Clear</button>' +
      '<button class="btn tonal sm rip" data-act="tc-mark" aria-pressed="' + r.mk + '">' + (r.mk ? 'Unmark' : 'Mark for review') + '</button>' +
      '<button class="btn primary sm rip" data-act="tc-next">' + (at < idx.length - 1 ? 'Save & next' : 'Save') + u.icon('chev-r') + '</button></div>' +
      '<section class="card"><div class="row-between"><h2 class="h3">Questions</h2><span class="small muted">' + counts.a + ' answered · ' + counts.m + ' marked · ' + counts.un + ' left</span></div>' + palette(a) + '</section>' +
      nextSecNote +
      (last ? '<button class="btn danger block rip" data-act="tc-submit">Submit test</button>' : '') +
      '</div>'
    );
  }

  S.views.exam = {
    title: 'Test',
    tab: 'tests',
    pushed: true,
    fab: false,
    pageTitle() {
      const a = TC.active();
      return a ? a.title : 'Test';
    },
    render(root) {
      const a = TC.active();
      // A past-paper answer sheet has its own screen (views-pyq.js). replace(): Back must not loop here.
      if (a && a.mode === 'pyq') {
        root.innerHTML = '';
        location.replace('#/omr/' + a.id);
        return;
      }
      if (!a) {
        shownSec = null;
        const lastDone = TC.all().items.filter((x) => x.status === 'submitted').pop();
        root.innerHTML = '<div class="page">' + ui.empty('clipboard', 'No test running', lastDone ? 'Your last test is finished.' : 'Start one from the Test Center.',
          (lastDone ? '<button class="btn primary rip" data-act="go" data-to="#/result/' + lastDone.id + '">See result</button> ' : '') + '<button class="btn tonal rip" data-act="go" data-to="#/testcenter">Test Center</button>') + '</div>';
        return;
      }
      if (shownSec != null && shownSec !== a.pos.sec) ui.toast(a.sections[shownSec].label + ' is locked. ' + TC.section(a).label + ' has started.', { ms: 6000 });
      shownSec = a.pos.sec;
      // Make sure the question on screen is marked visited and its stopwatch is running.
      if (a.pos.since == null || !a.questions[a.pos.qi].vis) TC.withActive((x) => TC.resumeQ(x, Date.now()));
      root.innerHTML = examHtml(TC.active());
    },
    tick() {
      const a = TC.active();
      const el = u.$('[data-tc-left]');
      if (a && el) el.textContent = fmtClock(TC.timeLeft(a, Date.now()));
    },
  };

  // A typed numerical answer is saved on "change"; save it too before navigating, in case
  // she taps a button while the input still has focus.
  function saveTyped() {
    const inp = u.$('#tc-num');
    if (inp) TC.withActive((a) => TC.answer(a, Number(inp.dataset.i), inp.value));
  }
  function go(i) {
    saveTyped();
    TC.withActive((a) => TC.visit(a, i, Date.now()));
    S.app.refresh(true);
    window.scrollTo(0, 0);
  }
  function step(d) {
    const a = TC.active();
    if (!a) return;
    const idx = TC.section(a).qIdx;
    const at = idx.indexOf(a.pos.qi);
    const to = idx[at + d];
    if (to != null) go(to);
    else {
      saveTyped();
      S.app.refresh(true);
    }
  }
  ui.actions['tc-go'] = (el) => go(Number(el.dataset.i));
  ui.actions['tc-next'] = () => step(1);
  ui.actions['tc-prev'] = () => step(-1);
  ui.actions['tc-opt'] = (el) => {
    TC.withActive((a) => TC.answer(a, Number(el.dataset.i), Number(el.dataset.v)));
    u.haptic();
    S.app.refresh(true);
  };
  ui.changes['tc-num'] = (el) => TC.withActive((a) => TC.answer(a, Number(el.dataset.i), el.value));
  ui.actions['tc-clear'] = () => {
    TC.withActive((a) => TC.answer(a, a.pos.qi, null));
    S.app.refresh(true);
  };
  ui.actions['tc-mark'] = () => {
    saveTyped();
    TC.withActive((a) => TC.toggleMark(a, a.pos.qi));
    S.app.refresh(true);
  };
  ui.actions['tc-submit'] = async () => {
    saveTyped();
    const a = TC.active();
    if (!a) return;
    const answered = a.questions.filter((r) => r.sel != null).length;
    const marked = a.questions.filter((r) => r.mk).length;
    const ok = await ui.confirm({
      title: 'Submit the test?',
      text: answered + ' of ' + a.questions.length + ' answered' + (marked ? ', ' + marked + ' marked for review' : '') + '. You cannot change answers after this.',
      ok: 'Submit',
      danger: true,
    });
    if (!ok) return;
    const done = TC.submitActive();
    if (done) {
      u.haptic('ok');
      goAfterSheet('#/result/' + done.id);
    }
  };

  /* ================= Result ================= */
  function accTable(rows, label) {
    return (
      '<table class="tc-tab"><thead><tr><th>' + label + '</th><th>Correct</th><th>%</th><th>Marks</th></tr></thead><tbody>' +
      rows.map((x) => '<tr><td>' + u.esc(x.name) + '</td><td>' + x.correct + '/' + x.total + '</td><td>' + (x.acc == null ? '—' : Math.round(x.acc * 100) + '%') + '</td><td>' + x.marks + '</td></tr>').join('') +
      '</tbody></table>'
    );
  }

  function keyItem(a, r, i) {
    const q = bank()[r.qid];
    const logged = store.get('errors').items.some((e) => e.src && e.src.qid === r.qid && (e.src.ch || e.chId) === r.ch);
    const verdict = r.ok === null ? 'Not answered' : r.ok ? 'Correct' : 'Wrong';
    const cls = r.ok === null ? '' : r.ok ? 'ok' : 'warn';
    let body;
    if (!q) body = '<p class="muted small">This question is no longer in the question bank (' + u.esc(r.qid) + '). Your answer: ' + u.esc(r.sel == null ? '—' : r.sel) + ' · Correct: ' + u.esc(r.ans) + '</p>';
    else if (r.type === 'mcq')
      body = '<p class="tc-stem">' + u.esc(q.q) + '</p><div class="opts">' + TC.shownOptions(r, q).map((o, k) =>
        '<div class="opt' + (k === r.ans ? ' right' : k === r.sel ? ' wrong' : '') + '"><b>' + 'ABCD'[k] + '.</b> ' + u.esc(o) + (k === r.sel ? ' <small>(your answer)</small>' : '') + (k === r.ans ? ' <small>(correct)</small>' : '') + '</div>').join('') + '</div>';
    else
      body = '<p class="tc-stem">' + u.esc(q.q) + '</p><p>Your answer: <b>' + (r.sel == null ? '—' : u.esc(r.sel)) + '</b> · Correct: <b>' + u.esc(r.ans) + '</b></p>';
    return (
      '<li class="card stack tc-key"><div class="row-between"><b>Q' + (i + 1) + '</b><span class="chips-s"><span class="chip-s ' + cls + '">' + verdict + '</span><span class="chip-s">' + (r.marks > 0 ? '+' : '') + r.marks + '</span><span class="chip-s">' + fmtDur(r.tMs) + '</span></span></div>' +
      '<p class="small muted">' + NAMES[r.subj] + ' · ' + u.esc(D.CH[r.ch].name) + ' · ' + DIFF[r.diff] + '</p>' + body +
      (q ? '<div class="tc-sol"><b class="small">Solution</b><p>' + u.esc(q.solution) + '</p></div>' : '') +
      (q ? '<div class="row gap"><button class="btn tonal sm rip" data-act="flag-open" data-id="' + r.qid + '">' + u.icon('star') + 'Flag this question</button><button class="btn tonal sm rip" data-act="go" data-to="#/q/' + r.qid + '">' + u.icon('eye') + 'View question</button></div>' : '') +
      (r.ok === false ? (logged ? '<p class="small muted">In your Error Notebook.</p>' : '<button class="btn tonal sm rip" data-act="tc-err" data-id="' + a.id + '" data-i="' + i + '">' + u.icon('notebook') + 'Add to Error Notebook</button>') : '') +
      '</li>'
    );
  }

  function resultHtml(a) {
    const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
    const used = a.submittedAt - a.startedAt;
    const avg = a.questions.length ? a.questions.reduce((n, r) => n + r.tMs, 0) / a.questions.length : 0;
    const subj = TC.breakdown(a, 'subj').map((x) => Object.assign(x, { name: NAMES[x.key] }));
    const ch = TC.breakdown(a, 'ch').map((x) => Object.assign(x, { name: D.CH[x.key] ? D.CH[x.key].name : x.key }));
    const diff = TC.breakdown(a, 'diff').sort((x, y) => x.key - y.key).map((x) => Object.assign(x, { name: DIFF[x.key] }));
    return (
      '<div class="page">' + (TC.usesSample(a) ? sampleBanner(false) : '') +
      '<header class="page-h"><div><h1 class="h1">' + u.esc(a.title) + '</h1><p class="muted">' + u.esc(u.dateLong(a.date)) + ' · ' + (a.submitReason === 'time' ? 'Submitted when time ran out' : 'Submitted by you') + '</p></div></header>' +
      '<section class="card"><div class="stats3"><div><b class="num">' + a.score + '<small>/' + a.maxScore + '</small></b><small>Score (' + pct + '%)</small></div>' +
      '<div><b class="num">' + a.correct + ' / ' + a.wrong + '</b><small>Correct / wrong</small></div>' +
      '<div><b class="num">' + a.unanswered + '</b><small>Not answered</small></div></div>' +
      '<p class="small muted" style="margin-top:10px">Time used ' + fmtDur(used) + ' · average ' + fmtDur(avg) + ' per question</p></section>' +
      '<section class="card"><h2 class="h3">By subject</h2>' + accTable(subj, 'Subject') + '</section>' +
      '<section class="card"><h2 class="h3">By chapter</h2>' + accTable(ch, 'Chapter') + '</section>' +
      '<section class="card"><h2 class="h3">By difficulty</h2>' + accTable(diff, 'Difficulty') + '</section>' +
      '<div class="row gap">' + (a.wrong > 0 ? '<button class="btn primary grow rip" data-act="tc-retry" data-id="' + a.id + '">' + u.icon('refresh') + 'Retry — wrong questions only</button>' : '') +
      '<button class="btn tonal grow rip" data-act="go" data-to="#/testcenter">Test Center</button></div>' +
      '<h2 class="h3">Answer key</h2><ol class="tc-keys">' + a.questions.map((r, i) => keyItem(a, r, i)).join('') + '</ol></div>'
    );
  }

  S.views.result = {
    title: 'Result',
    tab: 'tests',
    pushed: true,
    render(root, ctx) {
      const a = TC.get(ctx.params[0]);
      // A past-paper sheet (js/pyq.js) has no bank questions: its result is #/omr/<id>. Every link
      // to #/result (Test Center list, Tests tab rows, the idle exam screen) lands here first.
      if (a && a.mode === 'pyq') {
        root.innerHTML = '';
        location.replace('#/omr/' + a.id);
        return;
      }
      if (!a || a.status !== 'submitted') {
        root.innerHTML = '<div class="page">' + ui.empty('clipboard', 'Result not found', 'This test was deleted or is not finished yet.', '<button class="btn tonal rip" data-act="go" data-to="#/testcenter">Test Center</button>') + '</div>';
        return;
      }
      root.innerHTML = resultHtml(a);
    },
  };

  ui.actions['tc-err'] = (el) => {
    const res = TC.logError(el.dataset.id, Number(el.dataset.i));
    if (res.ok) ui.toast('Added to your Error Notebook. It will come back for revision.');
    else if (res.reason === 'duplicate') ui.toast('Already in your Error Notebook.');
    else ui.toast('Could not add this question.');
    S.app.refresh(true);
  };
  ui.actions['tc-retry'] = (el) => launch(() => TC.retry(el.dataset.id));

  // Starts the standard chapter test (CET marking, default length) for one chapter; used by the
  // chapter sheet. Also preselects that chapter in the Test Center form.
  function startChapterTest(id) {
    form.kind = 'chapters';
    form.sel = new Set([id]);
    return launch(() => TC.start('chapter', { chapters: [id], marking: 'cet' }));
  }
  // Learn hub "Checkpoint": a 10-question chapter test (fewer if the chapter has fewer MCQs).
  function startCheckpoint(id) {
    return launch(() => TC.start('chapter', { chapters: [id], marking: 'cet', n: 10, checkpoint: true }));
  }
  S.tcUI = { goAfterSheet: goAfterSheet, startChapterTest: startChapterTest, startCheckpoint: startCheckpoint, starterHtml: starterHtml, activeCard: activeCard, attemptsHtml: attemptsHtml };
})((window.SOS = window.SOS || {}));

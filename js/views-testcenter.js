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
  const form = { ch: '', n: 20, mix: new Set(), mixN: 20, jeeCh: false, jeeMix: false };
  let shownSec = null; // exam: section index last drawn, to announce a lock

  const isDone = (id) => ['done', 'mastered'].indexOf(E.chap(id).s) >= 0;
  function doneWithQuestions() {
    return TC.chaptersWithQuestions().filter(isDone);
  }
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

  function chapterOpts(ids) {
    return ids.map((id) => ({ v: id, t: D.CH[id].name + (TC.chapterHasSample(id) ? ' (sample)' : '') }));
  }

  function modeCards() {
    const done = doneWithQuestions();
    const all = TC.chaptersWithQuestions();
    const doneAll = D.CHAPTERS.filter((c) => c.subj !== 'cs' && isDone(c.id)).length;
    const missing = doneAll - done.length;
    if (!form.ch || done.indexOf(form.ch) < 0) form.ch = done[0] || '';
    Array.from(form.mix).forEach((id) => done.indexOf(id) < 0 && form.mix.delete(id));
    const toggle = (act, on, label) => '<button type="button" class="chip sm rip" role="switch" aria-checked="' + on + '" aria-pressed="' + on + '" data-act="' + act + '">' + label + '</button>';
    const cetHave = TC.cetCount(all);
    const jeeHave = TC.jeeCount(all);
    const none = !done.length
      ? '<p class="muted small">None of your done chapters has questions yet. Mark a chapter Done in Subjects, or wait for the question bank.</p>'
      : '';
    return (
      '<section class="card stack"><h2 class="h3">Chapter test</h2>' + none +
      (done.length
        ? ui.field('Chapter', ui.select('tc-ch', chapterOpts(done), form.ch).replace('<select ', '<select data-change="tc-ch" ')) +
          ui.field('Questions', '<input type="number" inputmode="numeric" min="1" max="200" value="' + form.n + '" data-change="tc-n">', 'Up to the questions available · ' + TC.PRACTICE_MIN_PER_Q + ' min each') +
          '<div class="chips">' + toggle('tc-jee-ch', form.jeeCh, 'JEE practice marking (+4 / −1)') + '</div>' +
          '<button class="btn primary block rip" data-act="tc-start" data-mode="chapter">Start chapter test</button>'
        : '') +
      '</section>' +
      '<section class="card stack"><h2 class="h3">Custom mix</h2>' +
      (done.length >= 2
        ? '<div class="chips">' + done.map((id) => '<button type="button" class="chip sm rip" aria-pressed="' + form.mix.has(id) + '" data-act="tc-mix" data-id="' + id + '">' + u.esc(D.CH[id].name) + '</button>').join('') + '</div>' +
          ui.field('Questions', '<input type="number" inputmode="numeric" min="2" max="200" value="' + form.mixN + '" data-change="tc-mixn">', 'Split by chapter weight · ' + TC.PRACTICE_MIN_PER_Q + ' min each') +
          '<div class="chips">' + toggle('tc-jee-mix', form.jeeMix, 'JEE practice marking (+4 / −1)') + '</div>' +
          '<button class="btn primary block rip" data-act="tc-start" data-mode="mix"' + (form.mix.size < 2 ? ' disabled' : '') + '>Start custom mix</button>'
        : '<p class="muted small">Needs at least two done chapters with questions.</p>') +
      '</section>' +
      '<section class="card stack"><h2 class="h3">Quick 10</h2><p class="muted small">10 questions from your done chapters, 10 minutes, CET marking.</p>' +
      '<button class="btn tonal block rip" data-act="tc-start" data-mode="quick"' + (done.length ? '' : ' disabled') + '>Start Quick 10</button></section>' +
      '<section class="card stack"><h2 class="h3">CET-pattern mock</h2><p class="muted small">Section 1: Physics + Chemistry, 100 questions, 90 min. Section 2: Maths, 50 questions, 90 min, 2 marks each. No negative marking. Section 1 locks at 90:00 and Maths opens then — you cannot move early or go back.</p>' +
      (cetHave < 150 && cetHave > 0 ? '<p class="small tc-short">Only ' + cetHave + ' of 150 questions in the bank yet: this will be a short mock.</p>' : '') +
      '<button class="btn tonal block rip" data-act="tc-start" data-mode="cet"' + (cetHave ? '' : ' disabled') + '>Start CET mock</button></section>' +
      '<section class="card stack"><h2 class="h3">JEE-pattern mock</h2><p class="muted small">Physics, Chemistry, Maths: 20 MCQ + 5 numerical each, one 180-minute clock, move freely. MCQ +4 / −1. Numerical +4, and ' + (store.get('profile').testCenter.jeeNumNeg ? '−1' : 'no penalty') + ' when wrong (setting below).</p>' +
      (jeeHave < 75 && jeeHave > 0 ? '<p class="small tc-short">Only ' + jeeHave + ' of 75 questions in the bank yet: this will be a short mock.</p>' : '') +
      '<button class="btn tonal block rip" data-act="tc-start" data-mode="jee"' + (jeeHave ? '' : ' disabled') + '>Start JEE mock</button>' +
      '<div class="chips">' + toggle('tc-numneg', !!store.get('profile').testCenter.jeeNumNeg, 'Wrong JEE numerical loses 1 mark') + '</div>' +
      '<p class="muted small">NTA hasn’t published the 2027 rules yet. Each test keeps the setting it started with.</p></section>' +
      (missing > 0 ? '<p class="muted small note-line">' + u.plural(missing, 'done chapter') + ' ha' + (missing === 1 ? 's' : 've') + ' no questions yet. Computer Science is not part of the Test Center.</p>' : '')
    );
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
    if (mode === 'chapter') Object.assign(opts, { chapters: [form.ch], n: form.n, marking: form.jeeCh ? 'jee' : 'cet' });
    if (mode === 'mix') Object.assign(opts, { chapters: Array.from(form.mix), n: form.mixN, marking: form.jeeMix ? 'jee' : 'cet' });
    if (mode === 'quick') opts.chapters = doneWithQuestions();
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
  ui.actions['tc-mix'] = (el) => {
    const id = el.dataset.id;
    if (form.mix.has(id)) form.mix.delete(id);
    else form.mix.add(id);
    S.app.refresh(true);
  };
  ui.actions['tc-jee-ch'] = () => { form.jeeCh = !form.jeeCh; S.app.refresh(true); };
  ui.actions['tc-jee-mix'] = () => { form.jeeMix = !form.jeeMix; S.app.refresh(true); };
  ui.actions['tc-numneg'] = () => store.mutate('profile', (p) => (p.testCenter.jeeNumNeg = !p.testCenter.jeeNumNeg));
  ui.changes['tc-ch'] = (el) => (form.ch = el.value);
  ui.changes['tc-n'] = (el) => (form.n = u.clamp(Math.round(u.num(el.value, 20)), 1, 200));
  ui.changes['tc-mixn'] = (el) => (form.mixN = u.clamp(Math.round(u.num(el.value, 20)), 2, 200));
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
    form.ch = id;
    return launch(() => TC.start('chapter', { chapters: [id], marking: 'cet' }));
  }
  // Learn hub "Checkpoint": a 10-question chapter test (fewer if the chapter has fewer MCQs).
  function startCheckpoint(id) {
    return launch(() => TC.start('chapter', { chapters: [id], marking: 'cet', n: 10, checkpoint: true }));
  }
  S.tcUI = { goAfterSheet: goAfterSheet, startChapterTest: startChapterTest, startCheckpoint: startCheckpoint };
})((window.SOS = window.SOS || {}));

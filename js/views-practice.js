/* views/practice.js — Practice (untimed): picker, one question at a time with instant feedback,
 * and the end-of-session summary, all on #/practice. All selection, scoring and storage is in
 * js/practice.js (S.practice); this file only draws and forwards taps. #/practice?ch=<id> opens the
 * picker with that chapter preselected (used by the chapter sheet). */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const ui = S.ui;
  const store = S.store;
  const TC = S.tc;
  const P = S.practice;
  S.views = S.views || {};

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths' };
  const DIFF = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  const form = { scope: 'chapter', ch: '', diff: 'all', len: '10', num: false };
  const view = { showing: null, summary: null, added: {} }; // showing = row index awaiting "Next"; summary = finished item id

  const bank = () => TC.bankById();
  const optsOf = () => ({
    chapters: form.scope === 'done' ? P.doneChapters() : [form.ch],
    diff: form.diff,
    len: Number(form.len),
    includeNum: form.num,
  });

  /* ================= picker ================= */
  function picker() {
    const all = TC.chaptersWithQuestions();
    const done = P.doneChapters();
    if (!form.ch || all.indexOf(form.ch) < 0) form.ch = (done[0] || all[0] || '');
    const c = P.counts(optsOf());
    const chapterOpts = all.map((id) => ({ v: id, t: D.CH[id].name }));
    const a = P.active();
    const resume = a
      ? '<section class="card stack"><h2 class="h3">Practice in progress</h2><p class="small muted">' + u.esc(a.chapters.map((id) => D.CH[id].name).join(', ')) + ' · ' +
        a.questions.filter((r) => r.done).length + ' of ' + a.questions.length + ' done</p>' +
        '<div class="row gap"><button class="btn primary grow rip" data-act="pr-resume">' + u.icon('play') + 'Resume</button><button class="btn danger grow rip" data-act="pr-discard">Discard</button></div></section>'
      : '';
    return (
      '<div class="page"><header class="page-h"><div><h1 class="h1">Practice</h1><p class="muted">Untimed. One question at a time, with the answer and solution straight away.</p></div></header>' + resume +
      '<section class="card stack"><h2 class="h3">What to practise</h2>' +
      ui.seg('pr-scope', [{ v: 'chapter', t: 'One chapter' }, { v: 'done', t: 'My done chapters' }], form.scope) +
      (form.scope === 'chapter'
        ? ui.field('Chapter', ui.select('pr-ch', chapterOpts, form.ch).replace('<select ', '<select data-change="pr-ch" '))
        : '<p class="small muted">' + (done.length ? u.plural(done.length, 'done chapter') + ' with questions.' : 'None of your chapters is marked Done yet, or none has questions.') + '</p>') +
      '<div><span class="field-l">Difficulty</span>' + ui.seg('pr-diff', [{ v: 'all', t: 'All' }, { v: '1', t: 'Easy' }, { v: '2', t: 'Medium' }, { v: '3', t: 'Hard' }], form.diff) + '</div>' +
      '<div><span class="field-l">Questions</span>' + ui.seg('pr-len', [{ v: '10', t: '10' }, { v: '20', t: '20' }, { v: '0', t: 'All' }], form.len) + '</div>' +
      '<div class="chips"><button type="button" class="chip sm rip" role="switch" aria-checked="' + form.num + '" aria-pressed="' + form.num + '" data-act="pr-num">Include numerical (JEE style)</button></div>' +
      '<p class="small muted" data-testid="pr-counts">' + (c.total ? c.fresh + ' new · ' + c.missed + ' missed before · ' + c.seen + ' seen' + ' (of ' + c.total + ')' : 'No questions match these choices.') + '</p>' +
      '<button class="btn primary block rip" data-act="pr-start"' + (c.total ? '' : ' disabled') + ' data-testid="pr-start">' + u.icon('play') + 'Start practice</button></section>' +
      lastSessions() + '</div>'
    );
  }

  function lastSessions() {
    const items = store.get('practice').items.slice(-5).reverse();
    if (!items.length) return '';
    return (
      '<section class="card list-card"><h2 class="h3">Recent practice</h2><ul class="atts">' +
      items.map((it) => {
        const pct = it.answered ? Math.round((100 * it.correct) / it.answered) : 0;
        return '<li><button class="att rip" data-act="pr-open" data-id="' + it.id + '"><span class="att-p">' + pct + '%</span><span class="att-b"><b>' +
          u.esc(it.chapters.length === 1 ? D.CH[it.chapters[0]].name : it.chapters.length + ' chapters') + '</b><small>' + u.esc(u.dateShort(it.date)) + ' · ' + it.correct + '/' + it.answered + ' right' + (it.skipped ? ' · ' + it.skipped + ' skipped' : '') + '</small></span></button></li>';
      }).join('') + '</ul></section>'
    );
  }

  /* ================= question ================= */
  function questionScreen(a) {
    const i = view.showing != null ? view.showing : P.nextOpen(a);
    const r = a.questions[i];
    const q = bank()[r.qid];
    const doneN = a.questions.filter((x) => x.done).length;
    const head =
      '<div class="row-between"><p class="small muted">Question ' + (i + 1) + ' of ' + a.questions.length + ' · ' + NAMES[r.subj] + ' · ' + u.esc(D.CH[r.ch].name) + ' · ' + DIFF[r.diff] + '</p>' +
      '<button class="link" data-act="pr-end">End session</button></div>' + '<div class="bar-wrap">' + S.charts.bar(doneN / a.questions.length) + '</div>';
    if (!q) return head + '<p class="muted">This question is no longer in the question bank (' + u.esc(r.qid) + ').</p><button class="btn tonal block rip" data-act="pr-skip" data-i="' + i + '">Skip</button>';
    const locked = r.done && !r.skipped;
    let body;
    if (r.type === 'mcq') {
      body = '<div class="opts" role="radiogroup" aria-label="Options">' + TC.shownOptions(r, q).map((o, k) => {
        const cls = locked ? (k === r.ans ? ' right' : k === r.sel ? ' wrong' : '') : '';
        return '<button class="opt rip' + cls + '" role="radio" aria-checked="' + (r.sel === k) + '" data-act="pr-opt" data-i="' + i + '" data-v="' + k + '"' + (locked ? ' disabled' : '') + '><b>' + 'ABCD'[k] + '.</b> ' + u.esc(o) +
          (locked && k === r.sel ? ' <small>(your answer)</small>' : '') + (locked && k === r.ans ? ' <small>(correct)</small>' : '') + '</button>';
      }).join('') + '</div>';
    } else if (locked) {
      body = '<p>Your answer: <b>' + u.esc(r.sel) + '</b> · Correct: <b>' + u.esc(r.ans) + '</b></p>';
    } else {
      body = '<label class="field"><span class="field-l">Your answer (a number)</span><input id="pr-num" type="number" inputmode="decimal" step="any" data-i="' + i + '"></label>' +
        '<button class="btn primary block rip" data-act="pr-check" data-i="' + i + '">Check</button>';
    }
    let after = '';
    if (locked) {
      const added = view.added[a.id + ':' + r.qid];
      after =
        '<div class="tc-sol" data-testid="pr-solution"><b class="' + (r.ok ? 'tc-ok' : 'tc-bad') + '">' + (r.ok ? 'Correct' : 'Incorrect') + '</b><p>' + u.esc(q.solution) + '</p></div>' +
        '<div class="row gap">' +
        '<button class="btn tonal grow rip" data-act="flag-open" data-id="' + r.qid + '" data-testid="pr-flag">' + u.icon('star') + (P.flagOf(r.qid) ? 'Flagged (edit)' : 'Flag this question') + '</button>' +
        '<button class="btn tonal grow rip" data-act="go" data-to="#/q/' + r.qid + '">' + u.icon('eye') + 'View question</button></div><div class="row gap">' +
        (!r.ok ? '<button class="btn tonal grow rip" data-act="pr-err" data-i="' + i + '"' + (added ? ' disabled' : '') + '>' + u.icon('notebook') + (added ? 'In Error Notebook' : 'Add to Error Notebook') + '</button>' : '') +
        '</div>' +
        '<button class="btn primary block rip" data-act="pr-next" data-testid="pr-next">' + (P.allDone(a) ? 'Finish' : 'Next') + '</button>';
    } else {
      after = '<button class="btn tonal block rip" data-act="pr-skip" data-i="' + i + '">Skip</button>';
    }
    return '<div class="page tc-exam">' + head + '<p class="tc-stem">' + u.esc(q.q) + '</p>' + body + after + '</div>';
  }

  /* ================= summary ================= */
  function summary(it) {
    const pct = it.answered ? Math.round((100 * it.correct) / it.answered) : 0;
    const perCh = Object.keys(it.perCh).map((ch) => {
      const x = it.perCh[ch];
      return '<tr><td>' + u.esc(D.CH[ch] ? D.CH[ch].name : ch) + '</td><td>' + x[1] + '/' + x[0] + '</td><td>' + Math.round((100 * x[1]) / x[0]) + '%</td></tr>';
    }).join('');
    return (
      '<div class="page"><header class="page-h"><div><h1 class="h1">Practice done</h1><p class="muted">' + u.esc(u.dateLong(it.date)) + '</p></div></header>' +
      '<section class="card"><div class="stats3"><div><b class="num" data-testid="pr-score">' + it.correct + '<small>/' + it.answered + '</small></b><small>Score (' + pct + '%)</small></div><div><b class="num">' + it.wrong + '</b><small>Wrong</small></div><div><b class="num">' + it.skipped + '</b><small>Skipped</small></div></div></section>' +
      (perCh ? '<section class="card"><h2 class="h3">By chapter</h2><table class="tc-tab"><thead><tr><th>Chapter</th><th>Right</th><th>%</th></tr></thead><tbody>' + perCh + '</tbody></table></section>' : '') +
      '<section class="card stack">' +
      '<button class="btn primary block rip" data-act="pr-again" data-id="' + it.id + '"' + (it.wrongRows.length ? '' : ' disabled') + '>' + u.icon('refresh') + 'Practice the missed ones again</button>' +
      '<button class="btn tonal block rip" data-act="pr-add-all" data-id="' + it.id + '"' + (it.wrongRows.length ? '' : ' disabled') + ' data-testid="pr-add-all">' + u.icon('notebook') + 'Add all ' + it.wrongRows.length + ' wrong to the Error Notebook</button>' +
      '<button class="btn tonal block rip" data-act="pr-new">New practice</button></section>' +
      (it.wrongRows.length ? '<section class="card list-card"><h2 class="h3">Questions you got wrong</h2><ul class="recs">' +
        it.wrongRows.map((w) => {
          const q = bank()[w.qid];
          return '<li><button class="rec rip" data-act="go" data-to="#/q/' + w.qid + '"><span><b>' + u.esc(q ? q.q.slice(0, 90) + (q.q.length > 90 ? '…' : '') : w.qid) + '</b><small>' + u.esc(D.CH[w.ch] ? D.CH[w.ch].name : w.ch) + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>';
        }).join('') + '</ul></section>' : '') + '</div>'
    );
  }

  S.views.practice = {
    title: 'Practice',
    tab: 'tests',
    pushed: true,
    fab: false,
    render(root, ctx) {
      if (ctx && ctx.first && ctx.query && ctx.query.ch && D.CH[ctx.query.ch]) {
        form.scope = 'chapter';
        form.ch = ctx.query.ch;
        view.summary = null;
        view.showing = null;
        view.running = false; // the picker (with a Resume card if a session is open) comes first
      }
      const a = P.active();
      if (a && view.running) {
        root.innerHTML = questionScreen(a);
        return;
      }
      if (view.summary) {
        const it = store.get('practice').items.filter((x) => x.id === view.summary)[0];
        if (it) {
          root.innerHTML = summary(it);
          return;
        }
        view.summary = null;
      }
      root.innerHTML = picker();
    },
  };

  /* ================= actions ================= */
  function begin(opts) {
    const res = P.start(opts);
    if (!res.ok && res.reason === 'active') return resumeOrDiscard(opts);
    if (!res.ok) return ui.toast(res.error || 'Could not start practice.');
    view.running = true;
    view.showing = null;
    view.summary = null;
    u.haptic('ok');
    S.app.refresh(true);
  }
  async function resumeOrDiscard(opts) {
    const resume = await ui.confirm({ title: 'A practice session is already running', text: 'Resume it, or discard it and start the new one?', ok: 'Resume', cancel: 'Discard it instead' });
    if (resume) {
      view.running = true;
      view.showing = null;
      return S.app.refresh(true);
    }
    P.discardActive();
    begin(opts);
  }

  ui.actions['pr-scope'] = (el) => { form.scope = el.dataset.v; S.app.refresh(true); };
  ui.actions['pr-diff'] = (el) => { form.diff = el.dataset.v; S.app.refresh(true); };
  ui.actions['pr-len'] = (el) => { form.len = el.dataset.v; S.app.refresh(true); };
  ui.actions['pr-num'] = () => { form.num = !form.num; S.app.refresh(true); };
  ui.changes['pr-ch'] = (el) => { form.ch = el.value; S.app.refresh(true); };
  ui.actions['pr-start'] = () => begin(optsOf());
  ui.actions['pr-resume'] = () => { view.running = true; view.showing = null; view.summary = null; S.app.refresh(true); };
  ui.actions['pr-discard'] = async () => {
    const ok = await ui.confirm({ title: 'Discard this practice session?', text: 'Your answers so far stay in your history and the daily count, but the session ends.', ok: 'Discard', danger: true });
    if (!ok) return;
    P.discardActive();
    view.running = false;
    S.app.refresh(true);
  };
  ui.actions['pr-opt'] = (el) => {
    const i = Number(el.dataset.i);
    if (P.answer(i, Number(el.dataset.v))) {
      view.showing = i;
      u.haptic();
      S.app.refresh(true);
    }
  };
  ui.actions['pr-check'] = (el) => {
    const i = Number(el.dataset.i);
    const inp = u.$('#pr-num');
    if (!inp || inp.value === '') return ui.toast('Type a number first.');
    if (P.answer(i, Number(inp.value))) {
      view.showing = i;
      S.app.refresh(true);
    }
  };
  ui.actions['pr-skip'] = (el) => {
    P.skip(Number(el.dataset.i));
    view.showing = null;
    if (P.allDone(P.active())) return finishNow();
    S.app.refresh(true);
  };
  ui.actions['pr-next'] = () => {
    view.showing = null;
    const a = P.active();
    if (!a || P.allDone(a)) return finishNow();
    S.app.refresh(true);
  };
  function finishNow() {
    const it = P.finish();
    view.running = false;
    view.summary = it ? it.id : null;
    view.showing = null;
    S.app.refresh(true);
  }
  ui.actions['pr-end'] = async () => {
    const ok = await ui.confirm({ title: 'End this session?', text: 'Questions you have not answered count as skipped.', ok: 'End session' });
    if (ok) finishNow();
  };
  ui.actions['pr-err'] = (el) => {
    const a = P.active();
    const i = Number(el.dataset.i);
    const res = P.logErrorActive(i);
    if (a) view.added[a.id + ':' + a.questions[i].qid] = true;
    ui.toast(res.ok ? 'Added to the Error Notebook.' : res.reason === 'duplicate' ? 'Already in the Error Notebook.' : 'Could not add it.');
    S.app.refresh(true);
  };
  ui.actions['pr-add-all'] = (el) => {
    const res = P.logAllWrong(el.dataset.id);
    ui.toast('Added ' + res.added + (res.duplicate ? ' · ' + res.duplicate + ' already there' : '') + ' to the Error Notebook.');
  };
  ui.actions['pr-again'] = (el) => {
    const it = store.get('practice').items.filter((x) => x.id === el.dataset.id)[0];
    if (!it || !it.wrongRows.length) return;
    begin({ qids: it.wrongRows.map((w) => w.qid), chapters: it.chapters, diff: 'all', len: 0, includeNum: it.wrongRows.some((w) => w.type === 'num') });
  };
  ui.actions['pr-new'] = () => { view.summary = null; view.running = false; S.app.refresh(true); };
  ui.actions['pr-open'] = (el) => { view.summary = el.dataset.id; S.app.refresh(true); };

  /* ================= #/q/<qid>: read-only question viewer ================= */
  S.views.q = {
    title: 'Question',
    tab: 'tests',
    pushed: true,
    fab: false,
    render(root, ctx) {
      const qid = ctx.params[0] || '';
      const q = bank()[qid];
      if (!q) {
        root.innerHTML = '<div class="page">' + ui.empty('clipboard', 'No longer in the bank', 'This question (' + qid + ') is not in the question bank any more.', '<button class="btn tonal rip" data-act="back">Back</button>') + '</div>';
        return;
      }
      const f = P.flagOf(qid);
      const body = q.type === 'mcq'
        ? '<div class="opts">' + q.options.map((o, k) => '<div class="opt' + (k === q.ans ? ' right' : '') + '"><b>' + 'ABCD'[k] + '.</b> ' + u.esc(o) + (k === q.ans ? ' <small>(correct)</small>' : '') + '</div>').join('') + '</div>'
        : '<p>Answer: <b>' + u.esc(q.ans) + '</b> <small class="muted">(accepted within ±' + u.esc(q.tol) + ')</small></p>';
      root.innerHTML =
        '<div class="page tc-exam"><p class="small muted" data-testid="q-head">' + NAMES[D.CH[q.ch].subj] + ' · ' + u.esc(D.CH[q.ch].name) + ' · ' + DIFF[q.diff] + ' · ' + (q.type === 'mcq' ? 'MCQ' : 'Numerical') + '</p>' +
        '<p class="tc-stem">' + u.esc(q.q) + '</p>' + body +
        '<div class="tc-sol"><b class="small">Solution</b><p>' + u.esc(q.solution) + '</p></div>' +
        (f ? '<p class="small muted">Flagged ' + u.esc(u.dateShort(f.date)) + (f.note ? ': ' + u.esc(f.note) : '') + '</p>' : '') +
        '<button class="btn tonal block rip" data-act="flag-open" data-id="' + qid + '" data-testid="q-flag">' + u.icon('star') + (f ? 'Flagged (edit)' : 'Flag this question') + '</button></div>';
    },
  };

  /* ================= #/flags: every flagged question ================= */
  S.views.flags = {
    title: 'Flagged questions',
    tab: 'me',
    pushed: true,
    fab: false,
    render(root) {
      const list = P.flags().slice().reverse();
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">Flagged questions</h1><p class="muted">' + u.plural(list.length, 'question') + ' you marked to check.</p></div></header>' +
        (list.length
          ? '<ul class="tc-keys">' + list.map((f) => {
              const q = bank()[f.qid];
              return '<li class="card stack tc-key" data-testid="flag-row"><p class="small muted">' + (q ? NAMES[D.CH[q.ch].subj] + ' · ' + u.esc(D.CH[q.ch].name) : u.esc(f.qid)) + ' · ' + u.esc(u.dateShort(f.date)) + '</p>' +
                '<p class="tc-stem">' + (q ? u.esc(q.q.slice(0, 160) + (q.q.length > 160 ? '…' : '')) : 'This question is no longer in the bank.') + '</p>' +
                (f.note ? '<p class="small"><b>Note:</b> ' + u.esc(f.note) + '</p>' : '') +
                '<div class="row gap"><button class="btn tonal grow rip" data-act="go" data-to="#/q/' + f.qid + '">View</button><button class="btn danger grow rip" data-act="flag-remove" data-id="' + f.qid + '">Remove</button></div></li>';
            }).join('') + '</ul>'
          : ui.empty('star', 'Nothing flagged', 'Tap "Flag this question" on a question that looks wrong or confusing. It travels with Send to coach.')) + '</div>';
    },
  };

  ui.actions['flag-open'] = (el) => {
    const id = el.dataset.id;
    const f = P.flagOf(id);
    ui.sheet.open({
      title: f ? 'Edit flag' : 'Flag this question',
      html: '<form class="stack" onsubmit="return false" data-form="flag">' + ui.field('Note (optional)', '<textarea name="note" rows="3" maxlength="300" placeholder="What looks wrong or confusing?">' + u.esc(f ? f.note : '') + '</textarea>') +
        '<button class="btn primary block rip" data-act="flag-save" data-id="' + id + '">' + (f ? 'Save' : 'Flag it') + '</button>' +
        (f ? '<button class="btn danger block rip" data-act="flag-remove" data-id="' + id + '">Remove flag</button>' : '') + '</form>',
    });
  };
  ui.actions['flag-save'] = (el) => {
    const v = ui.values(u.$('[data-form="flag"]'));
    P.flag(el.dataset.id, v.note);
    ui.sheet.close();
    ui.toast('Flagged.');
    S.app.refresh(true);
  };
  ui.actions['flag-remove'] = (el) => {
    P.unflag(el.dataset.id);
    if (ui.sheet.isOpen()) ui.sheet.close();
    ui.toast('Flag removed.');
    S.app.refresh(true);
  };

  S.practiceUI = { start: (chId) => S.app.go('#/practice?ch=' + chId) };
})((window.SOS = window.SOS || {}));

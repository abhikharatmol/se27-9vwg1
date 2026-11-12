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
  // Picker state. scope: chapter (hand-picked chapters) | subject | cat (CET category A/B/C) | all | done
  const form = { scope: 'chapter', sel: new Set(), list: 'all', subj: new Set(['phy', 'chem', 'mth']), std: 'all', cat: new Set(['A', 'B', 'C']), diff: 'all', type: 'mcq', only: 'all', len: '10' };
  const view = { showing: null, summary: null, added: {} }; // showing = row index awaiting "Next"; summary = finished item id
  const CAT_HELP = { A: 'A: must do for the CET', B: 'B: important', C: 'C: if time allows' };

  const bank = () => TC.bankById();
  const withQ = () => TC.chaptersWithQuestions().filter((id) => D.CH[id]);
  const stdOk = (id) => form.std === 'all' || String(D.CH[id].std) === form.std;
  // The chapters the current scope covers.
  function scopeChapters() {
    const all = withQ();
    if (form.scope === 'chapter') return all.filter((id) => form.sel.has(id));
    if (form.scope === 'subject') return all.filter((id) => form.subj.has(D.CH[id].subj) && stdOk(id));
    if (form.scope === 'cat') return all.filter((id) => form.subj.has(D.CH[id].subj) && form.cat.has(D.CH[id].cetTier) && stdOk(id));
    if (form.scope === 'done') return P.doneChapters().filter(stdOk);
    return all.filter(stdOk);
  }
  const optsOf = () => ({ chapters: scopeChapters(), diff: form.diff, len: Number(form.len), type: form.type, only: form.only });

  /* ================= picker ================= */
  const chips = (act, items, isOn) => '<div class="chips">' + items.map((x) => '<button type="button" class="chip rip" aria-pressed="' + isOn(x.v) + '" data-act="' + act + '" data-v="' + x.v + '">' + x.t + '</button>').join('') + '</div>';

  function chapterPicker() {
    const all = withQ().filter((id) => (form.list === 'all' || D.CH[id].subj === form.list) && stdOk(id));
    return (
      '<div class="chips">' + [['all', 'All'], ['phy', 'Physics'], ['chem', 'Chemistry'], ['mth', 'Maths']].map((x) =>
        '<button type="button" class="chip rip" aria-pressed="' + (form.list === x[0]) + '" data-act="pr-list" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<ul class="tcb-list">' + all.map((id) => {
        const on = form.sel.has(id);
        const n = S.practice.counts({ chapters: [id], type: form.type, diff: form.diff, only: form.only }).total;
        return '<li><button class="tcb-ch rip" aria-pressed="' + on + '" data-act="pr-pick" data-id="' + id + '"><span class="tcb-tick">' + (on ? u.icon('check') : '') + '</span>' +
          '<span class="tcb-name"><b>' + u.esc(D.CH[id].name) + '</b><small>' + NAMES[D.CH[id].subj] + ' · Class ' + D.CH[id].std + '</small></span><span class="tcb-n">' + n + ' Q</span></button></li>';
      }).join('') + '</ul>' +
      (form.sel.size ? '<button class="link" data-act="pr-clear">Clear ' + form.sel.size + ' chosen</button>' : '')
    );
  }

  function picker() {
    const chs = scopeChapters();
    const c = P.counts(optsOf());
    const a = P.active();
    const resume = a
      ? '<section class="card stack"><h2 class="h3">Practice in progress</h2><p class="small muted">' + u.esc(a.chapters.slice(0, 3).map((id) => D.CH[id].name).join(', ')) + (a.chapters.length > 3 ? ' and ' + (a.chapters.length - 3) + ' more' : '') + ' · ' +
        a.questions.filter((r) => r.done).length + ' of ' + a.questions.length + ' done</p>' +
        '<div class="row gap"><button class="btn primary grow rip" data-act="pr-resume">' + u.icon('play') + 'Resume</button><button class="btn danger grow rip" data-act="pr-discard">Discard</button></div></section>'
      : '';
    const scope = form.scope;
    const subjChips = chips('pr-subj', [{ v: 'phy', t: 'Physics' }, { v: 'chem', t: 'Chemistry' }, { v: 'mth', t: 'Maths' }], (v) => form.subj.has(v));
    const stdSeg = ui.seg('pr-std', [{ v: 'all', t: 'Both classes' }, { v: '11', t: 'Class 11' }, { v: '12', t: 'Class 12' }], form.std);
    const scopeBody =
      scope === 'chapter' ? chapterPicker()
      : scope === 'subject' ? '<div><span class="field-l">Subjects</span>' + subjChips + '</div><div><span class="field-l">Class</span>' + stdSeg + '</div>'
      : scope === 'cat'
        ? '<div><span class="field-l">CET priority (A = most marks)</span>' + chips('pr-cat', ['A', 'B', 'C'].map((v) => ({ v: v, t: CAT_HELP[v] })), (v) => form.cat.has(v)) + '</div><div><span class="field-l">Subjects</span>' + subjChips + '</div><div><span class="field-l">Class</span>' + stdSeg + '</div>'
      : scope === 'done' ? '<p class="small muted">' + (P.doneChapters().length ? 'Every chapter you marked Done that has questions.' : 'None of your chapters is marked Done yet. Mark one in Study.') + '</p>'
      : '<div><span class="field-l">Class</span>' + stdSeg + '</div>';
    return (
      '<div class="page"><header class="page-h"><div><h1 class="h1">Practice by topic</h1><p class="muted">No timer. One question at a time, with the full answer straight away.</p></div></header>' + resume +
      '<div class="pr-grid"><div class="pr-col"><section class="card stack"><h2 class="h3">What do you want to practise?</h2>' +
      '<div class="chips pr-scope" role="group" aria-label="Practise by">' + [['chapter', 'Chapters'], ['subject', 'Subject'], ['cat', 'CET wise'], ['all', 'Everything'], ['done', 'My done chapters']].map((x) =>
        '<button type="button" class="chip rip" aria-pressed="' + (scope === x[0]) + '" data-act="pr-scope" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      scopeBody + '</section></div><div class="pr-col pr-side">' +
      '<section class="card stack"><h2 class="h3">Narrow it down</h2>' +
      '<div><span class="field-l">Difficulty</span>' + ui.seg('pr-diff', [{ v: 'all', t: 'All' }, { v: '1', t: 'Easy' }, { v: '2', t: 'Medium' }, { v: '3', t: 'Hard' }], form.diff) + '</div>' +
      '<div><span class="field-l">Question type</span>' + ui.seg('pr-type', [{ v: 'mcq', t: 'MCQ' }, { v: 'num', t: 'Numerical' }, { v: 'both', t: 'Both' }], form.type) + '</div>' +
      '<div><span class="field-l">Show</span>' + ui.seg('pr-only', [{ v: 'all', t: 'All' }, { v: 'new', t: 'New only' }, { v: 'missed', t: 'Missed before' }], form.only) + '</div>' +
      '<div><span class="field-l">How many</span>' + ui.seg('pr-len', [{ v: '10', t: '10' }, { v: '20', t: '20' }, { v: '30', t: '30' }, { v: '50', t: '50' }, { v: '0', t: 'All' }], form.len) + '</div></section>' +
      '<section class="card stack pr-startcard"><p class="small" data-testid="pr-counts">' + (c.total ? '<b>' + c.total + '</b> questions in ' + u.plural(chs.length, 'chapter') + ': ' + c.fresh + ' new · ' + c.missed + ' missed before · ' + (c.seen - c.missed) + ' answered right before' :
        scope === 'chapter' && !form.sel.size ? 'Pick at least one chapter above.' : 'No questions match these choices. Try other filters.') + '</p>' +
      '<button class="btn primary block rip" data-act="pr-start"' + (c.total ? '' : ' disabled') + ' data-testid="pr-start">' + u.icon('play') + 'Start practice' + (c.total ? ' (' + (Number(form.len) ? Math.min(Number(form.len), c.total) : c.total) + ')' : '') + '</button></section>' +
      lastSessions() + '</div></div></div>'
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
        return '<button class="opt rip' + cls + '" role="radio" aria-checked="' + (r.sel === k) + '" data-act="pr-opt" data-i="' + i + '" data-v="' + k + '"' + (locked ? ' disabled' : '') + '><span class="let">' + 'ABCD'[k] + '</span><span class="ot">' + u.esc(o) +
          (locked && k === r.sel ? ' <small>(your answer)</small>' : '') + (locked && k === r.ans ? ' <small>(correct)</small>' : '') + '</span></button>';
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
      const sv = !!P.flagOf(r.qid);
      after =
        '<p class="verdict ' + (r.ok ? 'is-ok' : 'is-bad') + '" data-testid="pr-verdict"><b class="' + (r.ok ? 'tc-ok' : 'tc-bad') + '">' + (r.ok ? 'Correct' : 'Incorrect') + '</b></p>' +
        S.detail.html(q) +
        '<div class="tc-acts">' +
        '<button class="chip rip" data-act="q-save" data-id="' + r.qid + '" aria-pressed="' + sv + '" data-testid="pr-flag">' + u.icon(sv ? 'star-f' : 'star', 's') + (sv ? 'Saved' : 'Save to revisit') + '</button>' +
        (!r.ok ? '<button class="chip rip" data-act="pr-err" data-i="' + i + '"' + (added ? ' disabled' : '') + '>' + u.icon('notebook', 's') + (added ? 'In My mistakes' : 'Add to My mistakes') + '</button>' : '') + '</div>' +
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
        form.sel = new Set([ctx.query.ch]);
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

  const redo = () => S.app.refresh(true);
  const flip = (set, v, min) => { if (set.has(v)) { if (set.size > min) set.delete(v); } else set.add(v); };
  ui.actions['pr-scope'] = (el) => { form.scope = el.dataset.v; redo(); };
  ui.actions['pr-list'] = (el) => { form.list = el.dataset.v; redo(); };
  ui.actions['pr-pick'] = (el) => { flip(form.sel, el.dataset.id, 0); redo(); };
  ui.actions['pr-clear'] = () => { form.sel.clear(); redo(); };
  ui.actions['pr-subj'] = (el) => { flip(form.subj, el.dataset.v, 1); redo(); };
  ui.actions['pr-cat'] = (el) => { flip(form.cat, el.dataset.v, 1); redo(); };
  ui.actions['pr-std'] = (el) => { form.std = el.dataset.v; redo(); };
  ui.actions['pr-diff'] = (el) => { form.diff = el.dataset.v; redo(); };
  ui.actions['pr-type'] = (el) => { form.type = el.dataset.v; redo(); };
  ui.actions['pr-only'] = (el) => { form.only = el.dataset.v; redo(); };
  ui.actions['pr-len'] = (el) => { form.len = el.dataset.v; redo(); };
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
        ? '<div class="opts">' + q.options.map((o, k) => '<div class="opt' + (k === q.ans ? ' right' : '') + '"><span class="let">' + 'ABCD'[k] + '</span><span class="ot">' + u.esc(o) + (k === q.ans ? ' <small>(correct)</small>' : '') + '</span></div>').join('') + '</div>'
        : '<p>Answer: <b>' + u.esc(q.ans) + '</b> <small class="muted">(accepted within ±' + u.esc(q.tol) + ')</small></p>';
      root.innerHTML =
        '<div class="page tc-exam"><p class="small muted" data-testid="q-head">' + NAMES[D.CH[q.ch].subj] + ' · ' + u.esc(D.CH[q.ch].name) + ' · ' + DIFF[q.diff] + ' · ' + (q.type === 'mcq' ? 'MCQ' : 'Numerical') + '</p>' +
        '<p class="tc-stem">' + u.esc(q.q) + '</p>' + body +
        S.detail.html(q) +
        (f && f.note ? '<p class="small muted">Your note: ' + u.esc(f.note) + '</p>' : '') +
        '<div class="tc-acts"><button class="chip rip" data-act="q-save" data-id="' + qid + '" aria-pressed="' + !!f + '" data-testid="q-flag">' + u.icon(f ? 'star-f' : 'star', 's') + (f ? 'Saved' : 'Save to revisit') + '</button>' +
        (f ? '<button class="chip rip" data-act="flag-open" data-id="' + qid + '">' + u.icon('edit', 's') + 'Add a note</button>' : '') + '</div></div>';
    },
  };

  /* ================= #/flags: Saved questions ================= */
  S.views.flags = {
    title: 'Saved questions',
    tab: 'practice',
    fab: false,
    render(root) {
      const list = P.flags().slice().reverse();
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">Saved questions</h1><p class="muted">' + u.plural(list.length, 'question') + ' you saved to look at again.</p></div></header>' +
        (list.length
          ? '<button class="btn primary block rip" data-act="pr-saved" data-testid="pr-saved">' + u.icon('target') + 'Practise these ' + list.length + '</button>' +
            '<ul class="tc-keys">' + list.map((f) => {
              const q = bank()[f.qid];
              return '<li class="card stack tc-key" data-testid="flag-row"><p class="small muted">' + (q ? NAMES[D.CH[q.ch].subj] + ' · ' + u.esc(D.CH[q.ch].name) : u.esc(f.qid)) + ' · saved ' + u.esc(u.dateShort(f.date)) + '</p>' +
                '<p class="tc-stem">' + (q ? u.esc(q.q.slice(0, 200) + (q.q.length > 200 ? '…' : '')) : 'This question is no longer in the bank.') + '</p>' +
                (f.note ? '<p class="small"><b>Your note:</b> ' + u.esc(f.note) + '</p>' : '') +
                '<div class="row gap"><button class="btn tonal grow rip" data-act="go" data-to="#/q/' + f.qid + '">View answer</button><button class="btn outline grow rip" data-act="flag-remove" data-id="' + f.qid + '">Remove</button></div></li>';
            }).join('') + '</ul>'
          : ui.empty('star', 'Nothing saved yet', 'In a test or in practice, tap "Save to revisit" on a question you are unsure about. It will wait for you here.')) + '</div>';
    },
  };
  ui.actions['pr-saved'] = () => {
    const ids = P.flags().map((f) => f.qid).filter((id) => bank()[id]);
    if (!ids.length) return;
    begin({ qids: ids, chapters: Array.from(new Set(ids.map((id) => bank()[id].ch))), diff: 'all', len: 0, includeNum: ids.some((id) => bank()[id].type === 'num') });
    S.app.go('#/practice');
  };
  ui.actions['q-save'] = (el) => {
    const id = el.dataset.id;
    if (P.flagOf(id)) { P.unflag(id); ui.toast('Removed from Saved questions.'); } else { P.flag(id, ''); ui.toast('Saved. Find it in Practice > Saved.'); }
    S.app.refresh(true);
  };

  ui.actions['flag-open'] = (el) => {
    const id = el.dataset.id;
    const f = P.flagOf(id);
    ui.sheet.open({
      title: f ? 'Your note' : 'Save this question',
      html: '<form class="stack" onsubmit="return false" data-form="flag">' + ui.field('Note (optional)', '<textarea name="note" rows="3" maxlength="300" placeholder="Why did you save it? (optional)">' + u.esc(f ? f.note : '') + '</textarea>') +
        '<button class="btn primary block rip" data-act="flag-save" data-id="' + id + '">Save note</button>' +
        (f ? '<button class="btn danger block rip" data-act="flag-remove" data-id="' + id + '">Remove from Saved</button>' : '') + '</form>',
    });
  };
  ui.actions['flag-save'] = (el) => {
    const v = ui.values(u.$('[data-form="flag"]'));
    P.flag(el.dataset.id, v.note);
    ui.sheet.close();
    ui.toast('Saved.');
    S.app.refresh(true);
  };
  ui.actions['flag-remove'] = (el) => {
    P.unflag(el.dataset.id);
    if (ui.sheet.isOpen()) ui.sheet.close();
    ui.toast('Removed from Saved questions.');
    S.app.refresh(true);
  };

  S.practiceUI = { start: (chId) => S.app.go('#/practice?ch=' + chId) };
})((window.SOS = window.SOS || {}));

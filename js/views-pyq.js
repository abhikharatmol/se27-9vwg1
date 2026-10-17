/* views/pyq.js — Past papers (PYQ).
 *   #/pyq        link library (S.PYQ_SOURCES, from data/pyq-sources.json) with kind badges, the start
 *                form for a timed answer sheet, sheets waiting for a key, and past results; links the
 *                per-chapter PYQ tracker (#/pyq-tracker, views-subjects.js).
 *   #/omr/<id>   one answer sheet: the timed bubble sheet while it runs, then key entry, then the result.
 * Papers are never downloaded or re-hosted: every link opens the source in the browser. All timing,
 * scoring and storage is in js/pyq.js (S.pyq) and js/testcenter.js (S.tc).
 */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const ui = S.ui;
  const store = S.store;
  const TC = S.tc;
  const P = S.pyq;
  S.views = S.views || {};

  const KIND = { official: 'Official', 'third-party': 'Third-party', 'memory-based': 'Memory based, not official' };
  const EXAM = { cet: 'MHT-CET', jee: 'JEE Main' };
  const SUBJ = P.SUBJ_NAME;
  const form = { exam: 'cet', paper: '', label: '', num: '5' };
  const view = { edit: {}, report: {} }; // edit[id] = show key entry for a scored sheet; report[id][subj] = last parse report
  const ext = (href, text) => '<a class="btn tonal sm" href="' + u.esc(href) + '" target="_blank" rel="noopener noreferrer">' + u.esc(text) + '</a>';
  const clock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0');
  };

  /* ================= #/pyq ================= */
  function sourceHtml(s) {
    return (
      '<li class="pq-src" data-id="' + u.esc(s.id) + '"><div class="row-between"><b>' + u.esc(s.title) + '</b></div>' +
      '<p class="small"><span class="chip-s pq-kind" data-kind="' + s.kind + '">' + KIND[s.kind] + '</span> <span class="chip-s">' + EXAM[s.exam] + '</span> <span class="chip-s">' + u.esc(s.years) + '</span></p>' +
      '<p class="small muted">' + u.esc(s.notes) + '</p>' +
      (s.papers && s.papers.length
        ? '<details class="pq-papers"><summary>' + u.plural(s.papers.length, 'paper') + '</summary><ul>' + s.papers.map((p) => '<li>' + ext(p.link, p.label) + '</li>').join('') + '</ul></details>'
        : '') +
      '<div class="row gap">' + ext(s.link, 'Open') + '<span class="tiny muted">Checked ' + u.esc(u.dateShort(s.checked)) + '</span></div></li>'
    );
  }

  // Official paper list for the exam (labels from the library), for the start form.
  function knownPapers(exam) {
    const out = [];
    (S.PYQ_SOURCES || []).filter((s) => s.exam === exam).forEach((s) => (s.papers || []).forEach((p) => out.push({ v: s.id + '|' + p.label, t: p.label })));
    return out;
  }

  // The CET sheet as the Test Center defines it (js/testcenter.js CET + cetRules), not retyped.
  function cetText() {
    const r = TC.cetRules();
    const marks = ['phy', 'chem', 'mth'].map((s) => SUBJ[s] + ' ' + u.plural(r[s].mcq[0], 'mark')).join(', ');
    return TC.CET.map((d, i) => 'Block ' + (i + 1) + ': ' + d.label + ', ' + d.mins + ' minutes' + (i < TC.CET.length - 1 ? ', then it locks (as in the app’s CET mock)' : '')).join('. ') +
      '. ' + marks + (['phy', 'chem', 'mth'].every((s) => r[s].mcq[1] === 0) ? ', no negative marking.' : '.');
  }

  function startHtml() {
    const papers = knownPapers(form.exam);
    if (form.paper && !papers.some((p) => p.v === form.paper)) form.paper = '';
    const other = !form.paper;
    return (
      '<section class="card stack" data-testid="pq-start"><h2 class="h3">Take a paper</h2>' +
      '<p class="small muted">Open the paper from a source below and solve it on paper. Mark each answer here as you go; the timer works like the real exam. When time is up (or you submit), enter the answer key to get your score.</p>' +
      ui.seg('pq-exam', [{ v: 'cet', t: 'MHT-CET PCM' }, { v: 'jee', t: 'JEE Main' }], form.exam) +
      (papers.length ? ui.field('Paper', ui.select('pq-paper', [{ v: '', t: 'Other paper (type its name)' }].concat(papers), form.paper).replace('<select ', '<select data-change="pq-paper" ')) : '') +
      (other ? ui.field('Paper name', '<input type="text" maxlength="80" id="pq-label" data-input="pq-label" placeholder="' + (form.exam === 'cet' ? 'e.g. 2024, 9 May Shift 1' : 'e.g. 2025, 22 Jan Shift 1') + '" value="' + u.esc(form.label) + '">') : '') +
      (form.exam === 'jee'
        ? '<div><span class="field-l">Numericals per subject (Section B)</span>' + ui.seg('pq-num', [{ v: '5', t: '5' }, { v: '10', t: '10' }], form.num) + '</div>' +
          '<p class="small muted">Follow your paper’s own instructions (for example, how many numericals to answer). The app scores every answer you fill in.</p>'
        : '<p class="small muted">' + cetText() + '</p>') +
      '<button class="btn primary block rip" data-act="pq-go" data-testid="pq-go">' + u.icon('timer') + 'Start the timed sheet</button></section>'
    );
  }

  function runningHtml() {
    const a = TC.active();
    const waiting = P.awaitingKey();
    let out = '';
    if (a && a.mode === 'pyq') {
      out += '<section class="card stack"><h2 class="h3">Answer sheet running</h2><p class="small muted">' + u.esc(a.title) + ' · <span data-pq-left>' + clock(TC.timeLeft(a, Date.now())) + '</span> left in this block</p>' +
        '<button class="btn primary block rip" data-act="go" data-to="#/omr/' + a.id + '" data-testid="pq-resume">' + u.icon('play') + 'Back to the sheet</button></section>';
    }
    if (waiting.length) {
      out += '<section class="card list-card"><h2 class="h3">Waiting for the answer key</h2><ul class="recs">' +
        waiting.map((x) => '<li><button class="rec rip" data-act="go" data-to="#/omr/' + x.id + '">' + u.icon('edit') + '<span><b>' + u.esc(x.title) + '</b><small>' + u.esc(u.dateShort(x.date)) + ' · enter the key to score it</small></span>' + u.icon('chev-r', 'chev') + '</button></li>').join('') +
        '</ul></section>';
    }
    return out;
  }

  function pastHtml() {
    const done = P.all().filter((a) => a.status === 'submitted').slice(-8).reverse();
    if (!done.length) return '';
    return (
      '<section class="card list-card"><h2 class="h3">Your past papers</h2><ul class="atts">' +
      done.map((a) => {
        const pct = a.maxScore ? Math.min(100, Math.round((100 * a.score) / a.maxScore)) : 0;
        return '<li><button class="att rip" data-act="go" data-to="#/omr/' + a.id + '"><span class="att-p">' + pct + '%</span><span class="att-b"><b>' + u.esc(a.title) + '</b><small>' + u.esc(u.dateShort(a.date)) + ' · ' + a.score + '/' + a.maxScore + '</small></span></button></li>';
      }).join('') + '</ul></section>'
    );
  }

  function libraryHtml() {
    return (
      '<section class="card stack"><h2 class="h3">Where to find papers</h2>' +
      '<p class="small muted">Links open in your browser and need internet. Official sources first. Memory-based papers were rebuilt from what students remembered, so their questions and keys can be wrong.</p>' +
      '<ul class="pq-srcs" data-testid="pq-sources">' + (S.PYQ_SOURCES || []).map(sourceHtml).join('') + '</ul></section>'
    );
  }

  S.views.pyq = {
    title: 'Past papers',
    tab: 'tests',
    pushed: true,
    fab: false,
    render(root, ctx) {
      const a = document.activeElement;
      if (!ctx.first && a && a.id === 'pq-label' && u.$('.pq', root)) return; // keep the keyboard while she types the name
      root.innerHTML =
        '<div class="page pq"><header class="page-h"><div><h1 class="h1">Past papers</h1><p class="muted">Solve a real paper on paper, mark your answers on a timed sheet, then score it with the key.</p></div></header>' +
        runningHtml() + startHtml() + pastHtml() +
        '<section class="card list-card"><ul class="recs"><li><button class="rec rip" data-act="go" data-to="#/pyq-tracker" data-testid="pq-tracker">' + u.icon('target') +
        '<span><b>Chapter PYQ tracker</b><small>Solved, accuracy and remaining per chapter</small></span>' + u.icon('chev-r', 'chev') + '</button></li></ul></section>' +
        libraryHtml() + '</div>';
    },
    tick() {
      const a = TC.active();
      const el = u.$('[data-pq-left]');
      if (a && a.mode === 'pyq' && el) el.textContent = clock(TC.timeLeft(a, Date.now()));
    },
  };

  ui.actions['pq-exam'] = (el) => {
    form.exam = el.dataset.v;
    form.paper = '';
    S.app.refresh(true);
  };
  ui.changes['pq-paper'] = (el) => {
    form.paper = el.value;
    S.app.refresh(true);
  };
  ui.inputs['pq-label'] = (el) => (form.label = el.value);
  ui.actions['pq-num'] = (el) => {
    form.num = el.dataset.v;
    S.app.refresh(true);
  };
  ui.actions['pq-go'] = async () => {
    const chosen = form.paper ? form.paper.split('|') : null;
    const label = chosen ? chosen.slice(1).join('|') : form.label.trim();
    if (!label) return ui.toast('Type the paper’s name first (year and shift), so you can find it later.');
    const opts = { label: label, sourceId: chosen ? chosen[0] : '', num: form.exam === 'jee' ? Number(form.num) : undefined };
    let res = P.start(form.exam, opts);
    if (!res.ok && res.reason === 'active') {
      const resume = await ui.confirm({ title: 'A test is already running', text: '"' + res.attempt.title + '" is still in progress. Resume it?', ok: 'Resume', cancel: 'Discard it instead' });
      if (resume) return S.tcUI.goAfterSheet(res.attempt.mode === 'pyq' ? '#/omr/' + res.attempt.id : '#/exam');
      const sure = await ui.confirm({ title: 'Discard the running test?', text: 'Its answers so far will be lost and it will not be scored.', ok: 'Discard and start', danger: true });
      if (!sure) return;
      TC.discardActive();
      res = P.start(form.exam, opts);
    }
    if (!res.ok) return ui.toast(res.error || 'Could not start the sheet.');
    u.haptic('ok');
    form.label = '';
    S.tcUI.goAfterSheet('#/omr/' + res.attempt.id);
  };

  /* ================= #/omr/<id> ================= */
  function sheetHtml(a) {
    const now = Date.now();
    const sec = a.sections[a.pos.sec];
    const answered = a.questions.filter((r) => r.sel != null).length;
    const blockLabel = (i) => (a.paper.exam === 'cet' ? 'Block ' + (i + 1) + ': ' : '') + a.sections[i].label;
    let body = '';
    a.sections.forEach((s, si) => {
      const open = si === a.pos.sec;
      const state = s.lockedAt != null ? 'Locked' : open ? 'Open now' : 'Opens when ' + blockLabel(a.pos.sec) + ' ends';
      body += '<section class="card om-sec' + (open ? '' : ' is-closed') + '" data-sec="' + si + '"><div class="row-between"><h2 class="h3">' + u.esc(blockLabel(si)) + '</h2><span class="chip-s' + (open ? '' : ' warn') + '">' + state + '</span></div>';
      s.subjects.forEach((subj) => {
        body += '<h3 class="h4 om-subj">' + SUBJ[subj] + '</h3><ol class="om-rows">';
        s.qIdx.forEach((qi) => {
          const r = a.questions[qi];
          if (r.subj !== subj) return;
          const dis = open ? '' : ' disabled';
          let cells;
          if (r.type === 'mcq') {
            cells = P.LETTERS.split('').map((L, k) => '<button class="om-b rip" aria-pressed="' + (r.sel === k) + '" aria-label="' + SUBJ[subj] + ' ' + r.n + ' ' + L + '" data-act="om-b" data-i="' + qi + '" data-v="' + k + '"' + dis + '>' + L + '</button>').join('');
          } else {
            cells = '<input class="om-num" type="text" inputmode="decimal" maxlength="12" aria-label="' + SUBJ[subj] + ' ' + r.n + ' numerical answer" value="' + (r.sel == null ? '' : u.esc(r.sel)) + '" data-change="om-num" data-i="' + qi + '"' + dis + '>';
          }
          body += '<li class="om-row' + (r.sel != null ? ' is-ans' : '') + '"><span class="om-n">' + r.n + '</span>' + cells +
            '<button class="om-x rip" aria-label="Clear ' + SUBJ[subj] + ' ' + r.n + '" data-act="om-x" data-i="' + qi + '"' + (r.sel == null || !open ? ' disabled' : '') + '>' + u.icon('x') + '</button></li>';
        });
        body += '</ol>';
        if (a.paper.exam === 'jee') body += '<p class="tiny muted">Numericals (' + (TC.JEE.perSubj.mcq + 1) + ' onward): follow your paper’s own instructions. Every answer you fill in is scored.</p>';
      });
      body += '</section>';
    });
    return (
      '<div class="page om" data-id="' + a.id + '"><div class="om-bar card"><div><b>' + u.esc(blockLabel(a.pos.sec)) + '</b><small class="muted"> · ' + answered + ' of ' + a.questions.length + ' marked</small></div>' +
      '<b class="om-clock" data-om-left>' + clock(TC.timeLeft(a, now)) + '</b></div>' +
      '<p class="small muted">' + u.esc(a.title) + '. Solve on paper; tap the bubble for your answer. Tap it again (or ×) to clear.</p>' +
      body +
      '<button class="btn primary block rip" data-act="om-submit" data-testid="om-submit">Submit the sheet</button></div>'
    );
  }

  function keyHtml(a) {
    const subjects = P.subjectsOf(a);
    const draft = a.keyDraft || {};
    const rep = view.report[a.id] || {};
    const blocks = subjects.map((subj) => {
      const d = draft[subj] || { text: '', answers: {} };
      const rows = a.questions.filter((r) => r.subj === subj);
      const keyOf = (r) => {
        if (d.answers && d.answers[r.n] !== undefined) return d.answers[r.n];
        if (r.ans == null) return '';
        return r.type === 'mcq' ? P.LETTERS[r.ans] : r.ans;
      };
      const rp = rep[subj];
      const report = rp
        ? '<div class="small om-rep" data-testid="om-report-' + subj + '">Read ' + Object.keys(rp.answers).length + ' answers.' +
          (rp.unparsed.length ? '<br><b>Could not read:</b> ' + rp.unparsed.map((l) => '“' + u.esc(l) + '”').join(', ') : '') +
          (rp.bad.length ? '<br><b>Wrong kind of answer:</b> ' + rp.bad.map((b) => 'Q' + b.n + ' “' + u.esc(b.got) + '” (' + b.why + ')').join(', ') : '') +
          (rp.conflicts.length ? '<br><b>Two different answers, left blank:</b> Q' + rp.conflicts.join(', Q') : '') +
          (rp.extra.length ? '<br><b>Not on this sheet:</b> Q' + rp.extra.join(', Q') : '') +
          (rp.missing.length ? '<br>No key yet for ' + u.plural(rp.missing.length, 'question') + '.' : '') + '</div>'
        : '';
      return (
        '<section class="card stack" data-subj="' + subj + '"><h2 class="h3">' + SUBJ[subj] + ' key</h2>' +
        '<label class="field"><span class="field-l">Paste the key (for example “1 A”, “2-C”, “3) B”, or a row “A B C D”)</span><textarea rows="4" data-input="om-key-text" data-subj="' + subj + '" data-testid="om-paste-' + subj + '">' + u.esc(d.text || '') + '</textarea></label>' +
        '<button class="btn tonal block rip" data-act="om-read" data-subj="' + subj + '" data-testid="om-read-' + subj + '">Read the pasted key</button>' + report +
        '<p class="small muted">Or type each answer. Leave a box empty if you do not have that answer: it is then not scored.</p>' +
        '<ol class="om-keys">' + rows.map((r) => '<li><span class="om-n">' + r.n + '</span><input type="text" ' + (r.type === 'mcq' ? 'maxlength="1" autocapitalize="characters"' : 'inputmode="decimal" maxlength="12"') + ' aria-label="Key for ' + SUBJ[subj] + ' ' + r.n + '" value="' + u.esc(keyOf(r)) + '" data-change="om-key" data-subj="' + subj + '" data-n="' + r.n + '" data-type="' + r.type + '"></li>').join('') + '</ol></section>'
      );
    }).join('');
    return (
      '<div class="page om" data-id="' + a.id + '"><header class="page-h"><div><h1 class="h1">Answer key</h1><p class="muted">' + u.esc(a.title) + '</p></div></header>' +
      '<p class="small muted">Use the official key when there is one. A memory-based key can be wrong.</p>' + blocks +
      '<button class="btn primary block rip" data-act="om-score" data-testid="om-score">' + u.icon('check') + (a.keyed ? 'Score again with this key' : 'Score my sheet') + '</button>' +
      (a.keyed ? '' : '<button class="btn danger block rip" data-act="om-discard" data-id="' + a.id + '">' + u.icon('trash') + 'Discard this sheet</button>') + '</div>'
    );
  }

  function resultHtml(a) {
    const fmt = (r, v) => (v == null ? '–' : r.type === 'mcq' ? P.LETTERS[v] : String(v));
    const mins = Math.max(0, Math.round((a.submittedAt - a.startedAt) / 60000));
    const subjects = P.subjectsOf(a);
    const table = subjects.map((s) => {
      const b = a.bySubj[s];
      return '<tr><td>' + SUBJ[s] + '</td><td>' + b.score + '/' + b.max + '</td><td>' + b.correct + '</td><td>' + b.wrong + '</td><td>' + b.unanswered + '</td><td>' + b.nokey + '</td></tr>';
    }).join('');
    const lists = subjects.map((s) => {
      const rows = a.questions.map((r, i) => ({ r: r, i: i })).filter((x) => x.r.subj === s && !x.r.nokey && x.r.sel != null);
      if (!rows.length) return '';
      return '<section class="card list-card"><h2 class="h3">' + SUBJ[s] + ': your answers</h2><ol class="om-res">' + rows.map((x) => {
        const r = x.r;
        const mark = r.ok ? '<b class="tc-ok">Right</b>' : '<b class="tc-bad">Wrong</b>';
        return '<li><span class="om-n">' + r.n + '</span><span class="grow">You ' + fmt(r, r.sel) + ' · key ' + fmt(r, r.ans) + ' · ' + mark + ' (' + (r.marks > 0 ? '+' : '') + r.marks + ')</span>' +
          (r.ok === false ? '<button class="btn tonal sm rip" data-act="om-err" data-id="' + a.id + '" data-i="' + x.i + '">' + u.icon('notebook') + 'Notebook</button>' : '') + '</li>';
      }).join('') + '</ol></section>';
    }).join('');
    return (
      '<div class="page om" data-id="' + a.id + '"><header class="page-h"><div><h1 class="h1">Your score</h1><p class="muted">' + u.esc(a.title) + ' · ' + u.esc(u.dateShort(a.date)) + '</p></div></header>' +
      '<section class="card"><div class="stats3"><div><b class="num" data-testid="om-score-total">' + a.score + '<small>/' + a.maxScore + '</small></b><small>Score</small></div>' +
      '<div><b class="num">' + a.correct + '</b><small>Right</small></div><div><b class="num">' + a.wrong + '</b><small>Wrong</small></div></div>' +
      '<p class="small muted center">' + a.unanswered + ' skipped · ' + u.plural(a.nokey, 'question') + ' without a key (not scored) · ' + u.plural(mins, 'minute') + '</p>' +
      (a.score > a.maxScore ? '<p class="small warn center" data-testid="om-over">More than the paper’s maximum: you filled more numericals than it asks you to answer. Your mock history counts it as ' + a.maxScore + '.</p>' : '') + '</section>' +
      '<section class="card"><h2 class="h3">By subject</h2><table class="tc-tab om-tab"><thead><tr><th>Subject</th><th>Score</th><th>Right</th><th>Wrong</th><th>Skip</th><th>No key</th></tr></thead><tbody>' + table + '</tbody></table></section>' +
      '<button class="btn tonal block rip" data-act="om-edit" data-id="' + a.id + '">' + u.icon('edit') + 'Correct the key</button>' +
      lists + '</div>'
    );
  }

  S.views.omr = {
    title: 'Answer sheet',
    tab: 'tests',
    pushed: true,
    fab: false,
    pageTitle(ctx) {
      const a = P.get(ctx.params[0]);
      return a ? (a.status === 'active' ? 'Answer sheet' : a.status === 'awaiting-key' ? 'Answer key' : 'Score') : 'Answer sheet';
    },
    render(root, ctx) {
      const a = P.get(ctx.params[0]);
      if (!a) {
        root.innerHTML = '<div class="page">' + ui.empty('clipboard', 'Sheet not found', 'It was deleted or discarded.', '<button class="btn tonal rip" data-act="go" data-to="#/pyq">Past papers</button>') + '</div>';
        return;
      }
      const act = document.activeElement;
      // Typing a key or a numerical answer: do not redraw under her (the keyboard would close).
      if (!ctx.first && act && /^(INPUT|TEXTAREA)$/.test(act.tagName) && u.$('.om', root) && u.$('.om', root).dataset.id === a.id) return;
      if (a.status === 'active') root.innerHTML = sheetHtml(a);
      else if (a.status === 'awaiting-key' || view.edit[a.id]) root.innerHTML = keyHtml(a);
      else root.innerHTML = resultHtml(a);
    },
    tick() {
      const a = TC.active();
      const el = u.$('[data-om-left]');
      if (!a || a.mode !== 'pyq' || !el) return;
      el.textContent = clock(TC.timeLeft(a, Date.now()));
    },
  };

  const currentId = () => (u.$('.om') || {}).dataset && u.$('.om').dataset.id;
  // Leave any text box before a redraw she asked for (render() skips redraws while a box has focus).
  const blurNow = () => document.activeElement && document.activeElement.blur && document.activeElement.blur();
  ui.actions['om-b'] = (el) => {
    const a = TC.active();
    const qi = Number(el.dataset.i);
    if (!a || a.mode !== 'pyq') return;
    const v = Number(el.dataset.v);
    P.mark(qi, a.questions[qi].sel === v ? '' : v);
    u.haptic();
  };
  ui.actions['om-x'] = (el) => P.mark(Number(el.dataset.i), '');
  ui.changes['om-num'] = (el) => {
    const v = el.value.trim();
    if (v && !/^[-+]?\d+(\.\d+)?$/.test(v)) {
      el.value = '';
      ui.toast('Type a number (for example 12, -3 or 4.5).');
      return;
    }
    P.mark(Number(el.dataset.i), v);
  };
  ui.actions['om-submit'] = async () => {
    const a = TC.active();
    if (!a || a.mode !== 'pyq') return;
    const blank = a.questions.filter((r) => r.sel == null).length;
    const ok = await ui.confirm({ title: 'Submit the sheet?', text: (blank ? blank + ' questions are not marked. ' : '') + 'After this you enter the answer key to get your score.', ok: 'Submit' });
    if (!ok) return;
    TC.submitActive();
    u.haptic('ok');
    blurNow();
    S.app.refresh(true);
  };

  function readDraft(id, subj) {
    const a = P.get(id);
    return Object.assign({ text: '', answers: {} }, (a.keyDraft || {})[subj] || {});
  }
  ui.inputs['om-key-text'] = (el) => {
    const id = currentId();
    const d = readDraft(id, el.dataset.subj);
    d.text = el.value;
    P.saveDraft(id, el.dataset.subj, d);
  };
  ui.actions['om-read'] = (el) => {
    const id = currentId();
    const a = P.get(id);
    const subj = el.dataset.subj;
    const ta = u.$('textarea[data-subj="' + subj + '"]');
    const res = P.parseKey(ta ? ta.value : '', P.specOf(a, subj));
    const d = readDraft(id, subj);
    d.text = ta ? ta.value : d.text;
    d.answers = Object.assign({}, d.answers, res.answers);
    res.conflicts.forEach((n) => delete d.answers[n]); // "two different answers, left blank" means blank
    P.saveDraft(id, subj, d);
    view.report[id] = view.report[id] || {};
    view.report[id][subj] = res;
    blurNow();
    S.app.refresh(true);
  };
  ui.changes['om-key'] = (el) => {
    const id = currentId();
    const subj = el.dataset.subj;
    let v = el.value.trim();
    if (v && el.dataset.type === 'mcq') {
      v = v.toUpperCase();
      if (!/^[ABCD]$/.test(v)) {
        el.value = '';
        return ui.toast('A key answer is A, B, C or D.');
      }
    }
    if (v && el.dataset.type === 'num' && !/^[-+]?\d+(\.\d+)?$/.test(v)) {
      el.value = '';
      return ui.toast('A numerical key is a number.');
    }
    const d = readDraft(id, subj);
    if (v) d.answers[el.dataset.n] = el.dataset.type === 'num' ? Number(v) : v;
    else delete d.answers[el.dataset.n];
    el.value = v;
    P.saveDraft(id, subj, d);
  };
  ui.actions['om-score'] = () => {
    const id = currentId();
    const a = P.get(id);
    const keys = {};
    P.subjectsOf(a).forEach((s) => (keys[s] = readDraft(id, s).answers));
    const n = Object.keys(keys).reduce((t, s) => t + Object.keys(keys[s]).length, 0);
    if (!n) return ui.toast('Enter at least one key answer first.');
    blurNow();
    P.applyKey(id, keys);
    view.edit[id] = false;
    u.haptic('ok');
    window.scrollTo(0, 0);
    S.app.refresh(true);
  };
  ui.actions['om-discard'] = async (el) => {
    const ok = await ui.confirm({ title: 'Discard this sheet?', text: 'Your marked answers for this paper will be deleted. This cannot be undone.', ok: 'Discard', danger: true });
    if (!ok) return;
    P.discardUnkeyed(el.dataset.id);
    S.tcUI.goAfterSheet('#/pyq');
  };
  ui.actions['om-edit'] = (el) => {
    view.edit[el.dataset.id] = true;
    blurNow();
    S.app.refresh(true);
  };
  ui.actions['om-err'] = (el) => {
    const a = P.get(el.dataset.id);
    const r = a.questions[Number(el.dataset.i)];
    const chapters = D.CHAPTERS.filter((c) => c.subj === r.subj);
    ui.sheet.open({
      title: 'Add to Error Notebook',
      html: '<form class="stack" onsubmit="return false" data-form="om-err"><p class="small muted">' + u.esc(SUBJ[r.subj] + ' Q' + r.n) + '. Pick the chapter if you know it; you can also leave it empty.</p>' +
        ui.field('Chapter (optional)', ui.select('ch', [{ v: '', t: 'Not sure / skip' }].concat(chapters.map((c) => ({ v: c.id, t: c.name }))), '')) +
        '<button class="btn primary block rip" data-act="om-err-save" data-id="' + a.id + '" data-i="' + el.dataset.i + '" data-testid="om-err-save">Add</button></form>',
    });
  };
  ui.actions['om-err-save'] = (el) => {
    const ch = ui.values(u.$('[data-form="om-err"]')).ch;
    const res = P.logError(el.dataset.id, Number(el.dataset.i), ch);
    ui.sheet.close();
    if (res.ok) ui.toast('Added to your Error Notebook.');
    else if (res.reason === 'duplicate') ui.toast('Already in your Error Notebook.');
    else ui.toast('Could not add this question.');
  };

  S.pyqUI = { KIND: KIND, EXAM: EXAM, clock: clock };
  void store;
})((window.SOS = window.SOS || {}));

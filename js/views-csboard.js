/* views/csboard.js — HSC Computer Science board practice: #/csboard (the 9 chapters), #/csboard/<chapter> (its questions) and
 * #/csboard/<chapter>/<n> (one question, n = position in the chapter, from 1), #/csboard/papers (the printed board papers of March 2022 to 2024)
 * and #/csboard/papers/<id> (one paper: its parts with the choose-N rule; each question opens the model answer, ?p=<id> brings Back to the paper).
 * The questions are the board's own, kept as they were set (they come back year after year); each one says where it appeared.
 * The model answers and marking points are our own words. A 1-mark question is a multiple choice with a short reason. A 3, 4 or
 * 5-mark question is written on paper first; then she opens the model answer, ticks the points she wrote, and the marks are added.
 * Data: data/cs-c/<chapter>.js (loaded on demand, window.CS_C[chapter] = items) and the counts in S.CS_INDEX.
 * Store: domain `cs` = { done: { [id]: { at, got, max, pts, pick } }, saved: [id] }. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const ui = S.ui;
  const store = S.store;
  S.views = S.views || {};

  const state = {}; // chapter id -> 'loading' | 'ready' | 'failed'
  const flt = { v: 'all' }; // list filter: all | mcq | short | prog | saved | todo
  const draft = {}; // question id -> { pts: [bool], shown: bool } while she is answering
  const PAPER = { 'cs-12-01': 'I', 'cs-12-02': 'I', 'cs-12-03': 'I', 'cs-12-04': 'I', 'cs-12-05': 'II', 'cs-12-06': 'II', 'cs-12-07': 'II', 'cs-12-08': 'II', 'cs-12-09': 'II' };
  const KIND = { mcq: 'MCQ', short: 'Written', prog: 'Program' };

  const chapters = () => D.BY_SUBJECT.cs.filter((c) => c.std === 12);
  const idx = (id) => (S.CS_INDEX || {})[id] || { n: 0, mcq: 0, short: 0, prog: 0, marks: 0 };
  const table = () => window.CS_C || {};
  const items = (ch) => table()[ch] || [];
  const done = () => store.get('cs').done;
  const saved = () => store.get('cs').saved;
  const doneCount = (ch) => items(ch).filter((q) => done()[q.id]).length;

  function ensure(ch) {
    if (table()[ch]) {
      state[ch] = 'ready';
      return;
    }
    if (!idx(ch).n || state[ch] === 'loading' || state[ch] === 'failed') return;
    state[ch] = 'loading';
    const s = document.createElement('script');
    s.src = 'data/cs-c/' + ch + '.js';
    s.async = true;
    s.onload = () => {
      state[ch] = table()[ch] ? 'ready' : 'failed';
      S.app.refresh(false);
    };
    s.onerror = () => {
      state[ch] = 'failed';
      s.remove();
      S.app.refresh(false);
    };
    document.head.appendChild(s);
  }

  const marksChip = (q) => '<span class="cs-m" data-m="' + q.marks + '">' + q.marks + (q.marks === 1 ? ' mark' : ' marks') + '</span>';
  const srcChips = (q) => (q.src || []).map((x) => '<span class="chip-s">' + u.esc(x) + '</span>').join(' ');

  /* ---------- index: the nine chapters ---------- */
  function indexHtml() {
    const rows = chapters().map((c) => {
      const ix = idx(c.id);
      const tot = ix.n;
      const dn = Object.keys(done()).filter((k) => k.indexOf(c.id + '-') === 0).length;
      return '<li><button class="lrow rip" data-act="go" data-to="#/csboard/' + c.id + '" data-testid="cs-' + c.id + '"' + (tot ? '' : ' aria-disabled="true"') + '>' +
        '<span class="rv-no" data-s="cs">' + (c.tb || '') + '</span><span class="grow"><b class="rt">' + u.esc(c.name) + '</b><small class="rs">Paper ' + PAPER[c.id] + ' · ' +
        (tot ? tot + ' board questions · ' + ix.marks + ' marks' + (dn ? ' · ' + dn + ' done' : '') : 'Questions coming') + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>';
    }).join('');
    const all = chapters().reduce((n, c) => n + idx(c.id).n, 0);
    return (
      '<div class="page cs-index"><header class="page-h"><div><h1 class="h1">HSC Computer Science</h1><p class="muted">The board\'s own questions, exactly as they were set, with model answers. ' + all + ' questions so far.</p></div></header>' +
      papersCard() + '<ul class="list">' + rows + '</ul>' +
      '<section class="card"><h2 class="h3">How to use it</h2><ol class="cs-how"><li>Open a chapter and pick a question.</li><li>Write your answer on paper, like in the exam.</li><li>Open the model answer, tick the points you wrote, and see your marks.</li></ol>' +
      '<p class="small muted">Both papers are 50 marks, 3 hours. Paper I: OS, Data Structure, C++, HTML. Paper II: 8085, 8051, x86 and Networking.</p></section>' + '</div>'
    );
  }

  /* ---------- board papers ---------- */
  const papers = () => S.CS_PAPERS || [];
  const paperQs = (p) => p.parts.reduce((a, pt) => a.concat(pt.qs), []);
  // marks she scored on a question of the paper, scaled to the marks the paper gives it (the guide may count it differently)
  const qScore = (q) => { const d = done()[q.ref]; return d ? (d.got / (d.max || 1)) * q.marks : null; };
  const need = (pt) => (pt.rule === 'all' ? pt.qs.length : Number(pt.rule.slice(-1)));
  function partScore(pt) {
    const got = pt.qs.map(qScore).filter((x) => x !== null).sort((a, b) => b - a).slice(0, need(pt));
    return { got: got.reduce((n, x) => n + x, 0), tried: got.length, need: need(pt) };
  }
  function paperScore(p) {
    const by = {};
    p.parts.forEach((pt) => { by[pt.id] = partScore(pt); });
    let got = 0, tried = 0, total = 0;
    p.parts.forEach((pt) => {
      if (pt.id === '5or') return; // Q.5 and its OR set are alternatives: the better one counts
      const s = pt.id === '5' && by['5or'] && by['5or'].got > by['5'].got ? by['5or'] : by[pt.id];
      got += s.got; tried += s.tried; total += s.need;
    });
    return { got: Math.round(got * 10) / 10, tried: tried, total: total };
  }
  function papersCard() {
    const n = papers().length;
    if (!n) return '';
    return '<section class="card cs-papers-card"><h2 class="h3">Board papers</h2><p class="muted small">The full papers of March 2022, 2023 and 2024, Paper I and Paper II, exactly as printed. Attempt them like the exam: all the compulsory questions, and the "any two" and "any one" choices.</p>' +
      '<button class="btn primary block rip" data-act="go" data-to="#/csboard/papers" data-testid="cs-papers">Open the ' + n + ' papers</button></section>';
  }
  function papersHtml() {
    const rows = papers().map((p) => {
      const sc = paperScore(p);
      return '<li><button class="lrow rip" data-act="go" data-to="#/csboard/papers/' + p.id + '" data-testid="cs-paper"><span class="rv-no" data-s="cs">' + (p.paper === 1 ? 'I' : 'II') + '</span><span class="grow"><b class="rt">' + u.esc(p.title) + '</b><small class="rs">' + u.esc(p.sub) + ' · ' + p.marks + ' marks, 3 hours' + (sc.tried ? ' · ' + sc.tried + ' of ' + sc.total + ' answered' : '') + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>';
    }).join('');
    return '<div class="page cs-index"><header class="page-h"><div><h1 class="h1">Board papers</h1><p class="muted">Past HSC Computer Science papers. Each question opens the model answer.</p></div></header><ul class="list">' + rows + '</ul></div>';
  }
  function paperHtml(id) {
    const p = papers().filter((x) => x.id === id)[0];
    if (!p) return '<div class="page">' + ui.empty('book', 'Paper not found', 'Go back to the list of papers.', '<button class="btn tonal rip" data-act="go" data-to="#/csboard/papers">All papers</button>') + '</div>';
    const sc = paperScore(p);
    const parts = p.parts.map((pt) => {
      const ps = partScore(pt);
      const qs = pt.qs.map((q) => {
        const d = done()[q.ref];
        return '<li><button class="lrow rip cs-row" data-act="go" data-to="#/csboard/' + q.ch + '/' + q.i + '?p=' + p.id + '" data-testid="cs-pq"><span class="cs-no">' + u.esc(q.n) + '</span><span class="grow"><b class="rt cs-qt">' + u.esc(q.q).replace(/\n/g, '<br>') + '</b><small class="rs">' + marksChip(q) + '</small></span>' +
          (d ? '<span class="cs-done" title="Done: ' + d.got + ' of ' + d.max + '">' + u.icon('check-c') + '</span>' : '') + '</button></li>';
      }).join('');
      return '<section class="cs-part"><h2 class="h3">' + u.esc(pt.label) + '</h2>' + (pt.id === '5or' ? '<p class="small muted">This set is the alternative of Q.5: in the exam you answer one of the two sets.</p>' : '') + (pt.note ? '<p class="small muted">' + u.esc(pt.note) + '</p>' : '') + '<ul class="list">' + qs + '</ul></section>';
    }).join('');
    return '<div class="page cs-paper"><header class="page-h"><div><h1 class="h1">' + u.esc(p.title) + '</h1><p class="muted">' + u.esc(p.sub) + ' · ' + p.marks + ' marks · 3 hours</p></div></header>' +
      '<section class="card"><b data-testid="cs-pscore">' + sc.got + ' of ' + p.marks + ' marks</b><p class="small muted">From the questions you have answered here (' + sc.tried + ' of ' + sc.total + '). In each "any" part, your best answers count.</p></section>' + parts + '</div>';
  }

  /* ---------- one chapter: the list ---------- */
  const FILTERS = [{ v: 'all', t: 'All' }, { v: 'mcq', t: 'MCQ' }, { v: 'short', t: 'Written' }, { v: 'prog', t: 'Programs' }, { v: 'todo', t: 'To do' }, { v: 'saved', t: 'Saved' }];
  function listHtml(ch) {
    const c = D.CH[ch];
    const all = items(ch);
    const pick = (q) => (flt.v === 'all' ? true : flt.v === 'todo' ? !done()[q.id] : flt.v === 'saved' ? saved().indexOf(q.id) >= 0 : q.kind === flt.v);
    const rows = all.map((q, i) => ({ q: q, n: i + 1 })).filter((r) => pick(r.q)).map((r) => {
      const d = done()[r.q.id];
      return '<li><button class="lrow rip cs-row" data-act="go" data-to="#/csboard/' + ch + '/' + r.n + '" data-testid="cs-q">' +
        '<span class="cs-no">' + r.n + '</span><span class="grow"><b class="rt cs-qt">' + u.esc(r.q.q) + '</b><small class="rs">' + KIND[r.q.kind] + ' · ' + marksChip(r.q) + ' ' + (r.q.src || []).slice(0, 2).map((x) => u.esc(x)).join(' · ') + '</small></span>' +
        (d ? '<span class="cs-done" title="Done: ' + d.got + ' of ' + d.max + '">' + u.icon('check-c') + '</span>' : '') + '</button></li>';
    }).join('');
    const body = state[ch] === 'failed'
      ? ui.empty('book', 'Could not load', 'Check the connection and open this page again.', '')
      : !all.length
        ? '<div class="skel" style="height:8rem"></div>'
        : rows ? '<ul class="list">' + rows + '</ul>' : '<p class="muted">Nothing here yet.</p>';
    return (
      '<div class="page cs-list"><header class="page-h"><div><h1 class="h1">' + u.esc(c.name) + '</h1><p class="muted">Paper ' + PAPER[ch] + ' · ' + idx(ch).n + ' questions · ' + doneCount(ch) + ' done</p></div></header>' +
      ui.seg('cs-flt', FILTERS, flt.v) + body + '</div>'
    );
  }

  /* ---------- one question ---------- */
  function mcqHtml(q, d) {
    const locked = !!d;
    return '<div class="opts" role="radiogroup" aria-label="Options">' + q.options.map((o, k) => {
      const cls = locked ? (k === q.ans ? ' right' : d.pick === k ? ' wrong' : '') : '';
      return '<button class="opt rip' + cls + '" role="radio" aria-checked="' + (locked && d.pick === k) + '" data-act="cs-opt" data-v="' + k + '"' + (locked ? ' disabled' : '') + '><span class="let">' + 'ABCD'[k] + '</span><span class="ot">' + u.esc(o) + '</span></button>';
    }).join('') + '</div>' +
      (locked ? '<div class="tc-sol sol" data-testid="cs-why"><b class="small">' + (d.pick === q.ans ? 'Correct' : 'Not quite') + '</b><p>' + u.esc(q.why) + '</p></div>' : '');
  }
  function writtenHtml(q, d) {
    const dr = draft[q.id] || (draft[q.id] = { pts: q.model.map(() => false), shown: !!d });
    if (d && d.pts) d.pts.forEach((i) => (dr.pts[i] = true));
    if (!dr.shown) {
      return '<p class="muted small">Write your answer on paper first, like in the exam. Then open the model answer and mark yourself.</p>' +
        '<button class="btn primary block rip" data-act="cs-show" data-testid="cs-show">Show the model answer</button>';
    }
    const got = q.model.reduce((n, p, i) => n + (dr.pts[i] ? p.m : 0), 0);
    return (
      '<div class="tc-sol sol sol-long" data-testid="cs-model"><b class="small">Model answer. Tick what you wrote.</b><ul class="cs-pts">' +
      q.model.map((p, i) => '<li><label class="cs-pt"><input type="checkbox" data-act="cs-pt" data-i="' + i + '"' + (dr.pts[i] ? ' checked' : '') + '><span>' + u.esc(p.t) + ' <small class="muted">(' + p.m + (p.m === 1 ? ' mark' : ' marks') + ')</small></span></label></li>').join('') + '</ul>' +
      (q.code ? '<h4 class="sol-h">Model program</h4><pre class="cs-code" data-testid="cs-code">' + u.esc(q.code) + '</pre>' : '') +
      '<p class="cs-got"><b data-testid="cs-got">' + got + ' of ' + q.marks + '</b> marks</p>' +
      '<button class="btn primary block rip" data-act="cs-save-marks" data-testid="cs-savem">' + (d ? 'Update my marks' : 'Save my marks') + '</button></div>'
    );
  }
  function questionHtml(ch, n, pid) {
    const all = items(ch);
    const from = pid ? papers().filter((x) => x.id === pid)[0] : null;
    const q = all[n - 1];
    if (!q) return '<div class="page">' + ui.empty('book', 'Question not found', 'It may have moved. Go back to the chapter.', '<button class="btn tonal rip" data-act="go" data-to="#/csboard/' + ch + '">Back to the list</button>') + '</div>';
    const d = done()[q.id];
    const sv = saved().indexOf(q.id) >= 0;
    return (
      '<div class="page tc-exam cs-q" data-id="' + u.esc(q.id) + '"><p class="small muted">' + (from ? u.esc(from.title) + ' · ' : '') + u.esc(D.CH[ch].name) + ' · question ' + n + ' of ' + all.length + '</p>' +
      '<p class="cs-meta">' + marksChip(q) + ' ' + srcChips(q) + '</p>' +
      '<p class="tc-stem cs-stem" data-testid="cs-stem">' + u.esc(q.q).replace(/\n/g, '<br>') + '</p>' +
      (q.kind === 'mcq' ? mcqHtml(q, d) : writtenHtml(q, d)) +
      '<div class="tc-acts"><button class="chip rip" data-act="cs-save" data-id="' + u.esc(q.id) + '" aria-pressed="' + sv + '" data-testid="cs-flag">' + u.icon(sv ? 'star-f' : 'star', 's') + (sv ? 'Saved' : 'Save to revisit') + '</button></div>' +
      '<div class="row gap"><button class="btn tonal grow rip" data-act="go" data-to="#/csboard/' + ch + '/' + (n - 1) + (pid ? '?p=' + pid : '') + '"' + (n > 1 ? '' : ' disabled') + '>' + u.icon('chev-l') + 'Previous</button>' +
      '<button class="btn tonal grow rip" data-act="go" data-to="#/csboard/' + ch + '/' + (n + 1) + (pid ? '?p=' + pid : '') + '"' + (n < all.length ? '' : ' disabled') + '>Next' + u.icon('chev-r') + '</button></div></div>'
    );
  }

  S.views.csboard = {
    title: 'HSC CS',
    tab: 'practice',
    isPushed: (ctx) => !!ctx.params[0],
    pageTitle: (ctx) => (ctx.params[0] === 'papers' ? 'Board papers' : D.CH[ctx.params[0]] ? D.CH[ctx.params[0]].name : 'HSC Computer Science'),
    pageKicker: (ctx) => (D.CH[ctx.params[0]] ? 'HSC COMPUTER SCIENCE · PAPER ' + PAPER[ctx.params[0]] : ''),
    backHash: (cur) => (cur && cur.query && cur.query.p ? '#/csboard/papers/' + cur.query.p : cur && cur.params && cur.params[0] === 'papers' ? (cur.params[1] ? '#/csboard/papers' : '#/csboard') : cur && cur.params && cur.params[1] ? '#/csboard/' + cur.params[0] : '#/csboard'),
    render(root, ctx) {
      const ch = ctx.params[0];
      if (!ch) {
        root.innerHTML = indexHtml();
        return;
      }
      if (ch === 'papers') {
        root.innerHTML = ctx.params[1] ? paperHtml(ctx.params[1]) : papersHtml();
        return;
      }
      if (!D.CH[ch] || D.CH[ch].subj !== 'cs') {
        root.innerHTML = '<div class="page">' + ui.empty('book', 'Chapter not found', 'This is not a Computer Science chapter.', '<button class="btn tonal rip" data-act="go" data-to="#/csboard">All chapters</button>') + '</div>';
        return;
      }
      ensure(ch);
      const n = Number(ctx.params[1]);
      root.innerHTML = n ? (items(ch).length ? questionHtml(ch, n, ctx.query && ctx.query.p) : '<div class="page"><div class="skel" style="height:10rem"></div></div>') : listHtml(ch);
    },
  };

  /* ---------- actions ---------- */
  const here = () => {
    const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
    return { ch: p[1], n: Number(p[2]) };
  };
  const curQ = () => {
    const h = here();
    return items(h.ch)[h.n - 1];
  };
  const record = (q, rec) => store.mutate('cs', (c) => { c.done[q.id] = Object.assign({ at: u.today(), max: q.marks }, rec); });

  ui.actions['cs-flt'] = (el) => { flt.v = el.dataset.v; S.app.refresh(true); };
  ui.actions['cs-opt'] = (el) => {
    const q = curQ();
    if (!q || done()[q.id]) return;
    const k = Number(el.dataset.v);
    record(q, { got: k === q.ans ? 1 : 0, pick: k });
    S.app.refresh(true);
  };
  ui.actions['cs-show'] = () => {
    const q = curQ();
    if (!q) return;
    (draft[q.id] = draft[q.id] || { pts: q.model.map(() => false) }).shown = true;
    S.app.refresh(true);
  };
  ui.actions['cs-pt'] = (el) => {
    const q = curQ();
    if (!q || !draft[q.id]) return;
    draft[q.id].pts[Number(el.dataset.i)] = !!el.checked;
    S.app.refresh(true);
  };
  ui.actions['cs-save-marks'] = () => {
    const q = curQ();
    const dr = q && draft[q.id];
    if (!q || !dr) return;
    const pts = dr.pts.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    record(q, { got: pts.reduce((n, i) => n + q.model[i].m, 0), pts: pts });
    ui.toast('Saved: ' + done()[q.id].got + ' of ' + q.marks + ' marks');
    S.app.refresh(true);
  };
  ui.actions['cs-save'] = (el) => {
    const id = el.dataset.id;
    store.mutate('cs', (c) => {
      const i = c.saved.indexOf(id);
      if (i >= 0) c.saved.splice(i, 1);
      else c.saved.push(id);
    });
    S.app.refresh(true);
  };

  S.csboard = { chapters: chapters, doneCount: doneCount };
})((window.SOS = window.SOS || {}));

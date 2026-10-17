/* views/subjects.js — Subjects overview, per-subject chapter lists, chapter sheet, PYQ tracker. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const ui = S.ui;
  const store = S.store;
  const CH = S.charts;
  S.views = S.views || {};

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Mathematics', cs: 'Computer Science' };
  const view = { std: 12, filter: 'all', hy: false, sort: 'order', pyqSubj: 'all', sheetCh: '', cls: 'all', exam: 'all' };
  const PRI = ['', 'Low', 'Med', 'High'];
  const JEE_NOTE = { partial: 'Only part of this chapter is in the JEE Main syllabus.', verify: 'Recheck this chapter against the current NTA syllabus — the source was unclear.' };

  function examBadges(c) {
    let out = '';
    if (c.board) out += '<span class="chip-s ok">Board</span>';
    if (c.cet) out += '<span class="chip-s ok">CET</span>';
    if (c.jee === 'yes') out += '<span class="chip-s ok">JEE</span>';
    else if (c.jee === 'partial' || c.jee === 'verify') out += '<span class="chip-s warn" title="' + u.esc(JEE_NOTE[c.jee]) + '">JEE*</span>';
    return out;
  }

  function stLabel(id) {
    return D.STATUS.filter((s) => s.id === id)[0].label;
  }
  function dots(n, max) {
    let s = '<span class="diff" aria-label="Difficulty ' + n + ' of ' + max + '">';
    for (let i = 1; i <= max; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return s + '</span>';
  }

  /* ---------- overview ---------- */
  const ICON = { phy: 'atom', chem: 'flask', mth: 'sigma', cs: 'code' };
  const chapterStatus = (id) => (store.get('chapters')[id] && store.get('chapters')[id].s) || 'todo';
  const doneIn = (list) => list.filter((c) => chapterStatus(c.id) === 'done' || chapterStatus(c.id) === 'mastered').length;
  const chaptersOf = (s, std) => D.BY_SUBJECT[s].filter((c) => c.std === std);
  const bar = (r) => '<span class="sj-bar" aria-hidden="true"><i style="width:' + Math.round(Math.max(0, Math.min(1, r)) * 100) + '%"></i></span>';

  // The class (11 or 12) the lists show. It comes from ?c= and is remembered for the session.
  function pickStd(ctx) {
    const c = Number((ctx.query || {}).c);
    if (c === 11 || c === 12) view.std = c;
    return view.std;
  }

  /* ---------- level 1: the four subjects ---------- */
  function overview(std) {
    const all = D.CHAPTERS.filter((c) => c.std === std && !D.COMING_SOON[c.subj]);
    const done = doneIn(all);
    const cards = D.SUBJECT_ORDER.map((s) => {
      if (D.COMING_SOON[s]) {
        return (
          '<div class="sj-card is-soon" data-s="' + s + '" aria-disabled="true" data-testid="subj-' + s + '"><span class="sj-ic">' + u.icon(ICON[s]) + '</span><b>' + NAMES[s] + '</b>' +
          '<small>Coming soon</small></div>'
        );
      }
      const list = chaptersOf(s, std);
      const only12 = !list.length;
      const to = '#/subjects/' + s + '?c=' + (only12 ? 12 : std);
      return (
        '<button class="sj-card rip" data-s="' + s + '" data-act="go" data-to="' + to + '" data-testid="subj-' + s + '">' +
        '<span class="sj-ic">' + u.icon(ICON[s]) + '</span><b>' + NAMES[s] + '</b>' +
        (only12 ? '<small>Class 12 only</small>' + bar(0) : '<small>' + doneIn(list) + ' of ' + list.length + ' chapters done</small>' + bar(doneIn(list) / list.length)) + '</button>'
      );
    }).join('');
    const sw = [11, 12].map((n) => '<button class="sj-pill rip" aria-pressed="' + (std === n) + '" data-act="go" data-to="#/subjects?c=' + n + '" data-testid="std-' + n + '">Class ' + n + '</button>').join('');
    return (
      '<div class="page subjects"><header class="page-h"><div><h1 class="h1">Subjects</h1><p class="muted">' + done + ' of ' + all.length + ' chapters done in Class ' + std + '</p></div></header>' +
      '<div class="sj-switch" role="group" aria-label="Class">' + sw + '</div>' +
      '<div class="sj-grid">' + cards + '</div></div>'
    );
  }

  /* ---------- level 2: the chapters of one subject ---------- */
  // The chapter she is part-way through comes first (the most recently watched one first), then the book order.
  function chapterOrder(list) {
    const L = S.learn;
    const now = (c) => {
      const vids = L.videos(c.id);
      const started = vids.filter((v) => L.progress(v.id));
      if (!started.length || started.every((v) => L.isWatched(v.id)) && started.length === vids.length) return 0;
      return Math.max.apply(null, started.map((v) => (L.progress(v.id) || {}).at || 1));
    };
    return list.map((c) => ({ c: c, at: now(c) })).sort((a, b) => (b.at ? 1 : 0) - (a.at ? 1 : 0) || b.at - a.at || a.c.idx - b.c.idx);
  }

  function detail(s, std) {
    if (D.COMING_SOON[s]) {
      return (
        '<div class="page subj-detail" data-s="' + s + '"><section class="sj-band"><p class="sj-k">Class 12</p><h1 class="sj-t">' + NAMES[s] + '</h1><p class="sj-s">Coming soon</p></section>' +
        '<section class="card" data-testid="subj-soon"><p>' + NAMES[s] + ' is coming soon. Until then, study it from your textbook.</p></section></div>'
      );
    }
    const L = S.learn;
    let list = chaptersOf(s, std);
    if (!list.length) {
      std = std === 11 ? 12 : 11;
      list = chaptersOf(s, std);
    }
    const done = doneIn(list);
    const both = chaptersOf(s, 11).length && chaptersOf(s, 12).length;
    const sw = both
      ? '<div class="sj-switch on-band" role="group" aria-label="Class">' + [11, 12].map((n) => '<button class="sj-pill rip" aria-pressed="' + (std === n) + '" data-act="go" data-to="#/subjects/' + s + '?c=' + n + '">Class ' + n + '</button>').join('') + '</div>'
      : '';
    const rows = chapterOrder(list).map((x, i) => {
      const c = x.c;
      const wc = L.watchedCount(c.id);
      const sub = wc.total ? wc.watched + ' of ' + wc.total + ' lectures' : 'Videos coming';
      const pct = wc.total ? wc.watched / wc.total : 0;
      const now = x.at && i === 0;
      return (
        '<li class="cr' + (now ? ' is-now' : '') + '" data-s="' + s + '"><button class="cr-main rip" data-act="go" data-to="#/watch/' + c.id + '" data-id="' + c.id + '" data-testid="cr-open">' +
        '<span class="cr-n">' + (c.tb || c.idx + 1) + '</span><span class="cr-b"><b>' + u.esc(c.name) + '</b><small>' + sub +
        (c.hy ? ' <span class="cr-hy">High weightage</span>' : '') + '</small>' + (wc.total ? bar(pct) : '') + '</span></button>' +
        '<button class="cr-play rip" data-act="go" data-to="#/watch/' + c.id + '" aria-label="' + (wc.total ? 'Watch ' : 'Open ') + u.esc(c.name) + '">' + u.icon('play') + '</button></li>'
      );
    }).join('');
    return (
      '<div class="page subj-detail" data-s="' + s + '"><section class="sj-band"><p class="sj-k">Class ' + std + '</p><h1 class="sj-t">' + NAMES[s] + '</h1>' +
      '<p class="sj-s">' + done + ' of ' + list.length + ' chapters done</p><span class="sj-bar on-band" aria-hidden="true"><i style="width:' + Math.round((done / list.length) * 100) + '%"></i></span>' + sw + '</section>' +
      '<ul class="cr-list">' + rows + '</ul>' +
      '<p class="muted small note-line">Tap a chapter to watch its lectures. Weightage is a planning estimate from typical CET and JEE papers.</p></div>'
    );
  }

  S.views.subjects = {
    title: 'Subjects',
    tab: 'subjects',
    render(root, ctx) {
      const s = ctx.params[0];
      const std = pickStd(ctx);
      if (s && D.SUBJECTS[s]) {
        root.innerHTML = detail(s, std);
        if (ctx.first && ctx.query.open) setTimeout(() => openChapter(ctx.query.open), 60);
      } else root.innerHTML = overview(std);
    },
    pageTitle(ctx) {
      const s = ctx.params[0];
      return s && D.SUBJECTS[s] ? NAMES[s] : 'Subjects';
    },
    isPushed: (ctx) => !!(ctx.params[0] && D.SUBJECTS[ctx.params[0]]),
  };

  /* ---------- chapter sheet ---------- */

  // "Study material": generated concept notes (SOS.RESOURCES[id].notes, read-only, drafted by
  // tools/gen-resources.js) and outbound YouTube search links. Deliberately separate from
  // the chapter record's `note` field, which is her own editable "Your notes" textarea.
  function learnHtml(id) {
    const res = S.RESOURCES && S.RESOURCES[id];
    if (!res) return '';
    const cn = res.notes;
    const concept = cn
      ? '<div class="learn-block"><div class="row gap"><h4 class="h4">Concept notes</h4>' +
        (cn.reviewed ? '' : '<span class="chip-s warn" data-draft="1">Draft — not checked yet</span>') + '</div>' +
        '<ul class="learn-notes">' + cn.bullets.map((b) => '<li>' + u.esc(b) + '</li>').join('') + '</ul></div>'
      : '';
    const watch = res.links.length
      ? '<div class="learn-block"><h4 class="h4">Watch</h4><div class="chips">' +
        res.links.map((l) => '<a class="chip sm" href="' + u.esc(l.url) + '" target="_blank" rel="noopener noreferrer" aria-label="Search YouTube: ' + u.esc(l.label) + ' (opens in a new tab)">' + u.esc(l.label) + '</a>').join('') +
        '</div></div>'
      : '';
    if (!concept && !watch) return '';
    return '<div class="sec learn"><h3 class="h4">Study material</h3>' + concept + watch + '</div>';
  }

  // Test Center entry for one chapter: starts the standard chapter test for THAT chapter.
  function timedTestHtml(id) {
    const TC = S.tc;
    const bank = TC ? TC.bankCount(id) : 0;
    if (!bank) return '<p class="small muted center" data-testid="no-qs">No questions yet</p>';
    return (
      '<div class="sec"><div class="row gap"><button class="btn tonal grow rip" data-act="ch-test" data-id="' + id + '" data-testid="ch-test">' + u.icon('timer') + 'Timed test (' + u.plural(TC.chapterTestLength(id), 'question') + ')</button>' +
      '<button class="btn tonal grow rip" data-act="ch-practice" data-id="' + id + '" data-testid="ch-practice">' + u.icon('target') + 'Practice this chapter (' + (S.QUESTIONS || []).filter((q) => q.ch === id && q.type === 'mcq').length + ')</button></div>' +
      '<p class="small muted center">' + bank + ' in the bank for this chapter · timed is 1.5 min each, practice has no timer</p></div>'
    );
  }

  function chapterHtml(id) {
    const c = D.CH[id];
    const x = E.chap(id);
    const bm = !!store.get('bookmarks').chapters[id];
    const pyqT = E.pyqTarget(id);
    const acc = x.pyq > 0 ? Math.round((x.pyqOk / x.pyq) * 100) : null;
    const deps = c.deps.map((d) => '<span class="chip-s ' + (E.chap(d).s === 'todo' || E.chap(d).s === 'learning' ? 'warn' : 'ok') + '">' + u.esc(D.CH[d].name) + '</span>').join('');
    const srs = x.srs
      ? '<div class="srs">' + x.srs.a.map((a, i) => '<span class="srs-c' + (x.srs.d[i] ? ' done' : a <= u.today() ? ' due' : '') + '" title="Revision ' + (i + 1) + '">' + (x.srs.d[i] ? '✓ ' : '') + u.esc(u.dateShort(a)) + '</span>').join('') + '</div>' +
        (x.srs.d.indexOf(false) >= 0 ? '<button class="btn tonal sm rip" data-act="ch-rev" data-id="' + id + '">Mark revision ' + (x.srs.d.indexOf(false) + 1) + ' done</button>' : '<p class="small muted">All 5 revisions done.</p>')
      : '<p class="small muted">Mark this chapter Done to start its revision schedule (1, 3, 7, 15 and 30 days).</p>';
    return (
      '<div class="ch-sheet" data-s="' + c.subj + '">' +
      '<p class="small muted">Class ' + c.std + 'th' + (c.tb ? ' · Textbook chapter ' + c.tb : '') + (c.part ? ' · Part ' + c.part : '') + (c.paper ? ' · Paper ' + c.paper : '') + '</p>' +
      '<p class="chips-s">' + examBadges(c) + '</p>' +
      ui.seg('ch-status', D.STATUS.map((s) => ({ v: s.id, t: s.label })), x.s, ' data-id="' + id + '"') +
      '<dl class="facts">' +
      '<div><dt>Weightage (estimate)</dt><dd>~' + c.w + '%</dd></div>' +
      '<div><dt>CET priority (estimate)</dt><dd>' + (c.cetPri ? D.PRIORITY[c.cetPri] : '—') + '</dd></div>' +
      '<div><dt>JEE priority (estimate)</dt><dd>' + (c.jeePri ? D.PRIORITY[c.jeePri] : '—') + '</dd></div>' +
      '<div><dt>Difficulty (estimate)</dt><dd>' + dots(c.diff, 4) + '</dd></div>' +
      '<div><dt>Estimated hours</dt><dd>' + c.hours + ' h' + (c.estDefault ? ' (default estimate — no old data)' : '') + '</dd></div>' +
      '<div><dt>Revisions</dt><dd>' + x.rev + '</dd></div></dl>' +
      '<button class="btn tonal block rip" data-act="ch-learn" data-id="' + id + '" data-testid="ch-learn">' + u.icon('play') + 'Open lesson: videos, summary, checkpoint</button>' +
      timedTestHtml(id) +
      learnHtml(id) +
      (deps ? '<div class="sec"><h3 class="h4">Learn these first</h3><div class="chips-s">' + deps + '</div></div>' : '') +
      '<div class="sec"><h3 class="h4">Revision schedule</h3>' + srs + '</div>' +
      '<div class="sec"><h3 class="h4">MCQs done: ' + x.mcq + '</h3><div class="chips"><button class="chip rip" data-act="ch-q" data-id="' + id + '" data-k="mcq" data-n="10">+10</button><button class="chip rip" data-act="ch-q" data-id="' + id + '" data-k="mcq" data-n="25">+25</button><button class="chip rip" data-act="ch-q" data-id="' + id + '" data-k="mcq" data-n="50">+50</button><button class="chip rip" data-act="ch-q" data-id="' + id + '" data-k="mcq" data-n="-10">−10</button></div></div>' +
      '<div class="sec"><h3 class="h4">PYQs: ' + x.pyq + ' of ' + pyqT + ' solved' + (acc != null ? ' · ' + acc + '% accuracy' : '') + '</h3>' + CH.bar(x.pyq / pyqT, 'var(--sc)') +
      '<div class="row gap end" style="margin-top:10px"><label class="field grow"><span class="field-l">Solved</span><input type="number" inputmode="numeric" min="0" id="pyq-n" placeholder="10"></label>' +
      '<label class="field grow"><span class="field-l">Correct</span><input type="number" inputmode="numeric" min="0" id="pyq-ok" placeholder="8"></label>' +
      '<button class="btn tonal rip" data-act="ch-pyq" data-id="' + id + '">Add</button></div>' +
      '<div class="row gap"><label class="field grow"><span class="field-l">Target</span><input type="number" inputmode="numeric" min="1" value="' + pyqT + '" data-change="ch-pyqt" data-id="' + id + '"></label>' +
      '<label class="field grow"><span class="field-l">Source</span><input type="text" maxlength="60" value="' + u.esc(x.pyqSrc) + '" placeholder="e.g. CET PYQ book 2019–24" data-change="ch-src" data-id="' + id + '"></label></div></div>' +
      '<label class="field"><span class="field-l">Your notes</span><textarea rows="3" placeholder="Tricks, traps, formulas to remember" data-change="ch-note" data-id="' + id + '">' + u.esc(x.note) + '</textarea></label>' +
      '<div class="row gap"><button class="btn tonal grow rip" data-act="ch-bm" data-id="' + id + '">' + u.icon(bm ? 'star-f' : 'star') + (bm ? 'Saved' : 'Save chapter') + '</button>' +
      '<button class="btn tonal grow rip" data-act="ch-formulas" data-id="' + id + '">' + u.icon('sigma') + 'Formulas</button></div>' +
      '<button class="btn primary block rip" data-act="continue" data-ch="' + id + '" data-close="1">' + u.icon('play') + 'Study this chapter</button></div>'
    );
  }
  function openChapter(id) {
    if (!D.CH[id]) return;
    view.sheetCh = id;
    ui.sheet.open({ title: D.CH[id].name, html: chapterHtml(id), tall: true, onClose: () => (view.sheetCh = '') });
  }
  function refreshSheet() {
    if (view.sheetCh && ui.sheet.isOpen()) ui.sheet.update({ html: chapterHtml(view.sheetCh) });
  }
  S.subjectsUI = { openChapter: openChapter, refreshSheet: refreshSheet };

  ui.actions['ch-open'] = (el) => openChapter(el.dataset.id);
  // Learn hub lesson page for THIS chapter.
  ui.actions['ch-learn'] = (el) => {
    const go = () => S.app.go('#/learn/' + el.dataset.id);
    if (ui.sheet.isOpen()) {
      ui.sheet.close();
      setTimeout(go, 80);
    } else go();
  };
  // Untimed practice for THIS chapter (the count on the button is its MCQs, which is what Practice draws by default).
  ui.actions['ch-practice'] = (el) => {
    const id = el.dataset.id;
    const go = () => S.practiceUI.start(id);
    if (ui.sheet.isOpen()) {
      ui.sheet.close();
      setTimeout(go, 80);
    } else go();
  };
  ui.actions['ch-test'] = (el) => {
    const id = el.dataset.id;
    const go = () => S.tcUI.startChapterTest(id);
    if (ui.sheet.isOpen()) {
      ui.sheet.close();
      setTimeout(go, 80);
    } else go();
  };
  ui.actions['ch-cycle'] = (el) => {
    const order = ['todo', 'learning', 'done', 'mastered'];
    const cur = E.chap(el.dataset.id).s;
    E.setStatus(el.dataset.id, order[(order.indexOf(cur) + 1) % order.length]);
    u.haptic();
  };
  ui.actions['ch-status'] = (el) => {
    E.setStatus(el.parentNode.dataset.id, el.dataset.v);
    u.haptic();
    refreshSheet();
  };
  ui.actions['ch-q'] = (el) => {
    E.addQuestions(el.dataset.id, Number(el.dataset.n), el.dataset.k);
    u.haptic();
    refreshSheet();
  };
  ui.actions['ch-pyq'] = (el) => {
    const n = Math.floor(u.num(u.$('#pyq-n').value, 0));
    const ok = Math.floor(u.num(u.$('#pyq-ok').value, 0));
    if (n <= 0) return ui.toast('Enter how many PYQs you solved.');
    if (ok < 0 || ok > n) return ui.toast('Correct answers cannot be more than solved.');
    const id = el.dataset.id;
    E.mutChap(id, (x) => (x.pyqOk += ok));
    E.addQuestions(id, n, 'pyq');
    u.haptic('ok');
    refreshSheet();
  };
  ui.actions['ch-rev'] = (el) => {
    const x = E.chap(el.dataset.id);
    E.reviseChapter(el.dataset.id, x.srs.d.indexOf(false));
    u.haptic('ok');
    refreshSheet();
  };
  ui.actions['ch-bm'] = (el) => {
    store.mutate('bookmarks', (b) => {
      if (b.chapters[el.dataset.id]) delete b.chapters[el.dataset.id];
      else b.chapters[el.dataset.id] = 1;
    });
    refreshSheet();
  };
  ui.actions['ch-formulas'] = (el) => {
    ui.sheet.close();
    setTimeout(() => S.app.go('#/formulas?ch=' + el.dataset.id), 30);
  };
  ui.changes['ch-note'] = (el) => E.mutChap(el.dataset.id, (x) => (x.note = el.value.slice(0, 3000)));
  ui.changes['ch-src'] = (el) => E.mutChap(el.dataset.id, (x) => (x.pyqSrc = el.value.slice(0, 60)));
  ui.changes['ch-pyqt'] = (el) => {
    E.mutChap(el.dataset.id, (x) => (x.pyqT = u.clamp(Math.round(u.num(el.value, 0)), 1, 500)));
    refreshSheet();
  };
  ui.actions['sj-filter'] = (el) => {
    view.filter = el.dataset.v;
    S.app.refresh(true);
  };
  ui.actions['sj-class'] = (el) => {
    view.cls = el.dataset.v;
    S.app.refresh(true);
  };
  ui.actions['sj-exam'] = (el) => {
    view.exam = el.dataset.v;
    S.app.refresh(true);
  };
  ui.actions['sj-hy'] = () => {
    view.hy = !view.hy;
    S.app.refresh(true);
  };
  ui.actions['sj-sort'] = () => {
    view.sort = view.sort === 'order' ? 'priority' : 'order';
    S.app.refresh(true);
  };
  // Keep the open sheet in step with store changes made elsewhere (e.g. undo).
  store.on(() => {});

  /* ---------- PYQ tracker (#/pyq-tracker; #/pyq is the past-paper library, views-pyq.js) ---------- */
  S.views['pyq-tracker'] = {
    title: 'PYQ tracker',
    tab: 'subjects',
    pushed: true,
    render(root) {
      let list = D.CHAPTERS.filter((c) => c.subj !== 'cs' || view.pyqSubj === 'cs' || view.pyqSubj === 'all');
      if (view.pyqSubj !== 'all') list = list.filter((c) => c.subj === view.pyqSubj);
      let solved = 0;
      let ok = 0;
      let target = 0;
      const rows = list
        .map((c) => {
          const x = E.chap(c.id);
          const t = E.pyqTarget(c.id);
          solved += x.pyq;
          ok += x.pyqOk;
          target += t;
          return { c: c, x: x, t: t, rem: Math.max(0, t - x.pyq) };
        })
        .sort((a, b) => b.rem * b.c.w - a.rem * a.c.w);
      const acc = solved ? Math.round((ok / solved) * 100) : null;
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">PYQ tracker</h1><p class="muted">' + solved + ' solved · ' + Math.max(0, target - solved) + ' remaining' + (acc != null ? ' · ' + acc + '% accuracy' : '') + '</p></div></header>' +
        ui.seg('pyq-subj', [{ v: 'all', t: 'All' }, { v: 'phy', t: 'Physics' }, { v: 'chem', t: 'Chem' }, { v: 'mth', t: 'Maths' }, { v: 'cs', t: 'CS' }], view.pyqSubj) +
        '<ul class="pyq">' +
        rows.map((r) => {
          const a = r.x.pyq ? Math.round((r.x.pyqOk / r.x.pyq) * 100) : null;
          return (
            '<li data-s="' + r.c.subj + '"><button class="pyq-r rip" data-act="ch-open" data-id="' + r.c.id + '"><span class="pyq-h"><b>' + u.esc(r.c.name) + '</b><small>' + r.x.pyq + ' / ' + r.t + (a != null ? ' · ' + a + '%' : '') + '</small></span>' +
            CH.bar(r.x.pyq / r.t, 'var(--sc)') + (r.x.pyqSrc ? '<small class="muted">' + u.esc(r.x.pyqSrc) + '</small>' : '') + '</button></li>'
          );
        }).join('') + '</ul>' +
        '<p class="muted small note-line">Sorted by what is left to solve, weighted by chapter weightage. Tap a chapter to log PYQs.</p></div>';
    },
  };
  ui.actions['pyq-subj'] = (el) => {
    view.pyqSubj = el.dataset.v;
    S.app.refresh(true);
  };
})((window.SOS = window.SOS || {}));

/* views/cards.js — Flashcards. Study mode (flip + Leitner boxes) and Quiz mode (multiple choice). */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const ui = S.ui;
  const store = S.store;
  S.views = S.views || {};

  const BOX_DAYS = [1, 2, 4, 8, 16]; // days until a card returns, by box 1..5
  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths', cs: 'CS' };
  const fc = { subj: 'all', filter: 'all', mode: 'study', queue: null, idx: 0, flipped: false, quiz: null, score: { ok: 0, n: 0 } };

  function allCards() {
    const cards = [];
    // Core deck: concept cards + high-yield formulas. The full list lives in the Formula vault (Revision mode).
    S.FORMULAS.filter((f) => f.hy).forEach((f) => cards.push({ id: 'f:' + f.id, subj: f.subj, q: f.name, a: f.f, ctx: D.CH[f.ch].name }));
    S.CONCEPT_CARDS.forEach((c) => cards.push({ id: c.id, subj: c.subj, q: c.q, a: c.a, ctx: c.ch && D.CH[c.ch] ? D.CH[c.ch].name : '' }));
    store.get('flashcards').custom.forEach((c) => cards.push({ id: c.id, subj: c.subj, q: c.q, a: c.a, ctx: 'Your card', custom: true }));
    return cards;
  }
  function pool() {
    const t = u.today();
    const f = store.get('flashcards');
    return allCards().filter((c) => {
      if (fc.subj !== 'all' && c.subj !== fc.subj) return false;
      if (fc.filter === 'fav') return !!store.get('bookmarks').cards[c.id];
      if (fc.filter === 'due') return !f.prog[c.id] || f.prog[c.id].due <= t;
      return true;
    });
  }
  function build(shuffle) {
    const f = store.get('flashcards');
    const t = u.today();
    let list = pool();
    // Due and new cards first, then the rest.
    const rank = (c) => (!f.prog[c.id] ? 1 : f.prog[c.id].due <= t ? 0 : 2);
    list = shuffle ? u.shuffle(list) : list.slice().sort((a, b) => rank(a) - rank(b));
    fc.queue = list.map((c) => c.id);
    fc.idx = 0;
    fc.flipped = false;
    fc.quiz = null;
  }
  const byId = (id) => allCards().filter((c) => c.id === id)[0];

  function studyHtml() {
    const f = store.get('flashcards');
    if (!fc.queue) build(false);
    if (!fc.queue.length)
      return ui.empty('cards', fc.filter === 'fav' ? 'No favourite cards' : fc.filter === 'due' ? 'Nothing due' : 'No cards here', fc.filter === 'due' ? 'Every card in this deck is scheduled for later. Come back tomorrow.' : 'Try a different deck.');
    if (fc.idx >= fc.queue.length)
      return '<div class="card center"><h2 class="h2">Deck complete</h2><p class="muted">You went through ' + fc.queue.length + ' cards.</p><div class="row gap" style="margin-top:14px"><button class="btn tonal grow rip" data-act="fc-restart">Again</button><button class="btn primary grow rip" data-act="fc-shuffle">Shuffle</button></div></div>';
    const c = byId(fc.queue[fc.idx]);
    if (!c) { fc.idx++; return studyHtml(); }
    const fav = !!store.get('bookmarks').cards[c.id];
    return (
      '<div class="fc-meta"><span class="small muted">Card ' + (fc.idx + 1) + ' of ' + fc.queue.length + '</span>' + S.charts.bar(fc.idx / fc.queue.length) + '</div>' +
      '<div class="flip' + (fc.flipped ? ' is-flipped' : '') + '" data-s="' + c.subj + '" role="button" tabindex="0" data-act="fc-flip" aria-label="Flashcard. Tap to flip." aria-live="polite">' +
      '<div class="flip-in"><div class="flip-f"><small>' + NAMES[c.subj] + (c.ctx ? ' · ' + u.esc(c.ctx) : '') + '</small><p class="flip-q">' + u.esc(c.q) + '</p><small class="muted">Tap to flip</small></div>' +
      '<div class="flip-b"><small>Answer</small><p class="flip-a">' + u.esc(c.a) + '</p></div></div></div>' +
      '<div class="row gap fc-actions"><button class="icon-btn rip" aria-label="' + (fav ? 'Remove favourite' : 'Favourite') + '" aria-pressed="' + fav + '" data-act="fc-fav" data-id="' + c.id + '">' + u.icon(fav ? 'star-f' : 'star') + '</button>' +
      '<button class="btn tonal grow rip" data-act="fc-grade" data-ok="0">Again</button><button class="btn primary grow rip" data-act="fc-grade" data-ok="1">Got it</button></div>'
    );
  }

  function newQuiz() {
    const cands = pool().filter((c) => c.a.length <= 80 && c.a.indexOf('\n') < 0);
    if (cands.length < 4) return null;
    const c = cands[Math.floor(Math.random() * cands.length)];
    const others = u.shuffle(cands.filter((x) => x.id !== c.id && x.a !== c.a && x.subj === c.subj));
    const wrong = others.slice(0, 3);
    if (wrong.length < 3) u.shuffle(cands.filter((x) => x.id !== c.id && x.a !== c.a && wrong.indexOf(x) < 0)).slice(0, 3 - wrong.length).forEach((x) => wrong.push(x));
    return { card: c, options: u.shuffle([c.a].concat(wrong.map((x) => x.a))), picked: null };
  }
  function quizHtml() {
    if (!fc.quiz) fc.quiz = newQuiz();
    const q = fc.quiz;
    if (!q) return ui.empty('cards', 'Not enough cards', 'Quiz needs at least four short-answer cards in this deck. Pick All subjects.');
    return (
      '<div class="fc-meta"><span class="small muted">Score ' + fc.score.ok + ' / ' + fc.score.n + '</span></div>' +
      '<div class="card quiz" data-s="' + q.card.subj + '"><small class="muted">' + NAMES[q.card.subj] + (q.card.ctx ? ' · ' + u.esc(q.card.ctx) : '') + '</small><p class="flip-q">' + u.esc(q.card.q) + '</p><div class="opts">' +
      q.options.map((o, i) => {
        let cls = '';
        if (q.picked != null) cls = o === q.card.a ? ' right' : i === q.picked ? ' wrong' : '';
        return '<button class="opt rip' + cls + '" data-act="fc-pick" data-i="' + i + '"' + (q.picked != null ? ' disabled' : '') + '>' + u.esc(o) + '</button>';
      }).join('') + '</div>' +
      (q.picked != null ? '<button class="btn primary block rip" data-act="fc-next" style="margin-top:12px">Next question</button>' : '') + '</div>'
    );
  }

  S.views.flashcards = {
    title: 'Flashcards',
    tab: 'subjects',
    pushed: true,
    render(root) {
      const f = store.get('flashcards');
      const all = allCards();
      const mastered = all.filter((c) => f.prog[c.id] && f.prog[c.id].box >= 4).length;
      const t = u.today();
      const dueN = all.filter((c) => !f.prog[c.id] || f.prog[c.id].due <= t).length;
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">Flashcards</h1><p class="muted">' + all.length + ' cards · ' + mastered + ' mastered · ' + dueN + ' due</p></div>' +
        '<button class="btn tonal sm rip" data-act="fc-add">' + u.icon('plus') + 'Add</button></header>' +
        ui.seg('fc-mode', [{ v: 'study', t: 'Study' }, { v: 'quiz', t: 'Quiz' }], fc.mode) +
        ui.seg('fc-subj', [{ v: 'all', t: 'All' }, { v: 'phy', t: 'Physics' }, { v: 'chem', t: 'Chem' }, { v: 'mth', t: 'Maths' }, { v: 'cs', t: 'CS' }], fc.subj) +
        '<div class="chips"><button class="chip rip" aria-pressed="' + (fc.filter === 'due') + '" data-act="fc-filter" data-v="due">Due</button>' +
        '<button class="chip rip" aria-pressed="' + (fc.filter === 'fav') + '" data-act="fc-filter" data-v="fav">' + u.icon('star') + 'Favourites</button>' +
        '<button class="chip rip" data-act="fc-shuffle">' + u.icon('shuffle') + 'Shuffle</button></div>' +
        '<div class="fc-stage">' + (fc.mode === 'study' ? studyHtml() : quizHtml()) + '</div></div>';
    },
  };

  const reset = () => { fc.queue = null; fc.quiz = null; fc.idx = 0; fc.flipped = false; };
  ui.actions['fc-mode'] = (el) => { fc.mode = el.dataset.v; reset(); S.app.refresh(true); };
  ui.actions['fc-subj'] = (el) => { fc.subj = el.dataset.v; reset(); S.app.refresh(true); };
  ui.actions['fc-filter'] = (el) => { fc.filter = fc.filter === el.dataset.v ? 'all' : el.dataset.v; reset(); S.app.refresh(true); };
  ui.actions['fc-shuffle'] = () => { if (fc.mode === 'study') build(true); else fc.quiz = null; S.app.refresh(true); };
  ui.actions['fc-restart'] = () => { build(false); S.app.refresh(true); };
  ui.actions['fc-flip'] = (el) => {
    fc.flipped = !fc.flipped;
    el.classList.toggle('is-flipped', fc.flipped);
  };
  ui.actions['fc-fav'] = (el) => {
    store.mutate('bookmarks', (b) => {
      if (b.cards[el.dataset.id]) delete b.cards[el.dataset.id];
      else b.cards[el.dataset.id] = 1;
    });
    u.haptic();
  };
  ui.actions['fc-grade'] = (el) => {
    const id = fc.queue[fc.idx];
    const ok = el.dataset.ok === '1';
    store.mutate('flashcards', (f) => {
      const p = f.prog[id] || (f.prog[id] = { box: 1, due: u.today(), seen: 0 });
      p.seen++;
      p.box = ok ? Math.min(5, p.box + 1) : 1;
      p.due = u.addDays(u.today(), ok ? BOX_DAYS[p.box - 1] : 0);
      f.seen++;
    });
    if (!ok) fc.queue.push(id); // missed cards come back at the end of this run
    fc.idx++;
    fc.flipped = false;
    u.haptic(ok ? 'tap' : 'warn');
    S.app.refresh(true);
  };
  ui.actions['fc-pick'] = (el) => {
    const q = fc.quiz;
    const i = Number(el.dataset.i);
    q.picked = i;
    fc.score.n++;
    const ok = q.options[i] === q.card.a;
    if (ok) fc.score.ok++;
    store.mutate('flashcards', (f) => {
      f.seen++;
      const p = f.prog[q.card.id] || (f.prog[q.card.id] = { box: 1, due: u.today(), seen: 0 });
      p.seen++;
      p.box = ok ? Math.min(5, p.box + 1) : 1;
      p.due = u.addDays(u.today(), ok ? BOX_DAYS[p.box - 1] : 0);
    });
    u.haptic(ok ? 'ok' : 'warn');
    S.app.refresh(true);
  };
  ui.actions['fc-next'] = () => { fc.quiz = null; S.app.refresh(true); };
  ui.actions['fc-add'] = () => {
    ui.sheet.open({
      title: 'Add a flashcard',
      html:
        '<form class="stack" onsubmit="return false" data-form="card">' +
        ui.field('Subject', ui.select('subj', D.SUBJECT_ORDER.map((s) => ({ v: s, t: NAMES[s] })), fc.subj === 'all' ? 'phy' : fc.subj)) +
        ui.field('Front (question)', '<textarea name="q" rows="2" maxlength="200" required></textarea>') +
        ui.field('Back (answer)', '<textarea name="a" rows="3" maxlength="400" required></textarea>') +
        '<p class="form-err" id="fc-err" role="alert"></p><button class="btn primary block rip" data-act="fc-save">Save card</button></form>',
    });
  };
  ui.actions['fc-save'] = () => {
    const v = ui.values(u.$('[data-form="card"]'));
    if (!v.q.trim() || !v.a.trim()) return (u.$('#fc-err').textContent = 'Write both the question and the answer.');
    store.mutate('flashcards', (f) => f.custom.push({ id: 'u:' + u.uid(), subj: v.subj, q: v.q.trim(), a: v.a.trim() }));
    ui.sheet.close();
    reset();
    ui.toast('Card added');
  };
})((window.SOS = window.SOS || {}));

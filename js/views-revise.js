/* views/revise.js — Quick revise: #/revise (every chapter, by subject) and #/revise/<chapter> (one chapter on one page).
 * Text, formulas, watch-outs and a worked example only. No video. It is built from the chapter's own notes (data/learn-c) and the
 * Formula vault, so it is always the same as what Study shows, in an order made for reading before a test:
 *   1. In a nutshell: one line per topic
 *   2. each topic: the idea, the formulas to remember, what to watch out for, one example
 *   3. every formula of the chapter in one list
 * Nothing is stored. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const L = S.learn;
  const X = S.learnUI;
  const F = S.formula;
  const ui = S.ui;
  S.views = S.views || {};

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths', cs: 'Computer Science' };
  const ICON = { phy: 'atom', chem: 'flask', mth: 'sigma', cs: 'code' };
  const st = { std: '12', open: {} };

  // The first sentence; when it is short and says little (under 60 characters), the second one too.
  const firstSentence = (s) => {
    const parts = String(s || '').match(/[^.!?]+[.!?]+(?=\s|$)/g) || [String(s || '')];
    let out = parts[0].trim();
    if (out.length < 60 && parts[1]) out += ' ' + parts[1].trim();
    return out;
  };
  const readMin = (topics, nvault) => {
    const w = topics.reduce((n, t) => n + String((t.s || '') + ' ' + (t.x || []).join(' ') + ' ' + (t.e || '')).split(/\s+/).length, 0) + nvault * 6;
    return Math.max(2, Math.round(w / 180));
  };
  const hasNotes = (id) => (L.chData(id).topics || []).some((t) => t.s);

  /* ---------- index ---------- */
  function indexHtml() {
    const subs = ['phy', 'chem', 'mth'];
    return (
      '<div class="page rv-index"><header class="page-h"><div><h1 class="h1">Quick revise</h1><p class="muted">Read, do not watch. The main ideas, formulas and traps of each chapter on one page.</p></div></header>' +
      ui.seg('rv-std', [{ v: '12', t: 'Class 12' }, { v: '11', t: 'Class 11' }], st.std) +
      subs.map((s) => {
        const list = D.BY_SUBJECT[s].filter((c) => String(c.std) === st.std);
        if (!list.length) return '';
        return '<section class="rv-sub" data-s="' + s + '"><p class="lbl rv-subh"><span class="ric" data-s="' + s + '">' + u.icon(ICON[s]) + '</span>' + NAMES[s] + '</p><ul class="list">' +
          list.map((c) => {
            const nf = S.FORMULAS.filter((f) => f.ch === c.id).length;
            const nt = (L.chData(c.id).topics || []).length;
            return '<li><button class="lrow rip" data-act="go" data-to="#/revise/' + c.id + '" data-testid="rv-' + c.id + '"><span class="rv-no" data-s="' + s + '">' + (c.tb || '') + '</span><span class="grow"><b class="rt">' + u.esc(c.name) + '</b><small class="rs">' +
              (nt ? nt + ' topics · ' : '') + nf + ' formulas</small></span>' + u.icon('chev-r', 'chev') + '</button></li>';
          }).join('') + '</ul></section>';
      }).join('') + '</div>'
    );
  }

  /* ---------- one chapter ---------- */
  function topicHtml(chId, t, i, cd) {
    const title = (cd.lst ? '' : t.no + ' ') + t.t;
    const open = st.open[chId + ':' + t.no];
    const fx = (t.f || []).length
      ? '<div class="rv-fx"><p class="lbl">Remember</p><ul>' + t.f.map((f) => '<li><span class="fx" role="math" aria-label="' + u.esc(F.plain(f.x)) + '">' + F.render(f.x) + '</span>' + (f.n ? '<small>' + F.render(f.n) + '</small>' : '') + '</li>').join('') + '</ul></div>'
      : '';
    const watch = (t.w || []).length ? '<div class="rv-watch"><p class="lbl">Watch out</p><ul>' + t.w.map((x) => '<li>' + u.esc(x) + '</li>').join('') + '</ul></div>' : '';
    const more = (t.x && t.x.length) || t.e
      ? '<details class="rv-more" data-key="' + u.esc(chId + ':' + t.no) + '"' + (open ? ' open' : '') + '><summary>' + (t.e ? 'More detail and an example' : 'More detail') + '</summary>' +
        (t.x || []).map((p) => '<p>' + u.esc(p) + '</p>').join('') + (t.e ? '<p class="lv-example"><b>Example. </b>' + u.esc(t.e) + '</p>' : '') + '</details>'
      : '';
    return (
      '<article class="rv-topic card" id="rv-t-' + u.esc(t.no) + '"><h2 class="rv-th"><span class="rv-n">' + (i + 1) + '</span>' + u.esc(title) + '</h2>' +
      (t.s ? '<p class="rv-idea">' + u.esc(t.s) + '</p>' : '<p class="small muted">The notes for this topic are loading or not written yet. Read it in your book.</p>') + fx + watch + more + '</article>'
    );
  }

  function chapterHtml(chId) {
    const c = D.CH[chId];
    const cd = L.chData(chId);
    X.ensureNotes(chId);
    const topics = (cd.topics || []).filter((t) => t.s || t.h);
    const vault = S.FORMULAS.filter((f) => f.ch === chId);
    const loading = L.notesState && L.notesState(chId) === 'loading';
    const nut = topics.filter((t) => t.s).map((t) => '<li><b>' + u.esc(t.t) + ':</b> ' + u.esc(firstSentence(t.s)) + '</li>').join('');
    const nq = L.mcqCount ? L.mcqCount(chId) : 0;
    return (
      '<div class="page rv-page" data-s="' + c.subj + '">' +
      '<header class="rv-head"><span class="ric rv-ic" data-s="' + c.subj + '">' + u.icon(ICON[c.subj]) + '</span><div><p class="lbl">' + NAMES[c.subj] + ' · Class ' + c.std + (c.tb ? ' · Chapter ' + c.tb : '') + '</p><h1 class="h1">' + u.esc(c.name) + '</h1>' +
      '<p class="small muted">' + (topics.length ? topics.length + ' topics · ' : '') + vault.length + ' formulas · about ' + readMin(topics, vault.length) + ' min to read</p></div></header>' +
      (loading && !topics.some((t) => t.s) ? '<div class="skel" style="height:8rem"></div>' : '') +
      (nut ? '<section class="rv-nut"><h2 class="h3">In a nutshell</h2><ul>' + nut + '</ul></section>' : '') +
      topics.map((t, i) => topicHtml(chId, t, i, cd)).join('') +
      (vault.length
        ? '<section class="card rv-all"><div class="row-between"><h2 class="h3">All formulas of this chapter</h2><span class="small muted">' + vault.length + '</span></div><ul class="rv-flist">' +
          vault.map((f) => '<li><span class="rv-fn">' + u.esc(f.name) + '</span><span class="rv-ff">' + u.esc(f.f) + '</span>' + (f.note ? '<small>' + u.esc(f.note) + '</small>' : '') + '</li>').join('') + '</ul>' +
          '<button class="btn tonal block rip" data-act="go" data-to="#/formulas?ch=' + chId + '">' + u.icon('sigma') + 'Open in the Formula vault</button></section>'
        : '') +
      '<section class="card stack rv-next"><h2 class="h3">Now check yourself</h2>' +
      (nq ? '<button class="btn primary block rip" data-act="go" data-to="#/practice?ch=' + chId + '">' + u.icon('target') + 'Practise this chapter (' + nq + ')</button>' : '') +
      '<div class="row gap"><button class="btn tonal grow rip" data-act="go" data-to="#/watch/' + chId + '">' + u.icon('play') + 'Watch</button>' +
      '<button class="btn tonal grow rip" data-act="go" data-to="#/flashcards">' + u.icon('cards') + 'Cards</button></div></section></div>'
    );
  }

  S.views.revise = {
    title: 'Quick revise',
    tab: 'study',
    isPushed: (ctx) => !!ctx.params[0],
    pageTitle: (ctx) => (D.CH[ctx.params[0]] ? D.CH[ctx.params[0]].name : 'Quick revise'),
    pageKicker: (ctx) => (D.CH[ctx.params[0]] ? 'REVISE · ' + NAMES[D.CH[ctx.params[0]].subj].toUpperCase() + ' ' + D.CH[ctx.params[0]].std : ''),
    backHash: () => '#/revise',
    render(root, ctx) {
      const id = ctx.params[0];
      if (id && D.CH[id]) {
        root.innerHTML = chapterHtml(id);
        return;
      }
      root.innerHTML = indexHtml();
    },
  };

  ui.actions['rv-std'] = (el) => { st.std = el.dataset.v; S.app.refresh(true); };
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d && d.classList && d.classList.contains('rv-more')) st.open[d.dataset.key] = d.open;
  }, true);
})((window.SOS = window.SOS || {}));

/* views/formulas.js — Formula vault (search, accordion, favourites, revision mode) and exam cheat sheets. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const ui = S.ui;
  const store = S.store;
  S.views = S.views || {};

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths', cs: 'CS' };
  const st = { subj: 'all', q: '', fav: false, revise: false, open: {}, sheetSubj: 'phy' };

  function chaptersWithFormulas(subj) {
    const seen = {};
    S.FORMULAS.forEach((f) => (seen[f.ch] = (seen[f.ch] || 0) + 1));
    return D.CHAPTERS.filter((c) => seen[c.id] && (subj === 'all' || c.subj === subj)).map((c) => ({ c: c, n: seen[c.id] }));
  }

  function item(f) {
    const fav = !!store.get('bookmarks').formulas[f.id];
    return (
      '<li class="fm" data-s="' + f.subj + '"><div class="fm-h"><b>' + u.esc(f.name) + '</b>' +
      '<button class="icon-btn sm rip" aria-label="' + (fav ? 'Remove from saved' : 'Save formula') + '" aria-pressed="' + fav + '" data-act="fm-fav" data-id="' + f.id + '">' + u.icon(fav ? 'star-f' : 'star') + '</button></div>' +
      '<div class="fm-f' + (st.revise ? ' hide' : '') + '"' + (st.revise ? ' role="button" tabindex="0" data-act="fm-reveal" aria-label="Reveal formula"' : '') + '>' + u.esc(f.f) + '</div>' +
      (f.note ? '<small class="muted">' + u.esc(f.note) + '</small>' : '') + '</li>'
    );
  }

  function accordion() {
    const favs = store.get('bookmarks').formulas;
    return chaptersWithFormulas(st.subj)
      .map((x) => {
        let list = S.FORMULAS.filter((f) => f.ch === x.c.id);
        if (st.fav) list = list.filter((f) => favs[f.id]);
        if (st.fav && !list.length) return '';
        const open = !!st.open[x.c.id];
        return (
          '<section class="acc' + (open ? ' is-open' : '') + '" data-s="' + x.c.subj + '"><button class="acc-h rip" aria-expanded="' + open + '" data-act="fm-toggle" data-id="' + x.c.id + '"><i class="dot"></i><span class="grow"><b>' + u.esc(x.c.name) + '</b></span><small class="muted">' + list.length + '</small>' + u.icon('chev-d', 'chev') + '</button>' +
          (open ? '<ul class="fms">' + list.map(item).join('') + '</ul>' : '') + '</section>'
        );
      })
      .join('');
  }

  function results() {
    const q = st.q.trim().toLowerCase();
    if (!q) return accordion() || ui.empty('star', 'Nothing saved yet', 'Tap the star on a formula to keep it here.');
    const favs = store.get('bookmarks').formulas;
    const hits = S.FORMULAS.filter((f) => (st.subj === 'all' || f.subj === st.subj) && (!st.fav || favs[f.id]) &&
      (f.name.toLowerCase().indexOf(q) >= 0 || f.f.toLowerCase().indexOf(q) >= 0 || D.CH[f.ch].name.toLowerCase().indexOf(q) >= 0 || f.note.toLowerCase().indexOf(q) >= 0));
    if (!hits.length) return ui.empty('search', 'No formulas found', 'Try another word, like the chapter name.');
    return '<p class="small muted">' + hits.length + ' found' + (hits.length > 40 ? ', showing 40' : '') + '</p><ul class="fms flat">' + hits.slice(0, 40).map(item).join('') + '</ul>';
  }

  S.views.formulas = {
    title: 'Formula vault',
    tab: 'subjects',
    pushed: true,
    render(root, ctx) {
      if (ctx.first && ctx.query.ch && D.CH[ctx.query.ch]) {
        st.subj = D.CH[ctx.query.ch].subj;
        st.open[ctx.query.ch] = true;
        st.q = '';
      }
      const favCount = Object.keys(store.get('bookmarks').formulas).length;
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">Formula vault</h1><p class="muted">' + S.FORMULAS.length + ' formulas · ' + favCount + ' saved</p></div>' +
        '<button class="btn tonal sm rip" data-act="go" data-to="#/cheatsheet">' + u.icon('note') + 'Cheat sheet</button></header>' +
        '<div class="searchbar">' + u.icon('search') + '<input type="search" id="fm-q" placeholder="Search formulas or chapters" aria-label="Search formulas" value="' + u.esc(st.q) + '" data-input="fm-search" autocomplete="off"></div>' +
        ui.seg('fm-subj', [{ v: 'all', t: 'All' }, { v: 'phy', t: 'Physics' }, { v: 'chem', t: 'Chem' }, { v: 'mth', t: 'Maths' }, { v: 'cs', t: 'CS' }], st.subj) +
        '<div class="chips"><button class="chip rip" aria-pressed="' + st.fav + '" data-act="fm-favonly">' + u.icon('star') + 'Saved</button>' +
        '<button class="chip rip" aria-pressed="' + st.revise + '" data-act="fm-revise">' + u.icon('eye') + 'Revision mode</button></div>' +
        (st.revise ? '<p class="small muted">Formulas are hidden. Tap one to reveal it.</p>' : '') +
        '<div id="fm-list" class="stack">' + results() + '</div></div>';
    },
  };

  ui.inputs['fm-search'] = (el) => {
    st.q = el.value;
    u.$('#fm-list').innerHTML = results();
  };
  ui.actions['fm-subj'] = (el) => { st.subj = el.dataset.v; S.app.refresh(true); };
  ui.actions['fm-favonly'] = () => { st.fav = !st.fav; S.app.refresh(true); };
  ui.actions['fm-revise'] = () => { st.revise = !st.revise; S.app.refresh(true); };
  ui.actions['fm-toggle'] = (el) => {
    st.open[el.dataset.id] = !st.open[el.dataset.id];
    u.$('#fm-list').innerHTML = results();
  };
  ui.actions['fm-reveal'] = (el) => el.classList.toggle('hide');
  ui.actions['fm-fav'] = (el) => {
    const id = el.dataset.id;
    store.mutate('bookmarks', (b) => {
      if (b.formulas[id]) delete b.formulas[id];
      else b.formulas[id] = 1;
    });
    u.haptic();
  };

  /* ---------- exam cheat sheet ---------- */
  S.views.cheatsheet = {
    title: 'Cheat sheets',
    tab: 'subjects',
    pushed: true,
    render(root) {
      const s = st.sheetSubj;
      const chs = D.BY_SUBJECT[s].filter((c) => S.FORMULAS.some((f) => f.ch === c.id && f.hy));
      root.innerHTML =
        '<div class="page sheetpage" data-s="' + s + '"><header class="page-h"><div><h1 class="h1">Cheat sheet</h1><p class="muted">The high-yield formulas only. Read this the night before.</p></div>' +
        '<button class="btn tonal sm rip noprint" data-act="cs-print">' + u.icon('print') + 'Print</button></header>' +
        '<div class="noprint">' + ui.seg('cs-subj', D.SUBJECT_ORDER.map((k) => ({ v: k, t: NAMES[k] })), s) + '</div>' +
        '<h2 class="h2 printonly">' + NAMES[s] + ' cheat sheet</h2>' +
        (chs.length
          ? '<div class="cheat">' + chs.map((c) =>
              '<section><h3>' + u.esc(c.name) + '</h3><ul>' +
              S.FORMULAS.filter((f) => f.ch === c.id && f.hy).map((f) => '<li><span>' + u.esc(f.name) + '</span><code>' + u.esc(f.f) + '</code></li>').join('') +
              '</ul></section>').join('') + '</div>'
          : ui.empty('note', 'No high-yield formulas yet', 'This subject has no cheat sheet entries.')) +
        '</div>';
    },
  };
  ui.actions['cs-subj'] = (el) => { st.sheetSubj = el.dataset.v; S.app.refresh(true); };
  ui.actions['cs-print'] = () => window.print();
})((window.SOS = window.SOS || {}));

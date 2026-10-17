/* views/revision.js — Revision scheduler (spaced repetition due list) and the Error notebook. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const ui = S.ui;
  const store = S.store;
  S.views = S.views || {};

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths', cs: 'CS' };

  /* ---------- revision scheduler ---------- */
  function group(title, list, tone) {
    if (!list.length) return '';
    return (
      '<section class="card list-card"><h2 class="h3 ' + (tone || '') + '">' + title + ' <span class="muted small">' + list.length + '</span></h2><ul class="due">' +
      list.map((it) =>
        '<li data-s="' + it.subj + '"><button class="due-b rip" data-act="' + (it.kind === 'chapter' ? 'ch-open' : 'er-view') + '" data-id="' + it.id + '"><i class="dot"></i><span><b>' + u.esc(it.title) + '</b><small>' + (it.kind === 'chapter' ? 'Chapter' : 'Error') + ' · revision ' + (it.step + 1) + ' of 5 · ' + (it.late > 0 ? u.plural(it.late, 'day') + ' overdue' : it.late === 0 ? 'due today' : u.esc(u.dateShort(it.due))) + '</small></span></button>' +
        (it.late >= 0 ? '<button class="btn tonal sm rip" data-act="rv-done" data-kind="' + it.kind + '" data-id="' + it.id + '" data-step="' + it.step + '">Done</button>' : '') + '</li>').join('') +
      '</ul></section>'
    );
  }
  S.views.revision = {
    title: 'Revision',
    tab: 'planner',
    pushed: true,
    render(root) {
      const items = E.due();
      const over = items.filter((i) => i.late > 0);
      const today = items.filter((i) => i.late === 0);
      const week = items.filter((i) => i.late < 0 && i.late >= -7);
      const later = items.filter((i) => i.late < -7);
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">Revision</h1><p class="muted">' + (over.length + today.length ? over.length + today.length + ' due now' : 'Nothing due right now') + '</p></div></header>' +
        '<section class="card"><p class="small muted">Finish a chapter or log a mistake and it comes back after <b>1, 3, 7, 15 and 30 days</b>. Revising at these gaps is what moves it into long-term memory.</p></section>' +
        (items.length
          ? group('Overdue', over, 'warn') + group('Due today', today) + group('Next 7 days', week) + group('Later', later)
          : ui.empty('refresh', 'No revisions scheduled', 'Mark a chapter Done in Subjects, or add a question to the Error Notebook. Revisions are created automatically.',
              '<button class="btn primary rip" data-act="go" data-to="#/subjects">Open subjects</button>')) +
        '</div>';
    },
  };
  ui.actions['rv-done'] = (el) => {
    const step = Number(el.dataset.step);
    if (el.dataset.kind === 'chapter') E.reviseChapter(el.dataset.id, step);
    else E.reviseError(el.dataset.id, step);
    u.haptic('ok');
  };

  /* ---------- error notebook ---------- */
  const est = { seg: 'open', subj: 'all', form: null };
  const errs = () => store.get('errors').items;

  function chapterOpts(subj, chId) {
    return '<option value="">Other / not sure</option>' + (D.BY_SUBJECT[subj] || []).map((c) => '<option value="' + c.id + '"' + (c.id === chId ? ' selected' : '') + '>' + u.esc(c.name) + '</option>').join('');
  }
  function formHtml(o) {
    o = o || {};
    return (
      '<form class="stack" data-form="error" onsubmit="return false">' +
      '<div class="row gap">' + ui.field('Subject', ui.select('subj', D.SUBJECT_ORDER.map((s) => ({ v: s, t: NAMES[s] })), o.subj || 'phy').replace('<select', '<select data-change="er-subj"')) +
      '<label class="field"><span class="field-l">Chapter</span><select name="chId" id="er-ch">' + chapterOpts(o.subj || 'phy', o.chId) + '</select></label></div>' +
      ui.field('Question or where it came from', '<textarea name="question" rows="2" maxlength="400" placeholder="e.g. CET Mock 3, Q41: a capacitor is charged and then…">' + u.esc(o.question || (o.from ? o.from + ': ' : '')) + '</textarea>') +
      ui.field('Correct concept or trick', '<textarea name="concept" rows="3" maxlength="800" placeholder="What is the right idea? What should you do next time?" required>' + u.esc(o.concept || '') + '</textarea>') +
      ui.field('Why did it go wrong?', ui.select('reason', D.ERROR_REASONS.map((r) => ({ v: r, t: r })), o.reason || D.ERROR_REASONS[0])) +
      '<button type="button" class="btn tonal block" disabled aria-disabled="true">' + u.icon('image') + 'Attach a photo (coming soon)</button>' +
      '<p class="form-err" id="er-err" role="alert"></p><button class="btn primary block rip" data-act="er-save"' + (o.id ? ' data-id="' + o.id + '"' : '') + '>' + (o.id ? 'Save changes' : 'Add to notebook') + '</button></form>'
    );
  }
  function openForm(o) {
    est.form = o || {};
    ui.sheet.open({ title: o && o.id ? 'Edit error' : 'New error', html: formHtml(o), tall: true, onClose: () => (est.form = null) });
  }
  S.errorsUI = { openForm: openForm };

  function card(e) {
    const bm = store.get('bookmarks').errors[e.id];
    const next = e.srs && !e.resolved ? e.srs.d.indexOf(false) : -1;
    return (
      '<li class="er' + (e.resolved ? ' is-resolved' : '') + '" data-s="' + e.subj + '"><div class="er-h"><i class="dot"></i><b>' + u.esc(e.chapter || NAMES[e.subj]) + '</b><span class="chip-s">' + u.esc(e.reason) + '</span></div>' +
      (e.question ? '<p class="er-q">' + u.esc(e.question) + '</p>' : '') +
      '<p class="er-c"><small class="muted">Correct concept</small>' + u.esc(e.concept) + '</p>' +
      '<div class="er-f"><small class="muted">' + u.esc(u.dateShort(e.date)) + (next >= 0 ? ' · next revision ' + u.esc(u.dateShort(e.srs.a[next])) : '') + '</small>' +
      '<span class="er-a"><button class="icon-btn sm rip" aria-label="' + (bm ? 'Remove bookmark' : 'Bookmark') + '" aria-pressed="' + !!bm + '" data-act="er-bm" data-id="' + e.id + '">' + u.icon(bm ? 'star-f' : 'star') + '</button>' +
      (e.src && e.src.qid ? '<button class="icon-btn sm rip" aria-label="View the question" data-act="go" data-to="#/q/' + e.src.qid + '" data-testid="er-q">' + u.icon('eye') + '</button>' : '') +
      '<button class="icon-btn sm rip" aria-label="Edit" data-act="er-edit" data-id="' + e.id + '">' + u.icon('edit') + '</button>' +
      '<button class="icon-btn sm rip" aria-label="Delete" data-act="er-del" data-id="' + e.id + '">' + u.icon('trash') + '</button>' +
      '<button class="btn ' + (e.resolved ? 'tonal' : 'primary') + ' sm rip" data-act="er-res" data-id="' + e.id + '">' + (e.resolved ? 'Reopen' : 'Resolved') + '</button></span></div></li>'
    );
  }

  S.views.errors = {
    title: 'Error notebook',
    tab: 'tests',
    pushed: true,
    render(root) {
      const all = errs();
      let list = all.filter((e) => (est.seg === 'all' ? true : est.seg === 'open' ? !e.resolved : e.resolved) && (est.subj === 'all' || e.subj === est.subj));
      list = list.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      const open = all.filter((e) => !e.resolved);
      const byReason = {};
      open.forEach((e) => (byReason[e.reason] = (byReason[e.reason] || 0) + 1));
      const top = Object.keys(byReason).sort((a, b) => byReason[b] - byReason[a])[0];
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">Error notebook</h1><p class="muted">' + open.length + ' open · ' + (all.length - open.length) + ' resolved' + (top ? ' · most common: ' + u.esc(top.toLowerCase()) : '') + '</p></div>' +
        '<button class="btn primary sm rip" data-act="er-new">' + u.icon('plus') + 'Add</button></header>' +
        ui.seg('er-seg', [{ v: 'open', t: 'Open' }, { v: 'resolved', t: 'Resolved' }, { v: 'all', t: 'All' }], est.seg) +
        ui.seg('er-subj', [{ v: 'all', t: 'All' }, { v: 'phy', t: 'Physics' }, { v: 'chem', t: 'Chem' }, { v: 'mth', t: 'Maths' }, { v: 'cs', t: 'CS' }], est.subj) +
        (list.length
          ? '<ul class="ers">' + list.map(card).join('') + '</ul>'
          : ui.empty('notebook', all.length ? 'Nothing in this view' : 'Your notebook is empty', all.length ? 'Change the filters to see other errors.' : 'Every wrong question you write down here is a mark you will not lose again. Each one comes back for revision automatically.',
              '<button class="btn primary rip" data-act="er-new">Add your first error</button>')) +
        '</div>';
    },
  };
  ui.actions['er-seg'] = (el) => { est.seg = el.dataset.v; S.app.refresh(true); };
  ui.actions['er-subj'] = (el) => { est.subj = el.dataset.v; S.app.refresh(true); };
  ui.actions['er-new'] = () => openForm({ subj: est.subj === 'all' ? 'phy' : est.subj });
  ui.actions['er-edit'] = (el) => openForm(errs().filter((e) => e.id === el.dataset.id)[0]);
  ui.actions['er-view'] = (el) => {
    const e = errs().filter((x) => x.id === el.dataset.id)[0];
    if (e) ui.sheet.open({ title: e.chapter || 'Error', html: '<ul class="ers">' + card(e) + '</ul>' });
  };
  ui.changes['er-subj'] = (el) => {
    u.$('#er-ch').innerHTML = chapterOpts(el.value, '');
  };
  ui.actions['er-bm'] = (el) => {
    store.mutate('bookmarks', (b) => {
      if (b.errors[el.dataset.id]) delete b.errors[el.dataset.id];
      else b.errors[el.dataset.id] = 1;
    });
  };
  ui.actions['er-res'] = (el) => {
    store.mutate('errors', (d) => {
      const e = d.items.filter((x) => x.id === el.dataset.id)[0];
      if (e) e.resolved = !e.resolved;
    });
    u.haptic('ok');
  };
  ui.actions['er-del'] = async (el) => {
    const ok = await ui.confirm({ title: 'Delete this error?', text: 'It will be removed from the notebook and its revisions.', ok: 'Delete', danger: true });
    if (!ok) return;
    const id = el.dataset.id;
    const copy = JSON.parse(JSON.stringify(errs().filter((x) => x.id === id)[0]));
    store.mutate('errors', (d) => (d.items = d.items.filter((x) => x.id !== id)));
    ui.toast('Error deleted', { action: 'Undo', fn: () => store.mutate('errors', (d) => d.items.push(copy)) });
  };
  ui.actions['er-save'] = (el) => {
    const v = ui.values(u.$('[data-form="error"]'));
    if (!v.concept.trim()) return (u.$('#er-err').textContent = 'Write the correct concept so future-you can learn from it.');
    const id = el.dataset.id;
    const chName = v.chId && D.CH[v.chId] ? D.CH[v.chId].name : '';
    const base = { subj: v.subj, chId: v.chId, chapter: chName, question: v.question.trim(), concept: v.concept.trim(), reason: v.reason };
    store.mutate('errors', (d) => {
      if (id) {
        const e = d.items.filter((x) => x.id === id)[0];
        if (e) Object.assign(e, base);
      } else {
        const date = u.today();
        d.items.push(Object.assign({ id: u.uid(), date: date, resolved: false, hasImage: false, revs: 0, srs: S.migrate.makeSrs(date) }, base));
      }
    });
    u.haptic('ok');
    ui.sheet.close();
    ui.toast(id ? 'Error updated' : 'Added. It will come back for revision tomorrow.');
  };
})((window.SOS = window.SOS || {}));

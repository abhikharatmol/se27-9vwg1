/* views/tests.js — Mock test centre. CET (12), JEE (8) and subject tests, with auto analytics. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const ui = S.ui;
  const store = S.store;
  const CH = S.charts;
  S.views = S.views || {};

  const view = { seg: 'cet', sub: 'phy' };
  let draft = null; // { id?, type, slot, weak:Set }

  const items = () => store.get('mocks').items;
  const ofType = (t) => items().filter((m) => m.type === t).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  const tier = (p) => (p >= 75 ? 'good' : p >= 50 ? 'mid' : 'low');
  const pct = (m) => Math.round(E.mockPct(m));

  function summary(list) {
    if (!list.length) return '';
    const ps = list.map((m) => E.mockPct(m));
    const last = ps[ps.length - 1];
    const prev = ps.length > 1 ? ps[ps.length - 2] : null;
    const avg = u.sum(ps) / ps.length;
    const accs = list.map(E.mockAcc).filter((a) => a != null);
    const acc = accs.length ? Math.round(u.sum(accs) / accs.length) : null;
    const delta = prev != null ? Math.round(last - prev) : null;
    return (
      '<section class="card"><div class="stats3">' +
      '<div><b class="num">' + Math.round(last) + '%</b><small>Latest' + (delta != null ? ' · ' + (delta >= 0 ? '+' : '') + delta : '') + '</small></div>' +
      '<div><b class="num">' + Math.round(Math.max.apply(null, ps)) + '%</b><small>Best</small></div>' +
      '<div><b class="num">' + Math.round(avg) + '%</b><small>Average</small></div></div>' +
      (acc != null ? '<p class="small muted" style="margin-top:8px">Average accuracy ' + acc + '% (correct of attempted)</p>' : '') +
      '<h3 class="h4" style="margin-top:14px">Improvement</h3>' + CH.line(list.map((m) => ({ y: E.mockPct(m) })), { label: 'Mock score trend' }) +
      (list.length === 1 ? '<p class="small muted">Log one more attempt to see the trend line.</p>' : '') +
      '</section>'
    );
  }

  function slotGrid(type) {
    const cfg = D.MOCKS[type];
    const list = ofType(type);
    let out = '<div class="slots">';
    for (let n = 1; n <= cfg.count; n++) {
      const at = list.filter((m) => m.slot === n);
      const last = at[at.length - 1];
      out +=
        '<button class="slot rip' + (last ? ' has t-' + tier(pct(last)) : '') + '" data-act="mk-slot" data-type="' + type + '" data-n="' + n + '" aria-label="' + cfg.short + ' mock ' + n + (last ? ', ' + pct(last) + ' percent' : ', not attempted') + '">' +
        '<small>' + cfg.short + ' ' + n + '</small>' + (last ? '<b>' + pct(last) + '%</b>' : '<b class="dash">—</b>') + (at.length > 1 ? '<i class="slot-n">' + at.length + '×</i>' : '') + '</button>';
    }
    return out + '</div>';
  }

  function attemptRow(m) {
    const acc = E.mockAcc(m);
    const bm = store.get('bookmarks').mocks[m.id];
    return (
      '<li><button class="att rip" data-act="mk-view" data-id="' + m.id + '"><span class="att-p t-' + tier(pct(m)) + '">' + pct(m) + '%</span>' +
      '<span class="att-b"><b>' + u.esc(m.title) + (bm ? ' ' + u.icon('star-f', 'star-i') : '') + '</b><small>' + u.esc(u.dateShort(m.date)) + ' · ' + m.score + '/' + m.total + (m.min ? ' · ' + m.min + ' min' : '') + (acc != null ? ' · ' + Math.round(acc) + '% acc' : '') + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>'
    );
  }

  function weakTags() {
    const count = {};
    items().forEach((m) => (m.weak || []).forEach((id) => (count[id] = (count[id] || 0) + 1)));
    const top = Object.keys(count).filter((id) => D.CH[id]).sort((a, b) => count[b] - count[a]).slice(0, 5);
    if (!top.length) return '';
    return (
      '<section class="card"><h2 class="h3">Weak chapters from your mocks</h2><ul class="recs">' +
      top.map((id) => '<li><button class="rec rip" data-act="go" data-to="#/subjects/' + D.CH[id].subj + '?open=' + id + '"><i class="dot" data-s="' + D.CH[id].subj + '"></i><span><b>' + u.esc(D.CH[id].name) + '</b><small>Tagged in ' + u.plural(count[id], 'mock') + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>').join('') +
      '</ul></section>'
    );
  }

  // Primary entry to the Test Center (timed tests on the built-in question bank).
  function startCard() {
    const TC = S.tc;
    const total = TC ? (S.QUESTIONS || []).length : 0;
    const sub = total ? u.plural(total, 'question') + ' · ' + u.plural(TC.chaptersWithQuestions().length, 'chapter') + ' · timed, scored, with an answer key' : 'No questions yet';
    return (
      '<section class="card stack" aria-label="Start a test"><button class="btn primary block rip" data-act="go" data-to="#/testcenter" data-testid="tests-start">' + u.icon('timer') + 'Start a test</button>' +
      '<button class="btn tonal block rip" data-act="go" data-to="#/practice" data-testid="tests-practice">' + u.icon('target') + 'Practice (untimed)</button>' +
      '<button class="btn tonal block rip" data-act="go" data-to="#/pyq" data-testid="tests-pyq">' + u.icon('clipboard') + 'Past papers: timed answer sheet</button>' +
      '<p class="small muted center">' + sub + '</p></section>'
    );
  }

  S.views.tests = {
    title: 'Tests',
    tab: 'tests',
    render(root) {
      const type = view.seg === 'sub' ? view.sub : view.seg;
      const list = ofType(type);
      let main = '';
      if (view.seg === 'sub') {
        main =
          ui.seg('mk-sub', [{ v: 'phy', t: 'Physics' }, { v: 'chem', t: 'Chemistry' }, { v: 'mth', t: 'Maths' }], view.sub) +
          '<button class="btn primary block rip" data-act="mk-new" data-type="' + type + '">' + u.icon('plus') + 'Add ' + D.MOCKS[type].short + ' test</button>';
      } else {
        main = slotGrid(type);
      }
      const recent = list.slice().reverse();
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">Tests</h1><p class="muted">' + items().length + ' logged · ' + u.plural(E.dueCounts().overdue + E.dueCounts().today, 'revision') + ' due</p></div>' +
        '<div class="row gap"><button class="btn tonal sm rip" data-act="go" data-to="#/errors">' + u.icon('notebook') + 'Errors</button></div></header>' +
        startCard() +
        '<div><h2 class="h3">Log a book mock (type in your score)</h2>' +
        '<p class="small muted">Test Center attempts appear under &ldquo;Previous attempts&rdquo;, not in these boxes.</p></div>' +
        ui.seg('mk-seg', [{ v: 'cet', t: 'CET (12)' }, { v: 'jee', t: 'JEE (8)' }, { v: 'sub', t: 'Subjects' }], view.seg) +
        main +
        (list.length ? summary(list) : ui.empty('clipboard', 'No attempts yet', view.seg === 'sub' ? 'Add your first ' + D.MOCKS[type].short + ' test to see your trend.' : 'Tap a test above and enter your score after each attempt.')) +
        (recent.length ? '<section class="card list-card"><h2 class="h3">Previous attempts</h2><ul class="atts">' + recent.map(attemptRow).join('') + '</ul></section>' : '') +
        weakTags() + '</div>';
    },
  };

  /* ---------- attempt sheet ---------- */
  function formHtml(m) {
    const cfg = D.MOCKS[draft.type];
    const isMain = draft.type === 'cet' || draft.type === 'jee';
    const marks = m.marks || {};
    const chips = D.SUBJECT_ORDER.filter((s) => (isMain ? s !== 'cs' : s === draft.type))
      .map(
        (s) =>
          '<details' + (!isMain ? ' open' : '') + '><summary>' + ({ phy: 'Physics', chem: 'Chemistry', mth: 'Maths' }[s]) + '</summary><div class="chips">' +
          D.BY_SUBJECT[s].map((c) => '<button type="button" class="chip sm rip" aria-pressed="' + draft.weak.has(c.id) + '" data-act="mk-weak" data-id="' + c.id + '">' + u.esc(c.name) + '</button>').join('') +
          '</div></details>'
      ).join('');
    return (
      '<form class="stack" data-form="mock" onsubmit="return false">' +
      (isMain
        ? '<p class="muted small">' + u.esc(cfg.label) + ' ' + draft.slot + ' · out of ' + cfg.total + ' marks, ' + cfg.mins + ' minutes</p>'
        : ui.field('Test name', '<input name="title" maxlength="60" placeholder="e.g. Thermodynamics chapter test" value="' + u.esc(m.title || '') + '">')) +
      '<div class="row gap">' + ui.field('Date', '<input type="date" name="date" value="' + u.esc(m.date || u.today()) + '" max="' + u.today() + '">') +
      ui.field('Time taken (min)', '<input type="number" name="min" inputmode="numeric" min="0" max="600" value="' + (m.min || '') + '" placeholder="' + cfg.mins + '">') + '</div>' +
      '<div class="row gap">' + ui.field('Score', '<input type="number" name="score" inputmode="decimal" step="any" value="' + (m.score != null ? m.score : '') + '" placeholder="e.g. 142" required>') +
      ui.field('Total marks', '<input type="number" name="total" inputmode="numeric" min="1" value="' + (m.total || cfg.total) + '">') + '</div>' +
      '<div class="row gap">' + ui.field('Correct', '<input type="number" name="correct" inputmode="numeric" min="0" value="' + (m.correct != null ? m.correct : '') + '">') +
      ui.field('Wrong', '<input type="number" name="wrong" inputmode="numeric" min="0" value="' + (m.wrong != null ? m.wrong : '') + '">') + '</div>' +
      (isMain
        ? '<div class="row gap">' + ui.field('Physics marks', '<input type="number" name="m_phy" inputmode="decimal" step="any" value="' + (marks.phy != null ? marks.phy : '') + '">') +
          ui.field('Chem marks', '<input type="number" name="m_chem" inputmode="decimal" step="any" value="' + (marks.chem != null ? marks.chem : '') + '">') +
          ui.field('Maths marks', '<input type="number" name="m_mth" inputmode="decimal" step="any" value="' + (marks.mth != null ? marks.mth : '') + '">') + '</div>'
        : '') +
      '<div><span class="field-l">Weak chapters</span><div class="weakbox">' + chips + '</div></div>' +
      ui.field('Notes', '<textarea name="note" rows="2" placeholder="What went wrong? Time lost where?">' + u.esc(m.note || '') + '</textarea>') +
      '<p class="form-err" id="mk-err" role="alert"></p>' +
      '<button class="btn primary block rip" data-act="mk-save">' + (draft.id ? 'Save changes' : 'Save attempt') + '</button></form>'
    );
  }

  function openForm(type, slot, existing) {
    const m = existing || {};
    draft = { id: existing ? existing.id : null, type: type, slot: slot || null, weak: new Set(m.weak || []) };
    const cfg = D.MOCKS[type];
    ui.sheet.open({
      title: (existing ? 'Edit ' : 'New ') + (slot ? cfg.label + ' ' + slot : cfg.label),
      html: formHtml(m),
      tall: true,
      onClose: () => (draft = null),
    });
  }

  function detailHtml(id) {
    const m = items().filter((x) => x.id === id)[0];
    if (!m) return '';
    const acc = E.mockAcc(m);
    const list = ofType(m.type).filter((x) => x.slot === m.slot || !m.slot);
    const idx = list.findIndex((x) => x.id === id);
    const prev = idx > 0 ? list[idx - 1] : null;
    const att = (m.correct || 0) + (m.wrong || 0);
    const bm = store.get('bookmarks').mocks[id];
    const stats = [
      ['Score', m.score + ' / ' + m.total + ' (' + pct(m) + '%)'],
      ['Accuracy', acc != null ? Math.round(acc) + '%' : 'Not entered'],
      ['Time', m.min ? m.min + ' min' + (att ? ' · ' + (m.min / att).toFixed(1) + ' min per attempted question' : '') : 'Not entered'],
      ['Correct / wrong', m.correct != null ? m.correct + ' / ' + (m.wrong != null ? m.wrong : '—') : 'Not entered'],
    ];
    if (prev) stats.push(['Vs previous attempt', (pct(m) - pct(prev) >= 0 ? '+' : '') + (pct(m) - pct(prev)) + ' points']);
    const marks = m.marks || {};
    const mk = ['phy', 'chem', 'mth'].filter((k) => marks[k] != null).map((k) => ({ phy: 'Physics', chem: 'Chemistry', mth: 'Maths' }[k]) + ' ' + marks[k]);
    if (mk.length) stats.push(['Sections', mk.join(' · ')]);
    return (
      '<dl class="facts one">' + stats.map((s) => '<div><dt>' + s[0] + '</dt><dd>' + u.esc(s[1]) + '</dd></div>').join('') + '</dl>' +
      ((m.weak || []).length ? '<div class="sec"><h3 class="h4">Weak chapters</h3><div class="chips-s">' + m.weak.filter((c) => D.CH[c]).map((c) => '<span class="chip-s warn">' + u.esc(D.CH[c].name) + '</span>').join('') + '</div></div>' : '') +
      (m.note ? '<div class="sec"><h3 class="h4">Notes</h3><p>' + u.esc(m.note) + '</p></div>' : '') +
      '<div class="row gap"><button class="btn tonal grow rip" data-act="mk-bm" data-id="' + id + '">' + u.icon(bm ? 'star-f' : 'star') + (bm ? 'Saved' : 'Save') + '</button>' +
      '<button class="btn tonal grow rip" data-act="mk-err" data-id="' + id + '">' + u.icon('notebook') + 'Log wrong question</button></div>' +
      // A Test Center row is a summary of a scored attempt: open the full result instead of
      // editing it (the edit form would also drop its attemptId link).
      (m.attemptId
        ? '<div class="row gap"><button class="btn tonal grow rip" data-act="mk-result" data-id="' + m.attemptId + '">Open full result</button><button class="btn danger grow rip" data-act="mk-del" data-id="' + id + '">Delete</button></div>'
        : '<div class="row gap"><button class="btn tonal grow rip" data-act="mk-edit" data-id="' + id + '">Edit</button><button class="btn danger grow rip" data-act="mk-del" data-id="' + id + '">Delete</button></div>')
    );
  }

  ui.actions['mk-seg'] = (el) => { view.seg = el.dataset.v; S.app.refresh(true); };
  ui.actions['mk-sub'] = (el) => { view.sub = el.dataset.v; S.app.refresh(true); };
  ui.actions['mk-new'] = (el) => openForm(el.dataset.type, null);
  ui.actions['mk-slot'] = (el) => {
    const type = el.dataset.type;
    const n = Number(el.dataset.n);
    const at = ofType(type).filter((m) => m.slot === n);
    if (!at.length) return openForm(type, n);
    const cfg = D.MOCKS[type];
    ui.sheet.open({
      title: cfg.label + ' ' + n,
      html:
        '<ul class="atts">' + at.slice().reverse().map(attemptRow).join('') + '</ul>' +
        '<button class="btn primary block rip" data-act="mk-again" data-type="' + type + '" data-n="' + n + '">' + u.icon('plus') + 'Add another attempt</button>',
    });
  };
  ui.actions['mk-again'] = (el) => {
    const t = el.dataset.type;
    const n = Number(el.dataset.n);
    ui.sheet.close();
    setTimeout(() => openForm(t, n), 260);
  };
  ui.actions['mk-view'] = (el) => {
    const m = items().filter((x) => x.id === el.dataset.id)[0];
    if (!m) return;
    const html = detailHtml(m.id);
    if (ui.sheet.isOpen()) ui.sheet.update({ title: m.title, html: html });
    else ui.sheet.open({ title: m.title, html: html, tall: true });
  };
  ui.actions['mk-edit'] = (el) => {
    const m = items().filter((x) => x.id === el.dataset.id)[0];
    if (!m) return;
    ui.sheet.close();
    setTimeout(() => openForm(m.type, m.slot, m), 260);
  };
  ui.actions['mk-weak'] = (el) => {
    const id = el.dataset.id;
    if (draft.weak.has(id)) draft.weak.delete(id);
    else draft.weak.add(id);
    el.setAttribute('aria-pressed', draft.weak.has(id));
  };
  ui.actions['mk-bm'] = (el) => {
    store.mutate('bookmarks', (b) => {
      if (b.mocks[el.dataset.id]) delete b.mocks[el.dataset.id];
      else b.mocks[el.dataset.id] = 1;
    });
    ui.sheet.update({ html: detailHtml(el.dataset.id) });
  };
  ui.actions['mk-err'] = (el) => {
    const m = items().filter((x) => x.id === el.dataset.id)[0];
    ui.sheet.close();
    setTimeout(() => S.errorsUI.openForm({ from: m.title, subj: m.type === 'cet' || m.type === 'jee' ? 'phy' : m.type }), 260);
  };
  ui.actions['mk-del'] = async (el) => {
    const id = el.dataset.id;
    const m = items().filter((x) => x.id === id)[0];
    const att = m.attemptId ? S.tc.get(m.attemptId) : null;
    const ok = await ui.confirm({ title: 'Delete this attempt?', text: m.title + ' (' + pct(m) + '%) will be removed' + (att ? ', with its full result and answer key.' : '.'), ok: 'Delete', danger: true });
    if (!ok) return;
    const copy = JSON.parse(JSON.stringify(m));
    const attCopy = att ? JSON.parse(JSON.stringify(att)) : null;
    store.mutate('mocks', (d) => (d.items = d.items.filter((x) => x.id !== id)));
    if (att) S.tc.deleteAttempt(att.id);
    ui.toast('Attempt deleted', {
      action: 'Undo',
      fn: () => {
        store.mutate('mocks', (d) => d.items.push(copy));
        if (attCopy) store.mutate('attempts', (d) => d.items.push(attCopy));
      },
    });
  };
  ui.actions['mk-result'] = (el) => {
    ui.sheet.close();
    S.tcUI.goAfterSheet('#/result/' + el.dataset.id);
  };
  ui.actions['mk-save'] = () => {
    const form = u.$('[data-form="mock"]');
    const v = ui.values(form);
    const err = (t) => { u.$('#mk-err').textContent = t; };
    const score = parseFloat(v.score);
    const total = parseFloat(v.total);
    if (!Number.isFinite(score)) return err('Enter your score.');
    if (!(total > 0)) return err('Total marks must be more than zero.');
    if (score > total) return err('Score cannot be more than total marks.');
    if (score < -total) return err('Score is too low to be valid.');
    const opt = (x) => (x === '' || x == null || !Number.isFinite(parseFloat(x)) ? null : parseFloat(x));
    const correct = opt(v.correct);
    const wrong = opt(v.wrong);
    if ((correct != null && correct < 0) || (wrong != null && wrong < 0)) return err('Correct and wrong cannot be negative.');
    const cfg = D.MOCKS[draft.type];
    const isMain = draft.type === 'cet' || draft.type === 'jee';
    const title = isMain ? cfg.label + ' ' + draft.slot : (v.title || '').trim() || cfg.label + ' ' + (ofType(draft.type).length + 1);
    const rec = {
      id: draft.id || u.uid(), type: draft.type, slot: draft.slot, title: title,
      date: v.date || u.today(), score: score, total: total, min: Math.max(0, Math.round(u.num(v.min, 0))),
      correct: correct, wrong: wrong,
      marks: isMain ? { phy: opt(v.m_phy), chem: opt(v.m_chem), mth: opt(v.m_mth) } : {},
      weak: Array.from(draft.weak), note: (v.note || '').slice(0, 1000),
    };
    store.mutate('mocks', (d) => {
      const i = d.items.findIndex((x) => x.id === rec.id);
      if (i >= 0) d.items[i] = rec;
      else d.items.push(rec);
    });
    u.haptic('ok');
    const first = items().length === 1;
    ui.sheet.close();
    ui.toast(pct(rec) + '% saved for ' + title);
    if (first) setTimeout(() => ui.confetti(60), 300);
  };

  S.testsUI = { openForm: openForm };
})((window.SOS = window.SOS || {}));

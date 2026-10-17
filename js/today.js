/* today.js — what the Home "Today" card suggests. No DOM here (views-home.js draws it).
 *
 * Three rows, each from data the app already has (no new store domain):
 *   video     the last video she watched (Learn hub), with its position; if it is already watched and
 *             it is part of a JR College series, the next lecture instead.
 *   revision  spaced-revision items due today or overdue (engine E.due(): chapters and Error Notebook).
 *   practice  one practice set: the first chapter, in this order, that has MCQs in the bank:
 *               1. a chapter due for revision today or overdue,
 *               2. a chapter in today's planner day,
 *               3. a done chapter, the one with the most questions she has not tried yet.
 * Any row can be null; the card then says so. The practice row opens the Practice picker with that
 * chapter chosen (she sets the length there). `today` only picks the planner day: revision dates always
 * compare with the real date (engine E.due()).
 */
(function (S) {
  'use strict';
  const D = S.data;
  const E = S.engine;
  const L = S.learn;
  const P = S.practice;

  const SET_SIZE = 10;

  // The video row is the step AFTER the one the Home Continue card shows (L.continueTarget), so the two never name the same
  // lecture: the next lecture of that series, else the start of the chapter Study Next picks, else a plain "last lecture".
  function video() {
    const t = L.continueTarget();
    if (!t) return null;
    const nb = L.neighbors(t.ch, t.v.id);
    if (nb.next) return { kind: 'next', ch: t.ch, v: nb.next, from: t.v, pos: 0 };
    const sn = E.studyNext ? E.studyNext() : null;
    const c = sn && sn.pick && sn.pick.chapter;
    if (c && c.id !== t.ch && !D.COMING_SOON[c.subj]) {
      const wt = L.watchTarget(c.id);
      if (wt) return { kind: 'next-chapter', ch: c.id, v: wt.v, from: t.v, pos: 0 };
    }
    return { kind: 'last', ch: t.ch, from: t.v };
  }

  function revision(today) {
    const items = E.due().filter((i) => i.late >= 0);
    if (!items.length) return null;
    return { count: items.length, overdue: items.filter((i) => i.late > 0).length, titles: items.slice(0, 3).map((i) => i.title) };
  }

  function practice(today) {
    const has = (id) => !!D.CH[id] && !D.COMING_SOON[D.CH[id].subj] && L.mcqCount(id) > 0;
    const due = E.due().filter((i) => i.kind === 'chapter' && i.late >= 0 && has(i.id));
    if (due.length) return { ch: due[0].id, n: Math.min(SET_SIZE, L.mcqCount(due[0].id)), reason: 'due' };
    const day = D.PLAN_BY_DATE[today];
    if (day) {
      const planned = ['m', 'p', 'c', 's'].map((k) => day[k] && day[k].ch).filter((id) => id && has(id));
      if (planned.length) return { ch: planned[0], n: Math.min(SET_SIZE, L.mcqCount(planned[0])), reason: 'plan' };
    }
    const done = P.doneChapters().filter(has);
    if (done.length) {
      const hist = P.history();
      const fresh = (id) => (S.QUESTIONS || []).filter((q) => q.ch === id && q.type === 'mcq' && !(hist[q.id] && hist[q.id].n)).length;
      const best = done.map((id) => ({ id: id, fresh: fresh(id) })).sort((a, b) => b.fresh - a.fresh)[0];
      return { ch: best.id, n: Math.min(SET_SIZE, L.mcqCount(best.id)), reason: 'done', fresh: best.fresh };
    }
    return null;
  }

  function card(today) {
    today = today || S.u.today();
    return { video: video(), revision: revision(today), practice: practice(today) };
  }

  S.today = { SET_SIZE: SET_SIZE, card: card, video: video, revision: revision, practice: practice };
})((window.SOS = window.SOS || {}));

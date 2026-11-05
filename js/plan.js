/* plan.js — the exam plan: which chapters earn the most CET marks, in what order to study them, and how many hours a day
 * that needs. No DOM (views-plan.js draws it). The weights come from the owner's tracker (data/cet-chapter-tracker.csv,
 * copied into data/estimates.json as cetQ / cetMarks / cetTier by tools/apply_tracker.py). They are estimates from past
 * papers, not an official weightage: the CET Cell publishes none.
 */
(function (S) {
  'use strict';
  const D = S.data;
  const u = S.u;
  const E = S.engine;

  const SUBJECTS = ['phy', 'chem', 'mth'];
  const TIER_RANK = { A: 0, B: 1, C: 2 };
  const TIER_LABEL = { A: 'Must do', B: 'Important', C: 'If time allows' };

  const isDone = (id) => ['done', 'mastered'].indexOf(E.chap(id).s) >= 0;
  const tracked = () => D.CHAPTERS.filter((c) => SUBJECTS.indexOf(c.subj) >= 0 && c.cetTier);

  // Per subject: how many chapters and CET marks sit in each tier, and how much of that is done.
  function tiers() {
    return SUBJECTS.map((s) => {
      const list = tracked().filter((c) => c.subj === s);
      const row = { subj: s, marks: 0, doneMarks: 0, tiers: {} };
      ['A', 'B', 'C'].forEach((t) => {
        const ch = list.filter((c) => c.cetTier === t);
        row.tiers[t] = {
          chapters: ch.length,
          marks: ch.reduce((n, c) => n + c.cetMarks, 0),
          done: ch.filter((c) => isDone(c.id)).length,
          doneMarks: ch.filter((c) => isDone(c.id)).reduce((n, c) => n + c.cetMarks, 0),
        };
      });
      row.marks = list.reduce((n, c) => n + c.cetMarks, 0);
      row.doneMarks = list.filter((c) => isDone(c.id)).reduce((n, c) => n + c.cetMarks, 0);
      return row;
    });
  }

  // Chapters still to do, best first: tier A before B before C, Class 12 before Class 11 inside a tier (80% of CET is
  // Class 12), then more marks first, then book order.
  function order() {
    return tracked()
      .filter((c) => !isDone(c.id))
      .slice()
      .sort((a, b) => TIER_RANK[a.cetTier] - TIER_RANK[b.cetTier] || b.std - a.std || b.cetMarks - a.cetMarks || a.idx - b.idx);
  }

  // Hours left (sum of the chapter estimates), days to the first dated exam, and the hours a day that needs.
  function pace(today) {
    today = today || u.today();
    const todo = tracked().filter((c) => !isDone(c.id));
    const hoursAll = todo.reduce((n, c) => n + (c.hours || 0), 0);
    const hoursA = todo.filter((c) => c.cetTier === 'A').reduce((n, c) => n + (c.hours || 0), 0);
    const dated = S.exams.list().filter((e) => S.exams.validDate(e.date) && u.diffDays(e.date, today) > 0 && ['jee', 'hsc'].indexOf(e.id) >= 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const next = dated[0] || null;
    const days = next ? u.diffDays(next.date, today) : null;
    const per = (h) => (days ? Math.round((h / days) * 10) / 10 : null);
    return { hoursAll: hoursAll, hoursA: hoursA, exam: next, days: days, perDayAll: per(hoursAll), perDayA: per(hoursA) };
  }

  // CET marks the done chapters stand for, out of 200 (an estimate).
  function marksCovered() {
    const list = tracked();
    return { done: list.filter((c) => isDone(c.id)).reduce((n, c) => n + c.cetMarks, 0), total: list.reduce((n, c) => n + c.cetMarks, 0) };
  }

  S.plan = { TIER_LABEL: TIER_LABEL, tiers: tiers, order: order, pace: pace, marksCovered: marksCovered };
})((window.SOS = window.SOS || {}));

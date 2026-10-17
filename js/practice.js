/* practice.js — untimed Practice engine. No DOM here (views-practice.js draws the screens).
 *
 * One question at a time; after she answers, the answer locks and the result + solution show at
 * once. Options are shuffled once per question and persisted on the row (`order`, `lay`), by the
 * very same row() Test Center uses; right/wrong comes from Test Center's isCorrect() (so numerical
 * tolerance is `q.tol`, the same function and the same field). Pure functions take `now` and `rng`.
 *
 * Store domain `practice` = { active, items, seen, flags }:
 *   active  the ONE unfinished session, or null. A session is
 *           { id, v, chapters[], diff, len, includeNum, qids?, date, startedAt, finishedAt, status,
 *             pos, questions[] } and a question row is a Test Center row plus
 *           { done, skipped, counted }. `counted` makes the daily question count happen exactly once
 *           per question, so resuming after a quit can never double count.
 *   items   the last 60 finished sessions, compact (counts, per-chapter, the wrong rows).
 *   seen    { [qid]: { n, w, last } } answers given in Practice (n answered, w wrong, last ISO date).
 *   flags   [{ qid, note, date }], one per question (see flagQuestion).
 *
 * Order of a session: questions she has never answered first, then ones she has missed before
 * (wrong at least once), then ones she has only ever got right; shuffled within each group.
 * History = `practice.seen` merged with submitted Test Center attempts. No repeats in a session.
 */
(function (S) {
  'use strict';
  const D = S.data;
  const u = S.u;
  const store = S.store;
  const E = S.engine;
  const TC = S.tc;

  const KEEP = 60;
  const LENGTHS = [10, 20, 0]; // 0 = all
  const dom = () => store.get('practice');

  const isDone = (id) => ['done', 'mastered'].indexOf(E.chap(id).s) >= 0;
  // "My done chapters that have questions".
  function doneChapters() {
    return TC.chaptersWithQuestions().filter(isDone);
  }

  /* ---------- history ---------- */
  function history() {
    const h = {};
    const seen = dom().seen;
    Object.keys(seen).forEach((q) => (h[q] = { n: seen[q].n, w: seen[q].w }));
    store.get('attempts').items.forEach((a) => {
      if (a.status !== 'submitted') return;
      a.questions.forEach((r) => {
        if (r.sel == null) return;
        const x = h[r.qid] || (h[r.qid] = { n: 0, w: 0 });
        x.n++;
        if (r.ok === false) x.w++;
      });
    });
    return h;
  }
  const kindOf = (x) => (!x || !x.n ? 'new' : x.w > 0 ? 'missed' : 'right');

  /* ---------- selection ---------- */
  // opts: { chapters[], diff: 'all'|1|2|3, includeNum, len: 10|20|0, qids? }
  function candidates(opts) {
    const bank = TC.bankById();
    if (opts.qids) return opts.qids.map((id) => bank[id]).filter(Boolean);
    const set = new Set(opts.chapters || []);
    return (S.QUESTIONS || []).filter(
      (q) => set.has(q.ch) && (!opts.diff || opts.diff === 'all' || q.diff === Number(opts.diff)) && (opts.includeNum || q.type === 'mcq')
    );
  }
  // For the picker: "N new, M missed before, K seen" over everything the filters allow.
  function counts(opts, hist) {
    hist = hist || history();
    const c = { total: 0, fresh: 0, missed: 0, seen: 0 };
    candidates(opts).forEach((q) => {
      const k = kindOf(hist[q.id]);
      c.total++;
      if (k === 'new') c.fresh++;
      else {
        c.seen++;
        if (k === 'missed') c.missed++;
      }
    });
    return c;
  }
  function select(opts, hist, rng) {
    hist = hist || history();
    rng = rng || Math.random;
    const g = { new: [], missed: [], right: [] };
    candidates(opts).forEach((q) => g[kindOf(hist[q.id])].push(q));
    const ordered = TC.shuffle(g.new, rng).concat(TC.shuffle(g.missed, rng), TC.shuffle(g.right, rng));
    return opts.len ? ordered.slice(0, opts.len) : ordered;
  }

  /* ---------- session (pure) ---------- */
  function build(opts, env) {
    const qs = select(opts, null, env.rng);
    if (!qs.length) return null;
    const chapters = opts.chapters && opts.chapters.length ? opts.chapters.slice() : Array.from(new Set(qs.map((q) => q.ch)));
    return {
      id: u.uid(), v: 1, chapters: chapters, diff: opts.diff || 'all', len: opts.len || 0, includeNum: !!opts.includeNum,
      date: u.iso(new Date(env.now)), startedAt: env.now, finishedAt: null, status: 'active', pos: 0,
      questions: qs.map((q) => Object.assign(TC.row(q, 0, env.rng), { done: false, skipped: false, counted: false })),
    };
  }

  // Locks the answer, scores it with Test Center's isCorrect, and (once per question) logs it to
  // the daily question count and the answer history. Returns false if already locked / bad input.
  function answerRow(a, i, sel, now) {
    const r = a.questions[i];
    if (!r || r.done) return false;
    if (sel === '' || sel == null) return false;
    const n = Number(sel);
    if (!Number.isFinite(n)) return false;
    r.sel = n;
    r.ok = TC.isCorrect(r, TC.bankById()[r.qid]);
    r.done = true;
    r.at = now;
    return true;
  }
  function skipRow(a, i) {
    const r = a.questions[i];
    if (!r || r.done) return false;
    r.done = true;
    r.skipped = true;
    return true;
  }
  const allDone = (a) => a.questions.every((r) => r.done);
  const nextOpen = (a) => a.questions.findIndex((r) => !r.done);

  function summarize(a) {
    const perCh = {};
    const wrongRows = [];
    let answered = 0;
    let correct = 0;
    let skipped = 0;
    a.questions.forEach((r) => {
      if (r.skipped) return skipped++;
      if (!r.done) return;
      answered++;
      const p = perCh[r.ch] || (perCh[r.ch] = [0, 0]);
      p[0]++;
      if (r.ok) {
        correct++;
        p[1]++;
      } else {
        const w = { qid: r.qid, ch: r.ch, subj: r.subj, type: r.type, sel: r.sel, ans: r.ans };
        if (r.order) w.order = r.order;
        if (r.lay) w.lay = r.lay;
        wrongRows.push(w);
      }
    });
    return {
      id: a.id, date: a.date, startedAt: a.startedAt, finishedAt: a.finishedAt, chapters: a.chapters,
      n: a.questions.length, answered: answered, correct: correct, wrong: answered - correct, skipped: skipped,
      perCh: perCh, wrongRows: wrongRows,
    };
  }

  /* ---------- store layer ---------- */
  const env = () => ({ now: Date.now(), rng: Math.random });
  const active = () => dom().active;

  function start(opts, envOverride) {
    const cur = active();
    if (cur) return { ok: false, reason: 'active', session: cur };
    const e = Object.assign(env(), envOverride || {});
    const a = build(opts, e);
    if (!a) return { ok: false, reason: 'empty', error: 'No questions match these choices.' };
    store.mutate('practice', (d) => (d.active = a));
    store.flush();
    return { ok: true, session: a };
  }

  function withActive(fn) {
    return store.mutate('practice', (d) => (d.active ? fn(d.active) : null));
  }

  // The write that matters: answer + history + daily count, together, exactly once per question.
  function answer(i, sel, now) {
    now = now == null ? Date.now() : now;
    let res = false;
    store.mutate('practice', (d) => {
      const a = d.active;
      if (!a || !answerRow(a, i, sel, now)) return;
      res = true;
      const r = a.questions[i];
      if (!r.counted) {
        r.counted = true;
        const x = d.seen[r.qid] || (d.seen[r.qid] = { n: 0, w: 0, last: '' });
        x.n++;
        if (!r.ok) x.w++;
        x.last = u.iso(new Date(now));
        E.logStudy({ mcq: 1, subj: r.subj, date: u.iso(new Date(now)) });
      }
    });
    if (res) store.flush();
    return res;
  }
  function skip(i) {
    let res = false;
    withActive((a) => (res = skipRow(a, i)));
    store.flush();
    return res;
  }

  // Finish: move the session into `items` (last 60) and clear `active`. Returns the compact row.
  function finish(now) {
    now = now == null ? Date.now() : now;
    let item = null;
    store.mutate('practice', (d) => {
      const a = d.active;
      if (!a) return;
      a.questions.forEach((r) => {
        if (!r.done) {
          r.done = true; // ending early: whatever is still open counts as skipped
          r.skipped = true;
        }
      });
      a.finishedAt = now;
      a.status = 'done';
      item = summarize(a);
      d.items.push(item);
      if (d.items.length > KEEP) d.items.splice(0, d.items.length - KEEP);
      d.active = null;
    });
    store.flush();
    return item;
  }
  function discardActive() {
    store.mutate('practice', (d) => (d.active = null));
    store.flush();
  }

  /* ---------- Error Notebook ---------- */
  // One wrong question of the running session -> Error Notebook (de-duplicated by TC.logErrorRow).
  function logErrorActive(i) {
    const a = active();
    const r = a && a.questions[i];
    if (!r || !r.done || r.skipped || r.ok) return { ok: false, reason: 'not-wrong' };
    return TC.logErrorRow(r, { practiceId: a.id, qid: r.qid, ch: r.ch });
  }
  // "Add all N wrong to the Error Notebook" for a finished session.
  function logAllWrong(itemId) {
    const it = dom().items.filter((x) => x.id === itemId)[0];
    const out = { added: 0, duplicate: 0 };
    if (!it) return out;
    it.wrongRows.forEach((r) => {
      const res = TC.logErrorRow(r, { practiceId: it.id, qid: r.qid, ch: r.ch });
      if (res.ok) out.added++;
      else out.duplicate++;
    });
    return out;
  }
  const lastItem = () => dom().items[dom().items.length - 1] || null;

  /* ---------- flagged questions ---------- */
  // One flag per question: { qid, note, date }. Lives in `practice.flags`, so it is part of every
  // export (Send to coach) and shows in coach view with no extra code.
  const flags = () => dom().flags;
  const flagOf = (qid) => dom().flags.filter((f) => f.qid === qid)[0] || null;
  function flag(qid, note, now) {
    now = now == null ? Date.now() : now;
    const f = { qid: qid, note: String(note || '').trim().slice(0, 300), date: u.iso(new Date(now)) };
    store.mutate('practice', (d) => {
      d.flags = d.flags.filter((x) => x.qid !== qid);
      d.flags.push(f);
    });
    return f;
  }
  function unflag(qid) {
    store.mutate('practice', (d) => (d.flags = d.flags.filter((x) => x.qid !== qid)));
  }

  S.practice = {
    flags: flags, flagOf: flagOf, flag: flag, unflag: unflag,
    KEEP: KEEP, LENGTHS: LENGTHS, doneChapters: doneChapters, history: history, kindOf: kindOf,
    counts: counts, select: select, build: build, answerRow: answerRow, skipRow: skipRow, summarize: summarize,
    allDone: allDone, nextOpen: nextOpen,
    start: start, active: active, withActive: withActive, answer: answer, skip: skip, finish: finish, discardActive: discardActive,
    logErrorActive: logErrorActive, logAllWrong: logAllWrong, lastItem: lastItem,
  };
})((window.SOS = window.SOS || {}));

/* testcenter.js — Test Center engine: build tests, run the exam clock, score, and store
 * attempts. No DOM here (views-testcenter.js draws the screens).
 *
 * The pure functions take `now` (ms) and `rng` so tests can drive the clock. The store
 * layer at the bottom (S.tc.*) persists to the `attempts` domain and keeps exactly one
 * active attempt.
 *
 * Attempt schema v1 (store domain `attempts` = { activeId, items: Attempt[] }):
 *   { id, v, mode, title, chapters[], date, startedAt, submittedAt, status, submitReason,
 *     rules, sections[], pos, questions[], score, maxScore, correct, wrong, unanswered,
 *     bySubj, sample, short, retryOf, mockId }
 *   rules    { [subj]: { mcq: [plus, minus], num: [plus, minus] } } — keyed by subject, not
 *            section: a practice test can mix Chemistry (+1) and Maths (+2) in one section.
 *            Copied into the attempt at start so later setting changes never rescore it.
 *   section  { key, label, subjects[], qIdx[], end (absolute ms), lockedAt (ms|null) }
 *   pos      { sec, qi, since (ms the current question was entered, or null while hidden) }
 *   question { qid, ch, subj, type, diff, sec, sel, ans, ok, marks, vis, mk, tMs, sample }
 */
(function (S) {
  'use strict';
  const D = S.data;
  const u = S.u;
  const store = S.store;
  const E = S.engine;

  const MIN = 60000;
  const PRACTICE_MIN_PER_Q = 1.5;

  // Section 1 of the CET mock runs its full 90 minutes whatever her progress: there is no
  // "finish section early", and Maths only opens at 90:00. ASSUMPTION from research into the
  // MHT-CET CBT, not a confirmed rule. Revisit if the official CET mock / admit-card
  // instructions say otherwise. (Also noted in README.)
  const CET = [
    { key: 's1', label: 'Physics + Chemistry', subjects: ['phy', 'chem'], target: 100, mins: 90 },
    { key: 's2', label: 'Maths', subjects: ['mth'], target: 50, mins: 90 },
  ];
  // JEE: one continuous 180-minute clock over all three subjects; she moves freely.
  const JEE = { mins: 180, perSubj: { mcq: 20, num: 5 }, subjects: ['phy', 'chem', 'mth'] };

  const MODES = {
    chapter: { label: 'Chapter test', defaultN: 20 },
    mix: { label: 'Custom mix', defaultN: 20 },
    quick: { label: 'Quick 10', defaultN: 10, mins: 10 },
    cet: { label: 'CET-pattern mock' },
    jee: { label: 'JEE-pattern mock' },
    retry: { label: 'Retry wrong questions' },
  };

  /* ---------- marking ---------- */
  // CET: Physics/Chemistry +1, Maths +2, no negative marking anywhere.
  function cetRules() {
    return {
      phy: { mcq: [1, 0], num: [1, 0] },
      chem: { mcq: [1, 0], num: [1, 0] },
      mth: { mcq: [2, 0], num: [2, 0] },
    };
  }
  // JEE: MCQ +4 / −1. Numerical +4, and −1 on a wrong answer only if the setting says so.
  function jeeRules(numNeg) {
    const r = { mcq: [4, -1], num: [4, numNeg ? -1 : 0] };
    return { phy: clone(r), chem: clone(r), mth: clone(r) };
  }
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function isCorrect(row, q) {
    if (row.sel == null) return null;
    if (row.type === 'mcq') return row.sel === row.ans;
    const tol = (q && q.tol) || 0;
    return Math.abs(Number(row.sel) - row.ans) <= tol + 1e-9;
  }

  /* ---------- question pool ---------- */
  function bankById() {
    const m = {};
    (S.QUESTIONS || []).forEach((q) => (m[q.id] = q));
    return m;
  }
  function pool(chIds) {
    const set = new Set(chIds);
    return (S.QUESTIONS || []).filter((q) => set.has(q.ch));
  }
  // Real MHT-CET has no numerical-entry questions — every question is MCQ. Used for every
  // CET-marked test (chapter/mix default, quick, and the CET mock). JEE-marked tests draw
  // both types (the JEE mock builds mcq/num separately per its own pattern already).
  function cetPool(chIds) {
    return pool(chIds).filter((q) => q.type === 'mcq');
  }
  // Chapters that can be tested: not CS, and with at least one question in the bank.
  function chaptersWithQuestions() {
    const has = new Set((S.QUESTIONS || []).map((q) => q.ch));
    return D.CHAPTERS.filter((c) => c.subj !== 'cs' && has.has(c.id)).map((c) => c.id);
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  function take(list, n, rng) {
    return shuffle(list, rng).slice(0, Math.max(0, n));
  }

  // Split `total` over chapters in proportion to weight, never above a chapter's cap.
  // Largest-remainder rounding, then any shortfall from capped chapters goes to those with
  // spare questions (again by weight). Returns { chId: count }.
  function apportion(total, weights, caps) {
    const ids = Object.keys(weights);
    const out = {};
    ids.forEach((id) => (out[id] = 0));
    let left = Math.min(total, ids.reduce((n, id) => n + caps[id], 0));
    while (left > 0) {
      const open = ids.filter((id) => out[id] < caps[id]);
      const wsum = open.reduce((n, id) => n + weights[id], 0);
      const raw = open.map((id) => ({ id: id, x: wsum > 0 ? (left * weights[id]) / wsum : left / open.length }));
      let given = 0;
      raw.forEach((r) => {
        const g = Math.min(Math.floor(r.x), caps[r.id] - out[r.id]);
        out[r.id] += g;
        given += g;
      });
      let rest = left - given;
      raw.sort((a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x)) || weights[b.id] - weights[a.id]);
      for (let i = 0; rest > 0 && i < raw.length; i++) {
        if (out[raw[i].id] < caps[raw[i].id]) {
          out[raw[i].id]++;
          rest--;
          given++;
        }
      }
      if (given === 0) break;
      left -= given;
    }
    return out;
  }

  /* ---------- building an attempt ---------- */
  // MCQ options are shuffled once, here, when the attempt is built. `order` lists the ORIGINAL
  // option indexes in the order they are displayed; it is persisted on the row and never
  // re-derived on render, so a resumed attempt shows the same order. `sel` and `ans` on the row
  // are DISPLAYED indexes (ans = where the correct option landed), so scoring compares them
  // directly. A row without `order` (an attempt made before this) is the identity order.
  // Bank option layout of rows built by this code: options are stored in a neutral order (see
  // tools/questions/permute-options.py). Rows without `lay` were built when the bank stored the
  // correct answer first; their `order` (original option indexes) and displayed `ans` refer to that
  // old layout, which question.legacy translates to the current one (legacy[i] = where the option
  // that used to be at index i is now). Without this, old result keys would show the wrong options.
  const BANK_LAYOUT = 2;
  function row(q, sec, rng) {
    const order = q.type === 'mcq' ? shuffle(q.options.map((_, i) => i), rng) : null;
    const r = {
      qid: q.id, ch: q.ch, subj: D.CH[q.ch].subj, type: q.type, diff: q.diff, sec: sec,
      sel: null, ans: order ? order.indexOf(q.ans) : q.ans, ok: null, marks: 0, vis: false, mk: false, tMs: 0, sample: !!q.sample,
    };
    if (q.type === 'mcq') r.lay = BANK_LAYOUT;
    if (order) r.order = order;
    return r;
  }
  // The options of question `q` in the order row `r` displayed them.
  function shownOptions(r, q) {
    const base = r.order || q.options.map((_, i) => i);
    const legacy = r.lay === BANK_LAYOUT || !Array.isArray(q.legacy) ? null : q.legacy;
    return base.map((i) => q.options[legacy ? legacy[i] : i]);
  }

  function newAttempt(mode, title, chapters, rules, now) {
    return {
      id: u.uid(), v: 1, mode: mode, title: title, chapters: chapters,
      date: u.iso(new Date(now)), startedAt: now, submittedAt: null, status: 'active', submitReason: null,
      rules: rules, sections: [], pos: { sec: 0, qi: 0, since: null }, questions: [],
      score: null, maxScore: null, correct: null, wrong: null, unanswered: null, bySubj: {},
      sample: false, short: false, retryOf: null, mockId: null,
    };
  }

  function addSection(a, def, qs, end, rng) {
    const sec = a.sections.length;
    const start = a.questions.length;
    qs.forEach((q) => a.questions.push(row(q, sec, rng)));
    a.sections.push({
      key: def.key, label: def.label, subjects: def.subjects,
      qIdx: qs.map((_, i) => start + i), end: end, lockedAt: null,
    });
  }

  function practiceSection(a, qs, now, mins, rng) {
    const subjects = Array.from(new Set(qs.map((q) => D.CH[q.ch].subj)));
    addSection(a, { key: 'all', label: a.title, subjects: subjects }, qs, now + mins * MIN, rng);
  }

  function fail(msg) {
    const e = new Error(msg);
    e.tc = true;
    return e;
  }

  // opts: { chapters?, n?, marking?: 'cet'|'jee', attempt? (for retry), checkpoint? (chapter mode) }
  // env:  { now, rng, jeeNumNeg }
  function build(mode, opts, env) {
    opts = opts || {};
    const now = env.now;
    const rng = env.rng || Math.random;
    const practiceRules = () => (opts.marking === 'jee' ? jeeRules(env.jeeNumNeg) : cetRules());
    let a;

    if (mode === 'chapter') {
      const id = (opts.chapters || [])[0];
      if (!D.CH[id]) throw fail('Pick a chapter.');
      const isJee = opts.marking === 'jee';
      const p = isJee ? pool([id]) : cetPool([id]);
      if (!p.length) throw fail(D.CH[id].name + ' has no questions yet.');
      const n = Math.min(opts.n || MODES.chapter.defaultN, p.length);
      a = newAttempt(mode, D.CH[id].name + (opts.checkpoint ? ' · checkpoint' : ' · chapter test'), [id], practiceRules(), now);
      // Learn hub "Checkpoint" step: a short chapter test, told apart from the full one by this flag.
      if (opts.checkpoint) a.checkpoint = true;
      practiceSection(a, take(p, n, rng), now, n * PRACTICE_MIN_PER_Q, rng);
    } else if (mode === 'mix') {
      const ids = (opts.chapters || []).filter((id) => D.CH[id]);
      if (ids.length < 2) throw fail('Pick at least two chapters for a custom mix.');
      const isJee = opts.marking === 'jee';
      const chapterPool = (id) => (isJee ? pool([id]) : cetPool([id]));
      const weights = {};
      const caps = {};
      ids.forEach((id) => {
        weights[id] = D.CH[id].w;
        caps[id] = chapterPool(id).length;
      });
      const alloc = apportion(opts.n || MODES.mix.defaultN, weights, caps);
      const qs = [];
      ids.forEach((id) => take(chapterPool(id), alloc[id], rng).forEach((q) => qs.push(q)));
      if (!qs.length) throw fail('None of those chapters has questions yet.');
      a = newAttempt(mode, 'Custom mix · ' + ids.length + ' chapters', ids, practiceRules(), now);
      practiceSection(a, shuffle(qs, rng), now, qs.length * PRACTICE_MIN_PER_Q, rng);
    } else if (mode === 'quick') {
      // Quick 10 always uses CET marking (mcq only); the JEE practice toggle is only on chapter/mix.
      const ids = (opts.chapters || []).filter((id) => D.CH[id]);
      const p = cetPool(ids);
      if (!p.length) throw fail('None of your done chapters has questions yet.');
      const qs = take(p, MODES.quick.defaultN, rng);
      a = newAttempt(mode, 'Quick 10', Array.from(new Set(qs.map((q) => q.ch))), cetRules(), now);
      practiceSection(a, qs, now, MODES.quick.mins, rng);
    } else if (mode === 'cet') {
      const ids = opts.chapters || chaptersWithQuestions();
      a = newAttempt(mode, MODES.cet.label, ids, cetRules(), now);
      let end = now;
      let have = 0;
      let target = 0;
      CET.forEach((def) => {
        const p = cetPool(ids).filter((q) => def.subjects.indexOf(D.CH[q.ch].subj) >= 0);
        target += def.target;
        if (!p.length) return; // section absent from the data: leave it out
        const qs = take(p, Math.min(def.target, p.length), rng);
        have += qs.length;
        end += def.mins * MIN;
        addSection(a, def, qs, end, rng);
      });
      if (!a.sections.length) throw fail('No Physics, Chemistry or Maths questions yet.');
      finishShort(a, have, target);
    } else if (mode === 'jee') {
      const ids = opts.chapters || chaptersWithQuestions();
      a = newAttempt(mode, MODES.jee.label, ids, jeeRules(env.jeeNumNeg), now);
      const qs = [];
      let target = 0;
      JEE.subjects.forEach((s) => {
        ['mcq', 'num'].forEach((type) => {
          target += JEE.perSubj[type];
          const p = pool(ids).filter((q) => D.CH[q.ch].subj === s && q.type === type);
          take(p, Math.min(JEE.perSubj[type], p.length), rng).forEach((q) => qs.push(q));
        });
      });
      if (!qs.length) throw fail('No Physics, Chemistry or Maths questions yet.');
      const subjects = JEE.subjects.filter((s) => qs.some((q) => D.CH[q.ch].subj === s));
      addSection(a, { key: 'all', label: 'Physics · Chemistry · Maths', subjects: subjects }, qs, now + JEE.mins * MIN, rng);
      finishShort(a, qs.length, target);
    } else if (mode === 'retry') {
      const src = opts.attempt;
      if (!src || src.status !== 'submitted') throw fail('Only a finished test can be retried.');
      const bank = bankById();
      const qs = src.questions.filter((r) => r.ok === false && bank[r.qid]).map((r) => bank[r.qid]);
      if (!qs.length) throw fail('No wrong answers to retry.');
      // Explicit: a retry keeps the marking scheme of the attempt it retries. It must never
      // fall through to a mode default, or a JEE-marked test would be retried with CET marks.
      const rules = clone(src.rules);
      a = newAttempt(mode, 'Retry: ' + src.title, Array.from(new Set(qs.map((q) => q.ch))), rules, now);
      a.retryOf = src.id;
      practiceSection(a, qs, now, qs.length * PRACTICE_MIN_PER_Q, rng);
    } else {
      throw fail('Unknown test mode "' + mode + '".');
    }

    a.sample = a.questions.some((r) => r.sample);
    return a;
  }

  // A mock shorter than the real paper (because the bank doesn't have enough questions yet)
  // is labelled as such. Length = min(target, questions available), decided here, at build.
  function finishShort(a, have, target) {
    if (have < target) {
      a.short = true;
      a.title += ' (short: ' + have + ' of ' + target + ' questions)';
    }
  }

  /* ---------- the clock ---------- */
  function section(a) {
    return a.sections[a.pos.sec];
  }
  function timeLeft(a, now) {
    const s = section(a);
    return s ? u.deadline.left(s.end, now) : 0;
  }

  // Add the time since the current question was entered, but never past its section's end.
  function accrue(a, now) {
    if (a.pos.since == null) return;
    const s = a.sections[a.questions[a.pos.qi].sec];
    const until = Math.min(now, s.end);
    if (until > a.pos.since) a.questions[a.pos.qi].tMs += until - a.pos.since;
    a.pos.since = now;
  }

  // Bring an attempt up to date with the wall clock: lock every section whose end has
  // passed (in order), move to the next section, and submit when the last one has ended.
  // Called on every tick AND on every foreground / route render, so a boundary crossed
  // while the app was closed is applied before anything paints.
  //
  // DELIBERATE DIVERGENCE from the Focus timer: Focus discards a session that ended more
  // than MAX_LATE_MS before the app reopened. Exams never do that. However long the app was
  // closed, an active attempt is always auto-submitted with whatever was answered. Do not
  // "fix" this to match Focus.
  function catchUp(a, now) {
    if (a.status !== 'active') return { changed: false, submitted: false };
    let changed = false;
    while (a.pos.sec < a.sections.length && u.deadline.due(section(a).end, now)) {
      const s = section(a);
      accrue(a, s.end);
      s.lockedAt = s.end;
      changed = true;
      if (a.pos.sec === a.sections.length - 1) {
        submit(a, s.end, 'time');
        return { changed: true, submitted: true };
      }
      a.pos.sec++;
      a.pos.qi = section(a).qIdx[0];
      a.pos.since = null;
    }
    return { changed: changed, submitted: false };
  }

  // Questions she may open right now: only the current section's (a locked section is
  // closed for good, as in the real CBT).
  function canOpen(a, qi) {
    const r = a.questions[qi];
    return !!r && a.status === 'active' && r.sec === a.pos.sec;
  }

  function visit(a, qi, now) {
    if (!canOpen(a, qi)) return false;
    accrue(a, now);
    a.pos.qi = qi;
    a.pos.since = now;
    a.questions[qi].vis = true;
    return true;
  }
  // App hidden, or she navigated within the app to a screen other than #/exam (e.g. Home):
  // stop the per-question stopwatch. The exam clock itself (section end times) is untouched
  // either way — only the time attributed to the question she was on stops accruing.
  function pause(a, now) {
    accrue(a, now);
    a.pos.since = null;
  }
  function resumeQ(a, now) {
    if (a.status === 'active' && a.pos.since == null) {
      a.pos.since = now;
      a.questions[a.pos.qi].vis = true;
    }
  }
  // Store-layer wrapper for the "she left #/exam via in-app navigation" case (app.js calls
  // this from its router, on every route change away from #/exam, in addition to the
  // existing pause-on-backgrounding via visibilitychange). No-op if no attempt is active.
  function leaveExamRoute(now) {
    withActive((a) => pause(a, now));
  }
  function answer(a, qi, sel) {
    if (!canOpen(a, qi)) return false;
    const r = a.questions[qi];
    if (sel === '' || sel == null) r.sel = null;
    else r.sel = r.type === 'mcq' ? Number(sel) : Number(sel);
    if (r.sel != null && !Number.isFinite(r.sel)) r.sel = null;
    return true;
  }
  function toggleMark(a, qi) {
    if (!canOpen(a, qi)) return false;
    a.questions[qi].mk = !a.questions[qi].mk;
    return true;
  }
  // Palette state: nv (not visited), v (visited, unanswered), a (answered), m (marked,
  // unanswered), am (answered and marked).
  function paletteState(r) {
    if (r.mk) return r.sel != null ? 'am' : 'm';
    if (r.sel != null) return 'a';
    return r.vis ? 'v' : 'nv';
  }

  /* ---------- scoring ---------- */
  function score(a) {
    const bank = bankById();
    const out = { score: 0, maxScore: 0, correct: 0, wrong: 0, unanswered: 0, bySubj: {} };
    a.questions.forEach((r) => {
      const rule = a.rules[r.subj][r.type];
      r.ok = isCorrect(r, bank[r.qid]);
      r.marks = r.ok === null ? 0 : r.ok ? rule[0] : rule[1];
      const b = out.bySubj[r.subj] || (out.bySubj[r.subj] = { score: 0, max: 0, correct: 0, wrong: 0 });
      b.score += r.marks;
      b.max += rule[0];
      out.score += r.marks;
      out.maxScore += rule[0];
      if (r.ok === null) out.unanswered++;
      else if (r.ok) {
        out.correct++;
        b.correct++;
      } else {
        out.wrong++;
        b.wrong++;
      }
    });
    return out;
  }

  function submit(a, now, reason) {
    if (a.status !== 'active') return a;
    if (reason === 'manual') accrue(a, now);
    a.pos.since = null;
    // Past-paper answer sheet (js/pyq.js): there is no key yet, so nothing can be scored. It waits for
    // her to enter the key; S.pyq.applyKey scores it and writes the mocks row then.
    if (a.mode === 'pyq') {
      a.status = 'awaiting-key';
      a.submitReason = reason;
      a.submittedAt = now;
      a.sections.forEach((s) => {
        if (s.lockedAt == null) s.lockedAt = now;
      });
      return a;
    }
    Object.assign(a, score(a));
    a.status = 'submitted';
    a.submitReason = reason;
    a.submittedAt = now;
    a.sections.forEach((s) => {
      if (s.lockedAt == null) s.lockedAt = now;
    });
    return a;
  }

  // Accuracy (correct of attempted) grouped by any row field: subj, ch, diff.
  function breakdown(a, field) {
    const g = {};
    a.questions.forEach((r) => {
      const k = r[field];
      const x = g[k] || (g[k] = { key: k, total: 0, attempted: 0, correct: 0, marks: 0 });
      x.total++;
      x.marks += r.marks;
      if (r.ok !== null) {
        x.attempted++;
        if (r.ok) x.correct++;
      }
    });
    return Object.keys(g).map((k) => Object.assign(g[k], { acc: g[k].attempted ? g[k].correct / g[k].attempted : null }));
  }

  // Same rule as book mocks feed into Study Next: a chapter with at least 2 questions where
  // wrong answers outnumber correct ones is tagged weak.
  function weakChapters(a) {
    return breakdown(a, 'ch').filter((x) => x.total >= 2 && x.attempted - x.correct > x.correct).map((x) => x.key);
  }

  function mockType(a) {
    if (a.mode === 'cet' || a.mode === 'jee') return a.mode;
    if (a.mode === 'chapter') return D.CH[a.chapters[0]].subj;
    return 'mix';
  }

  // The compatible summary row every submitted attempt writes into `mocks`, so the Tests
  // tab, Analytics, badges and Study Next keep working without knowing about attempts.
  function summaryRow(a) {
    const marks = {};
    Object.keys(a.bySubj).forEach((s) => (marks[s] = a.bySubj[s].score));
    return {
      id: u.uid(), type: mockType(a), slot: null, title: a.title, date: a.date,
      score: a.score, total: a.maxScore,
      min: Math.max(0, Math.round((a.submittedAt - a.startedAt) / MIN)),
      correct: a.correct, wrong: a.wrong, marks: marks, weak: weakChapters(a), note: '',
      attemptId: a.id,
    };
  }

  // Banner rule, derived from the data: a test shows "Sample questions" when any of its
  // questions is currently sample data in the bank. When a chapter's sample file is
  // replaced by real questions (sample: false), this turns false by itself.
  function usesSample(a) {
    const bank = bankById();
    return a.questions.some((r) => !!(bank[r.qid] && bank[r.qid].sample));
  }
  // How many questions the bank has for one chapter (any type).
  function bankCount(chId) {
    return pool([chId]).length;
  }
  // Length of the chapter test the chapter sheet starts: the default N, capped by the
  // chapter's CET-marked (mcq-only) pool, exactly as build() sizes it.
  function chapterTestLength(chId) {
    return Math.min(MODES.chapter.defaultN, cetPool([chId]).length);
  }
  // How many questions a CET mock over these chapters would get (mcq only, same caps as build()).
  function cetCount(chIds) {
    let n = 0;
    CET.forEach((def) => {
      const p = cetPool(chIds).filter((q) => def.subjects.indexOf(D.CH[q.ch].subj) >= 0);
      n += Math.min(def.target, p.length);
    });
    return n;
  }
  // How many questions a JEE mock over these chapters would get (same caps as build()).
  function jeeCount(chIds) {
    const p = pool(chIds);
    let n = 0;
    JEE.subjects.forEach((s) => ['mcq', 'num'].forEach((type) => {
      n += Math.min(JEE.perSubj[type], p.filter((q) => D.CH[q.ch].subj === s && q.type === type).length);
    }));
    return n;
  }
  function chapterHasSample(chId) {
    return pool([chId]).some((q) => q.sample);
  }

  /* ---------- store layer ---------- */
  const env = () => ({ now: Date.now(), rng: Math.random, jeeNumNeg: !!store.get('profile').testCenter.jeeNumNeg });

  function all() {
    return store.get('attempts');
  }
  function get(id) {
    return all().items.filter((x) => x.id === id)[0] || null;
  }
  function active() {
    const d = all();
    const a = d.activeId ? get(d.activeId) : null;
    return a && a.status === 'active' ? a : null;
  }

  // Exactly one active attempt. Starting while one is running never overwrites or
  // orphans it: the caller gets { ok: false, reason: 'active' } and must resume or
  // explicitly discard first.
  function start(mode, opts, envOverride) {
    sync();
    const cur = active();
    if (cur) return { ok: false, reason: 'active', attempt: cur };
    let a;
    try {
      a = build(mode, opts, envOverride || env());
    } catch (e) {
      if (e.tc) return { ok: false, reason: 'build', error: e.message };
      throw e;
    }
    store.mutate('attempts', (d) => {
      d.items.push(a);
      d.activeId = a.id;
    });
    return { ok: true, attempt: a };
  }

  function discardActive() {
    const cur = active();
    if (!cur) return false;
    store.mutate('attempts', (d) => {
      d.items = d.items.filter((x) => x.id !== cur.id);
      d.activeId = null;
    });
    return true;
  }

  function withActive(fn) {
    const cur = active();
    if (!cur) return null;
    let out;
    store.mutate('attempts', (d) => {
      const a = d.items.filter((x) => x.id === cur.id)[0];
      out = fn(a);
    });
    return out;
  }

  // Once submitted: write the mocks summary row, log the questions answered towards today's
  // total, and clear activeId.
  function finalize(a) {
    if (a.mode === 'pyq') return; // scored and summarised after the key is entered (js/pyq.js)
    const rowOut = summaryRow(a);
    a.mockId = rowOut.id;
    store.mutate('mocks', (m) => m.items.push(rowOut));
    const answered = a.correct + a.wrong;
    if (answered > 0) E.logStudy({ mcq: answered, date: a.date });
  }

  // Apply the wall clock to the active attempt. Safe to call any time, as often as wanted.
  function sync(now) {
    now = now == null ? Date.now() : now;
    const cur = active();
    if (!cur) return null;
    // Read-only check first: the tick calls this every second, and nothing needs writing
    // until a section boundary has actually passed.
    if (!u.deadline.due(section(cur).end, now)) return { changed: false, submitted: false };
    let res = null;
    let done = null;
    store.mutate('attempts', (d) => {
      const a = d.items.filter((x) => x.id === cur.id)[0];
      res = catchUp(a, now);
      if (res.submitted) {
        finalize(a);
        d.activeId = null;
        done = a;
      }
    });
    if (done) store.flush();
    return done ? { submitted: done } : res;
  }

  function submitActive(now) {
    now = now == null ? Date.now() : now;
    const cur = active();
    if (!cur) return null;
    let done = null;
    store.mutate('attempts', (d) => {
      const a = d.items.filter((x) => x.id === cur.id)[0];
      submit(a, now, 'manual');
      finalize(a);
      d.activeId = null;
      done = a;
    });
    store.flush();
    return done;
  }

  function retry(attemptId, envOverride) {
    const src = get(attemptId);
    return start('retry', { attempt: src }, envOverride);
  }

  // One tap: wrong answer -> Error Notebook. De-duplicated by (chapter, question id) across
  // every attempt, so missing the same question again in a retry doesn't add a second row.
  // The chapter compared is src.ch (the question's own chapter, recorded at logging), not the
  // row's chId: she can change chId in the Errors edit form, which would defeat the check.
  function logError(attemptId, qi) {
    const a = get(attemptId);
    const r = a && a.questions[qi];
    if (!r) return { ok: false, reason: 'missing' };
    return logErrorRow(r, { attemptId: attemptId, qid: r.qid, ch: r.ch });
  }
  // Shared by Test Center results and Practice: `r` is a row (qid, ch, subj, type, sel, ans, order,
  // lay) and `src` is stored on the Error Notebook entry (it must carry qid and ch).
  function logErrorRow(r, src) {
    const dup = store.get('errors').items.some((e) => e.src && e.src.qid === r.qid && (e.src.ch || e.chId) === r.ch);
    if (dup) return { ok: false, reason: 'duplicate' };
    const q = bankById()[r.qid];
    // r.sel / r.ans are displayed indexes: write the option TEXT she saw, never a letter.
    const shown = q && r.type === 'mcq' ? shownOptions(r, q) : null;
    const fmt = (v) => (v == null ? 'not answered' : r.type === 'mcq' ? (shown ? shown[v] : 'option ' + (v + 1)) : String(v));
    const date = u.today();
    const item = {
      id: u.uid(), date: date, subj: r.subj, chId: r.ch, chapter: D.CH[r.ch].name,
      question: q ? q.q : '(question no longer in the bank: ' + r.qid + ')',
      concept: 'Your answer: ' + fmt(r.sel) + ' · Correct: ' + fmt(r.ans) + (q ? ' — ' + q.solution : ''),
      reason: '', resolved: false, hasImage: false, revs: 0, srs: S.migrate.makeSrs(date),
      src: src,
    };
    store.mutate('errors', (e) => e.items.push(item));
    return { ok: true, id: item.id };
  }

  // Deleting a Test Center summary row from the Tests tab removes its attempt too.
  function deleteAttempt(id) {
    store.mutate('attempts', (d) => {
      d.items = d.items.filter((x) => x.id !== id);
      if (d.activeId === id) d.activeId = null;
    });
  }

  S.tc = {
    MODES: MODES, CET: CET, JEE: JEE, PRACTICE_MIN_PER_Q: PRACTICE_MIN_PER_Q,
    // pure
    cetRules: cetRules, jeeRules: jeeRules, apportion: apportion, build: build, catchUp: catchUp,
    timeLeft: timeLeft, section: section, canOpen: canOpen, visit: visit, pause: pause, resumeQ: resumeQ,
    answer: answer, toggleMark: toggleMark, paletteState: paletteState, score: score, submit: submit,
    breakdown: breakdown, weakChapters: weakChapters, summaryRow: summaryRow, usesSample: usesSample,
    chapterHasSample: chapterHasSample, row: row, isCorrect: isCorrect, shuffle: shuffle, logErrorRow: logErrorRow, shownOptions: shownOptions, bankCount: bankCount, chapterTestLength: chapterTestLength, cetCount: cetCount, jeeCount: jeeCount, chaptersWithQuestions: chaptersWithQuestions, bankById: bankById,
    // store
    all: all, get: get, active: active, start: start, discardActive: discardActive, withActive: withActive, leaveExamRoute: leaveExamRoute,
    sync: sync, submitActive: submitActive, retry: retry, logError: logError, deleteAttempt: deleteAttempt,
  };
})((window.SOS = window.SOS || {}));

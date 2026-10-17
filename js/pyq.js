/* pyq.js — past-paper answer sheet (OMR) engine. No DOM here (views-pyq.js draws the screens).
 *
 * She solves a real paper on paper (links in data/pyq-sources.json), fills the bubbles on a timed
 * sheet in the app, then types or pastes the answer key. The sheet is a normal Test Center attempt
 * (store domain `attempts`, mode 'pyq', source 'pyq'), so the exam clock, the CET Block 1 lock,
 * auto-submit and "one active attempt" all come from js/testcenter.js unchanged. Differences:
 *   - questions are numbered per subject (Physics 1-50 ...), rows have no bank question (ch: '');
 *   - on submit (or time-up) the status is 'awaiting-key', not 'submitted' (testcenter.submit);
 *   - applyKey() sets the key, scores with the Test Center marking rules, and only then writes the
 *     mocks summary row (type cet/jee) and counts the answered questions for today.
 * A question with no key entered is not scored (neither right nor wrong): never guessed.
 *
 * The paper layout is derived from the Test Center definitions (S.tc.CET, S.tc.JEE), not copied:
 *   CET: each CET section's target split evenly over its subjects (50 Physics + 50 Chemistry, then
 *        50 Maths), CET marking (no negative).
 *   JEE: JEE.perSubj.mcq MCQs per subject, then 5 or 10 numericals (her choice; follow the paper's
 *        own instructions), one 180-minute section, JEE marking (+4/-1, numerical negative per the
 *        profile setting, snapshotted at start). Every bubble she fills is scored.
 * Pure functions take `now` (ms) and an optional rng-free env, so tests can drive them.
 */
(function (S) {
  'use strict';
  const D = S.data;
  const u = S.u;
  const store = S.store;
  const E = S.engine;
  const TC = S.tc;

  const MIN = 60000;
  const LETTERS = 'ABCD';
  const SUBJ_NAME = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths' };
  const EXAM_NAME = { cet: 'MHT-CET PCM', jee: 'JEE Main' };

  /* ---------- paper layout ---------- */
  // { exam, numPerSubj, sections: [{ key, label, subjects, mins, rows: [{ subj, type, n }] }] }
  function sheetDef(exam, opts) {
    opts = opts || {};
    if (exam === 'cet') {
      return {
        exam: exam,
        sections: TC.CET.map((def) => {
          const per = def.target / def.subjects.length;
          if (per !== Math.floor(per)) throw new Error('CET section ' + def.key + ': target does not split evenly over its subjects');
          const rows = [];
          def.subjects.forEach((s) => {
            for (let n = 1; n <= per; n++) rows.push({ subj: s, type: 'mcq', n: n });
          });
          return { key: def.key, label: def.label, subjects: def.subjects.slice(), mins: def.mins, rows: rows };
        }),
      };
    }
    if (exam === 'jee') {
      const num = Number(opts.num || TC.JEE.perSubj.num);
      if (num !== TC.JEE.perSubj.num && num !== 2 * TC.JEE.perSubj.num) throw new Error('JEE numericals per subject must be ' + TC.JEE.perSubj.num + ' or ' + 2 * TC.JEE.perSubj.num);
      const rows = [];
      TC.JEE.subjects.forEach((s) => {
        for (let n = 1; n <= TC.JEE.perSubj.mcq; n++) rows.push({ subj: s, type: 'mcq', n: n });
        for (let k = 1; k <= num; k++) rows.push({ subj: s, type: 'num', n: TC.JEE.perSubj.mcq + k });
      });
      return { exam: exam, numPerSubj: num, sections: [{ key: 'all', label: 'Physics · Chemistry · Maths', subjects: TC.JEE.subjects.slice(), mins: TC.JEE.mins, rows: rows }] };
    }
    throw new Error('Unknown exam "' + exam + '".');
  }

  // Nominal maximum per subject, from the Test Center definitions: every CET question; for JEE the
  // pattern's own counts (perSubj), even when the sheet has 10 numericals of which 5 are answered.
  function maxBySubj(a) {
    const out = {};
    if (a.paper.exam === 'jee') {
      TC.JEE.subjects.forEach((s) => (out[s] = TC.JEE.perSubj.mcq * a.rules[s].mcq[0] + TC.JEE.perSubj.num * a.rules[s].num[0]));
    } else {
      a.questions.forEach((r) => (out[r.subj] = (out[r.subj] || 0) + a.rules[r.subj][r.type][0]));
    }
    return out;
  }

  /* ---------- building an attempt ---------- */
  // opts: { label (her paper name, e.g. "2024, 9 May Shift 1"), sourceId?, num? (JEE: 5|10) }
  // env:  { now, jeeNumNeg }
  function build(exam, opts, env) {
    opts = opts || {};
    const def = sheetDef(exam, opts);
    const now = env.now;
    const id = u.uid();
    const label = String(opts.label || '').trim().slice(0, 80) || 'Past paper';
    const a = {
      id: id, v: 1, mode: 'pyq', source: 'pyq', title: label.indexOf(EXAM_NAME[exam].split(' ')[0]) === 0 ? label : EXAM_NAME[exam] + ' · ' + label, chapters: [],
      date: u.iso(new Date(now)), startedAt: now, submittedAt: null, status: 'active', submitReason: null,
      rules: exam === 'cet' ? TC.cetRules() : TC.jeeRules(!!env.jeeNumNeg),
      sections: [], pos: { sec: 0, qi: 0, since: null }, questions: [],
      score: null, maxScore: null, correct: null, wrong: null, unanswered: null, bySubj: {},
      sample: false, short: false, retryOf: null, mockId: null,
      paper: { exam: exam, label: label, sourceId: opts.sourceId || '', num: def.numPerSubj || null },
      keyed: false, keyDraft: {}, nokey: null,
    };
    let end = now;
    def.sections.forEach((sd, si) => {
      end += sd.mins * MIN;
      const start = a.questions.length;
      sd.rows.forEach((r) => a.questions.push({
        qid: 'pyq:' + id + ':' + r.subj + ':' + r.n, ch: '', subj: r.subj, type: r.type, diff: 0, sec: si,
        sel: null, ans: null, ok: null, marks: 0, vis: false, mk: false, tMs: 0, sample: false, n: r.n,
      }));
      a.sections.push({ key: sd.key, label: sd.label, subjects: sd.subjects, qIdx: sd.rows.map((_, i) => start + i), end: end, lockedAt: null });
    });
    return a;
  }

  /* ---------- answer key parser ---------- */
  // spec: [{ n, type: 'mcq'|'num' }] for ONE subject. Accepts, per line:
  //   numbered pairs "1 A", "1:A", "1-A", "1) A", "1. A", "Q1 (b)", several per line ("1-A, 2-C");
  //   a row of letters "A B C D A ..." (numbered on from the last question read, starting at 1);
  //   numerical answers as numbers ("21 12", "22: -3", "23) 4.5").
  // Never guesses: a line it cannot read fully is reported in `unparsed` and nothing from it is used;
  // a number-only line with more than one pair and no separators ("12 3 45 6") is ambiguous, so unparsed;
  // the same question given two different answers goes to `conflicts` and is left without a key.
  // A "." separates only straight after the number ("21. 5", "1.A"): "21 .5" is not read as 5.
  const PAIR = /(?:^|[\s,;|])(?:Q\.?\s*)?(\d{1,3})(?:\s*[):=]\s*|\.\s+|\.(?=[A-Da-d(])|\s*-\s*(?=[A-Da-d(])|-(?=\d)|\s+)\(?\s*([A-Da-d]|[-+]?\d+(?:\.\d+)?)\s*\)?(?=$|[\s,;|])/g;
  function parseKey(text, spec) {
    const types = {};
    (spec || []).forEach((x) => (types[x.n] = x.type));
    const answers = {};
    const out = { answers: answers, unparsed: [], conflicts: [], bad: [], extra: [], missing: [] };
    const conflict = new Set();
    let next = 1;
    function put(n, v) {
      if (!types[n]) {
        if (out.extra.indexOf(n) < 0) out.extra.push(n);
        return;
      }
      let val;
      if (types[n] === 'mcq') {
        if (!/^[A-Da-d]$/.test(v)) return out.bad.push({ n: n, got: v, why: 'expected A, B, C or D' });
        val = v.toUpperCase();
      } else {
        if (!/^[-+]?\d+(\.\d+)?$/.test(v)) return out.bad.push({ n: n, got: v, why: 'expected a number' });
        val = Number(v);
      }
      if (n in answers && answers[n] !== val) conflict.add(n);
      else answers[n] = val;
    }
    String(text || '').replace(/\r/g, '').split('\n').forEach((raw) => {
      const line = raw.replace(/[–—−]/g, '-').trim();
      if (!line) return;
      const toks = line.split(/[\s,;|]+/).filter(Boolean);
      if (toks.length >= 2 && toks.every((t) => /^[A-Da-d]$/.test(t))) {
        toks.forEach((t) => put(next++, t));
        return;
      }
      if (/^[\s\d.+\-,;|]+$/.test(line) && toks.length > 2 && !/[).:=]/.test(line) && !/\d-\d/.test(line)) {
        out.unparsed.push(raw.trim());
        return;
      }
      const pairs = [];
      let rest = line;
      let m;
      PAIR.lastIndex = 0;
      while ((m = PAIR.exec(line))) {
        pairs.push([Number(m[1]), m[2]]);
        rest = rest.replace(m[0].trim(), ' ');
      }
      if (!pairs.length || /[^\s,;|]/.test(rest)) {
        out.unparsed.push(raw.trim());
        return;
      }
      pairs.forEach((p) => put(p[0], p[1]));
      next = pairs[pairs.length - 1][0] + 1;
    });
    conflict.forEach((n) => delete answers[n]);
    out.conflicts = Array.from(conflict).sort((x, y) => x - y);
    out.missing = (spec || []).map((x) => x.n).filter((n) => !(n in answers) && !conflict.has(n));
    return out;
  }
  // The spec of one subject in an attempt: [{ n, type }].
  function specOf(a, subj) {
    return a.questions.filter((r) => r.subj === subj).map((r) => ({ n: r.n, type: r.type }));
  }
  const subjectsOf = (a) => Array.from(new Set(a.questions.map((r) => r.subj)));

  /* ---------- scoring ---------- */
  // keys: { [subj]: { [n]: 'A'..'D' | number } }. Sets row.ans (displayed index for an MCQ, the
  // number for a numerical) and scores every keyed row with the attempt's Test Center rules.
  function setKey(a, keys) {
    a.questions.forEach((r) => {
      const v = keys[r.subj] ? keys[r.subj][r.n] : undefined;
      if (v === undefined || v === null || v === '') r.ans = null;
      else if (r.type === 'mcq') r.ans = LETTERS.indexOf(String(v).toUpperCase()) >= 0 ? LETTERS.indexOf(String(v).toUpperCase()) : null;
      else r.ans = Number.isFinite(Number(v)) ? Number(v) : null;
    });
  }
  function score(a) {
    const max = maxBySubj(a);
    const out = { score: 0, maxScore: 0, correct: 0, wrong: 0, unanswered: 0, nokey: 0, bySubj: {} };
    Object.keys(max).forEach((s) => {
      out.bySubj[s] = { score: 0, max: max[s], correct: 0, wrong: 0, unanswered: 0, nokey: 0 };
      out.maxScore += max[s];
    });
    a.questions.forEach((r) => {
      const b = out.bySubj[r.subj];
      const rule = a.rules[r.subj][r.type];
      if (r.ans === null) {
        r.ok = null;
        r.marks = 0;
        r.nokey = true;
        out.nokey++;
        b.nokey++;
        return;
      }
      r.nokey = false;
      r.ok = TC.isCorrect(r, null);
      r.marks = r.ok === null ? 0 : r.ok ? rule[0] : rule[1];
      b.score += r.marks;
      out.score += r.marks;
      if (r.ok === null) {
        out.unanswered++;
        b.unanswered++;
      } else if (r.ok) {
        out.correct++;
        b.correct++;
      } else {
        out.wrong++;
        b.wrong++;
      }
    });
    return out;
  }

  /* ---------- store layer ---------- */
  const env = () => ({ now: Date.now(), jeeNumNeg: !!store.get('profile').testCenter.jeeNumNeg });
  const all = () => store.get('attempts').items.filter((a) => a.mode === 'pyq');
  const get = (id) => all().filter((a) => a.id === id)[0] || null;
  const awaitingKey = () => all().filter((a) => a.status === 'awaiting-key');

  // Same rule as the Test Center: one active attempt, never overwritten.
  function start(exam, opts, envOverride) {
    TC.sync();
    const cur = TC.active();
    if (cur) return { ok: false, reason: 'active', attempt: cur };
    let a;
    try {
      a = build(exam, opts, Object.assign(env(), envOverride || {}));
    } catch (e) {
      return { ok: false, reason: 'build', error: e.message };
    }
    store.mutate('attempts', (d) => {
      d.items.push(a);
      d.activeId = a.id;
    });
    store.flush();
    return { ok: true, attempt: a };
  }

  // Fill or clear one bubble of the running sheet (only in the open section: TC.answer checks it).
  function mark(qi, value) {
    const res = TC.withActive((a) => (a.mode === 'pyq' ? TC.answer(a, qi, value) : false));
    return !!res;
  }

  // Save what she has typed or pasted so far (survives a reload).
  function saveDraft(id, subj, draft) {
    store.mutate('attempts', (d) => {
      const a = d.items.filter((x) => x.id === id)[0];
      if (!a || a.mode !== 'pyq') return;
      a.keyDraft = a.keyDraft || {};
      a.keyDraft[subj] = { text: String(draft.text || '').slice(0, 5000), answers: draft.answers || {} };
    });
  }

  // Score with this key. First time: status 'submitted', the mocks summary row (type cet/jee) and
  // today's question count. Again later (a corrected key): rescore and update that row, count nothing twice.
  function applyKey(id, keys, now) {
    now = now == null ? Date.now() : now;
    let res = null;
    store.mutate('attempts', (d) => {
      const a = d.items.filter((x) => x.id === id)[0];
      if (!a || a.mode !== 'pyq' || (a.status !== 'awaiting-key' && a.status !== 'submitted')) return;
      setKey(a, keys);
      Object.assign(a, score(a));
      const first = !a.keyed;
      a.keyed = true;
      a.keyedAt = now;
      a.status = 'submitted';
      const row = TC.summaryRow(a);
      row.type = a.paper.exam;
      row.weak = []; // no chapter is known for a past-paper question: never guessed
      row.pyq = true;
      // Every filled bubble is scored, so with 10 numericals a sheet can pass the paper's maximum.
      // The sheet keeps the true score; the mocks row (charts, badges) is capped and says why.
      if (row.score > row.total) {
        row.note = 'Scored ' + row.score + ': more numericals answered than the paper allows; counted as ' + row.total + '.';
        row.score = row.total;
      }
      if (first) {
        a.mockId = row.id;
        store.mutate('mocks', (m) => m.items.push(row));
        const answered = a.questions.filter((r) => r.sel != null).length;
        if (answered > 0) E.logStudy({ mcq: answered, date: a.date });
      } else {
        store.mutate('mocks', (m) => {
          const old = m.items.filter((x) => x.id === a.mockId)[0];
          if (old) Object.assign(old, { score: row.score, total: row.total, correct: row.correct, wrong: row.wrong, marks: row.marks, note: row.note || '' });
        });
      }
      res = a;
    });
    store.flush();
    return res;
  }

  // One wrong answer -> Error Notebook. Subject from the sheet; chapter only if she picks one.
  function logError(id, qi, chId) {
    const a = get(id);
    const r = a && a.questions[qi];
    if (!r || r.ok !== false) return { ok: false, reason: 'not-wrong' };
    if (chId && (!D.CH[chId] || D.CH[chId].subj !== r.subj)) return { ok: false, reason: 'chapter' };
    const dup = store.get('errors').items.some((e) => e.src && e.src.qid === r.qid);
    if (dup) return { ok: false, reason: 'duplicate' };
    const fmt = (v) => (v == null ? 'not answered' : r.type === 'mcq' ? LETTERS[v] : String(v));
    const date = u.today();
    const item = {
      id: u.uid(), date: date, subj: r.subj, chId: chId || '', chapter: chId ? D.CH[chId].name : '',
      question: a.title + ' · ' + SUBJ_NAME[r.subj] + ' Q' + r.n + ' (see your paper)',
      concept: 'Your answer: ' + fmt(r.sel) + ' · Key: ' + fmt(r.ans),
      reason: '', resolved: false, hasImage: false, revs: 0, srs: S.migrate.makeSrs(date),
      src: { attemptId: a.id, qid: r.qid, pyq: true },
    };
    store.mutate('errors', (e) => e.items.push(item));
    return { ok: true, id: item.id };
  }

  // Discard a sheet that is still waiting for its key (she asks for it, with a confirm in the UI).
  function discardUnkeyed(id) {
    const a = get(id);
    if (!a || a.status !== 'awaiting-key') return false;
    TC.deleteAttempt(id);
    return true;
  }

  S.pyq = {
    LETTERS: LETTERS, SUBJ_NAME: SUBJ_NAME, EXAM_NAME: EXAM_NAME,
    // pure
    sheetDef: sheetDef, build: build, parseKey: parseKey, specOf: specOf, subjectsOf: subjectsOf, setKey: setKey, score: score, maxBySubj: maxBySubj,
    // store
    all: all, get: get, awaitingKey: awaitingKey, start: start, mark: mark, saveDraft: saveDraft, applyKey: applyKey, logError: logError, discardUnkeyed: discardUnkeyed,
  };
})((window.SOS = window.SOS || {}));

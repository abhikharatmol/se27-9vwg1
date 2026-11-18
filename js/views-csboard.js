/* views/csboard.js — HSC Computer Science board practice.
 *   #/csboard                 the home of the subject: board readiness, today's set of 3, revise again, papers, the 9 chapters
 *   #/csboard/hot             most asked topics (grouped questions; the years come from the papers), covered or not
 *   #/csboard/revise          questions to revise again (low marks come back after 2 days, anything below full marks after 7)
 *   #/csboard/papers          the printed board papers of March 2022 to 2024; #/csboard/papers/<id> one paper (parts with the choose-N
 *                             rule, a 3-hour timer, timed attempts); a question opened from a paper has ?p=<id> so Back returns to it
 *   #/csboard/<chapter>       its questions; #/csboard/<chapter>/<n> one question (n = position in the chapter, from 1)
 * The questions are the board's own, kept as they were set (they come back year after year); each one says where it appeared.
 * The model answers and marking points are our own words. A 1-mark question is a multiple choice with a short reason. A 3, 4 or
 * 5-mark question is written on paper first; then she opens the model answer, ticks the points she wrote, and the marks are added.
 * The timer is an absolute end time in localStorage `sos.v2.csTimer` ({id, start, end}); the time left is always worked out from the clock.
 * Data: data/cs-c/<chapter>.js (loaded on demand, window.CS_C[chapter] = items), S.CS_INDEX, S.CS_PAPERS, S.CS_HOT (js/data-cs-index.js).
 * Logic without the DOM: js/csstudy.js (S.csstudy).
 * Store: domain `cs` = { done: { [id]: { at, t, got, max, pts, pick } }, saved: [id], papers: { [paperId]: [{ start, used, got, tried }] },
 *        today: { date, ids } } (store v11). The first answer to a question is also logged as study (MCQ: one solved question; written: 2 min a mark). */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const ui = S.ui;
  const store = S.store;
  const R = S.csstudy;
  S.views = S.views || {};

  const state = {}; // chapter id -> 'loading' | 'ready' | 'failed'
  const flt = { v: 'all', hot: 'todo', hotAll: false }; // chapter list filter; most-asked page filter
  const draft = {}; // question id -> { pts: [bool], shown: bool } while she is answering
  const PAPER = { 'cs-12-01': 'I', 'cs-12-02': 'I', 'cs-12-03': 'I', 'cs-12-04': 'I', 'cs-12-05': 'II', 'cs-12-06': 'II', 'cs-12-07': 'II', 'cs-12-08': 'II', 'cs-12-09': 'II' };
  // marks each chapter carries in its paper, counting the choices (from the guide's marks distribution); used to decide what to study first
  const WEIGHT = { 'cs-12-01': 22, 'cs-12-02': 17, 'cs-12-03': 41, 'cs-12-04': 14, 'cs-12-05': 21, 'cs-12-06': 43, 'cs-12-07': 4, 'cs-12-08': 8, 'cs-12-09': 18 };
  const KIND = { mcq: 'MCQ', short: 'Written', prog: 'Program' };
  const YEARS = [2022, 2023, 2024];

  const chapters = () => D.BY_SUBJECT.cs.filter((c) => c.std === 12);
  const idx = (id) => (S.CS_INDEX || {})[id] || { n: 0, mcq: 0, short: 0, prog: 0, marks: 0 };
  const table = () => window.CS_C || {};
  const items = (ch) => table()[ch] || [];
  const cs = () => store.get('cs');
  const done = () => cs().done;
  const saved = () => cs().saved;
  const hot = () => S.CS_HOT || [];
  const doneCount = (ch) => Object.keys(done()).filter((k) => k.indexOf(ch + '-') === 0).length;
  const chOf = (id) => id.slice(0, 8);
  // where a question lives: { q, ch, n } once its chapter file is loaded
  function find(id) {
    const ch = chOf(id);
    const all = items(ch);
    for (let i = 0; i < all.length; i++) if (all[i].id === id) return { q: all[i], ch: ch, n: i + 1 };
    return null;
  }
  let topicMap = null;
  const topicOf = (id) => (topicMap || (topicMap = R.topicOf(hot())))[id];

  function ensure(ch) {
    if (table()[ch]) {
      state[ch] = 'ready';
      return;
    }
    if (!idx(ch).n || state[ch] === 'loading' || state[ch] === 'failed') return;
    state[ch] = 'loading';
    const s = document.createElement('script');
    s.src = 'data/cs-c/' + ch + '.js';
    s.async = true;
    s.onload = () => {
      state[ch] = table()[ch] ? 'ready' : 'failed';
      S.app.refresh(false);
    };
    s.onerror = () => {
      state[ch] = 'failed';
      s.remove();
      S.app.refresh(false);
    };
    document.head.appendChild(s);
  }
  const ensureAll = () => { chapters().forEach((c) => ensure(c.id)); return chapters().every((c) => !idx(c.id).n || state[c.id] === 'ready' || state[c.id] === 'failed'); };

  const marksChip = (q) => '<span class="cs-m" data-m="' + q.marks + '">' + q.marks + (q.marks === 1 ? ' mark' : ' marks') + '</span>';
  const srcChips = (q) => ((q.src || []).length ? '<span class="cs-src">' + (q.src || []).map((x) => u.esc(x)).join(' · ') + '</span>' : '');
  const yearsChips = (t) => '<span class="cs-yrs" aria-label="Asked in ' + (t.yrs.join(', ') || 'no paper yet') + '">' + YEARS.map((y) => '<span class="cs-yr' + (t.yrs.indexOf(y) >= 0 ? ' on' : '') + '">' + y + '</span>').join('') + '</span>';
  const hotChip = (id) => {
    const t = topicOf(id);
    return t && t.yrs.length >= 2 ? '<span class="cs-hot" data-y="' + t.yrs.length + '">Asked ' + t.yrs.length + ' of 3 years</span>' : '';
  };
  const bar = (pct, label) => '<span class="cs-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + u.esc(label) + '"><span style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></span>';
  const qRow = (f, extra, testid, query, due) => {
    const d = due ? null : done()[f.q.id];
    return '<li><button class="lrow rip cs-row" data-act="go" data-to="#/csboard/' + f.ch + '/' + f.n + (query || '') + '" data-testid="' + (testid || 'cs-q') + '">' +
      '<span class="grow">' + (due ? '<span class="cs-tag" data-why="revise">Due</span>' : '') + '<b class="rt cs-qt">' + u.esc(f.q.q) + '</b><small class="rs">' + (extra || (KIND[f.q.kind] + ' · ')) + marksChip(f.q) + ' ' + hotChip(f.q.id) + '</small></span>' +
      (d ? '<span class="cs-done" title="Done: ' + d.got + ' of ' + d.max + '">' + u.icon('check-c') + '</span>' : u.icon('chev-r', 'chev')) + '</button></li>';
  };

  /* ---------- today's set (picked once a day, kept in the store) ---------- */
  function todayIds() {
    const t = u.today();
    const cur = cs().today;
    if (cur && cur.date === t) return cur.ids.map((id, i) => ({ id: id, why: (cur.why || [])[i] || 'mcq' }));
    const kind = (id) => { const f = find(id); return f ? f.q.kind : null; };
    const pick = R.pickToday(hot(), done(), t, kind);
    // keep the pick for the day (written after this render, so the render itself stays free of side effects)
    if (!chapters().some((c) => state[c.id] === 'failed')) setTimeout(() => store.mutate('cs', (c) => { if (!c.today || c.today.date !== t) c.today = { date: t, ids: pick.map((x) => x.id), why: pick.map((x) => x.why) }; }), 0);
    return pick;
  }
  function todayCard(ready) {
    if (!ready) return '<section class="card cs-today"><h2 class="h3">Today\'s set</h2><div class="skel" style="height:6rem"></div></section>';
    const t = u.today();
    const pick = todayIds();
    if (!pick.length) return '';
    const ids = pick.map((x) => x.id);
    const TAG = { revise: 'Revise', hot: 'Most asked', mcq: 'Quick MCQ' };
    const next = pick.map((x) => x.id).filter((id) => !(done()[id] && done()[id].at === t))[0];
    const nf = next ? find(next) : null;
    const rows = pick.map((x) => {
      const id = x.id;
      const f = find(id);
      if (!f) return '';
      const d = done()[id];
      const fin = d && d.at === t;
      const tag = TAG[x.why] || 'Practice';
      return '<li><button class="lrow rip cs-row" data-act="go" data-to="#/csboard/' + f.ch + '/' + f.n + '" data-testid="cs-today-q">' +
        '<span class="grow"><span class="cs-tag" data-why="' + x.why + '">' + tag + '</span><b class="rt cs-qt">' + u.esc(f.q.q) + '</b><small class="rs">Ch ' + (D.CH[f.ch].tb || '') + ' · ' + marksChip(f.q) + '</small></span>' +
        (fin ? '<span class="cs-done">' + u.icon('check-c') + '</span>' : u.icon('chev-r', 'chev')) + '</button></li>';
    }).join('');
    const n = ids.filter((id) => done()[id] && done()[id].at === t).length;
    const all = n >= ids.length;
    return '<section class="card cs-today" data-testid="cs-today"><div class="cs-today-h"><h2 class="h3">Today\'s set</h2><span class="cs-count" data-testid="cs-today-n">' + n + ' of ' + ids.length + ' done</span></div>' +
      (all ? '<p class="cs-win" data-testid="cs-today-done">' + u.icon('check-c') + 'Done for today: this counts as a study day for your streak. Come back tomorrow for the next set.</p>' : '<p class="small muted">About 15 minutes. Write the answers on paper, then mark yourself.</p>') +
      '<ul class="list">' + rows + '</ul>' +
      (nf ? '<button class="btn primary block rip" data-act="go" data-to="#/csboard/' + nf.ch + '/' + nf.n + '" data-testid="cs-today-go">' + u.icon('play') + (n ? 'Next: question ' + (n + 1) + ' of ' + ids.length : 'Start today\'s set') + '</button>' : '') + '</section>';
  }

  /* ---------- index ---------- */
  // the HSC date from Profile (store domain `exams`), and how many most-asked questions a day cover them all with a month left for papers
  function paceLine() {
    const e = S.exams && S.exams.get('hsc');
    const cd = e ? S.exams.countdown(e) : { kind: 'none' };
    if (cd.kind !== 'days') return '';
    const left = R.hotLeft(hot(), done());
    if (!left) return 'HSC in ' + cd.n + ' days. Every most-asked question is done: keep doing papers and the revise list.';
    if (cd.n <= 30) return 'HSC in ' + cd.n + ' days. Do a timed paper every two days, and the revise list each day.';
    const per = Math.ceil(left / (cd.n - 30));
    if (per <= 1) return 'HSC in ' + cd.n + ' days. Today\'s set each day covers all ' + left + ' most-asked questions, with the last month left for papers.';
    return 'HSC in ' + cd.n + ' days. To cover all ' + left + ' most-asked questions before the last month, do today\'s set and ' + (per - 1) + ' more from Most asked each day.';
  }
  function readinessCard() {
    const r = R.readiness(hot(), done());
    const due = R.due(done(), u.today()).length;
    const pace = paceLine();
    return '<button class="card cs-ready rip" data-act="go" data-to="#/csboard/hot" data-testid="cs-ready"><span class="grow"><small class="muted">Board readiness</small>' +
      '<b class="cs-pct" data-testid="cs-pct">' + r.pct + '%</b>' + bar(r.pct, 'Board readiness') +
      '<small class="rs">' + r.covered + ' of ' + r.total + ' most-asked topics covered' + (due ? ' · ' + due + ' to revise' : '') + '</small>' + (pace ? '<small class="rs cs-pace" data-testid="cs-pace">' + u.esc(pace) + '</small>' : '') + '</span>' + u.icon('chev-r', 'chev') + '</button>';
  }
  function indexHtml() {
    const ready = ensureAll();
    const due = ready ? R.due(done(), u.today()).filter((x) => find(x.id)) : [];
    const rows = chapters().map((c) => {
      const ix = idx(c.id);
      const tot = ix.n;
      const dn = doneCount(c.id);
      const pct = tot ? Math.round((100 * dn) / tot) : 0;
      return '<li><button class="lrow rip" data-act="go" data-to="#/csboard/' + c.id + '" data-testid="cs-' + c.id + '"' + (tot ? '' : ' aria-disabled="true"') + '>' +
        '<span class="rv-no" data-s="cs">' + (c.tb || '') + '</span><span class="grow"><b class="rt">' + u.esc(c.name) + '</b><small class="rs">Paper ' + PAPER[c.id] + ' · about ' + WEIGHT[c.id] + ' marks with choices · ' +
        (tot ? tot + ' questions' + (dn ? ' · ' + dn + ' done' : '') : 'Questions coming') + '</small>' + (dn ? bar(pct, c.name + ' done') : '') + '</span>' + u.icon('chev-r', 'chev') + '</button></li>';
    }).join('');
    const all = chapters().reduce((n, c) => n + idx(c.id).n, 0);
    return (
      '<div class="page cs-index"><header class="page-h"><div><h1 class="h1">HSC Computer Science</h1><p class="muted">The board\'s own questions, exactly as they were set, with model answers. ' + all + ' questions.</p></div></header>' +
      todayCard(ready) + readinessCard() +
      (due.length ? '<button class="card cs-revise rip" data-act="go" data-to="#/csboard/revise" data-testid="cs-revise-link">' + u.icon('refresh') + '<span class="grow"><b>Revise again</b><small class="rs">' + due.length + (due.length === 1 ? ' question is' : ' questions are') + ' due: low marks come back until you get them right.</small></span>' + u.icon('chev-r', 'chev') + '</button>' : '') +
      papersCard() +
      '<h2 class="h3 cs-sec">Chapters</h2><p class="small muted cs-sec-s">Big chapters first if time is short: C++ and 8085 programming carry the most marks.</p><ul class="list">' + rows + '</ul>' +
      '<details class="card cs-howto"><summary><b>How it works</b></summary><ol class="cs-how"><li>Do today\'s set: three questions, about 15 minutes.</li><li>Write each answer on paper, like in the exam, then open the model answer and tick what you wrote.</li><li>Weak answers come back in Revise again. Once a week, do one board paper with the 3-hour timer.</li></ol>' +
      '<p class="small muted">Both papers are 50 marks, 3 hours. Paper I: OS, Data Structure, C++, HTML. Paper II: 8085, 8051, x86 and Networking.</p></details></div>'
    );
  }

  /* ---------- most asked topics ---------- */
  function hotHtml() {
    const ready = ensureAll();
    const r = R.readiness(hot(), done());
    const full = R.order(hot()).filter((t) => (flt.hot === 'todo' ? !R.covered(t, done()) : true));
    const list = flt.hotAll ? full : full.slice(0, 10);
    const cards = list.map((t) => {
      const dn = t.m.filter((id) => done()[id]).length;
      const qs = ready ? t.m.map(find).filter(Boolean).map((f) => qRow(f, KIND[f.q.kind] + ' · ', 'cs-hot-q')).join('') : '<div class="skel" style="height:4rem"></div>';
      return '<details class="card cs-topic" data-testid="cs-topic"><summary><span class="grow"><b class="rt">' + u.esc(t.t) + '</b><small class="rs">' + u.esc(D.CH[t.ch].name) + ' · asked ' + t.n + (t.n === 1 ? ' time' : ' times') + ' · ' + dn + ' of ' + t.m.length + ' done</small>' + yearsChips(t) + '</span>' +
        (R.covered(t, done()) ? '<span class="cs-done">' + u.icon('check-c') + '</span>' : '') + u.icon('chev-d', 'chev') + '</summary><ul class="list">' + qs + '</ul></details>';
    }).join('');
    return '<div class="page cs-hotp"><header class="page-h"><div><h1 class="h1">Most asked topics</h1><p class="muted">Questions on the same idea, grouped. The years show which of the 2022, 2023 and 2024 papers asked it.</p></div></header>' +
      '<section class="card cs-ready-s"><b class="cs-pct">' + r.pct + '%</b>' + bar(r.pct, 'Board readiness') + '<small class="rs">Board readiness: ' + r.covered + ' of ' + r.total + ' topics covered. Covering a topic means doing at least one of its questions; the percent grows with your marks.</small></section>' +
      ui.seg('cs-hotflt', [{ v: 'todo', t: 'Not covered' }, { v: 'all', t: 'All topics' }], flt.hot) +
      (cards || '<p class="muted">Every topic is covered. Now raise the marks: open a topic and redo its weakest question.</p>') +
      (full.length > list.length ? '<button class="btn tonal block rip" data-act="cs-hotall" data-testid="cs-hotall">Show all ' + full.length + ' topics</button>' : '') + '</div>';
  }

  /* ---------- revise again ---------- */
  function reviseHtml() {
    const ready = ensureAll();
    const due = ready ? R.due(done(), u.today()).map((x) => ({ x: x, f: find(x.id) })).filter((r) => r.f) : [];
    const rows = due.map((r) => qRow(r.f, 'Last time ' + Math.round(r.x.ratio * 100) + '% · ' + r.x.days + (r.x.days === 1 ? ' day ago · ' : ' days ago · '), 'cs-rev-q', '', true)).join('');
    return '<div class="page cs-list"><header class="page-h"><div><h1 class="h1">Revise again</h1><p class="muted">Answers that scored low come back after 2 days, and anything below full marks after a week. Answer again and mark yourself.</p></div></header>' +
      (!ready ? '<div class="skel" style="height:8rem"></div>' : rows ? '<ul class="list">' + rows + '</ul>' : ui.empty('check-c', 'Nothing to revise today', 'Answers you mark below full marks will come back here.', '<button class="btn tonal rip" data-act="go" data-to="#/csboard">Back to Computer Science</button>')) + '</div>';
  }

  /* ---------- 3-hour paper timer ---------- */
  const TKEY = 'sos.v2.csTimer';
  const PAPER_MS = 3 * 60 * 60 * 1000;
  let timerMem = null;
  const timerGet = () => {
    try { const t = JSON.parse(localStorage.getItem(TKEY) || 'null'); return t && typeof t.id === 'string' && t.end > 0 ? t : null; } catch (e) { return null; }
  };
  const timerSet = (t) => {
    try { if (t) localStorage.setItem(TKEY, JSON.stringify(t)); else localStorage.removeItem(TKEY); } catch (e) { /* private mode: the timer then lives only in this page */ }
    timerMem = t;
  };
  const timer = () => timerGet() || timerMem;
  const two = (n) => String(n).padStart(2, '0');
  const clockText = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return two(Math.floor(s / 3600)) + ':' + two(Math.floor((s % 3600) / 60)) + ':' + two(s % 60);
  };
  const usedText = (ms) => { const m = Math.round(Math.max(0, ms) / 60000); return Math.floor(m / 60) + ' h ' + two(m % 60) + ' min'; };
  const attempts = (pid) => (cs().papers || {})[pid] || [];
  function saveAttempt(t, endAt) {
    const p = papers().filter((x) => x.id === t.id)[0];
    if (!p) return null;
    const until = Math.min(endAt, t.end);
    const sc = R.paperScore(p, done(), t.start, until);
    const rec = { start: t.start, used: Math.min(PAPER_MS, Math.max(0, until - t.start)), got: sc.got, tried: sc.tried };
    store.mutate('cs', (c) => {
      c.papers = c.papers || {};
      const list = c.papers[t.id] || (c.papers[t.id] = []);
      if (!list.some((a) => a.start === rec.start)) list.push(rec);
      if (list.length > 20) list.splice(0, list.length - 20);
    });
    if (S.engine && S.engine.checkBadges) S.engine.checkBadges();
    return rec;
  }
  function timerCard(p) {
    const t = timer();
    const mine = t && t.id === p.id;
    const at = attempts(p.id);
    const best = at.reduce((b, a) => (!b || a.got > b.got ? a : b), null);
    const hist = at.length ? '<p class="small muted" data-testid="cs-attempts">' + at.length + (at.length === 1 ? ' timed attempt so far' : ' timed attempts so far') + (at.length > 1 ? '. Last: ' + at[at.length - 1].got + ' of ' + p.marks : '') + '.</p>' : '';
    if (mine && Date.now() < t.end) {
      return '<section class="card cs-timer" data-testid="cs-timer"><div class="grow"><small class="muted">Time left</small><b class="cs-clock" data-cs-clock="' + t.end + '" data-testid="cs-clock">' + clockText(t.end - Date.now()) + '</b>' +
        '<p class="small muted">Answer the questions below in order; only answers marked after the start count for this attempt.</p></div>' +
        '<button class="btn tonal rip" data-act="cs-timer-stop" data-testid="cs-tstop">Finish</button></section>';
    }
    return '<section class="card cs-timer" data-testid="cs-timer">' +
      (best && !mine ? '<div class="cs-best" data-testid="cs-best"><small class="muted">Best timed attempt</small><b class="cs-clock">' + best.got + ' of ' + p.marks + '</b><small class="muted">in ' + usedText(best.used) + '</small></div>' : '') +
      '<div class="grow"><b class="h3">' + (mine ? 'Time is up' : '3-hour timer') + '</b><p class="small muted">' + (mine ? 'The 3 hours are over. Press Finish to save this attempt.' : 'Like the real paper: 3 hours for 50 marks. The clock keeps running if you close the app.') + '</p>' +
      (t && !mine ? '<p class="small muted">Starting this stops the timer of another paper (that attempt is saved).</p>' : '') + hist + '</div>' +
      (mine ? '<button class="btn tonal rip" data-act="cs-timer-stop" data-testid="cs-tstop">Finish</button>' : '<button class="btn tonal rip" data-act="cs-timer-start" data-id="' + u.esc(p.id) + '" data-testid="cs-tstart">' + (at.length ? 'Start another attempt' : 'Start the timer') + '</button>') + '</section>';
  }
  const clockChip = (pid) => {
    const t = timer();
    if (!t || t.id !== pid || Date.now() >= t.end) return '';
    return '<p class="cs-qclock small" data-testid="cs-qclock">Time left <b data-cs-clock="' + t.end + '">' + clockText(t.end - Date.now()) + '</b></p>';
  };

  /* ---------- board papers ---------- */
  const papers = () => S.CS_PAPERS || [];
  function papersCard() {
    const n = papers().length;
    if (!n) return '';
    const best = papers().map((p) => attempts(p.id).reduce((b, a) => Math.max(b, a.got), -1)).filter((x) => x >= 0);
    return '<section class="card cs-papers-card"><h2 class="h3">Board papers</h2><p class="muted small">The full papers of March 2022, 2023 and 2024, Paper I and Paper II, exactly as printed, with a 3-hour timer.' +
      (best.length ? ' Timed so far: ' + best.length + ' of ' + n + ', best ' + Math.max.apply(null, best) + ' of 50.' : '') + '</p>' +
      '<button class="btn tonal block rip" data-act="go" data-to="#/csboard/papers" data-testid="cs-papers">Open the ' + n + ' papers</button></section>';
  }
  function papersHtml() {
    const rows = papers().map((p) => {
      const sc = R.paperScore(p, done());
      const at = attempts(p.id);
      const best = at.reduce((b, a) => Math.max(b, a.got), -1);
      return '<li><button class="lrow rip" data-act="go" data-to="#/csboard/papers/' + p.id + '" data-testid="cs-paper"><span class="rv-no" data-s="cs">' + (p.paper === 1 ? 'I' : 'II') + '</span><span class="grow"><b class="rt">' + u.esc(p.title) + '</b><small class="rs">' + u.esc(p.sub) +
        (best >= 0 ? ' · best timed ' + best + ' of ' + p.marks : sc.tried ? ' · ' + sc.tried + ' of ' + sc.total + ' answered' : ' · not started') + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>';
    }).join('');
    return '<div class="page cs-index"><header class="page-h"><div><h1 class="h1">Board papers</h1><p class="muted">Past HSC Computer Science papers. Each question opens the model answer. Do one a week with the timer.</p></div></header><ul class="list">' + rows + '</ul></div>';
  }
  function paperHtml(id) {
    const p = papers().filter((x) => x.id === id)[0];
    if (!p) return '<div class="page">' + ui.empty('book', 'Paper not found', 'Go back to the list of papers.', '<button class="btn tonal rip" data-act="go" data-to="#/csboard/papers">All papers</button>') + '</div>';
    const sc = R.paperScore(p, done());
    const parts = p.parts.map((pt) => {
      const qs = pt.qs.map((q) => {
        const d = done()[q.ref];
        return '<li><button class="lrow rip cs-row" data-act="go" data-to="#/csboard/' + q.ch + '/' + q.i + '?p=' + p.id + '" data-testid="cs-pq"><span class="cs-no">' + u.esc(q.n) + '</span><span class="grow"><b class="rt cs-qt">' + u.esc(q.q).replace(/\n/g, '<br>') + '</b><small class="rs">' + marksChip(q) + ' ' + hotChip(q.ref) + '</small></span>' +
          (d ? '<span class="cs-done" title="Done: ' + d.got + ' of ' + d.max + '">' + u.icon('check-c') + '</span>' : '') + '</button></li>';
      }).join('');
      return '<section class="cs-part"><h2 class="h3">' + u.esc(pt.label) + '</h2>' + (pt.id === '5or' ? '<p class="small muted">This set is the alternative of Q.5: in the exam you answer one of the two sets.</p>' : '') + (pt.note ? '<p class="small muted">' + u.esc(pt.note) + '</p>' : '') + '<ul class="list">' + qs + '</ul></section>';
    }).join('');
    return '<div class="page cs-paper"><header class="page-h"><div><h1 class="h1">' + u.esc(p.title) + '</h1><p class="muted">' + u.esc(p.sub) + ' · ' + p.marks + ' marks · 3 hours</p></div></header>' +
      timerCard(p) + '<section class="card cs-untimed"><small class="muted">Untimed practice</small><b data-testid="cs-pscore">' + sc.got + ' of ' + p.marks + ' marks</b><p class="small muted">From all the questions of this paper you have answered (' + sc.tried + ' of ' + sc.total + '). In each "any" part, your best answers count.</p></section>' + parts + '</div>';
  }

  /* ---------- one chapter: the list ---------- */
  const FILTERS = [{ v: 'all', t: 'All' }, { v: 'hot', t: 'Most asked' }, { v: 'mcq', t: 'MCQ' }, { v: 'short', t: 'Written' }, { v: 'prog', t: 'Programs' }, { v: 'todo', t: 'To do' }, { v: 'saved', t: 'Saved' }];
  function listHtml(ch) {
    const c = D.CH[ch];
    const all = items(ch);
    const pick = (q) => (flt.v === 'all' ? true : flt.v === 'todo' ? !done()[q.id] : flt.v === 'saved' ? saved().indexOf(q.id) >= 0 : flt.v === 'hot' ? !!(topicOf(q.id) && topicOf(q.id).yrs.length >= 2) : q.kind === flt.v);
    const rows = all.map((q, i) => ({ q: q, n: i + 1 })).filter((r) => pick(r.q)).map((r) => {
      const d = done()[r.q.id];
      return '<li><button class="lrow rip cs-row" data-act="go" data-to="#/csboard/' + ch + '/' + r.n + '" data-testid="cs-q">' +
        '<span class="cs-no">' + r.n + '</span><span class="grow"><b class="rt cs-qt">' + u.esc(r.q.q) + '</b><small class="rs">' + KIND[r.q.kind] + ' · ' + marksChip(r.q) + ' ' + hotChip(r.q.id) + '</small></span>' +
        (d ? '<span class="cs-done" title="Done: ' + d.got + ' of ' + d.max + '">' + u.icon('check-c') + '</span>' : '') + '</button></li>';
    }).join('');
    const body = state[ch] === 'failed'
      ? ui.empty('book', 'Could not load', 'Check the connection and open this page again.', '')
      : !all.length
        ? '<div class="skel" style="height:8rem"></div>'
        : rows ? '<ul class="list">' + rows + '</ul>' : '<p class="muted">Nothing here yet.</p>';
    const dn = doneCount(ch);
    return (
      '<div class="page cs-list"><header class="page-h"><div><h1 class="h1">' + u.esc(c.name) + '</h1><p class="muted">Paper ' + PAPER[ch] + ' · about ' + WEIGHT[ch] + ' marks with choices · ' + idx(ch).n + ' questions · ' + dn + ' done</p>' + bar(idx(ch).n ? Math.round((100 * dn) / idx(ch).n) : 0, c.name + ' done') + '<button class="link" data-act="go" data-to="#/watch/' + ch + '" data-testid="cs-watch">Lectures and notes of this chapter</button></div></header>' +
      ui.seg('cs-flt', FILTERS, flt.v) + body + '</div>'
    );
  }

  /* ---------- one question ---------- */
  function figHtml(q) {
    return (q.figs || []).map((f) => '<figure class="cs-fig"><a href="img/cs/' + u.esc(f.f) + '.svg" target="_blank" rel="noopener" data-testid="cs-fig"><img src="img/cs/' + u.esc(f.f) + '.svg" alt="' + u.esc(f.alt) + '" loading="lazy" width="640" height="' + (f.h || 400) + '"></a><figcaption class="small muted">' + u.esc(f.alt) + '.</figcaption><p class="cs-fighint small muted">Scroll sideways to see all of it.</p><a class="btn tonal sm rip cs-figbtn" href="img/cs/' + u.esc(f.f) + '.svg" target="_blank" rel="noopener">' + u.icon('image') + 'Open the diagram large</a></figure>').join('');
  }
  const isDue = (id) => R.due(done(), u.today()).some((x) => x.id === id);
  const hashPaper = () => { const m = /[?&]p=([^&]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]) : ''; };
  // a timed attempt of the paper this question was opened from is running, and her answer is older than its start
  const timedOpen = (q) => {
    const t = timer();
    const d = done()[q.id];
    return !!(t && t.id === hashPaper() && Date.now() < t.end && (!d || (d.t || 0) < t.start));
  };
  function mcqHtml(q, d) {
    const timed = d && timedOpen(q);
    const again = d && (isDue(q.id) || timed); // due for revision, or part of a timed attempt: she answers it again
    const locked = !!d && !again;
    return '<div class="opts" role="radiogroup" aria-label="Options">' + q.options.map((o, k) => {
      const cls = locked ? (k === q.ans ? ' right' : d.pick === k ? ' wrong' : '') : '';
      return '<button class="opt rip' + cls + '" role="radio" aria-checked="' + (locked && d.pick === k) + '" data-act="cs-opt" data-v="' + k + '"' + (locked ? ' disabled' : '') + '><span class="let">' + 'ABCD'[k] + '</span><span class="ot">' + u.esc(o) + '</span></button>';
    }).join('') + '</div>' +
      (again ? '<p class="small muted" data-testid="cs-again">' + (timed ? 'Timed attempt: answer it again.' : 'Revise again: last time this was wrong. Pick your answer.') + '</p>' : '') +
      (locked ? '<div class="tc-sol sol" data-testid="cs-why"><b class="small ' + (d.pick === q.ans ? 'cs-why-ok' : 'cs-why-bad') + '">' + (d.pick === q.ans ? 'Correct' : 'Not quite') + '</b><p>' + u.esc(q.why) + '</p>' +
        (d.pick !== q.ans ? '<p class="small muted">It will come back in Revise again in 2 days.</p>' : '') + '</div>' : '');
  }
  function writtenHtml(q, d) {
    const dr = draft[q.id] || (draft[q.id] = { pts: q.model.map(() => false), shown: !!d });
    if (d && d.pts && !dr.edited) d.pts.forEach((i) => (dr.pts[i] = true));
    if (!dr.shown) {
      return '<p class="muted small">Write your answer on paper first, like in the exam. Then open the model answer and mark yourself honestly: a point counts only if you wrote it.</p>' +
        '<button class="btn primary block rip" data-act="cs-show" data-testid="cs-show">Show the model answer</button>';
    }
    const got = q.model.reduce((n, p, i) => n + (dr.pts[i] ? p.m : 0), 0);
    return (
      '<div class="tc-sol sol sol-long" data-testid="cs-model"><b class="small">Model answer. Tick what you wrote.</b><ul class="cs-pts">' +
      q.model.map((p, i) => '<li><label class="cs-pt"><input type="checkbox" data-act="cs-pt" data-i="' + i + '"' + (dr.pts[i] ? ' checked' : '') + '><span>' + u.esc(p.t) + ' <small class="muted">(' + p.m + (p.m === 1 ? ' mark' : ' marks') + ')</small></span></label></li>').join('') + '</ul>' +
      figHtml(q) +
      // a drawn figure replaces the text drawing of the same thing (programs keep their code)
      (q.code && !(q.figs && q.figs.length && q.code.indexOf('#include') < 0 && !q.checks) ? '<h4 class="sol-h">' + (/#include|<\/?[a-z]|^\s*[A-Z]{2,4}\s|class |algorithm|step\s*\d/im.test(q.code) ? 'Model program' : 'Model drawing') + '</h4><pre class="cs-code" data-testid="cs-code">' + u.esc(q.code) + '</pre>' : '') +
      (q.code && q.code.indexOf('#include') >= 0 ? '<button class="link" data-act="go" data-to="#/code/cpp?q=' + u.esc(q.id) + '" data-testid="cs-tolab">Run this program in the C++ lab</button>' : '') +
      (q.checks && q.checks.length ? '<button class="link" data-act="go" data-to="#/code/8085?task=' + u.esc(q.id) + '" data-testid="cs-to8085">Try it in the 8085 lab (it checks your program)</button>' : '') +
      '<p class="cs-got"><b data-testid="cs-got">' + got + ' of ' + q.marks + '</b> marks</p>' +
      '<button class="btn primary block rip" data-act="cs-save-marks" data-testid="cs-savem">' + (d ? 'Update my marks' : 'Save my marks') + '</button></div>'
    );
  }
  function questionHtml(ch, n, pidRaw) {
    const all = items(ch);
    const from = pidRaw ? papers().filter((x) => x.id === pidRaw)[0] : null;
    const pid = from ? from.id : ''; // the id from our own data, never the text of the link
    const q = all[n - 1];
    if (!q) return '<div class="page">' + ui.empty('book', 'Question not found', 'It may have moved. Go back to the chapter.', '<button class="btn tonal rip" data-act="go" data-to="#/csboard/' + ch + '">Back to the list</button>') + '</div>';
    const d = done()[q.id];
    const sv = saved().indexOf(q.id) >= 0;
    const t = topicOf(q.id);
    return (
      '<div class="page tc-exam cs-q" data-id="' + u.esc(q.id) + '"><p class="small muted">' + (from ? u.esc(from.title) + ' · ' : '') + u.esc(D.CH[ch].name) + ' · question ' + n + ' of ' + all.length + '</p>' + (from ? clockChip(from.id) : '') +
      '<div class="cs-qhead"><p class="cs-meta">' + marksChip(q) + ' ' + srcChips(q) + '</p>' +
      (t && t.yrs.length ? '<p class="cs-topicline small">' + yearsChips(t) + '<span>' + u.esc(t.t) + ' (underlined year = asked in that paper)</span></p>' : '') + '</div>' +
      '<section class="cs-qcard"><p class="tc-stem cs-stem" data-testid="cs-stem">' + u.esc(q.q).replace(/\n/g, '<br>') + '</p></section>' +
      (q.kind === 'mcq' ? mcqHtml(q, d) : writtenHtml(q, d)) +
      '<div class="tc-acts"><button class="chip rip" data-act="cs-save" data-id="' + u.esc(q.id) + '" aria-pressed="' + sv + '" data-testid="cs-flag">' + u.icon(sv ? 'star-f' : 'star', 's') + (sv ? 'Saved' : 'Save to revisit') + '</button></div>' +
      '<div class="row gap cs-nav' + ((q.kind === 'mcq' ? !!d && !isDue(q.id) && !timedOpen(q) : !!(draft[q.id] && draft[q.id].shown)) ? ' is-static' : '') + '"><button class="btn tonal grow rip" data-act="go" data-to="#/csboard/' + ch + '/' + (n - 1) + (pid ? '?p=' + pid : '') + '"' + (n > 1 ? '' : ' disabled') + '>' + u.icon('chev-l') + 'Previous</button>' +
      '<button class="btn tonal grow rip" data-act="go" data-to="#/csboard/' + ch + '/' + (n + 1) + (pid ? '?p=' + pid : '') + '"' + (n < all.length ? '' : ' disabled') + '>Next' + u.icon('chev-r') + '</button></div></div>'
    );
  }

  const SPECIAL = { hot: 'Most asked topics', revise: 'Revise again', papers: 'Board papers' };
  S.views.csboard = {
    title: 'HSC CS',
    tab: 'practice',
    isPushed: (ctx) => !!ctx.params[0],
    pageTitle: (ctx) => (SPECIAL[ctx.params[0]] || (D.CH[ctx.params[0]] ? (Number(ctx.params[1]) ? 'Question ' + ctx.params[1] : D.CH[ctx.params[0]].name) : 'HSC Computer Science')),
    pageKicker: (ctx) => (D.CH[ctx.params[0]] ? 'HSC COMPUTER SCIENCE · PAPER ' + PAPER[ctx.params[0]] : ''),
    leave() { if (badgesLater && S.engine && S.engine.checkBadges) { badgesLater = false; setTimeout(() => S.engine.checkBadges(), 300); } },
    backHash: (cur) => (cur && cur.query && cur.query.p && papers().some((x) => x.id === cur.query.p) ? '#/csboard/papers/' + cur.query.p : cur && cur.params && cur.params[0] === 'papers' ? (cur.params[1] ? '#/csboard/papers' : '#/csboard') : cur && cur.params && cur.params[1] ? '#/csboard/' + cur.params[0] : '#/csboard'),
    tick() {
      document.querySelectorAll('[data-cs-clock]').forEach((el) => {
        const left = Number(el.dataset.csClock) - Date.now();
        el.textContent = clockText(left);
        if (left <= 0 && !el.dataset.csDone) { el.dataset.csDone = '1'; ui.toast('Time is up. Press Finish to save the attempt.'); S.app.refresh(true); }
      });
    },
    render(root, ctx) {
      const ch = ctx.params[0];
      if (!ch) { root.innerHTML = indexHtml(); return; }
      if (ch === 'hot') { root.innerHTML = hotHtml(); return; }
      if (ch === 'revise') { root.innerHTML = reviseHtml(); return; }
      if (ch === 'papers') { root.innerHTML = ctx.params[1] ? paperHtml(ctx.params[1]) : papersHtml(); return; }
      if (!D.CH[ch] || D.CH[ch].subj !== 'cs') {
        root.innerHTML = '<div class="page">' + ui.empty('book', 'Chapter not found', 'This is not a Computer Science chapter.', '<button class="btn tonal rip" data-act="go" data-to="#/csboard">All chapters</button>') + '</div>';
        return;
      }
      ensure(ch);
      const n = Number(ctx.params[1]);
      root.innerHTML = n ? (items(ch).length ? questionHtml(ch, n, ctx.query && ctx.query.p) : '<div class="page"><div class="skel" style="height:10rem"></div></div>') : listHtml(ch);
    },
  };

  /* ---------- actions ---------- */
  const here = () => {
    const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
    return { ch: p[1], n: Number(p[2]) };
  };
  const curQ = () => {
    const h = here();
    return items(h.ch)[h.n - 1];
  };
  // save an answer; the first answer to a question also counts as study for the day (streak, study time, badges)
  let badgesLater = false;
  function record(q, rec) {
    const prev = done()[q.id];
    const first = !prev;
    const newToday = !prev || prev.at !== u.today(); // counts once a day per question, for the streak
    store.mutate('cs', (c) => { c.done[q.id] = Object.assign({ at: u.today(), t: Date.now(), max: q.marks }, rec); });
    if (S.engine && newToday) {
      const o = { cs: 1 };
      if (first && q.kind === 'mcq') o.mcq = 1;
      if (first && q.kind !== 'mcq') { o.min = R.minutesFor(q.marks); o.subj = 'cs'; }
      S.engine.logStudy(o);
      badgesLater = true; // shown when she leaves the question, not over it
    }
  }
  function cheer(q) {
    const t = u.today();
    const tod = cs().today;
    const ids = tod && tod.date === t ? tod.ids : [];
    const left = ids.filter((id) => !(done()[id] && done()[id].at === t)).length;
    const d = done()[q.id];
    const base = q.kind === 'mcq' ? (d.got ? 'Correct' : 'Saved, it will come back') : 'Saved: ' + d.got + ' of ' + q.marks + ' marks';
    if (ids.indexOf(q.id) >= 0) return base + (left ? '. ' + left + ' left in today\'s set' : '. Today\'s set is done');
    return base;
  }

  ui.actions['cs-flt'] = (el) => { flt.v = el.dataset.v; S.app.refresh(true); };
  ui.actions['cs-hotflt'] = (el) => { flt.hot = el.dataset.v; flt.hotAll = false; S.app.refresh(true); };
  ui.actions['cs-hotall'] = () => { flt.hotAll = true; S.app.refresh(true); };
  ui.actions['cs-opt'] = (el) => {
    const q = curQ();
    if (!q) return;
    const prev = done()[q.id];
    if (prev && !isDue(q.id) && !timedOpen(q)) return;
    const k = Number(el.dataset.v);
    record(q, { got: k === q.ans ? 1 : 0, pick: k });
    const tod = cs().today;
    if (tod && tod.date === u.today() && tod.ids.indexOf(q.id) >= 0) ui.toast(cheer(q).replace(/^(Correct|Saved, it will come back)\. /, ''));
    S.app.refresh(true);
  };
  ui.actions['cs-show'] = () => {
    const q = curQ();
    if (!q) return;
    (draft[q.id] = draft[q.id] || { pts: q.model.map(() => false) }).shown = true;
    S.app.refresh(true);
  };
  ui.actions['cs-pt'] = (el) => {
    const q = curQ();
    if (!q || !draft[q.id]) return;
    draft[q.id].pts[Number(el.dataset.i)] = !!el.checked;
    draft[q.id].edited = true;
    S.app.refresh(true);
  };
  ui.actions['cs-save-marks'] = () => {
    const q = curQ();
    const dr = q && draft[q.id];
    if (!q || !dr) return;
    const pts = dr.pts.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    record(q, { got: pts.reduce((n, i) => n + q.model[i].m, 0), pts: pts });
    dr.edited = false;
    ui.toast(cheer(q));
    S.app.refresh(true);
  };
  ui.actions['cs-save'] = (el) => {
    const id = el.dataset.id;
    store.mutate('cs', (c) => {
      const i = c.saved.indexOf(id);
      if (i >= 0) c.saved.splice(i, 1);
      else c.saved.push(id);
    });
    S.app.refresh(true);
  };
  ui.actions['cs-timer-start'] = (el) => {
    const old = timer();
    if (old && old.id !== el.dataset.id) saveAttempt(old, Math.min(Date.now(), old.end));
    timerSet({ id: el.dataset.id, start: Date.now(), end: Date.now() + PAPER_MS });
    ui.toast('Timer started: 3 hours. Good luck.');
    S.app.refresh(true);
  };
  ui.actions['cs-timer-stop'] = () => {
    const t = timer();
    timerSet(null);
    const rec = t ? saveAttempt(t, Math.min(Date.now(), t.end)) : null;
    ui.toast(rec ? 'Saved: ' + rec.got + ' of 50 in ' + usedText(rec.used) : 'Stopped');
    S.app.refresh(true);
  };

  S.csboard = { chapters: chapters, doneCount: doneCount, clockText: clockText, PAPER_MS: PAPER_MS, WEIGHT: WEIGHT, find: find, ensure: ensure };
})((window.SOS = window.SOS || {}));

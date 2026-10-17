/* views/learn.js — Learn hub.
 *   #/learn                 index: every chapter has a big Watch button (straight to the Watch screen) and a
 *                           smaller "Chapter" link; subject filter, search, "to do only"
 *   #/learn/<chapter>[?t=<topic no>]
 *                           the chapter page: lesson path (Watch, Read, Practice, Quiz, Checkpoint), the
 *                           chapter's videos as a secondary list, topics (Read), Doubt box
 * Videos play on #/watch/<chapter>/<video> (js/views-watch.js), which is the one place with a player.
 * All data and progress rules are in js/learn.js (S.learn); this file only draws. The helpers the Watch
 * screen shares (fmtDur, langBadge, ytLink, doubtHtml) are exported as S.learnUI at the end.
 *
 * Old links #/learn/<chapter>?v=<video> still work: they are forwarded to the Watch screen.
 */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const ui = S.ui;
  const store = S.store;
  const L = S.learn;
  S.views = S.views || {};
  const isChapter = (id) => !!id && Object.prototype.hasOwnProperty.call(D.CH, id);

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths', cs: 'Computer Science' };
  const STEP_LABEL = { watch: 'Watch', read: 'Read', practice: 'Practice', quiz: 'Quiz', checkpoint: 'Checkpoint' };
  const view = { subj: 'all', q: '', todo: false, doubtTopic: '', doubt: '', copied: '' };

  /* ---------------- the notes of a chapter (data/learn-c/<chapter>.js), loaded when the chapter is opened ---------------- */
  const NOTES_TIMEOUT_MS = 20000;
  const pending = {}; // chapter id -> the promise of a load in progress (never two script tags for one chapter)
  // Starts loading the chapter's notes if they are not there yet. Always returns a promise of the state:
  // 'ready', 'none' (the chapter has no notes) or 'failed'. When a load ends, the screen is redrawn.
  function ensureNotes(chId) {
    const st = L.notesState(chId);
    if (st === 'ready' || st === 'none' || st === 'failed') return Promise.resolve(st); // a failure waits for Try again: no endless retry
    if (pending[chId]) return pending[chId];
    L.setNotesState(chId, 'loading');
    pending[chId] = new Promise((resolve) => {
      const el = document.createElement('script');
      let done = false;
      const end = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (!ok && el.parentNode) el.parentNode.removeChild(el); // a failed script must not stay in the page (a retry adds a new one)
        delete pending[chId];
        if (ok && L.mergeNotes(chId)) resolve('ready');
        else {
          L.setNotesState(chId, 'failed');
          resolve('failed');
        }
      };
      const timer = setTimeout(() => end(false), NOTES_TIMEOUT_MS);
      el.src = 'data/learn-c/' + encodeURIComponent(chId) + '.js';
      el.async = true;
      el.onload = () => end(true);
      el.onerror = () => end(false);
      document.head.appendChild(el);
    }).then((state) => {
      S.app.refresh(true);
      return state;
    });
    return pending[chId];
  }
  // What a card shows in place of the notes while they are not there: "Loading notes" or a clear failure with Try again.
  function notesStateHtml(chId, testid) {
    const st = L.notesState(chId);
    if (st === 'failed') {
      return '<div data-testid="' + testid + '-failed"><p class="small">The notes for this chapter could not be loaded. Check the connection and try again.</p>' +
        '<button class="btn tonal rip" data-act="lv-notes-retry" data-ch="' + u.esc(chId) + '">Try again</button></div>';
    }
    return '<p class="small muted" role="status" data-testid="' + testid + '-loading">Loading notes…</p>';
  }

  /* ---------------- small pieces ---------------- */
  const fmtDur = (s) => {
    s = Math.round(s || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
  };
  const pickBadge = (v) => (v && v.pick ? ' <span class="chip-s ok lv-pick" data-testid="pick-badge">Her pick</span>' : '');
  const langBadge = (l) => '<span class="chip-s lv-lang" data-lang="' + l + '">' + u.esc(L.LANG_LABEL[l] || l) + '</span>';
  const ytLink = (vid, t) => 'https://www.youtube.com/watch?v=' + encodeURIComponent(vid) + (t ? '&t=' + Math.floor(t) + 's' : '');
  const watchHash = (ch, vid, auto) => '#/watch/' + ch + '/' + vid + (auto ? '?auto=1' : '');
  const shortTitle = (t, n) => (t.length > n ? t.slice(0, n - 1).trim() + '…' : t);
  // "lecture 3" for a series video, else its title cut short.
  const videoLabel = (v) => (v.n ? 'lecture ' + v.n : '"' + shortTitle(v.t, 34) + '"');
  // What the Watch button opens, in words.
  function targetLine(tg) {
    if (!tg) return '';
    const lbl = videoLabel(tg.v);
    const p = L.progress(tg.v.id) || {};
    if (tg.why === 'resume') return 'Resume ' + lbl + ' at ' + fmtDur(L.resumeAt(tg.v.id) || p.pos);
    if (tg.why === 'next') return 'Next: ' + lbl;
    if (tg.why === 'again') return 'All watched. Starts again at ' + lbl;
    if (tg.why === 'pick') return 'Starts at your pick: ' + lbl;
    return 'Starts at ' + lbl;
  }

  /* ================= chapter page ================= */
  function stepsHtml(chId) {
    const tg = L.watchTarget(chId);
    return (
      '<section class="card"><h2 class="h3">Lesson path</h2><ol class="lv-steps" data-testid="lv-steps">' +
      L.steps(chId).map((s) => {
        let act = '';
        if (s.key === 'watch' && s.available && tg) act = '<button class="btn tonal sm rip" data-act="go" data-to="' + watchHash(chId, tg.v.id) + '">Watch</button>';
        if (s.key === 'read') act = '<button class="btn tonal sm rip" data-act="lv-scroll" data-to="lv-read">Read</button>';
        if (s.key === 'practice' && s.available) act = '<button class="btn tonal sm rip" data-act="lv-practice" data-id="' + chId + '">Practice</button>';
        if (s.key === 'quiz' && s.available) act = '<button class="btn tonal sm rip" data-act="lv-quiz" data-id="' + chId + '">Start quiz</button>';
        if (s.key === 'checkpoint' && s.available) act = '<button class="btn tonal sm rip" data-act="lv-checkpoint" data-id="' + chId + '" data-testid="lv-checkpoint">Start</button>';
        return '<li class="lv-step' + (s.done ? ' is-done' : '') + (s.available ? '' : ' is-na') + '" data-step="' + s.key + '"><span class="lv-dot" aria-hidden="true">' + (s.done ? u.icon('check') : '') + '</span>' +
          '<span class="lv-step-b"><b>' + STEP_LABEL[s.key] + '</b><small>' + (s.done ? 'Done · ' : s.available ? 'Not done · ' : '') + u.esc(s.note) + '</small></span>' + act + '</li>';
      }).join('') + '</ol></section>'
    );
  }

  function langLine(chId) {
    const r = L.langReport(chId);
    if (r.none) return '';
    const order = L.langOrder();
    const missing = order.filter((l) => r.have.indexOf(l) < 0).map((l) => L.LANG_LABEL[l]);
    const list = missing.length > 1 ? missing.slice(0, -1).join(', ') + ' or ' + missing[missing.length - 1] : missing[0];
    return '<p class="small" data-testid="lv-langs">JR College videos first, then your language order. ' +
      (missing.length ? 'No ' + list + ' video found yet.' : '') +
      ' <button class="link" data-act="go" data-to="#/me?lang=1">Language order</button></p>';
  }

  // The big Watch button of the chapter page.
  function watchHero(chId) {
    const tg = L.watchTarget(chId);
    if (!tg) return '<div class="card lv-na" data-testid="lv-no-videos">' + u.icon('play') + '<b>Videos coming</b><p class="small muted">No video has been picked for this chapter yet.</p></div>';
    return (
      '<section class="card stack lv-hero"><button class="btn primary block lv-watch rip" data-act="go" data-to="' + watchHash(chId, tg.v.id) + '" data-testid="lv-watch-main">' + u.icon('play') + 'Watch</button>' +
      '<p class="small" data-testid="lv-opens">' + u.esc(targetLine(tg)) + ' · ' + u.esc(L.channelName(tg.v)) + ' ' + langBadge(tg.v.l) + '</p>' + langLine(chId) + '</section>'
    );
  }

  // The chapter's videos, kept as a secondary list: the Watch button above is the main way in.
  function videoListHtml(chId) {
    const vids = L.videos(chId);
    if (!vids.length) return '';
    const cur = (L.lastVideo() || {}).v;
    return (
      '<details class="card lv-more" data-testid="lv-more" id="lv-more"><summary><b>All videos in this chapter</b><small>' + vids.length + '</small></summary>' +
      '<ul class="recs lv-vids" data-testid="lv-vids">' + vids.map((v) => {
        const p = L.progress(v.id) || {};
        return '<li><button class="rec rip' + (cur && v.id === cur.id ? ' is-cur' : '') + '" data-act="go" data-to="' + watchHash(chId, v.id) + '">' + (p.watched ? u.icon('check-c') : u.icon('play')) +
          '<span><b>' + u.esc(v.t) + '</b><small>' + u.esc(L.channelName(v)) + ' · ' + fmtDur(v.d) + (p.b && !p.watched ? ' · ' + Math.round(L.playedShare(p) * 100) + '% played' : '') + (L.youtubeOnly(v) ? ' · YouTube only' : '') + ' ' + langBadge(v.l) + pickBadge(v) + '</small></span></button></li>';
      }).join('') + '</ul></details>'
    );
  }

  function readHtml(chId, focusTopic) {
    const cd = L.chData(chId);
    const c = D.CH[chId];
    const read = (store.get('learn').steps[chId] || {}).read;
    const tb = c.tb ? 'textbook chapter ' + c.tb + (c.part ? ' (Part ' + c.part + ')' : '') + (c.pages ? ', pp.' + c.pages[0] + '-' + c.pages[1] + (c.book ? ' (' + c.book + ')' : '') : '') : 'your textbook';
    let body;
    if (cd.topics) {
      body =
        (cd.src
          ? '<p class="small">Read in your book: <b>' + u.esc(c.pages ? 'pp.' + c.pages[0] + '–' + c.pages[1] + (c.book ? ' (' + c.book + ')' : '') : 'your textbook') + '</b></p>' +
            '<p class="small" data-testid="lv-src"><span class="chip-s warn" data-draft="1">Draft topics, check with your book</span> Titles only. Source: ' + u.esc(cd.src) + '. Your book’s contents page is the full list.</p>'
          : '<p class="small">Read in your book: <b>' + u.esc(L.bookRef(chId)) + '</b></p>' +
            '<p class="small"><span class="chip-s warn" data-draft="1">Draft, check with your book</span> Summaries are short and in simple words. Formulas and full explanations are in the book.</p>') +
        '<div class="lv-topics" data-testid="lv-topics">' + cd.topics.map((t) =>
          '<details class="lv-topic" id="lv-t-' + t.no.replace('.', '-') + '"' + (focusTopic === t.no ? ' open' : '') + '><summary><b>' + u.esc((cd.lst ? '' : t.no + ' ') + t.t) + '</b>' + (t.p != null ? '<small>p.' + t.p + '</small>' : '') + '</summary>' +
          (t.s ? '<p class="lv-sum">' + u.esc(t.s) + '</p>' : t.h ? notesStateHtml(chId, 'lv-notes') : cd.src ? '' : '<p class="small muted">No summary yet.</p>') +
          (cd.src ? '' : '<p class="tiny muted lv-ref">' + u.esc(L.bookRef(chId, t)) + '</p>') +
          (t.sub.length ? '<ul class="lv-sub small">' + t.sub.map((x) => '<li>' + u.esc(x) + '</li>').join('') + '</ul>' : '') + '</details>').join('') + '</div>' +
        (cd.missing ? '<p class="small muted">Not listed here: ' + cd.missing.join(', ') + ' (see your book).</p>' : '') +
        (cd.src ? '' : '<p class="tiny muted">This topic list comes from the contents of the book and may miss a section. Your book’s contents page is the full list.</p>');
    } else {
      body = '<p class="small" data-testid="lv-topics-coming"><b>Topics coming.</b> Read it in ' + u.esc(tb) + '.</p>';
    }
    return (
      '<section class="card stack" id="lv-read"><h2 class="h3">Read</h2>' + body +
      '<button class="btn ' + (read ? 'tonal' : 'primary') + ' block rip" data-act="lv-read" data-id="' + chId + '" data-testid="lv-mark-read">' + u.icon('check') + (read ? 'Read on ' + u.esc(u.dateShort(read)) + ' (undo)' : 'Mark as read') + '</button></section>'
    );
  }

  function doubtHtml(chId) {
    const cd = L.chData(chId);
    const topics = cd.topics || [];
    const prompt = L.doubtPrompt(chId, view.doubtTopic, view.doubt || '(write your question above)');
    return (
      '<section class="card stack" id="lv-doubt"><h2 class="h3">Doubt</h2>' +
      '<p class="small muted">Write your question. The app makes a ready prompt you can paste into any chat app, or show your teacher. Nothing is sent from here.</p>' +
      (topics.length ? ui.field('Topic', ui.select('lv-dt', [{ v: '', t: 'Whole chapter' }].concat(topics.map((t) => ({ v: t.no, t: (cd.lst ? '' : t.no + ' ') + t.t }))), view.doubtTopic).replace('<select ', '<select data-change="lv-dt" ')) : '') +
      '<label class="field"><span class="field-l">Your question</span><textarea rows="3" maxlength="800" data-input="lv-doubt" data-testid="lv-doubt">' + u.esc(view.doubt) + '</textarea></label>' +
      '<label class="field"><span class="field-l">Prompt to paste</span><textarea rows="6" readonly id="lv-prompt" data-testid="lv-prompt">' + u.esc(prompt) + '</textarea></label>' +
      '<button class="btn primary block rip" data-act="lv-copy" data-id="' + chId + '" data-testid="lv-copy"' + (view.doubt.trim() ? '' : ' disabled') + '>' + (view.copied === chId ? 'Copied' : 'Copy prompt') + '</button></section>'
    );
  }

  function topHtml(chId) {
    const c = D.CH[chId];
    return '<header class="page-h"><div><h1 class="h1">' + u.esc(c.name) + '</h1><p class="muted">' + NAMES[c.subj] + ' · ' + c.std + 'th' + (c.tb ? ' · Textbook chapter ' + c.tb : '') + '</p></div></header>' +
      watchHero(chId) + stepsHtml(chId);
  }
  function restHtml(chId, focusTopic) {
    return videoListHtml(chId) + readHtml(chId, focusTopic);
  }

  function renderChapter(root, ctx, chId) {
    const query = ctx.query || {};
    ensureNotes(chId); // the topics below need the chapter's notes; the page redraws when they arrive
    if (query.v && L.chData(chId).v.some((x) => x.id === query.v)) {
      // an old link: the player lives on the Watch screen now
      location.replace(watchHash(chId, query.v, query.auto === '1'));
      return;
    }
    // A refresh (store change): redraw the parts, keep the topics she opened and the Doubt box she is typing in.
    const page = u.$('.lv-page', root);
    if (!ctx.first && page && page.dataset.ch === chId && u.$('#lv-rest', root)) {
      const open = u.$$('details[open]', root).map((d) => d.id);
      u.$('#lv-top', root).innerHTML = topHtml(chId);
      u.$('#lv-rest', root).innerHTML = restHtml(chId, '');
      open.forEach((id) => {
        const d = document.getElementById(id);
        if (d) d.open = true;
      });
      const a = document.activeElement;
      if (!(a && a.closest && a.closest('#lv-doubt-box'))) u.$('#lv-doubt-box', root).innerHTML = doubtHtml(chId);
      return;
    }
    root.innerHTML = '<div class="page lv-page" data-ch="' + chId + '"><div id="lv-top">' + topHtml(chId) + '</div>' +
      '<div id="lv-rest">' + restHtml(chId, query.t) + '</div><div id="lv-doubt-box">' + doubtHtml(chId) + '</div></div>';
    if (ctx.first && query.t) setTimeout(() => {
      const el = document.getElementById('lv-t-' + String(query.t).replace('.', '-')); // not a selector: a typed address cannot throw
      if (el) el.scrollIntoView({ block: 'start' });
    }, 30);
  }

  S.views.learn = {
    title: 'Learn',
    tab: 'subjects',
    pushed: true,
    fab: false,
    pageTitle: (ctx) => (isChapter(ctx.params[0]) ? D.CH[ctx.params[0]].name : 'Learn'),
    render(root, ctx) {
      const chId = ctx.params[0];
      if (isChapter(chId)) return renderChapter(root, ctx, chId);
      if (chId) {
        root.innerHTML = '<div class="page">' + ui.empty('book', 'Chapter not found', 'This chapter is not in the syllabus.', '<button class="btn tonal rip" data-act="go" data-to="#/learn">All chapters</button>') + '</div>';
        return;
      }
      root.innerHTML = '';
      location.replace('#/subjects'); // the long Learn list is gone: Subjects is the way in (run 7)
      return;
    },
  };

  /* ================= actions ================= */
  ui.actions['lv-notes-retry'] = (el) => {
    L.setNotesState(el.dataset.ch, '');
    ensureNotes(el.dataset.ch);
    S.app.refresh(true);
  };
  ui.actions['lv-scroll'] = (el) => {
    const t = document.getElementById(el.dataset.to);
    if (t) t.scrollIntoView({ behavior: u.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  ui.actions['lv-read'] = (el) => {
    const id = el.dataset.id;
    L.markRead(id, !(store.get('learn').steps[id] || {}).read);
    u.haptic('ok');
  };
  ui.actions['lv-practice'] = (el) => S.practiceUI.start(el.dataset.id);
  ui.actions['lv-quiz'] = (el) => S.tcUI.startChapterTest(el.dataset.id);
  ui.actions['lv-checkpoint'] = (el) => S.tcUI.startCheckpoint(el.dataset.id);
  ui.changes['lv-dt'] = (el) => {
    view.doubtTopic = el.value;
    updatePrompt(el.closest('.lv-page'));
  };
  ui.inputs['lv-doubt'] = (el) => {
    view.doubt = el.value;
    view.copied = '';
    updatePrompt(el.closest('.lv-page'));
  };
  function updatePrompt(page) {
    if (!page) return;
    const chId = page.dataset.ch;
    u.$('#lv-prompt').value = L.doubtPrompt(chId, view.doubtTopic, view.doubt || '(write your question above)');
    const b = u.$('[data-act="lv-copy"]');
    if (b) {
      b.disabled = !view.doubt.trim();
      b.textContent = 'Copy prompt';
    }
  }
  ui.actions['lv-copy'] = async (el) => {
    const text = L.doubtPrompt(el.dataset.id, view.doubtTopic, view.doubt);
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      // Older WebViews: select the visible prompt and use the legacy copy command.
      const ta = u.$('#lv-prompt');
      ta.value = text;
      ta.removeAttribute('readonly');
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      ta.setAttribute('readonly', '');
    }
    view.copied = ok ? el.dataset.id : '';
    ui.toast(ok ? 'Prompt copied. Paste it into your chat app.' : 'Could not copy. Select the prompt text and copy it by hand.');
    el.textContent = ok ? 'Copied' : 'Copy prompt';
  };

  // Shared with the Watch screen (js/views-watch.js).
  S.learnUI = { fmtDur: fmtDur, langBadge: langBadge, pickBadge: pickBadge, ytLink: ytLink, watchHash: watchHash, videoLabel: videoLabel, doubtHtml: doubtHtml, NAMES: NAMES, ensureNotes: ensureNotes, notesStateHtml: notesStateHtml };
})((window.SOS = window.SOS || {}));

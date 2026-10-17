/* views/watch.js — the Watch screen:  #/watch/<chapter>/<video>[?auto=1]
 *
 * Videos first. From the top:
 *   sticky   the 16:9 player (stays on screen while she scrolls the notes) and, right under it, one row:
 *            Prev / Next lecture, speed, Open on YouTube (always there)
 *   below    the video's title and progress; topic chips (tap one: its summary below changes; if the video
 *            has a timestamp with that topic's name, the video jumps there too); the summary card; the
 *            Formulas card; the lecture list; the Doubt box
 * Back goes to where she came from (Learn, Home "Today", the chapter page). Moving between lectures
 * replaces the address (no new history entry), so Back is not a trail of lectures.
 * Closing the screen (any route change, or the app going to the background) saves the position and pauses.
 *
 * Player: a youtube-nocookie.com embed through the YouTube IFrame API, loaded only when a video is shown
 * and the phone is online. Offline, or if the API cannot load, a "Needs internet" card replaces it.
 * If YouTube refuses to play the video inside the app (error 2, 5, 100, 101, 150) or the data says
 * `embed: false`, a card says so, with a big Open on YouTube button; the failure is remembered
 * (learn.noEmbed) so the next visit says "YouTube only" before she taps. Progress/watched rules are
 * js/learn.js, unchanged.
 *
 * The page re-renders on every store change (app.js), which would destroy the iframe: while a player is
 * mounted for this address only the parts around it are redrawn, region by region, and a region is redrawn
 * only if the HTML we last put there differs (the cache is ours: the browser re-serialises innerHTML, so
 * comparing with it never matches). Progress text, the one thing that changes while a video plays, has its own
 * region; the topic chips and the lecture list stay untouched, so their scroll position and focus survive.
 */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const ui = S.ui;
  const store = S.store;
  const L = S.learn;
  const X = S.learnUI;
  const F = S.formula;
  S.views = S.views || {};

  const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
  const API_URL = 'https://www.youtube.com/iframe_api';
  const REPORT_EVERY_S = 5;
  const picked = {}; // chapter id -> topic number she tapped (this visit only)
  // The mounted player, if any: { player, hash, ch, vid, ready, lastT, lastPos, pending, blocks, sinceReport }
  let P = null;

  const online = () => navigator.onLine !== false;
  const isChapter = (id) => !!id && Object.prototype.hasOwnProperty.call(D.CH, id);
  const find = (chId, vid) => L.chData(chId).v.filter((x) => x.id === vid)[0] || null;
  const speedLabel = (r) => r + 'x';

  /* ================= pieces ================= */
  // What the box under the sticky top holds: the player, the "cannot play inside the app" card, or the offline card.
  function boxMode(v) {
    if (L.youtubeOnly(v)) return 'card';
    return online() ? 'player' : 'offline';
  }

  function ytButton(v, cls) {
    const p = L.progress(v.id);
    return '<a class="btn ' + (cls || 'tonal') + '" href="' + u.esc(X.ytLink(v.id, p && !p.watched ? Math.floor(p.pos / 60) * 60 : 0)) + '" target="_blank" rel="noopener noreferrer" data-testid="lw-yt" aria-label="Open on YouTube">' + u.icon('share') + '<span>' + (cls ? 'Open on YouTube' : 'YouTube') + '</span></a>';
  }

  function failCard(chId, v) {
    const memo = L.embedMemo(v.id);
    const nb = L.neighbors(chId, v.id);
    const why = v.embed === false
      ? 'The channel does not allow this video to be shown inside other apps. It plays fine on YouTube.'
      : memo && memo.code === 153
      ? 'YouTube refused the player (error 153). This happens when the app is opened as a file; open it from its web address (https or localhost). It plays fine on YouTube.'
      : 'YouTube would not play it here' + (memo && memo.code ? ' (error ' + memo.code + ')' : '') + '. It may still play on YouTube.';
    return (
      '<div class="card lv-na lw-fail" data-testid="lw-fail" role="alert">' + u.icon('play') + '<b>This video cannot play inside the app</b>' +
      '<p class="small muted">' + u.esc(why) + '</p>' +
      '<a class="btn primary block lw-big" href="' + u.esc(X.ytLink(v.id)) + '" target="_blank" rel="noopener noreferrer" data-testid="lw-fail-yt">' + u.icon('share') + 'Open on YouTube</a>' +
      (nb.next ? '<button class="btn tonal block lw-big" data-act="lw-go" data-id="' + nb.next.id + '" data-testid="lw-fail-next">' + u.icon('chev-r') + (nb.inSeries ? 'Next lecture' : 'Next video') + '</button>' : '<p class="small muted">This is the last one in the list.</p>') +
      (v.embed !== false && memo ? '<button class="link" data-act="lw-retry" data-id="' + v.id + '" data-testid="lw-retry">Try inside the app again</button>' : '') + '</div>'
    );
  }

  function offlineCard(v, why, retry) {
    return (
      '<div class="card lv-na" data-testid="lv-offline">' + u.icon('play') + '<b>Needs internet</b>' +
      '<p class="small muted">' + u.esc(why || 'Videos play from YouTube, so they need a connection. Everything else on this page works offline.') + '</p>' +
      ytButton(v, 'tonal') + (retry ? '<button class="btn tonal block" data-act="lw-reload" data-testid="lw-reload">Try again</button>' : '') + '</div>'
    );
  }

  function boxHtml(chId, v) {
    const mode = boxMode(v);
    if (mode === 'card') return failCard(chId, v);
    if (mode === 'offline') return offlineCard(v);
    return '<div class="lv-player" data-testid="lv-player"><div id="lw-yt"></div></div>';
  }

  // Prev / Next lecture, speed, Open on YouTube.
  function controlsHtml(chId, v) {
    const nb = L.neighbors(chId, v.id);
    const speed = Number(store.get('learn').prefs.speed) || 1;
    const what = nb.inSeries ? 'lecture' : 'video';
    return (
      '<div class="lw-ctl" data-testid="lw-ctl">' +
      '<button class="btn tonal lw-b rip" data-act="lw-go" data-id="' + (nb.prev ? nb.prev.id : '') + '"' + (nb.prev ? '' : ' disabled') + ' aria-label="Previous ' + what + '" data-testid="lw-prev">' + u.icon('chev-l') + '<span>Prev</span></button>' +
      '<button class="btn tonal lw-b rip" data-act="lw-go" data-id="' + (nb.next ? nb.next.id : '') + '"' + (nb.next ? '' : ' disabled') + ' aria-label="Next ' + what + '" data-testid="lw-next"><span>Next</span>' + u.icon('chev-r') + '</button>' +
      '<button class="btn tonal lw-b rip" data-act="lw-speed" aria-label="Playback speed ' + speedLabel(speed) + '. Tap to change." data-testid="lw-speed"><span>' + speedLabel(speed) + '</span></button>' +
      ytButton(v) + '</div>'
    );
  }

  // The video's title and facts (changes only when the video does) ...
  function metaHtml(v) {
    return '<b class="lv-title" data-testid="lv-title" title="' + u.esc(v.t) + '">' + u.esc(L.shortTitle(v.t)) + '</b>' +
      '<p class="small muted lw-badges">' + u.esc(L.channelName(v)) + ' · ' + X.fmtDur(v.d) + ' ' + X.langBadge(v.l) + (v.n ? ' <span class="chip-s">Lecture ' + v.n + '</span>' : '') +
      (v.k === 'oneshot' ? ' <span class="chip-s">One shot</span>' : '') + X.pickBadge(v) + (L.youtubeOnly(v) ? ' <span class="chip-s warn" data-testid="lw-only">YouTube only</span>' : '') + '</p>';
  }
  // ... the progress line (the only part that changes while it plays) ...
  function progressHtml(v) {
    const p = L.progress(v.id) || {};
    return '<p class="tiny muted lw-prog" data-testid="lv-progress">' + (p.watched ? '<b class="tc-ok">Watched</b>' : p.b ? 'Played ' + Math.round(L.playedShare(p) * 100) + '% so far (watched at 80%)' : 'Not started') +
      (p.pos && !p.watched ? ' · resumes at ' + X.fmtDur(L.resumeAt(v.id)) : '') + '</p>';
  }
  // ... and the two buttons.
  function buttonsHtml(chId, v) {
    const p = L.progress(v.id) || {};
    const prefs = store.get('learn').prefs;
    return '<div class="row gap lw-btnrow"><button class="btn tonal rip lw-b lw-sm" data-act="lw-watched" data-id="' + u.esc(v.id) + '" data-ch="' + u.esc(chId) + '">' + u.icon('check') + (p.watched ? 'Mark not watched' : 'Mark watched') + '</button>' +
      (L.series(chId).length > 1 ? '<button class="btn tonal rip lw-b lw-sm" role="switch" aria-checked="' + !!prefs.autoNext + '" data-act="lw-autonext" data-testid="lw-autonext">' + (prefs.autoNext ? 'Auto-next: on' : 'Auto-next: off') + '</button>' : '') + '</div>';
  }

  // The topic she is looking at: the chip she tapped, else the chapter's first topic that has a summary.
  function currentTopic(chId) {
    const topics = L.chData(chId).topics || [];
    if (!topics.length) return null;
    const hit = topics.filter((t) => t.no === picked[chId])[0];
    return hit || topics.filter((t) => t.h)[0] || topics[0];
  }

  function chipsHtml(chId, v) {
    const cd = L.chData(chId);
    const cur = currentTopic(chId);
    if (!cd.topics) return '<p class="small muted" data-testid="lw-topics-coming"><b>Topics coming.</b> Use your textbook for this chapter.</p>';
    return (
      (cd.src ? '<p class="small"><span class="chip-s warn" data-draft="1" data-testid="lw-draft-topics">Draft topics, check with your book</span></p>' : '') +
      '<div class="chips lw-chips" role="group" aria-label="Topics of this chapter" data-testid="lw-chips">' + cd.topics.map((t) => {
        const st = v && boxMode(v) === 'player' ? L.stampFor(v, t) : null; // nothing jumps when there is no player
        return '<button class="chip rip lv-chip' + (cur && cur.no === t.no ? ' is-on' : '') + '" aria-pressed="' + !!(cur && cur.no === t.no) + '" data-act="lw-topic" data-no="' + u.esc(t.no) + '"' +
          (st ? ' data-t="' + st.t + '" title="Jumps to ' + X.fmtDur(st.t) + ' in the video"' : '') + '>' + u.esc(t.t) + (st ? ' <span class="lw-jump">' + u.icon('play') + '</span>' : '') + '</button>';
      }).join('') + '</div>'
    );
  }

  function summaryHtml(chId) {
    const cd = L.chData(chId);
    const t = currentTopic(chId);
    if (!t) {
      return '<section class="card stack" data-testid="lw-summary"><h2 class="h3">Summary</h2><p class="small muted">Topic summaries are coming for this chapter. The book has them: ' +
        u.esc(L.bookRef(chId) || (D.CH[chId].tb ? 'textbook chapter ' + D.CH[chId].tb : 'your textbook')) + '.</p></section>';
    }
    const waiting = t.h && !t.s; // the topic has notes, but the chapter's notes file has not arrived (or failed)
    return (
      '<section class="card stack" data-testid="lw-summary" data-topic="' + u.esc(t.no) + '"><h2 class="h3">' + u.esc((cd.lst ? '' : t.no + ' ') + t.t) + '</h2>' +
      (waiting ? X.notesStateHtml(chId, 'lw-notes') : t.s ? '<p class="lv-sum" data-testid="lw-concept">' + u.esc(t.s) + '</p>' + (t.d === 0 ? '' : '<p class="small"><span class="chip-s warn" data-draft="1">Draft, check with your book</span></p>')
        : '<p class="small muted">No summary for this topic yet. Read it in your book.</p>') +
      (t.w && t.w.length ? '<h3 class="h4">Watch out</h3><ul class="lv-sub small">' + t.w.map((x) => '<li>' + u.esc(x) + '</li>').join('') + '</ul>' : '') +
      '<p class="tiny muted lv-ref">' + u.esc(L.bookRef(chId, t)) + '</p>' +
      (t.sub && t.sub.length ? '<ul class="lv-sub small">' + t.sub.map((x) => '<li>' + u.esc(x) + '</li>').join('') + '</ul>' : '') + '</section>'
    );
  }

  function formulasHtml(chId) {
    const t = currentTopic(chId);
    const list = (t && t.f) || [];
    return (
      '<section class="card stack" data-testid="lw-formulas"><h2 class="h3">Formulas</h2>' +
      (t && t.h && !t.s
        ? '<p class="small muted" data-testid="lw-fx-waiting">' + (L.notesState(chId) === 'failed' ? 'Not loaded.' : 'Loading notes…') + '</p>'
        : list.length
        ? '<ul class="lw-fx-list">' + list.map((f) => '<li><span class="fx" role="math" aria-label="' + u.esc(F.plain(f.x)) + '">' + F.render(f.x) + '</span>' + (f.n ? '<small>' + F.render(f.n) + '</small>' : '') + (f.r ? '<small class="tiny muted">' + u.esc(f.r) + '</small>' : '') + '</li>').join('') + '</ul>'
        : '<p class="small muted" data-testid="lw-formulas-empty">Formulas coming</p>') + '</section>'
    );
  }

  function listHtml(chId, v) {
    const nb = L.neighbors(chId, v.id);
    if (!nb.list.length) return '';
    return (
      '<section class="card list-card" data-testid="lw-list"><h2 class="h3">' + (nb.inSeries ? 'Lectures' : 'Videos in this chapter') + '</h2><ul class="recs lv-vids">' + nb.list.map((x) => {
        const p = L.progress(x.id) || {};
        return '<li><button class="rec rip' + (x.id === v.id ? ' is-cur' : '') + '" data-act="lw-go" data-id="' + u.esc(x.id) + '"' + (x.id === v.id ? ' aria-current="true"' : '') + '>' + (p.watched ? u.icon('check-c') : u.icon('play')) +
          '<span><b>' + u.esc(x.n ? 'Lecture ' + x.n + ': ' + L.shortTitle(x.t) : L.shortTitle(x.t)) + '</b><small>' + u.esc(L.channelName(x)) + ' · ' + X.fmtDur(x.d) + (x.id !== v.id && p.b && !p.watched ? ' · ' + Math.round(L.playedShare(p) * 100) + '% played' : '') +
          (L.youtubeOnly(x) ? ' · YouTube only' : '') + ' ' + X.langBadge(x.l) + X.pickBadge(x) + '</small></span></button></li>';
      }).join('') + '</ul></section>'
    );
  }

  /* ---------- the tabs under the player (run 7): Notes, Lectures, Cards, Practice, Test ---------- */
  const TABS = [['notes', 'Notes'], ['lectures', 'Lectures'], ['cards', 'Cards'], ['practice', 'Practice'], ['test', 'Test']];
  const tabOf = {}; // chapter id -> the tab she last used there (kept while the app runs)
  const tabsHtml = (cur) =>
    '<div class="lw-tabs" role="tablist" aria-label="Chapter sections" data-testid="lw-tabs">' + TABS.map((t) =>
      '<button class="lw-tab rip" role="tab" aria-selected="' + (t[0] === cur) + '" data-act="lw-tab" data-tab="' + t[0] + '" data-testid="lw-tab-' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';

  function cardsHtml(chId) {
    const cards = (S.CONCEPT_CARDS || []).filter((c) => c.ch === chId);
    if (!cards.length) return '<section class="card" data-testid="lw-cards-empty"><h2 class="h3">Cards</h2><p class="small muted">No cards yet for this chapter.</p></section>';
    return '<section class="card stack" data-testid="lw-cards"><h2 class="h3">' + u.plural(cards.length, 'card') + '</h2><ul class="lw-cards">' + cards.map((c) =>
      '<li><details><summary>' + u.esc(c.q) + '</summary><p class="small">' + u.esc(c.a) + '</p></details></li>').join('') + '</ul>' +
      '<button class="btn tonal block rip" data-act="go" data-to="#/flashcards">' + u.icon('cards') + 'Review in Flashcards</button></section>';
  }
  function practiceHtml(chId) {
    const n = L.mcqCount(chId);
    if (!n) return '<section class="card" data-testid="lw-practice-empty"><h2 class="h3">Practice</h2><p class="small muted">No questions yet for this chapter.</p></section>';
    return '<section class="card stack" data-testid="lw-practice"><h2 class="h3">Practice</h2><p class="small muted">' + u.plural(n, 'question') + ' in the bank for this chapter. No timer; you see the answer after each one.</p>' +
      '<button class="btn primary block rip" data-act="lv-practice" data-id="' + u.esc(chId) + '" data-testid="lw-practice-start">' + u.icon('target') + 'Practise this chapter</button></section>';
  }
  function testHtml(chId) {
    const bank = S.tc ? S.tc.bankCount(chId) : 0;
    if (!bank) return '<section class="card" data-testid="lw-test-empty"><h2 class="h3">Test</h2><p class="small muted">No questions yet for this chapter.</p></section>';
    const cp = L.steps(chId).filter((x) => x.key === 'checkpoint')[0];
    return '<section class="card stack" data-testid="lw-test"><h2 class="h3">Test</h2>' +
      (cp && cp.available ? '<p class="small muted">Checkpoint: 10 questions' + (cp.note ? ' · ' + u.esc(cp.note) : '') + '.</p><button class="btn primary block rip" data-act="lv-checkpoint" data-id="' + u.esc(chId) + '" data-testid="lw-checkpoint">' + u.icon('clipboard') + 'Start the checkpoint</button>' : '') +
      '<button class="btn tonal block rip" data-act="ch-test" data-id="' + u.esc(chId) + '" data-testid="lw-chapter-test">' + u.icon('timer') + 'Timed chapter test (' + u.plural(bank, 'question') + ')</button></section>';
  }
  const moreLinksHtml = (chId) =>
    '<div class="lw-more"><button class="btn tonal sm rip" data-act="lw-details" data-id="' + u.esc(chId) + '" data-testid="lw-details">' + u.icon('settings') + 'Chapter details</button>' +
    '<button class="btn tonal sm rip" data-act="go" data-to="#/learn/' + u.esc(chId) + '" data-testid="lw-fullpage">' + u.icon('book') + 'Lesson steps</button></div>';

  // Every part of the page below the player, by element id. The page is built from these, and a refresh
  // redraws only the ones whose HTML changed since we last wrote them.
  const regions = (chId, v) => ({
    'lw-ctl-box': controlsHtml(chId, v), 'lw-meta': metaHtml(v), 'lw-prog': progressHtml(v), 'lw-btns': buttonsHtml(chId, v),
    'lw-chips-box': chipsHtml(chId, v), 'lw-sum': summaryHtml(chId), 'lw-fx': formulasHtml(chId), 'lw-list': listHtml(chId, v), 'lw-doubt': X.doubtHtml(chId),
    'lw-cards': cardsHtml(chId), 'lw-practice': practiceHtml(chId), 'lw-test': testHtml(chId),
  });
  const written = new WeakMap(); // element -> the HTML we last put in it
  function remember(root, id, html) {
    const el = u.$('#' + id, root);
    if (el) written.set(el, html);
  }
  function put(root, id, html) {
    const el = u.$('#' + id, root);
    if (!el || written.get(el) === html) return;
    el.innerHTML = html;
    written.set(el, html);
  }

  /* ================= player ================= */
  let apiPromise = null;
  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = API_URL;
      s.async = true;
      s.onerror = () => reject(new Error('The YouTube player could not load.'));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('The YouTube player did not load in time.')), 15000);
    });
    apiPromise.catch(() => (apiPromise = null)); // allow a retry on the next visit
    return apiPromise;
  }

  // Send what has played since the last report to S.learn (position, duration, seconds watched, blocks).
  function reportNow() {
    if (!P || !P.ready || !P.player || typeof P.player.getCurrentTime !== 'function') return;
    let pos = 0;
    let dur = 0;
    try {
      pos = Number(P.player.getCurrentTime()) || 0;
      dur = Number(P.player.getDuration()) || 0;
    } catch (e) {
      return;
    }
    if (!dur) return;
    const dt = P.pending;
    const blocks = Array.from(P.blocks);
    P.pending = 0;
    P.blocks.clear();
    P.sinceReport = 0;
    // Coach view was switched on or off since this player started: what she watched belongs to the other store.
    if (P.coach !== store.coach.active) return;
    L.report({ id: P.vid, ch: P.ch, pos: pos, dur: dur, dt: dt, blocks: blocks });
  }

  // Closing the screen: save the position, pause, remove the player.
  function unmount() {
    if (!P) return;
    reportNow();
    try {
      if (P.player && P.player.pauseVideo) P.player.pauseVideo();
    } catch (e) {
      /* the iframe may already be gone */
    }
    try {
      if (P.player && P.player.destroy) P.player.destroy();
    } catch (e) {
      /* the iframe may already be gone with the old page */
    }
    P = null;
    store.flush();
  }

  function mount(chId, v, auto) {
    P = { player: null, coach: store.coach.active, ch: chId, vid: v.id, ready: false, lastT: 0, lastPos: null, pending: 0, blocks: new Set(), sinceReport: 0 };
    const mine = P;
    const start = L.resumeAt(v.id);
    loadApi()
      .then((YT) => {
        if (P !== mine || !document.getElementById('lw-yt')) return;
        mine.player = new YT.Player('lw-yt', {
          host: 'https://www.youtube-nocookie.com',
          videoId: v.id,
          width: '100%',
          height: '100%',
          playerVars: { start: start, autoplay: auto ? 1 : 0, rel: 0, playsinline: 1, modestbranding: 1 },
          events: {
            onReady: (e) => {
              mine.ready = true;
              try {
                e.target.setPlaybackRate(Number(store.get('learn').prefs.speed) || 1);
              } catch (err) {
                /* not every video offers every speed */
              }
            },
            onStateChange: (e) => onState(mine, e.data),
            onError: (e) => onPlayerError(mine, e && e.data),
          },
        });
      })
      .catch((err) => {
        if (P !== mine) return;
        const box = u.$('#lw-box');
        if (!box) return;
        box.innerHTML = offlineCard(v, err.message + ' Check the connection, then try again, or use the button.', true);
        const page = u.$('.lw-page');
        if (page) {
          page.dataset.mode = 'offline';
          page.dataset.failed = '1'; // refreshes must not try the player again by themselves (Try again does)
        }
        const stick = u.$('#lw-stick');
        if (stick) stick.classList.add('is-card'); // a tall error card must not be pinned to the top
      });
  }

  // YouTube refused: remember it (so the next visit says "YouTube only") and the page swaps in the card.
  function onPlayerError(mine, code) {
    if (P !== mine || L.EMBED_ERRORS.indexOf(Number(code)) < 0) return;
    const ch = mine.ch;
    const vid = mine.vid;
    unmount();
    L.markEmbedFailed(vid, code);
    S.app.refresh(true);
    return ch;
  }

  function onState(mine, state) {
    if (P !== mine) return;
    // 1 playing, 2 paused, 0 ended (YT.PlayerState)
    if (state === 1) {
      mine.lastT = Date.now();
      mine.lastPos = null; // the next reading starts a new run of played blocks
    }
    if (state === 2 || state === 0) {
      reportNow();
      store.flush();
    }
    if (state === 0) {
      const nb = L.neighbors(mine.ch, mine.vid);
      if (nb.inSeries && nb.next && store.get('learn').prefs.autoNext) location.replace(X.watchHash(mine.ch, nb.next.id, true));
    }
  }

  /* ================= view ================= */
  const emptyPage = (icon, title, text, cta) => '<div class="page">' + ui.empty(icon, title, text, cta) + '</div>';

  function renderWatch(root, ctx, chId, v) {
    const auto = (ctx.query || {}).auto === '1';
    const page = u.$('.lw-page', root);
    const same = !ctx.first && page && page.dataset.ch === chId && page.dataset.vid === v.id && u.$('#lw-box', root);
    const R = regions(chId, v);
    if (same) {
      // A refresh (store change): swap the box only if its kind changed (or a retry was asked for), then
      // redraw the regions whose HTML changed.
      const want = page.dataset.failed === '1' && boxMode(v) === 'player' ? 'offline' : boxMode(v);
      if (page.dataset.mode !== want) {
        unmount();
        page.dataset.mode = want;
        if (want !== 'offline') delete page.dataset.failed;
        u.$('#lw-box', root).innerHTML = want === 'offline' && boxMode(v) === 'player' ? offlineCard(v, 'The YouTube player could not load. Check the connection, then try again, or use the button.', true) : boxHtml(chId, v);
        u.$('#lw-stick', root).classList.toggle('is-card', want !== 'player');
        if (want === 'player') mount(chId, v, false);
      }
      const a = document.activeElement;
      Object.keys(R).forEach((id) => {
        if (id === 'lw-doubt' && a && a.closest && a.closest('#lw-doubt')) return; // she is typing in it
        put(root, id, R[id]);
      });
      return;
    }
    unmount();
    const mode = boxMode(v);
    const tab = tabOf[chId] || 'notes';
    root.innerHTML =
      '<div class="page lv-page lw-page" data-ch="' + u.esc(chId) + '" data-vid="' + u.esc(v.id) + '" data-mode="' + mode + '" data-tab="' + tab + '">' +
      '<div class="lw-stick' + (mode === 'player' ? '' : ' is-card') + '" id="lw-stick" data-testid="lw-stick"><div id="lw-box">' + boxHtml(chId, v) + '</div><div id="lw-ctl-box">' + R['lw-ctl-box'] + '</div></div>' +
      '<section class="lw-info" id="lw-info"><div id="lw-meta">' + R['lw-meta'] + '</div><div id="lw-prog">' + R['lw-prog'] + '</div><div id="lw-btns">' + R['lw-btns'] + '</div></section>' +
      tabsHtml(tab) +
      '<div class="lw-panel lw-p-notes"><div id="lw-notes" class="lw-notes"><div id="lw-chips-box">' + R['lw-chips-box'] + '</div><div id="lw-sum">' + R['lw-sum'] + '</div><div id="lw-fx">' + R['lw-fx'] + '</div></div>' +
      '<div id="lw-doubt">' + R['lw-doubt'] + '</div>' + moreLinksHtml(chId) + '</div>' +
      '<div class="lw-panel lw-p-lectures"><div id="lw-list">' + R['lw-list'] + '</div></div>' +
      '<div class="lw-panel lw-p-cards"><div id="lw-cards">' + R['lw-cards'] + '</div></div>' +
      '<div class="lw-panel lw-p-practice"><div id="lw-practice">' + R['lw-practice'] + '</div></div>' +
      '<div class="lw-panel lw-p-test"><div id="lw-test">' + R['lw-test'] + '</div></div></div>';
    Object.keys(R).forEach((id) => remember(root, id, R[id]));
    if (mode === 'player') mount(chId, v, auto);
  }

  // A chapter without a video: the same screen, with "Videos coming" where the player would be.
  function renderNoVideo(root, chId) {
    X.ensureNotes(chId);
    const tab = tabOf[chId] || 'notes';
    root.innerHTML =
      '<div class="page lv-page lw-page is-novideo" data-ch="' + u.esc(chId) + '" data-vid="" data-mode="none" data-tab="' + tab + '">' +
      '<div class="lw-stick is-card" id="lw-stick"><div id="lw-box"><div class="card lv-na" data-testid="lv-no-videos">' + u.icon('play') + '<b>Videos coming</b><p class="small muted">No video has been picked for this chapter yet.</p></div></div></div>' +
      tabsHtml(tab) +
      '<div class="lw-panel lw-p-notes"><div id="lw-notes" class="lw-notes"><div id="lw-chips-box">' + chipsHtml(chId, null) + '</div><div id="lw-sum">' + summaryHtml(chId) + '</div><div id="lw-fx">' + formulasHtml(chId) + '</div></div>' +
      '<div id="lw-doubt">' + X.doubtHtml(chId) + '</div>' + moreLinksHtml(chId) + '</div>' +
      '<div class="lw-panel lw-p-lectures"><section class="card"><h2 class="h3">Lectures</h2><p class="small muted">No lectures yet for this chapter.</p></section></div>' +
      '<div class="lw-panel lw-p-cards"><div id="lw-cards">' + cardsHtml(chId) + '</div></div>' +
      '<div class="lw-panel lw-p-practice"><div id="lw-practice">' + practiceHtml(chId) + '</div></div>' +
      '<div class="lw-panel lw-p-test"><div id="lw-test">' + testHtml(chId) + '</div></div></div>';
  }

  S.views.watch = {
    title: 'Watch',
    tab: 'subjects',
    pushed: true,
    fab: false,
    pageTitle: (ctx) => (isChapter(ctx.params[0]) ? D.CH[ctx.params[0]].name : 'Watch'),
    // "CHEMISTRY 12 · CH 2" above the chapter name in the app bar.
    pageKicker: (ctx) => {
      const c = D.CH[ctx.params[0]];
      return c ? ({ phy: 'PHYSICS', chem: 'CHEMISTRY', mth: 'MATHS', cs: 'COMPUTER SCIENCE' })[c.subj] + ' ' + c.std + (c.tb ? ' · CH ' + c.tb : '') : '';
    },
    // Back from a Watch screen opened directly (no history to go back to) lands on the Learn index.
    backHash: () => '#/subjects',
    render(root, ctx) {
      const chId = ctx.params[0];
      const vid = ctx.params[1];
      if (!isChapter(chId)) {
        unmount();
        root.innerHTML = emptyPage('book', 'Chapter not found', 'This chapter is not in the syllabus.', '<button class="btn tonal rip" data-act="go" data-to="#/learn">All chapters</button>');
        return;
      }
      const v = vid ? find(chId, vid) : null;
      if (v) X.ensureNotes(chId); // starts loading this chapter's notes (data/learn-c); the screen redraws when they arrive
      if (!v) {
        const tg = L.watchTarget(chId);
        unmount();
        if (!tg) {
          renderNoVideo(root, chId);
          return;
        }
        root.innerHTML = '';
        location.replace(X.watchHash(chId, tg.v.id));
        return;
      }
      renderWatch(root, ctx, chId, v);
    },
    // Called by app.js before another route renders: save the position and pause while the iframe is alive.
    leave() {
      unmount();
    },
    tick() {
      if (!P || !P.ready || !P.player || typeof P.player.getPlayerState !== 'function') return;
      let state;
      try {
        state = P.player.getPlayerState();
      } catch (e) {
        return;
      }
      if (state !== 1) return;
      const now = Date.now();
      // Seconds actually played since the last tick (the tick is 1 s; a throttled tab can be slower).
      const elapsed = P.lastT ? Math.max(0, (now - P.lastT) / 1000) : 0;
      const dt = Math.min(L.MAX_TICK_S, elapsed);
      P.lastT = now;
      P.pending += dt;
      // Which 5-second blocks were really played since the last reading (a seek counts one block).
      let t = 0;
      let rate = 1;
      try {
        t = Number(P.player.getCurrentTime()) || 0;
        rate = Number(P.player.getPlaybackRate && P.player.getPlaybackRate()) || 1;
      } catch (e) {
        return;
      }
      L.playedBlocks(P.lastPos, t, elapsed, rate).forEach((k) => P.blocks.add(k));
      P.lastPos = t;
      P.sinceReport += 1;
      if (P.sinceReport >= REPORT_EVERY_S) reportNow();
    },
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && P) {
      reportNow();
      store.flush();
    }
  });
  window.addEventListener('pagehide', () => {
    if (P) {
      reportNow();
      store.flush();
    }
  });

  /* ================= actions ================= */
  const here = () => {
    const p = S.app.route();
    return p.name === 'watch' ? { ch: p.params[0], vid: p.params[1] } : null;
  };
  // Prev / Next / a lecture in the list: replace the address, so Back still returns to where she came from.
  ui.actions['lw-tab'] = (el) => {
    const page = u.$('.lw-page');
    if (!page) return;
    page.dataset.tab = el.dataset.tab;
    tabOf[page.dataset.ch] = el.dataset.tab;
    u.$$('.lw-tab', page).forEach((b) => b.setAttribute('aria-selected', String(b === el)));
  };
  ui.actions['lw-details'] = (el) => {
    if (S.subjectsUI) S.subjectsUI.openChapter(el.dataset.id);
  };
  ui.actions['lw-go'] = (el) => {
    const at = here();
    if (!at || !el.dataset.id) return;
    reportNow();
    location.replace(X.watchHash(at.ch, el.dataset.id, true));
  };
  ui.actions['lw-speed'] = () => {
    const cur = Number(store.get('learn').prefs.speed) || 1;
    const i = SPEEDS.indexOf(cur);
    const r = SPEEDS[(i + 1) % SPEEDS.length];
    store.mutate('learn', (d) => (d.prefs.speed = r));
    if (P && P.ready && P.player && P.player.setPlaybackRate) {
      try {
        P.player.setPlaybackRate(r);
      } catch (e) {
        /* not every video offers every speed */
      }
    }
  };
  ui.actions['lw-autonext'] = () => store.mutate('learn', (d) => (d.prefs.autoNext = !d.prefs.autoNext));
  ui.actions['lw-watched'] = (el) => {
    L.markWatched(el.dataset.id, el.dataset.ch, !L.isWatched(el.dataset.id));
    u.haptic('ok');
  };
  ui.actions['lw-retry'] = (el) => {
    L.clearEmbedFailed(el.dataset.id);
    S.app.refresh(true);
  };
  // A topic chip: show that topic's notes; if the video has a timestamp named after it, jump there. The chips
  // stay in place (only which one is on changes), so the row keeps its scroll position and the tapped chip its focus.
  ui.actions['lw-topic'] = (el) => {
    const at = here();
    if (!at) return;
    picked[at.ch] = el.dataset.no;
    const v = find(at.ch, at.vid);
    const root = u.$('#main');
    u.$$('#lw-chips-box .chip', root).forEach((c) => {
      const on = c.dataset.no === el.dataset.no;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    remember(root, 'lw-chips-box', chipsHtml(at.ch, v)); // the same selection, so the next refresh leaves the row alone
    put(root, 'lw-sum', summaryHtml(at.ch));
    put(root, 'lw-fx', formulasHtml(at.ch));
    if (el.dataset.t !== undefined && P && P.ready && P.player) {
      try {
        P.player.seekTo(Number(el.dataset.t), true);
        P.player.playVideo();
      } catch (e) {
        /* the player may have just been closed */
      }
    }
  };
  // "Try again" after the player could not load, and coming back online on a screen that said "Needs internet".
  function retryBox() {
    const page = u.$('.lw-page');
    if (!page) return;
    delete page.dataset.failed;
    page.dataset.mode = 'retry'; // differs from every real mode: the next render rebuilds the box
    S.app.refresh(true);
  }
  ui.actions['lw-reload'] = retryBox;
  window.addEventListener('online', () => {
    const page = u.$('.lw-page');
    if (page && page.dataset.mode === 'offline') retryBox();
  });

  // Read-only status of the mounted player, for tools/real_embed_check.js (a manual check with real YouTube).
  function playerStatus() {
    if (!P) return null;
    let state = null;
    try {
      state = P.player && P.player.getPlayerState ? P.player.getPlayerState() : null;
    } catch (e) {
      state = null;
    }
    return { vid: P.vid, ready: P.ready, state: state };
  }
  S.watchUI = { unmount: unmount, boxMode: boxMode, playerStatus: playerStatus };
})((window.SOS = window.SOS || {}));

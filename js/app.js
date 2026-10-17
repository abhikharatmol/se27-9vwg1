/* app.js — boot, hash router, app bar / tab bar chrome, preferences, PWA install + updates. */
(function (S) {
  'use strict';
  const u = S.u;
  const ui = S.ui;
  const store = S.store;
  const E = S.engine;

  // Bottom bar: Home, Subjects, Continue (opens the last video), Tests, More. `planner` and `me` stay as keys for views that
  // still name them in `tab` (Back falls back to that screen's own root).
  const ROOT_HASH = { home: '#/home', subjects: '#/subjects', continue: '#/subjects', tests: '#/tests', more: '#/more', planner: '#/planner', me: '#/me' };
  // Which sidebar item a route lights up; any route not listed belongs to More.
  const NAV_OF = {
    home: 'home', subjects: 'subjects', learn: 'subjects', watch: 'subjects', 'pyq-tracker': 'subjects',
    tests: 'tests', testcenter: 'tests', exam: 'tests', result: 'tests', practice: 'tests', q: 'tests', omr: 'tests',
    pyq: 'pyq', errors: 'errors', revision: 'revision', flashcards: 'flashcards', formulas: 'formulas', cheatsheet: 'formulas',
    planner: 'planner', focus: 'focus', analytics: 'analytics',
  };
  const BOTTOM_OF = { home: 'home', subjects: 'subjects', tests: 'tests', pyq: 'tests', errors: 'tests' }; // the rest: more
  const scrollMemo = {};
  let current = { name: 'home', params: [], query: {}, hash: '#/home' };
  let installEvent = null;
  let renderQueued = false;
  let lastRenderedHash = '';

  /* ---------- routing ---------- */
  function parse(hash) {
    const h = (hash || location.hash || '#/home').replace(/^#\/?/, '');
    const qi = h.indexOf('?');
    const path = qi >= 0 ? h.slice(0, qi) : h;
    const query = {};
    if (qi >= 0)
      h.slice(qi + 1).split('&').forEach((kv) => {
        const p = kv.split('=');
        if (p[0]) query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    const parts = path.split('/').filter(Boolean);
    let name = parts[0] || 'home';
    if (!S.views[name]) name = 'home';
    return { name: name, params: parts.slice(1), query: query, hash: '#/' + (path || 'home') + (qi >= 0 ? '?' + h.slice(qi + 1) : '') };
  }

  function chrome() {
    const v = S.views[current.name];
    const pushed = v.isPushed ? v.isPushed(current) : !!v.pushed;
    const title = v.pageTitle ? v.pageTitle(current) : v.title;
    const bar = u.$('#appbar');
    bar.classList.toggle('is-pushed', pushed);
    u.$('#bar-title').textContent = pushed ? title : 'Study OS';
    const kick = pushed && v.pageKicker ? v.pageKicker(current) : '';
    u.$('#bar-kick').textContent = kick;
    u.$('#bar-kick').hidden = !kick;
    u.$('#bar-back').hidden = !pushed;
    u.$('#bar-brand').hidden = pushed;
    document.title = (pushed ? title + ' · ' : '') + 'Study OS';
    const nav = NAV_OF[current.name] || 'more';
    const tab = BOTTOM_OF[nav] || 'more';
    u.$$('.tab').forEach((t) => {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-current', on ? 'page' : 'false');
    });
    u.$$('.sb-item').forEach((t) => {
      const on = t.dataset.nav === nav || (nav === 'more' && t.dataset.nav === 'more');
      if (on) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    u.$('#fab').hidden = v.fab === false;
    const sk = E.streak();
    u.$('#streak-n').textContent = sk.current;
    u.$('#streak').classList.toggle('is-on', sk.activeToday);
    timerChip();
    coachBanner();
  }

  // Coach view (Phase 5): persistent banner on every route while browsing a file she sent,
  // so it is never mistaken for this device's own data. Runs every render (see chrome()
  // above), same as the streak/timer chip, since store.coach can change mid-session.
  function coachBanner() {
    const el = u.$('#coach-banner');
    const on = !!store.coach.active;
    el.hidden = !on;
    if (on) el.innerHTML = '<span>Viewing: ' + u.esc(store.coach.name) + '&rsquo;s results — read-only</span><button class="cb-exit rip" data-act="coach-exit">Exit</button>';
  }

  function timerChip() {
    const chip = u.$('#timer-chip');
    const run = store.get('focus').run;
    if (!run || current.name === 'focus') return (chip.hidden = true);
    chip.hidden = false;
    const s = Math.ceil(S.focus.remaining() / 1000);
    chip.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + (run.paused != null ? ' paused' : '');
  }

  // Apply the wall clock to an active Test Center attempt BEFORE anything paints, so a
  // section lock or auto-submit that fell due while the app was closed is never missed.
  // Runs on every route render, on every foreground and on every tick.
  function examCatchUp() {
    if (!S.tc) return;
    const r = S.tc.sync();
    if (r && r.submitted && r.submitted.mode === 'pyq') ui.toast('Time is up. Enter the answer key to score "' + r.submitted.title + '".', { action: 'Key', fn: () => S.app.go('#/omr/' + r.submitted.id), ms: 8000 });
    else if (r && r.submitted) ui.toast('Time is up. "' + r.submitted.title + '" was submitted.', { action: 'Result', fn: () => S.app.go('#/result/' + r.submitted.id), ms: 8000 });
  }

  function render(first) {
    examCatchUp();
    const v = S.views[current.name];
    const main = u.$('#main');
    const top = window.scrollY;
    v.render(main, { params: current.params, query: current.query, first: !!first });
    S.charts.animate(main);
    chrome();
    if (first) {
      main.classList.remove('enter');
      void main.offsetWidth;
      if (!u.reducedMotion()) main.classList.add('enter');
      const memo = scrollMemo[current.hash];
      window.scrollTo(0, memo != null ? memo : 0);
    } else window.scrollTo(0, top);
  }

  // Fix (Phase 4): the per-question stopwatch must stop when she navigates within the app
  // (e.g. taps Home) while an exam is active, not only when the app is truly backgrounded.
  // Without this, time spent on Home/Subjects/etc. was being charged to whichever question
  // was open when she left #/exam. The exam clock itself is unaffected either way.
  function examRouteLeft(prevName, nextName) {
    if (!S.tc || prevName !== 'exam' || nextName === 'exam') return;
    S.tc.leaveExamRoute(Date.now());
    store.flush();
  }

  function route() {
    if (lastRenderedHash) scrollMemo[lastRenderedHash] = window.scrollY;
    const prevName = current.name;
    const next = parse();
    // A view may need to save state while its DOM still exists (Learn: the video position).
    const prevView = S.views[prevName];
    if (prevView && prevView.leave && lastRenderedHash && lastRenderedHash !== next.hash) prevView.leave();
    current = next;
    examRouteLeft(prevName, current.name);
    lastRenderedHash = current.hash;
    render(true);
    u.$('#main').focus({ preventScroll: true });
  }

  S.app = {
    go(hash) {
      if (location.hash === hash) return route();
      location.hash = hash;
    },
    route: () => current,
    // force = the user did something in this view, so re-render even if a text box has focus.
    refresh(force) {
      if (renderQueued && !force) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        const a = document.activeElement;
        if (!force && a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && u.$('#main').contains(a)) return;
        render(false);
      });
    },
    applyPrefs() {
      const p = store.get('profile');
      const root = document.documentElement;
      if (p.theme === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', p.theme);
      root.style.setProperty('--fs', String(p.scale));
      root.setAttribute('data-motion', u.reducedMotion() ? 'reduce' : 'full');
      const dark = p.theme === 'dark' || (p.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      u.$$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#12111F' : '#F5F4FB'));
      const btn = u.$('#theme-btn');
      if (btn) btn.innerHTML = u.icon(dark ? 'sun' : 'moon');
    },
    // Build identity (js/build-id.js, generated) and whether this is the single-file build.
    build: () => S.BUILD || 'dev',
    isStandaloneBuild: () => !!window.SOS_STANDALONE,
    canInstall: () => !!installEvent && !S.app.isStandalone(),
    isStandalone: () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    install() {
      if (!installEvent) return;
      installEvent.prompt();
      installEvent.userChoice.then(() => {
        installEvent = null;
        S.app.refresh(true);
      });
    },
  };

  /* ---------- global actions ---------- */
  ui.actions.go = (el) => {
    if (ui.sheet.isOpen()) {
      ui.sheet.close();
      setTimeout(() => S.app.go(el.dataset.to), 30);
    } else S.app.go(el.dataset.to);
  };
  ui.actions.back = () => {
    const v = S.views[current.name];
    if (history.length > 1) history.back();
    else S.app.go(v.backHash ? v.backHash(current) : ROOT_HASH[v.tab || 'home']); // a screen opened directly has no history to go back to
  };
  // The hash the Continue button opens: the last lecture at its saved position (the player resumes by itself), else
  // the next lecture, else the Subjects list.
  S.app.continueHash = () => {
    const t = S.learn && S.learn.continueTarget ? S.learn.continueTarget() : null;
    return t ? '#/watch/' + t.ch + '/' + t.v.id : '#/subjects';
  };
  ui.actions.tab = (el) => {
    const h = el.dataset.tab === 'continue' ? S.app.continueHash() : ROOT_HASH[el.dataset.tab];
    if (location.hash === h) window.scrollTo({ top: 0, behavior: u.reducedMotion() ? 'auto' : 'smooth' });
    else S.app.go(h);
  };
  ui.actions.theme = () => {
    const p = store.get('profile');
    const dark = p.theme === 'dark' || (p.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    store.mutate('profile', (x) => (x.theme = dark ? 'light' : 'dark'));
    S.app.applyPrefs();
  };
  ui.actions['coach-exit'] = () => {
    store.exitCoach();
    S.app.go('#/home');
  };

  /* Quick add (floating action button) */
  ui.actions.fab = () => {
    const rows = [
      ['timer', 'Start focus session', 'fab-focus'],
      ['clock', 'Log study time', 'fab-time'],
      ['target', 'Log questions solved', 'fab-q'],
      ['clipboard', 'Add a mock result', 'fab-mock'],
      ['notebook', 'Add a mistake to the notebook', 'fab-err'],
    ];
    ui.sheet.open({
      title: 'Quick add',
      html: '<ul class="recs">' + rows.map((r) => '<li><button class="rec rip" data-act="' + r[2] + '">' + u.icon(r[0]) + '<span><b>' + r[1] + '</b></span>' + u.icon('chev-r', 'chev') + '</button></li>').join('') + '</ul>',
    });
  };
  const later = (fn) => { ui.sheet.close(); setTimeout(fn, 280); };
  ui.actions['fab-focus'] = () => { ui.sheet.close(); setTimeout(() => S.app.go('#/focus'), 30); };
  ui.actions['fab-mock'] = () => later(() => { const type = 'cet'; const list = store.get('mocks').items.filter((m) => m.type === type).map((m) => m.slot); let n = 1; while (list.indexOf(n) >= 0 && n < 12) n++; S.testsUI.openForm(type, n); });
  ui.actions['fab-err'] = () => later(() => S.errorsUI.openForm({ subj: 'phy' }));
  ui.actions['fab-time'] = () =>
    ui.sheet.update({
      title: 'Log study time',
      html: '<form class="stack" onsubmit="return false" data-form="time"><div class="chips">' + [15, 30, 45, 60, 90].map((m) => '<button type="button" class="chip rip" data-act="fab-min" data-m="' + m + '">' + m + ' min</button>').join('') + '</div>' +
        ui.field('Minutes', '<input type="number" name="min" inputmode="numeric" min="1" max="600" placeholder="e.g. 50" id="fab-min">') +
        ui.field('Subject', ui.select('subj', [{ v: 'phy', t: 'Physics' }, { v: 'chem', t: 'Chemistry' }, { v: 'mth', t: 'Maths' }, { v: 'cs', t: 'CS' }, { v: 'other', t: 'Other' }], 'phy')) +
        '<button class="btn primary block rip" data-act="fab-time-save">Save</button></form>',
    });
  ui.actions['fab-min'] = (el) => { u.$('#fab-min').value = el.dataset.m; };
  ui.actions['fab-time-save'] = () => {
    const v = ui.values(u.$('[data-form="time"]'));
    const m = Math.round(u.num(v.min, 0));
    if (m < 1 || m > 600) return ui.toast('Enter minutes between 1 and 600.');
    E.logStudy({ min: m, subj: v.subj });
    ui.sheet.close();
    u.haptic('ok');
    ui.toast(u.fmtMin(m) + ' added to today');
  };
  ui.actions['fab-q'] = () =>
    ui.sheet.update({
      title: 'Log questions solved',
      html: '<form class="stack" onsubmit="return false" data-form="q"><div class="chips">' + [10, 25, 50, 100].map((m) => '<button type="button" class="chip rip" data-act="fab-qn" data-m="' + m + '">+' + m + '</button>').join('') + '</div>' +
        ui.field('Number of questions', '<input type="number" name="n" inputmode="numeric" min="1" max="1000" id="fab-qn">') +
        '<button class="btn primary block rip" data-act="fab-q-save">Save</button></form>',
    });
  ui.actions['fab-qn'] = (el) => { u.$('#fab-qn').value = el.dataset.m; };
  ui.actions['fab-q-save'] = () => {
    const n = Math.round(u.num(ui.values(u.$('[data-form="q"]')).n, 0));
    if (n < 1 || n > 1000) return ui.toast('Enter between 1 and 1000.');
    E.logStudy({ mcq: n });
    ui.sheet.close();
    u.haptic('ok');
    ui.toast(n + ' questions added to today');
  };

  /* ---------- achievements ---------- */
  const checkBadges = u.debounce(() => {
    const fresh = E.checkBadges();
    if (!fresh.length) return;
    const gold = fresh.some((b) => b.tier === 'gold');
    u.haptic('ok');
    ui.confetti(gold ? 160 : 90);
    ui.toast(fresh.length === 1 ? 'Badge unlocked: ' + fresh[0].title : fresh.length + ' badges unlocked', { action: 'View', fn: () => S.app.go('#/badges'), ms: 6000 });
  }, 500);

  /* ---------- store listener ---------- */
  store.on((keys) => {
    if (keys[0] === '__error__') {
      ui.toast(store.status.error + '. Your last change may not be saved. Export a backup.', { ms: 7000 });
      return;
    }
    if (keys.indexOf('profile') >= 0) S.app.applyPrefs();
    S.app.refresh(false);
    checkBadges();
  });

  /* ---------- service worker + install ---------- */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    if (current.name === 'me') S.app.refresh(true);
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    ui.toast('Study OS installed');
  });

  // A new version that has installed but not taken over yet. While one is waiting, Home and
  // Profile show a persistent "Update ready" banner (the 15 s toast alone is easy to miss).
  let waitingWorker = null;
  let swReg = null;
  let lastUpdateCheck = 0;
  const UPDATE_CHECK_EVERY = 60 * 60 * 1000;
  function setWaiting(w) {
    waitingWorker = w;
    S.app.refresh(true);
  }
  /* ---------- protected storage (B2) ---------- */
  // Asks the browser once to keep this app's data (navigator.storage.persist) after the first real use: a first change to her
  // data at least 20 s after the app opened, never on the first paint. The answer is read back with S.app.storageProtected().
  let persistAsked = false;
  const openedAt = Date.now();
  function askPersist() {
    if (persistAsked || Date.now() - openedAt < 20000) return;
    persistAsked = true;
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      /* not available: Settings then says "Not protected" */
    }
  }
  store.on(() => askPersist());
  // Resolves to true / false; never rejects.
  S.app.storageProtected = () => {
    try {
      if (navigator.storage && navigator.storage.persisted) return navigator.storage.persisted().then((v) => !!v, () => false);
    } catch (e) {
      /* fall through */
    }
    return Promise.resolve(false);
  };
  S.app.updateReady = () => !!waitingWorker;
  S.app.applyUpdate = () => {
    if (waitingWorker) waitingWorker.postMessage('skip-waiting');
  };
  // Test hook: pretend a worker is waiting.
  S.app._simulateWaiting = setWaiting;
  S.app.updateBannerHtml = () =>
    waitingWorker
      ? '<button class="banner update-banner rip" data-act="apply-update" data-testid="update-banner">' + u.icon('refresh') + '<span>Update ready - tap to refresh</span></button>'
      : '';
  ui.actions['apply-update'] = () => S.app.applyUpdate();
  // Ask the browser to check for a new service worker when the app returns to the foreground,
  // at most once an hour. Returns true if it asked.
  S.app.checkForUpdate = (now) => {
    if (!swReg || now - lastUpdateCheck < UPDATE_CHECK_EVERY) return false;
    lastUpdateCheck = now;
    swReg.update().catch(() => {});
    return true;
  };

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('./service-worker.js').then((reg) => {
      swReg = reg;
      lastUpdateCheck = Date.now(); // register() itself just checked
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            setWaiting(nw);
            ui.toast('A new version is ready', { action: 'Refresh', fn: () => nw.postMessage('skip-waiting'), ms: 15000 });
          }
        });
      });
    }).catch((err) => console.warn('Service worker not registered:', err && err.message));
    // The first install also fires controllerchange (clients.claim). Only reload for real updates.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      store.flush();
      location.reload();
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    let migrated = null;
    try {
      migrated = S.migrate.run();
    } catch (e) {
      console.error('Migration failed:', e);
      ui.toast('Could not import old data: ' + (e && e.message));
    }
    S.app.applyPrefs();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', S.app.applyPrefs);

    window.addEventListener('popstate', () => {
      if (ui.handlePop()) {
        // The pop was consumed by a sheet closing (or by the ignore flag of a history.back() still in
        // flight). If the address no longer matches what is rendered, something navigated
        // programmatically in that window (e.g. a deep link #/subjects/x?open=y): route to it,
        // or the hash changes but the screen never does.
        if (location.hash !== current.hash) route();
        return;
      }
      route();
    });
    window.addEventListener('hashchange', () => {
      if (ui.sheet.isOpen()) return;
      // popstate handles history navigation; hashchange covers programmatic location.hash changes
    });
    if (!location.hash) history.replaceState(null, '', '#/home');
    route();

    if (migrated && migrated.migrated) ui.toast('Your old Study OS data was imported.');
    if (store.status.corrupt) ui.toast('Some saved data was unreadable and was reset.', { ms: 6000 });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    F_restore();
    // Exam per-question stopwatch stops while the app is hidden (the exam clock itself keeps
    // running, as in the real exam). On return, catch up first, then restart the stopwatch.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') S.app.checkForUpdate(Date.now());
      if (!S.tc || !S.tc.active()) return;
      if (document.visibilityState === 'hidden') {
        S.tc.withActive((a) => S.tc.pause(a, Date.now()));
        store.flush();
      } else {
        examCatchUp();
        S.tc.withActive((a) => S.tc.resumeQ(a, Date.now()));
        S.app.refresh(true);
      }
    });
    setInterval(tick, 1000);
    checkBadges();
    registerSW();
    document.documentElement.classList.add('ready');
  }
  function F_restore() {
    if (S.focus && S.focus.restore) S.focus.restore();
  }
  function tick() {
    if (S.focus) S.focus.tick();
    examCatchUp();
    const v = S.views[current.name];
    if (v && v.tick) v.tick();
    timerChip();
  }

  // Hash changes made by location.hash = ... also raise popstate in all modern browsers, so route() runs once.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})((window.SOS = window.SOS || {}));

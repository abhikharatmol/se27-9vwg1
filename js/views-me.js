/* views/me.js — Profile (settings + backup), Analytics, Badges, Saved. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const ui = S.ui;
  const store = S.store;
  const CH = S.charts;
  S.views = S.views || {};

  const NAMES = { phy: 'Physics', chem: 'Chemistry', mth: 'Maths', cs: 'CS' };
  const saved = { seg: 'chapters' };

  /* ================= Profile ================= */
  function switchRow(label, sub, act, on) {
    return '<div class="set-row"><span><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span><button class="switch" role="switch" aria-checked="' + on + '" aria-label="' + label + '" data-act="' + act + '"><i></i></button></div>';
  }
  // Learn hub: the order in which video languages are offered (store.learn.prefs.langs).
  function langOrderHtml() {
    const order = S.learn.langOrder();
    return '<section class="card stack" id="pf-lang"><h2 class="h3">Video language order</h2>' +
      '<p class="small muted">Learn shows videos in this order. If a chapter has no video in your first choice, the next one is shown, with its language marked. Most videos found so far are Hinglish; very few are Marathi or English.</p>' +
      '<ol class="lang-order" data-testid="lang-order">' + order.map((l, i) =>
        '<li><b>' + (i + 1) + '. ' + S.learn.LANG_LABEL[l] + '</b><span class="row gap">' +
        '<button class="icon-btn rip" data-act="pf-lang" data-l="' + l + '" data-d="-1" aria-label="Move ' + S.learn.LANG_LABEL[l] + ' up"' + (i === 0 ? ' disabled' : '') + '>' + u.icon('chev-l') + '</button>' +
        '<button class="icon-btn rip" data-act="pf-lang" data-l="' + l + '" data-d="1" aria-label="Move ' + S.learn.LANG_LABEL[l] + ' down"' + (i === order.length - 1 ? ' disabled' : '') + '>' + u.icon('chev-r') + '</button></span></li>').join('') +
      '</ol></section>';
  }
  ui.actions['pf-lang'] = (el) => {
    const order = S.learn.langOrder();
    const i = order.indexOf(el.dataset.l);
    const j = i + Number(el.dataset.d);
    if (i < 0 || j < 0 || j >= order.length) return;
    order.splice(j, 0, order.splice(i, 1)[0]);
    store.mutate('learn', (d) => (d.prefs.langs = order));
  };

  S.views.me = {
    title: 'Profile',
    tab: 'me',
    render(root, ctx) {
      if (ctx && ctx.first && ctx.query && ctx.query.lang) setTimeout(() => { const el = u.$('#pf-lang'); if (el) el.scrollIntoView({ block: 'start' }); }, 60);
      const p = store.get('profile');
      const st = E.stats();
      const badges = Object.keys(store.get('analytics').badges).length;
      const app = S.app;
      const openEx = u.$$('.ex-edit[open]', root).map((d) => d.id);
      const ex = examsHtml();
      root.innerHTML =
        '<div class="page">' + app.updateBannerHtml() +
        (!store.status.persistent ? '<div class="banner warn" role="alert">Your progress cannot be saved in this browser mode. Open the app in normal (not private) mode.</div>' : '') +
        '<section class="card profile"><span class="avatar" aria-hidden="true">' + u.esc((p.name.trim()[0] || 'S').toUpperCase()) + '</span>' +
        '<div class="grow"><h1 class="h2">' + u.esc(p.name) + '</h1><p class="muted small">Class 12 · MHT-CET · JEE Main · HSC</p></div>' +
        '<button class="icon-btn rip" aria-label="Change name" data-act="pf-name">' + u.icon('edit') + '</button></section>' +
        '<section class="card"><div class="stats4">' +
        '<div><b class="num">' + st.streak + '</b><small>Streak</small></div><div><b class="num">' + u.fmtHours(st.totalMin) + '</b><small>Studied</small></div>' +
        '<div><b class="num">' + st.totalMcq + '</b><small>Questions</small></div><div><b class="num">' + st.chaptersDone + '</b><small>Chapters</small></div></div>' +
        '<div class="goals"><span>CET ' + u.esc(p.goals.cet) + '</span><span>JEE ' + u.esc(p.goals.jee) + '</span><span>HSC ' + u.esc(p.goals.hsc) + '</span></div></section>' +
        '<section class="card list-card"><ul class="tools">' +
        [['analytics', 'chart', 'Analytics', 'Hours, heatmap, weak chapters, forecast'], ['badges', 'trophy', 'Achievements', badges + ' of ' + E.BADGES.length + ' earned'], ['saved', 'star', 'Saved', 'Bookmarked chapters, formulas, errors, mocks'], ['flags', 'note', 'Flagged questions (' + S.practice.flags().length + ')', 'Questions you marked to check']]
          .map((t) => '<li><button class="rec rip" data-act="go" data-to="#/' + t[0] + '">' + u.icon(t[1]) + '<span><b>' + t[2] + '</b><small>' + t[3] + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>').join('') +
        '</ul></section>' +
        '<section class="card stack"><h2 class="h3">Appearance</h2>' +
        '<div><span class="field-l">Theme</span>' + ui.seg('pf-theme', [{ v: 'system', t: 'Auto' }, { v: 'light', t: 'Light' }, { v: 'dark', t: 'Dark' }], p.theme) + '</div>' +
        '<div><span class="field-l">Text size</span>' + ui.seg('pf-scale', [{ v: '0.9', t: 'Small' }, { v: '1', t: 'Default' }, { v: '1.15', t: 'Large' }, { v: '1.3', t: 'Extra' }], String(p.scale)) + '</div>' +
        '<div><span class="field-l">Animations</span>' + ui.seg('pf-motion', [{ v: 'system', t: 'Auto' }, { v: 'full', t: 'On' }, { v: 'reduce', t: 'Reduced' }], p.motion) + '</div>' +
        switchRow('Haptic feedback', 'A short buzz on taps and wins', 'pf-haptics', p.haptics) + '</section>' +
        langOrderHtml() +
        '<section class="card stack"><h2 class="h3">Daily targets</h2><div class="row gap">' +
        ui.field('Study hours', '<input type="number" inputmode="decimal" min="1" max="16" step="0.5" value="' + p.hours + '" data-change="pf-hours">') +
        ui.field('Questions', '<input type="number" inputmode="numeric" min="10" max="500" step="10" value="' + p.mcq + '" data-change="pf-mcq">') + '</div>' +
        '<p class="small muted">A day counts for your streak when you log 1 hour, solve 30 questions, or complete the planner day.</p></section>' +
        ex +
        (store.coach.active
          ? '<section class="card stack"><h2 class="h3">Your data</h2><p class="small muted">You are viewing ' + u.esc(store.coach.name) + '&rsquo;s results (read-only). This phone&rsquo;s own data is untouched. Use Exit at the top to go back.</p></section>'
          : '<section class="card stack"><h2 class="h3">Your data</h2><p class="small muted">Everything is stored on this phone (' + store.sizeKB() + ' KB). Export a backup now and then.</p>' +
            '<p class="small" data-testid="storage-line">Storage: checking…</p>' +
            '<p class="small muted" data-testid="sent-line">Last sent: ' + (S.summary.lastSent() ? u.esc(u.dateShort(S.summary.lastSent())) : 'never') + '</p>' +
            '<button class="btn primary block rip" data-act="pf-send-coach">' + u.icon('share') + 'Send to coach</button>' +
            '<div class="row gap"><button class="btn tonal grow rip" data-act="pf-export">' + u.icon('download') + 'Export backup</button>' +
            '<label class="btn tonal grow rip filebtn">' + u.icon('upload') + 'Restore<input type="file" accept="application/json,.json" data-change="pf-import" hidden></label></div>' +
            '<button class="btn danger block rip" data-act="pf-reset">Reset all data</button></section>' +
            '<section class="card stack"><h2 class="h3">Coach view</h2><p class="small muted">Open a results file a student sent you. You browse it fully, read-only — nothing you see or do here is ever saved to this phone, and your own data is never touched.</p>' +
            '<label class="btn tonal block rip filebtn">' + u.icon('eye') + 'Open a student&rsquo;s file<input type="file" accept="application/json,text/plain,.json,.txt" data-change="coach-file" hidden></label></section>') +
        (app.canInstall() ? '<section class="card"><h2 class="h3">Install</h2><p class="small muted">Add Study OS to your home screen. It opens full screen and works offline.</p><button class="btn primary block rip" data-act="pf-install" style="margin-top:10px">Install app</button></section>' : '') +
        '<p class="muted small center note-line" data-testid="build-line">Engineering 2027 Study OS · version ' + u.esc(S.APP_VERSION) + ' · build ' + u.esc(app.build()) + (app.isStandaloneBuild() ? ' · standalone build (no updates)' : '') + '<br>' + (app.isStandalone() ? 'Running as an installed app' : 'Running in the browser') + '</p></div>';
      // Plain words for the storage state (read from the browser; never fails).
      app.storageProtected().then((on) => {
        const el = u.$('[data-testid="storage-line"]', root);
        if (el) el.innerHTML = on ? '<b>Storage: Protected.</b> The browser will not clear your progress to free up space.' : '<b>Storage: Not protected.</b> The browser may clear your progress if the phone runs low on space. Use Send progress now and then.';
      });
      // The page is redrawn after every edit: keep the exam forms she has open open.
      openEx.forEach((id) => {
        const d = document.getElementById(id);
        if (d) d.open = true;
      });
    },
  };

  ui.actions['pf-theme'] = (el) => { store.mutate('profile', (p) => (p.theme = el.dataset.v)); S.app.applyPrefs(); };
  ui.actions['pf-scale'] = (el) => { store.mutate('profile', (p) => (p.scale = Number(el.dataset.v))); S.app.applyPrefs(); };
  ui.actions['pf-motion'] = (el) => { store.mutate('profile', (p) => (p.motion = el.dataset.v)); S.app.applyPrefs(); };
  ui.actions['pf-haptics'] = () => { store.mutate('profile', (p) => (p.haptics = !p.haptics)); u.haptic(); };
  ui.actions['pf-name'] = () =>
    ui.sheet.open({
      title: 'Your name',
      html: '<form class="stack" onsubmit="return false" data-form="name">' + ui.field('Shown in the greeting', '<input name="name" maxlength="30" value="' + u.esc(store.get('profile').name) + '" autocomplete="off">') + '<button class="btn primary block rip" data-act="pf-name-save">Save</button></form>',
    });
  ui.actions['pf-name-save'] = () => {
    const v = ui.values(u.$('[data-form="name"]')).name.trim();
    if (!v) return;
    store.mutate('profile', (p) => (p.name = v));
    ui.sheet.close();
  };
  ui.changes['pf-hours'] = (el) => store.mutate('profile', (p) => (p.hours = u.clamp(u.num(el.value, 10), 1, 16)));
  ui.changes['pf-mcq'] = (el) => store.mutate('profile', (p) => (p.mcq = u.clamp(Math.round(u.num(el.value, 90)), 10, 500)));
  // Exam dates (js/exams.js): a date, a window text, "official", a note. A date is only ever put here by her or
  // from an official notice; with no date the Home countdown shows the window text.
  function examsHtml() {
    const X = S.exams;
    // The list is already cleaned (js/exams.js); id and status are escaped once more because they go into attributes.
    const row = (raw) => {
      const e = Object.assign({}, raw, { id: u.esc(raw.id), status: u.esc(raw.status) });
      const c = X.countdown(e);
      const short = c.kind === 'days' ? u.plural(c.n, 'day') + ' left' : c.kind === 'today' ? 'Today' : c.kind === 'done' ? 'Done' : c.kind === 'window' ? 'No date yet' : 'No date set';
      return '<details class="ex-edit" id="ex-' + e.id + '" data-testid="ex-' + e.id + '"><summary><b>' + u.esc(e.name) + '</b><span class="chip-s ' + (e.status === 'official' ? 'ok' : 'warn') + '">' + X.STATUS_LABEL[e.status] + '</span><small>' + short + '</small></summary>' +
        '<div class="stack">' +
        '<div class="row gap">' + ui.field('Date', '<input type="date" value="' + u.esc(e.date) + '" data-change="pf-ex-date" data-id="' + e.id + '" data-testid="ex-date-' + e.id + '">') +
        '<button class="btn tonal sm rip" data-act="pf-ex-clear" data-id="' + e.id + '"' + (e.date ? '' : ' disabled') + '>Clear date</button></div>' +
        ui.field('Window, shown while there is no date', '<input type="text" maxlength="' + X.MAX.windowText + '" value="' + u.esc(e.windowText) + '" placeholder="e.g. Expected April 2027" data-change="pf-ex-win" data-id="' + e.id + '" data-testid="ex-win-' + e.id + '">') +
        '<div><span class="field-l">Status</span>' + ui.seg('pf-ex-status', [{ v: 'expected', t: 'Expected' }, { v: 'official', t: 'Official' }], e.status).replace(/data-act="pf-ex-status"/g, 'data-act="pf-ex-status" data-id="' + e.id + '"') + '</div>' +
        ui.field('Note', '<input type="text" maxlength="' + X.MAX.note + '" value="' + u.esc(e.note) + '" data-change="pf-ex-note" data-id="' + e.id + '" data-testid="ex-note-' + e.id + '">') +
        '</div></details>';
    };
    return '<section class="card stack" data-testid="exam-dates"><h2 class="h3">Exam dates</h2>' +
      '<p class="small muted">A date is here only when you or an official notice put it here. Mark an exam Official once you have read the exam body’s own notice. With no date, the Home countdown shows the window text.</p>' +
      ui.field('Syllabus target (your own goal)', '<input type="date" value="' + u.esc(X.target()) + '" data-change="pf-ex-target" data-testid="ex-target">') +
      X.list().map(row).join('') + '</section>';
  }
  // After an edit the page is redrawn at once (refresh(true)): a date input keeps the focus after its picker closes,
  // and a plain refresh would leave the summary line and the Clear button showing the old state.
  const exDone = (r) => {
    if (!r.ok) ui.toast(r.error);
    S.app.refresh(true);
    return r.ok;
  };
  ui.changes['pf-ex-date'] = (el) => exDone(S.exams.update(el.dataset.id, { date: el.value }));
  ui.actions['pf-ex-clear'] = (el) => exDone(S.exams.update(el.dataset.id, { date: '' }));
  ui.changes['pf-ex-win'] = (el) => exDone(S.exams.update(el.dataset.id, { windowText: el.value }));
  ui.changes['pf-ex-note'] = (el) => exDone(S.exams.update(el.dataset.id, { note: el.value }));
  ui.changes['pf-ex-target'] = (el) => exDone(S.exams.setTarget(el.value));
  ui.actions['pf-ex-status'] = (el) => {
    if (!exDone(S.exams.update(el.dataset.id, { status: el.dataset.v }))) return;
    const e = S.exams.get(el.dataset.id);
    if (el.dataset.v === 'official' && e && !e.date && !e.windowText) ui.toast('Official: add the date or the window text from the notice.');
  };

  function backupPayload() {
    return JSON.stringify(store.exportAll(), null, 2);
  }
  function backupFilename() {
    return 'Engineering2027_StudyOS_backup_' + u.today() + '.json';
  }
  // Download-link fallback: used directly by "Export backup", and by "Send to coach" when
  // the Web Share API (or file sharing specifically) isn't available.
  function downloadBackup(payload, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    ui.toast('Backup saved to your downloads');
  }
  ui.actions['pf-export'] = () => downloadBackup(backupPayload(), backupFilename());
  S.backupUI = { payload: backupPayload, filename: backupFilename, download: downloadBackup };

  // "Send to coach": hands the same export payload straight to whatever share target she
  // picks (WhatsApp, email, etc.) via the Web Share API, so she doesn't have to find the
  // downloaded file herself and attach it by hand. Falls back to the plain download (same
  // as Export backup) on any browser/environment that can't share files.
  ui.actions['pf-send-coach'] = async () => {
    const payload = backupPayload();
    const filename = backupFilename();
    // Same content as Export backup, but named .txt and typed text/plain: share targets
    // (WhatsApp in particular) handle a plain-text file more reliably than application/json.
    const file = new File([payload], filename.replace(/\.json$/, '.txt'), { type: 'text/plain' });
    const canShareFile = navigator.share && navigator.canShare && navigator.canShare({ files: [file] });
    if (canShareFile) {
      try {
        await navigator.share({ files: [file], title: 'Study OS results', text: 'My Engineering 2027 Study OS progress export.' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // she cancelled the share sheet — not an error
        // any other failure (no matching app, etc.): fall through to the download fallback
      }
    }
    downloadBackup(payload, filename);
  };
  ui.changes['pf-import'] = (el) => {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    const rd = new FileReader();
    rd.onerror = () => ui.toast('Could not read that file.');
    rd.onload = async () => {
      const res = S.migrate.parseBackup(String(rd.result));
      if (!res.ok) return ui.toast(res.error, { ms: 5000 });
      const ok = await ui.confirm({
        title: 'Restore this backup?',
        text: (res.legacy ? 'This is a backup from the old Study OS. Chapters, calendar, mocks and errors will be imported. ' : '') + 'It replaces the matching data on this phone. Export a backup first if you are unsure.',
        ok: 'Restore',
        danger: true,
      });
      if (!ok) return;
      store.importAll(res.data);
      S.app.applyPrefs();
      ui.toast('Backup restored');
    };
    rd.readAsText(file);
  };
  // Coach view: opens a student's export as a read-through, in-memory shadow -- never
  // written to this phone (see store.enterCoach/js/store.js). Reuses the same validator as
  // Restore (S.migrate.parseBackup), but a legacy (pre-rewrite) backup is refused here: that
  // format's one-way migration is tooling for adopting this app on a real device, not
  // something meant to be shadowed for a read-only view.
  ui.changes['coach-file'] = (el) => {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    const rd = new FileReader();
    rd.onerror = () => ui.toast('Could not read that file.');
    rd.onload = async () => {
      const res = S.migrate.parseBackup(String(rd.result));
      if (!res.ok) return ui.toast(res.error, { ms: 5000 });
      if (res.legacy) return ui.toast('That looks like an old Study OS backup, not a current export. Ask her to export again from this app.', { ms: 6000 });
      const name = (res.data.profile && res.data.profile.name) || 'this student';
      const ok = await ui.confirm({
        title: 'Enter coach view?',
        text: 'You will see ' + name + '’s results exactly as they appear on her phone. Nothing is saved here, and your own data is never touched. Tap Exit (top of the screen) any time to leave.',
        ok: 'Enter coach view',
      });
      if (!ok) return;
      store.enterCoach(res.data, { name: name });
      S.app.go('#/home');
      ui.toast('Viewing ' + name + '’s results — read-only');
    };
    rd.readAsText(file);
  };
  ui.actions['pf-reset'] = () =>
    ui.sheet.open({
      title: 'Reset everything?',
      html: '<p class="muted">This deletes all progress, mocks, errors and settings on this phone. It cannot be undone. Type <b>RESET</b> to confirm.</p><form class="stack" onsubmit="return false"><input id="reset-t" autocomplete="off" aria-label="Type RESET"><button class="btn danger block rip" data-act="pf-reset-go">Delete everything</button></form>',
    });
  ui.actions['pf-reset-go'] = () => {
    if (u.$('#reset-t').value.trim().toUpperCase() !== 'RESET') return ui.toast('Type RESET to confirm.');
    store.resetAll();
    ui.sheet.close();
    S.app.applyPrefs();
    ui.toast('All data cleared');
  };
  ui.actions['pf-install'] = () => S.app.install();

  /* ================= Analytics ================= */
  function heatDays() {
    const t = u.today();
    const start = D.PLAN_START;
    const mondayOf = (iso) => u.addDays(iso, -((u.dow(iso) + 6) % 7));
    const first = mondayOf(start);
    const weeks = Math.ceil((u.diffDays(D.PLAN_END, first) + 1) / 7);
    const log = store.get('analytics').log;
    const out = [];
    for (let w = 0; w < weeks; w++)
      for (let d = 0; d < 7; d++) {
        const iso = u.addDays(first, w * 7 + d);
        out.push({ iso: iso, min: (log[iso] && log[iso].min) || 0, blank: iso < start || iso > D.PLAN_END, today: iso === t });
      }
    return out;
  }

  // Video time is its own bucket (store.learn.time): shown here, never added to study hours.
  function videoTimeHtml(t) {
    const today = S.learn.videoSeconds(t);
    const week = S.learn.videoSecondsBetween(u.addDays(t, -6), t);
    const fmt = (s) => (s >= 3600 ? (s / 3600).toFixed(1).replace('.0', '') + ' h' : Math.round(s / 60) + ' min');
    return '<section class="card" data-testid="video-time"><div class="row-between"><h2 class="h3">Video time</h2><span class="small muted">' + fmt(week) + ' in 7 days</span></div>' +
      '<p class="small muted">' + fmt(today) + ' today. Counted separately: video time is not added to your study hours or streak.</p></section>';
  }

  S.views.analytics = {
    title: 'Analytics',
    tab: 'me',
    pushed: true,
    render(root, ctx) {
      // Charts are built after first paint so the screen opens instantly.
      root.innerHTML = '<div class="page"><header class="page-h"><div><h1 class="h1">Analytics</h1><p class="muted">Where your time and marks are going</p></div></header><div id="an-body">' + ui.skeleton(3) + '</div></div>';
      const build = () => {
        const body = u.$('#an-body');
        if (!body) return;
        const p = store.get('profile');
        const t = u.today();
        const log = store.get('analytics').log;
        const bars = [];
        let weekMin = 0;
        for (let i = 6; i >= 0; i--) {
          const iso = u.addDays(t, -i);
          const m = (log[iso] && log[iso].min) || 0;
          weekMin += m;
          bars.push({ label: u.fmt(iso, { weekday: 'narrow' }), value: m, text: m ? (m / 60).toFixed(1).replace('.0', '') : '', today: i === 0 });
        }
        const tot = { phy: 0, chem: 0, mth: 0, cs: 0, other: 0 };
        for (let i = 0; i < 30; i++) {
          const d = log[u.addDays(t, -i)];
          if (d) Object.keys(d.subj).forEach((k) => (tot[k] = (tot[k] || 0) + d.subj[k]));
        }
        const dist = CH.stack(D.SUBJECT_ORDER.concat(['other']).map((k) => ({ label: NAMES[k] || 'Other', value: tot[k] || 0, color: CH.subjColor(k) })));
        const mocks = store.get('mocks').items.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
        const fc = E.forecast();
        const weak = E.weakList(5);
        const strong = E.strongList(5);
        const dc = E.dueCounts();
        const o = E.overall();
        const list = (arr, empty) =>
          arr.length
            ? '<ul class="recs">' + arr.map((x) => '<li><button class="rec rip" data-act="go" data-to="#/subjects/' + x.c.subj + '?open=' + x.c.id + '"><i class="dot" data-s="' + x.c.subj + '"></i><span><b>' + u.esc(x.c.name) + '</b><small>' + NAMES[x.c.subj] + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>').join('') + '</ul>'
            : '<p class="muted small">' + empty + '</p>';
        body.innerHTML =
          '<div class="stack">' +
          '<section class="card"><div class="row-between"><h2 class="h3">Study hours</h2><span class="small muted">' + u.fmtHours(weekMin) + ' in 7 days</span></div>' + CH.bars(bars, { height: 110, label: 'Study hours, last 7 days' }) + '</section>' +
          videoTimeHtml(t) +
          '<section class="card"><h2 class="h3">90-day heatmap</h2>' + CH.heat(heatDays(), p.hours * 60) + '<p class="small muted">Darker means closer to your ' + p.hours + ' hour target.</p></section>' +
          '<section class="card"><h2 class="h3">Subject split (30 days)</h2>' + (dist || '<p class="muted small">Use the Focus timer or log study time to see the split.</p>') + '</section>' +
          '<section class="card"><h2 class="h3">Mock improvement</h2>' + (mocks.length ? CH.line(mocks.map((m) => ({ y: E.mockPct(m) })), { label: 'All mock scores' }) : '<p class="muted small">Log a mock test to see your trend.</p>') + '</section>' +
          '<section class="card"><h2 class="h3">Weakest chapters</h2>' + list(weak, 'Log errors and tag weak chapters in mocks. They show up here.') + '</section>' +
          '<section class="card"><h2 class="h3">Strongest chapters</h2>' + list(strong, 'Finish and revise chapters to see your strongest ones.') + '</section>' +
          '<section class="card"><h2 class="h3">Revision due</h2><div class="stats3"><div><b class="num">' + dc.overdue + '</b><small>Overdue</small></div><div><b class="num">' + dc.today + '</b><small>Today</small></div><div><b class="num">' + dc.week + '</b><small>Next 7 days</small></div></div></section>' +
          '<section class="card"><h2 class="h3">Remaining chapters</h2><ul class="remain">' +
          D.SUBJECT_ORDER.map((s) => { const sp = E.subjectProgress(s); return '<li data-s="' + s + '"><span>' + NAMES[s] + '</span>' + CH.bar(sp.pct, 'var(--sc)') + '<small>' + (sp.total - sp.done) + ' left · ' + sp.hoursLeft + ' h</small></li>'; }).join('') + '</ul></section>' +
          '<section class="card"><h2 class="h3">Completion forecast</h2>' +
          (!fc.ok ? '<p class="muted small">' + u.esc(fc.reason) + '</p>' : fc.done ? '<p><b>Every chapter is done.</b></p>' : '<p class="fc-big">' + u.esc(u.fmt(fc.date, { day: 'numeric', month: 'short', year: 'numeric' })) + '</p><p class="small muted">At your recent pace of ' + fc.perDay.toFixed(1) + ' h per study day, the remaining ' + o.hoursLeft + ' hours of chapter work take about ' + fc.days + ' days. This is a rough guide, not a promise.</p>') + '</section></div>';
        CH.animate(body);
      };
      if (ctx.first) requestAnimationFrame(() => setTimeout(build, 30));
      else build();
    },
  };

  /* ================= Badges ================= */
  S.views.badges = {
    title: 'Achievements',
    tab: 'me',
    pushed: true,
    render(root) {
      const have = store.get('analytics').badges;
      const st = E.stats();
      const tile = (b) => {
        const v = Math.min(b.val(st), b.target);
        const on = !!have[b.id];
        return (
          '<li class="badge tier-' + b.tier + (on ? ' is-on' : '') + '"><span class="badge-i">' + u.icon(b.icon) + '</span><b>' + u.esc(b.title) + '</b><small>' + u.esc(b.desc) + '</small>' +
          (on ? '<small class="got">Earned ' + u.esc(u.dateShort(have[b.id])) + '</small>' : CH.bar(v / b.target) + '<small class="muted">' + v + ' / ' + b.target + '</small>') + '</li>'
        );
      };
      const got = E.BADGES.filter((b) => have[b.id]).length;
      root.innerHTML = '<div class="page"><header class="page-h"><div><h1 class="h1">Achievements</h1><p class="muted">' + got + ' of ' + E.BADGES.length + ' earned</p></div></header><ul class="badges">' + E.BADGES.map(tile).join('') + '</ul></div>';
    },
  };

  /* ================= Saved ================= */
  S.views.saved = {
    title: 'Saved',
    tab: 'me',
    pushed: true,
    render(root) {
      const b = store.get('bookmarks');
      const seg = saved.seg;
      let body = '';
      const ids = Object.keys(b[seg] || {});
      if (seg === 'chapters')
        body = ids.filter((i) => D.CH[i]).map((i) => '<li><button class="rec rip" data-act="ch-open" data-id="' + i + '"><i class="dot" data-s="' + D.CH[i].subj + '"></i><span><b>' + u.esc(D.CH[i].name) + '</b><small>' + NAMES[D.CH[i].subj] + '</small></span></button></li>').join('');
      if (seg === 'formulas')
        body = ids.filter((i) => S.FORMULA_BY_ID[i]).map((i) => { const f = S.FORMULA_BY_ID[i]; return '<li class="fm" data-s="' + f.subj + '"><div class="fm-h"><b>' + u.esc(f.name) + '</b><button class="icon-btn sm rip" aria-label="Remove from saved" data-act="fm-fav" data-id="' + i + '">' + u.icon('star-f') + '</button></div><div class="fm-f">' + u.esc(f.f) + '</div></li>'; }).join('');
      if (seg === 'errors') {
        const items = store.get('errors').items;
        body = ids.map((i) => items.filter((e) => e.id === i)[0]).filter(Boolean).map((e) => '<li><button class="rec rip" data-act="er-view" data-id="' + e.id + '"><i class="dot" data-s="' + e.subj + '"></i><span><b>' + u.esc(e.chapter || NAMES[e.subj]) + '</b><small>' + u.esc(e.concept.slice(0, 70)) + '</small></span></button></li>').join('');
      }
      if (seg === 'mocks') {
        const items = store.get('mocks').items;
        body = ids.map((i) => items.filter((m) => m.id === i)[0]).filter(Boolean).map((m) => '<li><button class="rec rip" data-act="mk-view" data-id="' + m.id + '"><span class="att-p">' + Math.round(E.mockPct(m)) + '%</span><span><b>' + u.esc(m.title) + '</b><small>' + u.esc(u.dateShort(m.date)) + '</small></span></button></li>').join('');
      }
      if (seg === 'cards') {
        const all = {};
        S.CONCEPT_CARDS.forEach((c) => (all[c.id] = c));
        store.get('flashcards').custom.forEach((c) => (all[c.id] = c));
        body = ids.map((i) => all[i] || (i.indexOf('f:') === 0 && S.FORMULA_BY_ID[i.slice(2)] ? { q: S.FORMULA_BY_ID[i.slice(2)].name, a: S.FORMULA_BY_ID[i.slice(2)].f } : null)).filter(Boolean).map((c) => '<li class="fm"><div class="fm-h"><b>' + u.esc(c.q) + '</b></div><div class="fm-f">' + u.esc(c.a) + '</div></li>').join('');
      }
      root.innerHTML =
        '<div class="page"><header class="page-h"><div><h1 class="h1">Saved</h1><p class="muted">Your bookmarks in one place</p></div></header>' +
        ui.seg('sv-seg', [{ v: 'chapters', t: 'Chapters' }, { v: 'formulas', t: 'Formulas' }, { v: 'errors', t: 'Errors' }, { v: 'mocks', t: 'Mocks' }, { v: 'cards', t: 'Cards' }], seg) +
        (body ? '<ul class="' + (seg === 'formulas' || seg === 'cards' ? 'fms flat' : 'recs card') + '">' + body + '</ul>' : ui.empty('star', 'Nothing saved here', 'Tap the star on ' + (seg === 'cards' ? 'a flashcard' : 'a ' + seg.slice(0, -1)) + ' to keep it handy.')) + '</div>';
    },
  };
  ui.actions['sv-seg'] = (el) => { saved.seg = el.dataset.v; S.app.refresh(true); };
})((window.SOS = window.SOS || {}));

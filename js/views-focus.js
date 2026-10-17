/* views/focus.js — Focus mode. Timer logic lives in S.focus so a running session keeps going and
 * completes even if she leaves the Focus screen. Times are absolute (end timestamp), so a locked
 * screen or a throttled tab cannot make the timer drift. */
(function (S) {
  'use strict';
  const u = S.u;
  const D = S.data;
  const E = S.engine;
  const ui = S.ui;
  const store = S.store;
  S.views = S.views || {};

  const PRESETS = {
    pomodoro: { label: 'Pomodoro', focus: 25, brk: 5 },
    deep: { label: 'Deep work', focus: 50, brk: 10 },
    long: { label: 'Long block', focus: 90, brk: 15 },
    custom: { label: 'Custom', focus: 30, brk: 5 },
  };
  const SUBJ = [['phy', 'Physics'], ['chem', 'Chemistry'], ['mth', 'Maths'], ['cs', 'CS'], ['other', 'Other']];
  const MAX_LATE_MS = 10 * 60 * 1000; // a session that ended >10 min ago while the app was closed is not counted

  /* ---------- sound (Web Audio; noise generated on the device, no files) ---------- */
  let audio = null;
  let noiseNode = null;
  function ctx() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audio = new AC();
    }
    if (audio && audio.state === 'suspended') audio.resume();
    return audio;
  }
  function stopNoise() {
    if (noiseNode) {
      try { noiseNode.stop(); } catch (e) { /* already stopped */ }
      noiseNode.disconnect();
      noiseNode = null;
    }
  }
  function playNoise(kind) {
    stopNoise();
    if (kind === 'off') return;
    const a = ctx();
    if (!a) return;
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w * 0.5;
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = a.createGain();
    gain.gain.value = kind === 'white' ? 0.12 : 0.35;
    let node = src;
    if (kind === 'rain') {
      const f = a.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 0.5;
      src.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(a.destination);
    src.start();
    noiseNode = src;
  }
  function beep() {
    const a = ctx();
    if (!a) return;
    [0, 0.22].forEach((t) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, a.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.18);
      o.connect(g);
      g.connect(a.destination);
      o.start(a.currentTime + t);
      o.stop(a.currentTime + t + 0.2);
    });
  }

  /* ---------- wake lock ---------- */
  let lock = null;
  async function wake() {
    try {
      if ('wakeLock' in navigator && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => (lock = null));
      }
    } catch (e) { lock = null; }
  }
  function unwake() {
    if (lock) { lock.release().catch(() => {}); lock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.get('focus').run && !store.get('focus').run.paused) wake();
  });

  /* ---------- timer engine ---------- */
  const F = (S.focus = {
    PRESETS: PRESETS,
    cfg() {
      const f = store.get('focus');
      const p = Object.assign({}, PRESETS[f.mode] || PRESETS.pomodoro);
      if (f.mode === 'custom') p.focus = u.clamp(f.custom || 30, 1, 240);
      return p;
    },
    remaining() {
      const r = store.get('focus').run;
      if (!r) return 0;
      return r.paused != null ? r.paused : u.deadline.left(r.end);
    },
    start() {
      const f = store.get('focus');
      const cfg = F.cfg();
      ctx(); // unlock audio inside the tap
      store.mutate('focus', (x) => {
        x.run = { kind: 'focus', total: cfg.focus * 60000, end: Date.now() + cfg.focus * 60000, paused: null, subj: x.subj, ch: x.ch, mode: x.mode, brk: cfg.brk };
      });
      if (f.sound !== 'off') playNoise(f.sound);
      wake();
      u.haptic();
    },
    startBreak(mins) {
      store.mutate('focus', (x) => {
        x.run = { kind: 'break', total: mins * 60000, end: Date.now() + mins * 60000, paused: null, subj: x.subj, ch: x.ch, mode: x.mode, brk: mins };
      });
      stopNoise();
    },
    pause() {
      store.mutate('focus', (x) => {
        if (x.run && x.run.paused == null) { x.run.paused = Math.max(0, x.run.end - Date.now()); x.run.end = null; }
      });
      stopNoise();
      unwake();
    },
    resume() {
      const f = store.get('focus');
      store.mutate('focus', (x) => {
        if (x.run && x.run.paused != null) { x.run.end = Date.now() + x.run.paused; x.run.paused = null; }
      });
      if (f.run && f.run.kind === 'focus' && f.sound !== 'off') playNoise(f.sound);
      wake();
    },
    // Stop early. Focus time already spent is still counted.
    finish(early) {
      const r = store.get('focus').run;
      if (!r) return;
      if (r.kind === 'focus') {
        const spent = r.total - F.remaining();
        F.log(Math.round(spent / 60000), r);
      }
      store.mutate('focus', (x) => (x.run = null));
      stopNoise();
      unwake();
      if (early) ui.toast('Session stopped');
    },
    log(min, r) {
      if (min < 1) return;
      E.logStudy({ min: min, subj: r.subj });
      store.mutate('analytics', (a) => {
        a.sessions.push({ id: u.uid(), date: u.today(), ts: Date.now(), min: min, subj: r.subj, ch: r.ch || '', mode: r.mode });
        if (a.sessions.length > 300) a.sessions = a.sessions.slice(-300);
      });
    },
    complete() {
      const r = store.get('focus').run;
      if (!r) return;
      stopNoise();
      unwake();
      beep();
      u.haptic('ok');
      if (r.kind === 'focus') {
        F.log(Math.round(r.total / 60000), r);
        ui.toast('Focus session done. Take a ' + r.brk + ' minute break.', { action: 'Start break', fn: () => F.startBreak(r.brk), ms: 8000 });
        store.mutate('focus', (x) => (x.run = null));
        if (S.app.route().name === 'focus') S.app.refresh(true);
      } else {
        ui.toast('Break over. Ready for the next session?');
        store.mutate('focus', (x) => (x.run = null));
      }
    },
    tick() {
      const r = store.get('focus').run;
      if (!r || r.paused != null) return;
      if (u.deadline.due(r.end)) {
        // If the app was closed for a long time after the end, do not credit study that may not have happened.
        if (Date.now() - r.end > MAX_LATE_MS) {
          store.mutate('focus', (x) => (x.run = null));
          ui.toast('A session ended while the app was closed, so it was not counted.');
        } else F.complete();
      }
    },
    setSound(kind) {
      store.mutate('focus', (x) => (x.sound = kind));
      const r = store.get('focus').run;
      if (r && r.kind === 'focus' && r.paused == null) playNoise(kind);
      else if (kind === 'off') stopNoise();
    },
  });

  /* ---------- view ---------- */
  const fmt = (ms) => {
    const s = Math.ceil(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const R = 112;
  const CIRC = 2 * Math.PI * R;

  function chapterOptions(subj) {
    const list = subj === 'other' ? [] : D.BY_SUBJECT[subj] || [];
    return [{ v: '', t: 'No specific chapter' }].concat(list.map((c) => ({ v: c.id, t: c.name })));
  }

  S.views.focus = {
    title: 'Focus',
    tab: 'home',
    pushed: true,
    fab: false,
    render(root, ctxr) {
      const f = store.get('focus');
      const run = f.run;
      const cfg = F.cfg();
      const total = run ? run.total : cfg.focus * 60000;
      const rem = run ? F.remaining() : total;
      const today = E.day(u.today());
      const sessions = store.get('analytics').sessions.filter((s) => s.date === u.today());
      const hist = store.get('analytics').sessions.slice(-6).reverse();
      const label = run ? (run.kind === 'break' ? 'Break' : run.paused != null ? 'Paused' : 'Focusing') : 'Ready';
      root.innerHTML =
        '<div class="page focus" data-s="' + (run ? run.subj : f.subj) + '">' +
        '<div class="timer' + (run && run.kind === 'break' ? ' is-break' : '') + '"><svg viewBox="0 0 260 260" role="img" aria-label="Timer"><circle cx="130" cy="130" r="' + R + '" fill="none" stroke="var(--track)" stroke-width="12"/>' +
        '<circle id="t-ring" cx="130" cy="130" r="' + R + '" fill="none" stroke="var(--sc, var(--accent))" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="' + (CIRC * (1 - rem / total)).toFixed(1) + '" transform="rotate(-90 130 130)"/></svg>' +
        '<div class="timer-c"><b id="t-time" role="timer" aria-live="off">' + fmt(rem) + '</b><small id="t-label">' + label + '</small></div></div>' +
        '<div class="row gap center-x timer-btns">' + controls(run) + '</div>' +
        (run
          ? ''
          : '<div class="stack"><div class="chips center-x">' + Object.keys(PRESETS).map((k) => '<button class="chip rip" aria-pressed="' + (f.mode === k) + '" data-act="fo-mode" data-v="' + k + '">' + PRESETS[k].label + (k !== 'custom' ? ' ' + PRESETS[k].focus + '/' + PRESETS[k].brk : '') + '</button>').join('') + '</div>' +
            (f.mode === 'custom' ? '<label class="field"><span class="field-l">Focus minutes</span><input type="number" inputmode="numeric" min="1" max="240" value="' + f.custom + '" data-change="fo-custom"></label>' : '') +
            ui.field('Subject', ui.select('fsubj', SUBJ.map((s) => ({ v: s[0], t: s[1] })), f.subj).replace('<select', '<select data-change="fo-subj"')) +
            ui.field('Chapter', ui.select('fch', chapterOptions(f.subj), f.ch).replace('<select', '<select data-change="fo-ch"')) + '</div>') +
        '<div class="card"><div class="row-between"><h2 class="h3">Ambient sound</h2></div><div class="chips">' +
        [['off', 'Off'], ['rain', 'Rain'], ['white', 'White noise'], ['brown', 'Brown noise']].map((s) => '<button class="chip rip" aria-pressed="' + (f.sound === s[0]) + '" data-act="fo-sound" data-v="' + s[0] + '">' + s[1] + '</button>').join('') + '</div></div>' +
        '<section class="card"><div class="row-between"><h2 class="h3">Today</h2><span class="small muted">' + u.fmtMin(today.min) + ' · ' + u.plural(sessions.length, 'session') + '</span></div>' +
        (hist.length
          ? '<ul class="hist">' + hist.map((s) => '<li data-s="' + s.subj + '"><i class="dot"></i><span>' + u.esc((D.SUBJECTS[s.subj] || { short: 'Other' }).short) + (s.ch && D.CH[s.ch] ? ' · ' + u.esc(D.CH[s.ch].name) : '') + '</span><small class="muted">' + u.esc(u.dateShort(s.date)) + ' · ' + s.min + ' min</small></li>').join('') + '</ul>'
          : '<p class="muted small">Finished sessions appear here.</p>') + '</section></div>';
      if (ctxr && ctxr.first && ctxr.query.start === '1' && !run) {
        history.replaceState(null, '', '#/focus');
        setTimeout(() => { F.start(); S.app.refresh(true); }, 30);
      }
    },
    tick() {
      const r = store.get('focus').run;
      const t = u.$('#t-time');
      if (!t || !r) return;
      const rem = F.remaining();
      t.textContent = fmt(rem);
      const ring = u.$('#t-ring');
      if (ring) ring.setAttribute('stroke-dashoffset', (CIRC * (1 - rem / r.total)).toFixed(1));
    },
  };
  function controls(run) {
    if (!run) return '<button class="btn primary lg rip" data-act="fo-start">' + u.icon('play') + 'Start focus</button>';
    if (run.kind === 'break') return '<button class="btn tonal lg rip" data-act="fo-stop">Skip break</button>';
    return (
      (run.paused != null
        ? '<button class="btn primary lg rip" data-act="fo-resume">' + u.icon('play') + 'Resume</button>'
        : '<button class="btn primary lg rip" data-act="fo-pause">' + u.icon('pause') + 'Pause</button>') +
      '<button class="btn tonal lg rip" data-act="fo-stop">Finish</button>'
    );
  }
  ui.actions['fo-start'] = () => { F.start(); S.app.refresh(true); };
  ui.actions['fo-pause'] = () => { F.pause(); S.app.refresh(true); };
  ui.actions['fo-resume'] = () => { F.resume(); S.app.refresh(true); };
  ui.actions['fo-stop'] = () => { F.finish(true); S.app.refresh(true); };
  ui.actions['fo-mode'] = (el) => { store.mutate('focus', (x) => (x.mode = el.dataset.v)); };
  ui.actions['fo-sound'] = (el) => { F.setSound(el.dataset.v); };
  ui.changes['fo-custom'] = (el) => store.mutate('focus', (x) => (x.custom = u.clamp(Math.round(u.num(el.value, 30)), 1, 240)));
  ui.changes['fo-subj'] = (el) => store.mutate('focus', (x) => { x.subj = el.value; x.ch = ''; });
  ui.changes['fo-ch'] = (el) => store.mutate('focus', (x) => (x.ch = el.value));

  // A session left running when the app was closed: finish or discard it once at boot.
  F.restore = () => {
    const r = store.get('focus').run;
    if (r && r.paused == null && r.end) {
      if (Date.now() >= r.end) F.tick();
      else wake();
    }
  };
})((window.SOS = window.SOS || {}));

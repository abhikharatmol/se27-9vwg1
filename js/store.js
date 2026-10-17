/* store.js — versioned, namespaced local-first storage.
 *
 * One localStorage key per domain:  sos.v2.<domain>
 * Plus a meta key:                  sos.meta   -> { v, createdAt, migratedFrom }
 *
 * Reads are cached in memory. Writes are debounced and flushed when the page hides,
 * so a fast series of taps costs one write. Write failures are reported, never swallowed.
 *
 * Coach view (Phase 5): `S.store` is one object whose identity never changes -- every other
 * file does `const store = S.store` once at load time, so swapping what `S.store` points to
 * would not reach them. Instead, `S.store`'s methods dispatch to whichever "backing" is
 * currently `active`: `realBacking` (this file's original behaviour, localStorage-backed) or,
 * while viewing a coach-mode file, a `shadowBacking` (same shape, pure in-memory, created by
 * `makeShadowBacking`). Nothing a shadow backing does ever reaches `localStorage` -- that's
 * the whole isolation guarantee `enterCoach`/`exitCoach` provide.
 */
(function (S) {
  'use strict';
  const PREFIX = 'sos.v2.';
  const META_KEY = 'sos.meta';
  const VERSION = 8;

  const DEFAULTS = {
    profile: () => ({
      name: "Abhi's Sister",
      theme: 'light', // light | dark | system (new profiles start light; a saved choice is never changed)
      scale: 1, // text size multiplier
      haptics: true,
      motion: 'system', // system | reduce | full
      hours: 10, // daily study-hours target
      mcq: 90, // daily questions target
      planStart: '2026-09-21',
      // (Exam dates moved to the `exams` domain in v8. An older stored profile keeps its `exams` field untouched.)
      goals: { cet: '170+ (99+ percentile)', jee: '180+ (98-99 percentile)', hsc: '90%+' },
      // Test Center: do wrong JEE numerical answers lose 1 mark? NTA's 2027 bulletin isn't out yet,
      // so this is a setting, not a rule. Each attempt snapshots it at start.
      testCenter: { jeeNumNeg: true },
    }),
    // planner.days[iso] = { done, t:{m,p,c,s}, rev, notes }; planner.slots[iso][slotId] = true
    planner: () => ({ days: {}, slots: {} }),
    // chapters[id] = { s, rev, pyq, pyqOk, pyqT, pyqSrc, mcq, note, doneOn, srs:{a:[iso],d:[bool]}, last }
    chapters: () => ({}),
    habits: () => ({ days: {} }), // days[iso][habitId] = true
    // log[iso] = { min, mcq, subj:{phy,chem,mth,cs,other} }
    analytics: () => ({ log: {}, sessions: [], badges: {} }),
    errors: () => ({ items: [] }),
    mocks: () => ({ items: [] }),
    flashcards: () => ({ custom: [], prog: {}, fav: {}, seen: 0 }),
    bookmarks: () => ({ chapters: {}, formulas: {}, errors: {}, mocks: {}, cards: {} }),
    focus: () => ({ run: null, mode: 'pomodoro', subj: 'phy', ch: '', sound: 'off', custom: 30 }),
    // Test Center attempts with full per-question detail (schema v1, see js/testcenter.js).
    // activeId points at the one in-progress attempt, if any.
    attempts: () => ({ activeId: null, items: [] }),
    // Practice (untimed) sessions, see js/practice.js. active = the one unfinished session;
    // items = the last 60 finished sessions (compact rows); seen[qid] = { n, w, last } answer
    // history; flags = [{ qid, note, date }], one per question.
    practice: () => ({ active: null, items: [], seen: {}, flags: [] }),
    // Learn hub (js/learn.js). prefs.langs = video language order; videos[id] = { ch, pos, dur, max,
    // watched (ISO date or ''), at }; steps[chId] = { read: ISO date }; time[iso] = seconds of video
    // watched (its own bucket, never added to study minutes); last = { id, ch, at } for "resume".
    // noEmbed[id] = { code, at } (v7): YouTube refused to play this video inside the app (IFrame error code).
    learn: () => ({ prefs: { langs: ['hi', 'hinglish', 'mr', 'en'], speed: 1, autoNext: true }, videos: {}, steps: {}, time: {}, last: null, noEmbed: {} }),
    // Exam dates (js/exams.js), v8. target = her own goal date for finishing the syllabus. list[] = { id, name, date,
    // windowText, status ('expected' | 'official'), note }. No MHT-CET date is fixed: the CET Cell has not published
    // one (news of 9 Oct 2026: not official). The JEE Main and HSC dates are the ones the app already had.
    exams: () => ({
      seededFromProfile: false, // set by the v8 migration once it copied the old profile dates (it never runs twice)
      target: '2026-12-15',
      list: [
        { id: 'jee', name: 'JEE Main 2027 (Session 1)', date: '2027-01-22', windowText: '', status: 'expected', note: 'NTA tentative date. Check the official notice.' },
        { id: 'hsc', name: 'HSC Board 2027', date: '2027-02-08', windowText: '', status: 'expected', note: 'Check the official notice.' },
        {
          id: 'cet', name: 'MHT-CET 2027', date: '', windowText: 'Expected March to May 2027 (not official yet, as of 9 Oct 2026)', status: 'expected',
          note: 'Reports (9 Oct 2026, not official): the CET Cell dropped the December attempt and both attempts come after the Class 12 boards. Sources disagree on the windows. Wait for the CET Cell timetable.',
        },
      ],
    }),
  };
  const KEYS = Object.keys(DEFAULTS);

  const listeners = [];
  const status = { ok: true, error: '' };

  function storageAvailable() {
    try {
      const k = '__sos_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }
  status.persistent = storageAvailable();

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  // Fill in keys added after a user's data was written, without touching what exists.
  function withDefaults(def, val) {
    if (!isPlainObject(val)) return def;
    Object.keys(def).forEach((k) => {
      if (val[k] === undefined) val[k] = def[k];
      else if (isPlainObject(def[k]) && isPlainObject(val[k])) val[k] = withDefaults(def[k], val[k]);
    });
    return val;
  }

  // ---- Real backing: today's original behaviour, unchanged in substance, just moved into
  // its own object so `active` can point at it or at a shadow backing instead. ----
  function makeRealBacking() {
    const cache = {};
    const dirty = new Set();
    let timer = null;

    function load(key) {
      const def = DEFAULTS[key]();
      if (!status.persistent) return def;
      let raw = null;
      try {
        raw = localStorage.getItem(PREFIX + key);
      } catch (e) {
        status.persistent = false;
        return def;
      }
      if (raw == null) return def;
      try {
        return withDefaults(def, JSON.parse(raw));
      } catch (e) {
        // Keep the unreadable text so it can be recovered by hand, then start clean.
        try {
          localStorage.setItem('sos.corrupt.' + key + '.' + Date.now(), raw);
        } catch (e2) {
          /* nothing more we can do */
        }
        status.corrupt = (status.corrupt || []).concat(key);
        return def;
      }
    }

    function flush() {
      clearTimeout(timer);
      timer = null;
      if (!dirty.size) return;
      const keys = Array.from(dirty);
      dirty.clear();
      if (!status.persistent) return;
      keys.forEach((k) => {
        try {
          localStorage.setItem(PREFIX + k, JSON.stringify(cache[k]));
          status.ok = true;
        } catch (e) {
          status.ok = false;
          status.error = e && e.name === 'QuotaExceededError' ? 'Storage is full' : 'Storage is blocked';
          listeners.forEach((fn) => fn(['__error__']));
        }
      });
    }

    return {
      kind: 'real',
      get(key) {
        return cache[key] || (cache[key] = load(key));
      },
      mutate(key, fn) {
        const state = this.get(key);
        const out = fn(state);
        dirty.add(key);
        clearTimeout(timer);
        timer = setTimeout(flush, 200);
        return out;
      },
      replace(key, value) {
        cache[key] = withDefaults(DEFAULTS[key](), value);
        dirty.add(key);
        flush();
      },
      flush: flush,
      resetAll() {
        KEYS.forEach((k) => {
          cache[k] = DEFAULTS[k]();
          dirty.add(k);
        });
        flush();
      },
      sizeKB() {
        let n = 0;
        KEYS.forEach((k) => {
          try {
            n += (localStorage.getItem(PREFIX + k) || '').length;
          } catch (e) {
            /* ignore */
          }
        });
        return Math.round(n / 102.4) / 10;
      },
    };
  }

  // ---- Shadow backing: coach view. Same shape, purely in-memory -- `flush` never touches
  // localStorage, so nothing that happens while this backing is active can reach the real
  // device's sos.v2.* keys. Seeded from an opened export's `data` object; any domain missing
  // from that file (an older export, before a new domain was added) gets this app's default. ----
  function makeShadowBacking(seedData) {
    const cache = {};
    KEYS.forEach((k) => {
      cache[k] = withDefaults(DEFAULTS[k](), seedData && seedData[k] !== undefined ? seedData[k] : DEFAULTS[k]());
    });
    return {
      kind: 'shadow',
      get(key) {
        return cache[key];
      },
      mutate(key, fn) {
        return fn(cache[key]);
      },
      replace(key, value) {
        cache[key] = withDefaults(DEFAULTS[key](), value);
      },
      flush() {
        /* nothing to persist, ever -- that is the point of this backing */
      },
      resetAll() {
        KEYS.forEach((k) => (cache[k] = DEFAULTS[k]()));
      },
      sizeKB() {
        let n = 0;
        KEYS.forEach((k) => {
          try {
            n += JSON.stringify(cache[k]).length;
          } catch (e) {
            /* ignore */
          }
        });
        return Math.round(n / 102.4) / 10;
      },
    };
  }

  const realBacking = makeRealBacking();
  let active = realBacking;

  function requireKey(key, who) {
    if (!(key in DEFAULTS)) throw new Error(who + ': unknown domain "' + key + '"');
  }

  const store = (S.store = {
    VERSION: VERSION,
    KEYS: KEYS,
    // A fresh copy of a domain's default (the migrations seed new domains from it).
    defaultOf(key) {
      requireKey(key, 'store.defaultOf');
      return DEFAULTS[key]();
    },
    status: status,
    // { active: bool, name: string } -- read by app.js to show the persistent coach banner,
    // and by any view that wants to tell real data from a coach-mode file apart.
    coach: { active: false, name: '' },

    get(key) {
      requireKey(key, 'store.get');
      return active.get(key);
    },
    // Change a domain: fn receives the live object. Persists (if on the real backing) and notifies.
    mutate(key, fn) {
      requireKey(key, 'store.mutate');
      const out = active.mutate(key, fn);
      listeners.forEach((l) => l([key]));
      return out;
    },
    replace(key, value) {
      requireKey(key, 'store.replace');
      active.replace(key, value);
      listeners.forEach((l) => l([key]));
    },
    on(fn) {
      listeners.push(fn);
    },
    flush() {
      active.flush();
    },

    meta() {
      try {
        return JSON.parse(localStorage.getItem(META_KEY)) || null;
      } catch (e) {
        return null;
      }
    },
    setMeta(m) {
      if (status.persistent) localStorage.setItem(META_KEY, JSON.stringify(m));
    },

    exportAll() {
      active.flush();
      const data = {};
      KEYS.forEach((k) => (data[k] = active.get(k)));
      return { app: 'engineering-2027-study-os', version: VERSION, appVersion: S.APP_VERSION, exported: new Date().toISOString(), data: data };
    },
    // Replace every domain from a backup file that has already been validated by migrate.js.
    // Operates on whichever backing is active -- if called while in coach mode, this replaces
    // the (in-memory, unpersisted) shadow copy, never the real device data.
    importAll(data) {
      KEYS.forEach((k) => {
        if (data[k] !== undefined) active.replace(k, data[k]);
      });
      active.flush();
      listeners.forEach((l) => l(KEYS));
    },
    resetAll() {
      active.resetAll();
      listeners.forEach((l) => l(KEYS));
    },
    // Rough size in KB, for the Settings screen. Reflects whichever backing is active.
    sizeKB() {
      return active.sizeKB();
    },

    // ---- Coach view ----
    // `data` is an already-validated export's `data` object (see S.migrate.parseBackup).
    // `meta.name` is shown in the persistent banner (app.js chrome()).
    enterCoach(data, meta) {
      active = makeShadowBacking(data);
      store.coach = { active: true, name: (meta && meta.name) || 'Student' };
      listeners.forEach((l) => l(KEYS));
    },
    exitCoach() {
      active = realBacking;
      store.coach = { active: false, name: '' };
      listeners.forEach((l) => l(KEYS));
    },
  });

  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });
})((window.SOS = window.SOS || {}));

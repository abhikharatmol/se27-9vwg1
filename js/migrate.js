/* migrate.js — brings older data forward.
 *
 *  1. Legacy v1 app (single HTML file, keys "eng2027_*")  ->  v2 domains (old chapter ids)
 *  2. v2 -> v3 (Phase 1): remap every stored chapter/formula/card id from the old
 *     hard-coded ids to the new syllabus ids (js/data-syllabus.js ID_MAP / FORMULA_ID_MAP),
 *     then seed chapters the syllabus says are already done.
 *  3. v3 -> v4 (Phase 3): adds the empty `attempts` domain (Test Center). Nothing else changes.
 *     v4 -> v5 adds `practice`; v5 -> v6 adds `learn` (Learn hub); v6 -> v7 adds `learn.noEmbed` (videos YouTube
 *     refused to play inside the app); v7 -> v8 adds `exams` (exam dates in one place, seeded from the old
 *     `profile.exams`, which stays untouched). All additive only.
 *  4. Future schema versions: add a function to MIGRATIONS keyed by the version it produces.
 *
 * Legacy keys are never deleted. Not carried over (they had no date attached or were counters):
 * habit ticks, the 35-box heatmap, the timer counter, and the generic weekly checklist.
 *
 * Nothing is ever silently dropped. A chapter/formula/card id with no Phase 1 equivalent is
 * moved to an "orphan" slot next to where it lived (chapters._orphans, mocks[].weakV2,
 * bookmarks.chapters._orphans, bookmarks.formulas._orphans, flashcards.prog._orphans,
 * bookmarks.cards._orphans, errors[].chIdV2, focus.chV2 / focus.run.chV2,
 * analytics.sessions[].chV2) instead of being deleted.
 */
(function (S) {
  'use strict';
  const D = S.data;
  const u = S.u;

  const LEGACY = {
    chapters: 'eng2027_chapters',
    calendar: 'eng2027_calendar_v1',
    mocks: 'eng2027_mock_results',
    errors: 'eng2027_error_notebook',
    theme: 'eng2027_theme',
  };
  const STATUS_MAP = { pending: 'todo', revision: 'done', completed: 'mastered' };
  const MOCK_MAP = { 'MHT-CET': 'cet', 'JEE Main': 'jee', 'Physics Test': 'phy', 'Chemistry Test': 'chem', 'Maths Test': 'mth' };
  const SUBJ_MAP = { Physics: 'phy', Chemistry: 'chem', Mathematics: 'mth', 'Computer Science': 'cs' };
  const STATUS_RANK = { todo: 0, learning: 1, done: 2, mastered: 3 };

  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  }

  function isObj(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function makeSrs(fromIso) {
    return { a: D.INTERVALS.map((n) => u.addDays(fromIso, n)), d: D.INTERVALS.map(() => false) };
  }

  // Merge several OLD-id chapter records that now land on the same NEW id.
  // Status = the most advanced. Counters (rev, pyq, pyqOk, mcq) add up. Notes concatenate.
  // The srs schedule (and its doneOn) is kept from whichever record started revising earliest.
  function mergeChapterRecords(records) {
    if (records.length === 1) return records[0];
    let out = null;
    records.forEach((r) => {
      if (!out) {
        out = Object.assign({}, r);
        return;
      }
      if ((STATUS_RANK[r.s] || 0) > (STATUS_RANK[out.s] || 0)) out.s = r.s;
      out.rev = (out.rev || 0) + (r.rev || 0);
      out.pyq = (out.pyq || 0) + (r.pyq || 0);
      out.pyqOk = (out.pyqOk || 0) + (r.pyqOk || 0);
      out.mcq = (out.mcq || 0) + (r.mcq || 0);
      out.pyqT = Math.max(out.pyqT || 0, r.pyqT || 0);
      if (r.pyqSrc && out.pyqSrc && r.pyqSrc !== out.pyqSrc) out.pyqSrc = out.pyqSrc + '; ' + r.pyqSrc;
      else out.pyqSrc = out.pyqSrc || r.pyqSrc || '';
      out.note = [out.note, r.note].filter(Boolean).join('\n\n');
      if (r.srs && (!out.srs || (r.doneOn && out.doneOn && r.doneOn < out.doneOn))) {
        out.srs = r.srs;
        out.doneOn = r.doneOn;
      } else if (r.srs && !out.doneOn) {
        out.srs = r.srs;
        out.doneOn = r.doneOn;
      }
      if ((r.last || '') > (out.last || '')) out.last = r.last;
    });
    return out;
  }

  // Remap a whole v2-shaped `chapters` domain (old ids) to the Phase 1 `chapters` shape
  // (new ids + `_orphans`). Used by both v1 legacy import and the v2 -> v3 migration.
  function remapChaptersDomain(oldChapters) {
    const byNew = {};
    const orphans = {};
    Object.keys(oldChapters || {}).forEach((oldId) => {
      if (oldId === '_orphans') return; // shouldn't exist pre-v3, but never double-nest it
      const rec = oldChapters[oldId];
      const newId = D.remapChapterId(oldId);
      if (newId) (byNew[newId] || (byNew[newId] = [])).push(rec);
      else orphans[oldId] = rec;
    });
    const out = {};
    Object.keys(byNew).forEach((newId) => {
      out[newId] = mergeChapterRecords(byNew[newId]);
    });
    if (Object.keys(orphans).length) out._orphans = orphans;
    return out;
  }

  function remapFormulaId(oldId) {
    const m = S.FORMULA_ID_MAP;
    if (!m || !Object.prototype.hasOwnProperty.call(m, oldId)) return null;
    return m[oldId];
  }

  // input: { chapters, calendar, mocks, errors, theme } in v1 shapes (OLD chapter ids).
  // Returns partial v3 domains (already on NEW chapter ids).
  function fromLegacy(L) {
    const out = {};
    const legacyMaps = { physics: 'phy', chemistry: 'chem', maths: 'mth', cs: 'cs' };

    if (isObj(L.chapters)) {
      const oldChapters = {};
      Object.keys(L.chapters).forEach((key) => {
        const m = /^([a-z]+)_(\d+)$/.exec(key);
        if (!m || !legacyMaps[m[1]]) return;
        const oldId = D.legacyOldId(m[1], Number(m[2]));
        const status = STATUS_MAP[L.chapters[key]];
        if (oldId && status && status !== 'todo') {
          const rec = { s: status, rev: 0, pyq: 0, pyqOk: 0, pyqT: 0, pyqSrc: '', mcq: 0, note: '', last: '', srs: null, doneOn: '' };
          if (status === 'done' || status === 'mastered') {
            rec.doneOn = u.today();
            rec.srs = makeSrs(rec.doneOn);
          }
          oldChapters[oldId] = rec;
        }
      });
      out.chapters = remapChaptersDomain(oldChapters);
    }

    if (isObj(L.calendar) && D.PLAN.length) {
      const days = {};
      Object.keys(L.calendar).forEach((key) => {
        const m = /^day_(\d+)$/.exec(key);
        if (!m || !L.calendar[key]) return;
        const day = D.PLAN[Number(m[1])];
        if (day) days[day.date] = { done: true, t: { m: true, p: true, c: true, s: !!day.s }, rev: true, notes: '' };
      });
      out.planner = { days: days, slots: {} };
    }

    if (Array.isArray(L.mocks)) {
      out.mocks = {
        items: L.mocks
          .map((m) => {
            const type = MOCK_MAP[m.type];
            if (!type || !(m.total > 0)) return null;
            const isSlot = type === 'cet' || type === 'jee';
            return {
              id: u.uid(),
              type: type,
              slot: isSlot ? Number(m.number) || null : null,
              title: isSlot ? D.MOCKS[type].label + ' ' + m.number : D.MOCKS[type].label + ' ' + (m.number || ''),
              date: m.timestamp ? u.iso(new Date(m.timestamp)) : u.today(),
              score: Number(m.score) || 0,
              total: Number(m.total),
              min: 0,
              correct: null,
              wrong: null,
              marks: {},
              weak: [],
              note: '',
            };
          })
          .filter(Boolean),
      };
    }

    if (Array.isArray(L.errors)) {
      out.errors = {
        items: L.errors.map((e) => ({
          id: u.uid(),
          date: u.today(),
          subj: SUBJ_MAP[e.subject] || 'phy',
          chapter: e.chapter || '',
          chId: '', // v1 export never carried a chapter id for errors, nothing to remap
          question: '',
          concept: e.note || '',
          reason: e.reason || '',
          resolved: false,
          hasImage: false,
          srs: null,
        })),
      };
      out.errors.items.forEach((e) => (e.srs = makeSrs(e.date)));
    }

    if (L.theme === 'dark' || L.theme === 'light') out.profile = { theme: L.theme };
    return out;
  }

  // A v1 "Export Backup" JSON has: { chapters, habits, mocks, errors, timerStats, weekPlanner, calendar, heatmap, exported }
  function looksLikeLegacyBackup(o) {
    return isObj(o) && o.exported && (o.chapters || o.mocks || o.errors || o.calendar) && !o.app;
  }

  /* ---- v2 -> v3: Phase 1 chapter-id remap (old hard-coded ids -> syllabus ids) ---- */
  function remapChId(id) {
    return id ? D.remapChapterId(id) : null;
  }

  function migrateToV3(all) {
    if (isObj(all.chapters)) all.chapters = remapChaptersDomain(all.chapters);

    if (isObj(all.errors) && Array.isArray(all.errors.items)) {
      all.errors.items.forEach((item) => {
        if (!item.chId) return;
        const newId = remapChId(item.chId);
        if (newId) item.chId = newId;
        else {
          item.chIdV2 = item.chId;
          item.chId = '';
        }
      });
    }

    if (isObj(all.mocks) && Array.isArray(all.mocks.items)) {
      all.mocks.items.forEach((m) => {
        if (!Array.isArray(m.weak) || !m.weak.length) return;
        const keep = [];
        const orphaned = [];
        m.weak.forEach((oldId) => {
          const newId = remapChId(oldId);
          if (newId) keep.push(newId);
          else orphaned.push(oldId);
        });
        m.weak = keep;
        if (orphaned.length) m.weakV2 = (m.weakV2 || []).concat(orphaned);
      });
    }

    if (isObj(all.bookmarks)) {
      if (isObj(all.bookmarks.chapters)) {
        const src = all.bookmarks.chapters;
        const out = {};
        const orphans = {};
        Object.keys(src).forEach((oldId) => {
          if (oldId === '_orphans') return;
          const newId = remapChId(oldId);
          if (newId) out[newId] = 1;
          else orphans[oldId] = 1;
        });
        if (Object.keys(orphans).length) out._orphans = orphans;
        all.bookmarks.chapters = out;
      }
      if (isObj(all.bookmarks.formulas)) {
        all.bookmarks.formulas = remapFormulaKeyedObject(all.bookmarks.formulas, false);
      }
      if (isObj(all.bookmarks.cards)) {
        all.bookmarks.cards = remapFormulaKeyedObject(all.bookmarks.cards, true);
      }
    }

    if (isObj(all.flashcards) && isObj(all.flashcards.prog)) {
      all.flashcards.prog = remapFormulaKeyedObject(all.flashcards.prog, true);
    }

    if (isObj(all.focus)) {
      remapFocusChapter(all.focus, 'ch');
      if (isObj(all.focus.run)) remapFocusChapter(all.focus.run, 'ch');
    }

    if (isObj(all.analytics) && Array.isArray(all.analytics.sessions)) {
      all.analytics.sessions.forEach((sess) => {
        if (!sess.ch) return;
        const newId = remapChId(sess.ch);
        if (newId) sess.ch = newId;
        else {
          sess.chV2 = sess.ch;
          sess.ch = '';
        }
      });
    }
  }

  // Remap a bookmarks.formulas-shaped object (bare formula ids) or a flashcards.prog /
  // bookmarks.cards-shaped object (card ids, some "f:<formulaId>" prefixed, most stable
  // as-is). Orphaned formula ids move to an `_orphans` key instead of being dropped.
  function remapFormulaKeyedObject(src, hasPrefixedKeys) {
    const out = {};
    const orphans = {};
    Object.keys(src).forEach((key) => {
      if (key === '_orphans') return;
      const value = src[key];
      const isFormulaKey = hasPrefixedKeys ? key.indexOf('f:') === 0 : true;
      if (!isFormulaKey) {
        out[key] = value; // concept card / custom card id, unaffected by the formula remap
        return;
      }
      const oldFormulaId = hasPrefixedKeys ? key.slice(2) : key;
      const newFormulaId = remapFormulaId(oldFormulaId);
      if (newFormulaId) out[hasPrefixedKeys ? 'f:' + newFormulaId : newFormulaId] = value;
      else orphans[key] = value;
    });
    if (Object.keys(orphans).length) out._orphans = orphans;
    return out;
  }

  function remapFocusChapter(obj, field) {
    if (!obj[field]) return;
    const newId = remapChId(obj[field]);
    if (newId) obj[field] = newId;
    else {
      obj[field + 'V2'] = obj[field];
      obj[field] = '';
    }
  }

  const MIGRATIONS = {
    3: migrateToV3,
    // v3 -> v4: additive only. Adds the new, empty `attempts` domain (Test Center) and
    // leaves every other domain untouched. Also runs on v3 backups being restored, so a
    // restore replaces attempts along with mocks instead of keeping stale ones.
    4: (all) => {
      if (!isObj(all.attempts)) all.attempts = { activeId: null, items: [] };
    },
    // v4 -> v5: additive only. Adds the empty `practice` domain (untimed practice sessions,
    // answer history and flagged questions). Every other domain passes through unchanged.
    5: (all) => {
      if (!isObj(all.practice)) all.practice = { active: null, items: [], seen: {}, flags: [] };
    },
    // v5 -> v6: additive only. Adds the empty `learn` domain (video progress, lesson steps, video
    // time). Every other domain passes through unchanged.
    6: (all) => {
      if (!isObj(all.learn)) {
        all.learn = { prefs: { langs: ['hi', 'hinglish', 'mr', 'en'], speed: 1, autoNext: true }, videos: {}, steps: {}, time: {}, last: null };
      }
    },
    // v6 -> v7: additive only. `learn.noEmbed` = { <videoId>: { code, at } }, the videos YouTube refused to
    // play inside the app (kept so the next visit says "YouTube only" before she taps). Everything already in
    // `learn` (progress, prefs, steps, time, last) and every other domain passes through unchanged.
    7: (all) => {
      if (isObj(all.learn) && !isObj(all.learn.noEmbed)) all.learn.noEmbed = {};
    },
    // v7 -> v8: additive only. Adds the `exams` domain (js/exams.js): the dates the app had in `profile.exams`
    // move there, the student's own edits included. The old `profile.exams` is left exactly as it was. A value
    // that is not a real date is ignored; a date she had cleared stays cleared; no MHT-CET date is invented.
    8: (all) => {
      // On a device the store has already filled `exams` with its default, so "present" says nothing; the marker does:
      // once seeded, a second run (a crash between the writes, a v7-labelled file that already has `exams`) leaves it alone.
      if (isObj(all.exams) && all.exams.seededFromProfile === true) return;
      const base = S.store.defaultOf('exams');
      const old = isObj(all.profile) && isObj(all.profile.exams) ? all.profile.exams : {};
      const real = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && u.iso(u.parse(d)) === d;
      if (old.target === '' || real(old.target)) base.target = old.target;
      base.list.forEach((e) => {
        const v = old[e.id];
        if (real(v) && v !== e.date) {
          e.date = v;
          e.windowText = '';
          e.note = e.id === 'cet' ? 'You set this date. It is not official yet (as of 9 Oct 2026): check the CET Cell notice.' : 'You set this date. Check the official notice.';
        } else if (v === '' && e.date) e.date = '';
      });
      base.seededFromProfile = true;
      all.exams = base;
    },
  };

  function applyMigrations(data, fromVersion) {
    for (let v = fromVersion + 1; v <= S.store.VERSION; v++) {
      if (MIGRATIONS[v]) MIGRATIONS[v](data);
    }
    return data;
  }

  /* ---- seeding: fill in chapters the syllabus says are already done, but only where the
   * user has no existing record. Runs once per syllabus version (meta.seeded), regardless
   * of which path (fresh install / v1 import / v2->v3) brought the chapters domain here.
   * Staggers the first revision date over the next 7 days (max 2 chapters/day, starting
   * tomorrow) so a migrated user doesn't open the app to a wall of "overdue" revisions. */
  function seedFromSyllabus(chapters) {
    const toSeed = D.CHAPTERS.filter((c) => c.seedDone && !chapters[c.id]);
    const today = u.today();
    toSeed.forEach((c, i) => {
      const dayOffset = Math.min(1 + Math.floor(i / 2), 7);
      const doneOn = u.addDays(today, dayOffset - D.INTERVALS[0]);
      chapters[c.id] = {
        s: 'done', rev: 0, pyq: 0, pyqOk: 0, pyqT: 0, pyqSrc: '', mcq: 0,
        note: '', doneOn: doneOn, srs: makeSrs(doneOn), last: today,
      };
    });
    return toSeed.length;
  }

  S.migrate = {
    makeSrs: makeSrs,
    fromLegacy: fromLegacy,
    seedFromSyllabus: seedFromSyllabus,

    // Runs once at boot. Safe to call on every load.
    run() {
      const store = S.store;
      const meta = store.meta();
      const syllabusVersion = S.SYLLABUS_VERSION;
      if (meta && meta.v === store.VERSION && meta.seeded === syllabusVersion) return { migrated: false };
      let migratedFrom = 'fresh';
      if (!meta) {
        const L = {
          chapters: readJSON(LEGACY.chapters),
          calendar: readJSON(LEGACY.calendar),
          mocks: readJSON(LEGACY.mocks),
          errors: readJSON(LEGACY.errors),
          theme: (function () {
            try {
              return localStorage.getItem(LEGACY.theme);
            } catch (e) {
              return null;
            }
          })(),
        };
        const hasLegacy = Object.keys(L).some((k) => L[k] != null);
        if (hasLegacy) {
          const out = fromLegacy(L);
          Object.keys(out).forEach((k) => {
            if (k === 'profile') store.mutate('profile', (p) => Object.assign(p, out.profile));
            else store.replace(k, out[k]);
          });
          migratedFrom = 'v1';
        }
      } else if (meta.v < store.VERSION) {
        const all = {};
        store.KEYS.forEach((k) => (all[k] = store.get(k)));
        applyMigrations(all, meta.v);
        store.KEYS.forEach((k) => store.replace(k, all[k]));
        migratedFrom = 'v' + meta.v;
      }
      if (!meta || meta.seeded !== syllabusVersion) {
        store.mutate('chapters', (chapters) => seedFromSyllabus(chapters));
      }
      store.setMeta({
        v: store.VERSION,
        createdAt: (meta && meta.createdAt) || new Date().toISOString(),
        migratedFrom: migratedFrom,
        seeded: syllabusVersion,
      });
      return { migrated: migratedFrom !== 'fresh', from: migratedFrom };
    },

    // Validates a backup file and returns { ok, data?, error? }. Does not write anything.
    parseBackup(text) {
      let obj;
      try {
        obj = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: 'That file is not valid JSON.' };
      }
      if (looksLikeLegacyBackup(obj)) {
        const data = fromLegacy({
          chapters: obj.chapters,
          calendar: obj.calendar,
          mocks: obj.mocks,
          errors: obj.errors,
          theme: null,
        });
        return { ok: true, data: data, legacy: true };
      }
      if (!isObj(obj) || obj.app !== 'engineering-2027-study-os' || !isObj(obj.data)) {
        return { ok: false, error: 'This is not a Study OS backup file.' };
      }
      if (typeof obj.version !== 'number' || obj.version > S.store.VERSION) {
        return { ok: false, error: 'This backup was made by a newer version of the app. Update the app first.' };
      }
      const data = applyMigrations(obj.data, obj.version);
      for (const k of Object.keys(data)) {
        if (S.store.KEYS.indexOf(k) < 0) delete data[k];
        else if (!isObj(data[k])) return { ok: false, error: 'The backup is damaged (section "' + k + '").' };
      }
      // A file can come from anyone (a coach's file too): the exam dates are cleaned to the shape the screens rely on.
      if (data.exams && S.exams) data.exams = S.exams.sanitize(data.exams);
      return { ok: true, data: data };
    },
  };
})((window.SOS = window.SOS || {}));

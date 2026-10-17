/* views/more.js — #/more: everything that is not Home, Subjects, Continue or Tests, as big tiles and a short list. */
(function (S) {
  'use strict';
  const u = S.u;
  const E = S.engine;
  const ui = S.ui;

  const TILES = [
    ['planner', 'calendar', 'v', 'Planner', 'Timetable, habits, targets'],
    ['pyq', 'note', 'b', 'Past papers', 'Links and an answer sheet'],
    ['formulas', 'sigma', 'o', 'Formula vault', 'Search every formula'],
    ['flashcards', 'cards', 'p', 'Flashcards', 'Flip, quiz, review'],
    ['errors', 'notebook', 'r', 'My mistakes', 'Error notebook'],
    ['focus', 'timer', 'g', 'Focus timer', 'Study in short sessions'],
  ];
  const LIST = [
    ['analytics', 'chart', 'Progress and habits', 'Study time, accuracy, streak'],
    ['me', 'user', 'Exam dates and profile', 'Name, exam dates, target'],
    ['me', 'settings', 'Settings and backup', 'Theme, text size, export and restore'],
    ['revision', 'refresh', 'Revision scheduler', 'What to revise today'],
    ['pyq-tracker', 'target', 'PYQ tracker', 'Solved and accuracy per chapter'],
    ['cheatsheet', 'note', 'Exam cheat sheets', 'One page per subject'],
    ['badges', 'trophy', 'Badges and streak', 'What you have earned'],
    ['saved', 'star', 'Saved questions', 'Questions you starred'],
    ['flags', 'bolt', 'Flagged questions', 'Questions to look at again'],
  ];

  function badge(id) {
    if (id === 'flashcards') {
      const d = E.dueCounts();
      const n = d.overdue + d.today;
      return n ? '<b class="mt-n">' + n + ' due</b>' : '';
    }
    if (id === 'errors') {
      const n = (S.store.get('errors').items || []).filter((x) => !x.resolved).length;
      return n ? '<b class="mt-n">' + n + '</b>' : '';
    }
    return '';
  }

  // "Send progress": a short text summary plus the JSON backup, shared with the Web Share API. A dot says it was not sent for a week.
  function sendTile() {
    const last = S.summary.lastSent();
    return '<button class="mt-tile mt-wide rip" data-c="v" data-act="send-progress" data-testid="more-send-progress"><span class="mt-chip">' + u.icon('share') + '</span>' +
      (S.summary.dotDue() ? '<i class="mt-dot" data-testid="send-dot" role="img" aria-label="Not sent for more than a week"></i>' : '') +
      '<span class="mt-txt"><b>Send progress</b><small>' + (last ? 'Last sent ' + u.esc(u.dateShort(last)) : 'Never sent') + ' · a summary and your backup</small></span></button>';
  }

  async function sendProgress() {
    const text = S.summary.build();
    const B = S.backupUI;
    const payload = B.payload();
    const name = B.filename();
    const files = [new File([payload], name, { type: 'application/json' }), new File([payload], name.replace(/\.json$/, '.txt'), { type: 'text/plain' })];
    for (let i = 0; i < files.length; i++) {
      const can = navigator.share && navigator.canShare && navigator.canShare({ files: [files[i]] });
      if (!can) continue;
      try {
        await navigator.share({ files: [files[i]], title: 'Study OS progress', text: text });
        S.summary.markSent();
        S.app.refresh(true);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // she closed the share sheet
        // any other failure: try the next file type, then the fallback
      }
    }
    // No file sharing here: download the backup and offer the summary to copy.
    B.download(payload, name);
    S.summary.markSent();
    ui.sheet.open({
      title: 'Send your progress',
      html: '<p class="small muted">Your backup file was saved to your downloads. Send it with the summary below.</p>' +
        '<pre class="send-summary" data-testid="send-summary">' + u.esc(text) + '</pre>' +
        '<button class="btn primary block rip" data-act="copy-summary" data-testid="copy-summary">' + u.icon('note') + 'Copy summary</button>',
    });
    S.app.refresh(true);
  }
  ui.actions['send-progress'] = () => { sendProgress(); };
  ui.actions['copy-summary'] = async () => {
    try {
      await navigator.clipboard.writeText(S.summary.build());
      ui.toast('Summary copied');
    } catch (e) {
      ui.toast('Could not copy. Select the text and copy it by hand.');
    }
  };

  S.views.more = {
    title: 'More',
    tab: 'more',
    render(root) {
      root.innerHTML =
        '<div class="page more"><header class="page-h"><div><h1 class="h1">More</h1><p class="muted">Everything else in one place</p></div></header>' +
        sendTile() +
        '<div class="mt-grid">' +
        TILES.map((t) =>
          '<button class="mt-tile rip" data-c="' + t[2] + '" data-act="go" data-to="#/' + t[0] + '" data-testid="more-' + t[0] + '">' +
          '<span class="mt-chip">' + u.icon(t[1]) + '</span>' + badge(t[0]) + '<b>' + t[3] + '</b><small>' + t[4] + '</small></button>'
        ).join('') + '</div>' +
        '<section class="card list-card"><ul class="recs">' +
        LIST.map((t) =>
          '<li><button class="rec rip" data-act="go" data-to="#/' + t[0] + '" data-testid="more-' + t[0] + '-' + t[1] + '">' + u.icon(t[1]) +
          '<span><b>' + t[2] + '</b><small>' + t[3] + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>'
        ).join('') + '</ul></section></div>';
    },
  };
})((window.SOS = window.SOS || {}));

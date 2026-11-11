/* views/more.js — "Send progress" (summary + backup, shared with the Web Share API). The old #/more page is gone: #/more redirects to #/me. */
(function (S) {
  'use strict';
  const u = S.u;
  const E = S.engine;
  const ui = S.ui;

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

  S.moreUI = { sendTile: sendTile };
})((window.SOS = window.SOS || {}));

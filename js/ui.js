/* ui.js — shared interface behaviour: bottom sheets, toasts, confirm dialogs, confetti,
 * ripple, and one delegated event dispatcher (data-act / data-change / data-input). */
(function (S) {
  'use strict';
  const u = S.u;
  const ui = (S.ui = { actions: {}, changes: {}, inputs: {} });

  /* ---------- delegated events ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = ui.actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    const fn = el && ui.changes[el.dataset.change];
    if (fn) fn(el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    const fn = el && ui.inputs[el.dataset.input];
    if (fn) fn(el, e);
  });
  // Keyboard: Enter/Space on role="button" elements that are not native buttons.
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-act]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* ---------- ripple ---------- */
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target.closest('.rip');
      if (!t || u.reducedMotion()) return;
      const r = t.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 1.6;
      const s = document.createElement('span');
      s.className = 'ripple';
      s.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (e.clientX - r.left - size / 2) + 'px;top:' + (e.clientY - r.top - size / 2) + 'px';
      t.appendChild(s);
      setTimeout(() => s.remove(), 600);
    },
    { passive: true }
  );

  /* ---------- toast ---------- */
  let toastTimer = null;
  ui.toast = (text, opt) => {
    opt = opt || {};
    const root = u.$('#toast');
    if (!root) return;
    root.innerHTML = '<span class="toast-t">' + u.esc(text) + '</span>' + (opt.action ? '<button class="toast-a" data-act="toast-action">' + u.esc(opt.action) + '</button>' : '');
    root.classList.add('show');
    ui._toastFn = opt.fn || null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => root.classList.remove('show'), opt.ms || (opt.action ? 6000 : 3200));
  };
  ui.actions['toast-action'] = () => {
    const fn = ui._toastFn;
    u.$('#toast').classList.remove('show');
    if (fn) fn();
  };

  /* ---------- bottom sheet ---------- */
  let sheetOpen = false;
  let opener = null;
  let onCloseCb = null;
  let ignorePop = false;
  const wrap = () => u.$('#sheet');

  ui.sheet = {
    isOpen: () => sheetOpen,
    open(o) {
      const w = wrap();
      opener = document.activeElement;
      u.$('#sheet-title', w).textContent = o.title || '';
      u.$('.sheet-body', w).innerHTML = o.html || '';
      w.classList.toggle('tall', !!o.tall);
      w.hidden = false;
      onCloseCb = o.onClose || null;
      if (!sheetOpen) history.pushState({ sheet: 1 }, '');
      sheetOpen = true;
      document.body.classList.add('lock');
      requestAnimationFrame(() => {
        w.classList.add('open');
        const first = u.$('[autofocus], .sheet-body input:not([type=hidden]), .sheet-body textarea', w);
        (first && !first.matches('[data-nofocus]') ? first : u.$('.sheet', w)).focus({ preventScroll: true });
      });
      if (o.onOpen) o.onOpen(u.$('.sheet-body', w));
    },
    // Replace the content while staying open (used by multi-step flows).
    update(o) {
      const w = wrap();
      if (o.title != null) u.$('#sheet-title', w).textContent = o.title;
      if (o.html != null) u.$('.sheet-body', w).innerHTML = o.html;
    },
    body: () => u.$('#sheet .sheet-body'),
    close(fromPop) {
      if (!sheetOpen) return;
      const w = wrap();
      sheetOpen = false;
      w.classList.remove('open');
      document.body.classList.remove('lock');
      const done = () => {
        // A sheet reopened inside the 240 ms close animation (a deep link, or "Timed test" from a
        // sheet) must not be hidden by this stale timer.
        if (sheetOpen) return;
        w.hidden = true;
        u.$('.sheet', w).style.transform = '';
      };
      if (u.reducedMotion()) done();
      else setTimeout(done, 240);
      if (!fromPop) {
        ignorePop = true;
        history.back();
      }
      const cb = onCloseCb;
      onCloseCb = null;
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
      if (cb) cb();
    },
  };
  ui.actions['sheet-close'] = () => ui.sheet.close();
  // The router calls this first on every popstate; true means "handled, do not route".
  ui.handlePop = () => {
    if (ignorePop) {
      ignorePop = false;
      return true;
    }
    if (sheetOpen) {
      ui.sheet.close(true);
      return true;
    }
    return false;
  };
  document.addEventListener('keydown', (e) => {
    if (!sheetOpen) return;
    if (e.key === 'Escape') ui.sheet.close();
    if (e.key === 'Tab') {
      const nodes = u.$$('#sheet button:not([disabled]), #sheet input:not([disabled]), #sheet select, #sheet textarea, #sheet [href], #sheet [tabindex]:not([tabindex="-1"])').filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('sheet'))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Swipe down on the handle / header to dismiss.
  (function () {
    let startY = 0;
    let dy = 0;
    let dragging = false;
    document.addEventListener(
      'touchstart',
      (e) => {
        const h = e.target.closest('#sheet .sheet-grab, #sheet .sheet-head');
        if (!h) return;
        dragging = true;
        startY = e.touches[0].clientY;
        dy = 0;
      },
      { passive: true }
    );
    document.addEventListener(
      'touchmove',
      (e) => {
        if (!dragging) return;
        dy = Math.max(0, e.touches[0].clientY - startY);
        u.$('#sheet .sheet').style.transform = 'translateY(' + dy + 'px)';
      },
      { passive: true }
    );
    document.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      if (dy > 90) ui.sheet.close();
      else u.$('#sheet .sheet').style.transform = '';
    });
  })();

  /* ---------- confirm ---------- */
  let confirmResolve = null;
  ui.confirm = (o) =>
    new Promise((resolve) => {
      confirmResolve = resolve;
      ui.sheet.open({
        title: o.title,
        html:
          '<p class="muted">' + u.esc(o.text || '') + '</p>' +
          '<div class="row gap" style="margin-top:16px"><button class="btn tonal grow" data-act="confirm-no">' + u.esc(o.cancel || 'Cancel') + '</button>' +
          '<button class="btn ' + (o.danger ? 'danger' : 'primary') + ' grow" data-act="confirm-yes">' + u.esc(o.ok || 'Confirm') + '</button></div>',
        onClose: () => {
          if (confirmResolve) {
            confirmResolve(false);
            confirmResolve = null;
          }
        },
      });
    });
  ui.actions['confirm-yes'] = () => {
    const r = confirmResolve;
    confirmResolve = null;
    ui.sheet.close();
    if (r) r(true);
  };
  ui.actions['confirm-no'] = () => ui.sheet.close();

  /* ---------- confetti ---------- */
  ui.confetti = (count) => {
    if (u.reducedMotion()) return;
    const cv = u.$('#confetti');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    cv.width = innerWidth;
    cv.height = innerHeight;
    const colors = ['#4C7BFF', '#22B573', '#FF8A2B', '#9B6BFF', '#FF5A6E', '#FFC53D'];
    const n = count || 90;
    const parts = [];
    for (let i = 0; i < n; i++)
      parts.push({
        x: cv.width / 2 + (Math.random() - 0.5) * 80,
        y: cv.height * 0.55,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 13 - 4,
        s: Math.random() * 6 + 4,
        r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
        c: colors[i % colors.length],
      });
    const t0 = performance.now();
    (function frame(t) {
      const el = t - t0;
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach((p) => {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - el / 1900);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      });
      if (el < 1900) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })(t0);
  };

  /* ---------- small form helpers used by every sheet ---------- */
  ui.values = (root) => {
    const out = {};
    u.$$('[name]', root).forEach((el) => {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value;
      } else out[el.name] = el.value;
    });
    return out;
  };
  ui.field = (label, control, hint) =>
    '<label class="field"><span class="field-l">' + u.esc(label) + '</span>' + control + (hint ? '<span class="field-h">' + u.esc(hint) + '</span>' : '') + '</label>';
  ui.select = (name, opts, value) =>
    '<select name="' + name + '">' + opts.map((o) => '<option value="' + u.esc(o.v) + '"' + (String(o.v) === String(value) ? ' selected' : '') + '>' + u.esc(o.t) + '</option>').join('') + '</select>';
  ui.seg = (act, opts, value, extra) =>
    '<div class="seg" role="tablist"' + (extra || '') + '>' +
    opts.map((o) => '<button role="tab" class="rip" aria-selected="' + (o.v === value) + '" data-act="' + act + '" data-v="' + u.esc(o.v) + '">' + u.esc(o.t) + '</button>').join('') +
    '</div>';
  ui.empty = (icon, title, text, cta) =>
    '<div class="empty">' + u.icon(icon, 'empty-i') + '<h3>' + u.esc(title) + '</h3><p>' + u.esc(text) + '</p>' + (cta || '') + '</div>';
  ui.skeleton = (n) => {
    let s = '<div class="skel-wrap" aria-hidden="true">';
    for (let i = 0; i < (n || 3); i++) s += '<div class="skel" style="height:' + (i === 0 ? 120 : 72) + 'px"></div>';
    return s + '</div>';
  };
})((window.SOS = window.SOS || {}));

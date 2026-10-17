/* charts.js — tiny SVG/HTML chart builders. Each returns an HTML string.
 * Rings animate from empty: they render at 0 and app.animate() sets data-dash after first paint. */
(function (S) {
  'use strict';
  const u = S.u;
  const C = (S.charts = {});
  const SC = { phy: 'var(--phy)', chem: 'var(--chem)', mth: 'var(--mth)', cs: 'var(--cs)', other: 'var(--text-3)' };
  C.subjColor = (s) => SC[s] || SC.other;

  /* Single progress ring. p = 0..1 */
  C.ring = (p, o) => {
    o = o || {};
    const size = o.size || 72;
    const stroke = o.stroke || 8;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const color = o.color || 'var(--accent)';
    const fill = Math.max(0, Math.min(1, p)) * circ;
    return (
      '<span class="ring" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + u.esc(o.label || Math.round(p * 100) + ' percent') + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--track)" stroke-width="' + stroke + '"/>' +
      (fill > 0.5
        ? '<circle class="ring-fill" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-linecap="round" ' +
          'stroke-dasharray="0 ' + circ.toFixed(2) + '" data-dash="' + fill.toFixed(2) + ' ' + circ.toFixed(2) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>'
        : '') +
      '</svg>' +
      (o.center != null ? '<span class="ring-c">' + o.center + '</span>' : '') +
      '</span>'
    );
  };

  /* The four-arc "prism" ring: one quarter per subject. segs = [{p, color, label}] */
  C.prism = (segs, o) => {
    o = o || {};
    const size = o.size || 112;
    const stroke = o.stroke || 10;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const gap = stroke * 1.15;
    const span = circ / segs.length - gap;
    let out = '<span class="ring prism" style="width:' + size + 'px;height:' + size + 'px"><svg viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + u.esc(o.label || 'Progress by subject') + '">';
    segs.forEach((s, i) => {
      const rot = -90 + (360 / segs.length) * i + (gap / circ) * 180;
      const t = 'transform="rotate(' + rot.toFixed(2) + ' ' + size / 2 + ' ' + size / 2 + ')"';
      out += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-opacity=".22" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + span.toFixed(2) + ' ' + (circ - span).toFixed(2) + '" ' + t + '/>';
      const f = Math.max(0, Math.min(1, s.p)) * span;
      if (f > 0.5)
        out += '<circle class="ring-fill" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="0 ' + circ.toFixed(2) + '" data-dash="' + f.toFixed(2) + ' ' + circ.toFixed(2) + '" ' + t + '/>';
    });
    out += '</svg>' + (o.center != null ? '<span class="ring-c">' + o.center + '</span>' : '') + '</span>';
    return out;
  };

  /* Vertical bars. items = [{label, value, color?, hint?}] */
  C.bars = (items, o) => {
    o = o || {};
    const h = o.height || 120;
    const max = Math.max(o.max || 0, ...items.map((i) => i.value), 1);
    let out = '<div class="bars" style="height:' + (h + 22) + 'px" role="img" aria-label="' + u.esc(o.label || 'Bar chart') + '">';
    items.forEach((i) => {
      const bh = Math.max(i.value > 0 ? 4 : 0, Math.round((i.value / max) * h));
      out +=
        '<div class="bar-col"><span class="bar-val">' + (i.value ? u.esc(i.text != null ? i.text : i.value) : '') + '</span>' +
        '<span class="bar-fill' + (i.today ? ' is-today' : '') + '" style="height:' + bh + 'px' + (i.color ? ';background:' + i.color : '') + '"></span>' +
        '<span class="bar-lab">' + u.esc(i.label) + '</span></div>';
    });
    return out + '</div>';
  };

  /* Line chart for mock percentages. points = [{x label, y 0..100}] */
  C.line = (points, o) => {
    o = o || {};
    const W = 320;
    const H = o.height || 130;
    const pad = { l: 28, r: 10, t: 10, b: 20 };
    if (!points.length) return '';
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const xs = (i) => pad.l + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
    const ys = (v) => pad.t + ih - (u.clamp(v, 0, 100) / 100) * ih;
    let grid = '';
    [0, 50, 100].forEach((g) => {
      grid += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + ys(g) + '" y2="' + ys(g) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (pad.l - 6) + '" y="' + (ys(g) + 3) + '" text-anchor="end" class="ax">' + g + '</text>';
    });
    const pts = points.map((p, i) => xs(i).toFixed(1) + ',' + ys(p.y).toFixed(1));
    let path = '';
    let area = '';
    if (points.length > 1) {
      path = '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      area = '<polygon points="' + pad.l + ',' + ys(0) + ' ' + pts.join(' ') + ' ' + xs(points.length - 1) + ',' + ys(0) + '" fill="var(--accent)" opacity=".10"/>';
    }
    const dots = points
      .map((p, i) => '<circle cx="' + xs(i).toFixed(1) + '" cy="' + ys(p.y).toFixed(1) + '" r="' + (i === points.length - 1 ? 5 : 3.5) + '" fill="var(--surface-solid)" stroke="var(--accent)" stroke-width="2.5"/>')
      .join('');
    const last = points[points.length - 1];
    const labelX = xs(points.length - 1);
    const lab = '<text x="' + Math.min(labelX, W - 18) + '" y="' + (ys(last.y) - 10) + '" text-anchor="middle" class="ax-strong">' + Math.round(last.y) + '%</text>';
    return '<svg class="line-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + u.esc(o.label || 'Trend') + '">' + grid + area + path + dots + lab + '</svg>';
  };

  /* GitHub-style heatmap. days = [{iso, min}], columns = weeks (Mon..Sun rows). */
  C.heat = (days, goalMin) => {
    const level = (m) => (m <= 0 ? 0 : m < goalMin * 0.25 ? 1 : m < goalMin * 0.5 ? 2 : m < goalMin * 0.8 ? 3 : 4);
    let out = '<div class="heat" role="img" aria-label="Study time heatmap">';
    days.forEach((d) => {
      out += '<span class="heat-c l' + level(d.min) + (d.blank ? ' blank' : '') + (d.today ? ' today' : '') + '" title="' + (d.blank ? '' : u.esc(u.dateShort(d.iso) + ': ' + u.fmtMin(d.min))) + '"></span>';
    });
    return out + '</div>';
  };

  /* Horizontal stacked bar with legend. parts = [{label, value, color}] */
  C.stack = (parts) => {
    const total = u.sum(parts.map((p) => p.value));
    if (!total) return '';
    let bar = '<div class="stackbar" role="img" aria-label="Subject split">';
    let legend = '<ul class="legend">';
    parts.forEach((p) => {
      if (!p.value) return;
      bar += '<span style="flex:' + p.value + ';background:' + p.color + '"></span>';
      legend += '<li><i style="background:' + p.color + '"></i>' + u.esc(p.label) + '<b>' + Math.round((p.value / total) * 100) + '%</b></li>';
    });
    return bar + '</div>' + legend + '</ul>';
  };

  C.bar = (p, color) =>
    '<span class="pbar"><span class="pbar-fill" style="width:' + Math.round(u.clamp(p, 0, 1) * 100) + '%' + (color ? ';background:' + color : '') + '"></span></span>';

  // Runs after a view renders: grows the rings from empty.
  C.animate = (root) => {
    const rings = u.$$('.ring-fill[data-dash]', root);
    if (!rings.length) return;
    if (u.reducedMotion()) {
      rings.forEach((el) => (el.style.strokeDasharray = el.getAttribute('data-dash')));
      return;
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => rings.forEach((el) => (el.style.strokeDasharray = el.getAttribute('data-dash'))))
    );
  };
})((window.SOS = window.SOS || {}));

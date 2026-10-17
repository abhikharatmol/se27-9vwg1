/* formula.js — a tiny, safe formula markup for the Formulas card. No DOM, no libraries.
 *
 * Markup (everything else is shown as plain text):
 *   x^2   x^-1   x^(a+b)   10^-3      superscript: a sign + digits (with decimals), a run of letters, or a (group)
 *   x_1   v_rms   x_(i+1)             subscript, same rule
 *   sqrt(...)                         square root; the inside is formula markup too
 *   omega  theta  Delta  pi ...       Greek letters by name (whole words only; Omega is the capital)
 *   *                                 multiplication sign
 *   <=  >=  !=  +-  ->                 ≤ ≥ ≠ ± →
 *
 * Safety: the input is never put in the page as markup. Every piece of the input is HTML-escaped; the
 * only tags in the output are the ones built here (<sup>, <sub> and <span class="fx-...">), they carry no
 * attributes from the input, and nesting and length are capped, so `<script>`, event attributes and
 * "javascript:" can only ever appear as harmless text.
 */
(function (S) {
  'use strict';

  const GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
    nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  };
  const OPS = [['<=', '≤'], ['>=', '≥'], ['!=', '≠'], ['+-', '±'], ['->', '→'], ['*', '×']];
  const MAX_LEN = 240; // longer input is cut
  const MAX_DEPTH = 5; // deeper nesting is shown as plain text
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

  // The balanced (...) group that starts at s[i] === '('. Returns { inner, end } or null (unbalanced).
  function group(s, i) {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')' && --depth === 0) return { inner: s.slice(i + 1, j), end: j + 1 };
    }
    return null;
  }
  // The argument of ^ or _ that starts at s[i]: (group) | [+-]digits[.digits] | letters. Or null.
  function atom(s, i) {
    if (s[i] === '(') return group(s, i) ? { text: group(s, i).inner, end: group(s, i).end } : null;
    const m = /^[+-]?(?:\d+(?:\.\d+)?|[A-Za-z]+)/.exec(s.slice(i));
    return m ? { text: m[0], end: i + m[0].length } : null;
  }

  function inline(s, depth) {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (depth < MAX_DEPTH && s.startsWith('sqrt(', i)) {
        const g = group(s, i + 4);
        if (g) {
          out += '<span class="fx-rad">√<span class="fx-rb">' + inline(g.inner, depth + 1) + '</span></span>';
          i = g.end;
          continue;
        }
      }
      if (c === '^' || c === '_') {
        const a = depth < MAX_DEPTH ? atom(s, i + 1) : null;
        if (a) {
          const tag = c === '^' ? 'sup' : 'sub';
          out += '<' + tag + '>' + inline(a.text, depth + 1) + '</' + tag + '>';
          i = a.end;
          continue;
        }
      }
      if (/[A-Za-z]/.test(c)) {
        const word = /^[A-Za-z]+/.exec(s.slice(i))[0];
        out += Object.prototype.hasOwnProperty.call(GREEK, word) ? GREEK[word] : esc(word);
        i += word.length;
        continue;
      }
      const op = OPS.filter((o) => s.startsWith(o[0], i))[0];
      if (op) {
        out += op[1];
        i += op[0].length;
        continue;
      }
      out += esc(c);
      i++;
    }
    return out;
  }

  const render = (text) => inline(String(text == null ? '' : text).slice(0, MAX_LEN), 0);

  // Plain text for aria-label and search: Greek letters, × and √ in place; small ^ / _ digits as Unicode.
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' };
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
  function plain(text) {
    let s = String(text == null ? '' : text).slice(0, MAX_LEN);
    s = s.replace(/\^([+-]?\d+)/g, (m, d) => d.split('').map((x) => SUP[x]).join(''));
    s = s.replace(/_(\d+)/g, (m, d) => d.split('').map((x) => SUB[x]).join(''));
    s = s.replace(/[A-Za-z]+/g, (w) => (Object.prototype.hasOwnProperty.call(GREEK, w) ? GREEK[w] : w));
    s = s.replace(/sqrt\(/g, '√(');
    OPS.forEach((o) => (s = s.split(o[0]).join(o[1])));
    return s;
  }

  S.formula = { render: render, plain: plain, GREEK: GREEK };
})((window.SOS = window.SOS || {}));

/* views/code.js — the Code page (Study > Code): #/code (the labs), #/code/8085 (assembler and CPU) and #/code/html (editor with a live page).
 *   8085 lab: write a program, press Run, see the registers, flags and a memory window. Pick a board task: "Check my program" runs it on the
 *   task's test cases (data/cs items with `checks`, the same ones the tests run on the model program) and says which cases pass.
 *   HTML lab: write a page and see it at once in a sandboxed frame (no scripts run in it).
 *   Every editor has a row of keys for symbols that are slow to type on a phone ({ } ; << ...); a key keeps the focus in the editor.
 *   C++ lab (#/code/cpp): write or load a board program, give it input, press Run. This is the ONE place that uses the network: the code and the
 *   input go to the free online compiler wandbox.org (g++), and the output comes back. Nothing else is sent. Offline it says so.
 *   A board program (?q=<id> or the picker) starts from an empty main(); Check runs it with the test cases of data/cs-cpp-cases.json.
 * The CPU is js/sim8085.js. Nothing is saved except what she types into the page (kept in memory while the page is open). */
(function (S) {
  'use strict';
  const u = S.u;
  const ui = S.ui;
  const SIM = S.sim8085;
  S.views = S.views || {};

  const st = { src8085: 'LDA  2000H\n       MOV  B,A\n       LDA  2001H\n       ADD  B\n       STA  2002H\n       HLT', mem: '2000: 05 09', from: '2000', task: '', html: '<H1>My page</H1>\n<P>Hello, <B>board exam</B>!</P>\n<UL>\n<LI>HTML\n<LI>C++\n</UL>', run: null, check: null, model: false };
  const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
  const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, '0');

  function parseMem(text) { // "2000: 05 09" per line, hex numbers
    const mem = {};
    String(text).split(/\r?\n/).forEach((ln) => {
      const m = /^\s*([0-9A-Fa-f]{1,4})\s*:\s*(.*)$/.exec(ln);
      if (!m) return;
      const bytes = m[2].trim().split(/[\s,]+/).filter(Boolean).map((x) => parseInt(x, 16));
      if (bytes.every((b) => b >= 0 && b <= 255)) mem[parseInt(m[1], 16)] = bytes;
    });
    return mem;
  }
  const tasks = () => {
    const t = window.CS_C && window.CS_C['cs-12-06'];
    return (t || []).filter((q) => q.checks && q.checks.length);
  };
  const taskOf = (id) => tasks().filter((q) => q.id === id)[0];
  const loading = {};
  function loadCh(ch) {
    if ((window.CS_C && window.CS_C[ch]) || loading[ch]) return;
    loading[ch] = true;
    const s = document.createElement('script');
    s.src = 'data/cs-c/' + ch + '.js';
    s.onload = () => { loading[ch] = false; S.app.refresh(false); };
    s.onerror = () => { loading[ch] = false; s.remove(); };
    document.head.appendChild(s);
  }
  const ensureTasks = () => loadCh('cs-12-06');

  /* ---------- 8085 ---------- */
  function memWindow(cpu, from) {
    const at = parseInt(from, 16);
    if (isNaN(at)) return '<p class="small muted">Type a start address in hex, like 2000.</p>';
    let rows = '';
    for (let r = 0; r < 4; r++) {
      const a = (at + r * 8) & 0xFFFF;
      let cells = '';
      for (let i = 0; i < 8; i++) cells += '<td>' + hex2(cpu.mem[(a + i) & 0xFFFF]) + '</td>';
      rows += '<tr><th>' + hex4(a) + '</th>' + cells + '</tr>';
    }
    return '<table class="cd-mem" aria-label="Memory">' + rows + '</table>';
  }
  function resultHtml() {
    const r = st.run;
    if (!r) return '<p class="muted small">Press Run to see the registers, flags and memory.</p>';
    if (!r.ok) return '<div class="banner warn" role="alert" data-testid="cd-errors"><b>Fix these first:</b><ul>' + r.errors.map((e) => '<li>Line ' + e.line + ': ' + u.esc(e.msg) + '</li>').join('') + '</ul></div>';
    const c = r.cpu;
    const regs = ['a', 'b', 'c', 'd', 'e', 'h', 'l'].map((k) => '<span class="cd-reg"><small>' + k.toUpperCase() + '</small><b>' + hex2(c[k]) + '</b></span>').join('');
    const fl = [['S', c.f.s], ['Z', c.f.z], ['AC', c.f.ac], ['P', c.f.p], ['CY', c.f.cy]].map((x) => '<span class="cd-reg"><small>' + x[0] + '</small><b>' + x[1] + '</b></span>').join('');
    return '<section class="card stack" data-testid="cd-result"><h2 class="h3">After the run' + (c.halted ? '' : ' (stopped)') + '</h2>' +
      (r.result.error ? '<p class="small warn-t">' + u.esc(r.result.error) + '</p>' : '<p class="small muted">' + r.result.steps + ' instructions were done, ending at HLT.</p>') +
      '<div class="cd-regs">' + regs + '</div><div class="cd-regs">' + fl + '<span class="cd-reg"><small>SP</small><b>' + hex4(c.sp) + '</b></span><span class="cd-reg"><small>PC</small><b>' + hex4(c.pc) + '</b></span></div>' +
      '<label class="field-l" for="cd-from">Memory from (hex)</label><input id="cd-from" class="input" value="' + u.esc(st.from) + '" data-input="cd-from" maxlength="4" inputmode="text" autocomplete="off"><div id="cd-memwin">' + memWindow(c, st.from) + '</div></section>';
  }
  function checkHtml() {
    const ck = st.check;
    if (!ck) return '';
    if (!ck.ok) return '<div class="banner warn" role="alert">' + ck.errors.map((e) => 'Line ' + e.line + ': ' + u.esc(e.msg)).join('<br>') + '</div>';
    return '<section class="card stack" data-testid="cd-check"><h2 class="h3">' + ck.pass + ' of ' + ck.rows.length + ' test cases pass</h2><ul class="cd-cases">' + ck.rows.map((x) =>
      '<li class="' + (x.ok ? 'is-ok' : 'is-bad') + '">' + u.icon(x.ok ? 'check-c' : 'x') + '<span>' + u.esc(x.text) + '</span></li>').join('') + '</ul></section>';
  }
  function html8085() {
    ensureTasks();
    const ts = tasks();
    const t = taskOf(st.task);
    return (
      '<div class="page cd-page"><header class="page-h"><div><h1 class="h1">8085 lab</h1><p class="muted">Write an 8085 program, run it, and look inside the microprocessor. Hex numbers end with H, like 25FFH or 0FFH.</p></div></header>' +
      '<section class="card stack"><h2 class="h3">Board task (optional)</h2><select class="input" id="cd-task" data-change="cd-task" aria-label="Board task"><option value="">Free program (no task)</option>' +
      ts.map((q) => '<option value="' + u.esc(q.id) + '"' + (q.id === st.task ? ' selected' : '') + '>' + u.esc(q.q.slice(0, 70)) + '</option>').join('') + '</select>' +
      (t ? '<p class="cd-task" data-testid="cd-task-q">' + u.esc(t.q) + '</p><p class="small muted">Your program is tested with ' + t.checks.length + ' sets of numbers in memory. Put your answer where the task says (see the marking points).</p>' +
        '<ul class="cs-pts">' + t.model.map((p) => '<li class="small">' + u.esc(p.t) + '</li>').join('') + '</ul>' : '') + '</section>' +
      '<section class="card stack"><label class="field-l" for="cd-src">Program</label><textarea id="cd-src" class="input cd-src" data-testid="cd-src" spellcheck="false" rows="12" autocapitalize="off" autocomplete="off">' + u.esc(st.src8085) + '</textarea>' + keyRow('cd-src', 'asm') +
      '<label class="field-l" for="cd-mem">Memory before the run (hex address: bytes)</label><textarea id="cd-mem" class="input cd-src" data-testid="cd-mem" spellcheck="false" rows="3" autocapitalize="off">' + u.esc(st.mem) + '</textarea>' +
      '<div class="row gap"><button class="btn primary grow rip" data-act="cd-run" data-testid="cd-run">' + u.icon('play') + 'Run</button>' +
      (t ? '<button class="btn tonal grow rip" data-act="cd-check" data-testid="cd-checkbtn">Check my program</button>' : '') + '</div></section>' +
      resultHtml() + checkHtml() +
      (t ? '<section class="card stack"><button class="btn tonal block rip" data-act="cd-model" data-testid="cd-modelbtn">' + (st.model ? 'Hide' : 'Show') + ' the model program</button>' + (st.model ? '<pre class="cs-code" data-testid="cd-model">' + u.esc(t.code) + '</pre>' : '') + '</section>' : '') +
      '</div>'
    );
  }

  /* ---------- HTML ---------- */
  function htmlLab() {
    return (
      '<div class="page cd-page"><header class="page-h"><div><h1 class="h1">HTML lab</h1><p class="muted">Write HTML on the left and see the page at once. Try the tags of the syllabus: lists, tables, links, images and font styles.</p></div></header>' +
      '<div class="cd-split"><section class="card stack"><label class="field-l" for="cd-html">HTML code</label><textarea id="cd-html" class="input cd-src" data-testid="cd-html" spellcheck="false" rows="14" autocapitalize="off" autocomplete="off">' + u.esc(st.html) + '</textarea>' + keyRow('cd-html', 'html') + '</section>' +
      '<section class="card stack"><h2 class="h3">Your page</h2><iframe class="cd-frame" title="Preview of your page" sandbox="" data-testid="cd-frame" srcdoc="' + u.esc(st.html) + '"></iframe></section></div></div>'
    );
  }

  /* ---------- keyboard row: symbols that are slow to type on a phone ---------- */
  const KEYS = {
    cpp: [['Tab', '    '], ['{', '{'], ['}', '}'], ['(', '('], [')', ')'], [';', ';'], ['<<', ' << '], ['>>', ' >> '], ['"', '"'], ['=', ' = '], ['<', '<'], ['>', '>'], ['[', '['], [']', ']'], ['+', '+'], ['-', '-'], ['*', '*'], ['/', '/'], ['%', '%'], ['&', '&'], ['!', '!'], ['#', '#'], ['cout', 'cout << '], ['cin', 'cin >> '], ['endl', 'endl']],
    asm: [['Tab', '    '], [',', ', '], [':', ': '], [';', '; '], ['H', 'H'], ['MVI', 'MVI '], ['MOV', 'MOV '], ['LXI', 'LXI '], ['LDA', 'LDA '], ['STA', 'STA '], ['INX H', 'INX H'], ['DCR C', 'DCR C'], ['JNZ', 'JNZ '], ['HLT', 'HLT']],
    html: [['Tab', '    '], ['<', '<'], ['>', '>'], ['/', '/'], ['"', '"'], ['=', '='], ['</', '</'], ['<br>', '<br>'], ['<p>', '<p>'], ['<li>', '<li>']],
  };
  const keyRow = (forId, set) => '<div class="cd-keys" role="toolbar" aria-label="Insert symbols" data-testid="cd-keys">' +
    KEYS[set].map((k) => '<button type="button" class="cd-key" data-ins="' + u.esc(k[1]) + '" data-for="' + forId + '" aria-label="Insert ' + u.esc(k[0]) + '">' + u.esc(k[0]) + '</button>').join('') + '</div>';
  function insertAt(el, text) {
    const a = el.selectionStart == null ? el.value.length : el.selectionStart;
    const b = el.selectionEnd == null ? a : el.selectionEnd;
    el.value = el.value.slice(0, a) + text + el.value.slice(b);
    el.selectionStart = el.selectionEnd = a + text.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // pointerdown keeps the focus (and the phone keyboard) in the editor; click covers the keyboard and screen readers
  document.addEventListener('pointerdown', (e) => {
    const k = e.target && e.target.closest && e.target.closest('.cd-key');
    if (!k) return;
    e.preventDefault();
    const el = document.getElementById(k.dataset.for);
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    insertAt(el, k.dataset.ins);
    k.dataset.p = '1';
    setTimeout(() => { delete k.dataset.p; }, 1500); // a scroll gesture sends no click
  });
  document.addEventListener('pointercancel', (e) => { const k = e.target && e.target.closest && e.target.closest('.cd-key'); if (k) delete k.dataset.p; });
  document.addEventListener('click', (e) => {
    const k = e.target && e.target.closest && e.target.closest('.cd-key');
    if (!k) return;
    if (k.dataset.p) { delete k.dataset.p; return; }
    const el = document.getElementById(k.dataset.for);
    if (el) { el.focus(); insertAt(el, k.dataset.ins); }
  });

  /* ---------- C++ (online) ---------- */
  const WANDBOX = 'https://wandbox.org/api/compile.json';
  const STARTER = '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n';
  const cpp = { src: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cout << "Enter a number: ";\n    cin >> n;\n    cout << "Square = " << n * n << endl;\n    return 0;\n}\n', cin: '7', pick: '', busy: false, out: null, check: null, model: false, lastQ: '' };
  const cppTasks = () => ((window.CS_C && window.CS_C['cs-12-03']) || []).filter((q) => q.code && q.code.indexOf('#include') >= 0);
  const lessonOf = (id) => ((S.CODE_COURSE || {}).lessons || []).filter((l) => l.id === id)[0];
  const cppTask = () => {
    if (/^L:/.test(cpp.pick)) {
      const l = lessonOf(cpp.pick.slice(2));
      return l ? { id: cpp.pick, q: l.task.q, code: l.task.solution, cases: l.task.cases, lesson: l.id, hint: l.task.hint } : null;
    }
    return cppTasks().filter((x) => x.id === cpp.pick)[0];
  };
  const clip = (t) => (String(t || '').length > 20000 ? String(t).slice(0, 20000) + '\n... (cut)' : String(t || ''));
  // the same rule as tools/check_cpp.py: tokens (numbers or words, lower case); the `has` tokens in order, none of the `no` tokens
  const TOKEN = /-?\d+(?:\.\d+)?|[a-z]+/g;
  const caseOk = (out, c) => {
    const toks = String(out || '').toLowerCase().match(TOKEN) || [];
    let i = 0;
    for (const w of c.has) {
      const want = String(w).toLowerCase();
      while (i < toks.length && toks[i] !== want) i++;
      if (i === toks.length) return false;
      i++;
    }
    return !(c.no || []).some((n) => toks.indexOf(String(n).toLowerCase()) >= 0);
  };
  function cppOut() {
    const o = cpp.out;
    if (cpp.busy) return '<section class="card"><p class="muted" data-testid="cd-cpp-busy">' + (cpp.busy === 'check' ? 'Checking your program with the test inputs...' : 'Compiling and running...') + '</p></section>';
    const ck = cpp.check;
    if (ck) {
      if (ck.fail) return '<div class="banner warn" role="alert" data-testid="cd-cpp-fail">' + u.esc(ck.fail) + '</div>';
      if (ck.compile) return '<section class="card stack" data-testid="cd-cpp-check"><h2 class="h3">It did not compile</h2><pre class="cs-code" data-testid="cd-cpp-err">' + u.esc(clip(ck.compile)) + '</pre></section>';
      return '<section class="card stack" data-testid="cd-cpp-check"><h2 class="h3">' + ck.pass + ' of ' + ck.rows.length + ' tests pass</h2>' +
        (ck.pass === ck.rows.length ? '<p class="cs-win">' + u.icon('check-c') + 'Your program gives the right results.</p>' : '<p class="small muted">Look at what your program printed for the failing input.</p>') +
        '<ul class="cd-cases">' + ck.rows.map((x) => '<li class="' + (x.ok ? 'is-ok' : 'is-bad') + '">' + u.icon(x.ok ? 'check-c' : 'x') + '<span>Input: <code>' + u.esc(x.in || '(none)') + '</code>. It must show: ' + u.esc(x.has.join(', ')) + (x.no && x.no.length ? ' (and not: ' + u.esc(x.no.join(', ')) + ')' : '') +
          (x.ok ? '' : '<br>Your program printed: <code>' + u.esc(clip(x.got).slice(-240) || '(nothing)') + '</code>') + '</span></li>').join('') + '</ul></section>';
    }
    if (!o) return '<p class="muted small">Press Run. The program is compiled by g++ and run with the input you typed.</p>';
    if (o.fail) return '<div class="banner warn" role="alert" data-testid="cd-cpp-fail">' + u.esc(o.fail) + '</div>';
    return '<section class="card stack" data-testid="cd-cpp-out"><h2 class="h3">' + (o.compile ? 'It did not compile' : o.status === '0' ? 'Output' : 'The program ended with an error (code ' + u.esc(o.status) + ')') + '</h2>' +
      (o.compile ? '<pre class="cs-code" data-testid="cd-cpp-err">' + u.esc(clip(o.compile)) + '</pre>' : '<pre class="cs-code" data-testid="cd-cpp-text">' + u.esc(clip(o.out) || '(no output)') + '</pre>') +
      (o.err ? '<h3 class="sol-h">Error output</h3><pre class="cs-code">' + u.esc(clip(o.err)) + '</pre>' : '') + '</section>';
  }
  function cppLab() {
    loadCh('cs-12-03');
    const ts = cppTasks();
    const t = cppTask();
    return (
      '<div class="page cd-page"><header class="page-h"><div><h1 class="h1">C++ lab</h1><p class="muted">Write a C++ program, give it input and run it with a real g++ compiler. Pick a board program to practise it with automatic checks.</p></div></header>' +
      '<div class="banner cd-net" data-testid="cd-cpp-net"><b>Needs internet.</b> When you press Run or Check, your code and input are sent to wandbox.org, a free online compiler. Nothing else is sent. The rest of the app works offline.</div>' +
      '<section class="card stack"><h2 class="h3">What to write (optional)</h2><select class="input" id="cd-cpp-pick" data-change="cd-cpp-pick" aria-label="Task"><option value="">My own program</option>' +
      '<optgroup label="Coding from zero">' + course().map((l, k) => '<option value="L:' + l.id + '"' + ('L:' + l.id === cpp.pick ? ' selected' : '') + '>Lesson ' + (k + 1) + ': ' + u.esc(l.t) + '</option>').join('') + '</optgroup>' +
      '<optgroup label="Board programs">' + ts.map((q) => '<option value="' + u.esc(q.id) + '"' + (q.id === cpp.pick ? ' selected' : '') + '>' + (q.cases ? '' : '(no checks) ') + u.esc(q.q.replace(/\s+/g, ' ').slice(0, 70)) + '</option>').join('') + '</optgroup></select>' +
      (t && t.lesson ? '<p class="small"><b>Lesson task</b> · <a class="link" href="#/code/learn/' + t.lesson + '">back to the lesson</a></p>' : '') + (t ? '<p class="cd-task" data-testid="cd-cpp-task">' + u.esc(t.q).replace(/\n/g, '<br>') + '</p><p class="small muted">' + (t.cases ? 'Write it yourself, then press Check: it runs your program with ' + t.cases.length + (t.cases.length === 1 ? ' test input' : ' test inputs') + '.' : 'This one has no automatic check; compare with the model program.') + '</p>' +
        '<button class="link" data-act="cd-cpp-model" data-testid="cd-cpp-modelbtn">' + (cpp.model ? 'Hide' : 'Show') + ' the model program</button>' +
        (cpp.model ? '<pre class="cs-code" data-testid="cd-cpp-model">' + u.esc(t.code) + '</pre><button class="link" data-act="cd-cpp-load" data-testid="cd-cpp-load">Copy it into the editor</button>' : '') : '<p class="small muted">Choosing one gives you an empty program to write, its test inputs, and the model program if you get stuck.</p>') + '</section>' +
      '<section class="card stack"><label class="field-l" for="cd-cpp">Program</label><textarea id="cd-cpp" class="input cd-src" data-testid="cd-cpp" spellcheck="false" rows="16" autocapitalize="off" autocomplete="off">' + u.esc(cpp.src) + '</textarea>' + keyRow('cd-cpp', 'cpp') +
      '<label class="field-l" for="cd-cin">Input (what the user types, one line per Enter)</label><textarea id="cd-cin" class="input cd-src" data-testid="cd-cin" spellcheck="false" rows="3" autocapitalize="off">' + u.esc(cpp.cin) + '</textarea>' +
      '<div class="row gap"><button class="btn primary grow rip" data-act="cd-cpp-run" data-testid="cd-cpp-run"' + (cpp.busy ? ' disabled' : '') + '>' + u.icon('play') + 'Run</button>' +
      (t && t.cases ? '<button class="btn tonal grow rip" data-act="cd-cpp-check" data-testid="cd-cpp-checkbtn"' + (cpp.busy ? ' disabled' : '') + '>Check my program</button>' : '') + '</div></section>' + cppOut() + '</div>'
    );
  }

  /* ---------- index ---------- */
  /* ---------- Coding from zero (data/code-course.json -> S.CODE_COURSE; progress in store domain `code`) ---------- */
  const course = () => (S.CODE_COURSE || { lessons: [] }).lessons;
  const prog = (id) => ((S.store.get('code') || { lessons: {} }).lessons || {})[id] || {};
  const lessonDone = (l) => { const p = prog(l.id); return !!p.task && (p.quiz || []).filter(Boolean).length === l.quiz.length; };
  const quizRight = (l) => (prog(l.id).quiz || []).filter(Boolean).length;
  const courseStats = () => {
    const ls = course();
    return { n: ls.length, done: ls.filter(lessonDone).length, tasks: ls.filter((l) => prog(l.id).task).length, quiz: ls.reduce((t, l) => t + quizRight(l), 0), quizAll: ls.reduce((t, l) => t + l.quiz.length, 0) };
  };
  const nextLesson = () => course().filter((l) => !lessonDone(l))[0] || null;
  // lesson prose: `code` becomes a monospace chip
  const prose = (t) => u.esc(t).replace(/`([^`]+)`/g, '<code class="ic">$1</code>');
  const pf = (items) => '<div class="ph-f">' + items.map((x) => '<div><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('') + '</div>';

  function courseHtml() {
    const ls = course();
    const cs = courseStats();
    const nx = nextLesson();
    const rows = ls.map((l, i) => {
      const done = lessonDone(l);
      const p = prog(l.id);
      const state = done ? 'Done' : p.task || quizRight(l) ? 'Started' : '';
      return '<li><button class="srow rip" data-act="go" data-to="#/code/learn/' + l.id + '" data-testid="cl-row"><span class="sx-m">' + (done ? '<i class="ink-mark" aria-label="done"></i>' : i + 1) + '</span>' +
        '<span class="sx-b"><b class="sx-t">' + u.esc(l.t) + '</b><small class="sx-s">' + u.esc(l.why) + '</small></span><span class="sx-e">' + (state ? '<span class="chip-s' + (done ? ' ok' : '') + '">' + state + '</span>' : '') + u.icon('chev-r', 'chev') + '</span></button></li>';
    }).join('');
    return '<div class="page cl-page"><header class="paper-h"><div class="ph-t"><p class="ph-k">Code · beginner course</p><h1 class="h1">Coding from zero</h1><p class="ph-s">C++ from the very first line to classes. Read the idea, see an example line by line, check yourself, then write the program.</p></div>' +
      pf([['Lessons', cs.done + '/' + cs.n], ['Quiz', cs.quiz + '/' + cs.quizAll], ['Programs', cs.tasks + '/' + cs.n]]) + '</header>' +
      '<div class="with-rail"><div><ol class="asheet" data-testid="cl-list">' + rows + '</ol></div>' +
      '<aside class="rail"><section class="card stack"><h2 class="h3">' + (nx ? (cs.done ? 'Next lesson' : 'Start here') : 'Course done') + '</h2>' +
      (nx ? '<p class="small muted">Lesson ' + (ls.indexOf(nx) + 1) + ': ' + u.esc(nx.t.replace(/[.?!]$/, '')) + '. About 15 minutes.</p><button class="btn primary block rip" data-act="go" data-to="#/code/learn/' + nx.id + '" data-testid="cl-next">' + u.icon('play') + (cs.done ? 'Continue' : 'Start lesson 1') + '</button>'
        : '<p class="small muted">Every lesson is done. Practise with the C++ board programs next.</p><button class="btn primary block rip" data-act="go" data-to="#/code/cpp">Open the C++ lab</button>') +
      '<p class="small muted">The ideas and quizzes work offline. Running a program needs internet (the online compiler).</p></section></aside></div></div>';
  }

  const qsel = {}; // lesson id -> [picked option index per question] while she answers
  function lessonHtml(id) {
    const ls = course();
    const i = ls.findIndex((l) => l.id === id);
    const l = ls[i];
    if (!l) return '<div class="page">' + ui.empty('code', 'Lesson not found', 'Go back to the course.', '<button class="btn tonal rip" data-act="go" data-to="#/code/learn">All lessons</button>') + '</div>';
    const p = prog(l.id);
    const saved = p.quiz || [];
    const picks = qsel[l.id] || (qsel[l.id] = l.quiz.map(() => null));
    const lines = l.code.replace(/\s+$/, '').split('\n');
    const quiz = l.quiz.map((q, k) => {
      const pick = picks[k];
      const locked = pick !== null || saved[k];
      const shown = pick !== null ? pick : saved[k] ? q.ans : null;
      return '<li class="cl-q"><p class="cl-qt"><b>' + (k + 1) + '.</b> ' + u.esc(q.q) + '</p><div class="opts">' + q.options.map((o, j) => {
        const cls = locked && shown !== null ? (j === q.ans ? ' right' : j === shown ? ' wrong' : '') : '';
        return '<button class="opt rip' + cls + '" data-act="cl-quiz" data-l="' + l.id + '" data-k="' + k + '" data-v="' + j + '"' + (locked && shown !== null ? ' disabled' : '') + '><span class="let">' + 'ABCD'[j] + '</span><span class="ot">' + u.esc(o) + '</span></button>';
      }).join('') + '</div>' + (locked && shown !== null ? '<p class="small cl-why">' + u.esc(q.why) + '</p>' : '') + '</li>';
    }).join('');
    const qr = quizRight(l);
    return '<div class="page cl-page cl-lesson"><header class="paper-h"><div class="ph-t"><p class="ph-k">Coding from zero · lesson ' + (i + 1) + ' of ' + ls.length + '</p><h1 class="h1">' + u.esc(l.t) + '</h1><p class="ph-s">' + u.esc(l.why) + '</p></div>' +
      pf([['Quiz', qr + '/' + l.quiz.length], ['Program', p.task ? '<i class="ink-mark inline" aria-label="done"></i>' : '–']]) + '</header>' +
      '<section class="card cl-idea"><h2 class="h3">The idea</h2>' + l.idea.map((t) => '<p>' + prose(t) + '</p>').join('') + '</section>' +
      '<section class="card stack"><h2 class="h3">Example</h2><ol class="cl-code" data-testid="cl-code">' + lines.map((t, k) => '<li><span class="cl-ln">' + (k + 1) + '</span><code>' + (u.esc(t) || ' ') + '</code></li>').join('') + '</ol>' +
      '<h3 class="sol-h">Line by line</h3><ol class="asheet cl-lines">' + l.lines.map((x) => '<li class="srow is-static"><span class="sx-m">' + x[0] + '</span><span class="sx-b"><span class="cl-lt">' + u.esc(x[1]) + '</span></span><span></span></li>').join('') + '</ol>' +
      '<button class="btn tonal block rip" data-act="go" data-to="#/code/cpp?ex=' + l.id + '" data-testid="cl-run-ex">' + u.icon('play') + 'Run this example (needs internet)</button></section>' +
      '<section class="card stack"><h2 class="h3">Check yourself</h2><ol class="cl-quiz" data-testid="cl-quiz">' + quiz + '</ol></section>' +
      '<section class="card stack cl-task"><h2 class="h3">Your turn</h2><p class="cd-task" data-testid="cl-task">' + u.esc(l.task.q).replace(/\n/g, '<br>') + '</p>' +
      '<details class="cl-hint"><summary>Show a hint</summary><p class="small">' + u.esc(l.task.hint) + '</p></details>' +
      (p.task ? '<p class="cs-win">' + u.icon('check-c') + 'You wrote this program and it passed the checks.</p>' : '') +
      '<button class="btn primary block rip" data-act="go" data-to="#/code/cpp?lesson=' + l.id + '" data-testid="cl-open-lab">' + u.icon('code') + 'Write it in the C++ lab</button>' +
      '<p class="small muted">The lab checks your program with ' + l.task.cases.length + (l.task.cases.length === 1 ? ' test input' : ' test inputs') + ' and marks this lesson done when they pass.</p></section>' +
      '<div class="row gap cl-nav"><button class="btn tonal grow rip" data-act="go" data-to="#/code/learn/' + (ls[i - 1] ? ls[i - 1].id : '') + '"' + (i > 0 ? '' : ' disabled') + '>' + u.icon('chev-l') + 'Previous</button>' +
      '<button class="btn tonal grow rip" data-act="go" data-to="#/code/learn/' + (ls[i + 1] ? ls[i + 1].id : '') + '"' + (i < ls.length - 1 ? '' : ' disabled') + '>Next' + u.icon('chev-r') + '</button></div></div>';
  }

  S.codeCourse = {
    stats: courseStats,
    next: nextLesson,
    no: (l) => course().indexOf(l) + 1,
    // the card the other pages show: where she is in the course and one button to go on
    card: (testid, tonal) => {
      const st = courseStats();
      if (!st.n) return '';
      const nx = nextLesson();
      return '<section class="card cl-hero" data-testid="' + testid + '"><div class="grow"><p class="ph-k">Coding from zero · C++ for beginners</p><h2 class="h3">' + (nx ? (st.done ? 'Lesson ' + (course().indexOf(nx) + 1) + ': ' + u.esc(nx.t) : 'Learn to code from the first line') : 'All 12 lessons done') + '</h2>' +
        '<p class="small muted">' + (nx ? st.done + ' of ' + st.n + ' lessons done. Each lesson: the idea, an example line by line, a quiz and a program you write.' : 'Practise the C++ board programs next.') + '</p></div>' +
        '<button class="btn ' + (tonal ? 'tonal' : 'primary') + ' rip" data-act="go" data-to="' + (nx ? '#/code/learn/' + nx.id : '#/code/cpp') + '">' + u.icon('play') + (nx ? (st.done ? 'Continue' : 'Start') : 'C++ lab') + '</button></section>';
    },
  };

  function indexHtml() {
    const cs = courseStats();
    const nx = nextLesson();
    const lab = (to, mark, t, s, id) => '<li><button class="srow rip" data-act="go" data-to="' + to + '" data-testid="' + id + '"><span class="sx-m">' + mark + '</span><span class="sx-b"><b class="sx-t">' + t + '</b><small class="sx-s">' + s + '</small></span><span class="sx-e">' + u.icon('chev-r', 'chev') + '</span></button></li>';
    return (
      '<div class="page"><header class="paper-h"><div class="ph-t"><p class="ph-k">Study</p><h1 class="h1">Coding</h1><p class="ph-s">Start from zero, then practise the board programs. 8085 and HTML work offline; running C++ needs internet.</p></div>' +
      pf([['Lessons', cs.done + '/' + cs.n], ['Programs', cs.tasks + '/' + cs.n]]) + '</header>' +
      '<div class="with-rail"><div>' +
      '<section class="card cl-hero" data-testid="cd-course"><div class="grow"><p class="ph-k">Beginner course</p><h2 class="h2">Coding from zero</h2><p class="small muted">12 short lessons: what a program is, printing, variables, input, decisions, loops, arrays, functions and classes. Each ends with a program you write and the app checks.</p>' +
      '<p class="small"><b>' + cs.done + ' of ' + cs.n + '</b> lessons done</p></div>' +
      '<div class="row gap"><button class="btn primary grow rip" data-act="go" data-to="' + (nx ? '#/code/learn/' + nx.id : '#/code/learn') + '" data-testid="cd-course-go">' + u.icon('play') + (nx ? (cs.done ? 'Continue: lesson ' + (course().indexOf(nx) + 1) : 'Start lesson 1') : 'Review the lessons') + '</button>' +
      '<button class="btn tonal rip" data-act="go" data-to="#/code/learn" data-testid="cd-course-all">All lessons</button></div></section>' +
      '<h2 class="h3 cs-sec cd-labs-h">Labs</h2><ul class="asheet cd-labs">' +
      lab('#/code/cpp', 'C++', 'C++ lab', 'Write and run C++ with a real compiler (online). Board programs with automatic checks.', 'cd-cpp-link') +
      lab('#/code/8085', '85', '8085 assembly lab', 'Write programs and watch the registers, flags and memory. Board tasks with automatic checks.', 'cd-8085') +
      lab('#/code/html', '&lt;/&gt;', 'HTML lab', 'Write a page and see it at once. For the HTML questions of the board paper.', 'cd-html-link') +
      lab('#/csboard/cs-12-03', 'Q', 'C++ board questions', 'The questions and model answers of the C++ chapter.', 'cd-cppq-link') + '</ul></div>' +
      '<aside class="rail"><section class="card stack"><h2 class="h3">How to learn coding here</h2><ol class="cs-how"><li>Read the idea and the example, line by line.</li><li>Answer the quiz: it shows why each answer is right.</li><li>Write the program in the lab and press Check.</li><li>Then do the board programs of the C++ chapter.</li></ol></section></aside></div></div>'
    );
  }

  S.views.code = {
    title: 'Code',
    tab: 'study',
    isPushed: (ctx) => !!ctx.params[0],
    pageTitle: (ctx) => (ctx.params[0] === 'learn' ? (ctx.params[1] ? 'Lesson' : 'Coding from zero') : ctx.params[0] === 'cpp' ? 'C++ lab' : ctx.params[0] === 'html' ? 'HTML lab' : ctx.params[0] === '8085' ? '8085 lab' : 'Coding'),
    backHash: (cur) => (cur && cur.query && cur.query.lesson && lessonOf(cur.query.lesson) ? '#/code/learn/' + cur.query.lesson : cur && cur.query && cur.query.ex && lessonOf(cur.query.ex) ? '#/code/learn/' + cur.query.ex : cur && cur.params && cur.params[0] === 'learn' && cur.params[1] ? '#/code/learn' : '#/code'),
    render(root, ctx) {
      const w = ctx.params[0];
      const keep = document.activeElement;
      if (keep && /^cd-(src|mem|html|from|cpp|cin)$/.test(keep.id) && !ctx.first) return; // keep the cursor while she types (actions blur first, see grab)
      const q = ctx.query || {};
      if (w === 'cpp' && q.q && ctx.first) { cpp.pick = q.q; cpp.src = STARTER; cpp.cin = ''; cpp.out = null; cpp.check = null; cpp.model = false; }
      if (w === 'cpp' && q.lesson && ctx.first && lessonOf(q.lesson)) { const l = lessonOf(q.lesson); cpp.pick = 'L:' + l.id; cpp.src = l.task.starter; cpp.cin = (l.task.cases[0] || {}).in || ''; cpp.out = null; cpp.check = null; cpp.model = false; }
      if (w === 'cpp' && q.ex && ctx.first && lessonOf(q.ex)) { const l = lessonOf(q.ex); cpp.pick = ''; cpp.src = l.code; cpp.cin = (l.task.cases[0] || {}).in || ''; cpp.out = null; cpp.check = null; cpp.model = false; }
      if (w === '8085' && q.task && ctx.first) { st.task = q.task; st.check = null; st.model = false; st.mem = ''; }
      root.innerHTML = w === 'learn' ? (ctx.params[1] ? lessonHtml(ctx.params[1]) : courseHtml()) : w === '8085' ? html8085() : w === 'html' ? htmlLab() : w === 'cpp' ? cppLab() : indexHtml();
    },
  };

  const blurEditor = () => { const a = document.activeElement; if (a && /^cd-/.test(a.id || '') && a.blur) a.blur(); };
  const grab = () => {
    blurEditor();
    const a = document.getElementById('cd-src'); if (a) st.src8085 = a.value;
    const b = document.getElementById('cd-mem'); if (b) st.mem = b.value;
    const c = document.getElementById('cd-html'); if (c) st.html = c.value;
  };
  ui.actions['cd-run'] = () => {
    grab();
    const asm = SIM.assemble(st.src8085);
    if (!asm.ok) st.run = { ok: false, errors: asm.errors };
    else st.run = SIM.run(st.src8085, parseMem(st.mem));
    st.check = null;
    S.app.refresh(true);
  };
  ui.inputs['cd-from'] = (el) => {
    st.from = el.value;
    const box = document.getElementById('cd-memwin');
    if (box && st.run && st.run.cpu) box.innerHTML = memWindow(st.run.cpu, st.from);
  };
  ui.changes['cd-task'] = (el) => { grab(); st.task = el.value; st.check = null; st.model = false; const t = taskOf(st.task); if (t) { st.mem = ''; } S.app.refresh(true); };
  ui.actions['cd-model'] = () => { grab(); st.model = !st.model; S.app.refresh(true); };
  ui.actions['cd-check'] = () => {
    grab();
    const t = taskOf(st.task);
    if (!t) return;
    const asm = SIM.assemble(st.src8085);
    if (!asm.ok) { st.check = { ok: false, errors: asm.errors }; S.app.refresh(true); return; }
    const rows = t.checks.map((chk) => {
      const mem = {};
      Object.keys(chk.mem || {}).forEach((k) => { mem[parseInt(k, 16)] = chk.mem[k]; });
      const r = SIM.run(st.src8085, mem);
      const before = Object.keys(chk.mem || {}).map((k) => k + 'H: ' + chk.mem[k].map(hex2).join(' ')).join('; ');
      const want = Object.keys(chk.expect).map((k) => k + 'H: ' + chk.expect[k].map(hex2).join(' ')).join('; ');
      let ok = !!r.result.halted;
      const got = Object.keys(chk.expect).map((k) => {
        const at = parseInt(k, 16);
        const gotBytes = chk.expect[k].map((_, j) => r.cpu.mem[at + j]);
        if (gotBytes.some((v, j) => v !== chk.expect[k][j])) ok = false;
        return k + 'H: ' + gotBytes.map(hex2).join(' ');
      }).join('; ');
      return { ok: ok, text: 'Start with ' + before + '. Expected ' + want + (ok ? '.' : '. Your program gave ' + got + (r.result.halted ? '.' : ' and did not stop (HLT missing?).')) };
    });
    st.check = { ok: true, rows: rows, pass: rows.filter((x) => x.ok).length };
    S.app.refresh(true);
  };
  const grabCpp = () => {
    blurEditor();
    const a = document.getElementById('cd-cpp'); if (a) cpp.src = a.value;
    const b = document.getElementById('cd-cin'); if (b) cpp.cin = b.value;
  };
  ui.actions['cl-quiz'] = (el) => {
    const l = lessonOf(el.dataset.l);
    if (!l) return;
    const k = Number(el.dataset.k);
    const v = Number(el.dataset.v);
    (qsel[l.id] = qsel[l.id] || l.quiz.map(() => null))[k] = v;
    const right = v === l.quiz[k].ans;
    S.store.mutate('code', (c) => {
      c.lessons = c.lessons || {};
      const p = c.lessons[l.id] || (c.lessons[l.id] = { quiz: [], task: false });
      p.quiz = p.quiz || [];
      if (right) p.quiz[k] = true;
      p.at = u.today();
    });
    if (!right) setTimeout(() => { qsel[l.id][k] = null; S.app.refresh(true); }, 2600); // she can try again after reading why
    S.app.refresh(true);
  };
  ui.changes['cd-cpp-pick'] = (el) => {
    grabCpp();
    cpp.pick = el.value;
    cpp.out = null; cpp.check = null; cpp.model = false;
    const t = cppTask();
    if (t && t.lesson) { const l = lessonOf(t.lesson); cpp.src = l.task.starter; cpp.cin = (l.task.cases[0] || {}).in || ''; } else if (t) { cpp.src = STARTER; cpp.cin = ''; }
    S.app.refresh(true);
  };
  ui.actions['cd-cpp-model'] = () => { grabCpp(); cpp.model = !cpp.model; S.app.refresh(true); };
  ui.actions['cd-cpp-load'] = () => { const t = cppTask(); if (t) { cpp.src = t.code; cpp.model = false; } S.app.refresh(true); };
  const compile = (code, stdin, signal) => fetch(WANDBOX, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code, compiler: 'gcc-head', stdin: stdin, options: 'warning' }), signal: signal })
    .then((r) => { if (!r.ok) throw new Error('The compiler service answered ' + r.status + '.'); return r.json(); });
  const netFail = (e) => (e && e.name === 'AbortError' ? 'The compiler service took too long. Try again.' : 'Could not reach the online compiler (' + (e && e.message ? e.message : 'network error') + '). Check your connection and try again.');
  const offline = () => navigator.onLine === false;
  ui.actions['cd-cpp-run'] = () => {
    grabCpp();
    if (cpp.busy) return;
    cpp.check = null;
    if (!cpp.src.trim()) { cpp.out = { fail: 'Write a program first.' }; S.app.refresh(true); return; }
    if (offline()) { cpp.out = { fail: 'You are offline. The C++ lab needs internet to compile your program. Try again when you are online.' }; S.app.refresh(true); return; }
    cpp.busy = 'run';
    cpp.out = null;
    S.app.refresh(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    compile(cpp.src, cpp.cin, ctl.signal)
      .then((j) => { cpp.out = { status: String(j.status || '0'), compile: !('program_output' in j) ? String(j.compiler_error || j.compiler_message || 'The compiler gave no output.') : '', out: j.program_output, err: j.program_error }; })
      .catch((e) => { cpp.out = { fail: netFail(e) }; })
      .then(() => { clearTimeout(timer); cpp.busy = false; S.app.refresh(true); });
  };
  // Check: run her program once per test input, one after another, and compare the output with the case rule
  ui.actions['cd-cpp-check'] = () => {
    grabCpp();
    const t = cppTask();
    if (!t || !t.cases || cpp.busy) return;
    cpp.out = null;
    if (offline()) { cpp.check = { fail: 'You are offline. Checking needs internet. Try again when you are online.' }; S.app.refresh(true); return; }
    cpp.busy = 'check';
    cpp.check = null;
    S.app.refresh(true);
    const rows = [];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60000);
    let chain = Promise.resolve(null);
    t.cases.forEach((c) => {
      chain = chain.then((stop) => {
        if (stop) return stop;
        return compile(cpp.src, c.in + '\n', ctl.signal).then((j) => {
          if (!('program_output' in j)) return { compile: String(j.compiler_error || j.compiler_message || 'The compiler gave no output.') };
          rows.push({ in: c.in, has: c.has, no: c.no, got: j.program_output || '', ok: caseOk(j.program_output, c) });
          return null;
        });
      });
    });
    chain.then((stop) => {
      cpp.check = stop || { rows: rows, pass: rows.filter((x) => x.ok).length };
      if (!stop && t.lesson && rows.length && rows.every((x) => x.ok)) {
        S.store.mutate('code', (c) => { c.lessons = c.lessons || {}; const p = c.lessons[t.lesson] || (c.lessons[t.lesson] = { quiz: [], task: false }); p.task = true; p.at = u.today(); });
        ui.toast('Lesson program done. Well written!');
      }
    })
      .catch((e) => { cpp.check = { fail: netFail(e) }; })
      .then(() => { clearTimeout(timer); cpp.busy = false; S.app.refresh(true); });
  };
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'cd-cpp') { cpp.src = e.target.value; return; }
    if (e.target && e.target.id === 'cd-cin') { cpp.cin = e.target.value; return; }
    if (e.target && e.target.id === 'cd-html') {
      st.html = e.target.value;
      const f = document.querySelector('[data-testid="cd-frame"]');
      if (f) f.srcdoc = st.html;
    } else if (e.target && e.target.id === 'cd-src') st.src8085 = e.target.value;
    else if (e.target && e.target.id === 'cd-mem') st.mem = e.target.value;
  });
})((window.SOS = window.SOS || {}));

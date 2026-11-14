/* views/code.js — the Code page (Study > Code): #/code (the labs), #/code/8085 (assembler and CPU) and #/code/html (editor with a live page).
 *   8085 lab: write a program, press Run, see the registers, flags and a memory window. Pick a board task: "Check my program" runs it on the
 *   task's test cases (data/cs items with `checks`, the same ones the tests run on the model program) and says which cases pass.
 *   HTML lab: write a page and see it at once in a sandboxed frame (no scripts run in it).
 *   C++ lab (#/code/cpp): write or load a board program, give it input, press Run. This is the ONE place that uses the network: the code and the
 *   input go to the free online compiler wandbox.org (g++), and the output comes back. Nothing else is sent. Offline it says so.
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
      '<section class="card stack"><label class="field-l" for="cd-src">Program</label><textarea id="cd-src" class="input cd-src" data-testid="cd-src" spellcheck="false" rows="12" autocapitalize="off" autocomplete="off">' + u.esc(st.src8085) + '</textarea>' +
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
      '<div class="cd-split"><section class="card stack"><label class="field-l" for="cd-html">HTML code</label><textarea id="cd-html" class="input cd-src" data-testid="cd-html" spellcheck="false" rows="14" autocapitalize="off" autocomplete="off">' + u.esc(st.html) + '</textarea></section>' +
      '<section class="card stack"><h2 class="h3">Your page</h2><iframe class="cd-frame" title="Preview of your page" sandbox="" data-testid="cd-frame" srcdoc="' + u.esc(st.html) + '"></iframe></section></div></div>'
    );
  }

  /* ---------- C++ (online) ---------- */
  const WANDBOX = 'https://wandbox.org/api/compile.json';
  const cpp = { src: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cout << "Enter a number: ";\n    cin >> n;\n    cout << "Square = " << n * n << endl;\n    return 0;\n}\n', cin: '7', pick: '', busy: false, out: null };
  const cppTasks = () => ((window.CS_C && window.CS_C['cs-12-03']) || []).filter((q) => q.code && q.code.indexOf('#include') >= 0);
  const clip = (t) => (String(t || '').length > 20000 ? String(t).slice(0, 20000) + '\n... (cut)' : String(t || ''));
  function cppOut() {
    const o = cpp.out;
    if (cpp.busy) return '<section class="card"><p class="muted" data-testid="cd-cpp-busy">Compiling and running...</p></section>';
    if (!o) return '<p class="muted small">Press Run. The program is compiled by g++ and run with the input you typed.</p>';
    if (o.fail) return '<div class="banner warn" role="alert" data-testid="cd-cpp-fail">' + u.esc(o.fail) + '</div>';
    return '<section class="card stack" data-testid="cd-cpp-out"><h2 class="h3">' + (o.compile ? 'It did not compile' : o.status === '0' ? 'Output' : 'The program ended with an error (code ' + u.esc(o.status) + ')') + '</h2>' +
      (o.compile ? '<pre class="cs-code" data-testid="cd-cpp-err">' + u.esc(clip(o.compile)) + '</pre>' : '<pre class="cs-code" data-testid="cd-cpp-text">' + u.esc(clip(o.out) || '(no output)') + '</pre>') +
      (o.err ? '<h3 class="sol-h">Error output</h3><pre class="cs-code">' + u.esc(clip(o.err)) + '</pre>' : '') + '</section>';
  }
  function cppLab() {
    loadCh('cs-12-03');
    const ts = cppTasks();
    return (
      '<div class="page cd-page"><header class="page-h"><div><h1 class="h1">C++ lab</h1><p class="muted">Write a C++ program, give it input and run it with a real g++ compiler.</p></div></header>' +
      '<div class="banner" data-testid="cd-cpp-net"><b>Needs internet.</b> When you press Run, your code and input are sent to wandbox.org, a free online compiler. Nothing else is sent. The rest of the app works offline.</div>' +
      '<section class="card stack"><h2 class="h3">Board program (optional)</h2><select class="input" id="cd-cpp-pick" data-change="cd-cpp-pick" aria-label="Board program"><option value="">My own program</option>' +
      ts.map((q) => '<option value="' + u.esc(q.id) + '"' + (q.id === cpp.pick ? ' selected' : '') + '>' + u.esc(q.q.replace(/\s+/g, ' ').slice(0, 70)) + '</option>').join('') + '</select>' +
      '<p class="small muted">Choosing one loads its model program. Edit it, break it, run it.</p></section>' +
      '<section class="card stack"><label class="field-l" for="cd-cpp">Program</label><textarea id="cd-cpp" class="input cd-src" data-testid="cd-cpp" spellcheck="false" rows="16" autocapitalize="off" autocomplete="off">' + u.esc(cpp.src) + '</textarea>' +
      '<label class="field-l" for="cd-cin">Input (what the user types, one line per Enter)</label><textarea id="cd-cin" class="input cd-src" data-testid="cd-cin" spellcheck="false" rows="3" autocapitalize="off">' + u.esc(cpp.cin) + '</textarea>' +
      '<button class="btn primary block rip" data-act="cd-cpp-run" data-testid="cd-cpp-run"' + (cpp.busy ? ' disabled' : '') + '>' + u.icon('play') + 'Run</button></section>' + cppOut() + '</div>'
    );
  }

  /* ---------- index ---------- */
  function indexHtml() {
    const row = (to, icon, t, s, id) => '<li><button class="lrow rip" data-act="go" data-to="' + to + '" data-testid="' + id + '"><span class="ric" data-s="cs">' + u.icon(icon) + '</span><span class="grow"><b class="rt">' + t + '</b><small class="rs">' + s + '</small></span>' + u.icon('chev-r', 'chev') + '</button></li>';
    return (
      '<div class="page"><header class="page-h"><div><h1 class="h1">Code</h1><p class="muted">Learn by doing. The 8085 and HTML labs run in your browser and work without internet. The C++ lab needs internet.</p></div></header>' +
      '<ul class="list">' + row('#/code/8085', 'code', '8085 assembly lab', 'Write programs and watch the registers, flags and memory. Board tasks with automatic checks.', 'cd-8085') +
      row('#/code/html', 'note', 'HTML lab', 'Write a page and see it at once. For the HTML questions of the board paper.', 'cd-html-link') +
      row('#/code/cpp', 'code', 'C++ lab (needs internet)', 'Write a C++ program with classes, files and more, and run it with a real compiler online.', 'cd-cpp-link') + '</ul>' +
      '<section class="card"><h2 class="h3">C++ board questions</h2><p class="small muted">The questions and model answers of the C++ chapter.</p>' +
      '<button class="btn tonal block rip" data-act="go" data-to="#/csboard/cs-12-03">' + u.icon('clipboard') + 'C++ board questions</button></section></div>'
    );
  }

  S.views.code = {
    title: 'Code',
    tab: 'study',
    isPushed: (ctx) => !!ctx.params[0],
    pageTitle: (ctx) => (ctx.params[0] === 'cpp' ? 'C++ lab' : ctx.params[0] === 'html' ? 'HTML lab' : ctx.params[0] === '8085' ? '8085 lab' : 'Code'),
    backHash: () => '#/code',
    render(root, ctx) {
      const w = ctx.params[0];
      const keep = document.activeElement;
      if (keep && /^cd-(src|mem|html|from|cpp|cin)$/.test(keep.id) && !ctx.first) return; // keep the cursor while she types
      root.innerHTML = w === '8085' ? html8085() : w === 'html' ? htmlLab() : w === 'cpp' ? cppLab() : indexHtml();
    },
  };

  const grab = () => {
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
    const a = document.getElementById('cd-cpp'); if (a) cpp.src = a.value;
    const b = document.getElementById('cd-cin'); if (b) cpp.cin = b.value;
  };
  ui.changes['cd-cpp-pick'] = (el) => {
    grabCpp();
    cpp.pick = el.value;
    const q = cppTasks().filter((x) => x.id === cpp.pick)[0];
    if (q) { cpp.src = q.code; cpp.cin = ''; cpp.out = null; }
    S.app.refresh(true);
  };
  ui.actions['cd-cpp-run'] = () => {
    grabCpp();
    if (cpp.busy) return;
    if (!cpp.src.trim()) { cpp.out = { fail: 'Write a program first.' }; S.app.refresh(true); return; }
    if (navigator.onLine === false) { cpp.out = { fail: 'You are offline. The C++ lab needs internet to compile your program. Try again when you are online.' }; S.app.refresh(true); return; }
    cpp.busy = true;
    cpp.out = null;
    S.app.refresh(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    fetch(WANDBOX, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: cpp.src, compiler: 'gcc-head', stdin: cpp.cin, options: 'warning' }), signal: ctl.signal })
      .then((r) => { if (!r.ok) throw new Error('The compiler service answered ' + r.status + '.'); return r.json(); })
      .then((j) => { cpp.out = { status: String(j.status || '0'), compile: !('program_output' in j) ? String(j.compiler_error || j.compiler_message || 'The compiler gave no output.') : '', out: j.program_output, err: j.program_error }; })
      .catch((e) => { cpp.out = { fail: e && e.name === 'AbortError' ? 'The compiler service took too long. Try again.' : 'Could not reach the online compiler (' + (e && e.message ? e.message : 'network error') + '). Check your connection and try again.' }; })
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

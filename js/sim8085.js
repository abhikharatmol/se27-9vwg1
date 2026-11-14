/* sim8085.js — an 8085 assembler and CPU for the Computer Science (HSC) labs. No DOM.
 * It covers the instruction set of the HSC syllabus (data transfer, arithmetic, logic, branching, stack, I/O and machine control).
 *   const asm = SOS.sim8085.assemble(source, origin?)  -> { ok, errors: [{line, msg}], origin, bytes, listing: [{addr, bytes, text}] }
 *   const cpu = SOS.sim8085.create();  cpu.load(bytes, addr);  cpu.pc = addr;  cpu.run(maxSteps)  -> { halted, steps, error }
 *   cpu.mem[], cpu.a b c d e h l sp pc, cpu.f = { s, z, ac, p, cy }, cpu.ports[]
 * Numbers: 2000H or 0FFH is hex (it must start with a digit), 10 is decimal, 1010B is binary, 'A' is a character.
 * Programs start at 0000H unless the source has ORG. Mnemonics follow the Intel 8085 opcode table (checked in tests/sim8085.test.js). */
(function (root) {
  'use strict';
  const REG = { B: 0, C: 1, D: 2, E: 3, H: 4, L: 5, M: 6, A: 7 };
  const RP = { B: 0, D: 1, H: 2, SP: 3 };
  const RPP = { B: 0, D: 1, H: 2, PSW: 3 };

  // mnemonic -> { op: base opcode, k: operand kind }
  //   r (register in bits 0-2), r3 (register in bits 3-5), rr (two registers), rp (pair, bits 4-5), rpp (push/pop pair), rpx (B or D only),
  //   i8 (one byte follows), i16 (two bytes follow), none, rst
  const OPS = {};
  const def = (name, op, k) => { OPS[name] = { op: op, k: k }; };
  def('MOV', 0x40, 'rr'); def('MVI', 0x06, 'r3i8'); def('LXI', 0x01, 'rpi16');
  def('LDA', 0x3A, 'i16'); def('STA', 0x32, 'i16'); def('LHLD', 0x2A, 'i16'); def('SHLD', 0x22, 'i16');
  def('LDAX', 0x0A, 'rpx'); def('STAX', 0x02, 'rpx'); def('XCHG', 0xEB, 'none');
  def('ADD', 0x80, 'r'); def('ADC', 0x88, 'r'); def('SUB', 0x90, 'r'); def('SBB', 0x98, 'r');
  def('ANA', 0xA0, 'r'); def('XRA', 0xA8, 'r'); def('ORA', 0xB0, 'r'); def('CMP', 0xB8, 'r');
  def('ADI', 0xC6, 'i8'); def('ACI', 0xCE, 'i8'); def('SUI', 0xD6, 'i8'); def('SBI', 0xDE, 'i8');
  def('ANI', 0xE6, 'i8'); def('XRI', 0xEE, 'i8'); def('ORI', 0xF6, 'i8'); def('CPI', 0xFE, 'i8');
  def('INR', 0x04, 'r3'); def('DCR', 0x05, 'r3'); def('INX', 0x03, 'rp'); def('DCX', 0x0B, 'rp'); def('DAD', 0x09, 'rp');
  def('DAA', 0x27, 'none'); def('CMA', 0x2F, 'none'); def('STC', 0x37, 'none'); def('CMC', 0x3F, 'none');
  def('RLC', 0x07, 'none'); def('RRC', 0x0F, 'none'); def('RAL', 0x17, 'none'); def('RAR', 0x1F, 'none');
  def('NOP', 0x00, 'none'); def('HLT', 0x76, 'none'); def('EI', 0xFB, 'none'); def('DI', 0xF3, 'none'); def('RIM', 0x20, 'none'); def('SIM', 0x30, 'none');
  def('JMP', 0xC3, 'i16'); def('JNZ', 0xC2, 'i16'); def('JZ', 0xCA, 'i16'); def('JNC', 0xD2, 'i16'); def('JC', 0xDA, 'i16');
  def('JPO', 0xE2, 'i16'); def('JPE', 0xEA, 'i16'); def('JP', 0xF2, 'i16'); def('JM', 0xFA, 'i16');
  def('CALL', 0xCD, 'i16'); def('CNZ', 0xC4, 'i16'); def('CZ', 0xCC, 'i16'); def('CNC', 0xD4, 'i16'); def('CC', 0xDC, 'i16');
  def('CPO', 0xE4, 'i16'); def('CPE', 0xEC, 'i16'); def('CP', 0xF4, 'i16'); def('CM', 0xFC, 'i16');
  def('RET', 0xC9, 'none'); def('RNZ', 0xC0, 'none'); def('RZ', 0xC8, 'none'); def('RNC', 0xD0, 'none'); def('RC', 0xD8, 'none');
  def('RPO', 0xE0, 'none'); def('RPE', 0xE8, 'none'); def('RP', 0xF0, 'none'); def('RM', 0xF8, 'none');
  def('PCHL', 0xE9, 'none'); def('SPHL', 0xF9, 'none'); def('XTHL', 0xE3, 'none');
  def('PUSH', 0xC5, 'rpp'); def('POP', 0xC1, 'rpp'); def('IN', 0xDB, 'i8'); def('OUT', 0xD3, 'i8'); def('RST', 0xC7, 'rst');

  function num(tok, line, errs) {
    let t = String(tok).trim().toUpperCase();
    if (/^'.'$/.test(t)) return t.charCodeAt(1);
    let m;
    if ((m = /^([0-9][0-9A-F]*)H$/.exec(t))) return parseInt(m[1], 16);
    if ((m = /^([01]+)B$/.exec(t))) return parseInt(m[1], 2);
    if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
    return null;
  }

  function assemble(source, origin) {
    const errors = [];
    const lines = String(source).split(/\r?\n/);
    const items = []; // { line, name, args, addr, size, label? }
    const labels = {};
    let addr = origin || 0;
    let startAddr = addr;
    lines.forEach((raw, ix) => {
      const ln = ix + 1;
      let text = raw.replace(/;.*$/, '').trim();
      if (!text) return;
      let m;
      while ((m = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(text))) {
        const lab = m[1].toUpperCase();
        if (labels[lab] !== undefined) errors.push({ line: ln, msg: 'The label ' + lab + ' is used twice.' });
        labels[lab] = addr;
        text = m[2].trim();
      }
      if (!text) return;
      const parts = /^(\S+)\s*(.*)$/.exec(text);
      const name = parts[1].toUpperCase();
      const args = parts[2] ? parts[2].split(',').map((x) => x.trim()) : [];
      if (name === 'ORG') {
        const v = num(args[0] || '', ln, errors);
        if (v === null || v < 0 || v > 0xFFFF) errors.push({ line: ln, msg: 'ORG needs an address, like ORG 2000H.' });
        else if (items.length === 0) { addr = v; startAddr = v; }
        else errors.push({ line: ln, msg: 'ORG can only be the first line.' });
        return;
      }
      if (name === 'END') return;
      if (name === 'DB') {
        const vals = args.map((a) => num(a, ln, errors));
        if (!args.length || vals.some((v) => v === null || v < 0 || v > 255)) { errors.push({ line: ln, msg: 'DB needs byte values, like DB 05H, 0AH.' }); return; }
        items.push({ line: ln, name: 'DB', args: args, addr: addr, size: vals.length, vals: vals, text: text });
        addr += vals.length;
        return;
      }
      const op = OPS[name];
      if (!op) { errors.push({ line: ln, msg: 'I do not know the instruction ' + name + '.' }); return; }
      const size = { none: 1, r: 1, r3: 1, rr: 1, rp: 1, rpp: 1, rpx: 1, rst: 1, i8: 2, r3i8: 2, i16: 3, rpi16: 3 }[op.k];
      items.push({ line: ln, name: name, args: args, addr: addr, size: size, op: op, text: text });
      addr += size;
    });

    const bytes = [];
    const listing = [];
    const want = (it, n) => { if (it.args.length !== n) { errors.push({ line: it.line, msg: it.name + ' needs ' + (n ? n + ' operand(s)' : 'no operand') + '.' }); return false; } return true; };
    const regOf = (it, a, table, what) => {
      const v = table[String(a).toUpperCase()];
      if (v === undefined) { errors.push({ line: it.line, msg: it.name + ': "' + a + '" is not ' + what + '.' }); return null; }
      return v;
    };
    const val = (it, a, bits) => {
      const t = String(a).toUpperCase();
      let v = num(a, it.line, errors);
      if (v === null && labels[t] !== undefined) v = labels[t];
      if (v === null && /^[0-9A-F]+H$/.test(t)) v = parseInt(t.slice(0, -1), 16); // board style C101H, FFH (a label of that name wins)
      if (v === null) { errors.push({ line: it.line, msg: it.name + ': I cannot read "' + a + '" as a number or a label. Hex numbers end with H, like 25FFH.' }); return null; }
      if (v < 0 || v > (bits === 8 ? 0xFF : 0xFFFF)) { errors.push({ line: it.line, msg: it.name + ': ' + a + ' does not fit in ' + bits + ' bits.' }); return null; }
      return v;
    };
    items.forEach((it) => {
      let out = [];
      if (it.name === 'DB') out = it.vals;
      else {
        const k = it.op.k;
        const b = it.op.op;
        if (k === 'none') { if (want(it, 0)) out = [b]; }
        else if (k === 'r') { if (want(it, 1)) { const r = regOf(it, it.args[0], REG, 'a register'); if (r !== null) out = [b | r]; } }
        else if (k === 'r3') { if (want(it, 1)) { const r = regOf(it, it.args[0], REG, 'a register'); if (r !== null) out = [b | (r << 3)]; } }
        else if (k === 'rr') { if (want(it, 2)) { const d = regOf(it, it.args[0], REG, 'a register'); const s = regOf(it, it.args[1], REG, 'a register'); if (d !== null && s !== null) { if (d === 6 && s === 6) errors.push({ line: it.line, msg: 'MOV M,M is not allowed (its code is HLT).' }); else out = [b | (d << 3) | s]; } } }
        else if (k === 'rp') { if (want(it, 1)) { const r = regOf(it, it.args[0], RP, 'a register pair (B, D, H or SP)'); if (r !== null) out = [b | (r << 4)]; } }
        else if (k === 'rpx') { if (want(it, 1)) { const r = regOf(it, it.args[0], { B: 0, D: 1 }, 'B or D'); if (r !== null) out = [b | (r << 4)]; } }
        else if (k === 'rpp') { if (want(it, 1)) { const r = regOf(it, it.args[0], RPP, 'a register pair (B, D, H or PSW)'); if (r !== null) out = [b | (r << 4)]; } }
        else if (k === 'i8') { if (want(it, 1)) { const v = val(it, it.args[0], 8); if (v !== null) out = [b, v]; } }
        else if (k === 'r3i8') { if (want(it, 2)) { const r = regOf(it, it.args[0], REG, 'a register'); const v = val(it, it.args[1], 8); if (r !== null && v !== null) out = [b | (r << 3), v]; } }
        else if (k === 'i16') { if (want(it, 1)) { const v = val(it, it.args[0], 16); if (v !== null) out = [b, v & 0xFF, v >> 8]; } }
        else if (k === 'rpi16') { if (want(it, 2)) { const r = regOf(it, it.args[0], RP, 'a register pair (B, D, H or SP)'); const v = val(it, it.args[1], 16); if (r !== null && v !== null) out = [b | (r << 4), v & 0xFF, v >> 8]; } }
        else if (k === 'rst') { if (want(it, 1)) { const v = num(it.args[0], it.line, errors); if (v === null || v < 0 || v > 7) errors.push({ line: it.line, msg: 'RST needs a number from 0 to 7.' }); else out = [b | (v << 3)]; } }
      }
      if (out.length === it.size) { out.forEach((x) => bytes.push(x)); listing.push({ addr: it.addr, bytes: out, text: it.text, line: it.line }); }
    });
    errors.sort((x, y) => x.line - y.line);
    return { ok: errors.length === 0, errors: errors, origin: startAddr, bytes: bytes, listing: listing, labels: labels };
  }

  const parity = (v) => { let n = 0; for (let i = 0; i < 8; i++) n += (v >> i) & 1; return n % 2 === 0 ? 1 : 0; };

  function create() {
    const cpu = {
      mem: new Uint8Array(65536), ports: new Uint8Array(256),
      a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, sp: 0xFFFF, pc: 0,
      f: { s: 0, z: 0, ac: 0, p: 0, cy: 0 }, halted: false, steps: 0, ie: 0,
    };
    const R = ['b', 'c', 'd', 'e', 'h', 'l', null, 'a'];
    const getR = (i) => (i === 6 ? cpu.mem[(cpu.h << 8) | cpu.l] : cpu[R[i]]);
    const setR = (i, v) => { v &= 0xFF; if (i === 6) cpu.mem[(cpu.h << 8) | cpu.l] = v; else cpu[R[i]] = v; };
    const getRP = (i) => (i === 0 ? (cpu.b << 8) | cpu.c : i === 1 ? (cpu.d << 8) | cpu.e : i === 2 ? (cpu.h << 8) | cpu.l : cpu.sp);
    const setRP = (i, v) => { v &= 0xFFFF; if (i === 0) { cpu.b = v >> 8; cpu.c = v & 255; } else if (i === 1) { cpu.d = v >> 8; cpu.e = v & 255; } else if (i === 2) { cpu.h = v >> 8; cpu.l = v & 255; } else cpu.sp = v; };
    const flagsSZP = (v) => { cpu.f.s = (v & 0x80) ? 1 : 0; cpu.f.z = (v & 0xFF) === 0 ? 1 : 0; cpu.f.p = parity(v & 0xFF); };
    const fetch = () => { const v = cpu.mem[cpu.pc]; cpu.pc = (cpu.pc + 1) & 0xFFFF; return v; };
    const fetch16 = () => { const lo = fetch(); return (fetch() << 8) | lo; };
    const push16 = (v) => { cpu.sp = (cpu.sp - 1) & 0xFFFF; cpu.mem[cpu.sp] = v >> 8; cpu.sp = (cpu.sp - 1) & 0xFFFF; cpu.mem[cpu.sp] = v & 255; };
    const pop16 = () => { const lo = cpu.mem[cpu.sp]; cpu.sp = (cpu.sp + 1) & 0xFFFF; const hi = cpu.mem[cpu.sp]; cpu.sp = (cpu.sp + 1) & 0xFFFF; return (hi << 8) | lo; };
    const add = (v, carry) => { const a = cpu.a; const r = a + v + carry; cpu.f.ac = ((a & 15) + (v & 15) + carry) > 15 ? 1 : 0; cpu.f.cy = r > 255 ? 1 : 0; cpu.a = r & 255; flagsSZP(cpu.a); };
    const sub = (v, borrow, store) => { const a = cpu.a; const r = a - v - borrow; cpu.f.ac = ((a & 15) - (v & 15) - borrow) >= 0 ? 1 : 0; cpu.f.cy = r < 0 ? 1 : 0; const res = r & 255; if (store) cpu.a = res; flagsSZP(res); };
    const logic = (res, ac) => { cpu.a = res & 255; cpu.f.cy = 0; cpu.f.ac = ac; flagsSZP(cpu.a); };
    const cond = (cc) => [!cpu.f.z, !!cpu.f.z, !cpu.f.cy, !!cpu.f.cy, !cpu.f.p, !!cpu.f.p, !cpu.f.s, !!cpu.f.s][cc];
    const flagByte = () => (cpu.f.s << 7) | (cpu.f.z << 6) | (cpu.f.ac << 4) | (cpu.f.p << 2) | 2 | cpu.f.cy;
    const setFlagByte = (v) => { cpu.f.s = (v >> 7) & 1; cpu.f.z = (v >> 6) & 1; cpu.f.ac = (v >> 4) & 1; cpu.f.p = (v >> 2) & 1; cpu.f.cy = v & 1; };

    cpu.load = (bytes, at) => { bytes.forEach((v, i) => { cpu.mem[(at + i) & 0xFFFF] = v; }); };
    cpu.step = () => {
      if (cpu.halted) return false;
      const op = fetch();
      cpu.steps++;
      if (op >= 0x40 && op <= 0x7F) {
        if (op === 0x76) { cpu.halted = true; return true; }
        setR((op >> 3) & 7, getR(op & 7));
        return true;
      }
      if (op >= 0x80 && op <= 0xBF) {
        const v = getR(op & 7);
        switch ((op >> 3) & 7) {
          case 0: add(v, 0); break;
          case 1: add(v, cpu.f.cy); break;
          case 2: sub(v, 0, true); break;
          case 3: sub(v, cpu.f.cy, true); break;
          case 4: logic(cpu.a & v, 1); break;
          case 5: logic(cpu.a ^ v, 0); break;
          case 6: logic(cpu.a | v, 0); break;
          default: sub(v, 0, false);
        }
        return true;
      }
      if ((op & 0xC7) === 0x06) { setR((op >> 3) & 7, fetch()); return true; }                         // MVI
      if ((op & 0xC7) === 0x04) { const r = (op >> 3) & 7; const v = getR(r); const res = (v + 1) & 255; cpu.f.ac = ((v & 15) + 1) > 15 ? 1 : 0; setR(r, res); flagsSZP(res); return true; } // INR
      if ((op & 0xC7) === 0x05) { const r = (op >> 3) & 7; const v = getR(r); const res = (v - 1) & 255; cpu.f.ac = ((v & 15) - 1) >= 0 ? 1 : 0; setR(r, res); flagsSZP(res); return true; } // DCR
      if ((op & 0xCF) === 0x01) { setRP((op >> 4) & 3, fetch16()); return true; }                       // LXI
      if ((op & 0xCF) === 0x03) { const i = (op >> 4) & 3; setRP(i, getRP(i) + 1); return true; }       // INX
      if ((op & 0xCF) === 0x0B) { const i = (op >> 4) & 3; setRP(i, getRP(i) - 1); return true; }       // DCX
      if ((op & 0xCF) === 0x09) { const r = getRP(2) + getRP((op >> 4) & 3); cpu.f.cy = r > 0xFFFF ? 1 : 0; setRP(2, r); return true; } // DAD
      if ((op & 0xCF) === 0xC5) { const i = (op >> 4) & 3; push16(i === 3 ? (cpu.a << 8) | flagByte() : getRP(i)); return true; } // PUSH
      if ((op & 0xCF) === 0xC1) { const i = (op >> 4) & 3; const v = pop16(); if (i === 3) { cpu.a = v >> 8; setFlagByte(v & 255); } else setRP(i, v); return true; } // POP
      if ((op & 0xC7) === 0xC7) { push16(cpu.pc); cpu.pc = op & 0x38; return true; }                    // RST
      if ((op & 0xC7) === 0xC2) { const t = fetch16(); if (cond((op >> 3) & 7)) cpu.pc = t; return true; } // Jcc
      if ((op & 0xC7) === 0xC4) { const t = fetch16(); if (cond((op >> 3) & 7)) { push16(cpu.pc); cpu.pc = t; } return true; } // Ccc
      if ((op & 0xC7) === 0xC0) { if (cond((op >> 3) & 7)) cpu.pc = pop16(); return true; }               // Rcc
      switch (op) {
        case 0x00: break;
        case 0x02: cpu.mem[getRP(0)] = cpu.a; break;
        case 0x12: cpu.mem[getRP(1)] = cpu.a; break;
        case 0x0A: cpu.a = cpu.mem[getRP(0)]; break;
        case 0x1A: cpu.a = cpu.mem[getRP(1)]; break;
        case 0x07: cpu.f.cy = (cpu.a >> 7) & 1; cpu.a = ((cpu.a << 1) | cpu.f.cy) & 255; break;
        case 0x0F: cpu.f.cy = cpu.a & 1; cpu.a = ((cpu.a >> 1) | (cpu.f.cy << 7)) & 255; break;
        case 0x17: { const c = cpu.f.cy; cpu.f.cy = (cpu.a >> 7) & 1; cpu.a = ((cpu.a << 1) | c) & 255; break; }
        case 0x1F: { const c = cpu.f.cy; cpu.f.cy = cpu.a & 1; cpu.a = ((cpu.a >> 1) | (c << 7)) & 255; break; }
        case 0x20: cpu.a = (cpu.ports[255] & 0x80) | (cpu.ie << 3); break;                                 // RIM (serial input bit 7, interrupt enable, masks left as 0)
        case 0x30: break;                                                                                   // SIM (mask / serial output not modelled)
        case 0x22: { const t = fetch16(); cpu.mem[t] = cpu.l; cpu.mem[(t + 1) & 0xFFFF] = cpu.h; break; }
        case 0x2A: { const t = fetch16(); cpu.l = cpu.mem[t]; cpu.h = cpu.mem[(t + 1) & 0xFFFF]; break; }
        case 0x32: cpu.mem[fetch16()] = cpu.a; break;
        case 0x3A: cpu.a = cpu.mem[fetch16()]; break;
        case 0x27: { let a = cpu.a; let cy = cpu.f.cy; let ac = 0; if ((a & 15) > 9 || cpu.f.ac) { ac = ((a & 15) + 6) > 15 ? 1 : 0; a += 6; if (a > 255) { cy = 1; a &= 255; } } if (((a >> 4) & 15) > 9 || cy) { a += 0x60; if (a > 255) { cy = 1; a &= 255; } } cpu.a = a; cpu.f.cy = cy; cpu.f.ac = ac; flagsSZP(a); break; }
        case 0x2F: cpu.a = (~cpu.a) & 255; break;
        case 0x37: cpu.f.cy = 1; break;
        case 0x3F: cpu.f.cy = cpu.f.cy ? 0 : 1; break;
        case 0xC3: cpu.pc = fetch16(); break;
        case 0xC9: cpu.pc = pop16(); break;
        case 0xCD: { const t = fetch16(); push16(cpu.pc); cpu.pc = t; break; }
        case 0xC6: add(fetch(), 0); break;
        case 0xCE: add(fetch(), cpu.f.cy); break;
        case 0xD6: sub(fetch(), 0, true); break;
        case 0xDE: sub(fetch(), cpu.f.cy, true); break;
        case 0xE6: logic(cpu.a & fetch(), 1); break;
        case 0xEE: logic(cpu.a ^ fetch(), 0); break;
        case 0xF6: logic(cpu.a | fetch(), 0); break;
        case 0xFE: sub(fetch(), 0, false); break;
        case 0xDB: cpu.a = cpu.ports[fetch()]; break;
        case 0xD3: cpu.ports[fetch()] = cpu.a; break;
        case 0xE9: cpu.pc = getRP(2); break;
        case 0xF9: cpu.sp = getRP(2); break;
        case 0xEB: { const d = cpu.d; const e = cpu.e; cpu.d = cpu.h; cpu.e = cpu.l; cpu.h = d; cpu.l = e; break; }
        case 0xE3: { const lo = cpu.mem[cpu.sp]; const hi = cpu.mem[(cpu.sp + 1) & 0xFFFF]; cpu.mem[cpu.sp] = cpu.l; cpu.mem[(cpu.sp + 1) & 0xFFFF] = cpu.h; cpu.l = lo; cpu.h = hi; break; }
        case 0xFB: cpu.ie = 1; break;
        case 0xF3: cpu.ie = 0; break;
        default: cpu.halted = true; cpu.error = 'The code ' + op.toString(16).toUpperCase().padStart(2, '0') + 'H is not an 8085 instruction I know.'; return false;
      }
      return true;
    };
    cpu.run = (maxSteps) => {
      const limit = maxSteps || 100000;
      const start = cpu.steps;
      while (!cpu.halted && cpu.steps - start < limit) cpu.step();
      return { halted: cpu.halted, steps: cpu.steps - start, error: cpu.error || (cpu.halted ? '' : 'The program did not stop (no HLT?) after ' + limit + ' steps.') };
    };
    return cpu;
  }

  // Runs a program on a fresh CPU: mem = { addr: [bytes] } is loaded first, then the program at its origin.
  function run(source, mem, maxSteps) {
    const asm = assemble(source);
    if (!asm.ok) return { ok: false, errors: asm.errors };
    const cpu = create();
    Object.keys(mem || {}).forEach((k) => cpu.load(mem[k], parseInt(k, 10)));
    cpu.load(asm.bytes, asm.origin);
    cpu.pc = asm.origin;
    const r = cpu.run(maxSteps);
    return { ok: !r.error || r.halted, cpu: cpu, asm: asm, result: r };
  }

  const api = { assemble: assemble, create: create, run: run, OPS: OPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.SOS = root.SOS || {}; root.SOS.sim8085 = api; }
})(typeof window !== 'undefined' ? window : null);

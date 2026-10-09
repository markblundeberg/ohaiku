// poses.js — the oneko states, drawn with the Haiku 5.5 kit. Each state is a list of frames; a frame draws one
// Haiku into a cell with its feet at (0, 0), in kit units (~300 tall at s = 1).

const OH = { cellU: 400, footU: 360 };      // cell is cellU kit-units square; feet sit footU down from the top

// a sleep bubble from the nose (鼻提灯), r in kit units, k = 0..1 popped
function ohBubble(g, x, y, r, t, pop = 0) {
  if (pop >= 1) return;
  g.save();
  if (pop > 0) {           // the pop: a ring of droplets
    g.strokeStyle = 'rgba(160,210,235,.9)'; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, r0 = r * (1 + pop * .6), r1 = r0 + 14 * (1 - pop);
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke();
    }
    g.restore(); return;
  }
  const grd = g.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r);
  grd.addColorStop(0, 'rgba(255,255,255,.55)'); grd.addColorStop(.7, 'rgba(190,225,245,.35)'); grd.addColorStop(1, 'rgba(120,180,220,.55)');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.strokeStyle = 'rgba(70,120,160,.85)'; g.lineWidth = 3.2; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.ellipse(x - r * .38, y - r * .4, r * .22, r * .13, -.6, 0, 7); g.fill();
  g.restore();
}
function ohZ(g, x, y, t, n = 3) {
  g.save(); g.fillStyle = '#4a2c1c'; g.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const u = ((t * .7 + i / n) % 1);
    g.globalAlpha = Math.sin(Math.PI * u);
    g.font = font(48 + 40 * u, 'Caveat', 700);
    g.fillText('z', x + 50 * u + 12 * Math.sin(u * 6 + i), y - 120 * u);
  }
  g.restore();
}
function ohBang(g, x, y, k = 1) {
  g.save(); g.translate(x, y); g.scale(k, k); g.rotate(.12);
  g.font = font(96, 'Fraunces', 900); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineWidth = 10; g.strokeStyle = '#fffaf3'; g.lineJoin = 'round'; g.strokeText('!', 0, 0);
  g.fillStyle = '#c4283a'; g.fillText('!', 0, 0);
  g.restore();
}


// ---------------------------------------------------------------------------------------------
// The states. fps = playback rate; loop = whether it cycles. f(g, i) draws frame i with feet at (0, 0), s = 1.
// ---------------------------------------------------------------------------------------------
const OH_BPM = 100;
function ohStates(who) {
  const isOpus = typeof who === 'string' && who.startsWith('opus');
  const base = isOpus ? { persona: 'opus', variant: +(who.slice(4) || 0) } : { variant: who };
  const H = (g, pose, x = 0, y = 0) => drawHaiku(g, x, y, 1, { ...base, ...pose });
  const lie = (g, t, o = {}) => {        // asleep on its side; the nose is up near (-118, -128) after the turn
    g.save(); g.translate(110, -40); g.rotate(-Math.PI / 2 + .08);
    H(g, { t, move: 'idle', beat: 0, eyes: o.eyes || 'closed', mouth: o.mouth || 'o', blink: 0 });
    g.restore();
  };
  const S = {};
  S.idle = { fps: 12, loop: true, n: 36, f: (g, i) => H(g, { t: i / 12, move: 'idle', beat: i / 12 * OH_BPM / 60, expr: 'neutral' }) };
  S.cat = { fps: 12, loop: true, n: 24, f: (g, i) => H(g, { t: i / 12, move: 'idle', beat: i / 12 * OH_BPM / 60, expr: 'cat' }) };
  for (const [k, facing] of [['runR', 1], ['runL', -1], ['runF', 0]])
    S[k] = { fps: 12, loop: true, n: 8, f: (g, i) => H(g, { t: i / 12, move: 'march', facing, beat: i * .25, expr: 'grin' }) };
  S.dance = { fps: 13.33, loop: true, n: 32, f: (g, i) => H(g, { t: i / 13.33, move: 'shimmy', beat: i * .125, expr: 'cat' }) };
  S.yawn = { fps: 12, loop: false, n: 18, f: (g, i) => H(g, { t: i / 12, move: 'freeze', freeze: 1, beat: 0, expr: 'neutral', eyes: 'closed', mouth: i < 14 ? 'o' : 'cat' }) };
  S.sleep = { fps: 12, loop: true, n: 36, f: (g, i) => {
    const t = i / 12, br = .5 - .5 * Math.cos(i / 36 * Math.PI * 4);       // two breaths per loop
    const r = 10 + 24 * br; lie(g, t); ohBubble(g, -50, -58 - r, r, t); ohZ(g, -10, -150, i / 36 * 2);
  } };
  S.wake = { fps: 12, loop: false, n: 6, f: (g, i) => { const t = i / 12; lie(g, t, { eyes: i < 2 ? 'closed' : 'wide', mouth: 'o' }); ohBubble(g, -50, -92, 34, t, (i + 1) / 4); } };
  S.alert = { fps: 12, loop: false, n: 6, f: (g, i) => { H(g, { t: i / 12, move: 'freeze', freeze: 0, beat: 0, expr: 'o' }); ohBang(g, 80, -270, ease.outBack ? ease.outBack(clamp(i / 3)) : clamp(i / 3) * 1.1); } };
  S.spawn = { fps: 12, loop: false, n: 20, f: (g, i) => {
    const t = i / 12, bk = clamp(i / 8);
    if (i < 15) drawBloom(g, 0, -70 + 30 * (1 - bk), 1.5 * (i < 10 ? 1 : 1 - (i - 10) / 5), bk, isOpus ? base.variant : who, { t, stem: 60 * bk });
    if (i >= 8) {        // pops up out of the bloom: grows from the flower's heart, lands with a bounce
      const k = clamp((i - 8) / 5);
      g.save(); g.translate(0, -70 * (1 - k)); g.scale(ease.outBack(k), ease.outBack(k));
      H(g, { t, move: 'bounce', beat: (i - 8) * .125, expr: 'joy' }); g.restore();
    }
  } };
  // --- recess: leaping between windows, falling off them, riding the pointer ---
  S.leap = { fps: 12, loop: true, n: 8, f: (g, i) => H(g, { t: i / 12, move: 'freeze', freeze: 1, beat: 0, expr: 'joy' }) };
  S.fall = { fps: 12, loop: true, n: 8, f: (g, i) => {
    H(g, { t: i / 12, move: 'freeze', freeze: i % 4 < 2 ? 0 : 1, beat: 0, expr: 'panic' });
    g.save(); g.strokeStyle = 'rgba(74,44,28,.55)'; g.lineWidth = 5; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) { const x = -70 + k * 46 + (i % 2) * 6; g.beginPath(); g.moveTo(x, -330 + (k % 2) * 16); g.lineTo(x, -390 + (k % 2) * 16); g.stroke(); }
    g.restore();
  } };
  S.surf = { fps: 12, loop: true, n: 16, f: (g, i) => {
    const sw = Math.sin(i / 16 * Math.PI * 2);
    g.save(); g.rotate(.06 * sw);
    ohArrowBoard(g, 0, 0);
    H(g, { t: i / 12, move: 'idle', beat: 0, expr: 'joy', arms: [[56, -6 + 10 * sw, 0], [56, -6 - 10 * sw, 0]] }, 0, -22);
    g.restore();
  } };
  // --- lemmings: floating under a dandelion, dazed after a long fall, blocking, building with the Q.E.D. stamp ---
  S.float = { fps: 12, loop: true, n: 16, f: (g, i) => {
    const sw = Math.sin(i / 16 * Math.PI * 2);
    g.save(); g.rotate(.08 * sw);
    H(g, { t: i / 12, move: 'idle', beat: 0, expr: 'o', arms: [[18, -70, 10], [18, -70, 10]] });
    g.strokeStyle = '#6f9a4f'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, -250); g.lineTo(2, -290); g.stroke();
    drawBloom(g, 2, -306, .8, 1, 9, { t: i / 12 });
    g.restore();
  } };
  S.dizzy = { fps: 12, loop: true, n: 12, f: (g, i) => {
    H(g, { t: i / 12, move: 'freeze', freeze: 2, beat: 0, expr: 'dizzy' });
    for (let k = 0; k < 3; k++) { const a = i / 12 * Math.PI * 2 + k * 2.1; ohStar(g, 60 * Math.cos(a), -290 + 14 * Math.sin(a), 11); }
  } };
  S.block = { fps: 12, loop: true, n: 12, f: (g, i) => H(g, { t: i / 12, move: 'idle', beat: 0, expr: 'determined', arms: [[64, -2 + (i % 6 < 3 ? 2 : -2), 0], [64, -2, 0]] }) };
  S.build = { fps: 13.33, loop: true, n: 16, f: (g, i) => H(g, { t: i / 13.33, move: 'idle', beat: i * .125, prop: 'stamp', book: false, expr: 'determined' }, 0, 0) };
  // --- movie night (after MST3K's silhouette row): seen from behind, in a cinema seat, headphones on ---
  const seat = (g, i, o = {}) => {
    const t = i / 12, bob = o.bob ?? 2.5 * Math.sin(i / 24 * Math.PI * 4), sh = o.shake || 0;
    g.save(); g.translate(sh, bob);
    H(g, { t, move: 'idle', beat: 0, yaw: o.yaw ?? Math.PI, blink: 0 }, 0, 0);
    // headphones over the hood
    const hx = 0, hy = -196;
    g.lineCap = 'round'; g.strokeStyle = '#2b2b33'; g.lineWidth = 11;
    g.beginPath(); g.arc(hx, hy + 6, 82, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    g.strokeStyle = '#55556a'; g.lineWidth = 3.5; g.beginPath(); g.arc(hx, hy + 6, 82, Math.PI * 1.2, Math.PI * 1.5); g.stroke();
    for (const sd of [-1, 1]) {
      g.fillStyle = '#2b2b33'; g.beginPath(); g.roundRect(hx + sd * 84 - 13, hy - 18, 26, 46, 11); g.fill();
      g.fillStyle = '#d97757'; g.beginPath(); g.roundRect(hx + sd * 84 - 6, hy - 10, 12, 30, 6); g.fill();
    }
    if (o.popcorn) {                                   // a striped bucket on the armrest, and a kernel on its way up
      const bx = 74, by = -120;
      g.save(); g.translate(bx, by);
      g.beginPath(); g.moveTo(-26, -40); g.lineTo(26, -40); g.lineTo(18, 20); g.lineTo(-18, 20); g.closePath(); g.fillStyle = '#fffaf3'; g.fill();
      g.save(); g.clip(); g.fillStyle = '#c4283a'; for (let k = -3; k <= 3; k += 2) g.fillRect(k * 9 - 4, -44, 9, 70); g.restore();
      g.strokeStyle = '#4a2c1c'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#fff3cf'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(-20 + k * 8, -44 - (k % 2) * 6, 8, 0, 7); g.fill(); }
      g.restore();
      const u = (i % 24) / 24;
      if (u < .5) { g.fillStyle = '#fff3cf'; g.beginPath(); g.arc(bx - 30 - 60 * u, by - 60 - 120 * Math.sin(Math.PI * u), 7, 0, 7); g.fill(); }
    }
    g.restore();
    // the seat back in front: a dark velvet silhouette
    g.save();
    g.fillStyle = '#2a1416'; g.beginPath(); g.roundRect(-104, -112, 208, 130, 26); g.fill();
    g.fillStyle = '#4a2026'; g.beginPath(); g.roundRect(-92, -104, 184, 18, 9); g.fill();
    g.restore();
  };
  S.watch = { fps: 12, loop: true, n: 24, f: (g, i) => seat(g, i) };
  S.munch = { fps: 12, loop: true, n: 24, f: (g, i) => seat(g, i, { popcorn: true }) };
  S.giggle = { fps: 12, loop: true, n: 12, f: (g, i) => seat(g, i, { bob: -3 + 4 * (i % 2), shake: (i % 2 ? 3 : -3), yaw: Math.PI * .9 }) };
  S.whisper = { fps: 12, loop: false, n: 24, f: (g, i) => seat(g, i, { bob: 0, yaw: Math.PI - .55 * Math.sin(Math.PI * Math.min(1, i / 20)) }) };
  // --- agent work: what the session is doing right now ---
  const beatAt = (i, step = .125) => i * step;
  S.think = { fps: 13.33, loop: true, n: 32, f: (g, i) => {
    H(g, { t: i / 13.33, move: 'idle', beat: beatAt(i), expr: 'neutral', mouth: 'flat', look: [.5, -.6], arms: [null, [-24, -22, 34]] });
    ohThink(g, 70, -280, i / 32);
  } };
  S.bash = { fps: 13.33, loop: true, n: 16, f: (g, i) => H(g, { t: i / 13.33, move: 'march', facing: 0, beat: beatAt(i), prop: 'drum', expr: 'determined' }) };
  S.edit = { fps: 13.33, loop: true, n: 32, f: (g, i) => H(g, { t: i / 13.33, move: 'idle', beat: beatAt(i), prop: 'stamp', expr: 'determined' }, 0, -46) };
  S.read = { fps: 13.33, loop: true, n: 32, f: (g, i) => H(g, { t: i / 13.33, move: 'idle', beat: beatAt(i), prop: 'read', expr: 'neutral', look: [0, .7] }) };
  S.search = { fps: 13.33, loop: true, n: 32, f: (g, i) => H(g, { t: i / 13.33, move: 'idle', beat: beatAt(i), prop: 'search', expr: 'o', yaw: .22 * Math.sin(i / 32 * Math.PI * 2) }) };
  S.agents = { fps: 13.33, loop: true, n: 32, f: (g, i) => H(g, { t: i / 13.33, move: 'bounce', beat: beatAt(i), prop: 'seeds', expr: 'fang' }) };
  S.busy = { fps: 13.33, loop: true, n: 32, f: (g, i) => H(g, { t: i / 13.33, move: 'armpump', beat: beatAt(i), expr: 'determined' }) };
  S.ask = { fps: 13.33, loop: true, n: 16, f: (g, i) => {
    const u = (i % 8) / 8, wv = Math.sin(u * Math.PI * 2);
    H(g, { t: i / 13.33, move: 'idle', beat: beatAt(i), expr: 'o', arms: [null, [44 + 10 * wv, -58, 4]] });
    ohAsk(g, -70, -300, i);
  } };
  S.done = { fps: 13.33, loop: true, n: 16, f: (g, i) => H(g, { t: i / 13.33, move: 'bounce', beat: beatAt(i), expr: 'joy' }) };
  return S;
}
// the pointer as a surfboard (BLISS's "Cursor is now connected"): an XP-ish white arrow lying under the feet,
// its tip at the left end (where the real pointer's tip will be)
function ohArrowBoard(g, x, y) {
  g.save(); g.translate(x, y - 6);
  const P = [[-120, 0], [-40, -26], [-46, -10], [110, -14], [112, 10], [-46, 12], [-40, 28]];
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(0, 26, 110, 10, 0, 0, 7); g.fill();
  g.beginPath(); P.forEach(([a, b], k) => k ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath();
  g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#111'; g.lineJoin = 'round'; g.stroke();
  g.restore();
}
function ohStar(g, x, y, r) {
  g.save(); g.translate(x, y); g.beginPath();
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * .45 : r; g.lineTo(rr * Math.cos(a), rr * Math.sin(a)); }
  g.closePath(); g.fillStyle = '#ffd84a'; g.fill(); g.strokeStyle = '#4a2c1c'; g.lineWidth = 2.5; g.stroke(); g.restore();
}
// a thought cloud with dots that fill in one by one
function ohThink(g, x, y, u) {
  g.save(); g.fillStyle = '#fffaf3'; g.strokeStyle = '#4a2c1c'; g.lineWidth = 4.5;
  for (const [dx, dy, r] of [[-38, 70, 7], [-22, 50, 11]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); g.stroke(); }
  g.beginPath();
  for (const [dx, dy, r] of [[-24, 4, 22], [0, -10, 26], [26, 0, 22], [8, 16, 20], [-12, 16, 18]]) { g.moveTo(x + dx + r, y + dy); g.arc(x + dx, y + dy, r, 0, 7); }
  g.stroke(); g.fill();
  const n = Math.floor(u * 4) % 4;
  g.fillStyle = '#4a2c1c'; for (let i = 0; i < 3; i++) { g.globalAlpha = i < n ? 1 : .2; g.beginPath(); g.arc(x - 18 + i * 18, y + 4, 5.5, 0, 7); g.fill(); }
  g.restore();
}
// a "?" in a speech bubble: the agent wants you
function ohAsk(g, x, y, i) {
  const k = 1 + .06 * Math.sin(i / 16 * Math.PI * 4);
  g.save(); g.translate(x, y); g.scale(k, k);
  g.fillStyle = '#fffaf3'; g.strokeStyle = '#4a2c1c'; g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath(); g.ellipse(0, 0, 44, 38, 0, 0, 7); g.moveTo(14, 34); g.lineTo(34, 62); g.lineTo(30, 28); g.fill(); g.stroke();
  g.fillStyle = '#fffaf3'; g.beginPath(); g.ellipse(0, 0, 41, 35, 0, 0, 7); g.fill();
  g.font = font(64, 'Fraunces', 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2f6fb0'; g.fillText('?', 0, 4);
  g.restore();
}

function testSheet() {
  const s = .5, cell = OH.cellU * s, cols = 6, rows = 2;
  const c = document.createElement('canvas'); c.width = cell * cols; c.height = cell * rows;
  const g = c.getContext('2d'); g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, c.width, c.height);
  const at = (i) => [(i % cols) * cell + cell / 2, Math.floor(i / cols) * cell + OH.footU * s];
  const L = [];
  // A: lying on its side, eyes closed, bubble
  L.push((g, x, y) => { g.save(); g.translate(x + 120 * s, y - 40 * s); g.rotate(-Math.PI / 2 + .08);
    drawHaiku(g, 0, 0, s, { t: 0, variant: 0, move: 'idle', beat: 0, eyes: 'closed', mouth: 'o' }); g.restore(); });
  // B: crouched freeze-2, eyes closed
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 0, move: 'freeze', freeze: 2, beat: 0, expr: 'neutral', eyes: 'closed', mouth: 'cat' }));
  // C: peek behind the problem book, eyes closed
  L.push((g, x, y) => { drawHaiku(g, x, y - 30 * s, s, { t: 0, variant: 0, move: 'peek', propK: .55, beat: 0, eyes: 'closed', mouth: 'o' });
    drawProblemBook(g, x, y, s * .7, { t: 0 }); ohBubble(g, x + 30 * s, y - 120 * s, 22 * s, 0); ohZ(g, x + 60 * s, y - 150 * s, 0); });
  // D: yawn-stretch
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 0, move: 'freeze', freeze: 1, beat: 0, expr: 'neutral', eyes: 'closed', mouth: 'o' }));
  // E: alert
  L.push((g, x, y) => { drawHaiku(g, x, y, s, { t: 0, variant: 0, move: 'freeze', freeze: 0, beat: 0, expr: 'o' }); ohBang(g, x + 70 * s, y - 300 * s, s); });
  // F: run right
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 0, move: 'march', facing: 1, beat: .5, expr: 'grin' }));
  // row 2: idle, shimmy, run left, run front, jump, variant 5 idle
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 0, move: 'idle', beat: 0, expr: 'cat' }));
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 3, move: 'shimmy', beat: .3, expr: 'cat' }));
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 7, move: 'march', facing: -1, beat: 1.5, expr: 'grin' }));
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 2, move: 'march', facing: 0, beat: .5, expr: 'grin' }));
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 5, move: 'jump', beat: 1.3 }));
  L.push((g, x, y) => drawHaiku(g, x, y, s, { t: 0, variant: 0, persona: 'opus', move: 'idle', beat: 0, expr: 'smug' }));
  L.forEach((f, i) => { const [x, y] = at(i); f(g, x, y); });
  g.strokeStyle = 'rgba(0,0,0,.15)'; for (let i = 0; i < cols * rows; i++) { const x = (i % cols) * cell, y = Math.floor(i / cols) * cell; g.strokeRect(x, y, cell, cell); }
  return c;
}

// one strip per state for `who` (a Haiku variant number, or 'opus0'..'opus7'), cells of `px` pixels
function bakeStrips(who, px) {
  const S = ohStates(who), s = px / OH.cellU, out = {}, meta = { cell: px, foot: [px / 2, Math.round(OH.footU * s)], states: {} };
  for (const [name, st] of Object.entries(S)) {
    const c = document.createElement('canvas'); c.width = st.n * px; c.height = px;
    const g = c.getContext('2d');
    for (let i = 0; i < st.n; i++) {
      g.save(); g.beginPath(); g.rect(i * px, 0, px, px); g.clip();
      g.translate(i * px + px / 2, OH.footU * s); g.scale(s, s); st.f(g, i); g.restore();
    }
    out[name] = c.toDataURL('image/png'); meta.states[name] = { n: st.n, fps: st.fps, loop: st.loop };
  }
  return { out, meta };
}

function testSheet2() {
  const s = .5, cell = OH.cellU * s, names = ['think', 'bash', 'edit', 'read', 'search', 'agents', 'busy', 'ask', 'done'];
  const c = document.createElement('canvas'); c.width = cell * names.length; c.height = cell * 2;
  const g = c.getContext('2d'); g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, c.width, c.height);
  [0, 'opus2'].forEach((who, row) => { const S = ohStates(who); names.forEach((n, j) => {
    g.save(); g.translate(j * cell + cell / 2, row * cell + OH.footU * s); g.scale(s, s); S[n].f(g, 5); g.restore();
    g.font = '16px sans-serif'; g.fillStyle = '#555'; g.fillText(n, j * cell + 6, row * cell + 18); }); });
  return c;
}

// the twelve flowers opening (for Bloomcore: one blooms wherever a Haiku lands)
function bakeBlooms(px) {
  const out = {}, n = 12, s = px / 200;
  for (let kind = 0; kind < 12; kind++) {
    const c = document.createElement('canvas'); c.width = n * px; c.height = px;
    const g = c.getContext('2d');
    for (let i = 0; i < n; i++) {
      const k = Math.min(1, i / 8);
      g.save(); g.beginPath(); g.rect(i * px, 0, px, px); g.clip();
      g.translate(i * px + px / 2, px * .92); g.scale(s, s);
      drawBloom(g, 0, -64 - 40 * k, 1, k, kind, { t: i / 12, stem: 40 + 40 * k });
      g.restore();
    }
    out['bloom' + String(kind).padStart(2, '0')] = c.toDataURL('image/png');
  }
  return out;
}

function testSheet5() {
  const s = .5, cell = OH.cellU * s, names = ['float', 'dizzy', 'block', 'build'];
  const c = document.createElement('canvas'); c.width = cell * 4; c.height = cell;
  const g = c.getContext('2d'); g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, c.width, c.height);
  names.forEach((n, j) => { const S = ohStates(j * 2 + 1); g.save(); g.translate(j * cell + cell / 2, OH.footU * s); g.scale(s, s); S[n].f(g, 5); g.restore(); });
  return c;
}
function testSheet4() {
  const s = .5, cell = OH.cellU * s, names = ['watch', 'munch', 'giggle', 'whisper'];
  const c = document.createElement('canvas'); c.width = cell * 4; c.height = cell;
  const g = c.getContext('2d'); g.fillStyle = '#334'; g.fillRect(0, 0, c.width, c.height);
  names.forEach((n, j) => { const S = ohStates(j * 3); g.save(); g.translate(j * cell + cell / 2, OH.footU * s); g.scale(s, s); S[n].f(g, 10); g.restore(); });
  return c;
}
function testSheet3() {
  const s = .5, cell = OH.cellU * s, n = 6;
  const c = document.createElement('canvas'); c.width = cell * n; c.height = cell;
  const g = c.getContext('2d'); g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, c.width, c.height);
  [Math.PI, Math.PI * .85, Math.PI * 1.15].forEach((yaw, j) => {
    g.save(); g.translate(j * cell + cell / 2, OH.footU * s); g.scale(s, s); drawHaiku(g, 0, 0, 1, { t: 0, variant: j * 3, move: 'idle', beat: 0, yaw }); g.restore();
  });
  [Math.PI].forEach((yaw, j) => {
    g.save(); g.translate((j + 3) * cell + cell / 2, OH.footU * s); g.scale(s, s); drawHaiku(g, 0, 0, 1, { t: 0, persona: 'opus', variant: 2, move: 'idle', beat: 0, yaw }); g.restore();
  });
  return c;
}

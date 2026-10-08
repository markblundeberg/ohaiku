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
  const base = who === 'opus' ? { persona: 'opus', variant: 0 } : { variant: who };
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
    if (i < 15) drawBloom(g, 0, -70 + 30 * (1 - bk), 1.5 * (i < 10 ? 1 : 1 - (i - 10) / 5), bk, typeof who === 'number' ? who : 0, { t, stem: 60 * bk });
    if (i >= 8) {        // pops up out of the bloom: grows from the flower's heart, lands with a bounce
      const k = clamp((i - 8) / 5);
      g.save(); g.translate(0, -70 * (1 - k)); g.scale(ease.outBack(k), ease.outBack(k));
      H(g, { t, move: 'bounce', beat: (i - 8) * .125, expr: 'joy' }); g.restore();
    }
  } };
  return S;
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

// one sprite sheet for `who` (a variant number, or 'opus'), cells of `px` pixels; returns { png (dataURL), meta }
function bakeSheet(who, px) {
  const S = ohStates(who), names = Object.keys(S), s = px / OH.cellU;
  const total = names.reduce((a, k) => a + S[k].n, 0), cols = Math.ceil(Math.sqrt(total)), rows = Math.ceil(total / cols);
  const c = document.createElement('canvas'); c.width = cols * px; c.height = rows * px;
  const g = c.getContext('2d'), meta = { cell: px, foot: [px / 2, Math.round(OH.footU * s)], cols, states: {} };
  let k = 0;
  for (const name of names) {
    const st = S[name]; meta.states[name] = { start: k, n: st.n, fps: st.fps, loop: st.loop };
    for (let i = 0; i < st.n; i++, k++) {
      const x = (k % cols) * px, y = Math.floor(k / cols) * px;
      g.save(); g.beginPath(); g.rect(x, y, px, px); g.clip();
      g.translate(x + px / 2, y + OH.footU * s); g.scale(s, s);
      st.f(g, i);
      g.restore();
    }
  }
  return { png: c.toDataURL('image/png'), meta };
}

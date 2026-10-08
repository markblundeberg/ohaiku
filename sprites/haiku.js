// haiku.js — Haiku 5.5, the chibi whirlwind gremlin (owner: character designer).
//
// drawHaiku(g, x, y, s, pose)   origin at the midpoint between the feet, y down; ~300 units tall at s = 1.
//   pose: { t, variant (int seed; 0 = the canonical clay-orange Haiku), persona, expr, move, beat, facing (-1|1),
//           yaw (radians, overrides facing), squash (0..1 extra landing squash), prop, propK, look:[x,y], blink,
//           lineScale, angle (dive direction, radians), freeze (which freeze pose), flowerSeed }
//   move:  'idle' | 'bounce' | 'shimmy' | 'armpump' | 'spin' | 'jump' | 'march' | 'freeze' | 'dive' | 'peek'
//          (beat = beats since the groove started at 100 BPM; bounces land on integers; drawings held on 8ths of a beat)
//   expr:  'neutral' | 'cat' (:3) | 'grin' | 'fang' | 'o' | 'determined' (>:)) | 'joy' | 'laugh' | 'panic' | 'sparkle'
//          | 'dizzy' | 'smug'
//   prop:  'drum' | 'flower' | 'can' | 'seeds' | 'door' | 'bar' (personas pick their own)
//   persona: 'drummer' | 'watering' | 'seeds' | 'battery' | 'demon' | 'robot' | 'progress' | 'sunflower' | 'printer'
//   'peek': origin = the middle of the book's top edge; only what is above y = 0 is drawn. propK 0..1 = how far up.
// drawBloom(g, x, y, s, k, seed [, opts])   one flower opening from bud (k = 0) to full (k = 1, with overshoot);
//   about 100 units across at s = 1. Unique per seed; integer seeds 0..11 are the twelve kinds in order.
//   opts: { t, stem (length, units), lineScale, rot }
// haikuFlower(seed), haikuVariant(v): the specs behind them.  haikuDrumHead(x, y, s, pose) -> [x, y] on screen.
// Pure functions of their arguments; line boil on twos via boilFrame(t).

const HK = {
  line: '#4a2c1c', skin: '#ffe4cc', skinShade: '#f7b89c', skinDeep: '#e9967c', blush: '#f37f74',
  iris: '#cc6c2a', irisDeep: '#6a2810', irisLight: '#f6c066', white: '#fffaf3',
  hair: '#d97757', hairDeep: '#b9573a', hairLine: '#8a3a20', hairLight: '#f2a37c',
  clay: '#d97757', star: '#fff3cf', starShade: '#efc86a', leaf: '#6f9a4f', leafDeep: '#4d7536',
};
const HK_BPM = 100;

// ---------------------------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------------------------
const _hkFrac = x => x - Math.floor(x);
const _hkSmooth = k => k * k * (3 - 2 * k);
// keyframes: keys = [[u, value], ...] sorted by u; values numbers or arrays; eased between keys
function _hkKey(u, keys, e = ease.inOutQ) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, a] = keys[i - 1], [u1, b] = keys[i], k = e((u - u0) / ((u1 - u0) || 1));
      return Array.isArray(a) ? a.map((v, j) => lerp(v, b[j], k)) : lerp(a, b, k);
    }
  }
  return keys[keys.length - 1][1];
}
const _hkRotY = (p, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
const _hkPlace = (pts, bx, by, a, sx = 1, sy = 1) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => { x *= sx; y *= sy; return [bx + x * c - y * s, by + x * s + y * c]; }); };
function _hkLum(h) { const [r, g, b] = hexToRgb(h); return (.299 * r + .587 * g + .114 * b) / 255; }
function _hkDist(a, b) { const A = hexToRgb(a), B = hexToRgb(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); }

// A petal outline: base at (0,0), pointing up (-y). L length, w half-width.
// shape: waist (base width), peak (widest point, 0..1), sh (shoulder, where the tip edge starts), fw (width at shoulder),
// top 'round'|'point', notch (depth, fraction of L), teeth (count) + tdepth, bend (sideways curl).
function _hkPetal(L, w, o = {}) {
  const { waist = .4, peak = .5, sh = .78, fw = .8, top = 'round', notch = 0, teeth = 0, tdepth = .1, bend = 0, n = 6 } = o;
  const hw = s => {
    if (s <= peak) return w * (waist + (1 - waist) * Math.sin(Math.PI / 2 * s / peak));
    const k = (s - peak) / ((sh - peak) || 1);
    return w * lerp(1, fw, (1 - Math.cos(Math.PI * clamp(k))) / 2);
  };
  const Lp = [], Rp = [];
  for (let i = 0; i <= n; i++) { const s = sh * i / n, x = hw(s), bx = bend * L * s * s; Lp.push([bx - x, -L * s]); Rp.push([bx + x, -L * s]); }
  const wT = hw(sh), Ht = L * (1 - sh), T = [], m = teeth ? teeth * 4 : (top === 'point' ? 4 : 8);
  for (let j = 1; j < m; j++) {
    const xn = -1 + 2 * j / m;
    let d = top === 'point' ? Math.pow(1 - Math.abs(xn), .85) : Math.sqrt(Math.max(0, 1 - xn * xn));
    let y = -L * sh - Ht * d;
    if (notch) y += notch * L * Math.pow(Math.max(0, 1 - Math.abs(xn) / .5), 1.6);
    if (teeth) y += tdepth * L * Math.abs(Math.sin(teeth * Math.PI * (xn + 1) / 2));
    T.push([bend * L * Math.pow(-y / L, 2) + xn * wT, y]);
  }
  return [...Lp, ...T, ...Rp.reverse()];
}

// ---------------------------------------------------------------------------------------------
// Flowers: one spec per seed. Integer seeds 0..11 walk the twelve kinds in order (0 = sunflower).
// ---------------------------------------------------------------------------------------------
const HK_KINDS = ['sunflower', 'daisy', 'tulip', 'rose', 'poppy', 'cherry', 'cornflower', 'marigold', 'lotus', 'dandelion', 'cosmos', 'pansy'];
const _hkFlowerCache = new Map();
function haikuFlower(seed = 0) {
  const key = String(seed);
  if (_hkFlowerCache.has(key)) return _hkFlowerCache.get(key);
  const r = rng('hkflower:' + key);
  const isInt = Number.isInteger(seed) && seed >= 0;
  const kind = isInt && seed < HK_KINDS.length ? HK_KINDS[seed] : HK_KINDS[Math.floor(r() * HK_KINDS.length)];
  const pick = a => a[Math.floor(r() * a.length)];
  const jit = (c, a = .12) => mix(c, r() < .5 ? '#fff4dc' : '#7a3a3a', r() * a);
  const F = { kind, seed: key, layers: [], center: null, rot: r() * Math.PI * 2 };
  const P = (o) => ({ waist: .4, peak: .5, sh: .78, fw: .8, top: 'round', ...o });
  // colour triples [main, light (tips), deep (base)]
  const col = (main, light, deep) => ({ c: main, l: light, d: deep });
  switch (kind) {
    case 'sunflower': {
      const c = jit(isInt && seed === 0 ? '#f2b33a' : pick(['#f2b33a', '#f5c445', '#eca02e', '#f0b850', '#e8902c']), .08);
      const n = 14 + Math.floor(r() * 6);
      F.layers.push({ n, L: .56, w: .15, shape: P({ waist: .3, peak: .42, sh: .62, fw: .55, top: 'point' }), col: col(mix(c, '#c46a1c', .2), mix(c, '#ffe7a0', .3), '#b86a1a'), rot: .5 });
      F.layers.push({ n, L: .52, w: .15, shape: P({ waist: .3, peak: .42, sh: .62, fw: .55, top: 'point' }), col: col(c, mix(c, '#fff0b8', .55), mix(c, '#c46a1c', .4)), rot: 0, curl: r.range(-.15, .15) });
      F.center = { r: .42, style: 'seeds', c: pick(['#6b3f1f', '#5a3418', '#7a4a22']), d: '#3a1e0e' };
      F.main = c; break;
    }
    case 'daisy': {
      const c = pick(['#fffaf0', '#fff4f4', '#fbf3e0', '#ffe6ef']), tip = r() < .35 ? pick(['#f29ab8', '#e07a9a', '#c9a0e0']) : null;
      const n = 18 + Math.floor(r() * 8);
      F.layers.push({ n, L: .8, w: .085, shape: P({ waist: .55, peak: .3, sh: .86, fw: .9 }), col: col(c, tip || '#ffffff', mix(c, '#d8c8a8', .5)), rot: 0, curl: r.range(-.12, .12) });
      F.center = { r: .24, style: 'dome', c: pick(['#f2c230', '#f5b52a', '#e9c440']), d: '#c48a18' };
      F.main = tip || c; break;
    }
    case 'tulip': {
      const c = jit(pick(['#e0473c', '#ef7aa0', '#f2c040', '#9a4fa6', '#f08a3a', '#d8343f']), .1);
      F.cup = true;
      F.layers.push({ n: 6, L: .62, w: .3, shape: P({ waist: .5, peak: .55, sh: .72, fw: .78, top: 'point' }), col: col(c, mix(c, '#fff3e0', .4), mix(c, '#4a1a20', .35)), rot: 0 });
      F.layers.push({ n: 3, L: .4, w: .26, shape: P({ waist: .5, peak: .55, sh: .72, fw: .78, top: 'point' }), col: col(mix(c, '#4a1a20', .12), mix(c, '#fff3e0', .3), mix(c, '#4a1a20', .45)), rot: .5 });
      F.center = { r: .16, style: 'stamen', c: '#3a2a2a', d: '#1a1010' };
      F.main = c; break;
    }
    case 'rose': {
      const c = jit(pick(['#d8344a', '#ee8a9a', '#f4a582', '#fbe3c8', '#b8243a', '#f5c0c8']), .08);
      F.layers.push({ n: 5, L: .52, w: .32, shape: P({ waist: .45, peak: .62, sh: .8, fw: .85 }), col: col(c, mix(c, '#fff5ec', .35), mix(c, '#5a1020', .35)), rot: 0 });
      F.layers.push({ n: 5, L: .4, w: .28, shape: P({ waist: .45, peak: .62, sh: .8, fw: .85 }), col: col(mix(c, '#5a1020', .1), mix(c, '#fff5ec', .25), mix(c, '#5a1020', .4)), rot: .5 });
      F.center = { r: .3, style: 'rose', c: mix(c, '#5a1020', .18), d: mix(c, '#3a0a14', .5) };
      F.main = c; break;
    }
    case 'poppy': {
      const c = jit(pick(['#e8452e', '#f06a3a', '#f28a7a', '#e83a3a', '#f4a03a']), .06);
      const n = r() < .5 ? 4 : 5;
      F.layers.push({ n, L: .62, w: n === 4 ? .5 : .42, shape: P({ waist: .35, peak: .66, sh: .82, fw: .85, teeth: 3, tdepth: .04 }), col: col(c, mix(c, '#ffd8b0', .35), mix(c, '#3a0a0a', .3)), rot: 0 });
      F.center = { r: .2, style: 'poppy', c: '#3a2a3a', d: '#120a10' };
      F.main = c; break;
    }
    case 'cherry': {
      const c = pick(['#f8c8d4', '#fbd8e0', '#f4b0c4', '#fde8ec']);
      F.layers.push({ n: 5, L: .5, w: .3, shape: P({ waist: .25, peak: .66, sh: .82, fw: .9, notch: .14 }), col: col(c, '#fff6f8', mix(c, '#d0507a', .45)), rot: 0 });
      F.center = { r: .16, style: 'stamen', c: '#e0607a', d: '#a0304a', stamen: '#f2c230' };
      F.main = c; break;
    }
    case 'cornflower': {
      const c = jit(pick(['#4f7fd0', '#5a8ae0', '#7a6ad8', '#3f6fc0']), .08);
      const n = 8 + Math.floor(r() * 3);
      F.layers.push({ n, L: .6, w: .2, shape: P({ waist: .2, peak: .7, sh: .74, fw: 1.1, teeth: 3, tdepth: .14 }), col: col(c, mix(c, '#d8e8ff', .45), mix(c, '#1a2050', .4)), rot: 0 });
      F.layers.push({ n, L: .32, w: .14, shape: P({ waist: .2, peak: .7, sh: .74, fw: 1.1, teeth: 2, tdepth: .14 }), col: col(mix(c, '#3a2060', .3), mix(c, '#d8e8ff', .2), '#2a1a50'), rot: .5 });
      F.center = { r: .14, style: 'stamen', c: '#3a2a6a', d: '#1a1030', stamen: '#d8c8ff' };
      F.main = c; break;
    }
    case 'marigold': {
      const c = jit(pick(['#f29a1e', '#f6b82a', '#e8701e', '#f4c030']), .06);
      F.layers.push({ n: 14, L: .5, w: .17, shape: P({ waist: .4, peak: .6, sh: .8, fw: 1, teeth: 3, tdepth: .1 }), col: col(mix(c, '#b84a10', .2), mix(c, '#ffe0a0', .3), mix(c, '#8a3010', .4)), rot: 0 });
      F.layers.push({ n: 12, L: .38, w: .17, shape: P({ waist: .4, peak: .6, sh: .8, fw: 1, teeth: 3, tdepth: .1 }), col: col(c, mix(c, '#fff0b0', .4), mix(c, '#8a3010', .3)), rot: .5 });
      F.layers.push({ n: 9, L: .24, w: .15, shape: P({ waist: .4, peak: .6, sh: .8, fw: 1, teeth: 2, tdepth: .1 }), col: col(mix(c, '#fff0b0', .2), '#fff4c0', c), rot: .2 });
      F.center = { r: .1, style: 'none', c: mix(c, '#8a3010', .3), d: '#8a3010' };
      F.main = c; break;
    }
    case 'lotus': {
      const c = pick(['#f4a8c0', '#f8c8d8', '#fbeef0', '#e890b0']);
      F.layers.push({ n: 8, L: .64, w: .22, shape: P({ waist: .35, peak: .5, sh: .62, fw: .6, top: 'point' }), col: col(c, mix(c, '#d04a80', .3), mix(c, '#ffffff', .4)), rot: 0 });
      F.layers.push({ n: 8, L: .48, w: .2, shape: P({ waist: .35, peak: .5, sh: .62, fw: .6, top: 'point' }), col: col(mix(c, '#ffffff', .3), mix(c, '#d04a80', .35), '#ffffff'), rot: .5 });
      F.center = { r: .2, style: 'lotus', c: '#e8d05a', d: '#a89030' };
      F.main = c; break;
    }
    case 'dandelion': {
      F.puff = true;
      F.layers.push({ n: 30, L: .9, w: .05, shape: P({}), col: col('#fffdf6', '#ffffff', '#d8d0c0'), rot: 0 });
      F.center = { r: .14, style: 'dome', c: '#c8b890', d: '#8a7a5a' };
      F.main = '#fffdf6'; break;
    }
    case 'cosmos': {
      const c = jit(pick(['#e0509a', '#f08ac0', '#fbe0ee', '#c83a7a', '#f4a0c8']), .06);
      F.layers.push({ n: 8, L: .62, w: .25, shape: P({ waist: .25, peak: .72, sh: .82, fw: 1, teeth: 3, tdepth: .07 }), col: col(c, mix(c, '#ffffff', .35), mix(c, '#7a1040', .3)), rot: 0, curl: r.range(-.08, .08) });
      F.center = { r: .2, style: 'dome', c: '#f2c230', d: '#c48a18' };
      F.main = c; break;
    }
    case 'pansy': {
      const c = pick(['#7a4ab8', '#5a3a9a', '#b04ab0', '#3a4ab0']), lo = pick(['#f6d040', '#ffffff', '#f4a040']);
      F.layers.push({ n: 5, L: .56, w: .34, shape: P({ waist: .35, peak: .66, sh: .82, fw: .85 }), col: col(c, mix(c, '#ffffff', .25), mix(c, '#1a0a30', .4)), rot: 0, pansy: lo });
      F.center = { r: .1, style: 'pansy', c: '#f6d040', d: '#c49a10' };
      F.main = c; break;
    }
  }
  // hood plan: petals per ring, length beyond the rim, half-width (units at s = 1)
  const HP = { sunflower: [[14, 40, 8.5], [14, 35, 8.5]], daisy: [[18, 44, 5.2]], tulip: [[8, 40, 15], [8, 33, 13]], rose: [[9, 36, 16], [9, 30, 14]],
    poppy: [[7, 40, 19], [7, 31, 15]], cherry: [[10, 33, 13], [10, 26, 10]], cornflower: [[12, 40, 10], [12, 30, 8]], marigold: [[15, 34, 9], [15, 28, 8]],
    lotus: [[12, 44, 10], [12, 34, 9]], dandelion: [], cosmos: [[11, 42, 13], [11, 30, 10]], pansy: [[10, 36, 16], [10, 29, 13]] };
  F.hood = (HP[kind] || []).map(([n, L, w], i) => ({ n, L: L * r.range(.93, 1.08), w }));
  _hkFlowerCache.set(key, F);
  return F;
}

// Fill + ink one petal, with a gradient from base (deep) to tip (light).
function _hkPetalPaint(K, name, pts, b, tip, C, lw = 2, inkCol = null, vein = true) {
  const g = K.g;
  const gr = g.createLinearGradient(b[0], b[1], tip[0], tip[1]);
  gr.addColorStop(0, C.d); gr.addColorStop(.45, C.c); gr.addColorStop(1, C.l);
  K.fill(pts, gr, { tex: .14 });
  if (lw) K.loop(name, pts, lw, inkCol ? { color: inkCol } : {});
  if (vein && lw) K.ink(name + 'v', [[lerp(b[0], tip[0], .2), lerp(b[1], tip[1], .2)], [lerp(b[0], tip[0], .6), lerp(b[1], tip[1], .6)]], lw * .55, { alpha: .35 });
}

function _hkCenter(K, F, R, o, name = 'c') {
  const g = K.g, C = F.center; if (!C) return;
  const cr = C.r * R * (.4 + .6 * o);
  if (cr < .5) return;
  if (C.style === 'rose') {
    // a cupped heart with a spiral
    const pts = crSpline([[-cr, 0], [-cr * .7, -cr * .8], [0, -cr * 1.05], [cr * .8, -cr * .7], [cr, 0], [cr * .6, cr * .8], [0, cr], [-cr * .7, cr * .7]], true, 5);
    K.shape(name + 'rc', pts, C.c, { tex: .15, lw: 1.8, shade: gg => { gg.fillStyle = C.d; gg.globalAlpha = .45; gg.beginPath(); gg.ellipse(cr * .2, cr * .3, cr * .8, cr * .6, 0, 0, 7); gg.fill(); } });
    const sp = []; for (let i = 0; i <= 26; i++) { const a = i * .55, rr = cr * .85 * (1 - i / 30); sp.push([Math.cos(a) * rr, Math.sin(a) * rr * .9]); }
    K.ink(name + 'sp', sp.reverse(), 1.6, { alpha: .85 });
    return;
  }
  if (C.style === 'none') { K.ell(0, 0, cr, cr, C.c); return; }
  const gr = g.createRadialGradient(-cr * .3, -cr * .3, cr * .1, 0, 0, cr);
  gr.addColorStop(0, mix(C.c, '#ffffff', C.style === 'seeds' ? .12 : .35)); gr.addColorStop(1, C.d);
  const disc = polyCircle(0, 0, cr, cr, 22);
  K.shape(name + 'cd', disc, gr, { tex: .25, lw: 1.8 });
  const px = cr * K.s;
  if (C.style === 'seeds' && px > 6) {
    // phyllotaxis dots
    const N = Math.min(80, Math.round(px * 2.2)), ga = 2.39996;
    g.save(); g.fillStyle = mix(C.d, '#000000', .2); g.globalAlpha = .6;
    for (let i = 4; i < N; i++) { const rr = cr * .92 * Math.sqrt(i / N), a = i * ga; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, cr * .045 + .4 / K.s, 0, 7); g.fill(); }
    g.globalAlpha = .35; g.fillStyle = '#e8b050';
    for (let i = 4; i < N; i += 3) { const rr = cr * .92 * Math.sqrt(i / N), a = i * ga + .2; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, cr * .03, 0, 7); g.fill(); }
    g.restore();
  } else if (C.style === 'dome' && px > 5) {
    g.save(); g.fillStyle = C.d; g.globalAlpha = .45;
    for (let i = 0; i < 14; i++) { const rr = cr * .7 * Math.sqrt((i + .5) / 14), a = i * 2.4; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, cr * .09, 0, 7); g.fill(); }
    g.restore();
  } else if (C.style === 'stamen' || C.style === 'poppy') {
    const n = C.style === 'poppy' ? 10 : 9, st = C.stamen || '#2a1a1a';
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + .3, L1 = cr * (C.style === 'poppy' ? 1.25 : 1.9);
      if (C.style !== 'poppy') K.ink(name + 'st' + i, [[Math.cos(a) * cr * .5, Math.sin(a) * cr * .5], [Math.cos(a) * L1, Math.sin(a) * L1]], 1.1, { color: mix(st, '#4a2c1c', .5), alpha: .8 });
      K.ell(Math.cos(a) * L1, Math.sin(a) * L1, cr * .2 + .5 / K.s, cr * .2 + .5 / K.s, C.style === 'poppy' ? '#2a1a2a' : st);
    }
    if (C.style === 'poppy') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; K.ink(name + 'pr' + i, [[Math.cos(a) * cr * .7, Math.sin(a) * cr * .7], [-Math.cos(a) * cr * .7, -Math.sin(a) * cr * .7]], 1, { color: '#8a9a6a', alpha: .7 }); } }
  } else if (C.style === 'lotus') {
    g.save(); g.fillStyle = C.d; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * cr * .5, Math.sin(a) * cr * .5, cr * .14, 0, 7); g.fill(); } g.restore();
  } else if (C.style === 'pansy') {
    K.ell(0, cr * .3, cr * .5, cr * .4, '#2a1a10');
  }
}

// drawBloom: one flower, bud (k = 0) to full (k = 1, with a little overshoot past ~.75).
function drawBloom(g, x, y, s = 1, k = 1, seed = 0, opts = {}) {
  const F = haikuFlower(seed), t = opts.t || 0, R = 50;
  const kk = clamp(k);
  if (s <= 0) return;
  // two phases: the bud swells (k 0..0.35), then pops open with an overshoot (~1.1 near k = .75)
  const kb = clamp(kk / .35), ko = clamp((kk - .35) / .65);
  const o = ko <= 0 ? .06 * kb : ease.outBack(ko, 1.9);
  const K = charKit(g, t, s, { line: HK.line, seed: 'bl' + F.seed, lineScale: opts.lineScale });
  g.save(); g.translate(x, y); g.scale(s, s); if (opts.rot) g.rotate(opts.rot);
  const sc = ko <= 0 ? lerp(.38, .72, ease.outQ(kb)) : lerp(.72, 1, clamp(o * 1.15));
  g.scale(sc, sc);
  if (opts.stem) {
    const L = opts.stem / sc;
    K.ink('stem', bez([0, L], [3, L * .6], [-3, L * .3], [0, 0], 10), 5, { color: HK.leafDeep, taper: false });
    K.ink('stemc', bez([0, L], [3, L * .6], [-3, L * .3], [0, 0], 10), 2.6, { color: HK.leaf, taper: false, wobble: .2 });
    const lf = _hkPlace(_hkPetal(L * .32, L * .09, { waist: .1, peak: .5, sh: .7, fw: .5, top: 'point', bend: .25 }), 1, L * .62, -.9);
    K.shape('stemlf', lf, HK.leaf, { tex: .15, lw: 1.8 });
  }
  // sepals (green): behind the open flower, cupping the bud in front while it is closed
  const sepals = (front) => {
    const sepA = 1 - clamp(o * 1.3);
    if (F.puff || F.cup) return;
    if (front !== (o < .25)) return;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * lerp(.5, 1.7, 1 - sepA), L = R * (front ? .42 : .34) * lerp(1, .6, 1 - sepA);
      const pts = _hkPlace(_hkPetal(L, R * .11, { waist: .5, peak: .4, sh: .6, fw: .5, top: 'point', bend: (i - 1) * -.25 }), (i - 1) * R * .05, R * .14, a + Math.PI / 2);
      K.shape('sep' + i, pts, HK.leaf, { tex: .15, lw: 1.6, shade: gg => { gg.fillStyle = HK.leafDeep; gg.globalAlpha = .4; P2(gg, chTr(pts, 3, 2)); gg.fill(); } });
    }
  };
  sepals(false);
  if (F.cup) _hkCupBloom(K, F, R, o);
  else if (F.puff) _hkPuffBloom(K, F, R, o);
  else {
    F.layers.forEach((Ly, li) => {
      const lo = clamp(o - li * .08, 0, 1.2);
      for (let i = 0; i < Ly.n; i++) {
        const target = F.rot + (i + (Ly.rot || 0)) / Ly.n * Math.PI * 2;
        // bud: petals gathered pointing up, fanned a little; unfold along the shorter way round
        let d = target - (-Math.PI / 2); d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        const budA = -Math.PI / 2 + d * .12;
        const a = lerp(budA, -Math.PI / 2 + d, Math.min(1, lo)) + (lo > 1 ? 0 : 0);
        const L = Ly.L * R * lerp(.75, 1, Math.min(1, lo)) * (lo > 1 ? 1 + (lo - 1) * .4 : 1), w = Ly.w * R * lerp(.55, 1, Math.min(1, lo));
        const r0 = F.center.r * R * .7 * Math.min(1, lo);
        const bx = Math.cos(a) * r0, by = Math.sin(a) * r0;
        const pts = _hkPlace(_hkPetal(L, w, { ...Ly.shape, bend: (Ly.curl || 0) }), bx, by, a + Math.PI / 2);
        const tip = [bx + Math.cos(a) * L, by + Math.sin(a) * L];
        _hkPetalPaint(K, 'p' + li + '_' + i, pts, [bx, by], tip, Ly.col, 1.9, null, Ly.n < 12);
        if (Ly.pansy && Math.sin(a) > -.2 && lo > .4) {
          // pansy: the lower petals are two-tone with dark whiskers
          g.save(); P2(g, K.smooth(pts, true)); g.clip(); g.globalAlpha = clamp((lo - .4) * 2); g.fillStyle = Ly.pansy;
          g.beginPath(); g.arc(tip[0], tip[1], L * .75, 0, 7); g.fill(); g.restore();
          for (let j = -1; j <= 1; j++) K.ink('pw' + i + j, [[bx + Math.cos(a + j * .25) * L * .1, by + Math.sin(a + j * .25) * L * .1], [bx + Math.cos(a + j * .2) * L * .45, by + Math.sin(a + j * .2) * L * .45]], 1.2, { alpha: .8 });
        }
      }
    });
    _hkCenter(K, F, R, clamp(o));
  }
  sepals(true);
  g.restore();
}
function _hkCupBloom(K, F, R, o) {
  // tulip: side view. back petals, then three front petals that lean outward as it opens
  const Ly = F.layers[0], C = Ly.col, g = K.g, op = clamp(o, 0, 1.2);
  const L = Ly.L * R * 1.25, w = Ly.w * R * 1.05;
  const base = [0, R * .45];
  K.ink('tstem', [[0, R * .45], [0, R * .85]], 5, { color: HK.leafDeep, taper: false });
  for (const [i, lean, sc] of [[0, -.32, .9], [1, .32, .9], [2, -.68, .95], [3, .68, .95], [4, 0, 1]]) {
    const a = lean * op * (i < 2 ? .9 : .75) + (i < 2 ? lean * .2 : 0);
    const pts = _hkPlace(_hkPetal(L * sc, w * (i < 2 ? .8 : 1), { ...Ly.shape, waist: .35 }), base[0] + lean * 4, base[1], a);
    const tip = [base[0] + Math.sin(a) * L, base[1] - Math.cos(a) * L];
    const cc = i < 2 ? { c: mix(C.c, '#3a1020', .22), l: mix(C.l, '#3a1020', .15), d: mix(C.d, '#3a1020', .2) } : C;
    _hkPetalPaint(K, 'tu' + i, pts, base, tip, cc, 2.1, null, i >= 2);
  }
}
function _hkPuffBloom(K, F, R, o) {
  const g = K.g, n = F.layers[0].n, op = clamp(o, 0, 1.15), Rr = R * .9 * op;
  if (Rr < 1) { K.ell(0, 0, R * .2, R * .26, HK.leaf); return; }
  g.save(); g.globalAlpha = .55; g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(0, 0, Rr * .95, 0, 7); g.fill(); g.restore();
  const r = rng('puff' + F.seed);
  for (let i = 0; i < n; i++) {
    const a = F.rot + i / n * Math.PI * 2 + (r() - .5) * .2, L = Rr * (.85 + r() * .2);
    const tx = Math.cos(a) * L, ty = Math.sin(a) * L;
    K.ink('pf' + i, [[Math.cos(a) * 3, Math.sin(a) * 3], [tx, ty]], 1, { color: '#b8ab90', alpha: .9 });
    for (let j = -2; j <= 2; j++) { const b = a + j * .32; K.ink('pt' + i + j, [[tx, ty], [tx + Math.cos(b) * Rr * .16, ty + Math.sin(b) * Rr * .16]], .8, { color: '#9a8d78', alpha: .75 }); }
  }
  g.save(); g.globalAlpha = .4; K.loop('pfo', polyCircle(0, 0, Rr * 1.02, Rr * 1.02, 26), 1.2); g.restore();
  _hkCenter(K, F, R, clamp(o));
}

// ---------------------------------------------------------------------------------------------
// Variants: hood flower, hoodie colour, hair, boots, tights and small extras, grown from one seed.
// ---------------------------------------------------------------------------------------------
const HK_HOODIES = ['#d97757', '#d9a648', '#93a77f', '#5f8f88', '#8a6380', '#d88c8c', '#eadcbc', '#8fb2c2', '#a991b8', '#7f9450',
  '#f0aa82', '#b0603f', '#e8cf84', '#6b86a6', '#e8846a', '#5a7f60', '#b5485a', '#d6bf98'];
const HK_HAIRS = ['#d97757', '#c4603a', '#e08a4a', '#a8502e', '#e8a86a', '#8a4a2a', '#d06a50'];
const HK_BOOTS = ['#8a5232', '#b9573a', '#4f7d78', '#d6a443', '#6d4a5e', '#a8553a', '#5a3a2a', '#c4383a'];
const HK_TIGHTS = ['#5c3c30', '#4a3a48', '#3f5450', '#6a4030', '#fffaf0'];
const _hkVarCache = new Map();
function haikuVariant(v = 0) {
  v = v | 0;
  if (_hkVarCache.has(v)) return _hkVarCache.get(v);
  const r = rng('haiku-variant:' + v), flower = haikuFlower(v);
  let hood = HK.clay;
  if (v !== 0) {
    let i = Math.floor(r() * HK_HOODIES.length);
    for (let tries = 0; tries < HK_HOODIES.length; tries++, i++) {
      const c = HK_HOODIES[i % HK_HOODIES.length];
      if (_hkDist(c, flower.main) > 95 && !(v === 1 && c === HK.clay)) { hood = c; break; }
    }
  }
  const V = {
    v, flower, hood,
    hoodShade: mix(hood, '#5a2e3a', .3), hoodDeep: mix(hood, '#3a1e20', .5), hoodLight: mix(hood, '#fff6e8', .35),
    hair: v === 0 ? HK.hair : HK_HAIRS[Math.floor(r() * HK_HAIRS.length)],
    boots: v === 0 ? '#8a5232' : HK_BOOTS[Math.floor(r() * HK_BOOTS.length)],
    tights: v === 0 ? '#5c3c30' : HK_TIGHTS[Math.floor(r() * HK_TIGHTS.length)],
    stripes: v !== 0 && r() < .3,
    sprout: v === 0 ? false : r() < .4,
    leafClip: v !== 0 && r() < .22,
    freckles: v !== 0 && r() < .3,
    bandaid: v !== 0 && r() < .22 ? (r() < .5 ? 'cheek' : 'knee') : null,
    star: v === 0,
    patch: v === 0 ? 'star' : r.pick(['none', 'none', 'flower', 'heart', 'star', 'none']),
    eyes: v === 0 ? 0 : r() * .5,
    fang: r() < .5 ? 1 : -1,
    side: r() < .5 ? 1 : -1,
  };
  V.hairDeep = mix(V.hair, '#5a2010', .3); V.hairLine = mix(V.hair, '#4a1a0a', .5);
  V.bootsDeep = mix(V.boots, '#2a1410', .4);
  V.tightsDeep = mix(V.tights, '#1a0a0a', .35);
  V.hoodTrim = _hkLum(hood) > .7 ? mix(hood, '#7a5040', .35) : mix(hood, '#fff4e0', .55);
  _hkVarCache.set(v, V);
  return V;
}

// Persona costumes: each overrides a little of the variant and brings a prop.
const HK_PERSONAS = {
  drummer: { prop: 'drum', hat: 'shako', move: 'march' },
  watering: { prop: 'can', boots: '#e8b83a', move: 'bounce' },
  gardener: { prop: 'can', boots: '#e8b83a', move: 'bounce' },
  seeds: { prop: 'seeds', move: 'bounce', expr: 'fang' },
  battery: { costume: 'battery', move: 'bounce', expr: 'grin' },
  demon: { prop: 'door', horns: true, tail: true, expr: 'fang', move: 'shimmy' },
  robot: { robot: true, move: 'armpump', expr: 'grin' },
  progress: { prop: 'bar', expr: 'determined', move: 'idle' },
  sunflower: { costume: 'sunflower', flower: 0, move: 'shimmy', expr: 'cat' },
  printer: { hat: 'printer', move: 'bounce', expr: 'o' },
};

// ---------------------------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------------------------
const HK_EXPR = {
  neutral: { eyes: 'open', mouth: 'smile', brow: 0, blush: .5 },
  cat: { eyes: 'open', mouth: 'cat', brow: .1, blush: .7 },
  grin: { eyes: 'open', mouth: 'huge', brow: .5, blush: .7 },
  fang: { eyes: 'smug', mouth: 'fang', brow: -.2, browTilt: -.6, blush: .55 },
  o: { eyes: 'wide', mouth: 'o', brow: .8, blush: .45 },
  determined: { eyes: 'determined', mouth: 'evil', brow: -.4, browTilt: -1, blush: .5 },
  joy: { eyes: 'happy', mouth: 'huge', brow: .5, blush: .85 },
  laugh: { eyes: 'laugh', mouth: 'huge', brow: .4, blush: .85 },
  panic: { eyes: 'panic', mouth: 'wavy', brow: .9, browTilt: .8, blush: .3, sweat: true },
  sparkle: { eyes: 'sparkle', mouth: 'huge', brow: .6, blush: .8 },
  dizzy: { eyes: 'dizzy', mouth: 'wavy', brow: .3, blush: .5 },
  smug: { eyes: 'smug', mouth: 'cat', brow: -.1, browTilt: -.4, blush: .6 },
};

// ---------------------------------------------------------------------------------------------
// Moves: each returns a rig description for the beat (drawings held on 8ths of a beat).
//   arms: paw position relative to the shoulder, [out, down, fwd] (out = away from the body)
//   feet: [x, y, z] in root coords (y up negative; the ankle; ground is y = 0)
// ---------------------------------------------------------------------------------------------
const HK_SHOULDER = [34, -125], HK_HIP = [12, -50], HK_NECK = -138, HK_HEADC = 52;
function _hkRest() {
  return { hop: 0, sy: 1, sway: 0, tilt: 0, headTilt: 0, headDx: 0, headDy: 0, yaw: 0, rot: 0,
    arms: [[9, 48, 6], [9, 48, 6]], feet: [[-15, -10, 0], [15, -10, 0]], expr: null, fx: [] };
}
function _hkMove(P, V, b, t) {
  const M = _hkRest(), move = P.move || 'idle', f = P.facing || 0;
  const u = _hkFrac(b), n = Math.floor(b);
  switch (move) {
    case 'idle': {
      const br = Math.sin(b * Math.PI / 2);
      M.sy = 1 + .012 * br; M.headTilt = .035 * Math.sin(b * Math.PI / 4 + V.v);
      M.arms = [[9 + br, 48, 6], [9 - br, 48, 6]];
      break;
    }
    case 'bounce': {
      // contact squash on the beat, pop up off the beat; paws swing up on alternate beats
      M.hop = _hkKey(u, [[0, 0], [.18, 0], [.5, 16], [.82, 3], [1, 0]]);
      M.sy = _hkKey(u, [[0, .84], [.18, 1.07], [.5, 1.02], [.85, 1], [1, .9]]);
      const L = n % 2 === 0;
      // alternate: one paw flung up and out on the beat, the other down and out; they swap through the hop
      const up = [52, -40, 6], dn = [30, 30, 6];
      const k = _hkKey(u, [[0, 1], [.25, .85], [.62, .15], [1, 0]]);
      M.arms = L ? [_hkLerpA(dn, up, k), _hkLerpA(up, dn, k)] : [_hkLerpA(up, dn, k), _hkLerpA(dn, up, k)];
      M.headDy = _hkKey(u, [[0, 6], [.18, -3], [.5, 0], [1, 4]]);
      M.headTilt = (L ? 1 : -1) * .1 * _hkKey(u, [[0, 1], [.5, .3], [1, 0]]);
      M.feet = [[-15, -10 - M.hop * .15, 0], [15, -10 - M.hop * .15, 0]];
      break;
    }
    case 'shimmy': {
      // the awkward Celery-Man dance: bent arms, paws pumping in turn, hips popping side to side on every beat
      const side = n % 2 ? 1 : -1;
      const pop = _hkKey(u, [[0, 1], [.25, .9], [.75, .2], [1, -1]], ease.inOutC);
      M.sway = side * 15 * pop; M.tilt = -side * .12 * pop;
      M.headTilt = side * .14 * pop; M.headDx = -side * 4 * pop;
      M.sy = _hkKey(u, [[0, .93], [.2, 1.02], [1, .96]]);
      const a = _hkKey(u, [[0, 1], [.5, -1], [1, 1]]) * side, dx = -side * 22 * pop;
      M.arms = [[10 - dx, 8 - 12 * a, 22], [10 + dx, 8 + 12 * a, 22]];
      M.armBend = 1;
      M.feet = [[-16 + (side < 0 ? 0 : 3), -10, 0], [16 + (side > 0 ? 0 : -3), -10 - (side > 0 ? 0 : 3) * pop, 0]];
      break;
    }
    case 'armpump': {
      const which = Math.floor(b / 4) % 2, up = _hkKey(u, [[0, 1], [.15, 1.05], [.45, .9], [.75, 0], [1, .6]]);
      const pump = _hkLerpA([30, 2, 16], [54, -56, 2], up);
      const hip = [16, 28, -6];
      M.arms = which ? [hip, pump] : [pump, hip];
      M.hipArm = which ? 0 : 1;
      M.hop = _hkKey(u, [[0, 0], [.1, 9], [.35, 4], [.6, 0], [1, 0]]);
      M.sy = _hkKey(u, [[0, 1.08], [.3, 1.02], [.7, .94], [1, 1.04]]);
      M.tilt = (which ? 1 : -1) * .07 * up;
      M.headTilt = (which ? -1 : 1) * .08 * up;
      M.feet = [[-16, -10 - M.hop * .3, 0], [16, -10 - M.hop * .3, 0]];
      if (u < .25) M.fx.push('pump' + (which ? 1 : 0));
      break;
    }
    case 'spin': {
      const per = P.spinBeats || 1, k = Math.floor(_hkFrac(b / per) * 6);
      M.yaw = (f < 0 ? -1 : 1) * [0, 50, 130, 180, 230, 310][k] * Math.PI / 180;
      M.arms = [[56, -8, 0], [56, -8, 0]];
      M.feet = [[-6, -24, 6], [12, -10, 0]];
      M.hop = 5; M.sy = 1.04;
      M.fx.push('spin');
      break;
    }
    case 'jump': {
      // two-beat cycle: land on the downbeat, crouch, launch off the half, hang, land
      const v = _hkFrac(b / 2) * 2;
      if (v < .55) {
        const c = _hkKey(v, [[0, 1], [.15, .6], [.55, .85]]);
        M.sy = 1 - .2 * c; M.hop = 0; M.headDy = 8 * c;
        M.arms = [_hkLerpA([14, 40, 4], [40, 18, -22], c), _hkLerpA([14, 40, 4], [40, 18, -22], c)];
        M.feet = [[-19, -10, 0], [19, -10, 0]];
      } else {
        const p = (v - .55) / 1.45, h = 4 * p * (1 - p);
        M.hop = 120 * h; M.sy = p < .18 ? 1.18 : p > .85 ? 1.12 : 1.02;
        const tuck = clamp(h * 1.6);
        M.feet = [[-15, -10 - 26 * tuck, 8 * tuck], [15, -10 - 22 * tuck, 6 * tuck]];
        M.arms = [_hkLerpA([20, 30, 0], [46, -56, 4], clamp(p * 4)), _hkLerpA([20, 30, 0], [46, -56, 4], clamp(p * 4))];
        M.headDy = -4 * tuck;
        M.expr = 'joy';
      }
      break;
    }
    case 'march': {
      const L = n % 2 === 0, lift = Math.sin(Math.PI * u), up = 28 * lift;
      const fA = [-15, -10 - up, 16 * lift], fB = [15, -10, 0];
      M.feet = L ? [fA, fB] : [[-15, -10, 0], [15, -10 - up, 16 * lift]];
      M.hop = 4 * lift; M.sy = _hkKey(u, [[0, .92], [.2, 1.02], [1, .98]]);
      M.headDy = _hkKey(u, [[0, 4], [.3, -1], [1, 2]]);
      const sw = (L ? 1 : -1) * Math.sin(Math.PI * u);
      M.arms = [[20 + 12 * sw, 36 - 14 * Math.max(0, sw), 22 * sw], [20 - 12 * sw, 36 - 14 * Math.max(0, -sw), -22 * sw]];
      M.headTilt = (L ? 1 : -1) * .05;
      if (f) M.yaw = f * .45;
      break;
    }
    case 'freeze': {
      const which = ((P.freeze ?? V.v) % 3 + 3) % 3;
      const r = rng('frz' + boilFrame(t) + ':' + V.v);
      M.tremble = [(r() - .5) * 1.6, (r() - .5) * 1.2];
      M.expr = 'panic';
      if (which === 0) {      // caught mid-shimmy: knee up, paws up like little claws
        M.feet = [[-15, -10, 0], [12, -36, 14]]; M.arms = [[30, -30, 20], [40, -20, 14]]; M.armBend = 1;
        M.tilt = .12; M.headTilt = -.12; M.sway = 6;
      } else if (which === 1) { // arms straight up, on tiptoe
        M.arms = [[36, -62, 0], [36, -62, 0]]; M.hop = 6; M.sy = 1.06; M.feet = [[-11, -14, 0], [11, -14, 0]];
      } else {                // crouched gremlin, paws out, one foot back
        M.sy = .88; M.arms = [[-2, 12, 30], [0, 18, 30]]; M.armBend = 1; M.feet = [[-18, -10, 0], [20, -22, -14]];
        M.tilt = -.08; M.headDy = 6;
      }
      break;
    }
    case 'dive': {
      M.rot = P.angle ?? ((f < 0 ? -1 : 1) * 2.2);
      M.arms = [[22, 56, -10], [22, 56, -10]];
      const kick = Math.sin(Math.floor(b * 8) / 8 * Math.PI * 4);
      M.feet = [[-8, -10 - 4 * kick, -6 * kick], [8, -10 + 4 * kick, 6 * kick]];
      M.sy = 1.16; M.expr = 'laugh'; M.fx.push('dive');
      break;
    }
  }
  return M;
}
function _hkLerpA(a, b, k) { return a.map((v, i) => lerp(v, b[i], k)); }

// ---------------------------------------------------------------------------------------------
// The head. Local coords: head centre at (0,0). A face sphere inside a slightly larger hood sphere; the hood's opening is
// ringed by petals. yaw turns the head (features follow a sphere).
// ---------------------------------------------------------------------------------------------
const HK_HEAD = { R: 56, sx: 1.1, sy: .95, Rh: 66, rim: 1.2, petR: 1.29 };
// projected rim of a cap (half-angle th) on an ellipsoid (radius R) under yaw; hidden points slide to the limb on the facing side
function _hkCapRim(R, th, yaw, n = 36, sx = HK_HEAD.sx, sy = HK_HEAD.sy) {
  const out = [], ss = Math.sin(yaw) >= 0 ? 1 : -1, c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < n; i++) {
    const b = i / n * Math.PI * 2 - Math.PI / 2;
    const thb = th * (1 + .08 * Math.max(0, Math.sin(b)) - .04 * Math.max(0, -Math.sin(b)));     // a touch lower at the chin
    const px = R * sx * Math.sin(thb) * Math.cos(b), py = R * sy * Math.sin(thb) * Math.sin(b), pz = R * Math.cos(thb);
    const x = px * c + pz * s, z = -px * s + pz * c;
    if (z >= 0) out.push([x, py]);
    else { const lim = R * sx * Math.sqrt(Math.max(0, 1 - (py / (R * sy)) ** 2)); out.push([ss * lim, py]); }
  }
  return out;
}
// a face-surface point (x,y in front-view coords) under yaw: returns [x', y, foreshortening, visible]
function _hkFaceP(x, y, yaw, R = HK_HEAD.R * HK_HEAD.sx) {
  const ph = Math.asin(clamp(x / R, -.99, .99)), q = ph + yaw;
  return [R * Math.sin(q), y, Math.max(.12, Math.cos(q) / Math.cos(ph)), Math.cos(q) > .08];
}

function _hkHoodPetals(K, P, V, yaw, F, front, Hp) {
  // petals ringing the hood opening. Returns nothing; draws those with depth on the requested side (front: z >= 0)
  const g = K.g, { Rh } = HK_HEAD, th = HK_HEAD.rim;
  const big = Hp.big || 1, items = [];
  const cy = Math.cos(yaw), sn = Math.sin(yaw);
  (F.hood || []).forEach((hp, li) => {
    const Ly = F.layers[Math.min(li, F.layers.length - 1)];
    const n = hp.n, Lf = big;
    for (let i = 0; i < n; i++) {
      const bA = (i + (li ? .5 : 0)) / n * Math.PI * 2 - Math.PI / 2;
      const down = Math.sin(bA);                       // +1 at the chin
      if (down > .9) continue;                         // the hood closes under the chin
      const Lp = (hp.L * Lf * (1 - .3 * Math.max(0, down - .3)) + 8) * 1.05;
      const Wp = hp.w * (Hp.big ? Math.sqrt(big) : 1);
      // 3D: base on the hood rim, direction outward in the face plane with a little forward cup
      const sb = Math.sin(th + .1), cb = Math.cos(th + .1);
      const B = [Rh * HK_HEAD.sx * sb * Math.cos(bA) * .93, Rh * HK_HEAD.sy * sb * Math.sin(bA) * .93, Rh * cb];
      const cup = .42;
      const D = [Math.cos(bA) * Math.cos(cup), Math.sin(bA) * Math.cos(cup), Math.sin(cup)];
      const T = [-Math.sin(bA), Math.cos(bA), 0];
      const shape = { ...Ly.shape, bend: (Ly.curl || 0) * 1.5 + (Hp.flutter || 0) * Math.sin(i * 1.7 + (Hp.ph || 0)) };
      const loc = _hkPetal(Lp, Wp, shape);
      // project; edge-on petals keep a little width (as if cupped), so a side view reads as a fan, not a line
      const Bp = [B[0] * cy + B[2] * sn, B[1]], Dp = [D[0] * cy + D[2] * sn, D[1]];
      let Tx = T[0] * cy; const Tmin = .5 * Math.abs(T[0]); if (Math.abs(Tx) < Tmin) Tx = (Tx < 0 ? -1 : 1) * Tmin;
      const pts = loc.map(([vx, vy]) => { const uu = -vy; return [Bp[0] + Dp[0] * uu + Tx * vx, Bp[1] + Dp[1] * uu + T[1] * vx]; });
      const bz = -B[0] * sn + B[2] * cy;
      const tipP = [B[0] + D[0] * Lp, B[1] + D[1] * Lp, B[2] + D[2] * Lp];
      items.push({ li, i, pts, z: bz + li * 2, b: [B[0] * cy + B[2] * sn, B[1]], tip: [tipP[0] * cy + tipP[2] * sn, tipP[1]], C: Ly.col });
    }
  });
  const sel = items.filter(it => front ? it.z >= -4 : it.z < -4).sort((a, b) => a.li - b.li || a.z - b.z);
  const lw = 2.1;
  // silhouette pass for the back layer: a bold outer edge like the apprentice's hair
  for (const it of sel) if (it.li === 0) K.loop('hpo' + it.i, it.pts, 4.2);
  for (const it of sel) _hkPetalPaint(K, 'hp' + it.li + '_' + it.i, it.pts, it.b, it.tip, it.li === 0 ? { c: mix(it.C.c, it.C.d, .25), l: mix(it.C.l, it.C.c, .3), d: it.C.d } : it.C, lw, null, true);
}
function _hkPuffHood(K, V, yaw, F) {
  // dandelion hood: a soft fluffy halo with seed tufts
  const g = K.g, cy = Math.cos(yaw), R0 = 98, r = rng('puffhood' + V.v);
  const pts = []; const N = 22;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    for (let j = 0; j < 4; j++) { const aa = a + j / 4 * Math.PI * 2 / N, bump = 1 + .07 * Math.sin(j / 4 * Math.PI); pts.push([Math.cos(aa) * R0 * bump * (.3 + .7 * Math.abs(cy)) + Math.sin(yaw) * 30, Math.sin(aa) * R0 * .92 * bump]); }
  }
  K.loop('pho', pts, 3.6);
  const gr = g.createRadialGradient(0, 0, 40, 0, 0, R0); gr.addColorStop(0, '#e8e0d0'); gr.addColorStop(1, '#fffdf6');
  K.fill(pts, gr, { tex: .12 });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + r() * .1, x0 = Math.cos(a) * 62, y0 = Math.sin(a) * 58, x1 = Math.cos(a) * (R0 - 6), y1 = Math.sin(a) * (R0 - 8) * .92;
    K.ink('pht' + i, [[x0 * Math.abs(cy) + Math.sin(yaw) * 30, y0], [x1 * Math.abs(cy) + Math.sin(yaw) * 30, y1]], .9, { color: '#b8ab90', alpha: .7 });
    for (let j = -1; j <= 1; j++) K.ink('phf' + i + j, [[x1 * Math.abs(cy) + Math.sin(yaw) * 30, y1], [x1 * Math.abs(cy) + Math.sin(yaw) * 30 + Math.cos(a + j * .5) * 8, y1 + Math.sin(a + j * .5) * 8]], .7, { color: '#a89a80', alpha: .6 });
  }
}

function _hkEye(K, ex, ey, side, ws, P, V, sc = 1.2) {
  const g = K.g, mode = P.eyes || 'open', blink = P.blink || 0, look = P.look || [0, 0];
  const S = x => ex + side * x * ws * sc, Y = y => ey + y * sc;
  const irisC = V.eyes ? mix(HK.iris, '#a86a20', V.eyes) : HK.iris;
  if (mode === 'happy') { K.ink('eh' + side, bez([S(-11), Y(4)], [S(-6), Y(-9)], [S(6), Y(-9)], [S(11), Y(4)], 10), 4.6); return; }
  if (mode === 'laugh') { K.ink('el' + side, [[S(10), Y(-8)], [S(-8), Y(0)], [S(10), Y(8)]], 4.4); return; }
  if (mode === 'closed' || (blink >= .85 && mode !== 'panic' && mode !== 'dizzy')) { K.ink('ec' + side, bez([S(-11), Y(0)], [S(-5), Y(7)], [S(5), Y(7)], [S(11), Y(0)], 10), 4.2); return; }
  if (mode === 'dizzy') {
    const sp = []; for (let i = 0; i <= 30; i++) { const a = i * .5 * side, rr = 11 * i / 30; sp.push([ex + Math.cos(a) * rr * ws * sc, ey + Math.sin(a) * rr * sc]); }
    K.ink('ed' + side, sp, 2.4, { taper: false }); return;
  }
  if (mode === 'panic') {
    // white saucers with pinprick pupils
    const pts = polyCircle(ex, ey, 11.5 * ws * sc, 13.5 * sc, 20);
    K.shape('ep' + side, pts, HK.white, { tex: 0, lw: 2.6 });
    K.ell(ex + look[0] * 3 * ws, ey + look[1] * 3, 2.6 * sc, 2.6 * sc, '#2a140a');
    return;
  }
  const wide = mode === 'wide', open = clamp(1 - blink);
  const rx = 10.5 * sc, ry = (wide ? 14.5 : 14) * open * sc;
  const shape = crSpline([[S(-10.5), ey], [S(-8), Y(-ry / sc * .9)], [S(1), Y(-ry / sc * 1.04)], [S(10.5), Y(-ry / sc * .62)], [S(10.8), Y(ry / sc * .25)], [S(6), Y(ry / sc * .9)], [S(-3), Y(ry / sc * .95)], [S(-9.5), Y(ry / sc * .55)]], true, 5);
  g.save(); P2(g, shape); g.fillStyle = HK.white; g.fill(); g.clip();
  const ix = ex + look[0] * 4 * ws * sc + side * .6 * ws, iy = ey + 1.5 * sc + look[1] * 3 * sc;
  const irx = (wide ? 6.5 : 8.6) * ws * sc, iry = (wide ? 8.5 : 12.2) * sc;
  const gr = g.createLinearGradient(0, iy - iry, 0, iy + iry);
  gr.addColorStop(0, HK.irisDeep); gr.addColorStop(.45, irisC); gr.addColorStop(1, HK.irisLight);
  g.beginPath(); g.ellipse(ix, iy, irx, iry, 0, 0, 7); g.fillStyle = gr; g.fill();
  K.ell(ix, iy + .5 * sc, irx * .45, iry * .45, '#3a160a');
  if (mode === 'sparkle') {
    const star = (x, y, r) => { g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rr = i % 2 ? r * .3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    star(ix - 2.5 * ws * sc, iy - 3.5 * sc, 6.5 * sc); star(ix + 3.5 * ws * sc, iy + 5 * sc, 3.2 * sc);
  } else {
    K.ell(ix - 3.2 * ws * sc, iy - iry * .42, 3.6 * ws * sc, 4.3 * sc, '#ffffff');
    K.ell(ix + 3.4 * ws * sc, iy + iry * .45, 1.7 * ws * sc, 1.7 * sc, 'rgba(255,255,255,.9)');
  }
  // lids: smug (flat, half closed) / determined (slanted down to the inside)
  let lidPts = null;
  if (mode === 'smug') lidPts = [[S(-14), Y(-20)], [S(14), Y(-20)], [S(14), Y(-ry / sc * .05)], [S(-14), Y(-ry / sc * .2)]];
  if (mode === 'determined') lidPts = [[S(-14), Y(-20)], [S(14), Y(-20)], [S(14), Y(-ry / sc * .62)], [S(-14), Y(ry / sc * .02)]];
  if (lidPts) { g.fillStyle = HK.skin; P2(g, lidPts); g.fill(); }
  g.restore();
  // lash line
  let top = bez([S(-11), Y(1)], [S(-9), Y(-ry / sc * 1.02)], [S(7), Y(-ry / sc * 1.15)], [S(11.5), Y(-ry / sc * .6)], 10);
  if (lidPts) top = [[S(-11.5), lidPts[3][1] + 1], [S(0), lerp(lidPts[3][1], lidPts[2][1], .5)], [S(11.5), lidPts[2][1] + .5]];
  K.ink('elu' + side, top, 4.8);
  K.ink('elf' + side, [top[top.length - 2], [S(15), Y(-ry / sc * .85) - (lidPts ? -2 : 0)]], 2.4);
  if (!wide) K.ink('ell' + side, [[S(-3), Y(ry / sc * .98)], [S(5), Y(ry / sc * .9)]], 1.4, { alpha: .6 });
}

function _hkMouth(K, mx, my, P, V, ws = 1, sc = 1) {
  const g = K.g, m = P.mouth || 'smile';
  const X = x => mx + x * ws * sc, Y = y => my + y * sc;
  const dark = '#7a2c24', tongue = '#e27a6c';
  switch (m) {
    case 'huge': case 'fang': {
      // big open "D", tongue, a row of teeth for the gremlin grin
      const w = m === 'huge' ? 15 : 13, h = m === 'huge' ? 17 : 11;
      const pts = [...bez([X(-w), Y(-3)], [X(-w * .4), Y(1)], [X(w * .4), Y(1)], [X(w), Y(-3)], 10), ...bez([X(w), Y(-3)], [X(w * .8), Y(h)], [X(-w * .8), Y(h)], [X(-w), Y(-3)], 12).slice(1)];
      g.save(); P2(g, pts); g.fillStyle = dark; g.fill(); g.clip();
      K.ell(X(0), Y(h * .82), w * .62 * ws * sc, h * .38 * sc, tongue);
      if (m === 'fang') {
        const fx = V.fang * 6;
        g.fillStyle = '#fffaf2'; g.beginPath(); g.moveTo(X(fx - 3), Y(-1)); g.lineTo(X(fx + 3), Y(-1)); g.lineTo(X(fx), Y(5.5)); g.closePath(); g.fill();
      }
      g.restore();
      K.ink('mt', pts.slice(0, 11), 2.3); K.ink('mb', pts.slice(10), 1.6, { alpha: .8 });
      if (m === 'fang') { const fx = V.fang * 6; K.ink('mf', [[X(fx - 3), Y(-1)], [X(fx), Y(5.5)], [X(fx + 3), Y(-1)]], 1.1, { alpha: .8 }); }
      break;
    }
    case 'cat': K.ink('mc', crSpline([[X(-8), Y(-2)], [X(-4.5), Y(2.5)], [X(0), Y(-.5)], [X(4.5), Y(2.5)], [X(8), Y(-2)]], false, 5), 2.2); break;
    case 'evil': {   // >:)  a wide closed smile, corners hooked up
      K.ink('me', bez([X(-14), Y(-5)], [X(-7), Y(5)], [X(7), Y(5)], [X(14), Y(-5)], 12), 2.4);
      K.ink('mel', [[X(-14), Y(-5)], [X(-16), Y(-8)]], 1.6); K.ink('mer', [[X(14), Y(-5)], [X(16), Y(-8)]], 1.6);
      break;
    }
    case 'o': {
      const pts = crSpline([[X(-4.5), Y(0)], [X(0), Y(-5)], [X(4.5), Y(0)], [X(3.5), Y(6)], [X(0), Y(7.5)], [X(-3.5), Y(6)]], true, 5);
      g.save(); P2(g, pts); g.fillStyle = dark; g.fill(); g.clip(); K.ell(X(0), Y(6), 3 * sc, 2 * sc, tongue); g.restore();
      K.loop('mo', pts, 2); break;
    }
    case 'wavy': K.ink('mw', crSpline([[X(-9), Y(1)], [X(-4.5), Y(-2)], [X(0), Y(1)], [X(4.5), Y(-2)], [X(9), Y(1)]], false, 5), 2.1); break;
    case 'flat': K.ink('mfl', [[X(-6), Y(0)], [X(6), Y(.5)]], 2.1); break;
    case 'none': break;
    default: K.ink('ms', bez([X(-7), Y(-1)], [X(-3), Y(3.5)], [X(3), Y(3.5)], [X(7), Y(-1)], 8), 2.2);
  }
}

function _hkHead(K, P, V, yaw, extras) {
  if (V.opus) { _hkOpusHead(K, P, V, yaw, extras); return; }
  const g = K.g, { R, Rh, rim } = HK_HEAD, F = extras.flower;
  const cy = Math.cos(yaw), sn = Math.sin(yaw);
  const frontish = cy > -.15;
  // 1. petals behind the hood (far side), then the hood dome, then near petals
  if (F.puff) _hkPuffHood(K, V, yaw, F);
  else _hkHoodPetals(K, P, V, yaw, F, false, extras);
  const domePts = polyCircle(0, -3, Rh * HK_HEAD.sx * .97, Rh * HK_HEAD.sy * 1.02, 32);
  if (extras.horns) _hkHorns(K, yaw);
  K.shape('dome', domePts, V.hood, { tex: .2, lw: 2.6, shade: gg => { gg.fillStyle = V.hoodShade; gg.globalAlpha = .7; gg.beginPath(); gg.ellipse(18, 18, Rh * 1.05, Rh * .95, 0, 0, 7); gg.rect(-300, -300, 600, 600); gg.fill('evenodd'); } });
  if (!frontish && Math.abs(sn) < .6) {
    // back of the hood: a centre seam and a gathered point
    K.ink('seam', bez([sn * -6, -Rh * .98], [sn * -10, -20], [sn * -8, 20], [sn * -4, Rh * .9], 10), 1.6, { alpha: .6 });
  }
  if (V.sprout || extras.sprout) _hkSprout(K, V, yaw, extras);
  if (!F.puff) _hkHoodPetals(K, P, V, yaw, F, true, extras);
  if (V.star && cy > -.3) {
    const [sx2, , ws2, vis] = _hkFaceP(48, 0, yaw, 74);
    if (vis) _hkStarClip(K, sx2, -48, .7 * Math.max(.4, ws2));
  }
  if (!frontish) return;
  // 2. the hood's rim band, then the face inside it
  const band = _hkCapRim(Rh * .98, rim + .12, yaw, 40);
  K.shape('band', band, V.hood, { tex: .18, lw: 2.6, shade: gg => { gg.fillStyle = V.hoodShade; gg.globalAlpha = .55; gg.beginPath(); gg.ellipse(10 + sn * 20, 14, 60, 56, 0, 0, 7); gg.rect(-300, -300, 600, 600); gg.fill('evenodd'); } });
  _hkFace(K, P, V, yaw);
}
// the face inside the hood (or under Opus's fringe): skin, blush, eyes, brows, mouth, extras
function _hkFace(K, P, V, yaw) {
  const g = K.g, { R, rim } = HK_HEAD, sn = Math.sin(yaw);
  const face = _hkCapRim(R, rim, yaw, 40);
  K.fill(face, HK.skin, { tex: .08, shade: gg => {
    const gr = gg.createRadialGradient(sn * 20, 0, 10, sn * 20, 6, 70); gr.addColorStop(0, 'rgba(255,236,214,0)'); gr.addColorStop(1, 'rgba(244,170,140,.4)');
    gg.fillStyle = gr; gg.fillRect(-120, -120, 240, 240);
    // the hood's shadow on the forehead and the near cheek
    gg.fillStyle = HK.skinShade; gg.globalAlpha = .6; gg.beginPath(); gg.ellipse(sn * 20, -60, 80, 26, 0, 0, 7); gg.fill();
  } });
  g.save(); P2(g, K.smooth(face, true)); g.clip();
  // bangs (Opus's fringe is part of her hair, drawn after the face)
  if (!V.opus) _hkBangs(K, V, yaw);
  // blush, freckles, band-aid
  const bl = P.blush ?? .5;
  for (const side of [-1, 1]) {
    const [bx, , ws, vis] = _hkFaceP(side * 39, 0, yaw);
    if (!vis) continue;
    _chBlush(g, bx, 27, 12 * ws, 6.5, HK.blush, bl * .8);
    if (bl > .45) for (let k = 0; k < 3; k++) K.ink('bh' + side + k, [[bx + (-6 + k * 5) * ws, 30], [bx + (-3.5 + k * 5) * ws, 24.5]], 1.1, { color: '#e0604f', alpha: Math.min(1, bl) * .75 });
    if (V.freckles) for (let k = 0; k < 3; k++) K.ell(bx + (-5 + k * 5) * ws, 12 + (k % 2) * 2.5, 1.1, 1.1, 'rgba(160,80,40,.6)');
  }
  // eyes, brows, mouth
  for (const side of [-1, 1]) {
    const [ex, , ws, vis] = _hkFaceP(side * 24.5, 0, yaw);
    if (vis) _hkEye(K, ex, 7, side, ws, P, V);
    const [bx, , bws, bvis] = _hkFaceP(side * 22, 0, yaw);
    if (bvis && P.eyes !== 'happy' && P.eyes !== 'laugh') {
      const raise = P.brow || 0, tilt = P.browTilt || 0, by = -15 - raise * 4;
      const S = x => bx + side * x * bws;
      K.ink('br' + side, [[S(-7), by + tilt * 3.5], [S(0), by - 1.5 - tilt * .5], [S(7), by - tilt * 2.5]], 2.6, { color: V.hairLine });
    }
  }
  const [mx, , mws, mvis] = _hkFaceP(0, 0, yaw);
  if (mvis) _hkMouth(K, mx, 34, P, V, mws, 1.1);
  if (V.bandaid === 'cheek') {
    const [bx, , ws, vis] = _hkFaceP(-V.side * 38, 0, yaw);
    if (vis) { const pts = _hkPlace(polyRect(-8, -3.5, 16, 7), bx, 12, -.4 * V.side, ws, 1); K.shape('bd', pts, '#f3d0a8', { tex: .1, lw: 1.3 }); K.dot(bx, 12, 1.1, 'rgba(160,110,80,.6)'); }
  }
  g.restore();
  K.ink('faceL', face.slice(4, 18), 2.4);
  // sweat drop
  if (P.sweat) {
    const [sx2, , , vis] = _hkFaceP(V.side * 52, 0, yaw);
    const sx3 = vis ? sx2 : sn * 50, sy2 = -22;
    K.shape('sw', crSpline([[sx3, sy2 - 12], [sx3 + 6, sy2 + 2], [sx3, sy2 + 7], [sx3 - 6, sy2 + 2]], true, 5), '#cfe7ee', { tex: 0, lw: 1.6 });
  }
  if (V.leafClip) {
    const [lx, , ws, vis] = _hkFaceP(-V.side * 44, 0, yaw, 70);
    if (vis) { const pts = _hkPlace(_hkPetal(22, 7, { waist: .1, peak: .5, sh: .7, fw: .5, top: 'point', bend: .2 }), lx, -40, -V.side * .9, ws, 1); K.shape('lc', pts, HK.leaf, { tex: .15, lw: 1.6 }); }
  }
}
function _hkBangs(K, V, yaw) {
  // the apprentice's fringe in miniature: rounded locks with sharp notches between them
  const g = K.g;
  const tipsX = [-50, -30, -10, 11, 31, 50], tipsY = [-20, -27, -24, -28, -25, -19], notchY = [-41, -45, -45, -45, -41];
  const tips = tipsX.map((x, i) => [_hkFaceP(x, 0, yaw, 72)[0], tipsY[i]]);
  const notches = tipsX.slice(0, -1).map((x, i) => [_hkFaceP((x + tipsX[i + 1]) / 2 + (i - 2) * 1.2, 0, yaw, 72)[0], notchY[i]]);
  const edge = _bangEdge(tips, notches);
  const pts = [[-80, -75], [tips[0][0] - 12, -30], ...edge, [tips[tips.length - 1][0] + 12, -30], [80, -75]];
  // a soft shadow the fringe casts on the forehead
  g.save(); g.globalAlpha = .3; g.fillStyle = HK.skinDeep; P2(g, chTr(pts, 0, 4)); g.fill(); g.restore();
  const gr = g.createLinearGradient(0, -62, 0, -18); gr.addColorStop(0, V.hairDeep); gr.addColorStop(.6, V.hair); gr.addColorStop(1, mix(V.hair, '#ffd0a8', .35));
  K.fill(pts, gr, { tex: .2 });
  K.ink('bang', edge, 2.2);
  notches.forEach((N, i) => K.ink('bn' + i, [N, [N[0] * .9, N[1] - 14]], 1.2, { color: V.hairLine, alpha: .55 }));
}
function _hkStarClip(K, x, y, k) {
  const star = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 - Math.PI / 2, r = (i % 2 ? 7 : 20) * k * (i % 4 === 2 ? .78 : 1); star.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  K.shape('star', star, HK.star, { tex: .05, lw: 2, shade: g => { g.fillStyle = HK.starShade; g.globalAlpha = .7; g.beginPath(); g.moveTo(x, y); for (let i = 4; i <= 10; i++) g.lineTo(star[i][0], star[i][1]); g.closePath(); g.fill(); } });
  K.dot(x, y, 2.6 * k, HK.starShade);
}
function _hkSprout(K, V, yaw, ex) {
  // a sprout on top of the hood, wobbling a beat behind the body
  const wob = ex.wob || 0, bx = Math.sin(yaw) * -6, by = -HK_HEAD.Rh * .98;
  const tip = [bx + wob * 10, by - 34 + Math.abs(wob) * 3];
  K.ink('spst', bez([bx, by + 6], [bx, by - 12], [tip[0] - wob * 4, tip[1] + 10], tip, 8), 3.4, { color: HK.leafDeep, taper: false });
  for (const sd of [-1, 1]) {
    const pts = _hkPlace(_hkPetal(22, 9, { waist: .15, peak: .5, sh: .7, fw: .5, top: 'point', bend: -sd * .25 }), tip[0], tip[1], sd * (1.05 + wob * sd * .3));
    K.shape('spl' + sd, pts, HK.leaf, { tex: .15, lw: 1.8, shade: gg => { gg.fillStyle = HK.leafDeep; gg.globalAlpha = .4; P2(gg, chTr(pts, 3 * sd, 3)); gg.fill(); } });
  }
}
function _hkHorns(K, yaw) {
  for (const sd of [-1, 1]) {
    const [x] = _hkFaceP(sd * 34, 0, yaw, 66);
    const base = [x, -HK_HEAD.Rh * .82];
    const pts = [[base[0] - 9, base[1] + 8], ...bez([base[0] - 9, base[1]], [base[0] - 8, base[1] - 30], [base[0] + sd * 4, base[1] - 40], [base[0] + sd * 16, base[1] - 50], 8), ...bez([base[0] + sd * 16, base[1] - 50], [base[0] + sd * 6, base[1] - 30], [base[0] + 10, base[1] - 22], [base[0] + 10, base[1] + 6], 8)];
    K.shape('horn' + sd, pts, '#c4383a', { tex: .15, lw: 2.2, shade: gg => { gg.fillStyle = '#7a1a20'; gg.globalAlpha = .5; P2(gg, chTr(pts, 5, 2)); gg.fill(); } });
  }
}

// ---------------------------------------------------------------------------------------------
// Body parts
// ---------------------------------------------------------------------------------------------
function _hkSleeve(K, name, S, E, Wp, V, col, shade) {
  if (V.opus) { _hkOpusSleeve(K, name, S, E, Wp, V); return; }
  const pts = limbPts([S, E, Wp], [13.5, 13, 13.5], 6, true);
  K.shape(name, pts, col, { tex: .16, lw: 2.5, shade: gg => { gg.fillStyle = shade; gg.globalAlpha = .75; const q = chTr(pts, -5, -4); gg.beginPath(); gg.rect(-3000, -3000, 6000, 6000); gg.moveTo(q[0][0], q[0][1]); for (const v of q) gg.lineTo(v[0], v[1]); gg.closePath(); gg.fill('evenodd'); } });
  // the paw: a soft round sleeve-end that swallows the hand (reads as a paw from any angle)
  const a = Math.atan2(Wp[1] - E[1], Wp[0] - E[0]), ca = Math.cos(a), sa = Math.sin(a);
  const px = Wp[0] + ca * 3, py = Wp[1] + sa * 3;
  const pc = polyCircle(px, py, 15, 14.5, 18);
  K.shape(name + 'pc', pc, col, { tex: .16, lw: 2.4, shade: gg => { gg.fillStyle = shade; gg.globalAlpha = .6; gg.beginPath(); gg.ellipse(px + 5, py + 5, 13, 12, 0, 0, 7); gg.fill(); } });
  // cuff seam where the paw meets the sleeve, and a little gathered crease
  const cx = Wp[0] - ca * 6, cy = Wp[1] - sa * 6;
  K.ink(name + 'cf', bez([cx - sa * 13, cy + ca * 13], [cx - sa * 5 + ca * 3, cy + ca * 5 + sa * 3], [cx + sa * 5 + ca * 3, cy - ca * 5 + sa * 3], [cx + sa * 13, cy - ca * 13], 6), 1.5, { alpha: .7 });
  K.ink(name + 'pn', [[px + ca * 9 - sa * 3, py + sa * 9 + ca * 3], [px + ca * 3, py + sa * 3]], 1.3, { alpha: .5 });
}
function _hkBoot(K, name, fx, fy, yaw, V, lift) {
  const s = Math.sin(yaw), tx = s * 7, w = 12 + Math.abs(s) * 4;
  const pts = crSpline([[fx - 8.5, fy - 8], [fx + 8.5, fy - 8], [fx + w * .95 + tx * .5, fy + 2], [fx + w + tx * 1.3, fy + 8], [fx + tx, fy + 11], [fx - w + tx * .5, fy + 9], [fx - w * .95, fy + 2]], true, 4);
  K.shape(name, pts, V.boots, { tex: .18, lw: 2.4, shade: gg => { gg.fillStyle = V.bootsDeep; gg.globalAlpha = .6; gg.fillRect(fx - 30, fy + 5, 60, 10); gg.globalAlpha = .4; gg.fillRect(fx + 2, fy - 10, 20, 20); } });
  K.ink(name + 'sl', [[fx - w * .9 + tx * .5, fy + 7.5], [fx + w * .95 + tx * 1.2, fy + 6.5]], 1.4, { alpha: .6 });
  K.ink(name + 'hl', [[fx - 6, fy - 4], [fx - 3, fy - 5.5]], 2, { color: '#ffffff', alpha: .5 });
}
function _hkLeg(K, name, H, Fp, yaw, V) {
  const L = Math.hypot(Fp[0] - H[0], Fp[1] - H[1]), rest = 40;
  let pts;
  if (L < rest - 4) {    // knee bends outward
    const mx = (H[0] + Fp[0]) / 2, my = (H[1] + Fp[1]) / 2, out = Math.sqrt(Math.max(0, rest * rest / 4 - L * L / 4)) * Math.sign(H[0] || 1);
    pts = [H, [mx + out * .9, my], Fp];
  } else pts = [H, [(H[0] + Fp[0]) / 2, (H[1] + Fp[1]) / 2], Fp];
  const tube = limbPts(pts, [9, 8, 7.5], 5, true);
  K.shape(name, tube, V.tights, { tex: .12, lw: 2.3, shade: gg => { gg.fillStyle = V.tightsDeep; gg.globalAlpha = .55; gg.fillRect(Fp[0] + 1, -200, 20, 300); } });
  if (V.stripes) {
    const g = K.g; g.save(); P2(g, K.smooth(tube, true)); g.clip(); g.fillStyle = V.hood; g.globalAlpha = .9;
    for (let y = -60; y < 10; y += 9) g.fillRect(-80, y, 160, 4.2); g.restore();
  }
  if (V.bandaid === 'knee' && name === 'legL') { const k = pts[1]; K.shape('bdk', _hkPlace(polyRect(-6, -3, 12, 6), k[0], k[1] + 4, .3), '#f3d0a8', { tex: .1, lw: 1.2 }); }
}

function _hkTorsoPts(wf = 1, costume) {
  return crSpline([[-18, -140], [-33, -132], [-40, -116], [-43, -92], [-48, -62], [-53, -46], [-30, -40], [0, -38.5], [30, -40], [53, -46], [48, -62], [43, -92], [40, -116], [33, -132], [18, -140], [0, -142]].map(([x, y]) => [x * wf, y]), true, 5);
}
function _hkTorso(K, V, yaw, X) {
  const g = K.g, cy = Math.cos(yaw), sn = Math.sin(yaw), wf = Math.sqrt(cy * cy + .7 * sn * sn);
  const T = _hkTorsoPts(wf);
  K.shape('torso', T, V.hood, { tex: .2, lw: 2.6, shade: gg => {
    gg.fillStyle = V.hoodShade; gg.globalAlpha = .7; gg.beginPath(); const q = chTr(T, -9, -5); gg.rect(-3000, -3000, 6000, 6000); gg.moveTo(q[0][0], q[0][1]); for (const v of q) gg.lineTo(v[0], v[1]); gg.closePath(); gg.fill('evenodd');
    gg.globalAlpha = .45; gg.beginPath(); gg.ellipse(0, -136, 46, 14, 0, 0, 7); gg.fill();                          // under the chin
  } });
  // hem rib
  K.ink('hem', [[-50 * wf, -53], [0, -51], [50 * wf, -53]], 1.6, { alpha: .65 });
  const fp = (x, y) => { const [px, , ws, vis] = _hkFaceP(x, y, yaw, 46); return [px, y, ws, vis]; };
  if (cy > .05) {
    // kangaroo pocket
    const pk = [[-26, -64], [-20, -90], [20, -90], [26, -64]].map(([x, y]) => { const [px] = fp(x, y); return [px, y]; });
    K.ink('pocket', [pk[0], pk[1], pk[2], pk[3]], 1.7, { alpha: .8 });
    K.ink('pocketB', [pk[0], [lerp(pk[0][0], pk[3][0], .5), -63], pk[3]], 1.1, { alpha: .45 });
    // chest patch
    const [px, , ws, vis] = fp(0, -110);
    if (vis && V.patch !== 'none') _hkPatch(K, V, px, -110, ws, X);
    // drawstrings
    for (const sd of [-1, 1]) {
      const [x0, , , v0] = fp(sd * 9, -136), [x1, , , v1] = fp(sd * 11 + X.sway * .2, -106);
      if (!v0) continue;
      K.ink('ds' + sd, bez([x0, -136], [x0 + sd, -126], [x1 - sd, -116], [x1, -106], 6), 1.8, { color: V.hoodTrim });
      K.ink('dso' + sd, bez([x0, -136], [x0 + sd, -126], [x1 - sd, -116], [x1, -106], 6), .8, { alpha: .6 });
      const aglet = _hkPlace(_hkPetal(9, 3.4, { waist: .3, peak: .5, sh: .7, fw: .6, top: 'point' }), x1, -108, Math.PI);
      K.shape('ag' + sd, aglet, V.flower.main === '#fffdf6' ? '#f2c230' : V.flower.main, { tex: .1, lw: 1.3 });
    }
  }
}
function _hkPatch(K, V, x, y, ws, X) {
  if (V.patch === 'star') { _hkStarClip(K, x, y + 4, .62); return; }
  const c = V.hoodTrim;
  if (V.patch === 'heart') {
    const pts = crSpline([[x, y + 9], [x - 9 * ws, y], [x - 7 * ws, y - 7], [x, y - 3], [x + 7 * ws, y - 7], [x + 9 * ws, y]], true, 5);
    K.shape('patch', pts, c, { tex: .1, lw: 1.5 }); return;
  }
  if (V.patch === 'flower') {
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; K.ell(x + Math.cos(a) * 5.5 * ws, y + 4 + Math.sin(a) * 5.5, 4.2 * ws, 4.2, c); }
    K.ell(x, y + 4, 3, 3, '#f2c230');
  }
}
function _hkTail(K, V, b, yaw) {
  const w = Math.sin(b * Math.PI) * 12, sd = V.side;
  const pts = bez([sd * 20, -56], [sd * 80, -40 + w], [sd * 66, -120], [sd * (86 + w), -134], 12);
  K.ink('tailo', pts, 7.5, { taper: false });
  K.ink('tail', pts, 4, { color: '#c4383a', taper: false, wobble: .2 });
  const e = pts[pts.length - 1], spade = crSpline([[e[0], e[1] + 4], [e[0] - 9, e[1] - 2], [e[0], e[1] - 16], [e[0] + 9, e[1] - 2]], true, 4);
  K.shape('spade', spade, '#c4383a', { tex: .1, lw: 2 });
}

// ---------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------
const HK_DRUM = { c: [0, -74, 30], r: 34, h: 26 };
function _hkDrum(K, V, hit, yaw) {
  const g = K.g, cx = Math.sin(yaw) * 24, cy = HK_DRUM.c[1], r = HK_DRUM.r, h = HK_DRUM.h, ry = 10;
  const shell = [...polyCircle(cx, cy, r, ry, 24).filter(p => p[1] >= cy - .1).sort((a, b) => b[0] - a[0]), ...polyCircle(cx, cy + h, r, ry, 24).filter(p => p[1] >= cy + h - .1).sort((a, b) => a[0] - b[0])];
  const shellC = V.v === 0 ? '#c4383a' : mix(V.flower.main, '#7a2020', .25);
  // strap
  K.ink('strapO', [[-30, -132], [cx + 20, cy - 4]], 7.5, { taper: false });
  K.ink('strap', [[-30, -132], [cx + 20, cy - 4]], 4.5, { color: '#f7efdc', taper: false, wobble: .2 });
  K.shape('shell', [[cx - r, cy], [cx + r, cy], [cx + r, cy + h], ...polyCircle(cx, cy + h, r, ry, 24).filter(p => p[1] >= cy + h).sort((a, b) => b[0] - a[0]), [cx - r, cy + h]], shellC, { tex: .2, lw: 2.4, shade: gg => { gg.fillStyle = '#000'; gg.globalAlpha = .18; gg.fillRect(cx + r * .35, cy - 20, r, h + 30); gg.fillStyle = '#fff'; gg.globalAlpha = .25; gg.fillRect(cx - r * .7, cy, 5, h + 10); } });
  // tension cords zigzag
  const zz = []; for (let i = 0; i <= 8; i++) { const x = cx - r * .92 + i * r * 1.84 / 8; zz.push([x, i % 2 ? cy + h + 4 : cy + 4]); }
  K.ink('cords', zz, 1.6, { color: '#f7efdc' }); K.ink('cordsI', zz, .7, { alpha: .6 });
  // hoops
  K.ink('hoopB', polyCircle(cx, cy + h, r, ry, 24).filter(p => p[1] >= cy + h).sort((a, b) => b[0] - a[0]), 3.6, { color: '#d6a443', taper: false });
  const head = polyCircle(cx, cy, r, ry, 28);
  K.shape('head', head, '#fbf5e6', { tex: .08, lw: 2.6, shade: gg => { gg.fillStyle = '#e2d1ab'; gg.globalAlpha = .7; gg.beginPath(); gg.ellipse(cx + 8, cy + 3, r * .8, ry * .6, 0, 0, 7); gg.fill(); } });
  K.loop('hoopT', polyCircle(cx, cy, r + 1.5, ry + 1.5, 28), 1.6, { color: '#a87a25' });
  if (hit) {
    for (let i = 0; i < 7; i++) { const a = -Math.PI * (i + .5) / 7; K.ink('hit' + i, [[cx + Math.cos(a) * (r * .35), cy - 4 + Math.sin(a) * 8], [cx + Math.cos(a) * (r * .85), cy - 4 + Math.sin(a) * 22]], 2.2, { color: '#fff3cf' }); }
  }
}
function _hkStick(K, name, paw, tip) {
  K.ink(name + 'o', [paw, tip], 6.4, { taper: false });
  K.ink(name, [paw, tip], 3.6, { color: '#e8c890', taper: false, wobble: .2 });
  K.ell(tip[0], tip[1], 3.4, 3.4, '#e8c890'); K.ink(name + 'b', polyCircle(tip[0], tip[1], 3.4, 3.4, 8).concat([[tip[0] + 3.4, tip[1]]]), 1.3, { taper: false });
}
function _hkCan(K, paw, tilt, b) {
  const g = K.g; g.save(); g.translate(paw[0], paw[1] + 8); g.rotate(tilt);
  const body = crSpline([[-16, -22], [16, -22], [19, 14], [-19, 14]], true, 3);
  K.ink('canh', bez([-12, -20], [-14, -42], [12, -42], [10, -20], 8), 3.4, { taper: false });
  K.shape('can', [[-17, -20], [17, -20], [20, 14], [-20, 14]], '#6f9aa0', { tex: .2, lw: 2.4, shade: gg => { gg.fillStyle = '#3f6a70'; gg.globalAlpha = .5; gg.fillRect(6, -30, 20, 50); } });
  K.ink('canr', [[-17, -14], [17, -14]], 1.3, { alpha: .6 });
  K.shape('spout', [[16, 4], [44, -22], [48, -18], [20, 12]], '#6f9aa0', { tex: .2, lw: 2.2 });
  K.shape('rose', crSpline([[42, -26], [52, -22], [50, -12], [44, -16]], true, 3), '#d6a443', { tex: .1, lw: 1.8 });
  g.restore();
  if (tilt > .3) {
    const c = Math.cos(tilt), s = Math.sin(tilt), ox = paw[0] + 48 * c + 18 * s, oy = paw[1] + 8 + 48 * s - 18 * c;
    for (let i = 0; i < 6; i++) { const k = _hkFrac(b * 2 + i / 6), x = ox + 10 + k * 22 + (i % 3) * 3, y = oy + k * k * 70; K.shape('drop' + i, crSpline([[x, y - 4], [x + 2.4, y + 1], [x, y + 3], [x - 2.4, y + 1]], true, 3), '#bfe3ee', { tex: 0, lw: 1.1 }); }
  }
}
function _hkPacket(K, name, x, y, a, seed) {
  const pts = _hkPlace(polyRect(-8, -11, 16, 22), x, y, a);
  const F = haikuFlower(seed);
  K.shape(name, pts, '#f7efdc', { tex: .1, lw: 1.7 });
  const top = _hkPlace(polyRect(-8, -11, 16, 9), x, y, a);
  K.shape(name + 'p', top, F.main === '#fffdf6' ? '#c8b890' : F.main, { tex: .1, lw: 0 });
  const [px, py] = _hkPlace([[0, 3]], x, y, a)[0];
  K.ell(px, py, 3, 3, F.center ? F.center.c : '#6b3f1f');
}
function _hkDoor(K, x, y, k, b) {
  // Maxwell's little door: a frame planted on the ground, the door swinging open on the beat; a hot and a cold molecule
  const g = K.g, Wd = 48, Hd = 112, open = Math.abs(Math.sin(Math.PI * Math.min(1, _hkFrac(b) * 2.5)));
  K.shape('dfr', [[x - Wd / 2 - 6, y], [x - Wd / 2 - 6, y - Hd - 6], [x + Wd / 2 + 6, y - Hd - 6], [x + Wd / 2 + 6, y], [x + Wd / 2, y], [x + Wd / 2, y - Hd], [x - Wd / 2, y - Hd], [x - Wd / 2, y]], '#8a5a36', { tex: .2, lw: 2.2 });
  K.fill(polyRect(x - Wd / 2, y - Hd, Wd, Hd), '#2a1c22', { tex: 0 });
  const dw = Wd * Math.cos(open * 1.3);
  const leaf = [[x - Wd / 2, y], [x - Wd / 2, y - Hd], [x - Wd / 2 + dw, y - Hd - open * 6], [x - Wd / 2 + dw, y + open * 6]];
  K.shape('dleaf', leaf, '#c98a52', { tex: .2, lw: 2.2, shade: gg => { gg.fillStyle = '#8a5a36'; gg.globalAlpha = .5 * open; gg.fillRect(x - 60, y - 200, 200, 300); } });
  K.ink('dpan', [[x - Wd / 2 + dw * .2, y - Hd * .82], [x - Wd / 2 + dw * .8, y - Hd * .82], [x - Wd / 2 + dw * .8, y - Hd * .55], [x - Wd / 2 + dw * .2, y - Hd * .55], [x - Wd / 2 + dw * .2, y - Hd * .82]], 1.2, { alpha: .6, taper: false });
  K.ell(x - Wd / 2 + dw * .85, y - Hd * .45, 3.4, 3.4, '#d6a443');
  // molecules: red one zips through when open, blue one waits
  const u = _hkFrac(b);
  const rx = u < .4 ? lerp(x + 50, x - 40, u / .4) : x - 40 - (u - .4) * 20;
  K.shape('mr', polyCircle(rx, y - 40 - Math.sin(u * 9) * 10, 7, 7, 12), '#e0503a', { tex: 0, lw: 1.6 });
  K.shape('mb', polyCircle(x + 46 + Math.sin(b * 5) * 4, y - 78, 7, 7, 12), '#6a9ad8', { tex: 0, lw: 1.6 });
}
function _hkBar(K, x, y, ang, w = 230) {
  const g = K.g; g.save(); g.translate(x, y); g.rotate(ang);
  const h = 34;
  K.shape('barO', polyRect(-w / 2, -h / 2, w, h), '#fbf5e6', { tex: .08, lw: 3 });
  K.fill(polyRect(-w / 2 + 5, -h / 2 + 5, (w - 10) * .92, h - 10), '#d97757', { tex: .15 });
  g.save(); P2(g, polyRect(-w / 2 + 5, -h / 2 + 5, (w - 10) * .92, h - 10)); g.clip(); g.fillStyle = 'rgba(255,240,220,.35)';
  for (let i = -10; i < 30; i++) { g.beginPath(); g.moveTo(-w / 2 + i * 14, h / 2); g.lineTo(-w / 2 + i * 14 + 7, h / 2); g.lineTo(-w / 2 + i * 14 + 21, -h / 2); g.lineTo(-w / 2 + i * 14 + 14, -h / 2); g.fill(); }
  g.restore();
  g.font = font(30, 'Fraunces', 900); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#4a2c1c'; g.lineJoin = 'round'; g.strokeText('92%', 0, 1.5); g.fillStyle = '#fff3cf'; g.fillText('92%', 0, 1.5);
  g.restore();
}
function _hkShako(K, V, yaw) {
  const sx = Math.sin(yaw) * -4, top = -HK_HEAD.Rh * .9;
  const hat = [[sx - 30, top + 16], [sx - 26, top - 44], [sx + 26, top - 44], [sx + 30, top + 16]];
  K.shape('shako', hat, '#3f5c8a', { tex: .2, lw: 2.6, shade: gg => { gg.fillStyle = '#2a3f62'; gg.globalAlpha = .6; gg.fillRect(sx + 10, top - 50, 30, 80); } });
  K.shape('shakoB', [[sx - 30, top + 6], [sx + 30, top + 6], [sx + 30, top + 16], [sx - 30, top + 16]], '#d6a443', { tex: .1, lw: 1.8 });
  K.ink('shakoC', [[sx - 22, top - 4], [sx, top - 24], [sx + 22, top - 4]], 2.4, { color: '#f7efdc' });
  // plume: one petal of the hood flower
  const C = V.flower.layers.length ? V.flower.layers[0].col : { c: '#ffffff', l: '#ffffff', d: '#ddd' };
  const pl = _hkPlace(_hkPetal(42, 9, { waist: .3, peak: .5, sh: .7, fw: .6, top: 'point', bend: .3 }), sx + 6, top - 42, .15);
  _hkPetalPaint(K, 'plume', pl, [sx + 6, top - 42], [sx + 14, top - 84], C, 2, null, true);
}
function _hkPrinterHat(K, V, yaw, b) {
  const g = K.g; g.save(); g.translate(0, -HK_HEAD.Rh * .92); g.scale(1.35, 1.35); g.translate(0, HK_HEAD.Rh * .92);
  const sx = Math.sin(yaw) * -4, top = -HK_HEAD.Rh * .92;
  // bowden tube
  K.ink('bowO', bez([sx + 18, top - 30], [sx + 60, top - 60], [sx + 70, top + 10], [sx + 56, top + 40], 10), 6, { taper: false });
  K.ink('bow', bez([sx + 18, top - 30], [sx + 60, top - 60], [sx + 70, top + 10], [sx + 56, top + 40], 10), 3.5, { color: '#fffaf0', taper: false, wobble: .2 });
  K.shape('hotend', polyRect(sx - 28, top - 34, 56, 40), '#f07a2a', { tex: .15, lw: 2.4, shade: gg => { gg.fillStyle = '#b8501a'; gg.globalAlpha = .6; gg.fillRect(sx + 8, top - 40, 30, 50); } });
  // fan
  K.shape('fan', polyCircle(sx - 6, top - 14, 13, 13, 16), '#2a2c30', { tex: 0, lw: 1.6 });
  const fa = b * 6;
  for (let i = 0; i < 4; i++) { const a = fa + i * Math.PI / 2; K.ink('fb' + i, [[sx - 6, top - 14], [sx - 6 + Math.cos(a) * 10, top - 14 + Math.sin(a) * 10]], 2.2, { color: '#8a8e96' }); }
  K.shape('heater', polyRect(sx - 13, top - 50, 26, 16), '#d6a443', { tex: .15, lw: 2 });
  K.shape('nozzle', [[sx - 7, top - 50], [sx + 7, top - 50], [sx, top - 62]], '#e0b040', { tex: .1, lw: 1.8 });
  // a little flower being printed layer by layer above the nozzle (it never admits it's finished)
  const layers = Math.floor(_hkFrac(b / 8) * 8) + 1;
  for (let i = 0; i < layers; i++) {
    const y = top - 70 - i * 4.2, w = 6 + 10 * Math.sin(Math.min(Math.PI, (i + 1) / 8 * Math.PI)) + (i > 5 ? 6 : 0);
    K.ink('lay' + i, [[sx - w, y], [sx + w, y]], 3.6, { color: i > 5 ? '#f2b33a' : HK.leaf, taper: false, wobble: .2 });
  }
  g.restore();
}
function _hkBattery(K, V, yaw, b) {
  // a battery costume: a fat cell from chin to knees, a charge meter that fills one flower-coloured bar per beat
  const g = K.g, wf = Math.sqrt(Math.cos(yaw) ** 2 + .6 * Math.sin(yaw) ** 2), w = 54 * wf, top = -150, bot = -30;
  const tube = crSpline([[-w, top + 8], [-w + 6, top], [w - 6, top], [w, top + 8], [w, bot - 8], [w - 6, bot], [-w + 6, bot], [-w, bot - 8]], true, 3);
  K.shape('bat', tube, '#3f7f72', { tex: .18, lw: 2.8, shade: gg => { gg.fillStyle = '#2a5a50'; gg.globalAlpha = .7; gg.fillRect(w * .45, top - 10, w, 200); gg.fillStyle = '#ffffff'; gg.globalAlpha = .18; gg.fillRect(-w * .72, top, w * .18, 130); } });
  g.save(); P2(g, K.smooth(tube, true)); g.clip();
  K.fill(polyRect(-w - 4, top - 4, 2 * w + 8, 30), '#e0a83a', { tex: .15 });
  g.restore();
  K.ink('batBand', [[-w, top + 26], [w, top + 26]], 2, { taper: false });
  if (Math.cos(yaw) > .1) {
    const n = Math.floor(_hkFrac(b / 5) * 5) + 1, mw = 34 * wf;
    K.shape('meter', polyRect(-mw, -114, 2 * mw, 70), '#fbf5e6', { tex: .06, lw: 2.2 });
    const cols = ['#e0473c', '#f08a3a', '#f2c230', '#8fbf5a', '#4fae7a'];
    for (let i = 0; i < 5; i++) if (i < n) K.shape('bar' + i, polyRect(-mw + 6, -59 - i * 12.6, 2 * mw - 12, 9.2), cols[i], { tex: .05, lw: 1.2 });
    g.save(); g.font = font(26, 'Fraunces', 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#4a2c1c'; g.fillText('+', 0, top + 13); g.restore();
  }
}
function _hkNub(K, yaw) {
  const sx = Math.sin(yaw) * -4, top = -HK_HEAD.Rh * .96;
  K.shape('nub', crSpline([[sx - 16, top + 10], [sx - 16, top - 14], [sx - 12, top - 18], [sx + 12, top - 18], [sx + 16, top - 14], [sx + 16, top + 10]], true, 3), '#d8d2c4', { tex: .1, lw: 2.4, shade: gg => { gg.fillStyle = '#a8a294'; gg.globalAlpha = .7; gg.fillRect(sx + 4, top - 30, 20, 50); } });
}
function _hkSign(K, x, y, side, ang, pct, b) {
  // the progress bar on a picket stick, stuck at 92%
  const g = K.g, w = 210, h = 42;
  K.ink('poleO', [[x, y + 50], [x, y - 250]], 8, { taper: false });
  K.ink('pole', [[x, y + 50], [x, y - 250]], 4.6, { color: '#c9a070', taper: false, wobble: .2 });
  g.save(); g.translate(x - side * 40, y - 272); g.rotate(ang);
  K.shape('barO', polyRect(-w / 2, -h / 2, w, h), '#fbf5e6', { tex: .08, lw: 3.2 });
  const fw = (w - 12) * pct / 100;
  K.fill(polyRect(-w / 2 + 6, -h / 2 + 6, fw, h - 12), '#d97757', { tex: .15 });
  g.save(); P2(g, polyRect(-w / 2 + 6, -h / 2 + 6, fw, h - 12)); g.clip(); g.fillStyle = 'rgba(255,240,220,.35)';
  const off = (b * 6) % 14;
  for (let i = -2; i < 18; i++) { const x0 = -w / 2 + i * 14 + off; g.beginPath(); g.moveTo(x0, h / 2); g.lineTo(x0 + 7, h / 2); g.lineTo(x0 + 21, -h / 2); g.lineTo(x0 + 14, -h / 2); g.fill(); }
  g.restore();
  g.font = font(34, 'Fraunces', 900); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = '#4a2c1c'; g.lineJoin = 'round'; g.strokeText(Math.round(pct) + '%', 0, 2); g.fillStyle = '#fff3cf'; g.fillText(Math.round(pct) + '%', 0, 2);
  g.restore();
}
function _hkRobot(K, b, yaw) {
  // a small round blue patrol robot (our own design): dome body, one big lens, four stubby legs, an antenna
  const g = K.g, u = _hkFrac(b), sq = _hkKey(u, [[0, .9], [.25, 1.04], [1, .97]]);
  g.save(); g.scale(1 / Math.sqrt(sq), sq);
  for (const [lx, lz] of [[-46, -1], [46, -1], [-30, 1], [30, 1]]) {
    const foot = [lx * 1.2, -8], hip = [lx * .7, -40];
    K.ink('rl' + lx + lz, [hip, [lx * 1.15, -34], foot], 9, { taper: false });
    K.ink('rli' + lx + lz, [hip, [lx * 1.15, -34], foot], 5.6, { color: '#8fb2d0', taper: false, wobble: .2 });
    K.shape('rf' + lx + lz, polyCircle(foot[0], foot[1], 9, 7, 12), '#3f5c8a', { tex: .1, lw: 2 });
  }
  const body = crSpline([[-70, -38], [-66, -86], [-36, -116], [0, -122], [36, -116], [66, -86], [70, -38], [40, -24], [0, -20], [-40, -24]], true, 6);
  K.shape('rbody', body, '#5b86c0', { tex: .2, lw: 2.8, shade: gg => { gg.fillStyle = '#3f5c8a'; gg.globalAlpha = .6; gg.beginPath(); gg.ellipse(14, -28, 80, 28, 0, 0, 7); gg.fill(); gg.fillStyle = '#ffffff'; gg.globalAlpha = .3; gg.beginPath(); gg.ellipse(-36, -96, 18, 8, -.5, 0, 7); gg.fill(); } });
  K.ink('rband', bez([-69, -54], [-30, -44], [30, -44], [69, -54], 10), 1.8, { alpha: .6 });
  const ex = Math.sin(yaw) * 20 + Math.sin(b * Math.PI / 2) * 8;
  K.shape('reyeR', polyCircle(ex, -64, 22, 20, 20), '#e8eef4', { tex: .05, lw: 2.4 });
  K.shape('reye', polyCircle(ex + 2, -63, 13, 13, 16), '#2a3048', { tex: 0, lw: 1.6 });
  K.ell(ex - 3, -68, 4.5, 4.5, '#ffffff'); K.ell(ex + 6, -59, 2, 2, '#bfe3ff');
  g.restore();
  return -112 * sq;
}

// ---------------------------------------------------------------------------------------------
// drawHaiku
// ---------------------------------------------------------------------------------------------
function drawHaiku(g, x, y, s = 1, pose = {}) {
  const t = pose.t || 0, b0 = pose.beat != null ? pose.beat : t * HK_BPM / 60;
  const per = pose.persona && HK_PERSONAS[pose.persona] ? HK_PERSONAS[pose.persona] : {};
  const isOpus = pose.persona === 'opus';
  const V0 = isOpus ? _hkOpusVariant(pose.variant || 0) : haikuVariant(pose.variant || 0);
  const V = { ...V0 };
  if (per.boots) { V.boots = per.boots; V.bootsDeep = mix(per.boots, '#2a1410', .4); }
  if (per.costume === 'sunflower') { V.flower = haikuFlower(0); V.hood = '#6f9a4f'; V.hoodShade = '#4d7536'; V.hoodTrim = '#d8e8b0'; V.sprout = false; V.star = false; V.patch = 'none'; }
  const move = pose.move || per.move || 'idle';
  const b = Math.floor(b0 * 8 + 1e-6) / 8;                // drawings held on 8ths of a beat
  const exprName = pose.expr || per.expr || (move === 'freeze' ? 'panic' : pose.prop === 'stamp' ? 'determined' : 'neutral');
  const K = charKit(g, t, s, { line: HK.line, seed: 'hk' + V.v, lineScale: pose.lineScale });
  if (move === 'peek') { _hkPeek(g, K, x, y, s, pose, V, b, exprName); return; }
  const M = _hkMove({ ...pose, move }, V, b, t);
  const E = { ...(HK_EXPR[M.expr && !pose.expr ? M.expr : exprName] || HK_EXPR.neutral) };
  const P = { ...E, look: pose.look || [0, 0], blink: pose.blink != null ? pose.blink : autoBlink(t, 'hk' + V.v), mouth: pose.mouth || E.mouth, eyes: pose.eyes || E.eyes };
  if (P.eyes !== 'open' && P.eyes !== 'smug' && P.eyes !== 'determined') P.blink = 0;
  const prop = pose.prop !== undefined && pose.prop !== null ? pose.prop : per.prop;
  const yaw = pose.yaw != null ? pose.yaw + M.yaw : M.yaw + (pose.facing && move !== 'march' && move !== 'spin' && move !== 'dive' ? pose.facing * .28 : 0);
  // extra landing squash
  const sq = clamp(pose.squash || 0);
  let sy = M.sy * (1 - .22 * sq);
  const sx = 1 / Math.sqrt(sy);
  // props that take over the arms
  const beatHit = _hkFrac(b) < .13;
  if (prop === 'drum') {
    const L = Math.floor(b) % 2 === 0, u = _hkFrac(b);
    const up = _hkKey(u, [[0, 0], [.12, .2], [.5, 1], [1, .05]]);
    const pawA = [-8, 40 - 30 * up, 30], pawB = [-8, 36 - 6 * (1 - up), 30];
    M.arms = L ? [pawA, pawB] : [pawB, pawA]; M.armBend = 1; M.drumUp = up; M.drumL = L;
  }
  if (prop === 'flower' || prop === 'can' || prop === 'seeds') {
    const i = V.side > 0 ? 1 : 0;
    if (prop === 'flower') M.arms[i] = [16, -22, 16];
    if (prop === 'can') M.arms[i] = [24, 26 - 6 * Math.sin(Math.PI * _hkFrac(b)), 18];
    if (prop === 'seeds') M.arms[i] = _hkLerpA([20, 20, 10], [22, -52, 10], _hkKey(_hkFrac(b), [[0, 0], [.2, 1], [.6, .8], [1, 0]]));
  }
  if (prop === 'bar') {
    const w = Math.sin(b * Math.PI) * 3, i = V.side > 0 ? 1 : 0;
    M.arms[i] = [18, 2 + w, 14];
    if (move === 'idle') M.arms[1 - i] = [6, -4, 30];        // the other paw shields the eyes from the waiting
  }
  if (per.robot) M.feet = [[-26, -30, 26], [26, -30, 26]];
  const lift = per.robot ? 1 : 0;
  // the stamp takes over the whole body: wind up, slam on the beat, squash, lift
  let SP = null;
  const book = prop === 'book' || (prop === 'stamp' && pose.book !== false), BOOKY = 58;
  if (prop === 'stamp') {
    SP = _hkStampPlan(V, b);
    const hw = HK_BOOK.w / 2, bx = SP.x * hw * .42 + hw * .4, coverY = BOOKY - HK_BOOK.th - HK_BOOK.d;
    SP.sx = bx; SP.sy = coverY + SP.y * HK_BOOK.d * .55 - 84 * SP.lift;
    const gy = SP.sy - 62;
    M.arms = [-1, 1].map(sd => [sd * (bx + sd * 13) - HK_SHOULDER[0], gy - HK_SHOULDER[1], 26]); M.armBend = 1;
    M.hop = 0; M.sway = 0; M.tilt = SP.x * .05; M.yaw = 0;
    M.sy = _hkKey(SP.u, [[0, .86], [.14, .9], [.4, 1.03], [.8, 1.05], [1, .95]]);
    M.headDy = _hkKey(SP.u, [[0, 7], [.2, 2], [.8, -3], [1, 2]]); M.headTilt = SP.x * .08;
    M.feet = [[-15, -10, 0], [15, -10, 0]];
  }

  g.save(); g.translate(x, y); g.scale(s, s);
  _chShadow(g, 0, 0, 62 * (1 - clamp(M.hop / 160) * .5), 12, .2 * (1 - clamp(M.hop / 160) * .6));
  if (per.robot) { const top = _hkRobot(K, b, yaw); g.translate(0, top + 46); }
  if (M.rot) { g.translate(0, -150); g.rotate(M.rot); g.translate(0, 150); }
  if (M.tremble) g.translate(M.tremble[0], M.tremble[1]);
  g.translate(0, -M.hop);
  g.scale(sx, sy);
  if (M.fx.includes('spin')) _hkSpinFx(K, b);
  if (M.fx.includes('dive')) _hkDiveFx(K, b);
  // demon door stands beside on the ground
  if (prop === 'door') _hkDoor(K, -V.side * 92, 0, 1, b);
  // --- rig ---
  const cyw = Math.cos(yaw);
  const hipC = [M.sway, -50 + (1 - sy) * 0];
  const tiltM = (p) => { const c = Math.cos(M.tilt), sn = Math.sin(M.tilt), dx = p[0], dy = p[1] - (-50); return [hipC[0] + dx * c - dy * sn, -50 + dx * sn + dy * c]; };
  // shoulders / arms in 3D (body yaw), then into the tilted torso frame
  const arms = [-1, 1].map((sd, i) => {
    const S3 = _hkRotY([sd * HK_SHOULDER[0], HK_SHOULDER[1], 0], yaw);
    const a = M.arms[i], W3 = _hkRotY([sd * a[0] + sd * HK_SHOULDER[0], HK_SHOULDER[1] + a[1], a[2]], yaw);
    const pole = _hkRotY(M.armBend ? [sd * 1, .2, -.6] : [sd * .6, .3, -1], yaw);
    const E3 = _ik2(S3, W3, 35, 35, pole);
    return { sd, S: tiltM([S3[0], S3[1]]), E: tiltM([E3[0], E3[1]]), W: tiltM([W3[0], W3[1]]), z: (S3[2] + W3[2] * .6) };
  });
  const legs = [-1, 1].map((sd, i) => {
    const H3 = _hkRotY([sd * HK_HIP[0], HK_HIP[1], 0], yaw), F3 = _hkRotY(M.feet[i], yaw);
    return { sd, H: tiltM([H3[0], H3[1]]), F: [F3[0] + (lift ? M.sway : 0), F3[1]], z: F3[2] };
  });
  // the neck/head
  const neck = tiltM([0, HK_NECK]);
  const headC = [neck[0] + M.headDx + Math.sin(M.tilt) * HK_HEADC, neck[1] - HK_HEADC * Math.cos(M.tilt) + M.headDy];
  // --- draw, back to front ---
  if (per.tail) _hkTail(K, V, b, yaw);
  legs.sort((a, b2) => a.z - b2.z).forEach(L => { _hkLeg(K, 'leg' + (L.sd < 0 ? 'L' : 'R'), L.H, L.F, yaw, V); _hkBoot(K, 'boot' + L.sd, L.F[0], L.F[1] + 10 - 10, yaw, V, 0); });
  const armBehind = arms.filter(a => a.z < -22), armFront = arms.filter(a => a.z >= -22);
  for (const A of armBehind) _hkSleeve(K, 'arm' + A.sd, A.S, A.E, A.W, V, V.hood, V.hoodShade);
  g.save(); g.translate(hipC[0], -50); g.rotate(M.tilt); g.translate(0, 50);
  if (V.opus) _hkOpusBody(K, V, yaw, M);
  else if (per.costume === 'battery') _hkBattery(K, V, yaw, b);
  else {
    _hkTorso(K, V, yaw, M);
    if (per.costume === 'sunflower') for (const sd of [-1, 1]) {
      const lf = _hkPlace(_hkPetal(60, 20, { waist: .15, peak: .5, sh: .72, fw: .5, top: 'point', bend: sd * -.2 }), sd * 36 * Math.abs(cyw), -64, sd * 1.1);
      K.shape('slf' + sd, lf, '#8fbf5a', { tex: .15, lw: 2.2, shade: gg => { gg.fillStyle = '#4d7536'; gg.globalAlpha = .45; P2(gg, chTr(lf, sd * 5, 4)); gg.fill(); } });
      K.ink('slfv' + sd, [[sd * 36 * Math.abs(cyw), -64], [sd * (36 * Math.abs(cyw) + 40), -78]], 1.2, { alpha: .5 });
    }
  }
  if (prop === 'drum') _hkDrum(K, V, beatHit, yaw);
  g.restore();
  if (book) {
    const from = pose.stampFrom ?? 0, marks = [];
    if (SP) for (let m = Math.max(from, SP.n - 3); m <= SP.n; m++) if (m !== SP.n || !SP.hit) { const [mx, my] = SP.at(m); marks.push([mx, 1, V.v * 100 + m, my]); }
    g.save(); g.translate(0, BOOKY + (SP && SP.hit ? 2 : 0)); _hkBook(K, marks); g.restore();
  }
  if (SP) {
    const cy0 = BOOKY - HK_BOOK.th - HK_BOOK.d + SP.y * HK_BOOK.d * .55, h = cy0 - SP.sy;
    if (h > 4) { g.save(); g.globalAlpha = .35 * (1 - clamp(h / 140) * .6); g.fillStyle = '#1a2a28'; g.beginPath(); g.ellipse(SP.sx + h * .15, cy0 + 2, 36 + h * .12, 9 + h * .03, 0, 0, 7); g.fill(); g.restore(); }
    g.save(); g.translate(SP.sx, SP.sy); g.rotate(-V.side * .3 * clamp(SP.lift - .4)); g.translate(-SP.sx, -SP.sy);
    _hkStamp(K, SP.sx, SP.sy + (SP.hit ? 2 : 0), SP.hit);
    g.restore();
  }
  // a paw raised beside the head goes in front of the petals; one behind the face stays behind the head
  const pawBehindHead = A => A.W[1] < A.S[1] - 4 ? Math.hypot(A.W[0] - headC[0], A.W[1] - headC[1]) < 66 : false;
  const preHead = armFront.filter(A => pawBehindHead(A)), postHead = armFront.filter(A => !pawBehindHead(A));
  for (const A of preHead) _hkSleeve(K, 'arm' + A.sd, A.S, A.E, A.W, V, V.hood, V.hoodShade);
  // head
  g.save(); g.translate(headC[0], headC[1]); g.rotate(M.tilt * .4 + M.headTilt);
  const wob = Math.sin((b0 - .25) * Math.PI) * .6 + (M.hop > 20 ? -.4 : 0);
  const wobble = clamp(pose.wobble || 0), tb = _hkFrac(b0) * 60 / HK_BPM;
  if (wobble > 0) { const [j] = _hkJelly(tb, .03, 3.4, 5); g.scale(1 + .07 * wobble * j, 1 - .07 * wobble * j); }
  _hkHead(K, P, V, yaw + (pose.headTurn || 0), { flower: V.flower, horns: per.horns, big: per.costume === 'sunflower' ? 1.55 : 1, flutter: move === 'spin' ? .25 : M.hop > 30 ? .12 : 0, ph: b * 3, wob, wobble, tb, t });
  if (per.hat === 'shako') _hkShako(K, V, yaw);
  if (per.hat === 'printer') _hkPrinterHat(K, V, yaw, b);
  if (per.costume === 'battery') _hkNub(K, yaw);
  g.restore();
  for (const A of postHead) {
    _hkSleeve(K, 'arm' + A.sd, A.S, A.E, A.W, V, V.hood, V.hoodShade);
  }
  for (const f of M.fx) if (f.startsWith('pump')) {
    const A = arms[+f[4]], ang = Math.atan2(A.W[1] - A.E[1], A.W[0] - A.E[0]);
    for (let i = -1; i <= 1; i++) { const q = ang + i * .7; K.ink('pfx' + i, [[A.W[0] + Math.cos(q) * 24, A.W[1] + Math.sin(q) * 24], [A.W[0] + Math.cos(q) * 38, A.W[1] + Math.sin(q) * 38]], 2.4, { alpha: .8 }); }
  }
  // props held in paws
  if (prop === 'drum') {
    arms.forEach((A, i) => {
      const hitting = (i === 0) === M.drumL, k = hitting ? M.drumUp : .15;
      const tip = [A.W[0] + 14 + (i ? 4 : -20), A.W[1] + 34 - 28 * k];
      _hkStick(K, 'stk' + i, [A.W[0] + (i ? 4 : -4), A.W[1] + 4], [lerp(tip[0], A.W[0] + (i ? 30 : -30), k * .5), tip[1]]);
    });
  }
  const pawI = V.side > 0 ? 1 : 0, paw = arms[pawI].W;
  if (prop === 'flower') {
    K.ink('fstem', [[paw[0], paw[1] + 6], [paw[0] + 2, paw[1] - 62]], 4.2, { color: HK.leafDeep, taper: false });
    drawBloom(g, paw[0] + 2, paw[1] - 76, .6, pose.propK != null ? pose.propK : 1, pose.flowerSeed ?? V.v, { t, lineScale: (pose.lineScale || 1) * 1 });
  }
  if (prop === 'can') _hkCan(K, paw, (V.side > 0 ? 1 : -1) * (.15 + .55 * _hkKey(_hkFrac(b), [[0, 1], [.4, .9], [.8, 0], [1, .6]])), b0);
  if (prop === 'seeds') {
    for (let i = 0; i < 3; i++) {
      const k = _hkFrac(b / 2 + i / 3), px = paw[0] + V.side * (10 + k * 70), py = paw[1] - 20 - 110 * 4 * k * (1 - k) * .9;
      _hkPacket(K, 'pk' + i, px, py, k * 7 * V.side, Math.floor(b / 2 + i / 3) * 3 + i + V.v * 5);
    }
    // the satchel of packets on the other hip
    const hx = -V.side * 44, hy = -70;
    K.shape('sat', crSpline([[hx - 16, hy - 12], [hx + 16, hy - 12], [hx + 18, hy + 14], [hx - 18, hy + 14]], true, 3), '#a06a3c', { tex: .2, lw: 2.2 });
    _hkPacket(K, 'pkS', hx - 4, hy - 16, -.2, V.v + 7);
  }
  if (prop === 'bar') { const a = arms[V.side > 0 ? 1 : 0]; _hkSign(K, a.W[0], a.W[1], V.side, Math.sin(b * Math.PI) * .06, pose.propK != null ? clamp(pose.propK) * 100 : 92, b); _hkSleeve(K, 'armS', a.S, a.E, a.W, V, V.hood, V.hoodShade); }
  g.restore();
}
function _hkSpinFx(K, b) {
  // whoosh arcs round the feet and the waist
  for (let i = 0; i < 3; i++) {
    const y = -20 - i * 46, ph = b * 8 + i, a0 = (ph % 2) * .6;
    const pts = []; for (let k = 0; k <= 12; k++) { const a = a0 + Math.PI * (.15 + k / 12 * .7); pts.push([Math.cos(a) * (70 - i * 6), y + Math.sin(a) * 12]); }
    K.ink('sw' + i, pts, 2.2, { alpha: .5 });
  }
}
function _hkDiveFx(K, b) {
  for (let i = 0; i < 5; i++) { const x = -40 + i * 20, y0 = 20 + (i % 2) * 16; K.ink('dl' + i, [[x, y0], [x, y0 + 50 + (i % 3) * 18]], 2, { alpha: .45 }); }
}

// 'peek': only the top of the head, the eyes and two sleeve-paws over the book's edge, one holding up a flower.
function _hkPeek(g, K, x, y, s, pose, V, b, exprName) {
  const t = pose.t || 0, k = pose.propK != null ? clamp(pose.propK) : 1;
  const E = HK_EXPR[exprName] || HK_EXPR.neutral;
  const P = { ...E, look: pose.look || [.4, -.2], blink: pose.blink != null ? pose.blink : autoBlink(t, 'hk' + V.v), eyes: pose.eyes || E.eyes, mouth: pose.mouth || 'none' };
  g.save(); g.translate(x, y); g.scale(s, s);
  g.save(); g.beginPath(); g.rect(-400, -600, 800, 600); g.clip();
  const hy = lerp(110, -40, ease.outBack(k, 1.4));
  const tilt = Math.sin(b * Math.PI / 2) * .06;
  g.save(); g.translate(0, hy); g.rotate(tilt);
  _hkHead(K, P, V, pose.yaw || 0, { flower: V.flower, flutter: 0, wob: Math.sin(b * Math.PI) * .4 });
  g.restore();
  g.restore();
  // paws gripping the edge
  const pk = clamp(k * 1.4 - .2);
  for (const sd of [-1, 1]) {
    const px = sd * 46, py = lerp(30, -2, pk);
    if (pk <= 0) continue;
    if (sd === V.side) continue;
    const pts = crSpline([[px - 15, py + 14], [px - 15, py - 4], [px - 8, py - 13], [px + 8, py - 13], [px + 15, py - 4], [px + 15, py + 14]], false, 5);
    g.save(); g.beginPath(); g.rect(-400, -600, 800, 600); g.clip();
    K.shape('pp' + sd, pts.concat([[px + 15, py + 20], [px - 15, py + 20]]), V.hood, { tex: .15, lw: 2.4 });
    K.ink('ppc' + sd, [[px - 12, py - 2], [px + 12, py - 2]], 1.3, { alpha: .6 });
    g.restore();
  }
  // the flower paw holds a stem up beside the face
  if (pk > 0) {
    const px = V.side * 58, py = lerp(20, -30, pk);
    const fk = clamp((k - .55) / .45);
    K.ink('pfs', [[px, py + 10], [px + V.side * 4, py - 74]], 4.6, { color: HK.leafDeep, taper: false });
    g.save(); g.beginPath(); g.rect(-400, -600, 800, 600); g.clip();
    K.shape('pfp', crSpline([[px - 14, py + 30], [px - 14, py - 4], [px - 7, py - 13], [px + 7, py - 13], [px + 14, py - 4], [px + 14, py + 30]], true, 5), V.hood, { tex: .15, lw: 2.4 });
    K.ink('pfpc', [[px - 12, py - 1], [px + 12, py - 1]], 1.3, { alpha: .6 });
    g.restore();
    drawBloom(g, px + V.side * 4, py - 80, .78, fk, pose.flowerSeed ?? V.v, { t });
  }
  g.restore();
}

// Where the drum head is on screen (for popping flowers out of it). Ignores the brief hit squash.
function haikuDrumHead(x, y, s, pose = {}) {
  const t = pose.t || 0, b0 = pose.beat != null ? pose.beat : t * HK_BPM / 60, b = Math.floor(b0 * 8 + 1e-6) / 8;
  const V = haikuVariant(pose.variant || 0), M = _hkMove({ ...pose, move: pose.move || 'march' }, V, b, t);
  const yaw = pose.yaw != null ? pose.yaw + M.yaw : M.yaw;
  const sy = M.sy * (1 - .22 * clamp(pose.squash || 0)), sx = 1 / Math.sqrt(sy);
  const lx = M.sway + Math.sin(yaw) * 24, ly = HK_DRUM.c[1];
  return [x + s * lx * sx, y + s * (-M.hop + ly * sy)];
}

// =============================================================================================
// CHIBI OPUS (bc2): drawHaiku(g, x, y, s, { persona: 'opus', ... }) — the apprentice at Haiku proportions, same rig,
// same moves and faces. No hood: her clay petal bob (the sunflower silhouette), star clip, cream capelet with a bow,
// teal skirt, dark tights, brown boots. Extras:
//   wobble: 0..1   the petal hair jiggles like jelly on every beat (springy overshoot per petal, a wave from the crown)
//   prop 'stamp'   a big rubber stamp that slams down on each beat onto a giant PROBLEM SET ∞ book, leaving red Q.E.D.s
//                  (pose.book: false drops the book; pose.stampFrom: first beat that leaves a mark, default 0)
//   prop 'book'    just the book lying in front of her
// drawStampMark(g, x, y, s, k, opts)   a red Q.E.D. impression, ~180 units wide at s = 1; k 0..1 = ink (fades in with a
//   little pop); opts { rot, sy (vertical squash for a page seen at an angle), seed }
// drawProblemBook(g, x, y, s, opts)    the giant book lying flat (origin: middle of its front-bottom edge);
//   opts { t, marks: [[x, k], ...] (x across the cover, -1..1), jolt }
// =============================================================================================
const HK_OPUS_BOWS = [['#4f7d78', '#36605b'], ['#c4383a', '#8a2228'], ['#6d4a5e', '#4a3040'], ['#d6a443', '#a87a25'], ['#5b86c0', '#3f5c8a'], ['#8fa27c', '#5d7a4e'], ['#e07a9a', '#a8506a']];
const _hkOpusCache = new Map();
function _hkOpusVariant(v = 0) {
  v = v | 0;
  if (_hkOpusCache.has(v)) return _hkOpusCache.get(v);
  const r = rng('opus-variant:' + v), C = CLAUDE;
  const bow = v === 0 ? HK_OPUS_BOWS[0] : HK_OPUS_BOWS[(v + Math.floor(r() * 3)) % HK_OPUS_BOWS.length];
  const jit = v === 0 ? 0 : r.range(-.08, .1);
  const hair = jit >= 0 ? mix(C.hair, '#e8904a', jit) : mix(C.hair, '#b04a38', -jit);
  const V = {
    ...haikuVariant(v), v, opus: true,
    hood: C.jacket, hoodShade: C.jacketShade, hoodTrim: C.trim, hair, hairDeep: mix(hair, C.hairDeep, .8), hairLine: C.hairLine,
    tights: C.tights, tightsDeep: C.tightsDeep, boots: C.boot, bootsDeep: C.bootDeep, stripes: false, sprout: false, leafClip: false,
    freckles: false, bandaid: null, star: false, patch: 'none', eyes: 0, flower: haikuFlower(v),
    nPetals: v === 0 ? 12 : 11 + Math.floor(r() * 4), bow: bow[0], bowDeep: bow[1],
    satchel: v === 0 || r() < .5, clip2: v !== 0 && r() < .25,
  };
  _hkOpusCache.set(v, V);
  return V;
}

// jelly: a damped spring kicked on every beat; d = delay (s) so the kick travels as a wave
function _hkJelly(tb, d, f = 4.2, z = 5.2) {
  let u = tb - d; if (u < 0) u += .6;
  const e = Math.exp(-z * u);
  return [e * Math.sin(2 * Math.PI * f * u), e * Math.cos(2 * Math.PI * f * u)];
}
function _hkOpusPetalList(V) {
  const N0 = V.nPetals, st = 300 / N0, out = [];
  const Rof = A => 106 + 6 * Math.cos(A * Math.PI / 90) * (A < 90 ? 1 : 0) - (A > 60 && A < 115 ? 8 * Math.sin((A - 60) / 55 * Math.PI) : 0) + (A > 115 ? (A - 115) * .42 : 0);
  for (let i = 0; i <= N0; i++) { const a = -150 + i * st; out.push({ ring: 0, a, r0: 30, len: Rof(Math.abs(a)) - 30 + 6, w: 17, i }); }
  for (let i = 0; i < N0; i++) { const a = -150 + st / 2 + i * st; out.push({ ring: 1, a, r0: 28, len: Rof(Math.abs(a)) - 28 - 18, w: 18.5, i: i + 100 }); }
  return out;
}
function _hkOpusPetals(K, V, yaw, ex) {
  const g = K.g, C = CLAUDE, hc = [0, -8];
  const cy = Math.cos(yaw), xs = (cy < 0 ? -1 : 1) * Math.max(Math.abs(cy), .55), shift = Math.sin(yaw) * -10;
  const w = ex.wobble || 0, tb = ex.tb || 0, t = ex.t || 0;
  const items = _hkOpusPetalList(V).map(p => {
    let a = p.a, len = p.len, wd = p.w, bend = Math.abs(p.a) > 110 ? -Math.sign(p.a) * .18 : 0;
    a += Math.sign(a) * (ex.splay || 0) * 10;
    bend += (ex.flutter || 0) * Math.sin((ex.ph || 0) + p.i * 1.7) * .5;
    if (w > 0) {
      const [s1, c1] = _hkJelly(tb, Math.abs(p.a) / 150 * .09 + (p.ring ? .02 : 0));
      const idle = .18 * Math.sin(t * 11 + p.i * 1.3);
      // neighbours swing against each other and stretch in and out: a jiggle, not a pinwheel
      a += w * (9 * s1 * (p.i % 2 ? 1 : -1) + 3 * idle);
      const st2 = 1 + w * (.26 * c1 * (p.ring ? 1 : -.6) + .05 * idle);
      len *= st2; wd /= Math.sqrt(st2);
      bend += w * .5 * s1 * (p.i % 3 ? 1 : -1);
    }
    const ang = a * Math.PI / 180 - Math.PI / 2;
    let pts = petalShape(hc[0] + Math.cos(ang) * p.r0, hc[1] + Math.sin(ang) * p.r0, ang, len, wd, bend, 18, { waist: .5, peak: .6, tipPow: .5 });
    pts = pts.map(([x, y]) => [x * xs + shift, y]);
    return { p, pts, ang };
  });
  for (const it of items) K.loop('ohs' + it.p.i, it.pts, 5);
  for (const ring of [0, 1]) {
    const gr = g.createRadialGradient(hc[0] + shift, hc[1], 24, hc[0] + shift, hc[1], 112);
    if (ring === 0) { gr.addColorStop(0, C.hairDark); gr.addColorStop(.55, mix(V.hairDeep, C.hairDark, .35)); gr.addColorStop(1, V.hairDeep); }
    else { gr.addColorStop(0, V.hairDeep); gr.addColorStop(.5, V.hair); gr.addColorStop(.95, mix(V.hair, C.hairLight, .6)); }
    for (const it of items.filter(q => q.p.ring === ring).sort((a, b) => Math.abs(b.p.a) - Math.abs(a.p.a))) {
      K.fill(it.pts, gr, { tex: .2 });
      K.loop('ohp' + it.p.i, it.pts, 2, { color: ring ? C.hairLine : '#6c2a14' });
      if (ring) {
        const n = it.pts.length, h = Math.floor(n / 2), q1 = it.pts[Math.floor(h * .55)], q2 = it.pts[Math.floor(h * .85)], m1 = it.pts[n - 1 - Math.floor(h * .55)], m2 = it.pts[n - 1 - Math.floor(h * .85)];
        K.ink('ohv' + it.p.i, [[lerp(q1[0], m1[0], .3), lerp(q1[1], m1[1], .3)], [lerp(q2[0], m2[0], .3), lerp(q2[1], m2[1], .3)]], 2.6, { color: C.hairLight, alpha: .55 });
      }
    }
  }
}
function _hkOpusHead(K, P, V, yaw, ex) {
  const g = K.g, C = CLAUDE, cy = Math.cos(yaw), frontish = cy > -.15;
  _hkOpusPetals(K, V, yaw, ex);
  if (!frontish) {
    // the back of her head: a round of hair with a crown whorl, the star clip on the far side
    const sk = polyCircle(Math.sin(yaw) * -4, -10, 62, 64, 30);
    const gr = g.createRadialGradient(-6, -50, 6, 0, -10, 70); gr.addColorStop(0, mix(V.hair, C.hairLight, .3)); gr.addColorStop(.5, V.hair); gr.addColorStop(1, V.hairDeep);
    K.shape('oskull', sk, gr, { tex: .2, lw: 2.6 });
    for (let k = 0; k < 6; k++) { const a = -2.4 + k * .9; K.ink('owh' + k, bez([2, -40], [Math.cos(a) * 20, -40 + Math.sin(a) * 18], [Math.cos(a) * 36, -10 + Math.sin(a) * 26], [Math.cos(a) * 46, -8 + Math.sin(a) * 40], 8), 1.1, { color: C.hairLine, alpha: .3 }); }
    const [sx] = _hkFaceP(-40, 0, yaw - Math.PI, 70);
    _hkStarClip(K, sx, -50, .7);
    return;
  }
  _hkFace(K, P, V, yaw);
  // side locks in front of the cheeks
  for (const sd of [-1, 1]) {
    const [lx, , ws, vis] = _hkFaceP(sd * 57, 0, yaw, 66);
    if (!vis && Math.sign(Math.sin(yaw)) === -sd) continue;
    const pts = petalShape(lx, -48, Math.PI / 2 + sd * .05, 76, 10.5 * Math.max(.6, ws), sd * .16, 14, { waist: .35, peak: .5 });
    const gr = g.createLinearGradient(0, -48, 0, 30); gr.addColorStop(0, V.hairDeep); gr.addColorStop(.6, V.hair); gr.addColorStop(1, mix(V.hair, C.hairLight, .5));
    K.fill(pts, gr, { tex: .2 }); K.loop('osl' + sd, pts, 2.3);
  }
  // dome + the fringe (rounded locks, sharp notches)
  const tipsX = [-54, -34, -12, 11, 33, 54], tipsY = [-16, -25, -21, -26, -22, -15], notchY = [-40, -46, -48, -46, -40];
  const tips = tipsX.map((x, i) => [_hkFaceP(x, 0, yaw, 70)[0], tipsY[i]]);
  const notches = tipsX.slice(0, -1).map((x, i) => [_hkFaceP((x + tipsX[i + 1]) / 2, 0, yaw, 70)[0], notchY[i]]);
  const edge = _bangEdge(tips, notches);
  const sh = Math.sin(yaw) * 8, dL = Math.min(-62, tips[0][0] - 6), dR = Math.max(62, tips[5][0] + 6);
  const top = bez([dR, -14], [dR + 8, -62], [36 + sh, -78], [sh, -78], 12).concat(bez([sh, -78], [-36 + sh, -78], [dL - 8, -62], [dL, -14], 12).slice(1));
  const dome = [...edge, [dR, -14], ...top];
  // the fringe's shadow on the forehead
  g.save(); P2(g, K.smooth(_hkCapRim(HK_HEAD.R, HK_HEAD.rim, yaw, 40), true)); g.clip(); g.globalAlpha = .55; g.fillStyle = C.skinShade; P2(g, [...chTr(edge, 0, 6), [90, -120], [-90, -120]]); g.fill(); g.restore();
  const gr = g.createLinearGradient(0, -80, 0, -14); gr.addColorStop(0, V.hairDeep); gr.addColorStop(.4, V.hair); gr.addColorStop(1, mix(V.hair, C.hairLight, .35));
  K.fill(dome, gr, { tex: .2 });
  g.save(); P2(g, K.smooth(dome, true)); g.clip(); g.globalAlpha = .5; g.fillStyle = C.hairLight;
  g.beginPath(); g.ellipse(sh, -58, 52, 9, 0, 0, 7); g.fill(); g.restore();          // angel-ring highlight
  K.ink('obang', [[dL, -14], ...edge, [dR, -14]], 2.5);
  K.ink('odome', top, 2.4);
  notches.forEach((N, i) => K.ink('obn' + i, [N, [N[0] * .8, N[1] - 22]], 1.3, { color: C.hairLine, alpha: .55 }));
  const [sx, , ws, vis] = _hkFaceP(40, 0, yaw, 72);
  if (vis) _hkStarClip(K, sx, -50, .72 * Math.max(.5, ws));
  if (V.clip2) { const [cx] = _hkFaceP(-44, 0, yaw, 72); K.shape('oclip2', _hkPlace(polyRect(-9, -3, 18, 6), cx, -36, .5), V.bow, { tex: .1, lw: 1.6 }); }
}

function _hkOpusSleeve(K, name, S, E, Wp, V) {
  const C = CLAUDE, a = Math.atan2(Wp[1] - E[1], Wp[0] - E[0]), ca = Math.cos(a), sa = Math.sin(a);
  const pts = limbPts([S, E, Wp], [12.5, 12, 11.5], 6, true);
  K.shape(name, pts, C.jacket, { tex: .16, lw: 2.4, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .8; const q = chTr(pts, -5, -4); gg.beginPath(); gg.rect(-3000, -3000, 6000, 6000); gg.moveTo(q[0][0], q[0][1]); for (const v of q) gg.lineTo(v[0], v[1]); gg.closePath(); gg.fill('evenodd'); } });
  // a little mitten hand (thumb bump toward the body) and a clay cuff
  const hx = Wp[0] + ca * 9, hy = Wp[1] + sa * 9;
  K.shape(name + 'th', polyCircle(hx - sa * 7, hy + ca * 7, 4.6, 4.6, 10), C.skin, { tex: .06, lw: 2 });
  K.shape(name + 'h', polyCircle(hx, hy, 10.5, 10.5, 16), C.skin, { tex: .06, lw: 2.2, shade: gg => { gg.fillStyle = C.skinShade; gg.globalAlpha = .7; gg.beginPath(); gg.ellipse(hx + 4, hy + 4, 9, 8, 0, 0, 7); gg.fill(); } });
  const cuff = capsulePts(Wp[0] - ca * 6, Wp[1] - sa * 6, Wp[0] + ca * 2, Wp[1] + sa * 2, 12.5, 12.5);
  K.shape(name + 'cf', cuff, C.trim, { tex: .15, lw: 2 });
}

function _hkOpusBody(K, V, yaw, M) {
  const g = K.g, C = CLAUDE, cy = Math.cos(yaw), sn = Math.sin(yaw), wf = Math.sqrt(cy * cy + .7 * sn * sn);
  const X = x => x * wf;
  // skirt: a teal bell that flares on the hop
  const fl = 1 + clamp(M.hop / 90) * .18 + Math.abs(M.sway) * .004;
  const hemY = -40, hw = 60 * fl, sw = M.sway * -.25;
  const hem = []; for (let i = 0; i <= 8; i++) { const u = i / 8, x = lerp(-hw, hw, u); hem.push([X(x) + sw, hemY + 4 * Math.sin(u * Math.PI) + (i % 2 ? -3 : 0)]); }
  const skirt = [[X(-33), -88], [X(33), -88], ...hem.slice().reverse()];
  K.shape('oskirt', crSpline(skirt, true, 3), C.skirt, { tex: .2, lw: 2.6, shade: gg => { gg.fillStyle = C.skirtShade; gg.globalAlpha = .8; gg.beginPath(); gg.moveTo(X(10), -90); gg.lineTo(X(40) + sw, -30); gg.lineTo(X(80), -30); gg.lineTo(X(80), -90); gg.fill(); } });
  for (let i = 1; i < 8; i += 2) K.ink('opl' + i, [[X(lerp(-30, 30, i / 8)), -84], hem[i]], 1.5, { alpha: .55 });
  // bodice + belt
  const top = crSpline([[X(-18), -142], [X(-32), -132], [X(-37), -110], [X(-35), -86], [X(35), -86], [X(37), -110], [X(32), -132], [X(18), -142], [0, -144]], true, 4);
  K.shape('otop', top, C.jacket, { tex: .15, lw: 2.5, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .8; gg.fillRect(X(12), -150, 60, 70); } });
  K.shape('obelt', polyRect(X(-36), -92, X(72), 8), C.strap, { tex: .15, lw: 1.8 });
  if (V.satchel && cy > -.2) {
    const sd = V.side;
    K.ink('ostrapO', [[X(-sd * 30), -132], [X(sd * 38), -76]], 7, { taper: false });
    K.ink('ostrap', [[X(-sd * 30), -132], [X(sd * 38), -76]], 4, { color: C.strap, taper: false, wobble: .2 });
    const bag = crSpline([[X(sd * 26), -84], [X(sd * 52), -84], [X(sd * 54), -60], [X(sd * 24), -60]], true, 3);
    K.shape('obag', bag, C.satchel, { tex: .2, lw: 2.2, shade: gg => { gg.fillStyle = C.strapDeep; gg.globalAlpha = .4; gg.fillRect(X(sd * 26) - 40, -70, 120, 20); } });
    K.ink('obagf', [[X(sd * 25), -76], [X(sd * 53), -76]], 1.4, { alpha: .6 });
  }
  // capelet: rounded over the shoulders, a scalloped petal hem with clay trim
  const cw = 54, cyb = -100, nS = 6, scal = [];
  for (let i = 0; i <= nS * 4; i++) { const u = i / (nS * 4), x = lerp(cw, -cw, u), ph = (u * nS) % 1; scal.push([X(x), cyb + 7 * Math.sin(u * Math.PI) + 6 * Math.sin(ph * Math.PI)]); }
  const cape = [[X(-16), -146], [X(16), -146], ...bez([X(16), -146], [X(44), -142], [X(cw + 2), -126], [X(cw), cyb], 8).slice(1), ...scal.slice(1), ...bez([X(-cw), cyb], [X(-cw - 2), -126], [X(-44), -142], [X(-16), -146], 8).slice(1)];
  K.shape('ocape', cape, C.jacket, { tex: .15, lw: 2.6, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .8; gg.beginPath(); gg.ellipse(X(30), -98, 40, 30, 0, 0, 7); gg.fill(); } });
  K.ink('otrim', scal.map(([x, y]) => [x, y - 5]), 2.4, { color: C.trim, alpha: .9 });
  if (cy > .05) {
    K.ink('ocapeC', [[0, -140], [0, -118]], 1.3, { alpha: .5 });
    _ribbonBow(K, Math.sin(yaw) * 20, -134, .62, { ribbon: V.bow, ribbonDeep: V.bowDeep });
  }
}

// --- the stamp, its mark, and the book ---------------------------------------------------------------------
function _hkQedTexture() {
  return cached('hk-qed-mark', 400, 200, (g) => {
    const red = '#c4283a';
    g.strokeStyle = red; g.fillStyle = red; g.lineJoin = 'round';
    g.lineWidth = 12; g.beginPath(); g.roundRect(12, 12, 376, 176, 26); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.roundRect(30, 30, 340, 140, 16); g.stroke();
    g.font = font(104, 'Fraunces', 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Q.E.D.', 200, 106);
    // rubber-stamp distress: ink skips and specks
    const r = rng('qed-distress');
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) { g.globalAlpha = r.range(.3, 1); g.beginPath(); g.arc(r() * 400, r() * 200, r.range(.6, 3.2), 0, 7); g.fill(); }
    for (let i = 0; i < 14; i++) { g.globalAlpha = r.range(.2, .6); g.beginPath(); g.ellipse(r() * 400, r() * 200, r.range(10, 40), r.range(3, 8), r() * 3, 0, 7); g.fill(); }
  });
}
function drawStampMark(g, x, y, s = 1, k = 1, o = {}) {
  if (k <= 0) return;
  const r = rng('qedmark' + (o.seed ?? 0)), rot = o.rot ?? r.range(-.12, .12), pop = 1 + .14 * (1 - ease.outC(clamp(k * 2)));
  g.save(); g.translate(x, y); g.scale(1, o.sy ?? 1); g.rotate(rot); g.scale(s * pop * .45, s * pop * .45);
  g.globalAlpha = clamp(k * 1.6) * .9; if (o.multiply) g.globalCompositeOperation = 'multiply';
  g.drawImage(_hkQedTexture(), -200, -100);
  g.restore();
}
const HK_BOOK = { w: 264, d: 62, th: 26 };       // half-depth of the cover as seen (top face from y = -d*2 to 0 above the front edge)
function drawProblemBook(g, x, y, s = 1, o = {}) {
  const K = charKit(g, o.t || 0, s, { line: HK.line, seed: 'pbook', lineScale: o.lineScale });
  g.save(); g.translate(x, y + (o.jolt || 0)); g.scale(s, s); _hkBook(K, o.marks || []); g.restore();
}
// origin: middle of the book's front-bottom edge; the cover's centre line is at y = -th - d
function _hkBook(K, marks) {
  const g = K.g, { w, d, th } = HK_BOOK, hw = w / 2, back = -th - 2 * d, front = -th;
  _chShadow(g, 0, -6, hw * 1.15, 16, .28);
  // pages (front edge) and the lower board
  K.shape('bkpages', [[-hw + 6, front], [hw - 4, front], [hw - 4, -5], [-hw + 6, -5]], '#fbf5e6', { tex: .08, lw: 2.2 });
  for (let i = 1; i < 5; i++) K.ink('bkpl' + i, [[-hw + 8, front + i * 4.2], [hw - 6, front + i * 4.2]], .9, { alpha: .35, taper: false });
  K.shape('bkboard', [[-hw, -6], [hw, -6], [hw + 2, 0], [-hw - 2, 0]], '#2f5f56', { tex: .15, lw: 2 });
  K.shape('bkspine', [[-hw - 4, back + 2], [-hw + 8, back], [-hw + 8, 0], [-hw - 4, 0]], '#2a554c', { tex: .15, lw: 2.2 });
  // the cover, seen from above at an angle
  const cover = [[-hw + 4, back], [hw + 6, back], [hw + 12, front], [-hw - 2, front]];
  K.shape('bkcover', cover, '#3f7f72', { tex: .2, lw: 2.6, shade: gg => { gg.fillStyle = '#ffffff'; gg.globalAlpha = .1; gg.beginPath(); gg.moveTo(-hw, back); gg.lineTo(-hw + 60, back); gg.lineTo(-hw + 20, front); gg.lineTo(-hw - 2, front); gg.fill(); } });
  K.ink('bkhinge', [[-hw + 18, back + 2], [-hw + 14, front - 2]], 1.6, { alpha: .5 });
  // label (left half) with the title, foreshortened
  g.save(); g.translate(-hw * .44, (back + front) / 2); g.scale(1, .5);
  K.shape('bklabel', polyRect(-62, -52, 124, 104), '#fbf5e6', { tex: .08, lw: 3 });
  g.font = font(25, 'Fraunces', 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#4a2c1c';
  g.fillText('PROBLEM', 0, -16); g.fillText('SET ∞', 0, 20);
  g.restore();
  // the Q.E.D.s so far
  for (const [mx, mk, seed, my = 0] of marks) drawStampMark(g, mx * hw * .42 + hw * .4, (back + front) / 2 + my * d * .55, .6, mk, { sy: .62, seed });
}
function _hkStampPlan(V, b) {
  // which beat we're on, how high the stamp is (0 = down on the cover), and where it lands next
  const n = Math.floor(b), u = _hkFrac(b);
  const lift = _hkKey(u, [[0, 0], [.12, 0], [.3, .55], [.55, 1], [.8, 1.14], [.92, .6], [1, 0]]);
  const at = m => { const r = rng('stamp' + V.v + ':' + m); return [r.range(-1, 1), r.range(-1, 1)]; };
  const k = _hkSmooth(clamp((u - .3) / .5)), A = at(n), B = at(n + 1);
  return { n, u, lift, x: lerp(A[0], B[0], k), y: lerp(A[1], B[1], k), hit: u < .12, at };
}
function _hkStamp(K, sx, sy, hit) {
  // a big rubber stamp: red rubber, wooden block, a turned neck and a round knob; (sx, sy) = bottom of the rubber
  const g = K.g, sq = hit ? .86 : 1, bw = 64;
  g.save(); g.translate(sx, sy); g.scale(1.25 / Math.sqrt(sq), 1.25 * sq);
  K.shape('srub', polyRect(-bw / 2 + 3, -7, bw - 6, 7), '#c4283a', { tex: .1, lw: 2 });
  K.shape('sblk', [[-bw / 2, -7], [bw / 2, -7], [bw / 2 - 2, -30], [-bw / 2 + 2, -30]], '#b07a48', { tex: .25, lw: 2.4, shade: gg => { gg.fillStyle = '#7a4a26'; gg.globalAlpha = .5; gg.fillRect(8, -40, 40, 40); } });
  K.shape('sblkT', polyCircle(0, -30, bw / 2 - 2, 7, 18), '#d09a62', { tex: .2, lw: 2 });
  K.shape('sneck', [[-8, -32], [8, -32], [6, -58], [-6, -58]], '#c08a52', { tex: .2, lw: 2.2 });
  K.shape('sknob', polyCircle(0, -66, 14, 12, 16), '#d6a443', { tex: .2, lw: 2.4, shade: gg => { gg.fillStyle = '#a87a25'; gg.globalAlpha = .6; gg.beginPath(); gg.arc(5, -62, 11, 0, 7); gg.fill(); } });
  K.ell(-5, -70, 3.4, 2.6, 'rgba(255,255,255,.7)');
  g.restore();
  if (hit) for (let i = 0; i < 7; i++) { const a = Math.PI * (i - 3) / 9; K.ink('shit' + i, [[sx + Math.sin(a) * 44, sy - 4 + Math.cos(a) * -2], [sx + Math.sin(a) * 66, sy - 8 - Math.abs(Math.cos(a)) * 8]], 2.6, { alpha: .9 }); }
}

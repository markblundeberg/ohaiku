// core.js — deterministic drawing toolkit. Every frame is a pure function of time.
// Conventions: canvas is 1920x1080; t is seconds; all randomness comes from seeded RNGs.

const W = 1920, H = 1080;
const FPS = 24;          // render rate
const BOIL = 12;         // "on twos": line boil / grain changes at 12 fps

// ---------- seeded randomness ----------
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  const r = () => {               // mulberry32
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.gauss = () => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  return r;
}
const boilFrame = t => Math.floor(t * BOIL + 1e-6);

// ---------- easing / timing ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const ease = {
  lin: k => k,
  inQ: k => k * k, outQ: k => 1 - (1 - k) * (1 - k),
  inOutQ: k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2,
  outC: k => 1 - Math.pow(1 - k, 3), inC: k => k * k * k,
  inOutC: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  outBack: (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
  outElastic: k => k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - .75) * (2 * Math.PI) / 3) + 1,
};
// progress of a tween window [a, a+d] with easing
const tw = (t, a, d, e = ease.outC) => e(inv(a, a + d, t));

// ---------- colour ----------
function hexToRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
function rgba(h, a = 1) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function mix(h1, h2, k) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], k)).toString(16).padStart(2, '0')).join('');
}

// Palette: warm storybook sepia with a clay-orange heroine accent.
const PAL = {
  paper: '#f1e6cc', paperDark: '#e2d1ab', ink: '#3b2a1e', inkSoft: '#6b5240',
  sepia: '#a07a4f', umber: '#7a5233', clay: '#d97757', clayDeep: '#b9573a',
  sage: '#8fa27c', teal: '#4f7d78', sky: '#b9cbc4', plum: '#6d4a5e',
  gold: '#d6a443', cream: '#fbf5e6', berry: '#c4383a', leaf: '#5d8a4a',
};

// ---------- offscreen cache ----------
const _cache = new Map();
function cached(key, w, h, draw) {
  let c = _cache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), c);
    _cache.set(key, c);
  }
  return c;
}

// ---------- value noise ----------
function makeNoise(seed) {
  const r = rng(seed), P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const sm = k => k * k * (3 - 2 * k);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = G[P[(xi & 255) + P[yi & 255]]], b = G[P[((xi + 1) & 255) + P[yi & 255]]];
    const c = G[P[(xi & 255) + P[(yi + 1) & 255]]], d = G[P[((xi + 1) & 255) + P[(yi + 1) & 255]]];
    const u = sm(xf), v = sm(yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  n2.fbm = (x, y, oct = 4) => { let s = 0, amp = .5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += amp * n2(x * f, y * f); n += amp; amp *= .5; f *= 2; } return s / n; };
  return n2;
}

// ---------- paper ----------
// A large warm paper sheet with mottling, fibres and faint foxing. Drawn once.
function paperTexture(seed = 'paper', w = W, h = H, base = PAL.paper) {
  return cached('paper:' + seed + w + 'x' + h + base, w, h, (g) => {
    const N = makeNoise(seed), r = rng(seed + 'f');
    const img = g.createImageData(w, h), d = img.data, [br, bg, bb] = hexToRgb(base);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const m = N.fbm(x / 420, y / 420, 4) - .5;          // big mottling
      const f = N.fbm(x / 9 + 100, y / 9, 2) - .5;         // fine tooth
      const k = 1 + m * .10 + f * .05;
      const i = (y * w + x) * 4;
      d[i] = br * k; d[i + 1] = bg * k * .995; d[i + 2] = bb * k * .985; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // fibres
    g.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, L = r.range(6, 28), a = r() * Math.PI * 2;
      g.strokeStyle = r() < .5 ? `rgba(255,250,235,${r.range(.08, .22)})` : `rgba(120,90,55,${r.range(.03, .08)})`;
      g.lineWidth = r.range(.4, 1.2);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * L / 2 + r.gauss() * 3, y + Math.sin(a) * L / 2 + r.gauss() * 3, x + Math.cos(a) * L, y + Math.sin(a) * L);
      g.stroke();
    }
    // foxing spots
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, R = r.range(8, 60);
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(150,105,55,${r.range(.03, .07)})`); gr.addColorStop(1, 'rgba(150,105,55,0)');
      g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
  });
}

// Grain overlay that changes on twos; drawn with 'overlay'-ish soft-light.
function grainTexture(n) {
  return cached('grain' + (n % 6), 960, 540, (g) => {
    const r = rng('grain' + n % 6), img = g.createImageData(960, 540), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = 128 + r.gauss() * 34; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
}

// Final grade: paper multiply, grain, warm vignette.
function finishFrame(ctx, t, opts = {}) {
  const { paper = .32, grain = .06, vignette = .32, warm = .05 } = opts;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = paper;
  ctx.drawImage(paperTexture('sheet'), 0, 0);
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = grain;
  ctx.drawImage(grainTexture(boilFrame(t)), 0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1;
  const v = cached('vig' + vignette, W, H, g => {
    const gr = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * 1.05);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, `rgba(${Math.round(255 * (1 - vignette))},${Math.round(240 * (1 - vignette))},${Math.round(215 * (1 - vignette))},1)`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
  ctx.drawImage(v, 0, 0);
  if (warm > 0) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = warm; ctx.fillStyle = '#e0a060'; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ---------- geometry helpers ----------
function polyCircle(cx, cy, rx, ry = rx, n = 24, rot = 0) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return p;
}
function polyRect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
// subdivide closed polygon with gaussian midpoint displacement (Hobbs-style watercolour)
function deform(poly, r, depth, amp) {
  let p = poly;
  for (let d = 0; d < depth; d++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const s = amp * len * .5;
      q.push(a, [mx + r.gauss() * s, my + r.gauss() * s]);
    }
    p = q; amp *= .62;
  }
  return p;
}
function tracePoly(g, p) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); }

// Watercolour wash: many translucent deformed layers. Returns nothing; draws into g.
function wash(g, poly, color, opts = {}) {
  const { seed = 'w', layers = 36, alpha = .045, spread = .9, depth = 5, edge = true } = opts;
  const r = rng(seed);
  const base = deform(poly, r, 2, spread * .6);
  g.save(); g.fillStyle = color;
  for (let i = 0; i < layers; i++) {
    g.globalAlpha = alpha * r.range(.6, 1.3);
    tracePoly(g, deform(base, r, depth - 2, spread * .45));
    g.fill();
  }
  if (edge) { // pigment pooling at the edge
    g.globalAlpha = alpha * 1.4; g.strokeStyle = color; g.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { tracePoly(g, deform(base, r, depth - 3, spread * .2)); g.stroke(); }
  }
  g.restore();
}

// ---------- ink lines ----------
// A wobbly hand-inked stroke along points, with pressure taper. Boils with `boil` seed.
function inkPath(g, pts, opts = {}) {
  const { width = 3, color = PAL.ink, seed = 'i', boil = 0, wobble = 1.1, taper = true, alpha = 1 } = opts;
  const r = rng(seed + ':' + boil);
  // resample
  const res = []; for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 8));
    for (let k = 0; k < n; k++) res.push([lerp(x0, x1, k / n), lerp(y0, y1, k / n)]);
  }
  res.push(pts[pts.length - 1]);
  const n = res.length;
  const ox = r.gauss() * wobble, oy = r.gauss() * wobble;
  const P = res.map(([x, y], i) => [x + ox + Math.sin(i * .35 + r() * 6) * wobble * .6, y + oy + Math.cos(i * .29 + r() * 6) * wobble * .6]);
  // build outline
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const k = i / (n - 1);
    const pr = taper ? Math.pow(Math.sin(Math.PI * clamp(k * .92 + .04)), .55) : 1;
    const w = width * .5 * pr * (1 + .12 * Math.sin(i * .7 + r() * 2));
    L.push([P[i][0] - dy * w, P[i][1] + dx * w]); R.push([P[i][0] + dy * w, P[i][1] - dx * w]);
  }
  g.save(); g.globalAlpha = alpha; g.fillStyle = color;
  g.beginPath(); g.moveTo(L[0][0], L[0][1]);
  for (const p of L) g.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath(); g.fill(); g.restore();
}
function inkPoly(g, poly, opts = {}) { inkPath(g, [...poly, poly[0]], { taper: false, ...opts }); }
// sample a cubic bezier into points
function bez(p0, p1, p2, p3, n = 24) {
  const o = []; for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    o.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return o;
}

// ---------- text ----------
function font(px, fam = 'EB Garamond', weight = 500, style = 'normal') { return `${style} ${weight} ${px}px "${fam}"`; }
function textCentered(g, s, x, y, f, color = PAL.ink) { g.save(); g.font = f; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(s, x, y); g.restore(); }
// typewriter reveal: returns substring visible at time t (cps chars/sec starting at t0)
function typed(s, t, t0, cps = 28) { return s.slice(0, Math.max(0, Math.floor((t - t0) * cps))); }
// word-wrap into lines for a max width
function wrap(g, s, maxW) {
  const words = s.split(' '), lines = []; let cur = '';
  for (const w of words) { const test = cur ? cur + ' ' + w : w; if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur); return lines;
}

// ---------- scene registry ----------
const SCENES = {};
function scene(name, fn) { SCENES[name] = fn; }

// chars.js — characters drawn in code (owner: character designer).
// Local coords for heads/busts: origin at the base of the neck, y down, head ~200 units tall at scale 1.
// Everything is a pure function of its arguments; line boil comes from boilFrame(t).
//
// ROUND 2 ADDITIONS (all optional; existing calls draw exactly where they did before):
//  * Every draw function (drawApprentice, drawProfessor, drawApprenticeFull, drawProfessorFull, drawTrunk, drawTownsfolk)
//    and charKit(g, t, s, opts) accept:
//      lineScale: multiplier on all ink widths (default 1), or 'auto' (thins lines progressively above 2x scale;
//                 use it for 4-7x close-ups, e.g. drawProfessor(g, x, y, 6.4, { ..., lineScale: 'auto' })).
//      detail:    0..1 close-up detail (lash strands, iris texture, brow hairs, hair strands, lens/rim highlights, nails).
//                 Default ramps in automatically from s = 3 to 4.5.
//      fine:      smooth corner-preserving curves + continuous wobble (default on at s >= 3).
//    drawLoosePetal(..., { lineScale }) too.
//  * drawSleeve(K, name, pts, rs, color, shade, cuffColor, capStart, seamless, opt) — opt: { folds, light, taper, button }.
//    Default sleeves now get a cel shadow band with fold "teeth", silhouette fold notches, elbow creases, a lit-edge
//    sheen, cuff bunching/seam/shadow and a slight taper to the wrist (folds fade out below ~10 px sleeve radius).
//  * drawHand: fingernails and knuckle light when the hand is large on screen.
//  * drawApprenticeFull poses: 'runSide' (8 drawings on twos; dir: 'right'|'left'; frame or t; hold: 1),
//      'runBack' (same cycle from behind), 'leap' (default from behind; yaw: PI/2 for profile; reachHand),
//      'bow' (bow: 0..1 amount, bowAngle (deg, 66), hands: 'front'|'side', dir; best at yaw >= .8, front views squash the head),
//      'kneel' (arms: 'lap'|'reach'|'clasp', reach: [y, z] body units, sit: 0 upright .. 1 on heels, lean (deg), dir).
//    Any v2 pose takes yaw to override the default camera, lean (deg) for the runs.
//  * drawProfessorFull poses: 'run' (3/4) / 'runSide' (6-drawing scurry; dir; trunk: true|false; specHand: false to drop the
//      hand-on-spectacles), 'kneel' (arms: 'lap'|'reach'|'trunk'|'clasp', reach, sit, lean, dir).
//  * pose.noPencil (drawProfessor, drawProfessorFull, drawHildeHead): the bun without the pencil.
//  * drawClaudeHead(K, P, layer) with P.back = true draws the back of her head (used by the views from behind).
//  * claudePetalWorld / apprenticeFullHeadToScreen understand the v2 poses.

// =====================================================================================
// Toolkit
// =====================================================================================

// Tileable warm pigment texture used as a multiply pattern inside fills.
function charTexture() {
  return cached('chartex', 512, 512, (g) => {
    const r = rng('chartex'), img = g.createImageData(512, 512), d = img.data;
    const grid = (G) => { const a = new Float32Array(G * G); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
    const oct = [[8, .5, grid(8)], [16, .28, grid(16)], [64, .14, grid(64)], [128, .08, grid(128)]];
    const sm = k => k * k * (3 - 2 * k);
    const val = (G, a, x, y) => {
      const fx = x * G / 512, fy = y * G / 512, xi = Math.floor(fx), yi = Math.floor(fy), u = sm(fx - xi), v = sm(fy - yi);
      const A = a[(yi % G) * G + xi % G], B = a[(yi % G) * G + (xi + 1) % G], C = a[((yi + 1) % G) * G + xi % G], D = a[((yi + 1) % G) * G + (xi + 1) % G];
      return lerp(lerp(A, B, u), lerp(C, D, u), v);
    };
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      let n = 0; for (const [G, amp, a] of oct) n += amp * val(G, a, x, y);
      const k = 1 - Math.max(0, n - .25) * .55;       // 0.6..1
      const i = (y * 512 + x) * 4;
      d[i] = 255 * (1 - (1 - k) * .55); d[i + 1] = 255 * (1 - (1 - k) * .85); d[i + 2] = 255 * (1 - (1 - k) * 1.0); d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function _texPattern(g) { return g.createPattern(charTexture(), 'repeat'); }

// Legacy-compatible painted fill (used by scenes/test.js).
function paintFill(g, pathFn, color, opts = {}) {
  const { tex = .22, shade = null, shadeFn = null } = opts;
  g.save();
  pathFn(g); g.fillStyle = color; g.fill();
  g.clip();
  if (shade && shadeFn) { g.fillStyle = shade; shadeFn(g); }
  if (tex > 0) {
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = Math.min(1, tex * 1.6);
    g.fillStyle = _texPattern(g); g.fillRect(-4000, -4000, 8000, 8000);
  }
  g.restore();
}
function pigmentTexture() { return charTexture(); }
const P2 = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
const P2open = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); };

// one hair "petal": a teardrop from base point along angle a (legacy signature; test.js uses it for leaves)
function petal(cx, cy, a, r0, L, w, curl = 0) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const b = [cx + dx * r0, cy + dy * r0], tip = [cx + dx * (r0 + L) + nx * curl, cy + dy * (r0 + L) + ny * curl];
  const m1 = [cx + dx * (r0 + L * .55) + nx * w, cy + dy * (r0 + L * .55) + ny * w];
  const m2 = [cx + dx * (r0 + L * .55) - nx * w, cy + dy * (r0 + L * .55) - ny * w];
  return [...bez(b, [b[0] + nx * w * .9, b[1] + ny * w * .9], m1, tip, 10), ...bez(tip, m2, [b[0] - nx * w * .9, b[1] - ny * w * .9], b, 10).slice(1)];
}

// Catmull-Rom spline through points (closed or open). seg = samples per span.
function crSpline(pts, closed = true, seg = 6) {
  const n = pts.length, out = [];
  const get = i => closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
const chTr = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
const chRot = (pts, a, cx = 0, cy = 0) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
const chScl = (pts, sx, sy = sx, cx = 0, cy = 0) => pts.map(([x, y]) => [cx + (x - cx) * sx, cy + (y - cy) * sy]);
const chMirX = pts => pts.map(([x, y]) => [-x, y]);

// A tapered petal/leaf shape along a (possibly bent) spine. ang: canvas radians base->tip.
function petalShape(bx, by, ang, len, w, bend = 0, n = 12, opts = {}) {
  const { waist = .38, peak = .58, tipPow = .75 } = opts;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const spine = s => [bx + dx * len * s + nx * bend * len * s * s, by + dy * len * s + ny * bend * len * s * s];
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const s = Math.sin(i / n * Math.PI / 2) * .35 + (i / n) * .65;
    const f = s < peak ? waist + (1 - waist) * Math.pow(Math.sin(Math.PI / 2 * s / peak), .9) : Math.pow(Math.max(0, 1 - Math.pow((s - peak) / (1 - peak), 2)), tipPow);
    const [px, py] = spine(s);
    // local normal from spine derivative
    const tx = dx + 2 * nx * bend * s, ty = dy + 2 * ny * bend * s, tl = Math.hypot(tx, ty);
    const qx = -ty / tl, qy = tx / tl, hw = w * f;
    L.push([px + qx * hw, py + qy * hw]); R.push([px - qx * hw, py - qy * hw]);
  }
  return [...L, ...R.reverse().slice(1)];
}

// ---- Fine line mode (large scale) ---------------------------------------------------------------
// At large scale (close-ups) polylines are densified with a corner-preserving Catmull-Rom spline and inked
// with a smooth, low-frequency wobble, so curves stay round and lines stay clean at 4-7x.
function _chSmooth(pts, closed = false, step = 2, maxSeg = 10) {
  const n = pts.length;
  if (n < 3) return pts;
  const ang = i => {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-6 || lv < 1e-6) return 0;
    return Math.acos(clamp((ux * vx + uy * vy) / (lu * lv), -1, 1));
  };
  const sharp = i => ang(i) > 1.0;
  const runSpline = (seg) => {
    let L = 0; for (let i = 1; i < seg.length; i++) L = Math.max(L, Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
    const k = Math.max(1, Math.min(maxSeg, Math.ceil(L / step)));
    return k <= 1 || seg.length < 3 ? seg.slice() : crSpline(seg, false, k);
  };
  if (!closed) {
    const out = []; let cur = [pts[0]];
    for (let i = 1; i < n; i++) { cur.push(pts[i]); if (i < n - 1 && sharp(i)) { const s = runSpline(cur); out.push(...(out.length ? s.slice(1) : s)); cur = [pts[i]]; } }
    const s = runSpline(cur); out.push(...(out.length ? s.slice(1) : s));
    return out;
  }
  // closed: start at a sharp corner if there is one, so pieces break there
  let s0 = -1; for (let i = 0; i < n; i++) if (sharp(i)) { s0 = i; break; }
  if (s0 < 0) {
    let L = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; L = Math.max(L, Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const k = Math.max(1, Math.min(maxSeg, Math.ceil(L / step)));
    return k <= 1 ? pts : crSpline(pts, true, k);
  }
  const rot = [...pts.slice(s0), ...pts.slice(0, s0), pts[s0]];
  const out = _chSmooth(rot, false, step, maxSeg); out.pop();
  return out;
}
// Smooth ink stroke (same look as inkPath, but the wobble is continuous along the arc, never jaggy).
function _chInkSmooth(g, pts, o = {}) {
  const { width = 3, color = '#4a2c1c', seed = 'i', boil = 0, wobble = 1, taper = true, alpha = 1 } = o;
  if (pts.length < 2) return;
  const r = rng(seed + ':' + boil);
  const n = pts.length, S = [0];
  for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = S[n - 1] || 1;
  const ox = r.gauss() * wobble, oy = r.gauss() * wobble, p1 = r() * 6.3, p2 = r() * 6.3, p3 = r() * 6.3, fr = 1 / (36 + r() * 30);
  const P = pts.map(([x, y], i) => [x + ox + Math.sin(S[i] * fr * 6.3 + p1) * wobble * .45, y + oy + Math.cos(S[i] * fr * 5.1 + p2) * wobble * .45]);
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const k = S[i] / tot;
    const pr = taper ? Math.pow(Math.sin(Math.PI * clamp(k * .92 + .04)), .55) : 1;
    const w = width * .5 * pr * (1 + .1 * Math.sin(S[i] / 9 + p3));
    L.push([P[i][0] - dy * w, P[i][1] + dx * w]); R.push([P[i][0] + dy * w, P[i][1] - dx * w]);
  }
  g.save(); g.globalAlpha = alpha; g.fillStyle = color;
  g.beginPath(); g.moveTo(L[0][0], L[0][1]);
  for (const p of L) g.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath(); g.fill(); g.restore();
}
// lineScale: a multiplier on every ink width (default 1). 'auto' thins lines progressively above 2x scale.
function _chLineScale(v, s) { return v === 'auto' ? (s > 2 ? Math.pow(2 / s, .62) : 1) : (v == null ? 1 : +v); }

// Drawing kit bound to a context, time and scale.  K.ink / K.fill / K.shape keep seeds stable per part name.
// opts: line, seed, boil, lineScale (multiplier, or 'auto'), fine (smooth curves; default on at s >= 3),
//       detail (0..1 extra close-up detail: lash strands, iris texture, hair strands; default ramps in from s = 3 to 4.5).
function charKit(g, t, s, opts = {}) {
  const bf = opts.boil != null ? opts.boil : boilFrame(t);
  const ls = _chLineScale(opts.lineScale, s);
  const lwm = Math.min(2.4, Math.max(1, Math.pow(Math.max(s, .05), -.6))) * ls;
  const line = opts.line || '#4a2c1c', pre = opts.seed || 'c';
  const fine = opts.fine != null ? !!opts.fine : s >= 3;
  const detail = opts.detail != null ? clamp(+opts.detail) : clamp((s - 3) / 1.5);
  const step = 2.2 / Math.max(1, s);     // ~2.2 screen px between smoothed samples
  const pat = _texPattern(g);
  const K = {
    g, bf, s, lwm, ls, line, fine, detail,
    smooth(pts, closed = false) { return fine ? _chSmooth(pts, closed, step) : pts; },
    ink(name, pts, w = 2.6, o = {}) {
      if (!pts || pts.length < 2) return;
      if (fine) { _chInkSmooth(g, o.noSmooth ? pts : _chSmooth(pts, false, step), { width: w * lwm, color: line, seed: pre + name, boil: bf, wobble: .4 * lwm, ...o }); return; }
      inkPath(g, pts, { width: w * lwm, color: line, seed: pre + name, boil: bf, wobble: .45 * lwm, ...o });
    },
    loop(name, pts, w = 2.6, o = {}) {
      if (fine) { const q = _chSmooth(pts, true, step); K.ink(name, [...q, q[0], q[1]], w, { taper: false, noSmooth: true, ...o }); return; }
      K.ink(name, [...pts, pts[0], pts[1]], w, { taper: false, ...o });
    },
    fill(pts, color, o = {}) {
      const { tex = .2, shade = null, alpha = 1 } = o;
      if (fine) pts = _chSmooth(pts, true, step);
      g.save(); g.globalAlpha = alpha;
      P2(g, pts); g.fillStyle = color; g.fill();
      if (shade || tex > 0) {
        g.clip();
        if (shade) shade(g);
        if (tex > 0) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = alpha * tex; g.fillStyle = pat; g.fillRect(-3000, -3000, 6000, 6000); }
      }
      g.restore();
    },
    shape(name, pts, color, o = {}) { K.fill(pts, color, o); if (o.lw !== 0) K.loop(name, pts, o.lw || 2.6, o.inkOpts || {}); },
    // shade inside a clip: fill pts with colour
    clipFill(clipPts, pts, color, alpha = 1) { g.save(); P2(g, K.smooth(clipPts, true)); g.clip(); g.globalAlpha = alpha; g.fillStyle = color; P2(g, pts); g.fill(); g.restore(); },
    dot(x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); },
    ell(x, y, rx, ry, color, a = 0) { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), a, 0, 7); g.fill(); },
    // a fine hair-line (close-up detail): thin tapered stroke whose weight does not grow with scale
    hair(name, pts, w = .7, o = {}) { K.ink(name, pts, w, { taper: true, ...o }); },
  };
  return K;
}

// Kit options forwarded from a pose/options object: lineScale, detail, fine (all optional).
function _chKitOpts(o = {}) { const r = {}; if (o.lineScale != null) r.lineScale = o.lineScale; if (o.detail != null) r.detail = o.detail; if (o.fine != null) r.fine = o.fine; return r; }

// Soft radial blush.
function _chBlush(g, x, y, rx, ry, color, a) {
  if (a <= 0) return;
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, rgba(color, a)); gr.addColorStop(.6, rgba(color, a * .55)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
}

// =====================================================================================
// Expressions
// =====================================================================================
// Each expression is a preset of: eyes ('open'|'wide'|'happy'|'closed'|'laugh'|'teary'|'narrow'),
// mouth ('smile'|'open'|'o'|'grin'|'laugh'|'flat'|'wavy'|'frown'|'smirk'|'soft'|'cat'), brow (raise -1..1),
// browTilt (+ worried / - cross), lid (0..1 extra upper-lid droop), blush, extras.
const EXPR = {
  neutral:    { eyes: 'open', mouth: 'smile', brow: 0, browTilt: 0 },
  talk:       { eyes: 'open', mouth: 'open', talk: .6, brow: .15, browTilt: 0 },
  surprised:  { eyes: 'wide', mouth: 'o', brow: 1, browTilt: .15 },
  joy:        { eyes: 'happy', mouth: 'grin', brow: .5, browTilt: 0, blush: .75 },
  determined: { eyes: 'open', mouth: 'smirk', brow: -.35, browTilt: -1, lid: .28, look: [0, -.1] },
  worried:    { eyes: 'open', mouth: 'wavy', brow: .35, browTilt: 1, lid: .12, look: [0, .3], sweat: true },
  laugh:      { eyes: 'laugh', mouth: 'laugh', brow: .55, browTilt: .3, blush: .85 },
  proud:      { eyes: 'happy', mouth: 'soft', brow: .3, browTilt: .1, blush: .6 },
  teary:      { eyes: 'teary', mouth: 'wobble', brow: .45, browTilt: .9, blush: .7, tears: true },
  sad:        { eyes: 'open', mouth: 'frown', brow: .2, browTilt: 1, lid: .3, look: [0, .5] },
  sing:       { eyes: 'happy', mouth: 'open', talk: .85, brow: .5, browTilt: .1, blush: .6 },
  shout:      { eyes: 'closed', mouth: 'laugh', brow: -.2, browTilt: -.6, blush: .5 },
};
function resolveExpr(pose) {
  const e = EXPR[pose.expr || 'neutral'] || EXPR.neutral;
  const out = { ...e, ...pose };
  if (pose.mouth == null && pose.talk != null && pose.talk > 0 && (e.mouth === 'smile' || e.mouth === 'soft')) out.mouth = 'open';
  return out;
}

// Generic mouth. (mx,my) centre, ws horizontal squash for head turn, k scale.
function drawMouth(K, mx, my, P, k = 1, ws = 1, pal = {}) {
  const { g } = K;
  const m = P.mouth || 'smile', talk = P.talk == null ? .6 : P.talk;
  const dark = pal.mouthDark || '#7a2c24', tongue = pal.tongue || '#e27a6c', teeth = '#fffaf2';
  const X = x => mx + x * k * ws, Y = y => my + y * k;
  const openShape = (w, h, top = 2, smile = 0) => {
    // D-shaped open mouth: top edge curves up at corners by `smile`, bottom deep curve
    const pts = [...bez([X(-w), Y(-smile)], [X(-w * .4), Y(top)], [X(w * .4), Y(top)], [X(w), Y(-smile)], 10),
      ...bez([X(w), Y(-smile)], [X(w * .85), Y(h * .9)], [X(-w * .85), Y(h * .9)], [X(-w), Y(-smile)], 12).slice(1)];
    return pts;
  };
  const fillMouth = (pts, tongueY, tw, th, teethH = 0) => {
    g.save(); P2(g, pts); g.fillStyle = dark; g.fill(); g.clip();
    if (teethH > 0) { g.fillStyle = teeth; g.fillRect(X(-40), Y(-20), 80 * k * ws, (20 + teethH) * k); }
    K.ell(X(0), Y(tongueY), tw * k * ws, th * k, tongue);
    g.restore();
  };
  const lw = 2.3 * k;
  switch (m) {
    case 'open': case 'talk': {
      const a = clamp(talk), w = 9 + 4 * a, h = 3 + 15 * a;
      if (a < .08) { K.ink('m-sm', bez([X(-10), Y(-1)], [X(-4), Y(4)], [X(4), Y(4)], [X(10), Y(-1)], 10), lw); break; }
      const pts = openShape(w, h, 1.5, 1.5);
      fillMouth(pts, h * .78, w * .6, h * .32);
      K.ink('m-op', pts.slice(0, 11), lw * .9); K.ink('m-opb', pts.slice(10), lw * .6, { alpha: .7 });
      break;
    }
    case 'o': {
      const pts = crSpline([[X(-6), Y(1)], [X(0), Y(-5)], [X(6), Y(1)], [X(4.5), Y(9)], [X(0), Y(11)], [X(-4.5), Y(9)]], true, 5);
      fillMouth(pts, 9, 4, 2.5); K.loop('m-o', pts, lw * .85); break;
    }
    case 'grin': case 'sing': {
      const pts = openShape(17, 18, 3, 5);
      fillMouth(pts, 15, 10, 6, 1.5);
      K.ink('m-gt', pts.slice(0, 11), lw); K.ink('m-gb', pts.slice(10), lw * .7, { alpha: .8 });
      break;
    }
    case 'laugh': {
      const pts = openShape(20, 26, 3, 6);
      fillMouth(pts, 21, 12, 8, 2);
      K.ink('m-lt', pts.slice(0, 11), lw); K.ink('m-lb', pts.slice(10), lw * .7, { alpha: .8 });
      break;
    }
    case 'flat': K.ink('m-f', [[X(-7), Y(2)], [X(0), Y(2.6)], [X(7), Y(2)]], lw); break;
    case 'wavy': K.ink('m-w', crSpline([[X(-10), Y(3)], [X(-5), Y(0)], [X(0), Y(3)], [X(5), Y(0)], [X(10), Y(3)]], false, 5), lw * .95); break;
    case 'wobble': {
      K.ink('m-wb', crSpline([[X(-11), Y(0)], [X(-6), Y(3)], [X(-1), Y(1.5)], [X(4), Y(3.5)], [X(11), Y(0)]], false, 5), lw * .95); break;
    }
    case 'frown': K.ink('m-fr', bez([X(-9), Y(4)], [X(-4), Y(-1)], [X(4), Y(-1)], [X(9), Y(4)], 8), lw); break;
    case 'smirk': {
      K.ink('m-sk', bez([X(-9), Y(1)], [X(-2), Y(4)], [X(5), Y(3)], [X(10), Y(-3)], 10), lw);
      K.ink('m-sk2', [[X(9), Y(-5)], [X(11.5), Y(-1.5)]], lw * .6, { alpha: .7 });
      break;
    }
    case 'soft': K.ink('m-so', bez([X(-13), Y(-2)], [X(-5), Y(5)], [X(5), Y(5)], [X(13), Y(-2)], 10), lw); break;
    case 'cat': K.ink('m-cat', crSpline([[X(-10), Y(-1)], [X(-5), Y(4)], [X(0), Y(0)], [X(5), Y(4)], [X(10), Y(-1)]], false, 5), lw); break;
    default: { // smile, with a tiny open triangle when talk>0
      K.ink('m-sm', bez([X(-11), Y(-1.5)], [X(-4), Y(4.5)], [X(4), Y(4.5)], [X(11), Y(-1.5)], 10), lw);
    }
  }
}

// =====================================================================================
// CLAUDE — the apprentice
// =====================================================================================
const CLAUDE = {
  hair: '#d97757', hairDeep: '#b9573a', hairDark: '#9a4428', hairLight: '#f2a37c', hairLine: '#8a3a20',
  skin: '#ffe4cc', skinShade: '#f7b89c', skinDeep: '#e9967c', blush: '#f37f74',
  iris: '#cc6c2a', irisDeep: '#6a2810', irisLight: '#f6c066', line: '#4a2c1c', brow: '#7a3820',
  jacket: '#f7efdc', jacketShade: '#e2cfae', jacketDeep: '#c9b08a', trim: '#d97757', ribbon: '#4f7d78', ribbonDeep: '#36605b',
  strap: '#8a5a36', strapDeep: '#6a4026', satchel: '#a06a3c', star: '#fff3cf', starShade: '#efc86a',
  skirt: '#3f6b66', skirtShade: '#2d504c', sock: '#f3ead8', boot: '#8a5232', bootDeep: '#5e3420', tights: '#5c3c30', tightsDeep: '#43291f',
};

// Head geometry (front view)
const CL_HEAD = { cx: 0, cy: -150, hairC: [0, -170] };

// Petal ring layout for the sunflower bob. idx: stable index for the FX "loose petal" API.
function claudePetalLayout() {
  if (claudePetalLayout._c) return claudePetalLayout._c;
  const out = [];
  // back ring (darker) and front ring offset by half a step. Bottom petals are longer: the bob flares out at the jaw.
  const N0 = 12, st = 300 / N0;
  // outer radius profile: tall crown, slightly tucked sides, flared bob ends
  const Rof = A => 150 + 10 * Math.cos(A * Math.PI / 180 * 2) * (A < 90 ? 1 : 0) - (A > 60 && A < 115 ? 12 * Math.sin((A - 60) / 55 * Math.PI) : 0) + (A > 115 ? (A - 115) * .5 : 0);
  for (let i = 0; i <= N0; i++) { const a = -150 + i * st, A = Math.abs(a); out.push({ ring: 0, a, r0: 50, len: Rof(A) - 50 + 6, w: 23 }); }
  for (let i = 0; i < N0; i++) { const a = -150 + st / 2 + i * st, A = Math.abs(a); out.push({ ring: 1, a, r0: 48, len: Rof(A) - 48 - 8, w: 24 }); }
  out.forEach((p, i) => p.idx = i);
  claudePetalLayout._c = out;
  return out;
}

// Returns the drawn shape of hair petal `p` for this pose (local coords).
function _claudePetalPts(p, P) {
  const [hx, hy] = CL_HEAD.hairC, f = P.frame || 0;
  const wind = P.wind || [0, 0], flut = P.flutter || 0, splay = P.splay || 0;
  let a = p.a;
  // splay pushes petals outward from vertical; wind bends toward direction
  a += Math.sign(a) * splay * 12 * (1 - Math.abs(Math.abs(a) - 90) / 90 * .4);
  const ang = a * Math.PI / 180 - Math.PI / 2;
  const wx = wind[0], wy = wind[1];
  // bend: tangential component of wind
  const tx = -Math.sin(ang), ty = Math.cos(ang);
  let bend = (wx * tx + wy * ty) * .35 + flut * .12 * Math.sin(f * 2.1 + p.idx * 1.7);
  // bob ends curl inward toward the face
  if (Math.abs(p.a) > 110) bend += -Math.sign(p.a) * .18;
  const stretch = 1 + (wx * Math.cos(ang) + wy * Math.sin(ang)) * .12 + flut * .03 * Math.sin(f * 1.3 + p.idx);
  return petalShape(hx + Math.cos(ang) * p.r0, hy + Math.sin(ang) * p.r0, ang, p.len * stretch, p.w, bend, 22, { waist: .5, peak: .6, tipPow: .5 });
}

// Public: info about hair petal i so FX can emit a matching loose petal.
// Returns { pts (local, relative to petal centre, pointing up), x, y (centre, local head coords), angle, len, w, color, shade, line }
function claudeHairPetal(i, pose = {}) {
  const L = claudePetalLayout(), p = L[((i % L.length) + L.length) % L.length];
  const pts = _claudePetalPts(p, pose);
  let cx = 0, cy = 0; for (const q of pts) { cx += q[0]; cy += q[1]; } cx /= pts.length; cy /= pts.length;
  const ang = p.a * Math.PI / 180 - Math.PI / 2;
  return { idx: p.idx, ring: p.ring, x: cx, y: cy, angle: ang, len: p.len, w: p.w, pts: pts.map(([x, y]) => [x - cx, y - cy]),
    color: p.ring ? CLAUDE.hair : CLAUDE.hairDeep, light: CLAUDE.hairLight, shade: CLAUDE.hairDark, line: CLAUDE.line };
}
function claudePetalCount() { return claudePetalLayout().length; }

// Draw a single loose sunflower petal (for FX): centred at (x,y), rotation a, length L (screen px).
function drawLoosePetal(g, x, y, a = 0, L = 60, opts = {}) {
  const { color = CLAUDE.hair, light = CLAUDE.hairLight, line = CLAUDE.line, t = 0, seed = 'lp', flip = 1, curl = .12, lineW = null, alpha = 1, lineScale = 1 } = opts;
  const lsc = _chLineScale(lineScale, L / 60);
  const w = L * .24;
  const pts = petalShape(0, L * .5, -Math.PI / 2, L, w, curl * flip, 16, { waist: .3, peak: .58, tipPow: .55 });
  g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha = alpha;
  P2(g, pts);
  const gr = g.createLinearGradient(0, L * .5, 0, -L * .5); gr.addColorStop(0, mix(color, CLAUDE.hairDark, .35)); gr.addColorStop(.7, color); gr.addColorStop(1, light);
  g.fillStyle = gr; g.fill();
  inkPath(g, [...pts, pts[0], pts[1]], { width: (lineW || Math.max(1.2, L * .045)) * lsc, color: line, seed, boil: boilFrame(t), wobble: L * .006, taper: false });
  inkPath(g, [[0, L * .4], [curl * flip * L * .3, -L * .1]], { width: Math.max(.8, L * .025) * lsc, color: CLAUDE.hairLine, seed: seed + 'v', boil: boilFrame(t), wobble: L * .004, alpha: .55 });
  g.restore();
}

// Fine strands inside a petal/lock polygon (close-up detail): lines between its two long edges.
function _chPetalStrands(K, name, pts, color, a) {
  const n = pts.length, h = Math.floor(n / 2), r = rng(name);
  const Ls = pts.slice(0, h + 1), Rs = pts.slice(h).reverse();
  const m = Math.min(Ls.length, Rs.length);
  for (let j = 0; j < 3; j++) {
    const f = [.28, .52, .74][j] + (r() - .5) * .08, line = [];
    const i0 = Math.floor(m * (.1 + r() * .08)), i1 = Math.floor(m * (.78 + r() * .12));
    for (let i = i0; i <= i1; i++) { const A = Ls[Math.min(i, Ls.length - 1)], B = Rs[Math.min(i, Rs.length - 1)]; line.push([lerp(A[0], B[0], f), lerp(A[1], B[1], f)]); }
    if (line.length > 1) K.hair(name + j, line, .6 + r() * .3, { color, alpha: a * (j === 1 ? .38 : .28) });
  }
}

function _claudeBackHair(K, P) {
  const C = CLAUDE, L = claudePetalLayout(), miss = P.missing || [];
  const [hx, hy] = CL_HEAD.hairC, g = K.g;
  const turnShift = (P.turn || 0) * -22;
  g.save(); g.translate(turnShift, 0);
  const vis = L.filter(p => !miss.includes(p.idx));
  const shapes = new Map(vis.map(p => [p.idx, _claudePetalPts(p, P)]));
  // pass 1: bold brown silhouette (only the outer edge survives the fills)
  for (const p of vis) K.loop('hs' + p.idx, shapes.get(p.idx), 5.6);
  for (const ring of [0, 1]) {
    const gr = g.createRadialGradient(hx, hy, 30, hx, hy, 175);
    if (ring === 0) { gr.addColorStop(0, C.hairDark); gr.addColorStop(.55, mix(C.hairDeep, C.hairDark, .35)); gr.addColorStop(1, C.hairDeep); }
    else { gr.addColorStop(0, C.hairDeep); gr.addColorStop(.5, C.hair); gr.addColorStop(.95, mix(C.hair, C.hairLight, .6)); }
    const ps = vis.filter(p => p.ring === ring).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
    for (const p of ps) {
      const pts = shapes.get(p.idx);
      K.fill(pts, gr, { tex: .22 });
      K.loop('hp' + p.idx, pts, 2.1, { color: ring ? C.hairLine : '#6c2a14' });
      if (K.detail > 0) _chPetalStrands(K, 'hps' + p.idx, pts, ring ? C.hairLine : '#5c220f', K.detail);
      if (ring) {
        const n = pts.length, h = Math.floor(n / 2);
        const q1 = pts[Math.floor(h * .55)], q2 = pts[Math.floor(h * .85)], m1 = pts[n - 1 - Math.floor(h * .55)], m2 = pts[n - 1 - Math.floor(h * .85)];
        K.ink('hv' + p.idx, [[lerp(q1[0], m1[0], .3), lerp(q1[1], m1[1], .3)], [lerp(q2[0], m2[0], .3), lerp(q2[1], m2[1], .3)]], 3, { color: C.hairLight, alpha: .55 });
      }
    }
  }
  g.restore();
}

function _claudeSideLock(K, P, side, ox, wk = 1) {
  const C = CLAUDE, g = K.g;
  const pts = petalShape(ox - side * 2, -214, Math.PI / 2 + side * .06, 124, 15.5 * wk, side * .2, 14, { waist: .3, peak: .5 });
  const gr = g.createLinearGradient(0, -200, 0, -80); gr.addColorStop(0, C.hairDeep); gr.addColorStop(.6, C.hair); gr.addColorStop(1, mix(C.hair, C.hairLight, .5));
  K.fill(pts, gr, { tex: .22 }); K.loop('sl' + side, pts, 2.6);
  K.ink('slv' + side, [[ox + side * 1, -170], [ox - side * 4, -110]], 1.4, { color: C.hairLine, alpha: .45 });
  if (K.detail > 0) _chPetalStrands(K, 'sls' + side, pts, C.hairLine, K.detail);
}

// Bang (fringe) lower edge: rounded tips, sharp notches.
function _bangEdge(tips, notches) {
  // tips: n points, notches: n-1 points between them. Returns polyline from tips[0] to tips[n-1].
  const out = [];
  for (let i = 0; i < tips.length; i++) {
    const T = tips[i];
    if (i > 0) {
      const N = notches[i - 1];
      out.push(...bez(N, [N[0] + (T[0] - N[0]) * .08, N[1] + (T[1] - N[1]) * .55], [T[0] - (T[0] - N[0]) * .55, T[1]], T, 8).slice(1));
    }
    if (i < tips.length - 1) {
      const N = notches[i];
      out.push(...bez(T, [T[0] + (N[0] - T[0]) * .55, T[1]], [N[0] - (N[0] - T[0]) * .08, N[1] + (T[1] - N[1]) * .55], N, 8).slice(i === 0 && out.length === 0 ? 0 : 1));
    }
  }
  return out;
}

// Face outline for a head with yaw `turn` (-0.6..0.6).
function _faceOutline(base, turn, cy) {
  if (!turn) return base;
  const sn = Math.sin(turn);
  return base.map(([x, y]) => {
    const w = clamp((y - (cy - 30)) / 80);       // 0 at cheekbones, 1 at chin
    const far = Math.sign(x) === -Math.sign(sn) ? 1 : 0;
    let nx = x + sn * 26 * w;
    if (far) nx = nx * (1 - Math.abs(sn) * .22 * (.4 + w));
    return [nx, y];
  });
}
// Feature x under yaw: sphere projection. returns [x', widthScale]
function _yawX(x, turn, R = 96) {
  const ph = Math.asin(clamp(x / R, -.99, .99)), q = ph + turn;
  return [R * Math.sin(q), Math.max(.15, Math.cos(q) / Math.cos(ph))];
}

function _claudeEye(K, ex, ey, side, ws, P, C) {
  const { g } = K;
  const mode = P.eyes || 'open';
  const blink = P.blink || 0, look = P.look || [0, 0];
  const lid = P.lid || 0;
  const S = (x) => ex + side * x * ws;     // x>0 = outward
  if (mode === 'happy' || (mode !== 'laugh' && blink >= .85 && false)) {
    const pts = bez([S(-18), ey + 4], [S(-10), ey - 12], [S(10), ey - 13], [S(20), ey + 1], 12);
    K.ink('eh' + side, pts, 5.4);
    if (K.detail > 0) _chLashes(K, 'clh' + side, pts, 4, 4.5, 1, .55, 1, side, -1, K.detail * .8);
    K.ink('ehl' + side, [[S(19), ey], [S(25), ey - 4]], 2.4);
    return;
  }
  if (mode === 'laugh') {   // > <
    K.ink('el' + side, [[S(16), ey - 12], [S(-12), ey - 1], [S(16), ey + 9]], 5, { taper: true });
    return;
  }
  if (mode === 'closed' || blink >= .85) {
    const arc = bez([S(-19), ey + 1], [S(-8), ey + 10], [S(8), ey + 10], [S(21), ey - 1], 12);
    K.ink('ec' + side, arc, 5);
    if (K.detail > 0) _chLashes(K, 'clc' + side, arc, 5, 5, 1, .45, 1, side, 1, K.detail * .85);
    K.ink('ecl' + side, [[S(20), ey - 1], [S(26), ey - 5]], 2.3);
    return;
  }
  const wide = mode === 'wide';
  const open = clamp(1 - blink) * (mode === 'narrow' ? .7 : 1);
  const w = 21, h = (wide ? 27 : 25) * open;
  const top = ey - h * .95, bot = ey + h * .9;
  // eye white shape (in outward-positive coords)
  const shapeO = [...bez([S(-20), ey + 2], [S(-17), top + 2], [S(14), top - 3], [S(22), ey - h * .45], 12),
    ...bez([S(22), ey - h * .45], [S(24), ey + h * .5], [S(10), bot + 1], [S(-2), bot], 10).slice(1),
    ...bez([S(-2), bot], [S(-14), bot - 1], [S(-20), ey + h * .5], [S(-20), ey + 2], 8).slice(1)];
  g.save();
  P2(g, shapeO); g.fillStyle = '#fffaf3'; g.fill(); g.clip();
  // iris
  const ix = ex + look[0] * 6 * ws + side * 1 * ws, iy = ey + 3 + look[1] * 5;
  const irx = (wide ? 11 : 15) * ws, iry = wide ? 14 : 19.5;
  const gr = g.createLinearGradient(0, iy - iry, 0, iy + iry);
  gr.addColorStop(0, C.irisDeep); gr.addColorStop(.42, C.iris); gr.addColorStop(1, C.irisLight);
  g.beginPath(); g.ellipse(ix, iy, irx, iry, 0, 0, 7); g.fillStyle = gr; g.fill();
  g.lineWidth = 1.6 * K.ls; g.strokeStyle = C.irisDeep; g.stroke();
  _chIrisTexture(K, 'c' + side, ix, iy, irx, iry, (wide ? 3.6 : 6) * 1.05, C.irisDeep, '#ffe6a8', K.detail * .85);
  // starburst
  g.save(); g.globalAlpha = .75; g.fillStyle = '#ffe9b0';
  const pr = wide ? 3.6 : 6;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + Math.PI / 8, a1 = a - .13, a2 = a + .13, ro = k % 2 ? .62 : .84;
    g.beginPath(); g.moveTo(ix + Math.cos(a1) * pr * ws, iy + Math.sin(a1) * pr * 1.2);
    g.lineTo(ix + Math.cos(a) * irx * ro, iy + Math.sin(a) * iry * ro);
    g.lineTo(ix + Math.cos(a2) * pr * ws, iy + Math.sin(a2) * pr * 1.2); g.closePath(); g.fill();
  }
  g.restore();
  K.ell(ix, iy, pr * ws * 1.05, pr * 1.3, '#3a160a');
  // lid shadow on the white
  g.fillStyle = 'rgba(214,140,110,.33)'; g.beginPath(); g.ellipse(ex, top - 2, 30 * ws, 9 + 2 * open, 0, 0, 7); g.fill();
  // highlights
  K.ell(ix - 5.5 * ws, iy - iry * .45, (wide ? 3.5 : 5.6) * ws, wide ? 4 : 6.4, '#ffffff');
  K.ell(ix + 5 * ws, iy + iry * .45, 2.4 * ws, 2.4, 'rgba(255,255,255,.9)');
  if (mode === 'teary') {
    K.ell(ix + 3 * ws, iy - iry * .1, 3 * ws, 3, '#ffffff');
    g.fillStyle = 'rgba(190,230,240,.55)'; g.beginPath(); g.ellipse(ex, bot - 2, 24 * ws, 6, 0, 0, 7); g.fill();
  }
  // extra lid droop (determined / tired)
  if (lid > 0) {
    const inner = top + h * (lid * 1.6), outer = top + h * lid * .5;
    g.fillStyle = C.skin; g.beginPath(); g.moveTo(S(-26), top - 10); g.lineTo(S(28), top - 10); g.lineTo(S(28), outer); g.lineTo(S(-26), inner); g.closePath(); g.fill();
  }
  g.restore();
  // lash line (thick upper lid)
  let L1 = bez([S(-21), ey + 3], [S(-18), top + 1], [S(13), top - 4], [S(23), ey - h * .45], 14);
  if (lid > 0) { const inner = top + h * (lid * 1.6), outer = top + h * lid * .5; L1 = [[S(-21), inner + 2], [S(-6), lerp(inner, outer, .4)], [S(10), lerp(inner, outer, .75) - 1], [S(23), outer + 2]]; }
  K.ink('elu' + side, L1, 6.2);
  K.ink('elf' + side, [L1[L1.length - 2], [S(28), ey - h * .62]], 3.2);
  K.ink('elf2' + side, [[S(20), top + 3], [S(26), top - 3]], 2);
  const lowLid = bez([S(-4), bot + 1], [S(6), bot + 1.5], [S(15), bot - 2], [S(20), ey + h * .35], 6);
  K.ink('ell' + side, lowLid, 1.6, { alpha: .7 });
  if (K.detail > 0) {
    _chLashes(K, 'clu' + side, L1, 5, 7.5, 1.7, .5, .97, side, -1, K.detail);
    _chLashes(K, 'cll' + side, lowLid, 3, 2.6, .7, .5, 1, side, 1, K.detail * .6);
    if (!lid) K.ink('ecr' + side, bez([S(-15), top - 5], [S(-4), top - 10], [S(10), top - 11], [S(22), top - 3], 8), .9, { alpha: .35 * K.detail });
  }
}

// ---- Close-up detail helpers (only drawn when K.detail > 0) ----------------------------------------
// Radial iris striations + limbal ring, inside the current clip. a = detail alpha.
function _chIrisTexture(K, name, ix, iy, rx, ry, pr, deep, light, a) {
  if (a <= 0) return;
  const g = K.g, r = rng('iris' + name), N = 34;
  g.save(); g.beginPath(); g.ellipse(ix, iy, rx, ry, 0, 0, 7); g.clip();
  for (let i = 0; i < N; i++) {
    const an = (i + r() * .6) / N * Math.PI * 2, r0 = pr * (1.05 + r() * .2), r1 = .55 + r() * .4;
    const c = Math.cos(an), sn = Math.sin(an), wig = (r() - .5) * .25;
    const pts = [[ix + c * r0 * rx / ry, iy + sn * r0], [ix + Math.cos(an + wig) * rx * (r0 / ry + r1) * .5 + c * 0, iy + Math.sin(an + wig) * ry * (r0 / ry + r1) * .5], [ix + Math.cos(an + wig * 1.6) * rx * r1, iy + Math.sin(an + wig * 1.6) * ry * r1]];
    g.globalAlpha = a * (i % 3 === 0 ? .35 : .22); g.strokeStyle = i % 3 === 0 ? light : deep; g.lineWidth = Math.max(.25, (.35 + r() * .35) * K.ls) * (rx / 12 > 1 ? 1 : .8);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); g.stroke();
  }
  // limbal ring and a soft inner glow ring around the pupil
  g.globalAlpha = a * .55; g.strokeStyle = deep; g.lineWidth = Math.max(.5, rx * .14);
  g.beginPath(); g.ellipse(ix, iy, rx * .97, ry * .97, 0, 0, 7); g.stroke();
  g.globalAlpha = a * .3; g.strokeStyle = light; g.lineWidth = Math.max(.3, pr * .25);
  g.beginPath(); g.ellipse(ix, iy, pr * 1.45 * rx / ry, pr * 1.45, 0, 0, 7); g.stroke();
  g.restore();
}
// Lash strands along a lid polyline (eye-local points). from/to: 0..1 along the lid; outward: +1/-1 screen direction of the outer corner.
function _chLashes(K, name, lid, n, len, w, from, to, outward, up = -1, a = 1) {
  if (a <= 0 || n <= 0) return;
  const L = [0]; for (let i = 1; i < lid.length; i++) L.push(L[i - 1] + Math.hypot(lid[i][0] - lid[i - 1][0], lid[i][1] - lid[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  const at = u => { const d = u * tot; let i = 1; while (i < L.length - 1 && L[i] < d) i++; const f = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1); const p0 = lid[i - 1], p1 = lid[i]; return [[lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f)], [p1[0] - p0[0], p1[1] - p0[1]]]; };
  const rr = rng('lash' + name);
  for (let k = 0; k < n; k++) {
    const u = clamp(lerp(from, to, n === 1 ? .5 : k / (n - 1)) + (rr() - .5) * (to - from) / Math.max(1, n) * .7, 0, 1), [p, tg] = at(u), tl = Math.hypot(tg[0], tg[1]) || 1;
    let nx = -tg[1] / tl, ny = tg[0] / tl; if (Math.sign(ny) !== Math.sign(up)) { nx = -nx; ny = -ny; }
    const tx = tg[0] / tl * Math.sign(tg[0] * outward || 1), ty = tg[1] / tl * Math.sign(tg[0] * outward || 1);
    const prog = clamp((u - from) / ((to - from) || 1)), ln = len * (.55 + .7 * prog * prog) * (.8 + rr() * .4), bend = .3 + 1.1 * prog;
    const q1 = [p[0] + nx * ln * .5 + tx * ln * bend * .2, p[1] + ny * ln * .5 + ty * ln * bend * .2];
    const q2 = [p[0] + nx * ln * .85 + tx * ln * bend * .75, p[1] + ny * ln * .85 + ty * ln * bend * .75 - up * ln * .12 * prog];
    // start inside the lid line so the strand grows out of it; thick root, needle tip
    const p0 = [p[0] - nx * w * 1.6, p[1] - ny * w * 1.6];
    _chSpike(K, bez(p0, q1, q1, q2, 8), w * K.lwm * (.9 + .5 * prog), a);
  }
}
// A filled stroke tapering linearly from root width wr to a sharp tip.
function _chSpike(K, pts, wr, a = 1, color = null) {
  const g = K.g, n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const A = pts[Math.max(0, i - 1)], B = pts[Math.min(n - 1, i + 1)];
    let dx = B[0] - A[0], dy = B[1] - A[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = wr * .5 * Math.pow(1 - i / (n - 1), .85);
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  g.save(); g.globalAlpha = a; g.fillStyle = color || K.line; g.beginPath(); g.moveTo(L[0][0], L[0][1]);
  for (const q of L) g.lineTo(q[0], q[1]); for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath(); g.fill(); g.restore();
}

function _claudeBrows(K, P, C, turn) {
  const raise = P.brow || 0, tilt = P.browTilt || 0;
  for (const side of [-1, 1]) {
    const [bx, ws] = _yawX(side * 37, turn * .7);
    const by = -169 - raise * 8;
    const S = x => bx + side * x * ws;
    const pin = by + tilt * 5, pout = by - tilt * 3;
    K.ink('br' + side, bez([S(-15), pin], [S(-6), pin - 4 - raise], [S(6), pout - 5 - raise], [S(17), pout + 1], 10), 4.2, { color: C.brow });
  }
}

function _claudeFace(K, P) {
  const C = CLAUDE, g = K.g, turn = P.turn || 0, tf = turn * .7;
  const base = crSpline([[-84, -205], [-85, -150], [-78, -114], [-60, -88], [-32, -74], [0, -70], [32, -74], [60, -88], [78, -114], [85, -150], [84, -205], [52, -242], [0, -252], [-52, -242]], true, 7);
  const face = _faceOutline(base, turn, CL_HEAD.cy);
  K.fill(face, C.skin, {
    tex: .1, shade: gg => {
      // warm cheek glow + soft shade beneath the fringe
      const gr = gg.createRadialGradient(turn * 20, -120, 20, turn * 20, -130, 110);
      gr.addColorStop(0, 'rgba(255,236,214,0)'); gr.addColorStop(1, 'rgba(244,170,140,.35)');
      gg.fillStyle = gr; gg.fillRect(-120, -260, 240, 200);
    }
  });
  // jaw line (skip top, hidden by hair)
  const n = face.length;
  K.ink('face', face.slice(Math.floor(n * .08), Math.floor(n * .58)), 3);
  // blush
  const bl = P.blush == null ? .4 : P.blush;
  for (const side of [-1, 1]) {
    const [bx, ws] = _yawX(side * 52, tf);
    _chBlush(g, bx, -103, 20 * ws, 10, C.blush, bl * .75);
    if (bl > .3) for (let k = 0; k < 3; k++) K.ink('bh' + side + k, [[bx + (-8 + k * 7) * ws, -99], [bx + (-4.5 + k * 7) * ws, -106]], 1.3, { color: '#e0604f', alpha: Math.min(1, bl) * .8 });
  }
  // eyes
  for (const side of [-1, 1]) { const [ex, ws] = _yawX(side * 35, tf); _claudeEye(K, ex, -128, side, ws, P, C); }
  // nose
  const [nx] = _yawX(2, tf);
  K.ink('nose', [[nx + 1, -106], [nx + 3.5 + turn * 4, -101], [nx - 0.5, -99.5]], 1.8, { alpha: .8 });
  // mouth
  const [mx, mws] = _yawX(0, tf);
  drawMouth(K, mx, -88, P, 1, mws, {});
  // sweat drop / tears
  if (P.sweat) {
    const sx = _yawX(70, tf)[0], sy = -178;
    const drop = [[sx, sy - 14], [sx + 7, sy + 2], [sx, sy + 8], [sx - 7, sy + 2]];
    K.shape('sweat', crSpline(drop, true, 5), '#cfe7ee', { tex: 0, lw: 1.8 });
  }
  if (P.tears) for (const side of [-1, 1]) {
    const [tx] = _yawX(side * 44, tf);
    const d = crSpline([[tx, -106], [tx + 4, -96], [tx, -90], [tx - 4, -96]], true, 5);
    K.shape('tear' + side, d, '#d6eef3', { tex: 0, lw: 1.5 });
  }
}

function _claudeFrontHair(K, P) {
  const C = CLAUDE, g = K.g, turn = P.turn || 0;
  const sh = turn * 16;
  // side locks framing the face, in front of the cheeks (the far one hides behind the face when turned)
  for (const side of [-1, 1]) {
    const far = Math.sign(turn) === -side && Math.abs(turn) > .12;
    // the far lock hugs the far cheek (and hides the end of the fringe); the near one sits just outside the cheek
    _claudeSideLock(K, P, side, side * (far ? 82 - Math.abs(turn) * 8 : 84 + Math.max(0, turn * side) * 44) + sh * .3, far ? .75 : 1);
  }
  // dome + bangs
  const tipsX = [-86, -60, -31, 0, 30, 59, 86], tipsY = [-150, -164, -172, -167, -174, -163, -150];
  const notchY = [-200, -208, -214, -214, -208, -200];
  const tips = tipsX.map((x, i) => [_yawX(x, turn * .7, 120)[0] + sh * .3, tipsY[i]]);
  const notches = tipsX.slice(0, -1).map((x, i) => [(_yawX(x, turn * .7, 120)[0] + _yawX(tipsX[i + 1], turn * .7, 120)[0]) / 2 + (i - 2.5) * 1.5 + sh * .3, notchY[i]]);
  const edge = _bangEdge(tips, notches);
  const dR = Math.max(92, tips[tips.length - 1][0] + 6), dL = Math.min(-92, tips[0][0] - 6);
  const top = bez([dR, -150], [104, -240], [52, -278], [0 + sh * .3, -278], 14).concat(bez([0 + sh * .3, -278], [-52, -278], [-104, -240], [dL, -150], 14).slice(1));
  const dome = [...edge, [dR, -150], ...top];
  const gr = g.createLinearGradient(0, -280, 0, -150); gr.addColorStop(0, C.hairDeep); gr.addColorStop(.35, C.hair); gr.addColorStop(1, mix(C.hair, C.hairLight, .35));
  // shadow the bangs cast on the forehead
  K.clipFill(_faceOutline(crSpline([[-84, -205], [-85, -150], [-78, -114], [-60, -88], [-32, -74], [0, -70], [32, -74], [60, -88], [78, -114], [85, -150], [84, -205], [52, -242], [0, -252], [-52, -242]], true, 7), turn, CL_HEAD.cy),
    [...chTr(edge, 0, 9), [100, -300], [-100, -300]], C.skinShade, .75);
  K.fill(dome, gr, { tex: .22 });
  // angel-ring highlight: a wavy lighter band
  g.save(); P2(g, dome); g.clip();
  const hl = []; for (let i = 0; i <= 14; i++) { const x = -96 + i * 13.7; hl.push([x + sh * .3, -236 + Math.abs(x) * .16 + (i % 2) * 7]); }
  const hl2 = []; for (let i = 14; i >= 0; i--) { const x = -96 + i * 13.7; hl2.push([x + sh * .3, -248 + Math.abs(x) * .14]); }
  g.globalAlpha = .55; g.fillStyle = C.hairLight; P2(g, [...hl, ...hl2]); g.fill(); g.restore();
  K.ink('bang', [[dL, -150], ...edge, [dR, -150]], 2.8);
  K.ink('domeT', top, 2.4, { color: C.hairLine });
  // strand lines up from the notches
  notches.forEach((N, i) => K.ink('bn' + i, [N, [N[0] * .82, N[1] - 34]], 1.6, { color: C.hairLine, alpha: .6 }));
  if (K.detail > 0) {   // fine strands combed down from the crown into each bang lock
    g.save(); P2(g, K.smooth(dome, true)); g.clip();
    const r = rng('domeStr');
    for (let i = 0; i < 26; i++) {
      const u = (i + .5) / 26, x1 = lerp(dL + 6, dR - 6, u), y1 = -158 - 26 * Math.sin(Math.PI * u) - r() * 22, x0 = sh * .3 + (x1 - sh * .3) * .25, y0 = -276 + r() * 6;
      K.hair('dst' + i, bez([x0, y0], [lerp(x0, x1, .2) + (x1 - x0) * .2, y0 + 30], [x1, y1 - 40], [x1 + (r() - .5) * 4, y1], 10), .6 + r() * .3, { color: i % 4 === 0 ? C.hairLight : C.hairLine, alpha: K.detail * (i % 4 === 0 ? .45 : .32) });
    }
    g.restore();
  }
  // the eight-point spark clip (her right side = screen right)
  const [cx] = _yawX(60, turn * .7, 120);
  _sparkClip(K, cx + sh * .3, -222, 1, C);
}

function _sparkClip(K, x, y, k, C) {
  const star = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 - Math.PI / 2, r = (i % 2 ? 7 : 20) * k * (i % 4 === 2 ? .78 : 1); star.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  K.shape('clip', star, C.star, { tex: .05, lw: 2.2, shade: g => { g.fillStyle = C.starShade; g.beginPath(); g.moveTo(x, y); for (let i = 4; i <= 10; i++) g.lineTo(star[i][0], star[i][1]); g.closePath(); g.globalAlpha = .7; g.fill(); } });
  K.dot(x, y, 3 * k, C.starShade);
}

// Back of Claude's head (seen from behind): the petal ring around a hair-covered skull, drawn in place of the face.
function _claudeBackOfHead(K, P) {
  const C = CLAUDE, g = K.g;
  _claudeBackHair(K, { ...P, turn: 0 });
  const skull = crSpline([[-86, -150], [-90, -206], [-64, -258], [0, -280], [64, -258], [90, -206], [86, -150], [84, -104], [70, -66], [46, -54], [22, -60], [0, -50], [-22, -60], [-46, -54], [-70, -66], [-84, -104]], true, 7);
  const gr = g.createRadialGradient(-6, -236, 8, 0, -170, 132);
  gr.addColorStop(0, mix(C.hair, C.hairLight, .3)); gr.addColorStop(.5, C.hair); gr.addColorStop(1, C.hairDeep);
  K.fill(skull, gr, { tex: .22, shade: gg => { gg.fillStyle = C.hairDark; gg.globalAlpha = .5; gg.beginPath(); gg.ellipse(0, -62, 96, 40, 0, 0, 7); gg.fill(); } });
  g.save(); P2(g, K.smooth(skull, true)); g.clip();
  g.globalAlpha = .5; g.fillStyle = C.hairLight; g.beginPath(); g.ellipse(0, -224, 88, 28, 0, Math.PI, Math.PI * 2); g.ellipse(0, -224, 88, 13, 0, Math.PI * 2, Math.PI, true); g.closePath(); g.fill();
  g.restore();
  // strands swirling down from a crown whorl to the nape and sides
  const wx = 8, wy = -240, n = skull.length;
  for (let k = 0; k < 15; k++) {
    const q = skull[Math.floor((n * (.62 + k / 14 * .76)) % n)], mx = lerp(wx, q[0], .5) + 12 * Math.cos(k), my = lerp(wy, q[1], .45);
    K.ink('bkst' + k, bez([wx + Math.cos(k * 1.3) * 5, wy + Math.sin(k * 1.3) * 4], [mx, my - 10], [lerp(mx, q[0], .6), lerp(my, q[1], .6)], [lerp(wx, q[0], .93), lerp(wy, q[1], .93)], 10), 1.3, { color: C.hairLine, alpha: .45 });
  }
  K.ink('bkout', skull.slice(Math.floor(n * .44), n).concat([skull[0], skull[1]]), 2.8);
  _sparkClip(K, -60, -222, 1, C);
}

// Draw only Claude's head (back hair, face, front hair). Assumes K's transform is at neck base.
// P.back: seen from behind (layer 'back' draws nothing, layer 'front' draws the back of the head).
function drawClaudeHead(K, P, layer = 'all') {
  if (P.back) { if (layer === 'all' || layer === 'front') _claudeBackOfHead(K, P); return; }
  if (layer === 'all' || layer === 'back') _claudeBackHair(K, P);
  if (layer === 'all' || layer === 'front') { _claudeFace(K, P); _claudeFrontHair(K, P); _claudeBrows(K, P, CLAUDE, P.turn || 0); }
}

// =====================================================================================
// Bust: drawApprentice(g, x, y, s, pose)
// pose: { expr, eyes, mouth, talk, blink, look:[x,y], brow, browTilt, lid, blush, tilt (radians), turn (-.5..5),
//         arms: 'none'|'eureka'|'pencil'|'wave'|'fists', t, frame, wind:[x,y], flutter, splay, missing:[petal idx] }
// =====================================================================================
function drawApprentice(g, x, y, s = 1, pose = {}) {
  const P = resolveExpr(pose), C = CLAUDE;
  const K = charKit(g, P.t || 0, s, { line: C.line, seed: 'cl', ..._chKitOpts(P) });
  if (P.frame == null) P.frame = K.bf;
  g.save(); g.translate(x, y); g.scale(s, s);
  const headT = () => { g.translate(0, -18); g.rotate(P.tilt || 0); g.translate(0, 18); };
  g.save(); headT(); drawClaudeHead(K, P, 'back'); g.restore();
  g.save(); g.rotate((P.tilt || 0) * .25); _claudeBustBody(K, P); g.restore();
  g.save(); g.rotate((P.tilt || 0) * .25); _claudeNeck(K, P, { bow: -39 }); g.restore();
  g.save(); headT(); drawClaudeHead(K, P, 'front'); g.restore();
  g.save(); g.rotate((P.tilt || 0) * .25);
  _claudeBustArms(K, P);
  g.restore();
  g.restore();
}

function _claudeNeck(K, P, o = {}) {
  const C = CLAUDE, g = K.g;
  // round 4: the neck reads shorter — a touch wider, the jaw's shadow reaching further down it, and a soft stand collar
  // rising around its base (the head and the body don't move)
  const neck = [[-14, -90], [14, -90], [15, -34], [-15, -34]];
  K.fill(neck, C.skin, { tex: .08, shade: gg => { gg.fillStyle = C.skinShade; gg.beginPath(); gg.moveTo(-30, -92); gg.lineTo(30, -92); gg.lineTo(30, -58); gg.quadraticCurveTo(0, -42, -30, -58); gg.fill();
    gg.globalAlpha = .35; gg.fillStyle = C.skinDeep; gg.beginPath(); gg.moveTo(-30, -92); gg.lineTo(30, -92); gg.lineTo(30, -74); gg.quadraticCurveTo(0, -64, -30, -74); gg.fill(); } });
  K.ink('nkL', [[-14, -80], [-15, -50]], 2.3); K.ink('nkR', [[14, -80], [15, -50]], 2.3);
  const band = crSpline([[-18, -61], [0, -56], [18, -61], [19.5, -43], [0, -37], [-19.5, -43]], true, 6);
  K.shape('nkband', band, '#fffaf0', { tex: .08, lw: 2.1, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .55; gg.beginPath(); gg.ellipse(0, -40, 22, 7, 0, 0, 7); gg.fill(); gg.globalAlpha = .3; gg.fillRect(6, -64, 20, 30); } });
  K.ink('nkbandT', bez([-16, -58.5], [-6, -54], [6, -54], [16, -58.5], 8), 1.4, { color: C.trim, alpha: .85 });
  if (o.bow != null) _ribbonBow(K, 0, o.bow, .85, C);
}

// Bust body. Shoulders at y ~ -20, chest down to ~ +200 (cropped by callers).
function _claudeBustBody(K, P) {
  const C = CLAUDE, g = K.g;
  _claudeBustArmsBack(K, P);
  const torso = crSpline([[-18, -40], [-50, -32], [-68, -12], [-70, 40], [-66, 210], [66, 210], [70, 40], [68, -12], [50, -32], [18, -40]], true, 6);
  K.shape('torso', torso, C.jacket, { tex: .16, lw: 2.8, shade: gg => { gg.fillStyle = C.jacketShade; gg.fillRect(-140, 120, 280, 100); } });
  K.ink('placket', [[2, 40], [4, 210]], 1.8, { alpha: .6 });
  for (const yb of [100, 140]) { K.dot(-8, yb, 4, C.trim); K.ink('btn' + yb, crSpline([[-12, yb], [-8, yb - 4], [-4, yb], [-8, yb + 4]], true, 3), 1.2, { taper: false }); }
  // capelet: rounded shoulders, scalloped petal hem with clay trim
  const nS = 6, hem = [];
  for (let i = 0; i <= nS; i++) { const u = i / nS; hem.push([lerp(-98, 98, u), 34 + Math.sin(u * Math.PI) * 14]); }
  const scal = [];
  for (let i = 0; i < nS; i++) {
    const a = hem[i], b = hem[i + 1], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 12];
    scal.push(...bez(a, [a[0] + 2, a[1] + 9], [m[0] - 9, m[1]], m, 6).slice(i ? 1 : 0), ...bez(m, [m[0] + 9, m[1]], [b[0] - 2, b[1] + 9], b, 6).slice(1));
  }
  const capeTop = crSpline([[98, 34], [94, 4], [76, -22], [46, -38], [18, -46], [-18, -46], [-46, -38], [-76, -22], [-94, 4], [-98, 34]], false, 6);
  const cape = [...capeTop, ...scal.slice().reverse().slice(1)];
  K.shape('cape', cape, C.jacket, { tex: .16, lw: 2.8, shade: gg => {
    gg.fillStyle = C.jacketShade; gg.beginPath(); gg.moveTo(-140, 22); gg.bezierCurveTo(-60, 40, 60, 40, 140, 22); gg.lineTo(140, 140); gg.lineTo(-140, 140); gg.fill();
    gg.globalAlpha = .5; gg.beginPath(); gg.ellipse(-92, 14, 16, 40, .3, 0, 7); gg.fill();
  } });
  K.ink('capeTrim', chTr(scal, 0, -5), 3, { color: C.trim, taper: false, alpha: .9 });
  // satchel strap from her right shoulder (screen-left) across to the hip
  const strap = [[-72, -26], [-58, -32], [96, 210], [78, 214]];
  g.save(); P2(g, torso); g.clip(); K.shape('strapLo', strap, C.strap, { tex: .3, lw: 2 }); g.restore();
  g.save(); P2(g, cape); g.clip(); K.shape('strap', strap, C.strap, { tex: .3, lw: 2 });
  K.ink('strapSt', [[-64, -24], [87, 208]], 1, { color: '#e8c79a', alpha: .5, taper: false }); g.restore();
  // peter-pan collar
  for (const side of [-1, 1]) {
    const flap = crSpline([[side * 3, -40], [side * 18, -49], [side * 38, -42], [side * 42, -27], [side * 28, -15], [side * 9, -18]], true, 6);
    K.shape('col' + side, flap, '#fffaf0', { tex: .08, lw: 2.2, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .6; gg.fillRect(side > 0 ? 0 : -60, -24, 60, 20); } });
    K.ink('colT' + side, bez([side * 8, -21], [side * 18, -18], [side * 28, -18], [side * 37, -27], 6), 1.5, { color: C.trim, alpha: .85 });
  }
  // (the ribbon bow is tied over the stand collar: drawn by _claudeNeck)
}

function _ribbonBow(K, x, y, k, C) {
  const loopL = crSpline([[x - 4 * k, y], [x - 22 * k, y - 13 * k], [x - 30 * k, y - 4 * k], [x - 26 * k, y + 9 * k], [x - 10 * k, y + 4 * k]], true, 6);
  const loopR = chMirX(chTr(loopL, -x, 0)).map(([px, py]) => [px + x, py]);
  const tailL = [[x - 4 * k, y + 3 * k], [x - 14 * k, y + 30 * k], [x - 7 * k, y + 27 * k], [x - 4 * k, y + 32 * k], [x + 1 * k, y + 5 * k]];
  const tailR = [[x + 4 * k, y + 3 * k], [x + 15 * k, y + 28 * k], [x + 9 * k, y + 27 * k], [x + 6 * k, y + 31 * k], [x - 1 * k, y + 5 * k]];
  for (const [nm, p] of [['tl', tailL], ['chTr', tailR], ['ll', loopL], ['lr', loopR]]) K.shape('rb' + nm, p, C.ribbon, { tex: .2, lw: 2, shade: gg => { gg.fillStyle = C.ribbonDeep; gg.fillRect(x - 40 * k, y + 4 * k, 80 * k, 40 * k); } });
  const knot = crSpline([[x - 6 * k, y - 6 * k], [x + 6 * k, y - 6 * k], [x + 7 * k, y + 5 * k], [x - 7 * k, y + 5 * k]], true, 4);
  K.shape('rbk', knot, C.ribbon, { tex: .2, lw: 2 });
}

// =====================================================================================
// Limbs, hands and props
// =====================================================================================
// Smooth tapered tube through control points pts with radii rs (one per point). Rounded end cap.
function limbPts(pts, rs, seg = 8, capStart = false) {
  const sp = crSpline(pts, false, seg);
  // arc-length param for radius interpolation per control span
  const out = [];
  const nSp = pts.length - 1;
  const rAt = i => { const u = i / seg, k = Math.min(nSp - 1, Math.floor(u)), f = u - k; return lerp(rs[k], rs[k + 1], f); };
  const L = [], R = [];
  for (let i = 0; i < sp.length; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const r = rAt(i);
    L.push([sp[i][0] - dy * r, sp[i][1] + dx * r]); R.push([sp[i][0] + dy * r, sp[i][1] - dx * r]);
  }
  const cap = (c, r, a0, n = 8) => { const o = []; for (let k = 1; k < n; k++) { const a = a0 - Math.PI * k / n; o.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return o; };
  const e = sp[sp.length - 1], e0 = sp[sp.length - 2], ae = Math.atan2(e[1] - e0[1], e[0] - e0[0]);
  const s0 = sp[0], s1 = sp[1], as = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
  out.push(...L, ...cap(e, rAt(sp.length - 1), ae + Math.PI / 2), ...R.reverse());
  out.capStartIdx = out.length;
  if (capStart) out.push(...cap(s0, rs[0], as - Math.PI / 2));
  return out;
}
function capsulePts(x1, y1, x2, y2, r1, r2 = r1) { return limbPts([[x1, y1], [x2, y2]], [r1, r2], 2, true); }

// Hand. Wrist at (x,y); ang = direction wrist->fingers (radians); k = scale (1 = ~48-60 units long).
// kind: 'fist' (knuckles to viewer) | 'point' (index up) | 'open' (palm, fingers spread) | 'flat' (palm down, fingers together)
//       | 'relaxed' (side view, fingers loosely curled) | 'hold' (fist gripping a stick drawn behind it) | 'strap' (gripping a strap)
//       | 'thumb' (thumbs-up) | 'vee' (two fingers up). side: +1/-1 mirrors.
// Round 3: real fingers and a jointed thumb. Pieces are drawn as one silhouette (a thick outline pass, then the fills), so the
// outer contour is clean and the gaps between fingers notch it, with fine inner lines for joints and creases.
function _fingerPts(base, ang, L, r, curl = 0, seg = 6, capStart = false) {
  // a finger as a slightly curved tube from base along ang (0 = up), curling toward +y by `curl`
  const dx = Math.sin(ang), dy = -Math.cos(ang);
  const mid = [base[0] + dx * L * .55 - dy * curl * L * .12, base[1] + dy * L * .55 + dx * curl * L * .12];
  const tip = [base[0] + dx * L - dy * curl * L * .35, base[1] + dy * L + dx * curl * L * .35];
  return { pts: limbPts([base, mid, tip], [r, r * .95, r * .8], seg, capStart), base, mid, tip, r, dx, dy };
}
function drawHand(K, name, x, y, ang, k, kind, side, skin, shade) {
  const g = K.g;
  g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2); g.scale(k * side, k);
  const kk = Math.max(.6, k), lw = 2.3 / kk;
  const pieces = [];      // { pts, shade? }
  const lines = [];       // [pts, w, alpha]
  const nails = [];       // finger objects whose nail shows (back of the hand toward us)
  const add = (pts, sh = false) => pieces.push({ pts, sh });
  const crease = (pts, w = 1.1, a = .6) => lines.push([pts, w, a]);
  const tiny = K.s * k < .55;                  // hands only a few pixels wide: keep the fingers, drop the fine creases
  const joint = (f, u, a = .42) => { const m = [lerp(f.base[0], f.tip[0], u), lerp(f.base[1], f.tip[1], u)], ox = -f.dy * f.r * .62, oy = f.dx * f.r * .62; crease([[m[0] - ox, m[1] - oy], [m[0] - f.dx * .9, m[1] - f.dy * .9], [m[0] + ox, m[1] + oy]], .85, a); };
  // round 4: slimmer proportions (palm narrowing to the wrist, fingers as long as the palm, tapered with rounded tips)
  const backPalm = () => crSpline([[-10, 1], [-12, -12], [-12.4, -22], [-7, -26.5], [0, -27.6], [7, -27.2], [11.8, -23], [12.8, -12], [10.5, 1]], true, 5);
  if (kind === 'fist' || kind === 'hold' || kind === 'point' || kind === 'thumb' || kind === 'strap' || kind === 'vee') {
    // back of the hand, a row of four curled fingers (middle segments toward us), the thumb wrapped across the front
    add(crSpline([[-10.5, 1], [-13, -10], [-14, -22], [-7, -25.5], [0, -26], [7, -25.5], [14, -22], [13, -10], [10.5, 1]], true, 5), true);
    let pf = null;
    if (kind === 'point') { pf = _fingerPts([-10.2, -23], -.035, 36, 4.05, 0, 6, true); add(pf.pts); nails.push(pf); }
    let vf = null;
    if (kind === 'vee') { vf = [_fingerPts([-9.6, -23], -.24, 35, 4.0, 0, 6, true), _fingerPts([-2.6, -25], .1, 37, 4.15, 0, 6, true)]; vf.forEach(f => { add(f.pts); nails.push(f); }); }
    const fx = [-10.3, -3.5, 3.4, 10.1], fw = [3.75, 3.95, 3.85, 3.4], ftop = [-37, -39, -38, -34.5];
    fx.forEach((cx, i) => {
      if ((kind === 'point' && i === 0) || (kind === 'vee' && i < 2)) return;
      const w = fw[i], top = ftop[i];
      add(crSpline([[cx - w, -21], [cx - w - .3, top + 6], [cx - w * .55, top + 1], [cx, top], [cx + w * .55, top + 1], [cx + w + .3, top + 6], [cx + w, -21]], true, 4));
      if (!tiny) crease([[cx - w * .65, top + 8.5], [cx, top + 7.6], [cx + w * .65, top + 8.5]], .85, .45);    // middle joint
    });
    if (pf && !tiny) { joint(pf, .4, .45); joint(pf, .7, .45); }
    if (vf && !tiny) vf.forEach(f => { joint(f, .4, .45); joint(f, .7, .45); });
    if (kind === 'thumb') {
      const th = { pts: limbPts([[11.5, -12], [15.6, -28], [14.6, -43]], [5.5, 4.9, 4.2], 6, true), base: [11.5, -12], tip: [14.6, -43], r: 4.6, dx: -.03, dy: -1 };
      add(th.pts); nails.push(th);
      if (!tiny) crease([[11.5, -30], [19.5, -30.4]], .85, .5);
    } else {
      // thumb: from the -x side of the palm, across the front of the curled fingers, tip resting on the middle finger
      add(limbPts([[-13.5, -9], [-7, -19], [3.5, -21.5]], [5.2, 4.8, 4.1], 6, true));
      if (!tiny) crease([[-4.5, -24.5], [-5.5, -17]], .85, .45);
    }
    if (kind === 'hold' || kind === 'strap') crease([[-13.5, -29], [14, -30]], 1.1, .35);
  } else if (kind === 'open') {
    // palm toward the viewer, fingers spread, thumb out to the side
    const F = [[10.8, -28, .3, 22, 3.8], [3.7, -31.5, .1, 27.5, 4.0], [-3.7, -31.5, -.08, 26, 3.9], [-10.6, -28.5, -.26, 20, 3.4]];
    const fs = F.map(([bx, by, a, L, r]) => _fingerPts([bx, by], a, L, r, 0));
    fs.forEach(f => add(f.pts));
    add(limbPts([[10.5, -5], [21, -15], [27.5, -26]], [5.8, 5, 4.2], 6, false));
    add(crSpline([[-11, 1], [-14.5, -14], [-14.2, -28], [-7.5, -34], [0, -35], [7.5, -34], [14.2, -28], [15, -14], [11.5, 1]], true, 5), true);
    if (!tiny) {
      fs.forEach(f => { joint(f, .38, .35); joint(f, .7, .35); });
      crease(bez([12, -24], [4, -21], [-4, -23], [-11, -26], 6), 1, .4);          // heart line
      crease(bez([9, -9], [3, -13], [0, -19], [1, -27], 6), 1, .35);              // life line round the thumb
    }
  } else if (kind === 'flat') {
    // back of the hand, fingers together (each with its own rounded tip and nail), thumb along the side
    const F = [[-8.8, -24, -.07, 24.5, 3.4], [-2.9, -26, -.025, 29.5, 3.6], [3, -25.8, .03, 28, 3.5], [8.7, -23.5, .1, 21.5, 3.1]];
    const fs = F.map(([bx, by, a, L, r]) => _fingerPts([bx, by], a, L, r, 0, 6, true));
    fs.forEach(f => { add(f.pts); nails.push(f); });
    add(backPalm(), true);
    add(limbPts([[9.5, -3], [17.5, -11], [21.5, -21]], [5.1, 4.4, 3.7], 6, true));
    if (!tiny) { fs.forEach(f => { joint(f, .45, .4); joint(f, .74, .3); }); fs.forEach(f => crease([[f.base[0] - f.r * .6, f.base[1] + .8], [f.base[0], f.base[1] - .4], [f.base[0] + f.r * .6, f.base[1] + .8]], .8, .3)); }
  } else {
    // relaxed: back of the hand, fingers loosely curled away from us (so foreshortened, joints showing), the thumb at the side
    const F = [[-8.8, -24, .02, 18, 3.4], [-2.9, -26, .01, 21.5, 3.6], [3, -25.8, -.01, 20.5, 3.5], [8.7, -23.5, -.05, 16, 3.1]];
    const fs = F.map(([bx, by, a, L, r]) => _fingerPts([bx, by], a, L, r, 0, 6, true));
    fs.forEach(f => add(f.pts));
    add(backPalm(), true);
    add(limbPts([[9.5, -4], [15.5, -13], [17, -23]], [5, 4.4, 3.7], 6, true));
    if (!tiny) fs.forEach(f => { joint(f, .5, .5); joint(f, .86, .4); });
  }
  // silhouette: thick outline pass under all fills, then fills (+ a side shade), then inner lines
  pieces.forEach((p, i) => K.loop(name + 'o' + i, p.pts, lw * 1.9, { wobble: .15 }));
  const shadeFn = gg => { gg.fillStyle = shade; gg.globalAlpha = .5; gg.beginPath(); gg.ellipse(14, -12, 9, 38, 0, 0, 7); gg.fill(); };
  // back to front: each piece fills over the ones behind it and carries a thin outline of its own (the parting lines)
  pieces.forEach((p, i) => { K.fill(p.pts, skin, { tex: .06, shade: p.sh ? shadeFn : null }); K.loop(name + 'i' + i, p.pts, lw * .62, { alpha: .8, wobble: .1 }); });
  lines.forEach(([pts, w, a], i) => K.ink(name + 'c' + i, pts, w / kk, { alpha: a }));
  // fingernails on fingers whose backs face us (from ~1.2x on screen), knuckle light on big fists
  const hd = Math.max(K.detail, clamp((K.s * k - 1.1) / 1.0));
  if (hd > 0 && !tiny) {
    const nail = (x, y, rx, ry, a = 0) => {
      g.save(); g.globalAlpha = hd * .85; K.ell(x, y, rx, ry, mix(skin, '#fff6f0', .5), a);
      g.lineWidth = .6 * K.ls / kk; g.strokeStyle = rgba(K.line, .45); g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.stroke();
      K.ell(x - rx * .25, y - ry * .3, rx * .25, ry * .3, 'rgba(255,255,255,.7)', a); g.restore();
    };
    for (const f of nails) { const nx = f.tip[0] - f.dx * f.r * 1.15, ny = f.tip[1] - f.dy * f.r * 1.15; nail(nx, ny, f.r * .55, f.r * .78, Math.atan2(f.dy, f.dx) + Math.PI / 2); }
    if (kind === 'fist' || kind === 'hold' || kind === 'point' || kind === 'strap' || kind === 'vee') nail(1.8, -21.6, 2.6, 2, -.1);
    if (kind === 'fist' || kind === 'hold' || kind === 'strap') {
      g.save(); g.globalAlpha = .5 * hd; g.strokeStyle = '#ffffff'; g.lineWidth = 1.2 / kk; g.lineCap = 'round';
      for (const [x0, y0] of [[-10.3, -35], [-3.5, -37], [3.4, -36], [10.1, -32.5]]) { g.beginPath(); g.moveTo(x0 - 2.2, y0 + .5); g.quadraticCurveTo(x0, y0 - 1, x0 + 2.2, y0 + .5); g.stroke(); }
      g.restore();
    }
  }
  g.restore();
}

// A pencil from (x1,y1) eraser end to (x2,y2) point. w = width.
function drawPencil(K, name, x1, y1, x2, y2, w = 9) {
  const g = K.g, a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
  g.save(); g.translate(x1, y1); g.rotate(a);
  const h = w / 2, tipL = w * 2.2, er = w * 1.1, fe = w * .8;
  K.shape(name + 'er', [[0, -h], [er, -h], [er, h], [0, h]].map(([x, y]) => [x, y]), '#e98f86', { tex: .1, lw: 1.6 });
  K.shape(name + 'fe', [[er, -h - .5], [er + fe, -h - .5], [er + fe, h + .5], [er, h + .5]], '#c9b98e', { tex: .1, lw: 1.6 });
  K.shape(name + 'bd', [[er + fe, -h], [L - tipL, -h], [L - tipL, h], [er + fe, h]], '#e2a83c', { tex: .15, lw: 1.8, shade: gg => { gg.fillStyle = '#b97e22'; gg.fillRect(0, h * .25, L, h); } });
  K.shape(name + 'wd', [[L - tipL, -h], [L - w * .5, -w * .18], [L - w * .5, w * .18], [L - tipL, h]], '#f0d2a0', { tex: .1, lw: 1.6 });
  K.shape(name + 'gr', [[L - w * .5, -w * .18], [L, 0], [L - w * .5, w * .18]], '#4a3a34', { tex: 0, lw: 1.2 });
  g.restore();
}

// Ornate brass key: bow centred at (x,y), shaft along angle a, length L.
function drawKey(K, name, x, y, a, L = 90) {
  const g = K.g, br = '#d6a443', brD = '#a87a25';
  g.save(); g.translate(x, y); g.rotate(a);
  const R = L * .2;
  // shaft + bit
  K.shape(name + 'sh', [[R * .7, -L * .045], [L, -L * .045], [L, L * .045], [R * .7, L * .045]], br, { tex: .1, lw: 1.8, shade: gg => { gg.fillStyle = brD; gg.fillRect(0, L * .01, L, L * .05); } });
  K.shape(name + 'bit', [[L * .78, L * .04], [L * .98, L * .04], [L * .98, L * .2], [L * .9, L * .2], [L * .9, L * .13], [L * .84, L * .13], [L * .84, L * .2], [L * .78, L * .2]], br, { tex: .1, lw: 1.8 });
  // trefoil bow
  const bow = []; for (let i = 0; i < 36; i++) { const t2 = i / 36 * Math.PI * 2, r = R * (1 + .22 * Math.cos(3 * t2)); bow.push([Math.cos(t2) * r, Math.sin(t2) * r]); }
  K.shape(name + 'bw', bow, br, { tex: .1, lw: 2, shade: gg => { gg.fillStyle = brD; gg.globalAlpha = .6; gg.beginPath(); gg.arc(R * .3, R * .4, R, 0, 7); gg.fill(); } });
  for (let i = 0; i < 3; i++) { const t2 = i / 3 * Math.PI * 2 + Math.PI; const hx = Math.cos(t2) * R * .5, hy = Math.sin(t2) * R * .5; K.shape(name + 'h' + i, crSpline([[hx - R * .16, hy], [hx, hy - R * .16], [hx + R * .16, hy], [hx, hy + R * .16]], true, 4), '#5a3d1e', { tex: 0, lw: 1.2 }); }
  K.ink(name + 'gl', [[-R * .55, -R * .55], [-R * .2, -R * .8]], 2, { color: '#fff3c8', alpha: .8 });
  g.restore();
}

// Sleeve (tube) with a cuff band near the wrist. pts: shoulder, elbow, wrist. capStart rounds the near end.
// Tube like limbPts, with per-side dents (fold notches in the silhouette). dents: [{ u (0..1 along), side (+1 L / -1 R), d (depth, fraction of r), w (half-width in u) }]
function _sleeveTube(pts, rs, seg, capStart, dents) {
  const sp = crSpline(pts, false, seg), n = sp.length, nSp = pts.length - 1;
  const rAt = i => { const u = i / seg, k = Math.min(nSp - 1, Math.floor(u)), f = u - k; return lerp(rs[k], rs[k + 1], f); };
  const dent = (i, side) => { let m = 1; const u = i / (n - 1); for (const d of dents) if (d.side === side) { const x = Math.abs(u - d.u) / d.w; if (x < 1) m -= d.d * (1 - x) * (1 - x); } return m; };
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const r = rAt(i);
    L.push([sp[i][0] - dy * r * dent(i, 1), sp[i][1] + dx * r * dent(i, 1)]); R.push([sp[i][0] + dy * r * dent(i, -1), sp[i][1] - dx * r * dent(i, -1)]);
  }
  const cap = (c, r, a0, k = 8) => { const o = []; for (let j = 1; j < k; j++) { const a = a0 - Math.PI * j / k; o.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return o; };
  const e = sp[n - 1], e0 = sp[n - 2], ae = Math.atan2(e[1] - e0[1], e[0] - e0[0]);
  const s0 = sp[0], s1 = sp[1], as = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
  const out = [...L, ...cap(e, rAt(n - 1), ae + Math.PI / 2), ...R.reverse()];
  out.capStartIdx = out.length;
  if (capStart) out.push(...cap(s0, rs[0], as - Math.PI / 2));
  out.sp = sp; out.rAt = rAt;
  return out;
}

function drawSleeve(K, name, pts, rs, color, shade, cuffColor, capStart = false, seamless = false, opt = {}) {
  // opt: { folds (default true: fold notches, elbow creases, drag folds, cuff bunching), light (default true: lit-edge sheen),
  //        taper (default .9 with a cuff: the forearm narrows toward the cuff), button (cuff button colour) }
  // tolerant options: folds may be a number (intensity), light a number (sign = light from upper-left (+) / upper-right (-)),
  // taper a multiplier (.9) or, below .5, an amount (.15 = narrow by 15%), button true for the default brass
  const folds = opt.folds !== false && opt.folds !== 0, light = opt.light !== false && opt.light !== 0, nP = pts.length, g = K.g;
  const lightX = typeof opt.light === 'number' && opt.light < 0 ? 1 : -1, foldK = typeof opt.folds === 'number' ? clamp(opt.folds, 0, 2) : 1;
  let taper = opt.taper != null ? +opt.taper : (cuffColor && folds ? .9 : 1); if (taper < .5) taper = 1 - taper;
  const button = opt.button === true ? '#c9973e' : opt.button;
  const rr = rs.slice(); if (taper !== 1 && nP >= 2) rr[nP - 1] = rs[nP - 1] * taper;
  const rpx = rs[0] * K.s, fa = folds ? clamp((rpx - 9) / 12) * foldK : 0;
  // fold plan (stable per part name): along each span, alternating sides, angled toward the wrist
  const R = rng('fold' + name), plan = [];
  let len = 0; for (let i = 1; i < nP; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (fa > 0) {
    const nF = Math.max(2, Math.min(5, Math.round(len / (rs[0] * 2.6))));
    for (let j = 0; j < nF; j++) plan.push({ u: (j + .55 + (R() - .5) * .35) / (nF + .4), side: j % 2 ? -1 : 1, L: .8 + R() * .55, w: .3 + R() * .12 });
  }
  const dents = plan.map(f => ({ u: f.u, side: f.side, d: .07 * fa, w: .045 }));
  const tube = _sleeveTube(pts, rr, 8, capStart, dents), sp = tube.sp, nS = sp.length, rAt = tube.rAt;
  const frame = i => { i = clamp(i, 0, nS - 1); const A = sp[Math.max(0, i - 1)], B = sp[Math.min(nS - 1, i + 1)]; let dx = B[0] - A[0], dy = B[1] - A[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; return { p: sp[i], nx: -dy, ny: dx, tx: dx, ty: dy, r: rAt(i) }; };
  const litOf = f => (f.nx * lightX + f.ny * -1) > 0 ? 1 : -1;     // light from the upper left (or right)
  const oldShade = gg => { gg.fillStyle = shade; gg.globalAlpha = .75; gg.beginPath(); gg.rect(-3000, -3000, 6000, 6000); const q = chTr(tube, -rs[0] * .45, -rs[0] * .25); gg.moveTo(q[0][0], q[0][1]); for (const v of q) gg.lineTo(v[0], v[1]); gg.closePath(); gg.fill('evenodd'); };
  // cel shadow band on the dark side; folds on that side push shadow "teeth" diagonally into the light
  let tubeLen = 0; for (let i = 1; i < nS; i++) tubeLen += Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]);
  const frameU = u => { const x = clamp(u) * (nS - 1), i = Math.min(nS - 2, Math.floor(x)), f = x - i, A = frame(i), B = frame(i + 1);
    return { p: [lerp(A.p[0], B.p[0], f), lerp(A.p[1], B.p[1], f)], nx: lerp(A.nx, B.nx, f), ny: lerp(A.ny, B.ny, f), tx: lerp(A.tx, B.tx, f), ty: lerp(A.ty, B.ty, f), r: lerp(A.r, B.r, f) }; };
  const B0 = -.05;     // band boundary, as a fraction of r from the centre toward the shadow side (negative = toward the light)
  const teeth = plan.map(f => {
    const fr = frameU(f.u), shadowSide = f.side === -litOf(fr), ang = .62, offTip = B0 - .55 * f.L * fa;
    const across = .96 - offTip, du = across * Math.tan(ang) * fr.r / Math.max(1, tubeLen);
    return { ...f, shadowSide, ang, offTip, uBase: f.u - du, uTip: f.u, uCross: f.u - du + du * (.96 - B0) / across };
  });
  const band = () => {
    const edge = [], bnd = [], N = Math.max(24, Math.min(120, Math.round(tubeLen / 3)));
    for (let k = 0; k <= N; k++) {
      const u = k / N, f = frameU(u), sd = -litOf(f);
      let off = B0;
      for (const tq of teeth) if (tq.shadowSide && tq.side === sd) {
        if (u >= tq.uCross && u <= tq.uTip) off = Math.min(off, lerp(B0, tq.offTip, (u - tq.uCross) / ((tq.uTip - tq.uCross) || 1)));
        else if (u > tq.uTip && u < tq.uTip + .025) off = Math.min(off, lerp(tq.offTip, B0, (u - tq.uTip) / .025));
      }
      edge.push([f.p[0] + f.nx * sd * f.r * 1.3, f.p[1] + f.ny * sd * f.r * 1.3]);
      bnd.push([f.p[0] + f.nx * sd * f.r * off, f.p[1] + f.ny * sd * f.r * off]);
    }
    const out = [...edge, ...bnd.reverse()]; out.nEdge = edge.length; return out;
  };
  const shadeFn = light ? gg => {
    const bp = band();
    gg.globalAlpha = .92; gg.fillStyle = shade; P2(gg, bp); gg.fill();
    // reflected light: a thin lighter rim right at the shadow edge
    gg.globalAlpha = .22; gg.strokeStyle = color; gg.lineWidth = rs[0] * .22; gg.beginPath(); P2open(gg, bp.slice(0, bp.nEdge).map(([x, y], i) => { const f = frameU(i / (bp.nEdge - 1)), sd = -litOf(f); return [x - f.nx * sd * f.r * .42, y - f.ny * sd * f.r * .42]; })); gg.stroke();
    // the start cap (shoulder end) sits a touch darker, so the arm reads as coming out from behind something
    if (capStart) { gg.globalAlpha = .18; gg.fillStyle = shade; gg.beginPath(); gg.arc(sp[0][0], sp[0][1], rs[0] * 1.15, 0, 7); gg.fill(); }
  } : oldShade;
  if (seamless && capStart) { K.fill(tube, color, { tex: .16, shade: shadeFn }); K.ink(name, tube.slice(0, tube.capStartIdx), 2.6, { taper: false }); }
  else K.shape(name, tube, color, { tex: .16, lw: 2.6, shade: shadeFn });
  // lit-edge sheen
  if (light && nS > 3) {
    const hl = [];
    for (let i = Math.floor(nS * .06); i < Math.floor(nS * .86); i++) { const f = frame(i), sd = litOf(f); hl.push([f.p[0] + f.nx * sd * f.r * .6, f.p[1] + f.ny * sd * f.r * .6]); }
    if (hl.length > 1) K.ink(name + 'hl', hl, 2.6, { color: mix(color, '#ffffff', .55), alpha: .38 });
  }
  // a fold line: from the silhouette notch diagonally toward the wrist, inked, with a light ridge beside it
  const fold = (key, i, side, Lk, ang = .55, al = 1, wedge = true) => {
    const f = frame(i), r = f.r, nx = f.nx * side, ny = f.ny * side;
    const e = [f.p[0] + nx * r * .96, f.p[1] + ny * r * .96];
    const dx = -nx * Math.cos(ang) + f.tx * Math.sin(ang), dy = -ny * Math.cos(ang) + f.ty * Math.sin(ang);
    const tip = [e[0] + dx * r * Lk, e[1] + dy * r * Lk];
    if (wedge) {
      const w = r * .28, a0 = [e[0] - f.tx * w, e[1] - f.ty * w], mid = [lerp(e[0], tip[0], .5) - f.tx * w * .3, lerp(e[1], tip[1], .5) - f.ty * w * .3];
      g.save(); P2(g, K.smooth(tube, true)); g.clip(); g.globalAlpha = .7 * al; g.fillStyle = shade; P2(g, K.smooth([a0, mid, tip, e], true)); g.fill(); g.restore();
    }
    K.ink(name + key, bez(e, [lerp(e[0], tip[0], .35) + f.tx * r * .05, lerp(e[1], tip[1], .35) + f.ty * r * .05], [lerp(e[0], tip[0], .7), lerp(e[1], tip[1], .7)], tip, 8), 2, { alpha: .85 * al });
    K.ink(name + key + 'r', [[e[0] + f.tx * r * .22 - nx * r * .1, e[1] + f.ty * r * .22 - ny * r * .1], [lerp(e[0], tip[0], .6) + f.tx * r * .2, lerp(e[1], tip[1], .6) + f.ty * r * .2]], 1.8, { color: mix(color, '#ffffff', .5), alpha: .4 * al });
  };
  if (fa > 0 && nS > 3) {
    for (let j = 0; j < teeth.length; j++) {
      const tq = teeth[j];
      if (tq.shadowSide) {   // the ink rides the upper edge of the shadow tooth, from the silhouette notch to its point
        const fb = frameU(tq.uBase), ft = frameU(tq.uTip), sd = tq.side;
        const e = [fb.p[0] + fb.nx * sd * fb.r * .96, fb.p[1] + fb.ny * sd * fb.r * .96], tip = [ft.p[0] + ft.nx * sd * ft.r * tq.offTip, ft.p[1] + ft.ny * sd * ft.r * tq.offTip];
        K.ink(name + 'f' + j, bez(e, [lerp(e[0], tip[0], .35), lerp(e[1], tip[1], .35)], [lerp(e[0], tip[0], .7), lerp(e[1], tip[1], .7)], tip, 8), 2, { alpha: .8 * fa });
        const ft2 = frameU(tq.uTip + .03);
        K.ink(name + 'f' + j + 'r', [[lerp(e[0], tip[0], .45) + ft2.tx * ft.r * .25, lerp(e[1], tip[1], .45) + ft2.ty * ft.r * .25], [tip[0] + ft2.tx * ft.r * .3 - ft.nx * sd * ft.r * .1, tip[1] + ft2.ty * ft.r * .3 - ft.ny * sd * ft.r * .1]], 1.8, { color: mix(color, '#ffffff', .5), alpha: .35 * fa });
      } else fold('f' + j, Math.round(tq.u * (nS - 1)), tq.side, tq.L * .75, .5, fa, true);
    }
    // elbow: Z-creases on the inside of the bend, a soft pocket of shadow in the crook
    if (nP >= 3) {
      const e = 8, A = sp[Math.max(0, e - 3)], B = sp[e], Cc = sp[Math.min(nS - 1, e + 3)];
      const cross = (B[0] - A[0]) * (Cc[1] - B[1]) - (B[1] - A[1]) * (Cc[0] - B[0]);
      const bend = Math.abs(Math.atan2(cross, (B[0] - A[0]) * (Cc[0] - B[0]) + (B[1] - A[1]) * (Cc[1] - B[1])));
      if (bend > .25) {
        const inner = cross > 0 ? 1 : -1, f = frame(e);
        g.save(); P2(g, K.smooth(tube, true)); g.clip(); g.globalAlpha = .35 * clamp(bend) * fa; g.fillStyle = shade;
        g.beginPath(); g.ellipse(f.p[0] + f.nx * inner * f.r * .5, f.p[1] + f.ny * inner * f.r * .5, f.r * .7, f.r * .4, Math.atan2(f.ty, f.tx), 0, 7); g.fill(); g.restore();
        fold('el0', e - 1, inner, 1.05, .1, fa); fold('el1', e + 2, inner, .8, -.3, fa); fold('el2', e - 4, inner, .6, .35, fa * .8, false);
      }
    }
  }
  if (cuffColor) {
    const w = pts[pts.length - 1], w0 = pts[pts.length - 2], a = Math.atan2(w[1] - w0[1], w[0] - w0[0]), r = rs[rs.length - 1] * 1.1;
    const c = [w[0] - Math.cos(a) * 11, w[1] - Math.sin(a) * 11];
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    if (fa > 0) {   // bunching where the sleeve meets the cuff: two short V folds
      const iC = nS - 1 - Math.round(14 / Math.max(1, Math.hypot(sp[nS - 1][0] - sp[nS - 2][0], sp[nS - 1][1] - sp[nS - 2][1])));
      fold('bn0', Math.max(1, iC), 1, .5, 1.0, fa * .8); fold('bn1', Math.max(1, iC - 2), -1, .45, 1.0, fa * .8);
    }
    const cuff = capsulePts(c[0], c[1], w[0] + ca * 2, w[1] + sa * 2, r, r);
    K.shape(name + 'cf', cuff, cuffColor, { tex: .15, lw: 2.2, shade: (light && folds) ? gg => {
      gg.fillStyle = 'rgba(40,20,20,.24)'; gg.beginPath(); const q = chTr(cuff, -r * .5, -r * .3); gg.rect(-3000, -3000, 6000, 6000); gg.moveTo(q[0][0], q[0][1]); for (const v of q) gg.lineTo(v[0], v[1]); gg.closePath(); gg.fill('evenodd');
      gg.fillStyle = 'rgba(30,15,15,.25)'; gg.beginPath(); gg.ellipse(c[0] - ca * 2, c[1] - sa * 2, 3, r, a, 0, 7); gg.fill();     // the sleeve's shadow on the cuff
    } : null });
    if (light && folds) {
      K.ink(name + 'cs', [[c[0] + ca * 3.5 + nx * r * .92, c[1] + sa * 3.5 + ny * r * .92], [c[0] + ca * 3.5 - nx * r * .92, c[1] + sa * 3.5 - ny * r * .92]], 1.1, { alpha: .45, taper: false });
      const sd = (nx * lightX + ny * -1) > 0 ? 1 : -1;
      K.ink(name + 'ch', [[c[0] + nx * sd * r * .6, c[1] + ny * sd * r * .6], [w[0] + nx * sd * r * .6, w[1] + ny * sd * r * .6]], 2, { color: mix(cuffColor, '#ffffff', .5), alpha: .45 });
      if (button) { const bx = lerp(c[0], w[0], .45) - nx * sd * r * .55, by = lerp(c[1], w[1], .45) - ny * sd * r * .55; K.ell(bx, by, 2.6, 2.6, button); g.lineWidth = .6 * K.ls; g.strokeStyle = rgba(K.line, .7); g.beginPath(); g.arc(bx, by, 2.6, 0, 7); g.stroke(); K.ell(bx - .8, by - .8, .9, .9, 'rgba(255,255,255,.8)'); }
    }
  }
}

// Claude bust arms. arms: 'rest'|'eureka'|'pencil'|'fists'|'wave'
// Each arm = [shoulder, elbow, wrist]; the upper arm is drawn under the capelet, the forearm in front.
function _claudeArmRig(P) {
  const arms = P.arms || 'rest', f = P.frame || 0;
  const rest = side => ({ pts: [[side * 66, -10], [side * 80, 90], [side * 82, 200]], hand: null });
  const R = { L: rest(-1), R: rest(1) };   // L = screen-left = her right
  if (arms === 'eureka') R.L = { pts: [[-60, -6], [-124, 38], [-110, -42]], hand: ['point', -Math.PI / 2 - .05, -1], spark: true };
  if (arms === 'wave') R.L = { pts: [[-60, -6], [-126, 36], [-114, -44]], hand: ['open', -Math.PI / 2 - .1 + Math.sin(f * .9) * .18, -1] };
  if (arms === 'pencil') R.R = { pts: [[64, -6], [88, 100], [44, -22]], hand: ['hold', -Math.PI / 2 - .5, -1], pencil: true };
  if (arms === 'fists') { R.L = { pts: [[-64, -6], [-84, 96], [-46, 40]], hand: ['fist', -Math.PI / 2 + .3, -1] }; R.R = { pts: [[64, -6], [84, 96], [46, 40]], hand: ['fist', -Math.PI / 2 - .3, 1] }; }
  return R;
}
function _claudeBustArmsBack(K, P) {
  const C = CLAUDE, R = _claudeArmRig(P);
  for (const k of ['L', 'R']) { const a = R[k]; if (!a.hand) drawSleeve(K, 'arm' + k, a.pts, [21, 19, 17], C.jacket, C.jacketShade, null, true); else drawSleeve(K, 'armU' + k, a.pts.slice(0, 2), [21, 19], C.jacket, C.jacketShade, null, true); }
}
function _claudeBustArms(K, P) {
  const C = CLAUDE, R = _claudeArmRig(P), f = P.frame || 0;
  for (const k of ['L', 'R']) {
    const a = R[k]; if (!a.hand) continue;
    const [sh, el, wr] = a.pts;
    if (a.pencil) drawPencil(K, 'pc', wr[0] + 22, wr[1] + 40, wr[0] - 14, wr[1] - 74, 9);
    drawSleeve(K, 'armF' + k, [el, [lerp(el[0], wr[0], .5), lerp(el[1], wr[1], .5)], wr], [19, 17.5, 15.5], C.jacket, C.jacketShade, C.trim, true, true);
    drawHand(K, 'h' + k, wr[0], wr[1], a.hand[1], 1, a.hand[0], a.hand[2], C.skin, C.skinShade);
    if (a.spark) _chSparkle(K, wr[0] + 6, wr[1] - 86 - (f % 2) * 3, 14, C.star);
  }
}

function _chSparkle(K, x, y, r, color) {
  const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * .22 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
  K.shape('spk' + Math.round(x), pts, color, { tex: 0, lw: 1.6 });
}


// =====================================================================================
// PROFESSOR HILDE (and young Hilde via pose.young)
// =====================================================================================
const PROF = {
  hair: '#f5f1ea', hairShade: '#cfc6d3', hairDeep: '#a79db0', hairLine: '#8f8499',
  skin: '#fbdcc4', skinShade: '#f0b49a', blush: '#ee8a7c', line: '#3e2a20', brow: '#a8a0b0',
  iris: '#6a4632', irisDeep: '#3a2418', glass: '#b8862e', glassDeep: '#7c5718',
  coat: '#6d4a5e', coatShade: '#553848', coatDeep: '#3f2836', coatLight: '#86607a',
  scarf: '#d6a443', scarfShade: '#b0802c', scarfLine: '#8f6420', blouse: '#f6efe0', blouseShade: '#ded1b8',
  pearl: '#fbf6ec', pencil: '#e2a83c',
  trunk: '#8a5a36', trunkDeep: '#62391f', trunkLight: '#a8754a', trunkTrim: '#c99a4a',
};
const YOUNG_HILDE = {
  hair: '#7a4a2c', hairShade: '#5e3620', hairDeep: '#45261a', hairLine: '#4a2a1a',
  skin: '#fde2cc', skinShade: '#f3b89c', brow: '#5a3420', iris: '#6a4632', irisDeep: '#3a2418',
  coat: '#8a5f76', coatShade: '#6d4a5e', coatDeep: '#553848', coatLight: '#a07890',
  // round 3: the same mustard scarf as the professor she becomes (review: carry her cues over)
  scarf: '#d6a443', scarfShade: '#b0802c', scarfLine: '#8f6420',
};
function _hpal(P) { return P.young ? { ...PROF, ...YOUNG_HILDE } : PROF; }

function _hildeBackHair(K, P) {
  const C = _hpal(P), g = K.g, sh = (P.turn || 0) * -18;
  if (P.young) {
    // 1960s flip bob: volume at the back, flicked-up ends at the jaw
    const back = crSpline([[-92, -150], [-104, -210], [-80, -262], [0, -284], [80, -262], [104, -210], [94, -150], [100, -96], [118, -86], [96, -78], [70, -96], [-70, -96], [-96, -78], [-118, -86], [-100, -96]], true, 6);
    // opt-in (pose.pencil): the pencil already lives in her hair, tucked behind the band (ch6 draws its own; ch5 reuses this rig for a researcher)
    if (P.pencil && !P.noPencil) drawPencil(K, 'ypen', 30 + sh, -232, 124 + sh, -286, 9);
    K.shape('yhb', chTr(back, sh, 0), C.hairShade, { tex: .2, lw: 2.8 });
    return;
  }
  // bun with a pencil through it
  const bx = 24 + sh, by = -262;
  const bun = crSpline([[bx - 46, by + 10], [bx - 40, by - 26], [bx - 4, by - 44], [bx + 36, by - 32], [bx + 48, by + 2], [bx + 30, by + 30], [bx - 20, by + 30]], true, 6);
  if (!P.noPencil) drawPencil(K, 'hpen', bx - 72, by - 2, bx + 70, by - 56, 9);
  K.shape('bun', bun, C.hair, { tex: .18, lw: 2.8, shade: gg => { gg.fillStyle = C.hairShade; gg.beginPath(); gg.ellipse(bx + 12, by + 18, 46, 22, 0, 0, 7); gg.fill(); } });
  for (let i = 0; i < 4; i++) K.ink('bunl' + i, bez([bx - 34 + i * 8, by + 8 - i * 4], [bx - 30 + i * 6, by - 28 + i * 6], [bx + 14, by - 38 + i * 9], [bx + 34 - i * 4, by - 18 + i * 8], 10), 1.4, { color: C.hairLine, alpha: .55 });
  // pencil front segment over the bun
}

function _hildeFaceOutline(turn, young) {
  const base = young
    ? crSpline([[-80, -200], [-82, -150], [-74, -112], [-56, -86], [-28, -72], [0, -69], [28, -72], [56, -86], [74, -112], [82, -150], [80, -200], [50, -240], [0, -250], [-50, -240]], true, 7)
    : crSpline([[-80, -200], [-82, -150], [-76, -114], [-62, -88], [-34, -71], [0, -66], [34, -71], [62, -88], [76, -114], [82, -150], [80, -200], [50, -240], [0, -250], [-50, -240]], true, 7);
  return _faceOutline(base, turn, -150);
}

function _hildeEar(K, side, turn, C) {
  const [ex] = _yawX(side * 82, turn, 90);
  if (Math.sign(turn) === -side && Math.abs(turn) > .3) return;
  const ear = crSpline([[ex, -150], [ex + side * 10, -156], [ex + side * 14, -140], [ex + side * 10, -118], [ex + side * 2, -114]], true, 5);
  K.shape('ear' + side, ear, C.skin, { tex: .08, lw: 2.4, shade: gg => { gg.fillStyle = C.skinShade; gg.globalAlpha = .7; gg.beginPath(); gg.ellipse(ex + side * 6, -136, 4, 10, 0, 0, 7); gg.fill(); } });
  if (!K._young) { K.ell(ex + side * 5, -110, 4.6, 4.6, C.pearl); K.g.lineWidth = 1.2 * K.ls; K.g.strokeStyle = C.line; K.g.stroke(); K.ell(ex + side * 4, -111.5, 1.4, 1.4, '#ffffff'); }
}

function _hildeEye(K, ex, ey, side, ws, P, C) {
  const { g } = K, mode = P.eyes || 'open', blink = P.blink || 0, look = P.look || [0, 0], lid = P.lid || 0, young = P.young;
  const S = x => ex + side * x * ws;
  const sc = young ? 1.25 : 1;
  if (mode === 'happy' || mode === 'laugh') {
    const arc = bez([S(-13 * sc), ey + 4], [S(-6), ey - 8 * sc], [S(7), ey - 8 * sc], [S(14 * sc), ey + 3], 10);
    K.ink('heh' + side, arc, 4.2);
    if (K.detail > 0) _chLashes(K, 'hlh' + side, arc, 5, 3.6, .8, .5, 1, side, 1, K.detail * .85);
    if (!young) { K.ink('hcf1' + side, [[S(20), ey + 2], [S(27), ey - 1]], 1.4, { alpha: .6 }); K.ink('hcf2' + side, [[S(20), ey + 8], [S(26), ey + 8]], 1.3, { alpha: .5 }); }
    return;
  }
  if (mode === 'closed' || blink >= .85) {
    const arc = bez([S(-13 * sc), ey], [S(-5), ey + 7], [S(6), ey + 7], [S(14 * sc), ey - 1], 10);
    K.ink('hec' + side, arc, 4);
    if (K.detail > 0) _chLashes(K, 'hlc' + side, arc, 6, 4, .8, .4, 1, side, 1, K.detail * .85);
    return;
  }
  const wide = mode === 'wide', open = clamp(1 - blink);
  const w = (wide ? 13 : 12) * sc, h = (wide ? 14 : 11) * sc * open;
  const shape = crSpline([[S(-w), ey + 1], [S(-w * .4), ey - h], [S(w * .5), ey - h * 1.02], [S(w * 1.05), ey - h * .2], [S(w * .6), ey + h * .75], [S(-w * .4), ey + h * .8]], true, 6);
  g.save(); P2(g, shape); g.fillStyle = '#fffaf2'; g.fill(); g.clip();
  const ix = ex + look[0] * 4 * ws, iy = ey + 1 + look[1] * 3, ir = (wide ? 6.5 : 8.6) * sc;
  const gr = g.createLinearGradient(0, iy - ir, 0, iy + ir); gr.addColorStop(0, C.irisDeep); gr.addColorStop(1, mix(C.iris, '#c08a5a', .45));
  g.beginPath(); g.ellipse(ix, iy, ir * ws, ir * 1.1, 0, 0, 7); g.fillStyle = gr; g.fill();
  _chIrisTexture(K, 'h' + side, ix, iy, ir * ws, ir * 1.1, ir * .45, C.irisDeep, '#efcfa2', K.detail);
  K.ell(ix, iy, ir * .45 * ws, ir * .5, '#24140c');
  g.fillStyle = 'rgba(200,140,120,.3)'; g.beginPath(); g.ellipse(ex, ey - h - 1, 20 * ws, 5, 0, 0, 7); g.fill();
  K.ell(ix - 2.8 * ws, iy - ir * .45, 2.8 * ws * sc, 3 * sc, '#ffffff');
  K.ell(ix + 2.6 * ws, iy + ir * .4, 1.3 * ws, 1.3, 'rgba(255,255,255,.85)');
  if (mode === 'teary') {
    g.fillStyle = `rgba(190,230,240,${.6 - .2 * K.detail})`; g.beginPath(); g.ellipse(ex, ey + h * .7, 15 * ws, 4, 0, 0, 7); g.fill(); K.ell(ix + 2 * ws, iy - 1, 2 * ws, 2, '#fff');
    if (K.detail > 0) {   // a trembling meniscus: bright top edge of the pooled tear, with small sparkles
      g.save(); g.globalAlpha = .75 * K.detail; g.strokeStyle = '#f4fcff'; g.lineWidth = .8; g.beginPath(); g.ellipse(ex, ey + h * .7, 14 * ws, 3.4, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      g.fillStyle = '#ffffff'; for (const [dx, dy, rr] of [[-6, .4, .9], [5, -.2, .7], [9, .6, .5]]) { g.beginPath(); g.arc(ex + dx * ws, ey + h * .7 - 3 + dy, rr, 0, 7); g.fill(); } g.restore();
    }
  }
  if (lid > 0) { g.fillStyle = C.skin; g.fillRect(S(-20) - 30, ey - h - 10, 60 + 40 * ws, h * (lid * 1.5) + 10); }
  g.restore();
  const top = bez([S(-w - 2), ey + 2], [S(-w * .5), ey - h - 2], [S(w * .5), ey - h - 2.5], [S(w + 3), ey - h * .25], 10);
  K.ink('helu' + side, top, young ? 4.6 : 4);
  if (young) K.ink('helf' + side, [top[top.length - 2], [S(w + 7), ey - h * .55]], 2.4);
  if (K.detail > 0) {
    _chLashes(K, 'hlu' + side, top, young ? 7 : 6, young ? 5 : 4.2, .85, .42, 1, side, -1, K.detail);
    _chLashes(K, 'hll' + side, bez([S(-w * .3), ey + h * .85], [S(w * .2), ey + h * .95], [S(w * .7), ey + h * .7], [S(w), ey + h * .2], 5), 3, 2.2, .6, .45, .95, side, 1, K.detail * .6);
  }
  K.ink('hell' + side, bez([S(-w * .3), ey + h * .85], [S(w * .2), ey + h * .95], [S(w * .7), ey + h * .7], [S(w), ey + h * .2], 5), 1.3, { alpha: .6 });
  if (!young) {
    K.ink('hcr' + side, bez([S(-w * .6), ey - h - 5], [S(-w * .1), ey - h - 8], [S(w * .5), ey - h - 8], [S(w + 2), ey - h - 3], 6), 1.2, { alpha: .45 });
    K.ink('hbag' + side, bez([S(-w * .4), ey + h + 5], [S(0), ey + h + 7], [S(w * .5), ey + h + 6], [S(w * .9), ey + h + 2], 5), 1.1, { alpha: .35 });
    K.ink('hcf1' + side, [[S(w + 6), ey], [S(w + 12), ey - 2]], 1.2, { alpha: .45 });
    K.ink('hcf2' + side, [[S(w + 6), ey + 5], [S(w + 11), ey + 6]], 1.1, { alpha: .4 });
  }
}

function _hildeFace(K, P) {
  const C = _hpal(P), g = K.g, turn = P.turn || 0, young = !!P.young;
  K._young = young;
  for (const side of [-1, 1]) _hildeEar(K, side, turn, C);
  const face = _hildeFaceOutline(turn, young);
  K.fill(face, C.skin, { tex: .1, shade: gg => {
    const gr = gg.createRadialGradient(turn * 20, -125, 20, turn * 20, -135, 112);
    gr.addColorStop(0, 'rgba(255,236,214,0)'); gr.addColorStop(1, 'rgba(236,160,130,.38)');
    gg.fillStyle = gr; gg.fillRect(-120, -260, 240, 210);
  } });
  const n = face.length;
  K.ink('hface', face.slice(Math.floor(n * .08), Math.floor(n * .58)), 3);
  const bl = P.blush == null ? (young ? .4 : .32) : P.blush;
  for (const side of [-1, 1]) { const [bx, ws] = _yawX(side * 50, turn); _chBlush(g, bx, -106, 19 * ws, 9, C.blush, bl * .8); }
  // eyes
  const eyeX = young ? 34 : 33, eyeY = young ? -132 : -134;
  for (const side of [-1, 1]) { const [ex, ws] = _yawX(side * eyeX, turn); _hildeEye(K, ex, eyeY, side, ws, P, C); }
  // nose: rounder, a little bigger
  const [nx] = _yawX(4, turn);
  if (young) K.ink('hnose', [[nx + 1, -110], [nx + 4, -103], [nx - 1, -101]], 1.8, { alpha: .8 });
  else {
    K.ink('hnose', bez([nx + 3, -122], [nx + 8, -112], [nx + 10, -104], [nx + 4, -100], 8), 2, { alpha: .85 });
    K.ink('hnos2', bez([nx - 7, -103], [nx - 5, -99], [nx - 1, -99], [nx + 2, -100], 5), 1.5, { alpha: .6 });
  }
  // smile lines
  if (!young) for (const side of [-1, 1]) { const [lx] = _yawX(side * 24, turn); K.ink('hsl' + side, bez([lx, -102], [lx + side * 5, -97], [lx + side * 7, -91], [lx + side * 6, -86], 5), 1.2, { alpha: .28 }); }
  const [mx, mws] = _yawX(0, turn);
  drawMouth(K, mx, -86, P, young ? .95 : 1.05, mws, { mouthDark: '#6e2e26' });
  if (P.tears) for (const side of [-1, 1]) { const [tx] = _yawX(side * 40, turn); K.shape('htear' + side, crSpline([[tx, -118], [tx + 4, -108], [tx, -102], [tx - 4, -108]], true, 5), '#d6eef3', { tex: 0, lw: 1.4 }); }
  if (P.sweat) { const sx = _yawX(66, turn)[0]; K.shape('hsweat', crSpline([[sx, -196], [sx + 7, -180], [sx, -174], [sx - 7, -180]], true, 5), '#cfe7ee', { tex: 0, lw: 1.8 }); }
}

function _hildeFrontHair(K, P) {
  const C = _hpal(P), g = K.g, turn = P.turn || 0, sh = turn * 14, young = !!P.young;
  const face = _hildeFaceOutline(turn, young);
  if (young) {
    // side-parted fringe swept across, with a mustard hairband
    const cap = crSpline([[-86, -150], [-92, -214], [-60, -262], [0, -276], [60, -262], [92, -214], [86, -150], [76, -178], [52, -196], [10, -204], [-24, -196], [-54, -186], [-74, -170]], true, 6).map(([x, y]) => [x + sh * (y < -200 ? .6 : .3), y]);
    K.clipFill(face, chTr(cap, 0, 9), C.skinShade, .7);
    K.shape('ycap', cap, C.hair, { tex: .22, lw: 2.8, shade: gg => { gg.fillStyle = C.hairShade; gg.globalAlpha = .7; gg.beginPath(); gg.ellipse(40, -175, 70, 24, -.2, 0, 7); gg.fill(); } });
    // shine
    g.save(); P2(g, cap); g.clip(); g.globalAlpha = .4; g.fillStyle = '#b07850'; g.beginPath(); g.ellipse(-20 + sh, -238, 54, 9, -.15, 0, 7); g.fill(); g.restore();
    for (let i = 0; i < 4; i++) K.ink('ystr' + i, bez([-60 + i * 22 + sh, -250 + i * 3], [-40 + i * 24, -232], [-20 + i * 20, -214], [-30 + i * 24, -196 + i * 2], 6), 1.4, { color: C.hairLine, alpha: .5 });
    const band = bez([-90 + sh * .3, -196], [-70, -268], [70, -268], [92 + sh * .3, -196], 18);
    K.ink('yband', band, 9, { color: '#d6a443', taper: false });
    K.ink('yband2', band, 1.4, { alpha: .5 });
    return;
  }
  // full silver cap with a soft side part, voluminous temple puffs and a wave over the forehead
  const X = (x, y) => [x + sh * (y < -200 ? .7 : .3), y];
  const cap = crSpline([[-84, -150], [-94, -204], [-76, -246], [-24, -266], [40, -262], [84, -232], [95, -188], [86, -150],
    [80, -170], [64, -190], [36, -202], [14, -205], [2, -197], [-16, -194], [-40, -190], [-62, -180], [-78, -164]], true, 6).map(([x, y]) => X(x, y));
  K.clipFill(face, chTr(cap, 0, 8), C.skinShade, .5);
  if (Math.abs(turn) > .1) {   // the back of the head shows on the far side when she turns
    const fs = -Math.sign(turn), ta = Math.min(1, Math.abs(turn) / .6);
    const back = crSpline([[fs * 40, -262], [fs * 96, -214], [fs * 98, -150], [fs * 86, -118], [fs * (84 - 30 * ta), -134], [fs * (80 - 46 * ta), -176], [fs * (60 - 40 * ta), -214]], true, 6);
    K.shape('hback', back, C.hair, { tex: .1, lw: 2.6, shade: gg => { gg.fillStyle = C.hairShade; gg.globalAlpha = .6; gg.fillRect(-120, -160, 240, 50); } });
    for (let i = 0; i < 3; i++) K.ink('hbs' + i, bez([fs * (90 - i * 12), -140 - i * 10], [fs * (96 - i * 10), -190], [fs * (70 - i * 8), -236], [fs * 30, -258], 8), 1.4, { color: C.hairLine, alpha: .5 });
  }
  K.shape('hcap', cap, C.hair, { tex: .1, lw: 2.8, shade: gg => {
    // form shadow on the far right, gentle lavender toward the edges
    const gr = gg.createRadialGradient(-30 + sh, -250, 20, -10 + sh, -220, 130);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.7, 'rgba(199,190,210,.25)'); gr.addColorStop(1, 'rgba(160,150,175,.7)');
    gg.fillStyle = gr; gg.fillRect(-140, -300, 280, 200);
  } });
  // swept-back strands toward the bun
  const strands = [[[-76, -176], [-84, -224], [-40, -258], [6, -264]], [[-52, -192], [-58, -232], [-20, -256], [16, -262]], [[-26, -198], [-28, -236], [0, -254], [22, -262]],
    [[24, -204], [34, -236], [28, -254], [26, -264]], [[52, -194], [68, -224], [52, -250], [34, -262]], [[76, -172], [90, -206], [78, -238], [48, -258]]];
  strands.forEach((q, i) => K.ink('hst' + i, bez(...q.map(([x, y]) => X(x, y)), 10), 1.4, { color: C.hairLine, alpha: .45 }));
  if (K.detail > 0) {   // close-up: many fine combed strands between the main ones
    g.save(); P2(g, K.smooth(cap, true)); g.clip();
    for (let i = 0; i < strands.length - 1; i++) for (let j = 1; j <= 3; j++) {
      const f = j / 4, q = strands[i].map((pt, k) => [lerp(pt[0], strands[i + 1][k][0], f), lerp(pt[1], strands[i + 1][k][1], f)]);
      K.hair('hfs' + i + j, bez(...q.map(([x, y]) => X(x, y)), 12), .55, { color: j === 2 ? '#ffffff' : C.hairLine, alpha: K.detail * (j === 2 ? .5 : .3) });
    }
    g.restore();
  }
  for (let i = 0; i < 4; i++) { const x0 = -60 + i * 18; K.ink('hhl' + i, bez(X(x0, -236 + i * 2), X(x0 + 8, -246), X(x0 + 18, -252), X(x0 + 26, -254), 6), 2.6, { color: '#ffffff', alpha: .75 }); }
  // temple puffs (soft set waves) over the tops of the ears
  for (const side of [-1, 1]) {
    if (Math.sign(turn) === -side && Math.abs(turn) > .3) continue;
    const ox = side * (Math.max(0, turn * side) * 12);
    const puff = crSpline([[side * 64 + ox, -206], [side * 96 + ox, -200], [side * 106 + ox, -168], [side * 98 + ox, -136], [side * 82 + ox, -132], [side * 78 + ox, -160], [side * 66 + ox, -184]], true, 6).map(([x, y]) => X(x, y));
    K.shape('hpuff' + side, puff, C.hair, { tex: .1, lw: 2.6, shade: gg => { gg.fillStyle = C.hairShade; gg.globalAlpha = .8; gg.beginPath(); gg.ellipse(side * 92 + ox + sh * .3, -140, 22, 12, 0, 0, 7); gg.fill(); } });
    K.ink('hcurl' + side, crSpline([[side * 74, -188], [side * 92, -186], [side * 96, -170], [side * 86, -162], [side * 80, -170]].map(([x, y]) => X(x + ox, y)), false, 5), 1.5, { color: C.hairLine, alpha: .6 });
    K.ink('hcurl2' + side, bez(...[[side * 84, -150], [side * 94, -152], [side * 100, -144], [side * 96, -138]].map(([x, y]) => X(x + ox, y)), 6), 1.4, { color: C.hairLine, alpha: .5 });
  }
  // the wave lock swept from the part across her forehead
  const wave = crSpline([[6, -200], [-16, -216], [-48, -218], [-74, -202], [-88, -172], [-80, -166], [-66, -186], [-42, -198], [-18, -196]], true, 6).map(([x, y]) => [x + sh * .4, y]);
  K.shape('hwave', wave, C.hair, { tex: .1, lw: 2.4, shade: gg => { gg.fillStyle = C.hairShade; gg.globalAlpha = .75; P2(gg, chTr(wave, 2, 7)); gg.fill(); } });
  K.ink('hwl', bez(...[[-6, -208], [-30, -214], [-58, -206], [-76, -184]].map(([x, y]) => [x + sh * .4, y]), 8), 1.4, { color: C.hairLine, alpha: .55 });
  if (K.detail > 0) for (let j = 0; j < 4; j++) { const o = -4 + j * 3.5; K.hair('hwf' + j, bez(...[[0, -204 + o * .6], [-28, -212 + o], [-58, -204 + o], [-78, -180 + o * .5]].map(([x, y]) => [x + sh * .4, y]), 10), .55, { color: j % 2 ? '#ffffff' : C.hairLine, alpha: K.detail * .35 }); }
}

// Brow drawn as fine hair strokes along the brow curve (close-up detail).
function _chBrowHairs(K, name, curve, side, n, len, color, a) {
  const r = rng(name), N = curve.length;
  for (let k = 0; k < n; k++) {
    const u = (k + .5) / n, i = Math.min(N - 2, Math.floor(u * (N - 1))), p = curve[i], q = curve[i + 1];
    const tx = q[0] - p[0], ty = q[1] - p[1], tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
    const off = (r() - .5) * 3.6, nx = -uy, ny = ux;
    const x0 = p[0] + nx * off, y0 = p[1] + ny * off + 1.2, ln = len * (.7 + .5 * Math.sin(Math.PI * u)) * (.8 + r() * .4);
    const ang = -.12 - .55 * Math.pow(1 - u, 2.2);
    const dx = ux * Math.cos(ang) - uy * Math.sin(ang) * side, dy = uy * Math.cos(ang) + ux * Math.sin(ang) * side;
    K.ink(name + k, [[x0, y0], [x0 + dx * ln * .55, y0 + dy * ln * .55 - .3], [x0 + dx * ln, y0 + dy * ln - .2]], .6 + r() * .35, { color: r() < .3 ? mix(color, '#ffffff', .35) : color, alpha: a * .7, taper: true, wobble: .05 });
  }
}

function _hildeBrowsSpecs(K, P) {
  const C = _hpal(P), g = K.g, turn = P.turn || 0, young = !!P.young;
  const raise = P.brow || 0, tilt = P.browTilt || 0;
  const eyeX = young ? 34 : 33, eyeY = young ? -132 : -134;
  for (const side of [-1, 1]) {
    const [bx, ws] = _yawX(side * 34, turn), by = (young ? -170 : -166) - raise * 7;
    const S = x => bx + side * x * ws, pin = by + tilt * 5, pout = by - tilt * 2;
    const bc = bez([S(-14), pin + 1], [S(-6), pin - 4 - raise], [S(6), pout - 5 - raise], [S(16), pout + 2], 10), bcol = young ? C.brow : '#9a90a4';
    K.ink('hbr' + side, bc, young ? 4 : 5.4, { color: bcol, alpha: 1 - .4 * K.detail });
    if (K.detail > 0) _chBrowHairs(K, 'hbh' + side, bc, side, 26, young ? 4.5 : 5.2, bcol, K.detail);
  }
  if (P.specs === false) return;
  const R = young ? 23 : 22;
  for (const side of [-1, 1]) {
    const [ex, ws] = _yawX(side * eyeX, turn);
    const dt = K.detail;
    g.save(); g.globalAlpha = .14; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(ex, eyeY + 1, R * ws, R, 0, 0, 7); g.fill(); g.restore();
    // glint (close-up: a soft broad streak plus a crisp thin one, and a faint inner edge ring for the glass thickness)
    g.save(); g.beginPath(); g.ellipse(ex, eyeY + 1, R * ws, R, 0, 0, 7); g.clip();
    if (dt > 0) {
      g.globalAlpha = .2 * dt; g.strokeStyle = '#7c5718'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(ex, eyeY + 1, R * ws - 1.4, R - 1.4, 0, 0, 7); g.stroke();
      g.globalAlpha = .16 * dt; g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - 16 * ws, eyeY - 1); g.lineTo(ex - 3 * ws, eyeY - 16); g.stroke();
      g.globalAlpha = .45 * dt; g.lineWidth = 1.1; g.beginPath(); g.moveTo(ex - 9 * ws, eyeY + 4); g.lineTo(ex + 3 * ws, eyeY - 10); g.stroke();
      g.globalAlpha = .35 * (1 - dt);
    } else g.globalAlpha = .35;
    g.strokeStyle = '#ffffff'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(ex - 14 * ws, eyeY - 4); g.lineTo(ex - 4 * ws, eyeY - 15); g.stroke(); g.restore();
    const NR = K.fine ? 56 : 28;
    const rim = []; for (let i = 0; i < NR; i++) { const a = i / NR * Math.PI * 2; rim.push([ex + Math.cos(a) * R * ws, eyeY + 1 + Math.sin(a) * R]); }
    const rk = 1 / Math.sqrt(Math.max(.2, K.ls));     // the wire frame is an object: it thins less than the ink
    K.loop('rimO' + side, rim, 4.6 * rk, { color: C.glassDeep });
    K.loop('rimI' + side, rim, 2.4 * rk, { color: C.glass });
    if (dt > 0) {   // a bright specular arc on the gold rim
      const arc = []; for (let i = 0; i <= 14; i++) { const a = Math.PI * (1.08 + i / 14 * .5); arc.push([ex + Math.cos(a) * (R - .3) * ws, eyeY + 1 + Math.sin(a) * (R - .3)]); }
      K.ink('rimH' + side, arc, .9 * rk, { color: '#fff1c4', alpha: .8 * dt });
      const arc2 = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * (.12 + i / 8 * .3); arc2.push([ex + Math.cos(a) * (R - .3) * ws, eyeY + 1 + Math.sin(a) * (R - .3)]); }
      K.ink('rimH2' + side, arc2, .7 * rk, { color: '#ffe8a8', alpha: .5 * dt });
    }
    // temple arm to the ear
    const [ax] = _yawX(side * 80, turn, 90);
    if (!(Math.sign(turn) === -side && Math.abs(turn) > .3)) {
      K.ink('arm' + side, [[ex + side * R * ws, eyeY - 2], [ax, eyeY - 6]], 2.6 * Math.min(rk, 1.3), { color: C.glassDeep });
      if (K.detail > 0) K.ell(ex + side * (R + 1.2) * ws, eyeY - 2, 2 * ws, 2.4, C.glass);
    }
  }
  const [l] = _yawX(-eyeX + R * .95, turn), [r] = _yawX(eyeX - R * .95, turn);
  K.ink('bridge', bez([l, eyeY - 2], [l + 4, eyeY - 9], [r - 4, eyeY - 9], [r, eyeY - 2], 6), 2.8 / Math.sqrt(Math.max(.2, K.ls)), { color: C.glassDeep });
}

function drawHildeHead(K, P, layer = 'all') {
  if (layer === 'all' || layer === 'back') _hildeBackHair(K, P);
  if (layer === 'all' || layer === 'front') { _hildeFace(K, P); _hildeFrontHair(K, P); _hildeBrowsSpecs(K, P); }
}

// Bust. pose as drawApprentice plus arms: 'rest'|'key'|'slide'|'clasp', young: bool, specs: bool.
function drawProfessor(g, x, y, s = 1, pose = {}) {
  const P = resolveExpr(pose), C = _hpal(P);
  const K = charKit(g, P.t || 0, s, { line: PROF.line, seed: P.young ? 'yh' : 'hd', ..._chKitOpts(P) });
  if (P.frame == null) P.frame = K.bf;
  g.save(); g.translate(x, y); g.scale(s, s);
  const headT = () => { g.translate(0, -20); g.rotate(P.tilt || 0); g.translate(0, 20); };
  g.save(); headT(); drawHildeHead(K, P, 'back'); g.restore();
  _hildeBustBody(K, P);
  g.save(); headT(); drawHildeHead(K, P, 'front'); g.restore();
  _hildeBustArms(K, P);
  g.restore();
}

function _hildeBustBody(K, P) {
  const C = _hpal(P), g = K.g, young = !!P.young;
  // neck
  const neck = [[-17, -90], [17, -90], [18, -30], [-18, -30]];
  K.fill(neck, C.skin, { tex: .08, shade: gg => { gg.fillStyle = C.skinShade; gg.beginPath(); gg.moveTo(-30, -92); gg.lineTo(30, -92); gg.lineTo(30, -60); gg.quadraticCurveTo(0, -44, -30, -60); gg.fill(); } });
  K.ink('hnkL', [[-17, -80], [-18, -40]], 2.3); K.ink('hnkR', [[17, -80], [18, -40]], 2.3);
  if (!young) K.ink('hnk3', bez([-8, -60], [-3, -57], [3, -57], [8, -60], 4), 1.1, { alpha: .35 });
  // coat (or, young: cardigan) body: rounded, slightly stooped shoulders; sleeves drawn on top
  const coat = crSpline([[-20, -44], [-50, -36], [-70, -18], [-76, 24], [-74, 210], [74, 210], [76, 24], [70, -18], [50, -36], [20, -44]], true, 6);
  K.shape('coat', coat, C.coat, { tex: .26, lw: 2.8, shade: gg => {
    gg.fillStyle = C.coatShade; gg.beginPath(); gg.moveTo(40, -40); gg.bezierCurveTo(80, -10, 50, 120, 70, 220); gg.lineTo(140, 220); gg.lineTo(140, -40); gg.fill();
    gg.beginPath(); gg.moveTo(-140, 170); gg.bezierCurveTo(-40, 150, 40, 150, 140, 170); gg.lineTo(140, 240); gg.lineTo(-140, 240); gg.fill();
  } });
  if (young) {
    const bl = [[-24, -42], [24, -42], [14, 50], [0, 60], [-14, 50]];
    K.shape('yblouse', bl, '#fbf6ea', { tex: .08, lw: 2 });
    for (const side of [-1, 1]) K.shape('ycol' + side, crSpline([[side * 2, -44], [side * 20, -48], [side * 36, -38], [side * 32, -22], [side * 14, -18]], true, 5), '#fffaf0', { tex: .06, lw: 2 });
    K.ink('ycard', [[-16, -10], [-2, 64], [-4, 210]], 2, { alpha: .8 }); K.ink('ycard2', [[16, -10], [2, 64]], 2, { alpha: .8 });
    for (const yb of [92, 132, 172]) { K.ell(-8, yb, 4.6, 4.6, '#f3ead8'); K.loop('ybt' + yb, crSpline([[-12.6, yb], [-8, yb - 4.6], [-3.4, yb], [-8, yb + 4.6]], true, 3), 1.2); }
    // knit ribbing at the hem
    for (let i = 0; i < 9; i++) K.ink('ykr' + i, [[-70 + i * 17, 196], [-70 + i * 17, 210]], 1, { alpha: .35 });
  } else {
    const blouse = [[-21, -42], [21, -42], [10, 56], [0, 66], [-10, 56]];
    K.shape('blouse', blouse, C.blouse, { tex: .1, lw: 2, shade: gg => { gg.fillStyle = C.blouseShade; gg.fillRect(-30, -44, 60, 20); } });
    for (const side of [-1, 1]) {
      const lap = [[side * 20, -44], [side * 38, -38], [side * 50, -18], [side * 40, -12], [side * 50, 0], [side * 14, 92], [side * 10, 60]];
      K.shape('lap' + side, lap, C.coatLight, { tex: .25, lw: 2.3, shade: gg => { gg.fillStyle = C.coatShade; gg.globalAlpha = .55; gg.beginPath(); gg.moveTo(side * 50, 0); gg.lineTo(side * 14, 92); gg.lineTo(side * 30, 92); gg.closePath(); gg.fill(); } });
    }
    for (const yb of [118, 168]) { K.ell(-26, yb, 6, 6, '#c9973e'); K.loop('hbt' + yb, crSpline([[-32, yb], [-26, yb - 6], [-20, yb], [-26, yb + 6]], true, 3), 1.4); K.ell(-28, yb - 2, 1.6, 1.6, '#fff1c8'); }
  }
  _hildeArmsBack(K, P);
  // scarf: wrapped at the neck, knot and two tails (young: a small teal neckerchief)
  const sc = (nm, pts) => K.shape(nm, pts, C.scarf, { tex: .28, lw: 2.4, shade: gg => { gg.fillStyle = C.scarfShade; gg.globalAlpha = .8; gg.fillRect(-60, 0, 120, 120); } });
  if (young) {
    sc('ywrap', crSpline([[-30, -52], [0, -44], [30, -52], [32, -38], [0, -30], [-32, -38]], true, 5));
    sc('ytail1', crSpline([[2, -36], [22, -30], [30, 4], [16, 10], [8, -20]], true, 4));
    sc('ytail2', crSpline([[-2, -36], [-20, -30], [-26, 0], [-12, 4], [-6, -20]], true, 4));
    sc('yknot', crSpline([[-7, -42], [7, -42], [9, -30], [-9, -30]], true, 4));
  } else {
    const wrap = crSpline([[-40, -58], [-20, -46], [20, -46], [40, -58], [44, -38], [24, -24], [-24, -24], [-44, -38]], true, 6);
    const tail1 = crSpline([[10, -32], [30, -30], [40, 28], [36, 90], [22, 96], [18, 38]], true, 5);
    const tail2 = crSpline([[-4, -30], [14, -28], [16, 18], [6, 68], [-8, 70], [-4, 18]], true, 5);
    sc('tail2', tail2); sc('tail1', tail1); sc('wrap', wrap);
    for (let i = 0; i < 4; i++) K.ink('rib' + i, [[-30 + i * 20, -52 + Math.abs(-30 + i * 20) * .2], [-26 + i * 20, -30]], 1.2, { color: C.scarfLine, alpha: .45 });
    K.ink('fr1', [[24, 94], [24, 104]], 1.6, { color: C.scarfLine }); K.ink('fr2', [[30, 92], [31, 102]], 1.6, { color: C.scarfLine }); K.ink('fr3', [[36, 90], [38, 99]], 1.6, { color: C.scarfLine });
    sc('knot', crSpline([[-6, -36], [16, -38], [20, -20], [2, -14], [-8, -22]], true, 5));
  }
}

// Hilde arm rigs. L = screen-left (her right). Sleeves drawn over the torso.
function _hildeArmRig(P) {
  const arms = P.arms || 'rest';
  const rest = side => ({ pts: [[side * 58, -18], [side * 80, 84], [side * 86, 200]], hand: null });
  const R = { L: rest(-1), R: rest(1) };
  if (arms === 'key') R.L = { pts: [[-58, -18], [-96, 70], [-92, -6]], hand: ['fist', -Math.PI / 2 - .2, -1], key: true };
  if (arms === 'slide') R.R = { pts: [[58, -18], [100, 50], [70, 96]], hand: ['flat', Math.PI / 2 + .45, 1], paper: true };
  if (arms === 'clasp') { R.L = { pts: [[-58, -18], [-84, 80], [-16, 58]], hand: ['relaxed', -.5, 1] }; R.R = { pts: [[58, -18], [84, 80], [14, 60]], hand: ['relaxed', Math.PI + .5, -1] }; }
  if (arms === 'point') R.L = { pts: [[-58, -18], [-118, 30], [-114, -60]], hand: ['point', -Math.PI / 2, -1] };
  return R;
}
function _hildeArmsBack(K, P) {
  const C = _hpal(P), R = _hildeArmRig(P);
  for (const k of ['L', 'R']) {
    const a = R[k];
    if (a.hand) drawSleeve(K, 'harm' + k, a.pts.slice(0, 2), [22, 19], C.coat, C.coatShade, null, true);
    else drawSleeve(K, 'harm' + k, a.pts, [22, 20, 18], C.coat, C.coatShade, null, true);
  }
}
function _hildeBustArms(K, P) {
  const C = _hpal(P), R = _hildeArmRig(P);
  for (const k of ['L', 'R']) {
    const a = R[k]; if (!a.hand) continue;
    const [sh, el, wr] = a.pts;
    if (a.paper) _paperSheet(K, 'paper', wr[0] - 4, wr[1] + 56, .25, .8);
    drawSleeve(K, 'harmF' + k, [el, [lerp(el[0], wr[0], .5), lerp(el[1], wr[1], .5)], wr], [19.5, 18, 16], C.coat, C.coatShade, C.coatDeep, true, true);
    if (a.key) {   // a brass key dangling from a teal ribbon pinched in her fingers
      const sw = Math.sin((P.t || 0) * 2.2) * .12, hx = wr[0] - 12, hy = wr[1] - 30;
      const kx = hx + Math.sin(sw) * 40, ky = hy + Math.cos(sw) * 40;
      K.ink('kribbon', [[hx, hy], [lerp(hx, kx, .5) + 3, lerp(hy, ky, .5)], [kx, ky]], 3.2, { color: '#4f7d78', taper: false });
      drawKey(K, 'key', kx, ky + 16, Math.PI / 2 + sw, 104);
    }
    drawHand(K, 'hh' + k, wr[0], wr[1], a.hand[1], 1.02, a.hand[0], a.hand[2], C.skin, C.skinShade);
  }
}

// A sheet of puzzle paper (centre x,y), rotation a, scale k.
function _paperSheet(K, name, x, y, a, k) {
  const g = K.g;
  g.save(); g.translate(x, y); g.rotate(a); g.scale(k, k);
  const sheet = [[-70, -90], [70, -90], [72, 90], [-72, 92]];
  K.shape(name, sheet, '#fbf4e2', { tex: .12, lw: 2.2, shade: gg => { gg.strokeStyle = 'rgba(79,125,120,.3)'; gg.lineWidth = 1; for (let yy = -80; yy < 90; yy += 12) { gg.beginPath(); gg.moveTo(-70, yy); gg.lineTo(72, yy); gg.stroke(); } } });
  g.fillStyle = '#d97757'; g.fillRect(-60, -80, 40, 22);
  g.font = font(13, 'Fraunces', 700); g.fillStyle = '#fbf4e2'; g.textAlign = 'center'; g.fillText('№1', -40, -64);
  g.font = font(20, 'Caveat', 600); g.fillStyle = '#4a2c1c'; g.textAlign = 'left'; g.fillText('? = ...', -50, -20);
  g.restore();
}


// =====================================================================================
// FULL-BODY FIGURES: a 2.5D puppet. Joints live in 3D (x right, y down, z toward camera),
// local origin at the neck base; feet near y = +600. Parts are projected, depth-sorted and inked.
// =====================================================================================
function _chCam(o = {}) {
  const yaw = o.yaw || 0, D = o.D || 2400, eye = o.eye == null ? 200 : o.eye, lean = o.lean || 0;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const P = ([x, y, z]) => {
    const X = x * c + z * sn, Z = -x * sn + z * c, k = D / (D - Z);
    return [X * k, eye + (y - eye) * k, Z, k];
  };
  return { P, yaw, D, eye };
}
// Ring of points around centre c (3D) in the xz plane. returns projected [sx,sy,z,k] with angle a (a=PI/2 faces camera)
function _chRing(cam, c, rx, rz, n = 28, off = [0, 0, 0], flare = null) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let p = [c[0] + Math.cos(a) * rx, c[1], c[2] + Math.sin(a) * rz];
    if (flare) p = flare(p, a);
    const q = cam.P(p); q.a = a; out.push(q);
  }
  return out;
}
function _chHull(pts) {
  const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Cone/frustum silhouette between two projected rings: left side, front arc of bottom ring, right side, front arc of top ring.
function _chCone(top, bot, scallop = 0, nScal = 7) {
  const ext = r => { let li = 0, ri = 0; r.forEach((q, i) => { if (q[0] < r[li][0]) li = i; if (q[0] > r[ri][0]) ri = i; }); return [li, ri]; };
  const [tl, trr] = ext(top), [bl, br] = ext(bot);
  // front arc from left extreme to right extreme passing through max z
  const arc = (r, from, to) => {
    const n = r.length, a = [], b = [];
    for (let i = from; ; i = (i + 1) % n) { a.push(r[i]); if (i === to) break; }
    for (let i = from; ; i = (i - 1 + n) % n) { b.push(r[i]); if (i === to) break; }
    const za = a.reduce((m, q) => m + q[2], 0) / a.length, zb = b.reduce((m, q) => m + q[2], 0) / b.length;
    return za > zb ? a : b;
  };
  let botArc = arc(bot, bl, br).map(q => [q[0], q[1]]);
  if (scallop > 0) botArc = _chScallopLine(botArc, scallop, nScal);
  const topArc = arc(top, tl, trr).map(q => [q[0], q[1]]).reverse();
  return { pts: [[top[tl][0], top[tl][1]], ...botArc, [top[trr][0], top[trr][1]], ...topArc], botArc };
}
// Replace a polyline with scallops bulging "down" (to the right of travel when going left->right in screen)
function _chScallopLine(line, depth, n) {
  // resample by arc length
  const L = [0]; for (let i = 1; i < line.length; i++) L.push(L[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const tot = L[L.length - 1] || 1, out = [];
  const at = d => { let i = 1; while (i < L.length - 1 && L[i] < d) i++; const f = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1); return [lerp(line[i - 1][0], line[i][0], f), lerp(line[i - 1][1], line[i][1], f), i]; };
  const M = n * 10;
  for (let j = 0; j <= M; j++) {
    const d = j / M * tot, [x, y, i] = at(d), a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    if (ny < 0) { nx = -nx; ny = -ny; }
    const u = (j / M * n) % 1, bump = Math.pow(Math.sin(Math.PI * u), .6) * depth;
    out.push([x + nx * bump, y + ny * bump]);
  }
  return out;
}
const _chV = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const _chAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// Generic projected limb: joints (3D) -> tube with radii scaled by perspective.
function _chLimb3(K, cam, name, joints, rs, color, shade, o = {}) {
  const pj = joints.map(cam.P);
  const pts = pj.map(q => [q[0], q[1]]);
  // avoid degenerate (foreshortened) segments
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 2) pts[i] = [pts[i - 1][0] + .5, pts[i - 1][1] + 2];
  const r = rs.map((v, i) => v * pj[i][3]);
  drawSleeve(K, name, pts, r, color, shade, o.cuff || null, o.capStart !== false, !!o.seamless, o.sleeve || { folds: o.folds !== false && !o.leg });
  return pj;
}
// A whole leg as one tapered tube (hip -> knee -> ankle) instead of two tubes: the thigh narrows into the knee,
// the calf swells a little and slims into the ankle, so bent legs bend instead of kinking. r: [hip, knee, ankle].
function _chLeg(K, cam, name, Hh, Kn, A, r, color, shade) {
  const P = [Hh, _chV(Hh, Kn, .5), Kn, _chV(Kn, A, .38), A].map(cam.P);
  const pts = P.map(q => [q[0], q[1]]);
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 2) pts[i] = [pts[i - 1][0] + .5, pts[i - 1][1] + 2];
  const rs = [r[0], lerp(r[0], r[1], .55), r[1], r[1] * 1.04, r[2]].map((v, i) => v * P[i][3]);
  drawSleeve(K, name, pts, rs, color, shade, null, true, false, { folds: false });
  // a soft crease behind a bent knee
  const a1 = Math.atan2(pts[2][1] - pts[1][1], pts[2][0] - pts[1][0]), a2 = Math.atan2(pts[3][1] - pts[2][1], pts[3][0] - pts[2][0]);
  let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) > .35 && rs[2] * K.s > 4) {
    const nx = -Math.sin((a1 + a2) / 2), ny = Math.cos((a1 + a2) / 2), sd = d > 0 ? 1 : -1, k = pts[2];
    K.ink(name + 'kc', [[k[0] + nx * sd * rs[2] * .95, k[1] + ny * sd * rs[2] * .95], [k[0] + nx * sd * rs[2] * .35 + Math.cos(a1) * rs[2] * .3, k[1] + ny * sd * rs[2] * .35 + Math.sin(a1) * rs[2] * .3]], 1.4, { alpha: .5 });
  }
}
// Boot / shoe from ankle to toe.
function _chBoot(K, cam, name, ankle, toe, r, color, deep) {
  const a = cam.P(ankle), t = cam.P(toe);
  const pts = limbPts([[a[0], a[1]], [lerp(a[0], t[0], .5), lerp(a[1], t[1], .5) + 2 * a[3]], [t[0], t[1] + .1]], [r * a[3], r * 1.05 * lerp(a[3], t[3], .5), r * .95 * t[3]], 6, true);
  K.shape(name, pts, color, { tex: .2, lw: 2.6, shade: gg => { gg.fillStyle = deep; gg.globalAlpha = .7; gg.fillRect(-5000, Math.max(a[1], t[1]) + r * .3, 10000, 400); } });
  K.ink(name + 'gl', [[lerp(a[0], t[0], .55) - r * .3, lerp(a[1], t[1], .55) - r * .45], [lerp(a[0], t[0], .8) - r * .2, lerp(a[1], t[1], .8) - r * .4]], 2.2, { color: '#e0b48a', alpha: .6 });
}
function _chShadow(g, x, y, rx, ry, a = .22) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(80,50,30,${a})`); gr.addColorStop(1, 'rgba(80,50,30,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
}

// =====================================================================================
// v2 full-body poses (round 2): side-view run cycle, run from behind, leap, bow, kneel.
// Shared helpers: pitched rings (torso leaning/bowing), 2-bone IK, camera-aware depth sorting.
// =====================================================================================
const _D2R = Math.PI / 180;
const _dirYZ = a => [Math.cos(a * _D2R), Math.sin(a * _D2R)];          // (y, z) for an angle from straight down, forward positive
// rotate p about pivot (py, pz) by pitch th (forward lean: points above the pivot move +z)
function _pitchP(p, py, pz, th) { const dy = p[1] - py, dz = p[2] - pz, c = Math.cos(th), s = Math.sin(th); return [p[0], py + dy * c + dz * s, pz + dz * c - dy * s]; }
// a ring tilted with the body (pitch about x), projected; q.a = ring angle (PI/2 = body front)
function _chRingP(cam, c, rx, rz, n = 28, pitch = 0, flare = null) {
  const out = [], sp = Math.sin(pitch), cp = Math.cos(pitch);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let p = [c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * rz * sp, c[2] + Math.sin(a) * rz * cp];
    if (flare) p = flare(p, a);
    const q = cam.P(p); q.a = a; out.push(q);
  }
  return out;
}
// 2-bone IK: elbow between S and W (segment lengths L1, L2), bending toward `pole` (a direction).
function _ik2(S, W, L1, L2, pole) {
  const d = [W[0] - S[0], W[1] - S[1], W[2] - S[2]], D = Math.hypot(...d) || 1, u = d.map(v => v / D);
  const Dc = Math.min(D, (L1 + L2) * .999), a = (L1 * L1 - L2 * L2 + Dc * Dc) / (2 * Dc), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  let pv = pole.map((v, i) => v - u[i] * (pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2])); const pl = Math.hypot(...pv) || 1; pv = pv.map(v => v / pl);
  return [S[0] + u[0] * a + pv[0] * h, S[1] + u[1] * a + pv[1] * h, S[2] + u[2] * a + pv[2] * h];
}
const _mid3 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const CL_V2 = { runSide: 1, runBack: 1, leap: 1, bow: 1, kneel: 1 };
// Claude's 8-drawing run: per leg phase [thigh, shin, foot] (degrees from straight down, forward +) and body bob per drawing.
// 0 contact . 1 down . 2 push . 3 toe-off (flight) . 4 heel kick . 5 swing through . 6 high knee . 7 reach
const CL_RUN_LEG = [[32, 12, 100], [20, -36, 86], [-8, -46, 60], [-32, -66, 4], [-16, -126, -40], [34, -98, -22], [78, 0, 44], [60, 34, 82]];
const CL_RUN_BOB = [8, 13, 2, -12, 8, 13, 2, -12];
function _clLeg(x, hy, hz, ang, Lt = 170, Ls = 152, Lf = 38) {
  const t = _dirYZ(ang[0]), s = _dirYZ(ang[1]), f = _dirYZ(ang[2]);
  const K = [x, hy + Lt * t[0], hz + Lt * t[1]], A = [x * 1.03, K[1] + Ls * s[0], K[2] + Ls * s[1]], T = [x * 1.1, A[1] + Lf * f[0], A[2] + Lf * f[1]];
  return { K, A, T };
}
// arm swing s in [-1, 1] (1 = fully forward): upper-arm angle and elbow bend in the torso frame, shoulder S
function _clArmSwing(S, s, Lu = 86, Lf = 84, inX = .72) {
  const thU = s > 0 ? 50 * s : 72 * s, beta = lerp(62, 98, (s + 1) / 2), thF = thU + beta;
  const u = _dirYZ(thU), fv = _dirYZ(thF);
  const E = [S[0] * 1.06, S[1] + Lu * u[0], S[2] + Lu * u[1]];
  return { E, W: [S[0] * (s > 0 ? lerp(1.04, inX, s) : 1.06), E[1] + Lf * fv[0], E[2] + Lf * fv[1]] };
}
function _claudeRigV2(o, J) {
  const pose = o.pose, t = o.t || 0;
  J.v2 = true; J.torsoPitch = 0; J.skirtPitch = 0; J.hipZ = 0; J.shadowK = 1; J.hairLag = 0; J.bagLag = [0, 0]; J.hemTrail = 0;
  const upper = ['N', 'SL', 'SR', 'EL', 'ER', 'WL', 'WR'];
  if (pose === 'runSide' || pose === 'runBack') {
    const N8 = 8, fr = o.frame != null ? o.frame : Math.floor(t * 12 / (o.hold || 1));
    const d = ((fr % N8) + N8) % N8, bob = CL_RUN_BOB[d], crouch = 22, hipY = 196 + crouch + bob;
    const lean = (o.lean != null ? o.lean : 21 + (d % 4 === 3 ? 4 : d % 4 === 1 ? -2 : 0)) * _D2R;
    const lA = _clLeg(-31, hipY, 0, CL_RUN_LEG[d]), lB = _clLeg(31, hipY, 0, CL_RUN_LEG[(d + 4) % 8]);
    Object.assign(J, { HL: [-30, hipY, 0], HR: [30, hipY, 0], KL: lA.K, AL: lA.A, TL: lA.T, KR: lB.K, AR: lB.A, TR: lB.T });
    Object.assign(J, { N: [0, crouch + bob, 0], SL: [-54, 16 + crouch + bob, 0], SR: [54, 16 + crouch + bob, 0] });
    const sA = Math.cos(2 * Math.PI * (d - 3.6) / 8), aA = _clArmSwing(J.SL, sA), aB = _clArmSwing(J.SR, -sA);
    Object.assign(J, { EL: aA.E, WL: aA.W, ER: aB.E, WR: aB.W, handL: 'fist', handR: 'fist' });
    for (const k of upper) J[k] = _pitchP(J[k], hipY, 0, lean);
    const lag = (CL_RUN_BOB[d] - CL_RUN_BOB[(d + 7) % 8]) / 14;     // + while the body drops: hair, cape and bag lag upward
    Object.assign(J, { bob: crouch + bob, waistZ: (hipY - (172 + crouch + bob)) * Math.sin(lean) + 4, torsoPitch: lean, skirtPitch: lean * .35, drawing: d,
      capeWind: [0, -8 - 34 * lag, -66], capeLift: .35, capeSpread: .06, skirtFlare: .45, hemTrail: 1, hairLag: -.55 * lag, hairFlutter: 1.5,
      bagLag: [-18 * lag - 6, -86 + 14 * Math.sin(d * Math.PI / 2)], shadowK: 1 - Math.max(0, -bob) / 40, lean: 0, runCycle: true, nod: .05 * lag });
  }
  if (pose === 'leap') {
    // the far leg leads with a high knee, the near leg trails long behind; the near arm reaches forward and up, the far arm swings back
    const hipY = 196 - 34, lean = (o.lean != null ? o.lean : 22) * _D2R;
    const lB = _clLeg(36, hipY, 0, [84, 14, 50]), lA = _clLeg(-38, hipY, 0, [-38, -76, -26]);
    Object.assign(J, { HL: [-30, hipY, 0], HR: [30, hipY, 0], KL: lA.K, AL: lA.A, TL: lA.T, KR: lB.K, AR: lB.A, TR: lB.T });
    Object.assign(J, { N: [0, -34, 0], SL: [-54, -18, 0], SR: [54, -18, 0] });
    const sl = J.SL, sr = J.SR, up = _dirYZ(128), up2 = _dirYZ(146), bk = _dirYZ(-64), bk2 = _dirYZ(-22);
    J.EL = [sl[0] * 1.15, sl[1] + 86 * up[0], sl[2] + 86 * up[1]]; J.WL = [sl[0] * 1.1, J.EL[1] + 84 * up2[0], J.EL[2] + 84 * up2[1]];
    J.ER = [sr[0] * 1.1, sr[1] + 86 * bk[0], sr[2] + 86 * bk[1]]; J.WR = [sr[0] * 1.14, J.ER[1] + 84 * bk2[0], J.ER[2] + 84 * bk2[1]];
    Object.assign(J, { handL: o.reachHand || 'open', handR: 'fist' });
    for (const k of upper) J[k] = _pitchP(J[k], hipY, 0, lean);
    Object.assign(J, { bob: -34, waistZ: 10, torsoPitch: lean, skirtPitch: lean * .4, capeWind: [0, -22, -70], capeLift: .45, capeSpread: .1, skirtFlare: .8, hemTrail: 1.3,
      hairLag: .25, hairFlutter: 1.8, bagLag: [-30, -96], shadowK: .55, runCycle: true, nod: 0 });
  }
  if (pose === 'bow') {
    const b = o.bow != null ? clamp(o.bow) : 1, ang = (o.bowAngle != null ? o.bowAngle : 66) * b * _D2R, hz = -18 * b, hipY = 196;
    Object.assign(J, { HL: [-30, hipY, hz], HR: [30, hipY, hz], KL: [-31, 366, 2 - 6 * b], KR: [31, 366, 2 - 6 * b], AL: [-32, 518, -2], AR: [32, 518, -2], TL: [-36, 536, 34], TR: [36, 536, 34] });
    for (const k of ['N', 'SL', 'SR']) J[k] = _pitchP([J[k][0], J[k][1], J[k][2] + hz], hipY, hz, ang);
    const front = (o.hands || 'front') === 'front';
    for (const sd of ['L', 'R']) {
      const S = J['S' + sd], sx = sd === 'L' ? -1 : 1;
      const W = front ? [sx * 9, 300 - 26 * b, 44 + 8 * b] : [sx * 40, 300, 12 + 6 * b];
      J['W' + sd] = W; J['E' + sd] = _ik2(S, W, 88, 86, front ? [sx, .2, .4] : [sx * .4, 0, -1]);
    }
    Object.assign(J, { handL: front ? 'flat' : 'relaxed', handR: front ? 'flat' : 'relaxed', waistZ: hz * .6, torsoPitch: ang, skirtPitch: ang * .18, hipZ: hz, bowAmt: b, bowAng: ang, nod: 0 });
  }
  if (pose === 'kneel') {
    const sit = o.sit != null ? clamp(o.sit) : .55, hipY = lerp(364, 470, sit), hipZ = lerp(4, -104, sit), lean = (o.lean != null ? o.lean : 6) * _D2R;
    const kneeY = 530, kneeZ = hipZ + Math.sqrt(Math.max(0, 170 * 170 - Math.pow(kneeY - hipY, 2)));
    for (const [sd, sx] of [['L', -1], ['R', 1]]) {
      J['H' + sd] = [sx * 30, hipY, hipZ]; J['K' + sd] = [sx * 32, kneeY, kneeZ + (sx < 0 ? 4 : -4)];
      J['A' + sd] = [sx * 30, 534, kneeZ - 148]; J['T' + sd] = [sx * 26, 544, kneeZ - 184];
    }
    const dy = hipY - 196;
    for (const k of ['N', 'SL', 'SR']) J[k] = _pitchP([J[k][0], J[k][1] + dy, J[k][2] + hipZ], hipY, hipZ, lean);
    const arms = o.arms || 'lap';
    for (const sd of ['L', 'R']) {
      const S = J['S' + sd], sx = sd === 'L' ? -1 : 1; let W, pole;
      if (arms === 'reach') { const r = o.reach || [hipY - 40, hipZ + 170]; W = [sx * 24, r[0], r[1]]; pole = [sx, .6, -.2]; }
      else if (arms === 'clasp') { W = [sx * 6, S[1] + 104, S[2] + 46]; pole = [sx, .5, -.3]; }
      else { const kn = J['K' + sd]; W = [sx * 22, lerp(hipY, kn[1], .62) - 18, lerp(hipZ, kn[2], .62) + 6]; pole = [sx, 0, -.5]; }
      J['W' + sd] = W; J['E' + sd] = _ik2(S, W, 88, 86, pole);
    }
    Object.assign(J, { handL: arms === 'reach' ? 'open' : arms === 'clasp' ? 'relaxed' : 'flat', handR: arms === 'reach' ? 'open' : arms === 'clasp' ? 'relaxed' : 'flat',
      bob: dy, waistZ: hipZ + (hipY - 172 - dy) * Math.sin(lean), torsoPitch: lean, skirtPitch: 0, hipZ, kneel: { sit, hipY, hipZ, kneeY, kneeZ }, nod: 0 });
  }
  return J;
}
function _clDir(o) { return (o.dir === 'left' || o.dir === -1) ? -1 : 1; }
function _clCamFor(o) {
  if (CL_V2[o.pose]) {
    const dir = _clDir(o), dflt = { runSide: dir * Math.PI / 2, runBack: Math.PI - dir * .22, leap: Math.PI - dir * .5, bow: dir * 1.15, kneel: dir * .45 }[o.pose];
    const yaw = o.yaw != null ? o.yaw : dflt, behind = Math.cos(yaw) < -.3;
    return _chCam({ yaw, D: o.D || (behind ? 1000 : 2600), eye: o.eye == null ? (behind ? 330 : 260) : o.eye });
  }
  return _chCam({ yaw: o.yaw != null ? o.yaw : (o.pose === 'sing' ? .28 : 0), D: o.D || (o.pose === 'run' ? 720 : 2600), eye: o.eye == null ? (o.pose === 'run' ? 300 : 260) : o.eye });
}
// head turn/tilt/back flag for a v2 figure seen from camera yaw
function _v2Head(J, cam, o) {
  const fc = Math.cos(cam.yaw), sn = Math.sin(cam.yaw), back = fc < -.3;
  const turn = back ? 0 : clamp(sn * .78, -.6, .6) + (o.turn || 0);
  let tilt = J.headTilt || 0;
  // in profile the head rotates with the lean/bow; toward the camera it can't, so it squashes (pitch) instead
  const side = Math.min(1, Math.abs(sn) / .9);
  if (!back) tilt += sn * ((J.torsoPitch || 0) * (J.bowAng ? .95 : .55) * (J.bowAng ? side * side : 1) + (J.nod || 0));
  else tilt += -sn * (J.torsoPitch || 0) * .3;
  const pitch = J.bowAng ? clamp(Math.abs(fc) * (J.torsoPitch || 0) / 1.1) : 0;
  return { back, turn, tilt: tilt + (o.tilt || 0), fc, sn, pitch };
}

function _drawApprenticeFullV2(g, x, y, s, o, J, P, K, cam) {
  const C = CLAUDE, f = P.frame, H = _v2Head(J, cam, o), back = H.back;
  const tp = J.torsoPitch || 0, skp = J.skirtPitch || 0, bob = J.bob || 0, wz = J.waistZ || 0;
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(0, -CL_GROUND);
  if (o.shadow !== false) { const a = cam.P([0, CL_GROUND, J.hipZ || 0]), k = J.shadowK; _chShadow(g, a[0], a[1] + 4, 150 * a[3] * k, 26 * a[3] * k, .24 * k); }
  const camZ = p => cam.P(p)[2], cZ = camZ([0, 150 + bob, wz]);
  const parts = [];
  // legs (always under the skirt), sorted among themselves by camera depth
  for (const sd of ['L', 'R']) {
    const Hh = J['H' + sd], Kn = J['K' + sd], A = J['A' + sd], T = J['T' + sd];
    parts.push({ z: -1000 + (camZ(Kn) + camZ(A)) / 2 - cZ, d: () => {
      _chLeg(K, cam, 'lg' + sd, Hh, Kn, A, [27, 17.5, 12.5], C.tights, C.tightsDeep);
      _chBoot(K, cam, 'bt' + sd, A, T, 18, C.boot, C.bootDeep); } });
  }
  const armPart = (sd) => {
    const S = J['S' + sd], E = J['E' + sd], Wr = J['W' + sd], hk = J['hand' + sd];
    const upper = () => _chLimb3(K, cam, 'ua' + sd, [S, E], [21, 18.5], C.jacket, C.jacketShade);
    const fore = () => {
      const pe = cam.P(E), pw = cam.P(Wr);
      _chLimb3(K, cam, 'fa' + sd, [E, _chV(E, Wr, .5), Wr], [18.5, 16.5, 14.5], C.jacket, C.jacketShade, { cuff: C.trim, seamless: true });
      const ang = Math.atan2(pw[1] - pe[1], pw[0] - pe[0]);
      const fs = Math.hypot(pw[0] - pe[0], pw[1] - pe[1]) < 30 * pw[3] && hk === 'fist';
      // which way the hand mirrors depends on whether we see its palm side: flip for the far side / from behind
      const mir = (sd === 'L' ? -1 : 1) * (H.fc < -.3 ? -1 : 1);
      drawHand(K, 'hd' + sd, pw[0], pw[1], fs ? -Math.PI / 2 : ang, .9 * pw[3], hk, mir, C.skin, C.skinShade);
    };
    return { upper, fore, zU: camZ(_mid3(S, E)) - cZ, zF: camZ(_mid3(E, Wr)) - cZ };
  };
  const aL = armPart('L'), aR = armPart('R');
  for (const a of [aL, aR]) {
    if (a.zU < -25) parts.push({ z: a.zU - 500, d: a.upper });
    parts.push({ z: a.zF > 15 ? a.zF + 100 : a.zF - 500, d: a.fore });
  }
  const N = J.N, flare = J.skirtFlare || 0, trail = J.hemTrail || 0, w0 = J.capeWind || [0, 0, 0];
  // seen from behind the wind would fold the cape up out of sight behind her head: let it hang and ripple toward us instead
  const wind = back ? [w0[0], Math.max(0, w0[1] * -.15), w0[2] * .45] : w0;
  parts.push({ z: 0, d: () => {
    const wc = [0, 170 + bob, wz];
    // satchel: hangs from the strap at her left hip; bounces with lag in the run
    const bl = J.bagLag || [0, 0], bagP = [64, 178 + bob + bl[0], wc[2] + 32 + bl[1]], bagC = cam.P(bagP), bagBehind = camZ(bagP) - cZ < -12;
    const drawBag = () => {
      const bw = 40 * bagC[3] * (.55 + .45 * Math.abs(H.fc)), bh = 34 * bagC[3];
      const bag = crSpline([[bagC[0] - bw, bagC[1] - bh * .7], [bagC[0] + bw, bagC[1] - bh * .7], [bagC[0] + bw * 1.05, bagC[1] + bh * .8], [bagC[0], bagC[1] + bh], [bagC[0] - bw * 1.05, bagC[1] + bh * .8]], true, 4);
      K.shape('bag', bag, C.satchel, { tex: .3, lw: 2.4, shade: gg => { gg.fillStyle = C.strapDeep; gg.globalAlpha = .5; gg.fillRect(bagC[0] - bw * 2, bagC[1] + bh * .3, bw * 4, bh); } });
      if (!bagBehind || H.fc > -.3) {
        const flap = crSpline([[bagC[0] - bw, bagC[1] - bh * .75], [bagC[0] + bw, bagC[1] - bh * .75], [bagC[0] + bw * .9, bagC[1] + bh * .1], [bagC[0], bagC[1] + bh * .3], [bagC[0] - bw * .9, bagC[1] + bh * .1]], true, 4);
        K.shape('bagf', flap, C.strap, { tex: .3, lw: 2.2 });
        if (H.fc > -.3) _sparkClip(K, bagC[0], bagC[1] + bh * .05, .45 * bagC[3] * (.55 + .45 * Math.abs(H.fc)), C);
      }
    };
    if (bagBehind) drawBag();
    // skirt: waist ring tilted a little with the pelvis; the hem flares, trails back in the wind and drapes over raised knees
    const waist = _chRingP(cam, wc, 50, 33, 28, skp);
    const knees = [J.KL, J.KR].filter(q => q[2] - wz > 50);
    const kn = J.kneel, hemY = kn ? Math.min(322 + bob, 542) : 322 + bob;
    const fl = (p, a) => {
      const ph = Math.sin(a * 3 + f * 1.9) * flare * 10, bk = (1 - Math.sin(a)) * .5;
      let q = [p[0] * (1 + flare * .15) + ph, p[1] - flare * 14 * (1 + Math.sin(a * 2 + f * 2.3)) * .5 - trail * bk * (20 + 8 * Math.sin(f * 2.1 + a)), p[2] - flare * 14 - trail * (10 + 24 * bk)];
      for (const k2 of knees) { const w = Math.max(0, Math.sin(a)) * Math.exp(-Math.pow((q[0] - k2[0]) / 60, 2)); q = [q[0], lerp(q[1], Math.min(q[1], k2[1] + 30), w), lerp(q[2], Math.max(q[2], k2[2] + 24), w)]; }
      if (kn) q[1] = Math.min(q[1], 544);
      return q;
    };
    const hem = _chRingP(cam, [0, hemY, wc[2] + (kn ? 20 : 0)], kn ? 112 : 102, kn ? 84 : 70, 32, skp * .5, fl);
    const sk = _chCone(waist, hem);
    K.shape('skirt', sk.pts, C.skirt, { tex: .24, lw: 2.8, shade: gg => { gg.fillStyle = C.skirtShade; gg.globalAlpha = .7; P2(gg, chTr(sk.pts, 28, 0)); gg.fill(); } });
    const hc = camZ([0, hemY, wc[2]]);
    for (let i = 0; i < 32; i += 2) { const h = hem[i], w = waist[Math.round(i / 32 * 28) % 28]; if (h[2] - hc > 22) K.ink('pl' + i, [[w[0], w[1]], [h[0], h[1] - 2]], 1.4, { alpha: .45, color: '#22403d' }); }
    // torso (jacket) from shoulders to waist, both rings tilted with the lean
    const sh = _chRingP(cam, _chAdd(N, [0, 18 * Math.cos(tp), -4 + 18 * Math.sin(tp)]), 56, 34, 28, tp);
    const wj = _chRingP(cam, [0, 180 + bob, wc[2]], 49, 32, 28, tp * .7);
    const torso = _chHull([...sh, ...wj]);
    K.shape('torso', torso, C.jacket, { tex: .16, lw: 2.8, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .8; P2(gg, chTr(torso, 20, 0)); gg.fill(); } });
    const jh = _chCone(_chRingP(cam, [0, 164 + bob, wc[2] + 16 * Math.sin(tp * .7)], 51, 33, 28, tp * .7), wj);
    K.shape('jhem', jh.pts, mix(C.jacket, C.trim, .55), { tex: .2, lw: 2 });
    for (const a of [aL, aR]) if (a.zU >= -25) a.upper();
    // strap: across the front (or the back, seen from behind)
    const zs = back ? -1 : 1;
    const strapA = cam.P(_chAdd(N, [-52, 6, 10 * zs])), strapB = cam.P([bagP[0] - 4, bagP[1] - 26, bagP[2]]);
    K.ink('fstrap', [[strapA[0], strapA[1]], [strapB[0], strapB[1]]], 9 * bagC[3], { color: C.strap, taper: false });
    K.ink('fstrapE', [[strapA[0], strapA[1]], [strapB[0], strapB[1]]], 1.4, { taper: false, alpha: .6 });
    if (!bagBehind) drawBag();
    // capelet: neck ring to scalloped hem ring, tilted with the torso; wind lifts the back
    const nr = _chRingP(cam, _chAdd(N, [0, -30, 0]), 22, 16, 28, tp);
    const spr = J.capeSpread || 0, lift = (J.capeLift || 0) * (back ? .4 : 1);
    const cw = (p, a) => { const bk = (1 - Math.sin(a)) * .5, sd = Math.abs(Math.cos(a)); const flt = Math.sin(a * 2 + f * 2.7) * 6 * (Math.abs(wind[0]) + Math.abs(wind[2])) / 40; const wav = lift * (10 + 8 * Math.sin(a * 5 + f * 3.1)); return [p[0] * (1 + spr * sd) + wind[0] * bk + flt, p[1] + wind[1] * bk * 1.2 - spr * sd * 30 - wav * sd, p[2] + wind[2] * bk]; };
    const cc = _chAdd(N, [0, 66 * Math.cos(tp), 66 * Math.sin(tp)]);
    const cr = _chRingP(cam, cc, 112, 70, 32, tp, cw);
    const cape = _chCone(nr, cr, 12 * cr[0][3], 7);
    K.shape('fcape', cape.pts, C.jacket, { tex: .16, lw: 2.8, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .7; P2(gg, chTr(cape.pts, 22, 14)); gg.fill(); } });
    K.ink('fcapeTrim', chTr(cape.botArc, 0, -5 * cr[0][3]), 3, { color: C.trim, taper: false, alpha: .9 });
    // collar + bow, only while we can see her front; narrowed as she turns away
    if (H.fc > -.25) {
      const nk = cam.P(_chAdd(N, [0, -30 * Math.cos(tp) + 18 * Math.sin(tp), 18 * Math.cos(tp) + 30 * Math.sin(tp)])), xs = Math.max(.3, Math.abs(H.fc)), ox = H.sn * 10 * (1 - xs);
      for (const side of [-1, 1]) {
        if (xs < .5 && side === -Math.sign(H.sn)) continue;      // the far collar flap hides behind the neck in profile
        const flap2 = crSpline([[2, -4], [18, -12], [36, -4], [38, 10], [24, 20], [8, 16]].map(([px, py]) => [nk[0] + ox + side * px * xs, nk[1] + py]), true, 5);
        K.shape('fcol' + side, flap2, '#fffaf0', { tex: .06, lw: 2 });
      }
      g.save(); g.translate(nk[0] + ox, nk[1] + 6); g.scale(xs, 1); _ribbonBow(K, 0, 0, .8, C); g.restore();
    }
  } });
  parts.sort((a, b) => a.z - b.z);
  const nP = cam.P(N), hk = nP[3];
  const wind2 = J.runCycle ? (back ? [0, -.6 + J.hairLag] : [-H.sn * 1.5, -.25 + J.hairLag]) : J.bowAng ? [Math.sin(H.tilt) * .9, .35] : J.hairWind;
  const HP = { ...P, turn: H.turn, back, wind: o.wind || wind2, flutter: o.flutter != null ? o.flutter : (J.hairFlutter || (J.bowAng ? .4 : 0)), splay: o.splay != null ? o.splay : (back && J.runCycle ? 1.1 : J.runCycle ? .35 : 0) };
  const head = (layer) => { g.save(); g.translate(nP[0], nP[1] - 6 + 40 * H.pitch * hk); g.scale(hk, hk * (1 - .22 * H.pitch)); g.rotate(H.tilt); drawClaudeHead(K, HP, layer); g.restore(); };
  if (!back) head('back');
  for (const p of parts.filter(q => q.z < 0)) p.d();
  g.save(); g.translate(nP[0], nP[1] - 6); g.scale(hk, hk); g.rotate(H.tilt * .5); _claudeNeck(K, P); g.restore();
  for (const p of parts.filter(q => q.z >= 0 && q.z < 100)) p.d();
  head(back ? 'all' : 'front');
  for (const p of parts.filter(q => q.z >= 100)) p.d();
  g.restore();
}

// ---------------- Claude full-body rig ----------------
// Proportions (local units, neck base = 0): waist 172, skirt hem 318, knees 362, ankles 520, ground 550.
// Returns joints for a pose. L = screen-left limb (her right), R = screen-right.
const CL_GROUND = 550;
function _claudeRig(o) {
  const pose = o.pose || 'stand', t = o.t || 0;
  const J = {
    N: [0, 0, 0], SL: [-54, 16, 0], SR: [54, 16, 0], EL: [-68, 100, -4], ER: [68, 100, -4], WL: [-72, 188, 8], WR: [72, 188, 8],
    HL: [-30, 196, 0], HR: [30, 196, 0], KL: [-31, 366, 4], KR: [31, 366, 4], AL: [-32, 518, 0], AR: [32, 518, 0], TL: [-36, 536, 36], TR: [36, 536, 36],
    handL: 'relaxed', handR: 'relaxed', headTilt: 0, lean: 0, skirtFlare: 0, capeWind: [0, 0, 0], hairWind: [0, 0], hairFlutter: 0, splay: 0, bob: 0, waistZ: 0,
  };
  if (pose === 'stand') {
    Object.assign(J, { EL: [-78, 100, -8], WL: [-62, 184, 22], HL: [-30, 198, 0], HR: [30, 194, 0], KL: [-34, 368, 10], KR: [27, 362, 8], AL: [-42, 520, 0], AR: [32, 518, -6], TL: [-52, 536, 34], TR: [42, 536, 30],
      ER: [72, 92, 4], WR: [46, 140, 46], handR: 'strap', handL: 'relaxed', headTilt: -.05 });
  }
  if (pose === 'wave') Object.assign(J, { EL: [-110, 56, 10], WL: [-118, -56, 20], handL: 'open', headTilt: -.06 });
  if (pose === 'sing') {
    // belting it out on the rooftop: one arm flung to the sky, the other open to the side, chin up, wind from screen-left
    const sw = Math.sin(t * 2.4) * .05;
    Object.assign(J, { SL: [-56, -4, 0], EL: [-112, -92, 10], WL: [-160, -200 + sw * 60, 20], handL: 'open',
      SR: [54, 16, 0], ER: [118, 76, 16], WR: [176, 120, 30], handR: 'open', HL: [-30, 196, 0], HR: [30, 196, 0], KL: [-48, 364, 8], KR: [40, 366, 0], AL: [-70, 518, 0], AR: [54, 518, 0], TL: [-86, 536, 30], TR: [64, 536, 30],
      N: [0, 4, -8], headTilt: .2 + sw, capeWind: [90, -40, -30], capeStream: .7, streamDir: [1, 0], hairWind: [1.4, -.3], hairFlutter: 1.4, skirtFlare: .5 });
  }
  if (CL_V2[pose]) return _claudeRigV2(o, J);
  if (pose === 'run') {
    // Running at the camera: 4 drawings (drive R, reach R, drive L, reach L), each held `hold` boil frames.
    const N = 4, fr = o.frame != null ? o.frame : Math.floor(t * 12 / (o.hold || 1.5));
    const d = ((fr % N) + N) % N, mirror = d >= 2, key = d % 2;
    const lean = 110;
    const KEYS = [
      { bob: 12, drive: { K: [34, 236, 220], A: [36, 392, 132], T: [38, 410, 176] }, push: { K: [-33, 372, -10], A: [-35, 512, -130], T: [-37, 534, -112] },
        fwdArm: { E: [-84, 168, lean + 30], W: [-34, 150, lean + 160] }, backArm: { E: [88, 96, lean - 120], W: [74, 180, lean - 110] }, tilt: .04 },
      { bob: -14, drive: { K: [33, 318, 140], A: [35, 482, 136], T: [37, 500, 180] }, push: { K: [-33, 344, -50], A: [-35, 400, -196], T: [-37, 388, -212] },
        fwdArm: { E: [-88, 160, lean + 10], W: [-54, 176, lean + 90] }, backArm: { E: [88, 120, lean - 70], W: [68, 186, lean - 40] }, tilt: .015 },
    ];
    const k = KEYS[key], mx = v => mirror ? [-v[0], v[1], v[2]] : v, by = v => [v[0], v[1] + k.bob, v[2]];
    const dr = mirror ? 'L' : 'R', pu = mirror ? 'R' : 'L', fa = mirror ? 'R' : 'L', ba = mirror ? 'L' : 'R';
    const bob = k.bob;
    Object.assign(J, { N: [0, 62 + bob, lean + 40], SL: [-58, 66 + bob, lean + 20], SR: [58, 66 + bob, lean + 20],
      HL: [-30, 196 + bob, 20], HR: [30, 196 + bob, 20], handL: 'fist', handR: 'fist', waistZ: 40, capeSpread: .12, capeLift: 1,
      headTilt: (mirror ? -1 : 1) * k.tilt - .06, capeWind: [0, -40, -60], hairWind: [0, -.9 + (key ? .25 : -.2)], hairFlutter: 1.6, splay: 1.3 + (key ? -.15 : .15), skirtFlare: .7, bob, lean, drawing: d,
      bagLag: key ? [10, -14 + (mirror ? 6 : -6)] : [-16, -6] });
    J['K' + dr] = by(mx(k.drive.K)); J['A' + dr] = by(mx(k.drive.A)); J['T' + dr] = by(mx(k.drive.T));
    J['K' + pu] = by(mx(k.push.K)); J['A' + pu] = by(mx(k.push.A)); J['T' + pu] = by(mx(k.push.T));
    J['E' + fa] = by(mx(k.fwdArm.E)); J['W' + fa] = by(mx(k.fwdArm.W));
    J['E' + ba] = by(mx(k.backArm.E)); J['W' + ba] = by(mx(k.backArm.W));
  }
  return J;
}

function drawApprenticeFull(g, x, y, s = 1, o = {}) {
  const C = CLAUDE, t = o.t || 0;
  const J = _claudeRig(o);
  const bowDflt = o.pose === 'bow' && !o.expr ? { eyes: 'closed', mouth: 'wavy', brow: .35, browTilt: 1, blush: .8 } : {};
  const P = resolveExpr({ expr: o.pose === 'sing' ? 'sing' : (o.pose === 'run' || o.pose === 'runSide' || o.pose === 'runBack' || o.pose === 'leap') ? 'determined' : 'neutral', ...bowDflt, ...o });
  const K = charKit(g, t, s, { line: C.line, seed: 'clf', ..._chKitOpts(o) });
  if (P.frame == null) P.frame = o.frame != null ? o.frame : K.bf;
  if (J.v2) { _drawApprenticeFullV2(g, x, y, s, o, J, P, K, _clCamFor(o)); return; }
  const cam = _chCam({ yaw: o.yaw != null ? o.yaw : (o.pose === 'sing' ? .28 : 0), D: o.D || (o.pose === 'run' ? 720 : 2600), eye: o.eye == null ? (o.pose === 'run' ? 300 : 260) : o.eye });
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(0, -CL_GROUND);
  if (o.shadow !== false) { const a = cam.P([0, CL_GROUND, 0]); _chShadow(g, a[0], a[1] + 4, 150 * a[3], 26 * a[3], o.pose === 'run' ? .16 : .24); }
  const parts = [];
  const wind = J.capeWind, flare = J.skirtFlare, f = P.frame;
  // --- legs: thigh under the skirt; shin+boot sorted by depth
  for (const sd of ['L', 'R']) {
    const H = J['H' + sd], Kn = J['K' + sd], A = J['A' + sd], T = J['T' + sd];
    parts.push({ z: -1000 + (Kn[2] + A[2]) / 2 - (sd === 'L' ? .1 : 0), d: () => {
      _chLeg(K, cam, 'lg' + sd, H, Kn, A, [27, 17.5, 12.5], C.tights, C.tightsDeep);
      _chBoot(K, cam, 'bt' + sd, A, T, 18, C.boot, C.bootDeep); } });
  }
  // --- arms: upper arm under the capelet (or behind the body), forearm+hand by depth
  const armPart = (sd) => {
    const S = J['S' + sd], E = J['E' + sd], Wr = J['W' + sd], hk = J['hand' + sd];
    const upper = () => _chLimb3(K, cam, 'ua' + sd, [S, E], [21, 18.5], C.jacket, C.jacketShade);
    const fore = () => {
      const pe = cam.P(E), pw = cam.P(Wr);
      _chLimb3(K, cam, 'fa' + sd, [E, _chV(E, Wr, .5), Wr], [18.5, 16.5, 14.5], C.jacket, C.jacketShade, { cuff: C.trim, seamless: true });
      const ang = Math.atan2(pw[1] - pe[1], pw[0] - pe[0]);
      const fs = Math.hypot(pw[0] - pe[0], pw[1] - pe[1]) < 30 * pw[3] && hk === 'fist';   // foreshortened toward camera: show fist front-on
      drawHand(K, 'hd' + sd, pw[0], pw[1], fs ? -Math.PI / 2 : ang, .9 * pw[3], hk, sd === 'L' ? -1 : 1, C.skin, C.skinShade);
    };
    return { upper, fore, zU: (S[2] + E[2]) / 2, zF: (E[2] + Wr[2]) / 2 };
  };
  const aL = armPart('L'), aR = armPart('R');
  for (const a of [aL, aR]) {
    if (a.zU < -25) parts.push({ z: a.zU - 500, d: a.upper });
    parts.push({ z: a.zF > 15 ? a.zF + 100 : a.zF - 500, d: a.fore });
  }
  // --- body group: skirt, torso, satchel, upper arms (front), capelet
  const N = J.N, lean = J.lean || 0;
  parts.push({ z: 0, d: () => {
    const wc = [0, 170 + (J.bob || 0), J.waistZ || 0];
    const waist = _chRing(cam, wc, 50, 33);
    const knees = [J.KL, J.KR].filter(q => q[2] > 60);
    const fl = (p, a) => {
      const ph = Math.sin(a * 3 + f * 1.9) * flare * 10;
      let q = [p[0] * (1 + flare * .15) + ph, p[1] - flare * 14 * (1 + Math.sin(a * 2 + f * 2.3)) * .5, p[2] - flare * 26];
      for (const kn of knees) { const w = Math.max(0, Math.sin(a)) * Math.exp(-Math.pow((q[0] - kn[0]) / 60, 2)); q = [q[0], lerp(q[1], Math.min(q[1], kn[1] + 30), w), lerp(q[2], Math.max(q[2], kn[2] + 24), w)]; }
      return q;
    };
    const hem = _chRing(cam, [0, 322 + (J.bob || 0), wc[2]], 102, 70, 32, null, fl);
    const sk = _chCone(waist, hem);
    K.shape('skirt', sk.pts, C.skirt, { tex: .24, lw: 2.8, shade: gg => { gg.fillStyle = C.skirtShade; gg.globalAlpha = .7; P2(gg, chTr(sk.pts, 28, 0)); gg.fill(); } });
    // pleats on the front-facing half
    for (let i = 0; i < 32; i += 2) { const h = hem[i], w = waist[Math.round(i / 32 * 28) % 28]; if (Math.sin(h.a) > .25) K.ink('pl' + i, [[w[0], w[1]], [h[0], h[1] - 2]], 1.4, { alpha: .45, color: '#22403d' }); }
    // torso (jacket) from shoulders to waist
    const sh = _chRing(cam, _chAdd(N, [0, 18, -4]), 56, 34), wj = _chRing(cam, [0, 180 + (J.bob || 0), wc[2]], 49, 32);
    const torso = _chHull([...sh, ...wj]);
    K.shape('torso', torso, C.jacket, { tex: .16, lw: 2.8, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .8; P2(gg, chTr(torso, 20, 0)); gg.fill(); } });
    // jacket hem band + buttons
    const jh = _chCone(_chRing(cam, [0, 164 + (J.bob || 0), wc[2]], 51, 33), wj);
    K.shape('jhem', jh.pts, mix(C.jacket, C.trim, .55), { tex: .2, lw: 2 });
    // upper arms in front of the torso but under the cape
    for (const a of [aL, aR]) if (a.zU >= -25) a.upper();
    // satchel on her left hip (screen right), strap across from her right shoulder
    const bl = J.bagLag || [0, 0], bagC = cam.P([64, 178 + (J.bob || 0) + bl[0], wc[2] + 32 + bl[1]]);
    const strapA = cam.P(_chAdd(N, [-52, 6, 10])), strapB = cam.P([60, 160 + (J.bob || 0) + bl[0], wc[2] + 32 + bl[1]]);
    K.ink('fstrap', [[strapA[0], strapA[1]], [strapB[0], strapB[1]]], 9 * bagC[3], { color: C.strap, taper: false });
    K.ink('fstrapE', [[strapA[0], strapA[1]], [strapB[0], strapB[1]]], 1.4, { taper: false, alpha: .6 });
    const bw = 40 * bagC[3], bh = 34 * bagC[3];
    const bag = crSpline([[bagC[0] - bw, bagC[1] - bh * .7], [bagC[0] + bw, bagC[1] - bh * .7], [bagC[0] + bw * 1.05, bagC[1] + bh * .8], [bagC[0], bagC[1] + bh], [bagC[0] - bw * 1.05, bagC[1] + bh * .8]], true, 4);
    K.shape('bag', bag, C.satchel, { tex: .3, lw: 2.4, shade: gg => { gg.fillStyle = C.strapDeep; gg.globalAlpha = .5; gg.fillRect(bagC[0] - bw * 2, bagC[1] + bh * .3, bw * 4, bh); } });
    const flap = crSpline([[bagC[0] - bw, bagC[1] - bh * .75], [bagC[0] + bw, bagC[1] - bh * .75], [bagC[0] + bw * .9, bagC[1] + bh * .1], [bagC[0], bagC[1] + bh * .3], [bagC[0] - bw * .9, bagC[1] + bh * .1]], true, 4);
    K.shape('bagf', flap, C.strap, { tex: .3, lw: 2.2 });
    _sparkClip(K, bagC[0], bagC[1] + bh * .05, .45 * bagC[3], C);
    // capelet: neck ring to scalloped hem ring; wind pushes the hem
    const nr = _chRing(cam, _chAdd(N, [0, -30, 0]), 22, 16);
    const spr = J.capeSpread || 0;
    const lift = J.capeLift || 0;
    const cw = (p, a) => { const back = (1 - Math.sin(a)) * .5, sd = Math.abs(Math.cos(a)); const flt = Math.sin(a * 2 + f * 2.7) * 6 * (Math.abs(wind[0]) + Math.abs(wind[2])) / 40; const wav = lift * (10 + 8 * Math.sin(a * 5 + f * 3.1)); return [p[0] * (1 + spr * sd) + wind[0] * back + flt, p[1] + wind[1] * back * 1.2 - spr * sd * 30 - wav * sd, p[2] + wind[2] * back]; };
    const cr = _chRing(cam, _chAdd(N, [0, 66, 0]), 112, 70, 32, null, cw);
    const cape = _chCone(nr, cr, 12 * cr[0][3], 7);
    K.shape('fcape', cape.pts, C.jacket, { tex: .16, lw: 2.8, shade: gg => { gg.fillStyle = C.jacketShade; gg.globalAlpha = .7; P2(gg, chTr(cape.pts, 22, 14)); gg.fill(); } });
    K.ink('fcapeTrim', chTr(cape.botArc, 0, -5 * cr[0][3]), 3, { color: C.trim, taper: false, alpha: .9 });
    // collar + bow
    const nk = cam.P(_chAdd(N, [0, -30, 18]));
    for (const side of [-1, 1]) {
      const flap2 = crSpline([[nk[0] + side * 2, nk[1] - 4], [nk[0] + side * 18, nk[1] - 12], [nk[0] + side * 36, nk[1] - 4], [nk[0] + side * 38, nk[1] + 10], [nk[0] + side * 24, nk[1] + 20], [nk[0] + side * 8, nk[1] + 16]], true, 5);
      K.shape('fcol' + side, flap2, '#fffaf0', { tex: .06, lw: 2 });
    }
    _ribbonBow(K, nk[0], nk[1] + 6, .8, C);
  } });
  if (J.capeStream) parts.push({ z: -950, d: () => {
    const nr = _chRing(cam, _chAdd(N, [0, -24, -6]), 30, 20);
    const st = J.capeStream, sd = J.streamDir || [0, 0], br = _chRing(cam, _chAdd(N, [sd[0] * 70 * st, 30 - 70 * st + Math.abs(sd[0]) * 40 * st, -100 * st]), 120, 70, 28, null, (p, a) => [p[0] + Math.sin(a * 3 + f * 2.9) * 8, p[1] + Math.sin(a * 2 + f * 2.2) * 10, p[2]]);
    const back = _chHull([...nr, ...br.filter(q => Math.sin(q.a) < .2)]);
    K.shape('capeBack', back, C.jacketShade, { tex: .16, lw: 2.8 });
  } });
  parts.sort((a, b) => a.z - b.z);
  // back hair first (behind everything), then parts, then neck+face
  const nP = cam.P(N), hk = nP[3];
  const head = (layer) => { g.save(); g.translate(nP[0], nP[1] - 6); g.scale(hk, hk); g.rotate(J.headTilt + (o.tilt || 0)); drawClaudeHead(K, { ...P, turn: clamp(cam.yaw * .9, -.6, .6) + (o.turn || 0), wind: J.hairWind, flutter: J.hairFlutter, splay: J.splay }, layer); g.restore(); };
  head('back');
  for (const p of parts.filter(q => q.z < 0)) p.d();
  // neck
  g.save(); g.translate(nP[0], nP[1] - 6); g.scale(hk, hk); g.rotate(J.headTilt * .5); _claudeNeck(K, P); g.restore();
  for (const p of parts.filter(q => q.z >= 0 && q.z < 100)) p.d();
  head('front');
  for (const p of parts.filter(q => q.z >= 100)) p.d();
  g.restore();
}

// ---------------- The Trunk of Questions ----------------
// drawTrunk(g, x, y, s, { t, open: 0..1, side: 0..1 (how much of the right side face shows), young: bool (newer, fewer scuffs), cards })
// (x,y) = bottom centre of the trunk. Size ~ 220 x 150 units at s = 1.
function drawTrunk(g, x, y, s = 1, o = {}) {
  const K = charKit(g, o.t || 0, s, { line: PROF.line, seed: 'trunk', ..._chKitOpts(o) });
  g.save(); g.translate(x, y); g.scale(s, s);
  _trunk(K, o);
  g.restore();
}
function _trunk(K, o = {}) {
  const C = PROF, g = K.g, W2 = 110, H = 150, sd = o.side == null ? .35 : o.side, dx = 44 * sd, dy = -26 * sd - 10, open = o.open || 0;
  const young = !!o.young;
  const body = young ? '#9a6a40' : C.trunk, deep = C.trunkDeep, light = C.trunkLight;
  // side face
  if (sd > 0) {
    const side = [[W2, 0], [W2 + dx, dy], [W2 + dx, dy - H], [W2, -H]];
    K.shape('tside', side, deep, { tex: .3, lw: 2.6 });
  }
  // lid (top) when closed: thin top face
  const lidH = 40;
  const top = [[-W2, -H], [W2, -H], [W2 + dx, -H + dy], [-W2 + dx, -H + dy]];
  if (open < .05) K.shape('ttop', top, light, { tex: .3, lw: 2.6 });
  // front face
  const front = [[-W2, 0], [W2, 0], [W2, -H], [-W2, -H]];
  K.shape('tfront', crSpline([[-W2, -4], [-W2 + 4, 0], [W2 - 4, 0], [W2, -4], [W2, -H + 4], [W2 - 4, -H], [-W2 + 4, -H], [-W2, -H + 4]], true, 2), body, { tex: .32, lw: 2.8, shade: gg => {
    gg.fillStyle = deep; gg.globalAlpha = .45; gg.fillRect(-W2, -26, 2 * W2, 30);
    if (!young) { gg.globalAlpha = .25; gg.fillStyle = '#e8c9a0'; for (const [sx, sy, r] of [[-60, -96, 9], [40, -40, 7], [76, -110, 5], [-20, -30, 6]]) { gg.beginPath(); gg.ellipse(sx, sy, r * 2, r, -.3, 0, 7); gg.fill(); } }
  } });
  if (!young) {   // battered: scratches, a patched corner, a dent
    for (const [x0, y0, x1, y1] of [[-90, -118, -60, -112], [20, -126, 52, -132], [-40, -20, -10, -16], [60, -60, 84, -52]]) K.ink('scr' + x0, [[x0, y0], [x1, y1]], 1.2, { color: '#e8c9a0', alpha: .55 });
    K.shape('patch', [[30, -76], [62, -80], [64, -54], [32, -50]], '#7a4a2a', { tex: .35, lw: 1.6 });
    for (let i = 0; i < 4; i++) K.ink('pst' + i, [[32 + i * 9, -79 + i * .5], [33 + i * 9, -76]], 1, { alpha: .6 });
  }
  // lid seam band
  K.ink('tseam', [[-W2, -H + lidH], [W2, -H + lidH]], 2.4);
  if (sd > 0) K.ink('tseam2', [[W2, -H + lidH], [W2 + dx, -H + lidH + dy]], 2);
  // wooden slats
  for (const yy of [-H + lidH + 30, -40]) { K.shape('slat' + yy, [[-W2, yy - 7], [W2, yy - 7], [W2, yy + 7], [-W2, yy + 7]], light, { tex: .3, lw: 1.8 }); }
  // leather straps
  for (const sx of [-62, 62]) {
    K.shape('strap' + sx, [[sx - 11, 0], [sx + 11, 0], [sx + 11, -H], [sx - 11, -H]], '#5a3420', { tex: .3, lw: 2 });
    K.shape('buckle' + sx, [[sx - 13, -H + lidH + 4], [sx + 13, -H + lidH + 4], [sx + 13, -H + lidH + 22], [sx - 13, -H + lidH + 22]], C.trunkTrim, { tex: .1, lw: 1.8 });
    K.ink('bpin' + sx, [[sx, -H + lidH + 8], [sx, -H + lidH + 18]], 1.6);
  }
  // brass corners
  for (const [cx, cy, fx, fy] of [[-W2, 0, 1, -1], [W2, 0, -1, -1], [-W2, -H, 1, 1], [W2, -H, -1, 1]]) {
    const c = [[cx, cy], [cx + fx * 24, cy], [cx + fx * 24, cy + fy * 7], [cx + fx * 7, cy + fy * 7], [cx + fx * 7, cy + fy * 24], [cx, cy + fy * 24]];
    K.shape('cn' + cx + cy, c, C.trunkTrim, { tex: .1, lw: 1.8 });
    K.dot(cx + fx * 12, cy + fy * 4, 1.8, '#5a3d1e'); K.dot(cx + fx * 4, cy + fy * 12, 1.8, '#5a3d1e');
  }
  // lock plate (keyhole)
  K.shape('lock', crSpline([[-14, -H + lidH - 12], [14, -H + lidH - 12], [16, -H + lidH + 14], [0, -H + lidH + 22], [-16, -H + lidH + 14]], true, 3), C.trunkTrim, { tex: .1, lw: 2 });
  K.dot(0, -H + lidH + 2, 3.4, '#3a2416'); K.shape('kh', [[-2, -H + lidH + 3], [2, -H + lidH + 3], [3, -H + lidH + 12], [-3, -H + lidH + 12]], '#3a2416', { tex: 0, lw: 0 });
  // handle on top
  if (open < .05) { const hy = -H + dy * .5; K.ink('handle', bez([-30 + dx * .5, hy], [-26 + dx * .5, hy - 24], [26 + dx * .5, hy - 24], [30 + dx * .5, hy], 10), 7, { color: '#5a3420', taper: false }); K.ink('handleO', bez([-30 + dx * .5, hy], [-26 + dx * .5, hy - 24], [26 + dx * .5, hy - 24], [30 + dx * .5, hy], 10), 1.4, { taper: false }); }
  // travel labels
  if (!young) {
    const lab = (nm, x0, y0, w, h, col, txt, a) => { g.save(); g.translate(x0, y0); g.rotate(a); K.shape(nm, crSpline([[-w, -h], [w, -h], [w, h], [-w, h]], true, 2), col, { tex: .25, lw: 1.6 }); g.font = font(h * .9, 'Fraunces', 700); g.fillStyle = PROF.line; g.textAlign = 'center'; g.fillText(txt, 0, h * .32); g.restore(); };
    lab('lb1', -18, -80, 24, 13, '#efe3c4', '?', -.12);
    lab('lb2', 92, -86, 14, 18, '#c96f55', '', .1);
    lab('lb3', -90, -60, 15, 10, '#8fa27c', '', .2);
  }
  // open lid: rotated back, with yellowed cards peeking out
  if (open > .05) {
    const lh = 70 + 40 * (1 - open);
    const lid = [[-W2, -H], [W2, -H], [W2 + dx * .6, -H - lh], [-W2 + dx * .6, -H - lh]];
    K.shape('tinside', [[-W2, -H], [W2, -H], [W2 + dx, -H + dy], [-W2 + dx, -H + dy]], '#4a2c1c', { tex: .2, lw: 2 });
    for (let i = 0; i < 5; i++) { const cx = -70 + i * 34 + dx * .5, cy = -H + dy * .5 - 10 - (i % 2) * 8; g.save(); g.translate(cx, cy); g.rotate((i - 2) * .12); K.shape('card' + i, [[-16, -26], [16, -26], [16, 10], [-16, 10]], '#efe1b8', { tex: .25, lw: 1.6 }); g.restore(); }
    K.shape('tlid', lid, body, { tex: .32, lw: 2.6 });
    K.ink('tlidb', [[-W2 + 10, -H - lh + 16], [W2 + dx * .6 - 10, -H - lh + 16]], 1.6, { alpha: .6 });
  }
}

// ---------------- Hilde full-body rig ----------------
const HD_GROUND = 540;
function _hildeRig(o) {
  const pose = o.pose || 'stand', t = o.t || 0;
  const J = {
    N: [0, 6, 6], SL: [-52, 12, 0], SR: [52, 12, 0], EL: [-64, 112, -4], ER: [64, 112, -4], WL: [-66, 206, 8], WR: [66, 206, 8],
    HL: [-26, 220, 0], HR: [26, 220, 0], KL: [-26, 380, 4], KR: [26, 380, 4], AL: [-26, 512, 0], AR: [26, 512, 0], TL: [-28, 528, 34], TR: [28, 528, 34],
    handL: 'relaxed', handR: 'relaxed', headTilt: 0, hemSway: 0, bob: 0, trunk: null,
  };
  if (pose === 'stand' || pose === 'trunk') {
    Object.assign(J, { EL: [-60, 108, 14], WL: [-34, 170, 52], handL: 'relaxed', ER: [62, 110, 10], WR: [36, 168, 50], handR: 'relaxed', headTilt: -.04 });
    if (pose === 'trunk') Object.assign(J, { SR: [54, 18, 0], ER: [74, 114, 0], WR: [80, 212, 4], handR: 'fist', trunk: 'R', EL: [-60, 108, 14], WL: [-34, 170, 52], N: [-6, 8, 6], headTilt: -.06 });
  }
  if (HD_V2[pose]) return _hildeRigV2(o, J);
  if (pose === 'walk') {
    const N = o.drawings || 4, fr = o.frame != null ? o.frame : Math.floor(t * 12 / (o.hold || 2));
    const ph = (((fr % N) + N) % N) / N, a = ph * Math.PI * 2;
    const s1 = Math.sin(a), c1 = Math.cos(a);
    const bob = -5 * Math.cos(2 * a);
    const leg = side => { const sw = side < 0 ? s1 : -s1; const lift = Math.max(0, side < 0 ? c1 : -c1);
      return { K: [side * 24, 380 - 14 * lift + bob, 10 + 46 * sw], A: [side * 25, 512 - 26 * lift + bob, -10 + 80 * sw - 20 * lift], T: [side * 26, 528 - 22 * lift + bob, 24 + 80 * sw - 10 * lift] }; };
    const lL = leg(-1), lR = leg(1);
    Object.assign(J, { N: [0, 8 + bob, 12], SL: [-52, 14 + bob, 0], SR: [52, 14 + bob, 0], KL: lL.K, KR: lR.K, AL: lL.A, AR: lR.A, TL: lL.T, TR: lR.T,
      EL: [-62, 112 + bob, -16 * s1], WL: [-60, 204 + bob, -40 * s1], hemSway: s1, bob, headTilt: .02 * s1 });
    if (o.trunk !== false) Object.assign(J, { SR: [54, 20 + bob, 0], ER: [74, 116 + bob, 0], WR: [80, 214 + bob, 6 * s1], handR: 'fist', trunk: 'R' });
    else Object.assign(J, { ER: [62, 112 + bob, 16 * s1], WR: [60, 204 + bob, 40 * s1] });
  }
  return J;
}

// ---------------- Hilde v2 poses: 'run' / 'runSide' (an elderly scurry, one hand on her spectacles), 'kneel' ----------------
const HD_V2 = { run: 1, runSide: 1, kneel: 1 };
// 6-drawing scurry: per leg phase [thigh, shin, foot]; short quick steps, knees soft, feet low
const HD_RUN_LEG = [[14, 4, 96], [5, -24, 88], [-10, -30, 66], [-12, -56, 24], [12, -46, 34], [22, 6, 82]];
const HD_RUN_BOB = [2, 6, -3, 2, 6, -3];
function _hildeRigV2(o, J) {
  const pose = o.pose, t = o.t || 0;
  J.v2 = true; J.torsoPitch = 0; J.hipZ = 0; J.shadowK = 1;
  const upper = ['N', 'SL', 'SR', 'EL', 'ER', 'WL', 'WR'];
  if (pose === 'run' || pose === 'runSide') {
    const N6 = 6, fr = o.frame != null ? o.frame : Math.floor(t * 12 / (o.hold || 1));
    const d = ((fr % N6) + N6) % N6, bob = HD_RUN_BOB[d], crouch = 12, hipY = 220 + crouch + bob, lean = (o.lean != null ? o.lean : 13) * _D2R;
    const lA = _clLeg(-25, hipY, 0, HD_RUN_LEG[d], 160, 132, 32), lB = _clLeg(25, hipY, 0, HD_RUN_LEG[(d + 3) % 6], 160, 132, 32);
    Object.assign(J, { HL: [-26, hipY, 0], HR: [26, hipY, 0], KL: lA.K, AL: lA.A, TL: lA.T, KR: lB.K, AR: lB.A, TR: lB.T });
    Object.assign(J, { N: [0, 18 + crouch + bob, 14], SL: [-52, 16 + crouch + bob, 0], SR: [52, 16 + crouch + bob, 0] });
    const sw = Math.sin(2 * Math.PI * (d - 1.2) / 6);
    // both arms pump small; the spectacles arm and the trunk arm are re-posed by the renderer once the view is known
    for (const [sd, s1] of [['L', sw], ['R', -sw]]) { const a = _clArmSwing(J['S' + sd], s1 * .55, 98, 92, .85); J['E' + sd] = a.E; J['W' + sd] = a.W; }
    for (const k of upper) J[k] = _pitchP(J[k], hipY, 0, lean);
    const lag = (HD_RUN_BOB[d] - HD_RUN_BOB[(d + 5) % 6]) / 8;
    Object.assign(J, { bob: crouch + bob, torsoPitch: lean, drawing: d, hemSway: sw * .6, hemTrail: 1, hemLag: -lag, scarfLag: -lag, handL: 'fist', handR: 'fist',
      runCycle: true, trunk: o.trunk ? 'R' : null, trunkLag: -lag, specs: o.specHand !== false, headTilt: .02 * sw, shadowK: 1 - Math.max(0, -bob) / 30 });
  }
  if (pose === 'kneel') {
    const sit = o.sit != null ? clamp(o.sit) : .5, hipY = lerp(370, 462, sit), hipZ = lerp(4, -96, sit), lean = (o.lean != null ? o.lean : 10) * _D2R;
    const kneeY = 524, kneeZ = hipZ + Math.sqrt(Math.max(0, 160 * 160 - Math.pow(kneeY - hipY, 2)));
    for (const [sd, sx] of [['L', -1], ['R', 1]]) {
      J['H' + sd] = [sx * 26, hipY, hipZ]; J['K' + sd] = [sx * 27, kneeY, kneeZ + (sx < 0 ? 4 : -4)];
      J['A' + sd] = [sx * 25, 528, kneeZ - 130]; J['T' + sd] = [sx * 22, 536, kneeZ - 162];
    }
    const dy = hipY - 220;
    for (const k of ['N', 'SL', 'SR']) J[k] = _pitchP([J[k][0], J[k][1] + dy, J[k][2] + hipZ], hipY, hipZ, lean);
    const arms = o.arms || 'lap';
    for (const sd of ['L', 'R']) {
      const S = J['S' + sd], sx = sd === 'L' ? -1 : 1; let W, pole;
      if (arms === 'reach' || arms === 'trunk') { const r = o.reach || [hipY - 30, hipZ + 175]; W = [sx * 30, r[0], r[1]]; pole = [sx, .6, -.2]; }
      else if (arms === 'clasp') { W = [sx * 6, S[1] + 112, S[2] + 48]; pole = [sx, .5, -.3]; }
      else { const kn = J['K' + sd]; W = [sx * 20, lerp(hipY, kn[1], .6) - 22, lerp(hipZ, kn[2], .6) + 8]; pole = [sx, 0, -.5]; }
      J['W' + sd] = W; J['E' + sd] = _ik2(S, W, 100, 94, pole);
    }
    const hk = arms === 'reach' || arms === 'trunk' ? 'flat' : arms === 'clasp' ? 'relaxed' : 'flat';
    Object.assign(J, { handL: hk, handR: hk, bob: dy, torsoPitch: lean, hipZ, kneel: { sit, hipY, hipZ, kneeY, kneeZ }, headTilt: -.03 });
  }
  return J;
}
function _hdCamFor(o) {
  if (HD_V2[o.pose]) {
    const dir = _clDir(o), dflt = { run: dir * .9, runSide: dir * Math.PI / 2, kneel: dir * .45 }[o.pose];
    return _chCam({ yaw: o.yaw != null ? o.yaw : dflt, D: o.D || 2600, eye: o.eye == null ? 260 : o.eye });
  }
  return _chCam({ yaw: o.yaw != null ? o.yaw : (o.pose === 'walk' ? .9 : 0), D: o.D || 2600, eye: o.eye == null ? 260 : o.eye });
}

function _drawProfessorFullV2(g, x, y, s, o, J, P, K, cam, C) {
  const t = o.t || 0, young = !!o.young, f = P.frame, H = _v2Head(J, cam, o);
  const tp = J.torsoPitch || 0, bob = J.bob || 0, hz = J.hipZ || 0, kn = J.kneel;
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(0, -HD_GROUND);
  if (o.shadow !== false) { const a = cam.P([0, HD_GROUND, hz]), k = J.shadowK || 1; _chShadow(g, a[0], a[1] + 4, 150 * a[3] * k, 24 * a[3] * k, .22 * k); }
  const camZ = p => cam.P(p)[2], cZ = camZ([0, 160 + bob, hz]);
  const parts = [];
  const stock = young ? '#efe6dc' : '#b8988a', stockD = young ? '#d6c8b8' : '#94766a', shoe = young ? '#4a2c1c' : '#6a2e30', shoeD = young ? '#2e1a10' : '#4a1e20';
  for (const sd of ['L', 'R']) {
    const Hh = J['H' + sd], Kn = J['K' + sd], A = J['A' + sd], T = J['T' + sd];
    parts.push({ z: -1000 + (camZ(Kn) + camZ(A)) / 2 - cZ, d: () => {
      _chLeg(K, cam, 'hlg' + sd, Hh, Kn, A, [22, 14.5, 10.5], stock, stockD);
      _chBoot(K, cam, 'hbt' + sd, A, T, 14, shoe, shoeD);
      if (young) { const a = cam.P(A); K.ink('ysock' + sd, [[a[0] - 11 * a[3], a[1] - 8 * a[3]], [a[0] + 11 * a[3], a[1] - 8 * a[3]]], 6 * a[3], { color: '#fbf6ea', taper: false }); }
    } });
  }
  // head transform (screen) so the spectacles hand can find the rim
  const nP = cam.P(J.N), hk = nP[3];
  const HP = { ...P, turn: H.turn };
  const headPt = ([lx, ly]) => { const c = Math.cos(H.tilt), sn = Math.sin(H.tilt); return [nP[0] + (lx * c - ly * sn) * hk, nP[1] + 10 + (lx * sn + ly * c) * hk]; };
  // re-pose arms for the run: the near arm goes to the spectacles, the other carries the trunk (if any)
  const nearSd = H.sn >= 0 ? 'L' : 'R', farSd = nearSd === 'L' ? 'R' : 'L';
  let specArm = null, trunkArm = null;
  // with the trunk, the near hand carries it and the far hand goes to the spectacles
  if (J.runCycle && J.trunk) trunkArm = nearSd;
  if (J.runCycle && J.specs) specArm = trunkArm ? farSd : nearSd;
  if (trunkArm) { const S = J['S' + trunkArm], sx = trunkArm === 'L' ? -1 : 1; J['W' + trunkArm] = [S[0] + sx * 22, S[1] + 186, S[2] - 6 + 6 * Math.sin(f)]; J['E' + trunkArm] = [S[0] + sx * 14, S[1] + 96, S[2] - 6]; J['hand' + trunkArm] = 'fist'; }
  const armPart = (sd) => {
    const S = J['S' + sd], E = J['E' + sd], Wr = J['W' + sd], hkind = J['hand' + sd];
    const upper = () => _chLimb3(K, cam, 'hua' + sd, [S, E], [22, 19], C.coat, C.coatShade);
    const fore = () => {
      const pe = cam.P(E), pw = cam.P(Wr);
      if (trunkArm === sd) { const lag = J.trunkLag || 0; g.save(); g.translate(pw[0], pw[1] + (150 + 18 + 10 * lag) * pw[3]); g.rotate(.05 * Math.sin(f * 1.7) - .06 * H.sn * lag); g.scale(pw[3] * .78, pw[3] * .78); _trunk(K, { side: .3 + Math.min(1, Math.abs(H.sn)) * .4, young, open: 0 }); g.restore(); }
      _chLimb3(K, cam, 'hfa' + sd, [E, _chV(E, Wr, .5), Wr], [19, 17.5, 15.5], C.coat, C.coatShade, { cuff: C.coatDeep, seamless: true });
      const ang = Math.atan2(pw[1] - pe[1], pw[0] - pe[0]);
      drawHand(K, 'hhd' + sd, pw[0], pw[1], ang, .92 * pw[3], hkind, (sd === 'L' ? -1 : 1) * (H.back ? -1 : 1), C.skin, C.skinShade);
    };
    return { upper, fore, zU: camZ(_mid3(S, E)) - cZ, zF: camZ(_mid3(E, Wr)) - cZ + (trunkArm === sd ? 30 : 0) };
  };
  const arms = { L: armPart('L'), R: armPart('R') };
  for (const sd of ['L', 'R']) {
    const a = arms[sd];
    if (specArm === sd) continue;
    if (a.zU < -20) parts.push({ z: a.zU - 500, d: a.upper });
    parts.push({ z: a.zF > 10 ? a.zF + 100 : a.zF - 500, d: a.fore });
  }
  const N = J.N;
  parts.push({ z: 0, d: () => {
    const sway = J.hemSway || 0, trail = J.hemTrail || 0, lagY = J.hemLag || 0;
    const knees = [J.KL, J.KR].filter(q => q[2] - hz > 40);
    const hemBase = young ? 360 : 440, hemY = kn ? 532 : hemBase + bob;
    const hemFl = (p, a) => {
      const bk = (1 - Math.sin(a)) * .5;
      let q = [p[0] + sway * 10 * Math.sin(a), p[1] - Math.abs(Math.sin(a * 2 + f * 1.3)) * 4 * (trail + Math.abs(sway)) - trail * bk * (10 + 6 * Math.sin(f * 2 + a)) - lagY * 8, p[2] - sway * 14 * Math.cos(a) - trail * (6 + 20 * bk)];
      for (const k2 of knees) { const w = Math.max(0, Math.sin(a)) * Math.exp(-Math.pow((q[0] - k2[0]) / 60, 2)); q = [q[0], lerp(q[1], Math.min(q[1], k2[1] + 14), w * (kn ? .2 : 1)), lerp(q[2], Math.max(q[2], k2[2] + 26), w)]; }
      if (kn) q[1] = Math.min(q[1], 534 + Math.sin(a * 5) * 2);
      return q;
    };
    const hemC = [0, hemY, hz + (kn ? 30 : 0)], hrx = kn ? 122 : (young ? 88 : 100), hrz = kn ? 96 : (young ? 60 : 66);
    if (young) {
      const waist = _chRingP(cam, [0, 196 + bob, hz], 46, 30, 28, tp * .3);
      const hem = _chRingP(cam, hemC, hrx, hrz, 32, 0, hemFl);
      const sk = _chCone(waist, hem);
      K.shape('yskirt', sk.pts, C.coatShade, { tex: .26, lw: 2.8, shade: gg => { gg.fillStyle = C.coatDeep; gg.globalAlpha = .6; P2(gg, chTr(sk.pts, 24, 0)); gg.fill(); } });
      const sh = _chRingP(cam, _chAdd(N, [0, 16, -4]), 54, 32, 28, tp), wj = _chRingP(cam, [0, 210 + bob, hz], 50, 32, 28, tp * .6);
      const torso = _chHull([...sh, ...wj]);
      K.shape('ycardi', torso, C.coat, { tex: .22, lw: 2.8, shade: gg => { gg.fillStyle = C.coatShade; gg.globalAlpha = .7; P2(gg, chTr(torso, 20, 0)); gg.fill(); } });
    } else {
      // long A-line coat from tilted shoulders to a hem that flutters, trails and (kneeling) pools on the floor
      const sh = _chRingP(cam, _chAdd(N, [0, 16, -4]), 54, 34, 28, tp);
      const coatShade = pts => gg => { gg.fillStyle = C.coatShade; gg.globalAlpha = .85; P2(gg, chTr(pts, 26, 0)); gg.fill(); };
      if (kn) {
        // kneeling: the coat drapes in two pieces, chest to hips, then over the thighs (a lap) and pooled on the floor
        const kz = kn.kneeZ, wy = kn.hipY - 6;
        const lapFl = (p, a) => { const fr = Math.max(0, Math.sin(a)), bk = Math.max(0, -Math.sin(a));
          return [p[0] * (1 + .12 * bk), lerp(534, kn.kneeY - 22, Math.pow(fr, 1.5)) + Math.sin(a * 6) * 2, lerp(p[2], kz + 34, Math.pow(fr, 1.2)) - bk * 10]; };
        const waist = _chRingP(cam, [0, wy, hz], 58, 44, 28, 0);
        const hem = _chRingP(cam, [0, 534, hz], 124, 74, 32, 0, lapFl);
        const lower = _chCone(waist, hem), hc = camZ([0, 534, hz]);
        const back = _chHull([...waist, ...hem.filter(q => q[2] - hc < 0)]);
        K.shape('coatB', back, C.coatDeep, { tex: .26, lw: 2.8 });
        K.shape('coatL', lower.pts, C.coat, { tex: .26, lw: 2.8, shade: coatShade(lower.pts) });
        // drape folds radiating from the knees across the lap and pool
        for (let i = 0; i < 5; i++) { const q0 = hem[2 + i * 3], w0 = waist[Math.round((2 + i * 3) / 32 * 28) % 28]; if (q0[2] - hc > 5) K.ink('lapf' + i, [[lerp(w0[0], q0[0], .35), lerp(w0[1], q0[1], .35)], [lerp(w0[0], q0[0], .92), lerp(w0[1], q0[1], .92)]], 1.5, { alpha: .45 }); }
        const upperC = _chCone(sh, _chRingP(cam, [0, wy + 4, hz], 58, 44, 28, 0));
        K.shape('coatF', upperC.pts, C.coat, { tex: .26, lw: 2.8, shade: coatShade(upperC.pts) });
      } else {
      const hem = _chRingP(cam, hemC, hrx, hrz, 32, 0, hemFl);
      const coat = _chCone(sh, hem);
      const hc = camZ(hemC);
      const body = _chHull([...sh, ...hem.filter(q => q[2] - hc < 0)]);
      K.shape('coatB', body, C.coatDeep, { tex: .26, lw: 2.8 });
      K.shape('coatF', coat.pts, C.coat, { tex: .26, lw: 2.8, shade: coatShade(coat.pts) });
      }
      if (H.fc > -.3) {
        const fz = 44, sp = Math.sin(tp), cp = Math.cos(tp);
        const c0 = cam.P(_chAdd(N, [8, 30 * cp + (fz - 6) * sp, (fz - 6) * cp - 30 * sp])), c1 = kn ? cam.P([10, kn.hipY - 6, hz + 46]) : cam.P([10, hemY, hemC[2] + hrz * .95]);
        K.ink('cfront', [[c0[0], c0[1]], [c1[0], c1[1]]], 2.2, { alpha: .8 });
        const by = 200 + bob, bz = hz + (by - (J.kneel ? J.kneel.hipY : 232 + bob)) * 0;
        const b0 = cam.P([-56, by - 4, bz + 26 + (220 - by) * 0]), b1 = cam.P([0, by, bz + 44]), b2 = cam.P([56, by - 4, bz + 26]);
        const fwd = p => _pitchP(p, kn ? kn.hipY : 232 + bob, hz, tp * .6);
        const B0 = cam.P(fwd([-56, by - 4, hz + 26])), B1 = cam.P(fwd([0, by, hz + 44])), B2 = cam.P(fwd([56, by - 4, hz + 26]));
        K.ink('belt', crSpline([[B0[0], B0[1]], [B1[0], B1[1]], [B2[0], B2[1]]], false, 6), 9 * B1[3], { color: C.coatDeep, taper: false });
        for (let i = 0; i < 3; i++) { const b = cam.P(_pitchP([-10, 80 + i * 50 + bob, 46 + hz], N[1], N[2], 0)); const bb = cam.P(fwd([-10, 80 + i * 50 + bob + (kn ? 0 : 0), hz + 46])); K.ell(bb[0], bb[1], 5 * bb[3], 5 * bb[3], '#c9973e'); K.g.lineWidth = 1.2 * K.ls; K.g.strokeStyle = PROF.line; K.g.stroke(); }
      }
    }
    for (const sd of ['L', 'R']) if (arms[sd].zU >= -20 && specArm !== sd) arms[sd].upper();
    // lapels, blouse, scarf at the neck (2D), narrowed as she turns; in the run the tails stream out behind her
    const nk = cam.P(_chAdd(N, [0, -22 * Math.cos(tp) + 22 * Math.sin(tp), 22 * Math.cos(tp) + 22 * Math.sin(tp)])), kk = nk[3];
    const xs = Math.max(.32, Math.abs(H.fc)), ox = H.sn * 14 * (1 - xs);
    g.save(); g.translate(nk[0] + ox * kk, nk[1]); g.scale(kk, kk);
    const scf = (nm, pts) => K.shape(nm, pts, C.scarf, { tex: .28, lw: 2.2, shade: gg => { gg.fillStyle = C.scarfShade; gg.globalAlpha = .8; gg.fillRect(-200, 30, 400, 160); } });
    if (J.runCycle) {
      // two tails flying back, rippling on twos
      const bk = -Math.sign(H.sn || 1), lg = J.scarfLag || 0;
      for (const [k, len, wd, ph] of [[2, 112, 24, 1.7], [1, 146, 30, 0]]) {
        const ctr = []; for (let i = 0; i <= 8; i++) { const u = i / 8; ctr.push([bk * (6 + u * len), 12 + u * (18 - 26 * lg) + Math.sin(u * 5 + f * 2.2 + ph) * 9 * u]); }
        const L = [], R2 = []; for (let i = 0; i <= 8; i++) { const u = i / 8, w = wd * (1 - .35 * u), a = ctr[Math.max(0, i - 1)], b = ctr[Math.min(8, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1; L.push([ctr[i][0] - dy / dl * w * .5, ctr[i][1] + dx / dl * w * .5]); R2.push([ctr[i][0] + dy / dl * w * .5, ctr[i][1] - dx / dl * w * .5]); }
        scf('frt' + k, [...L, ...R2.reverse()]);
        K.ink('frf' + k, [R2[0], [R2[0][0] + bk * 8, R2[0][1] + 4]], 1.4, { color: C.scarfLine, alpha: .7 });
      }
    }
    g.save(); g.scale(xs, 1);
    if (!young) {
      K.shape('fbl', [[-20, -4], [20, -4], [8, 70], [0, 78], [-8, 70]], C.blouse, { tex: .1, lw: 2 });
      for (const side of [-1, 1]) K.shape('flap' + side, [[side * 18, -6], [side * 36, 0], [side * 46, 22], [side * 36, 26], [side * 44, 38], [side * 10, 104], [side * 8, 70]], C.coatLight, { tex: .25, lw: 2.2 });
    } else {
      K.shape('yblf', [[-22, -4], [22, -4], [10, 50], [0, 58], [-10, 50]], '#fbf6ea', { tex: .08, lw: 2 });
    }
    if (!J.runCycle) {
      scf('ftl2', crSpline([[-4, 14], [14, 16], [18, 70], [8, 130], [-8, 132], [-4, 70]], true, 5));
      scf('ftl1', crSpline([[10, 12], [30, 14], [42, 80], [38, 150], [22, 154], [18, 80]], true, 5));
    }
    g.restore();
    g.save(); g.scale(Math.max(.75, xs), 1);
    scf('fwrap', crSpline([[-38, -14], [-18, -2], [18, -2], [38, -14], [42, 6], [22, 20], [-22, 20], [-42, 6]], true, 6));
    scf('fknot', crSpline([[-6, 8], [16, 6], [20, 24], [2, 30], [-8, 22]], true, 5).map(([px, py]) => [px + H.sn * 14 * (1 - xs), py]));
    g.restore(); g.restore();
  } });
  parts.sort((a, b) => a.z - b.z);
  const head = (layer) => { g.save(); g.translate(nP[0], nP[1] + 10); g.scale(hk, hk); g.rotate(H.tilt); drawHildeHead(K, HP, layer); g.restore(); };
  head('back');
  for (const p of parts.filter(q => q.z < 0)) p.d();
  g.save(); g.translate(nP[0], nP[1] - 4); g.scale(hk, hk); g.rotate(H.tilt * .5);
  K.fill([[-15, -90], [15, -90], [16, -20], [-16, -20]], C.skin, { tex: .08, shade: gg => { gg.fillStyle = C.skinShade; gg.fillRect(-30, -92, 60, 34); } });
  K.ink('fnkL', [[-15, -80], [-16, -30]], 2.3); K.ink('fnkR', [[15, -80], [16, -30]], 2.3);
  g.restore();
  for (const p of parts.filter(q => q.z >= 0 && q.z < 100)) p.d();
  // the spectacles arm: sleeves from the shoulder to just under the rim; a near arm passes in front, a far arm behind the head
  let specHand = null;
  if (specArm) {
    const sd = specArm, sgn = Math.sign(H.turn) || 1, eyeX = young ? 34 : 33, eyeY = young ? -132 : -134;
    const [ex, ws] = _yawX(sgn * eyeX, H.turn);
    const rim = headPt([ex + sgn * 20 * ws, eyeY + 6]), wr = headPt([ex + sgn * 34 * ws, eyeY + 44]);
    const S = cam.P(J['S' + sd]), elbow = [lerp(S[0], wr[0], .5) + sgn * 46 * hk, lerp(S[1], wr[1], .5) + 34 * hk];
    const sleeves = () => {
      drawSleeve(K, 'hspec', [[S[0], S[1]], elbow], [22 * hk, 19 * hk], C.coat, C.coatShade, null, true);
      drawSleeve(K, 'hspecF', [elbow, [lerp(elbow[0], wr[0], .5), lerp(elbow[1], wr[1], .5)], wr], [19 * hk, 17.5 * hk, 15.5 * hk], C.coat, C.coatShade, C.coatDeep, true, true);
    };
    specHand = { sleeves, near: sd === nearSd, hand: () => drawHand(K, 'hspecH', wr[0], wr[1], Math.atan2(rim[1] - wr[1], rim[0] - wr[0]), .92 * hk, 'point', sgn > 0 ? 1 : -1, C.skin, C.skinShade) };
    if (!specHand.near) sleeves();
  }
  head('front');
  if (specHand) { if (specHand.near) specHand.sleeves(); specHand.hand(); }
  for (const p of parts.filter(q => q.z >= 100)) p.d();
  g.restore();
}

// drawProfessorFull(g, x, y, s, { pose: 'stand'|'trunk'|'walk', t, frame, yaw, young, expr, trunkOpen, ... })
function drawProfessorFull(g, x, y, s = 1, o = {}) {
  const P = resolveExpr({ expr: (o.pose === 'run' || o.pose === 'runSide') ? 'worried' : 'neutral', ...o }), C = _hpal(P), t = o.t || 0, young = !!o.young;
  const J = _hildeRig(o);
  const K = charKit(g, t, s, { line: PROF.line, seed: young ? 'yhf' : 'hdf', ..._chKitOpts(o) });
  if (P.frame == null) P.frame = o.frame != null ? o.frame : K.bf;
  if (J.v2) { _drawProfessorFullV2(g, x, y, s, o, J, P, K, _hdCamFor(o), C); return; }
  const cam = _chCam({ yaw: o.yaw != null ? o.yaw : (o.pose === 'walk' ? .9 : 0), D: o.D || 2600, eye: o.eye == null ? 260 : o.eye });
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(0, -HD_GROUND);
  if (o.shadow !== false) { const a = cam.P([0, HD_GROUND, 0]); _chShadow(g, a[0], a[1] + 4, 150 * a[3], 24 * a[3]); }
  const parts = [], f = P.frame;
  const stock = young ? '#efe6dc' : '#b8988a', stockD = young ? '#d6c8b8' : '#94766a', shoe = young ? '#4a2c1c' : '#6a2e30', shoeD = young ? '#2e1a10' : '#4a1e20';
  const hemY = young ? 360 : 440;
  for (const sd of ['L', 'R']) {
    const H = J['H' + sd], Kn = J['K' + sd], A = J['A' + sd], T = J['T' + sd];
    parts.push({ z: -1000 + (Kn[2] + A[2]) / 2, d: () => {
      _chLeg(K, cam, 'hlg' + sd, H, Kn, A, [22, 14.5, 10.5], stock, stockD);
      _chBoot(K, cam, 'hbt' + sd, A, T, 14, shoe, shoeD);
      if (young) { const a = cam.P(A); K.ink('ysock' + sd, [[a[0] - 11 * a[3], a[1] - 8 * a[3]], [a[0] + 11 * a[3], a[1] - 8 * a[3]]], 6 * a[3], { color: '#fbf6ea', taper: false }); }
    } });
  }
  const armPart = (sd) => {
    const S = J['S' + sd], E = J['E' + sd], Wr = J['W' + sd], hk = J['hand' + sd];
    const upper = () => _chLimb3(K, cam, 'hua' + sd, [S, E], [22, 19], C.coat, C.coatShade);
    const fore = () => {
      const pe = cam.P(E), pw = cam.P(Wr);
      if (J.trunk === sd) { g.save(); g.translate(pw[0], pw[1] + 150 * pw[3] + 18 * pw[3]); g.scale(pw[3] * .78, pw[3] * .78); g.rotate((J.hemSway || 0) * .04); _trunk(K, { side: .3 + cam.yaw * .3, young, open: 0 }); g.restore(); }
      _chLimb3(K, cam, 'hfa' + sd, [E, _chV(E, Wr, .5), Wr], [19, 17.5, 15.5], C.coat, C.coatShade, { cuff: C.coatDeep, seamless: true });
      const ang = Math.atan2(pw[1] - pe[1], pw[0] - pe[0]);
      drawHand(K, 'hhd' + sd, pw[0], pw[1], ang, .92 * pw[3], hk, sd === 'L' ? -1 : 1, C.skin, C.skinShade);
    };
    return { upper, fore, zU: (S[2] + E[2]) / 2, zF: (E[2] + Wr[2]) / 2 + (J.trunk === sd ? 40 : 0) };
  };
  const aL = armPart('L'), aR = armPart('R');
  for (const a of [aL, aR]) { if (a.zU < -20) parts.push({ z: a.zU - 500, d: a.upper }); parts.push({ z: a.zF > 10 ? a.zF + 100 : a.zF - 500, d: a.fore }); }
  const N = J.N;
  parts.push({ z: 0, d: () => {
    const bob = J.bob || 0, sway = J.hemSway || 0;
    if (young) {
      // skirt + cardigan
      const waist = _chRing(cam, [0, 196 + bob, 0], 46, 30);
      const hem = _chRing(cam, [0, hemY + bob, 0], 88, 60, 32, null, (p, a) => [p[0] + sway * 8 * Math.sin(a), p[1] - Math.abs(Math.sin(a * 2 + f)) * 3, p[2] - sway * 10 * Math.cos(a)]);
      const sk = _chCone(waist, hem);
      K.shape('yskirt', sk.pts, C.coatShade, { tex: .26, lw: 2.8, shade: gg => { gg.fillStyle = C.coatDeep; gg.globalAlpha = .6; P2(gg, chTr(sk.pts, 24, 0)); gg.fill(); } });
      const sh = _chRing(cam, _chAdd(N, [0, 16, -4]), 54, 32), wj = _chRing(cam, [0, 210 + bob, 0], 50, 32);
      const torso = _chHull([...sh, ...wj]);
      K.shape('ycardi', torso, C.coat, { tex: .22, lw: 2.8, shade: gg => { gg.fillStyle = C.coatShade; gg.globalAlpha = .7; P2(gg, chTr(torso, 20, 0)); gg.fill(); } });
      const c0 = cam.P(_chAdd(N, [0, -10, 34])), c1 = cam.P([0, 210 + bob, 34]);
      K.ink('ycfront', [[c0[0], c0[1] + 30], [c1[0], c1[1]]], 2, { alpha: .7 });
      for (let i = 0; i < 3; i++) { const b = cam.P([-6, 90 + i * 40 + bob, 36]); K.ell(b[0], b[1], 4 * b[3], 4 * b[3], '#f3ead8'); }
      for (const a of [aL, aR]) if (a.zU >= -20) a.upper();
      const nk = cam.P(_chAdd(N, [0, -30, 20]));
      const bl = [[nk[0] - 22, nk[1] - 4], [nk[0] + 22, nk[1] - 4], [nk[0] + 10, nk[1] + 50], [nk[0], nk[1] + 58], [nk[0] - 10, nk[1] + 50]];
      K.shape('yblf', bl, '#fbf6ea', { tex: .08, lw: 2 });
      for (const side of [-1, 1]) K.shape('ycolf' + side, crSpline([[nk[0] + side * 2, nk[1] - 6], [nk[0] + side * 20, nk[1] - 10], [nk[0] + side * 34, nk[1]], [nk[0] + side * 30, nk[1] + 16], [nk[0] + side * 12, nk[1] + 18]], true, 5), '#fffaf0', { tex: .06, lw: 2 });
      const sc = (nm, pts) => K.shape(nm, pts, C.scarf, { tex: .28, lw: 2.2 });
      sc('ytl1', crSpline([[nk[0] + 2, nk[1] + 6], [nk[0] + 20, nk[1] + 12], [nk[0] + 26, nk[1] + 40], [nk[0] + 14, nk[1] + 44], [nk[0] + 8, nk[1] + 20]], true, 4));
      sc('ytl2', crSpline([[nk[0] - 2, nk[1] + 6], [nk[0] - 18, nk[1] + 12], [nk[0] - 22, nk[1] + 36], [nk[0] - 10, nk[1] + 40], [nk[0] - 6, nk[1] + 20]], true, 4));
      sc('ykn', crSpline([[nk[0] - 7, nk[1]], [nk[0] + 7, nk[1]], [nk[0] + 8, nk[1] + 12], [nk[0] - 8, nk[1] + 12]], true, 4));
      return;
    }
    // long A-line coat
    const sh = _chRing(cam, _chAdd(N, [0, 16, -4]), 54, 34);
    const hem = _chRing(cam, [0, hemY + bob, 0], 100, 66, 32, null, (p, a) => [p[0] + sway * 10 * Math.sin(a), p[1] - Math.abs(Math.sin(a * 2 + f * 1.3)) * 3 * Math.abs(sway), p[2] - sway * 14 * Math.cos(a)]);
    const coat = _chCone(sh, hem);
    const body = _chHull([...sh, ...hem.filter(q => Math.sin(q.a) < 0)]);
    K.shape('coatB', body, C.coatDeep, { tex: .26, lw: 2.8 });
    K.shape('coatF', coat.pts, C.coat, { tex: .26, lw: 2.8, shade: gg => { gg.fillStyle = C.coatShade; gg.globalAlpha = .85; P2(gg, chTr(coat.pts, 26, 0)); gg.fill(); } });
    // front opening, belt, pockets, buttons
    const fz = 44;
    const c0 = cam.P(_chAdd(N, [8, 30, fz - 6])), c1 = cam.P([10, hemY + bob, 66]);
    K.ink('cfront', [[c0[0], c0[1]], [c1[0], c1[1]]], 2.2, { alpha: .8 });
    const b0 = cam.P([-56, 196 + bob, 26]), b1 = cam.P([0, 200 + bob, 44]), b2 = cam.P([56, 196 + bob, 26]);
    K.ink('belt', crSpline([[b0[0], b0[1]], [b1[0], b1[1]], [b2[0], b2[1]]], false, 6), 9 * b1[3], { color: C.coatDeep, taper: false });
    for (const px of [-44, 50]) { const p = cam.P([px, 290 + bob, 50]); K.ink('pk' + px, [[p[0] - 18 * p[3], p[1]], [p[0] + 18 * p[3], p[1] + 2]], 2, { alpha: .8 }); }
    for (let i = 0; i < 3; i++) { const b = cam.P([-10, 80 + i * 50 + bob, 46]); K.ell(b[0], b[1], 5 * b[3], 5 * b[3], '#c9973e'); K.g.lineWidth = 1.2; K.g.strokeStyle = PROF.line; K.g.stroke(); }
    for (const a of [aL, aR]) if (a.zU >= -20) a.upper();
    // lapels, blouse, scarf around the neck (2D at the neck)
    const nk = cam.P(_chAdd(N, [0, -22, 22])), kk = nk[3];
    g.save(); g.translate(nk[0], nk[1]); g.scale(kk, kk);
    K.shape('fbl', [[-20, -4], [20, -4], [8, 70], [0, 78], [-8, 70]], C.blouse, { tex: .1, lw: 2 });
    for (const side of [-1, 1]) K.shape('flap' + side, [[side * 18, -6], [side * 36, 0], [side * 46, 22], [side * 36, 26], [side * 44, 38], [side * 10, 104], [side * 8, 70]], C.coatLight, { tex: .25, lw: 2.2 });
    const scf = (nm, pts) => K.shape(nm, pts, C.scarf, { tex: .28, lw: 2.2, shade: gg => { gg.fillStyle = C.scarfShade; gg.globalAlpha = .8; gg.fillRect(-60, 30, 120, 160); } });
    const swing = Math.sin(f * .7) * 3 * (o.pose === 'walk' ? 1 : 0);
    scf('ftl2', crSpline([[-4, 14], [14, 16], [18, 70], [8 + swing, 130], [-8 + swing, 132], [-4, 70]], true, 5));
    scf('ftl1', crSpline([[10, 12], [30, 14], [42, 80], [38 + swing, 150], [22 + swing, 154], [18, 80]], true, 5));
    scf('fwrap', crSpline([[-38, -14], [-18, -2], [18, -2], [38, -14], [42, 6], [22, 20], [-22, 20], [-42, 6]], true, 6));
    scf('fknot', crSpline([[-6, 8], [16, 6], [20, 24], [2, 30], [-8, 22]], true, 5));
    g.restore();
  } });
  parts.sort((a, b) => a.z - b.z);
  const nP = cam.P(N), hk = nP[3];
  const HP = { ...P, turn: clamp(cam.yaw * .9, -.6, .6) + (o.turn || 0) };
  const head = (layer) => { g.save(); g.translate(nP[0], nP[1] + 10); g.scale(hk, hk); g.rotate(J.headTilt + (o.tilt || 0)); drawHildeHead(K, HP, layer); g.restore(); };
  head('back');
  for (const p of parts.filter(q => q.z < 0)) p.d();
  g.save(); g.translate(nP[0], nP[1] - 4); g.scale(hk, hk);
  K.fill([[-15, -90], [15, -90], [16, -20], [-16, -20]], C.skin, { tex: .08, shade: gg => { gg.fillStyle = C.skinShade; gg.fillRect(-30, -92, 60, 34); } });
  K.ink('fnkL', [[-15, -80], [-16, -30]], 2.3); K.ink('fnkR', [[15, -80], [16, -30]], 2.3);
  g.restore();
  for (const p of parts.filter(q => q.z >= 0 && q.z < 100)) p.d();
  head('front');
  for (const p of parts.filter(q => q.z >= 100)) p.d();
  g.restore();
}

// =====================================================================================
// TOWNSFOLK — caricatured silhouettes. drawTownsfolk(g, kind, x, y, s, { t, blink, talk, look, mood: 'smile'|'open'|'o', frame, whistle, card })
// (x,y) = ground point. kinds: 'baker' | 'postman' | 'child' | 'referee' | 'cat'
// =====================================================================================
const CH_TOWN = { line: '#45291b', skin: '#f9d8bd', skinShade: '#eeb293', blush: '#ef8a7a' };
function drawTownsfolk(g, kind, x, y, s = 1, o = {}) {
  const K = charKit(g, o.t || 0, s, { line: CH_TOWN.line, seed: 'tf' + kind, ..._chKitOpts(o) });
  const f = o.frame != null ? o.frame : K.bf;
  g.save(); g.translate(x, y); g.scale(s, s);
  if (o.shadow !== false) _chShadow(g, 0, 4, kind === 'cat' ? 90 : kind === 'baker' ? 150 : 110, kind === 'cat' ? 14 : 20);
  const fn = (o.style === 'classic' ? { baker: _tfBaker, postman: _tfPostman, child: _tfChild, referee: _tfReferee, cat: _tfCat }
    : { baker: _tfBakerA, postman: _tfPostmanA, child: _tfChildA, referee: _tfRefereeA, cat: _tfCatA })[kind];
  if (fn) fn(K, { ...o, frame: f });
  g.restore();
}
// small simple face: bead-ish oval eyes with highlight, mouth via drawMouth. (x,y) centre between eyes.
function _tfEyes(K, x, y, gap, r, o, col = '#2e1c14') {
  const blink = o.blink || 0, look = o.look || [0, 0];
  for (const sd of [-1, 1]) {
    const ex = x + sd * gap;
    if (blink > .6 || o.eyes === 'happy') K.ink('tfe' + sd, bez([ex - r * 1.2, y + (o.eyes === 'happy' ? r * .4 : 0)], [ex - r * .5, y + (o.eyes === 'happy' ? -r : r * .8)], [ex + r * .5, y + (o.eyes === 'happy' ? -r : r * .8)], [ex + r * 1.2, y + (o.eyes === 'happy' ? r * .4 : 0)], 8), r * .55);
    else { K.ell(ex + look[0] * r * .4, y + look[1] * r * .3, r * .8, r * 1.1, col); K.ell(ex + look[0] * r * .4 - r * .3, y - r * .45, r * .3, r * .3, '#fff'); }
  }
}
function _tfNose(K, x, y, rx, ry, col) { K.shape('tfnose' + Math.round(x), crSpline([[x - rx, y], [x, y - ry], [x + rx, y], [x, y + ry * .9]], true, 6), col, { tex: .1, lw: 2.2, shade: g => { g.fillStyle = 'rgba(220,120,100,.35)'; g.beginPath(); g.ellipse(x + rx * .3, y + ry * .3, rx * .7, ry * .6, 0, 0, 7); g.fill(); } }); K.ell(x - rx * .35, y - ry * .35, rx * .25, ry * .2, 'rgba(255,255,255,.7)'); }

function _tfBaker(K, o) {
  const g = K.g, C = CH_TOWN, f = o.frame;
  const apron = '#fbf5e8', shirt = '#d6a443', shirtD = '#b0802c', trousers = '#6b5240', hat = '#fffaf0', hatS = '#e6dccb', kerchief = '#c4383a';
  // legs + shoes
  for (const sd of [-1, 1]) { K.shape('bl' + sd, capsulePts(sd * 40, -110, sd * 44, -22, 22, 20), trousers, { tex: .25, lw: 2.6 }); K.shape('bs' + sd, crSpline([[sd * 18, -4], [sd * 30, -30], [sd * 62, -30], [sd * 78, -10], [sd * 70, 2], [sd * 22, 2]], true, 4), '#3e2a20', { tex: .2, lw: 2.4 }); }
  // pear body
  const body = crSpline([[0, -400], [70, -380], [120, -300], [142, -190], [126, -110], [70, -84], [-70, -84], [-126, -110], [-142, -190], [-120, -300], [-70, -380]], true, 6);
  K.shape('bbody', body, shirt, { tex: .25, lw: 3, shade: gg => { gg.fillStyle = shirtD; gg.globalAlpha = .7; P2(gg, chTr(body, 26, 6)); gg.fill(); } });
  const apr = crSpline([[-62, -330], [62, -330], [96, -200], [108, -110], [80, -92], [-80, -92], [-108, -110], [-96, -200]], true, 5);
  K.shape('bapron', apr, apron, { tex: .12, lw: 2.6, shade: gg => { gg.fillStyle = hatS; gg.globalAlpha = .7; gg.beginPath(); gg.ellipse(50, -150, 60, 70, 0, 0, 7); gg.fill(); } });
  K.shape('bpocket', [[-40, -200], [40, -200], [36, -150], [-36, -150]], apron, { tex: .1, lw: 2 });
  K.ell(-40, -170, 6, 6, 'rgba(214,164,67,.6)');   // flour smudge
  // arms (rolled sleeves): one hand on the belly, the other hugging a baguette
  const sway = Math.sin(f * .5) * 4;
  _drawBaguette(K, 'bag', 60, -330 + sway, 196, -150 + sway);
  drawSleeve(K, 'barmL', [[-104, -330], [-138, -260]], [24, 21], shirt, shirtD, null, true);
  drawSleeve(K, 'bfaL', [[-138, -260], [-128, -210], [-96, -180]], [15, 14, 13], C.skin, C.skinShade, '#fbf5e8', true, true, { folds: false });
  drawHand(K, 'bhL', -96, -180, -.2, 1.1, 'relaxed', 1, C.skin, C.skinShade);
  drawSleeve(K, 'barmR', [[104, -330], [136, -270]], [24, 21], shirt, shirtD, null, true);
  drawSleeve(K, 'bfaR', [[136, -270], [120, -232], [92, -222]], [15, 14, 13], C.skin, C.skinShade, '#fbf5e8', true, true, { folds: false });
  drawHand(K, 'bhR', 92, -222, Math.PI + .3, 1.1, 'fist', -1, C.skin, C.skinShade);
  // head: big round, small eyes, big nose, curly moustache
  const head = crSpline([[0, -560], [62, -540], [80, -480], [64, -418], [0, -398], [-64, -418], [-80, -480], [-62, -540]], true, 6);
  K.shape('bhead', head, C.skin, { tex: .08, lw: 3, shade: gg => { gg.fillStyle = C.skinShade; gg.globalAlpha = .5; gg.beginPath(); gg.ellipse(0, -556, 90, 26, 0, 0, 7); gg.fill(); } });
  K.shape('bker', crSpline([[-50, -410], [0, -394], [50, -410], [40, -380], [0, -370], [-40, -380]], true, 4), kerchief, { tex: .25, lw: 2.2 });
  _chBlush(g, -46, -468, 16, 8, C.blush, .6); _chBlush(g, 46, -468, 16, 8, C.blush, .6);
  _tfEyes(K, 0, -496, 30, 7, o);
  K.ink('bbrL', [[-42, -520], [-20, -526]], 4); K.ink('bbrR', [[20, -526], [42, -520]], 4);
  _tfNose(K, 0, -470, 17, 15, C.skin);
  const mw = Math.sin(f * .9) * 2;
  for (const sd of [-1, 1]) { const m = crSpline([[0, -452], [sd * 22, -460], [sd * 44, -452 + mw], [sd * 52, -462 + mw], [sd * 46, -446 + mw], [sd * 22, -444]], true, 5); K.shape('bmus' + sd, m, '#7a5233', { tex: .2, lw: 2 }); }
  drawMouth(K, 0, -434, { mouth: o.mood || (o.talk ? 'open' : 'smile'), talk: o.talk }, .8);
  // tall toque
  const toque = crSpline([[-58, -540], [-80, -600], [-70, -660], [-30, -690], [0, -676], [30, -692], [72, -662], [82, -600], [58, -540]], true, 6);
  K.shape('btoq', toque, hat, { tex: .1, lw: 2.8, shade: gg => { gg.fillStyle = hatS; gg.globalAlpha = .8; gg.beginPath(); gg.ellipse(40, -610, 30, 60, 0, 0, 7); gg.fill(); } });
  K.ink('btq1', [[-20, -560], [-28, -650]], 1.6, { alpha: .5 }); K.ink('btq2', [[20, -560], [26, -650]], 1.6, { alpha: .5 });
  K.shape('bband', crSpline([[-62, -560], [62, -560], [62, -530], [-62, -530]], true, 2), hat, { tex: .1, lw: 2.6 });
}
function _drawBaguette(K, name, x1, y1, x2, y2) {
  const g = K.g, a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
  g.save(); g.translate(x1, y1); g.rotate(a);
  K.shape(name, crSpline([[0, 0], [10, -18], [L - 10, -16], [L, 0], [L - 10, 16], [10, 18]], true, 5), '#d9a25a', { tex: .3, lw: 2.4, shade: gg => { gg.fillStyle = '#b07832'; gg.fillRect(0, 4, L, 20); } });
  for (let i = 1; i < 5; i++) K.ink(name + 'c' + i, [[i * L / 5 - 12, -8], [i * L / 5 + 8, 6]], 2.2, { color: '#f3d9a0' });
  g.restore();
}

function _tfPostman(K, o) {
  const g = K.g, C = CH_TOWN, f = o.frame;
  const uni = '#3f5f6b', uniD = '#2c4450', uniL = '#557784', brass = '#d6a443', bag = '#8a5a36';
  // long thin legs, big shoes
  for (const sd of [-1, 1]) { K.shape('pl' + sd, capsulePts(sd * 22, -330, sd * 26, -26, 16, 13), uniD, { tex: .25, lw: 2.6 }); K.shape('ps' + sd, crSpline([[sd * 10, -6], [sd * 18, -30], [sd * 50, -28], [sd * 74, -10], [sd * 66, 2], [sd * 12, 2]], true, 4), '#2a1c14', { tex: .2, lw: 2.4 }); }
  // tall narrow jacket
  const body = crSpline([[0, -640], [46, -628], [62, -560], [64, -400], [58, -310], [-58, -310], [-64, -400], [-62, -560], [-46, -628]], true, 5);
  K.shape('pbody', body, uni, { tex: .25, lw: 3, shade: gg => { gg.fillStyle = uniD; gg.globalAlpha = .7; P2(gg, chTr(body, 22, 0)); gg.fill(); } });
  K.ink('pfront', [[0, -620], [0, -312]], 2, { alpha: .7 });
  for (let i = 0; i < 5; i++) { K.ell(-10, -590 + i * 58, 5, 5, brass); }
  // satchel strap + bag with letters
  K.ink('pstrap', [[-44, -620], [60, -380]], 10, { color: bag, taper: false }); K.ink('pstrapE', [[-44, -620], [60, -380]], 1.2, { taper: false, alpha: .6 });
  for (let i = 0; i < 3; i++) { g.save(); g.translate(58 + i * 14, -420 - i * 6); g.rotate(-.2 + i * .25); K.shape('plet' + i, [[-18, -14], [18, -14], [18, 14], [-18, 14]], i === 1 ? '#f2e2c4' : '#fbf4e2', { tex: .1, lw: 1.6 }); g.restore(); }
  K.shape('pbag', crSpline([[20, -400], [110, -400], [116, -320], [66, -300], [16, -320]], true, 3), bag, { tex: .3, lw: 2.6, shade: gg => { gg.fillStyle = '#6a4026'; gg.globalAlpha = .6; gg.fillRect(0, -340, 140, 50); } });
  K.shape('pflap', crSpline([[20, -400], [110, -400], [104, -360], [24, -360]], true, 2), '#a06a3c', { tex: .3, lw: 2.2 });
  K.ell(64, -366, 6, 6, brass);
  // arms: one at side, one raising a letter
  drawSleeve(K, 'parmL', [[-56, -610], [-74, -500], [-72, -400]], [17, 15, 13], uni, uniD, null, true);
  drawHand(K, 'phL', -72, -404, Math.PI / 2, 1, 'relaxed', -1, C.skin, C.skinShade);
  const lift = Math.sin(f * .6) * 6;
  drawSleeve(K, 'parmR', [[56, -610], [100, -560], [104, -680 + lift]], [17, 15, 13], uni, uniD, null, true);
  g.save(); g.translate(108, -720 + lift); g.rotate(.15); K.shape('pletter', [[-30, -20], [30, -20], [30, 20], [-30, 20]], '#fbf4e2', { tex: .1, lw: 2 }); K.ink('pletx', [[-30, -20], [0, 2], [30, -20]], 1.6); K.shape('pstamp', [[16, -16], [26, -16], [26, -4], [16, -4]], '#c4383a', { tex: 0, lw: 1 }); g.restore();
  drawHand(K, 'phR', 104, -680 + lift, -Math.PI / 2, 1, 'fist', 1, C.skin, C.skinShade);
  // long neck, long face, long nose
  K.shape('pneck', [[-12, -700], [12, -700], [14, -630], [-14, -630]], C.skin, { tex: .08, lw: 2.4 });
  const head = crSpline([[0, -840], [40, -826], [50, -770], [40, -706], [0, -690], [-40, -706], [-50, -770], [-40, -826]], true, 6);
  K.shape('phead', head, C.skin, { tex: .08, lw: 3 });
  _chBlush(g, -30, -746, 12, 6, C.blush, .5); _chBlush(g, 30, -746, 12, 6, C.blush, .5);
  _tfEyes(K, 0, -776, 20, 5.5, o);
  K.ink('pbrL', [[-30, -796], [-12, -800]], 3.2); K.ink('pbrR', [[12, -800], [30, -796]], 3.2);
  K.shape('pnose', crSpline([[-4, -770], [6, -768], [26, -742], [18, -732], [-2, -740]], true, 5), C.skin, { tex: .08, lw: 2.2 });
  K.ink('pmus', bez([-16, -724], [-6, -730], [6, -730], [16, -724], 6), 4, { color: '#5a3a28' });
  drawMouth(K, 0, -716, { mouth: o.mood || (o.talk ? 'open' : 'smile'), talk: o.talk }, .6);
  // peaked cap with badge
  K.shape('pcap', crSpline([[-50, -820], [-46, -860], [0, -874], [46, -860], [50, -820]], true, 5), uni, { tex: .25, lw: 2.8 });
  K.shape('pband', [[-52, -836], [52, -836], [52, -818], [-52, -818]], uniD, { tex: .2, lw: 2.4 });
  K.shape('pvisor', crSpline([[-54, -820], [54, -820], [40, -804], [-40, -804]], true, 3), '#1e2c34', { tex: .1, lw: 2.4 });
  _chSparkle(K, 0, -848, 10, brass);
}

function _tfChild(K, o) {
  const g = K.g, C = CH_TOWN, f = o.frame;
  const shirt = '#fbf5e8', stripe = '#3f5f8a', shorts = '#6b5240', sock = '#f3ead8', beret = '#c4383a', hair = '#6a4026';
  // balloon on a string
  const bob = Math.sin(f * .45) * 6;
  K.ink('cstring', crSpline([[56, -170], [70, -260], [62, -340 + bob], [80, -420 + bob]], false, 6), 1.4, { taper: false });
  const bal = crSpline([[80, -540 + bob], [124, -500 + bob], [118, -440 + bob], [80, -414 + bob], [42, -440 + bob], [36, -500 + bob]], true, 6);
  K.shape('cbal', bal, '#4f7d78', { tex: .15, lw: 2.6, shade: gg => { gg.fillStyle = '#36605b'; gg.globalAlpha = .6; gg.beginPath(); gg.ellipse(100, -450 + bob, 40, 40, 0, 0, 7); gg.fill(); } });
  K.ell(62, -506 + bob, 9, 14, 'rgba(255,255,255,.6)');
  K.shape('cknot', [[76, -416 + bob], [84, -416 + bob], [86, -406 + bob], [74, -406 + bob]], '#4f7d78', { tex: 0, lw: 1.4 });
  // legs
  for (const sd of [-1, 1]) { K.shape('cl' + sd, capsulePts(sd * 18, -100, sd * 20, -20, 11, 10), C.skin, { tex: .08, lw: 2.4 }); K.shape('cso' + sd, capsulePts(sd * 19, -60, sd * 20, -18, 11.5, 11), sock, { tex: .08, lw: 2.2 }); K.shape('csh' + sd, crSpline([[sd * 6, -4], [sd * 10, -22], [sd * 36, -20], [sd * 46, -6], [sd * 40, 2], [sd * 8, 2]], true, 4), '#7a2e2a', { tex: .2, lw: 2.2 }); }
  K.shape('cshorts', crSpline([[-40, -170], [40, -170], [46, -100], [6, -96], [0, -110], [-6, -96], [-46, -100]], true, 3), shorts, { tex: .25, lw: 2.6 });
  const body = crSpline([[-34, -250], [34, -250], [48, -210], [46, -160], [-46, -160], [-48, -210]], true, 4);
  K.shape('cbody', body, shirt, { tex: .1, lw: 2.8, shade: gg => { gg.fillStyle = stripe; for (let yy = -246; yy < -160; yy += 16) gg.fillRect(-60, yy, 120, 7); } });
  drawSleeve(K, 'carmL', [[-40, -236], [-56, -200], [-52, -164]], [11, 10, 9], shirt, '#ddd2c0', null, true);
  drawHand(K, 'chL', -52, -166, Math.PI / 2, .7, 'relaxed', -1, C.skin, C.skinShade);
  drawSleeve(K, 'carmR', [[40, -236], [58, -204], [56, -172]], [11, 10, 9], shirt, '#ddd2c0', null, true);
  drawHand(K, 'chR', 56, -174, Math.PI / 2 - .3, .7, 'fist', 1, C.skin, C.skinShade);
  // huge round head
  const head = crSpline([[0, -430], [70, -412], [86, -350], [70, -284], [0, -258], [-70, -284], [-86, -350], [-70, -412]], true, 6);
  K.shape('chead', head, C.skin, { tex: .08, lw: 3 });
  const hr = crSpline([[-84, -350], [-86, -400], [-50, -432], [20, -436], [76, -410], [86, -350], [70, -366], [40, -380], [10, -372], [-20, -380], [-56, -372]], true, 5);
  K.shape('chair', hr, hair, { tex: .25, lw: 2.6 });
  _chBlush(g, -46, -318, 16, 9, C.blush, .7); _chBlush(g, 46, -318, 16, 9, C.blush, .7);
  _tfEyes(K, 0, -338, 28, 9, o);
  K.ink('cnose', [[2, -322], [5, -316], [0, -314]], 1.8);
  drawMouth(K, 0, -300, { mouth: o.mood || (o.talk ? 'open' : 'grin'), talk: o.talk }, .7);
  // beret
  K.shape('cberet', crSpline([[-80, -404], [-60, -444], [10, -460], [70, -440], [84, -412], [40, -406], [-30, -400]], true, 5), beret, { tex: .25, lw: 2.6 });
  K.ink('cstalk', [[8, -458], [12, -472]], 4);
}

function _tfReferee(K, o) {
  const g = K.g, C = CH_TOWN, f = o.frame;
  const dark = '#3b2f2c', light = '#f4ecdc', shorts = '#2e2624';
  for (const sd of [-1, 1]) {
    K.shape('rl' + sd, capsulePts(sd * 30, -190, sd * 34, -26, 15, 12), C.skin, { tex: .08, lw: 2.4 });
    K.shape('rso' + sd, capsulePts(sd * 33, -110, sd * 34, -22, 14.5, 13), dark, { tex: .2, lw: 2.2 });
    K.shape('rsh' + sd, crSpline([[sd * 14, -4], [sd * 20, -26], [sd * 54, -24], [sd * 66, -8], [sd * 58, 2], [sd * 16, 2]], true, 4), '#1e1a18', { tex: .2, lw: 2.2 });
  }
  K.shape('rshorts', crSpline([[-70, -260], [70, -260], [74, -184], [8, -180], [0, -196], [-8, -180], [-74, -184]], true, 3), shorts, { tex: .2, lw: 2.6 });
  // barrel chest, striped
  const body = crSpline([[0, -470], [76, -458], [104, -390], [96, -300], [74, -250], [-74, -250], [-96, -300], [-104, -390], [-76, -458]], true, 6);
  K.shape('rbody', body, light, { tex: .12, lw: 3, shade: gg => { gg.fillStyle = dark; for (let xx = -110; xx < 110; xx += 28) gg.fillRect(xx, -480, 13, 240); gg.globalAlpha = .25; gg.fillStyle = '#000'; P2(gg, chTr(body, 26, 0)); gg.fill(); } });
  K.shape('rcollar', crSpline([[-30, -468], [0, -440], [30, -468], [20, -476], [-20, -476]], true, 3), dark, { tex: .1, lw: 2.2 });
  // arm raising a card, other with a clipboard
  const raise = o.card === false ? 0 : 1, wob = Math.sin(f * .8) * 3;
  drawSleeve(K, 'rarmR', [[90, -440], [140, -470], [146, -560 + wob]], [20, 16, 14], light, '#d8ccb6', null, true);
  g.save(); g.translate(150, -630 + wob); g.rotate(.12); K.shape('rcard', [[-26, -40], [26, -40], [26, 40], [-26, 40]], '#e8c23e', { tex: .15, lw: 2.4 }); g.font = font(40, 'Fraunces', 800); g.fillStyle = CH_TOWN.line; g.textAlign = 'center'; g.fillText('?', 0, 14); g.restore();
  drawHand(K, 'rhR', 146, -560 + wob, -Math.PI / 2, 1.1, 'fist', 1, C.skin, C.skinShade);
  drawSleeve(K, 'rarmL', [[-90, -440], [-118, -360], [-70, -320]], [20, 16, 14], light, '#d8ccb6', null, true);
  g.save(); g.translate(-60, -330); g.rotate(-.25); K.shape('rclip', [[-40, -54], [40, -54], [40, 54], [-40, 54]], '#a87a4a', { tex: .3, lw: 2.2 }); K.shape('rpaper', [[-32, -44], [32, -44], [32, 46], [-32, 46]], '#fbf4e2', { tex: .1, lw: 1.4 });
  for (let i = 0; i < 4; i++) K.ink('rln' + i, [[-24, -26 + i * 16], [20 - (i % 2) * 12, -26 + i * 16]], 1.4, { alpha: .6 });
  K.shape('rclp', [[-14, -60], [14, -60], [14, -46], [-14, -46]], '#b8b0a0', { tex: 0, lw: 1.6 }); g.restore();
  drawHand(K, 'rhL', -70, -322, .3, 1.1, 'relaxed', -1, C.skin, C.skinShade);
  // square head, bald with side hair, bushy brows, whistle
  K.shape('rneck', [[-24, -500], [24, -500], [26, -456], [-26, -456]], C.skin, { tex: .08, lw: 2.4 });
  const head = crSpline([[0, -640], [58, -630], [68, -560], [56, -500], [0, -484], [-56, -500], [-68, -560], [-58, -630]], true, 4);
  K.shape('rhead', head, C.skin, { tex: .08, lw: 3, shade: gg => { gg.fillStyle = '#fff'; gg.globalAlpha = .5; gg.beginPath(); gg.ellipse(-20, -620, 22, 8, -.3, 0, 7); gg.fill(); } });
  for (const sd of [-1, 1]) K.shape('rhair' + sd, crSpline([[sd * 62, -600], [sd * 72, -580], [sd * 70, -540], [sd * 60, -546], [sd * 58, -590]], true, 4), '#8a8078', { tex: .2, lw: 2 });
  for (const sd of [-1, 1]) K.ell(sd * 70, -556, 9, 14, C.skin), K.loop('rear' + sd, crSpline([[sd * 64, -572], [sd * 78, -566], [sd * 78, -544], [sd * 64, -540]], true, 3), 2);
  _tfEyes(K, 0, -566, 24, 6, o);
  K.shape('rbrL', crSpline([[-44, -590], [-10, -596], [-12, -584], [-42, -580]], true, 3), '#5a4a42', { tex: 0, lw: 1.6 });
  K.shape('rbrR', crSpline([[10, -596], [44, -590], [42, -580], [12, -584]], true, 3), '#5a4a42', { tex: 0, lw: 1.6 });
  _tfNose(K, 0, -546, 12, 11, C.skin);
  if (o.whistle !== false) {
    K.ink('rlan', crSpline([[-30, -500], [-40, -470], [-20, -440], [6, -520]], false, 5), 2, { color: '#c4383a', taper: false });
    K.shape('rwh', crSpline([[-6, -524], [26, -528], [30, -514], [-4, -510]], true, 3), '#c8c0b2', { tex: 0, lw: 2 });
    K.ell(18, -520, 4, 4, '#5a5048');
    if ((f % 6) < 3) for (let i = 0; i < 3; i++) K.ink('rpuff' + i, [[40 + i * 4, -540 + i * 12], [58 + i * 6, -548 + i * 14]], 2.4, { alpha: .7 });
  } else drawMouth(K, 0, -516, { mouth: o.mood || 'flat', talk: o.talk }, .7);
}

function _tfCat(K, o) {
  const g = K.g, f = o.frame, fur = '#4a4248', furD = '#332c33', white = '#f6efe2';
  const sw = Math.sin(f * .5);
  // tail curling
  const tail = crSpline([[50, -30], [110, -40], [130, -110 + sw * 10], [104 + sw * 18, -170], [90 + sw * 24, -160], [112, -110 + sw * 8], [96, -60], [50, -50]], true, 6);
  K.shape('ctail', tail, fur, { tex: .25, lw: 2.6 });
  // sitting body
  const body = crSpline([[0, -150], [46, -136], [70, -70], [66, -10], [30, 0], [-30, 0], [-66, -10], [-70, -70], [-46, -136]], true, 6);
  K.shape('cbody', body, fur, { tex: .25, lw: 2.8, shade: gg => { gg.fillStyle = furD; gg.globalAlpha = .7; P2(gg, chTr(body, 18, 0)); gg.fill(); } });
  K.shape('cchest', crSpline([[0, -130], [24, -100], [20, -40], [0, -24], [-20, -40], [-24, -100]], true, 5), white, { tex: .1, lw: 0 });
  for (const sd of [-1, 1]) K.shape('cpaw' + sd, crSpline([[sd * 10, -4], [sd * 12, -20], [sd * 34, -20], [sd * 38, -4], [sd * 26, 2]], true, 4), white, { tex: .1, lw: 2.2 });
  // collar with bell
  K.ink('ccollar', bez([-34, -132], [-12, -120], [12, -120], [34, -132], 8), 7, { color: '#4f7d78', taper: false });
  K.shape('cbell', crSpline([[-7, -124], [7, -124], [8, -110], [-8, -110]], true, 3), '#d6a443', { tex: 0, lw: 1.6 });
  // head
  const head = crSpline([[0, -228], [40, -222], [58, -186], [48, -150], [0, -136], [-48, -150], [-58, -186], [-40, -222]], true, 6);
  for (const sd of [-1, 1]) { const ear = [[sd * 20, -216], [sd * 50, -250], [sd * 52, -200]]; K.shape('cear' + sd, ear, fur, { tex: .2, lw: 2.4 }); K.shape('ceari' + sd, [[sd * 28, -214], [sd * 46, -238], [sd * 46, -206]], '#d68a8a', { tex: 0, lw: 0 }); }
  K.shape('chead', head, fur, { tex: .25, lw: 2.8 });
  K.shape('cmuz', crSpline([[0, -180], [20, -172], [22, -154], [0, -146], [-22, -154], [-20, -172]], true, 5), white, { tex: .1, lw: 0 });
  // big eyes
  const blink = o.blink || 0;
  for (const sd of [-1, 1]) {
    if (blink > .6 || o.eyes === 'happy') K.ink('ce' + sd, bez([sd * 32, -186], [sd * 26, -194], [sd * 14, -194], [sd * 8, -186], 6), 3.4);
    else { K.ell(sd * 22, -188, 11, 12, '#c9d36a'); K.ell(sd * 22, -188, 3.6, 10, '#1e1a18'); K.ell(sd * 19, -192, 3, 3, '#fff'); K.loop('ceo' + sd, polyCircle(sd * 22, -188, 11, 12, 16), 2); }
  }
  K.shape('cnose', [[-5, -170], [5, -170], [0, -163]], '#d68a8a', { tex: 0, lw: 1.4 });
  K.ink('cmouth', crSpline([[-9, -158], [-4, -154], [0, -160], [4, -154], [9, -158]], false, 4), 1.8);
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) K.ink('cwh' + sd + i, [[sd * 26, -164 + i * 6], [sd * 64, -170 + i * 10]], 1.2, { alpha: .6, taper: true });
}

// ---- Round 3: the townsfolk redrawn in the anime idiom of Claude and Hilde -------------------------------------
// Same signature, scale, foot point and head placement as before (o.style: 'classic' draws the old flash-cartoon versions).
// Shared face kit: anime eyes (lash line with outer flick, gradient iris, pupil, two catchlights), small noses, soft cheeks.
const TF = {
  line: '#45291b', skin: '#fde1c8', skinShade: '#f2b598', skinDeep: '#e3967c', blush: '#f08070', white: '#fffaf2',
};
function _tfMouthP(o, dflt = 'smile') { const m = o.mood || (o.talk ? 'open' : dflt); return { mouth: m, talk: o.talk == null ? (m === 'open' ? .6 : 0) : o.talk }; }
// anime eye. side: -1 left / +1 right (outer corner direction); sp: { w, h, iris, irisDeep, lash, flick, kid }
function _tfEye(K, name, ex, ey, side, o, sp) {
  const g = K.g, S = x => ex + side * x;
  const blink = o.blink || 0, look = o.look || [0, 0], mode = o.eyes || 'open';
  const w = sp.w, h0 = sp.h, lashW = sp.lash || 3.4;
  if (mode === 'happy' || mode === 'laugh') {
    K.ink(name + 'h', bez([S(-w), ey + h0 * .25], [S(-w * .45), ey - h0 * .6], [S(w * .45), ey - h0 * .62], [S(w * 1.05), ey + h0 * .2], 10), lashW * .95);
    return;
  }
  if (mode === 'closed' || blink >= .85) {
    K.ink(name + 'c', bez([S(-w), ey], [S(-w * .4), ey + h0 * .55], [S(w * .45), ey + h0 * .55], [S(w * 1.05), ey - h0 * .1], 10), lashW * .9);
    if (sp.flick) K.ink(name + 'cf', [[S(w * 1.0), ey - h0 * .08], [S(w * 1.35), ey - h0 * .35]], lashW * .45);
    return;
  }
  const open = clamp(1 - blink) * (mode === 'wide' ? 1.15 : 1), h = h0 * open;
  const shape = crSpline([[S(-w), ey + h * .1], [S(-w * .55), ey - h * .9], [S(w * .45), ey - h], [S(w * 1.02), ey - h * .25], [S(w * .7), ey + h * .75], [S(-w * .3), ey + h * .85]], true, 6);
  g.save(); P2(g, K.smooth(shape, true)); g.fillStyle = TF.white; g.fill(); g.clip();
  const ix = ex + look[0] * w * .38, iy = ey + h * .08 + look[1] * h * .3, irx = w * (sp.kid ? .72 : .6), iry = h * (sp.kid ? 1.02 : .95);
  const gr = g.createLinearGradient(0, iy - iry, 0, iy + iry); gr.addColorStop(0, sp.irisDeep); gr.addColorStop(.5, sp.iris); gr.addColorStop(1, mix(sp.iris, '#ffe2a8', .45));
  g.beginPath(); g.ellipse(ix, iy, irx, iry, 0, 0, 7); g.fillStyle = gr; g.fill();
  _chIrisTexture(K, name, ix, iy, irx, iry, irx * .42, sp.irisDeep, '#ffe6b0', K.detail * .8);
  K.ell(ix, iy + iry * .05, irx * .42, iry * .45, '#22120a');
  g.fillStyle = 'rgba(190,120,100,.28)'; g.beginPath(); g.ellipse(ex, ey - h * .95, w * 1.4, h * .35, 0, 0, 7); g.fill();     // lid shadow
  K.ell(ix - irx * .35, iy - iry * .42, irx * .3, iry * .26, '#ffffff');
  K.ell(ix + irx * .38, iy + iry * .4, irx * .14, iry * .12, 'rgba(255,255,255,.9)');
  g.restore();
  const top = bez([S(-w * 1.08), ey + h * .2], [S(-w * .55), ey - h * 1.08], [S(w * .5), ey - h * 1.12], [S(w * 1.1), ey - h * .3], 12);
  K.ink(name + 'u', top, lashW);
  if (sp.flick) K.ink(name + 'f', [top[top.length - 2], [S(w * 1.42), ey - h * .62]], lashW * .55);
  K.ink(name + 'l', bez([S(-w * .25), ey + h * .92], [S(w * .2), ey + h], [S(w * .62), ey + h * .82], [S(w * .92), ey + h * .3], 5), lashW * .38, { alpha: .65 });
  if (K.detail > 0) _chLashes(K, name + 'ls', top, 4, w * .35, .8, .5, 1, side, -1, K.detail);
}
function _tfBrow(K, name, x, y, side, len, w, tilt, color, arch = 3) {
  const S = u => x + side * u;
  K.ink(name, bez([S(-len * .5), y + tilt * 2], [S(-len * .15), y - arch + tilt], [S(len * .2), y - arch - tilt * .5], [S(len * .55), y - tilt * 1.5 + 1], 8), w, { color });
}
function _tfCheeks(K, x, y, gap, rx, a = .55) { for (const sd of [-1, 1]) { _chBlush(K.g, x + sd * gap, y, rx, rx * .5, TF.blush, a); for (let k = 0; k < 3; k++) K.ink('ck' + sd + k, [[x + sd * gap + (-rx * .45 + k * rx * .4), y + rx * .12], [x + sd * gap + (-rx * .3 + k * rx * .4), y - rx * .22]], .9, { color: '#e0604f', alpha: a * .8 }); } }
// a face: fill with soft cheek shading, ink only the jaw (the hair covers the rest)
function _tfFace(K, name, pts, jaw = [.08, .58]) {
  const g = K.g; let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  K.fill(pts, TF.skin, { tex: .1, shade: gg => { const gr = gg.createRadialGradient(cx, cy - 10, 10, cx, cy, 110); gr.addColorStop(0, 'rgba(255,236,214,0)'); gr.addColorStop(1, 'rgba(240,160,130,.38)'); gg.fillStyle = gr; gg.fillRect(cx - 160, cy - 160, 320, 320); } });
  const n = pts.length; K.ink(name, pts.slice(Math.floor(n * jaw[0]), Math.floor(n * jaw[1])), 3);
}
// cel-shaded cloth part: fill + a shadow side band (offset copy), outline
function _tfCloth(K, name, pts, col, shadeCol, o = {}) {
  const dx = o.dx != null ? o.dx : 22, dy = o.dy || 0;
  K.shape(name, pts, col, { tex: o.tex != null ? o.tex : .22, lw: o.lw || 2.8, shade: gg => { gg.fillStyle = shadeCol; gg.globalAlpha = .85; gg.beginPath(); gg.rect(-3000, -3000, 6000, 6000); const q = chTr(pts, -dx, -dy); gg.moveTo(q[0][0], q[0][1]); for (const v of q) gg.lineTo(v[0], v[1]); gg.closePath(); gg.fill('evenodd'); if (o.extra) o.extra(gg); } });
}
function _tfShoe(K, name, sd, x0, w, col, colD) {
  const pts = crSpline([[sd * (x0 - 8), 0], [sd * (x0 - 10), -18], [sd * (x0 + w * .3), -26], [sd * (x0 + w * .85), -20], [sd * (x0 + w), -6], [sd * (x0 + w * .8), 2]], true, 5);
  K.shape(name, pts, col, { tex: .2, lw: 2.4, shade: gg => { gg.fillStyle = colD; gg.globalAlpha = .7; gg.fillRect(-500, -8, 1000, 20); } });
  K.ink(name + 'g', [[sd * (x0 + w * .25), -20], [sd * (x0 + w * .6), -18]], 2.2, { color: '#ffffff', alpha: .35 });
}

function _tfBakerA(K, o) {
  const g = K.g, f = o.frame;
  const shirt = '#e0ad4c', shirtD = '#b98432', apron = '#fbf6ec', apronD = '#e3d8c6', trousers = '#6e5644', trousersD = '#54402f', hat = '#fffaf2', hatD = '#e8dfd0', kerchief = '#c8443e', hair = '#7a4e30', hairD = '#5a3520';
  // legs + shoes
  for (const sd of [-1, 1]) { drawSleeve(K, 'bl' + sd, [[sd * 40, -112], [sd * 42, -66], [sd * 44, -24]], [23, 22, 20], trousers, trousersD, null, true, false, { folds: false }); _tfShoe(K, 'bs' + sd, sd, 24, 52, '#4a3024', '#2e1c14'); }
  // round body (shirt), apron with pocket, flour dust
  const body = crSpline([[0, -404], [72, -384], [122, -304], [142, -196], [128, -112], [72, -86], [-72, -86], [-128, -112], [-142, -196], [-122, -304], [-72, -384]], true, 6);
  _tfCloth(K, 'bbody', body, shirt, shirtD, { dx: 30, dy: 4 });
  const apr = crSpline([[-58, -330], [58, -330], [94, -206], [106, -112], [78, -92], [-78, -92], [-106, -112], [-94, -206]], true, 5);
  _tfCloth(K, 'bapron', apr, apron, apronD, { dx: 24, tex: .1 });
  K.ink('bapS', [[-58, -330], [-40, -400]], 4, { color: apronD, taper: false }); K.ink('bapS2', [[58, -330], [40, -400]], 4, { color: apronD, taper: false });
  K.shape('bpocket', [[-38, -200], [38, -200], [36, -158], [30, -152], [-30, -152], [-36, -158]], apron, { tex: .1, lw: 2 });
  K.ink('bpockS', [[-34, -192], [34, -192]], 1, { alpha: .45, taper: false });
  for (const [px, py, r] of [[-44, -172, 7], [-30, -160, 4], [52, -250, 5]]) K.ell(px, py, r, r * .7, 'rgba(255,255,255,.55)');
  for (let i = 0; i < 3; i++) K.ink('bapf' + i, bez([-50 + i * 50, -320], [-54 + i * 54, -260], [-60 + i * 60, -180], [-66 + i * 66, -110], 8), 1.2, { alpha: .25 });
  // arms: rolled-up shirt sleeves, bare forearms; one hand on the belly, the other hugging a baguette
  const sway = Math.sin(f * .5) * 4;
  _drawBaguette(K, 'bag', 60, -330 + sway, 196, -150 + sway);
  drawSleeve(K, 'barmL', [[-104, -334], [-124, -298], [-138, -262]], [24, 23, 21], shirt, shirtD, null, true);
  K.shape('brollL', capsulePts(-140, -272, -136, -252, 21, 21), mix(shirt, '#fff', .2), { tex: .2, lw: 2.2 });
  drawSleeve(K, 'bfaL', [[-138, -258], [-130, -214], [-100, -184]], [15, 14, 12.5], TF.skin, TF.skinShade, null, true, true, { folds: false });
  drawHand(K, 'bhL', -100, -184, -.15, 1.15, 'flat', 1, TF.skin, TF.skinShade);
  drawSleeve(K, 'barmR', [[104, -334], [124, -300], [136, -272]], [24, 23, 21], shirt, shirtD, null, true);
  K.shape('brollR', capsulePts(138, -282, 134, -262, 21, 21), mix(shirt, '#fff', .2), { tex: .2, lw: 2.2 });
  drawSleeve(K, 'bfaR', [[136, -266], [122, -232], [92, -222]], [15, 14, 12.5], TF.skin, TF.skinShade, null, true, true, { folds: false });
  drawHand(K, 'bhR', 92, -222, Math.PI + .3, 1.15, 'fist', -1, TF.skin, TF.skinShade);
  // neckerchief
  K.shape('bker', crSpline([[-54, -412], [0, -396], [54, -412], [46, -380], [0, -368], [-46, -380]], true, 4), kerchief, { tex: .25, lw: 2.2, shade: gg => { gg.fillStyle = '#9e2e2c'; gg.globalAlpha = .7; gg.fillRect(-60, -390, 120, 30); } });
  K.shape('bknot', crSpline([[-10, -392], [10, -392], [16, -364], [0, -356], [-16, -364]], true, 4), kerchief, { tex: .25, lw: 2 });
  // head: round, warm, jolly
  const face = crSpline([[0, -556], [56, -548], [80, -500], [78, -452], [56, -414], [0, -398], [-56, -414], [-78, -452], [-80, -500], [-56, -548]], true, 6);
  // hair: sideburns and a back fringe peeking from under the toque, ears
  for (const sd of [-1, 1]) {
    K.shape('bear' + sd, crSpline([[sd * 76, -488], [sd * 90, -494], [sd * 94, -470], [sd * 86, -450], [sd * 76, -452]], true, 4), TF.skin, { tex: .08, lw: 2.2, shade: gg => { gg.fillStyle = TF.skinShade; gg.globalAlpha = .6; gg.beginPath(); gg.ellipse(sd * 86, -470, 4, 9, 0, 0, 7); gg.fill(); } });
  }
  _tfFace(K, 'bface', face);
  for (const sd of [-1, 1]) K.shape('bsb' + sd, crSpline([[sd * 62, -540], [sd * 84, -534], [sd * 84, -500], [sd * 80, -470], [sd * 74, -484], [sd * 70, -512]], true, 4), hair, { tex: .2, lw: 2.2, shade: gg => { gg.fillStyle = hairD; gg.globalAlpha = .7; gg.fillRect(sd > 0 ? 76 : -90, -540, 14, 80); } });
  _tfCheeks(K, 0, -458, 48, 17, .6);
  _tfEye(K, 'beL', -30, -490, -1, o, { w: 13, h: 12, iris: '#8a5a34', irisDeep: '#3e2414', lash: 3.6 });
  _tfEye(K, 'beR', 30, -490, 1, o, { w: 13, h: 12, iris: '#8a5a34', irisDeep: '#3e2414', lash: 3.6 });
  _tfBrow(K, 'bbrL', -30, -516, -1, 26, 5, -.3, hair, 4); _tfBrow(K, 'bbrR', 30, -516, 1, 26, 5, -.3, hair, 4);
  K.ink('bnose', bez([2, -478], [7, -470], [7, -464], [1, -462], 6), 2, { alpha: .8 });
  K.ell(4, -468, 3, 2, 'rgba(255,255,255,.55)');
  // moustache: two sleek curled locks
  const mw = Math.sin(f * .9) * 1.5;
  for (const sd of [-1, 1]) {
    const m = crSpline([[sd * 2, -458], [sd * 20, -462], [sd * 36, -456 + mw], [sd * 46, -462 + mw], [sd * 44, -450 + mw], [sd * 30, -446], [sd * 12, -448]], true, 5);
    K.shape('bmus' + sd, m, hair, { tex: .2, lw: 2, shade: gg => { gg.fillStyle = hairD; gg.globalAlpha = .6; gg.fillRect(-60, -452, 120, 10); } });
    K.ink('bmusH' + sd, [[sd * 10, -456], [sd * 28, -457]], 1.6, { color: '#c0906a', alpha: .6 });
  }
  drawMouth(K, 0, -436, _tfMouthP(o), .78);
  // toque: puffed crown with soft pleats, starched band
  const toque = crSpline([[-58, -540], [-82, -598], [-72, -656], [-34, -690], [0, -674], [32, -692], [72, -664], [84, -600], [58, -540]], true, 6);
  _tfCloth(K, 'btoq', toque, hat, hatD, { dx: 26, dy: 6, tex: .08 });
  for (const [a, b] of [[[-30, -556], [-40, -650]], [[0, -556], [-2, -662]], [[30, -556], [38, -656]]]) K.ink('btq' + a[0], bez(a, [a[0] - 4, (a[1] + b[1]) / 2], [b[0], (a[1] + b[1]) / 2 - 20], b, 6), 1.4, { alpha: .4 });
  K.shape('bband', crSpline([[-62, -562], [62, -562], [64, -530], [-64, -530]], true, 2), hat, { tex: .08, lw: 2.6, shade: gg => { gg.fillStyle = hatD; gg.globalAlpha = .8; gg.fillRect(-70, -542, 140, 14); } });
}

function _tfPostmanA(K, o) {
  const g = K.g, f = o.frame;
  const uni = '#3f5f6b', uniD = '#2c4450', uniL = '#5a7d8a', brass = '#d6a443', bag = '#8a5a36', bagD = '#6a4026', hair = '#3e2a22', hairD = '#2a1a14';
  // long legs, polished shoes
  for (const sd of [-1, 1]) { drawSleeve(K, 'pl' + sd, [[sd * 22, -334], [sd * 25, -180], [sd * 26, -28]], [17, 15, 13], uniD, '#22363f', null, true, false, { folds: false }); _tfShoe(K, 'ps' + sd, sd, 12, 60, '#2e1e16', '#1a100a'); }
  // tall jacket with a belt, brass buttons
  const body = crSpline([[0, -640], [46, -630], [62, -566], [64, -404], [58, -312], [-58, -312], [-64, -404], [-62, -566], [-46, -630]], true, 5);
  _tfCloth(K, 'pbody', body, uni, uniD, { dx: 24 });
  K.ink('pfront', [[2, -620], [2, -314]], 2, { alpha: .65 });
  K.ink('pbelt', [[-62, -420], [62, -420]], 10, { color: uniD, taper: false }); K.shape('pbuck', crSpline([[-9, -428], [9, -428], [9, -412], [-9, -412]], true, 2), brass, { tex: 0, lw: 1.6 });
  for (let i = 0; i < 4; i++) { K.ell(-10, -596 + i * 50, 5, 5, brass); K.ell(-11.5, -597.5 + i * 50, 1.6, 1.6, '#fff1c8'); }
  // a high stand collar up the neck, its two points turned down
  _tfCloth(K, 'pcolS', crSpline([[-22, -694], [22, -694], [28, -650], [0, -640], [-28, -650]], true, 4), uni, uniD, { dx: 10, tex: .2, lw: 2.4 });
  for (const sd of [-1, 1]) K.shape('pcol' + sd, crSpline([[sd * 3, -650], [sd * 20, -652], [sd * 27, -636], [sd * 13, -628], [sd * 3, -634]], true, 4), uniL, { tex: .2, lw: 1.8 });
  // satchel strap + bag with letters
  K.ink('pstrap', [[-44, -622], [60, -380]], 10, { color: bag, taper: false }); K.ink('pstrapE', [[-44, -622], [60, -380]], 1.2, { taper: false, alpha: .6 });
  for (let i = 0; i < 3; i++) { g.save(); g.translate(58 + i * 14, -420 - i * 6); g.rotate(-.2 + i * .25); K.shape('plet' + i, [[-18, -14], [18, -14], [18, 14], [-18, 14]], i === 1 ? '#f2e2c4' : '#fbf4e2', { tex: .1, lw: 1.6 }); g.restore(); }
  _tfCloth(K, 'pbag', crSpline([[20, -400], [110, -400], [116, -320], [66, -300], [16, -320]], true, 3), bag, bagD, { dx: 18, tex: .3, lw: 2.6 });
  K.shape('pflap', crSpline([[20, -400], [110, -400], [104, -360], [24, -360]], true, 2), '#a06a3c', { tex: .3, lw: 2.2 });
  K.ell(64, -366, 6, 6, brass);
  // arms: one hanging relaxed, the other raising a letter
  drawSleeve(K, 'parmL', [[-56, -612], [-72, -506], [-70, -406]], [17, 15, 13], uni, uniD, uniD, true);
  drawHand(K, 'phL', -70, -406, Math.PI / 2 + .05, 1, 'relaxed', -1, TF.skin, TF.skinShade);
  const lift = Math.sin(f * .6) * 6;
  drawSleeve(K, 'parmR', [[56, -612], [102, -566], [104, -684 + lift]], [17, 15, 13], uni, uniD, uniD, true);
  g.save(); g.translate(110, -726 + lift); g.rotate(.15); K.shape('pletter', [[-30, -20], [30, -20], [30, 20], [-30, 20]], '#fbf4e2', { tex: .1, lw: 2 }); K.ink('pletx', [[-30, -20], [0, 2], [30, -20]], 1.6); K.shape('pstamp', [[16, -16], [26, -16], [26, -4], [16, -4]], '#c4383a', { tex: 0, lw: 1 }); g.restore();
  drawHand(K, 'phR', 104, -684 + lift, -Math.PI / 2, 1, 'hold', 1, TF.skin, TF.skinShade);
  // neck and a slim anime face
  K.shape('pneck', [[-12, -712], [12, -712], [13, -690], [-13, -690]], TF.skin, { tex: .08, lw: 2.4, shade: gg => { gg.fillStyle = TF.skinShade; gg.globalAlpha = .7; gg.fillRect(-14, -706, 28, 24); } });
  const face = crSpline([[0, -838], [42, -830], [52, -788], [48, -742], [30, -710], [0, -696], [-30, -710], [-48, -742], [-52, -788], [-42, -830]], true, 6);
  for (const sd of [-1, 1]) K.shape('pear' + sd, crSpline([[sd * 48, -780], [sd * 60, -786], [sd * 62, -764], [sd * 54, -748], [sd * 48, -752]], true, 4), TF.skin, { tex: .08, lw: 2 });
  _tfFace(K, 'pface', face);
  // tousled dark hair under the cap: fringe locks and sideburns
  const fringe = _bangEdge([[-50, -786], [-30, -796], [-8, -790], [14, -798], [36, -790], [52, -784]], [[-40, -822], [-19, -826], [3, -826], [25, -824], [44, -818]]);
  K.shape('phair', [...fringe, [56, -824], [40, -842], [-40, -842], [-56, -824]], hair, { tex: .2, lw: 2.4, shade: gg => { gg.fillStyle = hairD; gg.globalAlpha = .6; gg.fillRect(-60, -830, 120, 14); } });
  for (const sd of [-1, 1]) K.shape('psb' + sd, crSpline([[sd * 46, -812], [sd * 54, -806], [sd * 52, -760], [sd * 47, -766]], true, 3), hair, { tex: .2, lw: 2 });
  _tfCheeks(K, 0, -742, 30, 11, .4);
  _tfEye(K, 'peL', -20, -770, -1, o, { w: 9.5, h: 9, iris: '#4f6e7a', irisDeep: '#1e2c34', lash: 3, flick: true });
  _tfEye(K, 'peR', 20, -770, 1, o, { w: 9.5, h: 9, iris: '#4f6e7a', irisDeep: '#1e2c34', lash: 3, flick: true });
  _tfBrow(K, 'pbrL', -21, -790, -1, 18, 2.8, .2, hair, 2); _tfBrow(K, 'pbrR', 21, -790, 1, 18, 2.8, .2, hair, 2);
  K.ink('pnose', [[2, -760], [5, -748], [1, -746]], 1.6, { alpha: .75 });
  drawMouth(K, 1, -724, _tfMouthP(o), .62);
  // peaked cap with the star badge
  _tfCloth(K, 'pcap', crSpline([[-52, -820], [-48, -862], [0, -878], [48, -862], [52, -820]], true, 5), uni, uniD, { dx: 18, tex: .25 });
  K.shape('pband', [[-54, -838], [54, -838], [54, -818], [-54, -818]], uniD, { tex: .2, lw: 2.4 });
  K.shape('pvisor', crSpline([[-56, -820], [56, -820], [42, -802], [-42, -802]], true, 3), '#1e2c34', { tex: .1, lw: 2.4 });
  K.ink('pvisH', [[-30, -816], [24, -816]], 1.6, { color: '#7a98a4', alpha: .5 });
  _chSparkle(K, 0, -850, 10, brass);
}

function _tfChildA(K, o) {
  const g = K.g, f = o.frame;
  const shirt = '#fbf5e8', stripe = '#3f5f8a', shorts = '#6b5240', shortsD = '#52402f', sock = '#f3ead8', beret = '#cc3c3c', beretD = '#9e2a2c', hair = '#6a4026', hairD = '#4a2a18';
  // balloon on a string
  const bob = Math.sin(f * .45) * 6;
  K.ink('cstring', crSpline([[56, -170], [70, -260], [62, -340 + bob], [80, -420 + bob]], false, 6), 1.4, { taper: false });
  const bal = crSpline([[80, -540 + bob], [124, -500 + bob], [118, -440 + bob], [80, -414 + bob], [42, -440 + bob], [36, -500 + bob]], true, 6);
  K.shape('cbal', bal, '#4f7d78', { tex: .15, lw: 2.6, shade: gg => { gg.fillStyle = '#36605b'; gg.globalAlpha = .6; gg.beginPath(); gg.ellipse(100, -450 + bob, 40, 40, 0, 0, 7); gg.fill(); } });
  K.ell(62, -506 + bob, 9, 14, 'rgba(255,255,255,.6)'); K.ell(70, -486 + bob, 3, 4, 'rgba(255,255,255,.5)');
  K.shape('cknot', [[76, -416 + bob], [84, -416 + bob], [86, -406 + bob], [74, -406 + bob]], '#4f7d78', { tex: 0, lw: 1.4 });
  // legs, socks, shoes
  for (const sd of [-1, 1]) {
    drawSleeve(K, 'cl' + sd, [[sd * 18, -102], [sd * 19, -60], [sd * 20, -22]], [11, 10.5, 10], TF.skin, TF.skinShade, null, true, false, { folds: false });
    K.shape('cso' + sd, capsulePts(sd * 19, -60, sd * 20, -18, 11.5, 11), sock, { tex: .08, lw: 2.2 });
    K.ink('csoR' + sd, [[sd * 19 - 10, -56], [sd * 19 + 10, -56]], 1.1, { alpha: .4, taper: false });
    _tfShoe(K, 'csh' + sd, sd, 8, 38, '#7a2e2a', '#561e1c');
  }
  _tfCloth(K, 'cshorts', crSpline([[-40, -170], [40, -170], [46, -100], [6, -96], [0, -110], [-6, -96], [-46, -100]], true, 3), shorts, shortsD, { dx: 14 });
  // striped sailor shirt
  const body = crSpline([[-34, -250], [34, -250], [48, -210], [46, -160], [-46, -160], [-48, -210]], true, 4);
  K.shape('cbody', body, shirt, { tex: .1, lw: 2.8, shade: gg => { gg.fillStyle = stripe; for (let yy = -246; yy < -160; yy += 16) gg.fillRect(-60, yy, 120, 7); gg.fillStyle = 'rgba(40,50,80,.18)'; gg.fillRect(20, -260, 40, 110); } });
  // arms (the left arm stays inside x -90..-47, y -246..-136: ch5 lifts it out to raise it in a wave)
  drawSleeve(K, 'carmL', [[-40, -236], [-56, -200], [-52, -164]], [11, 10, 9], shirt, '#ddd2c0', null, true);
  drawHand(K, 'chL', -52, -166, Math.PI / 2, .7, 'relaxed', -1, TF.skin, TF.skinShade);
  drawSleeve(K, 'carmR', [[40, -236], [58, -204], [56, -172]], [11, 10, 9], shirt, '#ddd2c0', null, true);
  drawHand(K, 'chR', 56, -174, Math.PI / 2 - .3, .7, 'fist', 1, TF.skin, TF.skinShade);
  // big round head, anime eyes, beret over tufty hair
  const face = crSpline([[0, -432], [66, -416], [84, -358], [78, -302], [50, -270], [0, -256], [-50, -270], [-78, -302], [-84, -358], [-66, -416]], true, 6);
  const back = crSpline([[-86, -350], [-90, -404], [-56, -436], [0, -444], [58, -436], [90, -404], [86, -350], [70, -330], [-70, -330]], true, 5);
  _tfCloth(K, 'chairB', back, hair, hairD, { dx: 18, tex: .2, lw: 2.6 });
  for (const sd of [-1, 1]) K.shape('cear' + sd, crSpline([[sd * 80, -350], [sd * 94, -356], [sd * 96, -332], [sd * 86, -318], [sd * 80, -322]], true, 4), TF.skin, { tex: .08, lw: 2 });
  _tfFace(K, 'cface', face);
  const fr = _bangEdge([[-82, -340], [-58, -366], [-28, -372], [0, -364], [28, -374], [58, -366], [84, -342]], [[-72, -400], [-44, -406], [-14, -410], [14, -410], [44, -404], [72, -398]]);
  _tfCloth(K, 'chair', [...fr, [88, -400], [60, -432], [-60, -432], [-88, -400]], hair, hairD, { dx: 14, dy: -6, tex: .2, lw: 2.6 });
  g.save(); P2(g, fr.concat([[88, -400], [60, -432], [-60, -432], [-88, -400]])); g.clip(); g.globalAlpha = .4; g.fillStyle = '#a06a44'; g.beginPath(); g.ellipse(-10, -400, 60, 8, -.1, 0, 7); g.fill(); g.restore();
  _tfCheeks(K, 0, -312, 50, 16, .7);
  _tfEye(K, 'ceL', -32, -334, -1, o, { w: 15, h: 18, iris: '#7a5030', irisDeep: '#341a0c', lash: 4.2, kid: true });
  _tfEye(K, 'ceR', 32, -334, 1, o, { w: 15, h: 18, iris: '#7a5030', irisDeep: '#341a0c', lash: 4.2, kid: true });
  _tfBrow(K, 'cbrL', -32, -362, -1, 18, 3, 0, hair, 3); _tfBrow(K, 'cbrR', 32, -362, 1, 18, 3, 0, hair, 3);
  K.ink('cnose', [[1, -318], [3, -313], [0, -312]], 1.5, { alpha: .7 });
  drawMouth(K, 0, -298, _tfMouthP(o, 'grin'), .68);
  // beret with a stalk, tilted
  _tfCloth(K, 'cberet', crSpline([[-82, -404], [-62, -446], [10, -462], [72, -442], [86, -414], [40, -406], [-30, -400]], true, 5), beret, beretD, { dx: 16, dy: -8, tex: .25, lw: 2.6 });
  K.ink('cberH', bez([-50, -436], [-20, -450], [20, -452], [50, -442], 8), 2.4, { color: '#ef8070', alpha: .5 });
  K.ink('cstalk', [[8, -460], [12, -474]], 4);
  // two tufts escaping at the side
  K.shape('ctuft', crSpline([[78, -394], [100, -400], [92, -386], [104, -378], [84, -376]], true, 3), hair, { tex: .2, lw: 2 });
}

function _tfRefereeA(K, o) {
  const g = K.g, f = o.frame;
  const dark = '#3b2f2c', light = '#f4ecdc', lightD = '#d8ccb6', shorts = '#2e2624', hairC = '#8a8078', hairD = '#6a6058';
  for (const sd of [-1, 1]) {
    drawSleeve(K, 'rl' + sd, [[sd * 30, -192], [sd * 32, -110], [sd * 34, -28]], [15, 13.5, 12], TF.skin, TF.skinShade, null, true, false, { folds: false });
    K.shape('rso' + sd, capsulePts(sd * 33, -112, sd * 34, -22, 14.5, 13), dark, { tex: .2, lw: 2.2 });
    K.ink('rsoS' + sd, [[sd * 33 - 12, -100], [sd * 33 + 12, -100]], 2, { color: '#e8dccb', alpha: .7, taper: false });
    _tfShoe(K, 'rsh' + sd, sd, 14, 50, '#1e1a18', '#0e0a08');
  }
  _tfCloth(K, 'rshorts', crSpline([[-70, -262], [70, -262], [74, -184], [8, -180], [0, -196], [-8, -180], [-74, -184]], true, 3), shorts, '#1a1412', { dx: 18 });
  // barrel chest, striped jersey with cel shading
  const body = crSpline([[0, -470], [76, -458], [104, -390], [96, -300], [74, -252], [-74, -252], [-96, -300], [-104, -390], [-76, -458]], true, 6);
  K.shape('rbody', body, light, { tex: .12, lw: 3, shade: gg => { gg.fillStyle = dark; for (let xx = -110; xx < 110; xx += 28) gg.fillRect(xx, -480, 13, 240); gg.globalAlpha = .28; gg.fillStyle = '#2a1e1a'; gg.beginPath(); gg.rect(-3000, -3000, 6000, 6000); const q = chTr(body, -28, -4); gg.moveTo(q[0][0], q[0][1]); for (const v of q) gg.lineTo(v[0], v[1]); gg.closePath(); gg.fill('evenodd'); } });
  K.shape('rcollar', crSpline([[-32, -468], [0, -438], [32, -468], [22, -478], [-22, -478]], true, 3), dark, { tex: .1, lw: 2.2 });
  // arm raising the "?" card; the other holds a clipboard
  const wob = Math.sin(f * .8) * 3;
  drawSleeve(K, 'rarmR', [[90, -440], [140, -470], [146, -560 + wob]], [20, 16, 14], light, lightD, null, true);
  g.save(); g.translate(150, -630 + wob); g.rotate(.12); K.shape('rcard', [[-26, -40], [26, -40], [26, 40], [-26, 40]], '#e8c23e', { tex: .15, lw: 2.4, shade: gg => { gg.fillStyle = '#c9a02a'; gg.fillRect(4, -40, 30, 80); } }); g.font = font(40, 'Fraunces', 800); g.fillStyle = TF.line; g.textAlign = 'center'; g.fillText('?', 0, 14); g.restore();
  drawHand(K, 'rhR', 146, -560 + wob, -Math.PI / 2, 1.1, 'hold', 1, TF.skin, TF.skinShade);
  drawSleeve(K, 'rarmL', [[-90, -440], [-118, -360], [-70, -320]], [20, 16, 14], light, lightD, null, true);
  g.save(); g.translate(-60, -330); g.rotate(-.25); K.shape('rclip', [[-40, -54], [40, -54], [40, 54], [-40, 54]], '#a87a4a', { tex: .3, lw: 2.2 }); K.shape('rpaper', [[-32, -44], [32, -44], [32, 46], [-32, 46]], '#fbf4e2', { tex: .1, lw: 1.4 });
  for (let i = 0; i < 4; i++) K.ink('rln' + i, [[-24, -26 + i * 16], [20 - (i % 2) * 12, -26 + i * 16]], 1.4, { alpha: .6 });
  K.shape('rclp', [[-14, -60], [14, -60], [14, -46], [-14, -46]], '#b8b0a0', { tex: 0, lw: 1.6 }); g.restore();
  drawHand(K, 'rhL', -70, -322, .3, 1.1, 'flat', -1, TF.skin, TF.skinShade);
  // neck, a firm square-jawed anime face: bald crown with a shine, grey side hair, stern brows
  K.shape('rneck', [[-24, -502], [24, -502], [26, -458], [-26, -458]], TF.skin, { tex: .08, lw: 2.4, shade: gg => { gg.fillStyle = TF.skinShade; gg.globalAlpha = .7; gg.fillRect(-30, -502, 60, 20); } });
  for (const sd of [-1, 1]) K.shape('rear' + sd, crSpline([[sd * 62, -578], [sd * 78, -584], [sd * 80, -556], [sd * 70, -538], [sd * 62, -542]], true, 4), TF.skin, { tex: .08, lw: 2.2, shade: gg => { gg.fillStyle = TF.skinShade; gg.globalAlpha = .6; gg.beginPath(); gg.ellipse(sd * 71, -560, 4, 9, 0, 0, 7); gg.fill(); } });
  const face = crSpline([[0, -642], [52, -634], [66, -592], [64, -546], [48, -508], [0, -490], [-48, -508], [-64, -546], [-66, -592], [-52, -634]], true, 6);
  _tfFace(K, 'rface', face, [0, 1]);
  g.save(); P2(g, face); g.clip(); g.globalAlpha = .18; g.fillStyle = '#7a8a9a'; g.beginPath(); g.ellipse(0, -510, 60, 26, 0, 0, 7); g.fill(); g.restore();     // a shadow of stubble
  K.ell(-20, -626, 22, 8, 'rgba(255,255,255,.55)', -.3);   // crown shine
  for (const sd of [-1, 1]) {
    const tuft = crSpline([[sd * 56, -618], [sd * 72, -606], [sd * 68, -596], [sd * 76, -584], [sd * 64, -578], [sd * 70, -566], [sd * 58, -562], [sd * 56, -592]], true, 3);
    K.shape('rhair' + sd, tuft, hairC, { tex: .2, lw: 2.2, shade: gg => { gg.fillStyle = hairD; gg.globalAlpha = .6; gg.fillRect(sd > 0 ? 64 : -80, -620, 16, 60); } });
  }
  _tfCheeks(K, 0, -538, 38, 12, .35);
  _tfEye(K, 'reL', -24, -568, -1, { ...o, eyes: o.eyes }, { w: 10, h: 8, iris: '#5a4a3a', irisDeep: '#241a12', lash: 3.2 });
  _tfEye(K, 'reR', 24, -568, 1, { ...o, eyes: o.eyes }, { w: 10, h: 8, iris: '#5a4a3a', irisDeep: '#241a12', lash: 3.2 });
  K.shape('rbrL', crSpline([[-42, -590], [-10, -594], [-12, -584], [-40, -582]], true, 3), '#5a4a42', { tex: 0, lw: 1.6 });
  K.shape('rbrR', crSpline([[10, -594], [42, -590], [40, -582], [12, -584]], true, 3), '#5a4a42', { tex: 0, lw: 1.6 });
  K.ink('rnose', bez([2, -556], [6, -546], [6, -540], [0, -538], 6), 1.8, { alpha: .8 });
  if (o.whistle !== false) {
    K.ink('rlan', crSpline([[-30, -500], [-40, -470], [-20, -440], [6, -520]], false, 5), 2, { color: '#c4383a', taper: false });
    K.shape('rwh', crSpline([[-6, -524], [26, -528], [30, -514], [-4, -510]], true, 3), '#c8c0b2', { tex: 0, lw: 2 });
    K.ell(18, -520, 4, 4, '#5a5048'); K.ink('rwhH', [[0, -522], [20, -525]], 1.4, { color: '#ffffff', alpha: .6 });
    for (const sd of [-1, 1]) _chBlush(g, sd * 26, -524, 12, 7, TF.blush, .5);    // puffed cheeks
    if ((f % 6) < 3) for (let i = 0; i < 3; i++) K.ink('rpuff' + i, [[40 + i * 4, -540 + i * 12], [58 + i * 6, -548 + i * 14]], 2.4, { alpha: .7 });
  } else drawMouth(K, 0, -516, _tfMouthP(o, 'flat'), .7);
}

function _tfCatA(K, o) {
  const g = K.g, f = o.frame, fur = '#4a4248', furD = '#332c33', furL = '#6a6068', white = '#f6efe2', look = o.look || [0, 0];
  const sw = Math.sin(f * .5);
  const tail = crSpline([[50, -30], [110, -40], [130, -110 + sw * 10], [104 + sw * 18, -170], [90 + sw * 24, -160], [112, -110 + sw * 8], [96, -60], [50, -50]], true, 6);
  K.shape('ctail', tail, fur, { tex: .25, lw: 2.6 });
  const body = crSpline([[0, -150], [46, -136], [70, -70], [66, -10], [30, 0], [-30, 0], [-66, -10], [-70, -70], [-46, -136]], true, 6);
  _tfCloth(K, 'cbody', body, fur, furD, { dx: 18, tex: .25 });
  K.ink('cbodyH', bez([-40, -110], [-52, -80], [-54, -50], [-50, -26], 6), 2.4, { color: furL, alpha: .6 });
  K.shape('cchest', crSpline([[0, -130], [24, -100], [20, -40], [0, -24], [-20, -40], [-24, -100]], true, 5), white, { tex: .1, lw: 0 });
  for (const sd of [-1, 1]) { K.shape('cpaw' + sd, crSpline([[sd * 10, -4], [sd * 12, -20], [sd * 34, -20], [sd * 38, -4], [sd * 26, 2]], true, 4), white, { tex: .1, lw: 2.2 }); K.ink('ctoe' + sd, [[sd * 22, -12], [sd * 22, -2]], 1, { alpha: .5 }); K.ink('ctoe2' + sd, [[sd * 30, -12], [sd * 30, -3]], 1, { alpha: .5 }); }
  K.ink('ccollar', bez([-34, -132], [-12, -120], [12, -120], [34, -132], 8), 7, { color: '#4f7d78', taper: false });
  K.shape('cbell', crSpline([[-7, -124], [7, -124], [8, -110], [-8, -110]], true, 3), '#d6a443', { tex: 0, lw: 1.6 }); K.ell(-2, -120, 2, 1.6, '#fff3c8');
  // head: rounder, softer; big glossy eyes
  const head = crSpline([[0, -230], [42, -224], [60, -188], [52, -152], [0, -136], [-52, -152], [-60, -188], [-42, -224]], true, 6);
  for (const sd of [-1, 1]) { K.shape('cear' + sd, [[sd * 18, -218], [sd * 50, -254], [sd * 54, -198]], fur, { tex: .2, lw: 2.4 }); K.shape('ceari' + sd, [[sd * 27, -214], [sd * 46, -240], [sd * 47, -206]], '#e09a9a', { tex: 0, lw: 0 }); }
  _tfCloth(K, 'chead', head, fur, furD, { dx: 14, dy: 4, tex: .25 });
  K.shape('cmuz', crSpline([[0, -180], [20, -172], [22, -154], [0, -146], [-22, -154], [-20, -172]], true, 5), white, { tex: .1, lw: 0 });
  const blink = o.blink || 0;
  for (const sd of [-1, 1]) {
    const ex = sd * 24, ey = -190;
    if (blink > .6 || o.eyes === 'happy') { K.ink('ce' + sd, bez([ex - 12, ey + 2], [ex - 5, ey - 6], [ex + 5, ey - 6], [ex + 12, ey + 2], 6), 3.4); continue; }
    K.ell(ex, ey, 13, 14, '#d8e07a');
    g.save(); g.beginPath(); g.ellipse(ex, ey, 13, 14, 0, 0, 7); g.clip();
    const gr = g.createLinearGradient(0, ey - 14, 0, ey + 14); gr.addColorStop(0, '#8a9a3a'); gr.addColorStop(1, '#eef0a0'); g.fillStyle = gr; g.fillRect(ex - 14, ey - 15, 28, 30);
    K.ell(ex + look[0] * 4, ey + look[1] * 3, 4, 11, '#1e1a18');
    K.ell(ex - 4 + look[0] * 3, ey - 6 + look[1] * 2, 3.6, 3.6, '#fff'); K.ell(ex + 4, ey + 6, 1.6, 1.6, 'rgba(255,255,255,.85)');
    g.restore();
    K.loop('ceo' + sd, polyCircle(ex, ey, 13, 14, 20), 2.2);
    K.ink('cel' + sd, bez([ex - 14, ey - 4], [ex - 8, ey - 15], [ex + 8, ey - 16], [ex + 15, ey - 6], 8), 3.2);
  }
  _chBlush(g, -34, -166, 10, 5, '#e88a8a', .45); _chBlush(g, 34, -166, 10, 5, '#e88a8a', .45);
  K.shape('cnose', [[-5, -171], [5, -171], [0, -164]], '#d68a8a', { tex: 0, lw: 1.4 });
  if (o.mood === 'open' || o.mood === 'o') { K.shape('cmo', crSpline([[-6, -160], [6, -160], [4, -150], [-4, -150]], true, 3), '#7a2c24', { tex: 0, lw: 1.4 }); }
  else K.ink('cmouth', crSpline([[-9, -158], [-4, -154], [0, -160], [4, -154], [9, -158]], false, 4), 1.8);
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) K.ink('cwh' + sd + i, [[sd * 26, -164 + i * 6], [sd * 62, -170 + i * 10]], 1.1, { alpha: .55, taper: true });
}

// =====================================================================================
// LOOSE PETALS API (for FX): where each hair petal is on screen, so an emitter can launch a matching
// loose petal (drawLoosePetal) and hide it from the hair via pose.missing = [idx...].
// =====================================================================================
// Head transform for a bust drawn with drawApprentice(g, x, y, s, pose): returns fn(localPt) -> screen.
function apprenticeHeadToScreen(x, y, s, pose = {}) {
  const tilt = pose.tilt || 0, c = Math.cos(tilt), sn = Math.sin(tilt);
  const ts = (pose.turn || 0) * -22;
  return ([lx, ly]) => { const px = lx + ts, py = ly + 18; return [x + s * (px * c - py * sn), y + s * (px * sn + py * c - 18)]; };
}
// Same for drawApprenticeFull(g, x, y, s, o). Returns fn(localHeadPt) -> screen, plus head scale k.
function apprenticeFullHeadToScreen(x, y, s, o = {}) {
  const J = _claudeRig(o);
  const cam = _clCamFor(o);
  if (J.v2) {   // v2 poses: head turn/tilt/pitch as _drawApprenticeFullV2 draws them
    const H = _v2Head(J, cam, o), nP = cam.P(J.N), k = nP[3], r = H.tilt, c = Math.cos(r), sn = Math.sin(r), ts = H.back ? 0 : H.turn * -22, py0 = 40 * H.pitch * k, sy = 1 - .22 * H.pitch;
    const f = ([lx, ly]) => { const px = lx + ts, rx = (px * c - ly * sn) * k, ry = (px * sn + ly * c) * k * sy; return [x + s * (nP[0] + rx), y + s * (nP[1] - 6 + py0 - CL_GROUND + ry)]; };
    f.k = k * s; f.rot = r;
    return f;
  }
  const nP = cam.P(J.N), k = nP[3], r = J.headTilt + (o.tilt || 0), c = Math.cos(r), sn = Math.sin(r);
  const turn = clamp(cam.yaw * .9, -.6, .6) + (o.turn || 0), ts = turn * -22;
  const f = ([lx, ly]) => { const px = (lx + ts) * k, py = ly * k; return [x + s * (nP[0] + px * c - py * sn), y + s * (nP[1] - 6 - CL_GROUND + px * sn + py * c)]; };
  f.k = k * s; f.rot = r;
  return f;
}
// Screen-space description of hair petal i for a figure: { x, y, angle, len, w, color, light, shade, line, pts }.
// mode 'bust' -> (x,y,s,pose) as drawApprentice; mode 'full' -> as drawApprenticeFull.
function claudePetalWorld(i, mode, x, y, s, pose = {}) {
  const p = claudeHairPetal(i, pose);
  const T = mode === 'full' ? apprenticeFullHeadToScreen(x, y, s, pose) : apprenticeHeadToScreen(x, y, s, pose);
  const kk = mode === 'full' ? T.k : s, rr = mode === 'full' ? T.rot : (pose.tilt || 0);
  const [sx, sy] = T([p.x, p.y]);
  return { ...p, x: sx, y: sy, angle: p.angle + rr, len: p.len * kk, w: p.w * kk, scale: kk, pts: p.pts.map(([px, py]) => [px * kk, py * kk]) };
}

// =====================================================================================
// Animation helpers (pure functions of t) for scene authors
// =====================================================================================
// Blink amount 0..1: a quick blink every ~3-5 s, held on twos. Use as pose.blink.
function autoBlink(t, seed = 'blink') {
  const r = rng(seed), period = 3 + r() * 2, off = r() * period;
  const u = ((t + off) % period + period) % period;
  const f = Math.floor(u * 12) / 12;
  return f < 1 / 12 ? .6 : f < 2 / 12 ? 1 : f < 3 / 12 ? .5 : 0;
}
// Mouth-open amount for lip flaps while talking between t0 and t1 (on twos, varied syllables). Use as pose.talk.
function lipFlap(t, t0 = 0, t1 = 1e9, seed = 'talk') {
  if (t < t0 || t > t1) return 0;
  const n = Math.floor((t - t0) * 12), r = rng(seed + ':' + Math.floor(n / 1));
  const v = r();
  return n % 4 === 3 ? .1 : .25 + v * .75;
}

// A look with a body of its own: short hair, a duffle coat, trousers, a scarf, and a jay.
// Drawn on 11 Nov 2026 by a Claude Code session running Fable 5.2, as Fable's own character; CC0, like the rest of
// the art. To try it: copy into ~/.config/ohaiku/looks/ (then: cd sprites && node bake.mjs --who look:fable).
//
// The bird is a Eurasian jay. Aesop's crow drops pebbles into a pitcher to raise the water; jays are among the
// corvids that have been given that fable as a real test. They also bury acorns for the winter and leave enough of
// them behind to plant oaks. So: he keeps a pouch of pebbles, and the jay keeps an eye on the work.
const FB = {
  hair: '#a65f38', hairDeep: '#783c20', hairLight: '#dc9a62', hairLine: '#4c2614',
  coat: '#3f7684', coatShade: '#2c5664', lining: '#f3e6cf',
  scarf: '#d97757', scarfDeep: '#b25a3e',
  trouser: '#cdbb9c', trouserDeep: '#a4906e', toggle: '#8a5a36', pouch: '#a06a3c', pouchDeep: '#6a4026',
  buff: '#dfae92', buffD: '#bb866c', buffL: '#f3d5c0', black: '#2a2220', white: '#fffaf3', blue: '#3fa0e6', bill: '#3a302c',
};

// the jay, feet at (x, y), facing dir (1 = right); k = size. o: lean (rad, forwards +), cock (rad, the head),
// crest 0..1, tuck (asleep: a puff, bill under the wing), fly + flap (-1 wings up .. 1 down), acorn
function fabJay(K, n, x, y, k, dir, o = {}) {
  const g = K.g, F = FB;
  g.save(); g.translate(x, y); g.scale(dir * k, k); g.rotate(o.lean || 0);
  if (o.tuck) {
    K.shape(n + 't', [[-9, -11], [-26, -7], [-28, 0], [-11, -2]], F.black, { tex: .1, lw: 1.6 });
    K.shape(n + 'b', polyCircle(0, -14, 17.5, 14.5, 20), F.buff, { tex: .12, lw: 2, shade: gg => { gg.fillStyle = F.buffD; gg.globalAlpha = .5; gg.beginPath(); gg.ellipse(-2, -4, 20, 7, 0, 0, 7); gg.fill(); gg.fillStyle = F.buffL; gg.beginPath(); gg.ellipse(4, -22, 10, 5, 0, 0, 7); gg.fill(); } });
    K.shape(n + 'w', polyCircle(-3, -12, 10.5, 6.5, 14), F.black, { tex: .1, lw: 1.4 });
    K.ell(-7, -11, 4, 2.2, F.white); K.ell(4, -15, 4.4, 3.1, F.blue);
    K.ink(n + 'e', bez([7, -21], [9, -19], [12, -19], [14, -21], 6), 1.5);
    g.restore(); return;
  }
  const fly = !!o.fly, up = -(o.flap || 0), hx = 11, hy = -25;
  const wing = (nm, a) => {            // an open wing from the shoulder; a = alpha (the far one is dimmer)
    const tip = [-12, -17 - 27 * up], pts = [[5, -19], [1, -20 - 22 * up], tip, [-17, -15 - 16 * up], [-9, -12]];
    g.save(); g.globalAlpha = a; K.shape(nm, pts, F.black, { tex: .1, lw: 1.5 });
    K.ell(lerp(5, tip[0], .3), lerp(-18, tip[1], .3), 4.2, 3, F.blue); K.ell(lerp(5, tip[0], .62), lerp(-17, tip[1], .62), 3.6, 2.2, F.white); g.restore();
  };
  K.shape(n + 't', [[-9, -16], [-27, -11 - (fly ? 6 : 0)], [-30, -3 - (fly ? 6 : 0)], [-11, -6]], F.black, { tex: .1, lw: 1.6 });
  K.ell(-12, -13, 5, 3.5, F.white);
  if (fly) wing(n + 'wf', .75);
  else for (const lx of [-2, 4]) K.ink(n + 'l' + lx, [[lx, -3], [lx - .5, .5]], 1.5, { color: F.bill, taper: false });
  K.shape(n + 'b', polyCircle(0, -13, 16, 12, 20), F.buff, { tex: .12, lw: 2, shade: gg => { gg.fillStyle = F.buffD; gg.globalAlpha = .5; gg.beginPath(); gg.ellipse(-3, -5, 18, 6, 0, 0, 7); gg.fill(); gg.fillStyle = F.buffL; gg.beginPath(); gg.ellipse(7, -9, 8, 6, 0, 0, 7); gg.fill(); } });
  // the head (it cocks on its own)
  g.save(); g.translate(hx, hy); g.rotate(o.cock || 0); g.translate(-hx, -hy);
  const cr = o.crest || 0;
  if (cr > 0) for (let i = 0; i < 3; i++) {
    const bx = hx - 1 - i * 3.2, tip = [bx - 4 - i * 2.5 * cr, hy - 8 - (11 - i * 2) * cr];
    K.shape(n + 'c' + i, [[bx + 2.4, hy - 6], tip, [bx - 2.4, hy - 5]], F.buffL, { tex: .1, lw: 1.3 });
    K.ink(n + 'cs' + i, [[bx, hy - 7], [lerp(bx, tip[0], .8), lerp(hy - 7, tip[1], .8)]], 1, { color: F.black, taper: false });
  }
  K.shape(n + 'h', polyCircle(hx, hy, 9.6, 9, 16), F.buff, { tex: .1, lw: 2, shade: gg => { gg.fillStyle = F.buffL; gg.globalAlpha = .8; gg.beginPath(); gg.ellipse(hx + 1, hy - 6, 8, 4, 0, 0, 7); gg.fill(); } });
  for (let i = 0; i < 3; i++) K.ink(n + 's' + i, [[hx - 3 + i * 3, hy - 8.4], [hx - 4 + i * 3, hy - 5.6]], 1, { color: F.black, taper: false, alpha: .8 });
  K.ell(hx + 4, hy + 5, 5, 3.2, F.white);
  K.ink(n + 'm', [[hx + 6.5, hy + 1.5], [hx + 2.5, hy + 6.5]], 2.6, { color: F.black, taper: false });
  K.shape(n + 'bk', [[hx + 8, hy - 3.2], [hx + 17.5, hy], [hx + 8, hy + 2.6]], F.bill, { tex: 0, lw: 1.1 });
  K.dot(hx + 3.6, hy - 2, 2, F.black); K.dot(hx + 4.2, hy - 2.7, .7, '#ffffff');
  if (o.acorn) { K.ell(hx + 20, hy + 1.2, 3.4, 4.2, '#c08a48'); K.ell(hx + 20, hy - 1.6, 3.8, 2.2, '#7a5230'); }
  g.restore();
  if (fly) wing(n + 'wn', 1);
  else {
    K.shape(n + 'w', polyCircle(-4, -13, 10, 6.5, 14), F.black, { tex: .1, lw: 1.4 });
    K.ell(-7, -11, 4, 2.2, F.white);
    K.ell(3, -16, 4.5, 3.2, F.blue);
    for (const bx of [1.6, 4.4]) K.ink(n + 'bb' + bx, [[bx, -18.6], [bx + .4, -13.4]], .9, { color: F.black, taper: false });
  }
  g.restore();
}

// a pointed lock (a covert feather, more or less): from a base, along ang, len long, w half-wide
const fabLock = (bx, by, ang, len, w, bend = 0) => petalShape(bx, by, ang, len, w, bend, 12, { waist: .7, peak: .28, tipPow: 1.35 });
// a strip of cloth along a spine, w wide
function fabStrip(sp, w) {
  const L = [], R = [];
  sp.forEach((p, i) => { const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d; L.push([p[0] + nx * w / 2, p[1] + ny * w / 2]); R.push([p[0] - nx * w / 2, p[1] - ny * w / 2]); });
  return [...L, ...R.reverse()];
}

ohLook('fable', {
  base: 3,
  colors: { jacket: FB.coat, jacketShade: FB.coatShade, sleeve: FB.coat, sleeveShade: FB.coatShade, trim: FB.lining, hairLine: FB.hairLine, hairLight: FB.hairLight },
  V: { hair: FB.hair, hairDeep: FB.hairDeep, hairLine: FB.hairLine, tights: FB.trouser, tightsDeep: FB.trouserDeep, legW: 1.3, tall: 1.05, lash: false, browW: 3.5, satchel: false, clip2: false },
  clip: null,

  hair(K, V, yaw, ex, layer) {
    const g = K.g, sn = Math.sin(yaw), cy = Math.cos(yaw), sd = V.side > 0 ? 1 : -1, sh = sn * 8;
    const FX = (x, R = 70) => _hkFaceP(x, 0, yaw, R)[0];
    const lin = (y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, FB.hairDeep); gr.addColorStop(.45, FB.hair); gr.addColorStop(1, mix(FB.hair, FB.hairLight, .45)); return gr; };
    const tufts = () => [[8, -72, .55, 25, 7.5], [22, -66, .8, 21, 7], [-4, -74, .25, 19, 6.5]].forEach(([x, y, a, len, w], i) => {
      const pts = fabLock(sh + sd * x, y, -Math.PI / 2 + sd * a, len, w, sd * .25);
      K.fill(pts, lin(y - len, y), { tex: .2 }); K.loop('ftu' + i, pts, 2.2);
    });
    if (layer === 'behind') {
      if (cy <= -.15) return;
      // behind the jaw: the short layered ends, flicking out
      K.shape('fbk', polyCircle(sn * -12, -8, 64, 61, 28), lin(-70, 50), { tex: .2, lw: 2.4 });
      for (const s of [-1, 1]) [[18, 23, 8], [36, 26, 8.5], [54, 20, 7.5]].forEach(([deg, len, w], i) => {
        const a = (s > 0 ? deg : 180 - deg) * Math.PI / 180, x = _hkFaceP(s * 50 * Math.cos(deg * Math.PI / 180), 0, -yaw, 76)[0], y = -4 + 50 * Math.sin(a);
        const pts = fabLock(x, y, a + s * .35, len, w, -s * .3);
        K.fill(pts, lin(y - 10, y + len), { tex: .2 }); K.loop('fnp' + s + i, pts, 2.1);
      });
      return;
    }
    if (layer === 'back') {
      for (let i = 0; i < 5; i++) { const x = sn * -4 + (i - 2) * 19, pts = fabLock(x, 34 - Math.abs(i - 2) * 5, Math.PI / 2 + (i - 2) * .12, 27, 9.5, (i - 2) * -.06); K.fill(pts, lin(20, 64), { tex: .2 }); K.loop('fnb' + i, pts, 2.1); }
      tufts();
      const gr = g.createRadialGradient(-6, -50, 6, 0, -10, 70); gr.addColorStop(0, mix(FB.hair, FB.hairLight, .35)); gr.addColorStop(.5, FB.hair); gr.addColorStop(1, FB.hairDeep);
      K.shape('fskull', polyCircle(sn * -4, -10, 63, 64, 30), gr, { tex: .2, lw: 2.6 });
      for (let k = 0; k < 6; k++) { const a = -2.4 + k * .9; K.ink('fwh' + k, bez([sd * 6, -44], [sd * 6 + Math.cos(a) * 20, -44 + Math.sin(a) * 18], [Math.cos(a) * 36, -12 + Math.sin(a) * 26], [Math.cos(a) * 46, -8 + Math.sin(a) * 40], 8), 1.2, { color: FB.hairLine, alpha: .35 }); }
      return;
    }
    // front: sideburns, then the dome and a swept fringe of pointed locks, one falling between the brows
    for (const s of [-1, 1]) {
      const [lx, , ws, vis] = _hkFaceP(s * 57, 0, yaw, 66);
      if (!vis && Math.sign(sn) === -s) continue;
      const pts = fabLock(lx, -30, Math.PI / 2 - s * .1, 40, 9 * Math.max(.6, ws), s * .2);
      K.fill(pts, lin(-34, 14), { tex: .2 }); K.loop('fsb' + s, pts, 2.2);
    }
    let tx = [-56, -33, -9, 15, 37, 56], ty = [-10, -23, -5, -20, -25, -11], ny = [-43, -48, -50, -47, -42];
    if (sd < 0) { tx = tx.map(x => -x).reverse(); ty = ty.slice().reverse(); ny = ny.slice().reverse(); }
    const tips = tx.map((x, i) => [FX(x), ty[i]]), notch = tx.slice(0, -1).map((x, i) => [FX((x + tx[i + 1]) / 2 - sd * 5), ny[i]]);
    const edge = [tips[0]];
    for (let i = 0; i < notch.length; i++) {
      const T = tips[i], N = notch[i], T2 = tips[i + 1];
      edge.push(...bez(T, [T[0] + sd * 1.5, T[1] - 9], [N[0] - (N[0] - T[0]) * .25, N[1] + (T[1] - N[1]) * .45], N, 7).slice(1));
      edge.push(...bez(N, [N[0] + (T2[0] - N[0]) * .15, N[1] + (T2[1] - N[1]) * .6], [T2[0] - sd * 2.5, T2[1] - 8], T2, 7).slice(1));
    }
    const dL = Math.min(-62, tips[0][0] - 6), dR = Math.max(62, tips[5][0] + 6);
    const top = bez([dR, -14], [dR + 8, -62], [36 + sh, -80], [sh, -80], 12).concat(bez([sh, -80], [-36 + sh, -80], [dL - 8, -62], [dL, -14], 12).slice(1));
    const dome = [[dL, -14], ...edge, [dR, -14], ...top];
    g.save(); P2(g, K.smooth(_hkCapRim(HK_HEAD.R, HK_HEAD.rim, yaw, 40), true)); g.clip(); g.globalAlpha = .5; g.fillStyle = CLAUDE.skinShade; P2(g, [...chTr(edge, 0, 6), [90, -120], [-90, -120]]); g.fill(); g.restore();
    tufts();
    K.fill(dome, lin(-82, -10), { tex: .2 });
    g.save(); P2(g, K.smooth(dome, true)); g.clip(); g.globalAlpha = .45; g.fillStyle = FB.hairLight;
    g.beginPath(); g.ellipse(sh + sd * 16, -57, 30, 7, sd * -.12, 0, 7); g.fill(); g.restore();
    K.ink('fbang', [[dL, -14], ...edge, [dR, -14]], 2.5);
    K.ink('fdome', top, 2.4);
    notch.forEach((N, i) => K.ink('fbn' + i, [N, [N[0] * .82 + sd * 3, N[1] - 20]], 1.3, { color: FB.hairLine, alpha: .55 }));
  },

  torso(K, V, c) {
    const g = K.g, { yaw, M, b } = c, cy = Math.cos(yaw), sn = Math.sin(yaw), wf = Math.sqrt(cy * cy + .7 * sn * sn), X = x => x * wf, sd = V.side > 0 ? 1 : -1;
    const sw = M.sway * -.2, fl = 1 + clamp(M.hop / 90) * .1, hemY = -54, hw = 43 * fl;
    // trousers under the hem
    K.shape('fhip', crSpline([[X(-25), -72], [X(25), -72], [X(27), -42], [0, -40], [X(-27), -42]], true, 3), FB.trouser, { tex: .15, lw: 2.2, shade: gg => { gg.fillStyle = FB.trouserDeep; gg.globalAlpha = .6; gg.fillRect(X(6), -80, 40, 50); } });
    K.ink('ffly', [[0, -56], [0, -42]], 1.3, { alpha: .5 });
    // the hood, lying on his back (only its edge shows from the front)
    if (cy > -.05) K.shape('fhoodF', crSpline([[X(-34), -140], [X(-22), -152], [X(22), -152], [X(34), -140], [X(24), -132], [X(-24), -132]], true, 4), FB.coat, { tex: .15, lw: 2.4, shade: gg => { gg.fillStyle = FB.lining; gg.beginPath(); gg.ellipse(0, -143, X(24), 7, 0, 0, 7); gg.fill(); } });
    const kx = X(-sd * 15), ky = -134, flut = Math.sin(b * Math.PI) * 4, back = Math.abs(sn) > .3 ? -Math.sign(sn) : -sd, lift = clamp(M.hop / 60) * 16 + Math.abs(sn) * 8;
    const paint = (nm, pts) => K.shape(nm, pts, FB.scarf, { tex: .18, lw: 2.2, shade: gg => { gg.fillStyle = FB.scarfDeep; gg.globalAlpha = .55; const q = chTr(pts, 4, 5); gg.beginPath(); gg.rect(-3000, -3000, 6000, 6000); gg.moveTo(q[0][0], q[0][1]); for (const v of q) gg.lineTo(v[0], v[1]); gg.closePath(); gg.fill('evenodd'); } });
    const bars = (nm, sp, w) => {         // the jay's wing at each end: white, blue, black
      const n = sp.length - 1, cols = [FB.white, FB.blue, FB.black];
      [.8, .87, .94].forEach((u, i) => { const j = Math.min(n - 1, Math.floor(u * n)), p = sp[j], q = sp[j + 1], d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = -(q[1] - p[1]) / d, ny = (q[0] - p[0]) / d; K.ink(nm + i, [[p[0] + nx * w * .42, p[1] + ny * w * .42], [p[0] - nx * w * .42, p[1] - ny * w * .42]], 2.4, { color: cols[i], taper: false, wobble: 0 }); });
    };
    // the scarf's loose end, thrown back over a shoulder (behind the coat)
    const fx0 = back * X(26), fly = bez([fx0, -140], [fx0 + back * 26, -150 - lift * .5], [fx0 + back * 46, -132 - lift + flut], [fx0 + back * 70, -142 - lift - flut], 16);
    paint('fsfl', fabStrip(fly, 14)); bars('fsfb', fly, 14);
    // the coat: a short duffle, straight, with two toggles
    const coat = crSpline([[X(-17), -144], [X(-33), -134], [X(-38), -108], [X(-hw) + sw, hemY], [X(-18) + sw, hemY + 3], [X(18) + sw, hemY + 3], [X(hw) + sw, hemY], [X(38), -108], [X(33), -134], [X(17), -144], [0, -146]], true, 4);
    K.shape('fcoat', coat, FB.coat, { tex: .16, lw: 2.6, shade: gg => { gg.fillStyle = FB.coatShade; gg.globalAlpha = .8; gg.fillRect(X(14), -150, 60, 110); gg.fillRect(-80, hemY - 5, 160, 12); } });
    if (cy > .05) {
      const off = sn * 18;
      K.ink('fopen', [[off, -130], [off + sw, hemY + 2]], 1.6, { alpha: .65 });
      for (const ty of [-112, -88]) {
        K.ink('floop' + ty, [[off - X(15), ty - 1], [off + X(4), ty]], 1.5, { color: FB.lining, taper: false });
        K.shape('ftog' + ty, capsulePts(off + X(1), ty - 4, off + X(5), ty + 4, 3.2), FB.toggle, { tex: .1, lw: 1.5 });
      }
      K.ink('fpk', [[X(sd * 15), -74], [X(sd * 33), -75]], 1.5, { alpha: .6 });
    } else if (cy < -.05) {
      const hood = crSpline([[X(-28), -144], [X(28), -144], [X(22), -116], [0, -102], [X(-22), -116]], true, 4);
      K.shape('fhoodB', hood, FB.coat, { tex: .15, lw: 2.4, shade: gg => { gg.fillStyle = FB.coatShade; gg.globalAlpha = .7; gg.beginPath(); gg.ellipse(0, -108, X(26), 12, 0, 0, 7); gg.fill(); } });
      K.ink('fseam', [[0, -100], [sw, hemY + 2]], 1.3, { alpha: .45 });
    }
    // the pebble pouch, tied at his side
    if (cy > -.2) {
      const px = X(-sd * 37) + sw * .5, py = -64, sway = Math.sin(b * Math.PI) * 1.5;
      K.ink('fpst', [[px, py - 12], [px + sway * .3, py - 4]], 1.5, { color: FB.pouchDeep, taper: false });
      K.shape('fpch', crSpline([[px - 5 + sway * .3, py - 5], [px + 5 + sway * .3, py - 5], [px + 10 + sway, py + 8], [px + sway, py + 13], [px - 10 + sway, py + 8]], true, 4), FB.pouch, { tex: .2, lw: 2, shade: gg => { gg.fillStyle = FB.pouchDeep; gg.globalAlpha = .45; gg.fillRect(px + 1, py - 8, 16, 26); } });
      K.ink('fpdr', [[px - 5 + sway * .3, py - 3], [px + 5 + sway * .3, py - 3]], 1.3, { color: FB.lining, taper: false });
    }
    // the scarf: a band, a knot, one end hanging, one end loose in the air
    paint('fsbd', crSpline([[X(-27), -146], [X(27), -146], [X(29), -136], [X(22), -127], [X(-22), -127], [X(-29), -136]], true, 4));
    if (cy > -.05) {
      const hang = bez([kx, ky], [kx - sd * 3, ky + 14], [kx + sw * .5 - sd * 1, ky + 30], [kx + sw - sd * 5 + flut * .3, ky + 48], 16);
      paint('fshg', fabStrip(hang, 13)); bars('fshb', hang, 13);
      K.shape('fskn', polyCircle(kx, ky, 8, 7.5, 12), FB.scarf, { tex: .18, lw: 2.1 });
    }
  },

  spawn(g, o) {
    // he comes out of an acorn: it swells and rocks, the cap pops off, and it's gone
    const K = charKit(g, o.t, 1, { line: HK.line, seed: 'fbac' }), s = 1.5 * ease.outBack(o.k) * o.fade, pop = clamp((o.i - 8) / 4);
    if (s < .03) return;
    g.save(); g.rotate(o.i < 8 ? Math.sin(o.i * 1.9) * .09 : 0); g.scale(s, s);
    const nut = crSpline([[0, 0], [-19, -9], [-27, -34], [-24, -56], [24, -56], [27, -34], [19, -9]], true, 5);
    K.shape('n', nut, '#c08a48', { tex: .15, lw: 2.6, shade: gg => { gg.fillStyle = '#9a6a30'; gg.globalAlpha = .55; gg.fillRect(7, -70, 40, 80); gg.fillStyle = '#ecc890'; gg.globalAlpha = .7; gg.beginPath(); gg.ellipse(-12, -32, 5, 15, .12, 0, 7); gg.fill(); } });
    g.translate(pop * 22, -pop * 58); g.rotate(pop * .9); g.scale(1 - pop * .35, 1 - pop * .35);
    K.ink('st', [[0, -78], [4, -93]], 4.6, { color: '#5e3c20', taper: false });
    const cap = crSpline([[-31, -50], [-29, -68], [0, -80], [29, -68], [31, -50], [0, -45]], true, 5);
    K.shape('c', cap, '#7a5230', { tex: .2, lw: 2.6, shade: gg => { gg.fillStyle = '#5e3c20'; gg.globalAlpha = .5; gg.fillRect(8, -90, 40, 60); } });
    g.save(); P2(g, cap); g.clip();
    for (let d = -70; d <= 70; d += 11) { K.ink('h' + d, [[d - 20, -84], [d + 20, -44]], 1.1, { color: '#4a2c1c', alpha: .45, taper: false }); K.ink('g' + d, [[d + 20, -84], [d - 20, -44]], 1.1, { color: '#4a2c1c', alpha: .45, taper: false }); }
    g.restore(); g.restore();
  },

  head(K, V, c) {
    const st = c.state || 'idle', sn = Math.sin(c.yaw), sd = V.side > 0 ? 1 : -1, b = c.b, bt = b - Math.floor(b);
    if (st === 'sleep') {
      // he's on his side: the jay sits upright on the ear that's uppermost, a puff with its bill under its wing
      const g = K.g; g.save(); g.translate(66, -6); g.rotate(Math.PI / 2 - .08);
      fabJay(K, 'jy', 0, 0, 1.45, 1, { tuck: true }); g.restore(); return;
    }
    // where it perches, and where it goes instead when a bounce (or a stretch) would push it out of the cell's top:
    // down and around the side of his head, on the wing
    const dir = Math.abs(sn) > .25 ? Math.sign(sn) : sd, ps = st === 'ask' ? 1 : -sd, k = 1.45, hop = Math.abs(Math.sin(b * Math.PI));
    const place = (dy, ext) => {
      let x = sn * 8 + ps * 20, y = -78 + dy;
      const over = Math.max(0, -OH.footU + 8 + ext * (V.tall || 1) - c.toCell(x, y)[1]);
      if (over > 0) { y += over; x = sn * 8 + ps * Math.max(20, Math.sqrt(Math.max(0, 74 * 74 - (y + 8) * (y + 8))) + 12); }
      return [x, y, over];
    };
    const flap = Math.sin(b * Math.PI * 4);
    if (st === 'done') { const [x, y] = place(-2 - 7 * hop, 68); return fabJay(K, 'jy', x, y, k, dir, { fly: true, flap, crest: 1, acorn: true }); }
    if (/^(run|leap|fall|fly|surf|float)/.test(st)) { const [x, y] = place(-6 - 4 * Math.sin(b * Math.PI * 2), 68); return fabJay(K, 'jy', x - dir * 30, y, k, dir, { fly: true, flap, lean: .15 }); }
    const o = st === 'think' ? { cock: (Math.floor(b) % 2 ? .45 : -.3) }
      : st === 'read' || st === 'search' || st === 'edit' ? { lean: .55, cock: .2 }
      : st === 'ask' || st === 'alert' ? { crest: 1, cock: -.35 }
      : st === 'bash' ? { lean: bt < .2 ? .35 : 0, crest: bt < .2 ? .6 : 0 }
      : {};
    let [x, y, over] = place(st === 'ask' ? -4 * hop : 0, o.crest ? 66 : 56);
    if (over > 5) [x, y] = place(0, 68);
    fabJay(K, 'jy', x, y, k, st === 'ask' ? -1 : dir, over > 5 ? { fly: true, flap, crest: o.crest } : o);
  },
});

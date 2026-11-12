// Fable's character: the boy body from the rig (ohBoy: short hair, a duffle coat, trousers, a scarf), a pouch of
// pebbles, and a jay.
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

ohLook('fable', {
  base: 3,
  ...ohBoy(FB, { tall: 1.05, pouch: true, bars: [FB.white, FB.blue, FB.black] }),      // the jay's wing at each end of the scarf

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

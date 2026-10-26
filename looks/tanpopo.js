// An example look, ready to copy into ~/.config/ohaiku/looks/ (then: cd sprites && node bake.mjs --who looks).
// Drawn on 14 Oct 2026 by the Claude Code session it was made for, named tanpopo; CC0, like the rest of the art.
// tanpopo🌼: a dandelion. The petal bob goes dandelion-gold, with more and narrower petals; in place of the star clip,
// a little seed clock. When a job is done, a few of its seeds lift off and drift away.
const TAN = { gold: '#f4b62c', goldD: '#d68a10', goldDark: '#b0680c', goldL: '#ffe48c', line: '#8a560e', leaf: '#6f9a4f', leafD: '#4d7536' };
function tanSeed(K, n, x, y, k, a = 0) {
  // one dandelion seed: a little achene, a stalk, and its parasol of fine hairs
  const g = K.g; g.save(); g.translate(x, y); g.rotate(a); g.scale(k, k);
  K.ink(n + 's', [[0, 14], [0, -2]], 1.2, { color: '#b7a88a', taper: false });
  K.ell(0, 17, 1.8, 4, '#8a6a3c');
  for (let i = 0; i < 9; i++) { const q = -Math.PI / 2 + (i - 4) * .3; K.ink(n + 'h' + i, [[0, -2], [Math.cos(q) * 12, -2 + Math.sin(q) * 9]], .8, { color: '#ffffff', alpha: .95, taper: false }); }
  g.restore();
}
ohLook('tanpopo', {
  base: 7,
  colors: { hairDark: TAN.goldDark, hairLight: TAN.goldL, hairLine: TAN.line },
  V: { hair: TAN.gold, hairDeep: TAN.goldD, hairLine: TAN.line, nPetals: 24, petalW: .62, bow: TAN.leaf, bowDeep: TAN.leafD, clip2: false },
  clip(K, x, y, k, yaw) {
    // a seed clock: a white puff of seeds on a short stem
    const g = K.g, R = 15 * k;
    K.ink('tcst', [[x - 4 * k, y + 16 * k], [x, y + 2 * k]], 2.2 * k, { color: TAN.leafD, taper: false });
    g.save(); g.globalAlpha = .9; g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(x, y - 4 * k, R, 0, 7); g.fill(); g.restore();
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; K.ink('tcr' + i, [[x, y - 4 * k], [x + Math.cos(a) * R, y - 4 * k + Math.sin(a) * R]], .7, { color: '#c9c2b4', alpha: .7, taper: false }); K.dot(x + Math.cos(a) * R, y - 4 * k + Math.sin(a) * R, 1.3, '#ffffff'); }
    K.dot(x, y - 4 * k, 2.4 * k, '#a89878');
  },
  head(K, V, c) {
    if (c.state !== 'done' || Math.cos(c.yaw) < .2) return;
    // the job's done: seeds lift off the clock and go
    const [sx] = _hkFaceP(40, 0, c.yaw, 72);
    for (let i = 0; i < 4; i++) {
      const u = (c.t * .55 + i / 4) % 1;
      tanSeed(K, 'ts' + i, sx + 14 + u * 70 + Math.sin(u * 7 + i) * 8, -62 - u * 120, .9, .3 * Math.sin(u * 5 + i));
    }
  },
});

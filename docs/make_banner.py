#!/usr/bin/env python3
"""docs/banner.gif for the README: a row of chibis at work over their name plates, from the baked sprites (share/).
Every state used loops in 2.4 s (or 1.2 s), so 32 frames at 13.33 fps loop seamlessly."""
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SHARE = os.path.join(HERE, '..', 'share')
FONT = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
CAST = [('haiku03', 'think', 'thinking'), ('opus2', 'bash', 'Bash'), ('haiku07', 'read', 'Read'),
        ('haiku00', 'floss', 'flossing'), ('opus0', 'dance', 'dancing'), ('haiku05', 'ask', 'may I?'),
        ('haiku09', 'edit', 'Edit')]
CELL, STEP, N = 160, 122, 32
W, H = STEP * len(CAST) + 70, 232
GROUND = 186                                      # where their feet are


def plate(d, cx, y, text, font):
    w = d.textlength(text, font=font) + 18
    d.rounded_rectangle((cx - w / 2, y, cx + w / 2, y + 22), 11, fill='#fffaf0', outline='#6b4a32', width=2)
    d.text((cx, y + 11), text, font=font, fill='#4a2c1c', anchor='mm')


def main():
    meta = json.load(open(os.path.join(SHARE, 'sheets.json')))
    font = ImageFont.truetype(FONT, 13)
    strips = {(w, s): Image.open(os.path.join(SHARE, w, s + '.png')).convert('RGBA') for w, s, _ in CAST}
    frames = []
    for i in range(N):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((0, 0, W - 1, H - 1), 26, fill='#f7f0e1')
        d.rounded_rectangle((0, GROUND - 4, W - 1, H - 1), 26, fill='#dfe9cf')
        d.rectangle((0, GROUND - 4, W - 1, GROUND + 20), fill='#dfe9cf')
        for k, (who, state, label) in enumerate(CAST):
            st = meta[who]['states'][state]
            j = int(i * st['n'] / N) % st['n'] if st['n'] >= N else i % st['n']
            fr = strips[(who, state)].crop((j * CELL, 0, j * CELL + CELL, CELL))
            foot = meta[who]['foot'][1]
            cx = 35 + STEP * k + STEP // 2
            im.alpha_composite(fr, (cx - CELL // 2, int(GROUND - foot)))
            plate(d, cx, GROUND + 6, label, font)
        frames.append(im)
    # one shared palette for every frame (no flicker), and the rounded corners transparent
    sheet = Image.new('RGB', (W, H * 4))
    for k in range(4): sheet.paste(frames[k * 8].convert('RGB'), (0, H * k))
    pal = sheet.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    out = []
    for im in frames:
        p = im.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE)
        p.paste(255, mask=Image.eval(im.getchannel('A'), lambda a: 255 if a < 128 else 0))
        out.append(p)
    path = os.path.join(HERE, 'banner.gif')
    out[0].save(path, save_all=True, append_images=out[1:], duration=75, loop=0, transparency=255, disposal=2,
                optimize=False)
    print(path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()

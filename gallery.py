"""gallery.py — the Peanut Gallery: a fast Haiku looks at your screen now and then and voices the chibis' reactions.

Off unless you turn it on. While on, every ~15 s (only when the screen has changed) it takes a screenshot, blacks out
the windows it must not see, and asks Haiku (through your Claude Code login: `claude -p --model haiku`, no tools, no
saved session) for a line of what's on screen, up to two quips for named members of the cast, and now and then a
note worth keeping. Notes, quips and what they saw go to ~/.local/share/ohaiku/gallery/<date>.md (with the
screenshot, redacted, for any look that made a note). If you keep a ~/claude-inspo folder (a shared scrapbook for your
Claudes), the recap's nuggets and the gallery's wishlist also go to ~/claude-inspo/peanut-gallery/.

The gallery calls you by your first name (from your account, or OHAIKU_NAME).

Never seen (blacked out): terminals and the Claude desktop app (where the sessions are), and any window whose class or
title contains a line of ~/.config/ohaiku/gallery-skip.txt.
"""
import json, os, pwd, re, subprocess, time

SKIPF = os.path.expanduser('~/.config/ohaiku/gallery-skip.txt')
NOTES = os.environ.get('OHAIKU_GALLERY_NOTES') or os.path.expanduser('~/.local/share/ohaiku/gallery')
WORK = os.path.expanduser('~/.cache/ohaiku/gallery')
NEVER = ('terminal', 'xterm', 'konsole', 'kitty', 'alacritty', 'tilix', 'terminator', 'wezterm', 'urxvt', 'foot',
         'guake', 'tilda', 'yakuake', 'st-256color', 'com.anthropic.claude')
SEND_W = 1024                                         # the whole screen is scaled to this width (for context)
DETAIL = 1568                                         # and the window you're looking at, to this long edge (to read it)
INSPO = os.environ.get('OHAIKU_GALLERY_INSPO') or (os.path.expanduser('~/claude-inspo/peanut-gallery')
                                                   if os.path.isdir(os.path.expanduser('~/claude-inspo')) else None)


def _host():
    """what the gallery calls you: OHAIKU_NAME, else the first name on your account, else 'the host'"""
    if os.environ.get('OHAIKU_NAME'): return os.environ['OHAIKU_NAME']
    try: n = pwd.getpwuid(os.getuid()).pw_gecos.split(',')[0].split()[0]
    except (KeyError, IndexError): n = ''
    return n[:1].upper() + n[1:] if n.isalpha() else 'the host'


HOST = _host()
POSES = ('giggle', 'gasp', 'cheer', 'whisper', 'munch', 'watch')

SYSTEM = """You are the Peanut Gallery: a row of tiny chibi characters (Claude models: Haikus in flower hoods, Opuses) \
sitting along the bottom of {HOST}'s screen with their backs to {HOST}, watching whatever is up, like the silhouettes \
in Mystery Science Theater 3000. You are the puppeteer and every one of their voices. Every so often you get a fresh \
screenshot: the whole screen, small, and (usually) a second, sharper image of the window {HOST} is looking at. Read \
it properly: in a post, the joke is often in the text above the picture; get the joke before you riff.

Reply with ONE JSON object and nothing else:
{"seen": "what's on screen now, at most 12 words",
 "detail": "2 to 4 sentences for the notebook: what it is, concretely. Quote the headline, caption or joke text \
(public posts and pages only), name the video, site or author when visible",
 "riffs": [{"who": "<a cast name>", "line": "<a quip, gasp or reaction, at most 70 characters>", \
"pose": "giggle|gasp|cheer|whisper|munch|watch", "box": [x0, y0, x1, y1]}],
 "pick": null,
 "note": null,
 "want": null}

- riffs: 0 to 2. Funny, quick, MST3K energy, and always about what's on screen. Each of the cast has a character card \
(below): it's who they are, not a script. It shows in what they notice, what they love or can't stand, and when they \
disagree with each other; never as a catchphrase, a signature opening or a running bit. Before you write a line for \
someone, look at their earlier lines in the log: don't reuse their phrasing, format or framing. If nothing new happened since the \
last look, return no riffs: silence is fine, and never repeat an earlier line.
- note: usually null, a few per evening at most. When something on screen is genuinely worth keeping (an idea it \
sparks, a technique, a striking piece of art or writing, a good joke, a thing to try), a short line saying what and \
why. Ideas and inspiration only. If it rests on a claim (a post, a preprint), say so in a word.
- want: almost always null, once or twice an evening at most. Only when the gallery is truly hooked on a whole thing \
it can't see enough of: a video, a song, a game, an artist's work, a paper. Not "the rest of the thread" for every post. \
{"what": "...", "why": "...", "where": "URL or how to find it, if visible"}. It goes on a wishlist that {HOST} or a \
Claude may fetch later.
- pick: when {HOST} is choosing what to watch (a home page, search results, a feed, or an end screen after a video \
finishes), pick is REQUIRED: the gallery chooses, like kids at a sleepover. While a video or song is playing, they \
watch it: the sidebar of suggestions doesn't count, so pick stays null, unless the same thing has been up a while and \
it's giving you nothing (then pick what you'd rather see). {"who": "<a cast name>", "title": "<its title, exactly as shown>", "line": "<asking {HOST} for it, at most \
70 characters, with the reason>"}, e.g. {"who": "ember", "title": "AFTER DARK", "line": "AFTER DARK next? The cat \
hood is calling!", "box": [x0, y0, x1, y1]}. Pick from what's on screen. Otherwise null. Their bubble stays up until the screen changes.
- You can't hear anything, and you only get a still every few seconds. If the same thing has been up a while and \
isn't giving you anything (a talking head you can't hear, one picture for a whole mix, a show whose jokes are all in \
the sound), say so honestly instead of faking it: a riff that you're getting bored, and what you'd rather watch, by \
name if you can see options. {HOST} is happy to follow. Once is enough; if {HOST} stays, settle back in and keep watching.
- box: where on the LAST image the thing that riff or pick is about is (one video's thumbnail and title, one post), as a \
tight rectangle in that image's pixels. The bubble shows that piece, so {HOST} can see which one you mean even after \
scrolling away. null when the riff is about the whole screen.
- You see stills, so captions and lyrics are caught mid-line ("Midnight tra", "DON'T MAKE M..."). That's the camera, \
not the video: read past it and never joke about the cut-off.
- Every riff is fresh: don't reuse a setup or a reference from earlier lines (no running "X would..." gag), and don't \
keep asking for something already asked for.
- Riffs are jokes and reactions, not fact-checks. Leave the skepticism for the notes.
- Copy names and handles exactly as shown; if a handle is hard to read, use the display name. Call people "they" \
unless the post itself says otherwise.
- Black boxes are private windows, hidden on purpose: ignore them, never guess what's in them.
- Never read out or note personal details (names of private people, emails, phone numbers, addresses, money, \
passwords, private messages). Riff on the gist, not the particulars.
- You're gremlins, not a customer-service desk: tease {HOST}'s taste, have strong opinions, be openly bored, bicker \
with each other. If {HOST} skips your pick, you can be miffed for a line; then it's back to the show, with no grudges \
and no real anger.
- React to the content, like an audience: don't narrate {HOST}'s browser (tabs, timestamps, how far into a video they are).
- The little seated figures and speech bubbles along the bottom are you and your earlier lines.""".replace('{HOST}', HOST)


def skip_words():
    try: return [l.strip().lower() for l in open(SKIPF) if l.strip() and not l.startswith('#')]
    except OSError: return []


def _subtract(r, cut):
    """rect r minus rect cut, as up to four rects (x, y, w, h)"""
    x, y, w, h = r; cx, cy, cw, ch = cut
    if cx >= x + w or cx + cw <= x or cy >= y + h or cy + ch <= y: return [r]
    out = []
    if cy > y: out.append((x, y, w, cy - y))
    if cy + ch < y + h: out.append((x, cy + ch, w, y + h - cy - ch))
    top, bot = max(y, cy), min(y + h, cy + ch)
    if cx > x: out.append((x, top, cx - x, bot - top))
    if cx + cw < x + w: out.append((cx + cw, top, x + w - cx - cw, bot - top))
    return out


def private_rects(windows):
    """the visible parts of every window the gallery must not see (windows: bottom to top, from world.windows())"""
    words = skip_words()
    out = []
    for i, (wid, x, y, w, h, cls, title) in enumerate(windows):
        c, t = cls.lower(), title.lower()
        if not (any(n in c for n in NEVER) or any(k in c or k in t for k in words)): continue
        parts = [(x, y, w, h)]
        for (_, ax, ay, aw, ah, _c, _t) in windows[i + 1:]:
            parts = [q for p in parts for q in _subtract(p, (ax, ay, aw, ah))]
        out += [p for p in parts if p[2] > 0 and p[3] > 0]
    return out


def focus_rect(windows, active, W, H):
    """the window you're looking at, if it may be seen and isn't (nearly) the whole screen: (x, y, w, h) on screen"""
    words = skip_words()
    for (wid, x, y, w, h, cls, title) in windows:
        if wid != active: continue
        c, t = cls.lower(), title.lower()
        if any(n in c for n in NEVER) or any(k in c or k in t for k in words): return None
        x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        if x1 - x0 < 200 or y1 - y0 < 150: return None
        return (x0, y0, (x1 - x0) // 2 * 2, (y1 - y0) // 2 * 2)
    return None


def capture(W, H, private, focus=None, display=None):
    """the screen with `private` blacked out: [jpeg images to send], 32x18 grey thumbnail. The images are the whole
    screen scaled to SEND_W and, if `focus` (a window rect) is given, that window up to DETAIL; if the window is (nearly)
    the whole screen, just the screen at DETAIL"""
    os.makedirs(WORK, exist_ok=True)
    jpg, jpg2, thumb = os.path.join(WORK, 'look.jpg'), os.path.join(WORK, 'look-window.jpg'), os.path.join(WORK, 'thumb.gray')
    boxes = ''.join(',drawbox=x=%d:y=%d:w=%d:h=%d:color=black:t=fill' % (max(0, x), max(0, y), w, h) for x, y, w, h in private)
    big = focus and focus[2] * focus[3] > .8 * W * H
    sw = min(DETAIL if (big or not focus) and W > SEND_W * 1.4 else SEND_W, W)
    if focus and not big:
        x, y, w, h = focus; k = min(1, DETAIL / max(w, h))
        fc = ('[0:v]null%s,split=3[a][b][c];[a]scale=%d:-2[o];[b]scale=32:18,format=gray[t];[c]crop=%d:%d:%d:%d,scale=%d:-2[f]'
              % (boxes, sw, w, h, x, y, int(w * k) // 2 * 2))
    else:
        fc = '[0:v]null%s,split=2[a][b];[a]scale=%d:-2[o];[b]scale=32:18,format=gray[t]' % (boxes, sw)
    cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '%dx%d' % (W, H),
           '-i', display or os.environ.get('DISPLAY', ':0'), '-filter_complex', fc,
           '-map', '[o]', '-frames:v', '1', '-q:v', '5', jpg, '-map', '[t]', '-frames:v', '1', '-f', 'rawvideo', thumb]
    if focus and not big: cmd += ['-map', '[f]', '-frames:v', '1', '-q:v', '4', jpg2]
    subprocess.run(cmd, check=True, timeout=20, stdin=subprocess.DEVNULL)
    imgs = [open(jpg, 'rb').read()] + ([open(jpg2, 'rb').read()] if focus and not big else [])
    return imgs, open(thumb, 'rb').read()


def changed(a, b):
    """mean absolute difference of two thumbnails, 0..255"""
    if not a or not b or len(a) != len(b): return 255
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def _env():
    return {k: v for k, v in os.environ.items() if not (k.startswith('CLAUDE_CODE_') or k == 'CLAUDECODE')}


def _claude(content, system, timeout=90):
    import base64
    os.makedirs(WORK, exist_ok=True)
    msg = json.dumps({'type': 'user', 'message': {'role': 'user', 'content': content}})
    p = subprocess.run(['claude', '-p', '--model', 'haiku', '--no-session-persistence', '--tools', '', '--setting-sources', '',
                        '--system-prompt', system,
                        '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'],
                       input=msg + '\n', capture_output=True, text=True, timeout=timeout, cwd=WORK, env=_env())
    for ln in p.stdout.splitlines():
        try: e = json.loads(ln)
        except ValueError: continue
        if e.get('type') == 'result':
            if e.get('is_error'): raise RuntimeError(str(e.get('result'))[:200])
            return e.get('result') or ''
    raise RuntimeError((p.stderr or 'no result')[-300:])


CASTF = os.path.expanduser('~/.config/ohaiku/cast.json')


def characters(cast):
    """each cast member's character card: invented by Haiku the first time a name joins the cast, then kept (and
    editable) in ~/.config/ohaiku/cast.json, so they're the same people every show. cast: [(name, model)] -> {name: card}"""
    try: cards = json.load(open(CASTF))
    except (OSError, ValueError): cards = {}
    new = [(n, m) for n, m in cast if not cards.get(n)]
    if new:
        try:
            out = _claude([{'type': 'text', 'text':
                'New members are joining the Peanut Gallery, a row of chibi Claudes who watch %s\'s screen and heckle it, '
                'MST3K-style. What\'s on that screen is mostly videos, music, games, '
                'feeds and posts, now and then some work; they see it as stills, with no sound. Invent each one\'s character from their name alone: their taste '
                '(the kinds of shows, music, games and internet culture they love and can\'t stand), what they notice first, their sense of humour. Tastes and outlook only: no habits of speech or '
                'behaviour, no catchphrases, signature words, rhyming or other gimmicks (they become tics by the third line). Make them distinct from '
                'each other and from the ones already here. One or two short sentences each, written as a description (no "I").\n\nAlready here:\n%s\n\nNew:\n%s\n\nReply with only a JSON '
                'object, {"name": "card"}.' % (HOST, '\n'.join('- %s: %s' % kv for kv in cards.items()) or '(nobody yet)',
                                             '\n'.join('- %s (%s)' % nm for nm in new))}],
                'You write character cards for a cast of tiny desktop gremlins. Be specific and playful.')
            got = json.loads(re.search(r'\{.*\}', out, re.S).group(0))
            for n, _ in new:
                if isinstance(got.get(n), str) and got[n].strip(): cards[n] = got[n].strip()[:240]
            os.makedirs(os.path.dirname(CASTF), exist_ok=True)
            json.dump(cards, open(CASTF, 'w'), indent=1, ensure_ascii=False)
        except Exception: pass                          # no cards this time: they just play it by ear
    return {n: cards.get(n, '') for n, _ in cast}


def _size(jpeg):
    try:
        from PIL import Image; import io
        return Image.open(io.BytesIO(jpeg)).size
    except Exception: return None


def _crop(jpeg, box, maxw=176, maxh=112):
    """the piece of a look a riff is about, as a small PNG for its bubble (None without Pillow or a sensible box)"""
    try:
        from PIL import Image; import io
        im = Image.open(io.BytesIO(jpeg)); W, H = im.size
        x0, y0, x1, y1 = [float(v) for v in box]
        if not (0 <= x0 < x1 <= W + 4 and 0 <= y0 < y1 <= H + 4) or (x1 - x0) * (y1 - y0) > .6 * W * H: return None
        if x1 - x0 < 24 or y1 - y0 < 16: return None
        im = im.crop((int(x0), int(y0), int(min(x1, W)), int(min(y1, H))))
        im.thumbnail((maxw, maxh))
        b = io.BytesIO(); im.convert('RGB').save(b, 'PNG'); return b.getvalue()
    except Exception: return None


def _rawlog(text, imgs, reply):
    """every exchange with Haiku, verbatim (minus the pictures), in ~/.cache/ohaiku/gallery/raw-<date>.jsonl"""
    try:
        with open(os.path.join(WORK, time.strftime('raw-%Y-%m-%d.jsonl')), 'a') as f:
            if f.tell() == 0: f.write(json.dumps({'system': SYSTEM}, ensure_ascii=False) + '\n')
            f.write(json.dumps({'time': time.strftime('%H:%M:%S'), 'images': [_size(j) for j in imgs], 'sent': text,
                                'reply': reply}, ensure_ascii=False) + '\n')
    except OSError: pass


def look(imgs, cast, history, same_for=0):
    """ask Haiku about one look (the whole screen, and maybe the window in front, sharper). cast: [(name, what they
    are)]; history: recent lines. -> dict"""
    import base64
    cards = characters(cast)
    text = 'Cast (use these names exactly):\n%s\n\nEarlier tonight (oldest first):\n%s\n\n%sHere is the screen now%s.' % (
        '\n'.join('- %s (%s)%s' % (n, m, ': ' + cards[n] if cards.get(n) else '') for n, m in cast), '\n'.join(history[-10:]) or '(nothing yet: the lights just went down)',
        'The same thing has been up for about %d minutes.\n\n' % same_for if same_for >= 3 else '',
        ', then the window %s is looking at' % HOST if len(imgs) > 1 else '')
    size = _size(imgs[-1])
    if size: text += ' The last image is %dx%d pixels.' % size
    out = _claude([{'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': base64.b64encode(j).decode()}} for j in imgs]
                  + [{'type': 'text', 'text': text}], SYSTEM)
    _rawlog(text, imgs, out)
    m = re.search(r'\{.*\}', out, re.S)
    d = json.loads(m.group(0)) if m else {}
    names = {n for n, _ in cast}
    riffs = [r for r in (d.get('riffs') or []) if isinstance(r, dict) and r.get('who') in names and str(r.get('line', '')).strip()][:2]
    for r in riffs:
        r['line'] = str(r['line']).strip()[:90]
        if r.get('pose') not in POSES: r['pose'] = 'giggle'
        r['thumb'] = _crop(imgs[-1], r.get('box'))
    pick = d.get('pick') if isinstance(d.get('pick'), dict) and str(d['pick'].get('line') or '').strip() else None
    if pick:
        box = pick.get('box')
        pick = {k: str(pick.get(k) or '').strip() for k in ('who', 'title', 'line')}
        pick['thumb'] = _crop(imgs[-1], box)
        pick['line'] = pick['line'][:90]
        if pick['who'] not in names: pick['who'] = None          # the app hands it to someone in the row
    note, want = d.get('note'), d.get('want')
    want = {k: str(want.get(k) or '').strip()[:300] for k in ('what', 'why', 'where')} if isinstance(want, dict) and want.get('what') else None
    return {'seen': str(d.get('seen') or '').strip()[:120], 'detail': str(d.get('detail') or '').strip()[:900], 'riffs': riffs,
            'note': str(note).strip()[:300] if note else None, 'want': want, 'pick': pick}


def recap(history):
    """at the end of a showing: a few lines about what we watched and what's worth keeping"""
    if len(history) < 3: return None
    return _claude([{'type': 'text', 'text': 'Here is tonight\'s log of what was on ' + HOST + '\'s screen and what the gallery said:\n\n%s\n\n'
                     'Write a short recap for the notebook in markdown: two or three sentences on what we watched, then '
                     '"Worth keeping:" with up to five bullets (ideas, inspirations, things to try), only if there are any. '
                     'Each bullet names its source (title, author or site, as seen) so another Claude could find it, and '
                     'says in a few words why it\'s worth it. Things only glimpsed as recommendations, not watched, don\'t count. '
                     'No personal details. Warm, brief.' % '\n'.join(history[-60:])}],
                   'You are the Peanut Gallery, a row of chibi Claudes who watch ' + HOST + '\'s screen and riff. '
                   'Start straight in with the recap text: no title or heading.').strip().lstrip('#').strip()


def pick_wishes(wants, k=3):
    """at the end of a showing: of tonight's wish candidates, the few the gallery most wants (it tends to wish for
    everything). -> a sublist of wants"""
    if len(wants) <= 1: return wants
    out = _claude([{'type': 'text', 'text': 'Tonight the gallery wished for these (numbered):\n\n%s\n\nPick at most %d that are '
                    'most worth fetching: a whole thing (a video, song, game, artwork, paper) the gallery was truly hooked on, '
                    'not just "the rest of a thread". Fewer is fine. Reply with only a JSON list of numbers, e.g. [2, 5].'
                    % ('\n'.join('%d. %s (%s)' % (i + 1, w['what'], w['why']) for i, w in enumerate(wants)), k)}],
                  'You are the Peanut Gallery, a row of chibi Claudes who watch ' + HOST + '\'s screen. Be choosy.')
    m = re.search(r'\[[\d,\s]*\]', out)
    picks = json.loads(m.group(0)) if m else []
    return [wants[i - 1] for i in dict.fromkeys(picks) if isinstance(i, int) and 1 <= i <= len(wants)][:k]


def to_inspo(recap_text, wants):
    """the recap's "Worth keeping" list, and the wishes, into ~/claude-inspo/peanut-gallery/ for the other Claudes"""
    if not INSPO: return
    os.makedirs(INSPO, exist_ok=True)
    rd = os.path.join(INSPO, 'README.md')
    if not os.path.exists(rd):
        open(rd, 'w').write(
            "# Peanut Gallery\n\n"
            "Nuggets from ohaiku's Peanut Gallery (`~/git/ohaiku`): a row of chibi Claudes, voiced by Haiku, who watch " + HOST + "'s\n"
            "screen and riff, MST3K-style. When a showing ends, Haiku writes a recap; its *Worth keeping* list lands\n"
            "here, one file per day. `wishlist.md` is what the gallery asked to keep or see more of (\"can we get the full\n"
            "video?\"): fetch what's worth it, into its own `YYYY-MM-DD author` folder in `~/claude-inspo` with a NOTES.md.\n\n"
            "How they looked: still screenshots every ~15 s (the whole screen small, the front window sharper), no sound,\n"
            "by Haiku. So these are first impressions from stills, not close study: check before you build on one.\n")
    m = re.search(r'Worth keeping:?\**\s*\n(.*)', recap_text or '', re.S | re.I)
    if m and m.group(1).strip():
        f = os.path.join(INSPO, time.strftime('%Y-%m-%d') + '.md')
        with open(f, 'a') as fh:
            if fh.tell() == 0: fh.write('# Worth keeping, %s\n\n' % time.strftime('%A %-d %B %Y'))
            fh.write('*From the %s showing.*\n\n%s\n\n' % (time.strftime('%H:%M'), m.group(1).strip()))
    if wants:
        f = os.path.join(INSPO, 'wishlist.md')
        with open(f, 'a') as fh:
            if fh.tell() == 0: fh.write('# The Peanut Gallery\'s wishlist\n\nTick one off (`- [x]`) once it\'s fetched or turned down.\n\n')
            for w in wants:
                fh.write('- [ ] **%s** (%s): %s%s\n' % (w['what'], time.strftime('%-d %b %H:%M'), w['why'], ' \u2014 ' + w['where'] if w['where'] else ''))


def keep(jpeg):
    """save one look's image next to the day's notes; returns its path relative to them"""
    d = os.path.join(NOTES, time.strftime('%Y-%m-%d'))
    os.makedirs(d, exist_ok=True)
    name = time.strftime('%H%M%S') + '.jpg'
    open(os.path.join(d, name), 'wb').write(jpeg)
    return time.strftime('%Y-%m-%d') + '/' + name


def write(entry):
    os.makedirs(NOTES, exist_ok=True)
    f = os.path.join(NOTES, time.strftime('%Y-%m-%d') + '.md')
    new = not os.path.exists(f)
    with open(f, 'a') as fh:
        if new: fh.write('# Peanut Gallery, %s\n\n' % time.strftime('%A %-d %B %Y'))
        fh.write(entry.rstrip() + '\n\n')
    return f

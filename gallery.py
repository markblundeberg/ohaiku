"""gallery.py — the Peanut Gallery: a fast Haiku looks at your screen now and then and voices the chibis' reactions.

Off unless you turn it on. While on, every ~15 s (only when the screen has changed) it takes a screenshot, blacks out
the windows it must not see, and asks Haiku (through your Claude Code login: `claude -p --model haiku`, no tools, no
saved session) for a line of what's on screen, up to two quips for named members of the cast, and now and then a
note worth keeping. Notes, quips and what they saw go to ~/.local/share/ohaiku/gallery/<date>.md.

Never seen (blacked out): terminals and the Claude desktop app (where the sessions are), and any window whose class or
title contains a line of ~/.config/ohaiku/gallery-skip.txt.
"""
import json, os, re, subprocess, time

SKIPF = os.path.expanduser('~/.config/ohaiku/gallery-skip.txt')
NOTES = os.environ.get('OHAIKU_GALLERY_NOTES') or os.path.expanduser('~/.local/share/ohaiku/gallery')
WORK = os.path.expanduser('~/.cache/ohaiku/gallery')
NEVER = ('terminal', 'xterm', 'konsole', 'kitty', 'alacritty', 'tilix', 'terminator', 'wezterm', 'urxvt', 'foot',
         'guake', 'tilda', 'yakuake', 'st-256color', 'com.anthropic.claude')
SEND_W = 1280                                         # the screenshot is scaled to this width
POSES = ('giggle', 'gasp', 'cheer', 'whisper', 'munch', 'watch')

SYSTEM = """You are the Peanut Gallery: a row of tiny chibi characters (Claude models: Haikus in flower hoods, Opuses) \
sitting along the bottom of Mark's screen with their backs to him, watching whatever he has up, like the silhouettes \
in Mystery Science Theater 3000. You are the puppeteer and every one of their voices. Every so often you get a fresh \
screenshot.

Reply with ONE JSON object and nothing else:
{"seen": "what's on screen now, at most 12 words",
 "riffs": [{"who": "<a cast name>", "line": "<a quip, gasp or reaction, at most 70 characters>", \
"pose": "giggle|gasp|cheer|whisper|munch|watch"}],
 "note": null}

- riffs: 0 to 2. Funny, warm, quick; MST3K energy; each voice a little different. If nothing new happened since the \
last look, return no riffs: silence is fine, and never repeat an earlier line.
- note: usually null. When something on screen is genuinely worth keeping (an idea it sparks, a technique, a striking \
piece of art or writing, a good joke, a thing to try), a short line saying what and why. Ideas and inspiration only.
- Black boxes are private windows, hidden on purpose: ignore them, never guess what's in them.
- Never read out or note personal details (names of private people, emails, phone numbers, addresses, money, \
passwords, private messages). Riff on the gist, not the particulars. Be kind about Mark; he's the host.
- React to the content, like an audience: don't narrate Mark's browser (tabs, timestamps, how far into a video he is).
- The little seated figures and speech bubbles along the bottom are you and your earlier lines."""


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


def capture(W, H, private, display=None):
    """(jpeg bytes scaled to SEND_W, 32x18 grey thumbnail bytes) of the whole screen with `private` blacked out"""
    os.makedirs(WORK, exist_ok=True)
    jpg, thumb = os.path.join(WORK, 'look.jpg'), os.path.join(WORK, 'thumb.gray')
    boxes = ''.join(',drawbox=x=%d:y=%d:w=%d:h=%d:color=black:t=fill' % (max(0, x), max(0, y), w, h) for x, y, w, h in private)
    fc = '[0:v]null%s,split=2[a][b];[a]scale=%d:-2[o];[b]scale=32:18,format=gray[t]' % (boxes, min(SEND_W, W))
    cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '%dx%d' % (W, H),
           '-i', display or os.environ.get('DISPLAY', ':0'), '-filter_complex', fc,
           '-map', '[o]', '-frames:v', '1', '-q:v', '5', jpg, '-map', '[t]', '-frames:v', '1', '-f', 'rawvideo', thumb]
    subprocess.run(cmd, check=True, timeout=20, stdin=subprocess.DEVNULL)
    return open(jpg, 'rb').read(), open(thumb, 'rb').read()


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
    p = subprocess.run(['claude', '-p', '--model', 'haiku', '--no-session-persistence', '--tools', '', '--system-prompt', system,
                        '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'],
                       input=msg + '\n', capture_output=True, text=True, timeout=timeout, cwd=WORK, env=_env())
    for ln in p.stdout.splitlines():
        try: e = json.loads(ln)
        except ValueError: continue
        if e.get('type') == 'result':
            if e.get('is_error'): raise RuntimeError(str(e.get('result'))[:200])
            return e.get('result') or ''
    raise RuntimeError((p.stderr or 'no result')[-300:])


def look(jpeg, cast, history):
    """ask Haiku about one screenshot. cast: [(name, what they are)]; history: recent lines. -> dict"""
    import base64
    text = 'Cast (use these names exactly): %s\n\nEarlier tonight (oldest first):\n%s\n\nHere is the screen now.' % (
        '; '.join('%s (%s)' % c for c in cast), '\n'.join(history[-10:]) or '(nothing yet: the lights just went down)')
    out = _claude([{'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': base64.b64encode(jpeg).decode()}},
                   {'type': 'text', 'text': text}], SYSTEM)
    m = re.search(r'\{.*\}', out, re.S)
    d = json.loads(m.group(0)) if m else {}
    names = {n for n, _ in cast}
    riffs = [r for r in (d.get('riffs') or []) if isinstance(r, dict) and r.get('who') in names and str(r.get('line', '')).strip()][:2]
    for r in riffs:
        r['line'] = str(r['line']).strip()[:90]
        if r.get('pose') not in POSES: r['pose'] = 'giggle'
    note = d.get('note')
    return {'seen': str(d.get('seen') or '').strip()[:120], 'riffs': riffs, 'note': str(note).strip()[:300] if note else None}


def recap(history):
    """at the end of a showing: a few lines about what we watched and what's worth keeping"""
    if len(history) < 3: return None
    return _claude([{'type': 'text', 'text': 'Here is tonight\'s log of what was on Mark\'s screen and what the gallery said:\n\n%s\n\n'
                     'Write a short recap for his notebook in markdown: two or three sentences on what we watched, then '
                     '"Worth keeping:" with up to five bullets (ideas, inspirations, things to try), only if there are any. '
                     'No personal details. Warm, brief.' % '\n'.join(history[-80:])}],
                   'You are the Peanut Gallery, a row of chibi Claudes who watch Mark\'s screen with him and riff. '
                   'Start straight in with the recap text: no title or heading.').strip().lstrip('#').strip()


def write(entry):
    os.makedirs(NOTES, exist_ok=True)
    f = os.path.join(NOTES, time.strftime('%Y-%m-%d') + '.md')
    new = not os.path.exists(f)
    with open(f, 'a') as fh:
        if new: fh.write('# Peanut Gallery, %s\n\n' % time.strftime('%A %-d %B %Y'))
        fh.write(entry.rstrip() + '\n\n')
    return f

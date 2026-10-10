#!/usr/bin/env python3
"""ohaiku showreel: records the real screen while it directs the chibis on a timeline, and cues you (a ding and a line
here) for your part: scrolling, dragging windows. Start it with the thing you want them to watch up in front.

  ./showreel.py               # record to ~/Videos/ohaiku-showreel-<time>.mp4
  ./showreel.py --rehearse    # the same timeline, no recording
  Ctrl-C ends it early (the recording is kept)."""
import argparse, glob, json, os, signal, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
OH = os.path.join(HERE, 'ohaiku')

# (seconds, ohaiku command or None, your cue or None)
STEPS = [
    (0,   'gallery',  'Peanut Gallery on. Leave the post up top and let them read it.'),
    (26,  None,       'Scroll slowly down to the replies.'),
    (50,  'recess',   'Recess! Grab a window and drag it around: they ride it and fall off.'),
    (62,  'leaves',   None),
    (70,  'fly',      None),
    (80,  'kaiju',    None),
    (90,  'clippy',   None),
    (98,  'lemmings', 'Lemmings: click one to make it dig or block, if you like.'),
    (110, 'ohno',     None),
    (116, 'calm',     'Leaves and fliers off, back to their seats. Wrapping up.'),
    (128, None,       None),
]


def oh(*args):
    return subprocess.run([OH, *args], capture_output=True, text=True)


def status():
    try: return json.loads(oh('--status').stdout)
    except ValueError: return None


def skipped_sessions():
    """live sessions the gallery skips (~/.config/ohaiku/gallery-skip.txt): their chibis and plates would be on screen"""
    try: words = [l.strip().lower() for l in open(os.path.expanduser('~/.config/ohaiku/gallery-skip.txt')) if l.strip() and not l.startswith('#')]
    except OSError: return []
    out = []
    for f in glob.glob(os.path.expanduser('~/.claude/sessions/*.json')):
        try: d = json.load(open(f))
        except (OSError, ValueError): continue
        if any(w in (d.get('cwd') or '').lower() or w in (d.get('name') or '').lower() for w in words): out.append(d.get('name') or '(unnamed)')
    return out


def cue(text):
    subprocess.Popen(['paplay', '--volume=30000', os.path.join(HERE, 'ding.wav')], stderr=subprocess.DEVNULL)
    print('\n  \033[1;33m>>> %s\033[0m' % text, flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--rehearse', action='store_true', help="run the timeline without recording")
    ap.add_argument('--out', help='output file')
    a = ap.parse_args()
    st = status()
    if st is None: sys.exit('ohaiku is not running here (DISPLAY=%s).' % os.environ.get('DISPLAY'))
    hidden = skipped_sessions()
    if hidden and not a.rehearse:
        sys.exit("Not recording: these sessions are on the gallery's skip list, but their chibis would be on screen:\n  "
                 + '\n  '.join(hidden) + '\nSend them home first (middle-click the plate), or end those sessions.')
    if st['mode'] != 'perch' or st['snow']: oh('--perch'); st['snow'] and oh('--leaves' if st['snow'] == 'leaves' else '--snow')

    rec = None
    if not a.rehearse:
        out = a.out or os.path.expanduser(time.strftime('~/Videos/ohaiku-showreel-%Y%m%d-%H%M%S.mp4'))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        size = subprocess.run(['xdpyinfo'], capture_output=True, text=True).stdout.split('dimensions:')[1].split()[0]
        print('Recording %s of %s to %s' % (size, os.environ.get('DISPLAY'), out))
    for n in (3, 2, 1): print('  %d...' % n, flush=True); time.sleep(1)
    if not a.rehearse:
        rec = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'x11grab', '-framerate', '30', '-video_size', size,
                                '-i', os.environ.get('DISPLAY', ':0'), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16',
                                '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    t0, flying = time.time(), False
    try:
        for at, cmd, say in STEPS:
            time.sleep(max(0, t0 + at - time.time()))
            if cmd == 'gallery' and (status() or {}).get('gallery', 'off') != 'off': cmd = None    # already on
            if cmd == 'calm':                         # on camera: the weather and the fliers stop, everyone sits down
                if (status() or {}).get('snow') == 'leaves': oh('--leaves')
                if flying: oh('--fly'); flying = False
                cmd = 'perch'
            if cmd: oh('--' + cmd)
            flying = (flying or cmd == 'fly') and cmd != 'perch'
            if say: cue(say)
            print('  %3ds  %s' % (at, cmd or ''), flush=True)
    except KeyboardInterrupt:
        print('\n  (ended early)')
    finally:
        if rec:
            rec.stdin.write(b'q'); rec.stdin.flush(); rec.wait(timeout=30)
            print('Saved %s' % out)
        st = status() or {}
        if st.get('snow') == 'leaves': oh('--leaves')
        if flying: oh('--fly')
        if st.get('gallery', 'off') != 'off': oh('--gallery')
        oh('--perch')


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt))
    main()

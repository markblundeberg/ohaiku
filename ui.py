"""ui.py — find buttons on screen by name, through the accessibility tree (AT-SPI), the way a screen reader does.

    python3 ui.py "Calculator"               # every button in the window whose title contains "Calculator"
    python3 ui.py "Calculator" 7 × 6 =       # where those ones are: name x y w h (screen pixels)

Read-only: it only asks where things are. GTK 3, Qt and Chromium (with accessibility on) answer in screen coordinates.
"""
import sys
import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

PRESSABLE = {'push button', 'toggle button', 'check box', 'radio button', 'link', 'menu item', 'page tab', 'push button menu'}


def windows(title):
    """the top-level windows (frames) whose title contains `title`"""
    d = Atspi.get_desktop(0)
    for i in range(d.get_child_count()):
        app = d.get_child_at_index(i)
        if app is None: continue
        for j in range(app.get_child_count()):
            f = app.get_child_at_index(j)
            try:
                if f is not None and title.lower() in (f.get_name() or '').lower(): yield f
            except gi.repository.GLib.Error:
                continue


def buttons(root, limit=4000):
    """(name, x, y, w, h) of every visible pressable thing under root"""
    out, stack, n = [], [root], 0
    while stack and n < limit:
        a = stack.pop(); n += 1
        try:
            role, st = a.get_role_name(), a.get_state_set()
            if not st.contains(Atspi.StateType.SHOWING): continue
            if role in PRESSABLE:
                name = (a.get_name() or '').strip()
                e = a.get_extents(Atspi.CoordType.SCREEN)
                if name and e.width > 0 and e.height > 0: out.append((name, e.x, e.y, e.width, e.height))
            for k in range(a.get_child_count() - 1, -1, -1):
                c = a.get_child_at_index(k)
                if c is not None: stack.append(c)
        except gi.repository.GLib.Error:
            continue
    return out


def find(title, names):
    """names -> [(name, x, y, w, h)], in order; raises KeyError for one it can't see"""
    for f in windows(title):
        bs = buttons(f)
        got = []
        for nm in names:
            hit = [b for b in bs if b[0] == nm] or [b for b in bs if b[0].lower() == nm.lower()]
            if not hit: break
            got.append(hit[0])
        else:
            return got
    raise KeyError('no button %r in a window titled like %r' % (nm if names else '', title))


if __name__ == '__main__':
    t, names = sys.argv[1], sys.argv[2:]
    if names:
        for b in find(t, names): print(*b)
    else:
        for f in windows(t):
            print('#', f.get_name())
            for b in buttons(f): print(*b)


def texts(title):
    """the text shown in a window's text fields and labels (e.g. a calculator's display), top to bottom"""
    out = []
    for f in windows(title):
        stack = [f]
        while stack:
            a = stack.pop()
            try:
                if a.get_role_name() in ('text', 'entry', 'label', 'editbar', 'paragraph', 'static', 'section', 'heading') and a.get_state_set().contains(Atspi.StateType.SHOWING):
                    s = Atspi.Text.get_text(a, 0, Atspi.Text.get_character_count(a)) if a.get_text_iface() else (a.get_name() or '')
                    if s.strip(): out.append((a.get_extents(Atspi.CoordType.SCREEN).y, s.strip()))
                for k in range(a.get_child_count() - 1, -1, -1):
                    c = a.get_child_at_index(k)
                    if c is not None: stack.append(c)
            except gi.repository.GLib.Error:
                continue
    return [s for _, s in sorted(out)]

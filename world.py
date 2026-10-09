"""world.py — the real desktop as a playground: which window tops can be stood on, right now.

Surfaces.poll() -> list of Surface(id, x0, x1, y, segs): the top edge of each visible window on the current workspace
(frame included, CSD shadow excluded), with `segs` the stretches of it that no window above covers. Plus the floor.
Uses python-xlib on its own connection; read-only.
"""
from Xlib import X, display, Xatom
from Xlib.error import XError


class Surface:
    def __init__(self, id, x0, x1, y, segs):
        self.id, self.x0, self.x1, self.y, self.segs = id, x0, x1, y, segs

    def stands(self, x, margin=6):
        return any(a + margin <= x <= b - margin for a, b in self.segs)

    def __repr__(self): return '<Surface %s y=%d %s>' % (self.id, self.y, self.segs)


class Surfaces:
    def __init__(self):
        self.d = display.Display()
        self.root = self.d.screen().root
        A = self.d.intern_atom
        self.at = {k: A(k) for k in ('_NET_CLIENT_LIST_STACKING', '_NET_CURRENT_DESKTOP', '_NET_WM_DESKTOP', '_NET_WM_STATE',
                                     '_NET_WM_STATE_HIDDEN', '_NET_WM_WINDOW_TYPE', '_NET_WM_WINDOW_TYPE_DOCK',
                                     '_NET_WM_WINDOW_TYPE_DESKTOP', '_NET_FRAME_EXTENTS', '_GTK_FRAME_EXTENTS',
                                     '_NET_WM_STATE_FULLSCREEN', '_NET_ACTIVE_WINDOW')}

    def _prop(self, w, name, typ=Xatom.CARDINAL):
        try:
            p = w.get_full_property(self.at[name], X.AnyPropertyType)
            return list(p.value) if p else None
        except XError:
            return None

    def rects(self):
        """visible client windows on this workspace, bottom to top: (id, x, y, w, h) of what you see"""
        ids = self._prop(self.root, '_NET_CLIENT_LIST_STACKING') or []
        cur = (self._prop(self.root, '_NET_CURRENT_DESKTOP') or [0])[0]
        out = []
        for wid in ids:
            w = self.d.create_resource_object('window', wid)
            try:
                desk = (self._prop(w, '_NET_WM_DESKTOP') or [cur])[0]
                if desk not in (cur, 0xFFFFFFFF): continue
                st = self._prop(w, '_NET_WM_STATE') or []
                if self.at['_NET_WM_STATE_HIDDEN'] in st: continue
                ty = self._prop(w, '_NET_WM_WINDOW_TYPE') or []
                if self.at['_NET_WM_WINDOW_TYPE_DOCK'] in ty or self.at['_NET_WM_WINDOW_TYPE_DESKTOP'] in ty: continue
                g = w.get_geometry()
                t = w.translate_coords(self.root, 0, 0)
                x, y, ww, hh = -t.x, -t.y, g.width, g.height
                fe = self._prop(w, '_NET_FRAME_EXTENTS') or [0, 0, 0, 0]          # server-side frame: l r t b
                ge = self._prop(w, '_GTK_FRAME_EXTENTS') or [0, 0, 0, 0]          # client-side shadow: l r t b
                x, y = x - fe[0] + ge[0], y - fe[2] + ge[2]
                ww, hh = ww + fe[0] + fe[1] - ge[0] - ge[1], hh + fe[2] + fe[3] - ge[2] - ge[3]
                if ww < 120 or hh < 60: continue
                out.append((wid, x, y, ww, hh))
            except XError:
                continue
        return out

    def windows(self):
        """every visible client window on this workspace, bottom to top: (id, x, y, w, h, wm_class, title)"""
        ids = self._prop(self.root, '_NET_CLIENT_LIST_STACKING') or []
        cur = (self._prop(self.root, '_NET_CURRENT_DESKTOP') or [0])[0]
        UTF8, NAME = self.d.intern_atom('UTF8_STRING'), self.d.intern_atom('_NET_WM_NAME')
        out = []
        for wid in ids:
            w = self.d.create_resource_object('window', wid)
            try:
                desk = (self._prop(w, '_NET_WM_DESKTOP') or [cur])[0]
                if desk not in (cur, 0xFFFFFFFF): continue
                if self.at['_NET_WM_STATE_HIDDEN'] in (self._prop(w, '_NET_WM_STATE') or []): continue
                g = w.get_geometry(); t = w.translate_coords(self.root, 0, 0)
                fe = self._prop(w, '_NET_FRAME_EXTENTS') or [0, 0, 0, 0]
                x, y = -t.x - fe[0], -t.y - fe[2]
                ww, hh = g.width + fe[0] + fe[1], g.height + fe[2] + fe[3]
                cls = ' '.join(w.get_wm_class() or ())
                p = w.get_full_property(NAME, UTF8)
                title = p.value.decode('utf-8', 'replace') if p else str(w.get_wm_name() or '')
                out.append((wid, x, y, ww, hh, cls, title))
            except XError:
                continue
        return out

    def active(self):
        """the focused window's id (_NET_ACTIVE_WINDOW), or None"""
        v = self._prop(self.root, '_NET_ACTIVE_WINDOW')
        return v[0] if v else None

    def poll(self, top_limit=0):
        rs = self.rects()
        out = []
        for i, (wid, x, y, w, h) in enumerate(rs):
            if y < top_limit: continue
            segs = [(x, x + w)]
            for (_, ax, ay, aw, ah) in rs[i + 1:]:                 # windows above this one
                if ay <= y - 2 <= ay + ah or ay <= y + 2 <= ay + ah:
                    nxt = []
                    for a, b in segs:
                        if ax + aw <= a or ax >= b: nxt.append((a, b)); continue
                        if a < ax: nxt.append((a, ax))
                        if ax + aw < b: nxt.append((ax + aw, b))
                    segs = nxt
            segs = [(a, b) for a, b in segs if b - a > 60]
            if segs: out.append(Surface(wid, x, x + w, y, segs))
        return out


if __name__ == '__main__':
    S = Surfaces()
    for s in S.poll(): print(s)
    for w in S.windows(): print(w[:6])

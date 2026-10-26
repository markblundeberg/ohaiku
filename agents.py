"""agents.py — what every Claude Code session on this machine is doing, read from the tails of their transcripts.

Read-only: it looks at ~/.claude/projects/*/*.jsonl (and each session's subagents/) and never writes there.
  scan() -> [Agent]   one per recently active session or running subagent
Agent.state is one of
  'think'   between steps (thinking, or a tool result just came back)
  'tool'    running a tool (Agent.tool says which). A tool call only reaches the transcript once it finishes, so
            while one runs this shows the last tool used (after 12 s of quiet); a tool waiting for your permission
            looks the same
  'ask'     asked you a question (AskUserQuestion / ExitPlanMode is pending), or is waiting at a permission prompt or
            dialog (the live session record says so; Agent.tool is then what it waits for, e.g. 'permission prompt')
  'limit'   hit a usage limit (Agent.tool: e.g. 'resets 5:30pm'); until the reset, or until you write again
  'error'   the API failed (529 overloaded, 500...) and the turn stopped; for ten minutes, or until you write again
  'done'    turn finished in the last DONE_S seconds
  'free'    turn finished, waiting for you
  'asleep'  nothing for SLEEP_S seconds
"""
import calendar, glob, hashlib, json, os, re, time

ROOT = os.path.expanduser('~/.claude/projects')
LIVE = os.path.expanduser('~/.claude/sessions')       # <pid>.json for each running Claude Code process
DONE_S, SLEEP_S = 25, 20 * 60
SKIP = {'last-prompt', 'custom-title', 'agent-name', 'mode', 'permission-mode', 'atis-latch', 'bridge-session',
        'attachment', 'file-history-snapshot', 'queue-operation', 'summary', 'progress'}
ASK_TOOLS = {'AskUserQuestion', 'ExitPlanMode'}


class Agent:
    def __init__(self, **kw): self.__dict__.update(kw)

    def __repr__(self):
        return '<%s %s %s%s age=%ds>' % (self.kind, self.name, self.state, ':' + self.tool if self.tool else '', self.age)


_cache = {}      # path -> (mtime, size, parsed)


def _tail_entries(path, want=40):
    """the last `want` parseable entries, newest first (grows the read window until it has them)"""
    size = os.path.getsize(path)
    n = 64 * 1024
    while True:
        with open(path, 'rb') as f:
            f.seek(max(0, size - n)); buf = f.read()
        lines = buf.split(b'\n')
        if size > n: lines = lines[1:]               # first line is probably cut
        out = []
        for ln in reversed(lines):
            if not ln.strip(): continue
            try: out.append(json.loads(ln))
            except ValueError: continue
            if len(out) >= want: break
        if len(out) >= want or n >= size or n >= 16 * 1024 * 1024: return out
        n *= 4


def _parse(path):
    st = os.stat(path)
    c = _cache.get(path)
    if c and c[0] == st.st_mtime and c[1] == st.st_size: return c[2]
    ents = _tail_entries(path)
    state, tool, last_tool, model, title, aname, cwd = None, None, None, None, None, None, None
    sends = []                                        # recent SendMessage calls: (tool_use id, to, timestamp)
    ai, entry, until = None, None, None
    for e in ents:                                    # newest first
        t = e.get('type')
        if t == 'custom-title' and title is None: title = e.get('customTitle')
        if t == 'agent-name' and aname is None: aname = e.get('agentName')
        if cwd is None and e.get('cwd'): cwd = e['cwd']
        if t == 'ai-title' and ai is None: ai = e.get('aiTitle')
        if entry is None and e.get('entrypoint'): entry = e['entrypoint']
        m = e.get('message') or {}
        if model is None and t == 'assistant' and m.get('model') and not m['model'].startswith('<'): model = m['model']
        if t == 'assistant':
            for b in (m.get('content') or []):
                if isinstance(b, dict) and b.get('type') == 'tool_use' and b.get('name') == 'SendMessage':
                    sends.append((b.get('id'), str((b.get('input') or {}).get('to', '')), e.get('timestamp', '')))
        if last_tool is None and t == 'assistant':
            lu = [b for b in (m.get('content') or []) if isinstance(b, dict) and b.get('type') == 'tool_use']
            if lu: last_tool = lu[-1].get('name')
        if state is not None or t in SKIP: continue
        c = m.get('content')
        if t == 'assistant' and e.get('isApiErrorMessage'):
            state, tool, until = _api_error(e, m)
        elif t == 'assistant':
            uses = [b for b in (c or []) if isinstance(b, dict) and b.get('type') == 'tool_use']
            if uses:
                tool = uses[-1].get('name'); state = 'ask' if tool in ASK_TOOLS else 'tool'
            elif m.get('stop_reason') == 'end_turn': state = 'free'
            else: state = 'think'
        elif t == 'user':
            if isinstance(c, str) and c.startswith('[Request interrupted'): state = 'free'
            elif isinstance(c, list) and any(isinstance(b, dict) and b.get('type') == 'text' and str(b.get('text', '')).startswith('[Request interrupted') for b in c): state = 'free'
            else: state = 'think'
        elif t == 'system':
            if e.get('subtype') == 'turn_duration': state = 'free'
    parsed = dict(state=state or 'free', tool=tool if state in ('tool', 'ask', 'limit', 'error') else None, until=until, last_tool=last_tool, sends=sends, ai=ai, entry=entry, model=model or '', title=title,
                  aname=aname, cwd=cwd)
    _cache[path] = (st.st_mtime, st.st_size, parsed)
    return parsed


def _when(ts):
    try: return calendar.timegm(time.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S'))
    except (TypeError, ValueError): return time.time()


def _api_error(e, m):
    """a synthetic assistant message saying the API failed: ('limit' | 'error', what to show, until when)"""
    txt = ' '.join(str(b.get('text', '')) for b in (m.get('content') or []) if isinstance(b, dict))
    at = _when(e.get('timestamp'))
    if e.get('error') == 'rate_limit':
        r = re.search(r'resets\s+(\d{1,2})(?::(\d\d))?\s*([ap]m)', txt, re.I)
        if r:                                         # the next such clock time after the message, local time
            h = int(r.group(1)) % 12 + (12 if r.group(3).lower() == 'pm' else 0)
            lt = time.localtime(at)
            until = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, h, int(r.group(2) or 0), 0, 0, 0, -1))
            if until <= at: until += 86400
            return 'limit', 'back at %s:%s%s' % (r.group(1), r.group(2) or '00', r.group(3).lower()), until
        if 'credit' in txt.lower(): return 'limit', 'needs usage credits', at + 12 * 3600
        return 'limit', 'usage limit', at + 5 * 3600
    r = re.search(r'API Error:\s*(\d{3})\s*([A-Za-z ]{0,24})', txt)
    what = ('%s %s' % (r.group(1), r.group(2).strip().split('.')[0])).strip() if r else ('connection lost' if 'onnection' in txt else 'API error')
    return 'error', what.lower(), at + 600


_work = {}       # path -> [offset, last timestamp, {date: seconds}]
_TS = re.compile(rb'"timestamp":"([0-9T:-]{19})')


def work_today(path):
    """seconds this session spent working today: the gaps of under two minutes between its transcript entries,
    by local date (read incrementally; turn_duration records alone miss turns)"""
    w = _work.setdefault(path, [0, None, {}])
    try:
        size = os.path.getsize(path)
        if size < w[0]: w[:] = [0, None, {}]
        if size > w[0]:
            with open(path, 'rb') as f:
                f.seek(w[0]); buf = f.read(size - w[0])
            cut = buf.rfind(b'\n') + 1; w[0] += cut
            for ln in buf[:cut].split(b'\n'):
                r = _TS.search(ln)
                if not r: continue
                t = _when(r.group(1).decode())
                if w[1] is not None and 0 < t - w[1] < 120:
                    d = time.strftime('%Y-%m-%d', time.localtime(t))
                    w[2][d] = w[2].get(d, 0) + t - w[1]
                if w[1] is None or t > w[1]: w[1] = t
    except OSError:
        pass
    return w[2].get(time.strftime('%Y-%m-%d'), 0)


_names = {}
_born = {}


def _first_time(path):
    """when the transcript began (its first timestamp); a stable order for the line (ctime changes on every write)"""
    if path in _born: return _born[path]
    t = None
    try:
        with open(path) as f:
            for ln, _ in zip(f, range(50)):
                ts = json.loads(ln).get('timestamp') if '"timestamp"' in ln else None
                if ts:
                    t = time.mktime(time.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S')); break
    except (OSError, ValueError):
        pass
    _born[path] = t or os.path.getmtime(path)
    return _born[path]


def _whole_file_names(path):
    """the latest customTitle / agentName anywhere in the transcript (once per session; the tail may not have one)"""
    if path in _names: return _names[path]
    title = aname = ai = None
    try:
        with open(path, 'rb') as f:
            for ln in f:
                if b'"custom-title"' in ln or b'"agent-name"' in ln or b'"ai-title"' in ln:
                    try: e = json.loads(ln)
                    except ValueError: continue
                    title = e.get('customTitle') or title; aname = e.get('agentName') or aname
                    ai = e.get('aiTitle') or ai
    except OSError: pass
    _names[path] = (title, aname, ai)
    return title, aname, ai


def _look(model, sid, kind):
    """which sprite: the model's own chibi, a stable variant per session"""
    h = int(hashlib.sha1(sid.encode()).hexdigest(), 16)
    if 'opus' in model: return 'opus%d' % (h % 8)
    return 'haiku%02d' % (h % 12)


def live_sessions():
    """sessionId -> the running process's record (name, status 'busy'/'idle'/..., pid, socket), for live pids only"""
    out = {}
    for f in glob.glob(os.path.join(LIVE, '*.json')):
        try:
            d = json.load(open(f)); pid = int(d['pid'])
            os.kill(pid, 0)
        except (OSError, ValueError, KeyError):
            continue
        out[d.get('sessionId')] = d
    return out


def scan(within=2 * 3600, now=None):
    now = now or time.time()
    out = []
    live = live_sessions()
    for path in glob.glob(os.path.join(ROOT, '*', '*.jsonl')):
        try: mt = os.path.getmtime(path)
        except OSError: continue
        sid = os.path.basename(path)[:-6]
        L = live.get(sid)
        if now - mt > within and not L: continue
        try: p = _parse(path)
        except OSError: continue
        if not L and (p['entry'] == 'cli' or (p['entry'] or '').startswith('sdk')): continue   # a command-line or headless (-p, Agent SDK) session whose process has exited: closed
        title, aname, ai = p['title'], p['aname'], p['ai']
        if not title and not aname:
            t2, a2, ai2 = _whole_file_names(path); title, aname, ai = t2, a2, ai or ai2
        tf = os.path.join(os.path.dirname(path), sid, 'custom-title.json')
        if not title and os.path.exists(tf):
            try: title = json.load(open(tf)).get('customTitle')
            except (OSError, ValueError): pass
        if L and L.get('name'): title = L['name']
        name = title or aname or ai or (os.path.basename(p['cwd']) if p['cwd'] else sid[:8])
        age = now - mt
        state = p['state']
        tool = p['tool']
        if L:                                         # the process says what it's doing right now
            st = L.get('status')
            if st == 'idle' and state in ('think', 'tool'): state = 'free'
            elif st == 'busy' and state == 'free': state = 'think'
            elif st == 'waiting': state, tool = 'ask', L.get('waitingFor') or 'waiting'   # a permission prompt, a dialog...
            elif st == 'shell' and state in ('think', 'tool'): state = 'free'               # idle, with a shell open
        elif state in ('think', 'tool') and age > 15 * 60: state = 'free'          # stalled, or closed mid-turn
        elif state == 'think' and age > 12 and p['last_tool']: state, tool = 'tool', p['last_tool']   # (see above)
        if state in ('limit', 'error') and p['until'] and now > p['until']: state, tool = 'free', None   # it has reset
        if state == 'free': state = 'done' if age < DONE_S else ('asleep' if age > SLEEP_S else 'free')
        out.append(Agent(kind='session', id=sid, parent=None, name=name, names=[n for n in (title, aname) if n], state=state, cwd=p['cwd'] or '',
                         sends=p['sends'], pid=int(L['pid']) if L else None, sock=(L or {}).get('messagingSocketPath'), live=bool(L), tool=tool, last_tool=p['last_tool'], model=p['model'],
                         age=age, look=_look(p['model'], sid, 'session'), born=_first_time(path), today=work_today(path)))
        # subagents: shown while they run, and briefly once they finish
        for sp in glob.glob(os.path.join(os.path.dirname(path), sid, 'subagents', 'agent-*.jsonl')):
            try: smt = os.path.getmtime(sp)
            except OSError: continue
            if now - smt > 600: continue
            try: q = _parse(sp)
            except OSError: continue
            sage = now - smt
            sst, stool = q['state'], q['tool']
            if q['last_tool'] == 'SubagentHandback': sst = 'free'          # its final call; no end_turn follows
            elif sst == 'think' and sage > 12 and q['last_tool']: sst, stool = 'tool', q['last_tool']
            if sst == 'free':
                if sage > 8: continue
                sst = 'done'
            elif sage > 300: continue                     # stalled or killed
            aid = os.path.basename(sp)[:-6]
            desc = ''
            try: desc = json.load(open(sp[:-6] + '.meta.json')).get('description', '')
            except (OSError, ValueError): pass
            out.append(Agent(kind='sub', id=aid, parent=sid, name=desc or 'helper', names=[n for n in (title, aname) if n], state=sst, cwd=p['cwd'] or '', sends=q['sends'], pid=None, sock=None, live=False, tool=stool, last_tool=q['last_tool'],
                             model=q['model'], age=sage, look=_look(q['model'], aid, 'sub'), born=_first_time(sp), today=0))
    return out


if __name__ == '__main__':
    for a in sorted(scan(), key=lambda a: a.born): print(a)

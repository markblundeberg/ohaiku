"""agents.py — what every Claude Code session on this machine is doing, read from the tails of their transcripts.

Read-only: it looks at ~/.claude/projects/*/*.jsonl (and each session's subagents/) and never writes there.
  scan() -> [Agent]   one per recently active session or running subagent
Agent.state is one of
  'think'   between steps (thinking, or a tool result just came back)
  'tool'    running a tool (Agent.tool says which). A tool call only reaches the transcript once it finishes, so
            while one runs this shows the last tool used (after 12 s of quiet); a tool waiting for your permission
            looks the same
  'ask'     asked you a question (AskUserQuestion / ExitPlanMode is pending)
  'done'    turn finished in the last DONE_S seconds
  'free'    turn finished, waiting for you
  'asleep'  nothing for SLEEP_S seconds
"""
import glob, hashlib, json, os, time

ROOT = os.path.expanduser('~/.claude/projects')
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
    for e in ents:                                    # newest first
        t = e.get('type')
        if t == 'custom-title' and title is None: title = e.get('customTitle')
        if t == 'agent-name' and aname is None: aname = e.get('agentName')
        if cwd is None and e.get('cwd'): cwd = e['cwd']
        m = e.get('message') or {}
        if model is None and t == 'assistant' and m.get('model') and not m['model'].startswith('<'): model = m['model']
        if last_tool is None and t == 'assistant':
            lu = [b for b in (m.get('content') or []) if isinstance(b, dict) and b.get('type') == 'tool_use']
            if lu: last_tool = lu[-1].get('name')
        if state is not None or t in SKIP: continue
        c = m.get('content')
        if t == 'assistant':
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
    parsed = dict(state=state or 'free', tool=tool if state in ('tool', 'ask') else None, last_tool=last_tool, model=model or '', title=title,
                  aname=aname, cwd=cwd)
    _cache[path] = (st.st_mtime, st.st_size, parsed)
    return parsed


def _look(model, sid, kind):
    """which sprite: the model's own chibi, a stable variant per session"""
    h = int(hashlib.sha1(sid.encode()).hexdigest(), 16)
    if 'opus' in model: return 'opus%d' % (h % 8)
    return 'haiku%02d' % (h % 12)


def scan(within=2 * 3600, now=None):
    now = now or time.time()
    out = []
    for path in glob.glob(os.path.join(ROOT, '*', '*.jsonl')):
        try: mt = os.path.getmtime(path)
        except OSError: continue
        if now - mt > within: continue
        sid = os.path.basename(path)[:-6]
        try: p = _parse(path)
        except OSError: continue
        title = p['title']
        tf = os.path.join(os.path.dirname(path), sid, 'custom-title.json')
        if not title and os.path.exists(tf):
            try: title = json.load(open(tf)).get('customTitle')
            except (OSError, ValueError): pass
        name = title or p['aname'] or (os.path.basename(p['cwd']) if p['cwd'] else sid[:8])
        age = now - mt
        state = p['state']
        tool = p['tool']
        if state in ('think', 'tool') and age > 15 * 60: state = 'free'          # stalled, or closed mid-turn
        elif state == 'think' and age > 12 and p['last_tool']: state, tool = 'tool', p['last_tool']   # (see above)
        if state == 'free': state = 'done' if age < DONE_S else ('asleep' if age > SLEEP_S else 'free')
        out.append(Agent(kind='session', id=sid, parent=None, name=name, state=state, tool=tool, model=p['model'],
                         age=age, look=_look(p['model'], sid, 'session'), born=os.path.getctime(path)))
        # subagents: shown while they run, and briefly once they finish
        for sp in glob.glob(os.path.join(os.path.dirname(path), sid, 'subagents', 'agent-*.jsonl')):
            try: smt = os.path.getmtime(sp)
            except OSError: continue
            if now - smt > 600: continue
            try: q = _parse(sp)
            except OSError: continue
            sage = now - smt
            sst, stool = q['state'], q['tool']
            if sst == 'think' and sage > 12 and q['last_tool']: sst, stool = 'tool', q['last_tool']
            if sst == 'free':
                if sage > 8: continue
                sst = 'done'
            elif sage > 300: continue                     # stalled or killed
            aid = os.path.basename(sp)[:-6]
            desc = ''
            try: desc = json.load(open(sp[:-6] + '.meta.json')).get('description', '')
            except (OSError, ValueError): pass
            out.append(Agent(kind='sub', id=aid, parent=sid, name=desc or 'helper', state=sst, tool=stool,
                             model=q['model'], age=sage, look=_look(q['model'], aid, 'sub'), born=os.path.getctime(sp)))
    return out


if __name__ == '__main__':
    for a in sorted(scan(), key=lambda a: a.born): print(a)

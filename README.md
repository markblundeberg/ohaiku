# ohaiku

Haiku 5.5 on your desktop, and a taskbar of agents. After **oneko** (Masayuki Koba, 1989) and xneko, the cat that chased
the pointer around every Unix desktop of the 1990s, and **Plus! Dancer** (2003), the dancers who lived on the XP
taskbar (which BLISS brought back).

## The agents

Every Claude Code session on this machine that was active in the last two hours gets a chibi of its own model (chibi
Opus for Opus, Haiku for Haiku) with its name on a little plate, standing on the bottom edge of the screen and acting out
what it's doing:

| doing | looks like |
|---|---|
| thinking | paw on chin, a thought cloud filling with dots |
| Read, WebFetch, Skill | reading an open PROBLEM SET |
| Grep, Glob, WebSearch, ToolSearch, MCP tools | the magnifying glass |
| Edit, Write | stamping Q.E.D. on the book |
| Bash, Monitor | the drum |
| Agent, Workflow, SendMessage | tossing seed packets; the subagents appear beside it, smaller, and leave when they finish |
| AskUserQuestion, ExitPlanMode, PushNotification | waving a "?" — it wants you (blue name plate) |
| just finished | a happy bounce (green plate) |
| waiting for you | free: wanders, shimmies, :3, dances when music is playing |
| quiet for 20 minutes | lies down and sleeps with a nose bubble |
| gone for 2 hours | folds back into its flower |

Any tool not in the table does the arm-pump and is written to `~/.cache/ohaiku/unknown-tools.txt`: that's the list of
drawings still to make (add a state in `sprites/poses.js`, map it in `TOOL_POSE` in `ohaiku`, rebake).

How it knows: `agents.py` reads the tails of the transcripts in `~/.claude/projects/` (read-only; it changes nothing in
Claude Code). One honest limit: a tool call is only written to the transcript when it finishes, so while a long tool runs
the chibi shows the last tool used, and a tool waiting for your permission looks like a tool running. Claude Code hooks
could report both exactly; that would mean adding hooks to `~/.claude/settings.json`, so it isn't done.

Bring the pointer near the edge and they duck so only their hoods peek out. The name plates are the only part that
takes clicks: **click a plate** to send that one (and its subagents) away until its session wants you again, by asking
something or finishing a turn; **right-click a plate** for the menu. **Middle-click the tray icon** to hide or show
everyone (`ohaiku --toggle` does the same, for a hotkey). The tray icon (after Plus! Dancer's) has
Load Up Haiku / Load Up Opus, Play / Perch / Hide, Dance Only When Music Plays, Show Agents, and Haikus, Go Home.
Left-click it to switch between Play and Perch.

## Pets

```sh
./ohaiku              # start, and "Computer, load up Haiku." (run again to add another, with a ding)
./ohaiku --agents     # start with just the agents (for autostart)
./ohaiku --play       # everyone chases the pointer;  --perch: back to the edge;  --hide / --show
./ohaiku -n 5         # five
./ohaiku --opus       # chibi Opus joins the line
./ohaiku --quiet      # no ding
./ohaiku --scale 1.3  # bigger (when starting)
./ohaiku --quit       # Haikus, go home
./install.sh          # adds "Load Up Haiku" / "Haikus, Go Home" to the menu
```

The first Haiku is the canonical sunflower one; the rest are the other eleven flowers in random order, no two alike until
all twelve are out. In Play mode the leader chases the pointer and everyone else follows the one in front, so they make a
line. When they catch up they sit, dance or go :3, then yawn, lie down and sleep with a nose bubble (鼻提灯). Move the
pointer and the bubble pops: "!" and they're off. The ding is the music box from the end of *Load Up Haiku* (`~/git/bc1`).

Needs X11 with a compositor (Cinnamon has one), Python 3 with GTK 3 (PyGObject) and pycairo, and `paplay` for the ding.
Each Haiku is a small transparent popup window with an empty input shape, so clicks go straight through.

## Sprites

The Haikus are drawn by the real Haiku 5.5 kit from bc1/bc2 (`sprites/haiku.js`, with the PROBLEM SET ∞ engine's
`core.js`/`chars.js`), and baked to sprite sheets once, the way oneko shipped bitmaps:

```sh
cd sprites && npm install && node bake.mjs --px 160      # -> ../share/<who>/<state>.png strips + sheets.json
```

Twelve Haikus (`haiku00`..`haiku11`) and eight chibi Opuses (`opus0`..`opus7`, varied bows and hair), one strip per
state so only the states in use are loaded. `sprites/poses.js` holds the states; `node test.mjs out.png testSheet2`
draws the agent poses for a quick look. The kit gained a `read` and a `search` prop and a `pose.arms` override for this. Fable isn't here yet: Fable gets to design itself.

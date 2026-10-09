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
| waiting at a permission prompt or a dialog | the same, saying so: *may I? (permission)*, *a question for you*, *a dialog for you*... |
| hit a usage limit | a tea break, until the limit resets (*tea break: back at 5:30pm*; lavender plate) |
| an API error ended the turn (529, 500, connection lost) | dizzy, with stars, for ten minutes (*oof: 529 overloaded*; pink plate) |
| just finished | a happy bounce (green plate) |
| waiting for you | free: wanders, shimmies, :3, dances when music is playing |
| quiet for 20 minutes | lies down and sleeps with a nose bubble |
| gone for 2 hours | folds back into its flower |

The little flower at the left of each plate is the day's work: a seed until the session's first minute of work today,
then that chibi's own flower opening, bud to full bloom at about four hours (counted from the transcript: the gaps of
under two minutes between its entries, since local midnight).

Any tool not in the table does the arm-pump and is written to `~/.cache/ohaiku/unknown-tools.txt`: that's the list of
drawings still to make (add a state in `sprites/poses.js`, map it in `TOOL_POSE` in `ohaiku`, rebake).

How it knows: `agents.py` reads the tails of the transcripts in `~/.claude/projects/` and the live records in
`~/.claude/sessions/<pid>.json` (read-only; it changes nothing in Claude Code). The live record says `busy` or `idle`
right now and whether the process is still running, so a session that's open shows up however long it has been quiet, and
one you close leaves. When Claude Code is stuck on you, the record says `waiting` and what for (`waitingFor`: a
permission prompt, input needed, a dialog...); that's how a permission prompt shows without any hooks. Usage limits and
API errors come from the transcript (Claude Code writes them as synthetic assistant messages, with the reset time). A tool call is only written to the transcript when it finishes, so while a long tool runs the chibi
shows the last tool used (busy, so never mistaken for idle). Sessions without a live record (Claude Desktop) fall back to
the transcripts alone.

New pets announce themselves in an XP-style balloon: *Found New Hardware: Haiku 5.5. Your new Haiku is installed and
ready to use.* While the screen is locked they hide and hold still.

Bring the pointer near the edge and they duck so only their hoods peek out. The name plates are the only part that
takes clicks (and the whole chibi, while it's waving "?" at you):

- **click** goes to that session: it raises the terminal window Claude Code titled after the session (`✳ bc1`), using
  `wmctrl`. If there isn't one (the session lives in Claude Desktop, or was never named, so its title can't be matched),
  it opens Claude Desktop's "Sessions Waiting for You" (`claude://code/needs-input`), launching Desktop if it's closed.
- **middle-click** sends that one (and its subagents) away until its session wants you again, by asking something or
  finishing a turn;
- **right-click** for the menu. **Middle-click the tray icon** to hide or show
everyone (`ohaiku --toggle` does the same, for a hotkey). The tray icon (after Plus! Dancer's) has
Load Up Haiku / Load Up Opus, Play / Perch / Hide, Dance Only When Music Plays, Show Agents, and Haikus, Go Home.
Left-click it to switch between Play and Perch.

## Playtime: the chaos dial

| tier | what happens |
|---|---|
| **Perch** | the bottom edge; free ones wander a little; duck from the pointer |
| **Follow** | oneko: a conga line after the pointer; sleepers wake up |
| **Recess** | shimeji: they leap onto the title bars of your real windows (`world.py` reads which window tops are visible, through python-xlib), walk along them, hop between them, ride along when you drag a window, and fall off with a "!" when it closes or something covers their spot. Working agents pick a spot and keep working there. With everything maximized there are no title bars to stand on, so they play on the floor |
| **Tag** | one Haiku surfs your pointer on an XP arrow ("Cursor is now connected", after BLISS); the rest run from it, slipping along the screen edges when cornered. Touch one and it's It: it chases the pointer until it tags you back |
| **Bloomcore** | the bc1 eruption: ten more Haikus burst out of the tray and fly onto your windows, everyone dances, and one of the twelve flowers opens wherever a Haiku lands. Leaving Bloomcore folds the extras back into flowers |

**Lemmings** ("Let's go!"): `--lemmings` or the menu. A trapdoor opens above your highest window and ten small Haikus
drop out one by one and march: off window edges, down onto whatever is below, round at the screen sides, towards a
flower doorway on the floor (the green HUD counts OUT / IN / SAVED). Click one to make it a **Builder** (it stamps Q.E.D.
bricks into a staircase, then shrugs), middle-click for a **Floater** (a dandelion puff), right-click for a **Blocker**
(arms out; the others turn round). A fall from too high leaves them dazed with stars, not splatted. If you don't play
for ten seconds, a director hands out skills, so it also runs as a screensaver. **Oh No!** in the menu (`--ohno`) is the
nuke. The agents stay on the edge meanwhile.

**Petal snow** (xsnow, bloomcore edition): `--snow` or the menu, and on during Bloomcore. Petals drift down and pile up
on your title bars and the bottom edge; move or close a window and its drift slides off; Haikus running through a drift
kick it up. (About 10% of a CPU core while it's on.)

**Paper airplanes**: when one session sends another a message (SendMessage), a paper plane flies from its chibi to the
recipient's, who looks up with a "!". Recipients are found by session name, by subagent id, or by the messaging socket's
pid (via `~/.claude/sessions/<pid>.json`); planes to anyone not on screen fly off the top.

**Flying Haikus** (After Dark's Flying Toasters): after five idle minutes (`--saver N`, 0 for never) a squadron of
Haikus with petal wings glides down and to the left across the screen; move the mouse and they scatter. `--fly` or the
menu to call them up.

**Solitaire win**: when an agent finishes a stretch of work longer than eight minutes, its chibi bounces off across the
screen leaving a copy of itself every frame, like Windows Solitaire's win cascade; then the trail fades and it's back.

**Kaiju**: chibi Opus at five times the size stomps along the bottom of the screen and everyone ducks below the edge.
`--kaiju`, the menu, or, very rarely, by itself during Recess and Bloomcore.

**Clippy, but it's a Haiku**: now and then during play (at most every fifteen minutes) a Haiku looks at your active
window's title and offers help: doomscrolling, writing a song, talking to Claude, looking for a file ("Have you tried the
Recycle Bin?")... `--clippy` to ask now.

**Movie night** (after MST3K's silhouette row): `--movie` or the menu. The pets open their own window, *Haiku Theater
3000*, put on a film, muted, and three of them hop into a row of velvet cinema seats along its bottom edge, seen from
behind with headphones on: bobbing, eating popcorn, giggling, turning to whisper. The programme is
`~/.config/ohaiku/programme.txt` (written on first use): video files, folders (every video inside), or URLs (streamed
through yt-dlp), shuffled. By default it's our films and everything in `~/claude-inspo`, so BLISS gets an audience.
Drag any video onto the theater to put it on next. Films are decoded live by ffmpeg at 12 fps; a long one starts
somewhere in the middle. It's a real window: move it and they move with it, stand on it in Recess, close it and they
jump up with a "!". It never takes focus. In Recess and Bloomcore they sometimes put a film on by themselves (at most
every four minutes).

**The Peanut Gallery** (movie night, turbo; off unless you turn it on): `--gallery`, the tray's checkbox, or the menu.
The free ones in the row turn their backs to you, sit down in velvet seats along the bottom of the screen, and watch
whatever you're doing, MST3K-style. Every 15 seconds or so, and only if the screen has changed, ohaiku takes a
screenshot, blacks out what the gallery must never see, and shows it to Haiku (`claude -p --model haiku`, through your
own Claude Code login: no tools, no saved session, about 3 s and a tenth of a cent a look). Haiku is the puppeteer: it
says in a line what's on screen, gives up to two of the cast a quip (a speech bubble, and a giggle, gasp, cheer, whisper
or a popcorn handful), and now and then whispers *noted:* when something is worth keeping (an idea it sparks, a
technique, a striking bit of art or writing). It remembers the last few looks, so it can follow a film or a thread.

- **Never seen**: terminals and the Claude desktop app (where the sessions live) are always blacked out, and so is any
  window whose class or title contains a line of `~/.config/ohaiku/gallery-skip.txt`. A session whose name or folder
  matches a line there isn't in the cast, and its chibi and plate are blacked out of the screenshot too.
- **The placard** at the end of the row, PEANUT GALLERY, says it's on; its red dot lights each time it looks. Click it
  to stop. Hiding them, locking the screen or Nothing! Studying! pauses it (Nothing! Studying! turns it off).
- **Notes**: what they saw, every quip and every note go to `~/.local/share/ohaiku/gallery/<date>.md`, and when you turn
  the gallery off Haiku writes a short recap of the showing with a *Worth keeping* list ("Open the Gallery Notes" in the
  tray menu). Movie night's audience joins the cast, so a film in the theater gets riffed too.

**Nothing! Studying!** From any tier: shake the mouse hard left and right (or `--studying`, or the menu). Everyone spins
into the tray icon, silently (it's for hiding them, so no sound), and three seconds later one Haiku peeks up by the
tray. They stay hidden until you click the tray icon.

## Pets

```sh
./ohaiku              # start, and "Computer, load up Haiku." (run again to add another, with a ding)
./ohaiku --agents     # start with just the agents (for autostart)
./ohaiku --perch      # everyone on the bottom edge, out of the way (the default)
./ohaiku --follow     # everyone chases the pointer in a line, oneko-style (--play also works)
./ohaiku --recess     # they play on your windows: title bars, hops, rides, falls
./ohaiku --tag        # one surfs your pointer, the rest run;  --bloomcore: the eruption
./ohaiku --gallery    # the Peanut Gallery: they watch your screen and riff (Haiku); again to stop
./ohaiku --studying   # "Nothing! Studying!" (or shake the mouse): all vacuumed into the tray; --show brings them back
./ohaiku --hide / --show / --toggle
./ohaiku -n 5         # five
./ohaiku --opus       # chibi Opus joins the line
./ohaiku --quiet      # no ding
./ohaiku --scale 1.3  # bigger (when starting)
./ohaiku --quit       # Haikus, go home
./ohaiku --restart    # go home and come back (agents only), e.g. after a git pull
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

(`share/` is generated and gitignored; so is the Kaiju's big strip set, `node bake.mjs --px 560 --who opus0,opus3
--states runL,runR,idle --out ../share/kaiju`.) Twelve Haikus (`haiku00`..`haiku11`) and eight chibi Opuses (`opus0`..`opus7`, varied bows and hair), one strip per
state so only the states in use are loaded. `sprites/poses.js` holds the states; `node test.mjs out.png testSheet2`
draws the agent poses for a quick look (`testSheet6`: the gallery row and the tea break). A partial bake
(`--states a,b`) adds to `sheets.json` rather than replacing it. The kit gained a `read` and a `search` prop and a `pose.arms` override for this. Fable isn't here yet: Fable gets to design itself.

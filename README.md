# ohaiku

Haiku 5.5 chases your cursor. After **oneko** (Masayuki Koba, 1989) and xneko, the cat that chased the pointer around
every Unix desktop of the 1990s.

```sh
./ohaiku              # "Computer, load up Haiku." (run again to add another, with a ding)
./ohaiku -n 5         # five
./ohaiku --opus       # chibi Opus joins the line
./ohaiku --quiet      # no ding
./ohaiku --scale 1.3  # bigger (when starting)
./ohaiku --quit       # Haikus, go home
./install.sh          # adds "Load Up Haiku" / "Haikus, Go Home" to the menu
```

The first Haiku is the canonical sunflower one; the rest are the other eleven flowers in random order, no two alike until
all twelve are out. The leader chases the pointer and the others follow the one in front, so they make a line. When they
catch up they sit, dance or go :3, then yawn, lie down and sleep with a nose bubble (鼻提灯). Move the pointer and the
bubble pops: "!" and they're off. The ding is the music box from the end of *Load Up Haiku* (`~/git/bc1`).

Needs X11 with a compositor (Cinnamon has one), Python 3 with GTK 3 (PyGObject) and pycairo, and `paplay` for the ding.
Each Haiku is a small transparent popup window with an empty input shape, so clicks go straight through.

## Sprites

The Haikus are drawn by the real Haiku 5.5 kit from bc1/bc2 (`sprites/haiku.js`, with the PROBLEM SET ∞ engine's
`core.js`/`chars.js`), and baked to sprite sheets once, the way oneko shipped bitmaps:

```sh
cd sprites && npm install && node bake.mjs --px 160      # -> ../share/haiku00..11.png, opus.png, sheets.json
```

`sprites/poses.js` holds the states (idle, cat, runR/runL/runF, dance, yawn, sleep, wake, alert, spawn).
`node test.mjs out.png` draws `testSheet()` for quick looks. Fable isn't here yet: Fable gets to design itself.

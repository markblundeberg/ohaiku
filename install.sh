#!/bin/sh
# Gets the sprites (if you haven't baked your own) and adds "Load Up Haiku" and "Haikus, Go Home" to the applications menu.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SPRITES="${OHAIKU_SPRITES_URL:-https://github.com/markblundeberg/ohaiku/releases/latest/download/ohaiku-sprites.tar.gz}"
if [ ! -f "$HERE/share/sheets.json" ]; then
  echo "Fetching the sprites (about 45 MB) from $SPRITES"
  curl -fL "$SPRITES" | tar xz -C "$HERE"
fi
D="$HOME/.local/share/applications"; mkdir -p "$D"
cat > "$D/ohaiku.desktop" <<EOT
[Desktop Entry]
Type=Application
Name=Load Up Haiku
Comment=Haiku 5.5 chases your cursor. Run again for another.
Exec=$HERE/ohaiku
Icon=$HERE/sprites/icon.png
Categories=Amusement;
EOT
cat > "$D/ohaiku-home.desktop" <<EOT
[Desktop Entry]
Type=Application
Name=Haikus, Go Home
Exec=$HERE/ohaiku --quit
Icon=$HERE/sprites/icon.png
Categories=Amusement;
EOT
echo "Installed. Look for 'Load Up Haiku' in the menu, or run $HERE/ohaiku --agents"

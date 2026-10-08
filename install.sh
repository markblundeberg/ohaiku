#!/bin/sh
# Adds "Load Up Haiku" and "Haikus, Go Home" to the applications menu.
D="$HOME/.local/share/applications"; HERE="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$D"
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
echo "Installed. Look for 'Load Up Haiku' in the menu."

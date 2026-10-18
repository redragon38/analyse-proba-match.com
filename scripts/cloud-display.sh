#!/usr/bin/env bash
set -euo pipefail
if DISPLAY=:99 xdpyinfo >/dev/null 2>&1; then exit 0; fi
if ! command -v Xorg >/dev/null 2>&1; then
  echo 'Serveur X manquant : utilisez un environnement graphique ou installez Xvfb/Xorg avec le pilote dummy.' >&2
  exit 1
fi
cat > /tmp/seo-studio-xorg.conf <<'EOF'
Section "ServerFlags"
Option "AutoAddDevices" "false"
Option "DontVTSwitch" "true"
EndSection
Section "Device"
Identifier "Dummy"
Driver "dummy"
VideoRam 256000
EndSection
Section "Monitor"
Identifier "Monitor"
HorizSync 5.0-1000.0
VertRefresh 5.0-200.0
Modeline "1440x960" 116.50 1440 1528 1680 1920 960 963 973 1012
EndSection
Section "Screen"
Identifier "Screen"
Device "Dummy"
Monitor "Monitor"
DefaultDepth 24
SubSection "Display"
Depth 24
Modes "1440x960"
EndSubSection
EndSection
EOF
Xorg :99 -config /tmp/seo-studio-xorg.conf -logfile /tmp/seo-studio-xorg.log -noreset -nolisten tcp > /tmp/seo-studio-display.log 2>&1 &
echo $! > /tmp/seo-studio-display.pid
for attempt in $(seq 1 30); do
  if DISPLAY=:99 xdpyinfo >/dev/null 2>&1; then exit 0; fi
  sleep 0.2
done
cat /tmp/seo-studio-display.log >&2
exit 1

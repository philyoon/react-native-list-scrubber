#!/bin/sh
# Grabs the thumb while the list still coasts from a flick, and drags it to the end (#102): the Transcript demo,
# whose thumb sits outside the scrubber's box, over the list. On Android the coasting list takes the touch to
# stop its fling, which cancelled the drag with Gesture Handler's older gesture API: about 2 grabs in 5 on the
# emulator, so this grabs 5 times, and each must reach the end.
# Not a Maestro flow: each Maestro swipe takes seconds, and the fling is over by then. adb does the flick and the
# grab in one shell command. Android only (iOS was never affected): on iOS it does nothing.
#   coasting.sh ios|android APP LINK    as scripts/e2e.sh runs it: the app's id and the link that opens it
# MAESTRO_DEVICE picks the emulator; E2E_RETRIES=n runs it again up to n more times, as for the flows.
set -e
platform="$1"
app="$2"
link="$3"
if [ "$platform" != android ]; then
  echo "coasting.sh: Android only, skipped"
  exit 0
fi
adb_() { adb ${MAESTRO_DEVICE:+-s "$MAESTRO_DEVICE"} "$@"; }

# The screen in pixels ("Override size" when set, else "Physical size") and its density (pixels per 160 dpi)
size=$(adb_ shell wm size | tr -d '\r' | sed -n 's/.*: \([0-9]*\)x\([0-9]*\)$/\1 \2/p' | tail -1)
w=${size% *}
h=${size#* }
dpi=$(adb_ shell wm density | tr -d '\r' | sed -n 's/.*: \([0-9]*\)$/\1/p' | tail -1)
py() { echo $((h * $1 / 100)); }
# The thumb's column: src/e2e.ts pins the list card so the centre of a thumb's touch area is at x 91%; the demo
# pushes the thumb 12pt further out (src/demos.tsx)
x=$((w * 91 / 100 + 12 * dpi / 160))

# The texts on screen
screen() { adb_ exec-out uiautomator dump /dev/tty 2>/dev/null; }

# One flick and grab, on the demo opened afresh
grab() {
  adb_ shell am force-stop "$app"
  adb_ shell am start -a android.intent.action.VIEW -d "'${link}?demo=Transcript'" >/dev/null
  i=0
  until screen | grep -q 'text="Line 1 '; do
    i=$((i + 1))
    [ $i -lt 30 ] || {
      echo "coasting.sh: the Transcript demo never showed" >&2
      return 1
    }
    sleep 2
  done
  # A flick on the left, away from the thumb, then at once the thumb (the top of its track: y 28%), dragged down
  # past the end of its track. The grab is a touch-down of its own: as a single swipe it came too late now and
  # then, the list already stopped
  moves=''
  for p in 35 42 49 56 63 70 77 84 91 98; do
    moves="$moves input motionevent MOVE $x $(py $p);"
  done
  adb_ shell "input swipe $((w * 30 / 100)) $(py 83) $((w * 30 / 100)) $(py 29) 60;
    input motionevent DOWN $x $(py 28); $moves input motionevent UP $x $(py 99)"
  sleep 1
  # Near the end: a cancelled drag leaves the list where the flick took it, around line 90. Not at Line 1200
  # itself: with these few, far apart moves the list stops a little short (about line 1120), with either API
  screen | grep -qE 'text="Line 1[0-9]{3} '
}

attempt() {
  for round in 1 2 3 4 5; do
    grab || {
      echo "coasting.sh: grab $round of 5 didn't reach the end"
      return 1
    }
  done
}

tries=${E2E_RETRIES:-0}
until attempt; do
  if [ "$tries" -le 0 ]; then
    echo "[Failed] coasting: a drag grabbed while the list coasted didn't reach the end" >&2
    exit 1
  fi
  tries=$((tries - 1))
  echo "coasting.sh: running again"
done
echo "[Passed] coasting"

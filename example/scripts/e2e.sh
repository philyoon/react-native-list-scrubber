#!/bin/sh
# Runs the Maestro flows in e2e/:
#   e2e.sh ios|android [flow…]     all flows by default, or just the ones given (e.g. e2e/index.yaml)
# in Expo Go, against Metro in e2e mode (npm run e2e:start, kept running); or with E2E_APP=build, in the example
# built as an app of its own (scripts/e2e-build.sh, which installs it), with no Metro or Expo Go.
# First it runs e2e/setup/expo-go.yaml, which gets past the screens a fresh device can show.
# Flows under e2e/large-text run at the largest system text size: this script sets it on the device first
# and restores the previous size afterwards.
# MAESTRO_DEVICE picks the device when more than one is running: a simulator UDID or an emulator serial such as
# emulator-5554. It's passed to Maestro (--device), and to simctl or adb.
set -e
platform="$1"
[ $# -gt 0 ] && shift
[ $# -eq 0 ] && set -- e2e e2e/large-text

adb_() { adb ${MAESTRO_DEVICE:+-s "$MAESTRO_DEVICE"} "$@"; }
sim="${MAESTRO_DEVICE:-booted}"

# The app and the link that opens a demo in it (the flows add ?demo=…)
if [ "$E2E_APP" = build ]; then
  app_ios=com.philyoon.listscrubber.example
  app_android=com.philyoon.listscrubber.example
  link=list-scrubber-example://
else
  app_ios=host.exp.Exponent
  app_android=host.exp.exponent
  link=exp://127.0.0.1:8081/--/
fi

case "$platform" in
  ios)
    app=$app_ios
    maestro_() { maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} test -e APP_ID="$app" -e LINK="$link" "$@"; }
    large_text_on() {
      previous_size=$(xcrun simctl ui "$sim" content_size)
      xcrun simctl ui "$sim" content_size accessibility-extra-extra-extra-large
    }
    large_text_off() {
      # Closed first: an app open while the size changes back can keep a broken layout
      xcrun simctl terminate "$sim" "$app" 2>/dev/null || true
      xcrun simctl ui "$sim" content_size "$previous_size"
    }
    ;;
  android)
    app=$app_android
    # Expo Go on the emulator reaches Metro on this machine through adb
    [ "$E2E_APP" = build ] || adb_ reverse tcp:8081 tcp:8081 >/dev/null
    maestro_() { maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} test -e APP_ID="$app" -e LINK="$link" "$@"; }
    large_text_on() {
      previous_size=$(adb_ shell settings get system font_scale | tr -d '\r')
      adb_ shell settings put system font_scale 2.0
    }
    large_text_off() {
      adb_ shell am force-stop "$app"
      case "$previous_size" in
        null | '') adb_ shell settings delete system font_scale >/dev/null ;;
        *) adb_ shell settings put system font_scale "$previous_size" ;;
      esac
    }
    ;;
  *)
    echo "usage: e2e.sh ios|android [flow…]" >&2
    exit 1
    ;;
esac

# Split the flows: e2e/large-text needs the text size changed around it
normal=''
large=''
for flow in "$@"; do
  case "$flow" in
    *large-text*) large="$large $flow" ;;
    *) normal="$normal $flow" ;;
  esac
done

# What's on screen (texts and IDs), for a failure in CI where there's no screen to look at
on_screen() {
  maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} hierarchy 2>/dev/null |
    grep -oE '"(text|accessibilityText|resource-id|hintText)" ?: ?"[^"]+"' | sort -u | head -80
}

if ! setup_output=$(maestro_ e2e/setup/expo-go.yaml 2>&1); then
  echo "$setup_output"
  echo "Expo Go setup failed (e2e/setup/expo-go.yaml). On screen:" >&2
  on_screen
  exit 1
fi

status=0
if [ -n "$normal" ]; then
  # shellcheck disable=SC2086 # flow paths have no spaces
  maestro_ $normal || { status=1; on_screen; }
fi
if [ -n "$large" ]; then
  large_text_on
  trap large_text_off EXIT
  # shellcheck disable=SC2086
  maestro_ $large || status=1
fi
exit $status

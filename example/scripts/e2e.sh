#!/bin/sh
# Runs the Maestro flows in e2e/ in Expo Go, against Metro in e2e mode (npm run e2e:start, kept running).
#   e2e.sh ios|android [flow…]     all flows by default, or just the ones given (e.g. e2e/index.yaml)
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

case "$platform" in
  ios)
    # Expo Go's iOS bundle ID is the flows' default APP_ID
    maestro_() { maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} test "$@"; }
    large_text_on() {
      previous_size=$(xcrun simctl ui "$sim" content_size)
      xcrun simctl ui "$sim" content_size accessibility-extra-extra-extra-large
    }
    large_text_off() { xcrun simctl ui "$sim" content_size "$previous_size"; }
    ;;
  android)
    # Expo Go on the emulator reaches Metro on this machine through adb
    adb_ reverse tcp:8081 tcp:8081 >/dev/null
    maestro_() { maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} test -e APP_ID=host.exp.exponent "$@"; }
    large_text_on() {
      previous_size=$(adb_ shell settings get system font_scale | tr -d '\r')
      adb_ shell settings put system font_scale 2.0
    }
    large_text_off() {
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

status=0
if [ -n "$normal" ]; then
  # shellcheck disable=SC2086 # flow paths have no spaces
  maestro_ $normal || status=1
fi
if [ -n "$large" ]; then
  large_text_on
  trap large_text_off EXIT
  # shellcheck disable=SC2086
  maestro_ $large || status=1
fi
exit $status

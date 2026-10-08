#!/bin/sh
# Runs the Maestro flows in e2e/:
#   e2e.sh ios|android [flow…]     all flows by default, or just the ones given (e.g. e2e/index.yaml)
# in Expo Go, against Metro in e2e mode (npm run e2e:start, kept running); or with E2E_APP=build, in the example
# built as an app of its own (scripts/e2e-build.sh, which installs it), with no Metro or Expo Go.
# First it runs e2e/setup/expo-go.yaml, which gets past the screens a fresh device can show.
# Flows under e2e/large-text run at the largest system text size: this script sets it on the device first
# and restores the previous size afterwards.
# E2E_RETRIES=n runs a flow that failed again, up to n more times (CI uses 1).
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

# The flow files among the given paths (a folder stands for the flows in it)
flow_files() {
  for path in "$@"; do
    if [ -d "$path" ]; then ls "$path"/*.yaml; else echo "$path"; fi
  done
}

# Runs the given flows; with E2E_RETRIES=n, runs the ones that failed again, up to n more times. A flow that fails
# on timing alone on a slow simulator (CI) then passes, and a real failure still fails every time.
run() {
  out=$(mktemp)
  rc=$(mktemp)
  flows="$*"
  tries=${E2E_RETRIES:-0}
  while :; do
    # Maestro's output as it comes, and its exit code
    # shellcheck disable=SC2086 # flow paths have no spaces
    { maestro_ $flows; echo $? >"$rc"; } 2>&1 | tee "$out"
    [ "$(cat "$rc")" = 0 ] && return 0
    [ "$tries" -gt 0 ] || return 1
    tries=$((tries - 1))
    # The flows that failed, by name ("[Failed] name (…)"); a single flow's run doesn't list it
    failed=''
    for name in $(sed -n 's/^\[Failed\] \([^ ]*\).*/\1/p' "$out"); do
      # shellcheck disable=SC2086
      for file in $(flow_files $flows); do
        [ "$(basename "$file" .yaml)" = "$name" ] && failed="$failed $file"
      done
    done
    # shellcheck disable=SC2086
    [ -n "$failed" ] || [ "$(flow_files $flows | wc -l)" -ne 1 ] || failed=$flows
    [ -n "$failed" ] || return 1
    echo "Running again:$failed"
    flows=$failed
  done
}

status=0
if [ -n "$normal" ]; then
  # shellcheck disable=SC2086 # flow paths have no spaces
  run $normal || { status=1; on_screen; }
fi
if [ -n "$large" ]; then
  large_text_on
  trap large_text_off EXIT
  # shellcheck disable=SC2086
  run $large || status=1
fi
exit $status

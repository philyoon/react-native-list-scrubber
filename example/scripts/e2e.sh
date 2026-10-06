#!/bin/sh
# Runs the Maestro flows in e2e/ in Expo Go, against Metro in e2e mode (npm run e2e:start, kept running).
#   e2e.sh ios|android [flow…]     all flows in e2e/ by default, or just the ones given (e.g. e2e/index.yaml)
# MAESTRO_DEVICE picks the device when more than one is running: a simulator UDID or an emulator serial such as
# emulator-5554. It's passed to Maestro (--device) and, on Android, to adb.
set -e
platform="$1"
[ $# -gt 0 ] && shift
[ $# -eq 0 ] && set -- e2e
case "$platform" in
  ios)
    # Expo Go's iOS bundle ID is the flows' default APP_ID
    exec maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} test "$@"
    ;;
  android)
    # Expo Go on the emulator reaches Metro on this machine through adb
    adb ${MAESTRO_DEVICE:+-s "$MAESTRO_DEVICE"} reverse tcp:8081 tcp:8081
    exec maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} test -e APP_ID=host.exp.exponent "$@"
    ;;
  *)
    echo "usage: e2e.sh ios|android [flow…]" >&2
    exit 1
    ;;
esac

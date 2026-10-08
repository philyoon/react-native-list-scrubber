#!/bin/sh
# CI: starts Metro in e2e mode in the background (its output goes to metro.log) and has it build the app for
# the platform (ios or android), so the flows' first open doesn't wait for a cold build.
set -e
platform="$1"
CI=1 EXPO_PUBLIC_E2E=1 nohup npx expo start --clear >metro.log 2>&1 &
i=0
until curl -fs http://localhost:8081/status | grep -q packager-status:running; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    cat metro.log
    echo "Metro didn't start" >&2
    exit 1
  fi
  sleep 2
done
# Expo Go's own request: the manifest names the bundle
bundle=$(curl -fsS -H "expo-platform: $platform" -H 'accept: application/expo+json,application/json' \
  http://localhost:8081 | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).launchAsset.url))')
echo "Building $bundle"
curl -fsS "$bundle" -o /dev/null

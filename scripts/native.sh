#!/usr/bin/env bash
# Build, install and launch the app on the default simulator/emulator.
# Usage: scripts/native.sh <ios|android> [development|preview|production]
#   development: Debug build that loads JavaScript from Metro (start it with `npm run dev`).
#   preview/production: Release build with JavaScript embedded; runs without Metro.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

platform=${1:?Usage: native.sh <ios|android> [development|preview|production]}
variant=${2:-development}
export APP_VARIANT=$variant

# ios/ and android/ are generated from app.config.ts (never edit them by hand).
# Regenerate when the variant, app config or native dependencies change.
marker="$platform/.generated-for"
stamp="$variant $(cat app.config.ts package-lock.json plugins/*.js | shasum | cut -c1-12)"
if [[ ! -f $marker || "$(cat "$marker")" != "$stamp" ]]; then
  npx expo prebuild ${PREBUILD_FLAGS:---no-clean} --platform "$platform"
  echo "$stamp" >"$marker"
fi

device=$(scripts/boot.sh "$platform")

if [[ $platform == ios ]]; then
  args=(--device "$device" --no-bundler)
  [[ $variant == development ]] || args+=(--configuration Release)
  mkdir -p artifacts
  set +e
  npx expo run:ios "${args[@]}" 2>&1 | tee artifacts/run-ios.log
  status=${PIPESTATUS[0]}
  set -e
  # Expo's final "focus Simulator window" step needs macOS Automation permission; the app is already launched.
  if [[ $status -ne 0 ]] && grep -q "› Opening on" artifacts/run-ios.log && grep -q "System Events" artifacts/run-ios.log; then
    echo "App installed and opened (ignored Simulator window-focus error)."
    status=0
  fi
  exit "$status"
else
  args=(--device "$ANDROID_AVD" --no-bundler)
  [[ $variant == development ]] || args+=(--variant release)
  npx expo run:android "${args[@]}"
  # Gradle always names the output app-release.apk regardless of the app's display name; give
  # preview/production builds a copy named for what they actually are, easy to find and to hand off.
  if [[ $variant != development ]]; then
    apk=android/app/build/outputs/apk/release/app-release.apk
    if [[ -f $apk ]]; then
      mkdir -p artifacts
      dest="artifacts/BreatheWell-${variant}.apk"
      cp "$apk" "$dest"
      echo "APK copied to $dest"
    fi
  fi
fi

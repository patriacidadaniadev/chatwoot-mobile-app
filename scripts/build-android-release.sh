#!/usr/bin/env bash
# Gera o APK de release do zero: prebuild + assembleRelease numa sessão só.
#
# As envs EXPO_PUBLIC_* são lidas pelo Metro na hora do bundling, que acontece
# DENTRO do `gradlew assembleRelease` (task createBundleReleaseJsAndAssets) — não no
# `expo prebuild`. Rodar os dois passos em shells separados é como a URL do servidor
# e o flag de gravação já vazaram default errado para um build de verdade: a env não
# viajava do prebuild para o assemble. Este script existe para isso não repetir.
#
#   ./scripts/build-android-release.sh
#   EXPO_PUBLIC_CALL_RECORDING=1 ./scripts/build-android-release.sh   # build do spike
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}"
export EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE="${EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE:-./google-services.json}"
export EXPO_PUBLIC_CHATWOOT_BASE_URL="${EXPO_PUBLIC_CHATWOOT_BASE_URL:-https://chat.patriacidadania.com.br}"

[ -f "$EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE" ] || {
  echo "Falta $EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE — ver RELEASE.md para baixar." >&2
  exit 1
}

echo ">> prebuild (EXPO_PUBLIC_CALL_RECORDING=${EXPO_PUBLIC_CALL_RECORDING:-<desligado>})"
npx expo prebuild --platform android --clean

echo ">> assembleRelease"
(cd android && ./gradlew :app:assembleRelease --console=plain)

APK=android/app/build/outputs/apk/release/app-release.apk

echo ">> checando o que foi para dentro do bundle"
BAKED_URL=$(unzip -p "$APK" assets/index.android.bundle | strings | grep -o "chat\.patriacidadania\.com\.br" | head -1 || true)
if [ -z "$BAKED_URL" ]; then
  echo "AVISO: não encontrei chat.patriacidadania.com.br no bundle — confira a env." >&2
fi

RECORDING_FLAG=$(grep -o "captureFriendlyAudio: Boolean = [a-z]*" \
  android/app/src/main/java/br/com/patriacidadania/chatwoot/callrecording/CallRecordingAudio.kt)
echo ">> $RECORDING_FLAG"
if [ -z "${EXPO_PUBLIC_CALL_RECORDING:-}" ] && [[ "$RECORDING_FLAG" == *true* ]]; then
  echo "AVISO: build normal saindo com gravação LIGADA — isso degrada o áudio de toda chamada." >&2
fi

echo ">> pronto: $APK"

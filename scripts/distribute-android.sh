#!/usr/bin/env bash
# Sobe um APK para o Firebase App Distribution.
#
# Usa a REST API direto com um token do gcloud, em vez do firebase-tools: o
# firebase-tools quer um token de CI (legado) ou uma chave de service account, e o
# gcloud já está autenticado tanto na máquina de quem desenvolve quanto no CI
# (que faz `gcloud auth activate-service-account` antes de chamar este script).
#
#   ./scripts/distribute-android.sh app.apk "notas da versão"
set -euo pipefail

APK="${1:?uso: distribute-android.sh <caminho-do-apk> [notas]}"
NOTES="${2:-}"

PROJECT_NUMBER="${FIREBASE_PROJECT_NUMBER:-624960947942}"
QUOTA_PROJECT="${FIREBASE_QUOTA_PROJECT:-patria-cidadania-dev}"
APP_ID="${FIREBASE_APP_ID_ANDROID:-1:624960947942:android:740bcf2bc3aff9f693dd27}"
GROUP="${FIREBASE_TESTER_GROUP:-sdr}"

[ -f "$APK" ] || { echo "APK não encontrado: $APK" >&2; exit 1; }

TOKEN="$(gcloud auth print-access-token)"
API=https://firebaseappdistribution.googleapis.com
auth=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $QUOTA_PROJECT")

die_on_error() {
  python3 -c "
import json,sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except ValueError:
    print(raw[:500], file=sys.stderr); sys.exit(1)
if 'error' in d:
    print('Firebase respondeu erro:', d['error'].get('status'), '-', d['error'].get('message'), file=sys.stderr)
    sys.exit(1)
print(json.dumps(d))
"
}

echo ">> subindo $(basename "$APK") ($(du -h "$APK" | cut -f1))"
# Sem encadear parsers no mesmo pipe: quando die_on_error aborta, o parser seguinte
# receberia stdin vazio e cuspiria um traceback por cima da mensagem de erro real.
UPLOAD=$(curl -sS -X POST "${auth[@]}" \
  -H "X-Goog-Upload-File-Name: $(basename "$APK")" \
  -H "X-Goog-Upload-Protocol: raw" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$APK" \
  "$API/upload/v1/projects/$PROJECT_NUMBER/apps/$APP_ID/releases:upload" \
  | die_on_error)
OPERATION=$(printf '%s' "$UPLOAD" | python3 -c "import json,sys; print(json.load(sys.stdin)['name'])")

echo ">> processando ($OPERATION)"
RELEASE=""
for _ in $(seq 1 60); do
  RESULT=$(curl -sS "${auth[@]}" "$API/v1/$OPERATION" | die_on_error)
  DONE=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('done', False))")
  if [ "$DONE" = "True" ]; then
    RELEASE=$(echo "$RESULT" | python3 -c "
import json,sys
d = json.load(sys.stdin)
r = d.get('response', {})
# releaseResult vem quando é uma versão nova; release quando o binário já existia.
print((r.get('release') or {}).get('name', ''))
")
    break
  fi
  sleep 5
done
[ -n "$RELEASE" ] || { echo "upload não concluiu a tempo" >&2; exit 1; }
echo ">> release: $RELEASE"

if [ -n "$NOTES" ]; then
  curl -sS -X PATCH "${auth[@]}" -H "Content-Type: application/json" \
    -d "$(python3 -c "import json,sys; print(json.dumps({'releaseNotes': {'text': sys.argv[1]}}))" "$NOTES")" \
    "$API/v1/$RELEASE?updateMask=release_notes.text" | die_on_error > /dev/null
  echo ">> notas gravadas"
fi

curl -sS -X POST "${auth[@]}" -H "Content-Type: application/json" \
  -d "{\"groupAliases\":[\"$GROUP\"]}" \
  "$API/v1/$RELEASE:distribute" | die_on_error > /dev/null

echo ">> distribuído para o grupo '$GROUP'"

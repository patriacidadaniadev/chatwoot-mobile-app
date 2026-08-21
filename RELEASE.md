# Build e distribuição — fork Pátria

## Estado atual

**Firebase — já feito.** O app Android está registrado no projeto
`patria-cidadania-dev` (número `624960947942`, o mesmo onde o integration-hub roda,
apesar do nome `-dev`):

| | |
|---|---|
| Projeto | `patria-cidadania-dev` |
| App id Android | `1:624960947942:android:740bcf2bc3aff9f693dd27` |
| Package | `br.com.patriacidadania.chatwoot` |

Para baixar o `google-services.json` de novo (ele não entra no git):

```
gcloud auth login   # se necessário
TOKEN=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: patria-cidadania-dev" \
  "https://firebase.googleapis.com/v1beta1/projects/patria-cidadania-dev/androidApps/1:624960947942:android:740bcf2bc3aff9f693dd27/config" \
  | python3 -c "import json,sys,base64; d=json.load(sys.stdin); open('google-services.json','wb').write(base64.b64decode(d['configFileContents']))"
```

## O que ainda falta (ação humana)

1. **Aceitar os termos do App Distribution** — um clique em "Get started" em
   https://console.firebase.google.com/project/patria-cidadania-dev/appdistribution
   A API está habilitada, mas qualquer chamada responde
   `ToS not accepted ... for onboarding projects/624960947942` até esse clique. É o
   único bloqueio para o primeiro envio.
2. **Grupo de testers `sdr`** — criar depois do passo 1 (o workflow usa esse nome).
   Dá para fazer pelo console ou por API.
3. **Projeto Expo** — `eas login` e `eas init`. Guarde o `projectId` e a conta dona;
   viram `EXPO_PUBLIC_PROJECT_ID` e `EXPO_PUBLIC_EXPO_OWNER`. Só é necessário para o
   build na nuvem; o build local já funciona sem isso.
4. **Push** — cadastrar a chave FCM v1 do mesmo projeto Firebase no servidor Chatwoot.
   Sem isso o app builda e funciona, só não recebe notificação.
5. **Keystore de release** — o `assembleRelease` gerado pelo prebuild assina com a
   **debug keystore** (é o padrão do template do Expo, ver `android/app/build.gradle`).
   Serve para o primeiro round interno, mas antes de abrir para o time é preciso gerar
   uma keystore própria: trocar depois obriga todo mundo a desinstalar e reinstalar,
   porque o Android recusa update com assinatura diferente. No build por EAS isso é
   resolvido pelo `eas credentials`.
6. **Sentry (opcional)** — o plugin do Sentry só entra no build quando
   `EXPO_PUBLIC_SENTRY_ORG_NAME` e `EXPO_PUBLIC_SENTRY_PROJECT_NAME` estão setados.
   Sem eles o upstream instalava a task de upload de source map mesmo assim e o
   `assembleRelease` quebrava com `An organization ID or slug is required`.
7. **iOS** — registrar o app iOS no mesmo projeto Firebase e baixar o
   `GoogleService-Info.plist`, quando o iOS entrar na fila.

## Primeiro envio (depois do clique nos termos)

```
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"

# grupo de testers, uma vez
TOKEN=$(gcloud auth print-access-token)
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: patria-cidadania-dev" -H "Content-Type: application/json" \
  -d '{"displayName":"SDR"}' \
  "https://firebaseappdistribution.googleapis.com/v1/projects/624960947942/groups?groupId=sdr"

# e o envio
./scripts/distribute-android.sh \
  android/app/build/outputs/apk/release/app-release.apk "primeiro build interno"
```

Depois, adicionar os e-mails dos testers ao grupo `sdr` pelo console.

## Secrets e variables do GitHub

| Nome | Tipo | O que é |
|---|---|---|
| `EXPO_TOKEN` | secret | token de acesso da conta Expo |
| `GOOGLE_SERVICES_JSON_B64` | secret | `base64 -i google-services.json` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | secret | JSON de um service account do GCP com o papel *Firebase App Distribution Admin* |
| `FIREBASE_APP_ID_ANDROID` | secret | id do app Android no Firebase (`1:...:android:...`) |
| `EXPO_PUBLIC_CHATWOOT_BASE_URL` | variable | `https://chat.patriacidadania.com.br` |
| `EXPO_PUBLIC_PROJECT_ID` | variable | do `eas init` |
| `EXPO_PUBLIC_APP_SLUG` | variable | `patria-chatwoot-mobile` |
| `EXPO_PUBLIC_EXPO_OWNER` | variable | conta/organização Expo |

## Rodando

Ambiente local (já instalado nesta máquina): SDK do Android em
`~/Library/Android/sdk` e JDK 17 (o Gradle não aceita o 25 que é o padrão aqui).

```
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
```

- **Dev**: copiar `.env.example` para `.env`, preencher, `pnpm install`,
  `npx expo prebuild --platform android` e `pnpm run:android -d`. Não roda no Expo Go
  (o app usa módulos nativos), precisa de dev client.
- **Build local para distribuir**:
  ```
  ./scripts/build-android-release.sh
  ./scripts/distribute-android.sh android/app/build/outputs/apk/release/app-release.apk "o que mudou"
  ```
  **Não** rode `expo prebuild` e `gradlew assembleRelease` em sessões de shell
  separadas — foi assim que o primeiro build interno saiu com a URL errada e a
  gravação ligada (as envs `EXPO_PUBLIC_*` são lidas na hora do bundling, que
  acontece dentro do `assembleRelease`, não do `prebuild`). O
  `build-android-release.sh` roda os dois passos numa sessão só e confere o que
  foi parar dentro do bundle antes de dar como pronto.

  O `distribute-android.sh` fala direto com a REST API do App Distribution usando
  `gcloud auth print-access-token` — não precisa de service account nem de
  `firebase-tools` para o envio manual.
- **Build na nuvem**: `eas build --platform android --profile preview` (depende do
  `eas init`).
- **CI**: `.github/workflows/distribute-android.yml` (`workflow_dispatch` ou push na
  `custom-v4.8`) builda pela Expo e chama o mesmo `scripts/distribute-android.sh`,
  autenticando o gcloud com o service account.

## Gravação de chamada (Android)

Há um spike em `android-callrecording/` — leia o README de lá antes de mexer. Resumo:
a perna remota da chamada não tem gancho de PCM no `react-native-webrtc`, então o
spike marca a saída de áudio como `USAGE_MEDIA` para poder usar o AudioPlaybackCapture
do Android. Isso é uma troca com custo em roteamento/eco, e o objetivo do spike é
justamente medir esse custo em aparelho antes de a gente se comprometer.

Enquanto o spike não for validado, o WAV fica no cache do app e não sobe para o
Chatwoot.

## iOS

O Firebase App Distribution para iOS exige build *ad-hoc* com os UDIDs dos aparelhos
no perfil de provisionamento — cada celular novo obriga a regerar o perfil e refazer o
build. O caminho recomendado é TestFlight: `eas submit -p ios` depois de um
`eas build -p ios --profile production`. Isso depende de conta Apple Developer, que
ainda não temos aqui.

## Sincronizar com o upstream

```
git fetch upstream
git merge upstream/develop     # ou rebase, se a branch ainda não foi compartilhada
```

Nossos commits são poucos e concentrados; o `.circleci/config.yml` do upstream é
deixado intocado justamente para não conflitar.

## Notas do primeiro build local

- APK de release: `android/app/build/outputs/apk/release/app-release.apk`, ~119 MB.
  O tamanho vem de empacotar as quatro ABIs mais o ffmpeg-kit. Para encolher num
  build de distribuição:
  `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64`
  (arm64 cobre os celulares, x86_64 mantém emulador funcionando).
- O R8 renomeia `CallRecordingAudio`/`CallRecordingPackage`, o que é esperado — nada
  ali usa reflexão. O `CallRecordingModule` mantém o nome porque as regras do
  React Native preservam classes com `@ReactMethod`.

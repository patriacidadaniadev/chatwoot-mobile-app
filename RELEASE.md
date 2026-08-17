# Build e distribuição — fork Pátria

O que já está no repositório e o que ainda depende de credencial de humano.

## O que falta configurar (uma vez)

1. **Projeto Expo** — `eas login` e `eas init` na raiz deste repo. Guarde o
   `projectId` e a conta dona; eles viram as variáveis `EXPO_PUBLIC_PROJECT_ID` e
   `EXPO_PUBLIC_EXPO_OWNER`.
2. **Projeto Firebase** — registrar dois apps com os ids que o `app.config.ts` usa:
   - Android: `br.com.patriacidadania.chatwoot`
   - iOS: `br.com.patriacidadania.chatwoot`

   Baixar `google-services.json` e `GoogleService-Info.plist`. Eles **não** entram no
   git (já estão no `.gitignore`) — em dev ficam na raiz, no CI vêm de secret.
3. **Push** — cadastrar a chave FCM v1 do mesmo projeto Firebase no servidor
   Chatwoot. Sem isso o app builda e funciona, só não recebe notificação.
4. **Grupo de testers** — criar o grupo `sdr` no Firebase App Distribution (é o nome
   usado no workflow).

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

- **Dev**: copiar `.env.example` para `.env`, preencher, `pnpm install` e
  `pnpm run:ios -d` / `pnpm run:android -d`. É preciso um dev client (o app usa
  módulos nativos, não roda no Expo Go): `npx expo prebuild` na primeira vez.
- **Build interno manual**: `eas build --platform android --profile preview`.
- **CI**: `.github/workflows/distribute-android.yml` (`workflow_dispatch` ou push na
  `custom-v4.8`) builda e publica no Firebase App Distribution.

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

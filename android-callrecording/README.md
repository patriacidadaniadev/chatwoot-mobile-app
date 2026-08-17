# Gravação de chamada no Android — spike

## Por que isso é um spike e não a solução

Gravar a chamada do jeito que o desktop grava **não existe** no React Native. Verifiquei
no artefato de verdade (`org.jitsi:webrtc:124.0.0`, que é o que o `react-native-webrtc`
usa no Android):

- `JavaAudioDeviceModule.Builder` tem `setSamplesReadyCallback` → **o microfone do
  agente é capturável por API pública**;
- **não existe** `AudioTrackSink` no jar, e o Builder não tem nenhum callback do lado
  de playback → **a perna remota não tem gancho**. `WebRtcAudioTrack` é package-private.
- o `react-native-webrtc` também não expõe nada: o único `addSink` dele é de vídeo.

O único caminho por API pública para a perna remota é o **AudioPlaybackCapture** do
Android (API 29+), que captura o áudio que o próprio app está tocando. Só que ele
**nunca** captura `USAGE_VOICE_COMMUNICATION` — que é exatamente como o WebRTC marca o
áudio de chamada.

Daí a troca que este spike faz: `CallRecordingAudio.kt` injeta um `AudioDeviceModule`
com a saída marcada como `USAGE_MEDIA` + `ALLOW_CAPTURE_BY_ALL`. Isso desbloqueia a
captura, mas tira o áudio do stream de chamada — o que pode mexer em roteamento (fone
vs alto-falante), no volume (passa a ser o de mídia) e no cancelamento de eco.

## O que o teste em aparelho precisa responder

1. **A chamada continua boa?** Ligar de verdade e ouvir: o áudio sai no fone ao
   encostar no ouvido? O volume responde ao botão? O contato escuta eco?
2. **A captura traz voz?** O `PlaybackCapture` loga `capturado N bytes, leituras
   silenciosas: M`. Se quase toda leitura for silenciosa, a abordagem morreu.

Se as duas passarem, o que falta é mixar com o microfone (o
`setSamplesReadyCallback` já está disponível), transcodificar com o
`ffmpeg-kit-react-native` que o app já traz, e subir em
`POST whatsapp_calls/:id/upload_recording` (o endpoint só anexa um arquivo à mensagem
da chamada e é idempotente).

Se falharem, o caminho é gravar no servidor: um media server entre o app e a Meta.
Isso resolve Android, iOS e desktop de uma vez e não depende de hack de cliente.

## Como rodar o teste

```
cp .env.example .env         # e preencher
npx expo prebuild --platform android --clean
pnpm run:android -d
```

Ligar para um contato que já deu permissão de chamada. Na primeira ligação o Android
pede consentimento de captura (vale para a sessão inteira do app).

Ver o resultado:

```
adb logcat -s PlaybackCapture CallRecordingAudio ReactNativeJS
# puxar o WAV:
adb exec-out run-as br.com.patriacidadania.chatwoot cat cache/call-<id>.wav > call.wav
```

Para comparar o áudio com e sem a troca de `AudioAttributes`, inverter
`captureFriendlyAudio` em `CallRecordingAudio.kt` e refazer o build. Com `false` o
áudio volta a `USAGE_VOICE_COMMUNICATION` (chamada normal) e a captura passa a gravar
só silêncio — é a comparação que interessa.

## Arquivos

| Arquivo | O quê |
|---|---|
| `CallRecordingAudio.kt` | injeta o `AudioDeviceModule` com os `AudioAttributes` capturáveis |
| `PlaybackCapture.kt` | `AudioRecord` com `AudioPlaybackCaptureConfiguration`, grava WAV e conta silêncio |
| `CallRecordingModule.kt` | ponte de JS: consentimento, start, stop |
| `CallRecordingPackage.kt` | registro do módulo |

O `../with-call-recording.js` copia isso para o projeto gerado, acrescenta as
permissões de foreground service e edita o `MainApplication.kt`. O
`MediaProjectionService` (com `foregroundServiceType="mediaProjection"`) já vem
declarado no manifest do `react-native-webrtc` — só reaproveitamos.

> O `CallRecordingAudio.install()` roda logo depois do `SoLoader.init` e chama
> `PeerConnectionFactory.initialize` por conta própria: criar o ADM passa por JNI, e o
> `WebRTCModule` só inicializa a lib nativa **depois** de ler
> `options.audioDeviceModule` (`WebRTCModule.java:69-81`).

## Ligando o modo de captura

O padrão é **desligado**: sem o flag, o áudio da chamada fica em
`USAGE_VOICE_COMMUNICATION` (comportamento correto) e a captura grava silêncio. Isso
existe para o build normal não degradar o áudio de quem só quer ligar.

```
EXPO_PUBLIC_CALL_RECORDING=1 npx expo prebuild --platform android --clean
```

O `with-call-recording.js` troca `captureFriendlyAudio` para `true` na cópia do fonte.
Para o A/B, gerar os dois builds e comparar a mesma ligação.

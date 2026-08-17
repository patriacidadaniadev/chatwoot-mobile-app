import { NativeModules, Platform } from 'react-native';

/**
 * SPIKE — gravação da chamada no Android.
 *
 * A perna remota não tem gancho de PCM no react-native-webrtc, então o único caminho
 * por API pública é o AudioPlaybackCapture: o módulo nativo marca a saída do WebRTC
 * como USAGE_MEDIA (em vez de VOICE_COMMUNICATION) e captura o próprio playback do
 * app. Ver android-callrecording/CallRecordingAudio.kt.
 *
 * Este spike existe para responder duas coisas em aparelho real:
 *   1. a chamada continua soando bem fora do modo de comunicação (roteamento, volume,
 *      eco)?
 *   2. a captura traz voz de verdade, ou só silêncio?
 *
 * Enquanto isso não estiver respondido, o WAV fica no cache e só é logado — não mixa
 * com o microfone nem sobe para o Chatwoot.
 */

type CallRecordingNative = {
  requestConsent(): Promise<boolean>;
  start(callId: number): Promise<string>;
  stop(): Promise<string | null>;
};

const native = NativeModules.CallRecording as CallRecordingNative | undefined;

const isSupported = Platform.OS === 'android' && Boolean(native);

export const callRecorder = {
  isSupported,

  /** Abre o diálogo de captura do Android. Vale para a sessão inteira do app. */
  async requestConsent(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.requestConsent();
    } catch {
      return false;
    }
  },

  async start(callId: number): Promise<void> {
    if (!native) return;
    try {
      const path = await native.start(callId);
      // eslint-disable-next-line no-console
      console.log('[call-recording] gravando em', path);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[call-recording] não consegui começar a gravar', error);
    }
  },

  /** Devolve o caminho do WAV, ou null se não houve gravação. */
  async stop(): Promise<string | null> {
    if (!native) return null;
    try {
      const path = await native.stop();
      // eslint-disable-next-line no-console
      console.log('[call-recording] gravação encerrada:', path ?? 'nada gravado');
      return path;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[call-recording] falha ao encerrar a gravação', error);
      return null;
    }
  },
};

export default callRecorder;

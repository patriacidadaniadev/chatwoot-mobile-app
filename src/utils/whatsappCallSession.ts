import { PermissionsAndroid, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import {
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';

import { CallService } from '@/store/call/callService';
import { VOICE_CALL_OUTBOUND_INIT_STATUS, type InitiateCallResponse } from '@/store/call/callTypes';

/**
 * Port de `dashboard/composables/useWhatsappCallSession.js` (só a perna de saída).
 *
 * Estado no escopo do módulo, e não em Redux ou num hook, pelo mesmo motivo do
 * desktop: os handlers do ActionCable disparam fora do React e precisam alcançar a
 * PeerConnection viva. O Redux fica só com o estado de UI.
 *
 * Diferenças em relação ao desktop, todas por limitação da plataforma:
 * - não há elemento <audio>: o react-native-webrtc toca o áudio remoto sozinho pela
 *   sessão nativa;
 * - não há gravação: o pacote não expõe MediaRecorder, AudioContext nem sink de PCM,
 *   então não dá para capturar a perna remota no aparelho. O desktop continua gravando.
 *
 * ponytail: sem equivalente do beacon de `beforeunload` do desktop. Se o app for morto
 * no meio da chamada, nada manda o terminate e a chamada fica de pé na Meta até o
 * timeout da operadora (~60s). Não dá para amarrar isso no AppState: no iOS o modo de
 * áudio em segundo plano é justamente o que mantém a chamada viva ao trocar de app.
 * Upgrade: terminate a partir de um handler nativo de app-terminate.
 */

let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let activeCallId: number | null = null;
let isInitiating = false;

/**
 * `voice_call.outbound_connected` (única fonte do SDP answer) é transmitido para a
 * conta inteira e pode chegar antes de o /initiate devolver o nosso call id. Até
 * saber qual chamada é nossa não dá para distinguir a resposta de um colega, então o
 * handler do cable bufferiza por call id (um slot só deixaria o evento de outro
 * agente sobrescrever o nosso) e o initiate descarrega o que casar.
 */
const pendingOutboundAnswers = new Map<number, string>();

const ICE_GATHER_TIMEOUT_MS = 10000;

// A chamada de saída não tem ice_servers vindos do backend (a chamada ainda não
// existe na hora do offer). Sem STUN só saem candidatos de host e a mídia morre
// silenciosamente em qualquer NAT que não seja trivial.
const DEFAULT_OUTBOUND_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const waitForIceGatheringComplete = (peer: RTCPeerConnection): Promise<void> =>
  new Promise(resolve => {
    if (peer.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      peer.onicegatheringstatechange = null;
      resolve();
    };
    const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
    // A tipagem do react-native-webrtc só expõe o handler; `addEventListener` existe
    // em runtime mas não no .d.ts.
    peer.onicegatheringstatechange = () => {
      if (peer.iceGatheringState === 'complete') finish();
    };
  });

const cleanup = () => {
  localStream?.getTracks().forEach(track => track.stop());
  pc?.close();
  try {
    InCallManager.stop();
  } catch {
    /* noop */
  }

  pc = null;
  localStream = null;
  activeCallId = null;
  pendingOutboundAnswers.clear();
};

export const hasActiveWhatsappCall = (): boolean => Boolean(activeCallId || pc);

export const isLocalWhatsappCall = (callId?: number): boolean =>
  Boolean(callId) && activeCallId != null && callId === activeCallId;

// No iOS o próprio getUserMedia levanta o prompt do sistema; no Android ele só
// falha se RECORD_AUDIO não estiver concedida.
const ensureMicrophonePermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

const prepareOutboundOffer = async (): Promise<string> => {
  cleanup();
  if (!(await ensureMicrophonePermission())) {
    throw new Error('microphone-permission-denied');
  }
  localStream = (await mediaDevices.getUserMedia({
    audio: true,
    video: false,
  })) as MediaStream;

  InCallManager.start({ media: 'audio' });
  InCallManager.setForceSpeakerphoneOn(false);

  pc = new RTCPeerConnection({ iceServers: DEFAULT_OUTBOUND_ICE_SERVERS });
  localStream.getTracks().forEach(track => pc?.addTrack(track, localStream as MediaStream));

  // A implementação RN é mais estrita que a do browser quanto ao argumento.
  const offer = await pc.createOffer({});
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  return pc.localDescription?.sdp ?? '';
};

/**
 * Trava no escopo do módulo + guarda de sessão ativa: um segundo toque não pode
 * derrubar o setup em andamento pelo cleanup() do prepareOutboundOffer.
 */
export const initiateOutboundCall = async (
  conversationId: number,
): Promise<InitiateCallResponse> => {
  if (isInitiating || hasActiveWhatsappCall()) {
    return { status: VOICE_CALL_OUTBOUND_INIT_STATUS.LOCKED };
  }
  isInitiating = true;
  try {
    const sdpOffer = await prepareOutboundOffer();
    const response = await CallService.initiate({ conversationId, sdpOffer });

    if (response?.id) {
      activeCallId = response.id;
      // Um connect que chegou na frente desta resposta ficou bufferizado: aplica o
      // nosso por id e descarta o resto (chamada de colega não é nossa para aplicar).
      const buffered = pendingOutboundAnswers.get(activeCallId);
      pendingOutboundAnswers.clear();
      if (buffered) {
        await pc?.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: buffered }),
        );
      }
      return response;
    }

    // Sem call id: é o caminho de pedido de permissão. O microfone e a
    // PeerConnection só servem depois que o contato aceitar e o agente tentar de
    // novo — libera agora.
    cleanup();
    return response;
  } catch (error) {
    cleanup();
    // O backend devolve 422 quando o contato não optou por receber chamadas.
    // Devolvemos no formato normal de resposta para a UI mostrar o aviso certo em
    // vez de um erro.
    const data = (error as { response?: { data?: InitiateCallResponse } })?.response?.data;
    if (
      data?.status === VOICE_CALL_OUTBOUND_INIT_STATUS.PERMISSION_REQUESTED ||
      data?.status === VOICE_CALL_OUTBOUND_INIT_STATUS.PERMISSION_PENDING
    ) {
      return { status: data.status, conversation_id: data.conversation_id };
    }
    throw error;
  } finally {
    isInitiating = false;
  }
};

/**
 * `callIdOverride` vem do slice de chamada. O `activeCallId` do módulo pode já estar
 * nulo depois de um cleanup, mas a chamada continua viva na Meta e precisa ser
 * encerrada mesmo assim.
 */
export const endActiveCall = async (callIdOverride?: number): Promise<void> => {
  const callId = activeCallId ?? callIdOverride;
  if (!callId) {
    cleanup();
    return;
  }
  try {
    await CallService.terminate(callId).catch(() => {});
  } finally {
    cleanup();
  }
};

/**
 * A regra de roteamento do SDP answer, isolada porque é a parte que erra fácil:
 * o evento é transmitido para a conta inteira e pode chegar antes de sabermos o
 * nosso call id.
 */
export type OutboundAnswerRouting = 'ignore' | 'buffer' | 'apply';

export const routeOutboundAnswer = ({
  hasPeerConnection,
  activeCallId: currentCallId,
  callId,
}: {
  hasPeerConnection: boolean;
  activeCallId: number | null;
  callId: number;
}): OutboundAnswerRouting => {
  // Sem PeerConnection neste aparelho: a chamada não é nossa.
  if (!hasPeerConnection) return 'ignore';
  // O /initiate ainda não devolveu o nosso call id (o connect passou na frente).
  // Bufferiza; o initiate descarrega por id quando souber qual é a nossa, então a
  // resposta de um colega nunca é aplicada.
  if (currentCallId == null) return 'buffer';
  return callId === currentCallId ? 'apply' : 'ignore';
};

/** Chamado pelo handler de `voice_call.outbound_connected`. */
export const applyOutboundAnswer = async (callId: number, sdpAnswer: string): Promise<void> => {
  const routing = routeOutboundAnswer({ hasPeerConnection: Boolean(pc), activeCallId, callId });
  if (routing === 'ignore') return;
  if (routing === 'buffer') {
    pendingOutboundAnswers.set(callId, sdpAnswer);
    return;
  }
  await pc?.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: sdpAnswer }));
};

export const cleanupWhatsappSession = (): void => cleanup();

export const setWhatsappCallMuted = (muted: boolean): boolean => {
  if (!localStream) return false;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !muted;
  });
  return muted;
};

export const setWhatsappCallSpeaker = (speakerOn: boolean): boolean => {
  InCallManager.setForceSpeakerphoneOn(speakerOn);
  return speakerOn;
};

/** Só para os testes: zera o estado de módulo entre casos. */
export const __resetWhatsappCallSessionForTests = () => {
  pc = null;
  localStream = null;
  activeCallId = null;
  isInitiating = false;
  pendingOutboundAnswers.clear();
};

export const VOICE_CALL_PROVIDER_WHATSAPP = 'whatsapp';

export const VOICE_CALL_OUTBOUND_INIT_STATUS = {
  LOCKED: 'locked',
  PERMISSION_REQUESTED: 'permission_requested',
  PERMISSION_PENDING: 'permission_pending',
} as const;

export type VoiceCallOutboundInitStatus =
  (typeof VOICE_CALL_OUTBOUND_INIT_STATUS)[keyof typeof VOICE_CALL_OUTBOUND_INIT_STATUS];

/**
 * Resposta do POST whatsapp_calls/initiate. Pode voltar **sem** `id`: nesse caso o
 * contato ainda não deu permissão de chamada e o backend mandou o template de
 * permissão em vez de abrir a chamada.
 */
export interface InitiateCallResponse {
  id?: number;
  call_id?: string;
  conversation_id?: number;
  status?: VoiceCallOutboundInitStatus | string;
}

export interface InitiateCallPayload {
  conversationId: number;
  sdpOffer: string;
}

/** Payload comum de todo evento `voice_call.*` no cable. */
export interface VoiceCallEvent {
  account_id: number;
  id: number;
  call_id: string;
  provider: string;
  conversation_id: number;
  sdp_answer?: string;
  status?: string;
  duration_seconds?: number;
}

export type CallUiStatus = 'connecting' | 'ringing' | 'active';

export interface ActiveCall {
  /** id do registro Call no Chatwoot — é o que os endpoints /whatsapp_calls/:id usam */
  callId: number;
  /** id da chamada na Meta */
  callSid?: string;
  conversationId: number;
  contactName?: string;
  status: CallUiStatus;
  /** epoch em ms de quando o contato atendeu, para o cronômetro */
  acceptedAt?: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
}

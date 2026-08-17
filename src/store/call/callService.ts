import { apiService } from '@/services/APIService';
import { SKIP_ERROR_TOAST_HEADER } from '@/services/APIService';
import type { InitiateCallPayload, InitiateCallResponse } from './callTypes';

export class CallService {
  /**
   * O 422 de `permission_requested` / `permission_pending` é fluxo normal (o contato
   * ainda não optou por receber chamadas), então esta é a única rota que desliga o
   * toast genérico de erro do interceptor.
   */
  static async initiate({
    conversationId,
    sdpOffer,
  }: InitiateCallPayload): Promise<InitiateCallResponse> {
    const response = await apiService.post<InitiateCallResponse>(
      'whatsapp_calls/initiate',
      { conversation_id: conversationId, sdp_offer: sdpOffer },
      { headers: { [SKIP_ERROR_TOAST_HEADER]: 'true' } },
    );
    return response.data;
  }

  static async terminate(callId: number): Promise<void> {
    await apiService.post(`whatsapp_calls/${callId}/terminate`);
  }
}

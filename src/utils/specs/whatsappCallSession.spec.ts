import { PermissionsAndroid } from 'react-native';

import { CallService } from '@/store/call/callService';
import { VOICE_CALL_OUTBOUND_INIT_STATUS } from '@/store/call/callTypes';
import {
  __resetWhatsappCallSessionForTests,
  applyOutboundAnswer,
  endActiveCall,
  hasActiveWhatsappCall,
  initiateOutboundCall,
  isLocalWhatsappCall,
  routeOutboundAnswer,
} from '../whatsappCallSession';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RTCPeerConnection } = require('react-native-webrtc');

jest.mock('@/store/call/callService', () => ({
  CallService: {
    initiate: jest.fn(),
    terminate: jest.fn().mockResolvedValue(undefined),
  },
}));

const initiateMock = CallService.initiate as jest.Mock;
const terminateMock = CallService.terminate as jest.Mock;

// O guard de microfone só roda no Android; sob o jest-expo (Platform.OS === 'ios')
// ele passa direto, mas o spy evita depender do módulo nativo se isso mudar.
const requestPermissionMock = jest
  .spyOn(PermissionsAndroid, 'request')
  .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

const waitFor = async (predicate: () => boolean, tries = 50) => {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('waitFor: condição não foi satisfeita');
};

describe('routeOutboundAnswer', () => {
  it('ignores the event when this device has no peer connection', () => {
    expect(routeOutboundAnswer({ hasPeerConnection: false, activeCallId: null, callId: 7 })).toBe(
      'ignore',
    );
  });

  it('buffers while our own call id is still unknown', () => {
    expect(routeOutboundAnswer({ hasPeerConnection: true, activeCallId: null, callId: 7 })).toBe(
      'buffer',
    );
  });

  it('applies only the answer for our own call', () => {
    expect(routeOutboundAnswer({ hasPeerConnection: true, activeCallId: 7, callId: 7 })).toBe(
      'apply',
    );
    expect(routeOutboundAnswer({ hasPeerConnection: true, activeCallId: 7, callId: 8 })).toBe(
      'ignore',
    );
  });
});

describe('initiateOutboundCall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestPermissionMock.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    __resetWhatsappCallSessionForTests();
  });

  it('sends the gathered SDP offer and keeps the returned call id as ours', async () => {
    initiateMock.mockResolvedValue({ id: 42, call_id: 'meta-42' });

    const response = await initiateOutboundCall(9);

    expect(initiateMock).toHaveBeenCalledWith({ conversationId: 9, sdpOffer: 'mock-offer-sdp' });
    expect(response.id).toBe(42);
    expect(hasActiveWhatsappCall()).toBe(true);
    expect(isLocalWhatsappCall(42)).toBe(true);
    expect(isLocalWhatsappCall(43)).toBe(false);
  });

  it('refuses a second call while one is already live', async () => {
    initiateMock.mockResolvedValue({ id: 42, call_id: 'meta-42' });
    await initiateOutboundCall(9);

    const second = await initiateOutboundCall(9);

    expect(second).toEqual({ status: VOICE_CALL_OUTBOUND_INIT_STATUS.LOCKED });
    expect(initiateMock).toHaveBeenCalledTimes(1);
  });

  it('turns the 422 permission response into a normal result and releases the mic', async () => {
    initiateMock.mockRejectedValue({
      response: {
        data: {
          status: VOICE_CALL_OUTBOUND_INIT_STATUS.PERMISSION_REQUESTED,
          conversation_id: 9,
        },
      },
    });

    const response = await initiateOutboundCall(9);

    expect(response).toEqual({
      status: VOICE_CALL_OUTBOUND_INIT_STATUS.PERMISSION_REQUESTED,
      conversation_id: 9,
    });
    expect(hasActiveWhatsappCall()).toBe(false);
  });

  it('releases the session when the backend answers without a call id', async () => {
    initiateMock.mockResolvedValue({ status: 'permission_pending' });

    await initiateOutboundCall(9);

    expect(hasActiveWhatsappCall()).toBe(false);
  });

  it('rethrows anything that is not the permission branch', async () => {
    initiateMock.mockRejectedValue(new Error('boom'));

    await expect(initiateOutboundCall(9)).rejects.toThrow('boom');
    expect(hasActiveWhatsappCall()).toBe(false);
  });
});

describe('applyOutboundAnswer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestPermissionMock.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    RTCPeerConnection.instances.length = 0;
    __resetWhatsappCallSessionForTests();
  });

  it('drops the answer when no call is in flight on this device', async () => {
    await expect(applyOutboundAnswer(1, 'sdp')).resolves.toBeUndefined();
  });

  it('applies a buffered answer exactly once, and only the one matching our call id', async () => {
    let resolveInitiate: (value: unknown) => void = () => {};
    initiateMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveInitiate = resolve;
        }),
    );

    const inFlight = initiateOutboundCall(9);
    // Espera o prepareOutboundOffer terminar e o /initiate ficar pendurado — contar
    // microtasks aqui quebra sempre que a cadeia de awaits do módulo muda.
    await waitFor(() => initiateMock.mock.calls.length > 0);

    // Dois connects chegam antes de sabermos o nosso id: o nosso e o de um colega.
    await applyOutboundAnswer(42, 'our-answer');
    await applyOutboundAnswer(99, 'someone-elses-answer');

    resolveInitiate({ id: 42, call_id: 'meta-42' });
    await inFlight;

    // Só o nosso é aplicado, e uma vez só.
    const pc = RTCPeerConnection.instances.at(-1);
    expect(pc.setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(pc.setRemoteDescription.mock.calls[0][0]).toMatchObject({
      type: 'answer',
      sdp: 'our-answer',
    });

    // Um connect atrasado de outro agente continua sendo descartado.
    await applyOutboundAnswer(99, 'someone-elses-answer');
    expect(pc.setRemoteDescription).toHaveBeenCalledTimes(1);
  });
});

describe('endActiveCall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestPermissionMock.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    __resetWhatsappCallSessionForTests();
  });

  it('terminates on Meta and tears the session down', async () => {
    initiateMock.mockResolvedValue({ id: 42, call_id: 'meta-42' });
    await initiateOutboundCall(9);

    await endActiveCall();

    expect(terminateMock).toHaveBeenCalledWith(42);
    expect(hasActiveWhatsappCall()).toBe(false);
  });

  it('still terminates using the id from the store when the local session was already wiped', async () => {
    await endActiveCall(77);
    expect(terminateMock).toHaveBeenCalledWith(77);
  });
});

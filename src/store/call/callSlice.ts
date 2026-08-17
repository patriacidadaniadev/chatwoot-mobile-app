import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { ActiveCall } from './callTypes';

/**
 * Um slot só. O store do desktop guarda um array porque o dashboard também toca para
 * chamadas recebidas; no celular só existe chamada de saída, uma por vez.
 */
export interface CallState {
  call: ActiveCall | null;
  isInitiating: boolean;
}

const initialState: CallState = {
  call: null,
  isInitiating: false,
};

const callSlice = createSlice({
  name: 'call',
  initialState,
  reducers: {
    setInitiating: (state, action: PayloadAction<boolean>) => {
      state.isInitiating = action.payload;
    },
    setCall: (state, action: PayloadAction<ActiveCall>) => {
      state.call = action.payload;
    },
    // Meta manda status=ACCEPTED quando o contato atende de verdade — é aqui que o
    // cronômetro começa, não no connect (que chega ~20s antes, ainda chamando).
    setCallAccepted: (state, action: PayloadAction<{ callId: number; acceptedAt: number }>) => {
      if (state.call?.callId !== action.payload.callId) return;
      state.call.status = 'active';
      state.call.acceptedAt = action.payload.acceptedAt;
    },
    setCallMuted: (state, action: PayloadAction<boolean>) => {
      if (state.call) state.call.isMuted = action.payload;
    },
    setCallSpeaker: (state, action: PayloadAction<boolean>) => {
      if (state.call) state.call.isSpeakerOn = action.payload;
    },
    clearCall: state => {
      state.call = null;
      state.isInitiating = false;
    },
  },
});

export const selectActiveCall = (state: RootState) => state.call.call;
export const selectIsInitiatingCall = (state: RootState) => state.call.isInitiating;
export const selectHasActiveCall = (state: RootState) => state.call.call !== null;

export const { setInitiating, setCall, setCallAccepted, setCallMuted, setCallSpeaker, clearCall } =
  callSlice.actions;

export default callSlice.reducer;

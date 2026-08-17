import React, { useEffect, useState } from 'react';
import { Pressable, StatusBar, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { Icon } from '@/components-next';
import { CallIcon } from '@/svg-icons';
import { tailwind } from '@/theme';
import i18n from '@/i18n';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { clearCall, selectActiveCall, setCallMuted, setCallSpeaker } from '@/store/call/callSlice';
import {
  endActiveCall,
  setWhatsappCallMuted,
  setWhatsappCallSpeaker,
} from '@/utils/whatsappCallSession';
import callRecorder from '@/utils/callRecorder';

const i18nPrefix = 'CONVERSATION.CALL';

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const CallDuration = ({ acceptedAt }: { acceptedAt: number }) => {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - acceptedAt) / 1000));

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - acceptedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [acceptedAt]);

  return (
    <Animated.Text style={tailwind.style('pt-2 text-base font-inter-420-20 text-gray-300')}>
      {formatDuration(elapsed)}
    </Animated.Text>
  );
};

type CallActionProps = {
  label: string;
  isOn?: boolean;
  isDestructive?: boolean;
  onPress: () => void;
};

const CallAction = ({ label, isOn, isDestructive, onPress }: CallActionProps) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={tailwind.style(
      'items-center justify-center rounded-full h-16 w-16',
      isDestructive ? 'bg-ruby-800' : isOn ? 'bg-white' : 'bg-blackA-A9',
    )}>
    <Animated.Text
      numberOfLines={1}
      style={tailwind.style(
        'text-cxs font-inter-medium-24 text-center px-1',
        isDestructive ? 'text-white' : isOn ? 'text-gray-950' : 'text-white',
      )}>
      {label}
    </Animated.Text>
  </Pressable>
);

/**
 * Tela cheia da chamada de saída pelo WhatsApp. Sem gesto de fechar de propósito:
 * no Android, sair da tela manda o app para o fundo e o sistema corta o microfone
 * (API 30+ exige foreground service, que ainda não temos).
 */
export const CallScreen = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const call = useAppSelector(selectActiveCall);

  // Quando o cable encerra a chamada, o slice zera e a tela precisa sair sozinha.
  useEffect(() => {
    if (!call && navigation.canGoBack()) navigation.goBack();
  }, [call, navigation]);

  if (!call) return null;

  const handleToggleMute = () => {
    const next = !call.isMuted;
    setWhatsappCallMuted(next);
    dispatch(setCallMuted(next));
  };

  const handleToggleSpeaker = () => {
    const next = !call.isSpeakerOn;
    setWhatsappCallSpeaker(next);
    dispatch(setCallSpeaker(next));
  };

  const handleHangUp = async () => {
    await callRecorder.stop();
    await endActiveCall(call.callId);
    dispatch(clearCall());
  };

  return (
    <SafeAreaView style={tailwind.style('flex-1 bg-gray-950')}>
      <StatusBar barStyle="light-content" />
      <View style={tailwind.style('flex-1 items-center justify-center gap-2')}>
        <Icon icon={<CallIcon fill="white" />} size={48} />
        <Animated.Text
          numberOfLines={1}
          style={tailwind.style('pt-6 text-[22px] font-inter-medium-24 text-white px-8')}>
          {call.contactName || i18n.t(`${i18nPrefix}.UNKNOWN_CONTACT`)}
        </Animated.Text>
        {call.status === 'active' && call.acceptedAt ? (
          <CallDuration acceptedAt={call.acceptedAt} />
        ) : (
          <Animated.Text style={tailwind.style('pt-2 text-base font-inter-420-20 text-gray-300')}>
            {i18n.t(`${i18nPrefix}.RINGING`)}
          </Animated.Text>
        )}
      </View>

      <View style={tailwind.style('flex-row items-center justify-center gap-6 pb-12')}>
        <CallAction
          label={i18n.t(`${i18nPrefix}.MUTE`)}
          isOn={call.isMuted}
          onPress={handleToggleMute}
        />
        <CallAction label={i18n.t(`${i18nPrefix}.HANG_UP`)} isDestructive onPress={handleHangUp} />
        <CallAction
          label={i18n.t(`${i18nPrefix}.SPEAKER`)}
          isOn={call.isSpeakerOn}
          onPress={handleToggleSpeaker}
        />
      </View>
    </SafeAreaView>
  );
};

export default CallScreen;

import React from 'react';
import { Pressable } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';

import { Icon } from '@/components-next';
import { AddIcon } from '@/svg-icons';
import { TAB_BAR_HEIGHT } from '@/constants';
import { tailwind } from '@/theme';
import { useAppSelector } from '@/hooks';
import { selectCurrentState } from '@/store/conversation/conversationHeaderSlice';
import { useHaptic } from '@/utils';

const FAB_SIZE = 56;

export const NewConversationFab = () => {
  const navigation = useNavigation();
  const headerState = useAppSelector(selectCurrentState);
  const hapticSelection = useHaptic();

  // A barra de ações em massa ocupa o mesmo canto no modo de seleção.
  if (headerState === 'Select') return null;

  const handlePress = () => {
    hapticSelection?.();
    navigation.dispatch(StackActions.push('NewConversation'));
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      style={tailwind.style(
        'absolute right-4 items-center justify-center rounded-full bg-blue-800 shadow-lg',
        `bottom-[${TAB_BAR_HEIGHT + 16}px] h-[${FAB_SIZE}px] w-[${FAB_SIZE}px]`,
      )}>
      <Icon icon={<AddIcon stroke="white" strokeOpacity={1} />} size={24} />
    </Pressable>
  );
};

export default NewConversationFab;

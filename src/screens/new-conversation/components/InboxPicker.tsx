import React from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components-next';
import { TickIcon } from '@/svg-icons/common';
import { tailwind } from '@/theme';
import type { Inbox } from '@/types/Inbox';

type InboxPickerProps = {
  label: string;
  inboxes: Inbox[];
  selectedInboxId?: number;
  onSelect: (inboxId: number) => void;
};

export const InboxPicker = ({ label, inboxes, selectedInboxId, onSelect }: InboxPickerProps) => {
  if (inboxes.length <= 1) return null;

  return (
    <View style={tailwind.style('gap-1')}>
      <Animated.Text style={tailwind.style('font-inter-420-20 text-gray-950')}>
        {label}
      </Animated.Text>
      <View style={tailwind.style('rounded-xl bg-blackA-A4 px-3')}>
        {inboxes.map((inbox, index) => (
          <Pressable
            key={inbox.id}
            onPress={() => onSelect(inbox.id)}
            style={tailwind.style(
              'flex-row items-center justify-between py-[11px]',
              index !== inboxes.length - 1 ? 'border-b-[1px] border-blackA-A3' : '',
            )}>
            <Animated.Text
              numberOfLines={1}
              style={tailwind.style(
                'flex-1 pr-3 text-base font-inter-420-20 leading-[21px] tracking-[0.16px] text-gray-950',
              )}>
              {inbox.name}
            </Animated.Text>
            {selectedInboxId === inbox.id ? <Icon icon={<TickIcon />} size={20} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
};

export default InboxPicker;

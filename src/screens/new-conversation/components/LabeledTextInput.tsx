import React from 'react';
import { TextInput, TextInputProps, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { tailwind } from '@/theme';

type LabeledTextInputProps = TextInputProps & {
  label: string;
  error?: string;
};

export const LabeledTextInput = ({ label, error, ...inputProps }: LabeledTextInputProps) => (
  <View style={tailwind.style('gap-1')}>
    <Animated.Text style={tailwind.style('font-inter-420-20 text-gray-950')}>{label}</Animated.Text>
    <TextInput
      style={tailwind.style(
        'text-base font-inter-normal-20 tracking-[0.24px] leading-[20px] android:leading-[18px]',
        'py-2 px-3 rounded-xl text-gray-950 bg-blackA-A4 h-10',
      )}
      placeholderTextColor={tailwind.color('text-gray-900')}
      autoCapitalize="none"
      autoCorrect={false}
      {...inputProps}
    />
    {error ? (
      <Animated.Text style={tailwind.style('font-inter-normal-20 text-ruby-900')}>
        {error}
      </Animated.Text>
    ) : null}
  </View>
);

export default LabeledTextInput;

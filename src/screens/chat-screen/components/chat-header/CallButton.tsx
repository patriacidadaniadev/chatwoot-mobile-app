import React from 'react';
import { Pressable } from 'react-native';

import { Icon } from '@/components-next';
import { CallIcon } from '@/svg-icons';
import { tailwind } from '@/theme';
import i18n from '@/i18n';

import { ChatDropdownMenu, DashboardList } from './DropdownMenu';

type CallButtonProps = {
  canCallOverWhatsapp: boolean;
  phoneNumber?: string | null;
  isDisabled?: boolean;
  onWhatsappCall: () => void;
  onPhoneCall: () => void;
};

/**
 * Duas maneiras de ligar: pelo WhatsApp da empresa (WebRTC, fica registrado na
 * conversa) ou pelo número do próprio celular do agente. Com só uma opção
 * disponível, dispara direto em vez de abrir um menu de um item.
 */
export const CallButton = ({
  canCallOverWhatsapp,
  phoneNumber,
  isDisabled,
  onWhatsappCall,
  onPhoneCall,
}: CallButtonProps) => {
  const options: DashboardList[] = [
    ...(canCallOverWhatsapp
      ? [{ title: i18n.t('CONVERSATION.CALL.WHATSAPP_CALL'), onSelect: onWhatsappCall }]
      : []),
    ...(phoneNumber
      ? [{ title: i18n.t('CONVERSATION.CALL.DIAL_FROM_PHONE'), onSelect: onPhoneCall }]
      : []),
  ];

  if (options.length === 0) return null;

  const icon = <Icon icon={<CallIcon fill={tailwind.color('text-gray-800')} />} size={24} />;

  if (options.length === 1) {
    return (
      <Pressable
        hitSlop={8}
        disabled={isDisabled}
        onPress={() => options[0].onSelect(undefined, undefined)}>
        {icon}
      </Pressable>
    );
  }

  return <ChatDropdownMenu dropdownMenuList={options}>{icon}</ChatDropdownMenu>;
};

export default CallButton;

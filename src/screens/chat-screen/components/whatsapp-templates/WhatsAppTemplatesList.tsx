import React from 'react';

import { useRefsContext } from '@/context';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { selectConversationById } from '@/store/conversation/conversationSelectors';
import { selectInboxById } from '@/store/inbox/inboxSelectors';
import { selectUserId, selectUserThumbnail } from '@/store/auth/authSelectors';
import { conversationActions } from '@/store/conversation/conversationActions';

import TemplatePickerSheet, { TemplateSendPayload } from './TemplatePickerSheet';

type WhatsAppTemplatesListProps = {
  conversationId: number;
};

export const WhatsAppTemplatesList = ({ conversationId }: WhatsAppTemplatesListProps) => {
  const dispatch = useAppDispatch();
  const { whatsAppTemplatesSheetRef } = useRefsContext();

  const conversation = useAppSelector(state => selectConversationById(state, conversationId));
  const inboxId = conversation?.inboxId;
  const inbox = useAppSelector(state => (inboxId ? selectInboxById(state, inboxId) : undefined));
  const userId = useAppSelector(selectUserId);
  const userThumbnail = useAppSelector(selectUserThumbnail);

  const handleSend = ({ message, templateParams }: TemplateSendPayload) => {
    dispatch(
      conversationActions.sendMessage({
        conversationId,
        message,
        private: false,
        templateParams,
        sender: {
          id: userId ?? 0,
          thumbnail: userThumbnail ?? '',
        },
      }),
    );
  };

  return (
    <TemplatePickerSheet sheetRef={whatsAppTemplatesSheetRef} inbox={inbox} onSend={handleSend} />
  );
};

export default WhatsAppTemplatesList;

import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { StackActions, useNavigation } from '@react-navigation/native';

import { Button, Icon } from '@/components-next';
import { CloseIcon } from '@/svg-icons';
import { tailwind } from '@/theme';
import i18n from '@/i18n';
import { useAppSelector } from '@/hooks';
import { selectAllInboxes } from '@/store/inbox/inboxSelectors';
import { selectUserId } from '@/store/auth/authSelectors';
import { ContactService } from '@/store/contact/contactService';
import { ConversationService } from '@/store/conversation/conversationService';
import { showToast } from '@/utils/toastUtils';
import {
  buildNewContactPayload,
  buildWhatsappConversationPayload,
  isValidBitrixCardUrl,
  isValidPhoneNumber,
  normalizePhoneNumber,
  sourceIdFromPhone,
  whatsappInboxes,
} from '@/utils/newConversationUtils';
import {
  TemplatePickerSheet,
  type TemplateSendPayload,
} from '@/screens/chat-screen/components/whatsapp-templates';

import LabeledTextInput from './components/LabeledTextInput';
import InboxPicker from './components/InboxPicker';

const i18nPrefix = 'NEW_CONVERSATION';

/**
 * Port do "Novo cliente" do dashboard: telefone + link do card no Bitrix viram
 * contato e conversa em uma inbox de WhatsApp. Como o contato é novo, ele está
 * sempre fora da janela de 24h, então a primeira mensagem tem que ser um template
 * — mesma regra do desktop (WhatsAppOptions.vue).
 */
export const NewConversationScreen = () => {
  const navigation = useNavigation();
  const templateSheetRef = useRef<BottomSheetModal>(null);

  const allInboxes = useAppSelector(selectAllInboxes);
  const currentUserId = useAppSelector(selectUserId);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [bitrixCardUrl, setBitrixCardUrl] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableInboxes = useMemo(() => whatsappInboxes(allInboxes), [allInboxes]);
  const [selectedInboxId, setSelectedInboxId] = useState<number | undefined>(undefined);
  const selectedInbox =
    availableInboxes.find(inbox => inbox.id === selectedInboxId) ?? availableInboxes[0];

  const isPhoneValid = isValidPhoneNumber(phoneNumber);
  const isUrlValid = isValidBitrixCardUrl(bitrixCardUrl);
  const canContinue = isPhoneValid && isUrlValid && Boolean(selectedInbox);

  const handleClose = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleOpenTemplates = () => {
    setShowErrors(true);
    if (!canContinue) return;
    templateSheetRef.current?.present();
  };

  const handleSend = async ({ message, templateParams }: TemplateSendPayload) => {
    if (!selectedInbox || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const contact = await ContactService.createContact(
        buildNewContactPayload({ phoneNumber, bitrixCardUrl }),
      );
      const { conversation } = await ConversationService.createConversation(
        buildWhatsappConversationPayload({
          inboxId: selectedInbox.id,
          contactId: contact.id,
          sourceId: sourceIdFromPhone(normalizePhoneNumber(phoneNumber)),
          assigneeId: currentUserId ?? undefined,
          message,
          templateParams,
          bitrixCardUrl,
        }),
      );
      navigation.dispatch(StackActions.replace('ChatScreen', { conversationId: conversation.id }));
    } catch {
      showToast({ message: i18n.t(`${i18nPrefix}.CREATE_FAILED`) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={tailwind.style('flex-1 bg-white')}>
      <StatusBar translucent backgroundColor={tailwind.color('bg-white')} barStyle="dark-content" />
      <View
        style={tailwind.style(
          'flex-row items-center justify-between border-b-[1px] border-b-blackA-A3 px-4 py-3',
        )}>
        <Pressable hitSlop={8} onPress={handleClose}>
          <Icon icon={<CloseIcon />} size={24} />
        </Pressable>
        <Animated.Text
          style={tailwind.style(
            'text-[17px] font-inter-medium-24 tracking-[0.32px] text-gray-950',
          )}>
          {i18n.t(`${i18nPrefix}.TITLE`)}
        </Animated.Text>
        <View style={tailwind.style('w-6')} />
      </View>

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={tailwind.style('gap-5 px-4 py-5')}>
        <LabeledTextInput
          label={i18n.t(`${i18nPrefix}.PHONE_LABEL`)}
          placeholder={i18n.t(`${i18nPrefix}.PHONE_PLACEHOLDER`)}
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          error={showErrors && !isPhoneValid ? i18n.t(`${i18nPrefix}.PHONE_INVALID`) : undefined}
        />
        <LabeledTextInput
          label={i18n.t(`${i18nPrefix}.BITRIX_LABEL`)}
          placeholder={i18n.t(`${i18nPrefix}.BITRIX_PLACEHOLDER`)}
          keyboardType="url"
          value={bitrixCardUrl}
          onChangeText={setBitrixCardUrl}
          error={showErrors && !isUrlValid ? i18n.t(`${i18nPrefix}.BITRIX_INVALID`) : undefined}
        />
        <InboxPicker
          label={i18n.t(`${i18nPrefix}.INBOX_LABEL`)}
          inboxes={availableInboxes}
          selectedInboxId={selectedInbox?.id}
          onSelect={setSelectedInboxId}
        />
        {availableInboxes.length === 0 ? (
          <Animated.Text style={tailwind.style('font-inter-normal-20 text-ruby-900')}>
            {i18n.t(`${i18nPrefix}.NO_WHATSAPP_INBOX`)}
          </Animated.Text>
        ) : null}
        <Animated.Text style={tailwind.style('text-sm font-inter-420-20 text-gray-800')}>
          {i18n.t(`${i18nPrefix}.TEMPLATE_HINT`)}
        </Animated.Text>
        {isSubmitting ? (
          <ActivityIndicator />
        ) : (
          <Button
            text={i18n.t(`${i18nPrefix}.CHOOSE_TEMPLATE`)}
            handlePress={handleOpenTemplates}
            disabled={availableInboxes.length === 0}
          />
        )}
      </KeyboardAwareScrollView>

      <TemplatePickerSheet sheetRef={templateSheetRef} inbox={selectedInbox} onSend={handleSend} />
    </SafeAreaView>
  );
};

export default NewConversationScreen;

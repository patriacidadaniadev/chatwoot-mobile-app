import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useChatWindowContext, useRefsContext } from '@/context';
import { showToast } from '@/utils/toastUtils';
import i18n from '@/i18n';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { conversationActions } from '@/store/conversation/conversationActions';
import { selectConversationById } from '@/store/conversation/conversationSelectors';
import { CONVERSATION_STATUS } from '@/constants';
import { ConversationStatus } from '@/types/common/ConversationStatus';
import { ChatHeader } from './ChatHeader';
import { DashboardList } from './DropdownMenu';
import { ImageSourcePropType, Linking } from 'react-native';
import { SLAStatus } from '@/types/common/SLA';
import { evaluateSLAStatus } from '@chatwoot/utils';
import { resetSentMessage } from '@/store/conversation/sendMessageSlice';
import { selectAllDashboardApps } from '@/store/dashboard-app/dashboardAppSlice';
import { selectUser } from '@/store/auth/authSelectors';
import { selectInboxById } from '@/store/inbox/inboxSelectors';
import {
  selectActiveCall,
  selectIsInitiatingCall,
  setCall,
  setInitiating,
} from '@/store/call/callSlice';
import { VOICE_CALL_OUTBOUND_INIT_STATUS } from '@/store/call/callTypes';
import { initiateOutboundCall } from '@/utils/whatsappCallSession';
import { isWhatsappVoiceEnabled } from '@/utils/inboxUtils';

type ChatScreenHeaderProps = {
  name: string;
  imageSrc: ImageSourcePropType;
};

const REFRESH_INTERVAL = 60000;

export const ChatHeaderContainer = (props: ChatScreenHeaderProps) => {
  const { name, imageSrc } = props;
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { conversationId } = useChatWindowContext();
  const conversation = useAppSelector(state => selectConversationById(state, conversationId));
  const currentUser = useAppSelector(selectUser);
  const dashboardApps = useAppSelector(selectAllDashboardApps);
  const inboxId = conversation?.inboxId;
  const inbox = useAppSelector(state => (inboxId ? selectInboxById(state, inboxId) : undefined));
  const activeCall = useAppSelector(selectActiveCall);
  const isInitiatingCall = useAppSelector(selectIsInitiatingCall);

  const canCallOverWhatsapp = isWhatsappVoiceEnabled(inbox);
  const contactPhoneNumber = conversation?.meta?.sender?.phoneNumber;

  const appliedSla = conversation?.appliedSla;

  const [slaStatus, setSlaStatus] = useState<SLAStatus | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const conversationStatus = conversation?.status;
  const isResolved = conversationStatus === CONVERSATION_STATUS.RESOLVED;

  const updateSlaStatus = useCallback(() => {
    if (appliedSla) {
      const status = evaluateSLAStatus({
        appliedSla: {
          id: appliedSla.id,
          name: appliedSla.slaName,
          description: appliedSla.slaDescription,
          sla_first_response_time_threshold: appliedSla.slaFirstResponseTimeThreshold,
          sla_next_response_time_threshold: appliedSla.slaNextResponseTimeThreshold,
          sla_resolution_time_threshold: appliedSla.slaResolutionTimeThreshold,
          only_during_business_hours: appliedSla.slaOnlyDuringBusinessHours,
          created_at: appliedSla.createdAt,
        },
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        chat: {
          first_reply_created_at: conversation?.firstReplyCreatedAt,
          waiting_since: conversation?.waitingSince,
          status: conversation?.status,
        },
      });
      setSlaStatus(status);
    }
  }, [appliedSla, conversation]);

  const { chatPagerView } = useRefsContext();
  const { pagerViewIndex } = useChatWindowContext();

  const createTimer = useCallback(() => {
    timerRef.current = setTimeout(() => {
      updateSlaStatus();
      createTimer();
    }, REFRESH_INTERVAL);
  }, [updateSlaStatus]);

  useEffect(() => {
    createTimer();
    updateSlaStatus();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [createTimer, updateSlaStatus]);

  const handleBackPress = () => {
    dispatch(resetSentMessage());
    if (navigation.canGoBack()) {
      navigation.dispatch(StackActions.pop());
    } else {
      navigation.dispatch(StackActions.replace('Tab'));
    }
  };

  const handleNavigationToContactDetails = () => {
    const navigateToScreen = StackActions.push('ContactDetails', { conversationId });
    navigation.dispatch(navigateToScreen);
  };

  const handleNavigation = (url?: string, title?: string) => {
    if (url) {
      const navigateToScreen = StackActions.push('Dashboard', {
        url,
        title,
        conversation,
        currentUser,
      });
      navigation.dispatch(navigateToScreen);
    } else {
      chatPagerView.current?.setPage(1);
    }
  };

  const toggleChatStatus = async () => {
    const updatedStatus =
      conversationStatus === CONVERSATION_STATUS.RESOLVED
        ? CONVERSATION_STATUS.OPEN
        : CONVERSATION_STATUS.RESOLVED;
    await dispatch(
      conversationActions.toggleConversationStatus({
        conversationId,
        payload: { status: updatedStatus as ConversationStatus, snoozed_until: null },
      }),
    );

    showToast({
      message: i18n.t('CONVERSATION.STATUS_CHANGE'),
    });
  };

  const dashboardRoutes = dashboardApps.map(dashboardApp => ({
    title: dashboardApp.title,
    url: dashboardApp.content[0].url,
    onSelect: handleNavigation,
  }));

  // O link do card é gravado na conversa pelo formulário de nova conversa e pelo
  // sync do Bitrix. Só abrimos http/https, mesma checagem do ConversationHeader.vue.
  const bitrixCardUrl = conversation?.customAttributes?.bitrix_card_url;
  const canOpenBitrixCard = /^https?:\/\//i.test(bitrixCardUrl ?? '');

  const dashboardsList = useMemo(() => {
    return [
      pagerViewIndex === 0
        ? {
            title: i18n.t('CONVERSATION_ACTION.TITLE'),
            onSelect: handleNavigation,
          }
        : undefined,
      canOpenBitrixCard
        ? {
            title: i18n.t('CONVERSATION.HEADER.OPEN_BITRIX_CARD'),
            onSelect: () => Linking.openURL(bitrixCardUrl as string),
          }
        : undefined,
      ...dashboardRoutes,
    ].filter((item): item is DashboardList => item !== undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagerViewIndex, canOpenBitrixCard, bitrixCardUrl]);

  const handleWhatsappCall = async () => {
    if (isInitiatingCall || activeCall) return;
    dispatch(setInitiating(true));
    try {
      const response = await initiateOutboundCall(conversationId);

      // LOCKED = já tem init em voo ou chamada ativa. No-op silencioso.
      if (response?.status === VOICE_CALL_OUTBOUND_INIT_STATUS.LOCKED) return;

      // Sem call id: o contato ainda não deu permissão e a Meta recebeu o template
      // de permissão em vez da chamada.
      if (!response?.id) {
        showToast({
          message: i18n.t(
            response?.status === VOICE_CALL_OUTBOUND_INIT_STATUS.PERMISSION_PENDING
              ? 'CONVERSATION.CALL.PERMISSION_PENDING'
              : 'CONVERSATION.CALL.PERMISSION_REQUESTED',
          ),
        });
        return;
      }

      // Fica em 'ringing' até o `voice_call.outbound_accepted`: virar 'active' aqui
      // começaria o cronômetro antes de o contato atender.
      dispatch(
        setCall({
          callId: response.id,
          callSid: response.call_id,
          conversationId,
          contactName: name,
          status: 'ringing',
          isMuted: false,
          isSpeakerOn: false,
        }),
      );
      navigation.dispatch(StackActions.push('CallScreen'));
    } catch {
      showToast({ message: i18n.t('CONVERSATION.CALL.FAILED') });
    } finally {
      dispatch(setInitiating(false));
    }
  };

  const handlePhoneCall = () => {
    if (contactPhoneNumber) Linking.openURL(`tel:${contactPhoneNumber}`);
  };

  const sLAStatusText = () => {
    const upperCaseType = slaStatus?.type?.toUpperCase(); // FRT, NRT, or RT
    const statusKey = slaStatus?.isSlaMissed ? 'MISSED' : 'DUE';
    return i18n.t(`SLA.STATUS.${upperCaseType}`, {
      status: i18n.t(`SLA.STATUS.${statusKey}`),
    });
  };
  return (
    <ChatHeader
      name={name}
      imageSrc={imageSrc}
      isResolved={isResolved}
      dashboardsList={dashboardsList}
      isSlaMissed={slaStatus?.isSlaMissed}
      hasSla={!!appliedSla}
      slaEvents={conversation?.slaEvents}
      statusText={`${sLAStatusText()}: ${slaStatus?.threshold}`}
      canCallOverWhatsapp={canCallOverWhatsapp}
      contactPhoneNumber={contactPhoneNumber}
      isCallDisabled={isInitiatingCall || Boolean(activeCall)}
      onBackPress={handleBackPress}
      onContactDetailsPress={handleNavigationToContactDetails}
      onToggleChatStatus={toggleChatStatus}
      onWhatsappCall={handleWhatsappCall}
      onPhoneCall={handlePhoneCall}
    />
  );
};

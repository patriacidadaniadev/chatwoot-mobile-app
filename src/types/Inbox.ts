import { Channel } from './common/Channel';
import type { TwilioContentTemplates, WhatsAppMessageTemplate } from './MessageTemplate';

export type Inbox = {
  id: number;
  avatarUrl: string;
  channelId: number;
  name: string;
  channelType: Channel;
  phoneNumber: string;
  medium: string;
  additionalAttributes?: {
    agentReplyTimeWindowMessage?: string;
  };
  provider: string;
  /**
   * Só é serializado para inboxes de WhatsApp (_inbox.json.jbuilder). Exige, no
   * servidor, provider whatsapp_cloud + provider_config.calling_enabled + a feature
   * `channel_voice` habilitada na conta.
   */
  voiceEnabled?: boolean;
  messageTemplates?: WhatsAppMessageTemplate[];
  contentTemplates?: TwilioContentTemplates;
};

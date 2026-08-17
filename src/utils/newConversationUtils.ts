import { INBOX_TYPES } from '@/constants';
import type { Inbox } from '@/types/Inbox';
import type { TemplateSendParams } from '@/types/MessageTemplate';

/**
 * Port do formulário "Novo cliente" do dashboard
 * (components-next/NewConversation). Só a parte pura: validação, normalização do
 * telefone e montagem dos payloads. A tela vive em @/screens/new-conversation.
 */

// Mesma regex do ContactSelector.vue: E.164 com o '+' opcional.
const E164 = /^\+?[1-9]\d{7,14}$/;
const HTTP_URL = /^https?:\/\/\S+$/i;

export const isValidPhoneNumber = (value: string): boolean => E164.test(value.trim());

// O desktop valida `url` no formulário e depois exige http/https na hora de abrir o
// card (ConversationHeader.vue). Exigimos os dois protocolos já na entrada.
export const isValidBitrixCardUrl = (value: string): boolean => HTTP_URL.test(value.trim());

export const normalizePhoneNumber = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
};

export type NewContactInput = {
  phoneNumber: string;
  bitrixCardUrl: string;
};

export const buildNewContactPayload = ({ phoneNumber, bitrixCardUrl }: NewContactInput) => {
  const normalized = normalizePhoneNumber(phoneNumber);
  return {
    name: normalized.slice(1),
    phone_number: normalized,
    custom_attributes: { bitrix_card_url: bitrixCardUrl.trim() },
  };
};

/**
 * Um contato recém-criado ainda não tem ContactInbox, então `contactable_inboxes`
 * volta vazio. O endpoint de criação de conversa cria esse vínculo, então oferecemos
 * as inboxes de WhatsApp da conta e usamos o telefone só com dígitos como source id.
 * Port de `buildNewContactWhatsappInboxes`.
 */
export const whatsappInboxes = (inboxes: Inbox[]): Inbox[] =>
  inboxes.filter(inbox => inbox.channelType === INBOX_TYPES.WHATSAPP);

export const sourceIdFromPhone = (phoneNumber: string): string =>
  phoneNumber?.replace(/\D/g, '') ?? '';

export type NewWhatsappConversationInput = {
  inboxId: number;
  contactId: number;
  sourceId: string;
  assigneeId?: number;
  message: string;
  templateParams: TemplateSendParams;
  bitrixCardUrl?: string;
};

export const buildWhatsappConversationPayload = ({
  inboxId,
  contactId,
  sourceId,
  assigneeId,
  message,
  templateParams,
  bitrixCardUrl,
}: NewWhatsappConversationInput) => ({
  inbox_id: inboxId,
  contact_id: contactId,
  source_id: sourceId,
  assignee_id: assigneeId,
  message: { content: message, template_params: templateParams },
  ...(bitrixCardUrl ? { custom_attributes: { bitrix_card_url: bitrixCardUrl.trim() } } : {}),
});

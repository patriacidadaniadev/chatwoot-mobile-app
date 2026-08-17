import { INBOX_TYPES } from '@/constants';
import type { Inbox } from '@/types/Inbox';
import {
  buildNewContactPayload,
  buildWhatsappConversationPayload,
  isValidBitrixCardUrl,
  isValidPhoneNumber,
  normalizePhoneNumber,
  sourceIdFromPhone,
  whatsappInboxes,
} from '../newConversationUtils';

const inbox = (id: number, channelType: string): Inbox =>
  ({ id, channelType, name: `inbox-${id}` }) as Inbox;

describe('newConversationUtils', () => {
  describe('isValidPhoneNumber', () => {
    it.each(['+5511999999999', '5511999999999', ' +351912345678 '])('accepts %s', value => {
      expect(isValidPhoneNumber(value)).toBe(true);
    });

    it.each(['', '+0511999999999', '11999', 'not-a-number', '+55119999999999999'])(
      'rejects %s',
      value => {
        expect(isValidPhoneNumber(value)).toBe(false);
      },
    );
  });

  describe('isValidBitrixCardUrl', () => {
    it('accepts http and https', () => {
      expect(isValidBitrixCardUrl('https://bitrix.example/crm/deal/details/1/')).toBe(true);
      expect(isValidBitrixCardUrl(' http://bitrix.example/x ')).toBe(true);
    });

    it('rejects anything else', () => {
      expect(isValidBitrixCardUrl('javascript:alert(1)')).toBe(false);
      expect(isValidBitrixCardUrl('bitrix.example/crm')).toBe(false);
      expect(isValidBitrixCardUrl('')).toBe(false);
    });
  });

  describe('normalizePhoneNumber', () => {
    it('forces a leading +', () => {
      expect(normalizePhoneNumber('5511999999999')).toBe('+5511999999999');
      expect(normalizePhoneNumber(' +5511999999999 ')).toBe('+5511999999999');
    });
  });

  describe('buildNewContactPayload', () => {
    it('names the contact after the number without the + and carries the bitrix link', () => {
      expect(
        buildNewContactPayload({
          phoneNumber: '5511999999999',
          bitrixCardUrl: '  https://bitrix.example/crm/deal/details/42/  ',
        }),
      ).toEqual({
        name: '5511999999999',
        phone_number: '+5511999999999',
        custom_attributes: {
          bitrix_card_url: 'https://bitrix.example/crm/deal/details/42/',
        },
      });
    });
  });

  describe('whatsappInboxes', () => {
    it('keeps only WhatsApp inboxes', () => {
      const inboxes = [
        inbox(1, INBOX_TYPES.EMAIL),
        inbox(2, INBOX_TYPES.WHATSAPP),
        inbox(3, INBOX_TYPES.TWILIO),
        inbox(4, INBOX_TYPES.WHATSAPP),
      ];
      expect(whatsappInboxes(inboxes).map(i => i.id)).toEqual([2, 4]);
    });
  });

  describe('sourceIdFromPhone', () => {
    it('strips everything that is not a digit', () => {
      expect(sourceIdFromPhone('+55 (11) 99999-9999')).toBe('5511999999999');
      expect(sourceIdFromPhone('')).toBe('');
    });
  });

  describe('buildWhatsappConversationPayload', () => {
    const base = {
      inboxId: 7,
      contactId: 99,
      sourceId: '5511999999999',
      assigneeId: 3,
      message: 'Olá {{1}}',
      templateParams: { name: 'boas_vindas' } as never,
    };

    it('includes the bitrix card link as a conversation custom attribute', () => {
      expect(
        buildWhatsappConversationPayload({ ...base, bitrixCardUrl: ' https://bitrix.example/1 ' }),
      ).toEqual({
        inbox_id: 7,
        contact_id: 99,
        source_id: '5511999999999',
        assignee_id: 3,
        message: { content: 'Olá {{1}}', template_params: { name: 'boas_vindas' } },
        custom_attributes: { bitrix_card_url: 'https://bitrix.example/1' },
      });
    });

    it('omits custom_attributes when there is no bitrix link', () => {
      expect(buildWhatsappConversationPayload(base)).not.toHaveProperty('custom_attributes');
    });
  });
});

import { apiService } from '@/services/APIService';
import type {
  ContactLabelsAPIResponse,
  ContactLabelsPayload,
  UpdateContactLabelsPayload,
  ContactConversationAPIResponse,
  ContactConversationPayload,
  CreateContactAPIResponse,
  CreateContactPayload,
} from './contactTypes';
import { transformContact, transformConversation } from '@/utils/camelCaseKeys';
import type { Contact } from '@/types';

export class ContactService {
  static async getContactLabels(payload: ContactLabelsPayload) {
    const { contactId } = payload;
    const response = await apiService.get<ContactLabelsAPIResponse>(`contacts/${contactId}/labels`);
    return response.data;
  }

  static async updateContactLabels(
    payload: UpdateContactLabelsPayload,
  ): Promise<ContactLabelsAPIResponse> {
    const { contactId, labels } = payload;
    const response = await apiService.post<ContactLabelsAPIResponse>(
      `contacts/${contactId}/labels`,
      { labels },
    );
    return response.data;
  }

  static async getContactConversations(
    payload: ContactConversationPayload,
  ): Promise<ContactConversationAPIResponse> {
    const { contactId } = payload;
    const response = await apiService.get<ContactConversationAPIResponse>(
      `contacts/${contactId}/conversations`,
    );
    const transformedResponse = response.data.payload.map(transformConversation);
    return {
      payload: transformedResponse,
    };
  }

  /**
   * O fork tornou esse endpoint idempotente por telefone (contacts_controller#create),
   * então mandar um número que já existe devolve o contato existente em vez de 422.
   */
  static async createContact(payload: CreateContactPayload): Promise<Contact> {
    const response = await apiService.post<CreateContactAPIResponse>('contacts', payload);
    return transformContact(response.data.payload.contact);
  }
}

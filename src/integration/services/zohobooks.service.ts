import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Repository } from 'typeorm';
import { ZohoBooksCredentials } from '../entities/zohobooks-credentials.entity';
import axios, { AxiosInstance } from 'axios';
import { BusinessOwnerSettingsService } from 'src/business/services/business-owner-settings.service';
import { IntegrationAccessService } from './integration-access.service';
import {
  IntegrationAuthError,
  ZOHO_DATA_CENTRES,
  integrationRedirectUri,
  ZohoDataCentre,
  zohoDataCentreFromAccountsServer,
  zohoDataCentreOrDefault,
} from '../integration.helpers';

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

@Injectable()
export class ZohoBooksService {
  private readonly logger = new Logger(ZohoBooksService.name);

  constructor(
    @InjectRepository(ZohoBooksCredentials)
    private zohoBooksCredsRepo: Repository<ZohoBooksCredentials>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
    private readonly access: IntegrationAccessService,
  ) {}

  // Read when needed rather than in the constructor, so a server without Zoho
  // configured still starts; only connecting fails, with a clear message.
  private get config() {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const secret = process.env.ZOHO_SECRET || process.env.ZOHO_CLIENT_SECRET;
    const redirectUri = integrationRedirectUri('zohobooks');
    if (!clientId || !secret || !redirectUri) {
      throw new BadRequestException('ZohoBooks is not set up on this server yet.');
    }
    return { clientId, secret, redirectUri };
  }

  /**
   * The Zoho sign-in URL for the merchant to authorise. `state` is signed and
   * tied to this merchant and salon. Zoho sends the merchant to their own
   * region's sign-in and reports it back as `accounts-server` on the callback.
   */
  async getAuthUrl(businessId: string, ownerId: string): Promise<string> {
    await this.access.assertOwnsBusiness(ownerId, businessId);
    const { clientId, redirectUri } = this.config;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'ZohoBooks.fullaccess.all',
      access_type: 'offline',
      prompt: 'consent',
      state: this.access.signState('zohobooks', businessId, ownerId),
    });
    return `${ZOHO_DATA_CENTRES.com.accounts}/oauth/v2/auth?${params.toString()}`;
  }

  /**
   * Finish the OAuth hand-off: verify the signed state, swap the code for tokens
   * on the region the merchant signed in to, find their Books organisation and
   * store everything for the salon.
   */
  async handleOAuthCallback(
    code: string,
    state: string,
    ownerId: string,
    accountsServer?: string,
  ): Promise<void> {
    if (!code) throw new BadRequestException('Missing authorisation code.');
    const businessId = this.access.verifyState('zohobooks', state, ownerId);
    await this.access.assertOwnsBusiness(ownerId, businessId);

    const { clientId, secret, redirectUri } = this.config;
    const dataCentre = zohoDataCentreFromAccountsServer(accountsServer);
    const urls = ZOHO_DATA_CENTRES[dataCentre];

    try {
      const tokenResponse = await axios.post(`${urls.accounts}/oauth/v2/token`, null, {
        params: {
          code,
          client_id: clientId,
          client_secret: secret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        },
      });
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      if (!access_token || !refresh_token) {
        throw new BadRequestException(
          tokenResponse.data?.error
            ? `Zoho said: ${tokenResponse.data.error}`
            : 'Zoho did not grant ongoing access.',
        );
      }

      const orgResponse = await axios.get(`${urls.api}/organizations`, {
        headers: { Authorization: `Zoho-oauthtoken ${access_token}` },
      });
      const organizations = orgResponse.data.organizations;
      if (!organizations || organizations.length === 0) {
        throw new BadRequestException('No ZohoBooks organization found');
      }

      const existing = await this.zohoBooksCredsRepo.findOne({
        where: { business: { id: businessId } },
      });
      const credentials =
        existing ?? this.zohoBooksCredsRepo.create({ business: { id: businessId } });
      credentials.accessToken = access_token;
      credentials.refreshToken = refresh_token;
      credentials.organizationId = organizations[0].organization_id;
      credentials.expiryDate = Date.now() + (Number(expires_in) || 3600) * 1000;
      credentials.dataCenter = dataCentre;
      credentials.updatedAt = new Date();
      await this.zohoBooksCredsRepo.save(credentials);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `ZohoBooks OAuth error: ${JSON.stringify(error.response?.data ?? error.message)}`,
      );
      throw new BadRequestException(
        'Failed to authenticate with ZohoBooks: ' +
          (error.response?.data?.message || error.response?.data?.error || error.message),
      );
    }

    await this.businessOwnerSettingsService.update(ownerId, businessId, {
      integrations: { zohoBooks: true },
    });
  }

  async isConnected(businessId: string): Promise<boolean> {
    return this.zohoBooksCredsRepo.exists({
      where: { business: { id: businessId } },
    });
  }

  /** A Books API client for the salon; the token is refreshed only when due. */
  private async getClient(
    businessId: string,
  ): Promise<{ client: AxiosInstance; organizationId: string }> {
    const credentials = await this.zohoBooksCredsRepo.findOne({
      where: { business: { id: businessId } },
    });
    if (!credentials) {
      throw new NotFoundException('ZohoBooks not connected for this business');
    }

    if (Date.now() >= Number(credentials.expiryDate) - REFRESH_BUFFER_MS) {
      await this.refreshAccessToken(credentials);
    }

    const dataCentre = zohoDataCentreOrDefault(credentials.dataCenter);
    const client = axios.create({
      baseURL: ZOHO_DATA_CENTRES[dataCentre].api,
      headers: {
        Authorization: `Zoho-oauthtoken ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      // Books wants the organisation on every request as a query parameter.
      params: { organization_id: credentials.organizationId },
      timeout: 20_000,
    });
    return { client, organizationId: credentials.organizationId };
  }

  private async refreshAccessToken(
    credentials: ZohoBooksCredentials,
  ): Promise<ZohoBooksCredentials> {
    const { clientId, secret } = this.config;
    const dataCentre: ZohoDataCentre = zohoDataCentreOrDefault(credentials.dataCenter);

    try {
      const response = await axios.post(
        `${ZOHO_DATA_CENTRES[dataCentre].accounts}/oauth/v2/token`,
        null,
        {
          params: {
            refresh_token: credentials.refreshToken,
            client_id: clientId,
            client_secret: secret,
            grant_type: 'refresh_token',
          },
        },
      );
      if (!response.data.access_token) {
        throw Object.assign(new Error(response.data.error || 'no token returned'), {
          response,
        });
      }

      credentials.accessToken = response.data.access_token;
      credentials.expiryDate =
        Date.now() + (Number(response.data.expires_in) || 3600) * 1000;
      credentials.updatedAt = new Date();
      return await this.zohoBooksCredsRepo.save(credentials);
    } catch (error) {
      const zohoError = error.response?.data?.error;
      this.logger.error(`Failed to refresh ZohoBooks token: ${zohoError ?? error.message}`);
      if (zohoError === 'invalid_code' || zohoError === 'invalid_client') {
        throw new IntegrationAuthError(
          'ZohoBooks access was revoked. Please reconnect.',
        );
      }
      throw new BadRequestException('Failed to refresh ZohoBooks access.');
    }
  }

  private async loadAppointment(
    appointmentId: string,
    relations: string[],
  ): Promise<Appointment> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  /** Find the client in the salon's Books contacts by email, or create them. */
  async createOrGetCustomer(appointmentId: string): Promise<string> {
    const appointment = await this.loadAppointment(appointmentId, [
      'client',
      'businessClient',
      'business',
    ]);
    if (appointment.zohoCustomerId) return appointment.zohoCustomerId;

    const email = appointment.client?.email ?? appointment.businessClient?.email;
    if (!email) throw new BadRequestException('Client has no email on file');

    const { client } = await this.getClient(appointment.business.id);

    try {
      const search = await client.get('/contacts', { params: { email } });
      let contactId: string | undefined = search.data.contacts?.[0]?.contact_id;

      if (!contactId) {
        let firstName: string;
        let lastName: string;
        let phone: string;
        if (appointment.client) {
          const nameParts = (appointment.client.firstName ?? '').trim().split(' ');
          firstName = nameParts[0] || '';
          lastName =
            appointment.client.surname?.trim() || nameParts.slice(1).join(' ') || '';
          phone = appointment.client.phoneNumber || '';
        } else {
          firstName = appointment.businessClient?.firstName || '';
          lastName = appointment.businessClient?.lastName || '';
          phone = appointment.businessClient?.phone || '';
        }

        const created = await client.post('/contacts', {
          contact_name: `${firstName} ${lastName}`.trim() || email,
          contact_type: 'customer',
          contact_persons: [
            { first_name: firstName, last_name: lastName, email, phone },
          ],
        });
        contactId = created.data.contact.contact_id;
      }

      await this.appointmentRepo.update(appointment.id, { zohoCustomerId: contactId });
      return contactId as string;
    } catch (error) {
      this.logger.error(
        `Failed to create/get customer in ZohoBooks: ${JSON.stringify(error.response?.data ?? error.message)}`,
      );
      throw new BadRequestException(
        'Failed to create customer: ' + (error.response?.data?.message || error.message),
      );
    }
  }

  /**
   * Create the invoice for an appointment, once. Returns the invoice id and
   * whether it was created just now (an existing invoice is returned as is, so
   * repeating a sync never produces a duplicate).
   */
  async ensureInvoice(
    appointmentId: string,
  ): Promise<{ invoiceId: string; created: boolean }> {
    const appointment = await this.loadAppointment(appointmentId, [
      'client',
      'business',
      'staff',
    ]);
    if (appointment.zohoInvoiceId) {
      return { invoiceId: appointment.zohoInvoiceId, created: false };
    }

    const customerId = await this.createOrGetCustomer(appointmentId);
    const { client } = await this.getClient(appointment.business.id);

    try {
      const response = await client.post('/invoices', {
        customer_id: customerId,
        date: appointment.date,
        due_date: appointment.date,
        reference_number: appointment.orderId,
        line_items: [
          {
            name: appointment.serviceName,
            description: `${appointment.serviceName} - ${appointment.date} at ${appointment.time}\nStaff: ${(appointment.staff ?? []).map((s) => s.firstName).join(', ')}`,
            rate: Number(appointment.amount),
            quantity: 1,
            unit: 'service',
          },
        ],
        notes: appointment.specialRequests || '',
      });

      const invoiceId: string = response.data.invoice.invoice_id;
      await this.appointmentRepo.update(appointment.id, { zohoInvoiceId: invoiceId });
      return { invoiceId, created: true };
    } catch (error) {
      this.logger.error(
        `Failed to create invoice in ZohoBooks: ${JSON.stringify(error.response?.data ?? error.message)}`,
      );
      throw new BadRequestException(
        'Failed to create invoice: ' + (error.response?.data?.message || error.message),
      );
    }
  }

  /** Kept for callers that only need the id. */
  async createInvoice(appointmentId: string): Promise<string> {
    return (await this.ensureInvoice(appointmentId)).invoiceId;
  }

  /**
   * Record a payment against an invoice. Books only accepts payments on invoices
   * that have been sent, so a draft is marked sent first.
   */
  async recordPayment(
    appointmentId: string,
    invoiceId: string,
    amount?: number,
    paymentMode: 'creditcard' | 'cash' | 'others' = 'creditcard',
  ): Promise<void> {
    const appointment = await this.loadAppointment(appointmentId, ['business']);
    const { client } = await this.getClient(appointment.business.id);
    const paid = Number(amount ?? appointment.amount);
    if (!(paid > 0)) return;

    try {
      await client.post(`/invoices/${invoiceId}/status/sent`);
    } catch (error) {
      // Already sent (or not a draft) is fine; the payment call below will tell
      // us if the invoice really can't take a payment.
      this.logger.debug(
        `ZohoBooks mark-sent skipped: ${error.response?.data?.message ?? error.message}`,
      );
    }

    try {
      await client.post('/customerpayments', {
        customer_id: await this.createOrGetCustomer(appointmentId),
        payment_mode: paymentMode,
        amount: paid,
        date: new Date().toISOString().split('T')[0],
        invoices: [{ invoice_id: invoiceId, amount_applied: paid }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to record payment in ZohoBooks: ${JSON.stringify(error.response?.data ?? error.message)}`,
      );
      throw new BadRequestException(
        'Failed to record payment: ' + (error.response?.data?.message || error.message),
      );
    }
  }

  /** Cancelled booking: void its invoice, if it has one. */
  async voidInvoice(appointmentId: string): Promise<void> {
    const appointment = await this.loadAppointment(appointmentId, ['business']);
    if (!appointment.zohoInvoiceId) return;
    const { client } = await this.getClient(appointment.business.id);

    try {
      await client.post(`/invoices/${appointment.zohoInvoiceId}/status/void`);
    } catch (error) {
      throw new BadRequestException(
        'Failed to void invoice: ' + (error.response?.data?.message || error.message),
      );
    }
  }

  async getInvoice(businessId: string, invoiceId: string): Promise<any> {
    const { client } = await this.getClient(businessId);
    try {
      const response = await client.get(`/invoices/${invoiceId}`);
      return response.data.invoice;
    } catch (error) {
      throw new BadRequestException('Failed to get invoice: ' + error.message);
    }
  }

  async disconnect(ownerId: string, businessId: string): Promise<void> {
    await this.access.assertOwnsBusiness(ownerId, businessId);
    await this.forget(businessId, ownerId);
  }

  /** Credentials stopped working: forget them so the UI shows Connect again. */
  async markDisconnected(businessId: string, ownerId: string): Promise<void> {
    await this.forget(businessId, ownerId);
  }

  private async forget(businessId: string, ownerId: string): Promise<void> {
    await this.zohoBooksCredsRepo.delete({ business: { id: businessId } });
    await this.businessOwnerSettingsService.update(ownerId, businessId, {
      integrations: { zohoBooks: false },
    });
  }
}

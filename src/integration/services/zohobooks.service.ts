import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Repository } from 'typeorm';
import { ZohoBooksCredentials } from '../entities/zohobooks-credentials.entity';
import axios, { AxiosInstance } from 'axios';
import { UpdateBusinessOwnerSettingsDto } from 'src/business/dtos/requests/BusinessOwnerSettingsDto';
import { BusinessOwnerSettingsService } from 'src/business/services/business-owner-settings.service';

@Injectable()
export class ZohoBooksService {
  private zohoClientId;
  private zohoSecret;
  private zohoRedirectUri;
  private readonly ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
  private readonly ZOHO_API_BASE = 'https://books.zoho.com/api/v3';

  constructor(
    @InjectRepository(ZohoBooksCredentials)
    private zohoBooksCredsRepo: Repository<ZohoBooksCredentials>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
  ) {
    const zohoClientId = process.env.ZOHO_CLIENT_ID;
    const zohoRedirectUri = process.env.ZOHO_REDIRECT_URI;
    const zohoSecret = process.env.ZOHO_SECRET;

    if (!zohoClientId || !zohoRedirectUri || !zohoSecret) {
      throw new Error('ZohoBooks credentials not found');
    }

    this.zohoClientId = zohoClientId;
    this.zohoRedirectUri = zohoRedirectUri;
    this.zohoSecret = zohoSecret;
  }

  /**
   * Generate ZohoBooks OAuth URL
   *
   * @param businessId - Business ID to connect
   * @returns Authorization URL
   */
  getAuthUrl(businessId: string): string {
    const params = new URLSearchParams({
      client_id: this.zohoClientId,
      redirect_uri: this.zohoRedirectUri,
      response_type: 'code',
      scope: 'ZohoBooks.fullaccess.all',
      access_type: 'offline',
      prompt: 'consent',
      state: businessId, // Pass businessId for callback
    });

    return `${this.ZOHO_ACCOUNTS_URL}/oauth/v2/auth?${params.toString()}`;
  }

  /**
   * Handle OAuth callback and store credentials
   *
   * @param code - Authorization code from Zoho
   * @param businessId - Business ID from state parameter
   */
  async handleOAuthCallback(
    code: string,
    businessId: string,
    ownerId: string,
    updateDto: UpdateBusinessOwnerSettingsDto,
  ): Promise<ZohoBooksCredentials> {
    try {
      console.log('🔄 Step 1: Exchanging code for tokens...');

      // Step 1: Exchange code for tokens
      const tokenResponse = await axios.post(
        `${this.ZOHO_ACCOUNTS_URL}/oauth/v2/token`,
        null,
        {
          params: {
            code,
            client_id: this.zohoClientId,
            client_secret: this.zohoSecret,
            redirect_uri: this.zohoRedirectUri,
            grant_type: 'authorization_code',
          },
        },
      );

      const { access_token, refresh_token, expires_in, api_domain } =
        tokenResponse.data;

      console.log('✅ Tokens received:', {
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
        apiDomain: api_domain,
      });

      // Step 2: Determine the correct API base URL from api_domain
      // const domain = api_domain.replace('https://www.', ''); // "zohoapis.com"
      // const apiBaseUrl = `https://books.${domain}/api/v3`;
      const apiBaseUrl = `${api_domain}/books/v3`;

      // Step 3: Get organizations

      const orgResponse = await axios.get(`${apiBaseUrl}/organizations`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
        },
      });

      const organizations = orgResponse.data.organizations;
      if (!organizations || organizations.length === 0) {
        throw new BadRequestException('No ZohoBooks organization found');
      }

      const organizationId = organizations[0].organization_id;

      // Step 4: Determine data center from api_domain
      let dataCenter = 'com'; // Default to .com (US)
      if (api_domain.includes('.eu')) dataCenter = 'eu';
      else if (api_domain.includes('.in')) dataCenter = 'in';
      else if (api_domain.includes('.com.au')) dataCenter = 'com.au';
      else if (api_domain.includes('.jp')) dataCenter = 'jp';

      // Step 5: Save credentials

      let credentials = await this.zohoBooksCredsRepo.findOne({
        where: { business: { id: businessId } },
      });

      const expiryDate = Date.now() + expires_in * 1000;

      if (credentials) {
        credentials.accessToken = access_token;
        credentials.refreshToken = refresh_token;
        credentials.organizationId = organizationId;
        credentials.expiryDate = expiryDate;
        credentials.dataCenter = dataCenter;
      } else {
        credentials = this.zohoBooksCredsRepo.create({
          business: { id: businessId },
          accessToken: access_token,
          refreshToken: refresh_token,
          organizationId,
          expiryDate,
          dataCenter,
        });
      }

      await this.zohoBooksCredsRepo.save(credentials);

      console.log('✅ Credentials saved successfully!');

      await this.businessOwnerSettingsService.update(
        ownerId,
        businessId,
        updateDto,
      );

      return credentials;
    } catch (error) {
      console.error('❌ ZohoBooks OAuth error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      throw new BadRequestException(
        'Failed to authenticate with ZohoBooks: ' +
          (error.response?.data?.message || error.message),
      );
    }
  }

  /**
   * Check if business has connected ZohoBooks
   */
  async isConnected(businessId: string): Promise<boolean> {
    const credentials = await this.zohoBooksCredsRepo.findOne({
      where: { business: { id: businessId } },
    });
    return !!credentials;
  }

  /**
   * Get authenticated Zoho client
   */
  private async getClient(
    businessId: string,
  ): Promise<{ client: AxiosInstance; organizationId: string }> {
    const credentials = await this.zohoBooksCredsRepo.findOne({
      where: { business: { id: businessId } },
    });

    if (!credentials) {
      throw new NotFoundException('ZohoBooks not connected for this business');
    }

    // Check if token needs refresh (5 minute buffer)
    // if (Date.now() >= credentials.expiryDate - 300000) {
    //   await this.refreshAccessToken(credentials);
    // }
    await this.refreshAccessToken(credentials);

    // Determine API URL based on data center
    //  'https://www.zohoapis.com'
    // let apiBaseUrl = 'https://books.zoho.com/api/v3';
    let apiBaseUrl = 'https://www.zohoapis.com/api/v3';
    if (credentials.dataCenter !== 'com') {
      apiBaseUrl = `https://books.zoho.${credentials.dataCenter}/api/v3`;
    }

    const client = axios.create({
      baseURL: apiBaseUrl,
      headers: {
        Authorization: `Zoho-oauthtoken ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    return { client, organizationId: credentials.organizationId };
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(
    credentials: ZohoBooksCredentials,
  ): Promise<ZohoBooksCredentials> {
    try {
      const response = await axios.post(
        `${this.ZOHO_ACCOUNTS_URL}/oauth/v2/token`,
        null,
        {
          params: {
            refresh_token: credentials.refreshToken,
            client_id: this.zohoClientId,
            client_secret: this.zohoSecret,
            grant_type: 'refresh_token',
          },
        },
      );

      credentials.accessToken = response.data.access_token;

      const expiresIn = Number(response.data.expires_in);
      if (!expiresIn || isNaN(expiresIn)) {
        console.warn('Invalid expires_in received:', response.data.expires_in);
        credentials.expiryDate = Date.now() + 3600 * 1000; // fallback
      } else {
        credentials.expiryDate = Date.now() + expiresIn * 1000;
      }

      return await this.zohoBooksCredsRepo.save(credentials);
    } catch (error) {
      console.error('Failed to refresh ZohoBooks token:', error);
      throw new BadRequestException(
        'Failed to refresh ZohoBooks access. Please reconnect.',
      );
    }
  }
  /**
   * Create or get customer in ZohoBooks
   *
   * @param appointmentId - Appointment ID
   * @returns Zoho customer ID
   */
  async createOrGetCustomer(appointmentId: string): Promise<string> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['client', 'business'],
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const { client, organizationId } = await this.getClient(
      appointment.business.id,
    );

    try {
      // Search for existing customer by email
      const searchResponse = await client.get('/contacts', {
        params: {
          organization_id: organizationId,
          email: appointment.client.email,
        },
      });

      if (
        searchResponse.data.contacts &&
        searchResponse.data.contacts.length > 0
      ) {
        return searchResponse.data.contacts[0].contact_id;
      }

      // Create new customer
      const nameParts = appointment.client.firstName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const customerData = {
        contact_name: appointment.client.firstName,
        contact_type: 'customer',
        first_name: firstName,
        last_name: lastName,
        email: appointment.client.email,
        phone: appointment.client.phoneNumber || '',
      };

      const createResponse = await client.post('/contacts', {
        organization_id: organizationId,
        ...customerData,
      });

      return createResponse.data.contact.contact_id;
    } catch (error) {
      console.error(
        'Failed to create/get customer in ZohoBooks:',
        error.response?.data || error,
      );
      throw new BadRequestException(
        'Failed to create customer: ' + error.message,
      );
    }
  }

  /**
   * Create invoice for appointment
   *
   * @param appointmentId - Appointment ID
   * @param customerId - Zoho customer ID (optional)
   * @returns Zoho invoice ID
   */
  async createInvoice(
    appointmentId: string,
    customerId?: string,
  ): Promise<string> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['client', 'business', 'staff'],
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const { client, organizationId } = await this.getClient(
      appointment.business.id,
    );

    // Get or create customer
    if (!customerId) {
      customerId = await this.createOrGetCustomer(appointmentId);
    }

    try {
      const invoiceData = {
        customer_id: customerId,
        date: appointment.date, // Invoice date
        due_date: appointment.date, // Due on appointment date
        line_items: [
          {
            name: appointment.serviceName,
            description: `${appointment.serviceName} - ${appointment.date} at ${appointment.time}\nStaff: ${appointment.staff.map((s) => s.firstName).join(', ')}`,
            rate: appointment.amount,
            quantity: 1,
            unit: 'service',
          },
        ],
        notes: appointment.specialRequests || '',
      };

      const response = await client.post('/invoices', {
        organization_id: organizationId,
        ...invoiceData,
      });

      return response.data.invoice.invoice_id;
    } catch (error) {
      console.error(
        'Failed to create invoice in ZohoBooks:',
        error.response?.data || error,
      );
      throw new BadRequestException(
        'Failed to create invoice: ' + error.message,
      );
    }
  }

  /**
   * Record payment for invoice
   *
   * @param appointmentId - Appointment ID
   * @param invoiceId - Zoho invoice ID
   */
  async recordPayment(appointmentId: string, invoiceId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business'],
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const { client, organizationId } = await this.getClient(
      appointment.business.id,
    );

    try {
      const paymentData = {
        customer_id: await this.createOrGetCustomer(appointmentId),
        payment_mode: 'cash', // or 'card', 'bank_transfer', etc.
        amount: appointment.amount,
        date: new Date().toISOString().split('T')[0],
        invoices: [
          {
            invoice_id: invoiceId,
            amount_applied: appointment.amount,
          },
        ],
      };

      await client.post('/customerpayments', {
        organization_id: organizationId,
        ...paymentData,
      });
    } catch (error) {
      console.error(
        'Failed to record payment in ZohoBooks:',
        error.response?.data || error,
      );
      throw new BadRequestException(
        'Failed to record payment: ' + error.message,
      );
    }
  }

  /**
   * Get invoice details
   *
   * @param businessId - Business ID
   * @param invoiceId - Zoho invoice ID
   */
  async getInvoice(businessId: string, invoiceId: string): Promise<any> {
    const { client, organizationId } = await this.getClient(businessId);

    try {
      const response = await client.get(`/invoices/${invoiceId}`, {
        params: { organization_id: organizationId },
      });

      return response.data.invoice;
    } catch (error) {
      console.error(
        'Failed to get invoice from ZohoBooks:',
        error.response?.data || error,
      );
      throw new BadRequestException('Failed to get invoice: ' + error.message);
    }
  }

  /**
   * Disconnect ZohoBooks integration
   */
  async disconnect(
    businessId: string,
    ownerId: string,
    updateDto: UpdateBusinessOwnerSettingsDto,
  ): Promise<void> {
    await this.businessOwnerSettingsService.update(
      ownerId,
      businessId,
      updateDto,
    );
    await this.zohoBooksCredsRepo.delete({ business: { id: businessId } });
  }
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import { MailchimpCredentials } from '../entities/mail-chimp.entity';
import { Appointment } from 'src/business/entities/appointment.entity';
import { BusinessOwnerSettingsService } from 'src/business/services/business-owner-settings.service';
import { decrypt, encrypt } from 'src/admin/platform-settings/utils/settings-encryption.util';
import { IntegrationAccessService } from './integration-access.service';
import { IntegrationAuthError, mailchimpDataCentre } from '../integration.helpers';

export interface MailchimpAudience {
  id: string;
  name: string;
}

export type MailchimpConnectResult =
  | { connected: true; audienceName: string }
  | { connected: false; needsAudience: true; audiences: MailchimpAudience[] };

// Each salon connects its OWN Mailchimp account (its API key and audience), so
// its client list goes to its own marketing list, not KHS's. Requests go
// straight to Mailchimp's REST API with the salon's key on that one request;
// the SDK keeps one global config, which two salons syncing at once would share.
@Injectable()
export class MailchimpService {
  private readonly logger = new Logger(MailchimpService.name);

  constructor(
    @InjectRepository(MailchimpCredentials)
    private mailchimpCredsRepo: Repository<MailchimpCredentials>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
    private readonly access: IntegrationAccessService,
  ) {}

  private api(apiKey: string, dataCentre: string): AxiosInstance {
    return axios.create({
      baseURL: `https://${dataCentre}.api.mailchimp.com/3.0`,
      auth: { username: 'khs', password: apiKey },
      timeout: 15_000,
    });
  }

  /**
   * Connect with the salon's own Mailchimp API key. If the account has more than
   * one audience and none was chosen, the audiences are returned so the merchant
   * can pick; nothing is saved until an audience is settled.
   */
  async connect(
    ownerId: string,
    businessId: string,
    input: { apiKey?: string; audienceId?: string },
  ): Promise<MailchimpConnectResult> {
    await this.access.assertOwnsBusiness(ownerId, businessId);

    const apiKey = (input.apiKey ?? '').trim();
    const dataCentre = mailchimpDataCentre(apiKey);
    if (!dataCentre) {
      throw new BadRequestException(
        "That doesn't look like a Mailchimp API key. It ends with a dash and a code like -us21.",
      );
    }

    const client = this.api(apiKey, dataCentre);
    let audiences: MailchimpAudience[];
    try {
      await client.get('/ping');
      const { data } = await client.get('/lists', {
        params: { count: 100, fields: 'lists.id,lists.name' },
      });
      audiences = (data.lists ?? []).map((l: any) => ({ id: l.id, name: l.name }));
    } catch (error) {
      if (error.response?.status === 401) {
        throw new BadRequestException('Mailchimp did not accept that API key.');
      }
      throw new BadRequestException(
        'Could not reach Mailchimp: ' + (error.response?.data?.detail || error.message),
      );
    }

    if (audiences.length === 0) {
      throw new BadRequestException(
        'Your Mailchimp account has no audience yet. Create one in Mailchimp, then connect again.',
      );
    }

    let audience = input.audienceId
      ? audiences.find((a) => a.id === input.audienceId)
      : audiences.length === 1
        ? audiences[0]
        : undefined;
    if (input.audienceId && !audience) {
      throw new BadRequestException('That audience was not found in your Mailchimp account.');
    }
    if (!audience) {
      return { connected: false, needsAudience: true, audiences };
    }

    const existing = await this.mailchimpCredsRepo.findOne({
      where: { business: { id: businessId } },
    });
    const credentials =
      existing ?? this.mailchimpCredsRepo.create({ business: { id: businessId } });
    credentials.apiKey = encrypt(apiKey);
    credentials.serverPrefix = dataCentre;
    credentials.audienceId = audience.id;
    await this.mailchimpCredsRepo.save(credentials);

    await this.businessOwnerSettingsService.update(ownerId, businessId, {
      integrations: { mailChimp: true },
    });

    return { connected: true, audienceName: audience.name };
  }

  async isConnected(businessId: string): Promise<boolean> {
    return this.mailchimpCredsRepo.exists({
      where: { business: { id: businessId } },
    });
  }

  private async getClient(businessId: string) {
    const credentials = await this.mailchimpCredsRepo.findOne({
      where: { business: { id: businessId } },
    });
    if (!credentials) {
      throw new BadRequestException('Mailchimp is not connected for this business');
    }
    return {
      client: this.api(decrypt(credentials.apiKey), credentials.serverPrefix),
      audienceId: credentials.audienceId,
    };
  }

  /**
   * Add the appointment's client to the salon's audience. New contacts are added
   * as "pending", so Mailchimp sends them its standard confirmation email before
   * they receive any marketing; existing contacts keep their current status.
   */
  async syncContact(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client', 'businessClient'],
    });
    if (!appointment) throw new BadRequestException('Appointment not found');

    const email = appointment.client?.email ?? appointment.businessClient?.email;
    if (!email) return;

    const firstName =
      appointment.client?.firstName ?? appointment.businessClient?.firstName ?? '';
    const lastName = appointment.client
      ? appointment.client.surname ?? ''
      : appointment.businessClient?.lastName ?? '';

    const { client, audienceId } = await this.getClient(appointment.business.id);
    if (!audienceId) throw new BadRequestException('Mailchimp audience not configured');

    const subscriberHash = createHash('md5')
      .update(email.trim().toLowerCase())
      .digest('hex');

    try {
      await client.put(`/lists/${audienceId}/members/${subscriberHash}`, {
        email_address: email,
        status_if_new: 'pending',
        merge_fields: { FNAME: firstName.split(' ')[0], LNAME: lastName },
        tags: ['khs-client'],
      });
    } catch (error) {
      if (error.response?.status === 401) {
        throw new IntegrationAuthError('Mailchimp no longer accepts the saved API key. Please reconnect.');
      }
      this.logger.error(
        `Failed to sync contact to Mailchimp: ${error.response?.data?.detail || error.message}`,
      );
      throw new BadRequestException(
        'Failed to sync contact: ' + (error.response?.data?.detail || error.message),
      );
    }
  }

  async disconnect(ownerId: string, businessId: string): Promise<void> {
    await this.access.assertOwnsBusiness(ownerId, businessId);
    await this.forget(businessId, ownerId);
  }

  /** The saved key stopped working: forget it so the UI shows Connect again. */
  async markDisconnected(businessId: string, ownerId: string): Promise<void> {
    await this.forget(businessId, ownerId);
  }

  private async forget(businessId: string, ownerId: string): Promise<void> {
    await this.mailchimpCredsRepo.delete({ business: { id: businessId } });
    await this.businessOwnerSettingsService.update(ownerId, businessId, {
      integrations: { mailChimp: false },
    });
  }
}

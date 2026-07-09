import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Reminder } from '../entities/reminder.entity';
import { Repository } from 'typeorm';
import { SendReminderDto } from '../dtos/requests/Reminder.dto';
import sgMail from '@sendgrid/mail';
import { ClientSchema } from '../entities/client.entity';
import { capitalizeString } from '../utils/client.utils';

@Injectable()
export class ReminderService {
  private fromEmail: string;

  constructor(
    @InjectRepository(Reminder)
    private reminderRepo: Repository<Reminder>,
    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,
  ) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      throw new Error('SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set');
    }

    sgMail.setApiKey(apiKey);
    this.fromEmail = fromEmail;
  }

  async sendReminder(payload: SendReminderDto) {
    try {
      const reminder = this.reminderRepo.create(payload);

      const client = await this.clientRepo.findOneBy({
        id: payload.clientId,
        email: payload.clientEmail,
      });

      if (!client) {
        return {
          success: false,
          error: 'Client account not found',
          message: 'This client profile not found',
        };
      }

      await this.sendEmailReminder(payload);

      reminder.sent = true;
      await this.reminderRepo.save(reminder);

      return {
        success: true,
        data: reminder,
        message: 'Reminder sent successfully',
      };
    } catch (error) {
      console.log('ERROR MSG', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to send reminder',
      };
    }
  }

  private async sendEmailReminder(data: SendReminderDto): Promise<void> {
    let emailText = data.message;
    const type = data.reminderType.toLowerCase();

    switch (type) {
      case 'appointment':
        emailText = `Dear ${data.clientName},
  
  ${data.message}
        
  Please be reminded of your appointment scheduled for ${data.date} at ${data.time}.
  
  Thank you.`;
        break;

      case 'upcoming':
        emailText = `Dear ${data.clientName},
  
  ${data.message}
        
  This is a reminder about your upcoming scheduled item on ${data.date} at ${data.time}.
  
  If you need assistance or wish to make changes, feel free to contact us.`;
        break;

      case 'follow_up':
        emailText = `Hello ${data.clientName},
  
  ${data.message} 
        
  This is a quick follow-up regarding the previous appointment on ${data.date} at ${data.time}.
  
  Please let us know if you have any questions or require additional support.`;
        break;

      case 'custom':
        emailText = `Hi ${data.clientName},
  
  ${data.message}

  Here is your reminder set for ${data.date} at ${data.time}:
  
  Thank you.`;
        break;
    }

    const msg = {
      to: data.clientEmail,
      from: this.fromEmail,
      subject: `${capitalizeString(data.reminderType)} Reminder`,
      text: emailText,
    };

    await sgMail.send(msg);
  }
}

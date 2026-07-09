import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sgMail from '@sendgrid/mail';
import { ClientSchema } from '../entities/client.entity';
import { capitalizeString } from '../utils/client.utils';
import { Promotion } from '../entities/promotion.entity';
import { SendPromotionDto } from '../dtos/requests/PromotionDto';

@Injectable()
export class PromotionService {
  private fromEmail: string;

  constructor(
    @InjectRepository(Promotion)
    private promotionRepo: Repository<Promotion>,
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

  async sendPromotion(payload: SendPromotionDto) {
    try {
      const promotion = this.promotionRepo.create(payload);

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

      await this.sendEmailPromotion(payload);

      promotion.sent = true;
      await this.promotionRepo.save(promotion);

      return {
        success: true,
        data: promotion,
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

  private async sendEmailPromotion(data: SendPromotionDto): Promise<void> {
    let emailText = data.description;

    emailText = `Dear ${data.clientName},

${data.discount}${data.discountType} OFF !!
  
  ${data.description}
        
  Offers last till ${data.expiryDate} midnight. Hurry Now!!.
  
  Thank you.`;

    const msg = {
      to: data.clientEmail,
      from: this.fromEmail,
      subject: `${data.promotionTitle.toUpperCase()}`,
      text: emailText,
    };

    await sgMail.send(msg);
  }
}

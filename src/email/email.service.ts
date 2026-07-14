import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import {
  renderOtpEmail,
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderMerchantWelcomeEmail,
  renderMerchantTeamNotification,
  renderStaffWelcomeEmail,
  renderLoginNotificationEmail,
} from './templates';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly maxRetries = 3;

  constructor(private configService: ConfigService) {
    sgMail.setApiKey(this.configService.get<any>('SENDGRID_API_KEY'));
  }

  private get frontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL') || 'https://kinkyhairstylists.com';
  }

  private get deliveryTeamEmail(): string | undefined {
    return this.configService.get<string>('DELIVERY_TEAM_EMAIL');
  }

  sendEmail(to: string, subject: string, text: string, html?: string, cc?: string) {
    const msg: any = {
      to,
      from: {
        email: this.configService.get<string>('SENDGRID_FROM_EMAIL'),
        name: this.configService.get<string>('SENDGRID_FROM_NAME'),
      },
      subject,
      text,
      html: html || text,
    };

    if (cc) {
      msg.cc = [{ email: cc }];
      this.logger.log(`CC recipient set: ${cc} on email to ${to} (subject: "${subject}")`);
    }

    void this.sendWithRetry(msg, 1);
    return { success: true };
  }

  sendWelcomeEmail(to: string, name: string) {
    const { html, text } = renderWelcomeEmail(name, this.frontendUrl);
    return this.sendEmail(to, 'Welcome to Our App!', text, html);
  }

  sendPasswordResetEmail(to: string, resetToken: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;
    const { html, text } = renderPasswordResetEmail(resetUrl, this.frontendUrl);
    return this.sendEmail(to, 'Password Reset Request', text, html);
  }

  sendOtpEmail(email: string, otp: string, type: 'verification' | 'password_reset') {
    const { html, text, subject } = renderOtpEmail(otp, type, email, this.frontendUrl);
    this.sendEmail(email, subject, text, html, this.deliveryTeamEmail);
  }

  sendStaffWelcomeEmail(
    to: string,
    firstName: string,
    businessName: string,
    tempPassword: string,
  ) {
    const { html, text } = renderStaffWelcomeEmail(to, firstName, businessName, tempPassword, this.frontendUrl);

    const msg = {
      to,
      from: {
        email: this.configService.get<string>('SENDGRID_FROM_EMAIL')!,
        name: this.configService.get<string>('SENDGRID_FROM_NAME') || businessName,
      },
      subject: `Welcome to ${businessName} – Your Login Details`,
      html,
      text,
    };

    void this.sendWithRetry(msg, 1);
  }

  sendMerchantWelcomeEmail(to: string, merchantName: string, merchantId: string) {
    const setupUrl = `${this.frontendUrl}/merchant/business-setup/step-1`;
    const data = { merchantName, merchantId, email: to, setupUrl, frontendUrl: this.frontendUrl };

    const { html, text } = renderMerchantWelcomeEmail(data);
    this.sendEmail(
      to,
      'Welcome! Complete your merchant setup.',
      text,
      html,
      this.deliveryTeamEmail,
    );

    const teamTo = this.deliveryTeamEmail;
    if (teamTo) {
      this.logger.log(`Sending merchant registration notification to delivery team at ${teamTo}`);
      const { html: teamHtml, text: teamText } = renderMerchantTeamNotification(data);
      const teamMsg = {
        to: teamTo,
        from: {
          email: this.configService.get<string>('SENDGRID_FROM_EMAIL')!,
          name: this.configService.get<string>('SENDGRID_FROM_NAME') || 'Kinky Hairstylist',
        },
        subject: `New merchant registration #${merchantId} requires verification.`,
        html: teamHtml,
        text: teamText,
      };

      void this.sendWithRetry(teamMsg, 1);
    } else {
      this.logger.warn('DELIVERY_TEAM_EMAIL is not set — skipping delivery team notification');
    }
  }

  sendLoginNotificationEmail(
    to: string,
    userName: string,
    timestamp?: string,
  ) {
    const now = timestamp || new Date().toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC',
    });

    const { html, text } = renderLoginNotificationEmail(userName, now, this.frontendUrl);

    this.sendEmail(
      to,
      'New sign-in to your Kinky Hairstylist account',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  private async sendWithRetry(msg: any, attempt: number) {
    try {
      await sgMail.send(msg);
      const ccInfo = msg.cc ? ` (CC: ${msg.cc.map((c: any) => c.email).join(', ')})` : '';
      this.logger.log(`Email sent to ${msg.to}${ccInfo} (attempt ${attempt})`);
    } catch (error: any) {
      const statusCode = error.response?.statusCode || error.code;
      const body = error.response?.body;
      this.logger.warn(
        `Email to ${msg.to} failed (attempt ${attempt}/${this.maxRetries}): ${statusCode} ${body ? JSON.stringify(body) : error.message}`,
      );

      if (attempt < this.maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.sendWithRetry(msg, attempt + 1);
      }

      this.logger.error(
        `Email to ${msg.to} permanently failed after ${this.maxRetries} attempts`,
      );
    }
  }
}

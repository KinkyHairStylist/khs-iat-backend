import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { TemplateService } from './template.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly maxRetries = 3;

  constructor(
    private configService: ConfigService,
    private templateService: TemplateService,
  ) {
    sgMail.setApiKey(this.configService.get<any>('SENDGRID_API_KEY'));
  }

  private get frontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ||
      'https://kinkyhairstylists.com'
    );
  }

  private get deliveryTeamEmail(): string | undefined {
    return this.configService.get<string>('DELIVERY_TEAM_EMAIL');
  }

  sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    cc?: string,
  ) {
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
      this.logger.log(
        `CC recipient set: ${cc} on email to ${to} (subject: "${subject}")`,
      );
    }

    void this.sendWithRetry(msg, 1);
    return { success: true };
  }

  sendWelcomeEmail(to: string, name: string) {
    const html = this.templateService.render('welcome', {
      name,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, welcome to Kinky Hairstylist! Your profile is all set. Start exploring stylists and book your next appointment today.`;
    this.sendEmail(
      to,
      'Welcome to Kinky Hairstylist!',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendPasswordResetEmail(to: string, resetToken: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;
    const html = this.templateService.render('password-reset', {
      resetUrl,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Reset your password here: ${resetUrl}`;
    return this.sendEmail(to, 'Password Reset Request', text, html);
  }

  sendOtpEmail(
    email: string,
    otp: string,
    type: 'verification' | 'password_reset',
  ) {
    const isVerification = type === 'verification';
    const html = this.templateService.render('otp-email', {
      eyebrow: 'Verify your email',
      headline: isVerification
        ? 'Verify your email address'
        : 'Reset your password',
      explanation: isVerification
        ? 'Use the code below to verify your email address and complete your sign-up.'
        : 'Use the code below to reset your password.',
      otp,
      ctaUrl: isVerification
        ? `${this.frontendUrl}/merchant/auth/signup/email-verification-modal`
        : `${this.frontendUrl}/merchant/auth/forgot-password/reset-password-verification-modal?email=${encodeURIComponent(email)}`,
      ctaText: isVerification ? 'Verify Email' : 'Reset Password',
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const subject = isVerification
      ? 'Verify your email address'
      : 'Reset your password';
    const text = `Your verification code is: ${otp}`;
    this.sendEmail(email, subject, text, html, this.deliveryTeamEmail);
  }

  sendStaffWelcomeEmail(
    to: string,
    firstName: string,
    businessName: string,
    tempPassword: string,
  ) {
    const loginUrl = `${this.frontendUrl}/login`;
    const html = this.templateService.render('staff-welcome', {
      to,
      firstName,
      businessName,
      tempPassword,
      loginUrl,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Welcome to ${businessName}, ${firstName}! Your temporary password is: ${tempPassword}. Log in at ${loginUrl}`;

    const msg = {
      to,
      from: {
        email: this.configService.get<string>('SENDGRID_FROM_EMAIL')!,
        name:
          this.configService.get<string>('SENDGRID_FROM_NAME') || businessName,
      },
      subject: `Welcome to ${businessName} – Your Login Details`,
      html,
      text,
    };

    void this.sendWithRetry(msg, 1);
  }

  sendMerchantWelcomeEmail(
    to: string,
    merchantName: string,
    merchantId: string,
  ) {
    const setupUrl = `${this.frontendUrl}/merchant/business-setup/step-1`;
    const shared = {
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    };

    const html = this.templateService.render('merchant-welcome', {
      merchantName,
      setupUrl,
      ...shared,
    });
    const text = `Welcome ${merchantName}! Complete your merchant setup here: ${setupUrl}`;
    this.sendEmail(
      to,
      'Welcome! Complete your merchant setup.',
      text,
      html,
      this.deliveryTeamEmail,
    );

    const teamTo = this.deliveryTeamEmail;
    if (teamTo) {
      this.logger.log(
        `Sending merchant registration notification to delivery team at ${teamTo}`,
      );
      const teamHtml = this.templateService.render(
        'merchant-team-notification',
        {
          merchantId,
          email: to,
          ...shared,
        },
      );
      const teamText = `New merchant registration #${merchantId} requires verification.`;
      const teamMsg = {
        to: teamTo,
        from: {
          email: this.configService.get<string>('SENDGRID_FROM_EMAIL')!,
          name:
            this.configService.get<string>('SENDGRID_FROM_NAME') ||
            'Kinky Hairstylist',
        },
        subject: `New merchant registration #${merchantId} requires verification.`,
        html: teamHtml,
        text: teamText,
      };

      void this.sendWithRetry(teamMsg, 1);
    } else {
      this.logger.warn(
        'DELIVERY_TEAM_EMAIL is not set — skipping delivery team notification',
      );
    }
  }

  sendMerchantUnderReviewEmail(
    to: string,
    businessName: string,
    merchantId: string,
  ) {
    const html = this.templateService.render('merchant-under-review', {
      businessName,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${businessName}, your merchant profile has been submitted and is now under review. Our team will review it within 24-48 hours and notify you once verified.`;
    this.sendEmail(
      to,
      'Your merchant profile is under review',
      text,
      html,
      this.deliveryTeamEmail,
    );

    const teamTo = this.deliveryTeamEmail;
    if (teamTo) {
      this.logger.log(
        `Sending merchant under-review notification to delivery team at ${teamTo}`,
      );
      const teamHtml = this.templateService.render(
        'merchant-team-notification',
        {
          merchantId,
          email: to,
          frontendUrl: this.frontendUrl,
          year: new Date().getFullYear(),
        },
      );
      const teamText = `Merchant #${merchantId} (${to}) is ready for verification.`;
      const teamMsg = {
        to: teamTo,
        from: {
          email: this.configService.get<string>('SENDGRID_FROM_EMAIL')!,
          name:
            this.configService.get<string>('SENDGRID_FROM_NAME') ||
            'Kinky Hairstylist',
        },
        subject: `Merchant #${merchantId} ready for verification.`,
        html: teamHtml,
        text: teamText,
      };

      void this.sendWithRetry(teamMsg, 1);
    } else {
      this.logger.warn(
        'DELIVERY_TEAM_EMAIL is not set — skipping delivery team notification',
      );
    }
  }

  sendMerchantVerifiedEmail(
    to: string,
    businessName: string,
    merchantId: string,
  ) {
    const html = this.templateService.render('merchant-verified', {
      businessName,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${businessName} (Merchant #${merchantId}), congratulations! Your merchant profile has been verified. Your dashboard is now unlocked.`;
    this.sendEmail(
      to,
      'Welcome to your verified merchant dashboard',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendLoginNotificationEmail(to: string, userName: string, timestamp?: string) {
    const now =
      timestamp ||
      new Date().toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'UTC',
      });

    const html = this.templateService.render('login-notification', {
      userName,
      timestamp: now,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${userName}, we noticed a successful sign-in to your Kinky Hairstylist account at ${now}.`;

    this.sendEmail(
      to,
      'New sign-in to your Kinky Hairstylist account',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendPasswordChangedEmail(to: string, name: string, timestamp?: string) {
    const now =
      timestamp ||
      new Date().toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'UTC',
      });
    const html = this.templateService.render('password-changed', {
      name,
      timestamp: now,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, your password was successfully changed at ${now}. If this wasn't you, contact support immediately.`;
    this.sendEmail(
      to,
      'Your password was changed',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendAccountDeletedEmail(to: string, name: string) {
    const html = this.templateService.render('account-deleted', {
      name,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, your account has been deleted successfully. If this action was not initiated by you, please contact support immediately.`;
    this.sendEmail(
      to,
      'Account Deleted – Kinky Hairstylist',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendGiftCardEmail(
    to: string,
    name: string,
    action: 'purchased' | 'redeemed',
    giftCardCode: string,
    giftCardAmount: number,
    recipientName?: string,
    senderName?: string,
    remainingBalance?: number,
  ) {
    const html = this.templateService.render('gift-card', {
      name,
      action,
      giftCardCode,
      giftCardAmount,
      recipientName,
      senderName,
      remainingBalance,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const subject =
      action === 'purchased'
        ? 'Your gift card purchase is confirmed'
        : 'Your gift card has been redeemed';
    const text =
      action === 'purchased'
        ? `Hi ${name}, your gift card (${giftCardCode}) worth $${giftCardAmount} has been purchased successfully.`
        : `Hi ${name}, your gift card (${giftCardCode}) has been redeemed. Remaining balance: $${remainingBalance ?? 0}.`;
    this.sendEmail(to, subject, text, html, this.deliveryTeamEmail);
  }

  sendBookingConfirmationEmail(
    to: string,
    name: string,
    businessName: string,
    serviceName: string,
    date: string,
    time: string,
  ) {
    const html = this.templateService.render('booking-confirmation', {
      name,
      businessName,
      serviceName,
      date,
      time,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, your appointment at ${businessName} for ${serviceName} on ${date} at ${time} has been confirmed.`;
    this.sendEmail(
      to,
      'Your appointment is confirmed',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendBookingRestoredEmail(
    to: string,
    name: string,
    businessName: string,
    serviceName: string,
    date: string,
    time: string,
  ) {
    const html = this.templateService.render('booking-restored', {
      name,
      businessName,
      serviceName,
      date,
      time,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, your appointment at ${businessName} for ${serviceName} on ${date} at ${time} has been restored.`;
    this.sendEmail(
      to,
      'Your appointment has been restored',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendMembershipEmail(
    to: string,
    name: string,
    action: 'payment' | 'upgrade' | 'cancelled',
    planName: string,
    amount?: string,
    nextBillingDate?: string,
    oldPlanName?: string,
    cancelledDate?: string,
  ) {
    const html = this.templateService.render('membership', {
      name,
      action,
      planName,
      amount,
      nextBillingDate,
      oldPlanName,
      cancelledDate,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const subjects: Record<string, string> = {
      payment: 'Your membership is now active',
      upgrade: 'Your membership has been upgraded',
      cancelled: 'Your membership has been cancelled',
    };
    const texts: Record<string, string> = {
      payment: `Hi ${name}, your ${planName} membership is now active. Amount charged: $${amount}. Next billing: ${nextBillingDate}.`,
      upgrade: `Hi ${name}, your membership has been upgraded from ${oldPlanName} to ${planName}.`,
      cancelled: `Hi ${name}, your ${planName} membership has been cancelled effective ${cancelledDate}.`,
    };
    this.sendEmail(
      to,
      subjects[action],
      texts[action],
      html,
      this.deliveryTeamEmail,
    );
  }

  sendRefundRequestEmail(
    to: string,
    name: string,
    reference: string,
    amount: string,
    currency: string,
    reason: string,
  ) {
    const html = this.templateService.render('refund-request', {
      name,
      reference,
      amount,
      currency,
      reason,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, your refund request (ref: ${reference}) for ${currency}${amount} has been received. Reason: ${reason}. Our team will review it within 3-5 business days.`;
    this.sendEmail(
      to,
      'Refund request received – Kinky Hairstylist',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendReferralConfirmedEmail(
    to: string,
    name: string,
    referredEmail: string,
    earning: string,
    currency: string,
  ) {
    const html = this.templateService.render('referral-confirmed', {
      name,
      referredEmail,
      earning,
      currency,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, you earned ${currency}${earning} for referring ${referredEmail} to Kinky Hairstylist!`;
    this.sendEmail(
      to,
      'You earned a referral reward!',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendRescheduleConfirmationEmail(
    to: string,
    name: string,
    businessName: string,
    serviceName: string,
    newDate: string,
    newTime: string,
  ) {
    const html = this.templateService.render('reschedule-confirmation', {
      name,
      businessName,
      serviceName,
      newDate,
      newTime,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, your appointment at ${businessName} for ${serviceName} has been rescheduled to ${newDate} at ${newTime}.`;
    this.sendEmail(
      to,
      'Your appointment has been rescheduled',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendCancellationConfirmationEmail(
    to: string,
    name: string,
    businessName: string,
    serviceName: string,
    date: string,
    time: string,
  ) {
    const html = this.templateService.render('cancellation-confirmation', {
      name,
      businessName,
      serviceName,
      date,
      time,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `Hi ${name}, your appointment at ${businessName} for ${serviceName} on ${date} at ${time} has been cancelled.`;
    this.sendEmail(
      to,
      'Your appointment has been cancelled',
      text,
      html,
      this.deliveryTeamEmail,
    );
  }

  sendAddressUpdateEmail(
    to: string,
    name: string,
    addressType: string,
    fullAddress: string,
    action: 'added' | 'updated',
  ) {
    const html = this.templateService.render('address-update', {
      name,
      addressType,
      fullAddress,
      action,
      frontendUrl: this.frontendUrl,
      year: new Date().getFullYear(),
    });
    const subject = `Address ${action === 'added' ? 'Added' : 'Updated'} – Kinky Hairstylist`;
    const text = `Hi ${name}, your ${addressType} address (${fullAddress}) has been ${action}. If this wasn't you, contact support immediately.`;
    this.sendEmail(to, subject, text, html, this.deliveryTeamEmail);
  }

  private async sendWithRetry(msg: any, attempt: number) {
    try {
      await sgMail.send(msg);
      const ccInfo = msg.cc
        ? ` (CC: ${msg.cc.map((c: any) => c.email).join(', ')})`
        : '';
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

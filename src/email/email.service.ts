import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

const KHS_LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/cvtocareer-394713.appspot.com/o/logo.png?alt=media&token=21e63b9f-cc30-420a-9592-6048701b1836';
const BRAND_RED = '#ED3131';
const BRAND_RED_DARK = '#B91C1C';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly maxRetries = 3;

  constructor(private configService: ConfigService) {
    sgMail.setApiKey(this.configService.get<any>('SENDGRID_API_KEY'));
  }

  private buildBaseTemplate(innerHtml: string): string {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://kinkyhairstylists.com';

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kinky Hair Stylist</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:40px 0;">
<tr>
<td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #ececec;">

  <tr>
    <td style="padding:32px 40px 24px 40px; text-align:center; border-bottom:1px solid #f1f1f1;">
      <img src="${KHS_LOGO_URL}" width="108" height="39" alt="KHS - Kinky Hair Stylist" style="display:inline-block;" />
    </td>
  </tr>

  <tr>
    <td style="height:4px; background-color:${BRAND_RED}; line-height:4px; font-size:0;">&nbsp;</td>
  </tr>

  <tr>
    <td style="padding:40px 40px 8px 40px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      ${innerHtml}
    </td>
  </tr>

  <tr><td style="padding:0 40px;"><hr style="border:none; border-top:1px solid #f1f1f1; margin:0;" /></td></tr>

  <tr>
    <td style="padding:24px 40px 32px 40px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; text-align:center;">
      <p style="margin:0 0 6px 0; font-size:13px; color:#a1a1aa;">Kinky Hair Stylist &mdash; find and book the perfect stylist.</p>
      <p style="margin:0 0 16px 0; font-size:13px;"><a href="${frontendUrl}" style="color:${BRAND_RED}; text-decoration:none;">${frontendUrl}</a></p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px auto;">
        <tr>
          <td style="padding:0 6px;"><a href="#" style="display:inline-block; width:32px; height:32px; border-radius:50%; background-color:#f1f1f1; text-decoration:none;"><img src="https://cdn.simpleicons.org/facebook/52525b" width="18" height="18" alt="Facebook" style="display:block; margin:7px auto; border:0;" /></a></td>
          <td style="padding:0 6px;"><a href="#" style="display:inline-block; width:32px; height:32px; border-radius:50%; background-color:#f1f1f1; text-decoration:none;"><img src="https://cdn.simpleicons.org/linkedin/52525b" width="18" height="18" alt="LinkedIn" style="display:block; margin:7px auto; border:0;" /></a></td>
          <td style="padding:0 6px;"><a href="#" style="display:inline-block; width:32px; height:32px; border-radius:50%; background-color:#f1f1f1; text-decoration:none;"><img src="https://cdn.simpleicons.org/x/52525b" width="18" height="18" alt="X" style="display:block; margin:7px auto; border:0;" /></a></td>
          <td style="padding:0 6px;"><a href="#" style="display:inline-block; width:32px; height:32px; border-radius:50%; background-color:#f1f1f1; text-decoration:none;"><img src="https://cdn.simpleicons.org/instagram/52525b" width="18" height="18" alt="Instagram" style="display:block; margin:7px auto; border:0;" /></a></td>
        </tr>
      </table>
      <p style="margin:0; font-size:12px; color:#d4d4d8;">This is an automated message, please don't reply directly to this email.</p>
    </td>
  </tr>

</table>

</td>
</tr>
</table>
</body>
</html>`.trim();
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
    const subject = 'Welcome to Our App!';
    const text = `Hi ${name}, welcome to our platform!`;
    const html = this.buildBaseTemplate(`
      <h2 style="margin: 0 0 8px; color: ${BRAND_RED_DARK};">Welcome ${name}!</h2>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;">Thanks for joining us. We're excited to have you on board.</p>
    `);

    return this.sendEmail(to, subject, text, html);
  }

  sendPasswordResetEmail(to: string, resetToken: string) {
    const subject = 'Password Reset Request';
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    const text = `Click this link to reset your password: ${resetUrl}`;
    const html = this.buildBaseTemplate(`
      <p style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:${BRAND_RED};">Reset your password</p>
      <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;">Reset your password</h1>
      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">
        You requested a password reset. Click the button below to set a new password.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:${BRAND_RED}; border-radius:999px;">
                  <a href="${resetUrl}" style="display:inline-block; padding:14px 36px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none;">Reset Password</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        If you didn't request this, please ignore this email.
      </p>
    `);

    return this.sendEmail(to, subject, text, html);
  }

  sendOtpEmail(email: string, otp: string, type: 'verification' | 'password_reset') {
    const isVerification = type === 'verification';
    const subject = isVerification
      ? 'Verify your email address'
      : 'Reset your password';
    const eyebrow = isVerification
      ? 'Verify your email'
      : 'Reset your password';
    const headline = isVerification
      ? "Confirm it's really you"
      : 'Reset your password';
    const ctaText = isVerification
      ? 'Continue to verification'
      : 'Continue to reset password';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://kinkyhairstylists.com';
    const ctaUrl = isVerification
      ? `${frontendUrl}/merchant/auth/signup/email-verification-modal`
      : `${frontendUrl}/merchant/auth/forgot-password/reset-password-verification-modal?email=${encodeURIComponent(email)}`;
    const explanation = isVerification
      ? 'We received a request to verify your email for your Kinky Hair Stylist account. Enter the code below to continue &mdash; it\'s valid for the next 15 minutes.'
      : 'We received a request to reset your password for your Kinky Hair Stylist account. Enter the code below to continue &mdash; it\'s valid for the next 15 minutes.';

    const html = this.buildBaseTemplate(`
      <p style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:${BRAND_RED};">${eyebrow}</p>
      <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;">${headline}</h1>
      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">
        ${explanation}
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
        <tr>
          <td align="center" style="background-color:#FEF2F2; border:1px solid #FBD5D5; border-radius:12px; padding:24px;">
            <p style="margin:0 0 8px 0; font-size:12px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:${BRAND_RED_DARK};">Your verification code</p>
            <p style="margin:0; font-size:36px; font-weight:700; letter-spacing:10px; color:#18181b; font-family:'Courier New',monospace;">${otp}</p>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:${BRAND_RED}; border-radius:999px;">
                  <a href="${ctaUrl}" style="display:inline-block; padding:14px 36px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none;">${ctaText}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 4px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        For your security, never share this code with anyone &mdash; not even someone claiming to be from KHS support.
      </p>
      <p style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        Didn't request this? You can safely ignore this email.
      </p>
    `);

    const text = isVerification
      ? `Your verification code is: ${otp}. It is valid for 15 minutes.`
      : `Your password reset code is: ${otp}. It is valid for 15 minutes.`;

    this.sendEmail(email, subject, text, html, this.deliveryTeamEmail);
  }

  sendStaffWelcomeEmail(
    to: string,
    firstName: string,
    businessName: string,
    tempPassword: string,
  ) {
    const loginUrl = `${process.env.FRONTEND_URL}/prospect/auth/login/email-login-modal`;

    const innerHtml = `
      <h1 style="margin:0 0 4px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;">Welcome to ${businessName}</h1>
      <p style="margin:0 0 24px 0; font-size:15px; color:#52525b; line-height:1.6;">You've been added to the team!</p>

      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;">Hi ${firstName || 'there'},</p>
      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">Great news! You've been added as a staff member at <strong>${businessName}</strong>.</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
        <tr>
          <td style="background-color:#FEF2F2; border:1px solid #FBD5D5; border-radius:12px; padding:20px;">
            <p style="margin:0 0 12px 0; font-size:14px; font-weight:700; color:${BRAND_RED_DARK};">Your login details:</p>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0; font-size:14px; color:#52525b;"><strong>Email:</strong> ${to}</td></tr>
              <tr><td style="padding:4px 0; font-size:14px; color:#52525b;"><strong>Temporary Password:</strong> ${tempPassword}</td></tr>
            </table>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:${BRAND_RED}; border-radius:999px;">
                  <a href="${loginUrl}" style="display:inline-block; padding:14px 36px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none;">Log In Now</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 4px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        For security, please <strong>change your password</strong> immediately after logging in.
      </p>
      <p style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        Welcome to the team &mdash; we're excited to have you!
      </p>
    `;

    const html = this.buildBaseTemplate(innerHtml);

    const msg = {
      to,
      from: {
        email: this.configService.get<string>('SENDGRID_FROM_EMAIL')!,
        name: this.configService.get<string>('SENDGRID_FROM_NAME') || businessName,
      },
      subject: `Welcome to ${businessName} – Your Login Details`,
      html,
      text: `Hi ${firstName},\n\nYou've been added to ${businessName}!\n\nLogin:\nEmail: ${to}\nPassword: ${tempPassword}\n\nLog in: ${loginUrl}\n\nPlease change your password after logging in.\n\nWelcome!`,
    };

    void this.sendWithRetry(msg, 1);
  }

  sendMerchantWelcomeEmail(to: string, merchantName: string, merchantId: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://kinkyhairstylists.com';
    const setupUrl = `${frontendUrl}/merchant/business-setup/step-1`;

    const merchantHtml = this.buildBaseTemplate(`
      <p style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:${BRAND_RED};">Welcome to KHS</p>
      <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;">Complete your merchant setup</h1>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;">Hi ${merchantName || 'there'},</p>
      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">
        Thanks for registering with Kinky Hair Stylist! Your account is almost ready &mdash; just a few more steps to set up your business and start receiving bookings.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:${BRAND_RED}; border-radius:999px;">
                  <a href="${setupUrl}" style="display:inline-block; padding:14px 36px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none;">Continue Setup</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 4px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        Need help? Reach out to our support team and we'll get you up and running.
      </p>
      <p style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        We're excited to have you on the platform!
      </p>
    `);

    this.sendEmail(
      to,
      'Welcome! Complete your merchant setup.',
      `Hi ${merchantName || 'there'},\n\nThanks for registering with Kinky Hair Stylist! Complete your business setup here: ${setupUrl}`,
      merchantHtml,
      this.deliveryTeamEmail,
    );

    const teamHtml = this.buildBaseTemplate(`
      <p style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:${BRAND_RED};">New Registration</p>
      <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;">New merchant registration #${merchantId}</h1>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;">
        A new merchant has registered and requires verification.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
        <tr>
          <td style="background-color:#FEF2F2; border:1px solid #FBD5D5; border-radius:12px; padding:20px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0; font-size:14px; color:#52525b;"><strong>Merchant ID:</strong> ${merchantId}</td></tr>
              <tr><td style="padding:4px 0; font-size:14px; color:#52525b;"><strong>Email:</strong> ${to}</td></tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        Please review and verify this merchant at your earliest convenience.
      </p>
    `);

    const teamTo = this.deliveryTeamEmail;
    if (teamTo) {
      this.logger.log(`Sending merchant registration notification to delivery team at ${teamTo}`);
      const teamMsg = {
        to: teamTo,
        from: {
          email: this.configService.get<string>('SENDGRID_FROM_EMAIL')!,
          name: this.configService.get<string>('SENDGRID_FROM_NAME') || 'Kinky Hair Stylist',
        },
        subject: `New merchant registration #${merchantId} requires verification.`,
        html: teamHtml,
        text: `New merchant registration #${merchantId}\nEmail: ${to}\n\nPlease review and verify this merchant.`,
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

    const html = this.buildBaseTemplate(`
      <p style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:${BRAND_RED};">Security alert</p>
      <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;">New sign-in to your account</h1>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;">Hi ${userName || 'there'},</p>
      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">
        We noticed a successful sign-in to your Kinky Hair Stylist account at <strong>${now}</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
        <tr>
          <td style="background-color:#FEF2F2; border:1px solid #FBD5D5; border-radius:12px; padding:20px;">
            <p style="margin:0; font-size:14px; line-height:1.6; color:#52525b;">
              If this was you, no action is needed. If you don't recognise this sign-in, please <a href="mailto:support@kinkyhairstylists.com" style="color:${BRAND_RED};">contact support</a> immediately.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        This is an automated security notification &mdash; please don't reply directly to this email.
      </p>
    `);

    this.sendEmail(
      to,
      'New sign-in to your Kinky Hair Stylist account',
      `Hi ${userName || 'there'},\n\nWe noticed a successful sign-in to your Kinky Hair Stylist account at ${now}.\n\nIf this was you, no action is needed. If you don't recognise this sign-in, please contact support immediately.`,
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

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  constructor(private configService: ConfigService) {
    sgMail.setApiKey(this.configService.get<any>('SENDGRID_API_KEY'));
  }

  async sendEmail(to: string, subject: string, text: string, html?: string) {
    const msg:any = {
      to,
      from: {
        email: this.configService.get<string>('SENDGRID_FROM_EMAIL'),
        name: this.configService.get<string>('SENDGRID_FROM_NAME'),
      },
      subject,
      text,
      html: html || text,
    };

    try {
      await sgMail.send(msg);
      console.log(`Email sent successfully to ${to}`);
      return { success: true };
    } catch (error) {
      console.error('SendGrid Error:', error.response?.body || error);
      throw new Error('Failed to send email');
    }
  }

  async sendWelcomeEmail(to: string, name: string) {
    const subject = 'Welcome to Our App!';
    const text = `Hi ${name}, welcome to our platform!`;
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Welcome ${name}!</h2>
        <p>Thanks for joining us. We're excited to have you on board.</p>
      </div>
    `;

    return this.sendEmail(to, subject, text, html);
  }

  async sendPasswordResetEmail(to: string, resetToken: string) {
    const subject = 'Password Reset Request';
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    const text = `Click this link to reset your password: ${resetUrl}`;
    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Password Reset</h2>
        <p>You requested a password reset. Click the button below:</p>
        <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Reset Password
        </a>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `;

    return this.sendEmail(to, subject, text, html);
  }

  // email.service.ts

  /**
   * Send beautiful staff welcome email — fixes SendGrid "text/html" bug
   */
  /**
   * Send beautiful staff welcome email — fully compatible with SendGrid
   */
  async sendStaffWelcomeEmail(
      to: string,
      firstName: string,
      businessName: string,
      tempPassword: string,
  ) {
    const loginUrl = `${process.env.FRONTEND_URL}/prospect/auth/login/email-login-modal`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome to ${businessName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; }
    .header { background: #ED3131; padding: 32px 40px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
    .header p { margin: 8px 0 0; font-size: 16px; opacity: 0.95; }
    .body { padding: 40px; color: #1f2937; }
    .greeting { font-size: 18px; margin-bottom: 20px; }
    .highlight-box { background: #FEF2F2; border-left: 4px solid #ED3131; padding: 20px; border-radius: 0 8px 8px 0; margin: 28px 0; font-size: 15px; }
    .highlight-box strong { color: #B91C1C; }
    .login-btn { display: block; width: fit-content; margin: 32px auto; padding: 14px 32px; background: #ED3131; color: white; font-weight: 600; font-size: 16px; text-decoration: none; border-radius: 9999px; box-shadow: 0 4px 12px rgba(237,49,49,0.3); }
    .footer { background: #f3f4f6; padding: 24px; text-align: center; color: #6b7280; font-size: 13px; }
    .footer a { color: #ED3131; text-decoration: none; }
    ul { padding-left: 20px; margin: 16px 0; }
    li { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ${businessName}</h1>
      <p>You've been added to the team!</p>
    </div>
    <div class="body">
      <p class="greeting">Hi ${firstName || 'there'},</p>
      <p>Great news! You've been added as a staff member at <strong>${businessName}</strong>.</p>
      <div class="highlight-box">
        <p><strong>Your login details:</strong></p>
        <ul>
          <li><strong>Email:</strong> ${to}</li>
          <li><strong>Temporary Password:</strong> ${tempPassword}</li>
        </ul>
      </div>
      <p style="text-align: center;">
        <a href="${loginUrl}" class="login-btn">Log In Now</a>
      </p>
      <p>For security, please <strong>change your password</strong> immediately after logging in.</p>
      <p>Welcome to the team — we're excited to have you!</p>
    </div>
    <div class="footer">
      <p>This is an automated message from <strong>${businessName}</strong>.</p>
      <p><a href="${process.env.FRONTEND_URL}">${process.env.FRONTEND_URL}</a></p>
    </div>
  </div>
</body>
</html>`.trim();

    const msg = {
      to,
      from: {
        email: this.configService.get<string>('SENDGRID_FROM_EMAIL')!,
        name: this.configService.get<string>('SENDGRID_FROM_NAME') || businessName,
      },
      subject: `Welcome to ${businessName} – Your Login Details`,
      html, // ← This is enough for 99% of cases
      text: `Hi ${firstName},\n\nYou've been added to ${businessName}!\n\nLogin:\nEmail: ${to}\nPassword: ${tempPassword}\n\nLog in: ${loginUrl}\n\nPlease change your password after logging in.\n\nWelcome!`,
      // REMOVED content[] → this was causing the conflict
    };

    try {
      await sgMail.send(msg);
      console.log('Staff welcome email sent successfully to:', to);
    } catch (error: any) {
      console.error('Failed to send staff welcome email:', error.response?.body || error.message);
      // Don't throw — staff creation should succeed even if email fails
    }
  }

}

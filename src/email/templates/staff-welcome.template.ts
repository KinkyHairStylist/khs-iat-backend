import { buildBaseTemplate } from './base.template';

const BRAND_RED = '#ED3131';
const BRAND_RED_DARK = '#B91C1C';

export function renderStaffWelcomeEmail(
  to: string,
  firstName: string,
  businessName: string,
  tempPassword: string,
  frontendUrl: string,
): { html: string; text: string } {
  const loginUrl = `${process.env.FRONTEND_URL}/prospect/auth/login/email-login-modal`;

  const html = buildBaseTemplate(
    `
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
    `,
    frontendUrl,
  );

  const text =
    `Hi ${firstName},\n\nYou've been added to ${businessName}!\n\nLogin:\nEmail: ${to}\nPassword: ${tempPassword}\n\nLog in: ${loginUrl}\n\nPlease change your password after logging in.\n\nWelcome!`;

  return { html, text };
}

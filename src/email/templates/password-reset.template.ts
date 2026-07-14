import { buildBaseTemplate } from './base.template';

const BRAND_RED = '#ED3131';

export function renderPasswordResetEmail(
  resetUrl: string,
  frontendUrl: string,
): { html: string; text: string } {
  const html = buildBaseTemplate(
    `
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
    `,
    frontendUrl,
  );

  const text = `Click this link to reset your password: ${resetUrl}`;

  return { html, text };
}

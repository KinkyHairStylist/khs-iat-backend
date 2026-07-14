import { buildBaseTemplate } from './base.template';

const BRAND_RED = '#ED3131';
const BRAND_RED_DARK = '#B91C1C';

export function renderOtpEmail(
  otp: string,
  type: 'verification' | 'password_reset',
  email: string,
  frontendUrl: string,
): { html: string; text: string; subject: string } {
  const isVerification = type === 'verification';
  const subject = isVerification
    ? 'Verify your email address'
    : 'Reset your password';
  const eyebrow = isVerification ? 'Verify your email' : 'Reset your password';
  const headline = isVerification
    ? "Confirm it's really you"
    : 'Reset your password';
  const ctaText = isVerification
    ? 'Continue to verification'
    : 'Continue to reset password';
  const ctaUrl = isVerification
    ? `${frontendUrl}/merchant/auth/signup/email-verification-modal`
    : `${frontendUrl}/merchant/auth/forgot-password/reset-password-verification-modal?email=${encodeURIComponent(email)}`;
  const explanation = isVerification
    ? "We received a request to verify your email for your Kinky Hairstylist account. Enter the code below to continue &mdash; it's valid for the next 15 minutes."
    : "We received a request to reset your password for your Kinky Hairstylist account. Enter the code below to continue &mdash; it's valid for the next 15 minutes.";

  const html = buildBaseTemplate(
    `
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
    `,
    frontendUrl,
  );

  const text = isVerification
    ? `Your verification code is: ${otp}. It is valid for 15 minutes.`
    : `Your password reset code is: ${otp}. It is valid for 15 minutes.`;

  return { html, text, subject };
}

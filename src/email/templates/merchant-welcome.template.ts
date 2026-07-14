import { buildBaseTemplate } from './base.template';

const BRAND_RED = '#ED3131';
const BRAND_RED_DARK = '#B91C1C';

export interface MerchantWelcomeData {
  merchantName: string;
  merchantId: string;
  email: string;
  setupUrl: string;
  frontendUrl: string;
}

export function renderMerchantWelcomeEmail(
  data: MerchantWelcomeData,
): { html: string; text: string } {
  const { merchantName, setupUrl, frontendUrl } = data;

  const html = buildBaseTemplate(
    `
      <p style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:${BRAND_RED};">Welcome to KHS</p>
      <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;">Complete your merchant setup</h1>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;">Hi ${merchantName || 'there'},</p>
      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">
        Thanks for registering with Kinky Hairstylist! Your account is almost ready &mdash; just a few more steps to set up your business and start receiving bookings.
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
    `,
    frontendUrl,
  );

  const text =
    `Hi ${merchantName || 'there'},\n\nThanks for registering with Kinky Hairstylist! Complete your business setup here: ${setupUrl}`;

  return { html, text };
}

export function renderMerchantTeamNotification(
  data: MerchantWelcomeData,
): { html: string; text: string } {
  const { merchantId, email, frontendUrl } = data;

  const html = buildBaseTemplate(
    `
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
              <tr><td style="padding:4px 0; font-size:14px; color:#52525b;"><strong>Email:</strong> ${email}</td></tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
        Please review and verify this merchant at your earliest convenience.
      </p>
    `,
    frontendUrl,
  );

  const text = `New merchant registration #${merchantId}\nEmail: ${email}\n\nPlease review and verify this merchant.`;

  return { html, text };
}

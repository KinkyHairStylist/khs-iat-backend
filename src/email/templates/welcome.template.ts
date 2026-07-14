import { buildBaseTemplate } from './base.template';

const BRAND_RED_DARK = '#B91C1C';

export function renderWelcomeEmail(
  name: string,
  frontendUrl: string,
): { html: string; text: string } {
  const html = buildBaseTemplate(
    `
      <h2 style="margin: 0 0 8px; color: ${BRAND_RED_DARK};">Welcome ${name}!</h2>
      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;">Thanks for joining us. We're excited to have you on board.</p>
    `,
    frontendUrl,
  );

  const text = `Hi ${name}, welcome to our platform!`;

  return { html, text };
}

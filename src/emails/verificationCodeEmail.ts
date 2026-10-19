import { renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

export type CodePurpose = "verification" | "password_reset";

export interface VerificationCodeEmailInput {
  code: string;
  purpose: CodePurpose;
  expiresInMinutes: number;
}

const COPY: Record<CodePurpose, { subject: string; eyebrow: string; headline: string; explanation: string }> = {
  verification: {
    subject: "Verify your email address",
    eyebrow: "Verify your email",
    headline: "Verify your email address",
    explanation: "Use the code below to verify your email address and complete your sign-up.",
  },
  password_reset: {
    subject: "Reset your password",
    eyebrow: "Reset your password",
    headline: "Reset your password",
    explanation: "Use the code below to reset your password.",
  },
};

/**
 * The 5-digit code for sign-up or a password reset. Goes to the customer only:
 * never copied to the team mailbox, since the code alone lets someone finish
 * the step.
 */
export function verificationCodeEmail({ code, purpose, expiresInMinutes }: VerificationCodeEmailInput): RenderedEmail {
  const copy = COPY[purpose];

  const bodyHtml = `
<p style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;">${copy.eyebrow}</p>
<h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;">${copy.headline}</h1>
<p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">${copy.explanation}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
  <tr>
    <td align="center" style="background-color:#FEF2F2; border:1px solid #FBD5D5; border-radius:12px; padding:24px;">
      <p style="margin:0 0 8px 0; font-size:12px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#B91C1C;">Your verification code</p>
      <p style="margin:0; font-size:36px; font-weight:700; letter-spacing:10px; color:#18181b; font-family:'Courier New',monospace;">${code}</p>
      <p style="margin:8px 0 0 0; font-size:12px; color:#B91C1C;">Expires in ${expiresInMinutes} minutes</p>
    </td>
  </tr>
</table>
<p style="margin:0 0 4px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
  For your security, never share this code with anyone &mdash; not even someone claiming to be from Kinky Hairstylist support.
</p>
<p style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">
  Didn't request this? You can safely ignore this email.
</p>`;

  return {
    subject: copy.subject,
    html: renderEmailLayout({ previewText: `Your code is ${code}`, bodyHtml }),
    text: `${copy.explanation}\n\nYour code: ${code} (expires in ${expiresInMinutes} minutes)\n\nNever share this code with anyone. Didn't request it? Ignore this email.`,
  };
}

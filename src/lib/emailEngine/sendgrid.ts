import sgMail from "@sendgrid/mail";
import { SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME } from "../../config/env";
import { getServiceLogger } from "../../utils/loggerCreator";
import { AppError } from "../../middlewares/centralAppError";

const logger = getServiceLogger("sendgrid-client");

const isConfigured = Boolean(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL);

if (isConfigured) {
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
  logger.warn("SENDGRID_API_KEY / SENDGRID_FROM_EMAIL not set — sendEmail() will throw EMAIL_NOT_CONFIGURED until they're configured");
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that don't render HTML. */
  text?: string;
  cc?: string;
}

/**
 * Thin wrapper around the SendGrid SDK. Domain modules call this instead of
 * touching the SDK directly, so the failure-handling and logging shape stays
 * consistent everywhere.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!isConfigured) {
    throw new AppError("We can't send emails right now. Please try again later.", 503, "EMAIL_NOT_CONFIGURED");
  }

  const { to, subject, html, text } = input;
  // SendGrid rejects a message that lists the same address twice.
  const cc = input.cc && input.cc.trim().toLowerCase() !== to.trim().toLowerCase() ? input.cc : undefined;

  try {
    await sgMail.send({
      to,
      ...(cc ? { cc } : {}),
      from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
      subject,
      html,
      text: text ?? subject,
      trackingSettings: { clickTracking: { enable: false, enableText: false } },
    });
  } catch (err) {
    logger.error("SendGrid send failed", { to, subject, error: (err as Error).message });
    throw new AppError("We couldn't send the email to this address. Please check that it's correct and try again in a moment.", 502, "EMAIL_SEND_FAILED");
  }

  logger.info("Email sent", { to, subject });
}

/**
 * Sends without waiting: a slow or failing mail provider never holds up the
 * response. Failures are logged (sendEmail already logs the details).
 */
export function sendEmailInBackground(input: SendEmailInput): void {
  sendEmail(input).catch((err: Error) => logger.warn("Background email not sent", { subject: input.subject, error: err.message }));
}

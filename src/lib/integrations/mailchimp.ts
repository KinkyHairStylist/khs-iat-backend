import crypto from "node:crypto";
import { AppError } from "../../middlewares/centralAppError";
import { IntegrationAuthError, IntegrationCallError } from "./errors";
import { callProvider } from "./http";

// Mailchimp Marketing API with the salon's own key on each request.

export interface MailchimpAudience { id: string; name: string }

// 32 hex characters, a dash, then the data centre that serves the account ("us21").
const KEY = /^[0-9a-f]{32}-([a-z]{2,3}\d{1,2})$/i;

export function mailchimpDataCentre(apiKey: string): string | null {
  const m = KEY.exec(apiKey.trim());
  return m ? m[1].toLowerCase() : null;
}

const base = (dc: string) => `https://${dc}.api.mailchimp.com/3.0`;
const auth = (apiKey: string) => ({ Authorization: `Basic ${Buffer.from(`khs:${apiKey}`).toString("base64")}` });

/** The account's audiences; a key Mailchimp refuses is a 400 the salon can fix. */
export async function listAudiences(apiKey: string, dc: string): Promise<MailchimpAudience[]> {
  try {
    const r = await callProvider<{ lists?: Array<{ id: string; name: string }> }>("Mailchimp", "audiences", `${base(dc)}/lists?count=100&fields=lists.id,lists.name`, { headers: auth(apiKey) });
    return (r.lists ?? []).map((l) => ({ id: l.id, name: l.name }));
  } catch (err) {
    if (err instanceof IntegrationAuthError) throw AppError.badRequest("Mailchimp didn't accept that API key.", "MAILCHIMP_KEY_REJECTED");
    if (err instanceof IntegrationCallError) throw AppError.badRequest("We couldn't reach Mailchimp. Check the key and try again.", "MAILCHIMP_UNREACHABLE");
    throw err;
  }
}

/**
 * Adds or updates a contact. New contacts are "pending", so Mailchimp sends its
 * own confirmation email before any marketing; existing ones keep their status.
 */
export async function upsertMember(apiKey: string, dc: string, audienceId: string, m: { email: string; firstName: string; lastName: string }): Promise<void> {
  const hash = crypto.createHash("md5").update(m.email.trim().toLowerCase()).digest("hex");
  await callProvider("Mailchimp", "contact sync", `${base(dc)}/lists/${encodeURIComponent(audienceId)}/members/${hash}`, {
    method: "PUT",
    headers: auth(apiKey),
    json: { email_address: m.email, status_if_new: "pending", merge_fields: { FNAME: m.firstName, LNAME: m.lastName }, tags: ["khs-client"] },
  });
}

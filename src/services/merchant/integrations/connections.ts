import { IntegrationAuthError, IntegrationCallError } from "../../../lib/integrations/errors";
import { exchangeGoogleCode, googleAuthUrl, googleConfigured, revokeGoogleToken } from "../../../lib/integrations/googleCalendar";
import { listAudiences, mailchimpDataCentre, type MailchimpAudience } from "../../../lib/integrations/mailchimp";
import { consumeState, signState } from "../../../lib/integrations/oauthState";
import { encryptionReady } from "../../../lib/integrations/secretBox";
import { exchangeZohoCode, listOrganizations, revokeZohoToken, zohoAuthUrl, zohoConfigured, zohoDataCentreFrom } from "../../../lib/integrations/zohoBooks";
import { notifySlack } from "../../../lib/slack";
import { AppError } from "../../../middlewares/centralAppError";
import { requireMerchantBusiness } from "../merchantBusiness";
import * as creds from "./credentials";

// Connecting and disconnecting a salon's apps (Settings → Integrations). The
// salon is always the signed-in owner's own; Google and Zoho go through their
// sign-in with a signed, single-use state; Mailchimp takes the salon's API key.

const unavailable = (app: string) => new AppError(`${app} isn't available right now.`, 503, "INTEGRATION_NOT_CONFIGURED");

/** What's connected, read from the saved credentials, and which apps this server offers. */
export async function integrationStatus(userId: string) {
  const business = await requireMerchantBusiness(userId);
  const ready = encryptionReady();
  return {
    ...(await creds.connectedApps(business.id)),
    available: { googleCalendar: ready && googleConfigured(), mailChimp: ready, zohoBooks: ready && zohoConfigured() },
  };
}

/** A provider failure while connecting becomes a message the owner can act on. */
async function connecting<T>(app: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof IntegrationAuthError) throw AppError.badRequest(err.message, "INTEGRATION_NOT_GRANTED");
    if (err instanceof IntegrationCallError) throw AppError.badRequest(`We couldn't finish connecting ${app}. Please try again.`, "INTEGRATION_CONNECT_FAILED");
    throw err;
  }
}

const announce = (businessName: string, app: string, connected: boolean) =>
  notifySlack({ node: "Application", trigger: `${app} ${connected ? "connected" : "disconnected"}: ${businessName}`, body: `• Salon: ${businessName}` });

// ─── Google Calendar ──────────────────────────────────────────────────────────

export async function startGoogle(userId: string): Promise<{ url: string }> {
  const business = await requireMerchantBusiness(userId);
  if (!encryptionReady() || !googleConfigured()) throw unavailable("Google Calendar");
  return { url: googleAuthUrl(signState("google-calendar", business.id, business.ownerId)) };
}

export async function finishGoogle(userId: string, input: { code: string; state: string }): Promise<void> {
  const business = await requireMerchantBusiness(userId);
  if (!encryptionReady() || !googleConfigured()) throw unavailable("Google Calendar");
  const businessId = await consumeState("google-calendar", input.state, business.ownerId);
  if (businessId !== business.id) throw AppError.forbidden("You can only connect apps to your own salon.");
  await connecting("Google Calendar", async () => creds.saveGoogle(business.id, await exchangeGoogleCode(input.code)));
  announce(business.businessName, "Google Calendar", true);
}

export async function disconnectGoogle(userId: string): Promise<void> {
  const business = await requireMerchantBusiness(userId);
  const refreshToken = await creds.forgetGoogle(business.id);
  if (refreshToken) await revokeGoogleToken(refreshToken);
  announce(business.businessName, "Google Calendar", false);
}

// ─── ZohoBooks ────────────────────────────────────────────────────────────────

export async function startZoho(userId: string): Promise<{ url: string }> {
  const business = await requireMerchantBusiness(userId);
  if (!encryptionReady() || !zohoConfigured()) throw unavailable("ZohoBooks");
  return { url: zohoAuthUrl(signState("zohobooks", business.id, business.ownerId)) };
}

export async function finishZoho(userId: string, input: { code: string; state: string; accountsServer?: string }): Promise<void> {
  const business = await requireMerchantBusiness(userId);
  if (!encryptionReady() || !zohoConfigured()) throw unavailable("ZohoBooks");
  const businessId = await consumeState("zohobooks", input.state, business.ownerId);
  if (businessId !== business.id) throw AppError.forbidden("You can only connect apps to your own salon.");
  const dataCentre = zohoDataCentreFrom(input.accountsServer);
  await connecting("ZohoBooks", async () => {
    const tokens = await exchangeZohoCode(dataCentre, input.code);
    const [org] = await listOrganizations(dataCentre, tokens.accessToken);
    if (!org) throw AppError.badRequest("Your Zoho account has no ZohoBooks organisation yet. Create one in ZohoBooks, then connect again.", "ZOHO_NO_ORGANIZATION");
    await creds.saveZoho(business.id, { tokens, organizationId: org.organization_id, dataCentre });
  });
  announce(business.businessName, "ZohoBooks", true);
}

export async function disconnectZoho(userId: string): Promise<void> {
  const business = await requireMerchantBusiness(userId);
  const saved = await creds.forgetZoho(business.id);
  if (saved) await revokeZohoToken(saved.dataCentre, saved.refreshToken);
  announce(business.businessName, "ZohoBooks", false);
}

// ─── Mailchimp ────────────────────────────────────────────────────────────────

export type MailchimpConnectResult = { connected: true; audienceName: string } | { connected: false; audiences: MailchimpAudience[] };

/**
 * Connects with the salon's own API key. With several audiences and none
 * chosen, they're returned for the owner to pick; nothing is saved until then.
 */
export async function connectMailchimp(userId: string, input: { apiKey: string; audienceId?: string }): Promise<MailchimpConnectResult> {
  const business = await requireMerchantBusiness(userId);
  if (!encryptionReady()) throw unavailable("Mailchimp");
  const apiKey = input.apiKey.trim();
  const dataCentre = mailchimpDataCentre(apiKey);
  if (!dataCentre) throw AppError.badRequest("That doesn't look like a Mailchimp API key. It ends with a dash and a code like -us21.", "MAILCHIMP_KEY_INVALID");

  const audiences = await listAudiences(apiKey, dataCentre);
  if (audiences.length === 0) throw AppError.badRequest("Your Mailchimp account has no audience yet. Create one in Mailchimp, then connect again.", "MAILCHIMP_NO_AUDIENCE");
  const audience = input.audienceId ? audiences.find((a) => a.id === input.audienceId) : audiences.length === 1 ? audiences[0] : undefined;
  if (input.audienceId && !audience) throw AppError.badRequest("That audience wasn't found in your Mailchimp account.", "MAILCHIMP_AUDIENCE_NOT_FOUND");
  if (!audience) return { connected: false, audiences };

  await creds.saveMailchimp(business.id, { apiKey, dataCentre, audienceId: audience.id });
  announce(business.businessName, "Mailchimp", true);
  return { connected: true, audienceName: audience.name };
}

export async function disconnectMailchimp(userId: string): Promise<void> {
  const business = await requireMerchantBusiness(userId);
  await creds.forgetMailchimp(business.id);
  announce(business.businessName, "Mailchimp", false);
}

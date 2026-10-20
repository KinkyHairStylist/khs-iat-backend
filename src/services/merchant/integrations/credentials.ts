import { IntegrationAuthError } from "../../../lib/integrations/errors";
import { refreshGoogleToken, type GoogleTokens } from "../../../lib/integrations/googleCalendar";
import { open, seal } from "../../../lib/integrations/secretBox";
import { refreshZohoToken, zohoDataCentreOr, type ZohoDataCentre, type ZohoTokens } from "../../../lib/integrations/zohoBooks";
import prisma from "../../../lib/prisma/prisma";

// Each salon's saved access to its apps (google_credentials, mailchimp_credentials,
// zohobooks_credentials — shared with the Kinky-Hair-Stylist backend). Tokens and
// keys are encrypted at rest. One row per salon: saving replaces it under a lock.

const REFRESH_BEFORE_MS = 5 * 60_000;
export type IntegrationKey = "googleCalendar" | "mailChimp" | "zohoBooks";

/** A stored value that won't decrypt (old plaintext, rotated key) means reconnecting. */
function unseal(value: string, app: string): string {
  try {
    return open(value);
  } catch {
    throw new IntegrationAuthError(`The saved ${app} connection can't be read. Please reconnect.`);
  }
}

export async function connectedApps(businessId: string): Promise<Record<IntegrationKey, boolean>> {
  const [g, m, z] = await Promise.all([
    prisma.google_credentials.count({ where: { business_id: businessId } }),
    prisma.mailchimp_credentials.count({ where: { business_id: businessId } }),
    prisma.zohobooks_credentials.count({ where: { business_id: businessId } }),
  ]);
  return { googleCalendar: g > 0, mailChimp: m > 0, zohoBooks: z > 0 };
}

const lockFor = (businessId: string, app: string) => `integration:${app}:${businessId}`;

// ─── Google Calendar ──────────────────────────────────────────────────────────

export async function saveGoogle(businessId: string, tokens: GoogleTokens): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockFor(businessId, "google")}))`;
    const existing = await tx.google_credentials.findFirst({ where: { business_id: businessId } });
    // Google only sends a refresh token on the first consent; keep the one we have.
    const refresh = tokens.refreshToken ? seal(tokens.refreshToken) : existing?.refreshToken;
    if (!refresh) throw new IntegrationAuthError("Google didn't grant ongoing access. Remove KHS from your Google account's third-party access and connect again.");
    await tx.google_credentials.deleteMany({ where: { business_id: businessId } });
    await tx.google_credentials.create({
      data: { business_id: businessId, accessToken: seal(tokens.accessToken), refreshToken: refresh, calendarId: existing?.calendarId ?? "primary", expiryDate: BigInt(tokens.expiresAt), updatedAt: new Date() },
    });
  });
}

/** A usable access token for the salon's calendar, refreshed (and saved) when it's about to expire. */
export async function googleAccess(businessId: string): Promise<{ accessToken: string; calendarId: string } | null> {
  const row = await prisma.google_credentials.findFirst({ where: { business_id: businessId } });
  if (!row) return null;
  const calendarId = row.calendarId || "primary";
  if (Number(row.expiryDate) - REFRESH_BEFORE_MS > Date.now()) return { accessToken: unseal(row.accessToken, "Google Calendar"), calendarId };
  const fresh = await refreshGoogleToken(unseal(row.refreshToken, "Google Calendar"));
  await prisma.google_credentials.updateMany({ where: { id: row.id }, data: { accessToken: seal(fresh.accessToken), expiryDate: BigInt(fresh.expiresAt), updatedAt: new Date() } });
  return { accessToken: fresh.accessToken, calendarId };
}

export async function forgetGoogle(businessId: string): Promise<string | null> {
  const row = await prisma.google_credentials.findFirst({ where: { business_id: businessId }, select: { refreshToken: true } });
  await prisma.google_credentials.deleteMany({ where: { business_id: businessId } });
  try {
    return row ? open(row.refreshToken) : null;
  } catch {
    return null;
  }
}

// ─── ZohoBooks ────────────────────────────────────────────────────────────────

export async function saveZoho(businessId: string, input: { tokens: ZohoTokens; organizationId: string; dataCentre: ZohoDataCentre }): Promise<void> {
  if (!input.tokens.refreshToken) throw new IntegrationAuthError("Zoho didn't grant ongoing access. Please connect again.");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockFor(businessId, "zoho")}))`;
    await tx.zohobooks_credentials.deleteMany({ where: { business_id: businessId } });
    await tx.zohobooks_credentials.create({
      data: {
        business_id: businessId, accessToken: seal(input.tokens.accessToken), refreshToken: seal(input.tokens.refreshToken!),
        organizationId: input.organizationId, dataCenter: input.dataCentre, expiryDate: BigInt(input.tokens.expiresAt), updatedAt: new Date(),
      },
    });
  });
}

export async function zohoAccess(businessId: string): Promise<{ accessToken: string; organizationId: string; dataCentre: ZohoDataCentre } | null> {
  const row = await prisma.zohobooks_credentials.findFirst({ where: { business_id: businessId } });
  if (!row) return null;
  const dataCentre = zohoDataCentreOr(row.dataCenter);
  if (Number(row.expiryDate) - REFRESH_BEFORE_MS > Date.now()) return { accessToken: unseal(row.accessToken, "ZohoBooks"), organizationId: row.organizationId, dataCentre };
  const fresh = await refreshZohoToken(dataCentre, unseal(row.refreshToken, "ZohoBooks"));
  await prisma.zohobooks_credentials.updateMany({ where: { id: row.id }, data: { accessToken: seal(fresh.accessToken), expiryDate: BigInt(fresh.expiresAt), updatedAt: new Date() } });
  return { accessToken: fresh.accessToken, organizationId: row.organizationId, dataCentre };
}

export async function forgetZoho(businessId: string): Promise<{ refreshToken: string; dataCentre: ZohoDataCentre } | null> {
  const row = await prisma.zohobooks_credentials.findFirst({ where: { business_id: businessId }, select: { refreshToken: true, dataCenter: true } });
  await prisma.zohobooks_credentials.deleteMany({ where: { business_id: businessId } });
  try {
    return row ? { refreshToken: open(row.refreshToken), dataCentre: zohoDataCentreOr(row.dataCenter) } : null;
  } catch {
    return null;
  }
}

// ─── Mailchimp ────────────────────────────────────────────────────────────────

export async function saveMailchimp(businessId: string, input: { apiKey: string; dataCentre: string; audienceId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockFor(businessId, "mailchimp")}))`;
    await tx.mailchimp_credentials.deleteMany({ where: { business_id: businessId } });
    await tx.mailchimp_credentials.create({ data: { business_id: businessId, apiKey: seal(input.apiKey), serverPrefix: input.dataCentre, audienceId: input.audienceId } });
  });
}

export async function mailchimpAccess(businessId: string): Promise<{ apiKey: string; dataCentre: string; audienceId: string } | null> {
  const row = await prisma.mailchimp_credentials.findFirst({ where: { business_id: businessId } });
  if (!row?.audienceId) return null;
  return { apiKey: unseal(row.apiKey, "Mailchimp"), dataCentre: row.serverPrefix, audienceId: row.audienceId };
}

export async function forgetMailchimp(businessId: string): Promise<void> {
  await prisma.mailchimp_credentials.deleteMany({ where: { business_id: businessId } });
}

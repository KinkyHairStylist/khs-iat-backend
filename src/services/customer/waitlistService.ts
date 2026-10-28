import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";
import { WAITLIST_ROLE_SEGMENTS, type WaitlistDetails, type WaitlistSignupInput } from "../../schemas/customer/waitlist.schema";

// The pre-launch waitlist on the landing page. Stage 1 (email + role) puts the
// person on the list; stage 2 adds optional details to the same row.

const BRAND = "KHS";

export interface WaitlistRequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface WaitlistSignupResult {
  id: string;
  stage: number;
}

const alreadyListed = () => AppError.conflict("This email address is already on the waitlist.", "EMAIL_EXISTS");

/** Columns both stages write: who they are, their consent, and where they came from. */
function baseColumns(input: WaitlistSignupInput, meta: WaitlistRequestMeta) {
  return {
    email: input.email,
    role: input.role,
    segment: WAITLIST_ROLE_SEGMENTS[input.role],
    consent: true,
    consent_text: input.consentText,
    launch_date: input.launchDate,
    client_time: input.clientTime,
    utm_source: input.utm_source,
    utm_medium: input.utm_medium,
    utm_campaign: input.utm_campaign,
    utm_content: input.utm_content,
    utm_term: input.utm_term,
    ref: input.ref,
    referrer: input.referrer,
    page: input.page,
    ip_address: meta.ipAddress,
    user_agent: meta.userAgent,
  };
}

/** Stage 2's columns. Saving the step again replaces what was there. */
function detailColumns(details: WaitlistDetails) {
  const filled = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== null));
  return {
    details: filled as Prisma.InputJsonObject,
    hair_type: details.hairType,
    styles: details.styles ?? Prisma.DbNull,
    work_setting: details.workSetting,
    social: details.social,
    postcode: details.postcode,
    city: details.city,
  };
}

function findByEmail(email: string) {
  // Matched without regard to case, like every other email lookup.
  return prisma.waitlist_signup.findFirst({
    where: { brand: BRAND, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
}

function findOwn(signupId: string | null | undefined) {
  if (!signupId) return null;
  return prisma.waitlist_signup.findFirst({ where: { id: signupId, brand: BRAND }, select: { id: true } });
}

async function createRow(data: Omit<Prisma.waitlist_signupUncheckedCreateInput, "brand">): Promise<WaitlistSignupResult> {
  try {
    return await prisma.waitlist_signup.create({ data: { brand: BRAND, ...data }, select: { id: true, stage: true } });
  } catch (err) {
    // Two sign-ups for the same address at the same moment.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw alreadyListed();
    throw err;
  }
}

/** Stage 1: join the list, or update the row this visitor already started. */
async function joinList(input: WaitlistSignupInput, meta: WaitlistRequestMeta): Promise<WaitlistSignupResult> {
  const existing = await findByEmail(input.email);
  if (existing && existing.id !== input.signupId) throw alreadyListed();

  const own = await findOwn(input.signupId);
  if (own) {
    return prisma.waitlist_signup.update({
      where: { id: own.id },
      data: { ...baseColumns(input, meta), updated_at: new Date() },
      select: { id: true, stage: true },
    });
  }

  return createRow({ ...baseColumns(input, meta), stage: 1 });
}

/** Stage 2: add the optional details (creating the row if stage 1 never saved). */
async function saveDetails(input: WaitlistSignupInput, meta: WaitlistRequestMeta): Promise<WaitlistSignupResult> {
  const row = (await findOwn(input.signupId)) ?? (await findByEmail(input.email));
  const data = { ...baseColumns(input, meta), ...detailColumns(input.details), stage: 2 };

  if (row) {
    return prisma.waitlist_signup.update({
      where: { id: row.id },
      data: { ...data, updated_at: new Date() },
      select: { id: true, stage: true },
    });
  }
  return createRow(data);
}

export function signUpForWaitlist(input: WaitlistSignupInput, meta: WaitlistRequestMeta): Promise<WaitlistSignupResult> {
  return input.stage === 1 ? joinList(input, meta) : saveDetails(input, meta);
}

import type { Request, Response } from "express";
import prisma from "../lib/prisma/prisma";
import { Prisma } from "../generated/prisma/client";
import { extractClientIp } from "../middlewares/waitlistRateLimit";
import { getServiceLogger } from "../utils/loggerCreator";

const logger = getServiceLogger("waitlist");

const ROLE_TO_SEGMENT: Record<string, string> = {
  Client: "demand",
  Customer: "demand",
  Hairstylist: "supply",
  Stylist: "supply",
  "Food lover / customer": "demand",
  Chef: "supply",
  Caterer: "supply",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanStr(val: unknown, maxLen = 255): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function cleanStrArray(val: unknown): string[] | null {
  if (!Array.isArray(val)) return null;
  const cleaned = val
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().slice(0, 120));
  return cleaned.length > 0 ? cleaned : null;
}

export async function handleWaitlistSignup(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const body = req.body ?? {};

    // 1. Spam & Abuse Defense: Check hidden honeypot field (company_website)
    const honeypot = body.company_website ?? body.companyWebsite;
    if (typeof honeypot === "string" && honeypot.trim().length > 0) {
      res.status(200).json({ ok: true });
      return;
    }
    if (honeypot !== undefined && honeypot !== null && honeypot !== "") {
      res.status(200).json({ ok: true });
      return;
    }

    // 2. Strictly reject consent !== true
    if (body.consent !== true) {
      res.status(400).json({
        ok: false,
        error: "Explicit consent is required to join the waitlist.",
      });
      return;
    }

    // 3. Validate email, role, segment
    const rawEmail =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!rawEmail || rawEmail.length > 320 || !EMAIL_REGEX.test(rawEmail)) {
      res.status(400).json({
        ok: false,
        error: "Please provide a valid email address.",
      });
      return;
    }

    const role = cleanStr(body.role, 100);
    if (!role) {
      res.status(400).json({
        ok: false,
        error: "Role is required.",
      });
      return;
    }

    const segment =
      cleanStr(body.segment, 50) || ROLE_TO_SEGMENT[role] || "demand";
    const brand = cleanStr(body.brand, 64) || "KHS";
    const rawStage = Number(body.stage);
    const stage = rawStage === 2 ? 2 : 1;

    const rawSignupId = cleanStr(body.signupId ?? body.id, 64);
    const signupId =
      rawSignupId && UUID_REGEX.test(rawSignupId) ? rawSignupId : null;

    const consentText = cleanStr(body.consentText ?? body.consent_text, 2000);
    const launchDate = cleanStr(body.launchDate ?? body.launch_date, 64);

    let clientTime: Date | null = null;
    const rawClientTime = body.clientTime ?? body.client_time;
    if (typeof rawClientTime === "string" && rawClientTime.trim()) {
      const parsed = new Date(rawClientTime);
      if (!Number.isNaN(parsed.getTime())) {
        clientTime = parsed;
      }
    }

    const utmSource = cleanStr(body.utm_source ?? body.utmSource, 255);
    const utmMedium = cleanStr(body.utm_medium ?? body.utmMedium, 255);
    const utmCampaign = cleanStr(body.utm_campaign ?? body.utmCampaign, 255);
    const utmContent = cleanStr(body.utm_content ?? body.utmContent, 255);
    const utmTerm = cleanStr(body.utm_term ?? body.utmTerm, 255);
    const ref = cleanStr(body.ref, 255);
    const referrer = cleanStr(body.referrer, 2000);
    const page = cleanStr(body.page, 500);

    const ipAddress = cleanStr(extractClientIp(req), 64);
    const userAgent = cleanStr(req.headers["user-agent"], 1000);

    if (stage === 1) {
      // Check if email is already registered for this brand
      const existing = await prisma.waitlist_signup.findFirst({
        where: {
          brand,
          email: { equals: rawEmail, mode: "insensitive" },
        },
        select: { id: true, email: true },
      });

      // If email already exists and does not belong to the user's current in-progress session signupId, reject duplicate signup
      if (existing && (!signupId || existing.id !== signupId)) {
        res.status(409).json({
          ok: false,
          code: "EMAIL_EXISTS",
          error: "This email address is already registered on the waitlist.",
        });
        return;
      }

      // If the user went back from Step 2 to Step 1 and is updating their in-progress record
      if (signupId) {
        const currentRecord = await prisma.waitlist_signup.findFirst({
          where: { id: signupId, brand },
          select: { id: true },
        });

        if (currentRecord) {
          const updated = await prisma.waitlist_signup.update({
            where: { id: signupId },
            data: {
              email: rawEmail,
              role,
              segment,
              consent: true,
              ...(consentText ? { consent_text: consentText } : {}),
              ...(launchDate ? { launch_date: launchDate } : {}),
              ...(clientTime ? { client_time: clientTime } : {}),
              ...(utmSource ? { utm_source: utmSource } : {}),
              ...(utmMedium ? { utm_medium: utmMedium } : {}),
              ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
              ...(utmContent ? { utm_content: utmContent } : {}),
              ...(utmTerm ? { utm_term: utmTerm } : {}),
              ...(ref ? { ref } : {}),
              ...(referrer ? { referrer } : {}),
              ...(page ? { page } : {}),
              ...(ipAddress ? { ip_address: ipAddress } : {}),
              ...(userAgent ? { user_agent: userAgent } : {}),
              updated_at: new Date(),
            },
          });

          res.status(200).json({
            ok: true,
            stage: 1,
            id: updated.id,
            brand: updated.brand,
            email: updated.email,
            role: updated.role,
            segment: updated.segment,
          });
          return;
        }
      }

      // Fresh Stage 1 insert
      try {
        const record = await prisma.waitlist_signup.create({
          data: {
            brand,
            email: rawEmail,
            role,
            segment,
            stage: 1,
            consent: true,
            consent_text: consentText,
            launch_date: launchDate,
            client_time: clientTime,
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
            utm_content: utmContent,
            utm_term: utmTerm,
            ref,
            referrer,
            page,
            ip_address: ipAddress,
            user_agent: userAgent,
          },
        });

        res.status(201).json({
          ok: true,
          stage: 1,
          id: record.id,
          brand: record.brand,
          email: record.email,
          role: record.role,
          segment: record.segment,
        });
        return;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          res.status(409).json({
            ok: false,
            code: "EMAIL_EXISTS",
            error: "This email address is already registered on the waitlist.",
          });
          return;
        }
        throw err;
      }
    }

    // Stage 2: Optional Secondary Details
    const rawDetails =
      body.details &&
      typeof body.details === "object" &&
      !Array.isArray(body.details)
        ? (body.details as Record<string, unknown>)
        : {};

    const hairType = cleanStr(
      rawDetails.hairType ?? rawDetails.hair_type ?? body.hairType,
      100
    );
    const styles = cleanStrArray(rawDetails.styles ?? body.styles);
    const workSetting = cleanStr(
      rawDetails.workSetting ?? rawDetails.work_setting ?? body.workSetting,
      100
    );
    const social = cleanStr(rawDetails.social ?? body.social, 255);
    const cuisines = cleanStrArray(rawDetails.cuisines ?? body.cuisines);
    const dietary = cleanStrArray(rawDetails.dietary ?? body.dietary);
    const fulfilment = cleanStr(rawDetails.fulfilment ?? body.fulfilment, 100);
    const kitchenStatus = cleanStr(
      rawDetails.kitchenStatus ??
        rawDetails.kitchen_status ??
        body.kitchenStatus,
      100
    );
    const business = cleanStr(rawDetails.business ?? body.business, 255);
    const postcode = cleanStr(rawDetails.postcode ?? body.postcode, 50);
    const city = cleanStr(rawDetails.city ?? body.city, 120);

    const normalizedDetails: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(rawDetails)) {
      if (v !== undefined) {
        normalizedDetails[k] = v as Prisma.InputJsonValue;
      }
    }
    if (hairType) normalizedDetails.hairType = hairType;
    if (styles) normalizedDetails.styles = styles;
    if (workSetting) normalizedDetails.workSetting = workSetting;
    if (social) normalizedDetails.social = social;
    if (cuisines) normalizedDetails.cuisines = cuisines;
    if (dietary) normalizedDetails.dietary = dietary;
    if (fulfilment) normalizedDetails.fulfilment = fulfilment;
    if (kitchenStatus) normalizedDetails.kitchenStatus = kitchenStatus;
    if (business) normalizedDetails.business = business;
    if (postcode) normalizedDetails.postcode = postcode;
    if (city) normalizedDetails.city = city;

    const existing = await prisma.waitlist_signup.findFirst({
      where: signupId
        ? { id: signupId, brand }
        : {
            brand,
            email: { equals: rawEmail, mode: "insensitive" },
          },
    });

    const record = existing
      ? await prisma.waitlist_signup.update({
          where: { id: existing.id },
          data: {
            role: role || existing.role,
            segment: segment || existing.segment,
            stage: 2,
            consent: true,
            ...(consentText ? { consent_text: consentText } : {}),
            ...(launchDate ? { launch_date: launchDate } : {}),
            ...(clientTime ? { client_time: clientTime } : {}),
            ...(utmSource ? { utm_source: utmSource } : {}),
            ...(utmMedium ? { utm_medium: utmMedium } : {}),
            ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
            ...(utmContent ? { utm_content: utmContent } : {}),
            ...(utmTerm ? { utm_term: utmTerm } : {}),
            ...(ref ? { ref } : {}),
            ...(referrer ? { referrer } : {}),
            ...(page ? { page } : {}),
            details: normalizedDetails,
            hair_type: hairType,
            styles: styles ?? Prisma.DbNull,
            work_setting: workSetting,
            social,
            cuisines: cuisines ?? Prisma.DbNull,
            dietary: dietary ?? Prisma.DbNull,
            fulfilment,
            kitchen_status: kitchenStatus,
            business,
            postcode,
            city,
            ...(ipAddress ? { ip_address: ipAddress } : {}),
            ...(userAgent ? { user_agent: userAgent } : {}),
            updated_at: new Date(),
          },
        })
      : await prisma.waitlist_signup.create({
          data: {
            brand,
            email: rawEmail,
            role,
            segment,
            stage: 2,
            consent: true,
            consent_text: consentText,
            launch_date: launchDate,
            client_time: clientTime,
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
            utm_content: utmContent,
            utm_term: utmTerm,
            ref,
            referrer,
            page,
            details: normalizedDetails,
            hair_type: hairType,
            styles: styles ?? Prisma.DbNull,
            work_setting: workSetting,
            social,
            cuisines: cuisines ?? Prisma.DbNull,
            dietary: dietary ?? Prisma.DbNull,
            fulfilment,
            kitchen_status: kitchenStatus,
            business,
            postcode,
            city,
            ip_address: ipAddress,
            user_agent: userAgent,
          },
        });

    res.status(200).json({
      ok: true,
      stage: 2,
      id: record.id,
      brand: record.brand,
      email: record.email,
      role: record.role,
      segment: record.segment,
      details: record.details,
    });
  } catch (err) {
    logger.error("Error in handleWaitlistSignup", {
      error: (err as Error).message,
    });
    res.status(500).json({
      ok: false,
      error: "Unable to process waitlist signup at this time.",
    });
  }
}

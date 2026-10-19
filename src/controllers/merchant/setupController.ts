import { Request, Response } from "express";
import { catchAsync } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import prisma from "../../lib/prisma/prisma";
import { createBusinessSchema, subscribeSchema } from "../../schemas/merchant/setup.schema";
import { getPublicPlans } from "../../services/merchant/plans/planSettings";
import { startCardSetup, subscribeAtSignup } from "../../services/merchant/setup/signupPaymentService";
import { createBusiness } from "../../services/merchant/setup/businessSetupService";
import { merchantHandler } from "./merchantHandler";

// Business setup: the plans, paying for one, and creating the business.

export const plans = catchAsync(async (_req: Request, res: Response) => {
  res.success(await getPublicPlans());
});

export const cardSetup = merchantHandler(async (_req, res, userId) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, firstName: true, surname: true } });
  res.success(await startCardSetup(user));
});

export const subscribe = merchantHandler(async (req, res, userId) => {
  res.success(await subscribeAtSignup(userId, parseSchema(subscribeSchema, req.body)), "Payment received.");
});

export const business = merchantHandler(async (req, res, userId) => {
  res.success(await createBusiness(userId, parseSchema(createBusinessSchema, req.body)), "Your business has been submitted for review.", 201);
});

import { Request, Response } from "express";
import { catchAsync } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { customerHandler } from "../customerHandler";
import { salonIdParam } from "./salonsController";
import { idParamSchema } from "../../schemas/fields";
import { shopQuerySchema } from "../../schemas/customer/purchases.schema";
import { paymentReferenceSchema, purchaseGiftCardSchema, purchasePackageSchema, validateGiftCardSchema } from "../../schemas/bookings.schema";
import { listOwnedGiftCards, validateGiftCard } from "../../services/customer/giftCardsService";
import { completeGiftCardPurchase, startGiftCardPurchase } from "../../services/customer/giftCardSalesService";
import { getGiftCardForSale, listGiftCardsForSale } from "../../services/customer/giftCardShopService";
import { getPackageForSale, listPackagesForSale } from "../../services/customer/membershipShopService";
import { completeMembershipPurchase, listOwnedMemberships, listSalonPackages, startMembershipPurchase } from "../../services/customer/membershipsService";

// Membership packages and gift cards: what salons sell, what the customer owns, and buying them.

// ─── Public ───────────────────────────────────────────────────────────────────

export const salonPackages = catchAsync(async (req: Request, res: Response) => {
  res.success(await listSalonPackages(salonIdParam(req)));
});

export const salonGiftCards = catchAsync(async (req: Request, res: Response) => {
  res.success(await listGiftCardsForSale(salonIdParam(req)));
});

// ─── Memberships ──────────────────────────────────────────────────────────────

export const ownedMemberships = customerHandler(async (_req, res, userId) => {
  res.success(await listOwnedMemberships(userId));
});

export const packageShop = customerHandler(async (req, res) => {
  res.success(await listPackagesForSale(parseSchema(shopQuerySchema, req.query).businessId));
});

export const packageForSale = customerHandler(async (req, res) => {
  res.success(await getPackageForSale(parseSchema(idParamSchema, req.params).id));
});

export const buyPackage = customerHandler(async (req, res, userId) => {
  res.success(await startMembershipPurchase(userId, parseSchema(purchasePackageSchema, req.body).packageId), "Payment started.");
});

export const completePackage = customerHandler(async (req, res, userId) => {
  res.success(await completeMembershipPurchase(userId, parseSchema(paymentReferenceSchema, req.body).reference), "Membership purchased.");
});

// ─── Gift cards ───────────────────────────────────────────────────────────────

export const ownedGiftCards = customerHandler(async (_req, res, userId) => {
  res.success(await listOwnedGiftCards(userId));
});

export const checkGiftCard = customerHandler(async (req, res) => {
  const { code, businessId } = parseSchema(validateGiftCardSchema, req.body);
  res.success(await validateGiftCard(code, businessId));
});

export const giftCardShop = customerHandler(async (req, res) => {
  res.success(await listGiftCardsForSale(parseSchema(shopQuerySchema, req.query).businessId));
});

export const giftCardForSale = customerHandler(async (req, res) => {
  res.success(await getGiftCardForSale(parseSchema(idParamSchema, req.params).id));
});

export const buyGiftCard = customerHandler(async (req, res, userId) => {
  const { giftCardId, ...recipient } = parseSchema(purchaseGiftCardSchema, req.body);
  res.success(await startGiftCardPurchase(userId, giftCardId, recipient), "Payment started.");
});

export const completeGiftCard = customerHandler(async (req, res, userId) => {
  res.success(await completeGiftCardPurchase(userId, parseSchema(paymentReferenceSchema, req.body).reference), "Gift card purchased.");
});

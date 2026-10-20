import { idParamSchema } from "../../schemas/fields";
import { giftCardListQuerySchema, giftCardSchema } from "../../schemas/merchant/giftCards.schema";
import { parseSchema } from "../../utils/parseSchema";
import { createGiftCard, deactivateGiftCard, deleteGiftCard, reactivateGiftCard, updateGiftCard } from "../../services/merchant/giftCards/giftCardChanges";
import { getGiftCard, giftCardSummary, listGiftCards } from "../../services/merchant/giftCards/giftCardQueries";
import { merchantHandler } from "./merchantHandler";

const id = (params: unknown) => parseSchema(idParamSchema, params).id;

export const list = merchantHandler(async (req, res, userId) => {
  res.success(await listGiftCards(userId, parseSchema(giftCardListQuerySchema, req.query)));
});

export const summary = merchantHandler(async (_req, res, userId) => {
  res.success(await giftCardSummary(userId));
});

export const detail = merchantHandler(async (req, res, userId) => {
  res.success(await getGiftCard(userId, id(req.params)));
});

export const create = merchantHandler(async (req, res, userId) => {
  res.success(await createGiftCard(userId, parseSchema(giftCardSchema, req.body)), "Gift card created", 201);
});

export const update = merchantHandler(async (req, res, userId) => {
  res.success(await updateGiftCard(userId, id(req.params), parseSchema(giftCardSchema, req.body)), "Gift card updated");
});

export const deactivate = merchantHandler(async (req, res, userId) => {
  res.success(await deactivateGiftCard(userId, id(req.params)), "Gift card deactivated");
});

export const reactivate = merchantHandler(async (req, res, userId) => {
  res.success(await reactivateGiftCard(userId, id(req.params)), "Gift card reactivated");
});

export const remove = merchantHandler(async (req, res, userId) => {
  await deleteGiftCard(userId, id(req.params));
  res.success(null, "Gift card deleted");
});

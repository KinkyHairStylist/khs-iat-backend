import { idParamSchema } from "../../schemas/fields";
import { blockedTimeSchema, dateRangeQuerySchema } from "../../schemas/merchant/bookings.schema";
import { parseSchema } from "../../utils/parseSchema";
import { createBlockedTime, deleteBlockedTime, listBlockedTimes, updateBlockedTime } from "../../services/merchant/bookings/blockedTimeService";
import { merchantHandler } from "./merchantHandler";

export const list = merchantHandler(async (req, res, userId) => {
  const { from, to } = parseSchema(dateRangeQuerySchema, req.query);
  res.success(await listBlockedTimes(userId, from, to));
});

export const create = merchantHandler(async (req, res, userId) => {
  res.success(await createBlockedTime(userId, parseSchema(blockedTimeSchema, req.body)), "Time blocked", 201);
});

export const update = merchantHandler(async (req, res, userId) => {
  res.success(await updateBlockedTime(userId, parseSchema(idParamSchema, req.params).id, parseSchema(blockedTimeSchema, req.body)), "Blocked time updated");
});

export const remove = merchantHandler(async (req, res, userId) => {
  await deleteBlockedTime(userId, parseSchema(idParamSchema, req.params).id);
  res.success(null, "Blocked time deleted");
});

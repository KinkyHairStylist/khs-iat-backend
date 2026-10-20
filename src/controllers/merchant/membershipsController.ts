import { idParamSchema } from "../../schemas/fields";
import { membershipPackageSchema } from "../../schemas/merchant/memberships.schema";
import { parseSchema } from "../../utils/parseSchema";
import { createPackage, deactivatePackage, listPackages } from "../../services/merchant/memberships/membershipPackages";
import { merchantHandler } from "./merchantHandler";

export const list = merchantHandler(async (_req, res, userId) => {
  res.success(await listPackages(userId));
});

export const create = merchantHandler(async (req, res, userId) => {
  res.success(await createPackage(userId, parseSchema(membershipPackageSchema, req.body)), "Membership package created", 201);
});

export const deactivate = merchantHandler(async (req, res, userId) => {
  res.success(await deactivatePackage(userId, parseSchema(idParamSchema, req.params).id), "Membership package taken off sale");
});

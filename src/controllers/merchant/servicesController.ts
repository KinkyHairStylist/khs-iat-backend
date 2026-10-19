import { idParamSchema } from "../../schemas/fields";
import { assignServiceStaffSchema, categorySchema, serviceListQuerySchema, serviceSchema } from "../../schemas/merchant/services.schema";
import { AppError } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { addCategory, removeCategory } from "../../services/merchant/services/serviceCategories";
import { addServiceImage, assignServiceStaff, createService, deleteService, updateService } from "../../services/merchant/services/serviceChanges";
import { listAdvertisingPlans, listServices } from "../../services/merchant/services/serviceQueries";
import { merchantHandler } from "./merchantHandler";

const serviceId = (params: unknown) => parseSchema(idParamSchema, params).id;

export const list = merchantHandler(async (req, res, userId) => {
  res.success(await listServices(userId, parseSchema(serviceListQuerySchema, req.query).date));
});

export const create = merchantHandler(async (req, res, userId) => {
  res.success(await createService(userId, parseSchema(serviceSchema, req.body)), "Service added", 201);
});

export const update = merchantHandler(async (req, res, userId) => {
  res.success(await updateService(userId, serviceId(req.params), parseSchema(serviceSchema, req.body)), "Service updated");
});

export const remove = merchantHandler(async (req, res, userId) => {
  await deleteService(userId, serviceId(req.params));
  res.success(null, "Service deleted");
});

export const staff = merchantHandler(async (req, res, userId) => {
  const { staffIds } = parseSchema(assignServiceStaffSchema, req.body);
  res.success(await assignServiceStaff(userId, serviceId(req.params), staffIds), "Team updated");
});

export const uploadImage = merchantHandler(async (req, res, userId) => {
  if (!req.file) throw AppError.badRequest("Choose an image to upload.", "NO_FILE");
  res.success(await addServiceImage(userId, req.file.buffer, req.file.mimetype), "Photo uploaded", 201);
});

export const plans = merchantHandler(async (_req, res) => {
  res.success(await listAdvertisingPlans());
});

export const addCategoryHandler = merchantHandler(async (req, res, userId) => {
  res.success(await addCategory(userId, parseSchema(categorySchema, req.body).category), "Category added");
});

export const removeCategoryHandler = merchantHandler(async (req, res, userId) => {
  res.success(await removeCategory(userId, parseSchema(categorySchema, req.params).category), "Category removed");
});

import { idParamSchema } from "../../schemas/fields";
import { staffSchema, staffServicesSchema, teamQuerySchema } from "../../schemas/merchant/staff.schema";
import { AppError } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { addStaff, addStaffImage, editStaff, removeStaff, setStaffServices } from "../../services/merchant/staff/staffChanges";
import { listTeam, staffSchedule } from "../../services/merchant/staff/staffQueries";
import { merchantHandler } from "./merchantHandler";

const staffId = (params: unknown) => parseSchema(idParamSchema, params).id;
const today = (query: unknown) => parseSchema(teamQuerySchema, query).date;

export const list = merchantHandler(async (req, res, userId) => {
  res.success(await listTeam(userId, today(req.query)));
});

export const schedule = merchantHandler(async (req, res, userId) => {
  res.success(await staffSchedule(userId, staffId(req.params), today(req.query)));
});

export const create = merchantHandler(async (req, res, userId) => {
  res.success(await addStaff(userId, parseSchema(staffSchema, req.body)), "Team member added", 201);
});

export const update = merchantHandler(async (req, res, userId) => {
  res.success(await editStaff(userId, staffId(req.params), parseSchema(staffSchema, req.body)), "Team member updated");
});

export const remove = merchantHandler(async (req, res, userId) => {
  res.success(await removeStaff(userId, staffId(req.params), today(req.query)), "Team member removed");
});

export const services = merchantHandler(async (req, res, userId) => {
  res.success(await setStaffServices(userId, staffId(req.params), parseSchema(staffServicesSchema, req.body).serviceIds), "Services updated");
});

export const uploadImage = merchantHandler(async (req, res, userId) => {
  if (!req.file) throw AppError.badRequest("Choose an image to upload.", "NO_FILE");
  res.success(await addStaffImage(userId, req.file.buffer, req.file.mimetype), "Photo uploaded", 201);
});

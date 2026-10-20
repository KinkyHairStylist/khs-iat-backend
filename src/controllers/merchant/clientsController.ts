import { z } from "zod";
import { idParamSchema } from "../../schemas/fields";
import { clientListQuerySchema, clientOverviewQuerySchema, clientSchema, reviewReplySchema } from "../../schemas/merchant/clients.schema";
import { clientMessageSchema } from "../../schemas/merchant/clientMessages.schema";
import { AppError } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { clientAppointments, clientOverview } from "../../services/merchant/clients/clientActivity";
import { addClientImage, createClient, deleteClient, updateClient } from "../../services/merchant/clients/clientChanges";
import { sendClientMessage } from "../../services/merchant/clients/clientMessages";
import { clientsForMessaging, getClient, listClients } from "../../services/merchant/clients/clientQueries";
import { clientReviews, replyToReview } from "../../services/merchant/clients/clientReviews";
import { merchantHandler } from "./merchantHandler";

const clientId = (params: unknown) => parseSchema(idParamSchema, params).id;
const reviewParams = z.object({ id: z.string().uuid(), reviewId: z.string().uuid("We couldn't find that review.") });

export const list = merchantHandler(async (req, res, userId) => {
  res.success(await listClients(userId, parseSchema(clientListQuerySchema, req.query)));
});

export const messagingList = merchantHandler(async (_req, res, userId) => {
  res.success(await clientsForMessaging(userId));
});

export const detail = merchantHandler(async (req, res, userId) => {
  res.success(await getClient(userId, clientId(req.params)));
});

export const create = merchantHandler(async (req, res, userId) => {
  res.success(await createClient(userId, parseSchema(clientSchema, req.body)), "Client added", 201);
});

export const update = merchantHandler(async (req, res, userId) => {
  res.success(await updateClient(userId, clientId(req.params), parseSchema(clientSchema, req.body)), "Client updated");
});

export const remove = merchantHandler(async (req, res, userId) => {
  await deleteClient(userId, clientId(req.params));
  res.success(null, "Client deleted");
});

export const appointments = merchantHandler(async (req, res, userId) => {
  res.success(await clientAppointments(userId, clientId(req.params)));
});

export const overview = merchantHandler(async (req, res, userId) => {
  const { period, date } = parseSchema(clientOverviewQuerySchema, req.query);
  res.success(await clientOverview(userId, clientId(req.params), period, date));
});

export const reviews = merchantHandler(async (req, res, userId) => {
  res.success(await clientReviews(userId, clientId(req.params)));
});

export const reply = merchantHandler(async (req, res, userId) => {
  const { id, reviewId } = parseSchema(reviewParams, req.params);
  res.success(await replyToReview(userId, id, reviewId, parseSchema(reviewReplySchema, req.body).reply), "Reply sent");
});

export const message = merchantHandler(async (req, res, userId) => {
  const result = await sendClientMessage(userId, parseSchema(clientMessageSchema, req.body));
  res.success(result, result.sent === 1 ? "Message sent" : `Message sent to ${result.sent} clients`);
});

export const uploadImage = merchantHandler(async (req, res, userId) => {
  if (!req.file) throw AppError.badRequest("Choose an image to upload.", "NO_FILE");
  res.success(await addClientImage(userId, req.file.buffer, req.file.mimetype), "Photo uploaded", 201);
});

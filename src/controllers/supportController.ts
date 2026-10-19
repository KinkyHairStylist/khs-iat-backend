import { parseSchema } from "../utils/parseSchema";
import { idParamSchema } from "../schemas/fields";
import { createTicketSchema, sendMessageSchema } from "../schemas/support.schema";
import * as tickets from "../services/support/ticketsService";
import * as messages from "../services/support/messagesService";
import { customerHandler } from "./customerHandler";

// The signed-in customer's support chat (the "KHS Support" widget).

export const staff = customerHandler(async (_req, res) => res.success(await messages.listStaffContacts()));

export const openTickets = customerHandler(async (_req, res, userId) => res.success(await tickets.listOpenTickets(userId)));

export const history = customerHandler(async (_req, res, userId) => res.success(await tickets.listTicketHistory(userId)));

export const createTicket = customerHandler(async (req, res, userId) => {
  const { assignedAdminId } = parseSchema(createTicketSchema, req.body ?? {});
  res.success(await tickets.createTicket(userId, assignedAdminId), "Conversation started.", 201);
});

export const ticketMessages = customerHandler(async (req, res, userId) => {
  res.success(await messages.listTicketMessages(userId, parseSchema(idParamSchema, req.params).id));
});

export const markRead = customerHandler(async (req, res, userId) => {
  await messages.markTicketRead(userId, parseSchema(idParamSchema, req.params).id);
  res.success(null, "Marked as read.");
});

export const closeTicket = customerHandler(async (req, res, userId) => {
  res.success(await tickets.closeOwnTicket(userId, parseSchema(idParamSchema, req.params).id), "Conversation closed.");
});

export const sendMessage = customerHandler(async (req, res, userId) => {
  res.success(await messages.sendCustomerMessage(userId, parseSchema(sendMessageSchema, req.body)), "Sent.", 201);
});

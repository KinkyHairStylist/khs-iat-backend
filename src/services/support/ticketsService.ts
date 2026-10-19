import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";
import { publishCustomerEvent } from "../../lib/chatBridge";
import { emitToCustomer } from "../../lib/socket/customerSocket";
import { notifySlack } from "../../lib/slack";
import { onlineStatuses } from "./presence";

// A customer's support tickets: one conversation each, numbered TCK-1001, ...
// Every function takes the customer's id and only ever touches their own.

/** Open conversations a customer may have at once (same as the Kinky-Hair-Stylist backend). */
export const MAX_OPEN_TICKETS = 2;

type TicketRow = Prisma.ticketsGetPayload<object>;

export interface TicketResponse {
  id: string;
  ticketNumber: string;
  status: "open" | "closed";
  customerId: string;
  assignedAdminId: string | null;
  closedById: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function presentTicket(t: TicketRow): TicketResponse {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    status: t.status,
    customerId: t.customerId,
    assignedAdminId: t.assignedAdminId,
    closedById: t.closedById,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** What a staff inbox shows for a ticket: the customer's name, avatar, status and last message. */
async function forStaff(t: TicketRow) {
  const [customer, statuses, last] = await Promise.all([
    prisma.user.findUnique({ where: { id: t.customerId }, select: { firstName: true, surname: true, avatarUrl: true, isMerchant: true } }),
    onlineStatuses([t.customerId]),
    prisma.chat_messages.findFirst({ where: { ticketId: t.id }, orderBy: { createdAt: "desc" }, select: { message: true, imageUrl: true, createdAt: true } }),
  ]);
  return {
    ...presentTicket(t),
    customer: {
      name: [customer?.firstName, customer?.surname].filter(Boolean).join(" ") || "Unknown",
      avatarUrl: customer?.avatarUrl ?? null,
      isOnline: statuses.get(t.customerId) ?? false,
      isMerchant: !!customer?.isMerchant,
    },
    lastMessage: last ? last.message || (last.imageUrl ? "[Image]" : "") : null,
    lastMessageAt: (last?.createdAt ?? t.createdAt).toISOString(),
  };
}

export async function listOpenTickets(customerId: string): Promise<TicketResponse[]> {
  const rows = await prisma.tickets.findMany({ where: { customerId, status: "open" }, orderBy: { createdAt: "desc" } });
  return rows.map(presentTicket);
}

export async function listTicketHistory(customerId: string): Promise<TicketResponse[]> {
  const rows = await prisma.tickets.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  return rows.map(presentTicket);
}

/** The customer's own ticket. Someone else's answers "not found", so a guessed id confirms nothing. */
export async function getOwnTicket(customerId: string, ticketId: string): Promise<TicketRow> {
  const ticket = await prisma.tickets.findFirst({ where: { id: ticketId, customerId } });
  if (!ticket) throw AppError.notFound("Conversation");
  return ticket;
}

async function nextTicketNumber(): Promise<string> {
  // The sequence already exists in the shared database; created here too, as before, if it ever doesn't.
  await prisma.$executeRaw`CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1001`;
  const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('ticket_number_seq') AS nextval`;
  return `TCK-${nextval.toString()}`;
}

/** "Start a new conversation" with a team member (assignedAdminId), within the open-ticket limit. */
export async function createTicket(customerId: string, assignedAdminId?: string): Promise<TicketResponse> {
  if (assignedAdminId) {
    const staff = await prisma.user.findFirst({ where: { id: assignedAdminId, isStaff: true }, select: { id: true } });
    if (!staff) throw AppError.badRequest("That team member isn't available. Please pick another.", "INVALID_STAFF");
  }
  const open = await prisma.tickets.count({ where: { customerId, status: "open" } });
  if (open >= MAX_OPEN_TICKETS) {
    throw AppError.badRequest(
      `You already have ${MAX_OPEN_TICKETS} open conversations. Close one before starting another.`,
      "TOO_MANY_OPEN_TICKETS"
    );
  }

  const ticket = await prisma.tickets.create({
    data: { ticketNumber: await nextTicketNumber(), customerId, assignedAdminId: assignedAdminId ?? null, status: "open" },
  });

  const summary = await forStaff(ticket);
  await publishCustomerEvent({ type: "ticket_created", payload: summary });
  notifySlack({
    node: "Support",
    trigger: summary.customer.name,
    body: `New support ticket opened: *${ticket.ticketNumber}*
      • Customer: ${summary.customer.name}
      • Assigned to: ${assignedAdminId ? "a team member" : "_unassigned_"}`,
  });
  return presentTicket(ticket);
}

/** The customer closes their own conversation. Already closed is fine. */
export async function closeOwnTicket(customerId: string, ticketId: string): Promise<TicketResponse> {
  const existing = await getOwnTicket(customerId, ticketId);
  if (existing.status === "closed") return presentTicket(existing);

  const ticket = await prisma.tickets.update({
    where: { id: existing.id },
    data: { status: "closed", closedAt: new Date(), closedById: customerId, updatedAt: new Date() },
  });
  const summary = await forStaff(ticket);
  await publishCustomerEvent({ type: "ticket_closed", payload: summary });
  // The customer's other open tabs close it too.
  emitToCustomer(customerId, "ticket_closed", presentTicket(ticket));
  notifySlack({ node: "Support", trigger: summary.customer.name, body: `Ticket closed: *${ticket.ticketNumber}* by the customer` });
  return presentTicket(ticket);
}

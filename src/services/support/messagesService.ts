import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { publishCustomerEvent, type ChatMessagePayload } from "../../lib/chatBridge";
import { storeChatImage } from "./chatImage";
import { onlineStatuses } from "./presence";
import { createTicket, getOwnTicket, listOpenTickets } from "./ticketsService";

// Messages in a customer's support conversations, and the team they can talk to.

const fullName = (u: { firstName: string | null; surname: string | null } | null | undefined, fallback: string) =>
  [u?.firstName, u?.surname].filter(Boolean).join(" ") || fallback;

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 2);

/** Staff a customer can start a conversation with. No email or phone — customers never see those. */
export async function listStaffContacts() {
  const staff = await prisma.user.findMany({
    where: { isStaff: true, isSuspended: false },
    select: { id: true, firstName: true, surname: true, avatarUrl: true, updatedAt: true },
    orderBy: { firstName: "asc" },
  });
  const online = await onlineStatuses(staff.map((s) => s.id));
  return staff.map((s) => {
    const name = fullName(s, "KHS Support");
    return { id: s.id, name, initials: initialsOf(name), avatarUrl: s.avatarUrl, isOnline: online.get(s.id) ?? false, lastSeen: s.updatedAt.toISOString() };
  });
}

export interface ChatMessageView {
  id: string;
  messages: string | null;
  imageUrl: string | null;
  read: boolean;
  createdAt: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  receiver: { id: string };
}

/** One conversation's messages, oldest first. */
export async function listTicketMessages(customerId: string, ticketId: string): Promise<ChatMessageView[]> {
  await getOwnTicket(customerId, ticketId);
  const messages = await prisma.chat_messages.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } });
  const senderIds = [...new Set(messages.map((m) => m.senderId).filter((id): id is string => !!id))];
  const senders = new Map(
    (await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, firstName: true, surname: true, avatarUrl: true } })).map((u) => [u.id, u])
  );
  return messages.map((m) => {
    const sender = m.senderId ? senders.get(m.senderId) : undefined;
    return {
      id: m.id,
      messages: m.message,
      imageUrl: m.imageUrl,
      read: m.read,
      createdAt: m.createdAt.toISOString(),
      sender: { id: m.senderId ?? "", name: fullName(sender, "Deleted user"), avatarUrl: sender?.avatarUrl ?? null },
      receiver: { id: m.receiverId ?? "" },
    };
  });
}

/** Marks the team's messages in this conversation as read by the customer. */
export async function markTicketRead(customerId: string, ticketId: string): Promise<void> {
  await getOwnTicket(customerId, ticketId);
  await prisma.chat_messages.updateMany({ where: { ticketId, receiverId: customerId, read: false }, data: { read: true, updatedAt: new Date() } });
}

/** Which conversation a message goes into: the one named, or their only open one (opened if none). */
async function resolveTicket(customerId: string, ticketId?: string) {
  if (ticketId) return getOwnTicket(customerId, ticketId);
  const open = await listOpenTickets(customerId);
  if (open.length > 1) throw AppError.badRequest("Please choose which conversation this message is for.", "TICKET_REQUIRED");
  return getOwnTicket(customerId, open[0]?.id ?? (await createTicket(customerId)).id);
}

/**
 * A customer's message. Saved first, then pushed to every staff inbox live
 * through the chat bridge (staff see it on reload if the bridge is down).
 */
export async function sendCustomerMessage(
  customerId: string,
  input: { ticketId?: string; receiverId?: string; message?: string; imageBase64?: string }
): Promise<ChatMessagePayload> {
  const text = input.message?.trim() || null;
  if (!text && !input.imageBase64) throw AppError.badRequest("Write a message or attach an image.", "EMPTY_MESSAGE");

  const ticket = await resolveTicket(customerId, input.ticketId);
  if (ticket.status === "closed") throw AppError.conflict("This conversation is closed. Start a new one instead.", "TICKET_CLOSED");

  // Addressed to the team member they picked; any staff member can answer from the shared inbox.
  const receiverId = input.receiverId ?? ticket.assignedAdminId;
  const receiver = receiverId ? await prisma.user.findFirst({ where: { id: receiverId, isStaff: true }, select: { id: true } }) : null;
  if (!receiver) throw AppError.badRequest("Please pick a team member to talk to.", "INVALID_STAFF");

  const imageUrl = input.imageBase64 ? await storeChatImage(input.imageBase64) : null;
  const customer = await prisma.user.findUniqueOrThrow({
    where: { id: customerId },
    select: { id: true, firstName: true, surname: true, email: true, avatarUrl: true },
  });

  const now = new Date();
  const [saved] = await prisma.$transaction([
    prisma.chat_messages.create({ data: { message: text, imageUrl, senderId: customerId, receiverId: receiver.id, ticketId: ticket.id } }),
    prisma.tickets.update({ where: { id: ticket.id }, data: { updatedAt: now } }),
  ]);

  const payload: ChatMessagePayload = {
    id: saved.id,
    ticket: { id: ticket.id },
    message: saved.message,
    imageUrl: saved.imageUrl,
    read: saved.read,
    createdAt: saved.createdAt.toISOString(),
    sender: customer,
    receiver: { id: receiver.id },
  };
  await publishCustomerEvent({ type: "receive_message", payload });
  return payload;
}

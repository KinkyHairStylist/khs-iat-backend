import Redis from "ioredis";
import { CHAT_BRIDGE_REDIS_URL, REDIS_URL } from "../../config/env";
import { getServiceLogger } from "../../utils/loggerCreator";

// Support chat runs across servers: customers' sockets are here, staff
// sockets are on khs-iat-staff-be. Each side publishes its own events on a
// Redis channel the other subscribes to — no HTTP calls between them.
//
//   khs:chat:khs-events    here → staff backend   a customer wrote, a ticket was
//                                                 opened/closed, someone came online
//   khs:chat:staff-events  staff backend → here   a staff reply, a ticket closed
//                                                 by staff, staff online status
//
// Same contract (channels, envelope, payloads) as khs-iat-staff-be/src/lib/chatBridge
// and the Kinky-Hair-Stylist backend's chat-bridge.service.ts, which still
// serves merchants — change them together. Every staff event names its
// customerId, so each server delivers only to customers connected to it.

const logger = getServiceLogger("chat-bridge");

export const KHS_EVENTS_CHANNEL = "khs:chat:khs-events";
export const STAFF_EVENTS_CHANNEL = "khs:chat:staff-events";

/** The message shape both servers send to sockets. */
export interface ChatMessagePayload {
  id: string;
  ticket: { id: string };
  message: string | null;
  imageUrl: string | null;
  read: boolean;
  createdAt: string;
  sender: { id: string; firstName: string | null; surname: string | null; email: string; avatarUrl: string | null };
  receiver: { id: string };
}

/** Published from here, for staff. */
export type CustomerChatEvent =
  | { type: "receive_message"; payload: ChatMessagePayload }
  | { type: "ticket_created"; payload: unknown }
  | { type: "ticket_closed"; payload: unknown }
  | { type: "user_status"; payload: { userId: string; isOnline: boolean } };

/** Published by the staff backend. */
export type StaffChatEvent =
  | { type: "receive_message"; customerId: string; payload: ChatMessagePayload }
  | { type: "ticket_closed"; customerId: string; payload: unknown }
  | { type: "user_status"; payload: { userId: string; isOnline: boolean } };

interface Envelope<T> {
  v: 1;
  at: string;
  event: T;
}

const url = CHAT_BRIDGE_REDIS_URL || REDIS_URL;
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function connection(role: string): Redis {
  const client = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true });
  client.on("error", (err) => logger.error(`Chat bridge ${role} connection error`, { error: err.message }));
  return client;
}

/**
 * Tells staff something happened. Never throws: the message or ticket is
 * already saved, so a bridge hiccup only delays the live update — staff
 * still see it when their inbox reloads.
 */
export async function publishCustomerEvent(event: CustomerChatEvent): Promise<void> {
  try {
    publisher ??= connection("publisher");
    const envelope: Envelope<CustomerChatEvent> = { v: 1, at: new Date().toISOString(), event };
    await publisher.publish(KHS_EVENTS_CHANNEL, JSON.stringify(envelope));
  } catch (err) {
    logger.error("Could not publish a customer chat event", { type: event.type, error: (err as Error).message });
  }
}

/** Subscribes to staff events. Call once, when the socket server starts. */
export function startChatBridge(onStaffEvent: (event: StaffChatEvent) => void): void {
  if (subscriber) return;
  subscriber = connection("subscriber");
  subscriber
    .subscribe(STAFF_EVENTS_CHANNEL)
    .then(() => logger.info("Chat bridge listening", { channel: STAFF_EVENTS_CHANNEL }))
    .catch((err: Error) => logger.error("Chat bridge subscribe failed", { error: err.message }));

  subscriber.on("message", (_channel, raw) => {
    let envelope: Envelope<StaffChatEvent>;
    try {
      envelope = JSON.parse(raw);
    } catch {
      logger.warn("Ignored an unreadable chat bridge message");
      return;
    }
    if (envelope?.v !== 1 || !envelope.event?.type) {
      logger.warn("Ignored a chat bridge message in an unknown format");
      return;
    }
    try {
      onStaffEvent(envelope.event);
    } catch (err) {
      logger.error("Chat bridge handler failed", { type: envelope.event.type, error: (err as Error).message });
    }
  });
}

export async function stopChatBridge(): Promise<void> {
  await Promise.allSettled([subscriber?.quit(), publisher?.quit()]);
  subscriber = null;
  publisher = null;
}

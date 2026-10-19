import prisma from "../../lib/prisma/prisma";
import redis from "../../lib/redis/redis";
import { publishCustomerEvent } from "../../lib/chatBridge";

// Who's online, for the chat. The user_status table is shared with the staff
// backend (staff see whether a customer is online in their inbox; customers
// see which staff are online in the widget).

const SOCKETS_KEY = (userId: string) => `chat:customer-online:${userId}`;

/** Same user_status table every server's chat reads. */
export async function setUserOnline(userId: string, isOnline: boolean): Promise<void> {
  await prisma.user_status.upsert({ where: { userId }, create: { userId, isOnline }, update: { isOnline } });
}

/**
 * Counts a customer's open sockets across every process, so closing one of
 * two tabs doesn't mark them offline. Staff hear when the first opens and
 * the last closes.
 */
export async function socketOpened(userId: string, socketId: string): Promise<void> {
  const key = SOCKETS_KEY(userId);
  const result = await redis.multi().sadd(key, socketId).expire(key, 24 * 3600).scard(key).exec();
  if (Number(result?.[2]?.[1] ?? 0) === 1) await announce(userId, true);
}

export async function socketClosed(userId: string, socketId: string): Promise<void> {
  const key = SOCKETS_KEY(userId);
  const result = await redis.multi().srem(key, socketId).scard(key).exec();
  if (Number(result?.[1]?.[1] ?? 0) === 0) await announce(userId, false);
}

async function announce(userId: string, isOnline: boolean): Promise<void> {
  await setUserOnline(userId, isOnline);
  await publishCustomerEvent({ type: "user_status", payload: { userId, isOnline } });
}

/** Online status for a set of users (missing = offline). */
export async function onlineStatuses(userIds: string[]): Promise<Map<string, boolean>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.user_status.findMany({ where: { userId: { in: userIds } }, select: { userId: true, isOnline: true } });
  return new Map(rows.map((r) => [r.userId, r.isOnline]));
}

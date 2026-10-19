import type { Server as HttpServer } from "node:http";
import { parseCookie } from "cookie";
import { Server, type Socket } from "socket.io";
import prisma from "../prisma/prisma";
import { CORS_ORIGINS } from "../../config/env";
import { verifyAccessToken } from "../../utils/jwt";
import { ACCESS_COOKIE } from "../../utils/authCookies";
import { isSessionActive } from "../redis/sessionStore";
import { getServiceLogger } from "../../utils/loggerCreator";
import { startChatBridge, stopChatBridge, type StaffChatEvent } from "../chatBridge";
import { socketClosed, socketOpened } from "../../services/support/presence";
import { customerAccessError } from "../../services/auth/accountAccess";

// Live updates for signed-in customers (the support chat). Authenticated by
// the same httpOnly session cookie as the REST API — a token is never sent by
// page JavaScript. Each customer's sockets join `customer:<id>`, so a staff
// reply reaches only the customer it's for.

const logger = getServiceLogger("customer-socket");
/** How often an open socket re-checks that its session is still valid. */
const SESSION_RECHECK_MS = 60_000;

interface SocketUser {
  userId: string;
  sid: string;
}

let io: Server | null = null;

const roomOf = (customerId: string) => `customer:${customerId}`;

/** Why a connection was refused; the client reads `err.data.code`. */
function refuse(code: string, message: string): Error & { data: { code: string } } {
  return Object.assign(new Error(message), { data: { code } });
}

async function stillAllowed(user: SocketUser): Promise<boolean> {
  if (!(await isSessionActive(user.sid, user.userId))) return false;
  const account = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { isSuspended: true, isCustomer: true, isStaff: true, isMerchant: true, isBusinessStaff: true },
  });
  return !!account && !account.isSuspended && !customerAccessError(account);
}

/** Sends to the customer's open tabs connected to this process (staff events reach every process through the bridge). */
export function emitToCustomer(customerId: string, event: string, payload: unknown): void {
  io?.to(roomOf(customerId)).emit(event, payload);
}

function deliverStaffEvent(event: StaffChatEvent): void {
  if (event.type === "user_status") {
    // Customers see which team members are online in the chat widget.
    io?.emit("user_status", event.payload);
    return;
  }
  emitToCustomer(event.customerId, event.type, event.payload);
}

export function initCustomerSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: "/socket.io",
    transports: ["websocket"],
    cors: { origin: CORS_ORIGINS, credentials: true },
    allowRequest: (req, callback) => callback(null, !!req.headers.origin && CORS_ORIGINS.includes(req.headers.origin)),
    maxHttpBufferSize: 16 * 1024, // customers only receive over the socket; messages are sent over REST
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const token = parseCookie(socket.handshake.headers.cookie ?? "")[ACCESS_COOKIE];
      if (!token) return next(refuse("TOKEN_MISSING", "Please log in to continue."));
      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch (err) {
        const expired = (err as Error).name === "TokenExpiredError";
        return next(refuse(expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN", expired ? "Your session has expired." : "Your session is invalid."));
      }
      const user: SocketUser = { userId: payload.sub, sid: payload.sid };
      if (!(await stillAllowed(user))) return next(refuse("SESSION_REVOKED", "Your session has ended. Please log in again."));
      socket.data.user = user;
      next();
    } catch (err) {
      logger.error("Socket authentication failed", { error: (err as Error).message });
      next(refuse("INTERNAL_ERROR", "We couldn't connect to live updates. Please refresh the page."));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser;
    socket.join(roomOf(user.userId));
    socketOpened(user.userId, socket.id).catch((err: Error) => logger.error("Could not mark customer online", { error: err.message }));

    const recheck = setInterval(async () => {
      try {
        if (!(await stillAllowed(user))) {
          socket.emit("session_ended");
          socket.disconnect(true);
        }
      } catch (err) {
        logger.warn("Session re-check failed", { userId: user.userId, error: (err as Error).message });
      }
    }, SESSION_RECHECK_MS);

    socket.on("disconnect", () => {
      clearInterval(recheck);
      socketClosed(user.userId, socket.id).catch((err: Error) => logger.error("Could not mark customer offline", { error: err.message }));
    });
  });

  startChatBridge(deliverStaffEvent);
  logger.info("Customer live updates ready");
  return io;
}

/** Drops every socket (clients reconnect) and leaves the bridge. The HTTP server is closed by the caller. */
export async function closeCustomerSocket(): Promise<void> {
  io?.disconnectSockets(true);
  io = null;
  await stopChatBridge();
}

import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { readAccessCookie, type SessionRole } from "../utils/authCookies";
import { isSessionActive } from "../lib/redis/sessionStore";
import prisma from "../lib/prisma/prisma";
import { SITE_ACCESS } from "../services/auth";
import { AppError, catchAsync } from "./centralAppError";

// ─── Augment Express types ────────────────────────────────────────────────────
// Populated by `authenticate`.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required TS idiom for augmenting Express types
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
        /** Session id — POST /auth/logout revokes it. */
        sid: string;
        role: SessionRole;
      };
    }
  }
}

/**
 * Authenticates from the httpOnly access-token cookie only — tokens are never
 * accepted from headers, so nothing readable by page JavaScript can grant
 * access. Token errors (expired, malformed, wrong signature) are translated by
 * the central error handler via err.name; TOKEN_EXPIRED tells the client to
 * call POST /auth/refresh.
 *
 * Then checks that the session is still active (logout and password reset
 * revoke it instantly) and re-reads the account, so a suspension takes effect
 * on the very next request.
 */
function createAuthenticate(role: SessionRole) {
  return catchAsync(
    async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      const token = readAccessCookie(req, role);
      if (!token) {
        // The access cookie lasts exactly as long as its token, so once it runs
        // out the browser drops it. TOKEN_MISSING tells the app to try the
        // refresh cookie before asking the customer to log in.
        next(
          AppError.unauthorized("Please log in to continue.", "TOKEN_MISSING"),
        );
        return;
      }

      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch (err) {
        next(err);
        return;
      }

      // A customer token is never accepted on merchant routes, or the other way round.
      if (payload.role !== role) {
        next(
          AppError.unauthorized("Please log in to continue.", "TOKEN_MISSING"),
        );
        return;
      }

      if (!(await isSessionActive(payload.sid, payload.sub))) {
        next(
          AppError.unauthorized(
            "Your session has ended. Please log in again.",
            "SESSION_REVOKED",
          ),
        );
        return;
      }

      const account = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          email: true,
          isSuspended: true,
          isCustomer: true,
          isStaff: true,
          isMerchant: true,
          isBusinessStaff: true,
        },
      });
      if (!account) {
        next(
          AppError.unauthorized(
            "Your session has ended. Please log in again.",
            "SESSION_REVOKED",
          ),
        );
        return;
      }
      if (account.isSuspended) {
        next(
          AppError.forbidden(
            "Your account has been suspended. Please contact support for assistance.",
            "ACCOUNT_SUSPENDED",
          ),
        );
        return;
      }
      const accessError = SITE_ACCESS[role](account);
      if (accessError) {
        next(accessError);
        return;
      }

      req.user = {
        sub: payload.sub,
        email: account.email,
        sid: payload.sid,
        role,
      };
      next();
    },
  );
}

/** Customer routes. */
export const authenticate = createAuthenticate("customer");
/** Merchant routes: a merchant session, from a salon owner's account. */
export const authenticateMerchant = createAuthenticate("merchant");

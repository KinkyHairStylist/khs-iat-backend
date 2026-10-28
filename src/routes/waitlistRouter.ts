import { Router } from "express";
import { handleWaitlistSignup } from "../controllers/waitlistController";
import { waitlistRateLimiter } from "../middlewares/waitlistRateLimit";

const waitlistRouter = Router();

waitlistRouter.post("/", waitlistRateLimiter, handleWaitlistSignup);

export default waitlistRouter;

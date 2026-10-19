import { Router } from "express";
import * as account from "../../controllers/customer/accountController";

// Public — the platform alerts customers see (the banner and the bell).
const router = Router();

router.get("/active", account.activeAlerts);

export default router;

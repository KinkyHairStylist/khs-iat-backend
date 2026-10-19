import { Router } from "express";
import * as help from "../controllers/helpController";

// The help centre's articles. Public: help is useful before signing in too.
const router = Router();

router.get("/articles", help.articles);

export default router;

import { z } from "zod";
import { email } from "../fields";

export const subscribeNewsletterSchema = z.object({ email: email() }).strict();

export type SubscribeNewsletterInput = z.infer<typeof subscribeNewsletterSchema>;

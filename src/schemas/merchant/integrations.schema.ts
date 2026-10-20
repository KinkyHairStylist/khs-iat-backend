import { z } from "zod";

// An OAuth code and the signed state that came back with it.
export const oauthCallbackSchema = z.object({
  code: z.string().trim().min(1).max(2048),
  state: z.string().trim().min(1).max(4096),
});

export const zohoCallbackSchema = oauthCallbackSchema.extend({
  // Zoho's "accounts-server" (the salon's region); unknown hosts fall back to the default region.
  accountsServer: z.string().trim().max(200).optional(),
});

export const mailchimpConnectSchema = z.object({
  apiKey: z.string().trim().min(1, "Enter your Mailchimp API key.").max(100),
  audienceId: z.string().trim().min(1).max(64).optional(),
});

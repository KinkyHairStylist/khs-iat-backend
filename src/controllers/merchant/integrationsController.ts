import { mailchimpConnectSchema, oauthCallbackSchema, zohoCallbackSchema } from "../../schemas/merchant/integrations.schema";
import * as connections from "../../services/merchant/integrations/connections";
import { parseSchema } from "../../utils/parseSchema";
import { merchantHandler } from "./merchantHandler";

export const status = merchantHandler(async (_req, res, userId) => {
  res.success(await connections.integrationStatus(userId));
});

export const startGoogle = merchantHandler(async (_req, res, userId) => {
  res.success(await connections.startGoogle(userId));
});

export const finishGoogle = merchantHandler(async (req, res, userId) => {
  await connections.finishGoogle(userId, parseSchema(oauthCallbackSchema, req.body));
  res.success(null, "Google Calendar connected");
});

export const disconnectGoogle = merchantHandler(async (_req, res, userId) => {
  await connections.disconnectGoogle(userId);
  res.success(null, "Google Calendar disconnected");
});

export const startZoho = merchantHandler(async (_req, res, userId) => {
  res.success(await connections.startZoho(userId));
});

export const finishZoho = merchantHandler(async (req, res, userId) => {
  await connections.finishZoho(userId, parseSchema(zohoCallbackSchema, req.body));
  res.success(null, "ZohoBooks connected");
});

export const disconnectZoho = merchantHandler(async (_req, res, userId) => {
  await connections.disconnectZoho(userId);
  res.success(null, "ZohoBooks disconnected");
});

export const connectMailchimp = merchantHandler(async (req, res, userId) => {
  const result = await connections.connectMailchimp(userId, parseSchema(mailchimpConnectSchema, req.body));
  res.success(result, result.connected ? `Mailchimp connected. Clients will be added to "${result.audienceName}".` : "Choose the audience to add your clients to");
});

export const disconnectMailchimp = merchantHandler(async (_req, res, userId) => {
  await connections.disconnectMailchimp(userId);
  res.success(null, "Mailchimp disconnected");
});

import { WebClient } from "@slack/web-api";
import { getServiceLogger } from "../utils/createLogger";
import { SLACK_USERS_TOKEN } from "./env.validation";

const logger = getServiceLogger("slack");

// This codebase has two independent Slack client setups: this one (used by
// the static SlackService in services/slack.service.ts, for structured
// StandardSlackNotification alerts) and src/slack/slack.service.ts (an
// injectable service, used by most booking/payment notify() calls). Both
// already post to the same channel (SlackChannel.TEST_NOTIFICATIONS here is
// the same ID as the injectable service's hardcoded NOTIFICATIONS_CHANNEL_ID,
// 'C0B9KDACX5G'), but this one used to prefer a separate SLACK_TOKEN_KEY env
// var over SLACK_USERS_TOKEN. Nothing else in the codebase ever sets or reads
// SLACK_TOKEN_KEY — if a deployed environment's .env had it set to a stale or
// wrong token, this client would silently authenticate differently (or fail)
// compared to the other one, for no visible reason. Standardized on the same
// single token both implementations actually rely on.
const SLACK_TOKEN = SLACK_USERS_TOKEN;

export type TeamMention = "DEVOPS" | "CSM";

export const SLACK_BOT_USERNAME = "Your-App-Alerter"; // one place to change it

let slackClient: WebClient | null = null;

export const getSlackClient = (): WebClient => {
  if (slackClient) return slackClient;

  if (!SLACK_TOKEN) {
    throw new Error("Slack token is missing from environment variables");
  }

  slackClient = new WebClient(SLACK_TOKEN);
  logger.info("✅ Slack client initialized");
  return slackClient;
};

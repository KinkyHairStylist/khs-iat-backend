import { WebClient } from "@slack/web-api";
import { getServiceLogger } from "../utils/createLogger";
import { SLACK_TOKEN_KEY, SLACK_USERS_TOKEN } from "./env.validation";

const logger = getServiceLogger("slack");

const SLACK_TOKEN = SLACK_TOKEN_KEY || SLACK_USERS_TOKEN;

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

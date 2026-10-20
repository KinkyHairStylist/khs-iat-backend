import { WebClient } from "@slack/web-api";
import { APP_ENV, CUSTOMER_APP_URL, SLACK_CHANNEL_ID, SLACK_USERS_TOKEN } from "../../config/env";
import { getServiceLogger } from "../../utils/loggerCreator";

const logger = getServiceLogger("slack");

// Same vocabulary as the KHS backend's alerts, so both services read alike in the channel.
export type SlackNode = "Human Resource" | "User Management" | "Application" | "Payment" | "Finance" | "Support";
export type SlackSeverity = "INFO" | "ERROR" | "CRITICAL";
// Same names as the KHS backend's SlackEventType, so alerts from both read alike.
export type SlackEventType =
  | "USER_REGISTRATION" | "SYSTEM_NOTIFICATION" | "ERROR_ALERT"
  | "PAYMENT_SUCCESS" | "PAYMENT_FAILURE" | "SUBSCRIPTION_UPDATE" | "SUBSCRIPTION_CANCEL" | "CRON_EXECUTION";

export interface SlackAlert {
  node: SlackNode;
  severity?: SlackSeverity;
  type?: SlackEventType;
  /** Who or what caused it — shown as TRIGGER. */
  trigger: string;
  /** One fact per line, e.g. "• User: Jane (jane@x.com)". */
  body: string;
}

const slack = SLACK_USERS_TOKEN && SLACK_CHANNEL_ID ? new WebClient(SLACK_USERS_TOKEN) : null;

function timestamp(timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date());
}

/** Mirrors formatStandardNotification in the KHS backend (slack-helpers.ts). */
function format(alert: SlackAlert): string {
  const prefix = APP_ENV ? `[${APP_ENV.toUpperCase()}] ` : "";
  const header = `[${alert.node.toUpperCase()}] [SYSTEM] [${alert.severity ?? "INFO"}] [${alert.type ?? "SYSTEM_NOTIFICATION"}]`;
  const loc = CUSTOMER_APP_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const body = alert.body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return `${prefix}${header}
*PLATFORM:* \`KHS CUSTOMER\`
*LOC:* \`${loc.includes("localhost") ? "localhost" : loc}\`
*TRIGGER:* \`${alert.trigger}\`
*DETAILS:*
${body}
*TIMESTAMP:* \`${timestamp("Africa/Lagos")} (WAT) | ${timestamp("Australia/Sydney")} (AEST)\``;
}

/**
 * Fire-and-forget: never awaited by callers and never throws, so a Slack
 * outage can't fail a customer's request. Skipped entirely when Slack isn't configured.
 */
export function notifySlack(alert: SlackAlert): void {
  if (!slack) return;

  slack.chat
    .postMessage({ channel: SLACK_CHANNEL_ID, text: format(alert), username: "KHS Customer Alerter", unfurl_links: false })
    .then(() => logger.info("Slack notified", { trigger: alert.trigger }))
    .catch((err: Error) => logger.error("Slack notification failed", { trigger: alert.trigger, error: err.message }));
}

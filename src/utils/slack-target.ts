// Where KHS Slack alerts go. Every environment posts to one channel chosen in
// its own env (SLACK_CHANNEL_ID), so nothing is tied to a workspace's
// channel IDs in code. Unset means "don't post" — never a fallback channel.
export const getSlackChannelId = (
  configured: string | undefined = process.env.SLACK_CHANNEL_ID,
): string | undefined => configured?.trim() || undefined;

// "[UAT] " style prefix (from APP_ENV) so several environments can share one
// channel and still be told apart at a glance.
export const slackEnvPrefix = (
  appEnv: string | undefined = process.env.APP_ENV,
): string => {
  const label = appEnv?.trim();
  return label ? `[${label.toUpperCase()}] ` : "";
};

// The URL shown as LOC in an alert: an explicit host wins, then this
// deployment's own FRONTEND_URL (each environment sets its own), then the
// legacy NEXTAUTH_URL, and "localhost" for local development.
export const slackLocationHost = (
  explicit?: string,
  frontendUrl: string | undefined = process.env.FRONTEND_URL,
  legacyUrl: string | undefined = process.env.NEXTAUTH_URL,
): string => explicit?.trim() || frontendUrl?.trim() || legacyUrl?.trim() || "localhost";

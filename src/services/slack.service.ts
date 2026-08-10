import { StandardSlackNotification } from "../types/slack.types";
import { getServiceLogger } from "../utils/createLogger";
import { sendStandardSlackNotification } from "../utils/slack-helpers";

const logger = getServiceLogger("slack-service");

export class SlackService {
  static async notify(data: StandardSlackNotification) {
    try {
      await sendStandardSlackNotification({
        ...data,
      });
      logger.info(`Slack notified successfully → ${data.trigger}`);
    } catch (err) {
      // Since this is backgrounded, we MUST catch errors here
      // to prevent unhandled promise rejections.
      logger.error(`Background Slack notification failed:`, err);
    }
  }
}

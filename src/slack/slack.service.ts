import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { getSlackChannelId, slackEnvPrefix } from '../utils/slack-target';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private client: WebClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): WebClient | null {
    if (this.client) return this.client;

    const token = this.configService.get<string>('SLACK_USERS_TOKEN');
    if (!token) {
      this.logger.warn('SLACK_USERS_TOKEN is not set — Slack notifications are disabled.');
      return null;
    }

    this.client = new WebClient(token);
    return this.client;
  }

  // Fire-and-forget by design — a Slack outage must never affect the
  // request that triggered it (mirrors EmailService's sendWithRetry, which
  // is also never awaited by its callers).
  notify(message: string, channel?: string): void {
    const target =
      channel || getSlackChannelId(this.configService.get<string>('SLACK_CHANNEL_ID'));
    if (!target) {
      this.logger.warn('SLACK_CHANNEL_ID is not set — notification skipped.');
      return;
    }

    const client = this.getClient();
    if (!client) return;

    client.chat
      .postMessage({
        channel: target,
        text: `${slackEnvPrefix(this.configService.get<string>('APP_ENV'))}${message}`,
        username: 'KHS Support Alerts',
        unfurl_links: false,
      })
      .then(() => this.logger.log(`Slack notification sent to ${target}`))
      .catch((err) => this.logger.error(`Slack notification failed: ${err.message}`));
  }
}

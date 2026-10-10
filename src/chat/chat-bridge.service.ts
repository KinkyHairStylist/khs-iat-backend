import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

// Live chat now runs across two servers: customers' and merchants' sockets
// are here, staff sockets are on khs-iat-staff-be. Each side publishes its
// own events on a Redis channel the other subscribes to.
//
//   khs:chat:khs-events    here → staff backend   a customer wrote, a ticket was
//                                                 opened/closed, someone came online
//   khs:chat:staff-events  staff backend → here   a staff reply, a ticket closed
//                                                 by staff, staff online status
//
// The other half of this contract is khs-iat-staff-be/src/lib/chatBridge —
// change both together. Both servers must point CHAT_BRIDGE_REDIS_URL at the
// same Redis. Unset, the bridge is off: chat still works, staff just don't
// get customer messages live (and vice versa) until they reload.

export const KHS_EVENTS_CHANNEL = 'khs:chat:khs-events';
export const STAFF_EVENTS_CHANNEL = 'khs:chat:staff-events';

export type KhsChatEvent =
  | { type: 'receive_message'; payload: unknown }
  | { type: 'ticket_created'; payload: unknown }
  | { type: 'ticket_closed'; payload: unknown }
  | { type: 'user_status'; payload: { userId: string; isOnline: boolean } };

export type StaffChatEvent =
  | { type: 'receive_message'; customerId: string; payload: unknown }
  | { type: 'ticket_closed'; customerId: string; payload: unknown }
  | { type: 'user_status'; payload: { userId: string; isOnline: boolean } };

interface Envelope<T> {
  v: 1;
  at: string;
  event: T;
}

@Injectable()
export class ChatBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatBridgeService.name);
  private readonly url = process.env.CHAT_BRIDGE_REDIS_URL;
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private handlers: Array<(event: StaffChatEvent) => void> = [];

  onModuleInit() {
    if (!this.url) {
      this.logger.warn(
        'CHAT_BRIDGE_REDIS_URL is not set — staff and customer chat events will not reach each other live.',
      );
      return;
    }
    this.publisher = this.connection('publisher');
    this.subscriber = this.connection('subscriber');
    this.subscriber
      .subscribe(STAFF_EVENTS_CHANNEL)
      .then(() => this.logger.log(`Chat bridge listening on ${STAFF_EVENTS_CHANNEL}`))
      .catch((err: Error) => this.logger.error(`Chat bridge subscribe failed: ${err.message}`));

    this.subscriber.on('message', (_channel, raw) => {
      let envelope: Envelope<StaffChatEvent>;
      try {
        envelope = JSON.parse(raw);
      } catch {
        this.logger.warn('Ignored an unreadable chat bridge message');
        return;
      }
      if (envelope?.v !== 1 || !envelope.event?.type) {
        this.logger.warn('Ignored a chat bridge message in an unknown format');
        return;
      }
      for (const handler of this.handlers) {
        try {
          handler(envelope.event);
        } catch (err) {
          this.logger.error(`Chat bridge handler failed for ${envelope.event.type}: ${(err as Error).message}`);
        }
      }
    });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.subscriber?.quit(), this.publisher?.quit()]);
  }

  /** Staff events (replies, closes, staff online status) — the gateway delivers them to customers. */
  onStaffEvent(handler: (event: StaffChatEvent) => void) {
    this.handlers.push(handler);
  }

  /** Never throws: the action already happened; a bridge hiccup only delays the live update. */
  async publish(event: KhsChatEvent): Promise<void> {
    if (!this.publisher) return;
    try {
      const envelope: Envelope<KhsChatEvent> = { v: 1, at: new Date().toISOString(), event };
      await this.publisher.publish(KHS_EVENTS_CHANNEL, JSON.stringify(envelope));
    } catch (err) {
      this.logger.error(`Could not publish ${event.type} to staff: ${(err as Error).message}`);
    }
  }

  private connection(role: string): Redis {
    const client = new Redis(this.url!, { maxRetriesPerRequest: 3 });
    client.on('error', (err) => this.logger.error(`Chat bridge ${role} connection error: ${err.message}`));
    return client;
  }
}

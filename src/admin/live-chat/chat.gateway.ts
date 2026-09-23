import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { TicketResponseDto } from './send-message.dto';

@WebSocketGateway({ cors: true })
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<string, string>();

  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
  ) {}

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ) {
    this.onlineUsers.set(userId, client.id);
    await this.chatService.setUserOnline(userId, true);
    this.server.emit('user_status', { userId, isOnline: true });
  }

  @SubscribeMessage('leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ) {
    this.onlineUsers.delete(userId);
    await this.chatService.setUserOnline(userId, false);
    this.server.emit('user_status', { userId, isOnline: false });
  }

  // The Team Inbox is a shared view across every staff member, not just
  // whichever specific one a customer originally addressed their message
  // to — but this only ever pushed the live update to that one exact
  // receiver's socket. Any other admin looking at the same shared inbox
  // never got the socket event at all and had to refresh to see a new
  // message land. When a customer/merchant is the one sending (the
  // message is going TO staff), also push it to every other currently
  // online staff member so the whole team's inbox updates live, the same
  // way notifyTicketClosed/notifyTicketCreated already broadcast rather
  // than target a single socket. A staff reply going TO a customer still
  // only ever needs to reach that one customer.
  async sendMessageToReceiver(message, senderIsStaff = true) {
    const receiverSocketId = this.onlineUsers.get(message.receiver.id);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('receive_message', message);
    }

    if (!senderIsStaff) {
      const staffIds = await this.chatService.getAllStaffIds();
      for (const staffId of staffIds) {
        if (staffId === message.receiver.id) continue; // already sent above
        const socketId = this.onlineUsers.get(staffId);
        if (socketId) this.server.to(socketId).emit('receive_message', message);
      }
    }
  }

  // Broadcast so both the customer (whose input should now disable) and
  // any admin with this ticket open (whose tab should move to Closed) pick
  // it up live — mirrors how user_status is already broadcast to everyone.
  notifyTicketClosed(ticket: TicketResponseDto) {
    this.server.emit('ticket_closed', ticket);
  }

  // Broadcast so the Team Inbox can prepend a brand-new ticket live —
  // receive_message alone can't do this, since it only updates a ticket
  // already present in an admin's list (a new ticket has no existing row
  // to update), which was why new tickets required a hard refresh to see.
  notifyTicketCreated(ticket: TicketResponseDto) {
    this.server.emit('ticket_created', ticket);
  }
}

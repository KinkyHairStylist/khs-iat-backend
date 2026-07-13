import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AdminChatService } from './services/admin-chat.service';

@WebSocketGateway({ cors: true })
export class AdminChatGateway {
  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<string, string>();

  constructor(private readonly adminChatService: AdminChatService) {}

  @SubscribeMessage('join-admin-chat')
  async handleJoin(@ConnectedSocket() client: Socket, userId: string) {
    this.onlineUsers.set(userId, client.id);
    await this.adminChatService.setUserOnline(userId, true);
    this.server.emit('user_status', { userId, isOnline: true });
  }

  @SubscribeMessage('leave-admin-chat')
  async handleLeave(@ConnectedSocket() client: Socket, userId: string) {
    this.onlineUsers.delete(userId);
    await this.adminChatService.setUserOnline(userId, false);
    this.server.emit('user_status', { userId, isOnline: false });
  }

  async sendMessageToAdmin(message) {
    const receiverSocketId = this.onlineUsers.get(message.receiver.id);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('receive_admin_message', message);
    }
  }
}

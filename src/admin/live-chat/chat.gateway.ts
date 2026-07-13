import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({ cors: true })
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<string, string>();

  constructor(private readonly chatService: ChatService) {}

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, userId: string) {
    this.onlineUsers.set(userId, client.id);
    await this.chatService.setUserOnline(userId, true);
    this.server.emit('user_status', { userId, isOnline: true });
  }

  @SubscribeMessage('leave')
  async handleLeave(@ConnectedSocket() client: Socket, userId: string) {
    this.onlineUsers.delete(userId);
    await this.chatService.setUserOnline(userId, false);
    this.server.emit('user_status', { userId, isOnline: false });
  }

  async sendMessageToReceiver(message) {
    const receiverSocketId = this.onlineUsers.get(message.receiver.id);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('receive_message', message);
    }
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/services/user.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: true })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Disconnecting client ${client.id}: No token provided`);
        client.disconnect();
        return;
      }

      const decoded = this.jwtService.verify(token);
      const user = await this.userService.findById(decoded.sub);
      if (!user) {
        this.logger.warn(`Disconnecting client ${client.id}: User not found`);
        client.disconnect();
        return;
      }

      const roomName = `user:${user.id}`;
      await client.join(roomName);
      this.logger.log(`Client ${client.id} authenticated and joined room ${roomName}`);
    } catch (err) {
      this.logger.error(`Authentication failed for client ${client.id}: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendToUser(userId: string, event: string, data: any) {
    const roomName = `user:${userId}`;
    this.server.to(roomName).emit(event, data);
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.auth?.token || client.handshake.headers?.authorization;
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
      }
      return authHeader;
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string') {
      return queryToken;
    }
    return null;
  }
}
